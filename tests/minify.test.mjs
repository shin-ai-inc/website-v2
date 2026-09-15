/*
  公開物の圧縮の検証。
  node --test tests/minify.test.mjs

  ページのソースを開いたときに構造がそのまま読める状態を和らげるため、
  ビルドで生成する HTML と CSS を圧縮する。圧縮は見た目を一切変えてはならない。
  ここでは「読みにくくなる」ことより「描画が変わらない」ことを先に固定する。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collapseHtml, minifyCss } from "../_build/minify.mjs";

/* 表示される文字列の比較用。空白の並びは描画では一つの空白に畳まれる。 */
const visibleText = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/* ---- HTML ---- */

test("タグの間の改行と字下げを一つの空白に畳む", () => {
  const src = "<ul>\n  <li>一</li>\n  <li>二</li>\n</ul>";
  assert.equal(collapseHtml(src), "<ul> <li>一</li> <li>二</li> </ul>");
});

test("語と語を分ける空白は残す(描画が変わらない)", () => {
  const src = "<small>© <span>2026</span> ShinAI Inc.</small>";
  assert.equal(collapseHtml(src), src);
});

test("表示される文字列は圧縮の前後で変わらない", () => {
  const src = "<p>\n    まだ要件が決まっていなくても\n    構いません。\n  </p>\n<p>Talk to us</p>";
  assert.equal(visibleText(collapseHtml(src)), visibleText(src));
});

test("和文と和文の間の改行は改行のまま残す(空白にすると Firefox で字間が空く)", () => {
  const src = "<p>\n  急ぎの仕事、\n    誰にでも\n</p>";
  assert.equal(collapseHtml(src), "<p> 急ぎの仕事、\n誰にでも </p>");
});

test("pre・textarea・script・style の中身には触れない", () => {
  const pre = "<pre>a\n  b</pre>";
  const ta = "<textarea>一行目\n  二行目</textarea>";
  const script = '<script type="application/ld+json">{"a":\n 1}</script>';
  const style = "<style>\n.a { color: red; }\n</style>";
  for (const block of [pre, ta, script, style]) {
    assert.ok(collapseHtml(`<div>\n  ${block}\n</div>`).includes(block), `中身が変わった: ${block}`);
  }
});

test("何度かけても結果が変わらない", () => {
  const src = "<div>\n  <p>\n    本文\n  </p>\n</div>";
  assert.equal(collapseHtml(collapseHtml(src)), collapseHtml(src));
});

/* ---- CSS ---- */

test("コメントを除き、出所の表示(/*!)だけは残す", () => {
  const out = minifyCss("/*! © 2026 シンアイ株式会社 */\n/* 設計の理由 */\n.a { color: red; }");
  assert.ok(out.includes("/*! © 2026 シンアイ株式会社 */"), "出所の表示が消えた");
  assert.ok(!out.includes("設計の理由"), "説明のコメントが残っている");
});

test("括弧・区切りの前後の余白を除く", () => {
  assert.equal(minifyCss(".a , .b {\n  color : red ;\n  margin : 0 auto ;\n}\n"), ".a,.b{color:red;margin:0 auto}");
});

test("子孫を示す空白は残す(:lang(ja) :is(...) の意味を変えない)", () => {
  assert.equal(minifyCss(":lang(ja) :is(h1, h2) { word-break: auto-phrase; }"), ":lang(ja) :is(h1,h2){word-break:auto-phrase}");
});

test("calc の演算子の前後の空白は残す", () => {
  assert.equal(minifyCss(".a { width: calc(100% - 2px); }"), ".a{width:calc(100% - 2px)}");
});

test("文字列と url() の中身には触れない", () => {
  const out = minifyCss('.a::before { content: " : ; { } "; } .b { background: url("x y.png"); }');
  assert.ok(out.includes('" : ; { } "'), "文字列の中が変わった");
  assert.ok(out.includes('url("x y.png")'), "url の中が変わった");
});

test("選択子のエスケープされた引用符を文字列の始まりと取り違えない", () => {
  /* Tailwind の生成物は .after\:content-\[\'\'\] のような名前を持つ。
     引用符を文字列の始まりと読むと、その先の大半が「触れない区間」になり圧縮されない。 */
  const src = String.raw`.after\:content-\[\'\'\]:after { content : var(--x) ; }
/* 設計の理由 */
.b { color : red ; }
.c[type='button'] { color : blue ; }`;
  assert.equal(minifyCss(src), String.raw`.after\:content-\[\'\'\]:after{content:var(--x)}.b{color:red}.c[type='button']{color:blue}`);
});

test("メディアクエリの条件を壊さない", () => {
  assert.equal(
    minifyCss("@media (min-width: 641px) and (max-width: 1100px) {\n  .a { display: none; }\n}"),
    "@media (min-width:641px) and (max-width:1100px){.a{display:none}}"
  );
});

test("CSS も何度かけても結果が変わらない", () => {
  const src = "/*! x */\n.a , .b { color : red ; }\n@media (max-width: 640px) { .c { margin: 0 auto; } }";
  assert.equal(minifyCss(minifyCss(src)), minifyCss(src));
});

/* ---- ビルドの出力 ----
   圧縮をビルドから外しても表示は変わらず、誰も気づかない。出力の形で見張る。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const INDENTED = /\n[ \t]+</;

test("公開する生成HTMLに字下げが残っていない", () => {
  for (const p of ["index.html", "about.html", "services.html", "en/index.html", "dist/index.html"]) {
    assert.ok(!INDENTED.test(read(p)), `字下げが残っている: ${p}`);
  }
});

test("公開する結合CSSは圧縮され、説明のコメントを含まない", () => {
  const css = read("styles/app.css");
  assert.ok(!css.includes("\n"), "改行が残っている");
  assert.ok(!/\/\*(?!!)/.test(css), "説明のコメントが公開されている");
});

test("独立ページは公開物だけを圧縮し、出所の表示は残す", () => {
  assert.ok(INDENTED.test(read("start/index.html")), "正本まで圧縮された(編集できなくなる)");
  assert.ok(!INDENTED.test(read("dist/start/index.html")), "公開物が圧縮されていない");
  const css = read("dist/start/style.css");
  assert.ok(css.includes("/*! © 2026 シンアイ株式会社"), "出所の表示が消えた");
  assert.ok(css.includes("--shinai-origin:"), "来歴の値が消えた");
});
