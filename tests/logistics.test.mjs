/* 運送業の日報の LP(/logistics/)。広告から URL を直接渡す独立ページで、ホームページからはつながない。
   会社のドメインの下だけで公開する(別のアドレスの LP は作らない)。申し込みは LP の中で完結し、
   会社サイトと同じ問い合わせの窓口へ送る。先に `node _build/build.mjs` で dist を作ること。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readDist = (p) => readFileSync(join(DIST, p), "utf8");

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [relative(DIST, p).replaceAll("\\", "/")];
  });
}

test("dist に LP があり、検索に載せない印を持つ", () => {
  assert.ok(existsSync(join(DIST, "logistics", "index.html")));
  assert.match(readDist("logistics/index.html"), /<meta name="robots" content="noindex,nofollow">/);
});

test("サイトマップにも llms.txt にも載せない", () => {
  assert.doesNotMatch(readDist("sitemap.xml"), /logistics/);
  assert.doesNotMatch(readDist("llms.txt"), /logistics/);
});

test("ホームページのどのページからもつながない(広告から直接渡す)", () => {
  const linking = walk(DIST)
    .filter((f) => f.endsWith(".html") && !f.startsWith("logistics/"))
    .filter((f) => /logistics/.test(readDist(f)));
  assert.deepEqual(linking, []);
});

test("末尾のスラッシュの有無にかかわらず開ける", () => {
  const rules = readDist("_redirects").split("\n");
  assert.ok(rules.includes("/logistics/ /logistics/index.html 200"));
  assert.ok(rules.includes("/logistics /logistics/ 301"));
});

test("申し込みは会社サイトと同じ問い合わせの窓口へ送り、人間確認の鍵は本体と同じ", () => {
  const lp = read("logistics/config.js");
  assert.match(lp, /endpoint: 'https:\/\/api\.shinai-inc\.jp\/api\/contact'/);
  assert.match(lp, /privacyUrl: '\/privacy\.html'/);
  const key = lp.match(/turnstileSiteKey: '([^']*)'/);
  const main = read("scripts/config.js").match(/turnstileSiteKey:\s*"([^"]*)"/);
  assert.ok(key && main);
  assert.equal(key[1], main[1]);
});

test("ページの CSP は、自分の資産・人間確認・問い合わせの窓口だけを許す", () => {
  const csp = readDist("logistics/index.html").match(/http-equiv="Content-Security-Policy" content="([^"]*)"/);
  assert.ok(csp, "CSP が無い");
  for (const part of ["default-src 'none'", "script-src 'self' https://challenges.cloudflare.com",
                      "frame-src https://challenges.cloudflare.com", "connect-src https://api.shinai-inc.jp", "form-action 'none'"]) {
    assert.ok(csp[1].includes(part), part);
  }
  assert.doesNotMatch(readDist("logistics/index.html"), /<script>|\son[a-z]+="/, "ページの中にスクリプトや on 属性を書かない");
});

test("外のサーバーから読み込むのは、人間確認と Meta Pixel(柴田 2026-10-12 承認)だけ", () => {
  const files = walk(join(DIST, "logistics")).filter((f) => /\.(html|css|js)$/.test(f));
  for (const f of files) {
    const urls = readDist(f).match(/https?:\/\/[^\s"')]+/g) || [];
    const outside = urls.filter((u) => !/^https:\/\/(api\.shinai-inc\.jp|challenges\.cloudflare\.com|shinai-inc\.jp|connect\.facebook\.net|www\.facebook\.com)\b/.test(u));
    assert.deepEqual(outside, [], f);
  }
});

test("重さ: 挿絵は軽い形式で、LP の公開物は合計 1MB 未満", () => {
  const files = walk(join(DIST, "logistics"));
  assert.equal(files.some((f) => f.endsWith(".png")), false, "元の 1.9MB の PNG を公開しない");
  const total = files.reduce((n, f) => n + statSync(join(DIST, f)).size, 0);
  assert.ok(total < 1024 * 1024, `合計 ${total} バイト`);
});

/* ---- 2026-10-12 柴田の判断: 相談の時間は会社サイトに合わせる・言い過ぎを直す・案内の欄を外す・Meta Pixel ---- */

test("相談の時間は会社サイトと同じ「30〜60分」で、「20分」を残さない", () => {
  const lp = read("logistics/index.html") + read("logistics/app.js");
  assert.doesNotMatch(lp, /20分/);
  assert.match(read("logistics/index.html"), /30〜60分/);
});

test("運送業での実績を装う言い回しを使わない(運送業の取引先・実績はまだ無い)", () => {
  const html = read("logistics/index.html");
  for (const phrase of ["運送業の現場に合わせて、使い続けられる", "運送業の現場と経営、両方の視点", "よく聞かれること"]) {
    assert.equal(html.includes(phrase), false, phrase);
  }
});

test("事例・イベントの案内の欄を置かない(送る案内がまだ無い)", () => {
  for (const f of ["logistics/index.html", "logistics/app.js"]) {
    assert.doesNotMatch(read(f), /updatesOptIn|事例・イベント/, f);
  }
});

test("Meta Pixel: 計測のファイルは /start/ と同一(番号と設定を一か所で保つ)で、アプリより先に一度だけ読む", () => {
  assert.equal(read("logistics/measure.js"), read("start/measure.js"));
  const html = read("logistics/index.html");
  assert.equal((html.match(/src="measure\.js"/g) || []).length, 1);
  assert.ok(html.indexOf('src="measure.js"') < html.indexOf('src="app.js"'));
  assert.match(html, /<noscript><img[^>]+facebook\.com\/tr\?id=1060030986770128&amp;ev=PageView&amp;noscript=1/);
});

test("Meta Pixel: CSP は Meta の読み込み先と送信先だけを足す", () => {
  const csp = readDist("logistics/index.html").match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
  assert.match(csp, /script-src 'self' https:\/\/challenges\.cloudflare\.com https:\/\/connect\.facebook\.net;/);
  assert.match(csp, /img-src 'self' https:\/\/www\.facebook\.com;/);
  assert.match(csp, /connect-src https:\/\/api\.shinai-inc\.jp https:\/\/www\.facebook\.com;/);
});

test("本番の見出しでも、/logistics/ は全体の CSP を外して自分の CSP に置き換える(全体の CSP は Meta を止める)", () => {
  const h = readDist("_headers");
  const block = h.split(/\n(?=\/)/).find((b) => b.startsWith("/logistics/*"));
  assert.ok(block, "/logistics/* の規則が無い");
  assert.match(block, /! Content-Security-Policy/);
  assert.match(block, /Content-Security-Policy: .*connect\.facebook\.net.*frame-ancestors 'none'/);
});

test("Lead は申し込みが受け付けられたときだけ、入力内容を載せずに送る", () => {
  const js = read("logistics/app.js");
  const calls = js.match(/fbq\(/g) || [];
  assert.equal(calls.length, 1, "Pixel を呼ぶのは Lead の一か所だけ");
  assert.match(js.replace(/\s+/g, ""), /window\.fbq\('track','Lead',\{\},\{eventID:leadEventId\(\)\}\)/, "中身は空で、イベントの番号だけを添える");
  const success = js.indexOf("result.success !== true");
  const call = js.indexOf("trackLead();");
  assert.ok(success !== -1 && call > success, "成功の判定の後で送る");
  assert.equal((js.match(/trackLead\(\);/g) || []).length, 1, "送るのは成功の分岐の一か所だけ");
});
