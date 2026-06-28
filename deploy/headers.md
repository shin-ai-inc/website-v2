# deploy/headers.md — CSP とセキュリティ応答ヘッダ（設計・非公開）

本書は内部ドキュメント。デプロイ対象外。ここで定義したヘッダを
`deploy/vercel.json`（Vercel）と `deploy/_headers`（Netlify / Cloudflare Pages）へ反映する。

---

## 1. Content-Security-Policy（最終形）

インラインJS・インラインハンドラは禁止。JSは全て外部ファイル（`scripts/` の 'self'）。
各ページに1件ある JSON-LD は `type="application/ld+json"` の「データ」であり実行されないため、
`script-src` の制約対象外。よってハッシュも `'unsafe-inline'` も不要で、`script-src 'self'` で足りる。
（ビルド `_build/build.mjs` が各ページに同一の Organization JSON-LD を出力する。）

最終CSP文字列:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests
```

チャットAPI有効化時: `connect-src 'self' https://<api-origin>` のように API オリジンを追記する
（ワイルドカード不可）。各ページ meta の CSP・`deploy/_headers`・`deploy/vercel.json` の3箇所を揃える。
実体のヘッダ設定は `deploy/_headers`（Netlify/Cloudflare）と `deploy/vercel.json`（Vercel）にある。

各ディレクティブの意図:

| ディレクティブ | 値 | 意図 |
| --- | --- | --- |
| default-src | 'self' | 既定で同一オリジンのみ。未指定リソース種別の保険 |
| script-src | 'self' | 自前JS(外部ファイル)のみ。CDN・インライン任意実行を排除。JSON-LDはデータで対象外 |
| style-src | 'self' 'unsafe-inline' https://fonts.googleapis.com | 自前CSSと Google Fonts のCSS。インラインstyleは将来除去が望ましい |
| font-src | 'self' https://fonts.gstatic.com | フォント実体は自前か gstatic のみ |
| img-src | 'self' data: | 自前画像と data URI（小SVG/インライン画像） |
| connect-src | 'self' | fetch/XHR/WebSocket を同一オリジンに限定。将来API は BFF 経由 |
| base-uri | 'self' | base タグ注入によるリンク乗っ取りを防止 |
| form-action | 'self' | フォーム送信先を同一オリジンに限定 |
| frame-ancestors | 'none' | クリックジャッキング防止（X-Frame-Options の上位互換） |
| object-src | 'none' | プラグイン由来の実行を排除 |
| upgrade-insecure-requests | （値なし） | http 参照を https へ昇格 |

注: `style-src` の `'unsafe-inline'` は Google Fonts 連携と既存のインラインstyle許容のため
残している。将来インラインstyleを排し自前フォント配信へ移すと `style-src 'self'` まで
締められる（推奨）。

---

## 2. その他のセキュリティ応答ヘッダ

| ヘッダ | 値 | 意図 |
| --- | --- | --- |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | HTTPS強制（2年）。preload 申請を見据える |
| X-Content-Type-Options | nosniff | MIME スニッフィング無効化 |
| Referrer-Policy | strict-origin-when-cross-origin | 越境時はオリジンのみ送出 |
| Permissions-Policy | camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=() | 不要なブラウザ機能を全面無効化 |
| X-Frame-Options | DENY | 旧ブラウザ向けのフレーム埋め込み拒否 |
| Cross-Origin-Opener-Policy | same-origin | クロスオリジン window 参照を遮断 |
| Cross-Origin-Resource-Policy | same-origin | リソースのクロスオリジン読込を制限 |
| Cache-Control（静的資産） | public, max-age=31536000, immutable | ハッシュ付き資産の長期キャッシュ |
| Cache-Control（HTML） | public, max-age=0, must-revalidate | HTML は常に再検証 |

---

## 3. JSON-LD の扱い（ハッシュ不要・本節は参考）

現行設計では JSON-LD の sha256 ハッシュは不要。`type="application/ld+json"` は実行されない
データであり `script-src` の対象外のため、`script-src 'self'` のままで CSP 違反は出ない。
将来どうしてもインラインの実行JSが必要になった場合に限り、以下のハッシュ手法を使う（既定では使わない）。

参考: CSP のハッシュは「`<script ...>` の閉じ `>` の直後から `</script>` の直前まで」の
バイト列に対する `base64( sha256( bytes ) )` である。ブラウザはタグ間の中身を
バイト単位（改行・インデント・全角文字を含む）でハッシュ化するため、ファイル上の
スクリプト本文と一字一句一致させる。

手順:
1. `partials/head-meta.html` の3つの `<script type="application/ld+json"> … </script>` から、
   各ブロックの中身（開始タグの `>` 直後から終了タグ直前まで）を、それぞれ別ファイルへ
   そのままのバイトで切り出す（例: `jsonld1.txt` / `jsonld2.txt` / `jsonld3.txt`）。
   先頭・末尾の改行や空白を足したり削ったりしない。
2. 各ファイルを sha256 → base64 し、`'sha256-...'` を CSP の `script-src` に並べる。

OpenSSL 一行パターン（切り出し済みファイルに対して）:

```
openssl dgst -sha256 -binary jsonld1.txt | openssl base64 -A
```

3ファイル一括（bash）:

```
for f in jsonld1.txt jsonld2.txt jsonld3.txt; do printf "%s sha256-" "$f"; openssl dgst -sha256 -binary "$f" | openssl base64 -A; echo; done
```

PowerShell 一行パターン（バイトをそのまま読みハッシュ化。改行変換を避けるため
`-Raw` でバイト保持し UTF8 で評価する）:

```
"sha256-" + [Convert]::ToBase64String((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash([System.IO.File]::ReadAllBytes("jsonld1.txt")))
```

3ファイル一括（PowerShell）:

```
Get-ChildItem jsonld1.txt,jsonld2.txt,jsonld3.txt | ForEach-Object { "$($_.Name): sha256-" + [Convert]::ToBase64String((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash([System.IO.File]::ReadAllBytes($_.FullName))) }
```

3. 得た3値を、本書 1章の CSP の `<JSONLD_1>`/`<JSONLD_2>`/`<JSONLD_3>` と
   `deploy/vercel.json`・`deploy/_headers` の同位置へ差し替える。
4. ブラウザのコンソールに CSP 違反（Refused to execute inline script）が出ないことを確認。
   出る場合はバイト不一致（改行コード CRLF/LF やインデントのずれ）を疑い、切り出しを見直す。

注意:
- partials を index.html へ結合する際に JSON-LD の字下げ・改行が変わると、ハッシュは
  結合後の最終 index.html の中身に対して算出し直す。最終成果物が真実源。
- CRLF と LF でハッシュは変わる。リポジトリの改行設定（.gitattributes / エディタ）を固定する。

---

## 4. meta タグ版CSP（ヘッダ設定不可ホスト向けフォールバック）

ホスティングで応答ヘッダを設定できない場合のみ、`index.html` の `<head>` 先頭付近に
以下を置く。ヘッダ版が使えるなら meta 版は使わない（ヘッダ版を優先）。

```
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'">
```

これは各ページの `<head>` に既にビルドで埋め込み済み（`_build/build.mjs`）。ヘッダ版が使えるなら
ヘッダ版を正とし、meta 版は重複していても害はない（より厳しい方が適用される）。

meta 版の制約:
- `frame-ancestors` は meta では無効。クリックジャッキング防止はヘッダ（X-Frame-Options /
  frame-ancestors）でしか効かない。
- `Strict-Transport-Security`（HSTS）は meta で設定できない。HTTPS強制はホスティング側で行う。
- `upgrade-insecure-requests` は meta でも概ね有効だが、ヘッダ版を正とする。
- その他のセキュリティヘッダ（nosniff / Referrer-Policy / Permissions-Policy / COOP / CORP）も
  meta では設定できない。meta 版はあくまで暫定であり、可能な限りヘッダ版へ移行する。
</content>
