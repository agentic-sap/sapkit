# 🇸🇬 Singapore

## Formats
- **Date**: `DD/MM/YYYY` for business, `YYYY-MM-DD` for IT
- **Number / decimal**: `.` for the decimal, `,` for thousands (like US)
- **Currency**: SGD (S$), 2 decimals
- **Phone**: `+65 XXXX XXXX`
- **Postal code**: 6 digits
- **Timezone**: SGT (UTC+8) — DST not observed

## Language & Locale
- Language key in SAP: `E` (EN) as primary, with CN/MY/TA also official
- Locale typically `en_SG.UTF-8`

## Tax System — GST
- GST: **9%** since 2024-01-01 — it stood at 8% in 2023 and 7% before 2023
- Zero-rated covers exports; exempt covers financial services, residential property, digital payment tokens
- **GST registration threshold**: turnover of S$1M
- **UEN** (Unique Entity Number) — identifies the business, typically 9-10 chars

## e-Invoicing / Fiscal Reporting
- **InvoiceNow** — the e-invoice network built on Peppol, Singapore being the Peppol Authority
- Mandatory for newly incorporated GST-registered businesses (2025 rollout), with the mandate broadening 2026
- IRAS — the tax authority
- **FATCA / CRS** — reporting that covers financial accounts
- Company filings: **Bizfile / ACRA**

## Banking / Payments
- Domestic instant transfer: **FAST**
- **GIRO** handles batch direct-debit for bills / salary
- **PayNow** is instant, via mobile/UEN
- High-value real-time gross settlement: **MEPS**
- International goes over SWIFT
- No IBAN — bank code + branch + account instead

## Master Data Peculiarities
- Every business record carries a UEN
- NRIC / FIN — the individual ID (NRIC for citizens/PRs, FIN for foreigners) — **sensitive PII, regulated under PDPA**
- Address: Block/Street/Level/Unit/Postcode Singapore

## Statutory Reporting
- **GST F5**: quarterly, or monthly if big
- **Corporate Tax (Form C/C-S)**: annual
- **CPF** (Central Provident Fund): contributions submitted monthly
- **IR8A / IR21** (employee income / leaving): annual / event
- **FATCA/CRS**: annual

## SAP Country Version
- **CC SG** — a modest localization; SG is typically built on MY/ASEAN templates:
  - GST tax procedure covering standard-rated, zero-rated, exempt
  - Extract for the IRAS audit file (IAF / GAF)
  - HCM-SG with CPF, IR8A, IR21
- Peppol InvoiceNow goes through SAP DRC or a 3rd-party (Storecove, Pagero)

## Common Customizations
- Validating / looking up UEN against ACRA
- Generating PayNow corporate QR (receivables)
- Generating GIRO files (MAS GIRO formats)
- Extracting IAF/GAF (IRAS Audit File / GST Audit File)
- Masking / encrypting NRIC

## Pitfalls / Anti-patterns
- Leaving pre-2024 8% or pre-2023 7% GST codes in use after the rate change
- NRIC stored without a PDPA basis or masking
- Overlooking CPF ceilings / percentage tiers by age
- IR8A submission for employees left undone (annual by March)
- No bilingual invoice where the buyer requires one
