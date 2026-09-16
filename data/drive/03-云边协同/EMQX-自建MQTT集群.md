# EMQX 自建 MQTT 集群：从单机到可扩展

> 设备超过几百台、或者不想把命交给别人的云，就该自建 MQTT Broker。EMQX 是开源里最成熟的选择。

## 一、为什么是 EMQX

- 单机 10 万+ 连接（4C8G 轻松），集群线性扩展到百万级。
- 完整 MQTT 3.1.1 / 5.0 支持，QoS 0/1/2。
- Dashboard 可视化管理（18083 端口）。
- 内置规则引擎：消息到达直接 SQL 过滤 → 转发 Kafka/InfluxDB/HTTP。

Mosquitto 适合 100 台以内的小玩具；规模上去或要规则引擎，直接 EMQX。

## 二、单机部署（Linux，官方脚本最快）

```bash
# Docker（轻量，推荐先跑起来再说）
docker run -d --name emqx \
  -p 1883:1883 -p 8083:8083 -p 8084:8084 -p 8883:8883 -p 18083:18083 \
  emqx/emqx:5.7

# 端口含义
# 1883  MQTT TCP        8083 MQTT over WebSocket
# 8883  MQTT over TLS   8084 WSS
# 18083 管理控制台
```

初始账号 `admin / public`，登录 http://ip:18083 后**立刻改密码**。

## 三、认证与权限（第一件事）

默认**允许匿名连接**，公网部署等于裸奔。

```
Dashboard → Access Control → Authentication → 添加认证方式
1. 内置数据库：手动/批量添加 device_id + password
2. 或 HTTP 认证：EMQX 调你自己的 API 验证（灵活、可对接自有用户系统）
3. 或 JWT：设备先向你的后端换 token，EMQX 只验签
```

每设备独立账号密码，禁止全网共用一个凭证——设备被打穿损失可控。

## 四、ACL：设备只能订自己的 topic

```
# 认证数据库里给每设备配 ACL 规则：
{ allow: true,  action: "publish",   topic: "dev/${username}/#",
  qos: [0,1,2], retention: false }
{ allow: true,  action: "subscribe", topic: "dev/${username}/cmd/#" }
{ allow: false, action: "all",       topic: "#" }
```

`${username}` 占位符 = 每设备只能读写自己的命名空间，互不可见，防水平越权。

## 五、规则引擎：消息→数据库不写一行代码

```
Rules → Create：
  SQL: SELECT clientid, topic, payload FROM "dev/+/telemetry"
  动作: Republish 到 "valid/telemetry" / Bridge 到 InfluxDB / HTTP POST 到后端

FROM 里 dev/+ 的 + 是单层通配，payload 字段直接可取：payload.temp
```

典型链路：`dev/+/telemetry → 规则过滤异常值 → InfluxDB 存储 → Grafana 出图`，全程零代码。

## 六、集群与桥接

- **集群**：多台 EMQX 配置相同集群名、互相 discover（DNS/static）即成，会话与订阅全局可见，客户端可以随机挑一台连。
- **桥接**：EMQX 可以把 `dev/#` 流量转发到云上另一个 MQTT（如阿里云 IoT），混合云架构常用。

## 七、性能与连接数调优速记

1. **文件描述符**：`ulimit -n 1048576`，否则 10 万连接是天花板。
2. **QoS 选择**：遥测用 QoS0/1 就够；QoS2 开销 4 倍，除非计费指令别乱用。
3. **Keepalive**：设备 30~60s，短了流量大，长了掉线感知慢。
4. **会话**：clean_session=false + QoS1 才有离线消息，注意 `max_inflight` 与消息过期设置，防内存堆积。
5. **共享订阅**：`$share/group1/up/#` 可让多台消费端分摊消息（做后端水平扩展必备）。

## 八、运维检查清单

- [ ] 关匿名、每设备独立凭证
- [ ] ACL 最小权限（`#` 全禁）
- [ ] 8883 上 TLS（设备端双向认证更好）
- [ ] Dashboard 不暴露公网（或 IP 白名单）
- [ ] 规则引擎把数据落库，别依赖 broker 内存
- [ ] 监控 `emqx_vm_stats_runq` 与连接数水位
