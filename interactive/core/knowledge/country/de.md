# 🇩🇪 Germany

## Formats
- **Date**: `DD.MM.YYYY`, e.g. `15.04.2026`
- **Number / decimal**: `,` is the decimal separator and `.` groups thousands, giving `1.234.567,89` — the **opposite of US** convention
- **Currency**: EUR (€) — carried to 2 decimals
- **Phone**: `+49 (0) XXX-XXXXXXX` (length varies by city)
- **Postal code**: PLZ, 5 digits
- **Timezone**: CET (UTC+1), with DST observed

## Language & Locale
- SAP language key: `D` (DE)
- UTF-8 encoding, so umlauts (ä/ö/ü/ß) survive intact
- Locale typically written `de_DE.UTF-8`

## Tax System — USt (Umsatzsteuer / VAT)
- 19% standard rate, 7% reduced (food, books, some services)
- **USt-IdNr. (VAT ID)**: `DE` plus 9 digits — check it against EU VIES for intra-EU B2B
- Kleinunternehmer (small business, §19 UStG) — charges no VAT, and deducts no input VAT
- For intra-EU, reverse charge applies alongside the EC Sales List (Zusammenfassende Meldung)

## e-Invoicing / Fiscal Reporting
- **E-Rechnung** for B2G (public sector) since 2020 — the XRechnung or ZUGFeRD 2+ XML formats are mandatory
- **B2B e-invoicing phase-in 2025→2028**: the ability to **receive** structured e-invoices is required of businesses from 2025-01-01, and from 2028 **issue** is mandatory for all B2B
- **ELSTER** — electronic tax filing with the Finanzamt
- **DATEV** — dominant as the tax-advisor / accounting exchange format; many SMBs export to DATEV

## Banking / Payments
- **SEPA** (Credit Transfer SCT, Direct Debit SDD) — EUR, EU-wide ISO 20022 XML (pain.001 / pain.008)
- **IBAN**: `DE` plus 20 digits (2 check + BLZ 8 + account 10)
- **BIC/SWIFT**: 8 or 11 characters
- **BLZ** (Bankleitzahl), 8 digits — legacy, yet still present in data

## Master Data Peculiarities
- **Handelsregister** number (HRB/HRA + court) — the company register entry
- **Steuernummer** — the domestic tax number, as distinct from USt-IdNr.
- Address: Straße Hausnummer / PLZ Ort / Land
- Legal forms: GmbH, AG, KG, OHG, UG, e.K. — the suffix matters for contracts

## Statutory Reporting
- **USt-Voranmeldung**: monthly/quarterly pre-return through ELSTER, due by the 10th of the following month
- **USt-Jahreserklärung**: the annual VAT return
- **ZM (EC Sales List)**: monthly/quarterly, for intra-EU supplies
- **INTRASTAT**: monthly, for physical intra-EU trade thresholds
- **Corporate tax (KSt)**: annual
- **Payroll**: monthly to the Finanzamt plus the statutory insurance funds (Krankenkasse, BG, Rentenversicherung)

## SAP Country Version
- **CC DE** — covers:
  - the USt tax procedure (TAXD)
  - VAT filing reports that satisfy ELSTER
  - DATEV export (RFBELA00 / SD_DATEV / PwC tools)
  - outbound E-Rechnung (XRechnung / ZUGFeRD) — through SAP Document & Reporting Compliance (DRC) or 3rd-party
  - HCM-DE payroll, which is complex: SV-Meldung, Lohnsteueranmeldung

## Common Customizations
- DATEV export (accounts + transactions + documents)
- ZUGFeRD / XRechnung hybrid PDF-XML invoice generation
- SEPA XML generation (national variants DE, AT, CH, …)
- GoBD-compliant archiving (Grundsätze zu Buchführung und Daten) — immutable storage with search
- Kreditorenworkflow (invoice approval) — German practice leans hard on the 4-eye principle

## Pitfalls / Anti-patterns
- US-style number formatting (`1,234.56`) in German reports — the recipient reads 1234.56 instead of 1.234,56
- Reverse charge not handled on intra-EU B2B → tax incorrectly posted
- An e-invoice that fails XRechnung/ZUGFeRD conformance → B2G rejection
- GoBD violations: accounting PDFs that stay editable, a missing timestamp, gaps in document numbering
- Old BLZ+account carried on recent masters instead of IBAN (SEPA requires IBAN)
- Kleinunternehmer rules mis-applied to VAT-liable transactions
