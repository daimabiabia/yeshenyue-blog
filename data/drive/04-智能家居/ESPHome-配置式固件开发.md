# ESPHome：配置式固件，不用写代码

> ESPHome 用 YAML 描述"哪个引脚接什么、联动逻辑是什么"，自动编译固件。智能家居 DIY 效率神器，改配置即改功能。

## 一、心智模型

你写 YAML → ESPHome 生成 C++ → PlatformIO 编译 → OTA 推到设备。所有传感器/执行器被抽象成"实体"暴露给 Home Assistant，自动发现、自动出界面。

**适合**：传感器采集、开关控制、标准联动。
**不适合**：复杂自定义协议——那些还能用 `external_components` 补，但要会写 C++。

## 二、安装与第一台设备

```bash
pip install esphome        # 或 Home Assistant 的 ESPHome Add-on（更方便）
esphome dashboard config/  # 打开 http://localhost:6052 可视化编辑
```

```yaml
# config/esp32-01.yaml
esphome:
  name: esp32-01
esp32:
  board: esp32dev
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_pass
api:
  encryption:
    key: "base64密钥"     # 与 HA 配对用，自动生成
ota:
  platform: esphome
  password: "ota密码"
logger:

sensor:
  - platform: dht
    pin: GPIO4
    temperature:
      name: "实验室温度"
    humidity:
      name: "实验室湿度"
    update_interval: 30s
```

`esphome run config/esp32-01.yaml` 首次 USB 烧录，之后全走 OTA。

## 三、常用组件速查

```yaml
# 继电器/开关
switch:
  - platform: gpio
    pin: GPIO26
    id: relay1
    name: "水泵"

# 灯（PWM 调光）
output:
  - platform: ledc
    pin: GPIO25
    frequency: 1000Hz
    id: pwm1
light:
  - platform: monochromatic
    output: pwm1
    name: "台灯"

# 按钮（去抖+长按）
binary_sensor:
  - platform: gpio
    pin: { number: GPIO0, inverted: true, mode: { input: true, pullup: true } }
    name: "物理按键"
    on_press:
      then: [switch.toggle: relay1]
    on_multi_click:
      - timing: [ON 1s, OFF 200ms]      # 长按进配网
        then: [button.press: reset_btn]

# I2C 传感器
i2c: { sda: GPIO21, scl: GPIO22 }
sensor:
  - platform: sht3xd
    address: 0x44
    temperature: { name: "室内温度" }
```

## 四、联动逻辑（lambda 也可以很短）

```yaml
# 条件联动：温度超30开风扇，低28关
sensor:
  - platform: dht
    pin: GPIO4
    temperature:
      id: room_temp
      name: "温度"
      on_value_range:
        - above: 30.0
          then:
            - switch.turn_on: fan
            - lambda: 'ESP_LOGI("auto", "超温开风扇: %.1f", x);'
        - below: 28.0
          then: [switch.turn_off: fan]
```

复杂逻辑用 `script` + `if/while` 组合，可读性远超裸 C++。

## 五、Home Assistant 无缝接入

- ESPHome 与 HA 走原生 `api` 协议（加密），设备自动出现，无需手动添加。
- 所有 `name:` 命名的实体自动可用：自动化、看板、语音全接。
- 断网时设备本地联动照样跑（逻辑在设备端），这是 ESPHome 与"纯云"方案的本质区别。

## 六、进阶技巧

1. ** substitutions 复用模板**：

```yaml
substitutions:
  dev_name: "esp32-01"
sensor:
  - platform: dht
    pin: GPIO4
    temperature: { name: "${dev_name} 温度" }
```

2. **packages 拆分复用**：公共配置（wifi/ota/logger）抽成 `base.yaml`，多设备 `packages: [base]`。
3. **`esphome compile` 单纯出 bin**：CI 里编译校验不烧录。
4. **web_server 组件**：设备自带网页控制台，调试神器（占内存，老板子慎开）。
5. **external_components**：拉 GitHub 上别人写的驱动，官方没有的传感器也能秒接。

## 七、坑速查

- OTA 失败反复回滚 → 新固件里 wifi/api 配置错了，插 USB 重来；密钥换新会导致 OTA 拒绝。
- GPIO0/GPIO12/GND 启动约束：GPIO12 上电必须低（strapping），接了东西设备开不了机。
- DHT 与 ESPHome 慢轮询兼容性好，快轮询(5s 内)经常失败——用 SHT 系。
- YAML 缩进错 → 90% 的编译报错是缩进，别怀疑人生。
- 想做的组件没有 → 先搜 ESPHome 社区（大量 external_components），再考虑自己写。
