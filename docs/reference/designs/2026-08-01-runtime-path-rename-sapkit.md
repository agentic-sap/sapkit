# 런타임 경로 개명 설계 — `.sc4sap` → `.sapkit` (D-041 Phase 2 개봉)

> 작성 2026-08-01 · **v4 (4차 리뷰 반영 — R-TIE를 대원칙 아래로 종속)** · 상태 = **설계 확정, 집행 미착수**.
> `interactive/DESIGN.md` §8-5가 "도그푸딩 뒤 재론"으로 보류한 Phase 2의 구현 사양이다.
> 집행은 §9 선행조건이 닫힌 뒤 별도 세션에서 한다.
> 정본 관계: 상태 = `HANDOFF.md` · 결정 = `DECISIONS.md`(집행 시 D-057 append) ·
> 트랙 B 설계 = `interactive/DESIGN.md`(집행 시 §8-5 갱신).

## 0. 한 문장 요약

**개명은 이름만 이중화한다** — `.sc4sap`을 보던 자리에 `.sapkit`을 후보로 추가할 뿐,
**legacy-only 입력의 결과와 각 소비자의 채택 기준(깊이·경계·state 정의)은 보존한다**(§4).
신·구 공존 시의 tie-break는 **소비자 채택 기준에 종속**된다(R-TIE — 순서를 뒤집으면
안전 경계가 약해진다). git 밖 상태는 crash-safe 마이그레이터로만 이행한다(§5).

## 1. 발단

사용자 요구(2026-08-01): "다른 프로젝트에서 플러그인을 쓰면 `.sc4sap` 폴더가 생긴다 —
`.sapkit`으로 바꾸고 싶다."

D-041 Phase 1이 플러그인·마켓·레포 이름을 옮겼을 때 런타임 경로는 Phase 2로 보류됐다
(`interactive/DESIGN.md` §8-5 — 서버 번들이 `.sc4sap`을 직접 읽고 tier 가드가 그 값으로
동작한다, §7 R3). 더 앞선 D-004(2026-07-10)는 머신 홈만 개명하고 프로젝트 폴더는
유지했는데, 기각 사유가 **"프로젝트 폴더명은 번들에 하드코딩 — 엔진 소스 configurable화
선행 필요"**다. 이 설계가 그 선행 조건을 수행한다. (D-004의 `SC4SAP_HOME_DIR=~/.sah`
등록은 D-046이 코드 기본값 `~/.sc4sap`로 정렬하며 실효됐고, 주 머신 실측도 env unset +
`~/.sc4sap/profiles/` 실재다.)

## 2. 리뷰 이력 — 4회

| 회차 | 대상 | 판정 | 결과 |
|---|---|---|---|
| 1차 | 범위 파악 초안(v0) | DEFER — BLOCKER 2 | 초안 결론 4문장 철회, v1 작성 |
| 2차 | v1 | NEEDS-FIX — BLOCKER 3·MAJOR 12 | R-B 철회 등, v2 작성 |
| 3차 | v2 | NEEDS-FIX — **BLOCKER 2(신규)** | **대원칙 재정립**(R-PRESERVE), v3 |
| 4차 | v3 (좁은 범위 — 대원칙 검증) | NEEDS-FIX — **BLOCKER 1** | **R-TIE를 대원칙 아래로 종속**, v4 |

리뷰어 = Codex(`gpt-5.6-sol` · high · read-only, 매회 새 컨텍스트). 지적은 메인
컨텍스트가 **원문 대조 확증 후** 반영했다.

### 2-1. v2 → v3에서 뒤집힌 것 (v3 → v4는 §10 참조)

| v2 | v3 | 확증 근거 |
|---|---|---|
| **공통 선택 알고리즘**으로 세 탐색기를 통일 시도 + tier 가드만 예외(R-SAFE) | **전 소비자 현행 의미 보존**(R-PRESERVE) — 통일 시도 자체를 폐기 | 아래 BLOCKER가 "일부만 예외" 방식의 구조적 한계를 드러냈다 |
| **`config.json` 단독은 state 아님**(모든 소비자 공통) | **철회** — 소비자별 state 정의는 현행 그대로 | `block-forbidden-tables.mjs:31`이 `resolveConfigJsonPath`를 그대로 쓴다. 즉 `config.json`은 **실데이터 차단 정책**(`blocklistProfile` minimal/standard/strict/custom)의 소스다. 공통 규칙으로 이를 건너뛰면 하위 strict를 무시하고 상위 minimal을 적용할 수 있다 — **row-data 노출은 회수 불가** |
| §11-5에 `MCP_ENV_PATH`/`--env-path` tier 정합을 "미정"으로 방치 | **범위 밖 + 별건 백로그로 명시** | `launcher.ts:251-254` — `profileProvidedConnection`이면 `reconcileTierFromEnv()` 스킵. **개명 이전부터 있던 결함**이며 개명이 악화시키지 않는다(§11-①). "미정"으로 두면 이 작업이 해결해야 할 것으로 오독된다 |
| 마이그레이터: rename 후 marker 기록 → "crash 시 staging만 남는다" | **marker를 staging 안에 먼저 쓰고 통째 rename** | v2 주장이 틀렸다 — rename 후 marker 전에 죽으면 **완전한 목적지가 즉시 활성 후보**가 된다 |
| both-valid = "이행 미완결 경고" | journal 있으면 **정상 공존**으로 판정 | copy-not-move라 성공한 이행도 양쪽이 valid다 → 모든 성공 사용자에게 **영구 오경고** |
| occurrence ledger(파일+regex+최대 발생 수) 688건 관리 | **3구역 방식**으로 단순화(§7-2) | 과잉. 688개 regex 영구 관리는 목적(외형 정리) 대비 비용 초과 |
| 계수 688 lines / 168 files | **662 / 167** + 재현 명령·기준 커밋 기록 | 리뷰어 재계수와 불일치 |

## 3. 범위 3분류 — occurrence 단위

`.sc4sap|SC4SAP_HOME_DIR` = **704 matching lines / 172 files**(2026-08-01 커밋
`786e6c3f` 기준, 본 설계 문서 제외). 집행 시 **기준 커밋과 재현 명령을 §7-2 게이트에
박제**하고 그 시점에 재계수한다 — 이 수는 다른 머신 작업으로 계속 움직인다(설계 v3
작성 시 662/167 → v4 시점 704/172, 07-27~31 커밋 6개가 유입).

```
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' '\.sc4sap|SC4SAP_HOME_DIR' .
```

**분류 단위는 파일이 아니라 등장 위치다** — 한 파일 안에 개명 대상과 무접촉 대상이
공존한다(§2-1 v1→v2에서 확인된 tool-catalog 사례).

### 3-1. 개명 — 런타임 경로·네임스페이스

`<project>/.sc4sap/` → `.sapkit/` · `~/.sc4sap/` → `~/.sapkit/` ·
`SC4SAP_HOME_DIR` → `SAPKIT_HOME_DIR`.

**주의 대상(파일 전체가 아니라 그 줄)**:
- `engine/src/handlers/system/readonly/handleReloadProfile.ts:27` — 도구 description
  (**모델이 읽는 텍스트**)
- `interactive/server/tool-catalog/sc4sap-mcp-tools-runtime.md:32` — `ReloadProfile`의
  현재 동작 계약(같은 파일의 파일명·링크는 §3-2)
- `interactive/scripts/get-vsp.mjs:56` — 하드코딩 폴백 `'~/.sc4sap/bin'`
- `engine/src/lib/rfcBackend.ts:44,98` 등 — 주석이 아니라 **사용자 노출 오류 메시지**
- **`interactive/docs/research/L1-transform-contract.md`** — "`.sc4sap/…` 그대로 유지"
  라는 **이 결정과 직접 충돌하는 문장**. 이식 계약 문서이므로 **역사 서술로 재표기**
  하거나 신 결정을 병기한다(단순 치환 금지 — 계약의 의미가 바뀐다)

### 3-2. 무접촉 — 원천(sc4sap-custom) 참조

`provenance/sc4sap-public-source.json` · `migration-map.json`의 `.sc4sap/**` 분류 ·
`scripts/report-sc4sap-public-drift.mjs` · `MIGRATION-MANIFEST.md`의 역사 분류 ·
"Ported from sc4sap-custom v4.14.0" 주석 · `sc4sap-mcp-tools-runtime.md`의 파일명·링크 ·
`SC4SAP_SRC`/`SC4SAP_DST`(이식·provenance 도구 변수).

`DECISIONS.md`는 기존 문장 무수정 + D-057 append.

### 3-3. 개명 금지 — 호환성 앵커

- ABAP `zrsc4sap_oop_ex*` / 텍스트 심볼 `SC4SAP_OOP_EX*`
- `keychain:sc4sap/<계정>`(사용자가 `sap.env`에 적는 **값**)
- **Windows credential target `<profile>/<user>.sc4sap`**(`scripts/vsp-env.ps1:118-123`)
  — 같은 파일이 §3-1 대상이면서 이 두 줄만 no-touch. **정확 문자열 시험으로 고정**

### 3-4. 삭제·정정 (개명 아님)

`engine/README.md`·`README.ko.md`의 `SC4SAP_POLICY` / `SC4SAP_POLICY_PROFILE` /
`SC4SAP_BLOCKLIST_PATH` / `SC4SAP_ALLOW_TABLE` — 엔진 소스·번들에 없는 죽은 표기
(실제 키 = `MCP_BLOCKLIST_PROFILE`·`MCP_ALLOW_TABLE`). D-046 P5와 같은 유형.

## 4. 경로 해석 — 대원칙과 세 규칙

### 4-1. 현행 실측 (소비자 4종, 정책 4종)

| 소비자 | 깊이 | 채택 기준 | 무엇을 읽나 |
|---|---|---|---|
| `engine/lib/profile.ts:96,104` | 0 (exact cwd) | 경로 직접 | 연결 env·tier |
| `server/launch.cjs:22-35` | 0 | 경로 직접 | 연결 env |
| `lib/profile-resolve.mjs:50-64` | 64 | state-aware(`active-profile.txt`‖`sap.env`‖**`config.json`**) | 연결 env · **config.json** |
| `hooks/tier-readonly-guard.mjs:66-75` | 8 | **존재 = 경계** | tier(못 정하면 **deny**) |
| `hooks/block-forbidden-tables.mjs:31` | (profile-resolve 경유) | 위와 동일 | **`blocklistProfile`** = 실데이터 차단 정책 |

**이 네 정책은 서로 다르고, 그 차이가 각자의 안전 의미를 담고 있다.**
tier 가드의 "존재 = 경계"는 격리 경계이고, blocklist의 `config.json` 인정은 정책
경계다. **통일하려는 시도가 곧 안전 경계 변경이다** — v1(R-B)과 v2(config.json 재정의)가
각각 그 함정에 빠졌고 리뷰가 둘 다 잡아냈다.

### 4-2. 대원칙

> **R-PRESERVE** — 개명은 **legacy-only 입력의 결과와 각 소비자의 채택 기준을
> 보존한다.** 깊이·채택 기준·경계·state 정의 모두 그대로다. 추가되는 것은 단 하나:
> **`.sc4sap`을 보던 모든 자리에서 `.sapkit`도 후보로 본다.**
>
> 따라서 이 작업은 안전 정책을 변경하지 않는다. 탐색기 통일·state 정의 재검토·
> 상위 프로필 상속은 **전부 범위 밖**이며 별도 D-결정을 요한다.

**문구의 정확성**(4차 리뷰 반영): "아무것도 바꾸지 않는다"는 과장이다. 신·구가 공존
하는 입력은 현행에 존재하지 않던 상황이므로 **새 판단이 불가피하다**(R-TIE). 정확한
주장은 ⑴ **`.sc4sap`만 있는 입력의 결과는 완전히 불변**이고 ⑵ **각 소비자가 후보를
채택하는 기준 자체는 불변**이라는 두 가지다.

**R-TIE는 이 원칙에 종속된다** — §4-3의 적용 순서가 그것을 강제한다. v3 초판은 R-TIE를
채택 기준보다 **먼저** 두었고, 그 결과 대원칙을 스스로 위반했다(4차 리뷰 BLOCKER).

### 4-3. 규칙 3개

> **R-TIE (한 조상 안 tie-break — 채택 기준에 종속)** — 어떤 소비자가 디렉터리 `D`를
> 검사할 때, **먼저 그 소비자의 현행 채택 기준을 `D/.sapkit`과 `D/.sc4sap` 각각에
> 적용한다.** 그 다음에만 tie-break가 개입한다:
>
> ```
> n_ok := <이 소비자의 현행 채택 기준>(D/.sapkit)
> o_ok := <이 소비자의 현행 채택 기준>(D/.sc4sap)
>
> if  n_ok && o_ok :  연결 완결성(active-profile.txt 비어있지 않음 ‖ sap.env)을
>                     가진 쪽 → 동점이면 .sapkit
> if  n_ok only    :  .sapkit
> if  o_ok only    :  .sc4sap        ← 여기가 핵심
> if  neither      :  이 조상은 후보 없음 → 소비자의 현행 로직대로 진행
>                     (상위로 가거나, tier 가드처럼 여기서 멈추거나)
> ```
>
> **`o_ok only` 분기가 대원칙을 지킨다.** `.sapkit`이 그 소비자의 기준을 통과하지
> 못하면 **없는 것과 같이 취급**되고, `.sc4sap`이 현행 그대로 채택된다.
>
> **왜 순서가 결정적인가**(4차 리뷰 BLOCKER): tie-break를 먼저 하면 —
> 같은 조상에 `.sapkit`(껍데기) + `.sc4sap`(`config.json`=strict), 상위에 minimal일 때
> `.sapkit`이 먼저 이기고 → state가 없어 상위로 올라가 → **strict가 minimal로 약화**
> 된다. 채택 기준을 먼저 적용하면 `n_ok=false, o_ok=true`(profile-resolve의 state에는
> `config.json`이 포함되므로)이라 **`.sc4sap`의 strict가 유지된다.**
>
> tie-break는 **한 조상 안에서 어느 세대를 보는가**만 정한다. 조상 순회(깊이·어디서
> 멈추나 = 경계)는 각 소비자의 현행 로직 그대로다.

> **R-NEW (신규 생성)** — 어떤 소비자든 런타임 디렉터리를 **새로 만들 때는 `.sapkit`**
> 이다. 각 소비자가 현행에 "없으면 만드는" 그 자리에 만든다
> (`resolveArtifactBase`는 `resolveWorkspaceRoot(startDir)` 기준이고 후보가 없으면
> 현행대로 `startDir` — 그 계약은 유지된다).
>
> **보장하는 것**: 신규 프로젝트에서 생기는 디렉터리는 `.sapkit`이다(사용자 요구 충족).
>
> **보장하지 않는 것**(4차 리뷰 반영): **프로젝트당 하나의 정본 디렉터리가 아니다.**
> `vpass.mjs:252`·`extract-spro.mjs:72`는 자기 cwd 기준 출력 경로를 쓰므로, 루트에
> `.sapkit`이 있어도 하위 디렉터리에서 실행하면 하위에 별도 `.sapkit/vpass`가 생길 수
> 있다. **이는 현행 `.sc4sap`도 동일한 성질**이므로 R-PRESERVE상 새 문제가 아니지만,
> "개명하면 폴더가 하나로 정리된다"는 기대는 성립하지 않는다. §7-3에 생성 위치 시험을
> 넣어 실태를 드러낸다.

> **R-ENV** — `SAPKIT_HOME_DIR`이 설정됐는데 경로가 없으면 **오류로 막는다**
> (`ENV_INVALID`). 구 env로 조용히 넘어가지 않는다. 미설정이면 `SC4SAP_HOME_DIR`
> (설정 시 deprecation 경고) → `~/.sapkit` → `~/.sc4sap` 순.
>
> **홈 선택**: "신 홈이 존재하면 승"이 아니라 **지정된 alias가 실제로 있는 홈**을
> 고른다. `~/.sapkit/profiles/<alias>` 있으면 신 홈, 없고 `~/.sc4sap/profiles/<alias>`
> 있으면 구 홈, 둘 다면 신 홈 + 경고, 어디에도 없으면 `PROFILE_NOT_FOUND`.
> (혼합 세대는 R-E 때문에 장기 지속되므로 이 검증이 필수다.)

### 4-4. 읽기·쓰기 대칭과 그 귀결

> **R-E** — 선택된 경로가 읽기·쓰기 모두를 받는다. 구 경로가 선택되면 새 산출물도
> 구 경로에 쓴다. 경로 이행은 오직 §5 마이그레이터로만.

**정직한 귀결**:
- **신규 프로젝트** — `.sapkit`이 생긴다(R-NEW). 사용자 요구 충족.
- **기존 프로젝트** — 마이그레이션 전까지 **`.sapkit`은 생기지 않고 새 산출물도
  `.sc4sap`에 쌓인다.** 폴더 이름이 자동으로 바뀌지 않는다.

**사용자 확정 (2026-08-01)** — 위 귀결을 제시하고 세 안(① 수동 이사 ② setup 재실행 시
감지·확인 후 실행 ③ 플러그인 자동 이사) 중 **①을 확정**했다. ②·③ 기각 — ②는 마법사
재실행이라는 우연한 시점에 자격증명 디렉터리 이동을 끼워 넣고, ③은 실행 중인 MCP가
연 파일과 `sap.env`를 사용자 인지 없이 옮긴다. **재론하지 않는다**(재개는 새 D-결정).
setup은 **감지·안내까지만**.

**받아들인 비용**(3차 리뷰 INFO 수용): 아무도 이사하지 않으면 기존 프로젝트의 개명
효과는 0이고 폴백·시험·문서 유지비가 영구화된다. 이를 완화하는 것이 §11-② 진단 명령이다.

### 4-5. reason 코드와 경고 채널

`OK_NEW` · `OK_LEGACY_DEPRECATED` · `ENV_INVALID` · `PROFILE_NOT_FOUND` · `COEXIST_OK`.

경고 채널은 소비자별로 고정한다 — MCP 서버는 **stderr 로거만**(stdout은 프로토콜),
훅은 JSON 응답 필드, CLI는 stderr. **세션당 1회**(프로세스 수명 내 dedup).

## 5. git 밖 상태의 이행 계약

### 5-1. 대상 (실측)

```
~/.sc4sap/     profiles/{IDES-DEV, KR-DEV}/ ← 자격증명 · bin/(vsp) · state · logs · work · hud-cache
<project>/.sc4sap/  active-profile.txt · config.json · logs · state · RULES.md · LESSONS.md
                    program/ · cbo/ · vpass/ · spro-config.json · customizations*
머신 설정      SC4SAP_HOME_DIR(설정된 머신) · .claude/settings.json(훅 6개)
               .claude/settings.local.json(권한) · vsp 설치 위치
```

### 5-2. `interactive/scripts/migrate-runtime-dir.mjs` (신설)

**상태 머신 — marker를 rename 안에 포함시켜 crash-safe를 성립시킨다**:

```
① preflight   목적지가 조금이라도 존재하면 거부 (Windows rename 제약 + 병합 금지)
               symlink/junction/reparse point 발견 시 거부
               쓰기 주체 정지 확인 (§5-3)
               포함 manifest(§5-4) 밖 항목 열거 → 보고만
② snapshot    소스 사전 manifest: 경로·크기·mtime·sha256 (+ secret-bearing은 mode/ACL)
③ staging     같은 파일시스템의 <parent>/.sapkit.staging-<ts>/ 에 복사
④ verify      소스 사후 manifest = 사전과 동일한가(이행 중 변경 감지)
               staging sha256 = 소스 일치 · secret-bearing mode/ACL 보존 확인
⑤ seal        journal을 **staging 안에** 기록 (.migration-journal.json)
⑥ commit      atomic rename: staging → 목적지  ← journal이 함께 들어간다
```

**crash 안전성**: ⑥ 이전에 죽으면 목적지는 **존재하지 않고** `.sapkit.staging-<ts>`만
남는다. 이 이름은 어떤 소비자의 후보(`.sapkit`/`.sc4sap`)와도 일치하지 않으므로 활성화
되지 않는다. ⑥이 원자적이므로 **"완료 marker 없는 완전한 목적지"라는 중간 상태가
존재하지 않는다.** (v2는 marker를 rename 뒤에 뒀고, 그 사이 crash가 바로 그 상태를
만들었다 — 3차 리뷰 지적.)

| 항목 | 사양 |
|---|---|
| 방식 | copy-not-move (원본 무삭제) |
| 기본 | **dry-run** — 실제 이행은 `--apply` |
| 대상 | `--scope home‖project‖both` |
| 목적지 존재 | **거부**(병합·덮어쓰기 없음) |
| 자격증명 | `sap.env`·`profiles/`만 mode(POSIX)/DACL 상속 결과(Windows) 검증 |
| vsp | 복사 안 함 — `get-vsp.mjs`를 새 홈으로 재실행(sha 검증 경로) |
| env | `SAPKIT_HOME_DIR` 재등록 **안내만**(사용자 환경변수는 도구가 안 건드린다) |
| 훅·권한 | `install-hooks.mjs` 재실행 + 권한 재병합 **안내만** |
| `--revert` | journal 이후 목적지 변경 탐지 → **무변경일 때만** 자동. divergence면 **병합 없이 거부** + 수동 안내 |
| `--status` | 프로젝트·홈별 현재 선택 경로·세대·마지막 write 시각 보고 (§11-②) |
| 실행자 | **사람만.** 에이전트 대행 금지 |

### 5-3. "쓰기 주체 정지 확인"의 실행 가능 사양

v2의 이 항목은 3차 리뷰가 "구호"라고 지적했다. 실행 가능한 형태:

1. **사람 확인** — MCP 서버를 쓰는 하네스 세션을 모두 종료했는지 대화형 확인
   (`--yes`로 생략 가능하되 그 경우 2·3이 유일한 방어)
2. **잠금 시도** — 소스의 `active-profile.txt`·`sap.env`를 배타 모드로 열어본다.
   실패하면 사용 중으로 판정하고 거부(Windows에서 실효, POSIX는 best-effort)
3. **commit 직전 재스냅샷**(④의 사후 manifest) — 이행 중 변경이 있었으면 실패 처리

3번이 최종 방어선이며, 1·2는 조기 실패용이다.

### 5-4. 포함·제외 manifest

**포함** — `active-profile.txt` · `config.json` · `sap.env` · `RULES.md` · `LESSONS.md` ·
`program/` · `cbo/` · `vpass/` · `work/` · `spro-config*.json` · `customizations*` ·
`profiles/`(홈)

**제외** — `logs/` · `state/` · `hud-cache/` · `bin/`(vsp 재설치) · `.staging-*` ·
`.migration-journal.json`

**미분류** — 어디에도 없는 항목은 **이행하지 않고 열거만**(추측 이행 금지).

### 5-5. 이행 성공 후의 정상 상태

copy-not-move이므로 **성공한 이행도 신·구 양쪽이 valid-state로 남는다.** 이것을
"이행 미완결"로 경고하면 성공한 모든 사용자에게 영구 오경고가 난다(3차 리뷰 지적).

> 판정 규칙: 목적지에 `.migration-journal.json`이 있고 그 journal이 현재 소스를
> 가리키면 **`COEXIST_OK`(정상 공존)** — 경고하지 않는다. journal이 없는 both-valid만
> "이행 미완결" 경고 대상이다.

### 5-6. 롤백의 정의

1. **코드 복귀** 2. **역이행**(`--revert`) 3. **재배선**(`install-hooks` + 권한 재병합)

**보장 범위**: 마이그레이션 전이고 **구 경로가 선택돼 있었으며 기록 형식이 구버전과
호환되는 범위**에서만 1번만으로 안전하다. 신규 프로젝트가 `.sapkit`으로 시작했거나
새 형식 산출물이 쓰였다면 구버전은 읽지 못한다 → **산출물 스키마 하위호환 시험**(§7-3).

## 6. 확정 범위표

| # | 층 | 대상 |
|---|---|---|
| 1 | 엔진 소스 | `lib/profile.ts`(R-TIE·R-NEW) · `rfcBackend.ts:44,98` · **`handleReloadProfile.ts:27`** · `handleGetBadiImplementations.ts:86` · `nativeRfc.ts` · `odataRfc.ts` · `gatewayRfc.ts` · `zrfcProxy.ts` · `launcher.ts` |
| 2 | 엔진 테스트 | `__tests__/lib/profile.test.ts` + §7-3 fixture |
| 3 | 엔진 빌드·버전 | `engine/dist/*` · **semver 범프 + `CHANGELOG.md`** |
| 4 | 번들 | `server.bundle.cjs`(8곳) · `server/VERSION` integrity 재핀 — **UPDATE-RUNBOOK으로만** |
| 5 | 런처·리졸버 | `launch.cjs:22-35` · `profile-resolve.mjs`(**state 정의 무변경**, R-TIE만 추가) |
| 6 | 훅 | `tier-readonly-guard.mjs`(**경계 의미 무변경**) · `block-forbidden-tables.mjs`(**정책 소스 무변경**) · `offline-code-analysis.mjs` · `install-hooks.mjs`(등록 6개 유지) |
| 7 | 도구 | `tools/vpass/vpass.mjs` · `tools/extract/`(3) · `tools/spec/build-spec.mjs` |
| 8 | **게이트 자신** | `scripts/lib/target-hash.mjs:45` — `NOT_ASSET_DIRS`에 **신·구 둘 다** |
| 9 | vsp | **`scripts/get-vsp.mjs:56`** · `vsp-release.lock.json` `install_dir` — installer와 소비자가 같은 홈을 고르게 |
| 10 | 공방 스크립트 | `scripts/vsp-env.ps1`(단 `:118-123` no-touch) · `promote-track-b-run.ps1` · `test-promote-track-b-run.ps1` |
| 11 | 스키마 | `core/procedures/schemas/*.json`(4) · `scripts/review-gate/schemas/*.json`(2) |
| 12 | 권한 | `scripts/gen-permissions.mjs:67-69` → `permissions-template.json` — **폴백 기간 신·구 6줄** |
| 13 | ignore | `.gitignore` 4개 — **신·구 둘 다** |
| 14 | 문서(제품) | **절차 22 · 스킬 17**(2026-08-01 기준 — 계수는 집행 시 재확인) · 페르소나 26 · 정책 8 · `core/project-context.md` · **`core/knowledge/**`** · **`agents/sap-reviewer.md`** · 어댑터 README 3 · **`adapters/codex/AGENTS-template.md`** · **`server/tool-catalog/README.md`** + `sc4sap-mcp-tools-runtime.md:32` |
| 14b | **문서(07-27~31 신규 유입)** | **`agents/sap-worker.md`(3건)** · **`core/procedures/knowledge.md`(7)** · **`core/procedures/package-to-process.md`(10)** · **`skills/knowledge/SKILL.md`(2)** · **`skills/package-to-process/SKILL.md`(1)** — D-051~056 작업이 추가한 표면. **집행 시점에 같은 방식으로 재조사할 것**(설계 확정과 집행 사이에 표면이 계속 늘어난다) |
| 15 | 문서(공방) | **`adapters/vsp/SAFETY-PROFILES.md`·`VERIFY-PATTERNS.md`** · **`packs/modules/fi/CONSULTANT.md`** · **`interactive/docs/research/*`**(특히 `L1-transform-contract.md` §3-1) · **`engine/docs/installation/*`·생성된 `AVAILABLE_TOOLS*.md`** · **`engine/tests/test-config.yaml.template`** |
| 16 | 신설 | `migrate-runtime-dir.mjs`(§5) · `check-runtime-path-rename.mjs`(§7-2) + 각 음성시험 |
| 17 | 핀·버전 | plugin-metadata **다음 minor**(작성 시 v0.4.0 예정이었으나 원격이 이미 v0.4.3 — 집행 시 현행+1) · 매니페스트 5종 재생성 · 이식 스냅샷 재핀(**최후**) |

14·15의 굵은 항목은 3차 리뷰가 찾아낸 누락분이다.

## 7. 게이트와 시험

### 7-1. 기존 게이트로는 부족하다

`check-links.mjs`는 링크·앵커만 본다. `check-migration-snapshot.mjs`는 재핀하면 잘못된
치환도 승인한다. `doctor.mjs`는 훅 파일 실재만 본다.

### 7-2. 신설 — `check-runtime-path-rename.mjs` (3구역 방식)

v2의 "occurrence ledger 688건"은 과잉이었다(3차 리뷰). 대신 **경로를 3구역으로 나눈다**:

| 구역 | 규칙 |
|---|---|
| **활성 소스·제품 문서** | legacy 토큰 **전면 금지**(발견 시 FAIL) |
| **역사·provenance**(§3-2 경로) | 스캔 **제외**(경로 단위) |
| **안전 앵커**(§3-3) | **정확 문자열 시험** — 있어야 PASS(사라지면 FAIL) |

추가 검사: 폴백 의무(코드·ignore 4개·권한 템플릿이 신·구 둘 다) · `target-hash.mjs`
신·구 제외 · **기준 커밋과 재현 명령 박제**(§3 계수).
음성시험 `test-check-runtime-path-rename.mjs` — 활성 구역에 legacy 토큰 1개 주입 시
FAIL · 안전 앵커 삭제 시 FAIL.

### 7-3. 적합성 시험

**단일 fixture 파일**(`fixtures/runtime-dir-selection.json`)에 **공통 입력 + 소비자별
기대 결과**를 담고, 엔진 Jest와 Node conformance runner가 **같은 파일을 읽는다**
(구현 모듈 공유는 강제하지 않는다 — 3차 리뷰 수용).

**소비자별 기대 결과가 다른 것이 정상이다** — R-PRESERVE상 현행 정책 차이가 보존되므로.
시험의 목적은 "모두 같은 답"이 아니라 **"각 소비자가 개명 전과 동일하게 동작하는가"**다.

케이스 축:
- R-TIE: 신·구 조합 × 연결 완결성 유무
- **깊이 0 · 7 · 8 · 63 · 64**(9는 8과 중복이라 제외 — 3차 리뷰 수용)
- env: 신만 / 구만 / 둘 다 / **신이 잘못된 경로(= `ENV_INVALID`)**
- 홈: alias가 신 홈에만 / 구 홈에만 / 양쪽 / 없음
- **안전 회귀 고정** (4차 리뷰로 3종 → 9종 확장):
  1. 하위 artifact-only + 상위 DEV = **deny 유지**(tier 가드) — v1 회귀 봉쇄
  2. 하위 `config.json`=strict + 상위 minimal = **strict 유지**(blocklist) — v2 회귀 봉쇄
  3. **같은 조상에 신=artifact-only + 구=`config.json` strict, 상위 minimal
     → 구 strict 유지** — **R-TIE 순서 회귀 봉쇄**(v3 초판 BLOCKER). 이 케이스가
     tie-break를 채택 기준보다 먼저 두면 즉시 red가 된다
  4. 같은 조상에 신=`config.json` minimal만 + 구=`sap.env` DEV + strict
     → 모든 관련 소비자가 **구 선택**
  5. 같은 조상에 신·구 둘 다 연결 완결 · 신=DEV·구=PRD → 연결·tier·blocklist가
     **함께 신 선택**(R-TIE 정상 발동). 신·구 config에 **식별 가능한 다른 정책값**을
     넣어 어느 쪽을 읽었는지 판별 가능하게 한다
  6. 신·구 `blocklist-extend`/`custom` 파일이 다를 때 **선택된 config와 같은 세대**의
     사용자 목록을 읽는가
  7. 홈 세대 혼합: 신 프로젝트 포인터 + 구 홈 alias / 구 포인터 + 신 홈 alias /
     양쪽 홈에 같은 alias인데 **tier가 다름**
  8. 마이그레이션 왕복: apply 후 = 신 선택(`COEXIST_OK`) · `--revert` 후 = 구 선택 ·
     제거된 경로를 가리키는 `SAPKIT_HOME_DIR` = `ENV_INVALID`
  9. **R-NEW 생성 위치**: 서로 다른 cwd에서 실행 시 실제 생성 위치와 **중복 디렉터리
     발생 여부**(§4-3 비유일성의 실태 기록)
- 산출물 스키마 하위호환(§5-6)
- 구 `.sc4sap`이 계속 ignore·권한 허용되는가

**시험 seam** — 소비자별로 구동 방식이 다르다(4차 리뷰 실사):

| 소비자 | 구동 |
|---|---|
| engine | 기존 Jest 임시 디렉터리 패턴 |
| profile-resolve | export 함수 직접 호출 |
| tier-guard · block-forbidden-tables | 임시 cwd/env + JSON stdin으로 자식 프로세스 |
| launch.cjs | 별도 실기동 smoke |
| **vpass · extract** | **현재는 불가** — top-level cwd·네트워크 실행과 결합돼 있다.<br>경로 계산을 **순수 helper로 분리**하거나 `--resolve-only` 비접속 seam을 추가한다(§6-7 작업에 포함) |

`engine/dist` 결과와 `launch.cjs` 실기동은 별도 smoke + **CI job 등록**.

### 7-4. 3사 확인

Codex·Antigravity는 별도 리졸버 없이 공통 launch shim을 쓴다. D-041 이후 재설치·실연결
미실측이므로 **3사 각각 new-only·old-only 기동**을 §8-9에 넣는다. 미수행 시 "3사 호환"을
주장하지 않고 유보로 기록.

## 8. 집행 순서

`integrity.sourceCommit`은 실재 커밋이며 **번들 소스를 마지막으로 바꾼 커밋과 일치**
해야 한다(`check-engine-provenance.mjs:82`).

1. `interactive/DESIGN.md` §8-5 갱신 + 본 문서 상태 갱신 (**D-057 append는 11번 뒤**)
2. 엔진 소스·테스트·dist + semver·CHANGELOG → jest green → **커밋 A**
3. A의 SHA로 번들·VERSION·integrity 재핀 → `verify-engine` + `check-engine-provenance`
   green → **커밋 B**
4. 런처·훅·도구·vsp·공방 스크립트·스키마·문서·권한·ignore (§6의 5~15)
5. 마이그레이터 + rename 게이트 신설 + 각 음성시험
6. plugin-metadata 버전 범프(현행+1) + 매니페스트 5종 재생성
7. **모든 편집 후** 이식 스냅샷 재핀 (D-048 교훈)
8. 게이트 7종 + 음성시험 전종 + §7-3 적합성 시험
9. **canary** — 시험 프로젝트 dry-run→apply→revert · 3사 new/old 기동 ·
   **bootstrap 시간·수동 단계 수 측정**(§9)
10. **canary 실패 시 층별 복귀** — 엔진/selector 결함 → **2번** · 번들·핀 → **3번** ·
    어댑터/문서 → **4번** · 마이그레이터 → **5번** · 외부 환경(3사 설치) → **원인
    판정 후 §7-4 유보 처리**. **동일 층 2회 실패 시 중단하고 원인 재판정**(무한 루프 방지)
11. **최종 새-컨텍스트 독립 리뷰** — 정책·계약 층이므로 **이종 교차 리뷰**(D-048 교훈)
12. **D-057 append**(append-only이므로 내용 확정 후) + HANDOFF 갱신
13. 실사용 머신 이행은 사용자 판단 (도그푸딩 프로젝트가 마지막)

## 9. 선행조건과 KPI

**착수 선행조건**:
1. CheckSyntax #12 라이브 red→green 종결(UPSTREAM Known-remaining #12)
2. ZUNIWHT/ZUNIVAT 왕복의 checkpoint 확보
3. 사용자의 명시 착수 지시

**D-040 KPI** — v1은 "KPI 교란 요인 아님"을 근거로 baseline을 선행조건에서 뺐으나
**그 근거는 틀렸다**: D-040 ② 2순위가 "cold install/업데이트/프로젝트별 bootstrap의
시간과 **수동 단계 수**"이고 마이그레이터·env 재등록·재배선이 정확히 그 수를 늘린다.

처분: baseline을 **착수 BLOCKER로 삼지 않는다**(D-040 원문은 baseline을 모든 변경의
선행조건으로 강제하지 않고 "baseline 전 **달성 선언** 금지"만 한다). 대신 §8-9 canary
에서 **측정하고**, 이 작업에 대해 **어떤 경량화 개선도 주장하지 않는다.**

## 10. 반증 기록

**v0(초안)**: "무리 없다 1.5~2세션" / "동작 좌우 파일 10개 안팎" / "`plugin update`만
하면 됨" / "커밋 롤백 가능" — **4문장 전부 반증**(§2 1차 리뷰).
**v1**: R-B(tier state-aware 표준화)가 deny→allow 회귀 — 철회.
**v2**: `config.json` state 제외의 전 소비자 일반화가 blocklist 약화 · 마이그레이터
crash-safe 주장 오류 · both-valid 영구 오경고 — §2-1.

**v3 초판**: R-PRESERVE를 세워놓고 **R-TIE를 그 위에 올려** 대원칙을 스스로 위반 —
tie-break가 소비자 채택 기준보다 먼저 발동하면 v2의 blocklist 약화가 공존 상태에서
재발한다(§4-3). "아무것도 바꾸지 않는다"는 문구도 과장이었다(신·구 공존은 현행에
없던 입력이므로 새 판단이 불가피하다) → "legacy-only 결과 + 채택 기준 보존"으로 정확화.

**교훈**: 네 번 모두 같은 실패였다 — **"정합을 위해 통일하려는 시도"가 안전 경계를
건드렸다.** v1은 tier를, v2는 blocklist 정책 소스를, v3 초판은 tie-break 순서로
같은 것을 반복했다. **v4는 R-TIE를 채택 기준에 종속시켜 그 경로를 닫았고, §7-3의
케이스 3이 이 회귀를 기계적으로 고정한다** — 원칙만으로는 부족하고 시험이 붙어야
같은 실패가 재발하지 않는다는 것이 이 설계가 얻은 마지막 교훈이다.

## 11. 유보 · 범위 밖

1. **`MCP_ENV_PATH`/`--env-path` tier 불일치 = 범위 밖 · 별건 백로그** —
   `launcher.ts:251-254`에서 `profileProvidedConnection`이면 `reconcileTierFromEnv()`를
   건너뛴다. 프로젝트 프로필=DEV이고 `--env-path`=PRD면 **실제 연결은 PRD인데 가드
   캐시는 DEV**일 수 있다. **개명 이전부터 있는 결함**이며 R-PRESERVE상 개명이 이를
   악화시키지 않는다(경로 이름만 이중화되고 활성화 조건은 불변). 그러나 실재하는
   안전 결함이므로 **별건 백로그로 승격**한다 — 수리 방향: 명시적 연결 source가 프로필
   source와 다르면 **실제 broker source가 tier 권위**, 누락·파싱 실패는 UNKNOWN deny.
2. **탐색 깊이·정책 불일치 = 범위 밖** — engine/launch=0 · tier-guard=8 · resolve=64.
   R-PRESERVE상 개명이 악화시키지 않으며, **"모든 소비자가 같은 디렉터리를 고른다"는
   보장을 하지 않는다.** §7-3 깊이 케이스가 갈리는 지점을 기계적으로 문서화한다.
3. **폴백 제거 시점** — 최소 v0.4.x 유지, **v1.0 이전 제거 금지**. 조건 = 별도 D-결정 +
   마이그레이터 실측 + **`--status` 진단**(§5-2) + 한 릴리스 이상 경고. R-E 때문에
   legacy 사용이 자연 소멸하지 않으므로 진단 없이는 제거 조건이 영구 미충족일 수 있다.
4. **`~/.sc4sap/`의 `hud-cache`·`work`·`state` 생성 주체 미확인**(sc4sap-custom 유산
   추정) — §5-4 미분류로 열거만.
5. **구현 전 확정 (등급 판정 완료)**:
   - state 파싱 수준(존재 vs 파싱 성공) — **구현 시 확정**: R-PRESERVE상 현행과 동일하게
     "존재 기반 + downstream fail-closed"를 유지한다
   - 빈 `active-profile.txt` — **확정**: R-TIE ⑴의 연결 완결성 판정에서 "비어 있지 않음"을
     요구하므로 빈 파일은 완결성 없음으로 취급(미결에서 제거)
   - custom home source/destination 계산 — **구현 시 확정 필요**(잘못 계산하면 자격증명
     복사 위치가 달라진다). `--scope home`에서 source = R-ENV 선택 결과, destination =
     같은 부모의 `.sapkit`
   - journal 작성 시점 — **확정**: §5-2 ⑤ staging 내부 기록(rename 이전)
6. **clean break 기각 유지** — 구 버전 플러그인과 기존 프로젝트가 공존한다.
7. **기능 이득은 0이다.** 기존 프로젝트는 사용자가 마이그레이터를 돌리기 전까지 폴더
   이름이 그대로다(§4-4).

## 12. D-057 초안 (§8-12에서 append)

> **D-057 — 런타임 경로 `.sc4sap` → `.sapkit` 개명 (D-041 Phase 2 개봉 · D-004 선행조건 이행)**
>
> **채택**: 폴백 병행. 대원칙 = **R-PRESERVE — 개명은 legacy-only 입력의 결과와 각
> 소비자의 채택 기준(깊이·경계·state 정의)을 보존하고, `.sc4sap`을 보던 자리에
> `.sapkit`을 후보로 추가할 뿐이다.** 규칙 3개: **R-TIE**(한 조상 tie-break — **반드시
> 소비자 채택 기준을 먼저 적용한 뒤**, 양쪽 다 채택 가능할 때만 연결 완결성 → 동점이면
> 신. 순서를 뒤집으면 하위 strict가 상위 minimal로 약화된다) · **R-NEW**(새로 만들 때는
> `.sapkit` → 신규 프로젝트 요구 충족. **단 프로젝트당 단일 정본 디렉터리는 보장하지
> 않는다** — 현행 `.sc4sap`도 동일) ·
> **R-ENV**(잘못된 `SAPKIT_HOME_DIR`은 조용한 폴백 없이 오류 / 홈은 alias 실재로 선택).
> **R-E**: 선택된 경로가 읽기·쓰기 모두 수신("읽기만 폴백"은 부분 이행 자동 생산·롤백
> 오염이라 기각) → **기존 프로젝트는 사용자가 마이그레이터를 실행하기 전까지 폴더명
> 유지**(2026-08-01 사용자 확정: 수동 이사, setup 자동 실행·플러그인 자동 이사 기각,
> setup은 감지·안내까지만).
>
> **기각한 것과 그 이유(3회 리뷰의 산물)**: ⑴ 탐색기 통일 — tier 가드의 state-aware
> 표준화가 하위 artifact-only + 상위 DEV에서 **deny→allow 회귀**를 만든다 ⑵ `config.json`
> 을 state에서 제외 — `block-forbidden-tables`가 그 파일의 `blocklistProfile`을 **실데이터
> 차단 정책**으로 읽으므로 하위 strict를 상위 minimal이 덮을 수 있다(**row-data 노출은
> 회수 불가**) ⑶ clean break — 구 버전 공존.
>
> **git 밖 상태**: copy-not-move 마이그레이터로만 이행. 상태 머신 =
> preflight(목적지 존재 시 거부·symlink 거부·쓰기 주체 정지) → snapshot → staging →
> verify → **journal을 staging 안에 seal** → **atomic rename**(journal 포함). 이 순서라야
> "완료 marker 없는 완전한 목적지"가 존재하지 않는다. journal이 있는 both-valid는
> `COEXIST_OK`(정상 공존, 무경고). 롤백 = "코드 복귀 + 역이행 + 재배선"이되 보장 범위는
> "구 경로 선택 + 형식 호환"으로 한정.
>
> **범위 밖(별건)**: `MCP_ENV_PATH`/`--env-path` tier 불일치(`launcher.ts:251-254` —
> 개명 이전부터의 결함, **안전 백로그로 승격**) · 탐색 깊이 불일치(0/8/64).
>
> **분류**: occurrence 단위(파일 단위 분류가 실제 결함을 숨긴 실례 = tool-catalog `:32`).
> 원천 참조·ABAP `ZRSC4SAP_*`·keychain 서비스명·Windows credential target은 무접촉.
> **경량화 개선은 주장하지 않으며** canary에서 bootstrap 수동 단계 수를 측정한다(D-040 ②).
>
> **회귀 고정**: §7-3 안전 케이스 9종이 위 세 실패(tier fail-open · blocklist 약화 ·
> tie-break 순서)를 기계적으로 red화한다. 원칙 서술만으로는 재발을 막지 못한다는 것이
> 4회 리뷰의 결론이다.
>
> 근거 = 설계 `docs/reference/designs/2026-08-01-runtime-path-rename-sapkit.md`(v4),
> Codex 이종 교차 리뷰 4회(DEFER → NEEDS-FIX ×3, **BLOCKER 8건 전건 원문 확증**).
