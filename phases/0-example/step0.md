<!--
  이 phase는 하네스 템플릿의 예시/스모크 테스트용이다. 실제 프로젝트가 아니다.
  `python scripts/execute.py 0-example`로 실행하면:
  - `feat-0-example` 브랜치가 생성(또는 checkout)된다.
  - 이 step이 통과하면 `feat(0-example): step 0 — hello-greet` 코드 커밋과
    `chore(0-example): step 0 output` 메타데이터 커밋이 자동으로 생긴다.
  템플릿을 실제 프로젝트에 쓸 때는 이 `phases/0-example/` 디렉토리를 지우거나
  참고용으로만 남겨둬라.
-->

# Step 0: hello-greet

## 읽어야 할 파일

먼저 아래 파일을 읽고 프로젝트 컨벤션을 파악하라:

- `/CLAUDE.md`

이 phase는 예시의 첫 step이므로 참고할 이전 산출물은 없다.

## 작업

`tests/test_hello.py`에 `greet`를 검증하는 pytest 테스트를 먼저 작성하라. 최소 다음을 확인한다:

- `greet("World")`가 `"Hello, World!"`를 반환한다.
- `greet("Claude")`가 `"Hello, Claude!"`를 반환한다.

이어서 `src_example/hello.py`에 테스트를 통과시키는 다음 함수를 작성하라:

```python
def greet(name: str) -> str:
    """인사말을 반환한다. 예: greet("World") -> "Hello, World!" """
```

- 빈 문자열 등 예외적인 입력에 대한 별도 처리는 요구하지 않는다. 단순 포맷팅이면 충분하다.

## Acceptance Criteria

```bash
python -m pytest tests/test_hello.py -q   # 신규 테스트 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트를 확인한다:
   - `src_example/hello.py`에 `greet(name)` 함수가 존재하는가?
   - `tests/test_hello.py`가 실제로 `greet`를 호출해 반환값을 검증하는가 (파일 존재 확인 수준이 아닌가)?
3. 결과에 따라 `phases/0-example/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`

## 금지사항

- `greet` 외 추가 함수·CLI·파일을 만들지 마라. 이유: 이 phase는 하네스 스모크 테스트용 최소 예시다.
- 기존 테스트(`scripts/test_execute.py` 등)를 깨뜨리지 마라.
