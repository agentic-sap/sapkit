# Checker Bundle Runbook

동봉 ABAP 검사기 번들의 정체와 **재번들 절차**. 엔진 쪽
[server/UPDATE-RUNBOOK.md](../server/UPDATE-RUNBOOK.md)와 같은 성격의 문서이고,
규모만 훨씬 작다.

## 이 폴더의 것

| 파일 | 무엇 |
|---|---|
| `sapkit-checker.bundle.cjs` | 번들 본체 — CommonJS 단일 파일. 외부 의존 0(`node:fs`만 부른다) |
| `VERSION` | 사람이 쓰는 출처 — 버전·소스 커밋·빌드 방법·표면 |
| `integrity.json` | 기계가 쓰는 고정 — 번들 해시/크기 + 소스 내용 해시. `--refresh`가 만든다 |
| `.gitattributes` | 번들 `-text` (EOL 변환 = 해시 파손) |

**소스 정본은 레포 내 `sapkit-cli/`다.** 이 폴더의 번들은 산출물이므로 직접
편집하지 않는다 — 고칠 것이 있으면 `sapkit-cli/src`를 고치고 다시 만다.

## 왜 동봉하는가

동봉 전에는 오프라인 코드 분석이 돌려면 설치 때 vsp 바이너리를 **내려받아야**
했다. 번들을 함께 배포하면 그 단계가 사라져 **설치가 완전 오프라인**이 된다.
번들은 60KB 남짓이고 런타임 외부 의존이 0이라 설치 부담이 사실상 없다.

## 누가 쓰는가

- `adapters/claude/hooks/offline-code-analysis.mjs` (PostToolUse, 경고 전용) —
  `node <번들> analyze --stdin --format json`으로 띄운다. 번들이 없거나
  실패하면 **무음 통과**(fail-open)다. 이 훅은 차단하지 않으며, 구문·활성의
  권위는 여전히 서버 `CheckSyntax` + `core/procedures/verify-applied.md`다.
- 사람이 직접: `node interactive/checker/sapkit-checker.bundle.cjs --help`

## 재번들 절차

1. `sapkit-cli/src`를 고치고 그 레포의 검증을 통과시킨다
   (`cd sapkit-cli && npm run verify`, `npm run gates`).
2. 번들을 다시 만다 — 산출물이 이 폴더로 바로 쓰인다.

   ```bash
   cd sapkit-cli && npm run bundle
   ```

3. `VERSION`을 고친다 — `source commit`을 소스의 마지막 커밋으로 갱신하고,
   버전을 올렸다면 1행과 `sapkit-cli/package.json`을 함께 맞춘다.

   ```bash
   git log -1 --format=%H -- sapkit-cli/src
   ```

4. 재핀한다.

   ```bash
   node interactive/scripts/verify-checker.mjs --refresh
   ```

5. 게이트로 확인한다 — 소스·번들·핀이 어긋나면 여기서 걸린다.

   ```bash
   node interactive/scripts/verify-checker.mjs
   ```

6. 소스·번들·`VERSION`·`integrity.json`을 **한 커밋**으로 넣는다. 반쪽 상태로
   두면 배포되는 번들이 조용히 낡는다.

> `verify-checker.mjs`의 표류 판정은 **커밋 경계가 아니라 `sapkit-cli/src`의
> 내용 해시**로 잰다. 그래서 소스와 번들을 한 커밋에 담아도 거짓 경보가 나지
> 않고, 아직 커밋하지 않은 수리도 잡힌다.

## 게이트

```bash
node interactive/scripts/verify-checker.mjs   # 번들 무결성 + 소스 표류
```

검사 넷: ① 번들 바이트 ↔ `integrity.json` ② 버전 3자 일치(`sapkit-cli/package.json`
↔ `VERSION` ↔ `integrity.json`) ③ 기록된 소스 커밋이 실재하고 HEAD의 조상
④ 지금 `sapkit-cli/src`의 내용 해시가 번들을 말 때의 것과 같다.

`__tests__`는 소스 해시에서 뺀다 — 번들에 들어가지 않으므로 시험만 고친 변경이
재번들을 요구하면 거짓 경보다.
