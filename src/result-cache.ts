/** Bounded, process-local text paging; identifiers are usable only by their owning Agent. */
import { randomUUID } from 'node:crypto'

export const MODEL_RESULT_CHARACTERS = 12_000
export const MAX_CACHED_RESULT_CHARACTERS = 1_000_000
export const MAX_CACHED_RESULTS = 8
export const RESULT_PAGE_META_KEY = 'dsh-vercel/result-page'

export interface ResultPage {
  resultId: string
  text: string
  offset: number
  nextOffset: number | null
  totalCharacters: number
}

export class AgentResultCache {
  private owners = new WeakMap<object, Map<string, string>>()

  /** Keep the complete rendered text when it fits; evict oldest entries to retain a fixed budget. */
  put(owner: object, text: string): string | undefined {
    if (text.length > MAX_CACHED_RESULT_CHARACTERS) return undefined
    const entries = this.owners.get(owner) ?? new Map<string, string>()
    this.owners.set(owner, entries)
    let total = [...entries.values()].reduce((sum, value) => sum + value.length, 0)
    while (entries.size >= MAX_CACHED_RESULTS || total + text.length > MAX_CACHED_RESULT_CHARACTERS) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      total -= entries.get(oldest)!.length
      entries.delete(oldest)
    }
    const id = randomUUID()
    entries.set(id, text)
    return id
  }

  /** Bounds are JS string characters, consistent with the schema/output budgets. */
  read(owner: object, resultId: string, offset = 0, limit = MODEL_RESULT_CHARACTERS): ResultPage | undefined {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > MODEL_RESULT_CHARACTERS) throw new Error('Result page offset/limit is outside the supported range.')
    const text = this.owners.get(owner)?.get(resultId)
    if (text === undefined) return undefined
    if (offset > text.length) throw new Error('Result page offset exceeds the stored text length.')
    const end = Math.min(text.length, offset + limit)
    return { resultId, text: text.slice(offset, end), offset, nextOffset: end < text.length ? end : null, totalCharacters: text.length }
  }

  clear(owner?: object): void {
    if (owner === undefined) this.owners = new WeakMap()
    else this.owners.delete(owner)
  }
}
