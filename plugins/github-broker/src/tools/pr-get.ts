import { define, id } from "../schema.js";
import { pull } from "../output.js";
export const prGet = define("github.pr_get", "app", "Read one authorized repository pull request.", { number: id }, { number: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } },
  a => [{ permission: "pull_requests", path: `/pulls/${a.number}` }], pull);
