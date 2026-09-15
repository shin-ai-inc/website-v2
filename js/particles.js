(function(){
"use strict";
if(typeof window.THREE==="undefined"){
return;
}
var container=document.getElementById("three-container");
if(!container){
return;
}
var THREE=window.THREE;
var isMobile=window.innerWidth<768;
var stableH=isMobile
?Math.round(Math.max(window.innerHeight,(window.screen&&window.screen.height)||0))
:0;
var sizeOf=function(){
var rect=container.getBoundingClientRect();
var w=Math.max(1,Math.round(rect.width));
var h=isMobile?stableH:Math.round(rect.height);
return{w:w,h:Math.max(1,h)};
};
var scene=new THREE.Scene();
var dim=sizeOf();
var camera=new THREE.PerspectiveCamera(60,dim.w/dim.h,0.1,1000);
camera.position.z=isMobile?72:58;
var renderer;
try{
renderer=new THREE.WebGLRenderer({
alpha:true,
antialias:!isMobile,
powerPreference:isMobile?"default":"high-performance"
});
}catch(e){
return;
}
renderer.setSize(dim.w,dim.h);
var pixelRatioFor=function(){
var dpr=window.devicePixelRatio||1;
return isMobile?Math.min(dpr,1.5):Math.min(Math.max(dpr,2),2);
};
renderer.setPixelRatio(pixelRatioFor());
renderer.domElement.setAttribute("aria-hidden","true");
container.appendChild(renderer.domElement);
var core=new THREE.Mesh(
new THREE.IcosahedronGeometry(isMobile?8.2:9.0,2),
new THREE.MeshBasicMaterial({color:0x3a5feb,transparent:true,opacity:isMobile?0.18:0.17,wireframe:true})
);
scene.add(core);
var innerCore=new THREE.Mesh(
new THREE.IcosahedronGeometry(isMobile?4.1:4.5,2),
new THREE.MeshBasicMaterial({color:0x00c9a7,transparent:true,opacity:isMobile?0.25:0.22,wireframe:true})
);
scene.add(innerCore);
var lowSpec=typeof navigator.hardwareConcurrency==="number"?navigator.hardwareConcurrency<=2:false;
var particlesCount=isMobile?1100:lowSpec?900:2000;
var particles=[];
var geometries=[
new THREE.BoxGeometry(0.15,0.15,0.15),
new THREE.SphereGeometry(0.08,6,6),
new THREE.TetrahedronGeometry(0.12,0)
];
var colors=[0x4a8fff,0x3a5feb,0x00c9a7,0x20e7c4,0xffffff,0xb4f2ff,0xc08c54];
var i;
for(i=0;i<particlesCount;i+=1){
var geometry=geometries[Math.floor(Math.random()*geometries.length)];
var isCopper=Math.random()<0.06;
var colorHex=isCopper?0xc08c54:colors[Math.floor(Math.random()*(colors.length-1))];
var material=new THREE.MeshBasicMaterial({
color:colorHex,
transparent:true,
opacity:0.25+Math.random()*0.4
});
var particle=new THREE.Mesh(geometry,material);
var radius=12+Math.random()*35;
var theta=Math.random()*Math.PI*2;
var phi=Math.random()*Math.PI;
particle.position.x=radius*Math.sin(phi)*Math.cos(theta);
particle.position.y=radius*Math.sin(phi)*Math.sin(theta);
particle.position.z=radius*Math.cos(phi);
particle.rotation.x=Math.random()*Math.PI*2;
particle.rotation.y=Math.random()*Math.PI*2;
particle.rotation.z=Math.random()*Math.PI*2;
particles.push({
mesh:particle,
velocity:{
x:(Math.random()-0.5)*0.015,
y:(Math.random()-0.5)*0.015,
z:(Math.random()-0.5)*0.015
},
rotation:{
x:(Math.random()-0.5)*0.008,
y:(Math.random()-0.5)*0.008,
z:(Math.random()-0.5)*0.008
},
orbit:{
speed:(0.0001+Math.random()*0.0003)*(isMobile?1.4:1.0),
radius:radius,
angle:Math.random()*Math.PI*2,
yFactor:Math.random()*2-1
},
pulse:{speed:0.008+Math.random()*0.015,size:0.04+Math.random()*0.08}
});
scene.add(particle);
}
var connectionLines=[];
var lineCount=isMobile?36:88;
for(i=0;i<lineCount;i+=1){
var lineGeo=new THREE.BufferGeometry();
lineGeo.setAttribute("position",new THREE.BufferAttribute(new Float32Array(6),3));
var line=new THREE.Line(lineGeo,new THREE.LineBasicMaterial({color:0x4a8fff,transparent:true,opacity:0.04}));
scene.add(line);
connectionLines.push(line);
}
var mouseX=0;
var mouseY=0;
var targetX=0;
var targetY=0;
var onPointer=function(cx,cy){
mouseX=(cx/window.innerWidth)*2-1;
mouseY=-(cy/window.innerHeight)*2+1;
};
var onMouseMove=function(e){onPointer(e.clientX,e.clientY);};
var onTouchMove=function(e){if(e.touches.length>0){onPointer(e.touches[0].clientX,e.touches[0].clientY);}};
var heroLookAt=new THREE.Vector3(0,isMobile?-4.5:-5.0,0);
var time=0;
var initialMotionTime=0;
var initialMotionDuration=isMobile?2.0:2.5;
var initialBurstY=isMobile?0.48:0.8;
var initialBurstX=isMobile?0.18:0.3;
var isInitialMotion=true;
var rafId=null;
var running=false;
var animate=function(){
rafId=window.requestAnimationFrame(animate);
time+=0.008;
if(isInitialMotion){
initialMotionTime+=0.016;
if(initialMotionTime>=initialMotionDuration){
isInitialMotion=false;
}
}
targetX=mouseX*12;
targetY=mouseY*12;
camera.position.x+=(targetX-camera.position.x)*0.015;
camera.position.y+=(targetY-camera.position.y)*0.015;
camera.lookAt(heroLookAt);
core.rotation.y+=isMobile?0.0015:0.001;
core.rotation.x+=isMobile?0.0008:0.0005;
var scalePulse=Math.sin(time*0.4)*0.04+1;
core.scale.set(scalePulse,scalePulse,scalePulse);
innerCore.rotation.y-=isMobile?0.0022:0.0015;
innerCore.rotation.z+=isMobile?0.0012:0.0008;
var innerScalePulse=Math.sin(time*0.6)*0.08+1;
innerCore.scale.set(innerScalePulse,innerScalePulse,innerScalePulse);
var skipRate=isMobile?2:1;
var idx;
for(idx=0;idx<particles.length;idx+=1){
if(isMobile&&idx%skipRate!==0){
continue;
}
var p=particles[idx];
if(isInitialMotion){
var progress=initialMotionTime/initialMotionDuration;
var easeOut=1-Math.pow(1-progress,3);
p.mesh.position.y+=initialBurstY*(1-easeOut);
p.mesh.position.x+=(Math.sin(time*2+idx*0.2)*initialBurstX)*(1-easeOut);
}
p.orbit.angle+=p.orbit.speed;
var orbitX=p.orbit.radius*Math.cos(p.orbit.angle);
var orbitZ=p.orbit.radius*Math.sin(p.orbit.angle);
var orbitY=p.orbit.radius*0.4*p.orbit.yFactor*Math.sin(p.orbit.angle*0.5);
var waveX=Math.sin(time+idx*0.08)*1.2;
var waveY=Math.cos(time*0.6+idx*0.15)*1;
var waveZ=Math.sin(time*0.4+idx*0.12)*1.5;
var blend;
if(isInitialMotion){
blend=Math.sin((initialMotionTime/initialMotionDuration)*Math.PI/2);
}else{
blend=1;
}
p.mesh.position.x=p.mesh.position.x*(1-blend)+(orbitX+p.velocity.x*waveX)*blend;
p.mesh.position.y=p.mesh.position.y*(1-blend)+(orbitY+p.velocity.y*waveY)*blend;
p.mesh.position.z=p.mesh.position.z*(1-blend)+(orbitZ+p.velocity.z*waveZ)*blend;
var sizePulse=Math.sin(time*p.pulse.speed+idx)*p.pulse.size+1;
p.mesh.scale.set(sizePulse,sizePulse,sizePulse);
p.mesh.rotation.x+=p.rotation.x;
p.mesh.rotation.y+=p.rotation.y;
p.mesh.rotation.z+=p.rotation.z;
if(p.mesh.position.x>60){p.mesh.position.x=-60;}
if(p.mesh.position.x<-60){p.mesh.position.x=60;}
if(p.mesh.position.y>45){p.mesh.position.y=-45;}
if(p.mesh.position.y<-45){p.mesh.position.y=45;}
if(p.mesh.position.z>60){p.mesh.position.z=-60;}
if(p.mesh.position.z<-60){p.mesh.position.z=60;}
}
var updateLineInterval=isMobile?5:3;
var li;
for(li=0;li<connectionLines.length;li+=1){
if(li%updateLineInterval!==Math.floor(time*5)%updateLineInterval){
continue;
}
var ln=connectionLines[li];
var positions=ln.geometry.attributes.position.array;
var a=particles[Math.floor(Math.random()*particles.length)];
var b=particles[(particles.indexOf(a)+1+Math.floor(Math.random()*20))%particles.length];
if(a&&b){
var distance=a.mesh.position.distanceTo(b.mesh.position);
if(distance<20){
positions[0]=a.mesh.position.x;
positions[1]=a.mesh.position.y;
positions[2]=a.mesh.position.z;
positions[3]=b.mesh.position.x;
positions[4]=b.mesh.position.y;
positions[5]=b.mesh.position.z;
ln.geometry.attributes.position.needsUpdate=true;
ln.material.opacity=0.05*(1-distance/20)*(0.7+0.3*Math.sin(time*2+li));
}else{
ln.material.opacity=0;
}
}
}
renderer.render(scene,camera);
};
var start=function(){
if(running){
return;
}
running=true;
rafId=window.requestAnimationFrame(animate);
};
var stop=function(){
running=false;
if(rafId!==null){
window.cancelAnimationFrame(rafId);
rafId=null;
}
};
var renderStill=function(){
renderer.render(scene,camera);
};
var lastW=dim.w;
var resizeTimer=null;
var onResize=function(){
if(resizeTimer!==null){
window.clearTimeout(resizeTimer);
}
resizeTimer=window.setTimeout(function(){
var w=Math.max(1,Math.round(container.getBoundingClientRect().width));
if(isMobile&&w===lastW){
return;
}
lastW=w;
if(isMobile){
stableH=Math.round(Math.max(window.innerHeight,(window.screen&&window.screen.height)||0));
}
var d=sizeOf();
camera.aspect=d.w/d.h;
camera.updateProjectionMatrix();
renderer.setSize(d.w,d.h);
renderer.setPixelRatio(pixelRatioFor());
if(!running){
renderStill();
}
},200);
};
window.addEventListener("resize",onResize,{passive:true});
document.addEventListener("mousemove",onMouseMove,{passive:true});
if(!isMobile){
document.addEventListener("touchmove",onTouchMove,{passive:true});
}
start();
document.addEventListener("visibilitychange",function(){
if(document.hidden){
stop();
}else{
start();
}
});
})();