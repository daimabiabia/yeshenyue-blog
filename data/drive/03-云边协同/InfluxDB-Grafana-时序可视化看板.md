# InfluxDB + Grafana：传感器数据可视化看板

> 时序数据（温度、电流、能耗）别塞 MySQL——InfluxDB 专为时间序列而生，配 Grafana 出专业看板。

## 一、为什么不用 MySQL

| | MySQL | InfluxDB |
|---|---|---|
| 写入 | 行存储，索引贵 | 列存+压缩，百万点/秒 |
| 按时间聚合查询 | 全表扫 | 预聚合，毫秒级 |
| 数据保留策略 | 手动删 | 自动过期（TTL） |
| 连续降采样 | 自己写任务 | 内置 CQ 任务 |

传感器 10s 一条，一年 300 万条/设备——MySQL 直接躺平，InfluxDB 毫无压力。

## 二、部署

```bash
# InfluxDB 2.x + Grafana 一把梭
docker run -d --name influxdb -p 8086:8086 \
  -v influx-data:/var/lib/influxdb2 influxdb:2.7
docker run -d --name grafana -p 3000:3000 \
  -v grafana-data:/var/lib/grafana grafana/grafana:10
```

InfluxDB 初始化（8086）：创建 org + bucket（如 `iot`）+ All Access Token，**token 立刻保存**。

## 三、写入：MQTT → InfluxDB 直连

两条路：

1. **EMQX 规则引擎**（推荐，零代码）：Rule → Action → Data Bridge → InfluxDB v2，SQL 里把 payload 字段映射成 measurement。
2. **设备/网关直接 HTTP 写入**：

```bash
curl -X POST "http://influx:8086/api/v2/write?org=home&bucket=iot" \
  -H "Authorization: Token <TOKEN>" \
  --data-binary "sensor,device=esp32-01,room=lab temp=25.3,hum=55.1"
```

**行协议**要点：`measurement,tag=value field=value timestamp`
- **tag**（索引）：设备名、房间——查询过滤用它
- **field**（数值）：温度湿度——测量值用它

**别把设备 ID 写成 field**！tag 才有索引，写错查询会全表扫。

## 四、查询（Flux 入门）

```javascript
// 最近1小时 esp32-01 的温度，按5分钟聚合取平均
from(bucket: "iot")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "sensor" and r.device == "esp32-01" and r._field == "temp")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
```

## 五、Grafana 看板搭建

```
1. Connections → Data sources → InfluxDB Flux → 填 URL/org/token/bucket
2. New dashboard → Add panel
3. Query 选 InfluxDB Flux，贴上面语句
4. Panel 类型：
   - Time series：温度曲线（默认就很好看）
   - Stat：当前温度大数字 + 阈值着色（>30红）
   - Gauge：湿度仪表盘
   - Bar gauge：多设备电池对比
5. Alert：panel → Alert rules → 温度>35 连续2分钟 → 通知渠道（Telegram/钉钉/webhook）
```

看板审美建议：一屏 ≤ 6 个面板；统一时间范围联动；大数字面板放最上排——打开看板 3 秒内知道"现在正常吗"。

## 六、降采样与保留策略

```
原始 bucket iot：保留 7 天
  Task: 每5分钟聚合 mean → 写入 bucket iot_5m（保留 1 年）
  Task: 每1小时聚合 → 写入 bucket iot_1h（永久）
```

Grafana 看一周以上的图切到 `iot_1h`，查询快 100 倍且存储几乎不涨。

## 七、坑速查

1. **tag 当 field 用** → 查询慢成狗（前面说过，最常见错误）。
2. **时间戳单位**：行协议默认纳秒，API 参数 `precision=s` 指定秒，搞错时间全乱。
3. **Token 泄露**：设备端 token 被扒 = 数据库沦陷；设备只给"仅写"权限 token，或经 EMQX 中转。
4. **磁盘涨满**：没配 retention 的 bucket 会无限增长，建 bucket 时第一件事设 TTL。
5. **乱序数据**：设备离线补传的旧数据默认被拒，写入参数加 `--precision` 和 backend 的 `series-id-table`，或网关侧先排序。

## 八、一屏看板参考布局

```
┌────────────┬────────────┬────────────┐
│ 当前温度大数字 │ 当前湿度    │ 在线设备数   │   ← Stat
├────────────┴────────────┴────────────┤
│ 24h 温度曲线（多设备叠加）                  │   ← Time series
├───────────────────────────────────────┤
│ 电池电量 Bar gauge  │ 今日能耗曲线         │
└───────────────────────────────────────┘
```
