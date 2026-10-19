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
  <a href="#安装"><img src="https://img.shields.io/badge/OAuth-PKCE-8b5cf6" alt="OAuth 与 PKCE 授权"></a>
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

> `@adenxie/dsh-vercel` 0.3.1。我已在 DSH Desktop 和隔离 Host 环境中完成验证，具体检查与限制见[验证记录](docs/VALIDATION-0.3.1.zh.md)。

## 安装

npm 安装包：[@adenxie/dsh-vercel](https://www.npmjs.com/package/@adenxie/dsh-vercel)。

先打开 DSH Desktop 初始化 profile，再完全退出客户端，使用自带 CLI 安装 npm 包：

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $DshCli plugin --profile desktop add '@adenxie/dsh-vercel@0.3.1'
```

完成后重新打开 Desktop。Web profile 可以使用 `dsh plugin --profile web add @adenxie/dsh-vercel@0.3.1`。

### 本地安装包或源码

从 [0.3.1 Release](https://github.com/AdenXie/dsh-vercel/releases/tag/v0.3.1) 下载 `adenxie-dsh-vercel-0.3.1.tgz`，也可以构建本地源码后运行 `npm pack` 生成。日常使用我推荐安装独立包。初始化并完全退出 Desktop 后，在安装包所在目录运行 PowerShell：

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Archive = (Resolve-Path './adenxie-dsh-vercel-0.3.1.tgz').Path
& $DshCli plugin --profile desktop add $Archive
```

安装后重新打开 Desktop。其他平台可使用 `dsh plugin --profile web add /path/to/adenxie-dsh-vercel-0.3.1.tgz`，按实际情况选择路径和 profile。也可以从源码构建：

本项目要求 DeepSeek Harness `0.2.1-rc.2` 至 `0.2.x`，Node.js `^22.19.0 || >=24.0.0`。Desktop 与 Web 使用独立 profile；请选择实际运行插件的 profile。安装本地 checkout 时先构建：

```powershell
git clone https://github.com/AdenXie/dsh-vercel.git
Set-Location dsh-vercel
pnpm install --frozen-lockfile
pnpm run build
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Checkout = (Get-Location).Path
& $DshCli plugin --profile desktop add "link:$Checkout"
```

上述命令会克隆源码、构建并链接安装本地 checkout。示例用 `$env:LOCALAPPDATA` 定位 Desktop 自带 CLI，不依赖系统 PATH 中的 `dsh`。Desktop profile 安装前需先打开 DSH Desktop 初始化 profile，再完全退出 Desktop；命令成功后重新启动 Desktop。其他平台或 Web profile 可使用已安装的 `dsh` 命令，例如 `dsh plugin --profile web add link:/path/to/dsh-vercel`，替换成本机 checkout 路径后重启对应 Host。npm 包名为 `@adenxie/dsh-vercel`。首次使用时运行 `adenxie_vercel_mcp_oauth_start`，在浏览器登录并授权；成功后 MCP 工具会以 `mcp__adenxie_vercel__*` 名称提供。新授权请求 `openid offline_access`，以便 Vercel 签发刷新令牌。旧授权若没有刷新令牌，需在设置页重新授权；新授权成功前会保留原凭据。设置页可查看状态、测试连接、刷新令牌或清除凭据。

包使用唯一 DSH Bundle row/settings ID `adenxie-dsh-vercel`；设置 API 位于 `/api/adenxie/dsh-vercel/`。客户端 ModuleLoader ID 与 scoped 包名 `@adenxie/dsh-vercel` 一致，row/settings ID 则独立。连接后可通过仅监听本机的 `GET /api/adenxie/dsh-vercel/catalog` 导出工具目录，其中包含远端名、DSH 映射名、输入/输出 schema、annotations 与元数据。Annotations 是服务端提示，不构成访问控制。MCP 的 structuredContent 与存在时的 `_meta` 会保存在 DSH 结构化结果中；`_meta` 不会作为模型文本呈现。技能仍通过 `adenxie_vercel_list_skills` / `adenxie_vercel_read_skill` 按需读取，不注册为宿主原生技能。

## 按需加载工具 schema

完整远端目录仍注册在 DSH 中，每个 Agent 初始只看到目录控制工具。先调用 `adenxie_vercel_mcp_search_tools`，再把返回的名称交给 `adenxie_vercel_mcp_load_tools`；实际 Vercel 工具只会出现在该 Agent 的模型 schema 中。每个 Agent 最多加载4项，合计 schema 上限为32000字符；可用 `mode=replace` 或 `adenxie_vercel_mcp_unload_tools` 释放预算。子 Agent 只能加载父 Agent 已加载的工具，DSH 宿主限制仍然生效。断线会清空已加载 schema，重连后重新搜索和加载即可。

长结果在模型文本中只显示前12000字符，可缓存的完整呈现文本保存在当前 Agent 的会话缓存中（最多8项、合计100万字符，超限淘汰最旧结果），结构化元数据会带有结果 handle。调用 `adenxie_vercel_mcp_read_result`，传入 `resultId` 和上一页的 `nextOffset` 续读；每页最多12000字符。handle 只属于收到结果的 Agent，会在 Agent 销毁或 MCP 断线时清除。无 Agent 的调用、超出缓存上限的结果、过期 handle 或其他 Agent 的 handle 无法续读，工具会说明需要缩小查询范围。

2026-10-19，我使用真实 DSH `ToolRuntime` 检查生产插件，发现237项 Vercel 工具。初始时本插件的模型 schema 共2986字符，而237项工具全部加入时为488972字符，schema 字符数减少99.39%。加载一项后，Agent A 可见该工具，Agent B 仍不可见；显式团队范围的 `list_projects` 调用返回7个项目，且归属验证通过。我在[项目范围兼容说明](docs/PROJECT_SCOPE_COMPAT.zh.md)中记录了这一只读兼容路径。上述数字是序列化字符数，不是 token；统计范围是本插件 schema，不含应用其他工具。

默认凭据文件为 `~/.dsh/adenxie-dsh-vercel.json`，文件权限为 0600。若该文件首次不存在，插件会将旧 `~/.dsh/dsh-vercel.json` 复制到新路径，并保留旧文件不变；已有新文件优先，不会被旧凭据覆盖。测试或自定义运行可设置 `DSH_VERCEL_CONFIG` 指向其他路径。`adenxie_vercel_mcp_oauth_finish` 只接受完整回调 URL（需包含 `code` 和 `state`），或同时提供两者；单独的 code 不会绕过 state 校验。

## 官方技能

我通过 `adenxie_vercel_list_skills` 和 `adenxie_vercel_read_skill` 两个 helper 提供按需技能读取，包内包含34个技能目录。我用生产加载器的 `listVercelSkills` / `readVercelSkill` 函数列出了全部34项技能，并读取了全部34个主文件；helper 定义也有离线测试覆盖。我在 Desktop 聊天中验证了模型搜索并读取 deployments-cicd 技能的流程；其他场景的选择仍取决于模型。技能内容是参考指导；使用前应按实际 `mcp__adenxie_vercel__*` 工具能力适配，必要时核对本机 `vercel --help`。部署时先确认项目和目标环境，区分 preview 与 production，并以可见结果验证操作。

技能中可能包含 CLI 命令、安装示例、部署流程和自动化片段。我只在插件中提供读取能力，不自动执行这些指令；是否执行应以当前请求、明确的目标和影响范围为准。包内未包含上游 hooks、脚本运行器或 Codex 专用连接配置。

## 能力与限制

- MCP 工具来自 Vercel 官方服务，实际可用项取决于授权账号、团队权限和服务端工具清单。
- 我在 2026-10-19 的 DSH Desktop 测试中完成了 OAuth 授权、MCP 连接及7个项目的只读查询。我通过已授权 DSH 连接导出的 `tools/list` 有237项；与当时的 Codex 可见目录规范化名称比较后，234项匹配、3项仅 DSH 有、1项仅 Codex 有。逐项差异见审计报告及快照；我没有逐项执行所有平台操作。
- 我验证了真实重新授权和 refresh，access token、refresh token 均成功轮换。通过真实 DSH `ToolRuntime` 调用 namespaced `list_projects`，显式断开/重连前后均成功，工具数从0恢复到237。
- 我用生产技能加载器列出了34项技能并读取全部主文件，也在 Desktop 聊天中验证了技能读取，以及“搜索 → 加载 → 原生项目查询”的代表性流程。
- 我确认真实发现清单的237项工具均保留 annotations 与 `_meta`。测试中的 `list_projects` 响应本身没有 `_meta`，因此我用本地 MCP fixture 验证了响应元数据保真。自动网络故障恢复仍仅由本地 fixture 覆盖；真实测试使用的是显式重启连接。
- 我的离线测试使用本地 MCP 服务和临时凭据，覆盖结构化结果、响应 `_meta`、协议错误、刷新失败/轮换与凭据迁移。我还没有验证 Vercel 写入和部署。
- MCP 文本块会呈现给模型；structuredContent 与 `_meta` 保留在结构化结果/展示元数据中。图片、音频和其他多模态块当前只保留于结构化结果并以占位文本提示，尚未实现对应的原生呈现；远端 MCP App/widget 也未嵌入。
- 我没有添加独立的 Vercel 写操作门禁，也不根据 annotations 自动批准或拒绝操作；执行审批沿用 DSH 宿主策略和当前请求的授权。
- 我对 npm 包、插件、路由和工具做了命名隔离。可以使用 npm 包或本地构建安装0.3.1；GitHub Release 单独维护。
- 我在独立 DSH profile 中验证了 scoped tarball 的 Host 启动、revisioned client bundle/module ID 一致、停用 404、重新启用 200 与卸载清理；OAuth refresh 另有真实测试，Vercel 写入仍未验证。
- 不承诺与 Codex 的 Vercel 插件功能完全等价。

## 许可与来源

我是 AdenXie，负责本项目的开发和维护。我基于 [zhengjy01/dsh-vercel-mcp](https://github.com/zhengjy01/dsh-vercel-mcp) 改造了初始 MCP 连接层，并在此基础上增加命名隔离、工具按需加载、长结果分页、元数据保留及兼容性修复。原作者的 MIT 版权及许可声明保留在根目录 [LICENSE](LICENSE)。

随包的 Vercel 技能来自 [vercel/vercel-plugin](https://github.com/vercel/vercel-plugin)，上游提交为 `137e9f44a243a939c5eaea30e4dff96aee744f64`，按 Apache License 2.0 分发；许可文本与来源说明见 `LICENSES/`。技能文档保留其上游内容与版权信息。

## 本地开发

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm test
npm pack --dry-run
```

我的离线测试自动创建临时凭据目录，结束后删除，不访问默认凭据文件；MCP 集成测试使用本地 HTTP 服务和真实 DSH ToolRuntime。我将在线授权、真实令牌刷新和 DSH UI 测试单独运行，这些检查需要已配置并授权的环境。
