# Country Reference (국가별 비즈니스·규제 특성)

Per-country localization and regulatory characteristics live in this folder. SAP consultants MUST read them together with `industry/*.md` whenever the work at hand is **configuration analysis, process design, master-data decisions, tax/e-invoicing setup, or any requirement interpretation** carrying a jurisdictional dimension.

## When to Use

Whenever any of the following comes up, `sap-*-consultant` agents load the project's country file:

- Date, number, currency, and decimal-separator formats
- Tax determination, VAT/GST registration, and withholding
- e-Invoicing, tax-reporting, and real-time fiscal submissions (SDI, SII, MTD, SAT, Golden Tax, e-tax, NF-e …)
- Bank transfer and payment medium formats (SEPA, ACH, JIS, CMS, Zengin …)
- Statutory reporting (ELSTER, FEC, SPED, GSTR, BAS …)
- Address format, postal code, and phone format
- Language, timezone, and the fiscal-year calendar
- Customizing that is localization-relevant (country-specific field extensions, SAP Country Version)

## How to Identify Country

Resolve in this order:
1. `.sapkit/config.json` → `country` field — the canonical plugin-side source; ISO-3166 alpha-2 such as `KR`, `US`, `DE`
2. `.sapkit/sap.env` → `SAP_COUNTRY` — the MCP-server mirror
3. When the analysis targets one specific CoCode, infer it from the company-code country (`T001.LAND1`)
4. Ask the user when it remains unset

On a multi-country project, load every country file that applies and flag the cross-country touchpoints (intercompany, transfer pricing, VAT ESL).

## Country Files

| File | Country | Key local peculiarities |
|---|---|---|
| [kr.md](kr.md) | 🇰🇷 Korea | e-세금계산서 (KERIS/NTS), 원화, DDMMYYYY → actually YYYY.MM.DD, 주민번호 |
| [jp.md](jp.md) | 🇯🇵 Japan | 請求書 (invoice system 2023+), JPY, Zengin payments, qualified invoice |
| [cn.md](cn.md) | 🇨🇳 China | Golden Tax (金税), 发票 (Fapiao), CNY, e-fapiao rollout |
| [us.md](us.md) | 🇺🇸 United States | Sales & Use Tax (per-state), EIN, 1099, no VAT, ACH / Check |
| [de.md](de.md) | 🇩🇪 Germany | USt, ELSTER, DATEV, IBAN, GoBD, EU VAT |
| [gb.md](gb.md) | 🇬🇧 United Kingdom | VAT, MTD (HMRC), GBP, BACS / FPS |
| [fr.md](fr.md) | 🇫🇷 France | TVA, FEC, FR e-invoicing 2026, SEPA |
| [it.md](it.md) | 🇮🇹 Italy | IVA, FatturaPA / SDI, Split Payment, Esterometro |
| [es.md](es.md) | 🇪🇸 Spain | IVA, SII (real-time VAT), TicketBAI (Basque), SEPA |
| [nl.md](nl.md) | 🇳🇱 Netherlands | BTW, Dutch IBAN/SEPA, EU VAT, XAF |
| [br.md](br.md) | 🇧🇷 Brazil | NF-e / NFS-e, SPED, CFOP, CST, ICMS/IPI/PIS/COFINS |
| [mx.md](mx.md) | 🇲🇽 Mexico | CFDI 4.0, SAT, complementos, e-accounting |
| [in.md](in.md) | 🇮🇳 India | GST (CGST/SGST/IGST), e-invoicing (IRP), e-way bill |
| [au.md](au.md) | 🇦🇺 Australia | GST, STP (payroll), BAS, ABN, BSB banking |
| [sg.md](sg.md) | 🇸🇬 Singapore | GST, IRAS, FATCA/CRS, PayNow, UEN |
| [eu-common.md](eu-common.md) | 🇪🇺 EU-wide | VAT ID format, INTRASTAT, EC Sales List (ESL), VIES, OSS/IOSS |

## File Structure

Every country file contains the following:
- **Formats** — date, number/decimal/thousand separator, currency code, phone, and postal code
- **Language & Locale** — ABAP language keys and the typical locale
- **Tax System** — the structure of VAT/GST/sales tax, rates, registration number format
- **e-Invoicing / Fiscal Reporting** — mandatory systems, go-live dates, and formats
- **Banking / Payments** — IBAN/domestic accounts, payment methods, and SEPA membership
- **Master Data Peculiarities** — tax numbers, ID numbers, and address format quirks
- **Statutory Reporting** — tax returns, payroll, and year-end
- **SAP Country Version** — the localization delivered with SAP (country-install)
- **Common Customizations** — the things projects typically build on top
- **Pitfalls / Anti-patterns**

## Relationship to Industry

*What the business does* is driven by `industry/`; *what the jurisdiction requires* is driven by `country/`. The two apply at the same time — a Korean cosmetics company, for example, loads `industry/cosmetics.md` **and** `country/kr.md`. Conflicts seldom arise; flag them nonetheless (e.g., IS-Retail pricing rules vs Korean POS invoicing rules).

## Adding a New Country

1. Copy an existing file to use as the template — `kr.md` for APAC, `de.md` for EU, for instance.
2. Populate the sections listed above.
3. Add the new row to this README's table.
4. Where agents will actively need it, update `.sapkit/config.json` → `country` and `sap.env` → `SAP_COUNTRY` through `the profile settings (edit .sapkit/config.json — see core/procedures/troubleshooting.md)`.
