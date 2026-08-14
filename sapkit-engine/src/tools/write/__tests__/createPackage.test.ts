/**
 * `CreatePackage` — 발행 계약 · **여섯 발 와이어** · 페이로드 · 오류 사다리 ·
 * **tier 게이트 음성시험**.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 요청 순서 → `engine/src/handlers/package/high/handleCreatePackage.ts:125-185`
 *    + `@babamba2/…/dist/core/package/AdtPackage.js:66-135`
 *  - 검증 질의 → `dist/core/package/validation.js:14-31`
 *  - 생성 본문 → `dist/core/package/create.js:14-84`
 *  - 검사 본문 → `dist/core/package/check.js:24-48` (version은 inactive)
 *  - 오류 사다리 → 겉 핸들러 `:207-315`
 *  - `sets` → `engine/src/lib/handlers/groups/HighLevelHandlersGroup.ts:476`
 */

import { buildCheckPayload, buildPackagePayload, createPackage } from '../createPackage';
import { cleanupTierProbeDirs, probeTier } from '../../__tests__/tierProbe';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from '../../read/__tests__/support';
import type { RecordedRequest, Reply } from '../../read/__tests__/support';

afterEach(() => {
  cleanupTempDirs();
});

afterAll(() => {
  cleanupTierProbeDirs();
});

const VALIDATION = '/sap/bc/adt/packages/validation';
const PACKAGES = '/sap/bc/adt/packages';
const CHECKRUNS = '/sap/bc/adt/checkruns';

const ARGS = {
  package_name: 'zok_test_0002',
  super_package: 'ZOK_PACKAGE',
  software_component: 'HOME',
};

const isCsrf = (request: RecordedRequest): boolean => request.url.includes('/discovery');

/** 여섯 발이 전부 성공하는 전송. */
const happyPath =
  (overrides: (request: RecordedRequest) => Reply | undefined = () => undefined) =>
  (request: RecordedRequest): Reply => {
    if (isCsrf(request)) return { headers: { 'x-csrf-token': 'TEST-TOKEN' } };
    const override = overrides(request);
    if (override) return override;
    if (request.url.includes('/core/http/systeminformation')) {
      return { status: 200, body: JSON.stringify({ language: 'CS' }) };
    }
    return { status: 200, body: '<ok/>' };
  };

/** 도구가 실제로 보낸 요청만, 순서대로. */
async function callAndCapture(
  args: Record<string, unknown>,
  reply: (request: RecordedRequest) => Reply,
): Promise<{ text: string; isError: boolean; sent: RecordedRequest[] }> {
  const { outcome, requests } = await runTool(createPackage, args, reply);
  return { text: outcome.text, isError: outcome.isError, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(createPackage);
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
      }).toEqual(publishedDeclaration('CreatePackage'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언 — `high`라 readonly 표면에 뜨지 않는다', () => {
    // 채록본에서도 connected_default·noProfile_default 둘에만 뜬다.
    expect(createPackage.definition.sets).toEqual(['high']);
    expect(createPackage.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(createPackage.definition.kind).toBe('mutation');
  });

  it('mutation이므로 targetNames 선언이 필수다 — 만들어지는 대상 하나', () => {
    // `super_package`는 부모라서 뺐다. 표준 구조 패키지($TMP·HOME 등)가 정상적으로
    // 올 수 있고, 걸면 정당한 생성이 사전 검사에서 막힌다.
    expect(createPackage.definition.targetNames).toEqual(['package_name']);
  });
});

describe('와이어 — 여섯 발이 이 순서로 나간다', () => {
  it('검증 → 시스템정보 → 검증 → 생성 → 준비대기 읽기 → 검사', async () => {
    const { sent, isError } = await callAndCapture(ARGS, happyPath());

    expect(isError).toBe(false);
    expect(sent).toHaveLength(6);

    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.url).toContain(VALIDATION);
    expect(sent[1]?.method).toBe('GET');
    expect(sent[1]?.url).toContain('/sap/bc/adt/core/http/systeminformation');
    expect(sent[2]?.url).toContain(VALIDATION);
    expect(sent[3]?.method).toBe('POST');
    expect((sent[3]?.url ?? '').split('?')[0]).toMatch(new RegExp(`${PACKAGES}$`));
    expect(sent[4]?.method).toBe('GET');
    expect(sent[4]?.url).toContain('withLongPolling=true');
    expect(sent[5]?.method).toBe('POST');
    expect(sent[5]?.url).toContain(CHECKRUNS);
  });

  it('검증 질의 인자 다섯이 구 그대로다 — 이름은 대문자로 올라간다', async () => {
    const { sent } = await callAndCapture(ARGS, happyPath());
    const url = decodeURIComponent(sent[0]?.url ?? '');

    expect(url).toContain('objname=ZOK_TEST_0002');
    expect(url).toContain('packagename=ZOK_PACKAGE');
    // description을 안 주면 패키지 이름이 대신 실린다.
    expect(url).toContain('description=ZOK_TEST_0002');
    expect(url).toContain('checkmode=basic');
    expect(sent[0]?.headers['Accept']).toBe('application/vnd.sap.as+xml');
  });

  it('⚠ ①과 ③의 `packagetype`이 갈린다 (겉 핸들러가 ①에 그 값을 안 넘긴다)', async () => {
    const { sent } = await callAndCapture(
      { ...ARGS, package_type: 'structure' },
      happyPath(),
    );

    // ①은 벤더 기본값, ③은 준 값. 구의 실측이라 그대로 뒀다.
    expect(decodeURIComponent(sent[0]?.url ?? '')).toContain('packagetype=development');
    expect(decodeURIComponent(sent[2]?.url ?? '')).toContain('packagetype=structure');
  });

  it('transport_request를 주면 생성 POST에 corrNr가 붙는다', async () => {
    const { sent } = await callAndCapture(
      { ...ARGS, transport_request: 'E19K905635' },
      happyPath(),
    );

    expect(sent[3]?.url).toContain('corrNr=E19K905635');
  });

  it('transport_request가 없으면 질의 인자가 붙지 않는다', async () => {
    const { sent } = await callAndCapture(ARGS, happyPath());

    expect(sent[3]?.url).not.toContain('?');
  });

  it('생성 POST의 헤더 두 줄이 구 그대로다', async () => {
    const { sent } = await callAndCapture(ARGS, happyPath());

    expect(sent[3]?.headers['Accept']).toBe(
      'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml',
    );
    expect(sent[3]?.headers['Content-Type']).toBe('application/vnd.sap.adt.packages.v2+xml');
  });

  it('⑤가 실패해도 삼키고 ⑥까지 간다', async () => {
    const { sent, isError } = await callAndCapture(
      ARGS,
      happyPath((request) =>
        request.url.includes('withLongPolling') ? { status: 500, body: 'not ready' } : undefined,
      ),
    );

    expect(isError).toBe(false);
    expect(sent).toHaveLength(6);
    expect(sent[5]?.url).toContain(CHECKRUNS);
  });

  it('⑥의 검사 본문은 소문자 URI에 version="inactive"다', async () => {
    const { sent } = await callAndCapture(ARGS, happyPath());

    expect(sent[5]?.body).toContain('adtcore:uri="/sap/bc/adt/packages/zok_test_0002"');
    expect(sent[5]?.body).toContain('chkrun:version="inactive"');
    expect(sent[5]?.headers['Content-Type']).toBe('application/vnd.sap.adt.checkobjects+xml');
    expect(sent[5]?.headers['Accept']).toBe('application/vnd.sap.adt.checkmessages+xml');
  });
});

describe('생성 페이로드', () => {
  it('로그온 언어가 두 속성에 실린다 (EN 고정이 아니다)', async () => {
    const { sent } = await callAndCapture(ARGS, happyPath());

    expect(sent[3]?.body).toContain('adtcore:language="CS"');
    expect(sent[3]?.body).toContain('adtcore:masterLanguage="CS"');
  });

  it('시스템정보 조회가 실패하면 EN으로 떨어진다 (생성은 계속된다)', async () => {
    const { sent, isError } = await callAndCapture(
      ARGS,
      happyPath((request) =>
        request.url.includes('systeminformation') ? { status: 404, body: '' } : undefined,
      ),
    );

    expect(isError).toBe(false);
    expect(sent[3]?.body).toContain('adtcore:masterLanguage="EN"');
  });

  it('빈 요소 갈래 — transport_layer·application_component가 없으면 빈 태그다', () => {
    const payload = buildPackagePayload({
      packageName: 'ZPKG',
      superPackage: 'ZPARENT',
      description: 'D',
      packageType: 'development',
      softwareComponent: 'HOME',
      recordChanges: false,
      masterLanguage: 'EN',
    });

    expect(payload).toContain('<pak:transportLayer/>');
    expect(payload).toContain('<pak:applicationComponent/>');
    expect(payload).toContain('<pak:softwareComponent pak:name="HOME"/>');
    expect(payload).toContain('<pak:superPackage adtcore:name="ZPARENT"/>');
    expect(payload).toContain('pak:recordChanges="false"');
    // 소유자 속성은 env에서만 온다 — 없으면 붙지 않는다(D62·D82).
    expect(payload).not.toContain('adtcore:masterSystem=');
    expect(payload).not.toContain('adtcore:responsible=');
  });

  it('설명은 60자로 자르고 다섯 글자를 이스케이프한다', () => {
    const payload = buildPackagePayload({
      packageName: 'ZPKG',
      superPackage: 'ZPARENT',
      description: `${'가'.repeat(70)}`,
      packageType: 'development',
      softwareComponent: 'HOME',
      recordChanges: true,
      masterLanguage: 'en',
    });

    expect(payload).toContain(`adtcore:description="${'가'.repeat(60)}"`);
    // 소문자로 줘도 대문자로 실린다(`create.js:52`).
    expect(payload).toContain('adtcore:masterLanguage="EN"');
    expect(payload).toContain('pak:recordChanges="true"');

    const escaped = buildPackagePayload({
      packageName: 'ZPKG',
      superPackage: 'A&B',
      description: '<x>"y"',
      packageType: 'development',
      softwareComponent: 'HOME',
      recordChanges: false,
      masterLanguage: 'EN',
    });
    expect(escaped).toContain('adtcore:description="&lt;x&gt;&quot;y&quot;"');
    expect(escaped).toContain('<pak:superPackage adtcore:name="A&amp;B"/>');
  });

  it('검사 본문은 이름을 소문자로 만든 뒤 URI에 넣는다', () => {
    expect(buildCheckPayload('ZOK_TEST')).toContain('adtcore:uri="/sap/bc/adt/packages/zok_test"');
  });
});

describe('응답', () => {
  it('성공 응답의 키 순서와 문구가 구 그대로다', async () => {
    const { text } = await callAndCapture(
      { ...ARGS, description: '테스트 패키지', transport_layer: 'ZE19' },
      happyPath(),
    );
    const payload = JSON.parse(text) as Record<string, unknown>;

    expect(Object.keys(payload)).toEqual([
      'success',
      'package_name',
      'description',
      'super_package',
      'package_type',
      'software_component',
      'transport_layer',
      'transport_request',
      'uri',
      'message',
    ]);
    expect(payload['package_name']).toBe('ZOK_TEST_0002');
    expect(payload['uri']).toBe('/sap/bc/adt/packages/zok_test_0002');
    // 안 준 값은 `|| null`로 접힌다.
    expect(payload['transport_request']).toBeNull();
    expect(payload['message']).toBe('Package ZOK_TEST_0002 created successfully');
  });
});

describe('오류 사다리 (구 `:207-315`의 순서)', () => {
  it('이미 있으면 삭제하거나 다른 이름을 쓰라고 답한다', async () => {
    const { text, isError } = await callAndCapture(
      ARGS,
      happyPath((request) =>
        request.method === 'POST' && (request.url.split('?')[0] ?? '').endsWith(PACKAGES)
          ? { status: 500, body: 'ExceptionResourceAlreadyExists' }
          : undefined,
      ),
    );

    expect(isError).toBe(true);
    expect(text).toBe(
      'Package ZOK_TEST_0002 already exists. Please delete it first or use a different name.',
    );
  });

  it('409도 같은 갈래다', async () => {
    const { text } = await callAndCapture(
      ARGS,
      happyPath((request) =>
        request.method === 'POST' && (request.url.split('?')[0] ?? '').endsWith(PACKAGES)
          ? { status: 409, body: 'conflict' }
          : undefined,
      ),
    );

    expect(text).toContain('already exists');
  });

  it.each([
    [401, 'Unauthorized: Authentication failed. Please check your credentials and re-authenticate.'],
    [403, 'Forbidden: Access denied. Please check your permissions.'],
  ])('%s는 고정 문구다', async (status, message) => {
    const { text } = await callAndCapture(
      ARGS,
      happyPath((request) =>
        request.method === 'POST' && (request.url.split('?')[0] ?? '').endsWith(PACKAGES)
          ? { status, body: 'denied' }
          : undefined,
      ),
    );

    expect(text).toBe(message);
  });

  it('404 + 임포트 경고면 **되읽어 살아 있을 때만** 성공으로 접는다', async () => {
    let longPolls = 0;
    const { text, isError } = await callAndCapture(ARGS, (request) => {
      if (isCsrf(request)) return { headers: { 'x-csrf-token': 'T' } };
      if (request.url.includes('systeminformation')) {
        return { status: 200, body: JSON.stringify({ language: 'EN' }) };
      }
      if (request.method === 'POST' && (request.url.split('?')[0] ?? '').endsWith(PACKAGES)) {
        return { status: 404, body: 'Error while importing object' };
      }
      if (request.url.includes('withLongPolling')) {
        longPolls += 1;
        return { status: 200, body: '<pak:package/>' };
      }
      return { status: 200, body: '<ok/>' };
    });
    const payload = JSON.parse(text) as Record<string, unknown>;

    expect(isError).toBe(false);
    expect(longPolls).toBe(1);
    // 경고판의 키 순서 — `uri` 다음이 `warning`, 그 뒤가 `message`다.
    expect(Object.keys(payload).slice(-3)).toEqual(['uri', 'warning', 'message']);
    expect(payload['warning']).toBe('Import warning during create (404). Object verified by read.');
    expect(payload['message']).toBe(
      'Package ZOK_TEST_0002 created successfully (import warning ignored).',
    );
  });

  it('되읽기가 실패하면 성공이라 하지 않는다 (거짓 성공 없음)', async () => {
    const { text, isError } = await callAndCapture(ARGS, (request) => {
      if (isCsrf(request)) return { headers: { 'x-csrf-token': 'T' } };
      if (request.url.includes('systeminformation')) {
        return { status: 200, body: JSON.stringify({ language: 'EN' }) };
      }
      if (request.method === 'POST' && (request.url.split('?')[0] ?? '').endsWith(PACKAGES)) {
        return { status: 404, body: 'Error while importing object' };
      }
      if (request.url.includes('withLongPolling')) return { status: 500, body: 'gone' };
      return { status: 200, body: '<ok/>' };
    });

    expect(isError).toBe(true);
    expect(text).toContain('Failed to create package ZOK_TEST_0002');
    expect(text).toContain('Error while importing object');
  });

  it('그 밖의 실패는 `Failed to create package …`다', async () => {
    const { text, isError } = await callAndCapture(
      ARGS,
      happyPath((request) =>
        request.method === 'POST' && (request.url.split('?')[0] ?? '').endsWith(PACKAGES)
          ? { status: 500, body: 'internal boom' }
          : undefined,
      ),
    );

    expect(isError).toBe(true);
    expect(text).toContain('Failed to create package ZOK_TEST_0002');
    expect(text).toContain('internal boom');
  });
});

describe('인자 갈래', () => {
  it('빈 package_name은 접속 전에 거절한다 — 요청 0건', async () => {
    const { text, sent } = await callAndCapture(
      { ...ARGS, package_name: '' },
      happyPath(),
    );

    // 구는 McpError를 던졌다 — 문장은 글자 그대로, 접두사만 빠진다(장부 D34).
    expect(text).toBe('Package name is required');
    expect(sent).toHaveLength(0);
  });

  it('빈 super_package도 접속 전에 거절한다', async () => {
    const { text, sent } = await callAndCapture(
      { ...ARGS, super_package: '' },
      happyPath(),
    );

    expect(text).toBe('Super package (parent package) is required');
    expect(sent).toHaveLength(0);
  });

  it('⚠ software_component가 없으면 **두 발이 나간 뒤** 벤더가 던진다', async () => {
    const { text, isError, sent } = await callAndCapture(
      { package_name: 'ZPKG', super_package: 'ZPARENT' },
      happyPath(),
    );

    // 발행 설명문은 "SAP이 기본값을 넣는다"고 말하지만 벤더가 먼저 막는다
    // (`AdtPackage.js:80-82`). 그 자리는 검증·시스템정보가 이미 나간 뒤다.
    expect(isError).toBe(true);
    expect(sent).toHaveLength(2);
    expect(text).toBe('Failed to create package ZPKG: Software component is required');
  });
});

describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
  it.each(['QA', 'PRD'])('%s tier에서 거부한다', async (tier) => {
    const probe = await probeTier(createPackage, tier, ARGS);

    expect(probe.isError).toBe(true);
    // `isError`만 보면 헛돈다 — 게이트가 없어도 접속 공장이 던진다.
    // 게이트가 앞에서 막았다는 증거는 **접속 시도 0회**다.
    expect(probe.connections).toBe(0);
  });

  it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
    const probe = await probeTier(createPackage, '', ARGS);

    expect(probe.isError).toBe(true);
    expect(probe.connections).toBe(0);
  });

  it('DEV tier에서는 게이트를 지난다 (접속을 만든다)', async () => {
    const probe = await probeTier(createPackage, 'DEV', ARGS);

    expect(probe.connections).toBeGreaterThan(0);
  });
});
