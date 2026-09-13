/* 极简 Markdown 渲染器：先转义 HTML 防注入，再套用基础语法（含表格与缩进代码） */
(function (global) {
  function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function inline(s) {
    s = escapeHTML(s);
    // 行内代码
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 粗体 / 斜体
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // 链接
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function splitRow(s) {
    return s.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  }
  function isTableSep(s) {
    return /\|/.test(s) && /-/.test(s) && /^[\s|:\-]+$/.test(s.trim());
  }
  function render(md) {
    if (!md) return '';
    const lines = md.split('\n');
    let html = '', i = 0;
    while (i < lines.length) {
      let line = lines[i];
      if (/^```/.test(line)) { // 代码块（围栏式）
        let code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        html += '<pre><code>' + escapeHTML(code.join('\n')) + '</code></pre>';
        continue;
      }
      if (line.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) { // 表格
        const header = splitRow(line); i += 2;
        const rows = [];
        while (i < lines.length && lines[i].startsWith('|')) { rows.push(splitRow(lines[i])); i++; }
        html += '<table><thead><tr>' + header.map(h => '<th>' + inline(h) + '</th>').join('') +
                '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') +
                '</tbody></table>';
        continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      if (/^ {4,}/.test(line)) { // 缩进代码块（4 空格起）
        let code = [];
        while (i < lines.length && /^ {4,}/.test(lines[i])) { code.push(lines[i].replace(/^ {4}/, '')); i++; }
        html += '<pre><code>' + escapeHTML(code.join('\n')) + '</code></pre>';
        continue;
      }
      if (/^###\s/.test(line)) { html += '<h3>' + inline(line.replace(/^###\s/, '')) + '</h3>'; i++; continue; }
      if (/^##\s/.test(line)) { html += '<h2>' + inline(line.replace(/^##\s/, '')) + '</h2>'; i++; continue; }
      if (/^#\s/.test(line)) { html += '<h1>' + inline(line.replace(/^#\s/, '')) + '</h1>'; i++; continue; }
      if (/^>\s/.test(line)) { html += '<blockquote>' + inline(line.replace(/^>\s/, '')) + '</blockquote>'; i++; continue; }
      if (/^---\s*$/.test(line)) { html += '<hr>'; i++; continue; }
      if (/^[-*]\s/.test(line)) { // 无序列表
        let items = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^[-*]\s/, '')) + '</li>'); i++; }
        html += '<ul>' + items.join('') + '</ul>';
        continue;
      }
      if (/^\d+\.\s/.test(line)) { // 有序列表
        let items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^\d+\.\s/, '')) + '</li>'); i++; }
        html += '<ol>' + items.join('') + '</ol>';
        continue;
      }
      // 段落（合并连续非空行，遇到下一块起点即止）
      let para = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !/^(#|[-*]|\d+\.|>|```|\s{4,})/.test(lines[i])) { para.push(lines[i]); i++; }
      html += '<p>' + inline(para.join(' ')) + '</p>';
    }
    return html;
  }
  global.MD = { render, escapeHTML };
})(window);
