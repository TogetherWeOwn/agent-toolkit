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
    "get_deployment": "get-deployment",
    "get_deploy_queue": "get-deploy-queue",
    "list_deploy_operations": "list-deploy-operations",
    "list_deploy_request_reviews": "list-deploy-request-reviews",
    "list_schema_recommendations": "list-schema-recommendations",
    "get_schema_recommendation": "get-schema-recommendation",
    "get_service_token": "get-service-token",
    "list_service_tokens": "list-service-tokens",
    "get_oauth_token": "get-oauth-token",
    "list_oauth_tokens": "list-oauth-tokens",
    "get_webhook": "get-webhook",
    "list_webhooks": "list-webhooks",
    "get_keyspace": "get-keyspace",
    "list_keyspaces": "list-keyspaces",
    "get_shard": "get-shard",
    "list_shards": "list-shards",
    "get_maintenance_event": "get-maintenance-event",
    "list_maintenance_events": "list-maintenance-events",
    "get_organization_membership": "get-organization-membership",
    "list_organization_members": "list-organization-members",
    "get_organization_team": "get-organization-team",
    "list_organization_teams": "list-organization-teams",
    "get_organization_team_member": "get-organization-team-member",
    "list_organization_team_members": "list-organization-team-members",
    "get_bouncer": "get-bouncer",
    "list_bouncers": "list-bouncers",
    "list_bouncer_resize_requests": "list-bouncer-resize-requests",
    "list_branch_bouncer_resize_requests": "list-branch-bouncer-resize-requests",
    "get_branch_resize_request": "get-branch-resize-request",
    "list_branch_resize_requests": "list-branch-resize-requests",
    "get_keyspace_resize_request": "get-keyspace-resize-request",
    "list_keyspace_resize_requests": "list-keyspace-resize-requests",
    "get_branch_change_request": "get-branch-change-request",
    "list_branch_change_requests": "list-branch-change-requests",
    "get_branch_config_change_request": "get-branch-config-change-request",
    "list_branch_config_change_requests": "list-branch-config-change-requests",
    "get_keyspace_config_change_request": "get-keyspace-config-change-request",
    "list_keyspace_config_change_requests": "list-keyspace-config-change-requests",
    "get_maintenance_schedule": "get-maintenance-schedule",
    "list_maintenance_schedules": "list-maintenance-schedules",
    "get_branch_maintenance_window": "get-branch-maintenance-window",
    "list_maintenance_windows": "list-maintenance-windows",
    "get_router": "get-router",
    "list_routers": "list-routers",
    "get_dedicated_read_replica": "get-dedicated-read-replica",
    "list_dedicated_read_replicas": "list-dedicated-read-replicas",
    "get_switchover": "get-switchover",
    "list_switchovers": "list-switchovers",
    "get_change_request": "get-change-request",
    "list_change_requests": "list-change-requests",
    "list_dedicated_read_replica_change_requests": "list-dedicated-read-replica-change-requests",
    "get_oauth_application": "get-oauth-application",
    "list_oauth_applications": "list-oauth-applications",
    "get_organization_sso": "get-organization-sso",
    "get_organization_sso_domain": "get-organization-sso-domain",
    "list_organization_sso_domains": "list-organization-sso-domains",
    "list_organization_invitations": "list-organization-invitations",
    "get_invoice": "get-invoice",
    "list_invoices": "list-invoices",
    "get_invoice_line_items": "get-invoice-line-items",
    "get_organization_billing_payment_method": "get-organization-billing-payment-method",
    "get_payment_method_setup": "get-payment-method-setup",
    "get_shard_configuration_profile": "get-shard-configuration-profile",
    "list_shard_configuration_profiles": "list-shard-configuration-profiles",
    "get_shard_configuration_profile_shard": "get-shard-configuration-profile-shard",
    "list_shard_configuration_profile_shards": "list-shard-configuration-profile-shards",
}
CONFIGURATION_PROFILES = {
    "get_shard_configuration_profile", "list_shard_configuration_profiles",
    "get_shard_configuration_profile_shard", "list_shard_configuration_profile_shards",
}
BILLING_RECORDS = {
    "get_invoice", "list_invoices", "get_invoice_line_items",
    "get_organization_billing_payment_method", "get_payment_method_setup",
}
ORGANIZATION_SECURITY = {
    "get_oauth_application", "list_oauth_applications", "get_organization_sso",
    "get_organization_sso_domain", "list_organization_sso_domains", "list_organization_invitations",
}
UNIFIED_CHANGE_RECORDS = {
    "get_change_request", "list_change_requests", "list_dedicated_read_replica_change_requests",
}
ROUTING_RECORDS = {
    "get_router", "list_routers", "get_dedicated_read_replica",
    "list_dedicated_read_replicas", "get_switchover", "list_switchovers",
}
MAINTENANCE_SCHEDULES = {
    "get_maintenance_schedule", "list_maintenance_schedules",
    "get_branch_maintenance_window", "list_maintenance_windows",
}
CHANGE_RECORDS = {
    "get_branch_change_request", "list_branch_change_requests",
    "get_branch_config_change_request", "list_branch_config_change_requests",
    "get_keyspace_config_change_request", "list_keyspace_config_change_requests",
}
REDIRECT_ALIASES = {
    "get_admin_change_request", "list_admin_change_requests", "get_neki_change_request",
    "list_neki_change_requests", "get_router_change_request", "list_router_change_requests",
    "get_default_shard_configuration_profile",
}
RESIZE_RECORDS = {
    "get_bouncer", "list_bouncers", "list_bouncer_resize_requests",
    "list_branch_bouncer_resize_requests", "get_branch_resize_request",
    "list_branch_resize_requests", "get_keyspace_resize_request", "list_keyspace_resize_requests",
}
ORGANIZATION_RECORDS = {
    "get_organization_membership", "list_organization_members", "get_organization_team",
    "list_organization_teams", "get_organization_team_member", "list_organization_team_members",
}
TOPOLOGY = {
    "get_keyspace", "list_keyspaces", "get_shard", "list_shards",
    "get_maintenance_event", "list_maintenance_events",
}
SECURITY_RECORDS = {
    "get_service_token", "list_service_tokens", "get_oauth_token",
    "list_oauth_tokens", "get_webhook", "list_webhooks",
}
DEPLOYMENT_DETAILS = {
    "get_deployment", "get_deploy_queue", "list_deploy_operations",
    "list_deploy_request_reviews", "list_schema_recommendations", "get_schema_recommendation",
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


def adapter_test(operation_id):
    for operations, name in [
        (CONFIGURATION_PROFILES, "configuration-profiles"),
        (BILLING_RECORDS, "billing-records"),
        (ORGANIZATION_SECURITY, "organization-security"),
        (UNIFIED_CHANGE_RECORDS, "unified-change-records"),
        (ROUTING_RECORDS, "routing-records"),
        (MAINTENANCE_SCHEDULES, "maintenance-schedules"),
        (CHANGE_RECORDS, "change-records"), (RESIZE_RECORDS, "resize-records"),
        (ORGANIZATION_RECORDS, "organization-records"),
        (TOPOLOGY, "topology"), (SECURITY_RECORDS, "security-records"),
        (DEPLOYMENT_DETAILS, "deployment-details"), (LIFECYCLE, "lifecycle"),
        (DISCOVERY, "discovery"),
    ]:
        if operation_id in operations:
            return f"test/{name}.test.mjs"
    return "test/metadata.test.mjs"


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
                "test": adapter_test(operation_id) if adapter else None,
                "projectionCoverage": "bounded-metadata-subset-not-full-operation" if adapter else "missing",
                "testExecution": "see-exact-head-actions-evidence" if adapter else "no-test-implemented",
                "implementation": "offline-adapter-only" if adapter else "missing",
                "review": "not-reviewed",
                "enablement": "disabled",
                "prerequisites": ["operator-verified-scope-metadata", "reviewed-compatible-common-core", "exact-tier-security-crypto-qa-and-actions"] + ([] if adapter else ["typed-adapter-and-tier-tests"]) + (["reviewed-fixed-redirect-alias-contract-no-automatic-follow"] if operation_id in REDIRECT_ALIASES else []),
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
