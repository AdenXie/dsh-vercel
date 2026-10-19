import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-vercel-mcp-test-'))
process.env.DSH_VERCEL_CONFIG = path.join(temp, 'credentials.json')
const longFixtureText = 'Vercel-result-0123456789|'.repeat(1_200)
const longJsonItems = Array.from({ length: 300 }, (_, index) => ({ id: `dpl_${index}`, state: index % 2 === 0 ? 'READY' : 'ERROR', url: `fixture-${index}.vercel.app`, meta: { region: 'syd1', note: 'n'.repeat(40) } }))
const longJsonText = JSON.stringify({ deployments: longJsonItems, pagination: { count: 300 } })

function registerFixtureTools(remote) {
  let structuredCalls = 0
  remote.registerTool('structured_only', {
    title: 'Structured only',
    description: 'Returns only structured content.',
    inputSchema: z.object({}),
    outputSchema: z.object({ value: z.number() }),
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { 'fixture/ui': { display: 'kept-private' } },
  }, async () => {
    structuredCalls += 1
    return {
      content: [],
      structuredContent: { value: 42 },
      _meta: { 'fixture/result-ui': { color: 'violet' } },
    }
  })
  remote.registerTool('error_result', {
    title: 'Error result',
    description: 'Returns an MCP protocol-level error.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: false },
    _meta: { 'fixture/ui': { display: 'error-private' } },
  }, async () => ({
    content: [{ type: 'text', text: 'fixture operation failed' }],
    structuredContent: { errorCode: 'FIXTURE_FAILURE' },
    _meta: { 'fixture/result-ui': { marker: 'not-model-text' } },
    isError: true,
  }))
  remote.registerTool('empty_result', {
    description: 'Returns an intentionally empty success.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => ({ content: [] }))
  remote.registerTool('long_result', {
    description: 'Returns a long text result for paging checks.',
    inputSchema: z.object({}),
    _meta: { 'fixture/tool-private': 'tool metadata must stay out of model text' },
  }, async () => ({
    content: [{ type: 'text', text: longFixtureText }],
    _meta: { 'fixture/result-private': 'result metadata must stay out of model text' },
  }))
  remote.registerTool('tiny_four', { inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'four' }] }))
  remote.registerTool('tiny_five', { inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'five' }] }))
  remote.registerTool('oversized_schema', {
    inputSchema: z.object(Object.fromEntries(Array.from({ length: 1_600 }, (_, index) => [`p${index}`, z.string()]))),
  }, async () => ({ content: [{ type: 'text', text: 'oversized' }] }))
  remote.registerTool('json_list', {
    description: 'Returns a long JSON document for field projection checks.',
    inputSchema: z.object({}),
  }, async () => ({ content: [{ type: 'text', text: longJsonText }] }))
  return { get structuredCalls() { return structuredCalls } }
}

async function makeRemoteServer({ failToolsLists = 0, snapshotTools } = {}) {
  const sessions = new Map()
  const authorizationHeaders = []
  const http = createServer(async (req, res) => {
    authorizationHeaders.push(req.headers.authorization)
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')
    const body = raw === '' ? undefined : JSON.parse(raw)
    if (body?.method === 'initialize') {
      const remote = new McpServer({ name: 'fixture-vercel', version: '1.0.0' }, { capabilities: { tools: { listChanged: true } } })
      const fixture = registerFixtureTools(remote)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID })
      await remote.connect(transport)
      await transport.handleRequest(req, res, body)
      sessions.set(transport.sessionId, { remote, transport, fixture })
      return
    }
    const session = sessions.get(req.headers['mcp-session-id'])
    if (session === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    if (body?.method === 'tools/list' && failToolsLists > 0) {
      failToolsLists--
      res.writeHead(503)
      res.end()
      return
    }
    if (body?.method === 'tools/list' && snapshotTools !== undefined) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: snapshotTools } }))
      return
    }
    if (body?.method === 'tools/call' && snapshotTools !== undefined) {
      const name = body.params?.name
      const args = body.params?.arguments ?? {}
      const result = name === 'list_projects' && args.teamId === undefined && typeof args.limit === 'number'
        ? { content: [{ type: 'text', text: 'Input validation error: Invalid arguments for tool list_projects: teamId: Invalid input: expected string, received undefined' }], isError: true }
        : name === 'list_projects' && args.teamId !== undefined
        ? { content: [{ type: 'text', text: '403 Forbidden: You must re-authenticate to this scope.' }], isError: true }
        : name === 'list_projects'
          ? { content: [{ type: 'text', text: 'fixture project list' }], structuredContent: { projects: [{ id: 'project_fixture', accountId: 'team_fixture' }] } }
          : { content: [{ type: 'text', text: 'fixture snapshot tool call' }] }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
      return
    }
    try {
      await session.transport.handleRequest(req, res, body)
    } catch (error) {
      console.error('fixture MCP server request error:', error instanceof Error ? error.stack : String(error))
      if (!res.headersSent) res.writeHead(500)
      if (!res.writableEnded) res.end()
    }
    if (req.method === 'DELETE') sessions.delete(req.headers['mcp-session-id'])
  })
  await new Promise((resolve, reject) => {
    http.once('error', reject)
    http.listen(0, '127.0.0.1', resolve)
  })
  const address = http.address()
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    authorizationHeaders,
    close: async () => {
      await Promise.all([...sessions.values()].map(({ transport }) => transport.close().catch(() => {})))
      await new Promise((resolve) => http.close(resolve))
    },
  }
}

try {
  const { VercelMcpStore, OAuthFlow, createSupervisor, createOnDemandTools, registerMcpResultSemantics, makeRoutes, VERCEL_MCP_API, mapPublicToolName, VERCEL_MCP_GUIDANCE, modelParameters, slimSchema } = await import('../lib/index.js')
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')
  const readmeZh = await readFile(new URL('../README.zh.md', import.meta.url), 'utf8')
  assert.equal(packageJson.name, '@adenxie/dsh-vercel')
  assert.ok(VERCEL_MCP_GUIDANCE.includes('mcp__adenxie_vercel__*'))
  assert.ok(VERCEL_MCP_GUIDANCE.includes('adenxie_vercel_mcp_account'))
  assert.ok(VERCEL_MCP_GUIDANCE.length <= 450, `guidance is sent every request; keep it short (${VERCEL_MCP_GUIDANCE.length})`)
  assert.ok(readme.includes('/api/adenxie/dsh-vercel/catalog'))
  assert.ok(readmeZh.includes('mcp__adenxie_vercel__*'))
  assert.ok(readmeZh.includes('adenxie-dsh-vercel'))
  assert.equal(VERCEL_MCP_API.catalog, '/api/adenxie/dsh-vercel/catalog')
  // Slimming drops validation-neutral annotations but never property names that collide with schema keywords.
  assert.deepEqual(slimSchema({
    $schema: 'x', type: 'object', additionalProperties: false, title: 'Root', description: 'root',
    properties: {
      title: { type: 'string', description: 'kept at depth one', example: 'drop' },
      example: { type: 'object', additionalProperties: { type: 'number' }, properties: { inner: { type: 'string', description: 'nested prose' } } },
    },
    required: ['title'],
  }), {
    type: 'object', description: 'root',
    properties: {
      title: { type: 'string', description: 'kept at depth one' },
      example: { type: 'object', additionalProperties: { type: 'number' }, properties: { inner: { type: 'string' } } },
    },
    required: ['title'],
  })
  const longMapped = mapPublicToolName('x'.repeat(120))
  assert.ok(longMapped.startsWith('mcp__adenxie_vercel__'))
  assert.ok(longMapped.length <= 64)
  assert.equal(longMapped, mapPublicToolName('x'.repeat(120)))
  assert.notEqual(longMapped, mapPublicToolName('y'.repeat(120)))
  const store = new VercelMcpStore()
  await store.save({
    clientInformation: { client_id: 'fixture-client' },
    tokens: { access_token: 'fixture-access', token_type: 'Bearer' },
    tokenUpdatedAt: 'fixture-time',
    discoveryState: null,
  })
  const remote = await makeRemoteServer()
  const root = new Context()
  new SystemPrompt(root, {})
  new AgentRegistry(root)
  const ctx = root.extend({ logger: { info() {}, warn() {}, error() {} } })
  const runtime = new ToolRuntime(ctx)
  async function makeAgent(id, parent) {
    const agent = { id, session: { id } }
    const scope = createScope(parent?.ctx ?? root, agent, parent === undefined ? {} : { parent })
    agent.ctx = scope.ctx
    const detach = ctx.agents.enter(agent, parent)
    await ctx.agents.announce(agent, 'startup')
    return { agent, dispose: async () => { detach(); await scope.dispose() } }
  }
  const agentAHandle = await makeAgent('fixture-agent-a')
  const agentBHandle = await makeAgent('fixture-agent-b')
  const agentA = agentAHandle.agent
  const agentB = agentBHandle.agent
  const releaseMcpMapper = ctx.effect(() => registerMcpResultSemantics(ctx), 'test: MCP result mapping')
  const supervisor = createSupervisor(ctx, store, new OAuthFlow(store), 'http://127.0.0.1:3000/callback', { serverUrl: remote.url })
  const onDemandTools = createOnDemandTools(supervisor, runtime)
  const controlDisposers = onDemandTools.map((definition) => runtime.register(definition))

  await Promise.all([supervisor.start(), supervisor.start()])
  assert.equal(supervisor.isConnected(), true)
  assert.equal(supervisor.toolCount(), 8)
  assert.ok(remote.authorizationHeaders.some((value) => value === 'Bearer fixture-access'))
  const catalog = await supervisor.listToolCatalog()
  assert.equal(catalog.length, 8)
  const structuredDefinition = catalog.find((tool) => tool.rawName === 'structured_only')
  assert.equal(structuredDefinition.title, 'Structured only')
  assert.equal(structuredDefinition.annotations.readOnlyHint, true)
  assert.deepEqual(structuredDefinition.outputSchema.properties, { value: { type: 'number' } })
  assert.deepEqual(structuredDefinition._meta, { 'fixture/ui': { display: 'kept-private' } })
  assert.equal(structuredDefinition.publicName, 'mcp__adenxie_vercel__structured_only')

  const publicNames = (agent) => runtime.schemas(agent).map((schema) => schema.name).filter((name) => name.startsWith('mcp__adenxie_vercel__'))
  assert.deepEqual(publicNames(agentA), [])
  assert.deepEqual(publicNames(agentB), [])
  let maxVisibleDuringLoad = 0
  const stopSchemaObserver = ctx.on('tools/change', () => {
    maxVisibleDuringLoad = Math.max(maxVisibleDuringLoad, publicNames(agentA).length)
  })
  const search = await runtime.execute({
    callId: 'fixture-search', name: 'adenxie_vercel_mcp_search_tools',
    arguments: { query: 'structured_only' }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(search.isError, false)
  assert.match(search.content[0].text, /mcp__adenxie_vercel__structured_only/)
  assert.equal(search.content[0].text.includes('inputSchema'), false)
  const loaded = await runtime.execute({
    callId: 'fixture-load', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [structuredDefinition.publicName] }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(loaded.isError, false)
  assert.match(loaded.content[0].text, /mcp__adenxie_vercel__structured_only/)
  assert.deepEqual(loaded.value.loaded, [structuredDefinition.publicName])
  assert.deepEqual(publicNames(agentA), [structuredDefinition.publicName])
  assert.deepEqual(publicNames(agentB), [])
  assert.ok(maxVisibleDuringLoad <= 1, `load transiently exposed ${maxVisibleDuringLoad} catalog schemas`)

  const extraHostMask = agentA.ctx.tools.restrict({ deny: [mapPublicToolName('error_result')] })
  const hostDeniedLoad = await runtime.execute({
    callId: 'fixture-host-denied-load', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [mapPublicToolName('error_result')] }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(hostDeniedLoad.isError, false)
  assert.equal(hostDeniedLoad.value.ok, false)
  assert.match(hostDeniedLoad.value.message, /Host or parent scope restrictions/)
  assert.deepEqual(publicNames(agentA), [structuredDefinition.publicName])
  extraHostMask()

  const oversized = catalog.find((tool) => tool.rawName === 'oversized_schema')
  const overBudget = await runtime.execute({
    callId: 'fixture-over-budget', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [oversized.publicName], mode: 'replace' }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(overBudget.value.ok, false)
  assert.match(overBudget.value.message, /per-session budget is 32000/)
  assert.deepEqual(publicNames(agentA), [structuredDefinition.publicName])

  const longDefinition = catalog.find((tool) => tool.rawName === 'long_result')
  const longLoadA = await runtime.execute({
    callId: 'fixture-load-long-a', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [longDefinition.publicName] }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(longLoadA.value.ok, true)
  const longResultA = await runtime.execute({
    callId: 'fixture-long-result-a', name: longDefinition.publicName,
    arguments: {}, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(longResultA.isError, false)
  assert.equal(longResultA.value.content[0].text, longFixtureText)
  assert.equal(longResultA.value._meta['fixture/result-private'], 'result metadata must stay out of model text')
  const pageMetaA = longResultA.value._meta['dsh-vercel/result-page']
  assert.equal(pageMetaA.totalCharacters, longFixtureText.length)
  assert.equal(pageMetaA.nextOffset, 12_000)
  assert.equal(typeof pageMetaA.resultId, 'string')
  assert.ok(longResultA.content[0].text.length < longFixtureText.length)
  assert.match(longResultA.content[0].text, /结果已截断/)
  assert.match(longResultA.content[0].text, /adenxie_vercel_mcp_read_result/)
  assert.equal(longResultA.content[0].text.includes('result metadata must stay out of model text'), false)

  const agentlessLongResult = await runtime.execute({
    callId: 'fixture-long-result-agentless', name: longDefinition.publicName,
    arguments: {}, signal: new AbortController().signal,
  })
  assert.equal(agentlessLongResult.isError, false)
  assert.equal(agentlessLongResult.value._meta['dsh-vercel/result-page'].continuationUnavailable, true)
  assert.equal(agentlessLongResult.value._meta['dsh-vercel/result-page'].resultId, undefined)
  assert.match(agentlessLongResult.content[0].text, /当前无法续读；请缩小查询范围/)

  const nextPageA = await runtime.execute({
    callId: 'fixture-read-long-a', name: 'adenxie_vercel_mcp_read_result',
    arguments: { resultId: pageMetaA.resultId, offset: pageMetaA.nextOffset, limit: 12_000 },
    signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(nextPageA.value.ok, true)
  assert.equal(nextPageA.value.text, longFixtureText.slice(12_000, 24_000))
  assert.equal(nextPageA.value.nextOffset, 24_000)
  assert.match(nextPageA.content[0].text, /nextOffset=24000/)
  const finalPageA = await runtime.execute({
    callId: 'fixture-read-long-a-final', name: 'adenxie_vercel_mcp_read_result',
    arguments: { resultId: pageMetaA.resultId, offset: nextPageA.value.nextOffset },
    signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(finalPageA.value.text, longFixtureText.slice(24_000))
  assert.equal(finalPageA.value.nextOffset, null)
  const unloadLongA = await runtime.execute({
    callId: 'fixture-unload-long-a', name: 'adenxie_vercel_mcp_unload_tools',
    arguments: { names: [longDefinition.publicName] }, signal: new AbortController().signal, agent: agentA,
  })
  assert.deepEqual(unloadLongA.value.unloaded, [longDefinition.publicName])
  assert.deepEqual(publicNames(agentA), [structuredDefinition.publicName])

  const longLoadB = await runtime.execute({
    callId: 'fixture-load-long-b', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [longDefinition.publicName] }, signal: new AbortController().signal, agent: agentB,
  })
  assert.equal(longLoadB.value.ok, true)
  const crossAgentRead = await runtime.execute({
    callId: 'fixture-cross-agent-read', name: 'adenxie_vercel_mcp_read_result',
    arguments: { resultId: pageMetaA.resultId }, signal: new AbortController().signal, agent: agentB,
  })
  assert.equal(crossAgentRead.value.ok, false)
  assert.match(crossAgentRead.value.message, /结果已过期/)
  const longResultB = await runtime.execute({
    callId: 'fixture-long-result-b', name: longDefinition.publicName,
    arguments: {}, signal: new AbortController().signal, agent: agentB,
  })
  const pageMetaB = longResultB.value._meta['dsh-vercel/result-page']
  assert.equal(typeof pageMetaB.resultId, 'string')
  await agentBHandle.dispose()
  const disposedAgentRead = await runtime.execute({
    callId: 'fixture-disposed-agent-read', name: 'adenxie_vercel_mcp_read_result',
    arguments: { resultId: pageMetaB.resultId }, signal: new AbortController().signal, agent: agentB,
  })
  assert.equal(disposedAgentRead.value.ok, false)
  assert.match(disposedAgentRead.value.message, /结果已过期/)

  const childHandle = await makeAgent('fixture-agent-child', agentA)
  const childDenied = await runtime.execute({
    callId: 'fixture-child-denied', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [catalog.find((tool) => tool.rawName === 'tiny_four').publicName] },
    signal: new AbortController().signal, agent: childHandle.agent,
  })
  assert.equal(childDenied.value.ok, false)
  assert.match(childDenied.value.message, /parent Agent must load/)
  const childLoad = await runtime.execute({
    callId: 'fixture-child-load', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [structuredDefinition.publicName] }, signal: new AbortController().signal, agent: childHandle.agent,
  })
  assert.equal(childLoad.value.ok, true)
  assert.deepEqual(publicNames(childHandle.agent), [structuredDefinition.publicName])
  await childHandle.dispose()

  let denyStructured = true
  const stopPreExecute = ctx.on('tools/pre-execute', async (exec, next) => {
    if (denyStructured && exec.name === structuredDefinition.publicName) {
      return { kind: 'deny', reason: 'fixture pre-execute deny' }
    }
    return next()
  })

  // Exercise the exact generated definitions through DSH's real ToolRuntime.
  const structured = await runtime.execute({
    callId: 'fixture-structured',
    name: structuredDefinition.publicName,
    arguments: {},
    signal: new AbortController().signal,
    agent: agentA,
  })
  assert.equal(structured.isError, true)
  assert.match(structured.error.message, /fixture pre-execute deny/)
  const viaCallDenied = await runtime.execute({
    callId: 'fixture-call-denied', name: 'adenxie_vercel_mcp_call',
    arguments: { name: 'structured_only', arguments: {} }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(viaCallDenied.value.ok, false, 'the call fallback must not bypass host pre-execute policy')
  assert.match(viaCallDenied.value.message, /fixture pre-execute deny/)
  denyStructured = false
  const viaCall = await runtime.execute({
    callId: 'fixture-call-allowed', name: 'adenxie_vercel_mcp_call',
    arguments: { name: 'structured_only', arguments: {} }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(viaCall.isError, false)
  assert.equal(viaCall.value.ok, true)
  assert.equal(viaCall.value.tool, structuredDefinition.publicName)
  assert.equal(viaCall.content[0].text, '{"value":42}')
  const viaCallNotLoaded = await runtime.execute({
    callId: 'fixture-call-not-loaded', name: 'adenxie_vercel_mcp_call',
    arguments: { name: 'tiny_five', arguments: {} }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(viaCallNotLoaded.value.ok, false)
  assert.match(viaCallNotLoaded.value.message, /尚未在当前 Agent 加载/)
  const structuredAllowed = await runtime.execute({
    callId: 'fixture-structured-allowed', name: structuredDefinition.publicName,
    arguments: {}, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(structuredAllowed.isError, false)
  assert.deepEqual(structuredAllowed.value, {
    content: [], structuredContent: { value: 42 }, _meta: { 'fixture/result-ui': { color: 'violet' } },
  })
  assert.equal(structuredAllowed.content[0].text, '{"value":42}')
  assert.deepEqual(structuredAllowed.meta.tool.annotations, { readOnlyHint: true, destructiveHint: false })
  assert.deepEqual(structuredAllowed.meta.tool._meta, { 'fixture/ui': { display: 'kept-private' } })
  assert.deepEqual(structuredAllowed.meta.result._meta, { 'fixture/result-ui': { color: 'violet' } })
  assert.equal(JSON.stringify(structuredAllowed.content).includes('kept-private'), false)

  const errorDefinition = catalog.find((tool) => tool.rawName === 'error_result')
  const emptyDefinition = catalog.find((tool) => tool.rawName === 'empty_result')
  const tinyFour = catalog.find((tool) => tool.rawName === 'tiny_four')
  const tinyFive = catalog.find((tool) => tool.rawName === 'tiny_five')
  const jsonDefinition = catalog.find((tool) => tool.rawName === 'json_list')
  // Raw Vercel names are accepted alongside namespaced names, so a known tool needs no search round trip.
  const loadRemaining = await runtime.execute({
    callId: 'fixture-load-remaining', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [errorDefinition.publicName, 'empty_result', tinyFour.publicName, tinyFive.publicName, 'json_list'] }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(loadRemaining.value.ok, true)
  assert.equal(loadRemaining.value.loadedCount, 6)
  assert.ok(loadRemaining.value.loaded.includes(emptyDefinition.publicName))
  assert.ok(loadRemaining.value.loaded.includes(jsonDefinition.publicName))
  const overCount = await runtime.execute({
    callId: 'fixture-over-count', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [longDefinition.publicName] }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(overCount.value.ok, false)
  assert.match(overCount.value.message, /At most 6/)
  assert.equal(overCount.value.loadedCount, 6)

  // A long JSON result shows a short preview with an outline, then pages selected fields by item.
  const jsonResult = await runtime.execute({
    callId: 'fixture-json-result', name: jsonDefinition.publicName,
    arguments: {}, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(jsonResult.isError, false)
  const jsonPage = jsonResult.value._meta['dsh-vercel/result-page']
  assert.equal(jsonPage.nextOffset, 4_000)
  assert.match(jsonPage.outline, /deployments: array\(300\) 条目字段: id,state,url,meta/)
  assert.ok(jsonResult.content[0].text.length < 6_000, `JSON preview is ${jsonResult.content[0].text.length} characters`)
  assert.match(jsonResult.content[0].text, /fields/)
  const projected = await runtime.execute({
    callId: 'fixture-json-project', name: 'adenxie_vercel_mcp_read_result',
    arguments: { resultId: jsonPage.resultId, fields: ['id', 'state', 'meta.region'], offset: 10, limit: 3 },
    signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(projected.value.ok, true)
  assert.equal(projected.value.path, 'deployments')
  assert.equal(projected.value.totalItems, 300)
  assert.equal(projected.value.nextOffset, 13)
  assert.deepEqual(projected.value.text.split('\n').map((line) => JSON.parse(line)), [
    { id: 'dpl_10', state: 'READY', 'meta.region': 'syd1' },
    { id: 'dpl_11', state: 'ERROR', 'meta.region': 'syd1' },
    { id: 'dpl_12', state: 'READY', 'meta.region': 'syd1' },
  ])
  assert.match(projected.content[0].text, /totalItems=300/)
  const charPage = await runtime.execute({
    callId: 'fixture-json-chars', name: 'adenxie_vercel_mcp_read_result',
    arguments: { resultId: jsonPage.resultId, offset: 4_000, limit: 100 },
    signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(charPage.value.text, longJsonText.slice(4_000, 4_100))
  const textProjection = await runtime.execute({
    callId: 'fixture-text-project', name: 'adenxie_vercel_mcp_read_result',
    arguments: { resultId: pageMetaA.resultId, fields: ['id'] },
    signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(textProjection.value.ok, false)
  const errored = await runtime.execute({
    callId: 'fixture-error',
    name: errorDefinition.publicName,
    arguments: {},
    signal: new AbortController().signal,
    agent: agentA,
  })
  assert.equal(errored.isError, true)
  assert.equal(errored.error.info.code, 'MCP_TOOL_ERROR')
  assert.match(errored.error.message, /fixture operation failed/)
  assert.deepEqual(errored.meta.result.structuredContent, { errorCode: 'FIXTURE_FAILURE' })
  assert.deepEqual(errored.meta.result._meta, { 'fixture/result-ui': { marker: 'not-model-text' } })
  assert.equal(JSON.stringify(errored.content).includes('not-model-text'), false)

  const empty = await runtime.execute({
    callId: 'fixture-empty',
    name: emptyDefinition.publicName,
    arguments: {},
    signal: new AbortController().signal,
    agent: agentA,
  })
  assert.equal(empty.isError, false)
  assert.deepEqual(empty.content, [])
  const unloaded = await runtime.execute({
    callId: 'fixture-unload', name: 'adenxie_vercel_mcp_unload_tools',
    arguments: { names: [errorDefinition.publicName, emptyDefinition.publicName, tinyFour.publicName, tinyFive.publicName, jsonDefinition.publicName] }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(unloaded.isError, false)
  assert.deepEqual(unloaded.value.unloaded, [errorDefinition.publicName, emptyDefinition.publicName, tinyFour.publicName, tinyFive.publicName, jsonDefinition.publicName])
  assert.match(unloaded.content[0].text, /mcp__adenxie_vercel__error_result/)
  assert.deepEqual(publicNames(agentA), [structuredDefinition.publicName])

  // The GET export is loopback-only and returns the public definitions as JSON.
  const catalogRoute = makeRoutes({ store, flow: new OAuthFlow(store), supervisor, callbackUrl: 'http://127.0.0.1:3000/callback' })
    .find((route) => route.path === VERCEL_MCP_API.catalog)
  const response = { status: 0, headers: {}, body: '', writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = body } }
  await catalogRoute.handler({ method: 'GET', url: VERCEL_MCP_API.catalog, socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3000' } }, response)
  assert.equal(response.status, 200)
  assert.equal(JSON.parse(response.body).tools.length, 8)

  // Supervisor disposal unregisters dynamically discovered tools.
  await supervisor.dispose()
  assert.equal(supervisor.toolCount(), 0)
  assert.equal(runtime.get(structuredDefinition.publicName), undefined)
  const disconnectedRead = await runtime.execute({
    callId: 'fixture-disconnected-read', name: 'adenxie_vercel_mcp_read_result',
    arguments: { resultId: pageMetaA.resultId }, signal: new AbortController().signal, agent: agentA,
  })
  assert.equal(disconnectedRead.value.ok, false)
  assert.match(disconnectedRead.value.message, /结果已过期/)
  stopSchemaObserver()
  stopPreExecute()
  for (const dispose of controlDisposers) dispose()
  await agentAHandle.dispose()
  await agentBHandle.dispose()

  // The context-owned effect releases the exact DSH waterfall listener.
  await releaseMcpMapper()
  const afterDispose = runtime.register({
    name: 'mcp__adenxie_vercel__after_dispose',
    description: 'fixture',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: () => [] },
    async execute() { return { content: [{ type: 'text', text: 'remote failure' }], isError: true } },
  })
  const afterMapperRelease = await runtime.execute({
    callId: 'fixture-after-dispose',
    name: 'mcp__adenxie_vercel__after_dispose',
    arguments: {},
    signal: new AbortController().signal,
  })
  assert.equal(afterMapperRelease.isError, false)
  assert.equal(afterMapperRelease.value.isError, true)
  afterDispose()

  await remote.close()

  // A transient tools/list failure schedules a fresh generation and recovers.
  const flakyRemote = await makeRemoteServer({ failToolsLists: 1 })
  const reconnectSupervisor = createSupervisor(ctx, store, new OAuthFlow(store), 'http://127.0.0.1:3000/callback', { serverUrl: flakyRemote.url })
  await assert.rejects(reconnectSupervisor.start())
  assert.equal(reconnectSupervisor.toolCount(), 0)
  const reconnectDeadline = Date.now() + 7000
  while (!reconnectSupervisor.isConnected() && Date.now() < reconnectDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(reconnectSupervisor.isConnected(), true)
  assert.equal(reconnectSupervisor.toolCount(), 8)
  await reconnectSupervisor.dispose()
  await flakyRemote.close()
  await supervisor.shutdown()
  await reconnectSupervisor.shutdown()

  const snapshot = JSON.parse(await readFile(new URL('../docs/vercel-dsh-tools.snapshot.json', import.meta.url), 'utf8'))
  assert.equal(snapshot.tools.length, 237)
  const snapshotRemote = await makeRemoteServer({ snapshotTools: snapshot.tools })
  const snapshotAgentAHandle = await makeAgent('fixture-snapshot-agent-a')
  const snapshotAgentBHandle = await makeAgent('fixture-snapshot-agent-b')
  const snapshotAgentA = snapshotAgentAHandle.agent
  const snapshotAgentB = snapshotAgentBHandle.agent
  const snapshotSupervisor = createSupervisor(ctx, store, new OAuthFlow(store), 'http://127.0.0.1:3000/callback', { serverUrl: snapshotRemote.url })
  const snapshotControls = createOnDemandTools(snapshotSupervisor, runtime).map((definition) => runtime.register(definition))
  await snapshotSupervisor.start()
  assert.equal(snapshotSupervisor.toolCount(), 237)
  for (const query of ['list projects', 'list_projects', 'LIST-PROJECTS', 'projects list', mapPublicToolName('list_projects')]) {
    assert.equal(snapshotSupervisor.searchTools(snapshotAgentA, query)[0].name, mapPublicToolName('list_projects'), `name-priority search: ${query}`)
  }
  assert.ok(snapshotSupervisor.searchTools(snapshotAgentA, 'project').some(tool => tool.name === mapPublicToolName('list_projects')), 'generic project search must not bury the ordinary project listing behind catalog order')
  const allSchemaCharacters = JSON.stringify(runtime.schemas()).length
  const scopedSchemas = runtime.schemas(snapshotAgentA)
  const scopedSchemaCharacters = JSON.stringify(scopedSchemas).length
  assert.equal(scopedSchemas.filter((schema) => schema.name.startsWith('mcp__adenxie_vercel__')).length, 0)
  assert.equal(runtime.schemas(snapshotAgentB).filter((schema) => schema.name.startsWith('mcp__adenxie_vercel__')).length, 0)
  assert.ok(allSchemaCharacters > 20_000)
  assert.ok(scopedSchemaCharacters < 20_000)
  assert.ok(1 - scopedSchemaCharacters / allSchemaCharacters > 0.9)

  const updateProject = snapshot.tools.find((tool) => tool.name === 'update_project')
  const updateSearch = await runtime.execute({
    callId: 'snapshot-search-update', name: 'adenxie_vercel_mcp_search_tools',
    arguments: { query: 'update_project' }, signal: new AbortController().signal, agent: snapshotAgentA,
  })
  const updatePublicName = mapPublicToolName(updateProject.name)
  const updateName = updateSearch.content[0].text.split('\n').map((line) => line.startsWith(`- ${updatePublicName}`) ? updatePublicName : undefined)
    .find((name) => name !== undefined)
  assert.equal(updateName, updatePublicName)
  const updateLoad = await runtime.execute({
    callId: 'snapshot-load-update', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [updateName] }, signal: new AbortController().signal, agent: snapshotAgentA,
  })
  assert.equal(updateLoad.value.ok, true)
  assert.match(updateLoad.content[0].text, new RegExp(updateName))
  const rawUpdateCharacters = JSON.stringify({ name: updateName, description: updateProject.description ?? '', parameters: updateProject.inputSchema }).length
  const declaredUpdate = runtime.schemas(snapshotAgentA).find((schema) => schema.name === updateName)
  const declaredUpdateCharacters = JSON.stringify({ name: declaredUpdate.name, description: declaredUpdate.description, parameters: declaredUpdate.parameters }).length
  assert.ok(rawUpdateCharacters > 20_000)
  assert.ok(declaredUpdateCharacters < 7_000, `collapsed update_project declaration is ${declaredUpdateCharacters} characters`)
  assert.ok(Math.abs(snapshotSupervisor.loadedSchemaCharacters(snapshotAgentA) - declaredUpdateCharacters) < 200)
  assert.deepEqual(declaredUpdate.parameters.required ?? [], updateProject.inputSchema.required ?? [])
  assert.match(JSON.stringify(declaredUpdate.parameters), /adenxie_vercel_mcp_describe_tool/)
  assert.deepEqual(runtime.schemas(snapshotAgentA).filter((schema) => schema.name.startsWith('mcp__adenxie_vercel__')).map((schema) => schema.name), [updateName])
  // Collapsing descends into the requestBody wrapper, so small body fields stay inline and only large ones are folded.
  assert.ok(Object.keys(declaredUpdate.parameters.properties.requestBody.properties).length > 10)
  const collapsedProperty = JSON.stringify(declaredUpdate.parameters).match(/path:\\"([^\\"]+)\\"/)[1]
  assert.match(collapsedProperty, /^requestBody\./)
  const described = await runtime.execute({
    callId: 'snapshot-describe-update', name: 'adenxie_vercel_mcp_describe_tool',
    arguments: { name: 'update_project', path: collapsedProperty }, signal: new AbortController().signal, agent: snapshotAgentB,
  })
  assert.equal(described.value.ok, true)
  assert.ok(described.value.collapsed.includes(collapsedProperty))
  assert.ok(described.content[0].text.length > 0 && described.content[0].text.length <= 6_100)
  const describedMissing = await runtime.execute({
    callId: 'snapshot-describe-missing', name: 'adenxie_vercel_mcp_describe_tool',
    arguments: { name: 'update_project', path: 'no.such.path' }, signal: new AbortController().signal, agent: snapshotAgentB,
  })
  assert.equal(describedMissing.value.ok, false)

  // Every declared remote schema is smaller than the original and keeps its required names and property names.
  let rawTotal = 0
  let declaredTotal = 0
  for (const tool of snapshot.tools) {
    const declared = modelParameters(mapPublicToolName(tool.name), tool.description ?? '', tool.inputSchema, 'adenxie_vercel_mcp_describe_tool').parameters
    assert.deepEqual(declared.required ?? [], tool.inputSchema.required ?? [], tool.name)
    assert.deepEqual(Object.keys(declared.properties ?? {}), Object.keys(tool.inputSchema.properties ?? {}), tool.name)
    rawTotal += JSON.stringify(tool.inputSchema).length
    declaredTotal += JSON.stringify(declared).length
  }
  assert.ok(declaredTotal < rawTotal * 0.6, `declared ${declaredTotal} of raw ${rawTotal}`)
  assert.equal(runtime.schemas(snapshotAgentB).filter((schema) => schema.name.startsWith('mcp__adenxie_vercel__')).length, 0)

  const listProjects = snapshot.tools.find((tool) => tool.name === 'list_projects')
  const listSearch = await runtime.execute({
    callId: 'snapshot-search-projects', name: 'adenxie_vercel_mcp_search_tools',
    arguments: { query: 'list_projects' }, signal: new AbortController().signal, agent: snapshotAgentA,
  })
  const listPublicName = mapPublicToolName(listProjects.name)
  const listName = listSearch.content[0].text.split('\n').map((line) => line.startsWith(`- ${listPublicName}`) ? listPublicName : undefined)
    .find((name) => name !== undefined)
  assert.equal(listName, listPublicName)
  const listLoad = await runtime.execute({
    callId: 'snapshot-load-projects', name: 'adenxie_vercel_mcp_load_tools',
    arguments: { names: [listName] }, signal: new AbortController().signal, agent: snapshotAgentA,
  })
  assert.equal(listLoad.value.ok, true)
  assert.ok(snapshotSupervisor.loadedSchemaCharacters(snapshotAgentA) <= 32_000)
  const projectsResult = await runtime.execute({
    callId: 'snapshot-explicit-team-projects', name: listName,
    arguments: { teamId: 'team_fixture', limit: 100 }, signal: new AbortController().signal, agent: snapshotAgentA,
  })
  assert.equal(projectsResult.isError, false)
  assert.equal(projectsResult.meta.result._meta['dsh-vercel/scope-resolution'].ownerVerified, true)
  assert.equal(projectsResult.meta.result.structuredContent.projects[0].accountId, 'team_fixture')
  const snapshotUnload = await runtime.execute({
    callId: 'snapshot-unload-update', name: 'adenxie_vercel_mcp_unload_tools',
    arguments: { names: [updateName] }, signal: new AbortController().signal, agent: snapshotAgentA,
  })
  assert.deepEqual(snapshotUnload.value.unloaded, [updateName])
  assert.equal(snapshotSupervisor.loadedToolCount(snapshotAgentA), 1)
  assert.deepEqual(runtime.schemas(snapshotAgentA).filter((schema) => schema.name.startsWith('mcp__adenxie_vercel__')).map((schema) => schema.name), [listName])

  await snapshotSupervisor.shutdown()
  for (const dispose of snapshotControls) dispose()
  await snapshotAgentAHandle.dispose()
  await snapshotAgentBHandle.dispose()
  await snapshotRemote.close()

  console.log('mcp bridge: PASS (local HTTP MCP server, real DSH ToolRuntime, catalog, metadata/results, reconnect, disposal)')
} finally {
  await rm(temp, { recursive: true, force: true })
}
