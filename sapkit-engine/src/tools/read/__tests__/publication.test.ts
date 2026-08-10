/**
 * 발행 계약 대조 — 표면 동등성의 기계 증거.
 *
 * 도구 하나만 실은 서버를 세우고 진짜 `tools/list`를 받아, 구 번들이 실제로
 * 내보내던 선언(`harness/old-surface/m1-tools.json`, 오프라인 채록)과 **네 필드
 * 전부**(이름·설명·inputSchema·execution)를 정확히 견준다.
 *
 * 여기가 통과한다는 것은 zod shape → JSON Schema 변환까지 포함해 클라이언트가
 * 보는 계약이 글자 단위로 같다는 뜻이다. 설명 문구 한 글자, `default` 하나,
 * `required` 한 항목이 달라도 이 시험이 떨어진다.
 */

import { checkSyntax } from '../checkSyntax';
import { getClass } from '../getClass';
import { getFunctionModule } from '../getFunctionModule';
import { getInactiveObjects } from '../getInactiveObjects';
import { getInclude } from '../getInclude';
import { getProgram } from '../getProgram';
import { getSourceDiff } from '../getSourceDiff';
import { grepObjects } from '../grepObjects';
import { searchObject } from '../searchObject';
import { cleanupTempDirs, harnessFor, publishedDeclaration } from './support';
import type { SapTool } from '../../../server';

afterEach(() => {
  cleanupTempDirs();
});

const TOOLS: ReadonlyArray<readonly [string, SapTool]> = [
  ['SearchObject', searchObject],
  ['GetInclude', getInclude],
  ['GetInactiveObjects', getInactiveObjects],
  ['GrepObjects', grepObjects],
  ['CheckSyntax', checkSyntax],
  ['GetSourceDiff', getSourceDiff],
  ['GetClass', getClass],
  ['GetProgram', getProgram],
  ['GetFunctionModule', getFunctionModule],
];

describe('tools/list 선언이 구 번들 채록본과 일치한다', () => {
  it.each(TOOLS)('%s', async (name, tool) => {
    const harness = await harnessFor(tool);
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
      }).toEqual(publishedDeclaration(name));
    } finally {
      await harness.close();
    }
  });
});

describe('노출 선언은 구 핸들러의 디렉터리·available_in을 그대로 옮겼다', () => {
  it.each([
    ['SearchObject', searchObject, ['readonly'], ['onprem', 'cloud']],
    ['GetInclude', getInclude, ['readonly'], ['onprem', 'cloud', 'legacy']],
    ['GetInactiveObjects', getInactiveObjects, ['readonly'], ['onprem', 'cloud']],
    ['GrepObjects', grepObjects, ['readonly'], ['onprem', 'cloud', 'legacy']],
    ['CheckSyntax', checkSyntax, ['readonly'], ['onprem', 'cloud', 'legacy']],
    ['GetSourceDiff', getSourceDiff, ['readonly'], ['onprem', 'cloud', 'legacy']],
    ['GetClass', getClass, ['high'], ['onprem', 'cloud', 'legacy']],
    ['GetProgram', getProgram, ['high'], ['onprem', 'legacy']],
    ['GetFunctionModule', getFunctionModule, ['high'], ['onprem', 'cloud', 'legacy']],
  ] as ReadonlyArray<readonly [string, SapTool, string[], string[]]>)(
    '%s',
    (_name, tool, sets, availableIn) => {
      expect(tool.definition.sets).toEqual(sets);
      expect(tool.definition.available_in).toEqual(availableIn);
      // 아홉 종 전부 정책 분류는 read다 — 게이트가 이 축으로 판단한다.
      expect(tool.definition.kind).toBe('read');
    },
  );
});

describe('노출 집합이 실제로 목록을 가른다', () => {
  it('readonly 표면에서는 high 도구가 목록에 없다', async () => {
    // `--exposition=readonly,high`를 쓰는 공용 하네스와 달리, 여기서는 high가
    // 정말로 별도 스위치인지 본다. GetClass는 high에만 있다.
    const harness = await harnessFor(getClass);
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools.map((tool) => tool.name)).toEqual(['GetClass']);
    } finally {
      await harness.close();
    }
  });

  it('cloud 축에서 GetProgram은 목록에서 빠진다', async () => {
    // 배포 축 필터는 서버 코어가 걸고, 이 도구의 선언이 그 판정의 입력이다.
    expect(getProgram.definition.available_in).not.toContain('cloud');
  });
});
