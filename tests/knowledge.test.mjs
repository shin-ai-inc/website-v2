/*
  知識ベース生成の検証。
  node --test tests/*.test.mjs で実行(依存なし・Node標準のテストランナー)。

  この知識ベースはチャットボットが参照する唯一の事実源。壊れたまま公開すると
  AIが誤った会社情報を配る。生成物の性質を機械で固定する。
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex, hybridSearch } from "../api/lib/retrieve.mjs";
import { chunkPage, catalogChunk } from "../_build/chunk.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const kbPath = (locale) => join(ROOT, "dist", "api", `knowledge.${locale}.json`);

const loadKb = (locale = "ja") => {
  const path = kbPath(locale);
  if (!existsSync(path)) {
    throw new Error("知識ベースが未生成。先に node _build/build.mjs を実行する。");
  }
  return JSON.parse(readFileSync(path, "utf8"));
};

test("チャンクが生成され、想定ページを網羅している", () => {
  const kb = loadKb();
  assert.ok(Array.isArray(kb.chunks), "chunks は配列");
  const urls = kb.chunks.map((c) => c.url).join(" ");
  for (const expected of ["services.html", "industries.html", "about.html",
                          "faq.html", "contact.html"]) {
    assert.ok(urls.includes(expected), `${expected} 由来のチャンクがある`);
  }
});

test("各チャンクが題名・URL・本文を持つ", () => {
  for (const c of loadKb().chunks) {
    assert.ok(c.id, "id あり");
    assert.ok(c.title && c.title.length > 0, `${c.id}: title あり`);
    assert.ok(c.url && c.url.startsWith("https://"), `${c.id}: 絶対URL`);
    assert.ok(c.text && c.text.length > 0, `${c.id}: 本文あり`);
  }
});

test("チャンクが埋もれる大きさにならない(全文投入で失敗した設計へ戻さない)", () => {
  /* 日英の双方を見る。片方しか見ない検査は、もう片方を守らない。
     実際、英語版の代表メッセージが1,350字に達していたが検知できなかった。 */
  for (const locale of ["ja", "en"]) {
    for (const c of loadKb(locale).chunks) {
      assert.ok(c.text.length <= 1000,
        `${locale}: ${c.id} が ${c.text.length}字と長すぎる`);
    }
  }
});

test("英語側も題名・URL・本文を備える", () => {
  for (const c of loadKb("en").chunks) {
    assert.ok(c.id && c.title && c.text, `${c.id}: 欠けがない`);
    assert.ok(c.url.startsWith("https://"), `${c.id}: 絶対URL`);
  }
});

test("HTMLタグ・スクリプトが本文に混入しない", () => {
  for (const c of loadKb().chunks) {
    assert.ok(!/<[a-z/][^>]*>/i.test(c.text), `${c.id}: タグ痕跡なし`);
    assert.ok(!/function\s*\(|window\.|=>/.test(c.text), `${c.id}: JS痕跡なし`);
  }
});

test("会社の基本事実が一枚のチャンクに揃い、常時同梱になっている", () => {
  const pin = loadKb().chunks.filter((c) => c.pin);
  assert.equal(pin.length, 1, "常時同梱は会社概要の1件だけ");
  for (const fact of ["シンアイ株式会社", "柴田", "高崎"]) {
    assert.ok(pin[0].text.includes(fact), `「${fact}」が事実カードにある`);
  }
});

test("連絡先が実在のものと一致する(古い情報を配らない)", () => {
  const all = loadKb().chunks.map((c) => c.text).join(" ");
  assert.ok(all.includes("contact@shinai-inc.jp"), "現行の連絡先を含む");
  assert.ok(!all.includes("shinai.life@gmail.com"), "旧アドレスを含まない");
  assert.ok(!/Tokyo Innovation Base|丸の内/.test(all), "削除済みの旧拠点を含まない");
});

test("1回の応答で渡す根拠が短く収まる(埋もれと費用の再発防止)", () => {
  const kb = loadKb();
  const index = buildIndex(kb.chunks);
  for (const q of ["費用はいくらですか", "製造業でも使えますか", "商号を教えてください"]) {
    const chars = hybridSearch(q, null, index, { k: 6 })
      .reduce((n, c) => n + c.text.length, 0);
    assert.ok(chars < 4000, `「${q}」で ${chars}字は多すぎる`);
  }
});

test("機密の痕跡を含まない(公開情報のみで構成される)", () => {
  const all = loadKb().chunks.map((c) => c.text).join(" ");
  for (const secret of ["sk-", "api_key", "API_KEY", "Bearer ", "password"]) {
    assert.ok(!all.includes(secret), `「${secret}」を含まない`);
  }
});

test("実データで検索が要点を当てる(字面のみでも成立すること)", () => {
  const index = buildIndex(loadKb().chunks);
  const cases = [
    ["商号を教えてください", /シンアイ株式会社/],
    ["費用はどのくらいかかりますか", /費用|料金|無料相談|見積/],
    ["製造業で使えますか", /製造/],
    ["問い合わせ先を教えてください", /contact@shinai-inc\.jp|お問い合わせ/],
    /* 稀少な固有名詞が、日本語の定型的な言い回しに押し流されないこと。
       「どんな」「ですか」を数えていた頃、この質問は代表の経歴を落として
       無関係なFAQを6件返した。 */
    ["柴田さんはどんな経歴の方ですか", /消防|独学|エンジニア/],
    ["代表はAIエンジニアなのですか", /AIエンジニア/],
    ["高崎商工会議所での登壇について教えてください", /高崎商工会議所/]
  ];
  for (const [q, expected] of cases) {
    const text = hybridSearch(q, null, index, { k: 6 }).map((c) => c.text).join("\n");
    assert.match(text, expected, `「${q}」の根拠が選ばれていない`);
  }
});

test("人物の役職を取り違えない(語をまたぐ偶然の一致に負けない)", () => {
  const index = buildIndex(loadKb().chunks);
  for (const q of ["柴田さんの経歴と役職を教えてください", "代表はどんな人ですか"]) {
    const hits = hybridSearch(q, null, index, { k: 6 });
    const top = hits.find((c) => !c.pin);
    assert.match(top.title, /柴田|代表/, `「${q}」で ${top.title.split("\n")[0]} が1位になった`);
  }
});

test("CTOを尋ねたら該当者のチャンクが選ばれる", () => {
  const index = buildIndex(loadKb().chunks);
  const hits = hybridSearch("CTOはどなたですか", null, index, { k: 6 });
  const top = hits.find((c) => !c.pin);
  assert.match(top.text, /最高技術責任者/);
  assert.ok(!/柴田/.test(top.text), "代表の記述を返してはいけない");
});

test("公開HTMLと知識ベースが乖離していない(ビルド忘れの検知)", () => {
  /* 知識ベースは生成物だが、リポジトリに入っている。ページを直して
     ビルドを忘れたまま Worker をデプロイすると、AIは古い事実を配り続ける。
     壊れ方が静かなので、機械で見張る。 */
  const kb = loadKb();
  const pages = [
    ["about.html", "https://shinai-inc.jp/about.html"],
    ["faq.html", "https://shinai-inc.jp/faq.html"],
    ["services.html", "https://shinai-inc.jp/services.html"]
  ];
  for (const [file, url] of pages) {
    const html = readFileSync(join(ROOT, "dist", file), "utf8");
    const fresh = chunkPage(html, {
      title: "x", url, slug: file.replace(/\.html$/, ""),
      pinDl: file === "about.html"
    });
    /* 目次(pinFor)は chunkPage ではなく catalogChunk の生成物。下で別に見張る。 */
    const committed = kb.chunks.filter((c) => c.url === url && !c.pinFor);
    assert.equal(committed.length, fresh.length,
      `${file}: 公開HTMLは${fresh.length}件だが知識ベースは${committed.length}件。` +
      "node _build/build.mjs を実行すること");
    const freshText = fresh.map((c) => c.text).join("\n");
    const committedText = committed.map((c) => c.text).join("\n");
    assert.equal(committedText, freshText,
      `${file}: 本文が公開HTMLと一致しない。node _build/build.mjs を実行すること`);
  }
});

test("番地から先が知識ベースに入らない(日英とも)", () => {
  /* 秘密ではなくサイトにも載っているが、チャットからは出さないと決めた記述。
     出力側で言い換えるのではなく、モデルへ渡す前に落とす。 */
  for (const locale of ["ja", "en"]) {
    const all = loadKb(locale).chunks.map((c) => c.text).join(" ");
    for (const fragment of ["井野町", "オークス", "Ino-machi", "Oaks Avenue"]) {
      assert.ok(!all.includes(fragment), `${locale}: 「${fragment}」が残っている`);
    }
    assert.ok(/高崎|Takasaki/.test(all), `${locale}: 拠点は残す`);
  }
});

test("サービスの目次が三つの柱を名指しし、公開HTMLと一致する", () => {
  /* 「サービスを紹介してください」で研究領域だけを返した誤りを構造で止める。
     目次が消える・古びる・柱を落とすのいずれも、静かに同じ誤りへ戻す。 */
  for (const locale of ["ja", "en"]) {
    const kb = loadKb(locale);
    const dir = locale === "ja" ? "" : "en/";
    const catalog = kb.chunks.find((c) => c.pinFor === "services");
    assert.ok(catalog, `${locale}: サービスの目次がある`);

    const html = readFileSync(join(ROOT, "dist", dir + "services.html"), "utf8");
    const fresh = catalogChunk(html, {
      slug: "services", url: catalog.url, title: "x",
      catalogTitle: "x", catalogLead: "", catalogTail: ""
    });
    for (const line of fresh.text.split("\n").filter(Boolean)) {
      assert.ok(catalog.text.includes(line),
        `${locale}: 目次が公開HTMLと一致しない。node _build/build.mjs を実行すること`);
    }
    assert.equal(fresh.text.split("\n").filter(Boolean).length, 3,
      `${locale}: 提供価値は三つ。増減したら文言も見直す`);
  }
});

test("公開する知識ベースが全チャンクのベクトルを備えている", () => {
  /* ベクトルはリポジトリに入っている前提とする。素の状態から取り出して
     デプロイしても、検索が字面のみへ落ちないこと。
     欠落は静かで、症状は「たまに見つからない」としてしか現れない。
     Worker が実際に同梱するのは api/ 側なので、そちらを見る。 */
  for (const locale of ["ja", "en"]) {
    const path = join(ROOT, "api", `knowledge.${locale}.json`);
    const kb = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(kb.embedModel, "text-embedding-3-small",
      `${locale}: 埋め込みモデルが記録されていない。鍵ありビルドを実行すること`);
    assert.equal(kb.embedDims, 512, `${locale}: 次元が想定と異なる`);
    const missing = kb.chunks.filter((c) => !c.vec).map((c) => c.id);
    assert.deepEqual(missing, [],
      `${locale}: ${missing.length}件がベクトルを持たない。` +
      "文言を変えた分は鍵ありビルドで付け直すこと");
  }
});

test("日本語の目次が三つの柱を名指しする", () => {
  const catalog = loadKb("ja").chunks.find((c) => c.pinFor === "services");
  for (const pillar of ["暗黙知の解消支援", "企業専用AIエージェント開発", "AI化伴走支援"]) {
    assert.ok(catalog.text.includes(pillar), `${pillar} が目次にある`);
  }
  /* 研究領域は落とさない。ただし柱より先には出さない。 */
  const iPhysical = catalog.text.indexOf("フィジカルAI");
  assert.ok(iPhysical > catalog.text.indexOf("AI化伴走支援"),
    "フィジカルAIは三つの柱の後に置く");
});
