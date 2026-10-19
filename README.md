<h1 align="center">dsh-vercel</h1>

<p align="center">
  Vercel projects, deployments, and platform tools for DeepSeek Harness.<br>
  Connect with OAuth and load Vercel skill guidance when you need it.
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.4.0-2563eb" alt="Package version 0.4.0"></a>
  <a href="https://www.npmjs.com/package/@adenxie/dsh-vercel"><img src="https://img.shields.io/npm/v/%40adenxie%2Fdsh-vercel?logo=npm&amp;color=CB3837" alt="npm version"></a>
  <a href="#install"><img src="https://img.shields.io/badge/DSH-0.2.1--rc.2-2563eb" alt="DSH compatibility target 0.2.1-rc.2"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-22.19%2B%20or%2024%2B-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 22.19+ or 24+; see package.json for the exact range"></a>
  <a href="#connect-to-vercel"><img src="https://img.shields.io/badge/OAuth-PKCE-8b5cf6" alt="OAuth with PKCE"></a>
  <a href="skills/vercel"><img src="https://img.shields.io/badge/Vercel_skills-34-f97316" alt="34 bundled Vercel skills"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-0f766e" alt="Connection code licensed under MIT"></a>
  <a href="LICENSES/VERCEL-APACHE-2.0.txt"><img src="https://img.shields.io/badge/skills-Apache_2.0-0f766e" alt="Vercel skills licensed under Apache 2.0"></a>
  <a href="docs/VALIDATION-0.4.0.zh.md"><img src="https://img.shields.io/badge/status-verified-0f766e" alt="Verified in Desktop and an isolated Host profile"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@adenxie/dsh-vercel"><img src="https://img.shields.io/badge/Install_from_npm-CB3837?style=for-the-badge&amp;logo=npm" alt="Install from npm"></a>
  <a href="https://github.com/AdenXie/dsh-vercel/releases/download/v0.4.0/adenxie-dsh-vercel-0.4.0.tgz"><img src="https://img.shields.io/badge/Download_tgz-111827?style=for-the-badge&amp;logo=github" alt="Download the 0.4.0 tarball"></a>
  <a href="#install"><img src="https://img.shields.io/badge/Quick_start-111827?style=for-the-badge" alt="Quick start"></a>
  <a href="#vercel-skills"><img src="https://img.shields.io/badge/Skills-111827?style=for-the-badge" alt="Skill guide"></a>
  <a href="docs/VERCEL_PARITY_AUDIT.zh.md"><img src="https://img.shields.io/badge/Feature_comparison-111827?style=for-the-badge" alt="Feature comparison"></a>
  <a href="#development"><img src="https://img.shields.io/badge/Development-111827?style=for-the-badge" alt="Local development"></a>
</p>

<p align="center">English · <a href="README.zh.md">简体中文</a></p>

`@adenxie/dsh-vercel` connects DeepSeek Harness to Vercel's official MCP server. After you sign in to Vercel once, the model can look up your projects, deployments, and teams, and read any of the 34 bundled Vercel skill guides when it needs them. The current version is 0.4.0.

## Install

You need DeepSeek Harness `0.2.1-rc.2` through `0.2.x` and Node.js `^22.19.0 || >=24.0.0`. Desktop and Web use separate profiles, so install into the one that actually runs the plugin.

### From npm

Open DSH Desktop once so it creates its profile, quit it completely, then install with the CLI that ships with Desktop:

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $DshCli plugin --profile desktop add '@adenxie/dsh-vercel@0.4.0'
```

Start Desktop again when it finishes. For a Web profile, run `dsh plugin --profile web add @adenxie/dsh-vercel@0.4.0`.

### From the tarball

Download `adenxie-dsh-vercel-0.4.0.tgz` from the [0.4.0 Release](https://github.com/AdenXie/dsh-vercel/releases/tag/v0.4.0), or run `npm pack` in a checkout to build it. Quit Desktop as above, then run this in the folder that holds the file:

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Archive = (Resolve-Path './adenxie-dsh-vercel-0.4.0.tgz').Path
& $DshCli plugin --profile desktop add $Archive
```

On other platforms, run `dsh plugin --profile web add /path/to/adenxie-dsh-vercel-0.4.0.tgz` with your own path and profile.

### From source

Use this for development. For everyday use, the npm package or tarball is simpler.

```powershell
git clone https://github.com/AdenXie/dsh-vercel.git
Set-Location dsh-vercel
pnpm install --frozen-lockfile
pnpm run build
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Checkout = (Get-Location).Path
& $DshCli plugin --profile desktop add "link:$Checkout"
```

On other platforms, run `dsh plugin --profile web add link:/path/to/dsh-vercel` and restart that Host. The examples find Desktop's bundled CLI through `$env:LOCALAPPDATA`, so you don't need `dsh` on your PATH.

## Connect to Vercel

Run `adenxie_vercel_mcp_account` with `action=login` the first time and sign in through the browser. Once connected, Vercel's MCP tools show up as `mcp__adenxie_vercel__*`. The same tool's `status`, `test`, and `clear` actions show the connection state, test it, or clear credentials; the settings panel does the same and can also refresh the token.

Authorization requests `openid offline_access` so that Vercel issues a refresh token. If you're upgrading and your old authorization has no refresh token, authorize again from the settings panel. Your existing credentials stay in place until the new authorization succeeds.

To finish authorization by hand, use `action=finish` with the full callback URL (with `code` and `state`), or both values separately. A bare code is rejected because the plugin checks `state`.

## On-demand tools

Vercel's server exposes more than two hundred tools, and sending all of them to the model would use a large part of its context. Each Agent therefore starts with eight helper tools. Search with `adenxie_vercel_mcp_search_tools`, then pass the names you want to `adenxie_vercel_mcp_load_tools`, and those Vercel tools appear in that Agent on the next turn. If you already know a raw Vercel tool name such as `list_projects`, load it directly without searching.

- An Agent can have up to six tools loaded at once, with a combined schema of at most 32,000 characters.
- On `deepseek-flash`, tools loaded mid-session are sent as deferred declarations, and in testing the model sometimes did not treat them as callable until the context was compacted. In that case `adenxie_vercel_mcp_call` takes `name` and `arguments` and calls a loaded tool. It dispatches the real tool name as a nested call inside DSH, so approvals, guards, and policies apply exactly as for a direct call, and it cannot reach a tool the Agent has not loaded.
- Avoid unloading. The DeepSeek route updates tool lists in `addition-only` mode: an added tool is appended after the conversation history and the prompt cache still hits, while unloading or `mode=replace` rewrites the tool list and every later request misses the cache. Use `adenxie_vercel_mcp_unload_tools` only when the budget is full.
- Loaded tools belong to the current Agent. A child Agent can load only tools its parent has loaded, and DSH's own host restrictions still apply.
- A disconnect clears loaded tools. After reconnecting, search and load again.

### Slimmed schemas

The schemas declared to the model are slimmed. Annotations that don't affect which arguments are valid (`$schema`, `title`, `example(s)`, boolean `additionalProperties`) are dropped, and parameter descriptions are kept only at the first level. Property names, types, enums, and `required` stay exactly as they are, the Vercel server still validates every call against its full schema, and the exported catalog is unchanged.

Tools still over 6,000 characters after slimming (currently ten, including `update_project` and `create_deployment`) have their largest properties folded into a stub with only the type and a hint; the rest stay inline. When the model needs a folded part, `adenxie_vercel_mcp_describe_tool` returns its full structure by path (for example `requestBody.framework`) without loading the tool.

Across the 237-tool snapshot, declarations drop from about 486,000 to 291,000 characters (40% smaller), no single tool exceeds 6,000, and the startup cost before anything is loaded is eight tools at 2,882 characters plus a 400-character prompt section (0.3.1 had eleven tools at 2,974 plus 871). These are serialized characters, not tokens.

## Long results

When a tool returns more than 12,000 characters, the result is cut and the structured result carries a result handle.

- Plain text: the model sees the first 12,000 characters. Call `adenxie_vercel_mcp_read_result` with the `resultId` and the previous page's `nextOffset` to read on, up to 12,000 characters per page.
- JSON (deployment lists, project lists and so on): the model sees only the first 4,000 characters plus an outline of the top-level keys, array lengths, and the fields inside array items. It can then read just the fields it needs, for example `read_result({resultId, path: "deployments", fields: ["uid", "state", "url"], limit: 50})`; here `offset` and `limit` count items, up to 200 per call. Without `path` or `fields` it pages by characters as before.

Each Agent has its own cache of up to eight results and one million characters in total; the oldest results are evicted first. The cache is cleared when the Agent is disposed or the MCP connection closes. If a result can't be continued (too large to cache, expired, or the handle belongs to another Agent), the tool says so and suggests narrowing the query.

## Vercel skills

The package bundles 34 skills from [vercel/vercel-plugin](https://github.com/vercel/vercel-plugin), covering deployments and CI/CD, domains, environment variables, Functions, storage, the AI SDK, and more. The model uses them through `adenxie_vercel_skill`: without `path` it lists skills (filtered by `query`), with `path` it reads a skill or one of its reference files. They are not registered as native DSH skills, so the model decides when to read them.

Skills contain CLI commands, deployment steps, and automation snippets. The plugin only serves the text and never runs any of it. The prompt section also tells the model not to read the plugin's credentials file or bypass the plugin to reach Vercel directly, but that is guidance, not enforcement: an Agent with local file and shell access can still read `~/.dsh/adenxie-dsh-vercel.json`, so control such actions with DSH's approval policy. When following a skill, go by the `mcp__adenxie_vercel__*` tools that are actually available, and check `vercel --help` locally before relying on a CLI command. Before deploying, confirm the project and the target environment, and keep preview and production apart. Upstream hooks, script runners, and Codex-specific configuration are not included.

## Configuration and endpoints

- Credentials live in `~/.dsh/adenxie-dsh-vercel.json` with mode 0600. Set `DSH_VERCEL_CONFIG` to use another path. If the new file doesn't exist and the legacy `~/.dsh/dsh-vercel.json` does, the plugin copies the legacy file over and leaves the original untouched.
- The DSH Bundle row and settings ID is `adenxie-dsh-vercel`, the settings API lives under `/api/adenxie/dsh-vercel/`, and local helpers use the `adenxie_vercel_*` prefix, so the plugin doesn't collide with other Vercel plugins. The browser module loader ID matches the package name `@adenxie/dsh-vercel`, as DSH's client module table requires.
- Once connected, the loopback-only `GET /api/adenxie/dsh-vercel/catalog` endpoint returns the full tool catalog: remote and mapped names, input and output schemas, annotations, and metadata. Annotations are hints from the server and do not enforce access control.
- MCP `structuredContent` and `_meta` are kept in DSH's structured result. `_meta` is never sent to the model as text.

## Limits

- Which tools you get depends on your Vercel account, your team permissions, and what the server currently offers.
- Vercel write and deployment operations have not been tested yet. Live testing so far covers authorization, token refresh, reconnecting, and read-only project queries.
- The plugin adds no approval step of its own for write operations and doesn't approve or reject anything based on annotations. Approval follows DSH's host policy.
- Images, audio, and other multimodal content stay in the structured result, and the model sees placeholder text. Remote MCP App/widget interfaces are not embedded.
- Compared with Codex's Vercel plugin, 234 of the 237 tool names match, but the two plugins are not fully equivalent. See the [feature comparison](docs/VERCEL_PARITY_AUDIT.zh.md).

The [verification record](docs/VALIDATION-0.4.0.zh.md) describes each check and its result. The [project-scope note](docs/PROJECT_SCOPE_COMPAT.zh.md) covers how `list_projects` is handled under an explicit team scope.

## Sources and licenses

I'm AdenXie, and I develop and maintain this project. The original MCP connection layer came from [zhengjy01/dsh-vercel-mcp](https://github.com/zhengjy01/dsh-vercel-mcp). On top of it I added scoped naming, on-demand tool loading, result paging, metadata preservation, and several compatibility fixes. The original MIT copyright and permission notice are kept in [LICENSE](LICENSE).

The bundled Vercel skills come from `vercel/vercel-plugin` at commit `137e9f44a243a939c5eaea30e4dff96aee744f64` and are distributed under the Apache License 2.0. The license text and attribution are in `LICENSES/`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm test
npm pack --dry-run
```

Tests run against a local HTTP MCP server and a temporary credentials directory that is deleted afterward, so they never touch your real credentials file. Live authorization, real token refresh, and DSH UI checks need an authorized environment and are run separately.
