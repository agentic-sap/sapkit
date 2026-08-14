/**
 * CDS 단위시험 되읽기 세 종이 함께 쓰는 조각.
 *
 * ## 왜 CDS 쪽에만 따로 문구가 있는가
 *
 * 세 도구(`GetCdsUnitTest` · `GetCdsUnitTestStatus` · `GetCdsUnitTestResult`)는
 * **비CDS 형제와 같은 캐시**를 읽는다 — `RunUnitTest`가 고전 엔드포인트로 받아
 * 담아 둔 `<aunit:runResult>` XML이고, 저장소의 정본은 옆의 `unitTestRuns.ts`다.
 * CDS 시험 클래스를 돌리는 전용 도구는 없고, `CreateCdsUnitTest`가 만든 클래스를
 * `RunUnitTest`의 컨테이너 클래스로 넘겨 돌리는 것이 구가 설계한 다리다
 * (`engine/src/handlers/unit_test/high/handleGetCdsUnitTest.ts:1-13`).
 *
 * 그런데 **모르는 `run_id`의 문구는 두 계열이 다르다.** 구 세 CDS 핸들러는
 * 셋 다 아래 문장을 쓰고(`handleGetCdsUnitTest.ts:66-72` ·
 * `handleGetCdsUnitTestStatus.ts:65-71` · `handleGetCdsUnitTestResult.ts:79-85`),
 * 비CDS 세 종은 `unitTestRuns.ts`의 `unknownRunMessage`가 쓰는 다른 문장을 쓴다.
 * 한 문장으로 접으면 두 계열 중 한쪽의 계약이 조용히 바뀐다.
 */

/** 구 세 CDS 핸들러가 **글자 그대로 공유**하는 문장. */
export function unknownCdsRunMessage(runId: string): string {
  return (
    `Unknown run_id "${runId}" — no cached CDS unit test result ` +
    '(invalid run_id, or the server process restarted since the run was started via RunUnitTest).'
  );
}
