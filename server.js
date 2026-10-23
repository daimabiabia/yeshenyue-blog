/**
 * 夜神月技术博客 —— 零依赖 Node 服务器
 *
 * 设计要点：
 *  - 内容全部存于 data/site.json，后台改动即落盘，前台刷新即生效。
 *  - 零第三方依赖，仅用 Node 内置 http / fs / path / crypto。
 *  - API 契约保持稳定，前端可独立升级。
 *
 * 启动：node server.js   （可选 PORT=8080 node server.js）
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

/* ============ 路径与常量 ============ */
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const LIKE_FILE = path.join(DATA_DIR, 'likes.json');
const COMMENT_FILE = path.join(DATA_DIR, 'comments.json');
const DRIVE_DIR = path.join(DATA_DIR, 'drive');
const PORT = Number(process.env.PORT) || 3210;
const MAX_BODY = 6 * 1024 * 1024; // 请求体上限 6MB
const MAX_UPLOAD = 4 * 1024 * 1024; // 图片上限 4MB
const MAX_DRIVE_UPLOAD = 30 * 1024 * 1024; // 网盘单文件上限 30MB

[DATA_DIR, PUBLIC_DIR, UPLOAD_DIR, DRIVE_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/* ============ 工具 ============ */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/* ---- 真实访客 IP：走 cloudflared 隧道 / Render 等反代时 remoteAddress 恒为 127.0.0.1，
 * 导致 UV 统计全是同一个值、IP 拉黑误伤本机。设环境变量 TRUST_PROXY=1（Render 上默认生效）
 * 后信任 x-forwarded-for 首段；本地直连不受影响。 ---- */
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || !!process.env.RENDER;
function realIP(req) {
  if (TRUST_PROXY) {
    const xf = String(req.headers['x-forwarded-for'] || '');
    const first = xf.split(',')[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress || 'unknown';
}

/* ---- 访客互动数据（点赞 / 留言）持久化 ---- */
function loadJSON(file, dflt) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return dflt; } }
function saveJSON(file, val) { try { fs.writeFileSync(file, JSON.stringify(val)); } catch (e) {} }
const likes = loadJSON(LIKE_FILE, {});
const DRIVE_DL_FILE = path.join(DATA_DIR, 'drive-downloads.json');
const driveDl = loadJSON(DRIVE_DL_FILE, {}); // { 相对路径: 下载次数 }

/* ---- 照片墙（data/gallery.json：[{id,src,title,rot,tape,cap}]） ---- */
const GALLERY_FILE = path.join(DATA_DIR, 'gallery.json');
let gallery = loadJSON(GALLERY_FILE, null);
if (!Array.isArray(gallery)) gallery = [];
function saveGallery() { saveJSON(GALLERY_FILE, gallery); }

/* ---- IP 黑名单（data/banned.json: [ip]）：命中后所有页面与 API 返回 429 ---- */
const BANNED_FILE = path.join(DATA_DIR, 'banned.json');
let banned = loadJSON(BANNED_FILE, []);
if (!Array.isArray(banned)) banned = [];
function saveBanned() { saveJSON(BANNED_FILE, banned); }
function isBanned(ip) { return banned.includes(ip); }

/* ---- 可疑 IP（data/watch.json: [{ip,count,last}]）：登录/解锁失败自动记录 ---- */
const WATCH_FILE = path.join(DATA_DIR, 'watch.json');
let watch = loadJSON(WATCH_FILE, []);
if (!Array.isArray(watch)) watch = [];
function saveWatch() { saveJSON(WATCH_FILE, watch); }
function noteWatch(ip, reason) {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return; // 本机不计
  const it = watch.find((w) => w.ip === ip);
  if (it) { it.count += 1; it.last = new Date().toISOString(); if (reason) it.reason = reason; }
  else watch.push({ ip, count: 1, last: new Date().toISOString(), reason: reason || '' });
  if (watch.length > 100) watch = watch.slice(-100); // 只留最近 100 条
  saveWatch();
}

/* ---- 访问日志（data/visits.json：PV/UV + 最近 300 条，只记页面与 API 主路由） ---- */
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');
let visits = loadJSON(VISITS_FILE, null);
if (!visits || typeof visits !== 'object') visits = { total: 0, days: {}, uips: [], recent: [] };
function saveVisits() { saveJSON(VISITS_FILE, visits); }
/* 写入节流：访问日志每请求都会变，直接每请求同步写盘太浪费；
 * 改为标脏 + 最多 5 秒落盘一次，退出时冲刷兜底。 */
let visitsDirty = false;
let visitsFlushTimer = null;
function scheduleVisitsSave() {
  visitsDirty = true;
  if (visitsFlushTimer) return;
  visitsFlushTimer = setTimeout(() => {
    visitsFlushTimer = null;
    if (visitsDirty) { visitsDirty = false; saveVisits(); }
  }, 5000);
  if (visitsFlushTimer.unref) visitsFlushTimer.unref();
}
function flushVisits() {
  if (visitsFlushTimer) { clearTimeout(visitsFlushTimer); visitsFlushTimer = null; }
  if (visitsDirty) { visitsDirty = false; saveVisits(); }
}
function noteVisit(ip, pathname) {
  if (/\.(css|js|png|jpg|jpeg|webp|gif|ico|svg|woff2?)$/i.test(pathname)) return; // 静态资源不计
  /* 轮询/高频接口不计 PV：聊天室每 2.2s 轮询一次、点赞每页各拉一次、网盘轮询与下载，
   * 计入会把 PV 严重灌水（挂一晚上聊天室 = 上万假 PV） */
  if (/^\/api\/(chat|likes|comments|drive)(\/|$)/.test(pathname)) return;
  visits.total += 1;
  const day = new Date().toISOString().slice(0, 10);
  visits.days[day] = (visits.days[day] || 0) + 1;
  if (!visits.uips.includes(ip)) { visits.uips.push(ip); if (visits.uips.length > 5000) visits.uips = visits.uips.slice(-5000); }
  visits.recent.unshift({ ip, path: pathname, t: Date.now() });
  if (visits.recent.length > 300) visits.recent.length = 300;
  scheduleVisitsSave();
}
let comments = loadJSON(COMMENT_FILE, []);
const lastCommentAt = new Map(); /* ip -> 上次留言时间戳，留言冷却用 */
const lastLikeAt = new Map();    /* ip -> 上次点赞时间戳，点赞冷却用 */

/* ---- 留言墙（便利贴）与聊天室存储 ---- */
const WALL_FILE = path.join(DATA_DIR, 'wall.json');
let wall = loadJSON(WALL_FILE, []);
const lastWallAt = new Map();
const CHAT_FILE = path.join(DATA_DIR, 'chat.json');
let chat = loadJSON(CHAT_FILE, { msgs: [], online: [] });
if (!Array.isArray(chat.msgs)) chat.msgs = [];
if (!Array.isArray(chat.online)) chat.online = [];
const lastChatAt = new Map(); /* 聊天发送冷却 */
const lastJoinAt = new Map(); /* ip -> 上次 join 时间戳，加入冷却 */
function saveChat() { saveJSON(CHAT_FILE, chat); }
/* 在线名单 GC：45s 心跳超时即移除 */
function pruneOnline() {
  const now = Date.now();
  const before = chat.online.length;
  chat.online = chat.online.filter((u) => now - u.t < 45000);
  return before - chat.online.length;
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, SEC_HEADERS);
  /* gzip 协商：JSON 压缩率高（正文大 JSON 约 4~5 倍），>1KB 且客户端支持即压缩。
   * res.req 由 http 模块自动挂载，无需改动各调用点。 */
  const ae = String((res.req && res.req.headers['accept-encoding']) || '');
  if (body.length > 1024 && /\bgzip\b/.test(ae)) {
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
    res.writeHead(code, headers);
    return res.end(zlib.gzipSync(body));
  }
  res.writeHead(code, headers);
  res.end(body);
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const limit = cap || MAX_BODY;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        /* 超限：Node 在请求体未接收完时就结束响应会直接 RST 连接，
         * 客户端只看得到 ECONNRESET 拿不到 413。
         * 因此先把剩余请求体排空（resume 进 flowing 模式丢弃），
         * 收完或 8 秒兜底超时后再拒绝，主 catch 回 413。 */
        done = true;
        req.resume();
        req.on('end', () => reject(new Error('请求体过大')));
        const t = setTimeout(() => { try { req.destroy(); } catch (_) {} reject(new Error('请求体过大')); }, 8000);
        if (t.unref) t.unref();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try { resolve(Buffer.concat(chunks).toString('utf8') ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

/* 安全响应头：全站统一附加。
 *  - CSP：脚本只允许本站（前台/后台均无内联脚本），样式放行内联（模板与后台页大量使用 style 属性/标签）；
 *    图片放行 https 外链（Markdown 文章可贴外链图）。
 *  - frame-ancestors 'none' + X-Frame-Options：禁止被 iframe 嵌套，防点击劫持。
 */
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  /* font-src 需放行 fonts.gstatic.com、style-src 放行 fonts.googleapis.com，
   * 否则 Google Fonts 的 woff2 会被 CSP 静默拦截，全站退化为系统字体。 */
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self'; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

/* 静态文件 ETag 缓存：内容不变时命中 If-None-Match 直接 304，省带宽也省解析 */
const etagCache = new Map(); // filePath -> { mtimeMs, size, etag }
function etagOf(filePath, buf) {
  let st;
  try { st = fs.statSync(filePath); } catch (e) { return ''; }
  const hit = etagCache.get(filePath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.etag;
  const etag = '"' + crypto.createHash('sha1').update(buf).digest('hex') + '"';
  if (etagCache.size > 500) etagCache.clear();
  etagCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, etag });
  return etag;
}

/* 可压缩的静态类型：文本类收益大，图片/字体本身已压缩不重复处理 */
const GZIP_MIME = new Set(['text/html', 'text/css', 'application/javascript', 'application/json', 'image/svg+xml']);

function sendFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const headOnly = req && req.method === 'HEAD';
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SEC_HEADERS));
      res.end('Not Found');
      return;
    }
    const etag = etagOf(filePath, buf);
    const base = { ETag: etag || undefined };
    if (etag && req && req.headers['if-none-match'] === etag) {
      res.writeHead(304, Object.assign(base, SEC_HEADERS));
      return res.end();
    }
    const ctype = MIME[ext] || 'application/octet-stream';
    const h = Object.assign({
      'Content-Type': ctype,
      /* HTML 走协商缓存保证发版即生效；css/js/img 内容不变可直接用本地副本（有 ETag 兜底） */
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
      Vary: 'Accept-Encoding',
    }, base);
    /* gzip 协商（HEAD 不发体） */
    const ae = String((req && req.headers['accept-encoding']) || '');
    if (!headOnly && buf.length > 1024 && GZIP_MIME.has(String(ctype).split(';')[0]) && /\bgzip\b/.test(ae)) {
      h['Content-Encoding'] = 'gzip';
      res.writeHead(200, Object.assign(h, SEC_HEADERS));
      return res.end(zlib.gzipSync(buf));
    }
    if (headOnly) {
      h['Content-Length'] = buf.length; // HEAD 只给头不给体
      res.writeHead(200, Object.assign(h, SEC_HEADERS));
      return res.end();
    }
    res.writeHead(200, Object.assign(h, SEC_HEADERS));
    res.end(buf);
  });
}

// 防目录穿越：拼接后必须仍位于 base 内
function safeJoin(base, p) {
  const target = path.normalize(path.join(base, p));
  if (target !== base && !target.startsWith(base + path.sep)) return base;
  return target;
}

function uid() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w一-龥-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || uid();
}

/* ============ 资源网盘（data/drive：访客可见可下载的 IoT 资料库） ============ */
/* 允许入盘的扩展名白名单：文档 / 压缩包 / 固件镜像 / 常见源码与配置（不含 svg/html，防存储型 XSS） */
const DRIVE_EXTS = ['.md', '.txt', '.pdf', '.zip', '.7z', '.json', '.csv',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.yaml', '.yml', '.c', '.h', '.cpp', '.hpp', '.py', '.ino', '.hex', '.bin', '.elf'];
/* 允许在线预览（文本方式直出）的扩展名 */
const DRIVE_TEXT_EXTS = ['.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.c', '.h', '.cpp', '.hpp', '.py'];

/* 递归遍历网盘目录，返回扁平文件树（相对路径统一用 / 分隔） */
function walkDrive(dir, base) {
  let out = [];
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const it of items) {
    if (it.name.startsWith('.') || it.name === '_meta.json') continue; // 隐藏文件与元数据不入盘
    const full = path.join(dir, it.name);
    const rel = base ? base + '/' + it.name : it.name;
    if (it.isDirectory()) {
      out.push({ name: it.name, path: rel, type: 'dir' });
      out = out.concat(walkDrive(full, rel));
    } else {
      let st;
      try { st = fs.statSync(full); } catch (e) { continue; }
      out.push({ name: it.name, path: rel, type: 'file', size: st.size, mtime: st.mtimeMs, ext: path.extname(it.name).toLowerCase() });
    }
  }
  return out;
}

/* 网盘相对路径安全校验：拒绝 .. / 绝对路径 / 非法段，返回绝对路径或 null */
function driveSafe(rel) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  const segs = clean.split('/');
  if (segs.some((s) => !s || s === '.' || s === '..' || /["<>:|?*]/.test(s))) return null;
  const target = path.normalize(path.join(DRIVE_DIR, clean));
  if (target !== DRIVE_DIR && !target.startsWith(DRIVE_DIR + path.sep)) return null;
  return target;
}

/* 下载/预览前的公共检查，返回错误信息或 null */
function driveCheck(target) {
  const ext = path.extname(target).toLowerCase();
  if (!DRIVE_EXTS.includes(ext)) return '不支持的文件类型';
  let st;
  try { st = fs.statSync(target); } catch (e) { return '文件不存在'; }
  if (!st.isFile()) return '不是文件';
  return null;
}

/* Content-Disposition：ASCII 回退名 + RFC 5987 UTF-8 真名（支持中文文件名） */
function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  const utf8 = encodeURIComponent(name);
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + utf8;
}

/* 图片魔数白名单：上传文件必须匹配真实图片格式签名，扩展名由检测结果决定，
 * 杜绝把脚本/HTML 伪装成图片上传后被同源引用执行的风险。 */
const IMG_MAGIC = [
  { ext: '.png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }, // PNG 签名
  { ext: '.jpg', bytes: [0xff, 0xd8, 0xff] },                               // JPEG SOI
  { ext: '.gif', bytes: [0x47, 0x49, 0x46, 0x38] },                         // GIF8
  { ext: '.webp', bytes: [0x52, 0x49, 0x46, 0x46] },                        // RIFF....WEBP
];
function detectImageExt(buf) {
  if (!buf || buf.length < 12) return null;
  for (const t of IMG_MAGIC) {
    if (!t.bytes.every((b, i) => buf[i] === b)) continue;
    if (t.ext === '.webp' && buf.slice(8, 12).toString('latin1') !== 'WEBP') continue;
    return t.ext;
  }
  return null;
}

/* ============ 认证 ============ */
/* 密码哈希：scrypt（内存难解，抗 GPU 爆破）。
 * 旧记录（algo 缺失 = sha256(pass+salt)）在下次成功登录时自动迁移到 scrypt。 */
function hashPassword(pass, salt) {
  return crypto.scryptSync(String(pass), salt, 32).toString('hex');
}
let auth = loadAuth();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 会话 24 小时过期
const sessions = new Map(); // token -> { exp, kind: 'admin'|'drive' }（内存会话，重启后需重新登录/解锁）

/* 网盘访问口令（独立于后台密码）：data/drive-lock.json，无文件时用默认口令创建 */
const DRIVE_LOCK_FILE = path.join(DATA_DIR, 'drive-lock.json');
function loadDriveLock() {
  if (!fs.existsSync(DRIVE_LOCK_FILE)) {
    const salt = crypto.randomBytes(16).toString('hex');
    const pass = process.env.DRIVE_PASS || 'iot-2026'; // 可用环境变量设定初始口令
    const rec = { algo: 'scrypt', salt, hash: hashPassword(pass, salt) };
    fs.writeFileSync(DRIVE_LOCK_FILE, JSON.stringify(rec, null, 2));
    return rec;
  }
  return JSON.parse(fs.readFileSync(DRIVE_LOCK_FILE, 'utf8'));
}
let driveLock = loadDriveLock();
function saveDriveLock() { fs.writeFileSync(DRIVE_LOCK_FILE, JSON.stringify(driveLock, null, 2)); }
function verifyDriveLock(pass) {
  const p = String(pass || '');
  if (driveLock.algo === 'scrypt') return hashPassword(p, driveLock.salt) === driveLock.hash;
  /* 旧格式 sha256：校验通过即迁移为 scrypt */
  if (sha256(p + driveLock.salt) === driveLock.hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    driveLock = { algo: 'scrypt', salt, hash: hashPassword(p, salt) };
    saveDriveLock();
    return true;
  }
  return false;
}

/* 网盘解锁限速：与后台登录同规则但独立计数，互不影响 */
const driveFails = new Map(); // ip -> { count, lockedUntil }
function driveLockedMinutes(ip) {
  const rec = driveFails.get(ip);
  if (!rec) return null;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
    return Math.max(1, Math.ceil((rec.lockedUntil - Date.now()) / 60000));
  }
  if (rec.lockedUntil) driveFails.delete(ip);
  return null;
}
function recordDriveFail(ip) {
  const rec = driveFails.get(ip) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  let locked = false;
  if (rec.count >= LOGIN_MAX_FAILS) { rec.lockedUntil = Date.now() + LOGIN_LOCK_MS; rec.count = 0; locked = true; }
  driveFails.set(ip, rec);
  return { left: Math.max(0, LOGIN_MAX_FAILS - rec.count), locked };
}
/* 校验网盘访问 token：header 优先，其次 query（供 <a href> 下载使用）；admin token 天然放行 */
function checkDriveToken(req, url) {
  const q = url.searchParams.get('token');
  if (q) {
    const rec = sessions.get(q);
    if (rec && Date.now() <= rec.exp) return true;
  }
  return checkToken(req);
}

function loadAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    const salt = crypto.randomBytes(16).toString('hex');
    const pass = process.env.ADMIN_PASS || 'yeshenyue'; // 首次启动可用 ADMIN_PASS 环境变量设定
    const rec = { algo: 'scrypt', salt, hash: hashPassword(pass, salt) };
    fs.writeFileSync(AUTH_FILE, JSON.stringify(rec, null, 2));
    return rec;
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
}
function saveAuth() { fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2)); }
function verifyPassword(pass) {
  const p = String(pass);
  if (auth.algo === 'scrypt') {
    return hashPassword(p, auth.salt) === auth.hash;
  }
  /* 旧格式 sha256：校验通过则原地迁移为 scrypt，新盐新哈希落盘 */
  if (sha256(p + auth.salt) === auth.hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    auth = { algo: 'scrypt', salt, hash: hashPassword(p, salt) };
    saveAuth();
    return true;
  }
  return false;
}
function checkToken(req) {
  const m = (req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  const rec = sessions.get(m[1]);
  if (!rec) return false;
  if (Date.now() > rec.exp) { sessions.delete(m[1]); return false; } // 过期即吊销
  return true;
}
function pruneSessions() {
  const now = Date.now();
  for (const [t, rec] of sessions) if (now > rec.exp) sessions.delete(t);
}

/* 登录限速：同一 IP 连续失败 5 次锁定 15 分钟（内存态，重启即清零） */
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginFails = new Map(); // ip -> { count, lockedUntil }

function loginLockedMinutes(ip) {
  const rec = loginFails.get(ip);
  if (!rec) return null;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
    return Math.max(1, Math.ceil((rec.lockedUntil - Date.now()) / 60000));
  }
  if (rec.lockedUntil) loginFails.delete(ip); // 锁定期已过，重新计数
  return null;
}
function recordLoginFail(ip) {
  const rec = loginFails.get(ip) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  let locked = false;
  if (rec.count >= LOGIN_MAX_FAILS) { rec.lockedUntil = Date.now() + LOGIN_LOCK_MS; rec.count = 0; locked = true; }
  loginFails.set(ip, rec);
  return { left: Math.max(0, LOGIN_MAX_FAILS - rec.count), locked };
}

/* ============ 站点数据 ============ */
let site = loadSite();
function saveSite() {
  // 先写临时文件再改名，避免半截写入损坏 site.json
  const tmp = SITE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(site, null, 2));
  fs.renameSync(tmp, SITE_FILE);
}

function defaultSite() {
  return {
    site: {
      title: '夜神月 · 物联网技术博客',
      slogan: '小白起步，正在登神长阶的路上 —— 一行一行把物联网从 0 跑通到 1',
      about: '一枚刚入门的物联网小白，正在登神长阶的路上。从焊第一块 ESP32、烧第一个固件、发第一条 MQTT 消息开始，把每一次踩坑、每一行调通的代码都记在这里。不装大佬，只做一件事：把复杂的东西讲成人话，让和我一样的初学者能照着做出来。这条长阶没有终点——今天比你昨天的自己强一点，就是往上登了一级。',
      techStack: ['ESP32', 'STM32', 'MQTT', 'LoRa', 'AWS IoT', '边缘计算', 'RTOS', '网关'],
      stats: [
        { num: 'Lv.1', label: '当前段位' },
        { num: '0→1', label: '实战路线' },
        { num: '{posts}', label: '学习笔记', dynamic: 'posts' },
        { num: '∞', label: '长阶待攀' },
      ],
      categories: [
        { id: 'embedded', name: '嵌入式实战', icon: 'chip', desc: 'ESP32 / STM32 外设驱动、低功耗与 RTOS 落地' },
        { id: 'protocol', name: '协议解析', icon: 'wave', desc: 'MQTT / LoRaWAN / 私有二进制协议逆向与调优' },
        { id: 'cloudedge', name: '云边协同', icon: 'cloud', desc: 'AWS IoT / 边缘网关 / 数据上云与下发' },
        { id: 'pit', name: '踩坑记录', icon: 'bug', desc: '现场翻车与排障实录，少走弯路' },
        { id: 'hardware', name: '硬件随笔', icon: 'solder', desc: '选型、布线、EMC 与量产那些事' },
      ],
      tags: ['ESP32', 'STM32', 'MQTT', 'LoRa', 'LoRaWAN', 'AWS IoT', '边缘计算', '低功耗', 'RTOS', '网关', 'OTA', '传感器', 'EMC', 'MQTT-SN', 'FreeRTOS', '数据上云'],
      contact: {
        email: 'hi@yeshenyue.dev',
        github: 'https://github.com/yeshenyue',
        projects: [
          { name: 'esp-mqtt-framework', url: 'https://github.com/yeshenyue/esp-mqtt-framework', desc: '轻量 ESP32 MQTT 设备框架' },
          { name: 'lora-gateway-kit', url: 'https://github.com/yeshenyue/lora-gateway-kit', desc: 'LoRaWAN 边缘网关套件' },
          { name: 'iot-shadow-sync', url: 'https://github.com/yeshenyue/iot-shadow-sync', desc: '弱网下设备影子状态同步库' },
        ],
      },
    },
    posts: [],
  };
}

function loadSite() {
  if (!fs.existsSync(SITE_FILE)) {
    const d = defaultSite();
    fs.writeFileSync(SITE_FILE, JSON.stringify(d, null, 2));
    return d;
  }
  return JSON.parse(fs.readFileSync(SITE_FILE, 'utf8'));
}

/* ============ 文章装配 ============ */
function sanitizePost(input, isNew) {
  const src = input || {};
  const categoryIds = (site.site.categories || []).map((c) => c.id);
  const post = {
    id: isNew ? uid() : (src.id || uid()),
    title: String(src.title || '').trim(),
    category: categoryIds.includes(src.category) ? src.category : (categoryIds[0] || ''),
    date: /^\d{4}-\d{2}-\d{2}$/.test(src.date) ? src.date : new Date().toISOString().slice(0, 10),
    featured: !!src.featured,
    slug: slugify(src.slug || src.title),
    tags: Array.isArray(src.tags) ? src.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    excerpt: String(src.excerpt || '').trim(),
    content: String(src.content || ''),
    /* 难度等级：1-5，缺省 1。白名单必须保留 level，
     * 否则后台每次保存都会把存量文章的等级剥离（登神长阶/路线图全部退化 Lv.1） */
    level: Math.min(5, Math.max(1, Math.round(Number(src.level) || 1))),
  };
  if (!post.title) throw new Error('标题不能为空');
  return post;
}

/* 文章列表元数据：剔除 content 正文（占 /api/site 95% 体积），保留全部展示字段。
 * readMin 由服务端按与前端 readingTime 相同的公式预计算，卡片不再需要正文。 */
function postMeta(p) {
  const chars = String(p.content || '').replace(/\s/g, '').length;
  return {
    id: p.id, title: p.title, slug: p.slug, category: p.category,
    tags: p.tags || [], featured: p.featured, date: p.date,
    excerpt: p.excerpt || '', level: p.level, readMin: Math.max(1, Math.round(chars / 350)),
  };
}

/* ============ 路由 ============ */
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch (e) { res.writeHead(400, SEC_HEADERS); return res.end('Bad Request'); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } // 非法百分号编码（如 %ZZ）会抛 URIError
  catch (e) { res.writeHead(400, SEC_HEADERS); return res.end('Bad Request'); }
  const method = req.method.toUpperCase();
  const ip = realIP(req);

  try {
    /* ---- IP 黑名单：命中直接 429（静态资源也挡，完整隔离） ---- */
    if (isBanned(ip)) {
      res.writeHead(429, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SEC_HEADERS));
      return res.end('Your IP has been blocked.');
    }
    /* ---- 访问日志（页面与 API） ---- */
    noteVisit(ip, pathname);

    /* ---- 静态资源（GET/HEAD：HEAD 只回响应头，供 curl -I 与爬虫探测） ---- */
    if ((method === 'GET' || method === 'HEAD') && (pathname === '/' || pathname === '/index.html')) {
      return sendFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
    }
    if ((method === 'GET' || method === 'HEAD') && (pathname === '/admin' || pathname === '/admin.html')) {
      return sendFile(req, res, path.join(PUBLIC_DIR, 'admin.html'));
    }
    if ((method === 'GET' || method === 'HEAD') && /^\/(css|js|uploads|img)\//.test(pathname)) {
      return sendFile(req, res, safeJoin(PUBLIC_DIR, pathname));
    }

    /* ---- 公开 API：站点信息 + 文章列表（只含元数据，正文走 /api/post/:id） ---- */
    if (method === 'GET' && pathname === '/api/site') {
      return sendJSON(res, 200, { site: site.site, posts: site.posts.map(postMeta) });
    }

    /* ---- 公开 API：单篇文章全量（id 或 slug 寻址） ---- */
    if (method === 'GET' && pathname.startsWith('/api/post/')) {
      const key = pathname.slice('/api/post/'.length);
      const p = site.posts.find((x) => x.id === key) || site.posts.find((x) => x.slug === key);
      if (!p) return sendJSON(res, 404, { error: '文章不存在' });
      return sendJSON(res, 200, { post: p });
    }

    /* ---- 照片墙（公开只读） ---- */
    if (method === 'GET' && pathname === '/api/gallery') {
      return sendJSON(res, 200, { photos: gallery });
    }

    /* ---- 访客互动：点赞（跨访客真实计数，持久化 likes.json；IP 3 秒冷却防刷） ---- */
    if (method === 'GET' && pathname === '/api/likes') {
      return sendJSON(res, 200, { likes });
    }
    if (method === 'POST' && pathname === '/api/like') {
      const now = Date.now();
      if (lastLikeAt.size > 5000) lastLikeAt.clear(); // 防内存膨胀
      if (now - (lastLikeAt.get(ip) || 0) < 3000) {
        return sendJSON(res, 429, { error: '点太快了，歇一秒' });
      }
      const b = await readBody(req);
      const id = String((b && b.id) || '');
      if (!site.posts.some((p) => p.id === id)) return sendJSON(res, 404, { error: '文章不存在' });
      likes[id] = (likes[id] || 0) + 1;
      saveJSON(LIKE_FILE, likes);
      lastLikeAt.set(ip, now);
      return sendJSON(res, 200, { count: likes[id] });
    }

    /* ---- 访客互动：留言墙（持久化 comments.json，每篇保留最新 50 条，5 秒冷却） ---- */
    if (method === 'GET' && pathname === '/api/comments') {
      const q = new URL(req.url, 'http://localhost').searchParams;
      const post = q.get('post');
      const list = (post ? comments.filter((c) => c.post === post) : comments.slice())
        .sort((a, b2) => b2.t - a.t);
      return sendJSON(res, 200, { comments: list });
    }
    if (method === 'POST' && pathname === '/api/comment') {
      const now = Date.now();
      if (now - (lastCommentAt.get(ip) || 0) < 5000) {
        return sendJSON(res, 429, { error: '发言太快，歇几秒再发' });
      }
      const b = await readBody(req);
      const postId = String((b && b.post) || '');
      const text = String((b && b.text) || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      const name = String((b && b.name) || '').trim().slice(0, 24) || '匿名访客';
      if (!site.posts.some((p) => p.id === postId)) return sendJSON(res, 404, { error: '文章不存在' });
      if (!text) return sendJSON(res, 400, { error: '留言内容不能为空' });
      /* 记录留言者 IP：后台「留言管理」定位垃圾留言来源用 */
      const item = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), post: postId, name, text, t: now, ip };
      comments.push(item);
      const perPost = comments.filter((c) => c.post === postId).sort((a2, b2) => b2.t - a2.t);
      if (perPost.length > 50) {
        const drop = new Set(perPost.slice(50).map((c) => c.id));
        comments = comments.filter((c) => !drop.has(c.id));
      }
      saveJSON(COMMENT_FILE, comments);
      lastCommentAt.set(ip, now);
      return sendJSON(res, 200, { comment: item });
    }

    /* ---- 留言墙（便利贴墙 + 弹幕共用一份数据） ---- */
    if (method === 'GET' && pathname === '/api/wall') {
      return sendJSON(res, 200, { notes: wall.slice().sort((a, b2) => b2.t - a.t) });
    }
    if (method === 'POST' && pathname === '/api/wall') {
      const now = Date.now();
      if (now - (lastWallAt.get(ip) || 0) < 4000) {
        return sendJSON(res, 429, { error: '贴得太快，歇几秒再贴' });
      }
      const b = await readBody(req);
      const text = String((b && b.text) || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const name = String((b && b.name) || '').trim().slice(0, 24) || '匿名访客';
      const mood = ['happy', 'love', 'cool', 'tired', 'hack'].includes(String(b && b.mood)) ? b.mood : 'happy';
      const color = Number.isInteger(b && b.color) && b.color >= 0 && b.color <= 5 ? b.color : (Math.random() * 6) | 0;
      if (!text) return sendJSON(res, 400, { error: '便签内容不能为空' });
      const item = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), name, text, mood, color, t: now };
      wall.push(item);
      if (wall.length > 120) wall = wall.slice(-120);
      saveJSON(WALL_FILE, wall);
      lastWallAt.set(ip, now);
      return sendJSON(res, 200, { note: item });
    }

    /* ---- 多人聊天室：join / poll / send / leave ---- */
    if (method === 'POST' && pathname === '/api/chat/join') {
      /* join 冷却 + 在线人数上限：防止脚本无限伪造「潜入」系统消息刷爆消息流与在线名单 */
      const now = Date.now();
      if (lastJoinAt.size > 5000) lastJoinAt.clear();
      if (now - (lastJoinAt.get(ip) || 0) < 30000) {
        return sendJSON(res, 429, { error: '刚加入过，请稍候再试' });
      }
      pruneOnline();
      if (chat.online.length >= 100) {
        return sendJSON(res, 429, { error: '房间已满，稍后再来' });
      }
      const b = await readBody(req);
      const name = String((b && b.name) || '').trim().slice(0, 16) || '旅人' + ((Math.random() * 900 + 100) | 0);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const palette = ['#c4ff3d', '#61d6ff', '#ff7ab8', '#ffb454', '#b18cff', '#4ade80'];
      const color = palette[(Math.random() * palette.length) | 0];
      chat.online.push({ id, name, color, t: now });
      chat.msgs.push({ sys: 1, id: 's' + id, text: name + ' 潜入了聊天室', t: now });
      if (chat.msgs.length > 300) chat.msgs = chat.msgs.slice(-300);
      saveChat();
      lastJoinAt.set(ip, now);
      return sendJSON(res, 200, { id, name, color });
    }
    if (method === 'GET' && pathname === '/api/chat') {
      pruneOnline();
      const q = new URL(req.url, 'http://localhost').searchParams;
      /* 轮询即心跳：潜伏看聊天不发消息的成员也保持在线 */
      const hb = q.get('hb');
      if (hb) {
        const u = chat.online.find((x) => x.id === hb);
        if (u) u.t = Date.now();
      }
      const since = Number(q.get('since')) || 0;
      const msgs = since ? chat.msgs.filter((m) => m.t > since) : chat.msgs.slice(-50);
      return sendJSON(res, 200, { msgs, online: chat.online, now: Date.now() });
    }
    if (method === 'POST' && pathname === '/api/chat/send') {
      const b = await readBody(req);
      const uid = String((b && b.id) || '');
      const u = chat.online.find((x) => x.id === uid);
      if (!u) return sendJSON(res, 401, { error: '会话已过期，请重新进入' });
      const now = Date.now();
      if (now - (lastChatAt.get(uid) || 0) < 1200) {
        return sendJSON(res, 429, { error: '打字太快啦' });
      }
      const text = String((b && b.text) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!text) return sendJSON(res, 400, { error: '消息不能为空' });
      const msg = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), uid, name: u.name, color: u.color, text, t: now };
      chat.msgs.push(msg);
      u.t = now;
      if (chat.msgs.length > 300) chat.msgs = chat.msgs.slice(-300);
      saveChat();
      lastChatAt.set(uid, now);
      return sendJSON(res, 200, { msg });
    }
    if (method === 'POST' && pathname === '/api/chat/ping') {
      const b = await readBody(req);
      const uid = String((b && b.id) || '');
      const u = chat.online.find((x) => x.id === uid);
      if (u) { u.t = Date.now(); saveChat(); }
      return sendJSON(res, 200, { ok: true });
    }
    if (method === 'POST' && pathname === '/api/chat/leave') {
      const b = await readBody(req);
      const uid = String((b && b.id) || '');
      const u = chat.online.find((x) => x.id === uid);
      if (u) {
        chat.online = chat.online.filter((x) => x.id !== uid);
        chat.msgs.push({ sys: 1, id: 'l' + uid + Date.now().toString(36), text: u.name + ' 离开了', t: Date.now() });
        saveChat();
      }
      return sendJSON(res, 200, { ok: true });
    }

    /* ---- 资源网盘：文件树（需网盘口令解锁，admin token 放行） ---- */
    if (method === 'GET' && pathname === '/api/drive') {
      if (!checkDriveToken(req, url)) return sendJSON(res, 401, { error: '网盘已加密，请先解锁' });
      const files = walkDrive(DRIVE_DIR, '');
      const fileCount = files.filter((f) => f.type === 'file').length;
      const dirCount = files.filter((f) => f.type === 'dir').length;
      const totalSize = files.reduce((s, f) => s + (f.type === 'file' ? f.size : 0), 0);
      /* 小白友好描述元数据：data/drive/_meta.json（不在文件树中出现） */
      const driveMeta = loadJSON(path.join(DRIVE_DIR, '_meta.json'), {});
      return sendJSON(res, 200, { files, fileCount, dirCount, totalSize, downloads: driveDl,
        descs: driveMeta.files || {}, dirDescs: driveMeta.dirs || {} });
    }

    /* ---- 资源网盘：文本在线预览（仅白名单文本类型，需解锁） ---- */
    if (method === 'GET' && pathname === '/api/drive/raw') {
      if (!checkDriveToken(req, url)) return sendJSON(res, 401, { error: '网盘已加密，请先解锁' });
      const target = driveSafe(url.searchParams.get('file'));
      if (!target) return sendJSON(res, 400, { error: '非法路径' });
      const ext = path.extname(target).toLowerCase();
      if (!DRIVE_TEXT_EXTS.includes(ext)) return sendJSON(res, 415, { error: '该类型不支持在线预览，请下载查看' });
      const err = driveCheck(target);
      if (err) return sendJSON(res, err === '文件不存在' ? 404 : 415, { error: err });
      let buf;
      try { buf = fs.readFileSync(target); } catch (e) { return sendJSON(res, 404, { error: '文件不存在' }); }
      res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }, SEC_HEADERS));
      return res.end(buf);
    }

    /* ---- 资源网盘：下载（attachment，防路径穿越，需解锁） ---- */
    if (method === 'GET' && pathname === '/api/drive/download') {
      if (!checkDriveToken(req, url)) return sendJSON(res, 401, { error: '网盘已加密，请先解锁' });
      const target = driveSafe(url.searchParams.get('file'));
      if (!target) return sendJSON(res, 400, { error: '非法路径' });
      const err = driveCheck(target);
      if (err) {
        res.writeHead(err === '文件不存在' ? 404 : 415, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SEC_HEADERS));
        return res.end(err);
      }
      const st = fs.statSync(target);
      /* 下载计数（相对路径为 key，落盘持久化） */
      const rel = path.relative(DRIVE_DIR, target).replace(/\\/g, '/');
      driveDl[rel] = (driveDl[rel] || 0) + 1;
      saveJSON(DRIVE_DL_FILE, driveDl);
      res.writeHead(200, Object.assign({
        'Content-Type': 'application/octet-stream',
        'Content-Length': st.size,
        'Content-Disposition': contentDisposition(path.basename(target)),
        'Cache-Control': 'no-cache',
      }, SEC_HEADERS));
      /* 流式发送：readFileSync 读 30MB 会把事件循环卡住，期间全站请求（含聊天/后台）冻结 */
      const stream = fs.createReadStream(target);
      stream.on('error', () => { try { res.destroy(); } catch (_) {} });
      return stream.pipe(res);
    }

    /* ---- RSS 订阅源：最新 30 篇，标题 + 摘要 + 链接 ---- */
    if (method === 'GET' && pathname === '/rss.xml') {
      const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const base = 'http' + (req.headers['x-forwarded-proto'] === 'https' ? 's' : '') + '://' + (req.headers.host || 'localhost:3210');
      const cats = Object.fromEntries((site.site.categories || []).map((c) => [c.id, c.name]));
      const items = site.posts.slice(0, 30).map((p) => {
        const link = base + '/#/post/' + (p.slug || p.id);
        const desc = esc(p.excerpt || p.title);
        return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(p.id)}</guid>
      <category>${esc(cats[p.category] || p.category)}</category>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${desc}</description>
    </item>`;
      }).join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(site.site.title)}</title>
    <link>${esc(base)}</link>
    <description>${esc(site.site.slogan || '')}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
      res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(xml);
    }

    /* ---- 登录（带限速：连续失败 5 次锁 15 分钟） ---- */
    if (method === 'POST' && pathname === '/api/login') {
      const lockedMin = loginLockedMinutes(ip);
      if (lockedMin !== null) return sendJSON(res, 429, { error: `失败次数过多，请约 ${lockedMin} 分钟后再试` });
      const b = await readBody(req);
      if (!verifyPassword(b.password)) {
        const rf = recordLoginFail(ip);
        noteWatch(ip, 'admin-login-fail');
        return sendJSON(res, 401, { error: rf.locked ? '失败次数过多，已锁定 15 分钟' : `密码错误（还剩 ${rf.left} 次机会）` });
      }
      loginFails.delete(ip);
      const token = crypto.randomBytes(18).toString('hex');
      pruneSessions();
      sessions.set(token, { exp: Date.now() + SESSION_TTL, kind: 'admin' });
      return sendJSON(res, 200, { token });
    }

    /* ---- 网盘解锁：口令换访问 token（带独立限速） ---- */
    if (method === 'POST' && pathname === '/api/drive/unlock') {
      const lockedMin = driveLockedMinutes(ip);
      if (lockedMin !== null) return sendJSON(res, 429, { error: `尝试次数过多，请约 ${lockedMin} 分钟后再试` });
      const b = await readBody(req);
      if (!verifyDriveLock(b.pass)) {
        const rf = recordDriveFail(ip);
        noteWatch(ip, 'drive-unlock-fail');
        return sendJSON(res, 401, { error: rf.locked ? '失败次数过多，已锁定 15 分钟' : `口令错误（还剩 ${rf.left} 次机会）` });
      }
      driveFails.delete(ip);
      const token = crypto.randomBytes(18).toString('hex');
      pruneSessions();
      sessions.set(token, { exp: Date.now() + SESSION_TTL, kind: 'drive' });
      return sendJSON(res, 200, { token });
    }

    /* ---- 受保护：后台 ---- */
    if (pathname.startsWith('/api/admin')) {
      if (!checkToken(req)) return sendJSON(res, 401, { error: '未登录或登录已失效' });

      // 读取并管理
      if (method === 'GET' && pathname === '/api/admin') {
        return sendJSON(res, 200, { site: site.site, posts: site.posts });
      }

      // 站点设置
      if (method === 'PUT' && pathname === '/api/admin/site') {
        const b = await readBody(req);
        if (!b.site) return sendJSON(res, 400, { error: '缺少 site 字段' });
        const s = b.site;
        site.site = Object.assign({}, site.site, {
          title: String(s.title || '').trim() || site.site.title,
          slogan: String(s.slogan || '').trim(),
          about: String(s.about || '').trim(),
          techStack: Array.isArray(s.techStack) ? s.techStack.map((x) => String(x).trim()).filter(Boolean) : site.site.techStack,
          tags: Array.isArray(s.tags) ? s.tags.map((x) => String(x).trim()).filter(Boolean) : site.site.tags,
          contact: {
            email: String(s.contact?.email || '').trim(),
            github: String(s.contact?.github || '').trim(),
            projects: Array.isArray(s.contact?.projects) ? s.contact.projects : site.site.contact.projects,
          },
          friendLinks: Array.isArray(s.friendLinks) ? s.friendLinks : (site.site.friendLinks || []),
          categories: Array.isArray(s.categories) ? s.categories : site.site.categories,
          stats: Array.isArray(s.stats) ? s.stats : site.site.stats,
        });
        saveSite();
        return sendJSON(res, 200, { ok: true });
      }

      // 图片上传（魔数校验：仅 PNG/JPEG/GIF/WebP，扩展名与真实内容强制一致）
      if (method === 'POST' && pathname === '/api/admin/upload') {
        const b = await readBody(req);
        const buf = Buffer.from(String(b.data || ''), 'base64');
        if (!buf.length) return sendJSON(res, 400, { error: '缺少文件内容' });
        if (buf.length > MAX_UPLOAD) return sendJSON(res, 413, { error: '图片过大（上限 4MB）' });
        const realExt = detectImageExt(buf);
        if (!realExt) return sendJSON(res, 415, { error: '仅支持 PNG / JPEG / GIF / WebP 图片' });
        const base = String(b.filename || 'img')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .replace(/\.[^.]*$/, '') // 去掉原始扩展名，统一改用魔数判定出的扩展名
          .replace(/^_+|_+$/g, '')
          .slice(-40) || 'img';
        const fname = Date.now().toString(36) + '_' + base + realExt;
        fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
        return sendJSON(res, 200, { ok: true, url: '/uploads/' + fname });
      }

      // 修改密码
      if (method === 'PUT' && pathname === '/api/admin/password') {
        const b = await readBody(req);
        if (!verifyPassword(b.current)) return sendJSON(res, 401, { error: '当前密码错误' });
        if (!b.next || String(b.next).length < 4) return sendJSON(res, 400, { error: '新密码至少 4 位' });
        // 注意：必须先用局部变量生成新盐，再连同新盐一起算哈希；
        // 若写成对象字面量内引用 auth.salt，会取到旧盐导致「改密后永远登录失败」。
        const newSalt = crypto.randomBytes(16).toString('hex');
        auth = { algo: 'scrypt', salt: newSalt, hash: hashPassword(String(b.next), newSalt) };
        saveAuth();
        return sendJSON(res, 200, { ok: true });
      }

      // 文章：集合
      if (pathname === '/api/admin/posts') {
        if (method === 'POST') {
          const b = await readBody(req);
          let post;
          try { post = sanitizePost(b.post, true); }
          catch (e) { return sendJSON(res, 400, { error: e.message }); }
          site.posts.unshift(post);
          saveSite();
          return sendJSON(res, 200, { ok: true, post });
        }
        if (method === 'GET') {
          return sendJSON(res, 200, { posts: site.posts });
        }
        return sendJSON(res, 405, { error: '方法不允许' });
      }

      // 文章：单条
      const m = pathname.match(/^\/api\/admin\/posts\/([\w-]+)$/);
      if (m) {
        const id = m[1];
        const idx = site.posts.findIndex((p) => p.id === id);
        if (idx < 0) return sendJSON(res, 404, { error: '文章不存在' });
        if (method === 'PUT') {
          const b = await readBody(req);
          let post;
          try { post = sanitizePost(Object.assign({}, site.posts[idx], b.post), false); }
          catch (e) { return sendJSON(res, 400, { error: e.message }); }
          site.posts[idx] = post;
          saveSite();
          return sendJSON(res, 200, { ok: true, post });
        }
        if (method === 'DELETE') {
          site.posts.splice(idx, 1);
          saveSite();
          return sendJSON(res, 200, { ok: true });
        }
        return sendJSON(res, 405, { error: '方法不允许' });
      }

      /* ---- 资源网盘管理：上传（base64，单文件 ≤ 30MB，扩展名白名单） ---- */
      if (method === 'POST' && pathname === '/api/admin/drive/upload') {
        // base64 膨胀 4/3，放宽请求体上限
        const b = await readBody(req, Math.ceil(MAX_DRIVE_UPLOAD * 4 / 3) + 65536);
        const target = driveSafe(b.path);
        if (!target) return sendJSON(res, 400, { error: '非法路径（不要包含 .. 等字符）' });
        const ext = path.extname(target).toLowerCase();
        if (!DRIVE_EXTS.includes(ext)) return sendJSON(res, 415, { error: '不支持的文件类型' });
        const buf = Buffer.from(String(b.data || ''), 'base64');
        if (!buf.length) return sendJSON(res, 400, { error: '缺少文件内容' });
        if (buf.length > MAX_DRIVE_UPLOAD) return sendJSON(res, 413, { error: '文件过大（上限 30MB）' });
        try {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, buf);
        } catch (e) { return sendJSON(res, 500, { error: '写入失败：' + e.message }); }
        return sendJSON(res, 200, { ok: true, path: String(b.path), size: buf.length });
      }

      /* ---- 资源网盘管理：新建目录 ---- */
      if (method === 'POST' && pathname === '/api/admin/drive/mkdir') {
        const b = await readBody(req);
        const target = driveSafe(b.path);
        if (!target) return sendJSON(res, 400, { error: '非法目录名' });
        try { fs.mkdirSync(target, { recursive: true }); } catch (e) { return sendJSON(res, 500, { error: '创建失败：' + e.message }); }
        return sendJSON(res, 200, { ok: true, path: String(b.path) });
      }

      /* ---- 资源网盘管理：删除文件或目录（递归，不可删根） ---- */
      if (method === 'DELETE' && pathname === '/api/admin/drive') {
        const b = await readBody(req);
        const target = driveSafe(b.path);
        if (!target || target === DRIVE_DIR) return sendJSON(res, 400, { error: '非法路径' });
        if (!fs.existsSync(target)) return sendJSON(res, 404, { error: '不存在' });
        fs.rmSync(target, { recursive: true, force: true });
        return sendJSON(res, 200, { ok: true });
      }

      /* ---- 资源网盘管理：修改访问口令（改后吊销全部网盘 token，需重新解锁） ---- */
      if (method === 'POST' && pathname === '/api/admin/drive/lock') {
        const b = await readBody(req);
        const np = String(b.newPass || '');
        if (np.length < 4) return sendJSON(res, 400, { error: '口令至少 4 位' });
        if (np.length > 64) return sendJSON(res, 400, { error: '口令过长（上限 64 位）' });
        const newSalt = crypto.randomBytes(16).toString('hex');
        driveLock = { algo: 'scrypt', salt: newSalt, hash: hashPassword(np, newSalt) };
        saveDriveLock();
        for (const [t, rec] of sessions) if (rec.kind === 'drive') sessions.delete(t);
        return sendJSON(res, 200, { ok: true });
      }

      /* ---- 留言管理：列表 + 删除 ---- */
      if (method === 'GET' && pathname === '/api/admin/comments') {
        const list = comments.slice().sort((a, b2) => b2.t - a.t);
        return sendJSON(res, 200, { comments: list });
      }
      if (method === 'DELETE' && pathname === '/api/admin/comments') {
        const q = new URL(req.url, 'http://localhost').searchParams;
        const id = q.get('id');
        const before = comments.length;
        comments = comments.filter((c) => c.id !== id);
        saveJSON(COMMENT_FILE, comments);
        return sendJSON(res, 200, { ok: true, removed: before - comments.length });
      }

      /* ---- 点赞管理：全量 + 重置 ---- */
      if (method === 'GET' && pathname === '/api/admin/likes') {
        return sendJSON(res, 200, { likes });
      }
      if (method === 'DELETE' && pathname === '/api/admin/likes') {
        const q = new URL(req.url, 'http://localhost').searchParams;
        const id = q.get('id'); // 留空 = 全部清零
        if (id) delete likes[id]; else Object.keys(likes).forEach((k) => delete likes[k]);
        saveJSON(LIKE_FILE, likes);
        return sendJSON(res, 200, { ok: true });
      }

      /* ---- 黑名单管理：列表 + 拉黑 + 解封 ---- */
      if (method === 'GET' && pathname === '/api/admin/banned') {
        return sendJSON(res, 200, { banned });
      }
      if (method === 'POST' && pathname === '/api/admin/banned') {
        const b = await readBody(req);
        const bip = String(b.ip || '').trim();
        if (!/^[\d.:a-fA-F]+$/.test(bip)) return sendJSON(res, 400, { error: 'IP 格式非法' });
        if (!banned.includes(bip)) banned.push(bip);
        saveBanned();
        return sendJSON(res, 200, { ok: true });
      }
      if (method === 'DELETE' && pathname === '/api/admin/banned') {
        const b = await readBody(req);
        banned = banned.filter((x) => x !== String(b.ip || ''));
        saveBanned();
        return sendJSON(res, 200, { ok: true });
      }

      /* ---- 可疑 IP（只读 + 一键拉黑复用上面 banned 接口） ---- */
      if (method === 'GET' && pathname === '/api/admin/watch') {
        return sendJSON(res, 200, { watch: watch.slice().sort((a, b2) => b2.count - a.count) });
      }

      /* ---- 访问统计（只读） ---- */
      if (method === 'GET' && pathname === '/api/admin/visits') {
        return sendJSON(res, 200, {
          total: visits.total,
          unique: visits.uips.length,
          days: visits.days,
          recent: visits.recent.slice(0, 60),
        });
      }

      /* ---- 照片墙管理：列表 + 新增/更新 + 删除 + 排序 ---- */
      if (method === 'GET' && pathname === '/api/admin/gallery') {
        return sendJSON(res, 200, { photos: gallery });
      }
      if (method === 'POST' && pathname === '/api/admin/gallery') {
        const b = await readBody(req);
        const src = String(b.src || '').trim();
        if (!src) return sendJSON(res, 400, { error: '缺少图片地址' });
        if (!/^\/(uploads|img)\//.test(src) && !/^https?:\/\//.test(src)) return sendJSON(res, 400, { error: '图片地址必须以 /uploads/ /img/ 或 http(s) 开头' });
        const item = {
          id: uid(),
          src,
          title: String(b.title || '').trim().slice(0, 40) || '未命名',
          rot: Math.max(-10, Math.min(10, Number(b.rot) || (Math.random() * 8 - 4))),
          tape: ['pink', 'mint', 'amber', 'violet', 'sky'].includes(b.tape) ? b.tape : 'pink',
          cap: String(b.cap || '').trim().slice(0, 60),
        };
        if (b.id) {
          const i = gallery.findIndex((g) => g.id === b.id);
          if (i >= 0) { item.id = b.id; gallery[i] = item; } else gallery.push(item);
        } else gallery.push(item);
        saveGallery();
        return sendJSON(res, 200, { ok: true, photo: item });
      }
      if (method === 'DELETE' && pathname === '/api/admin/gallery') {
        const b = await readBody(req);
        gallery = gallery.filter((g) => g.id !== String(b.id || ''));
        saveGallery();
        return sendJSON(res, 200, { ok: true });
      }

      return sendJSON(res, 404, { error: 'Not Found' });
    }

    res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SEC_HEADERS));
    res.end('Not Found');
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (msg.includes('请求体过大')) {
      /* 超限请求统一回 413（此前连接被直接销毁，客户端只看到 ECONNRESET） */
      if (!res.headersSent) {
        return sendJSON(res, 413, { error: '请求体过大' });
      }
      try { res.destroy(); } catch (_) {}
      return;
    }
    sendJSON(res, 500, { error: msg });
  }
});

/* 全局异常兜底：常驻服务不允许因单次未捕获异常静默死亡 */
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack || err);
  try { fs.appendFileSync(path.join(ROOT, '.server-crash.log'), new Date().toISOString() + ' ' + ((err && err.stack) || err) + String.fromCharCode(10)); } catch (_) {}
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack || reason);
});
/* 退出前冲刷访问日志，节流期间的数据不丢 */
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { try { flushVisits(); } catch (_) {} process.exit(0); });
}
process.on('exit', () => { try { flushVisits(); } catch (_) {} });

/* 端口自适应：首选端口被占用时自动 +1（最多 +20），实际端口写入 .port 供启停脚本/看门狗读取。
 * 注意：Windows 上 server.listen 对被占端口可能出现"成功回调与 EADDRINUSE 同时触发"的假成功，
 * 因此先独立探测端口可用性再正式监听，error 事件仅作竞态兜底。 */
function probePort(port, timeoutMs) {
  return new Promise((resolve) => {
    const s = new http.Server();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port);
    if (timeoutMs) setTimeout(() => resolve(false), timeoutMs).unref && null;
  });
}
async function startServer() {
  let port = PORT;
  for (let i = 0; i <= 20; i++) {
    if (await probePort(port)) break;
    console.warn(`[port] ${port} 已被占用，自动改用 ${port + 1}`);
    port++;
    if (i === 20) {
      console.error(`[port] ${PORT}~${port} 全部被占用，放弃启动`);
      process.exit(1);
    }
  }
  server.once('error', (err) => {
    console.error('[server error]', err && err.stack || err);
    process.exit(1);
  });
  server.listen(port, () => {
    try { fs.writeFileSync(path.join(ROOT, '.port'), String(port)); } catch (_) {}
    console.log(`夜神月博客已启动: http://localhost:${port}`);
    console.log(`后台管理: http://localhost:${port}/admin  (默认密码 yeshenyue)`);
    if (port !== PORT) console.log(`[port] 注意：首选端口 ${PORT} 被占用，已自动改用 ${port}`);
  });
}
startServer();
