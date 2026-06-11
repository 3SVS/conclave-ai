# Technical Architecture — Visual Workspace Extension

## 목적

기존 Conclave 엔진을 버리지 않고, 일반 유저용 시각적 작업공간을 앞단에 추가한다.

```text
Web/App Workspace
  ↓
Idea Understanding
  ↓
Adaptive Question Engine
  ↓
Product Spec Builder
  ↓
Requirement Card Model
  ↓
Builder Pack Export
  ↓
Existing Conclave review/audit/autofix jobs
  ↓
Check Results + Fix Loop
```

## 핵심 데이터 모델

### ProductIdea

사용자가 입력한 원본 아이디어와 Conclave가 이해한 내용을 담는다.

```ts
type ProductIdea = {
  id: string;
  projectId: string;
  rawText: string;
  understoodSummary: string;
  detectedCapabilities: string[];
  detectedIntegrations: string[];
  detectedSensitiveAreas: string[];
  createdAt: string;
  updatedAt: string;
};
```

### ClarifyingQuestion

아이디어에 맞춰 생성된 질문이다. 템플릿 질문이 아니라 raw idea에서 중요한 빈칸을 찾아 만든다.

```ts
type ClarifyingQuestion = {
  id: string;
  projectId: string;
  category:
    | 'scope'
    | 'user_flow'
    | 'data'
    | 'permission'
    | 'integration'
    | 'failure_case'
    | 'business_rule'
    | 'privacy'
    | 'launch_boundary';
  question: string;
  whyItMatters: string;
  recommendedAnswer?: string;
  options: Array<{
    id: string;
    label: string;
    value: string;
    tradeoff?: string;
  }>;
  priority: number;
  answer?: string;
  status: 'unanswered' | 'answered' | 'skipped' | 'deferred';
};
```

### ProductSpec

사용자에게는 “제품 설명서”로 보인다.

```ts
type ProductSpec = {
  id: string;
  projectId: string;
  goal: string;
  included: string[];
  excluded: string[];
  userFlows: string[];
  dataRules: string[];
  permissionRules: string[];
  failureRules: string[];
  openDecisions: string[];
  createdAt: string;
  updatedAt: string;
};
```

### RequirementCard

사용자에게는 “꼭 들어가야 할 항목”으로 보인다.

```ts
type RequirementCard = {
  id: string;
  projectId: string;
  title: string;
  plainText: string;
  source: 'idea' | 'question_answer' | 'product_spec' | 'manual';
  category:
    | 'feature'
    | 'validation'
    | 'permission'
    | 'data_boundary'
    | 'integration'
    | 'ui_state'
    | 'error_state'
    | 'agent_capability';
  priority: 'must' | 'should' | 'could';
  status:
    | 'not_started'
    | 'building'
    | 'implemented'
    | 'passed'
    | 'failed'
    | 'inconclusive'
    | 'needs_decision'
    | 'accepted_risk';
  acceptanceChecks: AcceptanceCheck[];
  lastResult?: CheckResult;
};
```

### AcceptanceCheck

사용자에게는 “확인 방법”으로 보인다.

```ts
type AcceptanceCheck = {
  id: string;
  requirementId: string;
  plainText: string;
  method:
    | 'manual_review'
    | 'static_scan'
    | 'api_probe'
    | 'ui_smoke'
    | 'unit_test'
    | 'integration_test'
    | 'existing_conclave_review';
  expectedEvidence: string;
};
```

### CheckResult

사용자에게는 “확인 결과”로 보인다.

```ts
type CheckResult = {
  id: string;
  requirementId: string;
  status: 'passed' | 'failed' | 'inconclusive' | 'needs_decision' | 'accepted_risk';
  userLabel: '통과' | '안 맞음' | '확인 부족' | '결정 필요' | '위험 감수';
  summary: string;
  evidence: Array<{
    kind: 'file' | 'test' | 'diff' | 'log' | 'screenshot' | 'review_comment' | 'user_answer';
    label: string;
    value: string;
  }>;
  suggestedNextActions: Array<'fix' | 'create_task' | 'edit_spec' | 'accept_risk' | 'ask_user'>;
  createdAt: string;
};
```

### FixLoop

안 맞음 또는 확인 부족 항목을 다시 고치는 흐름이다.

```ts
type FixLoop = {
  id: string;
  requirementId: string;
  sourceResultId: string;
  stage: 'spec_fix' | 'implementation_fix';
  attempt: number;
  maxAttempts: 2;
  status: 'draft_plan' | 'waiting_for_user' | 'running' | 'passed' | 'failed' | 'needs_human';
  plan: string;
  generatedBuilderPrompt?: string;
  linkedJobId?: string;
  rerunResultId?: string;
};
```

## 맞춤형 질문 생성 방식

질문은 다음 과정을 거친다.

```text
1. raw idea 이해
2. 제품 유형, 핵심 행동, 외부 연동, 민감 데이터 감지
3. 빈칸 후보 생성
4. 질문 후보 20~40개 생성
5. 중요도, 위험도, 답변 쉬움 기준으로 정렬
6. 선택한 모드에 따라 처음 3~5개 또는 8~12개만 표시
```

질문 생성은 LLM이 하되, 결과는 rule layer가 필터링한다.

좋은 질문 기준:

```text
- 답에 따라 결과물이 실제로 달라져야 함
- 사용자가 쉽게 답할 수 있어야 함
- 구현 범위, 데이터, 권한, 실패상황, 외부 연동 중 하나를 명확히 해야 함
- 추천값과 이유가 있어야 함
```

## 2단계 고쳐보기 루프

### Stage A — 제품 설명서 고치기

`결정 필요` 또는 `확인 부족`이 제품 정의의 애매함 때문에 발생한 경우.

예:

```text
확인 부족: 녹음 파일 보관 기간이 정해져 있지 않음
```

해결:

```text
사용자에게 보관 기간을 묻고 제품 설명서와 만들 항목을 업데이트한다.
```

### Stage B — 결과물 고치기

`안 맞음`이 구현 결과 때문에 발생한 경우.

예:

```text
안 맞음: Linear 전송 전 확인 단계가 없음
```

해결:

```text
수정 계획 생성 → 사용자 승인 → patch 또는 작업 지시 생성 → 다시 확인
```

## 기존 Conclave와 연결

초기 구현에서는 기존 CLI/job을 직접 실행하지 않아도 된다. 하지만 데이터 모델은 나중에 다음과 연결될 수 있어야 한다.

```text
conclave audit
conclave review
conclave autofix
/saas/review
/saas/autofix
existing GitHub PR checks
existing central-plane job model
```

## 구현 우선순위

1. UI 언어와 상태 모델
2. raw idea 입력과 이해 결과 화면
3. 맞춤형 질문 생성 skeleton
4. 제품 설명서 생성
5. 꼭 들어가야 할 항목 카드
6. 확인 결과 상태 표시
7. 고쳐보기 loop skeleton
8. Builder Pack export
9. 기존 job 연결
