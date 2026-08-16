/*
  検索層のテスト。

  ここが壊れると「資料にあるのに答えられない」が再発する(実際に一度起きた)。
  外部サービスに依存しない純粋関数なので、境界を決定的に固定できる。
*/
import test from "node:test";
import assert from "node:assert/strict";
import { normalize, terms, buildIndex, selectChunks, queryTopics } from "../api/lib/retrieve.mjs";

const CHUNKS = [
  { id: "about#profile", title: "会社概要", url: "/about.html", pin: true,
    text: "商号: シンアイ株式会社（ShinAI）\n所在地: 群馬県高崎市井野町\n代表者: 柴田昌国" },
  { id: "faq#price", title: "費用はどのくらいかかりますか", url: "/faq.html",
    text: "内容により異なります。まずは無料相談で範囲を確認します。" },
  { id: "svc#agent", title: "企業専用AIエージェント開発", url: "/services.html",
    text: "社内知識と既存システムをつなぎ、業務を実行するAIをつくります。" },
  { id: "ind#mfg", title: "製造業での活用", url: "/industries.html",
    text: "熟練者の検査判断や段取りの勘所を、若手が引き出せる形にします。" }
];

test("normalize: 全角英数と大小文字と空白の揺れを吸収する", () => {
  assert.equal(normalize("ＳｈｉｎＡＩ　株式会社"), normalize("shinai株式会社"));
});

test("terms: 日本語はn文字からn-1個の2文字組にする", () => {
  assert.deepEqual([...terms("あいうえ")], ["あい", "いう", "うえ"]);
});

test("terms: 英語は語のまま扱う(cost を co/os/st に刻まない)", () => {
  const t = terms("How much does it cost?");
  assert.ok(t.has("cost"), "語として保つ");
  assert.ok(!t.has("os"), "断片へ刻まない");
});

test("terms: 日本語に混じる英字も語として扱う", () => {
  const t = terms("RAG構築の実績はありますか");
  assert.ok(t.has("rag"));
  assert.ok(t.has("構築"), "日本語側は2文字組のまま");
});

test("terms: 1文字の語も取りこぼさない", () => {
  assert.deepEqual([...terms("あ")], ["あ"]);
});

test("terms: 1文字の英字は雑音として落とす", () => {
  assert.equal(terms("a").size, 0);
});

test("terms: 空文字は空", () => {
  assert.equal(terms("").size, 0);
});

test("selectChunks: 質問に最も一致するチャンクが1位に来る", () => {
  const index = buildIndex(CHUNKS);
  const hits = selectChunks("費用はいくらぐらいですか", index, { k: 3 });
  assert.equal(hits[0].id, "faq#price");
});

test("selectChunks: 別の話題では別のチャンクが1位に来る", () => {
  const index = buildIndex(CHUNKS);
  const hits = selectChunks("製造業でも使えますか", index, { k: 3 });
  assert.equal(hits[0].id, "ind#mfg");
});

test("selectChunks: pin付きは無関係な質問でも必ず含まれる(商号・所在地の常時保証)", () => {
  const index = buildIndex(CHUNKS);
  const hits = selectChunks("製造業でも使えますか", index, { k: 2 });
  assert.ok(hits.some((c) => c.id === "about#profile"));
});

test("selectChunks: k を超えて返さない(プロンプト長の上限を守る)", () => {
  const index = buildIndex(CHUNKS);
  assert.ok(selectChunks("AI", index, { k: 2 }).length <= 2);
});

test("selectChunks: 空クエリでも落ちず pin だけを返す", () => {
  const index = buildIndex(CHUNKS);
  const hits = selectChunks("", index, { k: 3 });
  assert.deepEqual(hits.map((c) => c.id), ["about#profile"]);
});

test("selectChunks: 全く無関係な語では pin 以外を拾わない(雑音を混ぜない)", () => {
  const index = buildIndex(CHUNKS);
  const hits = selectChunks("XQZWVY", index, { k: 4 });
  assert.deepEqual(hits.map((c) => c.id), ["about#profile"]);
});

test("selectChunks: 長いチャンクが語数だけで有利にならない", () => {
  const padded = CHUNKS.concat([{
    id: "long", title: "長文", url: "/x",
    text: "費用 " + "その他の話題。".repeat(200)
  }]);
  const hits = selectChunks("費用はいくらですか", buildIndex(padded), { k: 2 });
  assert.equal(hits.find((c) => !c.pin).id, "faq#price");
});

test("buildIndex: チャンクが空でも例外を投げない", () => {
  assert.deepEqual(selectChunks("何か", buildIndex([]), { k: 3 }), []);
});

/* ---- 話題別の目次(pinFor) ----
   「サービスを紹介してください」に対し、三つの柱に触れないまま
   研究領域(フィジカルAI)だけを紹介した実測の誤りを、構造で止める。 */

const CATALOG = {
  id: "services#catalog", title: "提供サービス一覧", url: "/services.html",
  pinFor: "services",
  text: "法人向けに提供しているサービスは次の三つです。\n1. 暗黙知の解消支援\n2. 企業専用AIエージェント開発\n3. AI化伴走支援"
};
const FRONTIER = {
  id: "svc#frontier", title: "Physical AI 新サービス", url: "/services.html",
  text: "現場の技をAIに変換するサービス。手の動きや判断をセンサーや映像から捉えます。"
};
const WITH_CATALOG = [...CHUNKS, CATALOG, FRONTIER];

test("queryTopics: サービスを問う言い回しを話題として拾う", () => {
  for (const q of ["サービス紹介してください", "事業内容を教えて",
                   "何ができますか", "What services do you offer?"]) {
    assert.ok(queryTopics(q).has("services"), `${q} を services と判定`);
  }
});

test("queryTopics: 無関係な質問では話題を立てない", () => {
  assert.equal(queryTopics("所在地はどこですか").size, 0);
});

test("目次は話題が一致したとき先頭に来る(答えの順序を決めるため)", () => {
  const hits = selectChunks("サービス紹介してください", buildIndex(WITH_CATALOG), { k: 4 });
  assert.equal(hits[0].id, "services#catalog");
});

test("サービスの問いで、研究領域だけが紹介される状態にならない", () => {
  const hits = selectChunks("サービス紹介してください", buildIndex(WITH_CATALOG), { k: 4 });
  const text = hits.map((c) => c.text).join("\n");
  for (const pillar of ["暗黙知の解消支援", "企業専用AIエージェント開発", "AI化伴走支援"]) {
    assert.ok(text.includes(pillar), `${pillar} が渡る`);
  }
});

test("目次は話題が一致しない質問には混ざらない(枠を奪わせない)", () => {
  const hits = selectChunks("費用はいくらですか", buildIndex(WITH_CATALOG), { k: 4 });
  assert.ok(!hits.some((c) => c.id === "services#catalog"));
});

test("目次を混ぜても pin(会社概要)は落ちない", () => {
  const hits = selectChunks("サービス紹介してください", buildIndex(WITH_CATALOG), { k: 3 });
  assert.ok(hits.some((c) => c.pin), "常時同梱は保たれる");
  assert.ok(hits.length <= 3, "k を超えない");
});

/* ---- 英数語は証拠、2文字組は手がかり ----
   「GPUを導入されたそうですが何ができるようになったのですか」で、
   資料中1件しかない「たそ」「るよ」「なっ」が合計で gpu を上回り、
   GPUの記述を一件も返せなかった(実測)。稀少さは情報量ではない。 */

const WORDY = [
  { id: "news#gpu", title: "学習環境を整えました", url: "/news.html",
    text: "NVIDIAのGPU（GeForce RTX 5070 Ti）を搭載した開発専用のコンピュータを社内に設置しました。データを外へ出さずにモデルを調整できます。" },
  { id: "faq#a", title: "導入までの流れ", url: "/faq.html",
    text: "小さく始めてから広げます。そうした進め方で無理なく効果を確かめられるようになった事例が多くあります。" },
  { id: "faq#b", title: "対応範囲", url: "/faq.html",
    text: "できることは幅広く、まずはご相談ください。何ができるかは状況によって変わります。" }
];

test("名指しされた英数語を含む記述が、断片の合計に負けない", () => {
  const hits = selectChunks("GPUを導入されたそうですが何ができるようになったのですか",
                            buildIndex(WORDY), { k: 3 });
  assert.equal(hits[0].id, "news#gpu");
});

test("英数語を含まない質問では、従来どおり点数順のまま", () => {
  const hits = selectChunks("導入までの流れを教えてください", buildIndex(WORDY), { k: 3 });
  assert.equal(hits[0].id, "faq#a");
});

test("目次に無い固有の物を名指した質問では、目次を出さない", () => {
  /* 「何ができ」に当たるが、訪問者が知りたいのはGPUのこと。 */
  const hits = selectChunks("GPUを導入されて何ができるようになったのですか",
                            buildIndex([...WITH_CATALOG, WORDY[0]]), { k: 4 });
  assert.ok(!hits.some((c) => c.pinFor), "目次は枠を取らない");
  assert.equal(hits[0].id, "news#gpu");
});

test("目次に載っている語を名指した質問では、目次を出す", () => {
  const withRag = [...WITH_CATALOG];
  withRag[withRag.indexOf(CATALOG)] = { ...CATALOG, text: CATALOG.text + " RAG構築" };
  const hits = selectChunks("RAG構築のサービスはありますか", buildIndex(withRag), { k: 4 });
  assert.ok(hits.some((c) => c.pinFor), "目次に載る語なら目次で答えてよい");
});
