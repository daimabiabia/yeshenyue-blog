# PlatformIO 工程化指南：告别 Arduino IDE 手工作坊

> Arduino IDE 适合第 1 个点灯程序，第 10 个项目就该换 PlatformIO 了：依赖管理、多环境编译、单元测试、CI 全都有。

## 一、为什么换

| 痛点 | Arduino IDE | PlatformIO |
|---|---|---|
| 库管理 | 手动下 zip | `pio pkg install` 自动解析依赖 |
| 多板型 | 手动选+反复编译 | `platformio.ini` 多 env 一键全编 |
| 代码补全 | 弱 | VSCode IntelliSense 完整 |
| 单元测试 | 无 | 内置 Unity/GoogleTest |
| CI | 无 | pio run 即可接入 GitHub Actions |

## 二、5 分钟上手

VSCode 装 PlatformIO IDE 插件 → New Project → 选板型。工程结构：

```
myproject/
├── platformio.ini      ← 工程配置（灵魂）
├── src/main.cpp        ← 业务代码
├── lib/                ← 本地私有库
├── include/            ← 头文件
├── test/               ← 单元测试
└── data/               ← 要打包进 LittleFS 的文件
```

## 三、platformio.ini 实战模板

```ini
[env:esp32dev_wifi]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
lib_deps =
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^7.0.0
    adafruit/DHT sensor library@^1.4
build_flags = -DCORE_DEBUG_LEVEL=3
upload_port = COM5            ; 也可 /dev/ttyUSB0

[env:esp32dev_ble]
; 同一套代码的第二种编译形态：蓝牙版
platform = espressif32
board = esp32dev
framework = arduino
build_flags = -DUSE_BLE -DCORE_DEBUG_LEVEL=1
```

**一个工程多形态**：`pio run -e esp32dev_wifi` / `-e esp32dev_ble` 各编各的，固件互不污染。

## 四、高频命令

```
pio run                      编译默认 env
pio run -t upload            编译+烧录
pio run -t uploadfs          烧录文件系统(LittleFS)
pio device monitor           串口监视器（Ctrl+T Ctrl+T 退出）
pio pkg update               更新依赖
pio ci                       CI 模式编译（给 GitHub Actions 用）
```

## 五、文件系统：把网页塞进固件

ESP32 的 Web 配网页面存 LittleFS：

```ini
[env:esp32dev_wifi]
board_build.filesystem = littlefs
```

```
pio run -t buildfs       # data/ → littlefs.bin
pio run -t uploadfs
```

代码里：

```cpp
#include <LittleFS.h>
LittleFS.begin(true);
File f = LittleFS.open("/index.html", "r");
server.streamFile(f, "text/html");
```

## 六、单元测试：嵌入式也能 TDD

```cpp
// test/test_sensor/test_main.cpp
#include <unity.h>
#include "sensor_logic.h"   // 纯逻辑代码与硬件解耦

void test_temp_filter(void) {
  TEST_ASSERT_FLOAT_WITHIN(0.1, 25.0, movingAvg({24.9,25.1,25.0}));
}
void test_alarm_threshold(void) {
  TEST_ASSERT_TRUE(shouldAlarm(35.0));
  TEST_ASSERT_FALSE(shouldAlarm(25.0));
}

void setup() {}
void loop() {}
int main() {
  RUN_TEST(test_temp_filter);
  RUN_TEST(test_alarm_threshold);
  return 0;
}
```

**关键设计**：把"纯计算"（滤波、阈值、协议解析）从硬件耦合代码中拆出来，测试才能脱离真机在 PC 上跑。

## 七、CI：推代码自动出固件

```yaml
# .github/workflows/build.yml
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with: { path: ~/.platformio, key: pio }
      - run: pip install platformio
      - run: pio run
      - uses: actions/upload-artifact@v4
        with: { name: firmware, path: .pio/build/*/firmware.bin }
```

## 八、坑速查

- 找不到头文件（编译通过但 VSCode 报红）→ `Ctrl+Shift+P → PlatformIO: Rebuild IntelliSense Index`。
- 库版本冲突 → `pio pkg install` 时固定 `@版本号`，别裸奔。
- 上传失败 → 占用串口的monitor先关；CP2102 驱动确认装好。
- ESP32 反复重启 → build_flags 里把分区表改成 `board_build.partitions = huge_app.csv`（Web 大固件时）。
