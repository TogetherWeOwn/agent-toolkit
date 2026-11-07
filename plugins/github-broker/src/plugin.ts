import { definePlugin, JsonRpcCallError, PLUGIN_RPC_ERROR_CODES, type PluginContext, type ToolRunContext } from "@paperclipai/plugin-sdk";
import { SdkNullBodyRevokeFailure, type Request, type Response } from "../../../packages/github/src/index.js";
import { Broker, tools } from "./broker.js";
import { Denied, type Host } from "./types.js";

// Await expiry is not cancellation. An SDK rejection may precede native
// settlement: quarantine that reservation for this worker, never recycle by time.
// Healthy contention gets a bounded FIFO; detached/uncertain work closes admission.
export function createHostCaller() {
  let hostInFlight = 0, hostDetached = 0;
  const hostWaiters: (() => void)[] = [];
  return async function call<T>(action: (settled: () => void) => Promise<T>, timeoutMs = 30000, absoluteDeadline = Infinity): Promise<T> {
    const deadline = Math.min(performance.now() + timeoutMs, absoluteDeadline);
    const remaining = () => deadline - performance.now();
    if (remaining() <= 0) throw new Denied("host.timeout");
    if (hostInFlight >= 4) {
      if (hostDetached > 0 || hostWaiters.length >= 4) throw new Denied("host.capacity");
      await new Promise<void>((resolve, reject) => {
        const wake = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          const index = hostWaiters.indexOf(wake);
          if (index >= 0) hostWaiters.splice(index, 1);
          reject(new Denied("host.timeout"));
        }, remaining());
        hostWaiters.push(wake);
      });
    } else hostInFlight++;
    let detached = false, emitted = false, settled = false, released = false;
    const detach = () => { if (!detached && !released) { detached = true; hostDetached++; } };
    const release = () => {
      if (released) return;
      released = true;
      if (detached) hostDetached--;
      const wake = hostWaiters.shift();
      if (wake) wake(); else hostInFlight--;
    };
    if (remaining() <= 0) { release(); throw new Denied("host.timeout"); }
    const pending = Promise.resolve().then(() => {
      // A FIFO wake or event-loop stall must not dispatch an expired operation.
      if (remaining() <= 0) throw new Denied("host.timeout");
      emitted = true;
      return action(() => { settled = true; });
    }).then(value => { release(); return value; }, error => {
      // In this pinned SDK, only its TIMEOUT code is a locally synthesized
      // JsonRpcCallError; other instances arrive in completed host responses.
      const hostReplied = error instanceof JsonRpcCallError && error.code !== PLUGIN_RPC_ERROR_CODES.TIMEOUT;
      if (!emitted || settled || hostReplied) release(); else detach();
      throw error;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { detach(); reject(new Denied("host.timeout")); }, Math.max(0, remaining()));
      })]);
      if (remaining() <= 0) throw new Denied("host.timeout");
      return value;
    } finally { if (timer !== undefined) clearTimeout(timer); }
  };
}
export const hostCall = createHostCaller();

export function githubHttp(ctx: Pick<PluginContext, "http">, req: Request, deadline?: number, call = hostCall, onDispatch?: () => void): Promise<Response> {
  return call(async settled => {
    // Host 2026.1023.0 uses a single DNS-pinned node:https request, never
    // follows redirects, has a 5s DNS + 30s request deadline and 200 MiB cap.
    // SDK drops redirect/signal; safety relies on that verified host contract.
    let res;
    try { onDispatch?.(); } catch (error) { settled(); throw error; } // Local refusal emitted no RPC.
    try { res = await ctx.http.fetch(req.url, { method: req.method, headers: req.headers, ...(req.body === undefined ? {} : { body: req.body }) }); }
    catch (error) {
      // These exact reconstruction failures occur only after a host response.
      // Other rejections (including the SDK's own timeout) prove no settlement.
      if (error instanceof TypeError && /^Response constructor: Invalid response status code (204|205|304)$/.test(error.message)) settled();
      if (error instanceof TypeError && error.message === "Response constructor: Invalid response status code 204" && req.method === "DELETE" && req.url === "https://api.github.com/installation/token") throw new SdkNullBodyRevokeFailure();
      throw error;
    }
    const receivedAt = performance.now(); // Before body handling; part of the recovery window.
    settled();
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text(), receivedAt };
  }, 30000, deadline);
}

function hostFor(ctx: PluginContext, run: ToolRunContext, call: typeof hostCall): Host {
  return {
    config: () => call(() => ctx.config.get(run.companyId)),
    issue: id => call(() => ctx.issues.get(id, run.companyId)),
    workspace: (projectId, workspaceId) => call(async () => (await ctx.projects.listWorkspaces(projectId, run.companyId)).find(w => w.id === workspaceId) ?? null),
    secret: (ref, companyId) => call(() => ctx.secrets.resolve(ref, { companyId, configPath: "privateKeySecretRef" })),
    http: (req, deadline, onDispatch) => githubHttp(ctx, req, deadline, call, onDispatch),
    audit: record => call(() => ctx.activity.log({ companyId: run.companyId, message: "github-broker.call", metadata: { ...record } })),
    clock: Date.now,
  };
}
export function register(ctx: PluginContext, call = createHostCaller()): void {
  const broker = new Broker();
  for (const tool of tools) ctx.tools.register(tool.name, { displayName: tool.name, description: `READ ONLY. ${tool.description}`, parametersSchema: tool.inputSchema }, async (args, run) => {
    // Gateway identity is the only identity source. Do not merge args into run.
    const result = await broker.execute(hostFor(ctx, run, call), tool.name, args, run);
    const content = result.content[0]!.text;
    const data = JSON.parse(content) as Record<string, unknown>;
    // The SDK uses `error` to cause native gateway/tool_invocations failure and
    // MCP isError=true. isError in `data` alone would incorrectly record success.
    return result.isError ? { error: String(data.rule), content, data } : { content, data };
  });
}
export default definePlugin({ setup: async ctx => { register(ctx); } });
