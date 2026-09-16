/* 夜神月博客 · fx.js 页面特效引擎 v2（canvas 零依赖）
 * 1) 鼠标糖果拖尾  2) 点击爆炸  3) Konami 彩蛋糖果雨  4) Shift 彩虹轨迹
 * 5) 长按蓄力超级爆炸  6) 双击冲击波  7) 卡片 3D 倾斜+光泽
 * 事件广播：fx:burst / fx:mega / fx:konami（音效与成就系统监听）
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

  /* 特效开关（fxcenter.js 定义；未加载时视为全开） */
  var FXS = window.FXS || { get: function () { return true; } };
  var isTouchDev = matchMedia('(hover: none), (pointer: coarse)').matches;

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
      } else if (p.shape === 'ring') {
        /* 冲击波：半径随寿命增长、线宽随寿命收窄的圆环 */
        var g2 = 1 - p.life / p.max;
        ctx.globalAlpha = (1 - g2) * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * (1 - g2));
        ctx.beginPath();
        ctx.arc(0, 0, p.r0 + g2 * p.rGrow, 0, 6.2832);
        ctx.stroke();
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

  function spawn(o) { parts.push(o); if (parts.length > 400) parts.splice(0, parts.length - 400); ensureLoop(); }

  /* ---- 1) 鼠标拖尾：按距离节流生成糖果小方块 ---- */
  var lastX = -99, lastY = -99;
  function trail(x, y) {
    if (isTouchDev || !FXS.get('trail')) return; /* 触屏设备禁用拖尾（防仿真鼠标风暴） */
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
    if (!FXS.get('burst')) return;
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
    fxEvent('fx:burst', { x: x, y: y, n: n });
  }

  function fxEvent(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {}
  }

  /* ---- 2.5) 冲击波：单发扩散圆环 ---- */
  function shockwave(x, y, color) {
    if (!FXS.get('shock')) return;
    var pal = themePalette();
    spawn({
      x: x, y: y, vx: 0, vy: 0,
      rot: 0, vr: 0, r0: 6, rGrow: 90 + Math.random() * 50,
      size: 5, shape: 'ring',
      color: color || pal[(Math.random() * pal.length) | 0],
      life: 480, max: 480, fade: 'none', shrink: false
    });
  }

  /* ---- 2.6) 超级爆炸（长按蓄力释放）：60 粒 + 双冲击波 ---- */
  function megaBurst(x, y) {
    if (!FXS.get('mega')) { fxEvent('fx:mega', { x: x, y: y }); return; }
    var pal = themePalette();
    for (var i = 0; i < 48; i++) {
      var a = Math.random() * 6.2832;
      var sp = 3 + Math.random() * 9;
      spawn({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3.5,
        g: 0.18, rot: Math.random() * 3.14, vr: (Math.random() - 0.5) * 0.5,
        size: 3 + Math.random() * 5, shape: Math.random() < 0.25 ? 'plus' : (Math.random() < 0.4 ? 'dot' : 'square'),
        color: pal[(Math.random() * pal.length) | 0],
        life: 800 + Math.random() * 400, max: 1200, fade: 'out', shrink: true
      });
    }
    shockwave(x, y, pal[0]);
    setTimeout(function () { shockwave(x, y, pal[2]); }, 90);
    fxEvent('fx:mega', { x: x, y: y });
  }

  /* ---- 2.7) Konami 彩蛋：↑↑↓↓←→←→BA = 全屏糖果雨 + 连环爆炸 ---- */
  var SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var seqIdx = 0;
  function candyRain() {
    if (!FXS.get('konami')) return;
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
    fxEvent('fx:konami', {});
  }

  /* ---- 4) Shift 彩虹轨迹：按住 Shift 拖出彩虹光带 ---- */
  var hue = 0, lastRX = -99, lastRY = -99;
  function rainbow(x, y) {
    if (!FXS.get('rainbow')) return;
    var dx = x - lastRX, dy = y - lastRY;
    if (dx * dx + dy * dy < 100) return;
    lastRX = x; lastRY = y;
    hue = (hue + 14) % 360;
    spawn({
      x: x, y: y,
      vx: dx * 0.04, vy: dy * 0.04 - 0.2,
      g: 0.012, rot: 0, vr: 0,
      size: 3 + Math.random() * 2, shape: 'dot',
      color: 'hsl(' + hue + ', 95%, 60%)',
      life: 760, max: 760, fade: 'out', shrink: true
    });
  }

  /* ---- 5) 长按蓄力：按住空白处 0.6s 释放超级爆炸 ---- */
  var pressT = 0, pressX = 0, pressY = 0, chargeTimer = 0, suppressClick = false;
  function endPress() { clearInterval(chargeTimer); pressT = 0; }
  document.addEventListener('mousemove', function (e) {
    if (e.shiftKey) { rainbow(e.clientX, e.clientY); if (FXS.get('trail')) trail(e.clientX, e.clientY); return; }
    trail(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener('pointerdown', function (e) {
    if (isUiTarget(e.target)) return;
    pressX = e.clientX; pressY = e.clientY;
    pressT = Date.now();
    /* 蓄力视觉：按住期间周期性冒出蓄力环 */
    chargeTimer = setInterval(function () {
      shockwave(pressX + (Math.random() * 16 - 8), pressY + (Math.random() * 16 - 8));
    }, 110);
    setTimeout(function () {
      if (pressT && Date.now() - pressT >= 560) {
        pressT = 0;
        clearInterval(chargeTimer);
        suppressClick = true;
        megaBurst(pressX, pressY);
      }
    }, 580);
  }, { passive: true });
  document.addEventListener('pointerup', endPress, { passive: true });
  document.addEventListener('pointercancel', endPress, { passive: true });
  document.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    if (isUiTarget(e.target)) return;
    burst(e.clientX, e.clientY);
  }, { passive: true });
  /* ---- 6) 双击冲击波 ---- */
  document.addEventListener('dblclick', function (e) {
    if (isUiTarget(e.target)) return;
    shockwave(e.clientX, e.clientY);
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

  /* ---- 7) 卡片 3D 倾斜 + 光泽跟随（CSS 变量 --tx/--ty/--gx/--gy） ---- */
  /* 绑定与开关解耦：mousemove 内实时读 FXS.get('tilt')，
   * 否则初始关闭、面板里再打开的倾斜永远绑不上（特效设置不生效的老毛病） */
  var TILT_SEL = '.post, .cat, .foot-card, .cta';
  var tiltBound = false;
  function tilt() {
    if (tiltBound || isTouchDev) return;
    tiltBound = true;
    document.addEventListener('mousemove', function (e) {
      if (!FXS.get('tilt')) return;
      var card = e.target && e.target.closest ? e.target.closest(TILT_SEL) : null;
      if (!card) return;
      var r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--tx', (py * -7).toFixed(2) + 'deg');
      card.style.setProperty('--ty', (px * 9).toFixed(2) + 'deg');
      card.style.setProperty('--gx', ((px + 0.5) * 100).toFixed(1) + '%');
      card.style.setProperty('--gy', ((py + 0.5) * 100).toFixed(1) + '%');
      if (!card._tiltBound) {
        card._tiltBound = true;
        card.addEventListener('mouseleave', function () {
          card.style.setProperty('--tx', '0deg');
          card.style.setProperty('--ty', '0deg');
        });
      }
    }, { passive: true });
  }

  /* 测试钩子（只读计数，不参与渲染逻辑） */
  window.FX = {
    ready: true,
    canvas: cv,
    version: 2,
    stats: function () { return { particles: parts.length, running: running }; },
    burst: burst,
    megaBurst: megaBurst,
    shockwave: shockwave,
    candyRain: candyRain,
    trail: trail,
    rainbow: rainbow,
    tilt: tilt
  };
})();
