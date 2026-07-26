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

  /* 表示文言はページの言語(html[lang])で切り替える。英語版は /en/ 配下にあり
     同じスクリプトを共有するため、文言をここに閉じ込めて重複配信を避ける。 */
  var EN = (document.documentElement.getAttribute("lang") || "ja").indexOf("en") === 0;
  var T = EN ? {
    sending: "Sending...",
    sent: "Sent",
    send: "Send",
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
    subject: "[ShinAI お問い合わせ] ",
    company: "【会社名・組織名】",
    name: "【お名前】",
    email: "【メールアドレス】",
    phone: "【電話番号】",
    message: "【相談内容】"
  };

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
      if (state === "sending")      btnSpan.textContent = T.sending;
      else if (state === "success") btnSpan.textContent = T.sent;
      else                          btnSpan.textContent = T.send;
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
    var subject = encodeURIComponent(T.subject + get("company") + " / " + get("name"));
    var body = encodeURIComponent(
      T.company + "\n" + get("company") + "\n\n" +
      T.name + "\n" + get("name") + "\n\n" +
      T.email + "\n" + get("email") + "\n\n" +
      T.phone + "\n" + get("phone") + "\n\n" +
      T.message + "\n" + get("message")
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
