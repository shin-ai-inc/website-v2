(function () {
  "use strict";

  var form = document.querySelector(".contact-form");
  if (!form) return;

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

  var apiBase = (window.SHINAI_CONFIG && window.SHINAI_CONFIG.chatbotApiBase) || "";
  var FALLBACK_EMAIL = "contact@shinai-inc.jp";

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
      tsReset();
      setState("error");
      showFeedback("error");
    });
  });
})();
