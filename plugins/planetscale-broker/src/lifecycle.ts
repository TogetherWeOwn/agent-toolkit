import { closed, identifier, integer, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { flag, slug } from "./metadata.js";

const ids: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };
const deployNumber = integer(1, 2147483647);
const deployBinding = closed({ id: identifier, number: deployNumber, branch: slug, branchId: identifier, intoBranch: slug });
export type DeployBinding = ReturnType<typeof deployBinding.parse>;
const deployBindings: Schema<readonly DeployBinding[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => deployBinding.parse(item));
  requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
  requireThat(new Set(parsed.map(item => item.number)).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Broker-owned response bindings, never caller selectors or collection authority.
export const backupListScope = closed({ organization: slug, database: slug, branch: slug, backupIds: ids });
export const backupScope = closed({ organization: slug, database: slug, branch: slug, backupId: identifier });
export const backupPolicyListScope = closed({ organization: slug, database: slug, policyIds: ids });
export const backupPolicyScope = closed({ organization: slug, database: slug, policyId: identifier });
export const deployRequestListScope = closed({ organization: slug, database: slug, requests: deployBindings });
export const deployRequestScope = closed({ organization: slug, database: slug, request: deployBinding });

function matchedId(body: Record<string, unknown>, allowed: readonly string[]): string {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return id;
}

export interface BackupSummary {
  readonly id: string;
  readonly state: "pending" | "running" | "success" | "failed" | "canceled" | "ignored";
  readonly protected: boolean;
  readonly required: boolean;
  readonly emergency: boolean;
}
export function backupSummary(body: Record<string, unknown>, allowed: readonly string[]): BackupSummary {
  return Object.freeze({
    id: matchedId(body, allowed),
    state: oneOf(["pending", "running", "success", "failed", "canceled", "ignored"] as const).parse(body.state),
    protected: flag(body.protected), required: flag(body.required), emergency: flag(body.emergency),
  });
}

export interface BackupPolicySummary {
  readonly id: string;
  readonly target: "production" | "development";
  readonly required: boolean;
}
export function backupPolicySummary(body: Record<string, unknown>, allowed: readonly string[]): BackupPolicySummary {
  // Schedule/retention strings and user-provided names are intentionally omitted.
  return Object.freeze({ id: matchedId(body, allowed), target: oneOf(["production", "development"] as const).parse(body.target), required: flag(body.required) });
}

export interface DeployRequestSummary {
  readonly id: string;
  readonly number: number;
  readonly branch: string;
  readonly branchId: string;
  readonly intoBranch: string;
  readonly state: "open" | "closed";
  readonly deploymentState: string;
  readonly branchDeleted: boolean;
}
export function deployRequestSummary(body: Record<string, unknown>, allowed: readonly DeployBinding[]): DeployRequestSummary {
  const id = identifier.parse(body.id);
  const number = deployNumber.parse(body.number);
  const binding = allowed.find(item => item.id === id && item.number === number);
  requireThat(binding && body.branch === binding.branch && body.branch_id === binding.branchId && body.into_branch === binding.intoBranch, "scope");
  return Object.freeze({
    ...binding, state: oneOf(["open", "closed"] as const).parse(body.state),
    deploymentState: oneOf([
      "pending", "ready", "no_changes", "queued", "submitting", "in_progress", "pending_cutover",
      "in_progress_vschema", "in_progress_cancel", "in_progress_cutover", "complete", "complete_cancel",
      "complete_error", "complete_pending_revert", "in_progress_revert", "in_progress_revert_vschema",
      "complete_revert", "complete_revert_error", "cancelled", "error",
    ] as const).parse(body.deployment_state), branchDeleted: flag(body.branch_deleted),
  });
}
