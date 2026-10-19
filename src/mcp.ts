/**
 * dsh-vercel — MCP connection supervisor.
 *
 * Keeps the server's public tool definitions and call results as JSON values.
 * DSH's model-facing text projection intentionally excludes MCP `_meta`; it
 * remains namespaced in DSH presentation metadata for host-side consumers.
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ListToolsResultSchema, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { MCP_URL, type VercelMcpStore } from './store.ts'
import type { OAuthFlow } from './oauth.ts'
import { withVerifiedProjectScope } from './scope.ts'
import { AgentResultCache, MODEL_RESULT_CHARACTERS, RESULT_PAGE_META_KEY, type ResultPage } from './result-cache.ts'

const RawCallToolResultSchema = z.record(z.string(), z.unknown())
const MAX_PUBLIC_NAME_LENGTH = 64
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g
const HASH_LENGTH = 12
const TOOL_CALL_TIMEOUT_MS = 60_000
const GENERATION_CLOSE_TIMEOUT_MS = 5_000
const RECONNECT = { initialDelayMs: 1_000, maxDelayMs: 30_000, maxAttempts: 10 } as const
const PUBLIC_PREFIX = 'mcp__adenxie_vercel__'
const MAX_SESSION_TOOLS = 4
const MAX_SESSION_SCHEMA_CHARS = 32_000
const MAX_SEARCH_RESULTS = 8
const MAX_SEARCH_QUERY = 120
const MAX_SEARCH_DESCRIPTION = 180
type JsonData = null | boolean | number | string | JsonData[] | { [key: string]: JsonData }

interface AgentToolAccess {
  loaded: Set<string>
  disposeRestriction?: () => void
  disposeGuard: () => void
}

export interface McpToolSearchResult {
  name: string
  title?: string
  description: string
}

export interface McpToolCatalogEntry {
  rawName: string
  publicName: string
  title?: string
  description?: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
  execution?: Record<string, unknown>
  _meta?: Record<string, unknown>
  icons?: Array<Record<string, unknown>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Convert data received through JSON-RPC into a detached, JSON-safe value. */
function jsonCopy<T>(value: T): T {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new TypeError('MCP value is not JSON-serializable')
  return JSON.parse(serialized) as T
}

function jsonDataCopy(value: unknown): JsonData {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new TypeError('MCP metadata is not JSON-serializable')
  return JSON.parse(serialized) as JsonData
}

/** Derive the DSH public name. Lossy/long mappings get a stable identity suffix. */
export function mapPublicToolName(rawName: string): string {
  const joined = `${PUBLIC_PREFIX}${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`adenxie-vercel\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}

function copyToolDefinition(tool: McpTool): McpTool {
  return jsonCopy(tool)
}

function modelSchemaCharacters(entry: McpToolCatalogEntry): number {
  return JSON.stringify({ name: entry.publicName, description: entry.description ?? '', parameters: entry.inputSchema }).length
}

function renderMcpContent(content: unknown, structuredContent: unknown): Array<{ type: 'text'; text: string }> {
  const blocks = Array.isArray(content) ? content : []
  const rendered: Array<{ type: 'text'; text: string }> = []
  let hasText = false
  for (const value of blocks) {
    if (!isRecord(value)) continue
    if (value.type === 'text' && typeof value.text === 'string') {
      hasText = true
      rendered.push({ type: 'text', text: value.text })
    } else if (typeof value.type === 'string') {
      // Preserve non-text blocks in the structured result and signal their presence.
      rendered.push({ type: 'text', text: `[MCP ${value.type} content retained in structured result]` })
    }
  }
  if (!hasText && isRecord(structuredContent)) {
    rendered.push({ type: 'text', text: JSON.stringify(structuredContent) })
  }
  return rendered
}

function renderedMcpText(content: unknown, structuredContent: unknown): string {
  return renderMcpContent(content, structuredContent).map((block) => block.text).join('\n')
}

function resultPageMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value._meta) || !isRecord(value._meta[RESULT_PAGE_META_KEY])) return undefined
  return value._meta[RESULT_PAGE_META_KEY] as Record<string, unknown>
}

function renderMcpResult(value: unknown): Array<{ type: 'text'; text: string }> {
  const result = isRecord(value) ? value : {}
  const page = resultPageMetadata(result)
  const blocks = renderMcpContent(result.content, result.structuredContent)
  if (page === undefined || blocks.length === 0) return blocks
  const fullText = blocks.map((block) => block.text).join('\n')
  if (fullText.length <= MODEL_RESULT_CHARACTERS) return blocks
  const snippet = fullText.slice(0, MODEL_RESULT_CHARACTERS)
  if (typeof page.resultId === 'string' && typeof page.nextOffset === 'number') {
    return [{ type: 'text', text: `${snippet}\n\n[结果已截断，共 ${String(page.totalCharacters)} 字符。调用 adenxie_vercel_mcp_read_result({resultId:"${page.resultId}", offset:${page.nextOffset}, limit:12000}) 继续读取。]` }]
  }
  return [{ type: 'text', text: `${snippet}\n\n[结果共 ${String(page.totalCharacters)} 字符，当前无法续读；请缩小查询范围后重试。]` }]
}

function safeErrorKind(error: unknown): string {
  return isRecord(error) && typeof error.name === 'string' ? error.name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 48) || 'Error' : 'Error'
}

/** Map an MCP tool's protocol-level error flag into DSH's result contract. */
export function mapMcpToolError(result: ToolExecutionResult): ToolExecutionResult {
  if (result.isError || !isRecord(result.value) || result.value.isError !== true) return result
  const message = result.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n') || 'MCP server reported a tool error.'
  return {
    isError: true,
    error: { message, info: { name: 'McpToolError', code: 'MCP_TOOL_ERROR' } },
    content: result.content,
    ...(result.meta === undefined ? {} : { meta: result.meta }),
  }
}

/** Install the narrow DSH waterfall adapter that preserves MCP error status. */
export function registerMcpResultSemantics(ctx: Context): () => boolean {
  return ctx.on('tools/execute', async (exec, next) => {
    const result = await next()
    return exec.name.startsWith(PUBLIC_PREFIX) ? mapMcpToolError(result) : result
  })
}

export interface McpSupervisorOptions {
  /** Test seam for loopback protocol tests; production defaults to the Vercel endpoint. */
  serverUrl?: string
}

export interface McpSupervisor {
  start(): Promise<void>
  isConnected(): boolean
  /** Number of remote definitions currently registered in the host catalog. */
  toolCount(): number
  /** Alias that makes the catalog/session distinction explicit to UI callers. */
  availableToolCount(): number
  loadedToolCount(agent: Agent | undefined): number
  loadedSchemaCharacters(agent: Agent | undefined): number
  listTools(): Promise<string[]>
  listToolCatalog(): Promise<McpToolCatalogEntry[]>
  searchTools(agent: Agent | undefined, query: string, limit?: number): McpToolSearchResult[]
  loadTools(agent: Agent | undefined, names: string[], replace?: boolean): string[]
  unloadTools(agent: Agent | undefined, names?: string[]): string[]
  loadedTools(agent: Agent | undefined): string[]
  readResult(agent: Agent | undefined, resultId: string, offset?: number, limit?: number): ResultPage | undefined
  dispose(): Promise<void>
  shutdown(): Promise<void>
}

export function createSupervisor(
  ctx: Context,
  store: VercelMcpStore,
  flow: OAuthFlow,
  callbackUrl: string,
  options: McpSupervisorOptions = {},
): McpSupervisor {
  const label = '@adenxie/dsh-vercel'
  const serverUrl = options.serverUrl ?? MCP_URL
  let client: Client | null = null
  let clientClosed: Promise<void> | null = null
  let disposers = new Map<string, () => void>()
  let catalog: McpToolCatalogEntry[] = []
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let failedAttempts = 0
  let ready = false
  let startInFlight: Promise<void> | null = null
  let disposed = false
  let permanentlyDisposed = false
  let syncChain: Promise<unknown> = Promise.resolve()
  const agentAccess = new Map<Agent, AgentToolAccess>()
  const resultCache = new AgentResultCache()

  const isCurrent = (generation: Client): boolean => !disposed && client === generation

  function refreshAgentRestriction(agent: Agent, access: AgentToolAccess): void {
    const deny = catalog
      .map((entry) => entry.publicName)
      .filter((name) => !access.loaded.has(name))
    // Install first, then release the old restriction. The synchronous overlap
    // keeps the transition fail-closed without accumulating intersections.
    const next = deny.length === 0 ? undefined : agent.ctx.tools.restrict({ deny })
    const previous = access.disposeRestriction
    access.disposeRestriction = next
    previous?.()
  }

  function ensureAgentAccess(agent: Agent): AgentToolAccess {
    const existing = agentAccess.get(agent)
    if (existing !== undefined) return existing
    const access: AgentToolAccess = { loaded: new Set(), disposeGuard: () => {} }
    access.disposeGuard = agent.ctx.tools.guard((exec) => {
      if (!exec.name.startsWith(PUBLIC_PREFIX)) return undefined
      if (access.loaded.has(exec.name) && catalog.some((entry) => entry.publicName === exec.name)) return undefined
      return 'This Vercel MCP tool is not loaded in this agent session.'
    })
    agentAccess.set(agent, access)
    try {
      refreshAgentRestriction(agent, access)
    } catch (error) {
      access.disposeGuard()
      agentAccess.delete(agent)
      throw error
    }
    return access
  }

  function releaseAgentAccess(agent: Agent): void {
    resultCache.clear(agent)
    const access = agentAccess.get(agent)
    if (access === undefined) return
    access.disposeRestriction?.()
    access.disposeGuard()
    agentAccess.delete(agent)
  }

  function refreshAllAgentRestrictions(): void {
    const currentNames = new Set(catalog.map((entry) => entry.publicName))
    for (const [agent, access] of agentAccess) {
      let count = 0
      let characters = 0
      const bounded = new Set<string>()
      for (const name of access.loaded) {
        const entry = catalog.find((candidate) => candidate.publicName === name)
        if (!currentNames.has(name) || entry === undefined) continue
        const size = modelSchemaCharacters(entry)
        if (count >= MAX_SESSION_TOOLS || characters + size > MAX_SESSION_SCHEMA_CHARS) continue
        bounded.add(name)
        count += 1
        characters += size
      }
      if (bounded.size < access.loaded.size) {
        ctx.logger.warn(`${label}: catalog changed; ${access.loaded.size - bounded.size} session tool(s) were unloaded to stay within the schema budget`)
      }
      access.loaded = bounded
      refreshAgentRestriction(agent, access)
    }
  }

  function accessFor(agent: Agent | undefined): AgentToolAccess {
    if (agent === undefined) throw new Error('Vercel MCP tool management requires an active Agent session.')
    return ensureAgentAccess(agent)
  }

  function currentCatalog(): McpToolCatalogEntry[] {
    if (!ready || client === null) throw new Error('Vercel MCP 未连接。')
    return catalog
  }

  const disposeAgentCreated = ctx.on('agent/created', ({ agent }) => {
    ensureAgentAccess(agent)
    return undefined
  })
  const disposeAgentDisposed = ctx.on('agent/disposed', ({ agent }) => {
    releaseAgentAccess(agent)
  })
  for (const agent of ctx.agents.list()) ensureAgentAccess(agent)

  function clearRegisteredTools(): Promise<void> {
    resultCache.clear()
    const run = syncChain.then(() => {
      for (const dispose of disposers.values()) dispose()
      disposers = new Map()
      catalog = []
      refreshAllAgentRestrictions()
    })
    syncChain = run.catch(() => {})
    return run
  }

  function enqueueSync(generation: Client): Promise<void> {
    const run = syncChain.then(async () => {
      if (!isCurrent(generation)) return
      const nextCatalog = await listToolsAll(generation)
      if (!isCurrent(generation)) return
      const names = new Set<string>()
      const entries = nextCatalog.map((tool) => {
        const publicName = mapPublicToolName(tool.name)
        if (names.has(publicName)) throw new Error('MCP tool names map to a duplicate DSH name')
        names.add(publicName)
        return { tool, publicName, entry: catalogEntry(tool, publicName) }
      })

      for (const dispose of disposers.values()) dispose()
      disposers = new Map()
      catalog = []
      try {
        for (const { tool, publicName, entry } of entries) {
          const toolMetadata = {
            name: tool.name,
            publicName,
            ...(tool.title === undefined ? {} : { title: tool.title }),
            ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
            ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
            ...(tool.execution === undefined ? {} : { execution: tool.execution }),
            ...(tool._meta === undefined ? {} : { _meta: tool._meta }),
            ...(tool.icons === undefined ? {} : { icons: tool.icons }),
          }
          const definition = {
            name: publicName,
            description: tool.description ?? '',
            parameters: tool.inputSchema,
            output: {
              schema: {
                type: 'object' as const,
                additionalProperties: true,
              },
              render(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
                return renderMcpResult(value)
              },
              presentationMeta(_args: unknown, value: unknown): JsonData {
                const result = isRecord(value) ? value : {}
                const error = result.isError === true
                return jsonDataCopy({
                  source: 'mcp.vercel',
                  tool: toolMetadata,
                  result: error
                    ? result
                    : {
                        isError: false,
                        ...(result.structuredContent === undefined ? {} : { structuredContent: result.structuredContent }),
                        ...(result._meta === undefined ? {} : { _meta: result._meta }),
                      },
                })
              },
            },
            timeoutMs: TOOL_CALL_TIMEOUT_MS,
            execute: async (args: unknown, exec: { signal: AbortSignal; agent?: Agent }): Promise<unknown> => {
              if (!isCurrent(generation)) throw new Error('Vercel MCP tool is no longer connected')
              const cleanArgs = isRecord(args) ? jsonCopy(args) : {}
              const result = jsonCopy(await withVerifiedProjectScope(
                tool.name,
                cleanArgs,
                (scopedArgs) => callTool(generation, tool.name, scopedArgs, exec.signal),
                exec.signal,
              ))
              exec.signal.throwIfAborted()
              if (!isCurrent(generation)) throw new Error('Vercel MCP tool is no longer connected')
              if (!isRecord(result)) return result
              const rendered = renderedMcpText(result.content, result.structuredContent)
              if (rendered.length <= MODEL_RESULT_CHARACTERS) return result
              const resultId = exec.agent === undefined || !agentAccess.has(exec.agent)
                ? undefined
                : resultCache.put(exec.agent, rendered)
              const existingMeta = isRecord(result._meta) ? result._meta : {}
              result._meta = {
                ...existingMeta,
                [RESULT_PAGE_META_KEY]: {
                  totalCharacters: rendered.length,
                  nextOffset: MODEL_RESULT_CHARACTERS,
                  ...(resultId === undefined
                    ? { continuationUnavailable: true }
                    : { resultId }),
                },
              }
              return result
            },
          }
          disposers.set(publicName, ctx.tools.register(definition))
          catalog.push(entry)
        }
        refreshAllAgentRestrictions()
      } catch (error) {
        for (const dispose of disposers.values()) dispose()
        disposers = new Map()
        catalog = []
        for (const [agent, access] of agentAccess) {
          try { refreshAgentRestriction(agent, access) } catch { /* The scoped guard remains fail-closed. */ }
        }
        throw error
      }
    })
    syncChain = run.catch(() => {})
    return run
  }

  async function listToolsAll(generation: Client): Promise<McpTool[]> {
    const tools: McpTool[] = []
    let cursor: string | undefined
    do {
      const response = await generation.request({ method: 'tools/list', ...(cursor === undefined ? {} : { params: { cursor } }) }, ListToolsResultSchema)
      tools.push(...response.tools.map(copyToolDefinition))
      cursor = response.nextCursor
    } while (cursor !== undefined)
    const rawNames = new Set<string>()
    for (const tool of tools) {
      if (rawNames.has(tool.name)) throw new Error('MCP tools/list returned a duplicate raw tool name')
      rawNames.add(tool.name)
    }
    return tools
  }

  function catalogEntry(tool: McpTool, publicName: string): McpToolCatalogEntry {
    return jsonCopy({
      rawName: tool.name,
      publicName,
      ...(tool.title === undefined ? {} : { title: tool.title }),
      ...(tool.description === undefined ? {} : { description: tool.description }),
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
      ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
      ...(tool.execution === undefined ? {} : { execution: tool.execution }),
      ...(tool._meta === undefined ? {} : { _meta: tool._meta }),
      ...(tool.icons === undefined ? {} : { icons: tool.icons }),
    })
  }

  async function callTool(generation: Client, rawName: string, args: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
    const result = await generation.request(
      { method: 'tools/call', params: { name: rawName, arguments: args } },
      RawCallToolResultSchema,
      { signal, timeout: TOOL_CALL_TIMEOUT_MS },
    )
    return result
  }

  function generationDown(generation: Client): void {
    if (client !== generation) return
    client = null
    clientClosed = null
    ready = false
    resultCache.clear()
    void clearRegisteredTools().then(scheduleReconnect, (error) => {
      ctx.logger.error(`${label}: unable to unregister tools after disconnect (${safeErrorKind(error)})`)
      scheduleReconnect()
    })
  }

  function waitForClose(closed: Promise<void>): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), GENERATION_CLOSE_TIMEOUT_MS)
      timeout.unref()
      closed.then(() => { clearTimeout(timeout); resolve(true) })
    })
  }

  function scheduleReconnect(): void {
    if (disposed || reconnectTimer !== null) return
    if (failedAttempts >= RECONNECT.maxAttempts) {
      ctx.logger.error(`${label}: reconnect limit reached; tools unregistered. Re-authorize or restart to reconnect.`)
      return
    }
    const delayMs = Math.min(RECONNECT.maxDelayMs, RECONNECT.initialDelayMs * 2 ** failedAttempts)
    failedAttempts += 1
    ctx.logger.warn(`${label}: connection lost; retry scheduled (attempt ${failedAttempts}/${RECONNECT.maxAttempts}, ${delayMs}ms)`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void runConnection(false).catch((error) => ctx.logger.warn(`${label}: reconnect attempt failed (${safeErrorKind(error)})`))
    }, delayMs)
    reconnectTimer.unref()
  }

  async function connectGeneration(startup: boolean): Promise<void> {
    if (disposed) return
    const cfg = await store.load()
    if (disposed) return
    if (cfg.tokens === null || cfg.tokens.access_token === '') {
      ctx.logger.info(`${label}: no OAuth tokens — connection deferred until authorization completes`)
      return
    }
    const generation = new Client({ name: '@adenxie/dsh-vercel', version: '0.3.1' }, { capabilities: {} })
    let resolveClosed!: () => void
    const closed = new Promise<void>((resolve) => { resolveClosed = resolve })
    let attemptSettled = false
    let closeObserved = false
    client = generation
    clientClosed = closed
    generation.onclose = () => {
      closeObserved = true
      resolveClosed()
      if (attemptSettled) generationDown(generation)
    }
    generation.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      if (!isCurrent(generation)) return
      try { await enqueueSync(generation) }
      catch (error) { if (!disposed) ctx.logger.error(`${label}: tool re-sync failed (${safeErrorKind(error)})`) }
    })
    try {
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl), { authProvider: flow.getProvider(callbackUrl) })
      await generation.connect(transport)
      if (!isCurrent(generation) || closeObserved) {
        attemptSettled = true
        if (client === generation) generationDown(generation)
        return
      }
      await enqueueSync(generation)
      if (!isCurrent(generation) || closeObserved) {
        attemptSettled = true
        if (client === generation) generationDown(generation)
        return
      }
      ready = true
      failedAttempts = 0
    } catch (error) {
      if (startup) ctx.logger.warn(`${label}: connection attempt failed (${safeErrorKind(error)})`)
      try { await generation.close() } catch {}
      const quiesced = closeObserved || await waitForClose(closed)
      attemptSettled = true
      if (!isCurrent(generation)) return
      if (!quiesced) {
        client = null
        clientClosed = null
        await clearRegisteredTools()
        ctx.logger.error(`${label}: failed generation did not close; automatic reconnect stopped`)
        return
      }
      generationDown(generation)
      if (startup) throw error
      return
    }
    attemptSettled = true
    if (closeObserved && client === generation) generationDown(generation)
  }

  function runConnection(startup: boolean): Promise<void> {
    if (disposed || permanentlyDisposed) return Promise.resolve()
    if (ready && client !== null) return Promise.resolve()
    if (startInFlight !== null) return startInFlight
    startInFlight = connectGeneration(startup).finally(() => { startInFlight = null })
    return startInFlight
  }

  function catalogError(): never {
    throw new Error('Vercel MCP 未连接。')
  }

  function getAccess(agent: Agent | undefined): AgentToolAccess {
    if (agent === undefined) throw new Error('Vercel MCP 工具管理需要当前 Agent 会话。')
    return accessFor(agent)
  }

  function currentNames(): Set<string> {
    if (!ready || client === null) catalogError()
    return new Set(catalog.map((entry) => entry.publicName))
  }

  function parentAgents(agent: Agent): Agent[] {
    return ctx.agents.list().filter((candidate) => candidate !== agent && ctx.agents.isOwnedBy(agent.id, candidate))
  }

  return {
    async start(): Promise<void> {
      if (disposed) disposed = false
      failedAttempts = 0
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null }
      await runConnection(true)
    },
    isConnected(): boolean { return client !== null && ready },
    toolCount(): number { return disposers.size },
    availableToolCount(): number { return disposers.size },
    loadedToolCount(agent): number { return agent === undefined ? 0 : agentAccess.get(agent)?.loaded.size ?? 0 },
    loadedSchemaCharacters(agent): number {
      if (agent === undefined) return 0
      const access = agentAccess.get(agent)
      if (access === undefined) return 0
      return catalog.reduce((total, entry) => total + (access.loaded.has(entry.publicName) ? modelSchemaCharacters(entry) : 0), 0)
    },
    async listTools(): Promise<string[]> { return (await this.listToolCatalog()).map((tool) => tool.rawName) },
    async listToolCatalog(): Promise<McpToolCatalogEntry[]> {
      if (!ready || client === null) throw new Error('Vercel MCP 未连接。')
      return jsonCopy(catalog)
    },
    searchTools(agent, query, limit = MAX_SEARCH_RESULTS): McpToolSearchResult[] {
      getAccess(agent)
      const entries = currentCatalog()
      const normalize = (value: string): string => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      const normalizedQuery = normalize(query.trim().slice(0, MAX_SEARCH_QUERY))
      const terms = normalizedQuery.split(/\s+/).filter(Boolean)
      const maxResults = Math.max(1, Math.min(Math.floor(limit), MAX_SEARCH_RESULTS))
      const matches = entries.map((entry, index) => {
        const name = normalize(entry.rawName)
        const title = normalize(entry.title ?? '')
        const haystack = `${name} ${title} ${normalize(entry.description ?? '')}`
        const matched = normalize(entry.publicName) === normalizedQuery || terms.every((term) => haystack.includes(term))
        const nameMatch = terms.every((term) => name.includes(term))
        const score = normalizedQuery === '' ? 0
          : name === normalizedQuery || normalize(entry.publicName) === normalizedQuery ? 1000
          : nameMatch ? 500 + 1 / (name.length + 1)
          : title.includes(normalizedQuery) ? 300 : 100
        return { entry, index, matched, score }
      }).filter((match) => match.matched)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, maxResults).map((match) => match.entry)
      return matches.map((entry) => ({
        name: entry.publicName,
        ...(entry.title === undefined ? {} : { title: entry.title.slice(0, 100) }),
        description: (entry.description ?? '').replace(/\s+/g, ' ').slice(0, MAX_SEARCH_DESCRIPTION),
      }))
    },
    loadTools(agent, names, replace = false): string[] {
      const access = getAccess(agent)
      const available = currentNames()
      const requested = [...new Set(names)]
      if (requested.length > MAX_SESSION_TOOLS) throw new Error(`At most ${MAX_SESSION_TOOLS} Vercel MCP tools may be loaded in one session.`)
      const unknown = requested.filter((name) => !available.has(name))
      if (unknown.length > 0) throw new Error(`Unknown or unavailable Vercel MCP tool: ${unknown.slice(0, MAX_SESSION_TOOLS).join(', ')}`)
      const next = replace ? new Set<string>() : new Set(access.loaded)
      for (const name of requested) next.add(name)
      if (next.size > MAX_SESSION_TOOLS) throw new Error(`At most ${MAX_SESSION_TOOLS} Vercel MCP tools may be loaded in one session.`)
      const schemaCharacters = catalog.reduce((total, entry) => total + (next.has(entry.publicName) ? modelSchemaCharacters(entry) : 0), 0)
      if (schemaCharacters > MAX_SESSION_SCHEMA_CHARS) {
        throw new Error(`Loaded Vercel MCP schemas would use ${schemaCharacters} characters; the per-session budget is ${MAX_SESSION_SCHEMA_CHARS}. Use replace or unload first.`)
      }
      for (const parent of parentAgents(agent!)) {
        const parentAccess = agentAccess.get(parent)
        const parentLoaded = parentAccess?.loaded ?? new Set<string>()
        const deniedByParent = requested.filter((name) => !parentLoaded.has(name))
        if (deniedByParent.length > 0) {
          throw new Error(`The parent Agent must load these Vercel MCP tools first: ${deniedByParent.slice(0, MAX_SESSION_TOOLS).join(', ')}`)
        }
      }
      const previous = access.loaded
      access.loaded = next
      try { refreshAgentRestriction(agent!, access) }
      catch (error) { access.loaded = previous; throw error }
      // Install the candidate mask before checking inherited restrictions. This
      // exposes at most the bounded requested set, never the full MCP catalog.
      const hiddenByAncestor = requested.filter((name) => agent!.ctx.tools.get(name, agent) === undefined)
      if (hiddenByAncestor.length > 0) {
        access.loaded = previous
        try { refreshAgentRestriction(agent!, access) }
        catch (error) { throw new Error(`Unable to restore this session's Vercel MCP restriction: ${String(error instanceof Error ? error.message : error)}`) }
        throw new Error(`Host or parent scope restrictions hide these Vercel MCP tools; this session cannot grant them: ${hiddenByAncestor.slice(0, MAX_SESSION_TOOLS).join(', ')}`)
      }
      return [...access.loaded]
    },
    unloadTools(agent, names): string[] {
      const access = getAccess(agent)
      const removed = names === undefined ? [...access.loaded] : [...access.loaded].filter((name) => names.includes(name))
      const next = new Set([...access.loaded].filter((name) => !removed.includes(name)))
      const previous = access.loaded
      access.loaded = next
      try { refreshAgentRestriction(agent!, access) }
      catch (error) { access.loaded = previous; throw error }
      return removed
    },
    loadedTools(agent): string[] { return [...getAccess(agent).loaded] },
    readResult(agent, resultId, offset, limit): ResultPage | undefined {
      if (agent === undefined) throw new Error('续读结果需要当前 Agent 会话。')
      if (!agentAccess.has(agent)) return undefined
      return resultCache.read(agent, resultId, offset, limit)
    },
    async dispose(): Promise<void> {
      disposed = true
      resultCache.clear()
      ready = false
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null }
      const current = client
      const currentClosed = clientClosed
      client = null
      clientClosed = null
      if (current !== null) {
        try { await current.close() } catch {}
        if (currentClosed !== null && !await waitForClose(currentClosed)) {
          ctx.logger.error(`${label}: generation did not close within ${GENERATION_CLOSE_TIMEOUT_MS}ms during disposal`)
        }
      }
      if (startInFlight !== null) await startInFlight.catch(() => {})
      await syncChain
      for (const dispose of disposers.values()) dispose()
      disposers = new Map()
      catalog = []
      refreshAllAgentRestrictions()
    },
    async shutdown(): Promise<void> {
      permanentlyDisposed = true
      await this.dispose()
      disposeAgentCreated()
      disposeAgentDisposed()
      for (const agent of [...agentAccess.keys()]) releaseAgentAccess(agent)
    },
  }
}
