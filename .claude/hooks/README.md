# .claude/hooks

Claude Code 훅 스크립트 모음. 훅은 Claude Code의 라이프사이클 시점(도구 실행 전/후, 세션 시작, 사용자 입력 등)에 자동 실행되는 명령이다.

> 공식 문서: <https://code.claude.com/docs/en/hooks>

## 구조

훅 정의는 `.claude/settings.json`의 `hooks` 필드에 등록하고, 실제 실행 스크립트는 이 폴더에 둔다. `${CLAUDE_PROJECT_DIR}`로 프로젝트 루트를 참조한다.

스크립트는 전부 **Python**이다. 이유: Windows에서 훅 실행 셸은 Git Bash(설치 시)/PowerShell(미설치 시)로 갈리기 때문에, bash·jq 등 셸 문법에 의존하면 환경에 따라 조용히 깨진다. `python` 하나로 통일하면 어느 셸에서든 동일하게 동작한다. (macOS/Linux에 `python`이 없고 `python3`만 있다면 settings.json의 명령을 `python3`로 바꿔라.)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/block-dangerous-bash.py\""
          }
        ]
      }
    ]
  }
}
```

## 주요 이벤트

| 이벤트 | 발화 시점 | 차단 가능 |
|---|---|---|
| `SessionStart` | 세션 시작/재개 | X |
| `UserPromptSubmit` | 사용자 입력 제출 | O |
| `PreToolUse` | 도구 실행 직전 | O |
| `PostToolUse` | 도구 실행 성공 후 | X |
| `PostToolUseFailure` | 도구 실행 실패 후 | X |
| `Stop` | Claude 응답 종료 | O |
| `PreCompact` / `PostCompact` | 컨텍스트 압축 전/후 | 일부 O |

## 입출력 규약

훅 스크립트는 **stdin으로 JSON을 받고**, 종료 코드와 stdout으로 응답한다.

- **종료 코드 0**: 성공. stdout이 JSON이면 결과로 해석.
- **종료 코드 2**: 차단 에러. stderr 메시지가 Claude에게 전달되어 행동을 막음.
- **그 외**: 비차단 에러. stderr 첫 줄만 트랜스크립트에 표시.

차단/허용 결정을 내릴 때는 JSON으로 출력한다:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "위험 명령 감지"
  }
}
```

## 이 폴더의 예제

settings.json에 등록되어 활성 상태인 훅 — **실배선은 이 3개가 전부다**:

- `block-dangerous-bash.py` — `PreToolUse` + Bash 매처. `rm -rf`(옵션 변형 포함), `git reset --hard`/`push --force`/`clean -f`(`git -C .` 삽입 우회 포함), `curl | sh` 계열 원격 스크립트 실행 등 Unix 계열과 `rd /s`, `Remove-Item -Recurse -Force`, `| iex` 등 Windows 계열의 파괴적 명령 차단.
- `stop-quality-gate.py` — `Stop` + `SubagentStop`(같은 스크립트를 두 이벤트에 건다). git worktree가 클린하면 즉시 통과(변경 없는 턴은 스킵). 변경이 있으면 검사 커맨드를 결정해 순차 실행한다: `.claude/quality-gate.json`의 `"commands"`가 있으면 그걸 쓰고, 없으면 `package.json`(scripts에 존재하는 lint/build/test만) → `pyproject.toml`(pytest) → `Cargo.toml` → `go.mod` 순으로 자동 감지한다. 실패 시 `{"decision": "block", "reason": ...}`을 출력해 Claude가 실패 내용을 보고 수정할 때까지 세션 종료를 막는다(`stop_hook_active`로 무한 루프는 방지). 커맨드 타임아웃은 비차단 경고로 끝난다. **주의**: config가 매니페스트 자동 감지보다 우선이므로, 템플릿을 복사한 프로젝트는 `.claude/quality-gate.json`의 `commands`를 그 프로젝트의 검증 커맨드로 반드시 교체해야 한다 — 안 그러면 템플릿 자체 테스트(`python -m pytest scripts/ -q`)가 게이트로 그대로 돌고, node/npm이 없는 환경에서는 실제 문제 없이도 실패할 수 있다. 또한 `commands`에 느린 커맨드를 2개 이상 넣으면 개별 `COMMAND_TIMEOUT`(240s) 합산이 settings.json의 훅 전체 `timeout`(300s)을 넘길 수 있다 — 이 경우 잔여 커맨드는 실행되지 않되, 훅이 예산 데드라인을 스스로 추적해 SIGKILL 전에 명시적 경고를 남긴다(v0.9.0 — 조용한 스킵이 아니다).
- `session-start-context.py` — `SessionStart`(`startup|resume`). 현재 브랜치·변경 파일(top 20)·최근 커밋 5건에 더해, 세션을 여는 사람이 매번 지켜야 하는 두 가지를 컨텍스트에 주입한다: **`HANDOFF.md` 최상단 재개점부터 읽기**와 **착수 전 `git fetch` + `main..origin/main` 원격 대조**(CLAUDE.md 안전 규칙 「재개 전 원격 대조」의 승계 — 로컬 문서만 믿으면 다른 머신의 병렬 줄기를 놓친다). 상태를 읽어 조건부로 내지 않는 고정 문구다 — 재개점의 정본은 HANDOFF.md이고, 훅이 그것을 요약하면 정본이 둘이 된다. 강제 계층이 아닌 안내용 편의 훅이며, 무인 세션(`HARNESS_RUN=1`)에는 아무것도 주입하지 않는다. ⚠ 한때 `phases/` 순회·엔진 LESSONS 트리아지·docs 갱신 알림을 주입했으나 그 설비가 R1에서 레포를 떠나 함께 제거됐다 — 음성시험 `test-session-start-context.py`(`python .claude/hooks/test-session-start-context.py`, 성공 0 / 실패 비0)가 재개점 안내·원격 대조 지시의 존재와 그 유물의 재등장을 잰다.

파일은 있으나 settings.json에 **배선되지 않은** 훅 (필요하면 settings.json에 추가):

- `tdd-guard.py` — `PreToolUse` + `Edit|Write|MultiEdit|NotebookEdit` 매처를 전제로 쓰였다. 대응 테스트 파일이 없는 구현 파일 수정을 감지. JS/TS(`foo.ts` → `foo.test.ts`/`foo.spec.ts`), Python(`foo.py` → `test_foo.py`/`foo_test.py`), Go(`foo.go` → `foo_test.go`), Jupyter(`foo.ipynb` → `test_foo.py`, 셀 삭제는 제외)를 지원한다. 하네스 무인 실행(`HARNESS_RUN=1`) 중엔 deny로 강제 차단하고, 대화 모드에선 ask로 사용자 확인을 요구. (이유: 무인 모드엔 물어볼 사람이 없고, 대화 모드에서 entry point 등 테스트 부적합 파일까지 차단하면 마찰만 생김) ⚠ 이 무인 분기를 설정하던 하네스 실행 설비는 R1에서 제거됐다 — 지금 남은 경로는 대화 모드(ask)뿐이다.
- `post-edit-notify.py` — `PostToolUse` + `Write|Edit` 매처. 편집된 파일 경로를 로그에 남김.

## 디버깅 팁

훅이 안 도는 것 같을 때:

1. settings.json의 훅 변경이 실행 중인 세션에 바로 반영되지 않는 버전이 있다 — 안 먹으면 새 세션에서 확인하라.
2. `claude --debug`로 훅 실행 로그 확인
3. 스크립트를 직접 파이프해 테스트 (예: `echo '{"tool_input":{"command":"rm -rf /"}}' | python .claude/hooks/block-dangerous-bash.py`)
4. `python -c "import json; json.load(open('.claude/settings.json', encoding='utf-8'))"`로 JSON 유효성 확인 — settings.json이 깨지면 해당 파일의 모든 설정이 무시된다.
