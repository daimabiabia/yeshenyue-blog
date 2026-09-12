# 夜神月 · 物联网技术博客（带后台管理）

纯零依赖 Node 小站：内容存于 `data/site.json`，后台改完即时落盘，刷新即生效。
**只有「夜神月」一个博主人设**，无其他人设混入。

## 启动
```bash
cd 夜神月博客
node server.js
# 或自定义端口： PORT=8080 node server.js
```
打开：
- 前台博客： http://localhost:3000/
- 后台管理： http://localhost:3000/admin

## 默认账号
- 后台密码：`yeshenyue`（登录后请在「修改密码」里改掉）

## 后台能管理什么
- **文章管理**：写新文章 / 编辑 / 删除；支持标题、栏目、标签、精选、摘要、Markdown 正文
- **配图上传**：文章编辑页可上传单张图片（≤4MB），自动写入 `public/uploads/` 并插入正文
- **站点设置**：站点标题、Slogan、关于我、技术栈、标签池、联系方式（邮箱/GitHub/开源项目）、**友链**、栏目增删
- **修改密码**

所有改动写入 `data/site.json`，无需重启服务。

## 前台特性
- 文章搜索（标题/标签/摘要实时过滤）
- 友链展示区
- 哈希路由：首页 / 文章详情 / 按栏目筛选 / 按标签筛选
- 深浅双主题（🌙 按钮，localStorage 持久化）
- 文章页「返回」为无刷新恢复首页

## 初始化默认密码
默认密码 `yeshenyue`。可在**首次启动前**用环境变量设定自己的密码：
```bash
ADMIN_PASS='你的密码' node server.js
```
（已生成过 `data/auth.json` 后，需删除该文件才会重新读取环境变量；或直接登录后在后台「修改密码」。）

## 目录结构
```
夜神月博客/
├─ server.js          # 零依赖服务器 + 公开/后台 API
├─ data/
│  ├─ site.json       # 全部内容（文章/栏目/标签/关于/联系）
│  └─ auth.json       # 后台密码哈希（别手改）
└─ public/
   ├─ index.html      # 前台博客
   ├─ admin.html      # 后台管理
   ├─ css/style.css   # Neo-Brutalism 视觉（深浅双主题）
   └─ js/             # markdown.js / app.js / admin.js
```

## 备份 / 迁移
直接拷走整个 `夜神月博客/` 文件夹即可；内容全在 `data/site.json`，换机器或换新站只需带上这个文件。

## 公网访问（内网穿透，无需域名/服务器）
已用 `cloudflared` quick tunnel 把本地 `http://localhost:3000` 暴露到公网。
- 当前公网地址： https://apparel-cleveland-ipaq-approve.trycloudflare.com
- 公网后台管理： https://apparel-cleveland-ipaq-approve.trycloudflare.com/admin
- ⚠️ quick tunnel 域名**每次重启隧道都会变**；下方「固定域名」给出永久方案。

先把博客跑起来，再开隧道：
```bash
# 1) 启动博客（保持运行）
cd 夜神月博客 && node server.js
# 2) 另开一个终端，启动隧道（cloudflared.exe 已放在工作区根目录）
cloudflared.exe tunnel --url http://localhost:3000 --no-autoupdate
```
停止：结束 `cloudflared` 进程与 `node server.js` 进程，公网随即断开。

### 想要固定域名 / 7×24 稳定访问
- **方案 A（Cloudflare 命名隧道）**：注册 Cloudflare 账号，`cloudflared login` 后建命名隧道，得到固定 `*.trycloudflare.com` 或绑定你自己的域名（需域名）。
- **方案 B（国内隧道 cpolar）**：访问 cpolar.cn 注册，下载客户端，免费版给随机 `*.cpolar.cn`，付费可固定；国内访问更快。
- **方案 C（云托管）**：代码推到 GitHub，部署到 Render / Railway / Fly.io，得到固定公网地址，且无需本机常开。

## 云托管部署（拿固定域名，无需本机常开）
本地仓库已就绪（`git` 已 init 并提交）。下面两条路二选一：

### 方式一：让我代你 push（需你提供 GitHub PAT）
给我一个 **GitHub Personal Access Token**（勾选 `repo` 权限即可）。我用它：
1. 通过 GitHub API 建公开仓库 `yeshenyue-blog`；
2. `git push` 上去（token 仅用于本次推送，不会留存）。
推送完成后，你只需在 https://render.com 上：New → Web Service → Connect GitHub → 选 `yeshenyue-blog` → Deploy。几分钟后得到固定地址 `https://yeshenyue-blog.onrender.com`，以后每次 `git push` 自动重新部署。

### 方式二：你自己 push（几条命令）
```bash
cd 夜神月博客
git branch -M main
git remote add origin https://github.com/daimabiabia/yeshenyue-blog.git
git push -u origin main
```
然后同上在 Render 连仓库部署即可。

### 安全说明
`data/auth.json`（后台密码哈希）已加入 `.gitignore`，不会进公开仓库。部署到云端后，服务端首次启动会自动生成默认密码 `yeshenyue`，请登录 `/admin` 立即修改。

