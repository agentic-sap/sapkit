/**
 * `GetPackage` — 발행 계약 · 노출 선언 · 와이어 한 발 · 오류 갈래.
 *
 * 기대값의 출처는 전부 **구 엔진의 실측**이다(자기확인 회피):
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - URL·Accept → `@babamba2/mcp-abap-adt-clients/dist/core/package/read.js:14-30`
 *                 + `dist/constants/contentTypes.js:97`
 *  - 404 → `undefined` 접기 → `dist/core/package/AdtPackage.js:163-182`
 *  - 문구 → `engine/src/handlers/package/high/handleGetPackage.ts:59-131`
 *
 * SAP에 붙지 않는다 — 전송을 주입해 끊는다.
 */

import { getPackage } from '../getPackage';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

const PATH = '/sap/bc/adt/packages/ZFIXTURE_PKG';

/** `dist/constants/contentTypes.js:97`의 `ACCEPT_PACKAGE` 글자 그대로. */
const ACCEPT_PACKAGE =
  'application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml';

const PACKAGE_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<pak:package xmlns:pak="http://www.sap.com/adt/packages" adtcore:name="ZFIXTURE_PKG"/>';

const LEGACY_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<pak:package xmlns:pak="http://www.sap.com/adt/packages" pak:legacyLimited="true"/>';

afterAll(() => {
  cleanupTempDirs();
});

async function call(args: Record<string, unknown>, reply: Parameters<typeof runTool>[2]) {
  const { outcome, requests } = await runTool(getPackage, args, reply);
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약 — 채록본과 글자 일치', () => {
  it('tools/list의 네 필드가 구 번들과 같다', async () => {
    const harness = await harnessFor(getPackage);
    try {
      const listed = await harness.client.listTools();
      const published = listed.tools.find((tool) => tool.name === 'GetPackage');
      expect(published).toBeDefined();

      const expected = publishedDeclaration('GetPackage');
      expect(published?.name).toBe(expected.name);
      expect(published?.description).toBe(expected.description);
      expect(published?.inputSchema).toEqual(expected.inputSchema);
      expect((published as { execution?: unknown })?.execution).toEqual(expected.execution);
    } finally {
      await harness.close();
    }
  });
});

describe('노출 선언 — 구 핸들러의 자리와 채록본의 조건', () => {
  it('sets · available_in · kind', () => {
    // 구 경로는 `handlers/package/high/`이고, 채록본 `exposures`에서도
    // connected_default·noProfile_default 둘에만 뜬다(readonly 조건에는 없다).
    expect(getPackage.definition.sets).toEqual(['high']);
    expect(getPackage.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    // 구 `readonlyGuard`의 READ_PREFIXES에 `Get`이 있어 읽기로 통과한다
    // (`engine/src/lib/readonlyGuard.ts:42-54, 95-100`).
    expect(getPackage.definition.kind).toBe('read');
  });
});

describe('와이어 — 요청 한 발', () => {
  it('GET /sap/bc/adt/packages/<이름>?version=active + ACCEPT_PACKAGE', async () => {
    const { outcome, sent } = await call({ package_name: 'zfixture_pkg' }, () => ({
      status: 200,
      body: PACKAGE_XML,
    }));

    expect(outcome.isError).toBe(false);
    expect(sent).toHaveLength(1);
    const request = sent[0];
    expect(request?.method).toBe('GET');
    // 이름은 대문자로 올려 보낸다(`handleGetPackage.ts:64`).
    expect(new URL(request?.url ?? '').pathname).toBe(PATH);
    expect(new URL(request?.url ?? '').searchParams.get('version')).toBe('active');
    expect(request?.headers['Accept']).toBe(ACCEPT_PACKAGE);
    expect(request?.body).toBeUndefined();
  });

  it('version=inactive가 그대로 실린다', async () => {
    const { sent } = await call({ package_name: 'ZFIXTURE_PKG', version: 'inactive' }, () => ({
      status: 200,
      body: PACKAGE_XML,
    }));

    expect(new URL(sent[0]?.url ?? '').searchParams.get('version')).toBe('inactive');
  });

  it('성공 응답은 구의 키 그대로다', async () => {
    const { outcome } = await call({ package_name: 'ZFIXTURE_PKG' }, () => ({
      status: 200,
      body: PACKAGE_XML,
    }));

    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      package_name: 'ZFIXTURE_PKG',
      version: 'active',
      package_data: PACKAGE_XML,
      status: 200,
      status_text: 'OK',
    });
  });

  it('legacyLimited 표지가 있으면 두 키가 더 붙는다', async () => {
    const { outcome } = await call({ package_name: 'ZFIXTURE_PKG' }, () => ({
      status: 200,
      body: LEGACY_XML,
    }));

    const payload = JSON.parse(outcome.text) as Record<string, unknown>;
    expect(payload.legacy_limited).toBe(true);
    expect(String(payload.legacy_note)).toContain('Legacy SAP system');
  });
});

describe('갈래 — 구의 관측 문구', () => {
  it('package_name이 비면 요청을 보내지 않는다', async () => {
    const { outcome, sent } = await call({ package_name: '' }, () => ({ status: 200, body: '' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: package_name is required');
    expect(sent).toHaveLength(0);
  });

  it('404는 벤더가 undefined로 접으므로 not found 갈래로 간다', async () => {
    // `AdtPackage.read()`가 404를 예외가 아니라 `undefined`로 돌려주고
    // (`AdtPackage.js:176-179`), 핸들러의 `!readResult` 갈래가 이 문구를 낸다
    // (`handleGetPackage.ts:76-78`). 마침표까지 구 그대로다.
    const { outcome } = await call({ package_name: 'ZFIXTURE_PKG' }, () => ({
      status: 404,
      body: '<not-found/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Package ZFIXTURE_PKG not found.');
  });

  it('423은 벤더가 되던지므로 잠금 문구가 산다', async () => {
    const { outcome } = await call({ package_name: 'ZFIXTURE_PKG' }, () => ({
      status: 423,
      body: '<locked/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Package ZFIXTURE_PKG is locked by another user.');
  });

  it('그 밖의 실패는 Failed to read package로 감싼다', async () => {
    const { outcome } = await call({ package_name: 'ZFIXTURE_PKG' }, () => ({
      status: 500,
      body: '<boom/>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: Failed to read package: /);
  });
});
