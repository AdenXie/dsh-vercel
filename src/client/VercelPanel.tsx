/**
 * Vercel MCP settings panel — rendered inside the web settings page
 * (settings.section entry). Drives the OAuth authorize flow (popup + manual
 * code paste), shows connection state and the registered MCP tool count,
 * and offers one-click test / refresh / clear. Plain React, inline styles.
 */
import { useCallback, useEffect, useState } from 'react'
import { VercelMcpApi, type VercelMcpStatusView } from './api.ts'

/** Module-level API client (stateless; the component closes over it). */
const api = new VercelMcpApi()

/** One shared style sheet (kept tiny and theme-agnostic). */
const s = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: '620px',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(128,128,128,0.3)',
    fontSize: '13px',
    color: 'inherit',
  } as const,
  title: { fontWeight: 600, fontSize: '13px', margin: 0 } as const,
  status: { fontSize: '12px', opacity: 0.85 } as const,
  statusWarn: { fontSize: '12px', opacity: 0.9, color: '#c9763a' } as const,
  row: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } as const,
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid rgba(128,128,128,0.35)',
    background: 'rgba(128,128,128,0.08)',
    color: 'inherit',
    fontSize: '12px',
  } as const,
  flex: { flex: 1 } as const,
  button: {
    padding: '4px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: '1px solid rgba(128,128,128,0.4)',
    background: 'rgba(128,128,128,0.14)',
    color: 'inherit',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  } as const,
  msg: { fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', opacity: 0.9 } as const,
  hint: { fontSize: '11px', opacity: 0.75, lineHeight: 1.6 } as const,
}

/** Status line for the current view. */
function statusText(view: VercelMcpStatusView | null): string {
  if (view === null) return '加载中…'
  if (!view.authorized) {
    return '未授权 — 点击「开始授权」并在 Vercel 登录页完成授权后，MCP 工具即可用。'
  }
  const connected = view.connected ? '已连接' : '未连接'
  if (!view.refreshTokenAvailable) {
    return `已授权 · access token 可用 · 无 refresh_token，自动刷新不可用 · 点击重新授权并同意 offline_access · MCP ${connected} · 目录工具 ${view.availableToolCount ?? view.toolCount} 个可用，会话按需加载`
  }
  return `已授权 · 令牌更新于 ${view.tokenUpdatedAt} · MCP ${connected} · 目录工具 ${view.availableToolCount ?? view.toolCount} 个可用，会话按需加载`
}

/** The settings panel component. */
export function VercelMcpSettingsPanel(): JSX.Element {
  const [view, setView] = useState<VercelMcpStatusView | null>(null)
  const [redirectUrl, setRedirectUrl] = useState('')
  const [tools, setTools] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const refreshStatus = useCallback(async () => {
    try {
      setView(await api.status())
    } catch (error) {
      setMsg('读取状态失败: ' + String(error instanceof Error ? error.message : error))
    }
  }, [])

  useEffect(() => { void refreshStatus() }, [refreshStatus])

  // Reload status when the tab regains focus (authorize popup may have closed).
  useEffect(() => {
    const onFocus = (): void => { void refreshStatus() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshStatus])

  /** Run one async panel action with busy/message bookkeeping. */
  const run = async (action: () => Promise<{ message: string } | void>): Promise<void> => {
    setBusy(true)
    setMsg('')
    try {
      const result = await action()
      if (result !== undefined) setMsg(result.message)
    } catch (error) {
      setMsg('操作失败: ' + String(error instanceof Error ? error.message : error))
    } finally {
      setBusy(false)
    }
  }

  const authorize = (): void => {
    void run(async () => {
      const result = await api.oauthStart()
      if (!result.ok || result.authorizeUrl === undefined) {
        return { message: '[failed] ' + (result.error ?? '开始授权失败') }
      }
      window.open(result.authorizeUrl, '_blank', 'noopener')
      return {
        message: '已在新标签页打开 Vercel 授权页。本次申请 openid offline_access；现有令牌会保留，直到新授权成功。登录并同意后会自动跳回本机完成；若停留在回调地址，复制地址栏 URL 粘贴到下方完成。',
      }
    })
  }

  const finish = (): void => {
    void run(async () => {
      const result = await api.oauthFinish(redirectUrl)
      setRedirectUrl('')
      setView(result.view)
      return { message: (result.ok ? '[ok] ' : '[failed] ') + result.message }
    })
  }

  const refreshTokens = (): void => {
    void run(async () => {
      const result = await api.oauthRefresh()
      setView(result.view)
      return { message: (result.ok ? '[ok] ' : '[failed] ') + result.message }
    })
  }

  const test = (): void => {
    void run(async () => {
      const result = await api.test()
      setView(result.view)
      if (result.ok && result.tools !== undefined) setTools(result.tools)
      return { message: result.ok ? (result.message ?? '连接成功。') : ('[failed] ' + (result.error ?? '')) }
    })
  }

  const clear = (): void => {
    void run(async () => {
      if (!window.confirm('确定清除 Vercel MCP 的全部凭据吗？MCP 工具将注销，之后需要重新授权。')) {
        return { message: '已取消。' }
      }
      const result = await api.clear()
      setView(result.view)
      setTools([])
      return { message: result.message }
    })
  }

  const authorized = Boolean(view && view.authorized)

  return (
    <div style={s.card}>
      <p style={s.title}>Vercel MCP (Adenxie)</p>
      <div style={authorized ? s.status : s.statusWarn}>{statusText(view)}</div>

      <div style={s.hint}>
        通过官方 OAuth 连接 mcp.vercel.com，授权后 Vercel API 工具以 mcp__adenxie_vercel__* 形式在会话中可用
        （部署、项目、域名、环境变量、DNS 记录、部署代码等）。令牌存 {view?.configPath ?? '~/.dsh/adenxie-dsh-vercel.json'}（权限 0600）。
      </div>

      <div style={s.row}>
        <button style={s.button} onClick={authorize} disabled={busy}>{authorized ? '重新授权' : '开始授权'}</button>
        <button style={s.button} onClick={refreshTokens} disabled={busy || !authorized || !view?.refreshTokenAvailable}>刷新令牌</button>
        <button style={s.button} onClick={test} disabled={busy || !authorized}>测试连接</button>
        <button style={s.button} onClick={clear} disabled={busy || !authorized}>清除凭据</button>
      </div>

      {!authorized && (
        <div style={s.row}>
          <input
            style={{ ...s.input, ...s.flex }}
              placeholder="未自动完成时，粘贴完整回调地址（需包含 code 和 state）"
              value={redirectUrl}
              onChange={(event) => setRedirectUrl(event.target.value)}
          />
          <button style={s.button} onClick={finish} disabled={busy || redirectUrl.trim() === ''}>完成授权</button>
        </div>
      )}

      {tools.length > 0 && (
        <div style={s.hint}>已发现的 MCP 工具（{tools.length}）：{tools.slice(0, 12).join('、')}{tools.length > 12 ? '…' : ''}</div>
      )}

      {msg !== '' && <div style={s.msg}>{msg}</div>}
    </div>
  )
}
