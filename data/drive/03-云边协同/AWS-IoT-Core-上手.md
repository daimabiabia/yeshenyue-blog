# AWS IoT Core 上手速查

## 1. 架构定位

```text
设备 → (MQTT/TLS 8883) → AWS IoT Core → 规则引擎 Rules → DynamoDB/S3/Lambda/SNS
                ↕ Device Shadow(设备影子)
```

## 2. 核心概念

| 概念 | 一句话 |
|---|---|
| Thing | 设备在云端的「户口」（影子+证书+策略） |
| X.509 证书 | 设备身份凭证：证书 + 私钥 + CA 三件套 |
| Policy | JSON 权限：能连、能发哪个 topic |
| Rule (SQL) | `SELECT * FROM 'topic' WHERE ...` 做路由和过滤 |
| Shadow | JSON 版设备状态，设备离线也能读/写（desired/reported） |

## 3. 设备影子精讲

```json
{
  "state": {
    "desired":  { "led": true },      // 云端想要的
    "reported": { "led": false }      // 设备上报的实际
  },
  "version": 7, "timestamp": 1726000000
}
```

- App 改 desired → 设备订阅 `$aws/things/x/shadow/update` 收到 delta → 改完上报 reported
- 弱网/离线设备的**状态同步神器**：先看影子再决定要不要喊醒设备

## 4. MQTT 连接差异（vs 普通 Broker）

- clientId 必须唯一，重复连接互踢
- 主题 ACL 由 Policy 精确到 arn：`arn:aws:iot:region:acct:topicfilter/device/1/#`
- 保留消息不支持（用 Shadow 代替）；QoS 0/1 有，QoS 2 没有
- 专属主题：`$aws/things/{name}/shadow/#`、`$aws/rules/...`

## 5. 鉴权选型

| 方式 | 场景 |
|---|---|
| X.509 双向 TLS | 标准做法，量产首选 |
| SigV4 自定义鉴权 | 已有 AWS 账号体系 |
| Custom Authorizer (Lambda) | 对接自有用户系统 |

## 6. 规则引擎示例

```sql
SELECT temperature AS t, deviceId() AS id
FROM 'factory/+/temp'
WHERE t > 80
```
→ 挂动作：发 SNS 告警 / 写 Timestream / 触发 Lambda。

## 7. 费用直觉

- 连接 + 消息按条计费（每 5KB 一条），Shadow 按操作计
- 小规模（几十台设备）每月几十块以内；设备多了重点盯消息量和规则触发次数

## 8. 对比记忆

| 云 | IoT 平台 | 特点 |
|---|---|---|
| AWS | IoT Core | 影子 + 规则最成熟 |
| Azure | IoT Hub | Twin 概念类似 Shadow |
| 阿里 | 企业物联网平台 | 三元组（ProductKey/DeviceName/DeviceSecret） |
| 自建 | EMQX/Mosquitto | 数据主权，省心程度自付 |
