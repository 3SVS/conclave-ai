# Awesome 리스트 등재 PR 팩

> 왜 이게 신규 계정 문제를 우회하나: awesome 리스트 머지 판단 기준은 **계정 나이/카르마가 아니라 항목이 리스트 범위에 맞고 형식을 지켰는가**다. 메인테이너는 PR 내용만 본다. 등재되면 영구 백링크 + GitHub 검색 유입 + 스타 유입이 누적된다.
>
> 형식 규칙(공통): 거의 모든 awesome 리스트는 `- [Name](link) - Description.` 형식, 문장 대문자, **마침표로 끝**, 과장/마케팅 어휘 금지. 알파벳/카테고리 순서 지킬 것. PR 전 각 리스트의 CONTRIBUTING.md 1분 확인.

## 등재용 표준 항목 (이 한 줄을 리스트마다 재사용)

```
- [Conclave AI](https://conclave-ai.dev) - Drop a PRD and every PR auto-reviews against your spec; catches scope drift and missing requirements that diff-only review misses. Three models, autofix worker, self-hostable (FSL).
```

짧은 변형(설명 칸이 좁은 리스트용):
```
- [Conclave AI](https://conclave-ai.dev) - PR review that checks your diff against your spec, not just for bugs. Catches scope drift automatically.
```

---

## 타깃 리스트 (우선순위 순)

### 1. kodustech/awesome-ai-code-review  ★ 1순위 — 범위 정확히 일치
- URL: https://github.com/kodustech/awesome-ai-code-review
- 섹션: AI Code Review agents/tools 목록
- 주의: kodus는 경쟁 코드리뷰 회사다. 경쟁사 PR을 받을 수도, 안 받을 수도 있음. 그래도 비용 0이니 시도. 거절돼도 손해 없음.

### 2. joho/awesome-code-review  ★ 2순위 — 중립·고권위(오래되고 유명)
- URL: https://github.com/joho/awesome-code-review
- 섹션: "Tools" 하위. 카테고리(예: Automated/AI review)에 알파벳 순으로 삽입.

### 3. ai-for-developers/awesome-ai-coding-tools
- URL: https://github.com/ai-for-developers/awesome-ai-coding-tools
- 섹션: Code review / PR 관련 카테고리. 없으면 가장 가까운 카테고리.

### 4. kodustech/awesome-code-review-tools
- URL: https://github.com/kodustech/awesome-code-review-tools
- 섹션: AI / automated review tools.

### 5. awesome-ai-agents-2026 (caramaschiHG 또는 ARUNAGIRINATHAN-K 포크 중 활성 쪽)
- URL: https://github.com/caramaschiHG/awesome-ai-agents-2026
- 섹션: Coding / DevTools agents. 범위가 넓어 들어가기 쉬움.

### (추가 후보 — 여유되면)
- sindresorhus/awesome 산하 awesome-devops / awesome-github 류에서 "code review" 항목 받는 리스트
- awesome-llmops 류 (LLM 운영 도구 목록)

---

## PR 제목 / 본문 템플릿 (리스트마다 복붙)

**PR 제목:**
```
Add Conclave AI (spec-first PR review — catches scope drift automatically)
```

**PR 본문:**
```
Adds Conclave AI to the <섹션명> section.

What it is: a GitHub App that reviews each PR against your spec, not
just the diff. Drop a .conclave/prd.md and it automatically flags
scope drift, missing requirements, and unauthorized changes — the code
that runs fine but isn't what you asked for. Three frontier models,
one verdict, autofix worker included. Learns from merge/reject outcomes.
Free on public repos, self-hostable (FSL).

- Site: https://conclave-ai.dev
- Repo: https://github.com/3SVS/conclave-ai
- GitHub App: https://github.com/apps/conclave-ai-code-council

I'm the author. Entry follows the list format (alphabetical, sentence
case, ends with a period). Happy to adjust placement or wording.
```

> author 디스클로즈는 꼭 넣기 — awesome 메인테이너는 self-submission을 허용하되 투명성을 본다.

---

## 실행 방법

브라우저로 직접: 각 리스트 repo → readme 편집(연필 아이콘) → fork에 커밋 → PR. 5개 합쳐 20분.
원하면 제가 Chrome으로 fork→edit→PR까지 대신 진행 가능(머지는 메인테이너 몫).
