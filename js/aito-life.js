(function(root){
"use strict";
var STATES={idle:1,attentive:1,thinking:1,speaking:1,joy:1};
var HOLD={thinking:{attentive:1},speaking:{attentive:1}};
function reduce(state,want){
if(typeof want!=="string"||!STATES[want])return state;
if(HOLD[state]&&HOLD[state][want])return state;
return want;
}
function quantize(v){
if(typeof v!=="number"||v!==v)return 0;
var q=Math.round(v*20)/20;
return q>1?1:q<-1?-1:q;
}
function gazeFrom(px,py,rect){
if(!rect||typeof px!=="number"||typeof py!=="number"||px!==px||py!==py)return{x:0,y:0};
var cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
var reach=Math.max(1,rect.width)*2.5;
var x=(px-cx)/reach,y=(py-cy)/reach;
return{x:quantize(x),y:quantize(y)};
}
function presenceFrom(prev,y,atEnd,current){
if(atEnd)return"here";
var d=y-prev;
if(d>=8)return"peek";
if(d<=-8)return"here";
return current;
}
function mount(doc,win){
var el=doc.querySelector("[data-aito-state]");
if(!el)return null;
var reduced=!!(win.matchMedia&&win.matchMedia("(prefers-reduced-motion: reduce)").matches);
var state=el.getAttribute("data-aito-state")||"idle";
var before=state;
var gx=0,gy=0;
function apply(next){
if(next===state)return;
state=next;
el.setAttribute("data-aito-state",next);
}
function want(kind){apply(reduce(state,kind));}
function look(x,y){
if(x===gx&&y===gy)return;
gx=x;gy=y;
el.style.setProperty("--aito-gx",String(x));
el.style.setProperty("--aito-gy",String(y));
}
doc.addEventListener("aito",function(e){want(e.detail&&e.detail.kind);});
var home=el.closest("[data-aito-presence]");
function place(p){if(home&&home.getAttribute("data-aito-presence")!==p)home.setAttribute("data-aito-presence",p);}
if(home){
home.addEventListener("pointerenter",function(){place("here");});
home.addEventListener("pointermove",function(){place("here");},{passive:true});
home.addEventListener("focusin",function(){place("here");});
doc.addEventListener("aito",function(e){if(e.detail&&e.detail.kind!=="idle")place("here");});
}
el.addEventListener("animationend",function(e){
if(e.animationName==="aito-joy"&&state==="joy")apply("idle");
if(e.animationName==="aito-glance")el.removeAttribute("data-aito-glance");
});
doc.addEventListener("visibilitychange",function(){
if(doc.hidden){before=state;apply("rest");}
else if(state==="rest")apply(before==="rest"?"idle":before);
});
if(!reduced){
{
doc.addEventListener("pointermove",function(e){
if(state==="rest"||(e.pointerType!=="mouse"&&e.pointerType!=="pen"))return;
var g=gazeFrom(e.clientX,e.clientY,el.getBoundingClientRect());
look(g.x,g.y);
},{passive:true});
doc.addEventListener("pointerleave",function(){look(0,0);});
}
var lastY=win.scrollY||0,lastPlace=lastY;
win.addEventListener("scroll",function(){
if(state==="rest")return;
var y=win.scrollY||0,dir=y>lastY?"down":y<lastY?"up":null;
lastY=y;
if(home&&!(doc.body.classList&&doc.body.classList.contains("chat-open"))){
var atEnd=win.innerHeight+y>=(doc.documentElement.scrollHeight||0)-24;
var next=presenceFrom(lastPlace,y,atEnd,home.getAttribute("data-aito-presence"));
if(Math.abs(y-lastPlace)>=8||atEnd)lastPlace=y;
place(next);
}
if(!dir||el.getAttribute("data-aito-glance")===dir)return;
el.removeAttribute("data-aito-glance");
void el.offsetWidth;
el.setAttribute("data-aito-glance",dir);
},{passive:true});
}
return{state:function(){return state;},set:want,look:look,gaze:function(){return{x:gx,y:gy};},presence:function(){return home?home.getAttribute("data-aito-presence"):null;}};
}
var api={core:{reduce:reduce,gazeFrom:gazeFrom,quantize:quantize,presenceFrom:presenceFrom},mount:mount,live:null};
root.AitoLife=api;
if(typeof document!=="undefined"&&typeof window!=="undefined"){
var start=function(){api.live=mount(document,window);};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
}
})(typeof window!=="undefined"?window:this);