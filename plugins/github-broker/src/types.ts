import type { Schema } from "../../../packages/core/src/index.js";

export const operations = ["github.repo_read", "github.pr_list", "github.pr_get", "github.pr_files", "github.checks_get", "github.rulesets_get", "github.actions_runs_list", "github.issue_read"] as const;
export type Operation = typeof operations[number];
export type Profile = "builder" | "lead" | "reviewer-read" | "release" | "coordinator-read" | "none";
export type Permission = "contents" | "pull_requests" | "checks" | "statuses" | "actions" | "administration" | "issues";
export type Permissions = Partial<Record<Permission, "read">>;
export interface Caller { agentId: string; runId: string; companyId: string; projectId: string }
export interface Repository { id: number; owner: string; name: string; projectId: string; workspaceId: string }
export interface Policy {
  version: 1;
  companyId: string;
  revision: number;
  repositories: Repository[];
  agents: { agentId: string; profile: Profile; repositoryIds: number[] }[];
}
export interface SecretRef { type: "secret_ref"; secretId: string }
export interface Config { appId: number; installationId: number; privateKeySecretRef: SecretRef; policy: Policy }
export interface Arguments { issueId: string; workspaceId: string; repoId: number; [key: string]: unknown }
export interface Request { path: string; permission: Permission }
export interface Tool {
  name: Operation;
  description: string;
  inputSchema: Record<string, unknown>;
  schema: Schema<Arguments>;
  requests(args: Arguments): Request[];
  project(body: unknown, args: Arguments): unknown;
}
export interface HttpRequest { url: string; method: "GET" | "POST" | "DELETE"; headers: Record<string, string>; body?: string }
export interface HttpResponse { status: number; headers: Record<string, string>; body: string }
export interface Audit {
  event: string; time: number; agentId: string | null; runId: string | null; companyId: string | null;
  policyHash: string; policyRevision: number | null; repoId: number | null; operation: Operation | "unknown";
  phase: "intent" | "outcome" | "refused"; decision: "allow" | "deny"; rule: string;
  requestIds: string[]; outcome: "pending" | "success" | "error";
}
export interface Host {
  config(): Promise<unknown>;
  issue(id: string): Promise<{ companyId: string; projectId: string | null; assigneeAgentId: string | null; projectWorkspaceId: string | null; checkoutRunId: string | null; executionRunId: string | null; status: string } | null>;
  workspace(projectId: string, workspaceId: string): Promise<{ repoUrl: string | null } | null>;
  secret(ref: SecretRef, companyId: string): Promise<string>;
  http(request: HttpRequest): Promise<HttpResponse>;
  audit(record: Audit): Promise<void>;
  clock(): number;
}
export type Result = { content: { type: "text"; text: string }[]; isError: boolean };

export class Denied extends Error {
  constructor(readonly rule: string, readonly retryAfterSeconds?: number) { super(rule); }
}
export function guard(value: unknown, rule: string): asserts value { if (!value) throw new Denied(rule); }
