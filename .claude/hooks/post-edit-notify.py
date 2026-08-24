#!/usr/bin/env python3
"""PostToolUse + Write|Edit 매처용 예제. 편집된 파일 경로를 로그에 남긴다.
어떤 파일을 언제 건드렸는지 추적할 때 유용. 비차단(exit 0).

등록 예시 (.claude/settings.json):
  {
    "hooks": {
      "PostToolUse": [{
        "matcher": "Write|Edit",
        "hooks": [{
          "type": "command",
          "command": "python \"${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit-notify.py\""
        }]
      }]
    }
  }
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Windows 콘솔 기본 인코딩(cp949)에서는 한글 입출력이 깨지거나 죽는다. UTF-8로 맞춘다.
for _stream in (sys.stdin, sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool = payload.get("tool_name") or "unknown"
    file_path = (
        (payload.get("tool_input") or {}).get("file_path")
        or (payload.get("tool_response") or {}).get("filePath")
        or ""
    )
    if not file_path:
        return 0

    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".")
    log_file = root / ".claude" / "hooks" / "edit.log"
    ts = datetime.now().astimezone().isoformat(timespec="seconds")
    # 로그 쓰기는 실패해도 훅을 죽이지 않는다 — 디렉터리 부재·권한 오류 등 OSError가
    # 나도 파일 상단이 약속한 비차단(exit 0) 계약을 지킨다.
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {tool} {file_path}\n")
    except OSError as e:
        print(f"post-edit-notify: 로그 기록 실패({e}) — 비차단 통과", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
