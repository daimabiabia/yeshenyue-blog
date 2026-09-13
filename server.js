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
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 6 * 1024 * 1024; // 请求体上限 6MB
const MAX_UPLOAD = 4 * 1024 * 1024; // 图片上限 4MB

[DATA_DIR, PUBLIC_DIR, UPLOAD_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/* ============ 工具 ============ */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, SEC_HEADERS));
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (c) => {
      data += c;
      if (data.length > MAX_BODY) { tooBig = true; req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('请求体过大'));
      try { resolve(data ? JSON.parse(data) : {}); }
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
const sessions = new Map(); // token -> 过期时间戳（内存会话，重启后需重新登录）

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
  const exp = sessions.get(m[1]);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(m[1]); return false; } // 过期即吊销
  return true;
}
function pruneSessions() {
  const now = Date.now();
  for (const [t, exp] of sessions) if (now > exp) sessions.delete(t);
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
  if (rec.count >= LOGIN_MAX_FAILS) { rec.lockedUntil = Date.now() + LOGIN_LOCK_MS; rec.count = 0; }
  loginFails.set(ip, rec);
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
        { num: '20', label: '学习笔记' },
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

  try {
    /* ---- 静态资源 ---- */
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }
    if (method === 'GET' && (pathname === '/admin' || pathname === '/admin.html')) {
      return sendFile(res, path.join(PUBLIC_DIR, 'admin.html'));
    }
    if (method === 'GET' && /^\/(css|js|uploads)\//.test(pathname)) {
      return sendFile(res, safeJoin(PUBLIC_DIR, pathname));
    }

    /* ---- 公开 API ---- */
    if (method === 'GET' && pathname === '/api/site') {
      return sendJSON(res, 200, site);
    }

    /* ---- 登录（带限速：连续失败 5 次锁 15 分钟） ---- */
    if (method === 'POST' && pathname === '/api/login') {
      const ip = req.socket.remoteAddress || 'unknown';
      const lockedMin = loginLockedMinutes(ip);
      if (lockedMin !== null) return sendJSON(res, 429, { error: `失败次数过多，请约 ${lockedMin} 分钟后再试` });
      const b = await readBody(req);
      if (!verifyPassword(b.password)) {
        recordLoginFail(ip);
        return sendJSON(res, 401, { error: '密码错误' });
      }
      loginFails.delete(ip);
      const token = crypto.randomBytes(18).toString('hex');
      pruneSessions();
      sessions.set(token, Date.now() + SESSION_TTL);
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
