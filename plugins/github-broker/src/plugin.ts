import { definePlugin, type PluginContext, type ToolRunContext } from "@paperclipai/plugin-sdk";
import { Broker, tools } from "./broker.js";
import { Denied, type Host } from "./types.js";

// Timeouts abandon the await, not native IPC. Keep its worker-wide slot until
// the actual operation settles, including late resolution or rejection.
let hostInFlight = 0;
export async function hostCall<T>(action: () => Promise<T>, timeoutMs = 30000): Promise<T> {
  if (hostInFlight >= 4) throw new Denied("host.capacity");
  hostInFlight++;
  const pending = Promise.resolve().then(action).finally(() => { hostInFlight--; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Denied("host.timeout")), timeoutMs);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function hostFor(ctx: PluginContext, run: ToolRunContext): Host {
  return {
    config: () => hostCall(() => ctx.config.get(run.companyId)),
    issue: id => hostCall(() => ctx.issues.get(id, run.companyId)),
    workspace: (projectId, workspaceId) => hostCall(async () => (await ctx.projects.listWorkspaces(projectId, run.companyId)).find(w => w.id === workspaceId) ?? null),
    secret: (ref, companyId) => hostCall(() => ctx.secrets.resolve(ref, { companyId, configPath: "privateKeySecretRef" })),
    http: async req => {
      // Host 2026.1023.0 uses a single DNS-pinned node:https request, never
      // follows redirects, has a 5s DNS + 30s request deadline and 200 MiB cap.
      // SDK drops redirect/signal; safety here relies on that verified host
      // contract, NOT on ignored fetch options. Broker rejects >1 MiB bodies.
      const res = await ctx.http.fetch(req.url, { method: req.method, headers: req.headers, ...(req.body === undefined ? {} : { body: req.body }) });
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
    },
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
