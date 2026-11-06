import { closed, identifier, integer, oneOf, text, type Schema } from "../../../packages/core/src/index.js";
import { guard, type Arguments, type Tool } from "./types.js";

export const id = integer(1, Number.MAX_SAFE_INTEGER);
export const page = integer(1, 100);
export const size = integer(1, 100);
export const sha = text(40, /^[a-f0-9]{40}$/);
export const ref = text(200, /^[A-Za-z0-9][A-Za-z0-9._/-]*$/);
export const path = text(1000, /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/);
export const base = { issueId: identifier, workspaceId: identifier, repoId: id };
export const baseJson = {
  issueId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 },
  workspaceId: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 80 },
  repoId: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
};
export const pageJson = { type: "integer", minimum: 1, maximum: 100 };
export const shaJson = { type: "string", pattern: "^[a-f0-9]{40}$" };
export const refJson = { type: "string", pattern: String.raw`^(?!.*\.\.)(?!.*//)(?!.*(?:^|/)\.(?:/|$))(?!.*\.lock(?:/|$))(?!.*[/]$)[A-Za-z0-9][A-Za-z0-9._/-]*$`, maxLength: 200 };
export const qualifiedRefJson = { ...refJson, pattern: "^(?=[^/]+/.+)" + refJson.pattern.slice(1) };
export const qualifiedRef = text(200, new RegExp(qualifiedRefJson.pattern));
export const pathJson = { type: "string", pattern: String.raw`^(?!\.{1,2}(?:/|$))(?!.*[/]\.{1,2}(?:/|$))[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$`, maxLength: 1000 };
export function define(name: Tool["name"], identityLane: Tool["identityLane"], description: string, shape: Record<string, Schema<unknown>>, properties: Record<string, unknown>, requests: Tool["requests"], project: Tool["project"]): Tool {
  return {
    name, identityLane, description, schema: closed({ ...base, ...shape }) as Schema<Arguments>,
    inputSchema: { type: "object", additionalProperties: false, properties: { ...baseJson, ...properties }, required: [...Object.keys(base), ...Object.keys(properties)] },
    requests, project,
  };
}
export function segment(value: unknown): string {
  const v = ref.parse(value);
  guard(!v.split("/").some(s => !s || s === "." || s === ".." || s.endsWith(".lock")) && !v.includes("..") && !v.includes("//"), "schema.ref");
  return encodeURIComponent(v);
}
export function filePath(value: unknown): string {
  const v = path.parse(value);
  guard(!v.split("/").some(s => s === "." || s === ".."), "schema.path");
  return v.split("/").map(encodeURIComponent).join("/");
}
export function pagination(args: Arguments): string { return `per_page=${size.parse(args.perPage)}&page=${page.parse(args.page)}`; }
export const listShape = { page, perPage: size };
export const listJson = { page: pageJson, perPage: pageJson };
export { oneOf };
