#!/usr/bin/env python3
"""Stop 훅용 품질 게이트 — 실패하면 Claude가 종료하지 못하게 막는다(자가수정 루프).

동작:
1. stdin JSON의 stop_hook_active가 true면 즉시 통과. 이유: 이 훅의 block 때문에
   이미 한 번 계속된 세션을 또 막으면 무한 루프가 된다.
2. 환경변수 HARNESS_ADVISORY가 설정돼 있으면 즉시 통과. execute.py의
   _run_replan/_run_review처럼 "파일 수정 금지"를 프롬프트로 강제하는 제안-전용
   세션에서는, 이 게이트가 block하며 내는 "문제를 수정하라"는 지시가 그 금지와
   정면 충돌해 모델이 파일을 건드리게 만들 수 있기 때문이다.
3. git worktree가 클린하면(`git status --porcelain` 출력 없음) 즉시 통과 — 변경
   없는 질문/답변 턴에 풀 사이클을 돌리지 않기 위함. git이 없거나 실패하면
   보수적으로 계속 진행한다.
4. 검사 커맨드 결정 (스택 중립):
   - `.claude/quality-gate.json`이 있으면 그 안의 "commands" 배열을 사용.
     예: {"commands": ["ruff check .", "pytest -q"]}
     "commands"가 배열이 아니면(예: 문자열 오타) 파싱 실패와 동일하게 게이트를
     건너뛴다 — 문자열을 그대로 순회하면 글자 하나하나가 커맨드로 실행된다.
   - 없으면 매니페스트로 자동 감지:
     package.json(scripts에 정의된 lint/build/test만) → npm run ...
     pyproject.toml → python -m pytest -q
     Cargo.toml → cargo test --quiet
     go.mod → go test ./...
   - 아무것도 감지되지 않으면 게이트 비활성 (조용히 통과).
5. 커맨드를 순차 실행, 실패 시 {"decision": "block", "reason": <실제 출력>}을
   출력해 Claude가 실패 내용을 보고 수정하게 만든다. 커맨드가 타임아웃되면
   비차단 경고로 끝낸다 (타임아웃으로 세션을 인질 잡지 않기 위함).

등록 예시 (.claude/settings.json):
  {
    "hooks": {
      "Stop": [{
        "hooks": [{
          "type": "command",
          "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-quality-gate.py\"",
          "timeout": 300
        }]
      }]
    }
  }
"""

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Windows 콘솔 기본 인코딩(cp949)에서는 한글 입출력이 깨지거나 죽는다. UTF-8로 맞춘다.
for _stream in (sys.stdin, sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

COMMAND_TIMEOUT = 240
# bridge 드라이버(execute.py --driver bridge)의 요청 마커. 살아있는 엔진은 5초마다
# request.json을 touch한다 — 이보다 훨씬 오래된 마커는 크래시 잔재이므로 무시한다
# (stale advisory 마커가 게이트를 영구히 끄는 것 방지).
MARKER_STALE_SECS = 600
# 등록된 훅 timeout(hooks-settings.json의 300)과 일치해야 한다. 커맨드별 상한이
# 240s라 2개 이상이면 합계가 300s를 넘어 하네스가 훅을 SIGKILL하고 게이트가
# 조용히 스킵될 수 있다 — 데드라인을 스스로 추적해 SIGKILL 전에 시끄럽게 보고한다.
HOOK_BUDGET_SECS = 300


def bridge_marker(root: Path):
    """bridge 요청 마커를 읽는다. 인터랙티브 워커 세션은 엔진의 자식 프로세스가
    아니라 HARNESS_ADVISORY env를 전달받을 수 없어 이 파일이 같은 역할을 한다.
    없거나 오래됐으면 None, 깨졌으면 {} (존재는 인정하되 advisory로 취급하지
    않음 — fail-closed)."""
    p = root / ".harness" / "worker" / "request.json"
    try:
        if not p.is_file():
            return None
        age = time.time() - p.stat().st_mtime
        # 크게 미래인 mtime(음수 age)은 stale로 취급한다 — 세션이 os.utime로 마커를
        # 영구히 "신선"하게 만들어 게이트를 무한정 끄는 우회로를 막는다. 소폭
        # 음수(2s 창)는 NTFS 반올림/시계 미세 오차라 신선으로 본다 (엔진 락·리스와
        # 동일 판정, CI windows 실측 2026-07-10) — 2초는 위조에 쓸모가 없다.
        if not (-2 <= age <= MARKER_STALE_SECS):
            print("stop-quality-gate: 리스가 끊긴/미래 mtime의 .harness/worker/request.json "
                  "무시 — 엔진 크래시 잔재 또는 위조로 보임. 지워라.", file=sys.stderr)
            return None
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}  # 깨진 마커는 무시하고 게이트 유지


def detect_commands(root: Path) -> list:
    config = root / ".claude" / "quality-gate.json"
    if config.exists():
        try:
            commands = json.loads(config.read_text(encoding="utf-8")).get("commands") or []
        except Exception:
            print("stop-quality-gate: quality-gate.json 파싱 실패 — 게이트 건너뜀", file=sys.stderr)
            return []
        if not isinstance(commands, list):
            print("stop-quality-gate: quality-gate.json의 commands는 배열이어야 함 "
                  f"(현재 {type(commands).__name__}) — 게이트 건너뜀", file=sys.stderr)
            return []
        if not all(isinstance(c, str) for c in commands):
            print("stop-quality-gate: quality-gate.json의 commands 항목은 모두 문자열이어야 함 "
                  "— 게이트 건너뜀", file=sys.stderr)
            return []
        return list(commands)

    package_json = root / "package.json"
    if package_json.exists():
        try:
            scripts = json.loads(package_json.read_text(encoding="utf-8")).get("scripts") or {}
        except Exception:
            scripts = {}
        # scripts에 실제로 정의된 것만 실행 — 없는 스크립트를 돌리면 npm 에러로 오탐된다.
        return [f"npm run {s}" for s in ("lint", "build", "test") if s in scripts]
    if (root / "pyproject.toml").exists():
        return ["python -m pytest -q"]
    if (root / "Cargo.toml").exists():
        return ["cargo test --quiet"]
    if (root / "go.mod").exists():
        return ["go test ./..."]
    return []


def _unattended_step_context() -> bool:
    """크래시 백스톱용 무인 step 판별. 어떤 입력에서도 예외를 내면 안 된다.
    advisory 세션은 게이트 자체를 건너뛰는 계약이므로 무인으로 치지 않는다.

    PreToolUse 훅(tdd-guard/block-dangerous-bash)의 크래시 백스톱과 의도적으로
    비대칭이다: 그쪽은 advisory 중에도 deny가 fail-closed로 안전해 구분이
    불필요하지만, 여기서는 크래시가 advisory 세션에 가짜 block을 주입하면
    안 되므로 이 판별이 반드시 필요하다."""
    try:
        if os.environ.get("HARNESS_ADVISORY"):
            return False
        if os.environ.get("HARNESS_RUN"):
            return True
        root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".").resolve()
        marker = bridge_marker(root)
        return marker is not None and not marker.get("advisory")
    except Exception:
        return bool(os.environ.get("HARNESS_RUN"))


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}

    if payload.get("stop_hook_active"):
        return 0

    if os.environ.get("HARNESS_ADVISORY"):
        return 0

    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".").resolve()

    marker = bridge_marker(root)
    # HARNESS_RUN이 있으면 엔진의 자식 세션(claude/codex step)이다 — 이 세션의
    # advisory 여부는 env(위조 불가)가 권위를 가지므로 마커의 advisory 플래그는
    # 무시한다. 마커는 env를 못 받는 bridge 워커 세션을 위한 것이다. 이게 없으면
    # headless step 세션이 마커 한 줄을 위조해 자기 Stop 게이트를 끌 수 있다.
    marker_advisory = (marker is not None and marker.get("advisory")
                       and not os.environ.get("HARNESS_RUN"))
    if marker_advisory:
        # bridge 워커의 advisory 요청 처리 중 — HARNESS_ADVISORY env와 동일 취급.
        # 조용히 꺼지면 위조/잔존 마커를 아무도 못 알아채므로 반드시 알린다.
        print("stop-quality-gate: bridge advisory 요청 처리 중 — 게이트 건너뜀 "
              "(.harness/worker/request.json)", file=sys.stderr)
        return 0
    if payload.get("hook_event_name") == "SubagentStop" and marker is None:
        # SubagentStop 게이트는 bridge step 요청이 열려 있을 때만 활성이다 —
        # bridge에서 step 작업은 서브에이전트에서 끝나므로 headless의 "종료 전
        # 자가수정" 루프를 그 경계에서 재현하기 위한 것. 일반 대화의
        # 서브에이전트(리서치/탐색 등)에는 걸지 않는다. 단, prompt.md가 있는데
        # 마커만 없으면 서브에이전트가 마커를 지우고 게이트를 우회했을 수 있으므로
        # 조용히 넘어가지 않고 알린다.
        if (root / ".harness" / "worker" / "prompt.md").is_file():
            print("stop-quality-gate: SubagentStop 시 request.json은 없으나 prompt.md가 있음 "
                  "— 마커가 삭제됐을 수 있음 (게이트 건너뜀, 감사 요망)", file=sys.stderr)
        return 0

    # 이번 턴에 변경된 게 없으면 skip (git이 없거나 실패하면 보수적으로 실행)
    git = shutil.which("git")
    if git:
        r = subprocess.run(
            [git, "status", "--porcelain"], cwd=root, capture_output=True,
            text=True, encoding="utf-8", errors="replace",
        )
        if r.returncode == 0 and not r.stdout.strip():
            return 0

    # Windows cmd.exe는 PATH보다 현재 디렉토리를 먼저 탐색한다 — 레포 루트에 놓인
    # pytest.bat 같은 셔임이 게이트 커맨드를 하이재킹하지 못하게 cwd 탐색을 끈다.
    env = {**os.environ, "NoDefaultCurrentDirectoryInExePath": "1"}
    # SIGKILL 10초 전 마진: 예산이 다하면 남은 커맨드를 돌리는 대신 자체 보고한다.
    deadline = time.monotonic() + HOOK_BUDGET_SECS - 10
    for cmd in detect_commands(root):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            print(f"stop-quality-gate: 훅 예산({HOOK_BUDGET_SECS}s) 소진 — `{cmd}`부터 "
                  "실행하지 못함. 게이트가 불완전하다 — quality-gate.json 커맨드를 줄여라",
                  file=sys.stderr)
            return 1  # 비차단 경고 (타임아웃과 같은 등급) — 단 조용하지 않다
        try:
            # shell=True: "npm run lint" 같은 문자열 커맨드를 OS 기본 셸로 실행.
            # Windows에서 npm.cmd 셔임 해석도 셸이 처리한다.
            r = subprocess.run(
                cmd, shell=True, cwd=root, capture_output=True,
                text=True, encoding="utf-8", errors="replace",
                timeout=min(COMMAND_TIMEOUT, remaining),
                env=env,
            )
        except subprocess.TimeoutExpired:
            print(f"stop-quality-gate: `{cmd}` 타임아웃({COMMAND_TIMEOUT}s)", file=sys.stderr)
            return 1  # 비차단 경고 — 타임아웃으로 세션을 인질 잡지 않는다
        if r.returncode == 5 and "pytest" in cmd:
            continue  # pytest exit 5 = 수집된 테스트 없음 — 테스트가 아직 없는 프로젝트를 막지 않는다
        if r.returncode != 0:
            tail = ((r.stdout or "") + "\n" + (r.stderr or "")).strip()[-2000:]
            print(json.dumps({
                "decision": "block",
                "reason": (
                    f"품질 게이트 실패 — `{cmd}` (exit {r.returncode}). "
                    f"아래 출력을 보고 문제를 수정한 뒤 다시 종료하라.\n\n{tail}"
                ),
            }, ensure_ascii=False))
            return 0
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        # 크래시 = 게이트 미실행. 무인 모드에서 exit!=0은 비차단이라 "강제 계층은
        # 조용히 죽지 않는다" 불변식이 훅 프로세스 수준에서 깨진다 — block으로 알린다.
        # 반복 크래시의 무한 루프는 정상 payload의 stop_hook_active 조기 통과와
        # Claude Code의 연속 block 강제 해제 상한이 막는다. 대화 세션은 기존대로
        # 비차단(stderr + exit 1) — 훅 고장으로 사용자 세션을 인질 잡지 않는다.
        if _unattended_step_context():
            print(json.dumps({
                "decision": "block",
                "reason": (f"stop-quality-gate 훅 자체가 크래시함 "
                           f"({type(exc).__name__}: {exc}) — fail-closed. "
                           "게이트를 통과한 것이 아니다. 훅 환경을 점검하라."),
            }, ensure_ascii=False))
            sys.exit(0)
        print(f"stop-quality-gate: hook crashed — {type(exc).__name__}: {exc}",
              file=sys.stderr)
        sys.exit(1)
