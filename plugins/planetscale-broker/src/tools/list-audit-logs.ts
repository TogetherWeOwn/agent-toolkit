import { auditEventListScope, auditEventFirstPage, type AuditEventFirstPage } from "../audit-events.js";
import { emptyArguments, prepared, type PreparedRead } from "../metadata.js";

export const operationId = "list_audit_logs";
export const tool = "planetscale.list_audit_logs";

export function prepare(scope: ReturnType<typeof auditEventListScope.parse>, args: unknown): PreparedRead<AuditEventFirstPage> {
  const target = auditEventListScope.parse(scope);
  emptyArguments.parse(args);
  return prepared(`/v1/organizations/${target.organization}/audit-log?limit=10`,
    body => auditEventFirstPage(body, target.eventIds));
}
