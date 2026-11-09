import { requireThat, text } from "../../../packages/core/src/index.js";
import { canonicalHash, PROVIDER_CONTRACT, type AuthorizationTarget, type Json, type ProviderAuditRecord } from "../../../packages/core/src/provider/index.js";
import { summarizePagesCoverage, summarizePagesInventoryCoverage, type PagesCoverageObservation, type PagesCoverageScope } from "./pages-coverage.js";

export interface PagesRecordedCoverageScope extends PagesCoverageScope {
  readonly principalHash: string;
  readonly policyRevision: string;
  /** Required for deployment lists: request names are distinct from resource IDs. */
  readonly deploymentProjectName?: string;
}
export interface PagesRecordedObservation extends PagesCoverageObservation {
  readonly target: AuthorizationTarget;
  readonly arguments: Json;
  readonly audit: readonly ProviderAuditRecord[];
  /** Caller-supplied snapshot, NOT a read or durability guarantee of the journal. */
  readonly journal: { readonly event: string; readonly targetHash: string; readonly outcome: string };
}

const digest = text(64, /^[a-f0-9]{64}$/);
function object(value: unknown): Record<string, unknown> {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "schema");
  return value as Record<string, unknown>;
}

// Join supplied records only. Authentication, durable storage, complete record
// retrieval and current policy/provider qualification remain caller obligations.
export function summarizePagesRecordedCoverage(scope: PagesRecordedCoverageScope, observations: readonly PagesRecordedObservation[]) {
  return joinRecordedCoverage(scope, observations, summarizePagesCoverage(scope, observations));
}
export function summarizePagesInventoryRecordedCoverage(scope: PagesRecordedCoverageScope, observations: readonly PagesRecordedObservation[]) {
  return joinRecordedCoverage(scope, observations, summarizePagesInventoryCoverage(scope, observations));
}

function joinRecordedCoverage<T extends ReturnType<typeof summarizePagesCoverage> | ReturnType<typeof summarizePagesInventoryCoverage>>(
  scope: PagesRecordedCoverageScope, observations: readonly PagesRecordedObservation[], summary: T,
) {
  const principalHash = digest.parse(scope.principalHash);
  const policyRevision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/).parse(scope.policyRevision);
  const projects = /:pages:projects(?::inventory|(?::provenance)?:pagination)$/.test(summary.resource.id);
  const deploymentProjectName = projects ? undefined : text(63, /^[a-z0-9][a-z0-9-]*$/).parse(scope.deploymentProjectName);
  requireThat(!projects || scope.deploymentProjectName === undefined, "scope");
  const tool = projects ? "cloudflare.pages.projects.list" : "cloudflare.pages.deployments.list";
  const bindings: { page: number; hash: string }[] = [];
  for (const observation of observations) {
    const target = object(observation.target), resource = object(target.resource);
    const value = object(object(observation.result).value), pagination = object(value.pagination);
    const args = object(observation.arguments);
    requireThat(Object.keys(args).length === (projects ? 2 : 3) && args.page === pagination.page &&
      args.perPage === summary.perPage, "scope");
    if (!projects) requireThat(args.projectName === deploymentProjectName, "scope");
    requireThat(target.contract === PROVIDER_CONTRACT && target.provider === "cloudflare" && target.tool === tool &&
      target.version === "1" && target.tier === "read" && target.artifactDigest === null &&
      resource.id === summary.resource.id && resource.revision === summary.resource.revision &&
      target.policyRevision === policyRevision && canonicalHash(target.principal) === principalHash &&
      target.argumentsHash === canonicalHash(observation.arguments), "scope");
    digest.parse(target.planHash);
    const targetHash = canonicalHash(observation.target);
    requireThat(targetHash === observation.evidence.targetHash, "scope");
    requireThat(Array.isArray(observation.audit) && observation.audit.length === 2, "schema");
    for (const [index, raw] of observation.audit.entries()) {
      const record = object(raw);
      requireThat(record.event === observation.result.event && record.targetHash === targetHash &&
        record.principalHash === principalHash && record.contract === PROVIDER_CONTRACT &&
        record.provider === "cloudflare" && record.tool === tool && record.decision === "ALLOW" &&
        record.phase === (index === 0 ? "intent" : "outcome") && typeof record.time === "number" &&
        Number.isSafeInteger(record.time) && record.time >= 0, "scope");
    }
    requireThat(observation.audit[0]!.time <= observation.audit[1]!.time, "scope");
    const journal = object(observation.journal);
    requireThat(journal.event === observation.result.event && journal.targetHash === targetHash && journal.outcome === "complete", "scope");
    bindings.push({ page: pagination.page as number, hash: canonicalHash({ targetHash, audit: observation.audit,
      journal: { event: journal.event, targetHash: journal.targetHash, outcome: journal.outcome } }) });
  }
  bindings.sort((a, b) => a.page - b.page);
  return Object.freeze({ ...summary, recordedOutcome: "consistent-supplied-records" as const,
    outcomeBindingsHash: bindings.reduce((previous, binding) => canonicalHash({ previous, binding }), canonicalHash([])) });
}
