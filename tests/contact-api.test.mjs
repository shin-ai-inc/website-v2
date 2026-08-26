/*
  問い合わせの受理契約と、通知の組み立ての検証。

  この口はチャットと違い、氏名・連絡先・相談内容という「そのまま個人を指す」
  情報を受け取る。受理の条件を緩めると、そのまま迷惑投稿の置き場になり、
  こちらの送信ドメインの評判まで巻き添えにする。
  受けるものを列挙して閉じ、それ以外は理由を残して捨てる。

  外部I/Oを持たない関数だけをここで固定する。送信そのもの(fetch)は index.mjs 側。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseContactBody,
  contactMailPayload,
  contactSlackPayload,
  deadLetterRow,
  MAX_CHARS
} from "../api/lib/contact.mjs";

const valid = () => ({
  company: "シンアイ株式会社",
  name: "山田 太郎",
  email: "yamada@example.com",
  phone: "090-1234-5678",
  message: "現場の判断基準が人に貼り付いていて、引き継ぎができません。",
  consent: true,
  locale: "ja"
});

/* ---- 正常系 ---- */

test("必要なものが揃った投稿を受理し、前後の空白を落とす", () => {
  const r = parseContactBody({ ...valid(), name: "  山田 太郎  " });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.value.name, "山田 太郎");
  assert.equal(r.value.email, "yamada@example.com");
  assert.equal(r.value.locale, "ja");
});

test("電話番号は無くてよい", () => {
  const body = valid();
  delete body.phone;
  const r = parseContactBody(body);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.value.phone, "");
});

test("メールの宛先・差出人・返信先が意図どおりに組まれる", () => {
  const { value } = parseContactBody(valid());
  const mail = contactMailPayload(value, {
    to: "contact@shinai-inc.jp",
    from: "ShinAI サイト <noreply@send.shinai-inc.jp>"
  });
  assert.deepEqual(mail.to, ["contact@shinai-inc.jp"]);
  assert.equal(mail.from, "ShinAI サイト <noreply@send.shinai-inc.jp>");
  /* そのまま返信すれば相談者へ届くこと。ここが実務の要。 */
  assert.deepEqual(mail.reply_to, ["yamada@example.com"]);
  assert.match(mail.subject, /シンアイ株式会社/);
  assert.match(mail.subject, /山田 太郎/);
  for (const part of ["シンアイ株式会社", "山田 太郎", "yamada@example.com", "090-1234-5678", "引き継ぎができません"]) {
    assert.ok(mail.text.includes(part), `本文に ${part} がない`);
  }
  /* HTML では送らない。本文は利用者の入力そのものなので、
     解釈される形式に載せない。 */
  assert.equal(mail.html, undefined);
});

/* ---- 境界値 ---- */

test("各項目の上限ちょうどは通り、一文字超えると落ちる", () => {
  const cases = [
    ["company", MAX_CHARS.company],
    ["name", MAX_CHARS.name],
    ["message", MAX_CHARS.message]
  ];
  for (const [key, max] of cases) {
    const ok = parseContactBody({ ...valid(), [key]: "あ".repeat(max) });
    assert.equal(ok.ok, true, `${key}: 上限ちょうどが落ちた`);
    const ng = parseContactBody({ ...valid(), [key]: "あ".repeat(max + 1) });
    assert.equal(ng.ok, false, `${key}: 上限超えが通った`);
    assert.equal(ng.reason, `${key}_too_long`);
  }
});

test("空白だけの相談内容は受け取らない", () => {
  const r = parseContactBody({ ...valid(), message: "   \n  " });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "message_empty");
});

test("言い分けのない言語指定は日本語に倒す", () => {
  assert.equal(parseContactBody({ ...valid(), locale: "fr" }).value.locale, "ja");
  assert.equal(parseContactBody({ ...valid(), locale: "en" }).value.locale, "en");
});

/* ---- 異常系 ---- */

test("知らない項目が混じっていたら受け取らない", () => {
  /* 無視して通すと、将来その名前に意味がついたとき素通りに戻る。 */
  const r = parseContactBody({ ...valid(), amount: 100000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unknown_field");
});

test("メールアドレスの形をしていないものは受け取らない", () => {
  for (const bad of ["yamada", "yamada@", "@example.com", "yamada example.com", "a@b", "yamada@example..com"]) {
    const r = parseContactBody({ ...valid(), email: bad });
    assert.equal(r.ok, false, `通ってしまった: ${bad}`);
    assert.equal(r.reason, "email_malformed");
  }
});

test("同意のない投稿は受け取らない", () => {
  const r = parseContactBody({ ...valid(), consent: false });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "consent_missing");
});

test("改行を混ぜた氏名は、件名に改行を持ち込ませない", () => {
  /* 件名に改行が入ると、経路によっては見出しの偽装に使える。
     入口で畳んでおき、組み立て側の作法に依存しない。 */
  const r = parseContactBody({ ...valid(), name: "山田\r\nBcc: attacker@example.com" });
  assert.equal(r.ok, true, r.reason);
  assert.ok(!/[\r\n]/.test(r.value.name), `改行が残った: ${JSON.stringify(r.value.name)}`);
  const mail = contactMailPayload(r.value, { to: "contact@shinai-inc.jp", from: "x <a@b.jp>" });
  assert.ok(!/[\r\n]/.test(mail.subject), "件名に改行が残った");
});

test("触れないはずの欄に値があれば、投稿として扱わない", () => {
  /* 自動投稿の遮断。相手は機械なので、拒まれたことを知らせない。 */
  const r = parseContactBody({ ...valid(), "company-website": "http://spam.example" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "honeypot");
  assert.equal(r.silent, true, "静かに捨てる印がない");
});

test("形をなさない本体は受け取らない", () => {
  for (const bad of [null, "文字列", 42, [], undefined]) {
    const r = parseContactBody(bad);
    assert.equal(r.ok, false, `通ってしまった: ${JSON.stringify(bad)}`);
    assert.equal(r.reason, "body_not_object");
  }
});

/* ---- 届かなかったときの備え ---- */

test("届かなかった投稿は、本文ごと控えに残す", () => {
  /* メールが出せなかったときの最後の砦。ここに残らなければ相談は消える。 */
  const { value } = parseContactBody(valid());
  const row = deadLetterRow(value, "resend_500", new Date("2026-08-27T01:02:03Z"));
  assert.equal(row.created_at, "2026-08-27T01:02:03.000Z");
  assert.equal(row.reason, "resend_500");
  assert.equal(row.email, "yamada@example.com");
  assert.ok(row.message.includes("引き継ぎができません"));
});

test("届かなかったことの知らせに、相談の中身は載せない", () => {
  /* 通知先は別の外部サービス。気づくために要るのは、
     届かなかった事実と、誰から来たかまで。中身は控えを見に行く。 */
  const { value } = parseContactBody(valid());
  const payload = contactSlackPayload(value, "resend_500");
  assert.match(payload.text, /届/);
  assert.match(payload.text, /シンアイ株式会社/);
  assert.ok(!payload.text.includes("引き継ぎができません"), "相談の中身が載っている");
});
