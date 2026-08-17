# 🇰🇷 Korea

## Formats
- **Date**: `YYYY.MM.DD` officially, `YYYY-MM-DD` in IT, `YYYY년 MM월 DD일` when formal
- **Number / decimal**: `.` for the decimal, `,` for thousands (e.g., `1,234,567.89`)
- **Currency**: KRW (원) — typically carried without decimals; displayed as `1,234,567원` or `₩1,234,567`
- **Phone**: Seoul is `02-1234-5678`, mobile is `010-XXXX-XXXX`
- **Postal code**: 5 digits in the new format, 3+3 in the old
- **Timezone**: KST (UTC+9) with no DST

## Language & Locale
- SAP language key: `3`, which is KO
- Double-byte handling (UTF-16/UTF-8) — the ABAP used must be Unicode-compatible
- The typical locale is `ko_KR.UTF-8`

## Tax System — VAT
- **VAT (부가가치세, 부가세)**: the standard rate is 10%
- Registered businesses split into 과세사업자 (standard) and 간이과세자 (simplified)
- Zero-rating covers exports and specific goods
- The VAT ID is the 사업자등록번호 (Business Registration Number) — **10 digits** written `XXX-XX-XXXXX`
- Filing is quarterly for standard and semi-annual for simplified; the report goes to NTS (국세청)

## e-Invoicing / Fiscal Reporting
- **Mandatory e-tax invoice (전자세금계산서)** applies to every VAT-registered business (B2B)
- Issuing and receiving happen through the **NTS e-세로** portal, through ERP-integrated vendors (Bizforce, Kyobo, Smartbill, Douzone, …), or through a KERIS-certified ASP
- The format is XML against an NTS-defined schema, and a digital signature is required
- **Real-time transmission to NTS within 1 day** (부가세 신고 자동 연계)
- Credit notes and debit notes travel the same channel (수정세금계산서)
- **Tax invoice types**: 세금계산서 (taxable), 계산서 (duty-free), and 현금영수증 (cash receipt for B2C)

## Banking / Payments
- **Virtual Accounts (가상계좌)**: one-time per transaction, and B2C collection uses them heavily
- B2B payments use **Firm Banking (펌뱅킹)**
- **Zengin-like** batch transfer files go through bank EDI
- Payment methods: 계좌이체 (transfer), 어음 (promissory note — legacy), and 카드
- No IBAN — the parts are bank code (3), branch (3), and account (variable)

## Master Data Peculiarities
- **주민등록번호 (RRN)** — the 13-digit national ID. **Highly regulated PII** — storing it requires a legal basis; by default do not store it, and use masking/encryption
- **외국인등록번호** — the foreigner registration number, 13 digits with the same structure
- Customer names are commonly stored as Korean plus English romanization (NAME1 / NAME2)
- For companies, **사업자등록번호** is the equivalent of the Tax ID / VAT ID
- Address format: province (광역시/도) → city (시/군/구) → district (동/읍/면) → detailed

## Statutory Reporting
- **VAT Return** (부가세 신고): filed quarterly through Hometax
- **Corporate Tax** (법인세): annual, with an interim installment (중간예납)
- **Year-end adjustment** (연말정산) applies to employee withholding
- **4대보험** (4 social insurances): 국민연금, 건강보험, 고용보험, and 산재보험

## SAP Country Version
- **CC KR** — the Korean localization covers:
  - Integration interface for the e-tax invoice (Korean EDI IDocs)
  - The 부가세 신고서 (VAT return) report RFUVKR00, plus FI-KR reports
  - Configuration for 원천징수 (withholding tax)
  - Korean check lot, and validation of the VAT registration number (check digit)
- Standard: FI-KR, HCM-KR (Korean payroll), and the MM-KR check for 사업자등록번호

## Common Customizations
- Interface for e-세금계산서 (custom IDOC or REST API to Bizforce/Douzone/Smartbill)
- **RRN masking** across every display (viewer/report/ALV)
- Management of 어음 (promissory note) — legacy and declining
- 세금계산서 발행/수신 대장 전용 보고서
- 현금영수증 발행 연계 (B2C)
- 원천징수영수증 출력

## Pitfalls / Anti-patterns
- Raw RRN stored in custom Z-tables without encryption → **정보통신망법 / 개인정보보호법 위반**
- 사업자등록번호 treated as simple text → the missing check-digit validation triggers invalid e-invoices
- 과세 / 면세 / 영세 items left unseparated on the invoice → VAT return errors
- Leaving e-tax invoice issue until billing — NTS requires issue **within 10 days of supply date** (공급일)
- The 수정세금계산서 (correction invoice) workflow ignored → reconciliation nightmares
- `SAP_LANGUAGE=EN` used for Korean-only reports → layout/UoM label problems
