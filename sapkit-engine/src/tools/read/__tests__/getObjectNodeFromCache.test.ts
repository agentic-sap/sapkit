/**
 * `GetObjectNodeFromCache` — 발행 계약 · 노출 선언 · **캐시 없음 갈래** · 무접속.
 *
 * ## 이 시험이 무엇을 증명하는가
 *
 * 이 도구는 신 엔진에서 **언제나 「캐시에 없다」로 답한다.** 그것이 결함이
 * 아니라 구의 실측 갈래라는 것을 못 박는 것이 이 시험의 일이다:
 *
 *  1. 응답 문구가 구의 캐시-빈-상태 갈래와 **글자까지 같다**
 *     (`engine/src/handlers/system/readonly/handleGetObjectNodeFromCache.ts:52-59`).
 *  2. 인자 검증 문구도 구 그대로다(같은 파일 `:33-40`).
 *  3. **어느 갈래에서도 SAP 호출이 한 발도 나가지 않는다** — 구도 캐시 적중
 *     뒤에만 ADT를 부른다(`:61-98`). 접속 시도 0회가 판정 기준이다.
 *
 * 갈라지는 상태(앞선 도구가 캐시를 채운 뒤)는 신 엔진에 존재하지 않는다 —
 * 장부 D130에 등재했다.
 */

import { getObjectNodeFromCache } from '../getObjectNodeFromCache';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool } from './support';

afterEach(() => {
  cleanupTempDirs();
});

/** 이 도구가 접속을 만들면 시험이 그것을 붙잡도록, 모든 응답을 오류로 둔다. */
const neverReached = () => ({ status: 500, body: '이 자리에 닿으면 안 된다' });

const ARGS = { object_type: 'CLAS/OC', object_name: 'ZCL_FIXTURE', tech_name: 'ZCL_FIXTURE' };

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getObjectNodeFromCache);
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
      }).toEqual(publishedDeclaration('GetObjectNodeFromCache'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언이 구 핸들러의 소속·available_in과 같다', () => {
    // `handlers/system/readonly/` — 채록본의 네 조건 전부에 뜬다.
    expect(getObjectNodeFromCache.definition.sets).toEqual(['readonly']);
    expect(getObjectNodeFromCache.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getObjectNodeFromCache.definition.kind).toBe('read');
  });
});

describe('캐시 없음 갈래 — 구의 캐시-빈-상태와 글자까지 같다', () => {
  it('언제나 `Node not found in cache`로 답한다', async () => {
    const { outcome } = await runTool(getObjectNodeFromCache, ARGS, neverReached);

    expect(outcome.isError).toBe(true);
    // `return_error`를 쓰지 않으므로 `Error: ` 접두사가 **없다**(구 `:56-59`).
    expect(outcome.text).toBe('Node not found in cache');
  });

  it('**SAP 호출이 한 발도 나가지 않는다** — 접속 시도 0회', async () => {
    const { requests } = await runTool(getObjectNodeFromCache, ARGS, neverReached);

    // CSRF 왕복까지 포함해 0이다. 접속을 만들지 않았다는 뜻이다.
    expect(requests).toHaveLength(0);
  });

  it('인자를 무엇으로 바꿔도 같은 답이다 (캐시가 없으므로 적중이 없다)', async () => {
    const other = await runTool(
      getObjectNodeFromCache,
      { object_type: 'PROG/P', object_name: 'ZPROG', tech_name: 'ZPROG' },
      neverReached,
    );

    expect(other.outcome.text).toBe('Node not found in cache');
    expect(other.requests).toHaveLength(0);
  });
});

describe('인자 갈래', () => {
  it.each(['object_type', 'object_name', 'tech_name'])(
    '빈 %s는 `object_type, object_name, tech_name required`로 거절한다',
    async (argument) => {
      const args: Record<string, string> = { ...ARGS };
      args[argument] = '';

      const { outcome, requests } = await runTool(getObjectNodeFromCache, args, neverReached);

      expect(outcome.isError).toBe(true);
      // 구 `:37` 글자 그대로 — 세 이름을 쉼표로 잇고 `required`로 끝난다.
      expect(outcome.text).toBe('object_type, object_name, tech_name required');
      expect(requests).toHaveLength(0);
    },
  );

  it('검증 문구와 캐시 문구는 서로 다른 문장이다', async () => {
    const missing = await runTool(
      getObjectNodeFromCache,
      { ...ARGS, tech_name: '' },
      neverReached,
    );
    const present = await runTool(getObjectNodeFromCache, ARGS, neverReached);

    expect(missing.outcome.text).not.toBe(present.outcome.text);
  });
});
