# 🇦🇺 Australia

## Formats
- **Date**: `DD/MM/YYYY`
- **Number / decimal**: `.` for the decimal, `,` for thousands (e.g., `1,234,567.89`)
- **Currency**: AUD ($), 2 decimals
- **Phone**: `+61 X XXXX XXXX`
- **Postal code**: 4 digits
- **Timezone**: AEST/AEDT (UTC+10/+11), state-dependent — QLD/NT/WA skip DST

## Language & Locale
- Language key in SAP: `E` (EN)
- Locale typically `en_AU.UTF-8`

## Tax System — GST
- GST: standard 10%, GST-free 0% (basic food, health, education), input-taxed (financial)
- **ABN** (Australian Business Number): 11 digits; every invoice > $82.50 must carry it
- **ACN** (Australian Company Number): 9 digits, forming a subset of ABN
- **Simplified GST** exists for non-resident businesses

## e-Invoicing / Fiscal Reporting
- **Peppol PINT A-NZ** is the e-invoicing standard; every federal agency has supported it since 2022, and B2B adoption keeps growing
- **Single Touch Payroll (STP) Phase 2** — wages/tax/super reported to the ATO in real time on each pay run (mandatory)
- **BAS (Business Activity Statement)** — the quarterly or monthly return for GST + PAYG withholding + PAYG instalments
- **TFN** (Tax File Number) — individual-level and highly sensitive PII

## Banking / Payments
- Domestic: **BSB (6 digits) + Account number**
- Instant: **PayID** / **NPP (New Payments Platform)**
- No IBAN — international runs on SWIFT
- Bulk payments use the **Direct Entry** file format (ABA)
- B2C recurring commonly uses **Direct Debit**

## Master Data Peculiarities
- ABN validation — a mod-89 check
- GST-registered or not, with the threshold at $75,000 turnover
- State matters for payroll tax, which is state-based (5.45% NSW, 4.85% VIC, etc.)

## Statutory Reporting
- **BAS**: to the ATO monthly or quarterly
- **IAS (Instalment Activity Statement)** — for some
- **Taxable Payments Annual Report (TPAR)** — scoped to certain industries
- **Superannuation Guarantee**: 11.5%, rising to 12% 2025-07
- **STP Phase 2**: every pay run
- **Payroll Tax**: monthly, at state level

## SAP Country Version
- **CC AU** — contains:
  - GST tax procedure and BAS extract
  - STP Phase 2 integration, via SAP ECP / 3rd-party payroll
  - ABA payment file format
  - HCM-AU payroll carrying STP and superannuation SuperStream

## Common Customizations
- ABN validation plus Australian Business Register lookup (ABR API)
- Generating Peppol A-NZ invoices
- SuperStream data for superannuation contributions
- Per-state determination of payroll tax
- Encryption / masking of TFN

## Pitfalls / Anti-patterns
- ABN missing from an invoice > $82.50 → the buyer must withhold 47% (no-ABN withholding)
- Misconfigured STP Phase 2 → ATO penalties, and every pay run reports
- Overlooking state payroll-tax thresholds / grouping rules
- BAS diverging from GL — reconcile GST clearing monthly
- Storing TFN in plain text → Privacy Act breach
