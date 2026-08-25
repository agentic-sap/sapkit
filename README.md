# SAPKIT

SAP ABAP 개발과 컨설팅을 돕는 AI 플러그인입니다. 설치하면 AI가 여러분의 SAP 시스템에
직접 붙어서 소스를 읽고, 코드를 만들고, 덤프를 파고, 명세서를 뽑습니다.

Claude Code · Codex CLI · Antigravity 세 곳에서 같은 방식으로 씁니다.

## 뭘 할 수 있나

**만들기**

- `/sapkit:create-program` — 리포트든 ALV든 배치 프로그램이든, 요구사항 인터뷰부터
  시작해 명세서를 쓰고 **사람 승인을 받은 뒤에** 코드를 올립니다. Main+Include 구조로
  짓고, 다 만든 뒤엔 별도 세션이 리뷰합니다.
- `/sapkit:create-object` · `/sapkit:modify-object` — 클래스·테이블·CDS 같은 개별
  오브젝트 하나를 만들거나 고칩니다. 작은 수정은 후자가 가볍습니다.

**읽기와 파악하기**

- `/sapkit:program-to-spec` — 남이 짜 놓은 ABAP 프로그램을 거꾸로 읽어 기능/기술
  명세서로 만듭니다. Markdown이나 Excel로 나옵니다.
- `/sapkit:package-to-process` — CBO 패키지 하나를 통째로 훑어 업무 흐름
  (구매요청 → 발주 → 입고 → 송장 같은)을 복원하고, 프로세스 맵 그림까지 그려 줍니다.
- `/sapkit:compare-programs` — 비슷한 일을 하는 프로그램 두세 개가 업무적으로 뭐가
  다른지 비교합니다. MM 버전과 CO 버전, 한국 버전과 유럽 버전 같은 것들이요.
- `/sapkit:analyze-code` — 코드 리뷰. 14가지 관점으로 보고 심각도를 매겨 알려 줍니다.

**문제 생겼을 때**

- `/sapkit:analyze-symptom` — 덤프, 로그, 이송 이력, where-used를 직접 뒤져 원인을
  좁힙니다. 필요한 것만 물어보고 SAP Note 검색 키워드까지 뽑아 줍니다.
- `/sapkit:ask-consultant` — 모듈 컨설턴트에게 묻듯 물어보면 됩니다. 여러분 시스템의
  버전·업종·국가 설정을 보고 답합니다.

**마무리**

- `/sapkit:release` — 이송 요청 릴리스. 릴리스 전 조건을 확인하고 넘깁니다.
- `/sapkit:handoff` — 오늘 어디까지 했는지를 프로젝트 폴더에 적어 둡니다. 다음 세션이
  그걸 읽고 이어서 합니다.

전체 목록은 `/sapkit:` 을 치면 나옵니다.

## 설치

**Claude Code**

```text
claude plugin marketplace add agentic-sap/sapkit
claude plugin install sapkit@agentic-sap --scope user
```

새 세션을 열거나 `/reload-plugins` 한 뒤 `/sapkit:setup` 을 실행하세요.

**Codex CLI**

```text
codex plugin marketplace add agentic-sap/sapkit
codex plugin add sapkit@agentic-sap
```

새 세션에서 `$sapkit:setup`.

`setup`이 SAP 접속 설정을 대화로 안내합니다. 비밀번호는 여러분이 직접 파일에 넣고,
플러그인은 그 값을 어디에도 기록하지 않습니다. **접속 설정 없이도** 지식·상담 기능은
바로 씁니다.

SAP에 붙는 MCP 서버는 플러그인에 들어 있습니다. 따로 받거나 등록할 것이 없습니다.

## 안전장치

SAP은 잘못 건드리면 되돌리기 어렵습니다. 그래서 다음은 설정이 아니라 **기본 동작**입니다.

- **쓰기는 DEV 시스템에만** 갑니다. 접속 설정에 QA나 운영으로 잡혀 있으면 생성·수정·
  활성화 요청이 서버 단에서 거부됩니다. 티어를 판별하지 못해도 막습니다.
- **테이블 데이터 조회는 건별 승인**입니다. 보호 대상 테이블은 서버가 먼저 거부하고,
  그 바닥선을 푸는 것은 여러분이 접속 설정 파일에 직접 적을 때뿐입니다. 배치로 돌리거나
  하위 에이전트에게 대신 시키는 길은 열려 있지 않습니다.
- **"저장됐습니다"를 그대로 믿지 않습니다.** SAP에 뭔가 쓴 뒤에는 소스를 다시 읽어
  보낸 것과 대조합니다. 그 대조와 별도 세션의 리뷰가 **둘 다** 끝나야 완료로 칩니다.
- 이송 요청이 필요한 자리에서 빠져 있으면 알려 줍니다.

ABAP 오프라인 검사기도 같이 들어 있어서, SAP에 붙지 않고도 로컬에서 코드를 검사할 수
있습니다.

## 세션이 끊겨도 이어서 하기

SAP 작업은 하루에 안 끝납니다. `/sapkit:handoff` 를 실행하면 프로젝트 폴더에
`HANDOFF.md`(지금 상태)와 `RUN-PLAN.md`(할 일 순서)를 만들어 둡니다. 오브젝트마다
**SAP에 보내기만 한 것**과 **되읽어 확인까지 끝난 것**을 구분해 적기 때문에, 다음 세션이
어디까지 믿어도 되는지 알 수 있습니다.

이미 같은 이름의 파일을 쓰고 계신다면 걱정 안 하셔도 됩니다. sapkit은 자기가 만든
파일에만 손을 대고, 그 표시가 없는 파일은 읽지도 고치지도 않습니다. 반대로 그 표시를
지우면 그때부터 손을 뗍니다.

## 업데이트

```text
claude plugin marketplace update agentic-sap
claude plugin update sapkit@agentic-sap
```

Codex는 `codex plugin marketplace upgrade agentic-sap` 뒤에 `codex plugin add`를 다시
실행합니다. 어느 쪽이든 적용하려면 재시작이 필요합니다.

## 잘 안 될 때

`/sapkit:troubleshooting` 이 접속 문제를 단계별로 짚어 줍니다. 그래도 안 되면
`node "<플러그인 경로>/scripts/doctor.mjs"` 를 실행해 나온 내용을 이슈로 남겨 주세요.

## 더 보기

- [플러그인 안내](interactive/README.md) — 구조와 설계
- 하네스별 안내:
  [Claude Code](interactive/adapters/claude/README.md) ·
  [Codex](interactive/adapters/codex/README.md) ·
  [Antigravity](interactive/adapters/antigravity/README.md)

## 라이선스

[MIT](LICENSE) © 2026 Hong Jaewon
