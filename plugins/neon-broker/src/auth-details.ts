import { closed, identifier, oneOf } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const AUTH_DETAILS_OPERATIONS = ["getAuthDetails"] as const;
export interface NeonAuthDetailsScope {
  readonly accountId: string;
  readonly revision: string;
}
const argumentsSchema = closed({ account_id: identifier });
const authMethod = oneOf(["keycloak", "session_cookie", "api_key_user", "api_key_org", "oauth"] as const);

export function createNeonAuthDetailsOperations(scope: NeonAuthDetailsScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ accountId: identifier, revision: identifier }).parse(scope);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.account_id !== config.accountId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/accounts/${config.accountId}/auth`, revision: config.revision },
      arguments: args, plan: { operation: AUTH_DETAILS_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    const accountId = identifier.parse(field(raw, "account_id"));
    check(accountId === config.accountId && optional(raw, "pagination") === undefined);
    // auth_data is opaque credential/identity material, never read or evaluated.
    return { account_id: accountId, auth_method: authMethod.parse(field(raw, "auth_method")) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${AUTH_DETAILS_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getAuthDetails({ credential, signal });
      project(raw);
      return raw;
    },
    project,
  })]);
}
