/**
 * `GetBehaviorDefinition` — 발행 계약 · 와이어 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.GetBehaviorDefinition`
 *  - 흐름·오류 문구:
 *    `engine/src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts:50-128`
 *  - 주소·헤더: `@babamba2/mcp-abap-adt-clients/dist/core/behaviorDefinition/read.js:59-71`
 *    (`Accept`는 `.../constants/contentTypes.js:16`의 `ACCEPT_SOURCE`)
 *  - 404 삼킴: `.../core/behaviorDefinition/AdtBehaviorDefinition.js:166-170`
 *
 * 짝인 `ReadBehaviorDefinition`과 무엇이 다른지는 `readBehaviorDefinition.test.ts`의
 * 「짝 대조」 절이 못 박는다.
 */

import { getBehaviorDefinition } from '../getBehaviorDefinition';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const BDEF_SOURCE = 'managed implementation in class zbp_i_demo unique;\nstrict ( 2 );\n';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  behavior_definition_name: string;
  version: string;
  behavior_definition_data: string;
  status: number;
  status_text: string;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getBehaviorDefinition);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as {
        name: string;
        description: string;
        inputSchema: unknown;
        execution: unknown;
      };

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetBehaviorDefinition'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    // 구 `handlers/behavior_definition/high/` → 채록본에서 `*_default` 두 조건에만 뜬다.
    // (`low/`의 같은 이름 파일들은 `…Low` 이름이라 채록본에 아예 없다.)
    expect(getBehaviorDefinition.definition.sets).toEqual(['high']);
    expect(getBehaviorDefinition.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getBehaviorDefinition.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('소스 엔드포인트로 GET 한 번 — 이름은 소문자, version은 실린다', async () => {
    const { requests } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ body: BDEF_SOURCE }),
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/bo/behaviordefinitions/z_my_bdef/source/main?version=active`,
    );
    expect(requests[0]?.headers['Accept']).toBe('text/plain');
  });

  it('version=inactive는 **요청에도** 실린다 (도메인 계열과 다른 자리)', async () => {
    const { outcome, requests } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF', version: 'inactive' },
      () => ({ body: BDEF_SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/bo/behaviordefinitions/z_my_bdef/source/main?version=inactive`,
    );
    expect((JSON.parse(outcome.text) as Payload).version).toBe('inactive');
  });

  it('이름은 응답에서 대문자, 경로에서 소문자다', async () => {
    const { outcome, requests } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'z_my_bdef' },
      () => ({ body: BDEF_SOURCE }),
    );

    expect(requests[0]?.url).toContain('/behaviordefinitions/z_my_bdef/source/main');
    expect((JSON.parse(outcome.text) as Payload).behavior_definition_name).toBe('Z_MY_BDEF');
  });

  it('이름을 인코딩하지 않는다 — 벤더가 `name.toLowerCase()`만 쓴다', async () => {
    const { requests } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: '/NS/Z_BDEF' },
      () => ({ body: BDEF_SOURCE }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/bo/behaviordefinitions//ns/z_bdef/source/main?version=active`,
    );
    expect(requests[0]?.url).not.toContain('%2F');
  });
});

describe('응답 조립', () => {
  it('구와 같은 필드로, 두 칸 들여쓰기로 낸다', async () => {
    const { outcome } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ status: 200, body: BDEF_SOURCE }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      behavior_definition_name: 'Z_MY_BDEF',
      version: 'active',
      behavior_definition_data: BDEF_SOURCE,
      status: 200,
      status_text: 'OK',
    });
    expect(outcome.text.split('\n')[1]).toBe('  "success": true,');
  });
});

describe('갈래', () => {
  it('404는 감싸개가 삼켜 빈손이 되고, 핸들러가 "찾지 못했다"로 던진다', async () => {
    const { outcome } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ status: 404, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    // 우리가 던진 Error에는 HTTP 상태가 없어 마침표 있는 404 갈래로 가지 않는다.
    expect(outcome.text).toBe(
      'Error: Failed to read behavior definition: BehaviorDefinition Z_MY_BDEF not found',
    );
  });

  it('423은 잠금 문구로 접힌다', async () => {
    const { outcome } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ status: 423, body: '' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: BehaviorDefinition Z_MY_BDEF is locked by another user.');
  });

  it('그 밖의 실패는 "Failed to read behavior definition:" 접두사를 단다', async () => {
    const { outcome } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: 'Z_MY_BDEF' },
      () => ({ status: 500, body: 'boom' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: Failed to read behavior definition: /);
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(
      getBehaviorDefinition,
      { behavior_definition_name: '' },
      () => ({ body: BDEF_SOURCE }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: behavior_definition_name is required');
    expect(requests).toHaveLength(0);
  });
});
