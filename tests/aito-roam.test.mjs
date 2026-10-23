/* アイトが画面の中を動き回る遊び(scripts/aito-roam.js・styles/sections/chatbot.css)。
   node --test tests/aito-roam.test.mjs
   守るもの:
   - 図形と三つの基本の動き(浮遊・まばたき・荷物)は正本のまま。部位は動かさない(柴田 2026-10-23: 部位の演出は不採用)。動くのは全身の位置だけ
   - 位置は画面の中の格子(緯度=行・経度=列)で持ち、端と上の帯(ヘッダー)を避ける
   - 移動の時計は CSS(transition)が持つ。JS は次の目的地を決めて書くだけで、setTimeout/setInterval/rAF を使わない
   - 触れたら止まる。会話を開いたら定位置(右下)へ戻る。reduced-motion と狭い画面では動き回らない */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const src = read("scripts/aito-roam.js");
const css = read("styles/sections/chatbot.css");
const partialJa = read("partials/_chatbot.html");
const partialEn = read("partials/en/_chatbot.html");

function loadCore() {
  const ctx = vm.createContext({ Math, Number, Object, Array, JSON, String });
  vm.runInContext(src, ctx, { filename: "aito-roam.js" });
  return ctx.AitoRoam.core;
}
const VIEW = { width: 1200, height: 900, size: 62, top: 96, margin: 24 };

test("純粋: 格子。画面を緯度(行)と経度(列)に切り、上の帯と端を避けた座標を返す", () => {
  const C = loadCore();
  const g = C.grid(VIEW);
  assert.equal(g.cols, 7); assert.equal(g.rows, 4);
  const p = C.cellToPoint({ lat: 0, lon: 0 }, g);
  assert.ok(p.x >= VIEW.margin && p.y >= VIEW.top, "左上の格子も帯と端を避ける");
  const q = C.cellToPoint({ lat: g.rows - 1, lon: g.cols - 1 }, g);
  assert.ok(q.x + VIEW.size <= VIEW.width - VIEW.margin && q.y + VIEW.size <= VIEW.height - VIEW.margin, "右下の格子も画面に収まる");
  assert.equal(C.cellToPoint({ lat: 99, lon: -1 }, g).x, p.x, "範囲の外は端へ丸める");
});

test("純粋: 格子は狭い画面でも最低 2×2。極端に狭ければ動き回れない(null)", () => {
  const C = loadCore();
  assert.deepEqual([C.grid({ width: 390, height: 844, size: 56, top: 96, margin: 16 }).cols, C.grid({ width: 390, height: 844, size: 56, top: 96, margin: 16 }).rows], [2, 4]);
  assert.equal(C.grid({ width: 120, height: 200, size: 56, top: 96, margin: 16 }), null);
});

test("純粋: 次の目的地は今の格子と違う所。乱数は外から与える(試験で決められる)。隣だけでなく遠くへも行く", () => {
  const C = loadCore();
  const g = C.grid(VIEW);
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const n = C.nextCell({ lat: 1, lon: 2 }, g, () => (i * 0.137) % 1);
    assert.ok(!(n.lat === 1 && n.lon === 2), "同じ格子には留まらない");
    assert.ok(n.lat >= 0 && n.lat < g.rows && n.lon >= 0 && n.lon < g.cols);
    seen.add(n.lat + ":" + n.lon);
  }
  assert.ok(seen.size >= 6, "行き先に偏りがない");
  const far = C.nextCell({ lat: 0, lon: 0 }, g, () => 0.999);
  assert.ok(Math.abs(far.lat) + Math.abs(far.lon) >= 2, "遠くへも行く");
});

test("純粋: 移動の時間は距離に比例(速さ一定 90px/s)。下限 0.8 秒・上限 6 秒。休む時間は 2〜7 秒の間で乱数", () => {
  const C = loadCore();
  assert.equal(C.travelMs({ x: 0, y: 0 }, { x: 900, y: 0 }), 10000 > 6000 ? 6000 : 0);
  assert.equal(C.travelMs({ x: 0, y: 0 }, { x: 180, y: 0 }), 2000);
  assert.equal(C.travelMs({ x: 0, y: 0 }, { x: 10, y: 0 }), 800);
  assert.equal(C.restMs(0), 2000); assert.equal(C.restMs(1), 7000); assert.equal(C.restMs(0.5), 4500);
  assert.equal(C.restMs(NaN), 2000);
});

test("JS は動きの時計を持たない(setTimeout/setInterval/requestAnimationFrame を使わない)。移動の終わりと休みの終わりは CSS の出来事で受ける", () => {
  assert.doesNotMatch(src, /setTimeout|setInterval|requestAnimationFrame/);
  assert.match(src, /transitionend/); assert.match(src, /animationend/);
});

test("形は不変: 起動UIの図形は正本 §6 のまま(腕は一本・目を包む層も足さない)。日英で同じ", () => {
  for (const [name, html] of [["ja", partialJa], ["en", partialEn]]) {
    const svg = html.match(/<svg[\s\S]*?<\/svg>/)[0];
    assert.equal((svg.match(/class="aito-arm"/g) || []).length, 1, `${name}: 腕は一本`);
    assert.ok(svg.includes('d="M26 30 q-5 -1 -8 1"'), `${name}: 腕の形`);
    assert.ok(!svg.includes("aito-eyes"), `${name}: 部位の層を足さない`);
    assert.match(html, /<div class="chatbot" data-chatbot data-aito-roam="home">/, `${name}: 居場所の印`);
  }
});

test("CSS: 基本の三つの動きは正本のまま。動き回る層は器(.chatbot)の transform だけで、部位の規則を足さない", () => {
  assert.match(css, /@keyframes aito-float \{ 0%, 100% \{ transform: translateY\(0\); \} 50% \{ transform: translateY\(-3px\); \} \}/);
  assert.match(css, /@keyframes aito-blink \{ 0%, 91%, 100% \{ transform: scaleY\(1\); \} 94% \{ transform: scaleY\(0\.12\); \} \}/);
  assert.match(css, /@keyframes aito-carry \{ 0%, 100% \{ transform: rotate\(0deg\); \} 50% \{ transform: rotate\(-3deg\) translateY\(-1px\); \} \}/);
  assert.match(css, /\.chatbot \{\s*position: fixed;/);
  assert.match(css, /\.chatbot\[data-aito-roam="roam"\],\s*\.chatbot\[data-aito-roam="held"\] \{[^}]*transform: translate3d\(var\(--aito-x[^}]*\}/);
  assert.match(css, /@keyframes aito-rest \{/);
  assert.doesNotMatch(css, /aito-eyes|aito-ponder|aito-speak|data-aito-state/, "部位を動かす層は入れない");
});

test("連携: 会話を開くと定位置へ戻る印を出し、閉じると再び動き回れる。会話の部品はアイトの実装を知らない", () => {
  const chatbot = read("scripts/chatbot.js");
  assert.match(chatbot, /new CustomEvent\("aito"/);
  assert.ok(chatbot.includes('"open"') && chatbot.includes('"close"'));
  assert.doesNotMatch(chatbot, /AitoRoam/);
});
