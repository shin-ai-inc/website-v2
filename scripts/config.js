/*
  ShinAI Website v2 — config.js
  公開設定のみを置く(秘密は置かない)。チャットのAPIエンドポイントURLは公開URLであり鍵ではない。
  インラインscript禁止(CSP)のため、ここで window へ載せる。
  デプロイ時に実エンドポイントへ差し替える。空のままなら chatbot は「準備中」として
  問い合わせフォームへ穏やかに誘導する(エラーにしない)。
  APIキー・トークン・個人情報は絶対にここへ書かない(サーバー側のみ)。
*/
(function () {
  "use strict";
  window.SHINAI_CONFIG = {
    /* Cloudflare Worker(api/)の公開URL。鍵ではないのでここに置いてよい。
       未デプロイ・障害時は chatbot 側が「準備中」として問い合わせへ誘導する。 */
    chatbotApiBase: "https://api.shinai-inc.jp",
    contactPath: "contact.html"
  };
})();
