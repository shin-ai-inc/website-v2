/*
  ShinAI Website v2 — contact-form.js
  問い合わせフォームの非同期送信と送信状態管理。
  一次: Formspree AJAX POST。フォームIDが未設定の場合は mailto にフォールバック。
  外部ライブラリ不要。自己完結 IIFE。CSP: connect-src 'self' https://formspree.io。
*/
(function () {
  "use strict";

  var form = document.querySelector(".contact-form");
  if (!form) return;

  var ENDPOINT = form.getAttribute("action");
  var FALLBACK_EMAIL = "shinai.life@gmail.com";
  var isConfigured = ENDPOINT &&
    ENDPOINT !== "#" &&
    ENDPOINT.indexOf("YOUR_FORM_ID") === -1;

  var submitBtn = form.querySelector("[type='submit']");
  var btnSpan = submitBtn ? submitBtn.querySelector("span") : null;
  var successEl = document.getElementById("contact-success");
  var errorEl = document.getElementById("contact-error");

  var setState = function (state) {
    form.setAttribute("data-state", state);
    if (!submitBtn) return;
    submitBtn.disabled = (state === "sending");
    if (btnSpan) {
      if (state === "sending")    btnSpan.textContent = "送信中...";
      else if (state === "success") btnSpan.textContent = "送信しました";
      else                         btnSpan.textContent = "送信する";
    }
  };

  var showFeedback = function (type) {
    if (successEl) successEl.hidden = (type !== "success");
    if (errorEl)   errorEl.hidden   = (type !== "error");
  };

  var buildMailto = function () {
    var get = function (name) {
      var el = form.querySelector("[name='" + name + "']");
      return el ? (el.value || "") : "";
    };
    var subject = encodeURIComponent("[ShinAI お問い合わせ] " + get("company") + " / " + get("name"));
    var body = encodeURIComponent(
      "【会社名・組織名】\n" + get("company") + "\n\n" +
      "【お名前】\n" + get("name") + "\n\n" +
      "【メールアドレス】\n" + get("email") + "\n\n" +
      "【電話番号】\n" + get("phone") + "\n\n" +
      "【相談内容】\n" + get("message")
    );
    return "mailto:" + FALLBACK_EMAIL + "?subject=" + subject + "&body=" + body;
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var hp = form.querySelector("[name='company-website']");
    if (hp && hp.value) return;

    if (!isConfigured) {
      window.location.href = buildMailto();
      return;
    }

    setState("sending");
    showFeedback(null);

    fetch(ENDPOINT, {
      method: "POST",
      body: new FormData(form),
      headers: { "Accept": "application/json" }
    })
    .then(function (res) {
      if (res.ok) {
        setState("success");
        showFeedback("success");
        form.reset();
        if (successEl) successEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        throw new Error("server");
      }
    })
    .catch(function () {
      setState("error");
      showFeedback("error");
    });
  });
})();
