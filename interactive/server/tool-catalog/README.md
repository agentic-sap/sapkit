# tool-catalog — 등록점에서 생성되는 기계 생성물

이 디렉터리의 네 파일은 **손으로 고치는 문서가 아니다.**

| 파일 | 내용 |
|---|---|
| [sapkit-mcp-tools.md](sapkit-mcp-tools.md) | 인덱스 — 갈래별 계수 · prompt-gated 2종 · 와일드카드 금지 |
| [sapkit-mcp-tools-read.md](sapkit-mcp-tools-read.md) | Get\* / Read\* / Check\*·List\*·Search\*·Describe\*·Grep\* |
| [sapkit-mcp-tools-write.md](sapkit-mcp-tools-write.md) | Create\* / Update\* / Delete\* / Activate\*·Patch\*·Release\*·Write\* |
| [sapkit-mcp-tools-runtime.md](sapkit-mcp-tools-runtime.md) | Runtime\* / 실행·검증 / 세션 제어 |

생성기는 `sapkit-engine/harness/render-tool-catalog.mjs`이고, 입력은 **엔진의 도구
등록점**(`sapkit-engine/src/tools/registry.ts`) 하나뿐이다. 각 파일 머리에 붙은
`GENERATED FILE` 주석이 그 사실을 파일 안에서도 밝힌다.

## 손으로 고치면 게이트가 거부한다

`sapkit-engine`의 `npm run gates`가 도는 **「카탈로그」 게이트**
(`sapkit-engine/gates/catalog.mjs`)가 「생성 결과 == 커밋된 파일」 넷을 잰다.
어긋나면 첫 어긋난 행을 짚고 실패한다. CI(`offline-gates.yml`의 `sapkit-engine`
잡)가 매 푸시·PR마다 같은 게이트를 돌리므로, 카탈로그가 낡은 채 초록으로 남을 수
없다. 게이트가 정말 거부하는지는 `sapkit-engine/gates/test-gates.mjs`가 잰다.

`sapkit-cli/fixtures/baseline/`이나 `harness/old-surface/`의 채록본과는 지위가
다르다 — 저쪽은 **다시 뜰 수 없는 기준**이지만 이 카탈로그는 언제든 재생성된다.

## 재생성

```
cd sapkit-engine && npm run build && node harness/render-tool-catalog.mjs
```

`node harness/render-tool-catalog.mjs --check`가 같은 대조를 사람 손으로 한 번 더
할 수 있는 입구다(어긋나면 exit 1). 도구를 하나 지으면 등록점이 바뀌므로 이 재생성은
`sapkit-engine/ADDING-A-TOOL.md`가 말하는 **한 커밋** 안에 함께 들어간다.

## 왜 등록점이지 기동한 서버가 아닌가

번들을 띄워 `tools/list`로 카탈로그를 뜨는 길도 있다. 그러나 **그 표면은 프로파일
활성 여부에 따라 155/186으로 갈린다** — 프로그램·화면 계열은 프로파일이 있어야 동적
노출되기 때문이다. 등록점은 그 조건과 무관하게 전량을 정적으로 갖고 있으므로,
프로파일도 SAP 접속도 없는 CI에서 같은 답이 나온다. 「등록점 = 발행 표면」쪽은 표면
게이트(`sapkit-engine/gates/surface.mjs` §4.5-1)가 따로 못 박으므로, 두 게이트가
합쳐지면 「카탈로그 = 등록점 = 실제 발행」이 된다.

## 읽는 쪽

- **어댑터 노출 프리셋** (Codex `--exposition`)
- **권한 정책 분류** — [verification-policy](../../core/policies/verification-policy.md) ·
  [vocabulary](../../core/vocabulary.md)
- 표면 전체를 조작 갈래별로 훑어야 하는 절차

도구 이름은 **bare capability name**으로 적는다. 하네스별 식별자 매핑
(Claude Code의 `mcp__<plugin-namespace>__` 접두어 등)의 정본은
[core/vocabulary.md](../../core/vocabulary.md)다.

⚠ **권한 템플릿의 정본은 여전히 live `tools/list`다** — `scripts/gen-permissions.mjs`가
서버를 직접 기동해 만든다. 카탈로그를 권한 템플릿 대신 쓰지 말 것. 특히
`GetTableContents`·`GetSqlQuery` 2종은 호출마다 사람 승인을 받는 도구라 **섹션 파일에
일부러 없다**(인덱스에만 이름과 이유가 남는다). 섹션 목록을 그대로 붙여 쓰는 소비자가
둘을 자동승인 대상으로 만들지 않게 하려는 것이다.

## 역사 — 「연결 실측」 시절

2026-08-22까지 이 파일은 다른 절차를 설명했다: 프로파일을 활성화하고
`server/launch.cjs`를 spawn해 `tools/list`를 실측한 뒤 손으로 옮겨 적으라는 것이었고,
「번들을 직접 띄우면 155로 잡히니 반드시 launch.cjs 경유로」라는 함정 경고가 붙어
있었다. 그 함정은 실재했지만(2026-07-10 L3 E2E 실측), 정작 **옮겨 적은 결과가 맞는지
재는 게이트가 없어** 카탈로그는 조용히 낡을 수 있는 문서였다 — 판6.1부터 이월돼 온
자리다. 지금은 입력을 프로파일에 좌우되지 않는 등록점으로 옮겨 그 함정 자체를
없앴고, 생성과 대조를 같은 코드가 맡는다.
