# 低功耗设计与 OTA 升级速查

## 1. 低功耗三板斧

| 手段 | 效果 | 要点 |
|---|---|---|
| 睡眠模式 Sleep | mA → μA 级 | CPU 停，外设/内存保持，中断唤醒 |
| 深睡 Deep-sleep | μA 级 | 只有 RTC/ULP 活着，醒来重启 |
| 关外设/降频 | 细水长流 | 不用的外设时钟关掉，能降频就降频 |

口诀：**没事就睡，睡到被打（中断），醒了干完立刻睡。**

## 2. 功耗测量方法

- 万用表 μA 档串进电源（粗测）
- Nordic PPK2 / Joulescope 电流画像仪（看每个阶段的波形，专业必备）
- 先测「平均电流」再算电池寿命：`电池 mAh / 平均 mA = 小时数`

## 3. 典型低功耗设备模型

```text
深睡(99% 时间, 10μA) → 定时/中断醒 → 连 WiFi(最耗电!) → 发 MQTT → 深睡
```

WiFi 连接那 2~3 秒是耗电大户 → 用 **快速连接**（保存 BSSID/信道）可缩到几百 ms；
电池设备优先考虑 BLE / LoRa 而不是 WiFi。

## 4. OTA 升级原理（双分区 A/B）

```text
Flash 布局：[Bootloader][OTA_A][OTA_B][参数区]
升级流程：下载固件 → 写到非活动分区 → 校验(SHA/CRC) → 标记启动分区 → 重启
保险丝：新固件首次启动自检通过后，才「确认」；否则看门狗触发回滚旧版本
```

## 5. ESP32 OTA 代码骨架（Arduino）

```cpp
#include <HTTPUpdate.h>
HTTPUpdate http;
http.rebootOnUpdate(false);
t_httpUpdate_return ret = http.update(client, "http://192.168.1.10:8080/firmware.bin");
if (ret == HTTP_UPDATE_OK) { ESP.restart(); }
```

注意：生产环境必须走 **HTTPS + 签名校验**，明文 HTTP OTA 等于把设备大门敞开。

## 6. OTA 设计检查清单

- [ ] 固件带版本号 + 构建时间
- [ ] 下载失败/断点续传策略
- [ ] 签名或至少 CRC 校验
- [ ] 升级失败自动回滚（看门狗 + 分区标记）
- [ ] 灰度：先推 1% 设备，观察 24h 再全量

> 低功耗决定设备「活多久」，OTA 决定设备「活多好」——两个都是产品级的分水岭。
