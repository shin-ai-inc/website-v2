/* 案内役キャラクター「アイト」の常時の生きた動き(scripts/aito-life.js・styles/sections/chatbot.css)。
   node --test tests/aito.test.mjs
   守るもの:
   - 形は不変(正本 §6 の図形。腕は一本・path の d が同じ)。足すのは状態の層だけ
   - 動きは CSS 駆動。JS は状態(data-aito-state)と視線の量(CSS 変数)を書くだけで、setTimeout/setInterval で動かさない
   - 状態の遷移は純粋な関数で決まり、知らない状態・不正な入力は無視する
   - 画面が隠れたら休む(rest)。戻ったら前の状態へ
   - reduced-motion では視線を追わない */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const src = read("scripts/aito-life.js");
const css = read("styles/sections/chatbot.css");
const partialJa = read("partials/_chatbot.html");
const partialEn = read("partials/en/_chatbot.html");
const chatbot = read("scripts/chatbot.js");

/* ブラウザ無しで純粋な部分だけを読む。window が無ければ mount は走らない */
function loadCore() {
  const ctx = vm.createContext({ Math, Number, Object, Array, JSON, String });
  vm.runInContext(src, ctx, { filename: "aito-life.js" });
  return ctx.AitoLife;
}

test("純粋: 状態の遷移表。知らない状態と不正な入力は無視し、rest は前の状態を覚えて戻る", () => {
  const A = loadCore();
  const R = A.core.reduce;
  assert.equal(R("idle", "attentive"), "attentive");
  assert.equal(R("attentive", "thinking"), "thinking");
  assert.equal(R("thinking", "speaking"), "speaking");
  assert.equal(R("speaking", "idle"), "idle");
  assert.equal(R("idle", "joy"), "joy");
  assert.equal(R("joy", "idle"), "idle");
  assert.equal(R("idle", "dance"), "idle", "知らない状態は無視");
  assert.equal(R("idle", 42), "idle");
  assert.equal(R("idle", ""), "idle");
  /* 休みは要求ではなく画面の見え方で決まる。要求で rest にはならない */
  assert.equal(R("idle", "rest"), "idle");
  /* 考えている間に来た attentive(入力欄の操作)は考えを止めない。答えを待つ方が優先 */
  assert.equal(R("thinking", "attentive"), "thinking");
  assert.equal(R("speaking", "attentive"), "speaking");
});

test("純粋: 視線は指す先へ向くが、瞳の中に収まる量(±1 を単位化)に丸める。中心からの距離で飽和する", () => {
  const A = loadCore();
  const g = A.core.gazeFrom;
  const rect = { left: 100, top: 100, width: 60, height: 48 };
  const c = g(130, 124, rect);
  assert.equal(c.x, 0); assert.equal(c.y, 0);
  const far = g(2000, -2000, rect);
  assert.equal(far.x, 1); assert.equal(far.y, -1);
  const near = g(160, 124, rect);
  assert.ok(near.x > 0 && near.x < 1, "近い指先は途中の量");
  assert.equal(near.y, 0);
  /* 不正な入力は中央 */
  for (const bad of [g(NaN, 1, rect), g(1, 1, null)]) { assert.equal(bad.x, 0); assert.equal(bad.y, 0); }
});

test("純粋: 視線の量は 0.05 刻みへ丸め、同じ値なら書き込まない(ポインターの毎イベントで DOM を触らない)", () => {
  const A = loadCore();
  const q = A.core.quantize;
  assert.equal(q(0.123), 0.1);
  assert.equal(q(-0.976), -1);
  assert.equal(q(0.0249), 0);
  assert.equal(q(NaN), 0);
});

test("純粋: 居場所。読み進めている間は端へ引き、戻る・終わりまで来た、で出る。小さな揺れでは変えない", () => {
  const A = loadCore();
  const P = A.core.presenceFrom;
  assert.equal(P(100, 140, false, "here"), "peek");
  assert.equal(P(140, 100, false, "peek"), "here");
  assert.equal(P(100, 104, false, "peek"), "peek", "8px 未満は据え置き");
  assert.equal(P(100, 96, false, "here"), "here");
  assert.equal(P(100, 900, true, "peek"), "here", "終わりまで来たら出る");
});

test("居場所: 起動UIは画面に居る(fixed)。読んでいる間は端へ引く(peek)。器に居場所の印がある", () => {
  assert.match(css, /\.chatbot \{\s*position: fixed;/);
  assert.doesNotMatch(css, /^body \{\s*position: relative;/m, "文書の最下部へ置くための body の一行は消す");
  assert.match(css, /\.chatbot\[data-aito-presence="peek"\] \{[^}]*translateY\(/);
  for (const html of [partialJa, partialEn]) assert.match(html, /<div class="chatbot" data-chatbot data-aito-presence="here">/);
  assert.match(src, /pointerenter/); assert.doesNotMatch(src, /scrollend/, "止まっただけでは出てこない(読んでいる間は本文を隠さない)");
});

test("JS は動きの時計を持たない(setTimeout/setInterval/requestAnimationFrame を使わない)", () => {
  assert.doesNotMatch(src, /setTimeout|setInterval|requestAnimationFrame/);
});

test("形は不変: 起動UIの図形は正本 §6 と同じ(腕は一本・各 path の d と円の座標が一致)。日英で同じ", () => {
  const spec = {
    arm: 'd="M26 30 q-5 -1 -8 1"',
    mouth: 'd="M39.5 31 q4 3.4 8 0"',
    lines: 'd="M8 29 h7 M8 33 h5"',
    eyes: ['cx="37" cy="24" r="2.5"', 'cx="50" cy="24" r="2.5"'],
    face: 'x="25" y="11" width="36" height="30" rx="9"',
    box: 'x="4" y="23" width="15" height="15" rx="3"'
  };
  for (const [name, html] of [["ja", partialJa], ["en", partialEn]]) {
    const svg = html.match(/<svg[\s\S]*?<\/svg>/)[0];
    assert.equal((svg.match(/class="aito-arm"/g) || []).length, 1, `${name}: 腕は一本`);
    for (const v of [spec.arm, spec.mouth, spec.lines, spec.face, spec.box, ...spec.eyes]) assert.ok(svg.includes(v), `${name}: ${v}`);
    assert.ok(svg.includes('class="aito-eyes"'), `${name}: 視線の層(目を包む g)がある`);
  }
  const svgJa = partialJa.match(/<svg[\s\S]*?<\/svg>/)[0].replace(/\s+/g, " ");
  const svgEn = partialEn.match(/<svg[\s\S]*?<\/svg>/)[0].replace(/\s+/g, " ");
  assert.equal(svgJa, svgEn, "日英の図形は同じ");
  /* 会話画面の静止したアイコンも同じ図形(腕は一本) */
  assert.equal((chatbot.match(/class="aito-arm"/g) || []).length, 1);
});

test("CSS: 基本の三つの動き(浮遊・まばたき・荷物)の値は正本のまま", () => {
  assert.match(css, /@keyframes aito-float \{ 0%, 100% \{ transform: translateY\(0\); \} 50% \{ transform: translateY\(-3px\); \} \}/);
  assert.match(css, /@keyframes aito-blink \{ 0%, 91%, 100% \{ transform: scaleY\(1\); \} 94% \{ transform: scaleY\(0\.12\); \} \}/);
  assert.match(css, /@keyframes aito-carry \{ 0%, 100% \{ transform: rotate\(0deg\); \} 50% \{ transform: rotate\(-3deg\) translateY\(-1px\); \} \}/);
  assert.match(css, /animation: aito-float 3\.4s/);
  assert.match(css, /animation: aito-blink 4\.6s/);
});

test("CSS: 状態の層の動きは transform と opacity だけで描く(配置を揺らす属性を使わない)", () => {
  const blocks = [...css.matchAll(/@keyframes (aito-[a-z-]+) \{([\s\S]*?)\}\s*(?=@keyframes|\/\*|\.|\[|$)/g)];
  const names = blocks.map((b) => b[1]);
  for (const need of ["aito-ponder", "aito-speak", "aito-joy", "aito-glance", "aito-wander", "aito-pulse"]) assert.ok(names.includes(need), need);
  for (const [, name, body] of blocks) {
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const p of props) assert.ok(["transform", "opacity", "d"].includes(p), `${name}: ${p} は使わない`);
  }
});

test("CSS: 状態ごとの見せ方がそろっている。休み(rest)では全部の動きを止める。視線は CSS 変数で受ける", () => {
  for (const s of ["attentive", "thinking", "speaking", "joy", "rest"]) assert.ok(css.includes(`[data-aito-state="${s}"]`), s);
  assert.match(css, /\[data-aito-state="rest"\][^{]*\{[^}]*animation-play-state: paused/);
  assert.match(css, /--aito-gx/); assert.match(css, /--aito-gy/);
  assert.match(css, /\.aito-eyes \{[^}]*transition:[^}]*transform/);
});

test("連携: 会話の部品は状態を出来事(document の aito イベント)で知らせるだけで、アイトの実装を知らない", () => {
  for (const kind of ["attentive", "thinking", "speaking", "idle", "joy"]) assert.ok(chatbot.includes(`"${kind}"`), kind);
  assert.match(chatbot, /new CustomEvent\("aito"/);
  assert.doesNotMatch(chatbot, /AitoLife/);
});

test("連携: 起動UIの span に状態の印があり、読み上げには出さない", () => {
  for (const html of [partialJa, partialEn]) {
    assert.match(html, /class="aito aito--launcher"[^>]*data-aito-state="idle"/);
    assert.match(html, /class="aito aito--launcher"[^>]*aria-hidden="true"/);
  }
});
