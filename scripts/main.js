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

  /* --- カウントアップ --- */
  var animateCounter = function (el) {
    var raw = el.textContent.trim();
    var numeric = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (isNaN(numeric)) return;
    var suffix = raw.replace(/[\d.]/g, "");
    var duration = 1400;
    var start = null;
    var step = function (ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * numeric) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* --- Reveal observer --- */
  var observer = new window.IntersectionObserver(function (entries) {
    var i, el, counters, j;
    for (i = 0; i < entries.length; i += 1) {
      if (entries[i].isIntersecting) {
        el = entries[i].target;
        el.classList.add("is-in");
        counters = el.querySelectorAll(".stat-item__number");
        for (j = 0; j < counters.length; j += 1) {
          animateCounter(counters[j]);
        }
        observer.unobserve(el);
      }
    }
  }, {
    root: null,
    rootMargin: "0px 0px -8% 0px",
    threshold: 0.10
  });

  var i;
  for (i = 0; i < targets.length; i += 1) {
    observer.observe(targets[i]);
  }

  /* stat-item 自体が .reveal でない場合への対応 */
  var statObs = new window.IntersectionObserver(function (entries) {
    var i;
    for (i = 0; i < entries.length; i += 1) {
      if (entries[i].isIntersecting) {
        animateCounter(entries[i].target);
        statObs.unobserve(entries[i].target);
      }
    }
  }, { threshold: 0.5 });
  var statNums = document.querySelectorAll(".stat-item__number");
  for (i = 0; i < statNums.length; i += 1) {
    statObs.observe(statNums[i]);
  }

  /* --- スクロール進捗ライン --- */
  var progressBar = document.createElement("div");
  progressBar.setAttribute("aria-hidden", "true");
  progressBar.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "height:2px",
    "width:0%",
    "background:linear-gradient(90deg,#3A5FEB,#00C9A7)",
    "z-index:9999",
    "pointer-events:none",
    "transition:width 0.1s linear"
  ].join(";");
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
