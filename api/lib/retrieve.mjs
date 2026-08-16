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

/* 英語の機能語。日本語側と同じ理由で落とす。

   これが無いと「How much does it cost?」で how / much / does / it が数えられ、
   決め手である cost を押し流す。実際、費用の項目ではなく
   目次の見出しが1位になっていた。
   語として扱うぶん日本語より判定は容易で、一致した語をそのまま除く。 */
const QUERY_STOPWORDS_EN = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "do", "does", "did",
  "can", "could", "will", "would", "should", "may", "might", "have", "has", "had",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "i", "we", "you", "they", "it", "he", "she", "my", "our", "your", "their",
  "of", "to", "in", "on", "at", "for", "with", "from", "by", "about", "into",
  "and", "or", "but", "if", "then", "than", "so", "as", "that", "this", "these",
  "there", "here", "much", "many", "some", "any", "please", "tell", "me", "us",
  "get", "got", "like", "want", "need", "know", "just", "also", "very"
]);

/** 質問から話題を指さない言い回しを落とす。資料側には適用しない。 */
export function stripFunctionWords(text) {
  let s = typeof text === "string" ? text : "";
  for (const w of QUERY_STOPWORDS) s = s.split(w).join(" ");
  s = s.replace(/[a-zA-Z]{1,8}/g,
    (w) => (QUERY_STOPWORDS_EN.has(w.toLowerCase()) ? " " : w));
  /* 言い換えは置換でなく追加。元の語も手がかりとして残す。 */
  for (const [term, extra] of QUERY_SYNONYMS) {
    if (s.includes(term)) s += " " + extra;
  }
  return s;
}

/* 英語の語尾を落として、活用の違いで一致を逃さないようにする。
   manufacturers と manufacturing、solution と solutions は同じ話題である。
   索引側と質問側の双方に同じ処理をかけること（片側だけでは一致しなくなる）。
   語幹が短くなりすぎると別語と衝突するため、4文字を下限とする。 */
function stem(word) {
  for (const suffix of ["ing", "ies", "ed", "es", "s"]) {
    if (word.length - suffix.length >= 4 && word.endsWith(suffix)) {
      return suffix === "ies" ? word.slice(0, -3) + "y" : word.slice(0, -suffix.length);
    }
  }
  return word;
}

/**
 * 照合の単位を作る。言語によって単位が違う。
 *
 * 日本語は語の区切りが自明でないため、2文字組で測る。
 * 英語は空白で語が切れているのだから、語のまま扱えばよい。
 * 英語まで2文字組に刻むと、cost が co / os / st という頻出の断片になり、
 * 意味を失う。実際、英語版で「How much does it cost?」が費用の項目に当たらず、
 * 無関係なフィジカルAIの項目を拾っていた。
 *
 * 副次的に、日本語の文中の RAG や PoC も語のまま扱われるようになる
 * （ra / ag と刻むより確かな手がかりになる）。
 */
export function terms(text) {
  const out = new Set();
  const base = (typeof text === "string" ? text : "").normalize("NFKC").toLowerCase();
  if (!base) return out;

  /* 先に英数字の語を取り出す。2文字未満は雑音なので落とす。 */
  for (const word of base.match(/[a-z0-9]{2,}/g) || []) out.add(stem(word));

  /* 残りを日本語として2文字組にする。英数字を抜いた上で約物と空白を落とす。 */
  const cjk = normalize(base.replace(/[a-z0-9]+/g, " "));
  if (cjk.length === 1) out.add(cjk);
  for (let i = 0; i < cjk.length - 1; i += 1) out.add(cjk.slice(i, i + 2));
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
    /* 見出しは本文より情報密度が高い。ただし同じ語を二度並べても、
       集合に入れる以上は一度きりになる（そう書いてあったが効いていなかった）。
       重みは、見出しに現れた語を別に持ち、スコアの段で与える。 */
    const titleGrams = terms(chunk.title);
    const grams = terms(`${chunk.title} ${chunk.text}`);
    for (const g of grams) df.set(g, (df.get(g) || 0) + 1);
    /* ベクトルは索引を組むときに一度だけ復号する。
       質問ごとに復号すると、件数×次元の展開を毎回繰り返すことになる。 */
    /* 長さの補正には実際の字数を使う。一意な2文字組の数で割ると、
       同じ言い回しの繰り返しで嵩んだ文章ほど一意組が少なくなり、
       長いのに補正を免れる(検証で実際に短文へ勝った)。 */
    return {
      chunk, grams, titleGrams,
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

/* 見出しに現れた語の重み。 */
const TITLE_WEIGHT = 2.5;

/* 話題ごとの常時同梱。質問がこの話題を指したときだけ、対応する目次を先頭に置く。

   なぜ要るか。「サービスを紹介してください」は、どの記述が根拠かを問う質問ではなく、
   何と何があるかを問う質問である。ところが検索は個々の記述を競わせるため、
   三つの提供価値は票を分け合い、「新サービス」という語を持つフィジカルAIの節が
   単独で1位を取った。結果、受託の柱に一切触れないまま研究領域だけを紹介した(実測)。

   目録には目録で答える。ビルド時に三つの見出しから一覧チャンクを組み、
   話題が一致したときに限って先頭へ固定する。
   常時同梱(pin)にしないのは、関係しない質問で枠を奪わせないため。 */
const TOPIC_TRIGGERS = [
  ["services", [
    "サービス", "ソリューション", "事業内容", "メニュー", "提供している",
    "何ができ", "何をして", "何をやって", "できること", "取り組んで",
    "service", "offer", "solution", "provide",
    /* 空白と約物は正規化で落ちるため、語を詰めた形で照合する。 */
    "whatdoyoudo", "whatyoudo"
  ]]
];

/** 質問が指している話題を返す。字面のみで判定する(生成の前に確定させる)。 */
export function queryTopics(query) {
  const q = normalize(query);
  const found = new Set();
  for (const [topic, triggers] of TOPIC_TRIGGERS) {
    if (triggers.some((t) => q.includes(normalize(t)))) found.add(topic);
  }
  return found;
}

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
  const lead = leadChunks(query, entries);
  const q = terms(stripFunctionWords(query));

  if (!q.size) return lead.concat(pinned).slice(0, k);

  const scored = scoreLexical(q, index);
  return applyPin(lead.concat(scored.map((s) => s.chunk)), pinned, k);
}

/** 話題が一致した目次を返す。先頭に置く分だけを取り出す。 */
function leadChunks(query, entries) {
  const topics = queryTopics(query);
  if (!topics.size) return [];
  return entries.filter((e) => e.chunk.pinFor && topics.has(e.chunk.pinFor))
    .map((e) => e.chunk);
}

/** 字面スコアの計算。融合と単独検索の双方から使う。 */
function scoreLexical(q, index) {
  const entries = index && index.entries ? index.entries : [];
  const scored = [];
  for (const { chunk, grams, titleGrams, len } of entries) {
    /* 常時同梱と話題別の目次は、競わせる対象ではない。
       目次は三つの見出しを並べたものなので、字面では常に強く出る。
       競わせれば、本命の記述をどの質問でも押しのける。 */
    if (chunk.pin || chunk.pinFor) continue;
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
      const idf = Math.log(index.total / df);
      /* 見出しに現れた語は、その項目が何を扱うかを直に示す。
         「What does it cost?」という見出しを持つ項目が、
         同じ語を本文で一度触れただけの目次に負けていた。 */
      score += titleGrams.has(g) ? idf * TITLE_WEIGHT : idf;
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
  const lead = leadChunks(query, entries);
  const q = terms(stripFunctionWords(query));
  if (!q.size) return lead.concat(pinned).slice(0, k);

  const lexical = scoreLexical(q, index).slice(0, ARM_DEPTH);
  if (!queryVec) return applyPin(lead.concat(lexical.map((s) => s.chunk)), pinned, k);

  const dense = entries
    .filter((e) => e.vec && !e.chunk.pin && !e.chunk.pinFor)
    .map((e) => ({ chunk: e.chunk, score: cosine(queryVec, e.vec) }))
    /* 意味が離れたものまで拾うと、字面が空振りしたとき雑音だけが残る。 */
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, ARM_DEPTH);

  if (!dense.length) return applyPin(lead.concat(lexical.map((s) => s.chunk)), pinned, k);

  const byId = new Map(entries.map((e) => [e.chunk.id, e.chunk]));
  const fused = fuseRankings([
    lexical.map((s) => s.chunk.id),
    dense.map((s) => s.chunk.id)
  ]);
  return applyPin(lead.concat(fused.map((f) => byId.get(f.id)).filter(Boolean)), pinned, k);
}
