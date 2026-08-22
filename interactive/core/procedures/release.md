---
name: release
description: CTS transport release procedure — list transports, validate pre-release conditions, release, and confirm import readiness
source:
  - sc4sap-custom/skills/release/SKILL.md
---

# Release Transport (CTS)

End-to-end CTS (Change and Transport System) release procedure run by a single agent. The path is **Guided-P4**; Direct-P4 has no entry point. Picking the transport, validating it, and releasing it all happen attended: a human operator who is present states back the exact task number and the parent request number before the release call goes out. Importing is Basis / STMS only.

## Purpose

Carry the CTS release through end to end: enumerate the transports on offer, settle on the target, check the conditions that have to hold before a release, perform the release, and confirm the transport is ready to import. The checks are what keep a transport carrying syntax errors or inactive objects from being released.

## Use When

- The user says "release", "release transport", "release CTS", "push to QAS", or "transport release"
- A development cycle has closed and its objects have to travel to the next system (QAS/PRD)
- The user wants a transport validated ahead of the release
- The user wants to see what a transport holds before it is released

## Do Not Use When

- A new transport is what the user wants — reach for the [create-object](create-object.md) procedure (transport assignment lives there) or call `CreateTransport` directly
- The user wants an import performed (imports happen on the target system, by Basis)
- The task has nothing to do with transports

## Track A Policy Alignment (attended-only) — P4

Releasing a transport is **P4** and sits next to the irreversible. The Policy applies:

- **Direct-P4 has no entry.** This path is **Guided-P4**, and it never runs unattended
  (`unattended` is sealed — D-025 §7).
- **Readiness and release are two separate things.** Steps 1–3 (list · select · validate)
  together with the inventory establish **READY_FOR_RELEASE**. They release nothing.
- **The release itself takes explicit per-object human approval.** Before any
  `ReleaseTransport` call, put the exact task number AND its parent request number in
  front of the operator and collect an affirmative for each. An earlier one-off
  "release it" does NOT authorize the release call that follows.
- **`supported: false` means BLOCKED**, not a soft skip — halt and route the work to
  manual SE09 / SE10 / STMS.
- **Importing is Basis / STMS only** — this procedure never imports into QAS/PRD.

Picking a transport settles *which* transport it is; it grants nothing toward the
release. The release call carries its own second approval, explicit, per task and per parent.

## Workflow Steps

### Step 1 — List Transports (auto)

- Call `ListTransports` for the open modifiable transports
- Show a table: Transport No | Description | Owner | Object Count | Last Changed
- Flag the transports the current user owns

### Step 2 — Select Transport (confirmation gate)

- Lay out the list and ask: "Which transport do you want to release? (Enter transport number)"
- The user confirms the transport number
- Call `GetTransport` and show the transport in full, object list included

### Step 3 — Pre-Release Validation (attended, after selection)

- **Syntax check**: Take every ABAP source object the transport carries (class / program / interface / include / function module) and verify it with `CheckSyntax` — an ADT check that runs server-side against the staged version (a function module additionally needs `function_group_name`, resolved either from the `R3TR FUGR` entry in the transport's object list or from `SearchObject` on the FM name) — and abort on any syntax error. Objects that are not source (DDIC and the like) fall to the inactive-objects check below
- **Inactive objects check**: Call `GetInactiveObjects` — abort while anything in the transport is still inactive
- **Object completeness**: Confirm that every referenced object (the classes and interfaces being used) either rides in this transport or already sits in the target system
- Show the validation report: PASS / FAIL for each check

### Step 4 — Release (attended, only if Step 3 all PASS — explicit per-task + parent approval)

- If any validation failed: show the errors and stop — do NOT release.
- Ahead of any `ReleaseTransport` call, hand the operator the **exact task number(s)**
  and the **parent request number**, and take an explicit affirmative on each. The
  earlier transport-selection confirmation is NOT this approval. Keywords that count:
  `승인` / `approve` / `approved` / `release` / `confirmed`; anything ambiguous ("go",
  "ok", "빨리", silence) is NOT approval.
- Once approved: call `ReleaseTransport` — the open task(s) go first, the parent
  request after (SAP will not take the request until its tasks are released).
  Re-confirm the parent request number in the moment before it is released.
- If the response comes back `supported: false` (the ADT release action is
  unavailable on this system): that is **BLOCKED** — stop and direct the user to a
  manual release through SE09 / SE10 or STMS. Do not read it as a skip.
- Report what the release produced: transport number, the release status SAP returned, timestamp.
- The QAS/PRD import itself lies outside this procedure — Basis / STMS only (see Step 5).

### Step 5 — Import Confirmation

- Show the post-release summary:
  - The transport number and its description
  - The released-at timestamp
  - The object count
  - The target system(s) on the transport route
- Remind the user: "Transport released. Import on target system must be triggered by Basis or via STMS."
- Optionally show the next steps for the target system's import queue

## Error Handling

- Syntax errors found: list each object alongside its error message; do not release; point at a fix through direct MCP `Update*` calls or another run of the `create-program` procedure
- Inactive objects found: list each inactive object; do not release; suggest activating them
- Transport already released: report the status and skip the release step
- Authorization error during release: report that S_TRANSPRT authorization is what is missing

## Backend Tools Used

- `ListTransports` — read the open transports
- `GetTransport` — transport detail and its object list
- `CheckSyntax` — per-source-object syntax validation, server-side
- `ReleaseTransport` — carry out the CTS release (tasks first, request after)
- `GetInactiveObjects` — look for inactive objects
