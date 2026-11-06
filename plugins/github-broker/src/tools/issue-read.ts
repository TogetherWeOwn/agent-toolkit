import { define, id } from "../schema.js";
import { pick } from "../output.js";
export const issueRead = define("github.issue_read", "Read one authorized repository issue. No comments or issue mutations.", { number: id }, { number: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } },
  a => [{ permission: "issues", path: `/issues/${a.number}` }], b => pick(b, ["id", "number", "title", "body", "state", "locked", "html_url", "created_at", "updated_at", "closed_at"]));
