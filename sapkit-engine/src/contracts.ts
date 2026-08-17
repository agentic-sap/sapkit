/**
 * 작업 경계를 가로지르는 공용 타입 계약 — **스캐폴드 소유**.
 *
 * 병렬로 짓는 작업들이 서로의 파일을 기다리지 않고도 같은 모양에 합의하기 위한
 * 최소 계약이다. 개별 작업은 이 파일을 **수정하지 않는다** — 모자라면 멈추고
 * 오케스트레이터에게 보고한다.
 *
 * 값의 출처는 구 엔진의 실측 계약이다:
 * - 노출 제어는 `--exposition` 인자 하나로 결정되고, 셰임
 *   (`interactive/server/launch.cjs`)이 `readonly` 또는 `readonly,high` 중
 *   정확히 하나를 넘긴다.
 * - 도구는 그 위에 배포 축(`SAP_SYSTEM_TYPE`, 미설정 기본 `cloud`) 필터를 한 번
 *   더 받는다 — 이것이 "연결 시에만 보이는" 도구들의 정체다.
 */

/**
 * SAP 배포 축. `SAP_SYSTEM_TYPE` 미설정 시 기본값은 `cloud`.
 *
 * `legacy`는 세 번째 실축값이다 — 구 엔진의 핸들러 332개가
 * `available_in: ['onprem','cloud','legacy']`로 선언하고, 서버가 현재 축을
 * `legacy`로 계산해 필터한다. `cloud`로 접어 넣으면 노출 이름 집합이 어긋난다.
 */
export type DeploymentType = 'onprem' | 'cloud' | 'legacy';

/** 노출 제어 핸들러 집합 — `--exposition` 값의 원소(쉼표 구분). */
export type HandlerSet = 'readonly' | 'high' | 'compact' | 'low' | 'system' | 'search';

/** SAP 시스템 등급. 해석 실패·미지정은 `UNKNOWN`이며 write에 대해 fail-closed다. */
export type SapTier = 'DEV' | 'QA' | 'PRD' | 'UNKNOWN';

/** 도구의 정책 분류 — 안전 게이트가 이 축으로 판단한다. */
export type ToolPolicyKind = 'read' | 'mutation' | 'execution' | 'server-control' | 'row-data';

/** 도구가 어느 상태에서 목록에 뜨는지에 대한 선언. */
export interface ToolExposure {
  /** 이 도구를 켜는 핸들러 집합. 하나라도 요청된 집합에 있으면 후보가 된다. */
  readonly sets: readonly HandlerSet[];
  /** 이 도구가 존재하는 배포 축. 현재 배포 축에 없으면 목록에서 빠진다. */
  readonly availableIn: readonly DeploymentType[];
}

/**
 * 인증 방식. **미지정은 `basic`이다** — 기존 프로파일과 기존 호출부가 이 키를
 * 갖지 않으므로, 없을 때의 뜻이 지금까지의 동작과 같아야 한다.
 *
 * 구 엔진의 어휘와 같은 두 값이다(`engine/src/lib/utils.ts:1946-1959` — 읽기
 * 참조). 구는 `saml`도 값으로 받지만 그 갈래를 타는 코드가 없어 싣지 않는다.
 */
export type AuthType = 'basic' | 'jwt';

/**
 * UAA(XSUAA) OAuth2 재료 — **토큰이 아니라 토큰을 받아 올 자격**이다.
 *
 * service key가 조립하고(`profile/destination.ts`) 토큰 계층이 소비한다
 * (`auth/uaa.ts`). 여기 담긴 `clientSecret`은 진단·로그 어디에도 나가지 않는다.
 */
export interface UaaCredentials {
  /** UAA 오리진(경로 없는 base). 토큰·인가 종단점은 여기서 파생한다. */
  readonly url: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * ADT 접속 계층이 소비하는 최소 접속 정보.
 *
 * **Basic이 기본이고, JWT(Bearer)가 M2에서 더해졌다.** 아래 Basic 필드들은
 * 모양이 바뀌지 않았다 — 더해진 것은 전부 선택 필드이고, 하나도 주지 않으면
 * 접속은 지금까지와 똑같이 Basic으로 선다.
 */
export interface ConnectionConfig {
  /** 예: `https://host:44300` — 경로 없는 오리진. */
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  /**
   * SAP 클라이언트 번호. **ADT에는 질의 인자가 아니라 헤더로 나간다** —
   * 구 접속 계층 실측: `X-SAP-Client` 헤더를 싣고, 그 위에 응답이 돌려준
   * `sap-usercontext` 쿠키를 `sap-client=<client>`로 **덮어쓴다**. 이 쿠키
   * 고정이 없으면 SAP이 시스템 기본 클라이언트로 라우팅해 write가 403으로
   * 막힌다(구 계층 주석에 그대로 적혀 있다). 없으면 시스템 기본 클라이언트.
   */
  readonly client?: string;
  /**
   * 로그온 언어. **ADT 요청에는 싣지 않는다** — 구 접속 계층은 `sap-language`를
   * ADT로 보내지 않고, 로그온 언어를 시스템 정보 조회로 알아내 생성 페이로드에
   * 넣는다. 여기서는 그 값을 실어 나르기만 한다.
   */
  readonly language?: string;
  /** 자기서명 인증서 허용 여부. `TLS_REJECT_UNAUTHORIZED=0`이면 false. */
  readonly rejectUnauthorized: boolean;
  readonly timeouts: {
    /** 일반 요청 (기본 45000ms) */
    readonly default: number;
    /** CSRF 토큰 취득 (기본 15000ms) */
    readonly csrf: number;
    /** SQL·테이블 조회 등 장시간 (기본 60000ms) */
    readonly long: number;
  };

  // ── M2 인증 확장 — 전부 선택. 없으면 위 Basic 경로가 그대로 선다. ──────────

  /**
   * 어느 인증을 쓰는가. **없으면 `basic`**이다.
   *
   * 접속 계층은 이 값 하나로 `Authorization` 헤더를 가른다 — Basic이면
   * 사용자·비밀번호를, `jwt`면 {@link jwtToken}을 Bearer로 싣는다.
   */
  readonly authType?: AuthType;
  /**
   * Bearer 자리에 실릴 접근 토큰. `authType === 'jwt'`일 때 **필수**다 —
   * 없이 접속을 만들면 접속 계층이 `AUTH_TOKEN_MISSING`으로 거절한다(인증
   * 헤더 없는 요청이 SAP에 나가는 갈래를 두지 않는다).
   *
   * 토큰은 **메모리에만 산다.** 이 필드가 디스크로 나가는 경로는 없다.
   */
  readonly jwtToken?: string;
  /** 갱신 토큰. 있으면 토큰 계층이 만료 전에 이것으로 갱신한다. */
  readonly refreshToken?: string;
  /**
   * UAA 재료. 있으면 토큰 계층이 스스로 취득·갱신할 수 있고, 없으면
   * {@link jwtToken}이 만료될 때 **갱신할 방법이 없다**(그 상태도 명시 진단으로
   * 끝난다 — 조용히 무인증으로 내려가지 않는다).
   */
  readonly uaa?: UaaCredentials;
}

/**
 * 프로파일 해석 결과 — 프로파일 계층이 산출하고 서버 코어가 소비한다.
 * `connection === null`이면 무프로파일 기동(= inspection-only)이다.
 */
export interface ResolvedProfile {
  readonly connection: ConnectionConfig | null;
  readonly tier: SapTier;
  readonly systemType: DeploymentType;
  /**
   * `SAP_VERSION` 원문(대문자 정규화 없이 읽은 그대로, 없으면 null).
   *
   * **배포 축(`systemType`)과는 다른 세 번째 축**이다. 구 엔진의 핸들러 16곳이
   * `process.env.SAP_VERSION?.toUpperCase() === 'ECC'`로 갈라져 ECC 전용
   * 우회 경로를 탄다(예: `engine/src/handlers/table/high/handleGetTable.ts:69` —
   * ECC 커널에는 `/sap/bc/adt/ddic/tables` 엔드포인트가 없어 OData 브리지로
   * 돌아간다). 값의 어휘는 제품 지식 문서가 정본이며(`ECC`·`S4`·
   * `S4_CLOUD_PUBLIC` 등), 엔진이 실제로 보는 것은 **`ECC`인가 아닌가**뿐이라
   * 열거형으로 좁히지 않고 원문을 실어 나른다.
   *
   * `SAP_SYSTEM_TYPE`과 마찬가지로 **프로파일의 `sap.env`에서만** 읽는다 —
   * 구 엔진이 기동 시 이 키를 `process.env`에서 지우기 때문이다
   * (`engine/src/lib/profile.ts:109`).
   */
  readonly sapVersion: string | null;
  /** 실제로 읽은 env 파일 경로. 해석 실패 시 null. */
  readonly envPath: string | null;
  /** active-profile.txt가 가리킨 별칭. 없으면 null. */
  readonly alias: string | null;
  /** 사람에게 보일 진단 문구(왜 이 상태인지). 비어 있을 수 있다. */
  readonly diagnostics: readonly string[];
}
