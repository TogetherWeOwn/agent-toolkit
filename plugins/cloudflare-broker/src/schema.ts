import { closed, identifier, integer, jsonData, oneOf, text, type Schema } from "../../../packages/core/src/index.js";
export function check(value: unknown, rule = "cloudflare.denied"): asserts value { if (!value) throw new Failure(rule); }
export class Failure extends Error { constructor(readonly rule: string) { super(rule); } }
const segment = text(100, /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const array = <T>(item: Schema<T>): Schema<T[]> => ({ parse(v) {
  check(Array.isArray(v) && v.length <= 32); return v.map(x => item.parse(x));
} });
export const configSchema = closed({ accountId: text(32, /^[a-f0-9]{32}$/), apiTokenSecretRef: closed({ type: oneOf(["secret_ref"]), secretId: identifier }),
  policy: closed({ version: integer(1, 1), revision: integer(1, Number.MAX_SAFE_INTEGER), companyId: identifier,
    agents: array(closed({ agentId: identifier, profile: oneOf(["read", "none"]), workerScripts: array(segment), containerApplicationIds: array(segment) })) }) });
export const callerSchema = closed({ agentId: identifier, runId: identifier, companyId: identifier, projectId: { parse: v => v === "" ? "" : identifier.parse(v) } });
export const closedJson = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
export const idJson = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_-]*$", maxLength: 100 };
const script = { script: segment }, app = { applicationId: segment }, scriptJson = { script: idJson }, appJson = { applicationId: idJson };
const stamp = { type: "integer", minimum: 0, maximum: 253402300799999 };
function tool(name: string, shape: Record<string, Schema<unknown>>, properties: Record<string, unknown>, required = Object.keys(properties)) {
  return { name: `cloudflare.${name}`, schema: closed(shape), parametersSchema: closedJson(properties, required) };
}
export const tools = [
  tool("workers.listDeployments", script, scriptJson),
  tool("workers.getVersion", { ...script, versionId: text(36, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i) }, { ...scriptJson, versionId: { type: "string", pattern: "^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$", maxLength: 36 } }),
  tool("workers.queryLogs", { ...script, from: integer(0, 253402300799999), to: integer(0, 253402300799999), limit: integer(1, 100), filter: { parse: v => v === "" ? "" : text(200, /^[\x20-\x7e]+$/).parse(v) } },
    { ...scriptJson, from: stamp, to: stamp, limit: { type: "integer", minimum: 1, maximum: 100 }, filter: { type: "string", maxLength: 200, pattern: "^[ -~]*$" } }, ["script", "from", "to", "limit"]),
  tool("containers.getApplication", app, appJson), tool("containers.listRollouts", app, appJson),
];
export function argumentsFor(tool: typeof tools[number], input: unknown): Record<string, unknown> {
  jsonData(input);
  if (tool.name === "cloudflare.workers.queryLogs" && input !== null && typeof input === "object" && !Array.isArray(input) && !Object.hasOwn(input, "filter")) input = { ...input, filter: "" };
  return tool.schema.parse(input);
}
