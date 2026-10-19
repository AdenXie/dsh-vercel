/**
 * @adenxie/dsh-vercel — OAuth 2.0 flow against mcp.vercel.com.
 *
 * The remote Vercel MCP server requires OAuth (WWW-Authenticate:
 * Bearer realm="OAuth", RFC 9728 protected-resource metadata at
 * https://mcp.vercel.com/.well-known/oauth-protected-resource).
 * This module implements the full MCP OAuth client dance on top of the
 * official @modelcontextprotocol/sdk primitives:
 *
 *   1. `auth()` phase 1: RFC 9728 discovery, dynamic client registration
 *      (https://vercel.com/api/login/oauth/register, discovered from the
 *      authorization-server metadata), PKCE S256 authorization URL;
 *      the URL is captured by our provider and returned to the caller
 *      (settings panel / agent tool) for the browser to open.
 *   2. Browser lands on the loopback callback route
 *      (/api/adenxie/dsh-vercel/oauth/callback on the GUI's own server);
 *      the `state` is verified against the pending flow.
 *   3. `auth()` phase 2 with the authorization code exchanges it for
 *      tokens (refresh_token grant supported), which are persisted in
 *      ~/.dsh/adenxie-dsh-vercel.json (mode 0600).
 *
 * The same provider object is handed to the MCP Client's transport, so
 * later 401s auto-refresh through it without user interaction.
 */

import { randomUUID } from 'node:crypto'
import {
  auth,
  exchangeAuthorization,
  refreshAuthorization,
  type AuthResult,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { MCP_URL, type VercelMcpStore } from './store.ts'

/** How long a pending authorization flow stays valid (ms). */
export const PENDING_FLOW_TTL_MS = 10 * 60 * 1000

/** How long `begin()` waits for the authorization URL to materialize (ms). */
export const AUTHORIZE_URL_TIMEOUT_MS = 30 * 1000
export const VERCEL_OAUTH_SCOPE = 'openid offline_access'

export type RefreshOutcome = 'refreshed' | 'missing_refresh_token' | 'missing_client_information' | 'missing_discovery' | 'invalid_grant' | 'failed'

export interface OAuthFlowTestHooks {
  serverUrl?: string
  authorize?: (provider: OAuthClientProvider, options: { serverUrl: string; scope: string }) => Promise<AuthResult>
  exchange?: typeof exchangeAuthorization
  refresh?: typeof refreshAuthorization
}

function storedTokens(tokens: OAuthTokens): NonNullable<VercelMcpStore['config']>['tokens'] {
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in !== undefined ? Date.now() + tokens.expires_in * 1000 : undefined,
    scope: tokens.scope,
    token_type: tokens.token_type ?? 'Bearer',
  }
}

/** Parse a pasted callback URL, or validate explicitly supplied code/state. */
export function parseManualCallback(input: { code?: string; state?: string; redirectUrl?: string }): { code: string; state: string } | null {
  let code = input.code?.trim() ?? ''
  let state = input.state?.trim() ?? ''
  if (input.redirectUrl) {
    try {
      const callback = new URL(input.redirectUrl)
      code ||= callback.searchParams.get('code')?.trim() ?? ''
      state ||= callback.searchParams.get('state')?.trim() ?? ''
    } catch { return null }
  }
  return code !== '' && state !== '' ? { code, state } : null
}

/** One in-flight authorization flow (single-slot; concurrency rejected). */
export interface PendingFlow {
  state: string
  provider: VercelOAuthProvider
  /** Resolves with the authorization URL once redirectToAuthorization fires. */
  authorizeUrlPromise: Promise<string>
  resolveAuthorizeUrl: (url: string) => void
  rejectAuthorizeUrl: (error: unknown) => void
  /** Set when the browser callback (or manual code) arrives. */
  code: string | null
  /** Timestamp of begin(), for TTL eviction. */
  startedAt: number
}

/**
 * OAuth client provider backed by the credential store. Implements the MCP
 * SDK's OAuthClientProvider contract: persisted client registration + tokens,
 * memory-held PKCE verifier, and a captured authorization URL for the GUI.
 */
export class VercelOAuthProvider implements OAuthClientProvider {
  private pending: PendingFlow | null = null
  private codeVerifierValue: string | null = null
  private stagingClientInformation = false
  private stagedClientInformation: OAuthClientInformationMixed | null = null

  constructor(
    private readonly store: VercelMcpStore,
    private readonly callbackUrl: string,
    private readonly refreshGrant: typeof refreshAuthorization = refreshAuthorization,
  ) {}

  /** The loopback callback URL (registered on the GUI's own web server). */
  get redirectUrl(): string {
    return this.callbackUrl
  }

  /** Client metadata for dynamic registration (public client + PKCE). */
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: '@adenxie/dsh-vercel',
      redirect_uris: [this.callbackUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: VERCEL_OAUTH_SCOPE,
    }
  }

  /**
   * Flow-bound state (verified on the callback).
   *
   * The MCP SDK builds the authorize URL by calling this method itself; if it
   * returned a fresh UUID every time, the URL's `state` would differ from the
   * one `begin()` recorded in the pending flow, and the callback's state could
   * never match (the "state 校验未通过" failure). Return the active pending
   * flow's state so the authorize request reuses the exact value the pending
   * flow will verify.
   */
  async state(): Promise<string> {
    const pending = this.pending
    if (pending !== null) return pending.state
    return randomUUID()
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const cfg = await this.store.load()
    return cfg.clientInformation ?? undefined
  }

  async saveClientInformation(information: OAuthClientInformationMixed): Promise<void> {
    if (this.stagingClientInformation) {
      this.stagedClientInformation = information
      return
    }
    const cfg = await this.store.load()
    await this.store.save({ ...cfg, clientInformation: information as unknown as NonNullable<VercelMcpStore['config']>['clientInformation'] })
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const cfg = await this.store.load()
    if (cfg.tokens === null) return undefined
    const tokens: OAuthTokens = { access_token: cfg.tokens.access_token, token_type: cfg.tokens.token_type ?? 'Bearer' }
    if (cfg.tokens.refresh_token !== undefined) tokens.refresh_token = cfg.tokens.refresh_token
    if (cfg.tokens.scope !== undefined) tokens.scope = cfg.tokens.scope
    return tokens
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const cfg = await this.store.load()
    await this.store.save({ ...cfg, tokens: storedTokens(tokens), tokenUpdatedAt: new Date().toISOString() })
  }

  /** Commit replacement registration and tokens together after successful user consent. */
  async commitAuthorization(tokens: OAuthTokens): Promise<void> {
    const cfg = await this.store.load()
    const information = this.stagedClientInformation ?? cfg.clientInformation
    await this.store.save({
      ...cfg,
      clientInformation: information as unknown as NonNullable<VercelMcpStore['config']>['clientInformation'],
      tokens: storedTokens(tokens),
      tokenUpdatedAt: new Date().toISOString(),
    })
    this.discardClientInformationStage()
  }

  /** Keep an existing client registration until a replacement authorization succeeds. */
  beginClientInformationStage(): void {
    this.stagingClientInformation = true
    this.stagedClientInformation = null
  }

  async pendingClientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return this.stagedClientInformation ?? await this.clientInformation()
  }

  discardClientInformationStage(): void {
    this.stagingClientInformation = false
    this.stagedClientInformation = null
  }

  /** Force a refresh grant without SDK auto-recovery that might invalidate usable stored tokens. */
  async forceRefresh(fetchFn?: typeof fetch): Promise<RefreshOutcome> {
    const credentials = await this.store.load()
    const refreshToken = credentials.tokens?.refresh_token
    if (refreshToken === undefined || refreshToken === '') return 'missing_refresh_token'
    const clientInformation = await this.clientInformation()
    if (clientInformation === undefined) return 'missing_client_information'
    const discovery = await this.discoveryState()
    if (discovery?.authorizationServerUrl === undefined) return 'missing_discovery'
    let resource: URL | undefined
    const resourceValue = discovery.resourceMetadata?.resource
    if (resourceValue !== undefined) {
      const parsed = new URL(resourceValue)
      if (parsed.origin !== new URL(MCP_URL).origin) return 'failed'
      resource = parsed
    }
    try {
      const refreshed = await this.refreshGrant(discovery.authorizationServerUrl, {
        metadata: discovery.authorizationServerMetadata,
        clientInformation,
        refreshToken,
        resource,
        fetchFn,
      })
      await this.saveTokens(refreshed)
      return 'refreshed'
    } catch (error) {
      return error instanceof Error && error.name === 'InvalidGrantError' ? 'invalid_grant' : 'failed'
    }
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    const cfg = await this.store.load()
    await this.store.save({ ...cfg, discoveryState: state as unknown as Record<string, unknown> })
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    const cfg = await this.store.load()
    return cfg.discoveryState as unknown as OAuthDiscoveryState | undefined
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    if (scope === 'all') {
      await this.store.clearAll()
    } else if (scope === 'client') {
      await this.store.clearClientInformation()
    } else if (scope === 'tokens') {
      await this.store.clearTokens()
    } else if (scope === 'verifier') {
      this.codeVerifierValue = null
    } else if (scope === 'discovery') {
      const cfg = await this.store.load()
      await this.store.save({ ...cfg, discoveryState: null })
    }
  }

  // ---- PKCE verifier (memory-held per flow) ----

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.codeVerifierValue = codeVerifier
  }

  async codeVerifier(): Promise<string> {
    if (this.codeVerifierValue === null) throw new Error('OAuth flow: missing PKCE code verifier (flow may have expired)')
    return this.codeVerifierValue
  }

  // ---- Authorization URL capture (GUI-driven browser opening) ----

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const pending = this.pending
    if (pending !== null) {
      pending.resolveAuthorizeUrl(authorizationUrl.toString())
    }
    // The GUI opens the URL; nothing to navigate from the host process.
  }

  /** Wait for the pending flow's authorization URL (bounded). */
  waitForAuthorizationUrl(timeoutMs: number): Promise<string> {
    const pending = this.pending
    if (pending === null) return Promise.reject(new Error('OAuth flow: no pending authorization'))
    return Promise.race([
      pending.authorizeUrlPromise,
      new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('OAuth flow: authorization URL timed out')), timeoutMs).unref()
      }),
    ])
  }

  /** Register the pending flow slot (rejects when one is already active). */
  beginPending(state: string): PendingFlow {
    if (this.pending !== null && Date.now() - this.pending.startedAt < PENDING_FLOW_TTL_MS) {
      throw new Error('已有一个待完成的 Vercel 授权流程，请先完成或等待它过期。')
    }
    let resolveAuthorizeUrl!: (url: string) => void
    let rejectAuthorizeUrl!: (error: unknown) => void
    const authorizeUrlPromise = new Promise<string>((resolve, reject) => {
      resolveAuthorizeUrl = resolve
      rejectAuthorizeUrl = reject
    })
    const pending: PendingFlow = {
      state,
      provider: this,
      authorizeUrlPromise,
      resolveAuthorizeUrl,
      rejectAuthorizeUrl,
      code: null,
      startedAt: Date.now(),
    }
    this.pending = pending
    this.codeVerifierValue = null
    return pending
  }

  /** The active pending flow (or null). */
  get pendingFlow(): PendingFlow | null {
    const pending = this.pending
    if (pending === null) return null
    if (Date.now() - pending.startedAt > PENDING_FLOW_TTL_MS) {
      this.pending = null
      return null
    }
    return pending
  }

  /** Settle a pending flow (call after the callback or manual code arrives). */
  settlePending(state: string, code: string): PendingFlow | null {
    const pending = this.pendingFlow
    if (pending === null || pending.state !== state) return null
    pending.code = code
    this.pending = null
    return pending
  }

  /** Abort any pending flow (rejects a waiting begin() with an error). */
  settlePendingAbort(): void {
    const pending = this.pending
    this.pending = null
    this.codeVerifierValue = null
    this.discardClientInformationStage()
    if (pending !== null) {
      pending.rejectAuthorizeUrl(new Error('授权流程已被取消。'))
    }
  }
}

/**
 * OAuth orchestration shared by the routes and the agent tools.
 * Phase 1 (`begin`) starts discovery/registration and returns the
 * authorization URL; phase 2 (`complete`) exchanges the code. The provider
 * instance is created once per callback URL and reused across flows: it
 * reads/writes tokens through the store, so the MCP transport keeps working
 * (and auto-refreshing) between authorizations.
 */
export class OAuthFlow {
  private provider: VercelOAuthProvider | null = null

  constructor(private readonly store: VercelMcpStore, private readonly hooks: OAuthFlowTestHooks = {}) {}

  private get serverUrl(): string { return this.hooks.serverUrl ?? MCP_URL }

  /** The provider used by the MCP transport (created lazily). */
  get activeProvider(): VercelOAuthProvider | null {
    return this.provider
  }

  /** Get (creating if needed) the provider bound to this callback URL. */
  getProvider(callbackUrl: string): VercelOAuthProvider {
    if (this.provider === null) {
      this.provider = new VercelOAuthProvider(this.store, callbackUrl, this.hooks.refresh)
    }
    return this.provider
  }

  /**
   * Start an authorization: fresh dynamic client registration (the callback
   * URL is fixed per host run, but re-registering is cheap and always
   * consistent), then the discovery + authorize-URL dance. Returns the URL
   * for the browser once it exists.
   */
  async begin(callbackUrl: string): Promise<{ authorizeUrl: string; state: string }> {
    const provider = this.getProvider(callbackUrl)

    // Allow restarting an authorization even when a prior pending flow is
    // still in the TTL window (e.g. the user closed the authorize page and
    // clicks 开始授权 again). Aborting the stale slot is a no-op once its
    // authorize URL was already captured, so the new flow always wins.
    provider.settlePendingAbort()
    provider.beginClientInformationStage()

    const state = await provider.state()
    const pending = provider.beginPending(state)

    // Phase 1 runs in the background: discovery → DCR → PKCE → capture URL.
    // Hide old tokens/client registration from this phase-one authorization
    // attempt only. The live transport keeps using the persisted credentials
    // until the user completes and the replacement is committed.
    const phaseOneProvider = new Proxy(provider, {
      get(target, property) {
        if (property === 'tokens') return async () => undefined
        if (property === 'clientInformation') return async () => undefined
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const authorize = this.hooks.authorize ?? ((value, options) => auth(value, options))
    const run = authorize(phaseOneProvider, { serverUrl: this.serverUrl, scope: VERCEL_OAUTH_SCOPE })
    run.catch((error) => {
      pending.rejectAuthorizeUrl(error)
    })

    try {
      const authorizeUrl = await provider.waitForAuthorizationUrl(AUTHORIZE_URL_TIMEOUT_MS)
      return { authorizeUrl, state }
    } catch (error) {
      provider.settlePendingAbort()
      throw error
    }
  }

  /**
   * Complete the flow with the authorization code (from the loopback
   * callback or a manually pasted code). Verifies the state, exchanges the
   * code, and persists the tokens. Returns { ok, message }.
   */
  async complete(code: string, state: string | null): Promise<{ ok: boolean; message: string }> {
    const provider = this.provider
    if (provider === null) {
      return { ok: false, message: '没有待完成的授权流程：请先点击「开始授权」。' }
    }
    const pending = provider.settlePending(state ?? '', code)
    if (pending === null) {
      return { ok: false, message: 'state 校验未通过（授权流程可能已过期或重复）。请重新点击「开始授权」。' }
    }
    let clientInformation: OAuthClientInformationMixed | undefined
    let discovery: OAuthDiscoveryState | undefined
    try {
      clientInformation = await provider.pendingClientInformation()
      discovery = await provider.discoveryState()
      if (clientInformation === undefined || discovery?.authorizationServerUrl === undefined) {
        provider.discardClientInformationStage()
        return { ok: false, message: '授权信息不完整；现有凭据已保留，请重新开始授权。' }
      }
      let resource: URL | undefined
      const resourceValue = discovery.resourceMetadata?.resource
      if (resourceValue !== undefined) {
        const parsed = new URL(resourceValue)
        if (parsed.origin !== new URL(this.serverUrl).origin) throw new Error('resource metadata origin mismatch')
        resource = parsed
      }
      const exchange = this.hooks.exchange ?? exchangeAuthorization
      const tokens = await exchange(discovery.authorizationServerUrl, {
        metadata: discovery.authorizationServerMetadata,
        clientInformation,
        authorizationCode: code,
        codeVerifier: await provider.codeVerifier(),
        redirectUri: provider.redirectUrl,
        resource,
      })
      await provider.commitAuthorization(tokens)
    } catch (error) {
      provider.discardClientInformationStage()
      return { ok: false, message: '令牌交换失败；现有授权凭据已保留。' }
    }
    return { ok: true, message: '授权成功：Vercel MCP 令牌已保存，MCP 工具已就绪。' }
  }

  /** Drop any pending flow (used by clear/reset). */
  abort(): void {
    if (this.provider !== null) {
      this.provider.settlePendingAbort()
    }
  }
}
