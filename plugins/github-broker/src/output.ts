import { guard } from "./types.js";

export function object(value: unknown): Record<string, unknown> {
  guard(value !== null && typeof value === "object" && !Array.isArray(value), "upstream.shape");
  return value as Record<string, unknown>;
}
export function list(value: unknown, project: (value: unknown) => unknown): unknown[] {
  guard(Array.isArray(value) && value.length <= 100, "upstream.list");
  return value.map(project);
}
export function pick(value: unknown, fields: string[]): Record<string, string | number | boolean | null> {
  const input = object(value), out: Record<string, string | number | boolean | null> = {};
  for (const field of fields) {
    const v = input[field];
    if (v === undefined) continue;
    guard(v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 131072), "upstream.field");
    out[field] = v as string | number | boolean | null;
  }
  guard(Object.keys(out).length > 0, "upstream.empty");
  return out;
}
export function pull(value: unknown): unknown {
  const v = object(value);
  guard(Number.isSafeInteger(v.number) && Number.isSafeInteger(v.id), "upstream.pull");
  return { ...pick(v, ["id", "number", "title", "body", "state", "draft", "merged", "mergeable", "mergeable_state", "html_url", "created_at", "updated_at"]),
    head: pick(v.head, ["ref", "sha"]), base: pick(v.base, ["ref", "sha"]) };
}
export const changedFile = (v: unknown): unknown => pick(v, ["sha", "filename", "previous_filename", "status", "additions", "deletions", "changes", "patch"]);
export const run = (v: unknown): unknown => pick(v, ["id", "name", "head_sha", "head_branch", "status", "conclusion", "event", "run_number", "run_attempt", "html_url", "created_at", "updated_at"]);
export function repositoryRead(value: unknown, mode: unknown): unknown {
  const v = object(value);
  if (mode === "file") {
    guard(v.type === "file" && v.encoding === "base64" && typeof v.content === "string" && typeof v.size === "number" && v.size <= 131072, "upstream.file");
    const encoded = v.content.replace(/\n/g, "");
    guard(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), "upstream.encoding");
    const bytes = Buffer.from(encoded, "base64");
    guard(bytes.length === v.size && bytes.length <= 131072 && !bytes.includes(0), "upstream.file_size");
    const content = bytes.toString("utf8");
    guard(Buffer.from(content).equals(bytes), "upstream.utf8");
    return { ...pick(v, ["name", "path", "sha", "size"]), content, encoding: "utf-8" };
  }
  if (mode === "tree") {
    guard(Array.isArray(v.tree) && typeof v.truncated === "boolean", "upstream.tree");
    return { ...pick(v, ["sha"]), truncated: v.truncated || v.tree.length > 100, tree: list(v.tree.slice(0, 100), entry => pick(entry, ["path", "mode", "type", "sha", "size"])) };
  }
  if (mode === "ref") return { ...pick(v, ["ref"]), object: pick(v.object, ["type", "sha"]) };
  guard(Array.isArray(v.files), "upstream.files");
  return { ...pick(v, ["status", "ahead_by", "behind_by", "total_commits"]), commits: list(v.commits, c => pick(c, ["sha"])), files: list(v.files.slice(0, 100), changedFile), filesTruncated: v.files.length > 100 };
}

/** Redact only after explicit projection, including decoded file contents. Never
 * serialize arbitrary upstream objects or exception causes, even for diagnostics.
 */
export function scrub(value: unknown, secrets: string[]): unknown {
  const needles = [...new Set(secrets.flatMap(s => [s, ...s.split(/\r?\n/).filter(line => line.length >= 16)]).filter(Boolean))].sort((a, b) => b.length - a.length);
  function visit(v: unknown): unknown {
    if (typeof v === "string") {
      let out = v;
      for (const s of needles) out = out.split(s).join("[REDACTED]");
      return out.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED]")
        .replace(/\b(?:gh[psuor]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, "[REDACTED]");
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x)]));
    return v;
  }
  return visit(value);
}
