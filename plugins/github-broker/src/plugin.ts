import { definePlugin, type PluginContext, type ToolRunContext } from "@paperclipai/plugin-sdk";
import { SdkNullBodyRevokeFailure, type Request, type Response } from "../../../packages/github/src/index.js";
import { Broker, tools } from "./broker.js";
import { Denied, type Host } from "./types.js";

// Timeouts abandon the await, not native IPC. Retain its slot until settlement.
// Healthy contention gets a bounded FIFO; detached operations close admission.
let hostInFlight = 0, hostDetached = 0;
const hostWaiters: (() => void)[] = [];
export async function hostCall<T>(action: () => Promise<T>, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  if (hostInFlight >= 4) {
    if (hostDetached > 0 || hostWaiters.length >= 4) throw new Denied("host.capacity");
    await new Promise<void>((resolve, reject) => {
      const wake = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        hostWaiters.splice(hostWaiters.indexOf(wake), 1);
        reject(new Denied("host.timeout"));
      }, timeoutMs);
      hostWaiters.push(wake);
    });
  } else hostInFlight++;
  let detached = false;
  const release = () => {
    if (detached) hostDetached--;
    const wake = hostWaiters.shift();
    if (wake) wake(); else hostInFlight--;
  };
  const remaining = deadline - Date.now();
  if (remaining <= 0) { release(); throw new Denied("host.timeout"); }
  const pending = Promise.resolve().then(action).finally(release);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { detached = true; hostDetached++; reject(new Denied("host.timeout")); }, remaining);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export function githubHttp(ctx: Pick<PluginContext, "http">, req: Request): Promise<Response> {
  return hostCall(async () => {
    // Host 2026.1023.0 uses a single DNS-pinned node:https request, never
    // follows redirects, has a 5s DNS + 30s request deadline and 200 MiB cap.
    // SDK drops redirect/signal; safety relies on that verified host contract.
    let res;
    try { res = await ctx.http.fetch(req.url, { method: req.method, headers: req.headers, ...(req.body === undefined ? {} : { body: req.body }) }); }
    catch (error) {
      if (error instanceof TypeError && error.message === "Response constructor: Invalid response status code 204" && req.method === "DELETE" && req.url === "https://api.github.com/installation/token") throw new SdkNullBodyRevokeFailure();
      throw error;
    }
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
  });
}

function hostFor(ctx: PluginContext, run: ToolRunContext): Host {
  return {
    config: () => hostCall(() => ctx.config.get(run.companyId)),
    issue: id => hostCall(() => ctx.issues.get(id, run.companyId)),
    workspace: (projectId, workspaceId) => hostCall(async () => (await ctx.projects.listWorkspaces(projectId, run.companyId)).find(w => w.id === workspaceId) ?? null),
    secret: (ref, companyId) => hostCall(() => ctx.secrets.resolve(ref, { companyId, configPath: "privateKeySecretRef" })),
    http: req => githubHttp(ctx, req),
    audit: record => hostCall(() => ctx.activity.log({ companyId: run.companyId, message: "github-broker.call", metadata: { ...record } })),
    clock: Date.now,
  };
}
export function register(ctx: PluginContext): void {
  const broker = new Broker();
  for (const tool of tools) ctx.tools.register(tool.name, { displayName: tool.name, description: `READ ONLY. ${tool.description}`, parametersSchema: tool.inputSchema }, async (args, run) => {
    // Gateway identity is the only identity source. Do not merge args into run.
    const result = await broker.execute(hostFor(ctx, run), tool.name, args, run);
    const content = result.content[0]!.text;
    const data = JSON.parse(content) as Record<string, unknown>;
    // The SDK uses `error` to cause native gateway/tool_invocations failure and
    // MCP isError=true. isError in `data` alone would incorrectly record success.
    return result.isError ? { error: String(data.rule), content, data } : { content, data };
  });
}
export default definePlugin({ setup: async ctx => { register(ctx); } });
