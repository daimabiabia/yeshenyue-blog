# 温湿度传感器实战：DHT22 / SHT31 从接线到校准

> 温湿度是 IoT 入门第一课，也是最容易被"读数不对"劝退的一课。这篇把 DHT22 与 SHT31 两代方案一次讲透。

## 一、选型对照

| 型号 | 接口 | 精度(温/湿) | 采样率 | 价格 | 适用 |
|------|------|------------|--------|------|------|
| DHT11 | 单总线 | ±2℃ / ±5%RH | 1Hz | 极低 | 玩具级演示 |
| DHT22(AM2302) | 单总线 | ±0.5℃ / ±2%RH | 0.5Hz | 低 | 家用监测 |
| SHT31 | I2C | ±0.2℃ / ±2%RH | 10Hz | 中 | 气象站/农业 |
| BME280 | I2C/SPI | ±0.5℃ / ±3%RH +气压 | 高 | 中 | 需要气压时 |

**结论**：DHT22 够家用；做数据看板、曲线分析直接上 SHT31，别在 DHT 的时序坑上浪费时间。

## 二、DHT22 接线与时序

```
VCC ── 3.3V（供电 3.3~5.5V）
DATA ─ GPIO（必须 4.7k~10kΩ 上拉到 VCC）
GND ── GND
```

单总线时序核心：主机拉低 ≥1ms 发起 → 释放总线 → 传感器回应 80μs 低 + 80μs 高 → 连续 40bit 数据。**每一位以高电平宽度区分 0(26μs) / 1(70μs)**。

```cpp
#include <DHT.h>
DHT dht(4, DHT22);   // GPIO4，自带上拉时可省外接电阻

void setup() { Serial.begin(115200); dht.begin(); }

void loop() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h) || isnan(t)) {           // 必须判 NaN，读失败是常态
    Serial.println("read failed");
  } else {
    Serial.printf("T=%.1fC H=%.1f%%\n", t, h);
  }
  delay(2500);   // DHT22 采样间隔最小 2s，读快了返回旧值或失败
}
```

### DHT 三大坑

1. **采样太快** → 返回 NaN。间隔 <2s 是主因，代码里必须 `delay(2000)` 以上。
2. **线太长** → 数据错乱。>1m 建议上拉电阻改 4.7kΩ，>5m 用 3.3V 供电时几乎必挂，改 5V 供电（信号脚仍可接 3.3V 逻辑，DHT22 高电平阈值兼容）。
3. **漂浮/结露** → 读数卡在固定值。DHT 系列受潮后数据总线锁死，放干燥剂复活或直接换。

## 三、SHT31：I2C 方案的正确姿势

```
SHT31 ─ ESP32
VIN   ─ 3.3V
GND   ─ GND
SDA   ─ GPIO21
SCL   ─ GPIO22
地址：0x44（ADR 拉低）/ 0x45（ADR 拉高）→ 一条总线可挂两颗
```

```cpp
#include <Adafruit_SHT31.h>
Adafruit_SHT31 sht = Adafruit_SHT31();

void setup() {
  Wire.begin(21, 22);
  sht.begin(0x44);
}
void loop() {
  float t = sht.readTemperature();
  float h = sht.readHumidity();
  Serial.printf("SHT31 T=%.2f H=%.2f\n", t, h);
  delay(2000);
}
```

### 露点与体感温度

湿度本身没意义，要算**露点**才有用（露点 >16℃ 人感觉闷）：

```
γ = ln(RH/100) + (17.62*T)/(243.12+T)
露点 = 243.12*γ / (17.62-γ)
```

## 四、长期部署的校准要点

- **自热漂移**：传感器靠近 WiFi 芯片会被烤高 1~2℃。ESP32 上把传感器放板边、降占空比、或用软件偏移补偿。
- **对比基准**：拿一个手腕式温湿度计并排放 24h，记录差值，把 offset 写进上报逻辑。
- **滤波**：单次读数抖动 ±0.3℃ 正常，上报前做 5 点滑动平均，曲线立刻干净。
- **上报节流**：湿度变化慢，值变化 <0.5 才上报，能把 MQTT 流量降 80%。

## 五、迁移清单

- [ ] DHT22 判断 isnan + 2.5s 间隔
- [ ] SHT31 记住 0x44/0x45 双地址
- [ ] 加滑动平均滤波
- [ ] 算露点而不是裸报湿度
- [ ] 长期运行加 offset 校准
