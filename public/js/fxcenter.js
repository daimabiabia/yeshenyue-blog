/* 夜神月博客 · fxcenter.js 特效中心
 * 统一管理全部特效开关：拖尾/点击爆炸/超级爆炸/冲击波/彩虹/Konami/卡片倾斜/音效/CRT/看板娘
 * localStorage('fxSettings') 持久化，fx.js / live2d init 实时读取
 * 面板：导航 ⚙ 按钮或 Ctrl+E 呼出
 */
(function () {
  'use strict';
  if (window.FXS) return;

  var DEF = {
    trail: 1,   /* 鼠标糖果拖尾 */
    burst: 1,   /* 点击爆炸 */
    mega: 1,    /* 长按超级爆炸 */
    shock: 1,   /* 双击冲击波 / 蓄力环 */
    rainbow: 1, /* Shift 彩虹轨迹 */
    konami: 1,  /* Konami 糖果雨 */
    tilt: 1,    /* 卡片 3D 倾斜 */
    sfx: 0,     /* 8-bit 音效（默认关，与 SFX 内部状态同步） */
    crt: 1,     /* CRT 扫描线 */
    bg: 1,      /* 背景动效（极光色斑 / 代码字符层） */
    waifu: 1,   /* Live2D 看板娘 */
  };
  var S = {};
  try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem('fxSettings') || '{}')); } catch (e) { S = Object.assign({}, DEF); }

  function apply() {
    document.documentElement.classList.toggle('fx-no-crt', !S.crt);
    var w = document.getElementById('waifu');
    if (w) w.style.display = S.waifu ? '' : 'none';
    if (window.SFX) {
      /* 与音效引擎同步（面板里改的 sfx 项映射到 SFX 自身开关） */
      if (S.sfx !== (window.SFX.enabled ? 1 : 0)) window.SFX.toggle();
    }
  }

  window.FXS = {
    get: function (k) { return !!S[k]; },
    set: function (k, v) {
      S[k] = v ? 1 : 0;
      try { localStorage.setItem('fxSettings', JSON.stringify(S)); } catch (e) {}
      apply();
      try { document.dispatchEvent(new CustomEvent('fxchange', { detail: { key: k, on: !!S[k] } })); } catch (e) {}
    },
    all: function () { return Object.assign({}, S); },
    reset: function () {
      Object.keys(DEF).forEach(function (k) { S[k] = DEF[k]; });
      try { localStorage.setItem('fxSettings', JSON.stringify(S)); } catch (e) {}
      apply();
      renderPanel();
    },
  };

  /* ---- 面板 ---- */
  var META = [
    ['trail', '🍬 鼠标糖果拖尾', '移动鼠标掉落彩色糖果'],
    ['burst', '💥 点击爆炸', '点空白处喷发糖果碎片'],
    ['mega', '⚡ 长按超级爆炸', '按住 0.6 秒释放 60 粒大爆炸'],
    ['shock', '🌀 双击冲击波', '双击空白处扩散圆环'],
    ['rainbow', '🌈 Shift 彩虹轨迹', '按住 Shift 拖出彩虹光带'],
    ['konami', '🎮 Konami 糖果雨', '↑↑↓↓←→←→BA 触发彩蛋'],
    ['tilt', '📇 卡片 3D 倾斜', '悬停卡片产生立体效果'],
    ['sfx', '🔊 8-bit 音效', '像素风操作音（同 S 键）'],
    ['crt', '📺 CRT 扫描线', '深色模式的复古扫描线质感'],
    ['bg', '🌌 背景动效', '极光色斑漂移与上浮代码字符'],
    ['waifu', '🐕 看板娘', '右下角 Live2D 看板娘'],
  ];

  function ensurePanel() {
    var box = document.getElementById('fxPanel');
    if (!box || box._built) return box;
    var rows = META.map(function (m) {
      return '<label class="fx-row"><input type="checkbox" data-fx="' + m[0] + '" /><span class="fx-name">' + m[1] + '</span><span class="fx-desc hint">' + m[2] + '</span></label>';
    }).join('');
    var list = box.querySelector('.fx-rows');
    if (list) list.innerHTML = rows;
    /* ---- 背景定制区块 ---- */
    var host = box.querySelector('.fx-bg-host');
    if (host) {
      host.innerHTML =
        '<div class="sec-head" style="padding:0 0 8px"><span class="kicker">BACKDROP</span><h3 style="margin:0;font-size:15px">背景定制</h3></div>' +
        '<div class="bg-schemes" role="radiogroup" aria-label="背景方案">' +
        [['aurora', '🌌 极光'], ['circuit', '🔌 电路板'], ['grid', '📐 蓝图'], ['stars', '✨ 星野'], ['rain', '🟩 数字雨'], ['plain', '📄 素雅']]
          .map(function (s) { return '<button type="button" class="bg-scheme" data-scheme="' + s[0] + '">' + s[1] + '</button>'; }).join('') +
        '</div>' +
        '<div class="bg-custom-row"><input type="url" id="bgCustomUrl" class="bg-url-input" placeholder="自定义壁纸 URL（http… 或 /img/…）" />' +
        '<button type="button" class="btn" id="bgApply">应用</button></div>' +
        '<label class="fx-row"><span class="fx-name">🖼 壁纸压暗</span><input type="range" id="bgDim" min="0" max="70" step="5" style="flex:1" /><em class="mono" id="bgDimVal">35%</em></label>';
      host.querySelectorAll('.bg-scheme').forEach(function (b) {
        b.addEventListener('click', function () { setScheme(b.dataset.scheme); });
      });
      var applyBtn = host.querySelector('#bgApply');
      if (applyBtn) applyBtn.addEventListener('click', function () {
        var inp = host.querySelector('#bgCustomUrl');
        var url = (inp && inp.value || '').trim();
        document.dispatchEvent(new CustomEvent('bgscheme', { detail: { custom: url } }));
        renderBgUI();
      });
      var dim = host.querySelector('#bgDim');
      if (dim) dim.addEventListener('change', function () {
        document.dispatchEvent(new CustomEvent('bgscheme', { detail: { dim: Number(dim.value) } }));
        renderBgUI();
      });
    }
    box.querySelectorAll('input[data-fx]').forEach(function (cb) {
      cb.addEventListener('change', function () { window.FXS.set(cb.dataset.fx, cb.checked); });
    });
    var rb = box.querySelector('#fxReset');
    if (rb) rb.addEventListener('click', function () { window.FXS.reset(); });
    var m = box.querySelector('.cmdk-mask');
    if (m) m.addEventListener('click', function () { box.hidden = true; });
    var esc = box.querySelector('.cmdk-esc');
    if (esc) esc.addEventListener('click', function () { box.hidden = true; });
    box._built = true;
    return box;
  }

  function getBgCfg() {
    try { return JSON.parse(localStorage.getItem('ysyBg') || '{}'); } catch (e) { return {}; }
  }
  function setScheme(scheme) {
    document.dispatchEvent(new CustomEvent('bgscheme', { detail: { scheme: scheme } }));
    renderBgUI();
  }
  function renderBgUI() {
    var box = document.getElementById('fxPanel');
    if (!box) return;
    var cfg = getBgCfg();
    var scheme = cfg.scheme || 'aurora';
    box.querySelectorAll('.bg-scheme').forEach(function (b) { b.classList.toggle('on', b.dataset.scheme === scheme); });
    var url = box.querySelector('#bgCustomUrl');
    if (url && document.activeElement !== url) url.value = cfg.custom || '';
    var dim = box.querySelector('#bgDim');
    var dimVal = box.querySelector('#bgDimVal');
    if (dim) dim.value = typeof cfg.dim === 'number' ? cfg.dim : 35;
    if (dimVal) dimVal.textContent = (typeof cfg.dim === 'number' ? cfg.dim : 35) + '%';
  }

  function renderPanel() {
    var box = ensurePanel();
    if (!box) return;
    var s = window.FXS.all();
    box.querySelectorAll('input[data-fx]').forEach(function (cb) { cb.checked = !!s[cb.dataset.fx]; });
  }

  function openPanel() {
    var box = ensurePanel();
    if (!box) return;
    renderPanel();
    box.hidden = false;
  }

  /* 同步 SFX 实际状态到面板（音效可能被 S 键改变） */
  function syncSfx() {
    if (!window.SFX) return;
    S.sfx = window.SFX.enabled ? 1 : 0;
    try { localStorage.setItem('fxSettings', JSON.stringify(S)); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    apply();
    var btn = document.getElementById('fxBtn');
    if (btn) btn.addEventListener('click', function () {
      syncSfx();
      var box = document.getElementById('fxPanel');
      if (box) box.hidden = !box.hidden;
      if (box && !box.hidden) { renderPanel(); renderBgUI(); }
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        syncSfx();
        var box = document.getElementById('fxPanel');
        if (box) box.hidden = !box.hidden;
        if (box && !box.hidden) { renderPanel(); renderBgUI(); }
      }
      if (e.key === 'Escape') {
        var p = document.getElementById('fxPanel');
        if (p && !p.hidden) p.hidden = true;
      }
    });
  });

  /* 看板娘延迟加载：开关打开且尚未加载时调用 */
  window.FXS.loadWaifu = function () {
    if (!S.waifu) return;
    if (window.__waifuLoaded || window.__waifuLoading) return;
    window.__waifuLoading = true;
    var base = '/js/live2d/';
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'waifu.css';
    document.head.appendChild(link);
    /* 图片跨域补丁（live2d 绘制需要） */
    if (!window.__waifuImgPatched) {
      window.__waifuImgPatched = true;
      var OI = window.Image;
      window.Image = function () {
        var img = new OI();
        try { img.crossOrigin = 'anonymous'; } catch (e) {}
        return img;
      };
      window.Image.prototype = OI.prototype;
    }
    var s = document.createElement('script');
    s.type = 'module';
    s.src = base + 'waifu-tips.js';
    s.onload = function () {
      window.__waifuLoaded = true;
      if (typeof window.initWidget === 'function') {
        /* 该开关一旦为 true 会永久拒绝渲染； ours 的 FXS 面板才是唯一开关，这里强制清掉 */
        try { localStorage.removeItem('waifu-disabled'); } catch (e) {}
        /* 模型列表读取 waifu-tips.json 的 models 字段（已本地化），config.models 无效 */
        window.initWidget({
          waifuPath: base + 'waifu-tips.json',
          cubism2Path: base + 'live2d.min.js',
          tools: ['switch-model', 'switch-texture', 'photo', 'info', 'quit'],
          logLevel: 'warn',
          drag: true,
        });
        /* 新版首次访问只显示边缘小召唤按钮；且 24h 内重复访问点按钮会被
         * waifu-display 时间戳判定吞掉、完全不调召唤函数。这里先删时间戳
         * 再点按钮 → 必然走完整召唤（插 DOM + 加载模型 + 工具条）。 */
        setTimeout(function () {
          try {
            localStorage.removeItem('waifu-display');
            localStorage.removeItem('waifu-disabled');
          } catch (e) {}
          var t = document.getElementById('waifu-toggle');
          if (t) t.click();
        }, 400);
        /* 兜底：2.2s 后仍未升场则强制显示容器（模型加载由点击路径保证） */
        setTimeout(function () {
          var w = document.getElementById('waifu');
          if (w && !w.classList.contains('waifu-active')) {
            w.classList.remove('waifu-hidden');
            w.classList.add('waifu-active');
            var tg = document.getElementById('waifu-toggle');
            if (tg) tg.remove();
          }
        }, 2200);
        if (!S.waifu) {
          var w = document.getElementById('waifu');
          if (w) w.style.display = 'none';
        }
      }
    };
    document.head.appendChild(s);
  };
})();
