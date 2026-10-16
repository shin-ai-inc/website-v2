/*
  映像の範囲指定(Range)の検証。
  node --test tests/media.test.mjs

  Workers の静的配信は Range を扱わず、常に全体を 200 で返す(2026-10-17 実測)。
  その結果、Chrome では再生中に途中へ飛べず、iPhone の Safari は映像を再生しない
  (Safari は映像に 206 の部分応答を求める)。映像の置き場所だけ Worker を先に通し、
  範囲で切り出して返す。ほかの経路は静的配信のまま(無料枠の数え方を変えない)。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRange, serveMedia } from "../worker/media.mjs";

/* ---- 範囲の読み取り ---- */

test("先頭からの範囲・末尾までの範囲・末尾の n バイトを読む", () => {
  assert.deepEqual(parseRange("bytes=0-1", 10), { start: 0, end: 1 });
  assert.deepEqual(parseRange("bytes=4-", 10), { start: 4, end: 9 });
  assert.deepEqual(parseRange("bytes=-3", 10), { start: 7, end: 9 });
});

test("境界: 終わりが大きすぎれば末尾に丸める。末尾の n が全体より大きければ全体", () => {
  assert.deepEqual(parseRange("bytes=8-99", 10), { start: 8, end: 9 });
  assert.deepEqual(parseRange("bytes=-99", 10), { start: 0, end: 9 });
});

test("満たせない範囲は 'unsatisfiable'", () => {
  assert.equal(parseRange("bytes=10-", 10), "unsatisfiable");
  assert.equal(parseRange("bytes=5-3", 10), "unsatisfiable");
  assert.equal(parseRange("bytes=-0", 10), "unsatisfiable");
});

test("読めない形・複数の範囲は null(全体を返す。仕様上それでよい)", () => {
  for (const h of [undefined, "", "bytes=", "items=0-1", "bytes=0-1,4-5", "bytes=a-b"]) {
    assert.equal(parseRange(h, 10), null, `「${h}」`);
  }
});

/* ---- 応答 ---- */

const BODY = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
const assets = (status = 200) => ({
  fetch: async () => new Response(status === 200 ? BODY : "not found", {
    status, headers: { "Content-Type": "video/mp4", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600" }
  })
});
const req = (headers = {}, path = "/studio-mark/assets/kiriko.mp4", method = "GET") =>
  new Request(`https://shinai-inc.jp${path}`, { method, headers });

test("範囲の指定があれば 206 で切り出し、Content-Range を付ける", async () => {
  const res = await serveMedia(req({ Range: "bytes=2-4" }), assets());
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Range"), "bytes 2-4/10");
  assert.equal(res.headers.get("Content-Length"), "3");
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [2, 3, 4]);
});

test("範囲の指定が無ければ 200 で全体を返し、範囲を受け付けることを示す", async () => {
  const res = await serveMedia(req(), assets());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Accept-Ranges"), "bytes");
  assert.equal((await res.arrayBuffer()).byteLength, 10);
});

test("元の応答の安全のための見出し(型・nosniff・キャッシュ)を保つ", async () => {
  const res = await serveMedia(req({ Range: "bytes=0-0" }), assets());
  assert.equal(res.headers.get("Content-Type"), "video/mp4");
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=3600");
});

test("満たせない範囲は 416 と全体の大きさを返す", async () => {
  const res = await serveMedia(req({ Range: "bytes=50-" }), assets());
  assert.equal(res.status, 416);
  assert.equal(res.headers.get("Content-Range"), "bytes */10");
});

test("映像でないもの・見つからないものは、静的配信の応答をそのまま返す", async () => {
  const img = await serveMedia(req({ Range: "bytes=0-1" }, "/studio-mark/assets/image-2.jpg"), assets());
  assert.equal(img.status, 200, "画像は切り出さない");
  const missing = await serveMedia(req({ Range: "bytes=0-1" }), assets(404));
  assert.equal(missing.status, 404);
});

test("HEAD には本文を付けず、大きさと範囲の受け付けを示す", async () => {
  const res = await serveMedia(req({}, "/studio-mark/assets/kiriko.mp4", "HEAD"), assets());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Accept-Ranges"), "bytes");
  assert.equal(res.body, null);
});

/* ---- 配信の設定 ---- */

test("Worker を先に通すのは映像の置き場所だけ。ほかは静的配信のまま", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""));
  assert.equal(config.main, "worker/media.mjs");
  assert.deepEqual(config.assets.run_worker_first, ["/studio-mark/assets/*"]);
  assert.equal(config.assets.binding, "ASSETS");
});
