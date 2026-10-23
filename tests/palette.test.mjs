/*
  三つの事業カードの色の方針を固定する(柴田指示 2026-10-23)。
  - 淡色を面いっぱいに塗ると、初期の生成AIの配色に見える。面は純白にする。
  - 色分けは枠の線で行う。タイトルの色は以前のまま変えない。
  - 共有の色(--c-*-bg・--c-*-ink)は業界別・質問窓口・問い合わせでも使うため、
    カードのために書き換えない(一度書き換えて他のページの色まで変わった)。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = readFileSync(join(ROOT, "styles", "tokens.css"), "utf8");
const cards = readFileSync(join(ROOT, "styles", "sections", "solutions.css"), "utf8");

const rule = (selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = cards.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `${selector} が無い`);
  return m[1];
};

test("共有の色は、以前の値のまま(カードのために書き換えない)", () => {
  const keep = {
    "c-tacit-bg": "#EBF0FF", "c-tacit-ink": "#2044CC",
    "c-agent-bg": "#E0FAF5", "c-agent-ink": "#007A67",
    "c-enable-bg": "#FFF3E0", "c-enable-ink": "#B55300"
  };
  for (const [name, value] of Object.entries(keep)) {
    const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
    assert.ok(m, `--${name} が無い`);
    assert.equal(m[1].toUpperCase(), value, `--${name}`);
  }
});

test("事業カードの面は純白で、淡色を塗らない", () => {
  const card = rule(".solution-card");
  assert.match(card, /background:\s*var\(--paper\)\s*;/);
  assert.doesNotMatch(card, /--card-bg/);
});

test("事業カードの色分けは、役割の色の枠で行う", () => {
  const card = rule(".solution-card");
  assert.match(card, /border:[^;]*var\(--card-frame\)/);
  assert.match(rule(".solution-card__title"), /color:\s*var\(--card-ink\)/);
});

test("伴走支援の枠はオレンジで、文字用の濃い橙(白に溶かすと茶色に見える)を使わない(柴田 2026-10-23)", () => {
  assert.match(rule(".solution-card--enable"), /--card-frame:\s*var\(--energy\)/);
});
