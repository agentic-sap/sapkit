/**
 * 녹화 대상 검사 — **도구 선언에서 읽는다.**
 *
 * 예전에는 `record-attended.mjs` 안에 도구 15종의 이름과 인자 이름이 하드코딩된
 * 표가 있었다. 목록 밖 도구는 SAP 호출이 **나간 뒤에야** 사후 백스톱에 걸렸고,
 * `Delete*` 계열을 포함해 mutating 도구가 대거 들어오는 판에서 그것은 "미뤄 둔
 * attended 세션에서 표준 오브젝트를 지운 **다음에** 경고를 받는다"는 뜻이었다.
 *
 * 그래서 지식의 자리를 옮겼다. 이제 도구가 자기 대상-이름 인자를
 * `SapToolDefinition.targetNames`로 선언하고, 여기서는 그 선언을 읽어 검사기를
 * 만든다. 도구를 지으면 사전 검사가 **자동으로 따라온다.**
 *
 * **등록점에 없는 이름은 막지 않는다.** 검사기가 보는 것은 등록된 도구 선언의
 * 표뿐이고, 그 표에 없는 이름이면 사후 백스톱만 본다. 이 갈래의 원래 근거는
 * 「녹화 대상이 구 번들이라 신 엔진이 아직 안 지은 이름이 대거 들어온다」였고,
 * 판7-b(D-095) 교체로 녹화 대상이 제품 번들 = 신 엔진이 되면서 그 입력은
 * 사실상 사라졌다. 그래도 열어 두는 이유는 남는다 — **시나리오는 사람이 손으로
 * 적는 파일**이라 표에 없는 이름(오타·구 이름)이 언제든 들어오고, 여기서
 * fail-closed로 뒤집으면 그 한 건이 시퀀스 전체의 녹화를 막는다.
 * 대신 **새로 짓는 mutating 도구는 선언 없이 통과하지 못한다** —
 * `missingTargetNameDeclarations`와 `src/tools/__tests__/targetNames.test.ts`가
 * 그 자리다.
 */

import type { SapTool, ToolTargetName } from '../src/server/toolDefinition';
import { TOOL_REGISTRY } from '../src/tools/registry';

/** 인자 한 벌에서 대상 이름들을 뽑는 함수. */
export type TargetNameExtractor = (args: unknown) => unknown[];

/** 도구 이름 → 대상 이름 추출기. */
export type TargetNameExtractors = Readonly<Record<string, TargetNameExtractor>>;

/** 검사가 보는 시나리오 단계 — `tool`과 `args`뿐이다. */
export interface GuardedStep {
  readonly tool: string;
  readonly args?: unknown;
}

/** 검사가 보는 픽스처 단계 — 백스톱은 응답도 본다. */
export interface GuardedFixtureStep extends GuardedStep {
  readonly index: number;
  readonly response?: unknown;
}

export interface GuardOptions {
  /** `--allow-standard-source`. 켜면 두 검사가 모두 꺼진다. */
  readonly allowStandardSource?: boolean;
  /** 시험이 가짜 선언을 물릴 수 있게 낸다. 기본은 등록된 도구들의 선언. */
  readonly extractors?: TargetNameExtractors;
}

/** 객체에서 키 하나를 안전하게 읽는다. */
function read(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * 선언 하나가 가리키는 이름들을 뽑는다.
 *
 * 배열 선언에서 인자가 배열이 아니면 **그 값을 그대로** 하나로 본다 — 뽑히는
 * 것이 없으면 `checkSourceNamespace`가 fail-closed로 막는다. 배열 원소가
 * 문자열이면 원소 자체가 이름이다.
 */
export function extractTargetNames(args: unknown, selector: ToolTargetName): unknown[] {
  if (typeof selector === 'string') return [read(args, selector)];
  const container = read(args, selector.arg);
  if (!Array.isArray(container)) return [container];
  return container.map((element) => read(element, selector.element) ?? element);
}

/**
 * 등록된 도구들의 선언에서 검사기를 만든다. **선언이 없거나 비어 있으면 만들지
 * 않는다** — 그 도구는 지금처럼 사후 백스톱이 소유한다.
 */
export function buildTargetNameExtractors(tools: readonly SapTool[]): TargetNameExtractors {
  const extractors: Record<string, TargetNameExtractor> = {};
  for (const { definition } of tools) {
    const selectors = definition.targetNames;
    if (selectors === undefined || selectors.length === 0) continue;
    extractors[definition.name] = (args) => selectors.flatMap((selector) => extractTargetNames(args, selector));
  }
  return extractors;
}

/** 등록된 도구들의 선언에서 만든 검사기. 녹화 스크립트가 쓰는 것. */
export const TARGET_NAME_EXTRACTORS: TargetNameExtractors = buildTargetNameExtractors(TOOL_REGISTRY);

/**
 * ABAP 원본이 실렸는지 보는 거친 표지. 선언이 없는 도구를 위한 백스톱용이다.
 *
 * **선행 경계(`\b`)에 기대지 않는다.** 검사는 `JSON.stringify` 결과 위에서
 * 도는데, 거기서 줄바꿈은 역슬래시와 `n` 두 글자가 된다. `n`은 단어 문자라
 * 줄 첫머리의 `ENDCLASS`는 `\bEND`의 경계가 성립하지 않는다 — 그래서 첫 판은
 * **들여쓴 것만 잡고 0열은 놓쳤다.** SAP이 돌려주는 표준 소스가 정확히 0열
 * + CRLF 형태라 노리던 것을 통째로 놓치고 있었다(4차 리뷰 지적).
 * 대신 ABAP 문장의 마침표를 후행 경계로 쓴다.
 */
export const ABAP_SOURCE_MARK = /END(CLASS|METHOD|FORM|FUNCTION|MODULE)\s*\./i;

/** 고객 네임스페이스인가. `/NAMESPACE/ZFOO` 같은 등록 네임스페이스도 허용한다. */
export function isCustomerObject(name: unknown): boolean {
  const bare = String(name ?? '')
    .trim()
    .replace(/^\/[^/]+\//, '');
  return /^[ZY]/i.test(bare);
}

/**
 * **대상이 고객 객체여야 하는 도구**를 시나리오에서 걸러낸다. 두 부류가 같은
 * 제약을 진다.
 *  ⓐ 응답에 **원본 소스를 싣는** 도구 — 표준 객체를 담으면 이 레포가 재배포권을
 *     갖지 않은 자산이 공개 레포에 박힌다.
 *  ⓑ **SAP을 바꾸는** 도구 — P3는 DEV 연습 자리(전용 패키지 또는 `$TMP`)
 *     안에서만이다. 여기 있으면 **실 SAP 호출 전에** 판정된다. 사후에 걸러 봐야
 *     write는 이미 일어난 뒤다(4차 리뷰 지적).
 *
 * **여기서 검사하는 것은 이름의 네임스페이스뿐이고 `package_name`은 보지 않는다.**
 * 연습 자리를 벗어난 write를 기계가 막지는 못한다 — 시나리오 작성자의 책임이다.
 */
export function checkSourceNamespace(
  scenario: { readonly steps: readonly GuardedStep[] },
  { allowStandardSource = false, extractors = TARGET_NAME_EXTRACTORS }: GuardOptions,
): string[] {
  if (allowStandardSource) return [];
  const offenders: string[] = [];
  for (const [i, step] of scenario.steps.entries()) {
    const extract = extractors[step.tool];
    if (extract === undefined) continue;

    // 선택 인자는 없을 수 있다(`UpdateInclude.main_program` 등) — 없는 것을
    // 위반으로 세지 않는다. 대신 **하나도 못 뽑았으면** 막는다: 인자 이름이
    // 어긋났거나 비어 있다는 뜻이고, 그 상태로 태우면 무엇을 겨눴는지 모른 채
    // 실 SAP에 나간다(fail-closed).
    const names = extract(step.args).filter((n) => n !== undefined && n !== null);
    if (names.length === 0) {
      offenders.push(`steps[${i}] ${step.tool} — 대상 객체 이름을 하나도 찾지 못했다 (인자 이름 확인)`);
      continue;
    }
    for (const objectName of names) {
      if (!isCustomerObject(objectName)) {
        offenders.push(`steps[${i}] ${step.tool} → ${JSON.stringify(objectName)}`);
      }
    }
  }
  return offenders;
}

/**
 * 사전 검사의 백스톱 — **선언이 없는 도구**가 원본 소스를 실어 왔는지 본다.
 *
 * `checkSourceNamespace`는 시나리오의 인자만, 그것도 선언을 가진 도구만 본다.
 * 선언 없는 도구가 소스를 돌려주면 조용히 통과한다. 그래서 채록이 끝난 뒤
 * 한 번 더 훑는다. 선언을 가진 도구는 이미 Z·Y로 제한됐으므로 건너뛴다.
 *
 * **응답과 인자 양쪽을 본다** — 소스가 들어오는 자리가 응답만은 아니다.
 * `CheckSyntax`는 `source_code` 인자를 받고 선언이 없으므로, 표준 객체 소스를
 * 거기 붙이면 그대로 픽스처에 실린다(3차 리뷰 지적).
 */
export function detectUnguardedSource(
  fixture: { readonly steps: readonly GuardedFixtureStep[] },
  { allowStandardSource = false, extractors = TARGET_NAME_EXTRACTORS }: GuardOptions,
): string[] {
  if (allowStandardSource) return [];
  return fixture.steps
    .filter((s) => extractors[s.tool] === undefined)
    .filter((s) => ABAP_SOURCE_MARK.test(JSON.stringify(s.response)) || ABAP_SOURCE_MARK.test(JSON.stringify(s.args)))
    .map(
      (s) =>
        `steps[${s.index}] ${s.tool} — 인자나 응답에 ABAP 원본으로 보이는 것이 있는데 이 도구는 ` +
        '대상-이름 선언이 없다. 도구 정의에 targetNames를 더하거나 대상을 Z 객체로 바꿔라.',
    );
}
