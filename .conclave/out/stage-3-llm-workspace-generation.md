# Stage 3 완료 보고 — LLM Workspace Generation

## 추가/수정한 파일 목록

### central-plane (신규)
```
src/workspace/generate.ts          — LLM wrapper + mock fallback
src/routes/workspace.ts            — POST /workspace/idea-to-spec-draft
test/workspace-generate.test.mjs   — 6개 테스트
```

### central-plane (수정)
```
src/router.ts                      — createWorkspaceRoutes() 마운트
```

### dashboard (신규)
```
src/lib/workspace-types.ts         — IdeaToSpecDraftResponse 타입 정의
src/lib/workspace-api.ts           — API client + local mock fallback
```

### dashboard (수정)
```
src/app/projects/new/page.tsx      — mock → API client 연결
```

---

## 추가한 endpoint

```
POST /workspace/idea-to-spec-draft
```

- **인증:** 없음 (무료 베타)
- **CORS:** localhost:3002, localhost:3000, *.conclave-ai.dev 허용
- **rate limit:** 없음 (Stage 4에서 추가 예정)

---

## Request / Response shape

### Request
```typescript
{
  idea: string;                    // 필수. 최대 1000자
  mode?: "quick" | "standard" | "thorough";  // 기본: "standard"
  answers?: Array<{ questionId: string; answer: string }>;
  locale?: "ko" | "en";           // 기본: "ko"
}
```

### Response (항상 HTTP 200)
```typescript
{
  ok: true,
  source: "llm" | "mock-fallback",   // 어디서 왔는지 투명하게 표시
  understood: { summary, targetUsers, mainFlow },
  questions: [{ id, question, recommendation, reason, options, allowCustom, allowLater }],
  productSpec: { productName, oneLine, targetUsers, problem, included, excluded, userFlow, decisions, openQuestions },
  items: [{ id, title, status: "not_started", criteria }],
  warnings?: string[]
}
```

---

## LLM provider / env 설정

| 변수 | 위치 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | central-plane Worker secret | 이미 설정됨 (review pipeline 공유) |
| `NEXT_PUBLIC_CENTRAL_PLANE_URL` | dashboard `.env.local` | 로컬 개발 시 `http://localhost:8787` |

로컬 개발 설정:
```bash
# apps/dashboard/.env.local
NEXT_PUBLIC_CENTRAL_PLANE_URL=http://localhost:8787
```

모델: `claude-haiku-4-5-20251001` (빠르고 저렴, workspace 생성에 충분)
타임아웃: 20초

---

## Fallback 동작 방식

```
ANTHROPIC_API_KEY 없음 → mock-fallback
LLM 타임아웃/네트워크 오류 → mock-fallback
LLM이 JSON이 아닌 텍스트 반환 → mock-fallback
JSON parse 실패 → mock-fallback
shape 검증 실패 (items < 3) → mock-fallback
빈 idea 입력 → mock-fallback (warnings 포함)

대시보드에서 API 호출 실패 → local mock-generators.ts로 fallback
```

fallback 시 `source: "mock-fallback"` + `warnings` 필드로 표시.
사용자에게는 "임시 초안" 배지와 안내 문구로 조용히 알림.

---

## dashboard에서 mock → LLM 연결 위치

| 단계 | 이전 (Stage 2) | 이후 (Stage 3) |
|---|---|---|
| Step 1 → Step 2 | `sleep(1200) + generateUnderstanding()` | `callWorkspaceApi({ idea })` → central-plane |
| Step 3 → Step 4 | `sleep(1000) + generateSpec()` | `callWorkspaceApi({ idea, answers })` → central-plane |

`src/lib/mock-generators.ts`는 삭제하지 않고 `workspace-api.ts`의 로컬 fallback으로 유지됨.

---

## 테스트 결과

```
node --test test/workspace-generate.test.mjs

✔ returns mock-fallback when no API key provided
✔ returns mock-fallback for meeting idea without API key
✔ returns mock-fallback for generic idea without API key
✔ handles empty idea gracefully
✔ returns mock-fallback when Anthropic returns non-JSON
✔ items all have status not_started

tests: 6 pass, 0 fail
```

빌드:
```
central-plane: typecheck ✅  build ✅
dashboard:     typecheck ✅  build ✅
```

---

## 아직 production-ready가 아닌 부분

| 항목 | 현황 | 대응 Stage |
|---|---|---|
| 인증 없음 | 누구나 /workspace/idea-to-spec-draft 호출 가능 | Stage 7 (auth 연결 시) |
| rate limit 없음 | IP당 호출 제한 없음 | Stage 4 |
| workspace data DB 저장 없음 | localStorage에만 저장 | Stage 7 |
| answers 기반 spec 재생성 | 질문 답변 전달은 되나 LLM이 잘 반영하는지 미검증 | 수동 QA 필요 |
| 한국어 quality 미검증 | LLM 응답 quality 보장 없음 | prompt 튜닝 필요 |

---

## Stage 4에서 이어서 할 일

1. **꼭 들어가야 할 항목 카드 강화**
   - LLM이 반환한 `items[].criteria`를 완성 기준 UI에 직접 연결
   - criteria 없는 항목에 자동 생성 trigger 추가

2. **답변 기반 spec 재생성 검증**
   - 질문 답변 5개를 전달했을 때 spec/items가 실제로 달라지는지 QA

3. **workspace DB 스키마 설계**
   - `workspaces`, `ideas`, `questions`, `specs`, `requirement_cards` 테이블
   - 현재 localStorage → D1 마이그레이션 경로

4. **rate limit**
   - `/workspace/idea-to-spec-draft` IP당 10회/일 제한 (demo endpoint 패턴 참고)
