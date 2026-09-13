/* 夜神月博客 · 前台逻辑（零依赖，视图状态版） */
(function () {
  'use strict';
  const ICONS = {
    chip: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><rect x="10" y="10" width="28" height="28" rx="3"/><rect x="18" y="18" width="12" height="12" fill="#0A0A0A"/><path d="M16 4v6M32 4v6M16 38v6M32 38v6M4 16h6M4 32h6M38 16h6M38 32h6"/></svg>',
    wave: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><path d="M4 24q6-14 10 0t10 0 10 0 10 0"/></svg>',
    cloud: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><path d="M14 34a9 9 0 0 1 0-18 11 11 0 0 1 21 3 7 7 0 0 1-2 15z"/></svg>',
    bug: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><ellipse cx="24" cy="24" rx="10" ry="13"/><path d="M24 11v26M14 18l-6-4M34 18l6-4M14 30l-6 4M34 30l6 4M10 24h-5M43 24h-5"/></svg>',
    solder: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><path d="M8 40l24-24M30 8l8 8-6 6-8-8z"/><path d="M6 34l8 8"/></svg>',
    net: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><circle cx="24" cy="24" r="4" fill="#0A0A0A"/><circle cx="10" cy="12" r="3.5"/><circle cx="38" cy="12" r="3.5"/><circle cx="10" cy="36" r="3.5"/><circle cx="38" cy="36" r="3.5"/><path d="M13 14l7 8M35 14l-7 8M13 34l7-8M35 34l-7-8"/></svg>',
    av: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><rect x="7" y="14" width="34" height="20" rx="3"/><path d="M20 19l9 5-9 5z" fill="#0A0A0A" stroke="none"/></svg>',
    home: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><path d="M8 24l16-14 16 14"/><path d="M12 22v16h24V22"/><path d="M24 38v-9"/><path d="M19 30a5 5 0 0 1 10 0"/></svg>'
  };
  const CARD_BG = ['bg-pink', 'bg-yellow', 'bg-blue', 'bg-lime', 'bg-orange', 'bg-purple'];
  const $ = (s, r = document) => r.querySelector(s);

  /* ---- 难度等级 / 预计耗时 / 登神进度 ---- */
  const LEVELS = { 1: '入门', 2: '基础', 3: '进阶', 4: '高阶', 5: '大师' };
  const levelInfo = (l) => { const lv = Math.min(5, Math.max(1, l || 1)); return { lv, name: LEVELS[lv] }; };
  const readingTime = (content) => {
    const chars = (content || '').replace(/[\s]/g, '').length;
    return Math.max(1, Math.round(chars / 350));
  };
  const READ_KEY = 'ysy_read_posts';
  function getReadSet() {
    try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function markRead(id) {
    const s = getReadSet();
    if (s.has(id)) return false;
    s.add(id);
    try { localStorage.setItem(READ_KEY, JSON.stringify([...s])); } catch (e) {}
    return true;
  }
  function renderProgress() {
    const el = $('#progress');
    if (!el) return;
    const total = DATA.posts.length;
    const read = getReadSet();
    const done = DATA.posts.filter((p) => read.has(p.id)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const full = done >= total && total > 0;
    el.innerHTML = `
      <div class="sec-head"><span class="kicker">LEVEL UP</span><h2>登神进度</h2></div>
      <div class="card bg-yellow prog reveal">
        <div class="prog-top"><span class="mono">已读 ${done} / ${total} 篇</span><span class="mono">${pct}%</span></div>
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
        <p class="prog-tip">${full
          ? '🎉 本阶已登顶！去后台写一篇新笔记，开启下一阶。'
          : '每读一篇，长阶就往上登一级。今天比你昨天强一点，就够了。'}</p>
      </div>`;
  }

  let DATA = null;
  const catName = (id) => ((DATA.site.categories.find((c) => c.id === id)) || {}).name || id;

  /* ---- 登神长阶路线图：按 Lv1→Lv5 分层阶梯，已读高亮 ---- */
  function renderRoadmap() {
    const el = $('#roadmap');
    if (!el) return;
    const read = getReadSet();
    const withIdx = DATA.posts.map((p, i) => ({ p, i }));
    const groups = [1, 2, 3, 4, 5].map((lv) => ({ lv, name: LEVELS[lv], posts: withIdx.filter((x) => levelInfo(x.p.level).lv === lv) }));
    el.innerHTML = groups.filter((g) => g.posts.length).map((g) => `
      <div class="rung">
        <div class="rung-head">
          <span class="lv-badge lv-${g.lv}">Lv.${g.lv}</span>
          <b>${g.name}</b>
          <span class="rcount">${g.posts.length} 课</span>
        </div>
        <div class="rung-chips">${g.posts.map((x) => {
          const no = String(x.i + 1).padStart(2, '0');
          const done = read.has(x.p.id);
          return `<a class="rchip${done ? ' done' : ''}" href="#/post/${x.p.id}" title="${escapeAttr(x.p.title)}"><i>${no}</i>${escapeHtml(x.p.title)}${done ? '<em>✓</em>' : ''}</a>`;
        }).join('')}</div>
      </div>`).join('');
  }

  /* ---- 主题 ---- */
  function loadTheme() {
    const t = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
    $('#themeBtn').textContent = t === 'dark' ? '☀' : '🌙';
  }
  function toggleTheme() {
    const nx = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nx);
    localStorage.setItem('theme', nx);
    $('#themeBtn').textContent = nx === 'dark' ? '☀' : '🌙';
    if (window.Motion && window.Motion.ready) window.Motion.pop($('#themeBtn'));
  }

  /* ---- 渲染首页骨架（结构已在 index.html，这里填充内容） ---- */
  function renderShell() {
    const s = DATA.site;
    $('#brand').innerHTML = ICONS.chip + '<span>夜神月 · IoT</span>';
    $('#slogan').textContent = s.slogan;
    $('#tech').innerHTML = s.techStack.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    $('#stats').innerHTML = s.stats.map((st, i) =>
      `<div class="card bg-${['yellow', 'blue', 'lime'][i % 3]} reveal"><div class="num">${escapeHtml(st.num)}</div><div class="lbl">${escapeHtml(st.label)}</div></div>`).join('');
    $('#aboutText').textContent = s.about;
    $('#cats').innerHTML = s.categories.map((c, i) =>
      `<a class="card cat ${CARD_BG[i % 6]} reveal" href="#/cat/${c.id}">
        ${ICONS[c.icon] || ICONS.chip}<h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.desc || '')}</p></a>`).join('');
    $('#tagcloud').innerHTML = s.tags.map((t, i) =>
      `<a class="${['t-s', 't-m', 't-l'][i % 3]}" href="#/tag/${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('');
    $('#ctaEmail').textContent = 'EMAIL';
    $('#ctaEmail').href = 'mailto:' + (s.contact.email || '');
    $('#ctaGithub').href = s.contact.github || '#';
    $('#projList').innerHTML = (s.contact.projects || []).map((p) =>
      `<a class="btn alt" href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`).join(' ');
    $('#footEmail').textContent = s.contact.email || '';
    $('#footEmail').href = 'mailto:' + (s.contact.email || '');
    $('#footGithub').href = s.contact.github || '#';
    $('#links').innerHTML = (s.friendLinks || []).map((l, i) =>
      `<a class="card ${CARD_BG[i % 6]} reveal" href="${escapeAttr(l.url)}" target="_blank" rel="noopener"><h3>${escapeHtml(l.name)}</h3><p>${escapeHtml(l.desc || '')}</p></a>`).join('')
      || '<p class="hint">暂无友链，可在后台「站点设置」里添加。</p>';
    $('#navLinks').innerHTML = [
      ['#/', '首页'], ['#cats', '栏目'], ['#tags', '标签'], ['/admin', '后台管理']
    ].map(([h, t]) => `<a href="${h}" data-nav="${h}">${t}</a>`).join('');
    $('#navLinks').querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', (e) => {
        const t = a.getAttribute('data-nav');
        if (t.startsWith('#cats') || t.startsWith('#tags')) {
          e.preventDefault();
          if (location.hash && location.hash !== '#/') location.hash = '#/';
          setTimeout(() => { const el = document.getElementById(t.slice(1)); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60);
        }
      });
    });
    showList('全部文章', DATA.posts, true);
    bindSearch();
    observeReveal();
    renderProgress();
    renderRoadmap();
    const tline = $('#termLine');
    if (tline) {
      if (window.Motion && window.Motion.ready) window.Motion.typeLine(tline);
      else tline.textContent = tline.dataset.text || '';
    }
    if (window.Motion && window.Motion.ready) {
      window.Motion.heroIn();
      window.Motion.tilt(document);
    }
  }

  /* ---- 文章卡片 / 列表 ---- */
  function postCard(p, feat) {
    const lv = levelInfo(p.level);
    const rt = readingTime(p.content);
    const isRead = getReadSet().has(p.id);
    return `<article class="card post ${feat ? 'feat' : ''} reveal" data-id="${p.id}">
      <div class="meta">
        <span class="cat-chip">${escapeHtml(catName(p.category))}</span>
        <span class="lv-badge lv-${lv.lv}">Lv.${lv.lv} ${lv.name}</span>
        <span>${escapeHtml(p.date)}</span>
        ${isRead ? '<span class="read-chip">✓ 已读</span>' : ''}
      </div>
      <h3>${escapeHtml(p.title)}</h3>
      <p class="ex">${escapeHtml(p.excerpt || '')}</p>
      <div class="foot">
        <span class="rt mono">⏱ 约 ${rt} 分钟</span>
        ${(p.tags || []).map((t) => `<span class="ptag">#${escapeHtml(t)}</span>`).join('')}
      </div>
    </article>`;
  }
  function showList(title, list, isHome, head) {
    $('#postTitle').textContent = title;
    const lh = $('#listHead');
    if (head) {
      lh.innerHTML = `<div class="ch-icon">${ICONS[head.icon] || ICONS.chip}</div>
        <div><h3>${escapeHtml(head.title)}</h3><p>${escapeHtml(head.desc || '')}</p>
        <span class="count">${head.count} 篇文章</span></div>`;
      lh.hidden = false;
    } else { lh.hidden = true; lh.innerHTML = ''; }
    const feats = isHome ? list.filter((p) => p.featured).slice(0, 1) : [];
    const rest = list.filter((p) => !feats.includes(p));
    $('#posts').innerHTML = feats.concat(rest).map((p, i) => postCard(p, i === 0 && isHome)).join('')
      || '<p class="hint">没有匹配的文章。</p>';
    bindPostClicks();
  }
  function bindPostClicks() {
    $('#posts').querySelectorAll('.post').forEach((el) =>
      el.addEventListener('click', () => { location.hash = '#/post/' + el.dataset.id; }));
  }
  function applySearch(q) {
    const list = q ? DATA.posts.filter((p) =>
      (p.title + ' ' + (p.excerpt || '') + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q)) : DATA.posts;
    showList(q ? '搜索：' + q : '全部文章', list, !q, q ? { icon: 'wave', title: '搜索结果', desc: '关键词「' + q + '」', count: list.length } : null);
  }
  function bindSearch() {
    const si = $('#searchInput');
    if (si) si.addEventListener('input', (e) => applySearch(e.target.value.trim().toLowerCase()));
  }

  /* ---- 视图切换（显式状态，不依赖 DOM 探测） ---- */
  function viewHome() {
    $('#reader').hidden = true;
    $('#home').hidden = false;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '夜神月 · 物联网技术博客';
    showList('全部文章', DATA.posts, true);
    bindSearch();
    renderProgress();
    renderRoadmap();
    if (window.Motion && window.Motion.ready) {
      window.Motion.progressIn();   /* 先标记进度卡，再让 reveal 跳过它 */
      window.Motion.roadmapIn();
      window.Motion.reveal(document);
      window.Motion.swapIn($('#home'));
    } else {
      observeReveal();
    }
  }
  function viewCat(id) {
    const c = DATA.site.categories.find((x) => x.id === id);
    if (!c) { viewHome(); return; }
    const list = DATA.posts.filter((p) => p.category === id);
    $('#reader').hidden = true; $('#home').hidden = false;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '栏目：' + c.name + ' · 夜神月博客';
    showList('栏目：' + c.name, list, false, { icon: c.icon, title: c.name, desc: c.desc, count: list.length });
    if (window.Motion && window.Motion.ready) window.Motion.reveal(document);
    else observeReveal();
    $('#cats-sec').scrollIntoView({ behavior: 'smooth' });
  }
  function viewTag(t) {
    const list = DATA.posts.filter((p) => (p.tags || []).includes(t));
    $('#reader').hidden = true; $('#home').hidden = false;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '标签：#' + t + ' · 夜神月博客';
    showList('标签：#' + t, list, false, { icon: 'wave', title: '#' + t, desc: '包含标签「' + t + '」的文章', count: list.length });
    if (window.Motion && window.Motion.ready) window.Motion.reveal(document);
    else observeReveal();
    $('#posts-sec').scrollIntoView({ behavior: 'smooth' });
  }
  function viewArticle(id) {
    const p = DATA.posts.find((x) => x.id === id);
    if (!p) { location.hash = '#/'; return; }
    const lv = levelInfo(p.level);
    const rt = readingTime(p.content);
    const rel = DATA.posts.filter((x) => x.id !== p.id && (x.category === p.category || (x.tags || []).some((t) => (p.tags || []).includes(t)))).slice(0, 3);
    const relHtml = rel.length ? `<section class="rel"><h3>相关文章</h3><div class="posts">${rel.map((x) => postCard(x, false)).join('')}</div></section>` : '';
    const idx = DATA.posts.indexOf(p);
    const prevPost = DATA.posts[idx - 1], nextPost = DATA.posts[idx + 1];
    const pnHtml = `<nav class="pn-nav">
      ${prevPost ? `<a class="btn ghost" href="#/post/${prevPost.id}">← 上一课</a>` : '<span></span>'}
      <span class="pn-count">第 ${idx + 1} / ${DATA.posts.length} 课</span>
      ${nextPost ? `<a class="btn ghost" href="#/post/${nextPost.id}">下一课 →</a>` : '<span></span>'}
    </nav>`;
    $('#reader').innerHTML = `
      <div class="article wrap">
        <a class="btn ghost back" href="#/">← 返回列表</a>
        <div class="meta">
          <span class="cat-chip">${escapeHtml(catName(p.category))}</span>
          <span class="lv-badge lv-${lv.lv}">Lv.${lv.lv} ${lv.name}</span>
          <span class="rt mono">⏱ 约 ${rt} 分钟</span>
          <span>${escapeHtml(p.date)}</span>
        </div>
        <h1>${escapeHtml(p.title)}</h1>
        <div class="md">${MD.render(p.content)}</div>
        <div class="meta" style="margin-top:24px">${(p.tags || []).map((t) => `<a class="ptag" href="#/tag/${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join('')}</div>
        ${pnHtml}
        ${relHtml}
      </div>`;
    $('#home').hidden = true;
    $('#reader').hidden = false;
    if ($('#readbar')) $('#readbar').hidden = false;
    document.title = p.title + ' · 夜神月博客';
    window.scrollTo(0, 0);
    if (window.Motion && window.Motion.ready) {
      window.Motion.swapIn($('#reader'));
      window.Motion.readerIn();
      window.Motion.reveal($('#reader'));
      window.Motion.readProgress('.article');
    }
    const changed = markRead(p.id);
    renderProgress();
    if (changed) { /* 进度已更新，下次回首页即可见 */ }
    $('#reader').querySelectorAll('.rel .post').forEach((el) =>
      el.addEventListener('click', () => { location.hash = '#/post/' + el.dataset.id; }));
    bindArticleExtras();
  }

  /* ---- 文章页增强：目录 TOC / 复制代码 / 图片灯箱 ---- */
  function bindArticleExtras() {
    const article = $('#reader .article');
    if (!article) return;
    /* 目录（>=3 个标题才生成，大屏右侧浮动） */
    const heads = Array.from(article.querySelectorAll('.md h2, .md h3'));
    if (heads.length >= 3) {
      const links = heads.map((h, i) => {
        h.id = 'sec-' + i;
        const cls = h.tagName.toLowerCase() === 'h3' ? 'toc-h3' : 'toc-h2';
        return `<a class="${cls}" data-sec="sec-${i}">${escapeHtml(h.textContent)}</a>`;
      }).join('');
      const toc = document.createElement('aside');
      toc.className = 'toc';
      toc.innerHTML = '<div class="toc-t">目录 ▾</div>' + links;
      toc.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
        const t = document.getElementById(a.dataset.sec);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
      article.appendChild(toc);
      if (window.Motion && window.Motion.ready) window.Motion.tocHighlight(article);
    }
    /* 代码块一键复制（先取文本再插按钮，避免按钮文字混入复制内容） */
    article.querySelectorAll('.md pre').forEach((pre) => {
      const code = pre.querySelector('code');
      const text = (code || pre).textContent;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '已复制 ✓';
          setTimeout(() => { btn.textContent = '复制'; }, 1600);
        }).catch(() => { btn.textContent = '复制失败'; });
      });
      pre.appendChild(btn);
    });
    /* 图片：懒加载 + 点击灯箱 */
    const lb = $('#lightbox');
    article.querySelectorAll('.md img').forEach((img) => {
      img.loading = 'lazy';
      img.addEventListener('click', () => {
        if (!lb) return;
        lb.querySelector('img').src = img.src;
        lb.hidden = false;
      });
    });
  }

  /* ---- 路由 ---- */
  function setNavActive(h) {
    $('#navLinks').querySelectorAll('a').forEach((a) => {
      const t = a.getAttribute('data-nav');
      a.classList.toggle('active', t === h || (t.startsWith('#/') && h.startsWith(t) && t !== '#/'));
    });
  }
  function route() {
    if (window.Motion && window.Motion.ready) window.Motion.killAll();
    const h = location.hash || '#/';
    setNavActive(h);
    if (h.startsWith('#/post/')) viewArticle(h.split('/')[2]);
    else if (h.startsWith('#/cat/')) viewCat(h.split('/')[2]);
    else if (h.startsWith('#/tag/')) viewTag(decodeURIComponent(h.split('/')[2]));
    else viewHome();
  }

  /* ---- 滚动揭示 ---- */
  function observeReveal() {
    if (window.Motion && window.Motion.ready) { window.Motion.reveal(document); return; }
    const els = document.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((e) => e.classList.add('in')); return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---- 初始化 ---- */
  async function init() {
    loadTheme();
    $('#themeBtn').addEventListener('click', toggleTheme);
    try {
      const r = await fetch('/api/site');
      DATA = await r.json();
    } catch (e) {
      $('#home').innerHTML = '<p style="padding:40px">加载失败，请确认服务器已启动（node server.js）。</p>';
      return;
    }
    renderShell();
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', (e) => {
      /* 灯箱：ESC 关闭 */
      const lb = $('#lightbox');
      if (lb && !lb.hidden && e.key === 'Escape') { lb.hidden = true; return; }
      const inField = /INPUT|TEXTAREA/.test(e.target.tagName);
      /* 首页快捷键：/ 聚焦搜索框 */
      if (e.key === '/' && !inField && $('#reader').hidden) {
        e.preventDefault();
        const si = $('#searchInput');
        if (si) { si.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => si.focus({ preventScroll: true }), 320); }
        return;
      }
      /* 文章页快捷键：← → 翻上一课/下一课 */
      if ($('#reader').hidden || inField) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const m = location.hash.match(/^#\/post\/(.+)$/);
      if (!m) return;
      const idx = DATA.posts.findIndex((x) => x.id === m[1]);
      if (idx < 0) return;
      const nx = DATA.posts[idx + (e.key === 'ArrowRight' ? 1 : -1)];
      if (nx) location.hash = '#/post/' + nx.id;
    });
    /* 返回顶部按钮 */
    const tt = $('#toTop');
    if (tt) {
      tt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      window.addEventListener('scroll', () => {
        const show = window.scrollY > 600;
        if (show && tt.hidden) { tt.hidden = false; if (window.Motion && window.Motion.ready) window.Motion.pop(tt); }
        else if (!show && !tt.hidden) tt.hidden = true;
      }, { passive: true });
    }
    route();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
