import { createHash } from "node:crypto";
import { requireThat, text } from "../../../packages/core/src/index.js";

const name = text(128, /^[A-Za-z0-9_-][A-Za-z0-9_.\/-]*$/);
export function moduleName(value: unknown): string {
  const parsed = name.parse(value);
  requireThat(parsed.split("/").every(part => part !== "" && part !== "." && part !== ".."), "schema");
  return parsed;
}

// Narrow local multipart subset, not a general MIME parser or provider qualification.
export function moduleDigests(bytes: Uint8Array, boundary: string, allowed: ReadonlySet<string>) {
  requireThat(bytes.byteLength > 0 && bytes.byteLength <= 131072 && allowed.size > 0 && allowed.size <= 16, "cap");
  requireThat(/^[A-Za-z0-9'()+_,.\/:=?-]{1,70}$/.test(boundary), "upstream");
  const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const opening = Buffer.from(`--${boundary}\r\n`);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  const crlf = Buffer.from("\r\n");
  const closing = Buffer.from("--");
  const separator = Buffer.from("\r\n\r\n");
  requireThat(body.subarray(0, opening.length).equals(opening), "upstream");
  let offset = opening.length;
  const seen = new Set<string>();
  const modules = [];
  while (true) {
    requireThat(seen.size < 64, "cap");
    const headerEnd = body.indexOf(separator, offset);
    requireThat(headerEnd >= offset && headerEnd - offset <= 2048, "upstream");
    const headerBytes = body.subarray(offset, headerEnd);
    requireThat(headerBytes.every(value => value === 13 || value === 10 || (value >= 32 && value <= 126)), "upstream");
    const headers = headerBytes.toString("ascii").split("\r\n");
    requireThat(headers.length >= 1 && headers.length <= 2, "upstream");
    const disposition = /^Content-Disposition: form-data; name="([A-Za-z0-9_.\/-]+)"(?:; filename="([A-Za-z0-9_.\/-]+)")?$/i.exec(headers[0]!);
    requireThat(disposition !== null, "upstream");
    const partName = moduleName(disposition[1]);
    requireThat(disposition[2] === undefined || disposition[2] === partName, "upstream");
    requireThat(headers.length === 1 || /^Content-Type: (?:application\/(?:javascript|wasm|octet-stream)|text\/(?:javascript|plain))$/i.test(headers[1]!), "upstream");
    requireThat(!seen.has(partName), "upstream");
    seen.add(partName);
    const start = headerEnd + separator.length;
    const end = body.indexOf(delimiter, start);
    requireThat(end >= start, "upstream");
    if (allowed.has(partName)) {
      const content = body.subarray(start, end);
      modules.push(Object.freeze({ name: partName, algorithm: "sha256" as const,
        subject: "captured-module-part-bytes" as const,
        hex: createHash("sha256").update(content).digest("hex"), byteLength: content.byteLength }));
    }
    offset = end + delimiter.length;
    if (body.subarray(offset, offset + 2).equals(closing)) {
      offset += 2;
      if (body.subarray(offset, offset + 2).equals(crlf)) offset += 2;
      requireThat(offset === body.length, "upstream");
      break;
    }
    requireThat(body.subarray(offset, offset + 2).equals(crlf), "upstream");
    offset += 2;
  }
  requireThat(modules.length === allowed.size, "upstream");
  return Object.freeze({ subject: "captured-current-module-parts" as const, complete: false as const,
    modules: Object.freeze(modules.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) });
}
