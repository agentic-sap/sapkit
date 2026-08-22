/**
 * 진척 대장 — **계산해 만들고, 게이트가 커밋본과 대조한다.**
 *
 * 여기서 못박는 것은 넷이다.
 *   ① 손으로 고친 대장을 대조가 **거부한다** (음성시험)
 *   ② 멀쩡한 대장은 **통과한다** (과수리 역검증)
 *   ③ 상태 계산이 **등록점 하나만** 본다 — 시험이 깨진 등록 도구가 `안 지음`으로
 *      떨어지면 다음 판이 같은 도구를 다시 짓는다
 *   ④ 아직 없는 입력(T7 계획 · 재생 판정)에 죽지 않고 「미정」·「미기록」으로 낸다
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LEDGER_PATH, checkLedger, collectLedger, renderLedger } from '..';

const ENGINE_ROOT = path.resolve(__dirname, '../../..');
const NOWHERE = path.join(os.tmpdir(), 'sapkit-없는-입력');

function tempFile(body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-ledger-'));
  const file = path.join(dir, 'evidence.json');
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

function rowOf(text: string, tool: string): string {
  const line = text.split('\n').find((l) => l.startsWith(`| ${tool} |`));
  if (line === undefined) throw new Error(`대장에 ${tool} 행이 없다`);
  return line;
}

describe('입력이 아직 없을 때 — 죽지 않고 사실대로 낸다', () => {
  it('T7 제작 계획이 없으면 묶음·순서를 「미정」으로 낸다', () => {
    const model = collectLedger({ planPath: path.join(NOWHERE, 'build-plan.json') });

    expect(model.plan).toBeNull();
    expect(rowOf(renderLedger(model), 'GetClass')).toContain('미정');
  });

  it('T7 계획이 없어도 요구 급은 기본값(계약 시험)이고, 그 사실을 드러낸다', () => {
    const model = collectLedger({ planPath: path.join(NOWHERE, 'build-plan.json') });
    const row = model.coverage.tools.find((r) => r.tool === 'GetClass');

    expect(row?.requiredGrade).toBe('contract');
    expect(rowOf(renderLedger(model), 'GetClass')).toContain('미정(→계약 시험)');
  });

  it('재생 판정 파일이 없으면 재생 증거를 「미기록」으로 센다', () => {
    const model = collectLedger({ replayVerdictDir: NOWHERE });
    const row = model.coverage.tools.find((r) => r.tool === 'GetProgram');

    // 픽스처는 커밋돼 있지만 판정 파일이 없다 — 통과로 세지 않는다.
    expect(row?.replay.status).toBe('none');
    expect(rowOf(renderLedger(model), 'GetProgram')).toContain('판정 미기록');
  });

  it('계약 시험 결과 파일이 없으면 「결과 미기록」이다 — 시험 파일이 있어도 통과가 아니다', () => {
    const model = collectLedger({ contractResultsPath: path.join(NOWHERE, 'results.json') });
    const row = model.coverage.tools.find((r) => r.tool === 'GetClass');

    expect(row?.contract.status).toBe('none');
    expect(rowOf(renderLedger(model), 'GetClass')).toContain('결과 미기록');
  });
});

describe('상태 판정 — 등록점 하나만 본다', () => {
  it('시험이 깨진 등록 도구는 `안 지음`이 아니라 `증거 대기`다', () => {
    const model = collectLedger({
      registered: ['GetClass'],
      contractResultsPath: tempFile(JSON.stringify([{ tool: 'GetClass', passed: false }])),
      // 상태 판정만 좁혀 본다 — 레포의 실제 재생 판정을 읽으면 이 시험은
      // 「GetClass에 증거가 있는가」라는 딴 질문에 답하게 된다.
      replayVerdictDir: NOWHERE,
    });
    const row = model.coverage.tools.find((r) => r.tool === 'GetClass');

    expect(row?.contract.status).toBe('fail');
    expect(row?.status).toBe('awaiting-evidence');
  });

  it('등록점에 없는 도구만 `안 지음`이다', () => {
    const model = collectLedger({ registered: ['GetClass'], replayVerdictDir: NOWHERE });

    expect(model.coverage.tools.find((r) => r.tool === 'GetClass')?.status).toBe('awaiting-evidence');
    expect(model.coverage.tools.find((r) => r.tool === 'ReadTable')?.status).toBe('not-built');
  });

  it('등록점 스냅샷을 실제로 넘긴다 — 넘기지 않으면 `안 지음`이 아예 안 잡힌다', () => {
    expect(collectLedger().coverage.registryKnown).toBe(true);
  });
});

describe('위임형 여부 — 구 도구가 `@babamba2/*`에 기대는 깊이', () => {
  const model = collectLedger();

  it('구 엔진 소스에서 직접과 간접을 가른다', () => {
    expect(model.facts.get('CreateClass')?.delegated).toBe('direct');
    // 겉 핸들러는 `@babamba2`를 직접 안 부르지만 `lib/clients.ts`를 거쳐 닿는다.
    expect(model.facts.get('GetProgFullCode')?.delegated).toBe('indirect');
  });

  it('총계가 도구 전량을 덮는다 — 어느 도구도 판정에서 빠지지 않는다', () => {
    const { direct, indirect, none } = model.delegation;

    expect(direct + indirect + none).toBe(model.coverage.totals.tools);
  });

  it('파일 수와 도구 수를 따로 싣는다 — 46과 161을 화해시키는 수들이다', () => {
    const d = model.delegation;

    expect(d.directHandlerFiles).toBe(d.direct + d.filesOutsideSurface);
    expect(d.filesOutsideSurface).toBeGreaterThan(0);
  });

  it('대장이 그 화해를 글자로 적는다', () => {
    const text = renderLedger(model);

    expect(text).toContain('단위가 다르다');
    expect(text).toContain(`${model.delegation.directHandlerFiles}파일`);
    expect(text).toContain(`직접 위임하는 도구는 ${model.delegation.direct}종`);
    expect(text).toContain(`간접 ${model.delegation.indirect}종`);
    expect(text).toContain(`나머지 ${model.delegation.filesOutsideSurface}파일`);
  });

  it('「없음 0」이면 그것이 성긴 계산이 아님을 대장이 함께 적는다', () => {
    expect(model.delegation.none).toBe(0);
    expect(renderLedger(model)).toContain('계산이 성긴 탓이 아니다');
  });

  it('구 엔진 소스가 없으면 「미상」이다 — 없는 것을 「없음」으로 적지 않는다', () => {
    const blind = collectLedger({ handlerTreePath: NOWHERE });

    expect(blind.facts.get('CreateClass')?.delegated).toBeNull();
    expect(blind.delegation.known).toBe(false);
    expect(rowOf(renderLedger(blind), 'CreateClass')).toContain('미상');
    expect(renderLedger(blind)).toContain('판정하지 않았다');
  });
});

describe('대장 머리 — 손으로 고치지 말라는 경고와 재생성 명령', () => {
  const text = renderLedger(collectLedger());

  it('경고가 있다', () => {
    expect(text).toContain('손으로 고치지 마라');
  });

  it('재생성 명령이 있다', () => {
    expect(text).toContain('node harness/render-ledger.mjs');
    expect(text).toContain('--check');
  });

  it('생성 시각 같은 비결정 값을 싣지 않는다 — 두 번 돌려도 같은 글자다', () => {
    expect(renderLedger(collectLedger())).toBe(text);
  });
});

describe('--check 대조', () => {
  const expected = renderLedger(collectLedger());

  it('멀쩡한 대장은 통과한다 (과수리 역검증)', () => {
    expect(checkLedger(expected, expected).ok).toBe(true);
  });

  it('커밋된 대장이 생성물과 같다 — 대장이 낡지 않았다', () => {
    const committed = fs.readFileSync(path.join(ENGINE_ROOT, LEDGER_PATH), 'utf8');
    const verdict = checkLedger(expected, committed);

    expect(verdict.reason).toBeNull();
    expect(verdict.ok).toBe(true);
  });

  it('손으로 한 칸 고친 대장을 거부한다 (음성시험)', () => {
    const lines = expected.split('\n');
    const at = lines.findIndex((l) => l.startsWith('| GetClass |'));
    expect(at).toBeGreaterThan(0);
    const tampered = [...lines];
    // 변형 대상은 **도구 이름 칸**이다. 상태 값(`미정` 같은)을 노리면 제작 계획이 생기거나
    // 증거가 붙는 순간 그 글자가 사라져 치환이 무효가 되고, 음성시험이 조용히 자기 자신을
    // 통과시킨다 — 실제로 한 번 그렇게 깨졌다. 이름 칸은 어떤 진척 상태에서도 남는다.
    tampered[at] = (tampered[at] as string).replace('| GetClass |', '| GetClazz |');
    expect(tampered.join('\n')).not.toBe(expected);

    const verdict = checkLedger(expected, tampered.join('\n'));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain(String(at + 1));
  });

  it('요약의 수를 손으로 늘린 대장을 거부한다 (음성시험)', () => {
    const tampered = expected.replace('**안 지음', '**안 지음 0 · 원래 안 지음');
    expect(tampered).not.toBe(expected);

    expect(checkLedger(expected, tampered).ok).toBe(false);
  });

  it('커밋본이 아예 없으면 거부한다', () => {
    const verdict = checkLedger(expected, null);

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('없다');
  });

  it('줄바꿈 형식 차이는 거부 사유가 아니다 — 그것으로 죽으면 게이트가 장식이 된다', () => {
    expect(checkLedger(expected, expected.replace(/\n/g, '\r\n')).ok).toBe(true);
  });
});

describe('배선 정적 대조 — SAP에 붙는 스크립트는 돌리지 않는다', () => {
  const replayScript = fs.readFileSync(path.join(ENGINE_ROOT, 'harness', 'replay-attended.mjs'), 'utf8');
  const gate = fs.readFileSync(path.join(ENGINE_ROOT, 'gates', 'ledger.mjs'), 'utf8');
  const runAll = fs.readFileSync(path.join(ENGINE_ROOT, 'gates', 'run-all.mjs'), 'utf8');

  it('재생 러너가 판정 파일을 고정 경로에 쓴다', () => {
    expect(replayScript).toContain('replayVerdictDocument');
    expect(replayScript).toContain('evidence');
    expect(replayScript).toContain('replay');
  });

  it('재생 러너가 판정 직렬화를 스스로 다시 짜지 않는다', () => {
    // 형식의 정본은 `harness/ledger/evidence.ts` 하나여야 한다.
    expect(replayScript).not.toContain('formatVersion: 1');
  });

  it('게이트가 대조 함수를 부른다', () => {
    expect(gate).toContain('checkLedger');
  });

  it('일괄 실행기에 대장 게이트가 등록돼 있다', () => {
    expect(runAll).toContain('./ledger.mjs');
    expect(runAll).toContain('대장');
  });
});

describe('요구 급 인하 표시 — 증거가 는 것과 요구가 내려간 것을 섞지 않는다', () => {
  /** 인하 하나만 든 계획을 합성해 물린다 — 실제 계획이 바뀌어도 이 시험은 흔들리지 않는다. */
  const planWith = (tools: Record<string, unknown>): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapkit-plan-'));
    const file = path.join(dir, 'build-plan.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ formatVersion: 1, bundles: [{ id: 'b', title: '묶음', order: 1 }], tools }),
      'utf8',
    );
    return file;
  };

  const DOWNGRADED = planWith({
    GetClass: { bundle: 'b', requiredGrade: 'contract', downgradedFrom: 'replay' },
    GetEnhancements: { bundle: 'b', requiredGrade: 'contract' },
  });

  it('인하분의 요구 급 칸에 인하 표시와 인하 전 급이 함께 붙는다', () => {
    const text = renderLedger(collectLedger({ planPath: DOWNGRADED }));

    expect(rowOf(text, 'GetClass')).toContain('계약 시험 (인하 · 원래 재생 대조)');
  });

  it('처음부터 계약 시험이던 도구에는 붙지 않는다 — 두 사실이 구별돼야 한다', () => {
    const text = renderLedger(collectLedger({ planPath: DOWNGRADED }));

    expect(rowOf(text, 'GetEnhancements')).toContain('계약 시험');
    expect(rowOf(text, 'GetEnhancements')).not.toContain('인하');
  });

  it('머리말이 인하 총수와 **인하 전 수치**를 병기한다', () => {
    const model = collectLedger({ planPath: DOWNGRADED });
    const head = renderLedger(model).split('\n').slice(0, 14).join('\n');

    expect(model.downgrade?.count).toBe(1);
    expect(head).toContain('요구 급 인하 1종');
    expect(head).toContain(`증거 대기 ${model.downgrade?.awaitingEvidenceBefore}`);
    expect(head).toContain(`증거 있음 ${model.downgrade?.evidencedBefore}`);
    expect(head).toContain('인하는 증거를 만든 것이 아니라 요구를 낮춘 것이다');
  });

  it('인하가 없는 계획에서는 그 문단이 아예 나오지 않는다', () => {
    const none = planWith({ GetClass: { bundle: 'b', requiredGrade: 'replay' } });
    const model = collectLedger({ planPath: none });

    expect(model.downgrade).toBeNull();
    // 입력 표는 「인하 0종」을 그대로 적는다 — 사라지는 것은 머리말의 그 문단이다.
    expect(renderLedger(model)).toContain('요구 급 인하 0종');
    expect(renderLedger(model)).not.toContain('인하는 증거를 만든 것이 아니라');
  });

  it('실제 커밋된 계획에도 인하가 서 있다 (D-092 ⓐ 집행)', () => {
    const model = collectLedger();

    expect(model.downgrade).not.toBeNull();
    expect(model.downgrade?.awaitingEvidenceBefore).toBeGreaterThan(model.coverage.totals.awaitingEvidence);
  });
});
