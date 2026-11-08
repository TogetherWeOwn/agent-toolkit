export const NEON_ORIGIN = "https://console.neon.tech";
export const RESPONSE_BYTES = 65_536;
export const REQUEST_TIMEOUT_MS = 1000;
export const PAGE_SIZE = 10;

export interface MetadataRequestOptions {
  readonly credential: string;
  readonly signal: AbortSignal;
}
export interface NeonMetadataTransport {
  getOrganization(organization: string, options: MetadataRequestOptions): Promise<unknown>;
  getOrganizationSpendingLimit(organization: string, options: MetadataRequestOptions): Promise<unknown>;
  listOrganizationVPCEndpointsAllRegions(organization: string, options: MetadataRequestOptions): Promise<unknown>;
  listOrganizationVPCEndpoints(organization: string, region: string, options: MetadataRequestOptions): Promise<unknown>;
  getOrganizationVPCEndpointDetails(organization: string, region: string, endpoint: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectPermissions(project: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectMembers(project: string, cursor: string | null, options: MetadataRequestOptions): Promise<unknown>;
  getProjectJWKS(project: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectVPCEndpoints(project: string, options: MetadataRequestOptions): Promise<unknown>;
  getProject(project: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranches(project: string, cursor: string | null, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranch(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranchEndpoints(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectEndpoint(project: string, endpoint: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectOperation(project: string, operation: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectOperations(project: string, cursor: string | null, options: MetadataRequestOptions): Promise<unknown>;
  countProjectBranches(project: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectEndpoints(project: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranchDatabases(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranchDatabase(project: string, branch: string, database: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranchRoles(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranchRole(project: string, branch: string, role: string, options: MetadataRequestOptions): Promise<unknown>;
  getAvailablePreloadLibraries(project: string, options: MetadataRequestOptions): Promise<unknown>;
  getAnonymizedBranchStatus(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  listSnapshots(project: string, options: MetadataRequestOptions): Promise<unknown>;
  getSnapshotSchedule(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranchRealtime(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranchStorage(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranchAiGateway(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getNeonAuthAllowLocalhost(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getNeonAuthPhoneNumberPlugin(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getNeonAuthOAuthProviderPlugin(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  listNeonAuthRedirectURIWhitelistDomains(project: string, options: MetadataRequestOptions): Promise<unknown>;
  listBranchNeonAuthTrustedDomains(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getNeonAuth(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  listNeonAuthIntegrations(project: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranchFunctions(project: string, branch: string, cursor: string | null, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranchFunction(project: string, branch: string, slug: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranchTriggers(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getProjectBranchTrigger(project: string, branch: string, trigger: string, options: MetadataRequestOptions): Promise<unknown>;
  listNeonAuthOAuthClients(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  getNeonAuthOAuthClient(project: string, branch: string, client: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranchBuckets(project: string, branch: string, options: MetadataRequestOptions): Promise<unknown>;
  listProjectBranchCustomDomains(project: string, branch: string, cursor: string | null, options: MetadataRequestOptions): Promise<unknown>;
}
export type MetadataFetch = (url: string, init: RequestInit) => Promise<Response>;

function id(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value) || /[^A-Za-z0-9_-]/.test(value)) throw Error("INVALID_ARGUMENTS");
  return value;
}
function catalogName(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(value) || /[^A-Za-z0-9_-]/.test(value)) throw Error("INVALID_ARGUMENTS");
  return encodeURIComponent(value);
}
function functionSlug(value: string): string {
  if (typeof value !== "string" || value.length > 20 || !/^[a-z0-9]+$/.test(value) || /[^a-z0-9]/.test(value)) throw Error("INVALID_ARGUMENTS");
  return value;
}
function authPathId(value: string): string {
  if (typeof value !== "string" || value.length > 60 || !/^[a-z0-9-]+$/.test(value) || /[^a-z0-9-]/.test(value)) throw Error("INVALID_ARGUMENTS");
  return value;
}
function authClientId(value: string): string {
  if (typeof value !== "string" || value.length > 64 || !/^[A-Za-z0-9]+$/.test(value) || /[^A-Za-z0-9]/.test(value)) throw Error("INVALID_ARGUMENTS");
  return value;
}
function regionId(value: string, detail = false): string {
  if (typeof value !== "string" || value.length > 80 || !/^(aws|azure)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    /[^a-z0-9-]/.test(value) || (detail && !value.startsWith("aws-"))) throw Error("INVALID_ARGUMENTS");
  return value;
}
function cursorQuery(cursor: string | null): URLSearchParams {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor !== null) {
    if (typeof cursor !== "string" || !/^[\x20-\x7e]{1,256}$/.test(cursor) || /[^\x20-\x7e]/.test(cursor)) throw Error("INVALID_ARGUMENTS");
    query.set("cursor", cursor);
  }
  return query;
}

// No default fetch/global transport, SDK, SQL client, retries or discovery fallback.
// Construction is a source/test seam, not an installed or enabled runtime tool.
export function createNeonMetadataTransport(fetcher: MetadataFetch): NeonMetadataTransport {
  async function get(path: string, query: URLSearchParams, options: MetadataRequestOptions): Promise<unknown> {
    if (/[\r\n]/.test(options.credential)) throw Error("UPSTREAM_UNAVAILABLE");
    const expiresAt = performance.now() + REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    // Timer callbacks cannot preempt synchronous fetch/body work or promise continuations.
    const expired = () => controller.signal.aborted || performance.now() >= expiresAt;
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
      if (expired()) throw Error("UPSTREAM_UNAVAILABLE");
      const suffix = query.size ? `?${query.toString()}` : "";
      const response = await fetcher(`${NEON_ORIGIN}/api/v2${path}${suffix}`, {
        method: "GET", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${options.credential}`, Accept: "application/json" },
      });
      if (expired() || response.status !== 200 || response.redirected ||
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
        if (expired()) throw Error("UPSTREAM_UNAVAILABLE");
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > RESPONSE_BYTES) throw Error("UPSTREAM_UNAVAILABLE");
        chunks.push(item.value);
      }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    };
    try {
      const result = await Promise.race([work(), deadline]);
      if (expired()) throw Error("UPSTREAM_UNAVAILABLE");
      return result;
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
    getOrganization: (organization: string, options: MetadataRequestOptions) =>
      get(`/organizations/${authPathId(organization)}`, new URLSearchParams(), options),
    getOrganizationSpendingLimit: (organization: string, options: MetadataRequestOptions) =>
      get(`/organizations/${authPathId(organization)}/billing/spending_limit`, new URLSearchParams(), options),
    listOrganizationVPCEndpointsAllRegions: (organization: string, options: MetadataRequestOptions) =>
      get(`/organizations/${authPathId(organization)}/vpc/vpc_endpoints`, new URLSearchParams(), options),
    listOrganizationVPCEndpoints: (organization: string, region: string, options: MetadataRequestOptions) =>
      get(`/organizations/${authPathId(organization)}/vpc/region/${regionId(region)}/vpc_endpoints`, new URLSearchParams(), options),
    getOrganizationVPCEndpointDetails: (organization: string, region: string, endpoint: string, options: MetadataRequestOptions) =>
      get(`/organizations/${authPathId(organization)}/vpc/region/${regionId(region, true)}/vpc_endpoints/${id(endpoint)}`, new URLSearchParams(), options),
    listProjectPermissions: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${authPathId(project)}/permissions`, new URLSearchParams(), options),
    listProjectMembers: (project: string, cursor: string | null, options: MetadataRequestOptions) =>
      get(`/projects/${authPathId(project)}/members`, cursorQuery(cursor), options),
    getProjectJWKS: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${authPathId(project)}/jwks`, new URLSearchParams(), options),
    listProjectVPCEndpoints: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${authPathId(project)}/vpc_endpoints`, new URLSearchParams(), options),
    getProject: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}`, new URLSearchParams(), options),
    listProjectBranches: (project: string, cursor: string | null, options: MetadataRequestOptions) => {
      const query = cursorQuery(cursor);
      query.set("sort_by", "name");
      query.set("sort_order", "asc");
      query.set("include_deleted", "false");
      return get(`/projects/${id(project)}/branches`, query, options);
    },
    getProjectBranch: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}`, new URLSearchParams(), options),
    listProjectBranchEndpoints: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/endpoints`, new URLSearchParams(), options),
    getProjectEndpoint: (project: string, endpoint: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/endpoints/${id(endpoint)}`, new URLSearchParams(), options),
    getProjectOperation: (project: string, operation: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/operations/${id(operation)}`, new URLSearchParams(), options),
    listProjectOperations: (project: string, cursor: string | null, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/operations`, cursorQuery(cursor), options),
    countProjectBranches: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/count`, new URLSearchParams(), options),
    listProjectEndpoints: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/endpoints`, new URLSearchParams(), options),
    listProjectBranchDatabases: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/databases`, new URLSearchParams(), options),
    getProjectBranchDatabase: (project: string, branch: string, database: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/databases/${catalogName(database)}`, new URLSearchParams(), options),
    listProjectBranchRoles: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/roles`, new URLSearchParams(), options),
    getProjectBranchRole: (project: string, branch: string, role: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/roles/${catalogName(role)}`, new URLSearchParams(), options),
    getAvailablePreloadLibraries: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/available_preload_libraries`, new URLSearchParams(), options),
    getAnonymizedBranchStatus: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/anonymized_status`, new URLSearchParams(), options),
    listSnapshots: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/snapshots`, new URLSearchParams(), options),
    getSnapshotSchedule: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/backup_schedule`, new URLSearchParams(), options),
    getProjectBranchRealtime: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/realtime`, new URLSearchParams(), options),
    getProjectBranchStorage: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/storage`, new URLSearchParams(), options),
    getProjectBranchAiGateway: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/ai_gateway`, new URLSearchParams(), options),
    getNeonAuthAllowLocalhost: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/auth/allow_localhost`, new URLSearchParams(), options),
    getNeonAuthPhoneNumberPlugin: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/auth/plugins/phone-number`, new URLSearchParams(), options),
    getNeonAuthOAuthProviderPlugin: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/auth/plugins/oauth-provider`, new URLSearchParams(), options),
    listNeonAuthRedirectURIWhitelistDomains: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/auth/domains`, new URLSearchParams(), options),
    listBranchNeonAuthTrustedDomains: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/auth/domains`, new URLSearchParams(), options),
    getNeonAuth: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/auth`, new URLSearchParams(), options),
    listNeonAuthIntegrations: (project: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/auth/integrations`, new URLSearchParams(), options),
    listProjectBranchFunctions: (project: string, branch: string, cursor: string | null, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/functions`, cursorQuery(cursor), options),
    getProjectBranchFunction: (project: string, branch: string, slug: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/functions/${functionSlug(slug)}`, new URLSearchParams(), options),
    listProjectBranchTriggers: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/triggers`, new URLSearchParams(), options),
    getProjectBranchTrigger: (project: string, branch: string, trigger: string, options: MetadataRequestOptions) =>
      get(`/projects/${id(project)}/branches/${id(branch)}/triggers/${id(trigger)}`, new URLSearchParams(), options),
    listNeonAuthOAuthClients: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${authPathId(project)}/branches/${authPathId(branch)}/auth/oauth-provider/clients`, new URLSearchParams(), options),
    getNeonAuthOAuthClient: (project: string, branch: string, client: string, options: MetadataRequestOptions) =>
      get(`/projects/${authPathId(project)}/branches/${authPathId(branch)}/auth/oauth-provider/clients/${authClientId(client)}`, new URLSearchParams(), options),
    listProjectBranchBuckets: (project: string, branch: string, options: MetadataRequestOptions) =>
      get(`/projects/${authPathId(project)}/branches/${authPathId(branch)}/buckets`, new URLSearchParams(), options),
    listProjectBranchCustomDomains: (project: string, branch: string, cursor: string | null, options: MetadataRequestOptions) =>
      get(`/projects/${authPathId(project)}/branches/${authPathId(branch)}/custom-domains`, cursorQuery(cursor), options),
  });
}
