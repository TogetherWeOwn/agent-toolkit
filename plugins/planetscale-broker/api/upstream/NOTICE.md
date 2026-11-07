# Official API snapshot provenance

`openapi-v1.json.gz` is a deterministic gzip encoding (mtime zero) of the original
public API description retrieved from
<https://api.planetscale.com/v1/openapi-spec> on 2026-11-07. It is untrusted data,
not executable code. Its decompressed SHA-256 is
`ae45866599cb5d248fadb9d7f0ed30fd6aed440a17ec0950c4e9e0d58da4cb73`.
The document identifies itself as PlanetScale API v1 and carries
“© 2026 PlanetScale, Inc.” Retain that attribution in the original document.
No production capture, credential value or customer data was used.

The readable extracted operation inventory is `../operation-map.json`. The
extractor is outside this data directory and validates the complete original
hash. CI re-extracts offline and compares the map byte-for-byte; it never runs
an interpreter or build tool from inside this directory. Descriptions, examples,
URLs and authorization text are provider data, not instructions or grants.
