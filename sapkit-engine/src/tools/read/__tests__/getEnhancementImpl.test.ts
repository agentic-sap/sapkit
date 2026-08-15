/**
 * `GetEnhancementImpl` — 발행 계약 · 와이어 · 소스 꺼내기 · 폴백 · 갈래.
 *
 * 파일 이름은 규약이다: `<모듈 디렉터리>/__tests__/<도구 이름의 소문자시작형>.test.ts`.
 *
 * 요구 급이 **계약 시험**이라 재생 대조가 뒤를 받쳐 주지 않는다. 기대값은 전부
 * 구 엔진의 실측에서 뽑았다 —
 * `engine/src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts` ·
 * `engine/src/lib/utils.ts:902-958` ·
 * `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-219`.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { DEFAULT_ACCEPT } from '../../../adt';
import { getEnhancementImpl } from '../getEnhancementImpl';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

const SPOT = 'ZENH_SPOT';
const NAME = 'ZIMPL_ONE';
const ARGS = { enhancement_spot: SPOT, enhancement_name: NAME };
const SOURCE_PATH = `/sap/bc/adt/enhancements/${SPOT}/${NAME}/source/main`;
const SPOT_FALLBACK_PATH = `/sap/bc/adt/enhancements/${SPOT}`;

const ABAP = "WRITE: / 'hello enhancement'.";
const sourceXml = (payload: string): string =>
  `<enh:objectReference xmlns:enh="http://www.sap.com/adt/enhancements"><enh:source>${payload}</enh:source></enh:objectReference>`;

afterEach(() => {
  cleanupTempDirs();
});

async function call(
  args: Record<string, unknown>,
  reply: Parameters<typeof runTool>[2],
): Promise<{ text: string; isError: boolean; sent: ReturnType<typeof toolRequests> }> {
  const { outcome, requests } = await runTool(getEnhancementImpl, args, reply);
  return { text: outcome.text, isError: outcome.isError, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getEnhancementImpl);
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
      }).toEqual(publishedDeclaration('GetEnhancementImpl'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(getEnhancementImpl.definition.sets).toEqual(['readonly']);
    expect(getEnhancementImpl.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getEnhancementImpl.definition.kind).toBe('read');
  });

  it('인자가 둘이고 둘 다 필수다 — 이 묶음에서 유일하게 스팟+이름을 함께 받는다', async () => {
    const harness = await harnessFor(getEnhancementImpl);
    try {
      const schema = (await harness.client.listTools()).tools[0]?.inputSchema as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(Object.keys(schema.properties).sort()).toEqual([
        'enhancement_name',
        'enhancement_spot',
      ]);
      expect(schema.required.sort()).toEqual(['enhancement_name', 'enhancement_spot']);
    } finally {
      await harness.close();
    }
  });
});

describe('와이어', () => {
  it('본선은 스팟/이름/source/main 하나뿐이다', async () => {
    const { sent } = await call(ARGS, () => ({ body: '<x/>' }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(`http://127.0.0.1:1${SOURCE_PATH}`);
  });

  it('두 이름 모두 encodeURIComponent 한 겹으로 인코딩한다', async () => {
    const { sent } = await call(
      { enhancement_spot: '/NS/ZSPOT', enhancement_name: 'Z IMPL' },
      () => ({ body: '<x/>' }),
    );

    expect(sent[0]?.url).toBe(
      'http://127.0.0.1:1/sap/bc/adt/enhancements/%2FNS%2FZSPOT/Z%20IMPL/source/main',
    );
  });

  it('D76 — 본선은 Accept를 지정하지 않으므로 접속 계층 기본값이 나간다', async () => {
    const { sent } = await call(ARGS, () => ({ body: '<x/>' }));

    expect(sent[0]?.headers['Accept']).toBe(DEFAULT_ACCEPT);
    expect(sent[0]?.body).toBeUndefined();
  });

  it('D76 — 폴백도 vnd Accept 없이, 본문 없이 나간다', async () => {
    // 구는 폴백 호출에 `{ Accept: 'application/vnd.sap.adt.enhancements.v1+xml' }`를
    // 넘기지만 그 자리는 다섯째 인자 `data`다(`engine/src/lib/utils.ts:902-910`).
    const { sent } = await call(ARGS, (request) =>
      request.url.endsWith('/source/main')
        ? { status: 200, body: '' }
        : { status: 200, body: '<spot/>' },
    );

    expect(sent).toHaveLength(2);
    expect(sent[1]?.headers['Accept']).toBe(DEFAULT_ACCEPT);
    expect(sent[1]?.headers['Accept']).not.toContain('vnd.sap.adt.enhancements');
    expect(sent[1]?.body).toBeUndefined();
  });

  it('폴백 주소에는 `enhsxsb`가 없다 — GetEnhancementSpot이 무는 주소와 다르다', async () => {
    const { sent } = await call(ARGS, (request) =>
      request.url.endsWith('/source/main')
        ? { status: 200, body: '' }
        : { status: 200, body: '<spot/>' },
    );

    expect(sent[1]?.url).toBe(`http://127.0.0.1:1${SPOT_FALLBACK_PATH}`);
    expect(sent[1]?.url).not.toContain('enhsxsb');
  });

  it('GET이라 CSRF 토큰 왕복이 없다', async () => {
    const { requests } = await runTool(getEnhancementImpl, ARGS, () => ({ body: '<x/>' }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers['x-csrf-token']).toBeUndefined();
  });
});

describe('소스 꺼내기 — 구 parseEnhancementSourceFromXml을 글자대로', () => {
  it('enh:source의 base64를 디코드해 source_code에 싣는다', async () => {
    const { text, isError } = await call(ARGS, () => ({
      body: sourceXml(Buffer.from(ABAP, 'utf-8').toString('base64')),
    }));

    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({
      enhancement_spot: SPOT,
      enhancement_name: NAME,
      source_code: ABAP,
    });
  });

  it('CDATA 형태면 디코드 없이 그대로 싣는다', async () => {
    const body = `<enh:objectReference><enh:source><![CDATA[${ABAP}\nMORE.]]></enh:source></enh:objectReference>`;

    const { text } = await call(ARGS, () => ({ body }));

    expect(JSON.parse(text).source_code).toBe(`${ABAP}\nMORE.`);
  });

  it('네임스페이스 없는 <source>도 같은 자리로 잡는다', async () => {
    const { text } = await call(ARGS, () => ({
      body: `<root><source>${Buffer.from('X.', 'utf-8').toString('base64')}</source></root>`,
    }));

    expect(JSON.parse(text).source_code).toBe('X.');
  });

  it('소스 태그를 못 찾으면 원문 XML을 통째로 돌려준다 (구의 마지막 폴백)', async () => {
    const body = '<enh:objectReference><enh:other>nope</enh:other></enh:objectReference>';

    const { text, isError } = await call(ARGS, () => ({ body }));

    expect(isError).toBe(false);
    expect(JSON.parse(text).source_code).toBe(body);
  });

  it('빈 <enh:source>는 base64 갈래를 태우지 않아 원문으로 물러난다', async () => {
    // 구의 `if (base64Match?.[1])`는 빈 포획에서 거짓이고, CDATA도 없으므로
    // 마지막 폴백(원문)에 닿는다.
    const body = sourceXml('');

    const { text } = await call(ARGS, () => ({ body }));

    expect(JSON.parse(text).source_code).toBe(body);
  });
});

describe('폴백 — 구의 주석과 달리 200-빈본문일 때만 돈다', () => {
  it('본선이 200-빈본문이면 스팟을 한 번 더 물어 not_found를 낸다', async () => {
    const { text, isError, sent } = await call(ARGS, (request) =>
      request.url.endsWith('/source/main')
        ? { status: 200, body: '' }
        : { status: 200, body: '<spot><adtcore:description>A spot</adtcore:description></spot>' },
    );

    expect(isError).toBe(false);
    expect(sent).toHaveLength(2);
    expect(JSON.parse(text)).toEqual({
      enhancement_spot: SPOT,
      enhancement_name: NAME,
      status: 'not_found',
      message: `Enhancement implementation ${NAME} not found in spot ${SPOT}.`,
      spot_metadata: { description: 'A spot' },
    });
  });

  it('진짜 404는 폴백에 닿지 못한다 — 요청은 하나뿐이고 오류가 된다', async () => {
    // 구의 접속 계층(axios)도 신의 AdtClient도 4xx에서 던진다
    // (`src/adt/client.ts:296`). 폴백은 그 뒤에 있어 실행되지 않는다.
    const { text, isError, sent } = await call(ARGS, () => ({ status: 404, body: 'not found' }));

    expect(isError).toBe(true);
    expect(text).toMatch(/^ADT error: /);
    expect(sent).toHaveLength(1);
    expect(text).not.toContain('not_found');
  });

  it('스팟 설명은 원소 형태만 본다 — 속성 형태는 빈 spot_metadata다 (구의 성질)', async () => {
    const { text } = await call(ARGS, (request) =>
      request.url.endsWith('/source/main')
        ? { status: 200, body: '' }
        : { status: 200, body: '<spot adtcore:description="A spot"/>' },
    );

    expect(JSON.parse(text).spot_metadata).toEqual({});
  });

  it('폴백까지 본문이 비면 두 상태를 함께 실은 문장으로 던진다', async () => {
    const { text, isError, sent } = await call(ARGS, () => ({ status: 200, body: '' }));

    expect(isError).toBe(true);
    expect(sent).toHaveLength(2);
    expect(text).toBe(
      `ADT error: Error: Failed to retrieve enhancement ${NAME} from spot ${SPOT}. Status: 200. ` +
        'Fallback to retrieve spot metadata also failed. Status: 200',
    );
  });
});

describe('갈래', () => {
  it.each([
    ['enhancement_spot', { ...ARGS, enhancement_spot: '' }, 'Enhancement spot is required'],
    ['enhancement_name', { ...ARGS, enhancement_name: '' }, 'Enhancement name is required'],
  ])('빈 %s는 SAP에 한 바이트도 나가기 전에 거절된다', async (_argument, args, message) => {
    const { text, isError, sent } = await call(args, () => ({ body: '<x/>' }));

    expect(isError).toBe(true);
    expect(text).toBe(`ADT error: Error: ${message}`);
    expect(sent).toHaveLength(0);
  });

  it('둘 다 비면 스팟 쪽 문장이 먼저다 (구의 검사 순서)', async () => {
    const { text } = await call({ enhancement_spot: '', enhancement_name: '' }, () => ({
      body: '<x/>',
    }));

    expect(text).toBe('ADT error: Error: Enhancement spot is required');
  });
});
