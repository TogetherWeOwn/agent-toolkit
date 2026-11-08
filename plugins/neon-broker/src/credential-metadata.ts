import { closed, identifier, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const CREDENTIAL_METADATA_OPERATIONS = ["listCredentials"] as const;
export interface NeonCredentialMetadataScope {
  readonly projectId: string;
  readonly branchId: string;
  readonly revision: string;
  readonly tokenIds: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId });

export function createNeonCredentialMetadataOperations(scope: NeonCredentialMetadataScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, branchId: pathId, revision: identifier,
    tokenIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => identifier.parse(value)) },
  }).parse(scope);
  const tokens = new Set(config.tokenIds);
  check(tokens.size === config.tokenIds.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || args.branch_id !== config.branchId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${config.branchId}/credentials`, revision: config.revision },
      arguments: args, plan: { operation: CREDENTIAL_METADATA_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function ancestry(raw: unknown) {
    const projectId = optional(raw, "project_id");
    const branchId = optional(raw, "branch_id");
    check(projectId === undefined || projectId === config.projectId);
    check(branchId === undefined || branchId === config.branchId);
    check(optional(raw, "pagination") === undefined);
  }
  function project(raw: unknown): Json {
    ancestry(raw);
    const seen = new Set<string>();
    const credentials = rows(field(raw, "credentials"), MAX_ITEMS).flatMap(value => {
      const tokenId = identifier.parse(field(value, "token_id"));
      ancestry(value);
      check(!seen.has(tokenId));
      seen.add(tokenId);
      // Only opaque identity is projected; scopes, dates and secret-like extras are never evaluated.
      return tokens.has(tokenId) ? [{ token_id: tokenId, branch_id: config.branchId }] : [];
    });
    return { credentials };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${CREDENTIAL_METADATA_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.listCredentials(config.projectId, config.branchId, { credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
