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

/** ADT 접속 계층이 소비하는 최소 접속 정보. M1 인증은 Basic만 다룬다. */
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
}

/**
 * 프로파일 해석 결과 — 프로파일 계층이 산출하고 서버 코어가 소비한다.
 * `connection === null`이면 무프로파일 기동(= inspection-only)이다.
 */
export interface ResolvedProfile {
  readonly connection: ConnectionConfig | null;
  readonly tier: SapTier;
  readonly systemType: DeploymentType;
  /** 실제로 읽은 env 파일 경로. 해석 실패 시 null. */
  readonly envPath: string | null;
  /** active-profile.txt가 가리킨 별칭. 없으면 null. */
  readonly alias: string | null;
  /** 사람에게 보일 진단 문구(왜 이 상태인지). 비어 있을 수 있다. */
  readonly diagnostics: readonly string[];
}
