/**
 * @adenxie/dsh-vercel — loopback HTTP routes for the web settings panel and
 * the OAuth callback.
 *
 * Route family: /api/adenxie/dsh-vercel/*. All routes are loopback-only
 * (127.0.0.1/localhost, same-origin) except the OAuth callback, which must
 * accept the browser landing from mcp.vercel.com — it still requires a
 * loopback client and verifies the OAuth `state` inside the flow.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VercelMcpStore } from './store.ts';
import type { OAuthFlow } from './oauth.ts';
import type { McpSupervisor } from './mcp.ts';
/** Route paths. */
export declare const VERCEL_MCP_API: {
    readonly status: "/api/adenxie/dsh-vercel/status";
    readonly oauthStart: "/api/adenxie/dsh-vercel/oauth/start";
    readonly oauthCallback: "/api/adenxie/dsh-vercel/oauth/callback";
    readonly oauthFinish: "/api/adenxie/dsh-vercel/oauth/finish";
    readonly oauthRefresh: "/api/adenxie/dsh-vercel/oauth/refresh";
    readonly test: "/api/adenxie/dsh-vercel/test";
    readonly catalog: "/api/adenxie/dsh-vercel/catalog";
    readonly clear: "/api/adenxie/dsh-vercel/clear";
};
/** Route handler context. */
export interface RouteContext {
    store: VercelMcpStore;
    flow: OAuthFlow;
    supervisor: McpSupervisor;
    /** The loopback OAuth callback URL. */
    callbackUrl: string;
}
/**
 * Build every /api/adenxie/dsh-vercel route (exact paths).
 * @param deps - store, oauth flow, MCP supervisor, callback URL.
 * @returns the route list.
 */
export declare function makeRoutes(deps: RouteContext): ({
    kind: "exact";
    path: "/api/adenxie/dsh-vercel/status";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} | {
    kind: "exact";
    path: "/api/adenxie/dsh-vercel/oauth/start";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} | {
    kind: "exact";
    path: "/api/adenxie/dsh-vercel/oauth/callback";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} | {
    kind: "exact";
    path: "/api/adenxie/dsh-vercel/oauth/finish";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} | {
    kind: "exact";
    path: "/api/adenxie/dsh-vercel/oauth/refresh";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} | {
    kind: "exact";
    path: "/api/adenxie/dsh-vercel/test";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} | {
    kind: "exact";
    path: "/api/adenxie/dsh-vercel/catalog";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
} | {
    kind: "exact";
    path: "/api/adenxie/dsh-vercel/clear";
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
})[];
