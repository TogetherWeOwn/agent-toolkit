import { randomUUID } from "node:crypto";
import { Refusal, requireThat, text } from "../../../packages/core/src/index.js";
import type { currentContentDescriptor } from "./current-content.js";
import type { MetadataDescriptor, MetadataRequest } from "./metadata.js";

const origin = "https://api.cloudflare.com";
const token = text(4096, /^[A-Za-z0-9._~-]{5,4096}$/);

function endpoint(request: MetadataRequest): string {
  requireThat(request.method === "GET" && request.maxRequests === 1 && request.redirects === "deny", "schema");
  requireThat(Number.isSafeInteger(request.maxResponseBytes) && request.maxResponseBytes > 0 && request.maxResponseBytes <= 131072, "cap");
  requireThat(Number.isSafeInteger(request.timeoutMs) && request.timeoutMs > 0 && request.timeoutMs <= 10000, "cap");
  requireThat(typeof request.path === "string" && request.path.length <= 2048 &&
    /^\/(?:accounts\/[a-f0-9]{32}\/[A-Za-z0-9_/?=&.-]+|zones\/[a-f0-9]{32}(?:\/[A-Za-z0-9_/?=&.-]+)?)$/.test(request.path), "schema");
  requireThat(request.r2Jurisdiction === undefined || (request.r2Jurisdiction === "eu" && (
    /^\/accounts\/[a-f0-9]{32}\/r2\/buckets\/[a-z0-9][a-z0-9-]{1,62}[a-z0-9](?:\/(?:lock|lifecycle|cors|domains\/(?:managed|custom(?:\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?)?)))?$/.test(request.path) ||
    /^\/accounts\/[a-f0-9]{32}\/event_notifications\/r2\/[a-z0-9][a-z0-9-]{1,62}[a-z0-9]\/configuration(?:\/queues\/[a-f0-9]{32})?$/.test(request.path))), "schema");
  const url = new URL(`/client/v4${request.path}`, origin);
  requireThat(url.origin === origin && url.pathname + url.search === `/client/v4${request.path}`, "schema");
  return url.href;
}

async function boundedResponse(fetcher: typeof fetch, request: MetadataRequest, credential: string,
  signal: AbortSignal, accept: string, validateType: (value: string) => void): Promise<Uint8Array> {
  const url = endpoint(request);
  const authorization = `Bearer ${token.parse(credential)}`;
  requireThat(!signal.aborted, "upstream");
  const controller = new AbortController();
  const state: { stream: ReadableStream<Uint8Array> | null; reader: ReadableStreamDefaultReader<Uint8Array> | null } = { stream: null, reader: null };
  let refuse: (error: Error) => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => { refuse = reject; });
  function cancel() {
    controller.abort();
    void state.reader?.cancel().catch(() => {});
    refuse(new Error("upstream"));
  }
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, request.timeoutMs);
  if (signal.aborted) cancel();
  try {
    return await Promise.race([cancelled, (async () => {
      requireThat(!controller.signal.aborted, "upstream");
      const response = await fetcher(url, {
        method: "GET", redirect: "manual", signal: controller.signal,
        credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { authorization, accept, ...(request.r2Jurisdiction === "eu" ? { "cf-r2-jurisdiction": "eu" } : {}) },
      });
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        requireThat(false, "upstream");
      }
      state.stream = response.body;
      requireThat(response.status === 200 && !response.redirected &&
        (response.url === "" || response.url === url), "upstream");
      validateType(response.headers.get("content-type") ?? "");
      const length = response.headers.get("content-length");
      requireThat(length === null || (/^\d+$/.test(length) && Number(length) <= request.maxResponseBytes), "cap");
      requireThat(response.body !== null, "upstream");
      state.reader = response.body.getReader();
      const buffer = new Uint8Array(request.maxResponseBytes);
      let bytes = 0;
      let chunks = 0;
      while (true) {
        const chunk = await state.reader.read();
        requireThat(!controller.signal.aborted, "upstream");
        if (chunk.done) break;
        requireThat(++chunks <= 131072 && bytes + chunk.value.byteLength <= buffer.byteLength, "cap");
        buffer.set(chunk.value, bytes);
        bytes += chunk.value.byteLength;
      }
      return buffer.subarray(0, bytes);
    })()]);
  } catch {
    // Never expose fetch, header, provider-body or cancellation diagnostics.
    throw new Refusal("upstream");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    controller.abort();
    if (state.reader) void state.reader.cancel().catch(() => {});
    else void state.stream?.cancel().catch(() => {});
  }
}

// Internal transports only. The caller must authenticate, authorize and revalidate
// through the reviewed broker before invoking these; neither is a registered tool.
export function metadataTransport(fetcher: typeof fetch = fetch) {
  return async function read<A, O>(descriptor: MetadataDescriptor<A, O>, raw: unknown,
    credential: string, signal: AbortSignal): Promise<O> {
    const prepared = descriptor.prepare(raw);
    const bytes = await boundedResponse(fetcher, prepared.request, credential, signal, "application/json", value => {
      requireThat(/^application\/json(?:\s*;|$)/i.test(value), "upstream");
    });
    let body: string;
    try {
      body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      requireThat(false, "upstream");
    }
    return descriptor.project(body, prepared);
  };
}

export function pagesCollectionTransport(fetcher: typeof fetch = fetch) {
  const read = metadataTransport(fetcher);
  return async function collect<A, O extends { pagination?: unknown }>(descriptor: MetadataDescriptor<A, O>, raw: unknown,
    credential: string, signal: AbortSignal) {
    requireThat((descriptor.name === "cloudflare.pages.projects.list" && descriptor.providerOperationId === "pages-project-get-projects") ||
      (descriptor.name === "cloudflare.pages.deployments.list" && descriptor.providerOperationId === "pages-deployment-get-deployments"), "schema");
    const prepared = descriptor.prepare(raw);
    const correlationId = randomUUID();
    const startedAt = new Date().toISOString();
    const start = performance.now();
    const output = await read(descriptor, raw, credential, signal);
    // The descriptor's copied independent evidence scope controls this field,
    // including unavailable page metadata. Ordinary list scope never opts in.
    if (output.pagination === undefined) return output;
    const completedAt = new Date().toISOString();
    const durationMs = performance.now() - start;
    requireThat(!signal.aborted && Number.isFinite(durationMs) && durationMs >= 0 &&
      durationMs <= prepared.request.timeoutMs && Date.parse(completedAt) >= Date.parse(startedAt), "upstream");
    const value = Object.freeze({
      ...output,
      capture: Object.freeze({
        correlationId, startedAt, completedAt, durationMs,
        resource: prepared.resource,
        provenance: "internal-transport-observation" as const,
        enumeration: "not-established" as const,
        snapshotConsistency: "not-established" as const,
      }),
    });
    requireThat(Buffer.byteLength(JSON.stringify(value), "utf8") <= 32768, "cap");
    return value;
  };
}

export function currentContentTransport(fetcher: typeof fetch = fetch) {
  return async function read(descriptor: ReturnType<typeof currentContentDescriptor>, raw: unknown,
    credential: string, signal: AbortSignal) {
    const prepared = descriptor.prepare(raw);
    requireThat(descriptor.providerOperationId === "worker-script-get-content" &&
      /^\/accounts\/[a-f0-9]{32}\/workers\/scripts\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/content\/v2$/.test(prepared.request.path), "schema");
    const correlationId = randomUUID();
    const startedAt = new Date().toISOString();
    const start = performance.now();
    let boundary = "";
    const bytes = await boundedResponse(fetcher, prepared.request, credential, signal, "multipart/form-data", value => {
      // Deliberately narrow local media contract; no guessed JSON/string fallback.
      const match = /^multipart\/form-data\s*;\s*boundary=(?:"([A-Za-z0-9'()+_,.\/:=?-]{1,70})"|([A-Za-z0-9'()+_,.\/:=?-]{1,70}))\s*$/i.exec(value);
      requireThat(match !== null, "upstream");
      boundary = match[1] ?? match[2]!;
    });
    const completedAt = new Date().toISOString();
    const durationMs = performance.now() - start;
    requireThat(!signal.aborted && Number.isFinite(durationMs) && durationMs >= 0 &&
      durationMs <= prepared.request.timeoutMs && Date.parse(completedAt) >= Date.parse(startedAt), "upstream");
    const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const first = Buffer.from(`--${boundary}\r\n`);
    const last = Buffer.from(`\r\n--${boundary}--`);
    const end = body.subarray(-2).equals(Buffer.from("\r\n")) ? body.length - 2 : body.length;
    // Framing only, not a module parser or proof of source semantics.
    requireThat(body.subarray(0, first.length).equals(first) && end >= first.length + last.length &&
      body.subarray(end - last.length, end).equals(last), "upstream");
    const output = descriptor.project(bytes, prepared, boundary);
    return Object.freeze({
      ...output,
      capture: Object.freeze({
        correlationId, startedAt, completedAt, durationMs,
        resource: prepared.resource,
        format: "multipart-form-data-framing-only" as const,
        provenance: "internal-transport-observation" as const,
      }),
    });
  };
}
