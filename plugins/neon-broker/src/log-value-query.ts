import { closed, oneOf, text } from "../../../packages/core/src/schema.js";

export const logWindowShape = {
  start_time: text(20, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
  end_time: text(20, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
  source: oneOf(["function", "storage", "pg_endpoint"] as const),
};
export const logValueQueryShape = { field_name: text(80, /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/), ...logWindowShape };
export function parseLogValueQuery(raw: unknown) {
  const query = closed(logValueQueryShape).parse(raw);
  parseLogWindow({ start_time: query.start_time, end_time: query.end_time, source: query.source });
  return query;
}
export function parseLogWindow(raw: unknown) {
  const query = closed(logWindowShape).parse(raw);
  for (const value of [query.start_time, query.end_time]) {
    if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace("Z", ".000Z")) throw Error("INVALID_ARGUMENTS");
  }
  const duration = Date.parse(query.end_time) - Date.parse(query.start_time);
  if (duration <= 0 || duration > 3_600_000) throw Error("INVALID_ARGUMENTS");
  return query;
}
