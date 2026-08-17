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

/* チャットの応答に出さない記述。

   秘密ではない。番地はサイトにも登記にも載っており、そこは変えない。
   ただし「どこにありますか」と尋ねた訪問者が欲しいのは拠点であって、
   部屋番号までではない。会いに来るための情報は、問い合わせを経て人が渡す。

   出力側で言い換えるのではなく、知識の生成時点で落とす。
   モデルに見せなければ、答えようがない。 */
const REDACTIONS = [
  [/群馬県高崎市井野町[^\s、。]*(\s*オークスアベニュー\S*)?/g, "群馬県高崎市"],
  [/[0-9]+-[0-9]+\s*Ino-machi,\s*Takasaki,\s*Gunma(\s*Oaks\s*Avenue\s*\S*)?/gi,
   "Takasaki, Gunma"]
];

/** 応答に出さない記述を落とす。分割の前後どちらでも同じ結果になる。 */
export function redact(text) {
  let out = typeof text === "string" ? text : "";
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out;
}

/* 落とす処理はタグを剥がしたあとに行う。HTMLのままだと、
   「井野町360-7」と「オークスアベニュー」がタグで分断されていて、
   前半だけが落ちて後半が残る（実際にそうなった）。 */
const strip = (s) => redact(String(s)
  /* 改行コードを揃える。揃えないと、チェックアウトの流儀(CRLF/LF)が
     そのまま本文に入り、同じHTMLから違うチャンクが生まれる。
     埋め込みベクトルは本文を鍵に引き継ぐため、これだけで引き継ぎが外れ、
     Windowsで作った索引がLinuxのクローンで無効になる。 */
  .replace(/\r\n?/g, "\n")
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
  .trim());

/* これ未満は見出しの残骸や飾り文で、根拠として使えない。 */
const MIN_CHARS = 24;

/* これを超えたら文の切れ目で割る。長い塊は、その中の事実を埋もれさせる
   （この設計はもともとそれを避けるためにある）。
   代表メッセージのような長い散文が英語版で1,350字に達し、上限を破っていた。 */
const MAX_CHARS = 700;

/** 長い本文を、文の切れ目を保ったまま分ける。文の途中では切らない。 */
function splitLong(text) {
  if (text.length <= MAX_CHARS) return [text];
  const sentences = text.split(/(?<=[。．.!?！？])\s*/);
  const parts = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer && (buffer + sentence).length > MAX_CHARS) {
      parts.push(buffer.trim());
      buffer = "";
    }
    buffer += sentence;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

/**
 * サービス一覧のHTMLから「目次」チャンクを1件作る。
 *
 * なぜ要るか。個々のカードは別々のチャンクになるため、「サービスを紹介してください」
 * のような目録の問いでは票が分かれ、単独で強い節（フィジカルAIの研究領域）が
 * 上位を独占した。三つの柱に触れないまま研究の話だけを返す誤りが実際に起きた。
 * 目録には目録で答える。
 *
 * 見出しから自動生成するため、サイトを直せば一覧も追従する。手書きしない。
 *
 * @returns {{id, title, url, text, pinFor: "services"}|null}
 */
export function catalogChunk(html, page) {
  /* 説明文ではなく箇条書きを使う。
     説明文は課題の提示から始まるため（「勘は本人の頭の中にしかなく…」）、
     先頭の一文を採ると、何をする会社かではなく何が困るかの列挙になった。
     箇条書きは実施内容そのもので、構造としても安定している。 */
  const cards = html.split(/<article[^>]*class="solution-card/i).slice(1);
  const lines = [];
  for (const card of cards) {
    const h = card.match(/<h3[^>]*class="solution-card__title"[^>]*>([\s\S]*?)<\/h3>/i);
    if (!h) continue;
    const name = strip(h[1]);
    const items = [...card.matchAll(/<li[^>]*class="solution-card__item"[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((x) => strip(x[1])).filter(Boolean);
    if (!name || !items.length) continue;
    lines.push(`${lines.length + 1}. ${name}｜${items.join(" / ")}`);
  }
  if (!lines.length) return null;
  return {
    id: `${page.slug}#catalog`,
    title: `${page.catalogTitle}｜${page.title}`,
    url: page.url,
    text: `${page.catalogLead}\n${lines.join("\n")}\n${page.catalogTail}`,
    pinFor: "services"
  };
}

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
    const heading = title ? `${strip(title)}｜${page.title}` : page.title;
    for (const part of splitLong(t)) {
      chunks.push({
        id: `${page.slug}#${chunks.length}`,
        title: heading,
        url: page.url,
        text: part,
        ...extra
      });
    }
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

  /* 2) お知らせの各項目。日付とタグが見出しより前に置かれているため、
        見出しで割ると、各項目が「次の項目の日付」を抱え込む。
        実際、2026年8月15日の設備投資の記事が 2025.12.05 を持っていた。
        誤った日付は、無いことより悪い(自信を持って間違えるため)。
        あわせて、見出しに現れない「設備投資」「登壇」といった分類が
        検索の的として使えるようになる。 */
  body = body.replace(
    /<li\b[^>]*class="[^"]*news__item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
    (_, inner) => {
      const h = inner.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
      push(h ? h[1] : "", inner);
      return " ";
    }
  );

  /* 3) article。定義上そこで完結した一単位であり、HTMLが境界を宣言している。
        見出しで割ると誤る。人物カードは役職が氏名の見出しより前に置かれるため、
        見出し基準では各人の役職が一つ前の人のチャンク末尾に付き、
        代表を最高技術責任者と紹介する誤答が実際に起きた。 */
  body = body.replace(/<article\b[^>]*>([\s\S]*?)<\/article>/gi, (_, inner) => {
    const h = inner.match(/<h[234]\b[^>]*>([\s\S]*?)<\/h[234]>/i);
    push(h ? h[1] : "", inner);
    return " ";
  });

  /* 4) 定義リスト。項目名と値の対応が命なので、行として綴じる。
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

  /* 5) 残りを見出しで割る。見出しの直前までが前節の本文。 */
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
