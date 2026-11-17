import { randomUUID } from "node:crypto";
import { Refusal, dispatch, hash } from "../../../packages/core/src/index.js";
import { GitHubFailure, header, parse, request, retryAfter, withInstallationToken, type Response } from "../../../packages/github/src/index.js";
import { authorize, parseCaller, parseConfig, policyHash } from "./policy.js";
import { object, scrub } from "./output.js";
import { Denied, guard, operations, type Arguments, type Audit, type Caller, type Host, type Operation, type Result } from "./types.js";
import { repoRead } from "./tools/repo-read.js";
import { prList } from "./tools/pr-list.js";
import { prGet } from "./tools/pr-get.js";
import { prFiles } from "./tools/pr-files.js";
import { checksGet, checkSignals } from "./tools/checks-get.js";
import { rulesetsGet } from "./tools/rulesets-get.js";
import { actionsRunsList } from "./tools/actions-runs-list.js";
import { issueRead } from "./tools/issue-read.js";
import { workflowDispatchAllowlisted } from "./tools/workflow-dispatch-allowlisted.js";

export const tools = [repoRead, prList, prGet, prFiles, checksGet, rulesetsGet, actionsRunsList, issueRead, workflowDispatchAllowlisted];
const registry = new Map(tools.map(t => [t.name, t]));
const schemas = new Map(tools.map(t => [t.name, t.schema]));
interface Cache { value: unknown; at: number; generation: number }
interface Bucket { start: number; count: number; blockedUntil: number }
const response = (data: unknown, isError: boolean): Result => ({ content: [{ type: "text", text: JSON.stringify(data) }], isError });

export class Broker {
  private cache = new Map<string, Cache>();
  private agents = new Map<string, Bucket>();
  private installations = new Map<string, Bucket>();
  private inFlight = 0;
  private generation = 0;

  private pause(key: string, seconds: number, now: number): number {
    const b = this.installations.get(key);
    const blockedUntil = Math.max(b?.blockedUntil ?? 0, now + seconds * 1000);
    if (b) b.blockedUntil = blockedUntil;
    else {
      guard(this.installations.size < 128, "rate.capacity");
      this.installations.set(key, { start: now, count: 0, blockedUntil });
    }
    return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
  }

  private reserve(map: Map<string, Bucket>, key: string, count: number, limit: number, window: number, now: number): void {
    for (const [k, b] of map) if (now >= b.start + window && now >= b.blockedUntil) map.delete(k);
    let b = map.get(key);
    if (!b) { guard(map.size < 128, "rate.capacity"); b = { start: now, count: 0, blockedUntil: 0 }; map.set(key, b); }
    if (now < b.blockedUntil) throw new Denied("rate.retry_after", Math.max(1, Math.ceil((b.blockedUntil - now) / 1000)));
    if (b.count + count > limit) throw new Denied("rate.bucket", Math.max(1, Math.ceil((b.start + window - now) / 1000)));
    b.count += count;
  }

  async execute(host: Host, name: unknown, input: unknown, context: unknown): Promise<Result> {
    const event = randomUUID(), generation = ++this.generation;
    let keys: string[] = [];
    const updates = new Map<string, Cache>();
    let caller: Caller | null = null, args: Arguments | null = null;
    let operation: Operation | "unknown" = "unknown", policyDigest = hash(null), revision: number | null = null;
    let phase: Audit["phase"] = "refused", reserved = false, installationKey: string | null = null;
    const requestIds: string[] = [];
    let providerFailure: Audit["providerFailure"], revocation: Audit["revocation"];
    let dispatchCoords: NonNullable<Audit["dispatch"]> | null = null;
    const emit = async (decision: Audit["decision"], rule: string, outcome: Audit["outcome"]) => {
      try {
        await host.audit({ event, time: host.clock(), agentId: caller?.agentId ?? null, runId: caller?.runId ?? null, companyId: caller?.companyId ?? null,
          policyHash: policyDigest, policyRevision: revision, repoId: args?.repoId ?? null, operation, phase, decision, rule, requestIds: [...requestIds], outcome, ...(dispatchCoords ? { dispatch: { workflow: dispatchCoords.workflow, ref: dispatchCoords.ref, inputs: { ...dispatchCoords.inputs } } } : {}), ...(providerFailure ? { providerFailure } : {}), ...(revocation ? { revocation } : {}) });
      } catch { throw new Denied("audit.unavailable"); }
    };
    try {
      caller = parseCaller(context);
      if (typeof name === "string" && operations.includes(name as Operation)) operation = name as Operation;
      args = dispatch(schemas, name, input).args;
      const tool = registry.get(operation as Operation)!;
      // Sole-write dispatch coordinates (validated, non-secret inputs by construction) so the audit identifies the write.
      if (operation === "github.workflow_dispatch_allowlisted" && typeof args.workflow === "string" && typeof args.ref === "string" && args.inputs !== null && typeof args.inputs === "object" && !Array.isArray(args.inputs)) {
        dispatchCoords = { workflow: args.workflow, ref: args.ref, inputs: { ...(args.inputs as Record<string, string>) } };
      }
      const config = parseConfig(await host.config());
      policyDigest = policyHash(config); revision = config.policy.revision;
      const repo = await authorize(host, config.policy, caller, tool, args);
      const requests = tool.requests(args); // Path validation precedes secrets and outbound calls.
      const agentKey = `${caller.companyId}:${caller.agentId}`;
      const budgetKey = `${config.appId}:${config.installationId}`;
      installationKey = budgetKey;
      this.reserve(this.agents, agentKey, 1, 30, 60000, host.clock());
      guard(this.inFlight < 4, "rate.concurrency");
      this.inFlight++; reserved = true;
      phase = "intent";
      try { await emit("allow", "policy.allow", "pending"); }
      catch (error) { phase = "refused"; throw error; }
      const revalidate = async () => {
        guard(policyHash(parseConfig(await host.config())) === policyDigest, "policy.changed");
        await authorize(host, config.policy, caller!, tool, args!);
        guard(policyHash(parseConfig(await host.config())) === policyDigest, "policy.changed");
      };
      // The sole write is non-idempotent: never cache it, never serve it from cache.
      const isWrite = tool.write === true || requests.some(r => (r.method ?? "GET") !== "GET" || (r.level ?? "read") === "write");
      keys = requests.map(r => hash({ policyDigest, caller, args, path: r.path }));
      for (const [k, v] of this.cache) if (host.clock() - v.at >= 60000) this.cache.delete(k);
      const cached = keys.map(k => this.cache.get(k));
      let values: unknown[];
      if (!isWrite && cached.every(c => c && host.clock() - c.at < 10000)) {
        await revalidate();
        values = cached.map(c => c!.value);
      } else {
        // Worst case: mint + immutable repo-ID read + N reads + revoke + two probes.
        this.reserve(this.installations, budgetKey, requests.length + 5, 4000, 3600000, host.clock());
        await revalidate();
        let privateKey: string;
        try { privateKey = await host.secret(config.privateKeySecretRef, caller.companyId); }
        catch { throw new Denied("secret.unavailable"); }
        guard(typeof privateKey === "string" && privateKey.trim().length > 0, "secret.unavailable");
        const observe = (res: Response, sensitive: readonly string[]) => {
          const requestId = header(res, "x-github-request-id");
          const safeId = requestId && /^[A-F0-9]{4,8}(?::[A-F0-9]{2,12}){3,5}$/.test(requestId) && scrub(requestId, [...sensitive]) === requestId ? requestId : undefined;
          if (safeId) requestIds.push(safeId);
          if (res.status === 429 || (res.status === 403 && (header(res, "retry-after") || header(res, "x-ratelimit-remaining") === "0"))) {
            const seconds = retryAfter(res, host.clock());
            const effective = this.pause(budgetKey, seconds, host.clock());
            providerFailure = { rule: "rate.github", retryAfterSeconds: effective };
            throw new Denied("rate.github", effective);
          }
          return safeId;
        };
        values = await withInstallationToken({ transport: host.http.bind(host), appId: config.appId, installationId: config.installationId, privateKey,
          scope: { repository_ids: [repo.id], permissions: Object.fromEntries(requests.map(r => [r.permission, r.level ?? "read"])) }, now: host.clock(), observe, onRevocation: evidence => { revocation = evidence; } }, async (token, sensitive) => {
          const clean = (v: unknown) => scrub(v, [...sensitive]);
          await revalidate();
          const prefix = `/repos/${repo.owner}/${repo.name}`;
          const identity = await request(host.http.bind(host), "GET", prefix, token);
          observe(identity, sensitive); guard(identity.status === 200, "upstream.repository");
          guard(object(parse(identity)).id === repo.id, "policy.repository_identity");
          const output: unknown[] = [];
          for (const [i, spec] of requests.entries()) {
            await revalidate();
            const expectedStatus = spec.expectedStatus ?? 200;
            const res = await request(host.http.bind(host), spec.method ?? "GET", prefix + spec.path, token, spec.body === undefined ? {} : { body: spec.body });
            observe(res, sensitive);
            guard(res.status === expectedStatus, expectedStatus === 204 ? "upstream.dispatch" : "upstream.read"); // Unsolicited 304 never serves stale data.
            const value = clean(tool.project(expectedStatus === 204 ? null : parse(res), args!));
            guard(Buffer.byteLength(JSON.stringify(value)) <= 262144, "output.limit");
            output.push(value);
            if (!isWrite) updates.set(keys[i]!, { value, at: host.clock(), generation });
          }
          // Request IDs are provider-controlled too; scrub before durable audit.
          requestIds.splice(0, requestIds.length, ...(clean(requestIds) as string[]).filter(x => x !== "[REDACTED]"));
          return output;
        });
      }
      phase = "outcome"; await emit("allow", "policy.allow", "success");
      for (const [key, update] of updates) {
        if ((this.cache.get(key)?.generation ?? 0) > generation) continue;
        if (this.cache.size >= 128 && !this.cache.has(key)) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, update);
      }
      return response({ ok: true, policyHash: policyDigest, policyRevision: revision, repoId: repo.id, operation, pages: values, ...(operation === "github.checks_get" ? { signals: checkSignals(values) } : {}), pagination: "bounded; request subsequent pages explicitly" }, false);
    } catch (error) {
      const rule = error instanceof Denied || error instanceof GitHubFailure ? error.rule : error instanceof Refusal ? `validation.${error.code}` : "broker.unavailable";
      const seconds = error instanceof Denied || error instanceof GitHubFailure ? error.retryAfterSeconds : undefined;
      // Pending updates are never published until revoke and audit succeed.
      // Refusals must not invalidate unrelated principals' cached reads.
      for (const key of keys) if ((this.cache.get(key)?.generation ?? 0) <= generation) this.cache.delete(key);
      // Pause recovery-branch error exits before denial audit, including a prior
      // use failure whose cleanup verified: the denial audit can itself fail.
      if (installationKey && (rule === "mint.revoke_failed" || revocation?.probes?.[0]?.status === 200)) {
        try { this.pause(installationKey, 3660, host.clock()); } catch { /* Capacity remains fail-closed. */ }
      }
      if (phase === "intent") phase = "outcome";
      try { await emit("deny", rule, "error"); } catch { return response({ ok: false, rule: "audit.unavailable" }, true); }
      return response({ ok: false, rule, ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }) }, true);
    } finally { if (reserved) this.inFlight--; }
  }
}
