/*
  三つの事業カードの色(セクションの色分け)の方針を固定する。
  初期の淡色(#EBF0FF・#E0FAF5・#FFF3E0)は彩度が高く平坦で、生成AIの既定の配色に見えた
  (柴田指摘 2026-10-23)。業種別の色と同じく、彩度を落とした淡い色にし、
  面は一色で塗らずに上から紙の白へ溶かす。読みやすさ(4.5:1)は保つ。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = readFileSync(join(ROOT, "styles", "tokens.css"), "utf8");
const cards = readFileSync(join(ROOT, "styles", "sections", "solutions.css"), "utf8");

const token = (name) => {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(m, `--${name} が tokens.css に無い`);
  return m[1];
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/* HSL の彩度。淡い色ほど明度が高く、彩度の差が見た目の派手さに直結する。 */
const saturation = (hex) => {
  const c = rgb(hex);
  const max = Math.max(...c), min = Math.min(...c), l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
};

const ROLES = ["tacit", "agent", "enable"];

test("事業カードの淡色は、初期の派手な淡色に戻さない", () => {
  const old = ["#EBF0FF", "#E0FAF5", "#FFF3E0"];
  for (const r of ROLES) {
    const bg = token(`c-${r}-bg`).toUpperCase();
    assert.ok(!old.includes(bg), `${r}: 初期の淡色のまま(${bg})`);
    assert.ok(saturation(bg) <= 0.55, `${r}: 淡色の彩度が高すぎる(${saturation(bg).toFixed(2)})`);
  }
});

test("事業カードの文字色は、淡色の上でも白の上でも 4.5:1 を満たす", () => {
  for (const r of ROLES) {
    const ink = token(`c-${r}-ink`);
    for (const ground of [token(`c-${r}-bg`), "#FFFFFF"]) {
      const c = contrast(ink, ground);
      assert.ok(c >= 4.5, `${r}: ${ink} と ${ground} は ${c.toFixed(2)}:1`);
    }
  }
});

test("事業カードの面は一色で塗らず、淡色から紙の白へ溶かす", () => {
  const m = cards.match(/\.solution-card\s*\{([^}]*)\}/);
  assert.ok(m, ".solution-card が無い");
  assert.match(m[1], /background:[^;]*linear-gradient\([^;]*var\(--card-bg\)[^;]*var\(--paper\)/);
});
