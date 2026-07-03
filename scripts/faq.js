/*
  ShinAI Website v2 — faq.js
  FAQ の検索とカテゴリ絞り込み。旧公開サイトで好評だった UX を段階的強化として継承。
  JSが無効でも全問がそのまま閲覧できる(コントロール自体を hidden から解除するのはJSのみ)。
  innerHTML 不使用・グローバル非汚染の自己完結 IIFE。CSP: script-src 'self' のまま。
*/
(function () {
  "use strict";

  var controls = document.querySelector("[data-faq-controls]");
  if (!controls) {
    return;
  }

  var input = controls.querySelector("[data-faq-search]");
  var chips = controls.querySelectorAll(".faq-chip");
  var emptyMsg = controls.querySelector("[data-faq-empty]");
  var groups = document.querySelectorAll("[data-faq-group]");
  if (!input || !chips.length || !groups.length) {
    return;
  }

  controls.hidden = false;

  var activeFilter = "all";

  /* 全角/半角・カタカナ/ひらがなの揺れを吸収して照合する */
  var normalize = function (s) {
    return s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0x60);
      });
  };

  var apply = function () {
    var query = normalize(input.value.trim());
    var visibleTotal = 0;
    var g, i;

    for (g = 0; g < groups.length; g += 1) {
      var group = groups[g];
      var inCategory = activeFilter === "all" || group.getAttribute("data-faq-group") === activeFilter;
      var items = group.querySelectorAll(".faq-item");
      var visibleInGroup = 0;

      for (i = 0; i < items.length; i += 1) {
        var match = inCategory && (!query || normalize(items[i].textContent).indexOf(query) !== -1);
        items[i].hidden = !match;
        if (match) {
          visibleInGroup += 1;
        }
      }
      group.hidden = visibleInGroup === 0;
      visibleTotal += visibleInGroup;
    }

    if (emptyMsg) {
      emptyMsg.hidden = visibleTotal !== 0;
    }
  };

  input.addEventListener("input", apply);

  var onChip = function (chip) {
    activeFilter = chip.getAttribute("data-faq-filter") || "all";
    var i;
    for (i = 0; i < chips.length; i += 1) {
      var isActive = chips[i] === chip;
      chips[i].classList.toggle("is-active", isActive);
      chips[i].setAttribute("aria-pressed", isActive ? "true" : "false");
    }
    apply();
  };

  var i;
  for (i = 0; i < chips.length; i += 1) {
    (function (chip) {
      chip.addEventListener("click", function () { onChip(chip); });
    })(chips[i]);
  }
})();
