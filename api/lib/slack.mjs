/*
  ShinAI サポートAI — Slack へ流す文字列の逃がし方。

  Slack は本文の & < > を記法として解釈する。<!channel> は全員呼び出し、
  <url|label> は表示とリンク先が食い違う偽装になる。利用者の入力を
  そのまま流していたため、本文に書くだけでどちらも効いていた(2026-10-11 点検)。
  通知を組む側(voices.mjs・contact.mjs)は、利用者に由来する値すべてにこれを通し、
  ペイロードに parse:"none" を付けて解釈そのものを切る(二重の守り)。
*/

/** & < > を実体参照へ置き換える。文字列でなければ空、数値などは文字列にして逃がす。 */
export function escapeSlackText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
