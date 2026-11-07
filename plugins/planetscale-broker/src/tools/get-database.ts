import { oneOf } from "../../../../packages/core/src/schema.js";
import { databaseScope, emptyArguments, flag, identity, prepared, type DatabaseScope, type PreparedRead } from "../metadata.js";

export const operationId = "get_database";
export const tool = "planetscale.get_database";
export interface DatabaseMetadata { readonly name: string; readonly kind: "mysql" | "postgresql" | "neki"; readonly ready: boolean; readonly deletionProtected: boolean }

export function prepare(scope: DatabaseScope, args: unknown): PreparedRead<DatabaseMetadata> {
  const target = databaseScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/databases/${target.database}`, body => Object.freeze({
    name: identity(body, target.database), kind: oneOf(["mysql", "postgresql", "neki"] as const).parse(body.kind),
    ready: flag(body.ready), deletionProtected: flag(body.deletion_protected),
  }));
}
