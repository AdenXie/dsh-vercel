/**
 * Model-facing projections of remote MCP input schemas.
 *
 * The remote catalog keeps every definition verbatim (catalog export, describe).
 * Only the schema declared to the model is reduced: annotations that do not
 * change which arguments are valid are dropped, nested prose is removed, and
 * very large top-level properties are collapsed to a typed stub whose full
 * structure is available through the describe helper. The Vercel server still
 * validates every call against its own schema.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** Keys whose values are maps of user-chosen names to subschemas. */
const NAME_MAPS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'])
/** Annotation keys with no effect on argument validity. */
const DROPPED_KEYS = new Set(['$schema', '$comment', 'title', 'example', 'examples', 'readOnly', 'writeOnly', 'deprecated'])
/** Descriptions are kept on the root and its direct properties only. */
const MAX_DESCRIPTION_DEPTH = 1
const MAX_DESCRIPTION_CHARACTERS = 400

/** Slimmed schemas above this many characters have their large properties collapsed. */
export const OVERSIZED_SCHEMA_CHARACTERS = 6_000
/** A top-level property larger than this is collapsed in an oversized schema. */
const COLLAPSE_PROPERTY_CHARACTERS = 400
/** Upper bound for one describe response. */
export const DESCRIBE_CHARACTERS = 6_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slimNode(node: unknown, depth: number, descriptionDepth = MAX_DESCRIPTION_DEPTH): Json {
  if (Array.isArray(node)) return node.map((value) => slimNode(value, depth, descriptionDepth))
  if (!isRecord(node)) return node as Json
  const out: Record<string, Json> = {}
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED_KEYS.has(key)) continue
    // Boolean additionalProperties only tightens or restates validation; schema-valued maps keep their item type.
    if (key === 'additionalProperties' && typeof value === 'boolean') continue
    if (key === 'description') {
      if (depth > descriptionDepth || typeof value !== 'string') continue
      out[key] = value.length > MAX_DESCRIPTION_CHARACTERS ? `${value.slice(0, MAX_DESCRIPTION_CHARACTERS)}…` : value
      continue
    }
    if (NAME_MAPS.has(key) && isRecord(value)) {
      const map: Record<string, Json> = {}
      for (const [name, schema] of Object.entries(value)) map[name] = slimNode(schema, depth + 1, descriptionDepth)
      out[key] = map
      continue
    }
    out[key] = slimNode(value, depth, descriptionDepth)
  }
  return out
}

/** Drop validation-neutral annotations and nested descriptions; property names and constraints are kept. */
export function slimSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return slimNode(schema, 0) as Record<string, unknown>
}

function stubFor(schema: Record<string, unknown>, propertyPath: string, describeTool: string): Record<string, unknown> {
  const types = typeof schema.type === 'string' || Array.isArray(schema.type)
    ? schema.type
    : Array.isArray(schema.anyOf ?? schema.oneOf)
      ? [...new Set(((schema.anyOf ?? schema.oneOf) as unknown[]).flatMap((option) => isRecord(option) && typeof option.type === 'string' ? [option.type] : []))]
      : undefined
  const hint = `结构较大，已折叠；调用 ${describeTool}({name, path:"${propertyPath}"}) 查看完整结构。`
  const description = typeof schema.description === 'string' ? `${schema.description.slice(0, 200)} ${hint}` : hint
  return {
    ...(types === undefined || (Array.isArray(types) && types.length === 0) ? {} : { type: Array.isArray(types) && types.length === 1 ? types[0] : types }),
    description,
  }
}

/**
 * Collapse the largest properties, biggest first, until the schema fits
 * `targetCharacters`. An object property is reduced inside first (its own
 * largest children), so a single wrapper such as `requestBody` keeps its small
 * fields inline. Required names, property order and small properties stay intact.
 */
export function collapseSchema(schema: Record<string, unknown>, describeTool: string, targetCharacters = OVERSIZED_SCHEMA_CHARACTERS, prefix = ''): { schema: Record<string, unknown>; collapsed: string[] } {
  if (!isRecord(schema.properties)) return { schema, collapsed: [] }
  const properties: Record<string, unknown> = { ...schema.properties }
  const candidates = Object.entries(schema.properties)
    .map(([name, value]) => ({ name, value, size: JSON.stringify(value).length }))
    .filter((candidate) => isRecord(candidate.value) && candidate.size > COLLAPSE_PROPERTY_CHARACTERS)
    .sort((a, b) => b.size - a.size)
  const collapsed: string[] = []
  let total = JSON.stringify(schema).length
  for (const { name, value, size } of candidates) {
    if (total <= targetCharacters) break
    const record = value as Record<string, unknown>
    const path = prefix === '' ? name : `${prefix}.${name}`
    let replacement: Record<string, unknown> = stubFor(record, path, describeTool)
    if (isRecord(record.properties)) {
      const inner = collapseSchema(record, describeTool, Math.max(COLLAPSE_PROPERTY_CHARACTERS, size - (total - targetCharacters)), path)
      const innerSize = JSON.stringify(inner.schema).length
      if (innerSize < size && total - size + innerSize <= targetCharacters) {
        replacement = inner.schema
        collapsed.push(...inner.collapsed)
      } else {
        collapsed.push(path)
      }
    } else {
      collapsed.push(path)
    }
    properties[name] = replacement
    total -= size - JSON.stringify(replacement).length
  }
  return { schema: { ...schema, properties }, collapsed }
}

/** The parameters actually declared to the model for one remote tool. */
export function modelParameters(name: string, description: string, inputSchema: Record<string, unknown>, describeTool: string): { parameters: Record<string, unknown>; collapsed: string[] } {
  const slim = slimSchema(inputSchema)
  const envelope = JSON.stringify({ name, description, parameters: {} }).length
  if (envelope + JSON.stringify(slim).length <= OVERSIZED_SCHEMA_CHARACTERS) return { parameters: slim, collapsed: [] }
  const { schema, collapsed } = collapseSchema(slim, describeTool, OVERSIZED_SCHEMA_CHARACTERS - envelope)
  return { parameters: schema, collapsed }
}

/**
 * Resolve a dot path through `properties`, array `items` and `anyOf`/`oneOf`
 * options of the original (unslimmed) schema. Numeric segments select an option.
 */
export function schemaAtPath(schema: Record<string, unknown>, dottedPath: string): Record<string, unknown> | undefined {
  let node: unknown = schema
  for (const segment of dottedPath.split('.').map((part) => part.trim()).filter(Boolean)) {
    if (!isRecord(node)) return undefined
    const options = (node.anyOf ?? node.oneOf) as unknown
    if (/^\d+$/.test(segment) && Array.isArray(options)) { node = options[Number(segment)]; continue }
    if (isRecord(node.properties) && Object.hasOwn(node.properties, segment)) { node = node.properties[segment]; continue }
    if (isRecord(node.items) && isRecord(node.items.properties) && Object.hasOwn(node.items.properties, segment)) { node = node.items.properties[segment]; continue }
    if (Array.isArray(options)) {
      const option = options.find((candidate) => isRecord(candidate) && isRecord(candidate.properties) && Object.hasOwn(candidate.properties, segment))
      if (isRecord(option) && isRecord(option.properties)) { node = option.properties[segment]; continue }
    }
    return undefined
  }
  return isRecord(node) ? node : undefined
}

/** Text for one describe call: the subschema, with large children collapsed when it exceeds the budget. */
export function describeSchema(schema: Record<string, unknown>, basePath: string, describeTool: string): string {
  // Describe output keeps prose at every depth; only validation-neutral annotations are dropped.
  const slim = slimNode(schema, 0, Number.POSITIVE_INFINITY) as Record<string, unknown>
  const full = JSON.stringify(slim)
  if (full.length <= DESCRIBE_CHARACTERS) return full
  const container = isRecord(slim.items) && isRecord(slim.items.properties) ? slim.items : slim
  if (isRecord(container.properties)) {
    const prefix = basePath === '' ? '' : `${basePath}.`
    const properties: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(container.properties)) {
      properties[name] = isRecord(value) && JSON.stringify(value).length > COLLAPSE_PROPERTY_CHARACTERS ? stubFor(value, prefix + name, describeTool) : value
    }
    const reduced = container === slim ? { ...slim, properties } : { ...slim, items: { ...container, properties } }
    const text = JSON.stringify(reduced)
    if (text.length <= DESCRIBE_CHARACTERS) return text
  }
  return `${full.slice(0, DESCRIBE_CHARACTERS)}…[已截断；请指定更深的 path]`
}
