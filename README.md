# ShinAI Website v2

ShinAI コーポレートサイト（再構築版）。マルチページ・静的サイト。
現行公開サイト（shin-ai-inc/website）の流動パーティクル演出を継承しつつ、
スペースデータのような構造化された訴求と信頼性を備えた作り込みへバージョンアップしたもの。

## 構成
- 6つの主要ページ: `index`（TOP）/ `services`（ソリューション）/ `industries`（業種別）/
  `about`（会社情報）/ `faq` / `contact`。補助: `privacy` / `terms`。
- 設計の正本は `BRIEF.md`（全制作の憲法）。デザイントークンは `styles/tokens.css`。
- 各ページの本文は `partials/<page>.html`、共有部品は `partials/_header.html` /
  `_footer.html` / `_chatbot.html`。セクションCSSは `styles/sections/`。
- 演出: `scripts/particles.js`＋自己ホストした `scripts/vendor/three.min.js`（流動パーティクル。
  現行サイトの効果を継承。CDNではなく自ドメイン配信で script-src 'self' を維持）。
- AIアシスタント: `scripts/chatbot.js`（バックエンドAPI経由。鍵はクライアントに持たない）。

## ビルド
```
node _build/build.mjs
```
- `styles/` を `styles/app.css` へ結合し、`partials/` を共有シェルへ結合して
  各ページHTMLを生成する。HTMLコメントは除去される。
- ブランド画像の再生成（OGP・ファビコン）:
```
python _build/make_assets.py
```

## ローカルプレビュー
```
python -m http.server 8099
# http://localhost:8099/index.html
```

## デプロイ前に必ず行うこと
1. `_build/build.mjs` の `SITE_URL` を実ドメインに変更し再ビルド
   （canonical / OGP / sitemap / robots / security.txt の絶対URLに反映）。
2. チャットAPIを使う場合: `scripts/config.js` の `chatbotApiBase` に公開エンドポイントURLを設定し、
   CSP の `connect-src` に同オリジンを追記（`deploy/_headers` / `deploy/vercel.json` / 各ページの meta）。
   APIキーはサーバー側のみ。クライアント・リポジトリに鍵を置かない。
3. セキュリティ応答ヘッダを適用（`deploy/_headers` または `deploy/vercel.json`）。
4. 公開境界を確認（`PUBLISH_ALLOWLIST.md`）。`BRIEF.md` / `SECURITY.md` / `partials/` /
   `deploy/` / `_build/` / ソースCSS を Web 配信しない。

## 注意
- 絵文字・図形マーク（■□●○）禁止。強調は「 」のみ。詳細は `BRIEF.md` 3章。
- セキュリティ設計は `SECURITY.md`。
