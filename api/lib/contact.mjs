/*
  ShinAI サイト — 問い合わせフォームの受理契約と、送るものの組み立て。

  チャットの受理契約(contract.mjs)との違い: あちらは message と sessionId しか
  受けない匿名の窓口。こちらは氏名・連絡先という「そのまま個人を指す」情報を
  受け、実在の相手へメールを送る。受理条件をここで閉じ、
  組み立て(件名・本文・宛先)も外部I/Oを持たない純粋関数としてここに置き、
  テストから固定できるようにする。fetch を投げる側(実際の送信)は index.mjs。
*/

/* 上限は人が書く量の常識から。制限が目的ではなく、
   件名やログを不自然に膨らませる入力を弾くための線。 */
export const MAX_CHARS = {
  company: 100,
  name: 50,
  email: 254,
  phone: 20,
  message: 2000
};

const ALLOWED_KEYS = new Set(["company", "name", "email", "phone", "message", "consent", "locale"]);

/* RFC全体は実装しない。素通しでも壊れないが、あからさまに
   メールの形をしていないものだけは入口で落とす。 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;

/** 前後の空白を落とし、改行・制御文字を取り除く。件名・ヘッダへ流用する値のため。 */
const cleanLine = (s) => String(s).trim().replace(/[\r\n\t\x00-\x1f]+/g, " ").replace(/\s{2,}/g, " ").trim();

/** 相談本文は改行を意味として残す。行末の空白だけを落とす。 */
const cleanBody = (s) => String(s).replace(/[\r\n]+/g, "\n").split("\n").map((l) => l.trim()).join("\n").trim();

/**
 * 問い合わせフォームの投稿を検証して正規化する。
 * @returns {{ok:true, value:object}
 *          |{ok:false, status:number, reason:string, silent?:boolean}}
 *   silent: true は「自動投稿として黙って捨ててよい」印。利用者へは
 *   成功のふりも失敗のふりもせず、送信側で分岐して何も返さない。
 */
export function parseContactBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, reason: "body_not_object" };
  }

  /* ハニーポット。人間には見えない欄で、値があれば機械の投稿と分かる。
     形式検査より先に見て、無駄な検証をしない。 */
  if (typeof body["company-website"] === "string" && body["company-website"].length > 0) {
    return { ok: false, status: 200, reason: "honeypot", silent: true };
  }

  for (const key of Object.keys(body)) {
    if (key === "company-website") continue;
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, status: 400, reason: "unknown_field" };
    }
  }

  const company = cleanLine(body.company ?? "");
  const name = cleanLine(body.name ?? "");
  const email = cleanLine(body.email ?? "");
  const phone = cleanLine(body.phone ?? "");
  const message = cleanBody(body.message ?? "");

  if (!company) return { ok: false, status: 400, reason: "company_missing" };
  if (company.length > MAX_CHARS.company) return { ok: false, status: 400, reason: "company_too_long" };

  if (!name) return { ok: false, status: 400, reason: "name_missing" };
  if (name.length > MAX_CHARS.name) return { ok: false, status: 400, reason: "name_too_long" };

  if (!email) return { ok: false, status: 400, reason: "email_missing" };
  if (email.length > MAX_CHARS.email) return { ok: false, status: 400, reason: "email_too_long" };
  if (!EMAIL_RE.test(email) || email.includes("..")) return { ok: false, status: 400, reason: "email_malformed" };

  if (phone.length > MAX_CHARS.phone) return { ok: false, status: 400, reason: "phone_too_long" };

  if (!message) return { ok: false, status: 400, reason: "message_empty" };
  if (message.length > MAX_CHARS.message) return { ok: false, status: 400, reason: "message_too_long" };

  if (body.consent !== true) return { ok: false, status: 400, reason: "consent_missing" };

  const locale = body.locale === "en" ? "en" : "ja";

  return { ok: true, value: { company, name, email, phone, message, locale } };
}

/**
 * Resend の送信APIへ渡すペイロード。HTMLは組まない。
 * 相談内容は利用者がそのまま書いた文字列で、解釈される形式(HTML)へ
 * 載せると、記法や絵文字が意図しない見え方をしうるため text 一本にする。
 */
export function contactMailPayload(value, { to, from }) {
  const subjectTag = value.locale === "en" ? "[ShinAI enquiry]" : "[ShinAI お問い合わせ]";
  const label = value.locale === "en"
    ? { company: "Company", name: "Name", email: "Email", phone: "Phone", message: "Message" }
    : { company: "会社名・組織名", name: "お名前", email: "メールアドレス", phone: "電話番号", message: "ご相談内容" };

  const text = [
    `${label.company}: ${value.company}`,
    `${label.name}: ${value.name}`,
    `${label.email}: ${value.email}`,
    `${label.phone}: ${value.phone || "-"}`,
    "",
    `${label.message}:`,
    value.message
  ].join("\n");

  return {
    to: [to],
    from,
    /* そのまま返信すれば相談者へ届く。担当者の実務動線はここに集約される。 */
    reply_to: [value.email],
    subject: `${subjectTag} ${value.company} / ${value.name}`,
    text
  };
}

/** 送れなかったときの通知。相談の中身は載せない(通知先は別サービスのため)。 */
export function contactSlackPayload(value, reason) {
  const when = new Date().toISOString().slice(0, 16).replace("T", " ");
  return {
    text: [
      "問い合わせメールが届いていません(送信失敗)",
      `${value.company} / ${value.name} / ${value.email}`,
      `理由: ${reason} / ${when} UTC`,
      "本文は控え(D1)を確認してください。"
    ].join("\n")
  };
}

/** 送信に失敗したときの控え。ここに残らなければ相談そのものが消える。 */
export function deadLetterRow(value, reason, at = new Date()) {
  return {
    created_at: at.toISOString(),
    company: value.company,
    name: value.name,
    email: value.email,
    phone: value.phone,
    message: value.message,
    locale: value.locale,
    reason
  };
}

/* 控えは氏名・連絡先・相談内容をそのまま持つ「お客様の声」より重い個人情報。
   voices.mjs が保存期間を切っているのと同じ理由で、ここも無期限には残さない。
   フォローアップに使える猶予として voices(180日)より短く取る。 */
export const DEADLETTER_RETENTION_DAYS = 30;

/** この時刻より古い控えは削除する。 */
export function deadLetterPurgeCutoff(now = new Date()) {
  return new Date(now.getTime() - DEADLETTER_RETENTION_DAYS * 86400000).toISOString();
}
