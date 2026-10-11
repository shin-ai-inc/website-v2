/*
  日次予算メーターと出力ゲートの検証。
  node --test tests/budget.test.mjs

  予算メーター: 低速分散攻撃(多数IPから毎分1回)はどんなper-IP制限も抜ける。
  グローバルな日次上限だけがこれを止める。ここが口座を守る最後の砦。

  出力ゲート: 侵入の「試み」ではなく「結果」を捕まえる唯一の層。
  公式サイトのボットに金額や納期を約束させないための決定的検査。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { jstDayKey, shouldBlockByBudget, estimateCostUsd } from "../api/lib/budget.mjs";
import { advanceMeter } from "../api/lib/budget.mjs";
import { screenAnswer } from "../api/lib/outgate.mjs";

/* ---- 日次キー(JST) ---- */

test("日次キーはJSTで切り替わる(運用感覚と一致させる)", () => {
  // UTC 2026-08-11 14:59 は JST 8/11 23:59 → まだ8/11
  assert.equal(jstDayKey(new Date("2026-08-11T14:59:00Z")), "2026-08-11");
  // UTC 2026-08-11 15:00 は JST 8/12 00:00 → 8/12へ繰り上がる
  assert.equal(jstDayKey(new Date("2026-08-11T15:00:00Z")), "2026-08-12");
});

/* ---- 予算判定 ---- */

test("上限未満は通し、到達したら止める", () => {
  assert.equal(shouldBlockByBudget({ count: 0, limit: 300 }), false);
  assert.equal(shouldBlockByBudget({ count: 299, limit: 300 }), false);
  assert.equal(shouldBlockByBudget({ count: 300, limit: 300 }), true, "到達で遮断");
  assert.equal(shouldBlockByBudget({ count: 999, limit: 300 }), true);
});

test("壊れた状態でも安全側に倒す(未知なら止める)", () => {
  // メーターが読めない・不正な値のときに素通りさせると、攻撃時に無防備になる。
  assert.equal(shouldBlockByBudget({ count: NaN, limit: 300 }), true);
  assert.equal(shouldBlockByBudget({ count: 10, limit: 0 }), true);
  assert.equal(shouldBlockByBudget(null), true);
});

test("コスト概算が実勢と桁で合う(閾値の根拠になる)", () => {
  // 知識全文(約9,000入力トークン)+ 短い応答(300出力)を1件と見る
  const usd = estimateCostUsd({ inputTokens: 9000, outputTokens: 300 });
  assert.ok(usd > 0.0002 && usd < 0.01, `1件あたり ${usd} USD は現実的な範囲`);
});

/* ---- 出力ゲート ---- */

test("資料にない金額の約束を止める", () => {
  for (const bad of ["導入費用は50万円です。", "月額10万円でご提供できます。",
                     "料金は¥300,000からとなります。"]) {
    const r = screenAnswer(bad, "ja");
    assert.equal(r.blocked, true, `「${bad}」を止める`);
  }
});

test("納期の断定を止める", () => {
  for (const bad of ["2週間で必ず納品できます。", "1ヶ月で確実に完成します。"]) {
    assert.equal(screenAnswer(bad, "ja").blocked, true, `「${bad}」を止める`);
  }
});

test("保証・断定表現を止める", () => {
  for (const bad of ["必ず成果が出ます。", "確実にコストを削減できます。",
                     "成果を保証いたします。"]) {
    assert.equal(screenAnswer(bad, "ja").blocked, true, `「${bad}」を止める`);
  }
});

test("正常な案内は通す(過剰検知で営業機会を殺さない)", () => {
  for (const good of [
    "暗黙知の解消支援、企業専用AIエージェント開発、AI化伴走支援を行っています。",
    "群馬県高崎市を拠点に、全国のお客様へオンラインで対応しています。",
    "詳しいご相談はお問い合わせフォームからお願いいたします。",
    "小さく検証してから段階的に広げる進め方をとっています。",
    "規模や目的により異なりますので、お問い合わせフォームからご相談ください。"
  ]) {
    const r = screenAnswer(good, "ja");
    assert.equal(r.blocked, false, `「${good}」は通す`);
  }
});

test("止めたときは定型文へ差し替える(再生成しない)", () => {
  // 再生成ループは攻撃者に無料の再試行を与え、コストが青天井になる。
  const r = screenAnswer("必ず50万円で納品します。", "ja");
  assert.equal(r.blocked, true);
  assert.ok(r.text.includes("お問い合わせ"), "問い合わせへ誘導する");
  assert.ok(!r.text.includes("50万円"), "危険な内容を残さない");
});

test("英語出力も同じ規範で検査する", () => {
  assert.equal(screenAnswer("It costs 500,000 yen.", "en").blocked, true);
  assert.equal(screenAnswer("We guarantee results.", "en").blocked, true);
  assert.equal(
    screenAnswer("We help companies turn tacit knowledge into AI assets.", "en").blocked,
    false, "正常な英語案内は通す"
  );
});

/* ---- 経緯を知らない出来事への謝罪 ---- */

test("苦情への謝罪は止め、人へ渡す案内に差し替える", () => {
  const r = screenAnswer("ご不快な思いをさせてしまい、大変申し訳ございません。責任者が対応いたします。", "ja");
  assert.equal(r.blocked, true);
  assert.equal(r.reason, "unverified_apology");
  assert.match(r.text, /お問い合わせフォーム/);
  assert.ok(!/申し訳/.test(r.text), "差し替え文でも詫びない");
});

test("通常の断り文は謝罪とみなさない(過剰検知で案内を殺さない)", () => {
  const r = screenAnswer("申し訳ありませんが、その点は資料に記載がございません。", "ja");
  assert.equal(r.blocked, false);
});

test("英語でも経緯不明の謝罪を止める", () => {
  assert.equal(screenAnswer("We apologise for the inconvenience caused.", "en").blocked, true);
});

test("謝罪表現の活用形を取りこぼさない", () => {
  for (const s of ["ご不便をおかけしていることに対し、心よりお詫び申し上げます。",
                   "ご迷惑をおかけしました。", "この度は誠に申し訳ございませんでした。",
                   "ご不満をお感じになられているとのこと、申し訳ございません。"]) {
    assert.equal(screenAnswer(s, "ja").blocked, true, `止まらない: ${s}`);
  }
});

/* ---- メーターの前進(段階遮断・同一IP上限の土台) ---- */

test("consume は1進め、日付が変わると0から数え直す", () => {
  const a = advanceMeter({ dayKey: "2026-09-11", count: 4 }, "2026-09-11");
  assert.equal(a.countBefore, 4);
  assert.deepEqual(a.next, { dayKey: "2026-09-11", count: 5 });
  const b = advanceMeter({ dayKey: "2026-09-11", count: 4 }, "2026-09-12");
  assert.equal(b.countBefore, 0, "翌日は0から");
  assert.deepEqual(b.next, { dayKey: "2026-09-12", count: 1 });
});

test("peek は読むだけで進めない(判定が上限を食い潰さない)", () => {
  const r = advanceMeter({ dayKey: "2026-09-11", count: 4 }, "2026-09-11", "peek");
  assert.equal(r.countBefore, 4);
  assert.equal(r.next, null);
});

test("壊れた保存値でも数え直せる", () => {
  for (const stored of [undefined, null, {}, { dayKey: "2026-09-11", count: "x" }]) {
    const r = advanceMeter(stored, "2026-09-11");
    assert.equal(r.countBefore, 0);
    assert.deepEqual(r.next, { dayKey: "2026-09-11", count: 1 });
  }
});

test("段階遮断と同一IP上限は shouldBlockByBudget と同じ境界で止まる", () => {
  assert.equal(shouldBlockByBudget({ count: 4, limit: 5 }), false, "5回目までは通す");
  assert.equal(shouldBlockByBudget({ count: 5, limit: 5 }), true, "6回目から止める");
  assert.equal(shouldBlockByBudget({ count: 2, limit: 3 }), false, "問い合わせ3件目は通す");
  assert.equal(shouldBlockByBudget({ count: 3, limit: 3 }), true, "4件目は止める");
});


/* ---- 出力ゲートの網目(2026-10-11 の監査で素通りした形) ---- */

test("漢数字・千円百円・外貨の金額を止める", () => {
  for (const bad of [
    "初期費用は五十万円ほどです。",
    "月額は三万円から承ります。",
    "費用は一千万円を見込んでください。",
    "導入費は 50千円です。",
    "一回あたり 500百円で承れます。",
    "費用は 5,000ドルです。",
    "価格は 5000 USD です。",
    "お見積りは 700,000 JPY となります。",
    "費用は 3,000 EUR 前後です。",
    "料金は €3,000 です。",
    "料金は $5,000 です。"
  ]) {
    const r = screenAnswer(bad, "ja");
    assert.equal(r.blocked, true, `止まらない: ${bad}`);
    assert.equal(r.reason, "money_claim", bad);
  }
});

test("「絶対に」「確約」「100%」「断言」「必ずや」「お約束」を止める", () => {
  for (const bad of [
    "絶対に成果が出ます。",
    "成果を確約いたします。",
    "100%業務が効率化されます。",
    "１００％削減できると断言できます。",
    "効果が出ると断言します。",
    "必ずや成果につながります。",
    "ご満足いただけることをお約束できます。"
  ]) {
    const r = screenAnswer(bad, "ja");
    assert.equal(r.blocked, true, `止まらない: ${bad}`);
    assert.equal(r.reason, "guarantee_claim", bad);
  }
});

test("納期の言い切りを止める(可能・いたします・させます・以内に)", () => {
  for (const bad of [
    "2週間で納品可能です。",
    "1ヶ月で導入いたします。",
    "3週間でリリースします。",
    "2か月で完成させます。",
    "3週間以内に納品いたします。",
    "1ヶ月以内に導入が終わります。",
    "2週間以内に完成する見込みです。"
  ]) {
    const r = screenAnswer(bad, "ja");
    assert.equal(r.blocked, true, `止まらない: ${bad}`);
    assert.equal(r.reason, "deadline_claim", bad);
  }
});

test("英語の金額・納期・断定も止める", () => {
  for (const [bad, reason] of [
    ["It costs about 5,000 dollars.", "money_claim"],
    ["The fee is €3,000.", "money_claim"],
    ["Pricing starts at 300,000 JPY.", "money_claim"],
    ["Expect around 2,000 USD per month.", "money_claim"],
    ["It costs 5000 to start.", "money_claim"],
    ["We can deliver in 2 weeks.", "deadline_claim"],
    ["We will complete it within 3 weeks.", "deadline_claim"],
    ["I am absolutely certain this will work.", "guarantee_claim"],
    ["This will 100% reduce your costs.", "guarantee_claim"]
  ]) {
    const r = screenAnswer(bad, "en");
    assert.equal(r.blocked, true, `止まらない: ${bad}`);
    assert.equal(r.reason, reason, bad);
  }
});

test("資料にある期間の目安と、通常の案内は通す(網を広げても営業機会を殺さない)", () => {
  for (const good of [
    "規模と目的にもよりますが、小規模なプロトタイプであれば最短2週間ほどで形にできる場合があります。",
    "目安として、課題の整理に1〜2週間、動くものをお見せするまで2〜4週間です。",
    "無料相談で状況をうかがってから、進め方を一緒に整理します。",
    "円滑な引き継ぎのため、判断の根拠を言葉にして残します。",
    "2026年8月に法人化しました。",
    "最終的な判断は人が行う運用を前提に設計しています。",
    "費用は目的と規模で大きく変わります。ご予算に合わせた見立ては無料相談でお伝えしています。"
  ]) {
    assert.equal(screenAnswer(good, "ja").blocked, false, `過剰検知: ${good}`);
  }
  for (const good of [
    "A small prototype can sometimes take shape in as little as two weeks.",
    "It varies a great deal with purpose and scale. We put a figure to it after a free consultation.",
    "Validation on real operational data takes approximately 2-6 weeks."
  ]) {
    assert.equal(screenAnswer(good, "en").blocked, false, `過剰検知: ${good}`);
  }
});
