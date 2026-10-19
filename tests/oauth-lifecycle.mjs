import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'dsh-vercel-oauth-test-'))
process.env.DSH_VERCEL_CONFIG = path.join(temp, 'credentials.json')

try {
  const { VercelMcpStore, OAuthFlow, VercelOAuthProvider, VERCEL_OAUTH_SCOPE } = await import('../lib/index.js')

  const store = new VercelMcpStore()
  await store.save({
    clientInformation: { client_id: 'old-client', redirect_uris: ['http://127.0.0.1:1/callback'] },
    tokens: { access_token: 'old-access', token_type: 'Bearer' },
    tokenUpdatedAt: 'old-time',
    discoveryState: null,
  })
  const flow = new OAuthFlow(store, {
    serverUrl: 'https://mcp.example.test',
    authorize: async (provider, options) => {
      assert.equal(options.scope, 'openid offline_access')
      assert.equal(provider.clientMetadata.scope, 'openid offline_access')
      assert.equal(await provider.tokens(), undefined, 'phase one must leave old tokens available only to the live transport')
      await provider.saveDiscoveryState({
        authorizationServerUrl: 'https://auth.example.test',
        authorizationServerMetadata: { token_endpoint: 'https://auth.example.test/token', token_endpoint_auth_methods_supported: ['none'] },
        resourceMetadata: { resource: 'https://mcp.example.test' },
      })
      await provider.saveClientInformation({ client_id: 'new-client', redirect_uris: ['http://127.0.0.1:2/callback'] })
      await provider.saveCodeVerifier('test-verifier')
      await provider.redirectToAuthorization(new URL('https://auth.example.test/authorize'))
      return 'REDIRECT'
    },
    exchange: async (_server, options) => {
      assert.equal(options.authorizationCode, 'test-code')
      assert.equal(options.codeVerifier, 'test-verifier')
      assert.equal(options.redirectUri, 'http://127.0.0.1:2/callback')
      return { access_token: 'new-access', refresh_token: 'new-refresh', scope: VERCEL_OAUTH_SCOPE, token_type: 'Bearer' }
    },
  })
  const pending = await flow.begin('http://127.0.0.1:2/callback')
  assert.match(pending.authorizeUrl, /authorize/)
  let credentials = await store.load()
  assert.equal(credentials.tokens.access_token, 'old-access')
  assert.equal(credentials.clientInformation.client_id, 'old-client')
  const completed = await flow.complete('test-code', pending.state)
  assert.equal(completed.ok, true)
  credentials = await store.load()
  assert.equal(credentials.tokens.access_token, 'new-access')
  assert.equal(credentials.tokens.refresh_token, 'new-refresh')
  assert.equal(credentials.clientInformation.client_id, 'new-client')

  // A failed atomic commit must leave both the prior token and registration intact.
  const failedStore = new VercelMcpStore()
  await failedStore.save({
    clientInformation: { client_id: 'kept-client', redirect_uris: ['http://127.0.0.1:3/callback'] },
    tokens: { access_token: 'kept-access', token_type: 'Bearer' },
    tokenUpdatedAt: 'kept-time',
    discoveryState: null,
  })
  const failingFlow = new OAuthFlow(failedStore, {
    serverUrl: 'https://mcp.example.test',
    authorize: async (provider) => {
      await provider.saveDiscoveryState({ authorizationServerUrl: 'https://auth.example.test' })
      await provider.saveClientInformation({ client_id: 'replacement-client' })
      await provider.saveCodeVerifier('test-verifier')
      await provider.redirectToAuthorization(new URL('https://auth.example.test/authorize'))
      return 'REDIRECT'
    },
    exchange: async () => ({ access_token: 'replacement-access', refresh_token: 'replacement-refresh' }),
  })
  const failedPending = await failingFlow.begin('http://127.0.0.1:3/callback')
  const actualSave = failedStore.save.bind(failedStore)
  failedStore.save = async () => { throw new Error('simulated write failure') }
  const failedCommit = await failingFlow.complete('test-code', failedPending.state)
  assert.equal(failedCommit.ok, false)
  failedStore.save = actualSave
  const preserved = await failedStore.load()
  assert.equal(preserved.tokens.access_token, 'kept-access')
  assert.equal(preserved.clientInformation.client_id, 'kept-client')

  const refreshStore = new VercelMcpStore()
  const refreshProvider = new VercelOAuthProvider(refreshStore, 'http://127.0.0.1:4/callback')
  await refreshProvider.saveClientInformation({ client_id: 'refresh-client' })
  await refreshProvider.saveDiscoveryState({
    authorizationServerUrl: 'https://auth.example.test',
    authorizationServerMetadata: { token_endpoint: 'https://auth.example.test/token', token_endpoint_auth_methods_supported: ['none'] },
    resourceMetadata: { resource: 'https://mcp.vercel.com' },
  })

  await refreshProvider.saveTokens({ access_token: 'access-no-refresh', token_type: 'Bearer' })
  let fetchCount = 0
  assert.equal(await refreshProvider.forceRefresh(async () => { fetchCount++; throw new Error('must not fetch') }), 'missing_refresh_token')
  assert.equal(fetchCount, 0)
  assert.equal((await refreshProvider.tokens()).access_token, 'access-no-refresh')

  await refreshProvider.saveTokens({ access_token: 'access-before-failure', refresh_token: 'refresh-before-failure', token_type: 'Bearer' })
  const invalidGrant = await refreshProvider.forceRefresh(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'fixture failure' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  }))
  assert.equal(invalidGrant, 'invalid_grant')
  let tokens = await refreshProvider.tokens()
  assert.equal(tokens.access_token, 'access-before-failure')
  assert.equal(tokens.refresh_token, 'refresh-before-failure')

  const rotated = await refreshProvider.forceRefresh(async (_url, init) => {
    assert.match(String(init.body), /grant_type=refresh_token/)
    assert.match(String(init.body), /refresh_token=refresh-before-failure/)
    return new Response(JSON.stringify({
      access_token: 'access-after-rotation',
      refresh_token: 'refresh-after-rotation',
      expires_in: 3600,
      scope: VERCEL_OAUTH_SCOPE,
      token_type: 'Bearer',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  assert.equal(rotated, 'refreshed')
  tokens = await refreshProvider.tokens()
  assert.equal(tokens.access_token, 'access-after-rotation')
  assert.equal(tokens.refresh_token, 'refresh-after-rotation')
  assert.equal((await refreshStore.view('http://127.0.0.1:4/callback')).refreshTokenAvailable, true)

  console.log('oauth lifecycle: PASS (offline scope, staged commit, missing/failing/rotating refresh)')
} finally {
  await rm(temp, { recursive: true, force: true })
}
