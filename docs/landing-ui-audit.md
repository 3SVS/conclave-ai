# Landing page UI/UX audit — 2026-05-11

Review of `apps/landing` (Next.js, conclave-ai.dev) against the project's
positioning + Bae's request "이게 최선의 UIUX 및 디자인인지 다시 검토".

## Verdict

**전반적으로 high-quality.** 17세기 broadsheet × judicial conclave 컨셉이
일관되게 잡혀있고 (parchment + oxblood + gold leaf, Bodoni Moda + Crimson
Pro + JetBrains Mono), 카피는 brand voice가 분명하며, evidence 섹션의
숫자(10.93 / 3.80 / 100% catch)는 honest figures 라는 단서까지 붙여
신뢰도를 챙겼습니다. SEO basics (title / description / OG / Twitter card)
도 다 들어가 있습니다.

다만 **잘 만든 디자인 위에 얹을 quick win** 이 몇 개 있고, **brand voice 자체가
한국 audience entry barrier 가 될 수 있는** 전략 결정이 한 개 있습니다.
이 audit 는 우선순위 + 임팩트로 분류해서 Bae 판단 받는 게 목적입니다.

---

## 🔴 High-leverage / quick wins

### 1. OG image 부재
`layout.tsx`의 `openGraph` 블록에 `images` 필드 없음. Twitter card 도
`summary` (small image) 임. 결과: SNS / Slack / Discord 에 링크 붙일 때
preview 가 텍스트만 나옴.

**제안**: `public/og.png` (1200×630) 추가 — parchment 배경 + 큰 wax seal +
"A council of AI agents convenes for every PR" 타이포. Next.js OG image
generation API (`@vercel/og`) 로 동적 생성도 가능.

**예상 효과**: 링크 공유 시 Click-through 1.5–2× (업계 평균).
**노력**: 30분.

### 2. Favicon 확인 필요
`layout.tsx:51` 에서 `/favicon.svg` 참조하지만 실제 파일 존재 여부 미확인.
없으면 브라우저 탭이 generic 으로 보임.

**제안**: `public/favicon.svg` 에 LogoIcon (3-dots-in-ring, oxblood) 저장.
이미 `Logo.tsx` 에 SVG 정의되어 있어 export 만 하면 됨.

**예상 효과**: 브랜드 일관성 / 탭 식별성.
**노력**: 5분.

### 3. JSON-LD 구조화 데이터 부재
`metadata` 에 `<script type="application/ld+json">` 없음. Google rich
result (소프트웨어 가격 / 평점 / 카테고리) 를 받지 못함.

**제안**: `SoftwareApplication` schema 추가 — name, applicationCategory
("DeveloperApplication"), offers (Free / Solo / Pro), aggregateRating
(beta 단계라 비워둠).

**예상 효과**: Google SERP 에 가격 + 카테고리 미리보기 노출.
**노력**: 15분.

---

## 🟡 Brand-strategy 결정 필요

### 4. Korean audience entry barrier
"Convene the council", "Indulgences", "Disquisitions", "Habemus consensum"
등 Latin / 17세기 영어 메타포가 brand voice 의 핵심. 영어 native 개발자에게는
distinctive 하지만, **Bae 의 경영 환경(3SVS K-Beauty SEA distribution)**
+ 한국 개발자 audience 에게는 친화도가 떨어질 가능성이 큼.

**선택지**:

(a) **Brand voice 유지, Korean entry 추가**:
   - `?lang=ko` switcher 또는 별도 `/ko` route
   - 핵심 카피 (hero + pricing) 를 한국어로 번역하되 Latin/Roman numeral
     은 Korean 면에서도 그대로 — "회의의 봉인" 같은 의역 가능
   - 노력: 큰 작업 (1–2일), but 전략적 가치 큼

(b) **Brand voice 톤 다운**:
   - Latin 문구 유지하되 plain English 보조 카피 추가
   - "Indulgences" → "Pricing", "Disquisitions" → "FAQ" 등 navigation
     은 직관적으로
   - 노력: 1–2시간

(c) **현재 그대로 유지** — 영어 native 개발자 / 글로벌 시장 우선이면
   현 brand voice 가 차별화 요소.

Bae 의 target audience 가 누구인지 (영어권 글로벌 개발자 vs 한국 K-개발자
vs 둘다) 에 따라 선택 달라집니다.

---

## 🟢 Polish (시간 있을 때)

### 5. Solo vs Pro 차별화 모호
Solo: "Telegram dispatches (premium)"
Pro:  "Telegram dispatches + priority sandbox"

"premium" 과 "priority sandbox" 가 정확히 무엇인지 카드에서 안 나옴.
구매 결정 직전에 "그래서 Pro 가 Solo 대비 뭐가 다른가?" 가 모호함.

**제안**: 카드 본문 또는 hover tooltip 에 한 줄씩 명시.
- premium = ?
- priority sandbox = "first slot in queue when load is high"

### 6. "Recommended" badge 위치
`PriceCard` 에서 `highlight=true` 인 Solo 카드에만 oxblood "recommended"
badge. 시각적으로 강력하지만 — Free 의 BYO unlimited 가 실제 가장 강력한
가치 제안인데 (무료 + unlimited) 강조가 없음. 첫 시각 이동이 Solo 로 가버림.

**제안 옵션**:
- Free 에 "Most popular for indie" 마크 추가
- 또는 Free 카드에 "BYO key — 무제한 무료" 강조 라벨

### 7. 5개의 Install CTA 가 conversion fatigue 가능성
TopBar (1) + Hero "Convene" (1) + Pricing cards (3) = 5개. 모두 같은 URL
(`/installations/new`). 첫 방문자에게 push 가 강함.

**제안**: TopBar 의 "Install →" 를 "Try the demo →" 로 (#try 앵커).
첫 conversion path 를 무료 데모 → 그 결과로 install — 으로 부드럽게.

### 8. Wax seal "C·AI" 텍스트가 screen reader 에 노출
`page.tsx:95` 의 wax seal 안 `<div>` 텍스트 "C·AI" 가 `aria-hidden` 안 걸려
있음. 시각 순수 장식인데 screen reader 가 "C dot AI" 라고 읽음.

**제안**: 부모 wax-seal div 에 `aria-hidden="true"` 추가.
**노력**: 30초.

### 9. 11px 마이크로 타입 색 대비 검증 필요
`section-mark` (mono 11px / `#7A685A` on `#F4ECDC` parchment) 의 contrast
ratio 미확인. WCAG AA 는 작은 텍스트 4.5:1 요구. 색만 봤을 때 보더라인.

**제안**: tools.cdotw.com 또는 axe DevTools 로 측정. 필요시 `--ink-mute`
색을 살짝 진하게.

### 10. Demo form 로딩 상태가 약함
"Reviewing…" 텍스트만 disabled 버튼에. 서버 호출이 30–60초 걸리면 사용자가
탭을 떠나기 쉬움.

**제안**: 진행 단계 표시 — "Fetching diff…" → "Council reading…" → "Writing
verdict…". WebSocket 또는 SSE 가 없으면 단순 timed transitions 로도 충분.

### 11. Footer "Sealed in Seoul" 위치
좋은 디테일이나 K-audience 에 대한 신호로도 활용 가능. 현재는 footer 카피
한 줄. Hero 또는 about 섹션에 "Built in Seoul · 3SVS" 식으로 한 번 더
노출하면 한국 개발자에게 신호 강화.

---

## ⚪ Out-of-scope / Long-term

### 12. About / team 페이지 부재
배종원 (CEO) + 배승훈 (Director, user) + Ohwook + Euihwan — 4명 팀.
"누가 만들었나" 가 신뢰 시그널인 단계인데 (open beta) 노출 0. 다음 sprint
후보.

### 13. Customer logos / case studies
Open beta 단계라 사용자 없을 수 있음. 첫 5개 사용자 확보되면 logo wall
추가하는 게 standard SaaS conversion 패턴.

### 14. Blog / changelog
72개 git tag 가 있는데 Releases 페이지는 비어있음 (외부 평가에서 지적
받은 항목과 동일). Release notes 자동 생성 + landing 의 footer 에서
링크 — 활성 프로젝트라는 신호로 작용.

### 15. Self-serve dashboard 부재
로그인 후 갈 곳이 없음 (CLI 가 dashboard). 다음 sprint 에 `/dashboard` 경로
+ recent reviews 보여주는 페이지 — 필요 시.

---

## Summary

| # | 제안 | 노력 | 임팩트 | 결정 |
|---|---|---|---|---|
| 1 | OG image | 30분 | High (SNS CTR) | |
| 2 | Favicon 확인 | 5분 | Med | |
| 3 | JSON-LD | 15분 | Med (SEO) | |
| 4 | Korean entry 전략 | 1h ~ 2일 | High (시장) | **전략 결정 필요** |
| 5 | Solo/Pro 차별화 | 15분 | Low-Med | |
| 6 | Free tier 강조 | 15분 | Med | |
| 7 | TopBar CTA 재배치 | 10분 | Med | |
| 8 | Wax seal aria-hidden | 30초 | Low (a11y) | |
| 9 | 11px contrast | 5분 | Low (a11y) | |
| 10 | Demo loading 단계 표시 | 30분 | Med | |
| 11 | "Built in Seoul" 위 노출 | 5분 | Low | |

**우선순위 추천**: 1 (OG image), 2 (Favicon), 8+9 (a11y 즉시 조치), 4
(Korean 전략 결정), 6 (Free tier 강조).

5–7, 10, 11 은 시간 여유 있을 때.

12–15 는 다음 sprint 또는 그 이후.
