# FI - Financial Accounting BAPIs & Function Modules
# FI - 재무 회계 BAPI 및 기능 모듈

## Core BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_ACC_DOCUMENT_POST | ECC/S4 | Accounting Document Posting / 회계 전표 계상 | The all-purpose FI document posting — G/L, AR and AP entries are passed in the ACCOUNTGL, ACCOUNTRECEIVABLE, ACCOUNTPAYABLE and CURRENCYAMOUNT tables |
| BAPI_ACC_DOCUMENT_CHECK | ECC/S4 | Accounting Document Validation / 회계 전표 검증 | Checks a document ahead of posting; takes the same structure as POST |
| BAPI_ACC_DOCUMENT_REV_POST | ECC/S4 | Accounting Document Reversal / 회계 전표 역분개 | Reverses an accounting document that has already been posted |
| BAPI_COMPANYCODE_GETLIST | ECC/S4 | Company Code List Retrieval / 회사코드 목록 읽기 | Returns all company codes as a list |
| BAPI_COMPANYCODE_GETDETAIL | ECC/S4 | Company Code Detail Retrieval / 회사코드 상세 읽기 | Reads company code master data out of T001 |
| BAPI_GL_GETGLACCBALANCE | ECC/S4 | G/L Account Balance Retrieval / G/L 계정 잔액 읽기 | Reads a G/L account balance for a given period and fiscal year |
| BAPI_GL_GETGLACCCURRENTBALANCE | ECC/S4 | Current G/L Balance Retrieval / G/L 현재 잔액 읽기 | Reads the current balance, open items included |
| BAPI_GL_GETLINEITEMS | ECC | G/L Line Item Retrieval / G/L 개별 항목 읽기 | Reads G/L account line items out of BSEG. On S/4HANA use CDS views over ACDOCA instead |
| BAPI_CUSTOMER_GETDETAIL2 | ECC | Customer FI Detail Retrieval / 고객 FI 상세 읽기 | Reads customer master from KNA1 and KNB1. On S/4HANA use the BP APIs (BUT000-based) instead |
| BAPI_VENDOR_GETDETAIL | ECC | Vendor FI Detail Retrieval / 공급업체 FI 상세 읽기 | Reads vendor master from LFA1 and LFB1. On S/4HANA use the BP APIs (BUT000-based) instead |

## AP/AR BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_AR_ACC_GETOPENITEMS | ECC/S4 | AR Open Item Retrieval / AR 미결 항목 읽기 | Reads the open receivable items of a customer |
| BAPI_AP_ACC_GETOPENITEMS | ECC/S4 | AP Open Item Retrieval / AP 미결 항목 읽기 | Reads the open payable items of a vendor |
| BAPI_INCOMING_PAYMENT_POST | ECC/S4 | Incoming Payment Posting / 입금 계상 | Posts a payment received from a customer, with clearing |
| BAPI_OUTGOING_PAYMENT_POST | ECC/S4 | Outgoing Payment Posting / 출금 계상 | Posts a payment made to a vendor, with clearing |

## Asset Accounting BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_FIXEDASSET_OVRTAKE_CREATE | ECC/S4 | Asset Creation (Takeover) / 자산 생성 (인수 처리) | Sets up a fixed asset master carrying its initial values |
| BAPI_FIXEDASSET_CHANGE | ECC/S4 | Asset Master Update / 자산 마스터 수정 | Changes fixed asset master data |
| BAPI_FIXEDASSET_GETDETAIL | ECC/S4 | Asset Detail Retrieval / 자산 상세 읽기 | Reads asset master data out of ANLA and ANLB |
| BAPI_ACC_GL_POSTING_POST | ECC/S4 | Asset-Side G/L Posting / 자산 관련 G/L 계상 | Posts asset acquisitions, retirements and transfers |

## S/4HANA Finance APIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| FINS_ACDOCA_READ | S4 | Universal Journal Retrieval / 유니버설 저널 읽기 | Reads ACDOCA, which took over from the BSEG/BSAS/BSIS line item tables |
| BAPI_BUPA_CREATE_FROM_DATA | S4 | Business Partner Creation / 비즈니스 파트너 신규 등록 | Creates a customer or vendor as a BP holding CVI roles |
| BAPI_BUPA_CHANGE_FROM_DATA | S4 | Business Partner Update / 비즈니스 파트너 정보 수정 | Edits BP master data |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| FI_DOCUMENT_CHANGE | ECC/S4 | FI Document Update / FI 전표 수정 | Alters those fields of an already posted FI document that remain open to change |
| AC_DOCUMENT_CREATE | ECC/S4 | Accounting Document Creation / 회계 전표 생성 | Low-level internal document creation, called by the BAPIs |
| CALCULATE_TAX_FROM_NET_AMOUNT | ECC/S4 | Tax Derivation from Net / 순액 기준 세액 산출 | Derives the tax amount from a net amount plus a tax code |
| CALCULATE_TAX_FROM_GROSSAMOUNT | ECC/S4 | Tax Derivation from Gross / 총액 기준 세액 산출 | Derives the tax from a gross amount plus a tax code |
| FI_PERIOD_DETERMINE | ECC/S4 | Posting Period Derivation / 전기 기간 판별 | Works out which fiscal year and posting period a date falls in |
| BAPI_EXCHANGERATE_GETDETAIL | ECC/S4 | Exchange Rate Retrieval / 환율 읽기 | Reads the exchange rate held for a currency pair on a given date |
