/**
 * `GetDomain` — 발행 계약 · 와이어 · 갈래.
 *
 * 기대값은 구 소스와 안쪽 패키지의 **실측**에서 뽑았다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.GetDomain`
 *  - 흐름·오류 문구: `engine/src/handlers/domain/high/handleGetDomain.ts:51-156`
 *  - 주소·헤더: `@babamba2/mcp-abap-adt-clients/dist/core/domain/read.js:19-31`
 *    (`Accept`는 `.../constants/contentTypes.js:84`)
 *  - 404 삼킴: `.../core/domain/AdtDomain.js:132-139`
 *
 * 짝인 `ReadDomain`과 무엇이 다른지는 `readDomain.test.ts`의 「짝 대조」 절이
 * 못 박는다.
 */

import { getDomain } from '../getDomain';
import { directHarness, invokeDirect, textOf } from './dataElementDomainSupport';
import { TEST_ORIGIN, cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

const ACCEPT = 'application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml';

const DOMA_XML =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" adtcore:name="ZD_FOO">' +
  '<doma:content><doma:typeInformation><doma:datatype>CHAR</doma:datatype></doma:typeInformation>' +
  '</doma:content></doma:domain>';

afterEach(() => {
  cleanupTempDirs();
});

interface Payload {
  success: boolean;
  domain_name: string;
  version: string;
  domain_data: string;
  status: number;
  status_text: string;
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getDomain);
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
      }).toEqual(publishedDeclaration('GetDomain'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/domain/high/` → 채록본에서 `*_default` 두 조건에만 뜬다.
    expect(getDomain.definition.sets).toEqual(['high']);
    expect(getDomain.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getDomain.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('구와 같은 경로로 GET 한 번만 보낸다 — **`?version=`이 붙지 않는다**', async () => {
    const { requests } = await runTool(getDomain, { domain_name: 'ZD_FOO' }, () => ({
      body: DOMA_XML,
    }));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/domains/ZD_FOO`);
    expect(requests[0]?.url).not.toContain('version=');
    expect(requests[0]?.headers['Accept']).toBe(ACCEPT);
  });

  it('version=inactive는 응답의 메아리만 바꾸고 요청은 그대로다', async () => {
    const { outcome, requests } = await runTool(
      getDomain,
      { domain_name: 'ZD_FOO', version: 'inactive' },
      () => ({ body: DOMA_XML }),
    );

    expect(requests[0]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/domains/ZD_FOO`);
    expect((JSON.parse(outcome.text) as Payload).version).toBe('inactive');
  });

  it('이름은 대문자로 정규화된다 (경로도 응답도)', async () => {
    const { outcome, requests } = await runTool(getDomain, { domain_name: 'zd_foo' }, () => ({
      body: DOMA_XML,
    }));

    expect(requests[0]?.url).toBe(`${TEST_ORIGIN}/sap/bc/adt/ddic/domains/ZD_FOO`);
    expect((JSON.parse(outcome.text) as Payload).domain_name).toBe('ZD_FOO');
  });
});

describe('응답 조립', () => {
  it('구와 같은 필드로, 두 칸 들여쓰기로 낸다', async () => {
    const { outcome } = await runTool(getDomain, { domain_name: 'ZD_FOO' }, () => ({
      status: 200,
      body: DOMA_XML,
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      domain_name: 'ZD_FOO',
      version: 'active',
      domain_data: DOMA_XML,
      status: 200,
      status_text: 'OK',
    });
    expect(outcome.text.split('\n')[1]).toBe('  "success": true,');
  });
});

describe('갈래', () => {
  it('404는 감싸개가 삼켜 빈손이 되고, 핸들러가 "찾지 못했다"로 던진다', async () => {
    const { outcome } = await runTool(getDomain, { domain_name: 'ZD_FOO' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Failed to read domain: Domain ZD_FOO not found');
  });

  it('423은 잠금 문구로 접힌다', async () => {
    const { outcome } = await runTool(getDomain, { domain_name: 'ZD_FOO' }, () => ({
      status: 423,
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Domain ZD_FOO is locked by another user.');
  });

  it('그 밖의 실패는 "Failed to read domain:" 접두사를 단다', async () => {
    const { outcome } = await runTool(getDomain, { domain_name: 'ZD_FOO' }, () => ({
      status: 500,
      body: 'boom',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: Failed to read domain: /);
  });

  it('빈 이름은 요청을 보내기 전에 거부된다', async () => {
    const { outcome, requests } = await runTool(getDomain, { domain_name: '' }, () => ({
      body: DOMA_XML,
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: domain_name is required');
    expect(requests).toHaveLength(0);
  });
});

describe('ECC 갈림 — 우회로가 이 판에 없다 (차이 장부 D61)', () => {
  it('SAP_VERSION=ECC면 접속을 만들지 않고 브리지 미구현을 알린다', async () => {
    const harness = directHarness({ sapVersion: 'ECC' });
    const result = await invokeDirect(getDomain, harness, { domain_name: 'ZD_FOO' });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('ZSAPKIT_ADT_DDIC_DOMA_READ');
    expect(textOf(result)).toContain('D61');
    expect(harness.connections()).toBe(0);
    expect(harness.requests).toHaveLength(0);
  });

  // 구 게이트는 `toUpperCase()`만 하고 **trim 하지 않는다**(`handleGetDomain.ts:69`).
  it.each([null, 'S4', 'ECC6', '', ' ECC '])('%s는 ADT 직통이다', async (sapVersion) => {
    const harness = directHarness({ sapVersion, reply: () => ({ status: 200, body: DOMA_XML }) });
    const result = await invokeDirect(getDomain, harness, { domain_name: 'ZD_FOO' });

    expect(result.isError).toBe(false);
    expect(harness.requests).toHaveLength(1);
  });
});
