/**
 * dsh-vercel — MCP connection supervisor.
 *
 * Keeps the server's public tool definitions and call results as JSON values.
 * DSH's model-facing text projection intentionally excludes MCP `_meta`; it
 * remains namespaced in DSH presentation metadata for host-side consumers.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools';
import { type VercelMcpStore } from './store.ts';
import type { OAuthFlow } from './oauth.ts';
import { type ProjectedPage, type ResultPage } from './result-cache.ts';
/** Helper that returns the full structure behind collapsed schema properties. */
export declare const DESCRIBE_TOOL_NAME = "adenxie_vercel_mcp_describe_tool";
export interface McpToolSearchResult {
    name: string;
    title?: string;
    description: string;
}
export interface McpToolCatalogEntry {
    rawName: string;
    publicName: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    execution?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
    icons?: Array<Record<string, unknown>>;
}
/** Derive the DSH public name. Lossy/long mappings get a stable identity suffix. */
export declare function mapPublicToolName(rawName: string): string;
/** Characters of the declaration the model actually receives for this tool. */
export declare function modelSchemaCharacters(entry: McpToolCatalogEntry): number;
/** Map an MCP tool's protocol-level error flag into DSH's result contract. */
export declare function mapMcpToolError(result: ToolExecutionResult): ToolExecutionResult;
/** Install the narrow DSH waterfall adapter that preserves MCP error status. */
export declare function registerMcpResultSemantics(ctx: Context): () => boolean;
export interface McpSupervisorOptions {
    /** Test seam for loopback protocol tests; production defaults to the Vercel endpoint. */
    serverUrl?: string;
}
export interface McpSupervisor {
    start(): Promise<void>;
    isConnected(): boolean;
    /** Number of remote definitions currently registered in the host catalog. */
    toolCount(): number;
    /** Alias that makes the catalog/session distinction explicit to UI callers. */
    availableToolCount(): number;
    loadedToolCount(agent: Agent | undefined): number;
    loadedSchemaCharacters(agent: Agent | undefined): number;
    listTools(): Promise<string[]>;
    listToolCatalog(): Promise<McpToolCatalogEntry[]>;
    searchTools(agent: Agent | undefined, query: string, limit?: number): McpToolSearchResult[];
    /** Accepts namespaced names or raw Vercel MCP names. */
    loadTools(agent: Agent | undefined, names: string[], replace?: boolean): string[];
    /** Full input structure of one tool (or one property path), independent of loading. */
    describeTool(agent: Agent | undefined, name: string, path?: string): {
        name: string;
        path: string;
        collapsed: string[];
        schema: string;
    };
    unloadTools(agent: Agent | undefined, names?: string[]): string[];
    loadedTools(agent: Agent | undefined): string[];
    /** Namespaced name of a tool loaded in this agent (raw names accepted), or undefined. */
    resolveLoadedTool(agent: Agent | undefined, name: string): string | undefined;
    readResult(agent: Agent | undefined, resultId: string, offset?: number, limit?: number): ResultPage | undefined;
    projectResult(agent: Agent | undefined, resultId: string, options: {
        path?: string;
        fields?: string[];
        offset?: number;
        limit?: number;
    }): ProjectedPage | undefined;
    dispose(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare function createSupervisor(ctx: Context, store: VercelMcpStore, flow: OAuthFlow, callbackUrl: string, options?: McpSupervisorOptions): McpSupervisor;
