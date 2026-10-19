/**
 * Browser-side API client for the /api/adenxie/dsh-vercel route family. The
 * only data access path the settings panel uses — plain fetch, same origin.
 */
/** Public status view (mirrors the host contract). */
export interface VercelMcpStatusView {
    configured: boolean;
    authorized: boolean;
    refreshTokenAvailable: boolean;
    tokenUpdatedAt: string;
    clientIdMasked: string;
    callbackUrl: string;
    mcpUrl: string;
    configPath: string;
    connected: boolean;
    toolCount: number;
    availableToolCount?: number;
}
/** Error carrying the route's JSON error message. */
export declare class VercelMcpApiError extends Error {
    constructor(message: string);
}
/** The Vercel MCP panel API. */
export declare class VercelMcpApi {
    status(): Promise<VercelMcpStatusView>;
    oauthStart(): Promise<{
        ok: boolean;
        authorizeUrl?: string;
        error?: string;
    }>;
    oauthFinish(redirectUrl: string): Promise<{
        ok: boolean;
        message: string;
        view: VercelMcpStatusView;
    }>;
    oauthRefresh(): Promise<{
        ok: boolean;
        message: string;
        view: VercelMcpStatusView;
    }>;
    test(): Promise<{
        ok: boolean;
        message?: string;
        error?: string;
        tools?: string[];
        view: VercelMcpStatusView;
    }>;
    clear(): Promise<{
        ok: boolean;
        message: string;
        view: VercelMcpStatusView;
    }>;
}
