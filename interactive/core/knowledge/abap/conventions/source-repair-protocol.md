# Source Repair Protocol — Editing Existing Server Objects

**Scope.** Every edit that lands on an object already present on the server — that is, any `Update*` against an object the current session did not create (function module, class, program, include, DDIC). "Repair" in this document means mutating server state that is already there, not authoring a fresh object.

## Read Before Edit — Never Re-Author From the Repo

The repair sequence runs: pull the source down from the server → lay a minimal edit on top of what came back → write → **re-read to confirm the previous edit survived** → mirror into the repo without delay. Never rebuild the object out of the repo copy and push that over server state — the repo is allowed to trail the server (somebody may have edited straight through ADT), and rebuilding silently overwrites those edits.

## Inactive-Version Trap

Where an object might be carrying an unactivated edit, a read at the default `version=active` hands back the **pre-edit** source, and writing on top of that silently destroys the edit that was pending. Nothing catches the loss — the update reports success, the syntax is clean, and the mirror, already committed, shows no diff. So before re-editing an object that could have a change in flight, read `version=inactive` first (or run `GetInactiveObjects` ahead of the read).

That applies to every full-source write, because the source you send is the source you read. `UpdateSourceByPatch` is the one exception, and only on a current engine: since the D-147 engine repair (server engine 1.4.0 / plugin 0.10.3) it reads the **inactive** version itself and falls back to the active one, saying which it used in `source_version_read` (offline-verified only — confirm on first live use; older bundles always read the active version and lost pending edits exactly as described above). The exception brings its own trap in the opposite direction: an inactive version may hold **somebody else's abandoned draft**, and the tool cannot tell whose it is, so patching with `activate: true` activates that draft along with your change. Where `source_version_read` says `inactive` on an object you did not stage yourself, read the source back before activating.

## "Active Source Returned" Is Not Activation Evidence

A read tool handing back "active" source is not proof the object was ever activated — an FM that was never activated, and one that does not compile, both still return "active" source. What actually counts as evidence that an object works =

- a group syntax check that comes back **0 / 0**, AND
- a source comparison after activation (what you wrote is what is now active), AND
- an end-to-end **live call**.

## Sibling-Defect False Failure

The postcheck an FM write tool runs covers the whole function group, so a defect that was already sitting in a **sibling** FM can come back as a failure report on *your* write while the write in fact persisted. Re-read the FM before concluding it was lost — see [`function-module-rule.md`](function-module-rule.md) § Function Group Is One Compile and Activation Unit. When the repair spans many FMs at once, take the abapGit path (see [`abapgit-roundtrip-rule.md`](abapgit-roundtrip-rule.md)) rather than writing FM by FM in sequence — that route skips the repeated whole-group postchecks, and with them the false-failure churn they cause.

## Identity-Write Isolation

Where a write tool is under suspicion of false success (or false failure), run an **identity write** — send the exact same source back unchanged — to tell a tool defect apart from an edit defect. If the identity write behaves the way the real edit did, the variable is the tool, not your change.
