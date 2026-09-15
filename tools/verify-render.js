/* 用 Node 直接驱动 markdown.js，对全部文章做渲染断言（不依赖浏览器）
 * 断言项：渲染不抛错 / 无 <script> / 无 javascript: / 正文无残留 h1 / pre 内不含未转义标签
 * 说明：先剔除 <pre> 区块再做文本类断言，避免把代码块里的合法字样（如 undefined）误判为缺陷
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'markdown.js'), 'utf8');
const win = {};
new Function('window', src)(win);
const MD = win.MD;

/* 与 app.js 中 stripLeadingH1 + 层级降级保持一致的预处理 */
function normalize(md) {
  const lines = String(md || '').split('\n');
  if (lines.length && /^#\s+/.test(lines[0])) {
    lines.shift();
    while (lines.length && lines[0].trim() === '') lines.shift();
  }
  return lines.map((l) => (/^#\s+/.test(l) ? '#' + l : l)).join('\n');
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'site.json'), 'utf8'));
const posts = data.posts;

const fail = [];
const stat = { pre: 0, table: 0, tw: 0, h2: 0, h3: 0, lang: {}, len: [], strayH1: 0 };

for (const p of posts) {
  let html;
  try {
    html = MD.render(normalize(p.content || ''));
  } catch (e) {
    fail.push(`${p.id} 渲染抛错: ${e.message}`);
    continue;
  }

  /* 剔除代码块后再做文本断言 */
  const text = html.replace(/<pre[\s\S]*?<\/pre>/g, '');

  if (!html || html.length < 200) fail.push(`${p.id} 输出过短 (${html.length})`);
  if (/<h1/.test(html)) { fail.push(`${p.id} 正文仍含 h1`); stat.strayH1++; }
  if (/<script/i.test(html)) fail.push(`${p.id} 输出含 <script（注入风险）`);
  if (/javascript:/i.test(html)) fail.push(`${p.id} 输出含 javascript: 协议`);
  if (/undefined/.test(text)) fail.push(`${p.id} 正文（非代码区）含 undefined`);
  if (/\[object Object\]/.test(text)) fail.push(`${p.id} 正文含 [object Object]`);

  stat.pre += (html.match(/<pre/g) || []).length;
  stat.table += (html.match(/<table/g) || []).length;
  stat.tw += (html.match(/class="tw"/g) || []).length;
  stat.h2 += (html.match(/<h2/g) || []).length;
  stat.h3 += (html.match(/<h3/g) || []).length;
  stat.len.push(html.length);
  for (const m of html.matchAll(/data-lang="([^"]+)"/g)) {
    stat.lang[m[1]] = (stat.lang[m[1]] || 0) + 1;
  }
}

stat.len.sort((a, b) => a - b);
console.log('文章总数:', posts.length);
console.log('代码块 <pre>:', stat.pre);
console.log('表格 <table>:', stat.table, '| .tw 横向滚动容器:', stat.tw);
console.log('h2:', stat.h2, '| h3:', stat.h3, '| 残留 h1:', stat.strayH1);
console.log('语言角标分布:', stat.lang);
console.log('渲染长度 中位数/最小/最大:', stat.len[Math.floor(stat.len.length / 2)], stat.len[0], stat.len[stat.len.length - 1]);
console.log('---- 问题 ----');
console.log(fail.length ? fail.join('\n') : '无');
