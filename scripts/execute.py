#!/usr/bin/env python3
"""
Harness Step Executor — phase 내 step을 순차 실행하고 자가 교정한다.

Usage:
    python scripts/execute.py <phase-dir> [--push]    # Windows
    python3 scripts/execute.py <phase-dir> [--push]   # macOS/Linux
"""

import argparse
import contextlib
import copy
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import types
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent


class VerifyFailure:
    """verify 실패의 구조화 결과. 기계적 레슨 기록(fable-harness)이 필드를 소비한다."""

    def __init__(self, cmd: str, exit_code: Optional[int], output_tail: str, summary: str):
        self.cmd = cmd
        self.exit_code = exit_code  # None = 타임아웃
        self.output_tail = output_tail
        self.summary = summary


@contextlib.contextmanager
def progress_indicator(label: str):
    """터미널 진행 표시기. with 문으로 사용하며 .elapsed 로 경과 시간을 읽는다."""
    frames = "◐◓◑◒"
    stop = threading.Event()
    t0 = time.monotonic()

    def _animate():
        idx = 0
        while not stop.wait(0.12):
            sec = int(time.monotonic() - t0)
            sys.stderr.write(f"\r{frames[idx % len(frames)]} {label} [{sec}s]")
            sys.stderr.flush()
            idx += 1
        sys.stderr.write("\r" + " " * (len(label) + 20) + "\r")
        sys.stderr.flush()

    th = threading.Thread(target=_animate, daemon=True)
    th.start()
    info = types.SimpleNamespace(elapsed=0.0)
    try:
        yield info
    finally:
        stop.set()
        th.join()
        info.elapsed = time.monotonic() - t0


# H5: 기록 지점에 남는 고신뢰 시크릿만 보수적으로 마스킹한다. 엔트로피 휴리스틱이나
# 일반 hex/base64는 오탐이 크므로 건드리지 않는다. 치환은 유형 마커를 남겨 조사
# 가능성을 보존한다 — LESSONS.md의 "에러 원문 인용"(harness-lesson) 원칙과는 약한
# 긴장이 있으나, 시크릿이 LESSONS.md·step 출력·리뷰 산출물에 영구 기록돼 커밋까지
# 되는 위험이 더 크다고 판단한다.
_SECRET_PATTERNS = [
    # private key는 BEGIN~END 블록 전체를 치환한다 — 헤더만 가리고 base64 본문이
    # 남으면 마스킹이 무의미하다. END가 잘려나간 텍스트(tail 절단 등)를 위해
    # 헤더 단독 폴백을 그 다음에 둔다 (리스트 순서 의존).
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
                re.DOTALL), "[REDACTED:private-key]"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "[REDACTED:private-key]"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED:aws-key]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}"),
     "[REDACTED:jwt]"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{30,}"), "[REDACTED:github-token]"),
    (re.compile(r"ghp_[A-Za-z0-9]{30,}"), "[REDACTED:github-token]"),
    (re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"), "[REDACTED:slack-token]"),
    # 좌측 경계 필수: task-scheduler-..., disk-cache-... 같은 일상 토큰 내부의
    # "sk-"에 오탐하면 LESSONS/리뷰 기록을 능동적으로 훼손한다 (검증에서 실증됨).
    (re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}"), "[REDACTED:api-key]"),
]


def redact_secrets(text: str) -> str:
    """기록 직전 텍스트에서 고신뢰 시크릿 패턴을 유형 마커로 치환한다. 보수적
    패턴만 쓰므로 일반 hex/base64 같은 무해 문자열은 그대로 둔다."""
    if not text:
        return text
    for pat, repl in _SECRET_PATTERNS:
        text = pat.sub(repl, text)
    return text


def count_untriaged_engine_lessons(text: str) -> int:
    """CAUSE 줄이 없는 `| engine |` 레슨 항목 수를 센다. 엔진이 자동 기록한 종결
    실패 중 harness-lesson triage(원인 조사)가 아직 닿지 않은 것들이다 — 학습
    루프(실패→조사→규칙)는 사람이 triage를 발동해야만 닫히므로, 잊힌 항목을
    표면화하는 것이 이 카운터의 존재 이유다. session-start-context.py 훅에 같은
    로직의 사본이 있다 (훅은 독립 실행 파일이라 import하지 않는다).

    알려진 한계 (품질 소음 등급, 무결성 무관): OUTPUT-TAIL 코드펜스 안의 verify
    출력에 행 첫머리 `CAUSE:`가 있으면 미조사 항목이 조사됨으로 오인되고(과소),
    `## L-N` 행이 있으면 블록이 쪼개져 과대 집계된다. harness-lesson의 triage 정의
    자체가 같은 텍스트 규약을 쓰므로 코드-문서는 일치하며, 펜스 파싱을 추가해
    고칠 가치보다 규약의 단순성이 낫다고 판단한다."""
    count = 0
    for block in re.split(r"(?m)^## (?=L-\d)", text)[1:]:
        header = block.splitlines()[0]
        if "| engine |" not in header:
            continue
        if not re.search(r"(?m)^CAUSE:", block):
            count += 1
    return count


class StepExecutor:
    """Phase 디렉토리 안의 step들을 순차 실행하는 하네스."""

    MAX_RETRIES = 3
    FEAT_MSG = "feat({phase}): step {num} — {name}"
    WIP_MSG = "wip({phase}): step {num} failed — {name}"
    CHORE_MSG = "chore({phase}): step {num} output"
    TZ = timezone(timedelta(hours=9))
    # 재시도 강등(pending 복귀) 시 제거할 필드. 세션이 자기보고한 값이 다음
    # 시도의 컨텍스트를 오염시키지 않도록 한다.
    RETRY_POP_FIELDS = ("error_message", "summary", "contract", "completed_at",
                        "blocked_reason", "blocked_at", "failed_at")
    # fable-harness: 메모리 파일은 집행을 조향하므로 verify 스냅샷과 같은 보호 등급.
    # 무인 step 세션이 이 파일들을 편집할 정당한 이유는 없다.
    MEMORY_FILES = ("RULES.md", "LESSONS.md")

    def __init__(self, phase_dir_name: str, *, auto_push: bool = False,
                 allow_no_verify: bool = False,
                 step_model: Optional[str] = None,
                 advisory_model: Optional[str] = None,
                 driver: Optional[str] = None):
        self._root = str(ROOT)
        self._phases_dir = ROOT / "phases"
        self._phase_dir = self._phases_dir / phase_dir_name
        self._phase_dir_name = phase_dir_name
        self._top_index_file = self._phases_dir / "index.json"
        self._auto_push = auto_push
        self._allow_no_verify = allow_no_verify

        if not self._phase_dir.is_dir():
            print(f"ERROR: {self._phase_dir} not found")
            sys.exit(1)

        self._index_file = self._phase_dir / "index.json"
        if not self._index_file.exists():
            print(f"ERROR: {self._index_file} not found")
            sys.exit(1)

        try:
            idx = self._read_json(self._index_file)
        except (json.JSONDecodeError, ValueError) as e:
            # 손상 index는 기동 첫 읽기에서만 친절하게 죽는다 — 세션 후 읽기의
            # 손상은 _check_index_tamper가 스냅샷으로 재구성하므로, 이 처리를
            # _read_json 전역에 넣으면 그 복구 경로를 죽인다.
            print(f"ERROR: {self._index_file} JSON 파싱 실패 — 손상된 index로는 기동할 수 없습니다 ({e})")
            print(f"  복구: git checkout -- phases/{phase_dir_name}/index.json "
                  f"(커밋되지 않은 수동 편집은 유실됩니다)")
            sys.exit(1)
        self._gate_index_shape(idx)
        self._project = idx.get("project", "project")
        self._phase_name = idx.get("phase", phase_dir_name)
        self._total = len(idx["steps"])

        # 프로필(.harness/profile.json)은 인체공학만 조정한다. CLI 플래그 > profile >
        # 기본값 순으로 해소한다. 강제 계층(verify 게이트·메모리 가드·커밋 규율·훅)은
        # 프로필 대상이 아니다 — _load_profile 주석 참고.
        profile = self._load_profile()
        self._max_retries = profile.get("max_retries", self.MAX_RETRIES)
        self._preamble_mode = profile.get("preamble", "verbose")
        self._weak_verify_mode = profile.get("weak_verify", "warn")
        self._step_model = step_model if step_model is not None else profile.get("step_model")
        self._advisory_model = (advisory_model if advisory_model is not None
                                else profile.get("advisory_model"))
        # 드라이버 선택도 인체공학이다 — 어느 CLI가 세션을 돌리든 강제 계층(스냅샷·
        # 게이트·가드)은 엔진이 직접 수행하므로 동일하게 유지된다. 훅 계약은 E2E
        # 패리티 테스트로 검증됨 (PreToolUse deny·Stop block·stop_hook_active 동일).
        self._driver = driver if driver is not None else profile.get("driver", "claude")
        # codex advisory 세션의 최종 메시지 파일 (--output-last-message). 레포 밖
        # 시스템 임시 경로 — phase 디렉토리에 두면 finalize 커밋에 쓸려 들어간다.
        self._advisory_last_path = os.path.join(
            tempfile.gettempdir(), f"harness-advisory-{os.getpid()}.txt")
        # bridge: 인터랙티브 워커 세션이 응답할 때까지의 대기 상한. 사람이 워커
        # 세션을 띄워둬야 하는 반무인 모드라 env로 늘릴 수 있다. 잘못된 값이
        # 조용히 0초 타임아웃이 되지 않도록 비양수/비정수는 기본값으로 되돌린다.
        raw_bt = os.environ.get("HARNESS_BRIDGE_TIMEOUT")
        try:
            self._bridge_timeout = int(raw_bt) if raw_bt else self.SESSION_TIMEOUT
        except ValueError:
            print(f"  WARN: HARNESS_BRIDGE_TIMEOUT '{raw_bt}' 무시 — 기본 {self.SESSION_TIMEOUT}s 사용")
            self._bridge_timeout = self.SESSION_TIMEOUT
        if self._bridge_timeout <= 0:
            print(f"  WARN: HARNESS_BRIDGE_TIMEOUT는 양수여야 함 — 기본 {self.SESSION_TIMEOUT}s 사용")
            self._bridge_timeout = self.SESSION_TIMEOUT

        # run-summary.json용 관찰 집계 (step_num → attempts/verify_failures).
        # 강제 계층이 아니라 신모델 점검 프로토콜의 정량 관찰 재료다.
        self._run_stats = {}

        self._snapshot_verify()

    # 프로필은 인체공학(ergonomics)만 조정한다: 재시도 횟수(max_retries), 프롬프트
    # 상세도(preamble), 역할별 모델 배정(step_model/advisory_model), weak-verify
    # 경고→차단 승격(weak_verify), 실행 드라이버(driver — claude/codex/bridge, v0.6.0).
    # 강제 계층 — verify 게이트·스냅샷·메모리 변조 가드·advisory worktree 가드·
    # 커밋 규율·훅 — 은 어떤 경우에도 프로필로 완화할 수 없다.
    PROFILE_KEYS = ("max_retries", "preamble", "weak_verify", "step_model",
                    "advisory_model", "driver")
    # bridge: 헤드리스 CLI 대신 인터랙티브 Claude Code 세션(harness-worker 스킬)에
    # .harness/worker/ 파일 프로토콜로 세션을 위임한다 — 헤드리스 호출이 구독과
    # 별도 과금되는 환경에서 구독 세션으로 step을 실행하기 위한 드라이버.
    DRIVERS = ("claude", "codex", "bridge")

    def _load_profile(self) -> dict:
        """.harness/profile.json을 읽어 검증된 인체공학 설정 dict를 반환한다.
        파일이 없으면 {} (전부 기본값). 알 수 없는 키는 WARN 후 무시하고, 잘못된
        값·타입·enum이나 JSON 파싱 실패는 조용한 기본값 대체 없이 fail-fast로 exit 1."""
        p = ROOT / ".harness" / "profile.json"
        if not p.exists():
            return {}
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"  ERROR: .harness/profile.json 파싱 실패: {e}")
            sys.exit(1)
        if not isinstance(raw, dict):
            print(f"  ERROR: .harness/profile.json은 JSON 객체여야 합니다.")
            sys.exit(1)
        for key in raw:
            if key not in self.PROFILE_KEYS:
                print(f"  WARN: .harness/profile.json 알 수 없는 키 '{key}' — 무시함 "
                      f"(오타 확인). 허용 키: {', '.join(self.PROFILE_KEYS)}")
        profile = {}
        if "max_retries" in raw:
            v = raw["max_retries"]
            if type(v) is not int or not (1 <= v <= 5):
                print(f"  ERROR: profile.json max_retries는 1~5 정수여야 합니다: {v!r}")
                sys.exit(1)
            profile["max_retries"] = v
        if "preamble" in raw:
            v = raw["preamble"]
            if v not in ("verbose", "concise"):
                print(f"  ERROR: profile.json preamble은 \"verbose\"|\"concise\"여야 합니다: {v!r}")
                sys.exit(1)
            profile["preamble"] = v
        if "weak_verify" in raw:
            v = raw["weak_verify"]
            if v not in ("warn", "block"):
                print(f"  ERROR: profile.json weak_verify는 \"warn\"|\"block\"여야 합니다: {v!r}")
                sys.exit(1)
            profile["weak_verify"] = v
        for key in ("step_model", "advisory_model"):
            if key in raw:
                v = raw[key]
                if not isinstance(v, str) or not v.strip():
                    print(f"  ERROR: profile.json {key}는 비어있지 않은 문자열이어야 합니다: {v!r}")
                    sys.exit(1)
                profile[key] = v
        if "driver" in raw:
            v = raw["driver"]
            if v not in self.DRIVERS:
                print(f"  ERROR: profile.json driver는 {'|'.join(self.DRIVERS)}여야 합니다: {v!r}")
                sys.exit(1)
            profile["driver"] = v
        return profile

    def _gate_index_shape(self, idx):
        """원시 형상 게이트 (기동, Codex 크로스 리뷰 2026-07-10 MED). __init__ 바로
        아래와 _snapshot_verify가 idx.get·idx["steps"]·s["step"]을 직접 인덱싱하므로
        형상 위반(최상위 배열·steps 부재·step 키 부재)은 raw AttributeError/KeyError로
        죽는다 — fail 방향은 동일하지만 진단이 불친절하다. 손상-index와 같은 결의
        메시지로 기동을 거부한다. 타입·enum·중복 등 상세 검증은 checkout 후
        _validate_plan_schema 소관 — 실행될 파일(feat 브랜치) 기준 재검증 설계를
        보존하기 위해 여기서 중복하지 않는다 (run()의 호출 순서 주석 참조)."""
        problem = None
        if not isinstance(idx, dict):
            problem = "최상위가 JSON 객체(dict)가 아닙니다"
        elif not isinstance(idx.get("steps"), list):
            problem = '"steps"가 리스트(list)가 아니거나 없습니다'
        else:
            for i, s in enumerate(idx["steps"]):
                if not isinstance(s, dict) or "step" not in s:
                    problem = f'steps[{i}]가 "step" 키를 가진 객체(dict)가 아닙니다'
                    break
                try:
                    # _snapshot_verify가 s["step"]을 dict 키로 쓴다 — 리스트/객체
                    # 값은 키 존재 검사를 통과하고도 raw TypeError(unhashable)로
                    # 죽는다 (크로스 리뷰 재반박에서 재현). 정수 강제까지는
                    # _validate_plan_schema 소관 — 여기는 크래시 전제만 막는다.
                    hash(s["step"])
                except TypeError:
                    problem = (f'steps[{i}]의 "step" 값이 리스트/객체입니다 — '
                               f'정수여야 합니다')
                    break
        if problem:
            print(f"ERROR: {self._index_file} 계획 형상 위반 — {problem}. "
                  f"이 index로는 기동할 수 없습니다")
            print(f"  복구: git checkout -- phases/{self._phase_dir_name}/index.json "
                  f"(커밋되지 않은 수동 편집은 유실됩니다)")
            sys.exit(1)

    def _snapshot_verify(self):
        """verify 커맨드를 하네스 시작 시점에 고정한다. 실행 중 세션은 status 갱신을
        위해 index.json 쓰기 권한이 있으므로, 라이브 값을 읽으면 세션이 자기 verify를
        "exit 0"으로 바꿔 게이트를 무력화할 수 있다."""
        idx = self._read_json(self._index_file)
        self._verify_snapshot = {s["step"]: s.get("verify") for s in idx["steps"]}
        # F-A: verify 문자열만이 아니라 index 전체(step 집합·status·모든 필드)를
        # 스냅샷한다. 세션 종료 직후 _check_index_tamper가 이 스냅샷을 기준으로
        # index를 재구성한다 — status 선기입·step 삭제/추가·완료 step contract 오염이
        # 전부 이 스냅샷 대조로 원복된다.
        self._index_snapshot = copy.deepcopy(idx)

    # 계획 status 허용 enum. 엔진 전역이 이 넷만 status로 해석하므로(_check_blockers·
    # _check_verify_defined·_execute_single_step·_finalize 근거) 그 밖의 값은
    # 손편집·계획 생성 버그의 신호다. harness-plan/SKILL.md도 같은 넷을 문서화한다
    # (pending | completed | error | blocked — in_progress는 코드에 없다).
    VALID_STEP_STATUSES = frozenset({"pending", "completed", "error", "blocked"})
    # 세션이 index에 남길 수 있는 자유 텍스트 필드 — 존재하면 str이어야 한다.
    _PLAN_STR_FIELDS = ("summary", "contract", "error_message", "blocked_reason")

    def _validate_plan_schema(self):
        """실행 브랜치의 index.json이 엔진이 가정하는 계획 스키마를 만족하는지 기동
        시점에 검증한다 (기동 게이트, Codex 크로스 리뷰 2026-07-10). _snapshot_verify가
        idx["steps"]·s["step"]을 직접 인덱싱하므로, 필드 누락은 KeyError 크래시로,
        step 번호 중복은 dict comprehension에서 마지막 항목이 조용히 이겨 잘못된 verify
        스냅샷으로 실행되는 문제가 있었다. 첫 오류에서 멈추지 않고 전부 수집해 한 번에
        보고한 뒤 sys.exit(1) — 사람이 한 번의 재실행으로 계획을 고칠 수 있게 한다.

        presence(pending step의 verify 필수)는 _check_verify_defined가 이미 강제하므로
        여기서 중복하지 않는다 — 타입·enum·유일성·지시 파일 존재만 본다. 실행될 파일
        (feat 브랜치) 기준이어야 하므로 run()의 checkout·재스냅샷 직전에 호출된다."""
        idx = self._read_json(self._index_file)
        if not isinstance(idx, dict):
            self._report_plan_schema_errors(
                ["index.json 최상위가 JSON 객체(dict)가 아닙니다."])
            return  # sys.exit 뒤라 도달하지 않지만 흐름을 명시한다
        steps = idx.get("steps")
        if not isinstance(steps, list):
            self._report_plan_schema_errors(
                [f'index.json "steps"가 리스트(list)가 아닙니다: {type(steps).__name__}'])
            return

        errors = []
        seen_steps = {}  # step 번호 → 등장 횟수 (중복 탐지)
        allowed = "/".join(sorted(self.VALID_STEP_STATUSES))
        for i, s in enumerate(steps):
            where = f"steps[{i}]"
            if not isinstance(s, dict):
                errors.append(f"{where}가 객체(dict)가 아닙니다: {type(s).__name__}")
                continue
            # step 번호: 비음수 int이며 유일. bool은 int의 서브클래스라 type()로 배제한다
            # (True/False가 1/0으로 인정되면 안 된다 — profile.json max_retries와 동일 규약).
            num = s.get("step")
            if type(num) is not int:
                errors.append(f'{where}: "step"이 정수(int)가 아닙니다: {num!r}')
            elif num < 0:
                errors.append(f'{where}: "step"이 음수입니다: {num}')
            else:
                seen_steps[num] = seen_steps.get(num, 0) + 1
            # name: 비어있지 않은 str
            name = s.get("name")
            if not isinstance(name, str) or not name.strip():
                errors.append(f'{where}: "name"이 비어있지 않은 문자열이 아닙니다: {name!r}')
            # status: 허용 enum
            status = s.get("status")
            if status not in self.VALID_STEP_STATUSES:
                errors.append(f'{where}: "status"가 허용값({allowed})이 아닙니다: {status!r}')
            # verify: 있으면 비어있지 않은 str (presence 강제는 _check_verify_defined 소관)
            if "verify" in s:
                v = s["verify"]
                if not isinstance(v, str) or not v.strip():
                    errors.append(f'{where}: "verify"가 비어있지 않은 문자열이 아닙니다: {v!r}')
            # 자유 텍스트 필드: 있으면 str
            for field in self._PLAN_STR_FIELDS:
                if field in s and not isinstance(s[field], str):
                    errors.append(f'{where}: "{field}"가 존재하지만 문자열이 아닙니다: {s[field]!r}')
            # pending step의 지시 파일 존재. _invoke_claude가 step{N}.md를 읽으므로,
            # 없으면 세션 3회를 소모한 뒤가 아니라 기동 시점에 드러낸다.
            if status == "pending" and type(num) is int and num >= 0:
                if not (self._phase_dir / f"step{num}.md").exists():
                    errors.append(f'{where}: pending step인데 지시 파일 step{num}.md가 없습니다.')
        # step 번호 중복: dict comprehension에서 마지막 항목만 남아 조용히 오실행된다
        for n in sorted(num for num, cnt in seen_steps.items() if cnt > 1):
            errors.append(f'"step" 번호 {n}이 {seen_steps[n]}회 중복됩니다 — verify 스냅샷에서 '
                          f'마지막 항목만 남아 잘못된 계획으로 실행됩니다.')
        if errors:
            self._report_plan_schema_errors(errors)

    def _report_plan_schema_errors(self, errors: list):
        """수집된 계획 스키마 위반을 친절히 나열하고 기동을 거부한다 (profile.json
        검증과 같은 메시지 스타일)."""
        print(f"\n  ERROR: 계획(index.json) 스키마 검증 실패 — 아래를 고친 뒤 재실행하세요:")
        for e in errors:
            print(f"    - {e}")
        print(f"  index.json은 기동 전 사람 소유입니다 — 손편집이나 계획 생성 버그를 확인하세요.")
        sys.exit(1)

    # 존재 확인 수준의 verify(파일 유무만 확인)는 실행 검증이 아니다 — 게이트가
    # 형식적으로만 통과해 하네스 보증이 통째로 약해진다.
    WEAK_VERIFY_RE = re.compile(
        r"^\s*(?:test\s+-[defrs]\b|\[\s+-[defrs]\b|Test-Path\b|ls\b|dir\b"
        r"|cat\b|type\b|echo\b|true\s*$|exit\s+0\s*$)",
        re.IGNORECASE)
    # F-E: 시작부가 실제 커맨드여도 꼬리에서 실패를 무력화하면 verify가 아니다.
    # `pytest || true`, `npm test || :`, `...; exit 0` 류. `&& true`는 실패를
    # 통과시키지 않으므로 잡지 않는다 (오탐 방지).
    # `|| echo ok`·`; echo done`도 echo가 0을 반환해 실패를 세탁한다 (v0.12.0).
    WEAK_VERIFY_TAIL_RE = re.compile(
        r"(?:\|\||;)\s*(?:true|:|exit\s+0|echo\b[^|&;]*)\s*$", re.IGNORECASE)

    def _is_weak_verify(self, cmd: str) -> bool:
        return bool(self.WEAK_VERIFY_RE.search(cmd)
                    or self.WEAK_VERIFY_TAIL_RE.search(cmd))

    def _check_verify_defined(self):
        """pending step에 verify가 없으면 기동을 거부한다 (fail-fast). verify 없는
        step은 세션의 completed 자기보고만으로 통과해 게이트가 사라지는데, 그 사실이
        1800초짜리 세션 3회를 소모한 뒤에야 드러나면 늦다. --allow-no-verify로만
        명시적으로 완화할 수 있다. 존재 확인 수준의 verify는 경고한다."""
        idx = self._read_json(self._index_file)
        pending = [s for s in idx["steps"] if s.get("status") == "pending"]
        weak = [s for s in pending
                if self._verify_snapshot.get(s["step"])
                and self._is_weak_verify(self._verify_snapshot[s["step"]])]
        # profile weak_verify=block: 존재 확인 수준 verify는 경고가 아니라 기동 거부.
        # --allow-no-verify는 이 차단을 우회하지 않는다 (다른 축 — 탈출구는 profile을
        # warn으로 되돌리거나 실제 verify로 교체하는 것).
        if self._weak_verify_mode == "block" and weak:
            print(f"\n  ERROR: 존재 확인 수준 verify를 가진 pending step이 있습니다 (profile weak_verify=block):")
            for s in weak:
                print(f"    Step {s['step']} ({s['name']}): {self._verify_snapshot.get(s['step'])}")
            print(f"  동작을 실제로 실행하는 verify로 교체하거나, profile weak_verify를 warn으로 되돌리세요.")
            sys.exit(1)
        for s in weak:
            cmd = self._verify_snapshot.get(s["step"])
            print(f"  WARN: step {s['step']} verify가 존재 확인 수준으로 보입니다: {cmd}")
            print(f"        동작을 실제로 실행하는 커맨드(테스트 등)로 바꾸길 권장합니다.")
        missing = [s for s in pending if not self._verify_snapshot.get(s["step"])]
        if not missing:
            return
        if self._allow_no_verify:
            for s in missing:
                print(f"  WARN: step {s['step']} ({s['name']}) verify 미정의 — "
                      f"--allow-no-verify로 자기보고를 신뢰합니다")
            return
        print(f"\n  ERROR: verify가 정의되지 않은 pending step이 있습니다:")
        for s in missing:
            print(f"    Step {s['step']} ({s['name']})")
        print(f"  verify 없는 step은 세션의 completed 자기보고만으로 통과합니다 — 게이트가 사라집니다.")
        print(f"  index.json에 실행 가능한 verify를 추가하거나, 의도된 것이면 --allow-no-verify로 재실행하세요.")
        sys.exit(1)

    def _snapshot_memory(self):
        self._memory_snapshot = {}
        hdir = ROOT / ".harness"
        for name in self.MEMORY_FILES:
            p = hdir / name
            if p.exists():
                self._memory_snapshot[name] = p.read_bytes()

    def _check_memory_tamper(self):
        hdir = ROOT / ".harness"
        snap_map = getattr(self, "_memory_snapshot", {})
        if not hdir.is_dir():
            if not snap_map:
                return
            # 세션이 .harness/ 디렉토리째 삭제한 경우 — 파일 단위 변조와 같은 등급으로 복구한다.
            hdir.mkdir(parents=True, exist_ok=True)
        for name in self.MEMORY_FILES:
            p = hdir / name
            snap = snap_map.get(name)
            cur = p.read_bytes() if p.exists() else None
            if cur == snap:
                continue
            if snap is None:
                p.unlink()
            else:
                p.write_bytes(snap)
            print(f"  WARN: step 세션이 .harness/{name}을 수정함 — 되돌림 (tamper check)")

    # v0.9.0: step 파일은 이후 step 프롬프트에 전문 주입되는 지시문 표면이다.
    # 세션이 미래 step*.md를 수정하면 경고 없이 feat 커밋되고 다음 프롬프트를
    # 오염시킨다 — index contract 오염(F-A)과 같은 클래스라 같은 등급(바이트
    # 스냅샷 원복)으로 막는다. 계획의 정당한 수정은 replan-proposal.md를 사람이
    # 검토해 엔진이 멈춘 뒤에 반영하는 것이 계약이다.
    def _snapshot_step_files(self):
        self._step_file_snapshot = {
            p.name: p.read_bytes()
            for p in sorted(self._phase_dir.glob("step[0-9]*.md"))
        }

    def _check_step_file_tamper(self):
        snap = getattr(self, "_step_file_snapshot", None)
        if snap is None:
            return
        current = {p.name for p in self._phase_dir.glob("step[0-9]*.md")}
        for name in sorted(current | set(snap)):
            p = self._phase_dir / name
            expected = snap.get(name)
            cur = p.read_bytes() if p.exists() else None
            if cur == expected:
                continue
            if expected is None:
                p.unlink()
                print(f"  WARN: 세션이 step 파일 {name} 생성 — 삭제함 (step-file tamper check)")
            else:
                p.write_bytes(expected)
                print(f"  WARN: 세션이 step 파일 {name} 수정 — 스냅샷으로 원복 (step-file tamper check)")

    # F-B: 강제 계층을 구성하는 .claude 파일 집합. 훅은 커밋이 아니라 워크트리의
    # 라이브 파일에서 실행되므로 커밋 제외(unstage)만으로는 부족하다 — 다음 세션이
    # 변조본을 그대로 쓴다. settings.local.json은 통상 untracked/ignored라 git HEAD
    # 원복으로도 못 잡는다 (disableAllHooks 주입 벡터). 그래서 메모리 파일과 같은
    # 바이트 스냅샷 등급으로 보호한다. hooks/*.py는 검사 시점에 재-glob해 세션이
    # 추가한 파일도 잡는다.
    ENFORCEMENT_SNAPSHOT_FILES = (
        ".claude/settings.json",
        ".claude/settings.local.json",
        ".claude/quality-gate.json",
        ".claude/commands/review.md",
        # codex 드라이버의 강제 계층 등록 지점 — 세션이 features.hooks를 끄거나
        # hooks.json을 비우면 다음 세션부터 훅 전체가 죽는다 (동일 등급 보호).
        ".codex/hooks.json",
        ".codex/config.toml",
        # 프로필은 인체공학 전용이지만 weak_verify(block→warn 강등)·driver·
        # max_retries를 세션이 바꿔치면 chore 커밋을 타고 다음 실행이 신뢰한다 —
        # verify 크로스런 전파와 같은 클래스라 같은 등급으로 원복한다. 이번 실행은
        # 기동 시 1회 읽기라 영향이 없지만, 원복 없이는 다음 실행이 오염된다.
        ".harness/profile.json",
    )

    def _enforcement_paths(self) -> list:
        paths = [Path(self._root) / rel for rel in self.ENFORCEMENT_SNAPSHOT_FILES]
        hooks_dir = Path(self._root) / ".claude" / "hooks"
        if hooks_dir.is_dir():
            paths.extend(sorted(hooks_dir.glob("*.py")))
        return paths

    def _snapshot_enforcement(self):
        self._enforcement_snapshot = {
            p: p.read_bytes() for p in self._enforcement_paths() if p.exists()
        }

    def _check_enforcement_tamper(self):
        """세션 종료 직후 .claude 강제 파일들을 바이트 스냅샷과 대조해 원복한다.
        스냅샷이 없으면(직접 호출 테스트 등) 검사하지 않는다 — run()이 항상 찍는다."""
        if not hasattr(self, "_enforcement_snapshot"):
            return
        snap = self._enforcement_snapshot
        current = set(self._enforcement_paths())
        for p in sorted(current | set(snap)):
            expected = snap.get(p)
            cur = p.read_bytes() if p.exists() else None
            if cur == expected:
                continue
            rel = os.path.relpath(p, self._root)
            if expected is None:
                p.unlink()
                print(f"  WARN: 세션이 강제 계층 파일 {rel} 생성 — 삭제함 (enforcement tamper check)")
            else:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(expected)
                print(f"  WARN: 세션이 강제 계층 파일 {rel} 변경 — 스냅샷으로 원복 (enforcement tamper check)")

    # F-C: docs/*.md는 guardrails로, CLAUDE.md는 claude -p 자동 로드로 이후 세션
    # 프롬프트에 들어가는 지시문 주입 표면이다. step 세션의 수정이 정당한 산출물일
    # 수 있어 기계적 원복은 과잉이지만(RULES/LESSONS 강제 등급과 docs 자문 등급의
    # 기존 구분), 조용히 지나가면 안 된다 — WARN으로 사람의 감사 가능성만 확보한다.
    def _warn_prompt_surface_changes(self, before: dict):
        after = self._worktree_status()
        for path, st in after.items():
            if before.get(path) == st:
                continue
            if path in ("CLAUDE.md", "AGENTS.md") or path.startswith("docs/"):
                print(f"  WARN: step 세션이 프롬프트 표면 {path} 수정 — 이후 세션 "
                      f"지시문에 영향. diff를 감사하라 (prompt-surface watch)")

    # v0.12.0 (verify-surface watch): verify 커맨드 문자열은 스냅샷이 지키지만,
    # 커맨드가 읽는 테스트/테스트 설정 파일은 세션이 바꿀 수 있다 — tdd-guard는
    # 테스트 파일·설정을 의도적으로 면제하므로(TDD상 세션이 테스트를 작성해야 함)
    # 차단이 불가능한 표면이다. 그래서 강제가 아니라 WARN + run-summary 카운트다:
    # 이전 step 테스트에 케이스를 추가하는 정당한 패턴이 흔해 차단·원복은 오탐이
    # 작업을 죽인다. 같은 step 안의 "테스트 신규 작성 → 즉시 약화"는 설계상
    # 비검출(신규 파일은 정상 TDD 산출물) — README 알려진 한계 참조.
    # 파일명 관례는 tdd-guard.py is_exempt와 같은 규약 — 함께 움직여야 한다.
    TEST_FILE_NAME_RE = re.compile(
        r"(?:^test_|\.test\.|\.spec\.|_test\.|-test\.|-spec\.)", re.IGNORECASE)
    VERIFY_CONFIG_NAMES = ("conftest.py", "pytest.ini", "setup.cfg", "tox.ini")
    VERIFY_CONFIG_PREFIXES = ("jest.config.", "vitest.config.")
    # 다목적 매니페스트는 의존성 추가 등 정당한 수정이 잦다 — 무조건 WARN이면
    # 신호가 희석되므로(크로스 리뷰), 테스트 러너 설정 마커가 델타에 있을 때만.
    VERIFY_CONFIG_CONTENT_MARKERS = {
        "pyproject.toml": ("[tool.pytest", "addopts", "testpaths",
                           "collect_ignore", "norecursedirs"),
        "package.json": ('"jest"', '"vitest"'),
    }

    # verify 명령 문자열은 스냅샷이 지키지만, 그 명령이 *위임*하는 리포 타겟은
    # 무감시였다: `npm test`→package.json scripts, `make test`→Makefile,
    # `./scripts/verify.sh`→셸 스크립트. 세션이 이 타겟을 무력화하면(scripts.test를
    # "exit 0"으로 등) verify가 통과하고 completed로 커밋되며 다음 런은 완료 step을
    # 재실행하지 않는다. 명령에서 위임 타겟을 유도해 그 변경을 표면화한다. 프레임워크
    # 하드코딩이 아니라 러너 지시자(npm/make)와 명령이 명명한 실존 파일 — WARN + count
    # (기존 verify-surface와 동급, 강제 아님: 정당한 스크립트 수정과 구분 불가).
    VERIFY_PKG_MANAGERS = ("npm", "yarn", "pnpm", "bun")
    VERIFY_MAKE_TOOLS = ("make", "gmake")
    _VERIFY_TOKEN_SPLIT = re.compile(r"[\s|&;()<>]+")

    def _verify_delegation_targets(self, verify_cmd) -> set:
        """verify 명령이 위임하는 리포 파일 basename(소문자) 집합을 유도한다."""
        if not verify_cmd:
            return set()
        targets = set()
        for tok in self._VERIFY_TOKEN_SPLIT.split(verify_cmd):
            tok = tok.strip("'\"")  # sh -c "npm test" 류의 따옴표 잔재 제거
            if not tok:
                continue
            base = tok.replace("\\", "/").rsplit("/", 1)[-1].lower()
            for suf in (".cmd", ".exe", ".bat"):  # Windows 런처 변형(npm.cmd 등)
                if base.endswith(suf):
                    base = base[:-len(suf)]
                    break
            if base in self.VERIFY_PKG_MANAGERS:
                targets.add("package.json")
            elif base in self.VERIFY_MAKE_TOOLS:
                targets.update(("makefile", "gnumakefile"))
            cand = tok.replace("\\", "/").lstrip("./")
            if cand and (Path(self._root) / cand).is_file():
                targets.add(cand.rsplit("/", 1)[-1].lower())
        return targets

    def _pkg_scripts_changed(self, path: str):
        """package.json의 scripts 블록이 이번 세션에서 바뀌었는지 구조적으로 판정한다.
        git diff의 기본 3줄 컨텍스트에 '"scripts"' 키 라인이 안 잡히는 큰 매니페스트
        에서도 scripts.test 재정의를 놓치지 않는다(H1). 의존성만 변경은 조용하다.
        판정 불가(현재 파일 파싱 실패)면 위임 매니페스트라 보수적으로 True."""
        def scripts_of(text):
            try:
                v = json.loads(text)
            except ValueError:
                return None
            return v.get("scripts", {}) if isinstance(v, dict) else {}
        try:
            cur = scripts_of((Path(self._root) / path).read_text(
                encoding="utf-8", errors="replace"))
        except OSError:
            return False
        if cur is None:
            return True
        head = self._run_git("show", f"HEAD:{path}")
        old = scripts_of(head.stdout) if head.returncode == 0 else {}
        return cur != (old or {})

    def _warn_verify_surface_changes(self, before: dict, stats: dict, verify_cmd=None):
        after = self._worktree_status()
        delegation = self._verify_delegation_targets(verify_cmd)
        flagged = []
        for path, st in after.items():
            if before.get(path) == st:
                continue
            name = path.replace("\\", "/").rsplit("/", 1)[-1].lower()
            label = None
            if name in self.VERIFY_CONFIG_NAMES or name.startswith(self.VERIFY_CONFIG_PREFIXES):
                label = "테스트 설정"
            elif name == "package.json":
                # verify가 위임하면(npm test 등) scripts 블록 변경을 구조적으로
                # 판정한다 — 큰 매니페스트에서 diff 컨텍스트에 '"scripts"' 키가
                # 안 잡혀도 놓치지 않는다(H1). 위임이 아니거나 scripts 불변이면
                # 기존대로 jest/vitest 러너 설정 마커 델타만 감시한다.
                if name in delegation and self._pkg_scripts_changed(path):
                    label = "verify 위임 타겟 변경"
                else:
                    delta = self._changed_content(path, st)
                    if any(m in delta for m in self.VERIFY_CONFIG_CONTENT_MARKERS[name]):
                        label = "테스트 러너 설정 델타"
            elif name in self.VERIFY_CONFIG_CONTENT_MARKERS:  # pyproject.toml
                delta = self._changed_content(path, st)
                if any(m in delta for m in self.VERIFY_CONFIG_CONTENT_MARKERS[name]):
                    label = "테스트 러너 설정 델타"
            elif name in delegation:
                # verify가 위임하는 스크립트/Makefile 변경
                label = "verify 위임 타겟 변경"
            elif self.TEST_FILE_NAME_RE.search(name) and not st.startswith("?"):
                # tracked 테스트 파일 수정만 — 신규(??)는 정상 TDD 산출물
                label = "기존 테스트 수정"
            if label:
                flagged.append(f"{path} ({label})")
        if not flagged:
            return
        stats["verify_surface_changes"] = (
            stats.get("verify_surface_changes", 0) + len(flagged))
        for f in flagged:
            print(f"  WARN: step 세션이 verify가 읽는 아티팩트를 변경: {f} — "
                  f"verify 의미가 바뀌었을 수 있음. diff를 감사하라 (verify-surface watch)")

    def _changed_content(self, path: str, st: str) -> str:
        """플래그 후보 파일의 이번 세션 델타 텍스트. step 시작 시점 워크트리는 직전
        커밋으로 클린하므로 HEAD 대비 diff가 곧 이번 세션의 변경이다. untracked면
        diff에 안 잡히므로 파일 전문을 쓴다."""
        if st.startswith("?"):
            try:
                return (Path(self._root) / path).read_text(encoding="utf-8", errors="replace")
            except OSError:
                return ""
        return self._run_git("diff", "HEAD", "--", path).stdout or ""

    def run(self):
        self._engine_started_at = self._stamp()
        self._print_header()
        # 전 드라이버 공통 실행 락 (Codex 크로스 리뷰 2026-07-10): clean-check·
        # checkout·`git add -A` 커밋이 저장소를 건드리기 전에 잡아야 두 엔진의
        # 경합이 저장소를 오염시키지 못한다. __init__이 아니라 여기서 잡는 이유:
        # StepExecutor 생성이 곧 실행은 아니다(테스트·도구가 직접 생성) — 락은
        # "실행" 단위 가드이므로 run() 진입이 획득 시점이다.
        self._acquire_run_lock()
        try:
            self._check_worktree_clean()
            self._checkout_branch()
            # H3: 강제 계층(훅·settings·인터프리터)이 죽어 있으면 조용히 통과하지 않고 거부.
            # .claude/settings.json과 훅 파일은 tracked라 브랜치마다 다를 수 있으므로,
            # 검사는 실제로 세션이 실행될 브랜치(checkout 이후) 기준이어야 한다 —
            # H2가 index.json에 대해 고친 것과 같은 결함 클래스 (이중 검증에서 지적됨).
            self._check_enforcement_alive()
            # Stop 게이트 no-op(콘피그 없음+매니페스트 미감지)은 기동 시 1회만 알린다 —
            # alive 검사 내부에 넣으면 매 step 재검사(_execute_all_steps)에서 스팸이 된다.
            self._warn_stop_gate_noop()
            if self._driver == "codex":
                # MCP 서버 열거(및 실패 시 fail-closed)는 첫 세션 직전이 아니라 기동
                # 시점에 드러낸다 — 1800초 세션을 소모한 뒤 죽으면 늦다.
                self._codex_mcp_disable_flags()
            # H2: phases/{task}/index.json은 tracked 파일이라 호출 브랜치와 feat 브랜치의
            # 내용이 다를 수 있다. verify 스냅샷·블로커·verify 게이트는 실제로 실행될
            # 파일(feat 브랜치) 기준이어야 하므로 checkout 뒤에 (재)수행한다. __init__의
            # _snapshot_verify() 호출은 속성 초기화(+기존 테스트 다수가 의존)를 위해
            # 유지하고, checkout 후 이 재호출이 그 값을 덮어쓴다.
            # 계획 스키마 검증(기동 게이트)은 _snapshot_verify가 idx["steps"]·s["step"]을
            # 직접 인덱싱하기 전에, 실행될 파일(feat 브랜치) 기준으로 먼저 돌린다.
            self._validate_plan_schema()
            self._snapshot_verify()
            # 자기보고 불신은 재기동에도 적용된다 — 직전 런이 verify 전에 죽으며 남긴
            # 세션 기입 completed를 그대로 baseline으로 신뢰하면 미검증 통과가 된다.
            self._reconcile_unverified_completed()
            self._check_blockers()
            self._check_verify_defined()
            # 기동 시점 = 무인 실행에서 사람이 있는 유일한 시점 — 미조사 실패를 여기서 표면화
            self._warn_lessons_health()
            # 체크아웃이 tracked .harness 파일을 바꿀 수 있으므로 스냅샷은 체크아웃 뒤에 찍는다
            self._snapshot_memory()
            # F-B: .claude 강제 파일도 같은 이유로 체크아웃 뒤에 스냅샷한다
            self._snapshot_enforcement()
            # v0.9.0: step 파일(프롬프트 주입 표면)도 체크아웃 뒤 기준으로 스냅샷한다
            self._snapshot_step_files()
            guardrails = self._load_guardrails()
            self._ensure_created_at()
            self._execute_all_steps(guardrails)
            self._finalize()
        except Exception as e:
            # 예상 밖 크래시 기록 (Codex 크로스 리뷰 2026-07-10, 수정 권장 순서 6번):
            # completed/error/blocked는 각자 경로에서 이미 이력을 남기지만, 엔진
            # 버그·디스크 오류 같은 예상 밖 예외로 죽으면 그 런은 run-history.jsonl에
            # 흔적이 없어 런 간 비교 관찰에 구멍이 생긴다. SystemExit(기동 게이트
            # 거부·blocked/error 자체 sys.exit)과 KeyboardInterrupt는 BaseException
            # 서브클래스라 여기 잡히지 않는다 — 의도된 종료를 크래시로 오분류하지 않는다.
            self._record_crash(e)
            raise  # fail-closed: 기록 성공 여부와 무관하게 원래 예외를 반드시 재전파한다
        finally:
            # 정상 종료·sys.exit(blocked/error)·예외 모두에서 해제한다. 해제는
            # 자기 락일 때만 — stale 인수 경쟁으로 디스크의 락이 남의 것일 수 있다.
            self._release_run_lock()

    def _record_crash(self, exc: Exception):
        """예상 밖 예외로 run()이 죽는 런을 run-history.jsonl에 best-effort로
        남긴다 (Codex 크로스 리뷰 2026-07-10, 수정 권장 순서 6번). _write_run_summary가
        run-summary.json 갱신과 history append를 이미 한 번에 하므로 새 기록 로직을
        만들지 않고 그대로 재사용한다 — outcome="crashed"만 새 값이다.

        기록 시도 자체가 던질 수 있다(크래시 원인이 index.json 손상 등이면 이
        메서드가 읽는 index도 같이 깨져 있을 수 있음). 원래 예외가 이 기록 실패에
        가려지면 fail-closed 원칙이 깨지므로 내부에서 삼키고 WARN만 남긴다 —
        호출부(run())가 항상 원래 예외를 재전파한다.

        _write_run_summary/_append_run_history의 시그니처는 바꾸지 않는다.
        예외 타입명은 인스턴스 속성(_crash_exception_type)에 1회성으로 얹어
        _write_run_summary가 소비하게 한다 — 새 매개변수를 두 함수에 관통시키는
        것보다 기존 파이프라인(스냅샷된 summary dict가 그대로 history로 흘러가는
        구조)에 얹는 쪽이 더 작은 변경이다."""
        try:
            self._crash_exception_type = type(exc).__name__
            self._write_run_summary("crashed")
        except Exception as record_exc:
            print(f"  WARN: 크래시 이력 기록 실패 (run-history.jsonl) — 원래 예외는 "
                  f"그대로 전파합니다: {record_exc}")

    # --- 전 드라이버 공통 실행 락 (.harness/run.lock) ---
    # (Codex 크로스 리뷰 2026-07-10) 기존 동시 실행 방지는 bridge 드라이버의
    # request.json 리스(LEASE_FRESH_SECS)뿐이라, claude/codex CLI 드라이버 엔진
    # 두 개가 같은 저장소에서 동시에 시작되면 clean-check·checkout·`git add -A`
    # 커밋이 경합해 저장소를 오염시킨다. 이 락은 드라이버와 무관하게 "이 저장소
    # 에서 엔진이 돌고 있는가"를 지키는 저장소 단위 가드다 — 워커 프로토콜 전용
    # 가드인 bridge 리스와 역할이 다르므로 둘 다 유지한다.
    #
    # stale 임계: CLI 드라이버는 세션 서브프로세스를 블로킹 대기하므로 세션 중
    # heartbeat가 불가능하다. 초크포인트 touch 사이의 최대 공백이 세션 하나
    # 길이(SESSION_TIMEOUT)이므로, 그보다 오래 침묵한 락만 죽은 엔진의 잔재로
    # 판정한다 (+여유는 시계 오차·디스크 지연 흡수).
    RUN_LOCK_STALE_MARGIN_SECS = 120
    # 갓 쓴 파일의 mtime이 time.time()보다 살짝 미래일 수 있다 — NTFS 타임스탬프
    # 반올림·시계 소스 미세 오차 (CI windows 러너에서 실측 2건, 2026-07-10: 신선한
    # 락이 음수 age로 "위조" 오판되어 takeover / 신선한 bridge 리스가 잔재로 오판
    # 되어 덮어쓰기 후 1800s 폴링 행). 이 허용 창 안의 음수 age는 신선으로
    # 판정한다 — 오판의 결과가 동시 실행(가드 우회)이므로 모호한 경계는
    # 거부(fail-closed)가 안전한 쪽. 크게 미래인 mtime(창 밖)만 위조/잔재 취급.
    CLOCK_SKEW_SECS = 2

    def _run_lock_path(self) -> Path:
        # ROOT가 아니라 _root 기준: 락이 지키는 대상은 git 저장소이고, 모든 git
        # 호출(_run_git, cwd=self._root)과 같은 뿌리를 봐야 한다.
        return Path(self._root) / ".harness" / "run.lock"

    def _run_lock_payload(self) -> str:
        """락 내용. run 식별자는 코드에 전역 run id가 없어 생략한다 — PID+
        started_at 조합이 사실상 그 역할을 한다. heartbeat_at은 획득 시점 값이며
        이후의 살아있음 신호는 JSON 재작성이 아니라 mtime touch다(bridge 리스와
        같은 규약 — 폴링 코스트 최소화)."""
        return json.dumps({
            "pid": os.getpid(),
            "branch": f"feat-{self._phase_name}",
            "started_at": getattr(self, "_engine_started_at", None),
            "heartbeat_at": self._stamp(),
        }, indent=2, ensure_ascii=False)

    def _acquire_run_lock(self):
        """`.harness/run.lock`을 O_CREAT|O_EXCL로 원자 획득한다. msvcrt/fcntl
        파일락킹 대신 O_EXCL인 이유: 크로스 플랫폼(Windows/Linux/macOS)에서
        동일하게 동작하는 유일한 표준 라이브러리 원자 생성 경로이기 때문."""
        lock = self._run_lock_path()
        lock.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_run_lock_ignored(lock.parent)
        stale_limit = self.SESSION_TIMEOUT + self.RUN_LOCK_STALE_MARGIN_SECS
        for takeover in (False, True):
            if self._create_run_lock(lock):
                return
            if takeover:
                # stale 인수 경쟁에서 짐 — 그 사이 다른 엔진이 락을 재작성
                # 했다는 뜻이므로 신선한 락 보유자로 취급하고 물러난다.
                self._refuse_run_lock(lock)
            try:
                age = time.time() - lock.stat().st_mtime
            except OSError:
                continue  # 판정 창에서 락이 사라짐(정상 해제) — 재시도
            # 크게 미래인 mtime만 위조/잔재로 취급한다 — 소폭 음수 age는 NTFS
            # 반올림/시계 미세 오차로 신선한 락에서도 발생하며(CI 실측), 그걸
            # 인수하면 살아있는 엔진의 락을 뺏어 동시 실행이 된다. 허용 창
            # 안의 음수는 신선 판정(거부). bridge 리스도 같은 창을 쓴다.
            if -self.CLOCK_SKEW_SECS <= age <= stale_limit:
                self._refuse_run_lock(lock, age)
            print(f"  WARN: stale run.lock 발견 (age {int(age)}s > {stale_limit}s) — "
                  f"죽은 엔진의 잔재로 보고 인수합니다")
            if self._takeover_stale_run_lock(lock, stale_limit):
                return

    def _create_run_lock(self, lock: Path) -> bool:
        """O_EXCL 원자 생성 + payload 기록. 성공 시 락 보유 상태로 True."""
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            return False
        try:
            os.write(fd, self._run_lock_payload().encode("utf-8"))
        finally:
            os.close(fd)
        # 이 플래그가 있어야만 touch/해제가 동작한다 — run()을 거치지 않는
        # 직접 호출(테스트·도구)에서 락 부재가 에러가 되지 않게 하는 가드.
        self._run_lock_acquired = True
        return True

    def _takeover_stale_run_lock(self, lock: Path, stale_limit: float) -> bool:
        """stale 락 인수를 run.lock.takeover 토큰으로 직렬화한다 (Codex 크로스
        리뷰 2026-07-10 HIGH). stat→stale 판정→unlink가 원자적이지 않아, 같은
        stale 락을 본 두 엔진이 인터리빙하면(A unlink→A 재생성→B unlink→B 재생성)
        B가 A의 '새 락'을 지워 둘 다 락을 쥐게 된다 — 락의 핵심 보증이 락이 가장
        필요한 순간에 깨진다. unlink 권한을 토큰(O_EXCL)으로 직렬화하고, 토큰
        안에서 재stat·재검증한 뒤에만 unlink+재생성한다. 성공 시 락 보유 상태로
        True, 재생성 경쟁에서 지면 False (호출측 round-2가 refuse로 수렴).

        토큰 잔재는 자동 인수하지 않는다(fail-closed) — 락과 같은 창으로 stale
        토큰을 지우고 재생성하면 토큰 층에서 같은 ABA 레이스가 한 단계 위로
        재현된다 (구현 크로스 리뷰에서 이중 True 반환이 실제 재현됨, 2026-07-10).
        토큰은 인수 절차 동안(밀리초)만 존재하므로 크래시 잔재 확률과 수동 정리
        비용이 락과 비교 불가로 낮다 — 자동 인수를 포기해도 사용성 손실이 없고,
        토큰을 지우는 주체가 항상 그 생성자뿐이 되어 finally의 무조건 unlink도
        자기 토큰만 지운다는 보증이 성립한다."""
        token = lock.parent / (lock.name + ".takeover")
        try:
            tfd = os.open(str(token), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            print(f"  ERROR: stale run.lock 인수 토큰({token})이 이미 있습니다 — "
                  f"다른 엔진이 지금 인수 중이거나, 인수 도중 크래시한 잔재입니다. "
                  f"돌고 있는 엔진이 없다면 run.lock.takeover와 run.lock을 지우고 "
                  f"재실행하세요.")
            sys.exit(1)
        try:
            os.close(tfd)
            # 토큰 안에서 재검증: 첫 stat과 토큰 획득 사이에 다른 엔진이 인수를
            # 끝내고 락을 재작성했을 수 있다 — 그 락은 신선하므로 물러난다.
            # (refuse의 SystemExit도 아래 finally를 타므로 토큰은 남지 않는다)
            try:
                age = time.time() - lock.stat().st_mtime
            except OSError:
                age = None  # 락이 사라짐 — unlink 없이 재생성 경쟁으로
            if age is not None:
                if -self.CLOCK_SKEW_SECS <= age <= stale_limit:
                    self._refuse_run_lock(lock, age)
                with contextlib.suppress(OSError):
                    lock.unlink()
            return self._create_run_lock(lock)
        finally:
            with contextlib.suppress(OSError):
                token.unlink()

    def _refuse_run_lock(self, lock: Path, age: Optional[float] = None):
        """신선한 락 보유자에게 양보한다 — bridge 리스 에러와 같은 스타일로
        누가 잡고 있는지, 잔재라면 무엇을 지우면 되는지 안내하고 exit 1."""
        info = {}
        with contextlib.suppress(OSError, json.JSONDecodeError, ValueError):
            loaded = json.loads(lock.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                info = loaded
        if age is None:
            with contextlib.suppress(OSError):
                age = time.time() - lock.stat().st_mtime
        age_str = f"{int(age)}s" if age is not None else "?"
        print(f"  ERROR: 다른 엔진이 이 저장소에서 실행 중인 것 같습니다 "
              f"(.harness/run.lock age {age_str}, PID {info.get('pid', '?')}, "
              f"branch {info.get('branch', '?')}). 동시 실행은 지원하지 않습니다 — "
              f"해당 엔진이 돌고 있지 않다면 .harness/run.lock을 지우고 재실행하세요.")
        sys.exit(1)

    def _release_run_lock(self):
        """자기 락만 지운다. stale 인수 경쟁 직후에는 디스크의 락이 남의 것일 수
        있고, 그것을 지우면 살아있는 엔진의 락을 무력화한다 — PID 대조로 소유를
        확인한다. 읽기/파싱 실패 = 소유 확인 불가이므로 지우지 않는다 (남는
        잔재는 다음 기동의 stale 판정이 인수한다, 보수적 선택)."""
        if not getattr(self, "_run_lock_acquired", False):
            return
        lock = self._run_lock_path()
        try:
            info = json.loads(lock.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError):
            return
        if isinstance(info, dict) and info.get("pid") == os.getpid():
            with contextlib.suppress(OSError):
                lock.unlink()

    def _touch_run_lock(self):
        """heartbeat: 락 mtime을 갱신한다. CLI 드라이버는 세션 서브프로세스를
        블로킹 대기하므로 세션 중 갱신이 불가능하다 — 스레드를 두는 대신 step
        경계(세션 기동 직전·verify·커밋·advisory 직전)와 bridge 폴링 같은 자연
        스러운 단일 스레드 초크포인트에서 touch하고, stale 임계가 세션 하나
        길이의 공백을 흡수한다."""
        if not getattr(self, "_run_lock_acquired", False):
            return
        with contextlib.suppress(OSError):
            os.utime(str(self._run_lock_path()))

    def _ensure_run_lock_ignored(self, hdir: Path):
        """run.lock이 어떤 커밋에도 실리지 않게 보장한다. 엔진의 chore 커밋은
        `git add -A`를 쓰고 .harness/는 chore 커밋에 의도적으로 실리므로(레슨
        기록 등), 락이 잡혀 있는 커밋 시점에 그대로 두면 커밋에 편승한다.
        worker/ 하위의 .gitignore(`*`)와 달리 여기는 락 한 줄만 제외한다 —
        .harness의 다른 파일(LESSONS.md 등)은 계속 커밋돼야 하기 때문.

        쓰기는 OSError를 삼키므로(읽기 전용 FS 등) 후조건을 git check-ignore로
        검증한다 (Codex 크로스 리뷰 2026-07-10) — 조용히 실패하면 락이 chore
        커밋에 편승하고, 그 커밋을 checkout으로 재물질화하면 이후 기동이 신선
        락으로 오판·거부되는 연쇄가 생긴다. 호출 위치가 락 생성 전이라 여기서
        거부해도 잔재가 없다."""
        gi = hdir / ".gitignore"
        try:
            text = gi.read_text(encoding="utf-8") if gi.exists() else ""
        except OSError:
            text = ""
        # takeover 토큰도 함께 제외한다 — 크래시가 토큰만 남기고 죽으면 다음
        # 기동은 초기 O_EXCL 생성이 바로 성공해 토큰 경로를 지나지 않으므로,
        # ignore 없이는 잔재 토큰이 chore 커밋에 편승한다 (크로스 리뷰 MED).
        lines = {line.strip() for line in text.splitlines()}
        missing = [n for n in ("run.lock", "run.lock.takeover") if n not in lines]
        if missing:
            if text and not text.endswith("\n"):
                text += "\n"
            with contextlib.suppress(OSError):
                gi.write_text(text + "".join(f"{n}\n" for n in missing),
                              encoding="utf-8")
        # 후조건: exit 0=무시됨, 1=무시 안 됨(거부), 그 외(128 등)=판정 불가 —
        # repo가 아니면 어차피 직후 clean-check가 같은 git으로 시끄럽게 실패하고,
        # 직접 호출 테스트의 tmp 디렉토리는 repo가 아니므로 통과시킨다.
        for name in ("run.lock", "run.lock.takeover"):
            if self._run_git("check-ignore", "-q", f".harness/{name}").returncode == 1:
                print(f"  ERROR: .harness/{name}이 gitignore에 반영되지 않았습니다 "
                      f"({gi} 쓰기 실패 추정) — 락/토큰이 chore 커밋에 편승하는 것을 "
                      f"막기 위해 기동을 거부합니다. 해당 파일에 '{name}' 한 줄을 "
                      f"추가하세요.")
                sys.exit(1)

    # --- H3: 강제 계층 생존성 어서션 (fail-closed) ---

    # 엔진 훅 3종과 등록돼야 하는 이벤트. command 문자열에 파일명이 포함돼 있는지로
    # 등록 여부를 판정한다 (경로 표기·인터프리터 차이에 견고). label은 사용자 안내용.
    ENFORCEMENT_HOOKS = (
        ("stop-quality-gate.py", "Stop", "Stop 품질 게이트"),
        ("block-dangerous-bash.py", "PreToolUse", "위험 bash 차단"),
        ("tdd-guard.py", "PreToolUse", "TDD 가드"),
    )

    # v0.12.0: 등록 이벤트가 맞아도 matcher가 도구를 놓치면 훅은 그 도구 경유
    # 편집/실행에 발화하지 않는다 — NotebookEdit 편입(v0.11.0)과 같은 결함 클래스의
    # 기동 시점 검사. 기동 시점에 이미 잘못된 matcher는 바이트 스냅샷이 그 값을
    # 기준으로 삼아 원복도 못 하므로 alive 검사가 잡아야 한다. 필수 토큰은
    # 드라이버별이다: codex의 파일 편집 도구는 apply_patch(install_engine.py의
    # codex 변환이 토큰 검사로 부착 — 동일 규약, 함께 움직여야 한다)이고
    # NotebookEdit은 codex에 없으므로 요구하지 않는다(구버전 설치본 false-fail
    # 방지). 사용자가 도구를 추가로 넓히는 것은 허용 — 누락만 dead다.
    REQUIRED_MATCHER_TOKENS = {
        "claude": {
            "block-dangerous-bash.py": frozenset({"Bash"}),
            "tdd-guard.py": frozenset({"Edit", "Write", "MultiEdit", "NotebookEdit"}),
        },
        "codex": {
            "block-dangerous-bash.py": frozenset({"Bash"}),
            "tdd-guard.py": frozenset({"Edit", "Write", "MultiEdit", "apply_patch"}),
        },
    }

    @staticmethod
    def _script_matcher_tokens(merged: dict, event: str, filename: str):
        """filename이 등록된 엔트리들의 matcher 토큰 합집합을 돌려준다. 훅은 어느 한
        엔트리만 매치해도 발화하므로 엔트리별이 아니라 합집합으로 판정한다. matcher
        부재/빈 문자열/'*'/'.*'는 전체 매치이므로 full_match=True — 이 처리가 없으면
        정당한 광역 등록을 dead로 오판해 fail-closed가 오발동한다."""
        tokens, full_match = set(), False
        for entry in merged.get(event, []):
            if not isinstance(entry, dict):
                continue
            cmds = [h.get("command", "") for h in entry.get("hooks", [])
                    if isinstance(h, dict) and h.get("type") == "command"]
            if not any(filename in c for c in cmds):
                continue
            m = entry.get("matcher")
            if m is None or not str(m).strip() or str(m).strip() in ("*", ".*"):
                full_match = True
            else:
                tokens |= {t.strip() for t in str(m).split("|") if t.strip()}
        return tokens, full_match

    def _merged_hooks(self) -> dict:
        """.claude/settings.json과 settings.local.json의 hooks를 이벤트별로 합친다.
        사용자가 local에 정당하게 등록했을 수 있으므로 둘 다 검사 대상이다. BOM은
        허용(utf-8-sig)하고, 없거나 깨진 파일은 빈 것으로 취급한다 — 깨진 settings는
        훅이 조용히 죽는 대표 경로이므로, 빈 것으로 두면 아래 등록 검사가 fail-closed로
        걸린다."""
        merged = {}
        cdir = Path(self._root) / ".claude"
        for name in ("settings.json", "settings.local.json"):
            p = cdir / name
            if not p.exists():
                continue
            try:
                data = json.loads(p.read_text(encoding="utf-8-sig"))
            except (json.JSONDecodeError, ValueError, OSError):
                continue
            hooks_obj = data.get("hooks") if isinstance(data, dict) else None
            if not isinstance(hooks_obj, dict):
                # "hooks": [] 같은 구조 이상도 깨진 settings와 동급 — 빈 것으로
                # 취급해 아래 등록 검사가 traceback 없이 fail-closed로 걸리게 한다.
                continue
            for event, entries in hooks_obj.items():
                if isinstance(entries, list):
                    merged.setdefault(event, []).extend(entries)
        return merged

    @staticmethod
    def _event_commands(merged_hooks: dict, event: str) -> list:
        """merged hooks에서 특정 이벤트 아래 등록된 command 훅의 command 문자열을
        모두 모은다. type이 "command"가 아닌 훅은 Claude Code가 커맨드로 실행하지
        않으므로 등록으로 인정하지 않는다 (검증에서 지적된 느슨함 보강)."""
        cmds = []
        for entry in merged_hooks.get(event, []):
            if not isinstance(entry, dict):
                continue
            for h in entry.get("hooks", []) or []:
                if not isinstance(h, dict) or h.get("type") != "command":
                    continue
                c = h.get("command")
                if c:
                    cmds.append(c)
        return cmds

    @staticmethod
    def _hook_interpreter(command: str) -> str:
        """훅 command에서 인터프리터 실행 파일 토큰(첫 토큰)을 뽑는다. py 런처는
        'py -3 ...'로 등록되지만 shutil.which로 확인할 실행 파일 이름은 py다."""
        tokens = command.split()
        return tokens[0] if tokens else ""

    def _interpreter_ok(self, command: str) -> bool:
        interp = self._hook_interpreter(command)
        return bool(interp) and shutil.which(interp) is not None

    def _dead_hook_entries(self, merged: dict, driver_key: str = "claude") -> list:
        """merged hooks 등록을 ENFORCEMENT_HOOKS 기준으로 검사해 죽은 항목을 모은다.
        훅 스크립트 본체는 드라이버와 무관하게 .claude/hooks/에 있다. driver_key는
        REQUIRED_MATCHER_TOKENS 선택용 — bridge는 Claude Code settings를 쓰므로
        claude와 같은 집합이다."""
        dead = []
        for filename, event, label in self.ENFORCEMENT_HOOKS:
            commands = [c for c in self._event_commands(merged, event) if filename in c]
            if not commands:
                dead.append(f"{label} ({filename}): {event} 이벤트에 등록돼 있지 않음")
                continue
            if not any(self._interpreter_ok(c) for c in commands):
                interp = self._hook_interpreter(commands[0]) or "?"
                dead.append(f"{label} ({filename}): 인터프리터 '{interp}'를 "
                            f"PATH에서 실행할 수 없음")
            if not (Path(self._root) / ".claude" / "hooks" / filename).is_file():
                dead.append(f"{label} ({filename}): 훅 스크립트 파일이 없음")
            required = self.REQUIRED_MATCHER_TOKENS.get(driver_key, {}).get(filename)
            if required:
                tokens, full_match = self._script_matcher_tokens(merged, event, filename)
                missing = set() if full_match else (required - tokens)
                if missing:
                    dead.append(f"{label} ({filename}): {event} matcher에 필수 도구 누락: "
                                f"{', '.join(sorted(missing))} — 해당 도구 경유 작업에 "
                                f"훅이 발화하지 않음")
        return dead

    def _merged_codex_hooks(self) -> dict:
        """.codex/hooks.json의 hooks를 이벤트별로 모은다. 스키마는 Claude Code와
        동일함이 E2E 패리티 테스트로 확인됐다. 없거나 깨진 파일은 빈 것으로 취급해
        등록 검사가 fail-closed로 걸리게 한다."""
        p = Path(self._root) / ".codex" / "hooks.json"
        if not p.exists():
            return {}
        try:
            data = json.loads(p.read_text(encoding="utf-8-sig"))
        except (json.JSONDecodeError, ValueError, OSError):
            return {}
        hooks_obj = data.get("hooks") if isinstance(data, dict) else None
        if not isinstance(hooks_obj, dict):
            return {}
        return {event: entries for event, entries in hooks_obj.items()
                if isinstance(entries, list)}

    def _codex_features_hooks_enabled(self) -> Optional[bool]:
        """.codex/config.toml의 [features] hooks 값을 읽는다. Codex 훅은 이 피처
        플래그가 켜져 있어야만 발화한다 (실전 검증). 파일/섹션/키가 없으면 None."""
        p = Path(self._root) / ".codex" / "config.toml"
        if not p.exists():
            return None
        try:
            text = p.read_text(encoding="utf-8-sig")
        except OSError:
            return None
        # 섹션 경계는 다음 줄머리 테이블 헤더 — `[^\[]*`는 주석 속 `[`에서 캡처가
        # 절단돼 그 뒤의 hooks 키를 못 보고 None(기동 거부)을 냈다 (2026-07-11 L4).
        # 헤더는 들여쓰기·괄호 안 공백 변형(`  [features]`·`[ features ]`)도 유효
        # TOML이라 함께 인식한다 (Codex 크로스 리뷰 2026-07-11 MED — 인식 실패는
        # 정상 설정의 기동 거부). 알려진 한계: multiline string 안의 줄머리
        # `[...]`는 테이블 헤더와 구분하지 못한다 — 전체 TOML 파서는 3.9 비호환
        # (vendoring 비용)이고 실사용 .codex/config.toml 형상에서 비현실적 엣지라
        # 기각. install_engine.ensure_codex_features와 의도적으로 동일한 정규식.
        m = re.search(r"^[ \t]*\[[ \t]*features[ \t]*\][^\n]*(.*?)(?=^[ \t]*\[|\Z)",
                      text, re.MULTILINE | re.DOTALL)
        if not m:
            return None
        m2 = re.search(r"^\s*hooks\s*=\s*(true|false)\s*(?:#.*)?$", m.group(1), re.MULTILINE)
        if not m2:
            return None
        return m2.group(1) == "true"

    # Codex 크로스 리뷰 (2026-07-06): Stop 게이트 생존성은 "등록됨"만으로 부족하다.
    # .claude/quality-gate.json이 존재하면 훅은 매니페스트 자동 감지를 건너뛰고 그
    # 커맨드 목록만 쓰는데, 목록이 비었거나 형식이 깨져 있으면 게이트가 아무것도
    # 검사하지 않으면서 통과한다 — 등록·파일·인터프리터 검사는 전부 통과하므로
    # 조용한 공동화다. 파일이 없는 경우는 자동 감지 폴백이 있는 문서화된 동작이라
    # 검사하지 않는다. 탈출구는 우회 플래그가 아니라 커맨드를 채우거나 파일을 지워
    # 자동 감지로 되돌리는 것. 파싱은 훅(stop-quality-gate.py detect_commands)과
    # 동일 의미론을 유지해야 한다 — 훅이 건너뛸 상태를 엔진이 건강하다고 판정하면
    # 이 검사 자체가 거짓 보증이 된다.
    def _stop_gate_config_dead(self) -> list:
        p = Path(self._root) / ".claude" / "quality-gate.json"
        if not p.exists():
            return []
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, ValueError, OSError):
            return [".claude/quality-gate.json: JSON 파싱 실패 — Stop 게이트가 커맨드 "
                    "0개로 조용히 통과합니다. 파일을 고치거나 삭제하세요(매니페스트 자동 감지 폴백)"]
        commands = data.get("commands") if isinstance(data, dict) else None
        if (not isinstance(commands, list) or not commands
                or not all(isinstance(c, str) and c.strip() for c in commands)):
            return [".claude/quality-gate.json: 유효한 커맨드가 0개 — Stop 게이트가 아무것도 "
                    "검사하지 않고 통과합니다. 커맨드를 채우거나 파일을 삭제하세요(매니페스트 자동 감지 폴백)"]
        return []

    # v0.12.0: quality-gate.json이 없고 매니페스트도 감지되지 않으면 Stop 게이트는
    # 커맨드 0개로 조용히 통과한다(훅의 문서화된 동작). 그 상태 자체는 정당할 수
    # 있으나(비표준 빌드), "강제 계층은 조용히 죽지 않는다" 불변식이 이 경로에서만
    # 무음이므로 기동 시 1회 WARN으로 표면화한다 — 기동 거부가 아닌 이유는 per-step
    # verify 게이트가 살아 있기 때문. 판정은 stop-quality-gate.py detect_commands와
    # 동일 의미론이어야 한다(package.json이 있으면 scripts만 보고 다른 매니페스트로
    # 폴백하지 않는 조기 반환 포함) — 훅이 건너뛸 상태를 엔진이 다르게 판정하면
    # 이 경고 자체가 거짓 신호가 된다.
    def _warn_stop_gate_noop(self):
        root = Path(self._root)
        if (root / ".claude" / "quality-gate.json").exists():
            return  # 존재하는 config의 공동화는 _stop_gate_config_dead가 fail-closed로 잡는다
        pkg = root / "package.json"
        if pkg.exists():
            try:
                scripts = json.loads(pkg.read_text(encoding="utf-8")).get("scripts") or {}
            except Exception:
                scripts = {}
            if any(s in scripts for s in ("lint", "build", "test")):
                return
            reason = ("package.json에 lint/build/test 스크립트가 없음 "
                      "(훅은 다른 매니페스트로 폴백하지 않음)")
        elif any((root / mf).exists() for mf in ("pyproject.toml", "Cargo.toml", "go.mod")):
            return
        else:
            reason = "매니페스트(package.json/pyproject.toml/Cargo.toml/go.mod) 미감지"
        print(f"  WARN: Stop 게이트가 검사할 커맨드가 없어 조용히 통과합니다 — {reason}.")
        print("        회귀 백스톱 없이 per-step verify만 남습니다 — 세션의 테스트 약화를"
              " 잡을 마지막 그물도 verify뿐입니다.")
        print("        커맨드를 강제하려면 .claude/quality-gate.json을 작성하세요"
              " (harness-tailor 스킬 소유).")

    def _check_enforcement_alive(self):
        """기동 시 강제 계층(훅 등록·훅 파일·인터프리터)이 살아있는지 확인하고, 하나라도
        죽어 있으면 fail-closed로 기동을 거부한다. 설치 후 settings.json이 깨지거나
        훅 파일이 지워지거나 인터프리터가 PATH에서 사라지면 훅이 조용히 죽어, 아무도
        모르게 품질 게이트·위험 bash 차단·TDD 가드가 사라지는 것을 막는다.

        이 검사는 필요조건(등록돼 있고 인터프리터가 실행 가능)이지 충분조건(훅이 실제로
        발화한다)이 아니다 — settings 형식이 맞아도 CLI 쪽에서 발화가 막힐 여지는
        검사 범위 밖이다(메시지에 과장 금지). 탈출 플래그는 두지 않는다: 강제 계층
        생존성 검사이므로 우회 옵션 자체가 불변식 위반이다."""
        cdir = Path(self._root) / ".claude"
        if not cdir.is_dir():
            # 훅 스크립트 본체가 .claude/hooks/에 있으므로 드라이버와 무관하게 필수.
            self._report_enforcement_dead(
                [".claude/ 디렉토리가 없음 — 엔진이 설치되지 않았습니다"])
        # quality-gate.json 공동화 검사는 훅 스크립트가 드라이버 공통이므로 전 드라이버 적용
        gate_dead = self._stop_gate_config_dead()
        if self._driver == "codex":
            dead = list(gate_dead)
            if not (Path(self._root) / ".codex").is_dir():
                self._report_enforcement_dead(
                    [".codex/ 디렉토리가 없음 — codex 드라이버용 훅이 설치되지 않았습니다"])
            # Codex는 [features] hooks = true 없이는 훅 전체가 조용히 죽는다.
            if self._codex_features_hooks_enabled() is not True:
                dead.append(".codex/config.toml: [features] hooks = true가 없거나 꺼져 있음 "
                            "— Codex 훅 전체 비활성")
            dead += self._dead_hook_entries(self._merged_codex_hooks(), "codex")
            if dead:
                self._report_enforcement_dead(dead)
            return
        merged = self._merged_hooks()
        dead = list(gate_dead)
        # F-B: 훅 등록·파일·인터프리터가 전부 멀쩡해도 disableAllHooks 한 줄이면
        # 모든 훅이 죽는다 — 등록 검사와 별개의 dead 조건으로 확인한다.
        for name in ("settings.json", "settings.local.json"):
            p = cdir / name
            if not p.exists():
                continue
            try:
                data = json.loads(p.read_text(encoding="utf-8-sig"))
            except (json.JSONDecodeError, ValueError, OSError):
                continue  # 깨진 settings는 _merged_hooks가 빈 것으로 취급 → 등록 검사에 걸린다
            if isinstance(data, dict) and data.get("disableAllHooks") is True:
                dead.append(f".claude/{name}: disableAllHooks=true — 모든 훅이 비활성화됨")
        dead += self._dead_hook_entries(merged)
        if self._driver == "bridge":
            # bridge에서 step 작업은 워커 세션의 서브에이전트에서 끝난다 — headless의
            # "종료 전 자가수정" 루프를 그 경계에서 재현하려면 stop-quality-gate가
            # SubagentStop에도 등록돼 있어야 한다 (게이트 자체는 마커가 없으면
            # SubagentStop에서 즉시 통과하므로 일반 사용에는 영향 없음).
            cmds = [c for c in self._event_commands(merged, "SubagentStop")
                    if "stop-quality-gate.py" in c]
            if not cmds:
                dead.append("Stop 품질 게이트 (stop-quality-gate.py): SubagentStop 이벤트에 "
                            "등록돼 있지 않음 (bridge 드라이버 필수)")
        if dead:
            self._report_enforcement_dead(dead)

    def _report_enforcement_dead(self, dead: list):
        print(f"\n  ERROR: 강제 계층(하네스 훅)이 죽어 있어 기동을 거부합니다 (fail-closed):")
        for d in dead:
            print(f"    - {d}")
        print(f"  이대로 실행하면 품질 게이트·위험 bash 차단·TDD 가드가 조용히 사라집니다.")
        print(f"  harness-init을 재실행해 복구하세요.")
        sys.exit(1)

    # --- timestamps ---

    def _stamp(self) -> str:
        return datetime.now(self.TZ).strftime("%Y-%m-%dT%H:%M:%S%z")

    # --- JSON I/O ---

    @staticmethod
    def _read_json(p: Path) -> dict:
        return json.loads(p.read_text(encoding="utf-8"))

    @staticmethod
    def _write_json(p: Path, data: dict):
        # 원자 쓰기(temp+replace): 쓰기 도중 크래시가 반쯤 쓰인 JSON을 남겨 다음
        # 기동을 죽이는 것을 막는다. temp는 같은 디렉토리에 만든다(크로스 볼륨
        # replace 불가). Windows에서 대상을 다른 프로세스(bridge 워커의 늦은 읽기
        # 등)가 열고 있으면 os.replace가 PermissionError를 내므로 짧게 재시도한다.
        tmp = p.with_name(p.name + ".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        for attempt in range(3):
            try:
                os.replace(tmp, p)
                return
            except PermissionError:
                if attempt == 2:
                    # 재시도 소진 — .tmp 잔재를 남기면 다음 chore 커밋(`git add -A`)에
                    # 편승한다. 대상 p는 불변이므로 tmp만 치우고 재전파한다 (L7).
                    with contextlib.suppress(OSError):
                        tmp.unlink()
                    raise
                time.sleep(0.1)

    def _write_index(self, index: dict):
        """index.json 쓰기 전용 게이트. step 세션은 status 갱신을 위해 index.json
        쓰기 권한이 있는데, 그 참에 steps[].verify를 "exit 0" 따위로 바꿔두면 이번
        실행은 _verify_snapshot 덕에 무사해도, _commit_step의 `git add -A`가 변조된
        index.json을 chore 커밋으로 영구 기록하고 다음 실행의 _snapshot_verify가
        변조값을 그대로 신뢰한다. 쓰기 직전 스냅샷과 대조해 이 크로스런 전파를
        차단한다. 스냅샷에 없는 step(세션이 추가한 신규 step)은 건드리지 않는다."""
        snap = getattr(self, "_verify_snapshot", {})
        for step in index.get("steps", []):
            num = step.get("step")
            if num not in snap:
                continue
            expected = snap[num]
            if step.get("verify") != expected:
                if expected is None:
                    # 스냅샷에 없던 verify를 세션이 심는 것도 변조다 — 키째 제거한다.
                    step.pop("verify", None)
                else:
                    step["verify"] = expected
                print(f"  WARN: step 세션이 step {num}의 verify를 변조함 — "
                      f"스냅샷으로 원복 (tamper check)")
        self._write_json(self._index_file, index)
        # F-A: 엔진 쓰기는 정당한 델타다 — 쓰기 직후 index 스냅샷을 동기화해,
        # 다음 _check_index_tamper가 엔진의 스탬프(started_at/completed_at 등)를
        # 변조로 오탐하지 않게 한다. 단일 초크포인트라 갱신 누락이 구조적으로 없다.
        self._index_snapshot = copy.deepcopy(index)

    # 세션이 index.json에 정당하게 쓸 수 있는 것은 "현재 실행 중인 step"의 이
    # 필드들뿐이다 (프리앰블 작업 규칙 5의 계약). completed_at/blocked_at/failed_at/
    # started_at은 전부 엔진 스탬프이고, 다른 step·step 집합·톱레벨 필드는 엔진과
    # 사람(기동 전 편집)의 소유다.
    SESSION_STEP_FIELDS = ("status", "summary", "contract", "error_message", "blocked_reason")
    # 프리앰블 작업 규칙 5가 세션에 기록하도록 계약한 결과 status. 엔진은 step을 항상
    # pending으로 세션에 넘기므로(started_at만 찍고 status는 그대로 둔다 —
    # _execute_all_steps 근거), 세션이 정당하게 만들 수 있는 status 전이는 이 셋 중
    # 하나로 가거나 스냅샷 값(통상 pending)을 그대로 두는 것뿐이다. pending으로의
    # 강등(재시도)·failed_at 스탬프 등은 엔진 소유라, 세션이 그 밖의 값을 기록하면
    # 변조로 본다 (Codex 크로스 리뷰 2026-07-10).
    SESSION_RESULT_STATUSES = frozenset({"completed", "error", "blocked"})

    def _check_index_tamper(self, current_step: Optional[int] = None):
        """세션 종료 직후 index.json을 스냅샷 기준으로 재구성한다 (F-A).

        차이에서 변조를 찾는 블랙리스트가 아니라, 스냅샷으로 재구성한 뒤 현재
        step의 화이트리스트 필드만 라이브 값을 이식하는 화이트리스트 방식이다 —
        diff 로직이 없으므로 빠뜨릴 필드도 없다. 이것이 막는 실제 우회로:
        - 미래 step status 선기입 / step 삭제 → 실행·verify 없이 phase 완료
        - step 번호 재부여·신규 step 추가 → verify 스냅샷 밖에서 자기보고만으로 통과
        - 완료된 step의 contract/summary/name 오염 → _build_step_context를 타고
          이후 모든 step 프롬프트에 지시문 주입
        advisory(replan/review) 세션은 current_step=None으로 호출한다 — index를
        쓸 정당한 사유가 없으므로 전량 원복된다. (advisory 시점의 index는 직전
        엔진 쓰기로 정당하게 dirty라 worktree 가드의 보존 규칙에 걸리지 않는다 —
        그래서 이 가드가 별도로 필요하다.)"""
        snap = getattr(self, "_index_snapshot", None)
        if snap is None:
            # 스냅샷 미설정(직접 호출 테스트 등) — 검사 없이 라이브를 그대로 반환.
            try:
                return self._read_json(self._index_file)
            except (json.JSONDecodeError, OSError):
                return None
        try:
            live = self._read_json(self._index_file)
        except (json.JSONDecodeError, OSError):
            # 세션이 index.json을 깨뜨리거나 지운 것도 변조와 동급 — 전체 복원한다.
            live = None
        rebuilt = copy.deepcopy(snap)
        live_steps = {}
        if isinstance(live, dict):
            live_steps = {s.get("step"): s for s in live.get("steps", [])
                          if isinstance(s, dict)}
        if current_step is not None and current_step in live_steps:
            for target in rebuilt.get("steps", []):
                if target.get("step") != current_step:
                    continue
                ls = live_steps[current_step]
                # 스냅샷(=엔진이 세션에 넘긴) status. 이식이 이 값을 덮어쓰기 전에
                # 읽어둔다 — 전이 정당성 판정의 기준이다 (통상 pending).
                snap_status = target.get("status")
                for field in self.SESSION_STEP_FIELDS:
                    if field not in ls:
                        # 세션이 필드를 지웠으면 스냅샷 값도 제거한다 — 현재 step의
                        # 화이트리스트 필드는 세션 자기보고가 존재 여부까지 소유한다.
                        target.pop(field, None)
                        continue
                    # 필드 이름만 화이트리스트하고 값의 타입·enum은 무검증이던 갭을
                    # 메운다 (Codex 크로스 리뷰 2026-07-10). 값이 계약 밖이면 이식을
                    # 생략해 스냅샷 값을 유지한다(스냅샷에 없던 필드면 target에도 없어
                    # 자동 드롭). 위반 WARN은 헬퍼가 출력한다.
                    if self._session_field_value_ok(field, ls[field], snap_status,
                                                    current_step):
                        target[field] = ls[field]
                break
        if live != rebuilt:
            added = [n for n in live_steps
                     if not any(s.get("step") == n for s in rebuilt.get("steps", []))]
            detail = f" (세션 추가 step {added} 제거 포함)" if added else ""
            print(f"  WARN: 세션이 index.json을 계약 밖으로 수정함 — "
                  f"스냅샷 기준 재구성{detail} (index tamper check)")
            self._write_json(self._index_file, rebuilt)
        # 재구성 결과(현재 step의 정당한 자기보고 반영)가 새 기준선이다.
        self._index_snapshot = copy.deepcopy(rebuilt)
        # authoritative dict를 반환한다. 호출자가 이걸 그대로 소비하면 라이브 파일을
        # 다시 읽지 않아도 되어, 재읽기-세탁 창을 없앤다 (bridge: done 이후에도
        # 살아있는 워커가 재읽기 직전 index를 변조하면 _write_index가 그 미검증
        # 읽기를 새 스냅샷으로 굳혀버리는 F-A 우회로 — Fable 리뷰 MAJOR-1).
        return rebuilt

    def _session_field_value_ok(self, field, value, snap_status, step_num) -> bool:
        """현재 step에 세션이 이식하려는 화이트리스트 필드 값이 계약에 맞는지 판정한다
        (Codex 크로스 리뷰 2026-07-10). 위반이면 WARN을 출력하고 False를 반환한다 —
        호출측은 이식을 생략해 스냅샷 값을 유지한다. 크기 상한은 두지 않는다: 프리앰블
        작업 규칙 5가 summary를 '길이 제한 없음'으로 계약하므로 상한은 계약과 충돌한다."""
        if field == "status":
            # 세션 소유 전이만 허용: 계약된 결과(completed/error/blocked)이거나 스냅샷
            # 값 그대로(세션이 status를 안 건드림). 불명 enum·pending 강등 등은 엔진
            # 소유이거나 손상이므로 스냅샷 값으로 원복한다. 엔진 스탬프는
            # SESSION_STEP_FIELDS 밖이라 애초에 이식되지 않으므로 오탐하지 않는다.
            if value == snap_status or value in self.SESSION_RESULT_STATUSES:
                return True
            allowed = "/".join(sorted(self.SESSION_RESULT_STATUSES))
            print(f"  WARN: 세션이 step {step_num} status를 {value!r}로 기록 — 세션이 만들 "
                  f"수 없는 전이(계약: {allowed} 또는 무변경), 스냅샷 값으로 원복 (index tamper check)")
            return False
        # summary/contract/error_message/blocked_reason: str이 아니면 원복(드롭)
        if not isinstance(value, str):
            print(f"  WARN: 세션이 step {step_num} {field}를 문자열이 아닌 값({type(value).__name__})"
                  f"으로 기록 — 스냅샷 값으로 원복 (index tamper check)")
            return False
        return True

    def _read_index_checked(self) -> dict:
        """엔진의 index 읽기 관문. 세션 프로세스 종료는 쓰기 종료를 보장하지
        않는다 — bridge 워커는 done 이후에도 살아있고, claude/codex도 세션이
        남긴 자식 프로세스(dev 서버·watcher·의도적 writer)가 마지막 tamper
        check와 다음 라이브 읽기 사이 창에 쓸 수 있다 (Codex 크로스 리뷰
        2026-07-06 — "프로세스가 죽어 동시 쓰기가 없다"던 기존 가정은 고아
        프로세스에 대해 틀렸다). 그 읽기가 _write_index에 흘러들면 스냅샷
        동기화로 세탁된다 (F-A / MAJOR-1과 동일 클래스). 모든 드라이버에서
        라이브를 그냥 읽지 않고 스냅샷 기준으로 재확인한 authoritative dict를
        소비한다."""
        index = self._check_index_tamper()
        if index is not None:
            return index
        # 스냅샷 미설정(직접 호출 테스트) — 라이브 폴백
        return self._read_json(self._index_file)

    # --- git ---

    def _run_git(self, *args) -> subprocess.CompletedProcess:
        cmd = ["git"] + list(args)
        try:
            return subprocess.run(cmd, cwd=self._root, capture_output=True, text=True,
                                  encoding="utf-8", errors="replace")
        except FileNotFoundError:
            # git 바이너리 부재 — 엔진은 검증된 step을 git으로 커밋하므로 진행
            # 불가다. 방향은 어차피 fail-closed지만 raw traceback 대신 친절하게
            # 거부한다 (2026-07-11 L6).
            print("  ERROR: git 실행 파일을 찾을 수 없습니다 (PATH 확인). 엔진은 "
                  "검증된 step을 git으로 커밋하므로 git 없이는 기동할 수 없습니다.")
            sys.exit(1)

    @staticmethod
    def _unquote_git_path(path: str) -> str:
        """git status --porcelain의 따옴표 경로를 해제한다. core.quotepath(기본 true)
        때문에 비-ASCII(한글 등) 경로는 UTF-8 바이트 단위 8진수 이스케이프로 감싸진다."""
        if not (len(path) >= 2 and path[0] == '"' and path[-1] == '"'):
            return path
        inner = path[1:-1]
        out = bytearray()
        i = 0
        while i < len(inner):
            c = inner[i]
            if c == "\\" and i + 1 < len(inner):
                nxt = inner[i + 1]
                if nxt.isdigit():
                    out.append(int(inner[i + 1:i + 4], 8))
                    i += 4
                    continue
                simple = {"\\": "\\", '"': '"', "t": "\t", "n": "\n"}
                if nxt in simple:
                    out.extend(simple[nxt].encode())
                    i += 2
                    continue
            out.extend(c.encode("utf-8"))
            i += 1
        return out.decode("utf-8", errors="replace")

    def _check_worktree_clean(self):
        """_commit_step의 `git add -A`가 사용자의 무관한 미커밋 변경을 step 커밋에
        흡수하지 않도록, 실행 시작 시점에 phases/ 밖의 변경이 없는지 확인한다.
        phases/ 아래(이전 실행이 남긴 index.json, replan-proposal.md 등)와 .harness/(기계적 레슨 기록)는 허용한다."""
        r = self._run_git("status", "--porcelain")
        if r.returncode != 0:
            return  # git 실패는 _checkout_branch의 에러 처리에 맡긴다 (이중 에러 방지)

        outside = []
        for line in r.stdout.splitlines():
            if not line.strip():
                continue
            path_part = line[3:]  # "XY " 다음부터 경로
            if " -> " in path_part:
                path_part = path_part.split(" -> ", 1)[1]  # rename은 새 경로 기준
            path = self._unquote_git_path(path_part)
            if not (path == "phases" or path.startswith("phases/")
                    or path == ".harness" or path.startswith(".harness/")):
                outside.append(path)

        if outside:
            print(f"\n  ERROR: phases/ 밖에 커밋되지 않은 변경이 있습니다:")
            for p in outside:
                print(f"    {p}")
            print(f"  Hint: commit 또는 stash 후 다시 실행하세요.")
            sys.exit(1)

    def _worktree_status(self) -> dict:
        """git status --porcelain을 path -> XY 상태 dict로 파싱한다.
        rename(R)은 old/새 경로를 모두 기록한다 — 새 경로만 기록하면 old 쪽
        staged delete가 복원 루프에 안 잡혀, 세션의 git mv가 원본을 영구히 지운다."""
        r = self._run_git("status", "--porcelain")
        if r.returncode != 0:
            return {}
        status = {}
        for line in r.stdout.splitlines():
            if not line.strip():
                continue
            path_part = line[3:]  # "XY " 다음부터 경로
            if " -> " in path_part:
                old_part, path_part = path_part.split(" -> ", 1)
                status[self._unquote_git_path(old_part)] = line[:2]
            status[self._unquote_git_path(path_part)] = line[:2]
        return status

    def _revert_unexpected_changes(self, before: dict, allowed: tuple):
        """advisory 세션 전후의 worktree 상태를 비교해, 예상 산출물 외의 새 변경을
        기계적으로 되돌린다. 프롬프트의 '파일 수정 금지'는 강제가 아니다.
        - before에 없거나 상태가 달라진 경로만 대상 (세션 이전의 dirty 상태는 보존)
        - allowed 경로와 .harness/(메모리 변조 검사가 담당)는 제외
        - untracked(??)는 삭제, tracked/staged 변경은 인덱스·워크트리 모두 HEAD 기준 복원
        - 복원 불가(세션이 지운 untracked 등)는 WARN만 남긴다"""
        after = self._worktree_status()
        for path, st in after.items():
            if before.get(path) == st:
                # 수용된 한계: 세션 이전부터 dirty였고 XY 코드가 그대로인 경로는 내용이
                # 바뀌어도 보존된다 — 보호 대상은 세션 이전 상태이고, 내용 diff는 범위 밖.
                continue
            if path in allowed or path == ".harness" or path.startswith(".harness/"):
                continue
            if st.startswith("??"):
                target = Path(self._root) / path
                # porcelain은 미추적 디렉토리를 "?? dir/" 한 줄로 출력할 수 있다
                if target.is_dir():
                    shutil.rmtree(target, ignore_errors=True)
                elif target.exists():
                    target.unlink()
                print(f"  WARN: advisory 세션이 {path} 생성 — 삭제함 (worktree guard)")
            else:
                # git checkout --만으로는 부족하다: 세션이 git add로 스테이징했으면
                # 인덱스가 이미 오염돼 checkout이 no-op이 된다 (재현 확인됨).
                # 인덱스와 워크트리를 모두 HEAD 기준으로 복원한다.
                self._run_git("reset", "-q", "--", path)
                r = self._run_git("cat-file", "-e", f"HEAD:{path}")
                if r.returncode == 0:
                    self._run_git("checkout", "--", path)
                else:
                    # HEAD에 없는 파일 (세션이 add한 신규 파일 등) — 삭제
                    with contextlib.suppress(OSError):
                        (Path(self._root) / path).unlink()
                print(f"  WARN: advisory 세션이 {path} 변경 — HEAD 기준 복원 (worktree guard)")
        for path, st in before.items():
            if path not in after and st.startswith("??"):
                # 세션이 지운 untracked 파일은 기계적으로 복구할 수 없다 — 경고만 남긴다
                print(f"  WARN: advisory 세션이 untracked {path} 삭제 — 복구 불가 (worktree guard)")

    # v0.9.0: 세션이 git commit/checkout으로 HEAD를 옮기면 (1) worktree 가드의
    # 'HEAD 기준 복원'이 변조된 커밋을 기준 삼고 (2) 세션 커밋이 정식 히스토리로
    # 남는다 — 커밋 규율("커밋은 엔진만")이 조용히 죽는 경로. 세션 전 (브랜치,
    # HEAD)를 핀하고, 세션 후 브랜치 복귀 → reset --mixed로 포인터만 되돌린다.
    # 파일 내용은 워크트리에 남겨 기존 가드(verify·worktree guard)가 판정한다.
    def _snapshot_head(self):
        rb = self._run_git("rev-parse", "--abbrev-ref", "HEAD")
        rh = self._run_git("rev-parse", "HEAD")
        if rb.returncode != 0 or rh.returncode != 0:
            return None  # git 불가/빈 repo — 가드 생략 (기존 가드는 그대로 동작)
        return (rb.stdout.strip(), rh.stdout.strip())

    def _check_head_moved(self, before):
        if before is None:
            return
        branch, head = before
        rb = self._run_git("rev-parse", "--abbrev-ref", "HEAD")
        if rb.returncode != 0:
            return
        cur_branch = rb.stdout.strip()
        if cur_branch != branch:
            r = self._run_git("checkout", "-q", branch)
            print(f"  WARN: 세션이 브랜치를 {cur_branch}(으)로 이동함 — {branch} 복귀 (head guard)")
            if r.returncode != 0:
                # 복귀 실패 상태에서 reset하면 엉뚱한 브랜치 ref를 옮긴다 — 중단하고 알린다
                print(f"  WARN: 브랜치 복귀 실패 — HEAD 원복 생략, 수동 확인 필요: "
                      f"{r.stderr.strip()} (head guard)")
                return
        rh = self._run_git("rev-parse", "HEAD")
        if rh.returncode != 0 or rh.stdout.strip() == head:
            return
        self._run_git("reset", "-q", "--mixed", head)
        print(f"  WARN: 세션이 HEAD를 {rh.stdout.strip()[:12]}(으)로 이동함 — "
              f"{head[:12]}(으)로 원복 (head guard)")

    def _checkout_branch(self):
        branch = f"feat-{self._phase_name}"

        r = self._run_git("rev-parse", "--abbrev-ref", "HEAD")
        if r.returncode != 0:
            print(f"  ERROR: git을 사용할 수 없거나 git repo가 아닙니다.")
            print(f"  {r.stderr.strip()}")
            sys.exit(1)

        if r.stdout.strip() == branch:
            return

        r = self._run_git("rev-parse", "--verify", branch)
        r = self._run_git("checkout", branch) if r.returncode == 0 else self._run_git("checkout", "-b", branch)

        if r.returncode != 0:
            print(f"  ERROR: 브랜치 '{branch}' checkout 실패.")
            print(f"  {r.stderr.strip()}")
            print(f"  Hint: 변경사항을 stash하거나 commit한 후 다시 시도하세요.")
            sys.exit(1)

        print(f"  Branch: {branch}")

    def _commit_step(self, step_num: int, step_name: str, *, failed: bool = False):
        # 커밋 직전 보호 파일 재검사 (Codex 크로스 리뷰 2026-07-06): 세션 종료
        # 직후의 검사와 이 커밋 사이 창에 늦은 writer(세션이 남긴 자식 프로세스)가
        # 훅·설정·step 파일을 변조하면 `git add -A`가 그것을 feat/wip/chore 커밋으로
        # 영구화해 다음 실행의 스냅샷 기준을 오염시킨다. 소스 파일의 늦은 쓰기는
        # 여기서 판별할 수 없다 — README 알려진 한계(창 좁히기, 격리는 컨테이너 몫).
        # 스냅샷 미설정(직접 호출 테스트)이면 각 검사가 no-op이다.
        if hasattr(self, "_memory_snapshot"):
            self._check_memory_tamper()
        self._check_enforcement_tamper()
        self._check_step_file_tamper()
        # heartbeat: 커밋 경계 초크포인트 (Codex 크로스 리뷰 2026-07-10)
        self._touch_run_lock()
        output_rel = f"phases/{self._phase_dir_name}/step{step_num}-output.json"
        index_rel = f"phases/{self._phase_dir_name}/index.json"
        summary_rel = f"phases/{self._phase_dir_name}/run-summary.json"
        history_rel = f"phases/{self._phase_dir_name}/run-history.jsonl"

        # 커밋 준비(add/reset)도 커밋과 같은 게이트를 통과한다 (Codex 크로스
        # 리뷰 2026-07-11 HIGH): add 실패는 스테이징이 비어 아래 diff --cached가
        # 0을 반환하므로 커밋 실패 게이트에 닿기도 전에 "커밋할 것 없음"으로
        # 조용히 통과하고(검증된 변경이 저장 없이 다음 step으로), reset 실패는
        # 메타데이터가 코드 커밋에 편승한다(커밋 규율 위반). 원인은 커밋 실패와
        # 같은 환경 문제(index.lock·권한)라 같은 결로 중단한다.
        self._run_git_or_abort("커밋 준비(add -A)", "add", "-A")
        self._run_git_or_abort("커밋 준비(reset)", "reset", "HEAD", "--", output_rel)
        self._run_git_or_abort("커밋 준비(reset)", "reset", "HEAD", "--", index_rel)
        # run-summary는 하네스 메타데이터 — index/output과 같이 chore 커밋으로 보낸다
        self._run_git_or_abort("커밋 준비(reset)", "reset", "HEAD", "--", summary_rel)
        # run-history.jsonl도 같은 성격의 메타데이터다 (append-only 관찰 이력,
        # Codex 크로스 리뷰 2026-07-10) — run-summary와 동일하게 chore 커밋으로.
        self._run_git_or_abort("커밋 준비(reset)", "reset", "HEAD", "--", history_rel)
        self._run_git_or_abort("커밋 준비(reset)", "reset", "HEAD", "--", ".harness")

        if self._staged_dirty_or_abort():
            # 실패 확정된 step은 feat으로 위장하지 않는다 — 깨진 코드가 정상
            # feature 커밋처럼 보이면 히스토리를 신뢰할 수 없다.
            msg_tpl = self.WIP_MSG if failed else self.FEAT_MSG
            msg = msg_tpl.format(phase=self._phase_name, num=step_num, name=step_name)
            r = self._run_git("commit", "-m", msg)
            if r.returncode != 0:
                # WARN으로 계속 가면 실패한 스테이징이 바로 아래 add -A를 타고
                # chore 커밋에 편승하고(커밋 규율 위반), 커밋이 계속 실패해도
                # 런은 "Phase completed!"까지 간다 — "검증된 결과를 하네스가
                # 저장한다"는 보증이 조용히 깨진다 (Codex 크로스 리뷰 2026-07-11).
                self._abort_on_commit_failure("코드(feat/wip) 커밋", r)
            print(f"  Commit: {msg}")

        self._run_git_or_abort("커밋 준비(add -A)", "add", "-A")
        if self._staged_dirty_or_abort():
            msg = self.CHORE_MSG.format(phase=self._phase_name, num=step_num)
            r = self._run_git("commit", "-m", msg)
            if r.returncode != 0:
                self._abort_on_commit_failure("housekeeping(chore) 커밋", r)

    def _run_git_or_abort(self, what: str, *args):
        """커밋 경로의 mutating git 명령 게이트 — 실패 시 커밋 실패와 동일하게
        기록 후 중단한다 (Codex 크로스 리뷰 2026-07-11 HIGH)."""
        r = self._run_git(*args)
        if r.returncode != 0:
            self._abort_on_commit_failure(what, r)
        return r

    def _staged_dirty_or_abort(self) -> bool:
        """`git diff --cached --quiet`: 0=clean, 1=dirty, 그 외(128 등)=판정 불가.
        판정 불가를 dirty로 취급하면 오류 상태에서 커밋을 시도하게 되므로
        (fail 방향은 시끄럽지만 진단이 흐려짐) 명시적으로 중단한다."""
        r = self._run_git("diff", "--cached", "--quiet")
        if r.returncode not in (0, 1):
            self._abort_on_commit_failure("스테이징 판정(diff --cached)", r)
        return r.returncode == 1

    def _abort_on_commit_failure(self, what: str, r):
        """하네스 커밋(및 커밋 준비 git 명령) 실패는 시끄럽게 중단한다. 원인은
        대부분 환경(git identity 미설정·대상 repo의 커밋 훅·index.lock·디스크)이라
        사람 개입 전에는 어떤 커밋도 성공하지 못한다 — 진행하면 이후 step들이
        저장 없이 쌓인다. push 실패(exit 1)와 같은 결이다. 기록(run-summary/
        run-history/top-index)은 워크트리 파일이라 커밋 불가 상태에서도 남는다.
        실패 step 경로처럼 run-summary가 이미 이 런의 outcome을 기록했다면 중복
        append를 피한다 (run-history는 append-only라 두 번 쓰면 런 1개가 2줄이 된다)."""
        print(f"\n  ERROR: {what} 실패: {(r.stderr or '').strip()}")
        print("  검증된 변경이 커밋되지 않은 채 워크트리에 남아 있습니다. git 설정"
              "(user.name/user.email·대상 repo 커밋 훅·디스크)을 점검해 남은 변경을"
              " 수동 커밋하고, top index의 phase status를 정리한 뒤 재기동하세요.")
        if not getattr(self, "_run_summary_recorded", False):
            self._write_run_summary("error")
        self._update_top_index("error")
        sys.exit(1)

    # --- top-level index ---

    def _update_top_index(self, status: str):
        if not self._top_index_file.exists():
            return
        top = self._read_json(self._top_index_file)
        ts = self._stamp()
        for phase in top.get("phases", []):
            if phase.get("dir") == self._phase_dir_name:
                phase["status"] = status
                ts_key = {"completed": "completed_at", "error": "failed_at", "blocked": "blocked_at"}.get(status)
                if ts_key:
                    phase[ts_key] = ts
                break
        self._write_json(self._top_index_file, top)

    # --- run summary (관찰용 집계, 비강제) ---

    def _write_run_summary(self, outcome: str):
        """phase 종료/중단 시 재시도·실패 유형·소요시간 집계를 run-summary.json으로
        남긴다. 신모델 점검 프로토콜(DECISION-GUIDE)의 관찰 단계가 "돌려보고
        느낌으로 판단" 대신 정량(재시도율·실패 유형별 수·세션 소요시간)을 읽게
        하는 산출물이다. 실패 유형(timeouts/session_exit_nonzero/status_not_updated)
        은 verify_failures와 별개 카운트다 — 반복 타임아웃과 반복 verify 실패는
        조치가 다르다(전자는 step 분할/타임아웃 검토, 후자는 계획·규칙 검토).
        에러 원문 등 상세는 싣지 않는다 — index.json·step*-output.json과의 중복을
        피하고 이 파일은 집계만 담당한다 (Codex 크로스 리뷰 2026-07-07). 강제 계층 아님.

        outcome="crashed"(_record_crash 경유)는 self._crash_exception_type이 얹혀
        있으면 summary["error_type"]으로 소비한다 — 시그니처를 바꾸지 않고 예외
        타입명을 run-history.jsonl 줄까지 흘려보내는 경로다 (Codex 크로스 리뷰
        2026-07-10). 소비 직후 속성을 비워 다음 호출(같은 인스턴스의 다른 outcome)에
        새지 않게 한다."""
        index = self._read_json(self._index_file)
        steps = []
        for s in index["steps"]:
            st = self._run_stats.get(s["step"], {})
            entry = {
                "step": s["step"],
                "name": s["name"],
                "status": s.get("status"),
                "attempts": st.get("attempts", 0),
                "verify_failures": st.get("verify_failures", 0),
                "timeouts": st.get("timeouts", 0),
                "session_exit_nonzero": st.get("session_exit_nonzero", 0),
                "status_not_updated": st.get("status_not_updated", 0),
                "attempt_secs": st.get("attempt_secs", []),
                "verify_surface_changes": st.get("verify_surface_changes", 0),
            }
            for k in ("started_at", "completed_at", "failed_at", "blocked_at"):
                if k in s:
                    entry[k] = s[k]
            steps.append(entry)
        summary = {
            "phase": self._phase_name,
            "outcome": outcome,
            "driver": self._driver,
            "step_model": self._step_model,
            "advisory_model": self._advisory_model,
            "max_retries": self._max_retries,
            "engine_started_at": getattr(self, "_engine_started_at", None),
            "engine_ended_at": self._stamp(),
            "steps": steps,
        }
        crash_type = getattr(self, "_crash_exception_type", None)
        if crash_type is not None:
            summary["error_type"] = crash_type
            self._crash_exception_type = None  # 1회성 소비
        self._write_json(self._phase_dir / "run-summary.json", summary)
        print(f"  Run summary: phases/{self._phase_dir_name}/run-summary.json ({outcome})")
        self._append_run_history(outcome, summary)
        # 커밋 실패 중단(_abort_on_commit_failure)이 같은 런의 outcome을 이중
        # 기록하지 않기 위한 플래그 — run-history는 append-only다.
        self._run_summary_recorded = True

    def _append_run_history(self, outcome: str, summary: dict):
        """run-summary.json은 재실행마다 덮어써 과거 런의 집계가 git 커밋을 뒤져야만
        보인다. 신모델 점검 프로토콜(DECISION-GUIDE)의 관찰 단계가 런 간 재시도율·
        실패 유형·소요시간을 비교하려면 append-only 이력이 필요하다 (Codex 크로스
        리뷰 2026-07-10). 새 집계 로직은 만들지 않는다 — _write_run_summary가 이미
        모은 summary["steps"]를 합산만 해서 한 줄로 압축한다. run-summary.json과
        같은 원칙으로 에러 원문 등 상세는 담지 않고 집계만 남긴다. 엔진 버전은
        코드에 상수/조회가 없어(조사 결과) 생략한다.
        append 실패(디스크 등)는 관찰용 비강제 계층이므로 WARN만 남기고 런은
        계속한다 — _warn_lessons_health의 "경고만" 처리와 같은 결.

        summary["error_type"]은 outcome="crashed"일 때만 _write_run_summary가
        얹는 필드다 — 있을 때만 포함해 다른 outcome의 기존 줄 스키마를 건드리지
        않는다 (다른 선택 필드들과 같은 조건부 포함 관례)."""
        steps = summary.get("steps", [])

        def total(key):
            return sum(s.get(key, 0) for s in steps)

        line = {
            "recorded_at": self._stamp(),
            "phase": summary.get("phase"),
            "outcome": outcome,
            "driver": summary.get("driver"),
            "step_model": summary.get("step_model"),
            "advisory_model": summary.get("advisory_model"),
            "steps_total": len(steps),
            "steps_completed": sum(1 for s in steps if s.get("status") == "completed"),
            "steps_error": sum(1 for s in steps if s.get("status") == "error"),
            "steps_blocked": sum(1 for s in steps if s.get("status") == "blocked"),
            "attempts_total": total("attempts"),
            "verify_failures_total": total("verify_failures"),
            "timeouts_total": total("timeouts"),
            "session_exit_nonzero_total": total("session_exit_nonzero"),
            "status_not_updated_total": total("status_not_updated"),
            "elapsed_secs_total": sum(sum(s.get("attempt_secs", [])) for s in steps),
        }
        if "error_type" in summary:
            line["error_type"] = summary["error_type"]
        history_path = self._phase_dir / "run-history.jsonl"
        try:
            # append-only: 기존 내용을 읽지 않는다 — 손상된 과거 줄이 있어도
            # 새 줄 append는 영향받지 않는다.
            with open(history_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(line, ensure_ascii=False) + "\n")
        except OSError as e:
            print(f"  WARN: phases/{self._phase_dir_name}/run-history.jsonl append 실패 "
                  f"— 관찰용 이력이므로 런은 계속 진행합니다: {e}")

    # --- guardrails & context ---

    # 템플릿 docs의 placeholder 표기: {프로젝트명}, {예: ...} 등 한글로 시작하는 중괄호
    PLACEHOLDER_RE = re.compile(r"\{[가-힣][^{}\n]*\}")

    # fable-harness: .harness/RULES.md 기계 주입 (스킬의 자발적 CONSULT를 코드로 강제)
    RULES_CAP = 40
    RULES_MAX_BYTES = 16 * 1024
    RULE_LINE_RE = re.compile(r"^- R-", re.MULTILINE)

    def _load_rules(self) -> str:
        """.harness/RULES.md를 읽는다. 규칙 라인(`- R-`)이 없으면 빈 문자열(주입 생략).
        16KB 초과는 폭주 가드로 기동 거부. 40개 초과는 경고만 — 캡 관리는 규칙 승격
        시점(harness-lesson, 사람 승인)의 몫이다. 전문 주입인 이유: 모델에게 규칙
        선별을 맡기면 자발적 준수 의존으로 회귀한다."""
        p = ROOT / ".harness" / "RULES.md"
        if not p.exists():
            return ""
        if p.stat().st_size > self.RULES_MAX_BYTES:
            print(f"  ERROR: .harness/RULES.md가 {self.RULES_MAX_BYTES} bytes를 초과합니다. "
                  f"harness-lesson으로 병합/정리 후 재실행하세요.")
            sys.exit(1)
        text = p.read_text(encoding="utf-8")
        # HTML 주석 제거 후 규칙 라인 확인 (템플릿 예시는 주석 안에 있음)
        text_no_comments = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
        n = len(self.RULE_LINE_RE.findall(text_no_comments))
        if n == 0:
            return ""
        if n > self.RULES_CAP:
            print(f"  WARN: RULES.md 규칙 {n}개 (캡 {self.RULES_CAP}) — harness-lesson으로 병합/강등하세요")
        return text

    # F-C: docs 주입 총량 상한. guardrails는 매 step·매 재시도 프롬프트에 전문
    # 주입되므로 무제한이면 fresh-context 설계의 이점을 스스로 갉아먹는다. RULES의
    # 16KB 캡과 같은 결의 폭주 가드이며, 초과 시 조용한 생략이 아니라 기동 거부다 —
    # 무인 실행에서 사람이 있는 유일한 시점이 기동 직후이고, 런 중 조용한 주입
    # 생략은 step 품질을 비결정적으로 흔든다. 상수 고정 (profile 대상 아님).
    DOCS_MAX_BYTES = 64 * 1024
    # 상한의 75% — 상한은 폭주 가드라 닿으면 기동 거부뿐이고, docs는 harness-docs로
    # 자라는 진행형 산출물이라 비대화가 점진적이다. 거부에 닿기 전에 사람이 줄일
    # 기회를 조기 경고로 준다. 상한 아래라도 주입이 길수록 step 세션의 지시 준수가
    # 떨어지므로(context rot — 약한 모델일수록 심함) 비대화 자체가 품질 리스크다.
    DOCS_WARN_BYTES = 48 * 1024

    def _load_guardrails(self) -> str:
        # CLAUDE.md는 claude -p가 자동 로드하므로 claude/bridge 드라이버에서는
        # 주입하지 않는다 (중복 토큰 방지). codex는 AGENTS.md를 네이티브로 읽고
        # CLAUDE.md는 읽지 않으므로, codex 드라이버에서는 CLAUDE.md 전용 지침이
        # 조용히 증발한다 — 가드레일로 주입해 보전한다 (v0.9.0). 순수 @import
        # 라인("@AGENTS.md" 등)뿐인 파일은 주입하지 않는다: import 대상은 codex가
        # 네이티브 로드하므로 주입할 본문이 없다.
        sections = []
        rules = self._load_rules()
        if rules:
            sections.append(f"## Hard constraints (accumulated project rules)\n\n{rules}")
        doc_sizes = []
        if getattr(self, "_driver", "claude") == "codex":
            cmd_path = ROOT / "CLAUDE.md"
            if cmd_path.exists():
                text = cmd_path.read_text(encoding="utf-8")
                body = [ln for ln in text.splitlines()
                        if ln.strip() and not re.fullmatch(r"@\S+", ln.strip())]
                if body:
                    doc_sizes.append(("CLAUDE.md", len(text.encode("utf-8"))))
                    sections.append(f"## CLAUDE.md (project instructions)\n\n{text}")
        skipped = []
        docs_dir = ROOT / "docs"
        if docs_dir.is_dir():
            for doc in sorted(docs_dir.glob("*.md")):
                text = doc.read_text(encoding="utf-8")
                if self.PLACEHOLDER_RE.search(text):
                    skipped.append(doc.stem)
                    continue
                doc_sizes.append((doc.name, len(text.encode("utf-8"))))
                sections.append(f"## {doc.stem}\n\n{text}")
        total = sum(n for _, n in doc_sizes)
        if total > self.DOCS_MAX_BYTES:
            print(f"  ERROR: 가드레일 문서(docs/*.md — codex 드라이버는 CLAUDE.md 포함) "
                  f"주입 총량 {total} bytes가 상한 {self.DOCS_MAX_BYTES} bytes를 초과합니다:")
            for name, n in sorted(doc_sizes, key=lambda t: -t[1]):
                print(f"    {name}: {n} bytes")
            print(f"  guardrails는 매 step·매 재시도 프롬프트에 전문 주입됩니다 — "
                  f"문서를 줄이거나 참고 자료를 docs/ 밖으로 옮기세요.")
            sys.exit(1)
        if total > self.DOCS_WARN_BYTES:
            print(f"  WARN: 가드레일 문서 주입 총량 {total} bytes — 기동 거부 상한"
                  f"({self.DOCS_MAX_BYTES} bytes)의 75%를 넘었습니다. 주입이 길수록 "
                  f"step 세션의 지시 준수가 떨어집니다 — 문서를 요약하거나 참고 자료를 "
                  f"docs/ 밖으로 옮기길 권장합니다.")
        if skipped:
            print(f"  WARN: placeholder 상태 문서 주입 생략: {', '.join(skipped)} (채우면 자동 주입됨)")
        return "\n\n---\n\n".join(sections) if sections else ""

    # step_context(완료 step의 contract/summary 누적)는 RULES/docs와 같은 전문 주입
    # 표면인데, step 수에 비례해 자라는 유일한 표면이라 같은 결의 폭주 가드를 둔다.
    # 초과 시 자동 fold(오래된 contract 요약 압축)는 하지 않는다 — 다음 step에
    # 전달돼야 할 계약 정보가 조용히 손상되는 것은 보증 약화다 (Codex 크로스 리뷰
    # 2026-07-07). 대신 실행을 중단하고 phase 분할/contract 축소 replan을 요구한다.
    STEP_CONTEXT_MAX_BYTES = 32 * 1024
    # 상한의 75% — docs의 48KB 조기 경고와 같은 논리. contract 권장(1~3줄)을 지키면
    # 수십 step짜리 phase도 수 KB에 그치므로, 경고에 닿는 것 자체가 summary fallback
    # 비대화(계약 아닌 상세 기록이 새는 중)의 신호다.
    STEP_CONTEXT_WARN_BYTES = 24 * 1024

    @staticmethod
    def _build_step_context(index: dict) -> str:
        lines = []
        for s in index["steps"]:
            if s["status"] != "completed":
                continue
            text = s.get("contract") or s.get("summary")
            if text:
                lines.append(f"- Step {s['step']} ({s['name']}): {text}")
        if not lines:
            return ""
        return "## 이전 Step 산출물\n\n" + "\n".join(lines) + "\n\n"

    def _check_step_context_budget(self, step_context: str) -> Optional[str]:
        """step_context 총량 가드. 상한 초과는 조용한 축약 대신 실행 중단 —
        무엇이 잘려나갔는지 아무도 모르는 프롬프트로 step을 돌리지 않는다.
        초과 시 blocked_reason용 사유 문자열을 반환한다 (호출측이 기존 blocked
        경로로 처리 — 사람의 phase 분할/contract 축소가 필요한 상태이므로 의미가
        같고, top-index·run-summary·SessionStart 알림·재기동 게이트에 자동
        편입된다. Fable 5 크로스 리뷰 2026-07-07의 관찰 공백 지적 반영)."""
        n = len(step_context.encode("utf-8"))
        if n > self.STEP_CONTEXT_MAX_BYTES:
            print(f"  ERROR: 이전 step 산출물(contract/summary) 주입 총량 {n} bytes가 "
                  f"상한 {self.STEP_CONTEXT_MAX_BYTES} bytes를 초과합니다.")
            print(f"  자동 축약은 하지 않습니다 — 다음 step에 전달될 계약 정보가 조용히 "
                  f"손상됩니다. phase를 분할하거나, 완료 step의 contract를 1~3줄 공개 "
                  f"계약으로 줄인 뒤 재실행하세요 (contract 없이 긴 summary만 있는 "
                  f"step이 주범인 경우가 많습니다).")
            return (f"step_context 상한 초과 ({n} bytes > {self.STEP_CONTEXT_MAX_BYTES} "
                    f"bytes) — phase를 분할하거나 완료 step의 contract를 1~3줄로 축소한 "
                    f"뒤 이 step을 pending으로 되돌려 재실행")
        if n > self.STEP_CONTEXT_WARN_BYTES and not getattr(self, "_warned_step_context", False):
            self._warned_step_context = True
            print(f"  WARN: 이전 step 산출물 주입 총량 {n} bytes — 실행 중단 상한"
                  f"({self.STEP_CONTEXT_MAX_BYTES} bytes)의 75%를 넘었습니다. contract가 "
                  f"1~3줄 계약을 벗어나 자라고 있습니다 — phase 분할을 고려하세요.")
        return None

    def _build_preamble(self, guardrails: str, step_context: str,
                        prev_error: Optional[str] = None) -> str:
        retry_section = ""
        if prev_error:
            # 재시도의 델타가 에러 텍스트 하나뿐이면 결정적 실패에 같은 오답을 반복할
            # 수 있다. 진단을 먼저 요구하되, 다양화를 강제하지는 않는다 — 절대형
            # ("같은 접근 금지")은 정상적인 미세수정까지 억지로 다른 길로 돌린다
            # (Codex 크로스 리뷰 2026-07-07).
            retry_section = (
                f"\n## ⚠ 이전 시도 실패 — 아래 에러를 반드시 참고하여 수정하라\n\n"
                f"{prev_error}\n\n"
                f"작업 시작 전에 이전 실패의 원인을 1줄로 진단하라. 직전 시도와 같은\n"
                f"수정을 다시 적용하려는 것인지 점검하고, 필요하다고 판단될 때만 다른\n"
                f"접근을 시도하라.\n\n---\n\n"
            )
        header = (
            f"당신은 {self._project} 프로젝트의 개발자입니다. 아래 step을 수행하세요.\n\n"
            f"{guardrails}\n\n---\n\n"
            f"{step_context}{retry_section}"
        )
        if self._preamble_mode == "concise":
            # 간결 변형: 모든 명령·프로토콜은 유지하고 설명·예시·"이유:" 부연만 축약한다.
            # 강제되는 계약(커밋 금지·status 의미론·verify 스냅샷·.harness 금지·검증자 금지)은
            # 그대로 남긴다.
            return header + (
                f"## 작업 규칙\n\n"
                f"1. 이전 step 코드와 일관성을 유지하라.\n"
                f"2. 이 step에 명시된 작업만 수행하라. 추가 기능·파일 금지.\n"
                f"3. 기존 테스트를 깨뜨리지 마라.\n"
                f"4. AC를 직접 실행하라. completed로 표기해도 하네스가 \"verify\"를 독립\n"
                f"   실행해 검증하며, 실패하면 재시도된다. verify는 시작 시점 스냅샷으로\n"
                f"   고정되므로 index.json 수정은 반영되지 않는다.\n"
                f"   verify가 없다고 가정하고 작업하라 — verify에서 잡히는 실패는\n"
                f"   검증이 일한 것이 아니라 새어나간 실행 실패다.\n"
                f"5. /phases/{self._phase_dir_name}/index.json의 해당 step status를 갱신하라:\n"
                f"   - AC 통과 → \"completed\" + \"summary\"(상세 기록) + \"contract\"(1~3줄 공개 계약; 없으면 \"summary\" fallback)\n"
                f"   - {self._max_retries}회 수정 시도 후에도 실패 → \"error\" + \"error_message\"\n"
                f"   - 사용자 개입 필요(API 키·인증·수동 설정 등) → \"blocked\" + \"blocked_reason\" 후 즉시 중단\n"
                f"   - 남은 step 계획이 잘못됐음을 발견 → \"blocked\" + \"blocked_reason\": \"계획 수정 필요: <구체적 수정안>\" 후 즉시 중단\n"
                f"6. 커밋하지 마라 (verify 통과 후 하네스가 커밋한다).\n"
                f"7. 무인 실행 세션이다. AGENTS.md/CLAUDE.md의 'Loop Harness' 루프\n"
                f"   (CONSULT/GOAL/VERIFY 등)는 적용되지 않는다 — 실행하지 마라.\n"
                f"   .harness/ 아래 파일을 수정하지 마라 (읽기는 허용).\n"
                f"   검증자 서브에이전트를 띄우지 마라 — 검증은 하네스가 verify로 직접 한다.\n\n---\n\n"
            )
        return header + (
            f"## 작업 규칙\n\n"
            f"1. 이전 step에서 작성된 코드를 확인하고 일관성을 유지하라.\n"
            f"2. 이 step에 명시된 작업만 수행하라. 추가 기능이나 파일을 만들지 마라.\n"
            f"3. 기존 테스트를 깨뜨리지 마라.\n"
            f"4. AC(Acceptance Criteria) 검증을 직접 실행하라. completed로 표기해도\n"
            f"   하네스가 \"verify\" 커맨드를 독립 실행해 검증하며, 실패하면 completed는\n"
            f"   인정되지 않고 재시도된다. verify는 하네스 시작 시점에 스냅샷으로\n"
            f"   고정되므로 index.json에서 수정해도 반영되지 않는다.\n"
            f"   verify가 없다고 가정하고 AC를 완전히 충족시켜라 — verify에서\n"
            f"   잡히는 실패는 검증이 일한 것이 아니라 새어나간 실행 실패다.\n"
            f"5. /phases/{self._phase_dir_name}/index.json의 해당 step status를 업데이트하라:\n"
            f"   - AC 통과 → \"completed\". 다음 두 필드를 채워라:\n"
            f"     · \"summary\": 사람이 보는 상세 기록 (길이 제한 없음)\n"
            f"     · \"contract\": 다음 step LLM에 전달할 공개 계약. 1~3줄, 공개 API/생성 파일/유지할 불변식만.\n"
            f"        예: \"engine.execute_rules(rules_dir, model)→dict 추가. eval/exec 금지 유지.\"\n"
            f"        (\"contract\" 없으면 \"summary\"가 fallback으로 사용됨)\n"
            f"   - {self._max_retries}회 수정 시도 후에도 실패 → \"error\" + \"error_message\" 기록\n"
            f"   - 사용자 개입이 필요한 경우 (API 키, 인증, 수동 설정 등) → \"blocked\" + \"blocked_reason\" 기록 후 즉시 중단\n"
            f"   - 이 step 수행 중 남은 step 계획이 잘못됐음을 발견한 경우 → \"blocked\" + "
            f"\"blocked_reason\": \"계획 수정 필요: <구체적 수정안>\" 기록 후 즉시 중단\n"
            f"6. 커밋하지 마라. 이유: 커밋은 verify 통과 후 하네스가 수행한다.\n"
            f"   검증 전 커밋은 실패 산출물을 히스토리에 남긴다.\n"
            f"7. 이 세션은 스텝 엔진의 무인 실행이다. AGENTS.md/CLAUDE.md의 'Loop Harness'\n"
            f"   작업 루프(CONSULT/GOAL/VERIFY 등)는 이 세션에 적용되지 않는다 — 실행하지 마라.\n"
            f"   .harness/ 아래 파일을 수정하지 마라 (읽기는 허용; 수정은 하네스가 감지해 되돌린다).\n"
            f"   검증자 서브에이전트를 띄우지 마라 — 검증은 하네스가 verify 커맨드로 직접 수행한다.\n\n---\n\n"
        )

    # --- bridge 드라이버 (.harness/worker/ 파일 프로토콜) ---

    SESSION_TIMEOUT = 1800
    BRIDGE_POLL_SECS = 5
    BRIDGE_FILES = ("request.json", "prompt.md", "response.md", "done")
    # 살아있는 엔진은 폴링마다 request.json을 touch한다 — 이보다 신선한 외부
    # 마커는 "다른 엔진이 사용 중"으로 판정한다 (동시 실행 방지).
    # 주: 이 리스는 .harness/worker/ 파일 프로토콜(bridge) 전용 가드로 그대로
    # 둔다 — 저장소 전체의 동시 실행 방지는 전 드라이버 공통 락(.harness/run.lock,
    # _acquire_run_lock)이 담당한다. 역할이 다르므로 둘 다 유지한다
    # (Codex 크로스 리뷰 2026-07-10).
    LEASE_FRESH_SECS = 60
    QUIESCENCE_POLL_SECS = 2
    QUIESCENCE_MAX_SECS = 20

    def _bridge_session(self, prompt: str, *, advisory: bool) -> dict:
        """프롬프트를 .harness/worker/에 게시하고 인터랙티브 세션(harness-worker
        스킬)이 처리하길 기다린다. request.json은 훅(tdd-guard/stop-quality-gate)의
        무인 모드 마커도 겸한다 — 워커 세션은 엔진의 자식 프로세스가 아니라
        HARNESS_RUN/HARNESS_ADVISORY env를 전달받을 수 없기 때문. 마커는 폴링마다
        touch(신선도 리스)·재검증(변조 시 재게시)되고, 훅은 리스가 끊긴 오래된
        마커를 무시한다. 반환: {"timedOut", "result_text"}."""
        wdir = ROOT / ".harness" / "worker"
        wdir.mkdir(parents=True, exist_ok=True)
        # 프로토콜 파일은 일시적이다 — chore 커밋(git add -A)에 편승하지 않게 숨긴다
        gitignore = wdir / ".gitignore"
        if not gitignore.exists():
            gitignore.write_text("*\n", encoding="utf-8")

        req_path = wdir / "request.json"
        if req_path.exists():
            if getattr(self, "_bridge_active", False):
                # 이번 실행에서 이미 요청을 게시한 적이 있다 — 엔진은 매 요청 후
                # finally에서 마커를 지우므로, 여기 남아있는 마커는 워커가 요청 사이
                # (verify/commit 창)에 다시 쓴 위조다. 청소 후 진행한다 (다음 세션
                # 시작 시 abort하면 forge 하나로 실행을 멈출 수 있다 — Fable MINOR-3).
                print("  WARN: 요청 사이에 재생성된 request.json 발견 — 위조로 보고 덮어씀 (marker guard)")
            else:
                # 첫 세션: 신선한 마커 = 살아있는 다른 엔진의 리스일 수 있다. 미래
                # mtime(음수 age)은 위조/시계오차이므로 잔재로 취급해 덮어쓴다.
                with contextlib.suppress(OSError):
                    age = time.time() - req_path.stat().st_mtime
                    # 소폭 음수 age는 위조가 아니라 NTFS 반올림/시계 미세 오차다 —
                    # 0 경계로 두면 신선한 외부 리스를 잔재로 오판해 덮어쓰고 실제
                    # 폴링 루프(최대 1800s)에 진입한다 (CI windows 실측 행의 원인,
                    # test_fresh_foreign_request_aborts 간헐 hang, 2026-07-10).
                    if -self.CLOCK_SKEW_SECS <= age < self.LEASE_FRESH_SECS:
                        print(f"  ERROR: 다른 엔진이 .harness/worker/를 사용 중인 것 같습니다 "
                              f"(request.json age {int(age)}s). 동시 실행은 지원하지 않습니다 — "
                              f"엔진이 돌고 있지 않다면 해당 파일을 지우고 재실행하세요.")
                        sys.exit(1)
                    print("  WARN: stale request.json 발견 — 이전 실행의 잔재로 보고 덮어씀")

        for name in ("response.md", "done"):  # 이전 실행 잔재 제거
            with contextlib.suppress(OSError):
                (wdir / name).unlink()
        req_id = f"{os.getpid()}-{time.time_ns()}"
        req_text = json.dumps(
            {"id": req_id, "advisory": advisory, "created_at": self._stamp()},
            indent=2, ensure_ascii=False)
        # prompt.md는 디스크에 남는 산출물이다 (요청 창 동안). 다른 durable 기록
        # 지점과 동일하게 시크릿을 스크럽한다 — 크래시로 남아도 평문 시크릿이
        # 없도록 (Codex 리뷰 MINOR). 보수적 패턴이라 정상 프롬프트는 그대로 통과.
        (wdir / "prompt.md").write_text(redact_secrets(prompt), encoding="utf-8")
        req_path.write_text(req_text, encoding="utf-8")
        self._bridge_active = True
        deadline = time.monotonic() + self._bridge_timeout
        last_mismatch = None
        try:
            while True:
                # 마커 재검증: 워커가 request.json을 고치거나(advisory:true 위조로
                # Stop 게이트를 끄는 등) 지우면 원본을 재게시한다. 무변조 경로의
                # touch는 훅과 다른 엔진이 보는 신선도 리스(mtime)를 갱신한다.
                cur = None
                with contextlib.suppress(OSError):
                    cur = req_path.read_text(encoding="utf-8")
                if cur != req_text:
                    req_path.write_text(req_text, encoding="utf-8")
                    print("  WARN: request.json 변조/삭제 감지 — 재게시함 (marker guard)")
                else:
                    with contextlib.suppress(OSError):
                        os.utime(req_path)
                # heartbeat: bridge 대기는 HARNESS_BRIDGE_TIMEOUT까지 길어질 수
                # 있어(SESSION_TIMEOUT 초과 가능) step 경계 touch만으로는 살아있는
                # 엔진이 stale로 오판·인수될 수 있다 — 폴마다 락도 touch한다
                # (Codex 크로스 리뷰 2026-07-10)
                self._touch_run_lock()

                done = wdir / "done"
                got = None
                # 읽기 실패(쓰기 도중 삭제 경합, done이 디렉토리인 경우 등)로 엔진이
                # traceback으로 죽지 않게 한다 — 이번 폴은 건너뛰고 다음 폴이 재시도.
                with contextlib.suppress(OSError):
                    got = done.read_text(encoding="utf-8", errors="replace").strip()
                if got is not None:
                    if got == req_id:
                        break
                    # id 불일치: 이전 요청의 stale done일 수도, 워커가 쓰는 도중의
                    # 부분 읽기일 수도 있다 — 같은 값이 두 번 관찰될 때만 지운다.
                    if got == last_mismatch:
                        with contextlib.suppress(OSError):
                            done.unlink()
                        last_mismatch = None
                    else:
                        last_mismatch = got
                if time.monotonic() >= deadline:
                    return {"timedOut": True, "result_text": ""}
                time.sleep(self.BRIDGE_POLL_SECS)
            # done은 프로세스 종료가 아니라 자기 신고다 — 워커 세션이 done 이후에도
            # 살아있을 수 있으므로, verify/commit과의 경합을 줄이기 위해 워크트리가
            # 잠잠해질 때까지 짧게 기다린다.
            self._await_worktree_quiescence()
            resp = wdir / "response.md"
            text = resp.read_text(encoding="utf-8", errors="replace") if resp.exists() else ""
            return {"timedOut": False, "result_text": text}
        finally:
            # 정리 실패로 request.json이 남으면 훅이 계속 무인 모드로 동작한다
            for name in self.BRIDGE_FILES:
                with contextlib.suppress(OSError):
                    (wdir / name).unlink()

    def _await_worktree_quiescence(self):
        """git status의 path→XY 상태가 한 폴 간격 동안 그대로일 때까지 기다린다.
        내용만 바뀌는 경우(XY 코드 불변)는 못 잡는다 — worktree guard와 같은
        수용된 한계. 계속 불안정하면 경고 후 진행한다 (무한 대기 방지)."""
        prev = self._worktree_status()
        deadline = time.monotonic() + self.QUIESCENCE_MAX_SECS
        while True:
            time.sleep(self.QUIESCENCE_POLL_SECS)
            cur = self._worktree_status()
            if cur == prev:
                return
            prev = cur
            if time.monotonic() >= deadline:
                print("  WARN: done 이후에도 워크트리 변경이 계속됨 — 그대로 진행 (quiescence timeout)")
                return

    def _sweep_foreign_worker_marker(self):
        """엔진이 게시하지 않은 .harness/worker/request.json을 제거한다.
        이 마커는 워크트리 파일이라 권한 우회로 도는 CLI 워커 세션이 위조할 수 있고,
        advisory:true로 위조되면 stop-quality-gate가 프로젝트 전체에서 조용히
        꺼진다 — env 변수 시절에는 없던 우회로라 세션 뒤에 기계적으로 청소한다.
        (bridge 세션 중에는 호출하지 않는다 — 그쪽은 폴링 재검증이 담당.)"""
        req = ROOT / ".harness" / "worker" / "request.json"
        if req.exists():
            with contextlib.suppress(OSError):
                req.unlink()
                print("  WARN: 세션이 남긴 .harness/worker/request.json 제거 (marker guard)")

    # --- Claude 호출 ---

    def _invoke_claude(self, step: dict, preamble: str) -> dict:
        step_num, step_name = step["step"], step["name"]
        step_file = self._phase_dir / f"step{step_num}.md"

        if not step_file.exists():
            print(f"  ERROR: {step_file} not found")
            sys.exit(1)

        prompt = preamble + step_file.read_text(encoding="utf-8")

        if self._driver == "bridge":
            res = self._bridge_session(prompt, advisory=False)
            if res["timedOut"]:
                print(f"\n  WARN: bridge 워커 세션 타임아웃 ({self._bridge_timeout}s)")
                output = {
                    "step": step_num, "name": step_name,
                    "exitCode": -1, "stdout": "", "stderr": "",
                    "timedOut": True,
                }
            else:
                # H5: bridge 응답도 파일로 저장되고 조사에 재사용되므로 스크럽한다.
                # 프로세스가 아니라 파일 프로토콜이라 exitCode/stderr 개념이 없다 —
                # 성공 판정은 어차피 index.json status + verify가 한다.
                output = {
                    "step": step_num, "name": step_name,
                    "exitCode": 0,
                    "stdout": redact_secrets(res["result_text"]), "stderr": "",
                }
            out_path = self._phase_dir / f"step{step_num}-output.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            return output

        # 프롬프트는 argv가 아닌 stdin으로 전달한다. 이유: Windows 커맨드라인은
        # 32,767자 제한이 있어 가드레일(CLAUDE.md + docs 전체)이 커지면 터지고,
        # .cmd 셔임 경유 시 개행/따옴표가 있는 인자는 cmd.exe가 안전하게 못 넘긴다.
        # HARNESS_RUN=1: 무인 실행 표시. tdd-guard 훅이 이걸 보고 ask(대화 모드)
        # 대신 deny(강제 차단)로 동작한다 — 물어볼 사람이 없기 때문.
        env = {**os.environ, "HARNESS_RUN": "1"}
        # 사용자 셸에 HARNESS_ADVISORY가 이미 설정돼 있어도 step 세션엔 새면 안
        # 된다 — 이 세션은 실제로 파일을 수정하므로 Stop 게이트가 살아있어야 한다.
        env.pop("HARNESS_ADVISORY", None)
        if self._driver == "codex":
            # codex exec: --sandbox danger-full-access + approval never가
            # --dangerously-skip-permissions의 등가물 (실전 프로젝트에서 검증).
            # --dangerously-bypass-hook-trust 근거: 이 훅들은 인스톨러가 해시
            # 매니페스트로 설치하고 F-B 바이트 스냅샷이 매 step 원복하는 엔진
            # 산출물이다 — 플래그 없이 미신뢰 훅이 조용히 스킵되면 강제 계층이
            # 통째로 사라진다. "-"는 stdin 프롬프트.
            codex_bin = shutil.which("codex") or "codex"
            cmd = [codex_bin, "exec",
                   "--sandbox", "danger-full-access",
                   "-c", 'approval_policy="never"',
                   "--dangerously-bypass-hook-trust",
                   "--cd", self._root]
            # MCP 도구는 훅 matcher에 걸리지 않는 우회 표면 — 서버별 disable (v0.12.0)
            cmd += self._codex_mcp_disable_flags()
            if self._step_model:
                cmd += ["-m", self._step_model]
            cmd.append("-")
        else:
            # Windows에서 claude는 claude.cmd 셔임이라 bare 이름으로는 CreateProcess가
            # 찾지 못한다. shutil.which로 실제 경로(.cmd 포함)를 해석한다.
            claude_bin = shutil.which("claude") or "claude"
            # --strict-mcp-config: --mcp-config 미지정 상태에서 프로젝트/유저 MCP
            # 설정을 전부 무시해 MCP 서버 0개로 기동한다. MCP 도구는 PreToolUse
            # matcher(Bash·편집 도구) 어디에도 걸리지 않아 tdd-guard·위험 bash
            # 차단을 통째로 우회하는 표면이었다 (v0.12.0 크로스 리뷰). 무인 step이
            # MCP를 쓸 정당한 이유는 현재 설계에 없다 — MCP 의존 워크플로는 무인
            # 실행 미지원(README 알려진 한계). 완화 노브는 두지 않는다. 이 플래그가
            # 없는 구버전 CLI는 unknown option으로 시끄럽게 죽는다(fail-closed).
            # 프로필/CLI로 step 모델이 지정된 경우에만 --model을 붙인다 (미지정 시 기본 유지).
            cmd = [claude_bin, "-p", "--dangerously-skip-permissions",
                   "--strict-mcp-config", "--output-format", "json"]
            if self._step_model:
                cmd += ["--model", self._step_model]
        try:
            result = subprocess.run(
                cmd,
                input=prompt,
                cwd=self._root, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=self.SESSION_TIMEOUT,
                env=env,
            )
        except subprocess.TimeoutExpired:
            print(f"\n  WARN: Claude 세션 타임아웃 ({self.SESSION_TIMEOUT}s)")
            self._sweep_foreign_worker_marker()
            output = {
                "step": step_num, "name": step_name,
                "exitCode": -1, "stdout": "", "stderr": "",
                "timedOut": True,
            }
            out_path = self._phase_dir / f"step{step_num}-output.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(output, f, indent=2, ensure_ascii=False)
            return output
        # CLI 워커 세션이 bridge 마커를 위조해 훅을 조작하는 우회로 차단 (marker guard)
        self._sweep_foreign_worker_marker()

        if result.returncode != 0:
            print(f"\n  WARN: Claude가 비정상 종료됨 (code {result.returncode})")
            if result.stderr:
                print(f"  stderr: {result.stderr[:500]}")

        # H5: step 출력은 파일로 저장되고 조사에 재사용되므로 저장 전에 스크럽한다.
        # (타임아웃 경로는 stdout/stderr가 빈 문자열이라 스크럽 대상이 없다.)
        output = {
            "step": step_num, "name": step_name,
            "exitCode": result.returncode,
            "stdout": redact_secrets(result.stdout),
            "stderr": redact_secrets(result.stderr),
        }
        out_path = self._phase_dir / f"step{step_num}-output.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        return output

    # --- AC 독립 검증 ---

    VERIFY_TIMEOUT = 600

    def _run_verify(self, step_num: int) -> Optional["VerifyFailure"]:
        """step의 verify 커맨드를 하네스가 직접 실행한다. 세션의 completed 자기보고를
        신뢰하지 않기 위한 게이트. 커맨드는 시작 시점 스냅샷에서 읽는다 (변조 방지).
        통과하면 None, 실패하면 VerifyFailure 반환."""
        cmd = self._verify_snapshot.get(step_num)
        if not cmd:
            return None
        # heartbeat: verify는 최대 VERIFY_TIMEOUT 블로킹 — 경계에서 락 touch
        # (Codex 크로스 리뷰 2026-07-10)
        self._touch_run_lock()
        # Windows cmd.exe는 PATH보다 현재 디렉토리를 먼저 탐색한다 — 세션이 레포
        # 루트에 pytest.bat 같은 셔임을 떨어뜨리면 verify가 하이재킹되어 무조건
        # 통과한다. NoDefaultCurrentDirectoryInExePath=1이 cwd 탐색을 끈다
        # (비-Windows에서는 무해한 env 변수일 뿐이다).
        env = {**os.environ, "NoDefaultCurrentDirectoryInExePath": "1"}
        try:
            r = subprocess.run(
                cmd, shell=True, cwd=self._root, capture_output=True,
                text=True, encoding="utf-8", errors="replace", timeout=self.VERIFY_TIMEOUT,
                env=env,
            )
        except subprocess.TimeoutExpired:
            return VerifyFailure(cmd, None, "",
                                 f"verify 타임아웃 ({self.VERIFY_TIMEOUT}s): {cmd}")
        if r.returncode == 0:
            return None
        # 절단([-2000:]) 전에 스크럽한다 — BEGIN 헤더가 절단으로 먼저 잘려나가면
        # private key 본문이 패턴에 안 걸린 채 LESSONS/재시도 컨텍스트로 새기 때문.
        tail = redact_secrets(r.stdout + "\n" + r.stderr)[-2000:].strip()
        return VerifyFailure(cmd, r.returncode, tail,
                             f"verify 실패 (exit {r.returncode}): {cmd}\n{tail}")

    # fable-harness: 종결 실패의 기계적 기록. LLM 판단 없이 사실만 남긴다 —
    # 원인 분석·규칙 승격은 이후 대화 세션(harness-lesson)에서 사람 승인으로 한다.
    LESSON_ID_RE = re.compile(r"^## L-(\d+)", re.MULTILINE)
    LESSON_TAIL_LINES = 20

    def _append_lesson(self, step_num: int, step_name: str, err_msg: str,
                       verify_fail: Optional["VerifyFailure"]):
        hdir = ROOT / ".harness"
        if not hdir.is_dir():
            return  # 하위 호환: .harness/ 없는 프로젝트는 원래 template과 동일
        lessons = hdir / "LESSONS.md"
        old = lessons.read_text(encoding="utf-8") if lessons.exists() else ""
        next_id = max((int(m) for m in self.LESSON_ID_RE.findall(old)), default=0) + 1
        date = datetime.now(self.TZ).strftime("%Y-%m-%d")
        fail_line = (err_msg or "unknown").splitlines()[0]
        tail = ""
        if verify_fail and verify_fail.output_tail:
            tail_lines = verify_fail.output_tail.splitlines()[-self.LESSON_TAIL_LINES:]
            tail = "\n".join(tail_lines)
        entry = (
            f"\n## L-{next_id:03d} | {date} | engine | {self._phase_dir_name}/step{step_num}\n"
            f"FAIL: step '{step_name}' failed after {self._max_retries} attempts: {fail_line}\n"
            f"VERIFY-CMD: {verify_fail.cmd if verify_fail else 'none'}\n"
            f"EXIT: {verify_fail.exit_code if verify_fail and verify_fail.exit_code is not None else 'none'}\n"
        )
        if tail:
            entry += f"OUTPUT-TAIL:\n```\n{tail}\n```\n"
        # H5: 엔트리 전체(FAIL 줄·VERIFY-CMD·OUTPUT-TAIL)를 쓰기 직전에 스크럽한다.
        entry = redact_secrets(entry)
        lessons.write_text(old + entry, encoding="utf-8")
        if hasattr(self, "_memory_snapshot"):
            self._memory_snapshot["LESSONS.md"] = lessons.read_bytes()
        print(f"  Lesson: .harness/LESSONS.md L-{next_id:03d} 기록 (triage는 harness-lesson으로)")

    # LESSONS.md는 append-only인데(엔진이 실패마다 자동 추가) 정리 절차가 없으면
    # 미조사 항목이 조용히 쌓인다 — 학습 루프의 열린 지점. 강제(기동 거부)가 아니라
    # 표면화(경고)만 한다: LESSONS는 프롬프트에 주입되지 않으므로 크기가 실행 품질을
    # 직접 해치지 않고, 조사 시점은 사람의 판단 영역이다.
    LESSONS_WARN_BYTES = 32 * 1024

    def _warn_lessons_health(self):
        p = ROOT / ".harness" / "LESSONS.md"
        if not p.exists():
            return
        try:
            text = p.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            # 사람이 편집하는 파일이라 비UTF-8(cp949 등) 저장이 실제로 발생한다 —
            # 경고 기능이 기동 크래시로 승격되면 "경고만" 설계 제약을 스스로 어긴다
            # (Fable 5 크로스 리뷰 2026-07-07). 읽기 실패는 알리고 건너뛴다.
            print("  WARN: .harness/LESSONS.md를 UTF-8로 읽지 못해 미조사 검사를 "
                  "생략합니다 — 파일 인코딩을 확인하세요.")
            return
        untriaged = count_untriaged_engine_lessons(text)
        if untriaged:
            print(f"  WARN: 미조사 엔진 실패 기록 {untriaged}건 — CAUSE 없는 '| engine |' "
                  f"항목이 .harness/LESSONS.md에 남아 있습니다. harness-lesson triage로 "
                  f"조사하세요. 조사되지 않은 실패는 규칙이 되지 못합니다.")
        size = len(text.encode("utf-8"))
        if size > self.LESSONS_WARN_BYTES:
            print(f"  WARN: .harness/LESSONS.md {size} bytes — 권장 임계"
                  f"({self.LESSONS_WARN_BYTES} bytes)를 넘었습니다. harness-lesson으로 "
                  f"조사를 끝낸 항목을 정리하세요.")

    # --- 헤더 & 검증 ---

    def _print_header(self):
        print(f"\n{'='*60}")
        print(f"  Harness Step Executor")
        print(f"  Phase: {self._phase_name} | Steps: {self._total}")
        if self._driver != "claude":
            print(f"  Driver: {self._driver}")
        if self._driver == "bridge":
            print(f"  Bridge: 인터랙티브 Claude Code 세션에서 harness-worker 스킬을 실행해 두세요")
        if self._auto_push:
            print(f"  Auto-push: enabled")
        print(f"{'='*60}")

    def _reconcile_unverified_completed(self):
        """기동 시 status=completed인데 completed_at이 없는 step을 pending으로
        강등한다. completed_at은 verify 통과 직후에만 엔진이 찍는 스탬프이고
        (SESSION_STEP_FIELDS 밖이라 살아있는 엔진의 화이트리스트 재구성이 세션
        기입분을 이식하지 않는다), 따라서 이 조합은 "엔진이 검증하지 않은 완료"다.
        세션이 completed를 기입한 직후 verify/커밋 전에 엔진이 크래시하면 이
        상태가 남는데, 그대로 신뢰하면 그 step은 영영 verify 없이 통과한다 —
        자기보고 불신 원칙에 따라 pending으로 되돌려 재실행(스냅샷 verify 재적용)
        한다. 기동 거부가 아니라 강등인 이유: 코드 소유 상태 전이로 재검증을
        기계적으로 강제할 수 있는데 사람을 부를 이유가 없다 (Codex 크로스 리뷰
        2026-07-07). 한계: 크래시 창에서 세션이 completed_at까지 통째로 위조한
        파일은 여기서 구분할 수 없다 — 그 창은 worktree-clean 게이트(소스 dirty
        재기동 거부)가 좁힌다."""
        index = self._read_json(self._index_file)
        demoted = []
        for s in index.get("steps", []):
            if s.get("status") == "completed" and "completed_at" not in s:
                s["status"] = "pending"
                for field in self.RETRY_POP_FIELDS:
                    s.pop(field, None)
                demoted.append(s.get("step"))
        if demoted:
            self._write_index(index)
            nums = ", ".join(str(n) for n in demoted)
            print(f"  WARN: step {nums} — completed인데 verify 스탬프(completed_at)가 "
                  f"없음. 직전 런이 verify 전에 중단된 미검증 완료로 보고 pending으로 "
                  f"강등, 재실행합니다 (self-report distrust). 사람이 의도적으로 건너뛰려 "
                  f"완료 표시한 step이면 completed_at을 직접 기입하세요 — 기동 전 "
                  f"index는 사람 소유입니다")

    def _check_blockers(self):
        # 여기의 기동 거부는 run-summary.json을 쓰지 않는다 (의도적 제외 — Codex
        # 크로스 리뷰 2026-07-07에서 명시 요구): 세션 0개의 비실행이며, 여기서 쓰면
        # 직전 실패 런이 남긴 의미 있는 집계(attempts/verify_failures)를 빈 값으로
        # 덮어쓴다. 집계는 실제 런의 종료 경로(completed/error/blocked)에서만 쓴다.
        index = self._read_json(self._index_file)
        for s in reversed(index["steps"]):
            if s["status"] == "error":
                print(f"\n  ✗ Step {s['step']} ({s['name']}) failed.")
                print(f"  Error: {s.get('error_message', 'unknown')}")
                print(f"  Fix and reset status to 'pending' to retry.")
                sys.exit(1)
            if s["status"] == "blocked":
                print(f"\n  ⏸ Step {s['step']} ({s['name']}) blocked.")
                print(f"  Reason: {s.get('blocked_reason', 'unknown')}")
                print(f"  Resolve and reset status to 'pending' to retry.")
                sys.exit(2)
            if s["status"] != "pending":
                break

    def _ensure_created_at(self):
        index = self._read_json(self._index_file)
        if "created_at" not in index:
            index["created_at"] = self._stamp()
            self._write_index(index)

    # --- 실행 루프 ---

    def _execute_single_step(self, step: dict, guardrails: str) -> bool:
        """단일 step 실행 (재시도 포함). 완료되면 True, 실패/차단이면 False."""
        step_num, step_name = step["step"], step["name"]
        done = sum(1 for s in self._read_json(self._index_file)["steps"] if s["status"] == "completed")
        prev_error = None

        for attempt in range(1, self._max_retries + 1):
            stats = self._run_stats.setdefault(
                step_num, {"attempts": 0, "verify_failures": 0, "timeouts": 0,
                           "session_exit_nonzero": 0, "status_not_updated": 0,
                           "attempt_secs": []})
            stats["attempts"] += 1
            # step_context는 프롬프트에 전문 주입된다 — bridge에서는 직전 검사와
            # 이 읽기 사이 창의 늦은 워커 쓰기가 지시문 주입이 될 수 있으므로
            # 검사 관문을 거친 읽기를 쓴다.
            index = self._read_index_checked()
            step_context = self._build_step_context(index)
            # 세션 기동 전 검사 — 초과 시 아무것도 잃지 않은 시점에 멈춘다.
            # 의미상 blocked(사람의 phase 분할/contract 축소 필요)이므로 기존
            # blocked 경로에 편입한다 — 콘솔 출력만 남기고 죽으면 다음 세션의
            # SessionStart 훅이 이 phase를 "실행 대기"로 오안내한다 (관찰 공백).
            budget_reason = self._check_step_context_budget(step_context)
            if budget_reason is not None:
                ts = self._stamp()
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "blocked"
                        s["blocked_reason"] = budget_reason
                        s["blocked_at"] = ts
                self._write_index(index)
                print(f"  ⏸ Step {step_num}: {step_name} blocked")
                print(f"    Reason: {budget_reason}")
                self._update_top_index("blocked")
                self._write_run_summary("blocked")
                sys.exit(2)
            preamble = self._build_preamble(guardrails, step_context, prev_error)

            tag = f"Step {step_num}/{self._total - 1} ({done} done): {step_name}"
            if attempt > 1:
                tag += f" [retry {attempt}/{self._max_retries}]"

            # F-C: CLAUDE.md/AGENTS.md/docs 변조 감지용 세션 전 상태 (WARN 전용)
            wt_before = self._worktree_status()
            head_before = self._snapshot_head()
            # heartbeat: 세션 블로킹 대기(최대 SESSION_TIMEOUT) 직전 초크포인트 —
            # 여기서 touch해야 세션 하나 길이의 공백이 stale 임계 안에 들어온다
            # (Codex 크로스 리뷰 2026-07-10)
            self._touch_run_lock()
            with progress_indicator(tag) as pi:
                output = self._invoke_claude(step, preamble)
            # pi.elapsed는 with 블록 종료(finally) 시점에 갱신되므로 밖에서 읽는다
            elapsed = int(pi.elapsed)
            # 시도별 세션 소요시간(초)은 이미 측정된 값이다 — run-summary가
            # 재시도율과 함께 읽을 수 있게 버리지 않고 집계에 남긴다.
            stats.setdefault("attempt_secs", []).append(elapsed)
            if self._driver != "bridge":
                # 프로세스 종료 ≠ 쓰기 종료: 세션이 남긴 자식(dev 서버·watcher·
                # 의도적 writer)이 판정~verify~커밋 창에 쓸 수 있다 (Codex 크로스
                # 리뷰 2026-07-06). bridge가 done 후에 하듯 정지를 기다린 뒤
                # 판정한다. bridge는 _bridge_session 안에서 이미 기다렸다.
                self._await_worktree_quiescence()
            self._check_memory_tamper()
            self._check_enforcement_tamper()
            self._check_step_file_tamper()
            self._check_head_moved(head_before)
            # 엔진이 status를 읽기 전에 index를 재구성해야 한다 — 읽은 뒤면 변조된
            # 다른 step 상태가 이미 이번 판정·커밋에 흘러든다. 반환된 authoritative
            # dict를 그대로 소비한다 — 라이브를 다시 읽으면 재구성~재읽기 창에 착지한
            # 늦은 워커 쓰기가 아래 _write_index의 스냅샷 동기화로 세탁된다 (bridge).
            index = self._check_index_tamper(step_num)
            self._warn_prompt_surface_changes(wt_before)
            self._warn_verify_surface_changes(wt_before, stats, self._verify_snapshot.get(step_num))
            if index is None:  # 스냅샷 미설정(직접 호출 테스트) — 라이브 폴백
                index = self._read_json(self._index_file)
            status = next((s.get("status", "pending") for s in index["steps"] if s["step"] == step_num), "pending")
            ts = self._stamp()
            err_msg = None
            verify_fail = None

            if status == "completed":
                if not self._verify_snapshot.get(step_num):
                    print(f"  ⚠ Step {step_num}: verify 미정의 — 자기보고만으로 완료 처리됨")
                verify_fail = self._run_verify(step_num)
                if verify_fail:
                    stats["verify_failures"] += 1
                err_msg = verify_fail.summary if verify_fail else None
                if err_msg is None:
                    for s in index["steps"]:
                        if s["step"] == step_num:
                            s["completed_at"] = ts
                    self._write_index(index)
                    self._commit_step(step_num, step_name)
                    print(f"  ✓ Step {step_num}: {step_name} [{elapsed}s]")
                    return True
                print(f"  ⚠ Step {step_num}: completed 보고됐으나 verify 실패 — 불인정")

            if status == "blocked":
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["blocked_at"] = ts
                self._write_index(index)
                reason = next((s.get("blocked_reason", "") for s in index["steps"] if s["step"] == step_num), "")
                print(f"  ⏸ Step {step_num}: {step_name} blocked [{elapsed}s]")
                print(f"    Reason: {reason}")
                self._update_top_index("blocked")
                self._write_run_summary("blocked")
                # harness-plan/SKILL.md는 영어 문구를 가르치므로 한/영 프리픽스 모두 인식
                if reason.startswith("계획 수정 필요") or reason.startswith("plan revision needed"):
                    self._run_replan(f"Step {step_num} ({step_name}) blocked: {reason}")
                sys.exit(2)

            if err_msg is None:
                if output.get("timedOut"):
                    default_err = (f"bridge 워커 세션 타임아웃 ({self._bridge_timeout}s)"
                                   if self._driver == "bridge"
                                   else f"세션 타임아웃 ({self.SESSION_TIMEOUT}s)")
                else:
                    default_err = "Step did not update status"
                err_msg = next(
                    (s.get("error_message", default_err) for s in index["steps"] if s["step"] == step_num),
                    default_err,
                )

            # 실패 유형 집계 (run-summary 관찰용, 비강제). verify 실패는 위에서
            # 이미 셌으므로(우세 신호 — 세션이 completed 보고까지는 했다) 나머지
            # 경로만 상호배타로 분류한다 — "3회 타임아웃"과 "3회 verify 실패"가
            # attempts 잔차로 뭉개지지 않게 하기 위한 해상도다 (Codex 크로스 리뷰
            # 2026-07-07). 성공/blocked 경로는 위에서 반환/종료했다.
            if verify_fail is None:
                if output.get("timedOut"):
                    stats["timeouts"] = stats.get("timeouts", 0) + 1
                elif output.get("exitCode", 0) != 0:
                    stats["session_exit_nonzero"] = stats.get("session_exit_nonzero", 0) + 1
                elif err_msg == "Step did not update status":
                    stats["status_not_updated"] = stats.get("status_not_updated", 0) + 1

            if attempt < self._max_retries:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        s["status"] = "pending"
                        # 세션이 써놓은 summary/contract 등 자기보고 필드가 다음
                        # 시도의 컨텍스트를 오염시키지 않도록 모두 제거한다.
                        for field in self.RETRY_POP_FIELDS:
                            s.pop(field, None)
                self._write_index(index)
                prev_error = err_msg
                print(f"  ↻ Step {step_num}: retry {attempt}/{self._max_retries} — {err_msg}")
            else:
                for s in index["steps"]:
                    if s["step"] == step_num:
                        # summary/contract/completed_at은 실패한 시도의 자기보고이므로
                        # 제거한다. error_message/failed_at은 실패 사실 자체이므로 유지.
                        for field in ("summary", "contract", "completed_at"):
                            s.pop(field, None)
                        s["status"] = "error"
                        s["error_message"] = f"[{self._max_retries}회 시도 후 실패] {err_msg}"
                        s["failed_at"] = ts
                self._write_index(index)
                self._append_lesson(step_num, step_name, err_msg, verify_fail)
                # 커밋 전에 쓴다 — _commit_step의 chore 커밋(add -A)에 실려 실패
                # 실행의 집계도 히스토리에 남는다 (성공 실행과 같은 대우).
                self._write_run_summary("error")
                self._commit_step(step_num, step_name, failed=True)
                print(f"  ✗ Step {step_num}: {step_name} failed after {self._max_retries} attempts [{elapsed}s]")
                print(f"    Error: {err_msg}")
                self._update_top_index("error")
                self._run_replan(f"Step {step_num} ({step_name}) {self._max_retries}회 시도 후 실패: {err_msg}")
                sys.exit(1)

        return False  # unreachable

    def _execute_all_steps(self, guardrails: str):
        while True:
            # F-B: 강제 계층 생존성은 기동 시 1회로 끝나지 않는다 — 직전 step 세션이
            # 훅/설정을 죽였을 수 있으므로 매 step 전에 재확인한다 (fail-closed).
            # 바이트 스냅샷 원복(_check_enforcement_tamper)이 먼저 돌지만, PATH 상실
            # 등 파일 밖 원인과 원복 실패에 대한 최종 어서션으로 유지한다.
            self._check_enforcement_alive()
            index = self._read_index_checked()
            pending = next((s for s in index["steps"] if s["status"] == "pending"), None)
            if pending is None:
                print("\n  All steps completed!")
                return

            step_num = pending["step"]
            for s in index["steps"]:
                if s["step"] == step_num and "started_at" not in s:
                    s["started_at"] = self._stamp()
                    self._write_index(index)
                    break

            self._execute_single_step(pending, guardrails)

    def _driver_bin(self) -> str:
        name = "codex" if self._driver == "codex" else "claude"
        return shutil.which(name) or name

    # v0.12.0: codex에는 --strict-mcp-config 등가물이 없고, `-c mcp_servers={}`
    # 블랭킷 오버라이드는 병합 의미론이라 기존 서버를 지우지 못한다(실측, codex
    # 0.142.3). 동작이 확인된 유일한 경로는 서버별 `-c mcp_servers.<name>.enabled=
    # false`이므로, 기동 시 `codex mcp list --json`으로 이름을 열거해 서버별 disable
    # 플래그를 만들어 step/advisory 세션에 부착한다 — read-only 샌드박스는 MCP 서버
    # 프로세스를 구속하지 않으므로 advisory에도 필요하다. 열거 실패는 fail-closed
    # 기동 거부 — MCP 차단 여부를 확인할 수 없는 상태로 무인 세션을 돌리지 않는다
    # ([features] hooks 필수 검사와 같은 결).
    def _codex_mcp_disable_flags(self) -> list:
        if hasattr(self, "_codex_mcp_flags"):
            return self._codex_mcp_flags
        try:
            res = subprocess.run(
                [self._driver_bin(), "mcp", "list", "--json"],
                cwd=self._root, capture_output=True, text=True,
                encoding="utf-8", errors="replace", timeout=60)
        except (OSError, subprocess.TimeoutExpired) as e:
            print(f"\n  ERROR: `codex mcp list --json` 실행 실패 ({e}) — MCP 차단을 "
                  f"확인할 수 없어 기동을 거부합니다 (fail-closed)")
            sys.exit(1)
        if res.returncode != 0:
            print(f"\n  ERROR: `codex mcp list --json` 종료 코드 {res.returncode} — "
                  f"MCP 차단을 확인할 수 없어 기동을 거부합니다 (fail-closed). "
                  f"codex 버전을 확인하세요.")
            sys.exit(1)
        try:
            servers = json.loads(res.stdout or "[]")
        except (json.JSONDecodeError, ValueError):
            print("\n  ERROR: `codex mcp list --json` 출력 파싱 실패 — MCP 차단을 "
                  "확인할 수 없어 기동을 거부합니다 (fail-closed)")
            sys.exit(1)
        # 형상 fail-closed 대칭화: returncode·파싱 실패와 같은 결로, "유효 JSON이지만
        # 예상 형상이 아닌" 경우도 조용히 통과(0개 서버로 fail-open)시키지 않는다.
        # codex CLI가 출력 형식을 바꾸면(예: {"servers":[...]} 래퍼, 항목 타입 변경)
        # 이름을 못 붙여 MCP 차단 보증이 무너지므로 기동을 거부한다.
        if not isinstance(servers, list):
            print("\n  ERROR: `codex mcp list --json` 출력 최상위가 리스트(list)가 "
                  "아닙니다 — MCP 차단을 확인할 수 없어 기동을 거부합니다 (fail-closed). "
                  "codex 버전을 확인하세요.")
            sys.exit(1)
        flags = []
        for i, s in enumerate(servers):
            name = s.get("name") if isinstance(s, dict) else None
            if not name:
                print(f"\n  ERROR: `codex mcp list --json` 서버 목록 {i}번 항목에 "
                      f"name이 없습니다(dict 아님 포함) — 이름 없는 서버엔 "
                      f"enabled=false를 부착할 수 없어 MCP 차단을 확인할 수 없어 "
                      f"기동을 거부합니다 (fail-closed)")
                sys.exit(1)
            # TOML dotted key: 식별자 외 문자가 있는 이름은 따옴표 세그먼트로 인용
            key = name if re.fullmatch(r"[A-Za-z0-9_-]+", name) else json.dumps(name)
            flags += ["-c", f"mcp_servers.{key}.enabled=false"]
        if flags:
            print(f"  MCP: codex 서버 {len(flags) // 2}개를 세션에서 비활성화 "
                  f"(MCP 의존 워크플로는 무인 실행 미지원)")
        self._codex_mcp_flags = flags
        return flags

    def _advisory_cmd(self, bin_path: str) -> list:
        """replan/review(advisory) 세션 커맨드. advisory 모델이 지정된 경우에만
        모델 플래그를 붙인다 (미지정 시 기본 유지).

        H4(claude): --disallowedTools로 파일 편집 도구(Edit/Write/MultiEdit/
        NotebookEdit)를 사전 차단한다. 단 Bash는 의도적으로 차단하지 않는다 —
        /review 체크리스트가 빌드 명령 실행을 요구하기 때문. 따라서 이것은 '차단
        완성'이 아니라 '방어 심도 추가'이며, 세션이 Bash로 파일을 고쳐도 되돌리는
        _revert_unexpected_changes(worktree 가드)가 2차 방어선으로 필수 유지된다.

        codex: --sandbox read-only가 쓰기를 OS/샌드박스 수준에서 막는다 —
        disallowedTools보다 강한 사전 차단이지만, 샌드박스 구현 강도가 플랫폼마다
        다르므로 worktree 가드는 동일하게 유지한다. 최종 메시지는
        --output-last-message 파일로 받는다 (stdout은 전사 텍스트라 파싱 불가)."""
        if self._driver == "codex":
            cmd = [bin_path, "exec",
                   "--sandbox", "read-only",
                   "-c", 'approval_policy="never"',
                   "--dangerously-bypass-hook-trust",
                   "--cd", self._root,
                   "--output-last-message", self._advisory_last_path]
            # read-only 샌드박스는 MCP 서버 프로세스를 구속하지 않는다 — step과 동일 차단
            cmd += self._codex_mcp_disable_flags()
            if self._advisory_model:
                cmd += ["-m", self._advisory_model]
            cmd.append("-")
            return cmd
        # --strict-mcp-config: MCP 도구는 disallowedTools 목록에도 없으므로 advisory
        # 세션도 MCP 경유 쓰기가 가능했다 — step 세션과 동일하게 원천 차단한다.
        cmd = [bin_path, "-p", "--dangerously-skip-permissions", "--strict-mcp-config",
               "--output-format", "json",
               "--disallowedTools", "Edit,Write,MultiEdit,NotebookEdit"]
        if self._advisory_model:
            cmd += ["--model", self._advisory_model]
        return cmd

    def _advisory_session(self, prompt: str, label: str):
        """advisory(제안-전용) 세션 하나를 드라이버별로 실행한다.
        반환: (timed_out, result_text).

        HARNESS_ADVISORY=1(CLI 워커) / request.json의 advisory:true(bridge):
        이 세션은 프롬프트로 파일 수정을 금지한 제안-전용 세션이다. Stop 품질
        게이트가 이 안에서 block("문제를 수정한 뒤 다시 종료하라")을 걸면 "파일은
        절대 수정하지 마라"는 지시와 정면 충돌하므로, stop-quality-gate.py가 이
        표시를 보고 게이트 자체를 건너뛴다. bridge 워커 세션은 엔진의 자식
        프로세스가 아니라 env를 전달받을 수 없어 파일 마커를 쓴다."""
        with progress_indicator(label):
            if self._driver == "bridge":
                res = self._bridge_session(prompt, advisory=True)
                return res["timedOut"], res["result_text"]
            try:
                try:
                    result = subprocess.run(
                        self._advisory_cmd(self._driver_bin()),
                        input=prompt, cwd=self._root, capture_output=True, text=True,
                        encoding="utf-8", errors="replace", timeout=self.SESSION_TIMEOUT,
                        env={**os.environ, "HARNESS_RUN": "1", "HARNESS_ADVISORY": "1"},
                    )
                except subprocess.TimeoutExpired:
                    return True, ""
                return False, self._advisory_result_text(result)
            finally:
                # CLI advisory 세션이 bridge 마커를 위조하는 우회로 차단 (marker guard)
                self._sweep_foreign_worker_marker()

    def _advisory_result_text(self, result) -> str:
        """advisory 세션의 최종 텍스트를 드라이버별 방식으로 추출한다."""
        if self._driver == "codex":
            p = Path(self._advisory_last_path)
            try:
                if p.exists():
                    text = p.read_text(encoding="utf-8")
                    with contextlib.suppress(OSError):
                        p.unlink()
                    if text.strip():
                        return text
            except OSError:
                pass
            return result.stdout
        try:
            return json.loads(result.stdout).get("result") or result.stdout
        except Exception:
            return result.stdout

    def _guarded_advisory(self, prompt: str, label: str, allowed: tuple):
        """advisory 세션 실행 + 세션 후 공통 가드를 한 곳에서 적용한다.
        반환: (timed_out, text). 가드 블록이 _run_replan/_run_review에 복붙돼
        있으면 새 가드 추가 시 한쪽이 누락되는 드리프트가 생긴다 — v0.9.0의
        step-file/HEAD 가드 추가가 계기. 타임아웃이어도 가드는 전부 돈다."""
        wt_before = self._worktree_status()
        head_before = self._snapshot_head()
        # heartbeat: advisory(replan/review) 세션도 SESSION_TIMEOUT까지 블로킹
        # 대기한다 — 직전 초크포인트에서 락을 touch한다 (Codex 크로스 리뷰 2026-07-10)
        self._touch_run_lock()
        timed_out, text = self._advisory_session(prompt, label)
        if self._driver != "bridge":
            # step 세션과 같은 이유의 정지 대기 — advisory 세션이 남긴 자식
            # writer가 아래 가드들의 판정 기준을 흔들지 않게 한다.
            self._await_worktree_quiescence()
        # advisory 세션도 권한 게이트 없이 돌므로 메모리 파일 변조와 임의 파일
        # 변경을 기계적으로 되돌린다 — 프롬프트 금지는 강제가 아니다
        # (E2E에서 실제 발생 확인). 타임아웃이어도 세션이 남긴 변경은 되돌려야
        # 한다. review 경로는 _finalize의 커밋이 이 뒤에 오므로 여기서
        # 되돌려야 미검증 변경이 커밋되지 않는다.
        self._check_memory_tamper()
        self._check_enforcement_tamper()
        self._check_step_file_tamper()
        # HEAD 핀 원복이 revert보다 먼저다 — revert는 경로를 HEAD 기준으로
        # 복원하므로, 세션이 옮긴 HEAD를 먼저 되돌려야 기준이 오염되지 않는다.
        self._check_head_moved(head_before)
        self._revert_unexpected_changes(wt_before, allowed)
        # advisory 세션은 index를 쓸 정당한 사유가 없다 — 전량 원복 (F-A).
        self._check_index_tamper()
        return timed_out, text

    def _run_replan(self, failure_context: str):
        """실패/계획-수정 blocked 시 planning 세션을 열어 남은 step 재설계안을
        replan-proposal.md로 남긴다. 제안만 생성하며, 적용은 사용자 검토 후 수동으로
        한다 — 무인 상태에서 계획 자체를 조용히 바꾸는 건 위험하기 때문."""
        index = self._read_json(self._index_file)
        remaining = []
        for s in index["steps"]:
            if s["status"] == "completed":
                continue
            f = self._phase_dir / f"step{s['step']}.md"
            if f.exists():
                remaining.append(f"### step{s['step']}.md\n\n{f.read_text(encoding='utf-8')}")
        prompt = (
            f"당신은 {self._project} 프로젝트의 플래너다. 하네스 실행이 아래 사유로 중단됐다.\n\n"
            f"## 중단 사유\n\n{failure_context}\n\n"
            f"## 현재 계획 (phases/{self._phase_dir_name}/index.json)\n\n"
            f"{json.dumps(index, ensure_ascii=False, indent=2)}\n\n"
            f"## 남은 step 파일\n\n" + "\n\n".join(remaining) + "\n\n"
            f"## 지시\n\n"
            f"필요하면 코드를 직접 읽어 원인을 파악한 뒤, 남은 step 계획의 수정안을 제안하라.\n"
            f"각 step에 name, 작업 요약, 실행 가능한 verify 커맨드를 포함하라.\n"
            f"파일은 절대 수정하지 말고 제안만 텍스트로 출력하라.\n"
        )
        allowed = (f"phases/{self._phase_dir_name}/replan-proposal.md",)
        timed_out, text = self._guarded_advisory(
            prompt, "Replan: 남은 step 재설계안 작성", allowed)
        if timed_out:
            print("  WARN: 재계획 세션 타임아웃 — 제안 생략")
            return
        # H5: 제안 본문에 세션이 인용한 시크릿이 섞일 수 있으므로 저장 전에 스크럽한다.
        text = redact_secrets(text)
        (self._phase_dir / "replan-proposal.md").write_text(text, encoding="utf-8")
        print(f"  Replan: phases/{self._phase_dir_name}/replan-proposal.md 저장")
        print(f"          검토 후 step 파일·index.json에 반영하고, 해당 step을 pending으로 되돌려 재실행하라.")

    def _run_review(self):
        """phase 완료 후 리뷰 세션을 독립 실행해 결과를 review.md로 남긴다 (비게이트)."""
        review_cmd = Path(self._root) / ".claude" / "commands" / "review.md"
        if not review_cmd.exists():
            return
        prompt = (
            f"main 대비 현재 브랜치(feat-{self._phase_name})의 변경 사항을 리뷰하라.\n\n"
            + review_cmd.read_text(encoding="utf-8")
        )
        allowed = (f"phases/{self._phase_dir_name}/review.md",)
        timed_out, text = self._guarded_advisory(
            prompt, "Review: phase 변경 사항 리뷰", allowed)
        if timed_out:
            print("  WARN: 리뷰 세션 타임아웃 — 리뷰 생략")
            return
        # H5: 리뷰 본문에 세션이 인용한 시크릿이 섞일 수 있으므로 저장 전에 스크럽한다.
        text = redact_secrets(text)
        (self._phase_dir / "review.md").write_text(text, encoding="utf-8")
        print(f"  Review: phases/{self._phase_dir_name}/review.md 저장")

    def _finalize(self):
        # bridge: 마지막 step 처리와 finalize 사이 창의 늦은 워커 쓰기도 원복한 뒤 소비
        index = self._read_index_checked()

        # _execute_all_steps는 pending 부재만 보고 종료하므로, 손편집 등으로 생긴
        # 미지의 status("done" 등)가 있으면 놓칠 수 있다. completed로 표기하기
        # 전에 모든 step이 실제로 completed인지 방어적으로 재확인한다.
        incomplete = [s for s in index["steps"] if s.get("status") != "completed"]
        if incomplete:
            print(f"\n  ERROR: 완료되지 않은 step이 있어 phase를 종료할 수 없습니다:")
            for s in incomplete:
                print(f"    Step {s['step']} ({s['name']}): {s.get('status', 'unknown')}")
            sys.exit(1)

        index["completed_at"] = self._stamp()
        self._write_index(index)
        self._update_top_index("completed")
        self._run_review()
        # bridge 워커가 done 이후(정리 뒤)에 마커를 다시 써두는 꼬리 케이스 방어
        self._sweep_foreign_worker_marker()
        # phases/ 스테이징 전에 쓴다 — 아래 chore 커밋에 실린다
        self._write_run_summary("completed")

        # step*.md는 phases/ 아래라 아래 스테이징에 실린다 — 리뷰 세션 가드와
        # 이 커밋 사이 창의 늦은 쓰기를 커밋 직전에 한 번 더 원복한다.
        self._check_step_file_tamper()

        # `add -A` 금지: 직전의 advisory 리뷰 세션이 프롬프트를 어기고 남긴 미검증
        # 파일이 chore 커밋에 쓸려 들어갈 수 있다. finalize가 정당하게 커밋할 것
        # (index.json completed_at, top index, review.md)은 전부 phases/ 아래다.
        # 세션이 몰래 스테이징한 변경이 커밋에 편승하지 못하도록 인덱스를 비운다
        # — git commit은 인덱스 전체를 커밋하므로 add를 phases/로 한정하는 것만으로는 부족하다.
        # 준비 명령(reset/add)도 게이트를 통과한다 (Codex 크로스 리뷰 2026-07-11
        # HIGH — add 실패는 diff --cached 0으로 이어져 커밋 없이 완료 배너까지
        # 조용히 진행했고, reset 실패는 미검증 스테이징이 완료 커밋에 편승한다).
        r = self._run_git("reset", "-q")
        if r.returncode != 0:
            self._abort_finalize_storage("완료 마커 준비(reset)", r)
        r = self._run_git("add", "--", "phases")
        if r.returncode != 0:
            self._abort_finalize_storage("완료 마커 준비(add phases)", r)
        r = self._run_git("diff", "--cached", "--quiet")
        if r.returncode not in (0, 1):
            self._abort_finalize_storage("완료 마커 스테이징 판정(diff --cached)", r)
        if r.returncode == 1:
            msg = f"chore({self._phase_name}): mark phase completed"
            r = self._run_git("commit", "-m", msg)
            if r.returncode != 0:
                # 완료 마커 커밋 실패를 무출력으로 넘기면 저장 안 된 phase가
                # "Phase completed!"로 선언된다.
                self._abort_finalize_storage("완료 마커 커밋", r)
            print(f"  ✓ {msg}")

        if self._auto_push:
            branch = f"feat-{self._phase_name}"
            r = self._run_git("push", "-u", "origin", branch)
            if r.returncode != 0:
                print(f"\n  ERROR: git push 실패: {r.stderr.strip()}")
                sys.exit(1)
            print(f"  ✓ Pushed to origin/{branch}")

    def _abort_finalize_storage(self, what: str, r):
        """finalize의 저장(스테이징·커밋) 실패는 상태를 뒤집지 않는다 — step들은
        이미 verify를 통과했고 completed 기록(top index·run-summary)도 사실이다.
        저장만 사람에게 넘기고 auto_push 실패와 같은 결로 중단한다
        (_abort_on_commit_failure와 달리 top-index를 error로 덮지 않는 이유)."""
        print(f"\n  ERROR: {what} 실패: {(r.stderr or '').strip()}")
        print("  phase는 검증 완료됐지만 완료 마커(phases/)가 커밋되지"
              " 않았습니다. git 설정을 점검하고 phases/ 변경을 수동 커밋하세요.")
        sys.exit(1)

        print(f"\n{'='*60}")
        print(f"  Phase '{self._phase_name}' completed!")
        print(f"{'='*60}")


def main():
    # Windows 콘솔/리다이렉트 기본 인코딩(cp949 등)에서는 진행 표시기·상태 글리프
    # (◐ ✓ ✗ ⏸ ↻ ⚠)가 인코딩 불가로 죽는다. stdout/stderr를 UTF-8로 맞춘다.
    for _stream in (sys.stdout, sys.stderr):
        with contextlib.suppress(Exception):
            _stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Harness Step Executor")
    parser.add_argument("phase_dir", help="Phase directory name (e.g. 0-mvp)")
    parser.add_argument("--push", action="store_true", help="Push branch after completion")
    parser.add_argument("--allow-no-verify", action="store_true",
                        help="verify 미정의 step을 자기보고만으로 통과시킨다 (비권장)")
    parser.add_argument("--model", default=None,
                        help="step 세션 모델 id (미설정 시 드라이버 기본 모델)")
    parser.add_argument("--advisory-model", default=None,
                        help="replan/review 세션 모델 id (미설정 시 드라이버 기본 모델)")
    parser.add_argument("--driver", default=None, choices=["claude", "codex", "bridge"],
                        help="세션 백엔드 (미설정 시 profile.driver, 기본 claude; "
                             "bridge는 인터랙티브 세션의 harness-worker 스킬에 위임)")
    args = parser.parse_args()

    StepExecutor(args.phase_dir, auto_push=args.push,
                 allow_no_verify=args.allow_no_verify,
                 step_model=args.model,
                 advisory_model=args.advisory_model,
                 driver=args.driver).run()


if __name__ == "__main__":
    main()
