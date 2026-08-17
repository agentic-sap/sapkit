# 🇲🇽 Mexico

## Formats
- **Date**: `DD/MM/YYYY` or `YYYY-MM-DD`
- **Number / decimal**: `.` as the decimal separator, `,` for thousands (as in the US)
- **Currency**: MXN ($) — 2 decimals
- **Phone**: `+52 XX XXXX XXXX`
- **Postal code**: 5 digits
- **Timezone**: CST/CDT (varies; DST is observed)

## Language & Locale
- SAP language key `S` (ES — the same key Spain uses; the country is what tells them apart)
- Locale typically `es_MX.UTF-8`

## Tax System
- **IVA**: 16% standard, with 0% for the border region and specific goods
- **IEPS** — excise on fuel, alcohol, tobacco, and sugary drinks
- **ISR** (Impuesto Sobre la Renta) — income tax, where withholding is common
- **RFC** (Registro Federal de Contribuyentes):
  - Legal: 12 chars `XXX######XXX`
  - Individual: 13 chars
- **CURP** — an 18-char unique personal ID (individuals, PII)

## e-Invoicing / Fiscal Reporting — CFDI
- **CFDI (Comprobante Fiscal Digital por Internet)** at version **4.0**, mandatory since 2023
- Invoices, receipts, payroll, and cancellations all take the form of a digital XML that a PAC (Proveedor Autorizado de Certificación) certifies and SAT stamps
- **Complementos**: per-use-case extensions (Pagos 2.0, Nómina, Comercio Exterior, Carta Porte 3.0, INE, Leyendas Fiscales, etc.)
- **SAT** (Servicio de Administración Tributaria) — the tax authority
- **Electronic accounting (contabilidad electrónica)** — a monthly XML upload (chart of accounts, trial balance, journal entries on request)
- **DIOT** — a monthly declaration of 3rd-party transactions
- **Carta Porte 3.0** — mandatory for goods transport since 2024

## Banking / Payments
- **SPEI** — fast domestic transfer
- **CLABE** — the 18-digit domestic bank account number, always used
- There is no IBAN
- **Cheque** is still in use, though declining
- Foreign currency operations are common near the border

## Master Data Peculiarities
- Every customer/vendor carries an RFC
- **Uso del CFDI** (usage code) is required per invoice: G01, G03, P01, S01, D01, …
- **Régimen fiscal** applies per taxpayer (601, 603, 606, 612, 621, 626, RESICO…)
- Address: Calle / Número Ext / Int / Colonia / CP / Municipio / Estado

## Statutory Reporting
- **IVA**: monthly (DIOT + tax return through the SAT portal)
- **ISR**: provisional monthly plus annual
- **Nómina CFDI**: per employee on each payroll run
- **Buzón Tributario**: SAT's electronic mailbox, mandatory to check
- **DPIVA**: annual

## SAP Country Version
- **CC MX** — covers:
  - the Mexican tax procedure plus IVA/IEPS/ISR handling
  - CFDI 4.0 generation (SAP DRC or PAC integration: EDICOM, Pegaso, Interfactura, ECO-Mexico)
  - Nómina CFDI (HCM-MX)
  - DIOT and Electronic Accounting extracts (catálogo cuentas, balanza comprobación, pólizas)

## Common Customizations
- PAC integration (CFDI stamping to the PAC API over SOAP/REST)
- Carta Porte complemento covering distribution/logistics
- Complemento de Pago (CFDI of payments) — one separate XML per payment
- Cancellation workflow (counterparty approval is required for certain amounts)
- SAT 69-B / blacklisted taxpayer validation

## Pitfalls / Anti-patterns
- Cancelling a CFDI without counterparty approval → SAT fine
- Leaving Complemento Pago off payments → buyer cannot deduct
- A wrong Uso del CFDI / Régimen combination → SAT rejection
- Failing to validate Buzón Tributario messages → miss tax notices
- Omitting Carta Porte for B2B transport → customs/audit risk
- Using SAP standard tax for IEPS without extensions
