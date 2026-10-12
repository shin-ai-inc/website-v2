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

test("外のサーバーから何も読み込まない(人間確認を除く)", () => {
  const files = walk(join(DIST, "logistics")).filter((f) => /\.(html|css|js)$/.test(f));
  for (const f of files) {
    const urls = readDist(f).match(/https?:\/\/[^\s"')]+/g) || [];
    const outside = urls.filter((u) => !/^https:\/\/(api\.shinai-inc\.jp|challenges\.cloudflare\.com|shinai-inc\.jp)\b/.test(u));
    assert.deepEqual(outside, [], f);
  }
});

test("重さ: 挿絵は軽い形式で、LP の公開物は合計 1MB 未満", () => {
  const files = walk(join(DIST, "logistics"));
  assert.equal(files.some((f) => f.endsWith(".png")), false, "元の 1.9MB の PNG を公開しない");
  const total = files.reduce((n, f) => n + statSync(join(DIST, f)).size, 0);
  assert.ok(total < 1024 * 1024, `合計 ${total} バイト`);
});
