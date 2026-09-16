# MQTT 安全加固：认证、TLS 与 ACL 全套

> MQTT 默认配置是"谁都能连、什么都能订"。这篇按攻击者视角把安全清单过一遍，每一项都给落地配置。

## 一、威胁模型：默认配置有多危险

攻击者拿到 broker 地址后可以：

1. **订阅 `#`** → 全网传感器数据尽收眼底（含隐私）。
2. **向 `home/switch/#` 发布** → 直接操控你的继电器、门锁。
3. **恶意设备洪水连接** → broker 内存耗尽拒绝服务。
4. **中间人** → 明文 MQTT（1883 端口）数据可被局域网嗅探篡改。

## 二、认证：第一道门

### 方案对比

| 方案 | 适用 | 特点 |
|---|---|---|
| 内置数据库 | 设备少 | Dashboard 手动管理 |
| 每设备独立密码 | 通用 | 泄露影响面可控 |
| JWT/Token | 设备多+有后端 | EMQX 只验签，权限动态 |
| 客户端证书(mTLS) | 高安全 | 无密码，最强，运维成本高 |

**底线**：关闭匿名 `allow_anonymous = false`（Mosquitto）；EMQX Dashboard 删除 anonymous 认证链。

### Mosquitto 密码与 ACL 配置

```bash
# /etc/mosquitto/mosquitto.conf
allow_anonymous false
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl

# 生成用户
mosquitto_passwd -c /etc/mosquitto/passwd esp32-01   # 交互输密码
```

```
# /etc/mosquitto/acl —— 每设备一块
user esp32-01
topic write dev/esp32-01/#
topic read  dev/esp32-01/cmd/#
```

## 三、TLS：第二道门

### Mosquitto 服务端配置

```bash
# /etc/mosquitto/mosquitto.conf
listener 8883
cafile   /etc/mosquitto/certs/ca.crt
certfile /etc/mosquitto/certs/server.crt
keyfile  /etc/mosquitto/certs/server.key
tls_version tlsv1.2
```

自签 CA 一键生成：

```bash
# CA
openssl req -new -x509 -days 3650 -keyout ca.key -out ca.crt -subj "/CN=IoT-CA"
# 服务器证书（CN 填 broker 域名/IP）
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=mqtt.home.local"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -days 825 -out server.crt
```

### ESP32 设备端

```cpp
WiFiClientSecure tls;
tls.setCACert(ca_crt);          // 编译期烧入 CA 证书（ PEM 字符串），验证服务器
PubSubClient client(tls);
client.connect("esp32-01", "esp32-01", DEVICE_PASS);
```

**关键**：设备端必须 `setCACert` 做服务器校验，否则 TLS 只是加密、不防假服务器。公网可用 Let's Encrypt 免费证书省去自签维护。

## 四、ACL：防水平越权

原则：**设备只能读写自己命名空间**。

```
dev/<device_id>/telemetry    只写（发布）
dev/<device_id>/status       只写（birth message / LWT）
dev/<device_id>/cmd/#        只读（订阅指令）
$SYS/#                        全禁（broker 内部指标）
```

EMQX 里用 `${username}` 模板写规则；Mosquitto 按用户逐个写。绝不允许任何设备出现在能发布 `$share/#`、`$SYS/#` 的规则里。

## 五、连接层防滥用

1. **连接速率限制**：EMQX `max_conn_rate`、Mosquitto `max_connections`。
2. **ClientID 唯一性**：同一 clientid 互踢会被利用（顶号攻击），启用"冲突即拒绝连接"策略并告警。
3. **Keepalive 与会话**：限制 `max_inflight`、`message_size_limit`（如 256KB），防大包内存攻击。
4. **带宽配额**：EMQX 每客户端速率限制配置。

## 六、监控告警：事后能发现

- 连接数突增 → 可疑设备/洪水攻击
- `$SYS/broker/...` 授权失败计数突增 → 有人试密码
- 异常 topic 出现（非设备命名空间）→ 有设备被篡改
- 用 Prometheus + `emqx_exporter` 或 mosquitto `sys_interval` 输出，Grafana 告警。

## 七、检查清单（上线前打勾）

- [ ] 匿名连接已关闭
- [ ] 每设备独立凭证 + ACL 最小权限
- [ ] 8883 TLS + 设备端 CA 校验
- [ ] clientid 冲突策略 + 连接速率限制
- [ ] $SYS 与通配 topic 对设备全禁
- [ ] broker 管理端口（18083/8080）不对公网
- [ ] 授权失败监控告警
- [ ] broker 定期备份 + 升级补丁
