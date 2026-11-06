import { define, sha, shaJson, listShape, listJson, pagination } from "../schema.js";
import { object, pick, list, run } from "../output.js";
export const checksGet = define("github.checks_get", "Read check runs, commit statuses and workflow runs for an exact SHA, one page each.", { sha, ...listShape }, { sha: shaJson, ...listJson },
  a => [
    { permission: "checks", path: `/commits/${a.sha}/check-runs?${pagination(a)}` },
    { permission: "statuses", path: `/commits/${a.sha}/status?${pagination(a)}` },
    { permission: "actions", path: `/actions/runs?head_sha=${a.sha}&${pagination(a)}` },
  ], b => {
    const v = object(b);
    if (Array.isArray(v.check_runs)) return { ...pick(v, ["total_count"]), checkRuns: list(v.check_runs, c => pick(c, ["id", "name", "head_sha", "status", "conclusion", "details_url", "started_at", "completed_at"])) };
    if (Array.isArray(v.statuses)) return { ...pick(v, ["sha", "state", "total_count"]), statuses: list(v.statuses, c => pick(c, ["id", "context", "state", "target_url", "description", "created_at", "updated_at"])) };
    return { ...pick(v, ["total_count"]), workflowRuns: list(v.workflow_runs, run) };
  });
