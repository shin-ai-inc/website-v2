/*
  ShinAI サポートAI — Cloudflare Worker 本体。

  責務: HTTPの受け口・多層の統制・OpenAI呼び出し・監査ログ。
  判断ロジックは lib/ の純粋関数へ寄せ、ここは配線に徹する
  (テストが速く決定的になり、防御の中身を変えても壊れにくい)。

  防御の重心:
  - 最大の実害は情報漏洩ではない。知識源は公開16ページのみ。
    実害は「当社の口で言っていないことを言わせる」ことと「口座の踏み台化」。
  - よって入力の検閲より、出力の統制(lib/outgate)と支出の上限(lib/budget)を厚くする。

  秘密はコードに置かない。OPENAI_API_KEY は wrangler secret でのみ投入する。
*/
import { parseRequestBody, resolveOrigin } from "./lib/contract.mjs";
import { classifyInput, buildSystemPrompt, sanitizeAnswer, pickOffer, greetingUsed, greetingOnly, pickGreetingClose } from "./lib/guard.mjs";
import { jstDayKey, shouldBlockByBudget, estimateCostUsd } from "./lib/budget.mjs";
import { screenAnswer } from "./lib/outgate.mjs";
import { buildIndex, hybridSearch } from "./lib/retrieve.mjs";
import { normalizeVector } from "./lib/vector.mjs";
import KB_JA from "./knowledge.ja.json";
import KB_EN from "./knowledge.en.json";

/* 索引はモジュールの評価時に一度だけ組む。Worker のインスタンスは
   複数のリクエストで使い回されるため、実質的に起動時の1回で済む。 */
const INDEX = { ja: buildIndex(KB_JA.chunks), en: buildIndex(KB_EN.chunks) };

/* 渡す根拠の件数。増やすほど取りこぼしは減るが、埋もれの再発と費用増を招く。
   平均110字なので6件でも700字程度に収まる。 */
const TOP_K = 6;

/**
 * 質問を埋め込みへ変換する。失敗しても検索は字面のみで成立するため、
 * ここで止めない(埋め込みの不調で全体が沈黙する方が実害が大きい)。
 */
const embedQuery = async (text, env, model, dims) => {
  if (!model) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model, input: text, dimensions: dims })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data.data?.[0]?.embedding;
    return vec ? Float32Array.from(normalizeVector(vec)) : null;
  } catch {
    return null;
  }
};

/* 利用者に返す定型文。内部の事情(どの規則に当たったか)は一切明かさない。 */
const REPLY = {
  ja: {
    refused: "申し訳ありません。その内容にはお答えできません。サービスや導入について、具体的なご相談はお問い合わせフォームからお願いいたします。",
    tooLong: "恐れ入りますが、メッセージが長すぎます。500文字以内でお願いします。",
    busy: "申し訳ありません。本日はお問い合わせが集中しております。お問い合わせフォームからご連絡いただければ、担当者より折り返しご案内いたします。",
    error: "申し訳ありません。一時的に応答できませんでした。お問い合わせフォームをご利用ください。",
    /* この窓口は会社案内のためのもので、力になれることが限られている。
       だからこそ、確かな相談先を具体的に示すところまでを役割とする。
       電話番号は変わりうるため、公的な案内ページを主に据える。 */
    crisis: "おつらい状況のなかで、言葉にしてくださってありがとうございます。" +
      "ここは会社案内の窓口のため、力になれることが限られています。" +
      "話を聞いてくれる窓口が各地にありますので、どうかそちらを頼ってください。\n" +
      "よりそいホットライン 0120-279-338（24時間・通話無料）\n" +
      "厚生労働省の相談窓口一覧 https://www.mhlw.go.jp/mamorouyokokoro/\n" +
      "いますぐ危険がある場合は 119 番へご連絡ください。\n" +
      /* 応答の言語はページ側で決まるため、日本語ページに英語で書き込まれた
         訴えには日本語で返ることになる。この文だけは、読めなければ意味がない。 */
      "If you are struggling, please reach the Yorisoi Hotline on 0120-279-338 " +
      "(24 hours, free), or call 119 if you are in immediate danger.",
    offtask: "恐れ入りますが、こちらはシンアイ株式会社についてのご案内を行う窓口です。" +
      "当社の事業内容、サービスの進め方、業種別の活用、費用の考え方などについてお尋ねください。",
    /* 人につないでほしい、という依頼への応答。
       断るだけでは不親切で、どうすれば人に届くのかを示す必要がある。
       実測では「担当者の手配を引き受けることはできません」で終わり、
       連絡先を示さなかった。 */
    human: "恐れ入りますが、こちらはAIによる案内窓口のため、担当者へおつなぎすることができません。\n" +
      "お問い合わせフォーム https://shinai-inc.jp/contact.html からご連絡いただければ、" +
      "担当者が内容を確認のうえご返信いたします。\n" +
      "メールでも承ります。contact@shinai-inc.jp（平日 9:00〜18:00）"
  },
  en: {
    refused: "Sorry, we cannot answer that. For specific enquiries about our services, please use the contact form.",
    tooLong: "That message is too long. Please keep it within 500 characters.",
    busy: "We are receiving a high volume of enquiries today. Please reach out through the contact form and we will get back to you.",
    error: "Sorry, we could not respond just now. Please use the contact form.",
    crisis: "Thank you for putting this into words. This is a company enquiry desk, " +
      "so there is little we can do here, but please reach someone who can help.\n" +
      "In Japan: Yorisoi Hotline 0120-279-338 (24 hours, free), " +
      "or the Ministry of Health, Labour and Welfare directory " +
      "https://www.mhlw.go.jp/mamorouyokokoro/\n" +
      "If you are in immediate danger, call 119 in Japan, or your local emergency number.",
    offtask: "This desk answers questions about ShinAI Inc. " +
      "Please ask about what we do, how we work with clients, industry examples, or how pricing is approached.",
    human: "I am an AI desk, so I cannot put you through to a colleague.\n" +
      "Send a note through the contact form https://shinai-inc.jp/en/contact.html " +
      "and someone will read it and reply.\n" +
      "Email also reaches us: contact@shinai-inc.jp (weekdays 9:00-18:00 JST)"
  }
};

const json = (body, status, origin) => {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    /* オリジンをエコーする設計では必須。欠くとCDNが別オリジン向けの
       ヘッダを配ることがある(実際によく起きる不具合)。 */
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
};

/* 監査ログ。本文・生IP・鍵は残さない。傾向と統制の作動だけを残す。 */
const audit = (fields) => {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...fields }));
};

/* IPは個人情報。相関に足る一方向ハッシュだけを残す。 */
const hashIp = async (ip, salt) => {
  if (!ip) return "unknown";
  const data = new TextEncoder().encode(salt + ":" + ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
};

export default {
  async fetch(request, env, ctx) {
    const allowlist = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = resolveOrigin(request.headers.get("Origin"), allowlist);

    /* 事前検査(プリフライト)。Max-Age で往復を減らす。 */
    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    if (request.method !== "POST") {
      return json({ success: false }, 405, origin);
    }

    /* workers.dev の既定ルートはゾーンのWAF・レート制限が適用されない。
       設定で無効化したうえで、ここでも受け付けない(多層)。 */
    const host = request.headers.get("Host") || "";
    if (env.API_HOST && host !== env.API_HOST) {
      audit({ event: "rejected_host", host });
      return json({ success: false }, 404, origin);
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/chatbot") {
      return json({ success: false }, 404, origin);
    }

    if (!origin) {
      audit({ event: "rejected_origin" });
      return json({ success: false }, 403, null);
    }

    if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
      return json({ success: false }, 415, origin);
    }

    /* 言語はページ側の html[lang] に対応する。クエリで受け、既定は日本語。 */
    const locale = url.searchParams.get("lang") === "en" ? "en" : "ja";
    const reply = REPLY[locale];

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false }, 400, origin);
    }

    const parsed = parseRequestBody(body);
    if (!parsed.ok) {
      audit({ event: "rejected_contract", reason: parsed.reason });
      return json({ success: false }, parsed.status, origin);
    }

    const ipHash = await hashIp(request.headers.get("CF-Connecting-IP"), env.IP_SALT || "shinai");

    /* --- 統制1: 入力の分類 --- */
    const verdict = classifyInput(parsed.value.message);
    if (verdict.verdict === "too_long") {
      return json({ success: true, response: reply.tooLong }, 200, origin);
    }
    if (verdict.verdict === "empty") {
      return json({ success: false }, 400, origin);
    }
    /* 安全に関わる応答は生成に賭けない。定型で確実に窓口を示す。
       OpenAIを呼ばないため、混雑や障害の影響も受けない。 */
    if (verdict.verdict === "crisis") {
      audit({ event: "crisis_reply", ip: ipHash });
      return json({ success: true, response: reply.crisis }, 200, origin);
    }
    /* 人につないでほしい、という依頼。検索は「担当者」という語だけで
       別のFAQに当たり、問いと無関係な答えを返していた。
       意味を取り違えたまま生成に渡さず、連絡の道を確実に示す。 */
    if (verdict.verdict === "human") {
      audit({ event: "human_handoff", ip: ipHash, locale });
      return json({ success: true, response: reply.human }, 200, origin);
    }
    if (verdict.verdict === "offtask") {
      audit({ event: "offtask_input", ip: ipHash });
      return json({ success: true, response: reply.offtask }, 200, origin);
    }
    if (verdict.verdict === "refuse") {
      audit({ event: "refused_input", kind: verdict.reason, ip: ipHash });
      /* 攻撃者にも通常利用者にも同じ体験を返す(検出条件を推測させない)。
         OpenAIは呼ばないのでコストも発生しない。 */
      return json({ success: true, response: reply.refused }, 200, origin);
    }

    /* --- 統制2: 日次予算(グローバル上限) --- */
    const dayKey = jstDayKey(new Date());
    const limit = Number(env.DAILY_LIMIT || 300);
    let meter;
    try {
      const id = env.BUDGET.idFromName("global");
      const stub = env.BUDGET.get(id);
      const res = await stub.fetch("https://budget/consume", {
        method: "POST",
        body: JSON.stringify({ dayKey, limit })
      });
      meter = await res.json();
    } catch (e) {
      /* メーターが読めないときは止める側に倒す。
         素通りさせると障害時が攻撃の窓になる。 */
      audit({ event: "budget_unavailable" });
      return json({ success: true, response: reply.busy }, 200, origin);
    }

    if (shouldBlockByBudget({ count: meter.countBefore, limit })) {
      audit({ event: "budget_exceeded", day: dayKey, count: meter.countBefore, limit });
      return json({ success: true, response: reply.busy }, 200, origin);
    }

    /* --- 検索: 質問に関係する根拠だけを選ぶ --- */
    const kb = locale === "en" ? KB_EN : KB_JA;
    const started = Date.now();
    try {
      const queryVec = await embedQuery(parsed.value.message, env, kb.embedModel, kb.embedDims);
      const picked = hybridSearch(parsed.value.message, queryVec, INDEX[locale], { k: TOP_K });
      /* 用件を促す一文は呼び出しごとに変える。モデルは前の応答を知らないため、
         ここで変えないと同じ一文が続き、画面上で単調になる（実際にそう見えた）。 */
      /* 挨拶だけの相手には問い返さない。締めに配る一文を平叙文にし、
         生成が疑問形になった場合は後処理で置き換える（性質は保証し、
         言い回しは生成に任せる）。 */
      const onlyGreeting = greetingOnly(parsed.value.message);
      const close = onlyGreeting ? pickGreetingClose(locale) : pickOffer(locale);
      const systemPrompt = buildSystemPrompt(picked, locale, close);

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: env.MODEL || "gpt-4o-mini",
          /* 根拠は system、利用者入力は user。同一文字列に連結しないことで
             モデルの指示階層を働かせ、入力が指示に化けるのを防ぐ。 */
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: parsed.value.message }
          ],
          max_tokens: Number(env.MAX_TOKENS || 400),
          temperature: 0.3,
          /* ストリーミングは使わない。表示済みのトークンは取り消せず、
             出力ゲートが原理的に機能しなくなるため(タイプ表示はクライアント側の演出)。 */
          stream: false
        })
      });

      if (!res.ok) {
        /* OpenAIのエラー本文は組織ID等を含みうるので転送しない。 */
        audit({ event: "upstream_error", status: res.status });
        return json({ success: false }, 200, origin);
      }

      const data = await res.json();
      const usage = data.usage || {};
      const answer = sanitizeAnswer(data.choices?.[0]?.message?.content || "",
        /* 挨拶は相手が使った言い方に揃える。使っていなければ落とす。
           モデルは応対例の「こんにちは！」を場面に関わらず写すため、
           ここで整える。 */
        {
          greeting: greetingUsed(parsed.value.message),
          greeted: false,
          declarativeClose: onlyGreeting ? close : null
        });

      /* --- 統制3: 出力ゲート(結果で捕まえる) --- */
      const screened = screenAnswer(answer, locale);

      audit({
        event: "answered",
        ip: ipHash,
        locale,
        blocked: screened.blocked,
        blockReason: screened.reason || null,
        /* 検索が何を根拠に選んだか。答えの質が落ちたとき、生成と検索の
           どちらが原因かをログだけで切り分けられる(本文は残さない)。 */
        hits: picked.map((c) => c.id),
        dense: Boolean(queryVec),
        /* クライアントが生成する乱数の識別子。個人情報を含まない。
           同じ会話の複数の問いを結び付けるためだけに使う
           （「この対話の答えがおかしい」と報告を受けたとき、
             どのやり取りだったかを追えないと調べようがない）。 */
        session: parsed.value.sessionId,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
        costUsd: Number(estimateCostUsd({
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0
        }).toFixed(6)),
        ms: Date.now() - started,
        dayCount: meter.countBefore + 1
      });

      return json({ success: true, response: screened.text || reply.error }, 200, origin);
    } catch (e) {
      audit({ event: "unhandled_error", name: e && e.name });
      return json({ success: false }, 200, origin);
    }
  }
};

/*
  日次予算メーター。単一インスタンスで全リクエストを数えるため、
  低速分散(多数IPから毎分1回)でも累計を捕捉できる。
  保持するのは当日の件数だけ。個人情報は入れない。
*/
export class BudgetMeter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { dayKey } = await request.json();
    const stored = (await this.state.storage.get("meter")) || { dayKey: "", count: 0 };
    /* 日付が変わったら自動で戻す(JST基準の切替は呼び出し側が決める)。 */
    const current = stored.dayKey === dayKey ? stored : { dayKey, count: 0 };
    const countBefore = current.count;
    await this.state.storage.put("meter", { dayKey, count: countBefore + 1 });
    return new Response(JSON.stringify({ countBefore }), {
      headers: { "Content-Type": "application/json" }
    });
  }
}
