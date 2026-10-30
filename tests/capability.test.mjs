/*
  トップの Engineering の区画(#capability)。柴田指示 2026-10-25:
  専門用語(LLM最適化・強化学習・RAG・オンプレミス)が並び、一般の人には「AI = ChatGPT」と結びつかず、
  自分ごととして読めなかった。身近なモデルの名前を入口にし、何をするかを示す。
  続けて柴田指示 2026-10-25: シンアイが「基盤レイヤーの上の、アプリレイヤーを開発する会社」だと
  見て分かるようにする。上から、シンアイの領域(支援・アプリレイヤー) → 基盤レイヤー、と積む。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const section = (rel) => {
  const html = readFileSync(join(ROOT, rel), "utf8");
  const m = html.match(/<section class="section section--ink capability" id="capability"[\s\S]*?<\/section>/);
  assert.ok(m, `${rel} に #capability が無い`);
  return m[0];
};

test("身近なモデルの名前を入口にし、つくるものと支援の範囲を示す", () => {
  const s = section("partials/index.html");
  for (const word of ["ChatGPT", "Claude", "Gemini", "フロンティアモデル", "ローカルLLM", "オープンウェイトモデル",
                      "AIエージェント", "バーティカルAI", "専門特化型AI", "課題の整理", "開発", "運用"]) {
    assert.ok(s.includes(word), word);
  }
});

/** 開きタグから、対応する閉じタグまでを取り出す(同名の入れ子を数える)。 */
const block = (html, cls) => {
  const start = html.search(new RegExp(`<div class="[^"]*\\b${cls}\\b`));
  assert.ok(start >= 0, `${cls} が無い`);
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  assert.fail(`${cls} が閉じていない`);
};

test("シンアイの領域(支援とアプリレイヤー)を括り、その下に基盤レイヤーを置く", () => {
  for (const [rel, ours, app, base] of [["partials/index.html", "ShinAI", "アプリレイヤー", "基盤レイヤー"],
                                        ["partials/en/index.html", "ShinAI", "Application layer", "Foundation layer"]]) {
    const s = section(rel);
    const region = block(s, "capability__ours");
    assert.ok(region.includes(ours), `${rel}: 括りに会社の名前が無い`);
    assert.ok(region.includes(app), `${rel}: アプリレイヤーが括りの外にある`);
    assert.ok(/capability__flow/.test(region), `${rel}: 企画から運用までの支援が括りの外にある`);
    assert.equal(region.includes("capability__chip"), false, `${rel}: 基盤のモデルを自社の領域に含めている`);
    const baseLayer = block(s, "capability__layer--base");
    assert.ok(baseLayer.includes(base) && baseLayer.includes("Gemini"), `${rel}: 基盤レイヤーにモデルが無い`);
    assert.ok(s.indexOf("capability__layer--base") > s.indexOf("capability__ours"), `${rel}: 基盤がアプリより上にある`);
  }
});

test("見出しは読む人の立場で「自社専用」と呼び、本文は主語がシンアイなので「会社ごと」と書く(柴田 2026-10-25 案A)", () => {
  /* 「御社」「貴社」は相手を取引先として呼ぶ語で、自分ごととして読みにくい。
     本文で「自社」と書くと、主語のシンアイの会社と読まれるおそれがある。 */
  const s = section("partials/index.html");
  assert.match(s, /<span class="section__title-line">自社専用のAIへ。<\/span>/);
  assert.match(s, /会社ごとの専用AIを開発し/);
  assert.match(s, /<h3 class="capability__term">会社ごとの専用AIをつくる<\/h3>/);
  assert.doesNotMatch(s, /御社|貴社/);
});

test("一般の人に届かない専門用語を、項目の名前に並べない", () => {
  const s = section("partials/index.html");
  for (const word of ["強化学習", "RAG", "ベクトル検索", "LLM最適化", "オンプレミス"]) {
    assert.equal(s.includes(word), false, word);
  }
});

test("英語版も同じ構成にそろえる", () => {
  const s = section("partials/en/index.html");
  for (const word of ["ChatGPT", "Claude", "Gemini", "frontier models", "local LLM", "open-weight", "AI agents", "Vertical AI", "Clarify", "Build", "Operate"]) {
    assert.ok(s.includes(word), word);
  }
  for (const word of ["Reinforcement learning", "RAG", "vector search", "On-premise"]) {
    assert.equal(s.includes(word), false, word);
  }
});

test("シンアイの範囲は、枠と横書きの見出しで示す(縦書きの括弧は分かりにくい・柴田 2026-10-30)", () => {
  /* 縦書きの小さな文字と細い括弧では、何を括っているのかが読み取れなかった。
     上の二段を枠で囲み、枠の上辺に「ShinAIが担う範囲」を横書きで置く。 */
  for (const [rel, label] of [["partials/index.html", "ShinAIが担う範囲"], ["partials/en/index.html", "What ShinAI takes on"]]) {
    const region = block(section(rel), "capability__ours");
    assert.match(region, new RegExp(`<p class="capability__scope">${label}</p>`), rel);
    assert.equal(region.includes("capability__bracket"), false, `${rel}: 括弧が残っている`);
  }
  const css = readFileSync(join(ROOT, "styles/sections/capability.css"), "utf8");
  assert.equal(/writing-mode/.test(css), false, "縦書きが残っている");
});

test("話の起点を業務の課題に置く。AIは課題に合わせて選ぶ手段として書く(柴田 2026-10-30)", () => {
  /* 依頼する人の目的はAIを入れることではなく、業務の課題を解くこと。図の構造は保ち、
     見出しの下の一文・支援の流れ・継ぎ目の一文を、課題から始まる順番にする。 */
  const s = section("partials/index.html");
  const lead = s.match(/<p class="section__lead">([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, "");
  assert.ok(lead.startsWith("まず業務の課題を伺い"), lead);
  assert.ok(lead.indexOf("課題") < lead.indexOf("モデル"), "課題より先にモデルが来ている");
  const steps = [...s.matchAll(/<li class="capability__step">([^<]*)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(steps, ["課題の整理", "開発", "運用"]);
  const seam = s.match(/<p class="capability__seam[\s\S]*?<\/p>/)[0].replace(/<[^>]+>/g, "");
  assert.match(seam, /^課題に合うモデルを選び/);
  const en = section("partials/en/index.html");
  const enSteps = [...en.matchAll(/<li class="capability__step">([^<]*)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(enSteps, ["Clarify", "Build", "Operate"]);
  assert.match(en, /challenge/);
});
