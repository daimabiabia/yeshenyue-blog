# 传感器选型总表与 I2C 地址冲突速查

> 搭项目最烦的两件事：不知道买哪个型号、两颗传感器地址打架。一篇查表解决。

## 一、常用传感器选型总表

### 环境类

| 测量 | 首选 | 备选 | I2C 地址 | 备注 |
|---|---|---|---|---|
| 温湿度 | SHT31 | SHT40/BME280 | 0x44/0x45 | 精度优先选 SHT 系 |
| 气压 | BMP280 | BME280/BMP390 | 0x76/0x77 | BME280 带湿度 |
| 光照 | BH1750 | TSL2561/VEML7700 | 0x23(ADDR高0x5C) | BH1750 便宜够用 |
| 空气质量(CO2) | SCD41 | MH-Z19C(串口) | 0x62 | NDIR 原理才准，eCO2 是估算 |
| PM2.5 | PMS5003 | PMSA003 | UART 9600 | 串口，占 2 个 GPIO |
| VOC | SGP40 | ENS160 | 0x59 | 相对指数，非绝对浓度 |
| 噪声 | 模拟麦+ADC | INMP441(I2S) | — | I2S 数字麦抗干扰好 |

### 运动与测距

| 测量 | 首选 | 接口 | 地址/引脚 | 备注 |
|---|---|---|---|---|
| 姿态 | MPU6050 | I2C | 0x68/0x69 | 入门；进阶 MPU9250 带磁力计 |
| 测距 | VL53L0X | I2C | 0x29（可改） | 激光，精确点位 |
| 测距(盲区大) | HC-SR04 | GPIO 时序 | 任意 | 便宜量程大 |
| 人体静止 | LD2410 | UART | 任意 | 毫米波，秒杀 PIR |
| 加速度高量程 | ADXL345 | I2C/SPI | 0x53/0x1D | ±16g 振动检测 |

### 电量与功率

| 测量 | 首选 | 接口 | 备注 |
|---|---|---|---|
| 电压电流 | INA219 / INA226 | I2C 0x40~0x45 | 16 地址可同总线多颗 |
| 电池电量计 | MAX17048 | I2C 0x36 | 直接输出百分比，比 ADC 分压准 |
| 全套电源监控 | INA260 | I2C 0x40+ | 集成采样电阻 |

## 二、I2C 地址冲突：同一总线上两颗同款芯片

### 方案 1：ADDR/AD0 引脚改地址（首选）

绝大多数 I2C 传感器有一个地址选择脚：

```
SHT31:  ADR 接 GND=0x44，接 VCC=0x45
MPU6050: AD0 接 GND=0x68，接 VCC=0x69
BMP280: SDO 接 GND=0x76，接 VCC=0x77
INA219: A0/A1 四种组合 = 0x40~0x45
BH1750: ADDR 悬空=0x23，接 VCC=0x5C
```

### 方案 2：没有地址脚的（如 VL53L0X）用 XSHUT 逐个改

```cpp
// 上电顺序改地址：先拉低所有 XSHUT，逐个释放并改地址
#define XSHUT1 25
#define XSHUT2 26
pinMode(XSHUT1, OUTPUT); pinMode(XSHUT2, OUTPUT);
digitalWrite(XSHUT1, HIGH);
lox1.begin(0x30);                 // 第一颗改成 0x30
digitalWrite(XSHUT2, HIGH);
lox2.begin(0x29);                 // 第二颗保持默认
```

### 方案 3：加 I2C 多路复用器 TCA9548A

8 通道 I2C 开关，地址 0x70（可改 0x70~0x77）。同款传感器 3 颗以上、或地址不可改时用它，一条总线扩成 8 条。

### 方案 4：换一条 I2C 总线

ESP32 支持 `Wire.begin(21,22)` + `Wire1.begin(32,33)` 两条独立总线，直接物理隔离。

## 三、I2C 扫描器（排查神器，背下来）

```cpp
#include <Wire.h>
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
}
void loop() {
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) Serial.printf("device @ 0x%02X\n", a);
  }
  Serial.println("scan done");
  delay(5000);
}
```

读数判读：`0x00~0x07` 保留地址误报正常；扫不到设备 → 上拉缺失/接错/没供电。

## 四、选型三原则

1. **精度够用就好**：室温监测 ±1℃ 的需求买 SHT35（±0.1℃）是浪费；但长期趋势分析必须高精度。
2. **接口优先级：I2C > UART > SPI > 模拟**。模拟输出受 ADC 精度与噪声拖累，能数字就数字。
3. **供电电压统一**：3.3V 生态优先（ESP32 直连）；5V 模块看是否板载稳压+电平兼容，省下电平转换的麻烦。

## 五、采购避坑

- 板上"GY-xxx"命名（GY-BMP280 等）是兼容模块，芯片可能被换（BMP280 变 BME280 少了湿度、变 BMP180 完全不同驱动）——到手先跑 ID 寄存器验证：BMP280 chip_id=0x58，BME280=0x60。
- 模块没上拉电阻的（裸传感器），自己加 4.7k×2。
- 同型号不同批次固件行为不同（PMS5003 休眠协议差异），封装驱动时留版本号。
