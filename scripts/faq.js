/*
  ShinAI Website v2 — faq.js
  FAQ のカテゴリ絞り込み(チップ)。旧公開サイトで好評だった UX を段階的強化として継承。
  JSが無効でも全問がそのまま閲覧できる(コントロール自体を hidden から解除するのはJSのみ)。
  innerHTML 不使用・グローバル非汚染の自己完結 IIFE。CSP: script-src 'self' のまま。
*/
(function () {
  "use strict";

  var controls = document.querySelector("[data-faq-controls]");
  if (!controls) {
    return;
  }

  var chips = controls.querySelectorAll(".faq-chip");
  var groups = document.querySelectorAll("[data-faq-group]");
  if (!chips.length || !groups.length) {
    return;
  }

  controls.hidden = false;

  var apply = function (filter) {
    var g;
    for (g = 0; g < groups.length; g += 1) {
      groups[g].hidden = filter !== "all" && groups[g].getAttribute("data-faq-group") !== filter;
    }
  };

  var onChip = function (chip) {
    var i;
    for (i = 0; i < chips.length; i += 1) {
      var isActive = chips[i] === chip;
      chips[i].classList.toggle("is-active", isActive);
      chips[i].setAttribute("aria-pressed", isActive ? "true" : "false");
    }
    apply(chip.getAttribute("data-faq-filter") || "all");
  };

  var i;
  for (i = 0; i < chips.length; i += 1) {
    (function (chip) {
      chip.addEventListener("click", function () { onChip(chip); });
    })(chips[i]);
  }
})();
