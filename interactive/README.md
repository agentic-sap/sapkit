# sc4sap-lite

SAP ABAP 개발·컨설팅 지식/페르소나/절차를 **하네스 중립 코어 + 얇은 어댑터 3벌**
(Claude Code / Codex / Antigravity)로 제공하는 라이트 배포판.
`sc4sap-custom`(Claude 전용 풀버전, 동결)의 전 자산을 이식하되 멀티에이전트
오케스트레이션을 버리고 "1명 작업 + 1명 새-컨텍스트 리뷰 + SAP 기계 검증" 모델로 단순화했다.

- **설계 정본**: [DESIGN.md](DESIGN.md) (2026-07-10 확정, Fable 5 + Codex 이중 리뷰 반영)
- **이식 규칙**: [MIGRATION-MANIFEST.md](MIGRATION-MANIFEST.md) — 원본 전 파일 5분류, `node scripts/check-migration-coverage.mjs`로 검증
- **상태**: L0~L5 구현 완료 + 코드리뷰 반영 — L3 E2E(플러그인 설치 + SAP 프로파일) 대기. Codex·Antigravity 설치 스모크 통과

## 구조 (목표)

```
core/        지식(모듈 14+BC·업종·국가·ABAP) · 페르소나 26 · 절차 · 정책 — 하네스 중립
server/      MCP 서버 번들 + keyring 런타임 + 도구 카탈로그 + SAP측 설치 자산
adapters/    claude/ codex/ antigravity/ — manifest·정책 매핑·설치물만 (콘텐츠 복제 없음)
scripts/     빌드·설치·검증 도구
```

라이선스: [MIT](LICENSE) (업스트림 `babamba2/superclaude-for-sap` 고지 승계) · [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)
