/*
  API の JSON 応答に常に付ける防御ヘッダ。

  - nosniff: JSON をブラウザに HTML と誤解させない(古い経路の XSS を塞ぐ)
  - no-store: 応答は相手ごとに違う。経路上(CDN・プロキシ)のどこにも残さない
  - no-referrer: API が返す URL を辿ったとき、API のパスを相手に渡さない
  - HSTS: api.shinai-inc.jp は Cloudflare 経由で常に TLS。降格を許さない。
    preload は付けない(apex の宣言であり、サブドメインが名乗るものではない)

  index.mjs の json() と readVoices() の両方がこれを使う。
  片方だけに書くと、もう片方が無言で欠ける。
*/
export const JSON_SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains"
});
