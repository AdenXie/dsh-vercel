<h1 align="center">dsh-vercel</h1>

<p align="center">
  在 DeepSeek Harness 中使用 Vercel 项目、部署与平台工具。<br>
  通过 OAuth 连接官方 MCP 服务，按需读取 Vercel 技能指导。
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.4.0-2563eb" alt="文档版本 0.4.0"></a>
  <a href="https://www.npmjs.com/package/@adenxie/dsh-vercel"><img src="https://img.shields.io/npm/v/%40adenxie%2Fdsh-vercel?logo=npm&amp;color=CB3837" alt="npm 版本"></a>
  <a href="#安装"><img src="https://img.shields.io/badge/DSH-0.2.1--rc.2-2563eb" alt="DSH 兼容目标 0.2.1-rc.2"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-22.19%2B%20or%2024%2B-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 版本范围见 package.json"></a>
  <a href="#连接-vercel"><img src="https://img.shields.io/badge/OAuth-PKCE-8b5cf6" alt="OAuth 与 PKCE 授权"></a>
  <a href="skills/vercel"><img src="https://img.shields.io/badge/Vercel_skills-34-f97316" alt="34 个 Vercel 技能"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-0f766e" alt="连接代码使用 MIT 许可"></a>
  <a href="LICENSES/VERCEL-APACHE-2.0.txt"><img src="https://img.shields.io/badge/skills-Apache_2.0-0f766e" alt="Vercel 技能使用 Apache 2.0 许可"></a>
  <a href="docs/VALIDATION-0.4.0.zh.md"><img src="https://img.shields.io/badge/status-verified-0f766e" alt="已在 Desktop 与隔离 Host 环境验证"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@adenxie/dsh-vercel"><img src="https://img.shields.io/badge/npm_%E5%AE%89%E8%A3%85-CB3837?style=for-the-badge&amp;logo=npm" alt="npm 安装"></a>
  <a href="https://github.com/AdenXie/dsh-vercel/releases/download/v0.4.0/adenxie-dsh-vercel-0.4.0.tgz"><img src="https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD_tgz-111827?style=for-the-badge&amp;logo=github" alt="下载 0.4.0 安装包"></a>
  <a href="#安装"><img src="https://img.shields.io/badge/快速开始-111827?style=for-the-badge" alt="快速开始"></a>
  <a href="#官方技能"><img src="https://img.shields.io/badge/技能指南-111827?style=for-the-badge" alt="技能指南"></a>
  <a href="docs/VERCEL_PARITY_AUDIT.zh.md"><img src="https://img.shields.io/badge/功能对比-111827?style=for-the-badge" alt="与 Codex Vercel 插件的功能对比"></a>
  <a href="#本地开发"><img src="https://img.shields.io/badge/本地开发-111827?style=for-the-badge" alt="本地开发"></a>
</p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

`@adenxie/dsh-vercel` 把 Vercel 官方 MCP 服务接入 DeepSeek Harness。登录一次 Vercel 后，模型就能查询项目、部署和团队等信息，也能按需读取随包附带的 34 个 Vercel 技能文档。当前版本是 0.4.0。

## 安装

需要 DeepSeek Harness `0.2.1-rc.2` 至 `0.2.x`，Node.js `^22.19.0 || >=24.0.0`。Desktop 和 Web 使用不同的 profile，安装时选你实际运行插件的那个。

### 从 npm 安装

先打开一次 DSH Desktop 让它初始化 profile，然后完全退出，再用 Desktop 自带的 CLI 安装：

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $DshCli plugin --profile desktop add '@adenxie/dsh-vercel@0.4.0'
```

装完重新打开 Desktop。Web profile 用 `dsh plugin --profile web add @adenxie/dsh-vercel@0.4.0`。

### 从安装包安装

从 [0.4.0 Release](https://github.com/AdenXie/dsh-vercel/releases/tag/v0.4.0) 下载 `adenxie-dsh-vercel-0.4.0.tgz`，或者在源码目录运行 `npm pack` 自己生成。同样先初始化并退出 Desktop，然后在安装包所在目录运行：

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Archive = (Resolve-Path './adenxie-dsh-vercel-0.4.0.tgz').Path
& $DshCli plugin --profile desktop add $Archive
```

其他平台用 `dsh plugin --profile web add /path/to/adenxie-dsh-vercel-0.4.0.tgz`，路径和 profile 换成你自己的。

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

第一次使用时运行 `adenxie_vercel_mcp_account`（`action=login`），在浏览器里登录并授权。连接成功后，Vercel 的 MCP 工具会以 `mcp__adenxie_vercel__*` 的名字出现。同一个工具的 `status`、`test`、`clear` 可以查看状态、测试连接或清除凭据，设置页也能做这些操作并刷新令牌。

授权会申请 `openid offline_access`，这样 Vercel 才会发刷新令牌。如果你是从旧版升级、旧授权里没有刷新令牌，在设置页重新授权一次即可；新授权成功之前，原来的凭据会一直保留。

手动完成授权时，用 `action=finish` 并提供完整的回调 URL（包含 `code` 和 `state`），或者同时传入这两个值。只传 code 会被拒绝，因为插件要校验 state。

## 按需加载工具

Vercel 服务端有两百多个工具，全部塞给模型会占掉大量上下文。所以每个 Agent 一开始只看到 8 个辅助工具：先用 `adenxie_vercel_mcp_search_tools` 搜索，再把名字交给 `adenxie_vercel_mcp_load_tools`，对应的 Vercel 工具在下一轮出现在这个 Agent 里。已经知道 Vercel 原始工具名（如 `list_projects`）时可以直接加载，不用先搜索。

- 每个 Agent 最多同时加载 6 个工具，schema 合计不超过 32000 字符。
- 在 `deepseek-flash` 上实测，会话中途加载的工具以延迟声明的方式下发，模型有时不认为它们可调用，直到上下文压缩之后才直接调用。这时可以用 `adenxie_vercel_mcp_call` 传入 `name` 和 `arguments` 调用已加载的工具。它在 DSH 内部按真实工具名嵌套执行，审批、守卫和策略与直接调用完全一样，也调不到当前 Agent 没有加载的工具。
- 尽量不要卸载。DeepSeek 线路以 `addition-only` 方式更新工具列表：新增工具会追加在对话历史后面，提示缓存不受影响；卸载或 `mode=replace` 会重写工具列表，之后的请求都无法命中缓存。只有预算不够时才用 `adenxie_vercel_mcp_unload_tools`。
- 加载结果只对当前 Agent 生效。子 Agent 只能加载父 Agent 已经加载的工具，DSH 宿主本身的限制照常生效。
- 断线会清空已加载的工具，重连后重新搜索、加载即可。

### 精简后的 schema

声明给模型的 schema 是精简过的：去掉 `$schema`、`title`、`example(s)` 和布尔型 `additionalProperties` 这类不影响参数是否合法的标注，参数说明只保留第一层。属性名、类型、枚举、`required` 都原样保留，Vercel 服务端仍按完整 schema 校验每次调用。导出的工具目录也保持原样。

精简后仍超过 6000 字符的工具（目前 10 个，如 `update_project`、`create_deployment`），会把其中最大的几个属性折叠成只有类型和提示的占位，其余字段照常展开。模型需要折叠部分时，用 `adenxie_vercel_mcp_describe_tool` 按路径（如 `requestBody.framework`）查看完整结构，不用先加载。

按 237 个工具的快照计算，声明总量从约 48.6 万字符降到约 29.1 万字符（少 40%），最大的单个工具不超过 6000 字符，加载前的初始开销是 8 个工具共 2882 字符加 400 字符的系统提示（0.3.1 是 11 个工具 2974 字符加 871 字符）。这些都是序列化字符数，不是 token。

## 长结果分页

工具返回的内容超过 12000 字符时，结果会被截断，结构化结果里附带一个结果 handle。

- 普通文本：模型先看到前 12000 字符。用 `adenxie_vercel_mcp_read_result` 传入 `resultId` 和上一页的 `nextOffset` 继续读，每页最多 12000 字符。
- JSON（部署列表、项目列表等）：模型只看到前 4000 字符和一份结构概要，概要列出顶层字段、数组长度和数组条目里有哪些字段。之后可以只读需要的字段，例如 `read_result({resultId, path: "deployments", fields: ["uid", "state", "url"], limit: 50})`，这时 `offset`/`limit` 按条目计数，每次最多 200 条。不传 `path`/`fields` 时仍按字符续读。

缓存按 Agent 隔离，每个 Agent 最多保存 8 个结果、合计 100 万字符，超出时淘汰最旧的。Agent 销毁或 MCP 断线时缓存会清空。读不了的情况（结果太大没进缓存、handle 过期、handle 属于别的 Agent 等）工具会直接提示你缩小查询范围。

## 官方技能

包里带了 [vercel/vercel-plugin](https://github.com/vercel/vercel-plugin) 的 34 个技能，涵盖部署与 CI/CD、域名、环境变量、Functions、存储、AI SDK 等主题。模型通过 `adenxie_vercel_skill` 使用它们：不传 `path` 时列出技能（可用 `query` 筛选），传 `path` 时读取技能或引用文件。这些技能不会注册成 DSH 原生技能，什么时候去读由模型自己判断。

技能里有 CLI 命令、部署流程和自动化脚本片段，插件只负责提供内容，不会自动执行。系统提示也要求模型不要读取插件的凭据文件、不要绕过插件直连 Vercel，但这只是约束模型的提示：拥有本机文件和 shell 权限的 Agent 仍然读得到 `~/.dsh/adenxie-dsh-vercel.json`，请用 DSH 的审批策略控制这类操作。按技能操作时，以实际可用的 `mcp__adenxie_vercel__*` 工具为准，涉及 CLI 时先核对本机 `vercel --help`。部署前先确认项目和目标环境，分清 preview 和 production。上游的 hooks、脚本运行器和 Codex 专用配置没有打包进来。

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

每项检查的具体做法和结果见[验证记录](docs/VALIDATION-0.4.0.zh.md)，显式团队范围下 `list_projects` 的兼容处理见[项目范围说明](docs/PROJECT_SCOPE_COMPAT.zh.md)。

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
