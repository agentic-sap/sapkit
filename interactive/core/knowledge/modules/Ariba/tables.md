# Ariba - Key Tables Reference
# Ariba - 주요 테이블 참조

> **Note**: Ariba keeps its data in the cloud for the most part. The tables below sit on the SAP side and are the ones bearing on Ariba integration (PO, invoice, supplier, IDoc, messaging).
> **안내**: Ariba는 데이터를 대부분 클라우드에 보관합니다. 아래 테이블은 SAP 측에 있으면서 Ariba 통합(PO, 송장, 공급업체, IDoc, 메시징)에 관계되는 것들입니다.

## Master Data Tables
## 마스터 데이터 테이블

| Table | System | Description | 설명 |
|-------|--------|-------------|------|
| LFA1 | ECC | Vendor master for Ariba supplier | Ariba 공급업체용 공급업체 마스터 |
| BUT000 | S4 | Business Partner (Ariba supplier on S/4HANA) | 비즈니스 파트너(S/4HANA의 Ariba 공급업체) |

## Transaction Data Tables
## 트랜잭션 데이터 테이블

### SAP Side Integration (PO, Invoice, IDoc)

| Table | System | Description | 설명 |
|-------|--------|-------------|------|
| EKKO | ECC/S4 | PO Header (from Ariba) | PO 헤더(Ariba에서) |
| EKPO | ECC/S4 | PO Items (from Ariba) | PO 항목(Ariba에서) |
| EBAN | ECC/S4 | PR (from Ariba) | PR(Ariba에서) |
| RBKP | ECC/S4 | Invoice Header (from Ariba e-invoice) | 송장 헤더(Ariba e-invoice에서) |
| RSEG | ECC/S4 | Invoice Items (from Ariba e-invoice) | 송장 항목(Ariba e-invoice에서) |
| EDIDC | ECC/S4 | IDoc Control | IDoc 제어 |
| EDIDS | ECC/S4 | IDoc Status | IDoc 상태 |
| EDIDD | ECC/S4 | IDoc Data (segments) | IDoc 데이터(세그먼트) |
| NAST | ECC/S4 | Output messages (for Ariba cXML) | 출력 메시지(Ariba cXML용) |
| TRFCQOUT | ECC/S4 | Queued RFC Output (for CIG) | 큐잉된 RFC 출력(CIG용) |

### CIG / BTP Integration

| Table | System | Description | 설명 |
|-------|--------|-------------|------|
| SWEQADM | ECC/S4 | Event queue for async processing | 비동기 처리 이벤트 큐 |
| SXMSMSTORE | ECC/S4 | PI/PO message store | PI/PO 메시지 저장소 |

## Configuration Tables
## 구성 테이블

The Ariba cloud admin UI and SAP CIG configuration are where Ariba-specific configuration is kept. For the SPRO-side integration settings, see `configs/Ariba/spro.md`.
Ariba 전용 구성이 놓이는 곳은 Ariba 클라우드 관리 UI와 SAP CIG 구성입니다. SPRO 측 통합 설정은 `configs/Ariba/spro.md`에서 확인하세요.

## S/4HANA Specific
## S/4HANA 전용

- `BUT000` — on S/4HANA the Business Partner takes the place of `LFA1` for vendor/supplier. Ariba supplier data is synchronized into BP on S/4HANA.
- `BUT000` — S/4HANA에서 공급업체용 `LFA1` 자리를 이어받는 비즈니스 파트너. Ariba 공급업체 데이터는 S/4HANA의 BP로 동기화됩니다.

## Ariba Cloud Data (API-only Access)
## Ariba 클라우드 데이터 (API 전용 접근)

Requisition, PO, Invoice, and Supplier data held in Ariba Cloud have no direct path through ABAP tables. Reach them through the Ariba APIs:
Ariba 클라우드에 놓인 요청, PO, 송장, 공급업체 데이터에는 ABAP 테이블을 통한 직접 접근 경로가 없습니다. Ariba API를 거쳐 접근하세요:

- Sourcing API / Contracts API / Procurement API
- cXML (OrderRequest, InvoiceDetailRequest, ShipNoticeRequest)
