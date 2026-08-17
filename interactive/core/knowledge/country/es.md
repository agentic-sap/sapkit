# 🇪🇸 Spain

## Formats
- **Date**: `DD/MM/YYYY`
- **Number / decimal**: `,` as the decimal separator, `.` for thousands (e.g., `1.234.567,89`)
- **Currency**: EUR (€)
- **Phone**: `+34 XXX XXX XXX`
- **Postal code**: 5 digits
- **Timezone**: CET/CEST (Canarias runs WET/WEST)

## Language & Locale
- SAP language key `S` (ES); regional Catalan, Galician, Basque map to SAP `CA`/`GL`/`EU`, which separate text elements often handle
- Locale typically `es_ES.UTF-8`

## Tax System — IVA
- Rates run 21% standard, 10% reduced, 4% super-reduced; IGIC (Canarias) sits apart at 7%
- Individuals carry a **NIF** (Número de Identificación Fiscal); companies historically carried a **CIF** (both now NIF)
- Format: a letter followed by 8 digits, or 8 digits followed by a letter, with a validated check digit
- Intra-EU: `ES` + NIF for VIES

## e-Invoicing / Fiscal Reporting
- **SII (Suministro Inmediato de Información)** — VAT reporting to AEAT (Tax Agency) in near real time. Mandatory for large taxpayers since 2017; the submission window is **4 business days**
- **TicketBAI** — real-time invoice reporting in the Basque Country (Álava, Bizkaia, Gipuzkoa); phased in from 2022+
- **FACe** / **FACeB2B** — the e-invoicing platform; B2G mandatory, B2B voluntary, with the **Crea y Crece** law phasing mandatory B2B in (from 2026 for large firms)
- **Modelo** forms: 303 (VAT), 390 (annual VAT), 349 (intra-EU), 347 (domestic), 720 (foreign assets)

## Banking / Payments
- **SEPA** (SCT/SDD)
- **IBAN**: `ES` + 22 chars
- **Confirming** (reverse factoring) — very common in Spain; the vendor is paid early through the buyer's bank
- **Pagaré** (promissory note) — legacy B2B
- **Cuaderno 43/34/19** — AEB/CECA bank file formats covering confirming/SEPA/direct debits

## Master Data Peculiarities
- NIF check-digit validation is critical (ERP should reject an invalid one)
- Canarias (IGIC) and the mainland sit in separate legal entities
- Some reporting is affected by the Autonomous Community (Comunidad Autónoma)
- Address: Calle / CP Ciudad (Provincia)

## Statutory Reporting
- **Modelo 303**: VAT, monthly/quarterly
- **Modelo 390**: annual VAT summary
- **Modelo 349**: intra-EU operations
- **Modelo 347**: annual domestic transactions above €3,005.06 per partner
- **SII**: real-time ledgers (invoices, received invoices, investments)
- **Modelo 111/190**: withholding income tax
- **SEPE**: social security, monthly

## SAP Country Version
- **CC ES** — covers:
  - the IVA tax procedure plus Modelo reports (303/347/349/390)
  - **SII integration** through SAP DRC or RFIDESM_SII / certified 3rd-party (Sovos, Pagero)
  - Confirming file formats (Cuaderno 68 / 58 / 43)
  - HCM-ES payroll (TC-1/TC-2, CRA)
  - Canarias IGIC setup

## Common Customizations
- SII real-time submission (DRC or 3rd-party adapter) — the 4-day latency must be handled with queue/retry
- Bank integration for Confirming ("factoring inverso")
- TicketBAI for Basque legal entities (separate flow)
- Withholding on freelancer invoices (retención de IRPF/IRNR)
- Modelo 347 threshold tracking

## Pitfalls / Anti-patterns
- Failing to submit to SII within 4 working days → penalties
- Applying IGIC to a mainland CoCode, or the reverse
- Cuaderno format mismatches (old 19 vs SEPA SDD)
- Leaving "Régimen Especial" codes off invoices (REAGYP, REBU, SII régimen)
- Ignoring TicketBAI for Basque subsidiaries
