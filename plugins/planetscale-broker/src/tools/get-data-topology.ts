import { closed, identifier, requireThat } from "../../../../packages/core/src/schema.js";
import { branchPath, emptyArguments, prepared, record, slug, type PreparedRead } from "../metadata.js";

export const operationId = "get_data_topology";
export const tool = "planetscale.get_data_topology";
export const scopeSchema = closed({ organization: slug, database: slug, branch: slug, branchId: identifier });

export interface DataTopologyAvailability {
  readonly requestBranchId: string;
  readonly topologyReported: boolean;
  readonly syncTimeReported: boolean;
  readonly freshness: "not-established";
  readonly provenance: "not-established";
}

export function prepare(scope: ReturnType<typeof scopeSchema.parse>, args: unknown): PreparedRead<DataTopologyAvailability> {
  const target = scopeSchema.parse(scope);
  emptyArguments.parse(args);
  return prepared(`${branchPath(target)}/data-topology`, body => {
    const topology = record(body.data_topology);
    const keys = Object.keys(topology);
    requireThat(keys.length <= 32, "upstream");
    requireThat(body.synced_at === null || (typeof body.synced_at === "string" && body.synced_at.length <= 80), "upstream");
    // NekiDataTopology leaves its contents opaque and supplies no target identity.
    // Neither an object entry nor a sync string establishes topology or freshness.
    return Object.freeze({
      requestBranchId: target.branchId, topologyReported: keys.length > 0,
      syncTimeReported: typeof body.synced_at === "string" && body.synced_at.length > 0,
      freshness: "not-established", provenance: "not-established",
    });
  });
}
