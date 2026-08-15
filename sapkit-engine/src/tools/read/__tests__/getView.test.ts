/**
 * `GetView` — 발행 계약 · 와이어 · 오류 갈래 · **`ReadView`와의 차이**.
 *
 * 기대값은 전부 구 엔진 실측에서 뽑았다:
 *  - 선언 = `harness/old-surface/m1-tools.json`의 `tools`(전량 186종)
 *  - 경로·Accept = `@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js`의
 *    `getObjectSourceUri` case `'view'` + `readObjectSource`의 기본 Accept
 *  - 오류 문구 = `engine/src/handlers/view/high/handleGetView.ts:102-116`와
 *    벤더 `AdtView.read()`의 404 접기를 이어 붙인 **관측값**
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { getView } from '../getView';
import { readView } from '../readView';
import {
  TEST_ORIGIN,
  cleanupTempDirs,
  harnessFor,
  publishedDeclaration,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const DDL = '@AbapCatalog.sqlViewName: \'ZVTEST\'\ndefine view Z_I_TEST as select from t000 { mandt }';

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getView);
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
      }).toEqual(publishedDeclaration('GetView'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // 구 경로 `engine/src/handlers/view/high/handleGetView.ts` → high 집합.
    // 채록본 exposures에서도 connected_default·noProfile_default 둘뿐이다
    // (readonly 두 조건에는 없다 — 그쪽에 뜨는 것은 ReadView뿐).
    expect(getView.definition.sets).toEqual(['high']);
    expect(getView.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(getView.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('DDLS 소스 경로로 GET 한 번만 보낸다 (Accept는 text/plain)', async () => {
    const { outcome, requests } = await runTool(getView, { view_name: 'Z_I_TEST' }, () => ({
      body: DDL,
    }));

    const sent = toolRequests(requests);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddl/sources/Z_I_TEST/source/main?version=active`,
    );
    expect(sent[0]?.headers['Accept']).toBe('text/plain');
    expect(outcome.isError).toBe(false);
  });

  it('version=inactive가 질의 인자로 실린다', async () => {
    const { requests } = await runTool(
      getView,
      { view_name: 'Z_I_TEST', version: 'inactive' },
      () => ({ body: DDL }),
    );

    expect(toolRequests(requests)[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddl/sources/Z_I_TEST/source/main?version=inactive`,
    );
  });

  it('이름은 대문자로 올라가고, 읽기 경로에서는 소문자로 접히지 않는다', async () => {
    // 쓰기 쪽(lock·PUT·활성화)은 반대로 전부 소문자다 — 규칙이 갈리는 자리.
    const { requests } = await runTool(getView, { view_name: 'z_i_test' }, () => ({ body: DDL }));

    expect(toolRequests(requests)[0]?.url).toContain('/ddic/ddl/sources/Z_I_TEST/source/main');
  });

  it('이름에 든 슬래시는 경로에서 인코딩된다', async () => {
    const { requests } = await runTool(getView, { view_name: '/NS/Z_I_TEST' }, () => ({
      body: DDL,
    }));

    expect(toolRequests(requests)[0]?.url).toContain(
      '/ddic/ddl/sources/%2FNS%2FZ_I_TEST/source/main',
    );
  });

  it('뷰 종류(CDS · DDL 클래식)로 경로가 갈리지 않는다', async () => {
    // 구는 `getObjectSourceUri`에서 `'view'`와 `'ddls/df'`를 같은 case에 묶어
    // DDLS 하나로 보낸다. 클래식 전용 경로 `/sap/bc/adt/ddic/views/`는 벤더
    // `buildObjectUri`에만 있고 이 도구는 그 갈래를 타지 않는다.
    const cds = await runTool(getView, { view_name: 'Z_I_CDS' }, () => ({ body: DDL }));
    const classic = await runTool(getView, { view_name: 'ZVCLASSIC' }, () => ({
      body: 'define view entity ZVCLASSIC as select from t000 { mandt }',
    }));

    for (const url of [toolRequests(cds.requests)[0]?.url, toolRequests(classic.requests)[0]?.url]) {
      expect(url).toContain('/sap/bc/adt/ddic/ddl/sources/');
      expect(url).not.toContain('/sap/bc/adt/ddic/views/');
    }
  });
});

describe('응답', () => {
  it('구와 같은 키로 싣는다 — view_data · status · status_text', async () => {
    const { outcome } = await runTool(getView, { view_name: 'Z_I_TEST' }, () => ({ body: DDL }));

    expect(JSON.parse(outcome.text)).toEqual({
      success: true,
      view_name: 'Z_I_TEST',
      version: 'active',
      view_data: DDL,
      status: 200,
      status_text: 'OK',
    });
  });
});

describe('오류 갈래', () => {
  it('view_name이 비면 접속을 만들지 않고 거부한다', async () => {
    const { outcome, requests } = await runTool(getView, { view_name: '' }, () => ({ body: '' }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: view_name is required');
    expect(requests).toHaveLength(0);
  });

  it('404는 구의 관측 문구 그대로 이중 포장된다', async () => {
    // 벤더 `AdtView.read()`가 404를 undefined로 접는 바람에, 구 핸들러의
    // `View X not found.` 갈래는 도달하지 않는다. 실제로 관측되는 문구는
    // `Failed to read view: View X not found`(마침표 없음)다.
    const { outcome } = await runTool(getView, { view_name: 'ZNOPE' }, () => ({
      status: 404,
      body: '<exc:exception xmlns:exc="http://www.sap.com/adt/core"><message>not found</message></exc:exception>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Failed to read view: View ZNOPE not found');
  });

  it('423은 구의 잠금 문구 그대로다 (마침표 포함)', async () => {
    const { outcome } = await runTool(getView, { view_name: 'ZLOCKED' }, () => ({
      status: 423,
      body: '<exc:exception xmlns:exc="http://www.sap.com/adt/core"><message>locked</message></exc:exception>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: View ZLOCKED is locked by another user.');
  });

  it('그 밖의 상태는 Failed to read view 접두사로 올라간다', async () => {
    const { outcome } = await runTool(getView, { view_name: 'ZBOOM' }, () => ({
      status: 500,
      body: '<html>boom</html>',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toMatch(/^Error: Failed to read view: /);
    expect(outcome.text).not.toContain('not found');
  });
});

describe('GetView ↔ ReadView 차이 (실측)', () => {
  it('왕복 수가 다르다 — GetView 1회, ReadView 2회', async () => {
    const get = await runTool(getView, { view_name: 'Z_I_TEST' }, () => ({ body: DDL }));
    const read = await runTool(readView, { view_name: 'Z_I_TEST' }, () => ({ body: DDL }));

    expect(toolRequests(get.requests).map((r) => r.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddl/sources/Z_I_TEST/source/main?version=active`,
    ]);
    expect(toolRequests(read.requests).map((r) => r.url)).toEqual([
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddl/sources/Z_I_TEST/source/main?version=active`,
      // 메타데이터에는 version이 실리지 않는다.
      `${TEST_ORIGIN}/sap/bc/adt/ddic/ddl/sources/Z_I_TEST`,
    ]);
  });

  it('응답 키가 하나도 겹치지 않는다', async () => {
    const get = await runTool(getView, { view_name: 'Z_I_TEST' }, () => ({ body: DDL }));
    const read = await runTool(readView, { view_name: 'Z_I_TEST' }, () => ({ body: DDL }));

    const getKeys = Object.keys(JSON.parse(get.outcome.text));
    const readKeys = Object.keys(JSON.parse(read.outcome.text));
    const onlyGet = getKeys.filter((key) => !readKeys.includes(key));
    const onlyRead = readKeys.filter((key) => !getKeys.includes(key));

    expect(onlyGet.sort()).toEqual(['status', 'status_text', 'view_data']);
    expect(onlyRead.sort()).toEqual(['metadata', 'source_code']);
  });

  it('없는 뷰에서 갈린다 — GetView는 오류, ReadView는 success:true', async () => {
    const notFound = () => ({ status: 404, body: '<exc:exception/>' });
    const get = await runTool(getView, { view_name: 'ZNOPE' }, notFound);
    const read = await runTool(readView, { view_name: 'ZNOPE' }, notFound);

    expect(get.outcome.isError).toBe(true);
    expect(read.outcome.isError).toBe(false);
    expect(JSON.parse(read.outcome.text)).toEqual({
      success: true,
      view_name: 'ZNOPE',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('안전 등급이 갈린다 — readonly 표면에는 ReadView만 뜬다', () => {
    expect(getView.definition.sets).toEqual(['high']);
    expect(readView.definition.sets).toEqual(['readonly']);
  });
});
