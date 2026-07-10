# tool-catalog — 연결 실측 기준 (2026-07-11 재생성)

카탈로그 4파일은 **연결 상태(프로파일 활성) tools/list 실측 186종** 기준으로
재생성됨 (번들 4.13.0, launch.cjs 경유, read 90 / write 79 / runtime 15 /
prompt-gated 2). 카탈로그↔live diff 0 확인. 구 이식본(read 81/write 76,
`mcp__plugin_sc4sap_sap__` 풀네임)은 bare capability name으로 전환 —
하네스별 식별자 매핑은 [core/vocabulary.md](../../core/vocabulary.md)가 정본.

- **권한 템플릿의 정본은 여전히 live tools/list** — `scripts/gen-permissions.mjs`가
  서버를 직접 기동해 생성한다. 카탈로그는 도구의 **분류(read/write/runtime) 참고**
  및 어댑터 노출 프리셋의 원천으로 사용한다.
- 서버 번들 갱신 시 `server/UPDATE-RUNBOOK.md` step 3(capability diff)에 따라
  이 카탈로그를 함께 재생성한다.

## 재생성 방법 (연결 상태 실측)

1. 프로파일 활성 상태 확인: 레포 루트 `.sc4sap/active-profile.txt` + 해당
   프로파일 `sap.env` (DEV tier).
2. **`server/launch.cjs`를 spawn** (cwd=레포 루트) → `initialize` →
   `tools/list` — 각 tool의 name(+description의 `[read-only]`/`[runtime]` 마커)
   수집. `scripts/smoke-mcp.mjs`의 stdio 왕복 코드를 본뜨면 된다.
3. 이름 접두어로 분류(Get/Read/Check·List·Search·Describe·Grep → read,
   Create/Update/Delete/Activate/Patch/Release/Write → write, Runtime·RunUnitTest·
   ValidateServiceBinding·ReloadProfile → runtime), `GetTableContents`/`GetSqlQuery`
   2종은 섹션 파일에서 제외(인덱스의 제외 정책 절에만 기재).
4. 완료 기준: 섹션 파일 합집합 + gated 2종 == 연결 실측 tools 수, diff 0.

**함정**: 번들(server.bundle.cjs)을 직접 기동하면 inspection-only(155)로 잡힌다 —
프로그램/화면 계열 27종은 프로파일 활성 시에만 동적 노출. 반드시 launch.cjs 경유
+ 프로파일 활성 상태로 실측할 것 (2026-07-10 L3 E2E 실측, HANDOFF §4.1).
