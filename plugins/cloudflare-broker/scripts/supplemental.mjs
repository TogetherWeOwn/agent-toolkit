import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const supplementalSource = Object.freeze({
  repository: "https://github.com/cloudflare/cloudflare-docs",
  revision: "53ce9b502646fdc019b8184b29b9f1054939e1b6",
  url: "https://raw.githubusercontent.com/cloudflare/cloudflare-docs/53ce9b502646fdc019b8184b29b9f1054939e1b6/src/content/docs/r2/api/s3/api.mdx",
  sha256: "cfa565d89837b4f3ee3ff874dcc71daf86da1f62adeffd4b5fe82e3837df36e7",
});
const digest = value => createHash("sha256").update(value).digest("hex");
const normalized = text => text.replaceAll(/\s+/gu, " ").trim();
const status = marker => marker === "✅" ? "supported" : marker === "❌" ? "unsupported" : "experimental";

export function supplementalInventory(bytes) {
  if (digest(bytes) !== supplementalSource.sha256) throw new Error("supplemental source digest mismatch");
  const lines = bytes.toString("utf8").split("\n");
  const operations = [];
  let level = null;
  let support = null;
  for (const [index, line] of lines.entries()) {
    if (line === "## Bucket-level operations") level = "bucket";
    if (line === "## Object-level operations") level = "object";
    if (/^### Implemented (bucket|object)-level operations$/.test(line)) support = "supported";
    if (/^### Unimplemented (bucket|object)-level operations$/.test(line)) support = "unsupported";
    if (!/^\| [✅❌🚧]/u.test(line)) continue;
    const match = /^\| ([✅❌🚧]) \[([A-Za-z0-9]+)\]\((https:\/\/docs\.aws\.amazon\.com\/AmazonS3\/latest\/API\/API_([A-Za-z0-9]+)\.html)\)\s*\|([^|]*)\|\s*$/u.exec(line);
    if (!match || !level || !support || match[2] !== match[4] || status(match[1]) !== support) throw new Error("unmapped supplemental operation");
    const features = match[5].split(/<br\s*\/>/u).map(normalized).filter(Boolean).map(feature => {
      const marked = /^([✅❌🚧])️?\s*(.+)$/u.exec(feature);
      return marked ? { status: status(marked[1]), feature: marked[2] } : { status: "heading", feature };
    });
    operations.push({
      key: `S3 ${match[2]}`, operationId: match[2], level,
      reference: match[3], sourceLine: index + 1, providerSupport: support, features,
      credentialScope: "unknown", resourceScope: "unclassified", typedTool: null,
      tier: "unclassified", approvalRoute: "unresolved", implementation: "missing",
      review: "not-reviewed", enablement: "disabled", tests: [],
      prerequisites: [
        ...(support === "unsupported" ? ["provider-operation-support"] : []),
        "credential-protocol-and-scope-attestation", "typed-adapter-and-tier-classification",
        "compatible-reviewed-core", "native-integration-and-tier-review",
      ],
      prerequisiteOwner: "provider-package-maintainer",
    });
  }
  if (operations.length !== 73 || new Set(operations.map(row => row.key)).size !== 73 || operations.filter(row => row.providerSupport === "supported").length !== 26) throw new Error("supplemental operation identity mismatch");
  operations.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  // Preserve non-operation tables and prose too: features alone omit region,
  // checksum combinations, conditional-write semantics and multipart data loss.
  const operationLines = new Set(operations.map(row => row.sourceLine));
  const constraints = lines.flatMap((line, index) => {
    if (operationLines.has(index + 1) || index < 12 || !line.trim() || line.startsWith("import ") || line.startsWith("<Details") || line === "</Details>") return [];
    return [{ sourceLine: index + 1, text: normalized(line) }];
  });
  return {
    manifestVersion: 1, surface: "R2 S3-compatible API", complete: false,
    source: supplementalSource,
    counts: { operations: 73, providerSupported: 26, providerUnsupported: 47, descriptors: 0, implementedTools: 0, reviewedTools: 0, enabledTools: 0 },
    note: "Documentary compatibility facts only; provider support is not credential entitlement, a typed adapter, policy classification or authorization. REST v4 descriptors do not implement S3. Missing operations remain incomplete, including provider-unsupported entries.",
    constraints, operations,
  };
}

export async function writeSupplementalInventory(sourcePath, destination) {
  const manifest = supplementalInventory(await readFile(sourcePath));
  const bytes = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(destination, bytes);
  return { ...manifest.counts, sha256: digest(bytes) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error("usage: node supplemental.mjs <pinned-r2-s3.mdx> <r2-s3.json>");
  console.log(JSON.stringify(await writeSupplementalInventory(process.argv[2], process.argv[3])));
}
