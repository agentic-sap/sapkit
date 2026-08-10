/**
 * 표면 게이트 — 신 엔진이 발행하는 도구 표면이 구 엔진과 같은가.
 *
 * spec §4-2의 세 상태를 실제로 가르는지 본다:
 *   · 연결 상태(onprem 프로파일)  → M1 19종 정확 일치
 *   · 무프로파일 inspection-only   → M1 ∩ 155 = 14종
 *   · readonly                     → M1 ∩ 65 = 7종
 *
 * 그리고 **실제로 `tools/list`로 나가는 선언**(이름·설명·inputSchema·execution)을
 * `harness/old-surface/m1-tools.json`(구 번들 오프라인 채록본)과 통째로 대조한다.
 * 수를 세는 것만으로는 "이름은 같은데 인자가 다른" 표류를 못 잡는다.
 */
import * as fs from 'node:fs';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  boot,
  cleanupTempDirs,
  createReport,
  exposedNames,
  firstDifference,
  here,
  server,
  writeProfileEnv,
} from './lib.mjs';

export const CAPTURED_PATH = here('../harness/old-surface/m1-tools.json');

const provenance = JSON.parse(
  fs.readFileSync(here('../../interactive/provenance/mcp-surface.json'), 'utf8'),
);
const NO_PROFILE_DEFAULT = new Set(provenance.expositions.default.names);
const NO_PROFILE_READONLY = new Set(provenance.expositions.readonly.names);

/** 실제 MCP 왕복으로 `tools/list`를 받아 온다 — 내부 상태를 훔쳐보지 않는다. */
async function listTools({ exposition, envPath }) {
  const startup = boot({ exposition, envPath });
  const core = server.createServerCore({ startup, stderr: () => {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await core.server.connect(serverTransport);
  const client = new Client({ name: 'surface-gate', version: '0.0.0' });
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    return listed.tools;
  } finally {
    await client.close();
    await core.server.close();
  }
}

/**
 * @param capturedPath 대조 기준이 될 채록본. 게이트 자체의 음성시험이
 *   일부러 망가뜨린 사본을 물려 "이 게이트가 정말 거부하는지"를 확인한다.
 */
export async function run({ capturedPath = CAPTURED_PATH } = {}) {
  const captured = JSON.parse(fs.readFileSync(capturedPath, 'utf8'));
  const M1 = Object.keys(captured.m1).sort();
  const expectDefault = M1.filter((n) => NO_PROFILE_DEFAULT.has(n));
  const expectReadonly = M1.filter((n) => NO_PROFILE_READONLY.has(n));

  const report = createReport('표면 게이트');
  const onprem = writeProfileEnv({ SAP_SYSTEM_TYPE: 'onprem' });

  const connected = exposedNames({ exposition: 'readonly,high', envPath: onprem });
  const noProfile = exposedNames({ exposition: 'readonly,high' });
  const readonly = exposedNames({ exposition: 'readonly' });

  const sameSet = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  report.check(
    `연결 상태에서 M1 ${M1.length}종 정확 일치`,
    sameSet(connected.names, M1),
    sameSet(connected.names, M1)
      ? `${connected.names.length}종`
      : `실제 ${connected.names.length}종 · 빠짐 [${M1.filter((n) => !connected.names.includes(n))}] · 여분 [${connected.names.filter((n) => !M1.includes(n))}]`,
  );
  report.check(
    `무프로파일에서 M1 ∩ 155 = ${expectDefault.length}종`,
    sameSet(noProfile.names, expectDefault),
    `실제 ${noProfile.names.length}종`,
  );
  report.check(
    `readonly에서 M1 ∩ 65 = ${expectReadonly.length}종`,
    sameSet(readonly.names, expectReadonly),
    `실제 ${readonly.names.length}종`,
  );
  report.check(
    '세 상태가 실제로 갈린다 (노출 제어 역검증)',
    connected.names.length > noProfile.names.length &&
      noProfile.names.length > readonly.names.length,
    `${connected.names.length} > ${noProfile.names.length} > ${readonly.names.length}`,
  );

  // 발행 선언 통째 대조 — 실제 MCP 왕복 결과 대 구 번들 채록본.
  const listed = await listTools({ exposition: 'readonly,high', envPath: onprem });
  const byName = new Map(listed.map((t) => [t.name, t]));
  let compared = 0;
  for (const name of M1) {
    const want = captured.m1[name];
    const got = byName.get(name);
    if (!want || !got) {
      report.check(`선언 대조 ${name}`, false, got ? '채록본에 없다' : '발행되지 않았다');
      continue;
    }
    // 발행 객체에는 SDK가 undefined 필드(annotations·_meta)를 얹으므로
    // 채록본이 가진 키만 대조한다 — 채록본 자체가 구 엔진의 발행 결과다.
    const trimmed = Object.fromEntries(Object.keys(want).map((k) => [k, got[k]]));
    const diff = firstDifference(want, trimmed);
    report.check(`선언 대조 ${name}`, diff === null, diff ?? '');
    compared += 1;
  }
  report.check('19종 전부를 대조했다', compared === M1.length, `${compared}/${M1.length}`);

  cleanupTempDirs();
  return report;
}
