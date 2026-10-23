/* 批量发文工具：node tools/add-post.js <batch.json>
 * batch.json 格式：[{ title, category, level, date?, tags[], excerpt, content, featured? }, ...]
 * 自动生成 id（z 前缀系列沿用现有栏目编号规则时手动传 id 字段）、slug、查重、备份 site.json。
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'site.json');
const batchFile = process.argv[2];
if (!batchFile || !fs.existsSync(batchFile)) {
  console.error('用法: node tools/add-post.js <batch.json>');
  process.exit(1);
}
const CATS = require(DATA).site.categories.map((c) => c.id);
const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
if (!Array.isArray(batch)) { console.error('batch 必须是数组'); process.exit(1); }

/* 备份 */
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
fs.copyFileSync(DATA, path.join(__dirname, '..', 'data', `site.bak-addpost-${stamp}`));

const site = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const slugify = (s) => String(s).trim().toLowerCase()
  .replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'post';

let added = 0, skipped = [];
for (const item of batch) {
  const { title, category, level, tags, excerpt, content } = item;
  if (!title || !category || !excerpt || !content) { skipped.push(`字段缺失: ${title || '(无标题)'}`); continue; }
  if (!CATS.includes(category)) { skipped.push(`未知栏目 ${category}: ${title}`); continue; }
  if (site.posts.some((p) => p.title === title)) { skipped.push(`标题重复: ${title}`); continue; }
  let id = item.id;
  if (!id) { let n = site.posts.length + 1; do { id = 'p' + n.toString(36) + Math.random().toString(36).slice(2, 5); } while (site.posts.some((p) => p.id === id)); }
  if (site.posts.some((p) => p.id === id)) { skipped.push(`ID 撞车 ${id}: ${title}`); continue; }
  site.posts.push({
    id,
    title,
    category,
    level: Math.min(5, Math.max(1, parseInt(level, 10) || 1)),
    date: item.date || new Date().toISOString().slice(0, 10),
    featured: !!item.featured,
    slug: slugify(item.slug || title),
    tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
    excerpt: String(excerpt),
    content: String(content),
  });
  added++;
}

fs.writeFileSync(DATA, JSON.stringify(site, null, 2));
console.log(`✅ 新增 ${added} 篇，现共 ${site.posts.length} 篇；备份: site.bak-addpost-${stamp}`);
skipped.forEach((s) => console.log('  ⏭ ' + s));
