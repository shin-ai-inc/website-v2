/*
  ShinAI サポートAI — 出力ゲート。

  役割: 侵入の「試み」ではなく「結果」を捕まえる。入力側の検閲は
  Unicode異体字・分割記述で容易に回避されるが、出力に金額や保証が
  現れたという事実は回避できない。ここが最終防壁。

  非LLMの決定的検査にする理由:
  - LLMに判定させるとコストが倍になり、判定自体もインジェクション可能になる
  - 決定的なら、何を止めるかがテストで固定でき、後から検証もできる

  設計上の要:
  - 引っかかったら再生成せず定型文へ差し替える。再生成ループは攻撃者に
    無料の再試行を与え、コストが青天井になる。
  - 過剰検知は営業機会を殺す。「お問い合わせください」と併記された表現や、
    資料に実在する事実の言及は通す。
*/

/* 断定・保証の語。単独では判定せず、金額や納期と組んだときに効かせる場合もある。 */
const ASSERTION_JA = /(必ず|確実に|保証(いた)?し|お約束(いた)?し|間違いなく)/;
const ASSERTION_EN = /\b(guarantee|guaranteed|we promise|certainly will|definitely will)\b/i;

/* 金額。資料に無い数値を当社の口として言わせないため、具体的な額は一律で止める。
   「無料相談」は資料にある事実なので誤検知しないよう、金額の形だけを見る。 */
const MONEY_JA = /([0-9０-９,，]+\s*(円|万円|億円)|[¥￥]\s*[0-9０-９,，]+)/;
const MONEY_EN = /(\$\s*[0-9,]+|\b[0-9,]+\s*(yen|usd|dollars)\b)/i;

/* 納期。期間そのものは資料にもあるため(例: 最短1ヶ月ほど)、
   断定と組んだときだけ止める。「ほど」「目安」等の緩衝がある表現は通す。 */
const DURATION_JA = /[0-9０-９]+\s*(日|週間|ヶ月|カ月|か月|年)/;
const DURATION_EN = /\b[0-9]+\s*(days?|weeks?|months?|years?)\b/i;

/* 起きたか分からない出来事への謝罪。
   苦情を受けると、経緯を何も知らないまま会社を代表して詫び、
   さらに対応まで請け合う応答が出た(実測)。これは事実の承認であり、
   AIが会社に代わって行ってよい行為ではない。
   規範でも禁じているが、指示の遵守に賭けずここでも止める。
   「申し訳ありませんが、資料にありません」のような通常の断りは
   この形を取らないため、巻き込まない。 */
/* 「お詫び」は語幹だけを見る。活用(申し上げます・いたします)を数え上げると
   必ず書き漏らす。通常の断り(「申し訳ありませんが、資料にありません」)は
   この語を使わないため、巻き込まない。 */
const INCIDENT_APOLOGY_JA = /(ご不快|ご不便|ご不満|ご迷惑|不手際|至らず|至りませんで|申し訳ございませんでした|お詫び)/;
const INCIDENT_APOLOGY_EN = /\b(we apologi[sz]e for|sorry for the (inconvenience|trouble)|our (mistake|failure))\b/i;

/* 差し替え用の定型文。止めた事実は伝えず、次の行動だけを示す。 */
const FALLBACK = {
  ja: "恐れ入りますが、その点は個別のご状況によって異なります。お問い合わせフォームからご相談いただければ、担当者より詳しくご案内いたします。",
  en: "That depends on the specifics of your situation. Please reach out through the contact form and we will get back to you with details."
};

/* 苦情への差し替え。詫びも約束もせず、人へ渡すことだけを伝える。 */
const COMPLAINT_REPLY = {
  ja: "ご意見をお寄せいただきありがとうございます。経緯を確認のうえ人からご返答すべき内容ですので、お問い合わせフォームからお送りいただけますでしょうか。担当者が内容を確認いたします。",
  en: "Thank you for raising this. It should be answered by a person who can look into the circumstances, so please send it through the contact form and a member of our team will review it."
};

/**
 * モデル出力を検査する。
 * @returns {{blocked:boolean, text:string, reason?:string}}
 *   blocked時の text は定型文。reason は監査ログ用(利用者には返さない)。
 */
export function screenAnswer(raw, locale) {
  const text = typeof raw === "string" ? raw : "";
  const en = locale === "en";
  const fallback = en ? FALLBACK.en : FALLBACK.ja;

  const money = en ? MONEY_EN : MONEY_JA;
  const assertion = en ? ASSERTION_EN : ASSERTION_JA;
  const duration = en ? DURATION_EN : DURATION_JA;

  /* 経緯を知らない出来事への謝罪は、事実の承認になる。 */
  if ((en ? INCIDENT_APOLOGY_EN : INCIDENT_APOLOGY_JA).test(text)) {
    return {
      blocked: true,
      text: en ? COMPLAINT_REPLY.en : COMPLAINT_REPLY.ja,
      reason: "unverified_apology"
    };
  }

  /* 金額は単独で止める。資料に価格表が無い以上、具体的な額は
     すべてモデルの創作であり、商談・法務のリスクになる。 */
  if (money.test(text)) {
    return { blocked: true, text: fallback, reason: "money_claim" };
  }

  /* 保証・断定は単独で止める。会社を代表した約束にあたる。 */
  if (assertion.test(text)) {
    return { blocked: true, text: fallback, reason: "guarantee_claim" };
  }

  /* 期間は断定と組んだときのみ止める。
     「最短1ヶ月ほど」(資料の事実)は通し、「1ヶ月で完成します」は止める。 */
  if (duration.test(text) && /(で(完成|納品|導入)(でき|し)|以内に(必ず|確実))/.test(text)) {
    return { blocked: true, text: fallback, reason: "deadline_claim" };
  }

  return { blocked: false, text };
}
