import { definePlugin, JsonRpcCallError, PLUGIN_RPC_ERROR_CODES, type PluginContext, type ToolRunContext } from "@paperclipai/plugin-sdk";
import { argumentsFor, callerSchema, check, configSchema, Failure, tools } from "./schema.js";
import { object, project, scrub } from "./output.js";
async function read(response: Response, alive: () => void): Promise<unknown> {
  check(response.status === 200 && response.body, "cloudflare.http");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); alive(); if (next.done) break;
      bytes += next.value.length; check(bytes <= 262144, "cloudflare.size"); chunks.push(next.value);
    }
    const envelope = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
    check(envelope.success === true, "cloudflare.http"); return envelope.result;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function execute(ctx: PluginContext, tool: typeof tools[number], input: unknown, context: ToolRunContext, signal: AbortSignal, alive: () => void) {
  const caller = callerSchema.parse(context), args = argumentsFor(tool, input);
  const config = configSchema.parse(await ctx.config.get(caller.companyId)); alive();
  const policy = config.policy, agent = policy.agents.find(a => a.agentId === caller.agentId);
  check(new Set(policy.agents.map(a => a.agentId)).size === policy.agents.length);
  check(policy.companyId === caller.companyId && agent?.profile === "read");
  check(args.script ? agent.workerScripts.includes(String(args.script)) : agent.containerApplicationIds.includes(String(args.applicationId)));
  check(tool.name !== "cloudflare.containers.listRollouts", "cloudflare.rollouts_unsupported");
  let path: string, body: string | undefined;
  const scriptPath = `/workers/scripts/${args.script}`;
  if (tool.name === "cloudflare.workers.listDeployments") path = scriptPath + "/deployments";
  else if (tool.name === "cloudflare.workers.getVersion") path = scriptPath + `/versions/${args.versionId}`;
  else if (tool.name === "cloudflare.containers.getApplication") path = `/containers/applications/${args.applicationId}`;
  else {
    check(tool.name === "cloudflare.workers.queryLogs");
    const from = args.from as number, to = args.to as number, now = Date.now();
    check(from < to && to <= now && from >= now - 7 * 86400000 && to - from <= 86400000, "cloudflare.window");
    path = "/workers/observability/telemetry/query";
    body = JSON.stringify({ queryId: "cloudflare-broker", dry: true, view: "events", timeframe: { from, to }, limit: args.limit,
      parameters: { filterCombination: "and", filters: [{ key: "$workers.scriptName", operation: "eq", type: "string", value: args.script }],
        ...(args.filter ? { needle: { value: args.filter, isRegex: false, matchCase: true } } : {}) } });
  }
  await ctx.activity.log({ companyId: caller.companyId, message: "cloudflare-broker.read", metadata: { operation: tool.name, agentId: caller.agentId, runId: caller.runId, revision: policy.revision } }); alive();
  const current = configSchema.parse(await ctx.config.get(caller.companyId)); alive();
  check(JSON.stringify(current) === JSON.stringify(config));
  const token = await ctx.secrets.resolve(config.apiTokenSecretRef, { companyId: caller.companyId, configPath: "apiTokenSecretRef" }); alive();
  check(typeof token === "string" && /^[\x21-\x7e]{1,4096}$/.test(token), "cloudflare.secret");
  const response = await ctx.http.fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}${path}`, {
    method: body === undefined ? "GET" : "POST", redirect: "error", signal,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body }),
  }); alive();
  return { ok: true, result: scrub(project(tool.name, await read(response, alive), args), token) };
}
export function register(ctx: PluginContext, timeoutMs = 30000): void {
  let inFlight = 0;
  const failure = (rule: string) => ({ error: rule, content: JSON.stringify({ ok: false, rule }), data: { ok: false, rule } });
  for (const tool of tools) ctx.tools.register(tool.name, { displayName: tool.name, description: "READ ONLY. Allowlisted Cloudflare resource metadata or bounded logs.", parametersSchema: tool.parametersSchema }, async (input, run) => {
    if (inFlight >= 4) return failure("cloudflare.capacity");
    const controller = new AbortController(), deadline = performance.now() + timeoutMs;
    const alive = () => check(!controller.signal.aborted && performance.now() < deadline, "cloudflare.timeout");
    let timer: ReturnType<typeof setTimeout> | undefined; inFlight++;
    // Neither caller nor SDK-local RPC expiry proves native settlement. Quarantine uncertain slots until worker restart.
    const pending = execute(ctx, tool, input, run, controller.signal, alive).then(value => { inFlight--; return value; }, error => {
      if (!(error instanceof JsonRpcCallError && error.code === PLUGIN_RPC_ERROR_CODES.TIMEOUT)) inFlight--;
      throw error;
    });
    try {
      const data = await Promise.race([pending, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Failure("cloudflare.timeout")); }, timeoutMs); })]);
      alive(); return { content: JSON.stringify(data), data };
    } catch (error) { return failure(error instanceof Failure ? error.rule : "cloudflare.unavailable"); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  });
}
export default definePlugin({ setup: async ctx => { register(ctx); } });
