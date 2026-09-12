/**
 * 夜神月技术博客 —— 零依赖 Node 服务器
 * 内容存于 data/site.json，后台管理改动即时落盘。
 * 启动：node server.js  (可选 PORT=8080 node server.js)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const PORT = Number(process.env.PORT) || 3000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/* ---------- 认证 ---------- */
function loadAuth() {
    if (!fs.existsSync(AUTH_FILE)) {
      const salt = crypto.randomBytes(8).toString('hex');
      const pass = process.env.ADMIN_PASS || 'yeshenyue'; // 可在首次启动前用 ADMIN_PASS 环境变量设定
      const rec = { salt, hash: sha256(pass + salt) };
      fs.writeFileSync(AUTH_FILE, JSON.stringify(rec, null, 2));
      return rec;
    }
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
}
let auth = loadAuth();
const sessions = new Set(); // 内存会话令牌（重启后需重新登录）
const saveAuth = () => fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));

function verifyPassword(pass) {
  return sha256(String(pass) + auth.salt) === auth.hash;
}
function checkToken(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  return m && sessions.has(m[1]);
}

/* ---------- 站点数据（含种子） ---------- */
function defaultSite() {
  return {
    site: {
      title: '夜神月 · 物联网技术博客',
      slogan: '在比特与电流之间，构建可靠而优雅的万物互联',
      about: '资深物联网工程师，8 年嵌入式开发、边缘计算与云平台对接经验。长期奋战在 ESP32、STM32、MQTT、LoRa 与 AWS IoT 一线，擅长把不稳定的现场网络收敛成可观测、可运维的系统。信奉一句话：部署即稳定，上线即可观测。',
      techStack: ['ESP32', 'STM32', 'MQTT', 'LoRa', 'AWS IoT', '边缘计算', 'RTOS', '网关'],
      stats: [
        { num: '8', label: '年经验' },
        { num: '200+', label: '部署节点' },
        { num: '18μA', label: '最低功耗' }
      ],
      categories: [
        { id: 'embedded', name: '嵌入式实战', icon: 'chip', desc: 'ESP32 / STM32 外设驱动、低功耗与 RTOS 落地' },
        { id: 'protocol', name: '协议解析', icon: 'wave', desc: 'MQTT / LoRaWAN / 私有二进制协议逆向与调优' },
        { id: 'cloudedge', name: '云边协同', icon: 'cloud', desc: 'AWS IoT / 边缘网关 / 数据上云与下发' },
        { id: 'pit', name: '踩坑记录', icon: 'bug', desc: '现场翻车与排障实录，少走弯路' },
        { id: 'hardware', name: '硬件随笔', icon: 'solder', desc: '选型、布线、EMC 与量产那些事' }
      ],
      tags: ['ESP32', 'STM32', 'MQTT', 'LoRa', 'LoRaWAN', 'AWS IoT', '边缘计算', '低功耗', 'RTOS', '网关', 'OTA', '传感器', 'EMC', 'MQTT-SN', 'FreeRTOS', '数据上云'],
      contact: {
        email: 'hi@yeshenyue.dev',
        github: 'https://github.com/yeshenyue',
        projects: [
          { name: 'esp-mqtt-framework', url: 'https://github.com/yeshenyue/esp-mqtt-framework', desc: '轻量 ESP32 MQTT 设备框架' },
          { name: 'lora-gateway-kit', url: 'https://github.com/yeshenyue/lora-gateway-kit', desc: 'LoRaWAN 边缘网关套件' },
          { name: 'iot-shadow-sync', url: 'https://github.com/yeshenyue/iot-shadow-sync', desc: '弱网下设备影子状态同步库' }
        ]
      }
    },
    posts: [
      {
        id: 'p1', title: 'ESP32 深度睡眠下的 MQTT 长连接保活', slug: 'esp32-deepsleep-mqtt',
        category: 'embedded', tags: ['ESP32', 'MQTT', '低功耗'], featured: true,
        date: '2026-08-20',
        excerpt: '把平均电流压到 18μA 的同时，还能在唤醒后秒级重连并补齐离线消息。',
        content: '# 背景\n\nESP32 在电池场景下最怕「为了保活而睡不深」。本文给出一套定时器唤醒 + MQTT 会话保持的组合拳。\n\n## 关键参数\n\n- 深睡电流：**18μA**\n- 唤醒到重连：**< 800ms**\n- 离线消息：用 `Clean Session=0` + 持久订阅补齐\n\n## 代码片段\n\n```c\nesp_sleep_enable_timer_wakeup(60 * 1000 * 1000);\nesp_deep_sleep_start();\n```\n\n## 结论\n\n会话级保活比「心跳兜底」更省电，也更稳。'
      },
      {
        id: 'p2', title: 'LoRaWAN 组网踩坑：为什么你的节点总掉线', slug: 'lorawan-drop',
        category: 'protocol', tags: ['LoRa', 'LoRaWAN', '网关'], featured: true,
        date: '2026-07-12',
        excerpt: 'ADR 速率塌方、占空比超限、信道掩码错配——三个最常见的掉线真因。',
        content: '# 现象\n\n节点前三天好好的，之后批量掉线。\n\n## 真因三连\n\n1. **ADR 速率塌方**：NR 上行过密触发速率降级\n2. **占空比超限**：Class A 被网关节流\n3. **信道掩码错配**：与 NS 默认不一致\n\n## 排障清单\n\n- 抓上行帧看 `FPort` 与 `ADR` 位\n- 核对 `ChannelMask`\n- 限制上行周期到 1%/小时\n\n> 掉线不是信号差，八成是配置错。'
      },
      {
        id: 'p3', title: 'AWS IoT 弱网下的设备影子状态一致性', slug: 'aws-iot-shadow',
        category: 'cloudedge', tags: ['AWS IoT', '边缘计算', '数据上云'], featured: true,
        date: '2026-06-30',
        excerpt: '断网重连后，如何避免「云端命令」被旧状态覆盖这一经典竞态。',
        content: '# 问题\n\n设备离线期间云端下了控制指令，重连后本地状态把指令覆盖掉了。\n\n## 解法\n\n- 以 **shadow `desired`** 为准，本地只更新 `reported`\n- 用 `clientToken` 做请求/响应配对\n- 重连先拉 `GetThingShadow` 再决定动作\n\n## 时序\n\n```\n离线 -> 云端写 desired\n重连 -> 取 shadow -> 比对 -> 执行 desired -> 回写 reported\n```'
      },
      {
        id: 'p4', title: 'FreeRTOS 任务栈溢出的一次离奇死机', slug: 'freertos-stack',
        category: 'pit', tags: ['RTOS', 'FreeRTOS', 'STM32'], featured: false,
        date: '2026-05-18',
        excerpt: '看门狗随机复位，最后发现是 printf 把栈吃光了。',
        content: '# 症状\n\n设备在跑某条日志后随机硬复位。\n\n## 根因\n\n`printf` 浮点格式化在中断上下文里吃掉了 1.2KB 栈，超出分配。\n\n## 修复\n\n- 给日志任务单独开大栈\n- 中断里只置标志，延后到任务里打印\n\n> 栈溢出不会立刻死，但一定会死。'
      },
      {
        id: 'p5', title: 'ESP32 + MQTT-SN 在 CoAP 网关前的轻量接入', slug: 'mqtt-sn-esp32',
        category: 'embedded', tags: ['ESP32', 'MQTT-SN', '网关'], featured: false,
        date: '2026-04-09',
        excerpt: '没有 TCP 栈的传感节点，如何用 MQTT-SN 直接对接网关。',
        content: '# 为什么 MQTT-SN\n\n极小的传感节点跑不起 TCP，MQTT-SN 跑在 UDP 上，报文更省。\n\n## 对接要点\n\n- 网关做 `TopicId` 注册缓存\n- `Will` 消息走网关代理\n- 心跳间隔按电池容量倒推'
      },
      {
        id: 'p6', title: '硬件随笔：量产前必做的 EMC 三件事', slug: 'emc-prep',
        category: 'hardware', tags: ['EMC', '传感器', 'STM32'], featured: false,
        date: '2026-03-02',
        excerpt: '电源滤波、地平面、接口防护——量产前不改，售后必爆。',
        content: '# 三件事\n\n1. **电源**：π 型滤波 + 磁珠\n2. **地**：模拟/数字单点接，别画成网格\n3. **接口**：TVS 管贴端口，别贴芯片\n\n> EMC 是设计出来的，不是测出来的。'
      }
    ]
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
let site = loadSite();
const saveSite = () => fs.writeFileSync(SITE_FILE, JSON.stringify(site, null, 2));

/* ---------- 工具 ---------- */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}
function safeJoin(base, p) {
  const t = path.normalize(path.join(base, p)).replace(/^(\.\.[/\\])+/, '');
  return t.startsWith(base) ? t : base;
}
function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method.toUpperCase();

  try {
    /* 静态页 */
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
    if (method === 'GET' && (pathname === '/admin' || pathname === '/admin.html')) return sendFile(res, path.join(PUBLIC_DIR, 'admin.html'));
    if (method === 'GET' && (pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/uploads/'))) {
      return sendFile(res, safeJoin(PUBLIC_DIR, pathname));
    }

    /* 公开 API */
    if (method === 'GET' && pathname === '/api/site') return sendJSON(res, 200, site);
    if (method === 'GET' && pathname === '/api/posts') return sendJSON(res, 200, { posts: site.posts });

    /* 登录 */
    if (method === 'POST' && pathname === '/api/login') {
      const b = await readBody(req);
      if (!verifyPassword(b.password)) return sendJSON(res, 401, { error: '密码错误' });
      const token = crypto.randomBytes(18).toString('hex');
      sessions.add(token);
      return sendJSON(res, 200, { token });
    }

    /* 受保护：后台 */
    if (pathname.startsWith('/api/admin')) {
      if (!checkToken(req)) return sendJSON(res, 401, { error: '未登录' });
      if (method === 'GET' && pathname === '/api/admin') {
        return sendJSON(res, 200, { site, posts: site.posts });
      }
      if (method === 'PUT' && pathname === '/api/admin/site') {
        const b = await readBody(req);
        if (b.site) { site.site = Object.assign({}, site.site, b.site); saveSite(); }
        return sendJSON(res, 200, { ok: true });
      }
      if (method === 'POST' && pathname === '/api/admin/upload') {
        const b = await readBody(req);
        const name = (b.filename || 'upload.png').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
        const buf = Buffer.from(b.data || '', 'base64');
        if (buf.length > 4e6) return sendJSON(res, 413, { error: '图片过大（上限 4MB）' });
        const fname = Date.now().toString(36) + '_' + name;
        fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
        return sendJSON(res, 200, { ok: true, url: '/uploads/' + fname });
      }
      if (method === 'PUT' && pathname === '/api/admin/password') {
        const b = await readBody(req);
        if (!verifyPassword(b.current)) return sendJSON(res, 401, { error: '当前密码错误' });
        const salt = crypto.randomBytes(8).toString('hex');
        auth = { salt, hash: sha256(b.next + salt) };
        saveAuth();
        return sendJSON(res, 200, { ok: true });
      }
      if (method === 'POST' && pathname === '/api/admin/posts') {
        const b = await readBody(req);
        const post = Object.assign({ id: uid(), date: new Date().toISOString().slice(0, 10), featured: false, tags: [], category: site.site.categories[0]?.id || '' }, b.post || {});
        site.posts.unshift(post);
        saveSite();
        return sendJSON(res, 200, { ok: true, post });
      }
      const m = pathname.match(/^\/api\/admin\/posts\/([\w-]+)$/);
      if (m) {
        const id = m[1];
        const idx = site.posts.findIndex((p) => p.id === id);
        if (idx < 0) return sendJSON(res, 404, { error: '文章不存在' });
        if (method === 'PUT') {
          const b = await readBody(req);
          site.posts[idx] = Object.assign({}, site.posts[idx], b.post || {});
          saveSite();
          return sendJSON(res, 200, { ok: true, post: site.posts[idx] });
        }
        if (method === 'DELETE') {
          site.posts.splice(idx, 1);
          saveSite();
          return sendJSON(res, 200, { ok: true });
        }
      }
      return sendJSON(res, 404, { error: 'Not Found' });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (e) {
    sendJSON(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`夜神月博客已启动: http://localhost:${PORT}`);
  console.log(`后台管理: http://localhost:${PORT}/admin  (默认密码 yeshenyue)`);
});
