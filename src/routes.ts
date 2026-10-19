/**
 * @adenxie/dsh-vercel — loopback HTTP routes for the web settings panel and
 * the OAuth callback.
 *
 * Route family: /api/adenxie/dsh-vercel/*. All routes are loopback-only
 * (127.0.0.1/localhost, same-origin) except the OAuth callback, which must
 * accept the browser landing from mcp.vercel.com — it still requires a
 * loopback client and verifies the OAuth `state` inside the flow.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VercelMcpStore } from './store.ts'
import type { OAuthFlow } from './oauth.ts'
import type { McpSupervisor } from './mcp.ts'
import { parseManualCallback } from './oauth.ts'

/** Route paths. */
export const VERCEL_MCP_API = {
  status: '/api/adenxie/dsh-vercel/status',
  oauthStart: '/api/adenxie/dsh-vercel/oauth/start',
  oauthCallback: '/api/adenxie/dsh-vercel/oauth/callback',
  oauthFinish: '/api/adenxie/dsh-vercel/oauth/finish',
  oauthRefresh: '/api/adenxie/dsh-vercel/oauth/refresh',
  test: '/api/adenxie/dsh-vercel/test',
  catalog: '/api/adenxie/dsh-vercel/catalog',
  clear: '/api/adenxie/dsh-vercel/clear',
} as const

/** Cap on JSON request bodies. */
const MAX_JSON_BODY_BYTES = 64 * 1024

/** Strict loopback fence for the non-callback routes. */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** Callback route fence: loopback client + host header, any origin (cross-site navigation from the OAuth provider is expected). */
function isLoopbackCallbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  try {
    const hostUrl = new URL(`http://${host}`)
    return hostUrl.hostname === '127.0.0.1' || hostUrl.hostname === 'localhost' || hostUrl.hostname === '[::1]'
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** One HTML response (used only by the OAuth callback page). */
function writeHtml(res: ServerResponse, status: number, title: string, body: string): void {
  const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
  title = escapeHtml(title)
  body = escapeHtml(body)
  const html =
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<title>' + title + '</title><style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;' +
    'align-items:center;justify-content:center;min-height:90vh;margin:0;background:#f6f7f9;color:#1f2328}' +
    '.card{background:#fff;border:1px solid #e2e5e9;border-radius:12px;padding:32px 40px;max-width:520px;' +
    'box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:18px;margin:0 0 12px}p{font-size:14px;line-height:1.7;margin:0}</style>' +
    '</head><body><div class="card"><h1>' + title + '</h1><p>' + body + '</p></div></body></html>'
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(html)
}

/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** Extract a string query parameter. */
function queryParam(req: IncomingMessage, name: string): string {
  try {
    const url = new URL(req.url ?? '', 'http://localhost')
    return url.searchParams.get(name) ?? ''
  } catch {
    return ''
  }
}

/** Route handler context. */
export interface RouteContext {
  store: VercelMcpStore
  flow: OAuthFlow
  supervisor: McpSupervisor
  /** The loopback OAuth callback URL. */
  callbackUrl: string
}

/**
 * Build every /api/adenxie/dsh-vercel route (exact paths).
 * @param deps - store, oauth flow, MCP supervisor, callback URL.
 * @returns the route list.
 */
export function makeRoutes(deps: RouteContext) {
  const { store, flow, supervisor, callbackUrl } = deps

  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: `method not allowed: ${req.method}` })
      return false
    }
    return true
  }

  const statusView = async (): Promise<Record<string, unknown>> => {
    const view = await store.view(callbackUrl)
    return {
      ...view,
      connected: supervisor.isConnected(),
      toolCount: supervisor.toolCount(),
      availableToolCount: supervisor.availableToolCount(),
    }
  }

  return [
    {
      kind: 'exact' as const,
      path: VERCEL_MCP_API.status,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        writeJson(res, 200, await statusView())
      },
    },
    {
      kind: 'exact' as const,
      path: VERCEL_MCP_API.oauthStart,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        try {
          const { authorizeUrl } = await flow.begin(callbackUrl)
          writeJson(res, 200, { ok: true, authorizeUrl, callbackUrl })
        } catch (error) {
          writeJson(res, 200, { ok: false, error: String(error instanceof Error ? error.message : error) })
        }
      },
    },
    {
      kind: 'exact' as const,
      path: VERCEL_MCP_API.oauthCallback,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!isLoopbackCallbackRequest(req)) {
          writeHtml(res, 403, '授权失败', '回调请求来自非本机地址，已拒绝。')
          return
        }
        const code = queryParam(req, 'code')
        const state = queryParam(req, 'state')
        const error = queryParam(req, 'error')
        if (error !== '') {
          flow.abort()
          writeHtml(res, 400, '授权失败', 'Vercel 返回错误：' + error + '。请重试或粘贴完整回调 URL。')
          return
        }
        if (code === '') {
          writeHtml(res, 400, '授权失败', '回调中没有 code 参数。')
          return
        }
        const result = await flow.complete(code, state)
        if (!result.ok) {
          writeHtml(res, 400, '授权失败', result.message)
          return
        }
        // Tokens are in the store; bring the MCP connection up.
        void supervisor.start().catch(() => {})
        writeHtml(res, 200, '授权成功', 'Vercel MCP 授权已完成，令牌已保存。现在可以关闭此页面，回到 DSH 设置面板或继续对话。')
      },
    },
    {
      kind: 'exact' as const,
      path: VERCEL_MCP_API.oauthFinish,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const callback = parseManualCallback({
          code: typeof body.code === 'string' ? body.code : undefined,
          state: typeof body.state === 'string' ? body.state : undefined,
          redirectUrl: typeof body.redirectUrl === 'string' ? body.redirectUrl : undefined,
        })
        if (callback === null) {
          writeJson(res, 400, { error: '需要完整回调 URL，或同时提供 code 和 state。' })
          return
        }
        const result = await flow.complete(callback.code, callback.state)
        if (result.ok) {
          void supervisor.start().catch(() => {})
        }
        writeJson(res, 200, { ok: result.ok, message: result.message, view: await statusView() })
      },
    },
    {
      kind: 'exact' as const,
      path: VERCEL_MCP_API.oauthRefresh,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        // The transport refreshes automatically on 401; this endpoint forces a
        // refresh so the panel can verify the refresh_token still works.
        const provider = flow.activeProvider
        if (provider === null) {
          writeJson(res, 200, { ok: false, message: '没有活动的 OAuth provider（服务重启后请先测试连接以触发刷新）。', view: await statusView() })
          return
        }
        const result = await provider.forceRefresh()
        const messages = {
          refreshed: '令牌刷新成功。',
          missing_refresh_token: '当前授权没有 refresh_token；现有 access token 保留，可继续使用。请点击「重新授权」并同意 offline_access 以启用自动刷新。',
          missing_client_information: '缺少客户端注册信息，无法刷新；现有 access token 保留，请重新授权。',
          missing_discovery: '缺少授权服务器发现信息，无法刷新；现有 access token 保留，请重新授权。',
          invalid_grant: 'Vercel 拒绝了 refresh_token；现有凭据未清除。请重新授权以继续使用自动刷新。',
          failed: '刷新失败；现有凭据未清除。可继续测试连接，或重新授权。',
        } as const
        writeJson(res, 200, { ok: result === 'refreshed', code: result, message: messages[result], view: await statusView() })
      },
    },
    {
      kind: 'exact' as const,
      path: VERCEL_MCP_API.test,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        const view = await store.view(callbackUrl)
        if (!view.authorized) {
          writeJson(res, 200, { ok: false, error: '尚未授权：请先点击「开始授权」。', view: await statusView() })
          return
        }
        try {
          if (!supervisor.isConnected()) {
            await supervisor.start()
          }
          const tools = await supervisor.listTools()
          writeJson(res, 200, { ok: true, message: `连接成功，发现 ${tools.length} 个 Vercel MCP 工具。`, tools, view: await statusView() })
        } catch (error) {
          writeJson(res, 200, { ok: false, error: String(error instanceof Error ? error.message : error), view: await statusView() })
        }
      },
    },
    {
      kind: 'exact' as const,
      path: VERCEL_MCP_API.catalog,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'GET')) return
        try {
          writeJson(res, 200, { source: 'mcp.vercel', tools: await supervisor.listToolCatalog() })
        } catch {
          writeJson(res, 503, { error: 'Vercel MCP is not connected; no tool catalogue is available.' })
        }
      },
    },
    {
      kind: 'exact' as const,
      path: VERCEL_MCP_API.clear,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (!guard(req, res, 'POST')) return
        flow.abort()
        await supervisor.dispose()
        await store.clearAll()
        writeJson(res, 200, { ok: true, message: '已清除 Vercel MCP 的令牌与客户端注册。', view: await statusView() })
      },
    },
  ]
}
