// AI ライブ接客の検証ページ（社内の検証用・検索に載せない）。
// 配信のサーバーの住所は ?server= で受け取る（検証の間は住所が変わるため）。受け付けるのは https の、決めた範囲の住所だけ。
// 読み込みの部品（embed-loader.js）は、実際の EC サイトに置くのと同じ 1 行の形で入れる
(function () {
  "use strict";
  var q = new URLSearchParams(location.search);
  var product = q.get("product");
  if (product && /^[a-z0-9_-]{1,32}$/i.test(product)) {
    document.getElementById("product").hidden = false;
    document.getElementById("product-title").textContent = "商品 " + product + " のページ（検証用）";
  }
  var server = q.get("server") || "";
  var origin = null;
  try { var u = new URL(server); if (u.protocol === "https:" && /(\.trycloudflare\.com|\.shinai-inc\.jp)$/.test(u.hostname)) origin = u.origin; } catch (e) { origin = null; }
  if (!origin) { document.getElementById("missing").hidden = false; return; }
  // 実際の EC サイトに置く 1 行と同じ形（読み込みの部品は、自分の script の場所に枠を作る）
  document.write('<script src="' + origin + '/assets/embed-loader.js" data-avatar-embed><\/script>');
})();
