# 红外遥控：NEC 协议解码与万能转发

> 电视、空调、机顶盒还在用红外。用 ESP32 + 红外收发管做"红外网关"，手机就能控制所有老电器。

## 一、硬件：两个几块钱的元件

```
接收：VS1838B / HS0038（一体接收头）
  OUT ─ GPIO34（仅输入）
  VCC ─ 3.3V（部分型号要 5V，看手册）
  GND ─ GND

发射：940nm 红外发射管
  GPIO4 ─ 电阻(限流，直流部分 100Ω) ─ 发射管 ─ GND
  或直接用红外发射模块（自带驱动三极管）
```

VS1838B 自带解调（38kHz 载波检波），输出已是数据信号；发射端需要 MCU 自己产生 38kHz 载波（PWM/LEDC）。

## 二、IRremoteESP8266 库一步到位

```cpp
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRutils.h>

IRrecv irrecv(34);
decode_results results;

void setup() { Serial.begin(115200); irrecv.enableIRIn(); }

void loop() {
  if (irrecv.decode(&results)) {
    Serial.printf("proto=%s value=0x%08llX bits=%d\n",
      typeToString(results.decode_type), results.value, results.bits);
    irrecv.resume();
  }
}
```

按一下遥控器，串口立刻给出协议名 + 数据码。**NEC 协议**最常见：32bit = 8bit 地址 + 8bit 地址反码 + 8bit 命令 + 8bit 命令反码。

## 三、NEC 协议细节（解码原理）

```
引导码:  9ms 低 + 4.5ms 高
bit 0:  560μs 低 + 560μs 高
bit 1:  560μs 低 + 1.69ms 高
结束码:  560μs 低
重复码:  9ms低 + 2.25ms高（长按键每 110ms 重复一次）
```

手写解码器（学习用，实战直接用库）：

```cpp
// 记录电平跳变时间序列，高电平 >1.1ms 判 1，否则 0
bool necBit(uint32_t highUs) { return highUs > 1100; }
```

## 四、发射：把学到的码打回去

```cpp
#include <IRsend.h>
IRsend irsend(4);   // GPIO4

void setup() {
  irsend.begin();
  // 复现抓到的 NEC 码：发一次
  irsend.sendNEC(0x00FF6897, 32);
}

// 空调码往往上百 bit 且协议是 Gree/Daikin 等专用格式：
irsend.sendGree(state);
// 库支持空调"状态类"协议，比抄原始码更稳（含温度/模式/摆风语义）
```

**发射增强**：裸发射管距离 3~5 米；串两个发射管或加三极管驱动把电流提到 300mA+，可达 10 米。发射角度窄，多个房间要多个发射头（可用 ESP-NOW 组网，一个网关带多头发射）。

## 五、红外网关架构

```
手机/HA ──MQTT──> ESP32 红外网关
                    ├── IRrecv 学习模式（抓新遥控码入库）
                    └── IRsend 发射模式（按 topic 发码）
topic 设计：
  ir/learn        → 进入学习模式，下一个收到的码上报 ir/learned
  ir/send/ livingroom <hex> <proto> <bits> → 发射
```

代码骨架：

```cpp
void callback(char* topic, byte* payload, unsigned int len) {
  if (strcmp(topic, "ir/send/livingroom") == 0) {
    // payload: "NEC 0x00FF6897 32"
    uint64_t code; int bits;
    char proto[16];
    sscanf((char*)payload, "%15s 0x%16llX %d", proto, &code, &bits);
    if (strcmp(proto, "NEC") == 0) irsend.sendNEC(code, bits);
    else if (strcmp(proto, "RC5") == 0) irsend.sendRC5(code, bits);
  }
}
```

## 六、坑速查

1. **VS1838B 输出反相**：空闲为高，收到信号为低，解码逻辑注意。
2. **日光灯/阳光干扰**：接收头对强红外光敏感，加遮光罩（套热缩管做筒）。
3. **同一按键抓到两个码** → 一长一短：短的是键码，长的是重复码；解码时丢弃重复帧。
4. **空调码学不全**：空调是"全状态码"，改温度码就变；要么每个状态学一遍，要么用库的空调类协议组合发送。
5. **发射无效**：先用手机相机看发射管有没有紫光闪烁（排除硬件），再确认载波频率 38kHz。
