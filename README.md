<div align="center">
  <h1>Antigravity Gateway (Windows & Antigravity 2.0 增强版)</h1>
  <p><strong>本地 Antigravity Agent 的 Web 控制台与飞书机器人网关</strong></p>
  <p>支持 Windows 10/11、macOS 与 Linux，完整适配 Antigravity 2.0 Hub 模式，支持飞书扫码一键建机器人、实时查看思考与执行过程、多工作区管理与本地日志/用量监控。</p>
  <p>
    <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
    <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" />
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=flat-square" />
  </p>
</div>

---

## 核心功能

### 1. Web 可视化控制台 (`http://localhost:3000`)
- **全量历史会话恢复**：自动聚合 `conversation_summaries.db`、`conversations/*.db`（以及旧版 `.pb`）与语言服务在线轨迹，Antigravity 重启后不丢失历史对话，自动过滤内部子 Agent 噪音。
- **单条与批量删除**：每条会话支持悬停单条删除或顶部批量删除，同步清理数据库与本地记录。
- **资产与监控面板**：集中管理本地技能、工作流、规则、工作区、全局知识库、实时日志（`/api/logs`）、飞书配置与 30 天用量/配额看板。

### 2. 飞书移动端远程协同
- **WebSocket 长连接**：无需公网 IP 或域名，本机主动连接飞书开放平台即可双向收发。
- **常用指令**：
  - `/new` `/p` —— 查看并切换工作区，或创建新项目（自动绑定到 Antigravity 对应 Project）
  - `/history` `/h` —— 恢复近期历史会话
  - `/model` `/m` —— 切换全局默认 AI 模型
  - `/think` —— 开启/关闭在飞书卡片中实时显示 AI 思考过程（`thinking`）与工具执行步骤
  - `/usage` `/u` —— 查询模型配额与本地用量统计
  - `/help` `/?` —— 查看指令帮助
- **多机器人隔离**：支持「全局调度机器人」+「工作区专属机器人」，也可在 Web 控制台「飞书配置」面板一键开关思考过程展示。

### 3. Windows 与 Antigravity 2.0 深度适配
- **自动进程发现**：Windows 下通过 WMI/PowerShell 精确发现 `language_server.exe` 并探活端口与 CSRF Token（macOS/Linux 保持 `ps` + `lsof`）。
- **项目归属一致**：创建会话时自动匹配 Antigravity `ListProjects` / `ReadProjects` 并通过 `projectEnvConfig.projectId` 绑定，让飞书与 Web 端新建会话在桌面端直接归入对应 **Projects**。
- **跨平台路径与工具链**：统一规范化 Windows 盘符 URI 与 UTF-8 中文路径，兼容 `tar` / PowerShell `Expand-Archive` 解压技能与系统默认编辑器打开。

---

## 快速安装与运行

### 环境要求
- 已安装并登录 [Antigravity](https://antigravity.dev) 桌面端
- **Node.js ≥ 22.5**（推荐 Node 24，内置 `node:sqlite` 读取会话索引）
- *(可选)* Python 3.10+（用于飞书扫码一键配置脚本）

### Windows 启动步骤

```powershell
git clone https://github.com/mofan651-rgb/Antigravity-Everywhere-win11-.git
cd Antigravity-Everywhere-win11-
npm install
```

- **开发模式运行**：
  ```powershell
  npm run dev
  ```
- **生产模式运行（推荐，更稳定）**：
  ```powershell
  npm run build
  .\start-gateway.cmd
  ```
  > 启动后访问 **http://localhost:3000**，控制台日志默认输出至 `logs/gateway-console.log` 与 `logs/system.*.log`。

### macOS / Linux 启动

```bash
git clone https://github.com/mofan651-rgb/Antigravity-Everywhere-win11-.git
cd Antigravity-Everywhere-win11-
npm install
npm run dev
```

---

## 飞书机器人配置（推荐扫码一键接入）

### 方式一：终端扫码一键创建并授权（推荐）

无需手动去飞书开放平台逐项点权限，运行内置脚本即可完成建应用、授权和写入配置：

```powershell
pip install lark-oapi qrcode
python scripts/feishu-qr-setup.py
```

1. 终端会输出二维码，使用手机 **飞书 / Lark** 扫码确认创建应用。
2. 脚本会自动把 `appId` 和 `appSecret` 写入 `~/.gemini/antigravity/feishu-config.json`。
3. 打开 Web 控制台 `http://localhost:3000` → 底部 **「飞书配置」** → 点击 **「保存并连接」**（或重启 Gateway）即可在飞书直接对话。

### 方式二：手动填入已有自建应用

1. 在 [飞书开放平台](https://open.feishu.cn) 创建企业自建应用，开启机器人能力与 **长连接（WebSocket）** 事件订阅（`im.message.receive_v1`）。
2. 在 Web 控制台 **「飞书配置」** 中填入 `App ID` 与 `App Secret`，点击 **「保存并连接」**。

---

## 常见问题与更新

- **更新代码**：
  ```powershell
  git pull origin main
  npm install
  npm run build
  ```
- **远程访问 Web 控制台（可选）**：如需在手机浏览器直接访问本机控制台，可安装 `cloudflared`（Windows 可用 `winget install --id Cloudflare.cloudflared`）并在面板的 **「内网穿透」** 中配置 Cloudflare Named Tunnel；若仅使用飞书控制则无需开启。

---

<div align="center">
  <sub>Forked from <a href="https://github.com/Truthan49/Antigravity-Everywhere">Truthan49/Antigravity-Everywhere</a> · MIT License</sub>
</div>
