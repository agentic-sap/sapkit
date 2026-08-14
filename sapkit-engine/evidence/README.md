# evidence/ — 커밋되는 증거 파일

진척 대장(`TOOL-LEDGER.md`)의 증거 열은 **레포 안의 파일에서만** 나온다. 문서
서술도, 과거 실행의 콘솔 출력도 입력이 아니다. 여기 있는 파일이 곧 증거다.

왜 이렇게 좁히는가: 재생 러너는 오랫동안 판정을 표준출력과 호출자가 지정한
`--out`으로만 내보냈다. 그래서 "재생 증거 7종"이라는 말은 남았는데 **기계가
읽을 수 있는 판정은 레포에 하나도 없었다**. 대장은 그런 것을 통과로 세지
않는다 — 없는 것은 없는 것이다.

## `replay/` — 재생 판정

시퀀스 하나에 파일 하나. 이름은 `<시퀀스 id>.json`.

**누가 쓰는가**: `harness/replay-attended.mjs`가 재생을 마친 뒤 자동으로 쓴다.
그 러너는 SAP에 붙으므로 attended 세션에서만 돈다.

```
node harness/replay-attended.mjs --env-path=<sap.env>
```

`--verdict-dir=<경로>`로 자리를 옮길 수 있고 `--no-verdict`로 끌 수 있다.

**형식** (정본 = `harness/ledger/evidence.ts`, `formatVersion` 1):

```json
{
  "formatVersion": 1,
  "sequenceId": "zsapkit-m1-program-update-activate",
  "description": "…",
  "recordedAt": "2026-08-14T09:00:00.000Z",
  "verdict": "pass",
  "recordedEngine": { "name": "mcp-abap-adt", "version": "1.0.0" },
  "actualEngine": { "name": "sapkit-engine", "version": "0.1.0" },
  "transportError": null,
  "steps": [
    { "index": 0, "tool": "UpdateProgram", "verdict": "match", "divergenceId": null, "detail": null }
  ],
  "proseNormalized": [
    { "stepIndex": 1, "tool": "CheckSyntax", "divergenceId": "D13", "strictSignal": true }
  ]
}
```

- `steps[].verdict`는 재생 판정 어휘 그대로다: `match` · `mismatch` ·
  `allowlisted-pass` · `allowlisted-fail` · `allowlisted-deferred` · `not-run`.
  대장은 이 어휘를 커버리지 계산기에 그대로 넘긴다 — 등재 판정이 재생 급이
  아니라 대체 기대 시험 급으로 가고, 이연이 무증거로 남는 규칙이 거기 있다.
- **응답 본문과 차이 값은 담지 않는다.** 이 파일이 답할 질문은 "무엇이 어떤
  판정을 받았는가"뿐이다. 응답을 실으면 마스킹 검사를 다시 통과해야 하는 두
  번째 증거 파일이 생긴다.
- `recordedAt`은 **판정을 낸 시각**이다. 픽스처의 채록 시각과 다르다.

**손으로 쓰지 마라.** 대장이 이 파일을 통과 증거로 세므로, 손으로 채우는 것은
곧 없는 증거를 있다고 적는 일이다.

## `contract/results.json` — 계약 시험 결과

도구별 계약 시험이 **최근에 실제로 돌았는지**의 기록. 시험 파일이 있다는
사실만으로는 통과가 아니다.

```
npm run test:report        # jest --json --outputFile=.jest-report.json
npm run evidence:contract  # 도구별 통과로 접어 이 파일에 쓴다
```

`.jest-report.json`은 절대 경로와 머신 사정이 섞여 있어 커밋하지 않는다
(`.gitignore`). 접힌 결과만 커밋한다.

**형식** (정본 = `harness/replay/evidenceInputs.ts`의 `parseContractEvidence`):

```json
[
  { "tool": "GetClass", "passed": true, "detail": "src/tools/read/__tests__/getClass.test.ts" }
]
```

시험 파일과 도구를 잇는 규약은 `<모듈 디렉터리>/__tests__/<도구 이름 소문자
시작>.test.ts`다 — 예: `GetClass` → `src/tools/read/__tests__/getClass.test.ts`.

## 여기 없는 증거

- **attended 실기** — `fixtures/attended-only/*.json`. 재생할 수 없는 시퀀스의
  기록이라 픽스처 자체가 증거다(`fixtures/README.md`).
- **대체 기대 시험** — 차이 장부(`harness/replay/divergences.ts`)의
  `substituteTest`가 지목하는 시험 파일. 그 파일이 실재할 때만 증거로 센다.
