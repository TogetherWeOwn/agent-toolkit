import { define, id, listShape, listJson, pagination } from "../schema.js";
import { list, changedFile } from "../output.js";
export const prFiles = define("github.pr_files", "app", "Read one page of changed files for an authorized pull request.", { number: id, ...listShape }, { number: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, ...listJson },
  a => [{ permission: "pull_requests", path: `/pulls/${a.number}/files?${pagination(a)}` }], b => list(b, changedFile));
