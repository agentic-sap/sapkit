/**
 * `GetObjectStructureLow` — 발행 계약 · 노출 선언 · 와이어 · 세션 갈래 · 인자 갈래.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 주소·이름 이중 인코딩·`Accept`
 *    → `@babamba2/…/dist/core/shared/objectStructure.js:27-44`
 *      (+ `dist/utils/internalUtils.js:19-21`의 `encodeSapObjectName`)
 *  - 인자 검증 문구 → `engine/src/handlers/system/low/handleGetObjectStructure.ts:72-77`
 *  - 세션 복원 조건 → 같은 파일 `:80-89` + `engine/src/lib/utils.ts:763-788`
 *  - `sets` → `engine/src/lib/handlers/groups/SystemHandlersGroup.ts:337-339`
 */

import { getObjectStructureLow } from '../getObjectStructureLow';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const OBJECTSTRUCTURE = '/sap/bc/adt/repository/objectstructure';
const OK_XML = '<objectstructure/>';

const reply = (body = OK_XML) => () => ({ status: 200, body });

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getObjectStructureLow);
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
      }).toEqual(publishedDeclaration('GetObjectStructureLow'));
    } finally {
      await harness.close();
    }
  });

  it('`sets`는 구 폴더 이름 `low`가 아니라 `system`이다', () => {
    expect(getObjectStructureLow.definition.sets).toEqual(['system']);
    expect(getObjectStructureLow.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getObjectStructureLow.definition.kind).toBe('read');
  });

  it('`--exposition=readonly` 표면에 실제로 뜬다 (게이트 ⓑ가 보는 자리)', async () => {
    const harness = await harnessFor(getObjectStructureLow);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(['GetObjectStructureLow']);
    } finally {
      await harness.close();
    }
  });
});

describe('와이어', () => {
  it('objectstructure로 GET 한 발 — 질의 인자 둘과 Accept가 구 그대로다', async () => {
    const { requests } = await runTool(
      getObjectStructureLow,
      { object_type: 'CLAS/OC', object_name: 'ZCL_FIXTURE' },
      reply(),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toContain(OBJECTSTRUCTURE);
    expect(sent[0]?.url).toContain('objecttype=CLAS%2FOC');
    expect(sent[0]?.url).toContain('objectname=ZCL_FIXTURE');
    expect(sent[0]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.projectexplorer.objectstructure+xml, application/xml',
    );
    expect(sent[0]?.body).toBeUndefined();
  });

  it('⚠ 네임스페이스 이름은 **두 번** 인코딩된다 (구 실측)', async () => {
    // `encodeURIComponent(encodeSapObjectName(name))` — 두 겹이다
    // (`objectStructure.js:38` + `internalUtils.js:19-21`).
    const { requests } = await runTool(
      getObjectStructureLow,
      { object_type: 'CLAS/OC', object_name: '/1CPR/CL_X' },
      reply(),
    );
    const sent = toolRequests(requests)[0];

    expect(sent?.url).toContain('objectname=%252F1CPR%252FCL_X');
    // 타입 쪽은 한 겹뿐이다 — 두 자리의 인코딩 겹수가 다르다.
    expect(sent?.url).toContain('objecttype=CLAS%2FOC');
  });

  it('응답 본문을 손대지 않고 그대로 싣는다', async () => {
    const { outcome } = await runTool(
      getObjectStructureLow,
      { object_type: 'PROG/P', object_name: 'ZPROG' },
      reply('<RAW>본문 그대로</RAW>'),
    );

    expect(outcome.isError).toBe(false);
    expect(outcome.text).toBe('<RAW>본문 그대로</RAW>');
  });
});

describe('세션 복원 갈래', () => {
  it('session_id와 session_state가 **둘 다** 있어야 stateful로 나간다', async () => {
    const { requests } = await runTool(
      getObjectStructureLow,
      {
        object_type: 'PROG/P',
        object_name: 'ZPROG',
        session_id: 'abc123',
        session_state: { cookies: 'x' },
      },
      reply(),
    );

    expect(toolRequests(requests)[0]?.headers['x-sap-adt-sessiontype']).toBe('stateful');
  });

  it('session_id만 주면 복원하지 않는다 (구의 `&&`)', async () => {
    const { requests } = await runTool(
      getObjectStructureLow,
      { object_type: 'PROG/P', object_name: 'ZPROG', session_id: 'abc123' },
      reply(),
    );

    expect(toolRequests(requests)[0]?.headers['x-sap-adt-sessiontype']).toBeUndefined();
  });

  it('둘 다 없으면 stateless 그대로다', async () => {
    const { requests } = await runTool(
      getObjectStructureLow,
      { object_type: 'PROG/P', object_name: 'ZPROG' },
      reply(),
    );

    expect(toolRequests(requests)[0]?.headers['x-sap-adt-sessiontype']).toBeUndefined();
  });
});

describe('갈래', () => {
  it.each([
    ['object_type', { object_type: '', object_name: 'ZPROG' }, 'object_type is required'],
    ['object_name', { object_type: 'PROG/P', object_name: '' }, 'object_name is required'],
  ])('빈 %s는 접속 전에 거절한다 — 요청 0건', async (_label, args, message) => {
    const { outcome, requests } = await runTool(getObjectStructureLow, args, reply());

    expect(outcome.isError).toBe(true);
    // 겉 핸들러의 문구가 도달한다 — 벤더의 `Object type is required`가 아니다.
    expect(outcome.text).toBe(`Error: ${message}`);
    expect(requests).toHaveLength(0);
  });

  it('ADT가 거절하면 `Error: ` 접두사를 단 오류로 접는다', async () => {
    const { outcome } = await runTool(
      getObjectStructureLow,
      { object_type: 'PROG/P', object_name: 'ZPROG' },
      () => ({ status: 404, body: 'not found' }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
