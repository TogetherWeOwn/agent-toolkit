import { closed, identifier, oneOf, requireThat, type Schema } from "../../../packages/core/src/schema.js";
import { deployBinding, deployNumber, deploymentState } from "./lifecycle.js";
import { flag, slug } from "./metadata.js";

function bindings<T extends { readonly id: string; readonly number: number }>(schema: Schema<T>): Schema<readonly T[]> {
  return { parse(value) {
    requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
    const parsed = value.map(item => schema.parse(item));
    requireThat(new Set(parsed.map(item => item.id)).size === parsed.length, "schema");
    requireThat(new Set(parsed.map(item => item.number)).size === parsed.length, "schema");
    return Object.freeze(parsed);
  } };
}
const childIds: Schema<readonly string[]> = { parse(value) {
  requireThat(Array.isArray(value) && value.length > 0 && value.length <= 32, "schema");
  const parsed = value.map(item => identifier.parse(item));
  requireThat(new Set(parsed).size === parsed.length, "schema");
  return Object.freeze(parsed);
} };

// Trusted response confinement, not permission to read a parent collection.
const deploymentBinding = closed({ id: identifier, number: deployNumber, intoBranch: slug });
const recommendationBinding = closed({ id: identifier, number: deployNumber });
export type DeploymentBinding = ReturnType<typeof deploymentBinding.parse>;
export type RecommendationBinding = ReturnType<typeof recommendationBinding.parse>;
export const deploymentScope = closed({ organization: slug, database: slug, deployment: deploymentBinding });
export const deployQueueScope = closed({ organization: slug, database: slug, deployments: bindings(deploymentBinding) });
export const deployChildScope = closed({ organization: slug, database: slug, request: deployBinding, childIds });
export const recommendationScope = closed({ organization: slug, database: slug, recommendation: recommendationBinding });
export const recommendationListScope = closed({ organization: slug, database: slug, recommendations: bindings(recommendationBinding) });

export interface DeploymentSummary {
  readonly id: string;
  readonly number: number;
  readonly intoBranch: string;
  readonly state: ReturnType<typeof deploymentState.parse>;
  readonly autoCutover: boolean;
  readonly autoDeleteBranch: boolean;
  readonly queuePaused: boolean;
}
export function deploymentSummary(body: Record<string, unknown>, allowed: readonly DeploymentBinding[]): DeploymentSummary {
  const id = identifier.parse(body.id);
  const number = deployNumber.parse(body.deploy_request_number);
  const binding = allowed.find(item => item.id === id && item.number === number);
  requireThat(binding && body.into_branch === binding.intoBranch, "scope");
  return Object.freeze({
    ...binding, state: deploymentState.parse(body.state), autoCutover: flag(body.auto_cutover),
    autoDeleteBranch: flag(body.auto_delete_branch), queuePaused: flag(body.queue_paused),
  });
}

function matchedChild(body: Record<string, unknown>, allowed: readonly string[]): string {
  const id = identifier.parse(body.id);
  requireThat(allowed.includes(id), "scope");
  return id;
}
const operationState = oneOf(["pending", "queued", "in_progress", "complete", "cancelled", "error"] as const);
export interface DeployOperationSummary {
  readonly id: string;
  readonly state: ReturnType<typeof operationState.parse>;
  readonly canDropData: boolean;
  readonly tableLocked: boolean;
}
export function deployOperationSummary(body: Record<string, unknown>, allowed: readonly string[]): DeployOperationSummary {
  return Object.freeze({ id: matchedChild(body, allowed), state: operationState.parse(body.state), canDropData: flag(body.can_drop_data), tableLocked: flag(body.table_locked) });
}

const reviewState = oneOf(["commented", "approved"] as const);
export interface DeployReviewSummary {
  readonly id: string;
  readonly providerState: ReturnType<typeof reviewState.parse>;
  readonly nativeApproval: "not-established";
}
export function deployReviewSummary(body: Record<string, unknown>, allowed: readonly string[]): DeployReviewSummary {
  // A provider review never substitutes for native exact-artifact approval.
  return Object.freeze({ id: matchedChild(body, allowed), providerState: reviewState.parse(body.state), nativeApproval: "not-established" });
}

const recommendationState = oneOf(["open", "applied", "dismissed", "stale"] as const);
const recommendationType = oneOf([
  "unused_table", "unused_index", "duplicate_index", "sequence_overflow", "sequence_overflow_foreign_key",
  "new_index", "encoding_upgrade", "bloated_table", "bloated_index",
] as const);
export interface RecommendationSummary {
  readonly id: string;
  readonly number: number;
  readonly state: ReturnType<typeof recommendationState.parse>;
  readonly recommendationType: ReturnType<typeof recommendationType.parse>;
}
export function recommendationSummary(body: Record<string, unknown>, allowed: readonly RecommendationBinding[]): RecommendationSummary {
  const id = identifier.parse(body.id);
  const number = deployNumber.parse(body.number);
  const binding = allowed.find(item => item.id === id && item.number === number);
  requireThat(binding, "scope");
  return Object.freeze({ ...binding, state: recommendationState.parse(body.state), recommendationType: recommendationType.parse(body.recommendation_type) });
}
