# Node-RED 零代码流编排：IoT 逻辑的"乐高"

> 拖拽节点连线条就能完成"温度超30开空调、发通知、写数据库"这类胶水逻辑。学 IoT 的第一件生产力神器。

## 一、它是什么、什么时候用

Node-RED 是流程编排引擎：每个节点做一件小事（读MQTT、判断、HTTP请求、写库），连线定义数据流向。

**适合**：规则联动、协议转换、通知告警、原型验证。
**不适合**：重业务逻辑、高性能计算——那些写正经代码去。

## 二、安装与上手

```bash
# 本机 Node.js ≥ 18
npm install -g --unsafe-perm node-red
node-red
# 打开 http://localhost:1880
```

右上角 ─ 菜单 ─ Manage palette 可装几千个社区节点（mqtt、modbus、influxdb、telegram……）。

## 三、第一个流：温度超限报警

```
[mqtt in: dev/+/telemetry] → [json 转换] → [switch: temp>30?] ─ true → [function: 组装告警msg] → [telegram/http 通知]
                                                            └ false → [debug]
```

核心 function 节点代码：

```javascript
// switch 节点也可以，这里展示 function 写法（可读性更高）
const m = msg.payload;
if (m.temp > 30) {
  msg.payload = `⚠️ ${m.device} 温度 ${m.temp}℃，超限！`;
  msg.topic = "alarm/temp";
  return msg;      // 返回则继续向下游传递
}
return null;       // 返回 null 则截断
```

点 **Deploy** 立即生效——改逻辑不用重启任何东西。

## 四、必会节点速查

| 节点 | 用途 | 关键点 |
|---|---|---|
| inject | 手动/定时触发 | 定时器流（每5分钟）从这里开始 |
| mqtt in/out | MQTT 收发 | 一个 in 节点一个 topic |
| function | 写 JS 处理 | msg 是全局信使 |
| switch | 按条件分流 | 相当于路由器 |
| change | 改字段/设值 | 简单转换别用 function，用这个 |
| http request | 调 API | 返回状态码要自己判 |
| delay | 限速/延迟 | rate limit 防通知风暴 |
| join | 聚合多条消息 | "等三个传感器都到了再判断" |

## 五、全局上下文：跨流共享状态

```javascript
// 写入
global.set("lastTemp_" + msg.payload.device, msg.payload.temp);
// 读取（另一个流的节点里）
const t = global.get("lastTemp_esp32-01");
```

默认内存存储，重启丢；设置里配 `contextStorage: { memory: { module: "localfilesystem" } }` 可持久化。

## 六、实战流模板（抄作业）

### 1. 设备离线监控

```
[mqtt in: dev/+/heartbeat] → [change: 记录时间戳到 global]
[inject: 每60秒] → [function: 遍历设备，now-last > 120s → 离线列表] → [通知]
```

### 2. 日夜模式联动

```
[cron: 06:30] → [change: global.set('mode','day')] → [mqtt out: home/mode]
[cron: 23:00] → ... 'night'
[home/+/state] → [function: 夜间模式屏蔽高功率设备指令]
```

### 3. 协议转换（Modbus RTU → MQTT）

```
[modbus-read (串口轮询)] → [function: 寄存器值换算] → [mqtt out]
```

## 七、工程化建议

1. **子流程（Subflow）**：常用逻辑封装成子流程，像函数一样复用。
2. **Projects**：Node-RED 内置 git 集成，flows.json 一定要进版本库。
3. **环境变量**：`process.env.MQTT_HOST`，别把服务器地址写死在节点里。
4. **命名**：连线会乱成蜘蛛网——每个节点都写有意义的名字，按行对齐布局。
5. **备份**：`~/.node-red/` 整个目录就是一切（flows + 凭证 + palette）。

## 八、坑速查

- function 节点里用了 `return` 外的异步 → 用 `node.send(msg)` 手动发送。
- MQTT in 收不到 → 检查 broker 地址、QoS、以及 EMQX 那边 ACL 是否放行。
- 流越堆越多卡顿 → 每个 Deploy 是全量生效，大改动拆多次 Deploy 便于回滚；太重就拆到新机器。
- Telegram bot 收不到消息 → 国内网络需代理，http request 节点配 proxy 选项。
