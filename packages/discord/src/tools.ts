// Shared broker core for dev/prod Discord plugins. Each plugin instance binds
// its own GuildConfig; tool registration and authorize() enforce that binding.
import { closed, hash, integer, text, type Schema } from "../../core/src/index.js";
import {
  DiscordFailure, header, parse, request, retryAfter, scrub, snowflake, snowflakeJson, snowflakeValue,
  projectGuild, projectChannel, projectMessage, projectMessageMeta, projectSearchMeta, projectMember, projectRole, projectEvent,
  messageContent, searchQuery, emojiToken, limit, limitJson, limit10, limit10Json, searchLimit, searchLimitJson, object, list,
  type Transport, type Response,
} from "./index.js";

export type EnvKind = "dev" | "prod";
export type Tier = "read" | "write" | "reserved";
export type Profile = "builder" | "lead" | "researcher-read" | "reviewer-read" | "none";

export interface Tool {
  name: string;
  tier: Tier;
  description: string;
  inputSchema: Record<string, unknown>;
  schema: Schema<Record<string, unknown>>;
  requests(args: Record<string, unknown>, guildId: string): { method: string; path: string };
  project(body: unknown, args: Record<string, unknown>): unknown;
  requiresChannel?: "read" | "write" | undefined;
  // Guild-wide list tools with no channel arg: their projected array is
  // filtered by Policy.readChannelIds in Broker.execute ("channel" filters
  // items by id, "thread" by parent_id, "event" by channel_id). authorize()
  // cannot see them since they carry no channelId.
  listScope?: "channel" | "thread" | "event" | undefined;
}

export class Denied extends Error {
  constructor(readonly rule: string, readonly retryAfterSeconds?: number) { super(rule); }
}
export function guard(v: unknown, rule: string): asserts v { if (!(v as boolean)) throw new Denied(rule); }

export interface Caller { agentId: string; runId: string; companyId: string; projectId: string | null; issueId?: string; workspaceId?: string }
export interface AgentGrant { agentId: string; profile: Profile; allowProjectless?: boolean }
export interface Policy {
  version: 1; companyId: string; revision: number;
  agents: AgentGrant[];
  readChannelIds: string[]; writeChannelIds: string[];
}
export interface Config { environment: EnvKind; guildId: string; botUserId: string; botTokenSecretRef: { type: "secret_ref"; secretId: string }; policy: Policy }
export interface Host {
  config(): Promise<unknown>;
  issue(id: string): Promise<{ companyId: string; projectId: string | null; assigneeAgentId: string | null; projectWorkspaceId: string | null; checkoutRunId: string | null; executionRunId: string | null; status: string } | null>;
  workspace(projectId: string, workspaceId: string): Promise<{ repoUrl: string | null } | null>;
  secret(ref: { type: "secret_ref"; secretId: string }, companyId: string): Promise<string>;
  http: Transport;
  kvGet(key: string): Promise<unknown>;
  kvSet(key: string, value: unknown): Promise<void>;
  kvDel(key: string): Promise<void>;
  audit(record: Record<string, unknown>): Promise<void>;
  clock(): number;
}
export type Result = { content: { type: "text"; text: string }[]; isError: boolean };
interface Audit { event: string; time: number; agentId: string | null; runId: string | null; companyId: string | null; policyHash: string; policyRevision: number | null; operation: string; phase: "intent" | "outcome" | "refused"; decision: "allow" | "deny"; rule: string; requestIds: string[]; outcome: "pending" | "success" | "error" }

const snow = snowflake;
const enc = (s: string) => encodeURIComponent(s);

function define(name: string, tier: Tier, description: string, shape: Record<string, Schema<unknown>>, properties: Record<string, unknown>, requests: Tool["requests"], project: Tool["project"], requiresChannel?: Tool["requiresChannel"], listScope?: Tool["listScope"]): Tool {
  return { name, tier, description, inputSchema: { type: "object", additionalProperties: false, properties: { issueId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 }, workspaceId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 }, ...properties }, required: ["issueId", "workspaceId", ...Object.keys(properties)] }, schema: closed({ issueId: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/), workspaceId: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/), ...shape }) as unknown as Schema<Record<string, unknown>>, requests, project, requiresChannel, listScope };
}

const listShape = { limit };
const listJson = { limit: limitJson };

export const readTools: Tool[] = [
  define("discord.guild_get", "read", "Read guild metadata for the bound guild.", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}` }), b => projectGuild(b)),
  define("discord.channels_list", "read", "List channels in the bound guild (counts/metadata only when paginated).", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/channels` }), b => list(b, 500).map(projectChannel), undefined, "channel"),
  define("discord.channel_get", "read", "Read one channel by ID.", { channelId: snow }, { channelId: snowflakeJson }, (a, g) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}` }), b => projectChannel(b), "read"),
  define("discord.messages_list", "read", "List recent messages in an allowlisted channel.", { channelId: snow, limit }, { channelId: snowflakeJson, ...listJson }, (a) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}/messages?limit=${a.limit}` }), b => list(b, 100).map(projectMessage), "read"),
  define("discord.message_get", "read", "Read one message in an allowlisted channel.", { channelId: snow, messageId: snow }, { channelId: snowflakeJson, messageId: snowflakeJson }, (a) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}` }), b => projectMessage(b), "read"),
  define("discord.messages_search", "read", "Search messages in an allowlisted guild channel. Bounded query, no raw member corpus retention.", { query: searchQuery(512), channelId: snow, limit: searchLimit }, { query: { type: "string", maxLength: 512 }, channelId: snowflakeJson, limit: searchLimitJson }, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/messages/search?content=${enc(a.query as string)}&channel_id=${enc(a.channelId as string)}&limit=${a.limit}` }), b => { const v = object(b); const msgs = v.total_results !== undefined && Array.isArray(v.messages) ? v.messages : v; return list(Array.isArray(msgs) ? msgs : [], 100).map(m => Array.isArray(m) ? (m[0] ? projectMessage(m[0]) : null) : projectMessage(m)); }, "read"),
  define("discord.pins_list", "read", "List pinned messages in an allowlisted channel.", { channelId: snow }, { channelId: snowflakeJson }, (a) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}/pins` }), b => list(b, 50).map(projectMessage), "read"),
  define("discord.reactions_list", "read", "List reactions on a message.", { channelId: snow, messageId: snow, emoji: emojiToken(64) }, { channelId: snowflakeJson, messageId: snowflakeJson, emoji: { type: "string", maxLength: 64 } }, (a) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}/reactions/${enc(a.emoji as string)}` }), b => list(b, 100).map(m => pick(m, ["id", "count", "me"])), "read"),
  define("discord.threads_active_list", "read", "List active threads in the bound guild.", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/threads/active` }), b => { const t = object(b).threads; return list(t, 500).map(projectChannel); }, undefined, "thread"),
  define("discord.events_list", "read", "List scheduled events in allowlisted channels of the bound guild.", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/scheduled-events` }), b => list(b, 100).map(projectEvent), undefined, "event"),
  define("discord.event_get", "read", "Read one scheduled event.", { eventId: snow }, { eventId: snowflakeJson }, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/scheduled-events/${enc(a.eventId as string)}` }), b => projectEvent(b)),
  define("discord.roles_list", "read", "List roles in the bound guild.", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/roles` }), b => list(b, 250).map(projectRole)),
  define("discord.member_get", "read", "Read one guild member.", { userId: snow }, { userId: snowflakeJson }, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/members/${enc(a.userId as string)}` }), b => projectMember(b)),
  define("discord.members_search", "read", "Search members by query (bounded, for research aggregates only).", { query: searchQuery(256), limit: limit10 }, { query: { type: "string", maxLength: 256 }, limit: limit10Json }, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/members/search?query=${enc(a.query as string)}&limit=${a.limit}` }), b => list(b, 10).map(projectMember)),
];

// Prod research surface (Security A2): metadata-only, so only bounded counts,
// links and author metadata leave the broker. No raw member message bodies.
export const readToolsMeta: Tool[] = [
  define("discord.guild_get", "read", "Read guild metadata for the bound guild.", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}` }), b => projectGuild(b)),
  define("discord.channels_list", "read", "List channels in the bound guild (counts/metadata only when paginated).", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/channels` }), b => list(b, 500).map(projectChannel), undefined, "channel"),
  define("discord.channel_get", "read", "Read one channel by ID.", { channelId: snow }, { channelId: snowflakeJson }, (a, g) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}` }), b => projectChannel(b), "read"),
  define("discord.messages_list", "read", "List recent message metadata in an allowlisted channel. Bodies are not returned.", { channelId: snow, limit }, { channelId: snowflakeJson, ...listJson }, (a) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}/messages?limit=${a.limit}` }), b => list(b, 100).map(projectMessageMeta), "read"),
  define("discord.message_get", "read", "Read one message's metadata in an allowlisted channel. Body is not returned.", { channelId: snow, messageId: snow }, { channelId: snowflakeJson, messageId: snowflakeJson }, (a) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}` }), b => projectMessageMeta(b), "read"),
  define("discord.messages_search", "read", "Search messages in an allowlisted guild channel. Returns total_results plus message metadata links only; no message bodies.", { query: searchQuery(512), channelId: snow, limit: searchLimit }, { query: { type: "string", maxLength: 512 }, channelId: snowflakeJson, limit: searchLimitJson }, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/messages/search?content=${enc(a.query as string)}&channel_id=${enc(a.channelId as string)}&limit=${a.limit}` }), b => projectSearchMeta(b), "read"),
  define("discord.pins_list", "read", "List pinned message metadata in an allowlisted channel. Bodies are not returned.", { channelId: snow }, { channelId: snowflakeJson }, (a) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}/pins` }), b => list(b, 50).map(projectMessageMeta), "read"),
  define("discord.reactions_list", "read", "List reactions on a message.", { channelId: snow, messageId: snow, emoji: emojiToken(64) }, { channelId: snowflakeJson, messageId: snowflakeJson, emoji: { type: "string", maxLength: 64 } }, (a) => ({ method: "GET", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}/reactions/${enc(a.emoji as string)}` }), b => list(b, 100).map(m => pick(m, ["id", "count", "me"])), "read"),
  define("discord.threads_active_list", "read", "List active threads in the bound guild.", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/threads/active` }), b => { const t = object(b).threads; return list(t, 500).map(projectChannel); }, undefined, "thread"),
  define("discord.events_list", "read", "List scheduled events in allowlisted channels of the bound guild.", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/scheduled-events` }), b => list(b, 100).map(projectEvent), undefined, "event"),
  define("discord.event_get", "read", "Read one scheduled event.", { eventId: snow }, { eventId: snowflakeJson }, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/scheduled-events/${enc(a.eventId as string)}` }), b => projectEvent(b)),
  define("discord.roles_list", "read", "List roles in the bound guild.", {}, {}, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/roles` }), b => list(b, 250).map(projectRole)),
  define("discord.member_get", "read", "Read one guild member.", { userId: snow }, { userId: snowflakeJson }, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/members/${enc(a.userId as string)}` }), b => projectMember(b)),
  define("discord.members_search", "read", "Search members by query (bounded, for research aggregates only).", { query: searchQuery(256), limit: limit10 }, { query: { type: "string", maxLength: 256 }, limit: limit10Json }, (a, g) => ({ method: "GET", path: `/api/v10/guilds/${g}/members/search?query=${enc(a.query as string)}&limit=${a.limit}` }), b => list(b, 10).map(projectMember)),
];

// Ledger-backed lifecycle (STANDARD §5, Security A1). Every dev creation
// writes a durable ledger entry before its side effect where possible and
// expires after an immutable server-derived deadline. The three delete-own
// tools are exact-owned only: ledger + agent binding + upstream verify.
// Broad moderation deletes never exist as tools.
export const DEV_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LIFE_INDEX_KEY = "life-index";
export const LIFE_INDEX_MAX = 512;
export const SWEEP_BATCH = 10;

export function lifeKey(kind: string, resourceId: string, channelId: string): string {
  return `life:${kind}:${channelId}:${resourceId}`;
}
export interface LifeEntry { kind: "message" | "thread" | "event"; channelId: string; resourceId: string; guildId: string; agentId: string; runId: string; authorId: string; createdAt: number; expiresAt: number; state: "pending" | "owned" | "failed"; intent?: string }

export const writeTools: Tool[] = [
  define("discord.message_post", "write", "Post a plain-text message to an allowlisted channel. Mentions suppressed.", { channelId: snow, content: messageContent(2000) }, { channelId: snowflakeJson, content: { type: "string", maxLength: 2000 } }, (a) => ({ method: "POST", path: `/api/v10/channels/${enc(a.channelId as string)}/messages` }), b => projectMessage(b), "write"),
  define("discord.message_reply", "write", "Reply to a message in an allowlisted channel.", { channelId: snow, messageId: snow, content: messageContent(2000) }, { channelId: snowflakeJson, messageId: snowflakeJson, content: { type: "string", maxLength: 2000 } }, (a) => ({ method: "POST", path: `/api/v10/channels/${enc(a.channelId as string)}/messages` }), b => projectMessage(b), "write"),
  define("discord.message_edit_own", "write", "Edit a broker-owned message.", { channelId: snow, messageId: snow, content: messageContent(2000) }, { channelId: snowflakeJson, messageId: snowflakeJson, content: { type: "string", maxLength: 2000 } }, (a) => ({ method: "PATCH", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}` }), b => projectMessage(b), "write"),
  define("discord.reaction_add_own", "write", "Add a reaction as the bot.", { channelId: snow, messageId: snow, emoji: emojiToken(64) }, { channelId: snowflakeJson, messageId: snowflakeJson, emoji: { type: "string", maxLength: 64 } }, (a) => ({ method: "PUT", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}/reactions/${enc(a.emoji as string)}/@me` }), b => null, "write"),
  define("discord.reaction_remove_own", "write", "Remove the bot's own reaction.", { channelId: snow, messageId: snow, emoji: emojiToken(64) }, { channelId: snowflakeJson, messageId: snowflakeJson, emoji: { type: "string", maxLength: 64 } }, (a) => ({ method: "DELETE", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}/reactions/${enc(a.emoji as string)}/@me` }), b => null, "write"),
  define("discord.thread_create", "write", "Create a thread from an allowlisted channel message.", { channelId: snow, messageId: snow, name: text(100, /^[A-Za-z0-9][A-Za-z0-9 _-]+$/) }, { channelId: snowflakeJson, messageId: snowflakeJson, name: { type: "string", maxLength: 100 } }, (a) => ({ method: "POST", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}/threads` }), b => projectChannel(b), "write"),
  define("discord.event_create", "write", "Create a scheduled event in the bound guild.", { name: text(100, /^[A-Za-z0-9][A-Za-z0-9 _-]+$/), scheduledStartTime: text(64, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/), channelId: snow }, { name: { type: "string", maxLength: 100 }, scheduledStartTime: { type: "string", maxLength: 64 }, channelId: snowflakeJson }, (a, g) => ({ method: "POST", path: `/api/v10/guilds/${g}/scheduled-events` }), b => projectEvent(b), "write"),
  define("discord.message_delete_own", "write", "Delete one broker-owned message. Exact-owned only.", { channelId: snow, messageId: snow }, { channelId: snowflakeJson, messageId: snowflakeJson }, (a) => ({ method: "DELETE", path: `/api/v10/channels/${enc(a.channelId as string)}/messages/${enc(a.messageId as string)}` }), b => null, "write"),
  define("discord.thread_delete_own", "write", "Delete one broker-owned thread. Exact-owned only.", { channelId: snow, threadId: snow }, { channelId: snowflakeJson, threadId: snowflakeJson }, (a) => ({ method: "DELETE", path: `/api/v10/channels/${enc(a.threadId as string)}` }), b => null, "write"),
  define("discord.event_delete_own", "write", "Delete one broker-owned scheduled event. Exact-owned only.", { eventId: snow }, { eventId: snowflakeJson }, (a, g) => ({ method: "DELETE", path: `/api/v10/guilds/${g}/scheduled-events/${enc(a.eventId as string)}` }), b => null),
];

function observeResponse(res: Response, out: string[]): void {
  const id = header(res, "x-request-id") ?? header(res, "x-discord-request-id");
  if (id && /^[A-Za-z0-9-]{6,64}$/.test(id)) out.push(id);
}
function pick(m: unknown, fields: string[]): Record<string, unknown> {
  const o = object(m) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields) if (o[f] !== undefined) out[f] = o[f];
  return out;
}

export function toolsFor(kind: EnvKind): Tool[] {
  // Scope reduction (prior): dev writes are unregistered. Security review of
  // the tier-1/2 envelope retained the lifecycle finding (no independent
  // scheduled teardown available on this host; sweep is opportunistic) and
  // invalidated the exact-ownership claim for the write path. Per the
  // review's direction, dev was registered read-only while prod was
  // metadata-only read. `writeTools` below is retained unregistered pending
  // an independent teardown scheduler and a favorable review.
  //
  // Further scope reduction (this head): the reduced envelopes were not
  // accepted, so both plugins now expose only the channel-bound minimal
  // surface. Every retained tool carries a channelId argument that
  // authorize() verifies against readChannelIds before any outbound call,
  // and the broker re-verifies the fetched objects belong to that channel.
  // Reads without a verifiable permitted channel tie are unregistered:
  // guild_get, channels_list, threads_active_list (guild-wide, scoped only
  // by post-projection filtering), events_list/event_get (channel tie
  // visible only after fetch), plus member/role personal-data reads.
  // Retained projections carry identifiers/counts/links/timestamps only.
  // `readTools` (body-bearing) is retained unregistered but not reachable.
  const RETAINED = new Set([
    "discord.channel_get", "discord.messages_list", "discord.message_get",
    "discord.messages_search", "discord.pins_list", "discord.reactions_list",
  ]);
  const reduced = readToolsMeta.filter(t => RETAINED.has(t.name));
  return kind === "dev" ? [...reduced] : [...reduced];
}

export function operationNames(kind: EnvKind): string[] { return toolsFor(kind).map(t => t.name); }

const profiles: Record<Profile, { reads: boolean; writes: boolean }> = {
  builder: { reads: true, writes: true },
  lead: { reads: true, writes: true },
  "researcher-read": { reads: true, writes: false },
  "reviewer-read": { reads: true, writes: false },
  none: { reads: false, writes: false },
};

export function parseCaller(v: unknown): Caller {
  const c = v as Record<string, unknown>;
  if (!(c && typeof c === "object" && !Array.isArray(c))) throw new Denied("validation.schema");
  const agentId = c.agentId, runId = c.runId, companyId = c.companyId, projectId = c.projectId ?? null;
  if (typeof agentId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(agentId)) throw new Denied("validation.schema");
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(runId)) throw new Denied("validation.schema");
  if (typeof companyId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(companyId)) throw new Denied("validation.schema");
  if (projectId !== null && (typeof projectId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(projectId))) throw new Denied("validation.schema");
  return { agentId, runId, companyId, projectId };
}

export function parseConfig(v: unknown, kind: EnvKind): Config {
  const c = v as Record<string, unknown>;
  if (!(c && typeof c === "object" && !Array.isArray(c))) throw new Denied("policy.config");
  if ((c.environment as string) !== kind) throw new Denied("policy.environment");
  const guildId = snowflake.parse((c as Record<string, unknown>).guildId);
  const botUserId = snowflake.parse((c as Record<string, unknown>).botUserId);
  const ref = (c as Record<string, unknown>).botTokenSecretRef as { type: string; secretId: string };
  if (!(ref && ref.type === "secret_ref" && typeof ref.secretId === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(ref.secretId))) throw new Denied("policy.secret_ref");
  const p = (c as Record<string, unknown>).policy as Record<string, unknown>;
  if (!(p && p.version === 1 && typeof p.companyId === "string" && typeof p.revision === "number")) throw new Denied("policy.config");
  const agents = (p as Record<string, unknown>).agents as Record<string, unknown>[];
  const readIds = (p as Record<string, unknown>).readChannelIds as string[];
  const writeIds = (p as Record<string, unknown>).writeChannelIds as string[];
  if (!Array.isArray(agents) || !Array.isArray(readIds) || !Array.isArray(writeIds)) throw new Denied("policy.config");
  const cleanAgents: AgentGrant[] = agents.map(a => {
    const ag = a as Record<string, unknown>;
    if (!(typeof ag.agentId === "string" && ["builder","lead","researcher-read","reviewer-read","none"].includes(ag.profile as string))) throw new Denied("policy.config");
    return { agentId: ag.agentId as string, profile: ag.profile as Profile, ...(typeof ag.allowProjectless === "boolean" ? { allowProjectless: ag.allowProjectless } : {}) };
  });
  for (const id of [...readIds, ...writeIds]) snowflake.parse(id);
  if (new Set(cleanAgents.map(a => a.agentId)).size !== cleanAgents.length) throw new Denied("policy.duplicate_agent");
  return { environment: kind, guildId, botUserId, botTokenSecretRef: { type: "secret_ref", secretId: ref.secretId }, policy: { version: 1, companyId: p.companyId as string, revision: p.revision as number, agents: cleanAgents, readChannelIds: readIds, writeChannelIds: writeIds } };
}

export function policyHash(config: Config): string { return hash(config); }

export async function authorize(host: Host, config: Config, caller: Caller, tool: Tool, args: Record<string, unknown>): Promise<void> {
  guard(caller.companyId === config.policy.companyId, "policy.company");
  const agent = config.policy.agents.find(a => a.agentId === caller.agentId);
  guard(agent, "policy.profile");
  const prof = profiles[agent!.profile];
  if (tool.tier === "read") guard(prof.reads, "policy.profile");
  else if (tool.tier === "write") {
    guard(prof.writes, "policy.profile");
    guard(config.environment === "dev" || tool.name === "discord.message_post", "policy.environment");
    // Prod publish disabled at first: prod plugin simply does not register write tools.
    guard(config.environment === "dev", "policy.environment");
  }
  // Channel scope
  if (tool.requiresChannel) {
    const ch = typeof args.channelId === "string" ? args.channelId : null;
    guard(ch !== null && snowflake.parse(ch) === ch, "policy.channel");
    if (tool.requiresChannel === "read") guard(config.policy.readChannelIds.includes(ch!), "policy.channel");
    else guard(config.policy.writeChannelIds.includes(ch!), "policy.channel");
  }
  // Issue binding (project/workspace identity)
  const issueId = args.issueId as string, workspaceId = args.workspaceId as string;
  const issue = await host.issue(issueId);
  guard(issue && issue.companyId === caller.companyId, "identity.issue_company");
  guard(issue!.assigneeAgentId === caller.agentId, "identity.issue_assignee");
  guard(issue!.checkoutRunId === caller.runId || issue!.executionRunId === caller.runId, "identity.issue_run");
  guard(issue!.status === "in_progress" || issue!.status === "in_review", "identity.issue_status");
  if (caller.projectId === null) {
    guard(agent!.allowProjectless === true, "identity.projectless");
    // Projectless research path: skip project/workspace checks, require explicit grant.
  } else {
    guard(issue!.projectId === caller.projectId, "identity.issue_project");
    guard(issue!.projectWorkspaceId === workspaceId, "identity.issue_workspace");
    const ws = await host.workspace(caller.projectId, workspaceId);
    guard(ws !== null, "identity.workspace");
  }
}

const CREATOR_TOOLS = new Set(["discord.message_post", "discord.message_reply", "discord.thread_create", "discord.event_create"]);
function isCreator(name: string): boolean { return CREATOR_TOOLS.has(name); }

export class Broker {
  private agents = new Map<string, { start: number; count: number; blockedUntil: number }>();
  private guilds = new Map<string, { start: number; count: number; blockedUntil: number }>();
  private inFlight = 0;
  private generation = 0;
  private lifecycleUnhealthy = false;

  private async readIndex(host: Host): Promise<string[]> {
    const v = await host.kvGet(LIFE_INDEX_KEY);
    if (v === null || v === undefined) return [];
    if (!Array.isArray(v) || !v.every(x => typeof x === "string")) throw new Denied("lifecycle.unhealthy");
    return v as string[];
  }
  private async indexAdd(host: Host, key: string): Promise<void> {
    const idx = await this.readIndex(host);
    if (!idx.includes(key)) {
      if (idx.length >= LIFE_INDEX_MAX) throw new Denied("lifecycle.unhealthy");
      idx.push(key);
      await host.kvSet(LIFE_INDEX_KEY, idx);
    }
  }
  private async indexRemove(host: Host, key: string): Promise<void> {
    const idx = await this.readIndex(host);
    const next = idx.filter(k => k !== key);
    await host.kvSet(LIFE_INDEX_KEY, next);
  }

  // Opportunistic sweep on each authorized call (the host offers no
  // scheduler): expired owned entries are deleted via the exact-owned path,
  // pending intents are reconciled. At most SWEEP_BATCH per call; a failed
  // verified delete marks the instance unhealthy and blocks new creations.
  async sweep(host: Host, config: Config, token: string, requestIds: string[], emit: (operation: string, outcome: "success" | "error", rule: string) => Promise<void>): Promise<void> {
    let idx: string[];
    try { idx = await this.readIndex(host); } catch { this.lifecycleUnhealthy = true; return; }
    if (idx.length === 0) return;
    const now = host.clock();
    let processed = 0;
    for (const key of idx) {
      if (processed >= SWEEP_BATCH) break;
      let entry: unknown;
      try { entry = await host.kvGet(key); } catch { this.lifecycleUnhealthy = true; break; }
      if (entry === null || entry === undefined || typeof entry !== "object") {
        try { await this.indexRemove(host, key); } catch { this.lifecycleUnhealthy = true; }
        continue;
      }
      const e = entry as LifeEntry;
      const expired = typeof e.expiresAt === "number" && e.expiresAt <= now;
      const staleIntent = e.state === "pending" && now - (e.createdAt ?? now) > 60000;
      if (!expired && !staleIntent) continue;
      processed++;
      try {
        if (e.state === "pending") {
          const adopted = await this.reconcile(host, config, token, e, requestIds);
          if (adopted) { try { await this.indexRemove(host, key); } catch {} continue; }
          if (!expired) continue; // ambiguous: keep pending for operator
          // expired pending with no reconciled resource: clear ledger only
          try { await host.kvDel(key); await this.indexRemove(host, key); } catch { this.lifecycleUnhealthy = true; }
          continue;
        }
        await this.deleteOwned(host, config, token, e, requestIds);
        try { await host.kvDel(key); if (e.kind === "message") await host.kvDel(`own:${e.channelId}:${e.resourceId}`); await this.indexRemove(host, key); await emit("sweep", "success", "sweep.deleted"); }
        catch { this.lifecycleUnhealthy = true; await emit("sweep", "error", "sweep.ledger"); }
      } catch (err) {
        const r = err instanceof Denied ? err.rule : err instanceof DiscordFailure ? err.rule : "sweep.failed";
        if (r === "sweep.gone") { try { await host.kvDel(key); await this.indexRemove(host, key); await emit("sweep", "success", "sweep.gone"); } catch {} continue; }
        this.lifecycleUnhealthy = true;
        try { await emit("sweep", "error", r); } catch { throw new Denied("audit.unavailable"); }
      }
    }
    if (processed === 0) this.lifecycleUnhealthy = false;
  }

  private async reconcile(host: Host, config: Config, token: string, e: LifeEntry, requestIds: string[]): Promise<boolean> {
    const now = host.clock();
    if (e.kind === "message") {
      const res = await request(host.http, "GET", `/api/v10/guilds/${config.guildId}/messages/search?author_id=${config.botUserId}&channel_id=${enc(e.channelId)}&limit=5`, token);
      observeResponse(res, requestIds);
      if (res.status !== 200) return false;
      const hit = (object(parse(res)).messages as unknown[] | undefined) ?? [];
      const flat = hit.map(m => Array.isArray(m) ? m[0] : m).filter(Boolean);
      if (flat.length !== 1) return false;
      const m = object(flat[0]);
      const rid = String(m.id);
      const owned: LifeEntry = { ...e, resourceId: rid, state: "owned" };
      await host.kvSet(lifeKey("message", rid, e.channelId), owned);
      await host.kvSet(`own:${e.channelId}:${rid}`, { authorId: config.botUserId, agentId: e.agentId, at: e.createdAt });
      await this.indexAdd(host, lifeKey("message", rid, e.channelId));
      return true;
    }
    if (e.kind === "thread") {
      const res = await request(host.http, "GET", `/api/v10/guilds/${config.guildId}/threads/active`, token);
      observeResponse(res, requestIds);
      if (res.status !== 200) return false;
      const threads = list(object(parse(res)).threads, 100);
      const hit = threads.filter(t => { const o = object(t); return o.owner_id === config.botUserId && o.name === e.intent; });
      if (hit.length !== 1) return false;
      const rid = String(object(hit[0]).id);
      const owned: LifeEntry = { ...e, resourceId: rid, state: "owned" };
      await host.kvSet(lifeKey("thread", rid, e.channelId), owned);
      await this.indexAdd(host, lifeKey("thread", rid, e.channelId));
      return true;
    }
    const res = await request(host.http, "GET", `/api/v10/guilds/${config.guildId}/scheduled-events`, token);
    observeResponse(res, requestIds);
    if (res.status !== 200) return false;
    const events = list(parse(res), 100);
    const hit = events.filter(ev => { const o = object(ev); return o.creator_id === config.botUserId && o.name === e.intent; });
    if (hit.length !== 1) return false;
    const rid = String(object(hit[0]).id);
    const owned: LifeEntry = { ...e, resourceId: rid, state: "owned" };
    await host.kvSet(lifeKey("event", rid, e.channelId), owned);
    await this.indexAdd(host, lifeKey("event", rid, e.channelId));
    return now > 0;
  }

  private async deleteOwned(host: Host, config: Config, token: string, e: LifeEntry, requestIds: string[]): Promise<void> {
    if (e.kind === "message") {
      const v = await request(host.http, "GET", `/api/v10/channels/${enc(e.channelId)}/messages/${enc(e.resourceId)}`, token);
      observeResponse(v, requestIds);
      if (v.status === 404) throw new Denied("sweep.gone");
      if (v.status === 401) throw new Denied("upstream.unauthorized");
      if (v.status !== 200) throw new Denied("sweep.verify");
      const authorId = (object(parse(v)) as Record<string, any>).author?.id;
      if (authorId !== config.botUserId) throw new Denied("policy.ownership");
      const d = await request(host.http, "DELETE", `/api/v10/channels/${enc(e.channelId)}/messages/${enc(e.resourceId)}`, token);
      observeResponse(d, requestIds);
      return this.finishDelete(host, config, token, d, requestIds, `/api/v10/channels/${enc(e.channelId)}/messages/${enc(e.resourceId)}`);
    }
    if (e.kind === "thread") {
      const v = await request(host.http, "GET", `/api/v10/channels/${enc(e.resourceId)}`, token);
      observeResponse(v, requestIds);
      if (v.status === 404) throw new Denied("sweep.gone");
      if (v.status !== 200) throw new Denied("sweep.verify");
      const owner = (object(parse(v)) as Record<string, any>).owner_id;
      if (owner !== config.botUserId) throw new Denied("policy.ownership");
      const d = await request(host.http, "DELETE", `/api/v10/channels/${enc(e.resourceId)}`, token);
      observeResponse(d, requestIds);
      return this.finishDelete(host, config, token, d, requestIds, `/api/v10/channels/${enc(e.resourceId)}`);
    }
    const v = await request(host.http, "GET", `/api/v10/guilds/${config.guildId}/scheduled-events/${enc(e.resourceId)}`, token);
    observeResponse(v, requestIds);
    if (v.status === 404) throw new Denied("sweep.gone");
    if (v.status !== 200) throw new Denied("sweep.verify");
    const creator = (object(parse(v)) as Record<string, any>).creator_id;
    if (creator !== config.botUserId) throw new Denied("policy.ownership");
    const d = await request(host.http, "DELETE", `/api/v10/guilds/${config.guildId}/scheduled-events/${enc(e.resourceId)}`, token);
    observeResponse(d, requestIds);
    return this.finishDelete(host, config, token, d, requestIds, `/api/v10/guilds/${config.guildId}/scheduled-events/${enc(e.resourceId)}`);
  }

  private async finishDelete(host: Host, config: Config, token: string, d: Response, requestIds: string[], verifyPath: string): Promise<void> {
    if (d.status === 401) throw new Denied("upstream.unauthorized");
    if (d.status === 429) throw new Denied("rate.discord", retryAfter(d, host.clock()));
    if (d.status === 404) return; // already gone
    if (!(d.status >= 200 && d.status < 300)) throw new Denied("sweep.delete");
    const v = await request(host.http, "GET", verifyPath, token);
    observeResponse(v, requestIds);
    if (v.status !== 404) throw new Denied("sweep.verify");
  }

  private pause(map: Map<string, any>, key: string, seconds: number, now: number): number {
    const b = map.get(key);
    const blockedUntil = Math.max(b?.blockedUntil ?? 0, now + seconds * 1000);
    if (b) b.blockedUntil = blockedUntil;
    else { if (map.size >= 128) throw new Denied("rate.capacity"); map.set(key, { start: now, count: 0, blockedUntil }); }
    return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
  }
  private reserve(map: Map<string, any>, key: string, count: number, limit: number, window: number, now: number): void {
    for (const [k, b] of map) if (now >= b.start + window && now >= b.blockedUntil) map.delete(k);
    let b = map.get(key);
    if (!b) { if (map.size >= 128) throw new Denied("rate.capacity"); b = { start: now, count: 0, blockedUntil: 0 }; map.set(key, b); }
    if (now < b.blockedUntil) throw new Denied("rate.retry_after", Math.max(1, Math.ceil((b.blockedUntil - now) / 1000)));
    if (b.count + count > limit) throw new Denied("rate.bucket", Math.max(1, Math.ceil((b.start + window - now) / 1000)));
    b.count += count;
  }

  async execute(host: Host, kind: EnvKind, name: unknown, input: unknown, context: unknown): Promise<Result> {
    const event = (await import("node:crypto")).randomUUID();
    const generation = ++this.generation;
    const registry = new Map(toolsFor(kind).map(t => [t.name, t]));
    const schemas = new Map(toolsFor(kind).map(t => [t.name, t.schema]));
    const response = (data: unknown, isError: boolean): Result => ({ content: [{ type: "text", text: JSON.stringify(data) }], isError });
    let caller: Caller | null = null, args: Record<string, unknown> | null = null;
    let operation = "unknown", policyDigest = hash(null), revision: number | null = null;
    let phase: Audit["phase"] = "refused", reserved = false, guildKey: string | null = null;
    const requestIds: string[] = [];
    let providerFailure: { rule: string; retryAfterSeconds: number } | undefined;
    const emit = async (decision: Audit["decision"], rule: string, outcome: Audit["outcome"]) => {
      try {
        await host.audit({ event, time: host.clock(), agentId: caller?.agentId ?? null, runId: caller?.runId ?? null, companyId: caller?.companyId ?? null, policyHash: policyDigest, policyRevision: revision, operation, phase, decision, rule, requestIds: [...requestIds], outcome, ...(providerFailure ? { providerFailure } : {}) });
      } catch { throw new Denied("audit.unavailable"); }
    };
    try {
      caller = parseCaller(context);
      const toolName = typeof name === "string" ? name : "unknown";
      if (typeof name !== "string" || !registry.has(name)) throw new Denied("validation.unknown_tool");
      operation = toolName;
      const tool = registry.get(toolName)!;
      // Closed-schema dispatch (rejects prototype/unknown keys)
      let parsed: Record<string, unknown>;
      try { parsed = tool.schema.parse(input) as Record<string, unknown>; } catch { throw new Denied("validation.schema"); }
      args = parsed;
      const config = parseConfig(await host.config(), kind);
      policyDigest = policyHash(config); revision = config.policy.revision;
      await authorize(host, config, caller, tool, args);
      // Ownership ledger preflight must not resolve the credential or emit intent (STANDARD §8).
      if (tool.name === "discord.message_edit_own") {
        const owned = await host.kvGet(`own:${args!.channelId}:${args!.messageId}`);
        if (!owned || typeof owned !== "object") throw new Denied("policy.ownership");
      }
      // Exact-owned delete preflight: durable ledger + caller agent binding,
      // before secret resolution. Sweep uses the same ledger without an
      // agent-supplied target (preauthorized cleanup, STANDARD §6).
      if (tool.name === "discord.message_delete_own" || tool.name === "discord.thread_delete_own") {
        const rid = tool.name === "discord.message_delete_own" ? (args!.messageId as string) : (args!.threadId as string);
        const kind = tool.name === "discord.message_delete_own" ? "message" : "thread";
        const entry = await host.kvGet(lifeKey(kind, rid, args!.channelId as string));
        const legacy = kind === "message" ? await host.kvGet(`own:${args!.channelId}:${rid}`) : null;
        const match = (e: unknown) => e !== null && typeof e === "object" && (e as Record<string, unknown>).authorId === config.botUserId && (e as Record<string, unknown>).agentId === caller!.agentId && ((e as Record<string, unknown>).state === undefined || (e as Record<string, unknown>).state === "owned");
        if (!match(entry) && !match(legacy)) throw new Denied("policy.ownership");
      }
      if (tool.name === "discord.event_delete_own") {
        const entry = await host.kvGet(lifeKey("event", args!.eventId as string, ""));
        const okEntry = entry !== null && typeof entry === "object" && (entry as Record<string, unknown>).authorId === config.botUserId && (entry as Record<string, unknown>).agentId === caller!.agentId && ((entry as Record<string, unknown>).state === undefined || (entry as Record<string, unknown>).state === "owned");
        if (!okEntry) throw new Denied("policy.ownership");
      }
      // Stop new provisioning when cleanup health is unavailable (STANDARD §5).
      if (this.lifecycleUnhealthy && isCreator(tool.name)) throw new Denied("lifecycle.unhealthy");
      // Immutable event window is a preflight refusal (before intent/secret).
      if (tool.name === "discord.event_create") {
        const startMs = Date.parse(args!.scheduledStartTime as string);
        guard(Number.isFinite(startMs) && startMs > host.clock() + 3600000 && startMs <= host.clock() + DEV_TTL_MS, "policy.expiry");
      }
      // Rate budgets (worst-case 1 request per call for reads; writes count 1)
      const agentKey = `${caller.companyId}:${caller.agentId}`;
      const guild = config.guildId;
      guildKey = `${config.guildId}`;
      this.reserve(this.agents, agentKey, 1, 30, 60000, host.clock());
      this.reserve(this.guilds, guildKey, 1, 4000, 3600000, host.clock());
      guard(this.inFlight < 2, "rate.concurrency");
      this.inFlight++; reserved = true;
      phase = "intent";
      try { await emit("allow", "policy.allow", "pending"); } catch (e) { phase = "refused"; throw e; }
      // Revalidate before side effect (reads and writes)
      guard(policyHash(parseConfig(await host.config(), kind)) === policyDigest, "policy.changed");
      await authorize(host, config, caller, tool, args!);
      const reqSpec = tool.requests(args!, guild);
      // Resolve credential only at call time, after auth
      let token: string;
      try { token = await host.secret(config.botTokenSecretRef, caller.companyId); } catch { throw new Denied("secret.unavailable"); }
      guard(typeof token === "string" && token.trim().length > 0, "secret.unavailable");
      // Read-only envelope: zero outbound mutations on this path. The
      // legacy opportunistic sweep (which issued DELETEs) is dormant;
      // any ledger rows left by earlier builds require operator manual
      // cleanup and are not deleted by a read call.
      // Body for writes: plain text + allowed_mentions parse []
      let body: string | undefined;
      let intentKey: string | null = null;
      let intentEntry: LifeEntry | null = null;
      if (tool.tier === "write") {
        const content = args!.content as string | undefined;
        if (tool.name === "discord.message_post") { const nonce = (await import("node:crypto")).randomUUID(); body = JSON.stringify({ content, allowed_mentions: { parse: [] }, nonce }); }
        else if (tool.name === "discord.message_reply") { const nonce = (await import("node:crypto")).randomUUID(); body = JSON.stringify({ content, allowed_mentions: { parse: [] }, message_reference: { message_id: args!.messageId, channel_id: args!.channelId, guild_id: guild, type: 19 }, nonce }); }
        else if (tool.name === "discord.message_edit_own") {
          // Upstream author verification via read (uses same token, after ledger)
          const verify = await request(host.http, "GET", `/api/v10/channels/${enc(args!.channelId as string)}/messages/${enc(args!.messageId as string)}`, token);
          observe(verify, [token]);
          guard(verify.status === 200, "upstream.read");
          const authorId = (object(parse(verify)) as Record<string, any>).author?.id;
          guard(authorId === config.botUserId, "policy.ownership");
          body = JSON.stringify({ content, allowed_mentions: { parse: [] } });
        } else if (tool.name === "discord.reaction_add_own" || tool.name === "discord.reaction_remove_own") body = undefined;
        else if (tool.name === "discord.thread_create") body = JSON.stringify({ name: args!.name, auto_archive_duration: 1440, type: 11 });
        else if (tool.name === "discord.event_create") {
          const startMs = Date.parse(args!.scheduledStartTime as string);
          guard(Number.isFinite(startMs) && startMs > host.clock() + 3600000 && startMs <= host.clock() + DEV_TTL_MS, "policy.expiry");
          body = JSON.stringify({ name: args!.name, scheduled_start_time: args!.scheduledStartTime, channel_id: args!.channelId, privacy_level: 2, entity_type: 1, description: "Broker-created event" });
        }
        // Durable intent + index BEFORE the side effect (STANDARD §5). Index
        // or ledger failure refuses creation; nothing is created.
        if (isCreator(tool.name)) {
          const now = host.clock();
          const ch = (args!.channelId as string) ?? "";
          const kindOf = tool.name === "discord.thread_create" ? "thread" : tool.name === "discord.event_create" ? "event" : "message";
          const pendingId = `pending-${(await import("node:crypto")).randomUUID()}`;
          intentEntry = { kind: kindOf, channelId: ch, resourceId: pendingId, guildId: guild, agentId: caller.agentId, runId: caller.runId, authorId: config.botUserId, createdAt: now, expiresAt: now + DEV_TTL_MS, state: "pending", intent: (args!.name as string | undefined) ?? "" };
          intentKey = lifeKey(kindOf, pendingId, ch);
          await host.kvSet(intentKey, intentEntry);
          try { await this.indexAdd(host, intentKey); } catch (e) { try { await host.kvDel(intentKey); } catch {} throw e; }
        }
      }
      const method = reqSpec.method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
      const res = await request(host.http, method, reqSpec.path, token, body !== undefined ? { body } : {});
      observe(res, [token]);
      if (res.status === 401) { this.pause(this.guilds, guildKey, 3600, host.clock()); throw new Denied("upstream.unauthorized"); }
      if (res.status === 429) { const s = retryAfter(res, host.clock()); const eff = this.pause(this.guilds, guildKey, s, host.clock()); providerFailure = { rule: "rate.discord", retryAfterSeconds: eff }; throw new Denied("rate.discord", eff); }
      // Idempotent delete: 404 means already gone — reconcile ledger, success.
      if (res.status === 404 && (tool.name === "discord.message_delete_own" || tool.name === "discord.thread_delete_own" || tool.name === "discord.event_delete_own")) {
        const rid = tool.name === "discord.event_delete_own" ? (args!.eventId as string) : tool.name === "discord.message_delete_own" ? (args!.messageId as string) : (args!.threadId as string);
        const ch = tool.name === "discord.event_delete_own" ? "" : (args!.channelId as string);
        const kk = tool.name === "discord.event_delete_own" ? "event" : tool.name === "discord.message_delete_own" ? "message" : "thread";
        try { await host.kvDel(lifeKey(kk, rid, ch)); if (kk === "message") await host.kvDel(`own:${ch}:${rid}`); await this.indexRemove(host, lifeKey(kk, rid, ch)); } catch {}
        phase = "outcome"; await emit("allow", "policy.allow", "success");
        return response({ ok: true, policyHash: policyDigest, policyRevision: revision, guildId: guild, operation, page: { alreadyGone: true }, pagination: "bounded; request subsequent pages explicitly" }, false);
      }
      guard(res.status >= 200 && res.status < 300, "upstream.read");
      let value: unknown;
      // Fail closed on unexpected shape — never return raw upstream bodies.
      try { value = res.status === 204 ? null : tool.project(parse(res), args!); } catch { throw new DiscordFailure("upstream.shape"); }
      // Guild-wide list tools carry no channel arg, so authorize() cannot
      // scope them: filter the projection by readChannelIds here (fail closed
      // — items without a matching id/parent_id/channel_id are dropped).
      if (tool.listScope && Array.isArray(value)) {
        const allowed = new Set(config.policy.readChannelIds);
        const key = tool.listScope === "channel" ? "id" : tool.listScope === "thread" ? "parent_id" : "channel_id";
        value = (value as unknown[]).filter(item => {
          if (item === null || typeof item !== "object") return false;
          const o = item as Record<string, unknown>;
          if (!allowed.has(String(o[key]))) return false;
          // A parent grant must not leak private threads: only public
          // (11) and announcement (10) threads are returned; private
          // threads (12) and typeless entries are dropped fail-closed.
          if (tool.listScope === "thread" && o.type !== 10 && o.type !== 11) return false;
          return true;
        });
      }
      // Defense in depth: the upstream object must belong to the bound
      // guild. Channel-scoped endpoints are not guild-scoped by Discord,
      // so a channel ID from another guild must not pass the allowlist.
      const assertGuild = (v: unknown): void => {
        if (Array.isArray(v)) { v.forEach(assertGuild); return; }
        if (v !== null && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if (typeof o.guild_id === "string" && o.guild_id !== guild) throw new Denied("upstream.guild");
          Object.values(o).forEach(assertGuild);
        }
      };
      assertGuild(value);
      // event_get carries only an event ID, so its channel tie is only
      // visible after fetch: refuse when its channel is not allowlisted.
      if (tool.name === "discord.event_get" && value !== null && typeof value === "object") {
        const ch = (value as Record<string, unknown>).channel_id;
        if (typeof ch === "string" && !config.policy.readChannelIds.includes(ch)) throw new Denied("policy.channel");
      }
      // Fail closed when any fetched object belongs outside the bound
      // channel. Channel-scoped endpoints are not guild/channel-enforced
      // by Discord, so every retained object must carry (or be) the
      // channel that authorize() verified before the call.
      const boundChannel = typeof (args as Record<string, unknown> | null)?.channelId === "string" ? (args as Record<string, unknown>).channelId as string : null;
      if (tool.requiresChannel === "read" && boundChannel !== null) {
        const assertBound = (v: unknown): void => {
          if (Array.isArray(v)) { v.forEach(assertBound); return; }
          if (v !== null && typeof v === "object") {
            const o = v as Record<string, unknown>;
            if (o.channel_id !== undefined && o.channel_id !== boundChannel) throw new Denied("upstream.channel");
            for (const [k, x] of Object.entries(o)) if (k !== "message_reference") assertBound(x);
          }
        };
        assertBound(value);
        if (tool.name === "discord.channel_get" && value !== null && typeof value === "object" && (value as Record<string, unknown>).id !== boundChannel) throw new Denied("upstream.channel");
      }
      const clean = (v: unknown) => scrub(v, [token]) as unknown;
      value = clean(value);
      guard(Buffer.byteLength(JSON.stringify(value)) <= 262144, "output.limit");
      requestIds.splice(0, requestIds.length, ...(clean(requestIds) as string[]).filter(x => x !== "[REDACTED]"));
      // Persist ownership for creates (legacy own entry + life ledger).
      if (intentEntry && value && typeof value === "object" && "id" in (value as Record<string, unknown>)) {
        const rid = (value as Record<string, unknown>).id as string;
        const owned: LifeEntry = { ...intentEntry, resourceId: rid, state: "owned" };
        await host.kvSet(lifeKey(owned.kind, rid, owned.channelId), owned);
        await this.indexAdd(host, lifeKey(owned.kind, rid, owned.channelId));
        if (owned.kind === "message") await host.kvSet(`own:${owned.channelId}:${rid}`, { authorId: config.botUserId, agentId: caller.agentId, at: host.clock() });
        try { await host.kvDel(intentKey!); await this.indexRemove(host, intentKey!); } catch { this.lifecycleUnhealthy = true; }
      }
      // Successful exact-owned deletes clear their ledger (idempotent; an
      // already-gone verify 404 also clears).
      if (tool.name === "discord.message_delete_own" || tool.name === "discord.thread_delete_own" || tool.name === "discord.event_delete_own") {
        const rid = tool.name === "discord.event_delete_own" ? (args!.eventId as string) : tool.name === "discord.message_delete_own" ? (args!.messageId as string) : (args!.threadId as string);
        const ch = tool.name === "discord.event_delete_own" ? "" : (args!.channelId as string);
        const kk = tool.name === "discord.event_delete_own" ? "event" : tool.name === "discord.message_delete_own" ? "message" : "thread";
        try { await host.kvDel(lifeKey(kk, rid, ch)); if (kk === "message") await host.kvDel(`own:${ch}:${rid}`); await this.indexRemove(host, lifeKey(kk, rid, ch)); } catch {}
      }
      phase = "outcome"; await emit("allow", "policy.allow", "success");
      return response({ ok: true, policyHash: policyDigest, policyRevision: revision, guildId: guild, operation, page: value, pagination: "bounded; request subsequent pages explicitly" }, false);
    } catch (error) {
      let r = "broker.unavailable";
      if (error instanceof Denied) r = error.rule;
      else if (error instanceof DiscordFailure) r = error.rule;
      else if (error && typeof error === "object" && "code" in error && typeof (error as Record<string, unknown>).code === "string") r = "validation.schema";
      if (guildKey && (r === "upstream.unauthorized")) { try { this.pause(this.guilds, guildKey, 3600, host.clock()); } catch {} }
      if (phase === "intent") phase = "outcome";
      try { await emit("deny", r, "error"); } catch { return response({ ok: false, rule: "audit.unavailable" }, true); }
      return response({ ok: false, rule: r, ...(error instanceof Denied && error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : error instanceof DiscordFailure && (error as DiscordFailure).retryAfterSeconds !== undefined ? { retryAfterSeconds: (error as DiscordFailure).retryAfterSeconds } : {}) }, true);
    } finally { if (reserved) this.inFlight--; }
    function observe(res: Response, _sensitive: readonly string[]) {
      const id = header(res, "x-request-id") ?? header(res, "x-discord-request-id");
      if (id && /^[A-Za-z0-9-]{6,64}$/.test(id)) requestIds.push(id);
    }
  }
}
