/*
 * 夜神月博客 · 本地一键启停（零依赖）
 * 用法：
 *   node manage.js        切换（运行中则停止，未运行则启动）
 *   node manage.js start  启动
 *   node manage.js stop   停止
 *   node manage.js status 查看状态
 *
 * 端口自适应：
 *   - 首选端口 3210（可用环境变量 PORT 覆盖）。
 *   - 启动时若端口被占用（比如另一个项目抢了端口），server.js 会自动
 *     依次尝试 +1（最多 +20）直到找到空闲端口，并把实际端口写入 .port。
 *   - stop / status 读取 .port 定位真实服务，不会再被端口变动搞丢。
 */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const ROOT = __dirname;
const PID_FILE = path.join(ROOT, 'server.pid');
const LOG_FILE = path.join(ROOT, 'server.log');
const PAUSE_FILE = path.join(ROOT, '.paused'); /* 存在时看门狗不自动拉起 */
const PORT_FILE = path.join(ROOT, '.port');    /* server.js 启动后写实际端口 */
const PORT = Number(process.env.PORT) || 3210; /* 首选端口 */

function readPid() {
  try { return parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10); } catch (e) { return null; }
}
function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function ourPid() {
  const pid = readPid();
  return alive(pid) ? pid : null;
}
function killPid(pid) {
  if (process.platform === 'win32') {
    try { cp.execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {}
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch (e) {}
  }
}
/* 实际端口：优先 .port 文件（server 自适应后写入），否则首选端口 */
function actualPort() {
  try {
    const p = parseInt(fs.readFileSync(PORT_FILE, 'utf8'), 10);
    if (p >= 1024 && p <= 65535) return p;
  } catch (e) {}
  return PORT;
}
function portListenerPid(port) {
  try {
    const out = cp.execSync('netstat -ano | findstr :' + port + ' | findstr LISTENING', { encoding: 'utf8' });
    const m = out.match(/LISTENING\s+(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  } catch (e) { return null; }
}
/* 判断某 PID 的命令行是否是本博客的 server.js（防误判别的项目/误停） */
function isBlogProc(pid) {
  if (!pid) return false;
  try {
    const out = cp.execSync('wmic process where "processid=' + pid + '" get commandline /format:list', { encoding: 'utf8' });
    return /server\.js/i.test(out);
  } catch (e) { return false; }
}
/* 找正在运行的博客进程：PID 文件 → 实际端口监听者（须为 server.js）→ 首选端口监听者 */
function findBlogPid() {
  const own = ourPid();
  if (own) return { pid: own, via: 'PID 文件', port: actualPort() };
  for (const port of [...new Set([actualPort(), PORT])]) {
    const pid = portListenerPid(port);
    if (pid && isBlogProc(pid)) return { pid, via: '端口 ' + port, port };
  }
  return null;
}

function start() {
  try { fs.unlinkSync(PAUSE_FILE); } catch (e) {} /* 手动启动 = 解除停机标记，看门狗恢复护航 */
  const running = findBlogPid();
  if (running) {
    console.log('✅ 博客服务已在运行（PID ' + running.pid + '，经' + running.via + '定位）');
    console.log('   前台：http://localhost:' + running.port);
    return;
  }
  const out = fs.openSync(LOG_FILE, 'a');
  const child = cp.spawn(process.execPath, ['server.js'], {
    cwd: ROOT, detached: true,
    stdio: ['ignore', out, out], env: process.env
  });
  child.unref(); /* 关键：解除引用，父进程退出不连带杀掉服务 */
  fs.writeFileSync(PID_FILE, String(child.pid));
  /* 等服务落定，读回实际端口（可能因占用而自动 +1） */
  let shown = PORT;
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    try { shown = actualPort(); break; } catch (e) {}
    const t1 = Date.now(); while (Date.now() - t1 < 150) {}
  }
  console.log('🚀 已启动博客服务（PID ' + child.pid + '）');
  console.log('   前台：http://localhost:' + shown + (shown !== PORT ? '  （端口 ' + PORT + ' 被占用，已自动改用 ' + shown + '）' : ''));
  console.log('   后台：http://localhost:' + shown + '/admin');
  console.log('   关闭：再次双击本脚本，或运行  node manage.js stop');
}

function stop() {
  const found = findBlogPid();
  if (!found) { console.log('ℹ️  当前没有运行中的博客服务。'); return; }
  killPid(found.pid);
  try { fs.unlinkSync(PID_FILE); } catch (e) {}
  try { fs.unlinkSync(PORT_FILE); } catch (e) {} /* 清端口记录，下次从首选端口重新自适应 */
  fs.writeFileSync(PAUSE_FILE, new Date().toISOString()); /* 抑制看门狗 5 分钟内复活 */
  console.log('🛑 已停止博客服务（PID ' + found.pid + '，经' + found.via + '定位）');
  console.log('   ⏸ 已放置停机标记（.paused），看门狗不会自动拉起；运行 start / toggle 即恢复。');
}

function status() {
  const found = findBlogPid();
  if (!found) { console.log('⭕ 未运行'); return; }
  const own = ourPid();
  console.log('✅ 运行中（PID ' + found.pid + (own ? '' : '，非本脚本启动') + '）  前台：http://localhost:' + found.port);
}

(async () => {
  const cmd = process.argv[2] || 'toggle';
  if (cmd === 'start') return start();
  if (cmd === 'stop') return stop();
  if (cmd === 'status') return status();
  // toggle
  if (findBlogPid()) return stop();
  /* 端口被别的程序占用时不再拒绝启动 —— server.js 会自动换空闲端口 */
  start();
})();
