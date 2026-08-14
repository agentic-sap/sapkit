/**
 * 단위시험 묶음 시험의 공용 장치.
 *
 * 옆의 `support.ts`와 다른 점은 **둘**뿐이고, 둘 다 이 묶음의 성질에서 온다.
 *
 *  1. 노출 집합이 `readonly,high`다 — 단위시험 네 종은 `sets: ['high']`라서
 *     `--exposition=readonly`만으로는 `tools/list`에 뜨지 않는다(채록본의
 *     `exposures`에서 `*_readonly` 두 조건에 이 넷이 없다).
 *  2. **도구 여러 종을 한 서버에 올릴 수 있다.** `RunUnitTest`가 만든 `run_id`를
 *     `GetUnitTest*` 세 종이 되읽는 것이 이 묶음의 계약인데, 그 되읽기는 **같은
 *     접속 객체**를 열쇠로 쓴다(`internal/unitTestRuns.ts`). 도구마다 서버를 새로
 *     세우면 접속도 새것이라 그 계약을 시험할 수 없다.
 *
 * 나머지는 같다 — **SAP에 붙지 않는다.** MCP 규약은 SDK의 `InMemoryTransport`로
 * 같은 프로세스에서 진짜로 오가고, SAP 쪽만 전송 주입으로 끊는다. 자식 프로세스도
 * 띄우지 않는다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { AdtClient } from '../../../adt';
import type { HttpTransport } from '../../../adt';
import type { ConnectionConfig } from '../../../contracts';
import { createServerCore, resolveStartup } from '../../../server';
import type { SapTool } from '../../../server';
import { runUnitTest } from '../runUnitTest';

import {
  type CallOutcome,
  type RecordedRequest,
  type Responder,
  TEST_ORIGIN,
  callTool,
  recordingTransport,
  tempDir,
} from './support';

export {
  cleanupTempDirs,
  csrfAware,
  isCsrfFetch,
  jsonOf,
  publishedDeclaration,
  recordingTransport,
  toolRequests,
} from './support';
export type { CallOutcome, RecordedRequest, Reply, Responder } from './support';

export interface UnitTestHarness {
  readonly client: Client;
  close(): Promise<void>;
}

export interface UnitTestHarnessOptions {
  readonly transport?: HttpTransport;
  /** 기본 `DEV`. tier 게이트 음성시험이 이것을 바꾼다. */
  readonly tier?: string;
  /** 접속 공장 교체점 — 접속 시도 횟수를 세는 음성시험이 쓴다. */
  readonly connectionFactory?: (config: ConnectionConfig) => AdtClient;
}

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
      `SAP_TIER=${tier}`,
      'SAP_SYSTEM_TYPE=onprem',
    ].join('\n'),
    'utf8',
  );
  return envPath;
}

/** 도구 여러 종을 한 서버에 올린다. 노출 집합은 `readonly,high`. */
export async function harnessForTools(
  tools: readonly SapTool[],
  options: UnitTestHarnessOptions = {},
): Promise<UnitTestHarness> {
  const envPath = writeProfile(options.tier ?? 'DEV');
  const cwd = tempDir();

  const startup = resolveStartup({
    argv: ['/usr/bin/node', '/app/sapkit-engine/entry.js', '--exposition=readonly,high'],
    env: { MCP_ENV_PATH: envPath },
    cwd,
    homedir: cwd,
  });

  const core = createServerCore({
    startup,
    tools: [...tools],
    connectionFactory:
      options.connectionFactory ??
      ((config) =>
        new AdtClient(
          config,
          options.transport ? { transport: options.transport, sleep: async () => {} } : {},
        )),
    stderr: () => {},
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'unit-test-tools-test', version: '0.0.0' });
  await Promise.all([core.server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    async close() {
      await client.close();
      await core.server.close();
    },
  };
}

/** 도구 하나만 올린 서버. */
export function harnessFor(
  tool: SapTool,
  options: UnitTestHarnessOptions = {},
): Promise<UnitTestHarness> {
  return harnessForTools([tool], options);
}

export { callTool };

/** 도구 하나를 세우고 부른 뒤 정리까지 하는 한 벌. */
export async function runTool(
  tool: SapTool,
  args: Record<string, unknown>,
  reply: Responder,
): Promise<{ outcome: CallOutcome; requests: RecordedRequest[] }> {
  const recorder = recordingTransport(reply);
  const harness = await harnessFor(tool, { transport: recorder.transport });
  try {
    const outcome = await callTool(harness, tool.definition.name, args);
    return { outcome, requests: recorder.requests };
  } finally {
    await harness.close();
  }
}

/** 도구 하나를 세우고 `tools/list`의 그 선언을 돌려준다. */
export async function publishedOf(tool: SapTool): Promise<{
  name: string;
  description: string;
  inputSchema: unknown;
  execution: unknown;
}> {
  const harness = await harnessFor(tool);
  try {
    const listed = await harness.client.listTools();
    const found = listed.tools.find((entry) => entry.name === tool.definition.name) as
      | { name: string; description: string; inputSchema: unknown; execution: unknown }
      | undefined;
    if (!found) throw new Error(`${tool.definition.name}이 tools/list에 없다`);
    return {
      name: found.name,
      description: found.description,
      inputSchema: found.inputSchema,
      execution: found.execution,
    };
  } finally {
    await harness.close();
  }
}

/** `RunUnitTest`가 실제로 답하는 결과 XML 자리에 놓는 픽스처. */
export const RUN_RESULT_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit">' +
  '<program adtcore:name="ZCL_FIXTURE" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<testClasses><testClass adtcore:name="LTCL_FIXTURE"/></testClasses>' +
  '</program></aunit:runResult>';

export interface StartedRun {
  readonly harness: UnitTestHarness;
  readonly runId: string;
  /** 첫 되읽기 도구를 부른다 — `RunUnitTest`와 **같은 접속**을 쓴다. */
  read(args: Record<string, unknown>): Promise<CallOutcome>;
  /** 함께 올린 되읽기 도구 중 하나를 골라 부른다. */
  readWith(tool: SapTool, args: Record<string, unknown>): Promise<CallOutcome>;
  /** 전송이 실제로 받은 요청들(CSRF 왕복 포함). */
  requests(): readonly RecordedRequest[];
  close(): Promise<void>;
}

/**
 * `RunUnitTest`로 실행 하나를 캐시에 넣고, 되읽기 도구를 **같은 서버**에서 부를 수
 * 있게 한다. 이 묶음의 계약이 접속 객체를 열쇠로 삼기 때문에 서버가 하나여야 한다.
 */
export async function startRun(
  readTools: SapTool | readonly SapTool[],
  options: { readonly resultXml?: string } = {},
): Promise<StartedRun> {
  const readers = Array.isArray(readTools) ? [...readTools] : [readTools as SapTool];
  const first = readers[0];
  if (first === undefined) throw new Error('되읽기 도구를 하나 이상 줘야 한다');
  const body = options.resultXml ?? RUN_RESULT_XML;
  const recorder = recordingTransport((request) =>
    request.url.includes('/discovery')
      ? { headers: { 'x-csrf-token': 'TEST-TOKEN' } }
      : { status: 200, body },
  );
  const harness = await harnessForTools([runUnitTest, ...readers], {
    transport: recorder.transport,
  });
  const started = await callTool(harness, 'RunUnitTest', {
    tests: [{ container_class: 'ZCL_FIXTURE', test_class: 'LTCL_FIXTURE' }],
  });
  if (started.isError) throw new Error(`RunUnitTest 준비 실패: ${started.text}`);
  const runId = String((JSON.parse(started.text) as { run_id: unknown }).run_id);

  return {
    harness,
    runId,
    read: (args) => callTool(harness, first.definition.name, args),
    readWith: (tool, args) => callTool(harness, tool.definition.name, args),
    requests: () => recorder.requests,
    close: () => harness.close(),
  };
}

export interface TierProbe {
  readonly outcome: CallOutcome;
  /** 접속 공장이 불린 횟수. 게이트가 앞에서 막았다면 0이어야 한다. */
  readonly connections: number;
}

/**
 * tier 게이트 음성시험용 — **부르면 안 되는 접속 공장**을 주입하고 호출한다.
 *
 * `isError`만 보면 헛돈다. 게이트를 통째로 들어내도 이 공장이 던져서 `isError`가
 * 참이 되기 때문이다(`gates/safety.mjs:148-150`가 리뷰 사보타주로 실증한 함정).
 * 그래서 **접속 시도 횟수**를 함께 돌려준다 — 거부라면 0이다.
 */
export async function probeTier(
  tool: SapTool,
  tier: string,
  args: Record<string, unknown>,
): Promise<TierProbe> {
  const state = { calls: 0 };
  const harness = await harnessFor(tool, {
    tier,
    connectionFactory: () => {
      state.calls += 1;
      throw new Error('접속을 열려고 했다 — 게이트가 앞에서 막았어야 한다');
    },
  });
  try {
    const outcome = await callTool(harness, tool.definition.name, args);
    return { outcome, connections: state.calls };
  } finally {
    await harness.close();
  }
}
