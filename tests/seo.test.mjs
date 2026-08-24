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
