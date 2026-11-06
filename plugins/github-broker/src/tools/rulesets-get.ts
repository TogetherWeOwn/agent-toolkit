import { define, baseJson, id, listShape, listJson, pagination } from "../schema.js";
import { list, object, pick } from "../output.js";
import { guard, type Tool } from "../types.js";
const summary = (r: unknown) => pick(r, ["id", "name", "target", "source_type", "source", "enforcement"]);
const listing = define("github.rulesets_get", "app", "Read one page of repository and inherited ruleset summaries.", listShape, listJson,
  a => [{ permission: "metadata", path: `/rulesets?includes_parents=true&${pagination(a)}` }], b => list(b, summary));
function detail(body: unknown): unknown {
  const v = object(body);
  return { ...summary(v), rules: list(v.rules, r => {
    const rule = object(r), result: Record<string, unknown> = pick(rule, ["type"]);
    if (rule.parameters !== undefined) {
      const params = object(rule.parameters), projected: Record<string, unknown> = {};
      const scalar = ["required_approving_review_count", "dismiss_stale_reviews_on_push", "require_code_owner_review", "require_last_push_approval", "required_review_thread_resolution", "strict_required_status_checks_policy", "do_not_enforce_on_create", "operator", "pattern", "negate", "name"];
      if (scalar.some(k => params[k] !== undefined)) Object.assign(projected, pick(params, scalar));
      if (params.required_status_checks !== undefined) projected.required_status_checks = list(params.required_status_checks, c => pick(c, ["context", "integration_id"]));
      if (params.allowed_merge_methods !== undefined) {
        guard(Array.isArray(params.allowed_merge_methods) && params.allowed_merge_methods.length <= 3 && params.allowed_merge_methods.every(x => ["merge", "squash", "rebase"].includes(x)), "upstream.ruleset");
        projected.allowed_merge_methods = params.allowed_merge_methods;
      }
      result.parameters = projected;
      result.parametersComplete = Object.keys(params).every(k => scalar.includes(k) || k === "required_status_checks" || k === "allowed_merge_methods")
        && (params.required_status_checks === undefined || (params.required_status_checks as unknown[]).every(c => Object.keys(object(c)).every(k => k === "context" || k === "integration_id")));
    }
    return result;
  }), conditionsIncluded: false, bypassActorsIncluded: false };
}
const getting = define("github.rulesets_get", "app", "Read one ruleset's enforcement and supported rule parameters. Unknown parameters are explicitly marked incomplete; bypass actors are excluded.",
  { rulesetId: id }, { rulesetId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } }, a => [{ permission: "metadata", path: `/rulesets/${a.rulesetId}` }], detail);
export const rulesetsGet: Tool = {
  ...listing, description: `${listing.description} Supply both page and perPage for a list, or only rulesetId for details. Omit unused fields; do not mix rulesetId with pagination. Read-only; never a bypass actor.`,
  // Flat discovery metadata only. Both closed execution variants remain intact.
  inputSchema: { type: "object", additionalProperties: false, properties: {
    ...baseJson, ...listJson, rulesetId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  }, required: Object.keys(baseJson) },
  schema: { parse(v) { try { return listing.schema.parse(v); } catch { return getting.schema.parse(v); } } },
  requests(a) { return a.rulesetId === undefined ? listing.requests(a) : getting.requests(a); },
  project(b, a) { return a.rulesetId === undefined ? listing.project(b, a) : getting.project(b, a); },
};
