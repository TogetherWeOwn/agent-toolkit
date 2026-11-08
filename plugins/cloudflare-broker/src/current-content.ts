import { createHash } from "node:crypto";
import { closed, requireThat, text } from "../../../packages/core/src/index.js";
import type { PreparedMetadata } from "./metadata.js";

const accountId = text(32, /^[a-f0-9]{32}$/);
const scriptName = text(128, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const script = closed({ scriptName });
const maxResponseBytes = 131072;
type Arguments = ReturnType<typeof script.parse>;

export interface CurrentContentScope {
  accountId: string;
  revision: string;
  sourceDigestScriptNames?: readonly string[];
}

// Source access requires separate native authorization even when output is a digest.
// No transport: the pinned schema does not specify a usable success media type.
export function currentContentDescriptor(scope: CurrentContentScope) {
  const account = accountId.parse(scope.accountId);
  const revision = text(80, /^[A-Za-z0-9][A-Za-z0-9_.-]*$/).parse(scope.revision);
  const names = scope.sourceDigestScriptNames ?? [];
  requireThat(Array.isArray(names) && names.length <= 100, "cap");
  const scripts = new Set(names.map(value => scriptName.parse(value)));
  const preparations = new WeakSet<object>();
  return Object.freeze({
    name: "cloudflare.workers.current_content.digest",
    version: "1" as const,
    tier: "read" as const,
    providerOperationId: "worker-script-get-content",
    prepare(raw: unknown): PreparedMetadata<Arguments> {
      const args = script.parse(raw);
      requireThat(scripts.has(args.scriptName), "scope");
      const prepared = Object.freeze({
        arguments: args,
        resource: Object.freeze({ id: `cloudflare:account:${account}:worker:${args.scriptName}:current-content`, revision }),
        request: Object.freeze({
          method: "GET" as const,
          path: `/accounts/${account}/workers/scripts/${args.scriptName}/content/v2`,
          maxResponseBytes, timeoutMs: 10000, maxRequests: 1 as const, redirects: "deny" as const,
        }),
      });
      preparations.add(prepared);
      return prepared;
    },
    project(body: Uint8Array, prepared: PreparedMetadata<Arguments>) {
      requireThat(preparations.has(prepared), "scope");
      requireThat(body instanceof Uint8Array && body.byteLength > 0 && body.byteLength <= maxResponseBytes, "cap");
      return Object.freeze({
        scriptName: prepared.arguments.scriptName,
        semantics: "current-only" as const,
        digest: Object.freeze({
          algorithm: "sha256" as const,
          subject: "captured-response-body" as const,
          hex: createHash("sha256").update(body).digest("hex"),
          byteLength: body.byteLength,
        }),
        historicalBinding: "not-established" as const,
        moduleAttribution: "not-parsed" as const,
        libraryVersions: "unavailable" as const,
      });
    },
  });
}
