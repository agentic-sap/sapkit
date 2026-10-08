# Transport Client Rule

When a CTS (Change and Transport System) request is opened, the **source client** must always be stated explicitly — never leave the MCP layer to fall back on an implicit or session-dependent default. A transport opened in the wrong client sits silently invisible in the correct client's STMS queue, produces the classic "my object is active in DEV-100 but not in DEV-200" support ticket, and cannot be reassigned after creation short of a destructive SCC1 copy or manual re-registration.

## Rule

**The client is stated by the connection, not by an argument.** The MCP server sends every ADT request — `CreateTransport` included — with an `X-SAP-Client` header taken from the active profile's `SAP_CLIENT`, so a transport opens in exactly the client the profile names. `CreateTransport` has **no `client` parameter**, and passing one is refused (the server rejects arguments a tool does not declare instead of dropping them). Before every `CreateTransport` call:

1. **Confirm the active profile resolves `SAP_CLIENT`** (`.sapkit/sap.env` of the active profile — whatever value the MCP server is genuinely connected with).
2. Not present → **fail fast**; make no CreateTransport call. Ask the user to run `the profile setup (core/procedures/troubleshooting.md)` or to add `SAP_CLIENT` to the profile by hand.
3. Present, but not the client the user means to work in (they are logged on to another client in SAP GUI, or name one) → stop and say so; the fix is a profile whose `SAP_CLIENT` is that client, followed by `ReloadProfile`.

Never lean on an implicit default — with `SAP_CLIENT` empty no client header goes out and the request lands in the system's default client, which shifts from system to system. (Earlier revisions of this rule told callers to pass a `client` argument and to fall back on `.sapkit/config.json` → `client`. Neither ever reached SAP: the tool never had that argument — it was silently dropped until the server began refusing undeclared arguments — and the server does not read `config.json` for a client.)

## Why the client matters (SCC4 context)

- One SAP system carries several **clients** (e.g., 100 for dev, 200 for QA-local, 800 for customizing).
- Each client carries a role declared in **SCC4** (`Development` / `Test` / `Customizing` / `Production` / `SAP reference`) along with a change-recording mode.
- A transport request stays anchored to the client it was opened in. Code objects (PROG, CLAS, DTEL) are client-independent, but the transport *record itself* belongs to one client. Move objects into a transport from a different client and the backend either raises warnings or silently fails, depending on which backend it is.
- Once a user switches sessions (e.g., an SAP GUI logon to client 200 while the MCP server remains wired to 100), creating a transport without an explicit client risks either landing on the wrong client or a plain API error.

## Resolution Pseudo-Code

```python
def confirm_transport_client():
    client = read_env("<active profile>/sap.env", "SAP_CLIENT")
    if not client:
        raise "Refuse to CreateTransport — the active profile has no SAP_CLIENT. Run the profile setup (core/procedures/troubleshooting.md) or add SAP_CLIENT to the profile."
    return client   # report it to the user alongside the new request number

client = confirm_transport_client()
CreateTransport(
    transport_type="workbench",   # or "customizing"
    description="...",
    owner=env("SAP_USERNAME"),
    target_system=...,
    # no `client` argument — the connection carries SAP_CLIENT as X-SAP-Client
)
```

## Traps on the Same Call Path

Measured 2026-07-28 → 08-10; the details sit in [troubleshooting](../procedures/troubleshooting.md) § 8.

**Check a non-ASCII description on the first transport; write English until it checks out.** Where a `description` carried non-ASCII text (Korean, and by extension any non-Latin script), those characters were stored as `#` — the transport still got created and was fully usable, but the display text was lost with no way to repair it afterwards. The D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) sends the request body declared as UTF-8, which matches the observed damage; **this is offline-verified only and no live transport has been created through it**, so read the description back once on the first non-ASCII transport and fall back to English if it still returns as `#`. On older bundles, English is the only safe answer.

**Do not open a transport just to satisfy a local-package refusal.** Where `UpdateFunctionModule` (or a sibling `Update*` / `Create*`) turns down an object sitting in a `$`-prefixed local package with *"The object may be assigned to a transport request. Pass transport_request explicitly."*, the object is local and needs no transport — the tool's local-package detection recognises the literal `$TMP` only. Retry first with the literal string `transport_request: "local"`; `CreateFunctionModule` hands back exactly that value in its own response. Escalate to `CreateTransport` only when `"local"` is refused as well (seen with objects that arrived by abapGit import and may carry transport history). An unnecessary transport is not a harmless one: it joins the CTS queue and somebody has to dispose of it.

**Give a write the request number, never the task number — and never read the refusal as a lock.** Where an object is registered under a task, `transport_request` still has to carry the **request** that task belongs to: the registration sits on the task while the lock is held at request level, so a task number fails with HTTP 500 *"Object … is already locked in request `<REQUEST>`"*, naming the very request it belongs under. The identical call succeeds with the request number (field-verified 2026-08-10). `E070-STRKORR` carries a task's parent request, which is how the two are told apart.

**Omitting the parameter fails differently by object type, and one of the two shapes lies.** A PROG write refuses with `Parameter corrNr could not be found` (HTTP 400) — explicit, and it names its own cause. A CLAS write refuses with the **same CTS lock wording** as above, which reads as a stale lock; on 2026-08-05 that cost three retries, a request to the user to release a lock, a user-side check finding none, and then immediate success once the request number was supplied. Check the parameter before asking anyone to unlock anything, and do not escalate a lock message to SM12 until `transport_request` has been ruled out.

## Enforcement

- **`sap-executor`** MUST apply this rule ahead of every `CreateTransport` call. Where the rule fails, stop and report it; do not silently skip past it.
- **`sap-bc-consultant`** MUST cite this rule whenever the advice touches transport creation / client strategy.
- **`sap-code-reviewer`** MAY raise it as a **MAJOR** finding where a transport freshly created in the current session has no recorded client-of-origin.

## Setup contract

`the profile setup (core/procedures/troubleshooting.md)` writes `SAP_CLIENT` into `.sapkit/sap.env` at Step 4 (SAP connection info). So long as setup runs to the end without that step being skipped, the value required by this rule is always there for every transport-creating call that follows. A user who hand-edits `sap.env` to strip the client out breaks this rule, and `CreateTransport` must then fail fast.
