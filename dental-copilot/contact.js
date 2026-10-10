(function () {
  "use strict";

  var API = "https://api.shinai-inc.jp";
  var MAIL = "contact@shinai-inc.jp";
  var TURNSTILE_SITE_KEY = "0x4AAAAAAFTJZdr2_RyakUSL";
  var TS_MSG = "人間確認が終わっていません。数秒待ってから、もう一度お試しください。"
    + "解消しない場合は " + MAIL + " へ直接お送りください。";

  var form = document.getElementById("lp-form");
  if (!form) return;

  var errorEl = document.getElementById("lp-error");
  var doneEl = document.getElementById("lp-done");
  var submitBtn = form.querySelector("[type='submit']");
  var btnLabel = submitBtn ? submitBtn.querySelector("span") : null;

  var tsSlot = form.querySelector("[data-turnstile]");
  var tsWidget = null;
  var tsReset = function () { if (tsWidget !== null && window.turnstile) window.turnstile.reset(tsWidget); };
  var loadTurnstile = function () {
    if (!TURNSTILE_SITE_KEY || !tsSlot || window.shinaiTurnstileReady) return;
    window.shinaiTurnstileReady = function () {
      tsSlot.hidden = false;
      tsWidget = window.turnstile.render(tsSlot, { sitekey: TURNSTILE_SITE_KEY, size: "flexible", theme: "light", language: "ja" });
    };
    var ts = document.createElement("script");
    ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=shinaiTurnstileReady&render=explicit";
    ts.async = true;
    ts.defer = true;
    document.head.appendChild(ts);
  };

  form.addEventListener("focusin", loadTurnstile);
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { loadTurnstile(); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(form);
  } else {
    loadTurnstile();
  }

  var field = function (name) { return form.querySelector("[name='" + name + "']"); };
  var val = function (name) { var el = field(name); return el ? (el.value || "").trim() : ""; };

  var say = function (text, name) {
    Array.prototype.forEach.call(form.querySelectorAll("[aria-invalid]"), function (el) { el.removeAttribute("aria-invalid"); });
    if (!errorEl) return;
    errorEl.textContent = text || "";
    errorEl.hidden = !text;
    if (!text) return;
    var el = name ? field(name) : null;
    if (el) { el.setAttribute("aria-invalid", "true"); if (el.focus) el.focus(); }
    else if (errorEl.scrollIntoView) errorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  var validate = function () {
    if (!val("company")) return ["company", "医院名をご記入ください。"];
    if (!val("name")) return ["name", "お名前をご記入ください。"];
    var email = val("email");
    if (!email) return ["email", "メールアドレスをご記入ください。日程のご連絡先になります。"];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(email) || email.indexOf("..") >= 0) {
      return ["email", "メールアドレスの形をご確認ください。日程のご連絡先になります。"];
    }
    var consent = field("privacy-consent");
    if (!consent || !consent.checked) return ["privacy-consent", "個人情報の取り扱いへの同意にチェックをお願いします。"];
    return null;
  };

  var composeMessage = function () {
    var concerns = Array.prototype.map.call(form.querySelectorAll("input[name='concern']:checked"), function (el) { return el.value; });
    var lines = ["【歯科受付 LP・先行ヒアリングのお申し込み】"];
    lines.push("気になっていること: " + (concerns.length ? concerns.join("、") : "（選択なし）"));
    var note = val("message");
    lines.push("ひと言: " + (note || "（記入なし）"));
    return lines.join("\n");
  };

  var setBusy = function (busy) {
    if (submitBtn) submitBtn.disabled = busy;
    if (btnLabel) btnLabel.textContent = busy ? "送信しています…" : "ヒアリングを申し込む";
  };

  var showDone = function (email) {
    form.hidden = true;
    if (!doneEl) return;
    var emailEl = document.getElementById("lp-done-email");
    if (emailEl) emailEl.textContent = email;
    doneEl.hidden = false;
    var title = document.getElementById("lp-done-title");
    if (title && title.focus) title.focus({ preventScroll: true });
    if (doneEl.scrollIntoView) doneEl.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  var sending = false;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    if (val("company-website")) return;

    var bad = validate();
    if (bad) { say(bad[1], bad[0]); return; }

    var payload = {
      company: val("company"),
      name: val("name"),
      email: val("email"),
      message: composeMessage(),
      consent: true,
      locale: "ja"
    };
    if (TURNSTILE_SITE_KEY) {
      var token = (tsWidget !== null && window.turnstile) ? window.turnstile.getResponse(tsWidget) : "";
      if (!token) { loadTurnstile(); say(TS_MSG); return; }
      payload.turnstile = token;
    }

    say("");
    sending = true;
    setBusy(true);

    fetch(API + "/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.ok && data.success) return "ok";
          if (data.reason === "busy") return "busy";
          if (data.reason === "turnstile_failed") return "verify";
          return "ng";
        });
      })
      .catch(function () { return "ng"; })
      .then(function (result) {
        setBusy(false);
        if (result === "ok") { showDone(payload.email); return; }
        sending = false;
        tsReset();
        if (result === "verify") { say(TS_MSG); return; }
        if (result === "busy") { say("本日の受付が混み合っています。お手数ですが " + MAIL + " へ直接お送りください。"); return; }
        say("送信できませんでした。通信の状態をご確認のうえ、もう一度お試しください。解消しない場合は " + MAIL + " へ直接お送りください。");
      });
  });
})();
