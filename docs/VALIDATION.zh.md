# 0.2.0 验证记录

验证日期：2026-10-19（Australia/Sydney）。兼容目标为 DeepSeek Harness 0.2.1-rc.2；本机 Node.js 24.20.0、pnpm 12.11.2。

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 冻结 lockfile 安装、类型检查、构建 | 通过 | `pnpm install --frozen-lockfile`、`pnpm run typecheck`、`pnpm run build` |
| 离线测试 | 通过 | smoke、凭据迁移、OAuth lifecycle、本地 HTTP MCP 与真实 DSH ToolRuntime |
| 独立 tarball 安装 | 通过 | 官方 Desktop 内置 CLI、独立 DSH_HOME、安装文件不链接源码目录 |
| 客户端加载协议 | 通过 | 使用 Host 启动图提供的 revisioned URL 获取脚本；脚本注册 ID 等于 `@adenxie/dsh-vercel` |
| 停用、恢复、卸载 | 通过 | 状态端点分别返回404、200；卸载移除依赖和 bundle |
| 真实 OAuth | 通过 | 用户在新版 Desktop 面板重新授权，取得 `openid offline_access` |
| 真实刷新 | 通过 | 生产 `forceRefresh` 发起一次刷新 grant，access token 和 refresh token 均轮换并保存 |
| 真实项目查询 | 通过 | 生产桥接经 DSH ToolRuntime 执行 `mcp__adenxie_vercel__list_projects`，得到成功结果 |
| 真实连接释放及重启 | 通过 | 动态工具注销后数量为0；重连恢复237项，再次查询项目成功 |
| 技能加载 | 通过 | 生产加载器列举34项并成功读取全部34个主文件；helper 定义由离线测试覆盖 |
| 凭据泄漏检查 | 通过 | 发布候选文件不包含本机当前或旧 OAuth access/refresh token、client secret |

真实目录中的237项均有 annotations 和发现阶段 `_meta`。本次真实项目查询没有响应 `_meta`；响应元数据、独立 structuredContent 和 MCP 错误的保真由本地服务测试验证。

真实连接重启由验证程序主动释放并重新建立，不等同于真实网络故障后的自动恢复；自动恢复由本地故障服务测试覆盖。34个技能可以按需读取，不保证模型在每个任务中都会选择正确技能。插件没有注册原生 `ctx.skills`。

未执行真实 Vercel 写入、部署、域名购买或项目转移。MCP App/widget、图片及音频的原生 UI 呈现、Vercel 专属执行门禁和自动 CLI fallback 不在此版本实现范围内。

上游 DSH 的 `--dump-config-schema` 在不安装第三方插件的基线环境也报 Loader tree carrier 错误；本项目改用普通配置组合与真实 Host 启动验证，未把该基线错误计为插件失败，也不宣称 schema dump 通过。

机器上的详细验证文件保存在被忽略的 `.upstream/validation-evidence/` 中，不随公开仓库上传。公开的工具定义快照及名称对照见本目录的 `vercel-*.snapshot.json`；其中不含项目查询的账号数据或 OAuth 凭据。
