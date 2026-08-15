# 채록 절차 — 구 vsp 판정을 기준 파일로 굳히는 법

`fixtures/baseline/`의 세 파일이 어디서 왔는지에 대한 답이다.

**이 문서가 필요한 이유**: 구 vsp(`vsp/` 서브트리 · Go)는 판1 안에서 은퇴한다. 은퇴하면
판정을 다시 뜰 수단이 사라지고, 기준 파일이 「구 vsp가 무엇을 어떻게 판정했는가」의
**유일한 잔존 형태**가 된다. 나중에 누가 "이 기준은 어디서 왔나"를 물으면 여기가 답이다.

---

## 0. 무엇을 채록했나 — 표면 셋

구 vsp의 로컬 판정은 얼굴이 셋이고, **셋의 규칙 구성이 서로 다르다.** 하나만 채록하면
나머지가 조용히 비어 버린다.

| 표면 | 부르는 법 | 규칙 수 | 코드 정본 |
|---|---|---|---|
| `lint` | `vsp lint --file <경로>` (CLI) | **7** | `vsp/cmd/vsp/cli_extra.go` `runLint` |
| `analyze` | `vsp --offline` MCP → `AnalyzeABAPCode` | **13** | `vsp/pkg/adt/codeanalysis.go` `allRules()` |
| `parse` | 일회용 Go 채록 셈 (§2) | — (분류기) | `vsp/pkg/abaplint/{lexer,statements,matcher}.go` |

`vsp/pkg/abaplint/rules.go`는 규칙 **13종**을 구현하지만 CLI `lint`는 그중 **7종**만
등록한다(`pkg/abaplint/lint.go`의 `defaultRules()`는 또 다른 구성인 **8종**이고, CLI는
그것도 쓰지 않는다). 그래서 `select_star` · `hardcoded_credentials` · `catch_cx_root` ·
`commit_in_loop` · `dynamic_call_no_try` 의 양성 픽스처는 **`vsp lint`로는 한 건도 나오지
않는다** — `analyze` 표면을 함께 채록해야 그 5종이 기록에 남는다.

같은 규칙이라도 표면마다 파라미터가 다르다(실측):

| 규칙 | lint (CLI) | analyze (MCP) |
|---|---|---|
| `line_length` | 상한 **120** (`--max-length` 기본) | 상한 **130** |
| `obsolete_statement` | COMPUTE ADD SUBTRACT MULTIPLY DIVIDE MOVE **REFRESH** (7) | REFRESH **빠짐** (6) |
| `local_variable_names` | 패턴 3종 있음 | **빈 패턴** → 한 건도 울리지 않음 |
| `double_space` | **미등록** | 등록 |

**채록은 실측을 그대로 담는다.** 이상해 보여도 고치지 않는다 — 고치는 순간 그것은 구
vsp의 판정이 아니게 되고, 대조의 근거가 사라진다.

---

## 1. 준비 — 구 vsp 빌드

로컬 Go 툴체인이 필요하다(실측 가용: go1.26.4 windows/amd64). **빌드 산출물은 레포에
커밋하지 않는다** — 세션 스크래치에 떨군다.

```bash
cd vsp
go build -o <스크래치>/vsp.exe ./cmd/vsp
```

`vsp/**` 소스는 **읽기 전용**이다. 빌드만 하고 한 글자도 고치지 않는다.

---

## 2. parse 채록 셈 — 왜 별도 프로그램이 필요한가

`parse` 표면만 CLI로 뜰 수 없다. 구 `vsp parse`의 세 출력 형식이 전부 기준 파일의
요구(**(문장 유형, 행) 시퀀스**)를 못 채운다 — 아래는 전부 실행해서 확인한 것이다.

- `--format text` · `--format json` 둘 다 **행 번호를 아예 출력하지 않는다.**
- `--format json`은 `fmt.Printf`로 문자열을 손으로 이어 붙이고 토큰을 이스케이프하지
  않는다. 토큰에 `"`가 들어가는 순간(예: 후행 주석 `" ...`) 깨진 JSON이 나온다 —
  `lexical_forms.abap`에서 실제로 `JSON.parse` 실패.
- `--format summary`는 Go map을 그대로 순회해 **출력 순서가 실행마다 바뀐다.**
- `parse --stdin`은 Windows에서 `/dev/stdin`을 열려다 실패하는데 그 오류를 버려서
  (`data, _ := readStdin()`) **빈 소스를 파싱한 `[]`를 exit 0으로 돌려준다.** 조용히
  틀린 답이다.

그래서 vsp의 분류기 패키지를 **그대로 불러 쓰는 일회용 Go 프로그램**을 세션 스크래치에
띄워 채록한다. 이것은 복사가 아니라 **실행**이고, SAP에 닿지 않으며, **새 트리에
커밋하지 않는다** — 구 vsp가 은퇴하면 함께 사라진다. 그래서 아래에는 프로그램 자체가
아니라 **다시 뜨는 절차**만 남긴다.

### 2.1 다시 뜨는 절차

1. 스크래치에 디렉터리를 하나 만들고 `go.mod`를 둔다. 모듈 경로에 **공백이 있으면
   따옴표로 감싸야 한다**(그러지 않으면 `malformed module path "D:/AI"`로 죽는다):

   ```
   module vsp-parse-recorder

   go 1.25.0

   require github.com/oisee/vibing-steampunk v0.0.0

   replace github.com/oisee/vibing-steampunk => "<레포>/vsp"
   ```

   `pkg/abaplint`은 표준 라이브러리만 쓰므로 `go.sum`도 네트워크도 필요 없다.

2. `main.go`는 30줄이면 된다. 하는 일은 셋뿐이다.
   - stdin에서 개행으로 구분된 파일 경로를 읽는다.
   - 각 파일을 읽어 **CRLF→LF**로 정규화한 뒤
     `abaplint.NewABAPFile(경로, 소스)` → `.GetStatements()` 를 부른다.
     (`NewABAPFile`이 어휘 분석 → 문장 분할 → 유형 분류를 한 번에 돈다.)
   - 문장마다 `Type` 과 **`Tokens[0].Row`**(토큰이 없으면 0)를 뽑아
     `{ "<입력 경로>": [ {"type": "...", "line": N}, ... ] }` 형태 JSON을 stdout으로 낸다.

   `line`을 `Tokens[0].Row`로 잡는 것이 중요하다 — 콜론 체인(`DATA: a, b.`)의 갈라진
   문장들은 **접두 토큰의 행을 공유한다.** 그것이 구 분류기의 실제 동작이므로 그대로
   담는다.

3. 빌드: `go build -o <스크래치>/vsp-parse-recorder.exe .`

---

## 3. 채록 실행

```bash
cd sapkit-cli
node harness/record-baseline.mjs \
  --vsp <스크래치>/vsp.exe \
  --parse-recorder <스크래치>/vsp-parse-recorder.exe
```

`VSP_BIN` · `VSP_PARSE_RECORDER` 환경변수로도 준다. `--out <디렉터리>`로 기준 파일을
다른 곳에 뜰 수 있고(결정론 확인에 쓴다), `--surface lint` 처럼 한 표면만 뜰 수도 있다.

채록기는 표면마다 부르는 법이 다르다:

- **lint** — 파일마다 `vsp lint --file fixtures/corpus/<경로>`를 돌려 stdout 한 줄
  (`<파일>:<행>:<열>: W|E [<규칙>] <메시지>`)을 파싱하고 **exit code를 함께 기록**한다.
  형식이 예상과 다르면 즉시 실패한다 — 조용히 0건으로 넘어가지 않게.
  (`--stdin`은 §2에서 본 이유로 Windows에서 쓸 수 없다.)
- **analyze** — `vsp --offline`(로컬 전용 · SAP 무접속)로 MCP 서버를 하나 띄우고 stdio로
  `initialize` → `tools/call AnalyzeABAPCode { source }`를 파일 수만큼 왕복한다.
  D-049 훅이 쓰던 것과 같은 경로다.
- **parse** — §2의 셈에 파일 목록을 stdin으로 넘긴다.

---

## 4. 정규화 — 무엇을 기준에서 뺐나

기준 파일은 **판정**만 담는다. 새 검사기가 반드시 달라질 부분은 애초에 담지 않는다.

- **메시지·`description`·`match`·`suggestion` 문구 제외.** 문구는 새 검사기가 새로
  쓴다(복사 금지 규율의 귀결). 문구를 기준에 넣으면 첫날부터 갈림이 쏟아진다.
- **analyze의 `summary` 제외** — `findings`의 파생이라 독립적인 판정이 아니다.
  (`rulesApplied`는 파생이 아니라 구성 계약이므로 남긴다.)
- **EOL은 CRLF→LF로 정규화한 뒤 판정한다.** 코퍼스는 `.gitattributes`로 LF 고정이고,
  채록기는 시작할 때 디스크에 CRLF가 없는지 확인한다(`lint` 표면은 vsp가 파일을 직접
  읽으므로 디스크 EOL이 곧 판정 입력이다).
- **정렬 고정** — `lint`는 (행, 열, 규칙, 심각도), `analyze`는 (행, 규칙, 심각도,
  분류) 순으로 정렬한다. `parse`는 **정렬하지 않는다** — 순서 자체가 판정이기 때문.
- **중복을 보존한다.** 같은 (규칙, 행, 열, 심각도)가 2건 나올 수 있어서(콜론 체인은
  행·열을 공유한다) 집합이 아니라 **다중집합**이다. 건수까지가 판정이다.
- 휘발성 값(타임스탬프·호스트·절대 경로)은 **한 글자도 담지 않는다.** 그래서 채록을 두 번
  돌리면 바이트가 같다.

### 기준 파일 형식

```jsonc
// lint.json
"files": { "<코퍼스 상대경로>": { "exit_code": 0, "findings": [ {rule, line, col, severity} ] } }
// analyze.json
"files": { "<코퍼스 상대경로>": { "rules_applied": 13, "findings": [ {rule, line, severity, category} ] } }
// parse.json
"files": { "<코퍼스 상대경로>": { "statements": [ {type, line} ] } }   // 순서 보존
```

키는 코퍼스 루트 기준 **POSIX 상대 경로**다(`synthetic/rules/...`). 역슬래시는 들어가지
않는다 — CI(ubuntu)와 로컬(Windows)에서 같은 바이트가 나와야 하기 때문이다.

---

## 5. 확인 — 채록이 믿을 만하다는 증거

```bash
node harness/check-baseline-coverage.mjs        # 코퍼스 전 파일 × 세 표면, 누락 0
node harness/test-compare-baseline.mjs          # 대조기 음성시험 (일부러 어긋난 입력)
node harness/derive-measured-hits.mjs --check   # 대장의 실측 기록 ↔ 기준
```

**결정론**(기준 파일이 믿을 만하다는 증거)은 두 번 떠서 바이트를 맞대 확인한다:

```bash
node harness/record-baseline.mjs --vsp ... --parse-recorder ... --out <스크래치>/det1
node harness/record-baseline.mjs --vsp ... --parse-recorder ... --out <스크래치>/det2
node harness/compare-baseline.mjs <스크래치>/det1 <스크래치>/det2   # exit 0
```

---

## 6. 대조 — 새 CLI vs 기준

```bash
node harness/compare-baseline.mjs fixtures/baseline <새-판정-디렉터리>
```

exit 0 = 갈림 없음 · 1 = 갈림 있음 · 2 = 사용·입력 오류. 디렉터리 대신 파일 하나씩 넣어
한 표면만 맞댈 수도 있다. `--json`은 기계가 읽는 형태로 낸다.

새 CLI는 §4의 형식 그대로 판정을 내놓으면 된다. **갈림 0이 「판정 diff 0」의 기계
정의다.** 갈림이 나오면 어느 쪽이 옳은지 근거를 남기고 `DIVERGENCES.md`에 등재한다 —
**등재되지 않은 차이는 결함이다.**

---

## 7. 코퍼스를 고친 뒤에는

픽스처를 고치면 기준이 낡는다. 순서는 이렇다:

1. 픽스처 수정
2. `record-baseline.mjs` 재실행 (구 vsp가 아직 있을 때만 가능 — **은퇴 뒤에는 불가**)
3. `derive-measured-hits.mjs`로 대장의 실측 기록 갱신
4. `check-baseline-coverage.mjs` · `test-compare-baseline.mjs` 통과 확인

구 vsp가 은퇴한 뒤에 코퍼스를 늘리면 그 파일에는 **구 판정 기준이 존재할 수 없다.**
그때는 새 검사기의 판정을 기준으로 삼되, 그 사실을 `DIVERGENCES.md`에 명시해 구 vsp에서
온 칸과 구분해야 한다.

---

## 8. 구 vsp에서 관찰된 이상 동작 — 고치지 않고 기록만 한다

전부 실행으로 확인한 것이다. 새 검사기가 이것들을 **승계할지 고칠지는 별도 판단**이고,
어느 쪽이든 `DIVERGENCES.md` 등재 대상이다.

1. **`lint --stdin` · `parse --stdin`이 Windows에서 동작하지 않는다.**
   `readStdin()`이 `os.ReadFile("/dev/stdin")`이다. `lint`는 오류로 죽지만(exit 1),
   `parse`는 오류를 버려서 **빈 결과를 exit 0으로 돌려준다.**
2. **`parse --format json`에 이스케이프가 없다** (§2). 토큰에 `"`가 있으면 깨진 JSON.
3. **`parse --format summary`의 출력 순서가 실행마다 바뀐다** (Go map 순회).
4. **`AnalyzeABAPCode`는 `object_type`/`object_name`(snake_case)만 읽는다.** D-049 훅은
   `objectType`/`objectName`(camelCase)로 보내므로 그 두 값은 **한 번도 도달하지
   않는다.** 판정에는 영향이 없고(`source`만 쓰인다) 결과의 `objectName` 라벨만 빈다.
5. **`preferred_compare_operator`의 `Check`는 사문이다.** 규칙은 If·ElseIf·While·Check
   문장 안을 보지만 `Check` 유형을 만드는 매처가 없다. 실측: 코퍼스 문장 1050건 중
   `Check` 0건이고, `CHECK lv_a EQ 1.`은 `Move`로 분류된다.
6. **`local_variable_names`의 FIELD-SYMBOLS 판정이 항상 울린다.** 이름을 `Tokens[2]`에서
   읽는데 그 자리는 늘 `SYMBOLS`다. 그래서 규약에 맞는 `<lv_row>`도 위반으로 잡힌다.
7. **analyze 구성의 `local_variable_names`는 빈 패턴이라 실질 무동작이다** — 등록은 되어
   있으나 한 건도 내지 않는다(실측 0건).
8. **`line_length`는 파일당 10건에서 조기 중단한다** (`rules.go`의 `len(issues) >= 10`).
9. **`lint`의 exit 계약은 심각도 기준이다** — Error가 하나라도 있으면 1, Warning만이면
   0. 실측: 코퍼스 47파일 중 exit 1은 `empty_statement_pos` ·
   `max_one_statement_pos` · `preferred_compare_operator_pos` 세 건뿐이다.
