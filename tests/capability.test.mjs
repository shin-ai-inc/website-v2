/*
  トップの Engineering の区画(#capability)。柴田指示 2026-10-25:
  専門用語(LLM最適化・強化学習・RAG・オンプレミス)が並び、一般の人には「AI = ChatGPT」と結びつかず、
  自分ごととして読めなかった。身近なモデルの名前を入口にし、
  基盤のモデル → アプリ層 → 企画から運用までの支援、の順で何をするかを示す。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const section = (rel) => {
  const html = readFileSync(join(ROOT, rel), "utf8");
  const m = html.match(/<section class="section section--ink capability" id="capability"[\s\S]*?<\/section>/);
  assert.ok(m, `${rel} に #capability が無い`);
  return m[0];
};

test("身近なモデルの名前を入口にし、基盤 → アプリ層 → 一貫した支援の順で並べる", () => {
  const s = section("partials/index.html");
  for (const word of ["ChatGPT", "Claude", "フロンティアモデル", "ローカルLLM", "オープンウェイトモデル",
                      "AIエージェント", "バーティカルAI", "専門特化型AI", "企画", "開発", "運用"]) {
    assert.ok(s.includes(word), word);
  }
  const order = ["基盤のモデル", "アプリ層", "一貫した支援"].map((w) => s.indexOf(w));
  assert.ok(order.every((i) => i > 0), "三つの層の名前がそろっていない");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "基盤 → アプリ層 → 支援の順でない");
});

test("一般の人に届かない専門用語を、項目の名前に並べない", () => {
  const s = section("partials/index.html");
  for (const word of ["強化学習", "RAG", "ベクトル検索", "LLM最適化", "オンプレミス"]) {
    assert.equal(s.includes(word), false, word);
  }
});

test("英語版も同じ構成にそろえる", () => {
  const s = section("partials/en/index.html");
  for (const word of ["ChatGPT", "Claude", "frontier models", "local LLM", "open-weight", "AI agents", "Vertical AI", "Plan", "Build", "Operate"]) {
    assert.ok(s.includes(word), word);
  }
  for (const word of ["Reinforcement learning", "RAG", "vector search", "On-premise"]) {
    assert.equal(s.includes(word), false, word);
  }
});
