/*
  公開HTMLの組版契約の検証。
  node --test tests/*.test.mjs で実行(依存なし・Node標準のテストランナー)。

  CSSには「暗い地に置くことを前提に、白で描く」部品がある。
  明るいセクションへ置くと、白文字が白地に載って読めなくなる。
  ビルドは通り、リンクも壊れず、構造化データも正しいままなので、
  実際に目で見るまで誰も気づかない(実際に気づかなかった)。
  部品と地の組み合わせだけを、ここで機械的に押さえる。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = (...p) => join(ROOT, "dist", ...p);

const readDist = (rel) => {
  const path = dist(rel);
  if (!existsSync(path)) {
    throw new Error(`${rel} が未生成。先に node _build/build.mjs を実行する。`);
  }
  return readFileSync(path, "utf8");
};

/** dist に出力された全HTML(日本語・英語)。 */
const allPages = () => {
  const out = [];
  for (const dir of ["", "en"]) {
    const base = dist(dir);
    if (!existsSync(base)) continue;
    for (const f of readdirSync(base)) {
      if (f.endsWith(".html")) out.push(dir ? `${dir}/${f}` : f);
    }
  }
  return out;
};

/* 暗い地を前提に白で描く部品。styles/sections/<名前>.css が
   `color: #FFFFFF` または白の rgba を地の指定なしで持つものが該当する。
   部品を足したときは、その CSS が白を使うかを確かめてここへ加える。 */
const DARK_ONLY = ["capability", "frontier"];

/** <section ...> の開きタグを、その中身とともに取り出す。 */
const sectionsOf = (html) => {
  const out = [];
  const re = /<section\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const close = html.indexOf("</section>", m.index);
    out.push({ attrs: m[1], body: html.slice(m.index, close === -1 ? undefined : close) });
  }
  return out;
};

test("暗地専用の部品は section--ink の中にしか置かれない", () => {
  /* 白文字の部品を明るい地へ置くと読めなくなる。
     ビルドもテストも通り、目視でしか分からないため、ここで固定する。 */
  for (const page of allPages()) {
    const html = readDist(page);
    for (const sec of sectionsOf(html)) {
      for (const comp of DARK_ONLY) {
        const used = new RegExp(`class="[^"]*\\b${comp}__`).test(sec.body);
        if (!used) continue;
        assert.match(
          sec.attrs, /section--ink/,
          `${page}: ${comp} が暗地でないセクションにある → ${sec.attrs.trim()}`
        );
      }
    }
  }
});

test("暗地専用の部品を挙げた一覧が、CSSの実態と合っている", () => {
  /* CSS 側で白を使い始めた部品が一覧から漏れると、上の検査が素通りする。
     漏れは静かで、症状は「そのページだけ読めない」としてしか現れない。

     判別は「白で描くか」ではなく「自前の地を持たずに白で描くか」で行う。
     チップ・アイコン・ボタンは自分の地(グラデや塗り)の上に白を置くので、
     明るいセクションでも読める。地を持たずに白を置く部品だけが、
     セクションの地が暗いことに依存している。 */
  const dir = join(ROOT, "styles", "sections");
  const WHITE = /color:\s*(#FFFFFF|#fff\b|rgba\(255,\s*255,\s*255)/i;
  /* 常に暗い面にしか現れない部品は、地との組み合わせを選べないので対象外。 */
  const ALWAYS_DARK = new Set(["footer", "chatbot", "cta", "header", "hero", "creed"]);
  const found = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".css")) continue;
    const name = f.replace(/\.css$/, "");
    if (ALWAYS_DARK.has(name)) continue;
    const css = readFileSync(join(dir, f), "utf8");
    for (const [, , body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (WHITE.test(body) && !/background/i.test(body)) { found.push(name); break; }
    }
  }
  assert.deepEqual(
    found.sort(), [...DARK_ONLY].sort(),
    "地を持たずに白で描く部品が増減している。DARK_ONLY を更新するか、CSSの前提を確認する"
  );
});

test("各ページの見出し階層が h1 から始まり、1本だけである", () => {
  for (const page of allPages()) {
    const html = readDist(page);
    const h1 = (html.match(/<h1\b/g) || []).length;
    assert.equal(h1, 1, `${page}: h1 が ${h1} 本`);
  }
});

test("本文の画像は寸法を持ち、遅延読み込みされる", () => {
  /* 寸法が無いと読み込み中に版がずれる(CLS)。 */
  for (const page of allPages()) {
    const html = readDist(page);
    for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(tag, /width="\d+"/, `${page}: width がない → ${tag}`);
      assert.match(tag, /height="\d+"/, `${page}: height がない → ${tag}`);
      assert.match(tag, /loading="lazy"/, `${page}: loading がない → ${tag}`);
    }
  }
});
