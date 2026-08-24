#!/usr/bin/env python3
"""SessionStart용. 현재 git 브랜치·변경 파일·최근 커밋에 더해, 세션을 여는
사람이 매번 지켜야 하는 두 가지 — `HANDOFF.md` 최상단 재개점부터 읽기, 착수 전
원격 대조 — 를 세션 컨텍스트에 주입한다. 강제 계층이 아닌 안내용 편의 훅이다.

⚠ 이 훅은 한때 `phases/` 순회·엔진 LESSONS 트리아지·docs 갱신 알림을 주입했다.
그 실행 설비가 renew 1차(R1)에서 레포를 떠났으므로, 없어진 것을 훑던 코드도 함께
제거했다 — 되살리지 말 것. 음성시험 `test-session-start-context.py`가 그 유물의
재등장을 잰다.

등록 예시 (.claude/settings.json):
  {
    "hooks": {
      "SessionStart": [{
        "matcher": "startup|resume",
        "hooks": [{
          "type": "command",
          "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session-start-context.py\""
        }]
      }]
    }
  }
"""

import json
import os
import subprocess
import sys

# Windows 콘솔 기본 인코딩(cp949)에서는 한글 입출력이 깨지거나 죽는다. UTF-8로 맞춘다.
for _stream in (sys.stdin, sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


# 세션마다 같은 문구다 — 상태를 읽어 조건부로 내지 않는다. 재개점의 정본은
# HANDOFF.md이고, 훅이 그 내용을 요약하면 정본이 둘이 된다.
RESUME_NOTE = (
    "재개점: **`HANDOFF.md` 최상단 재개점부터 읽어라** — 프로젝트 상태·다음 걸음·"
    "백로그의 정본이다. 판 큐는 `docs/RUN-PLAN.md`.\n"
    "원격 대조: 착수 전에 **`git fetch` 후 `main..origin/main`을 대조**해 다른 머신의 "
    "병렬 줄기를 확인하라. 로컬 문서만 믿으면 놓친다(두 머신 6일 분기 실증 — CLAUDE.md "
    "안전 규칙 「재개 전 원격 대조」). 분기를 발견하면 작업 전에 보고하라."
)


def git(*args) -> str:
    r = subprocess.run(
        ["git", *args], capture_output=True,
        text=True, encoding="utf-8", errors="replace",
    )
    return r.stdout.strip() if r.returncode == 0 else ""


def emit(context: str):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }, ensure_ascii=False))


def main() -> int:
    # 무인 세션(HARNESS_RUN)에는 아무것도 주입하지 않는다 — 이 안내는 사람용이다.
    if os.environ.get("HARNESS_RUN"):
        return 0

    sections = []
    if git("rev-parse", "--is-inside-work-tree"):
        branch = git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
        status = "\n".join(git("status", "--short").splitlines()[:20]) or "(없음)"
        recent = git("log", "--oneline", "-n", "5") or "(없음)"
        sections.append(f"현재 브랜치: {branch}\n\n변경 사항 (top 20):\n{status}\n\n최근 커밋:\n{recent}")
    else:
        sections.append("(git 저장소 아님)")

    sections.append(RESUME_NOTE)

    emit("\n\n".join(sections))
    return 0


if __name__ == "__main__":
    sys.exit(main())
