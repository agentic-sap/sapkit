# Text Element Rule

**Every user-visible string MUST come from a Text Element** — display literals hardcoded into source are not allowed.

## Scope — Four Text Pool Types (MUST verify ALL that apply)

A text pool in ABAP is made of four separate kinds of row. A single `CreateTextElement` / `UpdateTextElement` call covers only ONE of those kinds, so the executor MUST issue calls for every kind that applies rather than stopping at `I`.

| Type ID | Purpose | Where seen | When required |
|---------|---------|------------|---------------|
| `I` — Text Symbol   | Inline code literals `TEXT-xxx` | ALV coltext, MESSAGE text, titles in code | Always when any `TEXT-xxx` appears in source |
| `S` — Selection Text | Labels of SELECT-OPTIONS / PARAMETERS on selection screen | Selection screen field labels | **Always — once per `SELECT-OPTIONS` / `PARAMETERS` name, including those inside `SELECTION-SCREEN BEGIN OF BLOCK`** |
| `R` — Program Title  | Report title (short description) | SE38 title bar / system list | Always — one row per program |
| `H` — List Heading   | Classic list headings (TOP-OF-PAGE) | Classical list output only | Only when program uses classical WRITE lists — skip for ALV-only |

**Anti-pattern (this bug has been seen)**: the executor writes the `I` and `R` rows and leaves `S` out. At runtime each selection-screen field then shows its technical name (`S_BUDAT`, `P_FILE`) where a human label belongs, and `GetTextElement(text_type='S')` comes back empty. Such a case counts as a MAJOR Phase 6 finding.

## Scope — Surface References

- Type `I` — an ALV column caption: `<fs_fieldcat>-coltext = text-f01.`
- Type `I` — a screen title set in code: `text-t01`
- Type `I` — messages and tooltips: `text-m01`
- Type `S` — the **selection screen label** of every `SELECT-OPTIONS s_budat FOR ...` / `PARAMETERS p_file TYPE ...`; the key is the parameter name (`S_BUDAT`, `P_FILE`)
- Type `R` — the program title (SE38 description)

## Language Strategy (MANDATORY — two passes)

Being language-dependent, a SAP text pool gives the runtime only what matches the user's logon language — and where that row was never written, the text id renders **empty** on screen. Filling a pool in one language alone therefore ships a certain bug, triggered the moment anybody logs on under a different one.

**Rule (two passes, both MANDATORY):**

1. **Primary pass — system logon language.** Write every text element in the primary language as resolved from `.sapkit/config.json` → `systemInfo.language`, falling back to `sap.env` → `SAP_LANGUAGE`. A Korean-speaking team, for instance, resolves to primary = `'K'` and supplies Korean source text — the copy the day-to-day users will see.

2. **Safety-net pass — `'E'` (EN), ALWAYS added.** As soon as the primary pass finishes, write the **same text ids again** under language `'E'`, carrying English translations; romanization serves as a stopgap where no English copy exists. The reason: whoever logs on under `'E'` — an admin, a consultant, an auditor, or someone arriving through a future migration — must see populated text rather than blanks. `'E'` doubles as SAP's conventional base language, which keeps translation fallback from springing surprises.

3. **Additional passes (optional, scope-driven).** Where the project serves more than one user community, repeat the CreateTextElement call for each target language (`'D'`, `'J'`, `'F'`, …) with that language's translated string.

Which pool row gets written is decided by the `language` parameter handed to `CreateTextElement`. Do NOT leave it out — state the value explicitly on each pass, and never lean on the "default", which is session-dependent.

**Enforcement summary (must satisfy ALL):**
- The primary logon language row is present for every text id.
- The `'E'` row is ALSO present for every text id. A missing `'E'` row is a MAJOR review finding even where the primary row was written.

Within the `create-program` skill, the text-element table the planner puts in `plan.md` must carry TWO columns at minimum — primary and `'E'`. Working from it, the executor fires `CreateTextElement` once for each `(text_id, language)` pair, which puts the floor at 2 × N calls.

## Enforcement

- Each text id is registered per program/screen by the `CreateTextElement` MCP, and the caller MUST state `text_type` explicitly (`I` / `S` / `R` / `H`); there is no default.
- Per program, and per language pass (primary + `'E'`), the executor emits:
  - 1× type `R` (program title)
  - N× type `I` (one per `TEXT-xxx` literal in source)
  - **M× type `S` (one per SELECT-OPTIONS/PARAMETERS name)**
  - 0 or P× type `H` (only if classical list output)
- Once written, verify through `ReadTextElementsBulk(program, language)` that `counts.R ≥ 1` AND `counts.I == N` AND `counts.S == M`. A mismatch → fail fast, and re-emit the missing rows before Phase 4 is left behind.
- `sap-code-reviewer` **must fail the review** if:
  - display literals are found hardcoded, OR
  - the primary-language row of any text id is absent, OR
  - the `'E'` safety-net row of any text id is absent, OR
  - **source declares selection-screen `SELECT-OPTIONS` / `PARAMETERS` names while `counts.S` is 0 or falls below the number of those declarations.**
