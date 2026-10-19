import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { auth, exchangeAuthorization, refreshAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ListToolsResultSchema, ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
//#region src/store.ts
/**
* @adenxie/dsh-vercel — credential/token store.
*
* Persists the Vercel MCP OAuth state (dynamic client registration +
* tokens) to ~/.dsh/adenxie-dsh-vercel.json (mode 0600). Secrets never
* leave this module; the public view() masks everything. The config path
* can be overridden with DSH_VERCEL_CONFIG (used by tests).
*/
/** Default machine-wide config location (mode 0600). */
const DEFAULT_CONFIG_FILE = path.join(homedir(), ".dsh", "adenxie-dsh-vercel.json");
/** Legacy config is copied once when the new location is absent; never modified or deleted. */
const LEGACY_CONFIG_FILE = path.join(homedir(), ".dsh", "dsh-vercel.json");
function isMissingFile(error) {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
/** Test override for the config location. */
function configPath() {
	const override = process.env.DSH_VERCEL_CONFIG;
	return override !== void 0 && override !== "" ? override : DEFAULT_CONFIG_FILE;
}
/** The Vercel MCP endpoint. */
const MCP_URL = "https://mcp.vercel.com";
/** Mask a credential for display, keeping only the head and tail. */
function mask(value) {
	if (!value) return "";
	if (value.length <= 8) return value.slice(0, 2) + "****";
	return value.slice(0, 4) + "****" + value.slice(-4);
}
/** Empty credentials record. */
function empty() {
	return {
		clientInformation: null,
		tokens: null,
		tokenUpdatedAt: "",
		discoveryState: null
	};
}
/** Parse an unknown JSON record into credentials (tolerates missing keys). */
function parse(raw) {
	const record = typeof raw === "object" && raw !== null ? raw : {};
	const info = record.clientInformation;
	const tokens = record.tokens;
	const str = (value) => typeof value === "string" ? value : "";
	const infoRecord = typeof info === "object" && info !== null ? info : null;
	const tokensRecord = typeof tokens === "object" && tokens !== null ? tokens : null;
	return {
		clientInformation: infoRecord !== null && str(infoRecord.client_id) !== "" ? {
			client_id: str(infoRecord.client_id),
			client_secret: infoRecord.client_secret !== void 0 ? str(infoRecord.client_secret) : void 0,
			client_id_issued_at: typeof infoRecord.client_id_issued_at === "number" ? infoRecord.client_id_issued_at : void 0,
			client_secret_expires_at: typeof infoRecord.client_secret_expires_at === "number" ? infoRecord.client_secret_expires_at : void 0,
			redirect_uris: Array.isArray(infoRecord.redirect_uris) ? infoRecord.redirect_uris.filter((u) => typeof u === "string") : void 0
		} : null,
		tokens: tokensRecord !== null && str(tokensRecord.access_token) !== "" ? {
			access_token: str(tokensRecord.access_token),
			refresh_token: tokensRecord.refresh_token !== void 0 ? str(tokensRecord.refresh_token) : void 0,
			expires_at: typeof tokensRecord.expires_at === "number" ? tokensRecord.expires_at : void 0,
			scope: typeof tokensRecord.scope === "string" ? tokensRecord.scope : void 0,
			token_type: typeof tokensRecord.token_type === "string" ? tokensRecord.token_type : void 0
		} : null,
		tokenUpdatedAt: str(record.tokenUpdatedAt),
		discoveryState: typeof record.discoveryState === "object" && record.discoveryState !== null ? record.discoveryState : null
	};
}
/**
* Small credential store backed by ~/.dsh/adenxie-dsh-vercel.json.
* Reads are lazy and cached; writes use mode 0600 so OAuth tokens never
* leak to other local users.
*/
var VercelMcpStore = class {
	filePath;
	legacyFilePath;
	config = null;
	constructor(filePath = configPath(), legacyFilePath = filePath === DEFAULT_CONFIG_FILE ? LEGACY_CONFIG_FILE : null) {
		this.filePath = filePath;
		this.legacyFilePath = legacyFilePath;
	}
	async load() {
		if (this.config !== null) return this.config;
		try {
			const raw = await readFile(this.filePath, "utf8");
			this.config = parse(JSON.parse(raw));
			return this.config;
		} catch {
			try {
				await readFile(this.filePath);
				this.config = empty();
				return this.config;
			} catch (error) {
				if (!isMissingFile(error) || this.legacyFilePath === null) {
					this.config = empty();
					return this.config;
				}
			}
		}
		if (this.legacyFilePath !== null) try {
			const legacy = parse(JSON.parse(await readFile(this.legacyFilePath, "utf8")));
			this.config = legacy;
			if (legacy.clientInformation !== null || legacy.tokens !== null || legacy.discoveryState !== null) await this.save(legacy);
			return this.config;
		} catch {
			if (this.config !== null) return this.config;
		}
		this.config = empty();
		return this.config;
	}
	async save(next) {
		const target = this.filePath;
		await mkdir(path.dirname(target), { recursive: true });
		const temporary = `${target}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, JSON.stringify(next, null, 2), {
				encoding: "utf8",
				flag: "wx",
				mode: 384
			});
			await rename(temporary, target);
			this.config = next;
		} finally {
			await rm(temporary, { force: true }).catch(() => {});
		}
	}
	/** Public, secret-free view. */
	async view(callbackUrl) {
		const cfg = await this.load();
		return {
			configured: cfg.clientInformation !== null || cfg.tokens !== null,
			authorized: cfg.tokens !== null && cfg.tokens.access_token.trim() !== "",
			refreshTokenAvailable: cfg.tokens?.refresh_token !== void 0 && cfg.tokens.refresh_token !== "",
			tokenUpdatedAt: cfg.tokenUpdatedAt,
			clientIdMasked: cfg.clientInformation !== null ? mask(cfg.clientInformation.client_id) : "",
			callbackUrl,
			mcpUrl: MCP_URL,
			configPath: this.filePath
		};
	}
	/** Clear every credential (tokens, client registration, discovery state). */
	async clearAll() {
		await this.save(empty());
	}
	/** Clear only tokens (keeps the client registration and discovery state). */
	async clearTokens() {
		const cfg = await this.load();
		await this.save({
			...cfg,
			tokens: null,
			tokenUpdatedAt: ""
		});
	}
	/** Clear the client registration (forces dynamic re-registration next auth). */
	async clearClientInformation() {
		const cfg = await this.load();
		await this.save({
			...cfg,
			clientInformation: null
		});
	}
};
/** How long `begin()` waits for the authorization URL to materialize (ms). */
const AUTHORIZE_URL_TIMEOUT_MS = 30 * 1e3;
const VERCEL_OAUTH_SCOPE = "openid offline_access";
function storedTokens(tokens) {
	return {
		access_token: tokens.access_token,
		refresh_token: tokens.refresh_token,
		expires_at: tokens.expires_in !== void 0 ? Date.now() + tokens.expires_in * 1e3 : void 0,
		scope: tokens.scope,
		token_type: tokens.token_type ?? "Bearer"
	};
}
/** Parse a pasted callback URL, or validate explicitly supplied code/state. */
function parseManualCallback(input) {
	let code = input.code?.trim() ?? "";
	let state = input.state?.trim() ?? "";
	if (input.redirectUrl) try {
		const callback = new URL(input.redirectUrl);
		code ||= callback.searchParams.get("code")?.trim() ?? "";
		state ||= callback.searchParams.get("state")?.trim() ?? "";
	} catch {
		return null;
	}
	return code !== "" && state !== "" ? {
		code,
		state
	} : null;
}
/**
* OAuth client provider backed by the credential store. Implements the MCP
* SDK's OAuthClientProvider contract: persisted client registration + tokens,
* memory-held PKCE verifier, and a captured authorization URL for the GUI.
*/
var VercelOAuthProvider = class {
	store;
	callbackUrl;
	refreshGrant;
	pending = null;
	codeVerifierValue = null;
	stagingClientInformation = false;
	stagedClientInformation = null;
	constructor(store, callbackUrl, refreshGrant = refreshAuthorization) {
		this.store = store;
		this.callbackUrl = callbackUrl;
		this.refreshGrant = refreshGrant;
	}
	/** The loopback callback URL (registered on the GUI's own web server). */
	get redirectUrl() {
		return this.callbackUrl;
	}
	/** Client metadata for dynamic registration (public client + PKCE). */
	get clientMetadata() {
		return {
			client_name: "@adenxie/dsh-vercel",
			redirect_uris: [this.callbackUrl],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: VERCEL_OAUTH_SCOPE
		};
	}
	/**
	* Flow-bound state (verified on the callback).
	*
	* The MCP SDK builds the authorize URL by calling this method itself; if it
	* returned a fresh UUID every time, the URL's `state` would differ from the
	* one `begin()` recorded in the pending flow, and the callback's state could
	* never match (the "state 校验未通过" failure). Return the active pending
	* flow's state so the authorize request reuses the exact value the pending
	* flow will verify.
	*/
	async state() {
		const pending = this.pending;
		if (pending !== null) return pending.state;
		return randomUUID();
	}
	async clientInformation() {
		return (await this.store.load()).clientInformation ?? void 0;
	}
	async saveClientInformation(information) {
		if (this.stagingClientInformation) {
			this.stagedClientInformation = information;
			return;
		}
		const cfg = await this.store.load();
		await this.store.save({
			...cfg,
			clientInformation: information
		});
	}
	async tokens() {
		const cfg = await this.store.load();
		if (cfg.tokens === null) return void 0;
		const tokens = {
			access_token: cfg.tokens.access_token,
			token_type: cfg.tokens.token_type ?? "Bearer"
		};
		if (cfg.tokens.refresh_token !== void 0) tokens.refresh_token = cfg.tokens.refresh_token;
		if (cfg.tokens.scope !== void 0) tokens.scope = cfg.tokens.scope;
		return tokens;
	}
	async saveTokens(tokens) {
		const cfg = await this.store.load();
		await this.store.save({
			...cfg,
			tokens: storedTokens(tokens),
			tokenUpdatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	/** Commit replacement registration and tokens together after successful user consent. */
	async commitAuthorization(tokens) {
		const cfg = await this.store.load();
		const information = this.stagedClientInformation ?? cfg.clientInformation;
		await this.store.save({
			...cfg,
			clientInformation: information,
			tokens: storedTokens(tokens),
			tokenUpdatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		this.discardClientInformationStage();
	}
	/** Keep an existing client registration until a replacement authorization succeeds. */
	beginClientInformationStage() {
		this.stagingClientInformation = true;
		this.stagedClientInformation = null;
	}
	async pendingClientInformation() {
		return this.stagedClientInformation ?? await this.clientInformation();
	}
	discardClientInformationStage() {
		this.stagingClientInformation = false;
		this.stagedClientInformation = null;
	}
	/** Force a refresh grant without SDK auto-recovery that might invalidate usable stored tokens. */
	async forceRefresh(fetchFn) {
		const refreshToken = (await this.store.load()).tokens?.refresh_token;
		if (refreshToken === void 0 || refreshToken === "") return "missing_refresh_token";
		const clientInformation = await this.clientInformation();
		if (clientInformation === void 0) return "missing_client_information";
		const discovery = await this.discoveryState();
		if (discovery?.authorizationServerUrl === void 0) return "missing_discovery";
		let resource;
		const resourceValue = discovery.resourceMetadata?.resource;
		if (resourceValue !== void 0) {
			const parsed = new URL(resourceValue);
			if (parsed.origin !== new URL("https://mcp.vercel.com").origin) return "failed";
			resource = parsed;
		}
		try {
			const refreshed = await this.refreshGrant(discovery.authorizationServerUrl, {
				metadata: discovery.authorizationServerMetadata,
				clientInformation,
				refreshToken,
				resource,
				fetchFn
			});
			await this.saveTokens(refreshed);
			return "refreshed";
		} catch (error) {
			return error instanceof Error && error.name === "InvalidGrantError" ? "invalid_grant" : "failed";
		}
	}
	async saveDiscoveryState(state) {
		const cfg = await this.store.load();
		await this.store.save({
			...cfg,
			discoveryState: state
		});
	}
	async discoveryState() {
		return (await this.store.load()).discoveryState;
	}
	async invalidateCredentials(scope) {
		if (scope === "all") await this.store.clearAll();
		else if (scope === "client") await this.store.clearClientInformation();
		else if (scope === "tokens") await this.store.clearTokens();
		else if (scope === "verifier") this.codeVerifierValue = null;
		else if (scope === "discovery") {
			const cfg = await this.store.load();
			await this.store.save({
				...cfg,
				discoveryState: null
			});
		}
	}
	async saveCodeVerifier(codeVerifier) {
		this.codeVerifierValue = codeVerifier;
	}
	async codeVerifier() {
		if (this.codeVerifierValue === null) throw new Error("OAuth flow: missing PKCE code verifier (flow may have expired)");
		return this.codeVerifierValue;
	}
	async redirectToAuthorization(authorizationUrl) {
		const pending = this.pending;
		if (pending !== null) pending.resolveAuthorizeUrl(authorizationUrl.toString());
	}
	/** Wait for the pending flow's authorization URL (bounded). */
	waitForAuthorizationUrl(timeoutMs) {
		const pending = this.pending;
		if (pending === null) return Promise.reject(/* @__PURE__ */ new Error("OAuth flow: no pending authorization"));
		return Promise.race([pending.authorizeUrlPromise, new Promise((_, reject) => {
			setTimeout(() => reject(/* @__PURE__ */ new Error("OAuth flow: authorization URL timed out")), timeoutMs).unref();
		})]);
	}
	/** Register the pending flow slot (rejects when one is already active). */
	beginPending(state) {
		if (this.pending !== null && Date.now() - this.pending.startedAt < 6e5) throw new Error("已有一个待完成的 Vercel 授权流程，请先完成或等待它过期。");
		let resolveAuthorizeUrl;
		let rejectAuthorizeUrl;
		const authorizeUrlPromise = new Promise((resolve, reject) => {
			resolveAuthorizeUrl = resolve;
			rejectAuthorizeUrl = reject;
		});
		const pending = {
			state,
			provider: this,
			authorizeUrlPromise,
			resolveAuthorizeUrl,
			rejectAuthorizeUrl,
			code: null,
			startedAt: Date.now()
		};
		this.pending = pending;
		this.codeVerifierValue = null;
		return pending;
	}
	/** The active pending flow (or null). */
	get pendingFlow() {
		const pending = this.pending;
		if (pending === null) return null;
		if (Date.now() - pending.startedAt > 6e5) {
			this.pending = null;
			return null;
		}
		return pending;
	}
	/** Settle a pending flow (call after the callback or manual code arrives). */
	settlePending(state, code) {
		const pending = this.pendingFlow;
		if (pending === null || pending.state !== state) return null;
		pending.code = code;
		this.pending = null;
		return pending;
	}
	/** Abort any pending flow (rejects a waiting begin() with an error). */
	settlePendingAbort() {
		const pending = this.pending;
		this.pending = null;
		this.codeVerifierValue = null;
		this.discardClientInformationStage();
		if (pending !== null) pending.rejectAuthorizeUrl(/* @__PURE__ */ new Error("授权流程已被取消。"));
	}
};
/**
* OAuth orchestration shared by the routes and the agent tools.
* Phase 1 (`begin`) starts discovery/registration and returns the
* authorization URL; phase 2 (`complete`) exchanges the code. The provider
* instance is created once per callback URL and reused across flows: it
* reads/writes tokens through the store, so the MCP transport keeps working
* (and auto-refreshing) between authorizations.
*/
var OAuthFlow = class {
	store;
	hooks;
	provider = null;
	constructor(store, hooks = {}) {
		this.store = store;
		this.hooks = hooks;
	}
	get serverUrl() {
		return this.hooks.serverUrl ?? "https://mcp.vercel.com";
	}
	/** The provider used by the MCP transport (created lazily). */
	get activeProvider() {
		return this.provider;
	}
	/** Get (creating if needed) the provider bound to this callback URL. */
	getProvider(callbackUrl) {
		if (this.provider === null) this.provider = new VercelOAuthProvider(this.store, callbackUrl, this.hooks.refresh);
		return this.provider;
	}
	/**
	* Start an authorization: fresh dynamic client registration (the callback
	* URL is fixed per host run, but re-registering is cheap and always
	* consistent), then the discovery + authorize-URL dance. Returns the URL
	* for the browser once it exists.
	*/
	async begin(callbackUrl) {
		const provider = this.getProvider(callbackUrl);
		provider.settlePendingAbort();
		provider.beginClientInformationStage();
		const state = await provider.state();
		const pending = provider.beginPending(state);
		const phaseOneProvider = new Proxy(provider, { get(target, property) {
			if (property === "tokens") return async () => void 0;
			if (property === "clientInformation") return async () => void 0;
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		} });
		(this.hooks.authorize ?? ((value, options) => auth(value, options)))(phaseOneProvider, {
			serverUrl: this.serverUrl,
			scope: VERCEL_OAUTH_SCOPE
		}).catch((error) => {
			pending.rejectAuthorizeUrl(error);
		});
		try {
			return {
				authorizeUrl: await provider.waitForAuthorizationUrl(AUTHORIZE_URL_TIMEOUT_MS),
				state
			};
		} catch (error) {
			provider.settlePendingAbort();
			throw error;
		}
	}
	/**
	* Complete the flow with the authorization code (from the loopback
	* callback or a manually pasted code). Verifies the state, exchanges the
	* code, and persists the tokens. Returns { ok, message }.
	*/
	async complete(code, state) {
		const provider = this.provider;
		if (provider === null) return {
			ok: false,
			message: "没有待完成的授权流程：请先点击「开始授权」。"
		};
		if (provider.settlePending(state ?? "", code) === null) return {
			ok: false,
			message: "state 校验未通过（授权流程可能已过期或重复）。请重新点击「开始授权」。"
		};
		let clientInformation;
		let discovery;
		try {
			clientInformation = await provider.pendingClientInformation();
			discovery = await provider.discoveryState();
			if (clientInformation === void 0 || discovery?.authorizationServerUrl === void 0) {
				provider.discardClientInformationStage();
				return {
					ok: false,
					message: "授权信息不完整；现有凭据已保留，请重新开始授权。"
				};
			}
			let resource;
			const resourceValue = discovery.resourceMetadata?.resource;
			if (resourceValue !== void 0) {
				const parsed = new URL(resourceValue);
				if (parsed.origin !== new URL(this.serverUrl).origin) throw new Error("resource metadata origin mismatch");
				resource = parsed;
			}
			const tokens = await (this.hooks.exchange ?? exchangeAuthorization)(discovery.authorizationServerUrl, {
				metadata: discovery.authorizationServerMetadata,
				clientInformation,
				authorizationCode: code,
				codeVerifier: await provider.codeVerifier(),
				redirectUri: provider.redirectUrl,
				resource
			});
			await provider.commitAuthorization(tokens);
		} catch (error) {
			provider.discardClientInformationStage();
			return {
				ok: false,
				message: "令牌交换失败；现有授权凭据已保留。"
			};
		}
		return {
			ok: true,
			message: "授权成功：Vercel MCP 令牌已保存，MCP 工具已就绪。"
		};
	}
	/** Drop any pending flow (used by clear/reset). */
	abort() {
		if (this.provider !== null) this.provider.settlePendingAbort();
	}
};
//#endregion
//#region src/scope.ts
const PROJECT_SCOPE_META_KEY = "dsh-vercel/scope-resolution";
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isExplicitScopeReauthenticationError(result) {
	if (result.isError !== true || !Array.isArray(result.content)) return false;
	const text = result.content.filter(record).filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
	return /(?:\b403\b|forbidden)/i.test(text) && /must re-authenticate to this scope/i.test(text);
}
function projectArrays(result) {
	const candidates = [result.structuredContent];
	if (Array.isArray(result.content)) for (const block of result.content) {
		if (!record(block) || block.type !== "text" || typeof block.text !== "string") continue;
		try {
			candidates.push(JSON.parse(block.text));
		} catch {}
	}
	const arrays = [];
	for (const candidate of candidates) {
		if (!record(candidate)) continue;
		const payload = record(candidate.result) ? candidate.result : candidate;
		if (Array.isArray(payload.projects)) arrays.push(payload.projects);
	}
	return arrays;
}
/**
* Retry only a read-only project listing with the server default selector.
* Accept that response only when every returned project proves the requested
* accountId. Empty, mixed, missing or conflicting ownership evidence fails
* closed by returning the original server error. Never rewrite writes/slug.
*/
async function withVerifiedProjectScope(rawName, args, invoke, signal) {
	signal?.throwIfAborted();
	const request = rawName === "list_projects" && typeof args.limit === "number" && Number.isSafeInteger(args.limit) && args.limit > 0 ? {
		...args,
		limit: String(args.limit)
	} : args;
	const first = await invoke(request);
	signal?.throwIfAborted();
	if (rawName !== "list_projects" || typeof request.teamId !== "string" || request.teamId.trim() === "" || request.slug !== void 0 || !isExplicitScopeReauthenticationError(first)) return first;
	const { teamId, ...defaultArgs } = request;
	let fallback;
	try {
		fallback = await invoke(defaultArgs);
	} catch (error) {
		if (signal?.aborted) throw error;
		return first;
	}
	signal?.throwIfAborted();
	if (fallback.isError === true) return first;
	const arrays = projectArrays(fallback);
	if (arrays.length === 0 || arrays.some((projects) => projects.length === 0 || projects.some((project) => !record(project) || project.accountId !== teamId))) return first;
	const meta = record(fallback._meta) ? fallback._meta : {};
	return {
		...fallback,
		_meta: {
			...meta,
			[PROJECT_SCOPE_META_KEY]: {
				operation: "list_projects",
				requestedTeamId: teamId,
				effectiveScope: "server-default",
				ownerVerified: true,
				originalScopeError: "forbidden_reauthentication"
			}
		},
		content: [...Array.isArray(fallback.content) ? fallback.content : [], {
			type: "text",
			text: "Scope compatibility: the server rejected explicit teamId. This read used the server-default scope only after verifying every returned project belongs to the requested accountId."
		}]
	};
}
//#endregion
//#region src/result-cache.ts
/** Bounded, process-local result paging; identifiers are usable only by their owning Agent. */
const MODEL_RESULT_CHARACTERS = 12e3;
/** Preview length for JSON results, which also get a structural outline. */
const JSON_PREVIEW_CHARACTERS = 4e3;
const RESULT_PAGE_META_KEY = "dsh-vercel/result-page";
const MAX_OUTLINE_CHARACTERS = 1200;
const MAX_OUTLINE_KEYS = 24;
function isRecord$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function typeLabel(value) {
	if (Array.isArray(value)) return `array(${value.length})`;
	if (value === null) return "null";
	return typeof value;
}
function itemKeys(items) {
	const keys = /* @__PURE__ */ new Set();
	for (const item of items.slice(0, 5)) if (isRecord$2(item)) for (const key of Object.keys(item)) keys.add(key);
	const list = [...keys];
	return list.length === 0 ? "" : ` 条目字段: ${list.slice(0, MAX_OUTLINE_KEYS).join(",")}${list.length > MAX_OUTLINE_KEYS ? ",…" : ""}`;
}
/** Compact structure summary: top-level keys, arrays with lengths and the fields of their items. */
function outlineJson(value) {
	const lines = [];
	if (Array.isArray(value)) lines.push(`(根) ${typeLabel(value)}${itemKeys(value)}`);
	else if (isRecord$2(value)) for (const [key, child] of Object.entries(value).slice(0, MAX_OUTLINE_KEYS)) lines.push(`${key}: ${typeLabel(child)}${Array.isArray(child) ? itemKeys(child) : isRecord$2(child) ? ` {${Object.keys(child).slice(0, 12).join(",")}}` : ""}`);
	return lines.join("\n").slice(0, MAX_OUTLINE_CHARACTERS);
}
/** Parse result text that is itself a JSON document; anything else stays plain text. */
function parseJsonText(text) {
	const trimmed = text.trim();
	if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return void 0;
	try {
		return JSON.parse(trimmed);
	} catch {
		return;
	}
}
function valueAtPath(value, dottedPath) {
	let node = value;
	for (const segment of dottedPath.split(".").map((part) => part.trim()).filter(Boolean)) if (Array.isArray(node) && /^\d+$/.test(segment)) node = node[Number(segment)];
	else if (isRecord$2(node) && Object.hasOwn(node, segment)) node = node[segment];
	else return void 0;
	return node;
}
function pick(item, fields) {
	if (fields.length === 0 || !isRecord$2(item)) return item;
	const out = {};
	for (const field of fields) {
		const value = valueAtPath(item, field);
		if (value !== void 0) out[field] = value;
	}
	return out;
}
/** The first array inside the value, when the caller gives no path: the root, then each top-level key in order. */
function defaultArrayPath(value) {
	if (Array.isArray(value)) return "";
	if (!isRecord$2(value)) return void 0;
	return Object.entries(value).find(([, child]) => Array.isArray(child))?.[0];
}
var AgentResultCache = class {
	owners = /* @__PURE__ */ new WeakMap();
	/** Keep the complete rendered text (and parsed JSON) when it fits; evict oldest entries to retain a fixed budget. */
	put(owner, text, json) {
		if (text.length > 1e6) return void 0;
		const entries = this.owners.get(owner) ?? /* @__PURE__ */ new Map();
		this.owners.set(owner, entries);
		let total = [...entries.values()].reduce((sum, value) => sum + value.text.length, 0);
		while (entries.size >= 8 || total + text.length > 1e6) {
			const oldest = entries.keys().next().value;
			if (oldest === void 0) break;
			total -= entries.get(oldest).text.length;
			entries.delete(oldest);
		}
		const id = randomUUID();
		entries.set(id, json === void 0 ? { text } : {
			text,
			json
		});
		return id;
	}
	/** Bounds are JS string characters, consistent with the schema/output budgets. */
	read(owner, resultId, offset = 0, limit = MODEL_RESULT_CHARACTERS) {
		if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 12e3) throw new Error("Result page offset/limit is outside the supported range.");
		const text = this.owners.get(owner)?.get(resultId)?.text;
		if (text === void 0) return void 0;
		if (offset > text.length) throw new Error("Result page offset exceeds the stored text length.");
		const end = Math.min(text.length, offset + limit);
		return {
			resultId,
			text: text.slice(offset, end),
			offset,
			nextOffset: end < text.length ? end : null,
			totalCharacters: text.length
		};
	}
	/**
	* Page through an array inside a cached JSON result, keeping only the given
	* fields of each item. offset/limit count items; the page stops early rather
	* than exceed the model text budget.
	*/
	project(owner, resultId, options) {
		const cached = this.owners.get(owner)?.get(resultId);
		if (cached === void 0) return void 0;
		if (cached.json === void 0) throw new Error("This result is not JSON; page it by characters without path/fields.");
		const offset = options.offset ?? 0;
		const limit = options.limit ?? 50;
		if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error(`Item offset/limit is outside the supported range (limit 1-200).`);
		const fields = (options.fields ?? []).filter((field) => typeof field === "string" && field.trim() !== "").slice(0, 32);
		const path = options.path ?? defaultArrayPath(cached.json) ?? "";
		const target = valueAtPath(cached.json, path);
		if (target === void 0) throw new Error(`No value at path "${path}".`);
		if (!Array.isArray(target)) return {
			resultId,
			path,
			text: JSON.stringify(pick(target, fields)).slice(0, MODEL_RESULT_CHARACTERS),
			offset: 0,
			nextOffset: null,
			totalItems: 1
		};
		if (offset > target.length) throw new Error("Item offset exceeds the array length.");
		const lines = [];
		let used = 0;
		let index = offset;
		for (; index < Math.min(target.length, offset + limit); index++) {
			const line = JSON.stringify(pick(target[index], fields));
			if (lines.length > 0 && used + line.length + 1 > 12e3) break;
			lines.push(line.slice(0, MODEL_RESULT_CHARACTERS));
			used += line.length + 1;
		}
		return {
			resultId,
			path,
			text: lines.join("\n"),
			offset,
			nextOffset: index < target.length ? index : null,
			totalItems: target.length
		};
	}
	clear(owner) {
		if (owner === void 0) this.owners = /* @__PURE__ */ new WeakMap();
		else this.owners.delete(owner);
	}
};
//#endregion
//#region src/schema.ts
/** Keys whose values are maps of user-chosen names to subschemas. */
const NAME_MAPS = /* @__PURE__ */ new Set([
	"properties",
	"patternProperties",
	"$defs",
	"definitions",
	"dependentSchemas"
]);
/** Annotation keys with no effect on argument validity. */
const DROPPED_KEYS = /* @__PURE__ */ new Set([
	"$schema",
	"$comment",
	"title",
	"example",
	"examples",
	"readOnly",
	"writeOnly",
	"deprecated"
]);
/** Descriptions are kept on the root and its direct properties only. */
const MAX_DESCRIPTION_DEPTH = 1;
const MAX_DESCRIPTION_CHARACTERS = 400;
/** Slimmed schemas above this many characters have their large properties collapsed. */
const OVERSIZED_SCHEMA_CHARACTERS = 6e3;
/** A top-level property larger than this is collapsed in an oversized schema. */
const COLLAPSE_PROPERTY_CHARACTERS = 400;
/** Upper bound for one describe response. */
const DESCRIBE_CHARACTERS = 6e3;
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function slimNode(node, depth, descriptionDepth = MAX_DESCRIPTION_DEPTH) {
	if (Array.isArray(node)) return node.map((value) => slimNode(value, depth, descriptionDepth));
	if (!isRecord$1(node)) return node;
	const out = {};
	for (const [key, value] of Object.entries(node)) {
		if (DROPPED_KEYS.has(key)) continue;
		if (key === "additionalProperties" && typeof value === "boolean") continue;
		if (key === "description") {
			if (depth > descriptionDepth || typeof value !== "string") continue;
			out[key] = value.length > MAX_DESCRIPTION_CHARACTERS ? `${value.slice(0, MAX_DESCRIPTION_CHARACTERS)}…` : value;
			continue;
		}
		if (NAME_MAPS.has(key) && isRecord$1(value)) {
			const map = {};
			for (const [name, schema] of Object.entries(value)) map[name] = slimNode(schema, depth + 1, descriptionDepth);
			out[key] = map;
			continue;
		}
		out[key] = slimNode(value, depth, descriptionDepth);
	}
	return out;
}
/** Drop validation-neutral annotations and nested descriptions; property names and constraints are kept. */
function slimSchema(schema) {
	return slimNode(schema, 0);
}
function stubFor(schema, propertyPath, describeTool) {
	const types = typeof schema.type === "string" || Array.isArray(schema.type) ? schema.type : Array.isArray(schema.anyOf ?? schema.oneOf) ? [...new Set((schema.anyOf ?? schema.oneOf).flatMap((option) => isRecord$1(option) && typeof option.type === "string" ? [option.type] : []))] : void 0;
	const hint = `结构较大，已折叠；调用 ${describeTool}({name, path:"${propertyPath}"}) 查看完整结构。`;
	const description = typeof schema.description === "string" ? `${schema.description.slice(0, 200)} ${hint}` : hint;
	return {
		...types === void 0 || Array.isArray(types) && types.length === 0 ? {} : { type: Array.isArray(types) && types.length === 1 ? types[0] : types },
		description
	};
}
/**
* Collapse the largest properties, biggest first, until the schema fits
* `targetCharacters`. An object property is reduced inside first (its own
* largest children), so a single wrapper such as `requestBody` keeps its small
* fields inline. Required names, property order and small properties stay intact.
*/
function collapseSchema(schema, describeTool, targetCharacters = OVERSIZED_SCHEMA_CHARACTERS, prefix = "") {
	if (!isRecord$1(schema.properties)) return {
		schema,
		collapsed: []
	};
	const properties = { ...schema.properties };
	const candidates = Object.entries(schema.properties).map(([name, value]) => ({
		name,
		value,
		size: JSON.stringify(value).length
	})).filter((candidate) => isRecord$1(candidate.value) && candidate.size > COLLAPSE_PROPERTY_CHARACTERS).sort((a, b) => b.size - a.size);
	const collapsed = [];
	let total = JSON.stringify(schema).length;
	for (const { name, value, size } of candidates) {
		if (total <= targetCharacters) break;
		const record = value;
		const path = prefix === "" ? name : `${prefix}.${name}`;
		let replacement = stubFor(record, path, describeTool);
		if (isRecord$1(record.properties)) {
			const inner = collapseSchema(record, describeTool, Math.max(COLLAPSE_PROPERTY_CHARACTERS, size - (total - targetCharacters)), path);
			const innerSize = JSON.stringify(inner.schema).length;
			if (innerSize < size && total - size + innerSize <= targetCharacters) {
				replacement = inner.schema;
				collapsed.push(...inner.collapsed);
			} else collapsed.push(path);
		} else collapsed.push(path);
		properties[name] = replacement;
		total -= size - JSON.stringify(replacement).length;
	}
	return {
		schema: {
			...schema,
			properties
		},
		collapsed
	};
}
/** The parameters actually declared to the model for one remote tool. */
function modelParameters(name, description, inputSchema, describeTool) {
	const slim = slimSchema(inputSchema);
	const envelope = JSON.stringify({
		name,
		description,
		parameters: {}
	}).length;
	if (envelope + JSON.stringify(slim).length <= 6e3) return {
		parameters: slim,
		collapsed: []
	};
	const { schema, collapsed } = collapseSchema(slim, describeTool, OVERSIZED_SCHEMA_CHARACTERS - envelope);
	return {
		parameters: schema,
		collapsed
	};
}
/**
* Resolve a dot path through `properties`, array `items` and `anyOf`/`oneOf`
* options of the original (unslimmed) schema. Numeric segments select an option.
*/
function schemaAtPath(schema, dottedPath) {
	let node = schema;
	for (const segment of dottedPath.split(".").map((part) => part.trim()).filter(Boolean)) {
		if (!isRecord$1(node)) return void 0;
		const options = node.anyOf ?? node.oneOf;
		if (/^\d+$/.test(segment) && Array.isArray(options)) {
			node = options[Number(segment)];
			continue;
		}
		if (isRecord$1(node.properties) && Object.hasOwn(node.properties, segment)) {
			node = node.properties[segment];
			continue;
		}
		if (isRecord$1(node.items) && isRecord$1(node.items.properties) && Object.hasOwn(node.items.properties, segment)) {
			node = node.items.properties[segment];
			continue;
		}
		if (Array.isArray(options)) {
			const option = options.find((candidate) => isRecord$1(candidate) && isRecord$1(candidate.properties) && Object.hasOwn(candidate.properties, segment));
			if (isRecord$1(option) && isRecord$1(option.properties)) {
				node = option.properties[segment];
				continue;
			}
		}
		return;
	}
	return isRecord$1(node) ? node : void 0;
}
/** Text for one describe call: the subschema, with large children collapsed when it exceeds the budget. */
function describeSchema(schema, basePath, describeTool) {
	const slim = slimNode(schema, 0, Number.POSITIVE_INFINITY);
	const full = JSON.stringify(slim);
	if (full.length <= 6e3) return full;
	const container = isRecord$1(slim.items) && isRecord$1(slim.items.properties) ? slim.items : slim;
	if (isRecord$1(container.properties)) {
		const prefix = basePath === "" ? "" : `${basePath}.`;
		const properties = {};
		for (const [name, value] of Object.entries(container.properties)) properties[name] = isRecord$1(value) && JSON.stringify(value).length > COLLAPSE_PROPERTY_CHARACTERS ? stubFor(value, prefix + name, describeTool) : value;
		const reduced = container === slim ? {
			...slim,
			properties
		} : {
			...slim,
			items: {
				...container,
				properties
			}
		};
		const text = JSON.stringify(reduced);
		if (text.length <= 6e3) return text;
	}
	return `${full.slice(0, DESCRIBE_CHARACTERS)}…[已截断；请指定更深的 path]`;
}
//#endregion
//#region src/mcp.ts
/**
* dsh-vercel — MCP connection supervisor.
*
* Keeps the server's public tool definitions and call results as JSON values.
* DSH's model-facing text projection intentionally excludes MCP `_meta`; it
* remains namespaced in DSH presentation metadata for host-side consumers.
*/
const RawCallToolResultSchema = z.record(z.string(), z.unknown());
const MAX_PUBLIC_NAME_LENGTH = 64;
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g;
const HASH_LENGTH = 12;
const TOOL_CALL_TIMEOUT_MS = 6e4;
const GENERATION_CLOSE_TIMEOUT_MS = 5e3;
const RECONNECT = {
	initialDelayMs: 1e3,
	maxDelayMs: 3e4,
	maxAttempts: 10
};
const PUBLIC_PREFIX = "mcp__adenxie_vercel__";
/** Removing a loaded tool rewrites the provider's tool list (a cache miss on addition-only routes), so the cap leaves room to keep tools loaded. */
const MAX_SESSION_TOOLS = 6;
const MAX_SESSION_SCHEMA_CHARS = 32e3;
const MAX_SEARCH_RESULTS = 8;
const DEFAULT_SEARCH_RESULTS = 5;
const MAX_SEARCH_QUERY = 120;
const MAX_SEARCH_DESCRIPTION = 120;
/** Helper that returns the full structure behind collapsed schema properties. */
const DESCRIBE_TOOL_NAME = "adenxie_vercel_mcp_describe_tool";
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Convert data received through JSON-RPC into a detached, JSON-safe value. */
function jsonCopy(value) {
	const serialized = JSON.stringify(value);
	if (serialized === void 0) throw new TypeError("MCP value is not JSON-serializable");
	return JSON.parse(serialized);
}
function jsonDataCopy(value) {
	const serialized = JSON.stringify(value);
	if (serialized === void 0) throw new TypeError("MCP metadata is not JSON-serializable");
	return JSON.parse(serialized);
}
/** Derive the DSH public name. Lossy/long mappings get a stable identity suffix. */
function mapPublicToolName(rawName) {
	const joined = `${PUBLIC_PREFIX}${rawName}`;
	const normalized = joined.replace(INVALID_NAME_CHARS, "_");
	if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized;
	const hash = createHash("sha256").update(`adenxie-vercel\0${rawName}`).digest("hex").slice(0, HASH_LENGTH);
	return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`;
}
function copyToolDefinition(tool) {
	return jsonCopy(tool);
}
const schemaCharactersCache = /* @__PURE__ */ new WeakMap();
/** Characters of the declaration the model actually receives for this tool. */
function modelSchemaCharacters(entry) {
	const cached = schemaCharactersCache.get(entry);
	if (cached !== void 0) return cached;
	const size = JSON.stringify({
		name: entry.publicName,
		description: entry.description ?? "",
		parameters: modelParameters(entry.publicName, entry.description ?? "", entry.inputSchema, DESCRIBE_TOOL_NAME).parameters
	}).length;
	schemaCharactersCache.set(entry, size);
	return size;
}
function renderMcpContent(content, structuredContent) {
	const blocks = Array.isArray(content) ? content : [];
	const rendered = [];
	let hasText = false;
	for (const value of blocks) {
		if (!isRecord(value)) continue;
		if (value.type === "text" && typeof value.text === "string") {
			hasText = true;
			rendered.push({
				type: "text",
				text: value.text
			});
		} else if (typeof value.type === "string") rendered.push({
			type: "text",
			text: `[MCP ${value.type} content retained in structured result]`
		});
	}
	if (!hasText && isRecord(structuredContent)) rendered.push({
		type: "text",
		text: JSON.stringify(structuredContent)
	});
	return rendered;
}
function renderedMcpText(content, structuredContent) {
	return renderMcpContent(content, structuredContent).map((block) => block.text).join("\n");
}
function resultPageMetadata(value) {
	if (!isRecord(value) || !isRecord(value._meta) || !isRecord(value._meta["dsh-vercel/result-page"])) return void 0;
	return value._meta[RESULT_PAGE_META_KEY];
}
function renderMcpResult(value) {
	const result = isRecord(value) ? value : {};
	const page = resultPageMetadata(result);
	const blocks = renderMcpContent(result.content, result.structuredContent);
	if (page === void 0 || blocks.length === 0) return blocks;
	const fullText = blocks.map((block) => block.text).join("\n");
	if (fullText.length <= 12e3) return blocks;
	if (typeof page.outline === "string") {
		const preview = fullText.slice(0, JSON_PREVIEW_CHARACTERS);
		const outline = page.outline === "" ? "" : `\n结构概要：\n${page.outline}\n`;
		const how = typeof page.resultId === "string" ? `调用 adenxie_vercel_mcp_read_result({resultId:"${page.resultId}", path, fields:[...]}) 按字段读取数组条目；省略 path/fields 并传 offset:${String(JSON_PREVIEW_CHARACTERS)} 则按字符续读。` : "当前无法续读；请缩小查询范围后重试。";
		return [{
			type: "text",
			text: `${preview}\n\n[JSON 结果共 ${String(page.totalCharacters)} 字符，已显示前 ${String(JSON_PREVIEW_CHARACTERS)} 字符。${outline}${how}]`
		}];
	}
	const snippet = fullText.slice(0, MODEL_RESULT_CHARACTERS);
	if (typeof page.resultId === "string" && typeof page.nextOffset === "number") return [{
		type: "text",
		text: `${snippet}\n\n[结果已截断，共 ${String(page.totalCharacters)} 字符。调用 adenxie_vercel_mcp_read_result({resultId:"${page.resultId}", offset:${page.nextOffset}, limit:12000}) 继续读取。]`
	}];
	return [{
		type: "text",
		text: `${snippet}\n\n[结果共 ${String(page.totalCharacters)} 字符，当前无法续读；请缩小查询范围后重试。]`
	}];
}
function safeErrorKind(error) {
	return isRecord(error) && typeof error.name === "string" ? error.name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 48) || "Error" : "Error";
}
/** Map an MCP tool's protocol-level error flag into DSH's result contract. */
function mapMcpToolError(result) {
	if (result.isError || !isRecord(result.value) || result.value.isError !== true) return result;
	return {
		isError: true,
		error: {
			message: result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n") || "MCP server reported a tool error.",
			info: {
				name: "McpToolError",
				code: "MCP_TOOL_ERROR"
			}
		},
		content: result.content,
		...result.meta === void 0 ? {} : { meta: result.meta }
	};
}
/** Install the narrow DSH waterfall adapter that preserves MCP error status. */
function registerMcpResultSemantics(ctx) {
	return ctx.on("tools/execute", async (exec, next) => {
		const result = await next();
		return exec.name.startsWith(PUBLIC_PREFIX) ? mapMcpToolError(result) : result;
	});
}
function createSupervisor(ctx, store, flow, callbackUrl, options = {}) {
	const label = "@adenxie/dsh-vercel";
	const serverUrl = options.serverUrl ?? "https://mcp.vercel.com";
	let client = null;
	let clientClosed = null;
	let disposers = /* @__PURE__ */ new Map();
	let catalog = [];
	let reconnectTimer = null;
	let failedAttempts = 0;
	let ready = false;
	let startInFlight = null;
	let disposed = false;
	let permanentlyDisposed = false;
	let syncChain = Promise.resolve();
	const agentAccess = /* @__PURE__ */ new Map();
	const resultCache = new AgentResultCache();
	const isCurrent = (generation) => !disposed && client === generation;
	function refreshAgentRestriction(agent, access) {
		const deny = catalog.map((entry) => entry.publicName).filter((name) => !access.loaded.has(name));
		const next = deny.length === 0 ? void 0 : agent.ctx.tools.restrict({ deny });
		const previous = access.disposeRestriction;
		access.disposeRestriction = next;
		previous?.();
	}
	function ensureAgentAccess(agent) {
		const existing = agentAccess.get(agent);
		if (existing !== void 0) return existing;
		const access = {
			loaded: /* @__PURE__ */ new Set(),
			disposeGuard: () => {}
		};
		access.disposeGuard = agent.ctx.tools.guard((exec) => {
			if (!exec.name.startsWith(PUBLIC_PREFIX)) return void 0;
			if (access.loaded.has(exec.name) && catalog.some((entry) => entry.publicName === exec.name)) return void 0;
			return "This Vercel MCP tool is not loaded in this agent session.";
		});
		agentAccess.set(agent, access);
		try {
			refreshAgentRestriction(agent, access);
		} catch (error) {
			access.disposeGuard();
			agentAccess.delete(agent);
			throw error;
		}
		return access;
	}
	function releaseAgentAccess(agent) {
		resultCache.clear(agent);
		const access = agentAccess.get(agent);
		if (access === void 0) return;
		access.disposeRestriction?.();
		access.disposeGuard();
		agentAccess.delete(agent);
	}
	function refreshAllAgentRestrictions() {
		const currentNames = new Set(catalog.map((entry) => entry.publicName));
		for (const [agent, access] of agentAccess) {
			let count = 0;
			let characters = 0;
			const bounded = /* @__PURE__ */ new Set();
			for (const name of access.loaded) {
				const entry = catalog.find((candidate) => candidate.publicName === name);
				if (!currentNames.has(name) || entry === void 0) continue;
				const size = modelSchemaCharacters(entry);
				if (count >= MAX_SESSION_TOOLS || characters + size > MAX_SESSION_SCHEMA_CHARS) continue;
				bounded.add(name);
				count += 1;
				characters += size;
			}
			if (bounded.size < access.loaded.size) ctx.logger.warn(`${label}: catalog changed; ${access.loaded.size - bounded.size} session tool(s) were unloaded to stay within the schema budget`);
			access.loaded = bounded;
			refreshAgentRestriction(agent, access);
		}
	}
	function accessFor(agent) {
		if (agent === void 0) throw new Error("Vercel MCP tool management requires an active Agent session.");
		return ensureAgentAccess(agent);
	}
	function currentCatalog() {
		if (!ready || client === null) throw new Error("Vercel MCP 未连接。");
		return catalog;
	}
	const disposeAgentCreated = ctx.on("agent/created", ({ agent }) => {
		ensureAgentAccess(agent);
	});
	const disposeAgentDisposed = ctx.on("agent/disposed", ({ agent }) => {
		releaseAgentAccess(agent);
	});
	for (const agent of ctx.agents.list()) ensureAgentAccess(agent);
	function clearRegisteredTools() {
		resultCache.clear();
		const run = syncChain.then(() => {
			for (const dispose of disposers.values()) dispose();
			disposers = /* @__PURE__ */ new Map();
			catalog = [];
			refreshAllAgentRestrictions();
		});
		syncChain = run.catch(() => {});
		return run;
	}
	function enqueueSync(generation) {
		const run = syncChain.then(async () => {
			if (!isCurrent(generation)) return;
			const nextCatalog = await listToolsAll(generation);
			if (!isCurrent(generation)) return;
			const names = /* @__PURE__ */ new Set();
			const entries = nextCatalog.map((tool) => {
				const publicName = mapPublicToolName(tool.name);
				if (names.has(publicName)) throw new Error("MCP tool names map to a duplicate DSH name");
				names.add(publicName);
				return {
					tool,
					publicName,
					entry: catalogEntry(tool, publicName)
				};
			});
			for (const dispose of disposers.values()) dispose();
			disposers = /* @__PURE__ */ new Map();
			catalog = [];
			try {
				for (const { tool, publicName, entry } of entries) {
					const toolMetadata = {
						name: tool.name,
						publicName,
						...tool.title === void 0 ? {} : { title: tool.title },
						...tool.outputSchema === void 0 ? {} : { outputSchema: tool.outputSchema },
						...tool.annotations === void 0 ? {} : { annotations: tool.annotations },
						...tool.execution === void 0 ? {} : { execution: tool.execution },
						...tool._meta === void 0 ? {} : { _meta: tool._meta },
						...tool.icons === void 0 ? {} : { icons: tool.icons }
					};
					const definition = {
						name: publicName,
						description: tool.description ?? "",
						parameters: modelParameters(publicName, tool.description ?? "", tool.inputSchema, DESCRIBE_TOOL_NAME).parameters,
						output: {
							schema: {
								type: "object",
								additionalProperties: true
							},
							render(_args, value) {
								return renderMcpResult(value);
							},
							presentationMeta(_args, value) {
								const result = isRecord(value) ? value : {};
								const error = result.isError === true;
								return jsonDataCopy({
									source: "mcp.vercel",
									tool: toolMetadata,
									result: error ? result : {
										isError: false,
										...result.structuredContent === void 0 ? {} : { structuredContent: result.structuredContent },
										...result._meta === void 0 ? {} : { _meta: result._meta }
									}
								});
							}
						},
						timeoutMs: TOOL_CALL_TIMEOUT_MS,
						execute: async (args, exec) => {
							if (!isCurrent(generation)) throw new Error("Vercel MCP tool is no longer connected");
							const cleanArgs = isRecord(args) ? jsonCopy(args) : {};
							const result = jsonCopy(await withVerifiedProjectScope(tool.name, cleanArgs, (scopedArgs) => callTool(generation, tool.name, scopedArgs, exec.signal), exec.signal));
							exec.signal.throwIfAborted();
							if (!isCurrent(generation)) throw new Error("Vercel MCP tool is no longer connected");
							if (!isRecord(result)) return result;
							const rendered = renderedMcpText(result.content, result.structuredContent);
							if (rendered.length <= 12e3) return result;
							const json = isRecord(result.structuredContent) ? result.structuredContent : parseJsonText(rendered);
							const resultId = exec.agent === void 0 || !agentAccess.has(exec.agent) ? void 0 : resultCache.put(exec.agent, rendered, json);
							result._meta = {
								...isRecord(result._meta) ? result._meta : {},
								[RESULT_PAGE_META_KEY]: {
									totalCharacters: rendered.length,
									nextOffset: json === void 0 ? MODEL_RESULT_CHARACTERS : JSON_PREVIEW_CHARACTERS,
									...json === void 0 ? {} : { outline: outlineJson(json) },
									...resultId === void 0 ? { continuationUnavailable: true } : { resultId }
								}
							};
							return result;
						}
					};
					disposers.set(publicName, ctx.tools.register(definition));
					catalog.push(entry);
				}
				refreshAllAgentRestrictions();
			} catch (error) {
				for (const dispose of disposers.values()) dispose();
				disposers = /* @__PURE__ */ new Map();
				catalog = [];
				for (const [agent, access] of agentAccess) try {
					refreshAgentRestriction(agent, access);
				} catch {}
				throw error;
			}
		});
		syncChain = run.catch(() => {});
		return run;
	}
	async function listToolsAll(generation) {
		const tools = [];
		let cursor;
		do {
			const response = await generation.request({
				method: "tools/list",
				...cursor === void 0 ? {} : { params: { cursor } }
			}, ListToolsResultSchema);
			tools.push(...response.tools.map(copyToolDefinition));
			cursor = response.nextCursor;
		} while (cursor !== void 0);
		const rawNames = /* @__PURE__ */ new Set();
		for (const tool of tools) {
			if (rawNames.has(tool.name)) throw new Error("MCP tools/list returned a duplicate raw tool name");
			rawNames.add(tool.name);
		}
		return tools;
	}
	function catalogEntry(tool, publicName) {
		return jsonCopy({
			rawName: tool.name,
			publicName,
			...tool.title === void 0 ? {} : { title: tool.title },
			...tool.description === void 0 ? {} : { description: tool.description },
			inputSchema: tool.inputSchema,
			...tool.outputSchema === void 0 ? {} : { outputSchema: tool.outputSchema },
			...tool.annotations === void 0 ? {} : { annotations: tool.annotations },
			...tool.execution === void 0 ? {} : { execution: tool.execution },
			...tool._meta === void 0 ? {} : { _meta: tool._meta },
			...tool.icons === void 0 ? {} : { icons: tool.icons }
		});
	}
	async function callTool(generation, rawName, args, signal) {
		return await generation.request({
			method: "tools/call",
			params: {
				name: rawName,
				arguments: args
			}
		}, RawCallToolResultSchema, {
			signal,
			timeout: TOOL_CALL_TIMEOUT_MS
		});
	}
	function generationDown(generation) {
		if (client !== generation) return;
		client = null;
		clientClosed = null;
		ready = false;
		resultCache.clear();
		clearRegisteredTools().then(scheduleReconnect, (error) => {
			ctx.logger.error(`${label}: unable to unregister tools after disconnect (${safeErrorKind(error)})`);
			scheduleReconnect();
		});
	}
	function waitForClose(closed) {
		return new Promise((resolve) => {
			const timeout = setTimeout(() => resolve(false), GENERATION_CLOSE_TIMEOUT_MS);
			timeout.unref();
			closed.then(() => {
				clearTimeout(timeout);
				resolve(true);
			});
		});
	}
	function scheduleReconnect() {
		if (disposed || reconnectTimer !== null) return;
		if (failedAttempts >= RECONNECT.maxAttempts) {
			ctx.logger.error(`${label}: reconnect limit reached; tools unregistered. Re-authorize or restart to reconnect.`);
			return;
		}
		const delayMs = Math.min(RECONNECT.maxDelayMs, RECONNECT.initialDelayMs * 2 ** failedAttempts);
		failedAttempts += 1;
		ctx.logger.warn(`${label}: connection lost; retry scheduled (attempt ${failedAttempts}/${RECONNECT.maxAttempts}, ${delayMs}ms)`);
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			runConnection(false).catch((error) => ctx.logger.warn(`${label}: reconnect attempt failed (${safeErrorKind(error)})`));
		}, delayMs);
		reconnectTimer.unref();
	}
	async function connectGeneration(startup) {
		if (disposed) return;
		const cfg = await store.load();
		if (disposed) return;
		if (cfg.tokens === null || cfg.tokens.access_token === "") {
			ctx.logger.info(`${label}: no OAuth tokens — connection deferred until authorization completes`);
			return;
		}
		const generation = new Client({
			name: "@adenxie/dsh-vercel",
			version: "0.4.0"
		}, { capabilities: {} });
		let resolveClosed;
		const closed = new Promise((resolve) => {
			resolveClosed = resolve;
		});
		let attemptSettled = false;
		let closeObserved = false;
		client = generation;
		clientClosed = closed;
		generation.onclose = () => {
			closeObserved = true;
			resolveClosed();
			if (attemptSettled) generationDown(generation);
		};
		generation.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
			if (!isCurrent(generation)) return;
			try {
				await enqueueSync(generation);
			} catch (error) {
				if (!disposed) ctx.logger.error(`${label}: tool re-sync failed (${safeErrorKind(error)})`);
			}
		});
		try {
			const transport = new StreamableHTTPClientTransport(new URL(serverUrl), { authProvider: flow.getProvider(callbackUrl) });
			await generation.connect(transport);
			if (!isCurrent(generation) || closeObserved) {
				attemptSettled = true;
				if (client === generation) generationDown(generation);
				return;
			}
			await enqueueSync(generation);
			if (!isCurrent(generation) || closeObserved) {
				attemptSettled = true;
				if (client === generation) generationDown(generation);
				return;
			}
			ready = true;
			failedAttempts = 0;
		} catch (error) {
			if (startup) ctx.logger.warn(`${label}: connection attempt failed (${safeErrorKind(error)})`);
			try {
				await generation.close();
			} catch {}
			const quiesced = closeObserved || await waitForClose(closed);
			attemptSettled = true;
			if (!isCurrent(generation)) return;
			if (!quiesced) {
				client = null;
				clientClosed = null;
				await clearRegisteredTools();
				ctx.logger.error(`${label}: failed generation did not close; automatic reconnect stopped`);
				return;
			}
			generationDown(generation);
			if (startup) throw error;
			return;
		}
		attemptSettled = true;
		if (closeObserved && client === generation) generationDown(generation);
	}
	function runConnection(startup) {
		if (disposed || permanentlyDisposed) return Promise.resolve();
		if (ready && client !== null) return Promise.resolve();
		if (startInFlight !== null) return startInFlight;
		startInFlight = connectGeneration(startup).finally(() => {
			startInFlight = null;
		});
		return startInFlight;
	}
	function catalogError() {
		throw new Error("Vercel MCP 未连接。");
	}
	function getAccess(agent) {
		if (agent === void 0) throw new Error("Vercel MCP 工具管理需要当前 Agent 会话。");
		return accessFor(agent);
	}
	function currentNames() {
		if (!ready || client === null) catalogError();
		return new Set(catalog.map((entry) => entry.publicName));
	}
	/** Map a raw Vercel MCP name to its namespaced DSH name; namespaced or unknown names pass through. */
	function resolvePublicName(name, available) {
		if (available.has(name)) return name;
		const mapped = mapPublicToolName(name);
		return available.has(mapped) ? mapped : name;
	}
	function parentAgents(agent) {
		return ctx.agents.list().filter((candidate) => candidate !== agent && ctx.agents.isOwnedBy(agent.id, candidate));
	}
	return {
		async start() {
			if (disposed) disposed = false;
			failedAttempts = 0;
			if (reconnectTimer !== null) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			await runConnection(true);
		},
		isConnected() {
			return client !== null && ready;
		},
		toolCount() {
			return disposers.size;
		},
		availableToolCount() {
			return disposers.size;
		},
		loadedToolCount(agent) {
			return agent === void 0 ? 0 : agentAccess.get(agent)?.loaded.size ?? 0;
		},
		loadedSchemaCharacters(agent) {
			if (agent === void 0) return 0;
			const access = agentAccess.get(agent);
			if (access === void 0) return 0;
			return catalog.reduce((total, entry) => total + (access.loaded.has(entry.publicName) ? modelSchemaCharacters(entry) : 0), 0);
		},
		async listTools() {
			return (await this.listToolCatalog()).map((tool) => tool.rawName);
		},
		async listToolCatalog() {
			if (!ready || client === null) throw new Error("Vercel MCP 未连接。");
			return jsonCopy(catalog);
		},
		searchTools(agent, query, limit = DEFAULT_SEARCH_RESULTS) {
			getAccess(agent);
			const entries = currentCatalog();
			const normalize = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
			const normalizedQuery = normalize(query.trim().slice(0, MAX_SEARCH_QUERY));
			const terms = normalizedQuery.split(/\s+/).filter(Boolean);
			const maxResults = Math.max(1, Math.min(Math.floor(limit), MAX_SEARCH_RESULTS));
			return entries.map((entry, index) => {
				const name = normalize(entry.rawName);
				const title = normalize(entry.title ?? "");
				const haystack = `${name} ${title} ${normalize(entry.description ?? "")}`;
				const matched = normalize(entry.publicName) === normalizedQuery || terms.every((term) => haystack.includes(term));
				const nameMatch = terms.every((term) => name.includes(term));
				return {
					entry,
					index,
					matched,
					score: normalizedQuery === "" ? 0 : name === normalizedQuery || normalize(entry.publicName) === normalizedQuery ? 1e3 : nameMatch ? 500 + 1 / (name.length + 1) : title.includes(normalizedQuery) ? 300 : 100
				};
			}).filter((match) => match.matched).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, maxResults).map((match) => match.entry).map((entry) => ({
				name: entry.publicName,
				...entry.title === void 0 ? {} : { title: entry.title.slice(0, 100) },
				description: (entry.description ?? "").replace(/\s+/g, " ").slice(0, MAX_SEARCH_DESCRIPTION)
			}));
		},
		loadTools(agent, names, replace = false) {
			const access = getAccess(agent);
			const available = currentNames();
			const requested = [...new Set(names.map((name) => resolvePublicName(name, available)))];
			if (requested.length > MAX_SESSION_TOOLS) throw new Error(`At most ${MAX_SESSION_TOOLS} Vercel MCP tools may be loaded in one session.`);
			const unknown = requested.filter((name) => !available.has(name));
			if (unknown.length > 0) throw new Error(`Unknown or unavailable Vercel MCP tool: ${unknown.slice(0, MAX_SESSION_TOOLS).join(", ")}`);
			const next = replace ? /* @__PURE__ */ new Set() : new Set(access.loaded);
			for (const name of requested) next.add(name);
			if (next.size > MAX_SESSION_TOOLS) throw new Error(`At most ${MAX_SESSION_TOOLS} Vercel MCP tools may be loaded in one session.`);
			const schemaCharacters = catalog.reduce((total, entry) => total + (next.has(entry.publicName) ? modelSchemaCharacters(entry) : 0), 0);
			if (schemaCharacters > MAX_SESSION_SCHEMA_CHARS) throw new Error(`Loaded Vercel MCP schemas would use ${schemaCharacters} characters; the per-session budget is ${MAX_SESSION_SCHEMA_CHARS}. Use replace or unload first.`);
			for (const parent of parentAgents(agent)) {
				const parentLoaded = agentAccess.get(parent)?.loaded ?? /* @__PURE__ */ new Set();
				const deniedByParent = requested.filter((name) => !parentLoaded.has(name));
				if (deniedByParent.length > 0) throw new Error(`The parent Agent must load these Vercel MCP tools first: ${deniedByParent.slice(0, MAX_SESSION_TOOLS).join(", ")}`);
			}
			const previous = access.loaded;
			access.loaded = next;
			try {
				refreshAgentRestriction(agent, access);
			} catch (error) {
				access.loaded = previous;
				throw error;
			}
			const hiddenByAncestor = requested.filter((name) => agent.ctx.tools.get(name, agent) === void 0);
			if (hiddenByAncestor.length > 0) {
				access.loaded = previous;
				try {
					refreshAgentRestriction(agent, access);
				} catch (error) {
					throw new Error(`Unable to restore this session's Vercel MCP restriction: ${String(error instanceof Error ? error.message : error)}`);
				}
				throw new Error(`Host or parent scope restrictions hide these Vercel MCP tools; this session cannot grant them: ${hiddenByAncestor.slice(0, MAX_SESSION_TOOLS).join(", ")}`);
			}
			return [...access.loaded];
		},
		unloadTools(agent, names) {
			const access = getAccess(agent);
			const removed = names === void 0 ? [...access.loaded] : [...access.loaded].filter((name) => names.includes(name));
			const next = new Set([...access.loaded].filter((name) => !removed.includes(name)));
			const previous = access.loaded;
			access.loaded = next;
			try {
				refreshAgentRestriction(agent, access);
			} catch (error) {
				access.loaded = previous;
				throw error;
			}
			return removed;
		},
		loadedTools(agent) {
			return [...getAccess(agent).loaded];
		},
		resolveLoadedTool(agent, name) {
			const access = getAccess(agent);
			const publicName = resolvePublicName(name, currentNames());
			return access.loaded.has(publicName) ? publicName : void 0;
		},
		describeTool(agent, name, path = "") {
			getAccess(agent);
			const publicName = resolvePublicName(name, currentNames());
			const entry = catalog.find((candidate) => candidate.publicName === publicName);
			if (entry === void 0) throw new Error(`Unknown or unavailable Vercel MCP tool: ${name}`);
			const trimmed = path.trim();
			const node = trimmed === "" ? entry.inputSchema : schemaAtPath(entry.inputSchema, trimmed);
			if (node === void 0) throw new Error(`No input property at path "${trimmed}" for ${publicName}.`);
			const { collapsed } = modelParameters(publicName, entry.description ?? "", entry.inputSchema, DESCRIBE_TOOL_NAME);
			return {
				name: publicName,
				path: trimmed,
				collapsed,
				schema: describeSchema(node, trimmed, DESCRIBE_TOOL_NAME)
			};
		},
		readResult(agent, resultId, offset, limit) {
			if (agent === void 0) throw new Error("续读结果需要当前 Agent 会话。");
			if (!agentAccess.has(agent)) return void 0;
			return resultCache.read(agent, resultId, offset, limit);
		},
		projectResult(agent, resultId, options) {
			if (agent === void 0) throw new Error("续读结果需要当前 Agent 会话。");
			if (!agentAccess.has(agent)) return void 0;
			return resultCache.project(agent, resultId, options);
		},
		async dispose() {
			disposed = true;
			resultCache.clear();
			ready = false;
			if (reconnectTimer !== null) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			const current = client;
			const currentClosed = clientClosed;
			client = null;
			clientClosed = null;
			if (current !== null) {
				try {
					await current.close();
				} catch {}
				if (currentClosed !== null && !await waitForClose(currentClosed)) ctx.logger.error(`${label}: generation did not close within ${GENERATION_CLOSE_TIMEOUT_MS}ms during disposal`);
			}
			if (startInFlight !== null) await startInFlight.catch(() => {});
			await syncChain;
			for (const dispose of disposers.values()) dispose();
			disposers = /* @__PURE__ */ new Map();
			catalog = [];
			refreshAllAgentRestrictions();
		},
		async shutdown() {
			permanentlyDisposed = true;
			await this.dispose();
			disposeAgentCreated();
			disposeAgentDisposed();
			for (const agent of [...agentAccess.keys()]) releaseAgentAccess(agent);
		}
	};
}
//#endregion
//#region src/routes.ts
/** Route paths. */
const VERCEL_MCP_API = {
	status: "/api/adenxie/dsh-vercel/status",
	oauthStart: "/api/adenxie/dsh-vercel/oauth/start",
	oauthCallback: "/api/adenxie/dsh-vercel/oauth/callback",
	oauthFinish: "/api/adenxie/dsh-vercel/oauth/finish",
	oauthRefresh: "/api/adenxie/dsh-vercel/oauth/refresh",
	test: "/api/adenxie/dsh-vercel/test",
	catalog: "/api/adenxie/dsh-vercel/catalog",
	clear: "/api/adenxie/dsh-vercel/clear"
};
/** Cap on JSON request bodies. */
const MAX_JSON_BODY_BYTES = 64 * 1024;
/** Strict loopback fence for the non-callback routes. */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** Callback route fence: loopback client + host header, any origin (cross-site navigation from the OAuth provider is expected). */
function isLoopbackCallbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	try {
		const hostUrl = new URL(`http://${host}`);
		return hostUrl.hostname === "127.0.0.1" || hostUrl.hostname === "localhost" || hostUrl.hostname === "[::1]";
	} catch {
		return false;
	}
}
/** One JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(payload);
}
/** One HTML response (used only by the OAuth callback page). */
function writeHtml(res, status, title, body) {
	const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[char]);
	title = escapeHtml(title);
	body = escapeHtml(body);
	const html = "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>" + title + "</title><style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:90vh;margin:0;background:#f6f7f9;color:#1f2328}.card{background:#fff;border:1px solid #e2e5e9;border-radius:12px;padding:32px 40px;max-width:520px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:18px;margin:0 0 12px}p{font-size:14px;line-height:1.7;margin:0}</style></head><body><div class=\"card\"><h1>" + title + "</h1><p>" + body + "</p></div></body></html>";
	res.writeHead(status, {
		"content-type": "text/html; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(html);
}
/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > MAX_JSON_BODY_BYTES) return void 0;
		chunks.push(buffer);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null ? parsed : void 0;
	} catch {
		return;
	}
}
/** Extract a string query parameter. */
function queryParam(req, name) {
	try {
		return new URL(req.url ?? "", "http://localhost").searchParams.get(name) ?? "";
	} catch {
		return "";
	}
}
/**
* Build every /api/adenxie/dsh-vercel route (exact paths).
* @param deps - store, oauth flow, MCP supervisor, callback URL.
* @returns the route list.
*/
function makeRoutes(deps) {
	const { store, flow, supervisor, callbackUrl } = deps;
	const guard = (req, res, method) => {
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return false;
		}
		if (req.method !== method) {
			writeJson(res, 405, { error: `method not allowed: ${req.method}` });
			return false;
		}
		return true;
	};
	const statusView = async () => {
		return {
			...await store.view(callbackUrl),
			connected: supervisor.isConnected(),
			toolCount: supervisor.toolCount(),
			availableToolCount: supervisor.availableToolCount()
		};
	};
	return [
		{
			kind: "exact",
			path: VERCEL_MCP_API.status,
			handler: async (req, res) => {
				if (!guard(req, res, "GET")) return;
				writeJson(res, 200, await statusView());
			}
		},
		{
			kind: "exact",
			path: VERCEL_MCP_API.oauthStart,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				try {
					const { authorizeUrl } = await flow.begin(callbackUrl);
					writeJson(res, 200, {
						ok: true,
						authorizeUrl,
						callbackUrl
					});
				} catch (error) {
					writeJson(res, 200, {
						ok: false,
						error: String(error instanceof Error ? error.message : error)
					});
				}
			}
		},
		{
			kind: "exact",
			path: VERCEL_MCP_API.oauthCallback,
			handler: async (req, res) => {
				if (!isLoopbackCallbackRequest(req)) {
					writeHtml(res, 403, "授权失败", "回调请求来自非本机地址，已拒绝。");
					return;
				}
				const code = queryParam(req, "code");
				const state = queryParam(req, "state");
				const error = queryParam(req, "error");
				if (error !== "") {
					flow.abort();
					writeHtml(res, 400, "授权失败", "Vercel 返回错误：" + error + "。请重试或粘贴完整回调 URL。");
					return;
				}
				if (code === "") {
					writeHtml(res, 400, "授权失败", "回调中没有 code 参数。");
					return;
				}
				const result = await flow.complete(code, state);
				if (!result.ok) {
					writeHtml(res, 400, "授权失败", result.message);
					return;
				}
				supervisor.start().catch(() => {});
				writeHtml(res, 200, "授权成功", "Vercel MCP 授权已完成，令牌已保存。现在可以关闭此页面，回到 DSH 设置面板或继续对话。");
			}
		},
		{
			kind: "exact",
			path: VERCEL_MCP_API.oauthFinish,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const body = await readJsonBody(req);
				if (body === void 0) {
					writeJson(res, 400, { error: "invalid JSON body" });
					return;
				}
				const callback = parseManualCallback({
					code: typeof body.code === "string" ? body.code : void 0,
					state: typeof body.state === "string" ? body.state : void 0,
					redirectUrl: typeof body.redirectUrl === "string" ? body.redirectUrl : void 0
				});
				if (callback === null) {
					writeJson(res, 400, { error: "需要完整回调 URL，或同时提供 code 和 state。" });
					return;
				}
				const result = await flow.complete(callback.code, callback.state);
				if (result.ok) supervisor.start().catch(() => {});
				writeJson(res, 200, {
					ok: result.ok,
					message: result.message,
					view: await statusView()
				});
			}
		},
		{
			kind: "exact",
			path: VERCEL_MCP_API.oauthRefresh,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const provider = flow.activeProvider;
				if (provider === null) {
					writeJson(res, 200, {
						ok: false,
						message: "没有活动的 OAuth provider（服务重启后请先测试连接以触发刷新）。",
						view: await statusView()
					});
					return;
				}
				const result = await provider.forceRefresh();
				writeJson(res, 200, {
					ok: result === "refreshed",
					code: result,
					message: {
						refreshed: "令牌刷新成功。",
						missing_refresh_token: "当前授权没有 refresh_token；现有 access token 保留，可继续使用。请点击「重新授权」并同意 offline_access 以启用自动刷新。",
						missing_client_information: "缺少客户端注册信息，无法刷新；现有 access token 保留，请重新授权。",
						missing_discovery: "缺少授权服务器发现信息，无法刷新；现有 access token 保留，请重新授权。",
						invalid_grant: "Vercel 拒绝了 refresh_token；现有凭据未清除。请重新授权以继续使用自动刷新。",
						failed: "刷新失败；现有凭据未清除。可继续测试连接，或重新授权。"
					}[result],
					view: await statusView()
				});
			}
		},
		{
			kind: "exact",
			path: VERCEL_MCP_API.test,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				if (!(await store.view(callbackUrl)).authorized) {
					writeJson(res, 200, {
						ok: false,
						error: "尚未授权：请先点击「开始授权」。",
						view: await statusView()
					});
					return;
				}
				try {
					if (!supervisor.isConnected()) await supervisor.start();
					const tools = await supervisor.listTools();
					writeJson(res, 200, {
						ok: true,
						message: `连接成功，发现 ${tools.length} 个 Vercel MCP 工具。`,
						tools,
						view: await statusView()
					});
				} catch (error) {
					writeJson(res, 200, {
						ok: false,
						error: String(error instanceof Error ? error.message : error),
						view: await statusView()
					});
				}
			}
		},
		{
			kind: "exact",
			path: VERCEL_MCP_API.catalog,
			handler: async (req, res) => {
				if (!guard(req, res, "GET")) return;
				try {
					writeJson(res, 200, {
						source: "mcp.vercel",
						tools: await supervisor.listToolCatalog()
					});
				} catch {
					writeJson(res, 503, { error: "Vercel MCP is not connected; no tool catalogue is available." });
				}
			}
		},
		{
			kind: "exact",
			path: VERCEL_MCP_API.clear,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				flow.abort();
				await supervisor.dispose();
				await store.clearAll();
				writeJson(res, 200, {
					ok: true,
					message: "已清除 Vercel MCP 的令牌与客户端注册。",
					view: await statusView()
				});
			}
		}
	];
}
//#endregion
//#region src/index.ts
/** Stable cordis plugin name. */
const name = "adenxie-dsh-vercel";
/** Services required before the surfaces can mount. */
const inject = [
	"tools",
	"systemPrompt",
	"webServer",
	"agents"
];
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 161;
/**
* Model-facing announcement. Sent with every request, so it holds only the
* routing a model cannot infer from the tool declarations; it stays static so
* the system prompt remains a stable cache prefix.
*/
const VERCEL_MCP_GUIDANCE = "Vercel（@adenxie/dsh-vercel）：用 adenxie_vercel_mcp_search_tools 搜索、adenxie_vercel_mcp_load_tools 加载，本回合下一步即可调用 mcp__adenxie_vercel__* 工具，不要等用户或重复加载；如果工具列表里看不到已加载的工具，改用 adenxie_vercel_mcp_call 传 name 和 arguments。已加载的工具尽量保留，卸载会使提示缓存失效。参数标注“已折叠”时用 adenxie_vercel_mcp_describe_tool。未连接时用 adenxie_vercel_mcp_account 的 login。技能用 adenxie_vercel_skill 读取，只作指导。不要读取插件凭据文件或绕过插件直连 Vercel。写入或部署前确认项目和环境，有结果证据再报告完成。";
/**
* Mount the Vercel MCP tools, helper tools, routes, and announcement.
* @param ctx - host plugin context carrying tools/systemPrompt/webServer.
* @param config - plugin config from the composition row.
*/
function apply(ctx, config) {
	const announceToAgent = config?.announceToAgent !== false;
	const enabled = config?.enabled !== false;
	const store = new VercelMcpStore();
	const flow = new OAuthFlow(store);
	const callbackUrl = `http://127.0.0.1:${ctx.webServer.port}${VERCEL_MCP_API.oauthCallback}`;
	const supervisor = createSupervisor(ctx, store, flow, callbackUrl);
	const context = {
		store,
		flow,
		supervisor,
		callbackUrl,
		tools: ctx.tools
	};
	let disposeTools;
	let disposeRoutes;
	let disposeSection;
	let disposeMcpResultSemantics;
	let started = false;
	const sync = () => {
		if (disposeTools !== void 0) {
			disposeTools();
			disposeTools = void 0;
		}
		if (disposeRoutes !== void 0) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
		if (disposeSection !== void 0) {
			disposeSection();
			disposeSection = void 0;
		}
		if (disposeMcpResultSemantics !== void 0) {
			disposeMcpResultSemantics();
			disposeMcpResultSemantics = void 0;
		}
		if (!enabled) return;
		disposeMcpResultSemantics = ctx.effect(() => registerMcpResultSemantics(ctx), "adenxie-dsh-vercel: MCP result semantics");
		disposeTools = ctx.effect(() => {
			const disposers = buildTools(context).map((tool) => ctx.tools.register(tool));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "adenxie-dsh-vercel: tools");
		disposeRoutes = ctx.effect(() => {
			const disposers = makeRoutes(context).map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "adenxie-dsh-vercel: routes");
		if (announceToAgent) disposeSection = ctx.systemPrompt.section({
			name: "plugin:adenxie-dsh-vercel",
			order: SECTION_ORDER,
			text: VERCEL_MCP_GUIDANCE
		});
	};
	sync();
	(async () => {
		if (!enabled) return;
		if ((await store.view(callbackUrl)).authorized && !started) {
			started = true;
			supervisor.start().catch(() => {});
		}
	})();
	ctx.effect(() => {
		return () => {
			supervisor.shutdown();
		};
	}, "adenxie-dsh-vercel: connection");
}
path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skills/vercel");
function isWithin(root, candidate) {
	const relative = path.relative(root, candidate);
	return relative === "" || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}
async function verifiedSkillsRoot() {
	const packageRoot = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
	const expected = path.resolve(packageRoot, "skills", "vercel");
	if (!isWithin(expected, await realpath(expected))) throw new Error("技能目录不能指向包外路径。");
	return expected;
}
function skillDescription(markdown, fallback) {
	const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
	if (frontmatter === void 0) return fallback;
	const lines = frontmatter.split(/\r?\n/);
	const row = lines.findIndex((line) => /^description\s*:/.test(line));
	if (row < 0) return fallback;
	const value = lines[row].replace(/^description\s*:\s*/, "");
	if (value.startsWith("\"") || value.startsWith("'")) {
		const quote = value[0];
		const quoted = [value.slice(1)];
		const closes = (part) => part.endsWith(quote) && !part.endsWith("\\" + quote);
		if (!closes(quoted[0])) for (const line of lines.slice(row + 1)) {
			quoted.push(line.trim());
			if (closes(quoted.at(-1))) break;
		}
		const last = quoted.at(-1);
		if (closes(last)) quoted[quoted.length - 1] = last.slice(0, -1);
		const combined = quoted.join(" ").trim().replace(/\s+/g, " ");
		if (quote === "'") return combined.replaceAll("''", "'");
		try {
			return JSON.parse(`"${combined.replaceAll("\"", "\\\"")}"`);
		} catch {
			return combined.replaceAll("\\\"", "\"");
		}
	}
	if (value !== "|" && value !== ">" && value !== "|-" && value !== ">-") return value || fallback;
	const body = [];
	for (const line of lines.slice(row + 1)) {
		if (line.trim() !== "" && !/^\s/.test(line)) break;
		body.push(line.trim());
	}
	return body.filter(Boolean).join(" ") || fallback;
}
async function listVercelSkills(query = "") {
	const needle = query.trim().toLowerCase();
	const entries = (await readdir(await verifiedSkillsRoot(), { withFileTypes: true })).filter((entry) => entry.isDirectory());
	return (await Promise.all(entries.map(async ({ name }) => {
		return {
			name,
			description: skillDescription(await readVercelSkill(`${name}/SKILL.md`), name),
			path: `${name}/SKILL.md`
		};
	}))).filter((skill) => needle === "" || `${skill.name} ${skill.description}`.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name));
}
async function readVercelSkill(relativePath) {
	if (typeof relativePath !== "string" || relativePath.trim() === "" || path.isAbsolute(relativePath)) throw new Error("技能路径必须是包内相对路径。");
	if (relativePath.split(/[\\/]/).includes("..")) throw new Error("技能路径不能包含目录回退段。");
	const root = await verifiedSkillsRoot();
	const candidate = path.resolve(root, relativePath);
	if (!isWithin(root, candidate) || candidate === root) throw new Error("拒绝访问技能目录之外的路径。");
	const actual = await realpath(candidate);
	if (!isWithin(root, actual)) throw new Error("拒绝通过符号链接访问技能目录之外的路径。");
	if (!actual.toLowerCase().endsWith(".md")) throw new Error("只允许读取 Markdown 技能和引用文件。");
	return readFile(actual, "utf8");
}
/** Build every agent-facing adenxie_vercel_* tool. */
function buildTools(ctx) {
	return [
		...createOnDemandTools(ctx.supervisor, ctx.tools),
		vercelMcpAccountTool(ctx),
		vercelSkillTool()
	];
}
/** Build the bounded, agent-scoped catalog and result controls. */
function createOnDemandTools(supervisor, tools) {
	const ctx = {
		supervisor,
		tools
	};
	return [
		vercelMcpSearchToolsTool(ctx),
		vercelMcpLoadToolsTool(ctx),
		vercelMcpUnloadToolsTool(ctx),
		vercelMcpCallTool(ctx),
		vercelMcpDescribeToolTool(ctx),
		vercelMcpReadResultTool(ctx)
	];
}
function safeSessionToolState(supervisor, agent) {
	try {
		return {
			loaded: supervisor.loadedTools(agent),
			loadedCount: supervisor.loadedToolCount(agent),
			schemaCharacters: supervisor.loadedSchemaCharacters(agent)
		};
	} catch {
		return {
			loaded: [],
			loadedCount: 0,
			schemaCharacters: 0
		};
	}
}
/** One text content block. */
function text(value) {
	return [{
		type: "text",
		text: value
	}];
}
function errorMessage(error) {
	return String(error instanceof Error ? error.message : error);
}
const OK_MESSAGE_SCHEMA = {
	type: "object",
	additionalProperties: true,
	properties: {
		ok: {
			type: "boolean",
			required: true
		},
		message: {
			type: "string",
			required: true
		}
	}
};
function vercelMcpSearchToolsTool(ctx) {
	return defineTool({
		name: "adenxie_vercel_mcp_search_tools",
		description: "按名称或用途搜索 Vercel MCP 工具，返回名称和短说明（不含 schema）。",
		parameters: {
			query: {
				type: "string",
				description: "关键词"
			},
			limit: {
				type: "number",
				description: "1-8，默认5"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					tools: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: {
									type: "string",
									required: true
								},
								title: { type: "string" },
								description: {
									type: "string",
									required: true
								}
							}
						},
						required: true
					}
				}
			},
			render: (_args, value) => {
				const lines = [String(value.message ?? "")];
				const tools = Array.isArray(value.tools) ? value.tools : [];
				for (const item of tools) {
					if (typeof item !== "object" || item === null) continue;
					const entry = item;
					lines.push(`- ${String(entry.name ?? "")}${typeof entry.title === "string" ? ` (${entry.title})` : ""}: ${String(entry.description ?? "").slice(0, 120)}`);
				}
				return text(lines.join("\n").slice(0, 2400));
			}
		},
		async execute(args, exec) {
			try {
				const tools = ctx.supervisor.searchTools(exec.agent, args.query ?? "", args.limit);
				return {
					ok: true,
					message: `找到 ${tools.length} 项。`,
					tools
				};
			} catch (error) {
				return {
					ok: false,
					message: errorMessage(error),
					tools: []
				};
			}
		}
	});
}
function vercelMcpLoadToolsTool(ctx) {
	return defineTool({
		name: "adenxie_vercel_mcp_load_tools",
		description: "为当前 Agent 加载 Vercel MCP 工具。成功后本回合的下一步即可直接调用，无需等待用户。每个 Agent 最多6个、schema 合计32000字符。已知名称可跳过搜索。",
		parameters: {
			names: {
				type: "array",
				required: true,
				items: { type: "string" },
				description: "mcp__adenxie_vercel__* 名称或 Vercel 原始工具名，如 list_projects"
			},
			mode: {
				type: "string",
				enum: ["load", "replace"],
				description: "replace 先清空已加载集合（会使提示缓存失效）"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					loaded: {
						type: "array",
						items: { type: "string" },
						required: true
					},
					loadedCount: {
						type: "number",
						required: true
					},
					schemaCharacters: {
						type: "number",
						required: true
					}
				}
			},
			render: (_args, value) => {
				const names = Array.isArray(value.loaded) ? value.loaded.filter((name) => typeof name === "string").slice(0, 8) : [];
				return text([String(value.message ?? ""), ...names.map((name) => `- ${name}`)].join("\n").slice(0, 1600));
			}
		},
		async execute(args, exec) {
			try {
				const loaded = ctx.supervisor.loadTools(exec.agent, args.names, args.mode === "replace");
				const characters = ctx.supervisor.loadedSchemaCharacters(exec.agent);
				return {
					ok: true,
					message: `已加载 ${loaded.length} 项；schema ${characters}/32000 字符。现在就在下一步直接调用下列工具，不必再加载或等待用户：`,
					loaded,
					loadedCount: loaded.length,
					schemaCharacters: characters
				};
			} catch (error) {
				return {
					ok: false,
					message: errorMessage(error),
					...safeSessionToolState(ctx.supervisor, exec.agent)
				};
			}
		}
	});
}
function vercelMcpUnloadToolsTool(ctx) {
	return defineTool({
		name: "adenxie_vercel_mcp_unload_tools",
		description: "卸载当前 Agent 已加载的 Vercel MCP 工具；省略 names 时全部卸载。卸载会使提示缓存失效，仅在预算不足时使用。",
		parameters: { names: {
			type: "array",
			items: { type: "string" },
			description: "要卸载的工具名"
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: {
						type: "boolean",
						required: true
					},
					message: {
						type: "string",
						required: true
					},
					unloaded: {
						type: "array",
						items: { type: "string" },
						required: true
					},
					loadedCount: {
						type: "number",
						required: true
					},
					schemaCharacters: {
						type: "number",
						required: true
					}
				}
			},
			render: (_args, value) => {
				const names = Array.isArray(value.unloaded) ? value.unloaded.filter((name) => typeof name === "string").slice(0, 8) : [];
				return text([String(value.message ?? ""), ...names.map((name) => `- ${name}`)].join("\n").slice(0, 1600));
			}
		},
		async execute(args, exec) {
			try {
				const unloaded = ctx.supervisor.unloadTools(exec.agent, args.names);
				const characters = ctx.supervisor.loadedSchemaCharacters(exec.agent);
				const loadedCount = ctx.supervisor.loadedToolCount(exec.agent);
				return {
					ok: true,
					message: `已卸载 ${unloaded.length} 项；当前保留 ${loadedCount} 项，schema ${characters}/32000 字符。`,
					unloaded,
					loadedCount,
					schemaCharacters: characters
				};
			} catch (error) {
				const state = safeSessionToolState(ctx.supervisor, exec.agent);
				return {
					ok: false,
					message: errorMessage(error),
					unloaded: [],
					loadedCount: state.loadedCount,
					schemaCharacters: state.schemaCharacters
				};
			}
		}
	});
}
/**
* Fallback for routes that announce mid-session tools through deferred
* declarations the model may not treat as callable (observed on
* deepseek-flash, addition-only). It dispatches a tool already loaded in this
* Agent as a nested call, so host approval, guards and policies still apply to
* the real tool name; it never reaches a tool the Agent has not loaded.
*/
function vercelMcpCallTool(ctx) {
	return defineTool({
		name: "adenxie_vercel_mcp_call",
		description: "调用当前 Agent 已加载的 Vercel MCP 工具。仅当工具列表里看不到已加载的 mcp__adenxie_vercel__* 工具时使用；参数结构可用 describe_tool 查看。审批规则与直接调用相同。",
		parameters: {
			name: {
				type: "string",
				required: true,
				description: "已加载的工具名"
			},
			arguments: {
				type: "object",
				additionalProperties: true,
				description: "该工具的参数"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => {
				const blocks = Array.isArray(value.content) ? value.content.filter((block) => typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string") : [];
				return blocks.length > 0 ? blocks : text(String(value.message ?? ""));
			}
		},
		async execute(args, exec) {
			let name;
			try {
				name = ctx.supervisor.resolveLoadedTool(exec.agent, args.name);
			} catch (error) {
				return {
					ok: false,
					message: errorMessage(error)
				};
			}
			if (name === void 0) return {
				ok: false,
				message: `${args.name} 尚未在当前 Agent 加载；请先调用 adenxie_vercel_mcp_load_tools。`
			};
			const result = await ctx.tools.execute({
				callId: `${exec.callId}:vercel`,
				rootCallId: exec.rootCallId,
				name,
				arguments: typeof args.arguments === "object" && args.arguments !== null && !Array.isArray(args.arguments) ? args.arguments : {},
				...exec.agent === void 0 ? {} : { agent: exec.agent },
				parent: exec.token,
				signal: exec.signal
			});
			const content = result.content.filter((block) => block.type === "text").map((block) => ({
				type: "text",
				text: block.text
			}));
			if (result.isError) return {
				ok: false,
				tool: name,
				message: result.error.message,
				content
			};
			return {
				ok: true,
				tool: name,
				message: "ok",
				content
			};
		}
	});
}
function vercelMcpDescribeToolTool(ctx) {
	return defineTool({
		name: "adenxie_vercel_mcp_describe_tool",
		description: "查看 Vercel MCP 工具的完整参数结构；用于 schema 中标注“已折叠”的属性，path 用点号逐层进入。无需先加载。",
		parameters: {
			name: {
				type: "string",
				required: true,
				description: "工具名"
			},
			path: {
				type: "string",
				description: "属性路径，如 build.env；省略为整个输入"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => text(value.ok === true ? String(value.schema ?? "") : String(value.message ?? ""))
		},
		async execute(args, exec) {
			try {
				return {
					ok: true,
					message: "ok",
					...ctx.supervisor.describeTool(exec.agent, args.name, args.path)
				};
			} catch (error) {
				return {
					ok: false,
					message: errorMessage(error)
				};
			}
		}
	});
}
function vercelMcpReadResultTool(ctx) {
	return defineTool({
		name: "adenxie_vercel_mcp_read_result",
		description: "续读当前 Agent 收到的长 Vercel MCP 结果。JSON 结果可用 path/fields 只读数组条目的指定字段，此时 offset/limit 按条目计数。",
		parameters: {
			resultId: {
				type: "string",
				required: true
			},
			path: {
				type: "string",
				description: "JSON 内数组的点号路径；默认第一个数组"
			},
			fields: {
				type: "array",
				items: { type: "string" },
				description: "每个条目保留的字段，支持点号路径"
			},
			offset: {
				type: "number",
				description: "起始字符或条目，默认0"
			},
			limit: {
				type: "number",
				description: "字符数最多12000；条目数最多200，默认50"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_args, value) => {
				if (value.ok !== true || typeof value.text !== "string") return text(String(value.message ?? "结果不存在或不可续读。"));
				const next = typeof value.nextOffset === "number" ? String(value.nextOffset) : "null（已读完）";
				const total = typeof value.totalItems === "number" ? `totalItems=${String(value.totalItems)}` : `totalCharacters=${String(value.totalCharacters)}`;
				return text(`${value.text}\n\n[nextOffset=${next}; ${total}]`);
			}
		},
		async execute(args, exec) {
			try {
				const page = args.path !== void 0 || args.fields !== void 0 && args.fields.length > 0 ? ctx.supervisor.projectResult(exec.agent, args.resultId, {
					path: args.path,
					fields: args.fields,
					offset: args.offset,
					limit: args.limit
				}) : ctx.supervisor.readResult(exec.agent, args.resultId, args.offset, args.limit);
				if (page === void 0) return {
					ok: false,
					message: "找不到此 Agent 会话中的结果，或该结果已过期；请重新运行工具并缩小查询范围。"
				};
				return {
					ok: true,
					message: "结果页已读取。",
					...page
				};
			} catch (error) {
				return {
					ok: false,
					message: errorMessage(error)
				};
			}
		}
	});
}
async function accountStatus(ctx, agent) {
	const view = await ctx.store.view(ctx.callbackUrl);
	return {
		ok: true,
		message: "dsh-vercel：" + [
			view.authorized ? "已授权（令牌更新于 " + view.tokenUpdatedAt + "）" : "未授权",
			"MCP " + (ctx.supervisor.isConnected() ? "已连接" : "未连接"),
			"目录可用工具 " + ctx.supervisor.availableToolCount() + " 个",
			"本会话已加载 " + ctx.supervisor.loadedToolCount(agent) + " 个，schema " + ctx.supervisor.loadedSchemaCharacters(agent) + " 字符",
			"端点 " + view.mcpUrl,
			"配置路径 " + view.configPath
		].join("；") + "。" + (view.authorized ? "" : "请用 action=login 开始授权。"),
		authorized: view.authorized,
		connected: ctx.supervisor.isConnected(),
		toolCount: ctx.supervisor.toolCount(),
		availableToolCount: ctx.supervisor.availableToolCount(),
		loadedToolCount: ctx.supervisor.loadedToolCount(agent),
		loadedSchemaCharacters: ctx.supervisor.loadedSchemaCharacters(agent),
		tokenUpdatedAt: view.tokenUpdatedAt,
		mcpUrl: view.mcpUrl,
		configPath: view.configPath
	};
}
async function accountTest(ctx) {
	if (!(await ctx.store.view(ctx.callbackUrl)).authorized) return {
		ok: false,
		message: "尚未授权：请用 action=login 开始授权。"
	};
	try {
		if (!ctx.supervisor.isConnected()) await ctx.supervisor.start();
		const tools = await ctx.supervisor.listTools();
		return {
			ok: true,
			message: "连接成功：目录共有 " + tools.length + " 个工具；示例：" + tools.slice(0, 8).join("、") + "。",
			tools: tools.slice(0, 8),
			availableToolCount: tools.length
		};
	} catch (error) {
		return {
			ok: false,
			message: "测试失败：" + errorMessage(error)
		};
	}
}
async function accountLogin(ctx) {
	try {
		const { authorizeUrl } = await ctx.flow.begin(ctx.callbackUrl);
		return {
			ok: true,
			message: "请在浏览器中打开以下链接完成 Vercel 授权（登录后点击允许）：" + authorizeUrl,
			authorizeUrl
		};
	} catch (error) {
		return {
			ok: false,
			message: "开始授权失败：" + errorMessage(error)
		};
	}
}
async function accountFinish(ctx, args) {
	const callback = parseManualCallback(args);
	if (callback === null) return {
		ok: false,
		message: "需要完整回调 URL，或同时提供 code 和 state。"
	};
	const result = await ctx.flow.complete(callback.code, callback.state);
	if (result.ok) ctx.supervisor.start().catch(() => {});
	return result;
}
async function accountClear(ctx) {
	ctx.flow.abort();
	await ctx.supervisor.dispose();
	await ctx.store.clearAll();
	return {
		ok: true,
		message: "已清除 Vercel MCP 的全部凭据，MCP 工具已注销。"
	};
}
/** Connection and authorization actions, merged into one rarely used declaration. */
function vercelMcpAccountTool(ctx) {
	return defineTool({
		name: "adenxie_vercel_mcp_account",
		description: "Vercel 连接管理。status 查看状态；test 测试连接；login 返回 OAuth 授权链接；finish 用完整回调 URL 或 code+state 手动完成授权；clear 清除全部凭据（须先征得用户同意）。",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: [
					"status",
					"test",
					"login",
					"finish",
					"clear"
				]
			},
			redirectUrl: {
				type: "string",
				description: "finish：完整回调 URL"
			},
			code: {
				type: "string",
				description: "finish：回调中的 code"
			},
			state: {
				type: "string",
				description: "finish：回调中的 state"
			}
		},
		output: {
			schema: OK_MESSAGE_SCHEMA,
			render: (_args, value) => text(String(value.message ?? ""))
		},
		async execute(args, exec) {
			switch (args.action) {
				case "status": return accountStatus(ctx, exec.agent);
				case "test": return accountTest(ctx);
				case "login": return accountLogin(ctx);
				case "finish": return accountFinish(ctx, args);
				case "clear": return accountClear(ctx);
				default: return {
					ok: false,
					message: "未知 action。"
				};
			}
		}
	});
}
const MAX_SKILL_LIST_DESCRIPTION = 160;
/** One declaration for both listing and reading bundled skills. */
function vercelSkillTool() {
	return defineTool({
		name: "adenxie_vercel_skill",
		description: "随包的34个官方 Vercel 技能。省略 path 列出技能（可用 query 筛选）；提供 path 读取技能或其引用文件。内容是指导，不会自动执行。",
		parameters: {
			path: {
				type: "string",
				description: "相对技能根目录，如 vercel-cli/SKILL.md"
			},
			query: {
				type: "string",
				description: "列出时的筛选词"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: true
			},
			render: (_a, value) => {
				if (typeof value.content === "string") return text(value.content);
				return text((Array.isArray(value.skills) ? value.skills : []).map((skill) => `- ${skill.path}: ${skill.description.replace(/\s+/g, " ").slice(0, MAX_SKILL_LIST_DESCRIPTION)}`).join("\n") || "没有匹配的技能。");
			}
		},
		async execute(args) {
			if (typeof args.path === "string" && args.path.trim() !== "") return { content: await readVercelSkill(args.path) };
			return { skills: (await listVercelSkills(args.query)).map(({ name, description, path }) => ({
				name,
				description,
				path
			})) };
		}
	});
}
//#endregion
export { MCP_URL, OAuthFlow, VERCEL_MCP_API, VERCEL_MCP_GUIDANCE, VERCEL_OAUTH_SCOPE, VercelMcpStore, VercelOAuthProvider, apply, configPath, createOnDemandTools, createSupervisor, defineTool, inject, listVercelSkills, makeRoutes, mapPublicToolName, mask, modelParameters, modelSchemaCharacters, name, parseManualCallback, readVercelSkill, registerMcpResultSemantics, slimSchema };
