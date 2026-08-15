/**
 * `GetEnhancements` — 발행 계약 · 종류 판별 왕복 · 와이어 · 이름/종류 규칙 ·
 * 축약 · 선언 밖 인자 · 갈래.
 *
 * 파일 이름은 규약이다: `<모듈 디렉터리>/__tests__/<도구 이름의 소문자시작형>.test.ts`.
 *
 * 요구 급이 **계약 시험**이라 재생 대조가 뒤를 받쳐 주지 않는다. 기대값은 전부
 * 구 엔진의 실측에서 뽑았다 —
 * `engine/src/handlers/enhancement/readonly/handleGetEnhancements.ts` ·
 * `engine/src/lib/utils.ts:902-958` ·
 * `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-219` ·
 * 그리고 인자 파싱은 `@modelcontextprotocol/sdk/dist/cjs/server/zod-compat.js:49-60`.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { DEFAULT_ACCEPT } from '../../../adt';
import { getEnhancements } from '../getEnhancements';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

const NAME = 'ZTEST_OBJ';
const ARGS = { object_name: NAME, object_type: 'program' };

const CLASS_PROBE = `/sap/bc/adt/oo/classes/${NAME}`;
const PROGRAM_PROBE = `/sap/bc/adt/programs/programs/${NAME}`;
const INCLUDE_PROBE = `/sap/bc/adt/programs/includes/${NAME}`;
const ELEMENTS = '/source/main/enhancements/elements';

const CONTEXT_URI = '/sap/bc/adt/programs/programs/ZPARENT';
const INCLUDE_META = `<include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes"><include:contextRef adtcore:uri="${CONTEXT_URI}"/></include:abapInclude>`;

/** 인핸스먼트 표 한 벌. base64 소스를 실은 항목 `count`개. */
function elementsXml(sources: readonly string[], nameAttribute = 'adtcore:name="ZENH_A"'): string {
  const items = sources
    .map(
      (source) =>
        `<enh:enhancement ${nameAttribute} adtcore:type="ENHO/XHH"><enh:source>${Buffer.from(
          source,
          'utf-8',
        ).toString('base64')}</enh:source></enh:enhancement>`,
    )
    .join('');
  return `<enh:elements xmlns:enh="http://www.sap.com/adt/enhancements" xmlns:adtcore="http://www.sap.com/adt/core">${items}</enh:elements>`;
}

/** 종류 판별 세 왕복 중 「프로그램」에서 멈추게 하는 응답기. */
const asProgram =
  (elements: string) =>
  (request: { url: string }): { status?: number; body?: string } => {
    if (request.url.includes(CLASS_PROBE)) return { status: 404, body: 'no class' };
    if (request.url.includes(`${PROGRAM_PROBE}${ELEMENTS}`)) return { status: 200, body: elements };
    if (request.url.includes(PROGRAM_PROBE)) return { status: 200, body: '<program/>' };
    return { status: 404, body: 'unexpected' };
  };

afterEach(() => {
  cleanupTempDirs();
});

async function call(
  args: Record<string, unknown>,
  reply: Parameters<typeof runTool>[2],
): Promise<{ text: string; isError: boolean; sent: ReturnType<typeof toolRequests> }> {
  const { outcome, requests } = await runTool(getEnhancements, args, reply);
  return { text: outcome.text, isError: outcome.isError, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getEnhancements);
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
      }).toEqual(publishedDeclaration('GetEnhancements'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(getEnhancements.definition.sets).toEqual(['readonly']);
    expect(getEnhancements.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getEnhancements.definition.kind).toBe('read');
  });
});

describe('종류 판별 — 이 묶음에서 이 도구만 하는 일', () => {
  it('클래스 → 프로그램 → 인클루드 순으로 묻고, 맞는 자리에서 멈춘다', async () => {
    const { sent } = await call(ARGS, asProgram(elementsXml([])));

    // 클래스(404) → 프로그램(200) → 본 요청. 인클루드는 묻지 않는다.
    expect(sent.map((request) => request.url.replace('http://127.0.0.1:1', ''))).toEqual([
      CLASS_PROBE,
      PROGRAM_PROBE,
      `${PROGRAM_PROBE}${ELEMENTS}`,
    ]);
  });

  it('클래스면 첫 왕복에서 멈춘다 — 왕복 둘', async () => {
    const { text, sent } = await call(ARGS, (request) =>
      request.url.includes(`${CLASS_PROBE}${ELEMENTS}`)
        ? { status: 200, body: elementsXml([]) }
        : { status: 200, body: '<class/>' },
    );

    expect(sent.map((request) => request.url.replace('http://127.0.0.1:1', ''))).toEqual([
      CLASS_PROBE,
      `${CLASS_PROBE}${ELEMENTS}`,
    ]);
    expect(JSON.parse(text).object_type).toBe('class');
  });

  it('인클루드면 왕복 셋을 다 돌고 ?context=가 붙는다', async () => {
    const { text, sent } = await call(ARGS, (request) => {
      if (request.url.includes(`${INCLUDE_PROBE}${ELEMENTS}`)) {
        return { status: 200, body: elementsXml([]) };
      }
      if (request.url.includes(INCLUDE_PROBE)) return { status: 200, body: INCLUDE_META };
      return { status: 404, body: 'no' };
    });

    expect(sent).toHaveLength(4);
    expect(sent[3]?.url).toBe(
      `http://127.0.0.1:1${INCLUDE_PROBE}${ELEMENTS}?context=${encodeURIComponent(CONTEXT_URI)}`,
    );
    const payload = JSON.parse(text);
    expect(payload.object_type).toBe('include');
    expect(payload.context).toBe(CONTEXT_URI);
  });

  it('프로그램·클래스에는 context 키 자체가 없다', async () => {
    const { text } = await call(ARGS, asProgram(elementsXml([])));

    const payload = JSON.parse(text);
    expect(payload.object_type).toBe('program');
    expect('context' in payload).toBe(false);
  });

  it('object_type 인자는 받지만 쓰지 않는다 — 종류는 왕복이 정한다', async () => {
    // 인자로 'class'라고 말해도 프로그램 왕복이 200이면 결과는 program이다.
    const { text, sent } = await call(
      { object_name: NAME, object_type: 'class' },
      asProgram(elementsXml([])),
    );

    expect(JSON.parse(text).object_type).toBe('program');
    // 그리고 인자를 믿었다면 건너뛰었을 클래스 왕복을 그대로 보낸다.
    expect(sent[0]?.url).toContain(CLASS_PROBE);
  });
});

describe('와이어', () => {
  it('판별 왕복 셋은 짧은 타임아웃 이름(csrf)을 쓰지만 토큰 왕복은 없다', async () => {
    // 구의 넷째 인자 `'csrf'`는 타임아웃 선택자이지 CSRF 지시가 아니다
    // (`engine/src/lib/utils.ts:906-911`). GET이라 토큰을 긁지 않는다.
    const { requests } = await runTool(getEnhancements, ARGS, asProgram(elementsXml([])));

    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.method).toBe('GET');
      expect(request.headers['x-csrf-token']).toBeUndefined();
    }
  });

  it('D76 — 판별 왕복의 vnd Accept는 와이어에 나가지 않고 본문도 없다', async () => {
    // 구는 클래스/프로그램/인클루드 왕복마다 `{ Accept: 'application/vnd.sap.adt.…' }`를
    // 넘기지만 그 자리는 다섯째 인자 `data`다(`engine/src/lib/utils.ts:902-910`).
    const { sent } = await call(ARGS, asProgram(elementsXml([])));

    for (const request of sent) {
      expect(request.headers['Accept']).toBe(DEFAULT_ACCEPT);
      expect(request.body).toBeUndefined();
      expect(request.headers['Content-Type']).toBeUndefined();
    }
    expect(sent[0]?.headers['Accept']).not.toContain('vnd.sap.adt.oo.classes');
    expect(sent[1]?.headers['Accept']).not.toContain('vnd.sap.adt.programs');
  });

  it('오브젝트 이름은 encodeURIComponent 한 겹이다', async () => {
    const { sent } = await call({ object_name: '/NS/ZP', object_type: 'program' }, () => ({
      status: 404,
      body: 'no',
    }));

    expect(sent[0]?.url).toBe('http://127.0.0.1:1/sap/bc/adt/oo/classes/%2FNS%2FZP');
  });
});

describe('이름·종류 규칙 — 구 정규식의 성질을 그대로', () => {
  it('종류는 언제나 enhancement다 (구의 type 후보 셋은 앵커 때문에 발화하지 않는다)', async () => {
    // XML에 `adtcore:type="ENHO/XHH"`가 버젓이 있어도 잡히지 않는다.
    const { text } = await call(ARGS, asProgram(elementsXml(['A.'])));

    expect(JSON.parse(text).enhancements[0].type).toBe('enhancement');
  });

  it('항목이 여럿이어도 이름은 전부 첫 매치 하나다 (후보 ④에 앵커가 없다)', async () => {
    const xml = [
      '<enh:elements xmlns:enh="http://www.sap.com/adt/enhancements">',
      '<enh:enhancement adtcore:name="ZFIRST"><enh:source>QS4=</enh:source></enh:enhancement>',
      '<enh:enhancement adtcore:name="ZSECOND"><enh:source>Qi4=</enh:source></enh:enhancement>',
      '</enh:elements>',
    ].join('');

    const { text } = await call(ARGS, asProgram(xml));

    const enhancements = JSON.parse(text).enhancements;
    expect(enhancements.map((item: { name: string }) => item.name)).toEqual(['ZFIRST', 'ZFIRST']);
    // 소스는 항목마다 제대로 갈린다 — 이름만 뭉개진다.
    expect(enhancements.map((item: { sourceCode: string }) => item.sourceCode)).toEqual([
      'A.',
      'B.',
    ]);
  });

  it('이름을 붙일 태그가 없으면 enhancement_1, enhancement_2 … 로 매긴다', async () => {
    const xml = [
      '<root>',
      '<item><enh:source>QS4=</enh:source></item>',
      '<item><enh:source>Qi4=</enh:source></item>',
      '</root>',
    ].join('');

    const { text } = await call(ARGS, asProgram(xml));

    expect(JSON.parse(text).enhancements.map((item: { name: string }) => item.name)).toEqual([
      'enhancement_1',
      'enhancement_2',
    ]);
  });

  it('빈 <enh:source>는 sourceCode 키 없이 항목만 남는다', async () => {
    const xml = '<root><enh:source></enh:source></root>';

    const { text } = await call(ARGS, asProgram(xml));

    expect(JSON.parse(text).enhancements).toEqual([{ name: 'enhancement_1', type: 'enhancement' }]);
  });

  it('소스가 하나도 없으면 빈 표에 total_enhancements 0이다', async () => {
    const { text, isError } = await call(ARGS, asProgram(elementsXml([])));

    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({
      object_name: NAME,
      object_type: 'program',
      detailed: false,
      total_enhancements: 0,
      enhancements: [],
    });
  });
});

describe('축약 — detailed가 닿지 않으므로 이 모양뿐이다', () => {
  it('500자 이하 소스는 통째로 싣는다', async () => {
    const source = 'X'.repeat(500);

    const { text } = await call(ARGS, asProgram(elementsXml([source])));

    expect(JSON.parse(text).enhancements[0].sourceCode).toBe(source);
  });

  it('501자부터는 앞 200자 + ...[truncated]로 자른다', async () => {
    const source = 'Y'.repeat(501);

    const { text } = await call(ARGS, asProgram(elementsXml([source])));

    expect(JSON.parse(text).enhancements[0].sourceCode).toBe(`${'Y'.repeat(200)}...[truncated]`);
  });

  it('응답에 detailed:false가 언제나 실린다', async () => {
    const { text } = await call(ARGS, asProgram(elementsXml(['A.'])));

    expect(JSON.parse(text).detailed).toBe(false);
  });
});

describe('선언 밖 인자 — 구에서도 핸들러에 닿은 적이 없다', () => {
  it('include_nested·detailed·program을 줘도 SDK가 버려 왕복이 늘지 않는다', async () => {
    const { text, sent } = await call(
      {
        object_name: NAME,
        object_type: 'program',
        include_nested: true,
        detailed: true,
        program: 'ZPARENT',
      },
      asProgram(elementsXml(['A.'])),
    );

    // 중첩 훑기가 돌았다면 노드 구조 왕복이 더 붙었을 것이다.
    expect(sent).toHaveLength(3);
    const payload = JSON.parse(text);
    // detailed:true가 닿았다면 축약이 꺼져 `detailed`가 참이었을 것이다.
    expect(payload.detailed).toBe(false);
    // include_nested가 닿았다면 `objects`/`main_object`가 실렸을 것이다.
    expect('objects' in payload).toBe(false);
    expect('main_object' in payload).toBe(false);
  });
});

describe('갈래', () => {
  it('빈 오브젝트 이름은 SAP에 한 바이트도 나가기 전에 거절된다', async () => {
    const { text, isError, sent } = await call({ object_name: '', object_type: 'program' }, () => ({
      body: '<x/>',
    }));

    expect(isError).toBe(true);
    expect(text).toBe('ADT error: Error: Object name is required');
    expect(sent).toHaveLength(0);
  });

  it('셋 다 못 찾으면 판별 실패 문장을 낸다 (인클루드 왕복의 오류가 실린다)', async () => {
    const { text, isError, sent } = await call(ARGS, () => ({ status: 404, body: 'no' }));

    expect(isError).toBe(true);
    expect(sent).toHaveLength(3);
    expect(text).toMatch(
      new RegExp(`^ADT error: Error: Failed to determine object type for: ${NAME}\\. `),
    );
  });

  it('인클루드인데 contextRef가 없으면 구의 안내 문장을 그대로 낸다', async () => {
    const { text, isError, sent } = await call(ARGS, (request) =>
      request.url.includes(INCLUDE_PROBE)
        ? { status: 200, body: '<include:abapInclude/>' }
        : { status: 404, body: 'no' },
    );

    expect(isError).toBe(true);
    // 본 요청까지 가지 못한다 — 왕복 셋에서 멈춘다.
    expect(sent).toHaveLength(3);
    expect(text).toBe(
      `ADT error: Error: Could not determine parent program context for include: ${NAME}. ` +
        "No contextRef found in metadata. Consider providing the 'program' parameter manually.",
    );
  });

  it('인클루드 왕복이 200이 아닌 2xx면 종류를 못 정했다고 답한다', async () => {
    const { text, isError } = await call(ARGS, (request) =>
      request.url.includes(INCLUDE_PROBE)
        ? { status: 204, body: 'ignored' }
        : { status: 404, body: 'no' },
    );

    expect(isError).toBe(true);
    expect(text).toBe(
      `ADT error: Error: Could not determine object type for: ${NAME}. ` +
        'Object is neither a valid class, program, nor include.',
    );
  });

  it('본 요청이 200-빈본문이면 구와 같은 문장으로 거절한다', async () => {
    const { text, isError } = await call(ARGS, (request) =>
      request.url.includes(`${PROGRAM_PROBE}${ELEMENTS}`)
        ? { status: 200, body: '' }
        : request.url.includes(PROGRAM_PROBE)
          ? { status: 200, body: '<program/>' }
          : { status: 404, body: 'no class' },
    );

    expect(isError).toBe(true);
    expect(text).toBe(
      `ADT error: Error: Failed to retrieve enhancements for ${NAME}. Status: 200`,
    );
  });

  it('본 요청이 404면 `ADT error: ` 접두사를 단 오류로 접는다', async () => {
    const { text, isError } = await call(ARGS, (request) =>
      request.url.includes(`${PROGRAM_PROBE}${ELEMENTS}`)
        ? { status: 404, body: 'gone' }
        : request.url.includes(PROGRAM_PROBE)
          ? { status: 200, body: '<program/>' }
          : { status: 404, body: 'no class' },
    );

    expect(isError).toBe(true);
    expect(text).toMatch(/^ADT error: /);
    expect(text).toContain('404');
  });
});
