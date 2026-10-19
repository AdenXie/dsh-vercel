import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile('src/scope.ts', 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { withVerifiedProjectScope, PROJECT_SCOPE_META_KEY } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
const failure = { isError: true, content: [{ type: 'text', text: '403 forbidden: You must re-authenticate to this scope' }] }
const owned = { content: [{ type: 'text', text: JSON.stringify({ result: { projects: [{ accountId: 'team_requested', id: 'fixture-project' }] } }) }], _meta: { upstream: 'kept' }, structuredContent: { result: { projects: [{ accountId: 'team_requested' }] } } }
const args = { teamId: 'team_requested', search: 'keep-filter', limit: '10' }
const calls = []
const result = await withVerifiedProjectScope('list_projects', args, async value => { calls.push(value); return calls.length === 1 ? failure : owned })
assert.equal(calls.length, 2)
assert.deepEqual(calls[1], { search: 'keep-filter', limit: '10' })
assert.equal(args.teamId, 'team_requested')
assert.equal(result._meta.upstream, 'kept')
assert.equal(result._meta[PROJECT_SCOPE_META_KEY].ownerVerified, true)
assert.deepEqual(result.structuredContent, owned.structuredContent)
const numericArgs = { teamId: 'team_requested', limit: 100, search: 'keep-filter' }
const numericCalls = []
const numericResult = await withVerifiedProjectScope('list_projects', numericArgs, async value => {
 numericCalls.push(value)
 assert.equal(value.limit, '100', 'upstream string limit must survive both calls')
 return numericCalls.length === 1 ? failure : owned
})
assert.equal(numericResult._meta[PROJECT_SCOPE_META_KEY].ownerVerified, true)
assert.deepEqual(numericCalls, [{ teamId: 'team_requested', limit: '100', search: 'keep-filter' }, { limit: '100', search: 'keep-filter' }])
assert.equal(numericArgs.limit, 100, 'do not mutate the model input')
await withVerifiedProjectScope('list_projects', { limit: 100 }, async value => { assert.deepEqual(value, { limit: '100' }); return owned })
for (const limit of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
 await withVerifiedProjectScope('list_projects', { limit }, async value => { assert.equal(value.limit, limit); return owned })
}
await withVerifiedProjectScope('create_project', { limit: 100 }, async value => { assert.equal(value.limit, 100); return owned })
for (const fallback of [
 { content: [{ type: 'text', text: JSON.stringify({ result: { projects: [] } }) }] },
 { content: [{ type: 'text', text: JSON.stringify({ result: { projects: [{ accountId: 'team_other' }] } }) }] },
 { content: [{ type: 'text', text: JSON.stringify({ result: { projects: [{ accountId: 'team_requested' }, {}] } }) }] },
 { content: [{ type: 'text', text: JSON.stringify({ result: { projects: [{ accountId: 'team_requested' }] } }) }], structuredContent: { projects: [{ accountId: 'team_other' }] } },
 { content: [{ type: 'text', text: 'not ownership evidence' }] }, failure,
]) {
 let count = 0
 const rejected = await withVerifiedProjectScope('list_projects', args, async () => ++count === 1 ? failure : fallback)
 assert.equal(rejected, failure)
}
for (const [name, value, first] of [
 ['create_project', args, failure], ['list_projects', { teamId: 'team_requested', slug: 'explicit-slug' }, failure],
 ['list_projects', {}, failure], ['list_projects', args, { isError: true, content: [{ type: 'text', text: '403 forbidden: policy denied' }] }],
 ['list_projects', args, owned],
]) { let count = 0; const kept = await withVerifiedProjectScope(name, value, async () => { count++; return first }); assert.equal(kept, first); assert.equal(count, 1) }
let count = 0
assert.equal(await withVerifiedProjectScope('list_projects', args, async () => { if (++count === 1) return failure; throw new Error('offline') }), failure)
const aborted = new AbortController()
let abortCalls = 0
await assert.rejects(withVerifiedProjectScope('list_projects', args, async () => { if (++abortCalls === 1) return failure; aborted.abort(new Error('fixture cancelled')); throw aborted.signal.reason }, aborted.signal), /fixture cancelled/)
console.log('project scope: PASS (verified same-owner read-only fallback, unchanged filters, fail-closed ambiguity, no writes/slug rewrite)')
