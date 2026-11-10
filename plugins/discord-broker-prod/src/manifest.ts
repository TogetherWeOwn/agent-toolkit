import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { toolsFor } from "../../../packages/discord/src/tools.js";

const snowflake = { type: "string", pattern: "^[0-9]{17,20}$", maxLength: 20 };
const identity = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 };
function closed(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
}
const agent = closed({ agentId: identity, profile: { enum: ["builder", "lead", "researcher-read", "reviewer-read", "none"] }, allowProjectless: { type: "boolean" } } as unknown as Record<string, unknown>);
const manifest: PaperclipPluginManifestV1 = {
  id: "togetherweown.discord-broker-prod", apiVersion: 1, version: "0.1.0", displayName: "Discord Prod Broker",
  description: "Scoped Discord tools for TogetherWeOwn (tier 1 read only at first) with a hidden bot token and deny-by-default per-agent policy.",
  author: "TogetherWeOwn", categories: ["automation"], minimumHostVersion: "2026.1023.0",
  capabilities: ["agent.tools.register", "issues.read", "projects.read", "project.workspaces.read", "http.outbound", "secrets.read-ref", "activity.log.write", "plugin.state.read", "plugin.state.write"],
  entrypoints: { worker: "./dist/plugins/discord-broker-prod/src/worker.js" },
  tools: toolsFor("prod").map(t => ({ name: t.name, displayName: t.name, description: `${t.tier === "read" ? "READ" : "WRITE"}. ${t.description}`, parametersSchema: t.inputSchema })),
  instanceConfigSchema: closed({
    environment: { const: "prod" }, guildId: snowflake, botUserId: snowflake,
    botTokenSecretRef: closed({ type: { const: "secret_ref" }, secretId: identity }),
    policy: closed({ version: { const: 1 }, companyId: identity, revision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      agents: { type: "array", maxItems: 64, items: closed({ agentId: identity, profile: { enum: ["builder", "lead", "researcher-read", "reviewer-read", "none"] }, allowProjectless: { type: "boolean" } }) },
      readChannelIds: { type: "array", maxItems: 200, items: snowflake }, writeChannelIds: { type: "array", maxItems: 200, items: snowflake } }),
  }),
};
export default manifest;
