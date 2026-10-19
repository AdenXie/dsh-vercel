/**
 * @adenxie/dsh-vercel — credential/token store.
 *
 * Persists the Vercel MCP OAuth state (dynamic client registration +
 * tokens) to ~/.dsh/adenxie-dsh-vercel.json (mode 0600). Secrets never
 * leave this module; the public view() masks everything. The config path
 * can be overridden with DSH_VERCEL_CONFIG (used by tests).
 */
/** Default machine-wide config location (mode 0600). */
export declare const DEFAULT_CONFIG_FILE: string;
/** Legacy config is copied once when the new location is absent; never modified or deleted. */
export declare const LEGACY_CONFIG_FILE: string;
/** Test override for the config location. */
export declare function configPath(): string;
/** The Vercel MCP endpoint. */
export declare const MCP_URL = "https://mcp.vercel.com";
/** Dynamic-client registration record (OAuthClientInformationMixed subset). */
export interface StoredClientInformation {
    client_id: string;
    client_secret?: string;
    client_id_issued_at?: number;
    client_secret_expires_at?: number;
    /** Registered redirect URIs (the loopback callback). */
    redirect_uris?: string[];
    [key: string]: unknown;
}
/** OAuth tokens (OAuthTokens subset, JsonValue-safe). */
export interface StoredTokens {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    scope?: string;
    token_type?: string;
}
/** Persisted shape. Secrets never leave this module. */
export interface VercelMcpCredentials {
    clientInformation: StoredClientInformation | null;
    tokens: StoredTokens | null;
    /** ISO timestamp of the last successful token exchange/refresh. */
    tokenUpdatedAt: string;
    /** Cached RFC 9728 discovery state (no secrets). */
    discoveryState: Record<string, unknown> | null;
}
/** Public, secret-free status view. */
export interface VercelMcpConfigView {
    configured: boolean;
    authorized: boolean;
    refreshTokenAvailable: boolean;
    tokenUpdatedAt: string;
    clientIdMasked: string;
    callbackUrl: string;
    mcpUrl: string;
    configPath: string;
}
/** Mask a credential for display, keeping only the head and tail. */
export declare function mask(value: string): string;
/**
 * Small credential store backed by ~/.dsh/adenxie-dsh-vercel.json.
 * Reads are lazy and cached; writes use mode 0600 so OAuth tokens never
 * leak to other local users.
 */
export declare class VercelMcpStore {
    private readonly filePath;
    private readonly legacyFilePath;
    config: VercelMcpCredentials | null;
    constructor(filePath?: string, legacyFilePath?: string | null);
    load(): Promise<VercelMcpCredentials>;
    save(next: VercelMcpCredentials): Promise<void>;
    /** Public, secret-free view. */
    view(callbackUrl: string): Promise<VercelMcpConfigView>;
    /** Clear every credential (tokens, client registration, discovery state). */
    clearAll(): Promise<void>;
    /** Clear only tokens (keeps the client registration and discovery state). */
    clearTokens(): Promise<void>;
    /** Clear the client registration (forces dynamic re-registration next auth). */
    clearClientInformation(): Promise<void>;
}
