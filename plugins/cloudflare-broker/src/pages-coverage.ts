import { requireThat, text } from "../../../packages/core/src/index.js";
import { canonicalHash, type ProviderResult, type Resource } from "../../../packages/core/src/provider/index.js";
import type { CaptureEvidenceRecord } from "./read-broker.js";

export interface PagesCoverageObservation {
  readonly result: ProviderResult;
  readonly evidence: CaptureEvidenceRecord;
}
export interface PagesCoverageScope {
  readonly resource: Resource;
  readonly perPage: number;
}

function object(value: unknown): Record<string, unknown> {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "schema");
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): number {
  requireThat(typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max, "schema");
  return value as number;
}
const digest = text(64, /^[a-f0-9]{64}$/);
const uuid = text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const timestamp = text(24, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
function time(value: unknown): string {
  const parsed = timestamp.parse(value);
  requireThat(Number.isFinite(Date.parse(parsed)) && new Date(parsed).toISOString() === parsed, "schema");
  return parsed;
}

export interface PagesInventoryCoverageScope extends PagesCoverageScope {
  /** Required for deployment inventory; independently selected, not inferred. */
  readonly deploymentProjectName?: string;
}

// Pure consistency checks, NOT authenticated native evidence acceptance.
export function summarizePagesCoverage(scope: PagesCoverageScope, observations: readonly PagesCoverageObservation[]) {
  return summarizeCoverage(scope, observations, false);
}
export function summarizePagesInventoryCoverage(scope: PagesInventoryCoverageScope, observations: readonly PagesCoverageObservation[]) {
  const summary = summarizeCoverage(scope, observations, true);
  const projects = summary.resource.id.endsWith(":pages:projects:inventory");
  const projectName = projects ? undefined : text(63, /^[a-z0-9][a-z0-9-]*$/).parse(scope.deploymentProjectName);
  requireThat(!projects || scope.deploymentProjectName === undefined, "scope");
  const selection = projects ? "all-returned-projects" : "all-returned-deployments";
  const ids = new Set<string>(), names = new Set<string>();
  for (const observation of observations) {
    const value = object(object(observation.result).value);
    requireThat(value.selection === selection, "scope");
    for (const raw of value.items as unknown[]) {
      const item = object(raw), inventory = object(item.inventory);
      const id = (projects ? text(64, /^[a-z0-9][a-z0-9-]*$/) : text(36, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)).parse(item.id);
      const name = text(63, /^[a-z0-9][a-z0-9-]*$/).parse(inventory.projectName);
      requireThat(!ids.has(id), "scope"); ids.add(id);
      if (projects) {
        requireThat(inventory.subject === "configured-pages-project-inventory" && inventory.effectiveProduction === "not-established" && !names.has(name), "scope");
        names.add(name);
      } else {
        const projectId = text(64, /^[a-z0-9][a-z0-9-]*$/).parse(inventory.projectId);
        requireThat(inventory.subject === "provider-pages-deployment-inventory" && name === projectName &&
          summary.resource.id.endsWith(`:project:${projectId}:deployments:inventory`) &&
          inventory.servingDeployment === "not-established" && inventory.historicalSourceBinding === "not-established", "scope");
      }
    }
  }
  return Object.freeze({ ...summary, subject: "inventory-pages-source-coverage" as const, selection });
}

function summarizeCoverage(scope: PagesCoverageScope, observations: readonly PagesCoverageObservation[], inventory: boolean) {
  const pattern = inventory
    ? /^cloudflare:account:[a-f0-9]{32}:pages:(?:projects|project:[a-z0-9][a-z0-9-]{0,63}:deployments):inventory$/
    : /^cloudflare:account:[a-f0-9]{32}:pages:(?:projects|project:[a-z0-9][a-z0-9-]{0,63}:deployments)(?::provenance)?:pagination$/;
  const id = text(200, pattern).parse(scope.resource.id);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/).parse(scope.resource.revision);
  const perPage = integer(scope.perPage, 1, 100);
  requireThat(Array.isArray(observations) && observations.length > 0 && observations.length <= 100, "cap");
  const pages = new Set<number>(), events = new Set<string>(), correlations = new Set<string>(), targets = new Set<string>();
  const bindings: { page: number; event: string; targetHash: string; valueHash: string }[] = [];
  let totalPages: number | undefined;
  let unknownTotal = false, bytes = 0;
  let startedAt = "", completedAt = "";
  for (const observation of observations) {
    const result = object(observation.result);
    requireThat(result.ok === true, "schema");
    const event = uuid.parse(result.event);
    const value = object(result.value);
    const serialized = JSON.stringify(value);
    bytes += Buffer.byteLength(serialized, "utf8");
    requireThat(Buffer.byteLength(serialized, "utf8") <= 32768 && bytes <= 1048576, "cap");
    requireThat(value.complete === false && Array.isArray(value.items) && value.items.length <= perPage, "schema");
    const capture = object(value.capture), resource = object(capture.resource), pagination = object(value.pagination);
    requireThat(resource.id === id && resource.revision === revision, "scope");
    requireThat(capture.provenance === "internal-transport-observation" && capture.enumeration === "not-established" &&
      capture.snapshotConsistency === "not-established" && pagination.status === "provider-reported" &&
      pagination.enumeration === "not-established" && pagination.snapshotConsistency === "not-established" &&
      pagination.perPage === perPage, "schema");
    const page = integer(pagination.page, 1, 1000);
    const total = object(pagination.totalPages);
    if (total.status === "unavailable") {
      requireThat(total.reason === "not-returned", "schema");
      unknownTotal = true;
    } else {
      requireThat(total.status === "provider-reported", "schema");
      const reported = integer(total.value, 0, 1000);
      requireThat(reported === 0 ? page === 1 && value.items.length === 0 : page <= reported, "schema");
      requireThat(totalPages === undefined || totalPages === reported, "scope");
      totalPages = reported;
    }
    const correlationId = uuid.parse(capture.correlationId);
    const start = time(capture.startedAt), end = time(capture.completedAt);
    requireThat(start <= end && typeof capture.durationMs === "number" && Number.isFinite(capture.durationMs) &&
      capture.durationMs >= 0 && capture.durationMs <= 10000, "schema");
    const evidence = object(observation.evidence);
    const targetHash = digest.parse(evidence.targetHash), valueHash = digest.parse(evidence.valueHash);
    requireThat(evidence.contract === "toolkit.cloudflare-capture/v1" && evidence.subject === "credential-filtered-pages-list-projection" &&
      evidence.event === event && valueHash === canonicalHash(result.value as Parameters<typeof canonicalHash>[0]), "scope");
    requireThat(!pages.has(page) && !events.has(event) && !correlations.has(correlationId) && !targets.has(targetHash), "scope");
    pages.add(page); events.add(event); correlations.add(correlationId); targets.add(targetHash);
    bindings.push({ page, event, targetHash, valueHash });
    if (startedAt === "" || start < startedAt) startedAt = start;
    if (end > completedAt) completedAt = end;
  }
  // A total omitted by ANY observation cannot be filled from another page.
  // Likewise an empty/short filtered page is never a terminal-page signal.
  const known = !unknownTotal && totalPages !== undefined;
  if (totalPages !== undefined) requireThat([...pages].every(page => totalPages === 0 ? page === 1 : page <= totalPages!), "scope");
  const missingRanges: { first: number; last: number }[] = [];
  if (known) for (let page = 1; page <= Math.max(1, totalPages!); page++) {
    if (pages.has(page)) continue;
    const last = missingRanges[missingRanges.length - 1];
    if (last && last.last === page - 1) last.last = page;
    else missingRanges.push({ first: page, last: page });
  }
  bindings.sort((a, b) => a.page - b.page);
  return Object.freeze({
    subject: "filtered-pages-source-coverage" as const,
    resource: Object.freeze({ id, revision }), perPage,
    observedPages: Object.freeze(bindings.map(binding => binding.page)),
    reportedTotalPages: known ? { status: "provider-reported" as const, value: totalPages! } : { status: "unavailable" as const },
    pageCoverage: known ? missingRanges.length === 0 ? "all-reported-pages-observed" as const : "gaps" as const : "unavailable" as const,
    missingRanges: known ? Object.freeze(missingRanges.map(range => Object.freeze(range))) : null,
    window: Object.freeze({ startedAt, completedAt, provenance: "internal-transport-observation" as const }),
    observationsHash: bindings.reduce((previous, binding) => canonicalHash({ previous, binding }), canonicalHash([])),
    complete: false as const, enumeration: "not-established" as const, snapshotConsistency: "not-established" as const,
    hostingAbsence: "not-established" as const, nativeAcceptance: "not-established" as const,
  });
}
