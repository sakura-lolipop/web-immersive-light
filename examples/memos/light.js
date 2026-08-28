/* ============================================================
  light.js — 动态光晕计算器(web-immersive-light 样板核心)
  产自 HotifyNEXT-Server /console 光感线(十五版迭代终态),
  零依赖,复制本文件 + 三段 CSS(:root 配方族 + #light-layer + .lit/.lit-row)
  + <div id="light-layer"></div> 即可接入任何页面。

  memos 接入适配(仅两行注册表 + main.tsx 一行 import):
    - SEL 注册表改为 memos 实际选择器(见下)
    - CSS 配方在 index.css 末尾追加,主题挂 [data-theme="default-dark"]
  红线(坑史见源仓 webuipath.md W8,省一条就返工一轮):
    - 梯度必须在使用点属性直引 per-element 变量(var-in-var 冻结陷阱)
    - blend 主题分层(dark=screen/light=normal)
    - 触屏补 touch 通道+pointerleave 加 touchActive 守卫
    - scroll 监听空参包一层(Event 透传=全灭灯)
    - reduced-motion 跳过
  React 注意:paint() 直接 classList.add('lit') 是外部 DOM 变更,
  若 React 后续重渲染改写该元素 className 会抹掉 .lit(条件 class 切换时),
  下一次 pointermove 重扫会补回——demo 可接受,产品化建议受光面挂
  非条件 class 或改用 :has/CSS 锚定方案。
============================================================ */
(function(){
"use strict";
var layer = document.getElementById('light-layer');

/* 受光面注册表(名单单一真相):CSS 只认 .lit/.lit-row 单类。
   密集堆叠族(表行/列表行)追加 lit-row=分隔线形态。
   memos 名单:memo 卡片 / 侧边栏行 / 对话框 / popover / 下拉菜单(面板+行)。 */
var SEL = '.memo-card, .sidebar-row, [data-slot="dialog-content"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-item"]';
var SEL_ROW = '.sidebar-row, [data-slot="dropdown-menu-item"]';
var INPUTS = 'input, select, textarea'; // 无伪元素平台边界→内联径向

var px = -1, py = -1, pending = null, pendCand = null, lit = [], litInputs = [];

function vars(){
  var cs = getComputedStyle(document.documentElement);
  return {
    r: parseFloat(cs.getPropertyValue('--light-r')) || 80,
    a: parseFloat(cs.getPropertyValue('--light-a')) || .13,
    falloff: (parseFloat(cs.getPropertyValue('--light-falloff')) || 65) + '%',
    rgb: (cs.getPropertyValue('--primary-rgb') || cs.getPropertyValue('--tblr-primary-rgb') || '6, 111, 209').trim()
  };
}

function paint(candidates){
  pending = null;
  if (px < 0) { unlit(); return; }
  // 通道①:blob(transform 驱动走合成器,拖动零重绘——「跟手」关键)
  if (layer) {
    layer.style.setProperty('--px', px + 'px');
    layer.style.setProperty('--py', py + 'px');
    layer.classList.add('on');
  }
  var v = vars(), infl = v.r * 2, reads = [], next = [], nextIn = [];
  var list = candidates || document.querySelectorAll(SEL + ',' + INPUTS);
  list.forEach ? list.forEach(function(el){
    var b = el.getBoundingClientRect(); // 全量读,后统一写(无布局抖动)
    reads.push({el:el, b:b});
  }) : null;
  reads.forEach(function(o){
    var b = o.b;
    var dx = Math.max(b.left - px, 0, px - b.right);
    var dy = Math.max(b.top - py, 0, py - b.bottom);
    var k = 1 - Math.sqrt(dx * dx + dy * dy) / infl; // 计算器核心式
    if (k <= 0) return;
    var mx = (px - b.left) + 'px', my = (py - b.top) + 'px';
    if (o.el.matches(INPUTS)) {
      o.el.style.backgroundImage = 'radial-gradient(' + v.r + 'px at ' + mx + ' ' + my +
        ', rgba(' + v.rgb + ', ' + (v.a * k).toFixed(3) + '), transparent ' + v.falloff + ')';
      nextIn.push(o.el);
    } else {
      o.el.style.setProperty('--mx', mx);
      o.el.style.setProperty('--my', my);
      o.el.style.setProperty('--light-k', k.toFixed(3));
      o.el.classList.add('lit');
      if (o.el.matches(SEL_ROW)) o.el.classList.add('lit-row');
      next.push(o.el);
    }
  });
  lit.forEach(function(el){ if (next.indexOf(el) < 0) { el.classList.remove('lit'); el.classList.remove('lit-row'); } });
  litInputs.forEach(function(el){ if (nextIn.indexOf(el) < 0) el.style.backgroundImage = ''; });
  lit = next; litInputs = nextIn;
}

function unlit(){
  if (layer) layer.classList.remove('on');
  lit.forEach(function(el){ el.classList.remove('lit'); el.classList.remove('lit-row'); }); lit = [];
  litInputs.forEach(function(el){ el.style.backgroundImage = ''; }); litInputs = [];
}

function queue(candidates){
  if (candidates) pendCand = candidates;
  if (!pending) pending = requestAnimationFrame(function(){ pending = null; var c = pendCand; pendCand = null; paint(c); });
}

if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; // 红线:跳过受光

// PC 悬停
document.addEventListener('pointermove', function(ev){ px = ev.clientX; py = ev.clientY; queue(); }, {passive:true});
// 滚轮:指针不动面在移,重算——空参包一层(Event 对象当 candidates 透传=全灭灯,实证坑)
window.addEventListener('scroll', function(){ queue(); }, {passive:true});
// 指针离场灭(触屏手势没收期派发的 pointerleave 不是真离场,touchActive 守卫)
var touchActive = false;
document.addEventListener('pointerleave', function(){ if (touchActive) return; px = -1; py = -1; queue(); });

// 触屏拖拽(浏览器把手势没收给滚动后 pointermove 遭 pointercancel 掐断——补 touch 通道;
// passive 承诺不 preventDefault=规范层面不可能挡滚动)
function touchAt(ev){
  if (ev.touches && ev.touches[0]) {
    px = ev.touches[0].clientX; py = ev.touches[0].clientY;
    // 拖动跟手优化:候选=手指下元素栈(合成器命中,便宜);全扫描留给 PC/松手
    if (document.elementsFromPoint) {
      var stack = document.elementsFromPoint(px, py).filter(function(el){
        return el.nodeType === 1 && el.matches && (el.matches(SEL) || el.matches(INPUTS));
      });
      queue(stack.length ? stack : null);
      return;
    }
    queue();
  }
}
document.addEventListener('touchstart', function(ev){ touchActive = true; touchAt(ev); }, {passive:true});
document.addEventListener('touchmove', touchAt, {passive:true});
document.addEventListener('touchend', function(ev){ touchActive = false; if (!ev.touches.length) { px = -1; py = -1; queue(); } }, {passive:true});
})();
