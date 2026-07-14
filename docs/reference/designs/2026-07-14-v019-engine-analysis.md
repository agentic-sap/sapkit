# v0.19 엔진 read-only 정밀 분석 (트랙 A 재기준 단계 1 산출물)

> Codex(gpt-5.6-sol, max effort, read-only)가 엔진 커밋 `929685a`(v0.19.2) blob
> 기준으로 정독한 결과. 2026-07-14. 트랙 A 재기준 설계서(D-024 단계 1)의 사실 기반.
> 검증: F1(vsp 부재)·RV4(deploy 목록 vsp 부재)·트랙 B 훅 basename 비충돌은 메인이 재확인.
> 산출물 1=F-불변식 재정의, 2=마이그레이션 표면, 3=RV4 경계. 모든 판정에 파일:행 좌표.

---

> **경고 — 요청한 checkout 조건 불충족.** 현재 저장소는 `HEAD fd86ba00f57784a370468e03d57154d46e8abfde`, 플러그인 버전 `0.19.3`이다. 요청한 `HEAD 929685a`가 로컬 Git 객체로 존재하고 그 객체의 플러그인 버전은 `0.19.2`다(`.claude-plugin/plugin.json:2-4`). 아래 모든 코드 좌표와 판정은 현재 파일이 아니라 정확한 대상 객체 `929685acc430a2140a7e77508db35bc66badaa82`의 blob 기준이다.

# 산출물 1 — F-불변식 재정의

## F1 — Headless 세션의 MCP 0개 기동

**판정: ② 메커니즘·적용 범위 보정 필요.**

- Claude headless step은 `--strict-mcp-config`를 지정하고 별도 `--mcp-config`를 주지 않는다. 코드 주석과 명령 구성은 이를 “프로젝트·사용자 MCP를 무시하여 서버 0개”로 정의한다. advisory/review Claude 세션에도 같은 플래그가 붙는다(`skills/harness-init/templates/engine/scripts/execute.py:2725-2734`, `:3269-3273`).
- Codex는 시작 시 `codex mcp list --json`을 먼저 실행한다(`skills/harness-init/templates/engine/scripts/execute.py:759-762`, `:3192-3199`). 각 서버 이름에 `-c mcp_servers.<name>.enabled=false`를 만들며, 일반 이름이 아니면 JSON 문자열로 인용한다(`:3224-3239`). 이 플래그는 step과 advisory 양쪽에 붙는다(`:2716-2717`, `:3263-3264`).
- 실행 실패·timeout·nonzero·JSON 파싱 실패·최상위 비-list·항목 비-dict·빈/비문자열 이름은 모두 기동 거부다(`:3200-3232`).
- 단, `returncode=0`이면서 stdout이 빈 문자열이면 `json.loads(res.stdout or "[]")` 때문에 서버 0개로 간주해 통과한다(`:3209-3210`). 따라서 “모든 열거 실패가 fail-closed”라고 넓게 표현하면 부정확하다.
- 이 보증은 `claude`/`codex` CLI 자식에 한정된다. Bridge는 기존 대화 세션의 MCP를 제거하지 않으며, 연결된 파일·명령 쓰기 MCP를 worker에서 사용하지 말라는 알려진 한계가 명시돼 있다(`README.md:163-165`, `:207-208`).

재정의된 F1은 다음과 같다.

> Headless Claude step/advisory는 `--strict-mcp-config`, Codex step/advisory는 성공적으로 열거된 모든 named MCP 서버의 `enabled=false`로 기동한다. Codex 열거의 실행·형식 오류는 기동 거부지만 성공 코드+빈 stdout은 빈 목록으로 취급한다. Bridge는 MCP 0개 보증 대상이 아니다.

엔진 소스에는 `vsp`·`ABAP` 식별자가 전혀 없으므로, “vsp가 유일한 SAP 접점”이라는 트랙 A 전체 구성 사실은 이 저장소만으로는 **미확인**이다. 엔진이 보증하는 것은 위 MCP 차단뿐이며 `vsp` CLI 차단은 아니다.

## F2 — 매니페스트 미감지 Stop no-op와 1회 WARN

**판정: ② 의미는 유지되지만 직접 Stop 훅에서 router 경유로 변경.**

- 설치된 Stop 항목은 `stop-quality-gate.py`를 직접 부르지 않고 `hook-router.py Stop`을 부른다(`skills/harness-init/templates/engine/hooks-settings.json:3-12`).
- router는 Direct/Guided에서 stdin조차 읽지 않고 종료하며, Engine일 때만 Stop을 `stop-quality-gate.py`로 보낸다(`skills/harness-init/templates/engine/.claude/hooks/hook-router.py:4-8`, `:116-125`, `:140-175`).
- `.claude/quality-gate.json`이 없으면 Stop 훅은 다음 순서로 자동 감지한다.

  - `package.json`의 `lint/build/test`
  - `pyproject.toml`
  - `Cargo.toml`
  - `go.mod`
  - 아무것도 없으면 `[]`

  `package.json`이 존재하지만 해당 script가 없으면 다른 매니페스트로 폴백하지 않고 빈 목록을 반환한다(`skills/harness-init/templates/engine/.claude/hooks/stop-quality-gate.py:140-172`).

- 빈 명령 목록이면 loop가 0회 실행되고 성공 반환한다(`:418-426`, `:464`).
- `execute.py`는 Engine 기동 시 `_warn_stop_gate_noop()`을 정확히 한 번 호출하고, step별 생존성 재검사에서는 호출하지 않는다(`skills/harness-init/templates/engine/scripts/execute.py:755-758`). 감지 로직과 같은 기준으로 WARN한다(`:1287-1317`).
- 반대로 `quality-gate.json`이 존재하지만 JSON이 깨졌거나 유효 명령이 0개면 기동 단계에서 fail-closed다(`:1262-1285`).

따라서 “1회 WARN”은 Engine 실행기 기동에만 성립한다. Direct/Guided는 router 단계에서 완전 no-op이며 WARN도 없다.

## F3 — RULES 30/40개, 12KB/16KB

**판정: ② 하나의 런타임 예산이 아니라 감사 경고선과 Engine 경계로 분리됨.**

- Engine 런타임 상수는 규칙 `40`, 파일 `16 * 1024`뿐이다(`skills/harness-init/templates/engine/scripts/execute.py:2161-2164`).
- `RULES.md`가 **16KB 초과**면 기동 거부한다. 정확히 16KB는 거부하지 않는다(`:2240-2251`).
- 규칙이 **40개 초과**면 WARN만 낸다. 기계적인 개수 hard cap이 아니며 정확히 40개는 WARN하지 않는다(`:2252-2259`).
- `30개 이상` 또는 `12KB 이상`은 `harness-audit`의 read-only 건강검사 발화선이다. Engine 기동 게이트가 아니다(`skills/harness-audit/SKILL.md:43-55`).
- `harness-tailor`는 이를 “40-rule cap”이라고 표현하지만 실제 추가 전 승인·병합 지침이지 실행 차단 코드는 아니다(`skills/harness-tailor/SKILL.md:51-62`).

재정의된 F3:

> 감사 경고선은 `rules >= 30` 또는 `bytes >= 12KB`; Engine은 `rules > 40`에서 WARN만 하고 `bytes > 16KB`에서만 기동 거부한다.

## F4 — harness-tailor 산출물

**판정: ① 그대로 성립.**

- Engine 활성화가 선행돼야 하며 Guided-only 프로젝트에 Engine을 부수적으로 설치하지 않는다(`skills/harness-tailor/SKILL.md:14-19`).
- 스택을 감지해 `.claude/quality-gate.json`을 제안하고 사용자 승인 후 기록한다(`:21-32`).
- Stop 훅 전체 등록 timeout이 300초이고 여러 명령의 합계가 이를 넘을 수 있음을 경고한다(`:33-41`).
- `.harness/VERIFY-PATTERNS.md`에 실제 verify 예제와 존재 확인 anti-pattern을 기록한다(`:43-49`).
- 기존 문서의 구체적인 부정 제약만 사용자에게 하나씩 승인받아 RULES에 seed한다. v0.19 scope인 `[path:]`, `[action:]`, `[domain:]`도 지원한다(`:51-62`).
- 실제 Stop 훅은 `HOOK_BUDGET_SECS=300`이지만 SIGKILL 여유 10초를 빼고 deadline을 잡으며, 명령별 상한은 240초다(`skills/harness-init/templates/engine/.claude/hooks/stop-quality-gate.py:70-78`, `:418-440`). 예산 소진과 timeout은 소리 내어 보고하지만 JSON `deny`가 아닌 비차단 종료다(`:428-444`).

## F5 — verify 위임 타겟 감사 범위

**판정: ① 그대로 성립.**

- 감사기가 인식하는 위임 타겟은 다음뿐이다.

  - npm/yarn/pnpm/bun → `package.json`
  - make/gmake → `makefile`, `gnumakefile`
  - 명령 token이 현재 repository root 아래의 실존 파일이면 그 파일 basename

  (`skills/harness-init/templates/engine/scripts/execute.py:630-662`)

- 이후 실제 Git worktree 변경 중 해당 basename, 테스트 설정, 기존 테스트 파일 변경만 WARN한다. 차단·원복은 하지 않는다(`:686-726`).
- PATH에 있는 외부 `vsp` 실행 파일은 `(root / token).is_file()`이 아니므로 위임 타겟 집합에 포함되지 않는다(`:646-661`).
- verify 문자열 자체는 Engine 시작 때 동결되고(`:324-334`), worker 자기보고와 별개로 부모가 `shell=True`로 실행한다(`:2783-2803`). 외부 `vsp` 바이너리의 내용·버전·동작은 감사 범위 밖이다.

## F6 — tdd-guard 언어와 ABAP

**판정: ② 기본 개입은 제거됐지만 Engine 내부 heuristic은 유지.**

- 새 설치에서 Direct/Guided는 router가 종료하므로 TDD guard가 실행되지 않는다(`skills/harness-init/templates/engine/.claude/hooks/hook-router.py:140-145`).
- Engine의 Edit lane만 `tdd-guard.py`로 라우팅된다(`:116-125`). 등록 matcher는 Claude의 `Edit|Write|MultiEdit|NotebookEdit`이고 Codex 변환 시 `apply_patch`가 추가된다(`skills/harness-init/templates/engine/hooks-settings.json:50-58`; `skills/harness-init/templates/engine/install_engine.py:121-132`).
- 지원 확장자는 JS/TS 계열, `.py`, `.go`, `.ipynb`로 고정돼 있다(`skills/harness-init/templates/engine/.claude/hooks/tdd-guard.py:72-73`, `:114-120`).
- 편집 경로가 어느 `LANG_RULES`에도 맞지 않으면 finding 없이 반환한다(`:371-400`). ABAP 확장자나 언어 식별자는 없으므로 ABAP 편집은 Engine에서도 미발화한다.
- README도 v0.18까지의 대화형 Stop/TDD 개입이 새 기본값에서 제거됐다고 명시한다(`README.md:177-189`).

## F7 — block-dangerous-bash와 authority-gate

**판정: ② 대체가 아니라 병렬 보강.**

- Bash matcher 아래에 먼저 `AuthorityBash`, 이어 `Bash` route가 각각 등록된다(`skills/harness-init/templates/engine/hooks-settings.json:25-38`).
- router는 `AuthorityBash`를 `authority-gate.py`, `Bash`를 `block-dangerous-bash.py`로 보낸다(`skills/harness-init/templates/engine/.claude/hooks/hook-router.py:116-124`).
- `block-dangerous-bash.py`는 여전히 고정 정규식 denylist뿐이다. `rm -rf`, `git reset --hard`, force push/clean, remote script pipe, `DROP TABLE`, `mkfs`, Windows 재귀 삭제/format 등을 열거한다(`skills/harness-init/templates/engine/.claude/hooks/block-dangerous-bash.py:37-60`). 매칭되지 않으면 그대로 통과한다(`:83-109`).
- `authority-gate.py`는 별도로 권한 봉투의 알려진 network/package/push/PR/HTTP write/deploy/migration 표면을 분류한다(`skills/harness-init/templates/engine/.claude/hooks/authority-gate.py:582-615`).
- 두 훅 모두 `vsp`를 인식하지 않는다. RV4 흐름은 산출물 3에서 판정한다.

## v0.19 신규 불변식 후보

### N1 — 계약의 정규화 승인 hash와 로컬 byte 동결은 별개다

- 승인 hash는 UTF-8 BOM 제거와 CRLF/CR→LF 정규화 후 SHA-256이다(`skills/harness-init/templates/engine/scripts/run_contract.py:34-51`).
- Engine 시작 때 계약 원본 bytes와 manifest bytes의 SHA-256을 별도로 저장한다(`:274-285`).
- 실행 중 어느 쪽의 실제 bytes라도 달라지거나 사라지면 중단한다(`:288-297`).
- 재검사는 세션 종료, 매 step 시작, commit 직전, finalize 경계에서 호출된다(`skills/harness-init/templates/engine/scripts/execute.py:1921`, `:3028`, `:3157-3159`, `:3413-3414`).

### N2 — 권한 봉투는 new-style run에만 강제된다

- `run_id`가 있으면 contract/manifest identity, mode, phase, hash를 검증한다(`skills/harness-init/templates/engine/scripts/run_contract.py:180-221`).
- 필수 봉투에는 supervision/sandbox, non-empty write paths, network, package install, secret 이름, commit/push/PR, external writes, deploy, migrate가 포함된다(`:224-266`).
- `run_id`가 없으면 `RunContract.load()`는 `None`을 반환한다(`:182-184`). 실행기는 legacy warning만 내고 계속한다(`skills/harness-init/templates/engine/scripts/execute.py:1406-1409`).
- 이 legacy lane에서는 authority context도 없으므로 gate가 즉시 통과한다(`skills/harness-init/templates/engine/.claude/hooks/authority-gate.py:560-565`).

따라서 트랙 A가 새 권한 경계에 의존하려면 모든 실행 phase에 `run_id`와 `mode=engine` manifest가 있어야 한다. 기존 phase를 그대로 실행하면 대체 불변식이 성립하지 않는다.

### N3 — CLI worker의 권한은 부모가 동결한 환경 JSON이다

- 부모는 inherited `HARNESS_*` 값을 먼저 제거하고 `HARNESS_RUN`, run id, frozen authority JSON을 새로 설정한다(`skills/harness-init/templates/engine/scripts/execute.py:2641-2657`).
- CLI gate는 context version, run id, permissions 형식을 검증한다(`skills/harness-init/templates/engine/.claude/hooks/authority-gate.py:85-100`).
- Bridge는 router가 검증한 run id와 manifest byte hash를 받고, manifest bytes를 다시 hash·검증한다(`:101-133`).

### N4 — Bridge router는 fresh lease가 있을 때 fail-closed다

- freshness는 60초 TTL과 ±2초 clock skew다(`skills/harness-init/templates/engine/.claude/hooks/hook-router.py:22-23`, `:36-41`).
- fresh active lease와 request의 non-empty `run_id`, nonce, request id, boolean advisory, manifest hash가 모두 맞아야 valid다(`:52-108`).
- fresh lease가 있는데 request가 없거나 malformed/mismatch면 invalid context가 된다. PreToolUse는 즉시 deny하고 Stop/SubagentStop은 non-advisory gate로 계속 보낸다(`:153-175`).
- fresh lease 자체가 없을 때만 Direct/Guided로 판정해 no-op한다(`:55-64`, `:140-145`).

### N5 — 계획 target이 아니라 실제 create/modify/delete/rename을 재검사한다

- Git rename은 source와 destination 양쪽을 status에 기록한다(`skills/harness-init/templates/engine/scripts/execute.py:1797-1813`).
- 실제 delta를 `permissions.write_paths`에 재매칭하고, 범위 밖 untracked는 삭제, tracked는 HEAD 기준 reset/checkout한다(`:1467-1516`).
- 복구 뒤 status 후조건을 다시 검사하며 잔여 금지 경로가 있으면 오류로 돌린다(`:1518-1545`).
- 동일 검사를 세션 직후와 `git add -A` 직전에 다시 실행하고, 후자 실패는 `write_boundary_violation`으로 commit 전에 중단한다(`:3044-3050`, `:1914-1938`).
- RULES도 선언 target/action/domain으로 먼저 선택한 뒤 실제 변경 경로로 다시 선택한다. 새 rule이 활성화되면 완료를 보류하고 bounded retry에 주입한다(`:2203-2238`, `:2986-2999`, `:3045-3062`, `:3122-3132`).

### N6 — unattended의 보안 경계는 외부 container/VM이다

- `supervision=unattended`는 bridge를 금지하고, `sandbox.kind=host`를 거부하며, `HARNESS_ISOLATED=1`을 요구한다(`skills/harness-init/templates/engine/scripts/run_contract.py:224-241`).
- 해당 환경변수 자체가 보안 경계는 아니며 실제 외부 container/VM이 경계라는 제품 제한이 명시돼 있다(`README.md:167-170`, `:209-210`).

### N7 — Engine review는 verdict gate가 아니다

- phase review는 코드에서 명시적으로 “비게이트”이며 `review.md` 텍스트만 만든다(`skills/harness-init/templates/engine/scripts/execute.py:3393-3411`).
- finalize는 review 내용이나 verdict를 파싱하지 않고 summary·완료 commit으로 진행한다(`:3428-3459`).
- 따라서 엔진 자체에는 review verdict 기계 차단이 없다. 트랙 A의 `check-review-verdict.ps1`가 실제로 유일한 차단기인지 여부는 트랙 A 소스가 제공되지 않아 **미확인**이지만, 적어도 v0.19.2 Engine이 별도 verdict gate를 추가하지 않은 사실은 확인된다.

# 산출물 2 — `install_engine.py --target` 마이그레이션 표면

대상 커밋에서 지정 경로 `skills/harness-init/install_engine.py`는 존재하지 않는다. 실제 실행 파일은 `skills/harness-init/templates/engine/install_engine.py`다(`skills/harness-init/SKILL.md:24-31`).

## 2.1 Engine managed-file allowlist

`ENGINE_FILES`의 정확한 목록은 다음 15개다(`skills/harness-init/templates/engine/install_engine.py:30-46`).

```text
scripts/execute.py
scripts/test_execute.py
scripts/test_hooks.py
scripts/run_contract.py
scripts/test_run_contract.py
scripts/test_hook_router.py
.claude/hooks/hook-router.py
.claude/hooks/authority-gate.py
.claude/hooks/block-dangerous-bash.py
.claude/hooks/post-edit-notify.py
.claude/hooks/session-start-context.py
.claude/hooks/stop-quality-gate.py
.claude/hooks/tdd-guard.py
.claude/hooks/README.md
.claude/commands/review.md
```

`session-start-context.py`와 `post-edit-notify.py`는 v0.19 기본 설정에 등록되지 않지만 upgrade/reference용으로 계속 vendored·owned된다(`skills/harness-init/templates/engine/.claude/hooks/README.md:43-50`).

실제 `.claude/engine-manifest.json.files`에는 위 allowlist 전체가 무조건 기록되는 것이 아니라 해당 실행에서 `installed`, `unchanged`, `refreshed`로 판정된 파일만 기록된다(`skills/harness-init/templates/engine/install_engine.py:336-358`, `:367-370`).

## 2.2 “unmodified일 때만 교체”의 정확한 로직

각 allowlist 파일에 대해(`:338-358`):

1. 대상이 없으면 복사하고 `installed`, 새 source hash를 manifest에 기록한다.
2. 대상 hash가 현재 source hash와 같으면 `unchanged`이며 manifest가 없어도 새로 owned로 채택한다.
3. 서로 다르지만 이전 manifest에 경로가 있고 대상 hash가 이전 manifest hash와 같으면 pristine 이전 설치본으로 판정하여 교체하고 `refreshed`한다.
4. 이전 manifest에 있으나 대상 hash가 이전 hash와 다르면 `skipped_modified`; 새 manifest에서는 그 경로를 뺀다.
5. 이전 manifest에도 없고 현재 source와 다르면 `skipped_user_owned`; 역시 manifest에 넣지 않는다.

`skipped_modified` 파일은 새 manifest에서 빠지므로 다음 설치에서는 보통 `skipped_user_owned`로 분류가 바뀐다. 보호는 계속되지만 이름이 계속 `skipped_modified`로 유지되는 것은 아니다(`:351-358`, `:367-370`).

`.claude/engine-manifest.json` 자체는 매번 새 JSON으로 재작성되며 자기 자신은 `files`에 들어가지 않는다(`:323-326`, `:367-370`).

## 2.3 retired 파일

**v0.19.2 대상 객체에는 retired engine-file 목록과 파일 삭제 로직이 없다. 제거 대상 파일 목록은 빈 집합이다.**

- `ENGINE_FILES`에 없는 과거 manifest 경로를 순회하거나 `unlink`하는 코드가 없다(`skills/harness-init/templates/engine/install_engine.py:319-370`).
- 따라서 과거 installer-owned 파일이 새 allowlist에서 사라져도 v0.19.2 설치기는 디스크에서 삭제하지 않고 새 manifest에서만 떨어뜨린다.

별개로, 다음 6개는 “retired 파일”이 아니라 **직접 등록된 legacy hook command 식별자**다(`:64-74`).

```text
stop-quality-gate.py
authority-gate.py
block-dangerous-bash.py
tdd-guard.py
session-start-context.py
post-edit-notify.py
```

이 command entry들은 unmodified hash를 검사하지 않는다. settings 안 command에서 추출한 `.py` basename이 위 집합과 정확히 같으면 모든 event/matcher에서 제거한다(`:190-195`, `:245-267`). 파일 자체는 삭제되지 않고 계속 `ENGINE_FILES`에 포함된다.

## 2.4 `.claude/settings.json`

### 파일 생성·재작성 여부

- 없으면 template settings 전체를 새로 쓴다(`:218-224`).
- 있으면 `utf-8-sig`로 읽고 JSON object로 파싱한다(`:225-227`).
- malformed JSON이면 hard fail한다(`:228-234`).
- 변화가 하나라도 있으면 settings 전체를 `json.dumps(..., indent=2, ensure_ascii=False)`로 재직렬화한다(`:313-316`).
- 아무 변화도 없을 때만 파일 쓰기를 생략해 기존 bytes를 그대로 유지한다(`:313-314`).

따라서 upgrade에서 hook 변화가 발생하는 경우 settings 파일은 **byte 보존되지 않는다**. 공백, escape 표현, BOM 등은 재생성될 수 있다.

### managed hook 재생성

- legacy direct hook은 위 basename 기준으로 제거된다(`:245-267`).
- source template hook은 command `.py` basename으로 managed identity를 판단한다. `hook-router.py`만 trailing route 인자까지 identity에 포함한다(`:198-210`, `:268-304`).
- 기존 managed entry는 어느 matcher slot에 있든 제거하고 template의 matcher·command·timeout을 `deepcopy`하여 새 slot에 넣는다(`:268-312`).

즉 Engine 관리 matcher·command는 기존 bytes를 보존하는 것이 아니라 template 사양으로 재생성된다.

### Track B custom hook 보존 범위

- command script basename이 legacy 6개 또는 동일 managed router route와 충돌하지 않으면 `kept.append(h)`로 기존 JSON object가 유지된다(`:254-263`, `:289-299`).
- custom hook이 있던 matcher slot은 managed hook matcher가 변경돼도 custom hook과 함께 원래 slot에 남는다. managed hook만 새 matcher slot로 이동한다(`:287-312`).
- 다만 settings 전체가 재직렬화되므로 custom matcher/command의 **문자열 값은 유지되지만 원본 JSON byte 표현은 보존되지 않는다**.
- custom command가 우연히 `authority-gate.py` 등 legacy basename을 사용하면 manifest hash나 소유권 증명 없이 Engine-owned으로 오인되어 제거된다(`:190-195`, `:245-263`). 따라서 “custom hook 무조건 보존”은 코드상 절대 불변식이 아니다.

트랙 B의 SAP 안전훅 3개 command basename이 제공되지 않았으므로 실제 충돌 여부는 **미확인**이다.

### 추가 Codex 설정 변경

설치기는 `.claude/settings.json` 외에도 다음을 변경한다.

- `.codex/hooks.json`: Claude source settings를 복제하되 `SubagentStop`, `SessionStart`를 제거하고 Edit 계열 matcher에 `apply_patch`를 추가하며 `${CLAUDE_PROJECT_DIR}`를 target 절대 경로로 바꾼다(`:108-133`, `:377-384`).
- `.codex/config.toml`: `[features] hooks = true`를 생성·삽입·교체한다(`:136-187`, `:385`).

## 2.5 learning 파일과 GOAL/STATE

`install_engine.py` 자체는 다음 다섯 learning 파일을 전혀 순회하거나 복사하지 않는다.

```text
RULES.md
LESSONS.md
PROTOCOL.md
GOAL.md
STATE.md
```

별도의 `harness-init` 운영 계약이 Engine 활성화 시 다음 세 파일만 **없을 때 선택적으로** 복사할 수 있다고 지시한다(`skills/harness-init/SKILL.md:32-39`).

```text
RULES.md
LESSONS.md
PROTOCOL.md
```

`GOAL.md`, `STATE.md`는 복사하지 않는다. 기존 singleton은 legacy 데이터로 보존하지만 새 Guided 작업은 절대 생성·덮어쓰지 않는다(`docs/reference/architecture-v0.19-direct-guided-engine.md:38-39`, `:78-90`; `skills/harness-loop/SKILL.md:29-42`).

따라서 `install_engine.py --target`만 실행하면 기존 learning 파일은 모두 무시·보존되며 신규 RULES/LESSONS/PROTOCOL도 생기지 않는다.

## 2.6 `skipped_modified` / `skipped_user_owned` 보고

- summary에는 두 배열이 항상 생성된다(`skills/harness-init/templates/engine/install_engine.py:328-335`).
- 위 hash 분기에서 경로가 추가된다(`:351-358`).
- 정상 완료 시 summary 전체를 stdout JSON으로 출력한다(`:390-395`).
- `harness-init`은 두 배열의 모든 항목을 사용자에게 보고하도록 요구한다(`skills/harness-init/SKILL.md:32-35`).
- settings JSON이 malformed이면 `sys.exit(1)`이 먼저 발생해 최종 summary JSON은 출력되지 않는다(`skills/harness-init/templates/engine/install_engine.py:225-234`, `:372-375`). 이 시점에는 Engine 파일 복사와 manifest 재작성이 이미 끝난 뒤이므로 부분 적용 상태가 남는다(`:338-375`).

## 2.7 `phases/` 처리

copy-if-missing 데이터 목록은 다음과 같다(`:48-55`).

```text
.harness/runs/example-engine/contract.md
.harness/runs/example-engine/manifest.json
phases/index.json
phases/0-example/index.json
phases/0-example/step0.md
phases/0-example/step1.md
```

- 없을 때만 복사하고 `data_created`에 기록한다(`:360-365`).
- 기존 파일은 hash 비교·refresh·삭제·manifest 등록을 전혀 하지 않는다.
- 다른 `phases/*`는 열거하지 않는다.
- 따라서 기존 phase history는 byte 불변이지만, target에 예제 파일이 빠져 있으면 설치기가 새로 만든다. `phases/` 전체가 언제나 byte 불변인 것은 아니다.

# 산출물 3 — RV4 경계 실측

## 3.1 명령 파싱 경계

- executable은 경로 basename을 소문자로 만든다. `.exe`를 일반적으로 제거하지는 않는다(`skills/harness-init/templates/engine/.claude/hooks/authority-gate.py:141-142`).
- `env`, `sudo`, `command`, `nohup` wrapper와 일부 option을 벗긴다(`:145-179`).
- shell quoting을 보존한 채 `;`, `&`, `|`, 괄호, newline으로 실행 단위를 나눈다(`:182-207`).
- bash/sh/zsh/dash/cmd/PowerShell/pwsh의 `-c`, `/c`, `-Command`는 최대 depth 2까지 재파싱한다(`:209-235`).
- 완전한 shell parser가 아니라 classifier임을 코드가 명시한다(`:182-187`).

## 3.2 분류별 인식 대상

### Package install

`_package_install()`의 하드코딩은 다음과 같다(`:254-286`).

- `npm install|i|ci`
- `pnpm install|add|i`
- `yarn install|add`
- `bun install|add`
- `gem install`
- `composer install|require`
- `cargo install|add`
- `apt install`, `apt-get install`, `apk add`
- `dnf|yum|brew|choco|winget install`
- `pip|pip3 install`
- `python|python3|python.exe|py -m pip|pip3 install`
- `uv add|sync`, `uv pip install`
- `dotnet add … package`

### Push와 PR write

- Push는 option을 건너뛴 실제 `git push`다(`:245-251`, `:289-290`).
- PR write는 `gh pr` 뒤의 다음 action이 아래 집합일 때다(`:29-31`, `:293-303`).

```text
create merge close reopen edit comment review ready
```

### Deploy

`_deploy()`의 정확한 map은 다음과 같다(`:306-328`).

```text
terraform apply
pulumi up
kubectl apply
helm upgrade
helm install
vercel deploy
netlify deploy
firebase deploy
flyctl deploy
wrangler deploy
serverless deploy
sls deploy
railway up
```

추가 규칙:

- executable 이름 자체가 정확히 `deploy`면 deploy로 본다.
- `npx <tool> …`, `pnpm dlx <tool> …` wrapper만 별도로 벗긴다.
- `vsp` 및 `vsp.exe`는 map에 없다.

### Migration

`_migrate()`의 정확한 map은 다음과 같다(`:331-351`).

```text
alembic upgrade
liquibase update
flyway migrate
prisma migrate
sequelize db:migrate
knex migrate:latest
typeorm migration:run
rails db:migrate
rake db:migrate
python|python3|python.exe|py ... manage.py ... migrate
dotnet ef database update
```

executable 이름 자체가 정확히 `migrate`여도 인식한다. Deploy와 달리 `npx`/`pnpm dlx` wrapper 처리는 없다.

### External write

인식 범위는 HTTP CLI 세 종류뿐이다(`:433-518`).

- `curl|curl.exe`

  - method `POST|PUT|PATCH|DELETE`
  - `-d`, `--data*`, `--form`, `--upload-file`, `--json`
  - 대문자 short option `-F`, `-T`

- `Invoke-RestMethod|Invoke-WebRequest|irm|iwr`

  - `-Method POST|PUT|PATCH|DELETE`

- `wget|wget.exe`

  - `--method POST|PUT|PATCH|DELETE`
  - `--post-data`, `--post-file`

literal HTTP URL host를 추출해 모든 host가 허용 scope에 있는지 검사한다. `*`는 전부, exact host는 자기 자신만, `*.example.com`은 하위 도메인만 허용한다. 변수·config 파일 등 opaque target은 scope가 `*`가 아니면 deny한다(`:537-557`).

### Network

`_network()`가 인식하는 것은 다음이다(`:521-534`).

- built-in `WebFetch`, `WebSearch`
- executable:

```text
curl
curl.exe
wget
invoke-webrequest
invoke-restmethod
iwr
irm
ssh
scp
sftp
rsync
gh
```

- Git action: `push`, `pull`, `fetch`, `clone`, `ls-remote`
- 또는 앞서 인식된 package install, push, PR, deploy, HTTP external write

Migration은 그 자체만으로 network로 분류되지 않는다. `vsp`는 network tool 목록에도 없다.

## 3.3 `vsp deploy <file> <pkg>` 코드 흐름

유효한 new-style authority context에서 명령은 대략 다음처럼 파싱된다.

```text
invocation = ["vsp", "deploy", "<file>", "<pkg>"]
head       = "vsp"
action     = "deploy"
```

판정 결과:

1. package install 아님(`authority-gate.py:254-286`).
2. `git push`/`gh pr` 아님(`:289-303`).
3. `head != "deploy"`이고 `deploy_actions["vsp"]`가 없으므로 deploy가 `False`다(`:306-328`).
4. migration map에도 `vsp`가 없으므로 migrate가 `False`다(`:331-351`).
5. HTTP CLI가 아니므로 external write가 `False`다(`:433-518`).
6. network tool 목록에도 없고 다른 분류도 모두 false이므로 network가 `False`다(`:521-534`).
7. deny 조건은 `if deploy and not permissions["deploy"]`이므로 deploy가 false인 이상 `permissions.deploy=false`를 보지 않는다(`:582-605`).
8. `denied`가 비어 `return 0`으로 통과한다(`:614-616`).
9. `block-dangerous-bash.py`의 denylist에도 `vsp deploy`와 매칭되는 패턴이 없어 통과한다(`skills/harness-init/templates/engine/.claude/hooks/block-dangerous-bash.py:37-60`, `:99-109`).

따라서 **`permissions.deploy=false`인 유효한 Engine 세션에서 `vsp deploy …`는 PreToolUse 단계에서 deny되지 않는다.**

Legacy phase는 authority context 자체가 없어 더 직접적으로 통과한다(`authority-gate.py:560-565`).

## 3.4 리뷰 세션에서의 RV4

- Claude review는 파일 편집 도구만 `--disallowedTools`로 막고 Bash는 리뷰가 빌드 명령을 실행해야 한다는 이유로 의도적으로 허용한다(`skills/harness-init/templates/engine/scripts/execute.py:3242-3250`).
- review도 `HARNESS_RUN`과 frozen authority context가 있는 advisory child로 실행된다(`:3278-3300`; `:2641-2657`).
- authority-gate는 advisory를 면제하지 않지만, 위 분류 누락 때문에 `vsp deploy`를 허용한다.
- review 후 worktree guard는 로컬 생성·수정 파일을 삭제·HEAD 복구할 뿐 이미 발생한 SAP 외부 쓰기를 되돌릴 수 없다(`:3327-3356`; `:1815-1854`).
- review 결과 자체도 비게이트다(`:3393-3411`).

Codex new-style **step**은 `permissions.network`를 `sandbox_workspace_write.network_access`로 전달한다(`:2707-2715`). 실제 Codex sandbox가 `vsp` 네트워크를 어느 수준으로 막는지는 이 엔진 소스만으로 **미확인**이며, 이는 `deploy=false` 분류에 의한 deny가 아니다. Claude/Bridge 또는 네트워크가 허용된 Codex에서는 이 완화도 없다.

## 3.5 config 확장 가능성

**config로 `vsp`를 deploy classifier에 추가할 수 없다.**

- manifest에서 읽는 것은 `network`, `package_install`, `git.push/pr`, `external_writes`, `deploy`, `migrate`의 값뿐이다(`authority-gate.py:66-82`).
- command classifier 목록은 `_deploy()` 내부 지역 literal이다(`:306-313`).
- manifest의 `scope.actions`는 RULES 선택에만 사용되며 authority 명령 분류에는 연결되지 않는다(`skills/harness-init/templates/engine/scripts/run_contract.py:268-285`; `skills/harness-init/templates/engine/scripts/execute.py:2208-2212`).
- `external_writes`도 인식된 HTTP write의 host scope일 뿐 unknown CLI를 external write로 선언하는 확장점이 아니다(`authority-gate.py:606-613`).

따라서 `scope.actions=["deploy"]`나 `external_writes=["…"]`를 추가해도 `vsp deploy` 분류는 바뀌지 않는다. 소스 패치가 필요하다.

## 3.6 RV4 결론과 기계 경계 대안

**결론: 아니오. RV4는 v0.19.2에서 기계적으로 차단되지 않는다.** 자격증명과 SAP 네트워크 접근이 실제로 남아 있는 review/worker 세션은 `permissions.deploy=false`여도 `vsp deploy`를 실행 전 gate에서 통과시킬 수 있다.

가능한 기계 경계는 다음 두 가지다.

1. **review/worker와 parent verify의 자격증명을 분리한다.**

   - new-style CLI worker/review 환경은 `KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH` 형태의 환경변수를 `permissions.secrets`에 이름이 없으면 제거한다(`skills/harness-init/templates/engine/scripts/run_contract.py:346-361`; `skills/harness-init/templates/engine/scripts/execute.py:2641-2657`).
   - 반면 부모 verify는 필터링하지 않은 `os.environ`으로 실행된다(`skills/harness-init/templates/engine/scripts/execute.py:2783-2803`).
   - 따라서 vsp verify 자격증명을 parent-only 환경에 두고 manifest secret allowlist에서 제외하면 CLI worker/review에는 전달하지 않으면서 부모 `vsp verify`에는 사용할 수 있다.
   - 이 필터는 코드상 “defense in depth, not a complete secret scanner”다. vsp가 환경변수 대신 파일·keychain·로그인 세션을 사용하면 보호되지 않으므로 해당 credential store도 worker에서 분리하거나 deploy 권한이 없는 SAP principal을 써야 한다(`skills/harness-init/templates/engine/scripts/run_contract.py:346-350`).
   - Bridge는 기존 대화 세션이라 이 자식 환경 필터의 보호 대상이 아니다. Bridge worker 자체를 credential-free 또는 read-only SAP 계정으로 실행해야 한다.

2. **upstream classifier에 vsp deploy를 추가한다.**

   `_deploy()`의 literal map에 실제 executable basename을 추가할 패치 지점은 `skills/harness-init/templates/engine/.claude/hooks/authority-gate.py:306-328`이다. 명령 형상이 질문과 같다면 최소 대상은 다음이다.

   ```python
   "vsp": {"deploy"},
   "vsp.exe": {"deploy"},  # 실제 Windows executable basename이 이 형상일 경우
   ```

   이 분류가 true가 되면 기존 `permissions.deploy=false` 조건이 deny를 생성하고(`:602-603`), `_network()`도 recognized deploy를 network 동작으로 취급한다(`:521-534`).
