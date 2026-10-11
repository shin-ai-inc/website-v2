/*
  監査・IP ハッシュ・本文の大きさ・Slack の表記の検証。
  node --test tests/audit.test.mjs

  2026-10-11 の点検で見つかった四つの穴を、実装より先にここで固定する。
  - 監査ログが console.log だけで、Worker の再起動とともに消える(F-02)
  - IP_SALT 未設定時に公開の既定値で塩を代用していた(F-06)
  - Content-Length を見ずに request.json() へ渡していた(F-03)
  - 利用者の入力を Slack にそのまま流し、<!channel> やリンク偽装が効いていた(F-01)
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditRow, auditPurgeCutoff, AUDIT_RETENTION_DAYS } from "../api/lib/audit.mjs";
import { saltStatus, hashIp, MIN_SALT_CHARS } from "../api/lib/iphash.mjs";
import { bodyTooLarge, MAX_BODY_BYTES } from "../api/lib/contract.mjs";
import { escapeSlackText } from "../api/lib/slack.mjs";

/* ---- 監査の行 ---- */

test("監査の行は event・ip_hash・session を列に出し、残りを detail(JSON) に畳む", () => {
  const at = new Date("2026-10-11T01:02:03Z");
  const row = auditRow({ event: "answered", ip: "abcd1234", session: "s1", locale: "ja", ms: 120 }, at);
  assert.equal(row.ts, "2026-10-11T01:02:03.000Z");
  assert.equal(row.event, "answered");
  assert.equal(row.ip_hash, "abcd1234");
  assert.equal(row.session, "s1");
  assert.deepEqual(JSON.parse(row.detail), { locale: "ja", ms: 120 });
  assert.deepEqual(Object.keys(row).sort(), ["detail", "event", "ip_hash", "session", "ts"]);
});

test("ip と session が無い行も列が欠けない(D1 の NOT NULL に合わせる)", () => {
  const row = auditRow({ event: "rejected_origin" });
  assert.equal(row.ip_hash, "");
  assert.equal(row.session, "");
  assert.equal(row.detail, "{}");
  assert.match(row.ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("event が無い・形をなさない入力でも行は組める(監査が監査を止めない)", () => {
  assert.equal(auditRow(null).event, "unknown");
  assert.equal(auditRow({ ip: "x" }).event, "unknown");
  assert.equal(auditRow("text").event, "unknown");
});

test("監査の保存期間は 90 日で、境界を持つ", () => {
  assert.equal(AUDIT_RETENTION_DAYS, 90);
  const now = new Date("2026-10-11T00:00:00Z");
  const cutoff = new Date(auditPurgeCutoff(now));
  assert.equal(Math.round((now - cutoff) / 86400000), 90);
});

/* ---- IP の塩 ---- */

test("塩が未設定なら unconfigured、短ければ weak、足りていれば ok", () => {
  assert.equal(saltStatus({}), "unconfigured");
  assert.equal(saltStatus({ IP_SALT: "" }), "unconfigured");
  assert.equal(saltStatus({ IP_SALT: "   " }), "unconfigured");
  assert.equal(saltStatus(undefined), "unconfigured");
  assert.equal(saltStatus({ IP_SALT: "a".repeat(MIN_SALT_CHARS - 1) }), "weak");
  assert.equal(saltStatus({ IP_SALT: "a".repeat(MIN_SALT_CHARS) }), "ok");
  assert.equal(MIN_SALT_CHARS, 32);
});

test("ハッシュは HMAC-SHA256 で、同じ入力は同じ値、塩が違えば別の値", async () => {
  const salt = "0123456789abcdef0123456789abcdef";
  const a = await hashIp("203.0.113.5", salt);
  const b = await hashIp("203.0.113.5", salt);
  const c = await hashIp("203.0.113.5", salt + "x");
  const d = await hashIp("203.0.113.6", salt);
  assert.equal(a, b, "決定的であること");
  assert.notEqual(a, c, "塩で変わること");
  assert.notEqual(a, d, "IP で変わること");
  assert.match(a, /^[0-9a-f]{16}$/, "16 桁の16進(前方 8 バイト)");
});

test("HMAC は鍵とメッセージを連結した SHA-256 と一致しない(連結方式へ戻っていない)", async () => {
  const salt = "0123456789abcdef0123456789abcdef";
  const ip = "203.0.113.5";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + ip));
  const legacy = Array.from(new Uint8Array(digest).slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("");
  assert.notEqual(await hashIp(ip, salt), legacy);
});

test("IP が無ければ unknown を返し、塩を要求しない", async () => {
  assert.equal(await hashIp(null, "0123456789abcdef0123456789abcdef"), "unknown");
  assert.equal(await hashIp("", "0123456789abcdef0123456789abcdef"), "unknown");
});

/* ---- 本文の大きさ ---- */

test("Content-Length が上限を超えていれば読む前に止める", () => {
  assert.equal(MAX_BODY_BYTES, 16384);
  assert.equal(bodyTooLarge(String(MAX_BODY_BYTES)), false, "上限ちょうどは通す");
  assert.equal(bodyTooLarge(String(MAX_BODY_BYTES + 1)), true, "一つ超えたら止める");
  assert.equal(bodyTooLarge("1000000"), true);
});

test("Content-Length が無い・読めないときは止めない(判断は後段の契約に委ねる)", () => {
  /* ここは大きさの早期拒否であり、本文の受理契約ではない。
     ヘッダが無い要求を落とすと、正当な小さな要求まで巻き込む。 */
  assert.equal(bodyTooLarge(null), false);
  assert.equal(bodyTooLarge(undefined), false);
  assert.equal(bodyTooLarge(""), false);
  assert.equal(bodyTooLarge("abc"), false);
  assert.equal(bodyTooLarge("-5"), false);
});

/* ---- Slack の表記 ---- */

test("& < > を Slack の実体参照へ置き換える", () => {
  assert.equal(escapeSlackText("<!channel> <https://evil.example/x|https://shinai-inc.jp/admin>"),
    "&lt;!channel&gt; &lt;https://evil.example/x|https://shinai-inc.jp/admin&gt;");
  assert.equal(escapeSlackText("A & B"), "A &amp; B");
  assert.equal(escapeSlackText("&lt;"), "&amp;lt;", "既存の実体参照も二重に逃がす(入力は信用しない)");
});

test("文字列でないものは空にし、通常の文は変えない", () => {
  assert.equal(escapeSlackText(null), "");
  assert.equal(escapeSlackText(undefined), "");
  assert.equal(escapeSlackText(42), "42");
  assert.equal(escapeSlackText("見積りをお願いしたい。"), "見積りをお願いしたい。");
});
