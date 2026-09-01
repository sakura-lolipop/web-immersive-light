/* ============================================================
  light.js — 沉浸光感·全局 Canvas 渲染器(web-immersive-light v2)
  2026-09-01 从 HotifyNEXT-Server /console 15-light.js 终态回灌对齐
  (源仓 2026-08-28 Canvas 化 + 2026-09-01 光域唯一性 CP 后的完整架构,
   含光域双机制/滚动跟手/触屏栈缓存/bench 自证——v1 的 CSS 伪元素版已退役)。

  四通道全画进 #light-canvas 单一绘制循环(治渲染所有权分裂):
   ① 光球:sprite 位图 drawImage 快路径,α=base×gain
   ② 面斑:per-element clip(圆角)+径向,α=base×gain×k
   ③ 边缘带:周长段化(直边+圆角弧)段级 α+段内微渐变(感知主导通道)
   ④ input:环+框内斑;focus 态让位原生 focus ring

  光域唯一性(2026-09-01,第 7 条 hard-won rule):
   - 域过滤(照谁):模态弹卡=井——井内只照井面+后代,页面域排除一切 .modal 后代
   - canvas z 随域切(被谁挡):页面域 z1049,任何更高浮层(面板/toast/未来未知容器)
     天然挡光零登记;弹卡域 z2000=光浮弹卡面上
   - 样板域真相=DOM 查询 .modal.in(单弹层场景);多层叠栈(confirm 叠弹卡取顶序)
     用源仓 modalStack 栈权威版,见 README「Multi-modal stacks」

  接入清单:
    1. <style> 拷 :root 配方族 + #light-canvas 两段
    2. HTML 加 <canvas id="light-canvas"></canvas>
    3. 受光面元素挂进 SEL 注册表(下方一行)
    4. <script src> 引入
    5. 开/关模态时调 window.__lightRepaint()(域切换重画)

  红线(坑史见源仓 webuipath.md W8-W16):批量 rect 读后统一写/rAF 合帧/
  reduced-motion 跳过/指针离场全灭/触屏补 touch 通道+pointerleave 守卫/
  scroll 监听 capture(内滚容器)/读端毒值兜底。
============================================================ */
(function(){
"use strict";
var cv = document.getElementById('light-canvas');
var ctx = cv && cv.getContext ? cv.getContext('2d') : null; // desynchronized:true 勿开(部分安卓 GPU 栈黑屏/花屏)
// 受光面注册表(名单单一真相):接入新页面只改这三行;密集堆叠族(表行/列表行)追加 lit-row 分隔线形态
var SEL = '.card, .modal-content, .nav-link, .list-group-item, td, .input-icon';
var SEL_ROW = '.list-group-item, td';
var INPUTS = 'input, select, textarea';
var SEL_ALL = SEL + ',' + INPUTS; // 受光面全集单一真相(全扫与触屏手指栈同源——两处各拼一份=PC/触屏集合静默分叉)
var px = -1, py = -1, pending = null, pendCand = null, lit = [];

function vars(){
  var cs = getComputedStyle(document.documentElement);
  var gain = parseFloat(cs.getPropertyValue('--light-gain'));
  if (isNaN(gain) || gain < 0) gain = 1; // isNaN 非 !gain:0=「关灯」合法档(!gain 会把 0 静默回 1)
  var rgb = cs.getPropertyValue('--light-rgb').trim();
  if (!/^\d{1,3},\d{1,3},\d{1,3}$/.test(rgb)) rgb = '6, 111, 209'; // 读端毒值兜底(非严格 rgb 串回落;毒值逐帧炸绘制)
  var r = parseFloat(cs.getPropertyValue('--light-r'));
  if (!(r >= 10) || r > 400) r = 80;
  var eb = parseFloat(cs.getPropertyValue('--light-edge-base'));
  if (!(eb >= 0) || eb > 1 || !isFinite(eb)) eb = .20;
  return {
    r: r,
    blob: cs.getPropertyValue('--light-blob').trim() !== '0', // 光晕开关(只关①,②③④照常=不显示但参与交互)
    aBase: parseFloat(cs.getPropertyValue('--light-a-base')) || .13,
    gain: gain,
    edgeA: eb * gain,
    ds: parseFloat(cs.getPropertyValue('--light-dsurface')), // 卡面补偿Δ(isNaN=未设走 0)
    falloff: (parseFloat(cs.getPropertyValue('--light-falloff')) || 65) / 100,
    rgb: rgb
  };
}

// canvas 尺寸/缩放因子:物理像素×渲染档(coarse 触屏减半);高度锁 --vp-h(键盘/地址栏期不缩不清屏,无则 100vh)
var SC = 1;
function sizeCanvas(){
  if (!ctx) return;
  var dpr = window.devicePixelRatio || 1;
  var rs = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? .5 : 1;
  SC = dpr * rs;
  cv.style.width = '100vw'; cv.style.height = 'var(--vp-h, 100vh)';
  cv.width = Math.round(cv.clientWidth * SC);
  cv.height = Math.round(cv.clientHeight * SC);
}
if (ctx) { window.addEventListener('resize', function(){ sizeCanvas(); if (px >= 0) queue(); }); sizeCanvas(); } // resize 补画(重设 width 即清屏)

// 光球 sprite:预渲染 128px 径向位图,drawImage GPU 快路径;键=rgb|α|falloff,调参才重烤
var blobSp = null, blobKey = '';
function blobSprite(v, blobA){
  var key = v.rgb + '|' + blobA.toFixed(3) + '|' + v.falloff;
  if (blobKey !== key) {
    blobKey = key;
    var S = 128;
    blobSp = document.createElement('canvas');
    blobSp.width = S; blobSp.height = S;
    var c2 = blobSp.getContext('2d');
    var g = c2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, rgba(v, blobA));
    g.addColorStop(Math.min(1, v.falloff), rgba(v, 0));
    c2.fillStyle = g; c2.fillRect(0, 0, S, S);
  }
  return blobSp;
}

// 圆角读取(每元素一次缓存)
var radCache = new WeakMap();
function radiusOf(el){
  var v = radCache.get(el);
  if (v === undefined) {
    v = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    if (v > 32) v = 32;
    radCache.set(el, v);
  }
  return v;
}

// ── 绘制原语 ──
function dist(x1, y1, x2, y2){ var dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }
function rgba(v, a){ return 'rgba(' + v.rgb + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
function radial(v, x, y, radius, a0){
  var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(v, a0));
  g.addColorStop(Math.min(1, v.falloff), rgba(v, 0));
  return g;
}
function roundRect(x, y, w, h, rad){
  ctx.beginPath();
  rad = Math.min(rad, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// ── 边缘带周长段绘制(段级 α+段内微渐变+阈值,治阶梯与圆角断)──
var SEG = 4, SEG_MIN_A = .06;
function edgeAlpha(v, x, y, mx, my, k){
  var d = dist(x, y, mx, my);
  var span = v.r * 1.4 * .7;
  return v.edgeA * k * Math.max(0, 1 - d / span);
}
function segLine(x1, y1, x2, y2, v, mx, my, k){
  var a1 = edgeAlpha(v, x1, y1, mx, my, k), a2 = edgeAlpha(v, x2, y2, mx, my, k);
  if (a1 < SEG_MIN_A && a2 < SEG_MIN_A) return;
  if (Math.abs(a1 - a2) < .02) { // 纯色快路径:远离指针的均匀段跳过渐变对象(滚动期主线程+GC 双省)
    ctx.strokeStyle = rgba(v, (a1 + a2) / 2);
  } else {
    var g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, rgba(v, a1));
    g.addColorStop(1, rgba(v, a2));
    ctx.strokeStyle = g;
  }
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.stroke();
}
function drawEdgeBand(v, o, mx, my){ // o={el,b,k,row}
  var b = o.b, k = o.k, row = o.row;
  var rad = radiusOf(o.el);
  var x = b.left + 1, y = row ? b.top - 1 : b.top + 1, w = b.width - 2, h = b.height - 2; // 内缩 1(不缩=相邻卡拼 gutter 亮缝);row 分隔线跨界居中
  if (w <= 0 || h <= 0) return;
  var rr = Math.min(rad, w / 2, h / 2);
  ctx.lineWidth = 2; ctx.lineCap = 'butt';
  function walk(pts){
    for (var i = 0; i + 1 < pts.length; i++) {
      var p1 = pts[i], p2 = pts[i + 1], d = dist(p1[0], p1[1], p2[0], p2[1]);
      if (d <= SEG) { segLine(p1[0], p1[1], p2[0], p2[1], v, mx, my, k); continue; }
      for (var t = 0; t < d; t += SEG) {
        var e = Math.min(SEG, d - t), f1 = t / d, f2 = (t + e) / d;
        segLine(p1[0] + (p2[0] - p1[0]) * f1, p1[1] + (p2[1] - p1[1]) * f1,
                p1[0] + (p2[0] - p1[0]) * f2, p1[1] + (p2[1] - p1[1]) * f2, v, mx, my, k);
      }
    }
  }
  function arcPts(cx, cy, a0, a1){ // 圆角弧采样(2px 弧长)
    var n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * rr / 2)), out = [];
    for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    return out;
  }
  var pts = row ? [[x, y], [x + w, y]] : [[x + rr, y]]; // row=分隔线只画顶边全宽
  if (!row) pts = pts.concat(arcPts(x + w - rr, y + rr, -Math.PI / 2, 0));
  if (!row) pts = pts.concat([[x + w, y + h - rr]]).concat(arcPts(x + w - rr, y + h - rr, 0, Math.PI / 2));
  if (!row) pts = pts.concat([[x + rr, y + h]]).concat(arcPts(x + rr, y + h - rr, Math.PI / 2, Math.PI));
  if (!row) pts = pts.concat([[x, y + rr]]).concat(arcPts(x + rr, y + rr, Math.PI, Math.PI * 1.5));
  walk(pts);
}

// ── 光域唯一性(2026-09-01):模态弹卡=井,同一时刻只有一个域受光──
// 光效是纯平面距离场(核心式无层概念),不治=弹卡打开时被盖/紧邻下层表面照常进光场,
// canvas 又恒高 z=光斑浮弹卡上方穿模。双机制:
//  ① 域过滤(照谁):井=显示中的 .modal;井内只照井面+后代,页面域排除一切 .modal 后代
//  ② canvas z 随域切(被谁挡):页面域 z1049——任何更高浮层(面板/toast/未来未知容器)天然
//     挡光零登记开放有效;弹卡域 z2000=光浮弹卡面上。无遮罩轻浮层不隔离域只物理挡光(要透光)。
// 样板域真相=DOM 查询(单弹层场景够用);多层叠栈(confirm 叠弹卡)要顶序权威,见 README。
function scopeOf(){
  var m = document.querySelector('.modal.in');
  return m ? (m.querySelector('.modal-content') || m) : null;
}
var scopeStamp = '';
function applyScope(scope){
  var s = scope ? 'modal' : 'page';
  if (s === scopeStamp) return; // 域戳:只变时写(z 是 inline,JS 单一 writer)
  scopeStamp = s;
  if (cv) cv.style.zIndex = s === 'modal' ? 2000 : 1049;
}
// 收集(谓词管道+分桶合一,paint 纯绘制)。谓词序=零成本优先:域(结构)→rect 批读→面积阈→视口外
function collect(candidates, v, scope){
  var list = candidates || document.querySelectorAll(SEL_ALL);
  var reads = [];
  list.forEach ? list.forEach(function(el){
    // 光域谓词:井内=只收井面+后代;页面域=排除一切 .modal 后代(隐藏 modal 零 rect 本就出局,closest 兜底)
    if (scope) { if (!(el === scope || scope.contains(el))) return; }
    else if (el.closest('.modal')) return;
    var b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) return; // 面积阈值(防御纵深:display:none 零 rect 幽灵等亚视觉面)
    if (b.bottom < -v.r || b.top > window.innerHeight + v.r || b.right < -v.r || b.left > window.innerWidth + v.r) return; // 视口外不画
    reads.push({el: el, b: b});
  }) : null;
  var infl = v.r * 2, faces = [], inputs = [], next = [], onSurface = false;
  reads.forEach(function(o){
    var b = o.b;
    var dx = Math.max(b.left - px, 0, px - b.right);
    var dy = Math.max(b.top - py, 0, py - b.bottom);
    var k = 1 - Math.sqrt(dx * dx + dy * dy) / infl; // 计算器核心式:k=clamp(1-d/2R),元素内 k=1
    if (k <= 0) return;
    var mx = (px - b.left), my = (py - b.top);
    if (k >= 1 && (o.el.matches('.card') || o.el.matches('.modal-content'))) onSurface = true;
    if (o.el.matches(INPUTS)) {
      if (document.activeElement === o.el) return; // focus 让位原生 focus ring
      inputs.push({el: o.el, b: b, k: k, mx: mx, my: my});
    } else {
      o.el.classList.add('lit');
      if (o.el.matches(SEL_ROW)) o.el.classList.add('lit-row');
      faces.push({el: o.el, b: b, k: k, mx: mx, my: my, row: o.el.matches(SEL_ROW)});
      next.push(o.el);
    }
  });
  return { faces: faces, inputs: inputs, onSurface: onSurface, next: next };
}
function paint(candidates){
  pending = null;
  if (px < 0) { unlit(); return; }
  var sc = scopeOf();
  applyScope(sc);
  var v = vars();
  var c = collect(candidates, v, sc), faces = c.faces, inputs = c.inputs, next = c.next, onSurface = c.onSurface;
  ctx.clearRect(0, 0, cv.width, cv.height);
  // ① 光球
  var blobA = (v.aBase + (onSurface ? (isNaN(v.ds) ? 0 : v.ds) : 0)) * v.gain;
  if (window.__lightBoost) blobA = .45;
  if (v.blob) ctx.drawImage(blobSprite(v, blobA), (px - v.r) * SC, (py - v.r) * SC, v.r * 2 * SC, v.r * 2 * SC);
  // ② 面斑+③ 边缘带
  faces.forEach(function(o){
    var b = o.b, rad = radiusOf(o.el);
    ctx.save();
    roundRect(b.left * SC, b.top * SC, b.width * SC, b.height * SC, rad * SC);
    ctx.clip();
    ctx.fillStyle = radial(v, (b.left + o.mx) * SC, (b.top + o.my) * SC, v.r * SC, v.aBase * v.gain * o.k);
    ctx.fillRect(b.left * SC, b.top * SC, b.width * SC, b.height * SC);
    ctx.restore();
    ctx.save();
    ctx.scale(SC, SC);
    drawEdgeBand(v, o, b.left + o.mx, b.top + o.my);
    ctx.restore();
  });
  // ④ input
  inputs.forEach(function(o){
    var b = o.b, rad = radiusOf(o.el);
    ctx.save();
    roundRect(b.left * SC, b.top * SC, b.width * SC, b.height * SC, rad * SC);
    ctx.clip();
    ctx.fillStyle = radial(v, (b.left + o.mx) * SC, (b.top + o.my) * SC, v.r * SC, (v.edgeA + .08 * v.gain) * o.k);
    ctx.fillRect(b.left * SC, b.top * SC, b.width * SC, b.height * SC);
    ctx.restore();
    ctx.save();
    ctx.scale(SC, SC);
    drawEdgeBand(v, o, b.left + o.mx, b.top + o.my);
    ctx.restore();
  });
  clearLit(next);
}

function clearLit(keep){
  lit.forEach(function(el){ if (keep.indexOf(el) < 0) { el.classList.remove('lit'); el.classList.remove('lit-row'); } });
  lit = keep;
}
function unlit(){
  if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
  clearLit([]);
}

function queue(candidates){
  if (candidates) pendCand = candidates;
  if (!pending) pending = requestAnimationFrame(function(){ pending = null; var c = pendCand; pendCand = null; paint(c); });
}

if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; // 红线:跳过受光
var touchActive = false;
document.addEventListener('pointermove', function(ev){ px = ev.clientX; py = ev.clientY; queue(); }, {passive:true});
// 滚动跟手:移动端 scroll 走合成器→主线程管道(晚一拍+合并节流),事件驱动=拖影;
// 修=scroll 置活跃戳,常驻帧循环活跃期每帧重画,停滚 120ms 自动静默。capture 兜内滚容器(scroll 不冒泡)
var scrollAlive = 0;
window.addEventListener('scroll', function(){ scrollAlive = performance.now() + 120; queue(); }, {passive:true, capture:true});
(function scrollFollow(){
  if (performance.now() < scrollAlive && px >= 0) queue();
  requestAnimationFrame(scrollFollow);
})();
document.addEventListener('pointerleave', function(){ if (touchActive) return; px = -1; py = -1; queue(); });
// 触屏拖拽(浏览器手势没收 pointermove——补 touch 通道;手指栈缓存 40px 位移阈,elementsFromPoint 移动端贵)
function touchAt(ev){
  if (ev.touches && ev.touches[0]) {
    px = ev.touches[0].clientX; py = ev.touches[0].clientY;
    if (document.elementsFromPoint) {
      var moved = Math.abs(px - lastStackX) > 40 || Math.abs(py - lastStackY) > 40;
      if (ev.type === 'touchstart' || !touchStack || moved) {
        lastStackX = px; lastStackY = py;
        touchStack = document.elementsFromPoint(px, py).filter(function(el){
          return el.nodeType === 1 && el.matches && el.matches(SEL_ALL);
        });
      }
      queue(touchStack.length ? touchStack : null);
      return;
    }
    queue();
  }
}
var lastStackX = -99, lastStackY = -99, touchStack = null;
document.addEventListener('touchstart', function(ev){ touchActive = true; touchAt(ev); }, {passive:true});
document.addEventListener('touchmove', touchAt, {passive:true});
document.addEventListener('touchend', function(ev){ touchActive = false; if (!ev.touches.length) { px = -1; py = -1; queue(); } }, {passive:true});
// ?light= 自证通道:boost=α.45+normal;bench=真机帧率 HUD
var lightMode = (/[?&]light=([a-z-]+)/.exec(location.search) || [])[1] || '';
window.__lightRepaint = function(){ touchStack = null; queue(); }; // 外部重画钩:开/关模态域切换必调
//(顺带失效触屏栈缓存);静默改 CSS 变量后也调(无事件触发=旧帧残留)
if (lightMode === 'boost') { window.__lightBoost = true; if (ctx) cv.style.mixBlendMode = 'normal'; }
if (lightMode.indexOf('bench') === 0) (function bench(){
  var hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:6px;top:6px;z-index:3000;pointer-events:none;font:11px/1.5 monospace;' +
    'background:rgba(0,0,0,.75);color:#8fd;padding:6px 8px;border-radius:6px;white-space:pre';
  document.body.appendChild(hud);
  var all = [], drag = [], collecting = false, last = performance.now();
  function stats(a){ if (a.length < 5) return '—';
    var s = a.slice().sort(function(x,y){return x-y});
    var fps = Math.round(1000 / (s.reduce(function(p,c){return p+c},0) / s.length));
    return fps + 'fps p95=' + s[Math.floor(s.length * .95)].toFixed(1) + 'ms dropped=' + s.filter(function(x){return x > 22}).length; }
  document.addEventListener('touchstart', function(){ drag = []; collecting = true; }, {passive:true});
  document.addEventListener('touchend', function(){ setTimeout(function(){ collecting = false; }, 400); }, {passive:true});
  (function loop(now){
    var dt = now - last; last = now;
    if (dt > 3 && dt < 300) { all.push(dt); if (collecting) drag.push(dt); }
    if (all.length > 2000) all = all.slice(-1000);
    hud.textContent = 'bench\nall: ' + stats(all) + '\ndrag: ' + stats(drag);
    requestAnimationFrame(loop);
  })(performance.now());
})();
})();
