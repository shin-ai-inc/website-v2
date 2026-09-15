(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var navType = (function () {
    var entries = window.performance && window.performance.getEntriesByType
      ? window.performance.getEntriesByType("navigation")
      : null;
    if (entries && entries.length) { return entries[0].type; }
    if (window.performance && window.performance.navigation) {
      return window.performance.navigation.type === 2 ? "back_forward" : "navigate";
    }
    return "navigate";
  })();

  if (navType !== "back_forward" && !window.location.hash) {
    window.scrollTo(0, 0);
    window.requestAnimationFrame(function () {
      if (!window.location.hash) { window.scrollTo(0, 0); }
    });
  }

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
    rootMargin: "0px 0px 24% 0px",
    threshold: 0
  });

  var i;
  for (i = 0; i < targets.length; i += 1) {
    observer.observe(targets[i]);
  }

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
