# ESP-NOW 低延迟自组网：不用路由器也能传数据

> ESP-NOW 是乐鑫的私有协议：设备之间直连 MAC 地址通信，无需 AP、无需 IP，延迟低至 2ms。做遥控器、传感器网格、主从联动的第一选择。

## 一、它和 WiFi/MQTT 的关系

| | ESP-NOW | WiFi+MQTT |
|---|---|---|
| 连接耗时 | 无连接 | 3~8s |
| 延迟 | ~2ms | 20~200ms |
| 距离 | 空旷 200m+ | 取决于路由器 |
| 组网 | 点对点/一对多（≤20 peer） | 无限 |
| 上云 | 不行 | 行 |

**典型架构**：末端节点用 ESP-NOW 汇聚到一台"网关 ESP32"，网关再走 WiFi 上 MQTT。两层各取所长。

## 二、发送端

```cpp
#include <esp_now.h>
#include <WiFi.h>

uint8_t peerMAC[] = {0x24, 0x6F, 0x28, 0xAA, 0xBB, 0xCC}; // 对端 MAC
esp_now_peer_info_t peer = {};

typedef struct { float temp; float hum; uint32_t seq; } msg_t;
msg_t msg;

void setup() {
  WiFi.mode(WIFI_STA);          // ESP-NOW 复用 STA 模式，不用 connect
  esp_now_init();
  memcpy(peer.peer_addr, peerMAC, 6);
  peer.channel = 0; peer.encrypt = false;
  esp_now_add_peer(&peer);
}

void loop() {
  msg.temp = 25.5; msg.seq++;
  esp_now_send(peerMAC, (uint8_t*)&msg, sizeof(msg));
  delay(1000);
}
```

## 三、接收端

```cpp
#include <esp_now.h>
#include <WiFi.h>

typedef struct { float temp; float hum; uint32_t seq; } msg_t;

void onRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len != sizeof(msg_t)) return;         // 长度校验防脏数据
  msg_t m;
  memcpy(&m, data, sizeof(m));
  Serial.printf("[%02X:%02X:%02X:%02X:%02X:%02X] T=%.1f seq=%lu\n",
    info->src_addr[0], info->src_addr[1], info->src_addr[2],
    info->src_addr[3], info->src_addr[4], info->src_addr[5], m.temp, m.seq);
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  esp_now_init();
  esp_now_register_recv_cb(onRecv);
}
void loop() { delay(10); }   // 回调里别做重活，尽快返回
```

## 四、必须知道的规则

1. **看 MAC**：接收端 `WiFi.macAddress()` 打印自己的 STA MAC，抄给发送端。
2. **信道一致**：默认走当前 STA 信道；混用时两端 `esp_wifi_set_channel()` 固定同一信道。
3. **广播**：MAC 全 FF 可广播，`FF:FF:FF:FF:FF:FF`，新设备配对发现用。
4. **payload 上限**：250 字节。传大包请分片，或换回 WiFi。
5. **回调里禁止**：delay、大块 printf、MQTT publish——回调在中断上下文，塞数据进队列，主循环处理。
6. **加密配对**：`peer.encrypt=true` 需要先设置 LMK 密钥（16 字节），最多 17 个加密 peer。

## 五、可靠性：ack 与重传

`esp_now_send` 返回 ESP_OK 只代表进了协议栈，**送达与否看注册的发送回调**：

```cpp
void onSent(const uint8_t *mac, esp_now_send_status_t st) {
  if (st != ESP_NOW_SEND_SUCCESS) retryQueue.push(lastMsg); // 失败入重传队列
}
esp_now_register_send_cb(onSent);
```

传感器场景的务实策略：**周期性重发 + 序号去重**，不做复杂 TCP 式重传。数据自带上报时间戳，消费端按时间覆盖旧值。

## 六、掉线检测

心跳包：节点每 5s 发一次 `seq`；网关维护 `lastSeq[mac]`，超过 20s 没更新标记离线，触发告警。比 ping 简单且天然抗抖动。

## 七、坑速查

- 传输中偶发丢包 → 正常，加重发；别指望它像 TCP。
- 和自己家 WiFi 抢信道 → 把 ESP-NOW 信道设成与路由器一致，共存稳定。
- deep sleep 唤醒后发送失败 → 唤醒后重新 `esp_now_init + add_peer`，peer 表在 sleep 中丢失。
- 网关模式切换（STA+AP）后收不到 → 信道变了，重新固定。
