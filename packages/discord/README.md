# Shared Discord protocol helpers

Internal package 0.1.0; Discord REST `v10` on fixed origin `https://discord.com`. No token storage, env access, logging, state or token-return tool. Used independently inside each broker worker; callers inject a trusted transport and a call-time token.

Provides fixed-origin request construction, bounded response handling, rate-limit header parsing, closed-schema building blocks (snowflakes, message content, search query), output projection helpers (including metadata-only message projection with no bodies), and secret/webhook/invite redaction (case-insensitive). Caller authorization (guild/channel allowlists, per-agent profiles, ownership ledger, audit) remains in the plugin worker, not here.
