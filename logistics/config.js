/* 申し込みの送り先と、人間確認(Turnstile)のサイトキー(公開値)。
   送り先は会社サイトと同じ問い合わせの窓口(api.shinai-inc.jp/api/contact)。
   秘密の値はここに置かない。サイトキーは scripts/config.js と一致させる(tests/seo.test.mjs)。 */
window.SHINAI_CONFIG = Object.freeze({
  endpoint: 'https://api.shinai-inc.jp/api/contact',
  privacyUrl: '/privacy.html',
  privacyApproved: true,
  turnstileSiteKey: '0x4AAAAAAFTJZdr2_RyakUSL'
});
