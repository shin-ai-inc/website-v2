/*
  ShinAI サポートAI — ベクトル層と順位融合。

  なぜ字面検索だけでは足りないか。
  「料金はいくら」と「費用はどのくらいかかりますか」は文字がほとんど重ならない。
  「御社の名前は」と「商号」も同様。字面一致はこの言い換えを構造的に拾えない。

  なぜベクトルだけにしないか。
  逆に埋め込みは固有名詞・型番・社名の一字違いに鈍い。「シンアイ」と「シンアイ株式会社」
  の区別や、サイトにしかない語(七つのShin等)は字面の方が確実に当たる。

  よって両方を走らせ、順位で融合する(RRF)。スコアの尺度が違う両者を
  足し合わせるには正規化が要り、正規化はコーパスごとの調整を生む。
  順位だけを見るRRFは調整パラメータを持たず、壊れにくい。

  なぜベクトルDBを立てないか。
  チャンクは百件程度。全件との内積は1ミリ秒に満たない。外部DBは鍵・同期ずれ・
  障害点・費用を増やすだけで、この規模では何も速くしない。
  埋め込みはビルド時に確定するので、実行時に必要なのは質問1件分の変換だけ。

  なぜ int8 に量子化するか。
  float32 のままだと Worker の同梱容量を圧迫する。埋め込みは正規化済みで
  値域が -1..1 に収まるため、int8 で表しても順位はほぼ変わらない。
*/

/** 量子化した埋め込みを base64 文字列へ。ビルド側が使う。 */
export function encodeVector(values) {
  const bytes = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    /* -1..1 を -127..127 へ写す。四捨五入の誤差は順位に影響しない。 */
    const q = Math.max(-127, Math.min(127, Math.round(values[i] * 127)));
    bytes[i] = q < 0 ? q + 256 : q;
  }
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** base64 から Float32Array へ戻す。実行時に1回だけ行う。 */
export function decodeVector(b64) {
  const bin = atob(b64);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    const b = bin.charCodeAt(i);
    out[i] = (b > 127 ? b - 256 : b) / 127;
  }
  return out;
}

/** 内積。両者とも正規化済みなので、これがコサイン類似度になる。 */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

/** 長さ1へ揃える。量子化の前に必ず通す。 */
export function normalizeVector(values) {
  let norm = 0;
  for (const v of values) norm += v * v;
  norm = Math.sqrt(norm);
  if (!norm) return values.map(() => 0);
  return values.map((v) => v / norm);
}

/* RRF の緩衝定数。原論文と同じ60。小さくすると1位の影響が過剰になる。 */
const RRF_K = 60;

/**
 * 複数の順位表を融合する。各表は id の配列(上位順)。
 * どちらの経路でも上位に来たものが最も強くなる。
 * @param {Array<Array<string>>} rankings
 * @returns {Array<{id: string, score: number}>} 融合順
 */
export function fuseRankings(rankings) {
  const scores = new Map();
  for (const ranking of rankings) {
    if (!Array.isArray(ranking)) continue;
    ranking.forEach((id, i) => {
      scores.set(id, (scores.get(id) || 0) + 1 / (RRF_K + i + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}
