/*
  知識ベース生成の検証。
  node --test tests/*.test.mjs で実行(依存なし・Node標準のテストランナー)。

  この知識ベースはチャットボットが参照する唯一の事実源。壊れたまま公開すると
  AIが誤った会社情報を配る。生成物の性質を機械で固定する。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, hybridSearch } from "../api/lib/retrieve.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KB_PATH = join(ROOT, "dist", "api", "knowledge.ja.json");

const loadKb = () => {
  if (!existsSync(KB_PATH)) {
    throw new Error("知識ベースが未生成。先に node _build/build.mjs を実行する。");
  }
  return JSON.parse(readFileSync(KB_PATH, "utf8"));
};

test("チャンクが生成され、想定ページを網羅している", () => {
  const kb = loadKb();
  assert.ok(Array.isArray(kb.chunks), "chunks は配列");
  const urls = kb.chunks.map((c) => c.url).join(" ");
  for (const expected of ["services.html", "industries.html", "about.html",
                          "faq.html", "contact.html"]) {
    assert.ok(urls.includes(expected), `${expected} 由来のチャンクがある`);
  }
});

test("各チャンクが題名・URL・本文を持つ", () => {
  for (const c of loadKb().chunks) {
    assert.ok(c.id, "id あり");
    assert.ok(c.title && c.title.length > 0, `${c.id}: title あり`);
    assert.ok(c.url && c.url.startsWith("https://"), `${c.id}: 絶対URL`);
    assert.ok(c.text && c.text.length > 0, `${c.id}: 本文あり`);
  }
});

test("チャンクが埋もれる大きさにならない(全文投入で失敗した設計へ戻さない)", () => {
  for (const c of loadKb().chunks) {
    assert.ok(c.text.length <= 1200, `${c.id} が ${c.text.length}字と長すぎる`);
  }
});

test("HTMLタグ・スクリプトが本文に混入しない", () => {
  for (const c of loadKb().chunks) {
    assert.ok(!/<[a-z/][^>]*>/i.test(c.text), `${c.id}: タグ痕跡なし`);
    assert.ok(!/function\s*\(|window\.|=>/.test(c.text), `${c.id}: JS痕跡なし`);
  }
});

test("会社の基本事実が一枚のチャンクに揃い、常時同梱になっている", () => {
  const pin = loadKb().chunks.filter((c) => c.pin);
  assert.equal(pin.length, 1, "常時同梱は会社概要の1件だけ");
  for (const fact of ["シンアイ株式会社", "柴田", "高崎"]) {
    assert.ok(pin[0].text.includes(fact), `「${fact}」が事実カードにある`);
  }
});

test("連絡先が実在のものと一致する(古い情報を配らない)", () => {
  const all = loadKb().chunks.map((c) => c.text).join(" ");
  assert.ok(all.includes("contact@shinai-inc.jp"), "現行の連絡先を含む");
  assert.ok(!all.includes("shinai.life@gmail.com"), "旧アドレスを含まない");
  assert.ok(!/Tokyo Innovation Base|丸の内/.test(all), "削除済みの旧拠点を含まない");
});

test("1回の応答で渡す根拠が短く収まる(埋もれと費用の再発防止)", () => {
  const kb = loadKb();
  const index = buildIndex(kb.chunks);
  for (const q of ["費用はいくらですか", "製造業でも使えますか", "商号を教えてください"]) {
    const chars = hybridSearch(q, null, index, { k: 6 })
      .reduce((n, c) => n + c.text.length, 0);
    assert.ok(chars < 4000, `「${q}」で ${chars}字は多すぎる`);
  }
});

test("機密の痕跡を含まない(公開情報のみで構成される)", () => {
  const all = loadKb().chunks.map((c) => c.text).join(" ");
  for (const secret of ["sk-", "api_key", "API_KEY", "Bearer ", "password"]) {
    assert.ok(!all.includes(secret), `「${secret}」を含まない`);
  }
});

test("実データで検索が要点を当てる(字面のみでも成立すること)", () => {
  const index = buildIndex(loadKb().chunks);
  const cases = [
    ["商号を教えてください", /シンアイ株式会社/],
    ["費用はどのくらいかかりますか", /費用|料金|無料相談|見積/],
    ["製造業で使えますか", /製造/],
    ["問い合わせ先を教えてください", /contact@shinai-inc\.jp|お問い合わせ/]
  ];
  for (const [q, expected] of cases) {
    const text = hybridSearch(q, null, index, { k: 6 }).map((c) => c.text).join("\n");
    assert.match(text, expected, `「${q}」の根拠が選ばれていない`);
  }
});
