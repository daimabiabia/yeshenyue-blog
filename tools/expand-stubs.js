/* 扩写 pA1 / pSHDW 两篇短文 */
const fs = require('fs');
const DATA = 'data/site.json';
const site = JSON.parse(fs.readFileSync(DATA, 'utf8'));
fs.copyFileSync(DATA, 'data/site.bak-expand-' + Date.now());

const add1 = `

## 五、我踩过的三个坑

**坑一：RTSP 地址里的密码有特殊字符。** 密码带 @ 和 # 的，直接拼 URL 必挂。@ 要写成 %40，# 写成 %23——URL 编码一遍再拼。我第一次配海康摄像头折腾了半小时，就是密码里那个 @ 在作妖。

**坑二：摄像头开了「防盗墙」。** 部分品牌摄像头默认关闭 ONVIF/RTSP，或者要手动在 App 里「开启局域网直连」。找不到 rtsp 地址的，去品牌官方文档查流地址格式（海康、大华、萤石各有各的写法），别瞎猜。

**坑三：带宽被主码流吃光。** 门口摄像头 2K 主码流 4Mbps，家里上行就 30Mbps，三台摄像头一开网页就卡成 PPT。子码流 512kbps 干干净净——**看实时用子码流，主码流只喂 NVR**，这条规矩必须立住。

## 六、外网观看的正确姿势

家里看爽了，下一步就是外面看。顺序别搞反：

1. **先组 VPN 回家**（WireGuard 一把梭），手机在外面等于在家里，零暴露面；
2. 图省事用内网穿透（frp / cloudflare tunnel），**必须加认证**，go2rtc 自带 basic auth 记得开；
3. 路由器端口映射直裸公网？除非你想让自己的门口摄像头出现在某个搜索引擎里。

监控这种东西，泄漏一次就不是技术问题了。`;

const add2 = `

## 三、什么时候不需要 Shadow

Shadow 不是免费午餐，两种情况别硬上：

- **设备几乎永不断线**（网线直连的工位机）：MQTT 直连直报就够，多一层 Shadow 反而多一层版本一致性要维护；
- **高频遥测数据**（每秒几十次的振动采样）：Shadow 只适合「最新状态」这类低频小数据，高频流请走 Kinesis / 时序数据库。Shadow 文档写死上限 8KB，塞传感器波形是自讨苦吃。

## 四、实战里的两条纪律

**纪律一：desired 只放「意图」，别放「过程」。** 见过有人在 desired 里塞十几层配置把设备搞蒙的。desired 就写目标状态（开关、阈值、模式），怎么达成是设备自己的事。状态机越简单，弱网下的冲突越少。

**纪律二：设备回写 reported 必须带版本。** 弱网下消息乱序到达，不带版本号的回写会把新状态覆盖回旧状态——这是真实发生过的事故：设备重启后把一周前的旧配置回写了上去，现场查了一下午。Shadow 自带 version 字段，SDK 默认处理，但自己裸写 MQTT 的就要长心了。

## 五、离线指令的下发闭环

弱网场景最香的能力是「设备上线即执行」，闭环要自己跑通：

1. App 对 desired 写入 lock: true（设备离线，Shadow 照收）；
2. 设备重新上线，订阅 delta 主题，立即收到 desired 与 reported 的差异；
3. 设备执行动作，回写 reported；
4. delta 变空，App 轮询 GET 或订阅 update 事件，界面确认。

测试方法很朴素：拔设备网线，App 下指令，插回网线掐表——从上线到执行，正常在 2 秒内。超过 10 秒的，九成是设备端 keep-alive 设太长，把 MQTT keepAlive 从默认 300 秒砍到 30 秒，重连立刻勤快。`;

site.posts.find((p) => p.id === 'pA1').content += add1;
site.posts.find((p) => p.id === 'pSHDW').content += add2;
fs.writeFileSync(DATA, JSON.stringify(site, null, 2));
['pA1', 'pSHDW'].forEach((id) => {
  const p = site.posts.find((x) => x.id === id);
  console.log(id, '扩写后:', p.content.replace(/\s/g, '').length, '字');
});
