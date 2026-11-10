import { requireThat } from "../../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, prepared, type PreparedRead } from "../metadata.js";
import { keyspaceScope } from "../topology.js";

export const operationId = "get_keyspace_vschema";
export const tool = "planetscale.get_keyspace_vschema";

export interface VschemaAvailability {
  readonly requestKeyspaceId: string;
  readonly rawReported: boolean;
  readonly provenance: "not-established";
  readonly executionAuthority: "not-established";
}

export function prepare(scope: ReturnType<typeof keyspaceScope.parse>, args: unknown): PreparedRead<VschemaAvailability> {
  const target = keyspaceScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/keyspaces/${target.keyspace.name}/vschema`, body => {
    requireThat(typeof body.raw === "string" && body.raw.length <= 32768, "upstream");
    // The official body has no target identity. Presence is not schema validity,
    // current keyspace ownership, completeness or permission to execute it.
    return Object.freeze({
      requestKeyspaceId: target.keyspace.id, rawReported: body.raw.length > 0,
      provenance: "not-established", executionAuthority: "not-established",
    });
  });
}
