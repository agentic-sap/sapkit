/**
 * `GetSystemInfo` — 발행 계약 · 와이어 · 스택 판정 갈래 · 무응답은 오류가 아니다.
 *
 * 기대값은 구 핸들러(`engine/src/handlers/system/readonly/handleGetSystemInfo.ts:40-98`)와
 * 파서(`engine/src/lib/systemInfoParsers.ts:38-88`)의 **소스**에서 뽑았다.
 *
 * ## 왜 `toolRequests()`를 쓰지 않는가
 *
 * 이 도구는 `/sap/bc/adt/core/discovery`와 `/sap/bc/adt/discovery`를 **스스로**
 * 부른다. 그 두 경로는 접속 계층이 CSRF 토큰을 긁을 때도 쓰는 자리라
 * `toolRequests()`가 걸러 버린다 — 여기서는 도구의 계약이므로 걸러지지 않은
 * 원본 목록을 본다. 셋 다 GET이라 CSRF 취득 자체가 일어나지 않으므로
 * (`src/adt/client.ts`의 prefetch 집합은 POST·PUT·DELETE뿐) 원본 목록에는
 * 도구가 보낸 것만 들어 있다.
 */

import { getSystemInfo, parseSystemInformation } from '../getSystemInfo';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';
import type { RecordedRequest, Reply } from './support';

const SYSTEMINFO = '/sap/bc/adt/core/http/systeminformation';
const DISCOVERY_MODERN = '/sap/bc/adt/core/discovery';
const DISCOVERY_LEGACY = '/sap/bc/adt/discovery';

const XML_HEADERS = { 'content-type': 'application/atomsvc+xml' };
const JSON_HEADERS = { 'content-type': 'application/json' };

const ATOM = '<?xml version="1.0"?><service xmlns="http://www.w3.org/2007/app"/>';

/** 구가 내주던 systeminformation 본문 모양 — 키 이름이 `systemID`(대문자 D)다. */
const SYSTEM_INFO_BODY = JSON.stringify({
  systemID: 'DEV',
  client: '100',
  language: 'EN',
  userName: 'DEVELOPER',
  userFullName: 'Dev Eloper',
});

afterEach(() => {
  cleanupTempDirs();
});

/** 경로별로 답을 정해 주는 응답기. 안 적은 경로는 404다. */
function router(routes: Record<string, Reply>): (request: RecordedRequest) => Reply {
  return (request) => {
    for (const [path, reply] of Object.entries(routes)) {
      // discovery 두 경로는 접두사가 겹치므로 정확히 끝나는지로 가른다.
      if (request.url.endsWith(path)) return reply;
    }
    return { status: 404, body: 'not found' };
  };
}

async function call(reply: (request: RecordedRequest) => Reply) {
  const { outcome, requests } = await runTool(getSystemInfo, {}, reply);
  return {
    outcome,
    payload: JSON.parse(outcome.text),
    // 걸러지지 않은 원본 — 위 머리주석 참조.
    requests,
    paths: requests.map((request) => new URL(request.url).pathname),
  };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getSystemInfo);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetSystemInfo'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/system/readonly/` → readonly 집합.
    expect(getSystemInfo.definition.sets).toEqual(['readonly']);
    // `handleGetSystemInfo.ts:26` — 이 도구만 legacy까지 있다.
    expect(getSystemInfo.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getSystemInfo.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('시스템 정보를 먼저 묻고, 이어서 현대 discovery를 묻는다', async () => {
    const { paths } = await call(
      router({
        [SYSTEMINFO]: { status: 200, body: SYSTEM_INFO_BODY, headers: JSON_HEADERS },
        [DISCOVERY_MODERN]: { status: 200, body: ATOM, headers: XML_HEADERS },
      }),
    );

    // 현대 discovery가 XML로 답했으므로 구형 경로는 묻지 않는다.
    expect(paths).toEqual([SYSTEMINFO, DISCOVERY_MODERN]);
  });

  it('구가 보내던 Accept를 경로마다 그대로 보낸다', async () => {
    const { requests } = await call(
      router({
        [SYSTEMINFO]: { status: 200, body: SYSTEM_INFO_BODY, headers: JSON_HEADERS },
        [DISCOVERY_MODERN]: { status: 200, body: ATOM, headers: XML_HEADERS },
      }),
    );

    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.core.http.systeminformation.v1+json',
    );
    expect(requests[0]?.body).toBeUndefined();
    expect(requests[1]?.headers['Accept']).toBe('application/atomsvc+xml');
  });
});

describe('ADT 스택 판정', () => {
  it('현대 경로가 XML로 답하면 modern이다', async () => {
    const { payload } = await call(
      router({
        [SYSTEMINFO]: { status: 200, body: SYSTEM_INFO_BODY, headers: JSON_HEADERS },
        [DISCOVERY_MODERN]: { status: 200, body: ATOM, headers: XML_HEADERS },
      }),
    );

    expect(payload.adt_stack_type).toBe('modern');
  });

  it('현대 경로가 없으면 구형 경로를 묻고 legacy로 판정한다', async () => {
    const { payload, paths } = await call(
      router({
        [SYSTEMINFO]: { status: 200, body: SYSTEM_INFO_BODY, headers: JSON_HEADERS },
        [DISCOVERY_LEGACY]: { status: 200, body: ATOM, headers: XML_HEADERS },
      }),
    );

    expect(paths).toEqual([SYSTEMINFO, DISCOVERY_MODERN, DISCOVERY_LEGACY]);
    expect(payload.adt_stack_type).toBe('legacy');
  });

  it('현대 경로가 200이어도 XML이 아니면 modern이 아니다 — 구형 경로로 넘어간다', async () => {
    // 구의 조건은 `ok && contentType.includes('xml')`이다. 200만으로는 안 된다.
    const { payload, paths } = await call(
      router({
        [SYSTEMINFO]: { status: 200, body: SYSTEM_INFO_BODY, headers: JSON_HEADERS },
        [DISCOVERY_MODERN]: { status: 200, body: 'not xml', headers: { 'content-type': 'text/html' } },
        [DISCOVERY_LEGACY]: { status: 200, body: ATOM, headers: XML_HEADERS },
      }),
    );

    expect(paths).toEqual([SYSTEMINFO, DISCOVERY_MODERN, DISCOVERY_LEGACY]);
    expect(payload.adt_stack_type).toBe('legacy');
  });

  it('둘 다 XML이 아니면 unknown이지만, 시스템 정보가 있으면 supported:true다', async () => {
    const { payload } = await call(
      router({
        [SYSTEMINFO]: { status: 200, body: SYSTEM_INFO_BODY, headers: JSON_HEADERS },
      }),
    );

    expect(payload.supported).toBe(true);
    expect(payload.adt_stack_type).toBe('unknown');
  });
});

describe('무응답은 오류가 아니다', () => {
  it('셋 다 없으면 supported:false를 isError:false로 돌려준다', async () => {
    const { outcome, payload, paths } = await call(() => ({ status: 404, body: 'not found' }));

    expect(outcome.isError).toBe(false);
    expect(paths).toEqual([SYSTEMINFO, DISCOVERY_MODERN, DISCOVERY_LEGACY]);
    expect(payload).toEqual({
      supported: false,
      reason:
        'Neither /sap/bc/adt/core/http/systeminformation nor the ADT discovery document responded on this system.',
    });
  });

  it('시스템 정보가 없어도 discovery가 답하면 supported:true에 필드가 전부 null이다', async () => {
    // 구의 조건은 `!infoResult.ok && adtStackType === 'unknown'`이라 **둘 다**
    // 실패해야 supported:false다. 하나만 살아도 표를 낸다.
    const { payload } = await call(
      router({ [DISCOVERY_MODERN]: { status: 200, body: ATOM, headers: XML_HEADERS } }),
    );

    expect(payload).toEqual({
      supported: true,
      system_id: null,
      client: null,
      language: null,
      user_name: null,
      user_full_name: null,
      adt_stack_type: 'modern',
    });
  });
});

describe('본문 파싱', () => {
  it('systemID(대문자 D)를 SID로 읽는다', async () => {
    const { payload } = await call(
      router({
        [SYSTEMINFO]: { status: 200, body: SYSTEM_INFO_BODY, headers: JSON_HEADERS },
        [DISCOVERY_MODERN]: { status: 200, body: ATOM, headers: XML_HEADERS },
      }),
    );

    expect(payload).toEqual({
      supported: true,
      system_id: 'DEV',
      client: '100',
      language: 'EN',
      user_name: 'DEVELOPER',
      user_full_name: 'Dev Eloper',
      adt_stack_type: 'modern',
    });
  });

  it('systemId(소문자 d)로 와도 읽는다 — 구의 ?? 순서', () => {
    expect(parseSystemInformation(JSON.stringify({ systemId: 'QAS' })).systemId).toBe('QAS');
    // 둘 다 있으면 대문자 D가 이긴다.
    expect(
      parseSystemInformation(JSON.stringify({ systemID: 'DEV', systemId: 'QAS' })).systemId,
    ).toBe('DEV');
  });

  it('JSON이 아니면 빈 표로 물러난다 (오류가 아니다)', async () => {
    const { payload } = await call(
      router({
        [SYSTEMINFO]: { status: 200, body: 'not json at all', headers: JSON_HEADERS },
        [DISCOVERY_MODERN]: { status: 200, body: ATOM, headers: XML_HEADERS },
      }),
    );

    expect(payload.supported).toBe(true);
    expect(payload.system_id).toBeNull();
  });
});
