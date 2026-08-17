# MM - Materials Management BAPIs & Function Modules
# MM - 자재 관리 BAPI 및 기능 모듈

## Core BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_PO_CREATE1 | ECC/S4 | Create Purchase Order / 구매 오더 생성 | Builds a PO by supplying header (POHEADER), items (POITEM), account assignment (POACCOUNT), and schedule lines (POSCHEDULE) |
| BAPI_PO_CHANGE | ECC/S4 | Change Purchase Order / 구매 오더 변경 | Changes fields on an existing PO; updates quantities and dates |
| BAPI_PO_GETDETAIL1 | ECC/S4 | Get PO Detail / 구매 오더 상세 조회 | Returns a PO's header, items, schedule lines, and account assignment |
| BAPI_PR_CREATE | ECC/S4 | Create Purchase Requisition / 구매 요청 생성 | Builds a PR from the PRHEADER and PRITEM structures |
| BAPI_PR_CHANGE | ECC/S4 | Change Purchase Requisition / 구매 요청 변경 | Changes a PR that already exists |
| BAPI_GOODSMVT_CREATE | ECC/S4 | Create Goods Movement / 재고 이동 생성 | Posts a goods receipt (mvt 101), a goods issue (mvt 201), or a transfer posting (mvt 301) |
| BAPI_GOODSMVT_CANCEL | ECC/S4 | Cancel Goods Movement / 재고 이동 취소 | Reverses (cancels) a goods movement document |
| BAPI_MATERIAL_SAVEDATA | ECC/S4 | Create/Change Material Master / 자재 마스터 생성/변경 | Creates or extends a material master across the various org-level views |
| BAPI_MATERIAL_GET_DETAIL | ECC/S4 | Get Material Detail / 자재 상세 조회 | Returns material master data for whichever views are specified |
| BAPI_MATERIAL_GETLIST | ECC/S4 | Get Material List / 자재 목록 조회 | Fetches a materials list matching the given search criteria |

## Vendor BAPIs (ECC Only)
> **S/4HANA라면 Business Partner API를 쓰십시오 (아래 참조)**

| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_VENDOR_CREATE | ECC | Create Vendor / 공급업체 생성 | Writes a vendor master record: general, company code, and purchasing. S/4HANA: use the BP APIs |
| BAPI_VENDOR_CHANGE | ECC | Change Vendor / 공급업체 변경 | Updates data on a vendor master. S/4HANA: use the BP APIs |
| BAPI_VENDOR_GETDETAIL | ECC | Get Vendor Detail / 공급업체 상세 조회 | Returns a vendor master, purchasing data included. S/4HANA: use the BP APIs |

## Business Partner BAPIs (S/4HANA)
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| VMD_EI_API=>MAINTAIN_BAPI | S4 | Maintain Vendor via BP / BP를 통한 공급업체 유지 | Creates or changes a vendor in Business Partner form, going through CVI (Customer-Vendor Integration) |
| CVI_EI_INBOUND_MAIN | S4 | CVI Inbound Processing / CVI 인바운드 처리 | Creates or updates Business Partners in bulk, carrying vendor and customer roles |
| BAPI_BUPA_CREATE_FROM_DATA | S4 | Create Business Partner / 비즈니스 파트너 생성 | Writes a BP master record holding general data plus roles |
| BAPI_BUPA_CHANGE_FROM_DATA | S4 | Change Business Partner / 비즈니스 파트너 변경 | Changes data held on a BP master |

## Invoice BAPIs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| BAPI_INCOMINGINVOICE_CREATE | ECC/S4 | Create Incoming Invoice / 수신 송장 생성 | Books a vendor invoice (the MIRO equivalent) |
| BAPI_INCOMINGINVOICE_CANCEL | ECC/S4 | Cancel Incoming Invoice / 수신 송장 취소 | Cancels an already posted invoice, reversing it |
| BAPI_INCOMINGINVOICE_GETDETAIL | ECC/S4 | Get Invoice Detail / 송장 상세 조회 | Returns an invoice header together with its item details |

## Utility FMs
| BAPI/FM | System | Description | Usage |
|---------|--------|-------------|-------|
| MB_CREATE_GOODS_MOVEMENT | ECC/S4 | Create Goods Movement (Internal) / 재고 이동 생성 (내부) | The low-level goods movement posting that MIGO itself uses |
| MATERIAL_READ | ECC/S4 | Read Material (Internal) / 자재 조회 (내부) | A fast internal read straight off the material master tables (MARA, MARC, MARD) |
| ME_CHECK_PO_INTERFACE | ECC/S4 | Check PO Interface / PO 인터페이스 검사 | Tests PO data for validity before it is created |
| BAPI_REQUISITION_GETINFO | ECC/S4 | Get Requisition Info / 구매 요청 정보 조회 | Returns PR details, release status among them |
| BAPI_STOCKACCOUNTVALUATION | ECC/S4 | Stock Account Valuation / 재고 계정 평가 | Computes the value of stock for accounting purposes |
| MD_REORDER_POINT_PLANNING | ECC/S4 | Reorder Point Planning / 재주문점 계획 | Fires the MRP reorder point logic against a material |
