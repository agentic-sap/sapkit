/**
 * 의도적 차이 목록 — **기계가 읽는 형태**.
 *
 * 사람용 정본은 `harness/DIVERGENCES.md`다. 이 파일은 그 문서 중에서
 * **재생 대조가 판정에 실제로 써야 하는 것**만 옮긴 것이고, 문서를 대체하지
 * 않는다. 어긋나면 문서가 이긴다.
 *
 * ## 언제 발동하는가
 *
 * 등재는 **차이가 났을 때만** 발동한다. 장부가 말하는 "등재 항목만 동등성
 * 비교에서 제외된다"는 곧 *그 차이를* 제외한다는 뜻이지, 그 도구의 모든 단계를
 * 대조 밖에 두라는 뜻이 아니다. 그래서 같으면 그냥 통과이고, 다를 때 비로소
 * 등재를 찾는다. 등재가 없으면 **결함**이다.
 *
 * ## 휴면 항목
 *
 * `status: 'dormant'`는 "등재는 지금 하되 대체 기대 시험은 그 도구를 짓는
 * 마일스톤에서 활성화한다"는 뜻이다. **휴면 항목은 차이를 면제하지 않는다** —
 * 휴면인데 차이가 나면 그 도구가 이미 존재한다는 뜻이고, 장부가 낡았다는
 * 신호다. 조용히 통과시키면 그 신호가 사라진다.
 *
 * ## 무엇을 여기 옮기지 않았는가
 *
 * D4~D12·D14~D17은 **접속·기동·프로파일 계층**의 차이라 도구 응답 시퀀스에
 * 나타나지 않는다. 각자의 계층 시험이 대체 기대 시험을 소유한다(장부의 각
 * 항목이 그 시험 자리를 적고 있다). D7은 장부가 **명시적으로** "복원이므로
 * 재생 대조에서 제외 대상이 아니다"라고 적었다. D8은 축소분이고 판정 자리가
 * C1 녹화 관찰이다.
 *
 * 여기 실린 것은 넷이다:
 *   - D1·D2·D3 — spec §2.4의 M1 사전 등재 3건 (도구 단위)
 *   - D13 — 오류 응답 대조 규칙. **단계 면제가 아니라 비교 규칙**이라
 *     `applies`가 null이고, 발동 건수는 커버리지 표가 센다.
 *   - D18 — 무접속 거부 어휘. 장부가 "기계가 소비하므로 따로 둔다"고 적었다.
 */
import type { JsonValue, SequenceStep } from '../recorder';
import type { SubstituteCheck } from './types';

export type DivergenceClassification =
  /** 구 엔진의 오답·거짓 성공을 고침. */
  | '수리'
  /** 안전 바닥선을 올림. */
  | '강화'
  /** 구 기능을 M1에서 아직 안 지음 — 후속 마일스톤에서 해소. */
  | '축소';

export type DivergenceStatus = 'active' | 'dormant';

export interface DivergenceEntry {
  /** 장부의 항목 번호 (`D1`…). */
  readonly id: string;
  readonly title: string;
  /** 이 차이가 붙은 도구. 계층 차이면 null. */
  readonly tool: string | null;
  readonly classification: DivergenceClassification;
  readonly status: DivergenceStatus;
  /** **근거 문서 경로** — 장부 등재 규칙 ①. 비면 장부가 잘못 형성된 것이다. */
  readonly evidence: string;
  /** **대체 기대 시험**의 소재 — 장부 등재 규칙 ②. 축소 항목만 null일 수 있다. */
  readonly substituteTest: string | null;
  /** 축소 항목의 해소 마일스톤(규칙 ④) 또는 휴면 항목의 활성화 마일스톤. */
  readonly resolvesIn: string | null;
  /** 이 항목이 어떤 단계에 걸리는가. null이면 단계 면제가 아니다(비교 규칙 계열). */
  readonly applies: ((step: SequenceStep) => boolean) | null;
  /**
   * 대체 기대 시험 본체. null이면 **이연** — 다른 작업이 그 시험을 소유하며,
   * 재생 러너는 그 단계를 통과가 아니라 **무증거**로 센다.
   */
  readonly check: SubstituteCheck | null;
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(`의도적 차이 장부 오류 — ${message}`);
    this.name = 'LedgerError';
  }
}

/** JSON 값 안의 문자열을 문서 순서로 모아 잇는다. 오류 문구를 읽을 때 쓴다. */
export function collectText(value: JsonValue): string {
  const out: string[] = [];
  const walk = (node: JsonValue): void => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node !== null && typeof node === 'object') for (const item of Object.values(node)) walk(item);
  };
  walk(value);
  return out.join('\n');
}

const OLD_NO_CONNECTION = /Basic authentication requires SAP_CLIENT to be provided/;

/**
 * M1 기본 장부.
 *
 * 근거 경로는 전부 **레포 루트 기준**이다. `harness/DIVERGENCES.md`의 해당
 * 항목이 그 근거의 서술을 담고 있다.
 */
export const M1_DIVERGENCES: readonly DivergenceEntry[] = [
  {
    id: 'D1',
    title: 'GetSqlQuery — wide-SELECT에서 WHERE 절이 통째로 무시되던 것을 고침',
    tool: 'GetSqlQuery',
    classification: '수리',
    status: 'active',
    evidence: 'sapkit-engine/harness/DIVERGENCES.md#m1-사전-등재 · HANDOFF.md §6 항목 13-9 · D-079 ⑤',
    // 장부: "대체 기대 시험: D1 = WHERE가 결과에 실제 반영됨을 검증하는 시험
    // (실데이터 도구 작업이 소유)". 그 작업이 검사를 물릴 때까지 이연이다.
    substituteTest: '실데이터 도구 작업이 소유 — WHERE가 결과에 실제 반영됨을 검증하는 시험',
    resolvesIn: null,
    applies: (step) => step.tool === 'GetSqlQuery',
    check: null,
  },
  {
    id: 'D2',
    title: 'UpdateLocalTypes — activate_on_update:true에서 거짓 성공하던 것을 고침',
    tool: 'UpdateLocalTypes',
    classification: '수리',
    status: 'dormant',
    evidence: 'sapkit-engine/harness/DIVERGENCES.md#m1-사전-등재 · HANDOFF.md §6 항목 13-11 · D-079 ⑤',
    substituteTest: 'UpdateLocalTypes를 짓는 마일스톤이 소유',
    resolvesIn: 'UpdateLocalTypes를 짓는 마일스톤 (M1 밖)',
    applies: (step) => step.tool === 'UpdateLocalTypes',
    check: null,
  },
  {
    id: 'D3',
    title: 'GetIncludesList — `INCLUDE … IF FOUND`의 비실재 객체명을 돌려주던 것을 고침',
    tool: 'GetIncludesList',
    classification: '수리',
    status: 'dormant',
    evidence: 'sapkit-engine/harness/DIVERGENCES.md#m1-사전-등재 · HANDOFF.md §6 항목 13-13 · D-079 ⑤',
    substituteTest: 'GetIncludesList를 짓는 마일스톤이 소유',
    resolvesIn: 'GetIncludesList를 짓는 마일스톤 (M1 밖)',
    applies: (step) => step.tool === 'GetIncludesList',
    check: null,
  },
  {
    id: 'D13',
    title: '엔진 자체 저작 진단 산문은 구와 다르다 — 오류 대조 규칙',
    tool: null,
    classification: '강화',
    status: 'active',
    evidence: 'sapkit-engine/harness/DIVERGENCES.md#d13 · sapkit-engine/src/adt/errors.ts · sapkit-engine/src/rfc/errors.ts',
    substituteTest: 'sapkit-engine/harness/replay/__tests__/errorSignature.test.ts · 각 계층의 오류 정규화 시험',
    resolvesIn: null,
    // 단계 면제가 아니다. 오류 응답을 **어떻게 비교하는가**를 정하는 규칙이고,
    // 그 규칙이 느슨하게 판정한 건수를 커버리지 표가 센다.
    applies: null,
    check: null,
  },
  {
    id: 'D18',
    title: '무접속 거부 어휘가 다르다 — 구 `SAP_CLIENT` 문구 대 신 `ERR_NO_CONNECTION`',
    tool: null,
    classification: '강화',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d18 · interactive/scripts/conformance-server-gates.mjs:315 · sapkit-engine/src/server/core.ts',
    substituteTest: 'sapkit-engine/harness/replay/__tests__/errorSignature.test.ts — D18 무접속 거부 어휘',
    resolvesIn: null,
    applies: (step) => step.isError && OLD_NO_CONNECTION.test(collectText(step.response)),
    // 구 문구는 "프로파일이 없다"를 "SAP_CLIENT가 없다"로 잘못 말한다. 신 엔진이
    // 옳으려면 **접속이 없다는 사실을 이름으로** 말해야 한다.
    check: ({ actual }) => {
      const text = collectText(actual.response);
      if (!actual.isError) return { ok: false, detail: '신 엔진이 무접속을 오류로 알리지 않았다 — 조용한 성공이다.' };
      if (!/ERR_NO_CONNECTION/.test(text)) {
        return { ok: false, detail: '신 엔진 거부 문구에 ERR_NO_CONNECTION이 없다 — 무접속을 이름으로 말하지 않았다.' };
      }
      return { ok: true, detail: '신 엔진이 ERR_NO_CONNECTION으로 거부했다 — 구 문구의 오진단을 고친 쪽이다.' };
    },
  },
];

/** 장부가 등재 규칙을 지키는지. 어기면 던진다. */
export function assertLedgerWellFormed(ledger: readonly DivergenceEntry[]): void {
  const seen = new Set<string>();
  for (const entry of ledger) {
    if (entry.id.trim() === '') throw new LedgerError('id가 비어 있는 항목이 있다.');
    if (seen.has(entry.id)) throw new LedgerError(`id가 중복된다: ${entry.id}`);
    seen.add(entry.id);

    // 규칙 ① 근거 문서
    if (entry.evidence.trim() === '') {
      throw new LedgerError(`${entry.id}에 근거 문서가 없다 (등재 규칙 ①).`);
    }
    // 규칙 ② 대체 기대 시험 — 축소만 예외(장부 D8: "대체 기대 시험: 없음(축소)")
    if (entry.classification !== '축소' && (entry.substituteTest ?? '').trim() === '') {
      throw new LedgerError(`${entry.id}에 대체 기대 시험이 없다 (등재 규칙 ②). 비교에서 빼는 것이 곧 무증거가 된다.`);
    }
    // 규칙 ④ 축소 항목의 해소 마일스톤
    if (entry.classification === '축소' && (entry.resolvesIn ?? '').trim() === '') {
      throw new LedgerError(`${entry.id}은 축소인데 해소 마일스톤이 없다 (등재 규칙 ④). 영구 차이가 아니다.`);
    }
    // 휴면은 언젠가 깨어나야 한다 — 깨어날 자리를 적지 않으면 영구 면제가 된다.
    if (entry.status === 'dormant' && (entry.resolvesIn ?? '').trim() === '') {
      throw new LedgerError(`${entry.id}은 휴면인데 활성화 마일스톤이 없다.`);
    }
  }
}

/** 이 단계에 걸리는 등재 항목들. 휴면 항목도 함께 돌려준다 — 판정은 러너가 한다. */
export function divergencesFor(ledger: readonly DivergenceEntry[], step: SequenceStep): DivergenceEntry[] {
  return ledger.filter((entry) => entry.applies !== null && entry.applies(step));
}

/**
 * 이연된 항목에 대체 기대 시험을 물린다.
 *
 * 장부 항목을 소유한 작업이 자기 시험을 여기에 꽂는 통로다. 원본 장부는
 * 그대로 두고 새 배열을 돌려준다.
 */
export function withSubstituteChecks(
  ledger: readonly DivergenceEntry[],
  checks: Readonly<Record<string, SubstituteCheck>>,
): DivergenceEntry[] {
  for (const id of Object.keys(checks)) {
    if (!ledger.some((entry) => entry.id === id)) throw new LedgerError(`장부에 없는 id에 검사를 물릴 수 없다: ${id}`);
  }
  return ledger.map((entry) => {
    const check = checks[entry.id];
    return check === undefined ? entry : { ...entry, check };
  });
}
