import { requireThat, text } from "../../../packages/core/src/index.js";
import type { MetadataDescriptor, MetadataRequest } from "./metadata.js";

const origin = "https://api.cloudflare.com";
const token = text(4096, /^[A-Za-z0-9._~-]{5,4096}$/);

function endpoint(request: MetadataRequest): string {
  requireThat(request.method === "GET" && request.maxRequests === 1 && request.redirects === "deny", "schema");
  requireThat(Number.isSafeInteger(request.maxResponseBytes) && request.maxResponseBytes > 0 && request.maxResponseBytes <= 131072, "cap");
  requireThat(Number.isSafeInteger(request.timeoutMs) && request.timeoutMs > 0 && request.timeoutMs <= 10000, "cap");
  requireThat(typeof request.path === "string" && request.path.length <= 2048 &&
    /^\/(accounts|zones)\/[a-f0-9]{32}\/[A-Za-z0-9_/?=&.-]+$/.test(request.path), "schema");
  const url = new URL(`/client/v4${request.path}`, origin);
  requireThat(url.origin === origin && url.pathname + url.search === `/client/v4${request.path}`, "schema");
  return url.href;
}

// Internal transport only. The caller must authenticate, authorize and revalidate
// through the reviewed broker before invoking this; it is not a registered tool.
export function metadataTransport(fetcher: typeof fetch = fetch) {
  return async function read<A, O>(descriptor: MetadataDescriptor<A, O>, raw: unknown,
    credential: string, signal: AbortSignal): Promise<O> {
    const prepared = descriptor.prepare(raw);
    const url = endpoint(prepared.request);
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
    const timer = setTimeout(cancel, prepared.request.timeoutMs);
    // Cover an abort between the initial check and listener registration.
    if (signal.aborted) cancel();
    let body: string;
    try {
      body = await Promise.race([cancelled, (async () => {
        requireThat(!controller.signal.aborted, "upstream");
        const response = await fetcher(url, {
          method: "GET", redirect: "manual", signal: controller.signal,
          credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
          headers: { authorization, accept: "application/json" },
        });
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          requireThat(false, "upstream");
        }
        state.stream = response.body;
        requireThat(response.status === 200 && !response.redirected &&
          (response.url === "" || response.url === url), "upstream");
        requireThat(/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? ""), "upstream");
        const length = response.headers.get("content-length");
        requireThat(length === null || (/^\d+$/.test(length) && Number(length) <= prepared.request.maxResponseBytes), "cap");
        requireThat(response.body !== null, "upstream");
        state.reader = response.body.getReader();
        const buffer = new Uint8Array(prepared.request.maxResponseBytes);
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
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytes));
      })()]);
    } catch {
      // Never expose fetch, header, provider-body or cancellation diagnostics.
      requireThat(false, "upstream");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      controller.abort();
      if (state.reader) void state.reader.cancel().catch(() => {});
      else void state.stream?.cancel().catch(() => {});
    }
    return descriptor.project(body, prepared);
  };
}
