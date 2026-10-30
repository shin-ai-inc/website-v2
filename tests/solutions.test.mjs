/*
  トップの「暗黙知の解消支援」の本文(柴田 2026-10-30 案1)。
  「ベテランにしか分からなかった判断を、誰もが引き出せる状態に」は、AI化を進める側の社員にも
  「自分の仕事が置き換えられる」と読まれうる。人と人を比べず、判断を移す話にもせず、
  確かめる手間を減らす話として書く。確かめるのは人である。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lead = (rel) => {
  const html = readFileSync(join(ROOT, rel), "utf8");
  const card = html.match(/<article class="solution-card solution-card--tacit[\s\S]*?<\/article>/);
  assert.ok(card, `${rel} に暗黙知のカードが無い`);
  const m = card[0].match(/<p class="solution-card__lead">([\s\S]*?)<\/p>/);
  assert.ok(m, `${rel} にカードの本文が無い`);
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};

test("暗黙知のカードは、確かめる手間を減らす話として書く", () => {
  const s = lead("partials/index.html");
  for (const word of ["細かな判断", "思い出す", "探す", "手間", "確かめられる"]) assert.ok(s.includes(word), word);
});

test("暗黙知のカードで、人と人を比べたり、判断を人から移す書き方をしない", () => {
  const s = lead("partials/index.html");
  for (const word of ["ベテラン", "誰もが", "引き出せる", "代わり", "置き換え"]) assert.equal(s.includes(word), false, word);
  const en = lead("partials/en/index.html").toLowerCase();
  for (const word of ["veteran", "anyone can", "replace"]) assert.equal(en.includes(word), false, word);
  for (const word of ["recall", "search", "check"]) assert.ok(en.includes(word), word);
});
