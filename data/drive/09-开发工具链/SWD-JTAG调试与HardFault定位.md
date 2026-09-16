# SWD/JTAG 调试实战：断点、单步与 HardFault 定位

> printf 调试之外的世界：挂上调试器，固件可以暂停、单步、看变量、看调用栈。HardFault 也能揪出具体是哪一行炸的。

## 一、硬件：一颗 ST-Link / DAP-Link 走天下

```
ST-Link V2 ─ STM32/ESP32(S 系列)
SWDIO ─ SWDIO
SWCLK ─ SWCLK
GND   ─ GND
3.3V  ─ 可不给（板子自供电时不接，防止两路电源打架）
```

ESP32 经典款没有 JTAG，**ESP32-S3 自带 USB-JTAG**：一根 USB 线既是供电又是调试器，openocd 或直接 PlatformIO 即可使用。

## 二、VSCode + PlatformIO 调试

`platformio.ini` 加：

```ini
debug_tool = stlink          ; esp32-s3 用 debug_tool = esp-builtin
debug_init_break = tbreak main
monitor_rts = 0
monitor_dtr = 0
```

F5 启动调试：断点、单步（F10 逐语句 F11 逐过程）、Watch 变量、Call Stack、Peripherals 寄存器窗口全都有。

**GDB 硬件断点只有 2~6 个**：断点多了会报错或退化成软件断点（会改闪存），少下几个关键点。

## 三、HardFault 定位：从懵逼到精确到行

### 方法 A：看调用栈（调试器在线时）

HardFault 挂上调试器暂停，Call Stack 直接显示炸在哪一层。寄存器窗口看 `PC`、`LR`、`SP`。

### 方法 B：Fault 寄存器自动翻译

```c
void HardFault_Handler(void) {
  __asm volatile (
    "tst lr, #4          \n"
    "ite eq              \n"
    "mrseq r0, msp       \n"
    "mrsne r0, psp       \n"
    "b hardfault_c       \n"
  );
}

void hardfault_c(uint32_t *sp) {
  // sp[6]=PC：故障发生时的指令地址
  // sp[7]=LR：调用者地址
  volatile uint32_t pc = sp[6];
  volatile uint32_t lr = sp[7];
  // 把 pc/lr 打印或存进 noinit RAM，重启后读出来
  while (1);
}
```

拿 `pc` 地址对照 `.map` 文件（`arm-none-eabi-addr2line -e firmware.elf 0x8001234`），直接还原到源码行。

### CFSR 快速判型（Cortex-M）

| Fault | 常见原因 |
|---|---|
| MemManage | 空指针访问保护区域 |
| BusFault | 访问不存在的外设地址、DMA 打野指针 |
| UsageFault | 除零、未对齐访问、执行非法指令 |
| HardFault（升级来的） | 上面三个没开 handler，全归到这 |

## 四、RTT：比串口快的日志通道

SWD 调试口可以顺带跑 SEGGER RTT——不占串口引脚、速度比 UART 快得多、不影响实时性：

```c
#include <SEGGER_RTT.h>
SEGGER_RTT_printf(0, "loop %d\n", i);   // J-Link RTT Viewer 或 openocd rtt 读取
```

esp32-s3 也可用 `esp_apptrace`；生产设备记得关调试日志。

## 五、实战坑

1. **调试时外设定时器怪异**：断点暂停期间外设还在跑，回来状态错乱——用 `debug_init_break` 而非随手暂停；关键外设可设 DBGMCU 冻结。
2. **ST-Link 版本**：V2 克隆块对 STM32 完全够用；ST 官方固件升级工具可能锁克隆块，别升级。
3. **ESP32 经典款想调试** → 外接 JTAG 排线（openocd + esp_usb_jtag 之外可用 ft2232）或换 S3。
4. **看门狗在调试时咬人** → `HAL_DBGMCU_EnableDBGSleepMode` 等系列调用，或调试期先喂狗。
5. **Flash 断点越界** → 硬件断点耗尽后 GDB 静默降级软件断点（修改 Flash），启动变慢且可能触发 IWDG。

## 六、检查清单

- [ ] SWD 四线接好，共地
- [ ] platformio.ini 配 debug_tool
- [ ] HardFault Handler 里取 PC/LR 的模板备好
- [ ] addr2line / .map 文件会查
- [ ] 硬件断点控制在 4 个以内
