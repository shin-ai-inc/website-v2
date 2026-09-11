# -*- coding: utf-8 -*-
"""事業内容ページ「提供する三つの価値」のカード画像を描く（開発ツール。公開しない）。

  python _build/make_service_screens.py

以前は海外のフリー写真だった（ウェブ解析の画面・木の机でノートPCを囲む人々・
海外オフィスの打ち合わせ）。群馬の中小企業に寄り添うという立ち位置と食い違い、
一枚目はサービス（暗黙知の解消）と関係のない指標の画面だった（柴田指摘 2026-09-12）。

三枚を「質問に答える → 仕事を動かす → 使われ続ける」の流れの画面イメージにそろえる。

設計上の判断:
- <img> で読む独立した SVG にする。ページに直に書くと、絵の中の架空の例文が
  本文として検索結果の抜粋やチャットの知識ベースに入り、会社の事実として語られてしまう。
- <img> の SVG はウェブフォントを読めない。字は各OSの日本語フォントに任せる。
- 数字・部品名は架空。実在の製品に見えないよう、どの画面にも「画面イメージ」を置く。
- カード幅は 330〜350px 前後。0.55 倍前後に縮むので、主な文字は 22 以上で描く。
- 外部参照・スクリプト・イベント属性は一切書かない（tests/markup.test.mjs で固定）。
"""
import os
from xml.sax.saxutils import escape

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "assets", "images", "screens")

W, H = 600, 360
WIN = dict(x=44, y=28, w=512, h=304, r=16)   # 16:9 に切り抜かれても欠けない高さ
HEAD_H = 46

FONT = {
    "ja": "'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo','Noto Sans JP',sans-serif",
    "en": "'Helvetica Neue','Segoe UI',Arial,sans-serif",
}
INK, INK3, MIST, LINE = "#0C1A36", "#4A5A7A", "#637290", "#E4E8F1"

THEMES = {
    "tacit":  dict(ink="#2044CC", bg0="#F7F9FF", bg1="#E1E8FF", soft="#EBF0FF", edge="#D3DCF7", shadow="#1B2F7A"),
    "agent":  dict(ink="#007A67", bg0="#F4FDFB", bg1="#D6F5EE", soft="#E0FAF5", edge="#C3EBE2", shadow="#0B4F45"),
    "enable": dict(ink="#B55300", bg0="#FFFAF2", bg1="#FFEAD0", soft="#FFF3E0", edge="#F3DDBD", shadow="#7A3A00"),
}


def t(x, y, s, size, lang, weight=500, fill=INK, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-family="{FONT[lang]}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>')


def num_width(s, size):
    """数字の見かけの幅(Arial/Helvetica の太字)。単位を数字の直後に置くために使う。"""
    em = {",": 0.278, ".": 0.278, "/": 0.278, " ": 0.278}
    return sum(em.get(ch, 0.556) for ch in s) * size


def frame(name, lang, title, label, body):
    th = THEMES[name]
    x, y, w, h, r = WIN["x"], WIN["y"], WIN["w"], WIN["h"], WIN["r"]
    tag_w = 104 if lang == "ja" else 96
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{escape(label)}">
<defs>
<radialGradient id="bg" cx="50%" cy="-10%" r="95%"><stop offset="0" stop-color="{th['bg0']}"/><stop offset="1" stop-color="{th['bg1']}"/></radialGradient>
<filter id="sh" x="-12%" y="-12%" width="124%" height="136%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="{th['shadow']}" flood-opacity=".16"/></filter>
<clipPath id="win"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"/></clipPath>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg)"/>
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="#fff" filter="url(#sh)"/>
<g clip-path="url(#win)">
<rect x="{x}" y="{y}" width="{w}" height="{HEAD_H}" fill="{th['soft']}"/>
<line x1="{x}" y1="{y + HEAD_H}" x2="{x + w}" y2="{y + HEAD_H}" stroke="{th['edge']}"/>
</g>
<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="none" stroke="{th['edge']}"/>
<circle cx="{x + 24}" cy="{y + HEAD_H / 2}" r="6" fill="{th['ink']}"/>
{t(x + 40, y + 30, title, 18, lang, 700)}
<rect x="{x + w - tag_w - 14}" y="{y + 11}" width="{tag_w}" height="24" rx="12" fill="#fff" stroke="{th['edge']}"/>
{t(x + w - tag_w / 2 - 14, y + 28, "画面イメージ" if lang == "ja" else "Illustrative", 13, lang, 500, MIST, "middle")}
{body}
</svg>
'''


def tacit(lang):
    th = THEMES["tacit"]
    L = {
        "ja": dict(title="社内ナレッジ", q="A-12の溶接で、歪みが出やすい条件は？",
                   who="経験者の判断", a1="薄い板は、続けて当てると歪みやすい。",
                   a2="間を空け、反対側から順に当てる。", src="根拠",
                   chips=["作業記録", "聞き取りメモ", "不良報告 No.118"],
                   label="社内の知識をたずねると、経験者の判断が根拠つきで返ってくる画面のイメージ"),
        "en": dict(title="Company knowledge", q="When does welding part A-12 warp?",
                   who="Expert judgement", a1="Thin plates warp if welded continuously.",
                   a2="Leave gaps and weld alternate sides.", src="Sources",
                   chips=["Work log", "Interviews", "Defect #118"],
                   label="An illustrative screen: asking a question returns an expert's judgement with its sources"),
    }[lang]
    chip_w = {"ja": [92, 124, 150], "en": [84, 100, 110]}[lang]
    q_w = 420 if lang == "ja" else 404
    parts = [
        # 若手の質問（右寄せの吹き出し）
        f'<rect x="{532 - q_w}" y="92" width="{q_w}" height="48" rx="24" fill="{th["ink"]}"/>',
        t(532 - q_w / 2, 123, L["q"], 21, lang, 500, "#fff", "middle"),
        # 経験者の判断
        f'<circle cx="84" cy="182" r="17" fill="{th["soft"]}" stroke="{th["edge"]}"/>',
        f'<path d="M77 182 l5 5 l10 -11" fill="none" stroke="{th["ink"]}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
        f'<rect x="112" y="166" width="{118 if lang == "ja" else 150}" height="26" rx="13" fill="{th["soft"]}"/>',
        t(112 + (118 if lang == "ja" else 150) / 2, 184, L["who"], 14, lang, 700, th["ink"], "middle"),
        t(112, 224, L["a1"], 22, lang, 500, INK),
        t(112, 258, L["a2"], 22, lang, 500, INK),
        f'<line x1="112" y1="276" x2="532" y2="276" stroke="{LINE}"/>',
        t(112, 306, L["src"], 15, lang, 700, INK3),
    ]
    cx = 112 + (48 if lang == "ja" else 72)
    for label, cw in zip(L["chips"], chip_w):
        parts.append(f'<rect x="{cx}" y="288" width="{cw}" height="26" rx="6" fill="#F4F6FB" stroke="{LINE}"/>')
        parts.append(t(cx + cw / 2, 306, label, 14, lang, 500, INK3, "middle"))
        cx += cw + 8
    return frame("tacit", lang, L["title"], L["label"], "\n".join(parts))


def agent(lang):
    th = THEMES["agent"]
    L = {
        "ja": dict(title="受注メールの処理", mail="受信メール", subj="部品の追加発注",
                   snip1="A-12を200個、", snip2="10月20日納品で",
                   steps=["取引先を照合", "在庫を確認", "受注票を下書き"], wait="担当者の確認待ち", btn="確認する",
                   label="受信した注文メールを、AIが照合・確認・下書きまで進め、人が最後に確認する画面のイメージ"),
        "en": dict(title="Order email handling", mail="Incoming email", subj="Additional order",
                   snip1="200 × part A-12,", snip2="deliver by Oct 20",
                   steps=["Customer matched", "Stock checked", "Order drafted"], wait="Awaiting review", btn="Review",
                   label="An illustrative screen: an AI agent matches, checks and drafts an order, and a person approves it"),
    }[lang]
    parts = [
        # 受信メール
        f'<rect x="68" y="98" width="200" height="164" rx="12" fill="#F7FAF9" stroke="{LINE}"/>',
        t(86, 128, L["mail"], 14, lang, 700, INK3),
        f'<rect x="86" y="140" width="164" height="1" fill="{LINE}"/>',
        t(86, 172, L["subj"], 19, lang, 700, INK),
        t(86, 206, L["snip1"], 16, lang, 500, INK3),
        t(86, 232, L["snip2"], 16, lang, 500, INK3),
        # 流れ
        f'<path d="M280 180 h22" stroke="{th["ink"]}" stroke-width="2.4" stroke-linecap="round"/>',
        f'<path d="M296 173 l8 7 l-8 7" fill="none" stroke="{th["ink"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    ]
    y = 118
    for s in L["steps"]:
        parts.append(f'<circle cx="332" cy="{y - 7}" r="12" fill="{th["ink"]}"/>')
        parts.append(f'<path d="M326 {y - 7} l4 4 l8 -8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
        parts.append(t(354, y, s, 20, lang, 500, INK))
        y += 44
    # 人の確認（ここだけ色を変え、最後は人が決めることを見せる）
    parts += [
        f'<circle cx="332" cy="{y - 7}" r="11" fill="#fff" stroke="{th["ink"]}" stroke-width="2.4"/>',
        f'<circle cx="332" cy="{y - 7}" r="4" fill="{th["ink"]}"/>',
        t(354, y, L["wait"], 20, lang, 700, th["ink"]),
        f'<rect x="{532 - (104 if lang == "ja" else 96)}" y="{y + 18}" width="{104 if lang == "ja" else 96}" height="34" rx="17" fill="{th["ink"]}"/>',
        t(532 - (52 if lang == "ja" else 48), y + 41, L["btn"], 15, lang, 700, "#fff", "middle"),
    ]
    return frame("agent", lang, L["title"], L["label"], "\n".join(parts))


def enable(lang):
    th = THEMES["enable"]
    L = {
        "ja": dict(title="活用の状況", k1="今月の利用", v1="1,284", u1="回", k2="使っている社員", v2="42", u2="/ 50人",
                   months=["4月", "5月", "6月", "7月", "8月", "9月"], note="改善の提案 3件",
                   label="社内でAIがどれだけ使われ、改善が進んでいるかを見る画面のイメージ"),
        "en": dict(title="Adoption", k1="Uses this month", v1="1,284", u1="", k2="Active staff", v2="42", u2="/ 50",
                   months=["Apr", "May", "Jun", "Jul", "Aug", "Sep"], note="3 improvement ideas",
                   label="An illustrative screen showing how widely AI is used in the company and how it keeps improving"),
    }[lang]
    parts = []
    for i, (k, v, u) in enumerate([(L["k1"], L["v1"], L["u1"]), (L["k2"], L["v2"], L["u2"])]):
        x0 = 68 + i * 236
        parts.append(f'<rect x="{x0}" y="94" width="224" height="84" rx="12" fill="#FFFBF5" stroke="{th["edge"]}"/>')
        parts.append(t(x0 + 18, 122, k, 15, lang, 700, INK3))
        parts.append(t(x0 + 18, 162, v, 32, "en", 700, INK))
        parts.append(t(x0 + 18 + num_width(v, 32) + 8, 162, u, 17, lang, 500, INK3))
    # 伸びていく線（架空の推移）
    xs = [92, 176, 260, 344, 428, 512]
    ys = [290, 278, 262, 252, 230, 212]
    pts = " ".join(f"{a},{b}" for a, b in zip(xs, ys))
    area = f"M{xs[0]},{ys[0]} " + " ".join(f"L{a},{b}" for a, b in zip(xs[1:], ys[1:])) + f" L{xs[-1]},304 L{xs[0]},304 Z"
    parts += [
        '<defs><linearGradient id="ar" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{th["ink"]}" stop-opacity=".22"/><stop offset="1" stop-color="{th["ink"]}" stop-opacity="0"/></linearGradient></defs>',
        f'<line x1="80" y1="304" x2="524" y2="304" stroke="{LINE}"/>',
        f'<path d="{area}" fill="url(#ar)"/>',
        f'<polyline points="{pts}" fill="none" stroke="{th["ink"]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
        f'<circle cx="{xs[-1]}" cy="{ys[-1]}" r="6" fill="#fff" stroke="{th["ink"]}" stroke-width="3"/>',
    ]
    for a, m in zip(xs, L["months"]):
        parts.append(t(a, 322, m, 12, lang, 500, MIST, "middle"))
    # 線は右上へ伸びるので、注記は線の低い左側に置く
    nw = 128 if lang == "ja" else 160
    parts += [
        f'<rect x="80" y="196" width="{nw}" height="28" rx="14" fill="{th["soft"]}" stroke="{th["edge"]}"/>',
        t(80 + nw / 2, 215, L["note"], 14, lang, 700, th["ink"], "middle"),
    ]
    return frame("enable", lang, L["title"], L["label"], "\n".join(parts))


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("tacit", tacit), ("agent", agent), ("enable", enable)):
        for lang in ("ja", "en"):
            path = os.path.join(OUT, f"{name}.{lang}.svg")
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(fn(lang))
            print("  screens/%s.%s.svg  %5.1f KB" % (name, lang, os.path.getsize(path) / 1024))


if __name__ == "__main__":
    main()
