# NB-IoT 与 Cat1 蜂窝模组：设备出门的通信方案

> WiFi 覆盖不到的地方（农田、水表井、户外仓库）就要上蜂窝网。NB-IoT 与 Cat1 怎么选、怎么连、怎么上报，一篇讲清。

## 一、选型：NB-IoT vs Cat1 vs 4G Cat4

| | NB-IoT | Cat1 | Cat4 |
|---|---|---|---|
| 速率 | ~60kbps | 下行10M/上行5M | 150M |
| 功耗 | 极低（PSM μA级） | 中 | 高 |
| 延迟 | 秒级 | 100ms 级 | 低 |
| 模块价 | 15~25元 | 25~40元 | 60+ |
| 语音/短信 | 短信可以 | 都可以 | 都可以 |
| 适用 | 水气表/烟感/地磁 | 摄像头/网关/语音 | 车载视频 |

**经验**：一天上报几十条小数据 → NB-IoT；要 OTA、传图、跑 TCP 长连接 → Cat1。

## 二、常用模组与 AT 通道

主流便宜模组：移远 BC26/BC28（NB-IoT）、EC200/EC800（Cat1）、合宙 Air724（Cat1，开发资料友好）。绝大多数场景走 **AT 指令**（ESP32 串口发 AT 控制模组）。

```cpp
// ESP32 + Air724 接线: UART1 TX→模组RX, RX→模组TX, 波特率 115200
#define MODOC Serial1

bool atCmd(const char *cmd, const char *expect, uint32_t timeout = 3000) {
  while (MODOC.available()) MODOC.read();   // 清缓冲
  MODOC.println(cmd);
  uint32_t t0 = millis();
  String resp;
  while (millis() - t0 < timeout) {
    while (MODOC.available()) resp += (char)MODOC.read();
    if (resp.indexOf(expect) >= 0) return true;
  }
  Serial.println("AT fail: " + resp);
  return false;
}

bool modemInit() {
  atCmd("AT", "OK");
  atCmd("AT+CPIN?", "READY", 8000);              // SIM 就绪
  atCmd("AT+CSQ", "+CSQ", 3000);                 // 信号 10,99 以上可用
  atCmd("AT+CGATT=1", "OK", 10000);              // 附着网络（NB 要 10s+）
  return atCmd("AT+CGATT?", "+CGATT: 1", 8000);
}
```

## 三、上报三板斧

### 1. TCP/UDP 直连（最轻）

```
AT+CIPSTART="TCP","your.server.com",9000
AT+CIPSEND=<len>
> <payload>
```

### 2. MQTT（Cat1 模组多数内置）

```
AT+MQTTUSERCFG=0,1,"dev01","user","pass",0,0,""
AT+MQTTCONN=0,"mqttbroker.cn",1883,1
AT+MQTTPUB=0,"dev01/telemetry","{\"t\":25.1}",1,0
```

### 3. CoAP / UDP 小包（NB-IoT 首选）

NB-IoT 上 TCP 长连接代价高（心跳耗电），推荐 **UDP + 自定义小包** 或 CoAP：发完就睡。

## 四、功耗设计：NB-IoT 的正确姿势

1. **PSM 模式**：上报完成 `AT+CPSMS=1` 进入 PSM，模组 μA 级待机，下次上报再唤醒。
2. **eDRX**：需要偶尔被唤醒收指令时用 eDRX，折中功耗与实时性。
3. **上报节奏**：锂亚电池（19000mAh）+ NB-IoT，5 分钟一次小包可以跑 3 年以上；实时在线长连接只能跑一个月。
4. **附着重试**：弱网区附着失败很常见，代码里指数退避重试（10s → 30s → 90s）。

## 五、SIM 卡与资费坑

- **物联卡**：选带"独立号段/可查用量后台"的正规卡，纯廉价物联卡限速+跑路风险高。
- **APN**：移动物联 `cmnbiot`、联通 `unim2m.njm2mapn`、电信 `ctnet`；连不上先查 APN。
- **信号**：NB-IoT 依赖运营商基站覆盖，地下室/电梯井先实地测 `AT+CSQ` 再定方案。

## 六、落地检查清单

- [ ] 串口交叉接线 + 共地
- [ ] CPIN → CSQ → CGATT 顺序初始化
- [ ] 上报失败入重发队列 + 断网缓存
- [ ] NB 场景启用 PSM，算过电池寿命
- [ ] 远程升级预留 OTA 通道（Cat1 才可行）
