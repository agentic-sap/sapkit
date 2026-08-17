# Constant Rule

**Any hardcoded value that is not a field catalog value MUST be declared as CONSTANTS** — logic carries no magic literals.

## 1. What must become a constant

Declare each of the following as a constant:

- Status and type codes — `'A'`, `'X'`, `'I'`, `'EQ'`, document categories, status indicators.
- Screen numbers referenced in the code, such as `'0100'` and `'0200'`.
- GUI Status and GUI Title names, such as `'STATUS_0100'`.
- Table and view names used in dynamic access.
- Function module names used in dynamic calls.
- Default values, thresholds, and limits.
- Exit codes and return values compared in IF / CASE.

## 2. Where a literal may still stand

The rule stops at these cases, and the literal is allowed to stay as written:

- Field catalog modification — `<fs_fieldcat>-fieldname = 'MATNR'`, per ALV rules.
- Text Element references such as `text-f01`, which are abstracted already.
- Initial values in type declarations.
- `SY-*` system fields and ABAP language keywords.

## 3. Where the declaration goes

- A constant used across the whole program belongs in the `CONSTANTS` block of `{PROG}t`, the TOP include.
- A constant scoped to a class belongs in `CONSTANTS` under the `PUBLIC` or `PRIVATE SECTION` of the LCL it belongs to.
- Values that belong together are grouped into a constant structure, written `BEGIN OF gc_status, ... END OF gc_status`.

## 4. Enforcement

`sap-code-reviewer` checks this rule with a magic-literal scan and withholds review sign-off where it finds a violation.
