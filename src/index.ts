/**
 * @adenxie/dsh-vercel — Vercel MCP connection for DeepSeek Harness.
 * Host half.
 *
 * Mounts the Vercel MCP server tools (https://mcp.vercel.com)
 * under `mcp__adenxie_vercel__*` once the official OAuth flow completes, the
 * /api/adenxie/dsh-vercel route family the settings panel talks to, the
 * OAuth callback route, a small set of agent-facing helper tools
 * (adenxie_vercel_*), and a system-prompt announcement. OAuth tokens live
 * in ~/.dsh/adenxie-dsh-vercel.json (mode 0600). Everything rides official
 * npm packages (@modelcontextprotocol/sdk) — no dsh source changes.
 *
 * Auth is the MCP OAuth 2.0 flow against mcp.vercel.com: dynamic
 * client registration (PKCE S256), loopback callback on the GUI's own web
 * server, refresh_token grant. See src/oauth.ts.
 */

import type { Context } from '@deepseek-ai/cordis'
import { readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool, type ToolRunContext, type ToolRuntime } from '@deepseek-ai/dsh-tools'
import { VercelMcpStore } from './store.ts'
import { OAuthFlow, parseManualCallback } from './oauth.ts'
import { createSupervisor, registerMcpResultSemantics, type McpSupervisor } from './mcp.ts'
import { makeRoutes, VERCEL_MCP_API } from './routes.ts'

/** Stable cordis plugin name. */
export const name = 'adenxie-dsh-vercel'

/** Services required before the surfaces can mount. */
export const inject = ['tools', 'systemPrompt', 'webServer', 'agents']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 161

/**
 * Model-facing announcement. Sent with every request, so it holds only the
 * routing a model cannot infer from the tool declarations; it stays static so
 * the system prompt remains a stable cache prefix.
 */
export const VERCEL_MCP_GUIDANCE =
  'Vercel（@adenxie/dsh-vercel）：用 adenxie_vercel_mcp_search_tools 搜索、adenxie_vercel_mcp_load_tools 加载，本回合下一步即可调用 mcp__adenxie_vercel__* 工具，不要等用户或重复加载；' +
  '如果工具列表里看不到已加载的工具，改用 adenxie_vercel_mcp_call 传 name 和 arguments。已加载的工具尽量保留，卸载会使提示缓存失效。' +
  '参数标注“已折叠”时用 adenxie_vercel_mcp_describe_tool。未连接时用 adenxie_vercel_mcp_account 的 login。技能用 adenxie_vercel_skill 读取，只作指导。' +
  '不要读取插件凭据文件或绕过插件直连 Vercel。写入或部署前确认项目和环境，有结果证据再报告完成。'

/** Plugin config, read from the composition row. */
export interface Config {
  /** When true (default), a system-prompt section announces the plugin. */
  announceToAgent?: boolean
  /** Master switch for the plugin (routes, tools, prompt section). */
  enabled?: boolean
}

/**
 * Mount the Vercel MCP tools, helper tools, routes, and announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt/webServer.
 * @param config - plugin config from the composition row.
 */
export function apply(ctx: Context, config?: Config): void {
  const announceToAgent = config?.announceToAgent !== false
  const enabled = config?.enabled !== false
  const store = new VercelMcpStore()
  const flow = new OAuthFlow(store)
  const callbackUrl = `http://127.0.0.1:${ctx.webServer.port}${VERCEL_MCP_API.oauthCallback}`
  const supervisor = createSupervisor(ctx, store, flow, callbackUrl)
  const context = { store, flow, supervisor, callbackUrl, tools: ctx.tools }

  let disposeTools: (() => void) | undefined
  let disposeRoutes: (() => void) | undefined
  let disposeSection: (() => void) | undefined
  let disposeMcpResultSemantics: (() => void) | undefined
  let started = false

  const sync = (): void => {
    if (disposeTools !== undefined) {
      disposeTools()
      disposeTools = undefined
    }
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (disposeMcpResultSemantics !== undefined) {
      disposeMcpResultSemantics()
      disposeMcpResultSemantics = undefined
    }
    if (!enabled) return
    disposeMcpResultSemantics = ctx.effect(
      () => registerMcpResultSemantics(ctx),
      'adenxie-dsh-vercel: MCP result semantics',
    )
    disposeTools = ctx.effect(
      () => {
        const disposers = buildTools(context).map((tool) => ctx.tools.register(tool))
        return () => { for (const dispose of disposers) dispose() }
      },
      'adenxie-dsh-vercel: tools',
    )
    disposeRoutes = ctx.effect(
      () => {
        const disposers = makeRoutes(context).map((route) => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'adenxie-dsh-vercel: routes',
    )
    if (announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:adenxie-dsh-vercel',
        order: SECTION_ORDER,
        text: VERCEL_MCP_GUIDANCE,
      })
    }
  }

  sync()

  // Preserve MCP's protocol-level tool error flag using the DSH result contract.
  // Annotations remain descriptive metadata; this listener does not grant access.
  // Auto-connect when tokens already exist (e.g. after a host restart).
  void (async () => {
    if (!enabled) return
    const view = await store.view(callbackUrl)
    if (view.authorized && !started) {
      started = true
      void supervisor.start().catch(() => {})
    }
  })()

  ctx.effect(() => {
    return () => { void supervisor.shutdown() }
  }, 'adenxie-dsh-vercel: connection')
}

/** Re-export for the settings panel's route table. */
export { VERCEL_MCP_API }

/** Re-exports for host consumers and the smoke tests. */
export { VercelMcpStore, mask, configPath, MCP_URL, type VercelMcpConfigView } from './store.ts'
export { OAuthFlow, VercelOAuthProvider, parseManualCallback, VERCEL_OAUTH_SCOPE, type PendingFlow, type RefreshOutcome } from './oauth.ts'
export { createSupervisor, mapPublicToolName, modelSchemaCharacters, registerMcpResultSemantics, type McpSupervisor, type McpToolCatalogEntry } from './mcp.ts'
export { modelParameters, slimSchema } from './schema.ts'
export { makeRoutes } from './routes.ts'
export { defineTool }

const SKILLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/vercel')

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

async function verifiedSkillsRoot(): Promise<string> {
  const packageRoot = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const expected = path.resolve(packageRoot, 'skills', 'vercel')
  const actual = await realpath(expected)
  if (!isWithin(expected, actual)) throw new Error('技能目录不能指向包外路径。')
  return expected
}

export interface VercelSkillSummary {
  name: string
  description: string
  path: string
}

function skillDescription(markdown: string, fallback: string): string {
  const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  if (frontmatter === undefined) return fallback
  const lines = frontmatter.split(/\r?\n/)
  const row = lines.findIndex((line) => /^description\s*:/.test(line))
  if (row < 0) return fallback
  const value = lines[row]!.replace(/^description\s*:\s*/, '')
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0]!
    const quoted = [value.slice(1)]
    const closes = (part: string): boolean => part.endsWith(quote) && !part.endsWith('\\' + quote)
    if (!closes(quoted[0]!)) for (const line of lines.slice(row + 1)) {
      quoted.push(line.trim())
      const tail = quoted.at(-1)!
      if (closes(tail)) break
    }
    const last = quoted.at(-1)!
    if (closes(last)) quoted[quoted.length - 1] = last.slice(0, -1)
    const combined = quoted.join(' ').trim().replace(/\s+/g, ' ')
    if (quote === "'") return combined.replaceAll("''", "'")
    try { return JSON.parse(`"${combined.replaceAll('"', '\\"')}"`) as string } catch { return combined.replaceAll('\\"', '"') }
  }
  if (value !== '|' && value !== '>' && value !== '|-' && value !== '>-') {
    return value || fallback
  }
  const body: string[] = []
  for (const line of lines.slice(row + 1)) {
    if (line.trim() !== '' && !/^\s/.test(line)) break
    body.push(line.trim())
  }
  return body.filter(Boolean).join(' ') || fallback
}

export async function listVercelSkills(query = ''): Promise<VercelSkillSummary[]> {
  const needle = query.trim().toLowerCase()
  const entries = (await readdir(await verifiedSkillsRoot(), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
  const skills = await Promise.all(entries.map(async ({ name }) => {
    const description = skillDescription(await readVercelSkill(`${name}/SKILL.md`), name)
    return { name, description, path: `${name}/SKILL.md` }
  }))
  return skills.filter((skill) => needle === '' || `${skill.name} ${skill.description}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function readVercelSkill(relativePath: string): Promise<string> {
  if (typeof relativePath !== 'string' || relativePath.trim() === '' || path.isAbsolute(relativePath)) {
    throw new Error('技能路径必须是包内相对路径。')
  }
  if (relativePath.split(/[\\/]/).includes('..')) throw new Error('技能路径不能包含目录回退段。')
  const root = await verifiedSkillsRoot()
  const candidate = path.resolve(root, relativePath)
  if (!isWithin(root, candidate) || candidate === root) throw new Error('拒绝访问技能目录之外的路径。')
  const actual = await realpath(candidate)
  if (!isWithin(root, actual)) throw new Error('拒绝通过符号链接访问技能目录之外的路径。')
  if (!actual.toLowerCase().endsWith('.md')) throw new Error('只允许读取 Markdown 技能和引用文件。')
  return readFile(actual, 'utf8')
}

/** Shared tool dependencies. */
export interface ToolContext {
  store: VercelMcpStore
  flow: OAuthFlow
  supervisor: McpSupervisor
  callbackUrl: string
  /** Host tool runtime, used to dispatch loaded tools through the full policy pipeline. */
  tools: Pick<ToolRuntime, 'execute'>
}

/** Build every agent-facing adenxie_vercel_* tool. */
function buildTools(ctx: ToolContext): ReturnType<typeof defineTool>[] {
  return [
    ...createOnDemandTools(ctx.supervisor, ctx.tools),
    vercelMcpAccountTool(ctx),
    vercelSkillTool(),
  ]
}

/** Build the bounded, agent-scoped catalog and result controls. */
export function createOnDemandTools(supervisor: McpSupervisor, tools: Pick<ToolRuntime, 'execute'>): ReturnType<typeof defineTool>[] {
  const ctx = { supervisor, tools } as ToolContext
  return [
    vercelMcpSearchToolsTool(ctx),
    vercelMcpLoadToolsTool(ctx),
    vercelMcpUnloadToolsTool(ctx),
    vercelMcpCallTool(ctx),
    vercelMcpDescribeToolTool(ctx),
    vercelMcpReadResultTool(ctx),
  ]
}

function safeSessionToolState(supervisor: McpSupervisor, agent: Agent | undefined) {
  try {
    return {
      loaded: supervisor.loadedTools(agent),
      loadedCount: supervisor.loadedToolCount(agent),
      schemaCharacters: supervisor.loadedSchemaCharacters(agent),
    }
  } catch {
    return { loaded: [], loadedCount: 0, schemaCharacters: 0 }
  }
}

/** One text content block. */
function text(value: string): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: value }]
}

function errorMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
}

const OK_MESSAGE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    ok: { type: 'boolean', required: true },
    message: { type: 'string', required: true },
  },
} as const

function vercelMcpSearchToolsTool(ctx: ToolContext) {
  return defineTool({
    name: 'adenxie_vercel_mcp_search_tools',
    description: '按名称或用途搜索 Vercel MCP 工具，返回名称和短说明（不含 schema）。',
    parameters: {
      query: { type: 'string', description: '关键词' },
      limit: { type: 'number', description: '1-8，默认5' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          tools: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
            name: { type: 'string', required: true }, title: { type: 'string' }, description: { type: 'string', required: true },
          } }, required: true },
        },
      },
      render: (_args: unknown, value: Record<string, unknown>) => {
        const lines = [String(value.message ?? '')]
        const tools = Array.isArray(value.tools) ? value.tools : []
        for (const item of tools) {
          if (typeof item !== 'object' || item === null) continue
          const entry = item as { name?: unknown; title?: unknown; description?: unknown }
          lines.push(`- ${String(entry.name ?? '')}${typeof entry.title === 'string' ? ` (${entry.title})` : ''}: ${String(entry.description ?? '').slice(0, 120)}`)
        }
        return text(lines.join('\n').slice(0, 2_400))
      },
    },
    async execute(args: { query?: string; limit?: number }, exec: { agent?: Agent }) {
      try {
        const tools = ctx.supervisor.searchTools(exec.agent, args.query ?? '', args.limit)
        return { ok: true, message: `找到 ${tools.length} 项。`, tools }
      } catch (error) {
        return { ok: false, message: errorMessage(error), tools: [] }
      }
    },
  })
}

function vercelMcpLoadToolsTool(ctx: ToolContext) {
  return defineTool({
    name: 'adenxie_vercel_mcp_load_tools',
    description: '为当前 Agent 加载 Vercel MCP 工具。成功后本回合的下一步即可直接调用，无需等待用户。每个 Agent 最多6个、schema 合计32000字符。已知名称可跳过搜索。',
    parameters: {
      names: { type: 'array', required: true, items: { type: 'string' }, description: 'mcp__adenxie_vercel__* 名称或 Vercel 原始工具名，如 list_projects' },
      mode: { type: 'string', enum: ['load', 'replace'], description: 'replace 先清空已加载集合（会使提示缓存失效）' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { ok: { type: 'boolean', required: true }, message: { type: 'string', required: true }, loaded: { type: 'array', items: { type: 'string' }, required: true }, loadedCount: { type: 'number', required: true }, schemaCharacters: { type: 'number', required: true } },
      },
      render: (_args: unknown, value: Record<string, unknown>) => {
        const names = Array.isArray(value.loaded) ? value.loaded.filter((name): name is string => typeof name === 'string').slice(0, 8) : []
        return text([String(value.message ?? ''), ...names.map((name) => `- ${name}`)].join('\n').slice(0, 1_600))
      },
    },
    async execute(args: { names: string[]; mode?: 'load' | 'replace' }, exec: { agent?: Agent }) {
      try {
        const loaded = ctx.supervisor.loadTools(exec.agent, args.names, args.mode === 'replace')
        const characters = ctx.supervisor.loadedSchemaCharacters(exec.agent)
        return { ok: true, message: `已加载 ${loaded.length} 项；schema ${characters}/32000 字符。现在就在下一步直接调用下列工具，不必再加载或等待用户：`, loaded, loadedCount: loaded.length, schemaCharacters: characters }
      } catch (error) {
        return { ok: false, message: errorMessage(error), ...safeSessionToolState(ctx.supervisor, exec.agent) }
      }
    },
  })
}

function vercelMcpUnloadToolsTool(ctx: ToolContext) {
  return defineTool({
    name: 'adenxie_vercel_mcp_unload_tools',
    description: '卸载当前 Agent 已加载的 Vercel MCP 工具；省略 names 时全部卸载。卸载会使提示缓存失效，仅在预算不足时使用。',
    parameters: { names: { type: 'array', items: { type: 'string' }, description: '要卸载的工具名' } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { ok: { type: 'boolean', required: true }, message: { type: 'string', required: true }, unloaded: { type: 'array', items: { type: 'string' }, required: true }, loadedCount: { type: 'number', required: true }, schemaCharacters: { type: 'number', required: true } },
      },
      render: (_args: unknown, value: Record<string, unknown>) => {
        const names = Array.isArray(value.unloaded) ? value.unloaded.filter((name): name is string => typeof name === 'string').slice(0, 8) : []
        return text([String(value.message ?? ''), ...names.map((name) => `- ${name}`)].join('\n').slice(0, 1_600))
      },
    },
    async execute(args: { names?: string[] }, exec: { agent?: Agent }) {
      try {
        const unloaded = ctx.supervisor.unloadTools(exec.agent, args.names)
        const characters = ctx.supervisor.loadedSchemaCharacters(exec.agent)
        const loadedCount = ctx.supervisor.loadedToolCount(exec.agent)
        return { ok: true, message: `已卸载 ${unloaded.length} 项；当前保留 ${loadedCount} 项，schema ${characters}/32000 字符。`, unloaded, loadedCount, schemaCharacters: characters }
      } catch (error) {
        const state = safeSessionToolState(ctx.supervisor, exec.agent)
        return { ok: false, message: errorMessage(error), unloaded: [], loadedCount: state.loadedCount, schemaCharacters: state.schemaCharacters }
      }
    },
  })
}

/**
 * Fallback for routes that announce mid-session tools through deferred
 * declarations the model may not treat as callable (observed on
 * deepseek-flash, addition-only). It dispatches a tool already loaded in this
 * Agent as a nested call, so host approval, guards and policies still apply to
 * the real tool name; it never reaches a tool the Agent has not loaded.
 */
function vercelMcpCallTool(ctx: ToolContext) {
  return defineTool({
    name: 'adenxie_vercel_mcp_call',
    description: '调用当前 Agent 已加载的 Vercel MCP 工具。仅当工具列表里看不到已加载的 mcp__adenxie_vercel__* 工具时使用；参数结构可用 describe_tool 查看。审批规则与直接调用相同。',
    parameters: {
      name: { type: 'string', required: true, description: '已加载的工具名' },
      arguments: { type: 'object', additionalProperties: true, description: '该工具的参数' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: Record<string, unknown>) => {
        const blocks = Array.isArray(value.content) ? value.content.filter((block): block is { type: 'text'; text: string } => typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string') : []
        return blocks.length > 0 ? blocks : text(String(value.message ?? ''))
      },
    },
    async execute(args: { name: string; arguments?: Record<string, unknown> }, exec: ToolRunContext): Promise<Record<string, string | boolean | Array<Record<string, string>>>> {
      let name: string | undefined
      try { name = ctx.supervisor.resolveLoadedTool(exec.agent, args.name) }
      catch (error) { return { ok: false, message: errorMessage(error) } }
      if (name === undefined) return { ok: false, message: `${args.name} 尚未在当前 Agent 加载；请先调用 adenxie_vercel_mcp_load_tools。` }
      const result = await ctx.tools.execute({
        // Same-process sub-dispatch: the id is a plain string at runtime; the brand is type-only.
        callId: `${exec.callId}:vercel` as ToolRunContext['callId'],
        rootCallId: exec.rootCallId,
        name,
        arguments: typeof args.arguments === 'object' && args.arguments !== null && !Array.isArray(args.arguments) ? args.arguments : {},
        ...(exec.agent === undefined ? {} : { agent: exec.agent }),
        parent: exec.token,
        signal: exec.signal,
      })
      const content = result.content.filter((block) => block.type === 'text').map((block) => ({ type: 'text', text: (block as { text: string }).text }))
      if (result.isError) return { ok: false, tool: name, message: result.error.message, content }
      return { ok: true, tool: name, message: 'ok', content }
    },
  })
}

function vercelMcpDescribeToolTool(ctx: ToolContext) {
  return defineTool({
    name: 'adenxie_vercel_mcp_describe_tool',
    description: '查看 Vercel MCP 工具的完整参数结构；用于 schema 中标注“已折叠”的属性，path 用点号逐层进入。无需先加载。',
    parameters: {
      name: { type: 'string', required: true, description: '工具名' },
      path: { type: 'string', description: '属性路径，如 build.env；省略为整个输入' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: Record<string, unknown>) => text(value.ok === true ? String(value.schema ?? '') : String(value.message ?? '')),
    },
    async execute(args: { name: string; path?: string }, exec: { agent?: Agent }) {
      try {
        const described = ctx.supervisor.describeTool(exec.agent, args.name, args.path)
        return { ok: true, message: 'ok', ...described }
      } catch (error) {
        return { ok: false, message: errorMessage(error) }
      }
    },
  })
}

function vercelMcpReadResultTool(ctx: ToolContext) {
  return defineTool({
    name: 'adenxie_vercel_mcp_read_result',
    description: '续读当前 Agent 收到的长 Vercel MCP 结果。JSON 结果可用 path/fields 只读数组条目的指定字段，此时 offset/limit 按条目计数。',
    parameters: {
      resultId: { type: 'string', required: true },
      path: { type: 'string', description: 'JSON 内数组的点号路径；默认第一个数组' },
      fields: { type: 'array', items: { type: 'string' }, description: '每个条目保留的字段，支持点号路径' },
      offset: { type: 'number', description: '起始字符或条目，默认0' },
      limit: { type: 'number', description: '字符数最多12000；条目数最多200，默认50' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: Record<string, unknown>) => {
        if (value.ok !== true || typeof value.text !== 'string') return text(String(value.message ?? '结果不存在或不可续读。'))
        const next = typeof value.nextOffset === 'number' ? String(value.nextOffset) : 'null（已读完）'
        const total = typeof value.totalItems === 'number' ? `totalItems=${String(value.totalItems)}` : `totalCharacters=${String(value.totalCharacters)}`
        return text(`${value.text}\n\n[nextOffset=${next}; ${total}]`)
      },
    },
    async execute(args: { resultId: string; path?: string; fields?: string[]; offset?: number; limit?: number }, exec: { agent?: Agent }) {
      try {
        const projected = args.path !== undefined || (args.fields !== undefined && args.fields.length > 0)
        const page = projected
          ? ctx.supervisor.projectResult(exec.agent, args.resultId, { path: args.path, fields: args.fields, offset: args.offset, limit: args.limit })
          : ctx.supervisor.readResult(exec.agent, args.resultId, args.offset, args.limit)
        if (page === undefined) {
          return { ok: false, message: '找不到此 Agent 会话中的结果，或该结果已过期；请重新运行工具并缩小查询范围。' }
        }
        return { ok: true, message: '结果页已读取。', ...page }
      } catch (error) {
        return { ok: false, message: errorMessage(error) }
      }
    },
  })
}

async function accountStatus(ctx: ToolContext, agent: Agent | undefined) {
  const view = await ctx.store.view(ctx.callbackUrl)
  const lines = [
    view.authorized ? '已授权（令牌更新于 ' + view.tokenUpdatedAt + '）' : '未授权',
    'MCP ' + (ctx.supervisor.isConnected() ? '已连接' : '未连接'),
    '目录可用工具 ' + ctx.supervisor.availableToolCount() + ' 个',
    '本会话已加载 ' + ctx.supervisor.loadedToolCount(agent) + ' 个，schema ' + ctx.supervisor.loadedSchemaCharacters(agent) + ' 字符',
    '端点 ' + view.mcpUrl,
    '配置路径 ' + view.configPath,
  ]
  return {
    ok: true,
    message: 'dsh-vercel：' + lines.join('；') + '。' + (view.authorized ? '' : '请用 action=login 开始授权。'),
    authorized: view.authorized,
    connected: ctx.supervisor.isConnected(),
    toolCount: ctx.supervisor.toolCount(),
    availableToolCount: ctx.supervisor.availableToolCount(),
    loadedToolCount: ctx.supervisor.loadedToolCount(agent),
    loadedSchemaCharacters: ctx.supervisor.loadedSchemaCharacters(agent),
    tokenUpdatedAt: view.tokenUpdatedAt,
    mcpUrl: view.mcpUrl,
    configPath: view.configPath,
  }
}

async function accountTest(ctx: ToolContext) {
  const view = await ctx.store.view(ctx.callbackUrl)
  if (!view.authorized) return { ok: false, message: '尚未授权：请用 action=login 开始授权。' }
  try {
    if (!ctx.supervisor.isConnected()) await ctx.supervisor.start()
    const tools = await ctx.supervisor.listTools()
    return {
      ok: true,
      message: '连接成功：目录共有 ' + tools.length + ' 个工具；示例：' + tools.slice(0, 8).join('、') + '。',
      tools: tools.slice(0, 8),
      availableToolCount: tools.length,
    }
  } catch (error) {
    return { ok: false, message: '测试失败：' + errorMessage(error) }
  }
}

async function accountLogin(ctx: ToolContext) {
  try {
    const { authorizeUrl } = await ctx.flow.begin(ctx.callbackUrl)
    return { ok: true, message: '请在浏览器中打开以下链接完成 Vercel 授权（登录后点击允许）：' + authorizeUrl, authorizeUrl }
  } catch (error) {
    return { ok: false, message: '开始授权失败：' + errorMessage(error) }
  }
}

async function accountFinish(ctx: ToolContext, args: { code?: string; state?: string; redirectUrl?: string }) {
  const callback = parseManualCallback(args)
  if (callback === null) return { ok: false, message: '需要完整回调 URL，或同时提供 code 和 state。' }
  const result = await ctx.flow.complete(callback.code, callback.state)
  if (result.ok) void ctx.supervisor.start().catch(() => {})
  return result
}

async function accountClear(ctx: ToolContext) {
  ctx.flow.abort()
  await ctx.supervisor.dispose()
  await ctx.store.clearAll()
  return { ok: true, message: '已清除 Vercel MCP 的全部凭据，MCP 工具已注销。' }
}

/** Connection and authorization actions, merged into one rarely used declaration. */
function vercelMcpAccountTool(ctx: ToolContext) {
  return defineTool({
    name: 'adenxie_vercel_mcp_account',
    description: 'Vercel 连接管理。status 查看状态；test 测试连接；login 返回 OAuth 授权链接；finish 用完整回调 URL 或 code+state 手动完成授权；clear 清除全部凭据（须先征得用户同意）。',
    parameters: {
      action: { type: 'string', required: true, enum: ['status', 'test', 'login', 'finish', 'clear'] },
      redirectUrl: { type: 'string', description: 'finish：完整回调 URL' },
      code: { type: 'string', description: 'finish：回调中的 code' },
      state: { type: 'string', description: 'finish：回调中的 state' },
    },
    output: {
      schema: OK_MESSAGE_SCHEMA,
      render: (_args: unknown, value: Record<string, unknown>) => text(String(value.message ?? '')),
    },
    async execute(args: { action: 'status' | 'test' | 'login' | 'finish' | 'clear'; redirectUrl?: string; code?: string; state?: string }, exec: { agent?: Agent }) {
      switch (args.action) {
        case 'status': return accountStatus(ctx, exec.agent)
        case 'test': return accountTest(ctx)
        case 'login': return accountLogin(ctx)
        case 'finish': return accountFinish(ctx, args)
        case 'clear': return accountClear(ctx)
        default: return { ok: false, message: '未知 action。' }
      }
    },
  })
}

const MAX_SKILL_LIST_DESCRIPTION = 160

/** One declaration for both listing and reading bundled skills. */
function vercelSkillTool() {
  return defineTool({
    name: 'adenxie_vercel_skill',
    description: '随包的34个官方 Vercel 技能。省略 path 列出技能（可用 query 筛选）；提供 path 读取技能或其引用文件。内容是指导，不会自动执行。',
    parameters: {
      path: { type: 'string', description: '相对技能根目录，如 vercel-cli/SKILL.md' },
      query: { type: 'string', description: '列出时的筛选词' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_a: unknown, value: Record<string, unknown>) => {
        if (typeof value.content === 'string') return text(value.content)
        const skills = Array.isArray(value.skills) ? value.skills as VercelSkillSummary[] : []
        return text(skills.map((skill) => `- ${skill.path}: ${skill.description.replace(/\s+/g, ' ').slice(0, MAX_SKILL_LIST_DESCRIPTION)}`).join('\n') || '没有匹配的技能。')
      },
    },
    async execute(args: { path?: string; query?: string }): Promise<Record<string, string | Array<Record<string, string>>>> {
      if (typeof args.path === 'string' && args.path.trim() !== '') return { content: await readVercelSkill(args.path) }
      const skills = await listVercelSkills(args.query)
      return { skills: skills.map(({ name, description, path }) => ({ name, description, path })) }
    },
  })
}
