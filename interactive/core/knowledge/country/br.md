# 🇧🇷 Brazil

## Formats
- **Date**: `DD/MM/YYYY`
- **Number / decimal**: `,` marks the decimal and `.` groups thousands (e.g., `1.234.567,89`)
- **Currency**: BRL (R$)
- **Phone**: `+55 XX XXXXX-XXXX` (mobile numbers run 11 digits, the 9 prefix included)
- **Postal code**: CEP `XXXXX-XXX`
- **Timezone**: BRT (UTC-3); DST has been abolished nationwide since 2019

## Language & Locale
- SAP language key: `P` (PT)
- Typical locale: `pt_BR.UTF-8`

## Tax System — extremely complex
Several taxes at federal/state/municipal level overlap:
- **ICMS** — state VAT on goods; the rates differ by state and by product (interstate rates are different)
- **IPI** — federal excise on manufactured goods
- **PIS / COFINS** — federal contributions, under either a cumulative or a non-cumulative regime
- **ISS / ISSQN** — the municipal tax on services
- **II / IE** — duty on imports / exports
- **CFOP** — a 4-digit operation code that identifies every inbound/outbound transaction
- **CST** / **CSOSN** — tax situation codes, held per item and per tax
- **NCM** — the harmonized system code used for goods
- **CNAE** — the code for the business activity

## e-Invoicing / Fiscal Reporting
- **NF-e (Nota Fiscal Eletrônica)** — required on every goods invoice; SEFAZ authorizes it before shipment
- **NFS-e** — the municipal service invoice (the format varies by city!)
- **CT-e** — the invoice used for transport
- **MDF-e** — the manifest for freight
- **SPED** (Sistema Público de Escrituração Digital):
  - **SPED Fiscal** (EFD ICMS/IPI) — monthly
  - **SPED Contribuições** (EFD Contribuições) — monthly
  - **SPED Contábil (ECD)** — annual
  - **ECF (Escrituração Contábil Fiscal)** — annual
- **DCTFWeb / EFD-Reinf** — social, withholding, and labor
- **REINF**: withholding and retentions

## Banking / Payments
- **Boleto bancário** — the dominant collection instrument in B2C/B2B (a bank slip carrying a barcode)
- **PIX** — instant payment; mandatory for banks, and rapidly becoming dominant
- **TED** (same-day), **DOC** (legacy)
- No IBAN; what Brazil uses instead is Bank (3) + Branch (4) + Account number

## Master Data Peculiarities
- **CNPJ** (legal entity) — 14 digits, written `XX.XXX.XXX/XXXX-XX`
- **CPF** (individual) — 11 digits, written `XXX.XXX.XXX-XX` — sensitive PII under LGPD
- **IE / IM** — registration numbers at state / municipal level (held per establishment!)
- A customer often carries several IEs (one for each state of operation)
- Address: Rua / Número / Bairro / CEP / Cidade / UF (state)

## Statutory Reporting
- **SPED Fiscal**: monthly, at state/federal level
- **SPED Contribuições**: monthly, for PIS/COFINS
- **DCTFWeb**: monthly
- **GFIP/eSocial**: labor / FGTS / INSS, monthly
- **DIRF**: the annual return for withholding

## SAP Country Version
- **CC BR** — the largest localization footprint:
  - **J1B*** transactions / **CBT (Condition-Based Tax calculation)**
  - NF-e integration (outbound to SEFAZ, with XML sign + authorize)
  - SPED extracts (complex — the usual route is 3rd-party: Synchro, Mastersaf, Thomson Reuters ONESOURCE for LATAM)
  - Tax procedure for ICMS/IPI/PIS/COFINS (a very complex condition matrix)
  - HCM-BR, covering payroll / eSocial
- Nearly every Brazilian SAP rollout brings in a 3rd-party tax add-on for determination

## Common Customizations
- A 3rd-party tax engine (Synchro, Mastersaf, Sovos, Invoiceware/Sovos LATAM), replacing the SAP default
- Generation of Boleto, plus processing of the bank return file
- Integration with PIX (API + QR code)
- The municipal NFS-e format, per city (hundreds of formats!)
- Custom fields for CFOP determination and for retention rules

## Pitfalls / Anti-patterns
- Relying on SAP standard tax alone for interstate ICMS → rates/rules change per state; a 3rd-party is needed
- Leaving CFOP off a goods movement → SPED fails
- Getting the CST/CSOSN combination wrong → NF-e rejection
- NFS-e per municipality left unhandled (cada prefeitura has its own format)
- Mixing up CNPJ/CPF validation (both carry check digits)
- LGPD (Brazil GDPR) — CPF held in plain text counts as a data incident
