/* 夜神月博客 · 后台管理逻辑（零依赖，健壮版） */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const token = () => localStorage.getItem('adminToken');

  /* ---- 主题 ---- */
  function loadTheme() {
    const t = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
    const b = $('#themeBtn'); if (b) b.textContent = t === 'dark' ? '☀' : '🌙';
  }
  function toggleTheme() {
    const nx = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nx);
    localStorage.setItem('theme', nx);
    $('#themeBtn').textContent = nx === 'dark' ? '☀' : '🌙';
  }

  /* ---- API 封装：统一错误抛出，调用方用 try/catch 捕获 ---- */
  async function api(method, path, body) {
    const opt = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token() || '') },
    };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const r = await fetch(path, opt);
    let data = {};
    try { data = await r.json(); } catch (e) { /* 可能无响应体 */ }
    if (r.status === 401) { logout('登录已失效，请重新登录'); throw new Error('登录已失效，请重新登录'); }
    if (!r.ok) throw new Error(data.error || ('请求失败（' + r.status + '）'));
    return data;
  }

  function showMsg(sel, txt, ok) {
    const e = $(sel); if (!e) return;
    e.textContent = txt;
    e.className = ok ? 'ok' : 'hint err';
    clearTimeout(showMsg._t);
    showMsg._t = setTimeout(() => { e.textContent = ''; e.className = 'hint'; }, 4000);
  }
  function logout(reason) {
    localStorage.removeItem('adminToken');
    $('#loginView').classList.remove('hidden');
    $('#dashView').classList.add('hidden');
    if (reason) $('#loginMsg').textContent = reason;
  }

  let SITE = null, POSTS = [];

  /* ---- 工具 ---- */
  function toLines(arr) { return (arr || []).map((x) => `${x.name || ''}|${x.url || ''}|${x.desc || ''}`).join('\n'); }
  function fromLines(txt) {
    return String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => { const [name, url, desc] = l.split('|'); return { name, url, desc: desc || '' }; });
  }

  /* ---- 登录 ---- */
  async function doLogin() {
    const pw = $('#passInput').value;
    try {
      const j = await api('POST', '/api/login', { password: pw });
      localStorage.setItem('adminToken', j.token);
      await enterDash();
    } catch (e) { $('#loginMsg').textContent = e.message; }
  }

  async function enterDash() {
    $('#loginView').classList.add('hidden');
    $('#dashView').classList.remove('hidden');
    try {
      const d = await api('GET', '/api/admin');
      SITE = d.site; POSTS = d.posts || [];
      renderPosts(); renderSiteForm(); renderStats();
      showMsg('#loginMsg', '', true);
    } catch (e) {
      // api 内部 401 已触发 logout，这里无需重复处理
    }
  }

  /* ---- 文章管理 ---- */
  /* 统计面板：总篇数 / 总字数 / 代码块 / 表格 / 栏目分布 */
  function renderStats() {
    const bar = $('#statsBar');
    if (!bar) return;
    let words = 0, codes = 0, tables = 0;
    const byCat = {};
    for (const p of POSTS) {
      const c = p.content || '';
      words += c.length;
      codes += Math.floor((c.match(/```/g) || []).length / 2);
      tables += (c.match(/^\|.+\|$/gm) || []).length;
      byCat[p.category] = (byCat[p.category] || 0) + 1;
    }
    const catName = (id) => { const c = (SITE && SITE.cats || []).find((x) => x.id === id); return c ? c.name : id; };
    const dist = Object.entries(byCat).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<span class="sb-chip">${escapeHtml(catName(k))} <b>${v}</b></span>`).join('');
    bar.innerHTML =
      `<div class="sb-item"><b>${POSTS.length}</b><span>文章</span></div>` +
      `<div class="sb-item"><b>${words.toLocaleString()}</b><span>累计字数</span></div>` +
      `<div class="sb-item"><b>${codes}</b><span>代码块</span></div>` +
      `<div class="sb-item"><b>${tables}</b><span>表格行</span></div>` +
      `<div class="sb-dist">${dist}</div>`;
  }

  /* 一键备份：下载整站数据 JSON（site + posts） */
  function downloadBackup() {
    const payload = { exportedAt: new Date().toISOString(), site: SITE, posts: POSTS };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yeshenyue-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    showMsg('#saveMsg', '备份已开始下载', true);
  }

  function renderPosts() {
    $('#postCount').textContent = POSTS.length;
    const list = $('#postList');
    if (!POSTS.length) { list.innerHTML = '<p class="hint">还没有文章，点「+ 写新文章」开始。'; return; }
    list.innerHTML = POSTS.map((p) =>
      `<div class="list-item"><div><strong>${escapeHtml(p.title)}</strong> <span class="hint">· ${p.date} · ${(p.tags || []).join('/')}</span></div>
       <div class="row"><button class="btn mini alt" data-edit="${p.id}">编辑</button><button class="btn mini del" data-del="${p.id}">删除</button></div></div>`
    ).join('');
    list.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openPost(b.dataset.edit));
    list.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => delPost(b.dataset.del));
  }
  function openPost(id) {
    const p = POSTS.find((x) => x.id === id);
    $('#postForm').classList.remove('hidden');
    $('#f_id').value = p ? p.id : '';
    $('#f_title').value = p ? p.title : '';
    $('#f_cat').value = p ? p.category : (SITE.categories[0] && SITE.categories[0].id) || '';
    $('#f_date').value = p ? p.date : new Date().toISOString().slice(0, 10);
    $('#f_feat').checked = p ? !!p.featured : false;
    $('#f_slug').value = p ? (p.slug || '') : '';
    $('#f_tags').value = p ? (p.tags || []).join(', ') : '';
    $('#f_excerpt').value = p ? (p.excerpt || '') : '';
    $('#f_content').value = p ? (p.content || '') : '';
    showMsg('#saveMsg', '', true);
    $('#postForm').scrollIntoView({ behavior: 'smooth' });
  }
  function delPost(id) {
    const p = POSTS.find((x) => x.id === id);
    if (!confirm('确认删除《' + (p ? p.title : '该文章') + '》？此操作不可撤销。')) return;
    (async () => {
      try {
        await api('DELETE', '/api/admin/posts/' + id);
        POSTS = POSTS.filter((x) => x.id !== id);
        renderPosts();
        showMsg('#saveMsg', '已删除', true);
      } catch (e) { showMsg('#saveMsg', '删除失败：' + e.message, false); }
    })();
  }
  async function savePost() {
    const id = $('#f_id').value;
    const title = $('#f_title').value.trim();
    const cat = $('#f_cat').value;
    if (!title) { showMsg('#saveMsg', '请填写标题', false); $('#f_title').focus(); return; }
    if (!cat) { showMsg('#saveMsg', '请选择栏目', false); return; }
    const post = {
      title,
      category: cat,
      date: $('#f_date').value || new Date().toISOString().slice(0, 10),
      featured: $('#f_feat').checked,
      slug: $('#f_slug').value.trim(),
      tags: $('#f_tags').value.split(',').map((s) => s.trim()).filter(Boolean),
      excerpt: $('#f_excerpt').value.trim(),
      content: $('#f_content').value,
    };
    const btn = $('#savePost'); btn.disabled = true; btn.textContent = '保存中…';
    try {
      let j;
      if (id) { j = await api('PUT', '/api/admin/posts/' + id, { post }); const i = POSTS.findIndex((x) => x.id === id); if (i >= 0) POSTS[i] = j.post; showMsg('#saveMsg', '已更新', true); }
      else { j = await api('POST', '/api/admin/posts', { post }); POSTS.unshift(j.post); showMsg('#saveMsg', '已发布', true); }
      renderPosts();
      $('#postForm').classList.add('hidden');
    } catch (e) {
      showMsg('#saveMsg', '保存失败：' + e.message, false);
    } finally {
      btn.disabled = false; btn.textContent = '保存文章';
    }
  }

  /* ---- 配图上传 ---- */
  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  async function uploadImage() {
    const f = $('#f_img').files[0];
    if (!f) { showMsg('#saveMsg', '请先选择图片文件', false); return; }
    const btn = $('#uploadImg'); btn.disabled = true; btn.textContent = '上传中…';
    try {
      const data = await fileToBase64(f);
      const j = await api('POST', '/api/admin/upload', { filename: f.name, data });
      const cur = $('#f_content').value;
      $('#f_content').value = (cur ? cur + '\n\n' : '') + '![' + (f.name || 'image') + '](' + j.url + ')';
      showMsg('#saveMsg', '图片已上传并插入正文', true);
    } catch (e) { showMsg('#saveMsg', '上传失败：' + e.message, false); }
    finally { btn.disabled = false; btn.textContent = '上传并插入'; }
  }

  /* ---- 站点设置 ---- */
  function renderSiteForm() {
    const s = SITE;
    $('#s_title').value = s.title || '';
    $('#s_slogan').value = s.slogan || '';
    $('#s_about').value = s.about || '';
    $('#s_tech').value = (s.techStack || []).join(', ');
    $('#s_tags').value = (s.tags || []).join(', ');
    $('#s_email').value = (s.contact && s.contact.email) || '';
    $('#s_github').value = (s.contact && s.contact.github) || '';
    $('#s_projects').value = toLines(s.contact && s.contact.projects);
    $('#s_links').value = toLines(s.friendLinks);
    $('#f_cat').innerHTML = (s.categories || []).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    renderCats();
  }
  function renderCats() {
    $('#catList').innerHTML = (SITE.categories || []).map((c, i) =>
      `<div class="list-item"><div><strong>${escapeHtml(c.name)}</strong> <span class="hint">· ${c.icon} · ${escapeHtml(c.desc || '')}</span></div>
       <div class="row"><button class="btn mini del" data-cat="${i}">删除</button></div></div>`).join('');
    $('#catList').querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => {
      if (!confirm('删除栏目「' + SITE.categories[Number(b.dataset.cat)].name + '」？已归档文章不会删除但会失去栏目归属。')) return;
      SITE.categories.splice(Number(b.dataset.cat), 1); renderCats();
    });
  }
  async function saveSite() {
    const site = {
      title: $('#s_title').value.trim(),
      slogan: $('#s_slogan').value.trim(),
      about: $('#s_about').value.trim(),
      techStack: $('#s_tech').value.split(',').map((s) => s.trim()).filter(Boolean),
      tags: $('#s_tags').value.split(',').map((s) => s.trim()).filter(Boolean),
      contact: {
        email: $('#s_email').value.trim(),
        github: $('#s_github').value.trim(),
        projects: fromLines($('#s_projects').value),
      },
      friendLinks: fromLines($('#s_links').value),
      categories: SITE.categories,
      stats: SITE.stats,
    };
    if (!site.title) { showMsg('#saveMsg', '站点标题不能为空', false); return; }
    const btn = $('#saveSite'); btn.disabled = true; btn.textContent = '保存中…';
    try {
      await api('PUT', '/api/admin/site', { site });
      SITE = Object.assign({}, SITE, site);
      renderSiteForm();
      showMsg('#saveMsg', '站点设置已保存', true);
    } catch (e) { showMsg('#saveMsg', '保存失败：' + e.message, false); }
    finally { btn.disabled = false; btn.textContent = '保存站点设置'; }
  }
  function addCat() {
    const name = $('#c_name').value.trim();
    if (!name) { showMsg('#saveMsg', '请填写栏目名', false); return; }
    SITE.categories.push({ id: 'cat' + Date.now().toString(36), name, icon: $('#c_icon').value, desc: $('#c_desc').value.trim() });
    $('#c_name').value = ''; $('#c_desc').value = '';
    renderCats();
  }
  async function savePwd() {
    if ($('#p_new').value !== $('#p_new2').value) { showMsg('#saveMsg', '两次新密码不一致', false); return; }
    try {
      await api('PUT', '/api/admin/password', { current: $('#p_cur').value, next: $('#p_new').value });
      showMsg('#saveMsg', '密码已修改，请用新密码重新登录', true);
      setTimeout(() => logout(), 1200);
    } catch (e) { showMsg('#saveMsg', '修改失败：' + e.message, false); }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---- 资源网盘管理 ---- */
  const MAX_DRIVE = 30 * 1024 * 1024;
  let DRIVE_FILES = null;
  let DRIVE_DL = {}; // 网盘下载计数
  let GALLERY_LOADED = false;
  let COMMENTS_LOADED = false;
  let VISITORS_LOADED = false;
  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';

  async function loadDrive() {
    const j = await api('GET', '/api/drive'); // 网盘已加密：带 admin token（服务端放行管理员）
    DRIVE_FILES = j.files || [];
    DRIVE_DL = j.downloads || {};
    $('#d_stat').textContent = `（${j.fileCount || 0} 文件 · ${j.dirCount || 0} 目录 · ${fmtSize(j.totalSize || 0)}）`;
    renderDriveList();
  }
  function renderDriveList() {
    const list = $('#d_list');
    if (!DRIVE_FILES) { list.innerHTML = '<p class="hint">加载中…</p>'; return; }
    if (!DRIVE_FILES.length) { list.innerHTML = '<p class="hint">网盘是空的，先上传几个文件吧。</p>'; return; }
    /* 按目录分组展示：目录内文件聚在一起，目录名做小标题 */
    const dirs = {};
    for (const f of DRIVE_FILES) {
      const dir = f.type === 'dir' ? f.path : f.path.split('/').slice(0, -1).join('/');
      (dirs[dir || '/'] = dirs[dir || '/'] || { dirs: [], files: [] });
      if (f.type === 'dir') dirs[dir || '/'].dirs.push(f);
      else dirs[dir || '/'].files.push(f);
    }
    const keys = Object.keys(dirs).sort();
    list.innerHTML = keys.map((k) => {
      const g = dirs[k];
      const head = k === '/' ? '' : `<h3 class="hint" style="margin:14px 0 8px">📁 ${escapeHtml(k)}/</h3>`;
      const rows = g.files.map((f) =>
        `<div class="list-item"><div><strong>${escapeHtml(f.name)}</strong> <span class="hint">· ${fmtSize(f.size)} · ${new Date(f.mtime).toISOString().slice(0, 10)}</span></div>
         <div class="row"><a class="btn mini alt" href="/api/drive/download?file=${encodeURIComponent(f.path)}&token=${encodeURIComponent(token() || '')}" download>下载${DRIVE_DL[f.path] ? ` <span class="hint">×${DRIVE_DL[f.path]}</span>` : ''}</a>
         <button class="btn mini del" data-ddel="${escapeHtml(f.path)}">删除</button></div></div>`).join('')
        + g.dirs.map((d) =>
        `<div class="list-item"><div>📁 <strong>${escapeHtml(d.name)}/</strong> <span class="hint">· 目录</span></div>
         <div class="row"><button class="btn mini del" data-ddel="${escapeHtml(d.path)}">删除</button></div></div>`).join('');
      return head + rows;
    }).join('');
    list.querySelectorAll('[data-ddel]').forEach((b) => b.onclick = () => delDrive(b.dataset.ddel));
  }
  async function delDrive(p) {
    if (!confirm('确认删除「' + p + '」？目录会连同里面所有文件一起删除，不可恢复。')) return;
    try {
      await api('DELETE', '/api/admin/drive', { path: p });
      showMsg('#saveMsg', '已删除', true);
      await loadDrive();
    } catch (e) { showMsg('#saveMsg', '删除失败：' + e.message, false); }
  }
  async function uploadDrive() {
    const f = $('#d_file').files[0];
    const dir = ($('#d_dir').value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!f) { showMsg('#saveMsg', '请先选择文件', false); return; }
    if (f.size > MAX_DRIVE) { showMsg('#saveMsg', '文件超过 30MB 上限', false); return; }
    const path = (dir ? dir + '/' : '') + f.name;
    if (/[\\<>:"|?*]/.test(path) || path.split('/').some((s) => !s || s === '.' || s === '..')) {
      showMsg('#saveMsg', '目录/文件名含非法字符', false); return;
    }
    const btn = $('#d_upload'); btn.disabled = true; btn.textContent = '上传中…';
    try {
      const data = await fileToBase64(f);
      await api('POST', '/api/admin/drive/upload', { path, data });
      showMsg('#saveMsg', '已上传：' + path, true);
      $('#d_file').value = '';
      await loadDrive();
    } catch (e) { showMsg('#saveMsg', '上传失败：' + e.message, false); }
    finally { btn.disabled = false; btn.textContent = '上传'; }
  }
  async function mkdirDrive() {
    const name = $('#d_newdir').value.trim();
    if (!name) { showMsg('#saveMsg', '请填写目录名', false); return; }
    if (/[\\<>:"|?*]/.test(name) || name.split('/').some((s) => !s || s === '.' || s === '..')) {
      showMsg('#saveMsg', '目录名含非法字符', false); return;
    }
    try {
      await api('POST', '/api/admin/drive/mkdir', { path: name });
      showMsg('#saveMsg', '目录已创建：' + name, true);
      $('#d_newdir').value = '';
      await loadDrive();
    } catch (e) { showMsg('#saveMsg', '创建失败：' + e.message, false); }
  }

  /* ---- 修改网盘访问口令 ---- */
  async function saveDrivePass() {
    const np = $('#d_pass').value;
    if (np.length < 4) { showMsg('#d_passmsg', '口令至少 4 位', false); return; }
    try {
      await api('POST', '/api/admin/drive/lock', { newPass: np });
      $('#d_pass').value = '';
      showMsg('#d_passmsg', '✓ 口令已修改，所有已解锁访客需重新解锁', true);
    } catch (e) { showMsg('#d_passmsg', '修改失败：' + e.message, false); }
  }

  /* ---- 照片墙管理 ---- */
  async function loadGallery() {
    const j = await api('GET', '/api/admin/gallery');
    const photos = j.photos || [];
    GALLERY_LOADED = true;
    $('#g_count').textContent = `（${photos.length} 张）`;
    const list = $('#g_list');
    list.innerHTML = photos.length ? photos.map((p) => `
      <div class="list-item">
        <div style="display:flex;gap:12px;align-items:center">
          <img src="${escapeHtml(p.src)}" alt="" style="width:64px;height:48px;object-fit:cover;border:2px solid #0a0a0a;border-radius:6px" />
          <div><strong>${escapeHtml(p.title)}</strong> <span class="hint">· ${escapeHtml(p.src)}</span>
          <br><span class="hint">胶带 ${escapeHtml(p.tape)} · 旋转 ${escapeHtml(String(p.rot))}°${p.cap ? ' · ' + escapeHtml(p.cap) : ''}</span></div>
        </div>
        <button class="btn mini" data-gid="${escapeHtml(p.id)}" data-gtitle="${escapeHtml(p.title)}">删除</button>
      </div>`).join('') : '<p class="hint">墙上还没有照片。</p>';
    list.querySelectorAll('button[data-gid]').forEach((b) => b.onclick = async () => {
      if (!confirm(`删除照片「${b.dataset.gtitle}」？`)) return;
      try {
        await api('DELETE', '/api/admin/gallery', { id: b.dataset.gid });
        showMsg('#g_msg', '已删除', true);
        await loadGallery();
      } catch (e) { showMsg('#g_msg', '删除失败：' + e.message, false); }
    });
  }
  async function saveGalleryPhoto() {
    const src = $('#g_src').value.trim();
    if (!src) { showMsg('#g_msg', '请填写图片地址', false); return; }
    try {
      await api('POST', '/api/admin/gallery', {
        src,
        title: $('#g_title').value.trim(),
        cap: $('#g_cap').value.trim(),
        rot: Number($('#g_rot').value) || 0,
        tape: $('#g_tape').value,
      });
      showMsg('#g_msg', '✓ 已贴上照片墙', true);
      $('#g_src').value = ''; $('#g_title').value = ''; $('#g_cap').value = '';
      await loadGallery();
    } catch (e) { showMsg('#g_msg', '保存失败：' + e.message, false); }
  }

  /* ---- 留言管理 ---- */
  async function loadComments() {
    const j = await api('GET', '/api/admin/comments');
    const list = j.comments || [];
    COMMENTS_LOADED = true;
    $('#cm_count').textContent = `（${list.length} 条）`;
    const box = $('#cm_list');
    box.innerHTML = list.length ? list.map((c) => `
      <div class="list-item">
        <div><strong>${escapeHtml(c.name || '匿名')}</strong> <span class="hint">· ${new Date(c.t).toLocaleString('zh-CN')} · 文章 ${escapeHtml((c.post || '').slice(0, 10))} · IP ${escapeHtml(c.ip || '-')}</span>
          <br>${escapeHtml(c.text || '')}</div>
        <button class="btn mini" data-cid="${escapeHtml(c.id || '')}">删除</button>
      </div>`).join('') : '<p class="hint">还没有留言。</p>';
    box.querySelectorAll('button[data-cid]').forEach((b) => b.onclick = async () => {
      if (!confirm('删除这条留言？')) return;
      try {
        await api('DELETE', '/api/admin/comments?id=' + encodeURIComponent(b.dataset.cid));
        showMsg('#saveMsg', '留言已删除', true);
        await loadComments();
      } catch (e) { showMsg('#saveMsg', '删除失败：' + e.message, false); }
    });
  }

  /* ---- 访客与安全 ---- */
  async function loadVisitors() {
    const [v, bn, wt] = await Promise.all([
      api('GET', '/api/admin/visits'),
      api('GET', '/api/admin/banned'),
      api('GET', '/api/admin/watch'),
    ]);
    VISITORS_LOADED = true;
    const days = v.days || {};
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    $('#v_stats').innerHTML = `
      <div><b>${v.total || 0}</b><span class="hint"> 总访问 PV</span></div>
      <div><b>${v.unique || 0}</b><span class="hint"> 独立访客 UV</span></div>
      <div><b>${days[today] || 0}</b><span class="hint"> 今日</span></div>
      <div><b>${days[yesterday] || 0}</b><span class="hint"> 昨日</span></div>
      <div><b>${(bn.banned || []).length}</b><span class="hint"> 黑名单</span></div>
      <div><b>${(wt.watch || []).length}</b><span class="hint"> 可疑 IP</span></div>`;
    const bl = $('#v_banlist');
    bl.innerHTML = (bn.banned || []).length ? bn.banned.map((ip) => `
      <span class="list-item" style="display:inline-flex;gap:8px;align-items:center;margin:0 8px 8px 0;padding:6px 12px">
        <b class="mono">${escapeHtml(ip)}</b><button class="btn mini alt" data-unban="${escapeHtml(ip)}">解封</button></span>`).join('')
      : '<p class="hint">黑名单为空，天下太平。</p>';
    bl.querySelectorAll('button[data-unban]').forEach((b) => b.onclick = async () => {
      try {
        await api('DELETE', '/api/admin/banned', { ip: b.dataset.unban });
        showMsg('#saveMsg', '已解封 ' + b.dataset.unban, true);
        await loadVisitors();
      } catch (e) { showMsg('#saveMsg', '解封失败：' + e.message, false); }
    });
    const wbox = $('#v_watch');
    wbox.innerHTML = (wt.watch || []).length ? wt.watch.slice(0, 30).map((w) => `
      <div class="list-item">
        <div><b class="mono">${escapeHtml(w.ip)}</b> <span class="hint">· 失败 ${w.count} 次 · ${escapeHtml((w.reason || '').replace('admin-login-fail', '后台登录').replace('drive-unlock-fail', '网盘解锁'))} · ${new Date(w.last).toLocaleString('zh-CN')}</span></div>
        <button class="btn mini" data-ban="${escapeHtml(w.ip)}">一键拉黑</button>
      </div>`).join('') : '<p class="hint">暂无可疑行为记录。</p>';
    wbox.querySelectorAll('button[data-ban]').forEach((b) => b.onclick = async () => {
      try {
        await api('POST', '/api/admin/banned', { ip: b.dataset.ban });
        showMsg('#saveMsg', '已拉黑 ' + b.dataset.ban, true);
        await loadVisitors();
      } catch (e) { showMsg('#saveMsg', '拉黑失败：' + e.message, false); }
    });
    const rc = $('#v_recent');
    rc.innerHTML = (v.recent || []).length ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr><th style="text-align:left;padding:6px;border-bottom:2px solid #0a0a0a">时间</th><th style="text-align:left;padding:6px;border-bottom:2px solid #0a0a0a">IP</th><th style="text-align:left;padding:6px;border-bottom:2px solid #0a0a0a">路径</th></tr></thead>
      <tbody>${v.recent.map((r) => `<tr><td style="padding:5px 6px;border-bottom:1px solid #eee">${new Date(r.t).toLocaleTimeString('zh-CN')}</td><td style="padding:5px 6px;border-bottom:1px solid #eee" class="mono">${escapeHtml(r.ip)}</td><td style="padding:5px 6px;border-bottom:1px solid #eee" class="mono">${escapeHtml(r.path)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="hint">暂无访问记录。</p>';
  }
  async function banIp() {
    const ip = $('#v_ip').value.trim();
    if (!ip) { showMsg('#saveMsg', '请填写要拉黑的 IP', false); return; }
    try {
      await api('POST', '/api/admin/banned', { ip });
      $('#v_ip').value = '';
      showMsg('#saveMsg', '已拉黑 ' + ip, true);
      await loadVisitors();
    } catch (e) { showMsg('#saveMsg', '拉黑失败：' + e.message, false); }
  }

  /* ---- 初始化 ---- */
  function init() {
    loadTheme();
    $('#themeBtn').onclick = toggleTheme;
    $('#logout').onclick = () => logout();
    $('#loginBtn').onclick = doLogin;
    $('#passInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    $('#newPost').onclick = () => openPost('');
    $('#savePost').onclick = savePost;
    $('#uploadImg').onclick = uploadImage;
    $('#cancelPost').onclick = () => $('#postForm').classList.add('hidden');
    $('#saveSite').onclick = saveSite;
    $('#addCat').onclick = addCat;
    $('#savePwd').onclick = savePwd;
    $('#backupBtn').onclick = downloadBackup;
    $('#d_upload').onclick = uploadDrive;
    $('#d_mkdir').onclick = mkdirDrive;
    $('#d_savepass').onclick = saveDrivePass;
    $('#g_save').onclick = saveGalleryPhoto;
    $('#g_refresh').onclick = () => loadGallery().catch((e) => showMsg('#g_msg', '刷新失败：' + e.message, false));
    $('#cm_refresh').onclick = () => loadComments().catch((e) => showMsg('#saveMsg', '刷新失败：' + e.message, false));
    $('#v_refresh').onclick = () => loadVisitors().catch((e) => showMsg('#saveMsg', '刷新失败：' + e.message, false));
    $('#v_ban').onclick = banIp;
    $('#d_refresh').onclick = () => loadDrive().catch((e) => showMsg('#saveMsg', '刷新失败：' + e.message, false));
    document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      ['posts', 'drive', 'gallery', 'comments', 'visitors', 'site', 'pwd'].forEach((t) => $('#tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
      if (b.dataset.tab === 'drive' && DRIVE_FILES === null) loadDrive().catch((e) => showMsg('#saveMsg', '加载失败：' + e.message, false));
      if (b.dataset.tab === 'gallery' && !GALLERY_LOADED) loadGallery().catch((e) => showMsg('#saveMsg', '加载失败：' + e.message, false));
      if (b.dataset.tab === 'comments' && !COMMENTS_LOADED) loadComments().catch((e) => showMsg('#saveMsg', '加载失败：' + e.message, false));
      if (b.dataset.tab === 'visitors' && !VISITORS_LOADED) loadVisitors().catch((e) => showMsg('#saveMsg', '加载失败：' + e.message, false));
    });
    if (token()) enterDash();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
