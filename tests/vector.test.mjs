/*
  ベクトル層と順位融合のテスト。
  量子化で順位が壊れないこと、融合が片方の経路の取りこぼしを救うことを固定する。
*/
import test from "node:test";
import assert from "node:assert/strict";
import { encodeVector, decodeVector, cosine, normalizeVector, fuseRankings } from "../api/lib/vector.mjs";

test("normalizeVector: 長さが1になる", () => {
  const v = normalizeVector([3, 4]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-6);
});

test("normalizeVector: ゼロベクトルでもゼロ除算しない", () => {
  assert.deepEqual(normalizeVector([0, 0]), [0, 0]);
});

test("encode/decode: 往復しても値がほぼ保たれる", () => {
  const v = normalizeVector([0.5, -0.25, 0.8, -0.9, 0.1]);
  const back = decodeVector(encodeVector(v));
  v.forEach((x, i) => assert.ok(Math.abs(x - back[i]) < 0.01, `${i}: ${x} vs ${back[i]}`));
});

test("encode/decode: 量子化後も自分自身との類似度がほぼ1", () => {
  const v = normalizeVector(Array.from({ length: 512 }, (_, i) => Math.sin(i)));
  const q = decodeVector(encodeVector(v));
  assert.ok(cosine(q, q) > 0.99);
});

test("encode/decode: 量子化しても近い順が入れ替わらない", () => {
  const q = normalizeVector(Array.from({ length: 64 }, (_, i) => Math.sin(i)));
  const near = normalizeVector(q.map((x, i) => x + (i % 7) * 0.01));
  const far = normalizeVector(Array.from({ length: 64 }, (_, i) => Math.cos(i * 3)));
  const dq = decodeVector(encodeVector(q));
  assert.ok(cosine(dq, decodeVector(encodeVector(near))) > cosine(dq, decodeVector(encodeVector(far))));
});

test("cosine: 長さが違えば0を返す(壊れた索引で誤答しない)", () => {
  assert.equal(cosine(new Float32Array([1, 0]), new Float32Array([1, 0, 0])), 0);
});

test("cosine: 空でも例外を投げない", () => {
  assert.equal(cosine(null, null), 0);
});

test("fuseRankings: 両方の経路で上位のものが最上位になる", () => {
  /* a は1位と3位、b は2位と1位。両経路で安定して上位の b が勝つ。 */
  const fused = fuseRankings([["a", "b", "c"], ["b", "c", "a"]]);
  assert.equal(fused[0].id, "b");
});

test("fuseRankings: 片方だけが見つけた候補も残る(取りこぼしを救う)", () => {
  const fused = fuseRankings([["a", "b"], ["z"]]);
  assert.ok(fused.some((f) => f.id === "z"));
});

test("fuseRankings: 片方が空でももう片方の順位を保つ", () => {
  assert.deepEqual(fuseRankings([["a", "b"], []]).map((f) => f.id), ["a", "b"]);
});

test("fuseRankings: 空入力では空を返す", () => {
  assert.deepEqual(fuseRankings([]), []);
});
