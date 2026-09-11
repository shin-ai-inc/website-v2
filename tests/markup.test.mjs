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

/* PNG の IHDR から寸法と色種別を読む。依存を足さずに実体を確かめる。 */
const pngHead = (rel) => {
  const b = readFileSync(join(ROOT, rel));
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${rel} が PNG でない`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
};

/* ICO のディレクトリから収録寸法を読む。幅0は256を意味する。 */
const icoSizes = (rel) => {
  const b = readFileSync(join(ROOT, rel));
  const n = b.readUInt16LE(4);
  return Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((a, x) => a - x);
};

test("アイコンの宣言と実体の寸法が一致する", () => {
  /* sizes 属性や manifest の値は宣言でしかない。実体とずれても画面は出るため
     目視では気づけない。ブラウザは宣言を信じて選ぶので、ずれると小さい画像を
     引き伸ばして表示することになる。 */
  const html = readDist("index.html");
  const declared = [...html.matchAll(/<link rel="icon" href="([^"?]+)[^"]*"[^>]*sizes="(\d+)x\d+"/g)];
  assert.ok(declared.length > 0, "HTMLにサイズ付きのアイコン宣言がない");
  for (const [, href, size] of declared) {
    const { w, h } = pngHead(href);
    assert.equal(`${w}x${h}`, `${size}x${size}`, `${href} の実体が宣言と違う`);
  }

  const manifest = JSON.parse(readFileSync(join(ROOT, "site.webmanifest"), "utf8"));
  for (const icon of manifest.icons) {
    const { w, h } = pngHead(icon.src);
    assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} の実体が manifest と違う`);
  }
});

test("favicon.ico が Google の推奨する寸法を収めている", () => {
  /* 検索結果のアイコンは 48px を基準に選ばれる。48が無いと別の寸法から
     引き伸ばされ、輪郭が甘くなる。 */
  const sizes = icoSizes("favicon.ico");
  for (const want of [16, 32, 48]) {
    assert.ok(sizes.includes(want), `favicon.ico に ${want}px がない: ${sizes}`);
  }
});

test("ホーム画面用アイコンは透過を持たない", () => {
  /* iOS は透過部分を黒で塗る。透過のまま渡すと、ホーム画面で四隅が黒くなる。
     PNG の色種別 2 は RGB(透過なし)、6 は RGBA。 */
  const { colorType } = pngHead("assets/icons/apple-touch-icon.png");
  assert.equal(colorType, 2, `apple-touch-icon が透過を持っている(色種別 ${colorType})`);
});

/* ---- 和文の途中の改行が空白として描かれない ---- */
test("生成したページの本文に、和文どうしの間の改行が残っていない", () => {
  /* 原稿を文の途中で改行すると、ブラウザは空白として描く(「判断を、 誰もが」)。
     build.mjs の joinCjkBreaks が本文から除く。2026-09-12 時点で 6 ページ 33 か所あった。 */
  const CJK = "[\u3000-\u303F\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]";
  const re = new RegExp(`${CJK}[ \t]*\r?\n\s*${CJK}`);
  for (const page of ["index.html", "services.html", "about.html", "gunma-ai.html", "privacy.html", "terms.html"]) {
    const html = readFileSync(join(ROOT, page), "utf8").replace(/<(script|style|pre)[\s\S]*?<\/\1>/g, "");
    const hit = html.split(/<[^>]+>/).find((text) => re.test(text));
    assert.equal(hit, undefined, `${page}: 和文の途中に改行が残っている: ${hit && hit.trim().slice(0, 30)}`);
  }
});

