# dsh-vercel 与 Codex Vercel 插件、Vercel App 功能对照

审计更新：2026-10-19（Australia/Sydney）。本文合并此前源码审计、真实目录导出和已完成的桥接修复。对照的是各自当前可见的工具目录与已验证行为，不把工具数量等同于功能完成度。

## 0.3.0 更新

远端完整目录仍可用，模型通过搜索、按会话加载和卸载入口取得所需定义；新会话默认不带入237项平台schema。每会话最多加载4项，合计32000字符，宿主和父Agent限制继续生效。真实生产插件验证的本插件定义JSON从全量488972字符降到初始2986字符，加载项目查询后为5655字符；这是字符口径，不是全应用token实测。显式同归属teamId项目查询的窄兼容也通过真实读取验证。详细范围见[0.3.0验证记录](VALIDATION-0.3.0.zh.md)与[显式范围兼容](PROJECT_SCOPE_COMPAT.zh.md)。下文工具目录覆盖率仍以原始名称比较，不代表逐项操作通过。

## 结论

插件已能连接 Vercel 官方 MCP，按服务器清单动态注册工具，并保留工具定义元数据、结构化结果和协议级错误。主审计任务从真实授权的 DSH 连接导出237项 `tools/list`，与 Codex 当前可见目录按规范化原始名称比较后有234项重合。这个结果是目录名称对照，不代表 schema 完全相同，也不代表工具逐项调用通过。

剩余差距集中在 MCP App/widget 和多模态内容的原生呈现、Vercel 专属执行门禁与工作流编排。Vercel 技能仍由本插件的两个 helper 按需查询和读取；本插件不使用宿主原生 `ctx.skills` 注册。一次真实重新授权和 refresh 已成功，写入、部署及端到端任务仍未验证。本版本不发布至 npm；源码与安装包见 [GitHub Release v0.2.0](https://github.com/AdenXie/dsh-vercel/releases/tag/v0.2.0)。

## 证据与目录口径

| 证据 | 观察结果 | 可以说明什么 |
| --- | --- | --- |
| 用户提供的 DSH Desktop 截图 | OAuth/MCP 连接成功；`list_projects` 读取到7个项目 | 截图中的连接和一次只读查询成功，不代表逐项覆盖 |
| 主审计任务导出的真实 DSH `tools/list` | 237项；237项有 annotations 和 `_meta`；0项有 outputSchema；145项 `readOnlyHint=true`，92项为 false | 这是授权 DSH 连接的工具定义清单，不是用户截图推测 |
| 当前 Codex 工具目录 | 235项 Vercel 工具定义 | 当前会话可见的定义数量，不代表每项执行通过 |
| 按规范化原始名称进行的目录比较 | 234项重合；DSH 独有 `authorize_team_sso`、`get_edge_config_token`、`create_record`；Codex 独有 `open_deployments` | 名称集合差异，不比较所有输入 schema 或运行语义 |
| 历史 Vercel App 截图 | 236项，显示91 write / 145 read | 该截图的 App 显示口径；与 DSH/Codex 目录来源和分类规则不同 |
| Codex 侧实际调用 | `list_teams`、`list_projects`、`get_project`、`list_deployments`、`search_vercel_documentation` 均只读成功 | 证明这些特定调用可用，不代表 DSH 端同样执行成功 |
| 真实 DSH 生命周期验证 | 一次重新授权后的 refresh 成功，access/refresh token 均轮换；namespaced `list_projects` 在显式断开/重连前后均成功；工具数从0恢复为237 | refresh 使用生产 `VercelOAuthProvider.forceRefresh`；工具调用使用真实 DSH `ToolRuntime`。这是显式重连，不是自动网络故障恢复测试 |
| 生产技能加载器验证 | `listVercelSkills` / `readVercelSkill` 导出函数列出34项技能并读取全部34个主文件 | 不是 DSH `ToolRuntime` 真实聊天调用；helper 定义由离线测试覆盖，模型选择及 Desktop 聊天触发仍待代表性测试 |
| 本地离线验证 | Typecheck、build、smoke、OAuth lifecycle、store migration、MCP bridge、pack dry-run 通过 | 这些测试用临时凭据和本地 MCP HTTP 服务；真实 refresh 结果见上一行，写入仍未验证 |

真实 DSH 工具清单及差异快照由主审计任务保存：[DSH `tools/list` 快照](vercel-dsh-tools.snapshot.json)、[名称比较快照](vercel-tools-name-comparison.snapshot.json)。名称相同不保证输入 schema、账号权限或行为相同。Vercel 也说明服务端工具集会受服务器配置、客户端支持和团队/项目授权影响，参见[工具可用性说明](https://vercel.com/docs/agent-resources/vercel-mcp/tools#tool-availability)。

Vercel App 截图、Codex 当前会话目录、真实 DSH 导出和本地离线测试是四类不同证据。本文不以它们的数量差直接推算“缺少功能数”。

## 当前实现

| 能力 | 实现状态 | 验证边界 |
| --- | --- | --- |
| OAuth / 官方 MCP | DCR、PKCE、state、回调、手动完成和凭据存储；新授权请求 `openid offline_access` | 一次真实重新授权后的 refresh 成功，access token 与 refresh token 均轮换；无 refresh token 和失败保留旧凭据由离线测试覆盖 |
| 动态工具发现 | 分页读取 `tools/list`，响应清单变化时同步注册和移除 DSH 工具 | 已有真实 DSH 目录导出；服务端可用集合会因权限而异 |
| 工具命名 | `mcp__adenxie_vercel__*` 前缀；非法字符规范化，长名以稳定哈希截断 | 离线测试覆盖长度上限、稳定性和碰撞区分；旧截图里的 `mcp__vercel__*` 是旧包名时期的证据 |
| 工具定义元数据 | 保留远端 title、description、inputSchema、outputSchema、annotations、execution、icons 和 `_meta` | 实际 DSH 目录没有 outputSchema；237项工具的发现阶段 annotations 与 `_meta` 均已保留 |
| 工具结果 | DSH canonical value 保留 MCP content、structuredContent、`_meta` 和完整结果；presentation metadata 保留工具和结果元数据 | 本次真实 `list_projects` 响应没有 `_meta`；响应 `_meta` 与 structuredContent 的保真由本地 MCP fixture 和真实 DSH `ToolRuntime` 测试覆盖；`_meta` 不作为模型文本输出 |
| 错误语义 | MCP `isError` 映射为 DSH 工具错误，同时保留完整远端结果字段 | 本地 MCP 服务与真实 DSH `ToolRuntime` 集成测试通过 |
| 生命周期 | 重复启动去重，断开时清理动态注册，退避重连；释放 supervisor 和 `ctx.effect` listener | 真实 DSH 显式断开后重连成功并重新发现237项；自动网络故障恢复仅由本地 HTTP fixture 验证 |
| 工具目录导出 | `GET /api/adenxie/dsh-vercel/catalog`，仅监听 loopback | 返回远端名、公开名、schema、annotations 和元数据 |
| 插件命名 | 包/module `@adenxie/dsh-vercel`；Bundle/Cordis/settings ID `adenxie-dsh-vercel`；客户端 ModuleLoader ID 等于 package name | 主任务在独立 DSH profile 验证真实 Host 提供 revisioned bundle、module ID 与 boot graph 一致，以及启用/停用/恢复/卸载 |
| 本地 helper | `adenxie_vercel_mcp_status`、OAuth start/finish、test/clear，以及 `adenxie_vercel_list_skills`、`adenxie_vercel_read_skill` | 不保留会与旧插件冲突的无命名空间别名 |

MCP annotations 只是服务端描述提示，不是权限控制，也不会替代部署目标或用户意图确认。

## 技能与工作流

包内有34个 Vercel 技能目录。插件提供 `adenxie_vercel_list_skills` 查询索引和 `adenxie_vercel_read_skill` 读取 Markdown 主文档及其引用文件。生产技能加载器的 `listVercelSkills` / `readVercelSkill` 导出函数已成功列出34项技能并读取全部34个主文件；helper 定义由离线测试覆盖。模型是否主动选择 helper、是否在 Desktop 聊天中正确触发，仍需代表性测试。本插件不注册 `ctx.skills` 原生 provider，也不读取上游 frontmatter 中的 `sessionStart`、`pathPatterns`、`bashPatterns`、`retrieval`、`validate` 或 `chainTo` 规则；这是用户明确选择的实现边界。

因此技能需要模型主动查找和调用。当前没有意图路由器、中文别名排序、自动多技能衔接、Vercel 工作流状态机或专门的验证触发器。技能内容可作为执行指导，但不会自动运行其 shell 命令、部署片段或 hooks。

## 尚未覆盖的能力

- **MCP App/widget：** 未读取远端 App 资源，也未嵌入部署卡片或 widget。Codex 目录存在而 DSH 清单未提供的 `open_deployments` 也不能由名称比较推断其完整 UI 行为。
- **多模态呈现：** 图片、音频等非文本块保留在结构化结果中，模型文本侧只收到“内容保留在结构化结果”的占位提示；没有原生图像、音频或资源呈现适配。
- **Vercel 专属执行门禁：** 本插件没有注册自己的 pre-execute allow/deny/ask 策略。DSH 宿主具备执行策略接口，但是否启用由宿主配置决定；annotations 不会授权或拒绝调用。
- **工具分类和筛选 UI：** 设置页提供授权、刷新、状态、测试、清除等管理操作，没有完整的工具搜索、读写分组、权限浏览或按需暴露面板。
- **CLI fallback：** 技能文本可能提及 Vercel CLI；插件没有 MCP 失败后的自动映射、登录检查、调度或重试层。CLI 和 MCP 授权独立，写入结果不确定时不应盲目重试。
- **真实账号流程：** 已验证一次真实 refresh token 轮换及显式连接重启后的只读查询。Vercel 写入、部署、回滚、自动网络故障恢复和完整多步骤工作流仍未验证。目录中出现工具不等于这些操作已被测试。

Codex Vercel 插件的 `agents/commands` 参考资料不等于运行中的独立 Agent 或可执行 slash command；本插件未复制的 hooks runtime 也不在上表按等价功能计数。Codex 技能和 MCP 的职责边界见[官方 Skills 文档](https://developers.openai.com/plugins/concepts/skills)。Vercel 部署卡片和文本降级说明见[Deployments 文档](https://vercel.com/docs/agent-resources/vercel-mcp/tools/deployments#open_deployments)。

## 发布与验证状态

`CHANGELOG.md` 将本轮整理为 `0.2.0`（2026-10-19）。主任务在独立 DSH profile 验证 scoped tarball 的 Host 启动、revisioned served-client 与 boot graph ID 一致、停用、重新启用及卸载清理；真实账号重新授权和一次 refresh 轮换、显式断开/重连后的查询也已通过。此版本不发布 npm；源码与安装包见 [GitHub Release v0.2.0](https://github.com/AdenXie/dsh-vercel/releases/tag/v0.2.0)。Vercel 写入、部署和自动网络故障恢复仍未通过真实验证。

源码定位：[插件入口](../src/index.ts)、[MCP 桥接](../src/mcp.ts)、[OAuth](../src/oauth.ts)、[路由](../src/routes.ts)、[凭据存储](../src/store.ts)。项目外的审计和验证进展记录在 `dsh-vercel-handoff.md`。
