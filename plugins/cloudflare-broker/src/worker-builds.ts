import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const repositoryName = text(100, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const branchName = text(256, /^[A-Za-z0-9][A-Za-z0-9_./-]*$(?![\s\S])/);
const input = closed({ scriptTag: identifier });
type Row = Record<string, unknown>;
type Provider = "github" | "gitlab" | "gitlab_internal" | "origin";
type Repository = Readonly<{ provider: Provider; owner: string; name: string; branch: string }>;
export interface WorkerBuildScope {
  accountId: string;
  revision: string;
  workers?: readonly { scriptTag: string; repository: Repository }[];
}
interface BuildConfiguration {
  readonly scriptTag: string;
  readonly repository: Repository | "unavailable";
  readonly previewsEnabled: boolean | "unavailable";
  readonly subject: "configured-worker-build";
  readonly servingDeployment: "not-established";
  readonly productionConsumer: "not-established";
}
function object(value: unknown): Row {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "upstream");
  return value as Row;
}
function provider(value: unknown): Provider {
  requireThat(value === "github" || value === "gitlab" || value === "gitlab_internal" || value === "origin", "schema");
  return value;
}
function branch(value: unknown): string {
  const parsed = branchName.parse(value);
  requireThat(!parsed.includes("..") && !parsed.includes("//") && !parsed.endsWith("/") && !parsed.endsWith(".") && !parsed.endsWith(".lock"), "schema");
  return parsed;
}

export function workerBuildDescriptor(scope: WorkerBuildScope): MetadataDescriptor<ReturnType<typeof input.parse>, BuildConfiguration> {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  const workers = scope.workers ?? [];
  requireThat(Array.isArray(workers) && workers.length <= 100, "cap");
  const allowed = new Map<string, Repository>();
  for (const worker of workers) {
    requireThat(worker !== null && typeof worker === "object" && worker.repository !== null && typeof worker.repository === "object", "schema");
    const scriptTag = identifier.parse(worker.scriptTag);
    const repo = worker.repository;
    requireThat(!allowed.has(scriptTag), "schema");
    allowed.set(scriptTag, Object.freeze({ provider: provider(repo.provider), owner: repositoryName.parse(repo.owner),
      name: repositoryName.parse(repo.name), branch: branch(repo.branch) }));
  }
  function context(row: Row): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
  }
  const prepared = new WeakSet<object>();
  return Object.freeze({
    name: "cloudflare.workers.builds.configuration.get", version: "1", tier: "read", providerOperationId: "getWorkerBuild",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat(allowed.has(args.scriptTag), "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker-build:${args.scriptTag}`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/builds/workers/${args.scriptTag}`,
          maxResponseBytes: 131072, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const }) });
      prepared.add(value);
      return value;
    },
    project(raw: string, value: PreparedMetadata<ReturnType<typeof input.parse>>) {
      requireThat(prepared.has(value), "scope");
      requireThat(typeof raw === "string" && Buffer.byteLength(raw, "utf8") <= 131072, "cap");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { requireThat(false, "upstream"); }
      const body = object(parsed);
      context(body);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Object.hasOwn(body, "result"), "upstream");
      const row = object(body.result);
      context(row);
      requireThat(row.script_tag === value.arguments.scriptTag, "scope");
      const expected = allowed.get(value.arguments.scriptTag);
      requireThat(expected !== undefined, "scope");
      let repository: Repository | "unavailable" = "unavailable";
      if (row.git_repository !== undefined) {
        const repo = object(row.git_repository);
        // Missing fields mean unavailable, never no linkage. Any observed change refuses.
        for (const [key, selected] of [["provider_type", expected.provider], ["provider_account_name", expected.owner],
          ["repo_name", expected.name], ["branch", expected.branch]] as const) {
          requireThat(repo[key] === undefined || repo[key] === selected, "scope");
        }
        if (repo.provider_type !== undefined && repo.provider_account_name !== undefined && repo.repo_name !== undefined && repo.branch !== undefined) repository = expected;
      }
      requireThat(row.previews_enabled === undefined || typeof row.previews_enabled === "boolean", "upstream");
      return Object.freeze({ scriptTag: value.arguments.scriptTag, repository,
        previewsEnabled: row.previews_enabled === undefined ? "unavailable" as const : row.previews_enabled as boolean,
        subject: "configured-worker-build" as const, servingDeployment: "not-established" as const, productionConsumer: "not-established" as const });
    },
  });
}
