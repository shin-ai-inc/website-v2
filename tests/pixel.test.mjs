/*
  /start/ の Meta Pixel の検証。
  node --test tests/pixel.test.mjs

  広告の最適化は Lead の数を正として学習する。数が一つずれるだけで、
  配信が誤った相手へ寄っていく。ここでは「送信が本当に完了したときだけ、一度だけ」を固定する。
  計測は補助であり、計測が壊れても問い合わせは必ず届かなければならない。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const PIXEL_ID = "1060030986770128";
const MEASURE = "start/measure.js";

/* ---- 読み込みと宣言 ---- */

test("/start/ は計測ファイルを一度だけ、フォームより先に読み込む", () => {
  const html = read("start/index.html");
  const tags = html.match(/<script\b[^>]*\bsrc="measure\.js"[^>]*>/g) || [];
  assert.equal(tags.length, 1, "measure.js の読み込みが一つではない");
  assert.match(tags[0], /\bdefer\b/, "defer が無い(フォームとの順序が保証されない)");
  assert.ok(html.indexOf('src="measure.js"') < html.indexOf('src="form.js"'), "フォームより後に読み込んでいる");
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[^<]*fbq/.test(html), "ページ内に直接書いた計測コードがある(CSPで止まる)");
});

test("JS が動かない閲覧者にも PageView を一度だけ送る(noscript)", () => {
  const html = read("start/index.html");
  const imgs = html.match(/<noscript>\s*<img\b[^>]*facebook\.com\/tr[^>]*>\s*<\/noscript>/g) || [];
  assert.equal(imgs.length, 1, "noscript の計測画像が一つではない");
  assert.ok(imgs[0].includes(`id=${PIXEL_ID}&amp;ev=PageView&amp;noscript=1`), "Pixel ID か PageView の指定が違う");
  assert.match(imgs[0], /style="display:none"/, "計測画像が表示される");
});

test("CSP が Meta の読み込み先と送信先だけを足している", () => {
  const csp = read("start/index.html").match(/Content-Security-Policy" content="([^"]*)"/)[1];
  const directive = (name) => (csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " ")) || "");
  assert.ok(directive("script-src").includes("https://connect.facebook.net"), "script-src が fbevents.js を許可していない");
  assert.ok(directive("img-src").includes("https://www.facebook.com"), "img-src が計測の送信先を許可していない");
  assert.ok(directive("connect-src").includes("https://www.facebook.com"), "connect-src が計測の送信先を許可していない");
  assert.ok(!/'unsafe-inline'|'unsafe-eval'|\*/.test(directive("script-src")), "script-src を緩めすぎている");
});

test("計測ファイルは Pixel ID を一つだけ持ち、自動イベントを切る", () => {
  const js = read(MEASURE);
  assert.equal((js.match(/\d{15,16}/g) || []).filter((n) => n !== PIXEL_ID).length, 0, "別の ID が混ざっている");
  assert.ok(js.includes(PIXEL_ID), "Pixel ID が無い");
  assert.ok(js.includes("https://connect.facebook.net/en_US/fbevents.js"), "公式の読み込み先ではない");
  assert.ok(!js.includes("Lead"), "ページを開いただけで Lead を送る書き方になっている");
});

/* ---- 計測ファイルの動き ---- */

function loadMeasure(context) {
  vm.runInContext(read(MEASURE), context, { filename: MEASURE });
}

function pageContext() {
  const inserted = [];
  const firstScript = { parentNode: { insertBefore: (el) => inserted.push(el) } };
  const document = {
    createElement: () => ({}),
    getElementsByTagName: () => [firstScript]
  };
  const window = { document };
  window.window = window;
  const context = vm.createContext(window);
  return { context, window, inserted };
}

/* vm の中で作られた配列は、こちら側の配列と生まれが違い、厳密比較で一致しない。値だけを取り出す。 */
const calls = (window) => JSON.parse(JSON.stringify(window.fbq.queue.map((args) => Array.from(args))));

test("PageView は一度だけ。二度読み込まれても送り直さない", () => {
  const { context, window, inserted } = pageContext();
  loadMeasure(context);
  loadMeasure(context);
  const q = calls(window);
  assert.deepEqual(q.filter((a) => a[0] === "init"), [["init", PIXEL_ID]]);
  assert.deepEqual(q.filter((a) => a[0] === "track"), [["track", "PageView"]]);
  assert.equal(inserted.length, 1, "fbevents.js を二度読み込んでいる");
});

test("自動イベントの設定は初期化より前に置く(Lead 以外のイベントを混ぜない)", () => {
  const { context, window } = pageContext();
  loadMeasure(context);
  const q = calls(window);
  const auto = q.findIndex((a) => a[0] === "set" && a[1] === "autoConfig" && a[2] === false && a[3] === PIXEL_ID);
  const init = q.findIndex((a) => a[0] === "init");
  assert.ok(auto >= 0, "自動イベントを切っていない");
  assert.ok(auto < init, "初期化の後では効かない");
});

test("計測ファイルが失敗しても例外をページへ漏らさない", () => {
  const window = { document: { createElement: () => { throw new Error("blocked"); }, getElementsByTagName: () => [] } };
  window.window = window;
  assert.doesNotThrow(() => loadMeasure(vm.createContext(window)));
});

/* ---- Lead: フォームの動き ----
   form.js を実物のまま動かす。画面の部品と送信(fetch)だけを差し替える。 */

function fakeField(value = "") { return { value, checked: true, focus() {}, setSelectionRange() {} }; }

function formPage({ fbq = "spy", responses }) {
  const fields = {
    company: fakeField("シンアイ株式会社"),
    name: fakeField("柴田"),
    email: fakeField("test@example.com"),
    message: fakeField("相談です"),
    "privacy-consent": fakeField(),
    "company-website": fakeField("")
  };
  const button = { disabled: false, querySelector: () => ({ textContent: "" }) };
  let submitHandler = null;
  const form = {
    hidden: false,
    addEventListener: (type, fn) => { if (type === "submit") submitHandler = fn; },
    querySelector: (sel) => {
      if (sel === "[type='submit']") return button;
      const m = sel.match(/\[name='([^']+)'\]/);
      return m ? fields[m[1]] || null : null;
    },
    querySelectorAll: () => []
  };
  const byId = {
    "lp-form": form,
    "lp-error": { hidden: true, textContent: "" },
    "lp-done": { hidden: true, scrollIntoView() {} },
    "lp-done-email": { textContent: "" },
    "lp-done-to": { hidden: true },
    "lp-done-title": { focus() {} }
  };
  const tracked = [];
  const fetches = [];
  const window = {
    document: { getElementById: (id) => byId[id] || null, head: { appendChild() {} }, createElement: () => ({}) },
    fetch: (url, init) => {
      fetches.push({ url, init });
      const next = responses.shift();
      if (next === "network") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve({ ok: next.status === 200, json: () => Promise.resolve(next.body) });
    }
  };
  if (fbq === "spy") window.fbq = (...args) => tracked.push(args);
  if (fbq === "throws") window.fbq = () => { throw new Error("pixel broken"); };
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext(read("start/form.js"), context, { filename: "start/form.js" });
  const submit = () => submitHandler({ preventDefault() {} });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const leads = () => tracked.filter((a) => a[0] === "track" && a[1] === "Lead");
  return { submit, settle, leads, fetches, byId, form };
}

const OK = { status: 200, body: { success: true } };

test("送信が完了したときだけ Lead を一度送る", async () => {
  const page = formPage({ responses: [OK] });
  page.submit();
  assert.equal(page.leads().length, 0, "ボタンを押した時点で Lead を送っている");
  await page.settle();
  assert.equal(page.leads().length, 1);
  assert.equal(page.byId["lp-done"].hidden, false, "完了画面が出ていない");
  const options = page.leads()[0][3];
  assert.ok(options && typeof options.eventID === "string" && options.eventID.length >= 8, "重複を見分ける eventID が無い");
});

test("Lead に入力内容(氏名・メール等)を載せない", async () => {
  const page = formPage({ responses: [OK] });
  page.submit();
  await page.settle();
  const sent = JSON.stringify(page.leads()[0]);
  for (const v of ["test@example.com", "柴田", "シンアイ株式会社", "相談です"]) {
    assert.ok(!sent.includes(v), `入力内容が Meta へ送られる: ${v}`);
  }
});

for (const [label, response] of [
  ["入力の不備(400)", { status: 400, body: { success: false, reason: "email_malformed" } }],
  ["受付上限(busy)", { status: 200, body: { success: false, reason: "busy" } }],
  ["人間確認の失敗", { status: 400, body: { success: false, reason: "turnstile_failed" } }],
  ["送信手段の障害(500)", { status: 500, body: {} }],
  ["応答が読めない", { status: 200, body: null }],
  ["通信エラー", "network"]
]) {
  test(`送信が完了しなければ Lead を送らない: ${label}`, async () => {
    const page = formPage({ responses: [response] });
    page.submit();
    await page.settle();
    assert.equal(page.leads().length, 0);
    assert.equal(page.byId["lp-done"].hidden, true, "失敗なのに完了画面が出た");
  });
}

test("連打しても送信も Lead も一度だけ", async () => {
  const page = formPage({ responses: [OK, OK, OK] });
  page.submit();
  page.submit();
  page.submit();
  await page.settle();
  assert.equal(page.fetches.length, 1, "二重に送信している");
  assert.equal(page.leads().length, 1);
});

test("失敗のあと送り直して成功したら、そのとき一度だけ Lead を送る", async () => {
  const page = formPage({ responses: ["network", OK] });
  page.submit();
  await page.settle();
  assert.equal(page.leads().length, 0);
  page.submit();
  await page.settle();
  assert.equal(page.fetches.length, 2);
  assert.equal(page.leads().length, 1);
});

test("Pixel が読み込めなくても、問い合わせは届き完了画面が出る", async () => {
  const page = formPage({ fbq: "missing", responses: [OK] });
  page.submit();
  await page.settle();
  assert.equal(page.fetches.length, 1);
  assert.equal(page.byId["lp-done"].hidden, false);
});

test("Pixel がエラーを出しても、完了画面は出る", async () => {
  const page = formPage({ fbq: "throws", responses: [OK] });
  page.submit();
  await page.settle();
  assert.equal(page.byId["lp-done"].hidden, false);
});

/* ---- 開示 ----
   Meta ビジネスツール利用規約 第3条は、ピクセルを使う事業者に、第三者のピクセルによる収集・
   広告への利用・拒否(オプトアウト)の方法の説明を求める。記載を消すとピクセルを置けない。 */
test("Pixel を置く限り、プライバシーポリシーに Meta ピクセルの説明と拒否の方法がある", () => {
  const html = read("privacy.html");
  assert.ok(html.includes("Meta Platforms, Inc. の Meta ピクセル"), "送信先の記載が無い");
  assert.ok(html.includes("広告の効果測定や配信に利用されることがあります"), "利用目的の記載が無い");
  assert.ok(html.includes("Meta の広告設定から拒否できます"), "拒否の方法の記載が無い");
  assert.ok(html.includes("フォームに入力された内容は送信しません"), "入力内容を送らない旨の記載が無い");
});
