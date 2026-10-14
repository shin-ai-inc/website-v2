import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GENERATED = [
  /^[^/]+\.html$/, /^en\/[^/]+\.html$/, /^js\//, /^styles\/app\.css$/, /^api\/knowledge\.(ja|en)\.json$/,
  /^(sitemap\.xml|robots\.txt|llms\.txt|site\.webmanifest)$/, /^en\/site\.webmanifest$/
];

export function verdict({ fetched, containsMain, dirty, missing = [] }) {
  if (!fetched) {
    return { ok: false, message: "最新の origin/main を取得できません。通信を確かめてから、もう一度配備してください。確かめられないまま配備すると、他の人が公開したページを消すおそれがあります。" };
  }
  if (!containsMain) {
    return { ok: false, message: "この版は最新の origin/main を含んでいません。このまま配備すると、次のコミットで公開した内容が本番から消えます。\n"
      + missing.map((c) => "  " + c).join("\n")
      + "\n`git merge origin/main`(または `git pull`)で取り込み、試験を通してから配備してください。" };
  }
  if (dirty.length) {
    return { ok: false, message: "コミットしていない変更があります。他の作業が本番に混ざらないよう、コミットするか外してから配備してください。\n"
      + dirty.map((f) => "  " + f).join("\n") };
  }
  return { ok: true, message: "配備の前の検査: 最新の origin/main を含み、未コミットの変更はありません。" };
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function inspect() {
  let fetched = true;
  try { git("fetch", "--quiet", "origin", "main"); } catch { fetched = false; }
  if (!fetched) return { fetched, containsMain: false, dirty: [] };
  let containsMain = true;
  try { git("merge-base", "--is-ancestor", "origin/main", "HEAD"); } catch { containsMain = false; }
  const missing = containsMain ? [] : git("log", "--oneline", "HEAD..origin/main").split("\n").filter(Boolean);
  const dirty = git("status", "--porcelain", "--untracked-files=no").split("\n").filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, ""))
    .filter((f) => !GENERATED.some((re) => re.test(f)));
  return { fetched, containsMain, dirty, missing };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const v = verdict(inspect());
  (v.ok ? console.log : console.error)(v.message);
  process.exit(v.ok ? 0 : 1);
}
