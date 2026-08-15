# sapkit-cli — 오프라인 ABAP 검사기 (자체 저작)

구 `vsp/`(Go 포크)가 담당하던 **로컬 ABAP 구문·정합 검사**를 대체하는 자체 저작
TypeScript CLI다. **SAP에 접속하지 않는다** — 입력은 파일·디렉터리·표준입력뿐이고,
MCP 서버 모드도 없다.

## 명령

| 명령 | 하는 일 | exit |
|---|---|---|
| `sapkit lint <file>` | 규칙 7종 검사 | Error 있으면 비-0 |
| `sapkit parse <file>` | 어휘 분석 → 문장 분할·유형 분류 | 읽히면 0 |
| `sapkit analyze <file>` | 규칙 13종, JSON 보고 | 수행되면 0 |
| `sapkit check <dir>` | 프로젝트 INCLUDE 정합 | 미해결 Z*/Y*/$* 있으면 비-0 |

## 개발

```bash
npm ci
npm run verify   # build + typecheck + jest
npm run gates    # 자체 게이트 (코퍼스 판정 대조 등)
```

## 구조

- `src/core/` — 어휘 분석기 · 문장 분할·분류기
- `src/rules/` — 규칙 구현
- `src/cli/` — 명령 표면 · 출력 형식 · exit 계약
- `fixtures/corpus/` — 판정 대조용 코퍼스(합성 픽스처 + 동결 템플릿 사본)
- `fixtures/baseline/` — 구 vsp 판정 채록본(기준). 은퇴 뒤 구 판정의 유일한 잔존 형태다.
- `harness/` — 채록기 · 판정 비교 도구
- `gates/` — 자체 게이트 (`npm run gates`가 전부 돈다)
- `DIVERGENCES.md` — 구 vsp와의 의도적 차이 장부(append-only). **등재 없는 차이는 결함.**

## 저작 규율

`vsp/` 소스는 **읽기 전용 참고서**다 — 읽기는 허용, **복사·붙여넣기 금지**. 계약 표면
(명령 이름·규칙 키·심각도·플래그·JSON 형태)은 기능 계약이므로 그대로 승계하고,
메시지·설명 **문구는 새로 쓴다**.
