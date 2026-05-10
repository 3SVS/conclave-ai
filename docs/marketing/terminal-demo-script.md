# Conclave AI — terminal demo recording guide

마케팅용 짧은 GIF/SVG 만드는 표준 절차. ~30초짜리 클린한 녹화로
LinkedIn / Twitter 본문 첨부 또는 landing 페이지 hero 옆에 임베드.

## 도구 선택

| 도구 | 출력 | 권장 용도 |
|---|---|---|
| **asciinema + svg-term-cli** | SVG (벡터, 무손실) | landing 페이지 임베드 — 가볍고 sharp |
| **terminalizer** | GIF | LinkedIn / Twitter — 어디든 붙음 |
| **ttygif** | GIF (작음) | 같은 용도, 더 작은 파일 |
| **OBS / ScreenFlow** | MP4 | YouTube / 풀 워크스루 — 이번 케이스엔 오버킬 |

**추천**: 첫 번째 GIF는 **terminalizer** (Mac/Windows/Linux 다 됨, 구성
간단). 두 번째 SVG는 asciinema → svg-term-cli (landing 페이지에 임베드 시).

---

## 설치

### terminalizer (1순위)

```bash
npm install -g terminalizer
```

### asciinema + svg-term-cli (2순위)

```bash
# Windows: WSL 필요. macOS/Linux는 그대로:
brew install asciinema       # macOS
sudo apt install asciinema   # Ubuntu/WSL
npm install -g svg-term-cli
```

---

## 녹화 시나리오 — 30초 buffer

화면 폭: **120 cols × 32 rows** (terminalizer config 또는 터미널 창 크기
미리 맞춤). 이 비율이 LinkedIn/Twitter 첨부 미리보기에 잘 맞음.

### 스크립트 (그대로 따라 입력)

녹화 시작 → 타이핑 → 결과 보이고 → 녹화 정지.

```bash
# 1. 신원 확인 (브랜드 hit + 로그인 됐다는 시각 신호)
$ conclave whoami
seunghunbae-3svs (free · BYO Anthropic key)

# 2. 실제 PR 한 개 review (--use-saas로 SaaS 경로 보여줌)
$ conclave review --pr 142 --use-saas

  conclave review: PR #142 — apps/api: refund flow + profile bio
  conclave review: tier-1 agents: [claude, openai, gemini]
  ⏳ council convening …
  ✓ claude    → REWORK · 4 blockers
  ✓ openai    → REWORK · 3 blockers (2 overlap)
  ✓ gemini    → REWORK · 5 blockers (1 unique)

  ⏳ deliberation (round 1) …
  ⚖  CONSENSUS: REWORK · 4 blockers (deduplicated)

  Verdict: REWORK · 187s · $0.024
  → Comment posted to PR #142
  → Telegram dispatch sent
  → Run `conclave autofix --pr 142 --use-saas` to attempt fixes

# 3. 전체 흐름이 느낌 가게 짧게 finish
$ ▌
```

### 녹화 시 팁

1. **`PS1` 깔끔하게**: `$ ` 단순 prompt 만 보이게. 컬러 / git branch /
   conda env 표기 다 끄고 녹화. 깨끗한 demo 가 산만한 demo 보다 강력.
2. **타이핑 속도**: 너무 빠르면 인공적, 너무 느리면 지루함. terminalizer
   기본 (`frameDelay: auto`) 그대로 두면 자동으로 정리됨.
3. **에러 안 나도록 사전 점검**: `conclave whoami` 가 토큰 만료 안 됐는지
   미리 확인. PR 142 가 실재하고 review 가 실제로 돌 수 있는 상태인지.
4. **"council convening …" 사이에 2-3 초 정지** 가 들어가면 deliberation
   이 진짜 일어나고 있는 느낌이 강해짐. terminalizer 의 manual frame
   recording 으로 처리 가능.
5. **마지막 ▌ 깜빡임 1-2 초 유지** 후 정지 — "방금 끝남" 느낌.

---

## terminalizer 명령

```bash
# 녹화 시작 — 인터랙티브
terminalizer record conclave-demo

# (위 시나리오 입력 후 Ctrl+D 로 종료)

# 결과 다듬기 (선택): conclave-demo.yml 편집
#   - frameDelay 조정 (입력 사이 wait)
#   - cols / rows 변경
#   - theme 변경 (default 가 충분히 깨끗)

# GIF 출력
terminalizer render conclave-demo --output conclave-demo.gif --quality 80
```

출력 파일: `conclave-demo.gif`. 보통 ~500KB-1MB. LinkedIn / Twitter 둘 다
direct upload 가능.

---

## asciinema → SVG (landing 임베드용)

```bash
# 녹화
asciinema rec conclave-demo.cast

# (위 시나리오 입력 후 Ctrl+D)

# SVG 변환
svg-term --in conclave-demo.cast --out conclave-demo.svg \
         --window --width 120 --height 32

# landing 페이지 hero 옆에 <img src="/demo.svg" /> 또는
# <object data="/demo.svg" type="image/svg+xml"> 로 임베드
```

SVG 출력은 **벡터** 라 무한히 sharp 하고 ~150KB 정도로 가벼움. retina
화면 / 줌인 했을 때 GIF 보다 압도적으로 깨끗함. 단점: 자동 재생/루프 가
플레이어 따라 다름 — landing 페이지엔 OK, 소셜엔 GIF 가 안전.

---

## 첨부 파일 위치 추천

녹화 후:
- `apps/landing/public/demo.gif` (또는 `.svg`) — landing 페이지 임베드
- `docs/marketing/conclave-demo.gif` — 마케팅 자산 보관 (이 디렉토리에)

소셜 포스트엔 직접 드래그-드롭 업로드 (LinkedIn / Twitter 둘 다 GIF 지원).

---

## 한 번만 만들고 끝

이 demo 는 모든 채널에 재사용:
- LinkedIn 본문 첨부
- Twitter 1번 트윗 첨부 (큰 반응 끌어옴)
- Show HN 댓글에 직접 링크
- landing 페이지 hero 옆 임베드 (audit 의 #1 finding "제품을 보여주기" 해결)

녹화는 한 번이고, 활용은 영구.
