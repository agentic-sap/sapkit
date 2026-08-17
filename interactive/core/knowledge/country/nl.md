# 🇳🇱 Netherlands

## Formats
- **Date**: `DD-MM-YYYY`
- **Number / decimal**: `,` marks the decimal and `.` groups thousands, as in DE — though legacy usage sometimes shows `'` instead
- **Currency**: EUR (€)
- **Phone**: `+31 XX XXX XXXX`
- **Postal code**: `1234 AB` — 4 digits, a space, then 2 letters
- **Timezone**: CET/CEST

## Language & Locale
- SAP language key: `N` (NL) — English is widely used in business as well
- Locale typically written `nl_NL.UTF-8`

## Tax System — BTW
- 21% standard rate, 9% reduced, and 0%
- **BTW nummer**: `NL` plus 9 digits plus `B` plus 2 digits — under the new format post-2020, sole traders use an Omzetbelastingnummer that stays separate from the legal number
- KvK number (Kamer van Koophandel / Chamber of Commerce) — 8 digits

## e-Invoicing / Fiscal Reporting
- **B2G mandatory** since 2017, carried over Peppol (UBL)
- B2B remains voluntary, yet Peppol adoption runs high
- **XAF (XML Auditfile Financieel)** — the standardized audit file, produced on request from Belastingdienst
- **Standard Audit File Tax (SAF-T)** — adoption comes via the EU initiative

## Banking / Payments
- **SEPA** is dominant
- **IBAN**: `NL` plus 16 chars
- **iDEAL** serves B2C online payments
- Dutch domestic payments have historically been very fast, and SEPA Instant is common

## Master Data Peculiarities
- Every legal entity carries a KvK number
- BSN (Burgerservicenummer, 9 digits) — the national personal ID, and sensitive
- Address: Street Number / PostalCode City

## Statutory Reporting
- **BTW-aangifte**: filed quarterly (large: monthly)
- **ICP-opgave** (EC Sales List): covers intra-EU
- **XAF**: ad-hoc, whenever Belastingdienst requests it
- **Loonaangifte**: payroll submission, filed monthly

## SAP Country Version
- **CC NL** — covers:
  - the BTW tax procedure and the BTW-aangifte extract
  - ICP reporting for intra-EU
  - the XAF extract (auditfile)
  - HCM-NL, spanning Loonaangifte and pension funds
  - outbound Peppol UBL invoicing (DRC)

## Common Customizations
- Peppol UBL outbound, integrated through an access point (AP)
- An XAF generator that enriches with cost centers and project codes
- G-rekening (blocked account) handling for labour subcontracting
- Payroll tax retention (loonheffing)

## Pitfalls / Anti-patterns
- Dropping the space from the postal code format (`1234AB` instead of `1234 AB`) — PTT rejection
- BSN carried in the customer master without justification → AVG (GDPR) violation
- G-rekening skipped on labour-intensive subcontract payments
- B2G sent without Peppol UBL → government reject
