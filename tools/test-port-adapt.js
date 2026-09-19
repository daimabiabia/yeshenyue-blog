/*
 * 端口自适应回归测试（单进程编排，不依赖跨命令存活）
 * 场景：
 *   A. 3210 空闲 → server 落在 3210，.port=3210
 *   B. 3210 被占 → server 自动落 3211，.port=3211，API 200
 *   C. 回收：删占位与 server，恢复干净状态
 */
const cp = require('child_process');
const fs = require('fs');
const http = require('http');
const NET = require('net');
const path = require('path');
const ROOT = 'E:/' + '夜神月博客';
const PORT_FILE = path.join(ROOT, '.port');

const results = [];
function ok(name, cond, detail) {
  results.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function httpCode(port, p) {
  return new Promise((res) => {
    const req = http.get({ host: '127.0.0.1', port, path: p || '/api/site', timeout: 2500 }, (r) => { res(r.statusCode); r.resume(); });
    req.on('error', () => res(0));
    req.on('timeout', () => { req.destroy(); res(0); });
  });
}
function listenerPid(port) {
  try {
    const out = cp.execSync('netstat -ano | findstr :' + port + ' | findstr LISTENING', { encoding: 'utf8' });
    const m = out.match(/LISTENING\s+(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  } catch (e) { return null; }
}
function killTree(pid) { try { cp.execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {} }
function rm(p) { try { fs.unlinkSync(p); } catch (e) {} }
function spawnServer() {
  const ch = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, detached: true, stdio: 'ignore', env: process.env });
  ch.unref();
  return ch.pid;
}
async function waitPort(pred, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const port = pred();
    if (port) return port;
    await sleep(200);
  }
  return null;
}
function readDotPort() {
  try { const p = parseInt(fs.readFileSync(PORT_FILE, 'utf8'), 10); return p >= 1024 && p <= 65535 ? p : null; } catch (e) { return null; }
}

(async () => {
  /* 清场：确保无残留 server / .port */
  for (const p of [3210, 3211, 3212]) { const pid = listenerPid(p); if (pid && /server\.js/i.test((() => { try { return cp.execSync('wmic process where "processid=' + pid + '" get commandline /format:list', { encoding: 'utf8' }); } catch (e) { return ''; } })())) killTree(pid); }
  rm(PORT_FILE);
  await sleep(400);

  /* 场景 A：3210 空闲，应落 3210 */
  const pidA = spawnServer();
  const portA = await waitPort(() => listenerPid(3210) ? 3210 : (readDotPort() === 3210 ? 3210 : null), 6000);
  ok('A: 空闲时落在首选端口 3210', portA === 3210, 'portA=' + portA + ' .port=' + readDotPort());
  const codeA = await httpCode(3210);
  ok('A: 3210 API 200', codeA === 200, 'code=' + codeA);
  killTree(pidA);
  rm(PORT_FILE);
  await sleep(600);

  /* 场景 B：占住 3210，应自动落 3211 */
  const occupier = cp.spawn(process.execPath, ['-e', 'require("http").createServer((q,s)=>s.end("occ")).listen(3210)'], { detached: true, stdio: 'ignore' });
  occupier.unref();
  await sleep(900);
  ok('B: 前置 - 3210 已被占位进程占用', listenerPid(3210) !== null, 'pid=' + listenerPid(3210));

  const pidB = spawnServer();
  const landedB = await waitPort(() => {
    const dot = readDotPort();
    if (dot && listenerPid(dot)) return dot;
    if (listenerPid(3211)) return 3211;
    return null;
  }, 8000);
  ok('B: 3210 被占时自动改用 3211', landedB === 3211, 'landed=' + landedB + ' .port=' + readDotPort());
  const codeB = await httpCode(3211);
  ok('B: 3211 API 200', codeB === 200, 'code=' + codeB);
  const codeB0 = await httpCode(3210);
  ok('B: 3210 仍是占位进程（未被抢）', codeB0 === 200, 'code=' + codeB0);
  killTree(pidB);
  killTree(occupier.pid);
  rm(PORT_FILE);
  await sleep(600);

  /* 场景 C：占位撤除后恢复 3210 */
  const pidC = spawnServer();
  const portC = await waitPort(() => listenerPid(3210) ? 3210 : null, 6000);
  ok('C: 环境恢复后回落 3210', portC === 3210, 'portC=' + portC);
  const codeC = await httpCode(3210);
  ok('C: 3210 API 200', codeC === 200, 'code=' + codeC);
  killTree(pidC);
  rm(PORT_FILE);

  const pass = results.filter((r) => r.startsWith('PASS')).length;
  console.log('===== ' + pass + '/' + results.length + ' PASS =====');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH', e); process.exit(1); });
