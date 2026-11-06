import { definePlugin, type PluginContext, type ToolRunContext } from "@paperclipai/plugin-sdk";
import { Broker, tools } from "./broker.js";
import type { Host } from "./types.js";

function hostFor(ctx: PluginContext, run: ToolRunContext): Host {
  return {
    config: () => ctx.config.get(run.companyId),
    issue: id => ctx.issues.get(id, run.companyId),
    workspace: async (projectId, workspaceId) => (await ctx.projects.listWorkspaces(projectId, run.companyId)).find(w => w.id === workspaceId) ?? null,
    secret: (ref, companyId) => ctx.secrets.resolve(ref, { companyId, configPath: "privateKeySecretRef" }),
    http: async req => {
      // Host 2026.1023.0 uses a single DNS-pinned node:https request, never
      // follows redirects, has a 5s DNS + 30s request deadline and 200 MiB cap.
      // SDK drops redirect/signal; safety here relies on that verified host
      // contract, NOT on ignored fetch options. Broker rejects >1 MiB bodies.
      const res = await ctx.http.fetch(req.url, { method: req.method, headers: req.headers, ...(req.body === undefined ? {} : { body: req.body }) });
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
    },
    audit: record => ctx.activity.log({ companyId: run.companyId, message: "github-broker.call", metadata: { ...record } }),
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
