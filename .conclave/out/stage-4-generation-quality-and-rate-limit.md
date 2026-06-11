# Stage 4 완료 보고 — Generation Quality & Rate Limit

## Rate limit 구현 방식

**위치:** `apps/central-plane/src/routes/workspace.ts`

- **방식:** D1 기반 hourly window (IP hash × hour_utc)
- **Key:** `SHA-256("workspace::" + client_ip)` — raw IP 저장 없음
- **Window:** UTC hour 단위 (`2026-06-11T15` 형태)
- **로직:** 요청 전에 count 조회 → 초과 시 429 반환 → 성공 후 count 증가
- **비율 계산:** `secondsUntilNextHour()` → `Retry-After` 헤더 + 응답 body에 포함

**IP 추출 우선순위:** `cf-connecting-ip` → `x-forwarded-for` 첫 번째 홉 → `"unknown"` (dev fallback)

---

## 추가한 env

| 변수 | 위치 | 기본값 | 설명 |
|---|---|---|---|
| `WORKSPACE_GENERATION_LIMIT_PER_HOUR` | `src/env.ts` + wrangler vars | `20` | 시간당 최대 요청 수 |

wrangler.toml `[vars]` 또는 `wrangler secret put`으로 설정.

---

## Rate limit 초과 시 응답 shape

```
HTTP 429
Retry-After: <seconds>
Content-Type: application/json

{
  "ok": false,
  "error": "rate_limited",
  "message": "잠시 후 다시 시도해주세요. 제품 설명서 만들기 요청이 짧은 시간에 많이 발생했어요.",
  "retryAfterSeconds": 1847
}
```

**중요:** rate limit 시 mock fallback으로 대체하지 않습니다. 비용 보호 목적.

---

## Dashboard에서 429 표시 방식

`src/lib/workspace-api.ts`에서 3가지 실패를 구분:

| 실패 유형 | 동작 | 사용자 화면 |
|---|---|---|
| `rate_limited` (429) | 에러 반환, fallback 없음 | 황색 배너: "잠시 후 다시 시도해주세요..." |
| `network` (fetch 실패) | local mock fallback | "임시 초안" 배지 표시 |
| `server` (5xx/parse) | local mock fallback | "임시 초안" 배지 표시 |

rate limit 메시지는 Step 1과 Step 3 버튼 근처에 황색 배너로 표시. 에러처럼 무섭지 않게 안내만.

---

## 추가/수정한 파일 목록

### central-plane (신규)
```
migrations/0026_workspace_rate_limit.sql    — workspace_rate_limit 테이블
test/fixtures/workspace-ideas.mjs           — QA fixture (8개 아이디어)
test/workspace-quality.test.mjs             — 품질 최소 기준 테스트 (26개)
test/workspace-answers-reflection.test.mjs  — 답변 반영성 테스트 (5개)
```

### central-plane (수정)
```
src/env.ts                       — WORKSPACE_GENERATION_LIMIT_PER_HOUR 추가
src/workspace/generate.ts        — extractAnswerFlags() + answers-aware buildMockFallback()
src/routes/workspace.ts          — sha256Hex, getRateLimitCount, incrementRateLimitCount,
                                   hourly rate limit 로직 전체 추가
```

### dashboard (수정)
```
src/lib/workspace-api.ts         — rate_limited / network / server 3가지 분기 처리
src/app/projects/new/page.tsx    — rateLimitMsg state + 황색 배너 UI (Step 1, Step 3)
```

---

## QA fixture 목록 (test/fixtures/workspace-ideas.mjs)

| id | 아이디어 요약 | minItems |
|---|---|---|
| meeting-summary-linear | 회의 녹음 요약 + Linear | 6 |
| mentoring-scheduler | 멘토링 예약 플랫폼 | 5 |
| battery-safety-monitor | 전기차 배터리 모니터링 | 5 |
| local-class-booking | 동네 클래스 예약 앱 | 5 |
| b2b-quote-crm | B2B 견적 CRM | 5 |
| ai-blog-writer | AI 블로그 글쓰기 도구 | 5 |
| clinic-reminder | 병원 예약 리마인더 | 5 |
| startup-investor-match | 스타트업-투자자 매칭 | 5 |

---

## 품질 최소 기준 테스트 목록 (workspace-quality.test.mjs)

각 fixture(8개)마다:
1. **shape 검증** — `ok:true`, `source`, `understood`, `questions 3-6개`, 각 질문 4개 필드, `productSpec`, `items >= minItems`, 모든 item `status: "not_started"`
2. **banned terms 검사** — 9개 금지어(PRD, Requirement, Acceptance Criteria, Acceptance Matrix, FAIL, INCONCLUSIVE, NEEDS_DECISION, Autofix, Evidence) 사용자-facing 텍스트에 없는지 검증
3. **minItems count** — fixture별 최소 항목 수 충족 여부

추가 2개:
- meeting 아이디어 → 질문에 "확인" 또는 "Linear" 포함 여부
- 전체 fixture items 모두 `status: "not_started"` 확인

**총 26개 테스트**

---

## Answers 반영성 테스트 결과

| 테스트 | 결과 |
|---|---|
| 확인/자동 답변 → decisions 다름 | ✅ |
| 확인 답변 → req_006에 확인/선택 포함 | ✅ |
| 자동 답변 → req_006에 자동/실패/재시도 포함 | ✅ |
| A/B 답변 → req_006 title 다름 | ✅ |
| 답변 없음 → 기본값 확인 동작 | ✅ |

핵심 구현: `extractAnswerFlags(answers)` 함수가 답변 텍스트에서 의도 패턴을 감지해 `buildMockFallback()`의 spec/items 출력을 결정.

---

## 테스트 결과

```
node --test workspace-generate.test.mjs workspace-quality.test.mjs workspace-answers-reflection.test.mjs

tests: 37 pass, 0 fail ✅

typecheck: ✅
build (central-plane): ✅
build (dashboard): ✅
D1 migration 0026: 적용 완료 ✅
```

---

## Stage 5 전에 결정 필요한 점

1. **확인 결과 연결 방법**
   - 기존 Conclave review job (`/saas/review`)을 workspace item별로 실행할 것인가?
   - 아니면 workspace 전용 경량 check 엔드포인트를 만들 것인가?
   - 전자는 GitHub repo 연결 필수 / 후자는 repo 없이도 동작

2. **고쳐보기 루프 범위**
   - 자동 코드 수정 (autofix pipeline 연결)까지 할 것인가?
   - 아니면 "수정 제안 생성"까지만 할 것인가?

3. **workspace 데이터 DB 저장 시점**
   - 현재 localStorage만 사용 — Stage 5에서 D1 연결할지 결정 필요
   - migrations 0027-0029 (workspaces, ideas, specs, requirements, checks 테이블)
