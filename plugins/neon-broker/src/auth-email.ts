import { closed, identifier, oneOf, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const AUTH_EMAIL_OPERATIONS = ["getNeonAuthEmailAndPasswordConfig"] as const;
export interface NeonAuthEmailScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
}
const pathId = text(60, /^[a-z0-9-]+$/);
const argumentsSchema = closed({ project_id: pathId, branch_id: pathId });

export function createNeonAuthEmailOperations(scope: NeonAuthEmailScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: pathId, revision: identifier,
    branchIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => pathId.parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  check(branches.size === config.branchIds.length);
  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || !branches.has(args.branch_id)) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepare(raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${args.branch_id}/auth/email_and_password`, revision: config.revision },
      arguments: args, plan: { operation: AUTH_EMAIL_OPERATIONS[0], ...args }, artifactDigest: null };
  }
  function project(raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    const projectId = optional(raw, "project_id");
    const branchId = optional(raw, "branch_id");
    check(projectId === undefined || projectId === config.projectId);
    check(branchId === undefined || branches.has(pathId.parse(branchId)));
    return { enabled: boolean(field(raw, "enabled")),
      email_verification_method: oneOf(["link", "otp"]).parse(field(raw, "email_verification_method")),
      require_email_verification: boolean(field(raw, "require_email_verification")),
      auto_sign_in_after_verification: boolean(field(raw, "auto_sign_in_after_verification")),
      send_verification_email_on_sign_up: boolean(field(raw, "send_verification_email_on_sign_up")),
      send_verification_email_on_sign_in: boolean(field(raw, "send_verification_email_on_sign_in")),
      disable_sign_up: boolean(field(raw, "disable_sign_up")),
      revoke_sessions_on_password_reset: boolean(field(raw, "revoke_sessions_on_password_reset")) };
  }
  return Object.freeze([Object.freeze({
    name: `neon.${AUTH_EMAIL_OPERATIONS[0]}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare,
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepare(args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const raw = await transport.getNeonAuthEmailAndPasswordConfig(config.projectId, args.branch_id, { credential, signal });
      // The schema has no identity: the fixed request binds it; contradictory extras refuse.
      const branchId = optional(raw, "branch_id");
      check(branchId === undefined || branchId === args.branch_id);
      project(raw);
      return raw;
    },
    project,
  })]);
}
