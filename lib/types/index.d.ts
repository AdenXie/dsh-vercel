/**
 * @adenxie/dsh-vercel — Vercel MCP connection for DeepSeek Harness.
 * Host half.
 *
 * Mounts the Vercel MCP server tools (https://mcp.vercel.com)
 * under `mcp__adenxie_vercel__*` once the official OAuth flow completes, the
 * /api/adenxie/dsh-vercel route family the settings panel talks to, the
 * OAuth callback route, a small set of agent-facing helper tools
 * (adenxie_vercel_*), and a system-prompt announcement. OAuth tokens live
 * in ~/.dsh/adenxie-dsh-vercel.json (mode 0600). Everything rides official
 * npm packages (@modelcontextprotocol/sdk) — no dsh source changes.
 *
 * Auth is the MCP OAuth 2.0 flow against mcp.vercel.com: dynamic
 * client registration (PKCE S256), loopback callback on the GUI's own web
 * server, refresh_token grant. See src/oauth.ts.
 */
import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { VercelMcpStore } from './store.ts';
import { OAuthFlow } from './oauth.ts';
import { type McpSupervisor } from './mcp.ts';
import { VERCEL_MCP_API } from './routes.ts';
/** Stable cordis plugin name. */
export declare const name = "adenxie-dsh-vercel";
/** Services required before the surfaces can mount. */
export declare const inject: string[];
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export declare const VERCEL_MCP_GUIDANCE: string;
/** Plugin config, read from the composition row. */
export interface Config {
    /** When true (default), a system-prompt section announces the plugin. */
    announceToAgent?: boolean;
    /** Master switch for the plugin (routes, tools, prompt section). */
    enabled?: boolean;
}
/**
 * Mount the Vercel MCP tools, helper tools, routes, and announcement.
 * @param ctx - host plugin context carrying tools/systemPrompt/webServer.
 * @param config - plugin config from the composition row.
 */
export declare function apply(ctx: Context, config?: Config): void;
/** Re-export for the settings panel's route table. */
export { VERCEL_MCP_API };
/** Re-exports for host consumers and the smoke tests. */
export { VercelMcpStore, mask, configPath, MCP_URL, type VercelMcpConfigView } from './store.ts';
export { OAuthFlow, VercelOAuthProvider, parseManualCallback, VERCEL_OAUTH_SCOPE, type PendingFlow, type RefreshOutcome } from './oauth.ts';
export { createSupervisor, mapPublicToolName, registerMcpResultSemantics, type McpSupervisor, type McpToolCatalogEntry } from './mcp.ts';
export { makeRoutes } from './routes.ts';
export { defineTool };
export interface VercelSkillSummary {
    name: string;
    description: string;
    path: string;
}
export declare function listVercelSkills(query?: string): Promise<VercelSkillSummary[]>;
export declare function readVercelSkill(relativePath: string): Promise<string>;
/** Shared tool dependencies. */
export interface ToolContext {
    store: VercelMcpStore;
    flow: OAuthFlow;
    supervisor: McpSupervisor;
    callbackUrl: string;
}
/** Build the bounded, agent-scoped catalog and result controls. */
export declare function createOnDemandTools(supervisor: McpSupervisor): ReturnType<typeof defineTool>[];
