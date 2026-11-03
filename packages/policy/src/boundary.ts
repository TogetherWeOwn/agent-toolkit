import { randomUUID } from "node:crypto";
import { bindingSchema, hash, type AuditRecord, type Binding, type DurableAudit, type Operation } from "./contracts.js";
import { codes, Refusal, integer, requireThat, type Code, type Schema } from "./schema.js";

export type SafeResult = { ok: true; status: "ready" | "removed" } | { ok: false; code: Code };
export interface Attempt {
  operation: Operation | "unknown";
  binding: Binding | null;
}

export function dispatch<T>(registry: ReadonlyMap<string, Schema<T>>, tool: unknown, args: unknown): { operation: string; args: T } {
  requireThat(typeof tool === "string" && registry.has(tool), "unknown_tool");
  return { operation: tool, args: registry.get(tool)!.parse(args) };
}

/** No free-form strings, provider fields, exceptions or raw arguments enter audit.
 * Identity is represented by a one-way binding digest, not a caller-supplied ID.
 */
export async function boundary(
  audit: DurableAudit,
  clock: () => number,
  attempt: Attempt,
  run: (intent: () => Promise<void>) => Promise<"ready" | "removed">,
): Promise<SafeResult> {
  const event = randomUUID();
  let intentWritten = false;
  const emit = async (phase: AuditRecord["phase"], decision: AuditRecord["decision"]) => {
    try {
      const operation = ["inspect", "provision", "destroy"].includes(attempt.operation) ? attempt.operation : "unknown";
      let binding: Binding | null = null;
      try { binding = bindingSchema.parse(attempt.binding); } catch { /* Unverified identity is never logged. */ }
      await audit.append(Object.freeze({
        event, time: integer(0, Number.MAX_SAFE_INTEGER).parse(clock()),
        bindingHash: hash(binding), operation,
        phase, decision, policyVersion: "1",
      }));
    } catch {
      throw new Refusal("audit");
    }
  };
  try {
    const status = await run(async () => { await emit("intent", "allow"); intentWritten = true; });
    requireThat(status === "ready" || status === "removed", "upstream");
    await emit("outcome", "allow");
    return { ok: true, status };
  } catch (error) {
    const code = error instanceof Refusal && codes.includes(error.code) ? error.code : "unavailable";
    try { await emit(intentWritten ? "outcome" : "refused", code); } catch { return { ok: false, code: "audit" }; }
    return { ok: false, code };
  }
}
