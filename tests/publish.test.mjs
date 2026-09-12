/*
  公開範囲の検証。
  node --test tests/publish.test.mjs

  GitHub Pages はリポジトリの根をそのまま配信する。_config.yml の exclude に
  漏れたものは、そのまま https://shinai-inc.jp/<パス> で読める。
  2026-09-11 に api/index.mjs・api/lib/guard.mjs・api/wrangler.toml・tests/ が
  本番で 200 を返していた。鍵は含まないが、防御ロジックと内部識別子の露出。

  「公開してよいもの」を PUBLIC に列挙し、git が追跡する全ファイルについて
  「Jekyll が配信するか」と「公開してよいか」が一致することを確かめる。
  追跡ファイルが増えたとき、_config.yml を直し忘れるとここで落ちる。
  逆に、公開すべきものを誤って除外してもここで落ちる。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/* 公開してよいもの。ここに無いものは配信されてはならない。 */
const PUBLIC = [
  /^[^/]+\.html$/,
  /^en\/[^/]+\.html$/,
  /^en\/site\.webmanifest$/,
  /^(start|lp|ai-business)\//,
  /^assets\//,
  /^scripts\//,
  /^styles\/app\.css$/,
  /^(robots\.txt|llms\.txt|sitemap\.xml|site\.webmanifest|favicon\.ico|CNAME)$/,
  /^\.well-known\/security\.txt$/
];

/* _config.yml の解釈。YAMLパーサを入れずに、この設定の形(キー: の下に "- 値" が並ぶ)
   だけを行単位で読む。正規表現の逆斜線は環境をまたぐと化けるため使わない。 */
function jekyllRules() {
  const rules = { include: [], exclude: [] };
  let current = null;
  for (const raw of read("_config.yml").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line === "include:" || line === "exclude:") { current = line.slice(0, -1); continue; }
    if (line.startsWith("- ") && current) { rules[current].push(line.slice(2).trim()); continue; }
    current = null;
  }
  return rules;
}

/* Jekyll(3.x, GitHub Pages) が配信するか。
   - exclude に一致(同名、またはその配下)すれば配信しない
   - 先頭が _ か . の要素を含むパスは既定で配信しない(include で戻したものを除く) */
function served(path, rules) {
  const hit = (list) => list.some((e) => path === e || path.startsWith(e.replace(/\/$/, "") + "/"));
  if (hit(rules.exclude)) return false;
  const hidden = path.split("/").some((seg) => /^[_.]/.test(seg));
  if (hidden && !hit(rules.include)) return false;
  return true;
}

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean);

test("git が追跡する全ファイルで、配信の有無と公開可否が一致する", () => {
  const rules = jekyllRules();
  assert.ok(tracked.length > 50, "追跡ファイルが読めている");
  const leaked = tracked.filter((p) => served(p, rules) && !PUBLIC.some((re) => re.test(p)));
  const hidden = tracked.filter((p) => !served(p, rules) && PUBLIC.some((re) => re.test(p)));
  assert.deepEqual(leaked, [], "公開してはいけないのに配信されるもの");
  assert.deepEqual(hidden, [], "公開すべきなのに除外されているもの");
});

test("サーバー側の実装・検証・生成元は配信されない", () => {
  const rules = jekyllRules();
  for (const p of ["api/index.mjs", "api/lib/guard.mjs", "api/wrangler.toml", "api/schema.sql",
                   "tests/seo.test.mjs", "tools/check_overflow.py", "_build/build.mjs",
                   "partials/_footer.html", "deploy/_headers", "netlify.toml", "README.md"]) {
    assert.equal(served(p, rules), false, `${p} は配信されない`);
  }
});

test("security.txt(RFC 9116) は配信される", () => {
  assert.equal(served(".well-known/security.txt", jekyllRules()), true);
});
