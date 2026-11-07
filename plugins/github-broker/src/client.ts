import { tools } from "./broker.js";
import { scrub } from "./output.js";

const pluginKey = "togetherweown.github-broker";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const code = /^[a-z][a-z0-9_.]{0,79}$/;
const maxInput = 16384;
// Data: three 256-KiB pages plus signals copying at most two pages, <=200
// signals with 128 bytes extra each, and 4 KiB metadata. The wire duplicates
// data in content (up to 2x JSON escaping) and data (1x): <4 MiB in total.
const maxResponse = 4 * 1048576;
type Environment = Record<string, string | undefined>;
type RecordValue = Record<string, unknown>;
export interface ClientResult extends RecordValue { ok: boolean; error?: string }
const record = (v: unknown): v is RecordValue => v !== null && typeof v === "object" && !Array.isArray(v);
function requireValue(value: unknown): asserts value { if (!value) throw new Error("invalid"); }
function id(value: unknown): string { requireValue(typeof value === "string" && uuid.test(value)); return value; }

function context(env: Environment, projectId: unknown) {
  const agentId = id(env.PAPERCLIP_AGENT_ID), runId = id(env.PAPERCLIP_RUN_ID), companyId = id(env.PAPERCLIP_COMPANY_ID);
  const issueId = id(env.PAPERCLIP_TASK_ID), workspaceId = id(env.PAPERCLIP_WORKSPACE_ID);
  const key = env.PAPERCLIP_API_KEY;
  requireValue(typeof key === "string" && key.length <= maxInput && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key));
  const claims: unknown = JSON.parse(Buffer.from(key.split(".")[1]!, "base64url").toString("utf8"));
  // Structural fail-fast only. The server verifies the signature and live run;
  // decoding a JWT never authenticates it or grants client-side authority.
  requireValue(record(claims) && claims.sub === agentId && claims.run_id === runId && claims.company_id === companyId && typeof claims.exp === "number" && claims.exp > Date.now() / 1000);
  const rawUrl = env.PAPERCLIP_API_URL;
  requireValue(typeof rawUrl === "string");
  const url = new URL(rawUrl);
  requireValue(!url.username && !url.password && !url.search && !url.hash && ["", "/", "/api", "/api/"].includes(url.pathname));
  requireValue(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  url.pathname = "/api/plugins/tools/execute";
  return { key, url, issueId, workspaceId, runContext: { agentId, runId, companyId, projectId: id(projectId) } };
}

async function readJson(response: Response): Promise<unknown> {
  requireValue(response.body);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      requireValue(bytes <= maxResponse);
      chunks.push(next.value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// Temporary supported REST path until a containing stable MCP fix is installed
// and QA verifies structured output, errors and per-caller authorization.
export async function executeBrokerRead(env: Environment, projectId: unknown, operation: unknown, input: unknown, fetcher: typeof fetch = fetch): Promise<ClientResult> {
  let call: ReturnType<typeof context>, parameters: RecordValue, name: string;
  try {
    call = context(env, projectId);
    const tool = tools.find(t => t.name === operation);
    requireValue(tool);
    parameters = tool.schema.parse(input);
    tool.requests(parameters as Parameters<typeof tool.requests>[0]);
    requireValue(parameters.issueId === call.issueId && parameters.workspaceId === call.workspaceId);
    name = tool.name;
  } catch { return { ok: false, error: "client.context_or_arguments" }; }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
  let status: number | undefined;
  try {
    // No board fallback, gateway session, caller-supplied URL/headers, retries,
    // confirmation flags or fabricated idempotency controls on this endpoint.
    const response = await fetcher(call.url, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${call.key}`, "Content-Type": "application/json", Accept: "application/json", "X-Paperclip-Run-Id": call.runContext.runId },
      body: JSON.stringify({ tool: `${pluginKey}:${name}`, parameters, runContext: call.runContext }),
    });
    status = response.status;
    let body: unknown;
    try { body = await readJson(response); }
    catch { return { ok: false, error: controller.signal.aborted ? "client.timeout" : response.ok ? "client.response" : "client.http", status }; }
    // Scrub the serialized value so reflected keys as well as values cannot
    // expose the run bearer. Never return raw HTTP messages or exception text.
    body = JSON.parse(scrub(JSON.stringify(body), [call.key]) as string);
    if (!response.ok) {
      const result: ClientResult = { ok: false, error: "client.http", status };
      if (record(body)) {
        if (typeof body.reasonCode === "string" && code.test(body.reasonCode)) result.reasonCode = body.reasonCode;
        for (const field of ["invocationId", "actionRequestId", "interactionId", "issueId"]) if (typeof body[field] === "string" && uuid.test(body[field])) result[field] = body[field];
        if (typeof body.argumentsHash === "string" && /^[a-f0-9]{64}$/.test(body.argumentsHash)) result.argumentsHash = body.argumentsHash;
        if (body.reasonCode === "approval_required") result.nextAction = "Stop and follow the native approval interaction. Do not retry or assume automatic execution; inspect the recorded outcome on continuation.";
      }
      const retry = response.headers.get("retry-after");
      if (retry && /^\d{1,6}$/.test(retry)) result.retryAfterSeconds = Number(retry);
      return result;
    }
    // The shipped route returns this wrapper directly, not an MCP result or
    // generic gateway envelope. Null/replay summaries are never read success.
    requireValue(status === 200 && record(body) && body.pluginId === pluginKey && body.toolName === name && record(body.result));
    const result = body.result;
    requireValue(record(result.data) && typeof result.data.ok === "boolean");
    if (result.error !== undefined || !result.data.ok) {
      const rule = result.error ?? result.data.rule;
      requireValue(typeof rule === "string" && code.test(rule));
      return { ok: false, error: rule, status, data: result.data };
    }
    requireValue(result.data.operation === name && result.data.repoId === parameters.repoId);
    return { ok: true, status, data: result.data };
  } catch { return { ok: false, error: controller.signal.aborted ? "client.timeout" : status === undefined ? "client.transport" : "client.response", ...(status === undefined ? {} : { status }) }; }
  finally { clearTimeout(timer); }
}

export async function main(argv = process.argv.slice(2), env: Environment = process.env): Promise<void> {
  let result: ClientResult;
  if (argv.length !== 2) result = { ok: false, error: "client.usage", usage: "client.js <project-uuid> <github.tool> < arguments.json" };
  else {
    const timer = setTimeout(() => process.stdin.destroy(new Error("input")), 5000);
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of process.stdin) {
        bytes += Buffer.byteLength(chunk);
        requireValue(bytes <= maxInput);
        chunks.push(Buffer.from(chunk));
      }
      const input: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
      clearTimeout(timer);
      result = await executeBrokerRead(env, argv[0], argv[1], input);
    } catch { result = { ok: false, error: "client.input" }; }
    finally { clearTimeout(timer); process.stdin.destroy(); }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
if (import.meta.main) await main();
