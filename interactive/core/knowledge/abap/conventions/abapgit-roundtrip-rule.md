# abapGit Round-Trip Rule — Line Endings, Mirror Completeness, Pull Semantics

**Scope.** Any workflow that serializes ABAP objects into a Git working tree and moves them through abapGit — ZIP export/import, an offline repo mirror, or bulk multi-FM repair taken through abapGit instead of serial `Update*` writes.

## Line Endings — LF only

What abapGit serializes is LF (UTF-8 BOM + LF). Never ZIP a working tree straight off a `core.autocrlf=true` machine — every `.abap` line picks up a trailing CR and activation fails with "period missing", the CR having landed where ABAP expects the statement terminator. The misdiagnosis this invites is severe: `.xml` files come back parser-normalized and stay asymptomatic, so the symptom reads as "structures work but FMs are broken" when the real cause is CRs across every source file.

Fix — both halves are required:

- Pin `* text eol=lf` in `.gitattributes` so the working tree stays LF.
- Once the ZIP is built, verify that every `.abap` entry in the archive holds **zero CRLF bytes** — pinning `.gitattributes` does not by itself prove the bytes that actually landed in the ZIP are clean.

## Offline ZIP Is the Entire Remote State

Offline abapGit reads the imported ZIP as the **complete remote repository state**, so every package object the ZIP leaves out turns up in the pull list as a delete candidate. A "changes-only" ZIP therefore fills the pull list with deletions that are nothing but omissions, and clearing them by hand each time (or by unticking "Remove obsolete objects") keeps the accident one click away. Always pack the **whole package** together with the changes — with a complete ZIP the delete list is structurally empty and the mistake becomes impossible. (Field-verified in real project work, 2026-07: full-package ZIP → delete candidates dropped from a long list to 0 with no SAP-side change.)

## Function Groups — Pull Every Member, and Know What a Pull Leaves Behind

Never pull a partial function-group mirror; always pull a complete FUGR mirror carrying every member. This is the sharpest instance of the whole-state principle above, and a function-group pull cuts both ways:

- **When the pull rebuilds the group, whatever the ZIP lacks is gone.** A group the pull offers as *Delete and recreate local object* (§ *The Pull Popup* below) is deleted as a whole and rebuilt from the ZIP, so a member missing from the ZIP is a member lost.
- **When it does not, function modules the ZIP no longer carries stay behind.** An ordinary pull writes the members the ZIP carries and removes none of the ones it lacks. A module deleted in the source system therefore survives on the target — and where it refers to something deleted along with it, the group stops compiling there. The case met in the field was a maintenance view deleted in the source system: its generated `VIEWFRAME_<view>` / `VIEWPROC_<view>` modules stay in the target's group and fail on the `<view>_EXTRACT` declaration that is gone. Remove the leftover on the target — for a view, delete the view together with its maintenance dialog — and pull again. (Field-verified in real project work, 2026-09: the pull went through once the leftover view was deleted.)

## The Pull Popup — What Stays Checked

**`Delete and recreate local object` on an object the ZIP carries stays checked.** The popup can list an object that is fully present in the ZIP not as an update or an overwrite but as *Delete and recreate* — abapGit decides that when, inside one object, a file the remote no longer has (one the previous pull still had) is mixed with other changes, and it then deletes the whole object and rebuilds it from the ZIP. The label reads like a deletion and invites unchecking; unchecked, the object's own includes and screens are not written and everything that depends on them fails to activate. Leave it checked. One cost to say to the user beforehand: per abapGit's source, rebuilding a program deletes its variants as well (read from the source, not observed). What gets unchecked is only *Delete local object* on an object the ZIP does **not** carry — and with a whole-package ZIP there should be none. (Field-verified in real project work, 2026-10: a function group and two programs offered that way, applied cleanly once left checked; the mechanism read from abapGit's source.)

## Screens Missing From the XML Are Deleted on the Target

When abapGit writes a program or a function group, it removes every screen of that object on the target that the XML does not list. A ZIP whose screen set is not current therefore deletes screens — the typical way to get one is an export taken while the source system was briefly missing screens. One more reason every cycle starts from a fresh export, and the first comparison to make when screens vanish after a pull: the ZIP's screen list against the target's. (Read from abapGit's source; the probable cause of screens lost on a target system in real project work, 2026-09.)

## Overwrite-All on Pull Is Normal (after direct ADT edits)

Once the server has been edited directly through ADT tools, expect the Pull confirmation to list **every** object as Overwrite — every object now differs from the last state abapGit knew. Against a full same-source mirror ZIP that is harmless: the same source is being re-applied, not lost.

## Skip SUSH Delete Proposals

Skip any SUSH (start-authorization) delete proposal that Pull offers. SUSH entries are auto-generated start-authorization defaults for RFC-enabled FMs and are managed outside the repo — accepting the delete strips out system-managed data the mirror never owned.

## Reading a Failed Pull — the abapGit Log Comes First

**The red lines in abapGit's own log are the first evidence; the activation error list is the consequence.** A pull that cannot write one object still writes the others, so the activation that follows can fail by the dozen in objects nobody changed. Two causes that look like something else:

- **A generated include under an editor lock is skipped while its siblings are written.** The includes the maintenance-view generator produces (`L<group>T00`, `F00`, `I00`, the `U..` includes) can carry an editor lock set by the generator. abapGit then skips that one include — the log line names it with `EU522` (changes to it forbidden by the lock holder) and suggests deleting the function group and pulling again — and writes the rest, so the group compiles old declarations against new code and the activation list fills with errors that all trace back to that one line. The group is not the problem; the lock is, and it has to come off on the target: regenerating the maintenance dialog in SE54 rewrites the include regardless (the generator is not stopped by its own lock), or whoever owns that system removes the editor lock — then pull again. (Field-verified in real project work, 2026-09: 51 activation errors, one skipped include, a clean pull once the lock was gone.)
- **A refusal naming a *repair* request is a request-type conflict.** Where an object's original system (`TADIR-SRCSYSTEM`) is not the target, any change to it there is a repair, and repairs and ordinary changes cannot share one request — so abapGit, which puts the whole pull into one, is refused with `Import of object <name> failed` behind a line naming a repair request. It is not missing authorization and not an object that cannot be written; resolve it on the transport side of the target (in the field case the pull went through once the lock held by that repair request was released). (Field-verified in real project work, 2026-09.)

## Diffs and Warnings That Are Harmless

- **`.ddls.baseinfo` differs on every pull.** It is a derived file the system computes from its own DDIC and is never written into SAP, so where the two systems run different abapGit releases it stays in the diff however often you pull. Judge whether CDS source arrived from the `.asddls` (and `.abap`) files, never from `.baseinfo`. (Field-verified in real project work, 2026-09: the target's older abapGit simply wrote fewer keys.)
- **`Object type SVIM not supported`** — maintenance-view dialogs are not abapGit objects; the function group that holds their generated code is, which is why the two sections above matter.

## FM Signature Serialization Differs From ADT

abapGit writes FM signatures in the classic form (`*"` interface comment block + `TABLES ... STRUCTURE`), whereas the ADT write path takes modern inline signatures only — a verbatim transfer breaks in **either** direction. See [`function-module-rule.md`](function-module-rule.md) § FM Signature Representation Is Direction-Specific.

## Structure Serialization Fields

When hand-checking or hand-authoring a serialized structure:

- Fields typed by a data element serialize as `ROLLNAME` + `COMPTYPE E`.
- Fields on built-in types serialize as `DATATYPE` / `LENG` / `DECIMALS`.
- `CURR` fields need `REFTABLE` / `REFFIELD` on top of that for the currency reference — leaving it out yields an incomplete/invalid field.

## Caveat — Re-Verify Per Server

These serialization details belong to the abapGit build installed on the target server. Before the first round-trip on a new server, Export one known object through abapGit and re-confirm every rule above against what that server actually produces. Do not treat them as invariant until you have checked.
