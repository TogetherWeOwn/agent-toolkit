import { define, listShape, listJson, oneOf, pagination } from "../schema.js";
import { list, pull } from "../output.js";
export const prList = define("github.pr_list", "app", "List one page of authorized repository pull requests.",
  { ...listShape, state: oneOf(["open", "closed", "all"]) }, { ...listJson, state: { enum: ["open", "closed", "all"] } },
  a => [{ permission: "pull_requests", path: `/pulls?state=${a.state}&${pagination(a)}` }], b => list(b, pull));
