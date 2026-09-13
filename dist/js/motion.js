/* 夜神月博客 · GSAP 动效模块
 * 依赖：/js/vendor/gsap.min.js + /js/vendor/ScrollTrigger.min.js（需在本文件之前加载）
 * API：window.Motion = { ready, heroIn, reveal, readerIn, progressIn, swapIn, killAll, tilt, pop }
 * 设计：Neo-Brutalism —— back.out 回弹、微倾斜、错峰；全部走 transform/opacity 合成层；
 *      prefers-reduced-motion 全降级；路由切换时清理 ScrollTrigger 防泄漏。
 */
(function () {
  'use strict';
  if (!window.gsap) { window.Motion = { ready: false }; return; }
  const gsap = window.gsap;
  const ST = window.ScrollTrigger || null;
  if (ST) gsap.registerPlugin(ST);
  gsap.defaults({ ease: 'power3.out', duration: 0.55 });

  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CAN_HOVER = matchMedia('(hover: hover) and (pointer: fine)').matches;
  document.documentElement.classList.add('has-gsap');

  let heroDone = false;

  /* ---- 标题拆字（只做一次，带 aria 保护） ---- */
  function splitChars(el) {
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    const frag = document.createDocumentFragment();
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'char';
      s.textContent = ch === ' ' ? '\u00A0' : ch;
      s.setAttribute('aria-hidden', 'true');
      frag.appendChild(s);
    }
    el.appendChild(frag);
  }

  /* ---- 首屏编排：导航滑入 → badge 弹入 → 标题逐字 → slogan → 技术标签随机错峰 ---- */
  function heroIn() {
    const hero = document.querySelector('.hero');
    if (!hero || heroDone) return;
    heroDone = true;
    if (REDUCE || !ST) return;
    const h1 = hero.querySelector('h1');
    if (h1 && !h1.dataset.split) { splitChars(h1); h1.dataset.split = '1'; }
    gsap.timeline()
      .from('.nav', { yPercent: -130, duration: 0.5 }, 0)
      .from(hero.querySelector('.badge'), { autoAlpha: 0, x: -26, rotation: -5, duration: 0.42, ease: 'back.out(2)' }, 0.1)
      .from(hero.querySelectorAll('h1 .char'), {
        yPercent: 130, autoAlpha: 0,
        rotation: () => gsap.utils.random(-9, 9),
        stagger: 0.034, duration: 0.55, ease: 'back.out(1.8)'
      }, 0.18)
      .from(hero.querySelector('.slogan'), { autoAlpha: 0, y: 24, duration: 0.45 }, '-=0.25')
      .from(hero.querySelectorAll('.tech .tag'), {
        autoAlpha: 0, scale: 0.4,
        stagger: { each: 0.045, from: 'random' },
        duration: 0.38, ease: 'back.out(2.4)'
      }, '-=0.3');
  }

  /* ---- 滚动进场：接管 .reveal 卡片与标签云（ScrollTrigger.batch，批量错峰） ---- */
  function reveal(scope) {
    const root = scope || document;
    const sel = '.reveal:not([data-motioned]), .tagcloud a:not([data-motioned])';
    const els = root.querySelectorAll(sel);
    if (!els.length) return;
    els.forEach((el) => el.setAttribute('data-motioned', '1'));
    if (REDUCE || !ST) { gsap.set(els, { clearProps: 'all', autoAlpha: 1 }); return; }
    gsap.set(els, { autoAlpha: 0, y: 44, rotation: (i) => (i % 2 ? -1.5 : 1.5) });
    ST.batch(els, {
      start: 'top 88%',
      once: true,
      onEnter: (batch) => {
        /* 倾斜卡（栏目卡/精选卡）保留内联 transform 供 quickTo 使用；普通卡清掉以恢复 CSS hover */
        const tiltCards = batch.filter((el) => el.classList.contains('cat') || el.classList.contains('feat'));
        const plain = batch.filter((el) => tiltCards.indexOf(el) === -1);
        if (plain.length) gsap.to(plain, {
          autoAlpha: 1, y: 0, rotation: 0, stagger: 0.09, duration: 0.65,
          ease: 'back.out(1.5)', overwrite: true, clearProps: 'transform'
        });
        if (tiltCards.length) gsap.to(tiltCards, {
          autoAlpha: 1, y: 0, rotation: 0, stagger: 0.09, duration: 0.65,
          ease: 'back.out(1.5)', overwrite: true
        });
      }
    });
  }

  /* ---- 文章详情进场：返回键/标题/元信息弹入，正文块滚动逐段浮现 ---- */
  function readerIn() {
    if (REDUCE || !ST) return;
    const art = document.querySelector('.article');
    if (!art) return;
    const back = art.querySelector('.back');
    const h1 = art.querySelector('h1');
    const meta = art.querySelector('.meta');
    if (back) gsap.from(back, { autoAlpha: 0, x: -24, duration: 0.4, ease: 'back.out(1.7)' });
    if (h1) gsap.from(h1, { autoAlpha: 0, y: 30, rotation: 0.6, duration: 0.5 });
    if (meta) gsap.from(meta, { autoAlpha: 0, y: 14, duration: 0.4 }, '<0.08');
    const blocks = art.querySelectorAll('.md > *');
    if (blocks.length) {
      gsap.set(blocks, { autoAlpha: 0, y: 26 });
      ST.batch(blocks, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, stagger: 0.05, duration: 0.45, overwrite: true })
      });
    }
  }

  /* ---- 登神进度条：卡片弹入 + 进度 scaleX 填充 + 百分比数字滚动 ---- */
  function progressIn() {
    const card = document.querySelector('#progress .prog');
    if (!card) return;
    card.setAttribute('data-motioned', '1');
    if (REDUCE || !ST) return;
    gsap.from(card, { autoAlpha: 0, y: 40, rotation: -1.5, duration: 0.6, ease: 'back.out(1.5)' });
    const fill = card.querySelector('.prog-fill');
    if (fill) gsap.fromTo(fill, { scaleX: 0 }, { scaleX: 1, transformOrigin: '0% 50%', duration: 1.1, ease: 'power3.inOut' });
    const pcts = card.querySelectorAll('.prog-top .mono');
    const pctEl = pcts[pcts.length - 1];
    if (pctEl) {
      const target = parseInt(pctEl.textContent, 10) || 0;
      const o = { v: 0 };
      gsap.to(o, {
        v: target, duration: 1.1, ease: 'power3.inOut',
        onUpdate: () => { pctEl.textContent = Math.round(o.v) + '%'; }
      });
    }
  }

  /* ---- 视图切换过渡（容器级淡入上移） ---- */
  function swapIn(el) {
    if (!el || REDUCE || !ST) return;
    gsap.fromTo(el, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.4, overwrite: true });
  }

  /* ---- 路由清理：杀掉旧 ScrollTrigger，复位接管标记（防泄漏 + 新内容可重新进场） ---- */
  function killAll() {
    if (ST) ST.getAll().forEach((t) => t.kill());
    document.querySelectorAll('[data-motioned]').forEach((el) => el.removeAttribute('data-motioned'));
  }

  /* ---- 桌面 hover 3D 倾斜（quickTo 复用单个补间，性能友好） ---- */
  function tilt(scope) {
    if (REDUCE || !CAN_HOVER) return;
    (scope || document).querySelectorAll('.cat, .post.feat').forEach((card) => {
      if (card.dataset.tilt) return;
      card.dataset.tilt = '1';
      gsap.set(card, { transformPerspective: 650 });
      const rx = gsap.quickTo(card, 'rotationX', { duration: 0.45, ease: 'power3' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: 0.45, ease: 'power3' });
      const sc = gsap.quickTo(card, 'scale', { duration: 0.45, ease: 'power3' });
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        ry(px * 9); rx(-py * 9); sc(1.015);
      });
      card.addEventListener('mouseleave', () => { rx(0); ry(0); sc(1); });
    });
  }

  /* ---- 微交互弹跳（主题按钮等） ---- */
  function pop(el) {
    if (!el || REDUCE) return;
    gsap.fromTo(el, { scale: 0.82, rotation: -8 }, { scale: 1, rotation: 0, duration: 0.45, ease: 'back.out(2.6)', overwrite: true });
  }

  /* ---- 终端打字机欢迎行（光标闪烁由 CSS 提供） ---- */
  function typeLine(el) {
    if (!el) return;
    const text = el.getAttribute('data-text') || el.textContent || '';
    if (REDUCE) { el.textContent = text; return; }
    el.textContent = '';
    const o = { i: 0 };
    gsap.to(o, {
      i: text.length, duration: Math.min(2.6, text.length * 0.05), delay: 0.9, ease: 'none',
      onUpdate: () => { el.textContent = text.slice(0, Math.round(o.i)); },
      onComplete: () => { el.textContent = text; }
    });
  }

  /* ---- 登神长阶路线图进场：层从左弹入 + 课程 chips 错峰浮现 ---- */
  function roadmapIn() {
    if (REDUCE || !ST) return;
    const rungs = document.querySelectorAll('#roadmap .rung');
    if (!rungs.length) return;
    gsap.from(rungs, {
      autoAlpha: 0, x: -44, stagger: 0.12, duration: 0.6, ease: 'back.out(1.4)',
      scrollTrigger: { trigger: '#roadmap', start: 'top 82%', once: true }
    });
    const chips = document.querySelectorAll('#roadmap .rchip');
    if (chips.length) {
      gsap.set(chips, { autoAlpha: 0, y: 14 });
      ST.batch(chips, {
        start: 'top 92%', once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, stagger: 0.03, duration: 0.4, overwrite: true })
      });
    }
  }

  /* ---- 阅读进度条：scrub 联动正文滚动 ---- */
  function readProgress(triggerSel) {
    if (REDUCE || !ST) return;
    const fill = document.querySelector('#readbar .rp-fill');
    const trigger = document.querySelector(triggerSel);
    if (!fill || !trigger) return;
    gsap.fromTo(fill, { scaleX: 0 }, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger, start: 'top top', end: 'bottom bottom', scrub: 0.3 }
    });
  }

  /* ---- TOC 滚动高亮：每个标题一个触发区间 ---- */
  function tocHighlight(scope) {
    if (!ST || REDUCE) return;
    scope.querySelectorAll('.md h2[id], .md h3[id]').forEach((h) => {
      const link = scope.querySelector('.toc a[data-sec="' + h.id + '"]');
      if (!link) return;
      ST.create({
        trigger: h, start: 'top 55%', end: 'bottom 45%',
        onToggle: (self) => {
          if (self.isActive) {
            scope.querySelectorAll('.toc a.active').forEach((a) => a.classList.remove('active'));
            link.classList.add('active');
          }
        }
      });
    });
    const first = scope.querySelector('.toc a');
    if (first) first.classList.add('active');
  }

  /* ---- 字体加载后重算触发位置 ---- */
  if (ST && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ST.refresh()).catch(() => {});
  }

  window.Motion = { ready: true, heroIn, reveal, readerIn, progressIn, swapIn, killAll, tilt, pop, typeLine, roadmapIn, readProgress, tocHighlight };
})();
