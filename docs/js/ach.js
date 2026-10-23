/* 夜神月博客 · ach.js 成就徽章 + Toast 通知（零依赖）
 * 成就：首次到访 / 读完 1·10·50·全部 / 摇骰 10 次 / Konami 秘技 / 超级爆炸 5 次
 * 进度存 localStorage('ysy_ach')；Toast 右下角滑入，4.2s 自动消失
 */
(function () {
  'use strict';
  if (window.ACH) return;

  var KEY = 'ysy_ach';
  var unlocked = {};
  try { unlocked = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { unlocked = {}; }

  var LIST = [
    { id: 'first',   icon: '🥇', title: '初来乍到', desc: '首次点亮夜神月博客' },
    { id: 'read1',   icon: '📖', title: '开卷有益', desc: '读完第 1 篇课程' },
    { id: 'read10',  icon: '🔥', title: '十全十美', desc: '累计读完 10 篇' },
    { id: 'read50',  icon: '🚀', title: '五十而立', desc: '累计读完 50 篇' },
    { id: 'readAll', icon: '👑', title: '登神长阶', desc: '全部课程读完，登神！' },
    { id: 'dice10',  icon: '🎲', title: '手气不错', desc: '随机一课摇骰 10 次' },
    { id: 'konami',  icon: '🎮', title: '上古秘技', desc: '触发隐藏彩蛋糖果雨' },
    { id: 'mega5',   icon: '💥', title: '破坏王', desc: '长按蓄力超级爆炸 5 次' }
  ];

  function save() { try { localStorage.setItem(KEY, JSON.stringify(unlocked)); } catch (e) {} }

  /* ---- Toast ---- */
  var box = null;
  function ensureBox() {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'toast-box';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
    return box;
  }
  function toast(icon, title, desc) {
    var b = ensureBox();
    while (b.children.length >= 3) b.removeChild(b.firstChild);
    var t = document.createElement('div');
    t.className = 'ach-toast';
    t.innerHTML = '<span class="at-icon">' + icon + '</span><span class="at-body"><b>' +
      title + '</b><i>' + desc + '</i></span>';
    b.appendChild(t);
    setTimeout(function () { t.classList.add('bye'); }, 3600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4200);
  }

  function unlock(id) {
    if (unlocked[id]) return false;
    var a = null;
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) a = LIST[i];
    if (!a) return false;
    unlocked[id] = Date.now();
    save();
    toast(a.icon, '成就解锁 · ' + a.title, a.desc);
    /* 解锁礼花：从 Toast 弹出的位置向上喷一发糖果 */
    try {
      if (window.FX && FX.ready && FX.burst) {
        var y = window.innerHeight - 110;
        FX.burst(window.innerWidth - 110, y, 26);
        setTimeout(function () { FX.burst(window.innerWidth - 150, y - 30, 16); }, 120);
      }
    } catch (e) {}
    try { if (window.SFX && window.SFX.enabled) window.SFX.coin(); } catch (e) {}
    return true;
  }

  function bump(key, goal, achId) {
    var n = 0;
    try { n = parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) {}
    n++;
    try { localStorage.setItem(key, String(n)); } catch (e) {}
    if (n >= goal) unlock(achId);
    return n;
  }

  /* 读书记录复用 app.js 的 ysy_read_posts */
  function checkRead(total) {
    if (typeof total !== 'number' || !total) return;
    var n = 0;
    try { n = (JSON.parse(localStorage.getItem('ysy_read_posts') || '[]') || []).length; } catch (e) {}
    if (n >= 1) unlock('read1');
    if (n >= 10) unlock('read10');
    if (n >= 50) unlock('read50');
    if (n >= total) unlock('readAll');
  }

  function counters() {
    function get(k) { try { return parseInt(localStorage.getItem(k) || '0', 10) || 0; } catch (e) { return 0; } }
    return { dice: get('ysy_dice_n'), mega: get('ysy_mega_n') };
  }

  /* 事件接线 */
  document.addEventListener('fx:mega', function () { bump('ysy_mega_n', 5, 'mega5'); });
  document.addEventListener('fx:konami', function () { unlock('konami'); });

  /* 成就墙：渲染到首页容器，解锁高亮 / 未解锁灰显 */
  function renderWall(sel) {
    var el = document.querySelector(sel);
    if (!el) return;
    var n = LIST.filter(function (a) { return unlocked[a.id]; }).length;
    el.innerHTML = LIST.map(function (a) {
      var on = !!unlocked[a.id];
      return '<div class="card ach-card' + (on ? ' on' : '') + ' reveal" title="' +
        (on ? a.title : '未解锁 · ' + a.desc) + '">' +
        '<div class="ach-icon">' + (on ? a.icon : '🔒') + '</div>' +
        '<h3>' + a.title + '</h3>' +
        '<p>' + (on ? a.desc : '？？？') + '</p></div>';
    }).join('') +
    '<p class="hint ach-progress">已解锁 ' + n + ' / ' + LIST.length +
    ' · 读完文章、摇骰、触发彩蛋都能解锁新成就</p>';
  }

  window.ACH = {
    ready: true,
    LIST: LIST,
    unlocked: function () { return Object.keys(unlocked); },
    toast: toast,
    unlock: unlock,
    bump: bump,
    counters: counters,
    checkRead: checkRead,
    firstVisit: function () { unlock('first'); },
    renderWall: renderWall
  };
})();
