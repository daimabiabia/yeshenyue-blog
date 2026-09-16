# RFID 与 NFC 门禁卡实战：从读卡到模拟

> 13.56MHz 的 Mifare 卡是中国门禁/公交/校园卡的绝对主流。这篇讲清频率、协议、读写与 NFC 模拟的边界。

## 一、先分清频率：读不了卡多半是频率不对

| 频率 | 协议 | 常见用途 | 可复制性 |
|---|---|---|---|
| 125kHz | EM4100 | 老式门禁 ID 卡 | 裸 UID，秒复制 |
| **13.56MHz** | ISO14443A (Mifare) | 门禁/公交/校园 | 看加密 |
| 13.56MHz | ISO14443A (NTAG) | NFC 标签 | 明文，易复制 |
| 13.56MHz | ISO15693 | 图书馆/仓储 | 一般 |
| 2.4GHz/蓝牙 | —— | 手机NFC门禁卡 | 由手机安全管理 |

**读不出来第一件事**：拿手机 NFC 碰一下。手机能读出 UID 的就是 13.56M；没反应试试 125kHz 读卡器。

## 二、硬件：PN532 是性价比之王

- **PN532 模块**（约25元）：支持读/写/模拟（P2P），I2C/SPI/UART 三模式，Arduino/ESP32 资料全。
- **RC522**（约8元）：只能读写 13.56M，SPI 接口，最便宜。
- **ACR122U**：USB 读卡器，配合 PC 端工具分析。
- **Proxmark3 / Flipper Zero**：安全研究级设备（正经授权测试用）。

## 三、RC522 读 UID（Arduino 示例）

```
RC522 ─ ESP32 (SPI)
SDA(SS) ─ GPIO5    SCK ─ GPIO18
MOSI    ─ GPIO23   MISO ─ GPIO19
RST     ─ GPIO22   3.3V / GND
```

```cpp
#include <SPI.h>
#include <MFRC522.h>
MFRC522 rfid(5, 22);

void setup() { Serial.begin(115200); SPI.begin(); rfid.PCD_Init(); }

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  Serial.print("UID:");
  for (byte i = 0; i < rfid.uid.size; i++) Serial.printf(" %02X", rfid.uid.uidByte[i]);
  Serial.println();
  rfid.PICC_HaltA();
}
```

## 四、Mifare Classic 的加密真相（安全认知）

Mifare Classic 1K 结构：16 扇区 × 4 块，每扇区尾块是 KeyA/KeyB/权限位。

- **默认密钥** `FFFFFFFFFFFF` / `A0A1A2A3A4A5`：大量商用卡从未改过密钥，等于明文。
- **Crypto-1** 算法已被完全破解，配合已知 Key 可在分钟级恢复全部密钥。
- **Mifare Plus / DESFire**：AES 加密，安全等级高，新部署应选它们。

**合规提醒**：读写门禁卡仅限管理**自己拥有权限的卡**与自有系统；复制他人门禁卡、公交卡属违法行为。本文内容用于理解自有系统的安全设计与选型。

## 五、NTAG 标签：写点什么进去

NTAG213/215/216 容量 144/504/872 字节，明文可写，适合做 NFC 贴纸：

```
用途举例：
- 桌面贴纸 → 手机一碰打开博客 (https://www.yyyrlovelsw.top)
- 设备标签 → 存 JSON {"id":"gw-03","loc":"机房A"} 运维扫码即知
- 蓝牙配网 → 存 SSID/密码，新设备一碰入网
```

NDEF 格式写入用手机 App（NFC Tools）即可，无需代码。

## 六、门禁联动 DIY 架构

```
RC522(读UID) → ESP32 → MQTT(access/<uid>)
                    → 白名单校验 → 继电器开门 + 日志上报
```

要点：
1. UID 白名单存后台不存设备，改权限不用刷固件。
2. 记录每次刷卡时间+UID，导出用。
3. 加"防尾随"逻辑：同一 UID 60 秒内只开一次门。
4. 断网降级：本地缓存最近白名单快照，离线也能验。

## 七、坑速查

- 读卡距离骤降 → 天线谐振偏了，模块供电 3.3V 要稳。
- 能读 UID 写不了数据 → 密钥不对，别硬怼，先确认扇区权限。
- 手机能读 PN532 读不到 → 天线匹配/屏蔽问题，远离金属安装。
- 卡贴在金属上失效 → 需要防金属背胶版（on-metal tag）。
