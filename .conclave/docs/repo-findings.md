# Stage 0 — 레포 탐색 결과

## 1. 현재 레포 구조 요약

**모노레포 (pnpm workspaces + Turbo)**

| 위치 | 역할 |
|---|---|
| `apps/landing/` | Next.js 15.5 공개 랜딩 (라우트: `/`, `/privacy`, `/terms`) — 대시보드 없음 |
| `apps/central-plane/` | Cloudflare Worker + D1 — SaaS 백엔드, webhook, job 관리 |
| `packages/core/` | Council, agents, memory, efficiency gate, scoring |
| `packages/cli/` | `conclave` 바이너리, review/autofix/audit/seed 명령어 |
| `packages/agent-{claude,openai,gemini,grok,ollama}` | Pluggable 에이전트 |
| `packages/scm-github/` | GitHub API, webhook 처리 |
| `packages/platform-*` | Vercel, Netlify, Railway, Cloudflare, Render 어댑터 |
| `packages/integration-*` | Telegram, Slack, Discord, Email |

---

## 2. 웹 UI 구현 후보 위치

**현황:** 인증 후 대시보드 없음. landing은 정적 마케팅 페이지.

| 옵션 | 경로 | 장점 | 단점 |
|---|---|---|---|
| **A (권장)** | `apps/landing/src/app/workspace/[id]/` | 배포 인프라 이미 존재, 빠른 프로토타입 | 랜딩과 앱 혼재 |
| B | `apps/dashboard/` (신규 앱) | 명확한 분리 | 새 배포 인프라 필요 |

→ **초기는 Option A**, Stage 6 이후 Option B로 분리 검토

---

## 3. API/job 구현 후보 위치

**기존 엔드포인트 (`apps/central-plane/src/routes/saas.ts`):**
- `POST /saas/review` — PR 리뷰
- `POST /saas/autofix` — autofix 실행
- `POST /internal/job-done` — 샌드박스 콜백

**새로 추가할 엔드포인트 (`apps/central-plane/src/routes/workspace.ts`):**
```
POST /workspace/create
POST /workspace/:id/idea
POST /workspace/:id/questions
POST /workspace/:id/spec
POST /workspace/:id/checks
POST /workspace/:id/autofix
GET  /workspace/:id
GET  /workspace/:id/export
```

---

## 4. 기존 Conclave 엔진 재사용 포인트

| 기능 | 파일 | 재사용 방법 |
|---|---|---|
| PRD 로딩 | `packages/cli/src/lib/project-context.ts` — `loadPrd()` | Stage 5에서 spec → PRD 변환 |
| Spec 카테고리 | `packages/agent-claude/src/prompts.ts` | `spec-missing/wrong/scope/ambiguous` 그대로 사용 |
| Autofix 파이프라인 | `packages/cli/src/autofix-pipeline.ts` | 고쳐보기 루프 (Stage 5) |
| Council | `packages/core/src/council.ts` | workspace-aware check 모드 |
| 효율성 게이트 | `packages/core/src/efficiency/` | 새 LLM 호출 라우팅 |
| Zod 스키마 | `packages/core/src/schema.ts` | BlockerSchema, ReviewResultSchema 재사용 |

---

## 5. 새로 만들어야 할 데이터 모델

D1 migration으로 추가할 테이블:

```sql
-- migration 0026
workspaces(id, user_id, status, created_at, updated_at)
ideas(id, workspace_id, raw_input, understood_summary, detected_capabilities JSON)

-- migration 0027
questions(id, workspace_id, category, question_text, why_it_matters,
          recommended_answer, options JSON, priority, answer, status)

-- migration 0028
product_specs(id, workspace_id, goal, included JSON, excluded JSON,
              user_flows JSON, open_decisions JSON, created_at)
requirement_cards(id, spec_id, workspace_id, title, plain_text,
                  source, category, priority, status)

-- migration 0029
check_results(id, requirement_id, status, user_label, summary,
              evidence JSON, suggested_actions JSON, created_at)
fix_loops(id, requirement_id, source_result_id, attempt, max_attempts,
          status, plan, linked_job_id, created_at)
```

---

## 6. Stage 1~7 구현 순서

```
Stage 1 (1~2일) — 사용자 언어 + 상태 모델
  수정: packages/core/src/schema.ts (ProductIdea, RequirementCard, CheckResult, FixLoop 타입)
  추가: apps/landing/src/lib/workspace-labels.ts (용어 매핑)
  산출물: 타입 정의 + 컴파일 통과

Stage 2 (3~4일) — 아이디어 입력 + 이해한 내용 화면
  추가: apps/central-plane/src/routes/workspace.ts
  추가: apps/landing/src/app/workspace/[id]/idea/page.tsx
  추가: packages/core/src/idea-engine.ts (Haiku → 요약)
  DB: migration 0026

Stage 3 (3~4일) — 맞춤 질문 생성 엔진
  추가: packages/core/src/question-engine.ts
  추가: apps/landing/src/app/workspace/[id]/questions/page.tsx
  DB: migration 0027

Stage 4 (2~3일) — 꼭 들어가야 할 항목 카드
  추가: packages/core/src/spec-engine.ts
  추가: apps/landing/src/app/workspace/[id]/requirements/page.tsx
  DB: migration 0028

Stage 5 (4~5일) — 확인 결과 + 고쳐보기 루프
  수정: packages/core/src/council.ts (workspace-aware)
  추가: apps/landing/src/app/workspace/[id]/results/page.tsx
  추가: apps/landing/src/app/workspace/[id]/fixes/page.tsx
  DB: migration 0029

Stage 6 (2~3일) — Builder Pack 내보내기
  추가: packages/core/src/builder-pack.ts
  추가: apps/landing/src/app/workspace/[id]/export/page.tsx

Stage 7 (3~4일) — 기존 Conclave job 연결
  수정: apps/central-plane/src/routes/saas.ts (workspace 파라미터)
  수정: packages/cli/src/autofix-pipeline.ts (workspace-aware 모드)
```

---

## 7. 위험한 부분

| 위험 | 수준 | 대책 |
|---|---|---|
| LLM 호출 폭증 (항목당 3~5 calls) | 높음 | 효율성 게이트 + credit 한도 명확화 |
| 상태 머신 복잡성 (7단계) | 높음 | Stage 1에서 상태 전이 명확히 정의 |
| D1 마이그레이션 순서 | 중간 | 로컬 테스트 먼저, 롤백 계획 |
| 웹 인증 UI 미구현 | 중간 | Stage 2에서 GitHub OAuth 웹 플로우 추가 |
| "자동 개발" 기대감 | 높음 | UX에 "수동 검증 필수" 명확히 표시 |

---

## 8. 결정 필요 (Stage 시작 전 Bae 확인 항목)

| # | 결정 | Stage 시작 전 |
|---|---|---|
| 1 | 웹 앱 위치: Option A (landing 확장) vs Option B (apps/dashboard 신규) | Stage 2 전 |
| 2 | 웹 로그인 방식: GitHub OAuth 웹 플로우? 이메일? | Stage 2 전 |
| 3 | 요금 모델: workspace 사용이 기존 review credit 소비하는가, 별도인가 | Stage 1 전 |
| 4 | Stage 5 "확인" 방식: 자동 테스트? 수동? PR 링크? | Stage 4 완료 후 |
| 5 | Stage 6 export 포맷: 마크다운? JSON? Claude Code 프롬프트? | Stage 4 완료 후 |
| 6 | 웹 workspace ↔ CLI 연계 여부 | Stage 6 완료 후 |
