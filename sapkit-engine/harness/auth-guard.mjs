/**
 * 인증 실패에서 **즉시 멈추는** 전송 데코레이터.
 *
 * 왜 있는가 — 실측된 사고에서 왔다. 신 엔진이 `keychain:` 참조를 그대로
 * 비밀번호로 보내 401이 났는데, 시퀀스 러너는 "오류 응답도 계약이다"라는
 * 올바른 이유로 **다음 단계를 계속 태웠다.** 그 결과 한 번의 실행이 실패
 * 로그온을 여러 건 쌓았고, SAP의 `login/fails_to_user_lock` 문턱을 넘겨
 * **계정이 잠겼다.** 대조를 위해 오류를 계속 받는 것과, 같은 자격증명으로
 * 실패를 반복해 계정을 잠그는 것은 다른 일이다.
 *
 * 그래서 인증 실패만은 예외로 둔다: 첫 건에서 전송을 끊는다. 다른 오류
 * (404·문법 오류·게이트 거부 등)는 그대로 통과시킨다 — 그것들은 진짜로
 * 대조 대상이고 반복해도 대가가 없다.
 *
 * `RecorderTransport`와 `ReplayTarget`은 같은 모양(`open`·`callTool`·`close`)
 * 이라 이 데코레이터 하나가 녹화·재생 양쪽에 꽂힌다. **다만 두 러너의 예외
 * 처리가 다르다** — 채록기는 던진 것을 그대로 올려 보내지만, 재생 러너는
 * `harness/replay/replay.ts:121-125`가 `callTool`의 모든 throw를 잡아
 * `transportError` **문자열**로 접는다. 그래서 이 모듈은 던지는 것 말고
 * **문자열에서 자기 중단을 되알아보는 길**(`isAuthAbortMessage`)도 같이 낸다.
 * 그것이 없으면 재생 러너는 픽스처 하나에서만 멈추고 **다음 픽스처에서 새
 * 접속을 열어 같은 자격증명으로 다시 로그온한다** — 막으려던 사고가 그대로
 * 재현된다(첫 판 리뷰 지적).
 */

/**
 * 인증 거부로 읽히는 신호. 계정 잠금을 부르는 것은 이 갈래뿐이다.
 *
 * **좁게 유지한다.** 넓히면 정상 오류를 삼켜 대조 대상이 사라지고, 무엇보다
 * 원인을 오진한 안내("자격증명을 확인해라")가 나간다. 실제로 첫 판의
 * `/Unauthorized/i` 는 신 엔진이 자기서명 인증서 실패에 넣는 문구
 * (`src/adt/client.ts` — "…프로파일에 **TLS_REJECT_UNAUTHORIZED**=0을 넣어야…")
 * 안의 `UNAUTHORIZED` 를 물어 **TLS 오류를 401로 보고**했고, 느슨한 `\b401\b`
 * 는 `line 401` 같은 본문 숫자까지 물었다. `\b` 는 `_` 를 단어 문자로 보므로
 * `\bUnauthorized\b` 는 `TLS_REJECT_UNAUTHORIZED` 안에서 매치되지 않는다.
 *
 * 여기 실린 두 HTTP 모양은 실측이다 — 신 엔진 `HTTP 401 Unauthorized — (auth)`,
 * 구 번들 `AxiosError: Request failed with status code 401`.
 */
const AUTH_FAILURE =
  /HTTP 401\b|status code 401\b|\bUnauthorized\b|\(auth\)|ERR_AUTH|Logon failed|User is locked/i;

/** 중단 메시지를 문자열에서 되알아보기 위한 표지. */
const ABORT_MARK = 'AUTH_ABORT';

export class AuthFailureAbort extends Error {
  constructor(tool, excerpt) {
    super(
      `${ABORT_MARK}: 인증 실패로 중단했다 — [${tool}] 에서 401 계열 응답을 받았다.\n` +
        `   ${excerpt}\n` +
        '   같은 자격증명으로 계속 두드리면 SAP 계정이 잠긴다(login/fails_to_user_lock).\n' +
        '   프로파일의 자격증명을 먼저 확인해라. 이미 여러 번 실패했다면 계정 잠금 여부도 함께.',
    );
    this.name = 'AuthFailureAbort';
    this.tool = tool;
  }
}

/**
 * 러너가 예외를 문자열로 접어 버렸을 때 그것이 이 모듈의 중단이었는지 판정한다.
 * `null`·`undefined` 는 중단이 아니다.
 */
export function isAuthAbortMessage(text) {
  return typeof text === 'string' && text.includes(ABORT_MARK);
}

/** 어떤 응답이 인증 실패로 읽히는가 — 시험이 이 판정을 직접 겨눌 수 있게 낸다. */
export function looksLikeAuthFailure(text) {
  return AUTH_FAILURE.test(String(text ?? ''));
}

/**
 * @param inner `open`·`callTool`·`close`를 가진 전송/재생 대상
 * @returns 같은 계약의 전송. 인증 실패를 만나면 `AuthFailureAbort`를 던진다.
 */
export function abortOnAuthFailure(inner) {
  return {
    open: () => inner.open(),
    close: () => inner.close(),
    async callTool(tool, args) {
      const captured = await inner.callTool(tool, args);
      // `isError` 가 선 응답만 본다. 기동 시점의 로그온 실패와 `isError:false`
      // 로 오는 실패는 원리적으로 여기서 못 잡는다 — 설계 한계다.
      if (captured.isError && looksLikeAuthFailure(JSON.stringify(captured.payload ?? null))) {
        throw new AuthFailureAbort(tool, JSON.stringify(captured.payload ?? null).slice(0, 200));
      }
      return captured;
    },
  };
}
