---
name: release
description: CTS transport release procedure — list transports, validate pre-release conditions, release, and confirm import readiness
source:
  - sc4sap-custom/skills/release/SKILL.md
---

# Release Transport (CTS)

Full CTS (Change and Transport System) transport release procedure for a single agent. Hybrid mode: confirm transport selection interactively, then auto-execute validation and release steps.

## Purpose

Guide the complete CTS transport release process: listing available transports, selecting the target, validating pre-release conditions, performing the release, and confirming import readiness. It prevents releasing transports with syntax errors or inactive objects.

## Use When

- User says "release", "release transport", "release CTS", "push to QAS", or "transport release"
- A development cycle is complete and objects need to move to the next system (QAS/PRD)
- User wants to validate a transport before releasing
- User wants to check what is in a transport before releasing

## Do Not Use When

- User wants to create a new transport — use the [create-object](create-object.md) procedure (which handles transport assignment) or `CreateTransport` directly
- User wants to import a transport (import is done on the target system by Basis)
- Task is not transport-related

## Hybrid Mode

**Confirm** (interactive): Transport selection — always ask the user to confirm which transport to release.
**Auto-execute**: Validation and release steps run automatically after confirmation.

This ensures you never accidentally release the wrong transport, but the user doesn't need to manually trigger each validation step.

## Workflow Steps

### Step 1 — List Transports (auto)

- Call `ListTransports` to retrieve open modifiable transports
- Display table: Transport No | Description | Owner | Object Count | Last Changed
- Highlight transports owned by current user

### Step 2 — Select Transport (confirmation gate)

- Present the list and ask: "Which transport do you want to release? (Enter transport number)"
- User confirms the transport number
- Call `GetTransport` to show full transport details including the object list

### Step 3 — Pre-Release Validation (auto, after confirmation)

- **Syntax check**: For each ABAP source object in the transport (class / program / interface / include / function module), verify via `CheckSyntax` — a server-side ADT check run against the staged version (function modules additionally require `function_group_name` — resolve it from the transport object list's `R3TR FUGR` entry, or via `SearchObject` on the FM name) — abort if any syntax errors. Non-source objects (DDIC etc.) are covered by the inactive-objects check below
- **Inactive objects check**: Call `GetInactiveObjects` — abort if any objects in the transport are still inactive
- **Object completeness**: Verify all referenced objects (used classes, interfaces) are either in this transport or already in the target system
- Display validation report: PASS / FAIL per check

### Step 4 — Release (auto, only if Step 3 all PASS)

- If any validation failed: display errors and stop — do NOT release
- If all validations pass: call `ReleaseTransport(transport_number)` — release open tasks first, then the parent request (SAP requires tasks released before the request)
- If the response reports `supported: false` (ADT release action unavailable on this system): stop and instruct manual release via SE09/SE10 or STMS
- Report release result: transport number, release status returned by SAP, timestamp

### Step 5 — Import Confirmation

- Display post-release summary:
  - Transport number and description
  - Released-at timestamp
  - Object count
  - Target system(s) in transport route
- Reminder: "Transport released. Import on target system must be triggered by Basis or via STMS."
- Optionally display next steps for the target system import queue

## Error Handling

- Syntax errors found: list each object with error message; do not release; suggest fix via direct MCP `Update*` calls or re-run the `create-program` procedure
- Inactive objects found: list each inactive object; do not release; suggest activation
- Transport already released: report status and skip release step
- Authorization error on release: report S_TRANSPRT authorization requirement

## Backend Tools Used

- `ListTransports` — retrieve open transports
- `GetTransport` — transport details and object list
- `CheckSyntax` — server-side syntax validation per source object
- `ReleaseTransport` — perform the CTS release (tasks first, then the request)
- `GetInactiveObjects` — check for inactive objects
