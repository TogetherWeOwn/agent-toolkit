import { jsonData, requireThat } from "../../../packages/core/src/index.js";
import { canonicalHash, type Json, type Prepared, type ProviderOperation, type Tier } from "../../../packages/core/src/provider/index.js";
import { currentContentDescriptor, type CurrentContentScope } from "./current-content.js";
import { metadataDescriptors, type MetadataDescriptor, type MetadataScope, type PreparedMetadata } from "./metadata.js";
import { currentContentTransport, metadataTransport } from "./metadata-transport.js";

function json(value: unknown): Json {
  jsonData(value);
  return JSON.parse(JSON.stringify(value)) as Json;
}

function bind<A>(descriptor: {
  readonly name: string;
  readonly version: string;
  readonly providerOperationId: string;
  prepare(raw: unknown): PreparedMetadata<A>;
}, tier: Tier, read: (raw: unknown, credential: string, signal: AbortSignal) => Promise<unknown>): ProviderOperation {
  // Core v1 project(raw) has no prepared argument. Keep each already-projected
  // response behind its own opaque receipt, never a shared last-request slot.
  const results = new WeakMap<object, Json>();
  function prepare(raw: unknown): Prepared {
    const input = descriptor.prepare(raw);
    return {
      resource: input.resource,
      arguments: json(input.arguments),
      plan: json({ kind: "bounded-current-read", providerOperationId: descriptor.providerOperationId,
        request: input.request, providerDryRun: false, providerRevisionFence: "not-established" }),
      artifactDigest: null,
    };
  }
  return Object.freeze({
    name: descriptor.name, version: descriptor.version, tier, timeoutMs: 10000, lifecycle: "none" as const,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal) {
      requireThat(canonicalHash(prepare(prepared.arguments)) === canonicalHash(prepared), "scope");
      requireThat(!signal.aborted, "upstream");
      const value = json(await read(prepared.arguments, credential, signal));
      requireThat(!signal.aborted, "upstream");
      const receipt = Object.freeze({});
      results.set(receipt, value);
      return receipt;
    },
    project(raw: unknown): Json {
      requireThat(raw !== null && typeof raw === "object" && results.has(raw), "scope");
      const value = results.get(raw)!;
      results.delete(raw);
      return value;
    },
  });
}

// Internal operation registry only; no tool registration or host/policy/credential
// defaults. Call solely through reviewed createProviderBroker with accepted adapters.
export function cloudflareReadOperations(scope: MetadataScope, sourceScope: CurrentContentScope,
  fetcher: typeof fetch = fetch): readonly ProviderOperation[] {
  requireThat(scope.accountId === sourceScope.accountId && scope.revision === sourceScope.revision, "scope");
  const descriptors = metadataDescriptors(scope);
  const read = metadataTransport(fetcher);
  function metadata<A, O>(descriptor: MetadataDescriptor<A, O>): ProviderOperation {
    return bind(descriptor, "read", (args, credential, signal) => read(descriptor, args, credential, signal));
  }
  const content = currentContentDescriptor(sourceScope);
  const readContent = currentContentTransport(fetcher);
  return Object.freeze([
    metadata(descriptors.workersList), metadata(descriptors.secretNames),
    metadata(descriptors.hyperdriveList), metadata(descriptors.hyperdriveGet),
    metadata(descriptors.d1List), metadata(descriptors.d1Get),
    metadata(descriptors.r2List), metadata(descriptors.r2Get),
    metadata(descriptors.deploymentsList), metadata(descriptors.deploymentGet),
    metadata(descriptors.versionsList), metadata(descriptors.versionGet),
    metadata(descriptors.kvNamespacesList), metadata(descriptors.kvNamespaceGet),
    metadata(descriptors.queuesList), metadata(descriptors.queueGet),
    metadata(descriptors.workerSubdomainGet), metadata(descriptors.workerSettingsGet),
    // Source acquisition needs exact native authority, even for digest-only output.
    bind(content, "reserved", (args, credential, signal) => readContent(content, args, credential, signal)),
  ]);
}
