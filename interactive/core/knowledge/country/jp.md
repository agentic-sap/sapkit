# 🇯🇵 Japan

## Formats
- **Date**: `YYYY/MM/DD` or `YYYY年MM月DD日`; government forms have not dropped the imperial calendar (和暦) — 令和 renders as `R6/4/1`
- **Number / decimal**: decimal `.` / thousands `,`
- **Currency**: JPY (¥), carried without decimals; displayed as `¥1,234,567`
- **Phone**: `03-1234-5678` (Tokyo), `090-XXXX-XXXX` (mobile)
- **Postal code**: `123-4567`
- **Timezone**: JST (UTC+9), no DST

## Language & Locale
- SAP language key: `J` (JA)
- Fully double-byte; text mixes Kanji/Hiragana/Katakana/alphanumeric; Unicode is mandatory
- Typical locale: `ja_JP.UTF-8`

## Tax System — Consumption Tax (消費税)
- Standard rate: **10%**; food and newspapers take the reduced 8%
- **Qualified Invoice System (適格請求書等保存方式)** in force since **October 2023** — the buyer can claim input VAT only where the issuer is a registered "qualified invoice issuer" (適格請求書発行事業者 / 登録番号 `T + 13 digits`)
- Registration number: `T` + 13-digit corporate number (法人番号)
- Filing: small businesses file annually, large ones monthly or quarterly

## e-Invoicing / Fiscal Reporting
- **Invoice requirements (2023+)**: the invoice must carry the registration number, the applicable tax rate per line, and the total tax per rate
- **Peppol JP** — Japan's digital invoice network, in place since 2023, with adoption growing
- **電子帳簿保存法 (Electronic Bookkeeping Act)**: transaction records held electronically have to be kept in digital form under integrity/searchability rules, which turned strict from 2024-01
- Paper invoices and e-invoices coexist

## Banking / Payments
- **Zengin** — the national clearing format for domestic transfers, carried as fixed-length text
- **Furikomi (振込)** — standard B2B transfer
- **Bank code (4) + branch (3) + account type + account (7)** — no IBAN
- **Furikae (振替)** — direct debit
- Late payment is uncommon; the default is invoicing at end-of-month with payment at end-of-following-month (月末締め翌月末払い)

## Master Data Peculiarities
- **Corporate Number (法人番号)**: 13 digits, public, and appears on every qualified invoice
- **My Number (個人番号)**: a 12-digit personal ID — **highly sensitive PII** whose storage 番号法 regulates
- Customer names split across Kanji (NAME1), Kana/Romaji (NAME2), and Furigana (searchable)
- Address goes large-to-small: 〒 (postal) → 都道府県 → 市区町村 → 番地 → building

## Statutory Reporting
- **Consumption tax return (消費税申告)** — annual or interim
- **Corporate tax (法人税)** — annual
- **Withholding (源泉徴収)** — monthly (10th of following month)
- **Year-end adjustment (年末調整)** December payroll
- **Social insurance (社会保険)**: 健康保険, 厚生年金, 雇用保険, 労災保険

## SAP Country Version
- **CC JP** — includes:
  - Qualified Invoice layout (2023+)
  - Consumption tax reporting (RFUVJP01, TAX-JP reports)
  - Withholding tax on services, rent, honoraria
  - HCM-JP payroll with 年末調整
  - Bank file formats (Zengin / ANSER)

## Common Customizations
- Qualified invoice number assignment + validation
- Outbound Zengin bank file generation plus MT940-like import
- Per-line 源泉徴収 calculation, sometimes per pay element
- 印鑑 (stamp) on forms (workflow + PDF overlay)
- Imperial calendar display on legal forms

## Pitfalls / Anti-patterns
- Skipping the qualified invoice requirement post-2023-10 → buyer cannot deduct input VAT
- Holding My Number as plain text → 番号法 violation
- A single invoice-level tax rate where 8%/10% are mixed → invoice rejected
- Leaving the imperial calendar unhandled in government-facing reports
- Using Furikae where the payment terms call for Furikomi, or the reverse
