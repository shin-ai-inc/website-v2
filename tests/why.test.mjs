/*
  トップの「根づいてはじめて価値になる。」(#why)。柴田 2026-10-30:
  長所を提供側の言葉で並べると、層の図や進め方と重なり、読む人の問いに答えていなかった。
  相談の直前に残る問いは「任せて大丈夫か」。依頼を決める人の不安を見出しに置き、約束で答えて背中を押す。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const rows = (rel) => {
  const html = readFileSync(join(ROOT, rel), "utf8");
  const sec = html.match(/<section class="section section--alt why" id="why"[\s\S]*?<\/section>/);
  assert.ok(sec, `${rel} に #why が無い`);
  return [...sec[0].matchAll(/<article class="why__row[\s\S]*?<\/article>/g)].map((m) => ({
    worry: strip(m[0].match(/<p class="why__worry">([\s\S]*?)<\/p>/)?.[1] ?? ""),
    promise: strip(m[0].match(/<h3 class="why__title">([\s\S]*?)<\/h3>/)?.[1] ?? ""),
    all: strip(m[0]),
    raw: m[0],
  }));
};

test("依頼を決める人の不安を四つ、問いの形で置き、それぞれに約束で答える", () => {
  for (const [rel, ending] of [["partials/index.html", /か$/], ["partials/en/index.html", /\?$/]]) {
    const r = rows(rel);
    assert.equal(r.length, 4, `${rel}: 不安は四つ`);
    for (const x of r) {
      assert.match(x.worry, ending, `${rel}: 不安が問いの形でない: ${x.worry}`);
      assert.ok(x.promise.length > 0, `${rel}: 約束が欠けている: ${x.worry}`);
    }
  }
});

test("四つの不安は、費用・情報・現場・依存の順で並ぶ", () => {
  const r = rows("partials/index.html");
  for (const [i, word] of ["成果", "情報", "現場", "頼り続け"].entries()) assert.ok(r[i].worry.includes(word), `${i + 1}: ${word}`);
});

test("依存の不安には、社内で使いこなせる到達点と、そこまで仕上げる責任で答える(柴田 2026-10-30 案A)", () => {
  /* 「開発は私たちが、運用は社内で」と役割を切り分けると、作って離れる会社に見え、提供し続ける価値が消える。
     「その先も共に歩みます」と関わり続けることを約束すると、売り込みのいやらしさが出た。
     価値は関わりの長さではなく、仕上がりへの責任で示す。 */
  const last = rows("partials/index.html")[3].all;
  assert.ok(last.includes("社内で使いこなせる") && last.includes("責任を持って"), last);
  assert.equal(last.includes("共に"), false, last);
  const en = rows("partials/en/index.html")[3].all.toLowerCase();
  assert.ok(en.includes("your team") && en.includes("see it through"), en);
  assert.equal(en.includes("with you"), false, en);
});

test("約束は一文で言い切り、根拠の一行を添えない(回りくどい・柴田 2026-10-30)", () => {
  for (const rel of ["partials/index.html", "partials/en/index.html"]) {
    for (const x of rows(rel)) assert.equal(x.raw.includes("why__line"), false, `${rel}: ${x.worry}`);
  }
});

test("提供側の言葉と専門用語を、読む人の前に出さない", () => {
  const s = rows("partials/index.html").map((x) => x.all).join(" ");
  for (const word of ["技術移転", "オンプレミス", "自走", "御社", "貴社", "開発は私たち"]) assert.equal(s.includes(word), false, word);
  const en = rows("partials/en/index.html").map((x) => x.all).join(" ").toLowerCase();
  for (const word of ["on-premise", "handover"]) assert.equal(en.includes(word), false, word);
});
