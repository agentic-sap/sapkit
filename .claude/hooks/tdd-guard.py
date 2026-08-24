#!/usr/bin/env python3
"""TDD Guard — PreToolUse + Edit|Write|MultiEdit|NotebookEdit 매처용.

구현 파일을 수정하려 할 때 대응하는 테스트 파일이 없으면
차단/확인 JSON을 출력한다. 동작은 실행 맥락에 따라 다르다:

- 하네스 무인 실행 (HARNESS_RUN=1, execute.py가 설정) → deny(강제 차단).
  물어볼 사람이 없으므로 테스트 먼저 작성을 기계적으로 강제한다.
- bridge 드라이버 요청 처리 중 (.harness/worker/request.json 존재, execute.py
  --driver bridge가 게시) → deny. 인터랙티브 워커 세션은 엔진의 자식
  프로세스가 아니라 HARNESS_RUN env를 받을 수 없으므로 파일 마커로 판별한다.
  살아있는 엔진이 5초마다 touch하는 리스(mtime)가 끊긴 오래된 마커는
  크래시 잔재로 보고 무시한다 (ask로 복귀).
- 대화 모드 → ask(사용자 확인). entry point·layout 등 테스트 부적합
  파일까지 무조건 차단하면 마찰만 생기므로 판단은 사용자가 한다.

지원 언어 (LANG_RULES에 추가해 확장):
- JS/TS: foo.ts → foo.test.ts / foo.spec.ts (같은 폴더, __tests__/, tests/, src/__tests__/)
- Python: foo.py → test_foo.py / foo_test.py (같은 폴더, tests/, test/)
- Go:     foo.go → foo_test.go (같은 폴더 — Go 관례)
- Jupyter: foo.ipynb → test_foo.py / foo_test.py (Python 관례를 따름 — NotebookEdit은
  엔진이 편집 도구로 취급하는 표면이므로(advisory --disallowedTools와 동급) 노트북
  경유 구현 작성이 가드 없이 지나가면 안 된다)

훅은 stdin으로 JSON을 받는다. Python으로 작성한 이유: Windows에서 훅 실행 셸이
Git Bash/PowerShell로 갈리므로 셸 문법(bash/jq) 의존을 제거하기 위함.

등록 예시 (.claude/settings.json):
  {
    "hooks": {
      "PreToolUse": [{
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [{
          "type": "command",
          "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/tdd-guard.py\""
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

JS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
JS_TEST_EXTS = ("ts", "tsx", "js", "jsx", "mjs", "cjs")


def project_root() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".").resolve()


def has_js_test(p: Path, root: Path) -> bool:
    base = p.name
    for ext in JS_EXTS:
        if base.endswith(ext):
            base = base[: -len(ext)]
            break
    dirs = [
        p.parent,
        p.parent / "__tests__",
        p.parent.parent / "__tests__",
        root / "tests",
        root / "src" / "__tests__",
    ]
    for d in dirs:
        for kind in ("test", "spec"):
            for ext in JS_TEST_EXTS:
                if (d / f"{base}.{kind}.{ext}").is_file():
                    return True
    return False


def has_py_test(p: Path, root: Path) -> bool:
    base = p.stem
    dirs = [p.parent, p.parent / "tests", root / "tests", root / "test"]
    for d in dirs:
        if (d / f"test_{base}.py").is_file() or (d / f"{base}_test.py").is_file():
            return True
    return False


def has_go_test(p: Path, root: Path) -> bool:
    return (p.parent / f"{p.stem}_test.go").is_file()


# 언어별 규칙: (구현 파일 확장자 판정, 테스트 존재 확인 함수, 테스트 파일 예시)
LANG_RULES = [
    (lambda low: low.endswith(JS_EXTS), has_js_test, "{base}.test.ts"),
    (lambda low: low.endswith(".py"), has_py_test, "test_{base}.py"),
    (lambda low: low.endswith(".go"), has_go_test, "{base}_test.go"),
    # 노트북은 Python 테스트 관례를 따른다 (foo.ipynb → test_foo.py)
    (lambda low: low.endswith(".ipynb"), has_py_test, "test_{base}.py"),
]


# Codex apply_patch는 변경 경로를 file_path 필드가 아니라 patch 텍스트
# (tool_input.command)의 헤더 라인에 싣는다 (E2E 패리티 테스트로 확인).
# Delete는 잡지 않는다 — 삭제에 테스트를 요구하는 것은 무의미하다.
APPLY_PATCH_FILE_RE = re.compile(r"^\*\*\* (?:Add|Update) File: (.+)$", re.MULTILINE)
APPLY_PATCH_MOVE_RE = re.compile(r"^\*\*\* Move to: (.+)$", re.MULTILINE)


def extract_paths(payload: dict) -> list:
    tool_input = payload.get("tool_input") or payload
    items = []
    for key in ("file_path", "path", "filename"):
        value = tool_input.get(key)
        if isinstance(value, str) and value:
            items.append(value)
    for edit in tool_input.get("edits") or []:
        if isinstance(edit, dict):
            value = edit.get("file_path") or edit.get("path") or edit.get("filename")
            if isinstance(value, str) and value:
                items.append(value)
    # notebook_path: NotebookEdit 페이로드의 경로 필드 (file_path를 쓰지 않는다).
    # 셀 삭제(edit_mode=delete)는 apply_patch의 Delete와 같은 이유로 잡지 않는다 —
    # 삭제에 테스트를 요구하는 것은 무의미하다.
    nb = tool_input.get("notebook_path")
    if isinstance(nb, str) and nb and tool_input.get("edit_mode") != "delete":
        items.append(nb)
    command = tool_input.get("command")
    if isinstance(command, str) and "*** " in command:
        for m in APPLY_PATCH_FILE_RE.finditer(command):
            items.append(m.group(1).strip())
        for m in APPLY_PATCH_MOVE_RE.finditer(command):
            items.append(m.group(1).strip())
    return list(dict.fromkeys(items))  # 순서 유지 dedup


def is_exempt(file_path: str) -> bool:
    low = file_path.replace("\\", "/").lower()
    name = low.rsplit("/", 1)[-1]
    dir_parts = low.split("/")[:-1]
    # 테스트 파일 자신 (foo.test.ts, test_app.py, foo_test.go, conftest.py ...)
    # 주의 1: 파일명 기준으로만 판정한다. 전체 경로 substring 검사는
    #   경로에 'test'가 들어간 프로젝트(my-test-app 등)에서 가드를 통째로 꺼버린다.
    # 주의 2: 관례 패턴만 정밀 매칭한다. 'test'/'spec' substring 검사는
    #   contest.py, specimen.ts 같은 구현 파일까지 면제시킨다.
    if (name.startswith("test_") or name == "conftest.py"
            or ".test." in name or ".spec." in name
            or "_test." in name or "-test." in name or "-spec." in name):
        return True
    # 테스트 전용 디렉토리 안의 파일
    if any(seg in ("test", "tests", "__tests__", "spec", "specs") for seg in dir_parts):
        return True
    # 하네스 설정·훅 스크립트 — 템플릿 인프라는 가드 대상이 아님
    if "/.claude/" in low:
        return True
    # 설정/문서/스타일
    if low.endswith((".json", ".css", ".scss", ".md", ".yml", ".yaml", ".toml")):
        return True
    if ".env" in name or ".config." in name:
        return True
    if any(s in low for s in ("tailwind", "postcss", "tsconfig")):
        return True
    # 타입 정의 (JS/TS) — .d.ts 선언 파일은 위치와 무관하게 테스트 대상이 아니다
    if name.endswith(".d.ts"):
        return True
    if "/types/" in low or low.endswith("/types.ts"):
        return True
    # Python 관례상 테스트 불요 파일
    if name in ("__init__.py", "setup.py", "manage.py"):
        return True
    return False


# 살아있는 엔진은 5초마다 request.json을 touch한다 — 리스가 끊긴 오래된 마커는
# 크래시 잔재이므로 무시한다 (stale 마커가 대화 세션을 계속 deny로 묶는 것 방지).
MARKER_STALE_SECS = 600


def bridge_request_active() -> bool:
    """execute.py --driver bridge가 게시한 요청 마커. 요청 처리 중에는
    무인 실행과 동일하게 동작해야 한다 (엔진이 응답을 받으면 지운다).
    크게 미래인 mtime(음수 age)은 stale로 취급한다 — os.utime로 마커를 영구히
    "신선"하게 만들어 대화 세션을 무한정 deny로 묶는 우회로를 막는다.
    단, 소폭 음수(2s 창)는 위조가 아니라 NTFS 반올림/시계 미세 오차라 신선으로
    본다 (엔진 락·리스와 동일 판정, CI windows 실측 2026-07-10) — 2초의 추가
    신선도는 위조에 쓸모가 없어 우회로 방지 목적은 그대로 유지된다."""
    p = project_root() / ".harness" / "worker" / "request.json"
    try:
        if not p.is_file():
            return False
        age = time.time() - p.stat().st_mtime
        return -2 <= age <= MARKER_STALE_SECS
    except OSError:
        return False


def respond(name: str, example: str):
    marker = not os.environ.get("HARNESS_RUN") and bridge_request_active()
    if os.environ.get("HARNESS_RUN") or marker:
        decision = "deny"
        reason = (f"TDD GUARD: '{name}' 구현 파일에 대응 테스트가 없다. "
                  f"'{example}' 같은 테스트를 먼저 작성하라.")
        if marker:
            reason += (" (하네스 bridge 요청 처리 중: .harness/worker/request.json"
                       " — 엔진이 돌고 있지 않은데 남아있다면 지워라)")
    else:
        decision = "ask"
        reason = (f"TDD GUARD: '{name}' 구현 파일에 대응 테스트가 없다. "
                  f"원칙은 테스트 먼저 ('{example}'). 테스트가 부적합한 파일이면 승인하라.")
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }, ensure_ascii=False))


def main() -> int:
    # 파싱 실패를 여기서 return 0으로 삼키면 malformed 페이로드가 검사 없이
    # 통과한다(fail-open). 그대로 던져 크래시 백스톱이 컨텍스트별로 처리한다:
    # 무인=deny, 대화=stderr 비차단. block-dangerous-bash.py와 의도적으로 중복
    # (훅은 독립 단일 파일).
    payload = json.load(sys.stdin)

    root = project_root()
    for raw in extract_paths(payload):
        if is_exempt(raw):
            continue
        low = raw.replace("\\", "/").lower()
        p = Path(raw)
        for is_code, has_test, example in LANG_RULES:
            if not is_code(low):
                continue
            if not has_test(p, root):
                base = p.stem
                respond(p.name, example.format(base=base))
                return 0
            break
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        # 크래시 = 가드 미실행. 무인 모드에서 exit!=0은 비차단(fail-open)이라
        # deny로 알린다. 대화 모드는 기존대로 비차단 — 훅 고장이 사용자 편집을
        # 막으면 안 된다.
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
                        f"tdd-guard 훅 자체가 크래시함 ({type(exc).__name__}: {exc}) "
                        "— fail-closed. 검사를 통과한 것이 아니다. 훅 환경을 점검하라."),
                }
            }, ensure_ascii=False))
            sys.exit(0)
        print(f"tdd-guard: hook crashed — {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
