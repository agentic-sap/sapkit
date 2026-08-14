/**
 * `ReadClass` — 발행 계약 · 와이어 2왕복 · 한쪽이 막혀도 답한다.
 *
 * 붙잡는 것 넷:
 *  1. `tools/list` 선언이 구 번들 채록본과 **글자 그대로** 같은가.
 *  2. 소스와 메타데이터가 **서로 다른 경로·Accept**로 나가는가.
 *  3. 한쪽이 막혀도 나머지로 답하는가 (구가 각각 try/catch로 감싼 갈래).
 *  4. 빈 본문을 `null`로 접는가 — 구의 falsy 판정을 그대로 옮긴 자리.
 *
 * 자식 프로세스도 실 SAP도 쓰지 않는다 — 전송은 주입된 가짜다.
 */

import { readClass } from '../readClass';
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

const SOURCE_PATH = `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/source/main?version=active`;
const META_PATH = `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST`;

/** 구 `ACCEPT_CLASS` — v4→v1 네 개를 한 줄에 싣는다. */
const ACCEPT_CLASS =
  'application/vnd.sap.adt.oo.classes.v4+xml, application/vnd.sap.adt.oo.classes.v3+xml, ' +
  'application/vnd.sap.adt.oo.classes.v2+xml, application/vnd.sap.adt.oo.classes.v1+xml';

const CLASS_SOURCE = 'CLASS zcl_test DEFINITION PUBLIC.\nENDCLASS.';
const CLASS_META = '<class:abapClass adtcore:name="ZCL_TEST"/>';

interface Payload {
  success: boolean;
  class_name: string;
  version: string;
  source_code: string | null;
  metadata: string | null;
}

/** 소스·메타데이터 두 왕복에 각각 답하는 응답기. */
function bothReply(source: unknown, meta: unknown) {
  return (request: { url: string }) =>
    request.url.includes('/source/main')
      ? (source as { status?: number; body?: string })
      : (meta as { status?: number; body?: string });
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(readClass);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('ReadClass'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 자리와 채록본의 4집합 소속에 맞춘다', () => {
    // 구 경로 `engine/src/handlers/class/readonly/` · 채록본 exposures 4집합 전부.
    expect(readClass.definition.sets).toEqual(['readonly']);
    expect(readClass.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
    expect(readClass.definition.kind).toBe('read');
  });
});

describe('와이어', () => {
  it('소스와 메타데이터를 서로 다른 경로·Accept로 각각 한 번씩 읽는다', async () => {
    const { requests } = await runTool(
      readClass,
      { class_name: 'zcl_test' },
      bothReply({ body: CLASS_SOURCE }, { body: CLASS_META }),
    );
    const sent = toolRequests(requests);

    expect(sent).toHaveLength(2);
    expect(sent[0]?.method).toBe('GET');
    expect(sent[0]?.url).toBe(SOURCE_PATH);
    expect(sent[0]?.headers['Accept']).toBe('text/plain');

    expect(sent[1]?.method).toBe('GET');
    expect(sent[1]?.url).toBe(META_PATH);
    expect(sent[1]?.headers['Accept']).toBe(ACCEPT_CLASS);
  });

  it('version=inactive는 소스 쪽에만 붙고 메타데이터에는 붙지 않는다', async () => {
    const { requests } = await runTool(
      readClass,
      { class_name: 'zcl_test', version: 'inactive' },
      bothReply({ body: CLASS_SOURCE }, { body: CLASS_META }),
    );
    const sent = toolRequests(requests);

    expect(sent[0]?.url).toBe(
      `${TEST_ORIGIN}/sap/bc/adt/oo/classes/ZCL_TEST/source/main?version=inactive`,
    );
    expect(sent[1]?.url).toBe(META_PATH);
  });
});

describe('응답', () => {
  it('둘 다 읽히면 소스·메타데이터를 함께 싣는다', async () => {
    const { outcome } = await runTool(
      readClass,
      { class_name: 'zcl_test' },
      bothReply({ body: CLASS_SOURCE }, { body: CLASS_META }),
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text) as Payload).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      version: 'active',
      source_code: CLASS_SOURCE,
      metadata: CLASS_META,
    });
  });

  it('메타데이터가 막혀도 소스로 답한다', async () => {
    const { outcome } = await runTool(
      readClass,
      { class_name: 'zcl_test' },
      bothReply({ body: CLASS_SOURCE }, { status: 403, body: 'forbidden' }),
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBe(CLASS_SOURCE);
    expect(payload.metadata).toBeNull();
  });

  it('소스가 막혀도 메타데이터로 답한다 — 오류가 아니다', async () => {
    const { outcome } = await runTool(
      readClass,
      { class_name: 'zcl_test' },
      bothReply({ status: 404, body: '' }, { body: CLASS_META }),
    );

    expect(outcome.isError).toBe(false);
    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBe(CLASS_META);
  });

  it('둘 다 막혀도 success:true에 null 둘이다 — 구와 같은 갈래', async () => {
    const { outcome } = await runTool(readClass, { class_name: 'zcl_test' }, () => ({
      status: 404,
      body: '',
    }));

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text) as Payload).toEqual({
      success: true,
      class_name: 'ZCL_TEST',
      version: 'active',
      source_code: null,
      metadata: null,
    });
  });

  it('빈 본문은 null로 접힌다 — 구의 falsy 판정 그대로', async () => {
    const { outcome } = await runTool(
      readClass,
      { class_name: 'zcl_test' },
      bothReply({ body: '' }, { body: '' }),
    );

    const payload = JSON.parse(outcome.text) as Payload;
    expect(payload.source_code).toBeNull();
    expect(payload.metadata).toBeNull();
  });
});

describe('인자 검증', () => {
  it('class_name이 비면 구와 같은 문구로 거절한다', async () => {
    const { outcome, requests } = await runTool(readClass, { class_name: '' }, () => ({
      body: '',
    }));

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: class_name is required');
    expect(toolRequests(requests)).toHaveLength(0);
  });
});
