import { closed, identifier, integer, text } from "../../../packages/core/src/schema.js";
import type { Json, Prepared, ProviderOperation } from "../../../packages/core/src/provider/contracts.js";
import { MAX_ITEMS } from "./metadata.js";
import { boolean, check, field, optional, rows } from "./projection.js";
import type { NeonMetadataTransport } from "./transport.js";

export const AUTH_STATUS_OPERATIONS = ["getNeonAuthAllowLocalhost", "getNeonAuthPhoneNumberPlugin", "getNeonAuthOAuthProviderPlugin"] as const;
type AuthStatusOperation = typeof AUTH_STATUS_OPERATIONS[number];
export interface NeonAuthStatusScope {
  readonly projectId: string;
  readonly revision: string;
  readonly branchIds: readonly string[];
}
const argumentsSchema = closed({ project_id: identifier, branch_id: identifier });
const suffixes = { getNeonAuthAllowLocalhost: "allow_localhost", getNeonAuthPhoneNumberPlugin: "plugins/phone-number",
  getNeonAuthOAuthProviderPlugin: "plugins/oauth-provider" } as const;

// Dedicated status endpoints only; aggregate plugin/email reads may return credentials.
export function createNeonAuthStatusOperations(scope: NeonAuthStatusScope, transport: NeonMetadataTransport): readonly ProviderOperation[] {
  const config = closed({ projectId: identifier, revision: text(80, /^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    branchIds: { parse: (v: unknown) => rows(v, MAX_ITEMS).map(value => identifier.parse(value)) },
  }).parse(scope);
  const branches = new Set(config.branchIds);
  check(branches.size === config.branchIds.length);

  function parse(raw: unknown) {
    const args = argumentsSchema.parse(raw);
    if (args.project_id !== config.projectId || !branches.has(args.branch_id)) throw Error("INVALID_ARGUMENTS");
    return args;
  }
  function prepareFor(name: AuthStatusOperation, raw: unknown): Prepared {
    const args = parse(raw);
    return { resource: { id: `neon/projects/${config.projectId}/branches/${args.branch_id}/auth/${suffixes[name]}`, revision: config.revision },
      arguments: args, plan: { operation: name, ...args }, artifactDigest: null };
  }
  function projectFor(name: AuthStatusOperation, raw: unknown): Json {
    check(optional(raw, "pagination") === undefined);
    const projectId = optional(raw, "project_id");
    const branchId = optional(raw, "branch_id");
    check(projectId === undefined || projectId === config.projectId);
    check(branchId === undefined || branches.has(identifier.parse(branchId)));
    if (name === "getNeonAuthAllowLocalhost") return { allow_localhost: boolean(field(raw, "allow_localhost")) };
    const enabled = boolean(field(raw, "enabled"));
    if (name === "getNeonAuthOAuthProviderPlugin") return { enabled };
    const lifetime = optional(raw, "otp_expires_in");
    return { enabled, ...(lifetime === undefined ? {} : { otp_expires_in: integer(60, 600).parse(lifetime) }) };
  }
  return Object.freeze(AUTH_STATUS_OPERATIONS.map(name => Object.freeze({
    name: `neon.${name}`, version: "1.0.0", tier: "read" as const, lifecycle: "none" as const, timeoutMs: 3500,
    prepare(raw: unknown): Prepared { return prepareFor(name, raw); },
    async execute(prepared: Prepared, credential: string, signal: AbortSignal): Promise<unknown> {
      const args = parse(prepared.arguments);
      const expected = prepareFor(name, args);
      check(prepared.resource.id === expected.resource.id && prepared.resource.revision === expected.resource.revision);
      if (signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const options = { credential, signal };
      const raw = name === "getNeonAuthAllowLocalhost" ? await transport.getNeonAuthAllowLocalhost(config.projectId, args.branch_id, options) :
        name === "getNeonAuthPhoneNumberPlugin" ? await transport.getNeonAuthPhoneNumberPlugin(config.projectId, args.branch_id, options) :
        await transport.getNeonAuthOAuthProviderPlugin(config.projectId, args.branch_id, options);
      // Schemas lack identity fields: binding is the fixed authenticated request path.
      const returnedBranch = optional(raw, "branch_id");
      check(returnedBranch === undefined || returnedBranch === args.branch_id);
      projectFor(name, raw);
      return raw;
    },
    project(raw: unknown): Json { return projectFor(name, raw); },
  })));
}
