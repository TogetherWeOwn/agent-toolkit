import { integer, requireThat, text } from "../../../packages/core/src/index.js";
import { canonicalHash, type Json, type ProviderDependencies, type ProviderResult, type Resource } from "../../../packages/core/src/provider/index.js";
import { summarizePagesInventoryCoverage } from "./pages-coverage.js";
import { summarizePagesInventoryRecordedCoverage, type PagesRecordedObservation } from "./pages-recorded-coverage.js";
import { createCloudflareReadBroker, type CaptureEvidenceSink } from "./read-broker.js";
import { cloudflareReadOperations, type CloudflareReadScope } from "./read-operations.js";

// Source-only session contract. These inputs and every checkpoint must come from
// a trusted host, not model arguments. No native session adapter is implied.
export const pagesTraversalCeilings = Object.freeze({ requests: 100, rows: 1000,
  valueBytes: 1048576, manifestBytes: 1048576, elapsedMs: 600000, perPage: 100 });
export interface PagesSessionContext {
  readonly principalHash: string;
  readonly company: string;
  readonly accountId: string;
  readonly policyRevision: string;
  readonly resourceRevision: string;
  readonly ownershipRevision: string;
}
export interface PagesTraversalSession extends PagesSessionContext {
  readonly sessionId: string;
  readonly perPage: number;
  readonly startedAt: number;
  readonly budgets: { readonly requests: number; readonly rows: number; readonly valueBytes: number;
    readonly manifestBytes: number; readonly elapsedMs: number };
}
export type PagesTraversalGap = "unapproved-project" | "request-cap" | "row-cap" | "value-byte-cap" |
  "manifest-byte-cap" | "elapsed-cap" | "cancelled" | "context-drift" | "clock-regression" |
  "invalid-evidence" | "request-mismatch" | "provider-refused" | "uncertain-outcome" | "records-unavailable" |
  "pagination-unavailable" | "not-visited";
export interface PagesTraversalRequest {
  readonly tool: "cloudflare.pages.projects.list" | "cloudflare.pages.deployments.list";
  readonly arguments: Json;
  readonly resource: Resource;
  readonly ordinal: number;
  readonly sessionHash: string;
}
type Coverage = ReturnType<typeof summarizePagesInventoryRecordedCoverage>;
interface Collection {
  resource: Resource;
  projectId: string | null;
  projectName: string | null;
  status: "pending" | "observed" | "gap";
  gap: PagesTraversalGap | null;
  observations: PagesRecordedObservation[];
  coverage: Coverage | null;
}
export interface PagesInventoryManifest {
  readonly contract: "toolkit.cloudflare-pages-inventory/v1";
  readonly sessionHash: string;
  readonly context: PagesSessionContext;
  readonly perPage: number;
  readonly window: { readonly startedAt: number; readonly completedAt: number };
  readonly budgets: PagesTraversalSession["budgets"];
  readonly usage: { readonly requests: number; readonly rows: number; readonly valueBytes: number };
  readonly projects: { readonly denominator: "all-observed-projects" | "partial-project-discovery";
    readonly discovered: number; readonly visited: number; readonly observed: number };
  readonly collections: readonly { readonly resource: Resource; readonly projectId: string | null;
    readonly projectName: string | null; readonly status: Collection["status"]; readonly gap: PagesTraversalGap | null;
    readonly coverage: Coverage | null }[];
  readonly stopReason: PagesTraversalGap | null;
  readonly sourceTraversal: "all-reported-pages-observed" | "incomplete";
  readonly suppliedRecords: "consistent-accepted-records-only";
  readonly authenticatedDurableCoverage: "not-established";
  readonly consumerAcceptance: "not-established";
  readonly complete: false;
  readonly enumeration: "not-established";
  readonly snapshotConsistency: "not-established";
  readonly hostingAbsence: "not-established";
  readonly nativeAcceptance: "not-established";
}
const digest = text(64, /^[a-f0-9]{64}$/);
const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const contextKeys = ["principalHash", "company", "accountId", "policyRevision", "resourceRevision", "ownershipRevision"] as const;
function context(input: PagesSessionContext): PagesSessionContext {
  return Object.freeze({ principalHash: digest.parse(input.principalHash),
    company: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/).parse(input.company),
    accountId: text(32, /^[a-f0-9]{32}$/).parse(input.accountId),
    policyRevision: revision.parse(input.policyRevision), resourceRevision: revision.parse(input.resourceRevision),
    ownershipRevision: revision.parse(input.ownershipRevision) });
}
function object(value: unknown): Record<string, unknown> {
  requireThat(value !== null && typeof value === "object" && !Array.isArray(value), "schema");
  return value as Record<string, unknown>;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function bytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value), "utf8"); }

export function createPagesInventoryTraversal(input: PagesTraversalSession, readScope: CloudflareReadScope) {
  const binding = context(input);
  const session: PagesTraversalSession = freeze({ ...binding, sessionId: revision.parse(input.sessionId),
    startedAt: integer(0, Number.MAX_SAFE_INTEGER - pagesTraversalCeilings.elapsedMs).parse(input.startedAt),
    perPage: integer(1, 100).parse(input.perPage), budgets: {
      requests: integer(1, pagesTraversalCeilings.requests).parse(input.budgets.requests),
      rows: integer(1, pagesTraversalCeilings.rows).parse(input.budgets.rows),
      valueBytes: integer(1, pagesTraversalCeilings.valueBytes).parse(input.budgets.valueBytes),
      manifestBytes: integer(8192, pagesTraversalCeilings.manifestBytes).parse(input.budgets.manifestBytes),
      elapsedMs: integer(1, pagesTraversalCeilings.elapsedMs).parse(input.budgets.elapsedMs),
    } });
  // Copy before constructing readers: grants cannot grow when discovery occurs.
  const scope = freeze(JSON.parse(JSON.stringify(readScope)) as CloudflareReadScope);
  requireThat(scope.accountId === binding.accountId && scope.revision === binding.resourceRevision &&
    scope.pagesProjectInventoryReadAllowed === true && scope.pagesPagination?.projects === true, "scope");
  const operations = cloudflareReadOperations(scope, { accountId: scope.accountId, revision: scope.revision });
  const projectOperation = operations.find(op => op.name === "cloudflare.pages.projects.list")!;
  const deploymentOperation = operations.find(op => op.name === "cloudflare.pages.deployments.list")!;
  const sessionHash = canonicalHash(session as unknown as Json);
  const projectCollection: Collection = { resource: projectOperation.prepare({ page: 1, perPage: session.perPage }).resource,
    projectId: null, projectName: null, status: "pending", gap: null, observations: [], coverage: null };
  const collections: Collection[] = [projectCollection];
  const events = new Set<string>(), targets = new Set<string>(), correlations = new Set<string>();
  const discovered = new Map<string, string>(), names = new Set<string>(), deploymentIds = new Set<string>();
  let current = 0, requests = 0, rows = 0, valueBytes = 0, lastTime = session.startedAt;
  let inFlight: PagesTraversalRequest | null = null, stopped = false, stopReason: PagesTraversalGap | null = null;
  let projectDiscoveryFinished = false;
  function stop(reason: PagesTraversalGap, now = lastTime) {
    if (stopped) return;
    if (!Number.isSafeInteger(now) || now < lastTime) reason = "clock-regression";
    else lastTime = now;
    stopReason = reason; stopped = true; inFlight = null;
    for (const collection of collections) if (collection.status === "pending") {
      collection.status = "gap"; collection.gap = collection === collections[current] ? reason : "not-visited";
    }
  }
  function checkpoint(now: number, currentContext: PagesSessionContext, cancelled: boolean): boolean {
    if (stopped) return false;
    if (!Number.isSafeInteger(now) || now < lastTime) stop("clock-regression");
    else {
      lastTime = now;
      if (cancelled) stop("cancelled");
      else if (now - session.startedAt >= session.budgets.elapsedMs) stop("elapsed-cap");
      else if (contextKeys.some(key => currentContext[key] !== binding[key])) stop("context-drift");
    }
    return !stopped;
  }
  function finishProjects() {
    projectDiscoveryFinished = true;
    // Stable order independent of the provider's row order. Unknown bindings are
    // explicit denominator members, never enrolled into the trusted scope.
    const sorted = collections.splice(1).sort((a, b) => a.projectId! < b.projectId! ? -1 : a.projectId! > b.projectId! ? 1 : 0);
    collections.push(...sorted);
  }
  function advance() {
    while (current < collections.length && collections[current]!.status !== "pending") current++;
    if (current === collections.length) stopped = true;
  }
  function next(now: number, currentContext: PagesSessionContext, cancelled = false): PagesTraversalRequest | null {
    if (!checkpoint(now, currentContext, cancelled)) return null;
    requireThat(inFlight === null, "conflict");
    advance(); if (stopped) return null;
    const collection = collections[current]!;
    if (requests >= session.budgets.requests) { stop("request-cap"); return null; }
    if (rows + session.perPage > session.budgets.rows) { stop("row-cap"); return null; }
    // Reserve worst-case denominator and summary space BEFORE reading a page.
    // Failed reservations do not discard already-discovered projects.
    if (8192 + (discovered.size + (current === 0 ? session.perPage : 0)) * 1024 + (requests + 1) * 1024 > session.budgets.manifestBytes) {
      stop("manifest-byte-cap"); return null;
    }
    if (valueBytes + 32768 > session.budgets.valueBytes) { stop("value-byte-cap"); return null; }
    const page = collection.observations.length + 1;
    const args = { ...(current === 0 ? {} : { projectName: collection.projectName! }), page, perPage: session.perPage };
    const tool = current === 0 ? "cloudflare.pages.projects.list" : "cloudflare.pages.deployments.list";
    inFlight = freeze({ tool, arguments: args, resource: collection.resource, ordinal: ++requests, sessionHash });
    return inFlight;
  }
  function accept(request: PagesTraversalRequest, supplied: PagesRecordedObservation, now: number,
    currentContext: PagesSessionContext, cancelled = false) {
    if (!checkpoint(now, currentContext, cancelled)) return;
    if (request !== inFlight) { stop("request-mismatch"); return; }
    inFlight = null;
    const collection = collections[current]!;
    if (supplied?.result?.ok === false) {
      stop(supplied.result.code === "OUTCOME_UNCERTAIN" ? "uncertain-outcome" : "provider-refused"); return;
    }
    try {
      // Bound before copying/hashing; only bounded broker output belongs here.
      requireThat(bytes(supplied.result) <= 33000 && bytes(supplied.evidence) <= 1024 &&
        bytes(supplied.target) <= 4096 && bytes(supplied.arguments) <= 1024 &&
        bytes(supplied.audit) <= 4096 && bytes(supplied.journal) <= 1024, "cap");
      const observation = freeze(JSON.parse(JSON.stringify(supplied)) as PagesRecordedObservation);
      const value = object(object(observation.result).value), pagination = object(value.pagination);
      const expected = (current === 0 ? projectOperation : deploymentOperation).prepare(request.arguments);
      requireThat(canonicalHash(observation.arguments) === canonicalHash(request.arguments) &&
        observation.target.planHash === canonicalHash(expected.plan) && observation.target.principal.company === binding.company, "scope");
      if (pagination.status === "unavailable") { stop("pagination-unavailable"); return; }
      requireThat(pagination.page === collection.observations.length + 1, "scope");
      const observations = [...collection.observations, observation];
      const coverageScope = { resource: collection.resource, perPage: session.perPage, principalHash: binding.principalHash,
        policyRevision: binding.policyRevision, ...(current === 0 ? {} : { deploymentProjectName: collection.projectName! }) };
      summarizePagesInventoryCoverage(coverageScope, observations);
      const coverage = summarizePagesInventoryRecordedCoverage(coverageScope, observations);
      const capture = object(value.capture), correlation = capture.correlationId as string;
      requireThat(!events.has(observation.result.event) && !targets.has(observation.evidence.targetHash) && !correlations.has(correlation), "scope");
      requireThat(Date.parse(capture.startedAt as string) >= session.startedAt && Date.parse(capture.completedAt as string) <= now, "scope");
      const items = value.items as Record<string, unknown>[];
      const length = bytes(value);
      if (current !== 0) for (const item of items) {
        requireThat(!deploymentIds.has(item.id as string), "scope");
        deploymentIds.add(item.id as string);
      }
      // Retain every discovered identity even when this page crosses a row/value
      // budget. Coverage is not accepted and no deployment traversal starts.
      if (current === 0) for (const item of items) {
        const inventory = object(item.inventory), id = item.id as string, name = inventory.projectName as string;
        requireThat(!discovered.has(id) && !names.has(name), "scope");
        discovered.set(id, name); names.add(name);
        const grant = scope.pagesProjects?.find(entry => entry.projectId === id && entry.projectName === name);
        const allowed = grant !== undefined && scope.pagesPagination?.deploymentProjects.includes(name) === true &&
          scope.pagesDeploymentInventoryProjects?.includes(name) === true;
        collections.push({ resource: { id: `cloudflare:account:${binding.accountId}:pages:project:${id}:deployments:inventory`, revision: binding.resourceRevision },
          projectId: id, projectName: name, status: allowed ? "pending" : "gap", gap: allowed ? null : "unapproved-project", observations: [], coverage: null });
      }
      rows += items.length; valueBytes += length;
      if (rows > session.budgets.rows) { stop("row-cap"); return; }
      if (valueBytes > session.budgets.valueBytes) { stop("value-byte-cap"); return; }
      collection.observations.push(observation); collection.coverage = coverage;
      events.add(observation.result.event); targets.add(observation.evidence.targetHash); correlations.add(correlation);
      if (object(coverage.reportedTotalPages).status === "unavailable") { stop("pagination-unavailable"); return; }
      if (coverage.pageCoverage === "all-reported-pages-observed") {
        collection.status = "observed";
        if (current === 0) finishProjects();
        advance();
      }
    } catch { stop("invalid-evidence"); }
  }
  function manifest(): PagesInventoryManifest {
    requireThat(stopped && inFlight === null, "conflict");
    const deployments = collections.slice(1);
    const manifest: PagesInventoryManifest = freeze({ contract: "toolkit.cloudflare-pages-inventory/v1", sessionHash,
      context: binding, perPage: session.perPage, window: { startedAt: session.startedAt, completedAt: lastTime }, budgets: session.budgets,
      usage: { requests, rows, valueBytes }, projects: { denominator: projectDiscoveryFinished ? "all-observed-projects" : "partial-project-discovery",
        discovered: discovered.size, visited: deployments.filter(c => c.observations.length > 0).length,
        observed: deployments.filter(c => c.status === "observed").length },
      collections: collections.map(({ observations: _observations, ...collection }) => collection), stopReason,
      sourceTraversal: projectDiscoveryFinished && collections.every(c => c.status === "observed") ? "all-reported-pages-observed" : "incomplete",
      suppliedRecords: "consistent-accepted-records-only", authenticatedDurableCoverage: "not-established", consumerAcceptance: "not-established",
      complete: false, enumeration: "not-established", snapshotConsistency: "not-established", hostingAbsence: "not-established", nativeAcceptance: "not-established" });
    requireThat(bytes(manifest) <= session.budgets.manifestBytes, "cap");
    return manifest;
  }
  return Object.freeze({ next, accept, stop, manifest });
}

export interface PagesTraversalPorts {
  /** Current trusted ownership/policy/principal snapshot, not an authorization grant. */
  readContext(): Promise<PagesSessionContext>;
  /** Retrieve exact supplied bindings for this successful event. No durability or
   * authentication is inferred from this callback or its self-consistency. */
  readObservation(result: ProviderResult, request: PagesTraversalRequest): Promise<PagesRecordedObservation>;
  readonly clock: () => number;
  readonly signal: AbortSignal;
}

export async function collectPagesInventory(session: PagesTraversalSession, scope: CloudflareReadScope,
  dependencies: Omit<ProviderDependencies, "provider" | "operations">, evidence: CaptureEvidenceSink,
  ports: PagesTraversalPorts, runtimeContext: unknown, fetcher: typeof fetch = fetch): Promise<PagesInventoryManifest> {
  const fixedScope = freeze(JSON.parse(JSON.stringify(scope)) as CloudflareReadScope);
  const traversal = createPagesInventoryTraversal(session, fixedScope);
  const broker = createCloudflareReadBroker(fixedScope, { accountId: fixedScope.accountId, revision: fixedScope.revision }, dependencies, evidence, fetcher);
  try {
    for (;;) {
      const currentContext = await ports.readContext();
      const request = traversal.next(ports.clock(), currentContext, ports.signal.aborted);
      if (request === null) break;
      // Session-local deterministic identities; the core journal owns atomic
      // replay exclusion. Keys are never exported as evidence receipts.
      const key = canonicalHash({ sessionHash: request.sessionHash, ordinal: request.ordinal });
      const result = await broker.call(request.tool, request.arguments, runtimeContext, key);
      if (!result.ok) { traversal.stop(result.code === "OUTCOME_UNCERTAIN" ? "uncertain-outcome" : "provider-refused", ports.clock()); break; }
      const observation = await ports.readObservation(result, request);
      requireThat(canonicalHash(observation.result as unknown as Json) === canonicalHash(result as unknown as Json), "scope");
      const refreshedContext = await ports.readContext();
      traversal.accept(request, observation, ports.clock(), refreshedContext, ports.signal.aborted);
    }
  } catch { traversal.stop("records-unavailable", ports.clock()); }
  return traversal.manifest();
}
