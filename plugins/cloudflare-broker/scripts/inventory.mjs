import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const source = Object.freeze({
  repository: "https://github.com/cloudflare/api-schemas",
  revision: "650bd71c22db3b938a4611bf4cc5afd896b400b7",
  url: "https://raw.githubusercontent.com/cloudflare/api-schemas/650bd71c22db3b938a4611bf4cc5afd896b400b7/openapi.json",
  sha256: "f4a13c74ffc7e9108a1e8b459c39c5e405f659f6b5e5b9a5a284f9039620a40c",
  openapi: "3.0.3",
  version: "4.0.0",
});
const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const descriptors = new Map([
  ["GET /accounts/{account_id}/access/apps", "cloudflare.access.applications.list"],
  ["GET /accounts/{account_id}/access/apps/{app_id}", "cloudflare.access.applications.get"],
  ["GET /accounts/{account_id}/access/apps/{app_id}/policies", "cloudflare.access.policies.list"],
  ["GET /accounts/{account_id}/access/apps/{app_id}/policies/{policy_id}", "cloudflare.access.policies.get"],
  ["GET /accounts/{account_id}/workers/domains", "cloudflare.workers.domains.list"],
  ["GET /accounts/{account_id}/workers/domains/{domain_id}", "cloudflare.workers.domains.get"],
  ["GET /accounts/{account_id}/workers/scripts", "cloudflare.workers.list"],
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/secrets", "cloudflare.workers.secret_names"],
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/deployments", "cloudflare.workers.deployments.list"],
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/deployments/{deployment_id}", "cloudflare.workers.deployments.get"],
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/versions", "cloudflare.workers.versions.list"],
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/versions/{version_id}", "cloudflare.workers.versions.get"],
  ["GET /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}", "cloudflare.workers.version_assets.get"],
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/settings", "cloudflare.workers.settings.get"],
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/subdomain", "cloudflare.workers.subdomain.get"],
  ["GET /accounts/{account_id}/hyperdrive/configs", "cloudflare.hyperdrive.list"],
  ["GET /accounts/{account_id}/hyperdrive/configs/{hyperdrive_id}", "cloudflare.hyperdrive.get"],
  ["GET /accounts/{account_id}/d1/database", "cloudflare.d1.list"],
  ["GET /accounts/{account_id}/d1/database/{database_id}", "cloudflare.d1.get"],
  ["GET /accounts/{account_id}/r2/buckets", "cloudflare.r2.list"],
  ["GET /accounts/{account_id}/r2/buckets/{bucket_name}", "cloudflare.r2.get"],
  ["GET /accounts/{account_id}/r2/buckets/{bucket_name}/lock", "cloudflare.r2.locks.get"],
  ["GET /accounts/{account_id}/r2/buckets/{bucket_name}/lifecycle", "cloudflare.r2.lifecycle.get"],
  ["GET /accounts/{account_id}/r2/buckets/{bucket_name}/domains/managed", "cloudflare.r2.managed_domain.get"],
  ["GET /accounts/{account_id}/secrets_store/stores", "cloudflare.secrets_store.stores.list"],
  ["GET /accounts/{account_id}/secrets_store/stores/{store_id}", "cloudflare.secrets_store.stores.get"],
  ["GET /accounts/{account_id}/secrets_store/stores/{store_id}/secrets", "cloudflare.secrets_store.secrets.list"],
  ["GET /accounts/{account_id}/secrets_store/stores/{store_id}/secrets/{secret_id}", "cloudflare.secrets_store.secrets.get"],
  ["GET /accounts/{account_id}/storage/kv/namespaces", "cloudflare.kv.namespaces.list"],
  ["GET /accounts/{account_id}/storage/kv/namespaces/{namespace_id}", "cloudflare.kv.namespaces.get"],
  ["GET /accounts/{account_id}/workers/durable_objects/namespaces", "cloudflare.durable_objects.namespaces.list"],
  ["GET /accounts/{account_id}/workers/durable_objects/namespaces/{id}/objects", "cloudflare.durable_objects.objects.list"],
  ["GET /accounts/{account_id}/queues", "cloudflare.queues.list"],
  ["GET /accounts/{account_id}/queues/{queue_id}", "cloudflare.queues.get"],
  ["GET /accounts/{account_id}/pages/projects", "cloudflare.pages.projects.list"],
  ["GET /accounts/{account_id}/pages/projects/{project_name}", "cloudflare.pages.projects.get"],
  ["GET /accounts/{account_id}/pages/projects/{project_name}/deployments", "cloudflare.pages.deployments.list"],
  ["GET /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}", "cloudflare.pages.deployments.get"],
  ["GET /zones/{zone_id}", "cloudflare.zones.get"],
  ["GET /zones/{zone_id}/dns_records", "cloudflare.dns.list"],
  ["GET /zones/{zone_id}/dns_records/{dns_record_id}", "cloudflare.dns.get"],
  ["GET /zones/{zone_id}/workers/routes", "cloudflare.workers.routes.list"],
  ["GET /zones/{zone_id}/workers/routes/{route_id}", "cloudflare.workers.routes.get"],
]);
const contentDescriptors = new Map([
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/content/v2", "cloudflare.workers.current_content.digest"],
]);
const deletionPlans = new Map([
  ["DELETE /accounts/{account_id}/workers/scripts/{script_name}", "cloudflare.workers.delete"],
  ["DELETE /accounts/{account_id}/hyperdrive/configs/{hyperdrive_id}", "cloudflare.hyperdrive.delete"],
  ["DELETE /accounts/{account_id}/d1/database/{database_id}", "cloudflare.d1.delete"],
  ["DELETE /accounts/{account_id}/r2/buckets/{bucket_name}", "cloudflare.r2.delete"],
  ["DELETE /zones/{zone_id}/dns_records/{dns_record_id}", "cloudflare.dns.delete"],
]);
const digest = value => createHash("sha256").update(value).digest("hex");

export function inventory(bytes) {
  if (digest(bytes) !== source.sha256) throw new Error("schema source digest mismatch");
  const schema = JSON.parse(bytes.toString("utf8"));
  if (schema.openapi !== source.openapi || schema.info.version !== source.version) throw new Error("schema version mismatch");
  const operations = [];
  for (const [path, item] of Object.entries(schema.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      if (typeof operation.operationId !== "string" || !Array.isArray(operation.tags)) throw new Error("unmapped schema operation");
      const key = `${method.toUpperCase()} ${path}`;
      const deletionPlan = deletionPlans.has(key);
      const contentDescriptor = contentDescriptors.has(key);
      const typedTool = descriptors.get(key) ?? contentDescriptors.get(key) ?? deletionPlans.get(key) ?? null;
      operations.push({
        key, operationId: operation.operationId, areas: operation.tags,
        typedTool,
        resourceParameters: [...new Set([...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]))],
        providerPermissions: operation["x-cfPermissionsRequired"] ?? null,
        providerTokenGroups: operation["x-api-token-group"] ?? null,
        providerSecurity: operation.security ?? schema.security ?? null,
        providerConfirmation: operation["x-forge-require-confirmation"] ?? null,
        providerPlanAvailability: operation["x-cfPlanAvailability"] ?? null,
        deprecated: operation.deprecated === true,
        requestShapeSha256: digest(JSON.stringify({ parameters: [...(item.parameters ?? []), ...(operation.parameters ?? [])], body: operation.requestBody ?? null })),
        responseShapeSha256: digest(JSON.stringify(operation.responses)),
        credentialScope: "unknown",
        tier: deletionPlan || contentDescriptor ? "reserved" : typedTool ? "read" : "unclassified",
        sideEffects: deletionPlan ? "destructive-production" : contentDescriptor ? "source-read-digest-only" : typedTool ? "metadata-read-only" : "unclassified",
        approvalRoute: deletionPlan ? "release-manager-and-conditional-owner-security" : contentDescriptor ? "exact-native-source-authorization-and-agent-resource-policy" : typedTool ? "agent-and-resource-policy" : "unresolved",
        implementation: deletionPlan ? "plan-descriptor-only" : contentDescriptor ? "content-descriptor-only" : typedTool ? "descriptor-only" : "missing",
        review: "not-reviewed", enablement: "disabled",
        tests: typedTool === "cloudflare.r2.managed_domain.get" ? ["test/cloudflare-provider.test.mjs", "test/cloudflare-r2-managed-domain.test.mjs"] : typedTool === "cloudflare.r2.lifecycle.get" ? ["test/cloudflare-provider.test.mjs", "test/cloudflare-r2-lifecycle.test.mjs"] : typedTool?.startsWith("cloudflare.workers.domains.") ? ["test/cloudflare-provider.test.mjs", "test/cloudflare-worker-domains.test.mjs"] : typedTool === "cloudflare.r2.get" || typedTool === "cloudflare.r2.locks.get" ? ["test/cloudflare-provider.test.mjs", "test/cloudflare-r2-eu.test.mjs"] : typedTool === "cloudflare.workers.version_assets.get" ? ["test/cloudflare-provider.test.mjs", "test/cloudflare-version-assets.test.mjs"] : typedTool?.startsWith("cloudflare.access.policies.") ? ["test/cloudflare-provider.test.mjs", "test/cloudflare-access-policies.test.mjs"] : typedTool?.startsWith("cloudflare.access.applications.") ? ["test/cloudflare-provider.test.mjs", "test/cloudflare-access.test.mjs"] : contentDescriptor ? ["test/cloudflare-current-content.test.mjs", "test/cloudflare-provider.test.mjs", "test/cloudflare-coverage-tiers.test.mjs"] : typedTool?.startsWith("cloudflare.workers.routes.") ? ["test/cloudflare-provider.test.mjs", "test/cloudflare-routes.test.mjs"] : typedTool ? ["test/cloudflare-provider.test.mjs"] : [],
        prerequisites: deletionPlan ? ["credential-scope-attestation", "compatible-reviewed-core", "native-conjunctive-authority-and-security-impact", "provider-precondition-and-recovery-adapter", "execution-and-projection-adapter", "native-integration-and-tier-review"] : contentDescriptor ? ["credential-scope-attestation", "compatible-reviewed-core", "separate-source-authorization", "bounded-content-transport-and-success-media-contract", "trusted-capture-window-and-response-correlation", "module-attribution-and-library-projection", "native-integration-and-tier-review"] : typedTool ? ["credential-scope-attestation", "compatible-reviewed-core", "native-integration-and-tier-review"] : ["credential-scope-attestation", "typed-adapter-and-tier-classification", "native-integration-and-tier-review"],
      });
    }
  }
  operations.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const keys = new Set(operations.map(operation => operation.key));
  if (keys.size !== operations.length || [...descriptors.keys(), ...contentDescriptors.keys(), ...deletionPlans.keys()].some(key => !keys.has(key))) throw new Error("inventory identity mismatch");
  return operations;
}

export async function writeInventory(schemaPath, destination) {
  const operations = inventory(await readFile(schemaPath));
  const bytes = operations.map(operation => JSON.stringify(operation)).join("\n") + "\n";
  await writeFile(destination, bytes);
  return { operations: operations.length, sha256: digest(bytes), descriptors: operations.filter(operation => operation.typedTool).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error("usage: node inventory.mjs <pinned-schema.json> <operations.jsonl>");
  console.log(JSON.stringify(await writeInventory(process.argv[2], process.argv[3])));
}
