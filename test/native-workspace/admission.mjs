// No admission mechanism has been approved for the original dependency graph.
// A timestamp or data supplied by a pull request is never proof of approval.
export function assertOriginalGraphAdmission(admission, now = Date.now()) {
  if (!admission || typeof admission.expiresAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(admission.expiresAt) ||
      !Number.isFinite(Date.parse(admission.expiresAt)) || Date.parse(admission.expiresAt) <= now) {
    throw new Error('Original graph admission missing or expired');
  }
  // Future integration must verify trusted, exact-scope Security approval here.
  throw new Error('Original graph admission is not approved');
}
