import { closed, identifier, integer, oneOf, text, hash, type Schema } from "../../../packages/core/src/index.js";
import { guard, type Caller, type Config, type Policy, type Profile, type Operation, type Host, type Arguments, type Repository } from "./types.js";

const id = integer(1, Number.MAX_SAFE_INTEGER);
function array<T>(schema: Schema<T>, max: number): Schema<T[]> {
  return { parse(v) { guard(Array.isArray(v) && v.length <= max, "policy.array"); return v.map(x => schema.parse(x)); } };
}
const repositorySchema = closed({ id, owner: text(39, /^[A-Za-z0-9][A-Za-z0-9-]*$/), name: text(100, /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/), projectId: identifier, workspaceId: identifier });
const agentSchema = closed({ agentId: identifier, profile: oneOf(["builder", "lead", "reviewer-read", "release", "coordinator-read", "none"]), repositoryIds: array(id, 32) });
const policySchema = closed({ version: integer(1, 1), companyId: identifier, revision: id, repositories: array(repositorySchema, 32), agents: array(agentSchema, 32) });
const secretSchema = closed({ type: oneOf(["secret_ref"]), secretId: identifier });
const configSchema = closed({ appId: id, installationId: id, privateKeySecretRef: secretSchema, policy: policySchema });
const callerSchema = closed({ agentId: identifier, runId: identifier, companyId: identifier, projectId: identifier });

// Deliberately explicit even where read profiles share the same operations. New
// tools are not inherited automatically by any profile.
const allReads: Operation[] = ["github.repo_read", "github.pr_list", "github.pr_get", "github.pr_files", "github.checks_get", "github.rulesets_get", "github.actions_runs_list", "github.issue_read"];
const profiles: Record<Profile, ReadonlySet<Operation>> = {
  builder: new Set(allReads), lead: new Set(allReads), "reviewer-read": new Set(allReads), release: new Set(allReads),
  "coordinator-read": new Set(["github.pr_list", "github.pr_get", "github.checks_get", "github.rulesets_get", "github.actions_runs_list", "github.issue_read"]), none: new Set(),
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
export async function authorize(host: Host, policy: Policy, caller: Caller, operation: Operation, args: Arguments): Promise<Repository> {
  guard(caller.companyId === policy.companyId, "policy.company");
  const agent = policy.agents.find(a => a.agentId === caller.agentId);
  guard(agent && profiles[agent.profile].has(operation), "policy.profile");
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
