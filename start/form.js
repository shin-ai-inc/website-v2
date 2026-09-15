(function () {
  "use strict";

  var API = "https://api.shinai-inc.jp";
  var MAIL = "contact@shinai-inc.jp";
  var TURNSTILE_SITE_KEY = "";
  var TS_MSG = "人間確認が完了していません。数秒待ってから、もう一度お試しください。"
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
  if (TURNSTILE_SITE_KEY && tsSlot) {
    window.shinaiTurnstileReady = function () {
      tsSlot.hidden = false;
      tsWidget = window.turnstile.render(tsSlot, { sitekey: TURNSTILE_SITE_KEY, size: "flexible", theme: "light", language: "ja" });
    };
    var ts = document.createElement("script");
    ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=shinaiTurnstileReady&render=explicit";
    ts.async = true;
    ts.defer = true;
    document.head.appendChild(ts);
  }

  var val = function (name) {
    var el = form.querySelector("[name='" + name + "']");
    return el ? (el.value || "").trim() : "";
  };

  var say = function (text) {
    if (!errorEl) return;
    errorEl.textContent = text || "";
    errorEl.hidden = !text;
    if (text && errorEl.scrollIntoView) errorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  var focusField = function (name) {
    var el = form.querySelector("[name='" + name + "']");
    if (el && el.focus) el.focus();
  };

  var chips = form.querySelectorAll(".lp-chip");
  var message = form.querySelector("[name='message']");
  Array.prototype.forEach.call(chips, function (chip) {
    chip.addEventListener("click", function () {
      if (!message) return;
      var fill = chip.getAttribute("data-fill") || "";
      var cur = (message.value || "").trim();
      message.value = cur ? cur + "\n" + fill : fill;
      message.focus();
      var end = message.value.length;
      if (message.setSelectionRange) message.setSelectionRange(end, end);
      say("");
    });
  });

  var validate = function () {
    if (!val("company")) return ["company", "会社名・組織名をご記入ください。"];
    if (!val("name")) return ["name", "お名前をご記入ください。"];
    var email = val("email");
    if (!email) return ["email", "メールアドレスをご記入ください。"];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(email) || email.indexOf("..") >= 0) {
      return ["email", "メールアドレスの形をご確認ください。返信先になります。"];
    }
    if (!val("message")) return ["message", "ご相談内容をご記入ください。ひと言でも構いません。"];
    var consent = form.querySelector("[name='privacy-consent']");
    if (!consent || !consent.checked) {
      return ["privacy-consent", "個人情報の取り扱いへの同意が必要です。"];
    }
    return null;
  };

  var showDone = function (email) {
    form.hidden = true;
    if (!doneEl) return;
    var emailEl = document.getElementById("lp-done-email");
    var toEl = document.getElementById("lp-done-to");
    if (emailEl && toEl && email) { emailEl.textContent = email; toEl.hidden = false; }
    doneEl.hidden = false;
    var title = document.getElementById("lp-done-title");
    if (title && title.focus) title.focus({ preventScroll: true });
    if (doneEl.scrollIntoView) doneEl.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  var setBusy = function (busy) {
    if (submitBtn) submitBtn.disabled = busy;
    if (btnLabel) btnLabel.textContent = busy ? "送信中..." : "無料で相談する";
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var hp = form.querySelector("[name='company-website']");
    if (hp && hp.value) return;

    var bad = validate();
    if (bad) { say(bad[1]); focusField(bad[0]); return; }

    var payload = {
      company: val("company"),
      name: val("name"),
      email: val("email"),
      message: val("message"),
      consent: true,
      locale: "ja"
    };
    if (TURNSTILE_SITE_KEY) {
      var token = (tsWidget !== null && window.turnstile) ? window.turnstile.getResponse(tsWidget) : "";
      if (!token) { say(TS_MSG); return; }
      payload.turnstile = token;
    }

    say("");
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
        if (result === "ok") {
          showDone(payload.email);
          return;
        }
        tsReset();
        if (result === "verify") {
          say(TS_MSG);
          return;
        }
        if (result === "busy") {
          say("本日の受付が上限に達しました。お手数ですが " + MAIL + " へ直接お送りください。");
          return;
        }
        say("送信できませんでした。通信の状態をご確認のうえ、もう一度お試しください。"
          + "解消しない場合は " + MAIL + " へ直接お送りください。");
      });
  });
})();
