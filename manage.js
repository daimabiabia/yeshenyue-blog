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
const PORT = Number(process.env.PORT) || 3000;

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

function start() {
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
  fs.writeFileSync(PID_FILE, String(child.pid));
  console.log('🚀 已启动博客服务（PID ' + child.pid + '）');
  console.log('   前台：http://localhost:' + PORT);
  console.log('   后台：http://localhost:' + PORT + '/admin');
  console.log('   关闭：再次双击本脚本，或运行  node manage.js stop');
}

function stop() {
  const pid = ourPid();
  if (!pid) { console.log('ℹ️  当前没有由本脚本启动的服务进程。'); return; }
  killPid(pid);
  try { fs.unlinkSync(PID_FILE); } catch (e) {}
  console.log('🛑 已停止博客服务（PID ' + pid + '）');
}

function status() {
  const pid = ourPid();
  console.log(pid ? '✅ 运行中（PID ' + pid + '）' : '⭕ 未运行');
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
