/** Bounded, process-local result paging; identifiers are usable only by their owning Agent. */
import { randomUUID } from 'node:crypto'

export const MODEL_RESULT_CHARACTERS = 12_000
/** Preview length for JSON results, which also get a structural outline. */
export const JSON_PREVIEW_CHARACTERS = 4_000
export const MAX_CACHED_RESULT_CHARACTERS = 1_000_000
export const MAX_CACHED_RESULTS = 8
export const MAX_PROJECTED_ITEMS = 200
export const RESULT_PAGE_META_KEY = 'dsh-vercel/result-page'
const MAX_OUTLINE_CHARACTERS = 1_200
const MAX_OUTLINE_KEYS = 24

export interface ResultPage {
  resultId: string
  text: string
  offset: number
  nextOffset: number | null
  totalCharacters: number
}

export interface ProjectedPage {
  resultId: string
  path: string
  text: string
  offset: number
  nextOffset: number | null
  totalItems: number
}

interface CachedResult {
  text: string
  json?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function typeLabel(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`
  if (value === null) return 'null'
  return typeof value
}

function itemKeys(items: unknown[]): string {
  const keys = new Set<string>()
  for (const item of items.slice(0, 5)) if (isRecord(item)) for (const key of Object.keys(item)) keys.add(key)
  const list = [...keys]
  return list.length === 0 ? '' : ` 条目字段: ${list.slice(0, MAX_OUTLINE_KEYS).join(',')}${list.length > MAX_OUTLINE_KEYS ? ',…' : ''}`
}

/** Compact structure summary: top-level keys, arrays with lengths and the fields of their items. */
export function outlineJson(value: unknown): string {
  const lines: string[] = []
  if (Array.isArray(value)) lines.push(`(根) ${typeLabel(value)}${itemKeys(value)}`)
  else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value).slice(0, MAX_OUTLINE_KEYS)) {
      lines.push(`${key}: ${typeLabel(child)}${Array.isArray(child) ? itemKeys(child) : isRecord(child) ? ` {${Object.keys(child).slice(0, 12).join(',')}}` : ''}`)
    }
  }
  return lines.join('\n').slice(0, MAX_OUTLINE_CHARACTERS)
}

/** Parse result text that is itself a JSON document; anything else stays plain text. */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim()
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return undefined
  try { return JSON.parse(trimmed) as unknown } catch { return undefined }
}

function valueAtPath(value: unknown, dottedPath: string): unknown {
  let node = value
  for (const segment of dottedPath.split('.').map((part) => part.trim()).filter(Boolean)) {
    if (Array.isArray(node) && /^\d+$/.test(segment)) node = node[Number(segment)]
    else if (isRecord(node) && Object.hasOwn(node, segment)) node = node[segment]
    else return undefined
  }
  return node
}

function pick(item: unknown, fields: string[]): unknown {
  if (fields.length === 0 || !isRecord(item)) return item
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    const value = valueAtPath(item, field)
    if (value !== undefined) out[field] = value
  }
  return out
}

/** The first array inside the value, when the caller gives no path: the root, then each top-level key in order. */
function defaultArrayPath(value: unknown): string | undefined {
  if (Array.isArray(value)) return ''
  if (!isRecord(value)) return undefined
  return Object.entries(value).find(([, child]) => Array.isArray(child))?.[0]
}

export class AgentResultCache {
  private owners = new WeakMap<object, Map<string, CachedResult>>()

  /** Keep the complete rendered text (and parsed JSON) when it fits; evict oldest entries to retain a fixed budget. */
  put(owner: object, text: string, json?: unknown): string | undefined {
    if (text.length > MAX_CACHED_RESULT_CHARACTERS) return undefined
    const entries = this.owners.get(owner) ?? new Map<string, CachedResult>()
    this.owners.set(owner, entries)
    let total = [...entries.values()].reduce((sum, value) => sum + value.text.length, 0)
    while (entries.size >= MAX_CACHED_RESULTS || total + text.length > MAX_CACHED_RESULT_CHARACTERS) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      total -= entries.get(oldest)!.text.length
      entries.delete(oldest)
    }
    const id = randomUUID()
    entries.set(id, json === undefined ? { text } : { text, json })
    return id
  }

  /** Bounds are JS string characters, consistent with the schema/output budgets. */
  read(owner: object, resultId: string, offset = 0, limit = MODEL_RESULT_CHARACTERS): ResultPage | undefined {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MODEL_RESULT_CHARACTERS) throw new Error('Result page offset/limit is outside the supported range.')
    const text = this.owners.get(owner)?.get(resultId)?.text
    if (text === undefined) return undefined
    if (offset > text.length) throw new Error('Result page offset exceeds the stored text length.')
    const end = Math.min(text.length, offset + limit)
    return { resultId, text: text.slice(offset, end), offset, nextOffset: end < text.length ? end : null, totalCharacters: text.length }
  }

  /**
   * Page through an array inside a cached JSON result, keeping only the given
   * fields of each item. offset/limit count items; the page stops early rather
   * than exceed the model text budget.
   */
  project(owner: object, resultId: string, options: { path?: string; fields?: string[]; offset?: number; limit?: number }): ProjectedPage | undefined {
    const cached = this.owners.get(owner)?.get(resultId)
    if (cached === undefined) return undefined
    if (cached.json === undefined) throw new Error('This result is not JSON; page it by characters without path/fields.')
    const offset = options.offset ?? 0
    const limit = options.limit ?? 50
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PROJECTED_ITEMS) throw new Error(`Item offset/limit is outside the supported range (limit 1-${MAX_PROJECTED_ITEMS}).`)
    const fields = (options.fields ?? []).filter((field) => typeof field === 'string' && field.trim() !== '').slice(0, 32)
    const path = options.path ?? defaultArrayPath(cached.json) ?? ''
    const target = valueAtPath(cached.json, path)
    if (target === undefined) throw new Error(`No value at path "${path}".`)
    if (!Array.isArray(target)) {
      const text = JSON.stringify(pick(target, fields))
      return { resultId, path, text: text.slice(0, MODEL_RESULT_CHARACTERS), offset: 0, nextOffset: null, totalItems: 1 }
    }
    if (offset > target.length) throw new Error('Item offset exceeds the array length.')
    const lines: string[] = []
    let used = 0
    let index = offset
    for (; index < Math.min(target.length, offset + limit); index++) {
      const line = JSON.stringify(pick(target[index], fields))
      if (lines.length > 0 && used + line.length + 1 > MODEL_RESULT_CHARACTERS) break
      lines.push(line.slice(0, MODEL_RESULT_CHARACTERS))
      used += line.length + 1
    }
    return { resultId, path, text: lines.join('\n'), offset, nextOffset: index < target.length ? index : null, totalItems: target.length }
  }

  clear(owner?: object): void {
    if (owner === undefined) this.owners = new WeakMap()
    else this.owners.delete(owner)
  }
}
