import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { closedJson as closed, idJson, tools } from "./schema.js";
const identity = { ...idJson, maxLength: 80 }, strings = { type: "array", maxItems: 32, uniqueItems: true, items: idJson };
const manifest: PaperclipPluginManifestV1 = {
  id: "togetherweown.cloudflare-broker", apiVersion: 1, version: "0.1.0", displayName: "Cloudflare Read Broker", author: "TogetherWeOwn", categories: ["automation"],
  description: "Deny-by-default per-agent Cloudflare metadata and log reads with a hidden credential.", minimumHostVersion: "2026.1106.0",
  capabilities: ["agent.tools.register", "http.outbound", "secrets.read-ref", "activity.log.write"],
  entrypoints: { worker: "./dist/plugins/cloudflare-broker/src/worker.js" },
  tools: tools.map(t => ({ name: t.name, displayName: t.name, description: "READ ONLY. Allowlisted Cloudflare metadata or bounded logs; rollouts currently unsupported.", parametersSchema: t.parametersSchema })),
  instanceConfigSchema: closed({ accountId: { type: "string", pattern: "^[a-f0-9]{32}$", maxLength: 32 }, apiTokenSecretRef: closed({ type: { const: "secret_ref" }, secretId: identity }),
    policy: closed({ version: { const: 1 }, companyId: identity, revision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      agents: { type: "array", maxItems: 32, items: closed({ agentId: identity, profile: { enum: ["read", "none"] }, workerScripts: strings, containerApplicationIds: strings }) } }) }),
};
export default manifest;
