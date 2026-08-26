-- お客様の声。チャットへ寄せられた入力のうち、見返す価値のあるものだけを残す。
-- 適用: cd api && npx wrangler d1 execute shinai-voices --remote --file=schema.sql
--
-- 生のIPアドレスも、氏名・連絡先を取り出す列も持たない。
-- 本文に連絡先が書かれていた場合はその文字列ごと残るが、
-- 検索や結合の鍵にはしない(名寄せができる形にしない)。

CREATE TABLE IF NOT EXISTS voices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,            -- ISO8601(UTC)
  message    TEXT NOT NULL,            -- 利用者の入力(300字で切る)
  locale     TEXT NOT NULL,            -- ja / en
  kind       TEXT NOT NULL,            -- question / handoff
  session    TEXT NOT NULL DEFAULT '', -- 同一の対話をまとめて読むため
  ip_hash    TEXT NOT NULL DEFAULT ''  -- 同一人物の連続発言の把握のみに使う
);

-- 新しい順の取り出しと、保存期間を過ぎた行の削除の双方がこの索引で足りる。
CREATE INDEX IF NOT EXISTS idx_voices_created_at ON voices (created_at);

-- 問い合わせフォームの送信控え。メール送信(Resend)が失敗したときだけ書く。
-- 適用: cd api && npx wrangler d1 execute shinai-voices --remote --file=schema.sql
--
-- voices テーブルと違い、氏名・連絡先・相談内容をそのまま持つ。
-- フォローアップに使うための最後の砦であり、届いた相談を取りこぼさないことが
-- 目的のため。保存期間は contact.mjs の DEADLETTER_RETENTION_DAYS(30日)と一致させる。

CREATE TABLE IF NOT EXISTS contact_deadletter (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,            -- ISO8601(UTC)
  company    TEXT NOT NULL,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  locale     TEXT NOT NULL,            -- ja / en
  reason     TEXT NOT NULL             -- 送信に失敗した理由(監査用)
);

CREATE INDEX IF NOT EXISTS idx_contact_deadletter_created_at ON contact_deadletter (created_at);
