# 智能小车：循迹、避障与 PID 调参全流程

> 小车是把传感器、电机、控制论串起来的最好练手项目。这篇记录一辆循迹避障小车从零到稳定跑完全程的全部参数。

## 一、整车配置

```
底盘：双轮差速 + 万向轮
电机：TT 减速电机 ×2（TB6612 驱动）
主控：ESP32（WiFi 调参界面！）
传感器：5 路红外循迹灰度（TCRT5000）+ HC-SR04 前避障 + MPU6050（航向）
电池：18650 ×2 (7.4V) —— 电机与主控分路供电，共地
```

## 二、电机基线：先会"走直线"

PID 之前必须有**对称的电机基线**，否则一切白搭：

```cpp
// 标定：左右轮各跑 PWM 100~255，记录 1 秒转角/里程
// 常见问题：两轮同 PWM 转速差 10~20%，用软件补偿
void setSpeed(float left, float right) {
  // left/right: -1.0~1.0
  int pwmL = left  * 255 * L_COMP;   // L_COMP≈1.05 补偿左轮慢
  int pwmR = right * 255;
  motorWrite(PWM_L, pwmL);
  motorWrite(PWM_R, pwmR);
}
```

## 三、循迹：从开关逻辑到 PID

### 五路灰度读值约定

```
[0][0][1][0][0]  中间在线 → 直行
[0][0][1][1][0]  偏左     → 轻微右修
[1][0][0][0][0]  大幅右偏 → 急修
```

### 简单开关逻辑的极限

```cpp
// 玄学打滑、蛇形扭动——只能低速（PWM<120）
if (pos == CENTER) setSpeed(0.5, 0.5);
else if (pos == SLIGHT_LEFT) setSpeed(0.5, 0.3);
```

### PID 循迹（核心）

```cpp
float Kp = 18.0, Ki = 0.0, Kd = 45.0;   // 起点：先 P 后 D，最后 Ki
float lastErr = 0, integral = 0;

// 误差定义：以中传感器为 0，相邻偏差 ±1，边缘 ±2（或做插值更平滑）
int pos = readLinePosition();            // -2..2
float err = (float)pos;

integral += err;
float diff = err - lastErr;
float turn = Kp * err + Ki * integral * 0.01 + Kd * diff;
lastErr = err;

setSpeed(constrain(0.55 - turn, -1, 1), constrain(0.55 + turn, -1, 1));
```

### 调参顺序（每次只动一个）

1. **Ki=0，Kd=0**，调 Kp：能跟着线蛇形 → 加大 Kp 一直到小幅振荡后退回 60%。
2. **加 Kd**：抑制振荡，直线越来越稳；Kd 过大高速抖动。
3. **最后 Ki**：长弯道内切才需要；九成情况 Ki=0 就是最好的。
4. 速度提一档后回到第 1 步重新调——**参数与速度绑定**，换速必重调。

## 四、避障逻辑（超声测距 + 侧身绕行）

```cpp
if (distCM() < 20) {
  setSpeed(0, 0); delay(200);
  // 简易绕行：后退 → 右转90 → 前进 → 左转90 → 回线
  // 循迹恢复：继续走 PID，走歪了灰度传感器会自己拉回来
}
```

更优雅：**转向由 MPU6050 yaw 闭环**（转 90° 用角度控制而非死等时间），不同地面上一致性高得多。

## 五、WiFi 调参界面（ESP32 杀手锏）

```cpp
WebServer server(80);
server.on("/set", []() {
  if (server.hasArg("kp")) Kp = server.arg("kp").toFloat();
  if (server.hasArg("kd")) Kd = server.arg("kd").toFloat();
  server.send(200, "text/plain", "ok");
});
// 手机构浏览器改参数立即生效，不用反复刷固件——调试效率差 10 倍
```

再进一步：WebSocket 实时推 `err`、`turn` 数值，用简单图表看 PID 响应曲线，调参从玄学变科学。

## 六、机械与电气踩坑

1. **电池压降**：电机堵转瞬间 7.4V 掉到 5V，ESP32 复位 → 加 470μF 电容 + 分路供电。
2. **灰度传感器高度**：距地 5~10mm 最佳；贴地会脏、太远读不稳。
3. **重心**：万向轮放前 vs 后影响转弯半径，后置更稳。
4. **轮子打滑**：赛道反光/灰尘导致灰度突变，PID 的 D 项突然踢一脚 → 对 err 做限幅 + 低通。
5. **USB 连着调车**：线一甩就是 reset，所有调试尽快切到 WiFi/无线的调试通道。

## 七、进阶路线

- 里程计（编码器）+ 航位推算 → 定点停车
- 卡尔曼融合 MPU+编码器 → 高精度航向
- 上位机 ROS2 对接 → SLAM 起步
- 比赛提速：电感巡线（电磁）替代灰度，抗光干扰
