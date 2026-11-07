# Cloudflare provider package — incomplete source build

This directory is an interface-first provider lane, **not an installable plugin or live credential broker**. There is no worker, credential resolver, transport, tool registration or authorization implementation. Source work cannot authorize a Cloudflare call. It targets the candidate `toolkit.provider-broker/v1` common contract; linking and qualification require a reviewed compatible core.

## Coverage ledger

`coverage/source.json` pins the official Cloudflare OpenAPI file by revision, version and exact-byte SHA-256. `coverage/operations.jsonl` retains every method/path in that schema, including deprecated and SDK-ignored operations. It records original API areas, permission/token-group/security/plan annotations, parameter names, request/response-shape fingerprints, typed descriptor association, tier, authority route and implementation/review/enablement state. Shape fingerprints reference the pinned schema; they are not substitute input validators. No generated row is a callable tool or grant.

The initial universe contains 3,777 operations on 2,352 paths across 599 API tags. **All credential entitlements are unknown.** Thirteen operations have typed metadata descriptors and five have reserved deletion-plan descriptors; zero are integrated tools, reviewed, enabled or package-complete. The other 3,759 operations remain explicitly missing and unclassified. Plan-only rows use `implementation: plan-descriptor-only` and retain execution/projection, provider-precondition and native-authority prerequisites; they are not implemented destructive tools. Unknown tier/authority/scope, a deny-all placeholder or a descriptor alone never counts as implemented. Counts describe the pinned OpenAPI universe, not the actual credential intersection or every Cloudflare protocol. The supplemental `coverage/r2-s3.json` retains 73 documented S3 operations (26 provider-supported, 47 unsupported), feature restrictions, region/checksum tables and behavioral limitations at a separately pinned official docs revision. All 73 remain missing/unclassified/unreviewed/disabled in this package, with unknown credential compatibility and explicit owning prerequisites; an unsupported provider operation is not a completed adapter. S3 counts are separate from the REST OpenAPI counts. GraphQL's exact entitled dataset/field schema remains uninventoried; reference examples are not a schema. Additional surfaces discovered during scope attestation must be added, not dropped.

Operator scope attestation must contain metadata only: credential reference/type, validity, accounts/zones/resource restrictions, permissions and plan entitlements. API annotations are requirements, not proof of entitlement. Private connection/credential references and attestation evidence stay in the private admission record, not this public source manifest. Connection metadata alone does not establish live provider validity, the complete account/zone membership, current plans or operation/protocol entitlement. OAuth scopes, API-token permission groups and S3 signing credentials are distinct; do not infer one from another. Do not retrieve raw credentials to perform inventory, mint a token, broaden access or bypass a 403.

A broker-held master credential is intentional: its scope count/breadth alone is not a defect and does not require rotation, narrowing or re-consent. Credential capability is an upper bound, never an agent grant. The broker must enforce current per-agent AND operation/account/zone/resource policy tiers before any request; existing protected-action denials remain until the actual decider approves a change. This design does not waive secret exposure, policy bypass, shared-UID limitations, exact production/credential/spend authority, independent reviews or installation/enablement gates. No automatic per-call credential minting is permitted; where supported and separately authorized it may be added, otherwise broker-side scoping and its residual boundary must be documented.

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

The supplemental generator likewise verifies the exact public docs hash before parsing, checks operation identities/counts, retains line citations and feature markers, and fails rather than accepting an unparsed operation row. Reproduce its separate ledger with:

```sh
docs_dir=$(mktemp -d)
curl -fsS --max-time 120 --max-filesize 1000000 \
  https://raw.githubusercontent.com/cloudflare/cloudflare-docs/53ce9b502646fdc019b8184b29b9f1054939e1b6/src/content/docs/r2/api/s3/api.mdx \
  -o "$docs_dir/r2-s3.mdx"
node plugins/cloudflare-broker/scripts/supplemental.mjs "$docs_dir/r2-s3.mdx" "$docs_dir/r2-s3.json"
cmp plugins/cloudflare-broker/coverage/r2-s3.json "$docs_dir/r2-s3.json"
```

Compatibility facts and documentation excerpts are attributed to [Cloudflare's S3 compatibility reference](https://github.com/cloudflare/cloudflare-docs/blob/53ce9b502646fdc019b8184b29b9f1054939e1b6/src/content/docs/r2/api/s3/api.mdx), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([source license](https://github.com/cloudflare/cloudflare-docs/blob/53ce9b502646fdc019b8184b29b9f1054939e1b6/LICENSE)), supplied as-is without warranty. The supplemental ledger extracts/restructures rows and normalizes table cells and prose whitespace without upgrading provider support to package support. No Cloudflare endorsement is implied. In particular, `x-amz-expected-bucket-owner` is unsupported, `UploadPartCopy` lacks copy-source conditional headers that `CopyObject` supports, and replacing a multipart part can lose the original on failure. These restrictions must constrain future adapters; no S3 client, signing or credential lookup is introduced here. Exact source pins describe a snapshot, not future provider behavior.

## First typed descriptors

`src/metadata.ts` provides immutable request/projection descriptors for:

| Tool candidate | Official operation | Inputs | Safe projection |
| --- | --- | --- | --- |
| `cloudflare.workers.list` | `worker-script-list-workers` | none | allowed script IDs only |
| `cloudflare.workers.secret_names` | `worker-list-script-secrets` | allowed script name | secret names and type, never values |
| `cloudflare.workers.deployments.list` | `worker-deployments-list-deployments` | allowed script name, bounded page/per-page | deployment UUIDs in that script's allowlist only |
| `cloudflare.workers.deployments.get` | `worker-deployments-get-deployment` | allowed script and deployment UUID pair | matching deployment UUID only |
| `cloudflare.hyperdrive.list` | `list-hyperdrive` | bounded page/per-page | allowed IDs and caching-disabled flag |
| `cloudflare.hyperdrive.get` | `get-hyperdrive` | allowed Hyperdrive ID | matching ID and caching-disabled flag |
| `cloudflare.d1.list` | `d1-list-databases` | bounded page/per-page | allowed database UUIDs only |
| `cloudflare.d1.get` | `d1-get-database` | allowed database UUID | matching UUID only; request selects `fields=uuid` |
| `cloudflare.r2.list` | `r2-list-buckets` | bounded per-page | allowed default-jurisdiction bucket names only |
| `cloudflare.r2.get` | `r2-get-bucket` | allowed default-jurisdiction bucket name | matching name only |
| `cloudflare.zones.get` | `zones-0-get` | none; trusted account and zone | matching zone ID only, after account-ID check |
| `cloudflare.dns.list` | `dns-records-for-a-zone-list-dns-records` | bounded page/per-page; trusted zone | allowed record IDs only |
| `cloudflare.dns.get` | `dns-records-for-a-zone-dns-record-details` | allowed DNS record ID; trusted zone | matching record ID only |

Deployment read descriptors capture an optional deployment-ID allowlist separately for each allowed script. Both script and deployment IDs must match for detail reads; lists filter every row against that script's copied set. Empty/missing deployment lists expose no IDs. Projections omit annotations/messages, author identity, version bindings/traffic data, timestamps and source. The official list shape is an object containing `deployments`, not a bare array. These descriptors do not create/delete deployments, upload source, change traffic, accept `force` or implement the corresponding production tiers; those operations remain missing. Response provenance and current agent/resource authorization still require the reviewed common core.

`zoneMetadataDescriptors` captures the account/zone relationship and record allowlist from trusted context, never model arguments. The future core must validate that relationship before calling DNS endpoints; record responses may omit zone/account metadata and cannot establish provenance. Explicit foreign `zone_id` values refuse, zone-detail account IDs must match, and each record list item is filtered locally. These descriptors never expose DNS names, TXT/content/data, tags, comments, zone names/nameservers or plan details, and never mutate records. They do not constitute full DNS tools or native authority tests.

D1 identifiers are canonical lowercase UUIDs, never database names or SQL. R2 descriptors cover only the default jurisdiction and the first bounded list page; non-default jurisdictions and cursor continuation are still incomplete. The future transport must not inject a jurisdiction header or change the captured account. Explicit non-default jurisdiction responses refuse. Storage projections omit database names/rows/schema, object keys/content, cursors, location and other descriptive payloads. Optional storage allowlists default empty and are copied at construction. These local checks do not establish native per-agent authority, cross-account response provenance or current credential scope.

Trusted construction captures an account, resource revision and explicit resource lists. Closed model schemas cannot supply an account, agent, credential, approval, headers or URL. Lists filter each item against the captured resource set. Hyperdrive output omits origin, names, host, database, user, password, DSN, integration and certificate contents. Provider errors are fixed refusal codes, not raw bodies. Descriptors accept bounded JSON strings only, allow at most 100 rows, cap response/output bytes and represent lists as `complete: false`. They do not silently truncate or claim exhaustive pagination. Large Workers/secret lists currently refuse; complete pagination/streaming policy remains unfinished rather than claiming these limitations satisfy full-tool acceptance.

Requests declare one GET, redirect denial, response cap and deadline. **Declarations are not a transport enforcement implementation.** The future transport must use the fixed HTTPS API origin, reject redirects, cap streaming bytes before parsing and enforce deadlines/cancellation. The native/common broker must authenticate and authorize **before** issuing even a filtered list request. Projection cannot establish which account supplied a response; trusted authorized request/response correlation is required. The copied resource snapshot is not a replacement for current policy revalidation.

## Reserved deletion plans — no execution

`src/deletion-plans.ts` supplies five single-purpose local planners, not a mutation client:

| Tool candidate | Official operation | Bound resource |
| --- | --- | --- |
| `cloudflare.workers.delete` | `worker-script-delete-worker` | account + script |
| `cloudflare.hyperdrive.delete` | `delete-hyperdrive` | account + Hyperdrive ID |
| `cloudflare.d1.delete` | `d1-delete-database` | account + database UUID |
| `cloudflare.r2.delete` | `r2-delete-bucket` | account + default-jurisdiction bucket |
| `cloudflare.dns.delete` | `dns-records-for-a-zone-delete-dns-record` | account + zone + record ID |

Destructive allowlists are separate from read allowlists, copied at construction, bounded and empty by default. Each target requires an explicit trusted resource revision and security-impact classification; unknown classification refuses. Account/zone association, revision and impact must come from the authenticated integration, never model arguments. These planners conservatively retain Release Manager authorization for all five destructive/data/production operations, plus conjunctive owner Security authorization when the trusted impact weakens security. A plan's route labels are obligations for the future native adapter, not grant evidence or an approval verifier. No money or credential-creation operation is covered here.

Each closed argument schema selects only the exact allowlisted ID. The immutable plan binds that resource/revision, impact, required authorities and fixed effect warnings. It is explicitly `validated-local-plan`, `providerDryRun: false`; no provider call or remote state inspection occurred. Workers deletion pins `force=false` and warns that Durable Object namespaces may be deleted and dependent services may fail. This is not a guarantee that ordinary deletion is reversible or dependency-safe. DNS deletion warns about non-atomic propagation. R2 covers only default jurisdiction and does not empty buckets or delete objects. No request may be retried after an ambiguous mutation outcome.

The plans explicitly mark remote conditional-write support **not established**. There is no executor, success projector, native verifier/consumer or recovery adapter. Before these become callable, the reviewed core must bind the exact plan/arguments/principal/policy to authenticated native grants, revalidate trusted impact/revision after awaited steps, and enforce accepted provider preconditions/fencing and uncertain-outcome reconciliation. If the provider cannot close the remote race safely, the tool stays unavailable; a local revision label is not an atomic provider precondition. Tests cover local schema/scope/route/snapshot behavior only, not real cross-agent, approval consumption, replay or remote TOCTOU safety. No protected-action denial has been relaxed.

## Authority and qualification still required

Do not register these descriptors directly as native tools. Common-core integration must provide authenticated runtime identity, per-agent AND account/zone/resource allowlists, current resource/policy revalidation, durable intent/outcome audit and journal claims. Write/reserved tools need typed schemas, validated plans/diffs, exact native decider authorization and replay/stale/mismatch/TOCTOU refusal. There is no generic HTTP/SQL executor and no fake approval flag. Cloudflare has no universal dry-run; a local validated plan must be labeled as such.

Production/deploy/data/schema actions retain the production decider; spend, credential creation/rotation and security weakening retain the owner decider; native installation/configuration remains operator work. Secret-bearing operations require opaque handles/native placement, never raw values. Source/row/customer-log output remains denied without its separate authorization; log time/resource/bytes must be bounded. No new per-call token minting or isolation claim is made; broker scoping cannot isolate a shared operating-system UID.

`test/cloudflare-provider.test.mjs` covers these descriptors' strict request shapes, local resource filtering, metadata projection, malformed input/provider data, bounds, explicit missing coverage and absence of an executor. It does **not** test real cross-agent/native approval/replay behavior: those need common-core integration and actual native authority fixtures. Independent Security → Crypto → QA, exact-head Actions/required review checks, complete scope intersection and full tier tests remain prerequisites. Source merge, installation, runtime enablement and approved affected-agent adoption are separate outcomes.
