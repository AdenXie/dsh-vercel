# 0.4.0 验证记录

日期：2026-10-19 至 2026-10-20（Australia/Sydney）；目标宿主：DSH 0.2.1-rc.2。本版本的目标是降低上下文占用，并让会话中途加载的工具在 `deepseek-flash` 上真正可用。

## 离线测试

`pnpm typecheck`、`pnpm build`、`pnpm test` 全部通过，测试使用本地 HTTP MCP fixture、临时凭据和真实 DSH `ToolRuntime`。本版新增或扩展的检查：

- `tests/surface.mjs`：通过插件真实的 `apply` 挂载，确认初始只有 8 个辅助工具，schema 合计 2,882 字符，系统提示 400 字符；预算上限分别为 3,000 和 450 字符。
- schema 精简：237 个工具的快照逐个检查 `required` 和顶层属性名与原 schema 一致，声明总量从 485,749 字符降到 291,493 字符（少 40%），最大单个工具 5,815 字符。与 schema 关键字同名的属性（如 `title`、`example`）不会被误删。
- 超大工具折叠：`update_project` 从 24,045 字符降到 5,815 字符，`requestBody` 内 44 个字段保持展开，只折叠 6 个大字段；`describe_tool` 能按 `requestBody.<字段>` 路径返回完整结构，路径不存在时报错。
- JSON 长结果：300 条部署的 fixture 只预览 4,000 字符并附结构概要；`read_result` 用 `fields` 和条目分页返回指定字段；纯文本结果不能按字段读取。
- 加载：Vercel 原始工具名可直接加载；上限 6 个，第 7 个被拒绝。
- `adenxie_vercel_mcp_call`：宿主 `tools/pre-execute` 拒绝规则同样拦截经它发起的调用；未加载的工具被拒绝；允许时返回与直接调用相同的结果。

## 线路行为

DSH 内置 DeepSeek 适配器的模型目录里，`deepseek-flash` 声明 `toolUpdate: "addition-only"`。会话中途新加载的工具以 `defer_loading` 声明，并通过 tool-addition 消息下发；卸载或替换会让 DSH 从工具声明列表里移除该工具，提示缓存从此失效。工具说明和系统提示据此建议尽量保留已加载的工具。

## Desktop 验收

用户在 DSH Desktop 中用 `deepseek-flash` 按 6 条只读提示词测试，结果由会话日志核对：

| 步骤 | 内容 | 结果 |
| --- | --- | --- |
| 1 | `account` 查看连接状态 | 通过 |
| 2 | 按原始名加载 `list_projects` 并列出项目 | 修复前失败，修复后通过 |
| 3 | 搜索并加载 `list_deployments`，列出部署 | 修复前失败，修复后通过 |
| 4 | `describe_tool` 查看 `requestBody.framework` | 通过，未调用 `update_project` |
| 5 | `adenxie_vercel_skill` 列出并读取 `deployments-cicd` | 通过 |
| 6 | 追加加载 `get_project` 查看项目详情 | 通过，未卸载已加载的工具 |

修复前，第 2、3 步加载成功，工具也已出现在请求声明里，但模型始终没有调用，反复加载后要求用户回复“继续”。第 3 步中模型还用 shell 读取了插件凭据文件，自写脚本直连 `mcp.vercel.com`。上下文压缩之后，同一会话里的第 6 步能直接调用原生工具。

修复包括：新增 `adenxie_vercel_mcp_call` 回退通道；把“下一轮”改为“本回合下一步”；系统提示要求不读取凭据文件、不绕过插件。修复后新会话中，第 2 步在加载后的下一步用 `call` 拿到 7 个项目；第 3 步经 `search`、`load`、`describe`、`call` 拿到 4 条部署，日志中没有读取凭据或直连的操作。

第 3 步显式传 `teamId` 时，`list_deployments` 返回 403，去掉后成功。这与 0.3.1 记录的 scope 问题一致；目前只有 `list_projects` 有兼容回退。

## 上下文占用观察

Desktop 上下文面板中的“工具定义”按最近一次请求实际携带的工具 schema 估算。测试初期该项约 214K token，主要来自另一个 MCP 服务器（207 个工具，774,808 字符），dsh-vercel 自身约 2,519 字符。关闭该服务器后，每次请求的工具声明从 851,754 字符降到 77,111 字符。

## 验证边界

- 未执行任何 Vercel 写入或部署。
- 结果超过 12,000 字符时的 JSON 预览和按字段读取只由离线 fixture 覆盖；Desktop 测试中最长的部署结果为 4,040 字符，未触发截断。
- 字符数不是 token 数；未声称具体的 token 或费用节省比例。
- 系统提示中禁止读取凭据的要求只约束模型，不是强制措施；拥有本机文件和 shell 权限的 Agent 仍能读取凭据文件。
