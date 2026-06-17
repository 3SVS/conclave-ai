# Release Note — PR 확인 워크플로 (v0.14, Stage 33~49)

## Summary

이번 릴리즈에서는 **PR 확인 기록을 기준으로 남은 문제를 다시 확인하고, 개선 여부를 비교한 뒤, 그 결과를 PR comment로 공유**할 수 있게 했습니다. 한 PR을 여러 번 확인하면서 "무엇이 좋아졌고 무엇이 아직 남았는지"를 한눈에 추적하고, 수정 지시서(Fix Pack)까지 이어서 만들 수 있습니다.

자동으로 코드를 고치거나 commit/PR을 만들지는 않습니다. 사람이 검토하고 결정하는 흐름을 더 매끄럽게 만드는 데 집중했습니다.

---

## What changed

- **PR 확인 기록(History)**: 프로젝트의 모든 PR 코드 확인 이력을 최신순으로 보고, 각 확인의 결과·요약을 확인합니다.
- **확인 상세(Run detail)**: 특정 확인 기록의 항목별 결과를 보고, 그 기록 기준으로 다시 확인 / Fix Pack / PR comment를 만들 수 있습니다.
- **이번에 다룰 항목 선택**: 다시 확인·Fix Pack·PR comment가 **하나의 선택**을 공유합니다. 기본은 통과하지 않은 항목(안 맞음·확인 부족·결정 필요)이고, 직접 추가/제거할 수 있습니다. 고른 선택은 같은 기록에 한해 **브라우저에 기억**되어, 새로고침하거나 다시 들어와도 유지됩니다.
- **남은 문제 다시 확인**: 기록 목록에서 한 번의 클릭으로 "남은 문제만" 다시 확인합니다.
- **이전 확인 기록과 비교**: 다시 확인한 결과가 이전 기록과 어떻게 달라졌는지 **이전 상태 → 현재 상태**로 자동 표시합니다 (예: `안 맞음 → 통과`). 좋아진 항목 / 아직 남은 항목 / 새로 생긴 문제 / 변화 없음으로 나눠 보여줍니다.
- **남은 문제 Fix Pack**: 남은 문제 기준으로 Claude/Codex에게 줄 수정 지시서를 만들고, 복사할 수 있습니다.
- **비교 결과를 PR comment로**: 다시 확인으로 만들어진 기록에서는 비교 결과(상태 전환 + 다음 조치)를 PR comment로 바로 남길 수 있습니다.

---

## New user workflow

```
PR 확인 기록
→ 확인 상세 (선택 항목은 기억됨)
→ 남은 문제 다시 확인 (1-click)
→ 새 확인 기록에서 이전과 자동 비교 (이전 → 현재)
→ 남은 문제로 Fix Pack
→ 비교 결과를 PR comment로 공유
```

처음 사용자는 GitHub 연결 → PR 연결 → 코드 확인 실행 후, 위 흐름을 그대로 따라갈 수 있습니다.

---

## Admin / ops notes

- **central-plane**(Cloudflare Worker)는 `apps/central-plane/**` 변경이 main에 들어가면 `deploy-central-plane.yml`로 자동 배포됩니다. 로컬 `pnpm ship`은 Containers의 Docker 요구로 사용하지 않습니다.
- **dashboard**(Vercel)는 Git 연동으로 배포되며, 라이브 최종 확인은 Vercel 자격증명이 필요합니다. `NEXT_PUBLIC_CENTRAL_PLANE_URL` 미설정 시 코드 fallback이 production worker를 가리킵니다. (`NEXT_PUBLIC_*`는 빌드 타임 인라인 → env 변경 후 redeploy 필요.)
- D1 migrations 0036~0039 적용 완료. 모두 additive(컬럼/테이블 추가).
- admin 페이지: `/admin/credits`(설정·rollout·정리), `/admin/usage`(사용량) — admin key 필요.

---

## Safety notes

- **실제 크레딧 차감·차단은 production에서 OFF**입니다.
  - `ENABLE_ACTUAL_CREDIT_DEBITS = "false"`, `ENABLE_CREDIT_BLOCKING = "false"`, `ACTUAL_DEBIT_ALLOWED_USER_KEYS = ""`
  - 코드 기본값도 안전: 환경변수가 `"true"`일 때만 활성화됩니다.
- 이 릴리즈는 **코드를 자동으로 고치지 않습니다**. patch/commit/branch/PR을 만들지 않으며, GitHub status check도 작성하지 않습니다.
- private repo 전체 지원은 포함하지 않습니다.

---

## Known limitations

- 선택 항목 기억은 **이 브라우저에만** 저장됩니다 (다른 기기/브라우저에서는 복원되지 않음).
- `?fromRunId`로 화면에 표시된 비교는 그 자체로는 PR comment에 포함할 수 없습니다. PR comment 비교는 **"다시 확인"으로 생성된 기록(lineage)**에서만 지원됩니다.
- dashboard 라이브 최종 확인에는 Vercel 자격증명이 필요합니다.

---

## Next

- 실제 PR로 end-to-end 1회 확인(베타 사용자 테스트).
- (검토 중) 다른 기기에서도 선택이 유지되도록 서버 저장, `?fromRunId` 비교도 PR comment에 포함하도록 backend 확장.

자세한 운영 체크리스트·수동 QA·롤백 노트는 `stage-50-release-checkpoint.md`를 참고하세요.
