# Text Element Rule

**All user-visible text MUST use Text Elements** — no hardcoded display literals.

## Scope — Four Text Pool Types (MUST verify ALL that apply)

ABAP text pools split into four distinct row types. `SetTextElements` writes ONE type per call — every applicable type MUST be emitted, not just `I`.

| Type ID | Purpose | Where seen | When required |
|---------|---------|------------|---------------|
| `I` — Text Symbol   | Inline code literals `TEXT-xxx` | ALV coltext, MESSAGE text, titles in code | Always when any `TEXT-xxx` appears in source |
| `S` — Selection Text | Labels of SELECT-OPTIONS / PARAMETERS on selection screen | Selection screen field labels | **Always — once per `SELECT-OPTIONS` / `PARAMETERS` name, including those inside `SELECTION-SCREEN BEGIN OF BLOCK`** |
| `R` — Program Title  | Report title (short description) | SE38 title bar / system list | Always — one row per program |
| `H` — List Heading   | Classic list headings (TOP-OF-PAGE) | Classical list output only | Only when program uses classical WRITE lists — skip for ALV-only |

**Anti-pattern (this bug has been seen)**: `I` + `R` rows are created and `S` is skipped. Runtime result — every selection-screen field displays its technical name (`S_BUDAT`, `P_FILE`) instead of a human label. `GetTextElements` for text type `S` returns empty. This is a MAJOR review finding.

## Scope — Surface References

- ALV column caption: `<fs_fieldcat>-coltext = text-f01.` → type `I`
- Screen title in code: `text-t01` → type `I`
- Messages / tooltips: `text-m01` → type `I`
- **Selection screen label** for every `SELECT-OPTIONS s_budat FOR ...` / `PARAMETERS p_file TYPE ...` → type `S`, key = parameter name (`S_BUDAT`, `P_FILE`)
- Program title (SE38 description) → type `R`

## Language Strategy (MANDATORY — two passes)

SAP text pools are language-dependent. The runtime loads texts in the user's logon language; if that pool row is missing, the screen shows **empty** for that text id. A single-language pool is a guaranteed bug the moment anyone logs on in a different language.

**Rule (two passes, both MANDATORY):**

1. **Primary pass — system logon language.** Create every text element in the resolved primary language (from the system logon language — check `GetSystemInfo` or the SAP connection config, e.g. `SAP_LANGUAGE`). Example: on a Korean-speaking team, primary = `'K'` with Korean source text. This is what the day-to-day users will see.

2. **Safety-net pass — `'E'` (EN), ALWAYS added.** Immediately after the primary pass, create the **same text ids again** in language `'E'` with English translations (or romanization as a stopgap if no English copy exists). Reason: any user with logon language `'E'` — admin, consultant, auditor, or a future migration user — must see populated text, not blanks. `'E'` is also SAP's conventional base language and avoids translation-fallback surprises.

3. **Additional passes (optional, scope-driven).** If the project serves multiple user communities, repeat the `SetTextElements` call per target language (`'D'`, `'J'`, `'F'`, …) with the translated string.

The `language` parameter passed to `SetTextElements` drives which pool row is written. Do NOT omit it — always pass the explicit value per pass; never rely on "default" which is session-dependent.

**Enforcement summary (must satisfy ALL):**
- Every text id exists in the primary logon language row.
- Every text id ALSO exists in `'E'` row. Missing `'E'` row is a MAJOR review finding even when the primary row is present.

When planning a program, the text-element plan must list TWO columns (primary + `'E'`) at minimum. `SetTextElements` is then issued once per `(text_id, language)` pair — 2 × N calls minimum.

## Enforcement

- `SetTextElements` registers each text id per program/screen — the caller MUST pass the text type explicitly (`I` / `S` / `R` / `H`); no default.
- For every program, emit (per language pass, primary + `'E'`):
  - 1× type `R` (program title)
  - N× type `I` (one per `TEXT-xxx` literal in source)
  - **M× type `S` (one per SELECT-OPTIONS/PARAMETERS name)**
  - 0 or P× type `H` (only if classical list output)
- Post-write verify via `GetTextElements(program, language)`: `counts.R ≥ 1` AND `counts.I == N` AND `counts.S == M`. Mismatch → fail fast, re-emit missing rows before completing the write phase.
- Code review **must fail** if:
  - hardcoded display literals are found, OR
  - any text id is missing its primary-language row, OR
  - any text id is missing its `'E'` safety-net row, OR
  - **selection-screen `SELECT-OPTIONS` / `PARAMETERS` names exist in source but `counts.S` is 0 or smaller than the count of those declarations.**
