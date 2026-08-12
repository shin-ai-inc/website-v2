/*
  公開HTMLから知識チャンクを切り出す。

  なぜページ単位ではないか。
  当初はページ本文をそのまま1件にしていた。会社情報ページは3,174字の
  改行なしの散文になり、「商号」と「シンアイ株式会社」の対応すら失われた。
  結果、モデルは商号を答えられなかった(実測)。
  意味のまとまりで切り、見出しを題として持たせることで、検索でも生成でも
  「どの記述が根拠か」が一意に定まる。

  なぜHTMLの構造をそのまま使うか。
  FAQは <details>、会社概要は <dl> と、既に意味の境界がマークアップされている。
  別途FAQ台帳を手で持つと必ずサイト本体と乖離する。構造を読むだけなら
  乖離しようがない。
*/

const strip = (s) => s
  .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/[ \t　]+/g, " ")
  .replace(/\n\s*\n\s*\n+/g, "\n\n")
  .trim();

/* これ未満は見出しの残骸や飾り文で、根拠として使えない。 */
const MIN_CHARS = 24;

/**
 * 1ページ分のHTMLからチャンク配列を作る。
 * @param {string} html 公開済みHTML全文
 * @param {{title: string, url: string, slug: string}} page
 * @returns {Array<{id, title, url, text, pin?}>}
 */
export function chunkPage(html, page) {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (!main) return [];
  let body = main[1];
  const chunks = [];
  const push = (title, text, extra) => {
    const t = strip(text);
    /* 常時同梱の事実カードは短くても落とさない。
       「商号: シンアイ株式会社」は24字に満たないが、最も問われる記述である。 */
    if (t.length < MIN_CHARS && !(extra && extra.pin)) return;
    if (!t) return;
    chunks.push({
      id: `${page.slug}#${chunks.length}`,
      title: title ? `${strip(title)}｜${page.title}` : page.title,
      url: page.url,
      text: t,
      ...extra
    });
  };

  /* 1) FAQ。1問1答で切ると、質問文がそのまま検索の的になる。 */
  body = body.replace(
    /<details\b[^>]*>([\s\S]*?)<\/details>/gi,
    (_, inner) => {
      const q = inner.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
      const a = inner.replace(/<summary\b[^>]*>[\s\S]*?<\/summary>/i, "");
      const question = q ? strip(q[1]) : "";
      /* 質問文を本文にも残す。検索の的であると同時に、
         モデルが「何への答えか」を取り違えないための文脈になる。 */
      push(question, `${question}\n${strip(a)}`);
      return " ";
    }
  );

  /* 2) article。定義上そこで完結した一単位であり、HTMLが境界を宣言している。
        見出しで割ると誤る。人物カードは役職が氏名の見出しより前に置かれるため、
        見出し基準では各人の役職が一つ前の人のチャンク末尾に付き、
        代表を最高技術責任者と紹介する誤答が実際に起きた。 */
  body = body.replace(/<article\b[^>]*>([\s\S]*?)<\/article>/gi, (_, inner) => {
    const h = inner.match(/<h[234]\b[^>]*>([\s\S]*?)<\/h[234]>/i);
    push(h ? h[1] : "", inner);
    return " ";
  });

  /* 3) 定義リスト。項目名と値の対応が命なので、行として綴じる。
        会社概要は最も問われるうえ短いので、常時同梱(pin)にする。 */
  body = body.replace(/<dl\b[^>]*>([\s\S]*?)<\/dl>/gi, (_, inner) => {
    const lines = [];
    const re = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
    let m;
    while ((m = re.exec(inner)) !== null) {
      const term = strip(m[1]);
      const desc = strip(m[2]);
      if (term && desc) lines.push(`${term}: ${desc}`);
    }
    if (lines.length) {
      push("会社概要", lines.join("\n"), page.pinDl ? { pin: true } : undefined);
    }
    return " ";
  });

  /* 4) 残りを見出しで割る。見出しの直前までが前節の本文。 */
  const parts = body.split(/(<h[23]\b[^>]*>[\s\S]*?<\/h[23]>)/i);
  let heading = "";
  let buffer = parts[0] || "";
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (/^<h[23]\b/i.test(part)) {
      push(heading, buffer);
      heading = part;
      buffer = "";
    } else {
      buffer += part;
    }
  }
  push(heading, buffer);

  return chunks;
}
