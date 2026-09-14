/* 极简 Markdown 渲染器（安全：先转义 HTML 防注入，再套用基础语法）
 * 支持：围栏代码块（保留语言）/ 缩进代码块 / 表格 / 标题 h1-h4 / 引用 / 分割线
 *       有序·无序列表 / 图片 / 行内 code·粗体·斜体·删除线·链接 / kbd
 */
(function (global) {
  function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* URL 白名单：只允许 http/https/相对路径/data:image，堵死 javascript: 之流 */
  function safeUrl(u) {
    const s = String(u || '').trim();
    if (/^(https?:)?\/\//i.test(s)) return s;
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(s)) return s;
    if (/^[\w./#?=&%-]+$/.test(s)) return s;   // 相对路径
    return '#';
  }
  function inline(s) {
    s = escapeHTML(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      const href = safeUrl(u.replace(/&amp;/g, '&'));
      return '<a href="' + href + '"' + (/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '') + '>' + t + '</a>';
    });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) =>
      '<img src="' + safeUrl(u.replace(/&amp;/g, '&')) + '" alt="' + alt + '" loading="lazy">');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\[\[([^\]]+)\]\]/g, '<kbd>$1</kbd>');
    return s;
  }
  function splitRow(s) {
    return s.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  }
  function isTableSep(s) {
    return /\|/.test(s) && /-/.test(s) && /^[\s|:\-]+$/.test(s.trim());
  }
  /* 代码块：保留语言标识，供 CSS 显示语言角标 */
  function codeBlock(lang, code) {
    const l = (lang || '').trim().toLowerCase();
    return '<pre' + (l ? ' data-lang="' + escapeHTML(l) + '"' : '') + '><code' +
      (l ? ' class="language-' + escapeHTML(l) + '"' : '') + '>' + escapeHTML(code) + '</code></pre>';
  }
  function render(md) {
    if (!md) return '';
    const lines = md.split('\n');
    let html = '', i = 0;
    while (i < lines.length) {
      let line = lines[i];

      if (/^```/.test(line)) {                       // 围栏代码块
        const lang = line.replace(/^```/, '').trim();
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        html += codeBlock(lang, code.join('\n'));
        continue;
      }
      if (line.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) { // 表格
        const header = splitRow(line); i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i])); i++; }
        html += '<div class="tw"><table><thead><tr>' +
          header.map((h) => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') +
          '</tbody></table></div>';
        continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      if (/^ {4,}/.test(line)) {                      // 缩进代码块
        const code = [];
        while (i < lines.length && /^ {4,}/.test(lines[i])) { code.push(lines[i].replace(/^ {4}/, '')); i++; }
        html += codeBlock('', code.join('\n'));
        continue;
      }
      if (/^####\s/.test(line)) { html += '<h4>' + inline(line.replace(/^####\s/, '')) + '</h4>'; i++; continue; }
      if (/^###\s/.test(line)) { html += '<h3>' + inline(line.replace(/^###\s/, '')) + '</h3>'; i++; continue; }
      if (/^##\s/.test(line)) { html += '<h2>' + inline(line.replace(/^##\s/, '')) + '</h2>'; i++; continue; }
      if (/^#\s/.test(line)) { html += '<h1>' + inline(line.replace(/^#\s/, '')) + '</h1>'; i++; continue; }
      if (/^>\s/.test(line)) {                        // 引用（连续行合并为一块）
        const q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
        html += '<blockquote>' + inline(q.join(' ')) + '</blockquote>';
        continue;
      }
      if (/^(---|\*\*\*)\s*$/.test(line)) { html += '<hr>'; i++; continue; }
      if (/^[-*]\s/.test(line)) {                     // 无序列表
        const items = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^[-*]\s/, '')) + '</li>'); i++;
        }
        html += '<ul>' + items.join('') + '</ul>';
        continue;
      }
      if (/^\d+\.\s/.test(line)) {                    // 有序列表
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\d+\.\s/, '')) + '</li>'); i++;
        }
        html += '<ol>' + items.join('') + '</ol>';
        continue;
      }
      // 段落
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== '' &&
             !/^(#|[-*]|\d+\.|>|```|\s{4,})/.test(lines[i])) { para.push(lines[i]); i++; }
      html += '<p>' + inline(para.join(' ')) + '</p>';
    }
    return html;
  }
  global.MD = { render, escapeHTML };
})(window);
