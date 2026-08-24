#!/usr/bin/env python3
"""PreToolUse + Bash 매처용. stdin으로 받은 JSON에서 명령어를 읽어
파괴적/되돌리기 어려운 패턴이 포함되면 deny 응답을 출력한다.

Unix 계열(rm -rf 등)과 Windows 계열(rd /s, Remove-Item -Recurse -Force 등)을
모두 검사한다. 주의: 훅 JSON에는 CLAUDE_TOOL_INPUT 같은 환경변수가 아니라
stdin으로만 도구 입력이 전달된다.

등록 예시 (.claude/settings.json):
  {
    "hooks": {
      "PreToolUse": [{
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/block-dangerous-bash.py\""
        }]
      }]
    }
  }
"""

import json
import os
import re
import sys
import time
from pathlib import Path

# Windows 콘솔 기본 인코딩(cp949)에서는 한글 입출력이 깨지거나 죽는다. UTF-8로 맞춘다.
for _stream in (sys.stdin, sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DANGEROUS_PATTERNS = [
    # Unix / Git — 옵션 삽입 우회(git -C . reset --hard, rm -fr, rm -r -f 등)까지 잡는다.
    # [^;|&\n]* : 같은 명령 세그먼트 안에서만 매칭해 체인 너머 오탐을 줄인다.
    r"\brm\b[^;|&\n]*\s(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[a-z]*\b",   # rm -rf / -fr / -vrf ...
    r"\brm\b[^;|&\n]*\s(-r|-R|--recursive)\b[^;|&\n]*\s(-f|--force)\b",  # rm -r -f
    r"\brm\b[^;|&\n]*\s(-f|--force)\b[^;|&\n]*\s(-r|-R|--recursive)\b",  # rm -f -r
    r"\bgit\b[^;|&\n]*\breset\b[^;|&\n]*--hard",
    r"\bgit\b[^;|&\n]*\bpush\b[^;|&\n]*(\s--force|\s-f\b)",
    r"\bgit\b[^;|&\n]*\bclean\b[^;|&\n]*\s-[a-z]*f",             # git clean -f/-fd/-fdx
    r"\b(curl|wget)\b[^;&\n]*\|[^;&\n]*\b(sh|bash|zsh)\b",       # 원격 스크립트 파이프 실행
    r"\|[^;&\n]*(\biex\b|\bInvoke-Expression\b)",                # PowerShell 파이프 실행
    r"DROP\s+TABLE",
    r"\bmkfs",
    r":\(\)\{",  # fork bomb
    # Windows cmd / PowerShell — rd/rmdir/del도 세그먼트 스코프로 플래그 순서 무관 매칭
    # (예: rd /q /s, del /s /q 처럼 위험 플래그가 첫 번째가 아니어도, 또 rd/s/q 처럼
    #  공백 없이 붙여 써도 우회되지 않게. 스위치 앞 공백을 요구하지 않고 /s·/[fqs]의
    #  끝 단어경계로 경로 오탐(/src, /foo)만 걸러낸다)
    r"\brd\b[^;|&\n]*/s\b",
    r"\brmdir\b[^;|&\n]*/s\b",
    r"\bdel\b[^;|&\n]*/[fqs]\b",
    r"Remove-Item(?=[^\n]*-Recurse)(?=[^\n]*-Force)",
    r"\bformat\s+[a-z]:",
]

# tdd-guard.py와 의도적으로 중복 — 훅은 독립 단일 파일이다 (공유 임포트 금지).
MARKER_STALE_SECS = 600


def bridge_request_active() -> bool:
    """크게 미래인 mtime(음수 age)은 stale로 취급한다 — os.utime로 마커를 영구히
    "신선"하게 만드는 우회로를 막는다. 단, 소폭 음수(2s 창)는 위조가 아니라
    NTFS 반올림/시계 미세 오차라 신선으로 본다 (엔진 락·리스와 동일 판정,
    CI windows 실측 2026-07-10) — 2초의 추가 신선도는 위조에 쓸모가 없어
    우회로 방지 목적은 그대로 유지된다."""
    p = (Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".").resolve()
         / ".harness" / "worker" / "request.json")
    try:
        if not p.is_file():
            return False
        age = time.time() - p.stat().st_mtime
        return -2 <= age <= MARKER_STALE_SECS
    except OSError:
        return False


def main() -> int:
    # 파싱 실패를 여기서 return 0으로 삼키면 malformed 페이로드가 검사 없이
    # 통과한다(fail-open) — 아래 tool_input 폴백의 "fail-open 금지" 방침과 모순.
    # 그대로 던져 크래시 백스톱이 컨텍스트별로 처리한다: 무인=deny, 대화=stderr
    # 비차단. tdd-guard.py와 의도적으로 중복 (훅은 독립 단일 파일).
    payload = json.load(sys.stdin)

    # tool_input이 없고 top-level에 command가 실리는 페이로드 형상 표류에도 검사가
    # 조용히 무력화되지 않도록 tdd-guard와 같은 폴백을 둔다. command가 문자열이
    # 아니면 아래 re.search가 던지고 크래시 백스톱이 무인 모드에서 deny한다 —
    # isinstance 가드로 조용히 통과시키지 않는다 (fail-open 금지).
    tool_input = payload.get("tool_input") or payload
    command = tool_input.get("command", "")
    if not command:
        return 0

    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, command, re.IGNORECASE):
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": "위험 명령 차단: " + command,
                }
            }, ensure_ascii=False))
            return 0
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        # 크래시 = 가드 미실행. 무인 모드에서 exit!=0은 비차단(fail-open)이라
        # deny로 알린다. 대화 모드는 기존대로 비차단 — 훅 고장이 사용자 명령
        # 실행을 막으면 안 된다.
        unattended = bool(os.environ.get("HARNESS_RUN"))
        if not unattended:
            try:
                unattended = bridge_request_active()
            except Exception:
                pass
        if unattended:
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        f"block-dangerous-bash 훅 자체가 크래시함 ({type(exc).__name__}: {exc}) "
                        "— fail-closed. 검사를 통과한 것이 아니다. 훅 환경을 점검하라."),
                }
            }, ensure_ascii=False))
            sys.exit(0)
        print(f"block-dangerous-bash: hook crashed — {type(exc).__name__}: {exc}",
              file=sys.stderr)
        sys.exit(1)
