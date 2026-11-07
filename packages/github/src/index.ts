// RS256 JWT construction and fixed-origin REST mechanics extracted from the
// existing GitHub App watcher; deliberately no unscoped mint or token cache.
import { createPrivateKey, createSign } from "node:crypto";
import { closed, integer, oneOf } from "../../core/src/index.js";

export const API_ORIGIN = "https://api.github.com";
export const API_VERSION = "2022-11-28";
export type Permissions = Partial<Record<"contents" | "pull_requests" | "checks" | "statuses" | "actions" | "metadata" | "issues", "read">>;
export interface Request { url: string; method: "GET" | "POST" | "DELETE"; headers: Record<string, string>; body?: string }
export interface Response { status: number; headers: Record<string, string>; body: string }
// Deadline and dispatch marker are worker-local, never serialized to the SDK.
export type Transport = (request: Request, deadline?: number, onDispatch?: () => void) => Promise<Response>;
export class GitHubFailure extends Error {
  constructor(readonly rule: string, readonly retryAfterSeconds?: number) { super(rule); }
}
// Temporary SDK boundary signal, not a Response or proof of revocation.
// Retire after compatible adoption of a published fix for paperclipai/paperclip
// #13084/#17282, verified in the resolved worker with status/header regressions.
export class SdkNullBodyRevokeFailure extends Error {
  constructor() { super("http.sdk_null_body_revoke"); }
}
export type ProbeResult = "unavailable" | "unexpected_status" | "invalid_json" | "unexpected_body" | "bad_credentials";
export interface ProbeAttempt { readonly attempt: 1 | 2; readonly status: number | null; readonly requestId: string | null; readonly result: ProbeResult }
export interface RevocationEvidence {
  outcome: "revoked" | "revoked_verified_by_probe" | "unverified";
  deleteRequestId: string | null;
  probeRequestId?: string | null;
  probeStatus?: number | null;
  probeResult?: ProbeResult;
  unavailableReason?: "sdk_null_body";
  probes?: readonly ProbeAttempt[];
  secondDispatched?: boolean;
  terminalReason?: "verified" | "ineligible" | "deadline" | "capacity" | "transport" | "observer" | "evidence";
}
function check(value: unknown, rule: string): asserts value { if (!value) throw new GitHubFailure(rule); }
const id = integer(1, Number.MAX_SAFE_INTEGER);
const permissionNames = ["contents", "pull_requests", "checks", "statuses", "actions", "metadata", "issues"] as const;
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
export async function request(transport: Transport, method: Request["method"], path: string, credential: string, options: { body?: string; deadline?: number; onDispatch?: () => void; onResponse?: () => void } = {}): Promise<Response> {
  check(path.startsWith("/") && !path.startsWith("//") && !/[\r\n\\#]/.test(path), "http.path");
  const url = new URL(path, API_ORIGIN);
  check(url.origin === API_ORIGIN && !url.username && !url.password, "http.origin");
  check(credential.length > 0 && !/[\r\n]/.test(credential), "secret.invalid");
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "agent-toolkit-github-broker/0.1.0", "X-GitHub-Api-Version": API_VERSION, Authorization: `Bearer ${credential}` };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  check(options.deadline === undefined || performance.now() < options.deadline, "http.deadline");
  try { response = await transport({ method, url: url.href, headers, ...(options.body === undefined ? {} : { body: options.body }) }, options.deadline, options.onDispatch); }
  catch (error) {
    if (error instanceof SdkNullBodyRevokeFailure && method === "DELETE" && url.href === `${API_ORIGIN}/installation/token`) throw error;
    const rule = error && typeof error === "object" && "rule" in error ? error.rule : null;
    throw new GitHubFailure(rule === "host.capacity" ? "http.capacity" : rule === "host.timeout" || (error instanceof GitHubFailure && rule === "http.deadline") ? "http.deadline" : "http.unavailable");
  }
  options.onResponse?.();
  check(options.deadline === undefined || performance.now() < options.deadline, "http.deadline");
  check(response && typeof response.body === "string" && Buffer.byteLength(response.body) <= 1048576, "http.response_limit");
  check(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599, "http.status");
  check(response.status < 300 || response.status >= 400 || response.status === 304, "http.redirect");
  return response;
}
export function parse(response: Response): unknown {
  try { return JSON.parse(response.body); } catch { throw new GitHubFailure("http.invalid_json"); }
}

// A 200 is contradictory-time evidence, never proof of a failed DELETE or lag.
// Retire both probes with verified compatible SDK adoption, not upstream merge.
async function verifyRejection(transport: Transport, token: string, sensitive: readonly string[], observe: (response: Response, sensitive: readonly string[]) => string | undefined, report?: (evidence: RevocationEvidence) => void): Promise<void> {
  const probes: ProbeAttempt[] = [];
  let terminal = false, secondDispatched = false, deadline: number | undefined;
  let reason: RevocationEvidence["terminalReason"] = "transport";
  const snapshot = (outcome: RevocationEvidence["outcome"] = "unverified", terminalReason?: RevocationEvidence["terminalReason"]) => {
    const last = probes.at(-1);
    report?.(Object.freeze({ outcome, deleteRequestId: null, unavailableReason: "sdk_null_body",
      probeRequestId: last?.requestId ?? null, probeStatus: last?.status ?? null, probeResult: last?.result ?? "unavailable",
      probes: Object.freeze(probes.map(p => Object.freeze({ ...p }))), secondDispatched, ...(terminalReason ? { terminalReason } : {}) }));
  };
  const withinWindow = () => check(deadline === undefined || performance.now() < deadline, "http.deadline");
  const classify = (res: Response): ProbeResult => {
    if (res.status !== 401) return "unexpected_status";
    try {
      const body = parse(res);
      return body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).message === "Bad credentials" ? "bad_credentials" : "unexpected_body";
    } catch { return "invalid_json"; }
  };
  const examine = (res: Response, attempt: 1 | 2) => {
    withinWindow();
    const result = classify(res);
    withinWindow();
    probes[attempt - 1] = { attempt, status: res.status, requestId: null, result };
    snapshot(); // Bounded status/classification survive a throwing observer.
    reason = "observer";
    const requestId = observe(res, sensitive) ?? null;
    withinWindow();
    probes[attempt - 1] = { attempt, status: res.status, requestId, result };
    snapshot();
    reason = "evidence";
    return res.status === 401 && requestId !== null && result === "bad_credentials";
  };
  const finish = () => {
    withinWindow();
    terminal = true;
    snapshot("revoked_verified_by_probe", "verified");
  };
  try {
    snapshot();
    probes.push({ attempt: 1, status: null, requestId: null, result: "unavailable" });
    let t0 = 0;
    const first = await request(transport, "GET", "/installation/repositories?per_page=1", token, { onResponse: () => { t0 = performance.now(); } });
    // Capture before ID validation, classification or observer work; never renew.
    if (first.status === 200) deadline = t0 + 2000;
    if (examine(first, 1)) { finish(); return; }
    reason = "ineligible";
    check(first.status === 200 && probes[0]!.requestId !== null, "mint.revoke_failed");
    withinWindow();
    reason = "deadline";
    const delayUntil = t0 + 250;
    if (performance.now() < delayUntil) await new Promise<void>(resolve => setTimeout(resolve, Math.ceil(delayUntil - performance.now())));
    withinWindow();
    check(performance.now() >= delayUntil, "http.deadline");
    probes.push({ attempt: 2, status: null, requestId: null, result: "unavailable" });
    snapshot();
    reason = "transport";
    const second = await request(transport, "GET", "/installation/repositories?per_page=1", token, { deadline, onDispatch: () => {
      withinWindow();
      if (!terminal) secondDispatched = true;
    } });
    if (examine(second, 2)) { finish(); return; }
    throw new GitHubFailure("mint.revoke_failed");
  } catch (error) {
    if (error instanceof GitHubFailure) {
      if (error.rule === "http.deadline") reason = "deadline";
      if (error.rule === "http.capacity") reason = "capacity";
    }
    if (!terminal) { terminal = true; snapshot("unverified", reason); }
    throw new GitHubFailure("mint.revoke_failed");
  }
}

/** One token per call, no credential cache. The callback must project/scrub its
 * result before returning. Revocation is always attempted; failure is not success.
 * A crash can leave a token until GitHub's fixed one-hour expiry, never on disk.
 */
export async function withInstallationToken<T>(options: {
  transport: Transport; appId: number; installationId: number; privateKey: string; scope: unknown; now: number;
  observe(response: Response, sensitive: readonly string[]): string | undefined;
  onRevocation?(evidence: RevocationEvidence): void;
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
  check(body && typeof body === "object" && typeof body.token === "string" && body.token.length > 0, "mint.response");
  const token = body.token;
  try {
    check(token.length <= 1024 && /^[\x21-\x7e]+$/.test(token), "mint.response");
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
      const sensitive = [options.privateKey, jwt, token];
      let revoked: Response | undefined;
      try { revoked = await request(options.transport, "DELETE", "/installation/token", token); }
      catch (error) {
        if (!(error instanceof SdkNullBodyRevokeFailure)) throw error;
        await verifyRejection(options.transport, token, sensitive, options.observe, options.onRevocation);
      }
      if (revoked) {
        const deleteRequestId = options.observe(revoked, sensitive) ?? null;
        check(revoked.status === 204, "mint.revoke_failed");
        options.onRevocation?.({ outcome: "revoked", deleteRequestId });
      }
    } catch { throw new GitHubFailure("mint.revoke_failed"); }
  }
}
