/**
 * tier 게이트 음성시험용 장치 — **서버 코어를 세워** 게이트를 실제로 통과시킨다.
 *
 * 성격별 `__tests__/harness.ts`(쓰기 묶음)는 도구 핸들러를 **직접** 부른다. 그
 * 통로에는 tier 게이트가 없다 — 게이트는 서버 코어의 도구 앞 관문에 걸려 있기
 * 때문이다(`src/server/core.ts`). 그래서 "QA에서 거부되는가"를 그 하네스로
 * 물으면 **언제나 통과한다**(게이트를 통째로 들어내도 결과가 같다).
 *
 * 여기서는 `src/tools/runtime/__tests__/support.ts`의 `probeTier`와 같은 방식을
 * 쓴다 — 서버 코어를 세우고, **부르면 안 되는 접속 공장**을 주입한다.
 *
 * `isError`만 보면 헛돈다. 게이트가 없어도 이 공장이 던져서 `isError`가 참이 되기
 * 때문이다(`gates/safety.mjs`가 리뷰 사보타주로 실증한 함정). 그래서 판정은
 * **접속 시도 횟수**로 한다 — 게이트가 앞에서 막았다면 0이다.
 *
 * 이 파일은 시험이 아니다(`testMatch`가 `*.test.ts`만 고른다). 여러 성격 폴더의
 * 시험이 함께 쓰므로 `src/tools/__tests__/`에 둔다.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AdtClient } from '../../adt';
import { createServerCore, resolveStartup } from '../../server';
import type { SapTool } from '../../server';

/** 시험이 쓰는 SAP 오리진. 죽은 루프백이며 접속은 어차피 열리지 않는다. */
const TEST_ORIGIN = 'http://127.0.0.1:1';

const created: string[] = [];

/** 이 장치가 만든 임시 디렉터리를 지운다. 시험의 `afterAll`이 부른다. */
export function cleanupTierProbeDirs(): void {
  while (created.length > 0) {
    const dir = created.pop();
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // 임시 디렉터리 정리 실패는 시험 결과가 아니다.
    }
  }
}

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-tier-'));
  created.push(dir);
  return dir;
}

/**
 * 프로파일 하나를 쓴다. `tier`가 빈 문자열이면 `SAP_TIER` 줄 자체를 빼서
 * **tier 미해석**(fail-closed 판정의 입력)을 만든다.
 */
function writeProfile(tier: string): string {
  const dir = tempDir();
  const envPath = path.join(dir, 'sap.env');
  fs.writeFileSync(
    envPath,
    [
      `SAP_URL=${TEST_ORIGIN}`,
      'SAP_USERNAME=FIXTURE',
      'SAP_PASSWORD=fixture-not-a-secret',
      'SAP_CLIENT=100',
      ...(tier ? [`SAP_TIER=${tier}`] : []),
      // 이송·패키지 묶음에는 onprem 축에만 있는 도구가 있다 — 기본 cloud로는
      // 목록에 뜨지 않는다.
      'SAP_SYSTEM_TYPE=onprem',
    ].join('\n'),
    'utf8',
  );
  return envPath;
}

const MCP_ERROR_PREFIX = /^MCP error -\d+: /;

export interface TierProbe {
  readonly isError: boolean;
  readonly text: string;
  /** 접속 공장이 불린 횟수. 게이트가 앞에서 막았다면 0이어야 한다. */
  readonly connections: number;
}

/**
 * 도구 하나를 주어진 tier에서 불러 본다. **SAP에 한 바이트도 나가지 않는다** —
 * 접속 공장이 접속을 만들지 않고 던지기 때문이다.
 */
export async function probeTier(
  tool: SapTool,
  tier: string,
  args: Record<string, unknown>,
): Promise<TierProbe> {
  const envPath = writeProfile(tier);
  const cwd = tempDir();
  const state = { calls: 0 };

  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/sapkit-engine/entry.js', '--exposition=readonly,high'],
    env: { MCP_ENV_PATH: envPath },
    cwd,
    homedir: cwd,
  });

  const core = createServerCore({
    startup,
    tools: [tool],
    connectionFactory: (): AdtClient => {
      state.calls += 1;
      throw new Error('접속을 열려고 했다 — 게이트가 앞에서 막았어야 한다');
    },
    stderr: () => {},
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'tier-probe', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);

  let text: string;
  let isError: boolean;
  try {
    const result = (await client.callTool({
      name: tool.definition.name,
      arguments: args,
    })) as { isError?: boolean; content?: Array<{ text?: unknown }> };
    text = (result.content ?? []).map((item) => String(item.text ?? '')).join('\n');
    isError = result.isError === true;
  } catch (error) {
    // 게이트 거부는 프로토콜 오류로 올라온다 — 결과 객체가 아니라 예외다.
    text = String((error as { message?: unknown })?.message ?? error);
    isError = true;
  } finally {
    await client.close();
    await core.server.close();
  }

  return { isError, text: text.replace(MCP_ERROR_PREFIX, ''), connections: state.calls };
}
