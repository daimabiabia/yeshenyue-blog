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
      renderPosts(); renderSiteForm();
      showMsg('#loginMsg', '', true);
    } catch (e) {
      // api 内部 401 已触发 logout，这里无需重复处理
    }
  }

  /* ---- 文章管理 ---- */
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
    document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      ['posts', 'site', 'pwd'].forEach((t) => $('#tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
    });
    if (token()) enterDash();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
