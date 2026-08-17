# 🇫🇷 France

## Formats
- **Date**: `DD/MM/YYYY`
- **Number / decimal**: decimal separator `,`; thousands separator ` ` (space) or `.` — e.g., `1 234 567,89`
- **Currency**: EUR (€), carried to 2 decimals
- **Phone**: `+33 X XX XX XX XX`
- **Postal code**: 5 digits
- **Timezone**: CET/CEST

## Language & Locale
- SAP language key: `F` (FR)
- UTF-8 encoding; accented characters (é/è/ç/à)
- Typical locale: `fr_FR.UTF-8`

## Tax System — TVA
- Rates run 20% standard, 10% intermediate, 5.5% reduced, and 2.1% super-reduced
- **Numéro TVA intracommunautaire**: `FR` followed by 2 check digits and the SIREN (9), 13 chars total
- Intra-EU transactions use the reverse charge; payments settle through SEPA

## e-Invoicing / Fiscal Reporting
- **FEC (Fichier des Écritures Comptables)** — a standardized export of accounting data, mandatory each year for tax audit
- **B2B e-invoicing mandate**:
  - Every business carries the reception obligation as of **September 2026**
  - The issuance obligation is phased in: large firms at **Sept 2026**, medium/small by 2027
  - Delivery goes through PDPs (Plateformes de Dématérialisation Partenaires) plus the central PPF directory
  - Formats: Factur-X (hybrid PDF-A/3 + XML), UBL, or CII
- **DEB / DES** — declarations covering intra-EU trade

## Banking / Payments
- **SEPA** (SCT / SDD)
- **IBAN**: `FR` followed by 25 chars
- **RIB**: Relevé d'Identité Bancaire, legacy information — bank code (5), branch (5), account (11), RIB key (2)
- **LCR** — Lettre de Change Relevé, a commercial bill still in B2B use

## Master Data Peculiarities
- **SIREN** (9 digits) — identifies the business uniquely
- **SIRET** (14 digits) — the SIREN plus establishment (5)
- **APE / NAF code** — industry classification
- Address format: Rue / CP Ville / France
- Legal forms: SA, SARL, SAS, SASU, SCI, EURL …

## Statutory Reporting
- **TVA (CA3)**: monthly/quarterly
- **DEB/DES**: monthly intra-EU movements
- **FEC**: annual, and in case of audit must be delivered instantly
- **Liasse fiscale**: annual corporate tax pack
- **URSSAF**: monthly social contributions
- **DSN** (Déclaration Sociale Nominative) — payroll submission filed monthly

## SAP Country Version
- **CC FR** — covers:
  - TVA tax procedure, CA3 extract
  - FEC extract (RFUMSV00 family plus French-specific)
  - e-invoicing via Factur-X (SAP DRC or 3rd-party) for 2026+
  - HCM-FR / DSN payroll
  - LCR / BOR (bordereau) payment media

## Common Customizations
- FEC generator that follows FR-specific field order and dates
- Factur-X PDF+XML generation
- LCR management (acceptance, discount, maturity)
- DSN file — very complex, and most rely on SAP HR or a Sage add-on
- SIRET/SIREN validation

## Pitfalls / Anti-patterns
- Document date format — a French `31/12/2025` mistaken for MM/DD
- A decimal comma in CSV exports breaks downstream tools that expect `.`
- Skipping FEC — the audit penalty is immediate
- Leaving the 2026 mandate (reception) unprepared — supplier e-invoices cannot be accepted
- Mixing SIREN and SIRET in the vendor master
