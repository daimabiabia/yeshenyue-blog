/* 夜神月博客 · 前台逻辑（零依赖，视图状态版） */
(function () {
  'use strict';
  /* Google Fonts 异步生效：print 样式表不阻塞渲染，这里换 media 让字体就位（CSP 禁内联 onload） */
  const fontAsync = document.getElementById('fontAsync');
  if (fontAsync) fontAsync.media = 'all';
  /* 图标用 currentColor，随主题自动适配（深色主题下浅色描边可见） */
  const ICONS = {
    chip: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><rect x="10" y="10" width="28" height="28" rx="3"/><rect x="18" y="18" width="12" height="12" fill="currentColor"/><path d="M16 4v6M32 4v6M16 38v6M32 38v6M4 16h6M4 32h6M38 16h6M38 32h6"/></svg>',
    wave: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 24q6-14 10 0t10 0 10 0 10 0"/></svg>',
    cloud: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M14 34a9 9 0 0 1 0-18 11 11 0 0 1 21 3 7 7 0 0 1-2 15z"/></svg>',
    bug: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><ellipse cx="24" cy="24" rx="10" ry="13"/><path d="M24 11v26M14 18l-6-4M34 18l6-4M14 30l-6 4M34 30l6 4M10 24h-5M43 24h-5"/></svg>',
    solder: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M8 40l24-24M30 8l8 8-6 6-8-8z"/><path d="M6 34l8 8"/></svg>',
    net: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><circle cx="24" cy="24" r="4" fill="currentColor"/><circle cx="10" cy="12" r="3.5"/><circle cx="38" cy="12" r="3.5"/><circle cx="10" cy="36" r="3.5"/><circle cx="38" cy="36" r="3.5"/><path d="M13 14l7 8M35 14l-7 8M13 34l7-8M35 34l-7-8"/></svg>',
    av: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><rect x="7" y="14" width="34" height="20" rx="3"/><path d="M20 19l9 5-9 5z" fill="currentColor" stroke="none"/></svg>',
    home: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M8 24l16-14 16 14"/><path d="M12 22v16h24V22"/><path d="M24 38v-9"/><path d="M19 30a5 5 0 0 1 10 0"/></svg>',
    book: '<svg class="icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3"><path d="M8 8h20a6 6 0 0 1 6 6v26H14a6 6 0 0 1-6-6z"/><path d="M34 14h6v26h-6"/><path d="M14 16h14M14 24h14"/></svg>'
  };
  const CARD_BG = ['bg-pink', 'bg-yellow', 'bg-blue', 'bg-lime', 'bg-orange', 'bg-purple'];
  const $ = (s, r = document) => r.querySelector(s);
  /* 路由切换专用瞬时置顶：html 有 scroll-behavior:smooth，
   * 直接 scrollTo(0,0) 会带着用户从页面底部平滑滚回顶部，动画横穿整页 */
  function jumpTop() { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
  /* 区块瞬时定位：长距离平滑滚会被 reveal 的布局变化打断（实测停在原地），
   * 过滤结果直接跳到目标更符合直觉；临时关掉 CSS smooth 保证行为确定 */
  function jumpToSec(sel) {
    const el = document.querySelector(sel);
    if (!el) return;
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    el.scrollIntoView({ block: 'start' });
    html.style.scrollBehavior = prev || '';
  }

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
  /* 静态模式按篇正文缓存（data/posts/<id>.json），会话内只拉一次 */
  const POST_CACHE = {};
  /* 预计阅读时长：列表接口的元数据带 readMin（服务端预计算）；
   * 静态模式 / 文章全量数据没有 readMin 时回退到本地按正文估算 */
  const readMinOf = (p) => p.readMin || readingTime(p.content);
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
      <span class="foot-meta"><span class="cat-chip">${escapeHtml(catName(p.category))}</span><span>Lv.${lv.lv} ${lv.name}</span><span>⏱ 约 ${readMinOf(p)} 分钟</span></span>
      <span class="pick-go">去读 →</span></a>`;
    sec.hidden = false;
  }

  /* ---- 人气榜：按真实点赞数 TOP5（服务端 /api/likes） ---- */
  function renderHot() {
    const sec = $('#hot-sec'), el = $('#hotList');
    if (!sec || !el) return;
    fetch(window.IS_STATIC_BLOG ? 'data/likes.json' : '/api/likes').then((r) => r.json()).then((d) => {
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

  /* ---- IoT 学习路线图：小白从 0 到 1 的主线任务（六站） ---- */
  const IOT_PATH = [
    { no: 'STEP 0', title: '先认识装备', color: 'bg-yellow', icon: '🧭',
      goal: '知道物联网是什么、该买什么，不在第一步花冤枉钱',
      points: ['搞懂物联网到底是什么', '选对第一块开发板', '备齐 150 元新手装备'],
      posts: ['z1', 'z2', 'pmtyklsjvamim'], drive: '00-小白起步包' },
    { no: 'STEP 1', title: '点亮第一盏灯', color: 'bg-lime', icon: '💡',
      goal: '装好环境、烧录代码，亲眼看着 LED 闪起来',
      points: ['Windows 环境手把手安装', '第一次烧录（卡 Connecting 别慌）', '读懂点灯代码的每一行'],
      posts: ['z3', 'z4', 'e1'], drive: '00-小白起步包' },
    { no: 'STEP 2', title: '让板子感知世界', color: 'bg-blue', icon: '🌡️',
      goal: '接上传感器，读到现在环境的温度、湿度与距离',
      points: ['GPIO / UART / I2C / SPI 四大接口', '温湿度传感器读数', 'ADC 采样入门'],
      posts: ['e-i2c', 'e-uart', 'e-spi', 'e-adc'], drive: '07-传感器与执行器' },
    { no: 'STEP 3', title: '让设备开口说话', color: 'bg-orange', icon: '📡',
      goal: '设备和服务器之间能可靠地互传消息',
      points: ['用微信群聊理解 MQTT', '串口乱码终结', '双板隔空传话实验'],
      posts: ['pr1', 'e-uart', 'pP1', 'p1'], drive: '02-通信协议' },
    { no: 'STEP 4', title: '连上网络与云', color: 'bg-purple', icon: '☁️',
      goal: '数据上云，人不在家也能随时看到家里的状态',
      points: ['家庭网络基础（IP / ping）', '树莓派家庭网关', '设备影子与断网自愈'],
      posts: ['n1', 'n2', 'c1', 'p3'], drive: '03-云边协同' },
    { no: 'STEP 5', title: '做出完整作品', color: 'bg-pink', icon: '🏆',
      goal: '独立完成一个 7×24 运行的系统——写进简历那种',
      points: ['智能开关 / 智能气象站', '低功耗 + OTA 稳定性工程', '把踩的坑写成文章'],
      posts: ['s3', 'z6', 'pi-psu'], drive: '10-项目实战' }
  ];
  function renderIotPath() {
    const el = $('#iotpath');
    if (!el) return;
    const read = getReadSet();
    el.innerHTML = IOT_PATH.map((st, i) => {
      const items = st.posts.map((id) => DATA.posts.find((p) => p.id === id)).filter(Boolean);
      const chips = items.map((p) => {
        const done = read.has(p.id);
        return `<a class="ip-post${done ? ' done' : ''}" href="#/post/${p.id}" title="${escapeAttr(p.title)}">${done ? '✓ ' : ''}${escapeHtml(p.title)}</a>`;
      }).join('');
      const pts = st.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join('');
      return `<div class="ip-stage card ${st.color} reveal in">
        <div class="ip-rail"><span class="ip-no mono">${st.no}</span><span class="ip-dot"></span>${i < IOT_PATH.length - 1 ? '<span class="ip-line"></span>' : ''}</div>
        <div class="ip-body">
          <div class="ip-head"><span class="ip-ico">${st.icon}</span><h3>${escapeHtml(st.title)}</h3><span class="ip-goal">${escapeHtml(st.goal)}</span></div>
          <ul class="ip-points">${pts}</ul>
          <div class="ip-chips">${chips}</div>
          <a class="ip-drive mono" href="#/drive">🗄 配套资料：${escapeHtml(st.drive)} →</a>
        </div></div>`;
    }).join('');
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
    /* 友链网格：此前该区块从未被渲染，首页「友链」永远空白 */
    const linksEl = $('#links');
    if (linksEl) {
      const friends = (s.friendLinks || []);
      linksEl.innerHTML = friends.length ? friends.map((l, i) =>
        `<a class="card cat ${CARD_BG[i % 6]} reveal" href="${escapeAttr(l.url || '#')}" target="_blank" rel="noopener">
          <h3>${escapeHtml(l.name || '未命名小岛')}</h3><p>${escapeHtml(l.desc || '这只瓶子没写自我介绍')}</p></a>`).join('')
        : '<p class="hint">还没有友链，去后台「站点设置」添加。</p>';
    }
    /* footer 统计文案跟随真实文章数（此前硬编码 96 lessons） */
    const termExit = document.getElementById('termExit');
    if (termExit) termExit.textContent = totalPosts + ' lessons';
    $('#ctaEmail').textContent = 'EMAIL';
    $('#ctaEmail').href = 'mailto:' + (s.contact.email || '');
    $('#ctaGithub').href = s.contact.github || '#';
    $('#projList').innerHTML = (s.contact.projects || []).map((p) =>
      `<a class="btn alt" href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`).join(' ');
    $('#footEmail').textContent = s.contact.email || '';
    $('#footEmail').href = 'mailto:' + (s.contact.email || '');
    $('#footGithub').href = s.contact.github || '#';
    /* 友链入口徽标：漂流瓶数量跟随真实数据 */
    const bc = document.querySelector('.bottle-cta .bc-txt b');
    if (bc) bc.textContent = `海上有 ${(s.friendLinks || []).length} 只漂流瓶 →`;
    /* 导航分组：顶级 6 项（2 个下拉），不再把 10 个入口全堆在一行 */
    let NAV_FLAT = [['#/', '首页'], ['#/drive', '网盘'], ['#/gallery', '相册'], ['#/me', '主页']];
    const NAV_DROPS = [
      ['content', '内容', [['#cats', '📂 栏目'], ['#tags', '🏷 标签'], ['#/archive', '🗂 归档']]],
      ['fun', '互动', [['#/links', '🍾 漂流瓶'], ['#/wall', '📡 留言墙'], ['#/chat', '🎧 聊天室']]],
    ];
    if (window.IS_STATIC_BLOG) {
      /* 静态托管（GitHub Pages）：网盘/相册/聊天室依赖服务器，导航直接不露入口 */
      NAV_FLAT = NAV_FLAT.filter(([h]) => h !== '#/drive' && h !== '#/gallery');
      NAV_DROPS[1][2] = NAV_DROPS[1][2].filter(([h]) => h !== '#/chat');
    }
    if (!window.IS_STATIC_BLOG) NAV_FLAT.push(['/admin', '后台']);
    else { const fa = document.getElementById('footAdmin'); if (fa) fa.remove(); }
    const navHtml =
      NAV_FLAT.slice(0, 1).map(([h, t]) => `<a href="${h}" data-nav="${h}">${t}</a>`).join('') +
      NAV_DROPS.map(([id, label, items]) =>
        `<div class="nav-drop" id="drop-${id}"><button type="button" class="nav-drop-btn" aria-expanded="false">${label} <i class="mono">▾</i></button>` +
        `<div class="nav-drop-panel">` + items.map(([h, t]) => `<a href="${h}" data-nav="${h}">${t}</a>`).join('') + `</div></div>`
      ).join('') +
      NAV_FLAT.slice(1).map(([h, t]) => `<a href="${h}" data-nav="${h}">${t}</a>`).join('');
    $('#navLinks').innerHTML = navHtml;
    /* 下拉交互：点击切展开（触屏友好），hover 由 CSS 处理；点击子项/别处收起 */
    document.querySelectorAll('.nav-drop').forEach((d) => {
      const btn = d.querySelector('.nav-drop-btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = d.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.querySelectorAll('.nav-drop.open').forEach((o) => { if (o !== d) { o.classList.remove('open'); o.querySelector('.nav-drop-btn').setAttribute('aria-expanded', 'false'); } });
      });
      d.querySelectorAll('.nav-drop-panel a').forEach((a) => a.addEventListener('click', () => d.classList.remove('open')));
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-drop')) {
        document.querySelectorAll('.nav-drop.open').forEach((o) => { o.classList.remove('open'); o.querySelector('.nav-drop-btn').setAttribute('aria-expanded', 'false'); });
      }
    });
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
    renderIotPath();
    const tline = $('#termLine');
    if (tline) {
      if (window.Motion && window.Motion.ready) window.Motion.typeLine(tline);
      else tline.textContent = tline.dataset.text || '';
    }
    if (window.Motion && window.Motion.ready) {
      window.Motion.heroIn();
      /* 卡片倾斜统一交给 fx.js 的 CSS 变量实现（与 :hover 位移组合生效），
       * Motion.tilt 的 GSAP 内联 transform 会压住样式表导致双系统打架，这里不再绑定 */
      window.Motion.magnet(document);
      window.Motion.velocitySkew(); /* 滚动速度微斜切（FXS 'skew' 开关） */
    }
  }

  /* ---- 文章卡片 / 列表 ---- */
  /* 栏目 → 主题色（注入 --cat，驱动卡片左侧色条） */
  const CAT_COLOR = {
    zero: 'yellow', embedded: 'lime', protocol: 'blue', cloudedge: 'purple', pit: 'pink',
    hardware: 'orange', net: 'blue', av: 'purple', smart: 'lime',
  };
  function postCard(p, feat) {
    const lv = levelInfo(p.level);
    const rt = readMinOf(p);
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
    /* 只绑一次：input 是静态元素，viewHome 每次回来都会走到这里，
     * 叠加监听会让同一次按键触发 N 次 applySearch（老版本的输入卡顿根源） */
    if (!si || si._searchBound) return;
    si._searchBound = true;
    si.addEventListener('input', (e) => applySearch(e.target.value.trim().toLowerCase()));
  }

  /* ---- 视图切换（显式状态，不依赖 DOM 探测） ---- */
  function viewHome() {
    $('#reader').hidden = true;
    const arch = $('#archive');
    if (arch) arch.hidden = true;
    const dv = $('#drive'); if (dv) dv.hidden = true;
    const gl = $('#gallery'); if (gl) gl.hidden = true;
    const me = $('#me'); if (me) me.hidden = true;
    $('#home').hidden = false;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '夜神月 · 物联网技术博客';
    showList('全部文章', DATA.posts, true);
    bindSearch();
    renderProgress();
    renderRoadmap();
    renderIotPath();
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
    const gl = $('#gallery'); if (gl) gl.hidden = true;
    const me = $('#me'); if (me) me.hidden = true;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '归档 · 夜神月博客';
    resetSeo();
    const CAT_COLOR = { zero: 'yellow', embedded: 'blue', protocol: 'purple', cloudedge: 'cyan', pit: 'red', hardware: 'orange', net: 'green', av: 'pink', smart: 'yellow' };
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
    jumpTop();
  }

  /* ---- 资源网盘视图：目录树 + 文件列表 + 搜索 + 在线预览（访客可见可下载） ---- */
  const DRIVE = { files: null, meta: null, dir: '', q: '', sort: { key: '', dir: 1 }, cur: '', token: localStorage.getItem('driveToken') || '', ownerOpen: false, adminTok: sessionStorage.getItem('ysyAdminTok') || '', ownerMsg: '' };
  const DRIVE_TEXT = ['.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.c', '.h', '.cpp', '.hpp', '.py'];
  const DRIVE_IMG = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const driveURL = (f, act) => '/' + act + '?file=' + encodeURIComponent(f) + (DRIVE.token ? '&token=' + encodeURIComponent(DRIVE.token) : '');
  const reqDrive = () => (DRIVE.token ? { headers: { Authorization: 'Bearer ' + DRIVE.token } } : {});
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
    const gl = $('#gallery'); if (gl) gl.hidden = true;
    const me = $('#me'); if (me) me.hidden = true;
    if ($('#readbar')) $('#readbar').hidden = true;
    el.hidden = false;
    document.title = '资源网盘 · 夜神月博客';
    resetSeo();
    if (true) { // 每次进入都实时校验 token（口令被改后立即反映）
      el.innerHTML = '<section class="sec wrap"><div class="sec-head"><span class="kicker">DRIVE</span><h2>资源网盘</h2></div><p class="hint">正在装载文件索引…</p></section>';
      try {
        const r = await fetch('/api/drive', reqDrive());
        if (r.status === 401) { DRIVE.files = null; DRIVE.token = ''; localStorage.removeItem('driveToken'); renderDriveLocked(); return; }
        if (!r.ok) throw new Error('bad');
        const j = await r.json();
        DRIVE.files = j.files || [];
        DRIVE.meta = j;
      } catch (e) {
        el.innerHTML = '<section class="sec wrap"><div class="sec-head"><span class="kicker">DRIVE</span><h2>资源网盘</h2></div><p class="hint">网盘加载失败，请确认服务器已启动。</p></section>';
        return;
      }
    }
    renderDrive();
    jumpTop();
  }
  /* 网盘解锁界面（终端风） */
  function renderDriveLocked(msg) {
    const el = $('#drive');
    document.title = '网盘已加密 · 夜神月博客';
    el.innerHTML = `<section class="sec wrap">
      <div class="sec-head"><span class="kicker">DRIVE</span><h2>资源网盘</h2></div>
      <div class="drive-lock">
        <div class="lock-term mono">
          <div class="lock-title">🔒 DRIVE LOCKED</div>
          <p class="hint">该网盘已加密。输入访问口令后可浏览、在线预览与下载全部资料。</p>
          <div class="lock-row">
            <span class="lock-prompt">$</span>
            <input id="drivePass" type="password" placeholder="访问口令" autocomplete="off" aria-label="网盘访问口令" />
            <button id="driveUnlock" class="btn mini">解锁 →</button>
          </div>
          <p class="hint lock-msg" id="driveLockMsg">${escapeHtml(msg || '等待输入…')}</p>
        </div>
      </div></section>`;
    const inp = $('#drivePass');
    const go = () => unlockDrive(inp.value);
    $('#driveUnlock').addEventListener('click', go);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => inp.focus(), 60);
  }
  async function unlockDrive(pass) {
    const msg = $('#driveLockMsg');
    if (msg) msg.textContent = '校验中…';
    try {
      const r = await fetch('/api/drive/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (msg) msg.textContent = j.error || '口令错误'; return; }
      DRIVE.token = j.token;
      localStorage.setItem('driveToken', j.token);
      DRIVE.files = null; DRIVE.dir = ''; DRIVE.q = ''; DRIVE.sort = { key: '', dir: 1 };
      if (window.SFX && window.SFX.coin) window.SFX.coin();
      viewDrive();
    } catch (e) { if (msg) msg.textContent = '网络异常，请重试'; }
  }
  function relockDrive() {
    DRIVE.token = ''; DRIVE.files = null; DRIVE.cur = '';
    localStorage.removeItem('driveToken');
    renderDriveLocked('已重新上锁。');
  }
  /* ============ 站主上传模式：管理员登录后在前台直接上传/建目录 ============ */
  function adminHeaders(extra) {
    const h = Object.assign({}, extra || {});
    if (DRIVE.adminTok) h.Authorization = 'Bearer ' + DRIVE.adminTok;
    return h;
  }
  function bufToB64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    const CH = 0x8000; // 分块避免 String.fromCharCode.apply 栈溢出
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  async function ownerLogin(pass) {
    const msg = () => $('#ownerMsg');
    if (msg()) msg().textContent = '校验中…';
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { if (msg()) msg().textContent = j.error || '密码错误'; return; }
      DRIVE.adminTok = j.token;
      DRIVE.ownerMsg = '';
      try { sessionStorage.setItem('ysyAdminTok', j.token); } catch (e) {}
      renderDrive();
    } catch (e) { if (msg()) msg().textContent = '网络异常，请重试'; }
  }
  function ownerLogout() {
    DRIVE.adminTok = ''; DRIVE.ownerOpen = false;
    try { sessionStorage.removeItem('ysyAdminTok'); } catch (e) {}
    renderDrive();
  }
  function toggleOwnerPanel() { DRIVE.ownerOpen = !DRIVE.ownerOpen; renderDrive(); }
  function renderOwnerPanel() {
    const host = $('#ownerHost');
    if (!host) return;
    if (!DRIVE.adminTok) {
      host.innerHTML = `<div class="owner-panel mono">
        <div class="op-title">⬆ 站主模式</div>
        <div class="lock-row">
          <span class="lock-prompt">$</span>
          <input id="ownerPass" type="password" placeholder="管理员密码" autocomplete="off" aria-label="管理员密码" />
          <button id="ownerLogin" class="btn mini alt">登录 →</button>
        </div>
        <p class="hint lock-msg" id="ownerMsg">${escapeHtml(DRIVE.ownerMsg || '登录后可在前台直接上传文件到当前目录。')}</p>
      </div>`;
      const inp = $('#ownerPass');
      const go = () => ownerLogin(inp.value);
      $('#ownerLogin').addEventListener('click', go);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      setTimeout(() => inp.focus(), 60);
      return;
    }
    host.innerHTML = `<div class="owner-panel mono owner-on">
      <div class="op-title">⬆ 站主模式 <span class="op-dir">上传目标：${DRIVE.dir ? escapeHtml(DRIVE.dir) + '/' : '根目录'}</span></div>
      <div class="lock-row">
        <input id="ownerFile" type="file" multiple aria-label="选择要上传的文件" />
        <button id="ownerUpload" class="btn mini alt">⬆ 上传</button>
        <input id="ownerMkDir" type="text" placeholder="新目录名" aria-label="新目录名" style="max-width:140px" />
        <button id="ownerMkdir" class="btn mini">📁 建目录</button>
        <button id="ownerLogout" class="btn mini ghost">退出站主</button>
      </div>
      <p class="hint lock-msg" id="ownerMsg">支持 ≤30MB 的文档/压缩包/图片/源码；同名文件会被覆盖。</p>
    </div>`;
    $('#ownerLogout').addEventListener('click', ownerLogout);
    $('#ownerUpload').addEventListener('click', () => {
      const files = $('#ownerFile').files;
      if (!files || !files.length) return;
      ownerUploadFiles(Array.from(files));
    });
    $('#ownerMkdir').addEventListener('click', async () => {
      const name = $('#ownerMkDir').value.trim();
      const msg = () => $('#ownerMsg');
      if (!name) return;
      const path = (DRIVE.dir ? DRIVE.dir + '/' : '') + name;
      try {
        const r = await fetch('/api/admin/drive/mkdir', { method: 'POST', headers: adminHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ path }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (j.error === '未登录或登录已失效') { DRIVE.adminTok = ''; DRIVE.ownerMsg = '登录已失效，请重新登录'; try { sessionStorage.removeItem('ysyAdminTok'); } catch (e) {} }
          else if (msg()) msg().textContent = j.error || '创建失败';
          renderDrive();
          return;
        }
        DRIVE.ownerMsg = '';
        viewDrive();
      } catch (e) { if (msg()) msg().textContent = '网络异常，请重试'; }
    });
  }
  async function ownerUploadFiles(files) {
    const msg = () => $('#ownerMsg');
    const prefix = DRIVE.dir ? DRIVE.dir + '/' : '';
    for (const f of files) {
      if (msg()) msg().textContent = `上传中：${f.name} …`;
      try {
        const buf = await f.arrayBuffer();
        const body = JSON.stringify({ path: prefix + f.name, data: bufToB64(buf) });
        const r = await fetch('/api/admin/drive/upload', { method: 'POST', headers: adminHeaders({ 'Content-Type': 'application/json' }), body });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (j.error === '未登录或登录已失效') {
            DRIVE.adminTok = ''; DRIVE.ownerMsg = '登录已失效，请重新登录';
            try { sessionStorage.removeItem('ysyAdminTok'); } catch (e) {}
            renderDrive();
            return;
          }
          DRIVE.ownerMsg = `${f.name} 失败：${j.error || '未知错误'}`;
          renderDrive();
          return;
        }
      } catch (e) {
        DRIVE.ownerMsg = `${f.name} 网络异常`;
        renderDrive();
        return;
      }
    }
    DRIVE.ownerMsg = `✓ ${files.length} 个文件已上传`;
    viewDrive();
  }
  function renderDrive() {
    const el = $('#drive');
    const m = DRIVE.meta || {};
    /* 目录树：按路径深度缩进，右侧角标为该目录递归文件数 */
    const dirCount = (p) => DRIVE.files.filter((f) => f.type === 'file' && f.path.startsWith(p + '/')).length;
    const dirDescsTree = (DRIVE.meta && DRIVE.meta.dirDescs) || {};
    const tree = (DRIVE.files || []).filter((f) => f.type === 'dir').map((d) => {
      const depth = d.path.split('/').length - 1;
      const tip = dirDescsTree[d.path] ? escapeAttr(dirDescsTree[d.path]) : escapeAttr(d.path);
      return `<a class="dtree-item mono${DRIVE.dir === d.path ? ' on' : ''}" data-dir="${escapeAttr(d.path)}" style="padding-left:${10 + depth * 18}px" title="${tip}">▸ ${escapeHtml(d.name)}/ <i class="dtree-n">${dirCount(d.path)}</i></a>`;
    }).join('');
    /* 面包屑 */
    const segs = DRIVE.dir ? DRIVE.dir.split('/') : [];
    let acc = '';
    const crumbs = `<a class="dcrumb" data-dir="">~/drive</a>` + segs.map((s) => {
      acc = acc ? acc + '/' + s : s;
      return ` / <a class="dcrumb" data-dir="${escapeAttr(acc)}">${escapeHtml(s)}</a>`;
    }).join('');
    /* 文件行：搜索时全局过滤（含路径），否则列当前目录直属子项；表头可点击排序 */
    let rows;
    const sArrow = (k) => (DRIVE.sort.key === k ? (DRIVE.sort.dir === 1 ? ' ▲' : ' ▼') : '');
    if (DRIVE.q) {
      rows = DRIVE.files.filter((f) => f.type === 'file' && (f.name.toLowerCase().includes(DRIVE.q) || f.path.toLowerCase().includes(DRIVE.q)));
      rows.sort((a, b) => a.path.localeCompare(b.path));
    } else {
      rows = driveChildren(DRIVE.dir);
      const k = DRIVE.sort.key, sgn = DRIVE.sort.dir;
      if (k === 'size') rows.sort((a, b) => (a.type === 'dir' ? -1 : b.type === 'dir' ? 1 : sgn * (a.size - b.size)));
      else if (k === 'date') rows.sort((a, b) => (a.type === 'dir' ? -1 : b.type === 'dir' ? 1 : sgn * ((a.mtime || 0) - (b.mtime || 0))));
      else rows.sort((a, b) => (a.type === b.type ? sgn * a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)));
    }
    const dls = DRIVE.meta && DRIVE.meta.downloads ? DRIVE.meta.downloads : {};
    /* 小白友好描述：来自 _meta.json（服务端经 /api/drive 下发） */
    const descs = (DRIVE.meta && DRIVE.meta.descs) || {};
    const dirDescs = (DRIVE.meta && DRIVE.meta.dirDescs) || {};
    const rowHtml = rows.map((f) => {
      if (f.type === 'dir') {
        const dd = dirDescs[f.path] ? `<span class="d-desc">${escapeHtml(dirDescs[f.path])}</span>` : '';
        return `<tr class="drow is-dir" data-dir="${escapeAttr(f.path)}">
          <td class="d-name">📁 <b>${escapeHtml(f.name)}/</b>${dd}</td><td class="d-size mono">—</td><td class="d-date mono">—</td><td class="d-act mono">进入 →</td></tr>`;
      }
      const canPreview = DRIVE_TEXT.includes(f.ext);
      const sub = DRIVE.q && f.path.includes('/') ? `<span class="d-sub mono">${escapeHtml(f.path.slice(0, f.path.lastIndexOf('/')))}/</span>` : '';
      const desc = descs[f.path] ? `<span class="d-desc">${escapeHtml(descs[f.path])}</span>` : '';
      const dl = dls[f.path] || 0;
      return `<tr class="drow${canPreview ? ' is-text' : ''}" data-file="${escapeAttr(f.path)}" data-ext="${escapeAttr(f.ext)}">
        <td class="d-name">${driveIcon(f.ext)} ${canPreview ? `<b class="d-open">${escapeHtml(f.name)}</b>` : escapeHtml(f.name)}${sub}${desc}</td>
        <td class="d-size mono">${fmtSize(f.size)}</td>
        <td class="d-date mono">${f.mtime ? new Date(f.mtime).toISOString().slice(0, 10) : ''}</td>
        <td class="d-act"><a class="btn mini alt" href="${driveURL(f.path, 'api/drive/download')}" download>⬇ 下载</a>${dl ? `<span class="d-dl mono" title="已被下载 ${dl} 次">×${dl}</span>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="hint" style="padding:18px">空目录，或没有匹配的文件。</td></tr>';
    el.innerHTML = `<section class="sec wrap">
      <div class="sec-head"><span class="kicker">DRIVE</span><h2>资源网盘</h2>
        <span class="search-term mono" style="margin-left:auto;max-width:220px"><input id="driveSearch" placeholder="> 搜索文件…" value="${escapeAttr(DRIVE.q)}" aria-label="搜索文件" /></span></div>
      <p class="hint" style="margin-bottom:16px">共 ${m.fileCount || 0} 个文件 · ${m.dirCount || 0} 个目录 · ${fmtSize(m.totalSize || 0)} — 点击文件名在线预览，⬇ 直接下载 · <a id="driveReLock" class="d-relock mono" title="清除本机解锁状态">🔒 重新上锁</a> · <a id="driveOwnerBtn" class="d-relock mono" title="站主登录后可上传文件、新建目录">⬆ 站主上传</a></p>
      <div id="ownerHost" style="margin-bottom:14px"></div>
      <div class="drive-layout">
        <aside class="drive-tree">
          <a class="dtree-item mono${DRIVE.dir === '' ? ' on' : ''}" data-dir="">▸ 根目录/</a>
          ${tree}
        </aside>
        <div class="drive-main">
          <div class="d-crumbs mono">${crumbs}</div>
          <table class="drive-table"><thead><tr><th class="th-sort" data-sort="name" title="点击排序">文件名${sArrow('name')}</th><th class="th-sort" data-sort="size" title="点击排序">大小${sArrow('size')}</th><th class="th-sort" data-sort="date" title="点击排序">修改时间${sArrow('date')}</th><th>操作</th></tr></thead><tbody>${rowHtml}</tbody></table>
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
    el.querySelectorAll('.th-sort').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (DRIVE.sort.key === k) DRIVE.sort.dir = -DRIVE.sort.dir;
      else { DRIVE.sort.key = k; DRIVE.sort.dir = 1; }
      renderDrive();
      const si2 = $('#driveSearch'); if (si2) si2.value = DRIVE.q;
    }));
    const si = $('#driveSearch');
    if (si) {
      si.addEventListener('input', () => { DRIVE.q = si.value.trim().toLowerCase(); renderDrive(); const n = $('#driveSearch'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
    }
    const rl = $('#driveReLock');
    if (rl) rl.addEventListener('click', relockDrive);
    const ob = $('#driveOwnerBtn');
    if (ob) ob.addEventListener('click', toggleOwnerPanel);
    if (DRIVE.ownerOpen) renderOwnerPanel();
    /* 灯箱：点击任意位置（遮罩或图片）即关闭 */
    const lb0 = $('#lightbox');
    if (lb0 && !lb0._closeBound) {
      lb0._closeBound = true;
      lb0.addEventListener('click', () => { lb0.hidden = true; });
    }
  }
  /* 在线预览弹层：md 渲染 / 文本直出 / 图片展示，其余引导下载 */
  async function openDrivePreview(fpath, ext) {
    const box = $('#drivePreview');
    if (!box) return;
    DRIVE.cur = fpath;
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
      if (r.status === 401) { body.innerHTML = '<p class="hint">口令已失效，请返回网盘页重新解锁。</p>'; return; }
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

  /* ============ 照片墙 #/gallery ============ */
  async function viewGallery() {
    const el = $('#gallery');
    $('#reader').hidden = true; $('#home').hidden = true;
    const arch = $('#archive'); if (arch) arch.hidden = true;
    const dv = $('#drive'); if (dv) dv.hidden = true;
    const me = $('#me'); if (me) me.hidden = true;
    el.hidden = false;
    document.title = '照片墙 · 夜神月博客';
    resetSeo();
    el.innerHTML = '<section class="sec wrap"><div class="sec-head"><span class="kicker">GALLERY</span><h2>照片墙</h2></div><p class="hint">正在冲洗照片…</p></section>';
    let photos = [];
    try {
      const r = await fetch('/api/gallery');
      if (r.ok) { const j = await r.json(); photos = j.photos || []; }
    } catch (e) {}
    const cards = photos.map((p, i) => `
      <figure class="g-photo" style="--rot:${Number(p.rot) || 0}deg;--dl:${(i % 8) * 0.07}s" data-src="${escapeAttr(p.src)}" data-title="${escapeAttr(p.title)}">
        <span class="g-tape tape-${escapeAttr(p.tape || 'pink')}"></span>
        <div class="g-frame"><img src="${escapeAttr(p.src)}" alt="${escapeAttr(p.title)}" loading="lazy" /></div>
        <figcaption><b>${escapeHtml(p.title || '')}</b>${p.cap ? `<span class="g-cap mono">${escapeHtml(p.cap)}</span>` : ''}</figcaption>
      </figure>`).join('');
    el.innerHTML = `<section class="sec wrap">
      <div class="sec-head"><span class="kicker">GALLERY</span><h2>照片墙</h2></div>
      <p class="hint" style="margin-bottom:20px">共 ${photos.length} 张 — 点击照片放大 · 后台「照片墙管理」可增删改</p>
      <div class="g-wall">${cards || '<p class="hint">墙上是空的，等主人来贴照片。</p>'}</div>
    </section>`;
    el.querySelectorAll('.g-photo').forEach((f) => f.addEventListener('click', () => {
      const lb = $('#lightbox');
      if (!lb) return;
      lb.querySelector('img').src = f.dataset.src;
      lb.hidden = false;
    }));
    jumpTop();
    if (window.Motion && window.Motion.ready) window.Motion.reveal(el);
  }

  /* ============ 友链 · 漂流瓶海湾 #/links ============ */
  function viewLinks() {
    const el = $('#linksPage');
    document.title = '漂流瓶海湾 · 友链';
    resetSeo();
    const friends = (DATA.site.friendLinks || []);
    /* 网格 + 抖动散布：任意数量都不重叠 */
    const nB = friends.length, cols = 4, rows = Math.max(1, Math.ceil(nB / cols));
    const pos = (i, seed) => {
      const col = i % cols, row = Math.floor(i / cols);
      const jx = seed % 6, jy = (seed >> 2) % 7;
      const left = 7 + col * 22 + jx;
      const top = rows === 1 ? 40 + jy : 30 + row * (44 / (rows - 1)) + jy * 0.6;
      return [Math.min(Math.round(left * 10) / 10, 88), Math.min(Math.round(top * 10) / 10, 78)];
    };
    const bottles = friends.map((l, i) => {
      const hue = (i * 67 + Math.floor(strHash(l.name || String(i)))) % 360;
      const drift = 14 + (strHash(l.name || '') % 10);
      const bl = pos(i, strHash(l.name || String(i)));
      return `<button type="button" class="bottle" data-i="${i}"
        style="--h:${hue};--dl:${-(i * 2.7) % 9}s;--drift:${drift}s;left:${bl[0]}%;top:${bl[1]}%">
        <span class="bt-body">
          <span class="bt-letter mono" style="--h:${hue}">${escapeHtml((l.name || '?').slice(0, 1))}</span>
          <span class="bt-cork"></span>
        </span>
        <span class="bt-paper" aria-hidden="true">${escapeHtml(l.name)}</span>
        <span class="bt-card" role="tooltip">
          <b>${escapeHtml(l.name)}</b>
          <p>${escapeHtml(l.desc || '这只瓶子没写自我介绍')}</p>
          <span class="bt-go mono">→ 前往</span>
        </span>
      </button>`;
    }).join('');
    el.innerHTML = `<section class="sea-hero">
      <div class="sea-sky">
        <span class="sea-sun" aria-hidden="true"></span>
        <p class="sea-slogan mono">&gt; net.scan('ocean') — 发现 ${friends.length} 个友邻信号</p>
      </div>
      <div class="sea-waves" aria-hidden="true"><i class="w1"></i><i class="w2"></i><i class="w3"></i></div>
      <div class="sea-body">${bottles || '<p class="hint sea-empty">海上还没有漂流瓶 — 去后台「站点设置」投放一只。</p>'}
        <p class="sea-tip mono">⬆ 鼠标悬停瓶身可预览 · 点击「前往」打开对方小岛</p>
      </div>
    </section>`;
    el.hidden = false;
    el.querySelectorAll('.bottle').forEach((bt) => {
      bt.addEventListener('click', () => {
        const f = friends[Number(bt.dataset.i)];
        if (f && f.url) window.open(f.url, '_blank', 'noopener');
      });
    });
    jumpTop();
    if (window.SFX && window.SFX.enabled) window.SFX.whoosh();
  }
  function strHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  /* ============ 创意留言墙 #/wall（弹幕跑道 + 便利贴墙） ============ */
  const WALL_MOODS = [['happy', '😄'], ['love', '🥰'], ['cool', '😎'], ['tired', '🥱'], ['hack', '🧑‍💻']];
  const WALL_NICK_KEY = 'wallNick';
  function viewWall() {
    const el = $('#wall');
    document.title = '留言墙 · 信号发射站';
    resetSeo();
    el.innerHTML = `<section class="sec wrap">
      <header class="sec-head"><span class="kicker">WALL</span><h2>信号发射站</h2></header>
      <p class="hint" style="margin:0 0 14px">写下的每句话都会以弹幕划过雷达屏，同时贴上便签墙 · 点击任意便签可让它重新上天 📡</p>

      <div class="radar-screen" id="radarScreen" aria-label="弹幕区">
        <span class="radar-line" aria-hidden="true"></span>
        <div class="danmaku-layer" id="dmLayer"></div>
      </div>

      <div class="wall-composer card">
        <div class="wc-row">
          <input id="wallNick" class="w-input" maxlength="24" placeholder="署名（可留空=匿名访客）" />
          <div class="wc-moods" id="wallMoods" role="radiogroup" aria-label="心情"></div>
          <div class="wc-colors" id="wallColors" role="radiogroup" aria-label="便签颜色"></div>
        </div>
        <div class="wc-row">
          <input id="wallText" class="w-input w-grow" maxlength="160" placeholder="向全世界发射一条信号…（≤160 字）" />
          <button type="button" class="btn" id="wallSend">📡 发射</button>
        </div>
        <span class="hint" id="wallTip" role="status"></span>
      </div>

      <h3 class="wall-sub mono">// STICKY WALL · 便签墙</h3>
      <div class="sticky-grid" id="stickyGrid"><p class="hint">便签装运中…</p></div>
    </section>`;
    el.hidden = false;
    /* 心情 / 颜色选择器 */
    let mood = 'happy', color = (Math.random() * 6) | 0;
    $('#wallMoods').innerHTML = WALL_MOODS.map(([k, e]) =>
      `<button type="button" class="wc-mood${k === mood ? ' on' : ''}" data-mood="${k}">${e}</button>`).join('');
    $('#wallColors').innerHTML = [0, 1, 2, 3, 4, 5].map((c) =>
      `<button type="button" class="wc-color s${c}${c === color ? ' on' : ''}" data-color="${c}" aria-label="颜色${c + 1}"></button>`).join('');
    $('#wallMoods').addEventListener('click', (e) => {
      const b = e.target.closest('.wc-mood'); if (!b) return;
      mood = b.dataset.mood;
      $('#wallMoods').querySelectorAll('.wc-mood').forEach((x) => x.classList.toggle('on', x === b));
    });
    $('#wallColors').addEventListener('click', (e) => {
      const b = e.target.closest('.wc-color'); if (!b) return;
      color = Number(b.dataset.color);
      $('#wallColors').querySelectorAll('.wc-color').forEach((x) => x.classList.toggle('on', x === b));
    });
    const nick = $('#wallNick');
    try { nick.value = localStorage.getItem(WALL_NICK_KEY) || ''; } catch (e) {}
    function launchDm(text, moodK, lane) {
      const layer = $('#dmLayer'); if (!layer) return;
      const emoji = (WALL_MOODS.find((m) => m[0] === moodK) || WALL_MOODS[0])[1];
      const dm = document.createElement('span');
      dm.className = 'dm';
      dm.textContent = emoji + ' ' + text;
      dm.style.top = (8 + (lane != null ? lane : (Math.random() * 4) | 0) * 22) + '%';
      dm.style.animationDuration = (11 + Math.random() * 7).toFixed(1) + 's';
      layer.appendChild(dm);
      dm.addEventListener('animationend', () => dm.remove());
    }
    function noteHTML(n) {
      const d = new Date(n.t);
      const emo = (WALL_MOODS.find((m) => m[0] === n.mood) || WALL_MOODS[0])[1];
      return `<div class="sticky s${n.color}" data-id="${escapeAttr(n.id)}" data-text="${escapeAttr(n.text)}" data-mood="${escapeAttr(n.mood)}">
        <i class="st-tape" aria-hidden="true"></i>
        <span class="st-emo">${emo}</span>
        <p class="st-text">${escapeHtml(n.text)}</p>
        <span class="st-meta mono">${escapeHtml(n.name)} · ${d.getMonth() + 1}/${d.getDate()}</span>
      </div>`;
    }
    fetch(window.IS_STATIC_BLOG ? 'data/wall.json' : '/api/wall').then((r) => r.json()).then((d) => {
      const list = d.notes || [];
      $('#stickyGrid').innerHTML = list.map(noteHTML).join('')
        || '<p class="hint">墙上还空着，坐个第一张沙发？</p>';
      list.slice(0, 12).forEach((n, i) => launchDm(n.text, n.mood, i % 4));
      $('#stickyGrid').addEventListener('click', (e) => {
        const st = e.target.closest('.sticky'); if (!st) return;
        launchDm(st.dataset.text, st.dataset.mood);
        if (window.SFX && window.SFX.enabled) window.SFX.click();
      });
    }).catch(() => { $('#stickyGrid').innerHTML = '<p class="hint">便签装运失败，稍后刷新再试。</p>'; });
    function send() {
      const text = $('#wallText').value.trim();
      const tip = $('#wallTip');
      if (!text) { tip.textContent = '先写点什么再发射～'; return; }
      if (window.IS_STATIC_BLOG) { tip.textContent = '静态托管模式下留言暂停，欢迎到 GitHub 仓库的 issue 区找我 ✉'; return; }
      try { localStorage.setItem(WALL_NICK_KEY, nick.value.trim()); } catch (e) {}
      $('#wallSend').disabled = true;
      fetch('/api/wall', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nick.value.trim(), text, mood, color }),
      }).then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then(({ ok, j }) => {
        $('#wallSend').disabled = false;
        if (!ok) { tip.textContent = j.error || '发射失败'; return; }
        $('#wallText').value = ''; tip.textContent = '✓ 信号已上天！';
        setTimeout(() => { tip.textContent = ''; }, 2200);
        launchDm(j.note.text, j.note.mood);
        const grid = $('#stickyGrid');
        const empty = grid.querySelector('.hint'); if (empty) empty.remove();
        grid.insertAdjacentHTML('afterbegin', noteHTML(j.note));
        if (window.SFX && window.SFX.enabled) window.SFX.click();
      }).catch(() => { $('#wallSend').disabled = false; tip.textContent = '网络异常，稍后再试'; });
    }
    $('#wallSend').addEventListener('click', send);
    $('#wallText').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    jumpTop();
  }

  /* ============ 多人聊天室 #/chat ============ */
  const CHAT_SID_KEY = 'chatSid';
  let chatTimer = null;      /* 2.2s 消息轮询 */
  let chatPingTimer = null;  /* 15s 心跳 */
  function stopChatTimers() {
    if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
    if (chatPingTimer) { clearInterval(chatPingTimer); chatPingTimer = null; }
  }
  function viewChat() {
    const el = $('#chat');
    document.title = '深夜电台 · 多人聊天室';
    resetSeo();
    if (window.IS_STATIC_BLOG) {
      el.innerHTML = `<section class="sec wrap"><div class="chat-gate card">
        <div class="sec-head"><span class="kicker">RADIO</span><h2>深夜电台 · 停播中</h2></div>
        <p class="hint">聊天室需要服务器常驻，静态托管（GitHub Pages）模式下暂时打烊。想聊天可以去 GitHub 仓库的 issue 区喊我 ✉</p>
      </div></section>`;
      el.hidden = false;
      jumpTop();
      return;
    }
    let sess = null;
    try { sess = JSON.parse(sessionStorage.getItem(CHAT_SID_KEY) || 'null'); } catch (e) {}
    el.hidden = false;
    if (!sess || !sess.id) return renderChatGate(el);
    renderChatRoom(el, sess);
  }
  function renderChatGate(el) {
    el.innerHTML = `<section class="sec wrap"><div class="chat-gate card">
      <div class="sec-head"><span class="kicker">RADIO</span><h2>深夜电台 · 登机牌</h2></div>
      <p class="hint">报上代号即可入场 —— 无需注册，代号只在本浏览器会话内有效。</p>
      <div class="wc-row">
        <input id="chatNick" class="w-input w-grow" maxlength="16" placeholder="你的代号（留空自动生成）" />
        <button type="button" class="btn" id="chatEnter">🎧 接入电台</button>
      </div>
      <span class="hint" id="chatGateTip" role="status"></span>
    </div></section>`;
    const send = () => {
      const name = $('#chatNick').value.trim();
      const tip = $('#chatGateTip');
      $('#chatEnter').disabled = true;
      fetch('/api/chat/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then(({ ok, j }) => {
          $('#chatEnter').disabled = false;
          if (!ok) { tip.textContent = j.error || '接入失败'; return; }
          try { sessionStorage.setItem(CHAT_SID_KEY, JSON.stringify(j)); } catch (e) {}
          renderChatRoom(el, j);
        }).catch(() => { $('#chatEnter').disabled = false; tip.textContent = '网络异常，稍后再试'; });
    };
    $('#chatEnter').addEventListener('click', send);
    $('#chatNick').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    jumpTop();
  }
  function renderChatRoom(el, sess) {
    let lastT = 0, firstLoad = true;
    el.innerHTML = `<section class="chat-shell">
      <header class="chat-top mono">
        <span class="ct-live"><i></i>ON AIR</span>
        <b>深夜电台 · FREQUENCY 77.2973</b>
        <span class="ct-online" id="chatOnlineN">0</span>
        <button type="button" class="btn ghost" id="chatExit">退出</button>
      </header>
      <div class="chat-main">
        <div class="chat-stream" id="chatStream" aria-live="polite"></div>
        <aside class="chat-side">
          <h4 class="mono">// IN THE ROOM</h4>
          <div id="chatUsers"><p class="hint">扫描中…</p></div>
        </aside>
      </div>
      <footer class="chat-inputbar">
        <span class="mono chat-me" style="--me:${escapeAttr(sess.color)}">${escapeHtml(sess.name)}</span>
        <input id="chatText" class="w-input w-grow" maxlength="300" placeholder="对全频道说点什么…（Enter 发送）" />
        <button type="button" class="btn" id="chatSend">发射</button>
      </footer>
      <span class="hint chat-tip" id="chatTip" role="status"></span>
    </section>`;
    const stream = $('#chatStream');
    function msgHTML(m) {
      if (m.sys) return `<div class="cm sys mono">— ${escapeHtml(m.text)} —</div>`;
      const mine = m.uid === sess.id;
      const d = new Date(m.t);
      return `<div class="cm${mine ? ' mine' : ''}">
        <span class="cm-ava" style="--h:${escapeAttr(m.color)}">${escapeHtml((m.name || '?').slice(0, 1))}</span>
        <div class="cm-bubble"><span class="cm-name mono" style="color:${escapeAttr(m.color)}">${mine ? '我' : escapeHtml(m.name)}</span>
        <p>${escapeHtml(m.text)}</p><span class="cm-t mono">${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span></div>
      </div>`;
    }
    function renderUsers(online) {
      $('#chatOnlineN').textContent = '在线 ' + online.length;
      $('#chatUsers').innerHTML = online.map((u) =>
        `<div class="cu${u.id === sess.id ? ' me' : ''}"><span class="cm-ava" style="--h:${escapeAttr(u.color)}">${escapeHtml((u.name || '?').slice(0, 1))}</span><span>${escapeHtml(u.name)}${u.id === sess.id ? '（你）' : ''}</span></div>`).join('')
        || '<p class="hint">房间里只有你了…</p>';
    }
    function poll() {
      /* 先判路由再发请求：切走后定时器尚未清理的几拍不再白发请求 */
      if (location.hash !== '#/chat') return;
      fetch('/api/chat?since=' + lastT + '&hb=' + sess.id).then((r) => r.json()).then((d) => {
        if (location.hash !== '#/chat') return;
        const msgs = (firstLoad ? d.msgs.slice(-50) : d.msgs.filter((m) => m.t > lastT)) || [];
        if (msgs.length) {
          stream.insertAdjacentHTML('beforeend', msgs.map(msgHTML).join(''));
          while (stream.children.length > 200) stream.firstChild.remove();
          stream.scrollTop = stream.scrollHeight;
          lastT = Math.max(lastT, ...msgs.map((m) => m.t));
          if (!firstLoad && window.SFX && window.SFX.enabled) window.SFX.click();
        }
        firstLoad = false;
        renderUsers(d.online || []);
      }).catch(() => {});
    }
    poll();
    chatTimer = setInterval(poll, 2200);
    /* 心跳单独记录，离开聊天室时随轮询一起清理（否则每次进房间泄漏一个 15s 定时器） */
    chatPingTimer = setInterval(() => {
      if (location.hash !== '#/chat') return;
      fetch('/api/chat/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sess.id }) }).catch(() => {});
    }, 15000);
    function sendMsg() {
      const inp = $('#chatText'), tip = $('#chatTip');
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      fetch('/api/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sess.id, text }) })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then(({ ok, j }) => {
          if (!ok) { tip.textContent = j.error || '发送失败'; setTimeout(() => { tip.textContent = ''; }, 2000); }
          else poll();
        }).catch(() => { tip.textContent = '网络异常'; });
    }
    $('#chatSend').addEventListener('click', sendMsg);
    $('#chatText').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
    function leave() {
      stopChatTimers();
      try {
        navigator.sendBeacon && navigator.sendBeacon('/api/chat/leave',
          new Blob([JSON.stringify({ id: sess.id })], { type: 'application/json' }));
      } catch (e) {}
      try { sessionStorage.removeItem(CHAT_SID_KEY); } catch (e) {}
    }
    $('#chatExit').addEventListener('click', () => { leave(); location.hash = '#/'; });
    window.addEventListener('beforeunload', leave, { once: true });
    jumpTop();
    setTimeout(() => { const i = $('#chatText'); if (i) i.focus(); }, 100);
  }

  /* ============ 个人主页 #/me ============ */
  function viewMe() {
    const el = $('#me');
    document.title = '关于夜神月 · 个人主页';
    resetSeo();
    const c = DATA.site.contact || {};
    const posts = DATA.posts || [];
    const skills = [
      ['嵌入式开发', 85], ['ESP32 / ESP-IDF', 82], ['协议解析 MQTT·BLE', 78], ['Linux 与网络', 74], ['云边协同', 68], ['硬件焊接调试', 60],
    ];
    const timeline = [
      ['NOW', 'IoT 全栈修炼中 · 已登 ' + posts.length + ' 级', '从点灯到上云，每一课都是亲手踩出来的坑。'],
      ['PHASE-2', '云边协同与智能家居', 'MQTT Broker / Home Assistant / 边缘网关，把家里改成实验室。'],
      ['PHASE-1', '嵌入式实战与协议拆解', 'ESP32 裸机、传感器驱动、报文逐字节拆开看。'],
      ['ORIGIN', '「登神长阶」启动', '0 → 1，从焊第一块板子开始，把学习过程本身做成作品。'],
    ];
    const gear = [
      ['🛠 主战线', '嵌入式开发 · ESP32 / ESP-IDF', '让传感器开口说话，让板子听话'],
      ['📡 协议栈', 'MQTT · CoAP · BLE · Modbus', '抓包逐字节拆，拆完写成课'],
      ['☁️ 云与边', 'Broker · Home Assistant · 边缘网关', '设备到云端，一条消息的完整旅程'],
      ['🧰 工作台', '烙铁 · 万用表 · 逻辑分析仪', '焊盘冒烟是日常，飞线是艺术'],
      ['📚 修炼方式', '一课一坑全记录', '不装大佬，只把复杂的东西讲成人话'],
      ['☕ 燃料', '咖啡因 · 深夜调板子', '「再调通一个就睡」'],
    ];
    const badges = [
      ['📡', 'IoT 修炼者'], ['⚡', 'ESP32'], ['📨', 'MQTT'], ['🔩', '嵌入式'],
      ['☁️', '云边协同'], ['🏠', '智能家居'], ['✍️', posts.length + ' 篇输出'], ['🪜', '登神长阶中'],
    ];
    const stats = [
      [String(posts.length), '篇学习笔记'],
      [String((DATA.site.categories || []).length), '个专业方向'],
      ['ESP32', '主力板卡'],
      ['∞', '坑待踩'],
    ];
    const skillRows = skills.map((s, i) => `
      <div class="m-skill" style="--w:${s[1]}%;--dl:${i * 0.08}s"><span class="mono">${escapeHtml(s[0])}</span><i class="m-bar"><b></b></i><em class="mono">${s[1]}</em></div>`).join('');
    const tlRows = timeline.map((t) => `
      <div class="m-tl-item"><span class="m-tl-tag mono">${escapeHtml(t[0])}</span><div><b>${escapeHtml(t[1])}</b><p>${escapeHtml(t[2] || '')}</p></div></div>`).join('');
    const gearRows = gear.map((g) => `
      <div class="m-gear"><span class="mg-ico">${g[0]}</span><div><b>${escapeHtml(g[1])}</b><p>${escapeHtml(g[2] || '')}</p></div></div>`).join('');
    const badgeRows = badges.map((b) => `
      <span class="m-badge" title="${escapeAttr(b[1])}"><i>${b[0]}</i>${escapeHtml(b[1])}</span>`).join('');
    const projRows = (c.projects || []).map((p) => `
      <a class="m-proj card" href="${escapeAttr(p.url)}" target="_blank" rel="noopener"><b>${escapeHtml(p.name)}</b><span class="mono">↗ OPEN</span></a>`).join('')
      || '<p class="hint">项目档案整理中…</p>';
    el.innerHTML = `<section class="sec wrap">
      <header class="m-hero">
        <span class="badge mono">// IOT MAKER & LEARNER</span>
        <h1 class="m-name">夜神月<span class="m-name-en mono">KIRA · YAGAMI LIGHT</span></h1>
        <p class="term-line" data-text="> whoami — maker, learner, tinkerer. soldering / flashing / publishing. status: ONLINE"></p>
        <div class="m-seals mono"><span>物联网修炼者</span><span>IoT Maker</span><span>Embedded × Cloud</span></div>
      </header>

      <div class="m-stats">
        ${stats.map((s2) => `<div class="m-stat card"><b class="mono">${escapeHtml(s2[0])}</b><span>${escapeHtml(s2[1])}</span></div>`).join('')}
      </div>

      <div class="m-grid">
        <div class="card m-card">
          <div class="sec-head"><span class="kicker">SKILLS</span><h2>能力矩阵</h2></div>
          ${skillRows}
        </div>
        <div class="card m-card m-card-dark">
          <div class="sec-head"><span class="kicker">TIMELINE</span><h2>行动记录</h2></div>
          <div class="m-tl">${tlRows}</div>
        </div>
      </div>

      <blockquote class="m-motto card">
        <p>「每一块点不亮的板子，都是登神长阶上的一级。」</p>
        <cite class="mono">— 座右铭 / MOTTO v3.0</cite>
      </blockquote>

      <div class="m-grid">
        <div class="card m-card">
          <div class="sec-head"><span class="kicker">GEAR</span><h2>装备与战线</h2></div>
          <div class="m-gears">${gearRows}</div>
        </div>
        <div class="card m-card m-card-dark">
          <div class="sec-head"><span class="kicker">BADGES</span><h2>徽章墙</h2></div>
          <div class="m-badges">${badgeRows}</div>
          <div class="sec-head" style="margin-top:18px"><span class="kicker">PROJECTS</span><h2>项目矩阵</h2></div>
          <div class="m-projs">${projRows}</div>
        </div>
      </div>

      <div class="m-contact card">
        <div class="sec-head"><span class="kicker">CONTACT</span><h2>建立连接</h2></div>
        <div class="links">
          <a class="btn" href="mailto:${escapeAttr(c.email || '')}">📧 EMAIL</a>
          <a class="btn alt" href="${escapeAttr(c.github || '#')}" target="_blank" rel="noopener">GITHUB</a>
          <a class="btn ghost" href="#/gallery">🖼 相册</a>
          <a class="btn ghost" href="#/drive">🗄 网盘</a>
          <a class="btn ghost" href="#/links">🍾 漂流瓶友链</a>
          <a class="btn ghost" href="#/chat">🎧 深夜电台</a>
        </div>
      </div>
    </section>`;
    el.hidden = false;
    jumpTop();
    if (window.Motion && window.Motion.ready) window.Motion.reveal(el);
    if (window.SFX && window.SFX.enabled) window.SFX.whoosh();
  }
  function viewCat(id) {
    const c = DATA.site.categories.find((x) => x.id === id);
    if (!c) { viewHome(); return; }
    const list = DATA.posts.filter((p) => p.category === id);
    $('#reader').hidden = true; $('#home').hidden = false;
    const arch = $('#archive'); if (arch) arch.hidden = true;
    const dv = $('#drive'); if (dv) dv.hidden = true;
    const gl = $('#gallery'); if (gl) gl.hidden = true;
    const me = $('#me'); if (me) me.hidden = true;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '栏目：' + c.name + ' · 夜神月博客';
    showList('栏目：' + c.name, list, false, { icon: c.icon, title: c.name, desc: c.desc, count: list.length });
    if (window.Motion && window.Motion.ready) window.Motion.reveal(document);
    else observeReveal();
    /* 过滤结果渲染在文章区（含 listHead），定位到栏目区会看不到结果 */
    jumpToSec('#posts-sec');
  }
  function viewTag(t) {
    const list = DATA.posts.filter((p) => (p.tags || []).includes(t));
    $('#reader').hidden = true; $('#home').hidden = false;
    const arch = $('#archive'); if (arch) arch.hidden = true;
    const dv = $('#drive'); if (dv) dv.hidden = true;
    const gl = $('#gallery'); if (gl) gl.hidden = true;
    const me = $('#me'); if (me) me.hidden = true;
    if ($('#readbar')) $('#readbar').hidden = true;
    document.title = '标签：#' + t + ' · 夜神月博客';
    showList('标签：#' + t, list, false, { icon: 'wave', title: '#' + t, desc: '包含标签「' + t + '」的文章', count: list.length });
    if (window.Motion && window.Motion.ready) window.Motion.reveal(document);
    else observeReveal();
    jumpToSec('#posts-sec');
  }
  async function viewArticle(id) {
    /* 支持 id 与 slug 两种寻址：优先精确匹配 id，其次 slug（便于用语义化链接分享） */
    const key = decodeURIComponent(id || '');
    const meta = DATA.posts.find((x) => x.id === key) || DATA.posts.find((x) => x.slug === key);
    if (!meta) { location.hash = '#/'; return; }
    /* 列表接口/静态索引不含正文：单独拉全量（含 content）；失败时降级用元数据（无正文仅提示）。
     * 静态模式按篇拉 data/posts/<id>.json（首次后内存缓存）；本地服务器走 /api/post/:id */
    let p = meta;
    try {
      if (window.IS_STATIC_BLOG && POST_CACHE[meta.id]) {
        p = POST_CACHE[meta.id];
      } else {
        const r = await fetch(window.IS_STATIC_BLOG
          ? 'data/posts/' + encodeURIComponent(meta.id) + '.json'
          : '/api/post/' + encodeURIComponent(meta.id));
        if (r.ok) { const j = await r.json(); p = j.post || j; if (window.IS_STATIC_BLOG) POST_CACHE[meta.id] = p; }
      }
    } catch (e) {}
    const lv = levelInfo(p.level);
    const rt = readingTime(p.content);
    const words = (p.content || '').replace(/\s/g, '').length;
    const rel = DATA.posts.filter((x) => x.id !== p.id && (x.category === p.category || (x.tags || []).some((t) => (p.tags || []).includes(t)))).slice(0, 3);
    const relHtml = rel.length ? `<section class="rel"><h3>相关文章</h3><div class="posts">${rel.map((x) => postCard(x, false)).join('')}</div></section>` : '';
    /* 列表与全量是两个对象，按 id 回列表里定位序号（indexOf 全量对象会 -1，翻页全断） */
    const idx = DATA.posts.findIndex((x) => x.id === meta.id);
    const prevPost = DATA.posts[idx - 1], nextPost = DATA.posts[idx + 1];
    const pnHtml = `<nav class="pn-nav">
      ${prevPost ? `<a class="btn ghost" href="#/post/${prevPost.id}">← 上一课</a>` : '<span></span>'}
      <span class="pn-count">第 ${idx + 1} / ${DATA.posts.length} 课</span>
      ${nextPost ? `<a class="btn ghost" href="#/post/${nextPost.id}">下一课 →</a>` : '<span></span>'}
    </nav>`;
    const archEl = $('#archive'); if (archEl) archEl.hidden = true;
    const dvEl = $('#drive'); if (dvEl) dvEl.hidden = true;
    const glEl = $('#gallery'); if (glEl) glEl.hidden = true;
    const meEl = $('#me'); if (meEl) meEl.hidden = true;
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
    jumpTop();
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
      return fetch(window.IS_STATIC_BLOG ? 'data/likes.json' : '/api/likes').then((r) => r.json())
        .then((d) => { likeCache = d.likes || {}; return likeCache; })
        .catch(() => ({}));
    };
    loadLikes().then(paintLike);
    if (likeBtn) likeBtn.addEventListener('click', () => {
      if (isLiked(p.id)) return;
      if (window.IS_STATIC_BLOG) {
        /* 静态托管：无写接口，本地计数 +1 过过瘾 */
        likeCache = likeCache || {};
        likeCache[p.id] = (likeCache[p.id] || 0) + 1;
        try {
          const arr = JSON.parse(localStorage.getItem(LIKE_KEY) || '[]');
          if (arr.indexOf(p.id) < 0) arr.push(p.id);
          localStorage.setItem(LIKE_KEY, JSON.stringify(arr));
        } catch (e) {}
        paintLike();
        likeBtn.classList.add('pop');
        setTimeout(() => likeBtn.classList.remove('pop'), 400);
        return;
      }
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
    const loadCmts = () => {
      if (window.IS_STATIC_BLOG) {
        /* 静态托管：读打包快照（按文章 id 分组），只读 */
        if (!loadCmts._cache) loadCmts._cache = fetch('data/comments.json').then((r) => r.json()).catch(() => ({}));
        return loadCmts._cache.then((m) => m[p.id] || []);
      }
      return fetch('/api/comments?post=' + encodeURIComponent(p.id)).then((r) => r.json()).then((d) => d.comments || []);
    };
    loadCmts().then(renderCmts).catch(() => { if (listEl) listEl.innerHTML = '<p class="cmt-empty">留言加载失败，稍后刷新再试</p>'; });
    const send = $('#cmtSend');
    if (send) send.addEventListener('click', () => {
      const text = $('#cmtText').value.trim();
      if (!text) { if (tipEl) tipEl.textContent = '先写点什么吧'; return; }
      if (window.IS_STATIC_BLOG) { if (tipEl) tipEl.textContent = '静态托管模式下留言暂停，欢迎到 GitHub 仓库的 issue 区找我 ✉'; return; }
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
      `${s.slogan || ''} ${DATA.posts.length} 节小白向课程，${(s.categories || []).length} 个专业方向。`.trim());
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
      push({ kind: '动作', icon: '🖼', title: '打开照片墙', run: () => { location.hash = '#/gallery'; } });
      push({ kind: '动作', icon: '🕶', title: '查看个人主页', run: () => { location.hash = '#/me'; } });
      push({ kind: '动作', icon: '⚙️', title: '特效中心（开关全部特效）', run: () => { /* 面板内容由 fxcenter 惰性构建，直接走按钮的打开路径才不会开出空面板 */ const b = document.getElementById('fxBtn'); if (b) b.click(); } });
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
    $('#navLinks').querySelectorAll('a[data-nav]').forEach((a) => {
      const t = a.getAttribute('data-nav');
      a.classList.toggle('active', t === h || (t.startsWith('#/') && h.startsWith(t) && t !== '#/'));
    });
    /* 子项命中时点亮所属下拉的顶级按钮 */
    document.querySelectorAll('.nav-drop').forEach((d) => {
      d.querySelector('.nav-drop-btn').classList.toggle('active', !!d.querySelector('a.active'));
    });
  }
  const VIEW_IDS = ['home', 'reader', 'archive', 'drive', 'gallery', 'me', 'linksPage', 'wall', 'chat'];
  function route() {
    if (window.Motion && window.Motion.ready) window.Motion.killAll();
    /* 离开聊天室：轮询/心跳随路由清理（直接点导航不点「退出」也要停表） */
    if ((location.hash || '#/') !== '#/chat') stopChatTimers();
    if (window.Motion && window.Motion.ready) window.Motion.wipe();
    /* 统一清扫全部视图容器，再由具体视图自行点亮自己 */
    VIEW_IDS.forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; });
    const h = location.hash || '#/';
    setNavActive(h);
    /* 静态托管下，直接输入网盘/相册地址的访客引导回首页（这两个页面依赖服务器 API） */
    if (window.IS_STATIC_BLOG && (h.startsWith('#/drive') || h.startsWith('#/gallery'))) { location.replace('#/'); return; }
    if (h.startsWith('#/post/')) viewArticle(h.split('/')[2]);
    else if (h.startsWith('#/cat/')) viewCat(h.split('/')[2]);
    else if (h.startsWith('#/tag/')) viewTag(decodeURIComponent(h.split('/')[2]));
    else if (h.startsWith('#/archive')) viewArchive();
    else if (h.startsWith('#/drive')) viewDrive();
    else if (h.startsWith('#/gallery')) viewGallery();
    else if (h.startsWith('#/links')) viewLinks();
    else if (h.startsWith('#/wall')) viewWall();
    else if (h.startsWith('#/chat')) viewChat();
    else if (h.startsWith('#/me')) viewMe();
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
      if (!r || !r.ok) {
        /* 静态托管：优先轻量索引（无正文，首屏体积 911KB→~90KB）；旧版全量 site.json 兜底 */
        r = await fetch('data/index.json').catch(() => null);
        if (!r || !r.ok) r = await fetch('data/site.json').catch(() => null);
        window.IS_STATIC_BLOG = true;
      } /* 相对路径：兼容 GitHub Pages 子路径托管 */
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
    /* 网盘预览弹层：遮罩/ESC 触点关闭 + 复制直链 */
    const dpBox = $('#drivePreview');
    if (dpBox) {
      dpBox.querySelector('.cmdk-mask').addEventListener('click', closeDrivePreview);
      const dc = $('#dpClose');
      if (dc) dc.addEventListener('click', closeDrivePreview);
      const cp = $('#dpCopy');
      if (cp) cp.addEventListener('click', (e) => {
        e.preventDefault();
        if (!DRIVE.cur) return;
        const link = location.origin + driveURL(DRIVE.cur, 'api/drive/download');
        const done = () => { cp.textContent = '✓ 已复制'; setTimeout(() => { cp.textContent = '🔗 复制直链'; }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(done).catch(() => {});
        } else {
          const ta = document.createElement('textarea');
          ta.value = link; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); done(); } catch (err) {}
          ta.remove();
        }
      });
    }
    const ci = $('#cmdkInput');
    if (ci) {
      ci.addEventListener('input', renderCmdk);
      ci.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); cmdkMove(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkMove(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); cmdkRun(CMDK.sel); }
      });
    }
    /* 灯箱：点击（遮罩或图片）任意位置关闭 */
    const lbNow = $('#lightbox');
    if (lbNow && !lbNow._closeBound) {
      lbNow._closeBound = true;
      lbNow.addEventListener('click', () => { lbNow.hidden = true; });
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
      /* 通知 fxcenter 同步 fxSettings.sfx 与面板勾选态（S 键与按钮共用此路径） */
      document.dispatchEvent(new CustomEvent('sfxchange'));
    }
    const sb = $('#sfxBtn');
    if (sb) {
      sb.textContent = (window.SFX && SFX.enabled) ? '🔊' : '🔇';
      sb.addEventListener('click', syncSfxBtn);
    }
    if (window.FX && FX.ready) FX.tilt();
    /* 看板娘：等页面 load 完再空闲加载（~1.4MB 模型不抢首屏带宽），手机窄屏不加载 */
    if (window.FXS && window.FXS.get('waifu') && matchMedia('(min-width: 900px)').matches) {
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2000));
      if (document.readyState === 'complete') setTimeout(() => idle(() => window.FXS.loadWaifu(), { timeout: 10000 }), 2500);
      else window.addEventListener('load', () => setTimeout(() => idle(() => window.FXS.loadWaifu(), { timeout: 10000 }), 2500));
    }
    document.addEventListener('fxchange', function (e) {
      if (e.detail && e.detail.key === 'waifu' && e.detail.on) window.FXS.loadWaifu();
    });
    if (window.ACH) ACH.firstVisit();
    route();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
