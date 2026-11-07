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
  ["GET /accounts/{account_id}/workers/scripts", "cloudflare.workers.list"],
  ["GET /accounts/{account_id}/workers/scripts/{script_name}/secrets", "cloudflare.workers.secret_names"],
  ["GET /accounts/{account_id}/hyperdrive/configs", "cloudflare.hyperdrive.list"],
  ["GET /accounts/{account_id}/hyperdrive/configs/{hyperdrive_id}", "cloudflare.hyperdrive.get"],
  ["GET /accounts/{account_id}/d1/database", "cloudflare.d1.list"],
  ["GET /accounts/{account_id}/d1/database/{database_id}", "cloudflare.d1.get"],
  ["GET /accounts/{account_id}/r2/buckets", "cloudflare.r2.list"],
  ["GET /accounts/{account_id}/r2/buckets/{bucket_name}", "cloudflare.r2.get"],
  ["GET /zones/{zone_id}", "cloudflare.zones.get"],
  ["GET /zones/{zone_id}/dns_records", "cloudflare.dns.list"],
  ["GET /zones/{zone_id}/dns_records/{dns_record_id}", "cloudflare.dns.get"],
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
      const typedTool = descriptors.get(key) ?? null;
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
        tier: typedTool ? "read" : "unclassified",
        sideEffects: typedTool ? "metadata-read-only" : "unclassified",
        approvalRoute: typedTool ? "agent-and-resource-policy" : "unresolved",
        implementation: typedTool ? "descriptor-only" : "missing",
        review: "not-reviewed", enablement: "disabled",
        tests: typedTool ? ["test/cloudflare-provider.test.mjs"] : [],
        prerequisites: typedTool ? ["credential-scope-attestation", "compatible-reviewed-core", "native-integration-and-tier-review"] : ["credential-scope-attestation", "typed-adapter-and-tier-classification", "native-integration-and-tier-review"],
      });
    }
  }
  operations.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const keys = new Set(operations.map(operation => operation.key));
  if (keys.size !== operations.length || [...descriptors.keys()].some(key => !keys.has(key))) throw new Error("inventory identity mismatch");
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
