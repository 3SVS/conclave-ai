# Stage 1 완료 보고 — Dashboard 앱 뼈대

## 1. dashboard 앱 위치

`apps/dashboard/` — 독립 Next.js 15 앱 (포트 3002)

기존 `apps/landing/` (포트 3001, 마케팅)과 완전 분리.

## 2. 생성/수정한 파일 목록

### 신규 생성
```
apps/dashboard/
  package.json
  tsconfig.json
  next.config.ts
  tailwind.config.ts
  postcss.config.mjs
  .eslintrc.json
  src/
    app/
      globals.css
      layout.tsx                          ← 루트 레이아웃
      page.tsx                            ← / → /projects 리다이렉트
      projects/
        page.tsx                          ← 프로젝트 목록
        [id]/
          layout.tsx                      ← 사이드바 + 헤더 공통 레이아웃
          page.tsx                        ← 프로젝트 개요
          idea/page.tsx                   ← 아이디어
          spec/page.tsx                   ← 제품 설명서
          items/page.tsx                  ← 꼭 들어가야 할 것
          checks/page.tsx                 ← 확인 결과
          fixes/page.tsx                  ← 고쳐야 할 것
    lib/
      labels.ts                           ← 용어 매핑 + 상태 컬러
      mock-data.ts                        ← mock 프로젝트 데이터
    components/
      StatusBadge.tsx                     ← 상태 뱃지 (통과/안 맞음 등)
      StatCard.tsx                        ← 숫자 요약 카드
      SpecCompleteness.tsx                ← 완성도 프로그레스 바

.conclave/
  docs/repo-findings.md                  ← Stage 0 탐색 결과
  out/stage-1-dashboard-plan.md          ← 이 파일
```

## 3. Route 구조

| Route | 화면 | 설명 |
|---|---|---|
| `/` | → `/projects` | 리다이렉트 |
| `/projects` | 프로젝트 목록 | mock 프로젝트 카드 목록 |
| `/projects/:id` | 프로젝트 개요 | 완성도 + 요약 stats + 항목 미리보기 |
| `/projects/:id/idea` | 아이디어 | 입력 아이디어 + Conclave 이해 내용 |
| `/projects/:id/spec` | 제품 설명서 | 목표/포함/제외/결정 필요 |
| `/projects/:id/items` | 꼭 들어가야 할 것 | 항목별 상태 + 확인 근거 |
| `/projects/:id/checks` | 확인 결과 | stats + 항목별 확인 결과 |
| `/projects/:id/fixes` | 고쳐야 할 것 | 안 맞음/확인 부족/결정 필요 항목 + 조치 버튼 |

## 4. 사용자용 용어 체계

`src/lib/labels.ts` 에 정의됨.

| 내부 코드 | 화면 표시 | 색상 |
|---|---|---|
| `passed` | 통과 | 초록 |
| `failed` | 안 맞음 | 빨강 |
| `inconclusive` | 확인 부족 | 노랑/황색 |
| `needs_decision` | 결정 필요 | 보라 |
| `not_started` | 시작 전 | 회색 |
| `building` | 만드는 중 | 파랑 |

`TERM_MAP` 상수에 PRD→제품 설명서 등 전체 매핑 포함.

## 5. mock data 위치

`src/lib/mock-data.ts`

mock 프로젝트: **회의록 자동 요약 앱** (`proj_mjx1`)
- 제품 설명서 완성도: 72%
- 꼭 들어가야 할 항목 6개 (통과 2, 안 맞음 1, 확인 부족 1, 결정 필요 1, 시작 전 1)
- 각 항목에 확인 근거, 제안된 조치 포함

## 6. 실행 방법

```bash
pnpm dev --filter @conclave-ai/dashboard
# → http://localhost:3002
```

또는 루트에서:
```bash
pnpm turbo run dev --filter @conclave-ai/dashboard
```

## 7. Stage 2에서 바로 이어갈 작업

### 반드시 결정 필요 (Stage 2 시작 전)
- **인증**: 웹 대시보드 로그인 방식 결정 (GitHub OAuth 웹 플로우 권장)
- **요금**: workspace credit 단위 설계 (아이디어/질문 무료, 확인 job만 유료?)

### Stage 2 구현 목록
1. `apps/central-plane/src/routes/workspace.ts` 신규 파일 — `POST /workspace/create`, `POST /workspace/:id/idea`
2. `packages/core/src/idea-engine.ts` — Haiku로 아이디어 → 요약 변환
3. D1 migration 0026 — `workspaces`, `ideas` 테이블
4. `apps/dashboard/src/app/projects/new/page.tsx` — 아이디어 입력 폼 (실제 API 연결)
5. `apps/dashboard/src/app/projects/[id]/idea/page.tsx` — 실제 데이터 렌더링으로 교체

## 8. 빌드 결과

```
typecheck: ✅ 통과
build:     ✅ 통과 (7개 라우트 생성)
lint:      ✅ 경고/에러 없음
```
