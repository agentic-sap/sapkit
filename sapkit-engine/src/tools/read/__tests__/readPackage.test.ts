/**
 * `ReadPackage` — 발행 계약 · 노출 선언 · **두 발 와이어** · 삼키는 갈래.
 *
 * 기대값의 출처(전부 구 엔진 실측):
 *  - 두 발이 나가는 이유 → `engine/src/handlers/package/readonly/handleReadPackage.ts:48-73`
 *    + `@babamba2/…/dist/core/package/AdtPackage.js:182-212`(`readMetadata`가
 *    `read`를 `'active'` 고정으로 다시 부른다)
 *  - 주소·`Accept` → `dist/core/package/read.js:14-30` + `contentTypes.js:97`
 *  - 404를 삼키는 자리 → `AdtPackage.js:174-179`(read) · 겉 `:71-73`(metadata)
 *  - 응답 모양(들여쓰기 2칸) → 겉 `:75-87`
 *  - `sets` → `engine/src/lib/handlers/groups/ReadOnlyHandlersGroup.ts:255`
 */

import { readPackage } from '../readPackage';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

const PACKAGES = '/sap/bc/adt/packages';
const ACCEPT_PACKAGE =
  'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml';

const versionOf = (url: string): string => /version=([^&]*)/.exec(url)?.[1] ?? '';

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readPackage);
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
      }).toEqual(publishedDeclaration('ReadPackage'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언이 구 핸들러의 소속·available_in과 같다', () => {
    // `handlers/package/readonly/` → ReadOnlyHandlersGroup. 네 조건 전부에 뜬다.
    // 같은 묶음의 `GetPackage`는 `package/high/`라 `sets: ['high']`이고
    // readonly 표면에 뜨지 않는다 — 두 도구의 안전 집합이 갈리는 자리다.
    expect(readPackage.definition.sets).toEqual(['readonly']);
    expect(readPackage.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(readPackage.definition.kind).toBe('read');
    expect(readPackage.definition.targetNames).toEqual(['package_name']);
  });
});

describe('와이어 — 같은 요청이 두 번 나간다', () => {
  it('둘 다 GET /sap/bc/adt/packages/{NAME}이고 이름은 대문자로 올라간다', async () => {
    const { requests } = await runTool(readPackage, { package_name: 'z_my_package' }, () => ({
      status: 200,
      body: '<pak:package/>',
    }));
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(2);
    for (const request of sent) {
      expect(request.method).toBe('GET');
      expect(request.url).toContain(`${PACKAGES}/Z_MY_PACKAGE`);
      expect(request.headers['Accept']).toBe(ACCEPT_PACKAGE);
      expect(request.body).toBeUndefined();
    }
  });

  it('①은 준 version, ②는 **언제나 active**다', async () => {
    const { requests } = await runTool(
      readPackage,
      { package_name: 'ZPKG', version: 'inactive' },
      () => ({ status: 200, body: '<pak:package/>' }),
    );
    const versions = toolRequests(requests).map((request) => versionOf(request.url));

    // 벤더 `readMetadata`가 `'active'`를 고정으로 넘긴다 — 요청을 하나로 접으면
    // `version: 'inactive'`일 때의 답이 달라진다.
    expect(versions).toEqual(['inactive', 'active']);
  });

  it('version을 안 주면 둘 다 active다', async () => {
    const { requests } = await runTool(readPackage, { package_name: 'ZPKG' }, () => ({
      status: 200,
      body: '<pak:package/>',
    }));

    expect(toolRequests(requests).map((request) => versionOf(request.url))).toEqual([
      'active',
      'active',
    ]);
  });

  it('네임스페이스 이름은 한 겹만 인코딩된다', async () => {
    const { requests } = await runTool(readPackage, { package_name: '/NS/PKG' }, () => ({
      status: 200,
      body: '<pak:package/>',
    }));

    expect(toolRequests(requests)[0]?.url).toContain(`${PACKAGES}/%2FNS%2FPKG`);
  });
});

describe('응답', () => {
  it('두 본문을 source_code·metadata 두 칸에 담는다 (들여쓰기 2칸)', async () => {
    let call = 0;
    const { outcome } = await runTool(readPackage, { package_name: 'ZPKG' }, () => ({
      status: 200,
      body: call++ === 0 ? '<FIRST/>' : '<SECOND/>',
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      package_name: 'ZPKG',
      version: 'active',
      source_code: '<FIRST/>',
      metadata: '<SECOND/>',
    });
    expect(outcome.text).toContain('\n  "success": true');
  });
});

describe('삼키는 갈래 — 없는 패키지에도 success: true다 (구의 실측)', () => {
  it('둘 다 404면 두 칸이 null인 채 success: true다', async () => {
    const { outcome, requests } = await runTool(
      readPackage,
      { package_name: 'ZNOPE' },
      () => ({ status: 404, body: 'not found' }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      package_name: 'ZNOPE',
      version: 'active',
      source_code: null,
      metadata: null,
    });
    // 첫 발이 실패해도 둘째 발은 나간다 — 겉 핸들러의 두 try가 서로 독립이다.
    expect(toolRequests(requests)).toHaveLength(2);
  });

  it('첫 발만 실패하면 metadata는 살아 있다', async () => {
    let call = 0;
    const { outcome } = await runTool(readPackage, { package_name: 'ZPKG' }, () =>
      call++ === 0 ? { status: 500, body: 'boom' } : { status: 200, body: '<META/>' },
    );
    const payload = JSON.parse(outcome.text) as Record<string, unknown>;

    expect(payload['source_code']).toBeNull();
    expect(payload['metadata']).toBe('<META/>');
    expect(payload['success']).toBe(true);
  });

  it('빈 본문은 null로 남는다 (구는 `data`가 있을 때만 담는다)', async () => {
    const { outcome } = await runTool(readPackage, { package_name: 'ZPKG' }, () => ({
      status: 200,
      body: '',
    }));
    const payload = JSON.parse(outcome.text) as Record<string, unknown>;

    expect(payload['source_code']).toBeNull();
    expect(payload['metadata']).toBeNull();
  });
});
