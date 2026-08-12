/*
  知識ベース生成の検証。
  node --test tests/  で実行(依存なし・Node標準のテストランナー)。

  この知識ベースはチャットボットが参照する唯一の事実源。壊れたまま公開すると
  AIが誤った会社情報を answer する。生成物の性質を機械で固定する。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KB_PATH = join(ROOT, "dist", "api", "knowledge.ja.json");

const loadKb = () => {
  if (!existsSync(KB_PATH)) {
    throw new Error("知識ベースが未生成。先に node _build/build.mjs を実行する。");
  }
  return JSON.parse(readFileSync(KB_PATH, "utf8"));
};

test("知識ベースが生成され、想定ページを網羅している", () => {
  const kb = loadKb();
  assert.ok(Array.isArray(kb.docs), "docs は配列");
  const paths = kb.docs.map((d) => d.path);
  for (const expected of ["index.html", "services.html", "industries.html",
                          "about.html", "faq.html", "contact.html"]) {
    assert.ok(paths.includes(expected), `${expected} が知識に含まれる`);
  }
});

test("各文書が題名・URL・本文を持つ", () => {
  for (const d of loadKb().docs) {
    assert.ok(d.title && d.title.length > 0, `${d.path}: title あり`);
    assert.ok(d.url && d.url.startsWith("https://"), `${d.path}: 絶対URL`);
    assert.ok(d.text && d.text.length > 50, `${d.path}: 本文が実質的`);
  }
});

test("HTMLタグ・スクリプトが本文に混入しない", () => {
  for (const d of loadKb().docs) {
    assert.ok(!/<[a-z/][^>]*>/i.test(d.text), `${d.path}: タグ痕跡なし`);
    assert.ok(!/function\s*\(|window\.|=>/.test(d.text), `${d.path}: JS痕跡なし`);
  }
});

test("会社の基本事実が含まれている(回答の土台)", () => {
  const all = loadKb().docs.map((d) => d.text).join(" ");
  for (const fact of ["シンアイ株式会社", "高崎", "暗黙知", "柴田"]) {
    assert.ok(all.includes(fact), `「${fact}」が知識に存在する`);
  }
});

test("連絡先が実在のものと一致する(古い情報を配らない)", () => {
  const all = loadKb().docs.map((d) => d.text).join(" ");
  assert.ok(all.includes("contact@shinai-inc.jp"), "現行の連絡先を含む");
  assert.ok(!all.includes("shinai.life@gmail.com"), "旧アドレスを含まない");
  assert.ok(!/Tokyo Innovation Base|丸の内/.test(all), "削除済みの旧拠点を含まない");
});

test("プロンプト全体がモデルの実用的な文脈長に収まる", () => {
  const kb = loadKb();
  const chars = kb.docs.reduce((n, d) => n + d.text.length, 0);
  // 日本語は概ね1字≒1トークン。全文をシステムプロンプトに載せる設計のため、
  // ここが膨らむと応答遅延とコストに直結する。超えたら要約か分割へ設計変更する合図。
  assert.ok(chars < 40000, `知識量 ${chars}字 は上限4万字未満`);
});

test("機密の痕跡を含まない(公開情報のみで構成される)", () => {
  const all = loadKb().docs.map((d) => d.text).join(" ");
  for (const secret of ["sk-", "api_key", "API_KEY", "Bearer ", "password"]) {
    assert.ok(!all.includes(secret), `「${secret}」を含まない`);
  }
});
