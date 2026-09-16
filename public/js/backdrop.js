/* 夜神月博客 · backdrop.js 多层动态背景
 * 层次（自下而上）：底色(html) → #backdrop::before 纸纹噪点+蓝图网格
 *   → .bd-circuit 电路走线 → .bd-blob×3 漂移极光色斑 → .bd-glyphs 上浮代码字符
 * 开关：特效中心「🌌 背景动效」= FXS.get('bg')，关闭时暂停动画、隐去字符
 * 降级：prefers-reduced-motion 下全部静止；仅 CSS transform/opacity 动画，GPU 友好
 */
(function () {
  'use strict';
  if (window.__backdrop) return;
  var REDUCE = false;
  try { REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function build() {
    if (document.getElementById('backdrop')) return;
    var bd = document.createElement('div');
    bd.id = 'backdrop';
    bd.setAttribute('aria-hidden', 'true');

    /* 极光色斑：三个大圆缓慢漂移，浅色主题像水彩洇纸，深色主题像霓虹辉光 */
    [['bd-b1', '24vmax', '8vw', '-6vh'], ['bd-b2', '30vmax', '62vw', '38vh'], ['bd-b3', '20vmax', '30vw', '62vh']]
      .forEach(function (c) {
        var i = document.createElement('i');
        i.className = 'bd-blob ' + c[0];
        i.style.width = i.style.height = c[1];
        i.style.left = c[2];
        i.style.top = c[3];
        bd.appendChild(i);
      });

    /* 电路走线层（图案由 CSS data-uri 提供） */
    var cir = document.createElement('div');
    cir.className = 'bd-circuit';
    bd.appendChild(cir);

    /* 上浮代码字符层：0/1/hex/关键字残影，分布随机、速度各异 */
    var g = document.createElement('div');
    g.className = 'bd-glyphs';
    var CHARS = '01<>{}[]/;*=+λπΔΣMQTTUDPTCPGPSGW-I2CSPIGPIOACKNACKCRC'.split('');
    for (var k = 0; k < 18; k++) {
      var s = document.createElement('span');
      s.textContent = CHARS[(Math.random() * CHARS.length) | 0] + (Math.random() < 0.3 ? CHARS[(Math.random() * CHARS.length) | 0] : '');
      s.style.left = (Math.random() * 96 + 2) + 'vw';
      s.style.fontSize = (11 + Math.random() * 7).toFixed(1) + 'px';
      s.style.animationDuration = (42 + Math.random() * 46).toFixed(1) + 's';
      s.style.animationDelay = (-Math.random() * 60).toFixed(1) + 's';
      s.style.opacity = (0.05 + Math.random() * 0.09).toFixed(2);
      g.appendChild(s);
    }
    bd.appendChild(g);

    document.body.insertBefore(bd, document.body.firstChild);
    window.__backdrop = bd;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  /* 与特效中心联动：bg 开关关闭 → html.fx-no-bg（CSS 负责暂停/隐藏） */
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
