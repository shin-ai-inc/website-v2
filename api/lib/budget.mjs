/*
  ShinAI サポートAI — 日次予算メーターの判定ロジック。

  なぜ必要か: IP単位のレート制限は、多数のIPから毎分1回という低速分散を止められない。
  500 IP × 毎分1回 = 1日72万リクエスト。どの現実的なper-IP閾値も超えない。
  グローバルな日次上限だけがこれを止める。ここが口座を守る最後の砦。

  状態の保持(Durable Object)は index.mjs 側。ここには判定だけを置き、
  外部I/Oなしで検証できるようにする。
*/

/* OpenAI の単価(USD / 1Mトークン)。モデルを変えるときはここだけ直す。
   単価は変動するため、正確な請求額ではなく「桁を見誤らないための概算」として使う。 */
const PRICE_PER_MTOK = {
  input: 0.15,
  output: 0.60
};

/**
 * JST基準の日付キー。
 * UTC基準にすると日本時間の午前9時にカウンタが戻り、運用感覚とずれる。
 */
export function jstDayKey(date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

/**
 * 日次上限に達したかを判定する。
 * 状態が読めない・壊れている場合は「止める」に倒す。
 * 素通りさせると、メーター障害時が攻撃の窓になる。
 */
export function shouldBlockByBudget(state) {
  if (!state || typeof state !== "object") return true;
  const { count, limit } = state;
  if (!Number.isFinite(count) || !Number.isFinite(limit) || limit <= 0) return true;
  return count >= limit;
}

/**
 * 1リクエストの概算コスト(USD)。
 * 監査ログに残し、上限設定が実勢と合っているかを後から検証できるようにする。
 */
export function estimateCostUsd({ inputTokens, outputTokens }) {
  const i = Number.isFinite(inputTokens) ? inputTokens : 0;
  const o = Number.isFinite(outputTokens) ? outputTokens : 0;
  return (i * PRICE_PER_MTOK.input + o * PRICE_PER_MTOK.output) / 1_000_000;
}
