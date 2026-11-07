import { closed, text, type Schema } from "../../../../packages/core/src/index.js";
import { object, pick } from "../output.js";
import { base, baseJson, id, ref, refJson, sha, shaJson, path, pathJson, filePath, segment } from "../schema.js";
import { guard, type Arguments, type Tool, type WriteApi } from "../types.js";

const prose = text(4096, /^[\x20-\x7e]+$/);
const proseJson = { type: "string", minLength: 1, maxLength: 4096, pattern: "^[\\x20-\\x7e]+$" };
const file = closed({ path, contentBase64: text(4096, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) });
interface File { path: string; contentBase64: string }
const files: Schema<File[]> = { parse(v) {
  guard(Array.isArray(v) && v.length > 0 && v.length <= 16, "write.files_limit");
  const parsed = v.map(x => file.parse(x)); // The enclosing closed schema checks JSON descriptors first.
  guard(new Set(parsed.map(f => f.path)).size === parsed.length, "write.duplicate_path");
  let bytes = 0;
  for (const f of parsed) {
    filePath(f.path); safePath(f.path);
    const content = Buffer.from(f.contentBase64, "base64");
    guard(content.toString("base64") === f.contentBase64, "write.encoding");
    bytes += content.length;
  }
  guard(bytes <= 8192, "write.bytes_limit");
  return parsed;
} };
function safePath(value: unknown): void {
  guard(typeof value === "string" && value.length > 0 && value.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(value), "write.diff_path");
  const parts = value.toLowerCase().split("/");
  guard(!parts.includes(".git") && !parts.some(p => !p || p === "." || p === ".."), "write.diff_path");
  guard(!(parts[0] === ".github" && (parts.length === 1 || parts[1] === "workflows")), "write.workflow");
  guard(!parts.includes(".devin") && !parts.some(p => ["review.md", "agents.md", "claude.md"].includes(p)), "write.review_instructions");
}
function noBotCommands(body: unknown): void {
  guard(typeof body === "string" && !/(?:\/devin\s+review|@(?:coderabbitai|dependabot|devin-ai-integration)\b)/i.test(body), "write.bot_command");
}
async function branch(api: WriteApi, name: unknown, repository: Record<string, unknown>): Promise<string> {
  guard(typeof repository.default_branch === "string" && name !== repository.default_branch, "write.default_branch");
  const result = object(await api("GET", `/branches/${segment(name)}`, 200));
  guard(result.name === name && result.protected === false, "write.protected_branch");
  return sha.parse(object(result.commit).sha);
}
function defineWrite(name: Tool["name"], description: string, shape: Record<string, Schema<unknown>>, properties: Record<string, unknown>, write: NonNullable<Tool["write"]>, validate: (args: Arguments) => void): Tool {
  return {
    name, identityLane: "app", description,
    schema: closed({ ...base, ...shape }) as Schema<Arguments>,
    inputSchema: { type: "object", additionalProperties: false, properties: { ...baseJson, ...properties }, required: [...Object.keys(base), ...Object.keys(properties)] },
    requests(args) { validate(args); return []; },
    project(value) { return value; }, write,
  };
}
export const prCreate = defineWrite("github.pr_create", "Create a draft App-authored PR from the caller's permitted agent branch; deny workflow/review-instruction diffs.",
  { head: ref, base: ref, title: text(200, /^[\x20-\x7e]+$/), body: prose },
  { head: refJson, base: refJson, title: { ...proseJson, maxLength: 200 }, body: proseJson }, {
    permissions: { contents: "read", pull_requests: "write" }, maxRequests: () => 6,
    async execute(api, args, repository) {
      guard(args.base === repository.default_branch, "write.pr_base");
      const head = await branch(api, args.head, repository);
      const baseBranch = object(await api("GET", `/branches/${segment(args.base)}`, 200));
      guard(baseBranch.name === args.base, "write.pr_base");
      const parent = sha.parse(object(baseBranch.commit).sha);
      const diff = object(await api("GET", `/compare/${parent}...${head}?per_page=100&page=1`, 200));
      guard(diff.status === "ahead" && diff.behind_by === 0 && typeof diff.total_commits === "number" && diff.total_commits > 0, "write.pr_diff");
      // GitHub compare returns at most 300 files on the first page. At the cap
      // completeness is ambiguous, so never approve a partially inspected diff.
      guard(Array.isArray(diff.files) && diff.files.length > 0 && diff.files.length < 300, "write.diff_incomplete");
      for (const f of diff.files) {
        const entry = object(f); safePath(entry.filename);
        guard(["added", "removed", "modified", "renamed", "copied", "changed"].includes(String(entry.status)), "write.pr_diff");
        if (entry.status === "renamed" || entry.status === "copied") safePath(entry.previous_filename);
        else if (entry.previous_filename !== undefined) safePath(entry.previous_filename);
      }
      guard(await branch(api, args.head, repository) === head, "write.head_changed");
      const currentBase = object(await api("GET", `/branches/${segment(args.base)}`, 200));
      guard(currentBase.name === args.base && object(currentBase.commit).sha === parent, "write.base_changed");
      return pick(await api("POST", "/pulls", 201, { head: args.head, base: args.base, title: args.title, body: args.body, draft: true }), ["id", "number", "html_url", "state", "draft"]);
    },
  }, args => { segment(args.head); segment(args.base); noBotCommands(args.body); });

function comment(name: "github.pr_comment" | "github.issue_comment"): Tool {
  return defineWrite(name, "Post one App-authenticated comment; no review, edit, approval or bot-command lane.",
    { number: id, body: prose }, { number: { type: "integer", minimum: 1 }, body: proseJson }, {
      permissions: name === "github.pr_comment" ? { pull_requests: "write" } : { issues: "write" }, maxRequests: () => 2,
      async execute(api, args) {
        const target = object(await api("GET", `${name === "github.pr_comment" ? "/pulls" : "/issues"}/${args.number}`, 200));
        guard(target.number === args.number && (name === "github.pr_comment" || target.pull_request === undefined), "write.comment_target");
        return pick(await api("POST", `/issues/${args.number}/comments`, 201, { body: args.body }), ["id", "html_url"]);
      },
    }, args => noBotCommands(args.body));
}
export const prComment = comment("github.pr_comment");
export const issueComment = comment("github.issue_comment");

export const commitFiles = defineWrite("github.commit_files", "Commit capped base64 files to an existing permitted agent branch using an expected parent and non-force Git Data update. No custom authorship.",
  { branch: ref, expectedParent: sha, message: text(200, /^[\x20-\x7e]+$/), files },
  { branch: refJson, expectedParent: shaJson, message: { ...proseJson, maxLength: 200 }, files: { type: "array", minItems: 1, maxItems: 16, items: { type: "object", additionalProperties: false, required: ["path", "contentBase64"], properties: { path: pathJson, contentBase64: { type: "string", minLength: 1, maxLength: 4096, pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$" } } } } }, {
    permissions: { contents: "write" }, maxRequests: args => (args.files as File[]).length + 7,
    async execute(api, args, repository) {
      guard(await branch(api, args.branch, repository) === args.expectedParent, "write.parent_changed");
      const parent = object(await api("GET", `/git/commits/${args.expectedParent}`, 200));
      guard(parent.sha === args.expectedParent, "write.parent_identity");
      const baseTree = sha.parse(object(parent.tree).sha);
      const existing = object(await api("GET", `/git/trees/${baseTree}?recursive=1`, 200));
      guard(existing.sha === baseTree && existing.truncated === false && Array.isArray(existing.tree) && existing.tree.length <= 10000, "write.tree_incomplete");
      const entries = new Map<string, Record<string, unknown>>();
      for (const raw of existing.tree) {
        const entry = object(raw);
        guard(typeof entry.path === "string" && !entries.has(entry.path), "write.tree_shape");
        entries.set(entry.path, entry);
      }
      for (const f of args.files as File[]) {
        const parts = f.path.split("/");
        for (let i = 1; i < parts.length; i++) {
          const ancestor = entries.get(parts.slice(0, i).join("/"));
          guard(!ancestor || ancestor.type === "tree", "write.tree_type");
        }
        const target = entries.get(f.path);
        // Never replace a directory/submodule/symlink with a blob: that can
        // implicitly delete protected descendants absent from input paths.
        guard(!target || (target.type === "blob" && ["100644", "100755"].includes(String(target.mode))), "write.tree_type");
      }
      const tree = [];
      for (const f of args.files as File[]) {
        const blob = object(await api("POST", "/git/blobs", 201, { content: f.contentBase64, encoding: "base64" }));
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: sha.parse(blob.sha) });
      }
      const createdTree = object(await api("POST", "/git/trees", 201, { base_tree: baseTree, tree }));
      const commit = object(await api("POST", "/git/commits", 201, { message: args.message, tree: sha.parse(createdTree.sha), parents: [args.expectedParent] }));
      const newSha = sha.parse(commit.sha);
      guard(await branch(api, args.branch, repository) === args.expectedParent, "write.parent_changed");
      const updated = object(await api("PATCH", `/git/refs/heads/${segment(args.branch)}`, 200, { sha: newSha, force: false }));
      guard(updated.ref === `refs/heads/${args.branch}` && object(updated.object).sha === newSha, "write.ref_result");
      return { sha: newSha, branch: args.branch, parent: args.expectedParent };
    },
  }, args => { segment(args.branch); files.parse(args.files); });
