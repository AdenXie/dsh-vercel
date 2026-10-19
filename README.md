<h1 align="center">dsh-vercel</h1>

<p align="center">
  Vercel projects, deployments, and platform tools for DeepSeek Harness.<br>
  Connect with OAuth and load Vercel skill guidance when you need it.
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.3.1-2563eb" alt="Package version 0.3.1"></a>
  <a href="README.zh.md#安装"><img src="https://img.shields.io/badge/DSH-0.2.1--rc.2-2563eb" alt="DSH compatibility target 0.2.1-rc.2"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-22.19%2B%20or%2024%2B-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 22.19+ or 24+; see package.json for the exact range"></a>
  <a href="README.zh.md#安装"><img src="https://img.shields.io/badge/OAuth-PKCE-8b5cf6" alt="OAuth with PKCE"></a>
  <a href="skills/vercel"><img src="https://img.shields.io/badge/Vercel_skills-34-f97316" alt="34 bundled Vercel skills"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-0f766e" alt="Connection code licensed under MIT"></a>
  <a href="LICENSES/VERCEL-APACHE-2.0.txt"><img src="https://img.shields.io/badge/skills-Apache_2.0-0f766e" alt="Vercel skills licensed under Apache 2.0"></a>
  <a href="docs/VALIDATION-0.3.1.zh.md"><img src="https://img.shields.io/badge/status-verified-0f766e" alt="Verified in Desktop and an isolated Host profile"></a>
</p>

<p align="center">
  <a href="README.zh.md#安装"><img src="https://img.shields.io/badge/Quick_start-111827?style=for-the-badge" alt="Quick start"></a>
  <a href="README.zh.md#官方技能"><img src="https://img.shields.io/badge/Skills-111827?style=for-the-badge" alt="Skill guide"></a>
  <a href="docs/VERCEL_PARITY_AUDIT.zh.md"><img src="https://img.shields.io/badge/Feature_comparison-111827?style=for-the-badge" alt="Feature comparison"></a>
  <a href="README.zh.md#本地开发"><img src="https://img.shields.io/badge/Development-111827?style=for-the-badge" alt="Local development"></a>
</p>

<p align="center">English · <a href="README.zh.md">简体中文</a></p>

> `@adenxie/dsh-vercel` 0.3.1. I have verified the plugin in DSH Desktop and an isolated Host profile. See the [verification record](docs/VALIDATION-0.3.1.zh.md) for the checks and their limits.

## Install

Initialize and fully quit DSH Desktop, then install the npm package with the bundled CLI:

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $DshCli plugin --profile desktop add '@adenxie/dsh-vercel@0.3.1'
```

Restart Desktop afterward. For a Web profile, use `dsh plugin --profile web add @adenxie/dsh-vercel@0.3.1`.

### Local tarball or source checkout

Build the local checkout and run `npm pack` to produce `adenxie-dsh-vercel-0.3.1.tgz`. I recommend this packaged installation for regular use. Initialize and fully quit Desktop, then run PowerShell in the archive directory:

```powershell
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Archive = (Resolve-Path './adenxie-dsh-vercel-0.3.1.tgz').Path
& $DshCli plugin --profile desktop add $Archive
```

Restart Desktop afterward. On another platform, use `dsh plugin --profile web add /path/to/adenxie-dsh-vercel-0.3.1.tgz` with your actual path and profile. To build from source instead:

Build the checkout before installing. Desktop and Web use separate profiles. For Desktop, initialize its profile once and fully quit the app, then run this in PowerShell:

```powershell
git clone https://github.com/AdenXie/dsh-vercel.git
Set-Location dsh-vercel
pnpm install --frozen-lockfile
pnpm run build
$DshCli = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
$Checkout = (Get-Location).Path
& $DshCli plugin --profile desktop add "link:$Checkout"
```

These commands clone and build the source, then install the local checkout. Restart Desktop after installation. On other platforms, use the installed `dsh` CLI with `dsh plugin --profile web add link:/path/to/dsh-vercel`, replacing the path and profile for your setup. See the [Chinese guide](README.zh.md) for authorization and current limitations. Exact supported versions are declared in [package.json](package.json).

The package is scoped as `@adenxie/dsh-vercel`; DSH's Bundle row and settings panel use the unique ID `adenxie-dsh-vercel`. Its loopback-only API is under `/api/adenxie/dsh-vercel/`, and remote MCP tools use `mcp__adenxie_vercel__*` to avoid collisions with other Vercel plugins. Local helpers use the `adenxie_vercel_*` prefix. The browser module loader ID matches the scoped package name, as required by DSH's client module table.

I tested the scoped tarball in an isolated DSH profile. The real Host served the revisioned client bundle with a matching module ID; startup, disable, re-enable, and uninstall checks passed.

Fresh authorization requests `openid offline_access` so Vercel can issue a refresh token. Credentials use `~/.dsh/adenxie-dsh-vercel.json`. On first load, if that file is absent, the plugin copies the legacy `~/.dsh/dsh-vercel.json` to the new file and leaves the old file untouched; an existing new file always takes precedence. Existing credentials remain in place until reauthorization succeeds. If an older authorization has no refresh token, use the settings panel to authorize again. The loopback-only `GET /api/adenxie/dsh-vercel/catalog` endpoint returns the connected MCP tool catalogue, including mapped names, schemas, annotations, and metadata. Annotations are server hints and do not enforce access control. MCP structured results and any `_meta` are preserved in DSH's structured result fields; `_meta` is not rendered as model text.

## On-demand tool schemas

The complete remote catalog stays registered with DSH, while each Agent initially sees only the catalog controls. Call `adenxie_vercel_mcp_search_tools`, then `adenxie_vercel_mcp_load_tools` with the returned names; the native Vercel tools become visible only in that Agent. Each Agent can load at most four tools with a combined schema budget of 32,000 characters. Use `replace` or `adenxie_vercel_mcp_unload_tools` to free capacity. A child Agent can load only tools its parent has loaded, and DSH host restrictions still apply. Disconnecting clears loaded schemas; search and load again after reconnecting.

Long tool results show the first 12,000 characters in model text and include a result handle in structured metadata when cached. Continue with `adenxie_vercel_mcp_read_result`, passing that `resultId` and the previous page's `nextOffset`; each page is limited to 12,000 characters. The cache holds at most eight results and one million characters per Agent, evicting the oldest entries when needed. Handles belong to the Agent that received the result and are cleared when the Agent is disposed or the MCP connection closes. Results too large to cache, agentless results, expired handles, and handles from another Agent cannot be continued; the tool response explains when you need to narrow the query.

On 2026-10-19, I checked the production plugin with the real DSH `ToolRuntime` and found 237 Vercel tools. The initial model schema was 2,986 characters for this plugin, compared with 488,972 characters for all 237 tools; the plugin schema footprint fell by 99.39%. Loading one tool exposed it only to Agent A, and the explicit-team `list_projects` call returned seven projects with verified ownership. The [project-scope compatibility note](docs/PROJECT_SCOPE_COMPAT.zh.md) describes that narrowly scoped read fallback. These schema measurements count serialized characters, not tokens, and cover this plugin's schemas rather than the whole application.

## Verification and limits

- I exported 237 tools from an authenticated DSH connection. A normalized name comparison with the Codex directory found 234 matches; three names appeared only in DSH and one only in Codex. The snapshots record that comparison; I have not executed every platform operation.
- I verified tarball startup, the revisioned client bundle and boot module ID, disable/re-enable behavior, and uninstall cleanup in an isolated DSH profile.
- I verified real reauthorization and token refresh, including rotation of access and refresh tokens. With the real DSH `ToolRuntime`, namespaced `list_projects` succeeded before and after an explicit connection restart, restoring all 237 tools. I also listed all 34 bundled skills and read their main files through the production loader. In Desktop chats, I verified model-driven reading of the deployments-cicd skill and the search → load → native project-query flow; selection in other tasks still depends on the model.
- I confirmed that discovery annotations and `_meta` survive for all 237 tools. The tested `list_projects` response itself had no `_meta`, so I checked response metadata preservation with a local MCP fixture. Automatic network-failure recovery remains fixture-only; my live check used an explicit restart.
- My offline tests cover result metadata, OAuth failure/rotation paths, and credential migration using temporary files and a local MCP server. I have not verified Vercel writes or deployment.
- The plugin keeps its on-demand skill list/read helpers and does not register native `ctx.skills`. It has no Vercel-specific pre-execution gate or embedded MCP App/widget UI; image and audio blocks are retained in structured results but do not receive native rendering.

## Sources and licenses

I develop and maintain this project as AdenXie. I based the initial MCP connection layer on [zhengjy01/dsh-vercel-mcp](https://github.com/zhengjy01/dsh-vercel-mcp) and retain its MIT copyright and permission notice in [LICENSE](LICENSE). I extended that foundation with scoped plugin identities, on-demand tool loading, bounded result paging, metadata preservation, and compatibility fixes.

The bundled Vercel skills are from `vercel/vercel-plugin` at commit `137e9f44a243a939c5eaea30e4dff96aee744f64` and are distributed under Apache-2.0. See `LICENSES/` for their license and attribution.
