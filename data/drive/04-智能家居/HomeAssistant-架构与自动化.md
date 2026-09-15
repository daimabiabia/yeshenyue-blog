# Home Assistant 架构与自动化速查

## 1. HA 是什么

开源智能家居中枢：把几十种协议（Zigbee/Z-Wave/WiFi/BLE/MQTT...）的设备
统一成一个本地平台，本地运行、不依赖厂商云、自动化自己写。

## 2. 安装方式速查

| 方式 | 说明 |
|---|---|
| HA OS | 专用整机/虚拟机镜像，功能最全（含 Add-on 商店） |
| HA Supervised | Debian 上托管，适合爱折腾 |
| HA Container (Docker) | 只有核心，无 Add-on |
| Core (venv) | 极客自玩 |

## 3. 核心概念

| 概念 | 一句话 |
|---|---|
| Integration (集成) | 协议/平台接入器（ZHA、MQTT、Hue...） |
| Entity (实体) | 设备的功能抽象：light.bedroom、sensor.temp |
| State | 实体状态机：on/off/25.3 |
| Service (服务) | 动作接口：light.turn_on、mqtt.publish |
| Automations / Scripts | 触发器 + 条件 + 动作 |
| Helper / Template | 虚拟实体与模板变量 |

## 4. 自动化四件套

```yaml
automation:
  - alias: 晚上有人来开灯
    trigger:                      # 什么时候
      - platform: state
        entity_id: binary_sensor.motion
        to: "on"
    condition:                    # 加不加条件
      - condition: sun
        after: sunset
    action:                       # 干什么
      - service: light.turn_on
        target: { entity_id: light.hall }
        data: { brightness_pct: 40 }
    mode: single                  # 重复触发策略
```

## 5. MQTT 设备接入（自研设备标配）

```json
Topic: homeassistant/sensor/mydev/temp/config
{"name":"温度","state_topic":"mydev/temp","device_class":"temperature",
 "unit_of_measurement":"°C","unique_id":"mydev_temp"}
```

发一次 config 到 `.../config` 即**自动发现**，之后 state_topic 每 30s 发数值即可。

## 6. Zigbee 接入两条路

| 方案 | 说明 |
|---|---|
| ZHA | HA 内置，配 USB 协调器即用 |
| Zigbee2MQTT | 更强（设备兼容列表大），走 MQTT，推荐进阶 |

## 7. 备份与运维

- 「设置 → 系统 → 备份」每周自动全量（配置 + 历史）
- 数据库默认 SQLite，量大换 MariaDB
- 手写 YAML 改完要 `检查配置` 再重启，别硬重启

## 8. 玩法进阶路线

```text
Lv.1 现成集成 + 自动化编辑器
Lv.2 MQTT 自建设备 + YAML 自动化
Lv.3 Template 传感器 + 数据库看板 (Grafana)
Lv.4 Add-on 开发 / 自研集成 HACS
```
