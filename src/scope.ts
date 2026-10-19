/** Narrow compatibility for the official MCP's explicit/default project-scope mismatch. */
export type McpResult = Record<string, unknown>
export type ProjectScopeInvoker = (args: Record<string, unknown>) => Promise<McpResult>
export const PROJECT_SCOPE_META_KEY = 'dsh-vercel/scope-resolution'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isExplicitScopeReauthenticationError(result: McpResult): boolean {
  if (result.isError !== true || !Array.isArray(result.content)) return false
  const text = result.content.filter(record).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')
  return /(?:\b403\b|forbidden)/i.test(text) && /must re-authenticate to this scope/i.test(text)
}

function projectArrays(result: McpResult): unknown[][] {
  const candidates: unknown[] = [result.structuredContent]
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (!record(block) || block.type !== 'text' || typeof block.text !== 'string') continue
      try { candidates.push(JSON.parse(block.text)) } catch { /* Non-JSON text is not ownership evidence. */ }
    }
  }
  const arrays: unknown[][] = []
  for (const candidate of candidates) {
    if (!record(candidate)) continue
    const payload = record(candidate.result) ? candidate.result : candidate
    if (Array.isArray(payload.projects)) arrays.push(payload.projects)
  }
  return arrays
}

/**
 * Retry only a read-only project listing with the server default selector.
 * Accept that response only when every returned project proves the requested
 * accountId. Empty, mixed, missing or conflicting ownership evidence fails
 * closed by returning the original server error. Never rewrite writes/slug.
 */
export async function withVerifiedProjectScope(
  rawName: string,
  args: Record<string, unknown>,
  invoke: ProjectScopeInvoker,
  signal?: AbortSignal,
): Promise<McpResult> {
  signal?.throwIfAborted()
  // The discovered list_projects schema declares limit as a string. Native
  // model calls can nevertheless supply an integer; preserve its value while
  // preventing the server from choosing its incompatible numeric-limit path.
  const request = rawName === 'list_projects' && typeof args.limit === 'number' && Number.isSafeInteger(args.limit) && args.limit > 0
    ? { ...args, limit: String(args.limit) }
    : args
  const first = await invoke(request)
  signal?.throwIfAborted()
  if (rawName !== 'list_projects' || typeof request.teamId !== 'string' || request.teamId.trim() === '' || request.slug !== undefined || !isExplicitScopeReauthenticationError(first)) return first
  const { teamId, ...defaultArgs } = request
  let fallback: McpResult
  try { fallback = await invoke(defaultArgs) } catch (error) {
    if (signal?.aborted) throw error
    return first
  }
  signal?.throwIfAborted()
  if (fallback.isError === true) return first
  const arrays = projectArrays(fallback)
  if (arrays.length === 0 || arrays.some(projects => projects.length === 0 || projects.some(project => !record(project) || project.accountId !== teamId))) return first
  const meta = record(fallback._meta) ? fallback._meta : {}
  return {
    ...fallback,
    _meta: {
      ...meta,
      [PROJECT_SCOPE_META_KEY]: {
        operation: 'list_projects',
        requestedTeamId: teamId,
        effectiveScope: 'server-default',
        ownerVerified: true,
        originalScopeError: 'forbidden_reauthentication',
      },
    },
    content: [
      ...(Array.isArray(fallback.content) ? fallback.content : []),
      { type: 'text', text: 'Scope compatibility: the server rejected explicit teamId. This read used the server-default scope only after verifying every returned project belongs to the requested accountId.' },
    ],
  }
}
