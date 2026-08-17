# copy 잔량 명부 — ⑶-b 자체 저작 진척

> 신설 2026-08-17 (판3.1 · 청사진 사다리 ⑶-b — [`../BLUEPRINT.md`](../BLUEPRINT.md) §⑶-b,
> 판 큐는 [`../RUN-PLAN.md`](../RUN-PLAN.md)). **차용(`class: copy`)으로 들어온 것을 우리
> 문장·우리 구현으로 다시 쓰는 일**의 잔량을 세는 장부다.
>
> **총계 170** = 1부 지식 갈래 **146** + 2부 편입분 **24**.

---

## 1. 왜 이 문서가 있나 — 은퇴 장부와 다른 질문을 센다

은퇴한 [`../../interactive/MIGRATION-MANIFEST.md`](../../interactive/MIGRATION-MANIFEST.md)와
[`../../interactive/provenance/`](../../interactive/provenance/)는 **「원본과 대응하는가」**를
묻던 2026-07-10 이식의 완료 기록이고, **갱신이 금지된 역사**다. 그것을 읽던 게이트도 renew
1차에서 제거됐다 — 이후 콘텐츠는 원본에서 의도적으로 갈라지므로 그 질문 자체가 성립하지
않는다.

이 명부는 **다른 질문**을 센다 — **「우리가 다시 썼는가」**. 은퇴물은 아래 §4 레시피를 돌리던
그 시점에 **읽기만** 했고(읽기 전용 사료), 앞으로도 읽기만 한다. 진척의 **증명은 git 이력**이고
이 명부는 그 **요약**이다.

**검사 게이트는 만들지 않는다.** 진척은 사람의 판단이 세고 명부는 그 판단을 적는 자리다. 이
문서를 검사하거나 생성하는 스크립트를 만들지 말 것 — 만드는 순간 은퇴한 장부와 같은 물건이
된다.

---

## 2. 계수 규칙

| 항목 | 규칙 |
|---|---|
| 체크 인정 조건 | **재저작만** — 그 파일을 자체 문장·자체 구현으로 **다시 썼다**일 때만 체크한다 |
| 부분 편집 | **체크 아님** — 문단 교체·표현 손질은 진척으로 세지 않는다 |
| 삭제 | **갚는 길이 아니다** — 파일을 지워서 잔량을 줄이는 예외는 이 규칙에 **없다** |
| 체크 시점 | **독립 새-컨텍스트 리뷰 통과 후** — 재저작 커밋만으로는 체크하지 않는다 |
| 체크 병기 사항 | 재저작 **커밋 해시** + 리뷰 통과 **근거**(일자·결과) |
| 잔량 | **명부 총계 − 체크 누계** |

체크는 판이 끝날 때 그 판이 찍는다. 명부 자체의 행을 지우거나 총계를 줄이지 않는다 — 체크가
늘 뿐이다.

---

## 3. 범위

### 3.1 세는 것

| 부 | 범위 | 계 |
|---|---|---|
| 1부 | 지식 폴더 `interactive/core/knowledge/` 하위 copy 잔존 전부 (⑶-c 눈금인 oop 템플릿 20 제외) | **146** |
| 2부 | 지식 폴더 **밖**의 copy — 어느 판도 맡지 않던 것을 판3.x 범위로 **편입** | **24** |
| | | **170** |

**2부는 이번 판이 등재만 한다.** 코드 재작성이냐 재제작이냐 등 **갚는 방법은 해당 후속
판3.x가 그때 정한다** — 이 명부는 "갚아야 할 것이 여기 있다"까지만 확정한다.

### 3.2 세지 않는 것 — 소관 명기

| 대상 | 수 | 소관 |
|---|---|---|
| `interactive/core/knowledge/abap/templates/oop-sample/` | 20 | **⑶-c (판4)** — ZRSC4SAP_* 템플릿 재생성 |
| `interactive/server/sap-assets/` | 30 | **⑴ 교체 (판7)** 이 은퇴·대체 범위에서 판정 |
| `interactive/server/tool-catalog/` | 4 | 〃 |
| `interactive/server/` 유틸 (`verify-engine.mjs` · `bundle-keyring.mjs`) | 2 | 〃 |
| `interactive/server/` 번들 계열 (원본 `engine/**`) | 3 | 〃 |
| `interactive/server/runtime-deps/keyring/` | 21 | **끝그림 ②** 가 이미 커버 — 정식 패키지 귀속 |
| `LICENSE` (MIT 고지 승계) | 1 | **⑷ (판8)** 자체 소관 — `interactive/LICENSE` 은퇴 + 루트 표 정리 |
| `interactive/core/knowledge/abap/conventions/` 자체분 3편 | 3 | 차용분이 아님 (이식 후 신설) |
| `interactive/core/knowledge/modules/` 등의 transform 분류 | — | 차용분이 아님 |

**판8(⑷) 착수의 실질 전제 = 이 명부 전체(170) 소진 + 판4(oop 20) + 판7 소관분 판정.**

---

## 4. 도출 레시피 (재현 절차)

아래 목록은 디렉터리 나열이 아니라 **규칙 적용의 산출**이다. 폴더를 훑어 채우면 수치가
어긋난다 — 해당 폴더들의 실파일 수는 copy 수보다 많다(훅 8 중 4 · `tools/spec/` 7 중 5 ·
`data-protection` 13 중 12 · `conventions` 21 중 18).

1. [`../../interactive/provenance/migration-map.json`](../../interactive/provenance/migration-map.json)
   의 `rules`(81개)를
   [`../../interactive/provenance/sc4sap-public-source.json`](../../interactive/provenance/sc4sap-public-source.json)
   의 `inventory.entries`(**487**건, 핀 커밋 `a95eb0fe`)에 **배열 순서 첫 매칭**으로 적용해
   원본 파일마다 `class`를 정한다. 미매칭 0건이어야 한다.
2. `class === 'copy'`인 것만 남긴다 → **원본 282**건.
3. 규칙의 `targets[0].token`으로 목적지 경로를 만든다 — `pattern`이 `<prefix>/**`이면
   `token + (원본경로 − prefix)`, 단일 파일 규칙이면 `token + basename`. 첫 매칭이므로
   `common/alv-sample/**` 류의 좁은 규칙이 `common/**`보다 먼저 걸린다.
4. 목적지 token은 `interactive/` 기준이다 — 그 아래에서 현존을 대조한다. (`LICENSE`는 레포
   루트와 `interactive/` 양쪽에 실재하고 어느 쪽이든 §3.2로 셈 밖이라 계수에 영향이 없다.)
5. 지식 폴더(`core/knowledge/`) 현존 copy에서 `templates/oop-sample/` 20을 빼면 **1부 146**,
   §3.1의 편입 5경로 합이 **2부 24**, 도합 **170**이다.

**기계 검산 (2026-08-17 판3.1)**: 인벤토리 487 · 미매칭 0 · copy 원본 282 · 지식 폴더 현존
copy **166**(oop 20 포함) → 1부 **146** · 2부 **24** / 24 현존 · 총계 **170**.

> **GPL `reference/` 31은 「부재」로 검출되는 것이 정상이다.** 규칙
> `skills/sap-abap/**` → `core/knowledge/abap/reference/`의 31파일은 2026-08-09 커밋
> `54fd84de`로 삭제됐고(결정 기록은 [`DECISIONS.md`](DECISIONS.md) D-074), 빈자리 처리는
> D-086이 **조회**로 확정해 ⑶-a 갈래가 종결됐다. 그러므로 이 31은 잔량이 아니며 이 명부에
> 등재하지 않는다.

---

## 5. 잔량 이력

체크가 늘 때마다 한 줄 append 한다.

| 판 | 일자 | 체크 증가 | 잔량 |
|---|---|---|---|
| 판3.1 (명부 신설) | 2026-08-17 | — | **170** |

---

## 6. 1부 — 지식 갈래 146

문서 141(modules 91 · industry 15 · country 17 · conventions 18) + 견본 코드 5(templates/ecc 3 ·
alv-sample 1 · procedural-sample 1).

**앵커 제약**: `clean-code-oop.md` · `include-structure.md` · `oop-pattern.md` 3편은 개명
게이트(`interactive/scripts/check-runtime-path-rename.mjs`)가 지키는 앵커 문자열
`zrsc4sap_oop_ex`를 품고 있다. **재저작할 때 그 문자열을 보존해야 한다** — SAP 안에 실재하는
오브젝트 이름이라 바꾸면 예제가 깨지고 게이트가 거부한다.

파일 경로는 각 절의 기준 폴더 이하다.

#### 1-A · `interactive/core/knowledge/modules/` — 모듈 지식 91

원본 `configs/**` · 14모듈 + common. 대소문자 보존.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `Ariba/bapi.md` | | | |
| ☐ | `Ariba/enhancements.md` | | | |
| ☐ | `Ariba/spro.md` | | | |
| ☐ | `Ariba/tables.md` | | | |
| ☐ | `Ariba/tcodes.md` | | | |
| ☐ | `Ariba/workflows.md` | | | |
| ☐ | `BW/bapi.md` | | | |
| ☐ | `BW/enhancements.md` | | | |
| ☐ | `BW/spro.md` | | | |
| ☐ | `BW/tables.md` | | | |
| ☐ | `BW/tcodes.md` | | | |
| ☐ | `BW/workflows.md` | | | |
| ☐ | `CO/bapi.md` | | | |
| ☐ | `CO/enhancements.md` | | | |
| ☐ | `CO/spro.md` | | | |
| ☐ | `CO/tables.md` | | | |
| ☐ | `CO/tcodes.md` | | | |
| ☐ | `CO/workflows.md` | | | |
| ☐ | `FI/bapi.md` | | | |
| ☐ | `FI/enhancements.md` | | | |
| ☐ | `FI/spro.md` | | | |
| ☐ | `FI/tables.md` | | | |
| ☐ | `FI/tcodes.md` | | | |
| ☐ | `FI/workflows.md` | | | |
| ☐ | `HCM/bapi.md` | | | |
| ☐ | `HCM/enhancements.md` | | | |
| ☐ | `HCM/spro.md` | | | |
| ☐ | `HCM/tables.md` | | | |
| ☐ | `HCM/tcodes.md` | | | |
| ☐ | `HCM/workflows.md` | | | |
| ☐ | `MM/bapi.md` | | | |
| ☐ | `MM/enhancements.md` | | | |
| ☐ | `MM/spro.md` | | | |
| ☐ | `MM/tables.md` | | | |
| ☐ | `MM/tcodes.md` | | | |
| ☐ | `MM/workflows.md` | | | |
| ☐ | `PM/bapi.md` | | | |
| ☐ | `PM/enhancements.md` | | | |
| ☐ | `PM/spro.md` | | | |
| ☐ | `PM/tables.md` | | | |
| ☐ | `PM/tcodes.md` | | | |
| ☐ | `PM/workflows.md` | | | |
| ☐ | `PP/bapi.md` | | | |
| ☐ | `PP/enhancements.md` | | | |
| ☐ | `PP/spro.md` | | | |
| ☐ | `PP/tables.md` | | | |
| ☐ | `PP/tcodes.md` | | | |
| ☐ | `PP/workflows.md` | | | |
| ☐ | `PS/bapi.md` | | | |
| ☐ | `PS/enhancements.md` | | | |
| ☐ | `PS/spro.md` | | | |
| ☐ | `PS/tables.md` | | | |
| ☐ | `PS/tcodes.md` | | | |
| ☐ | `PS/workflows.md` | | | |
| ☐ | `QM/bapi.md` | | | |
| ☐ | `QM/enhancements.md` | | | |
| ☐ | `QM/spro.md` | | | |
| ☐ | `QM/tables.md` | | | |
| ☐ | `QM/tcodes.md` | | | |
| ☐ | `QM/workflows.md` | | | |
| ☐ | `SD/bapi.md` | | | |
| ☐ | `SD/enhancements.md` | | | |
| ☐ | `SD/spro.md` | | | |
| ☐ | `SD/tables.md` | | | |
| ☐ | `SD/tcodes.md` | | | |
| ☐ | `SD/workflows.md` | | | |
| ☐ | `TM/bapi.md` | | | |
| ☐ | `TM/enhancements.md` | | | |
| ☐ | `TM/spro.md` | | | |
| ☐ | `TM/tables.md` | | | |
| ☐ | `TM/tcodes.md` | | | |
| ☐ | `TM/workflows.md` | | | |
| ☐ | `TR/bapi.md` | | | |
| ☐ | `TR/enhancements.md` | | | |
| ☐ | `TR/spro.md` | | | |
| ☐ | `TR/tables.md` | | | |
| ☐ | `TR/tcodes.md` | | | |
| ☐ | `TR/workflows.md` | | | |
| ☐ | `WM/bapi.md` | | | |
| ☐ | `WM/enhancements.md` | | | |
| ☐ | `WM/spro.md` | | | |
| ☐ | `WM/tables.md` | | | |
| ☐ | `WM/tcodes.md` | | | |
| ☐ | `WM/workflows.md` | | | |
| ☐ | `common/bapi.md` | | | |
| ☐ | `common/enhancements.md` | | | |
| ☐ | `common/naming-conventions-objects.md` | | | |
| ☐ | `common/naming-conventions.md` | | | |
| ☐ | `common/spro.md` | | | |
| ☐ | `common/tables.md` | | | |
| ☐ | `common/tcodes.md` | | | |

#### 1-B · `interactive/core/knowledge/industry/` — 산업 지식 15

원본 `industry/**`.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `README.md` | | | |
| ☐ | `automotive.md` | | | |
| ☐ | `banking.md` | | | |
| ☐ | `chemical.md` | | | |
| ☐ | `construction.md` | | | |
| ☐ | `cosmetics.md` | | | |
| ☐ | `electronics.md` | | | |
| ☐ | `fashion.md` | | | |
| ☐ | `food-beverage.md` | | | |
| ☐ | `pharmaceutical.md` | | | |
| ☐ | `public-sector.md` | | | |
| ☐ | `retail.md` | | | |
| ☐ | `steel.md` | | | |
| ☐ | `tire.md` | | | |
| ☐ | `utilities.md` | | | |

#### 1-C · `interactive/core/knowledge/country/` — 국가 지식 17

원본 `country/**`.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `README.md` | | | |
| ☐ | `au.md` | | | |
| ☐ | `br.md` | | | |
| ☐ | `cn.md` | | | |
| ☐ | `de.md` | | | |
| ☐ | `es.md` | | | |
| ☐ | `eu-common.md` | | | |
| ☐ | `fr.md` | | | |
| ☐ | `gb.md` | | | |
| ☐ | `in.md` | | | |
| ☐ | `it.md` | | | |
| ☐ | `jp.md` | | | |
| ☐ | `kr.md` | | | |
| ☐ | `mx.md` | | | |
| ☐ | `nl.md` | | | |
| ☐ | `sg.md` | | | |
| ☐ | `us.md` | | | |

#### 1-D · `interactive/core/knowledge/abap/conventions/` — 규약 18

원본 `common/**`. 폴더의 21편 중 이식 후 신설된 자체분 3편(`abapgit-roundtrip-rule.md` ·
`rap-odata-rules.md` · `source-repair-protocol.md`)은 차용분이 아니므로 셈 밖이다.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `abap-release-examples.md` | | | |
| ☐ | `abap-release-reference.md` | | | |
| ☐ | `alv-rules.md` | | | |
| ☐ | `clean-code-oop.md` | | | 앵커 `zrsc4sap_oop_ex` 보존 필수 |
| ☐ | `clean-code-procedural.md` | | | |
| ☐ | `clean-code.md` | | | |
| ☐ | `cloud-abap-constraints.md` | | | |
| ☐ | `constant-rule.md` | | | |
| ☐ | `ecc-ddic-fallback.md` | | | |
| ☐ | `field-typing-rule.md` | | | |
| ☐ | `function-module-rule.md` | | | |
| ☐ | `include-structure.md` | | | 앵커 `zrsc4sap_oop_ex` 보존 필수 |
| ☐ | `naming-conventions.md` | | | |
| ☐ | `ok-code-pattern.md` | | | |
| ☐ | `oop-pattern.md` | | | 앵커 `zrsc4sap_oop_ex` 보존 필수 |
| ☐ | `procedural-form-naming.md` | | | |
| ☐ | `sap-version-reference.md` | | | |
| ☐ | `text-element-rule.md` | | | |

#### 1-E · `interactive/core/knowledge/abap/templates/` — 견본 코드 5

원본 `skills/create-object/ecc/**`(3) · `common/alv-sample/**`(1) ·
`common/procedural-sample/**`(1). 같은 폴더의 `oop-sample/` 20파일은 ⑶-c(판4) 눈금이라
셈 밖이다.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `alv-sample/field-catalog-guide.abap` | | | |
| ☐ | `ecc/domain_create_sample.abap` | | | |
| ☐ | `ecc/element_create_sample.abap` | | | |
| ☐ | `ecc/table_create_sample.abap` | | | |
| ☐ | `procedural-sample/main-program.abap` | | | |

---

## 7. 2부 — 편입분 24

지식 폴더 밖의 copy 잔존이다. **이번 판은 등재만 하고, 각각을 어떻게 갚을지(코드 재작성·
재제작 등)는 해당 후속 판3.x가 그때 정한다.**

파일 경로는 각 절의 기준 폴더 이하다.

#### 2-A · `interactive/adapters/claude/hooks/` — 안전 훅 4

원본 `scripts/hooks/**`(3) + `scripts/install-hooks.mjs`(1). 폴더의 나머지 4파일
(`README.md` · `offline-code-analysis.mjs` · `syntax-checker.mjs` ·
`transport-validator.mjs`)은 차용분이 아니다.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `block-forbidden-tables.mjs` | | | |
| ☐ | `install-hooks.mjs` | | | |
| ☐ | `prefer-sqlquery-explicit-fields.mjs` | | | |
| ☐ | `tier-readonly-guard.mjs` | | | |

#### 2-B · `interactive/tools/spec/` — 사양서 도구 5

원본 `scripts/spec/**`. 폴더의 나머지 2파일(`render-md-images.mjs` ·
`render-process-images.mjs`)은 핀 인벤토리에 없어 셈 밖이다.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `build-spec.mjs` | | | 제2출처 (D-053) — 핀 사본 아님 |
| ☐ | `image-swap.mjs` | | | |
| ☐ | `screen-image-renderer.mjs` | | | 제2출처 (D-053) — 핀 사본 아님 |
| ☐ | `template-clone.mjs` | | | 핀 사본 + 로컬 1줄 수리 (D-053) |
| ☐ | `xlsx-zip.mjs` | | | |

#### 2-C · `interactive/tools/fetch/` — 조회 도구 2

원본 `scripts/fetch-abap-keyword-doc.mjs` · `scripts/fetch-sap-help-doc.mjs`. D-086이 ⑶-a
빈자리의 조회처로 지정한 체계의 실행부다 — 재저작할 때
`interactive/core/procedures/help-portal-fetch.md`가 기대하는 계약을 깨지 않아야 한다.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `fetch-abap-keyword-doc.mjs` | | | |
| ☐ | `fetch-sap-help-doc.mjs` | | | |

#### 2-D · `interactive/core/policies/data-protection/` — 데이터보호 정책 12

원본 `exceptions/**`. 폴더의 13파일 중 `data-extraction-policy.md`는 차용분이 아니다.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `addresses-communication.md` | | | |
| ☐ | `audit-security-logs.md` | | | |
| ☐ | `auth-security.md` | | | |
| ☐ | `banking-payment.md` | | | |
| ☐ | `communication-workflow.md` | | | |
| ☐ | `custom-patterns.md` | | | |
| ☐ | `hr-payroll.md` | | | |
| ☐ | `master-data-pii.md` | | | |
| ☐ | `pricing-conditions.md` | | | |
| ☐ | `protected-business-data.md` | | | |
| ☐ | `table_exception.md` | | | |
| ☐ | `tax-government-ids.md` | | | |

#### 2-E · `interactive/assets/spec/` — 사양서 엑셀 템플릿 1

원본 `asset/**`.

| 체크 | 파일 | 재저작 커밋 | 리뷰 근거 | 비고 |
|---|---|---|---|---|
| ☐ | `template_base.xlsx` | | | 바이너리 — 재제작 방법은 후속 판이 정한다 |
