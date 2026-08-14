/**
 * `ValidateServiceBinding` — 발행 계약 · 와이어 · **`kind` 판정** · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.ValidateServiceBinding`
 *  - 흐름: `engine/src/handlers/service_binding/high/handleValidateServiceBinding.ts:47-91`
 *  - 주소·메서드·Accept·질의 인자 이름:
 *    `@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:446-462`
 *  - `kind` 판정의 정본: `engine/src/lib/readonlyGuard.ts:36-54`(`READ_PREFIXES`에
 *    `'Validate'`) · `:73`(`READ_TOOLS`에 `HandlerServiceBindingValidate`)
 */

import { validateServiceBinding } from '../validateServiceBinding';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const ACCEPT = 'application/vnd.sap.adt.businessservices.servicebinding.v2+xml';

const VALIDATION_XML =
  '<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" srvb:valid="true"/>';

const ARGS = {
  service_binding_name: 'ZUI_MY_BINDING',
  service_definition_name: 'ZSRVD_DEMO',
} as const;

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  service_binding_name: string;
  status: number;
  payload: unknown;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(validateServiceBinding);
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
      }).toEqual(publishedDeclaration('ValidateServiceBinding'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    expect(validateServiceBinding.definition.sets).toEqual(['high']);
    expect(validateServiceBinding.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(validateServiceBinding.definition.targetNames).toEqual(['service_binding_name']);
  });
});

// ── kind 판정 ───────────────────────────────────────────────────────────────

describe('kind 판정 — SAP 상태를 바꾸지 않는다', () => {
  it('`read`다 — 구 안전 게이트의 `Validate` 접두어 규칙과 같은 자리', () => {
    // `readonlyGuard.ts:42-54`의 READ_PREFIXES가 'Validate'를 담고, 그 주석이
    // "Check*/Validate*는 ADT 검사 실행이며 절대 변경을 남기지 않는다"고 적는다.
    // 같은 파일 :73의 READ_TOOLS에도 HandlerServiceBindingValidate가 있다.
    expect(validateServiceBinding.definition.kind).toBe('read');
  });

  it('**메서드가 GET이다** — 상태를 바꿀 통로가 없다 (판정의 결정적 근거)', async () => {
    const { requests } = await runTool(validateServiceBinding, { ...ARGS }, () => ({
      body: VALIDATION_XML,
    }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    // 본문이 없다 — 실어 보낼 변경분 자체가 없다.
    expect(requests[0]?.body).toBeUndefined();
  });

  it('`mutation`이었다면 필요했을 CSRF 왕복이 아예 없다', async () => {
    // 접속 계층은 상태 변경 메서드에만 토큰을 미리 긁어온다. 그 왕복이 없다는
    // 것이 이 도구가 쓰기 경로를 타지 않는다는 또 하나의 증거다.
    const { requests } = await runTool(validateServiceBinding, { ...ARGS }, () => ({
      body: VALIDATION_XML,
    }));

    expect(requests.some((request) => request.url.includes('/discovery'))).toBe(false);
  });
});

// ── 와이어 ──────────────────────────────────────────────────────────────────

describe('와이어', () => {
  it('질의 인자의 **이름이 발행 인자와 다르다**', async () => {
    const { requests } = await runTool(
      validateServiceBinding,
      {
        service_binding_name: '  zui_my_binding ',
        service_definition_name: ' zsrvd_demo ',
        package_name: ' zok_lab ',
        description: '  demo binding  ',
        service_binding_version: ' 1.0 ',
      },
      () => ({ body: VALIDATION_XML }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/validation` +
        '?objname=ZUI_MY_BINDING' +
        '&serviceDefinition=ZSRVD_DEMO' +
        '&serviceBindingVersion=1.0' +
        '&description=demo%20binding' +
        '&package=ZOK_LAB',
    );
    expect(requests[0]?.headers['Accept']).toBe(ACCEPT);
  });

  it('선택 인자가 없으면 그 질의 인자는 주소에서 아예 빠진다', async () => {
    const { requests } = await runTool(validateServiceBinding, { ...ARGS }, () => ({
      body: VALIDATION_XML,
    }));

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/validation` +
        '?objname=ZUI_MY_BINDING&serviceDefinition=ZSRVD_DEMO',
    );
  });

  it('공백만 든 선택 인자도 빠진다 (구의 `?.trim() || undefined`)', async () => {
    const { requests } = await runTool(
      validateServiceBinding,
      { ...ARGS, package_name: '   ', description: '  ', service_binding_version: ' ' },
      () => ({ body: VALIDATION_XML }),
    );

    expect(requests[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/businessservices/bindings/validation` +
        '?objname=ZUI_MY_BINDING&serviceDefinition=ZSRVD_DEMO',
    );
  });
});

// ── 응답 조립 ───────────────────────────────────────────────────────────────

describe('응답 조립', () => {
  it('형식을 고를 통로가 없다 — 언제나 xml로 접는다', async () => {
    const { outcome } = await runTool(validateServiceBinding, { ...ARGS }, () => ({
      body: VALIDATION_XML,
    }));

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload).toEqual({
      success: true,
      service_binding_name: 'ZUI_MY_BINDING',
      status: 200,
      payload: {
        'srvb:serviceBinding': {
          'xmlns:srvb': 'http://www.sap.com/adt/ddic/ServiceBindings',
          'srvb:valid': 'true',
        },
      },
    });
    // `response_format` 인자가 아예 없다.
    expect(Object.keys(validateServiceBinding.definition.inputSchema)).not.toContain(
      'response_format',
    );
  });
});

// ── 갈래 ────────────────────────────────────────────────────────────────────

describe('갈래', () => {
  // 둘 다 발행 스키마에서 **필수**라, 인자가 아예 없으면 SDK의 스키마 검증이
  // 핸들러에 닿기 전에 막는다. 핸들러 자신의 가드가 실제로 걸리는 것은 스키마는
  // 통과하지만 값이 빈 문자열일 때다 — 구도 같은 구조였다.
  it('빈 문자열은 핸들러 가드가 잡아 요청을 보내기 전에 거부한다', async () => {
    const emptyName = await runTool(
      validateServiceBinding,
      { service_binding_name: '', service_definition_name: 'ZSRVD_DEMO' },
      () => ({ body: VALIDATION_XML }),
    );
    expect(emptyName.outcome.isError).toBe(true);
    expect(emptyName.outcome.text).toBe('Error: service_binding_name is required');
    expect(emptyName.requests).toHaveLength(0);

    const emptyDefinition = await runTool(
      validateServiceBinding,
      { service_binding_name: 'ZUI_MY_BINDING', service_definition_name: '' },
      () => ({ body: VALIDATION_XML }),
    );
    expect(emptyDefinition.outcome.isError).toBe(true);
    expect(emptyDefinition.outcome.text).toBe('Error: service_definition_name is required');
    expect(emptyDefinition.requests).toHaveLength(0);
  });

  it('인자가 아예 없으면 **스키마 검증**이 핸들러 앞에서 막는다', async () => {
    const { outcome, requests } = await runTool(
      validateServiceBinding,
      { service_definition_name: 'ZSRVD_DEMO' },
      () => ({ body: VALIDATION_XML }),
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain('service_binding_name');
    expect(requests).toHaveLength(0);
  });

  it('HTTP 실패는 오류로 올라간다', async () => {
    const { outcome } = await runTool(validateServiceBinding, { ...ARGS }, () => ({
      status: 400,
      body: '<bad/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text.startsWith('Error: ')).toBe(true);
  });
});
