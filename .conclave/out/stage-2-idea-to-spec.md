# Stage 2 완료 보고 — 아이디어 → 제품 설명서 흐름

## 구현한 화면 목록

| 화면 | Route | 설명 |
|---|---|---|
| 새 프로젝트 (4단계) | `/projects/new` | 아이디어 입력 → 이해한 내용 → 질문 → 설명서+항목 |
| 프로젝트 목록 | `/projects` | localStorage + static mock 합쳐서 표시 |
| 프로젝트 개요 | `/projects/[id]` | 완성도 + stats + 항목 미리보기 |
| 제품 설명서 | `/projects/[id]/spec` | localStorage/static 통합 읽기 |
| 꼭 들어가야 할 것 | `/projects/[id]/items` | 완성 기준 포함 카드 목록 |

## 생성/수정한 파일 목록

### 신규
```
src/lib/workflow-store.ts       — localStorage 기반 상태 관리
src/lib/mock-generators.ts      — mock 데이터 생성기 (이해/질문/설명서/항목)
src/components/MockUserBadge.tsx — 사이드바 하단 mock user 표시
src/components/QuestionCard.tsx  — 질문 카드 (추천 + 선택 버튼)
src/app/projects/new/page.tsx    — 4단계 멀티스텝 흐름 (Client Component)
```

### 수정
```
src/app/projects/page.tsx               — Client Component + localStorage 프로젝트 합산
src/app/projects/[id]/layout.tsx        — MockUserBadge 추가, notFound 제거
src/app/projects/[id]/spec/page.tsx     — Client Component, localStorage 우선 읽기
src/app/projects/[id]/items/page.tsx    — Client Component, 완성 기준 추가
```

## mock data 구조

`src/lib/workflow-store.ts`:
```typescript
WorkflowDraft = { ideaText, understanding, answers, spec, requirements }
```

`localStorage` keys:
- `conclave_wf_draft` — 진행 중 흐름 (현재 미사용, Stage 3에서 활용)
- `conclave_wf_projects` — 저장된 프로젝트 배열

## mock generator 위치

`src/lib/mock-generators.ts`

- `generateUnderstanding(idea)` → `Understanding`
- `generateQuestions(idea)` → `AdaptiveQuestion[]` (5개)
- `generateSpec(idea, answers)` → `GeneratedSpec`
- `generateRequirements(idea, answers)` → `RequirementItem[]` (8~9개)
- `ACCEPTANCE_CRITERIA` → 항목별 완성 기준 Record

"회의" / "녹음" / "linear" 키워드 감지 시 특화 응답, 그 외 일반 응답.

## mock user/session 위치

`src/components/MockUserBadge.tsx`

```typescript
const MOCK_USER = {
  name: "Seunghun Bae",
  workspace: "3SVS Workspace",
  authProvider: "github",
  githubConnected: false,
};
```

사이드바 하단에 표시. 실제 auth는 Stage 3+ 에서 구현.

## 사용자 흐름 (전체)

```
/projects                → 프로젝트 목록 (localStorage + static mock)
  → "+ 새 프로젝트"
/projects/new            → 4단계 흐름
  Step 1: 아이디어 입력 textarea + 예시 버튼 3개 + "무료 베타" 안내
  Step 2: Conclave가 이해한 내용 (1.2초 mock delay)
    - 한 줄 요약
    - 주요 사용자 목록
    - 주요 흐름 목록
  Step 3: 맞춤 질문 5개
    - 각 질문: 추천 + 이유 + 선택 버튼 + 직접 입력
    - 답변 개수 실시간 표시
  Step 4: 제품 설명서 + 꼭 들어가야 할 것 미리보기
    - "저장하고 프로젝트 시작하기" → localStorage 저장 → /projects/:id

/projects/:id            → 개요 (localStorage 우선, static fallback)
/projects/:id/spec       → 제품 설명서
/projects/:id/items      → 꼭 들어가야 할 것 (완성 기준 포함)
```

## 아직 실제 API가 아닌 부분

| 기능 | 현재 | Stage에서 교체 |
|---|---|---|
| 아이디어 이해 | `generateUnderstanding()` mock | Stage 3: LLM API |
| 맞춤 질문 생성 | `generateQuestions()` mock | Stage 3: LLM API |
| 제품 설명서 생성 | `generateSpec()` mock | Stage 3~4: LLM API |
| 항목 생성 | `generateRequirements()` mock | Stage 4: LLM API |
| 데이터 저장 | localStorage | Stage 7: D1 DB |
| 사용자 인증 | mock user | Stage 3+: GitHub OAuth |

## Stage 3에서 LLM API로 교체해야 할 파일

1. `src/lib/mock-generators.ts` → `src/lib/generators.ts` (LLM 호출로 교체)
   - `generateUnderstanding()`, `generateQuestions()`, `generateSpec()`, `generateRequirements()` 전부
2. `apps/central-plane/src/routes/workspace.ts` 신규 생성
   - `POST /workspace/create`
   - `POST /workspace/:id/idea` → LLM 호출
   - `POST /workspace/:id/questions` → LLM 호출
3. `src/app/projects/new/page.tsx`
   - `handleGenerateUnderstanding()` → fetch('/workspace/:id/idea')로 교체
   - `handleGenerateSpec()` → fetch('/workspace/:id/spec')로 교체

## 결정 필요한 점

1. **Step 진행 중 이탈 시 복구**: 브라우저 닫으면 Step 1~4 진행 상태가 사라짐.
   → Stage 3에서 `conclave_wf_draft` localStorage를 활용해 복구 기능 추가 여부 결정 필요.

2. **질문 부분 답변 허용 여부**: 현재 일부만 답해도 "제품 설명서 만들기" 버튼이 활성화됨.
   → 강제 답변? 권장 답변만 필수? 결정 필요.

3. **완성 기준 항목 자동 생성**: 현재 `ACCEPTANCE_CRITERIA` 상수에 req_001~009만 정의됨.
   → LLM 기반 동적 생성은 Stage 4~5에서 구현.
