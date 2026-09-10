/*
  新規事業LP — 申し込みフォーム。
  自社Worker(/api/contact)へJSONでPOSTする。外部ライブラリは使わない。

  CSP: script-src 'self' / connect-src https://api.shinai-inc.jp
  送信先は _build/build.mjs の API_ORIGIN と同じ値を持つ。二重に持つ以上ずれ得るが、
  ずれると送信だけが静かに失敗する（画面には何も出ない）ため、テストで一致を見張る。

  文言は「何が起きたか・利用者に非があるか・次にどうするか」を必ず含める
  （.claude/rules/08_日本語プロダクト設計原則）。
*/
(function () {
  "use strict";

  var API = "https://api.shinai-inc.jp";
  var MAIL = "support@shinai-inc.jp";

  var form = document.getElementById("lp-form");
  if (!form) return;

  var errorEl = document.getElementById("lp-error");
  var doneEl = document.getElementById("lp-done");
  var submitBtn = form.querySelector("[type='submit']");
  var btnLabel = submitBtn ? submitBtn.querySelector("span") : null;

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

  /* 相談内容の入口。白紙の入力欄は、書くことが決まっていない人ほど手が止まる。
     一押しで書き出しが埋まる形にして、あとから直せるようにする。 */
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

  /* 入口で弾く条件は、Worker側の contact.mjs と同じ。往復させずにその場で返す。 */
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

  var setBusy = function (busy) {
    if (submitBtn) submitBtn.disabled = busy;
    if (btnLabel) btnLabel.textContent = busy ? "送信中..." : "無料相談を申し込む";
  };

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    /* 人には見えない欄。値が入っていれば機械の投稿なので、黙って終える。 */
    var hp = form.querySelector("[name='company-website']");
    if (hp && hp.value) return;

    var bad = validate();
    if (bad) { say(bad[1]); focusField(bad[0]); return; }

    say("");
    setBusy(true);

    fetch(API + "/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: val("company"),
        name: val("name"),
        email: val("email"),
        message: val("message"),
        consent: true,
        locale: "ja"
      })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.ok && data.success) return "ok";
          /* 受付上限に達した場合。利用者の入力に非は無いので、そう分かる文にする。 */
          if (data.reason === "busy") return "busy";
          return "ng";
        });
      })
      .catch(function () { return "ng"; })
      .then(function (result) {
        setBusy(false);
        if (result === "ok") {
          form.hidden = true;
          if (doneEl) {
            doneEl.hidden = false;
            if (doneEl.scrollIntoView) doneEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
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
