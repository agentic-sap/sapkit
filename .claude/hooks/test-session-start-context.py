#!/usr/bin/env python3
"""session-start-context.py 음성시험. 단독 실행이고, 성공이면 exit 0 · 실패면
exit 1이다. 표준 라이브러리만 쓴다 (CI 러너의 기본 python3에서 돌아야 한다).

  python .claude/hooks/test-session-start-context.py

재는 것 넷:
  ① 주입 출력에 HANDOFF 재개점 안내가 있다
  ② 주입 출력에 원격 대조 지시(`git fetch` · `main..origin/main`)가 있다
  ③ renew 1차(R1)에서 사라진 설비를 훑지 않는다 — 임시 디렉터리에 `phases/`와
     `.harness/LESSONS.md` 미끼를 깔고 CLAUDE_PROJECT_DIR로 가리킨 뒤, 출력에
     그 이름이 나오는지 본다. 구 훅이면 여기서 걸린다.
  ④ 무인 세션(HARNESS_RUN)에는 아무것도 주입하지 않는다
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HOOK = Path(__file__).resolve().parent / "session-start-context.py"
STDIN = json.dumps({"hook_event_name": "SessionStart", "source": "startup"})

# ③에서 금지하는 토큰. 'harness'를 통째로 막는 이유: 구 훅의 세 알림이 각각
# '.harness/LESSONS.md'·'harness-docs'를 뱉어서, 그 조각들을 한 번에 잡는다.
# 미끼 디렉터리는 git 저장소가 아니므로 이 토큰이 git 구획에서 나올 일은 없다.
FORBIDDEN = ("phases", "harness")

failures = []


def check(name: str, ok: bool, detail: str = ""):
    if ok:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}{(' — ' + detail) if detail else ''}")
        failures.append(name)


def run_hook(cwd: Path, extra_env: dict) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env.pop("HARNESS_RUN", None)
    env.update(extra_env)
    return subprocess.run(
        [sys.executable, str(HOOK)], input=STDIN, capture_output=True,
        text=True, encoding="utf-8", errors="replace", cwd=str(cwd), env=env,
    )


def plant_bait(d: Path):
    """구 훅의 세 알림이 전부 발화하도록 미끼를 깐다."""
    (d / "phases" / "1-x").mkdir(parents=True)
    (d / "phases" / "1-x" / "index.json").write_text(
        json.dumps({"steps": [{"status": "pending"}]}), encoding="utf-8")
    (d / "phases" / "index.json").write_text(
        json.dumps({"phases": [{"dir": "1-x", "status": "completed",
                                "completed_at": "2099-01-01T00:00:00+0000"}]}),
        encoding="utf-8")
    (d / ".harness").mkdir()
    (d / ".harness" / "LESSONS.md").write_text(
        "## L-001 | engine | 무언가 실패했다\n\n조사되지 않은 항목이다.\n", encoding="utf-8")
    (d / "docs").mkdir()
    (d / "docs" / "PRD.md").write_text("x\n", encoding="utf-8")


def main() -> int:
    if not HOOK.is_file():
        print(f"훅이 없다: {HOOK}")
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        bait = Path(tmp).resolve()
        plant_bait(bait)
        # git 탐색이 임시 디렉터리 위로 올라가지 않게 막는다 — 출력을 결정적으로 둔다.
        r = run_hook(bait, {"CLAUDE_PROJECT_DIR": str(bait),
                            "GIT_CEILING_DIRECTORIES": str(bait)})

    check("exit 0", r.returncode == 0, f"exit={r.returncode} stderr={r.stderr.strip()[:200]}")

    ctx = ""
    try:
        ctx = json.loads(r.stdout)["hookSpecificOutput"]["additionalContext"]
        check("stdout이 SessionStart 주입 JSON", True)
    except Exception as e:
        check("stdout이 SessionStart 주입 JSON", False, f"{e} / stdout={r.stdout.strip()[:200]}")

    check("① HANDOFF 재개점 안내", "HANDOFF.md" in ctx and "재개점" in ctx)
    check("② 원격 대조 지시", "git fetch" in ctx and "main..origin/main" in ctx)

    hit = [t for t in FORBIDDEN if t in ctx.lower()]
    check("③ R1 유물 미주입", not hit, f"금지 토큰 {hit} 발견")

    with tempfile.TemporaryDirectory() as tmp:
        quiet = Path(tmp).resolve()
        r2 = run_hook(quiet, {"CLAUDE_PROJECT_DIR": str(quiet), "HARNESS_RUN": "1"})
    check("④ HARNESS_RUN 침묵",
          r2.returncode == 0 and r2.stdout.strip() == "",
          f"exit={r2.returncode} stdout={r2.stdout.strip()[:200]}")

    if failures:
        print(f"\n실패 {len(failures)}건: {', '.join(failures)}")
        return 1
    print("\n전부 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
