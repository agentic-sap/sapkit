# sapkit / interactive (구 sc4sap-lite)

SAP ABAP 개발·컨설팅 지식/페르소나/절차를 **하네스 중립 코어 + 얇은 어댑터 3벌**
(Claude Code / Codex / Antigravity)로 제공하는 라이트 배포판 — sapkit 레포의 대화형 트랙 (`interactive/` = 플러그인 루트).
`sc4sap-custom`(Claude 전용 풀버전, 동결)의 전 자산을 이식하되 멀티에이전트
오케스트레이션을 버리고 "1명 작업 + 1명 새-컨텍스트 리뷰 + SAP 기계 검증" 모델로 단순화했다.

- **설계 정본**: [DESIGN.md](DESIGN.md) (2026-07-10 확정, Fable 5 + Codex 이중 리뷰 반영)
- **이식 기록**: [MIGRATION-MANIFEST.md](MIGRATION-MANIFEST.md) — 원본 전 파일 5분류. **은퇴한 역사 문서**(이식 완료 기록 · 이후 갱신 의무 없음) — 검증 게이트는 제거됐고 콘텐츠 무결성은 git 이력이 담당한다
- **상태**: L0~L5 구현 완료 + 코드리뷰 반영 — L3 E2E(플러그인 설치 + SAP 프로파일) 대기. Codex·Antigravity 설치 스모크 통과

## 빠른 시작

**Claude Code**

```
claude plugin marketplace add agentic-sap/sapkit
claude plugin install sapkit@agentic-sap
# 새 세션 또는 /reload-plugins
/sapkit:setup
```

**Codex**

```
codex plugin marketplace add agentic-sap/sapkit
codex plugin add sapkit@agentic-sap
# 새 세션
$sapkit:setup
```

MCP는 두 클라이언트 모두 플러그인에 동봉되어 자동 연결된다 — 수동 `codex mcp add`나
캐시 절대경로 입력은 필요 없다. 안전훅 6종은 기본 미설치이며 필요할 때만 켜는 선택
기능이다([adapters/claude/hooks/README.md](adapters/claude/hooks/README.md)). 상세 설계:
[DESIGN.md](DESIGN.md), `docs/reference/designs/2026-08-02-claude-onboarding-codex-parity-no-engine.md`.

## 구조 (목표)

```
core/        지식(모듈 14+BC·업종·국가·ABAP) · 페르소나 26 · 절차 · 정책 — 하네스 중립
server/      MCP 서버 번들 + keyring 런타임 + 도구 카탈로그 + SAP측 설치 자산
adapters/    claude/ codex/ antigravity/ — manifest·정책 매핑·설치물만 (콘텐츠 복제 없음)
scripts/     빌드·설치·검증 도구
```

라이선스: [MIT](LICENSE) (업스트림 `babamba2/superclaude-for-sap` 고지 승계) · [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)
