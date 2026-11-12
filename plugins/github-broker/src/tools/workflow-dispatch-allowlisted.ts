import { closed, oneOf, requireThat, text, type Schema } from "../../../../packages/core/src/index.js";
import { define, planHash, refJson, sha } from "../schema.js";
import type { Arguments, Tool } from "../types.js";

/**
 * The only GitHub write this broker exposes (TWO-5764 tier 1).
 *
 * Exact allowlist, deny by default:
 * - Repositories bound per repository (see `repoWorkflows` below). The board
 *   must additionally bind the numeric repo ID to the caller's
 *   project/workspace and assign the issue to the devops-profiled agent.
 * - Workflows: `TogetherWeOwn/two-bot-next` allows staging-migrate.yml,
 *   deploy-staging.yml and staging-rollback-drill.yml; `TogetherWeOwn/two-web-next`
 *   allows staging-rollback-drill.yml only (the live web repo has no
 *   staging-migrate.yml or deploy-staging.yml). No production workflow
 *   (deploy.yml, release*, etc.) can be named; any other value fails the
 *   closed schema or the per-repo allowlist before any credential is resolved.
 * - Ref: `main` only. Dispatching an unreviewed branch/tag/SHA would run
 *   unreviewed code under the staging credential, so it is refused.
 * - Inputs: validated against each workflow's live `on.workflow_dispatch.inputs`
 *   (confirmed against `main` on 2026-11-11; see README for the recorded
 *   confirmation). Unknown input keys are refused. Input values are bounded
 *   non-secret strings; GitHub receives them as workflow inputs, never as
 *   shell or credentials.
 * - Profile: only agents bound to the `devops` profile, which grants this
 *   tool and nothing else. Every attempt is audited with the validated,
 *   non-secret dispatch coordinates (workflow, ref, inputs) in intent and
 *   outcome records (see `broker.ts`). No production workflow can be dispatched.
 *
 * staging-migrate plan/apply binding (live `staging-migrate.yml`, two-bot-next):
 * required inputs are `mode`, `source_sha` (40-hex reviewed commit on main),
 * `staging_host`, `staging_database`, `recovery_evidence_ref`, `acl_plan_ref`;
 * optional inputs default to `""` in the workflow (`staging_branch_id`,
 * `expected_pending`, `expected_store_pending`, `plan_manifest_sha256`,
 * `store_plan_manifest_sha256`, `plan_run_id`). This broker requires all
 * twelve keys explicitly (optional ones may be `""`) so the dispatch body is
 * exact and testable. Plan mode requires the three apply bindings to be `""`;
 * apply mode requires `plan_manifest_sha256`/`store_plan_manifest_sha256`
 * (64-hex manifest digests), `plan_run_id` (numeric run id of the reviewed
 * plan), matching `expected_*` lists where the reviewed plan listed them; the
 * workflow downloads the plan run's artifact by `plan_run_id` and refuses
 * unless the manifest hash matches on the same `source_sha`.
 *
 * deploy-staging / staging-rollback-drill: the broker sends `{}` so every
 * declared input takes its reviewed default (deploy-staging declares six
 * optional fault-injection/fence switches defaulting false and `sha` empty =
 * workflow head; two-bot staging-rollback-drill declares optional
 * `target_version`, empty = automatic rollback proof; two-web
 * staging-rollback-drill declares none). The fault-injection/`target_version`
 * switches are deliberately not exposed by this tool.
 */
const description = "Dispatch one allowlisted staging workflow on main with actions:write. two-bot-next: staging-migrate.yml plan/apply, deploy-staging.yml, staging-rollback-drill.yml. two-web-next: staging-rollback-drill.yml only. DevOps profile only. No production workflow can be dispatched.";
const workflow = (name: string) => oneOf([name] as const);
const inputs = (shape: Record<string, Schema<unknown>>) => closed(shape);
const noInputs = inputs({});

/** Empty string (the workflow's reviewed default) or a value matching `pattern`. */
function optionalText(max: number, pattern: RegExp): Schema<string> {
  const inner = text(max, pattern);
  return { parse(v) { if (v === "") return v; return inner.parse(v); } };
}
/** Bare staging host: lowercase DNS name, no scheme/userinfo/port, never a pooler endpoint. */
const stagingHost = {
  parse(v: unknown): string {
    const parsed = text(253, /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/).parse(v);
    requireThat(!parsed.includes("-pooler"), "schema");
    return parsed;
  },
};
const stagingDatabase = text(63, /^[a-z0-9][a-z0-9_]*$/);
const branchId = optionalText(63, /^[A-Za-z0-9_-]+$/);
/** Bare card/document refs: no `@`, URL or whitespace, per the workflow's own rule. */
const bareRef = text(200, new RegExp(refJson.pattern));
/** Ascending comma-separated canonical positive i64 versions, or empty when none pending. */
const versionList: Schema<string> = {
  parse(v) {
    if (v === "") return v;
    requireThat(typeof v === "string" && v.length > 0 && v.length <= 512, "schema");
    const parts = (v as string).split(",");
    requireThat(parts.length >= 1 && parts.length <= 128 && parts.every(p => /^[1-9][0-9]{0,19}$/.test(p)), "schema");
    const values = parts.map(p => BigInt(p));
    requireThat(values.every(x => x <= BigInt("9223372036854775807")), "schema");
    requireThat(values.every((x, i) => i === 0 || values[i - 1]! < x), "schema");
    return v as string;
  },
};
const manifest = optionalText(64, /^[a-f0-9]{64}$/);
const runId = optionalText(20, /^[1-9][0-9]{0,19}$/);
const empty = oneOf([""]);

const migratePlanInputs = inputs({
  mode: oneOf(["plan"]), source_sha: sha, staging_host: stagingHost, staging_database: stagingDatabase,
  staging_branch_id: branchId, recovery_evidence_ref: bareRef, acl_plan_ref: bareRef,
  expected_pending: versionList, expected_store_pending: versionList,
  plan_manifest_sha256: empty, store_plan_manifest_sha256: empty, plan_run_id: empty,
});
const migrateApplyInputs = inputs({
  mode: oneOf(["apply"]), source_sha: sha, staging_host: stagingHost, staging_database: stagingDatabase,
  staging_branch_id: branchId, recovery_evidence_ref: bareRef, acl_plan_ref: bareRef,
  expected_pending: versionList, expected_store_pending: versionList,
  plan_manifest_sha256: planHash, store_plan_manifest_sha256: planHash,
  plan_run_id: text(20, /^[1-9][0-9]{0,19}$/),
});
const shaJson = { type: "string", pattern: "^[a-f0-9]{40}$" };
const hostJson = { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$", maxLength: 253 };
const databaseJson = { type: "string", pattern: "^[a-z0-9][a-z0-9_]*$", maxLength: 63 };
const branchJson = { type: "string", pattern: "^(?:$|[A-Za-z0-9_-]{1,63})$" };
const versionListJson = { type: "string", pattern: "^(?:$|[1-9][0-9]*(?:,[1-9][0-9]*)*)$", maxLength: 512 };
const manifestJson = { type: "string", pattern: "^(?:$|[a-f0-9]{64})$" };
const runIdJson = { type: "string", pattern: "^(?:$|[1-9][0-9]{0,19})$" };
const migrateInputJson = {
  mode: { enum: ["plan", "apply"] },
  source_sha: shaJson, staging_host: hostJson, staging_database: databaseJson,
  staging_branch_id: branchJson, recovery_evidence_ref: refJson, acl_plan_ref: refJson,
  expected_pending: versionListJson, expected_store_pending: versionListJson,
  plan_manifest_sha256: manifestJson, store_plan_manifest_sha256: manifestJson,
  plan_run_id: runIdJson,
};
const variants = [
  define("github.workflow_dispatch_allowlisted", "app", `${description} staging-migrate plan: inputs {mode:"plan", source_sha:<40-hex>, staging_host, staging_database, staging_branch_id, recovery_evidence_ref, acl_plan_ref, expected_pending, expected_store_pending, plan_manifest_sha256:"", store_plan_manifest_sha256:"", plan_run_id:""}. Two-bot-next only.`, { workflow: workflow("staging-migrate.yml"), ref: oneOf(["main"]), inputs: migratePlanInputs }, { workflow: { const: "staging-migrate.yml" }, ref: { const: "main" }, inputs: { type: "object", additionalProperties: false, properties: migrateInputJson } },
    a => [{ permission: "actions", level: "write" as const, method: "POST" as const, expectedStatus: 204, path: `/actions/workflows/${encodeURIComponent(String(a.workflow))}/dispatches`, body: JSON.stringify({ ref: String(a.ref), inputs: a.inputs }) }], projectDispatch),
  define("github.workflow_dispatch_allowlisted", "app", `${description} staging-migrate apply: inputs {mode:"apply", source_sha:<40-hex>, staging_host, staging_database, staging_branch_id, recovery_evidence_ref, acl_plan_ref, expected_pending, expected_store_pending, plan_manifest_sha256:<64-hex>, store_plan_manifest_sha256:<64-hex>, plan_run_id:<numeric>}. The manifest hashes bind apply to its reviewed plan run. Two-bot-next only.`, { workflow: workflow("staging-migrate.yml"), ref: oneOf(["main"]), inputs: migrateApplyInputs }, { workflow: { const: "staging-migrate.yml" }, ref: { const: "main" }, inputs: { type: "object", additionalProperties: false, properties: migrateInputJson } },
    a => [{ permission: "actions", level: "write" as const, method: "POST" as const, expectedStatus: 204, path: `/actions/workflows/${encodeURIComponent(String(a.workflow))}/dispatches`, body: JSON.stringify({ ref: String(a.ref), inputs: a.inputs }) }], projectDispatch),
  define("github.workflow_dispatch_allowlisted", "app", `${description} Deploy staging: broker sends {} so every declared input (release_fence, inject_*, sha) takes its reviewed default. Two-bot-next only.`, { workflow: workflow("deploy-staging.yml"), ref: oneOf(["main"]), inputs: noInputs }, { workflow: { const: "deploy-staging.yml" }, ref: { const: "main" }, inputs: { type: "object", additionalProperties: false, properties: {}, required: [] } },
    a => [{ permission: "actions", level: "write" as const, method: "POST" as const, expectedStatus: 204, path: `/actions/workflows/${encodeURIComponent(String(a.workflow))}/dispatches`, body: JSON.stringify({ ref: String(a.ref), inputs: a.inputs }) }], projectDispatch),
  define("github.workflow_dispatch_allowlisted", "app", `${description} Rollback drill: broker sends {} for the automatic proof; the optional target_version/manual drill is not exposed. Two-bot-next and two-web-next.`, { workflow: workflow("staging-rollback-drill.yml"), ref: oneOf(["main"]), inputs: noInputs }, { workflow: { const: "staging-rollback-drill.yml" }, ref: { const: "main" }, inputs: { type: "object", additionalProperties: false, properties: {}, required: [] } },
    a => [{ permission: "actions", level: "write" as const, method: "POST" as const, expectedStatus: 204, path: `/actions/workflows/${encodeURIComponent(String(a.workflow))}/dispatches`, body: JSON.stringify({ ref: String(a.ref), inputs: a.inputs }) }], projectDispatch),
];
function projectDispatch(_body: unknown, args: Arguments): unknown {
  // GitHub returns 204 with no body; there is nothing upstream to project.
  // Echo only the validated, non-secret dispatch coordinates.
  const inputsValue = args.inputs && typeof args.inputs === "object" && !Array.isArray(args.inputs) ? { ...(args.inputs as Record<string, string>) } : {};
  return { workflow: args.workflow, ref: args.ref, inputs: inputsValue, dispatched: true };
}
export const workflowDispatchAllowlisted: Tool = {
  ...variants[0]!,
  description,
  write: true,
  repoAllowlist: new Set(["TogetherWeOwn/two-bot-next", "TogetherWeOwn/two-web-next"]),
  // Per-repository workflow binding: live two-web-next has staging-rollback-drill.yml only.
  repoWorkflows: new Map([
    ["TogetherWeOwn/two-bot-next", new Set(["staging-migrate.yml", "deploy-staging.yml", "staging-rollback-drill.yml"])],
    ["TogetherWeOwn/two-web-next", new Set(["staging-rollback-drill.yml"])],
  ]),
  // Flat discovery metadata only; closed execution variants enforce per-workflow inputs.
  inputSchema: { type: "object", additionalProperties: false, properties: {
    issueId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 },
    workspaceId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 },
    repoId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    workflow: { type: "string", enum: ["staging-migrate.yml", "deploy-staging.yml", "staging-rollback-drill.yml"] },
    ref: { const: "main" },
    inputs: { type: "object", additionalProperties: false, properties: migrateInputJson, required: [] },
  }, required: ["issueId", "workspaceId", "repoId", "workflow", "ref", "inputs"] },
  schema: { parse(value) { for (const v of variants) { try { return v.schema.parse(value); } catch { /* Try the next closed variant. */ } } return variants[0]!.schema.parse(value); } },
  requests(a) { return variants.find(v => { try { v.schema.parse(a); return true; } catch { return false; } })!.requests(a); },
};
