# ESP32 快速入门速查

## 1. 型号家族速览

| 型号 | 内核 | WiFi | BLE | 典型用途 |
|---|---|---|---|---|
| ESP32 | 双核 Xtensa 240MHz | ✔ | ✔ 4.2 | 通用主力 |
| ESP32-S3 | 双核 + AI 指令 | ✔ | ✔ 5.0 | 语音/图像 AI |
| ESP32-C3 | 单核 RISC-V 160MHz | ✔ | ✔ 5.0 | 低成本替代（平替 ESP8266） |
| ESP32-C6 | RISC-V | ✔ + 802.11ax | ✔ 5.0 | Zigbee/Thread 多协议 |
| ESP32-H2 | RISC-V | ✘ | ✔ 5.0 | 纯无线：Zigbee/Thread |

口诀：**S 系能看又会说（显示+语音），C 系便宜心眼多（RISC-V），H 系不上网专做近场。**

## 2. 开发环境三选一

| 方式 | 适合 | 关键点 |
|---|---|---|
| Arduino IDE | 纯新手 | 装 esp32 by Espressif 板包， 选对 COM 口 |
| ESP-IDF | 工程/产品 | FreeRTOS 原生、组件化 (idf.py build flash monitor) |
| MicroPython | 快速验证 | 交互式 REPL，性能换灵活 |

## 3. 最小点灯（Arduino）

```cpp
#define LED 2            // 板载 LED 多在 GPIO2
void setup()  { pinMode(LED, OUTPUT); }
void loop()   { digitalWrite(LED, !digitalRead(LED)); delay(500); }
```

## 4. GPIO 注意事项（踩坑重灾区）

- **Strapping 引脚**：GPIO0/2/5/12/15 上电状态决定启动模式，别接强上拉/下拉的外设
- **GPIO34~39 只能输入**，没有内部上拉/下拉
- GPIO6~11 连接内部 Flash，**严禁使用**
- 输出电平 3.3V，单脚最大约 40mA（建议 ≤20mA），驱动继电器要加三极管/光耦

## 5. 常用外设一句话

- ADC：12 位（0~4095），衰减设 11dB 才能测到 3.3V
- PWM：`ledcSetup/ledcAttachPin`（IDF）或 `ledcWrite`，16 通道
- UART：3 个（0 被 USB 串口占用，用 1/2）
- I2C：默认 SDA=21，SCL=22
- 触摸 / DAC /霍尔：Pin 版本差异大，查 datasheet

## 6. WiFi 连接模板

```cpp
#include <WiFi.h>
WiFi.begin("SSID", "PASS");
while (WiFi.status() != WL_CONNECTED) delay(300);
Serial.println(WiFi.localIP());
```

## 7. 烧录失败排查顺序

1. 按住 BOOT 键再按 RST 进下载模式
2. 换数据线（很多线只能充电！）
3. 降低波特率到 115200
4. `esptool.py erase_flash` 清一次 Flash

> 登阶小结：会点灯 + 会连 WiFi + 会发 MQTT，就是 ESP32 的 Lv.1 毕业。
