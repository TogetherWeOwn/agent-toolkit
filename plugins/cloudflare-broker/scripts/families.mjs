import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const unique = values => [...new Set(values)].sort(compare);
const states = new Set(["missing", "descriptor-only", "content-descriptor-only", "plan-descriptor-only"]);

// This summarizes source workload, not credential entitlement, policy or effort.
export function familySummary(bytes) {
  const rows = bytes.toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line));
  const keys = new Set();
  const groups = new Map();
  for (const row of rows) {
    if (typeof row.key !== "string" || !/^(GET|PUT|POST|DELETE|OPTIONS|HEAD|PATCH|TRACE) \/\S+$/.test(row.key) || keys.has(row.key)) throw new Error("invalid operation identity");
    if (!Array.isArray(row.areas) || row.areas.length === 0 || row.areas.some(area => typeof area !== "string" || area.length === 0)) throw new Error("missing API area");
    if (!states.has(row.implementation) || !["read", "reserved", "unclassified"].includes(row.tier) || row.credentialScope !== "unknown" || row.review !== "not-reviewed" || row.enablement !== "disabled") throw new Error("unsupported coverage state");
    for (const hash of [row.requestShapeSha256, row.responseShapeSha256]) if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("invalid shape fingerprint");
    keys.add(row.key);
    const area = row.areas[0];
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(row);
  }
  const families = [...groups].sort(([a], [b]) => compare(a, b)).map(([area, operations]) => ({
    area,
    operations: operations.length,
    methods: Object.fromEntries(unique(operations.map(row => row.key.split(" ")[0])).map(method => [method, operations.filter(row => row.key.startsWith(`${method} `)).length])),
    secondaryAreas: unique(operations.flatMap(row => row.areas.slice(1))),
    resourceParameters: unique(operations.flatMap(row => row.resourceParameters)),
    shapeFingerprints: {
      request: unique(operations.map(row => row.requestShapeSha256)).length,
      response: unique(operations.map(row => row.responseShapeSha256)).length,
    },
    coverage: {
      metadataDescriptors: operations.filter(row => row.implementation === "descriptor-only").length,
      contentDescriptors: operations.filter(row => row.implementation === "content-descriptor-only").length,
      planDescriptors: operations.filter(row => row.implementation === "plan-descriptor-only").length,
      missing: operations.filter(row => row.implementation === "missing").length,
      unclassified: operations.filter(row => row.tier === "unclassified").length,
      unknownEntitlement: operations.length,
      integrated: 0, reviewed: 0, enabled: 0,
    },
  }));
  return {
    summaryVersion: 1,
    inventorySha256: createHash("sha256").update(bytes).digest("hex"),
    grouping: "first-provider-tag-exclusive",
    limitations: ["primary-area-counts-are-additive-not-tag-memberships", "method-is-not-policy-tier", "shape-fingerprints-are-not-resolved-schema-equivalence", "not-credential-intersection", "not-effort-or-delivery-estimate", "supplemental-protocols-excluded"],
    counts: { operations: rows.length, apiTags: unique(rows.flatMap(row => row.areas)).length, primaryFamilies: families.length, multiTaggedOperations: rows.filter(row => row.areas.length > 1).length },
    families,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error("usage: node families.mjs <operations.jsonl> <families.json>");
  const summary = familySummary(await readFile(process.argv[2]));
  await writeFile(process.argv[3], JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary.counts));
}
