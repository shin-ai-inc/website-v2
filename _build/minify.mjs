/*
  公開物の圧縮（外部ライブラリなし）。build.mjs が書き出す HTML と CSS にかける。

  目的: ページのソースを開いたときに、構造と設計がそのまま読める状態を和らげる。
  これは暗号化ではない。ブラウザが描画するには HTML と CSS を必ず受け取るため、
  隠すことはできず、読みにくくすることしかできない（柴田指示 2026-09-15）。

  守ること: 描画を一切変えない。
  - HTML は改行と字下げを「一つの空白」に畳むだけ。空白を消さない
    （語と語、要素と要素の間の空白は描画に効くため）。
  - CSS は余白を除くが、意味を持つ空白は残す。
    ・子孫を示す空白（:lang(ja) :is(...)）
    ・calc の演算子の前後
    ・文字列と url() の中身
  - JavaScript は対象にしない。文字列・正規表現・改行による文の区切りを
    構文解析なしに安全に詰める方法がないため。
*/

/* ---- HTML ---- */

/* 中身の空白に意味がある要素。ここには触れない */
const RAW_BLOCK = /<(pre|textarea|script|style)\b[\s\S]*?<\/\1>/gi;

/* 和文(かな・漢字・全角記号)に挟まれた改行は、ブラウザにより描画が違う。
   Chrome は空白として描き、Firefox は詰めて描く。空白に置き換えると
   Firefox で字間が空くため、そこだけ改行一つに畳む。 */
const WIDE = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const isWide = (ch) => ch !== undefined && WIDE.test(ch);

const collapseWhitespace = (s) =>
  s.replace(/[ \t]*\r?\n\s*/g, (m, at, all) =>
    isWide(all[at - 1]) && isWide(all[at + m.length]) ? "\n" : " "
  );

export function collapseHtml(html) {
  let out = "";
  let last = 0;
  for (const m of html.matchAll(RAW_BLOCK)) {
    out += collapseWhitespace(html.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + collapseWhitespace(html.slice(last));
}

/* ---- CSS ---- */

/* 文字列・残すコメント・url() の中身を退避してから詰め、最後に戻す。
   退避の印は NUL で挟んだ番号で、空白も区切り記号も含まない。 */
const PROTECTED = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|url\(\s*[^"')\s][^)]*\)/g;

export function minifyCss(css) {
  const kept = [];
  let s = css.replace(PROTECTED, (m) => {
    /* 出所の表示(/*!)だけ残す。説明のコメントは公開しない */
    if (m.startsWith("/*") && !m.startsWith("/*!")) return " ";
    kept.push(m);
    return `\u0000${kept.length - 1}\u0000`;
  });

  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s*([{};,])\s*/g, "$1");

  /* 区切りの直前が「{」なら選択子(または @規則の条件)、「;」「}」なら宣言。
     宣言ではコロンの前後を詰める。選択子ではコロンの後ろだけを詰める
     (前の空白は子孫を示すため)。 */
  s = s.replace(/([^{};]+)([{};])/g, (whole, body, delim) => {
    if (delim === "{") return body.replace(/:\s+/g, ":") + delim;
    return body.replace(/\s*:\s*/, ":") + delim;
  });
  s = s.replace(/;}/g, "}").trim();

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}
