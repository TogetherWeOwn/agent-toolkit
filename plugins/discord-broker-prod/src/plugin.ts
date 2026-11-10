import { definePlugin, JsonRpcCallError, PLUGIN_RPC_ERROR_CODES, type PluginContext, type ToolRunContext } from "@paperclipai/plugin-sdk";
import type { Request, Response } from "../../../packages/discord/src/index.js";
import { Broker, toolsFor } from "./broker.js";
import { Denied } from "./types.js";

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
        const timer = setTimeout(() => { const i = hostWaiters.indexOf(wake); if (i >= 0) hostWaiters.splice(i, 1); reject(new Denied("host.timeout")); }, remaining());
        hostWaiters.push(wake);
      });
    } else hostInFlight++;
    let detached = false, emitted = false, settled = false, released = false;
    const detach = () => { if (!detached && !released) { detached = true; hostDetached++; } };
    const release = () => { if (released) return; released = true; if (detached) hostDetached--; const w = hostWaiters.shift(); if (w) w(); else hostInFlight--; };
    if (remaining() <= 0) { release(); throw new Denied("host.timeout"); }
    const pending = Promise.resolve().then(() => { if (remaining() <= 0) throw new Denied("host.timeout"); emitted = true; return action(() => { settled = true; }); }).then(v => { release(); return v; }, e => { const hostReplied = e instanceof JsonRpcCallError && e.code !== PLUGIN_RPC_ERROR_CODES.TIMEOUT; if (!emitted || settled || hostReplied) release(); else detach(); throw e; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { const v = await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => { detach(); reject(new Denied("host.timeout")); }, Math.max(0, remaining())); })]); if (remaining() <= 0) throw new Denied("host.timeout"); return v; } finally { if (timer !== undefined) clearTimeout(timer); }
  };
}
export const hostCall = createHostCaller();

export function discordHttp(ctx: Pick<PluginContext, "http">, req: Request, deadline?: number, call = hostCall, onDispatch?: () => void): Promise<Response> {
  return call(async settled => {
    let res;
    try { onDispatch?.(); } catch (e) { settled(); throw e; }
    try { res = await ctx.http.fetch(req.url, { method: req.method, headers: req.headers, ...(req.body === undefined ? {} : { body: req.body }) }); }
    catch (e) { if (e instanceof TypeError && /^Response constructor: Invalid response status code (204|205|304)$/.test(e.message)) settled(); throw e; }
    const receivedAt = performance.now();
    settled();
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text(), receivedAt };
  }, 30000, deadline);
}
function hostFor(ctx: PluginContext, run: ToolRunContext, call: typeof hostCall) {
  return {
    config: () => call(() => ctx.config.get(run.companyId)),
    issue: (id: string) => call(() => ctx.issues.get(id, run.companyId)),
    workspace: (projectId: string, workspaceId: string) => call(async () => (await ctx.projects.listWorkspaces(projectId, run.companyId)).find(w => w.id === workspaceId) ?? null),
    secret: (ref: { type: "secret_ref"; secretId: string }, companyId: string) => call(() => ctx.secrets.resolve(ref as never, { companyId, configPath: "botTokenSecretRef" })),
    http: (req: Request, deadline?: number, onDispatch?: () => void) => discordHttp(ctx, req, deadline, call, onDispatch),
    kvGet: (key: string) => call(() => ctx.state.get({ scopeKind: "instance", stateKey: `discord:${key}` })),
    kvSet: (key: string, value: unknown) => call(() => ctx.state.set({ scopeKind: "instance", stateKey: `discord:${key}` }, value)),
    audit: (record: Record<string, unknown>) => call(() => ctx.activity.log({ companyId: run.companyId, message: "discord-broker.call", metadata: { ...record } })),
    clock: Date.now,
  };
}
export function register(ctx: PluginContext, call = createHostCaller()): void {
  const broker = new Broker();
  for (const tool of toolsFor("prod")) ctx.tools.register(tool.name, { displayName: tool.name, description: `${tool.tier === "read" ? "READ" : "WRITE"}. ${tool.description}`, parametersSchema: tool.inputSchema }, async (args, run) => {
    const result = await broker.execute(hostFor(ctx, run, call), "prod", tool.name, args, run);
    const content = result.content[0]!.text;
    const data = JSON.parse(content) as Record<string, unknown>;
    return result.isError ? { error: String(data.rule), content, data } : { content, data };
  });
}
export default definePlugin({ setup: async ctx => { register(ctx); } });
