/*
  公開物のSEO・AI検索向け申告の検証。
  node --test tests/*.test.mjs で実行(依存なし・Node標準のテストランナー)。

  構造化データは本文から抽出して組み立てている。抽出が壊れても画面は正常に見えるため、
  目視では気づけない(実際、詳細ページへのURLが黙って落ちたことがある)。
  「壊れても見た目に出ない」ものだけを、ここで機械的に押さえる。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = (...p) => join(ROOT, "dist", ...p);

const readDist = (rel) => {
  const path = dist(rel);
  if (!existsSync(path)) {
    throw new Error(`${rel} が未生成。先に node _build/build.mjs を実行する。`);
  }
  return readFileSync(path, "utf8");
};

/** ページ内の全 JSON-LD を解析して返す。構文が壊れていればここで落ちる。 */
const ldOf = (rel) =>
  [...readDist(rel).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));

const typed = (rel, type) => ldOf(rel).filter((o) => o["@type"] === type);

const PAGES = ["index.html", "services.html", "industries.html", "about.html",
               "faq.html", "contact.html", "news.html", "privacy.html", "terms.html"];

test("全ページのJSON-LDが構文として正しい", () => {
  for (const p of PAGES) {
    for (const loc of ["", "en/"]) assert.ok(ldOf(loc + p).length > 0, loc + p);
  }
});

test("全ページが自身を WebPage として申告し、更新日を持つ", () => {
  for (const p of PAGES) {
    for (const loc of ["", "en/"]) {
      const [page] = typed(loc + p, "WebPage");
      assert.ok(page, `WebPage がない: ${loc}${p}`);
      assert.match(page.dateModified, /^\d{4}-\d{2}-\d{2}$/, loc + p);
      assert.ok(page["@id"].startsWith("https://shinai-inc.jp/"), page["@id"]);
    }
  }
});

test("更新日はビルド日ではなく本文の変更日である", () => {
  /* 全ページが同じ日付なら、本文の変更日ではなくビルド日を出している。 */
  const dates = new Set(PAGES.map((p) => typed(p, "WebPage")[0].dateModified));
  assert.ok(dates.size > 1, `全ページが同一日付: ${[...dates]}`);
});

test("お知らせの各項目が引用できるURLと日付を持つ", () => {
  for (const loc of ["", "en/"]) {
    const [list] = typed(loc + "news.html", "ItemList");
    assert.ok(list, "ItemList がない");
    assert.ok(list.itemListElement.length >= 2, "項目が足りない");
    for (const { item } of list.itemListElement) {
      assert.equal(item["@type"], "NewsArticle");
      assert.match(item.datePublished, /^\d{4}-\d{2}-\d{2}$/, item.headline);
      assert.ok(item.headline.length > 0 && item.description.length > 0, item.url);
      assert.ok(item.image.startsWith("https://shinai-inc.jp/assets/"), item.image);
    }
    /* 詳細ページを持つ項目は、一覧ではなくその記事のURLを指すこと。
       抽出が崩れると黙って一覧URLへ倒れる(見た目には出ない)。 */
    const urls = list.itemListElement.map((e) => e.item.url);
    assert.ok(urls.some((u) => u.includes("news-20251205")), `記事URLが落ちている: ${urls}`);
    assert.ok(urls.some((u) => u.includes("#")), `アンカーが落ちている: ${urls}`);
    assert.equal(new Set(urls).size, urls.length, `URLが重複している: ${urls}`);
  }
});

test("お知らせのアンカーが本文に実在する", () => {
  for (const loc of ["", "en/"]) {
    const html = readDist(loc + "news.html");
    for (const { item } of typed(loc + "news.html", "ItemList")[0].itemListElement) {
      const hash = item.url.split("#")[1];
      if (hash) assert.ok(html.includes(`id="${hash}"`), `参照先がない: #${hash}`);
    }
  }
});

test("サービスは本文の見出しから申告される", () => {
  for (const loc of ["", "en/"]) {
    const [list] = typed(loc + "services.html", "ItemList");
    assert.ok(list, "ItemList がない");
    assert.equal(list.itemListElement.length, 3, "提供する三つの価値と一致しない");
    for (const { item } of list.itemListElement) {
      assert.equal(item["@type"], "Service");
      assert.ok(item.name.length > 0 && item.description.length > 10, item.name);
    }
  }
});

test("sitemap が全URLに更新日を持つ", () => {
  const xml = readDist("sitemap.xml");
  const locs = (xml.match(/<loc>/g) || []).length;
  const mods = (xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length;
  assert.equal(locs, mods, "lastmod のないURLがある");
});

test("robots が主要なAI巡回者を明示的に許可する", () => {
  const txt = readDist("robots.txt");
  for (const agent of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
    assert.match(txt, new RegExp(`User-agent: ${agent}\\nAllow: /`), agent);
  }
  assert.match(txt, /Sitemap: https:\/\/shinai-inc\.jp\/sitemap\.xml/);
});

test("llms.txt が全ページを実在するURLで案内する", () => {
  const txt = readDist("llms.txt");
  const urls = [...txt.matchAll(/\((https:\/\/shinai-inc\.jp\/[^)]*)\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 14, `URLが少ない: ${urls.length}`);
  for (const u of urls) {
    const rel = u.replace("https://shinai-inc.jp/", "") || "index.html";
    const file = rel.endsWith("/") ? rel + "index.html" : rel;
    assert.ok(existsSync(dist(file)), `実体がない: ${u}`);
  }
  /* 住所の非公開方針は、AI向けの案内にも等しく適用される。 */
  assert.ok(!txt.includes("井野町"), "番地が含まれている");
});

/* ---- 地域(群馬・高崎)の申告 ----
   title は画面に出る要素であり、ブランドの表現としてこのまま据え置くと決めた。
   よって地域の関連性は、画面に出ない層(構造化データ・meta description・
   AI向けの平文)だけで支える。この層が欠けると地域クエリでの手掛かりが
   ゼロになるため、目視では気づけない申告をここで機械的に固定する。 */

test("組織が地域事業者(ProfessionalService)としても申告される", () => {
  for (const loc of ["", "en/"]) {
    const org = ldOf(loc + "index.html")
      .find((o) => String(o["@id"] || "").endsWith("#organization"));
    assert.ok(org, `Organization がない: ${loc}`);
    const types = [].concat(org["@type"]);
    assert.ok(types.includes("Organization"), types);
    /* LocalBusiness の下位型。所在地を持つ実体であることを型として示す。 */
    assert.ok(types.includes("ProfessionalService"), `地域事業者の型がない: ${types}`);
    assert.equal(org.address["@type"], "PostalAddress");
    assert.ok(org.address.addressLocality.length > 0, "市区町村がない");
  }
});

test("事業提供範囲に高崎市が含まれる", () => {
  const org = ldOf("index.html").find((o) => String(o["@id"] || "").endsWith("#organization"));
  const names = org.areaServed.map((a) => a.name);
  assert.ok(names.some((n) => n.includes("高崎")), `高崎がない: ${names}`);
  assert.ok(names.some((n) => n.includes("群馬")), `群馬がない: ${names}`);
});

/** トップページの Organization ノード(日英どちらも同一 @id)。 */
const orgOf = (dir = "") =>
  ldOf(dir + "index.html").find((o) => String(o["@id"] || "").endsWith("#organization"));

test("組織がロゴを申告する", () => {
  /* 検索結果・ナレッジパネルで企業ロゴを出すかの判断に使われる。
     og:image(共有カード)とは用途が違うため、別に持たせる。 */
  for (const dir of ["", "en/"]) {
    const org = orgOf(dir);
    assert.match(org.logo, /^https:\/\/shinai-inc\.jp\/assets\/.+\.(png|svg)$/, `logo: ${org.logo}`);
    assert.ok(existsSync(dist(org.logo.replace("https://shinai-inc.jp/", ""))),
      `ロゴの実体がない: ${org.logo}`);
  }
});

test("組織が受付時間を申告し、本文の記載と一致する", () => {
  /* 本文(会社概要・トップのCTA)に既に出ている事実を機械可読にするだけ。
     両者がずれると、画面とAIの答えが食い違う。 */
  const spec = orgOf().openingHoursSpecification;
  assert.ok(Array.isArray(spec) && spec.length > 0, "受付時間がない");
  assert.equal(spec[0].opens, "09:00");
  assert.equal(spec[0].closes, "18:00");
  assert.deepEqual(spec[0].dayOfWeek,
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  assert.ok(readDist("about.html").includes("平日 9:00–18:00"), "本文の記載が変わっている");
});

test("組織が法人番号で公的登記と結ばれる", () => {
  /* 検査用数字(先頭1桁)を残る12桁から再計算し、書き間違いをここで止める。
     国税庁の算式: 9 - (Σ 右からn桁目の数字 × (nが奇数なら1、偶数なら2)) mod 9 */
  const NUMBER = "9070001044403";
  const base = NUMBER.slice(1);
  const sum = [...base].reverse()
    .reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 2), 0);
  assert.equal(Number(NUMBER[0]), 9 - (sum % 9), "検査用数字が合わない");

  for (const dir of ["", "en/"]) {
    const org = orgOf(dir);
    assert.equal(org.identifier["@type"], "PropertyValue");
    assert.equal(org.identifier.value, NUMBER);
    /* 公的データベース上の自社ページを参照させ、実体の同一性を裏づける。 */
    const same = [].concat(org.sameAs || []);
    assert.ok(same.some((u) => u.includes("houjin-bangou.nta.go.jp") && u.includes(NUMBER)),
      `国税庁の参照がない: ${same}`);
    assert.ok(same.some((u) => u.includes("info.gbiz.go.jp") && u.includes(NUMBER)),
      `gBizINFOの参照がない: ${same}`);
    for (const u of same) assert.match(u, /^https:\/\//, u);
  }
});

test("組織が連絡手段と設立地を申告する", () => {
  for (const dir of ["", "en/"]) {
    const org = orgOf(dir);
    assert.equal(org.contactPoint["@type"], "ContactPoint");
    assert.equal(org.contactPoint.email, "contact@shinai-inc.jp");
    assert.ok(org.contactPoint.availableLanguage.length >= 2, "対応言語がない");
    assert.equal(org.foundingLocation["@type"], "Place");
    assert.match(org.foundingLocation.address.addressLocality, /高崎|Takasaki/);
  }
});

test("サイト全体の発行主体が組織へ結ばれる", () => {
  for (const dir of ["", "en/"]) {
    const site = typed(dir + "index.html", "WebSite")[0];
    assert.equal(site.publisher["@id"], "https://shinai-inc.jp/#organization");
  }
});

test("お知らせの著者が代表個人として申告される", () => {
  /* 誰が書いたか分からない記事は、AI検索にとって引用の重みが落ちる。
     発行者(組織)と著者(個人)は別物であり、両方を申告する。 */
  const article = typed("news-20251205-takasaki-press.html", "NewsArticle")[0];
  assert.equal(article.author["@id"], "https://shinai-inc.jp/about.html#founder");
  assert.equal(article.publisher["@id"], "https://shinai-inc.jp/#organization");
  for (const { item } of typed("news.html", "ItemList")[0].itemListElement) {
    assert.equal(item.author["@id"], "https://shinai-inc.jp/about.html#founder");
  }
});

test("サービスの提供範囲に群馬県が含まれる", () => {
  const [list] = typed("services.html", "ItemList");
  for (const { item } of list.itemListElement) {
    const names = [].concat(item.areaServed).map((a) => a.name);
    assert.ok(names.some((n) => n.includes("群馬")), `${item.name}: ${names}`);
    assert.ok(names.some((n) => n.includes("日本")), `${item.name}: ${names}`);
  }
});

test("llms.txt が会社概要の事実を平文で持つ", () => {
  /* AI検索が最も問われるのは会社の基礎事実であり、HTMLを解析させずに渡す。
     本文の定義リストを唯一の出所とするので、書き換えれば案内も追随する。 */
  const txt = readDist("llms.txt");
  for (const term of ["商号", "設立", "代表", "所在地", "対応地域", "受付時間"]) {
    assert.ok(txt.includes(term), `${term} がない`);
  }
  assert.ok(txt.includes("シンアイ株式会社"), "商号の値がない");
  assert.ok(txt.includes("群馬県高崎市"), "所在地の値がない");
  /* 住所の非公開方針はここでも守る(番地は出さない)。 */
  assert.ok(!txt.includes("井野町"), "番地が含まれている");
});

test("主要ページの meta description が地域を含む", () => {
  /* title を据え置いた分、検索結果に出る文字列で地域を示せるのはここだけになる。 */
  for (const p of ["index.html", "services.html", "about.html", "faq.html", "contact.html"]) {
    const desc = readDist(p).match(/<meta name="description" content="([\s\S]*?)">/)[1];
    assert.match(desc, /群馬/, `description に地域語がない: ${p}`);
  }
});

test("llms.txt が地域を明示する(AI検索が最初に読む平文)", () => {
  const txt = readDist("llms.txt");
  assert.match(txt, /群馬県高崎市/, "所在地の記載がない");
});
