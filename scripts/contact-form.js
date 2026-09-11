/*
  ShinAI Website v2 — contact-form.js
  問い合わせフォームの非同期送信と送信状態管理。
  一次: 自社Worker(/api/contact)へJSONでPOSTし、Resend経由でメールする。
  Worker未設定(apiBase未設定)の場合のみ mailto へフォールバックする。
  外部ライブラリ不要。自己完結 IIFE。CSP: connect-src 'self' https://api.shinai-inc.jp。
*/
(function () {
  "use strict";

  var form = document.querySelector(".contact-form");
  if (!form) return;

  /* 表示文言はページの言語(html[lang])で切り替える。英語版は /en/ 配下にあり
     同じスクリプトを共有するため、文言をここに閉じ込めて重複配信を避ける。 */
  var EN = (document.documentElement.getAttribute("lang") || "ja").indexOf("en") === 0;
  var T = EN ? {
    sending: "Sending...",
    sent: "Sent",
    send: "Send",
    opened: "Mail app opened",
    subject: "[ShinAI enquiry] ",
    company: "[Company or organisation]",
    name: "[Name]",
    email: "[Email address]",
    phone: "[Phone]",
    message: "[Enquiry]"
  } : {
    sending: "送信中...",
    sent: "送信しました",
    send: "送信する",
    opened: "メールソフトを開きました",
    subject: "[ShinAI お問い合わせ] ",
    company: "【会社名・組織名】",
    name: "【お名前】",
    email: "【メールアドレス】",
    phone: "【電話番号】",
    message: "【ご相談内容】"
  };

  /* Cloudflare Worker(api/)の公開URL。チャットと同じ基点を使う。
     未デプロイ・障害時は mailto へフォールバックする(下記 !apiBase 分岐)。 */
  var apiBase = (window.SHINAI_CONFIG && window.SHINAI_CONFIG.chatbotApiBase) || "";
  var FALLBACK_EMAIL = "contact@shinai-inc.jp";

  /* 人間確認(Cloudflare Turnstile)。サイトキーは公開値(鍵ではない)。
     空のあいだは枠も出さず、Worker 側も秘密鍵が無ければ要求しない。 */
  var SITE_KEY = (window.SHINAI_CONFIG && window.SHINAI_CONFIG.turnstileSiteKey) || "";
  var tsSlot = form.querySelector("[data-turnstile]");
  var tsNote = document.getElementById("turnstile-error");
  var tsWidget = null;
  var tsShow = function (on) { if (tsNote) tsNote.hidden = !on; };
  var tsReset = function () { if (tsWidget !== null && window.turnstile) window.turnstile.reset(tsWidget); };
  if (SITE_KEY && tsSlot) {
    window.shinaiTurnstileReady = function () {
      tsSlot.hidden = false;
      tsWidget = window.turnstile.render(tsSlot, {
        sitekey: SITE_KEY, size: "flexible", theme: "light", language: EN ? "en" : "ja",
        callback: function () { tsShow(false); }
      });
    };
    var ts = document.createElement("script");
    ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=shinaiTurnstileReady&render=explicit";
    ts.async = true;
    ts.defer = true;
    document.head.appendChild(ts);
  }

  var submitBtn = form.querySelector("[type='submit']");
  var btnSpan = submitBtn ? submitBtn.querySelector("span") : null;
  var successEl = document.getElementById("contact-success");
  var errorEl = document.getElementById("contact-error");
  var fallbackEl = document.getElementById("contact-fallback");

  var setState = function (state) {
    form.setAttribute("data-state", state);
    if (!submitBtn) return;
    submitBtn.disabled = (state === "sending");
    if (btnSpan) {
      if (state === "sending")       btnSpan.textContent = T.sending;
      else if (state === "success")  btnSpan.textContent = T.sent;
      else if (state === "fallback") btnSpan.textContent = T.opened;
      else                           btnSpan.textContent = T.send;
    }
  };

  var showFeedback = function (type) {
    if (successEl)  successEl.hidden  = (type !== "success");
    if (errorEl)    errorEl.hidden    = (type !== "error");
    if (fallbackEl) fallbackEl.hidden = (type !== "fallback");
    var shown = type === "success" ? successEl : (type === "error" ? errorEl : (type === "fallback" ? fallbackEl : null));
    if (shown && shown.scrollIntoView) shown.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  var fieldValue = function (name) {
    var el = form.querySelector("[name='" + name + "']");
    return el ? (el.value || "").trim() : "";
  };

  var buildMailto = function () {
    var subject = encodeURIComponent(T.subject + fieldValue("company") + " / " + fieldValue("name"));
    var body = encodeURIComponent(
      T.company + "\n" + fieldValue("company") + "\n\n" +
      T.name + "\n" + fieldValue("name") + "\n\n" +
      T.email + "\n" + fieldValue("email") + "\n\n" +
      T.phone + "\n" + fieldValue("phone") + "\n\n" +
      T.message + "\n" + fieldValue("message")
    );
    return "mailto:" + FALLBACK_EMAIL + "?subject=" + subject + "&body=" + body;
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var hp = form.querySelector("[name='company-website']");
    if (hp && hp.value) return;

    if (!apiBase) {
      /* Worker未設定。メールソフトへ逃がすが、mailto はメールソフトが
         関連付けられていない端末では何も起こさずに終わる。
         逃がしたことを画面に必ず残し、直接届く宛先も併せて示す。
         押して何も起きない状態は、送れたと誤解されるぶん未送信より悪い。 */
      showFeedback("fallback");
      setState("fallback");
      window.location.href = buildMailto();
      return;
    }

    setState("sending");
    showFeedback(null);

    var payload = {
      company: fieldValue("company"),
      name: fieldValue("name"),
      email: fieldValue("email"),
      phone: fieldValue("phone"),
      message: fieldValue("message"),
      consent: !!(form.querySelector("[name='privacy-consent']") || {}).checked,
      locale: EN ? "en" : "ja"
    };

    if (SITE_KEY) {
      var token = (tsWidget !== null && window.turnstile) ? window.turnstile.getResponse(tsWidget) : "";
      if (!token) {
        /* 確認が済んでいない(読み込み中・期限切れ)。入力に非は無いので、やり直しだけを促す。 */
        setState("idle");
        tsShow(true);
        return;
      }
      payload.turnstile = token;
    }

    fetch(apiBase + "/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.ok && data.success) {
          setState("success");
          showFeedback("success");
          form.reset();
        } else if (data.reason === "turnstile_failed") {
          setState("idle");
          tsReset();
          tsShow(true);
        } else {
          throw new Error("server");
        }
      });
    })
    .catch(function () {
      /* トークンは一度きり。次の送信のために確認を取り直す。 */
      tsReset();
      setState("error");
      showFeedback("error");
    });
  });
})();
