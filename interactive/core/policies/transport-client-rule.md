# Transport Client Rule

When a CTS (Change and Transport System) request is opened, the **source client** must always be stated explicitly — never leave the MCP layer to fall back on an implicit or session-dependent default. A transport opened in the wrong client sits silently invisible in the correct client's STMS queue, produces the classic "my object is active in DEV-100 but not in DEV-200" support ticket, and cannot be reassigned after creation short of a destructive SCC1 copy or manual re-registration.

## Rule

Every `CreateTransport` call MUST be given the `client` parameter, resolved in this order:

1. **`.sapkit/sap.env`** → `SAP_CLIENT` (whatever value the MCP server is genuinely connected with).
2. **`.sapkit/config.json`** → `client` (the alternative project-level override).
3. Neither one present → **fail fast**; make no CreateTransport call. Ask the user to run `the profile setup (core/procedures/troubleshooting.md)` or to name the client by hand.

Never lean on the tool's own default — no default is guaranteed, and the behavior shifts with the SAP backend release and the RFC/SOAP flavor in play.

## Why the client matters (SCC4 context)

- One SAP system carries several **clients** (e.g., 100 for dev, 200 for QA-local, 800 for customizing).
- Each client carries a role declared in **SCC4** (`Development` / `Test` / `Customizing` / `Production` / `SAP reference`) along with a change-recording mode.
- A transport request stays anchored to the client it was opened in. Code objects (PROG, CLAS, DTEL) are client-independent, but the transport *record itself* belongs to one client. Move objects into a transport from a different client and the backend either raises warnings or silently fails, depending on which backend it is.
- Once a user switches sessions (e.g., an SAP GUI logon to client 200 while the MCP server remains wired to 100), creating a transport without an explicit client risks either landing on the wrong client or a plain API error.

## Resolution Pseudo-Code

```python
def resolve_transport_client():
    client = read_env(".sapkit/sap.env", "SAP_CLIENT")
    if not client:
        client = read_json(".sapkit/config.json", "client")
    if not client:
        raise "Refuse to CreateTransport — no client resolved. Run the profile setup (core/procedures/troubleshooting.md) or set SAP_CLIENT manually."
    return client

client = resolve_transport_client()
CreateTransport(
    transport_type="K",    # customizing 'S' or workbench 'K'
    description="...",
    owner=env("SAP_USERNAME"),
    client=client,         # <-- REQUIRED
    target_system=...,
)
```

## Two Traps on the Same Call Path

Both were measured 2026-07-28 → 08-02; the details sit in [troubleshooting](../procedures/troubleshooting.md) § 8.

**Write the description in English.** Where a `description` carries non-ASCII text (Korean, and by extension any non-Latin script), those characters are stored as `#`. The transport still gets created and is fully usable — only the display text is lost, and this tool has no way to repair it afterwards.

**Do not open a transport just to satisfy a local-package refusal.** Where `UpdateFunctionModule` (or a sibling `Update*` / `Create*`) turns down an object sitting in a `$`-prefixed local package with *"The object may be assigned to a transport request. Pass transport_request explicitly."*, the object is local and needs no transport — the tool's local-package detection recognises the literal `$TMP` only. Retry first with the literal string `transport_request: "local"`; `CreateFunctionModule` hands back exactly that value in its own response. Escalate to `CreateTransport` only when `"local"` is refused as well (seen with objects that arrived by abapGit import and may carry transport history). An unnecessary transport is not a harmless one: it joins the CTS queue and somebody has to dispose of it.

## Enforcement

- **`sap-executor`** MUST apply this rule ahead of every `CreateTransport` call. Where the rule fails, stop and report it; do not silently skip past it.
- **`sap-bc-consultant`** MUST cite this rule whenever the advice touches transport creation / client strategy.
- **`sap-code-reviewer`** MAY raise it as a **MAJOR** finding where a transport freshly created in the current session has no recorded client-of-origin.

## Setup contract

`the profile setup (core/procedures/troubleshooting.md)` writes `SAP_CLIENT` into `.sapkit/sap.env` at Step 4 (SAP connection info). So long as setup runs to the end without that step being skipped, the value required by this rule is always there for every transport-creating call that follows. A user who hand-edits `sap.env` to strip the client out breaks this rule, and `CreateTransport` must then fail fast.
