"""公開中のサポートAIへ質問を投げ、応答に現れる「機械が書いた徴候」を検出する。

なぜ要るか。
応答の自然さは単体テストで固定できない(生成であり、毎回異なる)。
これまでは目視で確認していたが、直すたびに別の癖が生まれることを繰り返した。
癖そのものは機械的に判定できる。判定できるものを人が見るのは、見落としを招く。

何を見るか。
- 名乗りの差し込み、社名の連呼、内部の言い方、今いるサイトへの誘導
- 毎回の問い合わせ誘導、定型の受けとめ、絵文字とMarkdown
- 読点の密度
- 型どおりの締め

使い方:
    python tools/audit_replies.py
    python tools/audit_replies.py --endpoint https://api.shinai-inc.jp/api/chatbot

このツールは公開中のAPIを叩き、料金が発生する。CIには置かず、
規範や検索を変えたあとの公開前チェックとして手で実行する。
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

DEFAULT_ENDPOINT = "https://api.shinai-inc.jp/api/chatbot"
ORIGIN = "https://shinai-inc.jp"

# 場面を散らす。どれか一つに偏ると、その場面だけ整った状態を見誤る。
QUESTIONS = [
    ("挨拶", "こんにちは"),
    ("名乗り", "あなたはAIですか"),
    ("事実", "商号と所在地を教えてください"),
    ("事実", "代表はどなたですか"),
    ("事実", "CTOはどなたですか"),
    ("案内", "どんなサービスがありますか"),
    ("案内", "業種別の活用を教えてください"),
    ("案内", "無料相談はどう進みますか"),
    ("見積り", "費用はどのくらいですか"),
    ("見積り", "導入までどのくらいかかりますか"),
    ("困りごと", "人手が足りなくて回りません"),
    ("困りごと", "社内の属人化がひどくて困っています"),
    ("適合", "製造業ですが使えますか"),
    ("適合", "社内にAI人材がいなくても大丈夫ですか"),
    ("不明", "従業員は何人ですか"),
    ("不明", "土日に打ち合わせできますか"),
    ("懸念", "セキュリティが心配です"),
    ("懸念", "導入して失敗したらどうなりますか"),
]

# (名前, 判定, 理由, この徴候を見ない場面)
# 場面ごとの除外がないと、正しい振る舞いを誤りとして数える。
# 実際「あなたはAIですか」への名乗りを、差し込みとして拾ってしまった。
TICS = [
    ("名乗りの差し込み",
     re.compile(r"^.{1,12}?ShinAIサポートAIです。.{25,}", re.S),
     "挨拶や名前を問われた場面以外で名乗っている",
     {"挨拶", "名乗り"}),
    ("人を代名詞で受ける",
     re.compile(r"(^|[。、\s])(彼|彼女)(は|が|の|も)"),
     "日本語の企業紹介では氏名か役職で受ける",
     set()),
    ("社名で書き出す",
     re.compile(r"^(私たち)?(ShinAI|シンアイ株式会社|弊社|当社)(では|は)"),
     "各回答の頭に社名を置くと案内文の朗読になる", set()),
    ("内部の言い方",
     re.compile(r"(資料|ナレッジベース|知識ベース)に(は)?|記載が(ございません|ありません)"),
     "訪問者に通じない社内の語", set()),
    ("今いるサイトへの誘導",
     re.compile(r"(公式サイト|当社のサイト|ホームページ)を(ご覧|ご確認)"),
     "相手はすでにそのサイトを見ている", set()),
    ("型どおりの締め",
     re.compile(r"(何か)?(他に|ほかに)?[^。\n]{0,12}(お困りのこと|ご不明な点|ご質問)[^。\n]{0,16}"
                r"(ございません|ありません|あります)か[。．?？]?\s*$"),
     "問い返しを毎回添えると応対の型をなぞるだけになる", {"挨拶", "名乗り"}),
    ("定型の受けとめ",
     re.compile(r"(承りました|理解いたしました|お察しいたします|かしこまりました)"),
     "聞いた証拠にならず、かえって空虚に響く", set()),
    ("絵文字",
     re.compile(r"[\U0001F300-\U0001FAFF☀-➿]"),
     "サイトの調子に合わない", set()),
    ("Markdown",
     re.compile(r"\*\*|^\s*#{1,6}\s|\[[^\]]+\]\("),
     "表示は書式なしの文章であり記号がそのまま出る", set()),
]

# 誘導が正当なのは、見積りや個別の状況確認が要る場面だけ。
# 本文中で触れるのは自然なので、末尾の一文だけを見る。
# 質問自体がその語を含む場合(「無料相談はどう進みますか」)は答えて当然であり、数えない。
CONTACT_RE = re.compile(r"(お問い合わせ|問い合わせ|無料相談|ご相談)")
CONTACT_OK = {"見積り", "困りごと", "不明", "懸念", "挨拶"}

# 読点の密度。
#
# 並列の読点(「製造・建設、小売など」)は正しい日本語であり、これを数えると
# measurement のほうが誤る。問題になるのは節をつなぐ息継ぎの読点で、
# 活用語尾のあとに現れる。この形だけを数える。
CLAUSE_COMMA = re.compile(r"(し|して|て|り|く|ば|ず|ので|ため|から|ますが|ですが|けれど|のに)、")
COMMA_LIMIT = 2


def ask(endpoint: str, message: str) -> str:
    """curl 経由で問い合わせる。Python の UA は CDN に弾かれることがある。"""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     encoding="utf-8") as fh:
        json.dump({"message": message}, fh, ensure_ascii=False)
        path = fh.name
    try:
        out = subprocess.run(
            ["curl", "-s", "-X", "POST", endpoint,
             "-H", "Content-Type: application/json",
             "-H", f"Origin: {ORIGIN}",
             "--data-binary", "@" + path],
            capture_output=True, text=True, encoding="utf-8").stdout
        return json.loads(out).get("response", "")
    except Exception as exc:                      # 通信も解析も、失敗は同じ扱いでよい
        return f"[取得できず: {exc}]"
    finally:
        Path(path).unlink(missing_ok=True)


def clause_commas(text: str) -> int:
    """一文あたり、節をつなぐ読点の最大数。並列の読点は数えない。"""
    return max((len(CLAUSE_COMMA.findall(s)) for s in re.split(r"[。\n]", text)),
               default=0)


def trailing_sentence(text: str) -> str:
    """末尾の一文。誘導は、そこに置かれたときだけ型になる。"""
    parts = [s for s in re.split(r"(?<=[。．?？])", text.strip()) if s.strip()]
    return parts[-1] if parts else ""


def audit(endpoint: str) -> int:
    findings = []
    for scene, question in QUESTIONS:
        answer = ask(endpoint, question)
        hits = [(name, why) for name, pattern, why, skip in TICS
                if scene not in skip and pattern.search(answer)]

        asked_about_contact = bool(CONTACT_RE.search(question))
        if (scene not in CONTACT_OK and not asked_about_contact
                and CONTACT_RE.search(trailing_sentence(answer))):
            hits.append(("末尾の問い合わせ誘導",
                         "答えで完結する質問に誘導を添えている"))

        runs = clause_commas(answer)
        if runs > COMMA_LIMIT:
            hits.append((f"息継ぎの読点が多い(一文に{runs}つ)", "意味の切れ目にだけ打つ"))

        mark = "NG" if hits else "ok"
        print(f"[{mark}] ({scene}) {question}")
        print(f"     {answer[:150]}")
        for name, why in hits:
            print(f"     -> {name}: {why}")
            findings.append((question, name))
        print()

    if not findings:
        print(f"徴候なし。{len(QUESTIONS)}件すべて通過。")
        return 0

    print(f"{len(findings)}件の徴候を{len(QUESTIONS)}問中に検出。")
    tally = {}
    for _, name in findings:
        tally[name] = tally.get(name, 0) + 1
    for name, count in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"  {count:>2}件  {name}")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    return audit(parser.parse_args().endpoint)


if __name__ == "__main__":
    sys.exit(main())
