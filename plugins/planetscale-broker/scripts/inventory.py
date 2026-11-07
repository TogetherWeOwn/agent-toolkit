"""Extract the pinned official API map. No network, credentials, or provider calls.

Usage: python3 -I plugins/planetscale-broker/scripts/inventory.py /path/to/openapi.json
The downloaded document is data, never executable source.
"""
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

SOURCE_SHA256 = "ae45866599cb5d248fadb9d7f0ed30fd6aed440a17ec0950c4e9e0d58da4cb73"
ADAPTERS = {
    "get_organization": "get-organization",
    "get_database": "get-database",
    "get_branch": "get-branch",
    "list_roles": "list-roles",
    "get_role": "get-role",
    "list_passwords": "list-passwords",
    "get_password": "get-password",
    "get_branch_schema": "relation-exists",
}
METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def permissions(description):
    service = re.search(r"\*\*Service Token Accesses\*\*(.*?)(?:\*\*OAuth Scopes\*\*|$)", description, re.S)
    oauth = description.split("**OAuth Scopes**", 1)
    rows = []
    if len(oauth) == 2:
        for line in oauth[1].splitlines():
            columns = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(columns) == 2 and "`" in columns[1]:
                rows.append({"resource": columns[0], "anyOf": re.findall(r"`([^`]+)`", columns[1])})
    return {
        "serviceTokenAnyOf": re.findall(r"`([^`]+)`", service[1]) if service else [],
        "serviceTokenDocumentation": "listed" if service else "not-listed-not-proof-of-denial",
        "oauthAlternatives": rows,
    }


def inventory(raw):
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("official source digest mismatch; review a new snapshot explicitly")
    source = json.loads(raw)
    if source["swagger"] != "2.0" or source["host"] != "api.planetscale.com" or source["basePath"] != "/v1":
        raise ValueError("unexpected API identity")
    operations = []
    for path, item in source["paths"].items():
        for method, operation in item.items():
            if method not in METHODS:
                continue
            operation_id = operation["operationId"]
            adapter = ADAPTERS.get(operation_id)
            description = operation.get("description", "")
            operations.append({
                "operationId": operation_id,
                "areas": operation.get("tags", []),
                "method": method.upper(),
                "path": source["basePath"] + path,
                "tool": "planetscale." + operation_id if operation_id != "get_branch_schema" else "planetscale.relation_exists",
                "resourceParameters": [p["name"] for p in operation.get("parameters", []) if p["in"] == "path"],
                "parameters": operation.get("parameters", []),
                "successSchemas": {code: response.get("schema") for code, response in operation["responses"].items() if code.startswith("2")},
                "documentedAuthorization": permissions(description),
                "operationSha256": hashlib.sha256(canonical(operation)).hexdigest(),
                "tier": "read" if adapter else "unresolved",
                "tierReview": "pending",
                "sideEffects": "non-waking-unverified" if method == "get" else "mutation-requires-operation-review",
                "approvalRoute": "per-agent-and-resource-policy; production read classification pending" if adapter else "unresolved: classify RM, owner, Operator and any conjunctive routes before implementation",
                "credentialEntitlement": "unknown-awaiting-operator-metadata",
                "adapter": "src/tools/" + adapter + ".ts" if adapter else None,
                "test": "test/metadata.test.mjs" if adapter else None,
                "testExecution": "not-yet-observed",
                "implementation": "offline-adapter-only" if adapter else "missing",
                "review": "not-reviewed",
                "enablement": "disabled",
                "prerequisites": ["operator-verified-scope-metadata", "reviewed-compatible-common-core", "exact-tier-security-crypto-qa-and-actions"] + ([] if adapter else ["typed-adapter-and-tier-tests"]),
            })
    operations.sort(key=lambda o: o["operationId"])
    if len(operations) != 291 or len({o["operationId"] for o in operations}) != 291:
        raise ValueError("unexpected operation coverage")
    return {
        "schemaVersion": "planetscale-operation-map/1",
        "status": "partial-source-build-not-feature-complete",
        "source": {
            "referenceUrl": "https://planetscale.com/docs/api/reference",
            "schemaUrl": "https://api.planetscale.com/v1/openapi-spec",
            "apiVersion": source["info"]["version"],
            "format": "Swagger 2.0",
            "retrievedDate": "2026-11-07",
            "sha256": SOURCE_SHA256,
            "bytes": len(raw),
            "operationCount": len(operations),
        },
        "credentialScopeReceipt": None,
        "commonCoreContract": None,
        "operations": operations,
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    check = sys.argv[1:] == ["--check"]
    if check:
        with gzip.open(root / "api" / "upstream" / "openapi-v1.json.gz", "rb") as source_file:
            raw = source_file.read(1_000_001)
        if len(raw) > 1_000_000:
            raise ValueError("oversized source snapshot")
    else:
        raw = Path(sys.argv[1]).read_bytes()
    result = inventory(raw)
    destination = root / "api" / "operation-map.json"
    # One operation per line keeps this large, mechanical inventory reviewable.
    header = {key: value for key, value in result.items() if key != "operations"}
    prefix = json.dumps(header, indent=2)[:-2]
    rendered = prefix + ',\n  "operations": [\n' + ",\n".join("    " + json.dumps(o, separators=(",", ":")) for o in result["operations"]) + "\n  ]\n}\n"
    if check:
        if destination.read_text() != rendered:
            raise ValueError("operation map differs from pinned source/extractor")
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(rendered)
    print(f"Mapped {len(result['operations'])} operations; {len(ADAPTERS)} offline adapters; no enabled operations")
