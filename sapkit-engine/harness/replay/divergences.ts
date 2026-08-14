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
 * ## 가름선 — 무엇이 여기 오는가
 *
 * **와이어(요청 주소·전문·헤더)나 도구 응답이 달라지면 여기 온다.** 진단 문구·
 * 내부 캐시·아직 안 지은 기능은 사람용 장부에만 남는다. 단 오류 문구 중
 * `MCP error -32602:` 같은 **프로토콜 코드 조각은 기계가 소비한다** —
 * `errorSignature.ts`의 `DEFAULT_CODE_RULES`가 `-32\d{3}`을 강한 신호로 쓰므로,
 * 그 조각이 달라지면 문구 차이가 아니라 **와이어 차이로 다뤄야 한다**(D34).
 *
 * ## 무엇을 여기 옮기지 않았는가
 *
 * - **D4~D12·D14~D17** — **접속·기동·프로파일 계층**의 차이라 도구 응답 시퀀스에
 *   나타나지 않는다. 각자의 계층 시험이 대체 기대 시험을 소유한다(장부의 각
 *   항목이 그 시험 자리를 적고 있다). D7은 장부가 **명시적으로** "복원이므로
 *   재생 대조에서 제외 대상이 아니다"라고 적었다. D8은 축소분이고 판정 자리가
 *   C1 녹화 관찰이다.
 * - **D21·D22** — `native`·`zrfc` **RFC 통로** 계층. 채록본은 `odata` 통로로 딴
 *   것이고 그 통로를 고르는 것은 기동 설정이다. 두 통로가 붙는 머신이 생기면
 *   그때 채록이 먼저 있어야 한다 — 지금은 대조할 채록분 자체가 없다.
 * - **D23·D24·D25·D32** — destination·브로커·`AUTH_BROKER_PATH`는 **기동 계층**이다.
 *   접속이 서는지 아닌지를 가르므로 도구 응답에는 D18의 무접속 어휘로만 비친다.
 *   D32는 사람용 장부가 스스로 "여기로 옮기지 않는다"고 적었다.
 * - **D26~D31** — HTTP·SSE **전송 계층**. 채록·재생은 stdio로 돈다. `/mcp/health`는
 *   도구 응답이 아니고, 바인딩·DNS 보호·전송 이름은 기동 시점에 끝난다.
 * - **D33** — 프로세스 전역 캐시(`objectsListCache`). 얹는 여섯 도구의 **자기 응답은
 *   그대로**이고, 캐시는 그것을 읽는 `GetObjectNodeFromCache`에서만 보인다. 그
 *   도구는 등록점에 없다(대장 「안 지음」) — 그것을 짓는 마일스톤이 판정 자리다.
 *
 * ## 여기 실린 것
 *
 *   - D1·D2·D3 — spec §2.4의 M1 사전 등재 3건 (도구 단위)
 *   - D13 — 오류 응답 대조 규칙. **단계 면제가 아니라 비교 규칙**이라
 *     `applies`가 null이고, 발동 건수는 커버리지 표가 센다.
 *   - D18 — 무접속 거부 어휘. 장부가 "기계가 소비하므로 따로 둔다"고 적었다.
 *   - **D34** — 인자 검증 실패 문구의 `MCP error -32602: ` 접두사.
 *   - **D35·D36·D37** — 도구 응답 본문·그릇의 차이(enrich 보강 · `type:'json'`
 *     블록 · 인터페이스 보강 축소).
 *   - **D38·D39·D40** — `ReloadProfile` 응답의 세 갈래.
 *
 * ## 새로 온 것들이 지키는 두 가지
 *
 * ① **`applies`는 서로 겹치지 않는다.** 러너는 걸리는 항목 중 **첫 활성 항목
 *    하나**만 판정에 쓴다(`judgeWithLedger`). 겹치면 어느 쪽이 판정하는지가 배열
 *    순서에 달리므로, 조건을 배타로 갈라 순서와 무관하게 만들었다.
 * ② **면제가 아니라 재대조다.** 새 항목은 대부분 `check`를 들고 있고, 그 검사는
 *    "등재된 자리 말고는 전부 같은가"를 다시 본다. 그래서 등재가 그 도구의
 *    단계를 통째로 대조 밖에 두지 않는다 — 등재 밖의 값이 달라지면
 *    `allowlisted-fail`로 떨어진다. `applies`가 보는 것은 **채록분(구 엔진)**이다.
 */
import type { JsonValue, SequenceStep } from '../recorder';
import { compareErrorSignatures, errorSignature } from './errorSignature';
import type { SubstituteCheck, SubstituteInput, SubstituteVerdict } from './types';

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

// ── 응답 봉투를 읽는 자리 ────────────────────────────────────────────────────
//
// 아래 항목들(D35·D36·D37·D38·D39·D40)은 전부 **응답 봉투의 모양**을 본다.
// 그 읽기를 한 곳에 모아 두는 이유는, 각 항목이 제 나름대로 봉투를 뜯기
// 시작하면 "무엇을 등재했는가"가 항목마다 달라지기 때문이다.

function isPlainObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 응답 봉투의 콘텐츠 블록들. 봉투가 아니면 빈 목록. */
function blocksOf(response: JsonValue): { [key: string]: JsonValue }[] {
  if (!isPlainObject(response)) return [];
  const content = response['content'];
  if (!Array.isArray(content)) return [];
  return content.filter(isPlainObject);
}

/** 구가 싣던 `type:'json'` 블록의 본문들 (장부 D36). */
function oldJsonBodies(response: JsonValue): JsonValue[] {
  return blocksOf(response)
    .filter((block) => block['type'] === 'json' && block['json'] !== undefined)
    .map((block) => block['json'] as JsonValue);
}

/** `type:'text'` 블록의 본문을 JSON으로 읽는다. 하나라도 못 읽으면 null. */
function textBodiesAsJson(response: JsonValue): JsonValue[] | null {
  const blocks = blocksOf(response).filter((block) => block['type'] === 'text');
  if (blocks.length === 0) return null;
  const out: JsonValue[] = [];
  for (const block of blocks) {
    const text = block['text'];
    if (typeof text !== 'string') return null;
    try {
      out.push(JSON.parse(text) as JsonValue);
    } catch {
      return null;
    }
  }
  return out;
}

/** 두 JSON이 갈리는 자리 하나. `key`는 그 자리를 감싼 마지막 객체 키다. */
interface JsonDelta {
  readonly path: string;
  readonly kind: 'added' | 'removed' | 'changed';
  readonly key: string | null;
}

/**
 * 두 JSON을 견주어 **갈리는 자리만** 모은다.
 *
 * 값은 담지 않는다 — 이 결과는 사람이 읽는 `detail`에 실리고, 그 문자열은
 * 재생 러너의 비밀 검사를 지나지 않기 때문이다. 경로와 종류만으로도 "등재된
 * 자리인가"를 판정하기에 충분하다.
 */
function jsonDelta(expected: JsonValue, actual: JsonValue, at = '', key: string | null = null): JsonDelta[] {
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const out: JsonDelta[] = [];
    for (const name of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const path = `${at}/${name}`;
      const inExpected = name in expected;
      const inActual = name in actual;
      if (inExpected && !inActual) out.push({ path, kind: 'removed', key: name });
      else if (!inExpected && inActual) out.push({ path, kind: 'added', key: name });
      else out.push(...jsonDelta(expected[name] as JsonValue, actual[name] as JsonValue, path, name));
    }
    return out;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const out: JsonDelta[] = [];
    for (let i = 0; i < Math.max(expected.length, actual.length); i += 1) {
      const path = `${at}/${i}`;
      if (i >= actual.length) out.push({ path, kind: 'removed', key });
      else if (i >= expected.length) out.push({ path, kind: 'added', key });
      else out.push(...jsonDelta(expected[i] as JsonValue, actual[i] as JsonValue, path, key));
    }
    return out;
  }
  return expected === actual ? [] : [{ path: at === '' ? '/' : at, kind: 'changed', key }];
}

const showDelta = (deltas: readonly JsonDelta[]): string =>
  deltas
    .slice(0, 5)
    .map((d) => `${d.path}(${d.kind})`)
    .join(', ');

/**
 * D35·D36 공용 — 구의 `json` 블록이 **그릇만** 바뀌어 신의 `text` 블록에 실렸는가.
 *
 * `allowedAddedKeys`에 적힌 키가 **늘어난 것**만 허용한다. 그 밖의 값이 달라지면
 * 등재된 차이가 아니므로 실패로 떨어뜨린다 — 등재가 그 도구의 응답을 통째로
 * 대조 밖에 두지 않게 하는 자리가 여기다.
 */
function rewrapVerdict(
  recorded: SequenceStep,
  actual: SubstituteInput['actual'],
  allowedAddedKeys: readonly string[],
): SubstituteVerdict {
  const old = oldJsonBodies(recorded.response);
  if (old.length === 0) return { ok: false, detail: '채록분에 구의 json 콘텐츠 블록이 없다 — 이 등재가 걸릴 자리가 아니다.' };
  if (actual.isError) return { ok: false, detail: '신 엔진이 오류로 답했다 — 그릇을 바꾸는 차이가 아니다.' };

  const fresh = textBodiesAsJson(actual.response);
  if (fresh === null) return { ok: false, detail: '신 응답을 규약대로의 text 블록(JSON 본문)으로 읽지 못했다.' };
  if (fresh.length !== old.length) {
    return { ok: false, detail: `콘텐츠 블록 수가 다르다 — 구 ${old.length} · 신 ${fresh.length}.` };
  }

  const offending: JsonDelta[] = [];
  for (let i = 0; i < old.length; i += 1) {
    for (const delta of jsonDelta(old[i] as JsonValue, fresh[i] as JsonValue)) {
      if (delta.kind === 'added' && delta.key !== null && allowedAddedKeys.includes(delta.key)) continue;
      offending.push(delta);
    }
  }
  if (offending.length > 0) {
    return { ok: false, detail: `그릇이 아니라 본문이 달라졌다 — ${showDelta(offending)}. 등재된 차이가 아니다.` };
  }
  return {
    ok: true,
    detail:
      allowedAddedKeys.length === 0
        ? '구의 json 본문이 값 그대로 text 블록에 실렸다 — 그릇만 MCP 규약에 맞췄다.'
        : `구의 json 본문이 값 그대로 실렸고, 늘어난 것은 ${allowedAddedKeys.join('·')}뿐이다.`,
  };
}

/**
 * 구 SDK가 `McpError` 생성자에서 메시지 앞에 직접 붙이던 접두사 (장부 D34).
 *
 * `@modelcontextprotocol/sdk`의 `types.js`가 `MCP error <코드>: `를 문자열로
 * 박아 넣으므로 도구 응답 본문에 그대로 실려 나간다. 신 엔진은 도구가 프로토콜
 * 오류 코드를 고르는 통로를 내주지 않아 이 조각이 없다.
 */
const OLD_INVALID_PARAMS_PREFIX = 'MCP error -32602: ';
const OLD_INVALID_PARAMS = /MCP error -32602: /;

/** D35 — 구가 채우려다 못 채운 보강 필드. 이 둘이 **느는 것**까지가 등재다. */
const ENRICH_KEYS: readonly string[] = ['OBJECT_DESCRIPTION', 'OBJECT_PACKAGE'];

/**
 * D36 — 구가 성공 응답을 `type:'json'`으로 싣던 도구들.
 *
 * `GetObjectInfo`는 여기 없다 — 그 도구는 보강 차이(D35)까지 함께 지므로 D35가
 * 맡는다. 같은 묶음의 `DescribeByList`는 구도 `text`를 썼으므로 애초에 해당이
 * 없다(장부 D36 본문).
 */
const JSON_BLOCK_TOOLS: ReadonlySet<string> = new Set([
  'GetTypeInfo',
  'GetWhereUsed',
  'GetTransaction',
  'GetAbapSystemSymbols',
]);

/**
 * 구 `GetAbapSystemSymbols`가 인터페이스 심볼을 보강한 흔적인가 (장부 D37).
 *
 * 구는 `{ exists: true, objectType: 'INTF', … }`를 실었고 신은 `exists: false` +
 * 없는 이유를 싣는다. 이 갈래만 D37이 맡고, 나머지 갈래는 D36(그릇 바꿈)이다.
 */
function hasOldInterfaceEnrichment(response: JsonValue): boolean {
  const found = (value: JsonValue): boolean => {
    if (Array.isArray(value)) return value.some(found);
    if (!isPlainObject(value)) return false;
    if (value['objectType'] === 'INTF' && value['exists'] === true) return true;
    return Object.values(value).some(found);
  };
  return found(response);
}

/** `ReloadProfile` 성공 응답에서 **등재된** 키. 그 밖이 달라지면 결함이다. */
const RELOAD_REGISTERED_KEYS: readonly string[] = ['restartRequired', 'note', 'diagnostics'];

/** 구 `ReloadProfile`이 "재시동이 필요하다"고 답한 채록분인가 (장부 D39). */
function oldSaysRestartRequired(response: JsonValue): boolean {
  const bodies = textBodiesAsJson(response) ?? [];
  return bodies.some((body) => isPlainObject(body) && body['restartRequired'] === true);
}

/** D39·D40 공용 — 성공 응답에서 갈린 것이 등재된 세 키뿐인가. */
function reloadSuccessVerdict(recorded: SequenceStep, actual: SubstituteInput['actual']): SubstituteVerdict {
  if (actual.isError) return { ok: false, detail: '신 엔진이 재적재를 오류로 알렸다 — 성공 갈래의 등재가 아니다.' };
  const old = textBodiesAsJson(recorded.response);
  const fresh = textBodiesAsJson(actual.response);
  if (old === null || fresh === null || old.length !== 1 || fresh.length !== 1) {
    return { ok: false, detail: '양쪽 응답을 text 블록 하나의 JSON 본문으로 읽지 못했다.' };
  }
  const offending = jsonDelta(old[0] as JsonValue, fresh[0] as JsonValue).filter(
    (delta) => delta.key === null || !RELOAD_REGISTERED_KEYS.includes(delta.key),
  );
  if (offending.length > 0) {
    return { ok: false, detail: `등재되지 않은 키가 달라졌다 — ${showDelta(offending)}.` };
  }
  return { ok: true, detail: `구가 싣던 키는 그대로이고, 갈린 것은 ${RELOAD_REGISTERED_KEYS.join('·')}뿐이다.` };
}

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
  {
    id: 'D34',
    title: '인자 검증 실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다',
    // 도구 하나의 차이가 아니다 — 구 핸들러가 인자 오류를 `McpError`로 던지던
    // 자리 전부에 걸린다(이미 지어진 GrepObjects·SearchObject도 같은 모양이다).
    tool: null,
    classification: '축소',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d34 · sapkit-engine/harness/replay/errorSignature.ts · ' +
      'engine/src/handlers/search/readonly/handleGrepPackages.ts',
    substituteTest:
      'sapkit-engine/harness/replay/__tests__/divergences.test.ts (D34 절) · ' +
      'sapkit-engine/src/tools/read/__tests__/getObjectsByType.test.ts · ' +
      'sapkit-engine/src/tools/read/__tests__/grepPackages.test.ts',
    resolvesIn: '도구가 프로토콜 오류 코드를 고르는 통로를 되살릴지 정하는 판 (C2 이후)',
    // **D13의 산문 정규화로 흡수되지 않는다.** `DEFAULT_CODE_RULES`가 `-32\d{3}`을
    // 강한 신호로 잡으므로 문구 차이가 아니라 `error-kind`로 떨어진다.
    applies: (step) => step.isError && OLD_INVALID_PARAMS.test(collectText(step.response)),
    // 빠진 것이 접두사뿐인지 되본다. 접두사를 뗀 뒤에도 서명이 다르면 문장 자체가
    // 달라진 것이고, 그것은 등재된 차이가 아니다.
    check: ({ recorded, actual }) => {
      if (!actual.isError) return { ok: false, detail: '신 엔진이 인자 오류를 오류로 알리지 않았다 — 조용한 성공이다.' };
      const stripped = collectText(recorded.response).split(OLD_INVALID_PARAMS_PREFIX).join('');
      const outcome = compareErrorSignatures(errorSignature(stripped), errorSignature(collectText(actual.response)));
      if (!outcome.ok) {
        return { ok: false, detail: `접두사를 뗀 뒤에도 오류 서명이 다르다 (${outcome.reason}) — 문장 자체가 달라졌다.` };
      }
      return { ok: true, detail: '구 문구에서 프로토콜 코드 접두사만 빠졌고 나머지 서명은 같다.' };
    },
  },
  {
    id: 'D35',
    title: 'GetObjectInfo — `enrich`가 실제로 동작한다 (구: 인자 이름이 어긋나 언제나 빈손)',
    tool: 'GetObjectInfo',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d35 · sapkit-engine/src/tools/read/getObjectInfo.ts · ' +
      'engine/src/handlers/system/readonly/handleGetObjectInfo.ts',
    substituteTest: 'sapkit-engine/src/tools/read/__tests__/getObjectInfo.test.ts — 「enrich가 실제로 채운다」 4건',
    resolvesIn: null,
    // 이 도구는 D36(그릇 바꿈)도 함께 지므로 여기가 둘을 한꺼번에 맡는다 —
    // D36의 `applies`가 이 도구를 뺀다.
    applies: (step) => step.tool === 'GetObjectInfo' && oldJsonBodies(step.response).length > 0,
    check: ({ recorded, actual }) => rewrapVerdict(recorded, actual, ENRICH_KEYS),
  },
  {
    id: 'D36',
    title: '`type: json` 콘텐츠 블록을 규약대로 text로 싣는다',
    // 다섯 도구에 걸린다. `tool`은 한 이름만 담으므로 여기서는 null로 두고
    // `applies`가 그 집합을 든다. 도구별 부가 요건은 각 도구의 계약 시험이 진다.
    tool: null,
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d36 · sapkit-engine/src/server/toolDefinition.ts · ' +
      'engine/src/handlers/system/readonly/handleGetTransaction.ts',
    substituteTest:
      'sapkit-engine/src/tools/read/__tests__/getTypeInfo.test.ts · ' +
      'sapkit-engine/src/tools/read/__tests__/getWhereUsed.test.ts · ' +
      'sapkit-engine/src/tools/read/__tests__/getTransaction.test.ts · ' +
      'sapkit-engine/src/tools/read/__tests__/getAbapSystemSymbols.test.ts',
    resolvesIn: null,
    applies: (step) =>
      JSON_BLOCK_TOOLS.has(step.tool) && oldJsonBodies(step.response).length > 0 && !hasOldInterfaceEnrichment(step.response),
    check: ({ recorded, actual }) => rewrapVerdict(recorded, actual, []),
  },
  {
    id: 'D37',
    title: 'GetAbapSystemSymbols — 인터페이스 보강이 아직 없다',
    tool: 'GetAbapSystemSymbols',
    classification: '축소',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d37 · sapkit-engine/src/tools/read/getAbapSystemSymbols.ts · ' +
      'engine/src/handlers/system/readonly/handleGetAbapSystemSymbols.ts',
    substituteTest:
      'sapkit-engine/src/tools/read/__tests__/getAbapSystemSymbols.test.ts — 「인터페이스 보강 — 이 판에서 축소됐다」',
    resolvesIn: 'GetInterface를 짓는 판',
    applies: (step) => step.tool === 'GetAbapSystemSymbols' && hasOldInterfaceEnrichment(step.response),
    // **이연**이다. 축소분이 옳다는 것을 재생이 증명할 수는 없다 — 덜 채워진 쪽이
    // 옳다는 말이 성립하지 않기 때문이다. 판정 자리는 위 계약 시험이고, 재생은
    // 이 단계를 통과가 아니라 무증거로 센다.
    check: null,
  },
  {
    id: 'D38',
    title: 'ReloadProfile — 실패해도 옛 프로파일로 되돌아가지 않는다',
    tool: 'ReloadProfile',
    classification: '강화',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d38 · sapkit-engine/src/tools/runtime/reloadProfile.ts · ' +
      'engine/src/lib/profile.ts',
    substituteTest:
      'sapkit-engine/src/tools/runtime/__tests__/reloadProfile.test.ts · sapkit-engine/src/server/__tests__/session.test.ts',
    resolvesIn: null,
    // 구는 이 갈래를 오류로 알렸다. 신은 "실패는 상태다" — 응답 자체가 달라진다.
    applies: (step) => step.tool === 'ReloadProfile' && step.isError,
    check: ({ actual }) => {
      const text = collectText(actual.response);
      if (actual.isError) {
        return /inspection-only/.test(text)
          ? { ok: true, detail: '신 엔진이 해석 실패를 inspection-only 봉인으로 알렸다 — 옛 권한을 이어 쓰지 않았다.' }
          : { ok: false, detail: '신 엔진이 오류로 답했으나 봉인(inspection-only)을 말하지 않았다.' };
      }
      const body = (textBodiesAsJson(actual.response) ?? [])[0];
      if (body === undefined || !isPlainObject(body)) {
        return { ok: false, detail: '신 응답을 text 블록의 JSON 본문으로 읽지 못했다.' };
      }
      if (body['tier'] !== 'UNKNOWN') {
        return { ok: false, detail: '재적재 실패인데 tier가 UNKNOWN이 아니다 — 옛 등급이 살아남았다.' };
      }
      const diagnostics = body['diagnostics'];
      if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
        return { ok: false, detail: '실패 이유(diagnostics)가 비어 있다 — 「실패는 상태다」를 응답이 말하지 않는다.' };
      }
      return { ok: true, detail: 'tier=UNKNOWN + 이유 있음 — 옛 프로파일로 조용히 되돌아가지 않았다.' };
    },
  },
  {
    id: 'D39',
    title: 'ReloadProfile — `restartRequired`가 가리키는 제약이 바뀌었다',
    tool: 'ReloadProfile',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d39 · sapkit-engine/src/tools/runtime/reloadProfile.ts · ' +
      'engine/src/server/launcher.ts',
    substituteTest:
      'sapkit-engine/src/tools/runtime/__tests__/reloadProfile.test.ts — 「배포 축이 바뀌면 restartRequired=true」 · ' +
      'sapkit-engine/src/server/__tests__/session.test.ts',
    resolvesIn: null,
    // 구가 "재시동이 필요하다"고 답한 채록분. 신은 접속을 게으르게 다시 만들므로
    // 그 제약이 없다. D40과 배타로 갈라 둔다 — 성공 갈래를 둘이 나눠 맡는다.
    applies: (step) => step.tool === 'ReloadProfile' && !step.isError && oldSaysRestartRequired(step.response),
    check: ({ recorded, actual }) => reloadSuccessVerdict(recorded, actual),
  },
  {
    id: 'D40',
    title: 'ReloadProfile — 응답에 `diagnostics`를 싣는다',
    tool: 'ReloadProfile',
    classification: '강화',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d40 · sapkit-engine/src/tools/runtime/reloadProfile.ts · ' +
      'sapkit-engine/src/profile/resolve.ts',
    substituteTest:
      'sapkit-engine/src/tools/runtime/__tests__/reloadProfile.test.ts — 「구가 싣던 키를 그대로 싣는다」',
    resolvesIn: null,
    applies: (step) => step.tool === 'ReloadProfile' && !step.isError && !oldSaysRestartRequired(step.response),
    check: ({ recorded, actual }) => reloadSuccessVerdict(recorded, actual),
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
