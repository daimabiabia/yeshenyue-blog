# 嵌入式日志系统设计：分级、落盘与远程拉取

> 设备在你手上只有几分钟，现场日志是唯一证人。但串口 print 不是日志系统——真正的日志要能分级、落盘、断网补传。

## 一、日志的四个等级与使用纪律

```
ERROR  影响功能的失败        每条都必须处理或上报
WARN   异常但已自愈          限流（同一 warn 一分钟最多一条）
INFO   关键状态迁移          开机、连云、OTA 开始/结束
DEBUG  详细过程              默认关闭，远程可动态打开
```

纪律比格式重要：ERROR 满屏飞会让真正的错误被淹没；DEBUG 默认开着会把串口带宽吃光、拖慢 loop。**默认等级 WARN，排障时远程切 DEBUG，15 分钟后自动回落。**

## 二、分级实现（ESP32 30 行版）

```cpp
#include <esp_log.h>
static const char *TAG = "app";
#define LOGD(...) esp_log_write(ESP_LOG_DEBUG, TAG, __VA_ARGS__)

// 动态调级：MQTT 命令 "log/level" -> "debug"
void onLogLevel(const char *lv) {
  if (!strcmp(lv, "debug")) esp_log_level_set("*", ESP_LOG_DEBUG);
  else esp_log_level_set("*", ESP_LOG_WARN);
  xTimerStart(fallbackTimer, 0);   // 15 分钟后自动回落 WARN
}
```

关键设计：**等级是运行时配置，不是编译期常量**——否则现场出问题还是得重新烧录。

## 三、落盘：环形日志 + NVS 快照

串口日志一断电就没了。落盘策略分两级：

### 1. RAM 环形缓冲（最近 N 条）

```cpp
#define RING_N 64
static char ring[RING_N][128];
static int ringIdx = 0;

void ringPush(const char *line) {
  strncpy(ring[ringIdx], line, 127);
  ringIdx = (ringIdx + 1) % RING_N;
}
```

### 2. 关键事件写 NVS（不怕断电）

```cpp
Preferences p;
void logCritical(const char *event) {
  p.begin("clog", false);
  uint32_t seq = p.getUInt("seq", 0) + 1;
  p.putUInt("seq", seq);
  char key[12]; snprintf(key, 12, "e%lu", seq % 32);
  char val[100];
  snprintf(val, 100, "%lu:%s", millis()/1000, event);
  p.putString(key, val);        // 环形 32 条，覆盖最旧的
  p.end();
}
```

**只写关键事件**（重启原因、ERROR、状态迁移）进 NVS——NVS 有擦写寿命，DEBUG 级别日志写 NVS 等于给 Flash 判死刑。

## 四、远程拉取：MQTT 分块传输

```cpp
// topic: dev/<id>/log/dump
void handleLogDump() {
  const int CH = 900;                    // 每块 900B，留 MQTT 余量
  int total = ringIdx;
  for (int i = 0; i < RING_N; i += 1) {
    char topic[48];
    snprintf(topic, 48, "dev/%s/log/chunk/%d", DEVICE_ID, i);
    client.publish(topic, ring[(ringIdx + i) % RING_N]);
    delay(20);                           // 避免突发塞爆 broker
  }
  client.publish("dev/x/log/dump_end", "1");
}
```

服务端（Node-RED 或后端）按序拼块落文件。离线场景：网关缓存 dump 请求，设备上线后补拉——**日志补传优先级低于遥测**，QoS 用 0 就够。

## 五、重启原因：远程排障的第一问

```cpp
#include <esp_system.h>
esp_reset_reason_t r = esp_reset_reason();
// 1 电源上电  2 SW 重启  4 panic  5 中断看门狗  6 任务看门狗  7 深睡唤醒  9 异常
```

开机第一件事：读 NVS 里的上次日志快照 + 重启计数，`INFO` 打一条：

```
boot #37, last=panic(4), uptime=86411s, fw=1.2.0
```

这一条日志能直接回答"是断电、是崩溃、还是人为重启"，节省一半的远程排障时间。

## 六、日志的坑

1. **日志本身导致崩溃**：printf 不可重入，中断里调用会随机花屏——中断日志入队，任务里统一输出。
2. **日志拖慢实时性**：9600 波特率打 200 字节 = 200ms 阻塞；要么提速 921600，要么异步。
3. **时间戳漂移**：NTP 没同步前用 `uptime`，同步后切真实时间戳，并在日志里记录切换点。
4. **隐私**：日志里绝不出现完整手机号/位置/密钥——日志文件会被整包传走，按生产数据对待。
5. **量级失控**：给每类 DEBUG 日志限频（同类 1s 最多 5 条），否则一次异常刷一万条把环形缓冲冲爆。

## 七、检查清单

- [ ] 等级运行时可切，且会自动回落
- [ ] RAM 环形 + NVS 关键事件双通道
- [ ] 开机打印重启原因与计数
- [ ] 远程 dump 分块 + 离线补传
- [ ] 中断日志异步化
- [ ] 敏感信息脱敏
