/* dist/(Cloudflare Workers が配信するもの)を全件たどり、公開してよい形だけであることを確かめる。
   dist は git ではなく作業中のフォルダーから組み立てるので、未追跡の下書き・.map・.md も
   そのまま公開されうる(2026-10-10 のセキュリティ点検)。publish.test は git の追跡分しか見ない。
   先に node _build/build.mjs を流すこと。 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const ALLOWED_PATH = [
  /^[^/]+\.html$/,
  /^en\/[^/]+\.html$/,
  /^(start|lp|ai-business|dental-copilot)\//,
  /^assets\//,
  /^js\//,
  /^styles\/app\.css$/,
  /^(robots\.txt|llms\.txt|sitemap\.xml|site\.webmanifest|favicon\.ico|_headers|_redirects)$/,
  /^en\/site\.webmanifest$/,
  /^\.well-known\/security\.txt$/,
];
const ALLOWED_EXT = new Set([".html", ".css", ".js", ".svg", ".png", ".webp", ".jpg", ".ico", ".txt", ".xml", ".webmanifest", ".woff2"]);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(relative(DIST, p).replaceAll("\\", "/"));
  }
  return out;
}

test("dist は組み立て済み", () => {
  assert.ok(existsSync(join(DIST, "index.html")), "node _build/build.mjs を先に流す");
});

test("dist の全ファイルが公開許可の経路と拡張子に当たる", () => {
  const files = walk(DIST);
  assert.ok(files.length > 50, "dist が読めている");
  const badPath = files.filter((f) => !ALLOWED_PATH.some((re) => re.test(f)));
  const badExt = files.filter((f) => {
    if (/^_(headers|redirects)$/.test(f)) return false;
    const ext = f.slice(f.lastIndexOf("."));
    return !ALLOWED_EXT.has(ext) || /\.(map|md|mjs|toml|sql|env)$/.test(f) || /(^|\/)\.env/.test(f);
  });
  assert.deepEqual(badPath, [], "公開許可の経路に無いものが dist にある");
  assert.deepEqual(badExt, [], "公開してはいけない型のファイルが dist にある");
  const dotted = files.filter((f) => f.split("/").some((s) => s.startsWith(".")) && f !== ".well-known/security.txt");
  assert.deepEqual(dotted, [], "ドットで始まる経路は security.txt 以外を置かない");
});

test("サイトマップの全 URL が dist にある(ディレクトリ形式は index.html)", () => {
  const urls = [...readFileSync(join(DIST, "sitemap.xml"), "utf8").matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.ok(urls.length > 10);
  const missing = urls.filter((u) => {
    let p = u.replace("https://shinai-inc.jp/", "");
    if (p === "" || p.endsWith("/")) p += "index.html";
    return !existsSync(join(DIST, p));
  });
  assert.deepEqual(missing, [], "サイトマップにあるのに dist に無い");
});

test("ディレクトリ形式の URL は _redirects で index.html に写す(html_handling none のため)", () => {
  const rules = readFileSync(join(DIST, "_redirects"), "utf8").split("\n").filter(Boolean);
  for (const dir of ["/", "/en/", "/start/", "/ai-business/", "/dental-copilot/", "/lp/"]) {
    assert.ok(rules.includes(`${dir} ${dir}index.html 200`), `${dir} の内部書き換えが無い`);
    if (dir !== "/") assert.ok(rules.includes(`${dir.slice(0, -1)} ${dir} 301`), `${dir} の末尾スラッシュ無しの転送が無い`);
  }
  const hostLevel = rules.filter((r) => /^https?:\/\//.test(r));
  assert.deepEqual(hostLevel, [], "ホスト名をまたぐ転送は _redirects では効かない(区域の転送規則で行う)");
});

test("_headers は CSP を差し込み済みで、/start/ は自分の CSP に置き換える", () => {
  const h = readFileSync(join(DIST, "_headers"), "utf8");
  assert.ok(!h.includes("{{"), "差し込みの印が残っている");
  assert.ok(/^\/start\/\*\n(?:.*\n)*?\s*! Content-Security-Policy\n(?:.*\n)*?\s*Content-Security-Policy: .*connect\.facebook\.net/m.test(h), "/start/ の CSP の置き換えが無い");
  assert.ok(!/^\/en\/\*\.html/m.test(h), "/*.html はスラッシュもまたぐので /en/*.html の規則は要らない");
});

test("404 のページがあり、検索に載せず、外部の台本を読まない", () => {
  const p = join(DIST, "404.html");
  assert.ok(existsSync(p));
  const html = readFileSync(p, "utf8");
  assert.ok(/<meta name="robots" content="noindex/.test(html));
  assert.ok(!/<script/.test(html));
  assert.ok(statSync(p).size < 20_000);
});
