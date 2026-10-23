/* 夜神月博客 · netgraph.js Hero 交互式网络拓扑画布
 * 「设备组网」隐喻：节点缓慢漂移、彼此连线成网，鼠标靠近时节点被吸引、连线点亮为主题色。
 * 落在 .hero 背景层（z-index 0，pointer-events none 不挡点击，鼠标事件由 hero 容器转发）。
 * 节能设计：hero 离屏 / 页面隐藏 / FXS 'net' 关闭时自动停帧；窗口 resize 重播种。
 * 降级：prefers-reduced-motion 全禁。
 */
(function () {
  'use strict';
  if (window.__netgraph) return;
  var REDUCE = false;
  try { REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (REDUCE) { window.__netgraph = { ready: false }; return; }

  var cv = document.createElement('canvas');
  cv.id = 'netgraph';
  cv.setAttribute('aria-hidden', 'true');
  var ctx = cv.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var hero = null;
  var W = 0, H = 0;
  var nodes = [];
  var mouse = { x: -9999, y: -9999 };
  var raf = 0, visible = true, inView = false;
  var LINK = 120, MOUSE_LINK = 170;

  function colors() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return dark
      ? { node: 'rgba(196, 255, 61, .55)', line: 'rgba(196, 255, 61, .10)', hot: 'rgba(79, 210, 255, .75)', hotLine: 'rgba(79, 210, 255, .35)' }
      : { node: 'rgba(10, 10, 10, .38)', line: 'rgba(10, 10, 10, .09)', hot: 'rgba(255, 46, 136, .8)', hotLine: 'rgba(255, 46, 136, .35)' };
  }

  function resize() {
    if (!hero) return;
    var r = hero.getBoundingClientRect();
    W = Math.max(320, r.width);
    H = Math.max(220, r.height);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    var n = Math.max(24, Math.min(60, Math.round(W * H / 24000)));
    nodes = [];
    for (var i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.34,
        vy: (Math.random() - 0.5) * 0.34,
        r: 1.6 + Math.random() * 2.1,
        hot: 0, /* 0~1：被鼠标激活的程度，驱动连线点亮 */
      });
    }
  }

  function tick() {
    if (!visible || !inView || !(window.FXS ? FXS.get('net') : true)) { raf = 0; return; }
    var c = colors();
    ctx.clearRect(0, 0, W, H);
    var i, j, n2, dx, dy, d;
    for (i = 0; i < nodes.length; i++) {
      var p = nodes[i];
      p.x += p.vx; p.y += p.vy;
      /* 边界回弹 */
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
      /* 鼠标吸引 + 激活度衰减 */
      dx = mouse.x - p.x; dy = mouse.y - p.y;
      d = Math.sqrt(dx * dx + dy * dy);
      var target = d < MOUSE_LINK ? 1 - d / MOUSE_LINK : 0;
      p.hot += (target - p.hot) * 0.12;
      if (p.hot > 0.04 && d > 30) { p.x += dx * 0.0022 * p.hot; p.y += dy * 0.0022 * p.hot; }
    }
    /* 连线：普通距离内细线，鼠标邻域内加亮加粗 */
    for (i = 0; i < nodes.length; i++) {
      for (j = i + 1; j < nodes.length; j++) {
        n2 = nodes[j];
        dx = nodes[i].x - n2.x; dy = nodes[i].y - n2.y;
        d = dx * dx + dy * dy;
        if (d > LINK * LINK) continue;
        var a = 1 - Math.sqrt(d) / LINK;
        var hot = Math.max(nodes[i].hot, n2.hot);
        ctx.strokeStyle = hot > 0.15 ? c.hotLine : c.line;
        ctx.lineWidth = hot > 0.15 ? 1.4 : 1;
        ctx.globalAlpha = a * (hot > 0.15 ? 0.95 : 0.8);
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(n2.x, n2.y);
        ctx.stroke();
      }
    }
    /* 节点：普通墨点，激活时主题色大点 + 光晕 */
    for (i = 0; i < nodes.length; i++) {
      var q = nodes[i];
      ctx.globalAlpha = 1;
      ctx.fillStyle = q.hot > 0.15 ? c.hot : c.node;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r + q.hot * 2.2, 0, 6.2832);
      ctx.fill();
      if (q.hot > 0.35) {
        ctx.globalAlpha = (q.hot - 0.35) * 0.5;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r + 6, 0, 6.2832);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf && visible && inView) raf = requestAnimationFrame(tick); }

  function bindHero() {
    hero = document.querySelector('.hero');
    if (!hero) return;
    hero.insertBefore(cv, hero.firstChild);
    resize();
    hero.addEventListener('mousemove', function (e) {
      var r = hero.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      wake();
    }, { passive: true });
    hero.addEventListener('mouseleave', function () { mouse.x = -9999; mouse.y = -9999; }, { passive: true });
    /* 离屏暂停 */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (en) { inView = en.isIntersecting; });
        wake();
      }, { threshold: 0.02 }).observe(hero);
    } else { inView = true; }
    document.addEventListener('visibilitychange', function () {
      visible = !document.hidden;
      wake();
    });
    /* 特效开关联动：关闭时停帧，重新打开时唤醒 */
    document.addEventListener('fxchange', function (e) {
      if (e.detail && e.detail.key === 'net') wake();
    });
    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 200);
    });
    wake();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindHero);
  else bindHero();
  window.__netgraph = { ready: true, seed: function () { seed(); wake(); } };
})();
