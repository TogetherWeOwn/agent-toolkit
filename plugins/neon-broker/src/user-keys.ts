import { closed, identifier, integer } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const USER_KEY_OPERATIONS = ["listApiKeys"] as const;
export interface NeonUserKeyScope {
  readonly userId: string;
  readonly revision: string;
  readonly keyIds: readonly number[];
}
const keyId = integer(0, Number.MAX_SAFE_INTEGER);
const argumentsSchema = closed({ user_id: identifier });

export function createNeonUserKeyOperations(scope: NeonUserKeyScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ userId: identifier, revision: identifier,
    keyIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => keyId.parse(value)) },
  }).parse(scope);
  const keys = new Set(config.keyIds);
  check(keys.size === config.keyIds.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.user_id !== config.userId) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/users/${config.userId}/api_keys`, revision: config.revision },
      arguments: args, plan: { operation: USER_KEY_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function ancestry(raw: unknown): void {
    const userId = optional(raw, "user_id");
    check(userId === undefined || userId === config.userId);
    check(optional(raw, "org_id") === undefined && optional(raw, "project_id") === undefined && optional(raw, "branch_id") === undefined);
    check(optional(raw, "pagination") === undefined);
  }
  function user(raw: unknown): void {
    check(identifier.parse(field(raw, "id")) === config.userId);
    ancestry(raw);
  }
  function project(raw: unknown): Json {
    user(field(raw, "user"));
    ancestry(raw);
    const seen = new Set<number>();
    const apiKeys = rows(field(raw, "keys"), MAX_ITEMS).flatMap(value => {
      const id = keyId.parse(field(value, "id"));
      ancestry(value);
      check(!seen.has(id));
      seen.add(id);
      // Identity only; tokens, names, creator and usage data are not evaluated.
      return keys.has(id) ? [{ id }] : [];
    });
    return { api_keys: apiKeys };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${USER_KEY_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      // Prove the exact user with this same credential before the unfiltered path.
      const identity = await transport.getCurrentUserInfo(options);
      user(identity);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = { user: identity, keys: await transport.listApiKeys(options) };
      project(raw);
      return raw;
    },
    project,
  })]);
}
