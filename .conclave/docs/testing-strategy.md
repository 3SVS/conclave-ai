# Testing Strategy

## 원칙

이 기능은 AI 판단이 포함되므로 모든 결과를 deterministic하게 테스트하기 어렵다. 대신 다음을 테스트한다.

1. 상태 모델이 안정적인지
2. 사용자용 용어가 올바른지
3. 질문 생성 결과가 schema를 만족하는지
4. 고쳐보기 loop가 무한 반복되지 않는지
5. 실패/확인 부족 상태가 안전하게 표현되는지
6. 기존 Conclave job과 연결할 수 있는 구조인지

## 테스트 대상

### Unit tests

- ProductIdea parser
- ClarifyingQuestion schema validation
- RequirementCard status transition
- CheckResult label mapping
- FixLoop attempt limit
- Builder Pack export format

### Integration tests

- raw idea → understood summary → question candidates
- answered questions → product spec draft
- product spec → requirement cards
- failed result → fix loop creation
- fix loop attempt 2회 초과 → needs_human 상태

### UI tests

- 사용자 화면에 금지된 개발자 용어가 직접 노출되지 않는지
- 핵심 상태 라벨이 한국어로 보이는지
- 질문 카드에 추천값과 이유가 있는지
- 안 맞음 항목에 고쳐보기 버튼이 있는지

### Manual checks

- 일반 사용자가 5분 안에 제품 설명서 초안을 만들 수 있는지
- 질문이 아이디어에 맞춤형으로 느껴지는지
- 확인 결과 화면을 보고 다음 행동을 이해할 수 있는지

## 금지할 테스트 방식

- 실제 API key를 사용하는 테스트
- 실제 사용자 데이터가 들어간 fixture
- 외부 LLM 응답을 그대로 snapshot으로 고정하는 테스트
- flaky browser test를 필수 CI gate로 만드는 것
