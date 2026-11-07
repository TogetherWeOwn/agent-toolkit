import { closed, digest, identifier, integer, requireThat } from "../../../packages/core/src/schema.js";
import { branchPath, branchScope, emptyArguments, flag, slug } from "./metadata.js";

// Preview-only artifacts. No execute/project hook, authority token, credential or
// runtime registration is supplied. Trusted bindings must come from the host.
const targetSchema = closed({
  organization: slug, database: slug, branch: slug,
  branchId: identifier, revision: digest,
  production: { parse: flag }, deletionProtected: { parse: flag }, safeMigrations: { parse: flag },
});
export type BranchPlanTarget = ReturnType<typeof targetSchema.parse>;
export type MutationOperation = "delete_branch" | "create_backup" | "disable_safe_migrations";
export type PlanAuthority = "release-manager" | "owner-money" | "owner-security";
export interface MutationPlan {
  readonly kind: "validated-local-plan-not-provider-dry-run";
  readonly operationId: MutationOperation;
  readonly tool: string;
  readonly tier: "reserved";
  readonly target: BranchPlanTarget;
  readonly arguments: Readonly<Record<string, string | number>>;
  readonly proposedRequest: Readonly<{
    method: "POST" | "DELETE";
    origin: "https://api.planetscale.com";
    path: string;
    body: Readonly<Record<string, string | number | boolean>> | null;
  }>;
  readonly requiredAuthorities: readonly PlanAuthority[];
  readonly effect: "delete-one-branch" | "create-bounded-backup" | "remove-migration-safety";
  readonly execution: "not-implemented";
  readonly remotePreconditions: "not-verified";
  readonly providerDryRun: "not-performed";
}

function target(raw: unknown): BranchPlanTarget {
  return targetSchema.parse(raw);
}
function path(scope: BranchPlanTarget): string {
  return branchPath(branchScope.parse({ organization: scope.organization, database: scope.database, branch: scope.branch }));
}
function plan(
  scope: BranchPlanTarget, operationId: MutationOperation, args: MutationPlan["arguments"],
  request: MutationPlan["proposedRequest"], effect: MutationPlan["effect"], authorities: readonly PlanAuthority[],
): MutationPlan {
  return Object.freeze({
    kind: "validated-local-plan-not-provider-dry-run" as const,
    operationId, tool: `planetscale.${operationId}`, tier: "reserved" as const,
    target: scope, arguments: Object.freeze(args),
    proposedRequest: Object.freeze({ ...request, body: request.body === null ? null : Object.freeze(request.body) }),
    requiredAuthorities: Object.freeze([...authorities]), effect,
    execution: "not-implemented" as const, remotePreconditions: "not-verified" as const,
    providerDryRun: "not-performed" as const,
  });
}

export function prepareDeleteBranch(rawScope: unknown, rawArguments: unknown): MutationPlan {
  const scope = target(rawScope);
  emptyArguments.parse(rawArguments);
  requireThat(!scope.deletionProtected, "scope");
  return plan(scope, "delete_branch", {}, {
    method: "DELETE", origin: "https://api.planetscale.com",
    path: `${path(scope)}?delete_descendants=false`, body: null,
  }, "delete-one-branch", ["release-manager"]);
}

const backupArguments = closed({ name: slug, retentionHours: integer(1, 24) });
export function prepareCreateBackup(rawScope: unknown, rawArguments: unknown): MutationPlan {
  const scope = target(rawScope);
  const args = backupArguments.parse(rawArguments);
  return plan(scope, "create_backup", args, {
    method: "POST", origin: "https://api.planetscale.com", path: `${path(scope)}/backups`,
    body: { name: args.name, retention_unit: "hour", retention_value: args.retentionHours, emergency: false },
  }, "create-bounded-backup", ["release-manager", "owner-money"]);
}

export function prepareDisableSafeMigrations(rawScope: unknown, rawArguments: unknown): MutationPlan {
  const scope = target(rawScope);
  emptyArguments.parse(rawArguments);
  requireThat(scope.safeMigrations, "scope");
  return plan(scope, "disable_safe_migrations", {}, {
    method: "DELETE", origin: "https://api.planetscale.com", path: `${path(scope)}/safe-migrations`, body: null,
  }, "remove-migration-safety", ["release-manager", "owner-security"]);
}
