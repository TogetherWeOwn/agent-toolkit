import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { classify, MAX_BYTES, parseSnapshot, timestamp } from "./classify.mjs";

const HELP = "Usage: npm run work-supply -- --input <snapshot.json|-> --at <UTC-ISO-time> [--pool <id>]\n";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") { process.stdout.write(HELP); return; }
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!["--input", "--at", "--pool"].includes(key) || options.has(key) || typeof value !== "string" || !value || value.startsWith("--")) throw new Error("invalid_options");
    options.set(key, value);
  }
  if (!options.has("--input") || !Number.isFinite(timestamp(options.get("--at")))) throw new Error("invalid_options");
  let file;
  let stream;
  let timer;
  try {
    if (options.get("--input") === "-") stream = process.stdin;
    else {
      file = await open(options.get("--input"), constants.O_RDONLY | constants.O_NONBLOCK);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error("invalid_snapshot");
      stream = file.createReadStream();
    }
    timer = setTimeout(() => stream.destroy(new Error("invalid_snapshot")), 5000);
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error("invalid_snapshot");
      chunks.push(chunk);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const report = classify(parseSnapshot(text), { at: options.get("--at"), pool: options.get("--pool") ?? null });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    clearTimeout(timer);
    stream?.destroy();
    await file?.close();
  }
}

try { await main(); }
catch (error) {
  const code = error?.message === "invalid_options" ? "invalid_options" : "invalid_snapshot";
  process.stderr.write(`${JSON.stringify({ error: code })}\n`);
  process.exitCode = 1;
}
