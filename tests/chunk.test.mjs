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

test("article は見出しでなくその境界で切る(役職が前の人へずれない)", () => {
  /* 人物カードは役職が氏名の見出しより前に置かれる。見出しで割ると
     各人の役職が一つ前の人の末尾に付き、代表をCTOと紹介する誤答になった。 */
  const chunks = chunkPage(wrap(`
    <h2>メンバー紹介</h2>
    <article><p>代表 / AIエンジニア</p><h3>柴田 昌国</h3>
      <p>元消防士として約7年従事し、独学でAI開発を習得しました。</p></article>
    <article><p>最高技術責任者（CTO）</p><h3>Y 氏</h3>
      <p>大手半導体メーカーとAIスタートアップでの経験を持っています。</p></article>
  `), PAGE);
  const shibata = chunks.find((c) => /柴田/.test(c.title));
  assert.ok(shibata, "氏名が題になっている");
  assert.match(shibata.text, /代表/);
  assert.ok(!shibata.text.includes("最高技術責任者"), "他者の役職が混ざってはいけない");
  const y = chunks.find((c) => /Y 氏/.test(c.title));
  assert.match(y.text, /最高技術責任者/);
});

/* ---- 応答に出さない記述 ---- */

test("番地から先を落とし、拠点だけを残す", () => {
  const chunks = chunkPage(wrap(
    "<dl><div><dt>所在地</dt><dd>群馬県高崎市井野町360-7 オークスアベニューD201</dd></div></dl>"), PAGE);
  assert.match(chunks[0].text, /所在地: 群馬県高崎市$/m);
  assert.ok(!chunks[0].text.includes("井野町"));
  assert.ok(!chunks[0].text.includes("オークス"));
});

test("英語側も同じ扱いにする", () => {
  const chunks = chunkPage(wrap(
    "<dl><div><dt>Registered office</dt><dd>360-7 Ino-machi, Takasaki, Gunma Oaks Avenue D201</dd></div></dl>"),
    { title: "About", url: "/en/about.html", slug: "about", pinDl: true });
  assert.match(chunks[0].text, /Takasaki, Gunma$/m);
  assert.ok(!/Ino-machi|Oaks/.test(chunks[0].text));
});

test("実サイト: 知識ベースの元となる分割に番地が残らない", () => {
  for (const file of ["about.html", "contact.html"]) {
    const html = readFileSync(join(process.cwd(), "dist", file), "utf8");
    for (const c of chunkPage(html, { title: "x", url: "/" + file, slug: "x", pinDl: true })) {
      assert.ok(!/井野町|オークス/.test(c.text), `${file}: ${c.id} に番地が残る`);
    }
  }
});

/* ---- お知らせの項目 ----
   日付とタグが見出しより前に置かれているため、見出しで割ると
   各項目が「次の項目の日付」を抱え込む。2026年8月15日の設備投資の記事が
   2025.12.05 を持っていた(実測)。誤った日付は、無いことより悪い。 */

const NEWS_HTML = `<main><ul class="news__list">
  <li class="news__item news__item--flat">
    <div class="news__meta">
      <time class="news__date" datetime="2026-08-15">2026.08.15</time>
      <span class="news__tag">設備投資</span>
    </div>
    <h3 class="news__title">データを社外に出さずにAIを学習させられる環境を整えました</h3>
    <p class="news__text">NVIDIAのGPUを搭載した開発専用のコンピュータを新しく社内に設置しました。</p>
  </li>
  <li class="news__item">
    <div class="news__meta">
      <time class="news__date" datetime="2025-12-05">2025.12.05</time>
      <span class="news__tag">登壇</span>
    </div>
    <h3 class="news__title">高崎商工会議所 第9回合同プレス発表会に登壇しました</h3>
    <p class="news__text">ShinAIの取り組みを発表しました。想いのもと歩んでいます。</p>
  </li>
</ul></main>`;

const newsChunks = () => chunkPage(NEWS_HTML,
  { title: "お知らせ", url: "https://shinai-inc.jp/news.html", slug: "news" });

test("お知らせ: 各項目が自分の日付を持つ(次の項目の日付を抱えない)", () => {
  const [first, second] = newsChunks();
  assert.ok(first.text.includes("2026.08.15"), "1件目は自分の日付を持つ");
  assert.ok(!first.text.includes("2025.12.05"), "次の項目の日付を持たない");
  assert.ok(second.text.includes("2025.12.05"), "2件目も自分の日付を持つ");
});

test("お知らせ: 見出しに現れない分類が検索の的として残る", () => {
  const [first, second] = newsChunks();
  assert.ok(first.text.includes("設備投資"), "設備投資 で引ける");
  assert.ok(second.text.includes("登壇"), "登壇 で引ける");
});

test("お知らせ: 項目ごとに1件へ切り出す", () => {
  const chunks = newsChunks();
  assert.equal(chunks.length, 2);
  assert.match(chunks[0].title, /環境を整えました/);
});

test("実サイト: お知らせの日付が記事と対応している", () => {
  const html = readFileSync(join(process.cwd(), "dist", "news.html"), "utf8");
  const chunks = chunkPage(html,
    { title: "お知らせ", url: "https://shinai-inc.jp/news.html", slug: "news" });
  const gpu = chunks.find((c) => /GPU/.test(c.text));
  assert.ok(gpu, "設備投資の記事がある");
  assert.ok(gpu.text.includes("2026.08.15"), "記事本来の日付を持つ");
  assert.ok(!gpu.text.includes("2025.12.05"), "別の記事の日付を持たない");
});
