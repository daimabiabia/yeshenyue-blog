/* 夜神月博客 · cursor.js 高级自定义光标（桌面端专属）
 * 双层结构：粉点直随 + 墨色惯性环（lerp 跟随）；悬停可交互元素时环放大，按下时收缩回弹。
 * 智能停帧：指针静止且环追上后自动停 rAF，省电不打扰。
 * 开关：FXS 'cursor'（特效中心）；触屏 / prefers-reduced-motion 自动整体禁用。
 */
(function () {
  'use strict';
  if (window.__cursorFx) return;
  var REDUCE = false;
  try { REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
  if (REDUCE || TOUCH) { window.__cursorFx = { ready: false }; return; }

  var ring = document.createElement('div');
  ring.id = 'cursor-ring';
  ring.setAttribute('aria-hidden', 'true');
  var dot = document.createElement('div');
  dot.id = 'cursor-dot';
  dot.setAttribute('aria-hidden', 'true');

  function mount() {
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  var x = -100, y = -100;      /* 指针真实位置 */
  var rx = -100, ry = -100;    /* 环的惯性位置 */
  var scale = 1, tScale = 1;   /* 环当前/目标缩放 */
  var pressed = false;
  var visible = false;

  var HOVER_SEL = 'a, button, input, textarea, select, label, .post, .cat, .rchip, .ip-post, .sticky, .bottle, .drow, .dtree-item, .tag, [role="button"]';

  document.addEventListener('mousemove', function (e) {
    x = e.clientX; y = e.clientY;
    if (!visible) {
      visible = true;
      rx = x; ry = y;
      ring.style.opacity = '';
      dot.style.opacity = '';
      document.documentElement.classList.add('cursor-fx');
    }
    var t = e.target && e.target.closest ? e.target.closest(HOVER_SEL) : null;
    tScale = t ? 1.85 : 1;
    wake();
  }, { passive: true });
  document.addEventListener('mousedown', function () { pressed = true; wake(); }, { passive: true });
  document.addEventListener('mouseup', function () { pressed = false; wake(); }, { passive: true });
  /* 指针离开窗口：整体淡出，避免环悬在半空 */
  document.addEventListener('mouseleave', function (e) {
    if (e.relatedTarget) return;
    visible = false;
    ring.style.opacity = '0';
    dot.style.opacity = '0';
  });

  var raf = 0, idle = 0;
  function tick() {
    rx += (x - rx) * 0.18;
    ry += (y - ry) * 0.18;
    scale += (tScale - scale) * 0.2;
    var s = scale * (pressed ? 0.78 : 1);
    ring.style.transform = 'translate(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px) translate(-50%,-50%) scale(' + s.toFixed(3) + ')';
    dot.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%)';
    /* 环追上指针、缩放到位且未按住 → 连续 60 帧无变化即停帧 */
    var settled = Math.abs(x - rx) < 0.35 && Math.abs(y - ry) < 0.35 && Math.abs(tScale - scale) < 0.005 && !pressed;
    idle = settled ? idle + 1 : 0;
    if (idle > 60) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf) raf = requestAnimationFrame(tick); }

  /* 特效开关联动 */
  function apply() {
    var on = window.FXS ? FXS.get('cursor') : true;
    ring.style.display = on ? '' : 'none';
    dot.style.display = on ? '' : 'none';
  }
  document.addEventListener('fxchange', function (e) {
    if (e.detail && e.detail.key === 'cursor') apply();
  });
  window.__cursorFx = { ready: true, apply: apply };
})();
