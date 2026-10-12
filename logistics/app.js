(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const config = window.SHINAI_CONFIG || {};
  const endpoint = typeof config.endpoint === 'string' ? config.endpoint.trim() : '';
  const live = Boolean(endpoint && config.privacyUrl && config.privacyApproved && location.protocol !== 'file:');
  const topics = {
    '書類・転記': {label: '帰庫後の日報修正が多い', title: 'どの項目で、直しが起きますか。', copy: '記入漏れ、読み違い、戻し確認。帰庫後に増える手間を順番に整理します。'},
    '会議・議事録': {label: '紙の日報をExcelへ転記する', title: 'どこから、どこへ写していますか。', copy: '紙の日報からExcel、勤怠、請求へ。二重入力になっている箇所を見つけます。'},
    '情報整理・検索': {label: 'ドライバーごとに書き方が違う', title: '書き方の違いで、何を確認していますか。', copy: '項目、表現、単位のばらつき。修正が起きる理由を現場の流れから整理します。'},
    'AI導入全般': {label: '運行データをまとめるのが大変', title: 'どのデータを、どこへ渡しますか。', copy: '配車、勤怠、請求への転記。まず一つの流れを選び、小さく試す候補を探します。'},
    'その他': {label: 'その他', title: '日報のどの場面から話しますか。', copy: 'うまく説明できなくても構いません。修正、転記、確認のどこに手間があるかを一緒に整理します。'}
  };
  const radios = [...document.querySelectorAll('[name="work-topic"]')];
  const theme = $('theme');
  const themeOptions = $('theme-options');
  const optionButtons = Object.entries(topics).map(([key, topic], index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'theme-option'; button.dataset.value = key;
    button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', 'false');
    button.tabIndex = index === 0 ? 0 : -1; button.textContent = topic.label;
    button.addEventListener('click', () => choose(key, 'form'));
    button.addEventListener('keydown', event => {
      const keys = ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? optionButtons.length - 1 :
        (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + optionButtons.length) % optionButtons.length;
      choose(optionButtons[next].dataset.value, 'form'); optionButtons[next].focus();
    });
    themeOptions.append(button); return button;
  });
  function track(event, data = {}) {
    if (Array.isArray(window.dataLayer)) window.dataLayer.push({event, ...data});
  }
  function choose(key, source = '') {
    const topic = topics[key];
    theme.value = topic ? key : '';
    radios.forEach(r => { r.checked = r.value === key; });
    optionButtons.forEach((button, index) => {
      const selected = button.dataset.value === key;
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected || !topic && index === 0 ? 0 : -1;
    });
    $('insight-title').textContent = topic ? topic.title : '日報の「直し」を、ひとつ分ける。';
    $('insight-copy').textContent = topic ? topic.copy : '修正、転記、確認。どこで時間が増えているかを整理します。';
    $('selected-note').hidden = !topic;
    $('selected-note').textContent = topic ? 'ご相談テーマ：' + topic.label + '（下の欄で変更できます）' : '';
    $('topic-cta').textContent = topic ? 'この日報の手間を相談する' : '日報の手間を相談する';
    if (topic) clearError(theme);
    if (source) track('choose_work_topic', {topic: key, placement: source});
  }
  radios.forEach(r => r.addEventListener('change', () => choose(r.value, 'worksheet')));
  theme.addEventListener('change', () => choose(theme.value, 'form'));
  const params = new URLSearchParams(location.search);
  const initial = params.get('theme') || params.get('topic');
  if (initial && topics[initial]) choose(initial);
  document.querySelectorAll('[data-cta]').forEach(a => a.addEventListener('click', () => track('consultation_cta_click', {placement: a.dataset.cta, topic: theme.value})));
  const menu = document.querySelector('.menu-toggle');
  const mobileNav = $('mobile-nav');
  function closeMenu(returnFocus = false) { mobileNav.hidden = true; menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'メニューを開く'); if (returnFocus) menu.focus(); }
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; mobileNav.hidden = !open; menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く'); });
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !mobileNav.hidden) closeMenu(true); });
  const breakpoint = matchMedia('(min-width:651px)');
  breakpoint.addEventListener('change', e => { if (e.matches) closeMenu(); });
  const sticky = $('mobile-sticky');
  let heroVisible = true, contactVisible = false;
  const updateSticky = () => { const hide = heroVisible || contactVisible; sticky.classList.toggle('is-hidden', hide); sticky.inert = hide; };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { for (const e of entries) { if (e.target.id === 'top') heroVisible = e.isIntersecting; if (e.target.id === 'contact') contactVisible = e.isIntersecting; } updateSticky(); }, {threshold: 0}).observe($('top'));
    new IntersectionObserver(entries => { contactVisible = entries[0].isIntersecting; updateSticky(); }, {threshold: 0}).observe($('contact'));
    updateSticky();
  }
  const form = $('lead-form');
  const fields = $('form-fields');
  const confirmation = $('form-confirmation');
  const status = $('form-status');
  const send = $('send-button');
  const edit = $('edit-button');
  let pending = false, completed = false, confirmedPayload = null, started = false;
  if (live) {

    const disclosure = document.querySelector('.privacy-disclosure');
    const link = document.createElement('a'); link.textContent = '個人情報の取り扱いを確認する'; link.href = config.privacyUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'text-link'; disclosure.replaceChildren(link);
  }
  if (!live) { send.querySelector('span').textContent = '入力内容を確認する（送信なし）'; }
  form.addEventListener('focusin', () => { if (!started) { track('consultation_form_start'); started = true; } });
  function clearError(input) { input.removeAttribute('aria-invalid'); const error = $(input.id + '-error'); if (error) error.textContent = ''; }
  function errorFor(input) {
    if (input.type === 'checkbox') return input.checked ? '' : '相談対応のための情報利用への同意が必要です。';
    if (!input.value.trim()) return ({company:'会社名・屋号を入力してください。',name:'お名前を入力してください。',email:'メールアドレスを入力してください。',theme:'気になっている日報の手間を選んでください。'})[input.id];
    if (input.type === 'email' && !input.validity.valid) return 'メールアドレスの形式をご確認ください。';
    return '';
  }
  const required = [...form.querySelectorAll('[required]')];
  required.forEach(input => input.addEventListener(input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', () => { if (!errorFor(input)) clearError(input); }));
  function validate() {
    let first;
    for (const input of required) { const err = errorFor(input); if (err) { input.setAttribute('aria-invalid','true'); $(input.id + '-error').textContent = err; first ||= input; } else clearError(input); }
    if (first) { (first === theme ? optionButtons.find(b => b.tabIndex === 0) : first).focus(); return false; }
    return true;
  }
  function setStatus(message, kind = '') { status.hidden = false; status.className = 'form-status ' + kind; status.setAttribute('role',kind === 'error' ? 'alert' : 'status'); status.textContent = message; status.focus(); }
  form.addEventListener('submit', e => {
    e.preventDefault(); if (pending || completed || !fields.hidden && !validate()) return;
    if (fields.hidden) return;
    status.hidden = true;
    const data = new FormData(form);
    confirmedPayload = {company: String(data.get('company')).trim(), name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), theme: String(data.get('theme')), message: String(data.get('message')).trim(), website: String(data.get('website') || ''), privacyConsent: data.has('privacyConsent')};
    const rows = [['会社名・屋号',confirmedPayload.company],['お名前',confirmedPayload.name],['メールアドレス',confirmedPayload.email],['気になっている日報の手間',topics[confirmedPayload.theme].label],['ひとこと',confirmedPayload.message || '未記入'],['個人情報の取り扱い','同意する']];
    $('confirmation-list').replaceChildren(...rows.map(([label,value]) => { const div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; div.append(dt,dd); return div; }));
    fields.hidden = true; confirmation.hidden = false;  $('selected-note').hidden = true; confirmation.focus();
  });
  edit.addEventListener('click', () => { if (pending || completed) return; fields.hidden = false; confirmation.hidden = true; status.hidden = true;  $('selected-note').hidden = !theme.value; $('company').focus(); });
  
  const siteKey = typeof config.turnstileSiteKey === 'string' ? config.turnstileSiteKey : '';
  const tsSlot = form.querySelector('[data-turnstile]');
  let tsWidget = null;
  function loadTurnstile() {
    if (!live || !siteKey || !tsSlot || window.shinaiTurnstileReady) return;
    window.shinaiTurnstileReady = () => {
      tsSlot.hidden = false;
      tsWidget = window.turnstile.render(tsSlot, {sitekey: siteKey, size: 'flexible', theme: 'light', language: 'ja'});
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=shinaiTurnstileReady&render=explicit';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  }
  form.addEventListener('focusin', loadTurnstile);
  const tsToken = () => (tsWidget !== null && window.turnstile ? window.turnstile.getResponse(tsWidget) : '');
  const tsReset = () => { if (tsWidget !== null && window.turnstile) window.turnstile.reset(tsWidget); };

  const MESSAGE_LIMIT = 2000;
  function composeMessage(p) {
    const utm = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']
      .map(k => [k, (params.get(k) || '').slice(0, 150)]).filter(([, v]) => v).map(([k, v]) => k + '=' + v);
    const head = [
      '【運送業 LP・無料相談のお申し込み】',
      '気になっている日報の手間: ' + (topics[p.theme] ? topics[p.theme].label : '（未選択）'),
      '流入: ' + (utm.length ? utm.join(' / ') : '（指定なし）'),
      'ひとこと:'
    ].join('\n');
    const room = MESSAGE_LIMIT - head.length - 1;
    return head + '\n' + (p.message ? p.message.slice(0, room) : '（記入なし）');
  }

  const leadEventId = () => (window.crypto && window.crypto.randomUUID
    ? 'lead-' + window.crypto.randomUUID()
    : 'lead-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
  function trackLead() {
    try {
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead', {}, {eventID: leadEventId()});
    } catch (_) {  }
  }

  send.addEventListener('click', async () => {
    if (pending || completed || !confirmedPayload) return;
    if (!live) { setStatus('これは閲覧・操作確認用のプレビューです。内容は送信されていません。実際のご相談は contact@shinai-inc.jp へお問い合わせください。'); return; }
    const token = siteKey ? tsToken() : '';
    if (siteKey && !token) {
      loadTurnstile();
      setStatus('人間確認が終わっていません。数秒待ってから、もう一度「申し込む」を押してください。解消しない場合は contact@shinai-inc.jp へ直接お送りください。', 'error');
      return;
    }
    pending = true; send.disabled = true; edit.disabled = true; status.hidden = true; send.querySelector('span').textContent = '送信しています…';
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    const body = {
      company: confirmedPayload.company, name: confirmedPayload.name, email: confirmedPayload.email,
      message: composeMessage(confirmedPayload), consent: confirmedPayload.privacyConsent, locale: 'ja',
      'company-website': confirmedPayload.website
    };
    if (token) body.turnstile = token;
    try {
      const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) { const e = new Error('受付エラー'); e.reason = result.reason || ''; throw e; }
      completed = true; confirmation.hidden = true;  setStatus('お申し込みを受け付けました。ご入力のメールアドレスへ、候補日時をご案内します。日程が決まるまで予約は確定しません。','success'); track('consultation_lead_success',{topic:confirmedPayload.theme}); trackLead(); form.reset(); confirmedPayload = null; choose('');
    } catch (error) {
      tsReset();
      const message = error.name === 'AbortError' ? '送信結果を確認できませんでした。再送信の前に、contact@shinai-inc.jp へ受付状況をご確認ください。入力内容は保持しています。'
        : error.reason === 'turnstile_failed' ? '人間確認を通過できませんでした。入力内容は保持しています。確認が表示されたら、もう一度「申し込む」を押してください。'
        : error.reason === 'busy' ? '本日の受付が混み合っています。入力内容は保持しています。お手数ですが contact@shinai-inc.jp へ直接お送りください。'
        : '送信を完了できませんでした。入力内容は保持しています。時間をおいて再度お試しいただくか、contact@shinai-inc.jp へお問い合わせください。';
      setStatus(message, 'error');
    } finally { clearTimeout(timeout); pending = false; send.disabled = completed; edit.disabled = completed; send.querySelector('span').textContent = 'この内容で申し込む（無料）'; }
  });
})();
