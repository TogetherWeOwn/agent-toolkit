import { define, oneOf, ref, refJson, qualifiedRef, qualifiedRefJson, path, pathJson, segment, filePath } from "../schema.js";
import { repositoryRead } from "../output.js";
import type { Tool } from "../types.js";

const variants = [
  define("github.repo_read", "app", "Read a UTF-8 file at a ref.", { mode: oneOf(["file"]), ref, path }, { mode: { const: "file" }, ref: refJson, path: pathJson }, a => [{ permission: "contents", path: `/contents/${filePath(a.path)}?ref=${segment(a.ref)}` }], (b, a) => repositoryRead(b, a.mode)),
  define("github.repo_read", "app", "Read one non-recursive tree page.", { mode: oneOf(["tree"]), ref }, { mode: { const: "tree" }, ref: refJson }, a => [{ permission: "contents", path: `/git/trees/${segment(a.ref)}` }], (b, a) => repositoryRead(b, a.mode)),
  define("github.repo_read", "app", "Read a fully qualified ref, such as heads/main.", { mode: oneOf(["ref"]), ref: qualifiedRef }, { mode: { const: "ref" }, ref: qualifiedRefJson }, a => [{ permission: "contents", path: `/git/ref/${ref.parse(a.ref).split("/").map(segment).join("/")}` }], (b, a) => repositoryRead(b, a.mode)),
  define("github.repo_read", "app", "Compare two refs, bounded to one page.", { mode: oneOf(["compare"]), base: ref, head: ref }, { mode: { const: "compare" }, base: refJson, head: refJson }, a => [{ permission: "contents", path: `/compare/${segment(a.base)}...${segment(a.head)}?per_page=100&page=1` }], (b, a) => repositoryRead(b, a.mode)),
];
export const repoRead: Tool = {
  ...variants[0]!, description: "Read an authorized repository file/tree/ref/compare. No arbitrary endpoint or binary downloads.",
  inputSchema: { type: "object", oneOf: variants.map(v => v.inputSchema) },
  schema: { parse(value) { for (const v of variants) { try { return v.schema.parse(value); } catch { /* Try the next closed variant. */ } } return variants[0]!.schema.parse(value); } },
  requests(a) { return variants.find(v => { try { v.schema.parse(a); return true; } catch { return false; } })!.requests(a); },
};
