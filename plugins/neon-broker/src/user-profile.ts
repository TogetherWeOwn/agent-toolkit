import { closed, identifier, integer } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { check, field, optional } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const USER_PROFILE_OPERATIONS = ["getCurrentUserInfo"] as const;
export interface NeonUserProfileScope {
  readonly userId: string;
  readonly revision: string;
}
const argumentsSchema = closed({ user_id: identifier });
const limit = integer(0, Number.MAX_SAFE_INTEGER);

export function createNeonUserProfileOperations(scope: NeonUserProfileScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ userId: identifier, revision: identifier }).parse(scope);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.user_id !== config.userId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/users/${config.userId}/profile`, revision: config.revision },
      arguments: args, plan: { operation: USER_PROFILE_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    const id = identifier.parse(field(raw, "id"));
    check(id === config.userId);
    return { id, projects_limit: limit.parse(field(raw, "projects_limit")),
      branches_limit: limit.parse(field(raw, "branches_limit")) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${USER_PROFILE_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getCurrentUserInfo({ credential, signal });
      // /users/me has no target parameter: its response must prove the expected user.
      project(raw);
      return raw;
    },
    project,
  })]);
}
