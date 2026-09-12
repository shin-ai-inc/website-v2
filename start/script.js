(() => {
  'use strict';
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('#mobile-nav');
  const closeMenu = (returnFocus = false) => {
    nav.hidden = true;
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'メニューを開く');
    if (returnFocus) menu.focus();
  };
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    nav.hidden = !open;
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !nav.hidden) closeMenu(true); });
  document.addEventListener('click', e => { if (!nav.hidden && !e.target.closest('.header')) closeMenu(); });
  window.matchMedia('(min-width:761px)').addEventListener('change', e => { if(e.matches) closeMenu(); });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion:reduce)');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const items = [...document.querySelectorAll('.reveal')];
    items.forEach(el => { if (el.getBoundingClientRect().top > window.innerHeight) el.classList.add('pending'); });
    document.documentElement.classList.add('motion-ready');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.remove('pending'); observer.unobserve(entry.target); }
      });
    }, { threshold:0.08 });
    items.forEach(el => observer.observe(el));
  }
  const progress = document.querySelector('.reading-progress');
  let ticking = false;
  const updateProgress = () => {
    document.querySelector('.header').classList.toggle('is-scrolled', window.scrollY > 32);
    const height = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (height > 0 ? Math.min(100, Math.max(0, window.scrollY / height * 100)) : 0) + '%';
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { window.requestAnimationFrame(updateProgress); ticking = true; } }, { passive:true });
  window.addEventListener('resize', updateProgress);
  updateProgress();
  document.querySelector('#year').textContent = String(new Date().getFullYear());
})();
