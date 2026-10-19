import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'adenxie-dsh-vercel-migration-'))

try {
  const { VercelMcpStore } = await import('../lib/index.js')
  const legacyPath = path.join(temp, 'dsh-vercel.json')
  const newPath = path.join(temp, 'adenxie-dsh-vercel.json')
  const legacy = {
    clientInformation: { client_id: 'legacy-client', redirect_uris: ['http://127.0.0.1/callback'] },
    tokens: { access_token: 'legacy-access', refresh_token: 'legacy-refresh', token_type: 'Bearer' },
    tokenUpdatedAt: '2026-10-19T00:00:00.000Z',
    discoveryState: { issuer: 'https://mcp.vercel.com' },
  }
  await writeFile(legacyPath, JSON.stringify(legacy), { mode: 0o600 })

  const migrated = new VercelMcpStore(newPath, legacyPath)
  assert.deepEqual(JSON.parse(JSON.stringify(await migrated.load())), legacy)
  assert.deepEqual(JSON.parse(await readFile(newPath, 'utf8')), legacy)
  assert.deepEqual(JSON.parse(await readFile(legacyPath, 'utf8')), legacy)

  // An existing new-format file takes precedence and is never overwritten by legacy data.
  const existingPath = path.join(temp, 'existing.json')
  const existing = { ...legacy, tokens: { access_token: 'new-access', token_type: 'Bearer' } }
  await writeFile(existingPath, JSON.stringify(existing), { mode: 0o600 })
  const existingStore = new VercelMcpStore(existingPath, legacyPath)
  assert.deepEqual(JSON.parse(JSON.stringify(await existingStore.load())), existing)
  assert.deepEqual(JSON.parse(await readFile(existingPath, 'utf8')), existing)
  assert.deepEqual(JSON.parse(await readFile(legacyPath, 'utf8')), legacy)

  console.log('store migration: PASS (one-way copy, legacy retained, existing destination wins)')
} finally {
  await rm(temp, { recursive: true, force: true })
}
