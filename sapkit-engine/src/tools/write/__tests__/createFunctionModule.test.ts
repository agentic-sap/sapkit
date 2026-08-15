/**
 * `CreateFunctionModule` — 발행 계약 · 노출 선언 · 와이어 · 오류 갈래.
 *
 * 기대값의 출처는 구 엔진이다:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 요청 둘의 주소·질의 인자·헤더·본문 →
 *    `@babamba2/mcp-abap-adt-clients/dist/core/functionModule/validation.js:47-70`
 *    와 같은 패키지 `core/functionModule/create.js:12-45`
 *  - 오류 문구 → `engine/src/handlers/function/high/handleCreateFunctionModule.ts:111-155`
 *
 * 못 박는 자리 셋(읽지 않으면 반드시 틀린다):
 *  ⑴ 검증 응답을 **읽지 않는다** — `SEVERITY=ERROR`가 와도 생성이 진행된다.
 *  ⑵ 설명의 60자 제한이 **생성 페이로드에만** 걸린다(검증 질의 인자는 원문).
 *  ⑶ URL의 그룹 이름은 소문자, 페이로드의 이름들은 대문자 — 한 요청 안에서 갈린다.
 */

import { createFunctionModule } from '../createFunctionModule';
import { invoke, jsonOf, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';
import { cleanupTempDirs, harnessFor, publishedDeclaration } from '../../read/__tests__/support';

const VALIDATION_OK =
  '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><CHECK_RESULT>X</CHECK_RESULT></DATA></asx:values></asx:abap>';
const FM_CREATED = '<fmodule:abapFunctionModule adtcore:name="Z_FM_TEST"/>';

const GROUP_URI = '/sap/bc/adt/functions/groups/zfg_test';
const ARGS = { function_group_name: 'ZFG_TEST', function_module_name: 'Z_FM_TEST' };

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
  cleanupTempDirs();
});

/** 검증·생성 둘 다 성공하는 응답기. */
function happy(): Parameters<typeof startWriteHarness>[0] {
  return (request, response) => {
    if (request.path === '/sap/bc/adt/functions/validation') return xml(response, VALIDATION_OK);
    if (request.path === `${GROUP_URI}/fmodules`) return xml(response, FM_CREATED, 201);
    response.statusCode = 500;
    response.end('예상하지 못한 요청');
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const listing = await harnessFor(createFunctionModule);
    try {
      const listed = await listing.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('CreateFunctionModule'));
    } finally {
      await listing.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/function/high/` → high 집합.
    expect(createFunctionModule.definition.sets).toEqual(['high']);
    expect(createFunctionModule.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(createFunctionModule.definition.kind).toBe('mutation');
    // mutation이므로 대상-이름 선언이 필수다.
    expect(createFunctionModule.definition.targetNames).toEqual([
      'function_module_name',
      'function_group_name',
    ]);
  });
});

describe('와이어', () => {
  it('검증 → 생성 두 번이 나가고, 그 사이에 활성화도 구문검사도 없다', async () => {
    harness = await startWriteHarness(happy());
    const result = await invoke(createFunctionModule, harness, {
      ...ARGS,
      description: 'My module',
      transport_request: 'E19K905635',
    });

    expect(result.isError).toBe(false);
    expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /sap/bc/adt/functions/validation',
      `POST ${GROUP_URI}/fmodules`,
    ]);
  });

  it('검증 요청은 FUGR/FF와 fugrname을 싣는다', async () => {
    harness = await startWriteHarness(happy());
    await invoke(createFunctionModule, harness, { ...ARGS, description: 'My module' });

    const validation = harness.nth(0);
    expect(validation.query.get('objtype')).toBe('FUGR/FF');
    expect(validation.query.get('objname')).toBe('Z_FM_TEST');
    expect(validation.query.get('fugrname')).toBe('ZFG_TEST');
    expect(validation.query.get('description')).toBe('My module');
    expect(validation.headers['accept']).toBe(
      'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.StatusMessage',
    );
  });

  it('생성 요청의 주소는 그룹 소문자, 페이로드의 이름은 대문자다', async () => {
    harness = await startWriteHarness(happy());
    await invoke(createFunctionModule, harness, {
      function_group_name: 'zfg_test',
      function_module_name: 'z_fm_test',
      transport_request: 'E19K905635',
    });

    const create = harness.nth(1);
    expect(create.path).toBe(`${GROUP_URI}/fmodules`);
    expect(create.query.get('corrNr')).toBe('E19K905635');
    expect(create.headers['content-type']).toBe(
      'application/vnd.sap.adt.functions.fmodules+xml',
    );
    expect(create.body).toContain('adtcore:name="Z_FM_TEST"');
    expect(create.body).toContain('adtcore:type="FUGR/FF"');
    expect(create.body).toContain(
      `<adtcore:containerRef adtcore:name="ZFG_TEST" adtcore:type="FUGR/F" adtcore:uri="${GROUP_URI}"/>`,
    );
  });

  it('전송요청이 없으면 corrNr을 아예 붙이지 않는다', async () => {
    harness = await startWriteHarness(happy());
    const result = await invoke(createFunctionModule, harness, ARGS);

    expect(harness.nth(1).query.has('corrNr')).toBe(false);
    // 응답에는 구와 같이 'local'이라고 적는다.
    expect(jsonOf(result).transport_request).toBe('local');
  });

  it('설명이 없으면 모듈 이름을 설명으로 쓴다', async () => {
    harness = await startWriteHarness(happy());
    await invoke(createFunctionModule, harness, ARGS);

    expect(harness.nth(0).query.get('description')).toBe('Z_FM_TEST');
    expect(harness.nth(1).body).toContain('adtcore:description="Z_FM_TEST"');
  });

  it('60자 제한은 생성 페이로드에만 걸린다 — 검증 질의 인자는 원문이다', async () => {
    const long = 'D'.repeat(75);
    harness = await startWriteHarness(happy());
    await invoke(createFunctionModule, harness, { ...ARGS, description: long });

    expect(harness.nth(0).query.get('description')).toBe(long);
    expect(harness.nth(1).body).toContain(`adtcore:description="${'D'.repeat(60)}"`);
  });
});

describe('소유자 속성 — 프로파일의 사용자 이름이 페이로드에 실린다', () => {
  it('SAP_USERNAME이 있으면 adtcore:responsible이 붙는다', async () => {
    harness = await startWriteHarness(happy());
    const context = { ...harness.context, env: { SAP_USERNAME: 'DEVUSER' } };
    await createFunctionModule.handler(context, ARGS);

    expect(harness.nth(1).body).toContain('adtcore:responsible="DEVUSER"');
    expect(harness.nth(1).body).not.toContain('adtcore:masterSystem');
  });

  it('SAP_MASTER_SYSTEM도 있으면 둘 다, masterSystem이 앞이다', async () => {
    harness = await startWriteHarness(happy());
    const context = {
      ...harness.context,
      env: { SAP_USERNAME: 'DEVUSER', SAP_MASTER_SYSTEM: 'TRL' },
    };
    await createFunctionModule.handler(context, ARGS);

    expect(harness.nth(1).body).toContain(
      'adtcore:type="FUGR/FF" adtcore:masterSystem="TRL" adtcore:responsible="DEVUSER"',
    );
  });

  it('빈 사용자 이름은 붙이지 않는다 (구 주석: Kerberos 오류를 부른다)', async () => {
    harness = await startWriteHarness(happy());
    const context = { ...harness.context, env: { SAP_USERNAME: '   ' } };
    await createFunctionModule.handler(context, ARGS);

    expect(harness.nth(1).body).not.toContain('adtcore:responsible');
  });
});

describe('검증 응답은 읽지 않는다 (구와 같다)', () => {
  it('SEVERITY=ERROR가 와도 생성으로 넘어간다', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/functions/validation') {
        return xml(
          response,
          '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>ERROR</SEVERITY><SHORT_TEXT>이미 있다</SHORT_TEXT></DATA></asx:values></asx:abap>',
        );
      }
      if (request.path === `${GROUP_URI}/fmodules`) return xml(response, FM_CREATED, 201);
      response.statusCode = 500;
      response.end('예상하지 못한 요청');
    });

    const result = await invoke(createFunctionModule, harness, ARGS);

    expect(result.isError).toBe(false);
    expect(harness.calls()).toHaveLength(2);
  });

  it('검증이 HTTP 오류면 거기서 멈춘다 — 생성은 나가지 않는다', async () => {
    harness = await startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/functions/validation') {
        return xml(response, '<error/>', 500);
      }
      response.statusCode = 500;
      response.end('예상하지 못한 요청');
    });

    const result = await invoke(createFunctionModule, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(harness.calls().map((call) => call.path)).toEqual([
      '/sap/bc/adt/functions/validation',
    ]);
  });
});

describe('오류 갈래 — 상태 코드마다 문구가 다르다', () => {
  const withCreateStatus = (status: number) =>
    startWriteHarness((request, response) => {
      if (request.path === '/sap/bc/adt/functions/validation') return xml(response, VALIDATION_OK);
      return xml(response, '<error/>', status);
    });

  it('409는 이미 있다는 문구다', async () => {
    harness = await withCreateStatus(409);
    const result = await invoke(createFunctionModule, harness, ARGS);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Error: Function module Z_FM_TEST already exists in group ZFG_TEST. Please delete it first or use a different name.',
    );
  });

  it('404는 함수그룹이 없다는 문구다', async () => {
    harness = await withCreateStatus(404);
    const result = await invoke(createFunctionModule, harness, ARGS);

    expect(textOf(result)).toBe(
      'Error: Function group ZFG_TEST not found. Create the function group first.',
    );
  });

  it('400은 고정 문구다 (SAP 본문을 싣지 않는다 — 구와 같다)', async () => {
    harness = await withCreateStatus(400);
    const result = await invoke(createFunctionModule, harness, ARGS);

    expect(textOf(result)).toBe(
      'Error: Bad request. Check if function module name is valid and function group exists.',
    );
  });

  it('그 밖의 상태는 원인을 달고 나온다', async () => {
    harness = await withCreateStatus(500);
    const result = await invoke(createFunctionModule, harness, ARGS);

    expect(textOf(result).startsWith('Error: Failed to create function module Z_FM_TEST: ')).toBe(
      true,
    );
  });

  it('빈 인자는 접속을 만들기 전에 거절한다', async () => {
    harness = await startWriteHarness(happy());
    const noGroup = await invoke(createFunctionModule, harness, {
      function_group_name: '',
      function_module_name: 'Z_FM_TEST',
    });
    const noModule = await invoke(createFunctionModule, harness, {
      function_group_name: 'ZFG_TEST',
      function_module_name: '',
    });

    expect(textOf(noGroup)).toBe('Error: function_group_name is required');
    expect(textOf(noModule)).toBe('Error: function_module_name is required');
    expect(harness.calls()).toEqual([]);
  });
});
