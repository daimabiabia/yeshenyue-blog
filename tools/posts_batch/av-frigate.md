# Frigate 视频分析实战：本地 NVR + AI 事件的正确搭法

> 摄像头录像谁都会，但"有人逗留才告警、猫路过不理"才是 NVR 的灵魂。Frigate 用本地算力把这件事做到开箱即用。

## 一、Frigate 是什么

开源 NVR + 实时目标检测：接 RTSP 摄像头 → 运动检测触发 → AI 模型分类（人/车/猫/狗）→ 事件录像 + 推送。**全程本地**，不传云，不付订阅费。

硬件要求务实版：
- **Coral TPU（USB/PCIe）**：经典搭配，8~10 路 1080p 轻松，功耗 2W。
- **OpenVINO（Intel 核显）**：有 N100 小主机就能跑，省一个 TPU。
- **纯 CPU**：1~2 路 1080p 勉强，JVN 核 N100 级别可 4 路。

## 二、最小可用配置

```yaml
# docker-compose 核心
services:
  frigate:
    image: ghcr.io/blakeblackshearer/frigate:stable   # 官方 ghcr.io/blakeblackshearer/frigate
    shm_size: "256mb"
    devices:
      - /dev/apex_0        # Coral USB 用 /dev/bus/usb
    volumes:
      - ./config:/config
      - /mnt/nvr:/media/frigate
    ports: ["5000:5000", "8554:8554"]
```

```yaml
# config/config.yml
mqtt:
  host: 192.168.20.5
cameras:
  front_door:
    ffmpeg:
      output_args:
        detect: -vf scale=1280:720
    detect:
      enabled: true
      width: 1280
      height: 720
      fps: 5                # 检测流 5fps 足够，主录像流单独走全帧率
    objects:
      track: [person, car]
      filters:
        person:
          min_area: 2000    # 过滤远处行人误报
    zones:
      porch:
        coordinates: 0.3,0.1,0.9,0.1,0.9,0.9,0.3,0.9   # 归一化多边形
        objects: [person]
```

**关键架构认知**：每路摄像头两条流——**主码流（全帧率录像）+ 子码流（低帧率检测）**。检测跑在子码流上省 80% 算力，这也是所有 NVR 的标准玩法。

## 三、误报抑制三板斧

1. **zone（区域多边形）**：只在"门口台阶"内的人算事件，马路上路过的全忽略。这是第一生产力。
2. **min_area / 阈值**：远处 20px 的"人"（树影/广告牌）直接滤掉。
3. **required_zones + 时间条件**：夜间才对后院布防（配合 HA 的时间条件）。

调优流程：先全开看一天误报 → 给每个误报源（树影/灯光/猫）加 zone 或 filter → 第二天再验。**不要指望模型本身解决误报**，工程手段优先。

## 四、与 Home Assistant 联动

```yaml
# HA 侧（Frigate 集成自动出实体）
automation:
  - alias: "后院夜间有人"
    trigger:
      platform: state
      entity_id: binary_sensor.backyard_person_occupancy
      to: "on"
    condition:
      condition: time
      after: "23:00"
    action:
      - service: notify.mobile_app
        data:
          title: "⚠️ 后院检测到人"
          message: "置信度 {{ state_attr('binary_sensor.backyard_person_occupancy','score') }}"
          data:
            image: /api/frigate/notifications/backyard/person/latest.jpg
```

HA 通知带**事件截图**，不用开 App 就能初判——误报 3 秒划掉，真有事立刻回家。

## 五、存储规划

```
检测事件录像：H.264 子码流 720p ≈ 0.5GB/h/路
连续录像：主码流 1080p ≈ 2GB/h/路

实用策略（4 路）：
  连续录像保留 3 天 ≈ 576GB
  事件录像保留 30 天 ≈ 300GB（事件通常远短于全天）
  → 2TB 盘可循环。exFAT 别用（断电损坏风险），ext4/ZFS。
```

Frigate 自带循环覆盖（保留 N 天），比手写 cron 清理可靠。

## 六、进阶玩法

- **语义搜索**：Frigate 0.14+ 内置 embedding 搜索（"红衣服的人"），检索历史事件范式变了。
- **人脸识别**：配合 double-take + CompreFace，认识的人只记不发通知。
- **车牌识别（LPR）**：车道 zone + lpr 插件，到家自动开闸进 HA 场景。
- **双机架构**：N100 跑 Frigate 主力 + 树莓派跑门口摄像头专用实例，网络分区互为备份。

## 七、踩坑实录

1. **shm 不够**：容器默认 64MB，多摄像头直接崩 → `shm_size: 256mb` 起。
2. **子码流 H.265**：部分浏览器/检测管线对 H.265 支持差，检测流强制 H.264 更稳。
3. **摄像头时间不同步**：NTP 没配导致事件时间戳错乱，与 HA 对不上账——摄像头侧全开 NTP 指向内网。
4. **Coral USB 掉线**：USB 供电/线材问题，用带供电的 hub + 短线。
5. **GPU/TPU 全配了还是卡**：瓶颈在录像写盘（机械盘 4 路连续写吃满）——录像盘上 SSD/缓存盘，或降主码流码率。
