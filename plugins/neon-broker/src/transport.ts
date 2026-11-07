export const NEON_ORIGIN = "https://console.neon.tech";
export const RESPONSE_BYTES = 65_536;
export const REQUEST_TIMEOUT_MS = 1000;
export const PAGE_SIZE = 10;

export interface MetadataRequestOptions {
  readonly credential: string;
  readonly signal: AbortSignal;
}
export interface NeonMetadataTransport {
  getProject(project: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranches(project: string, cursor: string | null, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranch(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranchEndpoints(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectEndpoint(project: string, endpoint: string, options: MetadataRequestOptions): Promise<unknown>;
}
export type MetadataFetch = (url: string, init: RequestInit) => Promise<Response>;

function id(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) throw Error("INVALID_ARGUMENTS");
  return value;
}

// No default fetch/global transport, SDK, SQL client, retries or discovery fallback.
// Construction is a source/test seam, not an installed or enabled runtime tool.
export function createNeonMetadataTransport(fetcher: MetadataFetch): NeonMetadataTransport {
  async function get(path: string, query: URLSearchParams, options: MetadataRequestOptions): Promise<unknown> {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => controller.abort();
    options.signal.addEventListener("abort", abort, { once: true });
    if (options.signal.aborted) controller.abort();
    const deadline = new Promise<never>((_, reject) => {
      const refuse = () => reject(Error("UPSTREAM_UNAVAILABLE"));
      controller.signal.addEventListener("abort", refuse, { once: true });
      if (controller.signal.aborted) refuse();
      timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
    });
    const work = async () => {
      if (controller.signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
      const suffix = query.size ? `?${query.toString()}` : "";
      const response = await fetcher(`${NEON_ORIGIN}/api/v2${path}${suffix}`, {
        method: "GET", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${options.credential}`, Accept: "application/json" },
      });
      if (controller.signal.aborted || response.status !== 200 || response.redirected ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
        void response.body?.cancel().catch(() => {});
        throw Error("UPSTREAM_UNAVAILABLE");
      }
      const length = response.headers.get("content-length");
      if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > RESPONSE_BYTES)) {
        void response.body?.cancel().catch(() => {});
        throw Error("UPSTREAM_UNAVAILABLE");
      }
      if (!response.body) throw Error("UPSTREAM_UNAVAILABLE");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const item = await reader.read();
        if (controller.signal.aborted) throw Error("UPSTREAM_UNAVAILABLE");
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > RESPONSE_BYTES) throw Error("UPSTREAM_UNAVAILABLE");
        chunks.push(item.value);
      }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    };
    try {
      return await Promise.race([work(), deadline]);
    } catch {
      throw Error("UPSTREAM_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener("abort", abort);
      controller.abort();
      // A transport ignoring cancellation must not hold this call open.
      void reader?.cancel().catch(() => {});
    }
  }
  return Object.freeze({
    getProject: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}`, new URLSearchParams(), options),
    listProjectBranches: (project: string, cursor: string | null, options: MetadataRequestOptions) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), sort_by: "name", sort_order: "asc", include_deleted: "false" });
      if (cursor !== null) {
        if (!/^[\x20-\x7e]{1,256}$/.test(cursor)) throw Error("INVALID_ARGUMENTS");
        query.set("cursor", cursor);
      }
      return get(`/projects/${id(project)}/branches`, query, options);
    },
    getProjectBranch: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}`, new URLSearchParams(), options),
    listProjectBranchEndpoints: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/endpoints`, new URLSearchParams(), options),
    getProjectEndpoint: (project: string, endpoint: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/endpoints/${id(endpoint)}`, new URLSearchParams(), options),
  });
}
