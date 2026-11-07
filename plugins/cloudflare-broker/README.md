# Cloudflare provider package — incomplete source build

This directory is an interface-first provider lane, **not an installable plugin or live credential broker**. There is no worker, credential resolver, transport, tool registration or authorization implementation. Source work cannot authorize a Cloudflare call. It targets the candidate `toolkit.provider-broker/v1` common contract; linking and qualification require a reviewed compatible core.

## Coverage ledger

`coverage/source.json` pins the official Cloudflare OpenAPI file by revision, version and exact-byte SHA-256. `coverage/operations.jsonl` retains every method/path in that schema, including deprecated and SDK-ignored operations. It records original API areas, permission/token-group/security/plan annotations, parameter names, request/response-shape fingerprints, typed descriptor association, tier, authority route and implementation/review/enablement state. Shape fingerprints reference the pinned schema; they are not substitute input validators. No generated row is a callable tool or grant.

The initial universe contains 3,777 operations on 2,352 paths across 599 API tags. **All credential entitlements are unknown.** Four operations have typed metadata descriptors; zero are integrated tools, reviewed, enabled or package-complete. The other 3,773 operations remain explicitly missing and unclassified. Unknown tier/authority/scope, a deny-all placeholder or a descriptor alone never counts as implemented. Counts describe the pinned OpenAPI universe, not the actual credential intersection or every Cloudflare protocol. R2 S3-compatible and GraphQL surfaces are explicitly pending supplemental inventory; additional surfaces discovered during scope attestation must be added, not dropped.

Operator scope attestation must contain metadata only: credential reference/type, validity, accounts/zones/resource restrictions, permissions and plan entitlements. API annotations are requirements, not proof of entitlement. Do not retrieve raw credentials to perform inventory, mint a token, broaden access or bypass a 403.

To reproduce (schema data and scripts remain in separate directories):

```sh
schema_dir=$(mktemp -d)
curl -fsS --max-time 120 --max-filesize 60000000 \
  https://raw.githubusercontent.com/cloudflare/api-schemas/650bd71c22db3b938a4611bf4cc5afd896b400b7/openapi.json \
  -o "$schema_dir/openapi.json"
node plugins/cloudflare-broker/scripts/inventory.mjs "$schema_dir/openapi.json" "$schema_dir/operations.jsonl"
cmp plugins/cloudflare-broker/coverage/operations.jsonl "$schema_dir/operations.jsonl"
```

The generator verifies the full source hash before JSON parsing and fails on unexpected source/descriptor identity. CI reproduces the entire map from the pinned official file. Run tests/builds through GitHub Actions; there is no need to install dependencies locally for this slice.

## First typed descriptors

`src/metadata.ts` provides immutable request/projection descriptors for:

| Tool candidate | Official operation | Inputs | Safe projection |
| --- | --- | --- | --- |
| `cloudflare.workers.list` | `worker-script-list-workers` | none | allowed script IDs only |
| `cloudflare.workers.secret_names` | `worker-list-script-secrets` | allowed script name | secret names and type, never values |
| `cloudflare.hyperdrive.list` | `list-hyperdrive` | bounded page/per-page | allowed IDs and caching-disabled flag |
| `cloudflare.hyperdrive.get` | `get-hyperdrive` | allowed Hyperdrive ID | matching ID and caching-disabled flag |

Trusted construction captures an account, resource revision and explicit resource lists. Closed model schemas cannot supply an account, agent, credential, approval, headers or URL. Lists filter each item against the captured resource set. Hyperdrive output omits origin, names, host, database, user, password, DSN, integration and certificate contents. Provider errors are fixed refusal codes, not raw bodies. Descriptors accept bounded JSON strings only, allow at most 100 rows, cap response/output bytes and represent lists as `complete: false`. They do not silently truncate or claim exhaustive pagination. Large Workers/secret lists currently refuse; complete pagination/streaming policy remains unfinished rather than claiming these limitations satisfy full-tool acceptance.

Requests declare one GET, redirect denial, response cap and deadline. **Declarations are not a transport enforcement implementation.** The future transport must use the fixed HTTPS API origin, reject redirects, cap streaming bytes before parsing and enforce deadlines/cancellation. The native/common broker must authenticate and authorize **before** issuing even a filtered list request. Projection cannot establish which account supplied a response; trusted authorized request/response correlation is required. The copied resource snapshot is not a replacement for current policy revalidation.

## Authority and qualification still required

Do not register these descriptors directly as native tools. Common-core integration must provide authenticated runtime identity, per-agent AND account/zone/resource allowlists, current resource/policy revalidation, durable intent/outcome audit and journal claims. Write/reserved tools need typed schemas, validated plans/diffs, exact native decider authorization and replay/stale/mismatch/TOCTOU refusal. There is no generic HTTP/SQL executor and no fake approval flag. Cloudflare has no universal dry-run; a local validated plan must be labeled as such.

Production/deploy/data/schema actions retain the production decider; spend, credential creation/rotation and security weakening retain the owner decider; native installation/configuration remains operator work. Secret-bearing operations require opaque handles/native placement, never raw values. Source/row/customer-log output remains denied without its separate authorization; log time/resource/bytes must be bounded. No new per-call token minting or isolation claim is made; broker scoping cannot isolate a shared operating-system UID.

`test/cloudflare-provider.test.mjs` covers these descriptors' strict request shapes, local resource filtering, metadata projection, malformed input/provider data, bounds, explicit missing coverage and absence of an executor. It does **not** test real cross-agent/native approval/replay behavior: those need common-core integration and actual native authority fixtures. Independent Security → Crypto → QA, exact-head Actions/required review checks, complete scope intersection and full tier tests remain prerequisites. Source merge, installation, runtime enablement and approved affected-agent adoption are separate outcomes.
