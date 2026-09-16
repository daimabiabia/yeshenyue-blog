# Zigbee2MQTT 从零到稳定：配对、命名与运维

> 一个 USB 棒 + Z2M，让几十颗 Zigbee 设备全部本地化、断网可用。这篇是踩完坑之后的稳定运行手册。

## 一、为什么是 Z2M（而不是 Zigbee Hub）

| | 品牌网关（米家/Aqara） | Z2M |
|---|---|---|
| 云依赖 | 部分依赖 | **零依赖** |
| 设备生态 | 自家为主 | 3000+ 型号全收录 |
| 数据 | 闭源 App | MQTT 全透明，随便对接 |
| 固件升级 | 厂商节奏 | Z2M 跟进社区（ota 功能） |
| 成本 | 网关 200+ | USB 棒 50 |

## 二、硬件与安装

**协调器选型**：
- **Sonoff ZBDongle-E（EZSP/EFR32）**：新装机首选，稳定且不挑天线。
- Sonoff ZBDongle-P（TI CC2652）：老牌稳定，串口驱动 Silicon Labs vs TI 之别。
- SLZB-06/POE：网线直连可放房间中心，信号覆盖最优（Zigbee 是网状网，协调器位置=网络质量）。

```yaml
# docker-compose
services:
  zigbee2mqtt:
    image: koenkk/zigbee2mqtt
    volumes:
      - ./data:/app/data
      - /dev/serial/by-id/usb-ITEAD...:/dev/ttyACM0
    ports: ["8080:8080"]
```

```yaml
# configuration.yaml
serial:
  port: /dev/ttyACM0        # 用 by-id 路径！USB 重插后 ttyACM 编号会变
advanced:
  channel: 25               # 2.4G 三大无干扰信道 11/15/20/25，避开 WiFi
  network_key: GENERATE     # 生成后保存备份，换机要原 key 才能接管网络
```

**信道纪律**：WiFi 1/6/11 信道全占满时，Zigbee 选 15/20/25（落在 WiFi 信道间隙）。选错信道 = 全屋设备随机掉线。

## 三、配对与命名规范

1. **配对**：UI 里 "Permit join" 开启 → 设备长按配对键。Aqara 类设备有"对话模式"限制，每 30s 重按一次。
2. **命名规范（第一天就定好，后期改名成本高）**：

```
房间-类型-位置：
  living-room/light/sofa-left
  entry/sensor/door
  bedroom/sensor/temp
```

3. **friendly_name 一旦被 HA 引用，改名 = 所有自动化断链**。先用编号跑通，稳定后一次性定名，别边用边改。

## 四、网络健康运维

Zigbee 是网状网，**路由节点（插电设备）越多网络越稳**。健康检查三件事：

1. **Mesh 图**：Z2M UI 的 Map 看拓扑，电池设备应挂在就近的路由节点上，而不是直连协调器（穿墙直连=信号挣扎）。
2. **LQI 信号质量**：`node Victoria → linkquality` 低于 50 的考虑加中继（随便一个插电 Zigbee 插座就是中继）。
3. **OTA**：`Settings → OTA` 更新设备固件；Aqara/绿米部分设备需"触发 5 次快速开关"才接受升级。

## 五、与 HA 的接法

```
Z2M → MQTT → HA 的 MQTT 集成（自动 discovery）
HA 里自动出现全部实体：开关/传感器/灯
自动化写 HA，Z2M 只管设备层
```

注意 Z2M 的 `homeassistant.enabled: true` 默认开启；**两套系统（米家网关 + Z2M）不要同时管理同一颗设备**——设备只能属于一个 Zigbee 网络。

## 六、常见故障手册

| 现象 | 根因 | 处理 |
|---|---|---|
| 全屋设备集中掉线 | 协调器 USB 掉线/信道被 WiFi 淹 | 看 Z2M 日志首行错误；换 by-id 与信道 |
| 单个设备频繁离线 | 距离远、挂错路由 | 加中继或挪位 |
| 电池设备几周没数据 | 睡眠设备错过路由请求 | 用带 router 功能的邻居；或唤醒（按一下按钮） |
| 配对失败 | 设备还在旧网络里 | 复位设备（5 次开关灯/长按 5s），先从旧网移除 |
| 换 USB 棒后全网失联 | network_key/pan_id 没迁移 | 备份的 `coordinator_backup.json` 恢复，或全部重新配对 |
| Z2M 升级后设备行为怪 | 转换器（converter）变更 | 看 changelog，回滚或等 hotfix |

## 七、稳定运行检查清单

- [ ] 协调器位置在房子中心，插电设备当路由
- [ ] 信道避开 WiFi（15/20/25）
- [ ] network_key 与 coordinator 备份已导出保存
- [ ] 命名规范统一，HA 自动化引用稳定
- [ ] 电池设备低电量告警（Z2M battery 实体 → HA 自动化）
- [ ] Z2M 与数据目录随 NAS/HA 备份（backup 功能一键导出）
