/*
  ShinAI サポートAI — 受理契約。

  公開APIをLLMに繋ぐ以上、最大の実害は情報漏洩ではなく「口座の踏み台化」。
  model や messages をクライアントから受けると、当社の課金で任意の処理を
  実行されうる(翻訳バッチ・コード生成、さらには再販)。
  よってここで受けるのは message と sessionId の2つだけとし、
  未知フィールドは無視せず拒否する(無視は将来の変更で素通りに戻るため)。

  外部I/Oを持たない純粋関数のみ。テストから同じものを検証する。
*/

/* ここは系を守るための絶対上限であり、利用者へ示す長さの目安ではない。

   両者を同じ500字にしていたため、契約層が先に素の400で弾き、
   guard 側の「500文字以内でお願いします」という案内が到達不能になっていた。
   長文を書いた人には、画面上は無反応に見えていた。
   人に伝える上限は guard.MAX_MESSAGE_CHARS が持つ。 */
export const MAX_PAYLOAD_CHARS = 4000;

/* 受理する鍵はこれだけ。増やすときは脅威を再評価する。 */
const ALLOWED_KEYS = new Set(["message", "sessionId"]);

/* クライアントは crypto.getRandomValues の16バイトを16進で送る(chatbot.js)。
   長さに幅を持たせるのは、将来クライアント側の実装が変わっても
   すぐ壊れないようにするため。形が違うものはログ相関を汚すので弾く。 */
const SESSION_ID_RE = /^[0-9a-f]{16,64}$/;

/**
 * リクエストボディを検証して正規化する。
 * @returns {{ok:true, value:{message:string, sessionId:string|null}}
 *          |{ok:false, status:number, reason:string}}
 *   reason は監査ログ用。利用者へはそのまま返さない。
 */
export function parseRequestBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, reason: "body_not_object" };
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, status: 400, reason: "unknown_field" };
    }
  }

  const { message, sessionId } = body;

  if (typeof message !== "string") {
    return { ok: false, status: 400, reason: "message_not_string" };
  }
  if (message.length > MAX_PAYLOAD_CHARS) {
    return { ok: false, status: 400, reason: "payload_too_long" };
  }

  if (sessionId !== undefined && sessionId !== null) {
    if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
      return { ok: false, status: 400, reason: "session_id_malformed" };
    }
  }

  return {
    ok: true,
    value: { message, sessionId: typeof sessionId === "string" ? sessionId : null }
  };
}

/**
 * CORS の Origin を解決する。
 * 完全一致のみ許可し、ワイルドカードは返さない。
 * CORS はブラウザ側の制約であり濫用対策にはならない(それはレート制限と予算上限の役割)。
 * ここでの目的は「他サイトに埋め込まれたJSから閲覧者のブラウザ経由で叩かれる」ことの防止。
 * @returns {string|null} 許可された場合はそのOrigin、否なら null
 */
export function resolveOrigin(origin, allowlist) {
  if (typeof origin !== "string" || !Array.isArray(allowlist)) return null;
  return allowlist.includes(origin) ? origin : null;
}
