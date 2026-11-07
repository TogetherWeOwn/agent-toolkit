import { randomUUID } from "node:crypto";
import { hash } from "../contracts.js";
import { identifier, jsonData, text } from "../schema.js";
import { PROVIDER_CONTRACT, type AuthorizationTarget, type CredentialLease, type NativeEvidence,
  type PolicySnapshot, type Prepared, type Principal, type ProviderCode, type ProviderDependencies,
  type ProviderOperation, type ProviderResult } from "./contracts.js";
export * from "./contracts.js";
export * from "./coverage.js";

class Denied extends Error {
  constructor(readonly code: ProviderCode) { super(code); }
}
function insist(value: unknown, code: ProviderCode): asserts value {
  if (!value) throw new Denied(code);
}
const label = text(128, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const resourceName = text(256, /^[A-Za-z0-9][A-Za-z0-9:/._-]*$/);

/** Same bounded, sorted-key canonical hash as existing core, with JSON checks first. */
export function canonicalHash(value: unknown): string {
  jsonData(value);
  return hash(value);
}
function immutable<T>(value: T): T {
  jsonData(value);
  const copy = JSON.parse(JSON.stringify(value)) as T;
  function freeze(v: unknown): void {
    if (v !== null && typeof v === "object") {
      for (const child of Object.values(v)) freeze(child);
      Object.freeze(v);
    }
  }
  freeze(copy);
  return copy;
}
function keys(value: object, expected: string[]): void {
  insist(Object.keys(value).length === expected.length && expected.every(k => Object.hasOwn(value, k)), "INVALID_ARGUMENTS");
}
function principal(value: Principal | null): Principal {
  insist(value !== null, "IDENTITY_UNAVAILABLE");
  const p = immutable(value);
  keys(p, ["company", "agent", "project", "task", "run"]);
  for (const field of Object.values(p)) identifier.parse(field);
  return p;
}
function prepared(value: Prepared): Prepared {
  const p = immutable(value);
  keys(p, ["resource", "arguments", "plan", "artifactDigest"]);
  keys(p.resource, ["id", "revision"]);
  resourceName.parse(p.resource.id);
  label.parse(p.resource.revision);
  insist(p.artifactDigest === null || (typeof p.artifactDigest === "string" && /^[a-f0-9]{64}$/.test(p.artifactDigest)), "INVALID_ARGUMENTS");
  return p;
}
function policy(value: PolicySnapshot, p: Principal, plan: Prepared): PolicySnapshot {
  const snapshot = immutable(value);
  keys(snapshot, ["revision", "agents", "resources"]);
  label.parse(snapshot.revision);
  insist(Array.isArray(snapshot.agents) && Array.isArray(snapshot.resources), "POLICY_DENIED");
  for (const agent of snapshot.agents) identifier.parse(agent);
  for (const resource of snapshot.resources) resourceName.parse(resource);
  insist(snapshot.agents.includes(p.agent) && snapshot.resources.includes(plan.resource.id), "POLICY_DENIED");
  return snapshot;
}
function validEvidence(value: NativeEvidence | null, target: AuthorizationTarget, now: number): NativeEvidence {
  insist(value !== null, "AUTHORIZATION_DENIED");
  const evidence = immutable(value);
  keys(evidence, ["reference", "targetHash", "issuedAt", "expiresAt"]);
  label.parse(evidence.reference);
  insist(evidence.targetHash === canonicalHash(target) && Number.isSafeInteger(evidence.issuedAt) &&
    Number.isSafeInteger(evidence.expiresAt) && evidence.issuedAt >= 0 && evidence.issuedAt <= now &&
    now < evidence.expiresAt && evidence.expiresAt - evidence.issuedAt <= 300_000, "AUTHORIZATION_DENIED");
  return evidence;
}
function base64Cores(value: string, encoding: "base64" | "base64url"): string[] {
  const bytes = Buffer.from(value);
  const cores: string[] = [];
  for (let offset = 0; offset < 3; ++offset) {
    const encoded = Buffer.concat([Buffer.alloc(offset), bytes]).toString(encoding);
    // Only full groups made entirely of credential bytes are prefix/suffix independent.
    const start = offset === 0 ? 0 : 4;
    const end = Math.floor((offset + bytes.length) / 3) * 4;
    if (end > start) cores.push(encoded.slice(start, end));
  }
  return cores;
}
function noCredentialOutput(value: unknown, credentials: readonly string[]): void {
  jsonData(value);
  const serialized = JSON.stringify(value);
  for (const credential of credentials) {
    const variants = [credential, encodeURIComponent(credential), Buffer.from(credential).toString("base64"),
      Buffer.from(credential).toString("base64url"), ...base64Cores(credential, "base64"),
      ...base64Cores(credential, "base64url")];
    insist(!variants.some(v => serialized.includes(JSON.stringify(v).slice(1, -1))), "OUTPUT_REFUSED");
  }
}

/** No native host/state/approval implementation is implied by this executor.
 * Dependencies are trusted per-worker adapters, not remotely supplied policy.
 */
export function createProviderBroker(dependencies: ProviderDependencies) {
  const d = Object.freeze({ provider: dependencies.provider, operations: dependencies.operations,
    host: dependencies.host, policy: dependencies.policy, authority: dependencies.authority,
    journal: dependencies.journal, audit: dependencies.audit, credentials: dependencies.credentials,
    clock: dependencies.clock.bind(dependencies) });
  label.parse(d.provider);
  const registry = new Map<string, ProviderOperation>();
  for (const operation of d.operations) {
    label.parse(operation.name);
    label.parse(operation.version);
    insist(!registry.has(operation.name) && !["constructor", "prototype", "__proto__"].includes(operation.name), "INVALID_ARGUMENTS");
    insist(["read", "write", "reserved"].includes(operation.tier) &&
      ["none", "managed"].includes(operation.lifecycle) && Number.isSafeInteger(operation.timeoutMs) &&
      operation.timeoutMs >= 1 && operation.timeoutMs <= 30_000, "INVALID_ARGUMENTS");
    insist(typeof operation.prepare === "function" && typeof operation.execute === "function" &&
      typeof operation.project === "function", "INVALID_ARGUMENTS");
    registry.set(operation.name, Object.freeze({ name: operation.name, version: operation.version,
      tier: operation.tier, timeoutMs: operation.timeoutMs, lifecycle: operation.lifecycle,
      prepare: operation.prepare.bind(operation), execute: operation.execute.bind(operation),
      project: operation.project.bind(operation) }));
  }
  const clock = () => {
    const now = d.clock();
    insist(Number.isSafeInteger(now) && now >= 0, "DEPENDENCY_UNAVAILABLE");
    return now;
  };
  return Object.freeze({
    async call(tool: unknown, raw: unknown, runtimeContext: unknown, requestKey: unknown): Promise<ProviderResult> {
      const event = randomUUID();
      let operation: ProviderOperation | undefined;
      let caller: Principal | null = null;
      let target: AuthorizationTarget | null = null;
      let journalKey: string | null = null;
      let claimed = false;
      let intent = false;
      let started = false;
      let credential: CredentialLease | null = null;
      let failure: ProviderCode = "DEPENDENCY_UNAVAILABLE";
      const record = async (phase: "intent" | "outcome" | "refused", decision: "ALLOW" | ProviderCode) => {
        try {
          await d.audit.append(Object.freeze({ event, time: clock(), phase, decision,
            contract: PROVIDER_CONTRACT, provider: d.provider, tool: operation?.name ?? null,
            principalHash: caller ? canonicalHash(caller) : null,
            targetHash: target ? canonicalHash(target) : null }));
        } catch { throw new Denied(started ? "OUTCOME_UNCERTAIN" : "AUDIT_UNAVAILABLE"); }
      };
      try {
        insist(typeof tool === "string" && registry.has(tool), "UNKNOWN_TOOL");
        operation = registry.get(tool)!;
        failure = "INVALID_ARGUMENTS";
        label.parse(requestKey);
        jsonData(raw);
        const plan = prepared(operation.prepare(raw));
        failure = "IDENTITY_UNAVAILABLE";
        caller = principal(await d.host.authenticate(runtimeContext));
        failure = "POLICY_DENIED";
        const snapshot = policy(await d.policy.read(caller, operation.name), caller, plan);
        failure = "RESOURCE_CHANGED";
        insist(await d.host.revalidate(caller, plan.resource), "RESOURCE_CHANGED");
        target = immutable({ contract: PROVIDER_CONTRACT, provider: d.provider, tool: operation.name,
          version: operation.version, tier: operation.tier, principal: caller, resource: plan.resource,
          argumentsHash: canonicalHash(plan.arguments), planHash: canonicalHash(plan.plan),
          artifactDigest: plan.artifactDigest, policyRevision: snapshot.revision });
        let evidence: NativeEvidence | null = null;
        if (operation.tier === "reserved") {
          insist(d.authority !== null, "AUTHORIZATION_UNAVAILABLE");
          failure = "AUTHORIZATION_UNAVAILABLE";
          evidence = validEvidence(await d.authority.verify(target, runtimeContext), target, clock());
        }
        const revalidate = async () => {
          failure = "IDENTITY_UNAVAILABLE";
          insist(canonicalHash(principal(await d.host.authenticate(runtimeContext))) === canonicalHash(caller), "IDENTITY_UNAVAILABLE");
          failure = "POLICY_CHANGED";
          insist(canonicalHash(policy(await d.policy.read(caller!, operation!.name), caller!, plan)) === canonicalHash(snapshot), "POLICY_CHANGED");
          failure = "RESOURCE_CHANGED";
          insist(await d.host.revalidate(caller!, plan.resource), "RESOURCE_CHANGED");
        };
        await revalidate();
        await record("intent", "ALLOW");
        intent = true;
        journalKey = canonicalHash({ provider: d.provider, tool: operation.name, company: caller.company,
          agent: caller.agent, project: caller.project, task: caller.task, requestKey });
        failure = "DEPENDENCY_UNAVAILABLE";
        claimed = await d.journal.claim(journalKey, canonicalHash(target), event);
        insist(claimed, "REPLAY_CONFLICT");
        failure = "CREDENTIAL_UNAVAILABLE";
        credential = await d.credentials.resolve(target);
        // Lease fields may rotate or share mutable storage; capture once before any awaits.
        const credentialValue = credential.value;
        const redactions = credential.redactions;
        insist(typeof credentialValue === "string" && Buffer.byteLength(credentialValue) >= 5 && credentialValue.length <= 16384 &&
          Array.isArray(redactions) && redactions.length <= 64 &&
          Reflect.ownKeys(redactions).length === redactions.length + 1, "CREDENTIAL_UNAVAILABLE");
        const credentialSnapshot = [credentialValue];
        for (let i = 0; i < redactions.length; ++i) {
          const item = Object.getOwnPropertyDescriptor(redactions, String(i));
          insist(item?.enumerable && Object.hasOwn(item, "value") && typeof item.value === "string" &&
            Buffer.byteLength(item.value) >= 5 && item.value.length <= 16384, "CREDENTIAL_UNAVAILABLE");
          credentialSnapshot.push(item.value);
        }
        Object.freeze(credentialSnapshot);
        await revalidate();
        if (evidence !== null) {
          failure = "AUTHORIZATION_UNAVAILABLE";
          validEvidence(evidence, target, clock());
          insist(await d.authority!.consume(evidence, target, clock()), "AUTHORIZATION_DENIED");
          await revalidate();
          validEvidence(evidence, target, clock());
        }
        // Provider preconditions close the remaining host/provider TOCTOU boundary.
        // A timeout cannot prove cancellation; keep the claim uncertain, never retry.
        failure = "UPSTREAM_UNAVAILABLE";
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = performance.now() + operation.timeoutMs;
        started = true;
        const pending = Promise.resolve().then(() => operation!.execute(plan, credentialValue, controller.signal, journalKey!));
        let output: unknown;
        try {
          output = await Promise.race([pending, new Promise<never>((_, reject) => {
            timer = setTimeout(() => { reject(new Denied("OUTCOME_UNCERTAIN")); controller.abort(); }, operation!.timeoutMs);
          })]);
          if (performance.now() >= deadline) {
            controller.abort();
            throw new Denied("OUTCOME_UNCERTAIN");
          }
        } finally { clearTimeout(timer); }
        failure = "OUTPUT_REFUSED";
        const value = immutable(operation.project(output));
        noCredentialOutput(value, credentialSnapshot);
        failure = "CREDENTIAL_UNAVAILABLE";
        await credential.close();
        credential = null;
        failure = "OUTCOME_UNCERTAIN";
        await d.journal.finish(journalKey, event, "complete");
        await record("outcome", "ALLOW");
        return { ok: true, value, event };
      } catch (error) {
        let code = error instanceof Denied ? error.code : failure;
        if (started && operation?.tier !== "read") code = "OUTCOME_UNCERTAIN";
        if (credential !== null) {
          try { await credential.close(); }
          catch { code = started ? "OUTCOME_UNCERTAIN" : "CREDENTIAL_UNAVAILABLE"; }
        }
        if (claimed && journalKey !== null) {
          try { await d.journal.finish(journalKey, event, started ? "uncertain" : "refused"); }
          catch { code = started ? "OUTCOME_UNCERTAIN" : "DEPENDENCY_UNAVAILABLE"; }
        }
        try { await record(intent ? "outcome" : "refused", code); }
        catch { code = started ? "OUTCOME_UNCERTAIN" : "AUDIT_UNAVAILABLE"; }
        return { ok: false, code, event };
      }
    },
  });
}
