/*
  ShinAI サポートAI — 知識の検索層。

  なぜ必要か。
  当初はサイト全文(約14,000字)をそのままシステムプロンプトへ積んでいた。
  容量には収まるが、モデルは埋もれた事実を拾えず、「商号は」という問いにすら
  「資料にない」と答えた(実測)。渡せることと、見つけられることは別である。
  そこで、質問に関係するチャンクだけを選んで渡す。

  なぜベクトルDBを立てないか。
  チャンクは百件程度で、全件との内積は1ミリ秒に満たない。埋め込みはビルド時に
  確定して同梱するため、実行時に要るのは質問1件分の変換だけ。外部DBは鍵・
  同期ずれ・障害点・費用を増やすだけで、この規模では何も速くしない。
  数千件を超えたら、この層だけを差し替えればよい(index.mjs は選定結果しか見ない)。

  なぜ文字バイグラムか。
  日本語は語の区切りが自明でなく、形態素解析器を入れると辞書とWorkerの容量が要る。
  2文字組の重なりは、分かち書きなしで日本語の一致を測る古典的で堅い方法。
*/

import { decodeVector, cosine, fuseRankings } from "./vector.mjs";

/** 表記の揺れを吸収する。全角英数・大小文字・空白・約物を落とす。 */
export function normalize(text) {
  return (typeof text === "string" ? text : "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[、。・,.:：;；!！?？"'`（）()「」『』【】\[\]\-–—_/\\|~〜]/g, "");
}

/* 質問文から落とす言い回し。話題を一切区別しない語だけを挙げる。

   なぜ必要か。IDF は「資料の中での珍しさ」を測る。ところが資料は平叙文の集まりで、
   疑問詞や依頼表現はそこにほとんど現れない。結果、話題を何も指していない
   「どんな」が最も珍しい語として最大の重みを得て、「柴田」を押し流した(実測)。
   質問文にしか出ない言い回しは、資料側の統計では正しく減点できない。

   長い表現から順に消す(「ますか」を先に消すと「教えてください」が崩れる、
   といった取りこぼしを避ける)。 */
const QUERY_STOPWORDS = [
  "教えてください", "教えて下さい", "ください", "下さい", "お願いします",
  "について", "に関して", "ですか", "でしょうか", "ましょうか", "ますか",
  "どのような", "どのくらい", "どれくらい", "どんな", "どちら", "どなた",
  "いくら", "どこ", "いつ", "だれ", "誰", "なぜ", "どう", "どの",
  "教えて", "知りたい", "でしょう", "ですが", "します", "したい"
];

/* 訪問者の言葉と、サイトの言葉のずれを埋める。

   なぜ必要か。サービス紹介の本文には「サービス」という語が一度も出てこない
   (「暗黙知の解消支援」「企業専用AIエージェント開発」と具体名で書かれている)。
   字面一致では原理的に繋がらず、「どんなサービスがありますか」に対して
   その語を多用するプライバシーポリシーが上位を占めた(実測)。

   本来これは埋め込みが解く。ベクトルを同梱すれば言い換えは意味で繋がるため、
   この表はその代わりの手当てであり、増やし続けるものではない。
   訪問者が使うのにサイトが使わない、数少ない語だけを置く。 */
const QUERY_SYNONYMS = [
  ["サービス", "ソリューション 支援 開発"],
  ["料金", "費用"],
  ["価格", "費用"],
  ["実績", "活用 導入"],
  ["事例", "活用 導入"]
];

/** 質問から話題を指さない言い回しを落とす。資料側には適用しない。 */
export function stripFunctionWords(text) {
  let s = typeof text === "string" ? text : "";
  for (const w of QUERY_STOPWORDS) s = s.split(w).join(" ");
  /* 言い換えは置換でなく追加。元の語も手がかりとして残す。 */
  for (const [term, extra] of QUERY_SYNONYMS) {
    if (s.includes(term)) s += " " + extra;
  }
  return s;
}

/** 2文字組の集合。1文字しかない語も取りこぼさないため単独で1件とする。 */
export function bigrams(text) {
  const s = normalize(text);
  const out = new Set();
  if (!s) return out;
  if (s.length === 1) { out.add(s); return out; }
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

/**
 * 転置索引を作る。ビルド時ではなく起動時に組む
 * (Worker のインスタンスは使い回されるため、実質1回で済む)。
 */
export function buildIndex(chunks) {
  const list = Array.isArray(chunks) ? chunks : [];
  const df = new Map();
  const entries = list.map((chunk) => {
    /* 見出しは本文より情報密度が高い。2回数えて重みを与える。 */
    const grams = bigrams(`${chunk.title} ${chunk.title} ${chunk.text}`);
    for (const g of grams) df.set(g, (df.get(g) || 0) + 1);
    /* ベクトルは索引を組むときに一度だけ復号する。
       質問ごとに復号すると、件数×次元の展開を毎回繰り返すことになる。 */
    /* 長さの補正には実際の字数を使う。一意な2文字組の数で割ると、
       同じ言い回しの繰り返しで嵩んだ文章ほど一意組が少なくなり、
       長いのに補正を免れる(検証で実際に短文へ勝った)。 */
    return {
      chunk, grams,
      len: Math.max(LEN_FLOOR, normalize(`${chunk.title} ${chunk.text}`).length),
      vec: chunk.vec ? decodeVector(chunk.vec) : null
    };
  });
  return { entries, df, total: entries.length };
}

/* この割合を超えるチャンクに現れる2文字組は、話題を区別しないので数えない。
   3割強に出る語は、日本語では助詞・語尾・定型の言い回しにあたる。 */
const COMMON_GRAM_RATIO = 0.35;

/* 長さ補正の下限。これより短いチャンクを、さらに短いというだけで優遇しない。

   なぜ要るか。平方根で割る補正は、極端に短い断片に効きすぎる。
   「どんなサービスがありますか」に対し、40字程度の工程見出し(収集・構造化など)が、
   170字ある本命のサービス説明を上回った。短いことは、精密であることを意味しない。
   ある長さから下は、断片であって記述ではない。 */
const LEN_FLOOR = 150;

/* 割合による足切りを効かせる最小の母数。 */
const MIN_CORPUS_FOR_RATIO = 20;

/* 格助詞。これを含む2文字組は、語の切れ目をまたいだ偶然の並びである確率が高い。

   なぜ捨てるか。「柴田さんの経歴と役職」を尋ねたとき、別人(CTO)の紹介文が
   1位になった。一致していたのは「の経」ただ一つで、
   「エンジニアリング(の経)験」という語をまたぐ断片だった。
   こうした断片は資料に稀にしか現れないため、IDFはこれを最も価値ある手がかりと
   見なし、本命の「柴田」を上回らせる。稀少さは、必ずしも情報量ではない。
   結果、代表を最高技術責任者と紹介する誤答が生じた。 */
const PARTICLES = new Set(["の", "を", "に", "は", "が", "と", "へ", "も", "や", "で"]);

/* 一致が皆無に等しいチャンクを混ぜない下限。
   雑音を渡すとモデルが引きずられ、関係のない話題へ流れる。 */
const MIN_SCORE = 0.02;

/**
 * 質問に関係するチャンクを選ぶ。
 * pin付き(会社概要など、短くて最も問われるもの)は常に含める。
 * @returns {Array} 上位から k 件まで。pin を含めて k を超えない。
 */
export function selectChunks(query, index, options = {}) {
  const k = options.k || 6;
  const entries = index && index.entries ? index.entries : [];
  const pinned = entries.filter((e) => e.chunk.pin).map((e) => e.chunk);
  const q = bigrams(stripFunctionWords(query));

  if (!q.size) return pinned.slice(0, k);

  const scored = scoreLexical(q, index);
  return applyPin(scored.map((s) => s.chunk), pinned, k);
}

/** 字面スコアの計算。融合と単独検索の双方から使う。 */
function scoreLexical(q, index) {
  const entries = index && index.entries ? index.entries : [];
  const scored = [];
  for (const { chunk, grams, len } of entries) {
    if (chunk.pin) continue;
    let score = 0;
    for (const g of q) {
      if (!grams.has(g)) continue;
      if (PARTICLES.has(g[0]) || PARTICLES.has(g[1])) continue;
      const df = index.df.get(g) || 1;
      /* 多くのチャンクに現れる2文字組は捨てる。日本語の疑問文は
         「どんな」「ですか」で埋まっており、これを数えると、
         どのFAQにも共通する言い回しが、稀少で決定的な固有名詞を押し流す
         (「柴田さんはどんな経歴の方ですか」で経歴の記述を落とした実例がある)。 */
      /* 件数が少ないうちは割合に意味がない(3件中2件は「頻出」ではない)。
         十分な母数があるときだけ効かせる。 */
      if (index.total >= MIN_CORPUS_FOR_RATIO && df > index.total * COMMON_GRAM_RATIO) continue;
      /* log(N/df)。log(1 + N/df) だと頻出語にも下駄を履かせてしまい、
         稀少語との差が6倍程度しか開かない。 */
      score += Math.log(index.total / df);
    }
    /* 長いチャンクが語数だけで勝たないよう、字数で割る。
       線形で割ると短文が勝ちすぎるため平方根にする。 */
    score /= Math.sqrt(len);
    if (score > MIN_SCORE) scored.push({ chunk, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * pin を必ず含める。順序は関連度のまま保つ
 * (先頭に固定すると最も関係の深い記述が後ろへ押しやられ、モデルが本題を取り違える)。
 * 溢れる分は末尾から落とす。
 */
function applyPin(picked, pinned, k) {
  const head = picked.slice(0, k);
  const missing = pinned.filter((p) => !head.includes(p));
  if (!missing.length) return head;
  const room = Math.max(0, k - missing.length);
  return head.slice(0, room).concat(missing);
}

/* 融合前に各経路から取る候補数。k より広く取らないと、
   片方だけが見つけた正解を融合の土俵に乗せられない。 */
const ARM_DEPTH = 12;

/**
 * 字面とベクトルを融合して選ぶ。これが本番の経路。
 * queryVec が無い(鍵未設定・埋め込み失敗)場合は字面のみへ縮退する。
 * @param {string} query 利用者の質問
 * @param {Float32Array|null} queryVec 質問の埋め込み
 */
export function hybridSearch(query, queryVec, index, options = {}) {
  const k = options.k || 6;
  const entries = index && index.entries ? index.entries : [];
  const pinned = entries.filter((e) => e.chunk.pin).map((e) => e.chunk);
  const q = bigrams(stripFunctionWords(query));
  if (!q.size) return pinned.slice(0, k);

  const lexical = scoreLexical(q, index).slice(0, ARM_DEPTH);
  if (!queryVec) return applyPin(lexical.map((s) => s.chunk), pinned, k);

  const dense = entries
    .filter((e) => e.vec && !e.chunk.pin)
    .map((e) => ({ chunk: e.chunk, score: cosine(queryVec, e.vec) }))
    /* 意味が離れたものまで拾うと、字面が空振りしたとき雑音だけが残る。 */
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, ARM_DEPTH);

  if (!dense.length) return applyPin(lexical.map((s) => s.chunk), pinned, k);

  const byId = new Map(entries.map((e) => [e.chunk.id, e.chunk]));
  const fused = fuseRankings([
    lexical.map((s) => s.chunk.id),
    dense.map((s) => s.chunk.id)
  ]);
  return applyPin(fused.map((f) => byId.get(f.id)).filter(Boolean), pinned, k);
}
