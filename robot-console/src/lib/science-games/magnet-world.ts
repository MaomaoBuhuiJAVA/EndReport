/**
 * Magnetic attraction adapts the force loop from liabru/matter-attractors' MIT
 * basic example. Matter.js provides the rigid bodies, constraints and collisions.
 * Source and full license notices: docs/science-games/OPEN_SOURCE.md.
 */
import Matter from "matter-js";

export const MAGNET_WIDTH = 420;
export const MAGNET_HEIGHT = 520;
export const MAGNET_TARGET = 5;
type Point = { x: number; y: number };
type Kind = "nail" | "clip" | "nut" | "washer" | "bolt" | "wood" | "brick" | "can";
type Part = { id: string; kind: Kind; name: string; body: Matter.Body; magnetic: boolean; collected: boolean; releasedUntil: number; tether: Matter.Constraint | null };
export type MagnetState = { collected: number; attached: number; message: string; dragging: boolean };

export function magneticForce(source: Point, target: Point, mass: number) {
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= 135 || distance < 1) return { x: 0, y: 0 };
  const force = mass * 0.004 * Math.pow(1 - distance / 135, 1.15);
  return { x: dx / distance * force, y: dy / distance * force };
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 8) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}
function ironFill(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(-18, -20, 20, 24);
  gradient.addColorStop(0, "#d9e7ec"); gradient.addColorStop(0.45, "#a9c4d1"); gradient.addColorStop(1, "#6f98b1");
  ctx.fillStyle = gradient; ctx.strokeStyle = "#395b71"; ctx.lineWidth = 2;
}
function drawPart(ctx: CanvasRenderingContext2D, part: Part, mini = false) {
  ctx.save(); ctx.translate(part.body.position.x, part.body.position.y); ctx.rotate(part.body.angle);
  if (!mini) { ctx.shadowColor = "#182e4322"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 4; }
  ironFill(ctx);
  if (part.kind === "nail") {
    rounded(ctx, -4, -21, 8, 40, 2); ctx.fill(); ctx.stroke(); rounded(ctx, -13, -24, 26, 7, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 18); ctx.lineTo(0, 27); ctx.lineTo(4, 18); ctx.fill(); ctx.stroke();
  } else if (part.kind === "clip") {
    ctx.shadowBlur = 0; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#395b71"; ctx.lineWidth = 6;
    const path = new Path2D("M-15 6L8-16C19-26 31-12 20-2L-3 20C-20 36-36 16-21 2L3-21"); ctx.stroke(path);
    ctx.strokeStyle = "#c1d7df"; ctx.lineWidth = 3; ctx.stroke(path);
  } else if (part.kind === "nut") {
    ctx.beginPath(); for (let i=0;i<6;i++) { const a=i*Math.PI/3; const x=Math.cos(a)*20; const y=Math.sin(a)*20; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fillStyle="#efe8d9"; ctx.fill(); ctx.stroke();
  } else if (part.kind === "washer") {
    ctx.beginPath(); ctx.arc(0,0,19,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0; ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fillStyle="#efe8d9"; ctx.fill(); ctx.stroke();
  } else if (part.kind === "bolt") {
    rounded(ctx,-6,-11,12,34,2); ctx.fill(); ctx.stroke(); rounded(ctx,-14,-21,28,13,4); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
    ctx.strokeStyle="#608599"; ctx.lineWidth=2; for(let y=-3;y<22;y+=6){ctx.beginPath();ctx.moveTo(-6,y);ctx.lineTo(6,y-3);ctx.stroke();}
  } else if (part.kind === "wood") {
    ctx.fillStyle="#d9ae70"; ctx.strokeStyle="#9b7243"; rounded(ctx,-27,-23,54,46,5); ctx.fill(); ctx.stroke(); ctx.shadowBlur=0;
    ctx.strokeStyle="#bd8e54"; ctx.lineWidth=2; ctx.beginPath();ctx.moveTo(-21,-12);ctx.bezierCurveTo(4,-23,-11,6,20,-4);ctx.moveTo(-21,4);ctx.bezierCurveTo(-6,-5,2,21,22,9);ctx.moveTo(-20,17);ctx.lineTo(-1,14);ctx.stroke();
  } else if (part.kind === "brick") {
    ctx.fillStyle="#efc64b";ctx.strokeStyle="#b99531";rounded(ctx,-25,-17,50,34,5);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    for(const x of [-12,12]) {ctx.beginPath();ctx.ellipse(x,-17,8,5,0,0,Math.PI*2);ctx.fillStyle="#f8d969";ctx.fill();ctx.stroke();}
  } else {
    ctx.fillStyle="#d3d9d4";ctx.strokeStyle="#8b9996";rounded(ctx,-16,-25,32,50,7);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
    ctx.beginPath();ctx.ellipse(0,-23,14,4,0,0,Math.PI*2);ctx.fillStyle="#e5eae3";ctx.fill();ctx.stroke();ctx.fillStyle="#7ca39c";ctx.fillRect(-14,-9,28,20);ctx.strokeStyle="#a6b2ac";ctx.beginPath();ctx.moveTo(-8,-17);ctx.lineTo(-8,-10);ctx.stroke();
  }
  ctx.restore();
}

export function createMagnetWorld(canvas: HTMLCanvasElement, onState: (state: MagnetState) => void) {
  const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;
  const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 }, positionIterations: 8, constraintIterations: 5 });
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("这个浏览器暂时无法打开实验台");
  const magnet = Bodies.circle(285, 200, 29, { isStatic: true, collisionFilter: { mask: 0 }, label: "magnet" });
  Composite.add(engine.world, [magnet, Bodies.rectangle(210, 506, 460, 30, { isStatic: true, friction: 0.65 }), Bodies.rectangle(-15, 260, 30, 600, { isStatic: true }), Bodies.rectangle(435, 260, 30, 600, { isStatic: true })]);
  const definitions: {kind: Kind;name:string;magnetic:boolean;x:number;y:number}[] = [
    {kind:"nail",name:"铁钉",magnetic:true,x:74,y:374}, {kind:"clip",name:"铁质回形针",magnetic:true,x:165,y:414}, {kind:"nut",name:"铁螺母",magnetic:true,x:315,y:380}, {kind:"washer",name:"铁垫圈",magnetic:true,x:245,y:451}, {kind:"bolt",name:"铁螺栓",magnetic:true,x:356,y:445},
    {kind:"wood",name:"木块",magnetic:false,x:121,y:454}, {kind:"brick",name:"塑料积木",magnetic:false,x:278,y:431}, {kind:"can",name:"铝罐",magnetic:false,x:38,y:449},
  ];
  const parts: Part[] = definitions.map((item,index) => {
    const options = { friction:0.55, frictionAir:0.025, restitution:0.12, density:0.002, angle:(index%3-1)*0.25, label:item.name };
    const body = item.kind === "nut" ? Bodies.polygon(item.x,item.y,6,20,options) : item.kind === "washer" ? Bodies.circle(item.x,item.y,19,options) : Bodies.rectangle(item.x,item.y,item.kind === "wood"?54:item.kind==="brick"?50:item.kind==="can"?32:24,item.kind==="wood"?46:item.kind==="brick"?34:item.kind==="can"?50:43,{...options,chamfer:{radius:4}});
    Composite.add(engine.world,body);
    return { id:`part-${index}`,kind:item.kind,name:item.name,magnetic:item.magnetic,body,collected:false,releasedUntil:0,tether:null };
  });
  let dragging = false;
  let pointerId: number | null = null;
  let offset = {x:0,y:0};
  let frame = 0;
  let last = 0;
  let accumulator = 0;
  let elapsed = 0;
  let message = "先靠近桌面铁件，吸住后再往上拖。";
  let lastState = "";
  let hoveredNonmagnetic = "";
  let ended = false;
  let attachedFlashUntil = 0;
  let trayFlashUntil = 0;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = motion.matches;
  const updateMotion = () => { reduced = motion.matches; };
  motion.addEventListener("change", updateMotion);

  function emit() {
    if(ended)return;
    const state = { collected:parts.filter(p=>p.collected).length, attached:parts.filter(p=>p.tether).length, dragging, message };
    const signature=JSON.stringify(state);
    if(signature!==lastState){lastState=signature;onState(state);}
    canvas.dataset.collected=String(state.collected);
    canvas.dataset.attached=String(state.attached);
  }
  function point(event: PointerEvent) { const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)/rect.width*MAGNET_WIDTH,y:(event.clientY-rect.top)/rect.height*MAGNET_HEIGHT}; }
  function moveTo(x:number,y:number) { if(ended||!Number.isFinite(x)||!Number.isFinite(y))return;Body.setPosition(magnet,{x:Math.max(37,Math.min(383,x)),y:Math.max(43,Math.min(440,y))}); }
  function endPointerDrag() {
    const active=pointerId;
    // Release capture only after clearing state; lostpointercapture may fire immediately.
    dragging=false;pointerId=null;
    if(active!==null){try{if(canvas.hasPointerCapture(active))canvas.releasePointerCapture(active);}catch{/* The browser may already have revoked capture. */}}
  }
  function release() {
    if(ended)return;
    endPointerDrag();
    const inTray=magnet.position.x>=24&&magnet.position.x<=215&&magnet.position.y<=126;
    let deposited=0;
    for(const part of parts) if(part.tether) {
      Composite.remove(engine.world,part.tether);part.tether=null;
      if(inTray){part.collected=true;Composite.remove(engine.world,part.body);deposited++;}
      else part.releasedUntil=elapsed+1600;
    }
    if(deposited){trayFlashUntil=elapsed+650;message=`送回了 ${deposited} 个铁制零件。继续找找其他朋友。`;}
    else message="松开了，试试靠近别的小零件。";
    if(parts.filter(p=>p.collected).length===MAGNET_TARGET)message="五个铁制零件都回到收集盘了！";
    emit();
  }
  function down(event:PointerEvent) {
    if(ended||pointerId!==null||(event.pointerType==="mouse"&&event.button!==0))return;
    const p=point(event);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.hypot(p.x-magnet.position.x,p.y-magnet.position.y)>72)return;
    event.preventDefault();canvas.focus({preventScroll:true});pointerId=event.pointerId;offset={x:p.x-magnet.position.x,y:p.y-magnet.position.y};dragging=true;
    try{canvas.setPointerCapture(event.pointerId);}catch{/* Window pointer events still end this drag when capture is unavailable. */}
    message="靠近铁制零件，吸住后送到左上方的盘子。";emit();
  }
  function move(event:PointerEvent) { if(ended||event.pointerId!==pointerId)return;if(event.pointerType==="mouse"&&event.buttons===0){cancel(event);return;}event.preventDefault();const p=point(event);moveTo(p.x-offset.x,p.y-offset.y); }
  function up(event:PointerEvent) {
    if(ended||event.pointerId!==pointerId)return;
    endPointerDrag();
    if(magnet.position.x<=215&&magnet.position.y<=126)release();
    else {if(parts.some(p=>p.tether))message="吸住啦！把磁铁拖到左上方盘子，再松手。";emit();}
  }
  function cancel(event:PointerEvent) { if(ended||event.pointerId!==pointerId)return;endPointerDrag();message=parts.some(p=>p.tether)?"铁件还吸在磁铁上，继续拖到左上盘子后松手。":"磁铁已停下，可以继续拖动。";emit(); }
  function blur() { const active=dragging;endPointerDrag();if(active){message=parts.some(p=>p.tether)?"铁件还吸在磁铁上，继续拖到左上盘子后松手。":"磁铁已停下，可以继续拖动。";emit();} }
  function visibility() { last=0;accumulator=0;if(document.hidden)blur(); }
  function key(event:KeyboardEvent) {
    if(ended)return;
    const directions:Record<string,Point>={ArrowLeft:{x:-14,y:0},ArrowRight:{x:14,y:0},ArrowUp:{x:0,y:-14},ArrowDown:{x:0,y:14}};
    if(directions[event.key]){event.preventDefault();endPointerDrag();const delta=directions[event.key];moveTo(magnet.position.x+delta.x,magnet.position.y+delta.y);message="方向键移动磁铁，空格键放下零件。";emit();}
    else if(event.key===" "||event.key==="Enter"){event.preventDefault();release();}
  }
  canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",cancel);canvas.addEventListener("lostpointercapture",cancel);canvas.addEventListener("keydown",key);
  canvas.addEventListener("blur",blur);
  window.addEventListener("pointerup",up);window.addEventListener("pointercancel",cancel);
  window.addEventListener("blur",blur);
  window.addEventListener("pagehide",blur);
  document.addEventListener("visibilitychange",visibility);

  function attract() {
    const tip={x:magnet.position.x,y:magnet.position.y+25};
    for(const part of parts) {
      if(part.collected)continue;
      if(!part.magnetic){if(dragging&&!parts.some(p=>p.tether)&&Math.hypot(tip.x-part.body.position.x,tip.y-part.body.position.y)<55&&hoveredNonmagnetic!==part.id){hoveredNonmagnetic=part.id;message=`${part.name}没有被吸起来。换个零件试试。`;emit();}continue;}
      if(part.tether||elapsed<part.releasedUntil)continue;
      Body.applyForce(part.body,part.body.position,magneticForce(tip,part.body.position,part.body.mass));
      if(Math.hypot(tip.x-part.body.position.x,tip.y-part.body.position.y)<42){
        const attached=parts.filter(p=>p.tether).length;
        part.tether=Constraint.create({bodyA:magnet,bodyB:part.body,pointA:{x:attached%2?-15:15,y:25},length:14+attached*5,stiffness:0.35,damping:0.18});
        Composite.add(engine.world,part.tether);attachedFlashUntil=elapsed+480;message="吸住啦！送到左上方盘子，再松手。";emit();
      }
    }
    for(const part of parts)if(!part.collected&&part.body.speed>14)Body.setVelocity(part.body,{x:part.body.velocity.x*0.85,y:part.body.velocity.y*0.85});
  }
  Events.on(engine,"beforeUpdate",attract);
  function resize(){if(ended)return;const rect=canvas.getBoundingClientRect();const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.max(1,Math.round(rect.height*ratio));}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();

  function draw() {
    if(!ctx)return;
    ctx.setTransform(canvas.width/MAGNET_WIDTH,0,0,canvas.height/MAGNET_HEIGHT,0,0);
    ctx.clearRect(0,0,420,520);
    const background=ctx.createLinearGradient(0,0,0,520);background.addColorStop(0,"#f0f5ef");background.addColorStop(.58,"#e4efea");background.addColorStop(1,"#d8e7e1");ctx.fillStyle=background;ctx.fillRect(0,0,420,520);
    const light=ctx.createRadialGradient(210,300,24,210,300,255);light.addColorStop(0,"rgba(255,255,255,.34)");light.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=light;ctx.fillRect(0,130,420,350);
    ctx.save();rounded(ctx,12,132,396,347,20);ctx.strokeStyle="rgba(93,139,130,.22)";ctx.lineWidth=1;ctx.stroke();ctx.restore();
    const m=magnet.position;
    const fieldAlpha=dragging||parts.some(p=>p.tether)?0.28:0.14;
    ctx.save();ctx.strokeStyle=`rgba(196,94,68,${fieldAlpha})`;ctx.lineWidth=1.25;
    for(const radius of [44,67,91]){
      ctx.beginPath();ctx.moveTo(m.x-22,m.y+17);ctx.bezierCurveTo(m.x-radius,m.y+6,m.x-radius,m.y-radius*.72,m.x,m.y-radius);ctx.bezierCurveTo(m.x+radius,m.y-radius*.72,m.x+radius,m.y+6,m.x+22,m.y+17);ctx.stroke();
    }
    ctx.restore();
    // The collecting tray is part of the game board, not a menu or overlay.
    const readyToDeposit=parts.some(p=>p.tether)&&magnet.position.x<=215&&magnet.position.y<=126;
    const trayHighlighted=readyToDeposit||elapsed<trayFlashUntil;
    ctx.save();ctx.shadowColor="#23475318";ctx.shadowBlur=8;ctx.shadowOffsetY=4;rounded(ctx,22,23,194,94,13);ctx.fillStyle=trayHighlighted?"#e7b487":"#bd9870";ctx.fill();ctx.shadowBlur=0;ctx.lineWidth=1.5;ctx.strokeStyle=trayHighlighted?"#d96b4e":"#92704f";ctx.stroke();
    rounded(ctx,27,28,184,84,9);const trayFill=ctx.createLinearGradient(0,28,0,112);trayFill.addColorStop(0,"#fffaf0");trayFill.addColorStop(1,"#f2ead8");ctx.fillStyle=trayFill;ctx.fill();ctx.strokeStyle="#e4d5bc";ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle="#36515a";ctx.font='600 12px "Microsoft YaHei", sans-serif';ctx.fillText(readyToDeposit?"松手，放进盘子":"零件收集盘",37,47);
    const collected=parts.filter(p=>p.collected);for(let i=0;i<5;i++){const x=44+i*34;ctx.beginPath();ctx.arc(x,82,12.5,0,Math.PI*2);ctx.fillStyle="#e3e8df";ctx.fill();ctx.strokeStyle="#c6d0c7";ctx.lineWidth=1.5;ctx.stroke();if(collected[i]){const p=collected[i];const pos=p.body.position;const angle=p.body.angle;p.body.position={x,y:82};p.body.angle=0;ctx.save();ctx.translate(x,82);ctx.scale(.45,.45);ctx.translate(-x,-82);drawPart(ctx,p,true);ctx.restore();p.body.position=pos;p.body.angle=angle;}}
    ctx.restore();
    const bench=ctx.createLinearGradient(0,493,0,520);bench.addColorStop(0,"#bf9870");bench.addColorStop(.18,"#a9815e");bench.addColorStop(1,"#956f51");ctx.fillStyle=bench;ctx.fillRect(0,493,420,27);
    ctx.strokeStyle="#8e6d50";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,493);ctx.lineTo(420,493);ctx.stroke();
    ctx.save();ctx.beginPath();ctx.rect(0,495,420,25);ctx.clip();
    for(let i=0;i<4;i++){const y=499+i*6;ctx.beginPath();ctx.moveTo(-10,y);ctx.bezierCurveTo(88,y-4,153,y+4,251,y);ctx.bezierCurveTo(312,y-3,364,y+3,430,y-1);ctx.strokeStyle=i%2?"rgba(255,232,203,.14)":"rgba(91,57,35,.16)";ctx.lineWidth=1.2;ctx.stroke();}
    ctx.restore();
    for(const part of parts)if(!part.collected)drawPart(ctx,part);
    if(dragging||parts.some(p=>p.tether)){
      ctx.save();ctx.strokeStyle="#c8875d44";ctx.lineWidth=1.5;ctx.setLineDash([5,7]);for(const radius of [69,99]){ctx.beginPath();ctx.arc(m.x,m.y+15,radius+(reduced?0:Math.sin(elapsed*0.002)*3),0,Math.PI*2);ctx.stroke();}ctx.restore();
    }
    if(elapsed<attachedFlashUntil){
      const progress=1-(attachedFlashUntil-elapsed)/480;
      ctx.save();ctx.strokeStyle=`rgba(233,101,69,${reduced ? .65 : (1-progress)*.7})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(m.x,m.y+36,reduced?42:36+progress*15,24,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    ctx.save();ctx.translate(m.x,m.y);ctx.shadowColor="#783e282e";ctx.shadowBlur=14;ctx.shadowOffsetY=7;
    ctx.beginPath();ctx.moveTo(-24,25);ctx.lineTo(-24,-9);ctx.bezierCurveTo(-24,-43,24,-43,24,-9);ctx.lineTo(24,25);ctx.strokeStyle="#d64f32";ctx.lineWidth=19;ctx.lineCap="butt";ctx.stroke();ctx.shadowBlur=0;
    ctx.beginPath();ctx.moveTo(-24,12);ctx.lineTo(-24,30);ctx.moveTo(24,12);ctx.lineTo(24,30);ctx.strokeStyle="#e7e7d9";ctx.lineWidth=19;ctx.stroke();
    ctx.beginPath();ctx.moveTo(-27,-16);ctx.bezierCurveTo(-22,-36,17,-37,23,-18);ctx.strokeStyle="#f68c6e";ctx.lineWidth=4;ctx.lineCap="round";ctx.stroke();
    ctx.beginPath();ctx.arc(0,-13,4,0,Math.PI*2);ctx.fillStyle="#f9c091";ctx.fill();ctx.restore();
  }
  function loop(time:number){if(ended)return;if(document.hidden){last=0;accumulator=0;}else{const delta=last?Math.min(time-last,45):16.67;last=time;elapsed+=delta;accumulator+=delta;while(accumulator>=1000/60){Engine.update(engine,1000/60);accumulator-=1000/60;}draw();}frame=requestAnimationFrame(loop);}
  frame=requestAnimationFrame(loop);emit();
  return {
    release,
    destroy(){
      if(ended)return;
      ended=true;cancelAnimationFrame(frame);observer.disconnect();motion.removeEventListener("change",updateMotion);
      canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",cancel);canvas.removeEventListener("lostpointercapture",cancel);canvas.removeEventListener("keydown",key);canvas.removeEventListener("blur",blur);
      window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",cancel);window.removeEventListener("blur",blur);window.removeEventListener("pagehide",blur);document.removeEventListener("visibilitychange",visibility);
      endPointerDrag();Events.off(engine,"beforeUpdate",attract);Composite.clear(engine.world,false);Engine.clear(engine);
    },
  };
}
