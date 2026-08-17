# 🇨🇳 China

## Formats
- **Date**: ISO `YYYY-MM-DD`, or `YYYY年MM月DD日`
- **Number / decimal**: `.` for the decimal, `,` for thousands
- **Currency**: CNY / RMB (¥), carried to 2 decimals
- **Phone**: mobile is 11 digits, formatted `1XX-XXXX-XXXX`
- **Postal code**: 6 digits
- **Timezone**: CST (UTC+8) with no DST (whole country)

## Language & Locale
- SAP language key: `1` for ZH (simplified), `M` for ZF (traditional)
- GB18030 or UTF-8 is mandatory; avoid GB2312
- The typical locale is `zh_CN.UTF-8`

## Tax System — VAT (增值税)
- Standard rate: **13%** (goods), **9%** (specific), **6%** (services), with exports zero-rated
- General taxpayer (一般纳税人) is distinguished from small-scale (小规模纳税人)
- **Tax ID**: 统一社会信用代码 (Unified Social Credit Code) — 18 alphanumeric characters
- Deducting input VAT requires a **matched** special VAT invoice (增值税专用发票)

## e-Invoicing / Fiscal Reporting
- **Golden Tax System (金税)** — VAT control run by the government. Every special VAT invoice must be issued through a Golden Tax-certified device/software (Aisino, Baiwang)
- **发票 (Fapiao)** comes in these types:
  - 增值税专用发票 (special VAT invoice, deductible)
  - 增值税普通发票 (general VAT invoice, non-deductible)
  - 电子发票 (e-fapiao) — rolling out since 2021, mandatory in most provinces from 2023+
- The modern mandatory target state (2024+) is **Fully digitalized e-fapiao (全电发票)**
- Invoicing must match ERP line-by-line — amount, tax, and buyer tax ID

## Banking / Payments
- Domestic transfers use the **CNAPS** bank code (12 digits)
- No IBAN; account number length varies across 16-19 digits
- Payment methods: bank transfer (转账), plus Alipay / WeChat Pay (B2C-heavy)
- Foreign exchange controls — cross-border payments need SAFE (国家外汇管理局) approval
- Corporate bank accounts are restricted by category: 基本户, 一般户, 专用户, 临时户

## Master Data Peculiarities
- **统一社会信用代码** on every customer and vendor (validate check digit)
- Customer name: the Chinese legal name is primary and English is reference only
- Address format: 省 → 市 → 区/县 → 街道 → 门牌号
- Phone: country code `+86`; mobile numbers are 11 digits and start with `1`

## Statutory Reporting
- **VAT return (增值税申报)** — monthly
- **Corporate Income Tax (企业所得税)** — quarterly plus annual
- **Individual Income Tax (个人所得税)** — withheld monthly
- **Social insurance (社保) + Housing fund (公积金)** — monthly

## SAP Country Version
- **CC CN** — covers:
  - Golden Tax interface (outbound invoice → GT tax device)
  - Printouts for special / general VAT invoices
  - VAT reporting (RFUVCN*)
  - Withholding tax for IIT
- On top of that, most customers layer a 3rd-party Golden Tax connector (Aisino API, Baiwang, iSure)

## Common Customizations
- Golden Tax interface (SD billing → Aisino / Baiwang API, verify → post tax number)
- Workflow for Fapiao request and verification (pre-print, issue, redline/cancel)
- Field length and sort for Chinese character addresses (large-to-small)
- Lookup of the CNAPS bank code
- FX accounting (spot / forward / revaluation per month-end)

## Pitfalls / Anti-patterns
- Invoices issued in ERP without a Golden Tax link → non-deductible for buyer; compliance risk
- Special and general VAT mixed in the same billing doc without an explicit type flag
- 统一社会信用代码 missing on customer master → Fapiao rejection
- Cross-border payment made without SAFE documentation → FX failure
- Chinese text hardcoded in programs without Unicode handling
