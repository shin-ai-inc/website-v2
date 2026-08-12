/*
  ShinAI サポートAI — 知識の検索層。

  なぜ必要か。
  当初はサイト全文(約14,000字)をそのままシステムプロンプトへ積んでいた。
  容量には収まるが、モデルは埋もれた事実を拾えず、「商号は」という問いにすら
  「資料にない」と答えた(実測)。渡せることと、見つけられることは別である。
  そこで、質問に関係するチャンクだけを選んで渡す。

  なぜベクトルDBを使わないか。
  チャンクは百件程度で、埋め込みの利点(意味の近さ)より、外部依存・鍵・
  同期ずれ・埋め込み費用の負債が上回る。この規模では字面の一致で十分に当たる。
  必要になったら、この層だけを差し替えればよい(index.mjs は選定結果しか見ない)。

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
    return { chunk, grams, vec: chunk.vec ? decodeVector(chunk.vec) : null };
  });
  return { entries, df, total: entries.length };
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
  const q = bigrams(query);

  if (!q.size) return pinned.slice(0, k);

  const scored = scoreLexical(q, index);
  return applyPin(scored.map((s) => s.chunk), pinned, k);
}

/** 字面スコアの計算。融合と単独検索の双方から使う。 */
function scoreLexical(q, index) {
  const entries = index && index.entries ? index.entries : [];
  const scored = [];
  for (const { chunk, grams } of entries) {
    if (chunk.pin) continue;
    let score = 0;
    for (const g of q) {
      if (!grams.has(g)) continue;
      /* 珍しい語ほど強い手がかり。どのチャンクにもある語は効かせない。 */
      score += Math.log(1 + index.total / (index.df.get(g) || 1));
    }
    /* 長いチャンクが語数だけで勝たないよう、規模で割る。
       線形で割ると短文が勝ちすぎるため平方根にする。 */
    score /= Math.sqrt(grams.size || 1);
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
  const q = bigrams(query);
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
