# MQTT-SN 与 CoAP：受限网络协议

## 1. 什么时候不用「标准 MQTT」

| 场景 | 痛点 | 替代 |
|---|---|---|
| Zigbee/802.15.4 网络 | 没有 TCP/IP 栈 | MQTT-SN |
| 电池供电 + 蜂窝 NB-IoT | TCP 握手太耗电 | CoAP (UDP) |

## 2. MQTT-SN 要点

- MQTT over UDP，面向 **传感器网络（Sensor Network）**
- 三种角色：客户端 ↔ **MQTT-SN 网关** ↔ MQTT Broker
- 特色能力：
  - **主题短名 (TopicId)**：2 字节编号代替长主题，报文小一半
  - **主题注册**：客户端先 REGISTER 拿编号，再 PUBLISH
  - **广播搜索网关 (ADVERTISE/SEARCHGW)**：即插即用
  - 支持休眠客户端： asleep 状态 Broker 帮你缓存消息

## 3. CoAP 要点

- **RESTful over UDP**：像 HTTP 一样有 GET/POST/PUT/DELETE，但轻量
- 报文 4 字节头起步，二进制选项，适合几十字节的小消息
- 可靠性：CON（确认重传，类 TCP）vs NON（射后不理）；对应 MQTT 的 QoS1/QoS0

```text
CoAP URL 例：coap://server:5683/sensors/temp
观察模式 Observe：订阅资源变化，等价于 MQTT 订阅
```

## 4. MQTT vs MQTT-SN vs CoAP 对照

| 维度 | MQTT | MQTT-SN | CoAP |
|---|---|---|---|
| 传输层 | TCP | UDP | UDP |
| 模型 | 发布订阅 | 发布订阅 | 请求响应(+Observe) |
| 头大小 | 2B+ | 2B | 4B |
| 生态 | 最广 | 小众但稳定 | 边缘网关/LwM2M 标配 |

## 5. 选型口诀

- **有 TCP 又不缺电 → MQTT，无脑选**
- **Zigbee/802.15.4 组网 → MQTT-SN 走网关**
- **NB-IoT 电池表计 → CoAP / LwM2M（NB-IoT 的 PSM/eDRX 省电模式与 UDP 天作之合）**

## 6. LwM2M 顺带一提

CoAP 之上的设备管理标准：自注册、固件更新（OTA）、远程读写对象（/3/0 = 设备信息）。
做 NB-IoT 表计/ trackers 的同学迟早遇到，记住名字和定位即可。
