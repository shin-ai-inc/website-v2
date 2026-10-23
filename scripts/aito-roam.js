/* 案内役キャラクター「アイト」が画面の中を動き回る遊び。
   画面を格子(緯度=行・経度=列)に切り、次の目的地を選んで歩く。歩く時間は距離に比例(速さ一定)、着いたら休む。
   動きの時計は CSS が持つ(移動は transition、休みは animation)。ここは目的地と時間を書き、終わりの出来事
   (transitionend / animationend)で次へ進むだけで、JS の時計は使わない。
   図形と三つの基本の動きは正本のまま。部位は動かさない。動くのは全身の位置だけ(柴田 2026-10-23)。
   触れたら止まる。会話を開いたら定位置(右下)へ戻る。reduced-motion と狭い画面では動き回らない。 */
(function (root) {
  "use strict";

  var SPEED_PX_PER_S = 90, TRAVEL_MIN_MS = 800, TRAVEL_MAX_MS = 6000, REST_MIN_MS = 2000, REST_MAX_MS = 7000;
  var CELL = 180;   /* 格子の一辺の目安(px)。画面の大きさから列と行の数を決める */

  /* 格子: 上の帯(top)と端(margin)を避けた区画を、CELL ごとに切る。2×2 に満たなければ動き回れない */
  function grid(v) {
    var w = v.width - v.margin * 2 - v.size, h = v.height - v.top - v.margin - v.size;
    if (w < CELL / 2 || h < CELL / 2) return null;
    var cols = Math.max(2, Math.floor(w / CELL) + 1), rows = Math.max(2, Math.floor(h / CELL) + 1);
    return { cols: cols, rows: rows, x0: v.margin, y0: v.top, dx: cols > 1 ? w / (cols - 1) : 0, dy: rows > 1 ? h / (rows - 1) : 0 };
  }
  function clampInt(n, lo, hi) { n = Math.round(Number(n)); if (n !== n) return lo; return n < lo ? lo : n > hi ? hi : n; }
  function cellToPoint(c, g) {
    var lat = clampInt(c.lat, 0, g.rows - 1), lon = clampInt(c.lon, 0, g.cols - 1);
    return { x: Math.round(g.x0 + lon * g.dx), y: Math.round(g.y0 + lat * g.dy) };
  }
  /* 次の目的地: 今の格子を除く全部から一様に選ぶ(隣に偏らせない。遠くへも行く) */
  function nextCell(cur, g, rand) {
    var n = g.rows * g.cols; var skip = clampInt(cur.lat, 0, g.rows - 1) * g.cols + clampInt(cur.lon, 0, g.cols - 1);
    var r = rand(); if (typeof r !== "number" || r !== r || r < 0) r = 0; if (r >= 1) r = 0.999999;
    var k = Math.floor(r * (n - 1)); if (k >= skip) k += 1;
    return { lat: Math.floor(k / g.cols), lon: k % g.cols };
  }
  function travelMs(a, b) {
    var d = Math.hypot(b.x - a.x, b.y - a.y); var ms = Math.round(d / SPEED_PX_PER_S * 1000);
    return ms < TRAVEL_MIN_MS ? TRAVEL_MIN_MS : ms > TRAVEL_MAX_MS ? TRAVEL_MAX_MS : ms;
  }
  function restMs(r) { if (typeof r !== "number" || r !== r) r = 0; r = r < 0 ? 0 : r > 1 ? 1 : r; return Math.round(REST_MIN_MS + (REST_MAX_MS - REST_MIN_MS) * r); }

  function mount(doc, win) {
    var home = doc.querySelector("[data-aito-roam]"); if (!home) return null;
    var reduced = !!(win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var rand = function () { return Math.random(); };
    var cur = null, g = null, mode = "home", held = false, open = false;   /* mode: home | roam */
    var size = function () { var r = home.getBoundingClientRect(); return Math.max(44, Math.round(Math.max(r.width, r.height))); };
    var view = function () { return { width: win.innerWidth, height: win.innerHeight, size: size(), top: 96, margin: 24 }; };

    /* 位置は定位置(right/bottom の fixed)からの差で書く。定位置へ戻るときは差を 0 にする */
    var base = null;   /* 定位置の左上(画面座標) */
    function measureBase() { home.style.setProperty("--aito-x", "0px"); home.style.setProperty("--aito-y", "0px"); var r = home.getBoundingClientRect(); base = { x: r.left, y: r.top }; }
    function goTo(p, ms) {
      home.style.setProperty("--aito-ms", ms + "ms");
      home.style.setProperty("--aito-x", Math.round(p.x - base.x) + "px");
      home.style.setProperty("--aito-y", Math.round(p.y - base.y) + "px");
      home.setAttribute("data-aito-roam", "roam"); home.removeAttribute("data-aito-rest");
    }
    function startRoam() {
      if (reduced || open || held) return;
      g = grid(view()); if (!g) { comeHome(); return; }
      if (!base) measureBase();
      if (!cur) { cur = { lat: g.rows - 1, lon: g.cols - 1 }; }
      var next = nextCell(cur, g, rand); var from = cellToPoint(cur, g), to = cellToPoint(next, g);
      cur = next; goTo(to, travelMs(from, to)); mode = "roam";
    }
    function rest() { home.style.setProperty("--aito-rest-ms", restMs(rand()) + "ms"); home.setAttribute("data-aito-rest", "1"); }
    function comeHome() {
      home.removeAttribute("data-aito-rest");
      if (base) { home.style.setProperty("--aito-ms", "600ms"); home.style.setProperty("--aito-x", "0px"); home.style.setProperty("--aito-y", "0px"); }
      home.setAttribute("data-aito-roam", "home"); mode = "home"; cur = null;
    }

    home.addEventListener("transitionend", function (e) { if (e.target === home && e.propertyName === "transform" && mode === "roam" && !open && !held) rest(); });
    home.addEventListener("animationend", function (e) { if (e.animationName === "aito-rest" && mode === "roam") startRoam(); });
    /* 触れたら止まる(目的地を今の場所にして、休みへ)。離れたらまた歩く */
    home.addEventListener("pointerenter", function () { held = true; if (mode === "roam") { var r = home.getBoundingClientRect(); goTo({ x: r.left, y: r.top }, 200); home.setAttribute("data-aito-roam", "held"); } });
    home.addEventListener("pointerleave", function () { held = false; if (!open && !reduced) { home.setAttribute("data-aito-roam", "roam"); rest(); } });
    /* 会話を開いたら定位置へ。閉じたら休んでから歩き出す */
    doc.addEventListener("aito", function (e) {
      var k = e.detail && e.detail.kind;
      if (k === "open") { open = true; comeHome(); }
      if (k === "close" && open) { open = false; if (!reduced && grid(view())) { base = null; measureBase(); home.setAttribute("data-aito-roam", "roam"); mode = "roam"; cur = null; rest(); } }
    });
    /* 画面が隠れたら止まる(CSS が animation を止める)。戻ったら休みから */
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden && mode === "roam" && !open && !held) { home.removeAttribute("data-aito-rest"); void home.offsetWidth; rest(); } });
    /* 画面の大きさが変わったら定位置を測り直し、歩き直す */
    win.addEventListener("resize", function () { if (mode !== "roam" || open) return; base = null; measureBase(); cur = null; rest(); });

    /* 最初は定位置で少し休んでから歩き出す(読み始めの邪魔をしない) */
    g = grid(view());
    if (!reduced && g) { measureBase(); home.setAttribute("data-aito-roam", "roam"); mode = "roam"; rest(); }
    return { mode: function () { return mode; }, cell: function () { return cur; }, grid: function () { return g; }, go: startRoam, home: comeHome, setRandom: function (f) { rand = f; } };
  }

  var api = { core: { grid: grid, cellToPoint: cellToPoint, nextCell: nextCell, travelMs: travelMs, restMs: restMs }, mount: mount, live: null };
  root.AitoRoam = api;
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    var start = function () { api.live = mount(document, window); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  }
})(typeof window !== "undefined" ? window : this);
