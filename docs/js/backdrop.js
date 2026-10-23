/* 夜神月博客 · backdrop.js 可定制多层背景
 * 方案（localStorage 'ysyBg' = { scheme, custom, dim }）：
 *   aurora   极光色斑 + 电路走线 + 上浮代码字符（默认，最丰富）
 *   circuit  电路板特写（走线加强，无色斑）
 *   grid     蓝图网格极简（仅网格 + 淡字符）
 *   stars    深空星野（80 颗闪烁星点）
 *   rain     数字雨（30 列下落字符）
 *   plain    素雅纸纹（全部动态关闭）
 * custom：自定义壁纸 URL（http/https 或 /img/…），覆盖在方案层之上
 * dim：壁纸压暗 0~70%（默认 35%，保证正文可读）
 * 联动：特效中心「🌌 背景动效」= FXS.get('bg') 关闭时暂停动画
 */
(function () {
  'use strict';
  if (window.__backdrop) return;
  var REDUCE = false;
  try { REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var CFG = { scheme: 'aurora', custom: '', dim: 35 };
  try {
    var saved = JSON.parse(localStorage.getItem('ysyBg') || '{}');
    if (saved.scheme) CFG.scheme = saved.scheme;
    if (typeof saved.custom === 'string') CFG.custom = saved.custom;
    if (typeof saved.dim === 'number') CFG.dim = saved.dim;
  } catch (e) {}

  var bd = null;

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function buildStars() {
    var g = el('div', 'bd-stars');
    for (var i = 0; i < 80; i++) {
      var s = el('span');
      s.style.left = (Math.random() * 100).toFixed(2) + 'vw';
      s.style.top = (Math.random() * 100).toFixed(2) + 'vh';
      var size = (1 + Math.random() * 2.2).toFixed(1);
      s.style.width = s.style.height = size + 'px';
      s.style.animationDuration = (2.4 + Math.random() * 4).toFixed(1) + 's';
      s.style.animationDelay = (-Math.random() * 5).toFixed(1) + 's';
      g.appendChild(s);
    }
    return g;
  }

  function buildRain() {
    var g = el('div', 'bd-rain');
    var GLYPH = 'アイウエオカキサシスセタ0123456789ABCDEF<>/{};=+MQTTGPIO'.split('');
    for (var c = 0; c < 30; c++) {
      var col = el('span', 'bd-raincol');
      col.style.left = (c * 3.4 + Math.random() * 1.5).toFixed(1) + 'vw';
      col.style.animationDuration = (7 + Math.random() * 12).toFixed(1) + 's';
      col.style.animationDelay = (-Math.random() * 14).toFixed(1) + 's';
      var n = 12 + ((Math.random() * 10) | 0);
      var txt = '';
      for (var k = 0; k < n; k++) txt += GLYPH[(Math.random() * GLYPH.length) | 0] + '<br>';
      col.innerHTML = txt;
      g.appendChild(col);
    }
    return g;
  }

  function buildBlobs() {
    var wrap = document.createDocumentFragment();
    [['bd-b1', '24vmax', '8vw', '-6vh'], ['bd-b2', '30vmax', '62vw', '38vh'], ['bd-b3', '20vmax', '30vw', '62vh']]
      .forEach(function (c) {
        var i = el('i', 'bd-blob ' + c[0]);
        i.style.width = i.style.height = c[1];
        i.style.left = c[2];
        i.style.top = c[3];
        wrap.appendChild(i);
      });
    return wrap;
  }

  function buildGlyphs() {
    var g = el('div', 'bd-glyphs');
    var CHARS = '01<>{}[]/;*=+λπΔΣMQTTUDPTCPGPSGW-I2CSPIGPIOACKNACKCRC'.split('');
    for (var k = 0; k < 18; k++) {
      var s = el('span');
      s.textContent = CHARS[(Math.random() * CHARS.length) | 0] + (Math.random() < 0.3 ? CHARS[(Math.random() * CHARS.length) | 0] : '');
      s.style.left = (Math.random() * 96 + 2) + 'vw';
      s.style.fontSize = (11 + Math.random() * 7).toFixed(1) + 'px';
      s.style.animationDuration = (42 + Math.random() * 46).toFixed(1) + 's';
      s.style.animationDelay = (-Math.random() * 60).toFixed(1) + 's';
      s.style.opacity = (0.05 + Math.random() * 0.09).toFixed(2);
      g.appendChild(s);
    }
    return g;
  }

  function paint() {
    bd.innerHTML = '';
    document.documentElement.setAttribute('data-bgscheme', CFG.scheme);

    switch (CFG.scheme) {
      case 'circuit':
        bd.appendChild(el('div', 'bd-circuit bd-circuit-strong'));
        break;
      case 'grid':
        bd.appendChild(buildGlyphs());
        break;
      case 'stars':
        bd.appendChild(buildStars());
        break;
      case 'rain':
        bd.appendChild(buildRain());
        bd.appendChild(el('div', 'bd-circuit'));
        break;
      case 'plain':
        break; /* 仅 CSS 底层纸纹+网格 */
      default: /* aurora */
        bd.appendChild(buildBlobs());
        bd.appendChild(el('div', 'bd-circuit'));
        bd.appendChild(buildGlyphs());
    }

    /* 自定义壁纸层 */
    var old = bd.querySelector('.bd-custom');
    if (old) old.remove();
    if (CFG.custom) {
      var img = el('div', 'bd-custom');
      img.style.backgroundImage = 'url("' + CFG.custom.replace(/"/g, '%22') + '")';
      img.style.opacity = String(1 - CFG.dim / 100);
      bd.appendChild(img);
    }
  }

  function build() {
    if (bd) return;
    bd = el('div');
    bd.id = 'backdrop';
    bd.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(bd, document.body.firstChild);
    paint();
    window.__backdrop = bd;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  /* 特效中心联动：背景定制面板 + bg 动效开关 */
  document.addEventListener('bgscheme', function (e) {
    var d = e.detail || {};
    if (d.scheme) CFG.scheme = d.scheme;
    if (typeof d.custom === 'string') CFG.custom = d.custom;
    if (typeof d.dim === 'number') CFG.dim = d.dim;
    try { localStorage.setItem('ysyBg', JSON.stringify(CFG)); } catch (err) {}
    if (bd) paint();
  });
  function apply() {
    var on = window.FXS ? FXS.get('bg') : true;
    document.documentElement.classList.toggle('fx-no-bg', !on);
  }
  document.addEventListener('DOMContentLoaded', apply);
  document.addEventListener('fxchange', function (e) {
    if (e.detail && e.detail.key === 'bg') apply();
  });
  if (REDUCE) document.documentElement.classList.add('fx-no-bg');
})();
