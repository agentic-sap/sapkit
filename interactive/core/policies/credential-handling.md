---
name: credential-handling
description: Where SAP connection profiles and secrets live — per-machine sap.env, OS keyring for passwords, keyring runtime wiring, and the mandatory SAP_TIER readonly guard
source:
  - sc4sap-custom/docs/multi-profile-design.md
  - sc4sap-custom/.mcp.json
  - server/VERSION
---

# Credential Handling

## Where connection info lives

Connection profiles are **machine-level**, written once per machine, outside
every repository:

```
~/.sc4sap/profiles/<alias>/sap.env     ← host, client, user, tier, blocklist profile
```

A project selects its profile via one line in `.sc4sap/active-profile.txt`
(see [project-context](../project-context.md)). Profile aliases carry the
system meaning (`KR-DEV`, `KR-PRD`, …) — never a bare `default`.

**Never commit credentials.** `sap.env` and everything under `.sc4sap/` are
git-ignored; a repository's `.gitignore` MUST cover them. Switching systems
means switching the profile alias — never pasting connection values into a
project file.

## Passwords — OS keyring, not plaintext

Storing the password in plaintext `sap.env` is discouraged. The recommended
form is a keyring reference that the MCP server resolves at connect time:

```
SAP_PASSWORD=keychain:sc4sap/<alias>/<user>
```

| OS | Backend |
|---|---|
| Windows | Credential Manager |
| macOS | Keychain |
| Linux | libsecret |

### Keyring runtime wiring

The server bundle deliberately externalizes native modules — per
[server/VERSION](../../server/VERSION), `@napi-rs/keyring` (among others) is
**not** inside `server.bundle.cjs`. The keyring runtime therefore ships next to
the bundle and must be wired into the server's module path when launching it:

```json
"env": {
  "NODE_PATH": "<plugin-root>/server/runtime-deps/keyring/node_modules"
}
```

(The origin plugin does exactly this in its `.mcp.json` with
`${CLAUDE_PLUGIN_ROOT}/runtime-deps/keyring/node_modules`.) Without this
wiring, `keychain:` references cannot be resolved and connect fails.

## `SAP_TIER` — required, drives the server readonly guard

Every profile MUST declare its landscape tier:

```
SAP_TIER=dev | qas | prd
```

The MCP server's built-in readonly guard reads this value: on `qas`/`prd`
profiles, write tools (`Create*` / `Update*` / `Delete*`, `CreateTransport`,
…) are blocked **server-side** — this guard works on every harness, including
those without a hook layer (see the honesty note in
[approval-gates](./approval-gates.md)). Non-canonical customer tiers map to the
nearest canonical value (sandbox → `dev`; training/integration → `qas`;
staging/pre-prod → `prd` — when in doubt, choose the more restrictive tier).

**No tier, no connection.** If `SAP_TIER` is unset in the active profile, do
not use connected mode at all — stop and have the user complete the profile
first. An untiered system must be presumed production.
