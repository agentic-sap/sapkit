/**
 * `GetBadiImplementations` — 고전 BAdI 정의의 구현 클래스를 찾는다.
 *
 * 구 핸들러: `engine/src/handlers/enhancement/readonly/handleGetBadiImplementations.ts`.
 *
 * ## ⚠ 이 도구는 **ECC 브리지 하나로만** 살아 있고, 신 엔진에 그 브리지가 없다
 *
 * 구는 SAP 표준 ADT로 이 답을 얻지 못한다. `datapreview`·`ddic`·`enhsxsb`
 * 엔드포인트가 레거시 커널(BASIS < 7.50)에 없어서, **OData FunctionImport
 * `DdicBadi`를 통해 브리지 함수모듈 `ZMCP_ADT_DDIC_BADI`를 부르는 것이 유일한
 * 통로**다(겉 핸들러 `:11-16`·`:100-105` → `engine/src/lib/rfcBackend.ts:123-126`
 * → `engine/src/lib/odataRfc.ts:511-537`). S/4HANA 경로는 구에도 없다 — 겉
 * 핸들러가 `SAP_VERSION !== 'ECC'`면 그 사실을 문구로 알리고 끝낸다(`:83-89`).
 *
 * 신 엔진의 OData 통로가 가진 FunctionImport는 셋뿐이고
 * (`src/rfc/odata.ts:54` — `Dispatch` · `Textpool` · `DdicTablRead`),
 * DDIC 읽기 능력도 `callDdicTablRead` 하나다(`src/rfc/types.ts:72-78`).
 * `DdicBadi`를 여는 일은 `src/rfc/**`를 고치는 작업이고 이 묶음 과제의
 * **무접촉 구역**이다.
 *
 * 그래서 두 갈래를 정직하게 나눈다:
 *
 *  - `SAP_VERSION`이 ECC가 **아니면** — 구의 문구를 **글자 그대로** 돌려준다.
 *    이 갈래가 구와 완전히 같다.
 *  - `SAP_VERSION`이 ECC**면** — 브리지가 없다는 것을 알리고 멈춘다. 장부 D132.
 *    **조용히 ADT로 흘려보내지 않는다** — 그 요청은 ECC에서 404가 되고, 그 404는
 *    "BAdI가 없다"로 읽힌다. 없는 것은 BAdI가 아니라 엔드포인트다. D61이 데이터
 *    엘리먼트·도메인에서 내린 것과 같은 판단이다.
 *
 * 어느 갈래에서도 **SAP 호출이 한 발도 나가지 않는다.**
 *
 * ## `SAP_VERSION`을 어디서 읽는가 (차이가 아니다)
 *
 * 구는 `process.env.SAP_VERSION`을 직접 읽었다(`:83`). 신 엔진은 그 값을 기동 때
 * 프로파일로 해석해 두므로 `context.profile.sapVersion`을 읽는다 — 이 판의 ECC
 * 갈림 도구 전부가 같은 자리를 읽는다(`internal/dataElementDomainRead.ts:172` ·
 * `rfc-read/ddicRead.ts:206` · `write/createTable.ts:112`). 읽는 곳이 다를 뿐
 * 값이 같고, 대문자화만 하고 trim 하지 않는 판정도 구 그대로다.
 *
 * ## `targetNames`를 선언하지 않는 이유
 *
 * 이 도구가 겨누는 `badi_definition`은 **표준 SAP 이름**이다(발행 설명문의
 * 예시부터 `ME_PROCESS_PO_CUST`다). 녹화 사전 검사에 걸면 이 도구의 정상 사용이
 * 통째로 막힌다 — `SearchObject`가 표준 마스크를 받는 것과 같은 자리다.
 * `kind: 'read'`라 선언이 필수도 아니다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import { failure, returnError } from './internal/results';

/**
 * 구 게이트와 같은 판정 — 대문자화만 하고 **trim 하지 않는다**(`' ECC '`는
 * 갈리지 않는다). 값의 출처는 해석된 프로파일이다 — 이 판의 다른 ECC 갈림
 * 도구들과 같은 자리를 읽는다(`src/tools/read/internal/dataElementDomainRead.ts:110`).
 */
export function isEcc(sapVersion: string | null): boolean {
  return sapVersion?.toUpperCase() === 'ECC';
}

/** 구 `:84-88` 글자 그대로. */
export const NON_ECC_MESSAGE =
  'GetBadiImplementations currently routes through the ECC bridge (ZMCP_ADT_DDIC_BADI via OData FunctionImport DdicBadi). ' +
  'Set SAP_VERSION=ECC in .sapkit/sap.env, or wait for the S/4HANA native ADT path (planned).';

/** 브리지가 없다는 정직한 거절 — 장부 D132. */
export const ECC_BRIDGE_MISSING_MESSAGE =
  'GetBadiImplementations on SAP_VERSION=ECC needs the ZMCP_ADT_DDIC_BADI OData bridge ' +
  '(FunctionImport DdicBadi), which this engine does not implement yet (divergence D132). ' +
  'This tool has no ADT fallback: the datapreview / ddic / enhsxsb endpoints it would need are absent on ECC kernels ' +
  '(BASIS < 7.50), so falling through to them would report a missing endpoint as a missing BAdI.';

export const getBadiImplementations = defineTool(
  {
    name: 'GetBadiImplementations',
    description:
      "[read-only] Find implementations of a (classic) BAdI definition. Use during symptom analysis when a standard SAP BAdI is implicated — answers 'which Z class extends this standard BAdI?'. Example flow: PO BAPI error → ME_PROCESS_PO_CUST → list Z impls → read the impl class source via GetClass to find the bug. Currently ECC-only (routes through the ZMCP_ADT_DDIC_BADI bridge FM). Classic BAdI only; kernel BAdI returns kind='unknown'.",
    inputSchema: {
      badi_definition: z
        .string()
        .describe('BAdI definition name (e.g., ME_PROCESS_PO_CUST). Will be uppercased.'),
      customer_only: z
        .boolean()
        .optional()
        .describe(
          'Restrict to Z*/Y* implementations. Default: true. Set false to include SAP-shipped implementations.',
        ),
      active_only: z
        .boolean()
        .optional()
        .describe('Restrict to active implementations only. Default: true.'),
      include_methods: z
        .boolean()
        .optional()
        .describe(
          'Include the list of redefined method names per implementation (from SXC_EXIT). Default: true.',
        ),
    },
    // 구 선언 그대로 — **cloud가 없다.** 채록본에서도 연결 조건 둘에만 뜬다.
    available_in: ['onprem', 'legacy'],
    // 구 경로는 `handlers/enhancement/readonly/`이고 `ReadOnlyHandlersGroup`에
    // 등록됐다(`engine/src/lib/handlers/groups/ReadOnlyHandlersGroup.ts:184`).
    sets: ['readonly'],
    kind: 'read',
  },
  async (context, args) => {
    try {
      if (!args?.badi_definition) {
        return returnError(new Error('badi_definition is required'));
      }

      if (!isEcc(context.profile.sapVersion)) {
        // 구와 글자까지 같은 갈래다.
        return returnError(new Error(NON_ECC_MESSAGE));
      }

      const badiDefinition = String(args.badi_definition).toUpperCase();
      context.logger.error(
        `GetBadiImplementations: ECC bridge unavailable for badi=${badiDefinition}`,
      );
      // 조용히 ADT로 흘리지 않는다. 접속도 만들지 않는다.
      return failure(ECC_BRIDGE_MISSING_MESSAGE);
    } catch (error) {
      return returnError(error);
    }
  },
);
