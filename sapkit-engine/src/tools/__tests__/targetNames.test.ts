/**
 * 대상-이름 선언 게이트 — **선언 누락이 조용히 넘어가지 않는 자리.**
 *
 * 녹화 사전 검사는 이제 도구 선언을 읽는다. 그래서 SAP을 바꾸는 도구를
 * 선언 없이 지으면, 그 도구는 사전 검사에 **자동으로 안 걸리고** 사후 백스톱
 * 까지 아무도 막지 않는다 — `Delete*` 계열이 대거 들어오는 판에서 그것은
 * "실행된 뒤에 경고를 받는다"는 뜻이다.
 *
 * 게이트를 `gates/`가 아니라 여기 두는 이유: jest는 CI에서 이미 돌아 강제력이
 * 같고, 게이트 판정 규칙 파일의 소유권과 충돌하지 않는다.
 */

import * as z from 'zod';

import { defineTool, missingTargetNameDeclarations } from '../../server/toolDefinition';
import type { SapTool } from '../../server/toolDefinition';
import { TOOL_REGISTRY } from '../registry';

/**
 * 정책 분류만 갈아 끼운 가짜 도구 한 벌. 선언 키가 `inputSchema`의 키로 좁혀져
 * 있다는 것도 여기서 같이 드러난다 — `'object_name'` 말고는 컴파일이 거부한다.
 */
function fakeTool(
  name: string,
  kind: SapTool['definition']['kind'],
  targetNames?: readonly 'object_name'[],
): SapTool {
  return defineTool(
    {
      name,
      description: 'fake',
      inputSchema: { object_name: z.string() },
      available_in: ['onprem'],
      sets: ['high'],
      kind,
      ...(targetNames === undefined ? {} : { targetNames }),
    },
    () => ({ isError: false, content: [] }),
  );
}

describe('SAP을 바꾸는 도구는 대상-이름 인자를 선언해야 한다', () => {
  it('등록된 도구 전부가 이 규칙을 지킨다', () => {
    expect(missingTargetNameDeclarations(TOOL_REGISTRY)).toEqual([]);
  });

  it('선언 없는 mutation 도구는 거부된다', () => {
    expect(missingTargetNameDeclarations([fakeTool('DeleteThing', 'mutation')])).toEqual(['DeleteThing']);
  });

  it('선언 없는 execution 도구도 거부된다 — P3는 write와 같은 등급이다', () => {
    expect(missingTargetNameDeclarations([fakeTool('RunThing', 'execution')])).toEqual(['RunThing']);
  });

  it('빈 배열은 명시 선언이라 통과한다 — 고객 네임스페이스 대상이 없는 도구를 위한 자리', () => {
    expect(missingTargetNameDeclarations([fakeTool('ReleaseTransportish', 'mutation', [])])).toEqual([]);
  });

  it('선언이 있으면 통과한다', () => {
    expect(missingTargetNameDeclarations([fakeTool('DeleteThing', 'mutation', ['object_name'])])).toEqual([]);
  });

  it('읽기·실데이터 도구에는 선언을 요구하지 않는다', () => {
    expect(missingTargetNameDeclarations([fakeTool('GetThing', 'read'), fakeTool('QueryThing', 'row-data')])).toEqual([]);
  });
});
