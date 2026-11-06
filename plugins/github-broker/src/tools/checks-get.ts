import { define, sha, shaJson, listShape, listJson, pagination } from "../schema.js";
import { object, pick, list, run } from "../output.js";

// Required CI contexts are Actions-produced; unknown contexts are evidence only.
// Status payloads have a creator, not an App ID: only Devin's fixed bot identity
// is accepted there. A human-created success with a matching name never passes.
const actionsContexts = new Set(["ci-ok", "gitleaks", "pr-lint", "e2e-ok", "pr-standards", "Analyze (actions)", "Analyze (javascript-typescript)", "Analyze (python)"]);
function producer(value: unknown, fields: string[]): Record<string, unknown> | null {
  return value === undefined || value === null ? null : pick(value, fields);
}
function expectedApp(context: unknown): number | null {
  return context === "CodeQL" ? 57789 : context === "Devin Review" ? 811515 : typeof context === "string" && actionsContexts.has(context) ? 15368 : null;
}
export const checksGet = define("github.checks_get", "app", "Read producer-qualified check runs, commit statuses and workflow runs for an exact SHA, one page each. No overall merge verdict.", { sha, ...listShape }, { sha: shaJson, ...listJson },
  a => [
    { permission: "checks", path: `/commits/${a.sha}/check-runs?${pagination(a)}` },
    // Combined /status omits creator identity. List statuses newest-first instead;
    // only the first occurrence of each context on page 1 is a current signal.
    { permission: "statuses", path: `/commits/${a.sha}/statuses?${pagination(a)}` },
    { permission: "actions", path: `/actions/runs?head_sha=${a.sha}&${pagination(a)}` },
  ], (b, a) => {
    if (Array.isArray(b)) {
      const seen = new Set<unknown>();
      return { sha: a.sha, statuses: list(b, c => {
        const v = object(c), creator = producer(v.creator, ["id", "login", "type"]);
        const current = a.page === 1 && !seen.has(v.context); seen.add(v.context);
        const producerTrusted = v.context === "Devin Review" && creator?.login === "devin-ai-integration[bot]" && creator?.type === "Bot";
        return { ...pick(v, ["id", "context", "state", "target_url", "description", "created_at", "updated_at"]), creator, current, producerTrusted,
          passing: current && producerTrusted && v.state === "success" };
      }) };
    }
    const v = object(b);
    if (Array.isArray(v.check_runs)) return { ...pick(v, ["total_count"]), checkRuns: list(v.check_runs, c => {
      const check = object(c), app = producer(check.app, ["id", "slug"]), expected = expectedApp(check.name);
      const producerTrusted = expected !== null && app?.id === expected;
      return { ...pick(check, ["id", "name", "head_sha", "status", "conclusion", "details_url", "started_at", "completed_at"]), app, producerTrusted,
        passing: producerTrusted && check.head_sha === a.sha && check.status === "completed" && check.conclusion === "success" };
    }) };
    return { ...pick(v, ["total_count"]), workflowRuns: list(v.workflow_runs, run) };
  });

// These are per-signal decisions over bounded pages, not all effective rules or
// a claim that every required context is present. Suites/workflow summaries never
// manufacture a check. Keep this projection safe for scrubbed cache hits too.
export function checkSignals(pages: unknown[]): unknown[] {
  return pages.flatMap(page => {
    const v = object(page);
    if (Array.isArray(v.checkRuns)) return v.checkRuns.map(c => {
      const check = object(c);
      return { source: "check", context: check.name, id: check.id, producer: check.app, producerTrusted: check.producerTrusted, passing: check.passing };
    });
    if (Array.isArray(v.statuses)) return v.statuses.map(c => {
      const status = object(c);
      return { source: "status", context: status.context, id: status.id, producer: status.creator, producerTrusted: status.producerTrusted, passing: status.passing };
    });
    return [];
  });
}
