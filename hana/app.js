/** 公開前にここへ公式LINEの正しいURLを入力してください。例：'https://lin.ee/xxxxxxxx'（例の文字列は使用しない） */
const OFFICIAL_LINE_URL = 'https://lin.ee/SRkMBnO';
(function(){
 const header=document.getElementById('header');
 window.addEventListener('scroll',()=>header.classList.toggle('scrolled',window.scrollY>10),{passive:true});
 const lineLinks=document.querySelectorAll('.line-link');
 const valid=/^https:\/\/(lin\.ee|line\.me|liff\.line\.me)\//i.test(OFFICIAL_LINE_URL);
 const dialog=document.getElementById('setup-dialog');
 lineLinks.forEach(link=>{if(valid){link.href=OFFICIAL_LINE_URL;link.target='_blank';link.rel='noopener noreferrer';link.addEventListener('click',()=>{if(Array.isArray(window.dataLayer))window.dataLayer.push({event:'official_line_click',position:link.dataset.position||'unknown'})})}else{link.href='#line';link.addEventListener('click',e=>{e.preventDefault();if(dialog?.showModal)dialog.showModal();else alert('公式LINEのURLは未設定です。公開前に設定してください。')})}});
 document.getElementById('dialog-close')?.addEventListener('click',()=>dialog.close());
 dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 if('IntersectionObserver' in window){const obs=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}})},{threshold:.10,rootMargin:'0px 0px -10px 0px'});document.querySelectorAll('[data-reveal]').forEach(el=>obs.observe(el))}else{document.querySelectorAll('[data-reveal]').forEach(el=>el.classList.add('visible'))}
})();
