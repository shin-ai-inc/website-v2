/*
  本文の言い回しについて、柴田が下した方針を固定する。
  node --test tests/*.test.mjs で実行(依存なし・Node標準のテストランナー)。

  文言そのものを丸ごと固定すると、些細な推敲のたびにテストが止まる。
  ここで押さえるのは「どこに何を置くか」という方針だけにする。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const readDist = (rel) => {
  const path = join(ROOT, "dist", rel);
  if (!existsSync(path)) {
    throw new Error(`${rel} が未生成。先に node _build/build.mjs を実行する。`);
  }
  return readFileSync(path, "utf8");
};

const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** 代表メッセージの語り(リードと段落)。経歴リストと署名は含まない。 */
const messageProse = (rel) =>
  [...readDist(rel).matchAll(/<p class="about-message__(?:lead|para)">([\s\S]*?)<\/p>/g)]
    .map((m) => strip(m[1]))
    .join(" ");

/** 代表メッセージの一段落目。 */
const messageLead = (rel) => {
  const m = readDist(rel).match(/<p class="about-message__lead">([\s\S]*?)<\/p>/);
  return m ? strip(m[1]) : "";
};

/** 経歴リストの中身。 */
const careerList = (rel) => {
  const m = readDist(rel).match(/<ol class="about-career">([\s\S]*?)<\/ol>/);
  return m ? strip(m[1]) : "";
};

/* 日本語版と英語版で、同じ方針が同じように守られていることを確かめる。 */
const PAGES = [
  { file: "about.html", 前職: "消防", 理念: "真の価値を信じ" },
  { file: "en/about.html", 前職: "firefighter", 理念: "Believe in true value" },
];

test("代表メッセージは理念から始まる", () => {
  /* 冒頭が経歴の色で染まると、何を信じている会社かが後回しになる(柴田指摘 2026-09-08)。 */
  for (const p of PAGES) {
    const lead = messageLead(p.file);
    assert.ok(lead.length > 0, `${p.file} のリードが取れていない`);
    assert.ok(lead.includes(p.理念), `${p.file} のリードに理念がない: ${lead}`);
  }
});

test("代表メッセージの語りに前職を持ち込まない", () => {
  for (const p of PAGES) {
    const prose = messageProse(p.file).toLowerCase();
    assert.ok(prose.length > 100, `${p.file} の本文が取れていない`);
    assert.ok(!prose.includes(p.前職.toLowerCase()),
      `${p.file} の代表メッセージ本文に「${p.前職}」が残っている`);
  }
});

test("前職は経歴に残っている", () => {
  /* 語りから外すことと、事実を消すことは違う。経歴を見れば確認できる状態を保つ。 */
  for (const p of PAGES) {
    const career = careerList(p.file).toLowerCase();
    assert.ok(career.includes(p.前職.toLowerCase()),
      `${p.file} の経歴から「${p.前職}」が消えている`);
  }
});
