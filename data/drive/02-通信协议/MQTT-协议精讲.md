# MQTT 协议精讲

## 1. 核心模型 30 秒

```text
发布/订阅模型：Publisher → Broker(服务器) → Subscriber
解耦三要素：Topic(主题) 把消息分类，双方互不知晓对方存在
```

## 2. 报文结构

```text
固定头(2字节起) + 可变头 + 载荷
固定头：类型(4bit) + 标志(4bit) + 剩余长度
```

| 类型 | 名称 | 说明 |
|---|---|---|
| 1 | CONNECT | 连接（clientId/用户名密码/KeepAlive） |
| 3 | PUBLISH | 发布消息 |
| 8/9 | SUBSCRIBE/SUBACK | 订阅 |
| 12/13 | PINGREQ/PINGRESP | 心跳保活 |
| 14 | DISCONNECT | 断开 |

## 3. QoS 三档（必考）

| QoS | 流程 | 丢失风险 | 开销 |
|---|---|---|---|
| 0 | 发完就忘 | 可能丢 | 最低 |
| 1 | PUBLISH → PUBACK，超时重发 | 可能**重复** | 中 |
| 2 | 四次握手 PUBLISH/PUBREC/PUBREL/PUBCOMP | 不丢不重 | 最高 |

口诀：**0 最多一次，1 至少一次（可能重复），2 恰好一次（最贵）。**
传感器数据用 0/1，账单控制指令用 2 或 1+业务去重。

## 4. 遗嘱 LWT 与保留 Retained

- **遗嘱**：连接时预埋一条消息，异常掉线时 Broker 替你发布（`设备状态/离线`）→ 在线状态的标配
- **保留消息**：Broker 保存每个主题最新一条，新订阅者立刻收到 → 设备上报配置/状态的标配

## 5. Topic 设计规范（实战精华）

```text
{产品}/{设备ID}/{数据类型}     例：factory/gw01/temp
命令下行：cmd/  前缀；上行：data/ 前缀
通配符：+ 单层，# 多层（订阅端才能用，发布禁止通配）
```

反例：`test/123`（三个月后没人知道这是啥）。
正例：`home/livingroom/sensor/humidity`。

## 6. 会话与保活

- CleanSession=false：Broker 保留订阅和离线消息（QoS≥1），重连补发
- KeepAlive：客户端在 1.5 倍周期内无报文，Broker 判离线
- 弱网设备：KeepAlive 60~120s + QoS1 + CleanSession=false

## 7. 安全清单

- [ ] TLS 8883 端口（至少账号密码 + 证书二选一）
- [ ] 每设备独立 clientId/凭证，禁用匿名
- [ ] ACL 权限：设备只能发布/订阅自己的前缀
- [ ] Broker 不暴露公网未鉴权端口（EMQX/Mosquitto 默认配置都要加固）

## 8. Mosquitto 本地调试 3 条命令

```bash
mosquitto_sub -t "home/#" -v              # 订阅看全部
mosquitto_pub -t "home/test" -m "hello"   # 发一条
mosquitto -c /etc/mosquitto/mosquitto.conf -v   # 起 broker
```
