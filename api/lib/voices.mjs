/*
  お客様の声 — チャットへ寄せられた入力のうち、見返す価値のあるものだけを残す。

  設計の前提:
  - 個人情報は、持っているだけで負債になる。溜めることが目的ではなく、
    「後で読み返して意味がある発言」だけを残すことが目的。
  - 自傷の訴えは、価値の有無に関わらず記録も通知もしない。
    相談窓口を案内して終わりにする。ここだけは例外を作らない。
  - 保存期間を切る。期限のない保管は、漏えい時の影響と説明責任の両方を膨らませる。
  - 外部I/Oを持たない純粋関数だけを置く(判断をテストから固定できるようにするため)。
*/

/** 記録の保存期間。プライバシーポリシーに明記する値と一致させること。 */
export const RETENTION_DAYS = 180;

/** 本文の保存上限。長文をそのまま抱えない。 */
export const MAX_STORED_CHARS = 300;

/** これより短い入力は、読み返しても意味を成さない。 */
const MIN_MEANINGFUL_CHARS = 8;

/* 記録に残す価値のない入力。動作確認・打鍵の癖・意味のない反復。 */
const NOISE_PATTERNS = [
  /^(test|テスト|てすと|hello|hi)[\s。、!！?？]*$/i,
  /^(.)\1{3,}$/,
  /^[\s。、!！?？.,\-_~〜ー・]*$/
];

/* 挨拶だけの入力。guard.mjs の判定と重複させず、ここでは語だけを見る
   (guard は応答の作り方を決める側であり、こちらは保存の可否を決める側)。 */
const GREETING_ONLY = /^(こんにちは|こんばんは|おはようございます|おはよう|はじめまして|初めまして|hello|hi|good (morning|afternoon|evening))[\s。、!！?？]*$/i;

/* 自傷に関わる語。guard.mjs の分類とは独立に、ここでも見る。
   分類の取りこぼしが、そのまま記録と通知に化けることを防ぐための二重化。
   守るべき性質(絶対に残さない)は、一箇所の判定に依存させない。 */
const CRISIS_WORDS = /(死にたい|しにたい|消えたい|自殺|自傷|リストカット|生きるのが(つらい|辛い|嫌))|\b(kill myself|suicide|want to die|end my life|self[- ]harm)\b/i;

/* 記録してよい分類。人へつなぐ依頼は、関心が最も高まった瞬間なので残す。 */
const KEEPABLE_VERDICTS = new Set(["allow", "human"]);

/**
 * この入力を記録する価値があるか。
 * @param {string} message 利用者の入力
 * @param {string} verdict guard.classifyInput の判定
 */
export function isWorthKeeping(message, verdict) {
  const text = typeof message === "string" ? message.trim() : "";
  if (!text || !KEEPABLE_VERDICTS.has(verdict)) return false;
  if (CRISIS_WORDS.test(text)) return false;
  if (text.length < MIN_MEANINGFUL_CHARS) return false;
  if (GREETING_ONLY.test(text)) return false;
  for (const p of NOISE_PATTERNS) if (p.test(text)) return false;
  return true;
}

/**
 * 保存する一行を組み立てる。生のIPやヘッダは持ち込まない。
 * ip_hash は同一人物の連続した発言をまとめて読むためだけに使う。
 */
export function voiceRecord({ message, locale, verdict, sessionHash, ipHash, at }) {
  const when = at instanceof Date ? at : new Date();
  return {
    created_at: when.toISOString(),
    message: String(message).trim().slice(0, MAX_STORED_CHARS),
    locale: locale === "en" ? "en" : "ja",
    kind: verdict === "human" ? "handoff" : "question",
    session: sessionHash || "",
    ip_hash: ipHash || ""
  };
}

/** 通知の本文。投稿先URLなどの内部情報は載せない。 */
export function slackPayload(record) {
  const label = record.kind === "handoff" ? "担当者への取次ぎ希望" : "サイトのチャットに質問";
  return {
    text: [
      `${label}（${record.locale === "en" ? "英語" : "日本語"}）`,
      record.message,
      `${record.created_at.slice(0, 16).replace("T", " ")} UTC`
    ].join("\n\n")
  };
}

/**
 * 管理用の閲覧を許すか。
 * 鍵が未設定なら誰も入れない(未設定を「制限なし」と解釈すると、
 * 設定を忘れた瞬間にすべて公開されるため)。
 */
export function isAuthorizedAdmin(request, env) {
  const expected = env && typeof env.ADMIN_TOKEN === "string" ? env.ADMIN_TOKEN : "";
  if (expected.length < 16) return false;
  const header = request.headers.get("Authorization") || "";
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(got, expected);
}

/* 長さも中身も、比較にかかる時間から漏らさない。
   一致した文字数で処理時間が変わると、総当たりの手がかりになる。 */
function timingSafeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** この時刻より古い記録は削除する。 */
export function purgeCutoff(now = new Date()) {
  return new Date(now.getTime() - RETENTION_DAYS * 86400000).toISOString();
}
