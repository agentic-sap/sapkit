#!/usr/bin/env python3
"""PreToolUse + Bash 매처용. stdin으로 받은 JSON에서 명령어를 읽어
파괴적/되돌리기 어려운 패턴이 포함되면 deny 응답을 출력한다.

판정은 두 갈래다 — 정규식 목록(DANGEROUS_PATTERNS)과, 셸이 치환을 수행하는
컨텍스트 안의 미이스케이프 백틱을 찾는 스캐너(find_unescaped_backtick).

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

# ── 백틱 가드 ───────────────────────────────────────────────────────────────
# 셸 치환이 실행되는 컨텍스트 안의 미이스케이프 백틱을 잡는다. 이 레포에서
# 백틱 치환으로 파일 내용이 날아간 사고가 2회 있었고, 파괴적 사고 1회 즉시
# 조항의 집행이다. 정규식으로는 인용 상태를 못 따라가므로 작은 스캐너를 쓴다.
#
# 판정 원칙 — 과탐(막고 다시 쓰게 함) < 미탐(파일이 날아감). 그래서 애매하면
# 막는 쪽으로 기운다. 알려진 과탐 하나: 큰따옴표 안 $(...) 안의 작은따옴표는
# 실제 셸에서 인용으로 작동하지만 여기서는 큰따옴표 상태로만 본다.

BACKTICK_CTX_DOUBLE = "큰따옴표 문자열"
BACKTICK_CTX_BARE = "인용 없는 명령줄"
BACKTICK_CTX_HEREDOC = "인용 없는 heredoc 본문"


def _first_unescaped_backtick(line: str):
    """역슬래시 이스케이프를 건너뛰며 첫 백틱 위치를 찾는다. 없으면 None."""
    k = 0
    while k < len(line):
        if line[k] == "\\":
            k += 2
            continue
        if line[k] == "`":
            return k
        k += 1
    return None


def _parse_heredoc_delimiter(command: str, i: int):
    """command[i:]가 '<<'로 시작할 때 구분자를 읽는다.
    반환: (구분자, 본문_치환_여부, 다음_인덱스) 또는 None.
    <<'EOF' · <<"EOF" · <<\\EOF 는 본문이 리터럴이라 치환되지 않는다."""
    n = len(command)
    j = i + 2
    if j < n and command[j] == "-":
        j += 1
    while j < n and command[j] in " \t":
        j += 1
    if j >= n:
        return None
    quoted = False
    chars = []
    if command[j] in "'\"":
        q = command[j]
        j += 1
        while j < n and command[j] != q:
            chars.append(command[j])
            j += 1
        if j >= n:
            return None
        j += 1  # 닫는 따옴표
        quoted = True
    else:
        while j < n and command[j] not in " \t\n;|&<>()":
            if command[j] == "\\":
                quoted = True
                j += 1
                if j >= n:
                    break
            chars.append(command[j])
            j += 1
    delim = "".join(chars)
    if not delim:
        return None
    return delim, (not quoted), j


def _scan_heredoc_bodies(command: str, i: int, heredocs):
    """줄바꿈 직후부터 대기 중인 heredoc 본문들을 소비한다.
    반환: (다음_인덱스, 적발결과 또는 None)."""
    n = len(command)
    for delim, expands in heredocs:
        while i < n:
            end = command.find("\n", i)
            line, nxt = (command[i:], n) if end == -1 else (command[i:end], end + 1)
            if line.strip() == delim:
                i = nxt
                break
            if expands:
                pos = _first_unescaped_backtick(line)
                if pos is not None:
                    return n, (BACKTICK_CTX_HEREDOC, i + pos)
            i = nxt
        else:
            break  # 구분자 없이 입력이 끝났다 — 뒤따르는 heredoc도 없다
    return i, None


def find_unescaped_backtick(command: str):
    """셸이 치환하는 컨텍스트의 미이스케이프 백틱을 찾는다.
    반환: (컨텍스트 이름, 위치) 또는 None.
    작은따옴표 안 · 역슬래시 이스케이프 · 인용된 heredoc 본문은 잡지 않는다."""
    n = len(command)
    i = 0
    state = "normal"  # normal | single | double
    pending = []      # 이 줄에서 선언된 heredoc들 (선언 순서대로 본문이 온다)
    while i < n:
        ch = command[i]
        if state == "single":
            # 작은따옴표 안에는 이스케이프가 없다 — 닫는 따옴표만 본다.
            if ch == "'":
                state = "normal"
            i += 1
            continue
        if state == "double":
            if ch == "\\":
                i += 2
                continue
            if ch == '"':
                state = "normal"
                i += 1
                continue
            if ch == "`":
                return BACKTICK_CTX_DOUBLE, i
            i += 1
            continue
        # normal
        if ch == "\\":
            i += 2
            continue
        if ch == "'":
            state = "single"
            i += 1
            continue
        if ch == '"':
            state = "double"
            i += 1
            continue
        if ch == "`":
            return BACKTICK_CTX_BARE, i
        if ch == "<" and command.startswith("<<", i) and not command.startswith("<<<", i):
            parsed = _parse_heredoc_delimiter(command, i)
            if parsed:
                delim, expands, j = parsed
                pending.append((delim, expands))
                i = j
                continue
        if ch == "\n" and pending:
            i, hit = _scan_heredoc_bodies(command, i + 1, pending)
            pending = []
            if hit:
                return hit
            continue
        i += 1
    return None


BACKTICK_ADVICE = (
    "파일 내용을 넣으려던 것이면 Write/Edit 도구를 써라. "
    "정말 치환할 의도면 `...` 대신 $(...)를 쓰고, "
    "백틱 문자 자체가 필요하면 역슬래시로 이스케이프(\\`)하거나 "
    "작은따옴표 · <<'EOF' heredoc에 담아라."
)

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


def emit_deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }, ensure_ascii=False))


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
            emit_deny("위험 명령 차단: " + command)
            return 0

    hit = find_unescaped_backtick(command)
    if hit:
        context, _pos = hit
        emit_deny(
            f"셸 치환 백틱 차단({context}): {command}\n"
            "— 이 레포에서 셸 치환 사고로 파일 내용이 날아간 일이 2회 있었다. "
            + BACKTICK_ADVICE)
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
