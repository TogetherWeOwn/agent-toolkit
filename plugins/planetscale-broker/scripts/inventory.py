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
    "list_databases": "list-databases",
    "list_branches": "list-branches",
    "list_database_regions": "list-database-regions",
    "list_regions_for_organization": "list-regions-for-organization",
    "list_public_regions": "list-public-regions",
    "get_default_role": "get-default-role",
    "list_backups": "list-backups",
    "get_backup": "get-backup",
    "list_backup_policies": "list-backup-policies",
    "get_backup_policy": "get-backup-policy",
    "list_deploy_requests": "list-deploy-requests",
    "get_deploy_request": "get-deploy-request",
}
LIFECYCLE = {
    "list_backups", "get_backup", "list_backup_policies", "get_backup_policy",
    "list_deploy_requests", "get_deploy_request",
}
DISCOVERY = {
    "list_databases", "list_branches", "list_database_regions",
    "list_regions_for_organization", "list_public_regions", "get_default_role",
}
METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}
LOCAL_PLANS = {"delete_branch", "create_backup", "disable_safe_migrations"}
# Explicit candidates, not a runtime authority registry. Missing classifications
# stay unresolved; method, prefix or a documented provider scope grants nothing.
POLICY_CANDIDATES = {
    "delete_branch": (["release-manager"], "destructive-data-change"),
    "create_backup": (["release-manager", "owner-money"], "backup-data-copy-and-potential-spend"),
    "disable_safe_migrations": (["release-manager", "owner-security"], "migration-safety-removal"),
    "disable_organization_sso": (["owner-security"], "sso-enforcement-removal"),
    "disable_organization_sso_directory": (["owner-security"], "directory-enforcement-removal"),
    "update_payment_method": (["owner-money"], "billing-payment-method-change"),
    "delete_organization_billing_payment_method": (["owner-money"], "billing-payment-method-removal"),
    "create_branch_log_signature": (["owner-credential"], "signed-log-access-credential"),
    "create_oauth_token": (["owner-credential"], "oauth-credential-creation-or-refresh"),
    "create_password": (["owner-credential"], "database-credential-creation"),
    "create_role": (["owner-credential"], "database-role-with-credential-creation"),
    "create_service_token": (["owner-credential"], "service-credential-creation"),
    "renew_password": (["owner-credential"], "database-credential-renewal"),
    "renew_role": (["owner-credential"], "database-role-credential-renewal"),
    "reset_default_role": (["owner-credential"], "default-role-credential-reset"),
    "reset_role": (["owner-credential"], "database-role-credential-reset"),
}


def policy_candidate(operation_id):
    if operation_id not in POLICY_CANDIDATES:
        return None
    authorities, reason = POLICY_CANDIDATES[operation_id]
    return {
        "status": "unreviewed-not-runtime-policy",
        "tier": "reserved",
        "reason": reason,
        "always": authorities,
        "conjunctiveConditions": [
            {"when": "trusted-production-or-data-schema-deploy-impact", "authority": "release-manager"},
            {"when": "trusted-new-spend", "authority": "owner-money"},
            {"when": "trusted-security-weakening", "authority": "owner-security"},
            {"when": "approved-board-host-application-or-secret-placement", "authority": "operator"},
        ],
        "requirements": [
            "authenticated-operation-resource-argument-plan-policy-bound-native-authority",
            "trusted-effect-environment-classification-and-revalidation",
            "atomic-expiring-single-use-consumption-and-durable-uncertain-recovery",
        ],
    }


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
            candidate = policy_candidate(operation_id)
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
                "tier": "read" if adapter else ("reserved" if candidate else "unresolved"),
                "tierReview": "pending",
                "sideEffects": "non-waking-unverified" if method == "get" else "mutation-requires-operation-review",
                "approvalRoute": "per-agent-and-resource-policy; production read classification pending" if adapter else ("unreviewed candidate: see policyCandidate; no runtime authority" if candidate else "unresolved: classify RM, owner, Operator and any conjunctive routes before implementation"),
                "policyCandidate": candidate,
                "localPlan": {
                    "source": "src/mutation-plans.ts", "test": "test/mutation-plans.test.mjs",
                    "execution": "not-implemented", "providerDryRun": "not-performed",
                    "coverage": "bounded-subset-not-full-operation",
                } if operation_id in LOCAL_PLANS else None,
                "credentialEntitlement": "unknown-awaiting-operator-metadata",
                "adapter": "src/tools/" + adapter + ".ts" if adapter else None,
                "test": ("test/lifecycle.test.mjs" if operation_id in LIFECYCLE else ("test/discovery.test.mjs" if operation_id in DISCOVERY else "test/metadata.test.mjs")) if adapter else None,
                "projectionCoverage": "bounded-metadata-subset-not-full-operation" if adapter else "missing",
                "testExecution": "see-exact-head-actions-evidence" if adapter else "no-test-implemented",
                "implementation": "offline-adapter-only" if adapter else "missing",
                "review": "not-reviewed",
                "enablement": "disabled",
                "prerequisites": ["operator-verified-scope-metadata", "reviewed-compatible-common-core", "exact-tier-security-crypto-qa-and-actions"] + ([] if adapter else ["typed-adapter-and-tier-tests"]),
            })
    operations.sort(key=lambda o: o["operationId"])
    operation_ids = {o["operationId"] for o in operations}
    if len(operations) != 291 or len(operation_ids) != 291:
        raise ValueError("unexpected operation coverage")
    if not set(POLICY_CANDIDATES) <= operation_ids or not LOCAL_PLANS <= set(POLICY_CANDIDATES):
        raise ValueError("unknown candidate or local-plan operation")
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
    if check or sys.argv[1:] == ["--write"]:
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
