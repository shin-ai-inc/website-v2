/*
  ShinAI Website v2 — nav.js
  アクセシブルなモバイルナビ開閉と、スクロールによるヘッダー condense。
  インラインハンドラを使わず、グローバルを汚さない自己完結 IIFE。
*/
(function () {
  "use strict";

  var header = document.querySelector("[data-site-header]");
  if (!header) {
    return;
  }

  var toggle = header.querySelector("[data-nav-toggle]");
  var nav = document.getElementById("primary-nav");

  /* ---- モバイルナビ開閉 ---- */
  if (toggle && nav) {
    var isOpen = false;
    var mobileQuery = window.matchMedia("(max-width: 820px)");

    var setOpen = function (open) {
      isOpen = open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      nav.classList.toggle("is-open", open);
    };

    var close = function (returnFocus) {
      if (!isOpen) {
        return;
      }
      setOpen(false);
      if (returnFocus) {
        toggle.focus();
      }
    };

    toggle.addEventListener("click", function () {
      setOpen(!isOpen);
      if (isOpen) {
        var firstLink = nav.querySelector("a");
        if (firstLink) {
          firstLink.focus();
        }
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || event.key === "Esc") {
        close(true);
      }
    });

    document.addEventListener("click", function (event) {
      if (!isOpen) {
        return;
      }
      if (!header.contains(event.target)) {
        close(false);
      }
    });

    nav.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.closest("a")) {
        close(false);
      }
    });

    var syncToViewport = function () {
      if (!mobileQuery.matches) {
        close(false);
      }
    };

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", syncToViewport);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(syncToViewport);
    }
  }

  /* ---- スクロールで condense ---- */
  var condenseAt = 24;
  var ticking = false;

  var applyCondense = function () {
    header.classList.toggle("is-condensed", window.scrollY > condenseAt);
    ticking = false;
  };

  var onScroll = function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(applyCondense);
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  applyCondense();
})();
