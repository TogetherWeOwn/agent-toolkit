// Secret-free Discord REST protocol helpers. No token storage, no env access,
// no logging. Callers supply a trusted transport and a call-time token.
import { Refusal, integer, requireThat, text, type Schema } from "../../core/src/index.js";

export const API_ORIGIN = "https://discord.com";
export const API_PREFIX = "/api/v10";
export const MAX_RESPONSE_BYTES = 1048576;
export const USER_AGENT = "agent-toolkit-discord-broker/0.1.0";

export interface Request { url: string; method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; headers: Record<string, string>; body?: string }
export interface Response { status: number; headers: Record<string, string>; body: string; receivedAt?: number }
export type Transport = (request: Request, deadline?: number, onDispatch?: () => void) => Promise<Response>;

export class DiscordFailure extends Error {
  constructor(readonly rule: string, readonly retryAfterSeconds?: number) { super(rule); }
}
function check(v: unknown, rule: string): asserts v { if (!(v as boolean)) throw new DiscordFailure(rule); }

export function header(response: Response, name: string): string | undefined {
  return Object.entries(response.headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
}
export function retryAfter(response: Response, now: number): number {
  const raw = header(response, "retry-after");
  if (raw && /^\d{1,8}$/.test(raw)) return Math.min(86400, Math.max(1, Number(raw)));
  if (raw && Number.isFinite(Date.parse(raw))) return Math.min(86400, Math.max(1, Math.ceil((Date.parse(raw) - now) / 1000)));
  const reset = header(response, "x-ratelimit-reset-after");
  if (reset && /^\d+(?:\.\d+)?$/.test(reset)) return Math.min(86400, Math.max(1, Math.ceil(Number(reset))));
  return 60;
}

export async function request(transport: Transport, method: Request["method"], path: string, token: string, options: { body?: string; deadline?: number; onDispatch?: () => void; onResponse?: (receivedAt: number) => void } = {}): Promise<Response> {
  check(typeof path === "string" && path.startsWith(API_PREFIX + "/") && !path.startsWith("//") && !/[\r\n\\#]/.test(path), "http.path");
  const url = new URL(path, API_ORIGIN);
  check(url.origin === API_ORIGIN && !url.username && !url.password, "http.origin");
  check(typeof token === "string" && token.length > 0 && token.length <= 4096 && !/[\r\n]/.test(token), "secret.invalid");
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT, Authorization: `Bot ${token}` };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  check(options.deadline === undefined || performance.now() < options.deadline, "http.deadline");
  let response: Response;
  try {
    response = await transport({ method, url: url.href, headers, ...(options.body === undefined ? {} : { body: options.body }) }, options.deadline, options.onDispatch);
  } catch (error) {
    const rule = error && typeof error === "object" && "rule" in error ? (error as { rule: string }).rule : null;
    throw new DiscordFailure(rule === "host.capacity" ? "http.capacity" : rule === "host.timeout" || rule === "http.deadline" ? "http.deadline" : "http.unavailable");
  }
  options.onResponse?.(typeof response?.receivedAt === "number" && Number.isFinite(response.receivedAt) ? response.receivedAt : performance.now());
  check(options.deadline === undefined || performance.now() < options.deadline, "http.deadline");
  check(response && typeof response.body === "string" && Buffer.byteLength(response.body) <= MAX_RESPONSE_BYTES, "http.response_limit");
  check(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599, "http.status");
  check(response.status < 300 || response.status >= 400 || response.status === 304, "http.redirect");
  return response;
}
export function parse(response: Response): unknown {
  if (response.status === 204 || response.status === 304 || response.body === "") {
    if (response.status === 204) return null;
    throw new DiscordFailure("http.invalid_json");
  }
  try { return JSON.parse(response.body); } catch { throw new DiscordFailure("http.invalid_json"); }
}

// --- schemas ---

export const snowflake = text(20, /^[0-9]{17,20}$/);
export const snowflakeJson = { type: "string", pattern: "^[0-9]{17,20}$", maxLength: 20 };
export const identifier = ((): Schema<string> => text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/))();
export const limit = integer(1, 100);
export const limitJson = { type: "integer", minimum: 1, maximum: 100 };
// Member search projection is capped at 10 results; the accepted input limit
// must not exceed it, or valid requests would fail projection.
export const limit10 = integer(1, 10);
export const limit10Json = { type: "integer", minimum: 1, maximum: 10 };
// Discord GET /guilds/{id}/messages/search documents limit 1-25 (default 25).
export const searchLimit = integer(1, 25);
export const searchLimitJson = { type: "integer", minimum: 1, maximum: 25 };

export function messageContent(max = 2000): Schema<string> {
  return { parse(v) {
    requireThat(typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v), "schema");
    return v;
  } };
}
export function searchQuery(max = 512): Schema<string> {
  return { parse(v) {
    requireThat(typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v), "schema");
    return v;
  } };
}
export function emojiToken(max = 64): Schema<string> {
  return { parse(v) {
    requireThat(typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v) && !v.includes("/") && !v.includes("%"), "schema");
    return v;
  } };
}
export function snowflakeValue(v: unknown): string { return snowflake.parse(v); }

// --- output projection & redaction ---

export function object(value: unknown): Record<string, unknown> {
  if (!(value !== null && typeof value === "object" && !Array.isArray(value))) throw new DiscordFailure("upstream.shape");
  return value as Record<string, unknown>;
}
export function list(value: unknown, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new DiscordFailure("upstream.list");
  return value;
}
export function pick(value: unknown, fields: string[]): Record<string, string | number | boolean | null> {
  const input = object(value);
  const out: Record<string, string | number | boolean | null> = {};
  for (const field of fields) {
    const v = input[field];
    if (v === undefined) continue;
    if (!(v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 131072))) throw new DiscordFailure("upstream.field");
    out[field] = v as string | number | boolean | null;
  }
  if (Object.keys(out).length === 0) throw new DiscordFailure("upstream.empty");
  return out;
}
export function projectGuild(value: unknown): unknown {
  const g = object(value);
  // Identifiers and counts only; arbitrary descriptive metadata (name,
  // description) and sensitive values are excluded from retained output.
  // `features` is an array; pick() accepts scalars only, so it is omitted
  // (fail-closed) rather than failing every guild response.
  const base = pick(g, ["id", "member_count"]) as Record<string, unknown>;
  if (base.member_count === undefined && typeof g.approximate_member_count === "number") base.member_count = g.approximate_member_count;
  return base;
}
export function projectChannel(value: unknown): unknown {
  const c = object(value);
  // Identifiers only: name/topic/position/limits are arbitrary descriptive
  // metadata and are excluded from retained output.
  const base = pick(c, ["id", "type", "guild_id"]) as Record<string, unknown>;
  if (typeof c.parent_id === "string") base.parent_id = c.parent_id;
  if (typeof c.last_message_id === "string") base.last_message_id = c.last_message_id;
  return base;
}
export function projectMessage(value: unknown): unknown {
  const m = object(value);
  const author = m.author && typeof m.author === "object" && !Array.isArray(m.author) ? pick(m.author, ["id", "bot"]) : undefined;
  const out: Record<string, unknown> = { ...pick(m, ["id", "channel_id", "guild_id", "content", "timestamp", "pinned", "type", "mention_everyone", "tts"]) };
  if (author) out.author_id = author.id;
  if (author?.bot !== undefined) out.author_bot = author.bot;
  if (typeof m.message_reference === "object" && m.message_reference !== null) out.message_reference = pick(m.message_reference, ["message_id", "channel_id", "guild_id", "type"]);
  return out;
}

// Metadata-only projection for the retained read surface: identifiers,
// counts, links and timestamps leave the broker; raw member message bodies
// and arbitrary descriptive/personal metadata do not. Username/discriminator
// are excluded in favor of the author identifier.
export function projectMessageMeta(value: unknown): unknown {
  const m = object(value);
  const author = m.author && typeof m.author === "object" && !Array.isArray(m.author) ? pick(m.author, ["id", "bot"]) : undefined;
  const out: Record<string, unknown> = { ...pick(m, ["id", "channel_id", "guild_id", "timestamp", "pinned", "type"]) };
  if (author) out.author_id = author.id;
  if (author?.bot !== undefined) out.author_bot = author.bot;
  // Canonical link constructed from identifiers only (never upstream text).
  if (typeof m.guild_id === "string" && typeof m.channel_id === "string" && typeof m.id === "string") {
    out.url = `https://discord.com/channels/${m.guild_id}/${m.channel_id}/${m.id}`;
  }
  if (typeof m.message_reference === "object" && m.message_reference !== null) out.message_reference = pick(m.message_reference, ["message_id", "channel_id", "guild_id", "type"]);
  return out;
}
export function projectSearchMeta(value: unknown): unknown {
  const v = object(value);
  const total = typeof v.total_results === "number" && Number.isFinite(v.total_results) ? v.total_results : 0;
  const raw = Array.isArray(v.messages) ? v.messages : [];
  const messages = list(raw, 100).map(m => {
    const first = Array.isArray(m) ? m[0] : m;
    return first ? projectMessageMeta(first) : null;
  }).filter((m): m is Record<string, unknown> => m !== null);
  return { total_results: total, messages };
}
export function projectMember(value: unknown): unknown {
  const v = object(value);
  // Identifiers only (unregistered surface; retained code hardened anyway).
  const out: Record<string, unknown> = { ...pick(v, ["id", "joined_at"]) };
  if (v.user && typeof v.user === "object" && !Array.isArray(v.user)) out.user_id = pick(v.user, ["id"]).id;
  return out;
}
export function projectRole(value: unknown): unknown {
  return pick(value, ["id", "position"]);
}
export function projectEvent(value: unknown): unknown {
  return pick(value, ["id", "scheduled_start_time", "scheduled_end_time", "status", "channel_id", "guild_id"]);
}

const BOT_TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}(?![A-Za-z0-9_-])/gi;
const WEBHOOK = /discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi;
// Invite URLs only: require /invite/ on discord.com so ordinary paths such as
// message links (discord.com/channels/<guild>/<channel>/<message>) survive.
const INVITE = /\b(?:https?:\/\/)?(?:discord(?:app)?\.com\/invite|discord\.gg(?:\/invite)?)\/[A-Za-z0-9_-]{2,}/gi;

export function scrub(value: unknown, secrets: string[]): unknown {
  const needles = [...new Set(secrets.flatMap(s => [s, ...s.split(/\r?\n/).filter((line: string) => line.length >= 16)]).filter(Boolean))].sort((a, b) => b.length - a.length);
  function visit(v: unknown): unknown {
    if (typeof v === "string") {
      let out = v;
      for (const s of needles) out = out.split(s).join("[REDACTED]");
      out = out.replace(BOT_TOKEN, "[REDACTED]").replace(WEBHOOK, "[REDACTED]").replace(INVITE, "discord.gg/[REDACTED]");
      // Strip any echoed Bot/Authorization headers
      out = out.replace(/Bot\s+[A-Za-z0-9_\-.]+/gi, "Bot [REDACTED]");
      return out;
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, visit(x)]));
    return v;
  }
  return visit(value);
}

export function validateAllowedMentions(value: unknown): void {
  // No user/role mentions allowed in this tier; broker always sends parse:[].
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (typeof v.parse === "string" && v.parse !== "") throw new DiscordFailure("policy.mentions");
  }
}

// Hard-deny sentinels that must never be constructed as tools.
export const HARD_DENIED = [
  "token disclosure", "app/intent/permission changes", "@everyone/@here escalation",
  "mass DM", "bulk ban/prune", "guild leave/delete",
] as const;

export { Refusal };
