<!--
  이 phase는 하네스 템플릿의 예시/스모크 테스트용이다. 실제 프로젝트가 아니다.
  이 step은 step 0에서 만든 `src_example/hello.py`, `tests/test_hello.py`에
  이어서 같은 `feat-0-example` 브랜치에서 실행된다. 통과하면
  `feat(0-example): step 1 — greet-i18n` 코드 커밋과
  `chore(0-example): step 1 output` 메타데이터 커밋이 자동으로 생긴다.
-->

# Step 1: greet-i18n

## 읽어야 할 파일

먼저 아래 파일들을 읽어라:

- `src_example/hello.py` — step 0에서 만든 `greet(name)` 함수
- `tests/test_hello.py` — step 0에서 만든 테스트

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 기존 시그니처를 깨지 않도록 작업하라.

## 작업

`tests/test_hello.py`에 다음을 검증하는 테스트를 먼저 추가하라:

- `greet("World", lang="ko")`, `greet("World", lang="es")`가 각각 올바른 언어로 인사하는지.
- 지원하지 않는 `lang`(예: `"fr"`)에 `ValueError`가 발생하는지.

이어서 `src_example/hello.py`의 `greet` 함수에 언어 선택 기능을 추가해 테스트를 통과시켜라:

```python
def greet(name: str, lang: str = "en") -> str:
    """lang에 따라 다른 언어로 인사한다. 지원: "en"(기본), "ko", "es"."""
```

- 최소 3개 언어(`"en"`, `"ko"`, `"es"`)를 지원한다. 예: `greet("World", lang="ko")` → `"안녕하세요, World!"`.
- 지원하지 않는 `lang` 값이 들어오면 `ValueError`를 발생시킨다.
- 기존 `greet("World")` 호출(인자 1개, 기본값 `"en"`)은 계속 동작해야 한다 — step 0 테스트를 깨뜨리지 마라.

## Acceptance Criteria

```bash
python -m pytest tests/test_hello.py -q   # step 0 테스트 + 신규 테스트 모두 통과
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트를 확인한다:
   - 기존 `greet("World")` (인자 1개) 호출이 여전히 동작하는가?
   - 다국어 분기와 미지원 언어 예외가 실제로 테스트되는가 (파일 존재 확인 수준이 아닌가)?
3. 결과에 따라 `phases/0-example/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`

## 금지사항

- `greet`의 기존 시그니처(첫 인자 `name`, 기본 동작)를 깨지 마라. 이유: step 0 산출물과의 호환성이 이 phase의 핵심 검증 대상이다.
- 지원 언어를 3개 넘게 확장하지 마라. 이유: 이 phase는 하네스 스모크 테스트용 최소 예시다.
