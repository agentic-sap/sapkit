/**
 * `GetBadiImplementations` — 발행 계약 · 노출 선언 · **두 갈래 모두 무접속**.
 *
 * ## 이 시험이 무엇을 증명하는가
 *
 * 이 도구의 유일한 통로는 ECC 브리지(FunctionImport `DdicBadi` →
 * `ZSAPKIT_ADT_DDIC_BADI`)이고 신 엔진의 OData 통로에 그 FunctionImport가 없다
 * (`src/rfc/odata.ts:54` · `src/rfc/types.ts:72-78`). 그래서 붙잡을 것은 둘이다:
 *
 *  1. `SAP_VERSION`이 ECC가 **아닌** 갈래는 구와 **글자까지 같다**
 *     (`engine/src/handlers/enhancement/readonly/handleGetBadiImplementations.ts:83-89`).
 *  2. ECC 갈래는 브리지 부재를 알리고 멈춘다 — **조용히 ADT로 흘리지 않는다.**
 *     장부 D132. 판정 기준은 `isError`가 아니라 **접속 시도 0회**다.
 */

import {
  ECC_BRIDGE_MISSING_MESSAGE,
  getBadiImplementations,
  isEcc,
  NON_ECC_MESSAGE,
} from '../getBadiImplementations';
import { directHarness, invokeDirect, textOf } from './dataElementDomainSupport';
import { cleanupTempDirs, harnessFor, publishedDeclaration } from './support';

afterEach(() => {
  cleanupTempDirs();
});

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다 — **개명한 브리지 FM 이름 하나만 갈린다**', async () => {
    const harness = await harnessFor(getBadiImplementations);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as {
        name: string;
        description: string;
        inputSchema: unknown;
        execution: unknown;
      };
      // 판S5(SAP 자산 개명)가 만든 **의도한 계약 변경 한 곳**이다. 채록본은 구 이름
      // `ZMCP_ADT_DDIC_BADI`를 싣는데, 그 브리지 함수모듈이 `ZSAPKIT_ADT_DDIC_BADI`로
      // 개명됐다. description이 구 이름을 계속 말하면 **존재하지 않는 오브젝트를
      // 찾으라고 시키는 셈**이라 이름을 옮겼다.
      //
      // 채록본(`harness/old-surface/m1-tools.json`)은 **되뜰 수 없는 기준**이므로
      // 손대지 않는다 — 여기서 그 한 이름만 치환해 대조한다. 나머지는 전부 그대로
      // 바이트 대조다: 치환은 그 이름에만 걸리고, description의 다른 글자·`name`·
      // `inputSchema`·`execution`이 움직이면 이 시험은 여전히 깨진다.
      const captured = publishedDeclaration('GetBadiImplementations');
      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual({
        ...captured,
        description: captured.description.replaceAll('ZMCP_ADT_DDIC_BADI', 'ZSAPKIT_ADT_DDIC_BADI'),
      });
    } finally {
      await harness.close();
    }
  });

  it('노출 선언이 구 핸들러의 소속·available_in과 같다 — **cloud가 없다**', () => {
    // 채록본에서도 연결 조건 둘(connected_default·connected_readonly)에만 뜬다.
    // 무프로파일(cloud) 조건에 새면 안 되는 자리다.
    expect(getBadiImplementations.definition.sets).toEqual(['readonly']);
    expect(getBadiImplementations.definition.available_in).toEqual(['onprem', 'legacy']);
    expect(getBadiImplementations.definition.kind).toBe('read');
  });

  it('표준 BAdI 이름을 받는 도구라 targetNames를 선언하지 않는다', () => {
    // `ME_PROCESS_PO_CUST` 같은 표준 이름이 정상 입력이다 — 사전 검사에 걸면
    // 이 도구의 정상 사용이 통째로 막힌다(`SearchObject`와 같은 자리).
    expect(getBadiImplementations.definition.targetNames).toBeUndefined();
  });
});

describe('ECC가 아닌 갈래 — 구와 글자까지 같다', () => {
  it.each([null, 'S4', 'ECC6', '', ' ECC '])(
    'SAP_VERSION=%s면 구의 안내 문구를 그대로 돌려준다',
    async (sapVersion) => {
      const harness = directHarness({ sapVersion });
      const result = await invokeDirect(getBadiImplementations, harness, {
        badi_definition: 'ME_PROCESS_PO_CUST',
      });

      expect(result.isError).toBe(true);
      // `return_error`라 `Error: ` 접두사가 붙는다.
      expect(textOf(result)).toBe(`Error: ${NON_ECC_MESSAGE}`);
      expect(harness.connections()).toBe(0);
      expect(harness.requests).toHaveLength(0);
    },
  );

  it("`' ECC '`가 갈리지 않는 것은 의도다 — 구 게이트는 trim 하지 않는다", () => {
    expect(isEcc(' ECC ')).toBe(false);
    expect(isEcc('ECC')).toBe(true);
    expect(isEcc('ecc')).toBe(true);
    expect(isEcc('Ecc')).toBe(true);
    expect(isEcc(null)).toBe(false);
  });
});

describe('ECC 갈래 — 브리지가 이 판에 없다 (차이 장부 D132)', () => {
  it.each(['ECC', 'ecc', 'Ecc'])(
    'SAP_VERSION=%s면 브리지 미구현을 알리고 접속을 만들지 않는다',
    async (sapVersion) => {
      const harness = directHarness({ sapVersion });
      const result = await invokeDirect(getBadiImplementations, harness, {
        badi_definition: 'ME_PROCESS_PO_CUST',
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(ECC_BRIDGE_MISSING_MESSAGE);
      // 문구가 브리지 함수모듈과 장부 번호를 지목한다.
      expect(textOf(result)).toContain('ZSAPKIT_ADT_DDIC_BADI');
      expect(textOf(result)).toContain('DdicBadi');
      expect(textOf(result)).toContain('D132');
      // **조용히 ADT로 흘리지 않는다** — 접속 시도 0회가 판정 기준이다.
      expect(harness.connections()).toBe(0);
      expect(harness.requests).toHaveLength(0);
    },
  );

  it('두 갈래의 문구는 서로 다른 문장이다', () => {
    expect(NON_ECC_MESSAGE).not.toBe(ECC_BRIDGE_MISSING_MESSAGE);
  });
});

describe('인자 갈래', () => {
  it('빈 badi_definition은 두 갈림보다 **먼저** 거절한다', async () => {
    const harness = directHarness({ sapVersion: 'ECC' });
    const result = await invokeDirect(getBadiImplementations, harness, { badi_definition: '' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: badi_definition is required');
    expect(harness.connections()).toBe(0);
    expect(harness.requests).toHaveLength(0);
  });
});
