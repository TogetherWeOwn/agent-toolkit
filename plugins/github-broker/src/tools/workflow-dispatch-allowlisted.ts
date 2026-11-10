import { closed, oneOf, type Schema } from "../../../../packages/core/src/index.js";
import { define, planHash } from "../schema.js";
import type { Arguments, Tool } from "../types.js";

/**
 * The only GitHub write this broker exposes (TWO-5764 tier 1).
 *
 * Exact allowlist, deny by default:
 * - Repositories: TogetherWeOwn/two-bot-next and TogetherWeOwn/two-web-next only.
 *   The board must additionally bind the numeric repo ID to the caller's
 *   project/workspace and assign the issue to the devops-profiled agent.
 * - Workflows: staging-migrate.yml, deploy-staging.yml, staging-rollback-drill.yml.
 *   No production workflow (deploy.yml, release*, etc.) can be named here; any
 *   other value fails the closed schema before any credential is resolved.
 * - Ref: `main` only. Dispatching an unreviewed branch/tag/SHA would run
 *   unreviewed code under the staging credential, so it is refused.
 * - Inputs: validated against each workflow's declared inputs (see variants
 *   below). Unknown input keys are refused. Input values are bounded strings;
 *   GitHub receives them as workflow inputs, never as shell or credentials.
 * - Profile: only agents bound to the `devops` profile, which grants this
 *   tool and nothing else. Every attempt is audited (intent + outcome).
 *
 * PENDING WORKFLOW VERIFICATION: input names/values below mirror the
 * TWO-5764 description (`staging-migrate` plan/apply with plan-hash binding)
 * but the live workflow files were not readable from this workspace. DevOps
 * must confirm the exact `on.workflow_dispatch.inputs` of each workflow
 * before enablement; any mismatch fails closed at GitHub validation and must
 * be corrected here by a reviewed change, never by widening the allowlist.
 */
const description = "Dispatch one allowlisted staging workflow (staging-migrate.yml plan/apply, deploy-staging.yml, staging-rollback-drill.yml) on main in two-bot-next or two-web-next with actions:write. DevOps profile only. No production workflow can be dispatched.";
const workflow = (name: string) => oneOf([name] as const);
const inputs = (shape: Record<string, Schema<unknown>>) => closed(shape);
const noInputs = inputs({});
const planInputs = inputs({ mode: oneOf(["plan"]) });
const applyInputs = inputs({ mode: oneOf(["apply"]), plan_hash: planHash });

const variants = [
  define("github.workflow_dispatch_allowlisted", "app", `${description} Plan: inputs {mode:"plan"}.`, { workflow: workflow("staging-migrate.yml"), ref: oneOf(["main"]), inputs: planInputs }, { workflow: { const: "staging-migrate.yml" }, ref: { const: "main" }, inputs: { type: "object", additionalProperties: false, properties: { mode: { const: "plan" } }, required: ["mode"] } },
    a => [{ permission: "actions", level: "write" as const, method: "POST" as const, expectedStatus: 204, path: `/actions/workflows/${encodeURIComponent(String(a.workflow))}/dispatches`, body: JSON.stringify({ ref: String(a.ref), inputs: a.inputs }) }], projectDispatch),
  define("github.workflow_dispatch_allowlisted", "app", `${description} Apply: inputs {mode:"apply", plan_hash:<64-hex>}. The hash binds apply to its reviewed plan.`, { workflow: workflow("staging-migrate.yml"), ref: oneOf(["main"]), inputs: applyInputs }, { workflow: { const: "staging-migrate.yml" }, ref: { const: "main" }, inputs: { type: "object", additionalProperties: false, properties: { mode: { const: "apply" }, plan_hash: { type: "string", pattern: "^[a-f0-9]{64}$" } }, required: ["mode", "plan_hash"] } },
    a => [{ permission: "actions", level: "write" as const, method: "POST" as const, expectedStatus: 204, path: `/actions/workflows/${encodeURIComponent(String(a.workflow))}/dispatches`, body: JSON.stringify({ ref: String(a.ref), inputs: a.inputs }) }], projectDispatch),
  define("github.workflow_dispatch_allowlisted", "app", `${description} Deploy staging: inputs {} (no inputs declared).`, { workflow: workflow("deploy-staging.yml"), ref: oneOf(["main"]), inputs: noInputs }, { workflow: { const: "deploy-staging.yml" }, ref: { const: "main" }, inputs: { type: "object", additionalProperties: false, properties: {}, required: [] } },
    a => [{ permission: "actions", level: "write" as const, method: "POST" as const, expectedStatus: 204, path: `/actions/workflows/${encodeURIComponent(String(a.workflow))}/dispatches`, body: JSON.stringify({ ref: String(a.ref), inputs: a.inputs }) }], projectDispatch),
  define("github.workflow_dispatch_allowlisted", "app", `${description} Rollback drill: inputs {} (no inputs declared).`, { workflow: workflow("staging-rollback-drill.yml"), ref: oneOf(["main"]), inputs: noInputs }, { workflow: { const: "staging-rollback-drill.yml" }, ref: { const: "main" }, inputs: { type: "object", additionalProperties: false, properties: {}, required: [] } },
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
  // Flat discovery metadata only; closed execution variants enforce per-workflow inputs.
  inputSchema: { type: "object", additionalProperties: false, properties: {
    issueId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 },
    workspaceId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 },
    repoId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    workflow: { type: "string", enum: ["staging-migrate.yml", "deploy-staging.yml", "staging-rollback-drill.yml"] },
    ref: { const: "main" },
    inputs: { type: "object", additionalProperties: false, properties: { mode: { enum: ["plan", "apply"] }, plan_hash: { type: "string", pattern: "^[a-f0-9]{64}$" } }, required: [] },
  }, required: ["issueId", "workspaceId", "repoId", "workflow", "ref", "inputs"] },
  schema: { parse(value) { for (const v of variants) { try { return v.schema.parse(value); } catch { /* Try the next closed variant. */ } } return variants[0]!.schema.parse(value); } },
  requests(a) { return variants.find(v => { try { v.schema.parse(a); return true; } catch { return false; } })!.requests(a); },
};
