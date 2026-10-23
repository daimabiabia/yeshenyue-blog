/* 全站审计 v4：串行逐路由访问，收集 JS 报错 / 失败请求 / 空渲染，结果写 <pre id="e2eOut"> */
(function () {
  var out = [];
  var errs = [];
  var done = false;
  function ok(name, cond, detail) { out.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); }

  window.addEventListener('error', function (e) { if (!done) errs.push('ERR ' + (e.message || '?') + ' @' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '?')); });
  window.addEventListener('unhandledrejection', function (e) { if (!done) errs.push('REJ ' + String((e.reason && e.reason.message) || e.reason).slice(0, 160)); });
  var of = window.fetch;
  window.fetch = function (u, o) {
    return of.apply(this, arguments).then(function (r) {
      if (!r.ok && !done && !(r.status === 401 && /\/api\/drive/.test(String(u)))) errs.push('HTTP ' + r.status + ' ' + u);
      return r;
    }, function (er) { if (!done) errs.push('FETCHFAIL ' + u + ' ' + ((er && er.message) || '')); throw er; });
  };
  var ce = console.error;
  console.error = function () { if (!done) errs.push('CERR ' + Array.prototype.map.call(arguments, String).join(' ').slice(0, 160)); ce.apply(console, arguments); };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitFor(fn, maxTicks, interval) {
    interval = interval || 150;
    return new Promise(function (res) {
      var n = 0;
      (function tick() {
        n += 1;
        if (fn()) return res(true);
        if (n >= maxTicks) return res(false);
        setTimeout(tick, interval);
      })();
    });
  }
  function snap(label) { if (errs.length) { out.push('== ' + label + ' 异常 =='); errs.splice(0).forEach(function (x) { out.push('  ' + x); }); } }
  function visLen(id) { var el = document.getElementById(id); return el && !el.hidden ? el.innerHTML.length : -1; }
  function children(id) { var el = document.getElementById(id); return el && !el.hidden ? el.children.length : -1; }

  /* [hash, 断言函数, detail函数] */
  var routes = [
    ['#/archive', function () { return visLen('archive') > 150 && children('posts') > 0; }, function () { return 'archive=' + visLen('archive') + ' posts=' + children('posts'); }],
    ['#/links', function () { return visLen('linksPage') > 150; }, function () { return 'linksPage=' + visLen('linksPage'); }],
    ['#/wall', function () { return visLen('wall') > 150; }, function () { return 'wall=' + visLen('wall'); }],
    ['#/chat', function () { return visLen('chat') > 100; }, function () { return 'chat=' + visLen('chat'); }],
    ['#/me', function () { return visLen('me') > 300; }, function () { return 'me=' + visLen('me'); }],
    ['#/gallery', function () { return visLen('gallery') > 100; }, function () { return 'gallery=' + visLen('gallery'); }],
    ['#/drive', function () { return visLen('drive') > 100; }, function () { return 'drive=' + visLen('drive'); }],
  ];

  function report() {
    if (done) return;
    done = true;
    var pre = document.getElementById('e2eOut');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'e2eOut'; document.body.appendChild(pre); }
    out.push('E2E_DONE');
    pre.textContent = out.join('\n');
  }

  (async function () {
    setTimeout(report, 45000);

    var ready = await waitFor(function () { var c = document.getElementById('cats'); return c && c.children.length > 0; }, 60);
    ok('app 初始化(#cats 渲染)', ready, 'cats children=' + ((document.getElementById('cats') || { children: [] }).children.length));
    snap('初始化');

    [['#cats', 1], ['#iotpath', 1], ['#roadmap', 1], ['#hotList', 0], ['#pickCard', 0], ['#tagcloud', 0], ['#achWall', 0], ['#progress', 0], ['#stats', 0]].forEach(function (p) {
      var el = document.querySelector(p[0]);
      ok('首页区块 ' + p[0], !!(el && el.children.length >= p[1] && el.innerHTML.length > 20), el ? el.children.length + ' children / ' + el.innerHTML.length + ' len' : 'missing');
    });
    /* 足迹：无阅读记录时隐藏属正常 */
    var fpSec = document.getElementById('footprint-sec');
    var fp = document.getElementById('footprints');
    ok('首页区块 #footprints(或隐藏)', !!fp && (fpSec.hidden || fp.children.length > 0), fpSec ? (fpSec.hidden ? 'hidden(无阅读记录)' : fp.children.length + ' children') : 'missing');
    snap('首页');

    var postA = document.querySelector('a[href^="#/post/"]');
    if (postA) {
      var pid = postA.getAttribute('href');
      location.hash = pid;
      await waitFor(function () { return visLen('reader') > 300; }, 40);
      ok('文章页渲染 ' + pid, visLen('reader') > 300, 'reader len=' + visLen('reader'));
      ok('文章正文非空', !!document.querySelector('#reader .md-body, #reader .markdown, #reader article, #reader pre, #reader h2'), '');
      snap('文章页');
    } else ok('文章链接存在', false, 'no post links');

    var catA = document.querySelector('a[href^="#/cat/"]');
    if (catA) {
      location.hash = catA.getAttribute('href');
      await waitFor(function () { return visLen('home') > 0 && children('posts') > 0 && document.getElementById('listHead') && !document.getElementById('listHead').hidden; }, 40);
      ok('栏目页渲染 ' + catA.getAttribute('href'), visLen('home') > 0 && children('posts') > 0, 'posts children=' + children('posts') + ' listHead len=' + visLen('listHead'));
      snap('栏目页');
    }
    var tagA = document.querySelector('a[href^="#/tag/"]');
    if (tagA) {
      location.hash = tagA.getAttribute('href');
      await waitFor(function () { return children('posts') > 0; }, 40);
      ok('标签页渲染 ' + decodeURIComponent(tagA.getAttribute('href')), children('posts') > 0, 'posts children=' + children('posts'));
      snap('标签页');
    }

    for (var i = 0; i < routes.length; i++) {
      errs.length = 0;
      location.hash = routes[i][0];
      var pass = await waitFor(routes[i][1], 40);
      ok('路由 ' + routes[i][0], pass, routes[i][2]());
      snap(routes[i][0]);
    }

    location.hash = '#/';
    await sleep(200);
    ok('全站零 JS 报错', !errs.length, errs.length ? errs[0] : '');
    report();
    try { window.stop(); } catch (e) {}
  })().catch(function (e) { out.push('FATAL ' + ((e && e.message) || e)); report(); try { window.stop(); } catch (e2) {} });
})();
