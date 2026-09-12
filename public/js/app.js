/* 夜神月博客 · 前端逻辑 */
(function () {
  const ICONS = {
    chip: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><rect x="10" y="10" width="28" height="28" rx="3"/><rect x="18" y="18" width="12" height="12" fill="#0A0A0A"/><path d="M16 4v6M32 4v6M16 38v6M32 38v6M4 16h6M4 32h6M38 16h6M38 32h6"/></svg>',
    wave: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><path d="M4 24q6-14 10 0t10 0 10 0 10 0"/></svg>',
    cloud: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><path d="M14 34a9 9 0 0 1 0-18 11 11 0 0 1 21 3 7 7 0 0 1-2 15z"/></svg>',
    bug: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><ellipse cx="24" cy="24" rx="10" ry="13"/><path d="M24 11v26M14 18l-6-4M34 18l6-4M14 30l-6 4M34 30l6 4M10 24h-5M43 24h-5"/></svg>',
    solder: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="#0A0A0A" stroke-width="3"><path d="M8 40l24-24M30 8l8 8-6 6-8-8z"/><path d="M6 34l8 8"/></svg>'
  };
  const CARD_BG = ['bg-pink', 'bg-yellow', 'bg-blue', 'bg-lime', 'bg-orange', 'bg-purple'];
  const $ = (s, r = document) => r.querySelector(s);

  let DATA = null;
  let homeHTML = '';
  const catName = (id) => (DATA.site.categories.find(c => c.id === id) || {}).name || id;

  function loadTheme() {
    const t = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', t);
    $('#themeBtn').textContent = t === 'dark' ? '☀' : '🌙';
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const nx = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nx);
    localStorage.setItem('theme', nx);
    $('#themeBtn').textContent = nx === 'dark' ? '☀' : '🌙';
  }

  function renderShell() {
    const s = DATA.site;
    $('#brand').innerHTML = ICONS.chip + '<span>夜神月 · IoT</span>';
    $('#slogan').textContent = s.slogan;
    $('#tech').innerHTML = s.techStack.map(t => `<span class="tag">${t}</span>`).join('');
    $('#stats').innerHTML = s.stats.map((st, i) =>
      `<div class="card bg-${['yellow', 'blue', 'lime'][i % 3]} reveal"><div class="num">${st.num}</div><div class="lbl">${st.label}</div></div>`).join('');
    $('#aboutText').textContent = s.about;
    $('#cats').innerHTML = s.categories.map((c, i) =>
      `<a class="card cat ${CARD_BG[i % 6]} reveal" href="#/cat/${c.id}">
        ${ICONS[c.icon] || ICONS.chip}
        <h3>${c.name}</h3><p>${c.desc}</p></a>`).join('');
    const counts = {};
    s.tags.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const sizes = ['t-s', 't-m', 't-l'];
    $('#tagcloud').innerHTML = s.tags.map((t, i) =>
      `<a class="${sizes[i % 3]}" href="#/tag/${encodeURIComponent(t)}">${t}</a>`).join('');
    $('#ctaEmail').textContent = s.contact.email;
    $('#ctaEmail').href = 'mailto:' + s.contact.email;
    $('#ctaGithub').href = s.contact.github;
    $('#projList').innerHTML = s.contact.projects.map(p =>
      `<a class="btn alt" href="${p.url}" target="_blank" rel="noopener">${p.name}</a>`).join(' ');
    $('#footEmail').textContent = s.contact.email;
    $('#footGithub').href = s.contact.github;
    $('#links').innerHTML = (s.friendLinks || []).map((l, i) =>
      `<a class="card ${CARD_BG[i % 6]} reveal" href="${l.url}" target="_blank" rel="noopener"><h3>${l.name}</h3><p>${l.desc || ''}</p></a>`).join('')
      || '<p class="hint">暂无友链，可在后台「站点设置」里添加。</p>';
    $('#navLinks').innerHTML = [
      ['#/', '首页'], ['#/cat/embedded', '栏目'], ['#/tag/ESP32', '标签'], ['/admin', '后台管理']
    ].map(([h, t]) => `<a href="${h}" data-nav="${h}">${t}</a>`).join('');

    renderPosts(DATA.posts, '精选文章', true);
    bindSearch();
    observeReveal();
  }

  let homeHtml = '';
  function captureHome() { homeHtml = $('#app').innerHTML; }

  function postCard(p, feat) {
    return `<article class="card post ${feat ? 'feat' : ''} reveal" data-id="${p.id}">
      <div class="meta"><span class="cat-chip">${catName(p.category)}</span><span>${p.date}</span></div>
      <h3>${p.title}</h3>
      <p class="ex">${p.excerpt}</p>
      <div class="foot">${(p.tags || []).map(t => `<span class="ptag">#${t}</span>`).join('')}</div>
    </article>`;
  }
  function renderPosts(list, title, isHome) {
    $('#postTitle').textContent = title || '精选文章';
    const feats = isHome ? list.filter(p => p.featured).slice(0, 1) : [];
    const rest = list.filter(p => !feats.includes(p));
    $('#posts').innerHTML = feats.concat(rest).map((p, i) => postCard(p, i === 0 && isHome)).join('') || '<p class="hint">没有匹配的文章。</p>';
    bindPostClicks();
  }
  function bindPostClicks() {
    $('#posts').querySelectorAll('.post').forEach(el =>
      el.addEventListener('click', () => location.hash = '#/post/' + el.dataset.id));
  }
  function applySearch(q) {
    let list = DATA.posts;
    if (q) list = list.filter(p => (p.title + ' ' + p.excerpt + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q));
    renderPosts(list, q ? '搜索：' + q : '精选文章', !q);
  }
  function bindSearch() {
    const si = $('#searchInput');
    if (si) si.addEventListener('input', e => applySearch(e.target.value.trim().toLowerCase()));
  }

  function renderArticle(id) {
    const p = DATA.posts.find(x => x.id === id);
    if (!p) { location.hash = '#/'; return; }
    $('#app').innerHTML = `
      <div class="article wrap">
        <a class="btn ghost back" href="#/">← 返回列表</a>
        <div class="meta"><span class="cat-chip">${catName(p.category)}</span><span>${p.date}</span></div>
        <h1>${p.title}</h1>
        <div class="md">${MD.render(p.content)}</div>
        <div class="meta" style="margin-top:24px">${(p.tags || []).map(t => `<span class="ptag">#${t}</span>`).join('')}</div>
      </div>`;
  }

  function restoreHome() {
    if (document.getElementById('posts')) return; // 已在首页
    $('#app').innerHTML = homeHtml;
    renderPosts(DATA.posts, '精选文章', true);
    bindSearch();
    observeReveal();
  }

  function setNavActive(h) {
    const nav = $('#navLinks'); if (!nav) return;
    nav.querySelectorAll('a').forEach(a => {
      const target = a.getAttribute('data-nav');
      const on = target === h || (target.startsWith('#/') && h.startsWith(target) && target !== '#/');
      a.classList.toggle('active', on);
    });
  }

  function route() {
    const h = location.hash || '#/';
    setNavActive(h);
    if (h.startsWith('#/post/')) {
      renderArticle(h.replace('#/post/', ''));
      window.scrollTo(0, 0);
    } else if (h.startsWith('#/cat/')) {
      restoreHome();
      const v = h.replace('#/cat/', '');
      renderPosts(DATA.posts.filter(p => p.category === v), '栏目：' + catName(v), false);
    } else if (h.startsWith('#/tag/')) {
      restoreHome();
      const v = decodeURIComponent(h.replace('#/tag/', ''));
      renderPosts(DATA.posts.filter(p => (p.tags || []).includes(v)), '标签：#' + v, false);
    } else {
      restoreHome();
    }
  }

  function observeReveal() {
    const els = document.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(e => e.classList.add('in')); return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(e => io.observe(e));
  }

  async function init() {
    loadTheme();
    $('#themeBtn').addEventListener('click', toggleTheme);
    try {
      const r = await fetch('/api/site');
      DATA = await r.json();
    } catch (e) {
      $('#app').innerHTML = '<p style="padding:40px">加载失败，请确认服务器已启动（node server.js）。</p>';
      return;
    }
    renderShell();
    captureHome();
    window.addEventListener('hashchange', route);
    route();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
