/*
  分割器のテスト。チャンク品質が検索精度の上限を決めるため、
  構造(FAQの1問1答・定義リストの項目対応)が保たれることを固定する。
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chunkPage } from "../_build/chunk.mjs";

const PAGE = { title: "会社情報", url: "/about.html", slug: "about", pinDl: true };
const wrap = (inner) => `<html><body><main>${inner}</main></body></html>`;

test("FAQ: details ごとに1件へ切り出し、質問文を題にする", () => {
  const chunks = chunkPage(wrap(`
    <details><summary><span>費用はどのくらいかかりますか。</span></summary>
      <div>内容により異なります。まずは無料相談で範囲を確認いたします。</div></details>
    <details><summary><span>どのくらいの期間がかかりますか。</span></summary>
      <div>小さく試す場合はおよそ一か月から二か月が目安です。</div></details>
  `), { title: "よくあるご質問", url: "/faq.html", slug: "faq" });
  assert.equal(chunks.length, 2);
  assert.match(chunks[0].title, /費用はどのくらいかかりますか/);
  assert.match(chunks[0].text, /無料相談/);
  assert.ok(!chunks[0].text.includes("期間"), "別の問答が混ざってはいけない");
});

test("定義リスト: 項目名と値の対応を行として保つ", () => {
  const chunks = chunkPage(wrap(`
    <dl><div><dt>商号</dt><dd>シンアイ株式会社（ShinAI）</dd></div>
        <div><dt>代表</dt><dd>柴田 昌国</dd></div>
        <div><dt>所在地</dt><dd>群馬県高崎市井野町</dd></div></dl>
  `), PAGE);
  const fact = chunks.find((c) => /会社概要/.test(c.title));
  assert.match(fact.text, /商号: シンアイ株式会社（ShinAI）/);
  assert.match(fact.text, /代表: 柴田 昌国/);
});

test("定義リスト: pinDl 指定のページでは常時同梱の印が付く", () => {
  const chunks = chunkPage(wrap("<dl><div><dt>商号</dt><dd>シンアイ株式会社（ShinAI）です</dd></div></dl>"), PAGE);
  assert.equal(chunks[0].pin, true);
});

test("見出し: h2/h3 ごとに区切り、見出しを題に含める", () => {
  const chunks = chunkPage(wrap(`
    <h2>暗黙知の解消支援</h2><p>ベテランにしか分からない判断を、誰もが引き出せる状態にします。</p>
    <h2>企業専用AIエージェント開発</h2><p>社内知識と既存システムをつなぎ、業務を実行するAIをつくります。</p>
  `), { title: "ソリューション", url: "/services.html", slug: "svc" });
  assert.equal(chunks.length, 2);
  assert.match(chunks[0].title, /暗黙知の解消支援/);
  assert.ok(!chunks[0].text.includes("エージェント"), "次節が混ざってはいけない");
});

test("main が無いページは何も返さない", () => {
  assert.deepEqual(chunkPage("<html><body><p>外側</p></body></html>", PAGE), []);
});

test("短すぎる断片は捨てる(見出しの残骸を根拠にしない)", () => {
  assert.deepEqual(chunkPage(wrap("<h2>目次</h2><p>一覧</p>"), PAGE), []);
});

test("script と svg の中身は本文に混ざらない", () => {
  const chunks = chunkPage(wrap(`
    <h2>会社の方針</h2><script>var secret="漏れてはいけない値";</script>
    <svg><title>装飾</title></svg><p>誠実な技術で価値を届けることを方針としています。</p>
  `), PAGE);
  assert.ok(!chunks[0].text.includes("secret"));
  assert.ok(!chunks[0].text.includes("装飾"));
  assert.match(chunks[0].text, /誠実な技術/);
});

test("実サイト: 商号と代表者が同一チャンクに揃う", () => {
  const html = readFileSync(join(process.cwd(), "dist", "about.html"), "utf8");
  const chunks = chunkPage(html, PAGE);
  const fact = chunks.find((c) => /商号/.test(c.text));
  assert.ok(fact, "会社概要のチャンクが存在すること");
  assert.match(fact.text, /シンアイ株式会社/);
  assert.match(fact.text, /柴田/);
  assert.equal(fact.pin, true);
});

test("実サイト: FAQ が問答ごとに分かれる", () => {
  const html = readFileSync(join(process.cwd(), "dist", "faq.html"), "utf8");
  const chunks = chunkPage(html, { title: "よくあるご質問", url: "/faq.html", slug: "faq" });
  assert.ok(chunks.length >= 20, `問答が個別に切れていること(実際:${chunks.length})`);
});

test("実サイト: どのチャンクも過大にならない(埋もれの再発防止)", () => {
  const html = readFileSync(join(process.cwd(), "dist", "about.html"), "utf8");
  for (const c of chunkPage(html, PAGE)) {
    assert.ok(c.text.length <= 1200, `${c.title} が ${c.text.length}字と長すぎる`);
  }
});
