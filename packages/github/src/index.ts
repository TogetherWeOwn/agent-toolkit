// RS256 JWT construction and fixed-origin REST mechanics extracted from the
// existing GitHub App watcher; deliberately no unscoped mint or token cache.
import { createPrivateKey, createSign } from "node:crypto";
import { closed, integer, oneOf } from "../../core/src/index.js";

export const API_ORIGIN = "https://api.github.com";
export const API_VERSION = "2022-11-28";
export type Permissions = Partial<Record<"contents" | "pull_requests" | "checks" | "statuses" | "actions" | "administration" | "issues", "read">>;
export interface Request { url: string; method: "GET" | "POST" | "DELETE"; headers: Record<string, string>; body?: string }
export interface Response { status: number; headers: Record<string, string>; body: string }
export type Transport = (request: Request) => Promise<Response>;
export class GitHubFailure extends Error {
  constructor(readonly rule: string, readonly retryAfterSeconds?: number) { super(rule); }
}
function check(value: unknown, rule: string): asserts value { if (!value) throw new GitHubFailure(rule); }
const id = integer(1, Number.MAX_SAFE_INTEGER);
const permissionNames = ["contents", "pull_requests", "checks", "statuses", "actions", "administration", "issues"] as const;
export function mintScope(value: unknown): { repository_ids: number[]; permissions: Permissions } {
  check(value && typeof value === "object" && !Array.isArray(value), "mint.scope_required");
  const v = value as Record<string, unknown>;
  check(Object.keys(v).length === 2 && Object.hasOwn(v, "repository_ids") && Object.hasOwn(v, "permissions"), "mint.scope_required");
  check(Array.isArray(v.repository_ids) && v.repository_ids.length === 1, "mint.repository_scope");
  const repository_ids = v.repository_ids.map(x => id.parse(x));
  check(v.permissions && typeof v.permissions === "object" && !Array.isArray(v.permissions), "mint.permissions_required");
  const keys = Object.keys(v.permissions);
  check(keys.length > 0 && keys.every(k => permissionNames.includes(k as typeof permissionNames[number])), "mint.permissions_required");
  const shape = Object.fromEntries(keys.map(k => [k, oneOf(["read"])]));
  const permissions = closed(shape).parse(v.permissions) as Permissions;
  return { repository_ids, permissions };
}
export function buildAppJwt(appId: number, privateKeyPem: string, nowMs: number): string {
  id.parse(appId); integer(0, Number.MAX_SAFE_INTEGER).parse(nowMs);
  check(typeof privateKeyPem === "string" && privateKeyPem.length <= 16384, "secret.invalid");
  try {
    const key = createPrivateKey(privateKeyPem);
    check(key.asymmetricKeyType === "rsa" && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048, "secret.key_type");
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const iat = Math.floor(nowMs / 1000) - 60;
    const payload = Buffer.from(JSON.stringify({ iat, exp: iat + 600, iss: String(appId) })).toString("base64url");
    const input = `${header}.${payload}`;
    return `${input}.${createSign("RSA-SHA256").update(input).end().sign(key).toString("base64url")}`;
  } catch { throw new GitHubFailure("secret.invalid_key"); }
}
export function header(response: Response, name: string): string | undefined {
  return Object.entries(response.headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
}
export function retryAfter(response: Response, now: number): number {
  const raw = header(response, "retry-after");
  const reset = header(response, "x-ratelimit-reset");
  if (raw && /^\d{1,8}$/.test(raw)) return Math.min(86400, Math.max(1, Number(raw)));
  if (raw && Number.isFinite(Date.parse(raw))) return Math.min(86400, Math.max(1, Math.ceil((Date.parse(raw) - now) / 1000)));
  if (reset && /^\d{1,12}$/.test(reset)) return Math.min(86400, Math.max(1, Math.ceil((Number(reset) * 1000 - now) / 1000)));
  return 60;
}
export async function request(transport: Transport, method: Request["method"], path: string, credential: string, options: { body?: string; etag?: string } = {}): Promise<Response> {
  check(path.startsWith("/") && !path.startsWith("//") && !/[\r\n\\#]/.test(path), "http.path");
  const url = new URL(path, API_ORIGIN);
  check(url.origin === API_ORIGIN && !url.username && !url.password, "http.origin");
  check(credential.length > 0 && !/[\r\n]/.test(credential), "secret.invalid");
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "agent-toolkit-github-broker/0.1.0", "X-GitHub-Api-Version": API_VERSION, Authorization: `Bearer ${credential}` };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.etag !== undefined) {
    check(options.etag.length <= 200 && /^[\x20-\x7e]+$/.test(options.etag), "http.etag");
    headers["If-None-Match"] = options.etag;
  }
  let response: Response;
  try { response = await transport({ method, url: url.href, headers, ...(options.body === undefined ? {} : { body: options.body }) }); }
  catch { throw new GitHubFailure("http.unavailable"); }
  check(response && typeof response.body === "string" && Buffer.byteLength(response.body) <= 1048576, "http.response_limit");
  check(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599, "http.status");
  check(response.status < 300 || response.status >= 400 || response.status === 304, "http.redirect");
  return response;
}
export function parse(response: Response): unknown {
  try { return JSON.parse(response.body); } catch { throw new GitHubFailure("http.invalid_json"); }
}

/** One token per call, no credential cache. The callback must project/scrub its
 * result before returning. Revocation is always attempted; failure is not success.
 * A crash can leave a token until GitHub's fixed one-hour expiry, never on disk.
 */
export async function withInstallationToken<T>(options: {
  transport: Transport; appId: number; installationId: number; privateKey: string; scope: unknown; now: number;
  observe(response: Response, sensitive: readonly string[]): void;
}, use: (token: string, sensitive: readonly string[]) => Promise<T>): Promise<T> {
  const scope = mintScope(options.scope); // Hard guard BEFORE signing or HTTP.
  id.parse(options.installationId);
  const jwt = buildAppJwt(options.appId, options.privateKey, options.now);
  const minted = await request(options.transport, "POST", `/app/installations/${options.installationId}/access_tokens`, jwt, { body: JSON.stringify(scope) });
  if (minted.status !== 201) {
    options.observe(minted, [options.privateKey, jwt]);
    throw new GitHubFailure("mint.failed");
  }
  const body = parse(minted) as Record<string, unknown>;
  check(body && typeof body === "object" && typeof body.token === "string" && body.token.length > 0 && body.token.length <= 1024 && /^[\x21-\x7e]+$/.test(body.token), "mint.response");
  const token = body.token;
  try {
    options.observe(minted, [options.privateKey, jwt, token]);
    const expires = typeof body.expires_at === "string" ? Date.parse(body.expires_at) : NaN;
    check(Number.isFinite(expires) && expires > options.now + 30000 && expires <= options.now + 3660000, "mint.expiry");
    check(Array.isArray(body.repositories) && body.repositories.length === 1 && body.repositories[0]?.id === scope.repository_ids[0], "mint.returned_repositories");
    check(body.permissions && typeof body.permissions === "object" && !Array.isArray(body.permissions), "mint.returned_permissions");
    const permissions = body.permissions as Record<string, unknown>;
    check(Object.entries(permissions).every(([k, v]) => v === "read" && (k === "metadata" || Object.hasOwn(scope.permissions, k))) && Object.keys(scope.permissions).every(k => permissions[k] === "read"), "mint.returned_permissions");
    return await use(token, [options.privateKey, jwt, token]);
  } finally {
    try {
      const revoked = await request(options.transport, "DELETE", "/installation/token", token);
      options.observe(revoked, [options.privateKey, jwt, token]);
      check(revoked.status === 204, "mint.revoke_failed");
    } catch { throw new GitHubFailure("mint.revoke_failed"); }
  }
}
