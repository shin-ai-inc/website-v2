/*
  検索層のテスト。

  ここが壊れると「資料にあるのに答えられない」が再発する(実際に一度起きた)。
  外部サービスに依存しない純粋関数なので、境界を決定的に固定できる。
*/
import test from "node:test";
import assert from "node:assert/strict";
import { normalize, terms, buildIndex, selectChunks } from "../api/lib/retrieve.mjs";

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
