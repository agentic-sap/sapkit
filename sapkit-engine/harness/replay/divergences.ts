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
 * ### D41~D105 중 옮기지 않은 것 — **HTTP 와이어에만 남는 차이**
 *
 * 픽스처가 담는 것은 **도구 호출과 그 응답뿐이다**(`harness/recorder/types.ts`의
 * `SequenceStep` — `tool`·`args`·`response`·`isError`). HTTP 요청의 주소·본문·
 * 개수는 담기지 않는다. 그래서 SAP이 다르게 답하지 않는 한 재생 대조는 그 차이를
 * **볼 수 없고**, 등재해도 발동할 자리가 없다. 더 나쁜 것은 그 등재가
 * **`applies`를 도구 이름 전체로 넓힐 수밖에 없다**는 것이다 — 채록 쪽에 그
 * 자리를 가리키는 표식이 없기 때문이다. 그러면 그 도구의 **모든** 차이가 등재로
 * 삼켜진다(머리주석 「언제 발동하는가」가 금하는 모양).
 *
 * - **D52** — `CreateFunctionGroup`의 404 재시도. 사람용 장부가 스스로 "재시도가
 *   성공하든 실패하든 도구 응답은 한 글자도 달라지지 않는다"고 적었다. 갈리는
 *   것은 왕복 수와 5초의 정지뿐이다.
 * - **D62·D71·D82·D98** — 생성 페이로드·질의 인자의 `masterSystem`·`responsible`·
 *   `user`/`owner`. 해석된 프로파일에는 `SAP_USERNAME`이 반드시 있으므로 구가
 *   쓰던 셋째 갈래는 실사용에서 걸리지 않는다(장부 D62·D82 본문의 근거). 값이
 *   실제로 갈리면 목록·객체 내용이 달라지는데, **그때 신이 옳다는 증명이 없으므로
 *   결함으로 잡히는 쪽이 옳다.**
 * - **D72** — `UpdateInterface`의 UNLOCK URI 대소문자. 해제의 실효 열쇠는 URI가
 *   아니라 `lockHandle`이고(장부 본문), 양쪽 다 해제에 성공하므로 응답이 같다.
 * - **D76** — 인핸스먼트 GET의 `{"Accept":…}` 본문. ADT가 읽지도 않는 자리라
 *   응답이 갈리지 않는다. 갈린다면 그것은 새 사실이고 결함으로 드러나야 한다.
 * - **D91** — 클라우드(JWT) 거절 갈래. **인증 계층**이고 JWT 채록분 자체가 없다
 *   (D21·D22와 같은 자리). 지목자도 「안 했다」로 판단했다.
 * - **D92** — `UpdateScreen`의 잠금 핸들 부재 갈래. 채록 쪽에 그 자리를 가리키는
 *   표식이 없어 `applies`가 `UpdateScreen` 전체를 덮게 되고, 그러면 **D93과
 *   겹쳐** 배열 순서가 판정을 정한다(규칙 ① 위반). 지금은 그 갈래가 나면
 *   D93의 대체 기대 시험이 `allowlisted-fail`로 떨어뜨린다 — 활성화 실패를
 *   말하지 않는 오류이기 때문이다. **삼키지 않고 사람에게 올리는 쪽**이다.
 * - **D94·D95** — 발행 스키마의 `minItems`·`oneOf` 유실. 발행 선언이 채록본과
 *   글자 일치하므로 재생 대조에 나타날 차이가 아니다. 지목자와 같은 판단이다.
 * - **D101** — BDEF 잠금 요청의 `asx:abap` 본문. 그 본문이 잠금 성패를 가르는지가
 *   **이 판에서 실측되지 않았다**(장부 본문). 가른다면 도구가 실패하고, 그것은
 *   등재로 덮을 것이 아니라 attended에서 확인할 자리다.
 * - **D104** — `CreateMetadataExtension`의 중복 UNLOCK. 사람용 장부가 스스로
 *   "결과에는 안 보이고 와이어에만 남는 요청"이라고 적었다.
 * - **결번(D42~D45·D47~D50·D53~D55·D57~D60·D63~D65·D67~D70·D74·D75·D78~D80·
 *   D83~D90·D96·D97·D102)** — 병렬 제작의 번호 예약 구간을 다 쓰지 않은 자리다.
 *   차이가 아니므로 판정 대상도 아니다.
 *
 * ### D110~D132 중 옮기지 않은 것 — **마지막 반영이 쓴 같은 가름선**
 *
 * 꼬리 묶음 셋(삭제 계열 25종 · `tail-test` · `tail-read`)이 쌓아 둔 분량이다.
 * **위 가름선을 그대로 썼고 새 규칙을 만들지 않았다.**
 *
 * - **D112** — 삭제 넷의 클라우드(JWT) 거절 갈래. **인증 계층**이고 JWT 채록분이
 *   없다 — D91과 같은 자리이며 지목자도 「안 옮긴다」로 판단했다.
 * - **D113** — `DeleteGuiStatus`·`DeleteScreen`의 잠금 손잡이 부재 갈래.
 *   **D92의 범위 확장이고 D92와 같은 판정이다.** 잠금 응답에 `LOCK_HANDLE`이
 *   없다는 것은 **비정상 SAP 상태**이고, 채록된 구 응답은 그냥 성공이라 그 자리를
 *   가리키는 표식이 없다. 등재하면 `applies`가 두 도구 전체를 덮는다. 지금은 그
 *   갈래가 나면 걸리는 등재가 없어 `mismatch`(결함)로 사람에게 올라간다 — D92가
 *   고른 방향 그대로다.
 * - **D123** — 함수그룹 잠금 응답의 `sap-adt-lm-handle` 헤더 경로. 채록된 실 SAP
 *   응답은 본문에 손잡이를 싣는 형태라 이 갈래가 대조에 나타나지 않는다.
 *   지목자 판단과 같다.
 * - **D124** — 함수그룹 콘텐츠 타입 협상 캐시. 갈리는 것은 **discovery 왕복 한
 *   번**뿐이고 협상 결과와 헤더는 같다 — D52와 같은 모양이며 픽스처는 왕복을
 *   담지 않는다.
 * - **D131** — `*Low` 두 도구의 `sap-adt-connection-id` **요청 헤더 값**.
 *   D62·D72와 같은 요청 쪽 와이어다. 지목자는 "기계 장부에도 와야 한다"고 적었으나
 *   **이 판은 옮기지 않았다** — 픽스처에 요청 헤더가 없어 발동할 자리가 없고,
 *   채록 쪽 표식도 없어 `applies`가 두 도구 전체로 넓어진다. 값이 실제로 응답을
 *   가른다면 그때 신이 옳다는 증명이 없으므로 **결함으로 잡히는 쪽이 옳다**.
 *
 * ### D33 재판정 — 전제가 깨졌으나 판정은 그대로다
 *
 * D33을 「안 옮김」으로 판정한 근거는 둘이었다: ⑴ 캐시를 **얹는** 도구들의 자기
 * 응답은 그대로다, ⑵ 그것을 **읽는** `GetObjectNodeFromCache`가 등록점에 없다.
 * ⑵는 그 도구가 지어지며 깨졌다. 그래도 **D33 자신은 오지 않는다** — ⑴이 그대로고,
 * 관측되는 결과(캐시 적중 응답이 사라진다)를 지목한 항목이 **D130**이기 때문이다.
 * 사람용 장부의 D130 본문도 "옮길 때 D33이 아니라 이 D130을 옮겨라"라고 적었다.
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
 *   - **D41·D51·D56·D66·D73·D93·D99·D100·D103·D105** — **활성화 거짓 성공 계열**.
 *     구가 `activated: true`(또는 "…activated successfully")로 답하던 자리에서
 *     신이 실패로 되돌리므로 `isError`째 갈린다.
 *   - **D46** — `GetProgFullCode`가 빈손이던 인클루드 본문을 채운다.
 *   - **D61** — 구 ECC OData 브리지 갈래(`path: 'ecc-odata-rfc'`)를 신은 거절한다.
 *     축소분이라 **이연**(`check: null`)이다.
 *   - **D77** — 인핸스먼트 두 도구의 `type:'json'` 그릇 (D36의 같은 규칙).
 *   - **D81** — `CreateTransport` 성공 응답의 이송번호.
 *   - **D111·D114·D120·D121·D122·D125** — **활성화 거짓 성공 계열의 마지막 여섯**
 *     (지역 인클루드 비우기 넷 · 텍스트요소 삭제 · CDS 단위시험 · 지역 정의 ·
 *     지역 매크로 · 도메인 갱신). D114는 D93의, D121·D122는 D2·D41의 범위 확장이다.
 *   - **D115** — `DeleteServiceBinding`의 **삭제 거짓 성공**. 활성화가 아니라
 *     `del:isDeleted="false"`를 성공으로 접던 자리라 검사가 따로다.
 *   - **D110** — 삭제 셋(`DeleteTable`·`DeleteDomain`·`DeleteDataElement`)의 구
 *     ECC 우회로. D61과 같은 `path: 'ecc-odata-rfc'` 표식을 쓰고 축소분이라
 *     **이연**(`check: null`)이다.
 *   - **D130** — `GetObjectNodeFromCache`. 구의 **캐시 적중** 응답이 신에는
 *     존재하지 않는다. 축소분이라 **이연**이며 D33의 관측 가능한 결과를 대신 진다.
 *   - **D132** — `GetBadiImplementations`의 ECC 브리지 부재. D110·D61과 같은 표식,
 *     같은 **이연**.
 *
 * ### 활성화 거짓 성공 계열을 왜 열로 갈랐는가
 *
 * 하나로 뭉치면 `applies`가 "쓰기 도구인데 `activated:true`를 답한 단계 전부"가
 * 되어, **등재된 적 없는 도구까지 덮는다**(예: 같은 결함을 갖고 있었으나 장부에
 * 오르지 않은 채 고쳐진 `UpdateClass`·M1 쓰기 4종 — 장부 D41·D56의 「비고」).
 * 반대로 D 번호보다 잘게 쪼개면(도구마다 새 id) 기계 장부가 사람용 장부의
 * **투영이 아니게 된다** — `id`의 계약은 "장부의 항목 번호"다.
 *
 * 그래서 **사람용 장부의 D 번호 하나 = 기계 항목 하나**로 두되, 각 항목의
 * `applies`가 **그 항목 본문이 이름 붙인 도구 집합만** 든다. 집합끼리 겹치지
 * 않으므로 배열 순서가 판정을 정하지 않는다. 집합에서 실제로 뺀 것도 있다 —
 * `CreateTable`(D56)은 활성화를 부르지 않고, `WriteTextElementsBulk`(D93)는
 * TPOOL RFC 한 번으로 끝난다.
 *
 * **마지막 반영도 같은 방침을 이었다**(D111·D114·D121·D122·D125). 예외가 하나
 * 있다 — **D120(`UpdateCdsUnitTest`)에는 채록 쪽 활성화 표식이 없다.** 구 응답에
 * `activated` 키도 "activated successfully" 문구도 없기 때문이다
 * (`engine/src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts:98-107`). 대신
 * 구 벤더가 `activateOnUpdate: true`를 박아 두어 **활성화를 부르지 않는 성공
 * 갈래가 아예 없으므로**, 그 도구에서는 「구가 성공이라 답했다」가 곧 활성화
 * 주장이다. 그래서 `applies`가 성공 갈래 전체를 든다 — D1·D2·D3·D38·D40이 이미
 * 쓰는 모양이고, 오류 갈래는 그대로 대조된다.
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
import { verifyWherePredicate } from '../../src/tools/row-data/wherePredicate';
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

/**
 * 실데이터 표의 **행 목록**. 성공 응답의 text 블록 안 JSON에서만 읽는다.
 *
 * 못 읽은 것을 "행 0건"으로 접지 않는다 — 0건은 술어를 어길 수 없어서, 접는
 * 순간 D1의 검사가 언제나 "어기지 않았다"로 기울고 등재가 무증거가 된다.
 */
function sqlRowsOf(response: JsonValue): Record<string, string | null>[] | null {
  const bodies = textBodiesAsJson(response);
  if (bodies === null) return null;
  for (const body of bodies) {
    if (!isPlainObject(body)) continue;
    const rows = body['rows'];
    if (!Array.isArray(rows)) continue;
    const out: Record<string, string | null>[] = [];
    for (const row of rows) {
      if (!isPlainObject(row)) return null;
      const cells: Record<string, string | null> = {};
      for (const [column, value] of Object.entries(row)) {
        if (value === null || typeof value === 'string') cells[column] = value;
        else return null;
      }
      out.push(cells);
    }
    return out;
  }
  return null;
}

/** 픽스처가 보낸 질의문. 인자 이름은 상시 게이트가 읽는 이름 그대로다. */
function sqlQueryOf(args: JsonValue): string | null {
  if (!isPlainObject(args)) return null;
  const query = args['sql_query'];
  return typeof query === 'string' ? query : null;
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

/**
 * `GetIncludesList` 응답에서 인클루드 이름 목록 (장부 D3).
 *
 * 두 모양을 다 읽는다 — `detailed`면 JSON 본문의 `includes`, 아니면 이름을
 * 줄바꿈으로 이은 평문이다. 어느 쪽으로도 못 읽으면 null이다.
 */
function includeNamesOf(response: JsonValue): string[] | null {
  const blocks = blocksOf(response).filter((block) => block['type'] === 'text');
  if (blocks.length === 0) return null;

  const out: string[] = [];
  for (const block of blocks) {
    const text = block['text'];
    if (typeof text !== 'string') return null;

    let parsed: JsonValue | undefined;
    try {
      parsed = JSON.parse(text) as JsonValue;
    } catch {
      parsed = undefined;
    }
    if (parsed !== undefined && isPlainObject(parsed) && Array.isArray(parsed['includes'])) {
      for (const name of parsed['includes']) if (typeof name === 'string') out.push(name);
      continue;
    }
    for (const line of text.split('\n')) {
      const name = line.trim();
      if (name !== '') out.push(name);
    }
  }
  return out;
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

// ── D41~D105 — 오브젝트 묶음 13개가 쌓아 둔 차이 ─────────────────────────────
//
// 묶음 과제들은 `harness/replay/**`가 무접촉으로 걸려 있어(같은 파일에서 매번
// 충돌한다) 사람용 장부에만 적었다. 여기 아래가 그 반영분이다.

/**
 * 응답 봉투의 `text` 블록 중 **JSON으로 읽히는 것만** 모은다.
 *
 * `textBodiesAsJson`은 하나라도 못 읽으면 null을 준다 — 그릇 바꿈 판정(D35·D36)이
 * 그 엄격함을 근거로 쓰기 때문이다. 여기는 반대로 평문 블록이 섞여도 나머지를
 * 본다. 채록 쪽 표식을 **찾는** 자리이지 동등성을 재는 자리가 아니다.
 */
function jsonTextBodies(response: JsonValue): JsonValue[] {
  const out: JsonValue[] = [];
  for (const block of blocksOf(response)) {
    if (block['type'] !== 'text') continue;
    const text = block['text'];
    if (typeof text !== 'string') continue;
    try {
      out.push(JSON.parse(text) as JsonValue);
    } catch {
      // 평문 응답 — 이 자리의 판정 대상이 아니다.
    }
  }
  return out;
}

/** JSON 안을 훑어 조건에 맞는 마디가 하나라도 있는가. */
function someIn(value: JsonValue, predicate: (node: JsonValue) => boolean): boolean {
  if (predicate(value)) return true;
  if (Array.isArray(value)) return value.some((item) => someIn(item, predicate));
  if (isPlainObject(value)) return Object.values(value).some((item) => someIn(item, predicate));
  return false;
}

/**
 * 구 응답이 **"활성화까지 마쳤다"고 주장하는가** — 활성화 거짓 성공 계열의
 * 채록 쪽 표식이다.
 *
 * 구 핸들러는 두 모양 중 하나로 그것을 말한다: ⑴ `activated: true` 키
 * (뷰·표·구조체·함수모듈·테스트클래스·화면·GUI상태·서비스바인딩), ⑵ 문구의
 * "…created/updated and **activated successfully**" (BDEF·DDLX — 그쪽 구
 * 핸들러에는 `activated` 키가 없다. `handleCreateBehaviorDefinition.ts:175-181` ·
 * `handleUpdateMetadataExtension.ts:133-137`).
 *
 * **`activate=false`로 부른 단계는 여기 걸리지 않는다** — 그 단계의 차이는
 * 등재 밖이고 그대로 대조된다. 등재가 도구를 통째로 덮지 않는 자리가 여기다.
 */
function oldClaimsActivated(response: JsonValue): boolean {
  return jsonTextBodies(response).some((body) =>
    someIn(
      body,
      (node) =>
        (isPlainObject(node) && node['activated'] === true) ||
        (typeof node === 'string' && /activated successfully/.test(node)),
    ),
  );
}

/**
 * 신 엔진이 활성화 실패를 되돌릴 때 짓는 문구.
 *
 * `src/tools/write/shared.ts`의 `parseActivationMessages`·`activationErrors`를
 * 거친 자리 전부가 같은 모양을 쓴다(`updateView.ts:140` 외 열여섯).
 */
const NEW_ACTIVATION_FAILURE = /Activation failed:[^\n]*was not activated/;

/**
 * 활성화 거짓 성공 계열의 공용 대체 기대 시험.
 *
 * **면제가 아니라 재대조다.** 구가 "활성화됨"이라 답한 자리에서 신이 오류로
 * 답했다는 것만으로는 부족하다 — 잠금 충돌·403·구문검사 실패도 같은 모양이
 * 된다. 그래서 신 쪽 문구가 **활성화 실패를 이름으로 말하는지**까지 본다.
 * 다른 이유로 실패했다면 그것은 등재된 차이가 아니라 결함 후보다.
 */
const activationVerdict: SubstituteCheck = ({ actual }) => {
  if (!actual.isError) {
    return { ok: false, detail: '신 엔진도 성공으로 답했다 — 활성화 거짓 성공을 되돌리는 갈래가 아니다.' };
  }
  if (!NEW_ACTIVATION_FAILURE.test(collectText(actual.response))) {
    return {
      ok: false,
      detail: '신 엔진이 오류로 답했으나 활성화 실패를 말하지 않는다 — 다른 이유로 막힌 것이고 등재된 차이가 아니다.',
    };
  }
  return { ok: true, detail: '구가 "활성화됨"이라 답한 자리에서 신 엔진이 활성화 실패를 이름으로 되돌렸다.' };
};

/**
 * 활성화 거짓 성공 계열의 `applies` 공장.
 *
 * 도구 이름 **집합**을 명시로 받는다 — 사람용 장부의 그 항목이 본문에 적은
 * 집합 그대로다. 집합끼리 겹치지 않으므로 배열 순서가 판정을 정하지 않는다
 * (머리주석 ①).
 */
const claimedActivation =
  (tools: ReadonlySet<string>) =>
  (step: SequenceStep): boolean =>
    tools.has(step.tool) && !step.isError && oldClaimsActivated(step.response);

/** D41 — 지역 테스트클래스. */
const D41_TOOLS: ReadonlySet<string> = new Set(['UpdateLocalTestClass']);
/** D51 — 함수모듈. */
const D51_TOOLS: ReadonlySet<string> = new Set(['UpdateFunctionModule']);
/**
 * D56 — 표·구조체.
 *
 * 장부 본문의 대상은 넷이지만 **`CreateTable`은 뺐다** — 그 도구는 활성화를
 * 부르지 않는다(`sapkit-engine/src/tools/write/createTable.ts` 머리주석: "이
 * 도구는 활성화를 부르지 않으므로 D56의 활성화 조항이 직접 닿지는 않는다").
 * 넣으면 활성화와 무관한 차이까지 이 등재가 덮는다.
 */
const D56_TOOLS: ReadonlySet<string> = new Set(['UpdateTable', 'CreateStructure', 'UpdateStructure']);
/** D66 — 뷰. */
const D66_TOOLS: ReadonlySet<string> = new Set(['UpdateView']);
/** D73 — 인터페이스. */
const D73_TOOLS: ReadonlySet<string> = new Set(['UpdateInterface']);
/** D93 — 부모 프로그램 활성화를 타는 쓰기들(`src/tools/write/internal/programScoped.ts`). */
const D93_TOOLS: ReadonlySet<string> = new Set([
  'CreateTextElement',
  'UpdateTextElement',
  'CreateScreen',
  'UpdateScreen',
  'CreateGuiStatus',
  'UpdateGuiStatus',
  'PatchGuiStatus',
]);
/** D99 — BDEF 생성·수정. */
const D99_TOOLS: ReadonlySet<string> = new Set(['CreateBehaviorDefinition', 'UpdateBehaviorDefinition']);
/** D100 — 행위 구현 수정. */
const D100_TOOLS: ReadonlySet<string> = new Set(['UpdateBehaviorImplementation']);
/** D103 — 메타데이터 확장(DDLX) 쓰기 둘. */
const D103_TOOLS: ReadonlySet<string> = new Set(['CreateMetadataExtension', 'UpdateMetadataExtension']);
/** D105 — 서비스 바인딩 생성. */
const D105_TOOLS: ReadonlySet<string> = new Set(['CreateServiceBinding']);

// ── D110~D132 — 꼬리 묶음 셋이 쌓아 둔 차이 (**마지막 반영**) ───────────────

/**
 * D110 — 구가 ECC 우회로를 갖던 삭제 셋.
 *
 * `DeleteStructure`·`DeleteView`는 여기 없다 — **구 안에서도 그 갈래를 갖지
 * 않는다**(사람용 장부 D110 본문). 넣으면 우회로와 무관한 차이까지 덮는다.
 */
const D110_TOOLS: ReadonlySet<string> = new Set(['DeleteTable', 'DeleteDomain', 'DeleteDataElement']);
/** D111 — 지역 인클루드를 비우는 삭제 넷(`src/tools/write/internal/classIncludeClear.ts`). */
const D111_TOOLS: ReadonlySet<string> = new Set([
  'DeleteLocalDefinitions',
  'DeleteLocalMacros',
  'DeleteLocalTestClass',
  'DeleteLocalTypes',
]);
/** D114 — D93의 범위 확장. 그 항목의 일곱에 없던 삭제 하나다. */
const D114_TOOLS: ReadonlySet<string> = new Set(['DeleteTextElement']);
/** D121 — 지역 정의 갱신. */
const D121_TOOLS: ReadonlySet<string> = new Set(['UpdateLocalDefinitions']);
/** D122 — 지역 매크로 갱신. */
const D122_TOOLS: ReadonlySet<string> = new Set(['UpdateLocalMacros']);
/** D125 — 도메인 갱신. 짝인 `CreateDomain`은 요구 급이 attended라 이 항목 밖이다. */
const D125_TOOLS: ReadonlySet<string> = new Set(['UpdateDomain']);

/**
 * D115 — 구 `DeleteServiceBinding`이 실어 보낸 삭제 응답이 **「안 지웠다」**고
 * 말하는가. 이것이 이 차이의 채록 쪽 표식이다.
 *
 * 구 겉 핸들러는 삭제 서비스의 본문을 `payload`에 그대로 싣는다
 * (`engine/src/handlers/service_binding/high/handleDeleteServiceBinding.ts:66-81`).
 * `response_format`이 `xml`이면 `attributeNamePrefix: ''`로 파싱돼
 * `"del:isDeleted": "false"`가 되고, `plain`이면 원문 그대로
 * `del:isDeleted=\"false\"`가 남는다. **두 모양을 다 잡는다.**
 *
 * `"true"`인 응답은 실제로 지운 것이므로 이 차이가 아니다 — 그대로 대조된다.
 */
const OLD_NOT_DELETED = /isDeleted["'\\]*\s*[:=]\s*["'\\]*false/i;

/** 신 엔진이 삭제 거짓 성공을 되돌릴 때 짓는 문구(`src/tools/write/internal/deletion.ts`). */
const NEW_DELETION_FAILURE = /deletion failed:/i;

/**
 * D115의 대체 기대 시험 — 활성화 계열과 **같은 모양의 재대조**다.
 *
 * "신이 오류로 답했다"만으로는 부족하다. 잠금 충돌·403도 같은 모양이 되므로,
 * 신 쪽 문구가 **삭제 실패를 이름으로 말하는지**까지 본다.
 */
const deletionVerdict: SubstituteCheck = ({ actual }) => {
  if (!actual.isError) {
    return { ok: false, detail: '신 엔진도 성공으로 답했다 — 삭제 거짓 성공을 되돌리는 갈래가 아니다.' };
  }
  if (!NEW_DELETION_FAILURE.test(collectText(actual.response))) {
    return {
      ok: false,
      detail: '신 엔진이 오류로 답했으나 삭제 실패를 말하지 않는다 — 다른 이유로 막힌 것이고 등재된 차이가 아니다.',
    };
  }
  return { ok: true, detail: '구가 "지웠다"고 답한 자리에서 신 엔진이 삭제 실패를 이름으로 되돌렸다.' };
};

/** D77 — 구가 `type:'json'`으로 싣던 인핸스먼트 도구 둘. `GetEnhancements`는 구도 text였다. */
const ENHANCEMENT_JSON_TOOLS: ReadonlySet<string> = new Set(['GetEnhancementSpot', 'GetEnhancementImpl']);

/** D81 — 구가 이송번호를 잃었다는 자국. 그 문구가 곧 이 차이의 채록 쪽 표식이다. */
const OLD_TRANSPORT_UNKNOWN = /Transport request unknown created successfully/;

/** D61 — 구 ECC OData 브리지가 답한 자국(`path: 'ecc-odata-rfc'`). 네 핸들러가 전부 이 키를 싣는다. */
const D61_TOOLS: ReadonlySet<string> = new Set(['GetDataElement', 'GetDomain', 'CreateDataElement', 'CreateDomain']);

function usedOldEccBridge(response: JsonValue): boolean {
  return jsonTextBodies(response).some((body) =>
    someIn(body, (node) => isPlainObject(node) && node['path'] === 'ecc-odata-rfc'),
  );
}

/** D46 — `GetProgFullCode` 성공 본문 하나. 그 모양이 아니면 null. */
function fullCodeBody(
  response: JsonValue,
): { root: { [key: string]: JsonValue }; objects: { [key: string]: JsonValue }[] } | null {
  const bodies = jsonTextBodies(response);
  const root = bodies.length === 1 ? bodies[0] : undefined;
  if (root === undefined || !isPlainObject(root)) return null;
  const list = root['code_objects'];
  if (!Array.isArray(list)) return null;
  const objects = list.filter(isPlainObject);
  if (objects.length !== list.length) return null;
  return { root, objects };
}

/** 코드 객체 하나를 가리키는 열쇠 — 종류와 이름의 짝. */
function codeObjectKey(object: { [key: string]: JsonValue }): string {
  return `${String(object['OBJECT_TYPE'])} ${String(object['OBJECT_NAME'])}`;
}

/** 목록에서 파생되는 두 키를 뺀 나머지 — 여기가 달라지면 등재된 차이가 아니다. */
function fullCodeHead(root: { [key: string]: JsonValue }): JsonValue {
  const rest: { [key: string]: JsonValue } = {};
  for (const [name, value] of Object.entries(root)) {
    if (name === 'code_objects' || name === 'total_code_objects') continue;
    rest[name] = value;
  }
  return rest;
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
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#m1-사전-등재 · sapkit-engine/harness/DIVERGENCES.md#d1-활성화 · ' +
      'HANDOFF.md §6 항목 13-9 · D-079 ⑤ · sapkit-engine/src/tools/row-data/wherePredicate.ts',
    // 장부가 적어 둔 소유자("실데이터 도구 작업")가 왔다. 시험 본체는 아래 경로에
    // 실재하므로 산문 자리를 **파일 경로**로 바꾼다 — 산문이면 대장이 없는 증거를
    // 있다고 보고한다(`harness/ledger/evidence.ts`의 substituteEvidenceFromLedger).
    substituteTest:
      'sapkit-engine/src/tools/row-data/__tests__/getSqlQuery.test.ts — 「13-9 — WHERE가 결과에 실제로 반영되는가」 9건 · ' +
      'sapkit-engine/harness/replay/__tests__/divergences.test.ts — 「D1 — 술어를 무시한 표를 성공으로 내주지 않는다」 절',
    resolvesIn: null,
    applies: (step) => step.tool === 'GetSqlQuery',
    // 등재는 **차이가 났을 때만** 발동한다(머리주석). 그러므로 여기 오는 것은
    // 구·신이 갈린 자리뿐이고, D1이 덮는 갈림은 하나다 — 구가 술어를 어긴 표를
    // 성공으로 냈고 신이 그 표를 거부한 자리. 그 밖의 갈림은 등재 밖이다.
    //
    // 판정 자를 여기서 새로 짜지 않는다. 도구가 쓰는 검증기를 그대로 부른다 —
    // 검사가 자기 자를 따로 들면 "도구는 거부했는데 등재는 옳다고 못 하는" 어긋남이
    // 생기고, 그 어긋남은 신 엔진 결함처럼 보인다.
    check: ({ recorded, actual }) => {
      if (!actual.isError) {
        return { ok: false, detail: '신 엔진이 표를 성공으로 내줬다 — D1이 덮는 갈림이 아니다.' };
      }
      if (!/ERR_SQLQUERY_PREDICATE_IGNORED/.test(collectText(actual.response))) {
        return { ok: false, detail: '신 엔진의 거부가 술어 무시 거부가 아니다 — 다른 오류다.' };
      }
      if (recorded.isError) {
        return { ok: false, detail: '구도 오류였다 — 거부할 표가 애초에 없었다.' };
      }
      const sql = sqlQueryOf(recorded.args);
      if (sql === null) return { ok: false, detail: '픽스처에서 sql_query를 읽지 못했다.' };
      const rows = sqlRowsOf(recorded.response);
      if (rows === null) return { ok: false, detail: '구 응답에서 행 표를 읽지 못했다.' };

      const verdict = verifyWherePredicate(sql, rows);
      if (verdict.kind !== 'violated') {
        return {
          ok: false,
          detail: `구가 낸 표는 자기 술어를 어기지 않았다(${verdict.kind}) — 신 엔진이 옳은 표를 거부했다.`,
        };
      }
      return {
        ok: true,
        detail:
          `구는 술어를 어긴 표를 성공으로 냈고(${verdict.term} · 컬럼 ${verdict.column} · ` +
          `행 #${verdict.rowIndex + 1}) 신 엔진은 그 표를 거부했다.`,
      };
    },
  },
  {
    id: 'D2',
    title: 'UpdateLocalTypes — activate_on_update:true에서 거짓 성공하던 것을 고침',
    tool: 'UpdateLocalTypes',
    classification: '수리',
    // **휴면에서 깨어났다.** `UpdateLocalTypes`를 지은 마일스톤이 활성화 조건이었고
    // (`sapkit-engine/src/tools/write/updateLocalTypes.ts`), 대체 기대 시험을
    // 그 자리에서 저작했다.
    status: 'active',
    // 근거 경로는 **커밋된 것만** 적는다. 벤더 패키지(`@babamba2`)는 레포에
    // 커밋되지 않으므로 여기 적으면 「경로는 전부 실재한다」 하드 게이트가
    // 깨진다 — 그 실측 자리(재정의된 update가 activateOnUpdate를 읽지 않는
    // 줄)는 아래 두 문서가 파일·줄로 담고 있다.
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#m1-사전-등재 · HANDOFF.md §6 항목 13-11 · D-079 ⑤ · ' +
      'sapkit-engine/src/tools/write/updateLocalTypes.ts (머리주석에 벤더 실측 자리) · ' +
      'engine/src/handlers/class/high/handleUpdateLocalTypes.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateLocalTypes.test.ts — 「D2 — activate_on_update의 거짓 성공을 고쳤다」 5건',
    // 해소됐다 — 더 기다릴 마일스톤이 없다.
    resolvesIn: null,
    applies: (step) => step.tool === 'UpdateLocalTypes',
    // **이연**이다(D37과 같은 모양). 재생 대조가 보는 것은 도구 응답 시퀀스인데,
    // 이 차이의 본체는 **활성화 요청이 나갔는가**라는 와이어 사실이라 응답만으로는
    // 구와 신을 가를 수 없다(둘 다 `activated:true`를 답할 수 있다). 판정 자리는
    // 위 계약 시험이고, 재생은 이 단계를 통과가 아니라 무증거로 센다.
    check: null,
  },
  {
    id: 'D3',
    title: 'GetIncludesList — `INCLUDE … IF FOUND`의 비실재 객체명을 돌려주던 것을 고침',
    tool: 'GetIncludesList',
    classification: '수리',
    // **활성화됐다** — 이 도구를 짓는 판(인클루드 묶음)에서 휴면을 깨웠다.
    // 휴면인 채로 두면 러너가 이 도구의 모든 단계를 `mismatch`로 떨어뜨린다
    // (`judgeWithLedger`의 휴면 갈래) — 도구가 실재하는데 장부가 낡았다는 신호를
    // 그대로 두는 셈이기 때문이다.
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d3-활성화 · HANDOFF.md §6 항목 13-13 · D-079 ⑤ · ' +
      'sapkit-engine/src/tools/read/getIncludesList.ts · ' +
      'engine/src/handlers/include/readonly/handleGetIncludesList.ts · ' +
      'engine/src/handlers/system/readonly/handleGetObjectInfo.ts',
    substituteTest:
      'sapkit-engine/src/tools/read/__tests__/getIncludesList.test.ts — 「장부 D3」 절 5건',
    resolvesIn: null,
    applies: (step) => step.tool === 'GetIncludesList',
    // 구가 실었던 이름 중 **신에서 빠진 것만** 등재된 차이다. 이름이 늘거나
    // 구·신 공통분이 어긋나면 등재가 덮어 주지 않는다 — 그 자리가 결함이다.
    check: ({ recorded, actual }) => {
      if (actual.isError) return { ok: false, detail: '신 엔진이 목록 조회를 오류로 답했다 — 이 등재의 갈래가 아니다.' };
      const before = includeNamesOf(recorded.response);
      const after = includeNamesOf(actual.response);
      if (before === null || after === null) {
        return { ok: false, detail: '양쪽 응답에서 인클루드 이름 목록을 읽지 못했다.' };
      }
      const added = after.filter((name) => !before.includes(name));
      if (added.length > 0) {
        return { ok: false, detail: `구에 없던 이름이 늘었다 — ${added.slice(0, 5).join(', ')}. 등재된 차이가 아니다.` };
      }
      const dropped = before.filter((name) => !after.includes(name));
      if (dropped.length === 0) {
        return { ok: false, detail: '뺀 이름이 없다 — 이 단계에서는 D3가 발동할 차이가 없었다.' };
      }
      return {
        ok: true,
        detail: `구가 싣던 이름 중 주소 없는 ${dropped.length}건만 빠졌다 — ${dropped.slice(0, 5).join(', ')}.`,
      };
    },
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

  // ── D41~D105 (오브젝트 묶음 13개의 반영분) ─────────────────────────────────

  {
    id: 'D41',
    title: 'UpdateLocalTestClass — 활성화 실패를 성공으로 접지 않는다',
    tool: 'UpdateLocalTestClass',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d41 · sapkit-engine/src/tools/write/updateLocalTestClass.ts · ' +
      'engine/src/handlers/class/high/handleUpdateLocalTestClass.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateLocalTestClass.test.ts — 「D41 — 활성화 실패를 성공으로 접지 않는다」 5건',
    resolvesIn: null,
    applies: claimedActivation(D41_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D46',
    title: 'GetProgFullCode — 인클루드 본문을 실제로 꺼낸다 (구: `data` 키 오타로 빈손)',
    tool: 'GetProgFullCode',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d46 · sapkit-engine/src/tools/read/getProgFullCode.ts · ' +
      'engine/src/handlers/program/readonly/handleGetProgFullCode.ts',
    substituteTest:
      'sapkit-engine/src/tools/read/__tests__/getProgFullCode.test.ts — 「중첩 인클루드까지 내려간다」·「함수그룹의 인클루드에도 코드가 실린다」',
    resolvesIn: null,
    // 성공 응답 중 `code_objects`를 실은 것만. 오류 단계·평문 갈래는 등재 밖이다.
    applies: (step) => step.tool === 'GetProgFullCode' && !step.isError && fullCodeBody(step.response) !== null,
    // 등재된 차이는 둘뿐이다 — ⑴ `code: null`이 문자열로 채워지는 것,
    // ⑵ 구가 못 찾던 중첩 인클루드가 **느는** 것. 구가 싣던 값이 달라지거나
    // 항목이 빠지면 등재가 덮어 주지 않는다.
    check: ({ recorded, actual }) => {
      if (actual.isError) return { ok: false, detail: '신 엔진이 전량 코드 조회를 오류로 답했다 — 이 등재의 갈래가 아니다.' };
      const before = fullCodeBody(recorded.response);
      const after = fullCodeBody(actual.response);
      if (before === null || after === null) {
        return { ok: false, detail: '양쪽 응답을 code_objects를 실은 JSON 본문으로 읽지 못했다.' };
      }

      const headDelta = jsonDelta(fullCodeHead(before.root), fullCodeHead(after.root));
      if (headDelta.length > 0) {
        return { ok: false, detail: `목록 밖의 값이 달라졌다 — ${showDelta(headDelta)}. 등재된 차이가 아니다.` };
      }

      const fresh = new Map(after.objects.map((object) => [codeObjectKey(object), object]));
      const filled: string[] = [];
      for (const object of before.objects) {
        const key = codeObjectKey(object);
        const now = fresh.get(key);
        if (now === undefined) {
          return { ok: false, detail: `구가 싣던 코드 객체가 빠졌다 — ${key}. 등재된 차이가 아니다.` };
        }
        const wasEmpty = object['code'] === null;
        if (wasEmpty && typeof now['code'] !== 'string') {
          return { ok: false, detail: `${key}의 code가 여전히 비어 있다 — 등재는 그 수리를 요구한다.` };
        }
        const delta = jsonDelta(object as JsonValue, now as JsonValue).filter(
          (entry) => !(wasEmpty && entry.key === 'code'),
        );
        if (delta.length > 0) {
          return { ok: false, detail: `구가 싣던 값이 달라졌다 — ${key} · ${showDelta(delta)}. 등재된 차이가 아니다.` };
        }
        if (wasEmpty) filled.push(key);
      }

      const known = new Set(before.objects.map(codeObjectKey));
      const added = after.objects.map(codeObjectKey).filter((key) => !known.has(key));
      if (filled.length === 0 && added.length === 0) {
        return { ok: false, detail: '채운 code도 늘어난 인클루드도 없다 — 이 단계에서는 D46이 발동할 차이가 없었다.' };
      }
      return {
        ok: true,
        detail: `빈손이던 code ${filled.length}건이 채워졌고 구가 못 찾던 인클루드 ${added.length}건이 붙었다.`,
      };
    },
  },
  {
    id: 'D51',
    title: 'UpdateFunctionModule — 활성화 응답을 읽는다 (구: 버린다)',
    tool: 'UpdateFunctionModule',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d51 · sapkit-engine/src/tools/write/updateFunctionModule.ts · ' +
      'engine/src/handlers/function/high/handleUpdateFunctionModule.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateFunctionModule.test.ts — ' +
      '「활성화가 200에 오류를 담아 와도 성공으로 접지 않는다 (D51)」',
    resolvesIn: null,
    applies: claimedActivation(D51_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D56',
    title: '표·구조체 쓰기 — 활성화 실패를 성공으로 답하지 않는다',
    // 도구 셋에 걸린다. `tool`은 한 이름만 담으므로 null로 두고 `applies`가
    // 그 집합을 든다 (D36과 같은 모양).
    tool: null,
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d56 · sapkit-engine/src/tools/write/shared.ts · ' +
      'engine/src/handlers/table/high/handleUpdateTable.ts · engine/src/handlers/structure/high/handleUpdateStructure.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateTable.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/updateStructure.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/createStructure.test.ts',
    resolvesIn: null,
    applies: claimedActivation(D56_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D61',
    title: '데이터 엘리먼트·도메인의 ECC OData 우회로가 없다 — 접속 전에 거절한다',
    tool: null,
    classification: '축소',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d61 · sapkit-engine/src/tools/read/internal/dataElementDomainRead.ts · ' +
      'sapkit-engine/src/tools/write/dataElementDomainCreate.ts · ' +
      'engine/src/handlers/data_element/high/handleGetDataElement.ts',
    substituteTest:
      'sapkit-engine/src/tools/read/__tests__/getDataElement.test.ts · ' +
      'sapkit-engine/src/tools/read/__tests__/getDomain.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/createDataElement.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/createDomain.test.ts',
    resolvesIn: '`src/rfc`에 DDIC FunctionImport 4종을 여는 마일스톤',
    applies: (step) => D61_TOOLS.has(step.tool) && !step.isError && usedOldEccBridge(step.response),
    // **이연**이다(D37과 같은 모양). 축소분이 옳다는 것을 재생이 증명할 수는
    // 없다 — 덜 채워진 쪽이 옳다는 말이 성립하지 않는다. 신 거절 문구가
    // 빠진 브리지 이름과 `divergence D61`을 지목하는지는 위 계약 시험이 본다.
    check: null,
  },
  {
    id: 'D66',
    title: 'UpdateView — 활성화 거짓 성공을 성공으로 접지 않는다',
    tool: 'UpdateView',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d66 · sapkit-engine/src/tools/write/updateView.ts · ' +
      'engine/src/handlers/view/high/handleUpdateView.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateView.test.ts — ' +
      '「D66 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다」·「경고만 있는 활성화는 성공이고 문구가 그대로 실린다」',
    resolvesIn: null,
    applies: claimedActivation(D66_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D73',
    title: 'UpdateInterface — 활성화 실패를 성공으로 접지 않는다',
    tool: 'UpdateInterface',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d73 · sapkit-engine/src/tools/write/updateInterface.ts · ' +
      'engine/src/handlers/interface/high/handleUpdateInterface.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateInterface.test.ts — ' +
      '「활성화가 E를 담아 200으로 오면 실패로 보고한다 (D73)」',
    resolvesIn: null,
    applies: claimedActivation(D73_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D77',
    title: '인핸스먼트 두 도구의 `type: json` 블록을 규약대로 text로 (D36의 같은 규칙)',
    // 두 도구에 걸린다 — D36과 같은 이유로 `tool`은 null이다.
    tool: null,
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d77 · sapkit-engine/src/server/toolDefinition.ts · ' +
      'engine/src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts · ' +
      'engine/src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts',
    substituteTest:
      'sapkit-engine/src/tools/read/__tests__/getEnhancementSpot.test.ts · ' +
      'sapkit-engine/src/tools/read/__tests__/getEnhancementImpl.test.ts',
    resolvesIn: null,
    // `GetEnhancements`는 구도 `type:'text'`였다(`handleGetEnhancements.ts:662-670`) —
    // 이 항목 밖이고 그 도구의 차이는 그대로 대조된다.
    applies: (step) => ENHANCEMENT_JSON_TOOLS.has(step.tool) && oldJsonBodies(step.response).length > 0,
    check: ({ recorded, actual }) => rewrapVerdict(recorded, actual, []),
  },
  {
    id: 'D81',
    title: 'CreateTransport — 만든 이송번호를 응답에 싣는다 (구: 키 이름 어긋남으로 빈손)',
    tool: 'CreateTransport',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d81 · sapkit-engine/src/tools/write/createTransport.ts · ' +
      'engine/src/handlers/transport/high/handleCreateTransport.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/createTransport.test.ts — 「응답 — 구의 키 + 이송번호 수리(D81)」 2건',
    resolvesIn: null,
    // 구가 번호를 **잃은** 채록분에만 걸린다. 번호가 살아 있던 응답은 이 차이가
    // 아니므로 그대로 대조된다.
    applies: (step) => step.tool === 'CreateTransport' && !step.isError && OLD_TRANSPORT_UNKNOWN.test(collectText(step.response)),
    check: ({ recorded, actual }) => {
      if (actual.isError) return { ok: false, detail: '신 엔진이 이송요청 생성을 오류로 답했다 — 이 등재의 갈래가 아니다.' };
      const old = jsonTextBodies(recorded.response);
      const fresh = jsonTextBodies(actual.response);
      const before = old.length === 1 ? old[0] : undefined;
      const after = fresh.length === 1 ? fresh[0] : undefined;
      if (before === undefined || after === undefined || !isPlainObject(after)) {
        return { ok: false, detail: '양쪽 응답을 text 블록 하나의 JSON 본문으로 읽지 못했다.' };
      }
      const number = after['transport_request'];
      if (typeof number !== 'string' || number.trim() === '') {
        return { ok: false, detail: '신 응답에도 이송번호가 없다 — 등재는 그 수리를 요구한다.' };
      }
      if (OLD_TRANSPORT_UNKNOWN.test(collectText(actual.response))) {
        return { ok: false, detail: '신 응답의 문구가 여전히 unknown이다 — 번호를 잃은 자리가 그대로다.' };
      }
      const offending = jsonDelta(before, after).filter(
        (entry) => entry.key === null || (entry.key !== 'transport_request' && entry.key !== 'message'),
      );
      if (offending.length > 0) {
        return { ok: false, detail: `번호·문구 말고 다른 키가 달라졌다 — ${showDelta(offending)}. 등재된 차이가 아니다.` };
      }
      return { ok: true, detail: '구가 잃던 이송번호가 `transport_request`와 문구에 실렸고, 나머지 키는 그대로다.' };
    },
  },
  {
    id: 'D93',
    title: '텍스트요소·화면·GUI상태 쓰기 — 부모 프로그램 활성화의 거짓 성공을 접지 않는다',
    tool: null,
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d93 · sapkit-engine/src/tools/write/internal/programScoped.ts · ' +
      'engine/src/handlers/text_element/high/handleCreateTextElement.ts · ' +
      'engine/src/handlers/screen/high/handleUpdateScreen.ts · ' +
      'engine/src/handlers/gui_status/high/handlePatchGuiStatus.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/createTextElement.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/updateTextElement.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/createScreen.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/updateScreen.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/createGuiStatus.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/updateGuiStatus.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/patchGuiStatus.test.ts',
    resolvesIn: null,
    // `WriteTextElementsBulk`는 여기 없다 — 그 도구는 ADT 활성화를 부르지 않고
    // TPOOL RFC 한 번으로 끝난다(`src/tools/write/writeTextElementsBulk.ts` 머리주석).
    applies: claimedActivation(D93_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D99',
    title: 'CreateBehaviorDefinition·UpdateBehaviorDefinition — 활성화 응답을 읽는다',
    tool: null,
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d99 · sapkit-engine/src/tools/write/createBehaviorDefinition.ts · ' +
      'sapkit-engine/src/tools/write/updateBehaviorDefinition.ts · ' +
      'engine/src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/createBehaviorDefinition.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/updateBehaviorDefinition.test.ts',
    resolvesIn: null,
    applies: claimedActivation(D99_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D100',
    title: 'UpdateBehaviorImplementation — 활성화 실패를 성공으로 접지 않는다',
    tool: 'UpdateBehaviorImplementation',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d100 · sapkit-engine/src/tools/write/updateBehaviorImplementation.ts · ' +
      'engine/src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateBehaviorImplementation.test.ts — ' +
      '「활성화가 E를 담아 200으로 오면 실패로 보고한다 (D100)」',
    resolvesIn: null,
    applies: claimedActivation(D100_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D103',
    title: '메타데이터 확장(DDLX) 쓰기 둘 — 활성화 거짓 성공을 접지 않는다',
    tool: null,
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d103 · sapkit-engine/src/tools/write/createMetadataExtension.ts · ' +
      'sapkit-engine/src/tools/write/updateMetadataExtension.ts · ' +
      'engine/src/handlers/ddlx/high/handleUpdateMetadataExtension.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/createMetadataExtension.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/updateMetadataExtension.test.ts',
    resolvesIn: null,
    applies: claimedActivation(D103_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D105',
    title: 'CreateServiceBinding — 활성화 거짓 성공을 접지 않는다',
    tool: 'CreateServiceBinding',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d105 · sapkit-engine/src/tools/write/createServiceBinding.ts · ' +
      'engine/src/handlers/service_binding/high/handleCreateServiceBinding.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/createServiceBinding.test.ts — ' +
      '「D105 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다」',
    resolvesIn: null,
    applies: claimedActivation(D105_TOOLS),
    check: activationVerdict,
  },

  // ── D110~D132 (꼬리 묶음 셋의 반영분 — 마지막 반영) ────────────────────────

  {
    id: 'D110',
    title: '표·도메인·데이터 엘리먼트 삭제의 ECC 우회로가 없다 — 접속 전에 거절한다',
    // 도구 셋에 걸린다. `tool`은 한 이름만 담으므로 null로 두고 `applies`가 집합을 든다.
    tool: null,
    classification: '축소',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d110 · sapkit-engine/src/tools/write/internal/deletion.ts · ' +
      'engine/src/handlers/table/high/handleDeleteTable.ts · ' +
      'engine/src/handlers/domain/high/handleDeleteDomain.ts · ' +
      'engine/src/handlers/data_element/high/handleDeleteDataElement.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/deleteTable.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/deleteDomain.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/deleteDataElement.test.ts — 각 「D110 — ECC」 절',
    resolvesIn: 'RFC **쓰기** 브리지를 짓는 판 (D61이 여는 DDIC 읽기·생성과 같은 묶음)',
    // D61과 같은 표식이다 — 구 ECC 갈래만 `path: 'ecc-odata-rfc'`를 싣는다.
    // ADT 갈래는 그 자국이 없으므로 등재 밖이고 그대로 대조된다.
    applies: (step) => D110_TOOLS.has(step.tool) && !step.isError && usedOldEccBridge(step.response),
    // **이연**이다(D61·D37과 같은 모양). 축소분이 옳다는 것을 재생이 증명할 수 없다.
    check: null,
  },
  {
    id: 'D111',
    title: '지역 인클루드 삭제 넷 — 부모 클래스 활성화의 거짓 성공을 접지 않는다',
    tool: null,
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d111 · sapkit-engine/src/tools/write/internal/classIncludeClear.ts · ' +
      'engine/src/handlers/class/high/handleDeleteLocalTestClass.ts · ' +
      'engine/src/handlers/class/high/handleDeleteLocalDefinitions.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/localIncludeClearSupport.ts — 「D111」 두 건 · ' +
      'sapkit-engine/src/tools/write/__tests__/deleteLocalTestClass.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/deleteLocalDefinitions.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/deleteLocalMacros.test.ts · ' +
      'sapkit-engine/src/tools/write/__tests__/deleteLocalTypes.test.ts',
    resolvesIn: null,
    // 구는 `activated: activate_on_delete`를 그대로 실었다 — `activate_on_delete:false`로
    // 부른 단계는 걸리지 않고 그대로 대조된다.
    applies: claimedActivation(D111_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D114',
    title: 'DeleteTextElement — 부모 프로그램 활성화의 거짓 성공을 접지 않는다 (D93의 범위 확장)',
    tool: 'DeleteTextElement',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d114 · sapkit-engine/src/tools/write/internal/programScoped.ts · ' +
      'sapkit-engine/src/tools/write/deleteTextElement.ts · ' +
      'engine/src/handlers/text_element/high/handleDeleteTextElement.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/deleteTextElement.test.ts — 「D114」 절 (오류면 실패 · 경고만이면 성공)',
    resolvesIn: null,
    // D93의 일곱과 **겹치지 않는다** — 그 항목 본문이 열거한 여덟에 이 도구는 없었다.
    applies: claimedActivation(D114_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D115',
    title: 'DeleteServiceBinding — 삭제 응답의 거짓 성공을 성공으로 접지 않는다',
    tool: 'DeleteServiceBinding',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d115 · sapkit-engine/src/tools/write/deleteServiceBinding.ts · ' +
      'sapkit-engine/src/tools/write/internal/deletion.ts · ' +
      'engine/src/handlers/service_binding/high/handleDeleteServiceBinding.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/deleteServiceBinding.test.ts — ' +
      '「D115」 두 건(`isDeleted="false"`면 실패 · `"true"`면 성공)',
    resolvesIn: null,
    // 구가 「지웠다」고 답했으나 본문은 아니라고 말한 단계에만 걸린다. 실제로
    // 지운 응답은 이 차이가 아니므로 그대로 대조된다.
    applies: (step) =>
      step.tool === 'DeleteServiceBinding' && !step.isError && OLD_NOT_DELETED.test(collectText(step.response)),
    check: deletionVerdict,
  },
  {
    id: 'D120',
    title: 'UpdateCdsUnitTest — 활성화 거짓 성공을 성공으로 접지 않는다',
    tool: 'UpdateCdsUnitTest',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d120 · sapkit-engine/src/tools/write/updateCdsUnitTest.ts · ' +
      'engine/src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateCdsUnitTest.test.ts — 「D120」 절',
    resolvesIn: null,
    // **이 계열에서 유일하게 채록 표식이 없다.** 구 응답에 `activated` 키도
    // "activated successfully" 문구도 없기 때문이다(구 핸들러 `:98-107`). 대신
    // 구 벤더가 `activateOnUpdate: true`를 박아 두어 활성화를 부르지 않는 성공
    // 갈래가 없으므로, 이 도구에서는 **성공이 곧 활성화 주장**이다. 오류 갈래는
    // 등재 밖이고 그대로 대조된다.
    applies: (step) => step.tool === 'UpdateCdsUnitTest' && !step.isError,
    check: activationVerdict,
  },
  {
    id: 'D121',
    title: 'UpdateLocalDefinitions — activate_on_update의 거짓 성공을 고쳤다',
    tool: 'UpdateLocalDefinitions',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d121 · sapkit-engine/src/tools/write/updateLocalDefinitions.ts · ' +
      'engine/src/handlers/class/high/handleUpdateLocalDefinitions.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateLocalDefinitions.test.ts — 「D121」 절',
    resolvesIn: null,
    applies: claimedActivation(D121_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D122',
    title: 'UpdateLocalMacros — activate_on_update의 거짓 성공을 고쳤다',
    tool: 'UpdateLocalMacros',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d122 · sapkit-engine/src/tools/write/updateLocalMacros.ts · ' +
      'engine/src/handlers/class/high/handleUpdateLocalMacros.ts',
    substituteTest:
      'sapkit-engine/src/tools/write/__tests__/updateLocalMacros.test.ts — 「D122」 절',
    resolvesIn: null,
    applies: claimedActivation(D122_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D125',
    title: 'UpdateDomain — 활성화 거짓 성공을 성공으로 접지 않는다',
    tool: 'UpdateDomain',
    classification: '수리',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d125 · sapkit-engine/src/tools/write/updateDomain.ts · ' +
      'engine/src/handlers/domain/high/handleUpdateDomain.ts',
    substituteTest: 'sapkit-engine/src/tools/write/__tests__/updateDomain.test.ts — 「D125」 절',
    resolvesIn: null,
    // 구는 `activate:false`면 문구에서 " and activated"를 뺀다 — 그 단계는
    // 걸리지 않고 그대로 대조된다.
    applies: claimedActivation(D125_TOOLS),
    check: activationVerdict,
  },
  {
    id: 'D130',
    title: 'GetObjectNodeFromCache — 도구 사이 캐시가 없어 언제나 「캐시에 없다」로 답한다',
    tool: 'GetObjectNodeFromCache',
    classification: '축소',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d130 · sapkit-engine/src/tools/read/getObjectNodeFromCache.ts · ' +
      'engine/src/handlers/system/readonly/handleGetObjectNodeFromCache.ts · ' +
      'engine/src/lib/getObjectsListCache.ts',
    substituteTest:
      'sapkit-engine/src/tools/read/__tests__/getObjectNodeFromCache.test.ts — ' +
      '「캐시 없음 갈래」 3건(문구 일치 + 접속 시도 0회) · 「인자 갈래」 4건',
    resolvesIn: '도구 사이 캐시의 자리(프로세스 전역이냐 접속 수명이냐)를 정하고 채우는 다섯 도구를 함께 고치는 판',
    // 구의 **캐시 적중** 성공에만 걸린다. 빈-캐시 갈래(`isError` + `Node not found
    // in cache`)는 신이 글자까지 같으므로 등재 밖이고 그대로 대조된다 — 그 문구가
    // 달라지면 결함으로 잡혀야 한다.
    applies: (step) => step.tool === 'GetObjectNodeFromCache' && !step.isError,
    // **이연**이다. 축소분이 옳다는 것을 재생이 증명할 수 없다 — 「캐시에 없다」가
    // 옳다는 말은 캐시를 여는 판이 내릴 판정이다.
    check: null,
  },
  {
    id: 'D132',
    title: 'GetBadiImplementations — ECC 브리지가 없어 ECC에서도 거절한다',
    tool: 'GetBadiImplementations',
    classification: '축소',
    status: 'active',
    evidence:
      'sapkit-engine/harness/DIVERGENCES.md#d132 · sapkit-engine/src/tools/read/getBadiImplementations.ts · ' +
      'engine/src/handlers/enhancement/readonly/handleGetBadiImplementations.ts',
    substituteTest:
      'sapkit-engine/src/tools/read/__tests__/getBadiImplementations.test.ts — ' +
      '「ECC가 아닌 갈래」 6건 · 「ECC 갈래」 4건(접속 시도 0회) · 「인자 갈래」 1건',
    resolvesIn: '`src/rfc`의 OData 통로에 FunctionImport `DdicBadi`를 여는 판 (D61의 DDIC 4종과 같은 묶음)',
    // 비-ECC 갈래는 구와 글자까지 같은 거절이라 등재 밖이다 — `path:'ecc-odata-rfc'`를
    // 실은 ECC 성공에만 걸린다(D61·D110과 같은 표식).
    applies: (step) => step.tool === 'GetBadiImplementations' && !step.isError && usedOldEccBridge(step.response),
    check: null,
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
