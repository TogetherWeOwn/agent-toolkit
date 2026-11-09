import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, PreparedMetadata } from "./metadata.js";

const identifier = text(32, /^[a-f0-9]{32}$(?![\s\S])/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const label = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const repositoryName = text(100, /^[A-Za-z0-9][A-Za-z0-9_.-]*$(?![\s\S])/);
const pattern = text(256, /^[A-Za-z0-9_*][A-Za-z0-9_*./-]*$(?![\s\S])/);
const input = closed({ scriptTag: identifier });
type Row = Record<string, unknown>;
type Provider = "github" | "gitlab" | "gitlab_internal" | "origin";
type Repository = Readonly<{ provider: Provider; owner: string; name: string }>;
type Selection = Readonly<{ id: string; repository: Repository; branchIncludes: readonly string[]; branchExcludes: readonly string[] }>;
export interface BuildTriggerScope {
  accountId: string;
  revision: string;
  workers?: readonly { scriptTag: string; triggers: readonly Selection[] }[];
}
interface Trigger {
  readonly id: string;
  readonly repository: Repository | "unavailable";
  readonly branchIncludes: readonly string[] | "unavailable";
  readonly branchExcludes: readonly string[] | "unavailable";
}
interface TriggerList {
  readonly scriptTag: string;
  readonly triggers: readonly Trigger[];
  readonly complete: false;
  readonly subject: "configured-worker-build-triggers";
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
function patterns(value: unknown): readonly string[] {
  requireThat(Array.isArray(value) && value.length <= 100, "cap");
  const result = value.map((item: unknown) => {
    const parsed = pattern.parse(item);
    requireThat(!parsed.includes("..") && !parsed.includes("//") && !parsed.endsWith("/"), "schema");
    return parsed;
  });
  requireThat(new Set(result).size === result.length, "schema");
  return Object.freeze(result);
}

export function buildTriggerDescriptor(scope: BuildTriggerScope): MetadataDescriptor<ReturnType<typeof input.parse>, TriggerList> {
  const account = identifier.parse(scope.accountId);
  const revision = label.parse(scope.revision);
  const workers = scope.workers ?? [];
  requireThat(Array.isArray(workers) && workers.length <= 100, "cap");
  const allowed = new Map<string, Map<string, Selection>>();
  for (const worker of workers) {
    requireThat(worker !== null && typeof worker === "object", "schema");
    const scriptTag = identifier.parse(worker.scriptTag);
    requireThat(!allowed.has(scriptTag), "schema");
    requireThat(Array.isArray(worker.triggers) && worker.triggers.length <= 100, "cap");
    const triggers = new Map<string, Selection>();
    for (const trigger of worker.triggers) {
      requireThat(trigger !== null && typeof trigger === "object" && trigger.repository !== null && typeof trigger.repository === "object", "schema");
      const id = uuid.parse(trigger.id);
      requireThat(!triggers.has(id), "schema");
      triggers.set(id, Object.freeze({ id, repository: Object.freeze({ provider: provider(trigger.repository.provider),
        owner: repositoryName.parse(trigger.repository.owner), name: repositoryName.parse(trigger.repository.name) }),
        branchIncludes: patterns(trigger.branchIncludes), branchExcludes: patterns(trigger.branchExcludes) }));
    }
    allowed.set(scriptTag, triggers);
  }
  function context(row: Row, scriptTag: string): void {
    requireThat(row.account_id === undefined || row.account_id === account, "scope");
    requireThat(row.external_script_id === undefined || row.external_script_id === scriptTag, "scope");
  }
  function selectedPatterns(raw: unknown, expected: readonly string[]): readonly string[] | "unavailable" {
    if (raw === undefined) return "unavailable";
    const observed = patterns(raw);
    requireThat(observed.length === expected.length && observed.every(value => expected.includes(value)), "scope");
    return expected;
  }
  const prepared = new WeakSet<object>();
  return Object.freeze({
    name: "cloudflare.workers.builds.triggers.list", version: "1", tier: "read", providerOperationId: "listTriggersByScript",
    prepare(raw: unknown) {
      const args = input.parse(raw);
      requireThat((allowed.get(args.scriptTag)?.size ?? 0) > 0, "scope");
      const value = Object.freeze({ arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker-build:${args.scriptTag}:triggers`, revision }),
        request: Object.freeze({ method: "GET" as const, path: `/accounts/${account}/builds/workers/${args.scriptTag}/triggers`,
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
      context(body, value.arguments.scriptTag);
      requireThat(body.success === true && Array.isArray(body.errors) && body.errors.length === 0 && Array.isArray(body.result), "upstream");
      requireThat(body.result.length <= 1000, "cap");
      const selections = allowed.get(value.arguments.scriptTag)!;
      const seen = new Set<string>();
      const triggers: Trigger[] = [];
      for (const item of body.result) {
        const row = object(item);
        context(row, value.arguments.scriptTag);
        const id = uuid.parse(row.trigger_uuid);
        const expected = selections.get(id);
        if (expected === undefined) continue;
        requireThat(!seen.has(id) && row.external_script_id === value.arguments.scriptTag, "scope");
        seen.add(id);
        let repository: Repository | "unavailable" = "unavailable";
        if (row.repo_connection !== undefined) {
          const repo = object(row.repo_connection);
          context(repo, value.arguments.scriptTag);
          for (const [key, selected] of [["provider_type", expected.repository.provider], ["provider_account_name", expected.repository.owner],
            ["repo_name", expected.repository.name]] as const) requireThat(repo[key] === undefined || repo[key] === selected, "scope");
          if (repo.provider_type !== undefined && repo.provider_account_name !== undefined && repo.repo_name !== undefined) repository = expected.repository;
        }
        triggers.push(Object.freeze({ id, repository, branchIncludes: selectedPatterns(row.branch_includes, expected.branchIncludes),
          branchExcludes: selectedPatterns(row.branch_excludes, expected.branchExcludes) }));
      }
      const out = Object.freeze({ scriptTag: value.arguments.scriptTag, triggers: Object.freeze(triggers), complete: false as const,
        subject: "configured-worker-build-triggers" as const, servingDeployment: "not-established" as const, productionConsumer: "not-established" as const });
      requireThat(Buffer.byteLength(JSON.stringify(out), "utf8") <= 32768, "cap");
      return out;
    },
  });
}
