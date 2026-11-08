import { requireThat } from "../../../packages/core/src/index.js";
import { canonicalHash, createProviderBroker, type ProviderDependencies, type ProviderResult } from "../../../packages/core/src/provider/index.js";
import type { CurrentContentScope } from "./current-content.js";
import { cloudflareReadOperations, type CloudflareReadScope } from "./read-operations.js";

const contentTool = "cloudflare.workers.current_content.digest";

export interface CaptureEvidenceRecord {
  readonly contract: "toolkit.cloudflare-capture/v1";
  readonly subject: "credential-filtered-current-content-projection";
  readonly event: string;
  readonly targetHash: string;
  readonly valueHash: string;
}
export interface CaptureEvidenceSink {
  /** Persist the exact immutable binding before resolving; do not acknowledge
   * buffered writes. A receipt records an observation, not a successful call:
   * the core outcome audit can still fail after this write.
   */
  append(record: CaptureEvidenceRecord): Promise<void>;
}

// Internal composition only. All host/authority/credential/state adapters and
// the durable evidence sink must be independently supplied and qualified.
export function createCloudflareReadBroker(scope: CloudflareReadScope, sourceScope: CurrentContentScope,
  dependencies: Omit<ProviderDependencies, "provider" | "operations">, captureEvidence: CaptureEvidenceSink,
  fetcher: typeof fetch = fetch) {
  requireThat(captureEvidence !== null && typeof captureEvidence?.append === "function", "schema");
  const operations = cloudflareReadOperations(scope, sourceScope, fetcher);
  return Object.freeze({
    async call(tool: unknown, raw: unknown, runtimeContext: unknown, requestKey: unknown): Promise<ProviderResult> {
      // Per-call closure, not shared last-response state. Core generates the event
      // and target hash; neither comes from model input or provider headers.
      let valueHash: string | null = null;
      const broker = createProviderBroker({
        ...dependencies, provider: "cloudflare",
        operations: operations.map(operation => operation.name !== contentTool ? operation : Object.freeze({
          ...operation,
          project(output: unknown) {
            const value = operation.project(output);
            valueHash = canonicalHash(value);
            return value;
          },
        })),
        audit: {
          async append(record) {
            // Core invokes ALLOW outcome only after projection, credential-output
            // refusal, lease cleanup and journal completion. Do not persist a
            // receipt for denied, malformed or credential-reflecting output.
            if (record.tool === contentTool && record.phase === "outcome" && record.decision === "ALLOW") {
              requireThat(valueHash !== null && record.targetHash !== null, "scope");
              await captureEvidence.append(Object.freeze({
                contract: "toolkit.cloudflare-capture/v1", subject: "credential-filtered-current-content-projection",
                event: record.event, targetHash: record.targetHash, valueHash,
              }));
            }
            await dependencies.audit.append(record);
          },
        },
      });
      return broker.call(tool, raw, runtimeContext, requestKey);
    },
  });
}
