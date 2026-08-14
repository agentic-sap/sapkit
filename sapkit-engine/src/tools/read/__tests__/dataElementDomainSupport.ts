/**
 * `Get*`/`Read*` 짝(데이터 엘리먼트·도메인) 시험이 쓰는 보조 장치.
 *
 * `support.ts`의 `runTool`은 **진짜 MCP 왕복**을 태우지만 프로파일을 고정한다.
 * 이 짝은 `SAP_VERSION=ECC`에서 갈리느냐 아니냐가 계약의 일부라서, 프로파일을
 * 갈아 끼울 수 있는 통로가 따로 필요하다. 그 한 가지만 하는 자리다 —
 * 발행 계약과 평상시 와이어는 `runTool` 쪽이 본다.
 */

import { AdtClient } from '../../../adt';
import { testConfig } from '../../../adt/__tests__/testServer';
import type { ResolvedProfile } from '../../../contracts';
import { NOOP_LOGGER } from '../../../server';
import type { SapTool, ToolContext, ToolResult } from '../../../server';
import { TEST_ORIGIN, type RecordedRequest, type Reply, recordingTransport } from './support';

export interface DirectHarness {
  readonly context: ToolContext;
  readonly requests: RecordedRequest[];
  /** `getConnection()`이 몇 번 불렸나. ECC 단락(短絡)의 증거다. */
  connections(): number;
}

/**
 * 프로파일을 지정할 수 있는 도구 컨텍스트. 전송은 주입된 가짜이며 SAP에는 한
 * 바이트도 나가지 않는다.
 */
export function directHarness(options: {
  readonly sapVersion?: string | null;
  readonly reply?: (request: RecordedRequest, index: number) => Reply;
} = {}): DirectHarness {
  const recorder = recordingTransport(options.reply ?? (() => ({ status: 200, body: '' })));
  const config = testConfig(TEST_ORIGIN);
  const client = new AdtClient(config, { transport: recorder.transport, sleep: async () => {} });

  let connections = 0;
  const profile: ResolvedProfile = {
    connection: config,
    tier: 'DEV',
    systemType: 'onprem',
    sapVersion: options.sapVersion ?? null,
    envPath: null,
    alias: null,
    diagnostics: [],
  };

  const context: ToolContext = {
    getConnection: async () => {
      connections += 1;
      return client;
    },
    profile,
    logger: NOOP_LOGGER,
    env: {},
    reloadProfile: () => {
      throw new Error('이 시험 장치는 프로파일 재적재를 지원하지 않는다');
    },
  };

  return { context, requests: recorder.requests, connections: () => connections };
}

/** 도구 하나를 이 컨텍스트로 부른다. */
export function invokeDirect(
  tool: SapTool,
  harness: DirectHarness,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  return Promise.resolve(tool.handler(harness.context, args));
}

export function textOf(result: ToolResult): string {
  return result.content.map((item) => item.text).join('\n');
}
