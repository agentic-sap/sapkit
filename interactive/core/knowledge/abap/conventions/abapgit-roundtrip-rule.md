# abapGit Round-Trip Rule — Line Endings, Mirror Completeness, Pull Semantics

**Scope.** Any workflow that serializes ABAP objects into a Git working tree and moves them through abapGit — ZIP export/import, an offline repo mirror, or bulk multi-FM repair taken through abapGit instead of serial `Update*` writes.

## Line Endings — LF only

What abapGit serializes is LF (UTF-8 BOM + LF). Never ZIP a working tree straight off a `core.autocrlf=true` machine — every `.abap` line picks up a trailing CR and activation fails with "period missing", the CR having landed where ABAP expects the statement terminator. The misdiagnosis this invites is severe: `.xml` files come back parser-normalized and stay asymptomatic, so the symptom reads as "structures work but FMs are broken" when the real cause is CRs across every source file.

Fix — both halves are required:

- Pin `* text eol=lf` in `.gitattributes` so the working tree stays LF.
- Once the ZIP is built, verify that every `.abap` entry in the archive holds **zero CRLF bytes** — pinning `.gitattributes` does not by itself prove the bytes that actually landed in the ZIP are clean.

## Offline ZIP Is the Entire Remote State

Offline abapGit reads the imported ZIP as the **complete remote repository state**, so every package object the ZIP leaves out turns up in the pull list as a delete candidate. A "changes-only" ZIP therefore fills the pull list with deletions that are nothing but omissions, and clearing them by hand each time (or by unticking "Remove obsolete objects") keeps the accident one click away. Always pack the **whole package** together with the changes — with a complete ZIP the delete list is structurally empty and the mistake becomes impossible. (Field-verified in real project work, 2026-07: full-package ZIP → delete candidates dropped from a long list to 0 with no SAP-side change.)

## FUGR Pull Is Delete-and-Recreate

A function-group pull is delete-and-recreate rather than merge, which is what makes **mirror completeness critical**. Pull a partial ZIP and the objects missing from it are silently deleted. Never pull a partial function-group mirror; always pull a complete FUGR mirror carrying every member. This is the sharpest instance of the whole-state principle above.

## Overwrite-All on Pull Is Normal (after direct ADT edits)

Once the server has been edited directly through ADT tools, expect the Pull confirmation to list **every** object as Overwrite — every object now differs from the last state abapGit knew. Against a full same-source mirror ZIP that is harmless: the same source is being re-applied, not lost.

## Skip SUSH Delete Proposals

Skip any SUSH (start-authorization) delete proposal that Pull offers. SUSH entries are auto-generated start-authorization defaults for RFC-enabled FMs and are managed outside the repo — accepting the delete strips out system-managed data the mirror never owned.

## FM Signature Serialization Differs From ADT

abapGit writes FM signatures in the classic form (`*"` interface comment block + `TABLES ... STRUCTURE`), whereas the ADT write path takes modern inline signatures only — a verbatim transfer breaks in **either** direction. See [`function-module-rule.md`](function-module-rule.md) § FM Signature Representation Is Direction-Specific.

## Structure Serialization Fields

When hand-checking or hand-authoring a serialized structure:

- Fields typed by a data element serialize as `ROLLNAME` + `COMPTYPE E`.
- Fields on built-in types serialize as `DATATYPE` / `LENG` / `DECIMALS`.
- `CURR` fields need `REFTABLE` / `REFFIELD` on top of that for the currency reference — leaving it out yields an incomplete/invalid field.

## Caveat — Re-Verify Per Server

These serialization details belong to the abapGit build installed on the target server. Before the first round-trip on a new server, Export one known object through abapGit and re-confirm every rule above against what that server actually produces. Do not treat them as invariant until you have checked.
