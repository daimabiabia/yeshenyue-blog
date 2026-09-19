/*
 * 夜神月博客 · 本地一键启停（零依赖）
 * 用法：
 *   node manage.js        切换（运行中则停止，未运行则启动）
 *   node manage.js start  启动
 *   node manage.js stop   停止
 *   node manage.js status 查看状态
 * 说明：用 PID 文件记录启动的进程，停止时精准杀掉，不会误伤其他程序。
 */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const ROOT = __dirname;
const PID_FILE = path.join(ROOT, 'server.pid');
const LOG_FILE = path.join(ROOT, 'server.log');
const PAUSE_FILE = path.join(ROOT, '.paused'); /* 存在时看门狗不自动拉起 */
const PORT = Number(process.env.PORT) || 3210;

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
function portInUse() {
  return new Promise((res) => {
    const net = require('net');
    const s = net.createServer();
    s.once('error', (e) => res(e.code === 'EADDRINUSE'));
    s.once('listening', () => s.close(() => res(false)));
    s.listen(PORT);
  });
}

function portListenerPid() {
  /* 用 netstat 找出占用本端口的监听 PID（本端口为博客专属，可安全兜底） */
  try {
    const out = cp.execSync('netstat -ano | findstr :' + PORT + ' | findstr LISTENING', { encoding: 'utf8' });
    const m = out.match(/LISTENING\s+(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  } catch (e) { return null; }
}

function start() {
  try { fs.unlinkSync(PAUSE_FILE); } catch (e) {} /* 手动启动 = 解除停机标记，看门狗恢复护航 */
  const running = ourPid();
  if (running) {
    console.log('✅ 博客服务已在运行（PID ' + running + '）');
    console.log('   前台：http://localhost:' + PORT);
    return;
  }
  const out = fs.openSync(LOG_FILE, 'a');
  const child = cp.spawn(process.execPath, ['server.js'], {
    cwd: ROOT, detached: true,
    stdio: ['ignore', out, out], env: process.env
  });
  child.unref(); /* 关键：解除引用，父进程退出不连带杀掉服务 */
  fs.writeFileSync(PID_FILE, String(child.pid));
  console.log('🚀 已启动博客服务（PID ' + child.pid + '）');
  console.log('   前台：http://localhost:' + PORT);
  console.log('   后台：http://localhost:' + PORT + '/admin');
  console.log('   关闭：再次双击本脚本，或运行  node manage.js stop');
}

function stop() {
  let pid = ourPid();
  let via = 'PID 文件';
  if (!pid) {
    /* 兜底：看门狗/手动启动的进程没有 PID 文件，按专属端口找监听者 */
    pid = portListenerPid();
    via = '端口 ' + PORT;
  }
  if (!pid) { console.log('ℹ️  当前没有运行中的博客服务。'); return; }
  killPid(pid);
  try { fs.unlinkSync(PID_FILE); } catch (e) {}
  fs.writeFileSync(PAUSE_FILE, new Date().toISOString()); /* 抑制看门狗 5 分钟内复活 */
  console.log('🛑 已停止博客服务（PID ' + pid + '，经' + via + '定位）');
  console.log('   ⏸ 已放置停机标记（.paused），看门狗不会自动拉起；运行 start / toggle 即恢复。');
}

function status() {
  const pid = ourPid();
  const listener = portListenerPid();
  if (pid) {
    console.log('✅ 运行中（PID ' + pid + '）  前台：http://localhost:' + PORT);
  } else if (listener) {
    console.log('✅ 运行中（PID ' + listener + '，非本脚本启动）  前台：http://localhost:' + PORT);
  } else {
    console.log('⭕ 未运行');
  }
}

(async () => {
  const cmd = process.argv[2] || 'toggle';
  if (cmd === 'start') return start();
  if (cmd === 'stop') return stop();
  if (cmd === 'status') return status();
  // toggle
  if (ourPid()) return stop();
  if (await portInUse()) {
    console.log('⚠️  端口 ' + PORT + ' 已被占用（可能不是本脚本启动的进程）。');
    console.log('    请先关闭占用程序，或手动结束后重试。');
    return;
  }
  start();
})();
