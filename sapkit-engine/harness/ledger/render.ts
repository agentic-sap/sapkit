/**
 * 대장을 글자로 낸다 — 그리고 **커밋본과 대조한다.**
 *
 * 대장은 손으로 쓰지 않는다. 손으로 쓴 진척표는 언제나 실제보다 앞서 있고,
 * 앞서 있다는 사실을 아무도 모른 채 다음 판의 계획 근거가 된다. 그래서 여기서
 * 내는 글자는 **입력에서 계산된 것뿐**이고, `--check`가 그 글자를 커밋본과
 * 통째로 맞대 본다.
 *
 * 렌더에 **생성 시각 같은 비결정 값을 싣지 않는다.** 싣는 순간 대조는 매번
 * 실패하고, 게이트는 곧 꺼진다.
 */
import type { CoverageRow, EvidenceCell, EvidenceGrade, ToolStatus } from '../replay/coverage';
import type { LedgerModel, ToolFacts } from './collect';
import type { DelegationKind } from './delegation';

const GRADE_LABEL: Readonly<Record<EvidenceGrade, string>> = {
  replay: '재생 대조',
  contract: '계약 시험',
  attended: 'attended 실기',
  substitute: '대체 기대 시험',
};

const SECTIONS: readonly { readonly status: ToolStatus; readonly title: string; readonly gloss: string }[] = [
  {
    status: 'not-built',
    title: '안 지음',
    gloss: '등록점(`src/tools/registry.ts`)에 없다. 아직 짓지 않은 도구다.',
  },
  {
    status: 'awaiting-evidence',
    title: '지음 · 증거 대기',
    gloss:
      '등록점에 있다. 그러나 **요구 증거 급이 아직 안 찼다** — 다른 급의 증거가 있어도 요구 급을 대신하지 못한다.',
  },
  {
    status: 'evidenced',
    title: '증거 있음',
    gloss: '요구 증거 급이 찼다 (부가 요건이 있으면 그것까지).',
  },
];

const UNDECIDED = '미정';

function cell(value: EvidenceCell, fallback: string): string {
  if (value.count === 0) return fallback;
  return `${value.status === 'pass' ? '통과' : value.status === 'fail' ? '실패' : '—'}(${value.count})`;
}

function requiredText(row: CoverageRow, planned: boolean): string {
  const base = planned ? GRADE_LABEL[row.requiredGrade] : `${UNDECIDED}(→${GRADE_LABEL[row.requiredGrade]})`;
  return row.requiresSubstitute ? `${base} + 대체` : base;
}

const DELEGATION_LABEL: Readonly<Record<DelegationKind, string>> = {
  direct: '직접',
  indirect: '간접',
  none: '없음',
};

function delegatedText(delegated: DelegationKind | null): string {
  return delegated === null ? '미상' : DELEGATION_LABEL[delegated];
}

function rowLine(row: CoverageRow, facts: ToolFacts, planned: boolean): string {
  const columns = [
    row.tool,
    facts.bundle?.title ?? UNDECIDED,
    facts.bundle === null ? UNDECIDED : String(facts.bundle.order),
    requiredText(row, planned),
    cell(row.replay, facts.hasReplayFixture ? '픽스처 있음 · 판정 미기록' : '—'),
    cell(row.contract, facts.contractTestFile === null ? '—' : '시험 있음 · 결과 미기록'),
    cell(row.attended, '—'),
    cell(row.substitute, row.requiresSubstitute ? '요구 · 미기록' : '—'),
    delegatedText(facts.delegated),
  ];
  return `| ${columns.join(' | ')} |`;
}

export function renderLedger(model: LedgerModel): string {
  const { coverage, plan, facts } = model;
  const factsOf = (tool: string): ToolFacts =>
    facts.get(tool) ?? { hasReplayFixture: false, contractTestFile: null, delegated: null, bundle: null };
  const isPlanned = (tool: string): boolean => plan !== null && plan.tools[tool] !== undefined;

  const lines: string[] = [];
  lines.push('# TOOL-LEDGER — 진척 대장');
  lines.push('');
  lines.push('> **손으로 고치지 마라.** 이 파일은 등록점·표면 채록본·제작 계획·증거 파일에서 **계산해 생성**한다.');
  lines.push('> 손으로 고친 대장은 게이트가 거부한다.');
  lines.push('>');
  lines.push('> - 재생성: `node harness/render-ledger.mjs` (`sapkit-engine/`에서 · `npm run build` 뒤)');
  lines.push('> - 대조: `node harness/render-ledger.mjs --check` — `npm run gates`의 「대장」 게이트가 같은 판정을 한다');
  lines.push('');
  lines.push(
    `도구 ${coverage.totals.tools} · **안 지음 ${coverage.totals.notBuilt}** · ` +
      `**증거 대기 ${coverage.totals.awaitingEvidence}** · **증거 있음 ${coverage.totals.evidenced}**`,
  );
  lines.push('');

  // ── 위임형 열의 수 읽기 ────────────────────────────────────────────────────
  // 46(도구)과 161(파일)은 어긋나 보이지만 단위가 다르다. 이 문단이 없으면
  // 다음 세션이 "수가 안 맞는다"로 시간을 쓴다.
  lines.push('## 위임형 열을 읽는 법 — 두 수는 단위가 다르다');
  lines.push('');
  if (!model.delegation.known) {
    lines.push('구 엔진 소스를 읽지 못해 위임형을 **판정하지 않았다**. 전량 「미상」이다 — 없다는 뜻이 아니다.');
  } else {
    const d = model.delegation;
    lines.push(
      `구 핸들러에서 \`@babamba2/*\`를 **직접** 쓰는 것은 **${d.directHandlerFiles}파일**이고, ` +
        `이 표면 ${coverage.totals.tools}종 중 **직접 위임하는 도구는 ${d.direct}종**이다. ` +
        `**둘은 단위가 다르다** — 앞은 파일 수, 뒤는 도구 수다. ` +
        `나머지 ${d.filesOutsideSurface}파일은 이 표면 밖 이름이거나 도구 선언이 아예 없는 파일이다.`,
    );
    lines.push('');
    lines.push(
      `여기에 **간접 ${d.indirect}종**이 더 있다 — 겉 핸들러는 \`@babamba2\`를 직접 부르지 않지만 ` +
        `\`engine/src\` 안의 공용 헬퍼를 거쳐 닿는다. 이 열이 존재하는 이유가 그것이다: ` +
        '재생 대조를 미룬 도구에게는 **참조 원본의 깊이가 유일한 정확성 근거**이고, ' +
        '간접 위임을 「없음」으로 읽으면 안쪽 패키지를 안 읽고 겉만 보고 짓게 된다.',
    );
    lines.push('');
    lines.push(
      `판정 범위는 \`engine/src\` 아래 소스 **${d.sourceFiles}파일**이고, 상대 import(\`./x\`·\`../x.js\`·` +
        '`../x/index`)를 거슬러 도달 여부를 본다.',
    );
    lines.push('');
    if (d.none === 0) {
      lines.push(
        `**「없음 ${d.none}」은 계산이 성긴 탓이 아니다.** 타입 경로로만 닿는 도구는 **${d.typeOnlyReach}종**이다 — ` +
          `즉 ${d.direct + d.indirect}종 전부가 \`import type\`이 아니라 **값으로** \`@babamba2\`를 부르는 파일에 닿는다. ` +
          '겉 핸들러만 읽고 지어도 되는 도구는 이 표면에 없다는 뜻이다.',
      );
      lines.push('');
      lines.push(
        `되짚어 보면 방향이 반대다: 핸들러 파일 ${d.directHandlerFiles}개의 \`@babamba2\` 참조 중 **값 참조는 ` +
          `${d.directValueHandlerFiles}개뿐**이고 나머지는 타입이다. **런타임 위임은 겉이 아니라 \`engine/src/lib/\`에 있다** — ` +
          '자체 저작으로 갈아탈 때 실제로 갈아엎어야 하는 것은 핸들러가 아니라 그 공용 계층이다.',
      );
    } else {
      lines.push(
        `그중 **${d.typeOnlyReach}종**은 \`import type\` 경로로만 닿는다 — 컴파일 타임 의존이라 런타임 위임과는 무게가 다르다.`,
      );
    }
  }
  lines.push('');

  // ── 입력 ───────────────────────────────────────────────────────────────────
  lines.push('## 입력 — 이 대장이 무엇을 읽었나');
  lines.push('');
  lines.push('증거 열은 **레포 안의 파일**에서만 나온다. 문서 서술과 옛 콘솔 출력은 입력이 아니다.');
  lines.push('');
  lines.push('| 입력 | 파일 | 지금 |');
  lines.push('|---|---|---|');
  for (const source of model.sources) {
    lines.push(`| ${source.label} | \`${source.path}\` | ${source.present ? '있음' : '**없음**'} · ${source.detail} |`);
  }
  lines.push('');

  // ── 상태별 표 ──────────────────────────────────────────────────────────────
  for (const section of SECTIONS) {
    const rows = coverage.tools
      .filter((row) => row.status === section.status)
      .sort((a, b) => {
        const orderA = factsOf(a.tool).bundle?.order ?? Number.MAX_SAFE_INTEGER;
        const orderB = factsOf(b.tool).bundle?.order ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB || a.tool.localeCompare(b.tool);
      });

    lines.push(`## ${section.title} (${rows.length})`);
    lines.push('');
    lines.push(section.gloss);
    lines.push('');
    if (rows.length === 0) {
      lines.push('없다.');
      lines.push('');
      continue;
    }
    lines.push('| 도구 | 묶음 | 순서 | 요구 급 | 재생 | 계약 | attended | 대체 | 위임형 |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const row of rows) lines.push(rowLine(row, factsOf(row.tool), isPlanned(row.tool)));
    lines.push('');
  }

  // ── 남은 수 ────────────────────────────────────────────────────────────────
  lines.push('## 남은 수 요약');
  lines.push('');
  lines.push(`- **안 지음 ${coverage.totals.notBuilt}** — 등록점에 없다`);
  lines.push(`- **증거 대기 ${coverage.totals.awaitingEvidence}** — 지었으나 요구 증거 급이 아직 안 찼다`);
  lines.push(`- **증거 있음 ${coverage.totals.evidenced}** — 요구 급이 찼다`);
  lines.push('');
  lines.push(
    `어느 급에서도 통과 증거가 없는 도구 **${coverage.totals.withoutEvidence}종** ` +
      `(요구 급 충족과는 다른 질문이다 — 증거가 있어도 급이 덜 찰 수 있다).`,
  );
  lines.push('');

  // ── 읽는 법 ────────────────────────────────────────────────────────────────
  lines.push('## 칸의 말');
  lines.push('');
  lines.push('| 표기 | 뜻 |');
  lines.push('|---|---|');
  lines.push(`| \`${UNDECIDED}\` | 제작 계획이 아직 이 도구를 배정하지 않았다 |`);
  lines.push(`| \`${UNDECIDED}(→계약 시험)\` | 요구 급 미정 — 계산기 기본값(사다리 3)을 쓴 것이지 정해진 것이 아니다 |`);
  lines.push('| `픽스처 있음 · 판정 미기록` | 재생 픽스처는 커밋돼 있으나 **커밋된 판정 파일이 없다** — 통과가 아니다 |');
  lines.push('| `시험 있음 · 결과 미기록` | 계약 시험 파일은 있으나 **실행 결과 파일이 없다** — 통과가 아니다 |');
  lines.push('| `요구 · 미기록` | 차이 장부 등재분이라 대체 기대 시험을 **더** 요구하는데, 그 시험 파일이 아직 없다 |');
  lines.push('| 위임형 `직접` | 그 도구의 핸들러 파일이 `@babamba2/*`를 직접 참조한다 |');
  lines.push('| 위임형 `간접` | 핸들러는 직접 안 부르지만 `engine/src` 안의 헬퍼를 거쳐 닿는다 — **겉만 읽으면 안 된다** |');
  lines.push('| 위임형 `없음` | 어느 경로로도 닿지 않는다 — 겉 핸들러만 읽어도 되는 도구다 |');
  lines.push('| 위임형 `미상` | 구 엔진 소스를 읽지 못해 판정하지 않았다. 없다는 뜻이 아니다 |');
  lines.push('');
  lines.push('`통과(n)`·`실패(n)`의 `n`은 그 급에서 이 도구를 건드린 건수다.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

export interface LedgerCheck {
  readonly ok: boolean;
  readonly reason: string | null;
}

const normalize = (text: string): string => text.replace(/\r\n/g, '\n');
const clip = (text: string): string => (text.length <= 90 ? text : `${text.slice(0, 90)}…`);

/**
 * 생성물과 커밋본을 맞댄다.
 *
 * 줄바꿈 형식 차이는 사유가 아니다 — 체크아웃 설정으로 게이트가 죽으면 그
 * 게이트는 곧 꺼지고, 꺼진 게이트는 손으로 고친 대장을 막지 못한다.
 */
export function checkLedger(expected: string, committed: string | null): LedgerCheck {
  if (committed === null) {
    return { ok: false, reason: '커밋된 대장이 없다 — 생성한 적이 없거나 지웠다.' };
  }
  const want = normalize(expected);
  const got = normalize(committed);
  if (want === got) return { ok: true, reason: null };

  const wantLines = want.split('\n');
  const gotLines = got.split('\n');
  for (let i = 0; i < Math.max(wantLines.length, gotLines.length); i += 1) {
    if (wantLines[i] === gotLines[i]) continue;
    return {
      ok: false,
      reason:
        `${i + 1}번째 줄이 다르다 — 계산 «${clip(wantLines[i] ?? '(끝)')}» · ` +
        `커밋본 «${clip(gotLines[i] ?? '(끝)')}»`,
    };
  }
  return { ok: false, reason: '길이가 다르다.' };
}
