# 🇬🇧 United Kingdom

## Formats
- **Date**: `DD/MM/YYYY`
- **Number / decimal**: `.` for the decimal, `,` for thousands (as in the US)
- **Currency**: GBP (£), 2 decimals
- **Phone**: `+44 (0) XXXX XXXXXX`
- **Postal code**: alphanumeric `SW1A 1AA` — the format is highly specific per region
- **Timezone**: GMT/BST (UTC+0/+1) — DST is observed

## Language & Locale
- Language key in SAP: `E` (EN)
- Note: user-facing text uses British English spelling (colour, organisation, …)

## Tax System — VAT
- Standard 20%, reduced 5%, plus zero-rated and exempt
- **VAT Number**: `GB` followed by 9 or 12 digits, with some variants
- Post-Brexit (2021): UK VAT separate from EU VAT — UK no longer in EU VAT system
- NI (Northern Ireland) stays in EU goods VAT scheme (`XI` prefix for NI VAT)

## e-Invoicing / Fiscal Reporting
- **Making Tax Digital (MTD)** — mandatory for all VAT-registered since 2022, with returns filed to HMRC via API
- **MTD for ITSA** (Income Tax Self Assessment) — phases in across 2026–2027 for the self-employed
- B2B e-invoicing is not mandatory yet (2026 as of writing), and consultations continue
- **Construction Industry Scheme (CIS)** — withholding applied to subcontractors
- **Plastic Packaging Tax** — quarterly, for businesses in scope

## Banking / Payments
- **IBAN**: `GB` followed by 20 digits
- Domestic: **Sort code** (6 digits) + **Account number** (8 digits)
- **BACS** takes 3 days, **Faster Payments** (FPS) is near real-time, **CHAPS** is same-day high-value
- Direct Debit (DDI) runs under BACS
- **Open Banking** APIs initiate payments

## Master Data Peculiarities
- Registered companies carry a Companies House number (8 digits)
- UTR (Unique Taxpayer Reference), 10 digits
- NI Number, at individual level — sensitive PII
- Address includes County, which may be omitted; delivery hinges on the postcode

## Statutory Reporting
- **VAT return**: quarterly, through the MTD API
- **Corporate Tax (CT600)**: annually
- **PAYE** (payroll): to HMRC in real time (RTI), on or before the pay date
- **P11D**: expenses/benefits, annually
- **Companies House annual return** — the confirmation statement

## SAP Country Version
- **CC GB** — contains:
  - UK VAT procedure and MTD integration (SAP Document & Reporting Compliance — DRC)
  - HMRC-compliant VAT return, via DRC or 3rd-party
  - HCM-GB payroll carrying RTI submission
  - Generation of BACS / FPS payment files
  - CIS withholding

## Common Customizations
- MTD API connector, where DRC is not used
- CIS subcontractor verification, plus deduction statements
- Remittance advice and self-billing arrangements
- Payment initiation over Open Banking
- Dual-VAT handling for NI (Northern Ireland) — GB vs XI

## Pitfalls / Anti-patterns
- Post-Brexit: treating UK as EU → ESL / INTRASTAT wrongly filed; VAT should be UK-only
- Confusing the GB and XI (NI) VAT prefixes on goods transactions
- Submitting the VAT return manually — that is not MTD-compliant
- Hardcoding sort code + account and omitting IBAN for international payments
- Leaving CIS withholding off construction payments
