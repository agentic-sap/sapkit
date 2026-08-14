/**
 * `GetTransaction` — 발행 계약 · 무접속 · **미구현이라는 사실 자체를 고정한다.**
 *
 * 구 핸들러(`engine/src/handlers/system/readonly/handleGetTransaction.ts:73-76`)의
 * 유일한 반환문은 `{ message: 'Not implemented' }`다. 진짜 구현은 주석 처리된 채
 * 남아 있고(`:52-72`), 파서도 아무도 부르지 않는다(`:22-45`).
 *
 * 이 시험이 존재하는 이유는 **누군가 이 도구를 "고쳤다"고 착각하지 않게 하는
 * 것**이다. 언젠가 실제로 지을 때는 이 시험이 빨개지고, 그때 비로소 와이어를
 * 복원했다는 근거와 함께 기대값을 바꾸는 것이 맞다. 지금 조용히 무언가를
 * 돌려주게 만들면 그것은 이식이 아니라 새 기능이다.
 */

import { getTransaction } from '../getTransaction';
import { cleanupTempDirs, harnessFor, publishedDeclaration, runTool, toolRequests } from './support';

afterEach(() => {
  cleanupTempDirs();
});

async function call(args: Record<string, unknown>) {
  const { outcome, requests } = await runTool(getTransaction, args, () => ({
    status: 200,
    body: '',
  }));
  return { outcome, sent: toolRequests(requests) };
}

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 같다', async () => {
    const harness = await harnessFor(getTransaction);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(1);
      const published = listed.tools[0] as unknown as Record<string, unknown>;

      expect({
        name: published.name,
        description: published.description,
        inputSchema: published.inputSchema,
        execution: published.execution,
      }).toEqual(publishedDeclaration('GetTransaction'));
    } finally {
      await harness.close();
    }
  });

  it('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
    // `engine/src/handlers/system/readonly/` → readonly 집합.
    expect(getTransaction.definition.sets).toEqual(['readonly']);
    expect(getTransaction.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(getTransaction.definition.kind).toBe('read');
  });
});

describe('구는 이 도구를 짓지 않았다', () => {
  it('언제나 { message: "Not implemented" }를 오류가 아닌 답으로 돌려준다', async () => {
    const { outcome } = await call({ transaction_name: 'ZTEST' });

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.text)).toEqual({ message: 'Not implemented' });
  });

  it('SAP에 붙지 않는다 — 구도 connection을 쓰지 않는다', async () => {
    const { sent } = await call({ transaction_name: 'ZTEST' });

    expect(sent).toHaveLength(0);
  });

  it('transaction_name이 무엇이든 답이 같다 — 인자를 보지 않는다', async () => {
    const first = await call({ transaction_name: 'ZTEST' });
    const second = await call({ transaction_name: 'SE38' });
    const third = await call({ transaction_name: '' });

    expect(first.outcome.text).toBe(second.outcome.text);
    expect(second.outcome.text).toBe(third.outcome.text);
    expect(third.outcome.isError).toBe(false);
  });
});
