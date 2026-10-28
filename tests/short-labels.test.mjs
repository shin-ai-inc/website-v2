/*
  番号・札・タグのような短い語は、途中で折り返さない(柴田指摘 2026-10-28)。
  iPhone の Safari で初めて開くと、番号の「02」が「0/2」と縦に割れ、再読み込みすると直った。
  書体(Space Grotesk など)が届く前に代わりの書体の幅で列の幅が決まり、書体が差し替わって
  数字が広くなっても Safari は列を計り直さない。そこで body の overflow-wrap: break-word が
  語の途中で折る。再読み込みでは書体が手元にあるので最初から正しい幅で組まれる。
  短い語に white-space: nowrap を付ければ、書体の届く順番に左右されない。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sources = ["styles/base.css", ...readdirSync(join(ROOT, "styles", "sections")).map((f) => `styles/sections/${f}`)];
const rules = sources.flatMap((f) =>
  [...readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selectors: m[1].split(",").map((s) => s.trim()), body: m[2] })));

/** 単独の部品として書かれた短い語のクラス(.why__num など。子孫や状態の指定は除く)。 */
const SHORT = /^\.[a-z0-9-]+__(num|badge|tag|chip|step|kicker)(--[a-z0-9-]+)?$/;

/* 名前は当てはまるが、短い語ではないもの。 */
const NOT_SHORT = {
  ".contact-flow__step": "番号・見出し・説明をまとめた入れ物",
  ".method__step": "番号・見出し・説明をまとめた入れ物",
  ".tech__chip": "「オンプレミス・プライベートクラウド対応」のような句で、狭い幅では折り返す必要がある"
};

test("番号・札・タグ・工程・層の名前は、どれも折り返さない指定を持つ", () => {
  const short = new Set(rules.flatMap((r) => r.selectors).filter((s) => SHORT.test(s) && !(s in NOT_SHORT)));
  assert.ok(short.size >= 10, `対象が少なすぎる(${short.size})。正規表現が壊れていないか`);
  const unguarded = [...short].filter((s) => s.includes("--") ? false
    : !rules.some((r) => r.selectors.includes(s) && /white-space:\s*nowrap/.test(r.body)));
  assert.deepEqual(unguarded, []);
});
