/**
 * 대장 게이트 — 커밋된 `TOOL-LEDGER.md`가 **계산 결과와 같은가.**
 *
 * 대장을 손으로 고치면 여기서 걸린다. 반대로 입력(등록점·증거 파일·제작 계획)이
 * 바뀌었는데 대장을 다시 만들지 않아도 걸린다 — 둘은 같은 실패다. 진척표가
 * 실제와 어긋난 채 다음 판의 계획 근거가 되는 것을 막는 것이 이 게이트의 일이다.
 *
 * 판정은 `harness/ledger`가 소유한다. 여기서 다시 짜지 않는다.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

import { createReport, here } from './lib.mjs';

const require = createRequire(import.meta.url);

const ledger = require(here('../dist/harness/ledger/index.js'));

/**
 * @param ledgerPath 대조할 커밋본. 게이트 자체의 음성시험이 일부러 고친 사본을
 *   물려 "이 게이트가 정말 거부하는지"를 확인할 수 있다.
 */
export async function run({ ledgerPath = null } = {}) {
  const report = createReport('대장 게이트');

  const engineRoot = ledger.findEngineRoot();
  const target = ledgerPath ?? path.join(engineRoot, ledger.LEDGER_PATH);

  const model = ledger.collectLedger();
  const rendered = ledger.renderLedger(model);
  const committed = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  const verdict = ledger.checkLedger(rendered, committed);

  report.check(
    `${ledger.LEDGER_PATH} 가 계산 결과와 같다`,
    verdict.ok,
    verdict.ok
      ? `안 지음 ${model.coverage.totals.notBuilt} · 증거 대기 ${model.coverage.totals.awaitingEvidence} · 증거 있음 ${model.coverage.totals.evidenced}`
      : `${verdict.reason} — \`node harness/render-ledger.mjs\`로 다시 만들어라`,
  );

  // 등록점을 안 넘기면 `안 지음`이 아예 판정되지 않는다 — 그때 대장은 전부
  // "지음"으로 보이면서도 초록이다. 그 조용한 실패를 막는다.
  report.check(
    '등록점 스냅샷을 실제로 넘겼다 (`안 지음`을 판정했다)',
    model.coverage.registryKnown,
    model.coverage.registryKnown ? '' : '등록점 없이 계산했다 — 「안 지음」이 판정되지 않았다',
  );

  report.check(
    '도구 전체 목록이 구 표면 채록본의 전량 선언이다',
    model.coverage.totals.tools > 100,
    `${model.coverage.totals.tools}종`,
  );

  return report;
}
