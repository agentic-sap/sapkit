/**
 * `GetSession` — 발행 계약 · 무접속 · ID 모양 · 구가 비워 두던 자리.
 *
 * 기대값은 구 핸들러(`engine/src/handlers/system/readonly/handleGetSession.ts:64-75`)와
 * ID 생성기(`engine/src/lib/sessionUtils.ts:48-50`)의 **소스에서** 뽑았다.
 * 특히 `session_state: null`과 "force_new가 아무것도 바꾸지 않는다"는 구의
 * 실측 동작이며, 시험이 그것을 고정한다 — 나중에 누가 "설명대로 채워 넣자"고
 * 고치면 여기서 걸린다.
 */

import { getSession } from '../getSession';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

async function call(args: Record<string, unknown>) {
  const { outcome, requests } = await runTool(getSession, args, () => ({ status: 200, body: '' }));
  return { outcome, payload: JSON.parse(outcome.text), sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getSession);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetSession'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/system/readonly/` → readonly 집합.
    expect(getSession.definition.sets).toEqual(['readonly']);
    expect(getSession.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getSession.definition.kind).toBe('read');
  });
});

describe('SAP에 붙지 않는다', () => {
  it('요청을 한 건도 보내지 않는다 — 구도 connection을 쓰지 않는다', async () => {
    const { outcome, sent } = await call({});

    expect(outcome.isError).toBe(false);
    expect(sent).toHaveLength(0);
  });
});

describe('응답 본문', () => {
  it('구가 싣던 네 필드를 그대로 싣는다', async () => {
    const { payload } = await call({});

    expect(payload.success).toBe(true);
    // 구는 언제나 null을 싣는다 — 설명 문구가 약속하는 쿠키·토큰은 오지 않는다.
    expect(payload.session_state).toBeNull();
    expect(payload.message).toBe(
      'Session ID generated. Use this session_id in subsequent requests to maintain the same session.',
    );
    expect(Object.keys(payload).sort()).toEqual([
      'message',
      'session_id',
      'session_state',
      'success',
    ]);
  });

  it('session_id는 하이픈 없는 32자 16진 문자열이다', async () => {
    const { payload } = await call({});

    expect(payload.session_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('부를 때마다 다른 ID가 나온다', async () => {
    const first = await call({});
    const second = await call({});

    expect(first.payload.session_id).not.toBe(second.payload.session_id);
  });

  it('들여쓰기 2칸 JSON이다 (구: JSON.stringify(…, null, 2))', async () => {
    const { outcome, payload } = await call({});

    expect(outcome.text).toBe(JSON.stringify(payload, null, 2));
  });
});

describe('force_new는 결과를 바꾸지 않는다 (구의 실측 동작)', () => {
  it('true를 줘도 false를 줘도 같은 모양이 나온다', async () => {
    const on = await call({ force_new: true });
    const off = await call({ force_new: false });

    expect(on.outcome.isError).toBe(false);
    expect(off.outcome.isError).toBe(false);
    // ID만 다르고 나머지 필드는 전부 같다.
    expect({ ...on.payload, session_id: '' }).toEqual({ ...off.payload, session_id: '' });
    expect(on.sent).toHaveLength(0);
    expect(off.sent).toHaveLength(0);
  });
});
