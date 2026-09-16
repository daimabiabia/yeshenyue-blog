// 幂等注入新学习笔记到 site.json
// idempotent: 按 id 去重；写前备份；断言唯一
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'data', 'site.json');
const BATCH = path.join(__dirname, 'posts_batch');

const META = [
  { file: 'e-log.md',          id: 'e-log',      title: '嵌入式日志系统设计：分级、落盘与远程拉取', category: 'embedded', level: 2, slug: 'embedded-logging-system', tags: ['嵌入式', '日志', '排障'], excerpt: '串口 print 不是日志系统。分级、环形落盘、远程拉取、重启原因——四件套让远程排障有据可查。' },
  { file: 'p-rtos-mutex.md',   id: 'p-rtos-mx',  title: 'FreeRTOS 优先级反转：一颗互斥量引发的「灵异卡顿」', category: 'embedded', level: 3, slug: 'freertos-priority-inversion', tags: ['FreeRTOS', 'RTOS', '互斥量'], excerpt: '低优先级任务拿着锁不放，高优先级干等——复现、破案到修复，理解优先级继承为什么必须开。' },
  { file: 'pi-burnin.md',      id: 'pi-burnin',  title: '量产前的烧机测试：老化工装与自动化判定', category: 'pit', level: 2, slug: 'burn-in-testing', tags: ['踩坑记录', '量产', '老化测试'], excerpt: '一台正常 ≠ 一万台正常。48 小时老化测试怎么设计、判定指标怎么定、工装怎么做，把「三天死机」拦在出货前。' },
  { file: 'c-grafana-alert.md',id: 'c-alert',    title: 'Grafana 告警体系：从曲线好看 到 值班手机响', category: 'cloudedge', level: 2, slug: 'grafana-alerting-system', tags: ['Grafana', '监控', '告警'], excerpt: '看板只能看见问题，告警才能解决问题。防风暴、分级路由、可执行内容与故障演习，最后一公里走通。' },
  { file: 'n-ipv6.md',         id: 'n-ipv6',     title: 'IPv6 落地物联网：地址规划、直连与安全边界', category: 'net', level: 3, slug: 'ipv6-for-iot', tags: ['IPv6', '网络工程', '安全'], excerpt: '每设备一个公网地址 ≠ 暴露。子网规划、固定后缀、防火墙下放到设备组，IPv6 的正确打开方式。' },
  { file: 'hw-thermal.md',     id: 'hw-thermal', title: '整机热设计速查：从芯片到外壳的温度账', category: 'hardware', level: 2, slug: 'thermal-design-basics', tags: ['硬件随笔', '热设计', '散热'], excerpt: 'Tj = Ta + P×θ 一条公式走完从结点到空气的温度链路，铺铜过孔阵、电池隔热、密封壳减半，热账算清楚。' },
  { file: 'av-frigate.md',     id: 'av-frigate', title: 'Frigate 视频分析实战：本地 NVR + AI 事件检测', category: 'av', level: 2, slug: 'frigate-local-nvr', tags: ['视频影音', 'Frigate', 'NVR'], excerpt: '有人逗留才告警、猫路过不理。Frigate 本地 AI NVR 的双码流架构、误报三板斧与 HA 联动。' },
  { file: 's-z2m.md',          id: 's-z2m',      title: 'Zigbee2MQTT 从零到稳定：配对、命名与运维', category: 'smart', level: 2, slug: 'zigbee2mqtt-stable-guide', tags: ['智能家居', 'Zigbee', 'Z2M'], excerpt: '一个 USB 棒接管全屋 Zigbee：协调器选型、信道避让、命名规范、mesh 健康检查与故障手册。' },
  { file: 'n-zerotrust.md',    id: 'n-zerotrust',title: 'IoT 设备零信任入门：设备身份与最小权限', category: 'net', level: 3, slug: 'iot-zero-trust', tags: ['网络安全', '零信任', '设备身份'], excerpt: '内网可信假设已过时。设备身份三级实现、最小权限三层配额、首配对信任建立与五个攻破假设自检。' },
  { file: 's-matter.md',       id: 's-matter',   title: 'Matter 之路：一颗灯泡同时接入 HA 与 Apple Home', category: 'smart', level: 2, slug: 'matter-multi-admin', tags: ['智能家居', 'Matter', 'Thread'], excerpt: '多重管理员是 Matter 的杀手锏：一颗灯 Siri 和 HA 都控得了。接入实录、边界路由器分裂等五大坑。' },
  { file: 'e-sampling.md',     id: 'e-sampling', title: '传感器采样率与上报节奏设计：更快的数据不一定是更好的数据', category: 'embedded', level: 2, slug: 'sampling-and-reporting-design', tags: ['嵌入式', '采样', '低功耗'], excerpt: '采样、上报、存储三层节奏分离：变化上报 + 心跳兜底 + 事件触发高速窗口，用三本账定参数。' },
];

// backup
const bak = SITE + '.bak-' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
if (!fs.existsSync(bak)) fs.copyFileSync(SITE, bak);

const site = JSON.parse(fs.readFileSync(SITE, 'utf8'));
const existIds = new Set(site.posts.map((p) => p.id));
const existSlugs = new Set(site.posts.map((p) => p.slug));
const today = '2026-09-16';
let added = 0, skipped = 0;

for (const m of META) {
  if (existIds.has(m.id)) { skipped++; continue; }
  if (existSlugs.has(m.slug)) { skipped++; continue; }
  const content = fs.readFileSync(path.join(BATCH, m.file), 'utf8').trim();
  const excerpt = m.excerpt;
  site.posts.unshift({
    id: m.id,
    title: m.title,
    category: m.category,
    date: today,
    featured: false,
    slug: m.slug,
    tags: m.tags,
    level: m.level,
    excerpt,
    content,
  });
  added++;
}

// 断言唯一
const ids = site.posts.map((p) => p.id);
if (new Set(ids).size !== ids.length) { console.error('FATAL: duplicate ids'); process.exit(1); }
const slugs = site.posts.map((p) => p.slug);
if (new Set(slugs).size !== slugs.length) { console.error('FATAL: duplicate slugs'); process.exit(1); }

fs.writeFileSync(SITE, JSON.stringify(site, null, 2));
console.log(`OK added=${added} skipped=${skipped} total=${site.posts.length} backup=${bak}`);
