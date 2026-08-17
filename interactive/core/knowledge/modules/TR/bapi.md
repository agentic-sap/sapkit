# TR - Treasury BAPIs & Function Modules
# TR - 재무부(자금) BAPI 및 기능 모듈

## Core BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_BANKACCOUNT_GETLIST | ECC/S4 | Get Bank Account List / 은행 계좌 목록 조회 | Lists a company code's bank accounts as held in T012K |
| BAPI_BANKDETAIL_GETLIST | ECC/S4 | Get Bank Detail List / 은행 상세 목록 조회 | Returns bank master data out of BNKA |
| BAPI_PAYMENT_GETLIST | ECC/S4 | Get Payment List / 지급 목록 조회 | Fetches payment items recorded in PAYR |
| BAPI_ACC_GL_POSTING_POST | ECC/S4 | Post Bank Statement G/L Entries / 은행 명세서 G/L 전기 | Posts bank statement entries keyed in manually |
| BAPI_FINTRANS_CREATE | ECC/S4 | Create Financial Transaction / 금융 거래 생성 | Sets up a TRM financial transaction, whether money market, FX or derivatives |
| BAPI_FINTRANS_CHANGE | ECC/S4 | Change Financial Transaction / 금융 거래 변경 | Changes a TRM transaction that already exists |
| BAPI_FINTRANS_GETDETAIL | ECC/S4 | Get Financial Transaction Detail / 금융 거래 상세 조회 | Reads a TRM transaction back from VDBI/VDBJHD |

## Cash Management FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| CASHMANAGEMENT_UPDATE | ECC/S4 | Update Cash Management / 현금 관리 갱신 | Brings the cash management position up to date after FI postings |
| TR_CM_PLANNING_LEVEL_GET | ECC/S4 | Get Planning Level / 계획 수준 조회 | Returns the assignments made to cash planning levels |
| FIEB_CHANGE_BSTATEMENT | ECC/S4 | Change Bank Statement / 은행 명세서 변경 | Processes or changes electronic bank statement items |
| BAPI_CAMT_STATEMENT_CREATE | ECC/S4 | Create Bank Statement (CAMT) / 은행 명세서 생성 (CAMT) | Takes in bank statements supplied in CAMT.053 format |

## Electronic Bank Statement FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| FEBC_IMPORT_BANK_STATEMENT | ECC/S4 | Import Bank Statement / 은행 명세서 가져오기 | Reads in a bank statement file coming from outside |
| OFX_IMPORT_STATEMENT | ECC/S4 | Import OFX Statement / OFX 명세서 가져오기 | Reads in a bank statement held in OFX format |
| FEBC_POST_BANK_STATEMENT | ECC/S4 | Post Bank Statement / 은행 명세서 전기 | Works through an imported bank statement and posts it |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_EXCHANGERATE_GETDETAIL | ECC/S4 | Get Exchange Rate / 환율 조회 | Looks up an exchange rate in TCURR for TR calculations |
| BAPI_EXCHANGERATE_SAVEREPLICA | ECC/S4 | Save Exchange Rate / 환율 저장 | Writes changes into the exchange rate table TCURR |
| FTR_POSITION_GET | ECC/S4 | Get TR Position / TR 포지션 조회 | Returns the open position standing on a treasury instrument |
| BAPI_LOAN_GETDETAIL | ECC/S4 | Get Loan Detail / 대출 상세 조회 | Returns loan master data and conditions from VDARL |
| TR_COUNTERPARTY_LIMIT_CHECK | ECC/S4 | Check Counterparty Limit / 거래 상대방 한도 검사 | Checks a transaction against the counterparty's credit limit |
