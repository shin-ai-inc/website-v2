'use strict';
const menuToggle=document.querySelector('.menu-toggle');
const primaryNav=document.getElementById('primary-nav');
function setMenu(open){menuToggle.setAttribute('aria-expanded',String(open));primaryNav.dataset.open=String(open);menuToggle.querySelector('span').textContent=open?'−':'＋'}
menuToggle.addEventListener('click',()=>setMenu(menuToggle.getAttribute('aria-expanded')!=='true'));
primaryNav.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>setMenu(false)));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuToggle.getAttribute('aria-expanded')==='true'){setMenu(false);menuToggle.focus()}});
const scenes=[
 {title:'復唱した内容が、その場で文字になります。',status:'● 記録中',rows:[['用件','予約の変更'],['希望日','来週の火曜日'],['時間帯','午後']],bottom:'聞こえていないことは、書きません。'},
 {title:'決まったことと、まだのことを分けて出します。',status:'確認待ち',rows:[['希望日','来週の火曜日','00:12「来週の火曜日」'],['時間帯','午後','00:12「午後をご希望ですね」'],['具体的な時刻','未確認：スタッフによる確認が必要です']],bottom:'もとの発言を見ながら、電話中に聞き直せます。'},
 {title:'電話を切ると、申し送りの下書きができています。',status:'下書き',rows:[['申し送り案','予約変更のご相談。希望は来週火曜日の午後。'],['残る確認','具体的な時刻・変更先の空き状況'],['次の仕事','スタッフが内容を確認し、予約システムで対応']],bottom:'この画面例では、予約の変更は実行されません。'}
];
const tabs=[...document.querySelectorAll('[data-step]')];
function selectScene(index){const scene=scenes[index];tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1});document.getElementById('demo-panel').setAttribute('aria-labelledby',"tab-"+index);document.getElementById('demo-title').textContent=scene.title;document.getElementById('demo-status').textContent=scene.status;document.getElementById('demo-bottom').textContent=scene.bottom;const content=document.getElementById('demo-content');content.replaceChildren();scene.rows.forEach(([label,value,evidence])=>{const row=document.createElement('div');row.className='data-row';const key=document.createElement('span');key.textContent=label;const detail=document.createElement('div');const text=document.createElement('strong');text.textContent=value;if(value.startsWith('未確認'))text.className='unknown';detail.append(text);if(evidence){const source=document.createElement('small');source.className='evidence';source.textContent='根拠：'+evidence;detail.append(source)}row.append(key,detail);content.append(row)})}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectScene(index));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();selectScene(next);tabs[next].focus()}})});selectScene(0);
