/*
  ShinAI Website v2 — main.js
  - .reveal → .is-in: スクロール表示 (IntersectionObserver)
  - スクロール進捗ライン: ページ上部に細い brand 色の線
  - 視差スクロール: [data-parallax] 要素に深度を与える
  プログレッシブ・エンハンスメント: JS が動く時だけ .reveal を隠す。
  reduced-motion と IO 非対応は即時表示。グローバル非汚染 IIFE。
*/
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var targets = document.querySelectorAll(".reveal");

  var revealAll = function () {
    var i;
    for (i = 0; i < targets.length; i += 1) {
      targets[i].classList.add("is-in");
    }
  };

  if (reduceMotion || typeof window.IntersectionObserver !== "function") {
    revealAll();
    return;
  }

  /* --- Reveal observer --- */
  var observer = new window.IntersectionObserver(function (entries) {
    var i;
    for (i = 0; i < entries.length; i += 1) {
      if (entries[i].isIntersecting) {
        entries[i].target.classList.add("is-in");
        observer.unobserve(entries[i].target);
      }
    }
  }, {
    root: null,
    rootMargin: "0px 0px 14% 0px",
    threshold: 0
  });

  var i;
  for (i = 0; i < targets.length; i += 1) {
    observer.observe(targets[i]);
  }

  /* --- スクロール進捗ライン(見た目は base.css の .scroll-progress が持つ) --- */
  var progressBar = document.createElement("div");
  progressBar.className = "scroll-progress";
  progressBar.setAttribute("aria-hidden", "true");
  document.body.appendChild(progressBar);

  var updateProgress = function () {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var pct = docHeight > 0 ? Math.min(scrollTop / docHeight * 100, 100) : 0;
    progressBar.style.width = pct + "%";
  };
  window.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();

  /* --- 視差スクロール (data-parallax 属性) --- */
  if (!reduceMotion) {
    var parallaxEls = document.querySelectorAll("[data-parallax]");
    if (parallaxEls.length) {
      var rafPending = false;
      var applyParallax = function () {
        var j, el, rect, factor, depth;
        for (j = 0; j < parallaxEls.length; j += 1) {
          el = parallaxEls[j];
          rect = el.getBoundingClientRect();
          factor = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
          depth = parseFloat(el.getAttribute("data-parallax") || "0.12");
          el.style.transform = "translateY(" + (factor * depth * 100).toFixed(2) + "px)";
        }
        rafPending = false;
      };
      window.addEventListener("scroll", function () {
        if (!rafPending) {
          rafPending = true;
          window.requestAnimationFrame(applyParallax);
        }
      }, { passive: true });
    }
  }
})();
