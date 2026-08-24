#!/usr/bin/env python3
"""SessionStart용. 현재 git 브랜치와 변경 파일 목록에 더해, 실행 대기 중인
하네스 phase(pending step 보유)와 조치가 필요한 phase(error/blocked), 미조사
LESSONS, docs 갱신 검토(완료 phase가 docs보다 새로운 경우)를 세션 컨텍스트에
주입한다 — "언제 execute.py를 실행할지"를 사람이 기억하지 않아도 프로젝트를
열 때마다 시스템이 알려주게 함. 강제 계층이 아닌 안내용 편의 훅이다.

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
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Windows 콘솔 기본 인코딩(cp949)에서는 한글 입출력이 깨지거나 죽는다. UTF-8로 맞춘다.
for _stream in (sys.stdin, sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


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


def harness_phase_reminder(root: Path) -> str:
    """phases/*/index.json을 훑어 실행 대기(pending)·조치 필요(error/blocked)
    phase를 요약한다. 깨진 index는 조용히 건너뛴다 (안내용이지 게이트가 아님)."""
    lines = []
    for idx_file in sorted(root.glob("phases/*/index.json")):
        try:
            steps = json.loads(idx_file.read_text(encoding="utf-8")).get("steps") or []
        except Exception:
            continue
        statuses = [s.get("status") for s in steps if isinstance(s, dict)]
        phase = idx_file.parent.name
        # phase 축은 폐기됐다(D-027 / 로드맵 S2-B). 아래 phase들은 '실행 대기'가
        # 아니라 실행되지 않을 역사 기록이다 — 미완 status는 당시 결말의 증거로
        # 보존된다(예: 씨앗 phase는 리뷰 게이트가 차단해 의도적으로 미완이다).
        if "error" in statuses or "blocked" in statuses:
            lines.append(f"  - phases/{phase}/ (error/blocked — 당시 결말 기록)")
        elif "pending" in statuses:
            lines.append(f"  - phases/{phase}/ (pending — 미실행 기록)")
    if not lines:
        return ""
    return ("레거시 phase 아티팩트 알림 — 아래는 **실행 대기가 아니라 역사 기록**이다.\n"
            "phase 축은 폐기됐고(D-027 / 로드맵 S2-B) 트랙 A는 run 축으로 동작한다.\n"
            "**`python scripts/execute.py <phase>`를 실행하지 마라 — AGENTS.md가 금지한다.**\n"
            "Engine의 유일한 진입점은 `scripts/run-track-a.ps1 -RunId <id>`이며, legacy\n"
            "phase 호출은 exit 64 LEGACY_PHASE_DENY로 거부된다. 현재 Engine은 fail-closed\n"
            "(candidate=selected, staged 아님 — S4 통과 전 실행 불가). 분류 정본은\n"
            "docs/reference/LEGACY-CATALOG.md.\n"
            + "\n".join(lines))


def lessons_triage_reminder(root: Path) -> str:
    """.harness/LESSONS.md에서 CAUSE 없는 `| engine |` 항목(엔진이 자동 기록한
    종결 실패 중 아직 조사되지 않은 것)을 세고, 파일 비대(32KB)를 함께 알린다.
    학습 루프는 사람이 harness-lesson triage를 발동해야 닫히므로 잊힌 항목을
    표면화한다. scripts/execute.py의 count_untriaged_engine_lessons /
    LESSONS_WARN_BYTES와 같은 로직·임계의 사본이다 (훅은 독립 실행 파일이라
    import하지 않는다). 안내용이므로 읽기 실패(비UTF-8 포함)는 조용히 무시."""
    p = root / ".harness" / "LESSONS.md"
    try:
        text = p.read_text(encoding="utf-8")
    except Exception:
        return ""
    lines = []
    count = 0
    for block in re.split(r"(?m)^## (?=L-\d)", text)[1:]:
        header = block.splitlines()[0]
        if "| engine |" not in header:
            continue
        if not re.search(r"(?m)^CAUSE:", block):
            count += 1
    if count:
        lines.append(
            f"⚠ 미조사 엔진 실패 기록 {count}건 (.harness/LESSONS.md의 CAUSE 없는 "
            f"'| engine |' 항목) — harness-lesson 스킬의 triage로 원인을 조사하면 "
            f"실패가 규칙(RULES.md)이 되어 다음 무인 실행에 주입됩니다.")
    size = len(text.encode("utf-8"))
    if size > 32 * 1024:  # 엔진 LESSONS_WARN_BYTES와 동일 임계
        lines.append(
            f"⚠ .harness/LESSONS.md {size} bytes — 권장 임계(32768 bytes)를 "
            f"넘었습니다. harness-lesson으로 조사를 끝낸 항목을 정리하세요.")
    return "\n".join(lines)


def _epoch(ts: str):
    """엔진 타임스탬프("%Y-%m-%dT%H:%M:%S%z")를 epoch 초로. 실패 시 None."""
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z").timestamp()
    except Exception:
        return None


def docs_refresh_reminder(root: Path) -> str:
    """완료된 phase가 docs/*.md(무인 step 프롬프트에 주입되는 지식 문서)의 마지막
    갱신보다 나중에 끝났으면 harness-docs 갱신 검토를 알린다. phase 완료 → 문서
    갱신(harness-docs Mode B)의 발동이 전적으로 사람 기억에 의존하는 공백의
    표면화다 — 미조사 LESSONS 알림과 같은 클래스. docs 최신 시각은 git 커밋
    시각과 워크트리 mtime 중 더 새로운 쪽을 쓴다("문서를 마지막으로 만진 증거"
    기준이라야 방금 고친 사용자에게 잔소리하지 않는다 — Codex 크로스 리뷰
    2026-07-07 저노이즈 설계). docs/가 없으면 침묵한다(부트스트랩 안내는
    harness-docs의 몫). 안내용이므로 읽기 실패는 조용히 무시."""
    try:
        docs = sorted((root / "docs").glob("*.md"))
    except Exception:
        return ""
    if not docs:
        return ""
    times = []
    ct = git("log", "-1", "--format=%ct", "--", "docs")
    if ct.isdigit():
        times.append(int(ct))
    try:
        times.append(max(int(p.stat().st_mtime) for p in docs))
    except Exception:
        pass
    if not times:
        return ""
    docs_time = max(times)
    stale = []
    try:
        top = json.loads((root / "phases" / "index.json").read_text(encoding="utf-8"))
        phases = top.get("phases") or []
    except Exception:
        return ""
    for ph in phases:
        if not isinstance(ph, dict) or ph.get("status") != "completed":
            continue
        d = ph.get("dir", "")
        if not d or d == "0-example":
            continue  # 설치 예제 phase의 완료로 문서 갱신을 잔소리하지 않는다
        ts = ph.get("completed_at")
        if not ts:
            # 완료 스탬프가 없는 구형 기록 — run-summary의 엔진 종료 시각 폴백
            try:
                rs = json.loads((root / "phases" / d / "run-summary.json")
                                .read_text(encoding="utf-8"))
                ts = rs.get("engine_ended_at")
            except Exception:
                ts = None
        epoch = _epoch(ts) if isinstance(ts, str) else None
        # +2s 완충: docs 커밋/mtime과 완료 스탬프가 같은 초 부근이면(엔진이 docs
        # 갱신 직후 완료를 찍는 흐름) NTFS 반올림/시계 미세 오차로 초 단위가
        # 엇갈릴 수 있다 — 안내 계층이라 실익 없는 노이즈만 만든다 (엔진 락·훅
        # 마커의 2s 창과 같은 실측 근거, CI windows 2026-07-10).
        if epoch and epoch > docs_time + 2:
            stale.append(d)
    if not stale:
        return ""
    names = ", ".join(f"'{d}'" for d in stale)
    return (f"ⓘ phase {names} 완료가 docs/*.md 마지막 갱신보다 나중입니다 — "
            f"지식 문서(PRD/ARCHITECTURE/ADR)가 뒤처졌을 수 있습니다. harness-docs "
            f"스킬로 갱신을 검토하세요 (docs는 무인 step 프롬프트에 주입됩니다).")


def main() -> int:
    # 엔진이 띄운 무인 세션(HARNESS_RUN)에는 아무것도 주입하지 않는다 —
    # step 프롬프트는 엔진이 구성하며, 실행 대기 알림은 사람용 안내다.
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

    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".").resolve()
    reminder = harness_phase_reminder(root)
    if reminder:
        sections.append(reminder)
    lessons = lessons_triage_reminder(root)
    if lessons:
        sections.append(lessons)
    docs_note = docs_refresh_reminder(root)
    if docs_note:
        sections.append(docs_note)

    emit("\n\n".join(sections))
    return 0


if __name__ == "__main__":
    sys.exit(main())
