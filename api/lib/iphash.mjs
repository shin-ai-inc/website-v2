/*
  ShinAI サポートAI — IP の一方向ハッシュと、塩の状態。

  IP は個人情報。相関に足るハッシュだけを残す。
  以前は IP_SALT が無いと公開の既定値("shinai")で代用していた。公開リポジトリに
  既定値が書いてある以上、それは塩ではなく、ハッシュから IP を総当たりで戻せる。
  未設定は「無い」として扱い、呼び出し側が IP 単位の統制を止める側に倒す。

  ハッシュは salt+":"+ip の SHA-256 から HMAC-SHA256 へ変えた。
  連結方式は塩と IP の境界が曖昧で、鍵付きハッシュとしての性質を持たない。
*/

/* 32 文字未満の塩は「設定済みだが弱い」。本番は設定済みの事実が確認されているため、
   ここで止めると動いている統制を止めることになる。記録して続行する。 */
export const MIN_SALT_CHARS = 32;

/**
 * @returns {"unconfigured"|"weak"|"ok"}
 */
export function saltStatus(env) {
  const salt = env && typeof env.IP_SALT === "string" ? env.IP_SALT.trim() : "";
  if (!salt) return "unconfigured";
  return salt.length < MIN_SALT_CHARS ? "weak" : "ok";
}

/**
 * HMAC-SHA256(salt, ip) の前方 8 バイトを16進で返す。IP が無ければ "unknown"。
 */
export async function hashIp(ip, salt) {
  if (!ip) return "unknown";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(String(salt)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(String(ip)));
  return Array.from(new Uint8Array(mac).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
