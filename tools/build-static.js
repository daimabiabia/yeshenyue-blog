/*
 * 静态站点构建：产出 docs/ 目录，供 GitHub Pages（main 分支 /docs）托管。
 *
 * 产物结构：
 *   docs/            ← public/ 的完整拷贝（剔除 admin.html 与 uploads 运行时目录）
 *   docs/data/site.json     ← 全量文章（含正文，静态模式前端数据源）
 *   docs/data/likes.json    ← 点赞快照 {likes:{id:count}}
 *   docs/data/comments.json ← 评论快照 {postId:[...]}
 *   docs/data/wall.json     ← 留言墙快照 {notes:[...]}
 *   docs/rss.xml            ← 与 server.js /rss.xml 同格式的静态 RSS
 *   docs/.nojekyll          ← 跳过 GitHub Jekyll 处理（保住下划线/点开头文件）
 *
 * 用法：node tools/build-static.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'docs');

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

function copyDir(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip && skip(name, path.join(src, name))) continue;
    const s = path.join(src, name), d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}

console.log('[build] 清理旧产物...');
rmrf(OUT);
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });

console.log('[build] 拷贝 public/ → docs/');
copyDir(PUB, OUT, (name, full) => name === 'admin.html' || (name === 'uploads' && fs.statSync(full).isDirectory()));

/* live2d 模型清单重写：绝对路径 → 相对路径（Pages 子路径托管必需） */
const waifuJson = path.join(OUT, 'js/live2d/waifu-tips.json');
if (fs.existsSync(waifuJson)) {
  fs.writeFileSync(waifuJson, fs.readFileSync(waifuJson, 'utf8').replace(/"\/js\/live2d\//g, '"js/live2d/'));
  console.log('[build] waifu-tips.json 路径已相对化');
}

/* 数据快照 */
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const posts = Array.isArray(site) ? site : (site.posts || []);
const outSite = Array.isArray(site) ? { posts: site } : site;
fs.writeFileSync(path.join(OUT, 'data/site.json'), JSON.stringify(outSite));

let likes = {};
try { likes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/likes.json'), 'utf8')); } catch (e) {}
/* likes.json 存的是 {id:count} 本体还是 {likes:{...}} 都兼容 */
const likesMap = likes.likes || likes;
fs.writeFileSync(path.join(OUT, 'data/likes.json'), JSON.stringify({ likes: likesMap }));

let comments = {};
try {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/comments.json'), 'utf8'));
  /* 服务器存储可能是数组或按文章分组，统一转成 {postId:[...]} */
  if (Array.isArray(raw)) {
    for (const c of raw) { (comments[c.post || c.postId || c.id] = comments[c.post || c.postId || c.id] || []).push(c); }
  } else if (raw && typeof raw === 'object') {
    comments = raw;
  }
} catch (e) {}
fs.writeFileSync(path.join(OUT, 'data/comments.json'), JSON.stringify(comments));

let notes = [];
try {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wall.json'), 'utf8'));
  notes = Array.isArray(raw) ? raw : (raw.notes || []);
} catch (e) {}
fs.writeFileSync(path.join(OUT, 'data/wall.json'), JSON.stringify({ notes }));

/* 静态 RSS（与 server.js 同格式，base 用 Pages 地址） */
const base = 'https://daimabiabia.github.io/yeshenyue-blog';
const cats = Object.fromEntries((site.site && site.site.categories || []).map((c) => [c.id, c.name]));
const items = posts.slice(0, 30).map((p) => {
  const link = base + '/#/post/' + (p.slug || p.id);
  const desc = esc(p.excerpt || p.title);
  return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(p.id)}</guid>
      <category>${esc(cats[p.category] || p.category)}</category>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${desc}</description>
    </item>`;
}).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(site.site && site.site.title || '夜神月博客')}</title>
    <link>${esc(base)}</link>
    <description>${esc(site.site && site.site.slogan || '')}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
fs.writeFileSync(path.join(OUT, 'rss.xml'), xml);

fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const du = (p) => { let n = 0; try { n = fs.statSync(p).size; } catch (e) {} return n; };
console.log('[build] 完成 → docs/');
console.log('  文章数:', posts.length);
console.log('  site.json:', (du(path.join(OUT, 'data/site.json')) / 1024).toFixed(0) + ' KB');
console.log('  likes:', Object.keys(likesMap).length, '条 / comments 文章:', Object.keys(comments).length, '篇 / wall:', notes.length, '张便签');
