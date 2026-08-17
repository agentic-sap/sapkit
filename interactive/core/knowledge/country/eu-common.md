# 🇪🇺 European Union — Cross-Country Common Rules

Pair this file with the country-specific ones (`de.md`, `fr.md`, `it.md`, `es.md`, `nl.md`, `gb.md` for UK pre-Brexit context, etc.) whenever the work touches intra-EU transactions or EU-wide harmonized rules.

## VAT ID Format (EU-wide)

A country prefix, then the national format. Validate with **VIES (VAT Information Exchange System)**.

| Country | Prefix | Format (after prefix) |
|---------|--------|------------------------|
| Austria | AT | U + 8 digits |
| Belgium | BE | 10 digits (starts with 0 or 1) |
| Bulgaria | BG | 9 or 10 digits |
| Croatia | HR | 11 digits (OIB) |
| Cyprus | CY | 8 digits + 1 letter |
| Czechia | CZ | 8/9/10 digits |
| Denmark | DK | 8 digits |
| Estonia | EE | 9 digits |
| Finland | FI | 8 digits |
| France | FR | 2 chars + 9 digits |
| Germany | DE | 9 digits |
| Greece | EL (not GR) | 9 digits |
| Hungary | HU | 8 digits |
| Ireland | IE | 8-9 chars alphanumeric |
| Italy | IT | 11 digits |
| Latvia | LV | 11 digits |
| Lithuania | LT | 9 or 12 digits |
| Luxembourg | LU | 8 digits |
| Malta | MT | 8 digits |
| Netherlands | NL | 9 digits + B + 2 digits |
| Poland | PL | 10 digits |
| Portugal | PT | 9 digits |
| Romania | RO | 2-10 digits |
| Slovakia | SK | 10 digits |
| Slovenia | SI | 8 digits |
| Spain | ES | letter/digit + 7 digits + letter/digit |
| Sweden | SE | 12 digits (ends with `01`) |
| Northern Ireland | XI | follows UK VAT format (post-Brexit carve-out for goods) |

**Never** keep the digits alone — the prefix belongs to the ID. Run the VIES check to establish intra-EU reverse-charge eligibility.

## Intra-EU Transactions

### Reverse Charge (Supply of Services B2B)
- The invoice leaves the supplier **without VAT**, bearing the note `Reverse charge – Article 196 VAT Directive` (or its national equivalent)
- At the time of supply, both VAT IDs have to be valid and VIES-verified
- The recipient self-assesses the VAT — input + output come out neutral

### Zero-Rated Intra-EU Supply of Goods
- Goods crossing an EU border with both parties VAT-registered → 0%, on supporting evidence (CMR, packing list, proof of arrival)
- Acquisition VAT is self-assessed by the recipient

## EC Sales List (ESL / VIES)
- Lists every intra-EU sale of goods + services, per partner VAT ID and per period
- Filing frequency is not uniform (DE monthly/quarterly, FR monthly, IT quarterly, …)
- The name it goes by differs: DE Zusammenfassende Meldung, FR DES, IT Esterometro (merged), ES Modelo 349, NL ICP

## INTRASTAT
- Statistical reporting on physical movement of goods between EU states
- **Arrival** (inbound) and **Dispatch** (outbound), each triggered by a per-country threshold
- Monthly, and detailed: goods classification (CN code 8-digit), mass, value, Incoterms, country of origin

## OSS / IOSS (distance sales)
- **OSS (One-Stop-Shop)**: for B2C intra-EU distance sales of goods and services — one return per quarter, taxed in the destination country (>€10,000 threshold)
- **IOSS (Import One-Stop-Shop)**: for B2C imports ≤ €150 — one return
- Replaces MOSS, whose scope was digital services only

## SEPA (Single Euro Payments Area)
- The area spans 36 countries (EU27 + UK + CH + NO + IS + LI + …)
- **SCT** (Credit Transfer), **SDD** (Direct Debit Core/B2B), **SCT Inst** (Instant Credit Transfer)
- XML ISO 20022 — **pain.001** for credit transfer, **pain.008** for direct debit
- **Mandate Management** applies to SDD (unique mandate ID, sequence type FRST/RCUR/FNAL/OOFF)
- **End-to-End ID**, **Instruction ID**, **Creditor/Debtor Agent BIC**, **Remittance Info**

## GDPR / Data Protection
- An EU-wide Regulation since 2018 — it reaches any entity processing EU residents' data
- **Lawful basis required** — consent, contract, legal obligation, legitimate interest, vital interest, public interest
- Rights of the subject: access, rectification, erasure ("right to be forgotten"), portability, objection
- Notification window for a data breach: 72 hours
- Retention / blocking / deletion runs on **ILM (Information Lifecycle Management)** or SAP's Data Protection Workbench
- Where PII sits in SAP: BUT000, ADRC, PA*, HRP*, and any Z-table with personal data

## Common Customizations (cross-country)
- EU VAT validation (format + VIES API)
- INTRASTAT extract carrying country-specific variants
- ESL/VIES report in country-specific formats: DE ZM-XML, FR DES, IT Esterometro
- SEPA XML (pain.001 / pain.008) with country-specific quirks (DE: BankToCustomer, FR: banque tiers)
- GDPR deletion workflow — mark BP for deletion / blocking / purge
- Layouts for multi-currency and multi-language

## Pitfalls / Anti-patterns
- Treating UK (GB) as EU post-Brexit — the UK left the VAT system (but XI for NI goods stays)
- ESL / INTRASTAT missing for intra-EU trade above threshold
- VIES left unchecked per transaction → reverse charge invalid → VAT liability shifts back to the supplier
- SEPA mandate not unique / sequence type missing → SDD R-messages (rejections)
- GDPR: BP data stored without a lawful basis or a retention plan
