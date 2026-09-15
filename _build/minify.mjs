/*
  公開物の圧縮（外部ライブラリなし）。build.mjs が書き出す HTML・CSS・JS にかける。

  目的: ページのソースを開いたときに、構造と設計がそのまま読める状態を和らげる。
  これは暗号化ではない。ブラウザが描画するには HTML・CSS・JS を必ず受け取るため、
  隠すことはできず、読みにくくすることしかできない（柴田指示 2026-09-15）。

  守ること: 描画と動作を一切変えない。
  - HTML は改行と字下げを「一つの空白」に畳むだけ。空白を消さない
    （語と語、要素と要素の間の空白は描画に効くため）。
  - CSS は余白を除くが、意味を持つ空白は残す。
    ・子孫を示す空白（:lang(ja) :is(...)）
    ・calc の演算子の前後
    ・文字列と url() の中身
  - JS は構文解析器を持たないので、意味が変わりうる詰め方をしない。
    ・改行は残す（自動セミコロン挿入の結果を変えないため）。消すのは字下げ・空行・空白
    ・+ + や - - のように、詰めると別の演算子になる並びは空白を残す
    ・文字列と正規表現の中身には触れない
*/

/* ---- HTML ---- */

/* 中身の空白に意味がある要素。中身には触れないが、開始タグの属性の改行は畳む */
const RAW_BLOCK = /(<(pre|textarea|script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi;

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
    out += collapseWhitespace(html.slice(last, m.index)) + collapseWhitespace(m[1]) + m[3] + m[4];
    last = m.index + m[0].length;
  }
  return out + collapseWhitespace(html.slice(last));
}

/* ---- CSS ---- */

/* 文字列・残すコメント・url() の中身を退避してから詰め、最後に戻す。
   退避の印は NUL で挟んだ番号で、空白も区切り記号も含まない。
   逆斜線の組を最初に拾う。選択子の \' を文字列の始まりと読むと、
   次の引用符までの長い区間が退避され、中のコメントが公開物に残る。 */
const PROTECTED = /\\[\s\S]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|url\(\s*[^"')\s][^)]*\)/g;

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

/* ---- JavaScript ---- */

const IDENT = /[A-Za-z0-9_$\u0080-\uffff]/;
const SPACE = /[ \t\r\f\v\u00a0\ufeff]/;

/* 直前の語がこれなら、次の / は割り算ではなく正規表現の始まり */
const REGEX_AFTER_WORD = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await"
]);
/* 直前の記号がこれなら、次の / は正規表現の始まり */
const REGEX_AFTER_PUNCT = new Set([..."(,=:[!&|?{};~+-*%<>^"]);

/* 空白を除くと別の字句にくっつく並び */
const needsSpace = (a, b) =>
  (IDENT.test(a) && IDENT.test(b)) ||
  (a === "+" && b === "+") ||
  (a === "-" && b === "-") ||
  (a === "/" && b === "/") ||
  (/[0-9]/.test(a) && b === ".");

const keepComment = (c) => c.startsWith("/*!") || c.includes("@license");

export function minifyJs(src) {
  let out = "";
  let lastWord = "";
  let pendingSpace = false;
  let pendingNewline = false;

  const emit = (token, word = "") => {
    if (out) {
      if (pendingNewline) out += "\n";
      else if (pendingSpace && needsSpace(out[out.length - 1], token[0])) out += " ";
    }
    pendingSpace = pendingNewline = false;
    out += token;
    lastWord = word;
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === "\n") { pendingNewline = true; i++; continue; }
    if (SPACE.test(ch)) { pendingSpace = true; i++; continue; }

    if (ch === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length : end;
      continue;
    }

    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) throw new Error(`minifyJs: 閉じていないコメント(${i}文字目)`);
      const comment = src.slice(i, end + 2);
      /* 改行を含むコメントは、自動セミコロン挿入では改行と同じに扱われる */
      if (keepComment(comment)) emit(comment);
      else if (comment.includes("\n")) pendingNewline = true;
      else pendingSpace = true;
      i = end + 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") j++;
        else if (ch === "`" && src[j] === "$" && src[j + 1] === "{") {
          throw new Error(`minifyJs: テンプレートリテラルの \${} には対応していない(${i}文字目)`);
        }
        j++;
      }
      if (j >= src.length) throw new Error(`minifyJs: 閉じていない文字列(${i}文字目)`);
      emit(src.slice(i, j + 1));
      i = j + 1;
      continue;
    }

    if (IDENT.test(ch)) {
      let j = i + 1;
      while (j < src.length && IDENT.test(src[j])) j++;
      const word = src.slice(i, j);
      emit(word, word);
      i = j;
      continue;
    }

    if (ch === "/") {
      const regexAllowed = !out || (lastWord
        ? REGEX_AFTER_WORD.has(lastWord)
        : REGEX_AFTER_PUNCT.has(out[out.length - 1]));
      if (regexAllowed) {
        let j = i + 1;
        let inClass = false;
        for (; j < src.length; j++) {
          const c = src[j];
          if (c === "\\") { j++; continue; }
          if (c === "\n") throw new Error(`minifyJs: 閉じていない正規表現(${i}文字目)`);
          if (inClass) { if (c === "]") inClass = false; }
          else if (c === "[") inClass = true;
          else if (c === "/") break;
        }
        j++;
        while (j < src.length && /[a-z]/i.test(src[j])) j++;
        emit(src.slice(i, j));
        i = j;
        continue;
      }
    }

    emit(ch);
    i++;
  }
  return out;
}
