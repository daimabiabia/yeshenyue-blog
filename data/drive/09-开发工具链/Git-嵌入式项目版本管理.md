# Git 在嵌入式项目中的正确用法

> 固件代码也该有版本管理。这篇解决嵌入式场景特有的问题：二进制产物、submodule、不同板型分支和发布标签。

## 一、目录布局模板

```
firmware-project/
├── .gitignore
├── platformio.ini
├── src/               源码（全部进 git）
├── include/
├── lib/               私有库（进 git）
├── test/              单元测试
├── docs/              接线图、原理图 PDF（进 git，LFS 可选）
├── data/              LittleFS 文件（进 git）
└── .pio/              ❌ 构建产物，ignore
```

## 二、.gitignore 模板（嵌入式版）

```gitignore
# PlatformIO
.pio/
# Arduino
build/
# Keil / STM32CubeIDE
*.o *.d *.crf *.lst *.axf *.htm
Debug/ Release/
# VSCode 本地配置（保留 launch.json 可提交）
.vscode/ipch/
# 二进制大文件不进 git
*.bin
*.hex
!bootloader*.bin        # 例外：bootloader 通常要留
# 密钥类绝不入库
secrets.h
*wifi*.h
```

** secrets 处理**：`secrets.h.example` 模板入库（占位符），真实 `secrets.h` 本地生成 + CI 注入。**API key / WiFi 密码进 git = 永久泄露**（历史里删不干净）。

## 三、分支策略（单人/小团队够用版）

```
main        稳定可烧录的版本（打 tag）
dev         日常开发
feature/x   大功能独立分支
fix/x       bug 修复
```

- 多板型**不建议**长期分叉分支（esp32 版 / esp8266 版）——用 PlatformIO 多 env 一套代码多形态，分支只管功能。
- 硬件版本变更（原理图迭代）用目录：`hw/v1/`、`hw/v2/`，配合 tag。

## 四、tag 与发布

```bash
# 固件发布三件套
git tag -a v1.2.0 -m "量产版：修复温度漂移，新增 OTA"
git push origin v1.2.0

# tag 与产出的固件一一对应：
# v1.2.0 → firmware-v1.2.0-esp32dev.bin（CI 自动构建并上传 Release）
```

**现场设备出问题，必须能回答"这设备跑的是哪个版本"**：固件里嵌入版本号——

```cpp
// version.h 由 CI 生成，不要手写
#define FW_VERSION "1.2.0"
#define FW_GIT_HASH "e27aece"
// MQTT 上报或 /info 接口里带上，远程即可核对
```

## 五、submodule：复用私有库的正确姿势

```bash
git submodule add https://github.com/you/esp-drivers.git lib/esp-drivers
git clone --recurse-submodules <repo>       # 别人 clone 要带这个参数
git submodule update --init --recursive     # 拉齐子模块版本
```

坑：submodule 记录的是**具体 commit**，父仓库 pull 后记得 `submodule update`；团队里 submodule 忘更新是"我这里编译不过"的头号原因。简单项目直接 vendor 进 lib/ 更省心。

## 六、Git LFS：原理图和照片

```bash
git lfs install
git lfs track "*.pdf" "*.kicad_pcb" "*.jpg"
git add .gitattributes
```

> 100MB 限制对 GitHub 免费 LFS 同样生效，超大文件用 Releases 附件。

## 七、提交规范（给自己看也够用）

```
feat: 新增雨量计传感器支持
fix: 修复 MQTT 断线后不自动重连
docs: 更新接线图
refactor: 传感器读取抽成 sensor.c
hw: 原理图 v2 改 ADC 分压
```

 commit message 里带**现象与根因**，一年后翻历史就是现成的踩坑笔记：

```
fix: ADC 读数随机跳变
根因：GPIO34 悬空分压电阻虚焊，上拉时序异常导致采样电容未充满。
现象：raw 值在 0~4095 全程跳动，WiFi 开启时加剧。
```

## 八、协作与 CI

1. PR 必须过 `pio run`（GitHub Actions 编译检查）再合并。
2. CI 同时编译所有 env（防止"只测了自己那块板"）。
3. Release 自动附 firmware.bin + 版本号（参考 PlatformIO 篇的 workflow）。
4. 敏感操作（改 bootloader、改分区表）单独提交，方便回溯。

## 九、踩坑清单

- [ ] .pio/ 一定 ignore（否则仓库几十 GB）
- [ ] secrets 模板化，绝不入库
- [ ] 固件嵌版本号，与 git tag 对应
- [ ] submodule 用了就写进 README 提醒
- [ ] 二进制大文件走 LFS 或 Release
