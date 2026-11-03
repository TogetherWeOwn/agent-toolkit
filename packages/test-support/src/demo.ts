import {
  bindingSchema, boundary, closed, digest, dispatch, expiry, hash, integer, limitsSchema,
  name, owned, prefixedName, Refusal, requireThat,
  type ApprovalAuthority, type ApprovalTarget, type Attempt, type Binding, type DurableAudit,
  type DurableState, type Host, type Limits, type Operation, type Schema,
} from "../../policy/src/index.js";
import type { SyntheticResponse, Transport } from "./transport.js";

export const syntheticOrigin = "https://fixture.invalid";
export const demoBinding: Binding = Object.freeze({ tenant: "tenant-a", agent: "agent-a", project: "project-a", task: "task-a" });
export const demoLimits: Limits = limitsSchema.parse({ maxTtlSeconds: 60, maxSpendMinor: 100, maxResources: 2, unitWorstCaseMinor: 50 });

const inspectSchema = closed({ handle: name });
const provisionSchema = closed({
  handle: name,
  options: closed({ ttlSeconds: integer(1, 10800), spendMinor: integer(0, Number.MAX_SAFE_INTEGER), artifact: digest }),
});
const destroySchema = closed({ handle: name, artifact: digest });
const registry: ReadonlyMap<string, Schema<unknown>> = new Map([
  ["inspect", inspectSchema], ["provision", provisionSchema], ["destroy", destroySchema],
]);

export function approvalTarget(binding: Binding, args: ReturnType<typeof destroySchema.parse>): ApprovalTarget {
  return { binding, operation: "destroy", toolVersion: "1", policyVersion: "1", handle: args.handle, argumentsHash: hash(args) };
}

export class FakeHost implements Host {
  constructor(private readonly canary: string) {}
  now = 1000;
  binding: Binding | null = demoBinding;
  reference: string | undefined;
  secretCalls = 0;
  unavailableSecret = false;
  identity = async (): Promise<Binding | null> => this.binding;
  approvalReference = (): string | undefined => this.reference;
  clock = (): number => this.now;
  secrets = { resolve: async (reference: string): Promise<string> => {
    this.secretCalls++;
    if (this.unavailableSecret || reference !== "fixture-service") throw new Error(this.canary);
    return this.canary;
  } };
}

/** Synthetic-only handler. Not a Paperclip plugin, not a provider adapter, never
 * installable. Every operation runs the same dispatch, schema and policy path.
 */
export class DemoHandler {
  private readonly limits: Limits;
  constructor(
    private readonly host: Host,
    private readonly state: DurableState,
    private readonly approval: ApprovalAuthority,
    private readonly audit: DurableAudit,
    private readonly transport: Transport,
    limits: Limits = demoLimits,
  ) { this.limits = limitsSchema.parse(limits); }

  async invoke(tool: unknown, raw: unknown) {
    const attempt: Attempt = { operation: "unknown", binding: null };
    return boundary(this.audit, this.host.clock, attempt, async intent => {
      const parsed = dispatch(registry, tool, raw);
      const operation = parsed.operation as Operation;
      attempt.operation = operation;
      let binding: Binding;
      try { binding = bindingSchema.parse(await this.host.identity()); } catch { throw new Refusal("identity"); }
      attempt.binding = binding;
      requireThat(hash(binding) === hash(demoBinding), "identity");
      const args = parsed.args as { handle: string };
      prefixedName(args.handle, "demo-");
      const now = integer(0, Number.MAX_SAFE_INTEGER).parse(this.host.clock());

      if (operation === "provision") {
        const input = parsed.args as ReturnType<typeof provisionSchema.parse>;
        const expiresAt = expiry(now, input.options.ttlSeconds, this.limits);
        requireThat(input.options.spendMinor >= this.limits.unitWorstCaseMinor && input.options.spendMinor <= this.limits.maxSpendMinor, "cap");
        // A repeated/ambiguous handle must be reconciled; never extend or reissue.
        requireThat(await this.state.get(args.handle) === null, "conflict");
        await intent();
        await this.state.reserve({ handle: args.handle, binding, fingerprint: hash(input), now, expiresAt,
          worstCaseMinor: this.limits.unitWorstCaseMinor, limits: this.limits });
        try {
          await this.current(binding);
          const secret = await this.host.secrets.resolve("fixture-service");
          // Persisted intent identifies BOTH deterministic child paths before any call.
          for (const child of ["a", "b"]) {
            await this.current(binding);
            requireThat(this.host.clock() < expiresAt, "expired");
            const response = await this.request("POST", `${args.handle}/${child}`, secret, { artifact: input.options.artifact });
            requireThat(response.status === 201 && this.present(response) === true, "upstream");
          }
          await this.state.transition(args.handle, ["intent"], "active");
        } catch {
          await this.state.transition(args.handle, ["intent"], "uncertain");
          throw new Refusal("reconcile");
        }
        return "ready";
      }

      owned(await this.state.get(args.handle), binding, now);
      if (operation === "destroy") {
        const input = parsed.args as ReturnType<typeof destroySchema.parse>;
        requireThat(await this.approval.consume(this.host.approvalReference(), approvalTarget(binding, input), now), "approval");
      }
      await intent();
      await this.current(binding);
      owned(await this.state.get(args.handle), binding, this.host.clock());
      if (operation === "destroy") {
        await this.state.transition(args.handle, ["active"], "cleaning");
        await this.remove(args.handle);
        return "removed";
      }
      const secret = await this.host.secrets.resolve("fixture-service");
      await this.current(binding);
      owned(await this.state.get(args.handle), binding, this.host.clock());
      for (const child of ["a", "b"]) {
        await this.current(binding);
        owned(await this.state.get(args.handle), binding, this.host.clock());
        const response = await this.request("GET", `${args.handle}/${child}`, secret, null);
        requireThat(response.status === 200 && this.present(response) === true, "upstream");
      }
      return "ready";
    });
  }

  private async current(binding: Binding): Promise<void> {
    const current = await this.host.identity();
    requireThat(current !== null && hash(bindingSchema.parse(current)) === hash(binding), "identity");
  }
  private present(response: SyntheticResponse): boolean | null {
    const body = response.body;
    requireThat(Buffer.byteLength(JSON.stringify(body)) <= 4096, "upstream");
    return body !== null && typeof body === "object" && Object.hasOwn(body, "present") && typeof (body as { present?: unknown }).present === "boolean"
      ? (body as { present: boolean }).present : null;
  }
  private async request(method: "GET" | "POST" | "DELETE", path: string, credential: string, body: unknown): Promise<SyntheticResponse> {
    try { return await this.transport.send({ origin: syntheticOrigin, method, path: `/environments/${path}`, credential, body }); }
    catch { throw new Refusal("upstream"); }
  }
  private async remove(handle: string): Promise<void> {
    const secret = await this.host.secrets.resolve("fixture-service");
    let failed = false;
    for (const child of ["a", "b"]) {
      try {
        await this.current(demoBinding);
        const lease = await this.state.get(handle);
        requireThat(lease && hash(lease.binding) === hash(demoBinding) && lease.state === "cleaning", "scope");
        const response = await this.request("DELETE", `${handle}/${child}`, secret, null);
        requireThat(response.status === 204 || response.status === 404, "upstream");
        const check = await this.request("GET", `${handle}/${child}`, secret, null);
        requireThat(check.status === 200 && this.present(check) === false, "upstream");
      } catch { failed = true; }
    }
    requireThat(!failed, "reconcile");
    await this.state.transition(handle, ["cleaning"], "closed");
  }

  /** Manually driven fixture recovery, NOT a scheduler. A real service needs the
   * independent durable coordinator in ADAPTER-CONTRACTS.md before installation.
   */
  async recover(cause: "expiry" | "completion" | "cancellation" | "orphan") {
    const attempt: Attempt = { operation: "destroy", binding: demoBinding };
    return boundary(this.audit, this.host.clock, attempt, async intent => {
      await this.current(demoBinding);
      const leases = await this.state.recoverable();
      await intent();
      for (const lease of leases) {
        requireThat(hash(lease.binding) === hash(demoBinding), "scope");
        if (cause === "expiry" && lease.expiresAt > this.host.clock()) continue;
        // Orphans/partial intents are reconcilable; active unexpired leases are not orphans.
        if (cause === "orphan" && lease.state === "active") continue;
        if (lease.state !== "cleaning") await this.state.transition(lease.handle, ["intent", "uncertain", "active"], "cleaning");
        await this.remove(lease.handle);
      }
      return "removed";
    });
  }
}
