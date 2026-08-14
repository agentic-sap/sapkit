/**
 * `RuntimeGetDumpById` — 발행 계약 · 뷰별 와이어 · 응답 모드 셋 · 인자 방어.
 *
 * 기대값의 출처:
 *  - 발행 선언 → `harness/old-surface/m1-tools.json`
 *  - 경로·`Accept` →
 *    `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/runtime/dumps/read.js:16-25, 77-94`
 *  - 응답 조립 → `engine/src/handlers/system/readonly/handleRuntimeGetDumpById.ts:103-153`
 *
 * 픽스처는 전부 가짜다 — 실 시스템 정보를 담지 않는다.
 */

import { runtimeGetDumpById } from '../runtimeGetDumpById';
import {
  cleanupTempDirs,
  jsonOf,
  publishedDeclaration,
  publishedOf,
  runTool,
  toolRequests,
} from './support';

afterEach(() => {
  cleanupTempDirs();
});

const DUMP_ID = 'AAAABBBBCCCCDDDDEEEEFFFF00001111';
const DUMP_XML =
  '<dump><title>Fixture dump</title><exception>CX_SY_FIXTURE</exception>' +
  '<program>ZFIXTURE_PROG</program><line>42</line><user>FIXTUSER</user>' +
  '<irrelevant>ignored</irrelevant></dump>';

async function call(args: Record<string, unknown>, body = DUMP_XML) {
  const { outcome, requests } = await runTool(runtimeGetDumpById, args, () => ({
    status: 200,
    body,
  }));
  const sent = toolRequests(requests);
  return { outcome, sent, url: sent[0] ? new URL(sent[0].url) : null };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    expect(await publishedOf(runtimeGetDumpById)).toEqual(
      publishedDeclaration('RuntimeGetDumpById'),
    );
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    expect(runtimeGetDumpById.definition.sets).toEqual(['readonly']);
    expect(runtimeGetDumpById.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(runtimeGetDumpById.definition.kind).toBe('read');
  });
});

describe('와이어 — 뷰가 경로와 Accept를 함께 가른다', () => {
  it('default 뷰', async () => {
    const { sent, url } = await call({ dump_id: DUMP_ID });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe('GET');
    expect(url?.pathname).toBe(`/sap/bc/adt/runtime/dump/${DUMP_ID}`);
    expect(url?.search).toBe('');
    expect(sent[0]?.headers['Accept']).toBe('application/vnd.sap.adt.runtime.dump.v1+xml');
  });

  it('summary 뷰는 /summary + text/html', async () => {
    const { sent, url } = await call({ dump_id: DUMP_ID, view: 'summary' }, '<html/>');

    expect(url?.pathname).toBe(`/sap/bc/adt/runtime/dump/${DUMP_ID}/summary`);
    expect(sent[0]?.headers['Accept']).toBe('text/html');
  });

  it('formatted 뷰는 /formatted + text/plain', async () => {
    const { sent, url } = await call({ dump_id: DUMP_ID, view: 'formatted' }, 'plain text dump');

    expect(url?.pathname).toBe(`/sap/bc/adt/runtime/dump/${DUMP_ID}/formatted`);
    expect(sent[0]?.headers['Accept']).toBe('text/plain');
  });
});

describe('응답 모드 셋', () => {
  it('기본값 payload — summary 키가 아예 없다', async () => {
    const { outcome } = await call({ dump_id: DUMP_ID });
    const body = jsonOf(outcome);

    expect(body['response_mode']).toBe('payload');
    expect(body['view']).toBe('default');
    expect('summary' in body).toBe(false);
    expect(body['payload']).toEqual({
      dump: {
        title: 'Fixture dump',
        exception: 'CX_SY_FIXTURE',
        program: 'ZFIXTURE_PROG',
        line: 42,
        user: 'FIXTUSER',
        irrelevant: 'ignored',
      },
    });
  });

  it('summary — 핵심 몇 줄만, payload는 싣지 않는다', async () => {
    const { outcome } = await call({ dump_id: DUMP_ID, response_mode: 'summary' });
    const body = jsonOf(outcome);

    expect('payload' in body).toBe(false);
    // 관심 키만 담기고 그 밖의 키(`irrelevant`)는 빠진다.
    expect(body['summary']).toEqual({
      title: 'Fixture dump',
      exception: 'CX_SY_FIXTURE',
      program: 'ZFIXTURE_PROG',
      line: 42,
      user: 'FIXTUSER',
    });
  });

  it('both — 요약과 payload가 함께 실린다', async () => {
    const { outcome } = await call({ dump_id: DUMP_ID, response_mode: 'both' });
    const body = jsonOf(outcome);

    expect(body['summary']).toMatchObject({ title: 'Fixture dump' });
    expect(body['payload']).toBeDefined();
  });
});

describe('인자 방어 — SAP 호출이 나가기 전에 막는다', () => {
  it('빈 dump_id는 구와 같은 문구로 거절한다', async () => {
    const { outcome, sent } = await call({ dump_id: '' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Parameter "dump_id" is required');
    expect(sent).toHaveLength(0);
  });

  it('dump_id에 "/"가 있으면 요청을 보내지 않는다 (경로 조작 방어)', async () => {
    const { outcome, sent } = await call({ dump_id: 'AAAA/../../etc' });

    expect(outcome.isError).toBe(true);
    expect(outcome.text).toBe('Error: Runtime dump ID must not contain "/"');
    expect(sent).toHaveLength(0);
  });
});
