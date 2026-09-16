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
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 6 * 1024 * 1024; // 请求体上限 6MB
const MAX_UPLOAD = 4 * 1024 * 1024; // 图片上限 4MB
const MAX_DRIVE_UPLOAD = 30 * 1024 * 1024; // 网盘单文件上限 30MB

[DATA_DIR, PUBLIC_DIR, UPLOAD_DIR, DRIVE_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/* ============ 工具 ============ */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

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
function noteVisit(ip, pathname) {
  if (/\.(css|js|png|jpg|jpeg|webp|gif|ico|svg|woff2?)$/i.test(pathname)) return; // 静态资源不计
  visits.total += 1;
  const day = new Date().toISOString().slice(0, 10);
  visits.days[day] = (visits.days[day] || 0) + 1;
  if (!visits.uips.includes(ip)) { visits.uips.push(ip); if (visits.uips.length > 5000) visits.uips = visits.uips.slice(-5000); }
  visits.recent.unshift({ ip, path: pathname, t: Date.now() });
  if (visits.recent.length > 300) visits.recent.length = 300;
  saveVisits();
}
let comments = loadJSON(COMMENT_FILE, []);
const lastCommentAt = new Map(); /* ip -> 上次留言时间戳，留言冷却用 */

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, SEC_HEADERS));
  res.end(body);
}

function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    const limit = cap || MAX_BODY;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { tooBig = true; req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('请求体过大'));
      try { resolve(Buffer.concat(chunks).toString('utf8') ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
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
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SEC_HEADERS));
      res.end('Not Found');
      return;
    }
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }, SEC_HEADERS));
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
    if (it.name.startsWith('.')) continue; // 隐藏文件不入盘
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
let auth = loadAuth();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 会话 24 小时过期
const sessions = new Map(); // token -> { exp, kind: 'admin'|'drive' }（内存会话，重启后需重新登录/解锁）

/* 网盘访问口令（独立于后台密码）：data/drive-lock.json，无文件时用默认口令创建 */
const DRIVE_LOCK_FILE = path.join(DATA_DIR, 'drive-lock.json');
function loadDriveLock() {
  if (!fs.existsSync(DRIVE_LOCK_FILE)) {
    const salt = crypto.randomBytes(8).toString('hex');
    const pass = process.env.DRIVE_PASS || 'iot-2026'; // 可用环境变量设定初始口令
    const rec = { salt, hash: sha256(pass + salt) };
    fs.writeFileSync(DRIVE_LOCK_FILE, JSON.stringify(rec, null, 2));
    return rec;
  }
  return JSON.parse(fs.readFileSync(DRIVE_LOCK_FILE, 'utf8'));
}
let driveLock = loadDriveLock();
function saveDriveLock() { fs.writeFileSync(DRIVE_LOCK_FILE, JSON.stringify(driveLock, null, 2)); }

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
    const salt = crypto.randomBytes(8).toString('hex');
    const pass = process.env.ADMIN_PASS || 'yeshenyue'; // 首次启动可用 ADMIN_PASS 环境变量设定
    const rec = { salt, hash: sha256(pass + salt) };
    fs.writeFileSync(AUTH_FILE, JSON.stringify(rec, null, 2));
    return rec;
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
}
function saveAuth() { fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2)); }
function verifyPassword(pass) { return sha256(String(pass) + auth.salt) === auth.hash; }
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
  };
  if (!post.title) throw new Error('标题不能为空');
  return post;
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
  const ip = req.socket.remoteAddress || 'unknown';

  try {
    /* ---- IP 黑名单：命中直接 429（静态资源也挡，完整隔离） ---- */
    if (isBanned(ip)) {
      res.writeHead(429, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SEC_HEADERS));
      return res.end('Your IP has been blocked.');
    }
    /* ---- 访问日志（页面与 API） ---- */
    noteVisit(ip, pathname);

    /* ---- 静态资源 ---- */
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }
    if (method === 'GET' && (pathname === '/admin' || pathname === '/admin.html')) {
      return sendFile(res, path.join(PUBLIC_DIR, 'admin.html'));
    }
    if (method === 'GET' && /^\/(css|js|uploads|img)\//.test(pathname)) {
      return sendFile(res, safeJoin(PUBLIC_DIR, pathname));
    }

    /* ---- 公开 API ---- */
    if (method === 'GET' && pathname === '/api/site') {
      return sendJSON(res, 200, site);
    }

    /* ---- 照片墙（公开只读） ---- */
    if (method === 'GET' && pathname === '/api/gallery') {
      return sendJSON(res, 200, { photos: gallery });
    }

    /* ---- 访客互动：点赞（跨访客真实计数，持久化 likes.json） ---- */
    if (method === 'GET' && pathname === '/api/likes') {
      return sendJSON(res, 200, { likes });
    }
    if (method === 'POST' && pathname === '/api/like') {
      const b = await readBody(req);
      const id = String((b && b.id) || '');
      if (!site.posts.some((p) => p.id === id)) return sendJSON(res, 404, { error: '文章不存在' });
      likes[id] = (likes[id] || 0) + 1;
      saveJSON(LIKE_FILE, likes);
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
      const ip = req.socket.remoteAddress || '';
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
      const item = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), post: postId, name, text, t: now };
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

    /* ---- 资源网盘：文件树（需网盘口令解锁，admin token 放行） ---- */
    if (method === 'GET' && pathname === '/api/drive') {
      if (!checkDriveToken(req, url)) return sendJSON(res, 401, { error: '网盘已加密，请先解锁' });
      const files = walkDrive(DRIVE_DIR, '');
      const fileCount = files.filter((f) => f.type === 'file').length;
      const dirCount = files.filter((f) => f.type === 'dir').length;
      const totalSize = files.reduce((s, f) => s + (f.type === 'file' ? f.size : 0), 0);
      return sendJSON(res, 200, { files, fileCount, dirCount, totalSize, downloads: driveDl });
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
      return res.end(fs.readFileSync(target));
    }

    /* ---- RSS 订阅源：最新 30 篇，标题 + 摘要 + 链接 ---- */
    if (method === 'GET' && pathname === '/rss.xml') {
      const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const base = 'http' + (req.headers['x-forwarded-proto'] === 'https' ? 's' : '') + '://' + (req.headers.host || 'localhost:3000');
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
      const ip = req.socket.remoteAddress || 'unknown';
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
      const ip = req.socket.remoteAddress || 'unknown';
      const lockedMin = driveLockedMinutes(ip);
      if (lockedMin !== null) return sendJSON(res, 429, { error: `尝试次数过多，请约 ${lockedMin} 分钟后再试` });
      const b = await readBody(req);
      if (sha256(String(b.pass || '') + driveLock.salt) !== driveLock.hash) {
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
        const newSalt = crypto.randomBytes(8).toString('hex');
        auth = { salt: newSalt, hash: sha256(String(b.next) + newSalt) };
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
        driveLock = { salt: crypto.randomBytes(8).toString('hex'), hash: '' };
        driveLock.hash = sha256(np + driveLock.salt);
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
    sendJSON(res, 500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, () => {
  console.log(`夜神月博客已启动: http://localhost:${PORT}`);
  console.log(`后台管理: http://localhost:${PORT}/admin  (默认密码 yeshenyue)`);
});
