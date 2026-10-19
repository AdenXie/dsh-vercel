/** Offline smoke tests. All credential reads and writes stay in a fresh temp directory. */
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'

const temp = await mkdtemp(path.join(tmpdir(), 'dsh-vercel-test-'))
process.env.DSH_VERCEL_CONFIG = path.join(temp, 'credentials.json')

function fakeResponse() {
  return {
    status: 0, headers: {}, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { this.body = String(body ?? '') },
  }
}

function fakeRequest(method, url, body = '') {
  const req = new PassThrough()
  req.method = method
  req.url = url
  req.socket = { remoteAddress: '127.0.0.1' }
  req.headers = { host: '127.0.0.1:3080', 'content-type': 'application/json' }
  process.nextTick(() => { req.end(body) })
  return req
}

try {
  // The emitted client must register under the package ID, require only seeded
  // platform modules, and apply against the settings slot contract.
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const clientBundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(clientBundle.includes('Vercel MCP (Adenxie)'))
  const platformSource = await readFile(new URL('../shared/web-platform.ts', import.meta.url), 'utf8')
  const platformModules = [...platformSource.matchAll(/'([^']+)'/g)].map((match) => match[1])
  let loadedClient
  const requiredModules = []
  runInNewContext(clientBundle, {
    window: { __ModuleLoader__: { load: (definition) => { loadedClient = definition } } },
  })
  assert.equal(loadedClient.id, packageJson.name)
  const client = loadedClient.factory((id) => {
    requiredModules.push(id)
    if (id === 'react') return {}
    if (id === 'react/jsx-runtime') return { jsx() {}, jsxs() {} }
    throw new Error(`unexpected client external: ${id}`)
  })
  assert.ok(requiredModules.length > 0)
  assert.ok(requiredModules.every((id) => platformModules.includes(id)))
  assert.equal(packageJson.dsh.client.platform, 'web')
  assert.deepEqual(packageJson.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-settings'])
  assert.deepEqual([...client.inject], ['slots'])
  let registration
  client.apply({ slots: {
    inject: (slot, register) => { assert.equal(slot, 'settings.section'); register() },
    register: (...args) => { registration = args },
  } })
  assert.equal(registration[0].name, 'settings.section')
  assert.equal(registration[0].id, 'adenxie-dsh-vercel')
  assert.equal(typeof registration[1], 'function')

  const api = await import('../lib/index.js')
  const { VercelMcpStore, OAuthFlow, VercelOAuthProvider, mask, MCP_URL, configPath } = api
  assert.equal(configPath(), path.join(temp, 'credentials.json'))

  // Store round-trip and redaction use only the temporary credentials path.
  const store = new VercelMcpStore()
  await store.clearAll()
  const empty = await store.view('http://127.0.0.1:3080/api/adenxie/dsh-vercel/oauth/callback')
  assert.equal(empty.configured, false)
  assert.equal(empty.authorized, false)
  assert.equal(empty.mcpUrl, MCP_URL)
  const cfg = await store.load()
  cfg.tokens = { access_token: 'test-token-123456', refresh_token: 'test-refresh', token_type: 'Bearer' }
  cfg.tokenUpdatedAt = new Date().toISOString()
  cfg.clientInformation = { client_id: 'test-client-123456', redirect_uris: [] }
  await store.save(cfg)
  const view = await store.view('http://127.0.0.1:3080/api/adenxie/dsh-vercel/oauth/callback')
  assert.equal(view.authorized, true)
  assert.ok(!JSON.stringify(view).includes('test-token-123456'))
  assert.ok(!JSON.stringify(view).includes('test-client-123456'))
  assert.equal((JSON.parse(await readFile(configPath(), 'utf8'))).tokens.access_token, 'test-token-123456')
  await store.clearAll()

  // OAuth metadata and strict manual callback parsing.
  const provider = new VercelOAuthProvider(store, 'http://127.0.0.1:3080/api/adenxie/dsh-vercel/oauth/callback')
  assert.equal(provider.redirectUrl, 'http://127.0.0.1:3080/api/adenxie/dsh-vercel/oauth/callback')
  assert.equal(provider.clientMetadata.token_endpoint_auth_method, 'none')
  assert.ok((await provider.state()).length >= 16)
  assert.equal((await provider.clientInformation()), undefined)
  assert.deepEqual(api.parseManualCallback({ code: ' c ', state: ' s ' }), { code: 'c', state: 's' })
  assert.deepEqual(api.parseManualCallback({ redirectUrl: 'http://localhost/callback?code=c&state=s' }), { code: 'c', state: 's' })
  assert.equal(api.parseManualCallback({ code: 'c' }), null)
  assert.equal(api.parseManualCallback({ redirectUrl: 'not a URL' }), null)
  const strictFlow = new OAuthFlow(store)
  strictFlow.getProvider('http://127.0.0.1/callback').beginPending('expected-state')
  const wrongState = await strictFlow.complete('authorization-code', 'wrong-state')
  assert.equal(wrongState.ok, false)
  assert.match(wrongState.message, /state 校验未通过/)

  // Route contract rejects manual code without state and escapes OAuth errors.
  const flow = { complete: async (code, state) => ({ ok: false, message: `${code}/${state}` }), abort() {}, activeProvider: null }
  const supervisor = { isConnected: () => false, toolCount: () => 0, start: async () => {}, dispose: async () => {}, listTools: async () => [] }
  const callbackUrl = 'http://127.0.0.1:3080/api/adenxie/dsh-vercel/oauth/callback'
  const routes = api.makeRoutes({ store, flow, supervisor, callbackUrl })
  const finish = routes.find((route) => route.path.endsWith('/oauth/finish')).handler
  const rejected = fakeResponse()
  await finish(fakeRequest('POST', '/api/adenxie/dsh-vercel/oauth/finish', JSON.stringify({ code: 'only-code' })), rejected)
  assert.equal(rejected.status, 400)
  const callback = routes.find((route) => route.path.endsWith('/oauth/callback')).handler
  const escaped = fakeResponse()
  await callback(fakeRequest('GET', '/api/adenxie/dsh-vercel/oauth/callback?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E'), escaped)
  assert.equal(escaped.status, 400)
  assert.ok(escaped.body.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(!escaped.body.includes('<script>'))

  // Skill listing, legitimate reference reads, traversal rejection, and symlink escape.
  const skills = await api.listVercelSkills()
  assert.equal(skills.length, 34)
  const cliSkill = skills.find((skill) => skill.name === 'vercel-cli')
  assert.ok(cliSkill)
  assert.equal(cliSkill.path, 'vercel-cli/SKILL.md')
  assert.ok(cliSkill.description.length > 30)
  assert.match(skills.find((skill) => skill.name === 'flags-sdk').description, /before a library or provider is chosen/)
  const agentsSkill = skills.find((skill) => skill.name === 'build-agents')
  assert.match(agentsSkill.description, /^Default guidance for building AI agents\./)
  assert.doesNotMatch(agentsSkill.description, /metadata|pathPatterns|summary/)
  assert.ok((await api.listVercelSkills('deployment')).some((skill) => skill.name === 'deployments-cicd'))
  assert.match(await api.readVercelSkill('vercel-cli/SKILL.md'), /Vercel CLI/)
  await assert.rejects(api.readVercelSkill('../package.json'), /目录回退段/)
  await assert.rejects(api.readVercelSkill('vercel-cli/../auth/SKILL.md'), /目录回退段/)
  const outside = path.join(temp, 'outside')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(outside))
  await writeFile(path.join(outside, 'outside.md'), 'outside')
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/vercel')
  const link = path.join(skillRoot, '.test-escape')
  try {
    await symlink(outside, link, 'junction')
    await assert.rejects(api.readVercelSkill('.test-escape/outside.md'), /符号链接/)
  } finally {
    await rm(link, { force: true })
  }

  // Simulate failed and successful Client generations without contacting Vercel.
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const originals = { connect: Client.prototype.connect, request: Client.prototype.request, close: Client.prototype.close }
  let connectMode = 'fail'
  let connectCount = 0
  let releaseConnect
  Client.prototype.connect = async function () {
    connectCount += 1
    if (connectMode === 'fail') throw new Error('simulated offline connect failure')
    if (connectMode === 'gate') await new Promise((resolve) => { releaseConnect = resolve })
  }
  Client.prototype.request = async function () { return { tools: [] } }
  Client.prototype.close = async function () { this.onclose?.() }
  try {
    const cfg = await store.load()
    cfg.tokens = { access_token: 'temporary-supervisor-token' }
    await store.save(cfg)
    const ctx = {
      tools: { register: () => () => {}, restrict: () => () => {}, guard: () => () => {} },
      agents: { list: () => [], isOwnedBy: () => false },
      on: () => () => {},
      logger: { info() {}, warn() {}, error() {} },
    }
    const supervisorHandle = api.createSupervisor(ctx, store, new OAuthFlow(store), callbackUrl)
    await assert.rejects(supervisorHandle.start(), /simulated offline connect failure/)
    assert.equal(supervisorHandle.isConnected(), false)
    await supervisorHandle.dispose()

    connectMode = 'success'
    await supervisorHandle.start()
    assert.equal(supervisorHandle.isConnected(), true)
    await supervisorHandle.dispose()

    connectMode = 'gate'
    const beforeConcurrent = connectCount
    const startOne = supervisorHandle.start()
    const startTwo = supervisorHandle.start()
    while (releaseConnect === undefined) await new Promise((resolve) => setImmediate(resolve))
    assert.equal(connectCount, beforeConcurrent + 1)
    releaseConnect()
    await Promise.all([startOne, startTwo])
    assert.equal(supervisorHandle.isConnected(), true)
    await supervisorHandle.dispose()
    await store.clearAll()
  } finally {
    Client.prototype.connect = originals.connect
    Client.prototype.request = originals.request
    Client.prototype.close = originals.close
  }

  assert.equal(mask(''), '')
  assert.equal(mask('abcdef'), 'ab****')
  assert.equal(mask('test-client-123456'), 'test****3456')
  console.log('smoke: PASS (offline; isolated temporary credentials)')
} finally {
  await rm(temp, { recursive: true, force: true })
}
