/* 配備の前の検査(tools/predeploy-check.mjs)。2026-10-14、古い枝から配備して本番の /hana/ を消した。
   配備は「最新の origin/main を含む、コミット済みの状態」からだけ行う。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verdict } from "../tools/predeploy-check.mjs";

test("最新の main を含んでいれば通す", () => {
  assert.equal(verdict({ fetched: true, containsMain: true, dirty: [] }).ok, true);
});

test("main に無いコミットを含んでいても、main を含んでいれば通す(配備してから main へ入れる場合)", () => {
  assert.equal(verdict({ fetched: true, containsMain: true, dirty: [], ahead: 2 }).ok, true);
});

test("最新の main を含まなければ止め、足りないコミットを示す", () => {
  const v = verdict({ fetched: true, containsMain: false, dirty: [], missing: ["e476300 LP 華: …"] });
  assert.equal(v.ok, false);
  assert.match(v.message, /e476300/);
  assert.match(v.message, /git merge origin\/main|git pull/);
});

test("最新の main を取れなければ止める(確かめられないまま配備しない)", () => {
  const v = verdict({ fetched: false, containsMain: false, dirty: [] });
  assert.equal(v.ok, false);
  assert.match(v.message, /取得できません/);
});

test("コミットしていない元のファイルがあれば止める(他のセッションの作業を混ぜない)", () => {
  const v = verdict({ fetched: true, containsMain: true, dirty: ["about.html"] });
  assert.equal(v.ok, false);
  assert.match(v.message, /about\.html/);
});

test("wrangler deploy の前に、検査と組み立てを必ず走らせる", () => {
  const conf = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(conf, /"command":\s*"node tools\/predeploy-check\.mjs && node _build\/build\.mjs"/);
});
