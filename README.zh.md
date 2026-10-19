<h1 align="center">dsh-vercel</h1>

<p align="center">
  在 DeepSeek Harness 中使用 Vercel 项目、部署与平台工具。<br>
  通过 OAuth 连接官方 MCP 服务，按需读取 Vercel 技能指导。
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.3.1-2563eb" alt="文档版本 0.3.1"></a>
  <a href="https://www.npmjs.com/package/@adenxie/dsh-vercel"><img src="https://img.shields.io/npm/v/%40adenxie%2Fdsh-vercel?logo=npm&amp;color=CB3837" alt="npm 版本"></a>
  <a href="#安装"><img src="https://img.shields.io/badge/DSH-0.2.1--rc.2-2563eb" alt="DSH 兼容目标 0.2.1-rc.2"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-22.19%2B%20or%2024%2B-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 版本范围见 package.json"></a>
  <a href="#连接-vercel"><img src="https://img.shields.io/badge/OAuth-PKCE-8b5cf6" alt="OAuth 与 PKCE 授权"></a>
  <a href="skills/vercel"><img src="https://img.shields.io/badge/Vercel_skills-34-f97316" alt="34 个 Vercel 技能"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-0f766e" alt="连接代码使用 MIT 许可"></a>
  <a href="LICENSES/VERCEL-APACHE-2.0.txt"><img src="https://img.shields.io/badge/skills-Apache_2.0-0f766e" alt="Vercel 技能使用 Apache 2.0 许可"></a>
  <a href="docs/VALIDATION-0.3.1.zh.md"><img src="https://img.shields.io/badge/status-verified-0f766e" alt="已在 Desktop 与隔离 Host 环境验证"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@adenxie/dsh-vercel"><img src="https://img.shields.io/badge/npm_%E5%AE%89%E8%A3%85-CB3837?style=for-the-badge&amp;logo=npm" alt="npm 安装"></a>
  <a href="https://github.com/AdenXie/dsh-vercel/releases/download/v0.3.1/adenxie-dsh-vercel-0.3.1.tgz"><img src="https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD_tgz-111827?style=for-the-badge&amp;logo=github" alt="下载 0.3.1 安装包"></a>
  <a href="#安装"><img src="https://img.shields.io/badge/快速开始-111827?style=for-the-badge" alt="快速开始"></a>
  <a href="#官方技能"><img src="https://img.shields.io/badge/技能指南-111827?style=for-the-badge" alt="技能指南"></a>
  <a href="docs/VERCEL_PARITY_AUDIT.zh.md"><img src="https://img.shields.io/badge/功能对比-111827?style=for-the-badge" alt="与 Codex Vercel 插件的功能对比"></a>
  <a href="#本地开发"><img src="https://img.shields.io/badge/本地开发-111827?style=for-the-badge" alt="本地开发"></a>
</p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

`@adenxie/dsh-vercel` 把 Vercel 官方 MCP 服务接入 DeepSeek Harness。登录一次 Vercel 后，模型就能查询项目、部署和团队等信息，也能按需读取随包附带的 34 个 Vercel 技能文档。当前版本是 0.3.1。

## 安装

需要 DeepSeek Harness `0.2.1-rc.2` 至 `0.2.x`，Node.js `^22.19.0 || >=24.0.0`。Desktop 和 Web 使用不同的 profile，安装时选你实际运行插件的那个。

### 从 npm 安装

先打开一次 DSH Desktop 让它初始化 profile，然后完全退出，再用 Desktop 自带的 CLI 安装：

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $DshCli plugin --profile desktop add '@adenxie/dsh-vercel@0.3.1'
```

装完重新打开 Desktop。Web profile 用 `dsh plugin --profile web add @adenxie/dsh-vercel@0.3.1`。

### 从安装包安装

从 [0.3.1 Release](https://github.com/AdenXie/dsh-vercel/releases/tag/v0.3.1) 下载 `adenxie-dsh-vercel-0.3.1.tgz`，或者在源码目录运行 `npm pack` 自己生成。同样先初始化并退出 Desktop，然后在安装包所在目录运行：

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Archive = (Resolve-Path './adenxie-dsh-vercel-0.3.1.tgz').Path
& $DshCli plugin --profile desktop add $Archive
```

其他平台用 `dsh plugin --profile web add /path/to/adenxie-dsh-vercel-0.3.1.tgz`，路径和 profile 换成你自己的。

### 从源码安装

适合开发调试，日常使用建议装 npm 包或安装包。

```powershell
git clone https://github.com/AdenXie/dsh-vercel.git
Set-Location dsh-vercel
pnpm install --frozen-lockfile
pnpm run build
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Checkout = (Get-Location).Path
& $DshCli plugin --profile desktop add "link:$Checkout"
```

其他平台用 `dsh plugin --profile web add link:/path/to/dsh-vercel`，然后重启对应的 Host。上面的示例都通过 `$env:LOCALAPPDATA` 找到 Desktop 自带的 CLI，所以系统 PATH 里不需要有 `dsh`。

## 连接 Vercel

第一次使用时运行 `adenxie_vercel_mcp_oauth_start`，在浏览器里登录并授权。连接成功后，Vercel 的 MCP 工具会以 `mcp__adenxie_vercel__*` 的名字出现。设置页可以查看连接状态、测试连接、刷新令牌或清除凭据。

授权会申请 `openid offline_access`，这样 Vercel 才会发刷新令牌。如果你是从旧版升级、旧授权里没有刷新令牌，在设置页重新授权一次即可；新授权成功之前，原来的凭据会一直保留。

手动完成授权时，`adenxie_vercel_mcp_oauth_finish` 需要完整的回调 URL（包含 `code` 和 `state`），或者同时传入这两个值。只传 code 会被拒绝，因为插件要校验 state。

## 按需加载工具

Vercel 服务端有两百多个工具，全部塞给模型会占掉大量上下文。所以每个 Agent 一开始只看到几个目录工具：先用 `adenxie_vercel_mcp_search_tools` 搜索，再把搜到的名字交给 `adenxie_vercel_mcp_load_tools`，对应的 Vercel 工具才会出现在这个 Agent 里。

- 每个 Agent 最多同时加载 4 个工具，schema 合计不超过 32000 字符。用 `mode=replace` 或 `adenxie_vercel_mcp_unload_tools` 腾出位置。
- 加载结果只对当前 Agent 生效。子 Agent 只能加载父 Agent 已经加载的工具，DSH 宿主本身的限制照常生效。
- 断线会清空已加载的工具，重连后重新搜索、加载即可。

实测 237 个工具全部加载时 schema 约 48.9 万字符，按需模式下初始只有 2986 字符（按序列化字符数计，不是 token）。

## 长结果分页

工具返回的内容超过 12000 字符时，模型先看到前 12000 字符，结构化结果里会附带一个结果 handle。用 `adenxie_vercel_mcp_read_result` 传入 `resultId` 和上一页的 `nextOffset` 就能继续往下读，每页最多 12000 字符。

缓存按 Agent 隔离，每个 Agent 最多保存 8 个结果、合计 100 万字符，超出时淘汰最旧的。Agent 销毁或 MCP 断线时缓存会清空。读不了的情况（结果太大没进缓存、handle 过期、handle 属于别的 Agent 等）工具会直接提示你缩小查询范围。

## 官方技能

包里带了 [vercel/vercel-plugin](https://github.com/vercel/vercel-plugin) 的 34 个技能，涵盖部署与 CI/CD、域名、环境变量、Functions、存储、AI SDK 等主题。模型通过 `adenxie_vercel_list_skills` 列出技能，用 `adenxie_vercel_read_skill` 读取内容。这些技能不会注册成 DSH 原生技能，什么时候去读由模型自己判断。

技能里有 CLI 命令、部署流程和自动化脚本片段，插件只负责提供内容，不会自动执行。按技能操作时，以实际可用的 `mcp__adenxie_vercel__*` 工具为准，涉及 CLI 时先核对本机 `vercel --help`。部署前先确认项目和目标环境，分清 preview 和 production。上游的 hooks、脚本运行器和 Codex 专用配置没有打包进来。

## 配置与接口

- 凭据保存在 `~/.dsh/adenxie-dsh-vercel.json`，权限 0600。可以用环境变量 `DSH_VERCEL_CONFIG` 指定其他路径。如果新文件不存在而旧版的 `~/.dsh/dsh-vercel.json` 存在，插件会把旧文件复制过来，旧文件本身不动。
- 插件的 Bundle row 和设置 ID 是 `adenxie-dsh-vercel`，设置 API 在 `/api/adenxie/dsh-vercel/` 下，本地 helper 统一用 `adenxie_vercel_*` 前缀，不会和其他 Vercel 插件冲突。
- 连接后可以从仅限本机访问的 `GET /api/adenxie/dsh-vercel/catalog` 导出完整工具目录，包括远端名、DSH 映射名、输入输出 schema、annotations 和元数据。annotations 只是服务端给的提示，不做访问控制。
- MCP 返回的 structuredContent 和 `_meta` 会保存在 DSH 的结构化结果里，`_meta` 不会作为文本发给模型。

## 限制

- 可用的工具取决于你的 Vercel 账号、团队权限和服务端当前提供的工具列表。
- Vercel 的写入和部署操作还没有实际测试过。目前实测过的是授权、令牌刷新、断线重连和项目查询这类只读操作。
- 插件没有额外的写操作审批，也不会根据 annotations 自动批准或拒绝，审批沿用 DSH 宿主的策略。
- 图片、音频等多模态内容只保存在结构化结果里，模型看到的是占位文本；远端的 MCP App/widget 界面没有嵌入。
- 和 Codex 的 Vercel 插件相比，工具目录 237 个里有 234 个同名，但功能没有完全对齐。详见[功能对比](docs/VERCEL_PARITY_AUDIT.zh.md)。

每项检查的具体做法和结果见[验证记录](docs/VALIDATION-0.3.1.zh.md)，显式团队范围下 `list_projects` 的兼容处理见[项目范围说明](docs/PROJECT_SCOPE_COMPAT.zh.md)。

## 许可与来源

我是 AdenXie，负责这个项目的开发和维护。最初的 MCP 连接层来自 [zhengjy01/dsh-vercel-mcp](https://github.com/zhengjy01/dsh-vercel-mcp)，我在它的基础上加了命名隔离、按需加载工具、长结果分页、元数据保留和若干兼容修复。原作者的 MIT 版权和许可声明保留在 [LICENSE](LICENSE) 中。

随包的 Vercel 技能来自 `vercel/vercel-plugin` 的 `137e9f44a243a939c5eaea30e4dff96aee744f64` 提交，按 Apache License 2.0 分发，许可文本和来源说明在 `LICENSES/` 目录。

## 本地开发

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm test
npm pack --dry-run
```

测试使用本地 HTTP MCP 服务和临时凭据目录，跑完自动删除，不会碰你真实的凭据文件。在线授权、真实令牌刷新和 DSH 界面测试需要已授权的环境，要单独运行。
