# 测距传感器：HC-SR04 超声波 vs VL53L0X 激光 ToF

> 测距是避障小车、液位计、人流检测的核心。两颗最常见的传感器，适用场景完全不同。

## 一、怎么选

| | HC-SR04 超声波 | VL53L0X 激光 ToF |
|---|---|---|
| 量程 | 2~400cm | 3~200cm |
| 精度 | ±3mm（理想面） | ±3%（25~120cm 段最佳） |
| 光斑 | 锥角~15°，大而散 | 极小光点，可穿小孔 |
| 弱项 | 吸音材料（海绵/布）失效 | 透明/镜面/黑色目标异常 |
| 接口 | Trig/Echo 时序 | I2C 0x29 |
| 价格 | 3 元 | 15 元 |

**经验**：液位计、避障用超声波；需要精确点位、多目标区分用激光。雨天下超声波回波乱跳， outdoor 设备加中值滤波。

## 二、HC-SR04 驱动（ESP32 RMT 版最稳）

原理：Trig 给 10μs 高 → 模块发 8 个 40kHz 脉冲 → Echo 高电平宽度 = 声波往返时间 → 距离 = 时间 × 340m/s ÷ 2。

```cpp
// 经典脉冲计数版（可用的基准实现）
#define TRIG 5
#define ECHO 18

float readDistanceCM() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(4);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  // pulseIn 有 1s 超时保护；长期部署建议换 RMT/中断版
  unsigned long dur = pulseIn(ECHO, HIGH, 30000);
  if (dur == 0) return -1;               // 超时=无回波
  return dur * 0.0343 / 2.0;
}

void setup() {
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  Serial.begin(115200);
}
void loop() {
  float d = readDistanceCM();
  Serial.println(d);
  delay(200);
}
```

**5V/3.3V 电平注意**：HC-SR04 是 5V 模块，Echo 输出 5V 会伤 ESP32 GPIO，需串联 1k+2k 分压（输出≈3.3V）。买 "HC-SR04 3.3V 版" 可省这一步。

### 采样策略

```cpp
float robustRead() {          // 中位数滤波：9 次取中值
  float v[9];
  for (int i = 0; i < 9; i++) { v[i] = readDistanceCM(); delay(40); }
  // 插入排序后取 v[4]
  for (int i = 0; i < 8; i++)
    for (int j = i+1; j < 9; j++)
      if (v[j] < v[i]) { float t=v[i]; v[i]=v[j]; v[j]=t; }
  return v[4];
}
```

两次测量间隔 ≥30ms，避免上一发回波混进下一发（串扰鬼影）。

## 三、VL53L0X 激光 ToF

```cpp
#include <Adafruit_VL53L0X.h>
Adafruit_VL53L0X lox;

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  lox.begin(0x29);
  lox.startRangeContinuous();
}
void loop() {
  if (lox.isRangeComplete()) {
    VL53L0X_RangingMeasurementData_t r;
    lox.getRangingMeasurementData(&r);
    if (r.RangeStatus == 0) Serial.println(r.RangeMilliMeter);  // 0=有效
    else Serial.println("invalid");
  }
}
```

关键配置：`VL53L0X_CHECKENABLE_SIGNAL_RATE` 与 `WRAP_AROUND_CHECK` 打开可过滤垃圾数据；测远距离把 timing budget 加到 33ms+。

### 多颗同挂一条 I2C

VL53L0X 上电后地址都是 0x29，用 XSHUT 引脚逐个释放并改地址：

```cpp
// 1. 全部 XSHUT 拉低
// 2. 释放第一颗 → lox.setAddress(0x30)
// 3. 释放第二颗 → lox.setAddress(0x31)
```

## 四、常见翻车

1. 超声波读数偶尔 0 或 300+ → 没做超时保护/滤波，照抄上面 robustRead。
2. 液位计读数随温度漂 → 声速 331.4+0.6×温度(℃)，精确场景按温度修正。
3. ToF 对着玻璃全是乱码 → 光学串扰，正常现象，换超声波或贴偏振膜。
4. 两颗超声波互相干扰 → 触发时刻错开 40ms，或轮流触发。
