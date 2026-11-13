import { check } from "./schema.js";
export function object(v: unknown): Record<string, unknown> { check(v !== null && typeof v === "object" && !Array.isArray(v), "cloudflare.response"); return v as Record<string, unknown>; }
function pick(v: unknown, fields: string[]): Record<string, unknown> {
  const input = object(v);
  return Object.fromEntries(fields.filter(k => ["string", "number", "boolean"].includes(typeof input[k])).map(k => [k, input[k]]));
}
function list(v: unknown, project: (v: unknown) => unknown): unknown[] { check(Array.isArray(v), "cloudflare.response"); return v.slice(0, 100).map(project); }
export function project(name: string, result: unknown, args: Record<string, unknown>): unknown {
  const v = object(result);
  if (name === "cloudflare.workers.listDeployments") return list(v.deployments, x => ({ ...pick(x, ["id", "created_on", "source", "strategy"]), versions: list(object(x).versions, y => pick(y, ["version_id", "percentage"])) }));
  if (name === "cloudflare.workers.getVersion") {
    const metadata = object(v.metadata ?? {});
    return { ...pick(v, ["id", "number"]), ...pick(metadata, ["created_on"]), metadata: { ...pick(metadata, ["source"]), author_email: "[REDACTED]" }, annotations: pick(v.annotations ?? {}, ["workers/message", "workers/tag"]) };
  }
  if (name === "cloudflare.containers.getApplication") return pick(v, ["id", "name", "created_at", "updated_at", "version", "instances", "max_instances", "scheduling_policy", "active_rollout_id"]);
  const events = object(v.events).events;
  check(Array.isArray(events), "cloudflare.response");
  return events.filter(e => object(object(e).$workers ?? {}).scriptName === args.script).slice(0, Number(args.limit)).map(e => ({ ...pick(e, ["timestamp"]), ...pick(object(e).$metadata, ["id", "level", "message", "error"]) }));
}
export function scrub(value: unknown, token: string): unknown {
  // Project first. Redact the exact credential, emails and common secret forms in every retained string.
  return JSON.parse(JSON.stringify(value, (_k, v: unknown) => typeof v !== "string" ? v : v.split(token).join("[REDACTED]")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "[REDACTED]")
    .replace(/\b(?:password|secret|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|authorization)["']?\s*[:=]\s*["']?[^\s,;"'}]+/gi, "[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED]")
    .replace(/\b[A-Za-z0-9_]{32,}\b/g, "[REDACTED]")));
}
