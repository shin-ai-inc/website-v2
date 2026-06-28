# PUBLISH_ALLOWLIST — 公開境界の単一の真実源

このサイトで「Web配信してよいファイル」を定義する。ホストごとの除外設定
（`_config.yml` / `.vercelignore` 等）は、本書に追従させる。

## 配信ディレクトリ
- `node _build/build.mjs` が、下記「公開する」ファイルのみを集めた `dist/` を生成する。
- Netlify / Cloudflare Pages 等は **`dist/` を publish ディレクトリに指定**して配信する
  （リポジトリルートを直接配信させない。内部資料の露出を防ぐ）。`dist/` は生成物で .gitignore 済み。

## 公開する（デプロイ対象＝dist/ に入るもの）
- `*.html`（生成済みの8ページ: index, services, industries, about, faq, contact, privacy, terms）
- `styles/app.css`（ビルドで結合した本番CSS。各ページはこれのみを参照）
- `scripts/config.js` `scripts/nav.js` `scripts/main.js` `scripts/particles.js` `scripts/chatbot.js`
- `scripts/vendor/three.min.js`（自己ホストした Three.js r134・MIT。CDN代替）
- `assets/`（画像・アイコン。`assets/CREDITS.md` を除く）
- `robots.txt` `sitemap.xml` `site.webmanifest`
- `.well-known/security.txt`

## 公開しない（必ずデプロイから除外）
- `BRIEF.md`（制作憲法・内部判断）
- `STRATEGY.md`（制作手法の体系化・現状レビュー・内部判断）
- `SECURITY.md`（本セキュリティ設計）
- `PUBLISH_ALLOWLIST.md`（本書）
- `partials/`（結合前の断片。最終HTMLのみ公開）
- `styles/tokens.css` `styles/base.css` `styles/sections/`（ソースCSS。本番は app.css のみ）
- `deploy/`（ヘッダ・ホスト設定の設計）
- `_build/`（ビルドスクリプト・画像生成スクリプト）
- `assets/CREDITS.md`、`*.NEEDS.md`、`README.md`、開発メモ、`.git/`、一時ファイル

備考: ソースCSS（tokens/base/sections）は秘密ではないが、本番は `app.css` 一本に集約する方針のため
配信対象から外す。`scripts/` のソースCSS相当の分割は無く、JSはそのまま配信する（難読化しないが内部メモを残さない）。
