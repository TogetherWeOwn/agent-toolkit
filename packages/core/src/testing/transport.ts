import { isDeepStrictEqual } from "node:util";

export interface SyntheticRequest {
  origin: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  body: unknown;
  credential: string;
}
export interface SyntheticResponse {
  status: number;
  body: unknown;
}
export interface Transport {
  send(request: SyntheticRequest): Promise<SyntheticResponse>;
}
export interface ExpectedCall {
  origin: string;
  method: SyntheticRequest["method"];
  path: string;
  body: unknown;
  credential: string;
  response: SyntheticResponse | (() => SyntheticResponse);
}

/** A strict queue, not fetch: no native network implementation exists here.
 * The credential is compared in memory, never recorded or included in errors.
 */
export class StrictTransport implements Transport {
  readonly calls: Array<{ method: string; path: string }> = [];
  private position = 0;
  private failures = 0;
  constructor(private readonly expected: readonly ExpectedCall[] = []) {}
  async send(request: SyntheticRequest): Promise<SyntheticResponse> {
    const expected = this.expected[this.position++];
    const matched = expected && request.origin === expected.origin && request.method === expected.method &&
      request.path === expected.path && request.credential === expected.credential && isDeepStrictEqual(request.body, expected.body);
    if (!matched) {
      this.failures++;
      throw new Error("unexpected synthetic request");
    }
    this.calls.push({ method: expected.method, path: expected.path });
    return typeof expected.response === "function" ? expected.response() : structuredClone(expected.response);
  }
  assertComplete(): void {
    if (this.failures || this.position !== this.expected.length) throw new Error("synthetic request sequence mismatch");
  }
}

// Shapes for testing a future adapter; these are NOT provider implementations.
export const cloudflareFixture = (path: string, credential: string, result: unknown): ExpectedCall => ({
  origin: "https://api.cloudflare.com", method: "GET", path, body: null, credential,
  response: { status: 200, body: { success: true, result } },
});
export const githubFixture = (path: string, credential: string, body: unknown): ExpectedCall => ({
  origin: "https://api.github.com", method: "GET", path, body: null, credential,
  response: { status: 200, body },
});
