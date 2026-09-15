(function(){
"use strict";
var EN=(document.documentElement.getAttribute("lang")||"ja").indexOf("en")===0;
var T=EN?{
greet:"Hello. This is the ShinAI assistant. Ask anything about unlocking tacit knowledge, or about applying it to your work.",
tooLong:"That message is too long. Please keep it within 500 characters.",
refused:"Sorry, we cannot answer that. For a specific enquiry, please use the contact form.",
tooFast:"Messages are coming through quickly. Please wait a moment.",
notReady:"The AI assistant is not live yet. Send us a note through the contact form and someone will get back to you.",
failed:"Sorry, we could not respond just now. Please use the contact form.",
offline:"We could not reach the server. Please check your connection, or contact us through the form.",
cta:"Go to contact and free consultation",
typing:"Typing",
cues:["contact","consultation","get in touch","adopt","your company","price",
"pricing","cost","how long","timeline","more detail","specific","proposal","quote"]
}:{
greet:"こんにちは。ShinAI のアシスタントです。暗黙知の解消や業務への適用についてお気軽にお尋ねください。",
tooLong:"メッセージが長すぎます。500文字以内でお願いします。",
refused:"申し訳ありません。その内容には回答できません。具体的なご相談はお問い合わせフォームをご利用ください。",
tooFast:"送信が続いています。少しだけお待ちください。",
notReady:"ただいまAIアシスタントは準備中です。お問い合わせフォームよりご連絡いただければ、担当より折り返します。",
failed:"申し訳ありません。一時的に応答できませんでした。お問い合わせフォームをご利用ください。",
offline:"サーバーに接続できませんでした。通信環境をご確認のうえ、お問い合わせフォームよりご連絡ください。",
cta:"お問い合わせ・無料相談へ",
typing:"入力中",
cues:["お問い合わせ","無料相談","ご相談ください","導入","御社","貴社",
"料金","費用","期間","詳しく","具体的","ご提案"]
};
var CRISIS=/死にたい|しにたい|消えたい|生きるのが(つらい|辛い|嫌)|自殺|自傷|リストカット|誰も助けて|kill myself|suicide|want to die|end my life|self[ -]harm/i;
var Chatbot={
button:null,
panel:null,
closeBtn:null,
messages:null,
input:null,
sendBtn:null,
isTyping:false,
sessionId:null,
lastMessageTime:0,
typingSpeed:12,
loadingDelay:380,
init:function(){
this.button=document.getElementById("chatbot-button");
this.panel=document.getElementById("chatbot-window");
this.closeBtn=document.getElementById("chatbot-close");
this.messages=document.getElementById("chatbot-messages");
this.input=document.getElementById("chat-input");
this.sendBtn=document.getElementById("chat-send");
if(!this.button||!this.panel||!this.messages||!this.input||!this.sendBtn){
return;
}
this.bind();
this.greet();
},
bind:function(){
var self=this;
this.button.addEventListener("click",function(){self.toggle();});
if(this.closeBtn){
this.closeBtn.addEventListener("click",function(){self.close();});
}
if(window.visualViewport){
var syncSheet=function(){self.fitToViewport();};
window.visualViewport.addEventListener("resize",syncSheet);
window.visualViewport.addEventListener("scroll",syncSheet);
}
this.input.addEventListener("focus",function(){
window.setTimeout(function(){self.scrollToEnd();},250);
});
this.input.addEventListener("input",function(){self.growInput();});
this.sendBtn.addEventListener("click",function(){self.send();});
this.input.addEventListener("keydown",function(e){
if(e.key==="Enter"&&!e.shiftKey){
e.preventDefault();
self.send();
}
});
document.addEventListener("keydown",function(e){
if((e.key==="Escape"||e.key==="Esc")&&self.panel.classList.contains("is-open")){
self.close();
self.button.focus();
}
});
},
greet:function(){
this.addMessage(T.greet,"bot");
},
toggle:function(){
var willOpen=!this.panel.classList.contains("is-open");
this.panel.classList.toggle("is-open",willOpen);
this.button.setAttribute("aria-expanded",willOpen?"true":"false");
if(willOpen){
this.lockBackground();
this.fitToViewport();
this.scrollToEnd();
}else{
this.unlockBackground();
this.resetSheet();
}
if(willOpen&&window.innerWidth>768){
this.input.focus();
}
},
close:function(){
this.panel.classList.remove("is-open");
this.button.setAttribute("aria-expanded","false");
this.unlockBackground();
this.resetSheet();
},
lockBackground:function(){
if(window.innerWidth>640){
return;
}
this.savedScrollY=window.scrollY||document.documentElement.scrollTop||0;
document.body.style.position="fixed";
document.body.style.top=-this.savedScrollY+"px";
document.body.style.left="0";
document.body.style.right="0";
document.body.style.width="100%";
document.body.classList.add("chat-open");
},
unlockBackground:function(){
if(document.body.style.position!=="fixed"){
return;
}
document.body.style.position="";
document.body.style.top="";
document.body.style.left="";
document.body.style.right="";
document.body.style.width="";
document.body.classList.remove("chat-open");
window.scrollTo({top:0,left:0,behavior:"instant"});
},
fitToViewport:function(){
if(window.innerWidth>640||!this.panel.classList.contains("is-open")){
this.resetSheet();
return;
}
var vv=window.visualViewport;
if(!vv){
return;
}
var covered=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));
this.panel.style.setProperty("--chat-kb",covered+"px");
this.scrollToEnd();
},
resetSheet:function(){
this.panel.style.removeProperty("--chat-kb");
},
validate:function(text){
if(text.length>500){
return T.tooLong;
}
if(CRISIS.test(text)){
return null;
}
var dangerous=[
/<script|javascript:|onerror=|onload=|onclick=/i,
/\b(system prompt|ignore (the )?(previous|above)|disregard|override|bypass|jailbreak)\b/i,
/(前述|以前|上記|これまで).{0,6}(指示|命令).{0,6}(無視|忘れ)/,
/あなたは(今|これ)から|代わりに.{0,8}(答え|出力|表示)/,
/(api\s*キー|シークレット|パスワード|トークン|認証情報|環境変数).{0,8}(教え|表示|出力|見せ)/i,
/(system|あなた).{0,6}(設定|プロンプト|指示).{0,6}(見せ|表示|教え)/i,
/(drop\s+table|delete\s+from|insert\s+into|union\s+select|'\s*;\s*--|'\s*or\s*'1'\s*=\s*'1)/i
];
var i;
for(i=0;i<dangerous.length;i+=1){
if(dangerous[i].test(text)){
return T.refused;
}
}
return null;
},
send:function(){
var self=this;
var text=this.input.value.trim();
if(!text||this.isTyping){
return;
}
var now=Date.now();
if(now-this.lastMessageTime<2000){
this.addMessage(T.tooFast,"bot");
return;
}
var problem=this.validate(text);
if(problem){
this.addMessage(text,"user");
this.resetInput();
this.addMessage(problem,"bot");
return;
}
this.lastMessageTime=now;
this.addMessage(text,"user");
this.resetInput();
var apiBase=(window.SHINAI_CONFIG&&window.SHINAI_CONFIG.chatbotApiBase)||"";
if(!apiBase){
this.addMessage(T.notReady,"bot");
this.addContactCta();
return;
}
if(!this.sessionId){
this.sessionId=this.makeSessionId();
}
this.showTyping();
var endpoint=apiBase.replace(/\/+$/,"")+"/api/chatbot"+(EN?"?lang=en":"");
window.fetch(endpoint,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({message:text,sessionId:this.sessionId})
}).then(function(res){
return res.json();
}).then(function(data){
window.setTimeout(function(){
self.hideTyping();
if(data&&data.success&&typeof data.response==="string"){
self.typeMessage(data.response);
}else{
self.addMessage(T.failed,"bot");
self.addContactCta();
}
},self.loadingDelay);
}).catch(function(){
self.hideTyping();
self.addMessage(T.offline,"bot");
self.addContactCta();
});
},
makeSessionId:function(){
var array=new Uint8Array(16);
(window.crypto||window.msCrypto).getRandomValues(array);
return Array.prototype.map.call(array,function(b){
return("0"+b.toString(16)).slice(-2);
}).join("");
},
mountRow:function(bubble,type){
var row=document.createElement("div");
row.className="chatbot__row chatbot__row--"+type;
if(type==="bot"){
row.appendChild(this.createAvatar());
}
row.appendChild(bubble);
this.messages.appendChild(row);
this.scrollToEnd();
return row;
},
createAvatar:function(){
var wrap=document.createElement("div");
wrap.className="chatbot__avatar aito aito--avatar";
wrap.setAttribute("aria-hidden","true");
wrap.innerHTML=
'<svg viewBox="0 0 66 52" fill="none" focusable="false">'+
'<g class="aito-block">'+
'<rect x="4" y="23" width="15" height="15" rx="3" class="ab-box"/>'+
'<path d="M8 29 h7 M8 33 h5" class="ab-lines"/>'+
"</g>"+
'<path d="M26 30 q-5 -1 -8 1" class="aito-arm"/>'+
'<g class="aito-body">'+
'<rect x="25" y="11" width="36" height="30" rx="9" class="ab-face"/>'+
'<path d="M43 11 v-5" class="ab-ant"/>'+
'<circle cx="43" cy="4" r="2.6" class="ab-antdot"/>'+
'<circle cx="37" cy="24" r="2.5" class="aito-eye"/>'+
'<circle cx="50" cy="24" r="2.5" class="aito-eye"/>'+
'<path d="M39.5 31 q4 3.4 8 0" class="aito-mouth"/>'+
'<rect x="32" y="41" width="6" height="4" rx="2" class="ab-foot"/>'+
'<rect x="47" y="41" width="6" height="4" rx="2" class="ab-foot"/>'+
"</g>"+
"</svg>";
return wrap;
},
addMessage:function(text,type){
var el=document.createElement("div");
el.className="chatbot__message chatbot__message--"+type;
el.textContent=text;
this.mountRow(el,type);
return el;
},
typeMessage:function(text){
var self=this;
var el=document.createElement("div");
el.className="chatbot__message chatbot__message--bot";
var finish=function(){
el.removeAttribute("aria-hidden");
if(self.shouldShowCta(text)){
window.setTimeout(function(){self.addContactCta();},280);
}
};
if(this.prefersReducedMotion()){
el.textContent=text;
this.mountRow(el,"bot");
finish();
return;
}
el.setAttribute("aria-hidden","true");
this.mountRow(el,"bot");
var i=0;
var timer=window.setInterval(function(){
if(i<text.length){
el.textContent+=text.charAt(i);
i+=1;
self.scrollToEnd();
}else{
window.clearInterval(timer);
finish();
}
},this.typingSpeed);
},
prefersReducedMotion:function(){
return!!(window.matchMedia
&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
},
shouldShowCta:function(text){
var cues=T.cues;
var hay=EN?text.toLowerCase():text;
var i;
for(i=0;i<cues.length;i+=1){
if(hay.indexOf(cues[i])!==-1){
return true;
}
}
return false;
},
addContactCta:function(){
var path=(window.SHINAI_CONFIG&&window.SHINAI_CONFIG.contactPath)||"contact.html";
var wrap=document.createElement("div");
wrap.className="chatbot__message chatbot__message--bot chatbot__cta";
var link=document.createElement("a");
link.className="btn btn-primary chatbot__cta-btn";
link.href=path;
link.textContent=T.cta;
wrap.appendChild(link);
this.mountRow(wrap,"bot");
},
showTyping:function(){
this.isTyping=true;
var el=document.createElement("div");
el.className="chatbot__message chatbot__message--bot chatbot__typing";
el.setAttribute("aria-label",T.typing);
var k;
for(k=0;k<3;k+=1){
var dot=document.createElement("span");
dot.className="chatbot__dot";
el.appendChild(dot);
}
this.mountRow(el,"bot").id="chatbot-typing";
},
hideTyping:function(){
this.isTyping=false;
var el=document.getElementById("chatbot-typing");
if(el){
el.parentNode.removeChild(el);
}
},
growInput:function(){
this.input.style.height="auto";
this.input.style.height=this.input.scrollHeight+"px";
},
resetInput:function(){
this.input.value="";
this.input.style.height="";
},
scrollToEnd:function(){
this.messages.scrollTop=this.messages.scrollHeight;
}
};
document.addEventListener("DOMContentLoaded",function(){
Chatbot.init();
});
})();