# BLE 低功耗蓝牙速查

## 1. 版本坐标

| 版本 | 关键词 |
|---|---|
| 4.0 | BLE 诞生（经典蓝牙的分家兄弟） |
| 4.2 | LE 数据包扩展、安全连接 |
| 5.0 | 2M PHY、长距离 Coded PHY、广播包 255B |
| 5.2 | LE Audio、LE Power Control |

## 2. GAP：设备的两种角色

- **外围 Peripheral**：发广播包等人来连（手环、传感器）
- **中心 Central**：扫广播然后发起连接（手机、网关）

广播包 31 字节 + 响应包 31 字节：名字、UUID、厂商数据都塞这里。

## 3. GATT：数据组织模型

```text
Profile → Service(服务) → Characteristic(特征值) → 属性(读/写/通知)
每个 Characteristic 用 UUID 标识，例如
0x2A37 心率测量 / 0x2A29 厂商名
自定义服务一般用 128-bit UUID
```

- **读/写**：手机主动拉/推
- **Notify/Indicate**：设备主动推（Notify 不确认，Indicate 要确认）→ 传感器数据流首选

## 4. 连接参数（功耗与延迟的旋钮）

| 参数 | 含义 | 省电取向 |
|---|---|---|
| Connection Interval | 交互周期 7.5ms~4s | 越大越省电 |
| Slave Latency | 从机可以跳过 N 次 | 越大越省电 |
| Supervision Timeout | 断连判定 | 适中 |

口诀：**连接间隔拉长、从机延迟拉满，纽扣电池能多活一年。**

## 5. 安全配对

```text
配对(pairing) → 绑定(bonding，密钥存下来下次免配)
MITM 防护靠 Passkey/数字比较；Just Works 不防中间人
```

## 6. ESP32 BLE 代码骨架（Arduino）

```cpp
#include <BLEDevice.h>
BLEServer* server = BLEDevice::createServer();
BLEService* svc = server->createService("FFE0");
BLECharacteristic* ch = svc->createCharacteristic(
    "FFE1", BLECharacteristic::PROPERTY_READ | PROPERTY_NOTIFY);
svc->start();
BLEAdvertising* adv = BLEDevice::getAdvertising();
adv->start();     // 开始广播
```

## 7. 踩坑清单

1. MTU 默认 23 字节，长数据要请求 `mtu ≥ 247` 再分包
2. Android 扫描 30 秒上限/后台限制；iOS 无设备名缓存问题（改名要重启蓝牙）
3. Notify 收不到：先检查 CCCD 描述符订阅（客户端要写 0x0001 到 0x2902）
4. 多连接：ESP32 一主可连 3~9 个（内存决定），手机 App 一般只连 1 个

## 8. BLE Mesh 一句话

多对多网络（照明常用）， Relay 节点接力转发，走广播信道不建连接 —— 智能灯全屋方案里和 Zigbee 掰手腕的对手。
