# 🇺🇸 United States

## Formats
- **Date**: `MM/DD/YYYY` (general) — a source of confusion against EU; keep `YYYY-MM-DD` for internal use
- **Number / decimal**: decimal `.` / thousands `,` (e.g., `1,234,567.89`)
- **Currency**: USD ($) — 2 decimals
- **Phone**: `(XXX) XXX-XXXX` or `+1-XXX-XXX-XXXX`
- **Postal code**: ZIP 5 digits or ZIP+4 (`12345-6789`)
- **Timezone**: multiple (PT/MT/CT/ET + Alaska/Hawaii), and most of them observe DST

## Language & Locale
- SAP language key: `E` (EN)
- ASCII usually suffices, yet UTF-8 is preferred
- Typical locale: `en_US.UTF-8`

## Tax System — Sales & Use Tax (NO VAT)
- **No federal VAT**. **Sales Tax** is levied by each state and by many localities on top — the combined rate can exceed 10%
- Layering county and city brings the count to ~12,000+ tax jurisdictions — tax determination is the hard part
- **Nexus** rules (2018 Wayfair decision): economic nexus creates a duty to collect tax beyond physical presence
- A resale exemption certificate is required to keep sales tax off a B2B sale
- Use Tax: falls on the buyer where the seller did not collect

## e-Invoicing / Fiscal Reporting
- **No mandatory e-invoicing** at federal level. B2B invoicing is left unregulated
- **1099 series** — IRS information returns filed annually (1099-MISC, 1099-NEC for contractors, 1099-INT, etc.)
- **W-2 / W-9** — payroll and vendor tax-ID collection
- **Sarbanes-Oxley (SOX)** for public companies → audit trail, segregation of duties

## Banking / Payments
- **ACH (Automated Clearing House)** — domestic bulk (1–2 day settlement)
- **Wire** (Fedwire / CHIPS) — same-day
- **Paper checks** remain common in B2B (!)
- Account ID = **Routing number (9) + Account number**; no IBAN
- Credit card and virtual card use in B2B is growing

## Master Data Peculiarities
- **Tax ID (company)**: **EIN** (Employer Identification Number) `XX-XXXXXXX`
- **Tax ID (individual)**: SSN `XXX-XX-XXXX` — **highly sensitive PII**
- **Individual Taxpayer ID**: ITIN for non-SSN holders
- Address: street / city / state (2-letter) / ZIP; "Suite/Apt" separate line
- A state-level ID (state sales tax registration) sits separately from the EIN

## Statutory Reporting
- **Federal**: IRS corporate (1120 / 1120-S), 1099 annual, quarterly 941 (payroll)
- **State**: varies — sales tax return monthly/quarterly, state income tax
- **Local**: city / county taxes, a subset of which carry separate filings
- Payroll: federal withholding, FICA, FUTA, state withholding, SUTA, local

## SAP Country Version
- **CC US** — includes:
  - US tax procedure `TAXUS` (basic) / `TAXUSJ` / `TAXUSX` (external for multi-jurisdiction)
  - External tax engines integration: **Vertex**, **Avalara**, **Sovos**, **Thomson Reuters OneSource**
  - 1099 reporting (RFKQSU20, `SAP_US_1099`)
  - HCM-US payroll (schema is very large; BSI tax factory was deprecated 2024 → Vertex Payroll Tax)

## Common Customizations
- **External tax engine** connector (Vertex/Avalara) via SAP TaxDoc or direct RFC/SOAP/REST
- 1099 extract (vendor → 1099-NEC, bond → 1099-INT, etc.)
- ACH / wire payment file generation (NACHA format)
- Check printing (MICR line, signature overlay)
- Multi-state sales tax determination enhancements
- SOX access control paired with segregation-of-duties

## Pitfalls / Anti-patterns
- Leaning on SAP built-in jurisdiction determination for > 12,000 rates instead of an external engine → tax compliance nightmare
- One tax code per invoice while multiple jurisdictions apply on the same shipment
- Mixing up EIN and SSN; sending SSN over unencrypted channels
- MM/DD vs DD/MM date confusion across documents
- Leaving Nexus unhandled — collecting/remitting sales tax in states where not registered (or failing to where required)
- Treating sales tax as VAT — sales tax is **not deductible** and flows to expense
