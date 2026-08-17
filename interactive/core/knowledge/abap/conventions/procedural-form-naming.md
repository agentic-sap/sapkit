# Procedural FORM Naming

Under paradigm = Procedural, a FORM that touches ALV / Screen takes a name that **must end with `_{screen_no}`**.

## Examples

- ✅ `MODIFY_FCAT_DATA_GRID1_0100`
- ✅ `BUILD_LAYOUT_0100`
- ✅ `HANDLE_DOUBLE_CLICK_0200`
- ❌ `MODIFY_FCAT_DATA_GRID1` (screen suffix absent)

## Exception

A utility FORM that is screen-independent (e.g. `CONVERT_FCAT_DATA_GRID`) is **not** bound by the suffix requirement.

## Enforcement

Responsibility for enforcing this convention sits with `sap-code-reviewer`, which does so at Phase 6 review.
