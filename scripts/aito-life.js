/* 案内役キャラクター「アイト」の常時の生きた動き。
   動きは全部 CSS(styles/sections/chatbot.css)が描く。ここは「いまどういう状態か」(data-aito-state)と
   「どこを見ているか」(CSS 変数 --aito-gx/--aito-gy)を書くだけで、時計を持たない。
   状態の始まりと終わりは出来事(会話の部品からの aito イベント・ポインター・スクロール・画面の見え方・
   CSS の animationend)で決まる。
   形は変えない(正本 §6)。足すのは状態の層だけ。 */
(function (root) {
  "use strict";

  var STATES = { idle: 1, attentive: 1, thinking: 1, speaking: 1, joy: 1 };
  /* 答えを待つ・話している間は、入力欄の操作で気を散らさない */
  var HOLD = { thinking: { attentive: 1 }, speaking: { attentive: 1 } };

  function reduce(state, want) {
    if (typeof want !== "string" || !STATES[want]) return state;
    if (HOLD[state] && HOLD[state][want]) return state;
    return want;
  }

  function quantize(v) {
    if (typeof v !== "number" || v !== v) return 0;
    var q = Math.round(v * 20) / 20;
    return q > 1 ? 1 : q < -1 ? -1 : q;
  }

  /* 指す先を、顔の中心からの向きに直す。顔の幅の 2.5 倍の距離で飽和させる(遠くを見ても瞳は端で止まる) */
  function gazeFrom(px, py, rect) {
    if (!rect || typeof px !== "number" || typeof py !== "number" || px !== px || py !== py) return { x: 0, y: 0 };
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    var reach = Math.max(1, rect.width) * 2.5;
    var x = (px - cx) / reach, y = (py - cy) / reach;
    return { x: quantize(x), y: quantize(y) };
  }

  /* 居場所: 読み進めている(下へ 8px 以上)間は peek のまま(手が止まって読んでいる間も本文を隠さない)。
     戻る・終わりまで来た・触れた・会話が動いた、で here。
     小さな揺れ(8px 未満)では変えない(慣性スクロールの末尾で震えない) */
  function presenceFrom(prev, y, atEnd, current) {
    if (atEnd) return "here";
    var d = y - prev;
    if (d >= 8) return "peek";
    if (d <= -8) return "here";
    return current;
  }

  function mount(doc, win) {
    var el = doc.querySelector("[data-aito-state]");
    if (!el) return null;
    var reduced = !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var state = el.getAttribute("data-aito-state") || "idle";
    var before = state;
    var gx = 0, gy = 0;

    function apply(next) {
      if (next === state) return;
      state = next;
      el.setAttribute("data-aito-state", next);
    }
    function want(kind) { apply(reduce(state, kind)); }
    function look(x, y) {
      if (x === gx && y === gy) return;
      gx = x; gy = y;
      el.style.setProperty("--aito-gx", String(x));
      el.style.setProperty("--aito-gy", String(y));
    }

    doc.addEventListener("aito", function (e) { want(e.detail && e.detail.kind); });

    /* 居場所(画面に居るか・端へ引くか)。印は起動UIを包む器に書く */
    var home = el.closest("[data-aito-presence]");
    function place(p) { if (home && home.getAttribute("data-aito-presence") !== p) home.setAttribute("data-aito-presence", p); }
    if (home) {
      home.addEventListener("pointerenter", function () { place("here"); });
      /* 沈んでいる間にポインターの下へ来たときは enter が立たない(ブラウザは次の move まで境界を更新しない) */
      home.addEventListener("pointermove", function () { place("here"); }, { passive: true });
      home.addEventListener("focusin", function () { place("here"); });
      doc.addEventListener("aito", function (e) { if (e.detail && e.detail.kind !== "idle") place("here"); });
    }

    /* 一度きりの動き(喜ぶ・ちらっと見る)は CSS の終わりで戻す */
    el.addEventListener("animationend", function (e) {
      if (e.animationName === "aito-joy" && state === "joy") apply("idle");
      if (e.animationName === "aito-glance") el.removeAttribute("data-aito-glance");
    });

    /* 画面が隠れたら休む(描画も止まる)。戻ったら前の状態へ */
    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden) { before = state; apply("rest"); }
      else if (state === "rest") apply(before === "rest" ? "idle" : before);
    });

    if (!reduced) {
      {
        /* 指で触る端末は pointermove が触れた間しか来ないので、鼠と筆の動きだけを視線にする(端末の種別で決め打ちしない) */
        doc.addEventListener("pointermove", function (e) {
          if (state === "rest" || (e.pointerType !== "mouse" && e.pointerType !== "pen")) return;
          var g = gazeFrom(e.clientX, e.clientY, el.getBoundingClientRect());
          look(g.x, g.y);
        }, { passive: true });
        doc.addEventListener("pointerleave", function () { look(0, 0); });
      }
      /* スクロールの向きへ一瞬だけ目をやる。量は CSS(aito-glance)が決め、終わりは animationend */
      var lastY = win.scrollY || 0, lastPlace = lastY;
      win.addEventListener("scroll", function () {
        if (state === "rest") return;
        var y = win.scrollY || 0, dir = y > lastY ? "down" : y < lastY ? "up" : null;
        lastY = y;
        if (home && !(doc.body.classList && doc.body.classList.contains("chat-open"))) {
          var atEnd = win.innerHeight + y >= (doc.documentElement.scrollHeight || 0) - 24;
          var next = presenceFrom(lastPlace, y, atEnd, home.getAttribute("data-aito-presence"));
          if (Math.abs(y - lastPlace) >= 8 || atEnd) lastPlace = y;
          place(next);
        }
        if (!dir || el.getAttribute("data-aito-glance") === dir) return;
        el.removeAttribute("data-aito-glance");
        /* 同じ向きへ続けて動かすため、一度外してから付け直す(再描画を挟む) */
        void el.offsetWidth;
        el.setAttribute("data-aito-glance", dir);
      }, { passive: true });
    }

    return { state: function () { return state; }, set: want, look: look, gaze: function () { return { x: gx, y: gy }; }, presence: function () { return home ? home.getAttribute("data-aito-presence") : null; } };
  }

  var api = { core: { reduce: reduce, gazeFrom: gazeFrom, quantize: quantize, presenceFrom: presenceFrom }, mount: mount, live: null };
  root.AitoLife = api;
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    var start = function () { api.live = mount(document, window); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  }
})(typeof window !== "undefined" ? window : this);
