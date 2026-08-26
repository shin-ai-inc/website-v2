/*
  問い合わせフォームの契約検証。

  このページは「押しても何も起きない」状態で公開されていた。送信先が
  未設定(action が YOUR_FORM_ID_HERE のまま)で、スクリプトは mailto へ
  逃がす。メールソフトが関連付けられていない端末では、mailto は何も
  起こさずに終わる。画面は無反応、送信された気配もない。
  ビルドは通り、リンクも壊れず、構造化データも正しいままだったので、
  実際に人が押すまで誰も気づかなかった(実際に気づかなかった)。

  ここで押さえるのは一点。押した結果が必ず画面に現れること。
  送信先が設定済みでも未設定でも、成功でも失敗でも、沈黙は許さない。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const read = (...p) => {
  const path = join(ROOT, ...p);
  if (!existsSync(path)) {
    throw new Error(`${p.join("/")} がない。先に node _build/build.mjs を実行する。`);
  }
  return readFileSync(path, "utf8");
};

const ja = () => read("dist", "contact.html");
const en = () => read("dist", "en", "contact.html");
const script = () => read("scripts", "contact-form.js");

/** id を持つ要素の開きタグを取り出す。属性の有無を見るために使う。 */
const openTag = (html, id) => {
  const m = html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`));
  return m ? m[0] : null;
};

/** id を持つ要素の中身を、タグを落として取り出す。 */
const textOf = (html, id) => {
  const m = html.match(new RegExp(`<([a-z]+)[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : null;
};

/* ---- 正常系 ---- */

test("相談欄の名は「ご相談内容」である", () => {
  /* 送り手の行為を指す語なので、こちらから丁寧に呼ぶ。 */
  const html = ja();
  const label = html.match(/<label[^>]*for="message"[^>]*>([\s\S]*?)<\/label>/);
  assert.ok(label, "message のラベルがない");
  const text = label[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  assert.match(text, /ご相談内容/, `ラベル: ${text}`);
});

test("送信できたときの知らせが、礼と、この後どうなるかの両方を持つ", () => {
  /* 礼だけでは相手が次に何を待てばよいか分からない。
     連絡の予告だけでは、受け取った側の温度が伝わらない。両方を要る。 */
  const j = textOf(ja(), "contact-success");
  assert.ok(j, "日本語版に成功の知らせがない");
  assert.match(j, /ありがとうございます/, `礼がない: ${j}`);
  assert.match(j, /確認/, `確認する旨がない: ${j}`);
  assert.match(j, /ご連絡/, `連絡の予告がない: ${j}`);

  const e = textOf(en(), "contact-success");
  assert.ok(e, "英語版に成功の知らせがない");
  assert.match(e, /Thank you/i, `礼がない: ${e}`);
  assert.match(e, /get back to you|be in touch/i, `連絡の予告がない: ${e}`);
});

test("押した結果を伝える領域が三つあり、初期状態はすべて伏せてある", () => {
  /* 成功・失敗・送信先未設定。三つとも用意があって初めて沈黙が消える。 */
  for (const [name, html] of [["ja", ja()], ["en", en()]]) {
    for (const id of ["contact-success", "contact-error", "contact-fallback"]) {
      const tag = openTag(html, id);
      assert.ok(tag, `${name}: #${id} がない`);
      assert.match(tag, /\bhidden\b/, `${name}: #${id} が初期状態で見えている`);
    }
  }
});

/* ---- 境界値 ---- */

test("送信先が未設定のときの案内が、直接届く連絡先を持つ", () => {
  /* mailto が開かない端末のための逃げ道。ここにアドレスが無いと、
     案内を出しても相手は行き先を失う。 */
  for (const [name, html] of [["ja", ja()], ["en", en()]]) {
    const text = textOf(html, "contact-fallback");
    assert.ok(text, `${name}: 未設定時の案内がない`);
    assert.match(text, /contact@shinai-inc\.jp/, `${name}: 連絡先がない: ${text}`);
  }
});

/* ---- 異常系 ---- */

test("送信先が未設定でも、押した跡が画面に残る", () => {
  /* 未設定の分岐が mailto を開くだけで戻ると、画面は無反応のままになる。
     分岐の中で必ず表示を切り替えること。 */
  const src = script();
  const branch = src.match(/if\s*\(!isConfigured\)\s*\{([\s\S]*?)\n\s{4}\}/);
  assert.ok(branch, "未設定時の分岐が読み取れない");
  assert.match(branch[1], /showFeedback\(/, "未設定時に表示を切り替えていない");
});

test("ハニーポットに値があるときは送らない", () => {
  /* 自動投稿の遮断。人間は触れない欄なので、値があれば黙って捨てる。
     ここだけは画面に何も出さないのが正しい(相手は機械なので)。 */
  const src = script();
  assert.match(src, /company-website/, "ハニーポットを見ていない");
  const m = src.match(/company-website[\s\S]{0,200}/);
  assert.match(m[0], /if\s*\(hp && hp\.value\)\s*return/, "値があっても送信を止めていない");
});
