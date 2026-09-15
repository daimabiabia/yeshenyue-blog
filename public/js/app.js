/* 夜神月博客 · 前台逻辑（零依赖，视图状态版） */
(function () {
  'use strict';
  /* 图标用 currentColor，随主题自动适配（深色主题下浅色描边可见） */
  const ICONS = {
    chip: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><rect x="10" y="10" width="28" height="28" rx="3"/><rect x="18" y="18" width="12" height="12" fill="currentColor"/><path d="M16 4v6M32 4v6M16 38v6M32 38v6M4 16h6M4 32h6M38 16h6M38 32h6"/></svg>',
    wave: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 24q6-14 10 0t10 0 10 0 10 0"/></svg>',
    cloud: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M14 34a9 9 0 0 1 0-18 11 11 0 0 1 21 3 7 7 0 0 1-2 15z"/></svg>',
    bug: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><ellipse cx="24" cy="24" rx="10" ry="13"/><path d="M24 11v26M14 18l-6-4M34 18l6-4M14 30l-6 4M34 30l6 4M10 24h-5M43 24h-5"/></svg>',
    solder: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M8 40l24-24M30 8l8 8-6 6-8-8z"/><path d="M6 34l8 8"/></svg>',
    net: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><circle cx="24" cy="24" r="4" fill="currentColor"/><circle cx="10" cy="12" r="3.5"/><circle cx="38" cy="12" r="3.5"/><circle cx="10" cy="36" r="3.5"/><circle cx="38" cy="36" r="3.5"/><path d="M13 14l7 8M35 14l-7 8M13 34l7-8M35 34l-7-8"/></svg>',
    av: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><rect x="7" y="14" width="34" height="20" rx="3"/><path d="M20 19l9 5-9 5z" fill="currentColor" stroke="none"/></svg>',
    home: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M8 24l16-14 16 14"/><path d="M12 22v16h24V22"/><path d="M24 38v-9"/><path d="M19 30a5 5 0 0 1 10 0"/></svg>'
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
  const FOOT_KEY = 'ysy_footprints';
  const LIKE_KEY = 'ysy_liked_ids';
  const STAR_KEY = 'ysy_stars';
  function getStars() {
    try { return new Set(JSON.parse(localStorage.getItem(STAR_KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function isLiked(id) {
    try { return (JSON.parse(localStorage.getItem(LIKE_KEY) || '[]')).indexOf(id) >= 0; } catch (e) { return false; }
  }
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
  /* ---- 阅读足迹：记录最近浏览（去重置顶，最多留 20 条） ---- */
  function pushFootprint(id) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(FOOT_KEY) || '[]'); } catch (e) {}
    list = list.filter((x) => x.id !== id);
    list.unshift({ id, t: Date.now() });
    try { localStorage.setItem(FOOT_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
  }
  function getFootprints() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(FOOT_KEY) || '[]'); } catch (e) {}
    return list.map((x) => DATA.posts.find((p) => p.id === x.id)).filter(Boolean);
  }
  /* 「继续阅读」足迹卡：最新一篇大卡 + 历史小卡，无记录不显示 */
  function renderFootprints() {
    const sec = $('#footprint-sec'), el = $('#footprints');
    if (!sec || !el) return;
    const feet = getFootprints().slice(0, 3);
    if (!feet.length) { sec.hidden = true; el.innerHTML = ''; return; }
    const ago = (t) => {
      const m = Math.round((Date.now() - t) / 60000);
      if (m < 1) return '刚刚';
      if (m < 60) return m + ' 分钟前';
      const h = Math.round(m / 60);
      if (h < 24) return h + ' 小时前';
      return Math.round(h / 24) + ' 天前';
    };
    const card = (p, big, when) => {
      const lv = levelInfo(p.level);
      const color = CAT_COLOR[p.category] || 'blue';
      return `<a class="foot-card reveal in" href="#/post/${p.id}" style="--cat:var(--${color})">
        <span class="foot-icon">${big ? '📖' : '↩'}</span>
        <span class="foot-body">
          <span class="foot-kicker">${big ? '继续阅读 · 上次读到这里' : '最近阅读'}</span>
          <h3>${escapeHtml(p.title)}</h3>
          <span class="foot-meta"><span class="cat-chip">${escapeHtml(catName(p.category))}</span>
            <span>Lv.${lv.lv} ${lv.name}</span>${when ? `<span>${when}</span>` : ''}</span>
        </span>
        <span class="foot-go">→</span></a>`;
    };
    const list = feet.slice(1).map((p) => card(p, false, '')).join('');
    el.innerHTML = `<div class="sec-head"><span class="kicker">RESUME</span><h2>继续阅读</h2></div>
      ${card(feet[0], true, '阅读于 ' + ago(Date.now()))}
      ${list ? `<div class="foot-list" style="margin-top:10px">${list}</div>` : ''}`;
    sec.hidden = false;
  }

  /* ---- 随机一课：摇骰动画后跳转（排除当前篇） ---- */
  let rolling = false;
  function rollDice() {
    if (rolling || !DATA.posts.length) return;
    rolling = true;
    if (window.ACH) ACH.bump('ysy_dice_n', 10, 'dice10');
    const btn = $('#diceBtn');
    if (btn) btn.classList.add('rolling');
    const cur = (location.hash.match(/^#\/post\/([^/?]+)/) || [])[1];
    const pool = DATA.posts.filter((p) => p.id !== cur);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const label = $('#postTitle');
    let n = 0;
    const spin = setInterval(() => {
      if (label) label.textContent = '🎲 ' + DATA.posts[Math.floor(Math.random() * DATA.posts.length)].title;
      if (++n >= 8) {
        clearInterval(spin);
        if (btn) btn.classList.remove('rolling');
        rolling = false;
        if (pick) location.hash = '#/post/' + pick.id;
      }
    }, 70);
  }
  /* ---- 每日一读：按日期确定性轮换 ---- */
  function renderPickOfDay() {
    const sec = $('#pick-sec'), el = $('#pickCard');
    if (!sec || !el) return;
    if (!DATA.posts.length) { sec.hidden = true; return; }
    const day = Math.floor(Date.now() / 864e5);
    const p = DATA.posts[day % DATA.posts.length];
    const lv = levelInfo(p.level);
    const color = CAT_COLOR[p.category] || 'blue';
    el.innerHTML = `<a class="pick-card reveal in" href="#/post/${p.id}" style="--cat:var(--${color})">
      <span class="pick-badge">今日推荐</span>
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.excerpt || '')}</p>
      <span class="foot-meta"><span class="cat-chip">${escapeHtml(catName(p.category))}</span><span>Lv.${lv.lv} ${lv.name}</span><span>⏱ 约 ${readingTime(p.content)} 分钟</span></span>
      <span class="pick-go">去读 →</span></a>`;
    sec.hidden = false;
  }

  /* ---- 人气榜：按真实点赞数 TOP5（服务端 /api/likes） ---- */
  function renderHot() {
    const sec = $('#hot-sec'), el = $('#hotList');
    if (!sec || !el) return;
    fetch('/api/likes').then((r) => r.json()).then((d) => {
      const likes = d.likes || {};
      const top = DATA.posts.slice().sort((a, b) => (likes[b.id] || 0) - (likes[a.id] || 0)).slice(0, 5);
      const zero = top.every((p) => !(likes[p.id] > 0));
      el.innerHTML = top.map((p, i) => {
        const color = CAT_COLOR[p.category] || 'blue';
        return `<a class="hot-row reveal in" href="#/post/${p.id}" style="--cat:var(--${color})"><span class="hot-rank hot-${i + 1}">${i + 1}</span><span class="hot-title">${escapeHtml(p.title)}</span><span class="cat-chip">${escapeHtml(catName(p.category))}</span><span class="hot-n">${likes[p.id] || 0} 赞</span></a>`;
      }).join('');
      if (zero) el.insertAdjacentHTML('beforeend', '<p class="hot-tip">还没有人点赞——去文章页点亮第一颗 ❤</p>');
      sec.hidden = false;
    }).catch(() => { sec.hidden = true; });
  }

  /* ---- 我的收藏：本地星标文章 ---- */
  function renderFavs() {
    const sec = $('#fav-sec'), el = $('#favList');
    if (!sec || !el) return;
    const list = [...getStars()].map((id) => DATA.posts.find((p) => p.id === id)).filter(Boolean);
    if (!list.length) { sec.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = `<div class="sec-head"><span class="kicker">SAVED</span><h2>我的收藏</h2></div>` +
      list.map((p) => {
        const color = CAT_COLOR[p.category] || 'blue';
        const lv = levelInfo(p.level);
        return `<a class="foot-card reveal in" href="#/post/${p.id}" style="--cat:var(--${color})"><span class="foot-icon">★</span><span class="foot-body"><h3>${escapeHtml(p.title)}</h3><span class="foot-meta"><span class="cat-chip">${escapeHtml(catName(p.category))}</span><span>Lv.${lv.lv} ${lv.name}</span></span></span><span class="foot-go">→</span></a>`;
      }).join('');
    sec.hidden = false;
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
    if (window.SFX && SFX.enabled) SFX.whoosh();
    if (window.Motion && window.Motion.ready) window.Motion.pop($('#themeBtn'));
  }

  /* ---- 渲染首页骨架（结构已在 index.html，这里填充内容） ---- */
  function renderShell() {
    const s = DATA.site;
    $('#brand').innerHTML = ICONS.chip + '<span>夜神月 · IoT</span>';
    $('#slogan').textContent = s.slogan;
    $('#tech').innerHTML = s.techStack.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    /* stats：支持 dynamic:'posts'，数值自动跟随真实文章总数（不再写死） */
    const totalPosts = (DATA.posts || []).length;
    const catsCount = (s.categories || []).length;
    $('#stats').innerHTML = s.stats.map((st, i) => {
      let num = String(st.num);
      if (st.dynamic === 'posts' || num === '{posts}') num = String(totalPosts);
      else if (st.dynamic === 'cats' || num === '{cats}') num = String(catsCount);
      return `<div class="card bg-${['yellow', 'blue', 'lime'][i % 3]} reveal"><div class="num">${escapeHtml(num)}</div><div class="lbl">${escapeHtml(st.label)}</div></div>`;
    }).join('');
    /* 同步全站「文章数 / 方向数」文案：避免硬编码数字随内容增长而过时 */
    const catsNum = (s.categories || []).length;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content',
      (metaDesc.getAttribute('content') || '').replace(/\d+\s*节/, totalPosts + ' 节'));
    const termLine = document.getElementById('termLine');
    if (termLine && termLine.dataset.text) {
      termLine.dataset.text = termLine.dataset.text
        .replace(/\d+\s*节课/, totalPosts + ' 节课')
        .replace(/\d+\s*个(段位|专业方向)/, catsNum + ' 个专业方向');
    }
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
    const NAV = [['#/', '首页'], ['#cats', '栏目'], ['#tags', '标签'], ['#/archive', '归档'], ['#/drive', '网盘']];
    if (!window.IS_STATIC_BLOG) NAV.push(['/admin', '后台管理']);
    else { const fa = document.getElementById('footAdmin'); if (fa) fa.remove(); }
    $('#navLinks').innerHTML = NAV.map(([h, t]) => `<a href="${h}" data-nav="${h}">${t}</a>`).join('');
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
      window.Motion.magnet(document);
    }
  }

  /* ---- 文章卡片 / 列表 ---- */
  /* 栏目 → 主题色（注入 --cat，驱动卡片左侧色条） */
  const CAT_COLOR = {
    embedded: 'lime', protocol: 'blue', cloudedge: 'purple', pit: 'pink',
    hardware: 'orange', net: 'blue', av: 'purple', smart: 'lime',
  };
  function postCard(p, feat) {
    const lv = levelInfo(p.level);
    const rt = readingTime(p.content);
    const isRead = getReadSet().has(p.id);
    const color = CAT_COLOR[p.category] || 'blue';
    return `<article class="card post ${feat ? 'feat' : ''} ${isRead ? 'is-read' : ''} reveal"
      data-id="${escapeAttr(p.id)}" style="--cat:var(--${color})">
      ${feat ? '<span class="feat-flag">FEATURED</span>' : ''}
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
    const arch = $('#archive');
    if (arch) arch.hidden = true;
    const dv = $('#drive'); if (dv) dv.hidden = true;
    $('#home').hidden = false;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '夜神月 · 物联网技术博客';
    showList('全部文章', DATA.posts, true);
    bindSearch();
    renderProgress();
    renderRoadmap();
    renderFootprints();
    renderPickOfDay();
    renderHot();
    renderFavs();
    if (window.ACH) ACH.renderWall('#achWall');
    resetSeo();
    if (window.Motion && window.Motion.ready) {
      window.Motion.progressIn();   /* 先标记进度卡，再让 reveal 跳过它 */
      window.Motion.roadmapIn();
      window.Motion.reveal(document);
      window.Motion.secFx();        /* hero 视差 / sec-head 进场 / stats 计数 / CTA·标签云微旋转 */
      window.Motion.swapIn($('#home'));
    } else {
      observeReveal();
    }
  }
  /* ---- 归档视图：按年月分组的时间线 ---- */
  function viewArchive() {
    $('#reader').hidden = true;
    const arch = $('#archive');
    if (!arch) { viewHome(); return; }
    $('#home').hidden = true;
    arch.hidden = false;
    const dv = $('#drive'); if (dv) dv.hidden = true;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '归档 · 夜神月博客';
    resetSeo();
    const CAT_COLOR = { embedded: 'blue', protocol: 'purple', cloudedge: 'cyan', pit: 'red', hardware: 'orange', net: 'green', av: 'pink', smart: 'yellow' };
    const groups = {};
    for (const p of DATA.posts) {
      const ym = String(p.date || '').slice(0, 7) || '未知';
      (groups[ym] = groups[ym] || []).push(p);
    }
    const months = Object.keys(groups).sort().reverse();
    arch.innerHTML = '<section class="sec wrap"><div class="sec-head"><span class="kicker">ARCHIVE</span><h2>全部归档</h2></div>' +
      '<p class="hint" style="margin-bottom:18px">共 ' + DATA.posts.length + ' 篇 · ' + months.length + ' 个月份</p>' +
      months.map((ym) => {
        const [y, m] = ym.split('-');
        const items = groups[ym].map((p) => {
          const color = CAT_COLOR[p.category] || 'blue';
          return '<li><a class="arch-item" href="#/post/' + p.id + '">' +
            '<span class="arch-dot c-' + color + '"></span>' +
            '<span class="arch-title">' + escapeHtml(p.title) + '</span>' +
            '<span class="arch-meta">' + escapeHtml(catName(p.category)) + ' · ' + escapeHtml(p.date) + '</span></a></li>';
        }).join('');
        return '<div class="arch-group"><h3 class="arch-ym">' + y + ' 年 ' + parseInt(m, 10) + ' 月 <span class="hint">(' + groups[ym].length + ' 篇)</span></h3><ul class="arch-list">' + items + '</ul></div>';
      }).join('') + '</section>';
    if (window.Motion && window.Motion.ready) window.Motion.reveal(arch);
    window.scrollTo(0, 0);
  }

  /* ---- 资源网盘视图：目录树 + 文件列表 + 搜索 + 在线预览（访客可见可下载） ---- */
  const DRIVE = { files: null, meta: null, dir: '', q: '' };
  const DRIVE_TEXT = ['.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.c', '.h', '.cpp', '.hpp', '.py'];
  const DRIVE_IMG = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const driveURL = (f, act) => '/' + act + '?file=' + encodeURIComponent(f);
  function driveIcon(ext) {
    if (ext === '.md' || ext === '.txt') return '📝';
    if (ext === '.pdf') return '📕';
    if (ext === '.zip' || ext === '.7z') return '🗜';
    if (DRIVE_IMG.includes(ext)) return '🖼';
    if (['.c', '.h', '.cpp', '.hpp', '.py', '.ino'].includes(ext)) return '📄';
    if (['.hex', '.bin', '.elf'].includes(ext)) return '⚙';
    return '📦';
  }
  function driveChildren(dir) {
    const prefix = dir ? dir + '/' : '';
    return DRIVE.files.filter((f) => {
      if (f.path === dir || !f.path.startsWith(prefix)) return false;
      return !f.path.slice(prefix.length).includes('/');
    });
  }
  async function viewDrive() {
    const el = $('#drive');
    $('#reader').hidden = true;
    $('#home').hidden = true;
    const arch = $('#archive'); if (arch) arch.hidden = true;
    if ($('#readbar')) $('#readbar').hidden = true;
    el.hidden = false;
    document.title = '资源网盘 · 夜神月博客';
    resetSeo();
    if (!DRIVE.files) {
      el.innerHTML = '<section class="sec wrap"><div class="sec-head"><span class="kicker">DRIVE</span><h2>资源网盘</h2></div><p class="hint">正在装载文件索引…</p></section>';
      try {
        const r = await fetch('/api/drive').catch(() => null);
        if (!r || !r.ok) throw new Error('bad');
        const j = await r.json();
        DRIVE.files = j.files || [];
        DRIVE.meta = j;
      } catch (e) {
        el.innerHTML = '<section class="sec wrap"><div class="sec-head"><span class="kicker">DRIVE</span><h2>资源网盘</h2></div><p class="hint">网盘加载失败，请确认服务器已启动。</p></section>';
        return;
      }
    }
    renderDrive();
    window.scrollTo(0, 0);
  }
  function renderDrive() {
    const el = $('#drive');
    const m = DRIVE.meta || {};
    /* 目录树：按路径深度缩进 */
    const tree = (DRIVE.files || []).filter((f) => f.type === 'dir').map((d) => {
      const depth = d.path.split('/').length - 1;
      return `<a class="dtree-item mono${DRIVE.dir === d.path ? ' on' : ''}" data-dir="${escapeAttr(d.path)}" style="padding-left:${10 + depth * 18}px" title="${escapeAttr(d.path)}">▸ ${escapeHtml(d.name)}/</a>`;
    }).join('');
    /* 面包屑 */
    const segs = DRIVE.dir ? DRIVE.dir.split('/') : [];
    let acc = '';
    const crumbs = `<a class="dcrumb" data-dir="">~/drive</a>` + segs.map((s) => {
      acc = acc ? acc + '/' + s : s;
      return ` / <a class="dcrumb" data-dir="${escapeAttr(acc)}">${escapeHtml(s)}</a>`;
    }).join('');
    /* 文件行：搜索时全局过滤，否则列当前目录直属子项 */
    let rows;
    if (DRIVE.q) {
      rows = DRIVE.files.filter((f) => f.type === 'file' && f.name.toLowerCase().includes(DRIVE.q));
      rows.sort((a, b) => a.path.localeCompare(b.path));
    } else {
      rows = driveChildren(DRIVE.dir).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)));
    }
    const rowHtml = rows.map((f) => {
      if (f.type === 'dir') {
        return `<tr class="drow is-dir" data-dir="${escapeAttr(f.path)}">
          <td class="d-name">📁 <b>${escapeHtml(f.name)}/</b></td><td class="d-size mono">—</td><td class="d-date mono">—</td><td class="d-act mono">进入 →</td></tr>`;
      }
      const canPreview = DRIVE_TEXT.includes(f.ext);
      return `<tr class="drow${canPreview ? ' is-text' : ''}" data-file="${escapeAttr(f.path)}" data-ext="${escapeAttr(f.ext)}">
        <td class="d-name">${driveIcon(f.ext)} ${canPreview ? `<b class="d-open">${escapeHtml(f.name)}</b>` : escapeHtml(f.name)}</td>
        <td class="d-size mono">${fmtSize(f.size)}</td>
        <td class="d-date mono">${f.mtime ? new Date(f.mtime).toISOString().slice(0, 10) : ''}</td>
        <td class="d-act"><a class="btn mini alt" href="${driveURL(f.path, 'api/drive/download')}" download>⬇ 下载</a></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="hint" style="padding:18px">空目录，或没有匹配的文件。</td></tr>';
    el.innerHTML = `<section class="sec wrap">
      <div class="sec-head"><span class="kicker">DRIVE</span><h2>资源网盘</h2>
        <span class="search-term mono" style="margin-left:auto;max-width:220px"><input id="driveSearch" placeholder="> 搜索文件…" value="${escapeAttr(DRIVE.q)}" aria-label="搜索文件" /></span></div>
      <p class="hint" style="margin-bottom:16px">共 ${m.fileCount || 0} 个文件 · ${m.dirCount || 0} 个目录 · ${fmtSize(m.totalSize || 0)} — 点击文件名在线预览，⬇ 直接下载</p>
      <div class="drive-layout">
        <aside class="drive-tree">
          <a class="dtree-item mono${DRIVE.dir === '' ? ' on' : ''}" data-dir="">▸ 根目录/</a>
          ${tree}
        </aside>
        <div class="drive-main">
          <div class="d-crumbs mono">${crumbs}</div>
          <table class="drive-table"><thead><tr><th>文件名</th><th>大小</th><th>修改时间</th><th>操作</th></tr></thead><tbody>${rowHtml}</tbody></table>
        </div>
      </div></section>`;
    /* 事件绑定 */
    el.querySelectorAll('[data-dir]').forEach((a) => a.addEventListener('click', () => {
      DRIVE.dir = a.getAttribute('data-dir'); DRIVE.q = ''; renderDrive();
    }));
    el.querySelectorAll('.drow.is-text').forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return; // 点下载按钮不触发预览
      openDrivePreview(tr.dataset.file, tr.dataset.ext);
    }));
    const si = $('#driveSearch');
    if (si) {
      si.addEventListener('input', () => { DRIVE.q = si.value.trim().toLowerCase(); renderDrive(); const n = $('#driveSearch'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
    }
  }
  /* 在线预览弹层：md 渲染 / 文本直出 / 图片展示，其余引导下载 */
  async function openDrivePreview(fpath, ext) {
    const box = $('#drivePreview');
    if (!box) return;
    $('#dpPath').textContent = '~/drive/' + fpath;
    $('#dpDownload').href = driveURL(fpath, 'api/drive/download');
    const body = $('#dpBody');
    body.innerHTML = '<p class="hint">加载中…</p>';
    box.hidden = false;
    if (DRIVE_IMG.includes(ext)) {
      body.innerHTML = `<img src="${driveURL(fpath, 'api/drive/download')}" alt="${escapeAttr(fpath)}" style="max-width:100%">`;
      return;
    }
    try {
      const r = await fetch(driveURL(fpath, 'api/drive/raw'));
      if (!r.ok) throw new Error('bad');
      const text = await r.text();
      if (ext === '.md' && window.MD) {
        body.innerHTML = '<div class="md dp-md">' + MD.render(text) + '</div>';
      } else {
        body.innerHTML = '<pre class="dp-pre mono">' + escapeHtml(text) + '</pre>';
      }
    } catch (e) {
      body.innerHTML = '<p class="hint">预览加载失败，请直接下载。</p>';
    }
  }
  function closeDrivePreview() { const el = $('#drivePreview'); if (el) el.hidden = true; }
  function viewCat(id) {
    const c = DATA.site.categories.find((x) => x.id === id);
    if (!c) { viewHome(); return; }
    const list = DATA.posts.filter((p) => p.category === id);
    $('#reader').hidden = true; $('#home').hidden = false;
    const arch = $('#archive'); if (arch) arch.hidden = true;
    const dv = $('#drive'); if (dv) dv.hidden = true;
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
    const arch = $('#archive'); if (arch) arch.hidden = true;
    const dv = $('#drive'); if (dv) dv.hidden = true;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '标签：#' + t + ' · 夜神月博客';
    showList('标签：#' + t, list, false, { icon: 'wave', title: '#' + t, desc: '包含标签「' + t + '」的文章', count: list.length });
    if (window.Motion && window.Motion.ready) window.Motion.reveal(document);
    else observeReveal();
    $('#posts-sec').scrollIntoView({ behavior: 'smooth' });
  }
  function viewArticle(id) {
    /* 支持 id 与 slug 两种寻址：优先精确匹配 id，其次 slug（便于用语义化链接分享） */
    const key = decodeURIComponent(id || '');
    const p = DATA.posts.find((x) => x.id === key) || DATA.posts.find((x) => x.slug === key);
    if (!p) { location.hash = '#/'; return; }
    const lv = levelInfo(p.level);
    const rt = readingTime(p.content);
    const words = (p.content || '').replace(/\s/g, '').length;
    const rel = DATA.posts.filter((x) => x.id !== p.id && (x.category === p.category || (x.tags || []).some((t) => (p.tags || []).includes(t)))).slice(0, 3);
    const relHtml = rel.length ? `<section class="rel"><h3>相关文章</h3><div class="posts">${rel.map((x) => postCard(x, false)).join('')}</div></section>` : '';
    const idx = DATA.posts.indexOf(p);
    const prevPost = DATA.posts[idx - 1], nextPost = DATA.posts[idx + 1];
    const pnHtml = `<nav class="pn-nav">
      ${prevPost ? `<a class="btn ghost" href="#/post/${prevPost.id}">← 上一课</a>` : '<span></span>'}
      <span class="pn-count">第 ${idx + 1} / ${DATA.posts.length} 课</span>
      ${nextPost ? `<a class="btn ghost" href="#/post/${nextPost.id}">下一课 →</a>` : '<span></span>'}
    </nav>`;
    const archEl = $('#archive'); if (archEl) archEl.hidden = true;
    const dvEl = $('#drive'); if (dvEl) dvEl.hidden = true;
    $('#reader').innerHTML = `
      <div class="article wrap">
        <a class="btn ghost back" href="#/">← 返回列表</a>
        <div class="meta">
          <span class="cat-chip">${escapeHtml(catName(p.category))}</span>
          <span class="lv-badge lv-${lv.lv}">Lv.${lv.lv} ${lv.name}</span>
          <span class="rt mono">⏱ 约 ${rt} 分钟</span>
          <span class="word-chip mono">约 ${words.toLocaleString()} 字</span>
          <span>${escapeHtml(p.date)}</span>
          <button type="button" class="copy-link" title="复制本文链接">🔗 复制链接</button>
          <button type="button" class="copy-link like-btn" id="likeBtn" title="给这篇点个赞">♡ …</button>
          <button type="button" class="copy-link star-btn" id="starBtn" title="收藏本文">☆ 收藏</button>
        </div>
        <div class="file-path mono" aria-hidden="true"><span class="fp-dots"><i></i><i></i><i></i></span>~/blog/${escapeHtml(p.category)}/${escapeHtml(p.slug || p.id)}.md<span class="fp-branch">main</span></div>
        <h1>${escapeHtml(p.title)}</h1>
        <div class="md">${MD.render(stripLeadingH1(p.content))}</div>
        <div class="meta" style="margin-top:24px">${(p.tags || []).map((t) => `<a class="ptag" href="#/tag/${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join('')}</div>
        ${pnHtml}
        ${relHtml}
        <section class="cmt" id="cmtSec">
          <h3>💬 留言板 <span class="cmt-count" id="cmtCount"></span></h3>
          <div class="cmt-form">
            <input id="cmtName" maxlength="24" placeholder="昵称（可留空，默认匿名访客）" />
            <textarea id="cmtText" maxlength="500" rows="3" placeholder="写下你的想法、疑问或踩坑补充…"></textarea>
            <div class="cmt-actions"><button type="button" class="btn" id="cmtSend">发表留言</button><span class="cmt-tip" id="cmtTip"></span></div>
          </div>
          <div class="cmt-list" id="cmtList"><p class="cmt-empty">留言加载中…</p></div>
        </section>
      </div>`;
    $('#home').hidden = true;
    $('#reader').hidden = false;
    if ($('#readbar')) $('#readbar').hidden = false;
    document.title = p.title + ' · 夜神月博客';
    applySeo(p);
    window.scrollTo(0, 0);
    if (window.Motion && window.Motion.ready) {
      window.Motion.swapIn($('#reader'));
      window.Motion.readerIn();
      window.Motion.reveal($('#reader'));
      window.Motion.readProgress('.article');
      window.Motion.imgReveal($('#reader'));
      window.Motion.magnet($('#reader'));
    }
    const changed = markRead(p.id);
    pushFootprint(p.id);
    if (window.ACH) ACH.checkRead(DATA.posts.length);
    renderProgress();
    if (changed) { /* 进度已更新，下次回首页即可见 */ }
    $('#reader').querySelectorAll('.rel .post').forEach((el) =>
      el.addEventListener('click', () => { location.hash = '#/post/' + el.dataset.id; }));
    bindArticleExtras();
    bindVisitorExtras(p);
  }

  /* ---- 访客互动：点赞 / 收藏 / 留言墙 ---- */
  let likeCache = null;
  function bindVisitorExtras(p) {
    const likeBtn = $('#likeBtn'), starBtn = $('#starBtn');
    const paintLike = () => {
      if (!likeBtn) return;
      const n = (likeCache && likeCache[p.id]) || 0;
      const liked = isLiked(p.id);
      likeBtn.classList.toggle('liked', liked);
      likeBtn.textContent = (liked ? '❤ ' : '♡ ') + n;
    };
    const loadLikes = () => {
      if (likeCache) return Promise.resolve(likeCache);
      return fetch('/api/likes').then((r) => r.json())
        .then((d) => { likeCache = d.likes || {}; return likeCache; })
        .catch(() => ({}));
    };
    loadLikes().then(paintLike);
    if (likeBtn) likeBtn.addEventListener('click', () => {
      if (isLiked(p.id)) return;
      fetch('/api/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
        .then((r) => r.json()).then((d) => {
          try {
            const arr = JSON.parse(localStorage.getItem(LIKE_KEY) || '[]');
            if (arr.indexOf(p.id) < 0) arr.push(p.id);
            localStorage.setItem(LIKE_KEY, JSON.stringify(arr));
          } catch (e) {}
          if (likeCache) likeCache[p.id] = d.count || ((likeCache[p.id] || 0) + 1);
          paintLike();
          likeBtn.classList.add('pop');
          setTimeout(() => likeBtn.classList.remove('pop'), 400);
        }).catch(() => {});
    });
    if (starBtn) {
      const paintStar = () => {
        const on = getStars().has(p.id);
        starBtn.textContent = on ? '★ 已收藏' : '☆ 收藏';
        starBtn.classList.toggle('starred', on);
      };
      paintStar();
      starBtn.addEventListener('click', () => {
        const s = getStars();
        if (s.has(p.id)) s.delete(p.id); else s.add(p.id);
        try { localStorage.setItem(STAR_KEY, JSON.stringify([...s])); } catch (e) {}
        paintStar();
      });
    }
    /* 留言墙 */
    const listEl = $('#cmtList'), cntEl = $('#cmtCount'), tipEl = $('#cmtTip');
    const fmtT = (t) => {
      const d = new Date(t);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const renderCmts = (items) => {
      if (cntEl) cntEl.textContent = items.length ? '· ' + items.length + ' 条' : '';
      if (!items.length) { listEl.innerHTML = '<p class="cmt-empty">还没有留言，坐个沙发？</p>'; return; }
      listEl.innerHTML = items.map((c) =>
        `<div class="cmt-item"><div class="cmt-head"><b>${escapeHtml(c.name)}</b><span class="mono">${fmtT(c.t)}</span></div><p>${escapeHtml(c.text)}</p></div>`).join('');
    };
    fetch('/api/comments?post=' + encodeURIComponent(p.id)).then((r) => r.json())
      .then((d) => renderCmts(d.comments || []))
      .catch(() => { if (listEl) listEl.innerHTML = '<p class="cmt-empty">留言加载失败，稍后刷新再试</p>'; });
    const send = $('#cmtSend');
    if (send) send.addEventListener('click', () => {
      const text = $('#cmtText').value.trim();
      if (!text) { if (tipEl) tipEl.textContent = '先写点什么吧'; return; }
      fetch('/api/comment', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post: p.id, name: $('#cmtName').value, text }) })
        .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || '发送失败'); return d; })
        .then(() => {
          $('#cmtText').value = '';
          if (tipEl) tipEl.textContent = '';
          return fetch('/api/comments?post=' + encodeURIComponent(p.id)).then((r) => r.json()).then((dd) => renderCmts(dd.comments || []));
        })
        .catch((e) => { if (tipEl) tipEl.textContent = e.message; });
    });
  }

  /* ---- 文章页增强：目录 TOC / 复制代码 / 复制链接 / 图片灯箱 ---- */
  function bindArticleExtras() {
    const article = $('#reader .article');
    if (!article) return;
    /* 一键复制本文链接 */
    const cl = article.querySelector('.copy-link');
    if (cl) {
      cl.addEventListener('click', () => {
        const url = location.origin + location.pathname + location.hash;
        const done = () => { cl.textContent = '✓ 已复制'; setTimeout(() => { cl.textContent = '🔗 复制链接'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done).catch(() => { cl.textContent = '复制失败'; });
        } else {
          const ta = document.createElement('textarea');
          ta.value = url; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); done(); } catch (e) { cl.textContent = '复制失败'; }
          ta.remove();
        }
      });
    }
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
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1600);
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

  /* ---- SEO：文章页动态注入 Open Graph + JSON-LD，回首页复位 ---- */
  function upsertMeta(attr, key, content) {
    let m = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute(attr, key);
      document.head.appendChild(m);
    }
    m.setAttribute('content', content);
  }
  function applySeo(p) {
    const desc = p.excerpt || p.title;
    const url = location.origin + location.pathname + '#/post/' + (p.slug || p.id);
    upsertMeta('property', 'og:title', p.title);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', 'article');
    upsertMeta('property', 'og:url', url);
    upsertMeta('name', 'description', desc);
    let ld = document.getElementById('ld-json');
    if (!ld) {
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.id = 'ld-json';
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: desc,
      datePublished: p.date,
      keywords: (p.tags || []).join(','),
      articleSection: catName(p.category),
      inLanguage: 'zh-CN',
    });
  }
  function resetSeo() {
    const s = DATA.site;
    upsertMeta('property', 'og:title', s.title || '夜神月 · 物联网技术博客');
    upsertMeta('property', 'og:description', s.slogan || '');
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('name', 'description',
      `${s.slogan || ''} ${DATA.posts.length} 节小白向课程，8 个专业方向。`.trim());
    const ld = document.getElementById('ld-json');
    if (ld) ld.remove();
  }

  /* ---- Ctrl+K 命令面板：全站快速跳转（文章 / 栏目 / 标签 / 动作） ---- */
  const CMDK = { open: false, items: [], sel: 0 };
  function buildCmdkItems(q) {
    const items = [];
    const push = (o) => items.push(o);
    if (!q) {
      push({ kind: '动作', icon: '🎲', title: '随机抽一课', run: rollDice });
      push({ kind: '动作', icon: '🗄', title: '打开资源网盘', run: () => { location.hash = '#/drive'; } });
      push({ kind: '动作', icon: '🌓', title: '切换深浅主题', run: toggleTheme });
      push({ kind: '动作', icon: '⌨', title: '查看键盘快捷键', run: openKbdHelp });
      DATA.site.categories.forEach((c) =>
        push({ kind: '栏目', icon: ICONS[c.icon] || ICONS.chip, title: c.name, sub: c.desc || '', href: '#/cat/' + c.id }));
    }
    const posts = DATA.posts.filter((p) =>
      !q || (p.title + ' ' + (p.excerpt || '') + ' ' + (p.tags || []).join(' ') + ' ' + catName(p.category)).toLowerCase().includes(q));
    posts.slice(0, q ? 8 : 5).forEach((p) => {
      const color = CAT_COLOR[p.category] || 'blue';
      push({ kind: '文章', icon: '📄', title: p.title, sub: catName(p.category) + ' · Lv.' + levelInfo(p.level).lv, href: '#/post/' + p.id, cat: color });
    });
    const tags = DATA.site.tags.filter((t) =>
      !q || t.toLowerCase().includes(q));
    tags.slice(0, q ? 4 : 6).forEach((t) =>
      push({ kind: '标签', icon: '#', title: t, href: '#/tag/' + encodeURIComponent(t) }));
    return items;
  }
  function cmdkHighlight(title, q) {
    if (!q) return escapeHtml(title);
    const i = title.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return escapeHtml(title);
    return escapeHtml(title.slice(0, i)) + '<mark>' + escapeHtml(title.slice(i, i + q.length)) + '</mark>' + escapeHtml(title.slice(i + q.length));
  }
  function renderCmdk() {
    const q = $('#cmdkInput').value.trim();
    CMDK.items = buildCmdkItems(q);
    CMDK.sel = 0;
    if (!CMDK.items.length) {
      $('#cmdkList').innerHTML = '<div class="cmdk-empty">没有匹配结果，换个关键词试试。</div>';
      return;
    }
    let lastKind = '';
    $('#cmdkList').innerHTML = CMDK.items.map((it, i) => {
      const label = it.kind !== lastKind ? `<div class="cmdk-group-label">${it.kind}</div>` : '';
      lastKind = it.kind;
      const icon = it.icon.startsWith('<') ? `<span class="ck-icon">${it.icon}</span>` : `<span class="ck-emoji">${it.icon}</span>`;
      return `${label}<div class="cmdk-item${i === 0 ? ' sel' : ''}" data-i="${i}" role="option">
        ${icon}<span class="ck-main"><span class="ck-title">${cmdkHighlight(it.title, q)}</span>
        ${it.sub ? `<span class="ck-sub">${escapeHtml(it.sub)}</span>` : ''}</span>
        <span class="ck-kind">${it.kind}</span></div>`;
    }).join('');
    $('#cmdkList').querySelectorAll('.cmdk-item').forEach((el) => {
      el.addEventListener('click', () => cmdkRun(Number(el.dataset.i)));
      el.addEventListener('mousemove', () => cmdkSelect(Number(el.dataset.i)));
    });
  }
  function cmdkSelect(i) {
    CMDK.sel = i;
    $('#cmdkList').querySelectorAll('.cmdk-item').forEach((el) =>
      el.classList.toggle('sel', Number(el.dataset.i) === i));
    const sel = $('#cmdkList').querySelector('.cmdk-item.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function cmdkMove(d) {
    if (!CMDK.items.length) return;
    cmdkSelect((CMDK.sel + d + CMDK.items.length) % CMDK.items.length);
  }
  function cmdkRun(i) {
    const it = CMDK.items[i];
    if (!it) return;
    closeCmdk();
    if (it.run) it.run();
    else if (it.href) location.hash = it.href;
  }
  function openCmdk() {
    if (CMDK.open) return;
    CMDK.open = true;
    $('#cmdk').hidden = false;
    $('#cmdkInput').value = '';
    renderCmdk();
    setTimeout(() => $('#cmdkInput').focus({ preventScroll: true }), 30);
  }
  function closeCmdk() {
    CMDK.open = false;
    const el = $('#cmdk');
    if (el) el.hidden = true;
  }

  /* ---- 快捷键帮助弹层 ---- */
  function openKbdHelp() { const el = $('#kbdHelp'); if (el) el.hidden = false; }
  function closeKbdHelp() { const el = $('#kbdHelp'); if (el) el.hidden = true; }

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
    else if (h.startsWith('#/archive')) viewArchive();
    else if (h.startsWith('#/drive')) viewDrive();
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

  /* 去掉正文开头重复的 h1（文章页已有标题，避免同一标题出现两次） */
  /* 正文标题规范化：
   * 1) 去掉首个 h1（页面已有标题区，避免重复）
   * 2) 其余 h1 整体降级为 h2，避免 h1 出现在 h2 之后造成层级倒挂
   */
  function stripLeadingH1(md) {
    const lines = String(md || '').split('\n');
    if (lines.length && /^#\s+/.test(lines[0])) {
      lines.shift();
      while (lines.length && lines[0].trim() === '') lines.shift();
    }
    return lines.map((l) => (/^#\s+/.test(l) ? '#' + l : l)).join('\n');
  }

  /* ---- 初始化 ---- */
  async function init() {
    loadTheme();
    const y = document.getElementById('year'); /* 页脚年份（原内联脚本迁入此处，配合 CSP script-src 'self'） */
    if (y) y.textContent = String(new Date().getFullYear());
    $('#themeBtn').addEventListener('click', toggleTheme);
    try {
      let r = await fetch('/api/site').catch(() => null);
      if (!r || !r.ok) { r = await fetch('/data/site.json'); window.IS_STATIC_BLOG = true; }
      if (!r || !r.ok) throw new Error('no site data');
      DATA = await r.json();
    } catch (e) {
      $('#home').innerHTML = '<p style="padding:40px">加载失败，请确认服务器已启动（node server.js）。</p>';
      return;
    }
    renderShell();
    window.addEventListener('hashchange', route);
    /* 新模块控件绑定 */
    const dice = $('#diceBtn');
    if (dice) dice.addEventListener('click', rollDice);
    const kb = $('#kbdBtn');
    if (kb) kb.addEventListener('click', openKbdHelp);
    [$('#cmdk'), $('#kbdHelp')].forEach((m) => {
      if (!m) return;
      m.querySelector('.cmdk-mask').addEventListener('click', () => { m.hidden = true; CMDK.open = false; });
    });
    const ci = $('#cmdkInput');
    if (ci) {
      ci.addEventListener('input', renderCmdk);
      ci.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); cmdkMove(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkMove(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); cmdkRun(CMDK.sel); }
      });
    }
    document.addEventListener('keydown', (e) => {
      /* 灯箱：ESC 关闭 */
      const lb = $('#lightbox');
      if (lb && !lb.hidden && e.key === 'Escape') { lb.hidden = true; return; }
      /* ESC 关闭命令面板 / 帮助 */
      if (e.key === 'Escape') {
        const dp = $('#drivePreview');
        if (dp && !dp.hidden) { closeDrivePreview(); return; }
        if (!$('#cmdk').hidden) { closeCmdk(); return; }
        if (!$('#kbdHelp').hidden) { closeKbdHelp(); return; }
      }
      /* Ctrl/Cmd + K：命令面板（输入框中也响应） */
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        CMDK.open ? closeCmdk() : openCmdk();
        return;
      }
      const inField = /INPUT|TEXTAREA/.test(e.target.tagName);
      if (inField) return;
      /* 首页快捷键：/ 聚焦搜索框 */
      if (e.key === '/' && $('#reader').hidden) {
        e.preventDefault();
        const si = $('#searchInput');
        if (si) { si.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => si.focus({ preventScroll: true }), 320); }
        return;
      }
      /* 全局快捷键：? 帮助 · R 随机一课 · T 回顶 · D 主题 */
      if (e.key === '?' || (e.shiftKey && e.key === '/')) { openKbdHelp(); return; }
      const k = e.key.toLowerCase();
      if (k === 'r') { rollDice(); return; }
      if (k === 't') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (k === 'd') { toggleTheme(); return; }
      if (k === 's' && window.SFX) { syncSfxBtn(); return; }
      /* J/K 键控阅读：整屏平滑滚动 */
      if (k === 'j' || k === 'k') {
        e.preventDefault();
        window.scrollBy({ top: (k === 'j' ? 1 : -1) * Math.round(window.innerHeight * 0.78), behavior: 'smooth' });
        return;
      }
      /* 文章页快捷键：← → 翻上一课/下一课 */
      if ($('#reader').hidden) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const m = location.hash.match(/^#\/post\/(.+)$/);
      if (!m) return;
      const idx = DATA.posts.findIndex((x) => x.id === m[1]);
      if (idx < 0) return;
      const nx = DATA.posts[idx + (e.key === 'ArrowRight' ? 1 : -1)];
      if (nx) location.hash = '#/post/' + nx.id;
    });
    /* 返回顶部按钮 + 导航滚动态 + 阅读进度百分比 + 标签页标题彩蛋 */
    const tt = $('#toTop');
    const nav = $('.nav');
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (tt) {
        const show = y > 600;
        if (show && tt.hidden) { tt.hidden = false; if (window.Motion && window.Motion.ready) window.Motion.pop(tt); }
        else if (!show && !tt.hidden) tt.hidden = true;
      }
      if (nav) nav.classList.toggle('is-stuck', y > 40);
      /* 文章页阅读进度百分比：滚动条走的比例（按整页高度近似文章长度） */
      const rb = $('#readbar');
      const pct = $('#readbarPct');
      if (rb && pct && !rb.hidden) {
        const max = document.documentElement.scrollHeight - innerHeight;
        const v = max > 0 ? Math.min(100, Math.max(0, Math.round((y / max) * 100))) : 0;
        pct.textContent = v + '%';
      }
    }, { passive: true });
    /* 标签页标题彩蛋：切走时提示回来，切回还原 */
    const HOME_TITLE = '夜神月 · 物联网技术博客';
    let awayTitle = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        document.title = '📡 信号丢失…点回来继续登神长阶';
        awayTitle = true;
      } else if (awayTitle) {
        awayTitle = false;
        const m = location.hash.match(/^#\/post\/(.+)$/);
        const p = m && DATA.posts.find((x) => x.id === decodeURIComponent(m[1]));
        document.title = p ? p.title + ' · 夜神月博客' : HOME_TITLE;
      }
    });
    if (tt) tt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    /* 8-bit 音效开关 + 卡片 3D 倾斜 + 首访成就 */
    function syncSfxBtn() {
      if (!window.SFX) return;
      const on = SFX.toggle();
      const b = $('#sfxBtn');
      if (b) b.textContent = on ? '🔊' : '🔇';
    }
    const sb = $('#sfxBtn');
    if (sb) {
      sb.textContent = (window.SFX && SFX.enabled) ? '🔊' : '🔇';
      sb.addEventListener('click', syncSfxBtn);
    }
    if (window.FX && FX.ready) FX.tilt();
    if (window.ACH) ACH.firstVisit();
    route();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
