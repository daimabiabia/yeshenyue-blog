/* 夜神月博客 · 后台管理逻辑 */
(function () {
  const $ = (s) => document.querySelector(s);
  const token = localStorage.getItem('adminToken');

  function loadTheme() {
    const t = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
    const b = $('#themeBtn'); if (b) b.textContent = t === 'dark' ? '☀' : '🌙';
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const nx = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nx);
    localStorage.setItem('theme', nx);
    $('#themeBtn').textContent = nx === 'dark' ? '☀' : '🌙';
  }

  async function api(method, path, body) {
    const opt = { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('adminToken') || '') } };
    if (body) opt.body = JSON.stringify(body);
    const r = await fetch(path, opt);
    if (r.status === 401) { logout(); throw new Error('登录已失效，请重新登录'); }
    return r.json();
  }
  function showMsg(el, txt, ok) { const e = $(el); e.textContent = txt; e.className = ok ? 'ok' : 'hint'; setTimeout(() => e.textContent = '', 3000); }
  function logout() { localStorage.removeItem('adminToken'); location.reload(); }

  let SITE = null, POSTS = [];

  function toLines(arr) { return arr.map(x => `${x.name}|${x.url}|${x.desc || ''}`).join('\n'); }
  function fromLines(txt) { return txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [name, url, desc] = l.split('|'); return { name, url, desc: desc || '' }; }); }

  /* ---- 登录 ---- */
  async function doLogin() {
    const pw = $('#passInput').value;
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      const j = await r.json();
      if (!r.ok) { $('#loginMsg').textContent = j.error || '登录失败'; return; }
      localStorage.setItem('adminToken', j.token);
      enterDash();
    } catch (e) { $('#loginMsg').textContent = '网络错误'; }
  }

  async function enterDash() {
    $('#loginView').classList.add('hidden');
    $('#dashView').classList.remove('hidden');
    try {
      const d = await api('GET', '/api/admin');
      SITE = d.site; POSTS = d.posts;
      renderPosts(); renderSiteForm();
    } catch (e) { $('#loginMsg').textContent = e.message; }
  }

  /* ---- 文章 ---- */
  function renderPosts() {
    $('#postCount').textContent = POSTS.length;
    $('#postList').innerHTML = POSTS.map(p =>
      `<div class="list-item"><div><strong>${p.title}</strong> <span class="hint">· ${p.date} · ${(p.tags || []).join('/')}</span></div>
       <div class="row"><button class="btn mini alt" data-edit="${p.id}">编辑</button><button class="btn mini del" data-del="${p.id}">删除</button></div></div>`
    ).join('');
    $('#postList').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openPost(b.dataset.edit));
    $('#postList').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('确认删除《' + (POSTS.find(p => p.id === b.dataset.del).title) + '》？')) return;
      await api('DELETE', '/api/admin/posts/' + b.dataset.del);
      POSTS = POSTS.filter(p => p.id !== b.dataset.del); renderPosts();
    });
  }
  function openPost(id) {
    const p = POSTS.find(x => x.id === id);
    $('#postForm').classList.remove('hidden');
    $('#f_id').value = p ? p.id : '';
    $('#f_title').value = p ? p.title : '';
    $('#f_cat').value = p ? p.category : (SITE.categories[0] && SITE.categories[0].id);
    $('#f_date').value = p ? p.date : new Date().toISOString().slice(0, 10);
    $('#f_feat').checked = p ? !!p.featured : false;
    $('#f_slug').value = p ? (p.slug || '') : '';
    $('#f_tags').value = p ? (p.tags || []).join(', ') : '';
    $('#f_excerpt').value = p ? p.excerpt : '';
    $('#f_content').value = p ? p.content : '';
    $('#postForm').scrollIntoView({ behavior: 'smooth' });
  }
  async function savePost() {
    const id = $('#f_id').value;
    const post = {
      title: $('#f_title').value.trim(),
      category: $('#f_cat').value,
      date: $('#f_date').value,
      featured: $('#f_feat').checked,
      slug: $('#f_slug').value.trim(),
      tags: $('#f_tags').value.split(',').map(s => s.trim()).filter(Boolean),
      excerpt: $('#f_excerpt').value.trim(),
      content: $('#f_content').value
    };
    if (!post.title) { showMsg('#saveMsg', '标题不能为空', false); return; }
    if (id) {
      const j = await api('PUT', '/api/admin/posts/' + id, { post });
      const i = POSTS.findIndex(p => p.id === id); POSTS[i] = j.post;
      showMsg('#saveMsg', '已更新', true);
    } else {
      const j = await api('POST', '/api/admin/posts', { post });
      POSTS.unshift(j.post);
      showMsg('#saveMsg', '已发布', true);
    }
    renderPosts(); $('#postForm').classList.add('hidden');
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
    try {
      const data = await fileToBase64(f);
      const j = await api('POST', '/api/admin/upload', { filename: f.name, data });
      const cur = $('#f_content').value;
      $('#f_content').value = (cur ? cur + '\n\n' : '') + '![' + (f.name || 'image') + '](' + j.url + ')';
      showMsg('#saveMsg', '图片已上传并插入正文', true);
    } catch (e) { showMsg('#saveMsg', '上传失败：' + e.message, false); }
  }

  /* ---- 站点设置 ---- */
  function renderSiteForm() {
    const s = SITE;
    $('#s_title').value = s.title; $('#s_slogan').value = s.slogan; $('#s_about').value = s.about;
    $('#s_tech').value = (s.techStack || []).join(', ');
    $('#s_tags').value = (s.tags || []).join(', ');
    $('#s_email').value = s.contact.email; $('#s_github').value = s.contact.github;
    $('#s_projects').value = toLines(s.contact.projects || []);
    $('#s_links').value = toLines(s.friendLinks || []);
    $('#f_cat').innerHTML = s.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    renderCats();
  }
  function renderCats() {
    $('#catList').innerHTML = SITE.categories.map((c, i) =>
      `<div class="list-item"><div><strong>${c.name}</strong> <span class="hint">· ${c.icon} · ${c.desc}</span></div>
       <div class="row"><button class="btn mini del" data-cat="${i}">删除</button></div></div>`).join('');
    $('#catList').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      SITE.categories.splice(Number(b.dataset.cat), 1); renderCats();
    });
  }
  async function saveSite() {
    const site = {
      title: $('#s_title').value.trim(),
      slogan: $('#s_slogan').value.trim(),
      about: $('#s_about').value.trim(),
      techStack: $('#s_tech').value.split(',').map(s => s.trim()).filter(Boolean),
      tags: $('#s_tags').value.split(',').map(s => s.trim()).filter(Boolean),
      contact: {
        email: $('#s_email').value.trim(),
        github: $('#s_github').value.trim(),
        projects: fromLines($('#s_projects').value)
      },
      friendLinks: fromLines($('#s_links').value),
      categories: SITE.categories,
      stats: SITE.stats
    };
    await api('PUT', '/api/admin/site', { site });
    SITE = Object.assign({}, SITE, site);
    renderSiteForm();
    showMsg('#saveMsg', '站点设置已保存', true);
  }

  /* ---- 初始化 ---- */
  function init() {
    loadTheme();
    const tb = $('#themeBtn'); if (tb) tb.onclick = toggleTheme;
    $('#logout').onclick = logout;
    $('#loginBtn').onclick = doLogin;
    $('#passInput').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    $('#newPost').onclick = () => openPost('');
    $('#savePost').onclick = savePost;
    $('#uploadImg').onclick = uploadImage;
    $('#cancelPost').onclick = () => $('#postForm').classList.add('hidden');
    $('#saveSite').onclick = saveSite;
    $('#addCat').onclick = () => {
      const name = $('#c_name').value.trim(); if (!name) return;
      SITE.categories.push({ id: 'cat' + Date.now().toString(36), name, icon: $('#c_icon').value, desc: $('#c_desc').value.trim() });
      $('#c_name').value = ''; $('#c_desc').value = ''; renderCats();
    };
    $('#savePwd').onclick = async () => {
      if ($('#p_new').value !== $('#p_new2').value) { showMsg('#saveMsg', '两次新密码不一致', false); return; }
      try { await api('PUT', '/api/admin/password', { current: $('#p_cur').value, next: $('#p_new').value }); showMsg('#saveMsg', '密码已修改，请重新登录', true); setTimeout(logout, 1200); }
      catch (e) { showMsg('#saveMsg', e.message, false); }
    };
    document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      ['posts', 'site', 'pwd'].forEach(t => $('#tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
    });
    if (token) enterDash();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
