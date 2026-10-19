// Startup surface budget: what every request carries before any Vercel tool is loaded.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'

const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-vercel-surface-'))
process.env.DSH_VERCEL_CONFIG = path.join(temp, 'credentials.json')
try {
  const mod = await import('../lib/index.js')
  const root = new Context()
  new SystemPrompt(root, {})
  new AgentRegistry(root)
  const ctx = root.extend({ logger: { info() {}, warn() {}, error() {} } })
  const runtime = new ToolRuntime(ctx)
  const sections = []
  const disposers = []
  mod.apply({
    webServer: { port: 3000, register: () => () => {} },
    tools: runtime,
    systemPrompt: { section: (section) => { sections.push(section); return () => {} } },
    agents: ctx.agents,
    logger: ctx.logger,
    on: (...args) => ctx.on(...args),
    effect: (fn) => { const dispose = fn(); disposers.push(dispose); return typeof dispose === 'function' ? dispose : () => {} },
  }, {})
  const schemas = runtime.schemas().filter((schema) => schema.name.startsWith('adenxie_vercel_'))
  const schemaCharacters = schemas.reduce((total, schema) => total + JSON.stringify(schema).length, 0)
  const guidance = sections.map((section) => typeof section.text === 'function' ? section.text() : section.text).join('')
  assert.deepEqual(schemas.map((schema) => schema.name).sort(), [
    'adenxie_vercel_mcp_account',
    'adenxie_vercel_mcp_call',
    'adenxie_vercel_mcp_describe_tool',
    'adenxie_vercel_mcp_load_tools',
    'adenxie_vercel_mcp_read_result',
    'adenxie_vercel_mcp_search_tools',
    'adenxie_vercel_mcp_unload_tools',
    'adenxie_vercel_skill',
  ])
  // 0.3.1 carried 11 tools / 2,974 schema characters and an 871-character section.
  assert.ok(schemaCharacters <= 3_000, `startup schemas use ${schemaCharacters} characters`)
  assert.ok(guidance.length <= 450, `guidance uses ${guidance.length} characters`)
  for (const dispose of disposers) if (typeof dispose === 'function') dispose()
  console.log(`surface: PASS (${schemas.length} tools, ${schemaCharacters} schema + ${guidance.length} guidance characters)`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
process.exit(0)
