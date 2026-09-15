/* 夜神月博客 · fx.js 页面特效引擎（canvas 零依赖）
 * 1) 鼠标糖果拖尾  2) 点击爆炸  3) Konami 彩蛋糖果雨
 * 降级：prefers-reduced-motion 全禁；页面隐藏暂停；输入框/弹层内点击不触发爆炸
 */
(function () {
  'use strict';
  if (window.FX) return;
  var REDUCE = false;
  try { REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (REDUCE) {
    window.FX = { ready: false, reason: 'reduced-motion' };
    return;
  }

  var CANDY = ['#FF2E88', '#FFD400', '#00A3FF', '#9BEB00', '#FF7A1A', '#8B5CF6'];
  var DARK = ['#FF5CB8', '#FFE135', '#4FD2FF', '#C4FF3D', '#FF9A4D', '#B794FF'];
  var palette = CANDY;

  var cv = document.createElement('canvas');
  cv.id = 'fx-canvas';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;';
  document.documentElement.appendChild(cv);
  var ctx = cv.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  function themePalette() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark ? DARK : CANDY;
  }

  var parts = [];
  var raf = 0;
  var running = false;

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= 16;
      if (p.life <= 0 || p.y > innerHeight + 40) { parts.splice(i, 1); continue; }
      p.x += p.vx;
      p.y += p.vy;
      if (p.g) p.vy += p.g;
      if (p.sway) p.x += Math.sin((p.life / 300) + p.phase) * p.sway;
      p.rot += p.vr;
      var k = p.fade === 'out' ? Math.max(0, p.life / p.max) : 1;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      var s = p.size * (p.shrink ? k : 1);
      if (p.shape === 'plus') {
        ctx.fillRect(-s, -s / 3, s * 2, (s * 2) / 3);
        ctx.fillRect(-s / 3, -s, (s * 2) / 3, s * 2);
      } else if (p.shape === 'dot') {
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, 6.2832);
        ctx.fill();
      } else {
        ctx.fillRect(-s, -s, s * 2, s * 2);
      }
      ctx.restore();
    }
    if (parts.length) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }
  function ensureLoop() {
    if (!running) { running = true; raf = requestAnimationFrame(tick); }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running) { cancelAnimationFrame(raf); running = false; }
    else if (!document.hidden && parts.length) ensureLoop();
  });

  function spawn(o) { parts.push(o); if (parts.length > 600) parts.splice(0, parts.length - 600); ensureLoop(); }

  /* ---- 1) 鼠标拖尾：按距离节流生成糖果小方块 ---- */
  var lastX = -99, lastY = -99;
  var isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
  function trail(x, y) {
    var dx = x - lastX, dy = y - lastY;
    if (dx * dx + dy * dy < 144) return; /* 距离 <12px 不生成 */
    lastX = x; lastY = y;
    var pal = themePalette();
    spawn({
      x: x + (Math.random() * 8 - 4), y: y + (Math.random() * 8 - 4),
      vx: dx * 0.06 + (Math.random() - 0.5), vy: dy * 0.06 + (Math.random() - 0.5) - 0.3,
      g: 0.02, rot: Math.random() * 3.14, vr: (Math.random() - 0.5) * 0.3,
      size: 2.5 + Math.random() * 2.5, shape: Math.random() < 0.15 ? 'plus' : 'square',
      color: pal[(Math.random() * pal.length) | 0],
      life: 520, max: 520, fade: 'out', shrink: true
    });
  }

  /* ---- 2) 点击爆炸：糖果碎片喷发 ---- */
  function isUiTarget(t) {
    return !!(t && t.closest && t.closest('input, textarea, select, #cmdk, #kbdHelp, #lightbox, .nav, a, button'));
  }
  function burst(x, y, n) {
    n = n || 16;
    var pal = themePalette();
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832;
      var sp = 2 + Math.random() * 5;
      spawn({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.5,
        g: 0.16, rot: Math.random() * 3.14, vr: (Math.random() - 0.5) * 0.4,
        size: 2.5 + Math.random() * 4, shape: Math.random() < 0.2 ? 'plus' : (Math.random() < 0.35 ? 'dot' : 'square'),
        color: pal[(Math.random() * pal.length) | 0],
        life: 620 + Math.random() * 300, max: 900, fade: 'out', shrink: true
      });
    }
  }

  /* ---- 3) Konami 彩蛋：↑↑↓↓←→←→BA = 全屏糖果雨 + 连环爆炸 ---- */
  var SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var seqIdx = 0;
  function candyRain() {
    var pal = themePalette();
    for (var i = 0; i < 90; i++) {
      spawn({
        x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.8,
        vx: (Math.random() - 0.5) * 1.2, vy: 1.5 + Math.random() * 2.5,
        sway: 1.6, phase: Math.random() * 6.28,
        rot: Math.random() * 3.14, vr: (Math.random() - 0.5) * 0.2,
        size: 3 + Math.random() * 5, shape: Math.random() < 0.25 ? 'plus' : (Math.random() < 0.5 ? 'dot' : 'square'),
        color: pal[(Math.random() * pal.length) | 0],
        life: 6000, max: 6000, fade: 'none', shrink: false
      });
    }
    var waves = 0;
    var timer = setInterval(function () {
      burst(Math.random() * innerWidth, innerHeight * (0.2 + Math.random() * 0.5), 22);
      if (++waves >= 5) clearInterval(timer);
    }, 260);
  }

  document.addEventListener('mousemove', function (e) { trail(e.clientX, e.clientY); }, { passive: true });
  document.addEventListener('click', function (e) {
    if (isUiTarget(e.target)) return;
    burst(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    if (t && !isUiTarget(e.target)) burst(t.clientX, t.clientY, 10);
  }, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) { seqIdx = 0; return; }
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === SEQ[seqIdx]) {
      if (++seqIdx === SEQ.length) { seqIdx = 0; candyRain(); }
    } else {
      seqIdx = (k === SEQ[0]) ? 1 : 0;
    }
  });

  /* 测试钩子（只读计数，不参与渲染逻辑） */
  window.FX = {
    ready: true,
    canvas: cv,
    stats: function () { return { particles: parts.length, running: running }; },
    burst: burst,
    candyRain: candyRain,
    trail: trail
  };
})();
