import { closed, identifier, oneOf, requireThat, text } from "../../../packages/core/src/schema.js";
import { record, slug } from "./metadata.js";

const timestamp = text(20, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
const targetShape = { organization: slug, database: slug, branch: slug, branchId: identifier, from: timestamp, to: timestamp };
export const historicalBranchMetricNames = Object.freeze(["queries", "query_errors"] as const);
export const historicalTabletMetricNames = Object.freeze(["replication_lag", "primary_cpu_usage"] as const);
export const historicalBranchMetricScope = closed({ ...targetShape, metric: oneOf(historicalBranchMetricNames) });
export const historicalTabletMetricScope = closed({ ...targetShape, metric: oneOf(historicalTabletMetricNames) });
type HistoricalMetricScope = ReturnType<typeof historicalBranchMetricScope.parse> | ReturnType<typeof historicalTabletMetricScope.parse>;

function epoch(value: string): number {
  const result = Date.parse(value);
  requireThat(Number.isFinite(result) && new Date(result).toISOString() === value.replace("Z", ".000Z"), "schema");
  return result / 1000;
}

export function metricWindow(target: HistoricalMetricScope): Readonly<{ from: number; to: number }> {
  const from = epoch(target.from), to = epoch(target.to);
  requireThat(to > from && to - from <= 900, "scope");
  return Object.freeze({ from, to });
}

export function historicalMetricQuery(target: HistoricalMetricScope): string {
  metricWindow(target);
  return `metrics=${target.metric}&from=${encodeURIComponent(target.from)}&to=${encodeURIComponent(target.to)}&steps=16`;
}

export interface HistoricalMetricAvailability {
  readonly requestBranchId: string;
  readonly metric: HistoricalMetricScope["metric"];
  readonly seriesPresent: boolean;
  readonly samplesPresent: boolean;
  readonly health: "not-established";
  readonly provenance: "not-established";
}

export function historicalMetricAvailability(body: Record<string, unknown>, target: HistoricalMetricScope): HistoricalMetricAvailability {
  const window = metricWindow(target);
  // MetricSeries has no branch identity. These checks cannot authenticate origin.
  requireThat(body.start_date === target.from && body.end_date === target.to, "scope");
  requireThat(typeof body.type === "string" && body.type.length > 0 && body.type.length <= 80, "upstream");
  requireThat(typeof body.interval === "number" && Number.isSafeInteger(body.interval) && body.interval > 0 && body.interval <= 900, "upstream");
  requireThat(Array.isArray(body.series) && body.series.length <= 8, "upstream");
  let samplesPresent = false;
  for (const value of body.series) {
    const row = record(value);
    requireThat(row.metric === target.metric, "scope");
    requireThat(typeof row.type === "string" && row.type.length > 0 && row.type.length <= 80, "upstream");
    requireThat(typeof row.label === "string" && row.label.length <= 256, "upstream");
    record(row.labels);
    requireThat(Array.isArray(row.points) && row.points.length <= 16, "upstream");
    let previous = -Infinity;
    for (const point of row.points) {
      requireThat(Array.isArray(point) && point.length === 2, "upstream");
      const [time, sample] = point;
      requireThat(typeof time === "number" && Number.isFinite(time) && time >= window.from && time <= window.to && time > previous, "upstream");
      requireThat(typeof sample === "number" && Number.isFinite(sample), "upstream");
      previous = time;
    }
    samplesPresent ||= row.points.length > 0;
  }
  return Object.freeze({
    requestBranchId: target.branchId, metric: target.metric,
    seriesPresent: body.series.length > 0, samplesPresent,
    health: "not-established", provenance: "not-established",
  });
}
