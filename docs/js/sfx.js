/* 夜神月博客 · sfx.js 8-bit 音效引擎（WebAudio 零依赖）
 * blip 点击 / boom 爆炸 / mega 超级爆炸 / coin 成就 / fanfare Konami / whoosh 主题切换
 * 默认关闭，导航 🔊 按钮或 S 键切换，localStorage('ysy_sfx') 记忆
 * 降级：无 AudioContext / prefers-reduced-motion 时静默不报错
 */
(function () {
  'use strict';
  if (window.SFX) return;

  var KEY = 'ysy_sfx';
  var enabled = false;
  try { enabled = localStorage.getItem(KEY) === '1'; } catch (e) {}

  var actx = null;
  function ctx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    return actx;
  }

  /* 方波哔声：freq 起→止，时长 ms，音量 0-1 */
  function beep(type, f0, f1, ms, vol, when) {
    var a = ctx();
    if (!a) return;
    var t = a.currentTime + (when || 0);
    var o = a.createOscillator();
    var g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + ms / 1000);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + ms / 1000 + 0.02);
  }

  /* 噪声爆裂：爆炸低频轰 */
  function noise(ms, vol) {
    var a = ctx();
    if (!a) return;
    var len = Math.floor(a.sampleRate * ms / 1000);
    var buf = a.createBuffer(1, len, a.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = a.createBufferSource();
    var g = a.createGain();
    var f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, a.currentTime);
    f.frequency.exponentialRampToValueAtTime(120, a.currentTime + ms / 1000);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
    src.buffer = buf;
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start();
  }

  var SFX = {
    ready: true,
    get enabled() { return enabled; },
    toggle: function () {
      enabled = !enabled;
      try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) {}
      if (enabled) SFX.blip(); /* 开启即给一声反馈 */
      return enabled;
    },
    blip: function () { if (enabled) beep('square', 880, 1320, 70, 0.05); },
    boom: function () {
      if (!enabled) return;
      noise(220, 0.09);
      beep('triangle', 160, 60, 180, 0.08);
    },
    mega: function () {
      if (!enabled) return;
      noise(420, 0.16);
      beep('sawtooth', 220, 40, 400, 0.12);
      beep('square', 440, 880, 120, 0.05, 0.05);
    },
    coin: function () {
      if (!enabled) return;
      beep('square', 988, 988, 80, 0.06);
      beep('square', 1319, 1319, 200, 0.06, 0.08);
    },
    whoosh: function () {
      if (!enabled) return;
      beep('sine', 300, 1200, 160, 0.05);
      beep('sine', 1200, 300, 160, 0.05, 0.14);
    },
    fanfare: function () {
      if (!enabled) return;
      var seq = [523, 659, 784, 1047, 784, 1047, 1319];
      seq.forEach(function (f, i) { beep('square', f, f, 140, 0.06, i * 0.13); });
    }
  };

  /* 监听特效事件自动配音 */
  document.addEventListener('fx:burst', function () { SFX.boom(); });
  document.addEventListener('fx:mega', function () { SFX.mega(); });
  document.addEventListener('fx:konami', function () { SFX.fanfare(); });

  window.SFX = SFX;
})();
