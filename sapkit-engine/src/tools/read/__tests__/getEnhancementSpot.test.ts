/**
 * `GetEnhancementSpot` — 발행 계약 · 와이어 · 파싱 · 갈래.
 *
 * 파일 이름은 규약이다: `<모듈 디렉터리>/__tests__/<도구 이름의 소문자시작형>.test.ts`.
 * 이 이름이어야 진척 대장의 계약 열이 이 시험을 그 도구의 증거로 잡는다.
 *
 * 이 묶음은 요구 급이 **계약 시험**이라 재생 대조가 뒤를 받쳐 주지 않는다.
 * 그래서 기대값은 전부 **구 엔진의 실측**에서 뽑았다 — 구 핸들러
 * `engine/src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts`와
 * 그것이 내려가는 `engine/src/lib/utils.ts:902-958` ·
 * `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-219`.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { DEFAULT_ACCEPT } from '../../../adt';
import { getEnhancementSpot } from '../getEnhancementSpot';
import {
  cleanupTempDirs,
  harnessFor,
  publishedDeclaration,
  recordingTransport,
  runTool,
  toolRequests,
} from './support';

const SPOT = 'ZENH_SPOT';
const SPOT_PATH = '/sap/bc/adt/enhancements/enhsxsb/ZENH_SPOT';

afterEach(() => {
  cleanupTempDirs();
});

async function call(
  args: Record<string, unknown>,
  reply: Parameters<typeof runTool>[2],
): Promise<{ text: string; isError: boolean; sent: ReturnType<typeof toolRequests> }> {
  const { outcome, requests } = await runTool(getEnhancementSpot, args, reply);
  return { text: outcome.text, isError: outcome.isError, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getEnhancementSpot);
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
      }).toEqual(publishedDeclaration('GetEnhancementSpot'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/enhancement/readonly/` → readonly 집합.
    // 채록본의 노출 조건 네 곳(connected/noProfile × default/readonly) 전부에 뜬다.
    expect(getEnhancementSpot.definition.sets).toEqual(['readonly']);
    // 구 `handleGetEnhancementSpot.ts:12` — legacy는 없다.
    expect(getEnhancementSpot.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getEnhancementSpot.definition.kind).toBe('read');
  });

  it('인자는 하나뿐이다 — 이 묶음에서 인자 수가 가장 적다', async () => {
    const harness = await harnessFor(getEnhancementSpot);
    try {
      const listed = await harness.client.listTools();
      const schema = listed.tools[0]?.inputSchema as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(Object.keys(schema.properties)).toEqual(['enhancement_spot']);
      expect(schema.required).toEqual(['enhancement_spot']);
    } finally {
      await harness.close();
    }
  });
});

describe('와이어', () => {
  it('스팟 주소에 `enhsxsb` 한 마디가 낀다 (GetEnhancementImpl의 폴백 주소와 다르다)', async () => {
    const { sent } = await call({ enhancement_spot: SPOT }, () => ({ body: '<x/>' }));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(`http://127.0.0.1:1${SPOT_PATH}`);
    // 질의 인자를 붙이지 않는다.
    expect(sent[0]?.url).not.toContain('?');
  });

  it('이름은 encodeURIComponent 한 겹으로 인코딩한다 (구 encodeSapObjectName)', async () => {
    const { sent } = await call({ enhancement_spot: '/NS/ZSPOT X' }, () => ({ body: '<x/>' }));

    expect(sent[0]?.url).toBe(
      'http://127.0.0.1:1/sap/bc/adt/enhancements/enhsxsb/%2FNS%2FZSPOT%20X',
    );
  });

  it('D76 — 구가 소스에 적어 둔 vnd Accept는 와이어에 나가지 않는다', async () => {
    // 구는 `{ Accept: 'application/vnd.sap.adt.enhancements.v1+xml' }`를 넘기지만
    // 그 자리는 다섯째 인자 `data`다(`engine/src/lib/utils.ts:902-910`). 실제로
    // 나간 것은 접속 계층 기본 Accept뿐이다
    // (`AbstractAbapConnection.js:160-165`).
    const { sent } = await call({ enhancement_spot: SPOT }, () => ({ body: '<x/>' }));

    expect(sent[0]?.headers['Accept']).toBe(DEFAULT_ACCEPT);
    expect(sent[0]?.headers['Accept']).not.toContain('vnd.sap.adt.enhancements');
  });

  it('D76 — GET에 본문을 싣지 않는다 (구는 Accept 객체를 본문으로 보냈다)', async () => {
    const { sent } = await call({ enhancement_spot: SPOT }, () => ({ body: '<x/>' }));

    expect(sent[0]?.body).toBeUndefined();
    expect(sent[0]?.headers['Content-Type']).toBeUndefined();
  });

  it('GET이라 CSRF 토큰 왕복도 상태유지 세션 헤더도 붙지 않는다', async () => {
    const { outcome, requests } = await runTool(getEnhancementSpot, { enhancement_spot: SPOT }, () => ({
      body: '<x/>',
    }));

    expect(outcome.isError).toBe(false);
    // 전송이 받은 요청 전체가 하나 — 토큰 왕복이 아예 없다.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers['x-csrf-token']).toBeUndefined();
    expect(requests[0]?.headers['x-sap-adt-sessiontype']).toBeUndefined();
  });
});

describe('파싱 — 구 parseEnhancementSpotMetadata를 글자대로', () => {
  const SPOT_XML = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<enhs:enhancementSpot xmlns:enhs="http://www.sap.com/adt/enhancements"',
    '  xmlns:adtcore="http://www.sap.com/adt/core" xmlns:atom="http://www.w3.org/2005/Atom"',
    '  adtcore:name="ZENH_SPOT" adtcore:type="ENHS/XSB" adtcore:description="A spot">',
    '  <adtcore:packageRef adtcore:name="ZPKG" adtcore:type="DEVC/K"/>',
    '  <enhs:badiDefinition enhs:name="ZBADI_ONE" enhs:shorttext="first badi">',
    '    <enhs:interface adtcore:name="ZIF_BADI_ONE"/>',
    '  </enhs:badiDefinition>',
    '  <enhs:badiDefinition enhs:name="ZBADI_TWO" enhs:shorttext="second badi">',
    '    <enhs:interface adtcore:name="ZIF_BADI_TWO"/>',
    '  </enhs:badiDefinition>',
    '  <atom:link href="./ZENH_SPOT/source/main" rel="http://www.sap.com/adt/relations/source" type="text/plain" title="Source"/>',
    '</enhs:enhancementSpot>',
  ].join('\n');

  it('스팟 이름·설명·종류·패키지를 뽑아 metadata에 담는다', async () => {
    const { text, isError } = await call({ enhancement_spot: SPOT }, () => ({ body: SPOT_XML }));

    expect(isError).toBe(false);
    const payload = JSON.parse(text);
    expect(payload.enhancement_spot).toBe(SPOT);
    expect(payload.metadata.name).toBe('ZENH_SPOT');
    expect(payload.metadata.description).toBe('A spot');
    expect(payload.metadata.type).toBe('ENHS/XSB');
    expect(payload.metadata.package).toBe('ZPKG');
  });

  it('BAdI 정의를 블록마다 하나씩 접는다', async () => {
    const { text } = await call({ enhancement_spot: SPOT }, () => ({ body: SPOT_XML }));

    expect(JSON.parse(text).metadata.badi_definitions).toEqual([
      { name: 'ZBADI_ONE', shorttext: 'first badi', interface: 'ZIF_BADI_ONE' },
      { name: 'ZBADI_TWO', shorttext: 'second badi', interface: 'ZIF_BADI_TWO' },
    ]);
  });

  it('atom:link를 href·rel·type·title 넷으로 접는다', async () => {
    const { text } = await call({ enhancement_spot: SPOT }, () => ({ body: SPOT_XML }));

    expect(JSON.parse(text).metadata.links).toEqual([
      {
        href: './ZENH_SPOT/source/main',
        rel: 'http://www.sap.com/adt/relations/source',
        type: 'text/plain',
        title: 'Source',
      },
    ]);
  });

  it('최상위 interface는 문서 첫 매치라 BAdI 안쪽 값이 올라온다 (구의 성질)', async () => {
    // 루트에 `<enhs:interface>` 선언이 없어도 첫 BAdI의 인터페이스가 실린다.
    const { text } = await call({ enhancement_spot: SPOT }, () => ({ body: SPOT_XML }));

    expect(JSON.parse(text).metadata.interface).toBe('ZIF_BADI_ONE');
  });

  it('아무것도 못 알아보면 metadata는 빈 객체다 (오류가 아니다)', async () => {
    const { text, isError } = await call({ enhancement_spot: SPOT }, () => ({
      body: '<enhs:enhancementSpot/>',
    }));

    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({ enhancement_spot: SPOT, metadata: {} });
  });

  it('BAdI도 링크도 없으면 그 키 자체가 없다 (빈 배열을 싣지 않는다)', async () => {
    const { text } = await call({ enhancement_spot: SPOT }, () => ({
      body: '<enhs:enhancementSpot adtcore:name="ZENH_SPOT"/>',
    }));

    const metadata = JSON.parse(text).metadata;
    expect(metadata).toEqual({ name: 'ZENH_SPOT' });
    expect('badi_definitions' in metadata).toBe(false);
    expect('links' in metadata).toBe(false);
  });

  it('D36 — 구의 `type: json` 블록을 규약대로 text 하나에 싣는다', async () => {
    const harness = await harnessFor(
      getEnhancementSpot,
      recordingTransport(() => ({ status: 200, body: SPOT_XML })).transport,
    );
    try {
      const result = (await harness.client.callTool({
        name: 'GetEnhancementSpot',
        arguments: { enhancement_spot: SPOT },
      })) as { content: Array<{ type: string; text?: string }> };

      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      // 그릇만 바뀌고 필드는 그대로 — 문자열을 파싱하면 구의 객체가 나온다.
      expect(JSON.parse(String(result.content[0]?.text)).enhancement_spot).toBe(SPOT);
    } finally {
      await harness.close();
    }
  });
});

describe('갈래', () => {
  it('빈 스팟 이름은 SAP에 한 바이트도 나가기 전에 거절된다', async () => {
    const { text, isError, sent } = await call({ enhancement_spot: '' }, () => ({ body: '<x/>' }));

    expect(isError).toBe(true);
    expect(text).toBe('ADT error: Error: Enhancement spot is required');
    expect(sent).toHaveLength(0);
  });

  it('200이지만 본문이 비면 구와 같은 문장으로 거절한다', async () => {
    const { text, isError } = await call({ enhancement_spot: SPOT }, () => ({
      status: 200,
      body: '',
    }));

    expect(isError).toBe(true);
    expect(text).toBe(
      `ADT error: Error: Failed to retrieve metadata for enhancement spot ${SPOT}. Status: 200`,
    );
  });

  it('200이 아닌 2xx도 같은 갈래다 (상태 번호가 문장에 실린다)', async () => {
    const { text, isError } = await call({ enhancement_spot: SPOT }, () => ({
      status: 204,
      body: 'ignored',
    }));

    expect(isError).toBe(true);
    expect(text).toBe(
      `ADT error: Error: Failed to retrieve metadata for enhancement spot ${SPOT}. Status: 204`,
    );
  });

  it('ADT가 404로 거절하면 `ADT error: ` 접두사를 단 오류로 접는다', async () => {
    const { text, isError } = await call({ enhancement_spot: SPOT }, () => ({
      status: 404,
      body: 'not found',
    }));

    expect(isError).toBe(true);
    expect(text).toMatch(/^ADT error: /);
    expect(text).toContain('404');
  });
});
