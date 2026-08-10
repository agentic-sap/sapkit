/**
 * RFC 분배층의 공용 타입.
 *
 * "통로"(channel) 하나 = **이 요청을 SAP의 RFC 대리자에게 보내고 결과를 받는다**는
 * 한 가지 일의 구현이다. 대리자는 기설치된 `ZMCP_ADT_DISPATCH` /
 * `ZMCP_ADT_TEXTPOOL` 두 함수모듈이고(결정 D-079 ⑥ — SAP 측 무접촉), 통로는
 * 그 둘에 **어떻게 닿느냐**만 다르다. 다섯 경로 전부 같은 이 인터페이스를
 * 구현하며, M1이 실제로 짓는 것은 그중 `odata` 하나다.
 */

/** 구 엔진이 인정하는 다섯 통로 이름. */
export type RfcBackendName = 'odata' | 'soap' | 'native' | 'gateway' | 'zrfc';

/** `ZMCP_ADT_TEXTPOOL`이 받는 세 동작. */
export type TextpoolAction = 'READ' | 'WRITE' | 'WRITE_INACTIVE';

export interface TextpoolParams {
  readonly program: string;
  readonly language?: string;
  /** 텍스트풀 전체 배열의 JSON. WRITE는 항상 **전량**을 싣는다. */
  readonly textpoolJson?: string;
}

/**
 * 대리자 호출 하나의 결과.
 *
 * `subrc`가 0이 아니면 통로는 이 값을 돌려주지 않고 `RfcError('sap')`을 던진다 —
 * 여기 담긴 0이 아닌 subrc를 보게 되는 호출자는 없다. 필드를 남겨 두는 것은
 * 구 엔진의 반환 형태를 그대로 승계하기 위해서다.
 */
export interface RfcCallResult {
  /** `EV_RESULT`를 JSON으로 푼 값. 풀리지 않으면 호출별 기본값으로 떨어진다. */
  readonly result: unknown;
  /** ABAP `sy-subrc`. */
  readonly subrc: number;
  /** `EV_MESSAGE` — 사람용 문구. */
  readonly message: string;
}

export type DispatchResult = RfcCallResult;
export type TextpoolResult = RfcCallResult;
export type DdicReadResult = RfcCallResult;

/** `ZMCP_ADT_DDIC_TABL_READ`가 받는 두 인자. */
export interface DdicTablReadParams {
  /** DDIC 오브젝트 이름. 대문자 정규화는 호출자 몫이다. */
  readonly name: string;
  /** `A`(활성) | `I`(비활성). 기본 `A`. */
  readonly version?: 'A' | 'I';
}

/** 한 통로. 상위 도구 계층은 이 표면만 본다. */
export interface RfcChannel {
  /** 이 통로가 어느 경로인지. 진단·배너에 쓴다. */
  readonly backend: RfcBackendName;
  /** `ZMCP_ADT_DISPATCH` 호출. `action`은 `CUA_FETCH`·`DYNPRO_READ` 같은 동작 이름. */
  callDispatch(action: string, params?: Readonly<Record<string, unknown>>): Promise<DispatchResult>;
  /** `ZMCP_ADT_TEXTPOOL` 호출. */
  callTextpool(action: TextpoolAction, params: TextpoolParams): Promise<TextpoolResult>;
}

/**
 * ECC DDIC 읽기 능력 — **`odata` 통로만 갖는다.**
 *
 * `RfcChannel`에 넣지 않은 것은 의도다. 이 능력은 마일스톤이 아니라 SAP 측
 * 설계로 갈린다: 브리지 함수모듈 `ZMCP_ADT_DDIC_TABL_READ`는 OData 서비스
 * `ZMCP_ADT_SRV`의 FunctionImport로만 노출돼 있어, 나머지 네 통로는 그것을
 * 부를 수단이 아예 없다(구 엔진도 `odata`가 아니면 던진다 —
 * `engine/src/lib/rfcBackend.ts:94-132`). 통로 인터페이스에 얹으면 나머지 네
 * 구현이 전부 "던지는 메서드"를 달아야 하고, 그건 표면이 거짓말을 하는 것이다.
 */
export interface DdicReadChannel {
  /**
   * `ZMCP_ADT_DDIC_TABL_READ` 호출 — 투명 테이블과 구조를 **같은 FM 하나**가
   * TABCLASS로 갈라 처리한다.
   */
  callDdicTablRead(params: DdicTablReadParams): Promise<DdicReadResult>;
}
