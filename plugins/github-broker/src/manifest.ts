import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { tools } from "./broker.js";

const numericId = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const identity = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 };
function closed(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
}
const repository = closed({ id: numericId, owner: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9-]*$", maxLength: 39 }, name: { type: "string", pattern: "^[A-Za-z0-9_][A-Za-z0-9_.-]*$", maxLength: 100 }, projectId: identity, workspaceId: identity });
const agentProperties = { agentId: identity, identityLane: { enum: ["app", "owner"], description: "app is the only credential lane; owner is always refused." }, profile: { enum: ["builder", "lead", "reviewer-read", "release", "coordinator-read", "none"] }, repositoryIds: { type: "array", maxItems: 32, uniqueItems: true, items: numericId } };
const agent = { ...closed(agentProperties), properties: { ...agentProperties, branchSlug: { type: "string", pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$", maxLength: 63, description: "Optional unique board-bound slug; required for writes to agent/<slug>/* branches. Never supplied by the caller." } } };
const manifest: PaperclipPluginManifestV1 = {
  id: "togetherweown.github-broker", apiVersion: 1, version: "0.1.0", displayName: "GitHub App Broker",
  description: "Scoped GitHub reads and narrow Builder-only App writes with deny-by-default per-agent policy. Source only; operational acceptance required.",
  author: "TogetherWeOwn", categories: ["automation"], minimumHostVersion: "2026.1023.0",
  capabilities: ["agent.tools.register", "issues.read", "projects.read", "project.workspaces.read", "http.outbound", "secrets.read-ref", "activity.log.write"],
  entrypoints: { worker: "./dist/plugins/github-broker/src/worker.js" },
  tools: tools.map(t => ({ name: t.name, displayName: t.name, description: `${t.write ? "APP-ONLY BUILDER WRITE." : "READ ONLY."} ${t.description}`, parametersSchema: t.inputSchema })),
  instanceConfigSchema: closed({ appId: numericId, installationId: numericId, privateKeySecretRef: closed({ type: { const: "secret_ref" }, secretId: identity }),
    policy: closed({ version: { const: 1 }, companyId: identity, revision: numericId,
      repositories: { type: "array", maxItems: 32, items: repository }, agents: { type: "array", maxItems: 32, items: agent } }) }),
};
export default manifest;
