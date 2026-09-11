# 公開サイトの防御 — 実測に基づく現状と手順（2026-09-11）

対象: https://shinai-inc.jp/（HP・/lp/・/ai-business/・/en/）と https://api.shinai-inc.jp/
方針: **検索順位に影響する変更は一つも含めない**。各項目に「SEOへの影響」を明記する。

## 実測で確定した事実

| 項目 | 実測 | 意味 |
|---|---|---|
| 配信元 | `Server: GitHub.com`、A=185.199.x.x | GitHub Pages が **リポジトリの根** を配信 |
| Cloudflare | apex/www は DNS のみ（灰色雲）。api.* はプロキシ | 応答ヘッダ・WAF・レート制限が本体サイトに **効いていない** |
| 応答ヘッダ | CSP/HSTS/X-Frame-Options/nosniff/Referrer-Policy **すべて無し** | `deploy/_headers` は GitHub Pages では無視される（仕様） |
| 露出 | `api/index.mjs` `api/lib/guard.mjs` `api/wrangler.toml` `tests/*` が 200 | 防御ロジック・内部識別子が読めていた（鍵は無し） |
| リポジトリ | `shin-ai-inc/website-v2` は **public** | 上と同じものが GitHub でも読める |
| API | CORS 許可リスト・Host検査・管理鍵は定数時間比較・404で伏せる | 設計は良い。**IP単位の制限が無い** |
| メール | SPF あり（さくら）、DMARC `p=none`、DKIM は send.* のみ | `contact@shinai-inc.jp` を **騙る偽メールが届く** 状態 |
| CAA | 無し | 任意の認証局が証明書を発行できる |

## 済（このコミット）
- `_config.yml`: `api` `tests` `tools` `netlify.toml` を配信から除外。`tests/publish.test.mjs` が
  「追跡ファイル全件で 配信の有無＝公開可否」を検証するので、以後の漏れはテストで止まる。
  SEOへの影響: 無し（除外対象は sitemap にも本文にも無い。404 になるだけ）。
- Worker: JSON 応答に `nosniff` `no-store` `Referrer-Policy` `HSTS` を常時付与（`api/lib/headers.mjs`）。
  **デプロイは未実施**（`cd api && npx wrangler deploy`）。SEOへの影響: 無し（APIはクロール対象外）。

## 要・柴田の操作（ダッシュボード）

### 1. 応答ヘッダを効かせる — 二択
**A. Cloudflare Pages へ移す（推奨・恒久）**
- 理由: `_headers` がそのまま効く／非公開リポジトリから配信できる（GitHub Pages は無料プランの組織では不可）／
  Jekyll を介さないので `_config.yml` の除外に頼らなくてよい／`dist/` は公開物だけを含む。
- 手順: Workers & Pages → Create → Pages → Connect to Git → `website-v2` →
  Build command `node _build/build.mjs`、Output `dist` → Custom domains に `shinai-inc.jp` と `www` を追加
  → DNS が自動で CNAME に差し替わる → 反映後、GitHub の Pages を無効化。
- SEOへの影響: 無し。URL・canonical・hreflang・sitemap は一切変わらない。
  切替中も両方が同じ内容を返すので、クロールの断絶は起きない。
- 注意: 切替直後は `curl -sI https://shinai-inc.jp/ | grep -i content-security` で CSP が出ることを確認する。

**B. いまの GitHub Pages のまま、Cloudflare のプロキシを通す（応急）**
- DNS → `shinai-inc.jp` と `www` の雲をオレンジに。SSL/TLS → Full (strict)。
- Rules → Transform Rules → Modify Response Header → 下の 8 個を Set static で追加。
  値は `deploy/_headers` の `/*` 節と同じ（CSP は `dist/_headers` に展開済みの文字列を貼る）。
- SEOへの影響: 無し。ただし **Bot Fight Mode / Super Bot Fight Mode は入れない**。
  robots.txt で GPTBot・ClaudeBot 等を許可しているのに、ボット対策が「自動化されたもの」を
  遮断すると AI 検索からの流入が消える。入れるなら「Verified bots: Allow」を確認したうえで、
  AI Scrapers and Crawlers のトグルは Off のまま。

### 2. API のレート制限（IP 単位）
- 現状は 1 日の総量（chat 800・contact 30）しかなく、**1 台の機械が 1 日分を使い切れば、
  その日の問い合わせが全員ぶん止まる**（reason: busy）。
- Security → WAF → Rate limiting rules（無料プランで 1 本）:
  `(http.host eq "api.shinai-inc.jp" and http.request.uri.path eq "/api/contact")`
  → 同一 IP から 10 分で 5 回を超えたら Block 10 分。
  chat 側も守るなら有料枠。当面は contact を優先（取りこぼしの実害が大きい）。
- SEOへの影響: 無し（api.* はクロール対象外）。

### 3. メールのなりすまし対策（DMARC）
- 現状 `v=DMARC1; p=none;` — 監視も報告も無い。
- 段階: (1) `v=DMARC1; p=none; rua=mailto:dmarc@shinai-inc.jp; adkim=r; aspf=r` で 2 週間報告を集める
  → (2) `p=quarantine; pct=100` → (3) `p=reject`。
- 前提: さくら側の送信に DKIM が付いているかを確認（さくらのコントロールパネル → メール → DKIM）。
  無ければ SPF の整合だけで通る（From とエンベロープが同じドメインなので aspf=r で整合）。
  問い合わせ通知（Resend, `send.shinai-inc.jp`）は DKIM で整合するので reject でも届く。
- SEOへの影響: 無し。

### 4. CAA（任意・慎重に）
- `0 issue "letsencrypt.org"`（GitHub Pages）、`0 issue "pki.goog"`・`0 issue "ssl.com"`・
  `0 issue "digicert.com"`（Cloudflare Universal SSL が使う認証局）。
- 誤って狭めると証明書の更新が止まる。Pages 移行後に、Cloudflare の SSL/TLS 画面が示す認証局を確認してから。
- SEOへの影響: 無し。

### 5. GitHub
- Settings → Branches → `main` に protection（force-push 禁止・直接 push は許可のまま）。
- Settings → Code security → Secret scanning と Dependabot alerts を On（public なら無料）。
- 組織で 2FA を必須に。
- SEOへの影響: 無し。

## やらないこと（理由つき）
- 右クリック禁止・開発者ツール封じ・JS難読化: 防げないうえに、読み上げ・検索・速度を確実に損なう。
- `X-Robots-Tag: noindex` の一括付与: 検索から消える。防御ではない。
- 本体サイトへの JS チャレンジ（人間確認）: Googlebot は通るが、AI クローラと一部の SNS プレビューが落ちる。
