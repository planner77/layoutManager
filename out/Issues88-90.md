## v0.47.4 implementation complete — #88/#90 Owner Managed close-out (2026-10-31)

PR #176 merged Main `328bbdc0ca02649cc551a61962cec9e76816ccde` after [PR CI #349 SUCCESS](https://github.com/planner77/layoutManager/actions/runs/41158289254); [Main CI #100 SUCCESS](https://github.com/planner77/layoutManager/actions/runs/41159460418) and published paired GHCR `0.47.4` App/Migrator digests in [FailureLedger](FailureLedger.md). Both Issues [#88](https://github.com/planner77/layoutManager/issues/88) / [#90](https://github.com/planner77/layoutManager/issues/90) are `closed/completed` as implementation scope. Unmeasured 1k/10k/100k search benchmarks, live signed multi-PC/CAD/Anchor/G7 operational acceptance are explicitly **not verified**.

---

## PR #176 Run #345 — M7 auth integration test module boundary (2026-10-31)

The signed-G7 Memo search integration imported the Viewer Scene module that indirectly loads the Next `server-only` guard. Run #345 compiled and linted successfully but Vitest could not collect the auth suite. A test-only fail-on-use mock for the legacy server context now isolates the Next marker while preserving real G7 signed authority and database/session tests. See [TestReport](TestReport.md) and [FailureLedger](FailureLedger.md). This is not a waiver of server authorization or claim of successful post-fix tests.

---

## PR #176 CI #343 correction and P2 review (2026-10-31)

- First confirmed failed CI `41148144608`: Docker pass, Typecheck pass, ESLint 3 errors; downstream Test/Build/Browser skipped. It is not a Docker or DB migration failure. React hook manual memoization deps and effect-sync state errors repaired without disabling checks.
- Codex P2 on memo retry described loss of transient CAD generated edit/Undo state. Request-specific `memoDetailRetry/memoListRetry` replaces Viewer `attempt` reload and retry only appears for eligible retrieval failures; synthetic OFF Canvas identity and session memo preservation case added to Playwright. Refer [FailureLedger](FailureLedger.md), [TestPlan](TestPlan.md); CI run on new HEAD remains NOT VERIFIED.

---

# Issues #88 → #90: 영속 메모 딥링크 및 도면 전체 검색 (2026-10-31)

> 순서: M6 #88 → M7 #90. 선행 #83/#84/#85/#86 Main 완료. 작성 시점 검증 상태: 코드 커밋, 자동/현장 테스트 **NOT RUN**; GHCR/이슈 종료/운영 DB 변경 없음.

## M6 #88 — 링크와 포커스

- URL: `/cad/versions/{versionUUID}/viewer?renderer=three-dxf-viewer&memo={memoUUID}`. UUIDv4 두 개 이외 좌표/본문/저장소/인증 정보가 URL에 실리지 않는다. `src/viewers/core/link.ts` builder/parser 사용.
- Viewer `작업 → 선택 메모 링크 복사`와 기존 Memo Tree 항목 `링크` 복사는 영속화된 단일 메모만 활성. 세션 임시 메모는 공유 불가. Clipboard 거부 시 읽기 전용 URL/열기 링크.
- Version 조회와 DXF renderer 준비 → G7 인증된 해당 Version의 Memo GET → 응답의 Version+SHA 및 유한 WCS/Anchor 확인 → scoped MemoSession hydrate → 기존 camera `focusBounds` (WCS ±3 margin) → 메모 Tree 선택 및 핀 강조. 숨김 메모는 세션 `memoTransientFocusId`로만 일시 표시; 서버 저장 상태는 불변.
- GET 401/403/404·삭제/타 Version/원본 SHA 불일치/깨진 Anchor/DWG·fallback renderer 시 다른 임의 메모로 이동 금지. AbortController와 Version/SHA/Renderer/Load attempt별 1회 포커스; UI 재시도 가능. CSS immersive 정책 보존.

## M7 #90 — 검색 서비스/화면

- 홈 `/?target=memos`의 전용 메모 검색으로 기존 CAD 목록의 파일명/설명 AND 검색 및 Current-only 정책을 유지한다. `작업 → 메모 검색`은 기존 M4 Memo Tree 검색 필드를 열어 포커스한다. #138 MovableViewerPanel과 모바일 Drawer를 공유한다.
- `GET /api/cad-memos/search`는 서버 DB만 조회한다. 삭제되지 않은 `CadMemo → CadFileVersion (source SHA 일치) → CadLocation → Building → CadSite → Product → BusinessUnit`, 작성자 User, 선택적 M4/M5 CadMemoFeature/CadMemoGroup 조인. DXF 다운로드/파싱/인메모 전체 색인 없음.
- 기본 Current만 반환, `includePast=true` 시 메모 결과에만 과거 Version 추가. 원본 Current를 바꾸지 않으며, 검색 결과의 Version+Memo로 #88 직접 링크.
- 허용된 단일 쿼리 매개변수 `target,q,includePast,businessUnit,product,site,building,floor,group,author,completion,dueFrom,dueTo,page,pageSize`. 텍스트 NFC/trim/최대100·제어문자/중복·알 수 없는 키 거부. 25/50/100 페이지, page 1..1,000,000, 유효 날짜만. 검색어 비면 임의 전체 메모 덤프 금지.
- Title/Content/Group OR 매칭, 다른 필터 AND; `Prisma.sql` bound values + `instr(lower(...),lower(...))`로 %/_/따옴표 literal. SQLite `lower`는 ASCII 영문 대소문자에 한정, 한글 NFC 그대로 매칭. 정렬 수정일 DESC+Memo UUID ASC; 같은 SQLite 거래에서 총건수·페이지 조회. plain React text와 160자 제한 스니펫, 저장 내용 원문 응답 및 HTML 주입 금지.
- 완성된 M4/M5 sidecar가 없으면 해당 group/schedule 필터 503, 그 외 일반 메모 검색은 가능. Greenfield/Prisma schema 변경 및 기존 볼륨 자동 Migration 없음.

## 인증·개인정보 정책

- G7 ACTIVE + trusted authority + 서버 cad_session/현재 사용자 활성 상태/Idle·만료·Revocation + Reader/Editor/Admin + signed Site 범위 ∩ SiteGrant ∩ active Site가 검색/Count에 동일 적용. 글로벌 Admin도 SiteGrant 없는 Site는 검색 불가. 허용 없는 요청 401/403. `AuthSession.lastSeenAt` 활동 갱신 외 CAD/메모/Current/Audit 쓰기 없음.
- 원문 검색어는 URL·로그·외부 통계에 안전하지 않으므로 긴 민감 문장/비밀번호 입력 금지; 서버 애플리케이션 구조화 로그에 query 원문 저장 금지; 응답 private,no-store. 결과 클릭 시 원래 Memo GET 권한 재검증.

## 검증 행렬 (작성 당시 NOT RUN)

| 검증 | 근거 파일 | 판정 |
|---|---|---|
| M6 단위 UUID/Renderer/메모 URL | `src/tests/unit/viewer-link.test.ts` | NOT RUN |
| M6 브라우저 잘못된 UUID·렌더러 회귀 | `src/tests/e2e/issues88-90-memo-search.spec.ts` | NOT RUN |
| M6 교차 세션/숨김/Anchor/SHA/GET 순서 실제 G7 E2E | Signed fixture/현장 검증 요구 | NOT RUN (추가 증거 필요) |
| M7 DTO 입력 검증·NFC·스니펫 | `src/tests/unit/cad-memo-search.test.ts` | NOT RUN |
| M7 SQLite Current/과거/삭제/숨김/Site/SQL literal | `src/tests/integration/memo-search-sql.test.ts` | NOT RUN |
| M7 실제 서명 G7 Reader·Admin Site grant·Revocation | `src/tests/integration/memo-search-auth.test.ts` | NOT RUN |
| M7 목록 진입/홈 회귀 | `src/tests/e2e/issues88-90-memo-search.spec.ts` | NOT RUN |
| M7 1k/10k/100k 합성 성능, 운영 규모/실 CAD GPU | 별도 측정/수용 필요, SLA 보류 | NOT RUN |

**제약:** M2 MemoSession은 현재 Version별 최대100 메모를 보유한다. 검색은 DB 전체를 페이지로 제공하되, 특정 Version이 이 상한을 초과할 때 링크 포커스와 cache eviction 등 실측 후 보완해야 한다. 현장 검증 없이 성능/운영 수용 PASS를 주장하지 않는다. 운영 Go-live, 배포, GHCR, Issue 종료는 이번 PR 작업 범위가 아니다.
