import { closed, identifier, integer, oneOf, text, hash, type Schema } from "../../../packages/core/src/index.js";
import { guard, type Caller, type Config, type Policy, type Profile, type Operation, type IdentityLane, type Tool, type Host, type Arguments, type Repository } from "./types.js";

const id = integer(1, Number.MAX_SAFE_INTEGER);
function array<T>(schema: Schema<T>, max: number): Schema<T[]> {
  return { parse(v) {
    guard(Array.isArray(v) && v.length <= max, "policy.array");
    const keys = Reflect.ownKeys(v);
    guard(keys.length === v.length + 1 && keys.every(k => k === "length" || (typeof k === "string" && /^(0|[1-9][0-9]*)$/.test(k) && Number(k) < v.length)), "policy.array");
    return Array.from({ length: v.length }, (_, i) => {
      const d = Object.getOwnPropertyDescriptor(v, String(i));
      guard(d && d.enumerable && Object.hasOwn(d, "value"), "policy.array");
      return schema.parse(d.value);
    });
  } };
}
const repositorySchema = closed({ id, owner: text(39, /^[A-Za-z0-9][A-Za-z0-9-]*$/), name: text(100, /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/), projectId: identifier, workspaceId: identifier });
const agentSchema = closed({ agentId: identifier, identityLane: oneOf(["app", "owner"]), profile: oneOf(["builder", "lead", "reviewer-read", "release", "coordinator-read", "none"]), repositoryIds: array(id, 32) });
// Board sections compose independently bounded leaf records instead of running
// the tool-input 256-node cap over the whole 32-repository/32-agent policy.
// Inspect descriptors before reading values, preserving closed JSON semantics.
function section<S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: ReturnType<S[K]["parse"]> }> {
  return { parse(v) {
    guard(v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null), "policy.object");
    const keys = Reflect.ownKeys(v);
    guard(keys.length === Object.keys(shape).length && keys.every(k => typeof k === "string" && Object.hasOwn(shape, k)), "policy.object");
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, schema] of Object.entries(shape)) {
      const d = Object.getOwnPropertyDescriptor(v, key);
      guard(d && d.enumerable && Object.hasOwn(d, "value"), "policy.object");
      out[key] = schema.parse(d.value);
    }
    return Object.freeze(out) as { [K in keyof S]: ReturnType<S[K]["parse"]> };
  } };
}
const policySchema = section({ version: integer(1, 1), companyId: identifier, revision: id, repositories: array(repositorySchema, 32), agents: array(agentSchema, 32) });
const secretSchema = closed({ type: oneOf(["secret_ref"]), secretId: identifier });
const configSchema = section({ appId: id, installationId: id, privateKeySecretRef: secretSchema, policy: policySchema });
const callerSchema = closed({ agentId: identifier, runId: identifier, companyId: identifier, projectId: identifier });

// Deliberately explicit even where read profiles share the same operations. New
// tools are not inherited automatically by any profile.
const allReads: Operation[] = ["github.repo_read", "github.pr_list", "github.pr_get", "github.pr_files", "github.checks_get", "github.rulesets_get", "github.actions_runs_list", "github.issue_read"];
const profiles: Record<Profile, { identityLanes: readonly IdentityLane[]; operations: ReadonlySet<Operation> }> = {
  builder: { identityLanes: ["app"], operations: new Set(allReads) },
  lead: { identityLanes: ["app"], operations: new Set(allReads) },
  "reviewer-read": { identityLanes: ["app"], operations: new Set(allReads) },
  release: { identityLanes: ["app"], operations: new Set(allReads) },
  "coordinator-read": { identityLanes: ["app"], operations: new Set(["github.pr_list", "github.pr_get", "github.checks_get", "github.rulesets_get", "github.actions_runs_list", "github.issue_read"]) },
  none: { identityLanes: [], operations: new Set() },
};
export function parseCaller(value: unknown): Caller { return callerSchema.parse(value); }
export function parseConfig(value: unknown): Config {
  const config = configSchema.parse(value) as Config;
  const p = config.policy;
  guard(new Set(p.agents.map(a => a.agentId)).size === p.agents.length, "policy.duplicate_agent");
  guard(new Set(p.repositories.map(r => r.id)).size === p.repositories.length, "policy.duplicate_repo");
  guard(new Set(p.repositories.map(r => r.workspaceId)).size === p.repositories.length, "policy.duplicate_workspace");
  guard(p.agents.every(a => new Set(a.repositoryIds).size === a.repositoryIds.length && a.repositoryIds.every(id => p.repositories.some(r => r.id === id))), "policy.repository_ids");
  return config;
}
export function policyHash(config: Config): string { return hash(config); }
export async function authorize(host: Host, policy: Policy, caller: Caller, tool: Tool, args: Arguments): Promise<Repository> {
  guard(caller.companyId === policy.companyId, "policy.company");
  const agent = policy.agents.find(a => a.agentId === caller.agentId);
  guard(agent && profiles[agent.profile].operations.has(tool.name), "policy.profile");
  guard(agent.identityLane !== "owner" && tool.identityLane !== "owner", "identity.owner_disabled");
  guard(profiles[agent.profile].identityLanes.includes(agent.identityLane) && tool.identityLane === agent.identityLane, "policy.identity_lane");
  guard(agent.repositoryIds.includes(args.repoId), "policy.repository");
  const repo = policy.repositories.find(r => r.id === args.repoId);
  guard(repo && repo.projectId === caller.projectId && repo.workspaceId === args.workspaceId, "policy.workspace");
  const issue = await host.issue(args.issueId);
  guard(issue && issue.companyId === caller.companyId && issue.projectId === caller.projectId, "identity.issue_project");
  guard(issue.assigneeAgentId === caller.agentId, "identity.issue_assignee");
  guard(issue.checkoutRunId === caller.runId || issue.executionRunId === caller.runId, "identity.issue_run");
  guard(issue.status === "in_progress" || issue.status === "in_review", "identity.issue_status");
  guard(issue.projectWorkspaceId === repo.workspaceId, "identity.issue_workspace");
  const workspace = await host.workspace(caller.projectId, repo.workspaceId);
  guard(workspace?.repoUrl === `https://github.com/${repo.owner}/${repo.name}`, "identity.workspace_repository");
  return repo;
}
