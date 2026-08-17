# 🇮🇹 Italy

## Formats
- **Date**: `DD/MM/YYYY`
- **Number / decimal**: decimal `,` / thousands `.` (e.g., `1.234.567,89`)
- **Currency**: EUR (€)
- **Phone**: `+39 XXX XXX XXXX`
- **Postal code**: CAP 5 digits
- **Timezone**: CET/CEST

## Language & Locale
- SAP language key: `I` (IT)
- Typical locale: `it_IT.UTF-8`

## Tax System — IVA
- 22% standard, plus 10%, 5%, and 4% (food essentials)
- **Partita IVA** (VAT ID): `IT` + 11 digits
- **Codice Fiscale**: 16-char alphanumeric (individuals) — it behaves like a tax ID
- **Split Payment (Scissione dei Pagamenti)** — on public-sector B2G transactions the buyer remits VAT straight to the tax authority
- **Esterometro** — cross-border transactions reported quarterly (merged with SDI from 2022)

## e-Invoicing / Fiscal Reporting
- **FatturaPA / SDI (Sistema di Interscambio)** — since 2019, e-invoicing has been **mandatory** across **all** domestic B2B/B2G/B2C (B2B from 2019-01)
- The XML is strictly defined (FatturaPA format)
- Invoices travel through the SDI portal, and one that SDI has not accepted is legally invalid
- Digitization reaches the fiscal receipt / corrispettivi telematici as well
- Each invoice carries the recipient's SDI destinatario code or their certified email (PEC)

## Banking / Payments
- **SEPA** (SCT/SDD)
- **IBAN**: `IT` + 25 chars
- **RIBA (Ricevuta Bancaria)** — the dominant instrument for B2B collection; the bank initiates it on the supplier's behalf
- **RID** (legacy; SDD replaced it)
- MAV / RAV (paper-based)

## Master Data Peculiarities
- A company master often carries Partita IVA and Codice Fiscale together
- **Codice Destinatario** (SDI code) — a 7-char code that routes invoices
- **PEC (Posta Elettronica Certificata)** — companies are required to have it; alternative routing
- Address format: Via / CAP Città (Provincia)

## Statutory Reporting
- **LIPE** — the VAT summary on a quarterly cycle
- **Dichiarazione IVA**: annual
- **Esterometro / Spesometro**: cross-border transactions (these now go through SDI)
- **CU (Certificazione Unica)** — the annual withholding certificate
- **F24** — the unified form for tax payment

## SAP Country Version
- **CC IT** — covers:
  - IVA tax procedure, and the LIPE/annual IVA reports
  - Generation of FatturaPA (SAP Document & Reporting Compliance — DRC)
  - Handling for Split Payment
  - RIBA generation, i.e. the bill of exchange file
  - Withholding tax (ritenuta d'acconto)

## Common Customizations
- FatturaPA XML carrying every custom field (CIG, CUP for public contracts)
- Generation of the RIBA file together with the bank dialog
- PEC integrated for invoice delivery and legal archiving
- Invoice numbering that runs progressively within each fiscal year (strict rules — gap detection)
- Withholding on services (ritenuta d'acconto, typically 20%)

## Pitfalls / Anti-patterns
- Gaps in invoices or numbering out of sequence — a fiscal violation (numero progressivo)
- Codice Destinatario or PEC absent → SDI rejects
- Leaving Split Payment unapplied on B2G → VAT paid to the wrong party
- FatturaPA fields that do not match (address, tax types) → SDI rejection ("errore di controllo")
- Overlooking ritenuta d'acconto on freelancer invoices
