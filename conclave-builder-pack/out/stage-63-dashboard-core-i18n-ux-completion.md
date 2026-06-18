# Stage 63 — Dashboard 깊은 화면 i18n / copy / UX (pass 1)

베타 사용자가 밟는 dashboard 깊은 화면의 남은 한글 본문을 dict화하고 브랜드(옥스블러드/파치먼트, Linear) 스타일로 정리. 새 기능/엔드포인트/마이그레이션 없음.

> 디자인 방향: 현재 브랜드 = **옥스블러드/골드/파치먼트**(브랜드 사이트 기준). 스펙 문구의 "deep green"은 이전 단계 표현 — 현재 토큰 유지.

커밋: `c939386` (pass 1).

---

## 1. 변경한 주요 화면 (pass 1)
- `/projects/:id/spec` — **Product brief** + review note, 내부 dev 노트 제거, `.card`.
- `/projects/:id/items` — **Acceptance items** + "Each item describes what the PR must satisfy", priority 라벨 i18n, criteria/evidence, 브랜드 CTA.
- `/projects/:id/fixes` — **Fix instructions**(autofix 아님): empty/all-passed/Create fix instructions/Get decision help/Re-run/expand·collapse + suggestion 패널(summary/tasks/done-when/do-not).

## 2. i18n coverage (추가)
- dict 신규 네임스페이스: `spec`/`items`/`priority`/`fixesScreen` (EN+KO, .d.mts 동기). key-parity 테스트로 누락 방지.
- 누적 완료: 헤더/사이드바(리스트·검색·collapse·프로필)/projects홈/settings(GitHub)/개요/아이디어/New project/**spec/items/fixes** + 백엔드 생성 콘텐츠(영어 기본).

## 3. 변경한 copy / terms
- Product brief · Acceptance items · Acceptance criteria · **Fix instructions**(Fix Pack/고쳐보기 폐기) · priority(Must/Should/Could).
- 상태 라벨은 기존 유지(Passed/Issue found/Not verified/Needs decision).

## 4. visual polish
- `.card`/`.btn-primary|secondary`/`.page-title`/`.page-subtitle` 적용, indigo 잔재 → brand(옥스블러드) 자동, 일관 spacing/hierarchy.

## 5. EN/KO toggle 확인
- 신규 키 en/ko parity 테스트 통과. spec/items/fixes 본문이 토글로 전환됨(배포 후 라이브 확인 예정).

## 6. known issues (남은 화면 — pass 2)
- `/projects/:id/checks`(389줄/48 한글) · `/projects/:id/github` 깊은 패널(run review/credit 배너/result/comment/fix instructions) · `/projects/:id/github/history` · `.../history/:runId`(run detail) · settings **Telegram** 섹션 · admin.
- 기존 프로젝트의 한글 저장 데이터(생성 시점 언어). 새 프로젝트는 영문 생성.

## 7. 수정한 파일 / 커밋
- `app/projects/[id]/{spec,items,fixes}/page.tsx`, `i18n/dictionary.mjs`·`.d.mts` → `c939386`.

## 8. test / typecheck / build
- dashboard 77/77, i18n parity 10/10, typecheck 53/53, lint green.

## 9. live deployment / verification
- (배포 후 채움) Vercel 재배포 → spec/items/fixes EN 본문 + 토글 + 레이아웃 확인.

## 10. Stage 64 전 결정 필요한 점
1. **남은 깊은 화면 i18n(pass 2)**: checks → github 패널 → history/run detail → Telegram 순.
2. (운영) Vercel 토큰 revoke + Git 연결.
3. (선택) MCP npm 배포 / 실사용 베타.
