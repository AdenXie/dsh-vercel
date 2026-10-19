/** Narrow compatibility for the official MCP's explicit/default project-scope mismatch. */
export type McpResult = Record<string, unknown>;
export type ProjectScopeInvoker = (args: Record<string, unknown>) => Promise<McpResult>;
export declare const PROJECT_SCOPE_META_KEY = "dsh-vercel/scope-resolution";
/**
 * Retry only a read-only project listing with the server default selector.
 * Accept that response only when every returned project proves the requested
 * accountId. Empty, mixed, missing or conflicting ownership evidence fails
 * closed by returning the original server error. Never rewrite writes/slug.
 */
export declare function withVerifiedProjectScope(rawName: string, args: Record<string, unknown>, invoke: ProjectScopeInvoker, signal?: AbortSignal): Promise<McpResult>;
