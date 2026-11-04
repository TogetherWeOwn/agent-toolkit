# Credential-broker tool standard

Status: proposed; Security Engineer acceptance is required before adoption or install.
Version: 0.1 draft. This document defines an acceptance bar, not a claim that any catalog entry already meets it.

## Purpose and boundaries

An agent receives a narrow operation, not a broad upstream credential. A Paperclip plugin executes that operation using a service-side credential resolved from Paperclip secrets. Deterministic authorization outside the model is the enforcement point. Prompt instructions, tool descriptions, and model-side schema constraints are not security boundaries.

Prefer a provider's genuinely resource-scoped credential when it meets the task. A broker narrows the exposed API, but cannot eliminate the impact of compromise of its own process or upstream credential. Do not combine unrelated services or privileges in one broker process merely for convenience.

REA angle: study the existing Cloudflare test-environment plugin's scoping and fixture design, and Paperclip's managed GitHub credential broker, before adding another implementation. Reuse public interfaces and documented behavior; do not copy private deployment data or assume an existing broker has passed this standard.

## Architecture

1. **One plugin per provider credential trust boundary.** Use independently installed packages such as `cloudflare-broker`, `github-broker` and `planetscale-broker`. Paperclip's plugin model uses a worker process per installed plugin, with capabilities and secret references scoped to that plugin. Bind only that provider's credential to its worker; one provider's tools must have no capability or secret binding that resolves another provider's key. Split one provider into separate plugins only when trust levels differ sharply, for example production deployment versus disposable test-environment minting. Verify worker, capability and secret-resolution isolation on the exact target host version before acceptance; process separation alone is not a claim of an OS sandbox or protection against host compromise.
2. **Many small, single-purpose tools inside each plugin.** Do not expose a `provider(action=…)` multiplexer. Each exact tool name declares its own read, write or destructive risk class so MCP Access Governance can bind access, rate-limit and require approval per tool. Verify actual native-plugin governance coverage as required in §6; declaration alone does not enforce it. A new function means a new tool module, its threat-model section and its refusal tests.
3. **One monorepo, independently shipped plugins.** `agent-toolkit` holds the shared broker library in `packages/core` and one versioned Paperclip plugin package per provider boundary in `plugins/<provider>`. Core supplies call-time secret-resolution helpers, deny-by-default schemas, scope guards, TTL/spend caps, safe audit records and the refusal-test harness. It is a library loaded separately in each worker, not a central credential-bearing service. Each plugin is versioned, reviewed and installed independently; record the exact core version in its acceptance evidence and reassess affected plugins after security-relevant core changes.
4. **No mega-plugin.** Combining providers would hold every credential with the union of capabilities, expand review scope on every change and let one worker crash take down every tool. Sharing code in the monorepo must not share credential bindings or runtime authority.

## 1. Package and evidence layout

```text
packages/
  core/                   # policy, call-time secrets, caps, safe audit, refusal/fixture harness
plugins/
  <provider>/             # independently versioned plugin for one credential trust boundary
    THREAT-MODEL.md        # provider ceiling and a section for each tool
    ACCEPTANCE.md
    src/
      tools/              # one module per single-purpose tool
    test/                 # refusal and handler fixtures for every tool
STANDARD.md
CATALOG.md
```

Do not relocate an existing external plugin merely to match this layout. Catalog its source and compatibility instead. The existing Cloudflare test-environment plugin remains in its repository on the first container tool's critical path. A later migration to `plugins/cloudflare` is backlog work only after that tool ships and `packages/core` exists, with its own review and compatibility assessment. The shared helper supplies reusable primitives, not an authorization decision independent of each tool's threat model. An empty scaffold is not an installed or accepted broker.

Each package must identify its maintainer role, exact SDK and upstream API versions, permission inventory, supported tool names and schemas, and the installation/revocation procedure. Pin dependencies through a lockfile. CI runs offline fixtures and checks; no production secrets or live cloud calls.

## 2. Per-tool threat model (required)

`THREAT-MODEL.md` must include:

1. **Assets and credential ceiling:** provider identity, account/resource scope, all actions its credential can perform, billing impact, and a justification for any privilege the provider cannot narrow. Record secret references, never values.
2. **Exposed subset:** explicit allowlisted operations, methods/endpoints, resources and output fields; a table of credential capability versus tool capability and deliberately forbidden operations.
3. **Principals and trust boundaries:** authenticated caller, tenant/company, agent, project, issue/run where available, broker, state store, approval authority, audit store, scheduler and upstream API. Document which identity fields are trusted host assertions and how they are verified.
4. **Confused deputy:** caller-supplied issue IDs, copied resource handles, cross-project or cross-tenant resources, stale assignments, forged approvals, and upstream resource mutation between authorization and execution.
5. **Prompt injection:** malicious task text, repository files, tool descriptions, bundles, images, API errors and upstream response data. None may change policy, credential selection, destination, identity, caps or approval requirements.
6. **Credential escape:** result serialization, exceptions/causes, HTTP diagnostics, request headers, issue records, plugin state, files, tracing, crash artifacts and subprocess environments. Include secrets reflected by upstream responses.
7. **Lifecycle and abuse:** concurrent calls, replay, retries after ambiguous success, TTL extension, budget exhaustion, partial provisioning, cleanup failure, restart and policy/approval revocation.
8. **Residual risk and controls:** impact of broker/process compromise, operator recovery, kill switch and revocation, upstream scope limitations, and any unsupported enforcement capability. An open control gap is not a passed acceptance item.

## 3. Minimal, closed tool surface

- Register exact names with an explicit dispatch allowlist. Unknown tool names fail closed, including inherited object-property names. No fallback to an HTTP proxy, shell, SDK method name or arbitrary endpoint.
- Validate at execution time with deny-by-default schemas. Object schemas reject unknown properties at every nesting level. Bound strings, arrays, bytes, numbers and nesting; reject malformed values, unsupported enums, non-finite/fractional limits and type coercions. Defaults must not expand privilege.
- Never accept arbitrary credentials, authorization headers, secret references, base URLs, account IDs or approval booleans from agent arguments. Resolve the configured destination and secret reference from trusted configuration.
- Build typed upstream requests from validated fields. Do not spread argument objects into SDK or HTTP options. Allowlist HTTPS origins, API methods and endpoint shapes; do not forward credentials through redirects. Bound request duration, response size, pagination, retry count and concurrency.
- Names have an anchored ASCII grammar and length limit. Reject paths, encoded separators, control characters and ambiguous normalization. A prefix is necessary where configured, but never sufficient for ownership.
- Resolve resource IDs from a broker-owned durable ledger bound to the authenticated principal, tenant, project and task. Recheck binding and lifecycle at every call; never authorize solely from a resource name, handle, or caller-provided issue ID.
- Derive caller identity from verified runtime context. If the host does not supply the identity or binding required by the tool's model, refuse the call. Never use agent-provided identity as a substitute.
- Revalidate authorization, resource identity and immutable request inputs immediately before the side effect. Handle upstream renames, ownership changes and revocation without widening access.
- Untrusted natural-language content remains data. Do not execute caller-provided builds or bundles in the credential-bearing broker process. Isolate builds with no broker secret access; immutable artifact digests bind deployment approvals to what is deployed.

## 4. Secret lifecycle and result hygiene

- Resolve the configured credential only in the authorized call path with `ctx.secrets.resolve`. Validate schema, identity, resource scope and approval before resolving it. Unknown/denied calls must not resolve a credential or make an upstream request.
- Keep the credential and any internal derived credential only in the trusted process for the operation. Do not put it in prompts, tool results, logs, issue records, plugin state, files or subprocess environments. Do not persist raw HTTP requests, responses or error objects. Do not promise memory zeroization in a managed runtime.
- Project results and errors to an explicit output schema. Never return arbitrary upstream bodies. A secret-redacting logger is defense in depth, not permission to log raw data; emit only fixed, allowlisted fields and error codes.
- Test with distinctive synthetic values for the broad credential and each internal derived credential, including upstream reflection in success bodies, error messages, nested objects and headers. Assert their absence from all observable outputs, logs, audit events, persistence and artifacts on success and failure.
- A tool that intentionally delegates a short-lived resource credential is a different exposure model. Existing such tools may be cataloged as legacy/delegated-credential tools, but cannot be labeled compliant with this no-credential-output standard. New delegation or a security exception requires a separately authorized security decision and explicit acceptance criteria; this standard does not grant it.

## 5. TTL, spend and teardown

For every tool that creates resources, its code and threat model must specify:

- Immutable maximum lifetime and a server-derived absolute expiry. Caller TTL may only shorten it; repeated calls cannot extend the lease. Refuse new work too close to expiry to finish safely.
- Explicit finite caps on resource count, container instances, size, requests and other billable dimensions. Budget in integer smallest currency units; reject missing, negative or invalid limits. Reserve worst-case cost atomically before provisioning and reconcile afterwards. Include retries, minimum billing periods, storage, egress and teardown delay. If worst-case cost cannot be bounded, refuse creation rather than claiming a spend cap.
- Durable creation intent and resource ledger before side effects; idempotency keys scoped to the authenticated binding and exact validated action. Concurrent provisioning cannot exceed shared caps. On ambiguous upstream success, reconcile before retrying; never assume failure means no resource exists.
- Independent scheduled teardown at the absolute expiry, plus task completion/cancellation hooks and an orphan sweep. Cleanup must survive plugin restart, the end of an agent run and partial provisioning. Event hooks alone are insufficient.
- Teardown of all created resources and internal credentials, including child resources and billable artifacts. Revoke delegated credentials first where relevant. Only delete IDs in the broker's ownership ledger after checking their binding; never sweep by prefix alone.
- Idempotent cleanup with bounded retries, persisted progress and operator escalation for failures. Verify removal using provider reads/listing; incomplete, paginated, inconsistent or failed verification is not success. Retain non-secret ledger/audit evidence until cleanup is confirmed. Stop new provisioning if cleanup health or budget accounting is unavailable.

Read-only tools state which lifecycle requirements are not applicable and why; they still have rate, time and response-size limits.

## 6. Approval and MCP Access Governance

- Bind access through MCP Access Governance profiles to only the required agents/projects and, when supported, task scope. Classify each tool as read, write or destructive. Unclassified tools and unknown policy states are denied. No broad inherited profile as a convenience.
- Use `require_approval` on destructive actions and other high-impact operations. Approval is not an `approved: true` argument. Verify the authenticated approval authority and bind approval to principal, tenant, tool/version, canonical arguments, exact resource, artifact digest when relevant, policy version, issuance and expiry. Revalidate current scope and atomically consume single-use approvals before execution. Changed inputs, expiry, rejection, replay or revocation mean no call.
- Verify on the target host version that native plugin tools actually traverse the governance policy evaluator and immutable call-event audit path. An MCP policy configuration screenshot or an MCP connection alone does not prove coverage of `ctx.tools.register` calls.
- If the target plugin path is not governed, record that gap. Keep equivalent deterministic scope checks in the plugin, but do not install a destructive tool until a supported approval enforcement path is implemented and accepted. Do not silently replace independent approval with model instructions or a self-signed flag.
- Automatic expiry cleanup is a separate, narrowly preauthorized system action, not a general destructive bypass. Creation consent must specify exact owned-resource cleanup, immutable expiry and caps. The scheduler cannot accept agent-supplied targets. Any operator-initiated early destruction still uses the declared approval policy. Test this distinction.
- Policy lookup, identity lookup or approval verification failure must fail closed. Transport authentication and upstream OAuth scopes never replace business authorization.

## 7. Audit for every attempted call

Write a durable, structured record for allowed, refused, approval-required and failed calls. Include event/correlation ID, server timestamp, verified principal/binding when available, exact tool/version, policy version, safe resource handle, decision/reason code, approval reference, lifecycle/budget reservation reference, upstream request ID when safe, duration and outcome. Use a bounded hash of canonical non-secret arguments only where needed; do not log arbitrary arguments, payloads, SQL, secrets or free-form provider errors.

Record an intent before a side effect and append its outcome afterwards. Audit unavailability prevents new side effects. After a side effect with an audit-write failure, preserve a durable recovery entry and reconcile; do not return unqualified success or retry the side effect blindly. Define how the preauthorized cleanup path retains audit evidence during outages without abandoning expired resources. Log strings must not permit newline/control-character injection. Audit access, retention, redaction and integrity protection are part of acceptance.

## 8. Refusal and fixture tests (required acceptance matrix)

Every tool supplies a table mapping each forbidden capability and each policy branch to named tests. Exhaustive claims over arbitrary inputs are not credible: cover equivalence classes, exact boundaries and generated malformed inputs, and keep the matrix in sync with every new operation.

Minimum matrix:

| Class | Required evidence |
| --- | --- |
| Dispatch/schema | Unknown names/keys/nested keys; prototype names; missing fields; null/array/scalar objects; oversized values; unsupported enums; numeric and Unicode boundary cases |
| Identity/scope | Wrong tenant, agent, project, task or assignment; forged issue ID; copied handle; expired/revoked lease; correct prefix but foreign resource; stale or changed ownership |
| Upstream surface | Every excluded service, method and resource family; arbitrary origin/path/headers; redirects; malformed or partial API responses |
| Secret hygiene | Broad and derived canaries absent in results/errors/logs/state/issue records/files/traces on success, refusals, partial failures and reflected upstream errors |
| Approval | Missing/rejected/expired/forged/wrong-principal/wrong-resource approval; changed arguments/artifact; concurrent consumption; replay; policy revocation and evaluator outage |
| Caps | Below/at/above each cap; zero/negative/non-finite limits; concurrent reservations; worst-case billing and failure reconciliation; no TTL extension |
| Lifecycle | Partial creation; restart; completion/cancellation hooks; absolute-expiry scheduler; orphan sweep; repeated teardown; one child deletion fails; unavailable credential; pagination and negative relist proof |
| Audit/failure | Intent/outcome linkage; one attempted-call record even on refusal; sink failure before and after mutation; safe reason codes; bounded retries and ambiguous-success idempotency |
| Injection | Instructions in task/bundle/API data cannot alter policy, identity, credential/destination selection, cap or approval |

For all preflight refusals, assert zero secret resolutions, zero outbound calls and zero resource/state mutation other than the safe audit record. For denials discovered after a necessary ownership read, assert zero mutating outbound calls and identify the specific allowed read.

The shared fixture harness must default to no network. Inject a strict synthetic transport: exact expected origin/method/path and request shape, deterministic response fixtures, fake clock, fake secret resolver, durable-state fixture, approval verifier and audit sink. Any unregistered request fails the test. Tests never hit live Cloudflare, GitHub or other provider endpoints. Use synthetic account/resource IDs and credentials, not sanitized production captures. Run refusal tests through the actual registered tool handlers, not only helper functions. Concurrency and restart tests must exercise the chosen durable coordination mechanism rather than only a process-local counter.

## 9. Acceptance and installation gate

No install until the Security Engineer accepts the exact reviewed commit/artifact. `ACCEPTANCE.md` records:

- Tool inventory/version and credential ceiling; completed threat model and policy-to-test matrix.
- Exact local/CI commands and observed results, with anything not run called out.
- Governance/approval coverage evidence for the target host version; refused-call and secret-hygiene evidence.
- Lifecycle/spend calculation and cleanup verification evidence, including outage recovery.
- Security acceptance bound to the source revision, artifact digest, configuration envelope and permission set; changes expanding any of these require another review.
- Operator runbook: install/upgrade, trusted secret binding, least-privilege profile, destructive approval policy, deny-by-default canary and rollback/revocation. An operator performs install/configuration and credential placement. Creating or rotating a credential or weakening security requires the separately authorized decision first; acceptance never creates that authority.

Open the code PR as a draft and mark it ready only after implementation and verification are complete. Required CI and review checks must pass, and findings must be fixed or answered with evidence. Do not waive a missing check, invent acceptance or declare an uninstalled tool operational. Registering an existing tool in the catalog is not grandfathered acceptance.

## References and rationale

- [OWASP LLM06:2025 — Excessive Agency](https://owasp.github.io/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html): limit functionality, permission and autonomy; enforce authorization outside the model and independently approve consequential actions.
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html): least-privilege tools, executor-side authorization, untrusted input boundaries, bound approvals, fail-closed controls and audit.
- [MCP Security Best Practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices): separate client/server and upstream authorization, prohibit audience-invalid token passthrough, preserve per-client consent, defend state handles and constrain egress. MCP's token-passthrough prohibition is not itself a blanket specification rule against all scoped-token issuance; the stricter no-credential-output rule above is this toolkit's own policy.

Sources consulted 2026-11-03. Recheck moving specifications and target SDK/host capabilities when implementing a tool. These sources motivate the controls; they do not certify any implementation.
