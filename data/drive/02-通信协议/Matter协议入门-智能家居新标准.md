# Matter 协议入门：智能家居的"统一语言"

> Matter 是 CSA 联盟（苹果/谷歌/亚马逊/小米都在内）的智能家居互联标准。买设备前搞懂这篇，能少走三年弯路。

## 一、为什么需要 Matter

以前：米家设备进不了 HomeKit，Aqara 绑定自家网关，亚马逊音箱控不了谷歌灯泡。
Matter 的目标：**一套协议，所有生态互联**。设备只要带 Matter 认证标志，任何支持 Matter 的生态（Apple Home / Google Home / Alexa / HA）都能直接添加。

## 二、协议栈速览

```
应用层    数据模型（OnOff / LevelControl / Thermostat 等标准化 cluster）
传输层    TCP/UDP + Matter 消息封装
承载      WiFi / Thread / 以太网    （蓝牙仅用于配网）
桥接      Zigbee/Z-Wave 老设备通过桥接网关以 Matter 身份出现
```

关键概念：

- **Thread**：低功耗自组网（网状），电池设备的主场，需要一个 Thread 边界路由器（如 HomePod mini / ESP32-H2 网关）。
- **Commissioning（配网）**：扫二维码/输 11 位配对码 → 设备入网 → 生态分配操作凭证。二维码里是：PID+VID+配对码（密码）+discriminator。
- **Fabric**：同一设备可同时接入多个生态（多重管理员），苹果谷歌各管各的凭据互不冲突。

## 三、买设备怎么选

| 标志 | 含义 |
|---|---|
| Matter 标志 | 直接入任何 Matter 生态 |
| Works with Apple Home | HomeKit 认证（老体系） |
| "支持 Thread" | 低功耗网状，适合电池传感器 |
| 仅 WiFi Matter | 插电设备常见 |

**避坑**：
1. 需要网关的"伪 Matter"：一些设备宣称 Matter 但要厂商网关翻译——本质是桥接，延迟与可靠性打折。
2. 固件更新承诺：Matter 版本（1.0/1.2/1.3…）带来的新设备类型支持不同，买前查设备支持的 Matter 版本。
3. 中国区生态：米家对 Matter 支持逐步放开（网关固件升级后桥接），买前查具体型号公告。

## 四、Home Assistant 作为 Matter 控制器

```
HA 方案一：Home Assistant Connect ZBT-1 (原 SkyConnect) → 原生 Thread 边界路由器
HA 方案二：任何 Thread 边界路由器 + HA Matter hub 集成
流程：
  设置 → 设备与服务 → 添加集成 → Matter
  设备进入配网模式 → HA 扫配对码 → 入网
```

注意：Thread 边界路由器全网**建议只保留一个活跃的**（多台路由器要组成 Thread 网络拓扑），否则路由分裂导致设备掉线——这是 Matter/Thread 新手第一大坑。

## 五、ESP32 自己做 Matter 设备（开发者视角）

乐鑫 ESP-IDF / Arduino 均有 Matter SDK（esp-matter），ESP32-C3/H2/S3 支持完整：

```cpp
// Arduino Matter 库（电子 Iterate/psikoi 等社区库）示例：一个 Matter 开关
#include <Matter.h>
#include <MatterOnOff.h>

MatterOnOff lightSwitch;

void setup() {
  Serial.begin(115200);
  Matter.begin();
  lightSwitch.begin();
}

void loop() {
  Matter.handle();
}
```

- **ESP32-H2**：802.15.4 (Thread) 原生，做电池传感器理想主控。
- **ESP32-C6**：WiFi + Thread 双模。
- **配网模式**：设备首次启动进入 BLE 配网，手机/HA 扫码接入。
- 认证：开发调试无需 VID/PID 认证（测试 VID 0xFFF1）；要量产必须过 CSA 认证。

## 六、数据模型：cluster 思维

Matter 不传"原始 JSON"，而是标准化 **cluster + attribute + command**：

```
OnOff cluster：attribute OnOff(bool)，command On/Off/Toggle
LevelControl：亮度（0-254）
ColorControl：色相/饱和度/色温
Thermostat：设定温度/当前温度/模式
DoorLock：锁定状态 + 开锁指令（带用户码）
```

对开发者的意义：不需要自定义协议就能被所有生态"理解"，UI 自动生成，语音指令自动可用。

## 七、现状与务实建议

1. **过渡期用桥**：Zigbee 设备保有量大的家庭，Zigbee2MQTT/HA 桥接到 Matter，逐步替换。
2. **传感器优先 Thread**：电池设备 WiFi Matter 功耗问题尚未完全解决。
3. **自动化逻辑仍放 HA**：Matter 只解决"连接"，跨品牌联动、复杂场景还是 HA 自动化或 Aqara/米家引擎做。
4. 关注 Matter 1.3+ 新品类：能源管理、水阀、扫地机器人等逐步覆盖。
