(function () {
  'use strict';
  var SOURCE_KEY = 'sm_source';
  var API = 'https://api.shinai-inc.jp';
  var MAIL = 'contact@shinai-inc.jp';

  function captureSource() {
    try {
      if (localStorage.getItem(SOURCE_KEY)) return;
      var q = new URLSearchParams(location.search);
      var src = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
        var v = q.get(k); if (v) src[k] = v.slice(0, 200);
      });
      if (document.referrer) { try { src.referrer = new URL(document.referrer).hostname.slice(0, 200); } catch (e) {} }
      src.landing = location.pathname.slice(0, 200);
      localStorage.setItem(SOURCE_KEY, JSON.stringify(src));
    } catch (e) {}
  }
  function readSource() {
    try { var s = JSON.parse(localStorage.getItem(SOURCE_KEY) || '{}'); s.page = location.pathname.slice(0, 200); return s; } catch (e) { return { page: location.pathname }; }
  }
    function sourceLine() {
    var s = readSource();
    var parts = [];
    if (s.utm_source) parts.push(s.utm_source + (s.utm_medium ? ' / ' + s.utm_medium : ''));
    if (s.utm_campaign) parts.push(s.utm_campaign);
    if (s.referrer) parts.push(s.referrer);
    return parts.length ? '【流入】' + parts.join('、').slice(0, 200) : '';
  }

  function track(event, detail) {
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: event }, detail || {})); } catch (e) {}
  }

  captureSource();
  track('sm_page_view');

  document.querySelectorAll('[data-cta]').forEach(function (el) {
    el.addEventListener('click', function () { track('sm_cta_click', { cta: el.getAttribute('data-cta') }); });
  });
  var video = document.getElementById('demo-video');
  if (video) {
    var played = false;
    video.addEventListener('play', function () { if (!played) { played = true; track('sm_view_demo'); } });
    video.addEventListener('ended', function () { track('sm_view_demo_complete'); });
  }

  var sticky = document.getElementById('sticky-cta');
  var hero = document.getElementById('top');
  var consult = document.getElementById('consult');
  if (sticky && hero && 'IntersectionObserver' in window) {
    var heroVisible = true, consultVisible = false;
    function update() {
      var show = !heroVisible && !consultVisible;
      sticky.classList.toggle('show', show);
      document.body.classList.toggle('has-sticky', show);
    }
    new IntersectionObserver(function (es) { heroVisible = es[0].isIntersecting; update(); }, { threshold: 0.1 }).observe(hero);
    if (consult) new IntersectionObserver(function (es) { consultVisible = es[0].isIntersecting; update(); }, { threshold: 0.1 }).observe(consult);
  }

  var form = document.getElementById('inquiry-form');
  if (!form) return;
  var errorBox = document.getElementById('form-error');
  var done = document.getElementById('form-done');
  var button = document.getElementById('submit-inquiry');
  var started = false;

  form.addEventListener('focusin', function () { if (!started) { started = true; track('sm_inquiry_start'); } });

  function showError(msg, field) {
    errorBox.textContent = msg; errorBox.hidden = false;
    if (field && form.elements[field]) { form.elements[field].focus(); }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    errorBox.hidden = true;
    var f = form.elements;
    if (!f.product.value.trim()) return showError('商品について入力してください。', 'product');
    if (!f.contact_email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.contact_email.value.trim())) return showError('ご連絡先のメールアドレスを確かめてください。', 'contact_email');
    if (!f.contact_name.value.trim()) return showError('お名前を入力してください。', 'contact_name');
    if (!f.company.value.trim()) return showError('会社・ブランド名を入力してください。', 'company');
    if (!f.agree.checked) return showError('プライバシーポリシーへの同意が必要です。', 'agree');
    track('sm_inquiry_submit');
    button.disabled = true; button.textContent = '送信しています…';
    try {
      var body = [
        '【何を伝える映像か】' + f.product.value.trim(),
        '【使いたい場所】' + f.purpose.value,
        f.message.value.trim() ? '【ご相談】' + f.message.value.trim() : '',
        sourceLine()
      ].filter(Boolean).join('\n');
      var res = await fetch(API + '/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: f.company.value.trim(), name: f.contact_name.value.trim(),
          email: f.contact_email.value.trim(), message: body, consent: true, locale: 'ja',
                    'company-website': f.website.value
        })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        showError(data.reason === 'busy'
          ? '本日の受付が上限に達しました。お手数ですが ' + MAIL + ' へ直接お送りください。'
          : '送信できませんでした。通信の状態をご確認のうえ、もう一度お試しください。解消しない場合は ' + MAIL + ' へ直接お送りください。');
        return;
      }
      track('sm_inquiry_success');
      form.hidden = true; done.hidden = false; done.setAttribute('tabindex', '-1'); done.focus();
    } catch (e) {
      showError('通信に失敗しました。電波の状態を確かめて、もう一度お試しください。');
    } finally {
      button.disabled = false; button.innerHTML = '相談を送る <span aria-hidden="true">↗</span>';
    }
  });
})();
