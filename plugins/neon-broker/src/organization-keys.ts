import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const ORGANIZATION_KEY_OPERATIONS = ["listOrgApiKeys"] as const;
export interface NeonOrganizationKeyScope {
  readonly organizationId: string;
  readonly revision: string;
  readonly keyIds: readonly number[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const keyId = integer(0, Number.MAX_SAFE_INTEGER);
const argumentsSchema = closed({ org_id: pathId });

export function createNeonOrganizationKeyOperations(scope: NeonOrganizationKeyScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ organizationId: pathId, revision: identifier,
    keyIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => keyId.parse(value)) },
  }).parse(scope);
  const keys = new Set(config.keyIds);
  check(keys.size === config.keyIds.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.org_id !== config.organizationId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/organizations/${config.organizationId}/api_keys`, revision: config.revision },
      arguments: args, plan: { operation: ORGANIZATION_KEY_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    const seen = new Set<number>();
    const apiKeys = rows(raw, MAX_ITEMS).flatMap(value => {
      const id = keyId.parse(field(value, "id"));
      const organizationId = optional(value, "org_id");
      check(organizationId === undefined || organizationId === config.organizationId);
      check(optional(value, "pagination") === undefined);
      check(!seen.has(id));
      seen.add(id);
      // Numeric identity only; token values, creator data and scope metadata are not evaluated.
      return keys.has(id) ? [{ id }] : [];
    });
    return { api_keys: apiKeys };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${ORGANIZATION_KEY_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.listOrgApiKeys(config.organizationId, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
