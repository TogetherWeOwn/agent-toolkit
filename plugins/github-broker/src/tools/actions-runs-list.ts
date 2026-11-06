import { define, listShape, listJson, pagination } from "../schema.js";
import { object, pick, list, run } from "../output.js";
export const actionsRunsList = define("github.actions_runs_list", "List one page of authorized repository workflow runs. No logs, artifacts, dispatch or rerun.", listShape, listJson,
  a => [{ permission: "actions", path: `/actions/runs?${pagination(a)}` }], b => ({ ...pick(b, ["total_count"]), workflowRuns: list(object(b).workflow_runs, run) }));
