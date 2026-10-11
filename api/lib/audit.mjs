/*
  ShinAI サポートAI — 監査ログの行の形と保存期間。

  console.log だけの監査は、Worker のインスタンスが入れ替わると消え、
  後から「いつ・どの統制が・どの相手に」効いたかを追えない。
  D1 の audit_events へも書くため、行の形をここで決める(外部I/Oは index.mjs)。

  本文・生IP・鍵は持ち込まない。ip_hash は同一人物の連続した事象をまとめて
  読むためだけに使う。保存期間は「お客様の声」(180日)より短く、
  問い合わせの控え(30日)より長く取り、統制の作動を季節単位で見返せるようにする。
*/

export const AUDIT_RETENTION_DAYS = 90;

/* 列として持つ鍵。これ以外の項目は detail(JSON) へ畳む。 */
const COLUMN_KEYS = new Set(["event", "ip", "session"]);

/**
 * 監査の一行を組み立てる。
 * @param {object} fields index.mjs の audit() に渡されたもの
 * @param {Date} [at]
 * @returns {{ts:string, event:string, ip_hash:string, session:string, detail:string}}
 */
export function auditRow(fields, at = new Date()) {
  const src = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
  const detail = {};
  for (const [k, v] of Object.entries(src)) {
    if (!COLUMN_KEYS.has(k)) detail[k] = v;
  }
  return {
    ts: at.toISOString(),
    event: typeof src.event === "string" && src.event ? src.event : "unknown",
    ip_hash: typeof src.ip === "string" ? src.ip : "",
    session: typeof src.session === "string" ? src.session : "",
    detail: JSON.stringify(detail)
  };
}

/** この時刻より古い監査の行は削除する。 */
export function auditPurgeCutoff(now = new Date()) {
  return new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86400000).toISOString();
}
