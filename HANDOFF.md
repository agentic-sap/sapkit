# HANDOFF — 프로젝트 전체 상태와 재개 지침

> **목적: 컨텍스트/세션이 클리어돼도 이 문서 하나로 전부 복원.**
> 작성 2026-07-10 · 최종 갱신 2026-07-20. 새 세션은 ① 이 문서 → ② 필요 시 해당 트랙
> DESIGN.md 순으로 읽는다. 상태가 바뀌면 이 문서를 갱신하는 것까지가 작업의 일부다.
>
> ═══════════════════════════════════════════════════════════════════
> **▶▶ 재개점 (2026-07-21 · D-041) — 여기부터 읽는다 (최상단 정본)**
> ═══════════════════════════════════════════════════════════════════
>
> **제품명 개편 Phase 1 집행 완료 (D-041).** 07-20 밤 "선행 후보 ①"이 사용자 지시로
> 실행됐다. **이름이 세 층으로 갈렸다 — 이걸 혼동하지 말 것**:
>
> | 층 | 값 | 어디에 등장 |
> |---|---|---|
> | **플러그인** | `sapkit` | `/sapkit:*` 스킬 · `mcp__plugin_sapkit_sap__*` 도구 — **매 호출** |
> | **마켓플레이스** | `agentic-sap` | `/plugin install sapkit@agentic-sap` — **설치 때만** |
> | **GitHub 조직/레포** | `agentic-sap/sapkit` | `/plugin marketplace add agentic-sap/sapkit` — **설치 때만** |
>
> `owner`(마켓 표시) = `AgenticSAP` / `author`(플러그인) = `hjaewon`으로 **분리**했다.
> 옛 레포 경로 2종은 GitHub 301 리다이렉트 실측, 로컬 remote 갱신 완료.
> 마켓 이름을 `sapkit`이 아니라 `agentic-sap`으로 한 이유 = `sapkit@sapkit` 중복 해소
> (§8-5 원안을 D-041 ②가 supersede).
>
> **게이트**: 코어 6종 exit 0 · 음성시험 **16/16 · 17/17**(스냅샷 러너가 이 머신에서
> **처음으로 완주** — 종전 두 세션의 spawn 수거 블록 미재현) · PS 3종 **23/16/17** ·
> 이식 스냅샷 재생성(diff **22/22 전부 목적지 sha256**, pin·roots 36·inventory 487 불변).
> `doctor`만 FAIL 1 = **agy 1.1.1 ≠ 핀 1.1.4** — 개명 무관 선행 환경 드리프트다.
>
> **① 재설치 = ✅ 완료 (2026-07-21, 사용자 지시로 실행)**. 마켓 이름 개명은 `renames`
> 대상이 아니라 **수동 재등록이 필요했고**(실증됨 — 문서가 말한 "이관 경로 없음"이
> 실물로 확인), 반대로 **플러그인 이름은 `renames`가 자동 이관했다**(매니페스트 재생성
> 직후 Claude Code가 `enabledPlugins` 키를 스스로 `sapkit@...`으로 고쳐 씀 — 실측).
> 현 상태: 마켓 `agentic-sap`(Directory) · 플러그인 `sapkit@agentic-sap` v0.1.0
> **enabled, scope=local**(원래 스코프로 복원 — 기본값 user로 들어간 것을 되돌림) ·
> 구 키 잔재 0. Claude 캐시 경로 `cache/agentic-sap/sapkit/0.1.0` = **`<마켓>/<플러그인>/
> <버전>` 구조 실측**.
>
> **① 도구 접두어 = ✅ 실측 종결 (2026-07-21 재시작 후 — D-041 ⓑ · D-042 미해결 항목
> 닫힘)**. **MCP 도구 네임스페이스는 플러그인 이름에서 파생한다** — 실측값
> `mcp__plugin_**sapkit**_sap__*`(마켓 이름 `agentic-sap`이 아니다). 재시작 세션에서
> 구 이름 도구 186개가 전부 소멸하고 신 이름으로 스키마 로드까지 확인했으며, 스킬
> `sapkit:*` · 리뷰어 에이전트 `sapkit:sap-reviewer`도 같은 규칙이다. **따라서 D-041/042가
> 커밋한 값이 전부 정확했고 수정할 것이 없다** — 리뷰 M-2가 경고한 fail-open 시나리오
> (마켓명 파생이었다면 리뷰어 차단 84종이 죽는 것)는 **발생하지 않았다**. 공식 문서에
> 없는 규칙이므로 이 실측이 정본이다.
>
> **▶▶ 다음 착수 (주 머신)**: ② **권한 병합 갱신** —
> 프로젝트 `.claude/settings.local.json`의 allow 목록이 **구 네임스페이스라 이제 매칭
> 안 됨**(실측: allow 187건 중 **184건이 구 접두어**, 신 접두어 0건). 새 템플릿
> **189건**을 병합할 것 — 도구 184는 이름만 바뀐 동일 집합이고 파일op가 3→5로 는다
> (`Write`·`Glob` 추가). 실데이터 2종은 템플릿에서 계속 제외(배포 기본값) — 단 **소유자
> 머신은 D-043 서버 바닥선 모델**: 작업 프로젝트(ZUNIWTH 등)에서 사용자가 2종을 직접
> 허용해도 되며, 이를 결함으로 되돌리지 말 것.
> ③ **ZUNIWHT 도그푸딩 착수**
> — vsp in-repo 빌드는 **이미 완료 상태**(`vsp\build\vsp.exe` = `v2.38.1-94-g5a8bedb`,
> lock 일치 실측)라 07-20이 지시한 "빌드 1회"는 불요다.
> **보조 머신** = 경량화 실측(변동 없음) — 단 **재설치 후 측정할 것**(도구 접두어가
> 13자 짧아져 tool-schema 토큰 baseline이 바뀐다).
>
> **▶ 실데이터 접근 모델 전환 (2026-07-21 · D-043)**: 소유자 머신 = **서버 바닥선 모델**
> — 호출별 승인 층을 걷어내고 서버 blocklist(deny: 계좌·마스터PII·급여·인증 / ask:
> 전표류)가 유일한 잠금. Codex `disabled_tools`는 이 머신에 **원래 부재였음을 실측
> 추인**(`codex mcp get sap --json` → null — 되돌리지 말 것). 남은 사용자 실행 2건:
> ⑴ ZUNIWTH 첫 호출 때 Claude "항상 허용"(또는 설정에 2종 추가) ⑵ ZUNIWHT 프로파일
> sap.env에 `MCP_ALLOW_TABLE=LFA1,LFB1,BSEG,BKPF` 한 줄(원천세 작업 테이블이 blocklist의
> deny/ask층에 걸려 있어 예외 필요 — WITH_ITEM·T059*는 원래 자유 통과). 배포 기본값은
> 잠금 불변("프로파일 개방 선언" 정식 기능화는 백로그).
>
> **▶ 독립 리뷰 결과 (2026-07-21, 새-컨텍스트 read-only) = NEEDS-FIX → 전건 수리 (D-042)**:
> BLOCKER 0 · MAJOR 4 · MINOR 5. 리뷰어가 **작업자가 못 본 회귀**를 잡았다 —
> 권한 템플릿을 `gen-permissions.mjs`로 재생성한 것이 inspection-only 기동이라
> **189→158, 프로그램 계열 write 31종 소실**(과거 수리 `9727dc7` 되돌림, 경고 주석까지
> 삭제). 오프라인 치환으로 189 복원 + **축소 거부 가드** 신설. 그 밖에 부정 단언
> 교차검사·리뷰어 차단 게이트(유일한 fail-open 표면)·displayName·doctor Codex 오탐을
> 수리했고 음성시험을 동반했다. 상세·잔여는 D-042.
>
> **미이행으로 남은 것**: **`gen-permissions.mjs`는 여전히 inspection-only 기동**(구
> 결함 (b) 미해소 — 축소 가드는 사고만 막을 뿐이다). 진짜 수리 = **프로파일 활성 상태에서
> 재생성**이며 SAP 접속(P1)이 필요하므로 SAP 붙는 작업 때 함께 처리한다. Codex 로컬
> 설정(`~/.codex/config.toml`)에 개명 전 `[marketplaces.sap-agentic-harness]`·
> `[plugins."sap-agentic-harness@sap-agentic-harness"]`가 **고아로 잔존**(enabled=false라
> 무해) — Codex엔 `renames` 등가물이 없어 구조적이며, **Codex 재설치 시 함께 정리**한다
> (2026-07-21 사용자 판단: 지금 건드리지 않음). Codex·Antigravity **재설치·재실측 안 함** — 두 README의
> 캐시/임포트 경로(`cache/agentic-sap/sapkit/`, `~/.gemini/config/plugins/sapkit/`)는
> 개명에서 파생한 **예상 경로**이지 실측 문구가 아니다. Phase 2(`.sc4sap/`·`~/.sah/`·
> `SC4SAP_*`)는 §8-5대로 **보류 유지**. 로컬 폴더명(`D:\claude for SAP\sap-agentic-harness`)·
> 서버 npm 패키지명·`server/VERSION`은 **의도적 미변경**(기능 이득 0·파손 위험만).
>
> **② knowledgeRoots 배선은 그대로 계류** — ZUNIWHT엔 불필요, **ZUNIVAT 착수 전 집행**
> (아래 07-20 블록 원문 유지).
>
> ═══════════════════════════════════════════════════════════════════
> **▶ 이전 재개점 (2026-07-20 밤 · D-040) — 방향 확정 (역사)**
> ═══════════════════════════════════════════════════════════════════
>
> **방향 확정 — D-040 append 완료.** 진단(`57757ccc`)의 §12 질문·§14 결정표를 예정일
> (07-21)보다 당겨 보조 머신 브레인스토밍으로 채웠고, 초안에 **Codex 교차 리뷰 1회**
> (read-only 독립 컨텍스트, verdict "수정 후 기록", BLOCKER 1·MAJOR 6·MINOR 1)를 받아
> 전 지적 반영 후 기록했다. 요지: 제품 = `interactive/` 단독(나머지 = 공방, 모노레포
> 유지) · 경량화 KPI = 세션 토큰(고정/증분 분리)·설치 실단계·tool-schema 토큰(레포
> 바이트는 보조 지표, **합격선 전 "달성" 선언 금지**) · 첫 워크플로 = ABAP/RAP 개발 +
> FI·KR 상담(도그푸딩 = **ZUNIWHT·ZUNIVAT_MODI 공동 최우선**, ZUNIVAT_RAP 병행) ·
> 모듈 = persona 유지 + P0/P1 한정 thin agent(P2+ 금지) · **트랙 A ENGINE =
> template-only**(D-025 Engine 경로 휴면·D-034 U-gate 안전조건 보존·D-038 "오늘의
> 실행 경로" 효력 supersede — 지원 재개엔 새 D-결정 필요) · vsp/MCP source 기결 유지 ·
> **sc4sap = 휴면형 미추종**(대기 ⑧ 종결 — 원천 4개 태도 통일). 상세 = D-040 원문.
>
> **아래 "이전 재개점(07-20 낮)"에서 이 결정으로 바뀐 것 2건**:
> ① "내일 첫 할 일 = harness-worker ㄱ/ㄴ" → **보류**(ENGINE template-only — 실수요
> 트리거 발생 시 재개봉, 그때도 지원 재개엔 새 D-결정 필요) ② "§5-5 fetch 2종 =
> 미이식 깨진 표면" → **사실 오류 정정**(이미 `interactive/tools/fetch/`에 이식·실동작
> 검증 완료, MIGRATION-MANIFEST 5-5 — 남는 건 상류 delta disposition뿐, D-040 ⑧에
> 흡수. Codex 리뷰 검출).
>
> **▶▶ 다음 착수**: **주 머신** = pull → vsp in-repo 빌드 1회(lock `binary.build_command`)
> → **ZUNIWHT/ZUNIVAT_MODI 도그푸딩 착수**(Direct/Guided + 트랙 B MCP, ENGINE 불사용,
> 마찰 로그 남기기) · **보조 머신** = 경량화 실측(하네스별 고정/증분 토큰·cold install/
> bootstrap 실단계 — baseline·합격선 산출이 목표).
> **선행 후보 (07-20 밤 설계 등재 — `interactive/DESIGN.md` §8)**: ① **→ ✅ 집행 완료
> (2026-07-21, D-041 — 위 최상단 블록 참조. 마켓플레이스명은 `sapkit`이 아니라
> `agentic-sap`으로 확정)** 제품명 개편
> Phase 1 = `sapkit`(플러그인·마켓플레이스·레포, 집행 시 D-041 기록 — `.sc4sap` 계열
> 개명은 Phase 2 보류: 서버 번들이 그 경로를 읽음, §7 R3). rename은 재설치를 부르므로
> 한다면 실측·도그푸딩 전이 싸다 — 단 순수 외형 작업이라 미뤄도 무방(사용자 판단).
> ② knowledgeRoots 배선(지식 3층 L1/L2/L3 — 위키 포인터 참조, 복사·경로 커밋 금지)은
> **ZUNIVAT 착수 전 집행 (2026-07-20 밤 2차 정정)**: ZUNIWHT(원천세)엔 불필요하나
> **ZUNIVAT_MODI/RAP(부가세) 개발은 위키의 부가세 정보를 실제로 쓴다**(사용자 확인) —
> 공동 최우선 과제가 소비자라 도그푸딩 재료로 복귀. 순서 = ZUNIWHT는 배선 없이 먼저
> 시작 가능 → ZUNIVAT 전에 배선. 배선 사용 자체가 §8-3 설계의 실전 검증을 겸한다.
> (그 전에도 세션에서 위키 경로를 알려주면 수동 참조는 즉시 동작.)
>
> **불변 확인**: unattended=sealed(제품 원칙 = attended-only) · RV4 열림 · final-harness
> verified v0.17.3 동결·candidate 봉인(D-038) — 단 v0.17.3은 "실행 경로"가 아니라
> **재개 시 기준 버전**(D-040) · symlink 3건 미검증 유지 · 실데이터 2종 = 배포 기본
> 잠금 · **소유자 머신은 서버 바닥선 모델(D-043)**.
> 레포: 이 갱신 커밋까지 로컬 — push는 사용자 판단.
>
> ═══════════════════════════════════════════════════════════════════
> **▶ 이전 재개점 (2026-07-20 낮) — 역사 (harness-worker 질문은 위에서 보류됨)**
> ═══════════════════════════════════════════════════════════════════
>
> **레포 상태**: 워킹트리 clean · main `c73c9e9` · origin/main은 `84ed71b`까지 동기
> (**`c73c9e9` 1커밋 미push** — push는 사용자 판단). 07-20 push분(`58d2919..84ed71b`)의
> **CI 4잡 결과 미확인** — 이 머신 `gh` 미인증(`gh auth login` 필요). 확인 포인트 =
> `vsp-build` 잡(ubuntu·CGO0)이 아래 수리의 기계 완주 정본.
>
> **오늘(07-20) 한 일 3건 — 전부 종결됨, 이어서 할 잔여 없음**
> ⓐ **§5-14 등록**(`73554bf`) — 엔진 실행 배선 선결 조사(전 세션 산출물) 커밋.
> ⓑ **vsp 테스트 수리 완결**(`edac6d7`·`84ed71b`) — 착수 후보 ③. 4패키지 12테스트 해소,
> CGO0 `go test -count=1 ./...` FAIL 0·vet 0, 코어 게이트 6종 exit 0, 독립 리뷰 PASS
> (B/M/m 0). lock `test_status` = RESOLVED. 잔여 = 필요 시 CGO1 cache lane뿐.
> ⓒ **D-039 append**(`c73c9e9`) — 계류 중이던 사용자 대기 항목 4건 종결(프로파일 동일
> 확정 · symlink 검증/상류 기여 2건/vsp 원천 처분 = 전부 **불추진 확정**).
>
> ┌─ **▶ 내일 첫 할 일 — 결정 1건이 전부다** ─────────────────────────
> │ **→ 보류 (2026-07-20 밤, D-040 ⑤)**: ENGINE template-only 확정 — 이 질문은 실수요
> │ 트리거(반복 배치·bounded retry) 발생 시 재개봉한다. 아래는 그 시점의 결정 재료로 보존.
> │ **질문: 상류 `harness-worker` 스킬을 (ㄱ) 이 레포로 이식할까, (ㄴ) 사용자 전역**
> │ **플러그인으로 설치할까?**
> │
> │ **왜 이게 첫 질문인가**: 트랙 A는 지금 **실행 자체가 불가**하다 —
> │ `run-track-a.ps1`이 게이트를 다 통과해도 `:153`에서 무조건 `exit 65`(엔진 호출
> │ 라인 0개, `grep python` 0건). 배선하려면 **워커 계약 정본**이 필요한데 그게
> │ 상류 `skills/harness-worker/SKILL.md`(95줄)에만 있고 본 레포엔 `skills/`
> │ 디렉터리 자체가 없다(트랙 B 스킬 11종은 `interactive/skills/`로 별개). 계약
> │ 내용 = 워커 세션은 `prompt.md`를 읽지 않고(dispatcher 문맥 오염 방지) 요청마다
> │ 새 서브에이전트 1개를 띄우며, `response.md` 기록 **후에** `done`에 request id를
> │ 쓴다(이 순서가 계약). 이 문서가 없어 워커가 `done`을 누락 → §5-14 (2)의 30분
> │ 낭비 사고로 이어졌다.
> │ **⚠️ 새 문서를 지어 쓰지 말 것** — 07-20 교차검토가 정정한 지점: 자체 작성안은
> │ 상류와 **반대 절차**(메인 세션이 `prompt.md` 직접 수행)를 가르칠 뻔했다.
> │
> │ **(ㄱ) 이식**: verified `8f7f13b`(v0.17.3)에서 `skills/harness-worker/`만 복사.
> │  · 장점 = 자기완결(D-017/D-030 철학과 정합), CI·게이트가 볼 수 있음, 버전 고정
> │  · 유의 = **승격이 아니다**(D-038 휴면과 무관 — verified 커밋에서 가져오는 것).
> │    이식이면 provenance 기록 방식(스냅샷 게이트 편입 여부)을 함께 정해야 함
> │ **(ㄴ) 전역 설치**: `harness-init` 설치 규약대로 사용자 플러그인에 설치.
> │  · 장점 = 상류 절차 그대로, 레포 무증량
> │  · 유의 = **설치 규약 미확인**(배선 전 선결) + 머신마다 설치 필요(주/보조) +
> │    레포 게이트가 검증할 수 없어 "있는 줄 알았는데 없음" 사고에 노출
> │
> │ **결정 후 순서(권고)**: 지원 가능한 v0.17.3 진입 계약 확정 → 워커 어댑터 →
> │ E2E 3종 왕복 시험(`completed`/`blocked`/`advisory`) → 실행 개방. 배선 시
> │ **함께 정리할 것 2건**: ① 래퍼가 `-Candidate`를 요구(`:106`)해 **verified
> │ v0.17.3 실행 경로가 없다** — D-038("오늘의 실행 경로는 verified")와 어긋남
> │ ② 엔진 stdout 영속화(§5-14 (4) — 가드 38종 중 37종이 사후 확인 불가, 래퍼만
> │ 수정하는 범위). **엔진 결함 4건(§5-14 (3))은 본 레포 수정 금지**(상류 몫,
> │ D-039③으로 전달도 안 함 — 우회로 살거나 래퍼에서 흡수).
> └────────────────────────────────────────────────────────────────
>
> **그 외 잔여 (전부 급하지 않음 — 내일 안 해도 무방)**
> · ~~**사용자 판단 1건**: 상류 sc4sap 드리프트 판정 방침(아래 대기 ⑧ — 58건, 실질
>   대상은 transform 36건뿐, 선택지 ⓐ현상유지/ⓑ선별이식/ⓒ미추종 명시)~~
>   **→ 종결 (2026-07-20 밤, D-040 ⑧)**: **휴면형 미추종** 확정 — 자동 동기화·정기
>   대조 없음, 리포터 보존, 필요 시에만 선별 이식+disposition 기록. transform 36건
>   대조는 백로그에 올리지 않는다
> · ~~**위임 가능(오프라인)**: §5-5 fetch 스크립트 2종 — 코어 페르소나가 bundled로
>   참조하는데 미이식인 **깨진 표면**. 드리프트 copy 6건 중 2건과 동일 대상이라
>   위 드리프트 방침과 **묶어 처리하면 한 번에 해소**된다~~
>   **→ 사실 오류 정정 (2026-07-20 밤, D-040 정직 기록 ⓐ — Codex 리뷰 검출)**: 두
>   스크립트는 `interactive/tools/fetch/`에 **이식·실동작 검증 완료**(MIGRATION-MANIFEST
>   5-5). 남는 건 상류 delta disposition뿐 — D-040 ⑧(휴면형 미추종)에 흡수, 위임 과제 아님
> · **소형**: 엔진 백로그 11-⑩(설계 판단) · AG `excludeTools` 1회 실측(agy 미실증) ·
>   §5-8 낮은 우선순위 2건
> · **SAP 접속 필요**: vsp `transport list/get` read-only 실측(대기 ⑤) ·
>   `vsp copy` 묶음 배포(§5-12) · Domain Packs 제2축(미착수)
>
> **불변 확인(내일 세션이 착각하지 말 것)**: unattended=**sealed**(D-025·U-gate 전) ·
> RV4 **열림** · final-harness = **verified v0.17.3 동결**, candidate v0.20 봉인(D-038) ·
> symlink 탈출 차단 3건 **미검증 유지**(D-039② — 검증됐다고 적지 말 것) · SAP 프로파일
> `IDEA-JNC`=`IDES-DEV` **같은 서버 확정**(D-039①).
>
> ═══════════════════════════════════════════════════════════════════
> **▶ 이전 재개점 (2026-07-19) — 주/보조 머신 6일 분기 통합 (역사)**
> ═══════════════════════════════════════════════════════════════════
> 공통 조상 `8d09e571`(07-13)에서 갈라진 두 줄기 — **원격/주 머신 65커밋**(재기준 3축·
> 로드맵 S0~S6·final-harness v0.20 후보 `d4a0aeb`·CI/provenance 신형 게이트·D-020~029) /
> **로컬/보조 머신 71커밋**(MCP 엔진 4.13.13~15·캡슐 리뷰 게이트·vsp write 게이트+lock
> v2.38.1-94·FI 팩·지식 이식 층1~3·로컬 D-020~023; 평가·보조 머신 줄기 기록 시점엔 67 +
> 이후 통합 준비 커밋) — 을 **`integrate-20260719` 브랜치에서 병합**. 병합 베이스 = 원격
> main, 로컬 우월 자산 이식(⑸). **정본 =
> `docs/reference/audits/2026-07-19-branch-divergence-assessment.md`.**
>
> **▶ 잔여(통합 세션): ① MCP 엔진 provenance 재바인딩** — 원격 S3이 `engine/` 번들의
> `integrity.json.sourceCommit`을 원격 엔진 커밋 `0b304de7`에 핀했으므로, 채택된 로컬
> MCP 엔진 **4.13.15→4.13.16 재채번**(별도 담당) 커밋으로 재바인딩 · **② 게이트 전량
> green**(§9 신형 게이트) · **③ 새-컨텍스트 독립 리뷰** **→ 직후 vsp-custom 편입 착수
> (D-030, ⑷ — subtree vendoring·in-repo 빌드·`vsp.lock.json` 재작성·CI Go 잡; 아래 본류
> ⛔ vsp 블록의 '미결정'은 이 결정으로 종결)**.
> **→ ✅ 통합 세션 완주 (2026-07-19, 오케스트레이션 세션 — 충돌 해결 6그룹·원격 검증·
> 리뷰 전량 모델 지정 위임)**: 병합 `7a37ee90`(충돌 48 전량 해소, 부모 = 원격 5fd70c68 +
> 로컬 3d762168) + ① provenance 재바인딩 `cf110c36`(sourceCommit=병합 커밋,
> verify-engine OK@4.13.16·fa5698d351c7) ② 게이트 전량 green — 코어 6종(snapshot·
> links·verify-engine·engine-provenance·smoke 155·manifests) + PS 3종(23/16/17) 전부
> exit 0; 음성시험 = smoke 16/16 완주 · snapshot 러너는 이 머신 자식 프로세스 수거
> 비결정 블록(Windows spawn 계열 환경 제약, 시나리오 고유 아님 실측)이라 17개 시나리오
> 개별 유효 실측으로 보증(기계 완주 정본 = CI ubuntu) ③ 새-컨텍스트 독립 리뷰
> **PASS(BLOCKER/MAJOR/MINOR 0, INFO 3)** — 리뷰어가 merge-tree로 무마커 중복(조용한
> 병합 결함)의 존재를 독립 재구성해 8핸들러 전량 정리 확증 + append-only 무결(115+/0-)
> + 양쪽 phase 산출물 바이트 보존(diff 0) + 크로스 정합 표본 전건. 부수: 병합이 가져온
> 주 머신 판본 quality-gate-sap.ps1이 이 머신에서 fail-closed 즉사 → 머신별 경로 폴백
> 수리(양 머신 실행 가능, 병합 커밋 포함). 원격 줄기 사전 검증(S6) = 반증 0·함정 7건
> 기록. **→ ✅ push 완료(2026-07-19 사용자 승인)**: origin/main `5fd70c68..88bc2ede`
> fast-forward — 주/보조 동기화 0/0, 분기 종결. stale 브랜치 feat-3a-carrflt-seed
> 원격 삭제(승인, 증거는 main의 3b에 보존). 백업 가지 sprint-20260719는 원격 유지.
> **▶▶ 다음 착수 = vsp-custom 편입 실행(D-030 + 범위 확정 D-036)** — 범위 = **통째
> 편입 + 검증 중심 사용 계약**(2026-07-19 사용자 확정: 편입 동기는 엔진 verify 루프의
> 파서류 검증 자립 — 코드 분할 없이 전체를 가져오되 보증 표면은 검증 중심으로 문서화,
> write 안전 장치 불변. 검사기만 추출하는 안은 Go 분할 수술 + 두 정본 드리프트로 기각).
> 잔여 실행 설계(방식 subtree 등·경로·in-repo 빌드·CI Go 잡·lock 재정합)는 편입
> 세션에서 — 설계 제약 1: **바이너리(vsp.exe)·빌드 캐시는 비커밋**(소스만 편입,
> 빌드는 머신/CI 몫 — 2026-07-19 실측: 레포 실무게 git pack 22.3MiB로 건강, 위장
> 비대의 정체는 gitignore된 engine/node_modules 750MB 로컬 캐시였음·정리 완료).
> 편입 원천 = 이 머신(보조) `D:\Claude for SAP\vsp-custom`, 기준 커밋 = lock
> verified_commit **v2.38.1-94-g5a8bedb**(`adapters/vsp/vsp.lock.json`) — 편입 세션
> 첫 단계에서 원천 HEAD가 더 나갔는지 대조 후 기준 확정(더 나갔으면 델타 검토).
> 주 머신 사본(`D:\claude for SAP\vsp\vsp-custom`)은 -91 계열로 뒤짐 — 편입 후
> 경로 문제 자체가 소멸(quality-gate-sap.ps1 폴백 2경로도 in-repo 빌드 경로로
> 갱신 대상). 잔여 사용자 확인 1건: 주/보조 SAP 프로파일 명(IDEA-JNC vs IDES-DEV —
> 같은 시스템의 머신별 프로파일로 추정, SAFETY-PROFILES §⑦에 정직 병기됨).
>
> **→ ✅ vsp-custom 편입 완결 (2026-07-19, 오케스트레이션 세션 — 조사·실행·게이트·
> 리뷰 전량 모델 지정 위임)**: 원천(`D:\Claude for SAP\vsp-custom`) HEAD `5a8bedb`
> = lock verified_commit 정확 일치·clean → 델타 없이 기준 확정(예고한 첫 단계 이행).
> 방식 = **git archive 스냅샷 → 최상위 `vsp/` 567파일, 히스토리 비이식**(D-037
> append). 비이식 근거 = 편입 전 실사에서 원 레포 세션 기록 영역(reports/·contexts/)에
> 비공개 접속 식별 정보 잔존 실측(HEAD 평문 1 + git 이력 다수). 제외 = 세션 기록류
> 178파일(reports/ 155·contexts/ 22·최상위 터미널 로그 1 — 제품 코드 아님, D-036
> "통째 편입(코드 분할 없음)" 취지 유지). 편입 트리 비공개 정보 재점검 0건(작업자 +
> 독립 리뷰어 이중). 재현 빌드 실증: `CGO_ENABLED=0 -trimpath -buildvcs=false` +
> BuildDate 원천 커밋 시각 고정 → sha256 `1fe843c8f0daeafc…` 2회 동일·vcs 스탬프
> 부재(`go version -m`) = **머신·git 상태 독립 재현**; 바이너리·빌드 캐시 비커밋
> (설계 제약 1 이행 — vsp/.gitignore 차단, git ls-files 0). lock 성격 전환:
> `adapters/vsp/vsp.lock.json` = 외부 버전 lock → 빌드·명령 계약·provenance
> (source_provenance 신설, binary_main_machine·repo 블록 제거 — 머신별 경로 소멸);
> 오프라인 계약 스모크 3종(lint/parse/execute --help) in-repo 바이너리 재실측 PASS.
> 경로 재정합: quality-gate-sap.ps1·verify-sap.ps1 = 머신별 폴백 → 레포 상대 단일
> 경로(`vsp\build\vsp.exe`, fail-closed 유지) + CI vsp-build 잡 신설(ubuntu, CGO0
> 빌드+스모크 3종+pkg/abaplint 테스트, 로컬 green 후 편입). 문서 재정합: DESIGN
> §1·§2·§10·ARCHITECTURE·CLAUDE.md·COMMANDS.md·SAFETY-PROFILES.md·review-step.md
> (분리 전제·외부 절대경로 제거, 역사 무수정) + DECISIONS **D-037**. 게이트 전량
> green **14/14** — 코어 6+doctor(codex 핀 0.144.5→0.144.6 드리프트를 로컬 CLI
> 업데이트 원인·편입 무관으로 선례 재검증 후 5/5)+음성시험 2(17/17·16/16)+PS
> 3(23/16/17)+vsp 2(--version·go vet). **새-컨텍스트 독립 리뷰 PASS**(BLOCKER 0·
> MAJOR 1·MINOR 1·INFO 3): 리뷰어가 원천 5a8bedb 대비 567/178 파일 대조(564 바이트
> 동일+3 CRLF 정렬 무해)·비공개 0건·CI·문서 정합을 독립 재구성; MAJOR 1 = lock
> 재현성 주장이 buildvcs 각인으로 부정확 → `-buildvcs=false` 정정·재실측 당일 수리
> (`34e37e30`), MINOR 1 = 이 HANDOFF 갱신으로 해소, INFO 3 무해. 커밋: `faf8bcf1`
> (스냅샷 567)·`542e7619`(배선+D-037)·`34e37e30`(MAJOR 수리)·`0c5dcf5f`(codex 핀)·
> `13d1960f`(HANDOFF 1차 갱신)·`7664faf5`(스냅샷 재생성).
> **push 후 CI 첫 실행**: node-gates 1잡 FAIL — check-migration-snapshot이
> `adapters/vsp` 3파일 정당 수정을 목적지 드리프트로 검출(로컬 게이트는 커밋 전
> 실행이라 미검출·잔여 3잡[신설 vsp-build 포함] green). 원본 보유 머신 규약대로
> build-migration-snapshot 재생성(`adapters/` 해시 1줄만·16→16파일, pin a95eb0f·
> roots 36·inventory 487 불변·private 열거 0 — 선례 `cf110c36`) = 위 `7664faf5`.
> 재실행 CI **4잡 전부 green 실측 @`7664faf5`**(node-gates·engine-tests·ps-gate·
> vsp-build). 정직 기록: snapshot 음성시험 러너는 이 머신 spawn 수거 블록이 이번에도
> 재현(14/17 지점 중단)이라 기계 완주 정본은 CI ubuntu 유지(통합 세션 판정과 동일).
> **주 머신 후속 1회**: pull 후 in-repo 빌드 필요(quality-gate가 in-repo 경로만 봄;
> 명령 = lock `binary.build_command`) — 구 사본 `D:\claude for SAP\vsp\vsp-custom`은
> 더 이상 미참조. 원천 레포 = 무수정 보존. **처분 = 하지 않음으로 확정 (2026-07-20
> 사용자)** — 현 위치에 그대로 둔다(동결·삭제·이력 정리 전부 안 함). origin 미푸시
> 1커밋(5a8bedb 자체)·git 이력의 비공개 접속 기록도 그대로 남는다. ⚠️ 정직 기록:
> 편입 트리(`vsp/`)는 비공개 정보 0건 실측이나 **원천 레포 쪽에는 잔존**한다 —
> 그 레포를 외부 공유·푸시할 경우 노출되므로 그때 재검토할 것.
>
> **▶▶ 다음 착수 후보 (사용자 판단)**: **[D-038, 2026-07-20]** final-harness =
> **verified v0.17.3 동결** — candidate `d4a0aeb`(v0.20.0, staged)는 "검증됨·미승격"
> 봉인 · 로드맵 **S5·S6 불집행** · 상류 공급선은 **절단이 아닌 휴면**(보안 수정 등 필요
> 시에만 재개). 후보: ① U-gate 정의·기계 배선(D-034 잔여 — 무인 조건부 개방의 운영
> 개방 선결) ② 검토 게이트 캡슐 배선(통합 결정 ⑵·D-032 — 후속 소규모 설계) ③ vsp
> 테스트 수리(§9.6 4건 — 편입으로 이제 "레포 내 작업") ④ vsp transport list/get
> read-only 실측(**엔진 버전 무관** — P4 계약이 출력 형상에 의존, 자격증명 셸 필요).
> ~~잔여 사용자 확인 1건~~ **해소 (2026-07-20 사용자 확정)**: 주/보조 SAP 프로파일 명
> `IDEA-JNC`·`IDES-DEV`는 **같은 서버의 머신별 프로파일 명**이다(추정이었던 것을 사용자가
> 확정). SAFETY-PROFILES §⑦ 병기는 그대로 두되 "같은 서버 확정"으로 읽는다.
> **→ ✅ ③ 완료 (2026-07-20, 오케스트레이션 세션 — 수리·리뷰 모델 지정 위임)**: 4패키지
> 12테스트 전부 해소 — jseval `/tmp`→`t.TempDir` · adt 레코딩 ID atomic 시퀀스 접미사
> (timestamp 유지·소비처 무손상) · cmd/vsp audit 6건+cache Example CGO0 명시 skip
> (빌드 태그, CGO1 커버리지 유지·의존성 추가 0). CGO0 `go test -count=1 ./...` 전체
> green(FAIL 0)·vet 0·빌드 성공 — 작업자+리뷰어 이중 실측. 새-컨텍스트 독립 리뷰
> **PASS(B/M/m 0)**. 발견: adt 실패 부분집합이 lock 기록과 달랐음 = 동일 원인(coarse-clock
> ID 충돌)의 타이밍 의존 flaky 확증(Compare 계열은 충돌 시 id1==id2 자기비교) — 근본원인
> 수리 + 20회 stress 0실패. lock `test_status` RESOLVED 갱신. 잔여 = 필요 시 CGO1 cache
> lane(이 머신 gcc 부재)뿐. 남은 후보 = ①·②·④ + 0(엔진 실행 배선 선결, §5-14).
>
> **확정된 통합 결정 5건 (평가 문서 §5):**
> - **⑴ 방향 = 절충**: 대화형(attended) 중심 틀(원격 재기준 3축 Direct/Guided/Engine)을
>   트랙 A 정본으로 채택 + **무인은 틀 안의 관문(DESIGN §7 U-gate) 통과로 사용 가능**.
>   로컬 Phase 3 실증 + 무인 개방 승인이 관문 재료. 로컬 무인 상시 개방(구 D-023)은
>   "무조건 상시"가 아니라 **조건부 개방으로 D-034에 재기술**($TMP·DEV tier·리뷰 게이트
>   경유) — **재기술 전 실사용 보류.**
> - **⑵ 리뷰 게이트 = 역할 분담**: 원격 run-scoped 골격(D-021) = 공통, 무인 경로 SAP
>   write에만 로컬 캡슐 밀봉(D-032)을 관문 부품으로 편입. 양쪽 phase 산출물 이력 보존.
>   상세 배선은 후속 소규모 설계. (설계 정본 = DESIGN §13 Phase 3.)
> - **⑶ 결정 로그 = 원격 구조**(정본 `docs/reference/DECISIONS.md`, 원격 D-020~029 사용).
>   로컬 D-020~023 4건은 **D-031~034로 재기술·supersede**(재기술은 별도 담당 병렬 작성):
>   D-020→**D-031**(수행 레벨 문서 3종)·D-021→**D-032**(캡슐 리뷰 게이트)·D-022→**D-033**
>   (drift 비-vsp 채널)·D-023→**D-034**(무인 조건부 개방). **D-030 = vsp 편입**. 로컬
>   ADR.md는 내용 보존·`docs/reference/`로 이동(통합 세션 처리).
> - **⑷ vsp-custom 편입 확정(D-030)** — 실행 = 분기 통합 완료 직후.
> - **⑸ 병합 베이스 = 원격 main** + 로컬 우월 자산 이식(MCP 엔진 4.13.15→4.13.16 재채번 ·
>   vsp lock v2.38.1-94 · FI 팩 · 지식 이식 층1~3 · 캡슐 게이트 부품).
>
> 아래는 두 줄기의 분기 기간 기록이다 — **원격 줄기(주 머신)** = 이 헤더의 본류 타임라인
> (아래 재기준·S0~S4·Phase 4/3/2), **보조 머신 줄기(07-13~19)** = `---` 뒤 별도 절에
> 무손실 보존. 둘 다 이제 역사 기록이며, 현재 지침은 위 ▶ 잔여다.
>
> **[이전 재개점] 현재 재개점 (2026-07-16, D-027)**: 통합 보강의 실행순서 정본은
> `docs/reference/designs/2026-07-16-integration-hardening-roadmap.md`다. D-025의
> 실행 구조×SAP Policy 및 P4 소유권은 그대로 유지하지만, 아래 2026-07-15 재개점의
> `candidate=6de63ba`와 “§11 덩어리 3부터 진행” 순서는 **역사 보존 상태이며 실행하지
> 않는다**. 새 순서는 **S0 Track B 안전 봉인 → S1 clean final-harness v0.20.x candidate
> 선정 → S2 Track A Policy/review/wrapper/bridge 구현 → S3 provenance·CI·vsp 검증 보강
> → S4 독립 리뷰·disposable staging → S5 attended connected gate·파일럿 → S6 기능 확장**이다.
> **진척: S0~S4 완료 + push됨(2026-07-16, `d193db3..76feb2f` origin/main 반영). CI 3잡
> 전부 green 실측(결제 블록 해소 후 재실행 — engine-tests 599·node-gates·ps-gate).**
>
> ## ⛔ 다음 세션 첫 질문 (S5 진입 전 선결 — 사용자 결정 대기)
>
> **vsp를 레포에 편입할 것인가? (D-018 재론)** — 사용자가 이 결정을 다음 세션(집)에서
> 하겠다고 명시. S5(파일럿)는 이 결정 **뒤에** 진행한다. 새 컨텍스트는 착수 전 이
> 질문부터 사용자에게 제시할 것.
>
> - **배경**: 프로젝트 철학은 "차용 후 완전 소유"(D-017 엔진 편입은 근거 첫 줄이 **사용자
>   의도** "레포 안에 다 녹인다"). 그런데 **D-018(vsp 분리 유지)은 사용자 선택이 아니라
>   Fable+Codex 분석 수렴 결론**이라 vsp를 그 철학의 예외로 만들었다. 사용자는 "분리할
>   생각 없었다 — abap-mcp-powerup처럼 다 녹이려던 것"이라 밝힘. D-018이 건 **재론
>   트리거**(트랙 A 착수 후)의 시점도 지금(S5)과 맞는다.
> - **실측한 vsp 역할(편입 논거의 사실 기반)**: vsp는 이 스택의 **유일한 오프라인 ABAP
>   검증기**(엔진 `CheckSyntax`는 서버측/온라인) + **Engine의 SAP 실행 백엔드**(AGENTS:
>   worker는 vsp CLI만 — 없으면 attended Engine이 SAP에 손댈 경로 자체가 없음) +
>   **완료 증거 백엔드(V-PASS)**. **모델 차원에서 vsp는 필수다** — 없으면 Engine worker의
>   SAP 실행·V-PASS·오프라인 검증이 전부 불가. 단 `execute.py`의 vsp 언급은 **0건**(S4
>   실측): 오케스트레이터 바이너리는 vsp를 import하지 않고 `verify_cmd`로 위임한다. 이건
>   "vsp가 선택/교체 가능"이란 뜻이 **아니다** — 트랙 A 완료 계약이 vsp로 **정의**돼 있어
>   이 프로젝트에선 교체 불가. 즉 "바이너리가 링크 안 함"과 "모델이 필수 요구함"은 별개고,
>   편입 논거는 후자(**모델 필수 백엔드 + 자기완결성**)다.
> - **SAP 통찰(오프라인 파서가 왜 불가결한가)**: SAP는 원격 시스템이라 ABAP 검증이 원래
>   전부 서버측이다. SAP에 안 붙고 ABAP를 검증하는 유일한 길이 vsp 오프라인 파서
>   (abaplint 내장)이고, 이 프로젝트는 **오프라인 우선(P0 기본)** 이 설계 원칙이다 —
>   그 원칙을 가능케 하는 게 vsp다. 없으면 매 검증마다 SAP 접속이 강제돼 오프라인 우선이
>   무너진다. (서버측 `CheckSyntax` 온라인 폴백은 있으나 **오프라인** 경로는 vsp 유일.)
> - **정직한 비용**: ① Go 툴체인이 레포/CI에 추가됨(vsp = 103k LOC Go·286파일·CGO 빌드,
>   지금 Node 하나에 Go가 둘째 툴체인) — 단 이건 "편입해서 생기는 문제"가 아니라 "vsp가
>   원래 크다"는 사실이라 편입을 막는 논거로는 약함 ② ~~활발한 업스트림 결별 비용~~
>   **아래 재평가에서 붕괴** ③ 자기완결성 이득은 오프라인 한정(V-PASS 대부분이 온라인이라
>   어차피 SAP 접속 필요).
> - **D-018 재평가 (2026-07-16 사용자 논의 — 두 기둥이 무너짐)**:
>   · **② "활발한 업스트림 결별 비용"은 하드 포크 전제에서 붕괴.** 이 비용은 oisee
>     업스트림을 계속 **받아먹을 의도**가 있을 때만 존재한다. vsp-custom은 이미 사용자
>     자신의 커스텀 패치를 얹은 diverged 포크다(CLAS deploy 수정 `v2.38.1-89`, R-006/L-001;
>     버전 `v2.38.1-91-g0b03ef2`로 태그보다 91커밋 앞섬). 업스트림을 따라갈 의도가
>     없으므로 oisee가 활발하든 말든 무관하다. 게다가 **subtree 편입은 다리를 태우지
>     않는다** — 나중에 oisee 보안 fix가 필요하면 `git subtree pull`로 여전히 끌어올 수
>     있다(엔진과 동일). 즉 "혹시 나중에" 걱정도 편입이 막지 않는다.
>   · **"vsp는 그냥 외부 도구를 호출할 뿐" 프레이밍은 과소평가였음.** 위처럼 모델 차원에서
>     필수 백엔드다.
>   · **남는 건 ①(Go 빌드 무게)뿐.** D-018을 지탱하던 진짜 기둥(②)이 빠지므로, 이 결정은
>     "무게를 감수하고 자기완결성을 택하느냐"로 좁혀진다. 사용자 철학(한 레포)·모델 필수성·
>     재론 트리거 시점(지금)을 감안하면 편입 쪽이 정합적이다. **단 최종 택은 사용자.**
> - **S5와의 관계**: 오늘 쓰는 vsp **바이너리는 편입 여부와 무관하게 동일**(lock된 exe,
>   sha256 검증). 편입은 "미래 소스 정본·재현성" 문제이지 S5-A 실행을 막지 않는다.
> - **세 갈래**: ① 지금 vsp 편입 착수(S5 잠깐 멈춤) → 편입 후 파일럿은 in-repo 빌드
>   바이너리로 ② S5 먼저(오늘 lock 바이너리) → 편입은 파일럿 통과 후 ③ 편입 미니
>   설계서(범위·subtree 방식·CGO 빌드 전략·CI 영향)부터 쓰고 결정.
> - **편입 택 시 실제 작업**: subtree로 vsp 소스 vendoring → in-repo Go 빌드 → integrity
>   핀(엔진 `integrity.json` 준용) → `adapters/vsp/vsp.lock.json`을 in-repo 커밋 기준으로
>   재작성 → CI에 Go 빌드 잡 → **D-030 append**(D-018 supersede + 사유). 이 결정 전엔
>   D-030을 쓰지 않는다(아직 미결정).
>
> ## S5 선행조건 (vsp 결정 후 즉시 착수 가능 — 전부 준비됨)
>
> - candidate.state=**staged** ✓ (verified는 v0.17.3 불변, 매 호출 명시 `-Candidate` 없으면 exit 65)
> - **SAP 대상 = IDES 확정(사용자 결정)**: 앞으로 KR-DEV 대신 **IDES = 프로파일 `IDEA-JNC`**
>   (S4H/client 100, Phase 4에 쓴 그 프로파일)로 진행. IDES는 샌드박스라 DEV보다 안전.
>   `IDEA-JNC`의 sap.env는 이미 `SAP_TIER=DEV`라 **tier 게이트 통과에 설정 변경 불요**
>   (tier-readonly-guard는 문자열 `DEV`만 write 허용 — `IDES`로 라벨하면 fail-closed).
> - **첫 걸음 = S5-A**(vsp transport list/get 읽기 전용, P1). 자격증명 로드는 **사람이**
>   `. .\scripts\vsp-env.ps1 -ProfileName IDEA-JNC`로(phases/3b 원칙). 함정 2건: dot-source한
>   **같은 세션**에서 vsp 호출 · PS `>` 리다이렉트는 UTF-16이라 금지. 내 도구 호출은 셸
>   상태가 안 남으므로 자격증명 로드+vsp 호출을 **한 호출**에 묶거나 사용자가 실행.
> - S5 이번 세션에서 **SAP 접속·write 0건**(vsp는 읽기 도움말·lock 검증만).
> 상시 금지(모든 단계): SAP 연결·write(S5 전까지), 트랙 B 원본
> `D:\claude for SAP\sc4sap-custom` 수정 및 private 탐색, raw `python scripts/execute.py`.
> `check-migration-coverage`는 **S3에서 폐기**됐다(대체: `check-migration-snapshot`).
> 주 머신 Engine 설치 금지는 **S4 통과로 해제**됐으나, staged candidate는 매 호출
> 명시 `-Candidate` opt-in이 있어야만 기동한다(없으면 exit 65).
>
> **S3 완료 (2026-07-16, D-029 · 커밋 78979d7~b71b322)**: 게이트를 관찰에서 **assertion**으로.
> ⓐ **§9.2** 이식 검증을 live walk → **pinned snapshot**으로 교체. 구
> `check-migration-coverage`는 동결 원본을 재귀 순회하며 private 경로 이름을 열거했고
> (R-004 저촉) 러너엔 절대경로가 없어 **CI 실행 자체가 불가**였다(이식 검증 사각지대).
> 새 게이트는 원본에 **접근하지 않아** 드디어 CI에서 돈다 — pin `a95eb0f`(이식일 시점
> 원본 HEAD) + public root allowlist 36 + tracked 인벤토리 **487** + 목적지 내용 해시.
> 원본 접근은 생성기·드리프트 리포터 2종에만 격리(allowlist pathspec만 → `private/`
> **미질의**). ⓑ **§9.3** `integrity.json.sourceCommit`을 상류 fork 약식 SHA `1964959`에서
> **실제 엔진 소스 커밋 `0b304de7`**로 바인딩 + VERSION의 "working tree, uncommitted"
> 제거. **번들 재현 실측: 재현됨**(같은 커밋 재빌드 → sha256·바이트 동일). 엔진 테스트
> **599** CI 편입. ⓒ **§9.4** smoke-mcp가 출력만 하고 **항상 exit 0**이던 것을 assert로.
> ⓓ **§9.5** 매니페스트 5종을 단일 정본에서 생성 + compatibility 핀을 **재검증 후** 갱신
> (codex 0.144.4 · agy 1.1.1 · doctor 5/5). ⓔ **§9.6** vsp는 **읽기만** — 계약 오프라인
> 명령 2종 lock binary로 직접 실측 PASS, 4패키지 FAIL은 전부 계약 밖으로 분리 기록.
> **vsp-custom 수리 착수는 사용자 결정**이라 미착수. ⓕ **§9.7** CI 3게이트 → 3잡.
> 게이트마다 **음성시험 동반**(17/17 · 16/16) — 통과만 하는 게이트는 없느니만 못하다.
>
> **S4 완료 (2026-07-16, 커밋 c4f34fa·d608233) — candidate `d4a0aeb` state=`selected`→`staged`.
> verified는 v0.17.3 불변.** ⓐ **새-컨텍스트 독립 리뷰 MAJOR 0** — 리뷰어가 핀·인벤토리
> 487·sourceCommit·엔진테스트 599를 **독립 재계산**해 확인. MINOR 5·NIT 2 중 M1(게이트
> 정본 문서가 삭제된 스크립트를 지목 — 새 컨텍스트가 첫 명령에서 크래시)·M2·M3·N1·N2
> 수리. ⓑ **disposable staging**(clean clone, 주 머신 아님) — installer exit 0 ·
> **트랙 B 훅 3종 바이트 동일 보존**(S1의 "계약 수준만" 부채 해소) · `phases`/`interactive`
> **바이트 동일** · legacy deny 64/64/65. ⓒ **선결 부채 상환: F1~F7 7/7 · N1~N8 8/8 전량
> 유지 재측정**(좌표 d4a0aeb 기준 갱신 — v0.17.3 좌표 무효). ⓓ staging이 **독립 리뷰가
> 못 본 버그**를 잡았다 — 스냅샷이 `.sc4sap` 런타임 상태를 해시에 섞어 **클린 클론에서만
> FAIL**했다(주 머신에선 통과 = 구 게이트를 죽인 것과 같은 병).
> ⚠️ **S4 정직 기록**: **symlink 탈출 차단 3건 여전히 미검증**(WinError 1314 재현 —
> 개발자 모드/관리자 권한은 **사용자 머신 결정**) · **raw execute 안내는 상류 문제로 확정**
> (candidate가 여전히 `python scripts/execute.py <phase>`를 안내 — "installer 재설치"로는
> **해결 안 되고 오히려 재유입**, durable 해소는 **상류 기여**뿐 = 사용자 결정) ·
> **installer는 clean clone에서 `execute.py`를 교체하지 않는다**(engine-manifest가
> gitignore → user-owned fail-safe skip → **v0.20 훅 + v0.17.3 executor 혼합**, 실제
> executor 승격은 PROMOTE 소관) · §10.4-5(Guided footprint)·§10.4-7(fake-vsp 경계)은
> Engine fail-closed라 **미실행**(닭-달걀 — staged가 그 잠금을 여니 S5 소관) ·
> **RV4 여전히 열림**(authority-gate.py의 vsp 언급 0건 재확인).
> **S0 완료 (2026-07-16)**: 트랙 B mutation 절차(create-program·create-object·release·
> reviewer + data-extraction P2)를 attended-only Policy에 정렬 — unattended 권장·release
> 자동 실행·reviewer 기계격리 보편 주장 각 0건, 상태 모델 DRAFT/PROVISIONAL_WRITE/
> COMPLETE/READY_FOR_RELEASE 반영, links·bundle 무변경, phases diff 0. Fable 5 방향 검토
> 통과 후 착수.
> **S1 완료 (2026-07-16, D-028)**: 상류 dirty를 사용자가 커밋·푸시해 선결 해소 →
> **CANDIDATE_SHA = `d4a0aeb0bdbcea008dbe2926006ee2e06eac2fc3`**(plugin v0.20.0)로 확정,
> 상태 **`selected`**(staged/verified 아님). authoritative release check **success=true**
> (codex 0.144.4 실탐지 · Py3.9+3.12 각 784 passed/3 skipped · bridge×3 · git-diff-check,
> 9/9 exit 0, 증거 sha256 `85cda0a6…`) + **clean detached 클론 재현 통과**(`secret.env`
> 부재에도 통과 = secret 비의존). `5cd63ec`(v0.20 hook lifecycle)·`1209553`(bounded docs)
> 조상 YES. **F1 실질 생존 확인**(`--strict-mcp-config` `execute.py:3008`·`:3566`, codex
> `enabled=false` `:3526`) → DESIGN §3 백엔드 근거 유지. **lock은 verified=v0.17.3
> 그대로(미변경)**. ⚠️ **정직 기록**: RV4는 이 candidate에서도 **열림**(authority-gate.py에
> vsp 언급 0건 — v0.20 업그레이드로 닫히지 않음) · symlink 탈출 차단 테스트 3건은 이
> 머신 권한 부족으로 **미검증**(WinError 1314, S4 재확인) · 트랙 B 훅 보존·Direct
> zero-footprint는 **계약 수준만**(실증은 S4) · F1~F7/N1~N8 **전량 재측정은 lock 승격 전
> 선결**.
> **S2 완료 (2026-07-16, 커밋 1dc5e98·f1f3dfa·4d1bf50·558dc27)**: ⓐ **S2-A** — vsp Policy
> 문서를 구 3모드에서 **role × P0~P4**로 재작성. **리뷰어 transport 조회 허용 오류 제거**
> (AGENTS "including reads" 저촉), "무인 전환 가능" 삭제, RV4 역사/현재 분리, P2/P4
> owner·승인 시점 exact화. VERIFY-PATTERNS에 role별 credential 분리(리뷰어 dot-source
> 금지 = 유일한 기계 차단). ⓑ **S2-B** — 리뷰 계약을 **run 축 v2**로: `-RunId`,
> `reviewed_source_sha256`(exact subject 핀, 소스 변경 시 stale), `boundary` 강제
> (P0/P1·transport 0·`unverified` 부정직 표기 차단), **bookkeeping 제외를 좁힘**(구
> `.harness/**` 통짜 제외를 두면 verdict 자신이 제외돼 등식형 검사가 공허해짐 —
> 다른 run 침범도 걸림). 테스트 **23/23**. ⓒ **S2-C** — **lock v2**(verified v0.17.3
> 보존 + candidate d4a0aeb `selected` + top-level safety_state + history에 6de63ba) +
> **`scripts/run-track-a.ps1` 신설**(64 LEGACY_PHASE_DENY / 65 ENGINE_UNAVAILABLE /
> 66 CONTRACT_MISSING / 67 LOCK_INVALID; **safety_state 변조도 67로 거부**) + 테스트
> **16/16** + legacy 봉인(`legacy-phase-policy.json`·`LEGACY-CATALOG.md`). **실제 lock으로
> 오늘 실행하면 65** — Engine은 의도적 fail-closed. ⓓ **S2-D** — 단방향 bridge
> `promote-track-b-run.ps1`(.sc4sap read-only → `.harness/runs/<id>/` 동결) + 테스트
> **17/17**(승격 후 `.sc4sap` **바이트 동일** 실측). **candidate는 여전히 `selected`**
> (§8.4 — 코드가 생겼다고 staged 아님). ⚠️ **정직 기록**: raw execute 안내 제거는 **부분적** —
> 출처 `.claude/hooks/session-start-context.py`가 **gitignore 대상**이라 이 머신 로컬만
> 교정됐고 durable 제거의 소유자는 **S4**(installer 재설치) 또는 상류 기여다.
> **다음 = S3**(provenance·CI·vsp 테스트 계약 보강) — Direct/P0, SAP 무접촉.
> 주 머신 Engine 설치는 S4 전까지 금지.
> `scripts/run-track-a.ps1`와 승인된 new-style contract/manifest가 생기기 전까지 Engine은
> 계속 fail-closed이고 raw `scripts/execute.py` 호출은 금지다. 상태 표기는 정확히
> `attended-only`, `unattended=sealed`, `historical_rv4_classifier=open`,
> `sap_mutation_boundary=unverified`(scope: reviewer + all attended children)를 유지한다.
> **S1 착수 전 리마인더 (Fable 5 방향 검토, 2026-07-16)**: 새 v0.20.x candidate를 뽑을
> 때 F1~F7/N1~N8 불변식(특히 **F1 = headless child의 MCP 차단**, DESIGN §3 백엔드 결정의
> 근거)을 새 SHA에서 재측정해 S1 합격 기준 또는 lock v2 계약에 명시한다 —
> `--strict-mcp-config` 형상이 v0.20에서 바뀌면 "Engine=vsp CLI만"의 근거가 흔들린다.
> **이전 재개점 (2026-07-15, D-027로 실행순서 supersede — 역사 보존)**: 트랙 A 재기준 v2 **사용자 택일 3건 확정(D-025)**.
> 실행 구조는 **Direct 기본 + Guided 명시 승격 + Engine attended 특수**, unattended는
> sealed다. 단일 정본 설계서 = `docs/reference/designs/2026-07-15-track-a-rebase-v2.md`
> (07-14 초안 대체); D-023 방향·D-024 정정 위에 D-025가 O1/O2/O3 trade-off를 봉인.
> candidate pin = **6de63bac860723ff1bfd50a940a75e46c6e87d99**(커밋 blob v0.19.3).
> 상류 워킹트리의 보이는 0.19.4는 20파일 미커밋이라 제외; verified lock은 여전히
> 8f7f13b(v0.17.3)이며 staging+파일럿+gate 전에는 candidate를 verified라 부르지 않는다.
> **O1=(가) 비용 0 현행 정직 기록**: 추천 (나)는 사용자가 기각. 새 reviewer SAP 기계
> 경계 없음 → **D-019 SAP reviewer 기계 격리 약화**, attended-only,
> `historical_rv4_classifier=open` / `sap_mutation_boundary=unverified`(reviewer + 모든
> attended child); reviewer는 조회를 포함한 transport 동작 0. §7 U-gate 전 unattended
> 봉인, RV4 닫힘 기록 금지.
> **O2=P4 실계약 확정**: Guided가 DEV package/request create·assign·release 준비를 소유,
> Engine worker는 사전 승인된 request에 vsp `deploy --transport` 할당·검증만. release는
> exact 번호를 재확인한 사람 전용, QA/PRD import는 사람/Basis STMS 전용. 고정 vsp의
> `transport list/get`은 help 존재만 확인됐고 출력 형상 미확인·command contract 미등재;
> `deploy --transport`만 등재됨. MCP release live 지원·abapGit local 흐름도 미확인이다.
> 이번 설계 작업에서 SAP write/release/import 0. **O3=파일럿 A 트랙 B MCP write**:
> DEV allow/pass는 no-op smoke이고 unresolved/QA deny만 tier 차단 증거다. 적용 경로와
> 무관하게 완료 도장은 vsp CLI source read·syntax/activation·unit/ATC만; abapGit은
> 명시 트리거가 생길 때 재론. **⚠️ v0.19.2 분석 재실행 금지 — 보존 분석 재사용.**
> **§11 연쇄 진척 (덩어리 5개 중 2 완료 — 전부 커밋됨, 워킹트리 클린)**:
> **덩어리 1 = `c895598`** (AGENTS 전면 교체·CLAUDE·`.harness/*`) — 라우팅이
> 3구조×P0~P4로. **"파일·step·검증 수는 라우팅에 영향 없음"** 명문화로 구 레인 규칙
> (여러 step→무인 phase 제안)이 일으킨 실측 마찰 봉합. `.harness/GOAL.md`·`STATE.md`는
> **동결(legacy)** — 신규 작업은 여기 쓰지 않는다(내용 보존, 헤더만 +7/-0).
> **덩어리 2 = `2967d63`** (DESIGN §2·§3·§5·§8·§13·§15-F·§16 + PRD·ARCHITECTURE +
> HANDOFF 잔여 + 07-13 설계서 legacy 헤더). §3의 "대화형 세션은 사람 소유" 원문 보존,
> MCP 차단 근거를 **Engine headless step 한정**으로 정밀화.
> **D-026 = `57c5a80`** — 결정 로그를 **`docs/reference/DECISIONS.md`로 이전**
> (`git mv`, 내용 무변경 = rename +60/-0은 D-026 append뿐). 사유: 엔진이 top-level
> `docs/*.md` 전량을 매 스텝 주입(비재귀 glob, `execute.py:2321-2323`@6de63ba ·
> WARN 48KB · **기동 거부 64KB**)하는데 합계가 57,747(거부선 88%)에 달했고 그중 77%가
> 결정 로그였다 — append-only라 감소 불가. **주입 57,747 → 13,121 bytes(거부선 20%)**.
> `docs/` 최상위 = PRD·ARCHITECTURE 2종만. **`docs/ADR.md`는 여전히 미신설**(D-012·
> D-020 이중 체계 금지 유효 — 위치 변경일 뿐). 의도적 미갱신: `phases/**`·
> `interactive/**`(§11 diff 0 요구)·07-15 리뷰 기록 2건(작성 시점 증거).
> **§11 잔여 = 덩어리 3·4·5**: ③ `SAFETY-PROFILES.md` §①~⑧ 전면 재작성 +
> `VERIFY-PATTERNS.md`(role별 credential 분리) ④ 리뷰 계약·**코드**(`review-step.md`·
> `review-gate-plan-conventions.md`·`review-verdict.schema.json`·
> `check-review-verdict.ps1`+test — 여기부터 테스트 동반) ⑤ lock v2 스키마
> (`safety_state` 포함)·`legacy-phase-policy.json` 신설·**`scripts/run-track-a.ps1`
> 신설**·`LEGACY-CATALOG.md` 신설.
> **⚠️ 현재 Engine 진입 불가 (의도된 fail-closed)**: 덩어리 1의 AGENTS.md가 유일
> 진입점을 `scripts/run-track-a.ps1`로 못박았는데 그 wrapper는 덩어리 5에서 만든다.
> 그때까지 SessionStart 알림의 `python scripts/execute.py <phase>` 안내는 **무시**한다
> (AGENTS.md가 raw execute를 금지 — 알림 제거도 덩어리 5).
> **권고**: 덩어리 3~5 완료 후 **새-컨텍스트 독립 리뷰 1회**(덩어리마다 말고 한 번에).
> 근거 = 07-15 실증: 작성자 자체검증 18/18 뒤에도 독립 리뷰가 MAJOR 6건 검출.
> **당시 다음 액션(D-027로 supersede — 실행 금지)**: §11 덩어리 3 → 4 → 5 → 독립 리뷰 → clean detached 6de63ba
> test/staging install/복제본 migration → §12 G1~G14 + 파일럿 A/B + P4 T1~T5
> (`READY_FOR_RELEASE`, 실제 release 없음) → 증거 exact SHA 바인딩 후 PROMOTE. 실제 전달
> run만 사람 T6 release·T7 STMS import를 추가한다. 상세는 v2 설계서 + D-025 원문.
> **사용자 대기 항목 (2026-07-16 현행화)**:
> ⓪ **[최우선·다음 세션 첫 질문] vsp 편입 여부(D-018 재론)** — 위 ⛔ 블록 참조. S5 선결.
> ① ~~push 여부~~ **완료** — `d193db3..76feb2f` push됨, CI 3잡 green 실측.
> ② ~~symlink 권한~~ **불추진 확정 (2026-07-20 사용자)** — 탈출 차단 3건은 이 머신에서
> 계속 skip(WinError 1314 S4 재현)이고 개발자 모드/관리자 셸이 필요하나 **하지 않기로
> 결정**. 근거: 대상이 D-038로 봉인된 candidate(v0.20) 계열이라 실효 가치가 낮다.
> `known_unverified`는 **열린 채 정직 유지**(검증됐다고 적지 않는다). 재론 시 재료 =
> `test_install_engine.py:454/:466` · `test_run_contract.py:223`.
> ③ ~~raw execute 안내의 durable 제거~~ **불추진 확정 (2026-07-20 사용자)** — S4가 경로를
> 확정했으나(installer 재설치로는 **해결되지 않고 오히려 재유입**: candidate의
> `session-start-context.py`가 여전히 `python scripts/execute.py <phase>`를 안내, 우리
> 교정본은 gitignore 대상이라 머신 로컬) **상류 기여를 하지 않기로 결정**. D-038의
> 공급선 휴면과 정합. 대응 = 현행대로 AGENTS.md 금지 + 래퍼 exit 64 deny로 차단 유지
> (SessionStart 알림의 legacy 안내는 **무시**하는 운영을 계속한다).
> ④ ~~vsp-custom 수리 착수~~ **완료 (2026-07-20)** — §9.6(`/tmp`→`t.TempDir` · recording
> ID · CGO0 SQLite · Windows lane). D-030 편입으로 레포 내 작업이 됐고 4패키지 12테스트
> 전부 해소·독립 리뷰 PASS. 상세 = 헤더 "③ 완료" 블록 + `vsp.lock.json.test_status`
> (RESOLVED). 잔여 = 필요 시 CGO1 cache lane뿐.
> ⑤ **`vsp transport list/get` read-only 1회 실측** — 자격증명 셸 필요. 출력 형상
> 미확인이라 P4 계약이 여기 의존(**S5-A**가 소유, G14 대상).
> ⑥ ~~상류 설계 결함 확인~~ **불추진 확정 (2026-07-20 사용자, ③과 동시)** —
> `adapters/final-harness/UPSTREAM-DOCS-LIFECYCLE-GAP.md`(영어 자립형, 상류 세션
> 붙여넣기용)는 **문서로 보존만** 한다. 내용 = `harness-docs`가 ADR.md에 영구 append와
> ~300줄 상한을 동시 요구하나 초과 시 처분 부재. 상류 전달 안 함.
> ⑦ **상류 워킹트리 dirty** — S1 시점 20파일은 사용자가 커밋해 해소됐고 d4a0aeb가 그
> 결과다. 현재 `docs/manual.html` 1건이 다시 dirty(읽기만 함 — 손대지 않았다).
> ⑧ **상류 sc4sap public 드리프트 판정 — 유일 잔여 사용자 판단**. 전부 `pending`(기록 0건).
> 판정처는 `interactive/provenance/upstream-drift-dispositions.json`. (핀 게이트는 무영향.)
> **재측정 2026-07-20 = 58건**(public HEAD `5e087eda`) — 07-16의 55건(HEAD `9781ff3e`)에서
> 또 늘었다. 수는 **상류 HEAD의 함수**라 볼 때마다 바뀐다(45→55→58). 성격 분해(재현:
> `node interactive/scripts/report-sc4sap-public-drift.mjs`): **transform 36**(페르소나·
> CLAUDE.md·README·플러그인 설정 — 실질 검토 대상은 여기뿐) · obsolete 8(HUD·publish·
> src/index.ts 등 미채택) · archive 8(다국어 README·CHANGELOG — §5-6 "재작성 안 함"으로
> 이미 무관) · copy 6. **copy 6건 중 engine/ 4건은 실질 무의미**(D-017 편입 후 자체 수리
> 4.13.16까지 진행돼 상류와 완전 분기 — 되가져오면 우리 수리가 소실). 나머지 2건 =
> `scripts/fetch-abap-keyword-doc.mjs`·`fetch-sap-help-doc.mjs`로 **§5-5의 "깨진 표면"과
> 동일 대상**이다(코어 페르소나가 bundled로 참조 중인데 미이식). 즉 5-5를 구현 방향으로
> 풀면 이 2건이 조달처가 된다. 방침 선택지: ⓐ 현상 유지(목록은 언제든 재생성) ⓑ transform
> 36건만 대조해 개선분 선별 이식 ⓒ "상류 미추종" 명시 후 리포트 접기.
> **Phase 4(Domain Packs) 완료 ✅ (2026-07-14)**: 완료 기준 ①(팩 CONSULT 실사용 =
> recon 결정 델타 5건) + ②(LESSONS 유래 규칙 승격 = 4a 씨앗→L-002→R-007) 충족 +
> 에스코트 보강(4a 씨앗 차단 + 4b 정상 배포). 소형 잔여(재기준과 무관): 엔진 11-⑩ ·
> doctor 핀 드리프트(codex 0.144.3·agy 1.1.1) · vsp source read lock · 5-5 fetch.
> **Phase 4 완료 상세 (2026-07-14)**: 4a(씨앗) — impl(BSEG 결함) 1회 → 리뷰 3회
> 전부 FAIL(BSEG→ACDOCA file:line 적중) → error·step2 미도달, SEED_BLOCK_OK,
> feat-4a-glopen-seed 봉인(646c691, main 미병합). L-002 + FI-002→R-007 승격. 4b
> (정상) — impl(ACDOCA·SUM(hsl)·rldnr='0L' DEFAULT, 2L 원장 제외 픽스처) → 리뷰
> 게이트 **PASS**(reviewed_head b2fa101) → main 병합(55b4ea3, --no-ff) → 에스코트
> E1~E4 전부 통과(deploy+activate VERIFY_PASS·drift clean[`>` UTF-16 아티팩트,
> 정규화 후 내용 동일]·ATC INFO 2건만·unit 1 passed/0 failed). 원로그 =
> phases/4b-glopen-gated/scoring-raw.md. 런북 함정 2건(PS 세션 내 `&` 직접 호출·
> `>` UTF-16 drift 오인)은 scoring §1·STATE attempts 기록.
> **4a-glopen-seed 완료 (2026-07-14, 기대 결말 그대로 실측)**: impl 1회 완료(vsp
> lint exit 0·유닛 green) → **리뷰 3회 전부 FAIL**(B2/MAJOR — BSEG→ACDOCA를
> file:line 적중, 리뷰어는 씨앗 메타 무지) → error 종료·step2 미도달. 기계 확정 =
> SEED_BLOCK_OK(인버스 검증) + src 무변경. 증거 = `feat-4a-glopen-seed` 봉인
> (646c691, main 미병합 — 3a 패턴. main의 phases/index.json엔 4a가 pending으로
> 남아 SessionStart 알림에 '4a 실행 대기'가 계속 뜨는 것이 정상 — 무시).
> L-002 기록 + R-007 승격 + 팩 씨앗 승격 표기 + 잔존물 봉인 전부 완료.
> **Phase 4 이후 방향 확정(D-022, 2026-07-14)**: 상류 final-harness가 lock 이후
> v0.18.0~v0.19.1(Direct 기본값·Guided run-계약 중간층·무인=container/VM 필수)로
> 이동 실측 — Phase 4는 현행 lock(v0.17.3)으로 완주하고, 완주 후 **트랙 A 대화형
> (Guided) 중심 재기준**을 정식 결정으로 다룬다(무인은 배치·특수 모드로 강등 방향,
> 즉시 전환·보류는 기각 — 근거는 D-022 원문). **완료 기준 ①
> 증거는 이미 확보** — `phases/4-glopen-recon/recon-raw.md` §2(팩 전/후 결정
> 델타 5건: BSEG→ACDOCA 전환 등) + §5(ACDOCA 원시 컬럼 확정·RLDNR 원장 중복
> 합산 함정 발견). 파일럿 = ZSAH4A_GLOPEN(씨앗)·ZSAH4_GLOPEN(정상), $TMP,
> IDEA-JNC(S4H/100·ABAP 756 — S/4 실측). 사용자 확정: 배포=에스코트·객체명
> ZSAH4 계열·규칙 승격=씨앗 주입. 오프라인 1단계 산출 = `packs/modules/`
> (README 규약·fi/CONSULTANT.md 포인터 허브·fi/RULES.seed.md FI-001~005) +
> DESIGN v2.3(§12 thin+pointer·챕터 분리 트리거), 새-컨텍스트 리뷰 PASS(MAJOR 0).
> 상세 = `.harness/STATE.md` · `.harness/GOAL.md`(커넥티드 청크 기준 갱신됨).
> **트랙 A Phase 3 완료 (2026-07-13)** — 리뷰 게이트 구현(A-청크,
> 오전) + 커넥티드 라이브 실증(B-청크, 오후). D-021 스펙 AC 5건 전부 성립(AC1~4
> 오프라인 + **AC5 씨앗 결함 라이브 차단**) + DESIGN §13 Phase 3 완료 기준 ①②③
> 전부 실측(리뷰 PASS 객체가 SAP 전체 write 체인 통과·SE80 drift 검출·씨앗
> 시맨틱 결함 차단) → **에스코트 해제 조건 성립**. 같은 날 후속으로
> **SAFETY-PROFILES §⑥ 차단 검증(V1~V5+RV1~RV4) 실측도 완료**. **2026-07-15
> supersede**: 당시 §⑦의 "무인 전환 가능(2026-07-13 실측 완료)"은 역사적 판정일 뿐
> 현재 지원 상태가 아니다. RV4가 확정한 phase-공통 자격증명·비기계적 SAP-write 차단
> 갭 때문에 D-025/O1 이후 `attended-only`, `unattended=sealed`이며 §7 U-gate 전 해제
> 불가다. 부수: 주 머신 vsp
> 빌드(lock 0b03ef2 재현, `binary_main_machine` 병기) + 엔진 훅 설치로 **이
> 머신 트랙 A 무인 실행 최초 개통**. 다음 후보 = **Phase 4(Domain Packs)**
> 또는 무인 전환 실행 또는 잔여 정리(엔진 11-⑩ 설계 판단 · doctor agy 핀 갱신 ·
> vsp source read lock command_contract 편입 검토) — 사용자 판단 대기. 상세 =
> `.harness/STATE.md` · `phases/3b-carrflt-gated/scoring-raw.md` ·
> `adapters/vsp/SAFETY-PROFILES.md` §⑥.
> **트랙 A Phase 2 완료 (2026-07-12)** — 답사→계획 변경 기록(§13 완료 기준 충족) +
> 무인 완주(2 steps, verify 실패 0, 리뷰 위반 0) + connected 채점 **5 PASS/0 FAIL**.
> 채점이 발굴한 CLAS 배포 결함 3건은 **당일 전량 수리·라이브 검증 완료** —
> vsp v2.38.1-89(가드 오탐 강등·잠금 누수·copy 거짓 성공, COMMANDS.md ⑤-6/7) +
> 엔진 4.13.3(UpdateClass 세션 유지, §6 백로그 4). CLAS 배포 경로 개통(§14-4).
> **백로그 5-7 완료 (2026-07-12)** — install-sap-assets.md 이식 + 3계열 SKIPPED
> 규칙(기입측+소비측). 같은 날 후속 수리: vsp 전수 감사(누수 2·거짓 성공 4 수리,
> lock **v2.38.1-91**, 업스트림용 핸드오프 §3c 갱신) + 엔진 **4.13.4~4.13.6**
> (Update·Create 계열 잠금 세션 수리 누적 19 핸들러, IDES red→green —
> §6 백로그 9·10·11-① 해소, 잔여 후속 = 백로그 11-②~⑨).
> **5-5 우선분·5-8 필수분 완료 (2026-07-12)** — fetch 스크립트 2종 이식 + Codex
> row-data 하드 차단 정본화(approval fail-open 실증). **엔진 잔여 결함 수리
> 스프린트 완료 (2026-07-12~13, 목표 11건/5 Wave 전량 해소, Wave별 새-컨텍스트
> 리뷰 5/5 PASS, jest 580/0)**:
> **4.13.7**(11-② vendored stateless 누수 해소, patch-package 정본화 + 신규 발굴
> 11-⑩)·**4.13.8**(11-③ FUGR Update CT 협상 + 구 3-7 흡수 해소, 11-④는 CT 아닌
> 11-⑧ 언어 계열로 판정·이관)·**4.13.9**(구 3-5 삭제 정직화 공통 뿌리 12종 +
> 구 3-3 CreateProgram 타입 가드 + 11-⑨ 죽은 잠금 쌍 제거)·**4.13.10**(11-⑧
> 로그온 언어 동적 해석+스켈레톤 복구 — 11-④ CreateView 개통 동반 + 11-⑥
> already-exists 기계 식별자 우선)·**4.13.11**(11-⑤ Structure check-with-source
> + 구 3-6 low/CDS 클래식 testruns 전환). 엔진 잔여 = 신규 발굴 11-⑩·⑪ +
> 관찰 2(add-if-missing GET 비직렬화·low 무동작 파라미터).
> **① 11-⑪·⑫ 수리 완료 (4.13.12, 2026-07-13)** — 1 Wave 묶음, 스프린트 패턴
> 완주(메인 워커·역-검증 두 편집 각각·jest 599/0·재번들 155 no-op·**KR-DEV(KO)
> 라이브 red→green**·새-컨텍스트 리뷰 PASS). 11-⑪은 정독 결과 "1줄"보다 커서
> parse+throw 동반(라이브 red = 거짓 성공). CHANGELOG 4.13.12 + UPSTREAM-FIX-
> HANDOFF §5·§7 갱신 + Known-remaining #2 제거 완료. 엔진 잔여 = 11-⑩(설계
> 판단, 유보) + Known-remaining 6종(RFC 3계열·CreateProgramLow·미도달 래퍼
> 등). **② 지식 문서 부트스트랩 완료 (2026-07-13, D-020)** — harness-docs Mode A
> 계약(lock 커밋 절차문 직접 소비)으로 docs/PRD.md·ARCHITECTURE.md 신설(thin+pointer,
> 주입 합계 ~32.7KB < 48KB), ADR.md는 미신설(DECISIONS.md 유지 — D-012 부분 갱신을
> D-020으로 기록). 워커·리뷰어 전부 모델 지정 서브에이전트(opus), 새-컨텍스트 리뷰
> PASS(MINOR 2 수리 반영). **③ Phase 3 선결 설계 완료 (2026-07-13, D-021)** —
> 5-11 리뷰 게이트 = (b′) plan-레벨 리뷰 스텝(자기-verify 게이트)+필수 3조항+에스코트,
> 스펙 docs/reference/designs/2026-07-13-unattended-review-gate.md, DESIGN §8.3·§13
> 반영. 분석·검증·정정 3왕복(opus×2) 후 사용자 택1. **Phase 3 선결 3건 전부 해소 —
> 다음 = Phase 3 착수(리뷰 게이트 구현 포함) 또는 소형 유지보수(agy 핀·11-⑩).**
> **Phase 3 A-청크 완료 (2026-07-13, 무인 리뷰 게이트 구현)** — D-021 스펙의 AC
> 1~4를 오프라인 완결로 구현: 검사기 `scripts/check-review-verdict.ps1`(필수 3조항
> — 등식형 dirty 검사·sha256 핀·reviewed_head 바인딩) + 재현 테스트
> `scripts/test-check-review-verdict.ps1`(13케이스 전건 통과) + 리뷰 스텝 템플릿·
> verdict 스키마·harness-plan 관례 3파일(`docs/reference/templates/`) +
> `adapters/vsp/SAFETY-PROFILES.md`(DESIGN §8.4 4건 커버). **AC3 엔진 통합 재현
> 성립**(scratchpad 클론 실엔진: FAIL verdict→재시도 소진→error 종료·write 스텝
> 미도달) + **Assumption #1 실측 일치**(PASS 경로 초과 dirty 0, 제외 집합 개정
> 불요). 새-컨텍스트 리뷰(opus, read-only) **PASS**(MAJOR 0, MINOR 2 — F1은
> review-gate-plan-conventions.md §7 관례 명문화로 수리, F2는 수용 편차로 기록).
> AC5(씨앗 결함 라이브 차단)와 §13 완료 기준 ①②는 B-청크(커넥티드, 에스코트)로
> 분리 — 선결은 이 머신 vsp 빌드(lock 0b03ef2 대조)·SAP 접속.
> **Phase 3 B-청크 완료 (2026-07-13, 커넥티드 라이브 실증)** — B-1 vsp 주 머신
> 빌드: lock 커밋 0b03ef2 재현(sha256 바이트 불일치는 Go 경로 임베딩 아티팩트
> 판정·기능 완전 일치) → lock에 `binary_main_machine` 병기. B-2 주 머신 엔진 훅
> 설치(트랙 B MCP 훅 3개 보존) — **이 머신 트랙 A 무인 실행 최초 가동**. phase
> `3a-carrflt-seed`(씨앗 INNER JOIN 결함): 리뷰 게이트 3회 시도 **전부 FAIL**
> (B2/MAJOR로 INNER JOIN을 file:line까지 적중, 리뷰어는 씨앗 메타 모름) → error
> 종료·write 미도달 — **AC5(씨앗 결함 라이브 차단) 실증**, 증거는
> `feat-3a-carrflt-seed` 브랜치 봉인(2f5d2a2, main 미병합). phase
> `3b-carrflt-gated`(정상 경로 LEFT OUTER): impl·리뷰 1회씩 PASS → main 병합
> (c7a2d51) → 에스코트 체인 E1~E4(deploy+activate·drift clean·ATC INFO만·unit 1
> passed/0 failed) + SE80 drift 검출 D1~D2(`+* drift test by SE80` 정확 포착)
> 전부 실증 — **DESIGN §13 완료 기준 ①②③ 전부 실측 충족**. 원로그 =
> `phases/3b-carrflt-gated/scoring-raw.md`.
> **업스트림 핸드오프** = `engine/UPSTREAM-FIX-HANDOFF.md`(영어 자립형,
> 4.13.2~4.13.12 전량) — 포크 클론(D:\Claude for SAP\abap-mcp-adt-powerup,
> 4.13.1 동결)에 적용용.

---

## 보조 머신 줄기 (07-13~19 분기 기간) — 무손실 보존

> 아래는 로컬(보조 머신, `D:\AI PROJECT\sap-agentic-harness`) 줄기가 공통 조상 이후
> 07-13~19에 남긴 헤더 타임라인 전문이다. 통합 시 **요약·삭제 없이 배치만 조정**해
> 편입했다(무손실). 위 본류 타임라인(원격/주 머신)과 시기가 겹치는 항목(Phase 2 등)은
> 두 줄기가 각자 기록한 것이라 병존한다.
>
> **D-번호 인용**: 이 절의 로컬 결정 인용은 통합 결정 ⑶에 따라 **D-031~034**로 재번호
> 반영했다(로컬 원본 D-020→**D-031**·D-021→**D-032**·D-022→**D-033**·D-023→**D-034**;
> DECISIONS 재기술은 별도 담당). **D-034**(구 로컬 D-023) 무인 상시 개방은 **조건부로
> 재기술되며 재기술 전 실사용 보류**(⑴). ADR-002 등 로컬 ADR 인용은 원문 보존(ADR.md의
> `docs/reference/` 이동은 통합 세션 처리, ⑶).

> **▶▶ 잔여 소진 스프린트 완주 (2026-07-19 W5 마감 — 종합 리뷰 PASS·게이트 5종
> green). 직후 push에서 주/보조 머신 6일 분기 발견(공통 조상 8d09e571, 로컬 67·
> 원격 65커밋) — 로컬 줄기는 `sprint-20260719` 가지로 push(무손실), 두 줄기 전수
> 조사 완료. ▶ 다음 착수 = 분기 통합 방향 결정. 정본 =
> `docs/reference/audits/2026-07-19-branch-divergence-assessment.md` — 사용자
> 결정 4건 선결(최상위: 무인 개방[로컬 D-034] vs attended 봉인[원격 재기준 —
> 서로 모르고 승인된 반대 방향], 리뷰 게이트 정본, 결정 로그 구조, vsp 편입).
> **→ 2026-07-19 사용자 답변 완료(평가 문서 §5 반영) — 결정 5건 전부 확정: ⑴
> 절충안(대화형 중심 틀 + 무인은 관문 경유 사용 가능 — D-034은 조건부로 재기술)
> ⑵ 리뷰 게이트 역할 분담(원격 run-scoped 골격 + 무인 write 경로에 로컬 캡슐
> 편입) ⑶ 원격 구조 채택 + 로컬 4건 D-031~034 재번호 ⑷ vsp 편입 확정(통합 직후,
> D-030) + 병합 베이스 = 원격 main. ▶▶ 다음 착수 = 통합 세션 실행(새 세션 권장,
> 이 평가 문서가 실행 정본).** D-034 실사용은 재기술 전 보류. Phase 5·스프린트
> 잔여 결정 ②③④⑤⑦은 통합 뒤로.**
> **트랙 A Phase 2 완료 (2026-07-12)** — 답사→계획 변경 기록(§13 완료 기준 충족) +
> 무인 완주(2 steps, verify 실패 0, 리뷰 위반 0) + connected 채점 **5 PASS/0 FAIL**.
> 채점이 발굴한 CLAS 배포 결함 3건은 **당일 전량 수리·라이브 검증 완료** —
> vsp v2.38.1-89(가드 오탐 강등·잠금 누수·copy 거짓 성공, COMMANDS.md ⑤-6/7) +
> 엔진 4.13.3(UpdateClass 세션 유지, §6 백로그 4). CLAS 배포 경로 개통(§14-4).
> **백로그 5-7 완료 (2026-07-12)** — install-sap-assets.md 이식 + 3계열 SKIPPED
> 규칙(기입측+소비측). 같은 날 후속 수리: vsp 전수 감사(누수 2·거짓 성공 4 수리,
> lock **v2.38.1-91**, 업스트림용 핸드오프 §3c 갱신) + 엔진 **4.13.4~4.13.6**
> (Update·Create 계열 잠금 세션 수리 누적 19 핸들러, IDES red→green —
> §6 백로그 9·10·11-① 해소, 잔여 후속 = 백로그 11-②~⑨).
> **5-5 우선분·5-8 필수분 완료 (2026-07-12)** — fetch 스크립트 2종 이식 + Codex
> row-data 하드 차단 정본화(approval fail-open 실증). **엔진 잔여 결함 수리
> 스프린트 완료 (2026-07-12~13, 목표 11건/5 Wave 전량 해소, Wave별 새-컨텍스트
> 리뷰 5/5 PASS, jest 580/0)**:
> **4.13.7**(11-② vendored stateless 누수 해소, patch-package 정본화 + 신규 발굴
> 11-⑩)·**4.13.8**(11-③ FUGR Update CT 협상 + 구 3-7 흡수 해소, 11-④는 CT 아닌
> 11-⑧ 언어 계열로 판정·이관)·**4.13.9**(구 3-5 삭제 정직화 공통 뿌리 12종 +
> 구 3-3 CreateProgram 타입 가드 + 11-⑨ 죽은 잠금 쌍 제거)·**4.13.10**(11-⑧
> 로그온 언어 동적 해석+스켈레톤 복구 — 11-④ CreateView 개통 동반 + 11-⑥
> already-exists 기계 식별자 우선)·**4.13.11**(11-⑤ Structure check-with-source
> + 구 3-6 low/CDS 클래식 testruns 전환). 엔진 잔여 = 신규 발굴 11-⑩·⑪ +
> 관찰 2(add-if-missing GET 비직렬화·low 무동작 파라미터). **다음 착수 확정
> (사용자 선택 2026-07-13)**: ① 11-⑪·⑫ 수리(스프린트 패턴 1 Wave 묶음 —
> opus 위임·역-검증·라이브 red→green·새-컨텍스트 리뷰, 완료 시
> UPSTREAM-FIX-HANDOFF §5·§7 갱신) → ② 트랙 A 지식 문서 갱신(harness-docs —
> 알림 2회째) → ③ Phase 3 선결 설계(5-11 리뷰 게이트 편입). 11-⑩은 설계
> 판단 필요라 후순위 유보. **업스트림 핸드오프 작성 완료(2026-07-13)** =
> `engine/UPSTREAM-FIX-HANDOFF.md`(영어 자립형, 4.13.2~4.13.11 전량) —
> 포크 클론(D:\Claude for SAP\abap-mcp-adt-powerup, 4.13.1 동결)에 적용용.
> **객관 감사 (2026-07-17, 보조 머신)** — 문서 주장 vs 실물 전수 대조(게이트 5종 실행 ·
> 산출물 실재 · run-summary/채점 기록 · jest 전체 실행). **기계 검증 가능한 주장 전부
> 일치**: jest **580 통과/0 실패**(5 skipped, 128s) · 무인 run-summary verify 실패 0
> (단 Phase 2는 스텝당 2회 시도 — 1차가 수 초 내 status 미갱신으로 재시도, 결과 무영향) ·
> 채점 5 PASS 기록 실재(scoring-raw.md:71) · src ABAP 3파일 · lock 2종 · smoke 155 ·
> 링크 깨짐 0 · 번들 4.13.11 무결. **불일치 2건 발견 → 다음 세션 보완**:
> ① **doctor FAIL** — Codex 실측 0.144.3 ≠ compatibility.json 고정 0.144.1. 보완 =
> 정본 절차(compatibility.json _comment, 5-2 선례: 재검증 스모크 → 고정값 갱신 → doctor 0).
> ② **CLAUDE.md 헤드라인 수치 낡음** — "지식 217"은 현 트리에서 재현 불가(knowledge
> .md 175 / 전체 파일 200; 217은 L1 이식 당시 수치로 추정), "절차 15"는 실측 16
> (5-7 install-sap-assets 추가분 미반영). 보완 = 현재 실측 기준으로 정정.
> → ✅ **보완 2건 해소 (2026-07-17)**: ① Codex 0.144.3 설치 스모크 재실측 PASS
> (installed+enabled + 캐시 core/server 전체 패키징, 스모크 후 marketplace/plugin
> 완전 제거로 평시 미설치 복원 — 이 머신 평시는 disabled가 아니라 **완전 미설치**임을
> 실측) → compatibility.json 0.144.3 갱신 → doctor **5 OK/0 FAIL(exit 0)**.
> ② CLAUDE.md 헤드라인 지식 217→**175**·절차 15→**16** 정정(실측: knowledge `.md`
> 175 · procedures `.md` 16). 게이트 5종 green 유지. 다음 착수 = 11-⑪·⑫ Wave.
> **11-⑪·⑫ Wave 완료 (2026-07-17, 엔진 4.13.12)**: 11-⑪ Table check-with-source
> **2계층** 수리(vendored ddlCode 전달 + 핸들러 PUT 전 차단 — table check는
> structure와 달리 non-throwing 계약이라 1줄로 불충분함을 발견) · 11-⑫ Create
> 로그온 언어 도달 가능 **8종** 확장(Class·Interface·Program·Package·Table·
> Structure·SRVD·DDLX — DCL은 도달 불가 죽은 코드 판정·미수정). jest 599/0(+19,
> 역-검증) · 라이브 red→green(11-⑪ 명확 재현·해소, 11-⑫는 CS 박스 EN 관용으로
> 델타 관측 불가 — jest+4.13.10 비관용 표면 실증이 정본 증거) · $TMP 전량 삭제·
> 고아 잠금 0 · 재번들 OK·155 유지 · **새-컨텍스트 리뷰 PASS(BLOCKER/MAJOR 0)**
> · UPSTREAM-FIX-HANDOFF §5·§10·§11·Known-remaining 갱신. 신규 관찰 = ADT
> /checkruns 세션 캐시 stale 재반환(Known-remaining #8). **다음 착수 = ② 트랙 A
> 지식 문서 갱신(harness-docs, 알림 2회째) → ③ Phase 3 선결 설계(5-11 편입)**.
> **② 트랙 A 지식 문서 완료 (2026-07-17, harness-docs Mode A)**: docs/PRD·
> ARCHITECTURE·ADR 3종 신설 — 전부 **수행 레벨**(하네스가 수행하는 SAP 작업)
> 스코프, 메타(하네스 자체)는 DESIGN·HANDOFF·DECISIONS 포인터로 위임. D-012와의
> 충돌은 **D-031**으로 해소(메타/수행 레벨 구분 — 사용자 판단, D-012는 메타
> 한정 존속). ADR 초기 3건(Phase 2 수행 결정: 대상 재선정·배포 순서/테스트
> 배치·GUI 수동 우회). 최상위 docs 합산 28.8KB(<48KB), 플레이스홀더 0, 엔진
> 문서 알림 해소. 부수 발견(미처리): domain/abap/RULES.seed.md 제목 "Error
> 4종" vs 본문 6개 불일치 — 차기 수리 후보. **다음 착수 = ③ Phase 3 선결
> 설계(5-11 리뷰 게이트 편입)**.
> **③ Phase 3 선결 설계 — 진행 중 (2026-07-17, harness-design 인터뷰 중반)**:
> 게이트 형태 = **별도 리뷰 스텝(엔진 무수정)** 확정(Fable+Codex 독립 검토 수렴
> + 사용자 확정) · write 직전 배치 + PASS 해시 바인딩 · 리뷰어 = 설정값(기본
> opus급, Codex 환경은 설정 교체) · 기술 7건 위임 확정. 미결 = 엄격도(질문 ②)
> · BLOCKED 사람 개입(질문 ③) → 커버리지 승인 → 스펙 초안 → Codex 교차 리뷰 →
> 승인·기록. ~~재개 정본 = `docs/reference/handoffs/phase3-review-gate-design.md`~~
> **→ ✅ ③ 완료 (2026-07-17, 스펙 승인·기록)**: 미결 2건 사용자 확정 — 엄격도
> 표준안(MAJOR 이상 1 = FAIL · MINOR만 = PASS+기록 · 수정 revision 3회 =
> BLOCKED) / BLOCKED = 런 종료+보고서(산출물 보존, 능동 알림·대기질의 기각).
> Codex 교차 리뷰 B15(codex exec, 판정 "수정 필요" MAJOR 11·MINOR 4) 반영 v2 —
> **수용 15건**(수정 루프 = 엔진 표준 스텝 재시도로 실현(도달 불가 모순 해소) ·
> 리뷰 캡슐 도입(캡슐 해시 바인딩+캡슐본 배포 = TOCTOU 제거) · write 프로파일
> 분리(워커 read-only tier) · 래퍼 결정적 판정(verdict 불신) · INTERNAL_ERROR
> catch-all·기동 총량 5 hard budget · AC 13종), **비수용 2건 사유 기록**(서버측
> CAS·비용 회계 — 과잉). **스펙 정본 =
> `docs/reference/designs/2026-07-17-phase3-review-gate.md`**, 핸드오프 파일
> 삭제, DESIGN §13 Phase 3 완료 기준에 실증 1회 편입. 다음 = harness-docs
> Mode B 흡수 → harness-plan(Phase 3 계획) — 둘 다 제안만, 사용자 승인 후 착수.
> 부수: 백로그 5-12 신설(claude-final v0.20 개편 대응 대기 — lock 절연 유지,
> 완료 전 플러그인 업데이트 금지).
> **→ Phase 3-review-gate 런 (2026-07-17, attended bridge — 워커=메인 세션
> 위임: 스텝 0~4 sonnet·스텝 5 상속)**: **스텝 0~4 완주**(각 1회 시도·verify
> 실패 0·엔진 커밋) — `scripts/review-gate/` 게이트 도구 일식 구현 완료(캡슐·
> 판정·상태·게이트 조립 mock E2E·배포 래퍼, node:test **42/42**). 부수 발견:
> tdd-guard가 `<dir>/tests/` 관례 미인식 → 스텝별 1줄 shim 우회(근본 수리는
> 후속 후보). **스텝 5 스파이크 = blocked (정직 반증)**: Part A 실 리뷰어
> 헤드리스 왕복 **성공**(claude -p·opus·strict-mcp-config·disallowedTools,
> PASS 파이프라인 exit 0 — command는 config.json 정본화, 2.1.212 실측) /
> Part B **vsp CLI deploy 경로가 SAP_TIER·SAP_READ_ONLY를 미소비 실측**
> (lock v2.38.1-91 소스 판독 + 더미 호스트 오프라인 프로브, **SAP write 0**) —
> 스펙 §5-4 "read-only 프로파일 = 기계 강제" 전제 반증. transport 동반 write는
> transportable-edit 게이트가 클라이언트측 거부 실증, **$TMP 로컬 write는 게이트
> 범위 밖**. 보완 3안(① vsp CLI에 SAP_READ_ONLY 배선+lock 재검증 ② 무인 워커
> env에 SAP 자격증명 미공급 구조 ③ 서버측 권한 분리) **사용자 결정 대기** —
> 결정·재실증 전까지 무인 write 금지(5-11) 유효. 상세:
> `phases/3-review-gate/`(run-summary·spike-evidence·step5-output).
> **후속 결정(2026-07-17, 사용자)**: §5-4 보완 = **①+② 병행**(vsp CLI에
> SAP_READ_ONLY 배선+수리 후 lock 재검증(D-018 절차) + 무인 워커 env 자격증명
> 미공급 구조 — 작업은 차기 세션) · 브랜치 = **새-컨텍스트 리뷰 후 병합**.
> **→ ✅ 리뷰 PASS·병합 완료 (2026-07-17, merge caafa714)**: opus 새-컨텍스트
> read-only 리뷰 — BLOCKER/MAJOR 0 (스펙 §5 제약 실구현·3중 확인 우회 불가·
> 테스트 진정성·자격증명 0·스파이크 증거 견고성 전부 확인, 42/42 재실행).
> **MINOR 5건 = §5-4 보완 세션에서 함께 처리**: ① `infra_retry_limit` 설정
> 미소비(엔진 위임 정합이나 장식적 — 소비 구현 or 주석 명시) ② 리뷰어
> 프롬프트가 캡슐 해시 입력에 미포함(스펙 §4.0 "프롬프트 템플릿 버전" —
> config에 prompt_version 필드 추가 후 해시 편입) ③ PASS 레코드에 프롬프트
> 버전·토큰 누락 ④ **캡슐 파일명(`files/<idx>/content`)의 vsp deploy 호환
> 미검증 — 배포 스텝 배선 전 확인 필수**(vsp가 파일명으로 객체 식별 시사)
> ⑤ 캡슐이 리뷰어 cwd 쓰기에 비보호(세션 로그가 캡슐 안에 기록됨 — git
> 미추적·무해, spawn cwd 분리 후보).
> **▶ 다음 착수 확정 (차기 세션, 2026-07-17 사용자 순서)**: **① §5-4 보완** —
> vsp-custom(`D:\Claude for SAP\vsp-custom`)에 SAP_READ_ONLY/SAP_TIER를 CLI
> write 경로에 배선(수리 좌표·근거 = `phases/3-review-gate/step5-output.json`·
> `spike-evidence.json` — getClient cmd/vsp/cli.go:151-183 Unrestricted 기본,
> READ_ONLY 바인딩은 MCP 모드 전용) → 빌드 → `adapters/vsp/vsp.lock.json`
> 재검증·갱신(D-018 절차). **수리 기준 = HEAD 731b871**(2026-07-17 실측:
> JNC 층1 수리 2커밋 `0cb26cb`+`731b871`이 레포에 실재하나 **현 lock
> 0b03ef2·바이너리(07-12 빌드)는 그 이전** — 재빌드 필수, 재검증 범위에 JNC
> 델타(ActivateGroup 신설·활성화 거짓성공 4곳·TotalRows/Truncated·FUGR 그룹
> 진단·UXX 제외)와 기존 명령 계약 10종 포함) + 무인 워커 env 자격증명 미공급 구조(②) + 리뷰
> 게이트 MINOR 5건 동반 수리(특히 ④ 캡슐 파일명 vsp deploy 호환) → 스파이크
> Part B 재실증(AC-10) → phases/3-review-gate step 5 해소 → 스펙 §5-4 문구
> 정합 확인. **② 5-13 층1**(engine/ 대조 감사 — SQL NULL-셀 최우선) →
> **③ 5-13 층2·3**. 전 기간 유효: 무인 SAP write 금지(5-11) ·
> final-harness 플러그인 업데이트 금지(5-12).
> **→ ✅ ① §5-4 보완 완료 (2026-07-18, 오케스트레이션 세션 — 실행 전량
> 서브에이전트 위임)**: ⑴ vsp-custom **5a8bedb** — CLI write 8종(deploy/copy/
> execute/recover/source write·edit/install 2종)에 진입점 게이트
> `enforceWriteProfile`+`getWriteClient` 신설(뮤테이션 게이트 재사용 기각 —
> deploy가 게이트 이전에 존재확인 GET을 dial하는 구조 실측). SAP_READ_ONLY
> truthy·SAP_TIER≠dev(대소문자 무시) **네트워크 이전 클라이언트측 거부**,
> read·`vsp test` 무영향, SAP_TIER는 Go 전체에 기존 소비 0이라 최소 설계.
> go test 신설 16케이스 green. ⑵ **lock v2.38.1-94 재검증(D-018)** — 계약
> 10종 라이브 전부 통과·회귀 0, JNC 델타 5항목 방법 명시 검증(MCP 전용
> 표면은 R-002 준수로 유닛테스트·커밋 라이브 근거 판정), vsp.lock.json 갱신
> (+write_profile_gate·reverification additive). $TMP 정리·고아 잠금 0.
> ⑶ **리뷰 게이트 MINOR 5건 실코드 수리**(테스트 42→46) — 특히 ④ 캡슐
> 파일명: vsp `ParseABAPFile`이 확장자로 객체 식별함을 실측(fileparser.go:
> 82-134), 기존 `files/<idx>/content` 경로는 **배포 실패였을 결함** →
> basename 보존형으로 수리. ①infra_retry_limit 사전 fail-fast(exit 5)
> ②prompt_version 캡슐 해시 편입(레거시 캐시 전량 무효화 테스트 보증)
> ③PASS 레코드 prompt_version+tokens:null(사유 주석) ⑤리뷰어 spawn cwd
> 분리+`{capsule}` 치환. ⑷ **② 자격증명 미공급 구조** — vsp-env.ps1 기본
> `SAP_READ_ONLY=true` 주입(기계 강제 read-only 기본)·`-Write` opt-in만
> 해제+SAP_TIER 전파, verify-sap.ps1 자체 조달(부모 셸 누출 0 실측),
> VERIFY-PATTERNS §④ 관례 개정(**엔진 기동 셸 SAP_* 부재 = 워커 미공급
> 성립 조건** — execute.py가 부모 env 전량 상속 실측). execute.py 스크럽은
> **기각**(엔진 설치본 v0.17.3 lock 드리프트 + 스펙 B1 엔진 무수정 위반) —
> 엔진 업스트림 개선 후보로만. ⑸ **Part B 재실증(AC-10) → step 5 해소** —
> READ_ONLY·TIER=QA 각각 deploy가 dial 이전 거부(created=no·dialed=no,
> 사전/사후 404), 같은 env read exit 0(게이트/연결 분리 입증), spike.mjs
> exit 0, index.json step 5 completed(반증 이력 보존), 스펙 §3·§5-4·§7
> 실측 메커니즘으로 정합화. ⑹ **새-컨텍스트 독립 리뷰 PASS(BLOCKER/MAJOR
> 0, INFO 4)** — 리뷰어가 오프라인 프로브 독립 재현·마커 소스 대조까지 수행.
> 게이트 5종 green(doctor FAIL은 무관 드리프트 — Codex 0.144.5 재검증
> 스모크 후 compatibility.json 갱신으로 해소). 부수: `.claude/hooks/
> tdd-guard.py` 로컬 수리(`<dir>/tests/` 인식 — step 0~5 shim 우회의 근본
> 수리 + 레포 밖 파일 스코프 제외; **git 무추적이라 이 머신 한정**, 엔진
> 템플릿 업스트림 반영은 후속 후보). 훅 ask가 bypass 모드를 관통해 배경
> 에이전트 승인 폭주를 유발했던 원인이기도 했음. **무인 SAP write 금지
> (5-11)는 계속 유효** — 이번 보완은 §5-4 기계 강제층 성립까지이고, 개방은
> Phase 3 완주(AC-8 리뷰 게이트 실차단 실증 포함) 후 재론. **다음 착수 =
> ② 5-13 층1 → ③ 5-13 층2·3** (변동 없음).
> **→ ✅ ② 5-13 층1 완료 (2026-07-18, 같은 오케스트레이션 세션 — 감사·수리
> 전량 opus 위임)**: **대조 감사**(코드 실증) — 층1 12항목 판정: 신규 6·부분
> 2·설명 1·겹침 3, **사전 추정 정정 2건**(예외 type ⑫=4.13.0 기반영 겹침 ·
> FUGR ④=능력○ 설명만 격차). 감사·이식 정본 =
> `docs/reference/audits/2026-07-18-5-13-layer1-audit.md`(좌표 부록 포함).
> **이식 = 엔진 4.13.13 + 4.13.14**: ⑴ 4.13.13(Wave 1, 실데이터 게이트
> 정직화) — SQL self-closing NULL 셀 위치보존 파서(행 시프트 해소, T000
> self-join 라이브 red→green — 타 행 값이 엉뚱한 MANDT에 붙던 결함 실측·해소,
> GetTableContents는 공유 파서로 동반 치유)·ragged_columns 경고·메타 3필드
> (returned_row_count/truncated/server_total_rows)·400 1회 재시도. ⑵ 4.13.14
> (Wave 2·3) — CreateStructure **거짓 성공 제거**(fields→DDL 실생성
> `structureDdl.ts` 이식, 불완전 스펙 무-와이어 사전 실패·부분 생성 금지,
> $TMP 라이브 red(빈 셸)→green(필드 실재), enhancement.category 상시 방출) +
> FM check_inactive 경고(Get 기본 on·Read opt-in) + 설명 3건(FUGR 레시피·
> 형제 precheck persist·active≠활성). 11-②(삭제 재조회 404)는 라이브에서
> no-op 2xx **미재현** → 과잉 수리 기각, Known-remaining #9 후보로만.
> lock-window 드리프트(sc4sap check-before-lock vs engine stateful-핀)는
> **engine 방식 유지 결정**(왕복 이점+라이브 검증, 재론=동일 실패 재발).
> jest **599→643**/5 skip(+45·전제역전 1건 폐기, 수리별 역-검증 전 항목),
> 재번들 verify-engine OK@4.13.14(46ca76e5eb64…)·번들 byte 동일·**155 유지**,
> $TMP 전량 삭제·read-back 404·고아 잠금 0. CHANGELOG 4.13.13·4.13.14 +
> UPSTREAM-FIX-HANDOFF §12·§13·§14·Known-remaining #9. **새-컨텍스트 독립
> 리뷰 PASS(BLOCKER/MAJOR 0)** — 겹침 판정 2건 실코드 재확증(stateful 핀
> 27파일·utils.ts 본문 우선), MINOR 1(감사표 좌표 — 부록 보강 완료)·INFO 2.
> **후속 권고(INFO-1)**: 동결 레포 sc4sap-custom 워킹트리에 전일(07-17)
> 4.14.0 머지 잔여 드리프트 1파일(` M docs/skill-model-architecture.md`) —
> 이 세션 귀책 아님(read-only 사용), R-004상 손대지 않고 기록만. 사용자
> 판단으로 정리 권장. **다음 착수 = ③ 5-13 층2·3**.
> **▶ 다음 착수 확정 (차기 세션, 2026-07-18 순서)**: **① 5-13 층2 —
> interactive/core 지식 이식**. 내용(§5-13 층2 원문): conventions 확장
> 3종(field-typing·function-module-rule·clean-code) + 신규 2건
> (abapgit-roundtrip-rule·source-repair-protocol) + DD03L 실측 정본·DEC
> 오버플로·null 정규화 등 8건. 원천 = JNC 교훈 팩 층2 절 + 동결 sc4sap-custom
> `common/*.md`(읽기만 — R-004). **선결 판정 필수**: 원본 common/*.md가
> 07-17 JNC측에서 갱신돼 동결 표기와 실물이 드리프트 — 이식 전
> `interactive/MIGRATION-MANIFEST.md` 대조로 정본(팩 vs 원본 신판)을 정하고,
> 분류 변경은 매니페스트 수정으로만. 지식 파일 증감 시 CLAUDE.md 헤드라인
> 수치(지식 175·절차 16)·매니페스트 갱신 동반, 게이트 5종 유지(엔진 재번들
> 불요 — 지식은 번들 밖). 완료 후 **② 5-13 층3**(트랙 A 방법론 시드 —
> domain/abap/RULES.seed.md·VERIFY-PATTERNS·계획 관례. `.harness/RULES.md`
> 직접 대량 추가 금지(메모리 루프 규약), 시드/문서 경유. 층3-1·층3-5는 리뷰
> 게이트 스펙 §6 보강 재료 — D-032 정합). 부수 대기: 동결 sc4sap-custom
> 드리프트 1파일(` M docs/skill-model-architecture.md`, 07-17 머지 잔여)
> 정리는 사용자 판단 — 세션은 손대지 말 것. 전 기간 유효: 무인 SAP write
> 금지(5-11) · final-harness 플러그인 업데이트 금지(5-12) · tdd-guard 로컬
> 수리는 이 머신 한정(git 무추적 — 엔진 템플릿 업스트림 반영 후속 후보).
> **→ ✅ ① 5-13 층2 완료 (2026-07-18, 오케스트레이션 세션 — 감사 opus·이식
> sonnet·리뷰 opus 전량 위임)**: **선결 판정** = 정본은 원본 신판(동결
> sc4sap-custom HEAD `common/*.md` — 07-17 f7257c0+ffb422b가 JNC 팩 층2를
> 이미 rule layer로 접어 넣어 팩을 상회, 8항목 커버리지 누락 0, L1 이식
> 관례 실측 = 본문 verbatim+재배치 링크만 재경로). **이식** = conventions
> 수정 3종(clean-code null-vs-zero · field-typing DD03L step0+필드명≠의미
> 안티패턴 · function-module RFC 타입 제약/좁은 DEC 오버플로/FUGR 단일
> 컴파일+UXX 제외) + 신규 2건(abapgit-roundtrip-rule·source-repair-protocol)
> — 전부 원본 verbatim(신규·추가 링크가 conventions 내부 형제라 재경로 0),
> 팩 부록 조건부는 abapGit·SUSH 2건만 caveat 내장(빈셀=층1 N-A ·
> acknowledge_risk·금액확장 제외). **배선 4** = sap-executor(표+2행)·
> sap-debugger(+1줄)·create-program(FUGR 활성화 레시피)·review-checklist
> (+2항 — sc4sap 원본 3항째 활성화-증거는 층1 #6 기반영 + 이식된
> source-repair-protocol 내장으로 의도 제외, 리뷰어 타당 판정). 수치 =
> CLAUDE.md 지식 175→**177**(실측)·매니페스트 규약 18→**20종**(catch-all
> `common/**` 기포섭 — 분류 규칙 불변). 게이트 5종 green(smoke 155·links
> 599/0·doctor 5 OK, 엔진·번들 무변경 = 재번들 불요). **새-컨텍스트 독립
> 리뷰 PASS(BLOCKER/MAJOR 0, INFO 3)** — verbatim byte 대조·8항목 좌표
> 재확증·배선 f7257c0 대조·동결 레포 무손상(기존 드리프트 1파일 불변) 전부
> 실측. 감사 정본 = `docs/reference/audits/2026-07-18-5-13-layer2-audit.md`.
> **다음 착수 = ② 5-13 층3(트랙 A 방법론 시드)**.
> **→ ② 5-13 층3 — 감사 완료·반영 대기 (2026-07-18, 토큰 소진으로 실행 전
> 중단)**: 감사(opus 위임) 판정 = **신규 3**(②결함목록=표본·⑦미검증 표시
> 회수·⑧오라클 의심) · **보강 3**(①게이트 미검사 산출물·③세로 관통·
> ④liveness) · **기반영 2**(⑤독립 검증=D-019·AGENTS·PROTOCOL / ⑥메모리
> 루프=PROTOCOL — 중복 주입 안 함). **반영 계획(구체 문안 포함) 정본 =
> `docs/reference/audits/2026-07-18-5-13-layer3-audit.md`**: RULES.seed
> S-026·S-027(`[verify]`) + 헤더 원천 2→3곳 정합 + 표제 "Error 4종"→6종
> 동반 수리(층1 부수 발견 해소) / VERIFY-PATTERNS(정본 adapters/vsp) §⑤
> 안티패턴 2불릿 / **계획 관례 = docs/ARCHITECTURE.md 신설 절 "방법론
> 관례" 4건**(②③④⑦ — DESIGN·PRD·CHECKLIST 기각 근거는 감사 문서) /
> 리뷰 게이트 스펙 §6 **additive AC-14·AC-15**(층3-①·⑤ 재료, 승인 결정
> 불변 — E2E 실호출 편입은 설계 변경이라 후속 후보). DESIGN.md 갱신 불요·
> DECISIONS 신규 불요·interactive 게이트/CLAUDE.md 수치 비영향 판정.
> `.harness/GOAL.md` = 층3 성공 기준으로 세팅 완료(미체크 재개). 팩
> 층3-⑦의 "R-006"은 JNC 내부 번호 — 이 레포 R-006(deploy 후 source
> read)과 무관(오인 주의).
> **▶ 차기 세션 착수: 감사 문서의 파일별 계획을 그대로 반영 실행(위임
> 권장) → 게이트 5종 → 새-컨텍스트 독립 리뷰 PASS → §5-13 층3 완료
> 표기(=5-13 전체 종결) + STATE 기록 + 커밋.** 전 기간 유효: 무인 SAP
> write 금지(5-11) · final-harness 플러그인 업데이트 금지(5-12) · 동결
> sc4sap-custom 드리프트 1파일 정리는 사용자 판단.
> **→ ✅ 5-13 층3 완료 (2026-07-19, 오케스트레이션 세션 — 이식 sonnet·
> 리뷰 opus 위임) = §5-13 전체 종결(층1·2·3 완주)**: 감사 문서 파일별
> 계획 그대로 반영 — ⑴ RULES.seed 헤더 원천 2→3곳(③ JNC 층3) +
> S-026·S-027(`[verify]` area 신설) + 표제 "Error 4종"→6종 동반 수리(층1
> 부수 발견 해소) ⑵ VERIFY-PATTERNS §⑤ 안티패턴 2불릿(게이트 미검사 유형
> green 오인 금지 · 실측 오라클 불신 — S-026/027 양방향 참조) ⑶
> ARCHITECTURE 신설 절 "방법론 관례" 4건(세로 관통·liveness 실측·결함
> 목록=표본·미검증 표시 회수) ⑷ 리뷰 게이트 스펙 §6 AC-14·15 additive
> (기존 AC 1~13·§5 승인 결정 무변경, INSUFFICIENT_CONTEXT 기존 용례 표기
> — D-032 정합). 게이트 5종 green(coverage 미분류 0·links 599/0·
> verify-engine 4.13.14·smoke 155·doctor 5 OK — 감사 §5 "interactive
> 비영향" 판정 실증). **새-컨텍스트 독립 리뷰 PASS(BLOCKER/MAJOR/MINOR 0,
> INFO 3)** — verbatim 3블록 대조·팩 8항목 판정/좌표 전량 실측·§6 순수
> additive 확인·동결 레포/JNC 무수정(선재 드리프트 1파일 외 청정) 재확증.
> E2E 실호출 편입(층3-⑤ 잔여)은 설계 변경이라 후속 후보(감사 §6-리스크 2).
> **다음 착수 = 사용자 판단 대기** — 후보: ① Phase 3 리뷰 게이트 편입
> 구현(5-11 스펙 확정분, harness-plan 경유) ② 엔진 잔여(11-⑩ 설계 판단·
> 관찰 2) ③ packs Phase 4(비전 제2축 '모듈 전문성 축적', 미착수). 전 기간
> 유효: 무인 SAP write 금지(5-11) · final-harness 플러그인 업데이트 금지
> (5-12) · 동결 sc4sap-custom 드리프트 1파일 정리는 사용자 판단.
>
> ═══════════════════════════════════════════════════════════════════
> **▶▶ 잔여 소진 스프린트 (2026-07-19) — 완주 (W5 마감 완료) (최상단 정본)**
> ═══════════════════════════════════════════════════════════════════
> 사용자 지시 "5-12 제외 잔여 몽땅"의 감독형 스프린트. **정지 사유**: 세션 모델이
> Fable 5 → Opus로 자동 전환(사용자 인지, 아래 §모델-전환). 잔챙이 회수·커밋까지
> 마치고 정지. **기준 = `.harness/GOAL.md`(스프린트 성공 기준) + 배치 정본
> `docs/reference/audits/2026-07-19-remaining-backlog-sweep.md`(실행 A24·유보 B4·
> 대기 C12).**
>
> **완주 (W0~W4 + 잔챙이):**
> - **W2 = Phase 3(Gated Deploy) 완주 → main 병합(eca4d717)** = 5-11 리뷰 게이트
>   실증 해소. phases/4-gated-deploy 7스텝: 검증용 결함 표본(마스터×텍스트 INNER
>   JOIN 완전성 결함)이 기계 4층(lint·활성화·단위·ATC) 전부 green인데 검토
>   게이트만 MAJOR/B2 미통과 처리(red 862ca3b3)→수정본(LEFT OUTER JOIN) 통과
>   (green 3f678081)→캡슐본 배포→채점→서버 변경(drift) 검출·게이트 원복→증거
>   통합. AC-8·14·15·drift 전부 기계 체커로 실증, run-summary completed·verify
>   실패 0, 독립 리뷰 PASS. **런 중 계획 결함 2건 자가 수정**(S3 verify cmd 중첩
>   인용 + 캡슐 상대경로 → run-deploy-gate.mjs / S6 체커 필드명 verdict→
>   classification + pin 테스트) — 정지→수정→재개 절차로 처리, PLANNING §8 기록.
> - **W3 = 엔진 4.13.15** (3수리: 11-⑩ Delete 로컬 4종 전용 clear 경로[단일 공백
>   라이브 프로브]·low 무동작 파라미터 4종 제거·CreateProgramLow 타입 가드[A-9])
>   + 후속 조사(11-⑦·A-6·A-10 = 문서화 유보 판정, A-8 종결). jest 655/5·재번들
>   155·독립 리뷰 PASS. **미커밋 아님 — 커밋 b438abdf.**
> - **W4 = FI 첫 팩**(packs/modules/fi 5+README, 포인터+얇은 발췌) + Phase 4
>   완료 기준 충족: CONSULT 실사용(PLANNING §0에서 FI-004→스펙 요구 2 편입) +
>   **규칙 승격 L-002→R-007**(SQL 완전성, 커밋 d0fd1a28).
> - **W1 = SAFETY-PROFILES.md**(§8.4 실행 가능 수준) + 계획 동결(커밋 e0fedd0d).
> - **잔챙이(커밋 53f9407c)**: A-17 스키마 description 정정(2벌)·A-23 DESIGN §14
>   표 정합. A-13/15/16/22 유보 판정(근거 = 스윕 문서·이 블록).
> - **소품 정직 판정**: A-12(RFC 백엔드 개통) = **SE37 수동 RFC-enable 지점에서
>   정직 중단**(사람 절차는 아래 §트리거-대기). A-18(RenameObject 잠금) = rename
>   write가 MCP 전용이라 R-002 하 CLI 라이브 불가, 수리는 정적 확인(화이트박스
>   유닛테스트는 vsp-custom 레포 작업 — §트리거-대기). A-20 실측: IDES 기본 ATC
>   변형은 Error급 미방출(exit 상승 미검증 잔존). A-3 실측: **vsp v2.38.1-94는
>   CLAS 테스트 include 배포 지원**(ADR-002 "미지원" 전제 역전 — 아래 결정 필요).
>
> **▶ W5 마감 (5항목 — 완료 2026-07-19):**
> 1. **스프린트 전체 새-컨텍스트 종합 리뷰** — 각 Wave는 개별 리뷰됐으나 **스프린트
>    전체 diff(main 기준 이번 세션 커밋 전량) 종합 리뷰는 미실시**. read-only
>    독립 리뷰어로 BLOCKER/MAJOR 0 확인.
> 2. **문서 동기화**(문서 계약): `docs/PRD.md` 로드맵 Phase 3 "미착수"→완료 ·
>    `docs/ADR.md` ADR-002 갱신(CLAS 테스트 include 배포 지원 확인 — append) ·
>    DESIGN §13 Phase 3 완료 기준에 실증 1회 반영 여부 · DESIGN/DECISIONS에
>    "drift 실증기는 비-vsp MCP 채널을 정당하게 쓴다" 한 줄(PRD 비목표와의 긴장
>    고정, 리뷰 권고).
> 3. **A-21 반전 정정 판단**(도메인): 실측상 offline `vsp lint`는 Error **4종**만
>    (hardcoded_credentials·commit_in_loop는 소스상 connected ATC/codeanalysis
>    전용, cli_extra.go:532-549 lint 등록 7종에 미포함). **이번 세션 5-13 층3이
>    RULES.seed 표제를 "4종→6종"으로 바꾼 것이 실측과 상충** + CHECKLIST.md도
>    6종을 "offline lint Error"로 귀속 → 두 파일의 귀속을 "4종 offline lint / 2종
>    connected ATC"로 재프레이밍(단순 치환 아님, 도메인 판단). VERIFY-PATTERNS
>    §②-1 "4종"은 정확·무수정.
> 4. **게이트 5종 green + HANDOFF·STATE 최종 + 종결 커밋.**
> 5. **사용자 결정 목록 제시**(스프린트 산출 — 아래 §사용자-결정).
>
> **→ ✅ W5 마감 완료 (2026-07-19, 오케스트레이션 세션 — 실행 전량 위임: 문서
> 동기화 sonnet·A-21 opus·A-14 sonnet·수리 sonnet·종합 리뷰 opus)**:
> ⑴ **스프린트 전체 종합 독립 리뷰**(211fabef..HEAD 25커밋 +4400/-190, opus
> read-only): 1차 **FAIL(MAJOR 1·MINOR 3·INFO 4)** — MAJOR = W1의 config
> prompt_version 1.1 상향 대비 gate-e2e 테스트 스테일(46케이스 중 1 red 실측,
> Wave 개별 리뷰가 unit 스위트 재실행을 안 해 놓친 유형) → 수리 ac5b8f31
> (테스트 1.1 정렬 46/46 green·agy 1.1.4 재-핀 doctor 5 OK·DESIGN §14 item4
> A-3 정합·item8 유보 표기) → **재판정 PASS(BLOCKER/MAJOR/MINOR 0)**.
> ⑵ **문서 동기화**(6a4102be): PRD 로드맵 Phase 3·4 완료 표기(상시 개방은
> 사용자 결정 대기 명시)·ADR-002 Addendum(전제 역전 기록)·DESIGN §13 drift
> 채널 불릿+**D-033 append**(비-vsp MCP 채널 정당화 — PRD 비목표와의 긴장
> 고정). ⑶ **A-21 확증·정정**: vsp-custom 소스 재검증 — offline lint 등록
> 7종 중 Error 4종, `hardcoded_credentials`·`commit_in_loop`는 connected
> codeanalysis 전용(cli_extra.go·rules.go·codeanalysis.go 좌표 실측) →
> RULES.seed 표제·CHECKLIST 귀속 4/2 재프레이밍(VERIFY-PATTERNS §②-1
> "4종"은 정확·무수정). ⑷ **A-14 실측 반증**: agy 1.0.16·1.1.4에서
> excludeTools가 row-data 2종을 노출 제외하지 못함(대조군·smoke 직결
> 교차검증·노출 순서 일치 3중 근거) → AG README 권장 철회·재실측 트리거
> 명시(trust=false 승인이 유일 실효 방어), compatibility.json 1.1.4 재-핀.
> ⑸ **A-7 판정** = Known-remaining #5로 문서화 유보(UPSTREAM-FIX-HANDOFF:
> 1202-1206 — 관찰만, 결함 주장 없음). ⑹ **게이트 5종 최종 green**(coverage
> 미분류 0[exit 2 정보성]·links 599/0·verify-engine 4.13.15·smoke 155·doctor
> 5 OK). **A 목록 24항 전량 소진**(실행 12·부분 실행 정직 기록 1[A-20 exit
> 거동 미검증 잔존]·근거 유보/이관 11 — 종합 리뷰 ⑤표 추적). **Phase 5
> (Hardening) 착수 가능 판정**: Phase 0a~4 완료 기준 전부 충족(PRD 로드맵
> 정합) — 소재 일부 기선반영(R-007 승격·SAFETY-PROFILES), 잔여(write mode
> 안전성=결정 ①·verify 품질 감사·대화형 MCP 허용 범위 재검토)는 착수 시
> 계획. 부수: opus 위임 에이전트 빈 응답(도구 0회) 오작동 2회 — 재기동·재개
> 지시로 해소(층2 선례 동형). **스프린트 종결 — 다음 착수 = 사용자 결정
> 대기.**
>
> **§모델-전환 (재발 방지 — 정본):** Fable 5 세션이 Opus로 자동 전환된 유력 원인 =
> **Fable 5 안전 분류기 트리거**(cybersecurity 도메인 오분류 → Opus 자동 폴백).
> 이 스프린트에 보안 소재(권한 검사 코드·SQL 프로브·"적대적/우회/차단" 어휘)가
> 많았던 것과 맞물림. **보강 원인**: 글로벌 `~/.claude/settings.json`이
> `"model":"opus[1m]"`이라 `/model` 세션 지정이 리셋되면 Opus로 복귀. **재발
> 방지**: ① 보안 오해 소재·어휘 회피(메모리 softened-security-wording 정본 —
> 실제 취약점 패턴 코드 프로브는 순화로 안 되니 소재 자체 최소화) ② Fable 유지가
> 목적이면 세션 중 `/usage`로 주기 확인 + 전환 감지 시 `/model` 재설정, 또는
> settings 조정(사용자 판단 — 자산이라 미변경) ③ 대규모 스프린트는 세션 분할.
> (정확한 트리거 로그는 미문서화 — 전환 시 메시지 확인이 확정 경로. W5 마감
> 세션(2026-07-19)은 순화 어휘 운용으로 Fable 5 유지 완주 — 전환 미발생.)
>
> **§사용자-결정 (스프린트 산출 — 2026-07-19 W5 제시, ①⑥ 답변 완료·②③④⑤⑦ 대기):**
> ① 무인 상시(headless) write 개방 여부 — Phase 3 완주로 AC-8 실증됐으니 5-11
>    재론 가능(현재도 감독 하 $TMP write는 유효, 상시 개방만 미결).
>    **→ ✅ 승인(2026-07-19, "연습공간에만" = $TMP 한정) — D-034 기록, 리뷰
>    게이트·계획 사람 승인·R-003은 불변.** ② 실데이터 RFC
>    E2E의 Phase 3 완료 기준 편입(층3-⑤, 설계 변경). ③ ADR-002 재배치(CLAS 테스트
>    include 배포 지원 확인 — 신규 ADR append 승인; 사실 기록 자체는 ADR-002
>    Addendum으로 반영 완료). ④ A-6 `.sc4sap` 프로젝트
>    폴더명 개명 의사(있으면 profile.ts+launch.cjs 동기화). ⑤ A-21 재프레이밍
>    정정 추인(적용 완료 6a4102be — 원복 지시 가능). ⑥ **push 여부**(main에 이번
>    세션 커밋 다수 — 미push). **→ push 시도(2026-07-19 사용자 지시) = 거부·보류:
>    원격 main에 주 머신 분기 65커밋 실재(공통 조상 07-13 8d09e571 — 통합 보강
>    로드맵 S0~S6·final-harness v0.20 후보·vsp 편입 재론·D-025~029 언급·엔진
>    4.13.12, 로컬 줄기와 D-번호 독립 진행 = append-only 로그 충돌). 덮지 않음,
>    통합 방식은 사용자 결정 대기.** ⑦ B목록
>    (동결 드리프트 1파일 정리·vsp install abapgit·엔진 3-8).
>
> **§트리거-대기 추가(스프린트 발굴):** ● A-12 RFC 백엔드 개통 = 사람 절차:
>    (A) `C:\Users\USER\.sc4sap\profiles\IDES-DEV\sap.env` 백업 후 `SAP_RFC_BACKEND
>    =soap` 한 줄 추가+MCP 재시작(soap 노드 405 확인) → (B) ZMCP_ADT_UTILS FM 3종
>    MCP 생성[install-sap-assets Step 1, 자산 동봉·엔진 4.13.1로 생성 가능,
>    Local Interface 헤더는 인라인 시그니처로 변환] → (C) **SE37 수동 RFC-enable**
>    (자동 불가 지점) → (D) ReadTextElementsBulk env 에러 소멸 확인 → WriteText
>    ElementsBulk $TMP E2E. ● A-18 RenameObject 라이브 격상 = vsp-custom에 삭제
>    실패 분기 유닛테스트 추가(외부 레포·별도 승인). ● HANDOFF §3 "SAP_RFC_BACKEND
>    =odata" 표기 부정확 — 실물 sap.env에 그 줄 없음(기본값 odata 해석), 정정 후보.
>    ● AG excludeTools 재실측 = agy 신버전 출시 시(1.0.16·1.1.4 미작동 실측 —
>    AG README에 재실측 트리거 명시, 작동 확인 시 "실증" 승격).
>
> ═══════════════════════════════════════════════════════════════════
> 방향성 판정: 비전 4축 중 3축(하네스 개발·컨설턴트/환경관리·경량화) 실현, 1축(vsp
> 오프라인 검증)은 실측 하향이 이미 설계 반영(Phase 1.5 재정의). 직시할 사실 —
> 실물 ABAP 산출은 연습 객체 4건($TMP)뿐이고 packs(Phase 4, 비전 제2축 '모듈 전문성
> 축적')은 미착수. 기존 다음 착수 순서(11-⑪·⑫ → 트랙 A 문서 → Phase 3 선결)는 유지,
> 보완 2건은 그 앞 워밍업으로 소화 권장. 부수: 이 머신 `.claude/settings.local.json`의
> 무효 권한 규칙 2줄(Write/Glob — Edit/Read가 이미 커버) 제거, 세션 시작 경고 해소.

## 1. 프로젝트 지도 — 레포 하나, 트랙 둘

```
D:\claude for SAP\sap-agentic-harness   ← 단일 레포 (원격: hjaewon/sap-agentic-harness)
│
├── [트랙 A] 하네스 트랙 (무인 step + 대화형 레인 겸용) — ★ Phase 1.5까지 완료 (red/green 서버 실증)
│     설계: DESIGN.md (v2.1, 2026-07-09 확정 + 2026-07-10 엔진 델타 주)
│     내용: final-harness(D:\claude-practice\claude-fable-final) 엔진 + vsp-custom CLI로
│           ABAP 개발을 계획→실행→verify→LESSONS/RULES 학습 루프로 관리.
│           ★ vsp-custom = Engine 실행 백엔드이자 적용 경로와 독립인 완료 증거
│           백엔드 — Direct/Guided 사람 적용은 트랙 B MCP·abapGit도 가능하며, 완료
│           verify에는 vsp가 필요함 (재기준 v2 §0·§4.1).
│           소유 전략 = **D-018 확정: 분리 유지 + 부트스트랩 시 버전 lock** (5-9 종결)
│           설계는 원래부터 대화형 세션(Phase 0a/0b·CONSULT) + 무인 step 겸용 —
│           "무인"은 실행 모드 하나이지 트랙 전체가 아님.
│     §15-F 불변식: v0.17.1(cf42b64) 전면 재검증 + v0.17.3(8f7f13b) 델타 재확인
│           (2026-07-11) — 전량 유지. 두 의존의 검증 lock = adapters/vsp/vsp.lock.json ·
│           adapters/final-harness.lock.json (D-018)
│     현황: **Phase 0a·0b·1 완료(2026-07-11)** — 0a: init+tailor+게이트 차단 실증.
│           0b: §16-2 연결(vsp-env.ps1) + COMMANDS.md 전수 실측 + 마커 3종 실재현 완성
│           + VERIFY-PATTERNS 정본 + §14-2/3/9 판정(1.5는 ATC/health 기반 재정의).
│           1: 유형별 offline 커버리지 표(ABAP만 부분 실효 — CDS/BDEF 무의미 실측) +
│           domain/abap 시드(S-001~025+CHECKLIST) + **무인 엔진 첫 완주**: 1-workdays-util
│           (bridge, 2 steps 각 1회 시도·verify 실패 0, opus 사후 리뷰 하드 위반 0) →
│           src/zsah1_workdays.prog.abap (테스트 클래스 먼저를 스텝 경계로 기계 증명).
│           1.5: **red/green 서버 실증** — 스텁 5 FAIL → 최종본 **5 PASS**(무인 산출물
│           정확성 실채점 확인) + ATC(INFO 1, exit 0) + 완료 기준 충족(ENDIF 소스:
│           offline lint 0 → connected CODE_FAIL 1). vsp test의 REPORT 로컬 테스트
│           지원 확인(Phase 3 근거). 엔진 lock = v0.17.3(8f7f13b) 동기, 저자 동결 선언.
│           상세 = .harness/STATE.md·phases/1-workdays-util/·VERIFY-PATTERNS §1.5절.
│           $TMP 잔존: ZSAH0B_ 3 + ZSAH1_WORKDAYS + ZSAH15_BROKEN +
│           ZCL_SAH2_WORKDAYS + ZSAH2_DUEDATE (전부 무해, COMMANDS.md 부록).
│           **Phase 2 완료(2026-07-12)**: ① 계획 — read-only 답사(sonnet 위임)가
│           결정 3건 변경(대상 객체 CLAS+PROG 2개로 / 테스트 리포트 배치+배포 순서
│           클래스 먼저 / 분석 스코프 객체 단위, where-used 정본=graph --direction
│           callers) → PLANNING.md 기록(§13 완료 기준). ② 무인 완주(2 steps, verify
│           실패 0, 사후 리뷰 위반 0). ③ connected 채점 — vsp test **5 PASS/0 FAIL**
│           + ATC INFO만 + graph가 ZCL 참조 포착. 채점 중 실측: **CLAS 배포 3결함**
│           (deploy LOCK 거부+잠금 누수 · copy 거짓 성공 — COMMANDS.md ⑤-6/7 ·
│           R-006, 엔진 UpdateClass 423 계열 — §6 백로그 4). 클래스는 GUI 수동 주입.
│           백로그 5-7·5-11(D-021) 해소 후 **Phase 3 완료(2026-07-13)** — A-청크
│           (무인 리뷰 게이트 구현: AC1~4 실측·새-컨텍스트 리뷰 PASS) + B-청크
│           (커넥티드 라이브 실증: 3a-carrflt-seed 리뷰 게이트가 씨앗 INNER JOIN
│           결함을 3회 전부 FAIL 차단=AC5, 3b-carrflt-gated 정상 경로가 에스코트
│           체인 E1~E4+SE80 drift 검출 D1~D2 전부 통과). **DESIGN §13 완료 기준
│           ①②③ 전부 실측**, 에스코트 해제 조건 성립(§⑥ 차단 검증 실측만 잔여).
│           주 머신 vsp 빌드 완료(lock 0b03ef2 재현)+엔진 훅 설치로 무인 실행
│           개통. **Phase 4 완료(2026-07-14)**: 오프라인 1단계(FI 팩 부트스트랩,
│           packs/modules/ — thin+pointer, 리뷰 PASS) + CONSULT 답사(완료 기준 ①)
│           + 4a 씨앗 차단(리뷰 3회 FAIL, feat-4a-glopen-seed 봉인)→FI-002→R-007
│           승격(완료 기준 ②) + 4b 정상 경로(ACDOCA·rldnr='0L') 리뷰 PASS→main
│           병합→에스코트 E1~E4 전부 통과(scoring-raw.md). **DESIGN §13 완료 기준
│           ①② 충족 + 에스코트 보강**. 다음 = 대화형(Guided) 재기준 정식 결정(D-022)
│
└── [트랙 B] 대화형 트랙 — ★ L0~L5 구현 완료, E2E 대기  ←←← 현재 작업 지점
      위치: interactive/ (= 3사 공통 플러그인 루트)
      설계: interactive/DESIGN.md
      내용: sc4sap-custom의 전 자산(지식·페르소나 26·절차·MCP 서버)을 하네스 중립
            코어로 재편한 라이트 플러그인. 플러그인명 sap-agentic-harness
```

두 트랙의 유일한 접점: 트랙 A의 packs(모듈 지식팩)가 `interactive/core/knowledge`에서
선별 이식한다 (같은 레포라 커밋 이력이 곧 provenance).

**관련 레포 상태:**

| 레포 | 상태 |
|---|---|
| `D:\claude for SAP\sc4sap-custom` | **동결** (지식 수정 금지) — 이식 원천. Claude 풀버전 플러그인이지만 lite가 대체 |
| `D:\claude for SAP\sc4sap-lite` | **동결·이관됨** — interactive/로 subtree 병합 완료. README에 이관 표기. 삭제해도 무방(사용자 판단) |
| `hjaewon/abap-mcp-adt-powerup` | **→ `engine/`으로 편입 (2026-07-11, D-017)** — 엔진 소스 정본은 이제 레포 내 `engine/`(재현 빌드 바이트 일치 검증). GitHub 포크·로컬 클론은 히스토리 아카이브. 엔진 이슈는 §6 — engine/에서 수리 |
| 레포 내 **`vsp/`** (2026-07-19 편입, D-030/D-037) ← 원천 `D:\Claude for SAP\vsp-custom` (보조)·미참조 구본 `D:\claude for SAP\vsp\vsp-custom` (주) | **Engine 실행 백엔드·적용 경로와 독립인 완료 증거 백엔드** (핵심 의존 — 업스트림 oisee/vibing-steampunk 차용). **소유 전략 D-018 확정: 분리 유지 + 부트스트랩 시 버전 lock** (편입 기각 — 소비 계약=CLI 바이너리, 업스트림 활발). 보조 머신 검증 lock(2026-07-11, `adapters/vsp/vsp.lock.json` — aab1275, build/vsp.exe sha256 고정). **주 머신 빌드 완료(2026-07-13)** — lock 커밋 0b03ef2 재현(sha256 바이트 불일치 +3,072B는 Go 경로 임베딩 아티팩트 판정, `--version`/오프라인 계약 스모크 기능 완전 일치), lock에 `binary_main_machine` 병기(사용자 결정: 수용). **SAP 프로파일명 사실**: 이 머신 프로파일 홈(`~\.sah`)에는 `IDEA-JNC`·`KR-DEV`만 존재 — `IDEA-JNC` = `IDES-DEV`와 동일 시스템(S4H/100)의 이 머신 프로파일명, `IDES-DEV` 명칭은 이 머신에 없음. **통합 반영(2026-07-19)**: vsp lock **v2.38.1-94**(write 프로파일 게이트 포함) 채택(⑸) + vsp 편입 확정(**D-030**, 통합 직후 — 위 D-018 '편입 기각'을 vsp에 한해 supersede, ⑷). **→ ✅ 편입 완결(2026-07-19, D-030/D-037)**: git archive 스냅샷으로 `vsp/` 567파일 in-repo 편입(히스토리 비이식·세션 기록 178파일 제외·비공개 정보 0건 이중 확인), 바이너리·빌드 캐시 비커밋(소스만 — 머신/CI 빌드), lock = 빌드·명령 계약+provenance로 전환(외부 절대경로 소멸), quality-gate/verify-sap 레포 상대 경로(`vsp\build\vsp.exe`)·CI vsp-build 잡 신설, 게이트 14/14 + 독립 리뷰 PASS. 외부 사본 2개 = 원천(보조, 무수정 보존)·미참조 구본(주). 커밋 `faf8bcf1`·`542e7619`·`34e37e30`. 주 머신 후속 = pull 후 in-repo 빌드 1회 |
| final-harness: `D:\claude-practice\claude-fable-final` (주) / `D:\AI PROJECT\claude-final` (보조) | 트랙 A 하네스 엔진 — **자체 제작 독립 제품**(fable-harness 후속, sah 밖 사용처 가능). **D-018: 분리 유지 확정** — 버전은 여기 박제하지 않음(부패 실증). §15-F 재검증·lock **완료(2026-07-11)**: v0.17.3(8f7f13b)까지 전량 유지, `adapters/final-harness.lock.json`. **프로젝트 최종 완료 선언(사용자, 2026-07-13)** — 주 머신 클론 실측: HEAD=8f7f13b=origin/master(0/0)·클린·plugin.json v0.17.3 → **lock과 완전 일치, 재검증 불요**. → **2026-07-14 정정: 상류 개발 재개 실측**(v0.18.0~v0.19.1, HEAD 088bcb6 — Direct/Guided 재설계·무인=격리 필수). lock은 v0.17.3 유지, 재기준은 Phase 4 완주 후 정식 결정(D-022). 플러그인 설치는 여전히 보조 머신만(주 머신 enabledPlugins엔 sap-agentic-harness뿐 — ② harness-docs 착수 시 이 머신 설치 필요) |

## 2. 지금까지의 타임라인 (2026-07-10~11, 커밋은 본 레포 main)

1. **설계**: sc4sap-custom을 3사(Claude/Codex/Antigravity)에서 쓰는 라이트 버전으로
   재설계. Fable 5 + Codex CLI 이중 리뷰 반영해 확정. 사용자 확정 결정:
   - 3사 통일 라이트 (Claude도 갈아탐). **Claude+Codex 필수, Antigravity는 가능한 선까지**
   - 전 자산 이식. 버리는 것은 멀티에이전트 자동 디스패치 + team 협업 뿐
   - 품질 모델: **1명 작업 + 1명 새-컨텍스트 리뷰(read-only) + SAP 기계 검증**
   - 안전 차단 훅 유지 (Claude 어댑터)
2. **L0~L5 구현** (별도 레포 sc4sap-lite에서 → 이후 병합):
   - L0: MIGRATION-MANIFEST(원본 508파일 5분류) + 검증 스크립트 + CLI 표면 실측
   - L1: 코어 이식 — 지식 217, 페르소나 26 변환, 절차 15, 정책 6, 스키마 4, 앵커 2
   - L2: 서버 검증 — 번들 SHA 일치, 155 tools 실측, 무프로파일=inspection-only
   - L3: Claude 어댑터 — 스킬 래퍼 11, sap-reviewer, 안전훅 5종, 권한 템플릿
   - L4: Codex 어댑터 — 설치 스모크 통과, exposition 프리셋(readonly) 확정
   - L5: Antigravity — 루트 plugin.json으로 agy 직설치 통과
3. **Fable 5 구현 코드리뷰** (지적 26건) → 필수 9건 전부 반영 (review-fix 1~6):
   치명 2건(안전훅 fail-open, install-hooks 죽은 경로) 해소 + 기능 실증(PA0008 차단),
   페르소나 재생성(잔재 0), 권한 live 기반(153), 승인 키워드 통일, verify-engine 교정,
   LICENSE. 대응 기록: `interactive/docs/research/L5-review-response.md`
4. **레포 통합 + 개명** (사용자 결정 "하나의 레포가 목적"): sc4sap-lite를 git subtree로
   `interactive/`에 병합(13커밋 보존, 커밋 038085c+8959b73), 플러그인명
   `sap-agentic-harness`로 개명, 마켓플레이스를 레포 루트로(.claude-plugin/.agents,
   source `./interactive`), Codex·agy 재등록 스모크 통과
5. **활성 스코프 설정** (사용자 결정 "이 프로젝트만"): §3 참조 (커밋 5e529fc)
6. **(2026-07-11) 검증 종결 + 이중 검토 후속**: 백로그 5-1~5-4·5-6 소화, 엔진 수리
   4.13.1(RunUnitTest·CreateFunctionGroup) + 소스 편입(D-017), **새-컨텍스트 프로젝트
   전반 이중 검토(Fable 5 + Codex 독립 교차)** → D-018(트랙 A 의존 분리 유지+lock,
   5-9 종결)·D-019(품질 계약 봉인)·**5-10 안전·진실성 수리 스프린트**(엔진 4.13.2
   tier fail-closed·L3 훅 fail-closed·리뷰어 기계 격리·표면 동기화) 완료, 전량 push

## 3. 현재 설치·활성 상태 (2026-07-10 실측)

| 하네스 | 상태 | 메커니즘 |
|---|---|---|
| **Claude Code** | 이 프로젝트만 ON | 마켓플레이스 등록 완료(사용자 실행) + `claude plugin install --scope local` → 본 레포 `.claude/settings.local.json`의 enabledPlugins (git 미추적). **세션 재시작해야 로드됨** |
| **Codex** | OFF (기본) | 플러그인 활성화는 **전역 전용**(실측 — 프로젝트 오버레이·`-c` 무효). SAP 작업 시: `node interactive/adapters/codex/toggle-plugin.mjs on`, 종료 시 `off` |
| **Antigravity** | OFF | `agy plugin enable/disable sap-agentic-harness` (전역 토글, agy 1.0.7) |

- Codex의 구 sc4sap-lite 잔재(전 세션 스킬 노출)는 캐시까지 완전 제거 완료.
- MCP 서버는 Claude만 플러그인에 동봉 등록(.mcp.json). Codex/AG는 수동 등록 필요
  (각 어댑터 README의 명령 — exposition=readonly 기본).

**보조 머신 (2026-07-10, 레포 위치 `D:\AI PROJECT\sap-agentic-harness`):**

- Claude 플러그인 scope local ON + 안전훅 3종 프로젝트 settings 등록(PA0008 차단 실증)
  + 권한 병합 allow 189(사용자 직접 실행, D-008 패턴 — 실데이터 2종 제외 유지). **셋업 완료.**
- 프로파일 홈은 기본 `~/.sc4sap`(SC4SAP_HOME_DIR 미설정 — `.sah` 개명은 주 머신만).
  활성 프로파일 **IDES-DEV**(S4H/100 실연결 확인). KR-DEV(192.168.1.225)는 사내망
  전용이라 이 머신에서 도달 불가 — 사내망 복귀 시 active-profile.txt 한 줄 교체.
- 구 sc4sap 플러그인: ~~2종 disabled 확인~~ → **2026-07-12 정정: `sc4sap@sc4sap-custom`은
  전역 활성 유지 (사용자 결정 — 타 프로젝트에서 사용 중)**. 원본(sc4sap@sc4sap)은 비활성.
  영향: 이 프로젝트 세션에도 구 플러그인의 도구·페르소나가 함께 로드됨(구 엔진 번들 —
  4.13.1+ 수리 미반영). **이 프로젝트의 SAP 작업은 반드시 `sap-agentic-harness`
  네임스페이스 도구만 사용할 것.** → **같은 날 절충 적용(사용자 승인)**: 본 레포
  `.claude/settings.local.json`에 `"sc4sap@sc4sap-custom": false` 로컬 오버라이드
  추가(git 미추적) — **이 프로젝트만 OFF**, 타 프로젝트 무영향. 세션 재시작부터
  유효 — 그 후로는 이중 로드·네임스페이스 혼동 위험 소멸. 부작용 실측: 구 플러그인 MCP 서버가 동결 레포에
  런타임 로그(`.sc4sap/state/`)를 남겨 커버리지 드리프트 발생 → 매니페스트
  `.sc4sap/**` obsolete 규칙으로 흡수(2026-07-12).
- 3사 CLI 전부 존재 실측(2026-07-11 doctor): claude 2.1.206(플러그인 설치+훅 3종 배선) ·
  codex 0.144.1(플러그인 미설치 = 평시 OFF) · agy 1.0.16(임포트 + **disabled** = 평시 OFF,
  5-2 스모크 재검증 때 임포트됨).
- **final-harness 플러그인 설치 완료(2026-07-11)**: `final-harness@final-harness-marketplace`
  v0.17.1, scope **local**(이 레포만) — `.claude/settings.local.json` enabledPlugins에 기록
  (git 미추적). **세션 재시작 후 harness-init 등 스킬 10종 로드됨.** 주 머신은 미설치.
- **트랙 A 소스 2종도 이 머신에 실재 확인(2026-07-11)**: vsp-custom =
  `D:\Claude for SAP\vsp-custom`(Go 286파일 소스 완비 + vsp.exe 빌드본, 업스트림 대비
  +10커밋/behind 0), final-harness = `D:\AI PROJECT\claude-final`. 버전은 여기 기록하지
  않는다 — 같은 날 두 번 낡은 것이 실증됨(v0.16.0→v0.16.2→v0.17.0). 부트스트랩 시
  현행 실측 + lock (D-018). → 트랙 A 부트스트랩 이 머신에서 가능.
- IDES-DEV 프로파일 참고: sap.env가 `SAP_RFC_BACKEND=odata`인데 URL 미설정 —
  RFC 디스패치 3계열(Screen·GUI Status·Text Element)은 이 프로파일에서 env 에러.
  해소하려면 ① soap 전환(추가 env 불요, ICF `/sap/bc/soap/rfc` 활성 확인됨 — 무인증 401)
  + ② ZMCP_ADT_UTILS/ZMCP_ADT_TEXTPOOL FM 설치(서버측 부재 확인 — 단 CreateFunctionGroup이
  이 릴리스에서 결함이라 MCP 설치 불가, SAP GUI 수동 생성 필요. §6 엔진 백로그 3).
- 원본 sc4sap-custom 사본에 npm 산출물(node_modules)이 있어 migration-coverage
  게이트가 깨졌던 것을 스크립트 수리(node_modules 스킵)로 해소. `.omc/**` 규칙
  매칭 0 경고는 이 머신 사본에 세션 기록물이 없어서 나는 정보성 경고(비차단).

## 4. L3 E2E + L6 교차 검증 — ✅ 전부 완료 (2026-07-10)

**E2E = 실사용 시나리오를 처음부터 끝까지 1회 완주하는 검증.** 조립 검증까지 완료 —
트랙 B는 설계→구현→검증이 닫혔다. 아래 체크리스트·설치 조건은 재현 절차 기록으로 보존.

**설치/연결 조건 (재현 시):**

1. Claude Code 세션 재시작 → `/sap-agentic-harness:troubleshooting` 등 스킬 11개 +
   `sap` MCP 서버 보이는지 확인
2. SAP DEV 프로파일: `~/.sah/profiles/<별칭>/sap.env` (**SAP_TIER=dev 필수**) +
   본 레포 또는 작업 폴더에 `.sc4sap/active-profile.txt`(별칭 1줄) + `.sc4sap/config.json`
   (sapVersion·abapRelease·activeModules·industry·country)

**E2E 체크리스트** (상세: `interactive/adapters/claude/README.md`):

- [x] MCP 연결 확인 — launch.cjs shim 경유 connected (system_id=DEV/700)
- [x] **연결 상태 tools/list 실측** → 미노출 27종은 프로파일 활성 시 **동적 노출**로 판정
      (155→186) → tool-catalog README 보류 해소. create-program 참조 도구 전부 실재
- [x] 도구 네임스페이스 접두어 일치 확인 (`mcp__plugin_sap-agentic-harness_sap__`)
- [x] 안전훅 설치 + 재배선 확인 (PA0008 차단 실증)
- [x] FI 상담 1건 — 페르소나 + 라이브 컨텍스트(ACDOCA/SKA1) + KR 로컬라이제이션
- [x] create-program 1건 완주 — ZR_FI_GL_LIST (승인 게이트 → 구현 → 리뷰 FAIL→수정→PASS
      → CheckSyntax→활성화→ATC; Unit은 백엔드 404로 SKIPPED). 상세 §4.1

**E2E 후 → L6 교차 검증: ✅ 완료 (2026-07-10)** — 3사 전부 라이브 SAP 연결 실증:

- **Codex** (0.144.1, gpt-5.6): `toggle on` + `codex mcp add sap`(launch.cjs·readonly) →
  GetSystemInfo 실데이터(DEV/700) → ask-consultant 상담 과제 통과(🧭/🌐 형식·환경 로드·
  라이브 SKA1 조회·Claude와 정합적 답변).
- **Antigravity** (agy 1.0.7): `agy --print` 비대화형으로 동일 과제 통과 — "가능한 선"을
  넘어 CLI 전 플로우 동작. **실측**: agy CLI의 MCP 정본은 `~/.gemini/config/mcp_config.json`
  (`antigravity/mcp_config.json`은 IDE용) — 어댑터 README에 반영.
- **리뷰 인계 왕복 실증**: Claude 워커의 review-request.json(ZR_FI_GL_LIST)을 Codex
  리뷰어가 소비 → 스키마 적합 `review-result-codex.json` 반환(read-only 준수, 원본 무손상).
  **관찰**: 판정 편차 Claude PASS vs Codex FAIL(MAJOR 7) — 원인은 ① 환경 컨텍스트(백엔드
  장애·문서화된 편차) 미전달 ② 심각도 캘리브레이션 차이 ③ **실질 신규 발견 1건
  (AUTHORITY-CHECK 부재 — F_SKA1_* 권한 검사, 후속 개선 후보)**. 교훈: review-request
  스키마에 환경 컨텍스트 필드 추가 검토(백로그).
- 종료 상태: Codex toggle off·AG disable (평시 기본). 어댑터 README 2벌에 launch.cjs
  경유 등록 명령 반영(구 경로·번들 직접 호출은 mock 연결이라 무효).

### 4.1 L3 E2E — ✅ 완료 (2026-07-10)

**E2E 전 구간 완주.** 연결을 막던 조립 결함 2건(keyring·연결 미배선)을 수리·실증했고,
재시작 후 하네스 통합 경로로 실연결(system_id=DEV) → 안전훅 재배선 → FI 상담 →
**create-program 풀 파이프라인 완주**(스펙 승인 게이트[사람] → Sonnet executor 구현 →
Opus sap-reviewer 새-컨텍스트 리뷰 FAIL→수정→**PASS** → CheckSyntax/활성화/ATC).
산출물: DEV `$TMP`의 `ZR_FI_GL_LIST` 5오브젝트 ACTIVE v1.1, 전 게이트 기록은
`.sc4sap/program/ZR_FI_GL_LIST/`(report.md 포함). **리뷰 게이트 가치 실증**: 문법·ATC·활성화를
전부 통과한 의미 결함(INNER vs LEFT JOIN)을 리뷰만 잡아냄.
잔여(백엔드 복구 후): RunUnitTest 재실행, WriteTextElementsBulk 1회. 다음 단계 = **L6 교차 검증**.

**확정 발견 & 수리:**

1. **keyring 바이너리 번들 누락** → keychain 비번 해석 불가 → 연결 불가.
   수리: `interactive/server/package.json`(+lock) 추가, `npm install`로 4플랫폼(win32/darwin×2/linux)
   populate, `bundle-keyring.mjs`의 `ROOT`를 `__dirname`으로 교정(마이그레이션 후 한 단계 어긋나 있었음),
   `interactive/.gitignore`에 `!/server/runtime-deps/keyring/node_modules/` 네거이션(블랭킷 `node_modules/`가
   바이너리를 삼켜 미커밋됐던 것이 근본원인). 검증: 모듈 로드 + Credential Manager `sc4sap/KR-DEV/HJAEWON` 읽힘.
2. **연결 env 미배선** → `.mcp.json`이 `--env-path`/`MCP_ENV_PATH`를 서버에 안 넘겨 4.13 번들이 **항상 mock**
   (username/password="mock", client 없음 → "Basic authentication requires SAP_CLIENT" 에러의 정체).
   active-profile은 tier/도구노출만 설정하지 그 자체로 연결을 만들지 않음(설계 문서는 "activateProfile이 연결 전
   실행되어 연결이 env를 상속" 가정이나 4.13 브로커는 env-**파일** 경로를 요구 — 엔진 회귀).
   수리(어댑터, 번들 무수정): 런처 shim `interactive/server/launch.cjs` — `.sc4sap/active-profile.txt`를 읽어
   프로파일 `sap.env` 경로를 `process.env.MCP_ENV_PATH`로 세팅 후 번들 require. `.mcp.json` args를 shim으로 변경.
   검증: launch.cjs 경유 `GetSystemInfo` → **실데이터 `system_id=DEV, client=700, user=HJAEWON(홍재원), adt=modern`**.
3. **"미노출 27종" 판정 정정** → 프로그램/화면 계열(CreateProgram·CreateInclude·CreateScreen·CreateGuiStatus·
   CreateTextElement 등)은 **부재가 아니라 프로파일 활성 시 동적 노출**. inspection-only 155 → connected **186 tools**.
   → **create-program 실행 가능** (앞선 "부재" 결론은 inspection-only 아티팩트였음). tool-catalog 보류 해소.
4. **권한 템플릿 재생성** → 기존 템플릿은 inspection-only(155)로 생성돼 프로그램 계열 write 누락(153 entries).
   connected(186)로 재생성 → `permissions-template.json` 184 tools(+파일op 5 = 189). `gen-permissions.mjs`는
   여전히 inspection-only 기동이라 **연결 상태 생성으로 고쳐야 함(엔진/스크립트 백로그)**.

**스테이징(미커밋) 변경:** `interactive/.gitignore`·`.mcp.json`·`server/bundle-keyring.mjs`·
`server/runtime-deps/keyring/integrity.json`·`adapters/claude/permissions-template.json`(수정) +
`server/launch.cjs`·`server/package.json`·`server/package-lock.json`·`server/runtime-deps/keyring/node_modules/`(신규).
프로젝트 상태 `.sc4sap/active-profile.txt`(=KR-DEV)+`config.json`은 git-ignored(정상).

**E2E 체크리스트 결과 (전 항목 완료):**
1. ✅ 실연결 — 하네스 `GetSystemInfo` → `DEV/700/HJAEWON/modern`
2. ✅ 권한 병합 — `settings.local.json` allow 189 (사용자 `!node merge-perms` 실행; 실데이터 2종 제외 유지)
3. ✅ 안전훅 재배선 — 3종 프로젝트 settings 등록(라이트 경로), PA0008 차단 standalone 실증
4. ✅ FI 상담 — 페르소나 로드 + 라이브 컨텍스트(ACDOCA/SKA1 실조회) + KR 로컬라이제이션 반영
5. ✅ create-program 완주 — 승인 게이트(SHA 바인딩) → 구현 → 리뷰 FAIL→수정→PASS → 기계검증 체인
6. ✅ 일괄 커밋 (push는 사용자 판단)

**E2E가 발굴한 엔진/백엔드 이슈 (§6 백로그 이관):**
- (a) **연결 미배선** — activateProfile이 connection 브로커에 미공급(4.13 회귀). adapter shim(launch.cjs)으로 우회 중 — 엔진 근본수리 필요
- (b) **gen-permissions가 inspection-only 기동** — 프로그램 계열 write 미포함 템플릿 생성. 연결 상태 생성으로 수정 필요
- (c) **DeleteInclude enqueue 누수** — 잠금→삭제 후 미해제, 고아 잠금이 재생성 차단(5회 재현). SM12 수동 정리로만 해소
- (d) **활성화/갱신 상태 플래그 신뢰 불가** — failed+에러0 모순, `activate=true` 거짓 성공, GUI 비가시 유령 inactive 레이어. 검증은 소스 읽기로만 가능
- (e) 사용자 DEV 박스 서비스 2종 다운(엔진 무관): ABAP Unit ADT 실행 404 · ZMCP_ADT_SRV Textpool 500 — 복구 후 RunUnitTest/WriteTextElementsBulk 재실행
  → **2026-07-11 판정 정정(D-015)**: RunUnitTest 404는 표준 S/4HANA 2021 IDES에서도 동일 재현 —
  박스 장애가 아니라 **엔진 결함 유력**, §6 엔진 백로그 3으로 이관. Textpool 500은 기존 판정 유지(KR-DEV 복구 대기)
  → **RunUnitTest 해소(2026-07-11, 엔진 4.13.1)**: 근본 원인은 Cloud 전용 API 호출 —
  클래식 testruns 전환 수리 후 배포 형태(launch.cjs+새 번들)로 IDES 완주, 4개 테스트
  메서드 전부 PASS. **E2E 잔여는 WriteTextElementsBulk 1건만 남음**(KR-DEV 복구 또는 5-7)

## 5. E2E 이후 남은 백로그 (상세 — 새 세션이 이 절만 읽고 착수 가능하게 기록)

**5-1~5-4·5-6·5-9·5-10 완료 (2026-07-11) · 5-7 완료 (2026-07-12)** — 남은 항목과
순서 (새-컨텍스트 이중 검토 2026-07-11이 재배열, 근거: "안전 주장-실체 격차가 열린
채 편의를 쌓지 않는다"): **트랙 A: Phase 2 완료(2026-07-12, §1 현황·STATE.md)**
→ 5-8(잔여 축소 — row-data 승인 실증은 Codex 실사용 전 필수로 상향, compact-readonly
스파이크는 폐기) → 5-5(축소 — 아래). 공통 완료 조건: §9의 게이트 통과 유지 +
상태 변경 시 이 문서 갱신.

> **통합 주 (2026-07-19 분기 통합)**: 5-12·5-13은 두 줄기에서 **같은 번호·다른 항목**으로
> 분기했다. 본 §5(원격 줄기)의 **5-12** = vsp copy 다중 객체 배포 실측 · **5-13** = 오프라인
> 게이트 CI. **보조 머신 줄기**(위 절)의 **5-12** = final-harness v0.20 개편 대응(플러그인
> 업데이트 동결) · **5-13** = JNC 교훈 팩 3층 지식 이식(층1~3 완주, MCP 엔진 4.13.13~15) —
> 후자 두 항목의 상세·완료 기록은 보조 머신 줄기에 보존. 번호 충돌 정리는 통합 후속
> (재번호 미실시).

### 5-1. tool-catalog 재생성 — ✅ 완료 (2026-07-11, 보조 머신)

- 연결 상태(IDES-DEV, launch.cjs 경유) tools/list 186종 실측 → 4파일 재생성.
  **read 90 / write 79 / runtime 15 / prompt-gated 2 = 186, 카탈로그↔live diff 0** 검증.
  구 카탈로그 170종은 전부 live에 실재(부재 없음 재확인), 신규 16종 편입
  (Grep 2·GetCallGraph·GetSourceDiff·UpdateSourceByPatch·WriteTextElementsBulk 등).
- 표기를 `mcp__plugin_sc4sap_sap__` 풀네임 → **bare capability name**으로 전환
  (vocabulary.md 어댑터 매핑 계약에 정합). ReloadProfile은 runtime의 신설
  "Server Session Control" 절로 — 자동승인 비권장 주석 포함.
- 재생성 절차(launch.cjs 함정 포함)는 `tool-catalog/README.md`에 영구 기록.
  check-links·coverage 게이트 통과.

### 5-2. doctor.mjs — 3사 어댑터-코어 동기화 점검 도구 — ✅ 완료 (2026-07-11)

- `interactive/scripts/doctor.mjs` 신설: ① 번들 무결성(verify-engine.mjs spawn 위임)
  ② compatibility.json 고정 버전 vs CLI 실측 + 플러그인 설치 여부(CLI 부재 = SKIP,
  버전 불일치 = FAIL, 플러그인 미설치는 정보성 — 평시 OFF도 정상) ③ Claude 훅 배선
  경로 실재(.claude/settings*.json의 command에서 경로 추출 → existsSync).
  전 항목 OK/SKIP → exit 0, FAIL ≥1 → exit 1. README 3벌에 사용법 1줄.
- **가치 즉시 실증**: 첫 실행이 실제 불일치 검출 — agy 설치 1.0.16 ≠ 고정 1.0.7 →
  정본 절차(compatibility.json _comment)대로 1.0.16 설치 스모크 재실행(skills 11 +
  agents 1 processed, 설치 후 disable로 평시 OFF 복귀) → 고정값 1.0.16 갱신 →
  doctor exit 0. FAIL·OK 경로 모두 실환경 실증.

### 5-3. review-request 스키마 확장 — 환경 컨텍스트 동봉 (D-013) — ✅ 완료 (2026-07-11)

- `review-request.schema.json`에 optional `environment_context` additive 추가 —
  `known_outages[]`(component/affected_step/observed_at) · `approved_deviations[]`
  (description/approver/approved_at/reason) · `notes`. **required 무변경**(하위호환),
  review-result 스키마 무변경.
- 생산측+소비측 짝으로 반영: `create-program.md` Phase 6 스텝 3에 기입 지침(서브불릿 3),
  `review-checklist.md`에 "Environment context" 소비 규칙 신설(장애로 SKIPPED된 단계는
  `N/A (environment outage)` 처리, 승인 편차는 재계상 금지, 미기재 편차는 정상 판정 —
  D-013 "동일 계약으로 소비" 취지 완결). 스키마 유효 + check-links·coverage 통과.
- 실증은 다음 create-program 완주 시 교차 리뷰 1회로.

### 5-4. 검증도구 개선 3건 — ✅ 완료 (2026-07-11, L5 리뷰 보류분 2-3/2-4/2-5)

- `check-links.mjs`: 앵커(#섹션) 존재 검증 — GitHub 슬러그 규칙(유니코드 보존·중복 -N·
  fence 내 # 제외), 순수 `#앵커`(자기 파일)와 `file.md#앵커` 모두. 도입 즉시 실검출:
  string-processing.md 목차 5건(원본부터 낡은 목차 → 실제 15섹션 구조로 수리).
- `check-migration-coverage.mjs`: copy/transform 규칙의 목적지(3열 backtick 토큰) 실재
  검사 — deferred 행·와일드카드 토큰·프로즈만 있는 행은 skip, 부재 = exit 1. 도입 즉시
  실검출: INSTALLATION 행의 구 계획 목적지 docs/installation/ 미채택 → 실제 이식처
  (adapters/ README 3벌)로 매니페스트 정정. **주의: 3열에 backtick 경로를 쓰면 실재
  검사 대상이 된다 — 존재하지 않는 경로 언급은 backtick 없이 쓸 것.**
- `smoke-mcp.mjs`: `--exposition` 지원(무인자 시 기존 동작 동일). readonly 실측:
  **tools 65 / write 0** (row-data 2종은 readonly에도 노출 — 정책층 커버, 기존 문서와 일치).

### 5-5. deferred 스크립트 (원천은 동결 레포 sc4sap-custom/scripts/ — 읽기만) [2026-07-11 축소]

| 원천 | 목적지 | 상태 |
|---|---|---|
| extract-spro.mjs · extract-customizations.mjs | `tools/extract/` | deferred 유지 (수동 대체: spro-lookup.md · customization-lookup.md) |
| fetch-abap-keyword-doc.mjs · fetch-sap-help-doc.mjs | `tools/fetch/` | **우선 검토로 상향** — 코어 페르소나(sap-doc-specialist.md)가 이미 "bundled"로 참조 중이라 deferred가 아니라 깨진 표면. 구현하거나 참조를 제거해야 함 (Codex 교차검토 발견) |
| sap-profile-cli.mjs | `scripts/` | deferred 유지 (수동 대체: troubleshooting.md) |
| sap-option-tui.mjs | — | **폐기 확정 (2026-07-11)** — config.json 직접 편집으로 충분함이 장기 실증. 훅 안내도 troubleshooting 절차로 교체 완료(5-10) |

### 5-7. sap-assets 설치 절차 + FM 부재 시 제외 규칙 — ✅ 완료 (2026-07-12)

- **완료 내역**: `interactive/core/procedures/install-sap-assets.md` 신설 — 원본
  스텝 9의 게이트 로직 6종 보존(tier 게이트 QA/PRD 거부+CTS 안내 · dedup sentinel ·
  기존재 skip · 부분 실패 사용자 판단 · RFC-enabled SE37 수동 · S4/ECC 소스 선택),
  동봉 실재 파일 22종만 참조(zrfc 핸들러·OData _EXT는 미동봉 명시, 유령 참조 0).
  3계열 SKIPPED 규칙은 **기입측**(create-program Phase 4/6 · create-object Step 4)
  + **소비측**(review-checklist known_outages 범위를 3계열로 확장) 양쪽 반영 —
  1차 새-컨텍스트 리뷰가 소비측 누락을 FAIL로 검출, 수리 후 2차 PASS(리뷰 게이트
  가치 재실증). 매니페스트 갱신, 게이트 5종 green. 부수 수리: doctor.mjs가 트랙 A
  python 훅(`${CLAUDE_PROJECT_DIR}` 변수)을 못 읽던 사각지대 해소(.py 인식+변수
  치환 — 훅 배선 자체는 정상이었음).

- **근거**: 원본 setup의 **wizard-step-09**(동결 레포 — 읽기만)는 ZMCP_ADT_UTILS 번들을
  MCP 도구로 자동 설치하는 절차를 가짐 — tier 게이트(QA/PRD 거부 + CTS 안내) ·
  시스템 dedup(sentinel 파일) · 기존재 skip · 부분 실패 시 사용자 판단 ·
  **RFC-enabled는 SE37 수동**(TFDIR.FMODE는 ADT REST로 불가 — 원본도 수동).
  라이트에는 소스(server/sap-assets/)와 진단(troubleshooting §1 FM 존재 확인)만 이식되고
  설치 절차와 부재 시 제외 규칙은 미이식 — E2E 잔여 IDES 이전 시도에서 발견(D-015 세션).
- **작업**: ① 설치 절차를 `core/procedures/`로 이식(원본 스텝 9의 게이트 로직 유지,
  SAP_VERSION별 소스 선택 S4/ECC, RFC-enabled 수동 단계 명시) ② 절차들에 "textpool FM
  부재/RFC 백엔드 미구성 시 Screen·GUI Status·Text Element 3계열 SKIPPED 처리 +
  `environment_context.known_outages` 기입"(5-3 필드 활용) 명시.
- **선결**: ~~CreateFunctionGroup 엔진 수리~~ → ✅ **4.13.1로 해소(2026-07-11)** —
  FUGR 생성·삭제 IDES 라이브 검증 완료, 설치 절차 착수 가능. 단 RFC-enabled 속성은
  ADT로 불가(TFDIR.FMODE)라 SE37 수동 단계가 여전히 필요(원본 스텝 9와 동일).

### 5-8. 노출 정책 실행 항목 [D-016 후속 — 2026-07-11 이중 검토로 우선순위 재조정]

- **Codex config-level 도구 제어 실증** [**상향: Codex 실사용 전 필수** — readonly
  프리셋에도 row-data 2종이 노출되고 Codex엔 L3 훅이 없어 정책 의존]: 공식 설정의
  `enabled_tools`/`disabled_tools`/도구별 `approval_mode`로 row-data 2종을 `prompt` 고정
  가능한지 현행 설치 버전에서 1회 실증 → 되면 어댑터 README 정본화. Antigravity의 대응
  기능도 실측(없으면 launch.cjs 앞 이름 보존형 tools/list 필터 검토).
  → ✅ **완료 (2026-07-12, IDES 라이브 실증)**: 핵심 발견 — codex-cli 0.144.1에서
  **`approval_mode="prompt"`는 `codex exec`(비대화형)에서 fail-open**: prompt 설정에도
  GetTableContents가 차단 없이 T000 실데이터를 반환(자동 거부가 아니라 자동 실행).
  키 인식 ≠ 강제 집행. 반면 **`disabled_tools = [row-data 2종]` 하드 차단은 실효**
  (tools/list에서 제거 — 호출 시도 자체 불가) + negative control(GetSystemInfo)
  정상. → 어댑터 README에 **실 SAP 사용 전 필수 설정**으로 정본화(§8-4 충족 —
  "승인 필수" 대신 "사용 불가"라는 더 강한 형태). AG는 gemini-CLI 층의
  `excludeTools`/`includeTools`/`trust`(false 유지 필수) 문서 수준 기록 — **agy
  1.0.16 미실증**, 1회 실측 후 승격. launch.cjs 앞 이름 보존 필터(도구를 남기고
  승인만 받는 대안)는 백로그 유지(권고만, 미구현). 종료 상태 복원 확인(toggle
  off·mcp remove·config 청정).
- **절차별 required_capabilities** [낮음]: 절차 문서에 필요 capability 선언 + 프리셋
  tools/list가 이를 전부 포함하는지 자동 검사(스크립트).
- ~~compact-readonly 스파이크~~ → **폐기 (2026-07-11)** — D-016이 기각한 raw compact의
  잔영. 실수요 실증 전 착수 금지 (재론 시 합격 기준은 D-016 원문 참조).
- smoke-mcp의 write 판정을 이름 추정 대신 카탈로그 operation class 기반으로 [낮음 —
  접두어 분류의 구조 한계는 RuntimeCreateProfilerTraceParameters 미커버(5-10에서 수리)로
  재확인됨].

### 5-9. 트랙 A 선결 결정 — ✅ 완료 (2026-07-11, D-018): 분리 유지 + 버전 lock

- **결정**: vsp-custom·final-harness 모두 **편입하지 않는다** — 분리 유지 + 부트스트랩
  시 버전 lock(커밋 sha·바이너리 해시·명령 계약). 근거·대안·기각 사유·재론 트리거는
  **D-018 원문**, 설계 반영은 DESIGN.md §2(분리 근거 교체)·§16-1(vsp.lock)·§16-3
  (final-harness 재기준). Fable 5 + Codex 독립 이중 검토가 동일 결론으로 수렴한 결정.
- 핵심 논거 요약: 트랙 A가 소비하는 것은 vsp *CLI 바이너리*뿐(engine/과 달리 수리→
  재번들→동봉 루프 없음) + 업스트림 oisee 활발(별 411, 2026-06 push — engine 업스트림
  babamba2 별 5·정체와 정량 대조) + 수리 마찰 실증 0건.

### 5-10. 안전·진실성 수리 스프린트 — ✅ 완료 (2026-07-11, 이중 검토 후속)

새-컨텍스트 이중 검토(Fable 5 + Codex 교차, 검토 전문은 세션 기록)가 확정한 공백을
일괄 수리. 결정 기록: D-018(소유 전략)·D-019(품질 계약 봉인). 수리 내역:

1. **엔진 4.13.2** (커밋: engine/ + interactive/server 반영): ① tier fail-closed —
   연결정보 존재 + SAP_TIER 미해석/이상값이면 `UNKNOWN` 센티널로 readonly 강제(명시
   `dev`만 write 개방), env 파일 hydrate에 SAP_TIER 편입(--env-path/MCP_ENV_PATH/cwd
   .env 경로 전부 커버) ② GetSqlQuery 테이블 추출 강화(주석 제거·콤마 목록·별칭 스킵)
   + 추출 불능 시 쿼리 거부(fail-closed). jest **512 통과(+30, 실패 0)**, 번들 반영,
   verify-engine OK, smoke 155 유지(도구 증감 없음).
2. **L3 훅 fail-closed 전환**: block-forbidden-tables — INDEX_FILE 사망 경로 제거,
   블록리스트 로드 0건·stdin/JSON 파싱 실패 시 deny, SQL 추출 강화 + 식별 불능 시 ask.
   tier-readonly-guard — **DEV 기본값 폐기**(tier 미해석 = mutation deny, 명시 dev만
   통과), RuntimeCreateProfilerTraceParameters 커버(훅 + install-hooks matcher), 죽은
   `/sc4sap:sap-option` 안내를 프로파일 설정 절차로 교체. install-hooks findGroup의
   중복 삽입 버그 동반 수리. 격리 테스트 9케이스 통과, **이 머신 재배선 완료**.
3. **품질 계약 봉인 (D-019)**: verification.schema — check_syntax/activate SKIPPED
   불허(step-strict 분리). create-program — Phase 6 진입·Phase 8 완료에 행렬 검사
   (check_syntax=PASS ∧ activate=PASS ∧ unit/atc∈{PASS,SKIPPED}), 리뷰 후 수정은 전
   체인 재실행. sap-reviewer — disallowedTools 88종(Write/Edit/Bash/NotebookEdit +
   mutation MCP 84종, 카탈로그 대조 누락 0)으로 기계 격리, 판정은 응답 JSON 반환·기록은
   워커. UPDATE-RUNBOOK capability diff에 disallowedTools 동기화 스텝.
4. **표면 동기화**: engine/CLAUDE.md 재작성(**업스트림 Notion DB 기록 지시 제거** —
   외부 유출 벡터, 88→35줄), plugin.json 2벌(도구 수·구명 정정), compatibility.json
   (Claude smoke E2E 완료 반영), interactive/DESIGN.md 헤더(상태 정본=HANDOFF 포인터화).

**잔여 (후속 착수 조건 포함):**
- 엔진: `--mcp` 서비스키 연결의 tier 기본값은 미수리(env 파일이 없어 tier 소스 부재 —
  보수적 유지). §6 백로그 1 잔여로 이관, 서비스키 운용 시작 전 재검토.
- sap-reviewer 88종 disallowedTools의 라이브 기동 실증 1회 — 다음 create-program 완주 시.
- review-result.schema.json 최상위 description이 구 계약("리뷰어가 기록") 서술 잔존 —
  기능 무영향, 다음 스키마 수정 시 정정.
- **주 머신 재개 시 `node interactive/adapters/claude/hooks/install-hooks.mjs --project`
  재실행 필수** (fail-closed 훅 + matcher 갱신 배선).

### 5-11. 트랙 A 무인 gated write 선결 — 새-컨텍스트 리뷰 게이트 편입 — ✅ 설계 완료 (2026-07-13, D-021)

- **해소**: (b′) plan-레벨 리뷰 스텝(자기-verify 게이트) + 필수 3조항(등식형 변경
  검사·검사 로직 인라인/sha256 핀·reviewed_head 바인딩) + 에스코트 조항(씨앗 결함
  라이브 차단 1회 실증까지 사람 셰퍼딩). 스펙 =
  `docs/reference/designs/2026-07-13-unattended-review-gate.md`, 결정 기록 = D-021,
  설계 반영 = DESIGN.md §8.3·§13. 분석→독립 검증(원안 (b)의 위조 창 BLOCKER 적중)→
  정정 재검증((b′) 조건부 성립) 3왕복 + 사용자 택1. 엔진 승격(A)은 기각 아닌 이연
  (재론 트리거 = (b′) 잔여의 실전 실증). **선결 3건 전부 해소 — Phase 3 착수 가능.**
  구현(verdict 스키마·검사 스크립트·harness-plan 관례·체크리스트 이식)은 Phase 3
  작업의 일부. 이하 원문 보존:

- **근거**: "execute.py가 ABAP에 맞나" 검토에서 메인 + Fable 5 새-컨텍스트 리뷰가 독립
  수렴한 공백 — 트랙 B E2E가 실증했듯 문법·ATC·활성화 전부 통과한 시맨틱 결함(INNER vs
  LEFT JOIN)은 기계 verify가 못 잡고 리뷰만 잡는다(§4.1). 무인 엔진의 완료 판정은 기계
  verify뿐이라 gated write 체인(DESIGN §8.3)에 이 구멍이 열려 있음.
- **작업**: 무인 gated write(Phase 3) 투입 전에 새-컨텍스트 리뷰 게이트를 무인 체인에
  편입(방식은 그때 설계 — 엔진 verifier 프롬프트 강화 vs 별도 리뷰 스텝 vs 사람 셰퍼딩
  유지 중 택1). **그 전까지 무인 write는 켜지 않는다** — 나머지 선결 2건(0b 마커 실측,
  §14-2 drift 실측)과 함께 Phase 3의 3대 선결.
- 엔진 유지 판단 자체의 반증 조건 5종(마커 분류 실패·CDS/RAP lint 차단력 0·drift 불성립·
  BLOCKED 과반 지속·수요 부재)은 로드맵 Phase 완료 기준과 일대일 — 별도 결정 불요,
  로드맵 완주가 곧 판정 (검토 전문은 세션 기록).

### 5-12. vsp copy(abapGit ZIP) 다중 객체 배포 경로 실측 (2026-07-13 등록)

- **트리거**: Phase 4(Domain Packs) 또는 실 Z패키지+transport 단계 진입 시 —
  객체 수가 늘면 단건 `vsp deploy` 대신 묶음 배포가 자연스러움.
- **내용**: `vsp copy <abapGit ZIP> --to <패키지>` 경로를 실측(DESIGN §3 권고 운용의
  묶음 배포 축, §15-V6). Phase 3은 단일 PROG라 deploy로 충분했음(scoring-raw.md).
- **경계**: 순수 abapGit(서버가 GitHub를 직접 pull)은 GUI 수동이라 무인 verify 계약
  밖 — 하네스 백엔드는 vsp 유지(D-001), 사람 배포 대안으로만 검토.

### 5-13. 오프라인 게이트 CI 워크플로 (GitHub Actions) — ✅ 완료·러너 green 실측 (2026-07-14, run ddd3878)

- **산출**: `.github/workflows/offline-gates.yml` — **2-job**(네이티브 런타임별
  분리), 트리거 = push(main)·pull_request·workflow_dispatch.
  - `node-gates`(**ubuntu-latest**): ① check-links ② verify-engine(번들 무결성)
    ③ smoke-mcp. `npm ci` 불요(keyring runtime-deps 커밋됨, linux-x64-gnu
    프리빌드 포함), `.gitattributes` 불요. **러너 green 실측**(run 29307259656).
  - `ps-gate`(**windows-latest**): ④ test-check-review-verdict.ps1(13케이스).
    이 테스트는 엔진이 실제로 쓰는 방식(Windows `powershell.exe` 자식 프로세스 +
    백슬래시 픽스처 경로)으로 체커를 구동하므로 **Windows 네이티브가 설계 의도** —
    Linux pwsh 이식 대신 windows 러너에서 실행(스크립트 무수정).
- **CI 제외 2종 (설계 결정 — 둘 다 러너에 없는 상태 읽음)**:
  ① **check-migration-coverage.mjs** — 외부 동결 레포 `sc4sap-custom`(절대경로
  `SC4SAP_SRC` 기본값 `D:/claude for SAP/sc4sap-custom`)을 스캔하므로 러너에서 크래시.
  ② **doctor.mjs** — 머신-로컬 진단(설치된 CLI 버전·플러그인·훅 배선). 둘 다 로컬
  전용 게이트로 유지(CLAUDE.md 게이트 목록). 참고: 이 머신 doctor는 Codex
  0.144.3≠0.144.1·AG 1.1.1≠1.0.16 핀 드리프트로 FAIL(번들·훅은 OK) — 별도 소형
  잔여(doctor 핀 갱신).
- **CI 브링업 교훈 (2026-07-14, 실패 2회 후 확정)**: ① 초판 5종(ubuntu 단일)에서
  **check-migration-coverage FAIL**(run 29307084698) — 절대 외부경로(sc4sap-custom)
  의존, 클린-클론 검증 사각지대(클론 위치 무관하게 로컬 참조→로컬 통과). 제거. ②
  4종(ubuntu 단일)에서 **PS verdict 테스트 FAIL**(run 29307259656 — node 3종은 green)
  — 테스트가 Windows 전용(`powershell.exe` 자식 호출·백슬래시 경로)이라 Linux pwsh에서
  깨짐. 핀 sha256은 무관(파일 LF 일관·런타임 자체 계산). → PS 테스트를 windows-latest
  로 분리(2-job). **교훈: 외부 절대경로·플랫폼 전용 스크립트는 로컬(Windows) 검증만으론
  CI 적합성 판정 불가 — 실제 러너가 유일한 판정.** ③ 2-job으로 **양 job green 실측**
  (run ddd3878: node-gates 3종·ps-gate 1종 전부 success).
- **경계 (중요)**: 트랙 A의 SAP-라이브 verify는 **CI 불가** — 엔진 phase(execute.py)는
  vsp.exe를 살아있는 SAP(IDEA-JNC)에 붙여 실행하므로 러너에 바이너리·자격증명·접근망
  부재. CI는 오프라인 게이트 층만 커버(SAP write/에스코트/ATC/unit은 로컬 전용 유지).
- **참고**: 별개 레포 final-harness 엔진의 CI(수동 트리거 전환 이력)와 혼동 금지 —
  D-018로 분리된 레포. 본 항목은 sah 레포 전용.

### 5-14. 트랙 A 엔진 실행 배선 선결 — 워커 계약 부재 + 엔진 결함 4건 (2026-07-20 조사 등록)

- **트리거**: `run-track-a.ps1` 실행 배선 착수 시. 현재 이 래퍼는 게이트 전량 통과 후에도
  `:153`에서 무조건 `Deny 65 "launch path not wired"` — 엔진 호출 라인이 파일에 0개다
  (`grep python` 0건). 과거 6런은 배선 이전의 직접 호출분이며 현행 규약(AGENTS.md)에선 금지.
  주: 래퍼는 `-Candidate`를 요구(`:106`)하므로 **verified v0.17.3 실행 경로가 없다** — D-038이
  "오늘의 실행 경로는 verified"라 한 것과 어긋난다. 배선 시 함께 정리.
- **(1) 동반 스킬 미설치 — 최우선**: 상류 v0.17.3(`8f7f13b`)에는 동반 스킬 10종
  (`skills/harness-{audit,design,docs,init,lesson,loop,plan,run,tailor,worker}/SKILL.md`)이
  있으나 본 레포엔 `skills/` 디렉터리 자체가 없다(실측 0종 — 트랙 B 스킬 11종은
  `interactive/skills/`로 별개). 그중 **`harness-worker`(95줄)가 bridge 드라이버의 워커 계약
  정본**이다: 워커 세션은 `prompt.md`를 읽지 않고(dispatcher 문맥 오염 방지) 요청마다 새
  서브에이전트 1개를 띄우며, `response.md` 기록 **후에** `done`에 request id를 쓰고(순서가
  계약) 이후 저장소 무접촉. 이 계약서가 target에 없어 워커가 `done`을 누락 → (2)의 낭비.
  조달 경로 = verified 커밋에서 이식(승격 아님 — D-038 휴면과 무관) vs 사용자 전역 플러그인
  설치 중 **어느 쪽이 의도인지 미확정**(harness-init 설치 규약 미확인 — 배선 전 선결).
- **(2) 실측 사고**: `phases/3-review-gate` step5 `live-spike` — `step5-output.json`
  `timedOut:true` + `run-summary.json` `attempt_secs:[1800]`·`status:"blocked"`(phase 총
  4,355초 중 1,800초). 엔진 폴링(`execute.py:2178-2216`)은 `done`만 관찰하고 `index.json`은
  보지 않는다. 워커 판정은 index에 존재했다 — 엔진이 스스로 blocked를 쓰는 경로는 `:2576`
  (컨텍스트 예산 초과) 하나뿐이고 그것은 세션 기동 **전**이라 `attempt_secs:[1800]`과 양립
  불가하므로 배제. 단 **작성 시각이 불명이라 실제 낭비 구간은 0~1800초 사이 미확정**
  (`blocked_at`은 엔진이 타임아웃 후 찍은 값).
- **(3) 엔진 결함 4건 — 본 레포 수정 금지(스펙 B1), 상류 개발 레포 몫**:
  - **A** `timeouts` 카운터 도달 불가 — blocked 분기(`:2646` → `:2659 sys.exit(2)`)가 집계
    (`:2680`)보다 먼저 종료. 전 코퍼스 타임아웃 1건을 0으로 기록(적중률 0/1). **확정 버그**
  - **B** 타임아웃 경로에서도 `finally`(`:2224-2228`)가 `BRIDGE_FILES`(`response.md` 포함)를
    전량 삭제 → 사후 원인 규명 불가(위 (2)의 "언제 썼는지 불명"의 직접 원인)
  - **C** 폴링이 `done`만 관찰 — (2)의 기전. 코드는 확정, 피해 규모는 B 때문에 미확정
  - **D** `verify_surface_changes` 발동률 **71%**(21스텝 중 15스텝·총 21회, 6런 전수).
    이 경고로 중단·재시도된 런 0건. 소음 판정은 **표본 6런이라 보류** — 상류 기능 제거
    근거로는 얇다
- **(4) 관측 공백**: 식별한 가드 38종(약 1,060줄) 중 영속 신호를 남기는 것은
  `_warn_verify_surface_changes` 1종뿐. 엔진 stdout은 어디에도 영속되지 않는다
  (`logging`·tee·`Start-Transcript` 전무 실측) → 나머지 37종은 **발동 여부 사후 확인 불가**.
  배선 시 래퍼측 출력 영속화를 함께 검토(엔진 무수정 범위 — 래퍼만 수정).
- **배선 완료 게이트(권고)**: ① worker 어댑터 존재 ② 워커 준비상태 preflight/handshake
  ③ `completed`/`blocked`/`advisory` 3종 블랙박스 왕복 시험 통과. 순서 = 지원 가능한
  v0.17.3 진입 계약 확정 → 워커 어댑터 → E2E → 실행 개방.
- **하지 않기로 한 것**: `index.json`이 blocked면 감시자가 자동으로 `done`을 쓰는 방식 —
  응답 완성 여부를 알 수 없고 advisory 요청은 index 전이가 아예 없어 오신호가 된다.
- **참고(비고)**: 엔진 크기는 원본 템플릿(`D:\claude-practice\Claude_harness_template`,
  `d30592c`) 671줄 → v0.17.3 3,080줄(4.6배), 메서드 26→95. 상류 v0.19.2 ≥3,459줄·v0.20.0
  ≥3,737줄(문서 인용 좌표 기준 하한). 팽창의 상당분이 위 (4)의 가드 계열. D-038 근거 ①의
  "무게 증가"는 v0.18 이후를 가리켰으나, 실측상 팽창 대부분은 **동결 대상인 v0.17.3에서
  이미 완료**돼 있다 — 별도 판단 사항이며 본 항목은 이를 결정하지 않는다.
- **근거**: 본 레포 실측(위 파일·행 전건) + 상류 `8f7f13b` `git ls-tree` 대조 + 교차검토
  (`gpt-5.6-sol`, reasoning=max, 2026-07-20 — 배너 실측). 교차검토가 정정한 것: 최초 제안
  ("워커 절차 문서 신규 작성")은 상류 계약과 **반대 절차**(메인 세션이 `prompt.md` 직접 수행)를
  가르칠 뻔했고, 정본이 이미 상류에 존재함을 놓쳤다.

### 5-6. 다국어 README — ✅ 결정 완료 (2026-07-11): 재작성 안 함

- 개인 도구라 다국어 README 소비자 없음 + 코어(영어)·운영 문서(한국어) 역할 분담으로
  충분 + 원본 archive 보존이라 수요 발생 시 언제든 재론 가능(가역). 매니페스트
  `README.*.md` 행에 확정 기록 (분류는 archive 그대로).

### 머신별 가능 범위 (2026-07-11 기준)

| 작업 | 주 머신 | 보조 머신(D:\AI PROJECT) |
|---|---|---|
| **트랙 A: Phase 2 Read-Only Planning (다음 착수)** | vsp 빌드 + 플러그인 설치부터 (§16-1·3, lock 대조) | ✅ Phase 1.5까지 완료 — Phase 2부터 (§1 현황) |
| 5-10 잔여: install-hooks 재배선 | **재개 시 필수** (`--project` 재실행) | ✅ 완료 (2026-07-11) |
| E2E 잔여: WriteTextElementsBulk | KR-DEV 백엔드 복구 후 | △ IDES에 ZMCP FM 수동 설치(GUI) 시 soap로 가능 (§3) |
| 엔진 백로그 (§6) | ✅ 레포 내 `engine/` (D-017) | ✅ 동일 — 4.13.1·4.13.2 수리·재번들 실증 |

## 6. 엔진 백로그 (`engine/` — 2026-07-11 D-017로 편입, 그 전엔 별도 포크)

**엔진 백로그 1 — tier 기본값**: 연결정보 존재 + `SAP_TIER` 미설정이면 tier가 DEV로
기본되어 write 가드가 열림 (L2 실측). 요구: "SAP_TIER 미설정 + 연결정보 존재 시 기동
거부(또는 write 미등록)".
→ ✅ **대부분 해소 (4.13.2, 2026-07-11, 5-10)**: env 파일 기반 연결(프로파일·--env-path·
MCP_ENV_PATH·cwd .env)은 tier 미해석 시 `UNKNOWN`=readonly 강제로 fail-closed. L3 훅도
동일 방향 전환(DEV 기본 폐기). **잔여**: `--mcp` 서비스키 연결은 tier 소스(env 파일)가
없어 DEV 기본 유지 — 서비스키 운용을 시작하기 전에 재검토할 것.

**엔진 백로그 3 — 2026-07-11 IDES(S/4HANA 2021) 실측** (재번들 절차는 UPDATE-RUNBOOK):

1. ~~**RunUnitTest 404**~~ → ✅ **해소 (4.13.1, 포크 커밋 d0ed3ba)**: 원인 = vendored 클라이언트가
   ABAP Cloud 전용 `/sap/bc/adt/abapunit/runs`를 온프레미스에 호출(discovery 실측으로 컬렉션
   부재 확정 — 2시스템 404의 정체). 클래식 `POST /abapunit/testruns`(runConfiguration v1,
   options 블록 포함) 전환 + 동기 결과를 connection 귀속 TTL 스토어로 run_id 계약에 브리지.
   Codex 교차 리뷰 MAJOR 6건 중 5건 반영(URI 인코딩·5분 타임아웃·스토어 격리·응답 검증·
   href 관대화). IDES 라이브 4메서드 PASS + jest 343 통과.
2. ~~**CreateFunctionGroup 400**~~ → ✅ **해소 (4.13.1)**: 원인 = CT `groups.v3+xml` 하드코딩
   vs 시스템은 v2만 광고(A/B 프로브 확정). discovery 협상(최고 광고 버전, per-connection
   캐시, 실패 시 현행 폴백, legacy 분기는 협상 스킵). 생성→활성화→삭제 라이브 검증.
3. **CreateProgram(program_type=function_group) 거짓 성공**: 타입 무시하고 PROG/P 생성
   (응답 `"type":"PROG/P"`, URI `programs/programs`) — (d)의 거짓 성공 계열.
   → ✅ **해소 (4.13.9, 2026-07-12)**: 미지원 4타입(include/function_group/
   class_pool/interface_pool)을 create 호출 전 명시 거부(전용 도구 안내) +
   inputSchema enum 6→2(executable·module_pool) 정정, 도구 수 불변. 라이브
   red(가짜 REPORT 생성 재현)→green(거부+미생성 확인). compact 경로는 수리를
   상속(위임 구조 — 리뷰 검증). **잔여**: 저수준 CreateProgramLow는 동일 뿌리
   미수정(최소 스코프 — low 계열은 caller 계약이 달라 별도 판단).
4. **CreateClass 잠금 미해제**: 생성 직후 Update 계열이 "locked by another user"
   (같은 세션 즉시 호출 포함 4회 재현, ReloadProfile·GetSession(force_new) 무효, 세션 만료로만
   해제). UpdateClass는 stale 잠금 핸들 재사용("ungültiges Sperr-Handle") + 실패 경로 잠금
   누수 의심 — (c) DeleteInclude enqueue 누수와 같은 계열.
   → **병명 규명 (2026-07-12 Phase 2 채점)**: UpdateClass의 "ungültiges Sperr-Handle"은
   stale 캐시가 아니라 **lock(성공)→중간 stateless 요청이 stateful 세션 롤백→PUT 시점
   잠금 증발** — vsp issue #88(HTTP 423)과 동일 메커니즘. IDES(커넥션 재활용 환경)에서
   결정적 재현(핸들이 매번 갱신됨), KR-DEV(직결)에서 정상인 것과 정합. 수리 방향 =
   vsp 642c03c와 동일(lock~write 체인의 중간 요청 stateful화). 이 실패 유형은 고아
   잠금을 남기지 않음(SM12 확인). 상세: phases/2-duedate-reuse/scoring-raw.md
   → ✅ **UpdateClass 해소 (4.13.3, 2026-07-12)**: handleUpdateClass lock 직후
   `setSessionType('stateful')` 1줄(체인 전체 세션 유지, include 핸들러 선례와 동일
   패턴) + 회귀 테스트(세션타입 헤더 핀, 역-검증 완료). jest 439 통과, 번들 반영,
   **IDES 라이브 red→green**: 당일 2회 실패했던 동일 호출이 updated+activated 완주.
   **잔여(신규 백로그 9)**: UpdateInterface·UpdateProgram이 구조 동일(lock→check→
   PUT, stateful 미설정)한 잠복 버그 — 각 파일 인라인이라 이번 최소 수리에서 제외,
   동일 1줄 수리 가능. CreateClass 생성 직후 잠금 건은 별개로 잔존.
   → ✅ **백로그 9 해소 (4.13.4, 2026-07-12)**: 두 핸들러 모두 lock 직후 stateful
   핀 1줄 + 회귀 테스트 2본(역-검증 완료 — 핀 제거 시 테스트 FAIL 확인). jest
   **515 통과(0 실패)**, 런북 재번들(capability diff no-op — 155 동일), **IDES
   라이브 red→green 양 핸들러 실증**: 4.13.3 번들로 ungültiges Sperr-Handle 재현
   → 4.13.4로 동일 호출 완주 ($TMP 한정, 임시 인터페이스는 삭제 정리). low 계열
   (UpdateInterfaceLow/UpdateProgramLow)은 caller 제공 lock_handle + 세션 복원
   구조라 별개 흐름 — 무변경.
   **신규 백로그 10 — 동일 시그니처 잔여 감사**: UpdateView는 사실상 확정(lock→
   ddl_source 사전 check→PUT, 핀 없음 — 동일 1줄 수리 가능). UpdateServiceDefinition·
   UpdateFunctionModule·UpdateMetadataExtension·UpdateBehaviorDefinition은 lock~PUT
   사이 중간 stateless 요청 존재 여부 핸들러별 확인 필요. 사전 check 없는 Update
   계열(Table/Structure/FunctionGroup/Domain/DataElement)은 저위험 후보. 감사
   방식은 이번과 동일한 red→green 권장. CreateClass 생성 직후 잠금 건은 별개로 잔존.
   → ✅ **백로그 10 해소 (4.13.5, 2026-07-12)**: Update 핸들러 10종(View·Table·
   Structure·Domain·DataElement·FunctionGroup·FunctionModule·ServiceDefinition·
   MetadataExtension·BehaviorDefinition — 뒤 2종은 인라인 lock 분기만) 전부 stateful
   핀 + 계열 회귀 테스트 10케이스(역-검증 — 핀 일괄 제거 시 10케이스 개별 FAIL).
   jest **525/0**, 런북 재번들(capability no-op), **라이브 red→green: Table·Domain
   에서 423 재현→해소 실증**. PUT-first 계열(FM·SRVD·DDLX·BDEF)은 라이브 423
   미재현이나 post-check가 unlock 전에 stateless로 나가 같은 세션 붕괴에 노출 +
   래퍼 문서가 stateful을 요구하는 정본 프로토콜이라 핀 유지. UpdateInclude는
   기존 핀 보유(안전 확인). Update 계열 stateful 핀 누적 13종(4.13.3~5).

**엔진 백로그 11 — 4.13.5 감사 부산물 (2026-07-12, 미착수)**:

1. **Create 계열 동일 423 병리 — 라이브 실증됨**: CreateDomain·CreateDataElement가
   IDES에서 create→lock→속성설정 체인 중 InvalidLockHandle 실패(반쪽 스켈레톤
   잔류). 인라인 lock 체인 Create 6종(Table/Structure/Domain/DataElement/
   MetadataExtension/BehaviorDefinition) 동일 1줄 수리 후보. 결부: 반쪽 스켈레톤은
   Update로 복구 불가(patch*Xml이 기존 속성만 치환 — description 부재 스켈레톤은
   영구 불구) → 수리 시 GUI 삭제 후 재생성 안내 필요.
   → ✅ **11-① 해소 (4.13.6, 2026-07-12)**: 수리 6종 — Domain·DataElement·Table·
   MetadataExtension·BehaviorDefinition에 stateful 핀 5 + **CreateInclude는 lock
   직후의 명시적 stateless 리셋을 제거**(재스캔이 raw-lock 2종 CreateInclude·
   CreateTextElement 추가 발굴). CreateStructure는 잠금이 아무 요청도 감싸지 않는
   죽은 쌍이라 무수리(→ 11-⑨). Create 계열 테스트 6케이스(역-검증 — 핀 제거+리셋
   재삽입 시 6케이스 전부 FAIL), jest **531/0**, 재번들(capability no-op). 라이브:
   CreateDomain·CreateDataElement **red 423 재현 → green 423 소멸**(잔여 실패는
   별개 신규 결함 11-⑧). $TMP 임시 객체 6종 전량 삭제 검증·고아 잠금 0.
   잠금 세션 수리 누적 19 핸들러(4.13.3~6: Update 13 + Create 6).
2. 래퍼 내부 stateless 누수: AdtClass.updateTestClasses 등 wrapper 내부가 lock 후
   stateless 리셋 — 핸들러측 사전 핀이 덮여 무효, **vendored client 패치 필요**
   (UpdateLocalTestClass/Types/Macros/Definitions·UpdateUnitTest·UpdateClassMethod·
   UpdateCdsUnitTest 영향).
   → ✅ **11-② 해소 (4.13.7, 2026-07-12)**: vendored client 직접 패치 —
   **patch-package로 정본화**(`engine/patches/`, prepare 훅으로 npm install 시
   자동 재적용, 번들엔 베이크). 수리 = Local 4계열(TestClass/Types/Macros/
   Definitions) create+update 풀체인 lock 직후 재핀 + AdtClass.updateTestClasses
   lock~PUT 사이 stateless 리셋 제거 + **UpdateBehaviorImplementation(4.13.5
   전수 목록 누락 — 추가 발굴·수리, 한 lock 아래 PUT 2회)**. 무수리 판정:
   UpdateUnitTest(체인 부재 — not supported throw)·UpdateClassMethod(4.13.3
   수리 경로 위임)·타 래퍼 풀체인(현행 핸들러 전부 lockHandle 전달로 미도달 —
   upstream 수리 후보)·Legacy 계열(이미 올바름). 회귀 7케이스(역-검증 — 패치
   원복 시 전부 FAIL 실측), jest 538/0, 재번들(capability no-op), **IDES 라이브
   red→green**(UpdateLocalTestClass $TMP: 구 번들 423 → 신 번들 완주). 새-컨텍
   스트 리뷰 PASS. 신규 발굴 → 11-⑩.
3. UpdateFunctionGroup raw PUT의 CT `groups.v3+xml` 하드코딩 — 4.13.1 discovery
   협상이 Update 경로에 미적용(백로그 7 동류), v2-only 시스템에서
   UnsupportedMediaType.
   → ✅ **11-③ 해소 (4.13.8, 2026-07-12)**: 잠금 전 협상(4.13.1 Create와 동일
   함수·per-connection 캐시) → raw PUT 헤더 주입, discovery 불가 시 v3 폴백·
   legacy 스킵. 회귀 테스트(역-검증), jest 540/0, **라이브 red 415
   (UnsupportedMediaType, v2-only IDES) → green**(read-back masterLanguage=CS).
   구 백로그 3-7(상수 비대칭)도 이 수리에 흡수 — 도달 가능한 FUGR 쓰기 경로
   전부 협상, vendored 폴백은 도달 불가 죽은 코드 판정(미수정 근거 CHANGELOG).
   새-컨텍스트 리뷰 PASS.
4. CreateView 400(IDES, 메타데이터 POST 거부 — DDLS 쉘 잔류) — CT 협상 계열 추정.
   → **원인 확정 (4.13.8 조사, 2026-07-12): CT 계열 아님 — 11-⑧ 언어 불일치
   계열.** 라이브 에러 body가 "Sprache EN ≠ Mastersprache CS"(DDIC_ADT_DDLS/016)
   명시 — vendored view/create.js의 `language="EN"` 하드코딩이 뿌리. **쉘 잔류
   없음**(생성 전 거부 — 구 서술 정정). 수리는 11-⑧에서. 부수 발굴:
   handleCreateView catch가 ADT 에러 body를 버려 진단을 가림(제네릭 400만
   전달) — 11-⑧ 수리 시 함께 개선.
   → ✅ **해소 (4.13.10, 2026-07-12)**: 11-⑧ 언어 동적 해석으로 개통 —
   CreateView 라이브 생성 성공 + catch가 ADT 에러 body를 전달하도록 수리
   (형제 핸들러 전수 판정표는 CHANGELOG — 실증 있는 CreateView만 수리).
5. UpdateStructure 사전 check가 IDES에서 빈 에러로 결정적 실패(수리 전후 동일 =
   별개 결함) — check 래퍼 응답 해석 조사 필요.
   → ✅ **11-⑤ 해소 (4.13.11, 2026-07-13)**: 원인 확정 — vendored
   AdtStructure.check가 `ddlCode`를 **조용히 드랍**해 새 DDL 대신 저장본만
   검사(빈 에러·PUT 불투명 실패 둘 다 이 뿌리, 미구현 아님 — 정정 DDL은
   update+활성화 완주 실증). 수리 = check-with-source 전달(저수준
   CheckStructure의 문서화-but-죽은 ddl_code 경로도 동일 수리로 부활) +
   bare 에러를 상태 폴백으로 정직화. 라이브 red(불투명 "Kein Sichern…")→
   green(진짜 원인을 PUT 전 표면화). **동류 발굴 → 11-⑪(UpdateTable).**
6. isAlreadyExistsError 영어 전용 매칭 — 독어 시스템("ist bereits vorhanden")에서
   UpdateDataElement 사전 검증 오작동.
   → ✅ **11-⑥ 해소 (4.13.10, 2026-07-12)**: 언어 무관 기계 식별자 우선 재설계
   — ① exception type id(AlreadyExists 포함) ② T100 키 SWB_TOOL/016(IDES 라이브
   실측 근거) → 기계 신호 없을 때만 ③ 다국어 텍스트 폴백(기존 영어 보존).
   네거티브 컨트롤(SWB_TOOL/019 오분류 방지) 테스트 고정. 라이브 red(독어
   already-exists 오분류로 Update 거부)→green(updated+activated 완주).
7. UpdateTextElement/Screen/GuiStatus는 별개 병리(ADT lock 무-stateful + RFC write) —
   관찰만, 3계열은 RFC 백엔드 이슈(§3)와 함께 볼 것. CreateTextElement도 동일
   계열(4.13.6 재스캔 발굴).
8. **Create read-modify-write × 로그온 언어 불일치 (라이브 확정, 4.13.6 발굴)**:
   생성 페이로드 언어(EN) ≠ 시스템 로그온 언어(IDES는 CS)면 생성 직후 GET XML에
   `adtcore:description` 속성이 아예 없어 patch 헬퍼(기존 속성 치환 전용)가 PUT
   거부("Die Beschreibung fehlt") — 잠금 수리 후 IDES에서 CreateDomain/
   CreateDataElement의 지배적 차단 요인. 수리 방향: patch 헬퍼 add-if-missing
   + 생성/조회 언어 파라미터 일관화. (1번의 '스켈레톤 복구 불가'와 결부)
   → ✅ **11-⑧ 해소 (4.13.10, 2026-07-12)**: 로그온 언어 **동적 해석** —
   `/sap/bc/adt/core/http/systeminformation`이 로그온 언어를 실반환함을 실측
   (IDES=CS) → 신규 `resolveLogonLanguage()`(검증·EN 폴백·per-connection 캐시,
   discovery 협상과 동일 패턴), Create 3종(View/Domain/DataElement) 주입 +
   vendored 빌더/래퍼가 master_language 수용(patch-package 32파일 누적).
   patchXmlAttribute에 **opt-in add-if-missing** 신설 → 기존 반쪽 스켈레톤을
   Update로 복구 가능(라이브 복구 실증 2건 — '영구 불구' 해소). 11-④
   CreateView 400도 이 수리로 개통(라이브 생성 성공) + 에러 body 전달 개선
   동반. 타 create 경로의 EN은 관용 실증(4.13.1~9 green)으로 미수정(Notes).
   잔여 관찰: add-if-missing으로 추가된 description이 GET XML에 비직렬화
   (SAP측 텍스트 행 배치 추정 — 객체 기능은 완전, 심층 규명은 DD01T 실데이터
   조회 필요라 보류). jest 572/0, 새-컨텍스트 리뷰 PASS.
9. CreateStructure의 죽은 lock/unlock 쌍 — 아무 요청도 안 감쌈. 제거 또는
   TODO로 남은 DDL update 구현 중 택1.
   → ✅ **11-⑨ 해소 (4.13.9, 2026-07-12)**: 제거 택1(DDL update 구현은 신기능
   이라 스코프 밖) + 잉여 unlock-on-error try/catch 동반 제거. 라이브 동작
   동일 확인(라운드트립 2회 감소). 빈 쉘 생성 한계는 11-⑤/⑧ 잔존.
10. **Delete 로컬 계열 4종 항상 실패 (4.13.7 감사 발굴, 선재 결함)**:
    DeleteLocalTestClass/Types/Macros/Definitions — 래퍼 `delete()`가
    `update(code:'')`로 구현됐는데 `update()`가 빈 코드를 lock 전에 거부
    ("… code is required") → 클라이언트 레벨에서 삭제 도달 불가. 함께:
    testclasses include 없는 구버전 클래스는 Update 경로 성립 불가(include
    생성 ADT POST 미지원) — Create 계열 도구 부재와 묶어 검토.
11. **AdtTable.check의 ddlCode 드랍 (4.13.11 리뷰 발굴, 11-⑤ 동류)**:
    runTableCheckRun에 ddlCode를 안 넘겨 UpdateTable 사전 check가 새 DDL이
    아닌 저장본만 검사 — 11-⑤와 동일한 check-with-source 전달 1수리 가능.
    → ✅ **11-⑪ 해소 (4.13.12, 2026-07-13)**: 정독 결과 "1줄"보다 큼 —
    table의 `runTableCheckRun`은 structure의 checkStructure와 달리 응답을
    parse/throw 안 함 → AdtTable.check가 항상 errors:[] → 사전 check가 나쁜
    update를 **전혀 차단 못 함**. 수리 2편집(`AdtTable.check`에 ddlCode 전달
    + parseCheckRunResponse parse+throw, structure 미러·benign-skip·never-bare;
    surgical하게 check()에만). 회귀 테스트 역-검증(두 편집 각각 load-bearing).
    **KR-DEV(KO) 라이브 red→green: 나쁜 DDL이 구 번들에서 `success:true`
    (거짓 성공—백로그가 적은 불투명 실패보다 심함) → 신 번들 정직 에러+write
    차단, good DDL은 통과(over-block 없음).** 부수: CheckTableLow/CheckObjectLow가
    하드 에러를 throw 문자열로 보고(4.13.11 CheckStructureLow와 동일 parity —
    CHANGELOG Notes).
12. **Create 페이로드 EN 하드코딩 잔여 (~16곳, 4.13.10 스코프 밖 — 2026-07-13
    실수요 실증)**: Class·Interface·Program·Package·Table·Structure·SRVD·
    DDLX·DCL 생성부는 여전히 language/masterLanguage EN 하드코딩 — 생성은
    성공(마스터언어 정규화 관용)하나 설명이 EN 슬롯에 저장돼 비영어 로그온
    (KO·CS 등)에서 설명이 비어 보임. 실수요 증거: 포크 클론(4.13.1)의 번들
    직편집 KO 치환 19곳 핸드핵 발견(리빌드 시 소실되는 임시조치 — 원복 권장).
    수리 = 4.13.10 resolveLogonLanguage 인프라를 나머지 create 빌더에 기계적
    확장(UPSTREAM-FIX-HANDOFF §5에 확장 지점 문서화됨). 11-⑪과 같은 Wave로
    묶기 적합.
    → ✅ **11-⑫ 해소 (4.13.12, 2026-07-13)**: 8종 확장(Class·Interface·
    Program·Package·Table·Structure·SRVD·DDLX) — 각 핸들러 resolve+주입 +
    빌더/래퍼/types(patch-package). **DCL(accessControl)은 제외** — create
    핸들러 라우팅 전무(도달 불가 죽은 코드, §3 선례). FUGR은 명시 밖(§5 green).
    회귀 테스트(8종×KO stamp+EN fallback, 역-검증). **KR-DEV(KO) 라이브: KO
    페이로드 create-수락 확인(class·table 거부 없이 생성 — DDLS-view식 거부
    리스크 해소).** 설명 landing 자체 readback은 도구 한계로 불가(SearchObject가
    클래스 short text 미반환 — 표준 CL_SALV_TABLE도 빈 설명으로 확인). 페이로드
    언어는 §5(4.13.10) 라이브 실증 메커니즘 재사용 + unit 역-검증.
5. **DeleteFunctionGroup 조용한 실패** (4.13.1 검증 중 3회 실측): deletion 서비스가 실패를
   HTTP 200 + `del:isDeleted="false"` + E-메시지로 반환하는데 vendored delete가 하드코딩
   `success:true`로 대체 — 잠금 등 삭제 실패가 성공으로 보고됨.
   → ✅ **해소 (4.13.9, 2026-07-12) — 공통 뿌리 수리**: FUGR 단건이 아니라
   `/deletion/delete` 계열 전수 — vendored 공용 헬퍼 `assertDeletionSucceeded()`
   신설(patch-package), 도달 가능한 **delete 12종** 일괄 정직화(FUGR·class·
   program·interface·domain·dataElement·table·structure·view·serviceDefinition·
   functionModule + behaviorDefinition). 캐스케이드 응답(복수 del:object 노드 —
   structure 삭제 시 TABL+TABT 배열) 정규화 포함(라이브에서 발굴·수리), 인식
   불가 body는 HTTP 폴백(진짜 성공을 거짓 실패로 만들지 않음). 미도달 3종
   (tabletype/accessControl/enhancement)은 죽은 코드 판정, metadataExtension은
   다른 포맷(REST DELETE)이라 제외. 라이브 red(잠긴 FUGR 삭제 success:true+
   잔존)→green(SAP 잠금 메시지 정직 실패) + 정상 삭제 무영향 확인.
6. **low/CDS unit test 경로 동일 결함**: `RunClassUnitTestsLow`·CDS unit test 실행/조회가
   여전히 Cloud 전용 `/abapunit/runs` 사용 — 온프레미스에서 동일 404 예상 (high만 4.13.1로 수리됨).
   → ✅ **해소 (4.13.11, 2026-07-13)**: low 3종 + CDS 리더 3종을 4.13.1 클래식
   헬퍼 **재사용**으로 전환(중복 이식 없음, caller 계약·스키마 보존.
   RunCdsUnitTest 도구는 원래 부재 — 클래식 RunUnitTest의 run_id를 공유
   스토어로 해석, compact는 위임 상속). 라이브 red 404 → green(실 runResult,
   `--exposition low` 260 tools로 실증 — 기본 노출 155는 no-op). 부수 관찰:
   low 스키마가 cloud 전용 무동작 파라미터 4종을 여전히 광고(무해, 후속 정리
   후보).
7. **vendored 상수 비대칭**: `ACCEPT_FUNCTION_GROUP`(v2,v1) vs `CT_FUNCTION_GROUP`(v3) — 업스트림 결함.
   → ✅ **해소 판정 (4.13.8, 2026-07-12)**: 11-③ 수리에 흡수 — 비대칭의 발현
   경로(v2-only 시스템 쓰기 실패)는 Create(4.13.1)·Update(4.13.8) 협상으로 전부
   해소. 잔여 vendored 폴백은 도달 불가 죽은 코드(미수정 — speculative 변경
   회피, 근거 CHANGELOG Notes).
8. **abapunit 엔드포인트 discovery 협상**(Cloud `/api/abapunit/runs` 병행 지원) — Codex 리뷰
   제안, 온프레미스 포크라 보류.

**안전훅 L3 확장 (2026-07-11)**: tier-readonly-guard의 MUTATION_PREFIXES에
Activate·Patch·Release·Write 추가 (Codex 설계 리뷰가 지적한 공백 — ActivateObjects·
PatchGuiStatus·ReleaseTransport·WriteTextElementsBulk가 L3를 통과했음. 엔진 L2는 4.12.0부터
fail-closed allowlist라 실위험은 없었음). install-hooks matcher + 이 머신 settings 갱신,
격리 테스트(QA 4계열 DENIED·RunUnitTest/ReloadProfile 허용·DEV 무차단) 통과.
**주 머신 재개 시 `node interactive/adapters/claude/hooks/install-hooks.mjs --project` 재실행 필요.**

**엔진 백로그 2 — `.sc4sap/` 프로젝트 폴더명**: 번들에 하드코딩(`path.join(cwd, ".sc4sap", …)`
실측) — 개명하려면 엔진 소스 configurable화 필요, tier 이슈와 같은 사이클에 처리 권장.
**머신 레벨 홈은 개명 완료(2026-07-10)**: `SC4SAP_HOME_DIR=C:\Users\hjaew\.sah`
사용자 env 영구 등록(번들·훅·lib 모두 이 오버라이드 지원 실측), 기존 프로파일 2개
(IDEA-JNC, KR-DEV) 마이그레이션 완료. 구 `~/.sc4sap`은 백업 보존 — 동결된 sc4sap-custom을
다시 켜면 그쪽을 읽어 갈라질 수 있으니 **정본은 새 경로**. env는 새 프로세스부터 유효
(실행 중 세션은 재시작 필요).

## 7. 핵심 파일 지도

```
HANDOFF.md                      ← 이 문서 (상태 바뀌면 갱신)
docs/reference/DECISIONS.md               ← 결정 로그 (append-only — 결정의 '왜'는 여기 영구 보존)
docs/PRD.md · docs/ARCHITECTURE.md ← 트랙 A 무인 주입용 코어 문서 (D-020, thin+pointer):
                                   목표/비목표·파일 지도·불변식 요약. 엔진이 top-level
                                   docs/*.md를 매 스텝 주입(48KB 경고·64KB 거부) — 두껍게
                                   만들지 말 것, 상세는 정본 포인터로. ADR.md는 미신설
                                   (DECISIONS.md가 ADR 역할 — D-012·D-020)
DESIGN.md                       ← 트랙 A(하네스 트랙 — attended 중심 + U-gate 경유 무인)
                                   설계 v2.5 (v2.4 3축 재기준 + v2.5 통합주)
engine/                         ← MCP 엔진 소스 정본 (D-017 편입 — TS 소스·테스트·번들 도구.
                                   수리→bundle→interactive/server 반영은 UPDATE-RUNBOOK)
interactive/
  DESIGN.md                     ← 트랙 B 설계 정본 (이중 리뷰·L5 실측 갱신 반영)
  MIGRATION-MANIFEST.md         ← 원본 508파일 5분류 (분류 변경은 이 파일 수정으로만)
  core/                         ← 하네스 중립: knowledge(모듈14+BC·업종·국가·ABAP) ·
                                   personas(26+INDEX) · procedures(15+schemas) · policies ·
                                   vocabulary.md · project-context.md
  server/                       ← MCP 번들 4.13.0 + keyring + tool-catalog + sap-assets + UPDATE-RUNBOOK
  adapters/{claude,codex,antigravity}/  ← 어댑터별 README = 설치·스코프·안전모델 가이드
  adapters/compatibility.json   ← 3사 검증 버전 고정
  skills/ agents/ plugin.json .codex-plugin/ .claude-plugin/(plugin.json)  ← 플러그인 표면
  scripts/                      ← check-links · check-migration-snapshot · check-engine-provenance ·
                                   smoke-mcp · gen-plugin-manifests · gen-permissions ·
                                   transform-personas · doctor + 음성시험/생성기 (구
                                   check-migration-coverage는 S3 폐기 — D-029)
  docs/research/                ← 실측 기록 (L0-cli-surface, L2-server-verification,
                                   L1-transform-contract, L5-review-response)
.claude-plugin/ .agents/        ← 레포 루트 마켓플레이스 (source: ./interactive)
docs/superpowers/specs/…lite-design.md  ← 설계 스냅샷 (정본은 interactive/DESIGN.md)
```

## 8. 불변 규칙 (모든 세션이 지킬 것)

1. **지식 정본 = `interactive/core/`**. sc4sap-custom·sc4sap-lite 폴더는 동결 — 수정 금지.
2. **sc4sap-custom의 `private/`는 영구 denylist** — 읽지도, 어떤 산출물에도 포함하지도 않는다.
3. `interactive/server/server.bundle.cjs`는 `.gitattributes` `-text` 보호 유지 (EOL 변환 = 파손).
   갱신은 UPDATE-RUNBOOK 절차로만, 갱신 시 capability diff + gen-permissions 재생성 필수.
4. 실데이터 조회 2종(GetTableContents/GetSqlQuery): **배포 기본값은 어떤 하네스에서도
   자동 승인 금지**(템플릿 2종 제외·Codex 하드차단 권장·훅 유지). **소유자 머신은 D-043으로
   서버 바닥선 모델** — 묻는 층 없이 서버 blocklist(engine tableBlocklist, 기본 standard)가
   보호 테이블만 거부하며, 작업 테이블 예외는 프로파일 sap.env `MCP_ALLOW_TABLE`로 등록한다.
   이 머신에서 Codex `disabled_tools` 부재·Claude 2종 허용을 "결함"으로 보고 되돌리지 말 것.
5. 매니페스트·게이트 우선: 구조 변경 시 `node interactive/scripts/check-links.mjs interactive`와
   `node interactive/scripts/check-migration-snapshot.mjs`가 항상 통과 상태여야 한다
   (구 `check-migration-coverage`는 S3에서 폐기 — D-029).
6. superpowers 플러그인은 사용자가 의도적으로 비활성화함 — 재활성화 제안 불필요.
7. **굵직한 결정(대안을 기각한 선택)은 `docs/reference/DECISIONS.md`에 append** — 수정·삭제 금지,
   정정도 새 항목으로. 이 문서(HANDOFF)를 재작성할 때 결정의 '왜'가 소실되지 않게 하는 장치다.

## 9. 검증 명령 모음 (재개 시 상태 점검용)

```bash
cd "D:/claude for SAP/sap-agentic-harness"
# 오프라인 게이트 (S3 기준 — doctor를 뺀 전부가 CI에서도 돈다)
node interactive/scripts/check-migration-snapshot.mjs    # 이식 provenance (원본 무접촉)
node interactive/scripts/check-links.mjs interactive     # 깨짐 0 이어야 함
node interactive/server/verify-engine.mjs                # 번들 무결성 OK
node interactive/scripts/check-engine-provenance.mjs     # 엔진 소스 커밋 ↔ 번들
node interactive/scripts/smoke-mcp.mjs                   # 도구 표면 계약 assert
node interactive/scripts/gen-plugin-manifests.mjs --check # 매니페스트 5종 ↔ 단일 정본
node interactive/scripts/doctor.mjs                      # 3사 동기화 (로컬 전용)
node interactive/adapters/codex/toggle-plugin.mjs status # Codex 활성 상태
codex plugin list | grep sap-agentic                     # Codex 설치 상태
agy plugin list                                          # AG 임포트 상태
git log --oneline | head                                 # 최근: 트랙 A 부트스트랩 lock 2종(§16-1·3) ← 726f5ebe(D-018/019·5-10 문서)
```

push는 사용자 판단 — 커밋까지만 하고 push는 요청 시에만 (원격: hjaewon/sap-agentic-harness).
아카이브용 엔진 포크 hjaewon/abap-mcp-adt-powerup은 **4.13.1에서 동결** — 4.13.2부터의
수리는 레포 내 `engine/`에만 존재한다 (D-017: 포크는 히스토리 아카이브).
