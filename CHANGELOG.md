# Changelog

本项目的所有重要变更都记录在这里。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.3.1] - 2026-10-19

### 修复

- 工具搜索统一空格、下划线及连字符，支持多词匹配，并优先排列工具名称匹配；`list projects`与`list_projects`都能找到普通项目列表，避免被目录前部的低相关结果挤出。
- 按远端schema将`list_projects`的正安全整数`limit`转成同值字符串。修复显式teamId范围回退时数值limit触发的第二次校验失败，继续保留筛选与逐项目归属验证。此前真实测试只覆盖teamId未覆盖数值limit组合。

## [0.3.0] - 2026-10-19

### 新增

- 长MCP结果默认向模型呈现12,000字符预览，通过按Agent隔离的续读helper分页读取；完整MCP结果保留，缓存有数量和字符上限，并在销毁或断线时清理。
- Vercel MCP 远端 schema 按 Agent 按需呈现：搜索目录后加载，单 Agent 最多4项、schema 合计最多32000字符，并支持卸载和替换。Agent 之间隔离，子 Agent 受父级已加载能力约束，DSH 宿主限制保持生效。
- 将实际 MCP 工具调用纳入项目范围兼容处理，仅对符合条件的显式团队 `list_projects` 只读请求执行同归属验证回退；详见[兼容说明](docs/PROJECT_SCOPE_COMPAT.zh.md)。

### 验证

- 2026-10-19 真实生产插件与 DSH `ToolRuntime` 检查：237项工具初始不出现在 Agent schema；该插件初始 schema 为2986字符，全部工具加入时为488972字符，减少99.39%。加载、Agent 隔离、宿主限制、卸载及显式团队项目读取均通过。数字是字符数，不是 token，也不代表应用所有工具。
- `pnpm typecheck`、`pnpm build`、`pnpm test` 使用本地 HTTP MCP fixture 与临时凭据验证；未执行 Vercel 写入或部署。

## [0.2.0] - 2026-10-19

### 新增

- 增加仅限 loopback 的 Vercel MCP 工具目录导出，包含远端/本地名称映射、schemas、annotations、执行提示和元数据。
- 保留 MCP `structuredContent`、`_meta`、内容块及协议级错误，并把 MCP `isError` 转成 DSH 工具错误。非文本块保留在结构化结果中；当前不提供图片/音频或 MCP App/widget 的原生 UI 呈现。
- 新增 OAuth 刷新令牌可用状态；无 refresh token 时明确提示重新授权，不清除原凭据。

### 变更

- 发布包名改为 `@adenxie/dsh-vercel`，目标兼容 DSH `0.2.1-rc.2`。插件/Bundle row/设置 ID 使用 `adenxie-dsh-vercel`，HTTP API 使用 `/api/adenxie/dsh-vercel/`，远端工具使用 `mcp__adenxie_vercel__*`，本地 helper 使用 `adenxie_vercel_*`。
- 客户端 ModuleLoader ID 改为 scoped package name，以匹配 DSH browser module table；插件 row 和设置 section 继续使用独立 ID。
- 新凭据路径为 `~/.dsh/adenxie-dsh-vercel.json`。新路径不存在时一次性从旧 `~/.dsh/dsh-vercel.json` 复制可解析凭据；保留旧文件，且已有新文件优先。
- 新授权显式请求 `openid offline_access`。更换 OAuth 客户端注册信息与 tokens 只在授权成功后共同保存；刷新失败不丢弃旧授权。
- 修复连接断开后的动态工具清理、重连和 `ctx.effect` 监听器释放。
- 文档修订为以主审计任务从真实授权 DSH 连接导出的 237 项目录为依据；区分名称覆盖与逐项执行验证，并记录 widget/多模态、插件级执行门禁、原生 `ctx.skills` 等仍未覆盖的能力。
- 完成真实 Desktop 重新授权及一次真实 refresh：access token 和 refresh token 均成功轮换。真实 DSH `ToolRuntime` 调用 namespaced `list_projects` 成功；显式断开并重连后恢复237项工具，再次查询成功。
- 真实连接中发现的237项工具 annotations 和 `_meta` 均已保留；本次 `list_projects` 响应不含 `_meta`，响应 `_meta` 保真仍由本地 MCP fixture 验证。自动网络故障重连也仅由本地 fixture 覆盖，真实测试验证的是显式连接重启。
- 生产技能加载器导出的 `listVercelSkills` / `readVercelSkill` 成功列出34项技能并读取全部34个主文件；helper 定义由离线测试覆盖。模型在 Desktop 聊天中是否会选择并触发这些 helper，仍待代表性测试。

本次不发布 npm 包。源码与安装包见 [GitHub Release v0.2.0](https://github.com/AdenXie/dsh-vercel/releases/tag/v0.2.0)。

## [0.1.1] - 2026-09-29

### 兼容性

- 声明兼容 **DSH 0.2.0-rc.2**：`peerDependencies` 中官方 DSH 包的版本范围追加 `^0.2.0-rc.2`。功能与行为无变化，仅解除新版 DSH 下的兼容告警。

