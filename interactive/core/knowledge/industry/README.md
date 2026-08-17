# Industry Reference

Collected in this folder are the per-industry business-characteristic references that SAP consultant agents MUST consult whenever they perform **configuration analysis, process design, Fit-Gap analysis, master data modeling, or requirement interpretation**.

## When to Use

The project's industry file must be loaded by every `sap-*-consultant` agent before it responds to any of these:

- Customizing analysis in SPRO — org structure, pricing, output, account determination, and so on
- Design or review of a business process
- Fit-Gap analysis
- Modeling of master data
- Requirements ambiguous enough to need domain judgement
- Decisions on whether an SAP Industry Solution (IS-*) applies

## How to Identify Industry

Resolve in this order:
1. The `industry` field of `.sapkit/config.json` — the canonical plugin-side source
2. `SAP_INDUSTRY` in `.sapkit/sap.env` — the MCP-server mirror, which must match config.json
3. With both absent, ask the user and send them to `the profile settings (edit .sapkit/config.json — see core/procedures/troubleshooting.md)` so the answer is persisted
4. Where the value is `other`, bypass the industry reference and fall back on standard, industry-agnostic recommendations

**Change industry**: `the profile settings (edit .sapkit/config.json — see core/procedures/troubleshooting.md)` → type `industry` (both files are updated atomically).
**Initial selection**: step 2 of `the profile setup (core/procedures/troubleshooting.md)` wizard.

## Industry Files

| File | Industry | Primary SAP Industry Solution |
|---|---|---|
| [retail.md](retail.md) | Retail | IS-Retail, CAR, S/4HANA for Retail |
| [fashion.md](fashion.md) | Fashion / Apparel | AFS, FMS, S/4HANA for Fashion |
| [cosmetics.md](cosmetics.md) | Cosmetics | IS-CP, Batch Mgmt |
| [tire.md](tire.md) | Tire | Discrete + Repetitive + Process (mixed) |
| [automotive.md](automotive.md) | Automotive | IS-Auto, JIT/JIS, Scheduling Agreement |
| [pharmaceutical.md](pharmaceutical.md) | Pharmaceutical | IS-Pharma, GMP, Serialization |
| [food-beverage.md](food-beverage.md) | Food & Beverage | IS-CP, Catch Weight, Batch, Shelf Life |
| [chemical.md](chemical.md) | Chemical | IS-Chem, EHS, Dangerous Goods, Process Mfg |
| [electronics.md](electronics.md) | Electronics / High-Tech | High-Tech, CTO, Serial Number |
| [construction.md](construction.md) | Construction / E&C | IS-EC&O, PS, Progress Billing |
| [steel.md](steel.md) | Steel / Metals | IS-Mill Products, Catch Weight, Characteristic |
| [utilities.md](utilities.md) | Utilities | IS-U, FI-CA, Device Mgmt |
| [banking.md](banking.md) | Banking / Financial Services | IS-Banking, FS-CD |
| [public-sector.md](public-sector.md) | Public Sector | IS-PS, Funds Mgmt, Grants Mgmt |

## Usage Pattern

```markdown
1. Receive request
2. Identify industry (config.json → sap.env → ask user)
3. Load `industry/{industry}.md`
4. Apply "Key Processes", "Master Data", "Common Customizations" sections to the configuration analysis
5. Explicitly warn when a proposed standard configuration conflicts with an industry characteristic
```

## File Structure

Every industry MD file is laid out in these sections:
- **Business Characteristics** — what sets the industry apart
- **Key Processes** — the business processes at its core
- **Master Data Specifics** — what is unusual about its master data
- **Module Implications** — what follows for SD / MM / PP / FI / CO / WM / etc.
- **Common Customizations** — the enhancements it routinely calls for
- **SAP Industry Solutions** — the SAP IS offerings that apply
- **Pitfalls / Anti-patterns** — the patterns to steer clear of
