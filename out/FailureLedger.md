## PR #194 / Issue #191 — 2차 PR CI 실패: useEffect 간접 동기 setState (2026-11-01 KST)

- **실제 실패 HEAD 및 증거:** `5fac25bda03a9f5b44dd2455d17491f8f71aa7c3`, [PR CI Run 41291679198](https://github.com/planner77/layoutManager/actions/runs/41291679198) (`completed/failure`, run #410). Verify [Job 124804106503](https://github.com/planner77/layoutManager/actions/runs/41291679198/job/124804106503) Step 8 `ESLint 검사` FAIL, `1 error + 9 warnings`; npm 의존성 설치, Prisma Client 생성, TypeScript 검사 SUCCESS. Unit/Integration, OCI 검사, Benchmark, Production Build, General/G7/Greenfield/Legacy Playwright E2E는 **SKIPPED**. Docker [Job 124804106759](https://github.com/planner77/layoutManager/actions/runs/41291679198/job/124804106759) SUCCESS (실패 HEAD 한정).
- **직접 원인:** `src/features/master/master-manager.tsx:167` Effect의 `void refresh()`가 비동기 결과 이전에 `refresh` 진입부 `setLoading(true)`를 동기 실행해 `react-hooks/set-state-in-effect`가 간접 동기 state 변경으로 판단함. 직전 수정에서 직접 Effect setter는 제거했으나 호출 함수의 최초 상태 변경을 남긴 것이 재발 원인. 별도 9 warnings 및 Issue #76 squash 설정 advisory는 차단 원인이 아님. 이번 Run은 4건→1건으로 감소했지만 전체 PASS는 아님.
- **보완:** [수리 commit 8fc5c4479d6c9df90e1eeb26a7592ade50696b4e](https://github.com/planner77/layoutManager/commit/8fc5c4479d6c9df90e1eeb26a7592ade50696b4e): `refresh()` 최초 동기 `setLoading(true)` 제거; 최초 mount는 기존 `useState(true)`를 유지, 수동 refresh 클릭과 비활성 필터 체크 변경에 따른 `setLoading(true)`는 **사용자 이벤트 핸들러**에서만 호출. 데이터 처리/에러/종료 state 변경은 `await fetch` 이후 수행. 로딩 중 이전 필터의 선택 노드 상세/편집은 미표시해 stale 상세 상태를 가림. 요청 generation 증가·outdated fetch 폐기/저장 중 global loading/G7 Server Auth/CSRF/Audit·Prisma FK/Current·원본 이력은 변경하지 않음. ESLint rule disable·workflow 약화·Mock 우회 없음.
- **시험/리스크:** 고친 코드의 로컬 lint/typecheck/unit/E2E/Docker **NOT RUN**(원격 GitHub 소스 편집 환경). 수리 이후 최신 HEAD에서 PR CI **NOT VERIFIED** (User: CI 완료 모니터링 생략). 실패 Run의 Docker 성공과 TypeScript 성공을 새로운 HEAD의 검증 결과로 소급하지 않음. 새 CI 중 ESLint 통과 이후에야 Unit/Integration/Browser 실동작을 판단할 수 있음.
- **리뷰/충돌 확인:** 2차 실패 분석 시 PR #194 inline thread 0, 제출 review 0(Owner Managed — 독립 QA 수행 아님), `main` 대비 ahead 32/behind 0. 최종 문서 기록 HEAD에서 `mergeable` 및 새로운 review를 별도 재확인; 실패 Run의 CI status는 병합 차단. 코드/문서 커밋의 `pull_request.synchronize`가 새 PR CI를 요청하며 완료 결과 모니터링은 하지 않는다. PR 병합/Issue 종료/GHCR, 운영 DB/Volume/Auth/CAD Writer 활성화 없음.

---

## PR #194 / Issue #191 — ESLint 4건 실패 및 수리 (2026-11-01 KST)

- **실측:** [PR CI Run 41285766585](https://github.com/planner77/layoutManager/actions/runs/41285766585), HEAD a89956c9d704aeb173e625b3c970d3f3fa29a3c8, completed/failure. Verify [Job 124786741824](https://github.com/planner77/layoutManager/actions/runs/41285766585/job/124786741824) Step 8 ESLint 검사 **FAIL: 4 errors, 9 warnings**. npm ci / Prisma Generate / TypeScript **SUCCESS**. Unit·Integration, Benchmark, Production Build, Chromium General/G7/Greenfield/Legacy E2E **SKIPPED**. Docker [Job 124786742016](https://github.com/planner77/layoutManager/actions/runs/41285766585/job/124786742016) **SUCCESS** (원래 실패 HEAD에서만). 새로운 HEAD PASS를 대변하지 않음.
- **원인:** src/features/master/master-manager.tsx:85–86 렌더 함수에서 selectedRef.current/filterRef.current 직접 대입 → react-hooks/refs 2 errors. 같은 파일:160/168 useEffect에서 각각 동기 setMode, setFocusedKey → react-hooks/set-state-in-effect 2 errors. 나머지 9 warnings는 이번 Run 실패를 유발하지 않은 기존 lint warnings.
- **수리 커밋:** [a29c3c7](https://github.com/planner77/layoutManager/commit/a29c3c716d0d1202c9ee0b21d05f6626453257f7). Ref 갱신은 의존성별 Effect 내부로, showInactive mode/notice 초기화는 체크박스 onChange 사용자 이벤트로, tree roving tabIndex는 visible 노드를 기준으로 유효 focusKey를 렌더 중 순수 계산. ESLint disable/규칙 완화 없음.
- **연관 E2E 사전 보완:** [c0518c3](https://github.com/planner77/layoutManager/commit/c0518c3f58f8c68d938de4b7417d81b100efbb02)로 src/tests/e2e/current-only-list.spec.ts에서 과거 5열 master region locator 제거. 새 계층 트리의 이름 검색→사업부 하위 층 선택→우측 '버전 이력'으로 이동해 Current 미지정 층도 찾는 시험. 기존 도면 Version/Current 불변성 assertion 그대로 유지.
- **검증 경계:** 위 수리 HEAD의 로컬 Typecheck/ESLint/Vitest/Playwright/Docker 실행은 GitHub 원격 파일 편집 환경에서 **NOT RUN**, 새 PR CI 결과 **NOT VERIFIED**. 41285766585 Docker 성공과 TypeScript 성공을 새 HEAD에 소급 적용하지 않음. 실패 Run/Job은 위와 같이 보존하고 본 기록을 추가한 최신 커밋의 synchronize PR CI 기동을 요청. CI 완료 모니터링 생략.
- **리뷰/충돌 사전 확인:** PR reviews 0 / inline threads 0 / unresolved 0, Main behind 0, mergeable=true (최신 HEAD 별도 확인). Owner Managed 승인과 독립 QA 승인 구분. GHCR·병합·Issue 종료·운영 Auth/Writer/DB/Volume 변경 없음.

---

## PR #194 / Issue #191 — 리뷰·충돌 게이트 및 PR CI 최초 실행 (2026-11-01 KST)

- **PR:** https://github.com/planner77/layoutManager/pull/194, title "#191 | Replace five-column location masters with accessible hierarchy tree", main 기준 base 327ac0c13534d240c2880eb293c77e5cf44736a4; PR 최초 검토 HEAD b8392d8f7ed9bbc89e4bb92ad2beb5c067880ebe.
- **리뷰:** GitHub inline review threads 0 / 미해결 0, 제출 리뷰 0. Owner Managed 운영 정책이며 독립 QA 승인으로 표기하지 않는다. 별도 해결이 필요한 리뷰 지적은 관측되지 않았다.
- **충돌:** GitHub raw PR mergeable=true, mergeable_state=unstable (pending checks; clean 완료를 의미하지 않음). main 비교 ahead 25 / behind 0, merge-base main 일치, 코드 병합 충돌 관측 0. CI 미완료 상태에서 병합·release를 실행하지 않는다.
- **최초 CI 요청:** pull_request.opened가 [PR CI Run 41285696095](https://github.com/planner77/layoutManager/actions/runs/41285696095)를 시작했으며 initial HEAD b8392d8f7ed9bbc89e4bb92ad2beb5c067880ebe, 확인 시 status=in_progress/conclusion=null. **성공/실패 미판정**. 본 원장 기록을 PR 브랜치에 반영하는 후속 synchronize는 새 HEAD CI를 재요청하며, 최초 Run은 최종 HEAD 검증 증거가 아니다.
- **검증 경계:** 로컬 TS/Lint/Vitest/Browser/Docker NOT RUN. 최신 커밋 PR CI 결과 NOT VERIFIED. User 요청으로 지속 모니터링 생략. GHCR 게시, PR 병합, Issue #191 종료, 운영 Auth/CAD Writer/DB/Volume 변경 없음. 새 실패가 실제 보고되면 정확 Run/Job/HEAD·원인·수리 SHA를 본 원장 상단에 누적 기록한다.

---

## Issue #191 — PR 개설 전 최종 소스 및 충돌 사전 점검 (2026-11-01 KST)

- **후보 버전/무결성:** src/package.json 및 src/package-lock.json 루트 버전을 0.55.3으로 동기화. git ref v0.55.3 조회 404(미존재), v0.55.2 기존 이미지/태그 재사용·이동 없음.
- **사전 Main 정렬:** main 327ac0c13534d240c2880eb293c77e5cf44736a4, feat/issue-191-master-tree-20261101 비교 ahead 24/behind 0, merge-base main 일치, 서버의 Git 변경 충돌을 일으킬 상이한 Main이 아직 확인되지 않음. 이는 **PR mergeable API/리뷰 스레드 검사를 대체하지 않으며**, PR 개설 후 별도 확인한다.
- **정적 위험 조치:** Tree 자식 DOM focus bubbling이 상위 노드의 roving tabindex 상태를 덮지 않도록 이벤트 currentTarget 검사; master E2E 오류 판정은 Next route-announcer 충돌을 피하도록 main 내 alert로 제한. 런타임 및 E2E 실실행 PASS는 **NOT VERIFIED**.
- **PR CI:** PR 개설 전 확인된 신규 Run/Job 없음. main 대상 PR open 시 \`.github/workflows/pr-ci.yml\` trigger, run 시작 전후의 정확 커밋·신호만 기록하고 지속 모니터링하지 않음. 이슈 종료/병합/운영·GHCR 미실행.

---

## Issue #191 — Master Tree 구현·PR CI 시작 전 실패/위험 원장 (2026-11-01 KST)

- **범위/기준:** Main 327ac0c13534d240c2880eb293c77e5cf44736a4, feat/issue-191-master-tree-20261101, #24 기존 5단계 API/권한/UUID 및 #191 상세 UI 요구. 루트 DESIGN.md 부재 → out/Architecture.md·Decisions.md·Issue191.md 참조.
- **관측된 CI 실패:** 이 신규 기능 브랜치에 대한 PR CI는 아직 시작 전이며 **실제 Run/Job 실패가 관측되지 않음**. 과거 CI 실패와 섞거나 성공으로 표기하지 않는다. 로컬 Node 의존성 설치/Vitest/Typecheck/Playwright/Docker는 현재 GitHub source connector 환경에서 **NOT RUN**.
- **정적 위험/대응:** (1) 기존 master.spec.ts의 5열 locator는 새 UI와 불일치 → Tree/Detail CRUD·키보드·검색/모바일 E2E로 교체. (2) 직접 POST는 기존 MasterRepository에서 비활성 상위 경로를 검사하지 않음 → 동일 DB transaction에서 직계·조상 active guard + Integration. (3) 검색/필터/재조회 선택 stale·중복 쓰기 → generation ID·기존 확장 상태 보존·서버 성공 후 별도 재조회. (4) 미분류 이름 PATCH, 참조 자식 삭제·이력 접근/G7 권한 → 불변/안전 삭제·기존 Server guard 유지.
- **향후 게이트:** 정확 PR HEAD의 Verify(Prisma/TS/ESLint/Vitest/Build/E2E), Docker/Greenfield/Legacy 및 unresolved review threads·Main 비교 필요. PR 개설이 PR CI를 시작하며 결과는 사용자의 모니터링 생략 요청으로 **NOT VERIFIED**. 실패가 실제 확인되면 Run/Job/HEAD/원인·보완 기록을 이 원장 최상단에 추가한다. PR 병합, GHCR 게시, 이슈 종료/운영 변경 없음.

---

## PR #192 — 최종 PR CI 성공·리뷰/충돌·Owner Managed 병합 및 Main CI 시작 (2026-11-01 KST)

- **CI 정본:** 최종 HEAD `3da74d76134e69924018e519ff4ce458e96c7487`, [PR CI Run 41281582636](https://github.com/planner77/layoutManager/actions/runs/41281582636) `completed/success`. Verify Job `124774528508` `completed/success`(Typecheck·ESLint·Unit/Integration·Build·E2E 등 CI gate), Docker Job `124774528276` `completed/success`(Docker image/runtime smoke). 초기 HEAD `1ecd7e9a38ed1c88217ec1dd5ab462a9ebc5d042` [Run 41281326806](https://github.com/planner77/layoutManager/actions/runs/41281326806)은 정확 HEAD가 달라 최종 PASS 증거로 사용하지 않는다.
- **실패·원인:** 이번 PR에 확인된 실패 Run은 없음(시작 Run의 결과 추정 금지). 최초 코드 위험은 (1) Memo Session Snap 후보·reconcile의 중복 Origin/ID 임의 선택, (2) Scene Reset DB observed Snapshot 중복 ID의 동치 오판, (3) Viewer KEEP pre-write에서 첫 ID를 임의 찾는 경로. 각각 중복 fail-closed/마지막 WCS BROKEN 보존, observed 유일성, `uniqueMemoSnapTarget` 사전·사후 공통 가드 및 합성 Unit 보완. 오래된 Ledger 실패·수리 기록 전체 아래 보존.
- **병합 Gate:** 제출 Review 0/inline Review Thread 0/미해결 0 (Owner Managed, 독립 승인 아님). GitHub PR `mergeable=true/clean`; Main `ahead 2/behind 0`, 충돌 0. `v0.55.2` tag 미존재 확인. 정확한 PR 제목 `#81 | Memo–Scene ID ambiguity and reset snapshot integrity (#160)`으로 Squash Merge **성공**, Main `b3fcf3eda19177f52e00c0191d5ffb9f333bb0e8`; [PR #192](https://github.com/planner77/layoutManager/pull/192).
- **Main CI/GHCR:** 런타임 변경 Main push [Run 41283558627](https://github.com/planner77/layoutManager/actions/runs/41283558627) `queued` 시작 확인. `docker-publish.yml` release-scope는 소스 파일 변경을 GHCR App `ghcr.io/planner77/layoutmanager:0.55.2` 및 Migrator `:0.55.2-migrate` **빌드/태그 게시 후보**로 처리한다. 실제 Run 완료, release-scope 판정, 양쪽 OCI digest 및 태그 게시 **NOT VERIFIED**(사용자 지시로 CI 모니터링 생략); GHCR 게시 완료 주장 금지. 기존 0.55.1/tag/이미지 강제 이동 없음. 이 사후 docs-only Main 기록은 재게시 대상 아님.
- **이슈/잔여 Gate:** Owner 코드·합성 범위로 #81 및 #160 `closed/completed`. 실제 #160 S7 및 #81 현장 Memo/Scene 교차 통합 검증은 [#193](https://github.com/planner77/layoutManager/issues/193) `OPEN/BLOCKED` 신규 이관, 기존 [#96](https://github.com/planner77/layoutManager/issues/96)/[#113](https://github.com/planner77/layoutManager/issues/113)/[#190](https://github.com/planner77/layoutManager/issues/190) OPEN. 실 DXF 3종·GPU/2PC·Owner SLA/원자 Reset/Backup·Restore/운영 Auth·Writer GO 미수행; 합성 CI를 현장 PASS로 전용 금지.
- **출처:** AGENTS.md, out/Epics81-160.md, Architecture/Decisions/Requirements/TestPlan/TestReport/Operation, PR/CI 및 GitHub issue 상태. Root DESIGN.md 없음. 이 기록은 원장 이전 항목을 삭제/덮어쓰지 않는 후속 문서-only Main 변경.

---

## PR #192 보완 — Viewer KEEP의 서버 저장 전 중복 ID 검사 (2026-11-01 KST)

- PR 최초 HEAD `1ecd7e9a38ed1c88217ec1dd5ab462a9ebc5d042`에서 `pull_request.opened` [PR CI Run 41281326806](https://github.com/planner77/layoutManager/actions/runs/41281326806) 시작 관측(`in_progress`, 완료 미확인). 해당 결과를 새 HEAD의 성공 증거로 재사용하지 않는다.
- **추가 분석:** `viewer.tsx:applyMemoMove`의 KEEP 분기가 실제 `getMemoSnapTargets().find(...)`로 첫 Target만 검사하여, 중복 Origin/ID라도 서버 `mutatePersistedMemo('PATCH')` 뒤 Store의 중복 거부에 걸릴 수 있다. 이 불일치를 서버 저장 전 차단하기 위해 재사용 가능한 `uniqueMemoSnapTarget(scope,ref,targets)`를 정의하고 Viewer KEEP 사전 검증 및 서버 응답 후 재검증 양쪽에 적용한다. 임시 세션 연결과 서버 작성자/Site 인가는 독립적으로 유지한다.
- **회귀:** 중복/숨김/타 Version Target을 대상으로 유일 객체 조회 차단, Viewer 사전 검사 위치 검증 추가. 추가 수리 커밋의 `pull_request.synchronize`가 **새 PR CI를 요청**하며, 정확한 새 Run 및 리뷰/충돌 상태는 PR 인계 코멘트로 기록. 로컬 npm/TS/Vitest/Browser/Docker **NOT RUN**, CI 완료·PASS/실 DXF·2PC·GHCR **NOT VERIFIED**. 실제 CI 실패는 **관측되지 않았으므로 실패로 기재하지 않는다.**

---

## Epic #81/#160 — 교차 경계 결함 분석·수리 원장 (2026-11-01 KST)

- **분석:** `sameRevisionSnapshot`의 조회 ID 집합 검사는 길이와 revision map 값만 비교하여 `expected[A,B]`, `observed[A,A]`를 TRUE로 만들 수 있었다(실제 Prisma `findMany` 중복 발생 증거는 없으며 코드 경계의 잠재 문제). `MemoSessionSnapStore.snapshot`은 동일 Origin/ID 중복 시 Map 마지막 대상을 사용하고, 후보/최근접/선택/재배치도 모호성을 확인하지 않았다.
- **조치:** 조회 ID 중복 Set 검사와 Memo 모든 대상 소비 경로의 duplicate fail-closed; 마지막 유효 WCS 보존, 서버 Anchor·G7·Scene 원본 데이터 불변. TC-EPIC-81-160-01/02 추가. 기존 원장은 삭제/대체하지 않는다.
- **검증·리뷰:** 이번 PR의 실제 CI 실패 Run/Job·리뷰 지적/충돌은 **아직 관측되지 않음**. 로컬 시험 **NOT RUN**, 새 HEAD PR CI 성공 **NOT VERIFIED**, 현장/운영 미실행. PR 생성 뒤 리뷰 스레드·Main 비교 및 CI 시작 근거는 PR 본문/코멘트로 추적. GHCR 게시·병합·Issue 종료 없음. [설계](Epics81-160.md).

---

## PR #189 — 최종 CI 성공·리뷰/충돌·Owner Managed 병합 및 Main CI 기동 기록 (2026-11-01 KST)

- **정확한 PR CI 증거:** 검증 HEAD `dc8e7c3a0c023272e2fa723a9abe35627efdd35a`; [PR CI Run 41278134690](https://github.com/planner77/layoutManager/actions/runs/41278134690) `completed/success`. Verify [Job 124764393470](https://github.com/planner77/layoutManager/actions/runs/41278134690/job/124764393470) **SUCCESS**: npm/Prisma, TypeScript, ESLint, Unit+Integration, OCI layer stats, synthetic 1k/10k/100k source benchmark, production build, Chromium E2E, G7 Signed runtime·Greenfield·Legacy E2E 모두 실행·성공. Docker [Job 124764393555](https://github.com/planner77/layoutManager/actions/runs/41278134690/job/124764393555) **SUCCESS**: baseline/standalone runtime+migrator image, size/native/Prisma, migration reject 및 disposable Greenfield smoke. 이전 [Run 41277155938](https://github.com/planner77/layoutManager/actions/runs/41277155938)의 Unit 1/891 실패와 exact floating point assertion 수리 증거는 아래 역사 항목에 그대로 보존한다.
- **병합 Gate (변경 전 최종 확인):** inline review threads `0`, submitted reviews `0` (외부 승인 없음, Owner Managed), blocking P1/P2 `0`으로 관측. PR mergeable `true`, `main` 비교 `ahead=20/behind=0`, Git conflict `0`. Draft→Ready 변경 후 source HEAD 불변 유지; exact title `#186 | Memo 10k frame/heap diagnostics and batched WCS projection`의 **Squash Merge 성공**. 새 Main commit [`19167bc3274ac7955ecb2935602f0404cd0a82bf`](https://github.com/planner77/layoutManager/commit/19167bc3274ac7955ecb2935602f0404cd0a82bf).
- **Main/GHCR:** Main push [CI Run 41280051780](https://github.com/planner77/layoutManager/actions/runs/41280051780)는 병합 SHA에서 `in_progress` 시작 확인. `.github/workflows/docker-publish.yml` release-scope는 runtime 변경을 게시 대상으로 판단하도록 설계; `v0.55.1` 및 `ghcr.io/planner77/layoutmanager:0.55.1` / `:0.55.1-migrate` 후보 검증·게시·digest는 **완료 결과 확인 전 NOT VERIFIED**. 사용자 요청대로 이후 CI를 모니터링하지 않았으며 GHCR 게시 성공으로 표기하지 않는다. 이 후속 문서 수정만의 Main CI는 docs-only release-scope에 따라 GHCR SKIPPED 대상이지만 실제 실행·최종 결과는 별개.
- **이슈 처리와 리스크:** Owner 코드 범위 행정 완료로 [#186](https://github.com/planner77/layoutManager/issues/186) `closed/completed`. 확인되지 않은 현장 DXF/1k·10k·100k GPU·frame/Heap 원인·2PC Auth/Site A/B·Backup/Restore·SLA·Owner 서명은 후속 [#190](https://github.com/planner77/layoutManager/issues/190) **OPEN/BLOCKED** 체크리스트에 이관. 관련 [#96](https://github.com/planner77/layoutManager/issues/96) / [#113](https://github.com/planner77/layoutManager/issues/113) 계속 OPEN. 누수 해소 확정·현장 인수·운영 Auth/Writer 활성화·CAD 반출·기존 볼륨 migration·기존 image tag 이동/덮어쓰기 없음.

---

## PR #189 / Issue #186 — 최초 PR CI 단위 테스트 IEEE-754 비교 실패 (2026-11-01 KST)

- **실제 실패:** [PR #189](https://github.com/planner77/layoutManager/pull/189), [Run 41277155938](https://github.com/planner77/layoutManager/actions/runs/41277155938) `completed/failure`, HEAD `052ce241381cc8c42f986223f928165b66e2cb45`. Verify [Job 124761562731](https://github.com/planner77/layoutManager/actions/runs/41277155938/job/124761562731) Step 9 `Unit 및 Integration 테스트` 실패. `133 files` 중 132 PASS/1 FAIL; `891 tests` 중 890 PASS/1 FAIL. `tests/unit/memo-screen-projection.test.ts:36`: `expected {x:110.00000000000001,y:40} to deeply equal {x:110,y:40}`. 이 테스트 신규 TC-186-01의 100 pins+candidate / preview assertion이다.
- **원인:** THREE `Vector3.project`의 정규화 좌표를 CSS pixel로 변환할 때 발생하는 IEEE-754 소수점 오차를 `toEqual`로 비트 수준 동일 비교. WCS/Camera/viewport 계산 로직 및 서버 저장값 결함의 증거가 아니다. 100핀 projection callback 1회/101점 자체는 오류 보고가 없었으며, 해당 동일 테스트의 후속 좌표 assertion은 최초 실패로 통과 여부가 미확인이다.
- **수정:** `src/tests/unit/memo-screen-projection.test.ts`의 preview pin·기본 pin·candidate X/Y를 `toBeCloseTo(expected, 9)`로 개별 비교하여 미세한 부동소수점 오차만 허용. 100핀+1후보 batch 호출 횟수, preview/cull·invalid·no-op assertions 보존. `src/viewers/core/canvas-projection.ts`와 `src/domain/memo-screen-projection.ts`의 프로덕션 WCS/CSS/DPR/NaN/±1e12 계약이나 G7·DB·CAD는 변경하지 않는다.
- **다른 Gate:** 같은 Run의 Docker [Job 124761562520](https://github.com/planner77/layoutManager/actions/runs/41277155938/job/124761562520)은 **SUCCESS**. Verify 의존성 설치·Prisma Client·TypeScript 검사·ESLint 검사 **SUCCESS**; Unit 실패 이후 OCI layer unit, DXF benchmark, Production Build, Playwright Chromium/General/G7/Legacy E2E는 **SKIPPED**. 이전 HEAD의 Docker PASS는 새로운 HEAD 성공 증거가 아니다.
- **Review/Main:** 수정 전 PR review 0·inline thread 0, PR `mergeable=true`, `main` 대비 ahead 19/behind 0·충돌 0 확인. 정확한 새 HEAD의 충돌/리뷰는 CI 재시작 직전·병합 전 별도로 확인한다. 새 변경(테스트+원장+보고서)을 한 Git object commit/tree로 원격 브랜치 fast-forward해 `pull_request.synchronize` PR CI를 새로 시작한다. 수리 SHA/새 Run은 해당 PR의 GitHub commits/Actions 및 인계 코멘트에 기록한다.
- **검증 경계:** 이 수정의 로컬 Vitest/Typecheck/Playwright/Docker는 GitHub connector 환경에서 실행되지 않아 **NOT RUN**. 정확한 새 HEAD CI 결과는 완료 확인 전 **NOT VERIFIED**; 요청에 따라 모니터링 생략. PR 병합·GHCR 게시·Issue #186 종료·운영 Auth/Writer 변경·실 CAD 반출/현장 2PC 수용은 수행하지 않는다. #96/#113/#186 OPEN 유지.

---

## PR-C #186 — 10k Memo frame/heap 미확정 원인 및 검증 경계 (2026-11-01)

- Base Main `40278024f4ff58dc9de70b6866f8f2b84019b758`, branch `feat/issue-186-memo-performance-20261101`, package/version 0.55.1 후보. 최신 #172 정책은 PR #188/Main에서 계승. Root DESIGN.md 없음.
- **기존 실패/관측:** #174 10k +100핀 과거 p95 216.6ms/17 frames >16.7ms; dispose heap +16,804,276B. 이것은 실 현장 SLA/소스 누수 확정이 아니며 이번 코드 패치 이후의 개선 수치로 주장하지 않는다.
- 분석: Memo 좌표 별 canvas DOMRect 반복 조회, React no-op commit 시도 및 Adapter dispose 후 미정리되는 source/renderIndex/sceneAsset 참조를 소스에서 확인. WCS batch+cleanup 및 정확 workload 0/100 Visible/100 Hidden·세 번 종료 CDP 진단 도구를 추가. CDP Inspector 자체의 handler retention, Next route/cache, GPU/Canvas는 별도로 증명해야 하며 JS Heap 하나로 결론 금지.
- **현재 검증:** 변경파일 작성, 단위 및 E2E test 추가 후 아직 로컬 npm/typecheck/ESLint/Vitest/Playwright/Build/Docker **실행되지 않음** (GitHub 연결 소스 API만 이용). PR CI Run/Job 결과는 최초 실행 후에만 기록. CI 오류가 발생하면 정확한 Run, job, 원인/보완 commit 및 새 HEAD CI를 본 실패 원장에 추가해 이력을 보존한다.
- **범위:** 기존 DB·CAD·S3 Volume, 기밀 현장 자료, 운영 Auth/Writer, 기존 GHCR 태그 변경 없음. #186/Open field, #113 실제 DXF/GPU, #96 2PC/Auth 수용을 합성 PR CI 성공으로 종료하지 않는다.

---

## PR #188 / Issue #172 — 첫 PR CI TypeScript 파서 실패 보완 (2026-11-01 KST)

- **관측한 실패:** [PR #188](https://github.com/planner77/layoutManager/pull/188), [Run 41272222655](https://github.com/planner77/layoutManager/actions/runs/41272222655), attempt 1, 기존 HEAD `ed7b3184981b517a591bc346089f0729d4ac15c2`, `completed/failure`. Verify [Job 124747159527](https://github.com/planner77/layoutManager/actions/runs/41272222655/job/124747159527) step 7 **TypeScript 검사**: `tests/integration/typed-outline-runtime.test.ts(505,96): error TS1005: ',' expected` (`tsc --noEmit`, exit 2). GitHub 로그의 실제 원문 기준.
- **직접 원인 / 수정:** TC-172의 `secondMemoEditor()`에서 AuthSession 테스트 fixture 작성 시 `expiresAt:BigInt(candidate.session.expiresAt}});` 형태로 `BigInt(` 닫는 `)`가 누락된 구문 오류. `expiresAt:BigInt(candidate.session.expiresAt)}});`로 정정하고 기존 Session/Role/Site Grant, production G7 인가·Memo 작성자/Site Admin DELETE 정책 및 시험 assertion을 변경하지 않음.
- **다른 gate 상태:** 동일 Run의 Docker [Job 124747159433](https://github.com/planner77/layoutManager/actions/runs/41272222655/job/124747159433) **SUCCESS**. Verify는 npm ci/Prisma Client 생성 PASS 후 TypeScript에서 중단되어 ESLint/Vitest/Benchmark/Build/Playwright(G7 포함)/Legacy는 **SKIPPED/NOT VERIFIED**. Docker 성공을 전체 PR 검증 성공으로 해석하지 않음.
- **리뷰/충돌/재검증:** 수정 전 inline review threads **0**, PR `mergeable=true`, Main 비교 ahead 27/behind 0으로 해결할 리뷰 스레드/충돌 없음. 외부 리뷰 승인/독립 QA 완료를 의미하지 않음. 로컬 Typecheck/Lint/Test/Docker는 GitHub connector 환경에서 실행하지 않아 **NOT RUN**. 수정+이 원장 기록을 한 Git commit/tree로 반영하고 HEAD fast-forward `pull_request.synchronize`로 **새 PR CI 시작**; 새 CI 종료·성공은 **NOT VERIFIED**, 사용자 요청으로 모니터링하지 않음. PR 병합/GHCR/Issue 종료/운영 전환은 수행하지 않음.

---

## PR-B #172 — Owner Memo 공동 수정 정책 신규 후보 (2026-11-01)

- 기준 최신 Main `44302a69f0f5be09f3fe4800e09d4e596c4d2e5f`, 독립 브랜치 `feat/issue-172-memo-shared-edit-20261101`, 기존 `0.54.1`과 충돌 방지용 `0.55.0` 후보. `AGENTS.md`와 `out/{Architecture,Decisions,Requirements,TestPlan,TestReport,Operation}.md` 참조. 루트 `DESIGN.md` 404.
- 과거 작성자-only Server Memo/Anchor/Reset 검사를 Owner 승인에 따라 개정. Server memo:write + Version-Site 인증은 유지하며 Delete만 작성자 또는 Site Admin으로 한정, SOURCE_ONLY EDIT와 ALL DELETE 경계 분리. Client `canDeleteAny`는 힌트일 뿐 인가가 아님. Full transaction CAS/Audit·동시 작업·계정 전환을 회귀 목표로 지정.
- **아직 검증되지 않은 내용:** 로컬 npm/Typecheck/Lint/Vitest/Playwright/Build/Docker 실행 없음(연결 GitHub source만 이용). 최초 및 최종 PR CI 성공, Review/Conflict 판정, GHCR 이미지·현장 승인 및 Signed G7 활성화는 관측 전 `NOT VERIFIED`. 사후 실제 CI 실패가 발생할 경우 Run/Job, 정확 원인, 수리 SHA 및 새 HEAD 검증을 추가하고 기존 실패 기록을 삭제하지 않는다.
- 과거 R4/#174, R5/#91 합성 성능·운영 수용 미완 기록은 유지. 기존 운영 DB·Volume·이전 사용자 계정/마이그레이션·사내 CAD 자료를 변경하지 않음. Owner가 확정한 #172 정책만 구현.

---

## 2026-11-01 #37/#49/#50 통합 보완 — PR CI 요청 전 기준

- 기준 Main c992fe87c68e65b5820203f42ad4cb13b92d1544 및 0.54.0에서 #37, #49, #50의 하위 이슈가 이미 구현/종료되었음을 확인. #63은 선택적 P2 원시 로그 수집으로 범위 제외. 별도 루트 DESIGN.md는 없으며 AGENTS/Architecture/Decisions/Requirements/Logging/TestPlan을 기준으로 한다.
- 신규 Viewer 메뉴 disabled link의 href 우회, 로그 Timeline 저장소 503·cursor 410의 불필요한 메인 목록 비움 방지, 회귀 검증을 단일 브랜치에 작성. package/lock은 0.54.1 후보로 동기화한다. 서버 인증/감사·CAD 원본·운영 DB/볼륨/GHCR 변경 없음.
- 새 통합 Unit/E2E와 기존 Greenfield E2E 갱신 및 [수용 추적](Epics37-49-50.md). 이 항목 작성 시점의 로컬 Typecheck/Lint/Unit/Build/Browser 테스트는 **NOT RUN**이고 원격 CI Run/결과는 **NOT VERIFIED**. 미관측 결과를 PASS로 주장하지 않는다. 운영·실도면 성능 및 #63은 인수 대상이 아니다.
- 요청된 범위는 PR 열기로 PR CI 기동(모니터링 생략)까지만이며, CI 실패 시 실제 원인·Run ID·재검증을 별도 원장 항목에 추가한다. 기존 실패 기록은 모두 보존.

---

## PR #185 / Issue #91 R5b — Main 정렬·리뷰/충돌 검증 및 새 PR CI 요청 (2026-11-01 KST)

- 대상 [PR #185](https://github.com/planner77/layoutManager/pull/185)는 #91 보이는 Memo GLB/glTF R5b의 **Draft / 스택형 PR**이며 기반은 여전히 미병합 [PR #184](https://github.com/planner77/layoutManager/pull/184)의 `feat/issue-91-exchange-export-20261101` (`9accf8ba3e21f2d51dc7694e768f19c75fffb5d5`)이다. 해당 선행 PR/기반 브랜치 자체는 수정·병합하지 않았다. Issue #91은 OPEN이다.
- 정렬 전 R5b HEAD `777941fdb4e8831c55d303d428ba2dca11fa2efc`, 최신 Main `a0f232bc70d8ee113daafbd831892d27b0ed0070`, 공통 조상 `9016feba2a11c9b7bd8552a6ca2c3bee28e4a001`. Main 대비 ahead 9 / behind 4. Git Tree 전체 blob 비교에서 Main에만 존재하는 파일은 0개, 공통 경로 중 blob 상이 17개다. 그 중 R5a/R5b의 신규 코어/수정/테스트·버전(0.54.0) 및 상단 설계·시험 문서는 의도한 확장으로 유지한다. Main의 `out/FailureLedger.md`에만 남았던 #181/#182/#183 정렬·검증 **3개 원장 섹션**을 원문 그대로 복원하고 R5b의 기존 실패 및 성공 이력을 삭제하지 않는다. 소스/설계 충돌은 추가 덮어쓰기 없이 검토했으며 코드 동작을 변경하지 않는다.
- `AGENTS.md` R5b, 루트 부재 `DESIGN.md` 대신 `out/Architecture.md`, `out/Decisions.md`, `out/Requirements.md`, `out/TestPlan.md`, `out/TestReport.md`, `out/Operation.md`, PR #184/#185 및 #91을 참조했다. Review threads 0 / reviews 0 / 코멘트 0으로 답변하거나 Resolve할 스레드가 없었다. PR 제목은 CI issue-ref 규칙에 맞게 `#91 | Export readable Memo annotations in GLB/glTF (0.54.0)`으로 정정했다.
- 정렬 이전 정확 HEAD `777941fdb4e8831c55d303d428ba2dca11fa2efc`의 [PR CI 41244183609](https://github.com/planner77/layoutManager/actions/runs/41244183609)는 `completed/success`였지만 **새 병합 HEAD에는 승계하지 않는다**. 이번 정렬은 기존 PR HEAD와 현재 Main을 두 부모로 하는 1회 merge commit/tree update이며 브랜치 ref 갱신의 `pull_request.synchronize`로 새 PR CI를 요청한다. 새 CI Run/성공·GHCR 게시/현장/성능 수용은 아직 **NOT VERIFIED**이고 사용자 지시대로 CI 결과를 모니터링하지 않는다. PR 병합, GHCR, 태그, Issue 종료, 운영 DB/볼륨/Auth/Writer 변경은 하지 않는다.

## PR #183 / #174 — Main 정렬·리뷰·충돌 검증 및 PR CI 재기동 (2026-11-01 KST)

- 대상 [PR #183](https://github.com/planner77/layoutManager/pull/183), Draft / [Issue #174](https://github.com/planner77/layoutManager/issues/174) OPEN. 정렬 전 PR HEAD `458d3da6257b0d9a9cbabdd2f60a74d44860fef4`, Main `5515ca195734731bf34bc05ba9b125f6a6c3f2b1`, 공통 조상 `9016feba2a11c9b7bd8552a6ca2c3bee28e4a001`; 비교 ahead 7 / behind 3. 기존 [PR CI 41233433577](https://github.com/planner77/layoutManager/actions/runs/41233433577)의 Verify/Docker SUCCESS는 이전 HEAD의 증거이며 새로운 정렬 HEAD 성공을 보증하지 않는다.
- `AGENTS.md`, `out/Architecture.md` R4, `out/Decisions.md`, `out/Requirements.md`, `out/TestPlan.md` TC-R4, `out/TestReport.md`, `out/Issues84-167.md`, #174를 확인했다. 루트 `DESIGN.md`는 존재하지 않아 Architecture/Decisions를 기준으로 했다. Actor/Version/Scene/Target 검증·작성자-only/CAS/Audit·서버 trusted inverse 및 세션 임시 연결 비영속 계약을 보존한다. 10k LINE/100pin rAF p95 216.6ms와 2차 dispose heap 증가16,804,276bytes의 원인 미해결, 실 CAD/GPU/2PC 현장 수용은 #174 OPEN에 유지한다.
- PR #183 직전 부모 `f179d59604e552bfd42389420be4851e5a5d0f2e`와 Main의 Git Tree 전체 blob 비교에서 코드·설정 차이는 없고 `out/FailureLedger.md` 한 파일만 달랐다. Main의 #181/#182 정렬 기록 총15줄(두 삽입 블록)과 PR #183의 R4 기록을 삭제·중복 없이 결합한다. 다른 source/blob을 변경하지 않은 merge commit의 부모를 기존 PR HEAD와 현 Main HEAD로 설정한다. 검토 시점 미해결 리뷰 스레드0, 리뷰 제출0, source 충돌0. PR 제목은 CI issue-ref 정책에 따라 `#174 | ...`로 정리했다.
- PR branch 업데이트는 `pull_request.synchronize`로 새로운 HEAD의 PR CI를 요청한다. 본 문서 작성 시점의 새 Run ID, 종료/성공은 미확인이며 모니터링하지 않는다. 병합, GHCR 게시, Issue 종료, 운영 DB/볼륨 변경·배포·현장 승인 조치는 수행하지 않는다.

## PR #182 / #71·#73 — Main 정렬·리뷰·충돌 확인 및 PR CI 시작 요청 (2026-11-01 KST)

- 대상 [PR #182](https://github.com/planner77/layoutManager/pull/182) Draft, 기존 HEAD `f179d59604e552bfd42389420be4851e5a5d0f2e`, Main `927938da941e6bbc5fd1f89b8a8c18fe7e6dd6ed`; 공통 조상 `9016feba2a11c9b7bd8552a6ca2c3bee28e4a001`. 정렬 전 GitHub 비교는 ahead 6 / behind 2, PR review threads 0 / submitted reviews 0. 이미 검증한 최초 HEAD의 [PR CI 41228523828](https://github.com/planner77/layoutManager/actions/runs/41228523828) Verify/Docker SUCCESS는 새로운 정렬 HEAD의 성공으로 승계하지 않는다.
- `AGENTS.md`, `out/Architecture.md`, `out/Database.md`, `out/Decisions.md`, `out/Requirements.md`, `out/TestPlan.md`, `out/TestReport.md`, `out/Operation.md`, Issue [#71](https://github.com/planner77/layoutManager/issues/71)/[#73](https://github.com/planner77/layoutManager/issues/73)와 선행 #65를 검토했다. 루트 `DESIGN.md`는 없음. Editor/Site/Version/Scene/SHA 재인가, Reader read-only, 영속 receipt 원자성, 타입 FK/유효성, 브라우저 로컬 Tree/Undo 분리, 새 빈 Greenfield 전용 baseline의 운영 경계를 유지한다.
- 선행 R2 기능 브랜치 `a1bfe7ef0c9070594d6ce905b6b5668a4fe56bbd`의 Git Tree `0e3d6a2364722e1e71decdfffcdced848350bbe3`와 Main Tree `312268daf1548f224cf9f52a7ec866daf8581988`의 blob 비교에서 차이는 **out/FailureLedger.md 한 파일**이었다. Main에만 있던 PR #181 정렬·검증 이력 8줄을 원형으로 보존하고, R3의 새 변경 및 이전 모든 실패 이력을 함께 유지한다. Main 소스 코드와 R2의 공통 파일을 임의 재작성하지 않고 기존 PR HEAD와 Main HEAD를 부모로 갖는 merge commit의 Tree에 원장 결합만 적용한다.
- 위 분석 기준 미해결 리뷰 댓글 0·별도 코드 충돌 0; 정렬 후 PR 메타데이터와 ahead/behind 및 HEAD parents를 확인한다. 정렬 ref 갱신의 pull_request.synchronize 이벤트로 PR CI를 새 HEAD에서 시작한다. 실행 완료/성공·실제 CI run ID는 생성·관측 전 미검증으로 남긴다. 사용자 지시에 따라 CI 결과 모니터링은 하지 않는다. 병합, GHCR 게시, Issue 종료, 운영 DB/Volume Migration·배포·현장 승인 작업은 수행하지 않는다.

## PR #181 / Issue #65 — Main 정렬·리뷰/충돌 점검 및 PR CI 시작 기록 (2026-11-01 KST)

- 대상 [PR #181](https://github.com/planner77/layoutManager/pull/181) (Draft, #65), 기존 HEAD `a1bfe7ef0c9070594d6ce905b6b5668a4fe56bbd`, Main `ee8be69f7c4d59fc1ab07f1c614365e18ba6199a`. R1 [PR #180](https://github.com/planner77/layoutManager/pull/180)의 Squash Main과 R2 부모 `b9dcdf58a382d38dd715915b9dfd9657e40c67fd`는 Git tree `54285c7dbfe1c897867c185b54ad7d3059d4b68e`로 **소스 바이트 동일**. PR #181은 R1 이전 공통 조상 `9016feba2a11c9b7bd8552a6ca2c3bee28e4a001` 기준 diverged(ahead 3/behind 1)여서 Main 정렬이 필요했다. Main/R1 동일 tree를 근거로 실제 충돌 코드를 임의로 재작성하지 않고, 두 부모(기존 R2 HEAD + 병합된 Main)를 가진 merge commit으로 정렬한다. 소스 변경은 본 원장 기록 이외에 없음.
- `AGENTS.md`, [Architecture](Architecture.md), [Decisions](Decisions.md), [Database](Database.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md), [Issue #65](https://github.com/planner77/layoutManager/issues/65)를 확인했다. 루트 `DESIGN.md`는 없음. Global Catalogue/Admin·RBAC·CSRF·CAS·latest-only Greenfield/FK/Append-only Audit, Viewer tools panel 및 후속 #71/#73 경계를 유지한다.
- 정렬 전 GitHub PR #181 review threads **0**, submitted reviews **0**, 미해결/답변 대상 0. conflict 해결 방식은 R1과 Main 원본 tree 동일성 검증 및 parent lineage 정렬이며, 코드 경합 해소·프로덕션 시험 성공을 과장하지 않는다.
- R2 로컬 후보 근거는 114 files/760 tests PASS, Greenfield 4/4 PASS, 변경된 legacy gate E2E 별도 4/4 PASS, 별도 migrator isolated smoke로 [TestReport](TestReport.md)에 보존된다. 과거 full E2E 115/117 실패 이력 및 최초 원격 CI 미검증을 소급하여 PASS로 바꾸지 않는다.
- 정렬된 PR HEAD로 단일 branch ref push 시 `pull_request.synchronize` 이벤트가 `.github/workflows/pr-ci.yml`의 기존 PR CI를 시작하도록 한다. CI Run/Job/성공 여부는 생성 시점까지 미검증이며 사용자 지시대로 완료 모니터링하지 않는다. 병합, GHCR 게시, Issue 종료, 운영 Migration/Writer/권한 전환은 시행하지 않는다.

## R5b load fixture 재시험 GREEN (2026-11-01)

기존 목록 GET으로 metadata 기준을 조회하도록 보완한 새 load2가2 PASS1.6분으로 완료됐다(`/tmp/layoutmanager-r5b-load2.log`). 실제1k/10k LINE+10Memo 두 규모의 roundtrip·URL·API metadata/원본 SHA 불변을 확인했으며 최초405 setup 실패는 아래에 보존한다.

## R5b 부하 시험 fixture GET 경로 수정 (2026-11-01)

Root의 신규 load 시험 첫 실행2개는 export 이전 metadata 기준 조회에서 실패했다. DELETE 전용 `/api/cad-files/:id`에 GET해405/빈 응답을 JSON으로 읽은 시험 setup 결함이다. 기존 목록 GET `/api/cad-files`의 해당 items 행 조회로 수정했고 Source/DB 불변 assertion을 유지했다. 제품 변경은 없으며 새 실행 `/tmp/layoutmanager-r5b-load2.log`의 실제 결과를 기다린다.

## R5b 수직 반전 BUILD2 시각 수정 확인 (2026-11-01)

독립 QA focused3 PASS32.9초와 두 포맷 dark glyph4778pixels/UV상하 assertion을 통과했다. Manager가 실제 한글·영문 upright screenshot을 확인했으며 GLB/glTF capture는 byte동일SHA54cbc0d59dd1315c9395fdf9607342c8216eae93619b90e3080e9137894bffa8이다. 해당 시각 blocker를 해결했으며 전체 gate는 아직 진행 중이다. 상세 실제 근거는 TestReport BUILD2를 따른다.

## R5b 실제 artifact 글자 수직 반전 — 재작업 필요 (2026-11-01)

Dark glyph pixel 조건을 보완한 QA capture를 QA와 Manager가 직접 확인했다. `/tmp/layoutmanager-r5b-qa-visible-memo-glb.png` 및 glTF capture에서 한글 제목과 `Valve inspection`이 수직 반전되어 읽기 방향이 잘못됐다. Manager는 GLB screenshot을 직접 열어 확인했으며 source 검토상 helper의 +Y camera/up -Z는 기존 XY→XZ 좌표 계약에 맞는다. Annotation의 topLeft=labelZ, bottomLeft=labelZ-height 좌표 관계와 UV가 화면상의 상하 방향을 뒤집는 것으로 판단한다. 단순 camera 회전으로 가리는 해결은 허용하지 않는다.

이는 실제 제품 시각 결함이며 glyph pixels 존재·Loader 성공만으로 TC-R5B-02를 PASS 처리하지 않는다. Product 수정/새 build 및 두 형식 실제 WebGL 한글 screenshot 재검증 전 R5b 수용을 보류한다. Root에 즉시 전달했으며 활성 권한/lifecycle 시험과 rebuild를 조정한다. QA는 production을 수정하지 않았다.

## R5b QA glyph pixel assertion false-positive (2026-11-01)

초기 QA3 PASS의 inkPixels 조건이 배경 #fffef0까지 셌다(RGB 어느 하나<245). Root가 발견해 dark glyph(allRGB<150·alpha>0) 및 실제 한글 screenshot 재검토·3개 재실행을 지시했다. 초기 실행의 Loader/render 사실은 보존하지만 glyph pixels 검증 PASS 주장은 보류한다. 제품 실패로 재분류하지 않는다. 최종 결과는 TestReport를 따른다.

## R5b source 검토 2건 보완 확인 (2026-11-01)

실제 artifact extras 정밀도 고지 및 generic Memo GET 호환을 보완했다. Manager 독립 집중 실행2 files/27 PASS1.08초(`/tmp/layoutmanager-r5b-manager-repair-review.log`)로 해당 재작업을 수용했다. 최초 검토 결함은 아래에 보존하며 Browser/전체 gate 완료를 뜻하지 않는다.

## R5b Developer handoff source 검토 — 재작업 2건 (2026-11-01)

Developer는 focused6 files/53 PASS, typecheck/소유 파일 lint/diff-check PASS를 보고했다. Manager가 core/font/raster/annotation 및 authorized Memo GET 소스를 직접 검토해 두 보완을 지시했다. 정밀도 warning이 반환 report에만 있고 실제 GLB/glTF extras에는 없어 artifact 고지 계약을 충족하지 않았다. 또한 기존 generic Memo GET에 새 DWG415 제한을 넣어 호환 envelope 확장 범위를 벗어났다. 실제 bytes의 경고/precision basis 검증과 기존 feature-off/anchor-absent·허가된 DWG 빈 목록 호환 검증을 요구했다.

이 시점 core 최종 수용은 보류다. QA는 독립 Browser spec/새 Loader·실제 PNG/WebGL helper 작성만 시작하며 Root의 단일 production build 완료 전 실행하지 않는다. Root는 별도 authority/lifecycle Browser를 담당한다. 실제 Browser 결과는 아직 NOT RUN이다.

## R5b 읽기 전용 Memo projection — RED/GREEN 및 source 검토 (2026-11-01)

Root의 신규 client proof 시험 첫 실행은 **2 files/20 PASS·1 FAIL,549ms**였으며 singular transform `[0,0,0,0,10,20]`에서 예상 BROKEN/마지막 WCS(1,2) 대신 ATTACHED/(10,20)을 반환해 실패했다. 로그는 `/tmp/layoutmanager-r5b-memo-client-unit1.log`다. 기존 reconcile의 forward projection만으로는 비가역 행렬을 차단하지 못한 작은 기존 결함이며 단순 읽기 전용 API 리팩터링으로 숨기지 않는다.

공유 snapshot 계산에서 next world를 계산한 뒤 `invertAffine`로 가역성을 검증하고 성공한 경우에만 world를 바꾸도록 보완했다. 유효 target의 기존 reconcile lastWorld 업데이트는 유지하며 snapshot은 복사된 ref/local/world를 반환하고 store를 바꾸지 않는다. Root 재시험 `/tmp/layoutmanager-r5b-memo-client-unit2.log`: **3 files/23 PASS,712ms**. Manager가 최종 로그와 domain diff, `exchange-memo-visual.ts`, `exchange-memo-authority.ts`를 직접 검토했다. selected Memo proof/whitelist, same-revision SESSION 재사용, unbound fresh canonical, actual GET actor/scope/revision0/count/unique ID decoder에 현 source blocker는 없었다.

이는 집중 domain/client proof 결과다. UI hook/실제 Memo GET/PNG·GLTF·Browser 및 전체 R5b 수용은 아직 아니다. Memo 미선택 job에서는 global targetEpoch를 포함한 Memo fingerprint 자체를 적용하지 않아 공개 Source-only가 무관한 Memo 변경에 종속되지 않아야 한다. 해당 통합은 Root 후속 검증이다.

## R5a 최종 재시험 GREEN (2026-11-01)

Test-only fixture 보완 뒤 집중8 PASS11.19초 및 새 전체127 files/858 PASS422.47초를 확인했다. Greenfield 새 전체17 PASS4.2분, 독립 QA General 전체128 PASS14.7분도 통과했다. 이전 실패의 수치/원인 한계는 아래 그대로 보존한다. 제품 auth guard 변경 없이 해당 로컬 gate를 수용했으며 원격 CI는 별도다.

## R5a 전체 Unit 정확 실패 및 통제시계 회귀 설계 (2026-11-01)

Root 첫 whole unit 최종 결과는 **127 files 중126 PASS/1 FAIL,857 tests 중856 PASS/1 FAIL,494.39초**다. 정확 오류는 `G7_RUNTIME_ADMIN_APPROVAL_CHANGED`: runtime-admin의 transaction-time check → g2-store insertFirstAdmin → async password hash 후 admin-setup → g7-greenfield 최초 bootstrap assertion에서 발생했다. 최초 gate와 async 작업 후 gate가 달랐다는 근거이며, 원래 host wall clock의 역행을 직접 측정한 것은 아니다.

Manager가 test-only 보완을 승인했다. 양성 first-admin/renew 시험은 Date만 고정하고 finally에서 원복한다. 별도 음성은 T0에 실제 signed gate ACTIVE를 확인하고 real async scrypt 진행 중 Date를 T0-5초로 바꾼 뒤 정확 approval-changed·User/Audit0을 검증한다. T0+1초로 복구 후 real bootstrap 성공을 확인한다. 타 timer/crypto/store/gate를 mock하거나 production 검사를 완화하지 않는다. 이 결정적 음성이 같은 오류를 재현해도 최초 host 역행의 관측 증명으로 해석하지 않는다. 집중·새 전체 unit 결과는 아직 대기다.

## R5a 전체 gate 진행 — Greenfield 재실행 / Unit 원인 미확정 (2026-11-01)

전체 Greenfield 첫 최종 실행은 **16 PASS/1 FAIL,4.8분**으로 끝났다. 새 R5 authority4 및 first-install2는 그 실행 안에서 PASS이나, 기존 R3 GET fixture의 ECONNRESET 때문에 전체 성공은 아니다. Root가 Manager 검토를 거친 GET-only maxRetries1을 적용하고 전체17을 새 `/tmp/layoutmanager-r5-greenfield-final2.log` 및 대응 results로 재실행 중이다.

Whole unit은 아직 최종 출력 전이며 `g7-greenfield.test.ts`의 최초 Admin one-shot/renew 사례1 FAIL가 관측됐다. 같은 사례의 집중 진단은1 PASS/6 SKIP,685ms(`/tmp/layoutmanager-r5-greenfield-unit-diagnosis.log`)지만 원래 전체 실패를 대체하지 않는다. 원래 정확한 실패 원인/stack을 확인하기 전에는 host clock rollback으로 단정하거나 제품/fixture 시계를 변경하지 않는다. 전체 unit PASS 및 R5a 최종 수용은 보류다.

## R5a 전체 Greenfield의 기존 R3 fixture transport 실패 (2026-11-01)

Root full Greenfield17 실행에서 기존 `typed-outline-races.spec.ts`의 older in-flight list 사례가8.4초에 `route.fetch` ECONNRESET로 실패했다. `capturedResponse`의 실 GET response를 얻는 단계이며 stale-response assertion 이전이다. 새 R5 authority4개는21.0/10.9/9.9/11.7초로 모두 PASS했고 후속 기존 사례도 서버가 정상인 상태로 진행했다. 전체17의 최종 결과는 별도로 확인한다. 원시 Playwright error context에는 credential이 포함될 수 있어 정제된 오류 종류/위치만 기록한다.

Manager는 현재 실행 종료 뒤 test-only helper에서 GET method를 명시 확인하고 `route.fetch({maxRetries:1})`로 ECONNRESET 한 번만 재시도하는 보완을 수용했다. 설치된 Playwright Route 계약상 HTTP 응답 코드는 재시도하지 않는다. POST/write나 실제 서버 요청을 mock하지 않고 held read/post 순서·stale snapshot/new row assertions를 유지한다. 반복 reset이 남으면 추가 transport 진단이 필요하며 무제한 retry로 통과시키지 않는다.

## R5a 수정 build의 Browser fixture 후속 (2026-11-01)

- General 집중4의 첫 수정-build 실행은3 PASS/1 FAIL이었다. OFF/no-protected-read4.8초,320px·unit·focus4.1초,Generated6.3초는 PASS다. Hidden-layer는 artifact 생성 경로를 통과했으나 Node GLTFLoader의 `ProgressEvent is not defined`로 검사 harness가 실패했다. QA가 core 시험과 같은 test-only polyfill을 추가하고 새4개 실행을 진행한다. 제품 수정/재build 사유가 아니다.
- Root authority Browser attempt1은5 PASS/1 FAIL,1.4분이다. first-install2·actor 전환·직렬화 후 row revision·network/JSON proof 검사는 PASS다. Public 사례는 export 이전 `?source=build`의 기존 Scene preflight가 익명을 차단해 로딩 단계에서 실패했다. 인가된 actor로 Source를 먼저 로드한 뒤 logout/noSite Reader로 전환하는 fixture로 수정한다. 기존 Viewer/원본 GET 정책을 완화하지 않으며 새 전체6개 결과를 별도로 확인한다.

## R5a foreign Three guard 수정 source 수용 (2026-11-01)

Manager가 실제 수정 diff와 `/tmp/layoutmanager-r5a-foreign-core-qa.log`의 **2 files/31 PASS,762ms**를 확인했다. Installed three-dxf-viewer의 실제 getFromPath LINE은 app BufferGeometry instanceof=false지만 isBufferGeometry=true였다. 새 구조 검증은 required geometry/attribute API와 typed storage를 확인하며 기존 finite/index/arity/material/group/planarity/budget 검사를 유지한다. 단순 flag-only 위조는 제외한다. 실제 라이브러리 객체를 사용하는 회귀를 추가했고 Manager가 source repair를 수용했다.

수정 포함 production rebuild·전체 unit은 Root가 시작했으며 아직 결과를 확인하지 않았다. General attempt5의 실제 Browser FAIL는 이 focused 결과로 PASS 재분류하지 않고 수정 build에서 별도 재시험한다. 최종 수용 gate는 TestPlan checklist를 따른다.

## R5a General Browser 실제 결함 — legacy DXF geometry 제외 (2026-11-01)

QA attempt5의 실제 three-dxf-viewer DXF A/B/C에서 B 레이어를 화면에서 숨긴 뒤 B만 명시 export했다. Inventory에는 B1개가 있지만 preview는 지원0/제외1·`UNSUPPORTED_GEOMETRY`를 표시하고 download를 차단했다. `/tmp/layoutmanager-r5-ui-attempt5.log`와 attempt5-results의 error-context/trace를 보존했다. Manager는 visibility filter를 원인으로 단정하지 않고 실제 제외 코드를 확인했다. 현재 guard의 `geometry instanceof THREE.BufferGeometry`가 library의 별도 Three constructor와 충돌하는 가능성을 Root/Developer에게 전달했다. 합성 core29 PASS가 실제 library 객체 경로를 검증한 것으로 확대되지 않는다.

Root3411 시험과 공유 build가 활성화된 동안 runtime 수정·재build는 대기한다. Source download case는 수정 후보에서 재시험해야 하며 R5a 전체 수용은 진행 중이다. 별도의 Generated transform/export/history Browser case는 PASS3.3초, 신규 QA spec 타입 오류 수정 후 typecheck PASS(`/tmp/layoutmanager-r5-ui-types-final.log`)다.

## R5a Browser 선행 타입 검사 중단 / 레이어 toggle fixture 보완 (2026-11-01)

Root의 Greenfield3411 명령은 Browser 진입 전 전체 typecheck exit2로 중단됐다. QA 신규 `issue91-exchange.spec.ts`의 Window→필수 `__exchangeBlobTypes` cast 두 곳에서 TS2352가 발생했다. QA가 자기 test 선언만 수정하며 이 실행의 Auth Browser는 FAIL이 아니라 **NOT RUN**이다. Root auth spec은 first-install 선행 순서를 유지하도록 `r5-exchange-authority.spec.ts`로 명명했다.

General attempt3에서 Generated 변환/선택/export/history case는 PASS3.3초다. Hidden-layer case는 기본 `layerPanelOpen:true` 상태에서 메뉴를 무조건 클릭해 panel을 닫은 시험 준비 오류로 중단됐다. Manager가 원인을 지적했고 QA가 이미 열린 dock를 사용하도록 수정했다. 제품 Layer Table/Renderer 결함으로 판정하지 않는다. `/tmp/layoutmanager-r5-ui-attempt3.log`와 첫 실행 로그는 보존한다.

## R5a General Browser 첫 실행 — 시험 selector/setup 보완 (2026-11-01)

독립 QA의 port3410 첫 실행은0/2로 실패했다(`/tmp/layoutmanager-r5-ui-attempt1.log`, `/tmp/layoutmanager-r5-ui-attempt1-results`). 존재하지 않는 레이어 패널 testid를 사용했고 실제 UI는 `complementary`/`전체 화면 레이어`였다. Generated 도구는 dock를 연 후 표시되는데 시험에서 그 준비가 빠졌다. QA는 자신이 소유한 새 spec의 selector/setup만 수정했다. 제품 결함으로 판정한 결과가 아니며 실제 export 수용 assertion 이전 실패다. 재시험 결과는 별도 기록한다.

## R5a 독립 core QA 실패·수정 — 그룹별 확장 정점 사전 한도 (2026-11-01)

최초 independent QA1 PASS/1 FAIL,491ms에서150k source vertices를 두 material group이 재사용해 export300k가 되는 조건이 사전250k 한도를 우회하고 복사 뒤 거절됐다. position.getX spy450,001회가 복사 수행을 입증했다. Developer가 group 확장 상한을 사전 계산해 수정했으며 회귀는 source read0으로 거절된다. 최종 core22+QA7=29 PASS737ms와 QA 별도7 PASS414ms를 확인했다. 첫 실패 로그는 따로 저장하지 않았으며 재현 테스트와 보고를 보존했다. 상세 근거는 TestReport R5a를 따른다.

## R4 계측 최종 보완 — 남은 heap 추세는 OPEN (2026-11-01)

Handler-release-only 실행은2 PASS/1.9분(`/tmp/layoutmanager-r4-inspector.log`)이며10k heap은1차dispose31.70MB→2차48.58MB였다. Manager source review로 유지 중인 Canvas ElementHandle도 해제하도록 보완했다. 최종 `/tmp/layoutmanager-r4-inspector-final.log`는2 PASS/1.6분,42개 inspector handler와 Canvas handle을 해제한 조건에서도10k heap31,645,380→48,449,656bytes를 관측했다. 이 증가16,804,276bytes는 원인 미확정으로 남긴다. 측정대상7종 listener baseline/Worker0/재진입0Memo는통과했지만 memory leak-free나16.7ms SLA를 입증하지 않는다.

최종 일반124 PASS13.0분/Greenfield13 PASS2.7분/제품unit123 files814 PASS 및 Auth 집중16·Auth Browser1·Legacy1·static 성공으로 기능/계측 범위는 로컬 수용했다. 이전 실패를 삭제하지 않으며 #174 성능·실환경 항목은OPEN, PR/원격CI/배포는 별도다.

## R4 최종 static/Greenfield 후속 확인 및 heap 계측 점검 (2026-11-01)

QA spec의 prefer-const 수정 후 whole lint는0 ERROR/기존9 WARNING, whole typecheck PASS다. Root fresh Greenfield13은13 PASS/2.7분(`/tmp/layoutmanager-r4-greenfield-rerun.log`)으로 앞선12 PASS/1 FAIL의 fixture 보완을 확인했다. 새 Auth harness 집중 Root 재실행은3 files/16 PASS/20.05초이며 Developer22.03초와 별도다.

일반Browser의2차 dispose 뒤10k heap 증가를 관찰했지만 CDP `getEventListeners`가 반환한 handler/originalHandler RemoteObject가 inspector에 남을 수 있음을 Root가 확인했다. 기존 window objectGroup만 해제하던 계측에 반환 handler handle 명시 해제를 추가하고 별도 성능2개 재실행으로 비교한다. 원래 수치를 삭제하거나 제품 leak/해결로 확정하지 않는다. Listener 결과도 측정대상7종 app window listener의 baseline 복원 범위로 한정한다.

## R4 최종 전체 Lint의 신규 시험 선언 수정 (2026-11-01)

Root 최종 전체 typecheck는PASS다. 첫 whole lint는 신규 QA spec의 재할당 없는 `let release`에서 prefer-const1 ERROR와 기존9 WARNING을 보고했다. Root가 해당 한 단어를const로 고쳤으며 제품 코드/시험 기대는 바뀌지 않았다. 전체 lint 재검사 결과를 별도로 확인한다. 이미 실행 중인 전체 Greenfield가 읽은 test와 의미가 같다는 판단이며 실패 이력을 삭제하거나 warning0으로 표현하지 않는다.

## R4 TC-R4-009 후속 집중 GREEN (2026-11-01)

새 frozen test snapshot의 `/tmp/layoutmanager-r4-attempt5.log`는4 PASS/54.9초다. 실제 committed response hold/대상 삭제 후 canonical WCS+부분 완료 notice+SESSION detach/no-rebind와, definite precommit abort 시 기존 binding/서버 revision 보존을 확인했다. Manager가 실제 로그를 확인했다. 이전 selector/route 수명 fixture 실패를 소급 PASS로 바꾸지 않으며 새 전체 Greenfield13을 별도 실행한다.

## R4 Auth fixture 후속 GREEN (2026-11-01)

명시 opt-in `G7_RUNTIME_E2E_MONOTONIC_CLOCK=true`는 owned disposable Auth fixture의 정확 DB/storage/trust/approval 경로와 owner/mode/no-symlink·hardlink 조건을 통과한 경우에만 별도 preload를 사용한다. 제품 Auth runtime/rollback guard는 변경하지 않았다. Negative/valid child-process guard와 기존 Auth 회귀 **3 files/16 PASS,22.03초**, fresh controlled Auth **1 PASS,13.6초**(`/tmp/layoutmanager-r4-auth-clock-results`)다. Manager source review/로컬 수용을 완료했고 원래 native1FAIL16.6초는 그대로 보존한다.

Root 첫 전체 Greenfield13의 최종 결과는12 PASS/1 FAIL/3.2분으로, 위 TC-R4-009 tree/cleanup fixture 실패와 일치한다. 수정된 test snapshot의 다음 실행은 별도 결과다.

## R4 전체 Greenfield 중 TC-R4-009 fixture 이름 오류 (2026-11-01)

Root 전체13개 실행의 committed-response case는11.3초에 실패했다. 실제 imported Generated Tree 표시는 외곽선1/2/3인데 시험은 fixture의 R4 target A 이름으로 찾았다. Held PATCH는 실제 commit했지만 삭제/후속 boundary assertion 전에 selector가 실패했다. finally의 조기unroute/release 이후 중복 PATCH409와 route-already-handled 오류가 primary를 가렸다. 후속 failed-precommit case는 **1 PASS,5.9초**였다. 전체13개 결과는 아직 미완료이며 이 중간 결과로 전체 PASS를 주장하지 않는다.

수정은 new test file에 한정해 exact `data-tree-key=local:local-1/2/3`을 사용하고, click 전 response waiter·one-shot handler의 page 수명 유지·release 후 settled response를 기다리게 한다. 제품 변경은 없다. 다음 focused4 및 최종 전체13 결과를 별도로 기록한다.

## R4 Auth 실패 원인 확인 — 실제 wall rollback (2026-11-01)

Developer가 `/tmp/layoutmanager-r4-auth.log`의 **1 FAIL,16.6초**와 보존 trace를 안전하게 분석했다. trace origin wall18:57:26.386Z/monotonic6261.622에서 Current click16218.820은18:57:36.343을 예상하며 실제 PUT36.560Z/200이었다. Delete confirm16914.997은18:57:37.039에 해당하지만 preflight status/session은18:57:34.632/.644Z로 기록돼 약2.4초 역행했다. 같은 cookie 상태에서 Session200/401/200이 관찰됐고 DELETE는 없었다. 이후5초 샘플의 안정성(delta−0.4ms)은 앞선 역행을 부정하지 않는다.

G3 authenticate는 transaction 안에서 `now < issued_at` 또는 `now < last_seen_at`을 의도적으로 거절한다. Manager는 폐기 가능한 Auth WebServer fixture에만 통제 monotonic clock을 적용하는 harness 보완을 승인했다. Production guard와 명시적 rollback 음성 시험은 유지하고, owned fixture path 제한·집중 guard 회귀·fresh Auth Browser 성공을 확인한 후 해결로 기록한다. 현재 수정/재시험 결과는 대기다.

## R4 TC-R4-009 세 번째 시도 — tools toggle fixture (2026-11-01)

독립 QA의 attempt3는 **2 PASS/2 FAIL,1.2분**이다. prerequisites는6.8초/34.9초에 통과했고 두 신규 case는 PATCH 전 최근 메모 button의5초 locator timeout으로 실패했다(`/tmp/layoutmanager-r4-write-race-attempt3-playwright-results`). Helper가 이미 열린 tools 메뉴를 다시 눌러 닫았음을 snapshot으로 확인했다. 불필요 toggle을 제거하고24자 이내의 고유 제목을 유지했다. 제품 코드는 변경하지 않았다.

후속 attempt4는 조정 요청 직전 시작돼 즉시 Ctrl-C로 중단했으며 완료된 test가 없다. Port3406 종료를 QA/Manager가 확인하고 파일을 freeze했다. 아직 TC-R4-009의 실제 held PATCH assertion에는 도달하지 않았으며 다음 focused/전체 Greenfield 실행 결과로 판정한다.

## R4 Auth Browser 최종 회귀 실패 — 진단 중 (2026-11-01)

Root의 Auth 실행은 **1 FAIL**(`/tmp/layoutmanager-r4-auth.log` 및 results, port3407)이다. 실제 관찰은 Current PUT200 뒤 Version 삭제 UI의 Session preflight401/로그인 만료 안내이며 DELETE는 전송되지 않았다. 뒤에 Session200/401이 교차했다. R4에서 Auth runtime 코드를 바꾸지 않았다는 사실만으로 시험 실패를 무효화하지 않는다. Auth config에 Greenfield opt-in clock이 없고 host rollback 이력이 있으나 이번 원인은 아직 측정·확정하지 않았다. Developer가 안전한 trace로 clock fixture와 guard 동작을 분리 진단한다. 제품 auth guard 완화 없이 해결/재시험 전까지 R4 전체 수용을 보류한다.

## R4 TC-R4-009 두 번째 시도 — 최근 목록 제목 selector (2026-11-01)

독립 QA의 fresh wrapper build 실행 `/tmp/layoutmanager-r4-write-race-final.log`는 setup2 PASS/committed race1 FAIL(120초)/abort1 INTERRUPTED, exit130이었다. 최근 메모 목록은 제목을24자로 표시하지만 helper는 그보다 긴 무작위 full title을 exact match로 찾아 클릭하지 못했다. cleanup GET timeout은 secondary이며 held PATCH 경계에는 아직 도달하지 않았다. fixture 이름을24자 이내의 고유 제목으로 바꾸고 primary click을 짧게 제한해 실제 실패 지점을 드러내도록 지시했다. 제품 코드를 바꾸거나 race assertion을 줄이지 않으며 다음 새 실행을 별도 기록한다.

## R4 BLOCK/다중 target 최종 집중 확인 (2026-11-01)

fresh wrapper build에서 frozen sync spec의3개 combined Browser가17.1초에 PASS했다(`/tmp/layoutmanager-r4-sync-final-results`). BLOCK fixture는 유효hex INSERT C1/C2로 정리하고 BOUNDS를 숨겨 x0/.6 후보의 서로 다른 ID와 선택pin.6을 확인했다. 최초 I1/I2 fixture와 변경 차이가 있으므로 실제 Browser만으로 wrapper 단독 원인을 증명했다고 표현하지 않는다. 순수 projection RED/GREEN이 singleton Material exclusion을 별도로 분리한다. 기존1FAIL8.8초 및 Generated 실패/중단 이력은 보존하고 최종 전체 회귀는 별도 기록한다.

## R4 다중 target Browser 시험 작성 이력 (2026-11-01)

Developer가 별도 실행으로 보고한 이력이다. 첫 두-case 실행은 RENDER1 PASS/Generated1 FAIL(90초 timeout, tools가 pin click을 가림), reporter1.7분이며 trace가 다음 실행에 덮여 terminal 오류만 남았다. 두 번째는 RENDER1 PASS/Generated1 FAIL(90초 timeout, 이미 열린 tools를 toggle해 `generated-undo`가 사라짐), reporter1.6분이며 `/tmp/layoutmanager-r4-sync-second-results`에 보존했다.

두 Memo로 확대 후 Generated-only는1 FAIL/14.85초(`/tmp/layoutmanager-r4-generated-results`), attachment 사전 확인 추가 후1 FAIL/13.51초(`...-generated-2-results`)였다. Tree가 두 번째 외곽선으로 카메라를 focus해 첫 pin DOM이 offscreen culling됐음을 trace로 확인했고 stale 관계 결함으로 단정하지 않았다. 탐색 실행은 공유 build를 위해 약65초 후 exit130/1 INTERRUPTED(`...-generated-3-results`)로 중단했다.

실제 화면맞춤 precondition 후 fresh build의 Generated-only는 **1 PASS/11.5초**(`/tmp/layoutmanager-r4-generated-4-results`), 별도 반복 LINE Handle/SceneWork 시험은 **1 PASS/10.8초**(`/tmp/layoutmanager-r4-render-results`)다. 이전 실행을 합산해 단일 suite PASS로 기록하지 않으며 BLOCK 시험은 별도다.

## R4 BLOCK wrapper 집중 RED/GREEN — 실제 Browser 대기 (2026-11-01)

Root 순수 projection RED는 `/tmp/layoutmanager-r4-block-unit-red.log` **3 FAIL/2 PASS,253ms**다. 기존 wrapper가 단일 Material 배열까지 제외하는 경계를 재현했다. 수정은 정확 singleton material만 풀고 visibility와 geometry group의 유효한 index0 전체 drawRange coverage를 요구한다. empty/multi/hidden/partial/invalid groups는 거절하고 upstream 객체/geometry/ID는 변경하지 않는다.

집중 GREEN `/tmp/layoutmanager-r4-block-unit-green.log`는 **4 files/25 PASS,766ms**이며 SceneS5/loader/render 회귀 및 THREE_JSON/CUSTOM_DTO roundtrip ID 보존을 포함한다. Manager가 diff의 group coverage/불변 경계를 검토했다. 실제 BLOCK Browser fresh build와 최종 전체 재시험은 아직 대기이며 이전 Browser RED를 PASS로 소급 변경하지 않는다.

## R4 TC-R4-009 독립 Browser 첫 시도 — fixture 재선택 timeout (2026-11-01)

독립 QA의 새 `memo-snap-write-race.spec.ts` 첫 실행은4개 선택 중 **first-install2 PASS/committed-response case1 FAIL/abort case1 INTERRUPTED**, exit130이다(`/tmp/layoutmanager-r4-write-race-qa.log`, 같은 prefix의 results). 실제 Memo 생성 후 편집 취소→Canvas pin 재선택 click에서 대기했고120초 timeout 뒤 finally cleanup GET도 만료됐다. 안전한 trace action 확인으로 primary pin 재선택과 secondary cleanup을 구분했다. 의도한 held committed PATCH/후속 경계 assertion에는 도달하지 않았으므로 제품 race 결함이나 PASS로 기록하지 않는다.

QA는 기존 tools의 최근 메모 목록으로 재선택하고 active Session 증명 뒤 후보가 준비될 때까지 기다리도록 new test file만 보완했다. 작업 중인 마지막 case는 공유 build 교체를 위해 중단했으므로 결과가 없다. Root BLOCK wrapper의 fresh build 완료 후 별도 새 실행으로 확인한다.

## R4 BLOCK instance 실제 Browser RED — 진단 중 (2026-11-01)

Developer의 신규 실제 DXF Browser 시험은 BLOCK 정의 LINE B1과 INSERT I1/I2(x=0/0.6)를 사용했으며 **1 FAIL,8.8초**를 Root가 보고했다(`/tmp/layoutmanager-r4-block-results`). 렌더 완료 후 ENDPOINT 후보가1개여서 서로 다른 instance 후보2개 조건을 만족하지 못했다. 현재 하나의 후보가 bounds frame인지 BLOCK인지도 진단 중이다. TC-R4-001의 distinct BLOCK instance 요구를 시험에서 삭제하거나 전체 수용으로 처리하지 않는다.

Manager는 fixture framing/visibility와 실제 renderer leaf·world transform·wrapper ID를 먼저 확인하도록 지시했다. 정상 입력의 wrapper 해결을 우선하며 외부 라이브러리를 수정하지 않는다. 아직 제품 원인·지원 제한·수정 성공은 확정하지 않았다. 이 RED와 후속 결과를 분리 기록한다.

## R4 준비된 스냅 의도의 Actor 전환 — 실제 Browser RED (2026-11-01)

Root `/tmp/layoutmanager-r4-actor-red.log`는 first-install2 PASS/신규 Actor case1 FAIL,31.7초다. Actor A에서 준비한 draft 뒤 동일 Browser 인증을 합법적인 Editor B로 바꾸고 focus refresh 없이 확정했다. Root의 안전한 trace 추출에서 Memo POST1회/201, `createdById`가 B와 일치했다. Server role 우회가 아니라 준비된 사용자 의도와 확정 Actor가 달라진 client lifecycle 결함이다. Credential/header 값은 문서에 기록하지 않는다.

수정은 직접 Session 증명 actorId를 intent에 묶고 fresh pre-write actor와 대조한다. 비동기 준비의 query generation/raw WCS/context/viewEpoch와 편집·취소·후속 조회·unmount 무효화를 추가하며 catalogue actor 의존성을 없앤다. OFF는 로컬 경로, 기존 pre/post actor guard와 owner 정책은 유지한다. Manager가 source 변경을 검토했고 typecheck/관련 lint exit0을 Root가 확인했다. 후속 Root build PASS, intent unit5 PASS/166ms 및 실제 Browser3 PASS/40.6초(`/tmp/layoutmanager-r4-actor-green.log`)를 확인했다. 독립 검증은 진행 중이며 전체 R4 수용은 별도다.

## R4 Memo Browser pointer fixture 보완 (2026-11-01)

Root 두 번째 실행은7 PASS/1 FAIL,40.5초였다. 남은 pointer case는 열린 전체 Tools dock이 핀 좌표를 덮어 drag 대상에 도달하지 못했다. 시험에서 Tools를 닫고 pin hover actionability 및 pointerup 전 preview=true를 확인한 뒤 세 번째 `/tmp/layoutmanager-r4-memo-browser-third.log` **8 PASS,36.0초**를 확인했다. 이 관찰을 제품 drag 결함으로 확정하지 않는다. 처음5 PASS/3 FAIL의44.3초 실행은 아래 기록대로 보존한다. 성능·영속 KEEP/DETACH·여러 target 수명주기 시험은 별도다.

## R4 독립 QA 시험 작성 오류 — 최종17 PASS와 분리 (2026-11-01)

QA가 실제 terminal/tool 기록으로4번의 집중 실행을 보고했다. 첫 실행은 unit2 PASS, integration은 fixture brace parse 오류로0 tests. 두 번째는2 files/17 중 unit2 PASS/integration13 PASS·2 FAIL(`Response.status`를 함수로 호출, invalid coordinate의422를400으로 기대). 세 번째는 unit2 PASS/integration13 PASS·2 FAIL(회전 float 정확 equality, Site B를 signed authority 생성 뒤 추가하여503). 최종 실행은 Site B를 서명 전에 만들고 numeric status/422/오차 허용 assertion을 적용해2 files/17 PASS,12.27초다. 제품 guard를 완화하지 않았고 별도 logfile을 생성하지 않았다. 이 작성 실패를 기존 제품 결함으로 기록하지 않는다. R3 의존성 repair 게시와 R4 재개는 Decisions/TestReport 최신 기록을 따른다.

## R3 repair CI의 Greenfield 실패 / R4 WIP 보존 (2026-11-01)

- 새 Run41225698027 / Verify124609264151은 Greenfield E2E step에서 실패했다. Docker124609263950은 SUCCESS다. Root가 로그·안전한 artifact를 조사 중이며 상세 원인과 새 수정은 미확정이다. 이전 test-clock 결함의 local795PASS는 이 새 실패를 해소한 증거가 아니다.
- R4는 조건부 병행 구현을 중단했다. 이미 작성된 domain/server/UI/시험과 설계는 보존하고 새 실행/수정을 하지 않는다. CI 실패를 확인한 뒤 진행하지 않은 시험은 PASS로 쓰지 않는다.
- 별도 R4 local8 Memo Browser 실행: **5 PASS/3 FAIL,44.3초**. Root가 확인한 fixture 원인은 zoom 후 pin DOM culling을 문서 count로 기대한 검사, 생성 saved ID를 local-N으로 고정한 가정, 유지된 binding의 reload discard 대화상자를 처리하지 않은 시험이다. 해당 fixture 수정과 discard 안내 문구 보완은 WIP에 보존했고 재시험은 아직 미완료다. 제품 geometry/세션 보호를 무력화하여 통과시키지 않는다.

## R3 CI repair 게시 후 조건부 R4 재개 (2026-11-01)

재현된 fixture clock 결함의 test-only 수정08cd406을 게시하고 R4 기반에 반영했다. 전체120/795 및 독립QA53·Scene12 로컬 검증으로 Manager가 구현 HOLD를 해제했다. 새 CI41225698027은 진행 중이고 이전790PASS/1FAIL Verify 기록을 성공으로 바꾸지 않는다. 실제 새 실패는 다시 HOLD 조건이다. 자세한 source·게시·실행 근거는 TestReport와 Decisions의 최신 항목을 따른다.

## R3 PR182 — 원격 TC-R2-003 상태 불일치 (2026-11-01)

- Run41224371317 / Verify124605333600 / source624dd0f: **118 files PASS /1 FAIL,790 tests PASS /1 FAIL,119.18초**. `tests/integration/outline-type-catalog.test.ts` TC-R2-003 line191에서400을 기대했으나503이었다. Root가 실제 Job 결과를 확인했으며 원인·수정은 진단 중이다.
- Docker는 확인 시 phase1 build 진행 중이었다. 이후 step/Job 결과를 미리 PASS로 쓰지 않는다. 이전 local119/791PASS와 다른 실행이며 원격 실패를 숨기지 않는다.
- Manager는 R4 구현을 HOLD하고 기존 R4 설계·시작된 변경을 보존하도록 지시했다. 제품 승인/Session/CSRF guard 또는 기대값을 근거 없이 완화하지 않는다. Root 진단→Manager 검토→QA 집중 검증과 실제 새 CI 결과를 후속 기록한다.

## R3 PR182 두 번째 Verify 실패 — Greenfield route 수명 조사 (2026-11-01)

- [Run41225698027](https://github.com/planner77/layoutManager/actions/runs/41225698027), source `08cd4062092e0dff6c68ca211accab8d163a0be5`: Verify124609264151은 Greenfield **8 PASS /1 FAIL,4.0분**으로 실패했다. 전체 unit120 files/795 tests, 일반 CAD117 및 Auth1은 PASS이며 Legacy는 SKIPPED다. Docker124609263950은 SUCCESS다. 앞선 clock repair의 원격 unit 재검증과 새 Browser 실패를 구분한다.
- 실제 실패는 `typed-outlines.spec.ts`의 replay 이후 다음 타입 select가 disabled로180초 대기한 것이다. finally logout timeout은 후속 현상이다. trace에서 첫 POST commit/응답 abort와 같은 key replay200 이후 refetch의 auth/session GET이 미완료(status/time -1)이며 `page.unroute`와 시점이 겹친다. Root가 검토한 trace에 근거한 route 수명 가설이고 서버 auth 장애나 Playwright bug의 확정 증거는 아니다.
- Manager 승인 test-only 변경: 응답 소실 handler를 page 수명 동안 유지해 이후 요청은 통과시키고 조기 `unroute`를 제거한다. replay 직후 type select enabled를5초 제한으로 확인한다. 원래 key/Audit/receipt assertion과 제품 권한 guard를 유지한다. Root fresh build·typecheck·관련 lint PASS, controlled clock 전체9개는9 PASS/1.9분이다. 독립 QA 첫 실행은5 PASS/4 FAIL/1.6분: operations-logs403 기대/401 응답, outline-types 로그인 heading, typed primary 및200-row case 실패다. 실행에서 `G7_E2E_MONOTONIC_CLOCK=true`가 누락됐고 custom temp root를 사용했으므로 표준 auto temp root/controlled clock으로 독립 재시험한다. Host rollback과의 연관은 가능성으로 구분하며 최초 실패를 삭제하지 않는다. 표준 controlled 독립 재시험은9 PASS/1.8분이지만 `business_scene_origin_reset`401이 남았다. Source case가 reset 응답을 직접 await하지 않아 unchanged-outline poll이 조기 통과할 수 있다는 검증 한계를 Manager가 확인했다. 이전9PASS를 reset 성공으로 기록하지 않는다. Manager 지적으로 Root가 test-only 응답200/`SOURCE_ONLY` assertion 보완을 결정했다. 앱 코드는 유지하고 동일 최신 build에서 Root/독립 QA 전체9개를 다시 실행한다. 최종 수정 후 Root9 PASS/2.2분(`/tmp/layoutmanager-r3-ci-routes-reset.log`), 독립 QA9 PASS/2.1분(`/tmp/layoutmanager-r3-ci-routes-reset-qa.log`)에서 정확 reset200/`SOURCE_ONLY`와 불변 snapshot/overlay를 확인했다. 최종 typecheck/관련 lint도 PASS다. Manager LOCAL REPAIR ACCEPT/게시 GO이며 새 HEAD 게시·R4 WIP 보존 기반 반영 후 조건부 재개한다. 새 원격 CI는 미확인이고 새 실제 실패는 다시 HOLD한다. 이전 실패 실행은 그대로 보존한다.

## R3 PR182 Verify 실패 — 서명 시각과 test-clock rounding 재작업 (2026-11-01)

- 원격 [Run41224371317](https://github.com/planner77/layoutManager/actions/runs/41224371317) / Verify124605333600 / source624dd0f: **118 files PASS /1 FAIL,790 tests PASS /1 FAIL,119.18초**. `outline-type-catalog.test.ts` TC-R2-003의 첫 invalid-query loop line191에서 expected400/actual503이 발생했다. 승인 gate 차단의 공개 code는 `G7_RUNTIME_UNAVAILABLE`이며 writer-OFF를 설정하는 후속 단계의 결과가 아니다. Docker는 진단 착수 당시 실행 중이었고 이후 Job124605333742의 모든 step completed/SUCCESS를 Root가 확인했다. Verify 실패는 그대로다. 이전 local791PASS는 다른 실행으로 보존한다.
- 재현 mechanism: fixture issuer는 native `new Date()`로 notBefore를 서명하지만 test `Date.now`는 wallStart+floor(performance delta)만 사용했다. wall은1ms 증가하고 performance delta는0.2ms인 결정적 입력에서 mocked now1000이새 notBefore1001보다 작다. `/tmp/layoutmanager-r3-ci-clock-red.log`: **2 FAIL /1 PASS,132ms**; 별도 forward-wall5000 입력에서도1002를 반환했다. 원격 로그 자체에는 정확한 wall/performance delta가 없으므로 이것은 재현된 fixture 결함이자 유력 CI 원인이며 실제 CI1ms 측정으로 표현하지 않는다.
- Test-only 수정: native wall function을 module load에서 spy 전에 포획하고, 주입 가능한 순수 factory가 `max(previous,nativeWall,wallAnchor+floor(performanceDelta))`을 반환한다. rollback 시 감소하지 않으며 fresh signer보다 뒤처지지 않는다. 제품 시간·권한·승인 guard나 invalid-query400 기대는 변경하지 않았다. 실제 signed boundary의 notBefore-1 BLOCKED/정확 start ACTIVE/정확 expiry BLOCKED 및 미래 HTTP503을 추가했다.
- Root 집중 재시험 `/tmp/layoutmanager-r3-ci-clock-green.log`: **6 files /51 tests PASS,33.79초**. Manager가 RED/GREEN 로그와 test-only diff를 직접 검토했다. 후속 전체 helper 회귀는 **120 files /795 tests PASS,250.28초**(`/tmp/layoutmanager-r3-ci-clock-all.log`). 독립 QA의 별도 **5 files /53 tests PASS,39.08초**와 **1 file /12 Scene tests PASS,9.59초**, typecheck/관련 lint도 확인했다. Manager가 수정의 로컬 수용/게시 GO를 판정했다. 새 commit/원격 CI 성공은 아직 미확인이다. R4는 수정 HEAD 게시·해당 repair 기반 확인 후 조건부 재개하며 새 실제 CI 실패 시 다시 HOLD한다. 이전 실패와 설계/사용자 변경은 보존한다.

## R3 — 최종 로컬 재시험으로 해소 (2026-11-01)

아래 R3 실패 이력의 후속 최종 실행은 전체119 files/791 tests PASS(428.37초), 일반 CAD117 PASS(10.2분), Root Greenfield7 PASS(2.1분), 독립 QA 확대9 PASS(2.2분)이다. 마지막9개에는 지연 GET/이전 actor mutation과320px200개 Home/End·내부 scroll/외부 scroll 불변 검증이 포함된다. Manager가 완료 로그를 확인하고 로컬 수용했다. 기존 각 실패의 당시 원인·범위·집중 재시험은 그대로 보존한다. 원격 CI·merge·배포/실환경은 이 결론에 포함되지 않으며 [TestReport](TestReport.md)를 따른다.

## R3 #71/#73 — Browser 확대 회귀와 snapshot/UI 재작업 이력 (2026-11-01)

- 독립 QA 확대9개 첫 실행: **7 PASS /2 FAIL,2.8분**. Editor 초기 비밀번호 변경을 `page.request`로 수행해 브라우저 Admin cookie까지 지운 fixture와, 이전 race 시험의 올바르게 보존된 append-only receipt/감사 이력이 있는데 전체 CREATE Audit 수를 고정3으로 기대한 fixture가 실패했다. 전자는 별도 API request context로 분리했고 후자는 이전 count 대비+3 및 각 committed ID별 Audit1/receipt1을 검증하도록 보완했다. 데이터 삭제·감사 guard 완화는 하지 않는다. 실제 새9개 재시험 결과는 아직 대기하며 이 최초 실행을 PASS로 소급하지 않는다. 지연 GET race 단독 흐름8.7초 통과는 해당 관측 범위로만 기록한다.


- 아래 실행은 Root가 수행·보고한 서로 다른 snapshot의 실제 결과이다. 진행 중인 최종 회귀 결과를 합산하거나 먼저 PASS로 기록하지 않는다. 최초 Greenfield **4 PASS /1 FAIL,48.2초**의220자 provenance 결함과 집중 backend 재시험은 아래 별도 항목에 보존한다.
- 두 번째 Greenfield 실행은 **4 PASS /1 FAIL,50.7초**였다. 실제 다운로드 내용 대신 Playwright `download.path()`의 UUID 임시 파일명을 file chooser에 넣어 `.json` 확장자 검사가 거절했다. 이는 fixture의 파일명 전달 오류다. `download.suggestedFilename()`과 실제 bytes를 사용하도록 시험을 수정했으며 제품의 확장자 guard는 유지했다.
- 확대 Greenfield7개 실행은 **5 PASS /2 FAIL,1.7분**이었다. 새 primary R3 흐름은12.8초에 통과했고, Source 흐름은 실제 UI 생성·타입 rename/inactive·동일 key replay·export를 수행한 뒤 Scene POST의 기존 정상200을201로 기대해 실패했다. 이 기대만 기존 API 계약200에 맞춘다. 다른 실패는100개 임시+100개 서버의200개 Tree 대신105개를 표시한 것이다. 서버는100개였지만 Tree를 다시 열 때 재조회하지 않아 기존5개 snapshot이 남았다. 메뉴 onOpen에서 서버 refresh를 연결하며, 기존 항목을 숨기거나200개 기대를 낮추지 않는다.
- 일반 CAD117개 회귀의 초기 결과는 **116 PASS /1 FAIL**이었다. 추가 서버 toolbar가 좁은 화면의 Tree viewport를 잠식했다. G7 OFF에서는 기존 Tree에 server props/actions를 전달하지 않고, 활성 compact 화면에서는 서버 도구를 접을 수 있는 floating controls로 배치하는 제품 수정이 필요했다. 기존 모바일 geometry/scroll 검사를 삭제하지 않는다. 동일 snapshot의 최종117개 전체 통과 여부는 별도 재실행 완료 뒤 기록한다.
- Manager의 읽기 검토는 marked Source-v2 snapshot의 `baseGeometry`/`transformOperations`가 필드 이름만 검사되고 의미 검증 없이 import될 수 있음을 발견했다. Root는 손상 base geometry/허용되지 않은 연산에 대한 기대 throw가 실패하는 RED를 확인한 뒤, marked snapshot에만 bounded rigid operations·base/effective geometry·재구성 결과 일치를 검사했다. 관련 **3 files /15 tests PASS**를 보고했으며 unmarked legacy의 기존 호환 경로는 유지한다. 이 집중 검증은 전체 Browser 통과를 대체하지 않는다.
- 별도 source review에서 focus GET의 이전 snapshot이 성공한 POST upsert 뒤 rows를 덮어쓰는 race, legacy mutation의 actor/generation guard 누락과 후속 Memo 결과의 이전 Version 적용 가능성을 확인했다. Root는 모든 mutation의 begin/finally epoch, pre/post actor 검사, guarded legacy mutation, Memo actor/load sequence/Manager 동일성 검사, latest-refresh 참조를 적용했다. 독립 QA의 지연 응답 Browser race 시험은 이 기록 시점 진행 중이며 결과를 먼저 PASS로 쓰지 않는다.
- 현재 상태: 위 변경을 포함한 최신 production build는 Root가 PASS를 보고했지만, 최종 Greenfield/일반 CAD/전체 Vitest와 독립 race 검증은 완료 결과 대기다. 실제 새 결과는 [TestReport](TestReport.md)에 별도 기록한다. 과거 실패는 삭제하지 않는다.

## R3 #71/#73 — typed render-preview POST boundary rejects valid opaque Scene IDs (2026-11-01)

- Root's actual Greenfield browser run `/tmp/layoutmanager-r3-greenfield.log`: five cases, **4 PASS / 1 FAIL, 48.2s**. First-install, persisted Scene, operations logs and existing R2 catalogue cases passed. New `typed-outlines.spec.ts` server-first typed confirmation expected HTTP201 but received HTTP422 `OUTLINE_DERIVATION_INVALID`.
- The safely captured synthetic request shape (`/tmp/layoutmanager-r3-render-claim.json`) showed six opaque render `derivedFrom` IDs with maximum length220. Existing server `provenance()` limited each ID to128 although the existing Generated-v2 importer permits250. The approved bounded correction is length250, while preserving max list count256, nonempty strings, uniqueness, total bounded request and no source attestation promotion. At initial ledger entry, boundary tests and Root browser rerun were pending.
- The subsequent `apiRequestContext.get: Test ended` at logout is teardown after the failed HTTP assertion; it is not an independently observed auth or logout failure. Do not count this run as 5/5. No skip/assertion relaxation is approved.
- **Focused correction evidence (2026-11-01):** The server `derivedFrom` individual-ID bound is now250; max count256, non-empty/unique validation, bounded request body and no Source attestation promotion remain. `cad-business-contract.test.ts` synthesizes an actual `importedId(sceneScope(...), ...)` occurrence ID of length220, accepts it and a length250 ID, and rejects251, duplicate ID, and257-item input. Independent combined rerun across the three frozen R3 integration suites, `typed-outline-qa.test.ts` and `cad-business-contract.test.ts`: **5 files / 37 tests PASS, 32.76s**. This is focused backend evidence only; the failed browser result is not replaced until Root reruns it against a fresh build.

## R3 #71/#73 — QA late approval-expiry response status finding (2026-11-01)

- Independent QA's controlled `storedOutlinePage` probe advances the synthetic clock past `gate.expiresAt` after the stored Outline query and before final `recheck`; `assertRuntimeApprovalCurrent` correctly rejects the response with `Error('G7_RUNTIME_APPROVAL_CHANGED')`.
- Source review shows `typedOutlineFailure` passes that plain Error to `server/http.failure()`, which maps it to HTTP **500 / `SERVER_ERROR`**. This finding is a status mapping risk, not an authorization bypass: no data is returned after expiry. Route-level expiry/status was not independently injected; the 500 conclusion is from the exact catch/translation path.
- Manager directed Developer rework: map runtime-approval loss to safe 503 without exposing the internal error; independent QA added a route-level GET injection that asserts 503, `G7_RUNTIME_BLOCKED`, private/no-store and Cookie Vary. The test clock moves only after the authorized Outline query and restores in `finally`. At initial observation the route-level rerun was pending; the following result supersedes that status.
- **Focused rework verification (2026-11-01):** `typed-outline-read.ts` now catches approval-current assertion errors and translates them to fixed `CadError('G7_RUNTIME_BLOCKED',...,503)`. Independent QA's route-level GET injection advances Date.now only after the authorized `cadOutline.findMany` resolves, then asserts **503 / G7_RUNTIME_BLOCKED / private,no-store / Vary Cookie**, restoring the Date.now and createDb spies in `finally`. Combined run of typed-outline runtime, Greenfield, catalogue, independent typed-outline QA and business-contract files: **5 files / 37 tests PASS, 32.76s**. Focused typecheck, affected backend/test ESLint and `git diff --check` passed. This resolves the internal late-expiry status finding in local focused evidence; the earlier pre-rework observation of raw 500 remains an accurate historical record.
- Related evidence: current R3 entry in [TestReport](TestReport.md), independent QA test `src/tests/integration/typed-outline-qa.test.ts`.

## R2 #65 — Scene 회귀의 시간 의존 실패와 fixture 보정 (2026-11-01)

- 최초 전체 실행 `/tmp/layoutmanager-r2-all-tests.log`: 114 files / 758 tests, **757 PASS / 1 FAIL**, 387.37초. Scene 동시 재생성은 기대 fulfilled1/rejected1과 달리 fulfilled0이었다. 이 실행은 거절 code를 출력하지 않아 정확한 두 원인은 확정하지 않는다.
- 단독 CAS1회와 Scene11개 전체는 PASS였지만 성공으로 원인 해결을 주장하지 않았다. 별도 실제 시계 probe에서 wallDelta=-2409ms / monotonicDelta=+100.914ms, 즉 -2509.914ms 역행을 관측했다. 원인 후보는 승인/Session 시간 검사, 동시 저장 순서, 새 Schema 영향 순으로 대조했다.
- bounded CAS 재현8회 중1~7 PASS, 8회는 `prepareG7CadWrite`/fixture setup에서 **G7_RUNTIME_BLOCKED503**으로 실패했다(`/tmp/layoutmanager-r2-scene-cas-8.log`). 이 시각 권한 실패는 재현했으나 최초 fulfilled0의 정확한 거절 code와 동일함을 입증한 것은 아니다.
- Manager 검토 후 Scene integration에만 기존 performance 기반 `installMonotonicTestClock`을 beforeEach로 적용하고 afterEach restore한다. 제품의 승인/Session 시간 조건은 변경하지 않는다. 미래 발급 Session에 대해 실제 초기 guard의401, storage.putVerified 호출0 및 Scene pointer/asset/orphan 행0을 명시 시험한다. CAS assertion에는 민감 payload 대신 결과 code/name만 추가한다.
- 첫 controlled12개 실행은 **11 PASS / 1 FAIL**: 새 음성 시험이 비동기 publish를 기대했으나 제품이 더 이른 동기 prepare guard에서 정상 거절한 시험 작성 오류였다. 전체 재실행을 성급히 시작한 Root가 이 기대를 수정하기 위해 검증한 자기 프로세스 그룹만18초 뒤 중단했다(`/tmp/layoutmanager-r2-all-tests-controlled.log`, 완료/PASS 아님). 올바른 초기 guard assertion으로 고친 후 Scene **12/12 PASS**, 18.61초(`/tmp/layoutmanager-r2-scene-controlled-final.log`). 최종 전체 suite는 TestReport의 후속 실측을 따른다.
- 후속 전체 Vitest (Root's reported completed run): **114 files / 760 tests: 759 PASS / 1 FAIL, 364.20s**. 유일 실패는 `g7-runtime-cad.test.ts` audit-order assertion: DB query는 `ORDER BY timestampUtc`인데 기대는 business insert order `CAD_UPLOADED,CAD_UPLOADED,CAD_CURRENT_CHANGED,CAD_VERSION_DELETED`; 실제 `new Date()` timestamps 관측이 삽입순서와 달랐다. `Scene12/12`는 이 full run에도 모두 통과했다. Scene helper가 `Date.now`만 모킹하여 `new Date()` 생성은 실제 host clock에 남아 있음을 확인했으며, 관측된 wall-vs-monotonic rollback과 관련 가능성이 있으나 정확 causal proof로 과장하지 않는다. Manager가 승인한 수정은 test query만 `ORDER BY rowid`로 바꿔 insertion order를 보되, 4 action·actor·site·requestId·UTC 검사를 유지하는 것이다. 수정/retest는 pending. Product source/production clock guard 변경 없음. Full-suite acceptance HOLD.
- **Superseding final candidate result (2026-11-01):** Root's `/tmp/layoutmanager-r2-all-tests-accepted.log` confirms **114 files / 760 tests PASS, 234.30s** after the test-only audit-order correction. The historical failure and prior HOLD above remain accurate for their respective runs; they are resolved for the final local candidate and no longer block its local full-suite gate. This result does not establish R2 remote Docker CI, release, or deployment acceptance; see the current R2 entry in [TestReport](TestReport.md).

## R2 #65 — 기존 #41/#42 runtime-off E2E 기대 수정 (2026-11-01)

- Root가 실행한 일반 CAD Chromium 회귀는 **117개 중 115 PASS / 2 FAIL**. 두 실패는 `src/tests/e2e/issue41-outline-type-preview.spec.ts`와 `src/tests/e2e/issue42-outline-assignment-gate.spec.ts`의 오래된 API 404 기대였다. R2가 실제 `/api/outline-types` routes를 추가했으므로 runtime OFF 요청은 `G7_RUNTIME_UNAVAILABLE` / HTTP503이어야 하며 Route 404는 인증·인가 거부 증거가 아니다. 두 실패에서 forged Admin/header/delete-password bypass 또는 R2 backend runtime bug가 관찰되었다고 해석하지 않는다. 이 보고 시점에는 115/117 실패 결과 외에 동일 두 파일 수정 후의 새 Chromium 재실행 결과가 없다.
- 수정된 TC-U4-E2E-GATE-002: GET은 503 + 고정 code + `private, no-store`, create/PATCH는 503을 요구한다. TC-U5-E2E-GATE-001은 GET503을 확인하고 R3 미구현 typed select/confirm 비활성 상태 및 기존 UI guard 메시지를 유지한다. forged header와 delete-password payload가 Admin 권한을 대체하지 않는다.
- 수정 후 Root가 두 affected E2E files를 재실행하여 **4/4 PASS, 8.7s**를 보고했다. 이 scoped 결과는 HTTP503/code/no-store 및 typed assignment 미준비/거부 경계를 검증한다. 이는 기존 일반 CAD 회귀 **115/117**을 전체 117/117로 소급 변경하지 않으며, 새 일반/Greenfield 전체 E2E는 별도 완료 전 NOT VERIFIED다.

## PR180 / R1 — 이미 포함된 baseline logger 의존성에 대한 CI shim 거절 (2026-10-31)

- 실제 관측: [Run41210398076](https://github.com/planner77/layoutManager/actions/runs/41210398076)의 Docker Job124564000864가 baseline build 준비 단계에서 `Baseline logger package manifest differs from expected source`로 실패했다. 뒤쪽 Docker build/smoke/size 검증은 SKIPPED이며 PASS가 아니다. Verify Job124564000973의 Typecheck/Lint/Unit/Build는 Root 조회 시 성공했고 E2E는 당시 진행 중이었다. 후속 실제 재조회에서 Verify Job124564000973은 최종 SUCCESS였다(Typecheck/Lint/Unit/Build/E2E와 G7/Greenfield/Legacy 순서 모두 포함). Docker 실패가 있어 전체 Run을 PASS로 바꾸지 않는다.
- 원인: 이전 #59 보완 inline Python이 `source.count(anchor) != 1 or dependency in source`를 모두 오류로 처리한다. 최신 base9016feb에는 PR179에서 store COPY가 이미 포함되어 있어 올바른 기존 manifest가 거절된다. 실제 새 runtime 코드의 파일 누락과 구분한다.
- Manager 설계: dependency0이면 migrator 내부 유일 logger anchor에만 추가, dependency1이면 같은 migrator 내부인지 검사 후 byte-identical no-op, duplicate/missing anchor/wrong stage는 거절. 실제 embedded Python 실행 TC-LOG-MIG-003으로 legacy/current/error 사례를 확인한다. 기존 Docker build/smoke/크기·복구 gate는 유지한다.
- 재작업: Developer가 엄격한 멱등성과 stage/COPY 경계 검사를 구현했고 Root·독립 QA가 실제 embedded Python을 실행하는 standalone24/24 PASS, Typecheck·집중 ESLint·diff check PASS를 확인했다. 변경은 heredoc·테스트·문서뿐이며 앱/Dockerfile/운영 데이터는 불변이다. 새 HEAD 실제 Docker 결과는 NOT VERIFIED. 다음 R2 구현은 R1 재작업 gate를 먼저 처리한다. 기존 실패 기록을 성공으로 덮어쓰지 않는다.

## R1 최종 실패 해소 및 Proxy HTTP 보완 (2026-10-31)

- 통제 시계 전체 중간 실행112파일/731건은 **729 PASS/2 FAIL**: 이미 QA가 보완한 Date.now wrapper 재귀 시험의 구 snapshot과 기존 S3 operational Auth의 실 시계401/403 불일치. 후자는 동일 monotonic test clock을 해당 fixture 파일에만 적용·복원했다. 이후 동결 전체 Vitest **112파일/731 PASS**, 215.62초(`/tmp/layoutmanager-r1-final-all-tests.log`). 과거 실패는 보존한다.
- 새 Proxy는 일반 Page200 제한을 그대로 완료 처리하지 않도록 #60/#62 원 AC를 재확인한 보완이다. 구현 전 Manager가 Architecture/Requirements/TestPlan/Decisions를 갱신했고, `/operations/logs`만 동일 인가·정적 안전 HTML·401/403/429/503·no-store로 처리했다. 기존 CAD 경로는 matcher 밖이다. native Production Build PASS, 새 보안 unit **6/6 PASS**, 이후 native Proxy + controlled Greenfield **3/3 PASS**(24.6초). 전체731과 이후 신규6은 별도 실행이다.
- 최종 Typecheck/Lint PASS(0ERROR/기존11WARNING), staged diff 및 실제 Secret/산출물 검사 위반0. 실 시계/NTP·사내 현장·실 로그 Volume·운영 배포/권한 전환·PR CI/GHCR는 이 로컬 시험으로 완료 주장하지 않는다.

## R1 통제 시계 시험과 fixture 정리 (2026-10-31)

- 후속 전체 Vitest는 112 files / 729 tests, **726 PASS / 3 FAIL**, 238.54초. 기존 G7 Auth Site, CAD Site 및 신규 로그 익명 인가에서 503/거절이 발생했다. 관측된 wall rollback은 승인 notBefore/Session 시각 경계에도 영향을 주므로 실제 시계를 통과했다고 주장하지 않는다. `/tmp/layoutmanager-r1-frozen-tests.log`.
- 최종 앱 Build/Typecheck는 PASS. 실제 시계 Greenfield3건은 **1 PASS / 2 FAIL**: 최초 Admin 성공 뒤 Scene GET/새 로그 관리 Grant가 401. `/tmp/layoutmanager-r1-final-greenfield.log`. 운영 시간 검사는 그대로 유지한다.
- Manager 검토 후 synthetic integration의 affected4files만 각 시험 Date.now를 performance 기반 단조 시계로 설정/복원한다. 브라우저는 **명시적 G7_E2E_MONOTONIC_CLOCK=true**일 때 dedicated Greenfield webServer에만 test preload를 사용한다. private owned /tmp/g7-first-run-ui-*·db/cad 경로와 로컬 환경을 검증하고 일치하지 않으면 거절한다. production package/Compose/시작 코드에는 연결하지 않는다. future-issued Session401/read0 음성 시험을 추가했다.
- 첫 controlled Greenfield는 **2 PASS / 1 FAIL**: 기존 최초 Admin/Scene 복원 성공, 새 로그 시나리오의 네 번째 로그인은 정상 SESSION_LIMIT409. BrowserContext 종료가 서버 세션을 회수하지 않으므로 첫 관리자 시나리오 끝에 실제 CSRF 보호 logout을 추가했다. 3-session 제한은 변경하지 않는다. `/tmp/layoutmanager-r1-controlled-greenfield.log`.
- test preload 초안 .cjs는 ESLint no-require-imports4ERROR로 실패하여 ESM.mjs/--import로 교체했다. 규칙 disable/skip은 추가하지 않았다. 최종 통제 시계 전체 시험·QA·브라우저 결과는 TestReport 후속 실측을 따른다.

## R1 전체 회귀 및 시계 역행 관측 (2026-10-31)

- 최초 전체 Vitest: 110 files / 720 tests, **718 PASS / 2 FAIL**, 336.92초. 기존 g7-runtime-auth bootstrap/recovery는 g1-store.ts:41 `CHECK constraint failed: revoked_at`; 새 로그 인가 시험은 동시 재작업으로 도입한 logs_read assertion과 구 모듈 snapshot이 섞여 실패했다. 실행을 성공으로 수정하거나 focused19PASS를 전체720PASS로 합산하지 않는다. 로그 `/tmp/layoutmanager-r1-all-tests.log`.
- 구체적 환경 증거: Greenfield UI2 trace의 GET setup wall14:01:55.285Z/monotonic5857.584 뒤 POST setup wall14:01:53.834Z/monotonic6849.848. 뒤 요청에서 wall 시각이 2.443초 감소했다. 별도 Node10초 표본은 **역행1회/최대2499ms**를 측정했다. CSRF의 expires-now 상한 및 Session issued_at/revoked_at 조건은 유지하며, 이 관측을 제품 기능 PASS로 사용하지 않는다. UI2는 첫 잘못된 코드 POST가 SETUP_CSRF_DENIED, 이후 로그인 실패의 2FAIL이며 최초 G2 Audit 오염 버그와 구분한다.
- 동일 기존 bootstrap/recovery를 별도 단독 실행한 Developer 보고는 PASS(4.45초). 원래 전체 실행은 계속 FAIL로 보존하고 최종 동결 소스/독립 QA/재시험 결과를 별도 기록한다.

## R1 #60/#61/#62 로컬 신규 설치 회귀 (2026-10-31)

- 기준: 9016feb 기반 0.49.0 uncommitted snapshot, 최초 Production Build PASS 뒤 격리 Greenfield Playwright. `/tmp/layoutmanager-r1-greenfield.log`, 2 FAIL / 0 PASS: 최초 Admin 등록 `G7_SETUP_UNAVAILABLE`, 후속 로그 화면 로그인 실패.
- 원인: 새 운영 내비게이션이 G7 ACTIVE/아직 User0 상태에서 로그 access를 probe → G4가 익명 거부 Audit을 기록 → G2의 pristine bootstrap 전제 위반. 기존 인증 API의 User0/BOOTSTRAP_REQUIRED 선행 차단을 신규 로그 guard에도 적용해야 한다. 테스트 타임아웃이나 G2 무결성 규칙을 완화하지 않는다.
- 조치: nav는 현재 인증 세션 확인 후에만 logs access probe; 서버 guard는 최초 bootstrap 전 Audit/limiter 생성 방지와 fail-closed. 실제 0→1 Admin 및 로그 전체 흐름 재검증 전 해결 PASS로 표시하지 않는다. 모든 DB/비밀번호/코드는 disposable synthetic fixture이며 실 운영 데이터는 사용하지 않았다.
- 재시험: 최초 Admin 등록·로그인 PASS. 로그 UI는 `getByLabel(레벨,exact)`가 select의 option 텍스트를 포함한 label과 매칭하지 못해 1 FAIL/1 PASS. 실제 접근성 트리는 combobox 이름 레벨로 정상이며 locator를 사용자 역할 기반 `getByRole(combobox,name:레벨)`로 수정했다. Fixture 작업명도 실제 logger catalog인 cad_upload로 정합화. 재시험 전 최종 PASS 아님.
- 후속 UI 시험은 실제 권한·검색·상세·Clipboard·타임라인·320px까지 진행했으나 페이지 만료 alert selector가 Next route-announcer까지 2개를 매칭하여 1 FAIL/1 PASS. 제품 알림을 operations-log-console 영역으로 한정하여 수정.
- 추가 관측: 새 UI 최초 ESLint는 useEffect에서 동기 load→setState 호출 규칙으로 1ERROR. 초기 load를 cleanup 가능한 microtask로 시작하고 집중 ESLint 재실행 PASS. 기존 코드 ESLint는 0ERROR/11WARNING.
- #76 관리자 설정 조회는 기존 gh credential과 Root .env token 각각 HTTP401. 연결 GitHub 도구에는 repository-settings PATCH/전체 설정 필드가 없어 변경/검증을 완료하지 않았다. Secret 값은 출력하지 않았고 설정은 변경하지 않았다.

## PR #179 — Owner Managed 최종 Squash Merge·#58/#59 종료·v0.48.1 Main CI 시작 (2026-10-31 KST)

### 최신 검증 및 병합 증거
- PR [#179](https://github.com/planner77/layoutManager/pull/179) 최종 PR HEAD `7698b0e035d330361005780fb1e838f5ab421457`, [PR CI Run 41205118337](https://github.com/planner77/layoutManager/actions/runs/41205118337) `completed/success`, head_sha 정확 일치. Verify [Job 124548636367](https://github.com/planner77/layoutManager/actions/runs/41205118337/job/124548636367) 및 Docker/Migrator Runtime Smoke [Job 124548636626](https://github.com/planner77/layoutManager/actions/runs/41205118337/job/124548636626) **둘 다 SUCCESS**. 기존 최초 실패 Run [41194360963](https://github.com/planner77/layoutManager/actions/runs/41194360963) 및 재실패 Run [41202514157](https://github.com/planner77/layoutManager/actions/runs/41202514157)의 정확한 원인·보완 이력은 본 원장의 아래 절에 그대로 보존.
- 병합 직전 Main `56221f8d4fc0d80622fa1fced85a56b53d1eb213`, compare `ahead 19 / behind 0`, PR `mergeable=true`, 충돌 0. Codex P2 review [4431462654](https://github.com/planner77/layoutManager/pull/179#discussion_r4431462654) 및 [4431462655](https://github.com/planner77/layoutManager/pull/179#discussion_r4431462655) 답변 후 두 Thread 모두 `Resolved` / 미해결 0. [최종 Owner Managed 게이트 승인·근거 댓글](https://github.com/planner77/layoutManager/pull/179#issuecomment-6544097286) 별도 보존.
- 정확 Squash 제목 `#59 | Persist bounded server JSONL logs and instrument API/maintenance stages (#58)`, `expected_head_sha=7698b0e0...`, `commit_message=""`로 [Main Squash 4d86a6b1895b2d7e1f70cc69d66cd41b072ab9f8](https://github.com/planner77/layoutManager/commit/4d86a6b1895b2d7e1f70cc69d66cd41b072ab9f8) 성공. PR state `closed/merged` 검증. [#58](https://github.com/planner77/layoutManager/issues/58) 및 [#59](https://github.com/planner77/layoutManager/issues/59) 각각 `closed/completed`, 완료 근거를 Issue 댓글 [#58](https://github.com/planner77/layoutManager/issues/58#issuecomment-6544106828) / [#59](https://github.com/planner77/layoutManager/issues/59#issuecomment-6544107381)에 기록.

### Main CI / GHCR 릴리스 요청 상태
- 병합 Main SHA 정확 일치하는 [Main CI Run 41206533210](https://github.com/planner77/layoutManager/actions/runs/41206533210), `event=push`, `head_sha=4d86a6b1...`, 확인 시 `in_progress`였으며 Main 릴리스 워크플로가 **시작**되었음을 확인. 사용자 지시에 따라 이후 완료 모니터링하지 않음. **Main CI SUCCESS / GHCR 게시 성공 / App·Migrator OCI Digest는 NOT VERIFIED**. 주어진 워크플로의 정식 후보는 기존 `v0.48.0`와 분리된 새 `v0.48.1`, `ghcr.io/planner77/layoutmanager:0.48.1`, `:0.48.1-migrate` 및 조건부 latest aliases; 게시 성공/실제 생성 태그는 완료 로그 확인 전 주장하지 않는다.
- 현재 문단을 남기는 작업은 **docs-only post-merge Main 메타데이터** 변경이다. 릴리스 소스는 Squash `4d86a6b1...`이며, 이 변경은 이전 PR CI HEAD 또는 release-tag의 소스를 소급 변경하지 않는다. docs-only push가 추가 Main CI를 발생시키면 `release-scope`는 변경 파일이 `*.md`만인 것을 검증해 **GHCR skip이어야 한다**; 해당 새 workflow의 실제 결과는 아직 검증하지 않았다. 원본 v0.48.0 태그/이미지 강제 재지정 금지.

### Owner Managed 인수 범위 및 잔여 위험
- L2 #58 HTTP/maintenance Job ID·단계·경고/실패·Health 계측 및 L3 #59 bounded private JSONL·Rotation·재시작 보존·내부 읽기 소스의 **소스·자동 합성 CI 수용 범위**로 완료. 실제 현장 UID10001 Docker Volume의 재구성·보안·백업·복원·정전·디스크 full 및 크로스 프로세스 global quota/FD unlink의 완전한 원자성은 **미검증/잔여 위험**, 별도 현장 검증 필요. #60/#61 웹 로그 조회 권한·API는 미구현. 운영 G7/Auth/CAD writer, 실제 DB/CAD/S3 볼륨/현장 Release 적용 변경 없음.

---

## PR #179 — 최종 PR CI SUCCESS / v0.48.0 릴리스 충돌 확인 및 v0.48.1 재검증 게이트 (2026-10-31 KST)

### 검증된 성공 HEAD·Run
- [PR #179](https://github.com/planner77/layoutManager/pull/179) 이전 최종 HEAD `ac285b690f4b57cf2fca89cb10f9f029308b0987`의 [PR CI Run 41203460377](https://github.com/planner77/layoutManager/actions/runs/41203460377) **completed/SUCCESS**. Verify [Job 124543839312](https://github.com/planner77/layoutManager/actions/runs/41203460377/job/124543839312) **SUCCESS** (TypeScript/Lint/Unit/Integration/Build/E2E 경로), Docker/migrator/Greenfield smoke [Job 124543839619](https://github.com/planner77/layoutManager/actions/runs/41203460377/job/124543839619) **SUCCESS**. 두 번의 이전 실패 Run `41194360963` (TS2345) 및 `41202514157` (Vitest 두 건/Migrator import)은 삭제하지 않고 아래에 보존.
- 성공 시점 Main 기준 HEAD `56221f8d4fc0d80622fa1fced85a56b53d1eb213`, compare ahead=17/behind=0, PR mergeable=true. Codex P2 2건 [4431462654](https://github.com/planner77/layoutManager/pull/179#discussion_r4431462654), [4431462655](https://github.com/planner77/layoutManager/pull/179#discussion_r4431462655) 답변 및 2/2 Resolved, 미해결 0건. 새 변경/리뷰 후 다시 확인할 것.

### GHCR 신규 릴리스 버전 충돌과 조치
- Main `src/package.json`/lock과 검증된 PR HEAD는 `0.48.0`이다. [Git tag v0.48.0](https://github.com/planner77/layoutManager/releases/tag/v0.48.0)의 ref object `4d5163ab899d43df0ead93c5684290d0ed55db6c`은 **이미 존재**하며 이전 Main `56221f8d4fc0d80622fa1fced85a56b53d1eb213`을 가리킨다. 릴리스 workflow의 `Create release tag from package version`는 기존 tag를 재생성하지 않고 `Check version images on GHCR`에서 App/Migrator 버전 이미지가 모두 존재하면 publish skip. 그대로 병합하면 새 #58/#59 소스의 새로운 버전 GHCR 이미지 발행을 보장할 수 없다.
- `v0.48.1` ref 부재(404) 확인 후 [version bump commit 6746904d9279b07a9de44cf44fcccb847ab0edaf](https://github.com/planner77/layoutManager/commit/6746904d9279b07a9de44cf44fcccb847ab0edaf)에서 **src/package.json + src/package-lock.json**의 root version을 같이 0.48.1로 갱신했다. 기존 v0.48.0 tag/OCI 이미지 및 `latest`는 손대지 않았다. 이 버전 변경은 기능 코드를 바꾸지 않더라도 PR SHA를 변경하므로 성공한 Run 41203460377을 **새 최종 HEAD 검증 증거로 간주하지 않는다**.
- 필수 게이트: 새 최종 PR HEAD의 Verify+Docker Job completed/SUCCESS, fresh Main 뒤처짐=0, mergeable=true, review thread 미해결=0을 확인한 이후에만 한 줄 Squash `#59 | Persist bounded server JSONL logs and instrument API/maintenance stages (#58)` 병합; Issue #58/#59 closed/completed은 수용된 코드·합성 CI 범위로 설명하고 현장 Volume/백업/정전/원자성은 미검증으로 명시. 이후 Main CI 자동 시작에서 GHCR v0.48.1 App/Migrator 쌍을 게시하도록 한다. Main CI/실제 Digest는 수행 전 또는 완료 로그 확인 전 성공으로 표시 금지.
- 사용자 요청: CI 완료 모니터링 생략. 이번 조치는 신규 PR CI를 시작하는 데까지 수행하고 미검증 소스를 병합하거나 기존 버전 이미지 재태그를 강제하지 않는다. 실제 운영 DB/CAD/인증/G7/Volume 변경 없음.

---

## PR #179 — 2차 PR CI 실패: Vitest 2건 및 baseline migrator 모듈 미포함 (2026-10-31 KST)

### 실패 실행 증거
- [PR #179](https://github.com/planner77/layoutManager/pull/179), 수정 전 HEAD `2484115a60100abb8f1e5b289f281fedbc4e0214`, [PR CI Run 41202514157](https://github.com/planner77/layoutManager/actions/runs/41202514157) **completed/failure**. 첫 실패 Run 41194360963(TS2345)은 아래 원장에 별도 보존하며 성공으로 소급 변경하지 않는다.
- Verify [Job 124541002048](https://github.com/planner77/layoutManager/actions/runs/41202514157/job/124541002048): TypeScript 및 ESLint **SUCCESS**, Vitest **108개 파일 중 106 PASS/2 FAIL, 710개 테스트 중 708 PASS/2 FAIL**. 실패 1: `src/tests/unit/log-store.test.ts:96`, TC-L3-004, expected `lastFailureCode=ENOSPC` vs actual `LOG_IO_FAILED`. 실패 2: `src/tests/unit/standalone.test.ts:179`, TC-LOG-MIG-001, migrator Dockerfile에 명시적 `COPY /app/src/server/logging/store.ts -> ./server/logging/store.ts`가 없다는 assertion. OCI manifest synthetic / DXF benchmark / Production Build / Chromium E2E / G7 signed/Greenfield/Legacy E2E **SKIPPED/NOT VERIFIED**.
- Docker [Job 124541002124](https://github.com/planner77/layoutManager/actions/runs/41202514157/job/124541002124): Compose image 검증과 Python audit synthetic SUCCESS, baseline App Build 완료 후 **baseline Migrator Build FAIL**: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/src/server/logging/store' imported from /app/src/server/logger.ts`, `[migrator 43/43] RUN ... node --import tsx...`. 이후 Phase1/Current Runtime·Migrator builds, OCI/native/image measurement, G7 Greenfield/restart smoke는 **SKIPPED/NOT VERIFIED**. 동일 신규 소스 import closure가 Main 기반의 원본 baseline Dockerfile에 없어서 발생; 독립 DB/권한/registry 문제 아님.

### 근본 원인 및 안전한 수정
1. TC-L3-004의 `mkdir(actual)`은 일반 CI umask(0022)로 0755 생성되어 `verifiedDirectory()` 0700 접근 제한에 먼저 걸림. Fixture에서 `await mkdir(actual,{mode:0o700})` 및 `lstat(mode & 0o777) === 0o700`를 사용해 테스트가 실제 injection seam `FullDisk.openNewFile() -> ENOSPC`까지 도달하게 수정. **운영 권한 정책/오류 코드 처리 변경 없음**.
2. PR의 migrator target은 신규 logger 직속 의존성을 `COPY --from=builder /app/src/server/logging ./server/logging`으로 복사해 standalone 테스트에서 기대하는 개별 closure manifest와 달랐다. **정확한 신규 파일 1건** `COPY --from=builder /app/src/server/logging/store.ts ./server/logging/store.ts`로 교체하고 `RUN test -f`, Actions CI migrator packaged files 검사에 파일을 명시. TC-LOG-MIG-001 유지.
3. Baseline Dockerfile은 Main의 이전 manifest라 최근 PR HEAD 소스의 새 `./logging/store` import를 알 수 없었다. PR CI의 비교용 baseline Dockerfile **임시 사본만** logger COPY anchor를 정확히 1건 확인하고 동일 단일 파일 COPY 추가; baseline/current source 일치, 이전 baseline image-size 및 migration/native/import smoke 유지. Anchor 변경 또는 추가 파일 중복 시 fail closed. TC-LOG-MIG-002는 이 보정 경로와 원래 비교 검증 유지 여부를 검사.
4. 수정 커밋: [512b5d02](https://github.com/planner77/layoutManager/commit/512b5d02e24fd492dadf6baeff0e6b8ab087ab58) (Unit fixture/후보 Dockerfile/CI packaged check), [9d2b2143](https://github.com/planner77/layoutManager/commit/9d2b2143eb7a7e1d8b11f3b7cf729a46dc728cf3) (측정용 baseline closure), [5c44eb95](https://github.com/planner77/layoutManager/commit/5c44eb95e57eb5784c30bb815b3878a877a34102) 및 [69c98745](https://github.com/planner77/layoutManager/commit/69c98745ec00abd08ab70f6eebb99f4cbe84763e) (new TC-LOG-MIG-002 및 정상 newline split). 기존 P2 2건/가드/업무 동작 변경 없음.

### 검증·리뷰·병합 경계
- 로컬 npm/Typecheck/ESLint/Vitest/Next/Playwright/Docker 전체 실행하지 않음. 수정 후 CI의 동일 AC 및 Docker baseline smoke 결과는 신규 Run 완료 전 **NOT VERIFIED**. 새 리뷰 스레드, Main behind, mergeable 재확인 후 정확 HEAD PR synchronize로 신규 CI 시작; Owner 요청에 따라 완료 모니터링 생략.
- 이전 Codex P2 4431462654/4431462655는 답변·Resolved, 신규 리뷰 발견 시 별도 기록. 실 운영 Volume/DB/CAD, cross-process atomic quota, Auth/G7, backup/rollback 및 GHCR/병합/이슈 종료는 이 작업에서 수행하지 않음.

---

## PR #179 — #58/#59 첫 PR CI 실패 및 두 건 P2 해결 (2026-10-31 KST)

### 실패 기록: 정확 HEAD·Run·Job
- [PR #179](https://github.com/planner77/layoutManager/pull/179) original HEAD 19ba6fb6fad35cb9fd4968a55f6cef95ce0171ea, [Run 41194360963](https://github.com/planner77/layoutManager/actions/runs/41194360963): completed/FAILURE.
- Verify [Job 124517422622](https://github.com/planner77/layoutManager/actions/runs/41194360963/job/124517422622): checkout/npm ci/Prisma generation SUCCESS, TypeScript server/http.ts(20,37) TS2345: string is not assignable to UploadStage | undefined. ESLint, Unit/Integration, OCI, DXF benchmark, Production Build, Chromium E2E, G7/Greenfield/Legacy E2E SKIPPED.
- Docker [Job 124517422395](https://github.com/planner77/layoutManager/actions/runs/41194360963/job/124517422395): prechecks SUCCESS; pre-change baseline Next Build failed on identical server/http.ts:20 TypeScript error. Subsequent Phase1/Runtime/Migrator/Docker native/Greenfield/restart tests SKIPPED. This is one code regression, not independent Docker/storage failure.

### 원인·코드 보완·회귀
- Root cause: failure() combined UploadStage options.stage with general RequestLogContext.currentStage, then passed its string type into UploadDiagnostics.finishFailure. Fix [91b340673ca2ae1e750b2544025758efef394564](https://github.com/planner77/layoutManager/commit/91b340673ca2ae1e750b2544025758efef394564) passes only options.stage ?? response to UploadDiagnostics while the generic HTTP failure log keeps currentStage. TypeScript and HTTP response contracts unchanged; TC-L2-004 in [8ad19a8d](https://github.com/planner77/layoutManager/commit/8ad19a8d298673d39a6384041366cc84d901caa6).
- Codex P2 [4431462654](https://github.com/planner77/layoutManager/pull/179#discussion_r4431462654): maintenance could unlink an idle app writer file after 60 seconds even while the app had an open fd, losing readable events while incrementing written. Fix checks fh.stat() nlink/dev/ino against pathname lstat on each append and recreates a file if missing/replaced; TC-L3-007 recreates app+maintenance idle/unlink/reopen/read. Reply [4431728330](https://github.com/planner77/layoutManager/pull/179#discussion_r4431728330); thread PRRT_kwDOUQjDfc6yQLds Resolved.
- Codex P2 [4431462655](https://github.com/planner77/layoutManager/pull/179#discussion_r4431462655): FILE_NAME regex excluded sequences >=10000, silently bypassing inventory/retention/read. Fix allows 4..16 digit suffix and safe sequence rollover; TC-L3-008 validates 9999→10000+ quota/read. Also fix maxFiles exact boundary during prune(0), TC-L3-009. Reply [4431728526](https://github.com/planner77/layoutManager/pull/179#discussion_r4431728526); thread PRRT_kwDOUQjDfc6yQLdt Resolved. Unused test import cleanup commit [0af08c1f](https://github.com/planner77/layoutManager/commit/0af08c1f4b33b7d80743e8f3dfab551688025152).

### 미검증·후속 게이트
- Two P2 review threads answered and Resolved 2/2 as observed; check again for newly raised comments. File ownership lookup and append are not cross-process atomic, so a small unlink race remains; whole-store quota across writers is best-effort. Future #60/#61 logs:read Auth not introduced.
- Local npm/typecheck/lint/test/build/Playwright/Docker were not performed in this connector session. New exact-HEAD PR CI will be triggered by pull_request synchronize after this ledger change; do not claim success before results. Field Volume/backup/rollback/real hardware ENOSPC remains NOT VERIFIED. Recheck main behind=0, mergeable and open review threads before final CI start. No GHCR/merge/issue closures/operational G7 or CAD/DB changes.

---

## #58/#59 L2+L3 initial source review / pre-PR CI ledger (2026-10-31)

- Base Main: 56221f8d4fc0d80622fa1fced85a56b53d1eb213. Issue #57 dependency closed, root DESIGN.md absent. Design authority out/Architecture.md, out/Decisions.md, AGENTS.md. Added one L1 emitter-connected, best-effort private JSONL store, L2 stage/job instrumentation, UID10001 Docker packaging and synthetic tests. No unrelated G7/DB migrations. Existing L1 stdout, Docker local driver and audit boundaries retained.
- No failed CI run was observed during this implementation session: no new failure root cause may be claimed or classified. At this pre-PR stage local tests NOT RUN, PR CI not yet started, exact run/status NOT VERIFIED. Future failures must be linked to exact HEAD/run/job and fixed in this ledger without weakening gates. New PR review threads and Main conflict status must be checked before final PR CI.
- Known residual design risk, not a CI failure: independent writer streams are safe from line interleaving but no cross-process atomic quota. Pruning protects recently active other writers and can drop persistence copies when capacity cannot be reclaimed. No authenticated log API before #60/#61. Field volume ownership, backup/restore and rollback NOT VERIFIED. Owner acceptance is not claimed.
- Once PR is opened, GitHub pull_request(opened) triggers PR CI; monitoring deliberately omitted on Owner request. Do not equate queued/in_progress with success.

---

## PR #178 — 세 번째 실패 Run 41175039708 / E6-E2E 패널 상태 혼동 (2026-10-31 KST)

### 관측 결과
- 정확 실패 HEAD [`34b0ec465cb81424ab85f4c1eca6f912472a1691`](https://github.com/planner77/layoutManager/commit/34b0ec465cb81424ab85f4c1eca6f912472a1691), [PR CI Run 41175039708](https://github.com/planner77/layoutManager/actions/runs/41175039708), **completed/failure**.
- Verify Job [124460857433](https://github.com/planner77/layoutManager/actions/runs/41175039708/job/124460857433): Typecheck, ESLint, 전체 Unit/Integration **106 files / 697 tests PASS**, OCI manifest synthetic, DXF benchmark, Production Build, Chromium 설치 모두 SUCCESS. Chromium E2E **116 PASS / 1 FAIL (117건 중 1건)**. 별도 G7 signed Runtime/Greenfield/Legacy migration E2E는 Verify 단계에서 SKIPPED (Docker smoke와 혼동 금지). Chromium 실패 trace artifact [13033640009](https://github.com/planner77/layoutManager/actions/runs/41175039708/artifacts/13033640009) 보존.
- Docker/Migration/Runtime smoke Job [124460857583](https://github.com/planner77/layoutManager/actions/runs/41175039708/job/124460857583)는 completed/**SUCCESS** (앞선 두 Run의 Docker 빌드 실패와 구별). 실 사용자 DXF/GPU/운영 배포나 GHCR 게시까지 증명하지 않는다.
- 유일 실패: `src/tests/e2e/issues55-56-generated-rotate-json.spec.ts:141`, `TC-E6-E2E-001` [rejected file keeps session; v2 restores after explicit reload]. `await expect(page.getByTestId('outline-tree-item')).toHaveCount(1)`는 5초 동안 0건으로 실패. 앞 단계 `generated-json-message`의 `1개 생성 개체` 성공 알림은 관측됐으나, 그 메시지 자체가 Tree 렌더와 실제 데이터 정합성 증명은 아니다.

### 원인 분석 및 보완
- 제품 `CadViewer.reload()`는 `dispatchApp({type:'reset'})`으로 `outlineTreeOpen=false`를 복구하고 `ViewerAppState.initial`은 `outlineTreeOpen:false`이다. `MovableViewerPanel`은 `!open`이면 `null` 반환하므로 트리 DOM 자체가 없어진다. 새 JSON Import는 Browser Document를 복원할 뿐 #127 `작업 > 외곽선 목록` 패널을 자동으로 열지 않는 계약이다. 따라서 기존 E2E는 **패널 닫힘과 데이터 없음**을 잘못 동일시했다. 코드 경로상으로는 테스트 전제 오류이고, 실제 복원 Geometry의 성공/실패는 수정 테스트 통과 전까지 확정하지 않는다.
- 수정 [`4def08b5`](https://github.com/planner77/layoutManager/commit/4def08b57ac0f29c4d81823de1299fe45507dfd7): **테스트 파일만** 변경. Reload 후 패널이 닫힌 것을 확인하고 JSON 파일 Export의 `objects=[]` 검사 → Import 후 Export 결과로 원래 UUID/EditedGeometry 복원 확인 → 그룹 메뉴에서 Outline Tree를 명시적으로 열고 1건 및 `data-outline-id`까지 검사한다. 데이터/트리/메뉴 상태를 각각 독립적으로 검증하므로 테스트를 삭제하거나 기대 수를 완화하지 않는다.
- App/Domain/Adapter/Worker/Source/DB/API/Prisma/Auth/G7, Dockerfile/CI Gate/Timeout은 변경하지 않았다. 기존 697 Unit과 E5 회전 E2E 통과 증거는 실패 Run 범위에만 적용되며 최신 HEAD 재검증 전에는 PASS로 승계하지 않는다.

### 후속 검증·인계
- 마지막 리뷰 스레드 `PRRT_kwDOUQjDfc6yOC0e` (Codex P1 Local-ID) resolved, 추가 P1/P2 및 Main 충돌은 새 HEAD에서 재확인할 것. 정확 최종 HEAD PR CI 시작 후 Owner 요청대로 완료 모니터링 생략. CI 전체 성공, 실 도면/GPU, GHCR 게시, PR 병합, #55/#56 이슈 종료는 별도 증거 전 **NOT VERIFIED / NOT DONE**.

---

## PR #178 / #55+#56 — 두 번째 PR CI 실패: readonly array narrowing / strict TypeScript (2026-10-31 KST)

### 관측된 Run·Job와 선행 Run 구별
- [PR CI Run 41170650410](https://github.com/planner77/layoutManager/actions/runs/41170650410) 정확 HEAD `a0b30f3cf710466f8a43449dfe05787becb16910`, **completed/failure**. 이전 [Run 41170053430](https://github.com/planner77/layoutManager/actions/runs/41170053430)의 JSX 파서/Local-ID P1 실패 후 재실행이며, 최초 실패 이력은 삭제하거나 PASS로 바꾸지 않는다.
- Verify Job [124447794463](https://github.com/planner77/layoutManager/actions/runs/41170650410/job/124447794463): checkout·Node22·npm ci·Prisma generate SUCCESS, `npm run typecheck` FAILURE (`src/domain/generated-document.ts`). `TS7006` implicit any: line 419 `n`, line 423 `current`/`operation`, line 424 `n`/`i`, line 439 `operation`; `TS2347` line 422 `reduce<Affine2D>` untyped function. ESLint, Unit/Integration, OCI unit, DXF benchmark, Production Build, Chromium E2E, G7/Greenfield/Legacy migration E2E 전부 **SKIPPED / NOT VERIFIED**.
- Docker Job [124447794161](https://github.com/planner77/layoutManager/actions/runs/41170650410/job/124447794161): Compose 이미징·Python audit syntax 및 합성 테스트 SUCCESS. `Build pre-change baseline (same source, original Dockerfile)` Next.js Production Build가 동일 `generated-document.ts:419:33` TypeScript implicit any로 FAILURE; 이후 image-size·OCI/native/SQLite/migration/Greenfield smoke는 **SKIPPED**. 별도의 Docker/DB/Registry 장애로 분류하지 않는다.

### 직접 원인 및 보완
- `GeneratedRestoreEntry.transformOperations`은 `readonly GeneratedRigidOperation[]`, `transform`은 `Affine2D` readonly tuple이다. 원래 구현에서 `Array.isArray(input.transformOperations)` 및 `Array.isArray(input.transform)`을 직접 적용하며 타입 흐름이 `any[]`로 확장되어, 뒤따른 `every`, `reduce<Affine2D>`, `some`, `map`의 콜백 타입 추론이 소실되었다. JSX는 이번 실행에서 파싱을 통과했으며 이 TypeScript 문제와 구분한다.
- 수정 코드 [`608a5007`](https://github.com/planner77/layoutManager/commit/608a5007732f0df67a4ae69544cd268c936d93a9): 공격적 런타임 입력의 `Array.isArray` 검증은 별도의 `unknown` 변수 `untrustedOperations/untrustedTransform`에서 실시하고, 행렬 합성·연산 재구성에는 명시적 `readonly GeneratedRigidOperation[]`/`Affine2D` typed reference를 사용. `every((n:unknown)...)`는 유한한 숫자·6요소 검사 후 진행. Source/UUID/Version/SHA/Geometry, history/atomicity/64→4096 JSON 제한 및 기존 E2 Undo 100-step 계약은 완화하지 않는다.
- 추가 단위 회귀 [`e52ed194`](https://github.com/planner77/layoutManager/commit/e52ed1945c3f5c112f9eac9ac98de194dfc54cea): `generated-transfer.test.ts`에서 명백히 비정상인 `transformOperations` 객체·비수치 행렬을 untyped boundary로 주입한 경우, `replaceFromImport`가 전체 거부하고 기존 Document/Undo 이력이 그대로인지 검증하도록 보강. 기존 v2 2개 복원 및 v1 `local-1` Legacy 회귀는 유지.
- 로컬 프로젝트 `npm ci`/전체 Typecheck/Lint/Unit/Build/Chromium/Docker는 이 세션에서 **실행하지 않음**. 독립 TypeScript 5.8 strict 최소 재현 스니펫만 작성해 배열 런타임 검사·명시 타입 분리 컴파일 성공 확인했으나 실제 프로젝트 성공으로 간주하지 않는다. 결과는 신규 PR CI에서 판정한다.

### PR 리뷰/충돌 및 후속 게이트
- 직전 리뷰 원문 [Codex P1 #4430584078](https://github.com/planner77/layoutManager/pull/178#discussion_r4430584078)은 `local-N` 정규식, [답변 #4430599150](https://github.com/planner77/layoutManager/pull/178#discussion_r4430599150) 및 Resolved. 이번 Run 실패는 새로운 Review P1이 아닌 동일 파일의 TypeScript strict 컴파일 오류이며 리뷰/충돌 상태는 최신 HEAD에서 다시 검사할 것.
- 실패 원장·실제 CI 단계 관찰을 보존하고, Main 뒤처짐·PR mergeable·신규 미해결 리뷰 스레드를 확인한 뒤 정확한 최종 HEAD의 PR CI를 시작한다. Owner 요청으로 **CI 완료 모니터링은 생략**, 수정 후 Typecheck/Unit/GPU/실자료/OCI 검증 결과는 새 Run 완료 전 **NOT VERIFIED**. 병합·GHCR 게시·Issue #55/#56 종료 및 운영 데이터/권한 변경 없음.

---

## PR #178 — P1 스레드 해결 및 Main 충돌 재점검, 재시작 CI 인계 (2026-10-31 KST)

- 첫 Run `41170053430`의 공통 JSX TS1005/Next Build 실패 원인과 Code Review P1 Local-ID Regex 문제를 코드 커밋 [`b61b729f`](https://github.com/planner77/layoutManager/commit/b61b729f3abe79e6dd9f7c67ac5f39e995c8106b)로 보완. `GeneratedDocument.replaceFromImport`에 실제 `\d` digit escape가 적용됨을 HEAD 재조회하여 확인; `viewer.tsx`의 조건 JSX 닫기와 `ChangeEvent` 타입 지정도 소스 재조회 확인. 이전 CI 결과는 계속 FAILURE로 보존.
- Codex P1 [review #4430584078](https://github.com/planner77/layoutManager/pull/178#discussion_r4430584078)에 [답변 #4430599150](https://github.com/planner77/layoutManager/pull/178#discussion_r4430599150) 후 thread `PRRT_kwDOUQjDfc6yOC0e` `is_resolved=true` 확인. 현재 PR 리뷰 스레드 전체 1건, **미해결 0건**.
- 최신 PR head `b61b729f3abe79e6dd9f7c67ac5f39e995c8106b`, base Main `116d04046f75d2bae9fdeeefde7ead0edc011a4f`; compare `ahead 12 / behind 0`, PR `mergeable=true`. **Main 충돌 없음**, 강제/파괴적 reset이나 merge 필요 없음.
- 본 실패 원장 추가 갱신 이후 정확한 새 HEAD의 PR CI를 `pull_request synchronize` 자동 트리거로 시작한다. 실행 ID/HEAD는 PR 댓글로 추적 가능하며, Owner 지시에 따라 **CI 완료 모니터링은 생략**한다. 수정 코드의 Typecheck/Lint/Unit/E2E/Docker 및 실 CAD/GPU는 새 실행 결과 확인 전 **NOT VERIFIED**. GHCR/병합/Issue #55/#56 종료/운영 Auth·DB 변경 없음.

---

## PR #178 / #55+#56 — 최초 PR CI 실패: JSX Syntax + JSON Import ID P1 (2026-10-31 KST)

### 정확한 실패 증거 (HEAD `a5bbcf7a57f9a96b9cae236089e2709e1e47418c`)
- [PR CI Run 41170053430](https://github.com/planner77/layoutManager/actions/runs/41170053430) `completed/failure`. Verify Job [124445860365](https://github.com/planner77/layoutManager/actions/runs/41170053430/job/124445860365): checkout, Node, npm ci, Prisma generate **SUCCESS**; `npm run typecheck`에서 `src/features/cad-viewer/viewer.tsx(2146,11): error TS1005: '}' expected`로 실패. ESLint/Unit/Integration/OCI synthetic/benchmark/Production Build/Chromium/G7/Greenfield/Legacy E2E는 **SKIPPED** (PASS 아님). 실패 원인은 `{generatedJsonMessage && <p>...</p>`의 마지막 조건 표현식 닫기 `}` 누락.
- Docker Job [124445860543](https://github.com/planner77/layoutManager/actions/runs/41170053430/job/124445860543): 전처리 Compose images·Python audit 유닛 **SUCCESS**; `Build pre-change baseline (same source, original Dockerfile)`의 Next Build에서 동일 JSX `Expected '</', got '{'` (`viewer.tsx:2146`)로 실패. 후속 Docker build/size/SQLite/migration/Greenfield smoke는 **SKIPPED**. Docker 자체 용량·DB·OCI 문제로 오진하지 않는다.
- Codex P1 리뷰 [#4430584078](https://github.com/planner77/layoutManager/pull/178#discussion_r4430584078) / thread `PRRT_kwDOUQjDfc6yOC0e` (`src/domain/generated-document.ts:399`): `replaceFromImport` 정규식 `\\d` 이중 백슬래시가 정상 `local-1`을 모두 거부하는 실제 기능 결함. `parseGeneratedTransfer`는 이미 `\d`를 사용하고 있었으며 두 검증기의 계약 불일치가 원인. 복원이 비어 있지 않은 경우 v2/v1 양쪽에 영향. CI는 해당 테스트까지 도달하지 못했으므로 리뷰 지적과 CI 관측 실패는 구분한다.

### 원인·수정 및 검증 게이트
- `viewer.tsx`: 조건부 JSX를 `{generatedJsonMessage && <p>...</p>}`로 닫아 TS 파서 복구. `React.ChangeEvent`는 명시 `ChangeEvent` type import로 정리한다.
- `generated-document.ts`: `local-[1-9]\d{0,12}`을 실제 digit escape 단일 백슬래시로 통일한다. 입력 크기/UUID/Source/Version/SHA/Affine/원자성 검사 및 E2 기존 Undo 상한은 낮추지 않는다. 기존 `generated-transfer.test.ts` E6-AC1(비어 있지 않은 v2 2개), E6-AC2(v1 local-1 legacy), E6-AC4(기존 상태 실패 시 무변경)와 E5 tests가 회귀 증거가 되어야 한다. Parser/Codex 수정 뒤 정확 HEAD CI가 성공할 때만 PASS 판정한다.
- Main 기준 HEAD `116d04046f75d2bae9fdeeefde7ead0edc011a4f` / PR #178은 최초 실패 당시 `behind=0`, `mergeable=true`, P1 미해결 1건. 코드 보완 후 리뷰 스레드 답변·Resolved, Main 비교·병합가능성 재검증과 신규 정확 HEAD CI 시작을 별도로 기록한다.
- 새 PR CI의 성공/실패 및 GHCR 게시·병합·이슈 완료는 아직 **NOT VERIFIED / NOT DONE**. GitHub Connector를 통한 수정이며 로컬 npm/Node/Browser/실 CAD GPU 실행은 하지 않았으므로 CI 및 현장 수용 주장 금지. Owner 지시대로 새 Run 시작 이후 모니터링하지 않는다.

---

## Issue #55/#56 — PR CI 시작 전 실패 원장 및 Gate (2026-10-31 KST)

- 기본 근거: 최신 Main `116d04046f75d2bae9fdeeefde7ead0edc011a4f`; Branch `feat/issues-55-56-generated-rotate-json`; E5/E6 단일 PR. Root `DESIGN.md`는 없으므로 AGENTS/Architecture/Decisions/Issues55-56를 검토했다.
- 발견된 구현 선행 결함: 기존 E2 Doc에는 Rotate 명령이 있으나 E5 수치 폼·공통 Pivot·Canvas 회전 핸들이 없고, 기존 #31 JSON v1/v2 다운로드에는 E6 edited transform/operation 검증 Import가 없다. 보완 경로: 새 GeneratedRotate/Transfer, Adapter/Manager 연결, 메뉴/Tool Drawer, Unit/E2E.
- 사전 설계 리뷰에서 수정: (1) 사용자 제공 Affine를 허용 Operation 재합성 결과와 **정확 일치**로 확인하여 위조 오차 허용 제거; (2) 한 객체 변환 명령 최대 64개와 12MiB Blob 파일 한도 명시; (3) 축소 화면의 회전 핸들 상단 clip 회피; (4) 실패 Import 후 원본 Document/Undo/Redo 유지. 기존 실패 CI Run에 대한 재해석/성공 덮어쓰기 없음.
- PR 생성 전 미해결 Review Thread 없음 (신규 PR 없음). Main 정렬/충돌/새 PR Thread는 PR 생성 시 별도 확인할 것. 로컬 TypeScript/ESLint/Unit/Chromium/E2E/Production Build **NOT RUN**; 새로운 PR CI는 아직 **NOT STARTED**. 결과가 나오지 않은 CI·실도면/GPU를 PASS로 표기 금지. CI Monitoring은 Owner 지시로 생략.
- 원장 결론: 관측된 CI 실패는 아직 없으며 과거 PR의 실패/수정 기록은 보존한다. PR CI가 실패하면 정확 Run/Job·원인·교정 Commit/검증 범위를 이 절 위에 추가한다.

---

## PR #177 — Owner Managed 최종 PR 병합·Issue 종료 / v0.47.5 Main GHCR 실행 인계 (2026-10-31 KST)

### 정확 검증 소스·병합 게이트
- [PR #177](https://github.com/planner77/layoutManager/pull/177) 최종 HEAD `b9002c45ac8c18aee96a87d8ad51add292ffbf8f`, [PR CI Run 41166539969](https://github.com/planner77/layoutManager/actions/runs/41166539969) **completed/success**. Verify Job `124435339774` + Docker image/migration/runtime-smoke Job `124435339563` **모두 SUCCESS**. 앞선 Run [41162108326](https://github.com/planner77/layoutManager/actions/runs/41162108326) (ESLint 2 오류), [41163195588](https://github.com/planner77/layoutManager/actions/runs/41163195588) (Chromium 113 PASS/1 FAIL) 이력·원인·회귀 복구 증거는 아래 절에 그대로 보존. 실패 Run 또는 중간 취소 Run을 성공으로 간주하지 않는다.
- Codex P1 3건 [r4430083615](https://github.com/planner77/layoutManager/pull/177#discussion_r4430083615), [r4430083618](https://github.com/planner77/layoutManager/pull/177#discussion_r4430083618), [r4430083623](https://github.com/planner77/layoutManager/pull/177#discussion_r4430083623) 각각 답변 및 Resolved; 최종 PR 전체 리뷰 Thread 3/3 Resolved / 미해결 0. Main 시작 기준 `1a974448dc5fef5539e6d246cbd1ad30c6f46f73`, behind=0, mergeable=true, `mergeable_state=clean`. Owner의 명시적인 GHCR·Issue 종료·Main CI 승인 및 [Owner Managed 최종 인계 댓글 #6538871753](https://github.com/planner77/layoutManager/pull/177#issuecomment-6538871753) 보존.
- 정확한 제목 `#139 | Correct DXF text decoding and movable Viewer panels (#138 #137)`, `merge_method=squash`, body 빈 값, `expected_head_sha=b9002c45...`로 [Main Squash `82ebb4c8b953b96497e7b287d600d8f6a9f59af4`](https://github.com/planner77/layoutManager/commit/82ebb4c8b953b96497e7b287d600d8f6a9f59af4) 성공. PR closed/merged.

### Main CI/GHCR 발행 상태 (추가 모니터링하지 않음)
- Merge push의 [Main CI Run 41167762237](https://github.com/planner77/layoutManager/actions/runs/41167762237), event=push, exact source `82ebb4c8b953b96497e7b287d600d8f6a9f59af4` 기동 확인. `Main CI - verify release scope` Job `124438930802` **SUCCESS**, `Build and push to GHCR` Job `124438962719` **in_progress**에서 인계. 요청대로 추가 모니터링 없음.
- 정식 새 버전 후보 `0.47.5` / `v0.47.5`; 병합 전 Git ref `v0.47.5` 부재(404) 확인. Main workflow는 App `ghcr.io/planner77/layoutmanager:0.47.5` 및 Migrator `:0.47.5-migrate`의 pair build/push와 조건 충족 시 `:latest` / `:latest-migrate` 승격 경로를 실행한다. **실제 OCI 이미지/태그/digest 발행 SUCCESS는 실행 완료 증거를 아직 확인하지 않아 NOT VERIFIED/PENDING**. 기존 v0.47.4 manifest/tag 재지정 금지.
- 본 최종 원장 갱신은 **릴리스 소스 이후 docs-only Main 커밋**으로 보관하며, v0.47.5 Git tag/OCI source는 Squash `82ebb4c8...` 기준. 새 docs-only push가 발생하면 release-scope는 문서-only diff로 GHCR SKIP되어야 하나 독립 Run의 실제 결과는 확인 전 미검증. 이미 시작한 Main Release가 새 문서 커밋 소스로 바뀌는 것은 아님.

### Issue 종료 및 현장 경계
- [Issue #139](https://github.com/planner77/layoutManager/issues/139), [#138](https://github.com/planner77/layoutManager/issues/138), [#137](https://github.com/planner77/layoutManager/issues/137) 각각 GitHub `closed/completed`, 코드/합성 CI 범위의 Owner Managed 수용 사유를 해당 Issue 댓글에 기록. 이것은 실 회사 DXF/ANSI_949 원본·DRM/GPU, 2PC·200%/native fullscreen·실 현장 성능/보안 인수까지 PASS했다는 의미가 아님. 해당 수용은 #113/#96에 별도 추적.
- 실제 운영 Compose, Auth/Writer GO, DB/CAD/S3/Volume 이관·복구, 원본 도면 파일 변경 없음. CI 최종 완료/Digest 증거는 향후 별도 확인 전까지 주장하지 않는다.

---

## PR #177 — 두 번째 PR CI / #127 nested modal regression 보완 (2026-10-31 KST)

### 검증된 실패 (첫 회차와 별개)
- [Run 41163195588](https://github.com/planner77/layoutManager/actions/runs/41163195588), 정확 HEAD d706fac0702acd49b0c38efbaf8b2ed5e256b5a6, completed/failure. Docker image/migration/runtime smoke Job [124425180875](https://github.com/planner77/layoutManager/actions/runs/41163195588/job/124425180875) SUCCESS. Verify [Job 124425181116](https://github.com/planner77/layoutManager/actions/runs/41163195588/job/124425181116): npm/Prisma/TypeScript/ESLint/Unit+Integration/OCI manifest tests/DXF 1k·10k·100k benchmark/Next Production Build/Playwright Chromium 설치 SUCCESS; Chromium E2E **113 PASS / 1 FAIL**, 이후 G7 signed runtime, G7 Greenfield 및 Legacy migration E2E **SKIPPED**. 이 실패는 이전 Run 41162108326의 ESLint 2개 오류와 다른 결함이다.
- 실패 테스트: src/tests/e2e/issues124-126-127.spec.ts:335, TC-127-DRAWER “mobile generated-delete confirmation remains interactive above its Drawer”, 실패 Assertion line 381. 생성 개체 삭제 확인 alertdialog 표시 중 background Tools Drawer는 inert=true가 되었으나 aria-modal="true"가 그대로 남아 expect(not aria-modal=true) 실패. 로그는 14회 polling에서 같은 속성을 관찰. Playwright 실패 trace artifact [13028975356](https://github.com/planner77/layoutManager/actions/runs/41163195588/artifacts/13028975356). 실제 삭제 로직/DB·G7 장애를 입증한 로그가 아니다.
- 원인: #138의 기존 #127 drawer → MovableViewerPanel 공통화 중 조건식 ‘mobile AND active AND !modalOverlay’가 ‘mobile’로 축소되어 상위 delete confirmation이 떠도 둘 다 modal로 선언하는 접근성 회귀. Shell의 기존 modalOverlay inert effect는 정상 동작해 아래 Drawer가 inert 처리되는 것과 별개의 문제. 기존 #127 접근성/ESC·focus trap 계약이 우선이다.

### 변경 및 회귀 방지
- 수정 [commit 38db1af524e12e63e33c9064bc2d6ad13ffb02c6](https://github.com/planner77/layoutManager/commit/38db1af524e12e63e33c9064bc2d6ad13ffb02c6): MovableViewerPanel 공통 modalBlocked prop (default false), aria-modal only when mobile AND active AND !modalBlocked. ViewerAppShell의 modalOpen(!!modalOverlay)을 Layer/Outline/Memo/Tools/Search 5개에 전달, CadTextSearch도 속성 전달. 별도 원본 Layer·Canvas·Manager/Worker·Source GET/Undo/삭제 거래 변경 없음.
- E2E 기존 TC-127-DRAWER를 확장하여 Delete confirm에서 Drawer inert=true & aria-modal 없음, Escape/취소·버튼 취소 후 inert 해제 및 aria-modal=true 복원을 모두 검사. 모든 공통 패널에 동일 컴포넌트 조건을 적용; 기존 TC-138-02 검색 modal standalone true도 보존.
- 이전 Codex P1 3개 review thread는 답변·Resolved(3/3), 신규 미해결 스레드 0. Main 1a974448dc5fef5539e6d246cbd1ad30c6f46f73 기준 코드 수정 직후 behind=0, ahead=12, PR mergeable=true. 문서 커밋 후 다시 확인.
- 정확 최신 HEAD의 새로운 PR CI는 시작만 확인하고 모니터링 생략. 새 테스트 결과 확인 전 PASS 주장 금지. 현장 비공개 DXF/실 PC·GPU/Owner GO, GHCR, 운영 Auth/Writer/DB 변경, Main 병합, 이슈 종료 없음.

---

## PR #177 — #139/#138/#137 최초 PR CI 실패 및 P1 3건 보완 (2026-10-31 KST)

### 정확한 실패 증거
- PR #177 첫 HEAD 74be95eb77a3077c0b052ac8be53f19974b2dde4, [PR CI Run 41162108326](https://github.com/planner77/layoutManager/actions/runs/41162108326) completed/failure. Verify [Job 124421702132](https://github.com/planner77/layoutManager/actions/runs/41162108326/job/124421702132) FAILURE, Docker image/migration/runtime smoke [Job 124421702420](https://github.com/planner77/layoutManager/actions/runs/41162108326/job/124421702420) SUCCESS.
- Node 22, npm ci, Prisma Client, TypeScript 검사 SUCCESS. ESLint 12 problems = 2 blocking errors + 10 nonblocking warnings. Unit/Integration, OCI tests, benchmarks, Next production build, Chromium/G7/Greenfield/Legacy migration E2E all SKIPPED. 이전 성공 Run 또는 Docker 성공으로 검증 완료를 주장하지 않는다.
- E1: src/features/cad-viewer/viewer-app-shell.tsx:111, react-hooks/refs Cannot access refs during render. textSearch render-prop 함수를 렌더 중 직접 호출하면서 workspaceRef/dialogRef를 함수 인수로 넘김. Fix: data-only component props + React JSX CadTextSearch 컴포넌트 렌더링 (수동 Ref 전달 함수 호출 금지).
- E2: src/features/cad-viewer/viewer-menu-bar.tsx:10, @next/next/no-html-link-for-pages. 내부 '/' 링크에 raw anchor를 사용. Fix: next/link Link 컴포넌트로 바꾸고 href='/' + 기존 confirmDiscard 유지. Lint rule/CI 단계 해제 없음.

### Codex P1 3건 (첫 검토 HEAD 74be95eb)
- [P1 #4430083615](https://github.com/planner77/layoutManager/pull/177#discussion_r4430083615): capture-phase ESC가 신규 data-drawer=search 이벤트를 소비만 하여 창이 닫히지 않음. Viewer escape dispatcher에 검색 전용 close/trigger focus 분기 추가.
- [P1 #4430083618](https://github.com/planner77/layoutManager/pull/177#discussion_r4430083618): compact 검색 모달에 trapTab 누락, Tab이 외부로 이탈. Shell shared trapTab을 CadTextSearch → MovableViewerPanel onKeyDown에 전달; 모바일 열림 중 외부 검색 트리거 숨김.
- [P1 #4430083623](https://github.com/planner77/layoutManager/pull/177#discussion_r4430083623): Tools drawer 내 overflow:hidden으로 아래 입력/버튼 잘림. 닫기 버튼은 스크롤 영역 밖에 배치, 본문은 min-h-0 flex-1 overflow-y-auto viewport로 변경.
- 수정 코드 [8a05a8f8](https://github.com/planner77/layoutManager/commit/8a05a8f8e1e47b758c66a87de5777029b95d04b0), P1 회귀 E2E [a04d3717](https://github.com/planner77/layoutManager/commit/a04d3717aa8ab77ea31310abf040937f254dfd3f) 추가. 모바일 Tab/Shift+Tab, 검색 ESC 모바일/데스크톱, 짧은 화면 tools scroll 및 닫기 검사. 세 원문 리뷰에 직접 답변하고 스레드 PRRT_kwDOUQjDfc6yM484/M485/M489 각각 Resolved 완료 확인 (3/3). 이는 신규 리뷰/새 CI 완료 선언 아님.

### 재실행 전 정합성 및 안전 경계
- Main 1a974448dc5fef5539e6d246cbd1ad30c6f46f73, behind=0, PR mergeable=true, unresolved review threads 0 (새 CI 시작 직전 점검). 신규 정확 HEAD의 Typecheck/Lint/Unit/E2E/Build/Docker 결과는 검증 전 NOT VERIFIED. CI 모니터링은 Owner 지시로 생략.
- 루트 DESIGN.md 없음: AGENTS.md, out/Architecture.md, out/Decisions.md, out/ViewerPanelPolicy.md 기반. 실제 사내 DXF/DRM/실 GPU/2PC 현장 수용, 운영 Auth/Writer/DB/Volume, GHCR 게시, PR 병합, Issue 종료는 수행하지 않음.

---

## #139 → #138 → #137 통합 후보 사전 실패/리스크 원장 (2026-10-31)

- Branch: feat/issues-139-138-137-viewer-20261031. Main 기준 1a974448dc5fef5539e6d246cbd1ad30c6f46f73. Source commits: #139 d8fe1050, #138 21f7aa92, #137 896555f6, 합성 시험 9061417c. PR CI 및 로컬 Typecheck/Lint/Unit/E2E/Build NOT RUN; 과거 PR 성공을 새 HEAD 성공으로 오인 금지.
- #139 위험: 구형 ANSI_949 헤더를 가진 실제 R2007+ UTF-8 여부 미확정; 실 DXF 비반출 현장검증 별도. #138 위험: 기존 Memo Tree/UI/ESC/focus/Canvas 재생성 및 검색 상태 회귀, 신규 합성 E2E 작성. #137 위험: 직접 URL history.back 실패와 로컬 작업 손실, href=/ + confirmDiscard를 적용.
- 문서 갱신 자동 편집 스크립트 1회 로컬 JS 문자열 SyntaxError로 중단됨(원격 Tree/Commit 미생성); 분리된 안전한 편집으로 복구. 이 에러는 앱 CI 실패나 소스 실행 실패가 아니다.
- 최종 HEAD PR CI 실행/검증 결과 및 Codex 리뷰/충돌은 별도 실제 증거로 갱신. GHCR/실 운영 변경 및 이슈 종료 수행하지 않음.

---

## #88/#90 PR #176 — final PR/Owner Managed merge, v0.47.4 GHCR paired release SUCCESS (2026-10-31 KST)

### Final verified source and review gate
- [PR #176](https://github.com/planner77/layoutManager/pull/176) merged via exact one-line Squash subject `#88 | Persisted Memo deep link and cross-drawing search (#90)`, resulting [Main `328bbdc0ca02649cc551a61962cec9e76816ccde`](https://github.com/planner77/layoutManager/commit/328bbdc0ca02649cc551a61962cec9e76816ccde) (parent `7058ec393aad10ebbf22bec6dda70d961cb9b483`). Exact PR head `8af001ef75378aef8214a998c5223e0cd327baf9`, [PR CI #349 Run 41158289254](https://github.com/planner77/layoutManager/actions/runs/41158289254) **completed/success**, Verify Job `124409862915` and Docker Job `124409862929` both SUCCESS (all TypeScript, ESLint, Unit/Integration, Next Build, Chromium E2E, G7 signed Runtime/Greenfield/Legacy Migration E2E and Docker image/smoke checks). Only *this* post-version-bump HEAD is the merge gate; earlier #348 success was for old version `0.47.3`.
- Before merge: one Codex P2 thread `PRRT_kwDOUQjDfc6yLh4a` replied and resolved, unresolved 0; `behind_by=0`, `mergeable=true`, `mergeable_state=clean`. [Owner Managed final gate PR comment #6537705243](https://github.com/planner77/layoutManager/pull/176#issuecomment-6537705243) records explicit approval/limitations. Prior #342 CANCELLED, #343 React/ESLint FAIL, #345 Vitest `server-only` collection FAIL, and #346/#347 cancelled runs remain distinct in the ledger; none retroactively marked success.
- Owner-approved `0.47.4` release-version bump in `src/package.json` and `package-lock.json` prevented `.github/workflows/docker-publish.yml` from silently skipping GHCR because existing `v0.47.3` App/Migrator were already published. Previous `v0.47.3` tag at Main `c3e55a95...` and old digests remain preserved, not retargeted or overwritten.

### Main CI #100 and verified paired GHCR publication
- [Main CI #100 Run 41159460418](https://github.com/planner77/layoutManager/actions/runs/41159460418), event `push`, exact source `328bbdc0ca02649cc551a61962cec9e76816ccde`: **completed/success**. `Main CI - verify release scope` Job `124413552667` **success**; `Build and push to GHCR` Job `124413581996` **success**, including version-tag creation, both candidate builds, `Promote paired release images after both candidates succeed` SUCCESS, and `Measure published linux-amd64 OCI layer bytes` SUCCESS.
- New annotated `v0.47.4` Git tag (tag-object `42818d1729e5025697947bd4e6fae0d29f57f736`) points to exact Squash Main `328bbdc0ca02649cc551a61962cec9e76816ccde`; **not** to the later docs-only evidence commit.
- App `ghcr.io/planner77/layoutmanager:0.47.4` and `:latest`: manifest digest **`sha256:fb608774450146144c0f47f0aa651df8d9b38d9166b005a366448dd9e9ea3140`**.
- Migrator `ghcr.io/planner77/layoutmanager:0.47.4-migrate` and `:latest-migrate`: manifest digest **`sha256:aa9ed793289654b78ea39907e5145e810813956ad1c41669f6bfa81107c161e5`**.
- The Main Job printed `Published version pair`, both digests and verified the version aliases. [PR release evidence comment #6537769167](https://github.com/planner77/layoutManager/pull/176#issuecomment-6537769167) is supplemental evidence, not the only release record.

### Issue completion and operational boundaries
- [#88](https://github.com/planner77/layoutManager/issues/88) `closed/completed`: M6 authenticated, exact Version/SHA persisted Memo deep link, WCS focus/Tree highlight, temporary hidden highlight, Clipboard fallback. Closure [comment #6537711881](https://github.com/planner77/layoutManager/issues/88#issuecomment-6537711881); final release [#6537769552](https://github.com/planner77/layoutManager/issues/88#issuecomment-6537769552).
- [#90](https://github.com/planner77/layoutManager/issues/90) `closed/completed`: M7 signed G7 Site/Reader/Session-scoped SQLite DB-only cross-drawing Memo search, Current-default, optional previous, safe filter/snippets/pagination and link to #88. Closure [comment #6537712361](https://github.com/planner77/layoutManager/issues/90#issuecomment-6537712361); final release [#6537769931](https://github.com/planner77/layoutManager/issues/90#issuecomment-6537769931).
- **Boundary:** Owner Managed approves implementation+synthetic CI only. Actual two-PC/live signed-G7 cross-user Memo focus, physical CAD GPU/Anchor, 1k/10k/100k search throughput/SLO, legacy occupied volume migration, Site Owner-signed Auth/CAD Writer activation, production Compose/DB/CAD/S3 or field GO are **NOT VERIFIED/NOT PERFORMED**. #96/#113 and other live acceptance remain separate.
- This record is a **docs-only after-release Main commit**, not the release source. It must not alter `v0.47.4`, OCI digests, version metadata or `latest` aliases. Its own post-merge docs-only Main push should classify as `release-scope publish=false` and GHCR build SKIPPED; do not assume that follow-up run SUCCESS/SKIPPED until actually checked.

---

## #88/#90 PR #176 — v0.47.4 release version gate before Owner Managed merge (2026-10-31 KST)

- **Verified existing release:** [Main CI Run 41145893248](https://github.com/planner77/layoutManager/actions/runs/41145893248), HEAD `c3e55a95ed2c7a61413e5b0577004252994fe988`, `completed/success`. Its GHCR Job `124370837208` built both candidates and successfully ran `Promote paired release images after both candidates succeed`; signed annotated Git tag `v0.47.3` targets the #85/#86 merge `c3e55a95...`. This is an **existing, immutable previous release**.
- **Critical collision:** #176 PR HEAD `ef1378529f494827d420fc1d72adcdd69a8fad6b` had the same `src/package.json`/`package-lock.json` version `0.47.3`. In `.github/workflows/docker-publish.yml`, `Check version images on GHCR` + `Decide whether to publish` skip image build/promotion when both version aliases already exist. Merging without a new version would produce Main CI SUCCESS but **would not publish #88/#90 source**. Do **not** retarget `v0.47.3`, mutate old digests or claim latest incorporates these changes.
- **Owner-requested fix:** update both package manifests to `0.47.4`, confirm `v0.47.4` tag absent before merge, keep historical v0.47.3 tag/digests intact. No dependency upgrade; only package release metadata and docs changed. The new PR HEAD needs **fresh Typecheck/ESLint/Unit/Integration/Next Build/Playwright/G7/Greenfield/Docker PR CI SUCCESS**. Old [PR CI #348 Run 41156347595](https://github.com/planner77/layoutManager/actions/runs/41156347595) was `completed/success` at previous SHA `ef137852...` (Verify `124403886487` SUCCESS, Docker `124403886939` SUCCESS); cannot validate new HEAD.
- Prior failure ledger Run #343 lint / Run #345 Vitest import remains historically correct. Existing Codex P2 thread `PRRT_kwDOUQjDfc6yLh4a` resolved and latest base Main `7058ec393aad10ebbf22bec6dda70d961cb9b483` behind=0, mergeable=true at previous SHA. Recheck reviews/conflicts after new CI. Owner Managed accepts independent QA procedure waiver, not G7 signed permission or real field acceptance.
- At future Owner-approved gate, **squash title** `#88 | Persisted Memo deep link and cross-drawing search (#90)`, preserve precise PR PASS HEAD in Conversation ledger before merging; close #88/#90 as `completed` with scope caveats. Merge Main push starts `Main CI and conditional Docker publish`, which should create `v0.47.4` and paired `0.47.4`/ `0.47.4-migrate` and latest aliases only after both candidate manifests are verified. Record actual Main Run ID, exact merge SHA, release-scope and GHCR job states; until successful push logs and digests, `GHCR publication=NOT VERIFIED`.
- Do not alter production volumes/SQLite/Scene/CAD, G7 Writer/Auth activation, release signature/field acceptance or conflate synthetic test pass with 2-PC real drawing. #96/#113 and future live M6/M7 search/anchor/performance acceptance remain independent.

---

## #88/#90 PR #176 — PR CI #345 Vitest import failure, authenticated test isolation, new CI launch (2026-10-31 KST)

### Exact failed run / scope of evidence

- [PR CI #345 / Run 41153178204](https://github.com/planner77/layoutManager/actions/runs/41153178204) at exact HEAD `e758a0d5effcba577dca6ffe2b87fe15952d3c71`, `completed/failure`. Docker Job `124394409585` **SUCCESS** including baseline/App/Migrator build, disposable Greenfield Compose + Admin/CAD Smoke, native SQLite tests. Verify Job `124394409303` **FAILURE**.
- Verify steps: npm dependency install and Prisma generate SUCCESS; TypeScript SUCCESS; ESLint SUCCESS (Run #343 prior lint error not repeated); **Vitest Unit/Integration FAILURE** with `103 test files passed / 1 suite failed`, **682 tests passed**. Only failed suite: `src/tests/integration/memo-search-auth.test.ts` at module collection (`0 test`), error `This module cannot be imported from a Client Component module. It should only be used from a Server Component.` from `node_modules/server-only/index.js:1:7`. No actual signed Site/role assertion was executed in that suite; it is an import isolation failure, **not evidence of auth logic failure**.
- OCI standalone tests, DXF benchmark, Next Production Build, Chromium browser E2E, signed G7 Runtime/Greenfield E2E and legacy migration E2E were **SKIPPED** by sequential fail-fast Verify workflow. Do not treat Docker SUCCESS or the other 682 passing tests as full CI pass.

### Cause and narrowly scoped fix

- `memo-search-auth.test.ts` imports `requireMemoSearchSites` from `src/server/scene/scene-context.ts`. That runtime module also imports `@/server/context`, which intentionally imports the Next `server-only` marker. Vitest's module collection executed this sentinel despite the test only needing the G7 Memo Site auth helper.
- Fix code commit [`cd05b0faff7a7d27cab890626d12a1eddda8488d`](https://github.com/planner77/layoutManager/commit/cd05b0faff7a7d27cab890626d12a1eddda8488d): add hoisted `vi.mock('@/server/context', () => ({context:()=>{throw new Error('UNEXPECTED_LEGACY_CONTEXT')}}))` in the **test file only**, matching the existing `src/tests/integration/g7-runtime-cad.test.ts` signed-runtime isolation pattern. This excludes the unrelated legacy server-only import without mocking G7 signed authority, SiteGrant, actor/session revocation checks, Prisma, production route, or the `requireMemoSearchSites` implementation. Unexpected legacy fallback fails loudly.
- Documentation commit `8e2506188bd4ea5a3157fa631ec1f40cd69d805f` adds test-plan and evidence clarifications to `AGENTS.md`, `out/TestPlan.md`, `out/TestReport.md`, and `out/Issues88-90.md`. No production runtime / DB / CAD Source / writer / schema changes and no CI controls disabled.

### Review, Main, and new PR CI gate

- PR #176 latest checked docs HEAD `8e2506188bd4ea5a3157fa631ec1f40cd69d805f`, base Main `7058ec393aad10ebbf22bec6dda70d961cb9b483`: GitHub compare `ahead_by=18, behind_by=0`, `status=ahead`; PR `mergeable=true`, **no Main conflict**. Single previous Codex P2 thread `PRRT_kwDOUQjDfc6yLh4a` is **resolved/outdated** (reply recorded in earlier ledger); `0 unresolved` at this check. Resolved thread status does not equal a fresh Codex approval.
- New code/docs pushes automatically trigger `pull_request.synchronize` PR CI: intermediate code Run #346 / `41156201323` was `in_progress`, docs Run #347 / `41156295790` was `pending` when observed. These are not PASS and may be cancelled by the final ledger commit due to CI concurrency. The *next* ledger commit to branch must trigger a full PR CI on the exact new HEAD; record Run ID/status if confirmed, with **outcome NOT VERIFIED** until an actual completed run. No ongoing CI monitoring requested.
- PR merge, GHCR, issue closure, legacy volume migration, G7 Auth/CAD Write activation, real DXF/2-PC/GPU field acceptance and 1k/10k/100k search SLA evidence **NOT PERFORMED**. Keep #88/#90 OPEN. Past #342 cancelled, #343 lint failure, and #345 Vitest failure remain distinct historical records; no retroactive PASS.

---

## #88/#90 PR #176 — PR CI #343 ESLint FAILURE, P2 fixed, new PR CI handoff (2026-10-31 KST)

### Exact failed execution and classification
- [PR CI #343 / Run #41148144608](https://github.com/planner77/layoutManager/actions/runs/41148144608) `completed/failure`, source HEAD `8bf85699021ac587bb1595cd44bb27618f141d8b`. Earlier [PR CI #342 / Run #41148087457](https://github.com/planner77/layoutManager/actions/runs/41148087457) at `be10753a617d165f49d7242c0756880c47fb7e06` was **CANCELLED**, not success or independent failure.
- Docker Job `124378361245` **SUCCESS**: baseline and App/Migrator image builds, native SQLite/OCI audits, disposable Greenfield Compose/Admin/CAD/restart smoke all reported success. No Docker/Greenfield migration failure evidenced by this run.
- Verify Job `124378361508` **FAILURE**: `npm ci` / Prisma Client generation / TypeScript checker **SUCCESS**. `ESLint` **FAILURE** with exactly **3 errors + 11 nonblocking warnings**. `src/features/cad-viewer/viewer.tsx` #414 `openDelete` and #572 `resetOutline`: `react-hooks/preserve-manual-memoization` compiler-inferred `setDeleteRequest` dependency did not match explicit manual deps. #651: `react-hooks/set-state-in-effect` from synchronous `setMemoLinkNotice` inside new direct-link effect. Original M6/M7 request/renderer lifecycles not yet exercised by CI past lint.
- Unit/Integration/OCI test/outline benchmark, Production Next build, Chromium E2E, signed G7 Runtime and Greenfield E2E, Legacy migration E2E were **SKIPPED** in that failed Verify job. Docker success must not be presented as overall PR success. Existing 11 warning messages remain distinct from lint failures.

### Corrections, review and regression
- Code correction `c783bf4e8ff51ff68f090be0059f9e88708c8709`: `openDelete`/`resetOutline` manual callback deps explicitly include `setDeleteRequest` rather than disabling lint rules. Invalid UUID/unsupported Renderer/G7 off/unavailable notices are render-derived; async GET success/error continues to update state in asynchronous continuations.
- [Codex P2 inline finding #4429501072](https://github.com/planner77/layoutManager/pull/176#discussion_r4429501072), thread `PRRT_kwDOUQjDfc6yLh4a`: previous memo-notice retry called `setAttempt`, reinitialized ViewerManager and could silently drop unsaved APP_CREATED/Undo work. Replaced with memo HTTP-only `memoDetailRetry` and `memoListRetry`, with no CAD loader epoch change; link-copy success/fallback does not expose destructive retry. `OFF` or unavailable memo list uses list-only refresh. Reply [#4429705126](https://github.com/planner77/layoutManager/pull/176#discussion_r4429705126) posted and GitHub GraphQL thread **RESOLVED**. This resolves the code finding, not independent CI acceptance.
- Regression commit `166fdd52c585a50a025a04d3d1c0ab815bd27455`: Playwright `#88 P2` checks that memo-only retry keeps same WebGL canvas element and unsaved browser-session Memo after auth runtime OFF; one unused lint-disable in memo search screen removed. Test execution **NOT VERIFIED** until next exact-head CI.
- Documentation correction `f573e84b0c6657a7aabaa65c582af400f64584b7` in AGENTS.md, out/Issues88-90.md, TestPlan/TestReport records the technical root cause and non-destructive retry boundary. No tests locally run in connector-only environment. No legacy volume migration, Auth/Writer activation, GHCR, Merge, issue closure or real-site acceptance.

### Latest reviewed gate and new CI trigger
- Before this ledger write, GitHub PR #176 code/docs HEAD `f573e84b0c6657a7aabaa65c582af400f64584b7`, base Main `7058ec393aad10ebbf22bec6dda70d961cb9b483`: compare status `ahead`, ahead=15, **behind=0**; PR `mergeable=true`, so no known Main conflict. One Codex inline thread is resolved/outdated; **unresolved=0** at the last check. Later commits/reviews must be reassessed for merge decision; no approval is implied.
- **Next operation:** push this failure ledger entry to the existing PR branch. The resulting `pull_request.synchronize` is expected to start a **new full PR CI** on the post-repair HEAD; verify a workflow Run was queued/started but do not monitor its conclusion per Owner request. Newly started CI is **NOT VERIFIED** and does not retrospectively change Run #343 or #342. If no workflow starts, mark trigger not confirmed and use a supported event rather than reporting success.

---

## #88/#90 PR #176 — new PR review/merge gate and exact-HEAD CI handoff (2026-10-31 KST)

- [PR #176](https://github.com/planner77/layoutManager/pull/176) was created from `feat/issues-88-90-memo-link-search-20261031` at code+ledger HEAD `be10753a617d165f49d7242c0756880c47fb7e06`, base Main `7058ec393aad10ebbf22bec6dda70d961cb9b483`.
- **Actual GitHub gate read:** after initial mergeable calculation, GitHub REST reported `mergeable=true, mergeable_state=unstable, rebaseable=true`; GitHub compare `status=ahead, ahead_by=11, behind_by=0`; GraphQL review threads `[]` (**0 unresolved**, not independent review approval). No merge conflict and no thread to resolve at that checkpoint. The `unstable` state is CI/check status, not a source merge conflict.
- Owner requested **start PR CI and skip monitoring**. This record is committed before the latest PR `synchronize` event, which is expected to trigger PR CI. Workflow execution SUCCESS/FAILURE, Run ID, test count and Docker Build **NOT YET VERIFIED**; monitoring deliberately omitted. Do not close #88/#90, merge, push GHCR or change runtime.
- Automated tests and full M6 signed cross-session/performance acceptance remain in [TestReport](TestReport.md) as NOT RUN/NOT VERIFIED, regardless of PR creation. Failures, if reported, must be appended with exact run/root cause before a new CI attempt.

---

## #88/#90 M6/M7 — pre-PR CI implementation, review and conflict ledger (2026-10-31 KST)

- **Scope and order:** dependencies #83/#84/#85/#86 closed. Root DESIGN.md absent, so AGENTS.md + out/Architecture.md/Decisions.md/Issues88-90.md are design authority. #88 authenticated UUID Version+Memo URL and renderer-ready WCS focus first; #90 G7 Site-scoped DB search and home UI second. Code/test/docs committed on `feat/issues-88-90-memo-link-search-20261031`.
- **Main alignment verified before PR:** Main `7058ec393aad10ebbf22bec6dda70d961cb9b483`, branch initial development head `89867a685c0748035254524950fa19775adae1a7`, compare GitHub returned `status=ahead, ahead_by=10, behind_by=0`, 27 changed files. No divergent Main commits/conflict at this checkpoint. Actual PR mergeable/review threads will be checked after PR creation. Do not infer future no-conflict automatically.
- **Synthetic tests added, execution status:** Unit `viewer-link`/`cad-memo-search`, SQLite Integration `memo-search-sql`, G7 signed session `memo-search-auth`, Playwright entry cases `issues88-90-memo-search`. This connected Git-object-only environment cannot execute workspace TypeScript/Vitest/Browser locally. **NOT RUN**; PR CI Typecheck/Lint/Vitest/Playwright/Build/Docker outcomes **NOT VERIFIED**. Real signed cross-session Memo focus and 1k/10k/100k search performance **NOT VERIFIED**; no invented SLA or PASS.
- **Safety/release:** No auth scope weakening, legacy DB adoption/migration, Version/Current/Scene mutation, origin DXF parsing for search, operation switch, GHCR push or Issue closure. OFF runtime keeps persistent search inaccessible. PR CI trigger planned after this failure ledger commit; monitoring intentionally omitted per Owner instruction. If CI fails, append exact Run, root cause, patch evidence and new HEAD, then restart. No prior failure is suppressed or retroactively marked success.

---

## #85/#86 PR #175 — PR CI #341 SUCCESS, Owner Managed Squash + Main CI/GHCR launch (2026-10-31 KST)

### Verified, exact-source PR CI
- [PR #175](https://github.com/planner77/layoutManager/pull/175): latest verified HEAD `a6d3bdef1cc3e8a12ca95e918b5a2d49fad83d50`, [PR CI #341 / Run 41142161238](https://github.com/planner77/layoutManager/actions/runs/41142161238) `completed/success`. Verify Job `124359139129` SUCCESS (TypeScript, ESLint, Unit, Integration, production Next build and Playwright E2E); Docker Job `124359139260` SUCCESS (baseline and candidate image build, migrator and disposable Greenfield first-run/runtime smoke).
- Historic failed PR CIs below retain their distinct causes: [Run 41137913177](https://github.com/planner77/layoutManager/actions/runs/41137913177) had TypeScript TS18047 x5 and dependent Docker Build failure, remedied by explicit terminating group/version null guards; [Run 41139632431](https://github.com/planner77/layoutManager/actions/runs/41139632431) had 101 E2E PASS + 2 screenshot exact-PNG byte mismatches after canvas resize/fullscreen, remedied by bounded normalized CAD stroke similarity checks. The newer successful run validates the **post-repair HEAD**, not the old failed HEADs.
- GitHub review threads 3 total (Codex P1 movable Memo Tree #4429007637, P2 session group synchronization #4429007642, P2 independent status/group search #4429007644), all replied and resolved. At merge gate: unresolved 0, Main `870d3cf0a4f8e42d2e5c4132076d3b7ab9c52089` vs PR behind=0, `mergeable=true`, conflict 0. Owner explicitly accepted Owner Managed QA scope; independent site acceptance not asserted.

### Merge, Issue close and GHCR workflow start
- [Final gate PR comment #6535841930](https://github.com/planner77/layoutManager/pull/175#issuecomment-6535841930) created **before merge** to preserve exact passing PR HEAD and avoid post-CI code or docs edits on the PR.
- **Squash Merge confirmed** to [Main `c3e55a95ed2c7a61413e5b0577004252994fe988`](https://github.com/planner77/layoutManager/commit/c3e55a95ed2c7a61413e5b0577004252994fe988), subject exactly `#85 | Memo Tree and optional schedule/completion (#86)`. `PR #175 merged=true/closed` verified.
- [Issue #85](https://github.com/planner77/layoutManager/issues/85) and [Issue #86](https://github.com/planner77/layoutManager/issues/86) **closed/completed**, with explicit scope+limitations documented in [#85 comment #6535849033](https://github.com/planner77/layoutManager/issues/85#issuecomment-6535849033) and [#86 comment #6535849746](https://github.com/planner77/layoutManager/issues/86#issuecomment-6535849746). Initial M4 one-level user groups; optional memo-parent hierarchy and full site acceptance NOT CLAIMED.
- [Main CI Run 41145893248](https://github.com/planner77/layoutManager/actions/runs/41145893248) event `push`, HEAD **merge commit `c3e55a95ed2c7a61413e5b0577004252994fe988`**, at first check `in_progress`, conclusion null. `src/package.json` + lock are `0.47.3`; `v0.47.3` tag absent **before merge**. Main runtime-code diff ordinarily triggers `release-scope` publish=true followed by `build-and-push`, App+Migrator image candidate/digest verification and planned `ghcr.io/planner77/layoutmanager:0.47.3` + `:0.47.3-migrate` (then latest aliases).
- **Main CI SUCCESS, version tag creation, GHCR actual publication/digests are NOT VERIFIED**. Owner expressly requested **no CI monitoring**. Workflow started ≠ published images. If CI fails, resolve the failing release step from logs before claiming GHCR available; never force-move existing version tag. Do not claim PR candidate images were reused in absence of matching digest evidence.

### Documentation-only evidence sync and deployment boundary
- This is an **after-merge docs-only Main commit**, not a changed implementation HEAD, so the exact green PR CI and release-trigger merge SHA remain unchanged. The additional docs-only Main push will invoke a separate release-scope CI expected to classify *.md-only diff as **GHCR SKIPPED**, serialized behind the real release workflow via `docker-publish-release` concurrency (`cancel-in-progress:false`). Do not represent the docs-only SHA as GHCR image source. Its future CI outcome is also NOT VERIFIED.
- No actual site Docker/SQLite/CAD/S3 access, existing volume migration, silent sidecar schema ALTER, G7 Auth/CAD Writer activation or 2-PC real CAD/GPU acceptance. New `CadMemoGroup/CadMemoFeature` persistence remains empty-Greenfield-only; old M2 read compatible, old schema M4/M5 write unavailable by design. #172 collaborative edit and #96/#113 live acceptance separate.

---

## #85/#86 PR #175 — CI #41139632431: WebGL 레이어 복원 E2E 2건 실패 (2026-10-31)

### 정확한 실패 증거
- [PR CI Run 41139632431](https://github.com/planner77/layoutManager/actions/runs/41139632431), attempt 1, HEAD `8df9f656c2c4e9e06e9e3c8552be246e01de4caa`, `completed/failure`.
- Docker Job `124351064253` **SUCCESS**: 기존 Dockerfile baseline/후보 app+migrator 이미지 빌드 및 Greenfield Compose smoke 포함. Verify Job `124351064417`: TypeScript, ESLint, Unit/Integration, Next Production Build 모두 **SUCCESS**. Playwright E2E만 **101 PASS, 2 FAIL**. 이전 Run #41137913177의 TS18047 실패와 혼동하지 않는다.
- E2E `src/tests/e2e/issue17-fullscreen-layers.spec.ts:154` TC-ISSUE17-001, `src/tests/e2e/layer-dropdown.spec.ts:71` TC-LAYER001가 `expect.poll(() => canvas.screenshot().equals(savedPng)).toBe(true)`에서 각 5초 타임아웃. Playwright 화면 snapshot은 각각 Layer 2/2, 3/3 **전체 체크** 및 Canvas에 원본 선 복원. [실패 Artifact 13017814221](https://github.com/planner77/layoutManager/actions/runs/41139632431/artifacts/13017814221) Trace 영상의 비교 시 초기 Canvas 프레임 800×378과 복원 이후 798×378 등의 크기 편차가 관측된다. 두 실패가 공통 `PNG Buffer 완전 일치` 검증이어서 레이어/Zoom 불변 위반을 단정할 수 없음.

### 원인 분리 및 보완
- 확인된 직접 실패는 screenshot PNG 바이트 동일성 가정이다. CSS fullscreen/패널 전환 및 scrollbar/resize에 따른 미세 raster 크기 변화와 WebGL antialiasing이 있을 때 기능적으로 동등한 렌더도 PNG Buffer는 다를 수 있다. 새 이미지가 전체 빈 화면이거나 누락된 CAD 획이 있으면 거절해야 하므로 단순 무조건 통과/비교 삭제 금지.
- `src/tests/e2e/canvas-stroke-similarity.ts` 도입: Playwright PNG 둘을 브라우저 imageBitmap으로 디코딩하여 공통 512×256 이미지로 크기 정규화. Layer Drawer 및 top-right TEXT 검색 버튼이 덮는 영역은 제외하고 Source Canvas 중앙에 밝은 선 마스크를 생성, ±2 정규화 픽셀 내 양방향 가까운 획 비율 측정. 초기/복원 시 밝은 획 20개 미만이면 0점(무조건 실패), 결과 92% 이상인 경우에만 복원 성공으로 판단. Trace JPEG 진단에서는 정상 복원 경로가 약 1.0, 부분 Layer 숨김이 약 0.76 overlap 예시를 보였으나 실제 새 CI의 PNG 검증 결과를 PASS로 소급하지 않는다.
- TC-ISSUE17-001 / TC-LAYER001 두 복원 단계에서 `canvasStrokeSimilarity` 기반 10초 poll로 대체. 기존 Layer 개별/전체 상태 체크, 숨김 시 시각적 변경, Canvas DOM 식별자 보존, 원본 content GET 1회 및 Renderer fallback 가드는 그대로 둔다. 제품 `showLayer`·`fitToView`·WebGL Renderer/캔버스·CSS 동작은 변경하지 않음.
- 이 테스트 수정은 엄격한 바이트 동일성 조건을 **시각적 원본 CAD 획 복원 조건으로 치환**한 것이며 Renderer 동작 자체를 성공 입증한 것은 새 CI 통과 이후다. 실제 현장 GPU/2PC 수용과 별개.

### 리뷰/충돌/운영 게이트
- 기존 Codex P1/P2 리뷰 스레드 3개는 회신 후 모두 Resolved. 최신 스레드와 Main behind/mergeable을 PR CI 시작 전 다시 확인한다. 새 Codex 지적은 최신 HEAD 확인 전 임의 Resolved 금지.
- 실제 운영 SQLite/CAD/S3, G7 Auth/Writer, Schema migration, GHCR, Main merge, 이슈 종료는 이번 작업 비범위. 새 HEAD의 CI 시작 확인만 하고 모니터링 생략. 본 기록 시점 새 HEAD의 모든 CI 결과는 NOT VERIFIED.

---

## #85/#86 PR #175 — CI #41137913177 FAILURE + Codex P1/P2 remediation (2026-10-31)

### Exact failed evidence
- [PR CI Run 41137913177](https://github.com/planner77/layoutManager/actions/runs/41137913177), attempt 1, PR HEAD `f9fbef10997e912c50080c7bd7dc6fe7b96b603a`, `completed/failure`.
- Verify Job `124344823034` **FAILURE** at `TypeScript 검사`: TS18047 `src/server/cad-business/memo-groups.ts` lines 15-16 (`v` nullable) and 58-60 (`group` nullable); 5 errors. Cause: the `blocked():never` call was not structurally expressed as terminating the guarded branch for TS narrowing. Fix: explicit `return blocked(...)` under both `!v` / `!group` checks. Do not use unsafe non-null assertions. Lint, Unit/Integration, Build, Playwright were **SKIPPED**, not SUCCESS.
- Docker Job `124344822694` **FAILURE** in `Build pre-change baseline (same source, original Dockerfile)`: Next production build runs TS check on new HEAD code and encountered **same nullable `v` TypeScript error**. Docker Base Image/Compose resolution/setup succeeded. Remaining Docker size, migrator smoke and Greenfield tests **SKIPPED**. No independent Docker/migration bug evidenced by this run.

### Codex review findings (all were initially unresolved)
- P1 [r4429007637](https://github.com/planner77/layoutManager/pull/175#discussion_r4429007637): Memo Tree fixed drawer violated #138 `ViewerPanelPolicy` movable handle/reset/session placement. Added generic `movable-viewer-panel.tsx` + pure `viewer-panel-position.ts`, desktop pointer threshold/capture/cancel, keyboard Arrow/Shift, reset/close, ResizeObserver viewport clamp, z-order, CSS/native fullscreen-compatible local workspace positions; same component stays mounted between close/open; scope-key resets across Version/Renderer/reload; compact modal behavior unchanged. Added clamp Unit and pointer/keyboard/resize/close E2E. Other #138 panels not declared complete.
- P2 [r4429007642](https://github.com/planner77/layoutManager/pull/175#discussion_r4429007642): on G7 OFF group assignment/return-to-unclassified only mutated Tree, but saved M5 schedule read `MemoSession.groupId=null` and reverted Tree assignment. Now validates Tree assignment, then updates canonical MemoSession metadata via `changeMemoMeta`; local group deletion also synchronizes MemoSession members while preserving schedule/visibility. Added E2E group assignment→completion save→group retained.
- P2 [r4429007644](https://github.com/planner77/layoutManager/pull/175#discussion_r4429007644): group-name search coupled with memo-text predicate when status filter not default. Changed to `statusMatch && (groupNameMatch || memoTextMatch)`; E2E covers complete/incomplete/unmanaged group-name filtering.
- Three inline review threads received replies (reply IDs 4429067656, 4429068070, 4429068372) and GitHub GraphQL state **RESOLVED**. Codex new-head review not yet claimed PASS.

### Additional preventive regression
- `src/server/g7-operational/runtime-db.ts`: old `202610310001_greenfield_anchor_baseline` was supported by `assertG7GreenfieldSchema` but absent from the high-level `assertG7RuntimeSchema` recognized one-row baselines after replacing current baseline with M4/M5. Added the exact previous Anchor marker and a synthetic former-baseline acceptance/drift rejection integration test. Does **not** migrate or weaken SQL fingerprint, FK or auth.
- Updated `viewer-app-state.test.ts` default state to explicitly include `memoTreeOpen:false` plus compact/exclusive right-drawer regression (previous expected object was stale and would otherwise fail once Typecheck passed).
- Local full Node/Prisma/Vitest/Playwright/Docker execution **NOT RUN** in GitHub-connector-only environment. Unit/E2E tests committed; new HEAD PR CI is the next evidence. No GHCR/operational database access or image action.

### Gate
Latest Main initially `870d3cf0a4f8e42d2e5c4132076d3b7ab9c52089`; confirmed PR branch behind=0, mergeable=true, 3/3 review threads resolved after corrections. New PR CI to be started against *final documented HEAD*, without follow-up monitoring per Owner. Issue #85/#86 OPEN, Main merge/GHCR publishing deferred.

---

## #85/#86 M4/M5 — pre-PR-CI failure ledger (2026-10-31)

- Existing open Draft PR #148 only implemented session M4 over old M1. Rebase/merge onto latest M2/M3 would overwrite newer server persistence, anchors or Viewer. Corrective action: clean branch from Main `870d3cf0a4f8e42d2e5c4132076d3b7ab9c52089`, selectively port domain/Tree/reducer/shell/tests; old PR #148 had zero unresolved review threads when checked.
- Historic CAD_BUSINESS_DDL/CAD_ANCHOR_DDL/schema fingerprints kept unchanged; new empty G7-only M4/M5 sidecars. Old M2 readable, unsupported M4/M5 write explicit 503. No operational volume modification.
- Preliminary GitHub Git-object scripts rejected ambiguous code replacements before remote commit, corrected and safely committed. This was not a PR CI failure. Local Typecheck/Prisma/Next/E2E/Docker jobs not run in connector-only session. PR CI result **NOT VERIFIED** and not to be claimed SUCCESS. See [Design](Issues85-86.md).

---

## #84/#167 PR #173 — v0.47.2 App/Migrator Pair GHCR 최종 게시 SUCCESS (2026-10-31 KST)

- **릴리스/이미지 최신 실증:** [Main CI #95 / Run 41131717206](https://github.com/planner77/layoutManager/actions/runs/41131717206) `completed/success` 정확 HEAD [`59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`](https://github.com/planner77/layoutManager/commit/59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7), release-scope Job `124324008108` SUCCESS 및 GHCR Build/push Job `124324087630` SUCCESS. GHCR Log: `Publish version image: true`; `Published version pair: ghcr.io/planner77/layoutmanager:0.47.2 and ghcr.io/planner77/layoutmanager:0.47.2-migrate`. App `:0.47.2` `sha256:45d6df2cdb2100d2cf6b20264f0a39bc407938902b1490492c4c5a29036a5c06`, Migrator `:0.47.2-migrate` `sha256:77841b57e0e44b80b914beacedb02e4ce81bef2d0acb4524c545a19d6e47d6ad` (OCI SHA-256). `Promote paired release images after both candidates succeed` 단계에서 `:latest`/`:latest-migrate` alias 함께 정식 승격, published layer measurement 성공. Annotated Git tag `v0.47.2` 대상 `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7` 정확 일치.
- **문서-only Main CI:** [#96 / Run 41132397577](https://github.com/planner77/layoutManager/actions/runs/41132397577) HEAD `34a37ff83863fa56b8d7fcf006574e008db6758a` `completed/success`; release-scope `124326316971` SUCCESS, GHCR Build/push `124326385097` SKIPPED. 문서 기록이 `v0.47.2` tag/이미지 Digest를 재빌드·강제 이동하지 않음 확인.
- **P1/CI/Issue:** 최신 [PR CI #332](https://github.com/planner77/layoutManager/actions/runs/41127321736) `00c0cefa1daa8b75e3ba157ecbdcf264816e31b9` 두 Job SUCCESS·P1 1건 Resolved/충돌 없음. Squash Main `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`. Issue #84/#167 `closed/completed`는 코어 구현/합성 시험 범위이고, #174(다중 후보·앵커 유지 이동·부하), #172(Memo Editor 공동 편집), #96/#113(새 설치·실 DXF/GPU·2PC), #160 S7은 여전히 OPEN. 실 운영 DB/CAD/Volume/S3/DRM/Compose/Auth/Writer 변경이나 현장 수용을 수행하지 않았다.
- **기존 원장 상태값 해석:** 아래 `GHCR PENDING`은 당시 Main CI #95 후보 빌드 중 관측한 **역사 기록**이고, 이 최상단의 실제 GHCR Publish+OCI Digest 증거가 이후 완료 판정으로 우선한다. 최초 v0.47.1 Digest/태그는 보존. 이 최종 확정 기록도 문서-only Main 후속 커밋이며, 새로운 docs-only CI의 GHCR SKIPPED 결과는 실제 확인 전 PASS라고 표시하지 않는다.

---

## #84/#167 PR #173 — Owner Managed PR CI #332 성공·Squash·Main v0.47.2 릴리스 인계 (2026-10-31 KST)

- **PR Latest VERIFIED SHA:** `00c0cefa1daa8b75e3ba157ecbdcf264816e31b9`, [PR CI #332 / Run 41127321736](https://github.com/planner77/layoutManager/actions/runs/41127321736) `completed/success`. Typecheck/Lint/Unit/Integration/Production Build/E2E Job `124309598067` SUCCESS; Docker image size/migration/runtime smoke Job `124309597751` SUCCESS. 옛 Run #318 성공은 변경 전, #319~#331은 해당 최신 HEAD 검증 증거가 아님.
- **리뷰·병합 게이트:** [PR #173](https://github.com/planner77/layoutManager/pull/173) Codex P1 [#4428206096](https://github.com/planner77/layoutManager/pull/173#discussion_r4428206096) 삭제된 Memo의 dangling Anchor/후속 Outline 충돌 수정 및 같은 거래 cleanup, 댓글 #4428381918 회신·1/1 Resolved. 미해결 0. 최신 Main `34e3a362e9a9d01579d4a61b81b26f4ee935c87b` 대비 behind0, GitHub mergeable=true/충돌 0, v0.47.2 기존 tag 404, package/lock 모두 0.47.2. Owner 명시 승인으로 검증 HEAD를 코드 변경 없이 PR 제목 정확한 1행으로 Squash Merge, [Main `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`](https://github.com/planner77/layoutManager/commit/59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7) 성공. [병합 게이트 기록](https://github.com/planner77/layoutManager/pull/173#issuecomment-6533890078).
- **GHCR/Main 확인:** [Main CI #95](https://github.com/planner77/layoutManager/actions/runs/41131717206) release-scope Job `124324008108` SUCCESS, GHCR Build/push Job `124324087630` **in_progress/PENDING**. 릴리스 태그 `v0.47.2`는 merge commit `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`에 생성 확인. App/Migrator 실제 pair 게시 성공/OCI Digest는 이 문서 기록 당시 **NOT VERIFIED**, 이후 실제 CI/Registry 로그 확인 전 SUCCESS라고 주장하지 않는다.
- **Issue 종료와 미완료 AC 구분:** [#84](https://github.com/planner77/layoutManager/issues/84) 및 [#167](https://github.com/planner77/layoutManager/issues/167) 각각 `closed/completed` — 본 PR의 **영속/임시 Memo Snap + S6 코어 코드·합성 CI 범위** 종료. 원래 수용 기준 중 다중 후보 수동 선택·연결 유지 메모 이동·부하/실디바이스는 신규 [#174](https://github.com/planner77/layoutManager/issues/174) OPEN, 타 작성자 Memo 정책 [#172](https://github.com/planner77/layoutManager/issues/172) OPEN, Greenfield 현장 Auth [#96](https://github.com/planner77/layoutManager/issues/96) 및 실제 DXF 3종/GPU [#113](https://github.com/planner77/layoutManager/issues/113) OPEN. 상위 [#160](https://github.com/planner77/layoutManager/issues/160) S7 통합 현장 수용 OPEN. 구현 코어 종료를 원문 AC 전체 PASS로 소급하지 않는다.
- **운영 격리:** 실제 운영 Volume·DB·CAD·S3/DRM/Compose·Auth/Writer 활성화·기존 데이터 이관/파괴를 수행하지 않았다. 기존 `v0.47.1` OCI digest/tag는 보존. **이 원장·TestReport·ChangeLog·AGENTS 기록은 이미 만들어진 v0.47.2 릴리스 커밋을 변경하지 않는 docs-only Main 후속 커밋**이며, 신규 Main CI의 release-scope는 GHCR SKIPPED되어야 한다; 그 CI 결과는 실제 조회 전 PASS가 아니다.

---

## #84 / PR #173 — 세션 스냅 누락 보완·Codex P1 리뷰 및 CI 중간 실행 (2026-10-31 KST)

- **근거:** 사용자가 PR #173의 원래 #84 AC 중 임시 Generated 자동 스냅·이동/회전/Undo/Redo 및 서버에 영속되지 않은 DXF_IMPORTED SceneWork 연계를 복구하도록 지시. 이전 구현은 서버 CadMemoAnchor만 구현하여 이를 제한한 것을 수정한다. 설계 [out/Issues84-167.md](Issues84-167.md)와 원래 [#84](https://github.com/planner77/layoutManager/issues/84)의 M3-AC1~05 참조.
- **이전 검증과 한계:** 최초 [PR CI #318 / Run #41123776757](https://github.com/planner77/layoutManager/actions/runs/41123776757) `completed/success` Verify+Docker 두 Job이 통과한 것은 **보완 전** HEAD `ee4311946b5185c3d2c5c4c830996d38829599f9`에 한정. 이어진 #319~#329 중간 PR CI는 연속 브랜치 업데이트로 `cancelled` 관측, 새 코드의 테스트 PASS로 간주하지 않는다. 코드 갱신 중 Run #330 `41126777239`는 실행 중 관측됐으나 문서/코드 최종 HEAD와 다르면 최종 검증 근거로 사용하지 않는다.
- **Codex P1 실제 리뷰:** [#4428206096](https://github.com/planner77/layoutManager/pull/173#discussion_r4428206096) `BusinessRepository.editMemo(remove)`가 soft-deleted Memo의 CadMemoAnchor를 남기는 P1. 이후 Outline move/delete의 `reconcileOutlineAnchors`가 live Memo 부재로 `MEMO_ANCHOR_INTEGRITY`를 발생시켜 해당 Outline 작업 전체 rollback. SOURCE_ONLY reset의 `RESET_ANCHOR_INTEGRITY` 경로도 위험. **수정:** `editMemo`에서 `(operation==='move'||remove)&&anchorAvailable`로 같은 DB 거래의 dependent link delete, `reset-service.ts` ALL의 사전 `cadMemoAnchor.deleteMany` 같은 tx. 리뷰 comment `4428381918` 답변 및 스레드 Resolved 확인. `tests/unit/memo-anchor-origin-reset.test.ts`에 삭제 경로 코드 회귀 가드 추가.
- **보완 코드:** 브라우저 전용 `MemoSessionSnapStore`(Version/SHA 및 Viewer 세션 한정, 서버 DTO/DB 저장 없음), `ThreeDxfViewerAdapter.getMemoSnapTargets`의 현재 2D 생성 Polygon 정점·중심 및 지원 렌더 Endpoint/Vertex/Center, 12 CSS px 최근접·20k 포인트·visible/finite/Scope 필터. `CadViewer`의 좌표 배치·포인터 drag·WCS 이동 완료 시 최신 스냅 검증 후 local 좌표 연결; 객체 Translate/Rotate·Undo/Redo에서 현재 transform으로 재투영, Delete 후 마지막 WCS/BROKEN, 동일 object ID Undo 재연결. SOURCE_ONLY는 RENDER session 참조를 강제 BROKEN; ALL은 모든 임시 참조 삭제. 명시 해제는 작성자-only 서버 PATCH move CAS 또는 M1 로컬 move 성공 뒤 관계 삭제; 단순 변경 미검증 객체 ID를 서버 CadMemoAnchor로 전달하지 않음.
- **신규 시험:** `tests/unit/memo-session-snap.test.ts`는 GENERATED/RENDER transform 90°·삭제/Undo/S6·스코프/visibility/20k 상한 및 server DTO 비변경을 테스트. `tests/e2e/issue82-cad-memo.spec.ts` M3 별도 케이스는 합성 DXF WCS(0,0) auto snap→UI 세션 표시→명시 해제/좌표 보존을 검증. App/Server/Unit/TestPlan/Report/Architecture/ADR 설계 갱신. 로컬 환경은 GitHub clone DNS 접근 불가였으므로 npm/TS/Lint/Vitest/Playwright/OCI 로컬 실험은 **NOT RUN**.
- **불변 안전 경계:** 임시 UUID와 RENDER 작업 delta는 영속 객체/Source Canonical Ref의 신뢰증거가 될 수 없음. Server G7/Site/Owner/Revision·감사 계약은 유지하며 화면에서 임시로 움직인 좌표는 명시 서버 저장 전 재접속/타 PC에 보존되지 않는다. 현장 CAD/GPU·2PC/실 DB·기존 볼륨 Migration/GHCR/병합/Issue 종료 미실행. **최종 HEAD의 리뷰·충돌·PR CI 기동은 GitHub 실제 조회 후 별도 기록**, CI 시작 ≠ SUCCESS. 중간 취소 run이나 이 기록 자체를 새 HEAD PASS로 전용하지 않는다.

---

## #84/#167 PR #173 — 초기 리뷰/충돌·CI 실행 증거 (2026-10-31)

- **PR:** [#173](https://github.com/planner77/layoutManager/pull/173), `#167 | Origin-aware Scene reset and persistent Memo anchors (#84)` / 한 PR / 순서 #84→#167. 검증 전 HEAD `81c6077248b41f0e1d79a1332bdd58891ef9ddbd`.
- **실제 GitHub 상태:** `get_pr_info` 재조회에서 `mergeable=true`; 최신 Main `34e3a362e9a9d01579d4a61b81b26f4ee935c87b` 대비 `behind=0,ahead=22`, 충돌 없음. PR 초기 응답의 `mergeable=false`는 GitHub가 계산한 최종 결과가 아니었으며, 재조회 후 true로 확인. Inline review threads 총 0, 미해결 0 (조회 시점; 이후 생기는 자동 Codex 지적은 별도 검토 필요).
- **PR CI 최초 실행 시작 근거:** [Run #41123679311](https://github.com/planner77/layoutManager/actions/runs/41123679311) workflow `#317`, 초기 HEAD `81c6077248b41f0e1d79a1332bdd58891ef9ddbd`, 조회 시 `in_progress`/conclusion null. 이 원장 기록 후 브랜치 HEAD를 갱신할 경우 이전 Run을 새 HEAD 검증 근거로 사용하지 말고 **최신 HEAD에서 자동 시작한 새 PR CI run만** 인계해야 한다. 사용자 지시로 CI 결과 모니터링 생략, PASS 주장 금지.
- 신규 코드/합성 Unit을 작성했으나 GitHub CI 결과·실 운영 현장·승인된 DB/Compose/GHCR 작업은 **NOT VERIFIED/NOT RUN**. Reviewer P1/P2 새 지적이 추후 나타나면 코드/회귀/원장 보완 전 Resolved나 Gate PASS를 선언하지 않는다. Issue #84/#167은 OPEN, GHCR/병합/이슈 종료 미실행.

---

## #84/#167 단일 PR — CI 실행 전 원장 및 위험 등록 (2026-10-31)

- Main 근거 `34e3a362e9a9d01579d4a61b81b26f4ee935c87b`; 사용자 요청 #84→#167 분석·설계·구현·PR CI만. [설계](Issues84-167.md), AGENTS, Architecture/Decisions/Database 검토. 루트 DESIGN.md 실제 없음.
- **사전 위험, 실제 CI 실패 아님:** v0.47.1 CadMemo 직렬 컬럼 추가 시 구 DB Prisma P2022와 runtime Gate 충돌 위험 → 별도 CadMemoAnchor 테이블과 새로운 exact Greenfield baseline으로 격리. 기존 business/Scene/old marker 보존, 구 DB 자동 업그레이드/삭제 없음. SQLITE CHECK의 NULL 참을 명시 NOT NULL targetOrigin으로 차단; immutable trigger·FK·bounds 검증. 일반 Vitest에서 server-only 저장소 value import 금지(이전 #314 재발방지).
- M3: Owner/Site/Revision 검증, Source는 서버에서 이미 canonical attested된 saved sourceRefs만, APP_CREATED는 서버 UUID. Outline transform/delete와 Memo World WCS/BROKEN_AUDIT를 원자적 거래. #172 공동 편집 정책 미확정은 확대하지 않음.
- S6: 원본 Scene Asset/Current/DXF 불변, Source-only SessionWork 원상복구 + SOURCE linked Memo 해제, All은 server exact full-set revision + Session/Site/Owner 권한 + Soft Delete/Audit 단일 거래. SQLite/Browser 분산 atomic claim 금지.
- **실행 상태:** 소스 코드와 합성 테스트 작성, npm/Prisma/TS/Lint/Unit/E2E/Docker/현장 수용은 로컬에서 **NOT RUN**. 기존 #311/#314 실패/CI #316 성공은 이 신규 HEAD를 검증하지 않는다. PR 생성 후 최신 리뷰/충돌·새 CI 실행 결과를 실제 근거로 기록. CI 감시 생략; 병합·GHCR·운영·이슈 종료 미실행.
- Known limits: auto snap nearest vertex, 임시 Generated 편집의 완전한 영속 Anchor 동기화, SOURCE renderer 세션 이동의 저장, 기존 설치 스키마 채택 및 실 DXF Owner 수용은 이 PR에서 입증하지 않는다. #96/#113/#172 별도 OPEN.

---

## #98/#83 PR #171 — Owner Managed 최종 Squash·Main CI/GHCR 게시 완료·Issue 분할 종료 (2026-10-30 KST)

- **정확 최신 PR CI:** [#316](https://github.com/planner77/layoutManager/actions/runs/41062911805), HEAD `d74d1f312386b020175035d5aa1aaf3066bc144e` `completed/success`. Verify Job `124086863559` SUCCESS(Typecheck/Lint/Unit·Integration/Production Build/Playwright·G7·Legacy E2E) 및 Docker Job `124086863008` SUCCESS(Migrator/DB/Greenfield Compose/Admin/CAD restart). 기존 실패 PR #311 `b7e499d` 및 #314 `839fcf8`와 변경 전 성공 #315 `8af8b65`는 아래 원장에 역사 그대로 보존.
- **최종 리뷰/충돌:** [PR #171](https://github.com/planner77/layoutManager/pull/171) Codex P1 1건/P2 2건 실제 코멘트 회신 후 3/3 Resolved, 미해결 0; 병합 직전 Main `db2f47f8f4a85c12d6651a8b000a5755ea507926` 대비 behind0, `mergeable=true`. 최신 Codex 추가 독립 리뷰 승인은 없으며 Owner Managed 코드/합성 QA 수용 경로로 진행.
- **Owner 승인 Squash:** 본 대화의 사용자 명시 지시로 PR #171을 정확한 검증 HEAD에서 `#98 | CadOutline and CadMemo G7 persistence (#83)` **Squash Merge**; [Main 커밋 e1984e26](https://github.com/planner77/layoutManager/commit/e1984e26a8649f0ac2bce3b0cb74ce69b163441e), PR `closed/merged` 확인. App 및 lockfile `0.47.1` 동기화, 과거 `v0.47.0` tag와 OCI digest 불변.
- **GHCR 릴리스 실제 성공:** [Main CI #93 / Run #41064962451](https://github.com/planner77/layoutManager/actions/runs/41064962451) `completed/success`, 정확 Main HEAD `e1984e26a8649f0ac2bce3b0cb74ce69b163441e`. release-scope Job `124093785009` SUCCESS, Build and push Job `124093830002` SUCCESS. GitHub annotated tag `v0.47.1`이 정확 merge 커밋에서 생성. 두 candidate build, 매니페스트 digest 확인, 정식 App/Migrator 및 latest alias 승격, 게시 후 측정 단계 모두 SUCCESS.
- **정식 쌍 식별:** App `ghcr.io/planner77/layoutmanager:0.47.1` 또는 `:latest` → `sha256:85c00935aa11d397150344a54acf0d1123c6c3cd1f6beef74b426a837e0c15d4`; Migrator `ghcr.io/planner77/layoutmanager:0.47.1-migrate` 또는 `:latest-migrate` → `sha256:82861f95380d9837ad83a8dc13d49f33b09df767145e35d2f5591b67c38944ae`. 둘 다 릴리스 Job `Promote paired release images after both candidates succeed` 및 `Measure published ...` 성공. 단 두 registry tag 갱신 자체는 분산 트랜잭션이 아니며 production 사용 시 version-pinned pair 권장. main publish 단계 성공 = 사용자 현장 Docker 배포/실 수용 완료 아님.
- **Issue 종료/범위 이전:** #98와 #83 각 `closed/completed` 확인. 이는 **신규 Greenfield 영속 코어 기능+합성 CI 범위** 종료이며 기존 AC 중 미구현을 완료 체크한 게 아님. #172 Memo Editor A/B 공동편집 정책 및 신규설치 PC2대·실 시험 OPEN, #65→#71→#73 Global OutlineType/FK/Tree OPEN, #84 GENERATED Memo Snap/BROKEN_ANCHOR OPEN, #96/#109 Auth/신규설치 Owner 수용 및 #113 현장 CAD/GPU 별도. 원래 Existing Volume 자동 이전은 Owner 폐기 정책이므로 임의 실행 금지.
- **운영 부작용 없음:** 실 현장 SQLite·CAD·S3/Writer·Docker Compose·Auth 활성화/마이그레이션/복원/물리 삭제는 수행하지 않았다. 이 원장 최종 증거는 이미 게시된 `v0.47.1` 릴리스 커밋을 변경하지 않도록 **문서 전용 후속 Main 커밋**으로 기록한다. 이 후속 Main push의 release-scope는 docs-only → GHCR SKIPPED 경로가 되어야 하며 실제 후속 CI 결과는 별도 확인 전 PASS 주장 금지.

---

## #98/#83 PR #171 — 최신 성공 CI·GHCR 릴리스 버전 충돌 예방 (2026-10-30 KST)

- **검증 완료:** [PR CI #315 / Run 41059992557](https://github.com/planner77/layoutManager/actions/runs/41059992557) 최종 HEAD `8af8b65d016865498a67f6ee4cf70184a0ad22c4`, `completed/success`. Verify Job 124077023981(Prisma/Typecheck/Lint/Unit+Integration/Next Production Build/Chromium E2E/G7 Runtime·Greenfield·Legacy E2E)와 Docker Job 124077024801(기본/standalone/App+Migrator/Migration/Compose Greenfield Admin CAD restart smoke) 각각 SUCCESS. 이전 #311/#314 실패 기록은 아래 역사 보존. 실제 현장 DXF/보존 데이터/다중 에디터/실 운영 전환 검증 증거는 아님.
- **리뷰·충돌 검사:** [PR #171](https://github.com/planner77/layoutManager/pull/171) Codex P1 1건/P2 2건 답변 후 3/3 Resolved, 미해결 0, main `db2f47f8f4a85c12d6651a8b000a5755ea507926` 대비 behind=0, GitHub `mergeable=true`. Owner Managed 진행 요청은 과거 실험 결과를 실제 현장 PASS로 승격하지 않는 범위.
- **GHCR 릴리스 게이트:** [이전 Main CI 41050349517](https://github.com/planner77/layoutManager/actions/runs/41050349517) 완료 SUCCESS, App `ghcr.io/planner77/layoutmanager:0.47.0` sha256:b43dcb20c50f8de378595d5add0263bb062df350a3b75d0a28c87c1216df8be4 및 Migrator `:0.47.0-migrate` sha256:075f32ed56ea4e52d1966ba2e716c0e26d97039d23f41f1bfc282be25130e6c2 **게시 완료 확인**; Git tag `v0.47.0` 존재. 현행 `.github/workflows/docker-publish.yml` main 의 `release_tag.created=false` + version image pair 존재 시 재빌드/정식 태그 갱신을 생략하므로 이번 변경을 버전 `0.47.0`에 병합할 경우 GHCR 게시되지 않음.
- **보완책:** 기존 `v0.47.0` 절대 재이동하지 않음. `src/package.json` + lock 일치 `0.47.1`로 승격(`v0.47.1` 태그 사전 조회 NOT_FOUND); 업무 DDL/App·Migrator는 같은 검증 코드 브랜치로 구성. 새 버전 변경 후 **다시 PR CI 검증 필수**: 기존 Run #315 성공을 `0.47.1` 새 커밋에 소급 금지. 통과한 최신 HEAD에서만 Squash Merge 후 Main release-scope/build-and-push 두 단계 통해 candidate digest 검증 후 `:0.47.1[-migrate]`와 `:latest[-migrate]` 승격한다. Main CI 시작을 GHCR 게시 성공이라 기록하지 않음.
- **미충족 AC 별도 처리:** #98 Global Type(#65), #83 작성자 외 Editor 수정 정책/현장 타 PC 동시성, #84 GENERATED-linked BROKEN_ANCHOR, 기존 DB 자동 이관(Owner 폐기), 실제 물리 Backup/Restore와 현장 수용은 여기서 완료 주장 금지. Owner의 이슈 종료 지시를 이행할 때 별도 후속 이슈/기존 #65/#84로 책임 이관 후 명시적으로 부분 수용 범위를 기록하며 runtime Auth·Writer 활성화/현장 데이터 접근은 하지 않음.

---

## #98/#83 PR #171 — PR CI #314 신규 Unit Suite server-only import 실패 (2026-10-30 KST)

- **실패 확인:** [Run #41058299070](https://github.com/planner77/layoutManager/actions/runs/41058299070), workflow **#314**, attempt 1, 정확 HEAD `839fcf87fe1154aa2a4d542b2e78d9ff1be19acd`, `completed/failure`. Docker Image Size/Migration/Runtime Smoke Job [124072053492](https://github.com/planner77/layoutManager/actions/runs/41058299070/job/124072053492) **SUCCESS**. Verify Job [124072054040](https://github.com/planner77/layoutManager/actions/runs/41058299070/job/124072054040) **FAILURE**, 실패 단계는 **Unit 및 Integration 테스트**. Typecheck, ESLint 앞선 두 단계는 SUCCESS. Unit 전체 **95개 파일 중 94 PASS / 1 FAIL**, 실행된 **646 tests PASS**, 문제 suite는 평가 전 import 실패로 테스트 케이스 실행 0. Production Build/E2E는 실행되지 않았으므로 PASS 주장 금지.
- **정확한 스택/원인:** `tests/unit/cad-business-contract.test.ts`가 `BusinessRepository`를 `../../server/cad-business/service`에서 직접 **value import**. 이 경로가 인증·서버 DB 모듈의 `server-only`를 전이 import해 일반 Vitest worker의 `node_modules/server-only/index.js:1:7`에서 **`Error: This module cannot be imported from a Client Component module. It should only be used from a Server Component.`** 발생. 이는 운영 서버가 클라이언트로 누출된다는 관측이 아니며, 신규 테스트의 **환경 경계 위반**. G7 `server-only` 보호/런타임 권한 정책을 우회하여 해결하지 않는다.
- **수정:** `src/server/cad-business/validation.ts`에 server-independent pure `memoEditOperation(raw,remove)` 추가. `remove=false`는 `text|move`만 수용하고 `delete` 등은 `BUSINESS_OPERATION_INVALID 400`; `remove=true`인 DELETE에서만 `delete` 반환. `service.ts`는 직접 분기 대신 이 함수 사용하므로 HTTP method 기반 삭제/감사 응답 의미 유지. 단위 테스트는 `BusinessRepository`, `Database`, `G7CadWrite` server-only import 제거, 순수 검증 함수의 허용/거부/DELETE 테스트와 서비스의 DELETE 감사 분기 정적 연결 증거로 변경; 기존 Schema DDL, WCS·Memo Session, source transform tests 유지.
- **재발 방지:** Vitest의 일반 worker에서 서버 전용 Repository를 직접 로드하지 말고 불변 입력 정책은 순수 모듈로 분리해 검증. 통합 실제 DB/Auth는 별도 승인된 실행 환경에서 수행하고, 테스트 통과를 실 운영/현장 수용으로 간주하지 않음. `server-only` 패키지 mock/빌드 조건 해제 금지. 이전 CI #311의 TypeScript 33 오류는 새 #314의 Typecheck SUCCESS와 구분해 역사 보존.
- **리뷰/충돌 당시 증거:** PR #171 리뷰 P1 1건/P2 2건 3/3 Resolved, 현재 미해결 0; Main `db2f47f8f4a85c12d6651a8b000a5755ea507926` 대비 behind=0, mergeable=true, 충돌 없음. 보완 이후 최신 PR CI 결과는 실행 전에 **NOT VERIFIED**. 요청 범위는 새 PR CI 시작까지로, 모니터링·병합·Main CI·GHCR·Issue 종료 미실행.

---

## #98/#83 PR #171 — PR CI #311 실패 원인·보완·리뷰/충돌 원장 (2026-10-30 KST)

- **실제 실패 증거:** [Run #41056355838](https://github.com/planner77/layoutManager/actions/runs/41056355838) attempt=1, workflow run number **311**, HEAD `b7e499dbd8726d4ad002a9679ab297423d5c2374`, `completed/failure`. Verify Job [124064761375](https://github.com/planner77/layoutManager/actions/runs/41056355838/job/124064761375) `failure`, Docker image size/migration/runtime smoke Job [124064760825](https://github.com/planner77/layoutManager/actions/runs/41056355838/job/124064760825) `failure`. 이 Run이 새 HEAD를 검증했다는 주장은 금지.
- **Verify 직접 원인:** `npm run db:generate` SUCCESS 뒤 TypeScript 검사 `tsc --noEmit`에 **33개의 strict TS 오류** (TS18048, TS18047, TS18046, TS2719, TS2322, TS7006, TS2339). 신규 `validation.ts`의 arrow `never` 처리 분기 후 타입 축소 미인식, `service.ts`의 nullable Version/Memo/Proof와 `kind` 값 반환, 개별 GET의 `data.memos/outlines` union 타입 미좁힘이 직접 원인. ESLint/Unit/Next Build/Playwright/Greenfield Browser는 **SKIPPED**로 별도 기록하며 PASS 아님.
- **Docker Job 직접 실패:** `Build pre-change baseline (same source, original Dockerfile)`가 Next Production Build의 동일 `app/api/.../memos/[memoId]/route.ts:37` **TS18048**에서 중단. 따라서 Docker/migrator smoke는 이후 단계 **SKIPPED**이며, 이번 Docker 실패를 독립 이미지 크기/일시적 레지스트리 오류라고 단정하지 않는다.
- **Codex P1 (runtime closure):** [#4423677090](https://github.com/planner77/layoutManager/pull/171#discussion_r4423677090) Migrator의 explicit `COPY` 목록에서 신규 `server/cad-business/schema-ddl.ts` 빠져 `g7-greenfield.ts auto` 모듈 import 실패 가능. `src/Dockerfile`에 COPY + 런타임 `CAD_BUSINESS_DDL.length === 11` 로딩 검사, `cad-business-contract.test.ts` static regression 추가. Run #311은 Docker build가 앞서 실패했으므로 이 모듈 오류를 **실제로 관측한 것 아님**.
- **Codex P2 (Memo DELETE):** [#4423677104](https://github.com/planner77/layoutManager/pull/171#discussion_r4423677104) PATCH `operation:delete`를 허용하면서 soft-delete를 실행하나 Audit EDIT/일반 DTO를 반환하던 동작 발견. PATCH는 `text|move`만 허용, DELETE method만 `remove=true` 분기로 실제 삭제·DELETE Audit·삭제 응답을 함께 수행. 음성 테스트 추가.
- **Codex P2 (Source transform):** [#4423677117](https://github.com/planner77/layoutManager/pull/171#discussion_r4423677117) 기존 임시 GENERATED translate/rotate 후 v1/v2 내보내기에는 원본 base 및 실제 `transformOperations`가 없어 #97 canonical 재검증이 `OUTLINE_GEOMETRY_MISMATCH`로 거절됨. GeneratedDocument에서 allowed operation history를 객체별로 불변 보존하고 Undo/Redo로 함께 복원, Adapter→`buildServerSourceOutlineExport`에서 base + 실제 ops를 전달. 원본 SHA/Handle/canonical, 임의 raw affine 거절 유지. `source-outline-persistence.test.ts`에 translate→rotate→serialize→D2 검증/undo-redo/위조 차단 추가.
- **보완된 코드:** 신규 서비스 `bad/invalid`를 함수 선언 `never`로 변경해 정적 타입 축소를 명시하고 `BusinessRepository.list`에 discriminated overload를 추가함. 직접 수정 대상: `src/server/cad-business/{validation,service}.ts`, `src/app/api/.../[memoId],[outlineId]/route.ts`는 기존 코드에 overload 적용, `src/Dockerfile`, `src/domain/{generated-document,outline-draft}.ts`, `src/viewers/{core,three-dxf-viewer}/adapter.ts`, `src/features/cad-viewer/viewer.tsx`, 신규 Unit 테스트 2건.
- **리뷰 완료:** P1 1건/P2 2건 각각 코드·검증 근거 회신 후 **3/3 Resolved**, 미해결 0([PR #171](https://github.com/planner77/layoutManager/pull/171)); 보완 코드 HEAD `275fd74b6a893b181d34cff0dd3dce5cb18e7d75`. 병합 게이트: 검사 당시 Main `db2f47f8f4a85c12d6651a8b000a5755ea507926` 대비 `behind=0`, PR `mergeable=true`, 충돌 없음.
- **검증 한계:** CI #311 실패 결과는 보존하며 새 보완 HEAD의 Unit/Typecheck/Docker/Next/E2E는 최종 CI 전 **NOT VERIFIED**. 외부 실제 현장 CAD·GPU·S3·운영 DB/Volume/Compose·Greenfield 기존 데이터 이관/물리 삭제, GHCR 게시·병합·Issue 종료 **NOT RUN**. 사용자가 요청한 것은 새 PR CI 시작까지만이며 모니터링은 생략한다.

---

## #98/#83 신규 PR 후보 — 구현 시점 실패·리뷰/충돌 원장 (2026-10-30)

- 신규 후보 CI/유닛/도커 실험 오류 관측: **없음** — 현재 증거 상태는 실행 전 **NOT RUN**이지 PASS가 아님. 역사적 실패는 아래 그대로 보존.
- 위험 예방: 기존 G7/Scene baseline DB를 업무 테이블로 무단 변경하지 않고 신규 exact business baseline으로 분리. 업무 CRUD는 schema/ACTIVE Auth/Site/FK/CSRF/CAS 미충족 시 거절; 삭제는 논리적으로 수행; 감사 실패와 메모 타 작성자 수정은 전체 거절.
- 리뷰 스레드: 이 브랜치로 신규 PR 생성 예정으로 생성 전 자체 스레드 없음. 생성 후 미해결 threads, base 충돌을 별도 확인. #65/#84/Old volume 이전/retention/Memo Owner 정책은 잔여 게이트로 보존.
- 정적 테스트 소스 작성. Typecheck/Lint/Unit/Integration/Next Build/E2E/OCI/현장/운영 migration/GHCR는 **NOT RUN/NOT VERIFIED**. 실제 CI 시작·결과·리뷰 조치는 후속 기록. 코드 작성만으로 Issue AC 완료 처리 안 함.

---

## #166 PR #170 — 최종 CI 성공·Owner Managed Squash·Main GHCR 게시 시작·Issue 완료 (2026-10-30 KST)

- **최종 검증 HEAD:** [PR #170](https://github.com/planner77/layoutManager/pull/170) `e9af3d192cb513d4182037f0431d5db5f14a4181`, [PR CI #41047867574](https://github.com/planner77/layoutManager/actions/runs/41047867574) `completed/success`, Verify `124036411468`와 Docker image/migration/runtime smoke `124036411148` 두 Job 모두 SUCCESS. 구 HEAD `1b78b89`의 Run #41047100655는 취소 이력이며 최종 PASS로 전용하지 않는다.
- **리뷰/충돌:** Codex P2 4건 [레이어 표시](https://github.com/planner77/layoutManager/pull/170#discussion_r4422422029), [계산 Worker](https://github.com/planner77/layoutManager/pull/170#discussion_r4422422039), [정밀 기준 재활성화](https://github.com/planner77/layoutManager/pull/170#discussion_r4422634421), [대용량 Scene layer O(N²)](https://github.com/planner77/layoutManager/pull/170#discussion_r4423072162)를 모두 코드·회귀로 보완해 리뷰 답변 후 **4/4 Resolved**, 미해결 0. 병합 직전 `mergeable=true`, Main `bdde56504283f6c9695722829c839a93ac58876b` 대비 `behind=0/ahead=5`, 충돌 없음. 현장/실 CAD·GPU 성능 수용은 CI 성공으로 소급하지 않음.
- **Owner Managed Squash:** 사용자 명시 승인 및 [병합 근거 기록](https://github.com/planner77/layoutManager/pull/170#issuecomment-6521846819)을 기반으로 정확 검증 HEAD를 추가 수정 없이 `#166 | Three.js object work and independent source gates` 제목으로 Squash Merge. [Main `83ce0417224813574ef45a859460d95c4345cf68`](https://github.com/planner77/layoutManager/commit/83ce0417224813574ef45a859460d95c4345cf68) 생성, [PR #170](https://github.com/planner77/layoutManager/pull/170) MERGED.
- **GHCR/Main CI 인계:** 런타임 변경 `src/package.json` **0.47.0**, v0.47.0 tag는 사전 조회 당시 없음. Merge push로 [Main CI #41050349517](https://github.com/planner77/layoutManager/actions/runs/41050349517) **시작 확인**, release-scope Job `124044552980` **SUCCESS**(실제 publish 경로), Build and push to GHCR Job `124044605339` 확인 당시 **IN_PROGRESS**. 현행 workflow는 App/Migrator 후보 이미지를 빌드·두 digest 검증 뒤 `ghcr.io/planner77/layoutmanager:0.47.0`, `:0.47.0-migrate`, `:latest`, `:latest-migrate` 승격을 진행. **최종 Main CI/GHCR 게시 성공·이미지 Digest·태그 존재는 관측/검증 전 NOT VERIFIED**, 워크플로 시작을 게시 완료로 기록하지 않음.
- **이슈 완료:** [#166](https://github.com/planner77/layoutManager/issues/166) AC-S5-01~06은 **해당 S5 합성 구현/CI 수용 범위**로 6/6 체크, `CLOSED/completed` 확인. Parent [#160](https://github.com/planner77/layoutManager/issues/160) 및 S6 [#167](https://github.com/planner77/layoutManager/issues/167), #98/#83/#84/#65/#71/#73 등 영속 업무 기능과 현장 수용 #113은 별도 미완료. 실제 운영 DB/CAD/Volume/Compose 변경·Auth/Writer 활성화·현장 자료 반출 없음.
- **증거 기록만의 별도 Main commit:** 본 기록과 TestReport의 최종 인계 보충은 Squash 뒤 **문서 전용 Main 커밋**으로 실행하여 이미 통과한 기능 PR SHA 및 정식 릴리스 빌드 커밋을 변경하지 않는다. 해당 문서 push는 별도 Main CI를 시작하나 runtime diff가 없어 release-scope 설계상 GHCR Build/push는 SKIPPED. 실제 두 Main CI 완료 상태는 각 Run별로 별도 판정한다. 과거 실패·리뷰 원장은 아래 그대로 보존한다.

---

## #166 PR #170 — 후속 Codex P2 초기 Scene 인덱스 성능 수정 (2026-10-30 KST)

- **새 리뷰:** [PR P2 #4423072162](https://github.com/planner77/layoutManager/pull/170#discussion_r4423072162) — `initializeRenderWork()`에서 Projection의 적합 ID Set만 선형으로 만들고 실제 layer 검색은 `renderIndex.entities.find()`로 Scene leaf마다 수행. 선택 가능 객체 N개에서 O(N²), 3만 객체급 READY/DXF 복원 시 UI 스레드 장시간 블로킹 가능. 이는 이전 P2 #4422634421 Source-basis 복구와 별개이며, CI 성공/실패로 혼동하지 않는다.
- **보완:** `new Map(renderIndex.entities.map(({id,layer})=>[id,layer]))`를 1회 만들고 Scene traverse 안에서는 `layerById.get(ref.id)`로 조회. 적합 ID / Origin/Scope 검증은 `validSceneRef`와 `layer!==undefined` 경계를 유지. Renderer 전체 방문 O(N)+projection 비용이며 DB·원본 SHA/Handle/canonical/권한 변경 없음.
- **검증 기준:** 기존 HEAD `1b78b891fe57bcd48770d3590d0ee8e8df68185e` 신규 [PR CI #41047100655](https://github.com/planner77/layoutManager/actions/runs/41047100655)는 본 최적화 커밋 **이전** 실행이며 마지막 확인 시 `in_progress`. 새 HEAD에서 CI 재요청 후 최종 확인 전 PASS 주장 금지. 새 코드에 대한 실 DXF·30k 현장 성능/브라우저 벤치마크는 NOT RUN. 현재 독립 단위·복원 Browser 회귀는 새 CI에서 검증 예정, 미완료면 NOT VERIFIED.
- **게이트:** 해당 리뷰 스레드에 코드 근거 답변 후 Resolved, 최신 모든 Thread=0·Main behind=0/mergeable·신규 최종 HEAD PR CI SUCCESS 확인 전 병합·GHCR·이슈 완료 불가. 역사적 실패와 리뷰는 원장에서 삭제하지 않는다.

---

## #166 PR #170 — CI 성공 후 신규 Codex P2 발견·보완, 최신 검증 대기 (2026-10-30 KST)

- **정확한 성공 대상:** [PR CI #41040094443](https://github.com/planner77/layoutManager/actions/runs/41040094443)는 HEAD `04e44d390e21fc7bcea4b96f5c538ad74ad15f9a`의 `completed/success`; Verify Job `124010487329`와 Docker Job `124010487646` 두 건 SUCCESS. 이 결과는 후속 수정 커밋의 검증으로 **전용하지 않는다**.
- **후행 최신 Codex P2:** [PR review #4422634421](https://github.com/planner77/layoutManager/pull/170#discussion_r4422634421), `src/features/cad-viewer/viewer.tsx`: 원본 정밀 basis를 선택한 뒤 일반 렌더 선택/Translate·Rotate·숨김을 하면 `sourceWorkChanged()`로 정확 SOURCE가 차단되지만 React `outlineBasis='source'`가 남는다. OFF→ON 시 이전 basis로 `setSelectionMode('select')`가 예외를 던지고, 이미 `outlineEnabledRef=true`인데 panel reducer dispatch 전 중단돼 토글과 도구 내부 상태가 불일치한다. 기존 Codex P2 두 건은 해결·Resolved, 새 세 번째 P2는 수정 전 미해결.
- **보완:** 사용자 표시 상태가 아니라 adapter의 실시간 `getOutlineInfo().entityCount/sourceUnavailableReason`으로 SOURCE 가용성을 재검증하고, 무효이면 `render`로 자동 전환 + 알림한다. Adapter 모드 전환 성공 후에만 `outlineEnabledRef=true` 설정·상태 dispatch하며, 예외 시 ref를 바꾸지 않는다. 원본 exact fail-closed 및 기준 Scene·DXF bytes 불변.
- **추가 회귀:** `outline-tool-policy.test.ts`의 live basis 검증, `issue31-outlines.spec.ts`의 실제 DXF source→일반 객체 선택→SceneWork Translate→외곽선 OFF 상태에서 재열기/render fallback/UI checked 회귀. 합성 자료 사용, 실제 CAD·운영 저장소 접근 없음.
- **새 게이트:** 본 신규 코드/시험은 GitHub source patch이며 독립 로컬 실행 **NOT RUN**. 새로운 HEAD의 PR CI/최신 리뷰/충돌 재검증 전 병합·Main CI·GHCR·#166 종료는 PENDING. 실패 원장 내 이전 95 PASS/2 FAIL 및 후속 P2와 CI 결과를 이력 그대로 보존한다.

---

## #166 PR #170 — PR CI 성공 후 Codex P2 보완·신규 검증 대기 (2026-10-30 KST)

- **검증된 이전 HEAD:** `33e560393527312e0388560bd0d13e62b5124e31`의 [PR CI #41036925858](https://github.com/planner77/layoutManager/actions/runs/41036925858)은 `completed/success`, Verify Job `124000125159`·Docker Job `124000125416` 모두 SUCCESS. Main `bdde565` 대비 behind=0/ahead=2, PR mergeable=true. 성공은 아래 리뷰 보완 **이전** HEAD에만 유효하다.
- **미해결 Codex P2 2건:** [레이어 표시 결함](https://github.com/planner77/layoutManager/pull/170#discussion_r4422422029)은 `sceneObjects`(선택 가능한 평면 geometry)만 visibility 갱신하여 Points·비평면·다중 material 등 display-only Scene node가 Layer off/hide all을 무시하는 실제 회귀이다. [UI 스레드 계산](https://github.com/planner77/layoutManager/pull/170#discussion_r4422422039)은 `computeRenderOutline`를 브라우저 main thread에서 동기 계산하여 최대 100k geometry/다수 미연결 segment에서 입력·취소가 멈출 수 있는 실제 성능 결함이다.
- **보완 내용:** imported Scene 전체에 대한 최초 intrinsic visibility 스냅샷을 유지하고 모든 node에 `baseline AND layer AND scene-work` 가시성을 적용한다(부모 가시성 자연 전파, 세션 Undo/Redo 유지). 렌더 외곽선 작업도 원래 `outline-worker`의 `compute-render` task로 보내며 기존 terminate/cancel/30초 timeout을 그대로 적용한다. SOURCE 정밀 모드와 strict provenance/canonical 정책은 불변.
- **추가 회귀:** Unit의 display-only Points/선택 Mesh/숨겨진 부모·레이어 복원, 복원 Mesh Adapter Browser의 실제 worker 요청 및 display-only Layer off/on 검사. Synthetic scene/기존 기능 계약을 사용하며 실 CAD·운영 데이터 노출 없음.
- **검증 및 게이트:** 본 패치 커밋 작성 시 별도 로컬 Typecheck/Build/Browser 실행은 **NOT RUN**. 새 HEAD PR CI의 완료 결과·Codex 최신 재리뷰는 **NOT VERIFIED**이며, 이전 성공 #41036925858을 새 HEAD 성공으로 대체하지 않는다. 새 push의 `pull_request.synchronize`로 PR CI를 시작하되 모니터링 생략. 리뷰 답변/해결 및 Main 충돌 재확인 필요. 새 HEAD 성공 전 Squash Merge·Main CI·GHCR 게시·#166 종료 불가. 사내 운영 저장소·Compose·원본 데이터·배포 변경 없음.

---

## #166 PR #170 — 로컬 수용·리뷰/충돌 확인 후 최종 PR CI 인계 (2026-10-30 KST)

- **구현 게시:** [PR #170](https://github.com/planner77/layoutManager/pull/170), branch `feat/issue-166-scene-work`, 최초 구현 Commit `89cb95e1be4e3b665e31ce7c5ad0c5f229d35288` (`feat(viewer): enable scene object work independently of source mapping`), 앱 **0.47.0 후보**. `.env` 지정 remote와 동일한 저장소의 GitHub 연결 도구로 Tree/Commit/Branch를 게시했다. 로컬 staged tree와 원격 Tree의 SHA가 정확히 일치함을 확인한 뒤 로컬 branch를 같은 Commit으로 fast-forward 했다. CLI 401을 CLI Push 성공으로 기록하지 않는다.
- **리뷰/충돌:** 실제 PR 조회 `mergeable=true`, Main `bdde56504283f6c9695722829c839a93ac58876b`, 비교 `behind=0/ahead=1`, unmerged path 없음. review threads 조회 **미해결 0건**(새 PR에는 thread 자체 0건). 해결할 기존 원격 thread/충돌이 없었다. 지정 Manager/Developer/독립 QA의 로컬 검토와 GitHub 자동 리뷰 성공은 구분하며, 아직 없는 자동 리뷰 결과를 PASS로 표시하지 않는다.
- **로컬 게이트:** 아래 누적 실패/정책 재시험 및 TestReport의 실제 실행을 유지한다. 최종 Build·Typecheck·Lint(기존 6 warnings) PASS와 최종 Build S5 Browser **3/3 PASS, 21.9초**, 전체 Unit **639 PASS** + 추가 **3 PASS** 별도. 일반 Browser **95 PASS/2 과거 정책 기대 FAIL → 해당 파일 4/4 재시험 PASS**이며 과거 실패를 삭제하지 않는다. Manager **ACCEPT LOCAL SCOPED**.
- **CI 시작 범위:** PR 생성의 `opened`와 이 원장/보고서 후속 커밋의 `synchronize`가 기존 PR CI를 요청한다. **최종 HEAD 실행 시작 여부/Run URL은 원격 게시 후 PR 본문 인계와 최종 응답에서 확인**, 완료 모니터링은 요청대로 생략하며 CI 최종 결과는 **NOT VERIFIED**다. 이 기록의 커밋으로 전체 suite를 다시 로컬 실행하지 않는다(문서만 변경).
- **유지:** #166/#160 및 영속 의존 이슈는 OPEN, 병합·태그·GHCR·운영 DB/Storage/볼륨·배포·실 CAD/2PC/DRM 전용 분석 미실행. 다음 구현은 별도 요청/승인 범위의 #167이며 이번 요청의 종료점은 PR CI 시작이다.

---

## #166 S5 — 초기 로컬 실행·원격 접근 이력 (2026-10-30 KST)

- **기존 작업 보존:** 원래 checkout `main`은 오래된 `7076efe`이며 `src/docker-compose.yml`, `src/next-env.d.ts` 사용자 변경 2개를 그대로 보존했다. 지정 remote와 `.env` 저장소 주소 정합성을 비밀 출력 없이 확인하고 최신 Main `bdde565`의 새 worktree/branch에서 구현한다.
- **원격 접근:** 기본 gh CLI 및 `.env` token을 프로세스 환경에만 넣은 gh 재시도에서 HTTP 401을 관측했다. 인증 값/헤더/credential URL은 출력하지 않았다. GitHub 연결 도구의 Issue/Main 조회는 성공했으며 기능 분석을 계속했다. 원격 게시 방식·실제 Push/PR/CI 시작은 수행 후 별도 기록한다. API 도구의 초회 매개변수 검증 오류는 키 이름을 교정해 조회했다.
- **초기 Typecheck:** 새 worktree에 `src/generated/prisma`가 없어 타입 검사 실패(Prisma import 누락 및 파생 implicit-any). `npm --prefix src run db:generate` exit 0으로 Client를 생성했다. DB migration/실 운영 DB를 실행한 것이 아니다. 직후 재검사는 Developer가 adapter 메서드를 구현 중인 snapshot에서 `initializeRenderWork` 미정의 등의 오류를 관측했으며 최종 동결 소스 결과로 사용하지 않는다. 최종 Typecheck/회귀는 별도 수행한다.
- **구현 검토 중 보완(실제 장애/CI 실패와 구분):** Manager/Root가 원본·렌더 수 혼용, 변형·숨김 뒤 stale 정밀 index, parent WCS 변환/중첩 drawable·fractional drawRange·다중 material, 선택 refresh 후 ID 소실, source provenance를 derivedFrom 필수로 옮긴 문제를 발견해 Developer에 재작업했다. Root/Manager가 빈 SelectionController 초기 레이어 집합과 실제 converter의 `entity.layer` 대 `cadLayer` 불일치를 발견해 선택 0건 경로를 교정했다. 이는 기존 31개 집중 Unit과 초기 Build PASS가 실제 adapter 구성 전체를 보증하지 못했던 검증 공백이다. 독립 QA는 schema3 row의 unit/SceneIdentity를 envelope와 교차검사하지 않는 공백을 지적해 별도 수정/음성 회귀를 요구했다. 최종 증거는 아래 TestReport 실행 기록과 구분한다.
- **첫 전체 Unit 결과:** `npm --prefix src test` 91 files 중 90 PASS/1 FAIL, 총 639 tests 중 **638 PASS/1 FAIL**(273.72초). `generated-translate.test.ts` TC-E4-UNIT-003이 기존 `/읽기 전용/` 오류 메시지 계약과 새 혼합 선택 안내 문구가 달라 실패했다. Guard를 완화하지 않고 문구를 호환되게 수정했으며 focused 3 files/16 PASS를 확인했다. 최종 전체 재검사는 별도다.
- **첫 브라우저 집중 실행:** 6개 중 **4 PASS/2 FAIL**(50초). 신규 S5 두 경우가 Ctrl Box 이후 렌더 선택이 유지되지 않아 이동 버튼 disabled에서 실패했다. 설치된 Three 0.171 OrbitControls의 Ctrl/Meta/Shift+ROTATE가 `enableRotate=false`와 무관하게 PAN을 시작하는 분기를 확인했다. 선택 모드 `enablePan=false`, Space/탐색에서만 true로 교정했다. 기존 4개 원본/통합 선택 회귀의 PASS와 신규 2개 실패를 구분해 유지한다. 재실행 성공 여부는 후속 기록을 따른다.
- **브라우저 실행 구성 오류:** Root가 일반 집중/Greenfield Playwright를 같은 `src/test-results`로 병렬 실행해 trace 임시파일 정리가 충돌했다. Greenfield는 1 PASS/1 FAIL(24초), Scene 업무 흐름 이후 `consumer.close()`에서 trace ENOENT가 발생했다. 제품 성공으로 덮지 않고 두 실행의 `--output`을 각각 `test-results/s5-focused`, `test-results/s5-greenfield`로 격리해 재검증한다.
- **최종 로컬 재검증:** 전체 Unit/Integration **91 files/639 PASS, 346.64초**. 추가 Controller/Mesh topology **2 files/3 PASS**는 별도이며 기존 639에 소급 합산하지 않는다. S5 집중 Browser **3/3 PASS, 36.8초**로 Ctrl Box/명령 및 실제 Mesh WCS/가시성·immutable bytes를 검증했다. Greenfield **2/2 PASS, 42.3초**로 trace 출력 디렉터리 격리 후 ENOENT도 재발하지 않았다. Runtime **1/1 PASS, 14.1초**, Legacy migration **1/1 PASS, 19.9초**.
- **기존 정책 시험 수정:** 일반 Browser 97개 실행은 **95 PASS/2 FAIL, 8.0분**. 두 실패는 `issue38-app-shell.spec.ts`의 Source Handle 부재 시 일반 도구/목록 비활성 및 객체 도구 비노출 기대였다. #166의 명시 Owner 정책으로 이 기대가 폐기된 것이며, 보안 검사를 제거한 것이 아니다. 일반 렌더/APP 목록은 enabled, exact source는 disabled 및 WCS 메모 유지로 고쳐 **해당 파일 전체 4/4 PASS, 19.8초**를 확인했다. 95/2 원결과는 보존하고 97/97로 표시하지 않는다. 신규 S5 Browser에는 handleless/Worker 실패에서 독립 WCS 메모 작성 확인도 포함했다.
- **최종 동결 재확인:** 최종 Production Build·Typecheck PASS, Lint는 기존 6 warnings/0 errors. 최종 Build의 S5 Browser도 **3/3 PASS, 21.9초**이며 Manager가 로컬 범위를 수용했다. 최종 Main fetch는 `bdde565`, `behind=0`/base 동일이고 로컬 unmerged path가 없다. 원격 리뷰/CI는 PR 게시 후 별도 기록한다.
- **범위/판정:** 코드 작성과 초기 집중 policy test는 S5 전체 수용/PR CI/리뷰 성공이 아니다. 병합·GHCR·현장/운영 데이터·배포는 수행하지 않는다. 기존 모든 실패/성공 원장은 아래 그대로 보존한다.

---

## PR #169 — PR CI 최종 성공·Owner Managed Squash/Main CI·GHCR 게시 시작 인계 (2026-10-30 KST)

- **최신 검증 HEAD:** PR [#169](https://github.com/planner77/layoutManager/pull/169), `a46a3c28c71d8103780cdd028677ba4ea50ad40f`, [PR CI #41011540441](https://github.com/planner77/layoutManager/actions/runs/41011540441) `completed/success` (Verify `123918307809` 및 Docker `123918308216` 두 Job SUCCESS). 이전 Run `41002720029`의 1 FAIL/632 PASS·E2E SKIPPED/독립 Docker SUCCESS 및 G1 Session Trigger 원인은 **하위 원장 그대로 유지**. 수정은 기존 임의 세션 timestamp UPDATE를 삭제하고 G1 발급 당시의 새 독립 테스트 세션으로 대체했으며 계정/Session 트리거·제품 인증/Schema는 완화하지 않았다.
- **리뷰/병합 게이트:** Codex P2 2건 (Session idle refresh / legacy Renderer URL) 모두 패치 근거로 resolved, 최신 미해결 **0**, Main 비교 `behind=0`, `mergeable=true`, 사용자 Owner Managed 개발·릴리스 승인. 직전 HEAD 변경은 없고 해당 검증된 SHA에 대해 `squash` 병합. 커밋 **[`46c249595971ffe41974b948fac5b7e36bfc7ff2`](https://github.com/planner77/layoutManager/commit/46c249595971ffe41974b948fac5b7e36bfc7ff2)**, subject `#164 | Scene Asset persistence and Scene-first Viewer (#165)`.
- **Main/GHCR 핸드오프:** [Main CI #41013298011](https://github.com/planner77/layoutManager/actions/runs/41013298011) `push` 실행 **시작 확인**, 최초 관측 `in_progress`. 변경 범위에 Runtime·Scene API/Prisma schema가 있으므로 `.github/workflows/docker-publish.yml`의 일반 릴리스 경로는 `0.46.0` App/Migrator 후보 빌드 및 두 Digest 확인 후 `0.46.0/-migrate`, `latest/-migrate` 별칭 승격을 **시도하도록 정의**된다. 사용자 요청에 따라 완료 모니터링을 하지 않으므로 **Main CI 최종 성공, GHCR 태그·Digest 및 이미지 게시 성공은 NOT VERIFIED**. GitHub 릴리스 Tag 발생 여부 역시 미확인; Run 시작을 게시 완료로 기록하지 않는다.
- **Owner Managed 이슈 완료 범위:** [#164](https://github.com/planner77/layoutManager/issues/164)는 SceneAsset immutable 저장/CAS/Audit/일반 무결성·연계 계약을, [#165](https://github.com/planner77/layoutManager/issues/165)는 READY Scene-first Viewer 복원·정상 DXF GET/파싱 0회를 각각 **구현·병합 범위로 수용해 CLOSED/completed**. 업무용 APP_CREATED CadOutline CRUD [#98](https://github.com/planner77/layoutManager/issues/98), CadMemo CRUD/복원 [#83](https://github.com/planner77/layoutManager/issues/83), 업무 타입/영속 트리 [#65](https://github.com/planner77/layoutManager/issues/65)/[#71](https://github.com/planner77/layoutManager/issues/71)/[#73](https://github.com/planner77/layoutManager/issues/73), 메모 스냅 [#84](https://github.com/planner77/layoutManager/issues/84), 실 CAD/2PC/실 GPU [#113](https://github.com/planner77/layoutManager/issues/113)는 본 병합의 PASS에 포함하지 않고 OPEN 유지. 상위 [#160](https://github.com/planner77/layoutManager/issues/160)은 S5 #166/S6 #167 및 S7 통합 수용을 위해 OPEN 유지. DRM 전용 H0~H3는 Owner 결정상 선택적 S8 최후순위.
- **배포/원장 기록:** 사내 운영 SQLite/CAD/Scene 저장소·Compose/Nginx/컨테이너 재시작·운영 활성화 또는 실 현장 원본 취급은 수행하지 않았다. 이 기록은 *PR 검증 완료 후 Squash Main을 변경하지 않으려는 별도 Main 문서 전용 커밋*으로만 갱신한다. 기존 PR 성공 HEAD/릴리스 Source SHA를 바꾸지 않고, 새 문서만 변경한 Main push의 release-scope는 GHCR 재게시 없이 SKIPPED로 분류되는 설계다. 별도 Main CI의 실제 실행·완료 결과는 확인 전 NOT VERIFIED.

---

## PR #169 — 2차 PR CI #41002720029 Unit/Integration 실패 및 세션 테스트 수정 (2026-10-30 KST)

- **실패 Run:** [PR CI #41002720029](https://github.com/planner77/layoutManager/actions/runs/41002720029), PR HEAD `76af1d3587442b5f7a85c621e3bc024c9e8c00ae`, `completed/failure`. Verify [Job #123890589503](https://github.com/planner77/layoutManager/actions/runs/41002720029/job/123890589503)에서 TypeScript·ESLint **SUCCESS**, Unit/Integration **90 files 중 89 PASS/1 FAIL, 633 tests 중 632 PASS/1 FAIL**. 실패 테스트 `src/tests/integration/scene-persistence.test.ts:171`, `authorized status and content GET refresh idle activity; denied, expired and revoked reads never touch`: 직접 `authSession.update({issuedAt:old,lastSeenAt:old})` 호출이 Prisma `P2003` / SQLite Trigger `G1_SESSION_IMMUTABLE_OR_EXPIRED`로 거부됨. 이후 OCI/DXF Benchmark, Production Build 및 모든 E2E는 **SKIPPED**, PASS가 아님.
- **독립 Docker [Job #123890589276](https://github.com/planner77/layoutManager/actions/runs/41002720029/job/123890589276): SUCCESS**. Baseline/후보 이미지 빌드·패키징·Greenfield Compose 첫 설치·Admin·CAD 및 재시작 smoke 통과. Docker의 성공을 Verify/E2E 성공으로 확대 해석하지 않음.
- **직접 원인:** 최신 P2 'Scene 읽기가 idle 활동을 연장해야 함'을 보완하며 추가한 **테스트 준비 코드**가 G1 Session의 보안 불변식과 충돌. 발급 시각/만료시각은 immutable, `lastSeenAt`은 뒤로 이동하거나 idle 유효기간 이상 앞으로 점프할 수 없으며 이것이 정상 DB 정책. Scene 제품 API/저장 실패로 단정할 증거 없음.
- **보완:** G1 Trigger/Schema·세션 유휴/폐기·권한 규칙은 **일절 완화하지 않음**. 실제 승인된 Editor 세션으로 기존 Scene을 게시한 뒤, 별도의 Reader 사용자/사이트 권한 및 각기 독립적인 `newSessionCandidate(userId,issuedAt)`를 생성해 **발급 시각부터** '유휴 직전/만료' fixture를 준비. 정상 Scene status/content GET은 `lastSeenAt` 증가 및 `issuedAt` 불변을 확인하고, Site 거부·idle 만료·revoked는 403/401 및 `lastSeenAt` 무변경을 검증. 기존 session row의 `issuedAt` 변조·`lastSeenAt` 역행 UPDATE를 제거하고 각 시나리오를 독립 세션으로 분리, 원본 Actor/Scope/감사 정책은 유지.
- **리뷰/메인 충돌:** [PR #169](https://github.com/planner77/layoutManager/pull/169) Codex P2 Session refresh 및 legacy Renderer URL 관련 스레드 `PRRT_kwDOUQjDfc6x1zzg`, `PRRT_kwDOUQjDfc6x1zzl`은 두 건 모두 실제 조회에서 **Resolved**, 미해결 **0**. PR `mergeable=true`; Main `0e6e91c00a90041f39034788dbd7cb6d770af8aa`은 기존 PR HEAD의 공통 조상이며 비교 `behind=0/ahead=3`; 현재 **충돌/미반영 Main 변경 없음**. 불필요한 force/rebase 없이 현재 PR branch에 단일 정상 커밋 추가.
- **검증 구분:** 아래 수정 커밋 전 현재 대화에서는 저장소 전체 npm/Prisma/Typecheck/Lint/Vitest/Browser를 로컬 실행한 증거가 없음. 새로운 PR synchronize CI가 실제 시작된 뒤에도 결과 모니터링은 사용자 요청에 따라 하지 않고 **NOT VERIFIED**로 유지. 첫 CI #41000086668의 구 HEAD 성공, 이번 실패 #41002720029와 새로운 HEAD의 결과를 혼동하거나 과거 실패를 삭제하지 않음. Main 병합/GHCR/이슈 종료/운영 DB·CAD·Scene Storage 작업은 수행하지 않음.

---

## PR #169 — CI 성공 후 Codex P2 2건 보완 및 새 HEAD 게이트 (2026-10-30 KST)

- **기존 성공은 보존:** [PR CI #41000086668](https://github.com/planner77/layoutManager/actions/runs/41000086668)는 HEAD `92d4909233296f9e25a51321df8bf9a1ed52dd21`에서 Verify와 Docker 2개 Job 모두 completed/SUCCESS. 이는 *리뷰 지적 보완 이전* 코드에 대한 성공으로, 새 커밋의 CI PASS를 의미하지 않는다.
- **사후 Codex P2 ①:** `scene-context.ts`의 `requireSceneRead()`는 Session/Role/Site와 유휴 30분 제한을 검사하지만 정상 Scene status/content GET 후 `lastSeenAt`를 갱신하지 않았다. 장시간 읽기 전용 Viewer 사용자의 유휴 만료 문제가 생길 수 있다. 권한 확인 이후에만 조건부 DB touch를 수행하고 만료/폐기/비활성/사이트 거부에서는 세션을 연장하지 않도록 보완. 통합 회귀는 status + content의 연장 및 401/403 무갱신.
- **사후 Codex P2 ②:** `viewer.tsx`에서 legacy `?renderer=dxf-viewer`로 열린 상태의 명시 Scene 생성은 state만 three로 바꾸고 URL 변경을 직접 보장하지 않았다. 명시 build 시 `history.replaceState`로 `renderer=three-dxf-viewer`를 동기화하고, legacy → 명시 DXF 변환 → 재접속 시 READY Scene/원본 미재파싱 브라우저 회귀를 추가.
- **게이트:** 신규 코드/테스트/문서 HEAD의 Typecheck·Lint·전체 Unit/E2E/Docker는 새 PR CI 전 **NOT VERIFIED**. Codex 스레드 `PRRT_kwDOUQjDfc6x1zzg`, `PRRT_kwDOUQjDfc6x1zzl`은 근거 회신 및 resolution 별도 확인 필요. Main behind/mergeable·latest HEAD CI 실제 SUCCESS 후에만 Squash Merge, Main CI, GHCR 게시/이슈 종료 허용. 실제 운영 DB/Scene storage/Prisma/Nginx/서명 변경 금지.

---

## #164/#165 0.46.0 개발 중 관측 실패 (2026-10-30)

이번 원장은 Root의 실제 실행 보고를 기록하며 Manager가 해당 명령을 재실행한 결과가 아니다. 아래 실패를 최종 재검증 성공으로 소급 삭제하지 않는다. PR CI 실패가 아니라 로컬 구현·회귀 실행 이력이다.

1. **TypeScript 제어 흐름:** 신규 pure payload validator에서 `fail():never`를 const arrow로 선언한 뒤 unknown narrowing이 적용되지 않아 최초 Typecheck가 실패했다. function declaration으로 교정했고 Root의 후속 Typecheck **PASS**, Lint **PASS(기존 경고 6개)** 보고를 받았다. 이 결과는 후속 변경 전체 동결 소스의 최종 검증과 별개다.
2. **실제 S2 Browser PoC:** `SCENE_PAYLOAD_INVALID` groups 검사에서 실패. upstream single-material TEXT ShapeGeometry는 glyph별 materialIndex 1..8을 가지고 있으나 material은 하나이며 Three renderer는 이 경우 groups를 재료 선택에 사용하지 않는다. validator가 모든 mesh에서 `materialIndex < materials.length`를 강제해 지원 가능한 결과를 거부했다. single-material에서 무시되는 index만 허용하도록 교정하고 multi-material index 범위 및 start/count 검사는 유지했다. 합성 debug로 원인을 확인했으며 **실제 PoC 재실행 결과는 보고 전 NOT VERIFIED**.
3. **기존 7-migration 회귀:** Root 전체 `npm test` 로그 `/tmp/lm-scene-tests.log`에서 `g7-runtime-migration.test.ts` **17개 중 7개 실패**를 보고했다. 신규 Scene SQL을 기존 `deploy/g7-s3/prisma/migrations`에 두어 기존 정확 7개 rehearsal이 8개를 적용한 것이 원인이다. Developer에 candidate SQL을 `deploy/scene-assets`로 격리하고 신규 빈 baseline에서만 명시 load하도록 요청했다. 기존 exact-7 검사를 완화하지 않는다. **수정 후 해당 회귀·전체 시험 재검증 PENDING**.

4. **이동 중 소스의 전체 회귀:** 위 Root 전체 실행은 최종 **20 FAIL / 601 PASS / 88 files**로 끝났다(`/tmp/lm-scene-tests.log`). 실행 중 SQL 경로/테스트가 수정된 snapshot이므로 동결 최종 소스 결과로 사용하지 않는다. 실패 결과 자체는 보존하며 전체 frozen run 재실행이 필요하다.
5. **후속 확인:** single-material group 교정 후 실제 S2 Scene PoC **1/1 PASS, 41.8초**(Root 보고). 후보 SQL 격리 후 Developer의 Scene/Greenfield **15/15 PASS**, 정확 7-migration/Greenfield/Scene **27/27 PASS**, Typecheck/집중 ESLint PASS 보고를 받았다. Root 후속 집중 **3 files/24 PASS**, 초기 Production Build PASS는 최종 validator 교정 이전 결과다. 최종 전체 Unit/Integration/Build/E2E는 아직 별도이며 앞선 실패를 삭제하지 않는다.

6. **독립 QA 검증 범위 지적:** 최초 QA focused **4 files/22 PASS** 뒤 실제 Audit INSERT failure, HTTP 다른 Version/Site·Origin/CSRF/content authorization, Version 삭제 cleanup의 직접 근거가 부족함을 보고했다. 후속 **3 files/23 PASS**도 최종 전체 수용으로 승격하지 않았다. QA는 처음에 requestId 129자 시험이 `createAuditEvent()`에서 선행 거절된다고 보고했으나, Manager가 실제 호출 경로를 대조한 결과 `appendG7CadAudit`는 `tx.auditEvent.create`를 직접 호출했다. QA는 **선행 거절 진단을 철회**했다. 기존 시험은 SQL CHECK 거절 가능성이 있으며 실패 위치를 확정하지 않았던 것으로 정정한다. 이후 SQLite BEFORE INSERT trigger를 명시 주입하는 더 직접적인 rollback 시험으로 보완했다.
7. **S3 응답 제한:** Manager/QA가 ContentLength 확인 뒤 unbounded `transformToByteArray()` 호출을 지적했다. Developer는 실제 stream의 byte 수 상한과 oversized 응답 음성 시험을 추가했다. 이것은 검토 단계 발견이며 실 S3 메모리 장애를 관측했다는 뜻이 아니다.
8. **Migrator 패키징 누락:** SQL을 기존 7-migration 디렉터리 밖으로 격리한 뒤 migrator image에 `deploy/scene-assets`가 COPY되지 않는 것을 Root가 소스 검토로 발견했다. Dockerfile COPY를 추가하고 packaging contract assertion을 보완한다. 실제 image startup 실패로 관측한 것은 아니며 Docker/CI 실행 전 이미지 검증 PASS를 주장하지 않는다.

9. **후속 실행 스냅샷:** Developer 보고로 Root 전체 실행 중 **629 PASS/1 FAIL**은 수정 전 다른-Site fixture를 읽은 실행이다. 이후 잘못된 fixture를 교정한 집중 시험 **14/14 PASS** 및 Typecheck PASS를 보고했다. 이 기록은 최종 전체 재검증 판정을 대신하지 않는다.

10. **Legacy E2E 실행 준비 오타:** 존재하지 않는 `playwright.legacy.config`를 지정한 최초 명령은 테스트 시작 전에 종료됐다. 실제 `playwright.master-migration.config`로 교정한 후 **1/1 PASS, 14.4초**. 제품 assertion 실패가 아니며 미실행을 PASS로 합산하지 않는다.

11. **최종 로컬 재검증:** Root 동결 전체 **90 files/631 PASS, 299.79초**, Production Build **PASS(exit 0)**, Typecheck/Lint PASS(기존 6 warnings), 일반 E2E **94 PASS**, signed Runtime **1 PASS**, Legacy **1 PASS**, 신규 Greenfield **2 PASS**. 이후 test-only 신규 Node process restore를 추가한 집중 **1 file/10 PASS, 5.47초**는 별도 결과다. 독립 QA 최종 **6 files/32 PASS + packaging 9 PASS**를 검토하여 Manager는 **ACCEPT LOCAL SCOPED**로 판정했다. 과거 실패는 보존하며 CI 성공/Issue AC 완료/실 현장 수용/배포 승인으로 승격하지 않는다.

기존 #168 실패/수정·CI·병합 이력은 아래에 보존한다. 이번 #164/#165의 CI/실 DXF/현장/GHCR/운영 migration은 별도이며 미실행을 PASS로 기록하지 않는다.

---

## PR #168 — P2 최종 해결·PR CI 검증·Squash Main·GHCR 게시 실행 추적 (2026-10-30 KST)

- **최신 Owner 변경:** 앞선 #161~#163 S0~S2 `NO GHCR` 개발 단계 지침에서, 2026-10-30 최신 사용자 요청으로 Main 병합 후 정식 GHCR 게시 **실행을 승인**했다. 이 지시는 Docker Compose 운영 배포/원본 CAD/SQLite Schema·Writer/개인 비공개 현장 데이터 변경이나 DRM H0~H3 검증을 승인하지 않는다.
- **CI gate:** [PR #168](https://github.com/planner77/layoutManager/pull/168) 최종 HEAD `51ea31d9d9dac7fd8cbdf5e70063664e3e8ca1bb`의 [PR CI #40990751466](https://github.com/planner77/layoutManager/actions/runs/40990751466) completed/**SUCCESS** (Verify: typecheck/lint/unit/integration/build/E2E와 Docker smoke 두 Job SUCCESS). 선행 [#40987779057](https://github.com/planner77/layoutManager/actions/runs/40987779057) 성공은 수정 이전 HEAD `3be07597`의 결과로 별도 보존한다.
- **Codex P2:** typed-array storage/normalized 복원 누락 원인과 SC-08 보완은 아래 기존 원장에 보존. 리뷰 스레드 `PRRT_kwDOUQjDfc6x0axA`에 답변, `is_resolved=true`, 최종 미해결 **0건**, GitHub `mergeable_state=clean`, main behind **0**. 별도 신원 미검증 QA를 인간 승인으로 주장하지 않음; Owner Managed.
- **병합:** 정확 Squash subject `#161 | CAD Scene S0-S2 contracts, origin and serialization PoC`. [Main `8e410e90d61dea64a3086cae763c7c9a9788e193`](https://github.com/planner77/layoutManager/commit/8e410e90d61dea64a3086cae763c7c9a9788e193), [Main CI #40992423174](https://github.com/planner77/layoutManager/actions/runs/40992423174) push 시작 확인. `release-scope` SUCCESS, GHCR `Build and push` 최초 관측 `in_progress`. `v0.45.0` Annotated Tag GitHub ref 확인. GHCR 이미지/릴리스 전체 SUCCESS·digest 확인은 별도 완료 결과 전까지 **NOT VERIFIED**.
- **이슈:** #161 S0, #162 S1, #163 S2 각각 AC 5/5 checked 후 CLOSED(completed), Epic #160 상단 S0~S2 진행 체크 및 Main/릴리스 추적 갱신, Epic 계속 OPEN. #164 S3 지속 Scene 영속화를 다음으로 하고 #165~#167 및 #113 현장/S7은 아직 미완료. 실DXF의 픽셀/텍스트 정확도, CPU-only 변환, 운영 Scene Loader/CAS/Reset·실 사내 데이터/DRM은 PASS로 대체하지 않음.
- **원장 사후 기록 방식:** 검증된 PR HEAD를 바꿔 PR CI를 무효화하지 않으려고 **Squash 후 main에 문서 전용 커밋**으로 기록한다. 이 커밋은 기능/앱 버전/마이그레이터 코드에 영향을 주지 않고 문서만 변경하므로 Github Main CI의 release-scope에서 GHCR publish=SKIPPED 예상. Main 첫 릴리스 run의 source/tag는 앞선 Squash SHA로 고정; 두 번째 문서 CI 성공/게시 상태를 첫 릴리스의 성공이라고 혼동하지 않는다.

---

## PR #168 — Codex P2 Custom DTO 정규화·복원 충실도 보완 (2026-10-30 KST)

- **선행 CI 근거:** PR HEAD `3be07597a17fc3109ec94d334163e9f79adf64d8`, [PR CI #40987779057](https://github.com/planner77/layoutManager/actions/runs/40987779057) completed/**success**. 이 성공은 신규 Codex 리뷰가 제기한 의미적 복원 결함의 부재를 보장하지 않는다.
- **신규 리뷰 결함 (CI 실패 아님):** PR #168 `scene-custom-dto.ts:52` Codex **P2**, unresolved thread `PRRT_kwDOUQjDfc6x0axA`. 작성기는 `Uint16Array([65535])` + `normalized=true` 원시값을 보존하지만 DTO에 배열 타입을 기록하지 않고 복원기는 무조건 `Float32BufferAttribute`를 만들어 `getX(): 1 → 65535`로 의미를 바꾼다. sha256/identity 검증이 통과해도 손실이 발생한다.
- **보완:** 타입 allowlist(Int8/Uint8/Uint8Clamped/Int16/Uint16/Int32/Uint32/Float32/Float64)을 DTO `arrayType`으로 기록·동일 typed array로 복원하고 `normalized`을 유지. 정수 범위/소수 입력·타입 위조·Float32 overflow·미기재 타입을 명시 거부하며 specialized Float16/InstancedBufferAttribute는 미지원으로 거부한다. 기존 DTO schema=1 중 `arrayType`이 없는 이전 실험 payload는 안전한 복원 근거가 없어 fail-closed한다(S3 운영 저장 전 PoC 포맷). 
- **회귀 보완:** `SC-08` 새 Vitest에서 정규화 UInt16 위치/UInt8 색/Int16 UV 및 Float64 정밀도·원시 버퍼 타입·실효 `getX/getY/getZ` 값과 악성 DTO를 검증한다. 기존 SC-05~07 브라우저 PoC, 전체 Vitest, Typecheck/Lint/Production Build, Viewer/권한 관련 E2E의 **최신 HEAD 결과는 새 CI 전까지 NOT VERIFIED**. 기존 실패 이력/기존 Run 결과는 수정하지 않는다.
- **경계/게이트:** main behind/실제 충돌·리뷰 회신·스레드 resolution을 커밋 후 재조회한다. GHCR·Runtime/Prisma/DB/CAD/운영 배포·실DXF/DRM 검증은 범위 밖. 새 HEAD PR CI 시작은 별도 확인하고 결과 모니터링하지 않는다. 성공이 확인되지 않은 상태에서 병합·이슈 종료 금지.

---

## #109 PR #159 — 2차 PR CI #40946304142 Unit 계약 불일치 (2026-10-30 KST)

- **원본 실패:** [Run 40946304142](https://github.com/planner77/layoutManager/actions/runs/40946304142), attempt 1, HEAD `b5883922b5313cec123b7dcdcf30bdc39cd61216`, completed/**failure**. 1차 Run `40943801670`의 TS2304/webpack 실패·P2 두 건 기록은 아래에 보존한다.
- **Verify [Job 123702736867](https://github.com/planner77/layoutManager/actions/runs/40946304142/job/123702736867):** 의존성 설치·Prisma·Typecheck·ESLint SUCCESS. Step 9 Unit/Integration은 **84 files 중 83 PASS / 1 FAIL, 597 tests 중 596 PASS / 1 FAIL**. `tests/unit/standalone.test.ts:138`, `TC-IMG67-001`: `AssertionError: expected workflow to contain smoke_web_runtime.py create`. 뒤의 `verify-delete` 기대도 같은 구 계약이지만 첫 assertion에서 중단되어 별도 실패 건수로 세지 않는다.
- **SKIPPED:** OCI manifest unit, DXF synthetic benchmark, Verify job Production Build, Chromium 설치, 일반/G7 signed/Greenfield UI/Legacy migration E2E. Docker job의 Build 성공을 위 단계의 실행 증거로 대신하지 않는다.
- **독립 Docker [Job 123702737176](https://github.com/planner77/layoutManager/actions/runs/40946304142/job/123702737176): SUCCESS.** 기준/후보 이미지 빌드, native SQLite·레이어/크기 감사·migrator 패키징·실패 주입 및 일반 Compose Greenfield 최초 관리자/CAD/재시작 persistence smoke가 모두 성공했다. 1차 TS/webpack 보완의 이 HEAD에 대한 실행 증거이며 현장 LAN/DXF/OCI 수용은 아니다.
- **재현·원인:** Node22.14.0/npm11.10.0, 격리 worktree에 고정 lock `npm ci` 후 `cd src && npx vitest run tests/unit/standalone.test.ts --reporter=dot` → **1 FAIL / 7 PASS, 591ms**, CI와 동일 assertion. 인증 설치 smoke로 전환한 workflow와 구 익명 CRUD 명령을 강제하는 테스트가 불일치했다. 기존 Docker smoke 실제 SUCCESS와 동일 HEAD 로컬 RED로 스모크 누락/의존성 차이 가설보다 구 기대값 잔존이 직접 원인임을 확인했다.
- **보완/AC:** `out/TestPlan.md`의 GF-109-CI-CONTRACT. Native SQLite 단일 COPY/추적·레이어 감사 검증은 유지하고, 현행 host code 전달 및 `smoke_greenfield_runtime.py create` → App 중지 → migrator 재실행 → App 기동 → `verify` 순서를 보장한다. Runtime·Schema·권한·workflow 변경/익명 쓰기 복구/skip 없음. 미릴리스 0.44.2 후보 유지.
- **추가 로컬 RED (CI 실패와 구분):** 독립 QA의 Chromium `npx playwright test --config playwright.g7-greenfield.config.ts`에서 `first-install.spec.ts:19`가 strict-mode failure. 전역 `getByRole('alert')`가 실제 `<p role=alert>SETUP_DENIED</p>`와 Next `__next-route-announcer__`의 빈 alert를 함께 찾았다. Setup API가 예상 오류를 정상 표시한 상태의 locator 문제이며, 위 Run의 해당 단계는 SKIPPED였다. 누적 원장의 #41/PR #64와 같은 패턴으로, 기존 `g7-first-setup` 컨테이너 안으로 locator를 한정하고 잘못된 코드 거부 assertion 및 이후 실제 setup/login 검증을 보존한다.
- **관련 문서 정합성:** 이전 P2의 Site Grant 순서는 smoke 코드에서 고쳤으나 AGENTS/README/Requirements/Operation/신규 설치 Runbook/TestPlan의 사용자 절차에 동·층 생성 후 Grant라는 구 순서가 남아 있었다. 사업장 생성 → 본인 명시 Site Grant → 동·층 생성으로 바로잡았다. 권한 검사를 완화하지 않는다.
- **로컬 검증:** Developer focused GREEN **9/9, 264ms**; 독립 QA 전체 Vitest **84 files / 598 PASS, 244.92s**, Typecheck PASS, Lint 0 errors/6 warnings. root Production Build PASS. OCI manifest unit 3/3 PASS, outline benchmark 1k/10k/100k PASS, Python audit 10 PASS(zstd subtest는 Python3.14 필요로 SKIPPED). 수정 후 Greenfield UI **1/1 PASS, 5.3s**, signed Runtime UI **1/1 PASS, 9.9s**. 재개 후 최종 Typecheck와 Legacy migration UI **1/1 PASS, 15.4s**(테스트 2.0s)를 확인했다. 재개 일반 Chromium **93/93 PASS, 5.9분**, Legacy 포함 브라우저 합계 **96 PASS**(일반93 + Legacy1 + Greenfield1 + signed Runtime1)다. 신규 Docker 실행은 테스트·문서만 수정한 범위에서 반복하지 않았으며 위 과거 HEAD의 성공과 구분한다.
- **작업 재개/중단 구분:** daemon 재시작으로 일반 Chromium 93건 회귀 실행과 QA 에이전트가 중단되었다. 완료 summary/`.last-run.json`이 없으므로 해당 실행은 INTERRUPTED, PASS나 제품 FAIL로 집계하지 않는다. 그 전에 실제 완료한 Unit/Build/Greenfield·signed Runtime 결과는 보존한다. 미완료 일반 회귀와 미실행 Legacy migration만 격리 DB·별도 로그/결과 디렉터리에서 재개한다. 재시작 직후 git HEAD가 `b5883922`로 그대로이며 커밋·push 미수행임을 확인했다. 재개 Legacy 하네스는 미생성 임시 디렉터리/허용 prefix 밖의 경로 때문에 시험 전 setup guard에서 2회 중단됐고, 문서화된 `/tmp/cad-master-migration-*` 격리 root를 준비한 뒤 실제 1건을 통과했다. 제품 실패와 구분한다.
- **리뷰/충돌:** 원격 PR #159 재조회에서 Thread 2건 모두 resolved / 미해결 0, mergeable=true. 최신 fetch main `993a2d6872c58039b79ec09c4796032b362ef2a6`, PR head `b5883922`와 동일, main behind=0/ahead=46(수정 커밋 전), 실제 해결할 충돌 없음. 기존 작업 폴더의 수정 파일 2건은 별도 worktree로 보존, 운영 DB/CAD/볼륨 변경 없음.
- **수정 커밋/수용:** 코드 [1daf5faa](https://github.com/planner77/layoutManager/commit/1daf5faa08fb8691228e86bacbef0edb27580f6d) (`test: align greenfield CI smoke and setup assertions`). 독립 QA 결과와 최종 보고 정합성을 검토한 gpt-6-astra Manager가 **ACCEPT / 재작업 불필요**로 판정했다. 원격 미해결 리뷰 0건·main behind0 재확인, PR 전체 Secret/실제 .env 값·CAD/DB/산출물 제외 및 diff check PASS.
- **반영 경로 보완:** 기본 Git 인증과 `.env` 지정 토큰의 Git push가 각각 인증 거부로 종료됐으며 원격 ref 변경은 없었다. 토큰 값은 출력하지 않고 임시 인증 helper를 정리했다. 인증된 GitHub 연결 도구로 객체를 생성하고 코드 tree `a0d447b95be37f429ab1d2ecad17286e42c3f355`가 로컬 검증본과 같음을 확인했다. 최종 ref는 기대 HEAD `b5883922` 및 `force=false`로 한 번만 전진시킨다. 기존 로컬 커밋과 브랜치를 보존하며 이력을 재작성하지 않는다.
- **새 CI:** 검증/코드·원장 커밋 후 PR 브랜치를 단일 non-force 갱신하여 `pull_request.synchronize`로 시작한다. 새 Run 시작은 최종 대화 보고에서 확인하며, 완료 결과는 모니터링하지 않고 **NOT VERIFIED**로 남긴다. 병합·GHCR 게시·배포·Issue 종료는 하지 않는다.

---

## #109 PR #159 — 1차 PR CI #40943801670 실패 및 전체 원인/리뷰 보완 (2026-10-30 KST)

- **원본 실패 보존:** [PR CI #40943801670](https://github.com/planner77/layoutManager/actions/runs/40943801670), 최초 HEAD `ba49e5062c33a4f61990a4f458a264e3781a817e`, `completed/failure`. 이는 이전 #153의 PR CI #40888739457(14 TS 오류)·#40890727134(8 TS 오류)와 **별개의 신규 실패**다. 이전 원장의 실패 원인/상태를 성공으로 변경하지 않는다.
- **Verify Job [#123693738568](https://github.com/planner77/layoutManager/actions/runs/40943801670/job/123693738568):** `npm ci`·Prisma Client 생성 SUCCESS. `npm run typecheck`에서 **1건**, `src/server/g7-operational/greenfield-auto.ts:78:12 TS2304 Cannot find name 'closeSync'`, exit 2. 로그인/권한/Schema 실패가 아니라 `privateFile()` 파일 디스크립터를 닫는 보안 경로의 `node:fs` import를 리팩터링 중 잘못 제거한 실수. **ESLint·Unit/Integration·OCI/DXF·Production Build·Legacy/Main/신규 Greenfield Playwright 전부 SKIPPED**, 성공 아님. 보완은 `closeSync` 정식 import 복구, 파일의 `finally` 닫기 동작 유지(파일 안전검사 제거하지 않음).
- **Docker Job [#123693739084](https://github.com/planner77/layoutManager/actions/runs/40943801670/job/123693739084):** Compose 이미지 정규화 검사, Python 정적/합성 검사 SUCCESS. `Build pre-change baseline`은 **main 원본 Dockerfile**로 현재 PR 소스의 Next 앱 빌드를 시도하다 `./server/g7-operational/greenfield-install.ts Module not found: Can't resolve '../../'`에서 실패(Exit 1). Import trace: `greenfield-auto.ts → greenfield-first-setup.ts → /api/g7-runtime/[...segments]/route.ts`. 기존 CLI 전용 설치 함수의 `fileURLToPath(new URL('../../',import.meta.url))`를 웹 API import graph에서 Webpack이 정적 자산 상대 참조로 처리한 탓이며, Prisma/Docker 네트워크/기존 이미지 provenance 오류가 아님. `const APP = path.resolve(process.cwd())`로 변환하고 불필요한 `fileURLToPath` import 제거. Migrator와 npm/vitest 모두 WORKDIR=`src`를 전제로 하며, 최종 Schema SQL 읽기와 O_EXCL 보호는 그대로.
- **Docker 이후 SKIPPED:** New phase1/runtime/migrator builds, image layer SHA/size, Native SQLite, intentional-failure guard, Composite fresh install/Admin/DXF/restart smoke는 기준 이미지 빌드 실패로 실행되지 않았다. 단순 CI retry로 성공 주장하지 않음.
- **Codex P2 [#159 thread](https://github.com/planner77/layoutManager/pull/159):** ① `src/scripts/smoke_greenfield_runtime.py`: Site0 Admin은 새 Site Grant를 받기 전 Building/Floor를 생성할 수 없는데 이전 smoke가 전체 계층을 먼저 만든 뒤 Grant를 호출하는 잘못된 절차였다. 기존 Site authorization 가드를 완화하지 않고 **Site 생성 즉시 명시 Grant → Building/Floor**로 순서 수정. ② `src/playwright.g7-greenfield.config.ts`: Runner가 생성한 임시 디렉터리를 Worker가 구성 재평가 시 다시 `mkdtempSync()`해 실제 웹 서버의 `first-admin.code`와 E2E 측 코드 경로가 분리될 위험. `G7_GREENFIELD_E2E_ROOT`가 있으면 재사용하고 없을 때만 한 번 생성하도록 변경.
- **보안/검증 범위:** 1차 Run은 테스트가 Typecheck/기준 Image 단계에서 선행 중단되어 현재 보완으로 Lint·전체 Unit·브라우저·Docker가 PASS했다는 뜻이 아니다. 새로운 HEAD로 PR CI 시작 후 상태를 기록하고 결과 모니터링은 사용자 요청에 따라 생략. 현장 기존 DB/CAD/OCI/Secrets/S3 볼륨 변경·반출 없음. #109 OPEN, GHCR 게시/병합/운영 수용 없음.
- **재발 방지:** ① import 정리 후 전체 `npm run typecheck`, ② CLI 유틸리티를 Next Route에 import하는 경우 Webpack 경로 해석/Production Build, ③ E2E 실제 종단 API 순서(첫 Site Grant 직후 Building 생성), ④ Playwright Runner와 worker의 fixture lifetime을 PR CI에서 필수 확인. 이전 #153 TypeScript 축소·Schema drift 원장도 함께 보존.
- **리뷰/충돌 최종 게이트 (실제 조회):** PR #159의 [P2 Site Grant 선행](https://github.com/planner77/layoutManager/pull/159#discussion_r4417208655) / [P2 Playwright fixture 공유](https://github.com/planner77/layoutManager/pull/159#discussion_r4417208667)는 수정 커밋 근거를 각 스레드에 답변했으며 GraphQL 두 Thread `PRRT_kwDOUQjDfc6xuqCw`, `PRRT_kwDOUQjDfc6xuqC1` 모두 **is_resolved=true**. 현재 미해결 0건. 별도로 GitHub PR #159 `mergeable=true`, main 비교 `behind=0`, `ahead=45`(기록 직전), base `993a2d6872c58039b79ec09c4796032b362ef2a6`이며 코드 충돌 없음. 이는 CI 통과/승인이 아니다. 이후 최종 ledger commit의 synchronize PR CI를 시작하고 결과는 요청대로 모니터링하지 않는다.

---

## #109 일반 Compose G7 신규 설치 — 누적 위험/사전 보완 원장 (2026-10-30 KST)

- **기준:** main `993a2d6872c58039b79ec09c4796032b362ef2a6` (#153 0.44.1)에서 신규 `feat/issue-109-compose-first-run` 분기. #109 최신 요구: 일반 Compose/3000/빈 DB final Schema, Host code+웹 최초 Admin, 서명 24h 갱신 제거. #153 이전 Greenfield 수동/서명 도구는 Expert 이력으로 보존. 미병합 **PR #128은 과거 S2/NO-GO**와 관련되며 최신 main과 충돌; 새 PR에서 코드 병합하지 않는다.
- **선행 실패 재발 방지:** #153 원장 기록의 TypeScript 오류 14+8건(미검증 nullable env/unknown fields 및 중복 import)과 legacy 7-schema를 Greenfield로 인정하는 P2, restart lock/HOLD 부정 상태를 참조. 새 설계는 현행 Verified final DDL/2 triggers/fingerprint를 그대로 사용하고 원치 않는 구 DB 이관/Schema fallback을 허용하지 않는다.
- **위험 GF-AUTO-01:** 최초 DDL 설치 후 코드/marker 작성 중 종료 시 부분 설치. 최초 구현에서 marker→code 순서로 기록하는 결함을 사전 발견하여 **code→marker 마지막 기록**으로 보완. Marker 없고 기존 DB/파일 있으면 중단, marker 있는데 User0에 코드가 누락되거나 파일 metadata가 잘못되면 재시작 차단, user0 때 운영자만 `setup-renew` 할 수 있도록 복구 분리. 이 보완은 합성 검증 전 **CODE-REVIEW ONLY**, 시험 PASS 아님.
- **위험 GF-AUTO-02:** 기존 Docker CI의 익명 CAD CRUD smoke는 G7 기본 인증과 충돌. 새 Docker CI는 설정 코드+CSRF 최초 Admin→PW 초기변경→Site 계층/Grant→인증 CAD 업로드→Migrator 재실행/App 재시작→원본 content 및 password 삭제 검증으로 전환. 독립 브라우저 E2E 추가. 이전 Legacy CI/이력은 보존.
- **위험 GF-AUTO-03:** Site0에서 기존 `MasterRepository`의 모든 새 Site 생성을 막는 서명 approval list 확장 제한. **Self-hosted mode에서만** new Site 허용, Signed Expert mode 제한 유지. Admin Site grant는 명시적으로 분리.
- **상태:** 새 PR 및 CI가 실제 수행될 때 Run/Head/스레드 결과를 추가한다. 현 시점 실행 결과 추정 금지. 구 현장 DB/CAD/DXF/Secrets/HOLD/운영 이미지는 조회·변경·삭제·공개하지 않았다.

---

## #153 PR #158 — 2차 PR CI 실패·누적 타입오류 수정 (2026-10-29 KST)

- **실패 Run:** [PR CI #40890727134](https://github.com/planner77/layoutManager/actions/runs/40890727134), HEAD `6b308615cf0ec9dae52b7e5072195c17c5eff30b`, `completed/failure`. 최초 Run #40888739457의 14개 TS 오류 수정 이후의 **독립 2차 실패**이며, 이전 기록과 합치거나 성공으로 바꾸지 않는다.
- **Verify [Job #123507859408](https://github.com/planner77/layoutManager/actions/runs/40890727134/job/123507859408):** `npm ci`/Prisma generate SUCCESS, `tsc --noEmit` exit2. **TS 오류 8건 전수:** `greenfield-authority.ts` (96,106,120: TS18048/TS2322 3건), `greenfield-install.ts` (130,136,137: TS18046/TS2345 3건), `runtime-db.ts` (3,7: TS2300 중복 import 2건). Lint/Unit/Integration/Build/E2E는 선행 Typecheck 실패로 SKIPPED; 성공 판정 금지.
- **Docker [Job #123507859697](https://github.com/planner77/layoutManager/actions/runs/40890727134/job/123507859697):** pre-change baseline build 단계 Next Typecheck에서 같은 오류로 중단. 후속 Phase1/standalone/migrator/Size/Compose Smoke는 SKIPPED. 별도 Docker 빌드 시스템 문제로 간주하지 않음.
- **실제 원인:** 이전 수정의 `const blocked=():never=>{throw ...}` 호출을 조합 조건의 후속 타입 축소 증거로 사용했지만, strict TS의 control-flow가 해당 표현식을 통과해 `string|undefined` 및 `unknown`을 좁히지 못함. `runtime-db.ts`에는 독립 보안 P2 수정 중 동일 심볼 import가 중복 추가됨. 이전 14개 TS 오류 중 일부가 잔존했고 두 건은 회귀성 중복 import임.
- **이번 보완:** `requiredGreenfieldEnv()`를 검증 실패 시 **직접 throw하고 string 반환**하도록, `seedInput()`는 `validatedTitle(unknown):string`으로 각 필드 정제 후 명시적으로 `Seed` 구성하도록 변경. 구/신 Schema 검증 import 중복 제거. 검증 실패를 단언·skip·느슨한 타입으로 우회하지 않음. 단일 모듈 타입 축소 재현은 로컬 독립 `tsc --strict --noEmit`의 축소 시험에서 exit0이나 전체 repo Typecheck PASS는 **아직 확인되지 않음**.
- **기존 P2:** PR #158의 Greenfield Schema 강제 리뷰 스레드 `PRRT_kwDOUQjDfc6xl6yn`은 코드 보완 후 Resolved 이력 보존. 새 리뷰 발생 시 다시 확인. 원본 DB 이관/HOLD/기존 데이터 복구는 최신 Greenfield 구현 범위 밖. 현재 실제 운영 Docker·DXF 자료는 미변경.
- **재개 조건:** 현재 main과 branch behind/mergeable·미해결 리뷰 스레드를 재확인하고, 이 원장과 시험 상태를 포함한 최신 PR HEAD의 새 `pull_request.synchronize` CI 시작. 요청에 따라 시작만 확인/모니터링 없음; 새 CI 결과는 `NOT VERIFIED`. 병합/GHCR/운영 배포는 수행하지 않음.

## #153 PR #158 — PR CI #40888739457 실패 전수 분석·보완 (2026-10-29)

- **관측 원장:** [PR #158](https://github.com/planner77/layoutManager/pull/158) 초기 HEAD `eb2fe9193e086fb1f01daf183d3b5f551444a8e0`, [Run #40888739457](https://github.com/planner77/layoutManager/actions/runs/40888739457) `completed/failure`.
  - Verify [Job #123499430711](https://github.com/planner77/layoutManager/actions/runs/40888739457/job/123499430711) TypeScript TS18048/TS2322/TS2345/TS18046/TS2769 **14개**: `greenfield-authority.ts` 4, `greenfield-gate.ts` 1, `greenfield-install.ts` 9. nullable env, unknown JSON 입력과 Ed25519 서명 Buffer null, callback 내부 unknown release narrowing. Typecheck exit2; Lint·Unit/Integration·Build/E2E 등 후속은 **SKIPPED**, 성공으로 간주하지 않음.
  - Docker [Job #123499430329](https://github.com/planner77/layoutManager/actions/runs/40888739457/job/123499430329) baseline Docker build의 Next.js TypeScript 단계에 동일 `greenfield-authority.ts:93` TS18048 발생; webpack compile PASS였으나 final typecheck 실패, 이후 이미지/마이그레이션/스모크 단계 **SKIPPED**. 별도 Docker 기능 결함이라는 근거 없음.
- **제품 수정:** `greenfield-authority.ts`의 local databaseUrl/cadPath 선행 검증과 null 서명 Buffer 명시 차단, `greenfield-gate.ts` 독립적으로 검증한 release 객체의 local binding, `greenfield-install.ts` required string helper 및 배열/이름 정규화 검증으로 14개 컴파일 오류의 원인 제거. 타입 단언을 늘려 우회하거나 검사/Site 계약을 완화하지 않음.
- **PR Codex P2 별도 발견:** [리뷰](https://github.com/planner77/layoutManager/pull/158#discussion_r4413472885) `Greenfield Gate`의 공통 `assertG7RuntimeSchema` legacy fallback 우회 위험. `schemaMode:'GREENFIELD'`로 승인 타입 명시, `openG7RuntimeDb` 모든 트랜잭션에서 `assertG7GreenfieldSchema` 강제 및 Gate 독립 검증 재확인. 구 7-Migration history + 정확 Site로 치환하더라도 BLOCKED인 음성 통합 회귀 추가. [리뷰 답변](https://github.com/planner77/layoutManager/pull/158#discussion_r4413509119), Thread `PRRT_kwDOUQjDfc6xl6yn` **Resolved**. 실제 새 HEAD Codex 재리뷰 미완료면 미검증으로 구분.
- **Main/보안 경계:** 새 설치만 허용, 이전 DB 6→7/HOLD/Snapshot/rollback 데이터·기능 재도입 없음. 기존 #157 닫힌 PR은 미병합 보존. 신규 패키지 버전0.44.1, Owner 서명·Scope/Origin/FK/Password guard/Fail-closed 유지. CI 실제 성공은 새 Run 확인 전 `NOT VERIFIED`; 로컬 전체 Vitest/Docker 결과를 창작하지 않음.
- **작업 흐름:** 최신 main behind·Mergeable, 미해결 Review thread를 확인한 뒤 이 원장을 포함한 최종 브랜치 push로 새 PR CI 시작. 사용자 요청대로 시작만 확인하고 모니터링하지 않음. 병합·Main CI·GHCR 게시·운영 설치 금지.

## #153 Greenfield 계획 변경 및 실행 전 위험 기록 (2026-10-29)

- User는 기존 데이터 사용·Migration·HOLD 복구·same-snapshot 증거 요구 전면 폐기를 확정. 별도 보관 DXF만 Greenfield DB에 새로 등록.
- 기존 운영 Schema/HOLD 복구용 PR #157은 변경된 Scope와 맞지 않아 **CLOSED, unmerged**. 해당 리뷰/CI/실패 이력은 역사적 원장에서 삭제하거나 PASS로 바꾸지 않는다. 최신 Main 독립 브랜치 `feat/issue-153-greenfield-install`에서 신규 경로 개발.
- 현재 검증 필요 위험: 신규 Schema DDL replay의 SQL canonicalization, 단발 Site/Owner/Admin 초기화 순서, 관리자 Site Grant, 정확한 릴리스·Origin 바인딩, 별도 Docker 볼륨과 Auth fail-closed. 소스 변경·테스트 작성은 PASS 아님.
- 신규 PR CI는 PR 생성/워크플로 시작 확인 이전에는 `NOT STARTED`; 로컬 실행·실제 Docker/현장 신규 설치는 `NOT RUN`. 사용자 요청에 따라 PR CI 시작 후 모니터링 생략.

# PR/Main CI 실패 원장

## PR #156 — P2 Site 비활성화 격리·강제 종료 Migration 복구 (2026-10-29)

- **선행 성공 보존:** HEAD `523801a4da8850d579009efa92e3f1c76a746ece`, [PR CI #40775288415](https://github.com/planner77/layoutManager/actions/runs/40775288415) `completed/success`를 직접 확인했다. 아래 결함은 해당 CI 실패가 아니라 [Site P2](https://github.com/planner77/layoutManager/pull/156#discussion_r4406464951) 및 [Stale Lock P2](https://github.com/planner77/layoutManager/pull/156#discussion_r4406464961)의 추가 회귀다. 기존 실패/취소/미확정 기록은 보존한다.
- **RED Site:** `npx vitest run tests/integration/g7-runtime-cad.test.ts tests/integration/g7-runtime-auth.test.ts tests/integration/g7-runtime-gate.test.ts -t 'approved inactive Site|Admin can deactivate|missing approved site' --reporter=dot`에서 2 FAIL. 비활성화 후 로그인503(expected200), Runtime BLOCKED(expectedACTIVE). 승인 ID 존재/무결성과 업무 active 상태를 혼합한 전역 검사가 원인이다. 전역 active 검사를 분리할 때 비활성 Site의 Current/DELETE가 허용되지 않도록 거래 안의 대상별 검사도 필요하다.
- **RED Lock:** `npx vitest run tests/integration/g7-runtime-migration.test.ts -t SIGKILL --reporter=dot`에서 2 FAIL. 실제 자식의 lock 보유→SIGKILL·종료 확인 후 새 프로세스의 승인 Migration 재개·동일 Snapshot Restore가 `g7-rehearsal.lock` EEXIST로 중단했다. wx 생성 파일과 finally 삭제는 프로세스 강제 종료에서 실행 잠금 수명을 보장하지 못한다. 기존 throw-fault 테스트는 finally를 실행하므로 이 결함을 포착하지 못했다.
- **중간 로컬 검증 보존:** 첫 수정 후 집중 실행55 PASS/1 FAIL(56개)은 비활성 등록의 기존 `INACTIVE_LOCATION_CHAIN`을 새 테스트가 `ACCESS_DENIED`로 기대한 오류였다. 실제 거부 동작을 유지하고 기대 코드만 정정했다. 이후 원본의 구버전 node_modules 복사에서 기존 의존 `polygon-clipping` 누락으로 Typecheck가 중단되었다. Root가 정확 lockfile의 격리 `npm ci`를 집중 테스트 종료 전에 시작하여 진행 중 worker의 `vitest/suppress-warnings.cjs`·`tsx/index.js` 모듈 소실과 Auth 실패1/worker 오류를 유발했다. 이는 시험 환경 간섭이며 제품 실패나 PASS로 기록하지 않고 설치 완료 후 재실행한다. 실제 PATCH Route를 Vitest에서 import한 뒤 `server-only` guard에 걸린 fixture 문제도 테스트에서 적절한 server-only mock으로 보완한다.
- **새 fixture Typecheck:** 빌드 후 순차 `npm run typecheck`에서 `g7-runtime-migration.test.ts:146` TS2345를 관측했다. 서로 다른 음성 fixture 객체 배열의 env optional 추론 때문에 `Options.env`에 undefined 가능성이 남은 테스트 타입 오류이며 명시 타입/분기 보완 후 재검증한다. 제품 Schema·검증 규칙은 완화하지 않는다.
- **GREEN:** 최종 Developer Runtime4파일59/59 PASS(106.95초), 독립 QA 동일59/59 PASS(105.41초), root 전체 Vitest82파일590/590 PASS(319.11초). 실제 SIGKILL4개·살아 있는 RESUME contender 거부와 path/HOLD identity 음성시험을 포함한다. Typecheck·Lint 오류0/기존경고6·Production Build PASS, 서명 Runtime ON Chromium1/1(12.4초), 기본 OFF/master/upload Chromium11/11(37.0초) PASS. 기존 사업장/등록/검색/Current/이력·원본·삭제암호·계정/권한/Audit 흐름을 재검증했다. 실제 reboot/현장 OCI·원격S3·Writer Zero/배포는 NOT TESTED다.
- **리뷰/변경 근거:** [수정 commit eea01548](https://github.com/planner77/layoutManager/commit/eea01548b75d5d38db1cfa14029115f7d6a07881), [Site 답변](https://github.com/planner77/layoutManager/pull/156#discussion_r4407021095)·[Lock 답변](https://github.com/planner77/layoutManager/pull/156#discussion_r4407022868)을 기록하고 두 thread를 실제 resolved 처리했다. gpt-6-astra Manager가 독립 QA와 전체590/590·브라우저12/12 근거로 ACCEPT, 재작업 불필요 판정. 마지막 checkpoint까지 포함한 최종 Build→Typecheck 재실행도 exit0이다.
- **Main/범위:** Main `a7af4aa0c106b5149043196a3567cf7bdc1b08a9` 재조회, behind0·merge-tree 충돌0. 이번 보완은 기존 PR의19경로(제품5·회귀4·문서10)에 한정, PR 전체64경로 밖 추가 없음. Schema/활성6 SQL·의존성/package·Docker/Compose·Viewer 수정 없음. staged diff·credential-pattern/산출물 제외 검사 통과. `.env` 지정 원격과 origin 일치 확인 후 연결 GitHub 도구로 기존 PR branch만 non-force fast-forward 반영한다.
- **신규 CI 구분:** 기존 성공 Run40775288415는 원래 HEAD의 결과로 보존한다. 수정+이 기록의 최종 HEAD를 기존 PR branch에 한 번 반영하여 `pull_request.synchronize` 새 PR CI를 시작한다. 새 Run은 시작 확인까지만 수행하며 종료 판정은 NOT VERIFIED·모니터링 생략이다. 정확 최신 HEAD/Run URL은 완료 보고에 남긴다. 이 문서 갱신을 위해 별도 후속 push/추가 CI를 만들지 않는다.
- **작업 경계:** 별도 worktree에서 기존 원본 worktree의 두 변경을 보존했다. 신규 Issue/PR·운영 설정/원본·GHCR/Tag·병합/배포 없이 기존 PR만 갱신한다. 후보0.44.0은 미릴리스 기능 PR 내 보완으로 유지한다. 로컬 결과·리뷰 해결·Main/범위·신규 CI 정책은 위 기록을 기준으로 하며, 최신 HEAD/Run 링크는 완료 보고에서 확인한다.


## #153 — 운영 통합 중 로컬 발견·보완 누적 (2026-10-29)

실제 운영 장애나 원격 CI 실패로 혼동하지 않는다. 아래는 `feat/issue-153-g7-runtime` 작업트리의 로컬 실행/코드 검토이며 기존 원장은 그대로 보존한다.

| 발견 | 원인·수정 | 검증 범위 |
| --- | --- | --- |
| 첫 Production Build FAIL | G3 거래 hook 편집 중 limiter에 선언되지 않은 runtime 참조(TS2304), 해당 stray 참조 제거. JSON named import 경고도 default import로 변경 | 후속 Typecheck/Production Build PASS; 최종 집계는 TestReport |
| 첫 Runtime ON E2E 시작 전 FAIL | Native Node22 ESM이 JSON import attribute를 요구(`ERR_IMPORT_ATTRIBUTE_MISSING`); Next/Vitest 변환만으로는 발견되지 않음 | Gate/fixture default JSON import에 `with {type:'json'}`, 실제 Node22 signed resolver smoke PASS; 브라우저 결과 별도 |
| 최초 Admin 초기화 차단 P1 | User=0에서 거부 Audit가 들어가 기존 G2 pristine 조건을 깨뜨릴 수 있음 | Runtime auth/CAD 초기화 전 BOOTSTRAP_REQUIRED503, Audit/limiter 무변경, 거부 후 실제 G2 bootstrap 회귀 |
| DB 잠금·장시간 업로드 P2 | 거래 이전 시각/승인을 재사용하면 대기 중 만료 또는 권한 회수 반영 누락 가능 | G2/G3/G4 BEGIN 이후 시각/승인 hook, CAD 거래와 파일 publish 이후 최종 재검사; 만료·회수 rollback 회귀 |
| 기존 DB/CAD 경로 호환 P1 | 승인 Migration이 DB dirname/cad만 허용하여 기존 /data/db + /data/cad를 거부 | 별도 signed cadStoragePath 및 독립 경로 지원, 기존 배포 형태 합성 회귀; 경로 이동 없음 |
| 기본 OFF 브라우저 호환 | session404 사전조회가 기존 정상 업무 console 검사에 오류를 추가할 수 있음 | status200에서 OFF/ACTIVE/BLOCKED를 먼저 구분, ACTIVE API 실패는 익명 fallback 불허 |
| 신뢰 파일·Schema 재발 방지 | 과거 FIFO 대기/경로 reopen TOCTOU, 약화된 append-only trigger, 자체 변경 trust로 음성시험 통과 위험 | nofollow/nonblock private FD, UID/parent/inode 검증, 실제7 이력/checksum/전체Schema/FK, 독립 Trust 고정 음성시험 |
| 합성 테스트 fixture FAIL | readonly origin 대입/Asset.kind 추론/헤더 union 타입, FK가 켜진 DB에 손상행 INSERT, immutable issuedAt UPDATE, 비정규 base64url 토큰, 테스트용 trigger가 엄격 Schema 검사에 걸림 | 타입/fixture·주입 seam을 수정. 실제 Schema/세션/Audit Assertion과 불변식을 제거하거나 Skip하지 않음 |

추가 실행·리뷰 기록:

- 첫 전체 Vitest: **82파일/578개 중577 PASS·1 FAIL**, 새 users/create503 vs201. 동시 구현 중 로드된10-test 버전이며 최신11개 Auth 및 해당 시나리오 독립 재실행 PASS. 최초503의 세부 원인은 해당 출력만으로 확정하지 않으며 최종 전체 재실행과 분리한다.
- 실제 ON 브라우저 DELETE401: 비동기 Prisma Session 조회 중 실제 별도 SQLite 연결의 G3 refresh가 last_seen_at를 전진시켰다. 조회 전 now와 비교하여 정상 세션을 거부하는 실제 경합을 DB 두 연결로 RED 재현했다. 조회 후 Gate/현재시각을 다시 검사해 GREEN. 미래 시각/유휴·절대 만료·publish 후 재검사 Assertion은 유지했다. 시각 장애 주입은 Prisma 자체10초 transaction timer와 분리해 권한 시간만 전진시킨다.
- 첫 ON E2E의 CAD 등록400은 합성 Site 계층이 UUID가 아닌 fixture 결함으로, 실제 UUID 체인과 재서명 Scope로 수정했다. 기존 validateId는 유지했다.
- Runtime gate 반복 fixture 생성의 수백 DDL fsync가 병렬 빌드 중15초 timeout2건을 유발했다. fixture를 메모리에서 실제7SQL 적용 후 한 번 serialize해 실제 private DB를 생성하도록 변경,12개 전체 PASS. Assertion·timeout 변경 없음.
- 기존 Chromium 첫92개 실행은91 PASS·1 FAIL. 동시 Playwright가 같은 test-results trace 디렉터리를 정리해 TC-ISSUE9-003 종료 시 ENOENT가 발생했다. 이후 실행은 분리된 출력 경로·순차 실행으로 검증한다. 제품 Assertion 실패로 단정하거나 최초 실행을 PASS로 바꾸지 않는다.
- Typecheck/Next build를 동시에 실행하여 .next/types 재생성 중 TS6053가 발생했다. 빌드 완료 후 순차 Typecheck로 재검증한다. TypeScript include/검사 규칙을 완화하지 않는다.
- 검토 P2: 기존0755 CAD 하위 디렉터리를 no022-write 소유권 검사로 수용, S3 VersionId는 UTF8 byte/roundtrip 검사. dangling HOLD/export-manifest symlink의 외부 생성 위험은 nofollow/nonblock FD+fstat+truncate/fsync와 외부 생성0 회귀로 차단했다.
- 모바일 Audit 표의 과도한 행 높이는 표 최소폭+표 내부 focusable 스크롤로 수정하고390/768/1024/1440/1920px 문서 overflow·열 정렬·행 높이 회귀를 추가했다. Runtime Runbook 중앙 AGENTS 인덱스 누락도 등록했다.

최종 추가 기록:

- QA 독립 선택 실행(06:35:31 KST)의 DELETE race 시험에서 race 실행 전 초기 CAD 등록이 G7_RUNTIME_BLOCKED로1회 FAIL했다. 원인은 미확정이다. 별도 안전 사유코드만 수집한 새 Fixture 진단21회 및 임시 진단 제거 후 CAD 전체16개에서는 재현되지 않았으며, 최종 전체582개도 PASS했다. 최초 실패를 지우거나 특정 원인을 확정하지 않는다. 의도된 fail-closed 때문에 실패한 요청은 CAD 변경을 commit하지 않는다.
- OFF E2E가 계정 페이지 HTTP404만 요구해 실패했다. 설치된 Next16 not-found 문서는 streamed notFound 응답200과 non-streamed404를 명시한다. 실제404 UI/noindex/운영 UI·폼·메뉴 부재와 API404를 검사하도록 바꾸었다. noindex meta 중복 개수 및 별도 실행 포트 충돌도 fixture/실행 조건으로 기록하며, 기존 Runtime/API 보호 Assertion은 유지했다.
- 최종 Chromium 재검증은 서로 다른 서버 포트와 출력 디렉터리로 실행해 trace 삭제 경합을 제거했다. 전체 최초91/92 실패와 최신 주요 회귀 결과는 TestReport에서 분리한다.

오래된 PR #128 미해결 지적은 공개 Host와 내부 Next bind origin 분리 P1, CAD 거래 시각 Session 검증 P2이다. 이번 실제 Runtime 연결에서 해당 경로·회귀를 검토하며, 과거 PR CI 성공을 새 HEAD 증거로 재사용하지 않는다. Auth/CAD/Runtime/Migration의 최신 실제 시험 결과와 PR/CI 식별자는 TestReport의 #153 절에 기록한다. 실제 Site/OCI/S3·운영 전환은 NOT TESTED다.

## #154 PR #155 first CI failure / P1 review correction (2026-10-28 KST)

- Original HEAD `29f67d1cb2b045f37e93ba603f4caa0a66aa0ac2`, [PR CI #40648586533](https://github.com/planner77/layoutManager/actions/runs/40648586533), attempt 1: Docker image size/migration/runtime smoke job `122683088359` SUCCESS. Verify job `122683088747` FAILED at Unit/Integration: 524 passed, 1 failed / 77 files (76 passed, 1 failed). Typecheck and ESLint SUCCESS; OCI/DXF, Build, Chromium E2E, Legacy E2E SKIPPED, not PASS.
- Exact failure: `src/tests/unit/g7-s3-5-owner-decision.test.ts:157` expected BLOCKED but observed `LOCAL_RELEASE_DECISION_CONSISTENT_NOT_ACTIVATED`; Codex [P1 review](https://github.com/planner77/layoutManager/pull/155) identified the synthetic `siteScope:'SCOPE-other'` case passing `altered` as both the Owner-signed packet release and independently trusted release. The test was self-authorizing the changed scope, not demonstrating rejected scope tampering. No production validator defect established by this test.
- Correction: retain original independently trusted `f.release` in every re-signed release-tamper assertion; preserve all five negative cases and fail-closed assertions. Changed test only; no production release, migration, runtime, private site evidence, keys, activation or GHCR modification. Review thread resolution requires verifying the correction. New HEAD PR CI outcome remains NOT VERIFIED until independently observed.
- Preserve first-run FAIL and all skipped-step status permanently; #153/#109/#96 remain OPEN/BLOCKED. S3-5 operating Owner GO NOT ISSUED.


## #154 S3-5-R0 — 선행 Main CI/실 현장 Owner 보고 인계 및 신규 PR 검증 경계 (2026-10-28)

- **선행 코드 CI:** C0 [PR #152](https://github.com/planner77/layoutManager/pull/152) Main `013effd65a68879d94d18c4928db8c600e8e9589`, [Main CI #40641999215](https://github.com/planner77/layoutManager/actions/runs/40641999215) SUCCESS / Release Scope SUCCESS / GHCR Build+Push SKIPPED. 이전 PR #152 CI #40638297319 TC-126 E2E 1건 FAIL + Legacy E2E SKIPPED 및 보완 이후 #40640589443 SUCCESS 이력은 아래 원장에 보존, 실패를 성공으로 다시 쓰지 않는다.
- **현장 수용 상태:** 사용자 Owner Managed 현장 수용 완료 보고를 **OWNER_ATTESTED_FIELD_ACCEPTANCE_COMPLETE**로만 기록. 실제 OCI Registry/Writer/SQLite/CAD/S3/7 Migration/Restore·Rollback/Owner·QA 원본 검증 결과는 외부로 반출되지 않아 **NOT_EXTERNALLY_VERIFIED**. 내부 PASS/FAIL을 새로 만들지 않는다. S3-5 별도 릴리스 GO **NOT ISSUED**.
- **R0 독립 작업:** [Issue #154](https://github.com/planner77/layoutManager/issues/154) S3-5 Owner Signed Release Decision pure verifier/합성 Unit/Runbook/정확 15-path no-GHCR guard. 이 새 PR에 대한 CI·리뷰·병합·GHCR 결과는 실제 관측 전 `NOT VERIFIED`; 코드 작성/PR 시작이 곧 PASS가 아니다. #153/#109/#96 운영 BLOCKED, 합성 테스트는 진짜 Site Evidence가 아니다.

## #151 / PR #152 — TC-126 Renderer 전환 E2E GET 카운트 실패 및 Owner Managed 제한적 교정 (2026-10-28 KST)

- **Run/Job/HEAD:** [Run #40638297319](https://github.com/planner77/layoutManager/actions/runs/40638297319), attempt 1, HEAD `c31036cd94b81118f8064591c9b8b74c7cd5e246`, `completed/failure`. Verify [Job #122650294939](https://github.com/planner77/layoutManager/actions/runs/40638297319/job/122650294939) E2E 92개 중 **91 PASS/1 FAIL**; `tests/e2e/issues124-126-127.spec.ts:132`의 `TC-126-RECOVERY: stalled Three load has an immediate manual escape and ignores late failure` → `:150` `expect(gets).toBe(1)` **Expected 1, Received 2**. [Docker/Migration/Runtime Job #122650294554](https://github.com/planner77/layoutManager/actions/runs/40638297319/job/122650294554) **SUCCESS**. Verify Job의 Typecheck/Lint/Unit·Integration(신규 C0 포함), OCI/DXF, Production Build는 SUCCESS; **Legacy Migration E2E SKIPPED**. Playwright trace Artifact로 남아 있으나 바이너리 추적 내용을 직접 확인하지 못해 요청 2건의 완료/취소 분류는 **NOT VERIFIED**.
- **직접 원인과 의미:** 기존 Test는 `page.on('request')`로 **개시된** original content GET을 1회만 가정, 느린 Three/font 요청의 수동 abort로 최초 source GET이 취소되고 fallback이 한 번 재요청된 경우까지 실패한다. 2 GET이 둘 다 성공했다면 진짜 캐시 재사용 회귀이므로 이를 미확인 일시적 실패로 단정하지 않는다. S3-4-C0 순수 증거 검증기 코드 자체를 수정할 실패 근거는 관측되지 않았다.
- **보완 및 강화:** 기존 TC-126 E2E 테스트만 `requestfinished/requestfailed` 기록하여 pending 종료를 await; `completed === 1` 강제, `gets <= 2` 및 초과/실패 횟수 합 검증, 실패 이유가 `ERR_ABORTED/cancelled/canceled`일 때만 1개 허용. **두 성공 GET / 미종결 요청 / 일반 네트워크 오류 / 화면·Canvas·Blob 오류는 계속 FAIL**. 기타 91개 Test와 runtime Loader/Cache unchanged. 기능 Assertion 삭제·Skip/Timeout 완화 없음. 새 HEAD PR CI 실제 성공 전 **NOT VERIFIED**.
- **경로/운영 위험 수용:** 사용자 Owner Managed 조건에 따라 정확 #151 Squash/no-GHCR **15→16** 변경 경로 예외는 기존 15개 + `src/tests/e2e/issues124-126-127.spec.ts` **테스트만** 허용. GHCR Workflow Unit allow/deny/near-miss/tag 회귀 갱신. 사내 실제 OCI/Writer/DB/CAD/S3 evidence/서명/Owner Go는 여전히 `NOT RUN/NOT VERIFIED`; #142/#109/#96/#151/#153 OPEN/BLOCKED, 운영 Prisma/Auth/CAD Write/Compose/Nginx/이미지 게시 금지. Codex quota fail ≠ 승인, 새 HEAD 리뷰 및 PR CI는 별도.

## #151 S3-4-C0 — Owner Managed 비반출 준비/CI 기록 규칙 (2026-10-28 KST)

- **실패 발생 사실 없음 (본 변경 작성 기준):** 선행 B2-5 [PR #149](https://github.com/planner77/layoutManager/pull/149) Main `8ea0a3088e3dc10ae340cf5a095375f626519e1e`, [Main CI #40636610114](https://github.com/planner77/layoutManager/actions/runs/40636610114) completed SUCCESS, Release Scope Job `122644923176` SUCCESS, GHCR Build/push Job `122644968384` SKIPPED. 기존 PR #149 Run `40613450861` attempts 1/2/3 Docker TAR 실패·Run #40612247712/#40613005532 취소 기록은 아래 원장과 함께 계속 보존; 새로운 실패로 중복 계상하지 않는다.
- **사용자 현장 정책:** 현장 프로그램/합성 자료 반입 가능, 실제 EV/QA/SNAP/OCI/SQLite/CAD/S3·해시·서명·Trust Anchors/사내 URL·ID/실 로그 반출 금지. Owner Managed 현장 검토/보관 처리 요청은 절차적 승인일 뿐 실제 Writer Zero, OCI 출처, 실 Restore/Rollback, 독립 QA 또는 Owner 운영 GO를 수행했다고 주장하지 않는다. 외부에서 증거를 확인하지 못한 항목은 `NOT_VERIFIED`로 기록하며 FAIL로 추정하지 않는다.
- **새 독립 작업:** [Issue #151](https://github.com/planner77/layoutManager/issues/151) 및 [S3-4-C Runbook](../src/deploy/g7-s3/S3-4-C.md). 순수 서명 영수증 Byte·Ed25519 2 Anchor·17 체크 합성 Validator, 정상/손상/위조·만료 회귀, 정확 15-path `[G7-S3-4C0-NO-GHCR]` GHCR guard 준비. 새로운 HEAD PR CI/리뷰 결과와 실패 Run/Job/Attempt는 실제 관측되기 전 `NOT VERIFIED`. 코드 작성은 TEST PASS가 아니다.
- **차단:** 실행 결과도 `LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO`로 제한, 실제 사이트 복원/출처 입증/운영 활성화 아님. PR 병합/Main CI/GHCR 게시/Issue #142·#109·#96·#151 종료 및 Auth/CAD Write ON 자동 수행 금지.

## #142 B2-5 PR #149 — #150 Main 성공 후 재정렬/Owner Managed QA (2026-10-28 KST)

- **선행 수정 성공(실패를 성공으로 재해석하지 않음):** [PR #150](https://github.com/planner77/layoutManager/pull/150) HEAD `104efdc359675496601a522c8698b7b56aa5370d` [PR CI #40626414866](https://github.com/planner77/layoutManager/actions/runs/40626414866) Verify/Docker SUCCESS, Codex 최신 리뷰는 quota FAILED/NOT VERIFIED, 별도 Owner Managed 승인 근거로 정확 Squash Main `dec723ca6512488d7d45148762fbe1e6395790a6`. [Main CI #40631046297](https://github.com/planner77/layoutManager/actions/runs/40631046297) attempt 1 `completed/success`, Release Scope Job `122627234234` SUCCESS, GHCR Build and push Job `122627277997` SKIPPED. 실제 이미지/태그 게시 0.
- **PR #149 실패 누적 보존:** 구 HEAD `915b1509a82ad1af6d723ed42cc8a3c733fc72b5`, [Run #40613450861](https://github.com/planner77/layoutManager/actions/runs/40613450861) attempts 1/2/3 모두 Docker #67 TAR `invalid header` FAILURE; Docker Jobs `122570517278`, `122601918388`, `122607804124`. Verify Jobs 각 SUCCESS, 미실행 후속 Docker migrator/Smoke는 SKIPPED. 이전 Run #40612247712·#40613005532는 CANCELLED. 본 원장 아래 기존 시점 기록은 그대로 보존한다.
- **Main 정렬/충돌 해결:** PR #149 B2-5 계약 검증 소스·Runbook·Tests 및 정확 15-path/no-GHCR 제목 가드와 #150 CI Docker 감사 패치·정확 8-path 가드를 동시에 유지. AGENTS, FailureLedger, TestPlan, TestReport, GHCR workflow, guard Unit의 동일 위치 추가 구간을 내용 보존 방식으로 병합, 관련 나머지 9개 B2-5 파일은 그대로 유지. 새 HEAD CI 결과는 실제 관측 전 `NOT VERIFIED`.
- **Owner Managed QA/Review:** 사용자 정책에 따라 PR #149의 QA Review는 Owner Managed 경로. 과거 Codex quota 실패를 승인으로 기록하지 않는다. 최신 HEAD의 정적 범위·합성 AC·리뷰 스레드·CI 및 최종 QA 수용 여부는 별도 근거로 기록해야 하며, 이 단계는 PR CI 시작까지만 허용. PR #149 미병합, Main CI/GHCR 미실행; #142/#109/#96 OPEN/BLOCKED 및 실 운영 Writer/DB/CAD/S3/OCI/Prisma/복구·Auth/GO NOT RUN.

## #142 / PR #149 첫 CI Docker TAR layer audit 실패와 교정 분리 (2026-10-28 KST)

- **첫 Run 최종 상태:** #40612247712는 후속 HEAD push 후 completed/**CANCELLED**. Verify Job 122566350524는 Typecheck/Lint/Unit·Integration/Production Build SUCCESS였으나 Chromium E2E CANCELLED(성공 아님). Docker Job 122566350868은 #67 layer inventory에서 독립 실패. 정확한 Run/Job/HEAD와 다음 CI를 분리해 추적.

- 관측: HEAD 12eac574b5e940dbaaea53e292c463b6e191283e, PR CI #40612247712 attempt 1의 Docker Job 122566350868에서 기존 Issue #67 단계 Verify web layer SHA, native and transition-only size saving 실패. src/scripts/audit_standalone_layers.py:29 nested docker-save layer tarfile.open(fileobj=stream,mode=r|) 중 Python 3.14 tarfile.ReadError: invalid header, exit 1. Docker baseline/phase1 Build 자체의 명시적 실패 및 B2-5 TypeScript 오류로 추정하거나 기존 성공으로 덮지 않는다. Verify Job 122566350524 별도 실행 중이며 최종 결과 관측 전 미확인.
- 범위: B2-5는 pure supplied-evidence packet 코드·Unit·Runbook·문서 15-path 예외만 허용, Issue #67 기존 운영 Docker layer 검사 스크립트, Dockerfile, PR CI Workflow 수정 금지. 기존 B2-4 PR #147 Verify+Docker SUCCESS와 달리 이번 runner에서 Docker 저장 Layer TAR가 읽히지 않은 원인은 현재 단일 실행만으로 일시적 아카이브 문제인지 이미지/runner 포맷 변화인지 확정할 수 없음.
- 대응: B2-5 합성 Packet의 Source Epoch·Change Request 참조를 Binding/각 PASS reviewer ledger에 추가해 잘못된 Epoch/Change ID도 BLOCKED 처리하고 신규 HEAD PR CI를 별도 재시작. 기존 실패 Run/Job/attempt/HEAD 보존. 새 동일 오류 재발 시 기존 Issue #67 감사 스크립트/runner Docker 저장 포맷을 선행 독립 이슈로 조사해야 하며 실패 단정을 완화하거나 경로 가드를 우회하지 않는다.
- 실 Registry/Writer/Snapshot/DB/CAD/S3/Migration/Restore/Rollback·GHCR/Owner GO는 여전히 NOT RUN. #142/#109/#96 OPEN/BLOCKED.

## #142 B2-4 Owner Managed merge + B2-5 합성 증거 검증 착수 (2026-10-28 KST)

- 선행 실패 보존: PR #147 HEAD 5d7055c8 CI #40579106887 Verify Job 122453396943의 TS2322(2건) 실패, Docker Job 성공과 나머지 테스트 SKIPPED를 삭제/성공으로 재해석하지 않는다. 수정 HEAD a59d18b10a103fe863752d460dff216b62b5fe43 PR CI #40604028179 attempt 1 Verify 및 Docker Job 모두 SUCCESS.
- 리뷰 예외 정확 기록: 최신 HEAD Codex 리뷰는 사용량 한도 초과로 FAILED/NOT VERIFIED, P1/P2 통과라고 기록하지 않음. 사용자 Owner Managed 리뷰 경로 승인, 미해결 리뷰 스레드 0, behind 0, 정확 15개 경로를 확인하고 별도 Owner Managed 결정을 PR #147에 기록.
- Squash Main 81fd00ba9a7463f0b1817d83ca78fe9cc31f5b4d, 제목 #142 | S3-4-B2-4 Disposable rollback replay [G7-S3-4B2-4-NO-GHCR]. Main CI #40610619799 attempt 1 completed SUCCESS; release-scope Job 122560987574 SUCCESS, GHCR Job 122561027937 SKIPPED. GHCR 이미지/태그 게시 0.
- 새 B2-5 브랜치 최신 Main에서 독립 생성: 합성 S3-4-A readiness와 별도 미신뢰 QA Ledger의 EV/QA/SNAP/17 체크/4 OCI digest 주장 정합성 검사, 실패·누락·중복·시간 순서 음성 회귀, 정확 15-path GHCR 미게시 가드. 신규 B2-5 HEAD CI/리뷰 결과는 실제 확인 전 NOT VERIFIED이며 실 Site PASS·Owner GO가 아니다.
- 운영 금지: 실제 Registry/Writer/SQLite/CAD/S3, online backup, 실 Migration/Restore/Rollback, 현장 QA 인증, Auth/CAD Write, GHCR/Compose/Nginx, S3-4-C/S3-5 GO 모두 NOT RUN. #142/#109/#96 OPEN/BLOCKED 유지.

## #142 / PR #149 — #67 TAR 파싱 연속 실패 Attempts 1·2·3 및 독립 보완 (2026-10-28 KST)

- **동일 HEAD 세 차례 실패:** [Run 40613450861](https://github.com/planner77/layoutManager/actions/runs/40613450861) `915b1509a82ad1af6d723ed42cc8a3c733fc72b5` attempt 1 `completed/failure`: Docker Job [122570517278](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122570517278) 실패. attempt 2 `completed/failure`: Docker Job [122601918388](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122601918388) 실패. attempt 3 `completed/failure`: Docker Job [122607804124](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122607804124) 실패. 모두 `Verify web layer SHA, native and transition-only size saving (#67)`에서 `src/scripts/audit_standalone_layers.py:29`의 내부 TAR `tarfile.open(fileobj=stream,mode="r|")` → Python 3.14 `tarfile.ReadError: invalid header` (exit 1). 최초 실패/재실행은 서로 다른 Run이 아닌 **한 Run의 attempt 이력**으로 보존.
- **성공/미실행 분리:** 세 Attempt Verify Job(Attempt 1 [122570517048](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122570517048), Attempt 2 [122601920242](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122601920242), Attempt 3 [122607806245](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122607806245))은 Typecheck/Lint/Unit·Integration/Production Build/E2E SUCCESS. Docker baseline/phase1/runtime/migrator Build 및 크기 측정 성공; 레이어 SHA/NATIVE/중복 실 감사 자체는 실패로 `NOT VERIFIED`이고 그 이후 migrator 검사/Compose/Smoke는 SKIPPED, 성공으로 간주하지 않음. 이전 취소 Run 40612247712/40613005532는 CANCELLED로 보존.
- **환경 증거:** 과거 B2-4 Run #40604028179 Docker 감사 SUCCESS Runner Ubuntu 24.04/Docker 28.0.4/Buildx 0.38.0. 실패 Attempt 1·2 Runner Ubuntu 26.04/Docker 29.4.2/Buildx 0.38.1; Attempt 3 Ubuntu 26.04/Docker 29.4.2/Buildx 0.38.0. Buildx 단독 버전 회귀 아님. Docker image storage containerd/overlayfs 전환 및 compression 원인은 유력하지만 실제 layer header를 직접 수집하지 않았으므로 미확정.
- **코드 결함/보완:** Python `tarfile.open(... mode="r|")`는 비압축 TAR 전용. 새 Docker-exported nested `layer.tar`는 압축 가능하므로 `r|*`로 변경해 지원 압축 자동 감지; 무효/미지원 Layer는 예외로 fail-closed. 합성 Outer TAR + raw/gzip/bz2/xz/zstd(가용시) Nested TAR의 Member SHA/중복 검사와 무효/압축 무효 거부 회귀 추가. `compare_inventories`, `validate_image_size`, Native `.node` 검사는 완화·생략하지 않음. 실제 현재 Docker Layer 압축형식 및 새 CI PASS는 새 실행 증거 전 NOT VERIFIED.
- **격리 정책:** PR #149는 정확 15-path `[G7-S3-4B2-5-NO-GHCR]` 조건 유지, CI 스크립트/Workflow를 이 PR에 혼입하지 않음. Main에서 별도 지원 PR로 8-path/정확 `[CI-142-LAYER-NO-GHCR]` 미게시 조건을 구현하고, 미승인 자동 Merge/GHCR/Main CI 수행하지 않음. 지원 PR CI 성공 후 분리 병합 게이트·PR #149 Main 재정렬 및 신규 CI 필요. #142/#109/#96 OPEN/BLOCKED; 운영 Writer/DB/CAD/S3/OCI/Prisma/Auth/Restore·Rollback·Owner GO NOT RUN.

## #142 B2-4 PR #147 — TypeScript Buffer TS2322 두 건 + #82 Main 정렬 (2026-10-28 KST)

- **관측된 PR CI 실패:** [Run #40579106887](https://github.com/planner77/layoutManager/actions/runs/40579106887), attempt 1, HEAD `5d7055c8c72d800005509557ee137c76a9d87aad`, `completed/failure`. Verify [Job #122453396943](https://github.com/planner77/layoutManager/actions/runs/40579106887/job/122453396943) `tsc --noEmit`에서 `src/tests/integration/g7-s3-4-b2-4.test.ts(93,5)`, `(96,5)` **TS2322**: `Buffer<ArrayBufferLike>` cannot be assigned to inferred `Buffer<ArrayBuffer>`; `SharedArrayBuffer`는 `ArrayBuffer`의 resize/transfer 메서드를 제공하지 않음. 타입 검사가 exit code 2이므로 ESLint/Unit·Integration/Build/Chromium E2E/Legacy Migration 등 후속 Step은 **SKIPPED/미검증**.
- **독립 Docker Job:** [Job #122453396404](https://github.com/planner77/layoutManager/actions/runs/40579106887/job/122453396404) **SUCCESS** (Docker size/migration/runtime smoke). Docker 결과를 Verify Typecheck 성공으로 해석하지 않음. 이 실행에서 관측된 검증 실패 원인은 위 **동일 타입 불일치 한 종류(2곳)**.
- **근본 원인과 보완:** `Buffer.alloc(0)`로 초기화한 `baseline/candidate`의 추론 타입은 `Buffer<ArrayBuffer>`이나 `SqliteDb.serialize(): Buffer` 반환 타입은 기본 `Buffer<ArrayBufferLike>`. `let baseline:Buffer=Buffer.alloc(0),candidate:Buffer=Buffer.alloc(0);`로 타입 범위를 일치시킴. 실제 SQLite 직렬화 바이트 변경·타입 단언/강제 캐스트·불변식 완화 없음. 타입 수정 HEAD의 새로운 검사 성패는 재실행 후 관측 전 `NOT VERIFIED`.
- **Main 정렬/문서 충돌:** #82 M1 Squash Main `dbe55c8719e9a9e3aee79fb83e32ec6ce3fc1f8d` (선행 #142 B2-3 `7b784c2d62c0872909361e3514d437247d7ab662`) 추가분인 메모 WCS UI/테스트, v0.43.0, #82 CI 실패 원장·문서와 #142 B2-4 관련 내용 **양쪽 모두 보존**. GHCR 분기 15-path no-publish guard 변경 유지, runtime/active Prisma/운영 데이터 접근 변경 없음.
- **리뷰/다음 게이트:** 구 HEAD Codex 리뷰 completed/findings 0, 이전 미해결 Thread 0. 새 HEAD 재리뷰/behind=0/mergeable·새 PR CI는 별도 확인. 새 CI는 시작만 수행하고 모니터링하지 않으며 병합/Main CI/GHCR 미실행; #142/#109/#96 OPEN/BLOCKED, 현장 Writer/SNAP/OCI 신뢰·Restore/Rollback 및 Owner GO `NOT RUN`.

## #142 B2-4 — 선행 B2-3 PR/Main CI 성공, 신규 합성 구현 검증 전 (2026-10-28 KST)

- **선행 CI 성공·실패 아님:** [PR #146](https://github.com/planner77/layoutManager/pull/146) HEAD `5c69066f26361d473f3f02709f3773970b73e0b4` [PR CI #40571459447](https://github.com/planner77/layoutManager/actions/runs/40571459447) attempt 1 `completed/success` (Verify Job 122426459824 + Docker Job 122426459168 SUCCESS), 최신 Codex 리뷰 findings 0/unresolved 0, exact `#142 | S3-4-B2-3 Isolated seven migration rehearsal [G7-S3-4B2-3-NO-GHCR]` Squash Main `7b784c2d62c0872909361e3514d437247d7ab662`. [Main CI #40575203195](https://github.com/planner77/layoutManager/actions/runs/40575203195), attempt 1 `completed/success`, release-scope Job 122439659423 SUCCESS, GHCR Build/push Job 122439731551 SKIPPED. 종전 #146 TS2769/TS2345 실패·2개 P2 교정은 하단 원장 그대로 보존.
- **신규 B2-4 범위(실행 결과 아님):** B2-1 로컬 OCI 4 Role digest/Source/Schema/rollback pair 검사와 B2-3 메모리 후보 7 Migration CAD·Auth/Audit 검사를 결합한 supplied-buffer replay. 하나의 합성 SNAP/Epoch, S3 Marker byte/version claim, Source·Candidate·Rollback Local/S3 export Byte 및 Rollback SQLite 원본 바이트 일치 검증, Version/Current/FK/SHA·이미지 역할/Schema·Rollback compatibility claims 불일치·복원 중단/손상 등 음성 회귀 작성. 최신 HEAD PR CI/Typecheck/Vitest/Build/Review 결과는 **관측 전 NOT VERIFIED**. Cancelled Job 및 신규 실패 발생 시 Run/Job/Attempt/HEAD·원인/수정/시도 이력 누적 유지.
- **금지 및 신뢰 경계:** 동일한 합성 라벨/Byte 상태는 원본 Writer Quiescence, 진짜 Source Snapshot, 사내 OCI Registry·Signature·이미지 실행·롤백 호환·실 복구 측정/RTO/RPO를 증명하지 않는다. `registryVerified/provenanceVerified/rollbackCompatible/sameSnapshotRestored/restoreExecuted/rollbackExecuted/operationalGo/runtimeActivated=false`. 실제 운영 SQLite/CAD/S3/Writer 정지·실 Restore/Rollback·active Prisma/배포·Auth/CAD Write/GHCR 및 B2-5 Owner GO `NOT RUN`; #142/#109/#96 OPEN/BLOCKED. 이번 지시 PR CI 시작까지만, 모니터링·병합 없음.

## #82 PR #111 — PR CI 40583276569 모바일 Drawer Race 실패 및 보완 (2026-10-28 KST)

- **관측 실패:** [PR CI #40583276569](https://github.com/planner77/layoutManager/actions/runs/40583276569), attempt 1, HEAD `53b6909caaad4721c9050a6d26ec1da940176b05`: Verify [Job 122468046935](https://github.com/planner77/layoutManager/actions/runs/40583276569/job/122468046935) Chromium E2E 92건 중 **91 PASS/1 FAIL**, Legacy Migration E2E SKIPPED, Typecheck/Lint/Unit·Integration/OCI/DXF benchmark/Build SUCCESS. Docker/Migration/Runtime Smoke [Job 122468046482](https://github.com/planner77/layoutManager/actions/runs/40583276569/job/122468046482) SUCCESS. [Trace Artifact #12770224877](https://github.com/planner77/layoutManager/actions/runs/40583276569/artifacts/12770224877).
- **실패 Step/로그:** Chromium E2E `TC-M1-E2E-001` (`issue82-cad-memo.spec.ts:39`, 실제 `:72`). `locator.click: Test timeout of 30000ms exceeded`, `[data-viewer-group="view"]` click에서 `cad-viewer-shell intercepts pointer events`. Trace 외 `test-results/issue82-cad-memo-TC-M1-E2E-10073-creen-and-text-only-changes/error-context.md` 제공. E2E Artifact upload SUCCESS; Legacy Migration E2E는 실패 후 **SKIPPED** (성공으로 계상하지 않음). 테스트 음성 Fixture의 의도된 API 4xx 출력은 실패 원인 아님.
- **직접 원인:** `TC-M1-E2E-001` `src/tests/e2e/issue82-cad-memo.spec.ts:72`에서 viewport 390px 전환 직후 `clickViewerCommand(page,'view','화면 맞춤')`이 `viewer-menu-helper.ts:25`의 trigger click에서 30초 timeout. Playwright는 상단 `보기` 버튼 자체가 visible/enabled/stable이지만 **`cad-viewer-shell`이 pointer events를 intercept**했다고 보고. #127 모바일 Drawer의 modal 전환 시 `header.inert=true`는 정상; helper의 일회성 `isVisible()` 판정이 React `matchMedia`의 비동기 state 갱신보다 먼저 실행된 테스트 동기화 race. WCS/원본/Renderer/운영 장애의 증거는 아님.
- **조치·예방:** E2E만 수정: 390px 설정 이후 `viewer-tools-dock[role=dialog]` 출현·`header.inert=true` 확인 → 모달의 실제 `도구 닫기` 버튼 클릭 → Drawer 사라짐·`header.inert=false` 확인 → `보기 > 화면 맞춤` 실행. 이후 PIN WCS(10,20)→명시적 (13,15) 이동과 텍스트 편집/좌표 불변을 그대로 검증. `force click` 및 단순 Timeout 증가 금지. Viewer/Adapter/CAD·DB·API·Prisma/G7 및 package/lock 0.43.0은 변경하지 않음. #138 Movable Panel은 별도 미구현. 수정 HEAD PR CI PASS는 새 Run 완료 전 **NOT VERIFIED**, GHCR/병합/Main CI/Issue 종료·실 CAD/GPU 현장 시험은 미실행.
- **이력/게이트:** 과거 E2E 실패 Run 40512645193/40198344153, ESLint 40196496297 및 0.43.0 변경 전 성공 40580691233은 아래 누적 원장을 삭제하지 않고 각각 구분. 기존 리뷰 2건 Resolved(미해결 0), Main 7b784c2d 대비 behind=0/mergeable=true는 보완 전 관측; 새 HEAD CI·리뷰/충돌 확인 후에만 Squash 병합. #83 Memo 서버 영속, 운영 #109/#96 G7 GO는 이번 작업 제외.


## Issue #82 / PR #111 — 새 MINOR v0.43.0 GHCR Pair 사전조건 / 실패 없음 (2026-10-28 KST)

- **리스크, CI 실패와 구분:** 기존 `v0.42.1` annotated tag는 이미 발행되어 있으며 Issue #57 코드의 `0.42.1` App/lock 버전으로 #82 런타임 변경을 Squash Main하면, `.github/workflows/docker-publish.yml`의 `create release tag`는 existing tag를 재사용하고 기존 App/Migrator pair가 이미 존재할 경우 GHCR 빌드를 **SKIPPED** 처리할 수 있다. 사용자 요청인 **신규 #82 GHCR 게시를 보장하지 못하는 버전/릴리스 게이트 위험**이지 새 CI 실패나 GHCR 게시 실패를 관측한 것은 아니다.
- **조치:** 신규 WCS 메모 UI이므로 AGENTS 정책("신규 기능 MINOR")에 따라 package/version 및 lock 루트 두 군데를 `0.43.0`으로 정렬. 기존 `v0.42.1`의 태그/이미지/OCI digest 불변, GHCR workflow/운영 DB/Source·S3 변경 없음. 이전 PR CI [40580691233](https://github.com/planner77/layoutManager/actions/runs/40580691233), HEAD `4a4a8ffbb85340efef90b88546cc64815fdd4aa3`의 Verify [122458944225](https://github.com/planner77/layoutManager/actions/runs/40580691233/job/122458944225)/Docker [122458943642](https://github.com/planner77/layoutManager/actions/runs/40580691233/job/122458943642) **SUCCESS**, 아래 Run 40512645193 등 과거 실패 모두 보존.
- **예방 및 합격 조건:** 새 package+lock root 버전 일치, 새 HEAD Typecheck/Lint/Unit/Chromium/Legacy/Docker CI 실제 SUCCESS, review unresolved 0, behind=0/mergeable clean, 정확 Squash 제목. Main CI release-scope는 runtime path 수정 인지 → GHCR App/Migrator candidate 쌍 registry digest verified 후 version/latest 승격. 태그 존재 자체·CI START를 게시 합격으로 오판 금지; Main CI 시작 이후 최종 Run/Job/registry manifest 검증 필요. #83 Memo 서버 영속·운영 G7 OFF.

## Issue #82 / PR #111 — 최신 Main #142 S3-4-B2-3 정렬·검증 인계 (2026-10-28 KST)

- **정렬 전 실제 증거:** PR #111 HEAD `5a1f0697cd68d75a46bcc6335ecbe8d94559892b`의 [PR CI Run 40571261780](https://github.com/planner77/layoutManager/actions/runs/40571261780)은 attempt=1, completed/success, Verify [Job 122425762004](https://github.com/planner77/layoutManager/actions/runs/40571261780/job/122425762004) 및 Docker/Migration/Smoke [Job 122425762291](https://github.com/planner77/layoutManager/actions/runs/40571261780/job/122425762291) **모두 성공**. 이는 아래 [Run 40512645193](https://github.com/planner77/layoutManager/actions/runs/40512645193)의 91/92 E2E FAIL 및 앞선 ESLint/E2E 실패 이력을 지우거나, 새 정렬 HEAD의 성공을 의미하지 않는다.
- **새 Main 변경:** 전 기준 `d2b77dd6535503f2d980ac563cc195cc8b4c128e` → 최신 `7b784c2d62c0872909361e3514d437247d7ab662` (Issue #142 PR #146, 정확 no-GHCR 범위 `S3-4-B2-3`). 정렬 전 `behind=1`, PR `mergeable=true`; 변경 15개 경로. Main의 7개 공통 문서 `AGENTS.md`, Architecture, Decisions, FailureLedger, Requirements, TestPlan, TestReport는 Main 내용과 Issue #82 이력 **모두 보존**. 기존 Issue #82의 임시 WCS 메모 및 UI Source-Selection 계약, M1 E2E/Unit을 덮어쓰지 않는다.
- **전파 필수:** Main의 `.github/workflows/docker-publish.yml` 및 S3-4-B2-3 Runbook/Verifier/Integration Unit/GHCR Guard, Database/Operation/Issue109 문서 **원문 보존**. #142 Audit AFTER RAISE(FAIL) P2와 Local locator fail-closed는 격리 검증 정책이며 실제 사이트 Auth/Writer·운영 DB/Prisma/S3/현장 복구·GHCR 게시·Owner GO를 활성화하지 않는다. 누락되면 병합 게이트 차단.
- **리뷰/CI:** 정렬 직전 [PR #111](https://github.com/planner77/layoutManager/pull/111)의 Codex P1/P2 2건 모두 Resolved, unresolved=0; 커밋 반영 후 `main` behind/mergeable 및 리뷰 재확인 필수. 새 `pull_request.synchronize` PR CI 시작만 확인하고 결과 모니터링은 생략. 새 HEAD의 PR CI/최신 리뷰 완료는 별도 검증 전 **NOT VERIFIED**. 사용자 요청 범위에 PR Merge/Main CI/GHCR/Issue 종료·실 CAD/GPU 시험은 포함되지 않는다.

## Issue #142 / PR #146 — 성공한 PR CI와 별개 Codex Audit AFTER FAIL P2 보완 (2026-10-28 KST)

- **기존 CI 성공(실패 아님):** [PR CI #40513422160](https://github.com/planner77/layoutManager/actions/runs/40513422160), attempt=1, HEAD `adf0e1aba89a9a5a3b8d7c33b85f5675f4201b71`, `completed/success`. Verify Typecheck/Lint/Unit/Build/E2E [Job 122220852265](https://github.com/planner77/layoutManager/actions/runs/40513422160/job/122220852265) SUCCESS, Docker/Migration/Smoke [Job 122220852790](https://github.com/planner77/layoutManager/actions/runs/40513422160/job/122220852790) SUCCESS. 과거 PR CI #40511480917 TypeScript TS2769/TS2345 양쪽 Job 실패·조치 근거는 아래 원장에 그대로 보존.
- **P2 리뷰 결함, CI 장애 아님:** [Codex #4389353517](https://github.com/planner77/layoutManager/pull/146#discussion_r4389353517) – `auditMutationProbe`가 SQLite `AFTER UPDATE/DELETE` Trigger에서 `RAISE(FAIL)` 예외만 감지해 변경이 실제로 유지된 Audit 행을 정상 보존으로 오판. SQLite `RAISE(FAIL)`은 Statement Error를 발생시켜도 선행 UPDATE/DELETE 효과를 되돌리지 않을 수 있음. 그러면 `auditAppendOnlyChecked:true`가 허위 양성.
- **수정/재발방지:** 후보 SQLite는 이미 제공된 Bytes로 별도 메모리 Clone을 만들기 때문에 여기서만 합성 Audit Row를 INSERT하고 `ORDER BY id` 전체 AuditEvent Snapshot을 캡처. UPDATE 예외 **및 전체 내용 불변** 확인 → DELETE 예외 **및 전체 내용 불변** 확인. 어느 한 시점이라도 변경되면 `AUDIT_NOT_APPEND_ONLY/BLOCKED`, `auditAppendOnlyChecked:false`. BEFORE 정상 Trigger는 계속 통과; AFTER UPDATE+FAIL 및 AFTER DELETE+FAIL 각각 악성 Trigger를 새 합성 음성 회귀에 추가. 실제 현장 데이터/자격증명 사용 없음.
- **새 HEAD 게이트:** 코드를 작성/커밋한 사실과 최신 HEAD PR CI Typecheck/Lint/Unit/Integration/Docker/Build/E2E 성공을 혼동하지 않음. 새 HEAD 성공은 **관측 전 NOT VERIFIED**; 최신 Codex 재리뷰/스레드·Main behind=0/충돌은 별도 재확인. 본 요청은 PR CI 재시작까지만, 모니터링·병합·GHCR 게시 없음. 현장 Snapshot/운영 Writer/DB/CAD/S3/운영 Prisma Migration/Restore/Rollback/Owner GO `NOT RUN`, #142/#109/#96 OPEN/BLOCKED.

## Issue #142 / PR #146 — CI TS2769/TS2345 공통 원인 + 별도 Codex P2 (2026-10-27 KST)

- **관측 CI 실패:** [PR CI Run #40511480917](https://github.com/planner77/layoutManager/actions/runs/40511480917), HEAD `bafe74cceba07a789a328c2453ccd785f19b4597`, attempt=1, `completed/failure`. Verify Job [122214239302](https://github.com/planner77/layoutManager/actions/runs/40511480917/job/122214239302): `npm run typecheck` → `src/server/g7-operational/s3-4-b2-3.ts:62` **TS2769** (`Object.keys`에 `object|null`), `:63` **TS2345** (`Object.hasOwn`에 `object|null`), exit 2. ESLint·Unit/Integration·Build·E2E는 **SKIPPED/미검증**.
- **Docker Job 별도 실패, 동일 근본 원인:** Docker/Migration/Smoke [Job 122214238943](https://github.com/planner77/layoutManager/actions/runs/40511480917/job/122214238943) `Build pre-change baseline (same source, original Dockerfile)` 에서 Next.js Typecheck 동일 `s3-4-b2-3.ts:62` Type Error로 Docker buildx exit 1. Build phase1/Size/Migration/Smoke 후속 단계 모두 **SKIPPED**. Dockerfile/Buildx/OCI의 독립 결함 또는 외부 Registry 실패가 아님. npm audit 의존성 경고도 직접 실패 원인 아님.
- **공통 원인/최소 수정:** 신규 `exact(v:unknown)`에서 `Boolean(v)`가 TypeScript `null` 방어·타입 내로잉을 보장하지 않는다. `v!==null && typeof v==='object'`로 타입 좁힘을 명시해 `Object.keys/Object.hasOwn` 안전화. 기존 B2-3 운영/보안 경계 및 15-file no-GHCR allowlist 불변.
- **CI와 독립된 리뷰 품질 지적:** 최신 Codex [P2 #4389209602](https://github.com/planner77/layoutManager/pull/146#discussion_r4389209602)는 Local CAD `storage_path`가 잘못된 DB Location/Version ID를 참조해도, before/after DB와 asset이 동일한 문자열이면 통과하는 위양성. Local path 정규식 `(locationUuid)/(versionUuid)/original.ext` 그룹을 실제 `CadFileVersion.location_id/id`와 검증하여 `LOCAL_LOCATOR_OWNER_INVALID/BLOCKED`. 정상 S3 Object UUID는 DB Version UUID와 독립 유지. 양쪽 합성 Snapshot에 똑같은 잘못된 Local Location/Version path를 저장한 음성 회귀 추가.
- **누적 실패 관리:** 이전 PR #145 CI 성공/리뷰 P2 교정 및 #146 최초 실패의 근거 모두 유지. 신규 HEAD Typecheck/ESLint/Vitest/Prisma CLI/Docker/E2E/PR CI는 실행 후 결과 관측 전 `NOT VERIFIED`, 최신 Codex Review는 별도. Main behind=0/mergeable=true는 보완 전 관측이며 push 뒤 재확인. 이번 작업은 새 PR CI 시작까지만, CI 모니터링/병합/Main CI/GHCR 게시는 하지 않음.
- **운영 NO-GO:** 원본 DB/CAD/S3·writer freeze·온라인 Snapshot·운영 Prisma Migration·Auth/CAD Write 활성화·Compose/Nginx/OCI/실 복원·Rollback·Owner GO `NOT RUN`; #142/#109/#96 OPEN/BLOCKED.

## #142 B2-3 — B2-2B Main CI 완료 인계 / 새 합성 구현 검증 전 (2026-10-27 KST)

- **선행 성공·실패 아님:** [PR #145](https://github.com/planner77/layoutManager/pull/145) HEAD `5fc2e45da56993c4498c6db9dcd9112a6edacbc4`, [PR CI #40505100118](https://github.com/planner77/layoutManager/actions/runs/40505100118) SUCCESS 및 최신 Codex completed/findings 0/미해결 0; exact no-GHCR Squash Main `d2b77dd6535503f2d980ac563cc195cc8b4c128e`. [Main CI #40506886341](https://github.com/planner77/layoutManager/actions/runs/40506886341) completed/success, release-scope Job 122198352827 SUCCESS, GHCR Job 122198431912 SKIPPED.
- **이번 구현·계획:** B2-3 후보 7 Migration guarded disposable Prisma CLI·seeded 합성 CAD 6→7 SQL 데이터 보존 검증, QuickCheck/FK/Current·Version/Local/S3 SHA 및 Auth/Audit·Fault Injection과 정확 B2-3 no-GHCR allowlist 테스트·문서 추가. 새 HEAD 결과는 CI Run/Job/Attempt 실제 확인 전 `NOT VERIFIED`; 테스트 작성만으로 실행 PASS/현장 복구 성공 주장 금지. CI 실패 발생 시 수정·누적 실패 원장 기록 후 재시작해야 함.
- **지속 차단:** 운영 데이터/Writer freeze/SQLite Online Backup·사내 CAD/S3 원본 Versioned GET, active Prisma/배포 Auth/Write/Nginx/Compose/GHCR, 실 7 Migration/Restore/Rollback/Owner GO·이슈 종료 전부 `NOT RUN/OFF`. #142/#109/#96 OPEN/BLOCKED.

## Issue #82 / PR #111 — 2026-10-27 Main 재정렬·리뷰/충돌 해결 기록 (KST)

- **기준:** 기능 HEAD `e85ffc10ff446288ca37ba61a59df7d766d77b8f`; 선행 Main `d2b77dd6535503f2d980ac563cc195cc8b4c128e` (App/lock v0.42.1). #127 그룹 메뉴/Drawer, #138 ViewerPanelPolicy, #126 Three DXF 기본 및 #142 G7 격리 변경을 보존하고 M1 브라우저 세션 메모만 이관. 0.41.0으로 다운그레이드하지 않음.
- **기존 실패 누적 보존:** Run [40196496297](https://github.com/planner77/layoutManager/actions/runs/40196496297) ESLint 2 errors(나머지 단계 SKIPPED), Run [40198344153](https://github.com/planner77/layoutManager/actions/runs/40198344153) Chromium E2E 77 PASS/1 FAIL(Verify FAILURE, 나머지 성공/스킵은 아래 기존 항목 참조); 최종 옛 HEAD `e85ffc10` / Run [40200471591](https://github.com/planner77/layoutManager/actions/runs/40200471591)는 과거 실행이므로 **새 통합 HEAD 성공을 증명하지 않음**.
- **리뷰:** Codex P1 [4370961641](https://github.com/planner77/layoutManager/pull/111#discussion_r4370961641), P2 [4370961642](https://github.com/planner77/layoutManager/pull/111#discussion_r4370961642)은 답변과 수정 검토 후 Resolved(2/2), 재정렬 전 미해결 0건. 이 결함들은 CI 실패가 아닌 코드 리뷰 지적이며 원인/회귀 증거를 구분. 새로운 HEAD 리뷰 승인으로 오인하지 않음.
- **통합 결의:** 겹친 Markdown에는 최신 Main 기록과 #82 기록을 모두 보존하고, Viewer 구 UI의 독립 메모 버튼 대신 `작업 > 메모 추가/편집` 및 `viewer-tools-dock`으로 재연결. 메뉴/Drawer의 Esc·포커스·모바일 우선순위, Source/Generated 상호배타, WCS anchor 불변을 분리 테스트. 메모는 임시 세션, #83 영속/API/Auth 활성화 **0**, GHCR/운영 Migration/실 CAD·S3/Issue 종료 **0**.
- **새 PR CI:** HEAD 갱신의 `pull_request.synchronize`로 실행 예정. 결과 모니터링 요청 없음; 실제 run ID/최종 성공 여부는 별도 확인 전 `NOT VERIFIED`. 실 현장 수용/GPU/DWG/M2+ 영속 기능 역시 `NOT RUN`.

## Issue #82 / PR #111 — #127 Viewer 그룹 메뉴 E2E 1건 실패 / 보완 (2026-10-28 KST)

- **원본 Run·검증 SHA:** [PR CI #40512645193](https://github.com/planner77/layoutManager/actions/runs/40512645193), attempt **1**, `completed/failure`, HEAD `89a72018403ebfca32e382e0f04511a95d1946ae` (Main d2b77dd 기준, App 0.42.1).
- **실패 Job/Step:** [Verify Job 122218176649](https://github.com/planner77/layoutManager/actions/runs/40512645193/job/122218176649) **E2E 테스트 Step FAIL**: 92 tests / 91 PASS / 1 FAIL. `src/tests/e2e/issue38-app-shell.spec.ts:41:60` / `TC-U1-E2E-001: three-dxf-viewer CSS immersive/menu/resize/escape and dock state`; Playwright `toHaveAttribute('aria-disabled','false')` expected `"false"`, received missing attribute (`null` / empty display). **실패 Trace Artifact [12739315008](https://github.com/planner77/layoutManager/actions/runs/40512645193/artifacts/12739315008)**. Error context: `test-results/issue38-app-shell-TC-U1-E2-9a012-esize-escape-and-dock-state/error-context.md`.
- **동일 Run 성공/미실행 분리:** Verify TypeScript·ESLint·Unit/Integration·OCI Unit·DXF synthetic source benchmark·Production Build 및 Chromium 설치 **SUCCESS**. Legacy Migration E2E는 실패 후 **SKIPPED**(PASS 아님), E2E Artifact 업로드 SUCCESS. [Docker Job 122218177009](https://github.com/planner77/layoutManager/actions/runs/40512645193/job/122218177009)은 이미지 빌드/크기·Migration·Runtime Smoke **SUCCESS**. 테스트 fixture의 의도된 API 4xx 로그는 실패 원인 아님.
- **원인 확인:** #127 그룹 메뉴의 `viewer-command-menu.tsx`는 활성 버튼에 `aria-disabled={false || undefined}`를 전달해 속성을 생략하도록 설계. 실제 three-dxf-viewer M1은 enabled이고 Source Handle 없는 DXF에서도 정상 지원. 기존 U1 테스트만 '활성 상태에서 명시적 aria-disabled=false attribute가 존재한다'고 잘못 가정해 오탐. 제품의 disabled/Source/G7 정책 결함 아님.
- **수정:** `src/tests/e2e/issue38-app-shell.spec.ts`의 해당 assertion을 `three-dxf-viewer -> toBeEnabled()`, `dxf-viewer -> toBeDisabled() + aria-disabled=true`로 변경. DWG 후속 검사/Canvas 수명주기·DXF load·Source fail-closed/Memo WCS E2E는 그대로. 앱 코드·권한·영속화/API/DB/Prisma·.env·GHCR/Release 변화 없음. `AGENTS.md`, `out/TestPlan.md`, `out/TestReport.md`, `out/Issue82.md`와 동기화.
- **재검증/병합 경계:** 브랜치 메인 정렬 확인 시 behind=0/mergeable=true, 기존 Codex P1/P2 2개 모두 Resolved·미해결 0. 수정 HEAD의 PR CI는 자동 synchronize 시작 후 run/결과를 별도 확인해야 하며 이번 기록 시 PASS는 **NOT VERIFIED**; 실 CAD/GPU, #83 Memo 서버영속, 운영 G7/GHCR/Issue #82 종료는 수행하지 않음.

## Issue #142 / PR #145 — Codex P2 중복 S3 Locator 제약 누락 보완 (2026-10-27 KST)

- **관측된 선행 CI 성공, 실패 아님:** [PR CI #40502175608](https://github.com/planner77/layoutManager/actions/runs/40502175608), attempt=1, HEAD `cddd2f20dc45c1f3d7edc42e15f0b914016a078d`, `completed/success`. Verify Typecheck/Lint/Test/Build/E2E Job 122182315944 SUCCESS, Docker/Migration/Smoke Job 122182315606 SUCCESS. 실제 Unit Fail이 아닌 **Codex P2**가 이후 발견되었음.
- **검증되지 않았던 불변식:** [Codex P2 #4388575128](https://github.com/planner77/layoutManager/pull/145#discussion_r4388575128), 원래 B2-2B는 개별 `key`/`dbVersionId` 중복만 검사했으므로, 서로 다른 Version이 동일 `s3ObjectLocator`와 바이트/`storageVersionId`를 공유해도 `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF`를 반환 가능. 이는 [Prisma `CadFileVersion.storagePath @unique("uq_storage_path")`](https://github.com/planner77/layoutManager/blob/main/src/prisma/schema.prisma#L86)과 불일치. 이전 P2 독립 S3 객체 UUID 수정은 유지.
- **보완·회귀:** 전체 S3 Version mapping의 Locator를 별도 `Set<string>`으로 추적해 중복을 `DUPLICATE_S3_LOCATOR/BLOCKED`로 fail-closed, 기존 S3 UUID≠DB UUID 허용과 Local locator 계약 보존. 정상 3 Version/서로 다른 S3 locator 합성 패킷→긍정, **Unique Index를 의도적으로 생략한** 격리 SQLite 3 Version/동일 S3 locator 두 건→B2-2A 주장 패킷은 정상이나 B2-2B만 `DUPLICATE_S3_LOCATOR`로 BLOCKED 회귀 추가. SHA·byte 길이·S3 VersionId도 유효하게 구성해 결함의 재발을 직접 검출한다.
- **재검증 경계:** AGENTS·ADR/Architecture·Database·Requirements·Operation·TestPlan/TestReport·Runbook/Issue109 동기화. **새 HEAD** Typecheck/Unit/PR CI/Codex 리뷰 결과는 별도 관측 전 `NOT VERIFIED`, 이전 Run의 SUCCESS 재사용 금지. Main 정렬/미해결 리뷰/충돌은 신규 HEAD push 시 재점검; 실제 Writer freeze/SQLite online backup/원본 CAD/S3 Versioned GET·Migration·Restore/Rollback·GHCR/운영 Auth/CAD Write 및 Owner GO **NOT RUN**. Issue #142/#109/#96 OPEN/BLOCKED. 이번 요청 범위 PR CI 시작, 모니터링/병합 없음.

## #142 / PR #145 — Codex P2 S3 UUID 매핑 오탐 보완 (2026-10-27 KST)

- **관측 CI 성공(실패 아님):** [PR CI #40499605822](https://github.com/planner77/layoutManager/actions/runs/40499605822), attempt 1, HEAD `0f0c6aaebf97636010ae6dfec91d436c1d329c37` `completed/success`, Typecheck/Lint/Test/Build/E2E [Job 122173675351](https://github.com/planner77/layoutManager/actions/runs/40499605822/job/122173675351) SUCCESS 및 Docker/Migration/Smoke [Job 122173675644](https://github.com/planner77/layoutManager/actions/runs/40499605822/job/122173675644) SUCCESS. PR OPEN, Main `e043d56d...` 대비 behind=0/충돌 없음.
- **P2 리뷰 지적 (CI 실패와 별개):** [Codex #4388372985](https://github.com/planner77/layoutManager/pull/145#discussion_r4388372985): `S3ObjectStorage.prepare()`의 독립 Object UUID와 `CadRepository.register()`의 DB Version UUID가 같다고 가정하여 유효한 `storage_path`를 `SQLITE_VERSION_OR_LOCATOR_MISMATCH`로 오차단. 기존 합성 양성 시험은 우연히 동일 UUID를 사용해 실제 런타임 경로를 재현하지 못함.
- **수정:** 독립 `s3ObjectLocator`를 합성 private 객체 매핑에 필수로 도입, 실제 DB `storage_path`와 정확 비교 및 S3 bucket/object UUID/형식 fail-closed 확인. Local `<location>/<db-version>/original.ext` 계약 불변. 서로 다른 두 UUID의 합성 양성 시험, 다른 객체 UUID·bucket, 누락/URL/s3Locator-in-local에 대한 BLOCKED 회귀 추가. AGENTS/Architecture/Database/Decisions/Requirements/Operation/TestPlan/TestReport/B2-2B Runbook/Issue109 문서 동기화.
- **경계 및 재검증:** 신규 HEAD의 Typecheck/Lint/Unit/Build/E2E/CI·Codex 재리뷰는 확인 전 `NOT VERIFIED`. 이전 SHA의 CI 성공을 신규 HEAD로 승계하지 않음. 실제 운영 Writer freeze/SQLite online backup·CAD/S3 versioned 원본·DB·Auth/Write/GHCR/배포·마이그레이션·실증/Owner GO **NOT RUN**; #142/#109/#96 OPEN/BLOCKED. 이번 단계는 PR CI 시작까지만이며 병합·GHCR 게시 없음.

## #142 B2-2B 격리 검증 착수 — 선행 Main CI 성공, 새 PR 검증 이전 (2026-10-27 KST)

- **선행 성공, 실패 아님:** B2-2A [PR #144](https://github.com/planner77/layoutManager/pull/144) final HEAD `f633bc8edf39b01ddfbbc8e34127f7b2be06879f`, [PR CI #40494040763](https://github.com/planner77/layoutManager/actions/runs/40494040763) SUCCESS, Codex findings 0/미해결 thread 0, exact no-GHCR Squash Main `e043d56d43099034906cccf0bb1cc1c7a76bb11f`. [Main CI #40496032085](https://github.com/planner77/layoutManager/actions/runs/40496032085) release-scope Job 122161584540 SUCCESS, GHCR Job 122161649150 SKIPPED.
- **새 범위(작성, 실행 성공 아님):** SQLite/Local CAD/S3 export·marker Buffer를 별도로 대조하는 합성 preflight와 positive/negative Unit, G7 Runbook/설계·운영 문서 및 정확 15-path no-GHCR release 가드. 신규 Typecheck/Unit/PR CI 결과는 Run/Job/Attempt/HEAD 관측 전 `NOT VERIFIED`. 이전 [CI #40492242157](https://github.com/planner77/layoutManager/actions/runs/40492242157) TS2339 실패와 두 P2 리뷰 기록은 아래에 보존.
- **금지:** 실제 Writer 동결, SQLite online backup, 원본 CAD·S3 Versioned HEAD/GET 및 Registry, 7 Migration, Restore/Rollback, 운영 Auth/CAD Write/Nginx/Compose·GHCR, #142/#109/#96 종료 모두 NOT RUN/OFF.

## Issue #142 / PR #144 — Typecheck TS2339 보완 (2026-10-27 KST)

- **관측 CI 실패:** [PR CI #40492242157](https://github.com/planner77/layoutManager/actions/runs/40492242157), attempt=1, SHA `808f7b40de4dd2686888b17d7f010784a6e293c6` → `completed/failure`. Typecheck/Lint/Test/Build/E2E [Job 122148776521](https://github.com/planner77/layoutManager/actions/runs/40492242157/job/122148776521)에서 TypeScript 검사 `tsc --noEmit` 3건 **TS2339** (`src/tests/unit/g7-s3-4-b2-capture.test.ts:83,88,96`); 이후 ESLint/Unit/Build/E2E는 SKIPPED이므로 PASS가 아님. Docker/Migration/Smoke [Job 122148776302](https://github.com/planner77/layoutManager/actions/runs/40492242157/job/122148776302) SUCCESS.
- **직접 원인/최소 보완:** 합성 Fixture `versions:[v1,v2]`는 local `v1`에 `storageVersionId`가 없어서 TypeScript가 배열 요소를 Union으로 추론하며 `versions[1].storageVersionId`에 접근할 수 없었음. `const versions:[typeof v1,typeof v2]=[v1,v2]`로 항목별 타입을 보존하고 반환 Fixture에 `versions`로 연결한다. DB/S3 payload 내용·보안 Validator·운영 코드·GHCR 미게시 15-path 정책 **변경 없음**.
- **리뷰/충돌:** 이전 HEAD의 Codex 리뷰 `808f7b4` completed/findings=0, 과거 P2 [#4387342529](https://github.com/planner77/layoutManager/pull/144#discussion_r4387342529)·[#4387342538](https://github.com/planner77/layoutManager/pull/144#discussion_r4387342538) 모두 Resolved, 전체 Review thread 미해결=0. 수정 전 Main `2d29b8572b02ccacf5e0032bf5432cb2f2b26ed6` 대 PR `ahead=5, behind=0`, mergeable=true; Main 정렬·충돌 해결 불필요. 새 HEAD의 Codex 재리뷰는 **별도**.
- **실패 원장 규칙:** CI Typecheck 실패와 과거 P2 리뷰는 독립 기록; 성공한 Docker Job과 미실행 후속 Step을 혼동하지 않음. 독립 최소 TypeScript tuple 예제 컴파일만 PASS(전체 프로젝트 Typecheck/ESLint/Vitest/Build/E2E는 **새 CI 성공 전 미검증**). 재발 방지: fixture의 이종 객체 배열은 인덱스별 제약을 tuple 또는 명시 타입으로 유지하며 신규 mutation Unit을 추가할 때 **typecheck를 먼저 수행**.
- **범위 제한:** `AGENTS.md`, 실패 원장, TestReport 및 단위 테스트만 수정. 실제 현장 writer freeze/SQLite backup/CAD·S3 원본 검증/실복구/rollback, 운영 Auth/Write, active Prisma Migration, Dockerfile/Compose/Nginx/.env, GHCR 게시·이슈 종료는 수행하지 않음. #142/#109/#96 OPEN/BLOCKED 유지. 새 PR CI는 HEAD push로 시작, 결과 모니터링하지 않음.

## #142 / PR #144 — B2-2A Codex P2 2건 교정·새 PR CI 실행 요청 (2026-10-27 KST)

- **관측(실패 아님):** 기존 HEAD `4fa951d2ccf09455225cd645045ab0cffa1a752b`의 [PR CI #40485053390](https://github.com/planner77/layoutManager/actions/runs/40485053390), attempt=1, `completed/success`; Typecheck/Lint/Test/Build/E2E [Job 122124654212](https://github.com/planner77/layoutManager/actions/runs/40485053390/job/122124654212) SUCCESS, Docker/Migration/Smoke [Job 122124654478](https://github.com/planner77/layoutManager/actions/runs/40485053390/job/122124654478) SUCCESS. **CI 실패 기록이 아닌 리뷰 품질 지적**이며 새 HEAD에 PASS를 이전하지 않음.
- **P2 [#4387342529](https://github.com/planner77/layoutManager/pull/144#discussion_r4387342529):** 서로 다른 Version key에 같은 `(locationId, version)` 허용 → Prisma `@@unique([locationId, version])`과 모순. location별 Set으로 복합 키 중복을 `DUPLICATE_LOCATION_VERSION/BLOCKED`로 차단, 서로 다른 Location 간 동일 번호는 허용하는 회귀.
- **P2 [#4387342538](https://github.com/planner77/layoutManager/pull/144#discussion_r4387342538):** 기존 `[A-Za-z0-9_-]{8,128}` 제약은 AWS S3의 `+`, `/` 및 128자 초과 유효 Version ID를 잘못 거부. UTF-8 1,024 bytes 상한의 공통 opaque Version ID 검사로 object/marker 교정; `null` sentinel·잘못된 UTF-8·초과 길이 거부. 회귀에 Unicode byte 경계와 정상 기호를 포함. 근거: https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html.
- **충돌/수정 범위:** PR #144 기존 Main `2d29b8572b02ccacf5e0032bf5432cb2f2b26ed6`와 `behind=0/ahead=4`, `mergeable=true/clean`; 강제 push·Main rebase 불필요. 보완은 `s3-4-b2-capture.ts`, synthetic Unit, B2-2 Runbook, AGENTS, 실패 원장 5개뿐이며 **15-path no-GHCR allowlist 보존**.
- **재검증 상태:** 새 HEAD로 push하면 PR CI가 자동 시작되며, 새로운 Run/Job/Attempt·결과와 최신 Codex 재리뷰는 **결과 관측 전 NOT VERIFIED**. 실 writer 중지·DB/CAD/S3 원본/Registry GET·Migration·Restore/rollback·GHCR 게시·실운영 Auth/Write·Owner GO는 NOT RUN/OFF; #142/#109/#96 OPEN/BLOCKED. 사용자 지시에 따라 CI 모니터링·병합·Main CI는 진행하지 않음.

## #142 S3-4-B2-2A 착수 — 선행 #143 Main CI 성공 / 새 PR 미검증 (2026-10-27)

- **선행 성공, 실패 아님:** #143 B2-1 PR HEAD `f9545e26886a4f66f152beca21880d7a170764da` PR CI `40479785846` SUCCESS, Codex 최신 HEAD 완료/지적 없음; exact no-GHCR Squash `2d29b8572b02ccacf5e0032bf5432cb2f2b26ed6`. [Main CI #40483297907](https://github.com/planner77/layoutManager/actions/runs/40483297907) `completed/success`, release-scope [Job 122118716547](https://github.com/planner77/layoutManager/actions/runs/40483297907/job/122118716547) SUCCESS, GHCR [Job 122118771319](https://github.com/planner77/layoutManager/actions/runs/40483297907/job/122118771319) SKIPPED. 이미지/태그 게시 없음.
- **B2-2A:** writer-barrier, SQLite/Local/S3 원본 Versioned Snapshot의 단일 SNAP 주장 계약·negative synthetic Unit·고정 15-path GHCR 제외 + Runbook/AGENTS/docs 구현. 실제 현장 동결/온라인 백업/원본 SHA 재계산을 하지 않은 순수 검증이므로 결과는 `CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF`, verified/GO 플래그 false. 새 PR CI/리뷰는 관측 전 `NOT VERIFIED`; 실패하면 SHA/Run/Job/Attempt/원인/보완 기록.
- **금지:** 운영 Auth/Write/Prisma/Compose/Nginx/DB/CAD/S3/GHCR, #109/#96 종료 미수행.

## #142 S3-4-B2-1 진입 — #141 B1 Main 성공 인계 및 신규 검증 미실행 (2026-10-27 KST)

- **선행 성공 (실패 아님):** [PR #141](https://github.com/planner77/layoutManager/pull/141) HEAD `24b9c340f18e257471fe02237e6ab8e1d8f543da`, [PR CI #40476745670](https://github.com/planner77/layoutManager/actions/runs/40476745670) success 및 최신 Codex 리뷰 completed/findings=0, 기존 P1/P2 4개 Resolved. 정확 S3-4-B1 no-GHCR Squash `7469d016a5926aca07929bf3e95e869b46716bd1`. [Main CI #40478523325](https://github.com/planner77/layoutManager/actions/runs/40478523325) completed/success: release-scope Job 122102656670 SUCCESS, GHCR Build+Push Job 122102702681 SKIPPED.
- **B2-1 개발:** 로컬 OCI manifest/config Byte digest·Source/Version/Role/Schema 구조검증+음성 합성 Unit, 명시 GHCR no-publish workflow guard, Runbook/AGENTS/doc sync. **신규 HEAD PR CI/실 Registry 검사 = NOT VERIFIED / NOT RUN**. 실제 실패/취소 시 Run/Job/Attempt/HEAD/원인·조치를 분리 기록하며 synthetic success를 registry 검증/운영 GO로 혼동 금지.
- **운영 경계:** B2-2..5 실 사내 OCI/Snapshot/7 Migration/Restore/Rollback과 C trusted binder/Owner GO 미실행. 운영 Auth/Write/Prisma 활성 SQL·Compose/Nginx/실 DB/CAD/S3·GHCR Publish/Issue #109/#96 종료 미수행.

## Issue #109 / PR #141 — 리뷰 P2 해결·최신 Main 무충돌 후속 확인 (2026-10-27 KST)

- **해결 완료:** 신규 Codex P2 [r4386312087](https://github.com/planner77/layoutManager/pull/141#discussion_r4386312087) / `PRRT_kwDOUQjDfc6wl_yN`의 필수 Runbook 색인 누락을 `AGENTS.md`에 정확 한 행 추가하여 보완. [답변 r4386427333](https://github.com/planner77/layoutManager/pull/141#discussion_r4386427333) 등록 및 스레드 **Resolved** 처리. 기존 P1 1건·P2 2건도 유지해 전체 **4개 중 미해결 0개**.
- **검증 직전 HEAD:** `504b5d0ef97bcbc0399b1d560661cf9c72ec5587` 기준 [PR #141](https://github.com/planner77/layoutManager/pull/141) `OPEN/mergeable=true`, Main `4e9095106666aac4568bc4f636e4de8492bc0c86`와 `behind=0`, Compare `ahead=12`; PR에는 코드·운영 변경이 아닌 Markdown 2개(`AGENTS.md`, `out/FailureLedger.md`)만 추가 변경. Main 정렬 필요·충돌 **없음**.
- **검증 범위:** 최초 이 문서 수정 HEAD에서 PR CI [40473275744](https://github.com/planner77/layoutManager/actions/runs/40473275744) 실행이 시작된 것만 관측. 결과는 확인되지 않음. 본 후속 기록 커밋으로 HEAD가 또 바뀌므로 이후 병합/새 Codex 리뷰/PR CI는 **최종 새 SHA**를 기준으로만 검증. 리뷰 결함은 CI 실패로 중복 기록하지 않으며 실제 운영 DB/CAD/S3·Auth/Write·Prisma/Nginx·Compose·GHCR·#109/#96에는 변경 없음.

## Issue #109 / PR #141 — Codex P2 Runbook 중앙 색인 누락 보완 및 충돌 재점검 (2026-10-27 KST)

- **기준:** [PR #141](https://github.com/planner77/layoutManager/pull/141) 검토 HEAD `202cd976e5961fe5876e1d775eb5cdd6053eed76`, [PR CI #40470720374](https://github.com/planner77/layoutManager/actions/runs/40470720374) `completed/success` (기존 HEAD만 검증). Typecheck/Lint/Unit/Integration/Build/E2E·Docker CI 실패가 아니라 **Codex Review P2** 문서 품질 지적이다.
- **Codex P2 [#4386312087](https://github.com/planner77/layoutManager/pull/141#discussion_r4386312087)** / 스레드 `PRRT_kwDOUQjDfc6wl_yN`: 신규 `src/deploy/g7-s3/S3-4-B.md`가 `AGENTS.md` 상단 이력 링크로만 연결돼, 필수 「상세 문서와 필수 참조 시점」 중앙 표에는 빠짐. 향후 S3-4-B1 격리·B2 OCI/실복구/rollback 검증 시 지침 미발견 위험. `AGENTS.md`의 `Issue109` 문서 행 다음에 **S3-4-B1 Runbook** 행을 추가하여 문서 목적·S3-4-B1/B2 구현/리뷰/시험 및 Owner Go/No-Go 전 필수 참조 시점을 명시했다. 신규 소스·마이그레이션/DB 변경 없음.
- **기존 리뷰·Main:** Codex 기존 P1 1건·P2 2건 3개 스레드 이미 Resolved. Main `4e9095106666aac4568bc4f636e4de8492bc0c86`과 기존 PR HEAD 비교 `behind=0`, `mergeable=true`, #138 ViewerPanelPolicy 및 #109 S3-4-B1 변경 모두 보존. 이번 문서 보완 이후 Review thread 최종 해결·Main 정렬/PR CI/리뷰 게이트는 **새 HEAD에 대해** 확인 필요.
- **새 HEAD 검증 경계:** 이 기록 커밋으로 HEAD가 달라지므로 이전 CI `40470720374` 성공을 새 HEAD의 PASS로 재사용하거나 아직 완료되지 않은 새 Codex 검토를 승인 완료로 기록하지 않는다. 추가 실패·취소가 없으면 실패 원장에 가짜 실패를 추가하지 않는다. PR 병합/Main CI/GHCR 게시/태그, 운영 Auth/Write, 운영 Prisma Migration, Nginx/Compose/.env, 실 DB/CAD/S3, #109/#96 종료 미수행.

## #109 / PR #141 — #138 Main 문서 보존 정렬·Review/CI 재검증 인계 (2026-10-27 KST)

- **정렬 기준:** 합병 전 S3-4-B1 PR HEAD `dc1e264a70aa5bdddf21654008fa6b5c91c23fcc`, #138 docs-only Main `4e9095106666aac4568bc4f636e4de8492bc0c86`. 6개 공통 Markdown의 Main **추가 문단만** 기존 #109 문서에 결합했고 `AGENTS.md` 하단 `ViewerPanelPolicy` 필수 참조 색인 행 및 신규 `out/ViewerPanelPolicy.md` 파일을 보존. S3-4-B1 runtime/DB/CI GHCR 허용목록과 기존 Fail Ledger 내용 삭제·덮어쓰기 없음.
- **병합 방법:** `8980928f7fa86f1686a60780efd3d8af76e48aa6` (정렬 문서까지 반영한 B1 브랜치)과 Main `4e9095106666aac4568bc4f636e4de8492bc0c86`을 **두-부모 비강제 Merge**. 원본 Main/PR 계보를 둘 다 보존. Main #138은 정책 문서만, Viewer Drag & Drop 구현은 아직 미완. 코드 외 B1 구현/합성 테스트는 원본 브랜치 그대로 유지.
- **새 검증:** 이 문서가 포함된 최종 Merge HEAD의 PR CI·Codex 리뷰는 이전 HEAD CI SUCCESS를 소급 재사용하지 않는다. 새 HEAD PR CI 시작 및 최신 Codex 리뷰 완료 확인 전 PASS/병합 승인 주장 금지. 기존 P1 1건·P2 2건 리뷰 3개 resolved, Main 정렬 후 신규 스레드/충돌 재확인 필요.
- **안전 경계:** PR Squash Merge·Main CI·GHCR 이미지 게시/태그·운영 Auth/Write 활성화·실 Prisma Migration·Nginx/Compose·실 DB/CAD/S3 조작·Issue #109/#96 종료 미수행. 실패한 CI 관측 시 Run/Job/Attempt/HEAD/원인 기록.

## Issue #138 / PR #140 — 리뷰 P1 문서 인덱스 누락·Main 문서 충돌 교정 (2026-10-27 KST)

- **CI 실패가 아닌 이전 검증 성공:** 최초 docs-only PR HEAD `e5f27df68d0c98a1bc9fce18f64d632f0dd62acb`, [PR CI Run 40440709454](https://github.com/planner77/layoutManager/actions/runs/40440709454) `completed/success`, Verify [Job 121980119280](https://github.com/planner77/layoutManager/actions/runs/40440709454/job/121980119280)와 Docker [Job 121980119466](https://github.com/planner77/layoutManager/actions/runs/40440709454/job/121980119466) 성공. 기존 성공을 후속 수정 HEAD에 소급 적용하지 않는다.
- **P1 리뷰:** [r4385582697](https://github.com/planner77/layoutManager/pull/140#discussion_r4385582697), thread `PRRT_kwDOUQjDfc6wkQRw`. 새 `out/ViewerPanelPolicy.md`를 AGENTS.md 서두에서 링크했으나 하단 **상세 문서와 필수 참조 시점** 중앙 색인 표에 등록하지 않아 신규 Markdown 문서 등록 정책 위반. **수정:** AGENTS 색인에 문서 목적과 Viewer 보조 창 요구·구현·리뷰 시 필수 참조 조건 행 추가. CI 실패·실 CAD 오작동으로 분류하지 않고 **리뷰 보완**으로 기록.
- **Main 충돌:** 최초 PR은 main `dc20844be7525bd3367f38cc3080675efa4fa89c` 기준, 최신 main `1500eb699d5ef8d2045e951354838aa13ce24f92`의 #109 S3-4-A가 AGENTS/Architecture/Decisions/Requirements/TestPlan 상단을 추가하여 Draft 해제 시 GitHub `mergeable=false`. 최신 main 모든 원문·S3-4-A runtime/문서를 보존한 채 #138 삽입만 결합한 **비강제 두-부모 병합** `170f5bb6353b869273726506ddd98f0bc5a176f7`으로 정렬. 당시 Main behind 0, 충돌 없음; #109 운영 GO·GHCR 상태는 변경하지 않았다.
- **새 HEAD 검증 경계:** Main 정렬 후 새 [PR CI 40458935010](https://github.com/planner77/layoutManager/actions/runs/40458935010)은 생성되었으나 확인 당시 `in_progress`; 이후 색인·원장 보완으로 HEAD가 한 번 더 바뀌므로 완료 결과는 **NOT VERIFIED**. 새 Codex 검토 및 unresolved thread 0 / Main mergeability를 최종 확인해야 병합 가능. 사용자 지시대로 CI 결과 자동 모니터링은 하지 않는다.
- **릴리스 범위:** PR #140은 Markdown 전용(신규 공통 지침), Viewer MovablePanel 기능 소스 변경 **없음**. `.github/workflows/docker-publish.yml`의 docs-only 판정은 Main release-scope=SUCCESS, GHCR Build and push=SKIPPED 예상이며 **실제 GHCR 게시를 실행하거나 완료로 보고하지 않는다**. Issue #138 기능 AC는 미구현이므로 OPEN. 테스트·문서 가이드 합격을 DnD 구현 완료로 치환하지 않는다.


## #109 / PR #141 — 최신 리뷰 스레드·Main 충돌 게이트 재검증 (2026-10-27 KST)

- **참조:** [PR #141](https://github.com/planner77/layoutManager/pull/141), 검사 직전 HEAD `71913c0baa2b3f1e4ebc176afab36134ccae31d7`; Main `1500eb699d5ef8d2045e951354838aa13ce24f92`. `AGENTS.md` 및 이 원장의 기존 실패/조치·검증 경계를 기준으로 점검.
- **리뷰 스레드:** GitHub Review Thread 전체 3개 `PRRT_kwDOUQjDfc6wib8d`(P1 Manifest 정렬), `PRRT_kwDOUQjDfc6wib8g`(P2 SQLite TOCTOU), `PRRT_kwDOUQjDfc6wib8h`(P2 8개 Auth tables) 모두 기존 코드 보완 및 답변 후 **is_resolved=true** / 현재 outdated=true. **미해결 0건**. 이번 확인에서 새로 해결할 스레드나 추가 코드 수정은 없으며, 과거 결함을 새 CI 실패로 중복 계상하지 않음.
- **Main 충돌:** GitHub `compare(main, PR head)` = `ahead=6, behind=0, status=ahead`; PR `OPEN`, `mergeable=true`. Main과 같은 base여서 정렬·재기준화 및 충돌 보완 **불필요**. Main 소스·운영 코드 변경 없음.
- **CI와 리뷰 게이트 구분:** 기존 [PR CI #40447864806](https://github.com/planner77/layoutManager/actions/runs/40447864806)은 원래 HEAD `71913c0...`에서 `completed/success`이며 앞선 실제 실패 [#40444154044](https://github.com/planner77/layoutManager/actions/runs/40444154044)의 5개 Unit/Integration FAIL 이력은 아래에서 보존. 최신 HEAD에 대한 Codex 재리뷰 요청은 [PR comment](https://github.com/planner77/layoutManager/pull/141#issuecomment-6434041527)로 제출됐으나 GitHub review summary가 `status=running`, commit_sha `71913c0...`, findings 미확정이므로 **최종 Codex 리뷰 완료/병합 승인으로 간주하지 않음**.
- **처리 범위:** 상태 증거만 기록. 이 기록용 문서 커밋 이후 HEAD는 위 검사 SHA와 다르므로 후속 병합/CI 검증은 반드시 새 HEAD를 기준으로 재확인. PR 병합·GHCR 게시·Main CI/운영 Auth·Write/실 Prisma Migration·Nginx/Compose·실 DB/CAD/S3 조작·#109/#96 종료 모두 미수행.


## #109 PR #141 — CI #40444154044 Unit/Integration 5건 실패 및 P1/P2 3건 조치 (2026-10-27 KST)

- **관측 실패 Run:** [PR CI #40444154044](https://github.com/planner77/layoutManager/actions/runs/40444154044), attempt 1, SHA `b5f340e69bd28aed939bb1c443df355c1652f5bf`, completed/failure. Verify [Job #121991282421](https://github.com/planner77/layoutManager/actions/runs/40444154044/job/121991282421) Unit/Integration Step 9 failure, **68 test files: 67 PASS/1 FAIL; 총 404 tests: 399 PASS/5 FAIL**. Typecheck+ESLint PASS, Production Build/Chromium E2E/Legacy Migration E2E **SKIPPED**. Docker [Job #121991282118](https://github.com/planner77/layoutManager/actions/runs/40444154044/job/121991282118) SUCCESS.
- **원인 및 증거:** 실패 5개 모두 `tests/integration/g7-s3-4-b-clone.test.ts`에서 검증기의 예상 sorted key 순서가 틀려 `SNAPSHOT_MANIFEST_MISMATCH`를 먼저 반환하는 하나의 직접 원인. 정상 Manifest 거부로 positive 1, corrupted/missing/permission/schema negative 기대치 4개가 파생 실패함. DB 손상/운영 장애나 서로 독립적인 결함 5건으로 오판하지 않는다.
- **Codex P1 [r4384813274](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813274):** `Object.keys(m).sort().join(',')` 기대값이 `schema,schemaId,snapshotId,scope`로 잘못됨. 실제 정렬값 `schema,schemaId,scope,snapshotId`로 교정.
- **Codex P2 [r4384813277](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813277):** 원본 DB 파일은 `ownedBytes()`가 FD 보안검사 후 닫았지만 SQLite에서 `new SQLite(path)`로 다시 열어 pathname/symlink/inode 교체 가능. 검증한 Buffer를 직접 `new SQLite(bytes)`의 **메모리 복제 DB**로 열도록 보완. Source 경로 교체 후에도 같은 검증된 Buffer를 검사하는 회귀 추가(원본 path symlink 자체는 거부).
- **Codex P2 [r4384813278](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813278):** AuditEvent/AuthSession 두 테이블만 검사하던 후보 Schema 불완전성. G7 `User,UserRoleGrant,UserSiteGrant,SpecialGrant,AuthSession,AuditEvent,AdminRecoveryNonce,G3LoginAttempt` **8개 전체 존재** 필요; CAD baseline에는 8개 중 하나라도 있으면 거부. 부분 Auth 테이블 음성시험 추가.
- **재검증:** 변경된 HEAD `5d17b9f76352bc2852ee3235498f3d2fb87a9933`의 CI는 기록 시점 **미관측/NOT VERIFIED**, 향후 새 PR CI/코덱스/충돌 증거 분리 기록. 실 OCI·DB/CAD/S3 복구/rollback **NOT RUN**, 운영 데이터 변경 0. GHCR/Prisma 활성 Migration/Compose/Nginx/Auth/Write/Issue #109/#96 종료 미수행.


## #109 S3-4-A Main CI 성공 인계 / S3-4-B1 최초 작업·실 복구 미실행 (2026-10-27)

- **S3-4-A 성공 인계 (실패 아님):** PR #136 `d890f88bb598c215d12597157725a2435da28dec` PR CI #40440831020 SUCCESS, Codex 최신 재리뷰 major 없음·P2 두 스레드 Resolved → Squash `1500eb699d5ef8d2045e951354838aa13ce24f92`. [Main CI #40443473912](https://github.com/planner77/layoutManager/actions/runs/40443473912) SUCCESS, release-scope Job SUCCESS, Build and push GHCR Job SKIPPED.
- **S3-4-B1:** readonly 일회용 SQLite/실 로컬 CAD/S3-export 바이트 무결성 검증과 합성 테스트 작성. 새로운 CI Run 성공 전 `NOT VERIFIED`. B2 사내 원본 Snapshot/OCI provenance/실 Migration·복구/rollback **NOT RUN**, 실패로 오기록 금지. 관측 실패·취소가 생기면 Run/Job/Attempt/SHA/원인/보완 누적 기록.
- **경계:** 실제 operating DB/CAD/S3, Auth/Write, Prisma 자동 migration, GHCR publish/태그, Compose/Nginx/.env, Issue #109/#96 종료 변경 없음.


## Issue #109 PR #136 — 이전 CI SUCCESS / Codex P2 2건 원인·보완 (2026-10-27 KST)

- **관측 CI 성공 (실패 아님):** [PR CI #40438604869](https://github.com/planner77/layoutManager/actions/runs/40438604869), HEAD `07a126afdba9135e031f348e6a2901ae6395fd79`, attempt 1, `completed/success`. 이 Run의 성공은 이후 보완 HEAD가 합격했다는 뜻이 아니며 실패 Job을 임의 기록하지 않는다.
- **Codex P2 #4384543606 (리뷰 보안 결함, CI 실패 아님):** pathname `lstat/realpath`와 `readFileSync(path)` 사이 파일 교체(TOCTOU) 시 다른 일반 파일·symlink/FIFO를 재검증 없이 열거나 FIFO에서 블록할 수 있음. 검증한 경로를 `O_NOFOLLOW|O_NONBLOCK|O_RDONLY`로 열고 같은 fd의 `fstatSync`에서 regular/UID/0600/크기 및 사전 `dev+ino` 일치 확인한 뒤 **동일 fd에서 읽고 finally close**하도록 교정. 회귀: symlink 교체, mode 0600 타 inode 교체, FIFO 교체, JSON 구문 오류/후속 읽기.
- **Codex P2 #4384543609 (자료형 결함, CI 실패 아님):** `String(record.status)`가 배열 `['NOT_RUN']`을 문자열로 변환해 `PENDING`으로 분류. `typeof record.status === 'string'` 확인 후 허용값 비교, 배열/객체/숫자/boolean/null은 `INVALID_CHECK`·`BLOCKED`; 무실행 상태로 오분류 금지.
- **검증 경계:** 변경된 테스트와 CI 결과는 신규 HEAD의 새 Run 전까지 `NOT VERIFIED`; 실제 OCI registry 확인 및 DB/CAD/S3 운영 복원은 여전히 `NOT RUN`. 운영 Auth/Write·실 Prisma Migration·GHCR/Compose/Nginx·실 데이터 변경 없음, #109/#96 OPEN/BLOCKED.


## #109 S3-4-A 착수 — 이전 Main CI PASS 인계 / 신규 CI·실복구 미관측 (2026-10-27)

- **선행 Run (성공·실패 원장과 분리):** #135 squash `dc20844be7525bd3367f38cc3080675efa4fa89c`, Main CI [40437054103](https://github.com/planner77/layoutManager/actions/runs/40437054103) SUCCESS 및 GHCR job SKIPPED. 새 구현에서 기존 S3-3 P2·CI 실패를 소거하거나 중복 실패로 적지 않는다.
- **이번 작업:** S3-4-A 오프라인 OCI/schema/snapshot/rollback 증거형식 검증·CLI·Unit+GHCR exact allowlist·Runbook 추가. CI 실행 전 결과는 `NOT VERIFIED`, 사내 registry·실 DB/CAD/S3 복원/rollback은 `NOT RUN`; 장래 실패·Cancelled Job을 관측하면 정확 HEAD/Run/Job/Attempt/원인/보완을 추가.
- **통제:** `src/prisma/migrations/**`, `src/scripts/deploy.ts`, Compose/Nginx, 실 DB/CAD/S3, 운영 Auth/Write, GHCR 이미지 게시/태그/Issue 종료 변경 없음. 사내 원시 증거/주소/토큰/이미지 민감정보 비반출. S3-4-B/C 및 S3-5 미승인.


## Issue #109 PR #135 — 최신 Main 정렬 후 리뷰·충돌 2차 게이트 (2026-10-27 KST)

- **근거 HEAD:** Main `dc82e670073160ddac46a2f9e9489a738a19c033`; S3-3 Merge HEAD `ebc294fff35b005737cf89ebacb78420b209bd59` (parents `13fcea7fc69e844854470dbd9a180a6fc08920ae`, Main `dc82e670...`). GitHub 비교 `ahead=6, behind=0`, PR #135 `OPEN/mergeable=true`. Main #57 변경 파일 25개 의미적 보존(충돌 가능 7개 MD는 Main + S3-3 신규 항목 양쪽 유지), 원본 Main 기능 복원손실 없음.
- **2차 리뷰:** GitHub GraphQL review thread `PRRT_kwDOUQjDfc6wgu00` P2 [4384076798](https://github.com/planner77/layoutManager/pull/135#discussion_r4384076798), 답변 [4384322812](https://github.com/planner77/layoutManager/pull/135#discussion_r4384322812), `is_resolved=true`; 1개 전체 thread 중 **미해결 0개**, 추가 미해결 없음. 변경전 초기 [PR CI 40429149135](https://github.com/planner77/layoutManager/actions/runs/40429149135) 성공, 재정렬 이후 최신 HEAD CI는 **미확인**. 리뷰 지적은 CI 실패 Run으로 중복계상하지 않는다.
- **추가 Gate:** GHCR 정확 S3-3 allowlist에 순수 helper `cad-preview-storage.ts` 포함(범위 밖 운영 Prisma/Compose 금지), 같은 경로에 대한 Unit whitelist 회귀. 최신 HEAD의 실행결과는 새 PR CI가 생성·검증되어야만 판정한다. 실제 운영 DB/CAD/S3·Auth/Cutover/DDL·GHCR 게시·PR 병합·#109/#96 종료 진행 금지.


## Issue #109 PR #135 — Main 동기화 전·후 리뷰/충돌 분리 기록 (2026-10-27 KST)

- **동기화 전:** HEAD `13fcea7fc69e844854470dbd9a180a6fc08920ae`; 이전 PR CI 40429149135는 최초 HEAD 8a98e6a6에서 completed/success. Codex P2 [r4384076798](https://github.com/planner77/layoutManager/pull/135#discussion_r4384076798)는 `CAD_STORAGE_PATH` 불일치로 인한 Viewer 콘텐츠 조회 위험이며 **CI 실패가 아니다**. 코드·격리 테스트·Runbook 수정, 답변 [r4384322812](https://github.com/planner77/layoutManager/pull/135#discussion_r4384322812), 스레드 PRRT_kwDOUQjDfc6wgu00 Resolved. 미해결 스레드 0 관측.
- **Main 선행:** 기존 base `9d70bd243fd0dbc27d4d897c1285c96dcc8a0c03`보다 Main `dc82e670073160ddac46a2f9e9489a738a19c033` 1커밋 앞섬. #57 로깅·관측/업로드, 신규 단위 테스트·workflow·Dockerfile/패키지/가이드 등 Main 변경을 전체 보존. Main과 #109 양쪽 변경된 7개 문서는 최신 Main 원문에 S3-3 후속 항목을 전방 삽입하는 의미적 병합. Git merge commit 두 부모 기록, 원본 Main 코드 파일을 재작성·롤백하지 않음.
- **검증 상태:** 병합될 HEAD의 새 PR CI는 **미실행/미확인**; 이전 성공 Run을 최신 HEAD PASS로 재활용하지 않음. 후속 Codex 재검토와 충돌·스레드 재점검은 독립 게이트. 운영 Auth/CAD Write, 활성 Prisma, Nginx/Compose, 실 데이터 및 GHCR 게시/병합 #109/#96 종료 금지.


## #109 PR #135 — CI SUCCESS / Codex P2 storage alignment correction before Main sync (2026-10-27 KST)

- **Baseline:** PR HEAD `8a98e6a6b48a9e9d000f8d6a98c84dfbedfb4144`; [PR CI 40429149135](https://github.com/planner77/layoutManager/actions/runs/40429149135) `completed/success`. This is not a CI failure and no failed job is invented.
- **Review gate:** Codex [P2 r4384076798](https://github.com/planner77/layoutManager/pull/135#discussion_r4384076798) (thread `PRRT_kwDOUQjDfc6wgu00`) exposed discrepancy: nonproduction writes used `<test-root>/cad` but anonymous Content GET relied on `context().storage` pointed by `CAD_STORAGE_PATH`. In a default separate process this could lead to `FILE_NOT_FOUND` after successful upload and broken Viewer. Review issue, not observed CI failure or production outage.
- **Correction:** Require `CAD_STORAGE_PATH` to equal the exact UID-owned disposable `$G7_S3_TEST_ROOT/cad`, allow local backend only and reject any populated `CAD_S3_*` env. Both pre-upload request gate and the disposable context fail closed on mismatch, preventing upload and production fallback. Added storage contract unit and synthetic write→legacy `ConfiguredCadStorage.content` byte-equivalent read. S3-3 runbook describes isolated process and exact env. Existing anonymous GET/content route is not modified. Pure alignment helper moved to `cad-preview-storage.ts` so Vitest does not import the `server-only` production context.
- **Validation state:** New HEAD Typecheck/Unit/E2E/CI **NOT YET VERIFIED**. Preserve previous failures in ledger. Production Auth/Write/Prisma/Nginx/Compose/GHCR/real DB/CAD/S3 unchanged; #109/#96 OPEN/BLOCKED.


## Issue #109 S3-3 — CAD API 권한·Audit 원자성 준비, 운영 OFF (2026-10-27)

- **기능:** 기존 CAD Multipart POST·Current PUT·Version DELETE에서 서버 DB의 최신 Session/Role/Site를 같은 Prisma Transaction 안에 재조회하고 승인된 Editor/Admin+Site만 쓰기 허용한다. DELETE는 기존 삭제 비밀번호도 요구하며, CAD DB 변경과 CAD_UPLOADED/CAD_CURRENT_CHANGED/CAD_VERSION_DELETED Audit INSERT 중 하나라도 실패하면 DB를 롤백한다. 기존 업로드 보상·삭제 Job, 익명 GET/Viewer·CAD 데이터 규약은 유지한다.
- **운영 차단:** `NODE_ENV=production`에서는 S3-3 프리뷰 활성화 불가. 정확한 S3-2 disposable DB/marker/7 migration, loopback origin, `G7_S3_AUTH_API_PREVIEW_ONLY=true`, `G7_S3_CAD_PREVIEW_ONLY=true`, `G7_AUTH_ENABLED=false`, `G7_CAD_WRITE_CUTOVER_ENABLED=false` 조건만 격리 시험 허용. 별도 Prisma Client와 0700 root 하위 로컬 CAD 저장소 이용. 운영 Migration·실 DB/CAD/S3·Compose/Nginx/.env·GHCR 게시·인증/쓰기 활성화 없음.
- **시험·잔여:** synthetic integration(Unit) 검증 코드 추가; 실제 PR CI는 시작 전이므로 결과 `NOT RUN`. 일회용 Preview Cookie의 Path는 `/api/g7-operational`이므로 다른 CAD 경로의 프로그램 시험에서는 테스트용 Cookie를 명시적으로 넘기며 운영 브라우저 인증이 활성된 상태는 아님. S3-4는 OCI/운영 Migration/실복구·신뢰 release binding, S3-5는 릴리스별 Owner GO 및 현장 수용. 기존 유사범위 PR #128은 미병합·충돌 상태이며 자동 병합하지 않는다. #109/#96 OPEN/BLOCKED.
- **후속 정확 Squash:** `#109 | S3-3 Isolated CAD write and Audit [G7-S3-3-NO-GHCR]` 및 개별 파일 allowlist만 GHCR 미게시. 내부 로그/비밀번호/IP/실 도면 반출 금지. [S3-3 Runbook](../src/deploy/g7-s3/S3-3.md).


## Issue #109 / PR #131 — 재시도 PR CI 40394690714 Unit·Integration 실패 1건 / Response 이중 소비 (2026-10-27 KST)

- **실패 Run (누적 2번째, Attempt 1):** [40394690714](https://github.com/planner77/layoutManager/actions/runs/40394690714), HEAD `0cab0f1449e0a7f8e41a1149a5e46b0aa0ef8a72`, `pull_request.synchronize`, `completed/failure`. Verify [Job 121824493035](https://github.com/planner77/layoutManager/actions/runs/40394690714/job/121824493035), `Unit 및 Integration 테스트` Step **9 FAILURE**. **64 Test Files = 63 PASS / 1 FAIL, 360 Tests = 359 PASS / 1 FAIL**. 실패 대상 `tests/integration/g7-s3-operational-auth.test.ts > disposable-only Admin CLI bootstrap/recovery, HTTP login, grants and Audit E2E`, 원본 로그 `tests/integration/g7-s3-operational-auth.test.ts:127:57`: `TypeError: Response.clone: Body has already been consumed.`
- **독립 성공 및 SKIPPED 구분:** 같은 Verify에서 `TypeScript 검사` Step 7 **SUCCESS**, `ESLint 검사` Step 8 **SUCCESS**, S3-2 GHCR Bash 가드 Unit `tests/unit/g7-staging-ghcr-guard.test.ts`의 22건 포함 다른 63 Test Files 통과. [Docker Job 121824492537](https://github.com/planner77/layoutManager/actions/runs/40394690714/job/121824492537) **completed/success**. Verify 이후 OCI 통계 Unit/benchmark/Production Build/Chromium E2E/Legacy Migration E2E는 **SKIPPED, PASS 아님**. E2E 실패 결과 업로드 Step 성공은 실제 E2E 성공/실행을 뜻하지 않는다.
- **직접 원인:** 통합시험 공통 `login()` 헬퍼의 `const data=await r.json()`이 Fetch `Response` 원본 Body를 소비함. 이후 Test가 `expect(admin.response.status, await admin.response.clone().text()).toBe(200)`를 실행하며 (상태 성공 여부와 무관하게 평가되는) 오류진단 인자에서 **`clone()`이 즉시 예외** 발생. 실제 Admin 로그인 HTTP 실패나 G3/G4 거래 실패를 이 로그로 추정하지 않는다.
- **수정:** `src/tests/integration/g7-s3-operational-auth.test.ts`에서 `const data=await r.clone().json()`으로 변경하여 JSON은 복제본에서 파싱하고 원본 Response는 읽지 않음. `expect(admin.response.bodyUsed).toBe(false)` 추가. 로컬 Node 22 표준 Response 최소 스모크에서 clone JSON 파싱 후 원본 bodyUsed=false/재복제 성공 확인. **전체 Vitest, Prisma, Playwright를 로컬에서 실행할 의존성이 없어 전체 PASS 미확인**; 새 HEAD PR CI에서 검증해야 한다. 운영 코드/세션 정책/계정 권한에 대한 불필요한 변경 없음.
- **이전 실패/리뷰 보존:** 초기 [Run 40337811911](https://github.com/planner77/layoutManager/actions/runs/40337811911) Verify TypeScript `TS2540` 2건과 Docker SUCCESS는 아래 별도 항목으로 보존. Codex [P1 r4378255007](https://github.com/planner77/layoutManager/pull/131#discussion_r4378255007) Bash `[...segments]` 리터럴 이슈는 이미 응답 [r4382045184](https://github.com/planner77/layoutManager/pull/131#discussion_r4382045184)·Resolved, 이번 GHCR Unit 22건 PASS. 리뷰 P1을 이 두 번째 CI 실패로 중복 계상하지 않는다.
- **Main 동기화 / 배포 경계:** 현재 기준 Main `338e1097b81115f8309fc4fde98414407ab826d0`, PR behind=0/mergeable=true, 미해결 리뷰 스레드 0. 현재 변경은 **S3-2 비운영 테스트**와 문서/원장에 한정; 신규 PR CI 재실행 이후 그 HEAD/Run을 따로 기록. `G7-S3-2-NO-GHCR` 정확 Squash 제목·변경 23개 명시 allowlist, 운영 `src/prisma/migrations`/기존 CAD REST/Compose/Nginx/.env·실 DB/CAD/S3·GHCR 게시/Issue 종료 OFF 유지. 사용자 지시에 따라 PR CI 시작 후 결과 모니터링/병합 없음.


## Issue #109 / PR #131 — PR CI 40337811911 TypeScript 실패 및 Codex P1·Main 정렬 (2026-10-27 KST)

- **실제 CI 실패 원장:** [PR CI Run 40337811911](https://github.com/planner77/layoutManager/actions/runs/40337811911), Attempt **1**, SHA `e31c69ccb096ffc34d16f91e8b9a33cb4f7d23f1`, `completed/failure`. Verify [Job 121624002318](https://github.com/planner77/layoutManager/actions/runs/40337811911/job/121624002318)에서 Step `TypeScript 검사`(7) **failure**: `tests/integration/g7-s3-operational-auth.test.ts:32:87` 및 `:235:19`의 `TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property.` (직접 `process.env.NODE_ENV=` 대입). Docker/Migration/Runtime Smoke [Job 121624002854](https://github.com/planner77/layoutManager/actions/runs/40337811911/job/121624002854) **completed/success**. 의존성·Client 생성 Step 성공; Verify Lint/Unit·Integration/OCI/DXF/Build/Chromium/Legacy Migration E2E는 **SKIPPED** (PASS 아님). E2E 오류 Artifacts 업로드 Step SUCCESS는 테스트 성공/독립 오류를 의미하지 않음.
- **수정:** 테스트 환경 복구·production OFF 시험에서 `process.env.NODE_ENV=` 직접 쓰기 2곳을 `Object.assign(process.env, {[k]:value})` 및 `Object.assign(process.env,{NODE_ENV:'production'})`로 변경해 TypeScript 읽기 전용 계약 위반 제거. 실 운영 Env 변경 아님; 테스트 프로세스 한정. **새 CI 미실행 단계에서는 교정 PASS 주장 금지.**
- **Codex P1 (CI 실패와 별개):** [Review r4378255007](https://github.com/planner77/layoutManager/pull/131#discussion_r4378255007) — 정확 Squash S3-2 `G7-S3-2-NO-GHCR` allowlist의 `src/app/api/g7-operational/[...segments]/route.ts`는 Bash `case` 패턴에서 `[...segments]`를 문자 클래스로 처리해 실제 허용 파일을 **거부**함. 조치: `.github/workflows/docker-publish.yml`에서 route 대안을 **단일 인용해 리터럴** 처리하여 기존 S1/S2/S3-1 예외/정상 Runtime/Tag 정책은 유지, Unit에서 정상 S3-2 제외·비슷한 route `/route.ts` 및 `/z/route.ts` 차단 재검증. 이 P1은 Main CI/GHCR **실패 Run이 아니며** 새 GHCR 게시도 없었음.
- **Main 변동/정렬:** PR 생성 당시 base `37c0d6e4`, 최신 Main `338e1097b81115f8309fc4fde98414407ab826d0` (기존 PR branch behind 2). #124/#126/#127 App·E2E 및 README/Docs/Package 0.42.0 변경을 유지하면서 PR branch 문서 변경을 병합해야 함. 무관 기능 파일을 S3-2 이전 상태로 되돌리지 않는다. Branch 동기화 후 최신 HEAD PR CI 시작만 허용.
- **불변 금지:** 프로덕션 새 Auth API는 `NODE_ENV=production`에 404, 운영 활성 `src/prisma/migrations/**` 및 실제 CAD GET/POST/Current/DELETE API, Nginx/Compose/.env·실 DB/CAD/S3·GHCR 이미지/태그 변경, #109/#96 종료 없음. 오프라인 합성 시험과 사내 원본 비반출 수용 분리, 별도 S3 Owner GO 전 운영 NO-GO.


## #109 S3-2 — 예약 Auth API 기본 OFF / G3-G4 통합 변경과 검증 상태 (2026-10-26)

- **관측된 신규 CI 실패:** 이번 S3-2 HEAD의 PR CI는 아직 시작 전이며 실제 Run/Job 실패/취소 기록 **0건(미관측)**. 테스트 작성·브랜치 커밋은 성공 근거가 아님. 기존 S1/S2/S3-1 실패 원장은 아래 보존.
- **운영 위험:** 신규 Auth/Admin API 코드가 운영 DB Migration 미승격(현재 CAD 여섯 개) 상태에서 활성화되면 503·부분 권한 사고 가능. 또한 잘못된 `G7_AUTH_ENABLED=true`나 내부 비공개 증거 없는 Owner GO만으로 사용자 계정/권한 DB에 접근하는 것은 금지. **대응:** 프로덕션 `NODE_ENV`에서 HTTP 예약 API 전부 404, 개발자 loopback+추가 테스트 Flag+UID 전용 후보 SQLite/정식 일회용 Prisma Schema 확인 필요; 운영 `src/prisma/migrations`·Migrator·기존 CAD API/Compose/Nginx 변경 0.
- **권한·감사 위험:** 관리자 단발 bootstrap/recovery Secret·nonce 재사용, 위조 X-Role/Session Cookie/CSRF·Site 우회, Account 생성 KDF DoS/TOCTOU. **대응:** CLI 명시 `--ack-disposable-only`·Secret 0600·Nonce 1회/Session 전량 회수/원자 Audit, 새 쿠키 Path 독립, G4 Admin users:manage DB 사전 인가+감사 후 KDF, User+Audit 거래 내 Role/Session 재검증, 기본 Role 미부여/처음 변경 강제. 잔여 실 운영 보안/동시성/복구는 S3-4 이후 사내 수용 필요.
- **GHCR 미게시 위험:** 새 Next Route/Server 코드는 일반 Main push에서 GHCR 게시로 분류됨. `.github/workflows/docker-publish.yml`에 정확한 Squash 제목 `#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]`와 S3-2 23개 파일만 허용하는 별도 예외 및 부정 제목/활성 운영 Migration·실 CAD/API·Compose 변경 fail-closed, Bash synthetic 회귀 추가. 새 HEAD PR CI·최신 Codex 리뷰 합격 전 병합하지 않으며 이번 요청 범위는 PR CI **시작까지만**.
- **추적 방법:** CI 실패 발생 시 Run ID·Attempt·Job·Step·HEAD·실제 로그 경로/원인/조치/재시도 정보를 다음 섹션에 누적 기록, 취소 Job 보존. **아직 원인 없는 실패를 만들어 기록하지 않는다.** #109/#96 운영 BLOCKED/실 데이터·GHCR 변경 없음.


## Issue #57 / PR #134 — Run 40418875931 실패 및 P1 Migrator 의존성 복구 (2026-10-27 KST)

- **실제 CI 실패:** [PR CI #40418875931](https://github.com/planner77/layoutManager/actions/runs/40418875931), attempt **1**, `pull_request`, HEAD `1a5c26526dc3ba90f12aa7e6f5f150a039180933`, `completed/failure`. Verify [Job 121907950137](https://github.com/planner77/layoutManager/actions/runs/40418875931/job/121907950137)는 Typecheck/ESLint/Unit·Integration/Build/Chromium E2E/Legacy 등 **success**, Docker [Job 121907948037](https://github.com/planner77/layoutManager/actions/runs/40418875931/job/121907948037)은 `Compose fresh install, static assets, health and idempotent migration` **step 16 failure**. 앞의 쓰기금지·의도적 잘못된 SQL 거부 테스트는 성공이며 원인으로 분류하지 않는다.
- **로그 근거:** Docker diagnostics에 `migrate-1 | Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/src/server/upload-error-catalog' imported from /app/src/server/logger.ts`; 이어서 `backfill exited 1`. `scripts/deploy.ts`의 Prisma migration 후 `scripts/backfill-delete-passwords.ts`의 Logger 초기 import에서 중단; Compose `service_completed_successfully` 미충족으로 앱 기동 실패. DB Schema/업로드 DTO/Viewer/Unit 결함이나 GHCR 게시 실패가 아님.
- **P1 리뷰:** [Codex review r4383549858](https://github.com/planner77/layoutManager/pull/134#discussion_r4383549858)는 Logger 신규 Catalog 직접 import와 Docker Migrator 명시적 COPY 누락을 독립 지적(초기 unresolved). 실제 Docker 실패와 동일 root cause.
- **수정:** `src/Dockerfile` Migrator에 `server/upload-error-catalog.ts` 1개 COPY, build에서 `node --import tsx`의 Logger read-only import preflight, `.github/workflows/pr-ci.yml` image 필수 파일/실제 logger import smoke, `src/tests/unit/standalone.test.ts` `TC-LOG-MIG-001`(상대 import→COPY closure) 추가. Full server/Next/테스트 복사, Docker 권한/DB migration/G7 Auth 활성화 없음.
- **재검증 추적:** 소스·검사 추가는 수정 HEAD CI 통과의 증거가 아니다. 이 세트의 로컬 Docker/Unit/E2E `NOT RUN`; 새 HEAD PR CI는 동기화로 **시작 요청**하되 결과 모니터링 생략, 완료 상태 `NOT VERIFIED`. 이전 HEAD의 Verify 성공도 수정 HEAD에 소급하지 않는다. Review reply/resolve, 최신 Main 비교는 별도 GitHub 기록으로 추적.



## Issue #57 — L1 정적 리뷰 위험·해결 기록 (2026-10-27)

- **관측 분류:** 신규 PR/CI Job 실패 또는 취소 0건(이 항목 작성 시 PR CI 시작 전으로, 성공/실패 판단 불가). 아래는 **정적 코드 검토에서 확인한 결함/누출 위험**이며 CI 실패나 실제 보안 사고로 분류하지 않는다. 과거 다른 이슈의 CI 실패 원장은 그대로 보존.
- **원인 A/보완:** `src/server/upload-observability.ts`가 자체 `console.log/warn/error(JSON.stringify)`를 수행해 기존 공통 로거의 `LOG_LEVEL=warn`/LOG_FORMAT·필드 제한과 동기화되지 않았다. 기존 `writeLog` 재사용, 안전한 error catalog 공용화, Schema v1/단계·firstFailure·동일 requestId 보존, TC-L1-001/002/006 추가.
- **원인 B/보완:** `src/server/logger.ts`는 caller가 준 예상 밖 확장 필드를 직렬화해 user path/Locator/data가 stdout/stderr로 유출될 수 있었고 metadata override를 허용했다. emitter 허용 필드만 노출, route 템플릿으로 동적 세그먼트 제거, raw error/cause/stack/message를 안전 code·category로 재정제, schema metadata 덮어쓰기 차단. `src/scripts/{run,g5-preview-smoke,measure-ghcr-pair}.mjs`의 원시 Error 메시지 출력도 고정 텍스트로 교정. TC-L1-002/005/006.
- **검증 경계:** 이 항목은 정적 근거·보완 완료의 기록이지 실행 확인이 아니다. 타입 검사/ESLint/Vitest/Build/E2E/Docker/실 운영 및 PR CI Job 결과는 **NOT RUN/NOT VERIFIED**; 신규 PR 작성 시 검토 스레드/mergeability·trigger만 별도로 기록한다. 실패 발생 시 run/attempt/job/step/HEAD·원인/재시도 이력을 추가한다.


## Issues #124/#126/#127 / PR #132 — 최종 해결·게시 증거 확정 (2026-10-27 KST)

- 아래 keyboard 85/86, DWG 2/4 및 초기 로컬 실패·중단 기록을 모두 보존한다. keyboard 최소 수정 후 독립 86/86, DWG 보완 후 독립 Unit20/DWG4/focused13 PASS로 원인을 검증했다. 최신 HEAD `5b3b717`의 [PR CI 40352404675](https://github.com/planner77/layoutManager/actions/runs/40352404675) Verify121675709873·Docker121675710616 success, 실제 전체 Unit352/E2E86/legacy1 PASS. 이전 fd9 Run40349738685 success는 별도 HEAD 근거이다.
- Squash main `f2c04bf`의 [Main CI 40354233607](https://github.com/planner77/layoutManager/actions/runs/40354233607) scope121682247638·publish121682336818 success. v0.42.0과 동일 source App/Migrator 후보 digest 검증→버전/최신 pair 승격·registry inspect·OCI 계측 성공 뒤 #124/#126/#127을 completed 종료했다. 새 PR/Main CI 실패·취소는 관측되지 않았다.
- Root의 추가 실제 200% 확대 시험에서 첫 임시 probe는 Escape 직후 rAF 포커스 복귀 전 즉시 값을 읽어 `Zoomed menu Escape lost focus`를 반환했다(`/tmp/layoutManager-actual-zoom200-initial-query.txt`). source 변경 없이 포커스 복귀 완료를 기다린 재검증이 통과했고 원본 관측을 보존했다. 제품 변경을 추가하거나 최초 시도를 PASS로 기록하지 않는다. 완료 관측·API 배율/화면값·캡처는 TestReport와 `actual-zoom-200.json`을 따른다.


## Issues #124/#126/#127 / PR #132 — 초기 CI 성공과 보충 DWG 진단·probe 실패 (2026-10-27 KST)

- **CI 실패와 구별:** HEAD `fd9eeaf`의 [Run 40349738685](https://github.com/planner77/layoutManager/actions/runs/40349738685) completed/success, Verify 121666219572·Docker 121666218874 각각 success. 독립 full E2E 86/86, Unit 351/351, legacy 1/1도 PASS. 아래 실패는 default CI에 없는 추가 DWG probe에서 관측했으며 최초 CI 성공을 삭제하지 않는다.
- **실제 추가 실패 2/4:** `/tmp/layoutManager-issues124-127-qa-final-dwg.log`. `dwg-viewer.probe.ts` TC-DWG-002/004에서 WASM 404 후 예상 고정 `WASM 초기화 실패` 대신 generic `adapter-load:LOAD`가 표시됐다(:256). 정상 load/메뉴/fullscreen은 별도 PASS. `dwg.probe.ts` TC-DWG-001/003/005는 `/lab/dwg`에 없는 Viewer 그룹 메뉴 helper를 기다려 120초 timeout; 제품 parse failure와 구별한다.
- **조치:** DWG SIZE/HEADER/WASM_INIT/PARSE/EXTRACT/WORKER_INIT/TIMEOUT의 고정 message와 typed stage/code allowlist를 모두 검증하여 공개 진단만 유지한다. 임의 raw Error·위조 문구·잘못된 stage·미등록 code·DXF 오적용은 generic LOAD로 차단하는 Unit 추가. lab 시험은 기존 실제 확대 버튼으로 복원했다. 라이브러리·WASM·Geometry/DB 변경 없음.
- **재검증:** Developer type/lint/build·Unit20/DWG4/focused13 PASS. 독립 post-fix type/lint·Unit20·DWG4 PASS(24.0s). 독립 focused13/13도 PASS(47.7s), Manager 로컬 수용. 새 HEAD PR CI 등 남은 결과는 후속 관측으로 기록하며 fd9 CI를 재사용하지 않는다.


## Issues #124/#126/#127 — 키보드 최소 수정과 후보 재고정 (2026-10-27 KST)

- 1차 독립 QA 85/86의 실패·trace는 아래 원본 항목에 보존한다. 메뉴 전환 후 `requestAnimationFrame`으로 지연한 포커스를 `useLayoutEffect`의 DOM commit 직후 처리로 바꾸고, trigger가 처리한 ArrowUp/ArrowDown/Enter/Space의 전파를 차단해 상위 메뉴에서 같은 키를 중복 처리하지 않도록 했다. 레이아웃·Adapter/DB/원본 변경 없음.
- Developer Typecheck/Lint/Production Build, trigger keyboard 1/1 및 강화된 전체 focused 13/13 PASS를 Manager가 확인한 뒤 후보를 재고정했다. 해당 `/tmp/layoutManager-issues124-127-trigger-*` 로그는 로컬에 보존한다. 독립 QA 전체86·DWG4·legacy 및 최신 PR CI 결과는 아직 대기 중이며 이전 결과를 새 후보 전체 PASS로 전용하지 않는다.


## Issues #124/#126/#127 — 초기 로컬 게이트 관측 (2026-10-26)

- **환경 선행조건:** 격리 worktree의 첫 Typecheck는 설치 전 `tsc: not found`; npm ci 후 Prisma Client 생성 전에는 generated import 부재. `npm ci`와 `npm run db:generate` 후 Typecheck PASS. 원본 사용자 worktree와 운영 DB/환경은 변경하지 않았다.
- **초기 targeted Unit 13/15:** `dwg-adapter.test.ts / TC-VIEW-001`은 DXF invalid query의 구 기본값 dxf-viewer, `viewer-app-state.test.ts / TC-U1-UNIT-001`은 신규 toolsOpen 없는 구 상태를 기대했다. 새 승인 계약에 맞춰 기대를 갱신한 targeted 18/18 PASS. DWG renderer 불변 검사는 유지.
- **초기 전체 Unit 345/348:** `viewer-link.test.ts / TC-LINK-001` 2건이 구 DXF 기본값, `viewer.test.ts / TC-VIEW-003` 1건이 구조화 이전 raw parse error를 기대. 링크 기본값 및 adapter-load:LOAD 구조 assertion으로 갱신, 해당 focused 10/10 PASS. 전체 재실행 결과는 별도 TestReport에 기록한다.
- **초기 신규 E2E 4/5:** source404 시험의 전역 `getByRole('alert')`가 Viewer 오류와 Next route-announcer를 동시에 선택했다. Viewer shell로 scope를 한정한 expanded focused 7/7 PASS. source 실패 자체를 renderer 성공으로 처리한 제품 결함은 관측되지 않았다.
- **초기 전체 E2E 진단 중단:** 80개 중 실행 진행 18 시점에 중단. 구 직접 toolbar/menu locator와 Viewer의 구 전역 loading 기대가 새 그룹 메뉴/지역 loading 계약과 충돌하여 반복 timeout 발생. 전체 PASS나 완료18건으로 기록하지 않는다. 지정 두 번째 Developer가 기존 시나리오를 새 실제 메뉴/Drawer 흐름으로 이관하며 테스트 삭제/skip으로 대체하지 않는다.
- **관측 로그:** 로컬 `/tmp/layoutManager-issues124-127-initial-failures.md`, `-focused-e2e.log`, `-legacy-e2e-first.log`, `-build.log`(동일 prefix). 로그/스크린샷/DB/CAD는 Git 제외. 실제 후속 실패·수정·QA 및 CI 상태는 누적 보존한다.

## Issues #124/#126/#127 — 독립 QA 전체 E2E의 메뉴 키보드 실패 (2026-10-27 KST)

- **환경/실행:** 격리 worktree `/home/planner/Dev/layoutManager-issues124-127`, candidate 0.42.0 frozen source, Node 22.14.0 / npm 11.10.0 / Playwright 1.63.0 / Chromium 1243 SwiftShader, isolated test DB/CAD; `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome CAD_E2E_PORT=3103 npm --prefix src run test:e2e -- --output=/tmp/layoutManager-issues124-127-qa-e2e-results`.
- **관측:** full Playwright 86 tests, 1 worker, 6.5m: **85 passed / 1 failed**. Failure `TC-127-MENU: keyboard directions, Space link activation and focus return`, `src/tests/e2e/issues124-126-127.spec.ts:198`; at assertion line 210, after ArrowRight navigates from the last View menu command into Work and Escape is pressed, the Work trigger is `aria-expanded=true` but not focused. `toBeFocused()` timed out at 5s. Exact evidence: `/tmp/layoutManager-issues124-127-qa-e2e.log` and `/tmp/layoutManager-issues124-127-qa-e2e-results/issues124-126-127-TC-127-M-01130-activation-and-focus-return/{error-context.md,trace.zip}`.
- **원인/후속:** primary Developer's read-only diagnosis is keyboard focus is moved with `requestAnimationFrame` after the Work menu render, allowing Escape before focus reaches its menu root. Manager approved a minimal synchronous post-commit keyboard focus fix using `useLayoutEffect`; no source/test edits occurred during this run. Full suite otherwise passed, but candidate acceptance remains pending the fix, focused regression, rebuilt candidate, independent full E2E, public four-probe DWG suite and legacy master-migration suite.
- **Other local gates:** independent Typecheck PASS, ESLint PASS with 3 warnings, Vitest 351/351 PASS. No independent QA build/PR CI/Main CI/GHCR or real #113 CAD/GPU run is represented by these results.

## Issues #124/#126/#127 — 중간 수정·재검증 관측 기록 (2026-10-26~27)

- **Legacy UI 이관 중 관측:** 전체 mutable 진단은 `/tmp/layoutManager-issues124-127-legacy-fourth.log` 기준 **76/85 PASS, 9 FAIL**. 구 toolbar/menu locator·구 loading 기대 등 selector 계약이 새 UI와 맞지 않은 사례를 포함한다. 이관 후 `/tmp/layoutManager-issues124-127-legacy-targeted.log`의 affected subset **9/10 PASS**, 이어 `/tmp/layoutManager-issues124-127-issue43-rerun.log`의 남은 단일 케이스 **1/1 PASS**. 이 단계 결과는 최종 최신 source candidate 전체 legacy suite 통과 증거가 아니며 독립 재실행은 pending이다.
- **Three font/Blob 종료 race:** 실제 브라우저에서 Three가 Korean font fetch를 기다리는 동안 renderer dispose 후 Blob fetch가 늦게 시작되어 `ERR_FILE_NOT_FOUND`가 발생했다. 진행 콜백에서 `disposed` 상태를 먼저 확인하여 늦은 fetch를 막고 object URL 즉시 revoke하도록 보완했다. >1s font 지연 후 전환 시험 및 legacy workflow console-clean 재검증은 통과했다; 최신 full candidate 독립 전체 E2E 결과와 분리한다.
- **Lint/build 중간 발견:** 새 `setState-in-effect` lint 오류는 renderer-keyed fallback 상태 구조로 수정하여 ESLint를 통과시켰다. 이 항목은 별도 CI 실패가 아니며, 현재 독립 Lint의 남은 3 warnings는 TestReport에 열거했다.
- **브라우저 실행 산출물 경합:** 병렬 Playwright 실행이 공용 `test-results` output을 공유하며 ENOENT를 냈다. 그 실행은 유효한 제품 실패로 세지 않았으며 이후 unique port/output을 사용했다. 최신 독립 E2E는 전용 `CAD_E2E_PORT=3103` 및 `/tmp/layoutManager-issues124-127-qa-e2e-results/`로 85/86 완료했다.
- **정적 키보드/overlay 검토:** Escape 계층 처리, tooltip hover/focus/touch/scroll 접근, mobile modal Drawer focus trap·복귀와 삭제 확인 overlay 층의 정적/집중 재검토에서 수정이 이뤄졌다. 현 독립 full E2E가 별도로 확인한 메뉴 Escape focus-return 결함은 상단 섹션에 기록했으며 최종 재검증이 필요하다.


## Issue #109 S3-1 — 배포 시 자동 Prisma Migration 위험 및 정적 방지 조치 (2026-10-26)

- **실제 CI/Job 실패 관측:** 신규 S3-1 PR CI는 이 문서 작성 시점 시작 전이므로 **신규 실패 0건(미관측)**. Test 및 Docker 성공을 추측하지 않는다. 아래 기존 PR #125/#129 실패·취소 및 리뷰 기록은 전부 보존한다.
- **위험 요인:** 운영 migrator `src/scripts/deploy.ts`는 기동 즉시 기본 `prisma migrate deploy`를 실행. S3 Auth/Session/Audit DDL을 현재 활성 `src/prisma/migrations`에 즉시 배치하면 향후 무관한 배포에서 무승인 운영 Migration이 자동 실행될 수 있다. 또한 신규 Prisma 모델만으로 실제 운영 DB가 준비됐다고 오판할 위험이 있다.
- **대응:** 운영 `src/prisma/schema.prisma`는 코드생성용 모델만 확장, 신규 정식 형식 SQL은 격리 `src/deploy/g7-s3/prisma/migrations/202610260002_g7_operational_auth`에 두고 CAD 6개 동일 이력을 함께 보관. 기본 migrator/활성 SQL/Compose/.env/실 DB·CAD/S3는 수정하지 않음. 별도 Test Prisma config의 Linux canonical /tmp·UID·0700/0600·marker/URL/flag 검증 실패 시 SQL 시작 전 거부. 후보 SQL 적용/rollback/원본 무결성은 isolated Vitest/Prisma에서 검증되도록 작성.
- **Gate/릴리스 위험:** Owner의 S2 일반 승인만으로 실제 후보 digest·Schema·Scope/기간/실복구 GO를 자동 수용할 수 없음. Pure preflight에서 App/Migrator version/SHA/OCI 증거/Owner GO mismatch는 eligible=false, runtimeActivated=false 유지. 실 OCI Registry/rollback 증거와 내부 시험 원본은 아직 제공되지 않으며 PASS 창작 금지.
- **GHCR 예방:** 정확한 미래 squash `#109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]` + S3-1 경로 허용 목록만 Main `publish=false`. 금지된 활성 migration/기존 CAD API/Compose 및 제목 변형은 fail-closed하도록 synthetic Bash 회귀 작성. **본 PR 요청은 PR CI 시작까지만**; 병합/Main CI/GHCR 게시·운영 적용/이슈 종료 미수행.
- **추적 규칙:** 신규 CI 실패/취소 발생 시 RUN/Attempt/Job/Step/log source+원인/수정/재시도 HEAD를 다음 원장 섹션에 **추가**하며 기존 실패를 덮어쓰지 않는다. 진행 상태: S3-1 schema/migration candidate 구현·시험 작성, 합격은 HEAD CI와 Codex Review 이후 확인.



## Issue #109 / PR #129 — 기존 CI PASS·Codex P1 S2 GHCR 게시 위험 및 조치 (2026-10-26 KST)

- **검증된 이전 결과(실패 아님):** [PR CI 40313233131](https://github.com/planner77/layoutManager/actions/runs/40313233131), 시도 1, HEAD `29ed3028bf0f78ba37abba0ecde73a6483d0942f`, `completed/success`. Verify [Job 121539323884](https://github.com/planner77/layoutManager/actions/runs/40313233131/job/121539323884)와 Docker [Job 121539323971](https://github.com/planner77/layoutManager/actions/runs/40313233131/job/121539323971) 각각 `success`. 이후 추가 수정 HEAD의 PASS는 별도 확인 필요.
- **코드 리뷰 P1(실제 CI 실패/GHCR 게시와 구분):** [Codex #4376591801](https://github.com/planner77/layoutManager/pull/129#discussion_r4376591801), 파일 `src/scripts/g7-s2-readiness.ts`. 기존 `.github/workflows/docker-publish.yml`은 S2 스크립트·서버·테스트를 일반 runtime 변경으로 판단해 `publish=true`를 설정한다. S1 `G7-S1-NO-GHCR` 제목을 대신 쓰면 S2 경로 미허용으로 fail-closed하여 요구한 비게시 병합 경로를 충족하지 못한다. **실제 관측 GHCR 오류·새 이미지 게시 0**; 배포 전 정책 누락이다.
- **원인:** S1 전용 정확 제목과 allowlist 정책은 별도 S2 오프라인 증거 평가 툴/새 Unit의 파일 이름을 포함하도록 설계되지 않았다. 첫 PR CI는 앱 로직 및 테스트 검증이지 Main GHCR 발행 판정이 아니다.
- **교정:** S1 정책 그대로 유지하고 **별도** 정확 제목 `#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]`과 **S2 개별 파일 allowlist**를 release-scope에 추가. S2 제목이지만 비허가 운영 경로/일반 소스/S1 Stage 파일/별도 workflow가 섞이면 `stderr` 거부 후 `exit 1`; 유사 제목·후행 공백·접미는 동일하게 오류 종료. 일반 runtime 변경 및 tag 릴리스는 원래 publish 판정 유지. Regression은 기존 `src/tests/unit/g7-staging-ghcr-guard.test.ts`에 정상 S2 전 파일·다중 본문, 비허가 여러 경로, 잘못된 제목, S1 역방향, 일반 런타임/태그 사례 추가.
- **변경·검증 경계:** 추가 코드 및 문서 기록은 아직 신규 HEAD CI 성공 근거가 아니다. 변경 후 Main `behind=0`, 리뷰 댓글 회신·Resolved 및 신규 PR CI **시작까지만** 진행, 모니터링/PR 병합/실 GHCR 게시/운영 Auth·Migration/Nginx·Compose/실 데이터/이슈 종료 불가. 기존 다른 이슈 실패와 PR #125 실패 기록은 아래 그대로 유지.


## #109 S2 준비 도구 — 미확인 사항 및 실패와의 구분 (2026-10-26)

- Owner가 내부 시험 결과를 외부 제출할 수 없다고 통지함. **증거 없음 = 시험 FAIL로 단정하지 않으며, 외부에서 독립 검증하지 못한 경우 NOT VERIFIED**로 관리. CI/실험 실패는 관측한 Run·Job만 기록한다.
- 위험: 기존 Legacy CAD Auth/Prisma/실 DB+CAD+S3 복구/이미지 pair는 여전히 미구현 또는 내부 근거 비가시. 사내 비반출 Manifest 평가/Runbook/Unit 작성만으로 해소되지 않는다. S3 자동 실행을 차단하고 #109·#96 OPEN/BLOCKED 유지.


## Issue #109 / PR #125 — PR CI 40275956996 Unit 실패·P1 리뷰 3건 누적 및 수정 HEAD 검증 게이트 (2026-10-26 KST)

- **실제 CI 실패 원장:** [Run 40275956996](https://github.com/planner77/layoutManager/actions/runs/40275956996), attempt **1**, HEAD `818264afb8809ccf0a3e09262e1a09054fd43004`, `pull_request.synchronize`, `completed/failure`. **Verify [Job 121418632923](https://github.com/planner77/layoutManager/actions/runs/40275956996/job/121418632923) failure**, Docker [Job 121418632714](https://github.com/planner77/layoutManager/actions/runs/40275956996/job/121418632714) **success**. 출처: 해당 Job의 Actions 원본 로그·Step 목록. TypeScript·ESLint **PASS**, `Unit 및 Integration 테스트` **실패**; **59 Test Files = 58 PASS / 1 FAIL, 313 Tests = 312 PASS / 1 FAIL**. `tests/unit/g7-staging-ghcr-guard.test.ts:91:27`의 `expect(result.stderr).toContain('G7-S1 GHCR exclusion disallowed path')`에서 실제 stderr는 빈 문자열; GitHub Actions `echo` 메시지는 **stdout**으로 출력됐다. 잘못된 경로 차단 자체는 의도대로 **exit 1**이며 보안 우회/실제 GHCR 게시 실패가 아니다. Verify의 OCI layer Unit·DXF benchmark·Production Build·Chromium E2E·Legacy Migration E2E는 **SKIPPED**(PASS 아님). 조건부 E2E 실패 artifact 업로드 Step은 SUCCESS이나 수집 파일 없음; 자체 실패로 세지 않음.
- **직접 결함 원인/조치:** 독립 `runScope` fixture에서 stdout/stderr Assertion과 Main release-scope Bash 출력 스트림의 불일치. `.github/workflows/docker-publish.yml`의 비허용 경로 거부 메시지를 **stderr `>&2`**로 변경, Unit이 stderr 오류/exit 1 및 stdout 비포함을 검증하도록 확대. 종료 코드 0으로 완화하거나 GHCR 자동 게시 예외를 넓히지 않는다. 수정 코드 최신 PR CI 실행 전은 **NOT VERIFIED**.
- **P1 리뷰 #1 — 정확한 커밋 제목:** [r4374313158](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313158). 기존 Bash의 인용부호 밖 `*`가 exact 비교가 아닌 prefix 비교여서 `... NOT-APPROVED` 제목도 Stage-only 변경의 GHCR 게시 생략 허용. **보완:** `COMMIT_SUBJECT="$(sed -n '1p' <<< "$COMMIT_MESSAGE")"`로 첫 줄만 추출하여 고정 제목과 **정확 일치**할 때만 skip, 정상 squash multiline 본문은 허용. 비슷하지만 다른 제목은 **Main CI fail-closed**; Unit에 suffix/공백/멀티라인 구분 사례 추가. 본 문제는 이전 CI의 실패 Step과 별개인 리뷰 P1이다.
- **P1 리뷰 #2 — 운영 DB Migration 경로 차단:** [r4374313165](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313165). 이전 `src/deploy/g7-staging/prisma.config.ts`는 `G7_STAGING_DATABASE_URL`을 검증 없이 Prisma에 전달하고 기본 대체 파일 경로도 정의하여, 잘못 운영 DB를 지정하면 Auth Schema를 수정할 가능성. **보완:** config 로딩 즉시 동일 Stage Runtime `resolveG7StagingGate(process.env)`의 `/tmp` 안전 디렉터리·uid·symlink/realpath, DB URL 일치·전용 CAD 경로·schema/manifest·release/operation 조건을 검증. 실패시 **`G7_STAGING_PRISMA_TARGET_DENIED`** 를 throw하여 **Prisma가 SQL을 실행하기 전 차단**, fallback URL 폐지. 잘못된 기존 DB URL/변경 전후 센티널 불변을 검사하는 `tests/unit/g7-staging-prisma-config.test.ts` 추가. **실제 수정 HEAD CI 미완료**.
- **P1 리뷰 #3 — 로그 출력 스트림:** [r4374313173](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313173). 첫 실패 Test와 같은 Assertion. 위 stderr 라우팅·회귀 Assertion으로 **P1 조치**(독립 두 번째 CI 실패로 중복 계상 금지).
- **자가 수정 이력(실패 Run과 구분):** Workflow 편집 중 `31966129` 임시 HEAD의 쉘 첫 줄 추출 문자열이 편집 오류로 오염된 것을 코드 검토에서 발견, `574c52a5`에서 이전 Main 본문으로부터 재구성하고 `sed -n '1p'` 방식으로 안전 교정. 이 중간 커밋의 PR CI 성공/실패를 임의 추정하지 않는다. 최초 성공 [40270394055](https://github.com/planner77/layoutManager/actions/runs/40270394055)는 이전 HEAD `a82a04bb`에만 유효, 이번 실제 실패와 서로 독립 보존.
- **재검증·병합 경계:** 해당 3건 리뷰 스레드에 구체 변경 회신→Resolved를 확인하고 최신 Main `behind=0`/충돌 없음 및 PR CI **새로운 HEAD 시작까지만**. 사용자 지시에 따라 모니터링·PR 병합·Main CI·GHCR 게시·실 운영 Auth/Prisma/Nginx/Compose/.env/DB/CAD/S3·이슈 종료 **미수행**. 수정 HEAD 성공 확인 전 `S1 PASS`라 선언하지 않는다. 기존 운영 읽기 익명/쓰기 계약, 신규 영속 API·Audit purge OFF, #109/#96 OPEN/BLOCKED 유지.


## Issue #109 / PR #125 — 최초 CI PASS 보존·리뷰 및 GHCR 게시 차단 보완 (2026-10-26)

- **관측 PR CI 성공(실패 아님):** [Run 40270394055](https://github.com/planner77/layoutManager/actions/runs/40270394055), HEAD `a82a04bb2412859e998616902e22f0efceab35c4`, Verify [Job 121401764981](https://github.com/planner77/layoutManager/actions/runs/40270394055/job/121401764981)와 Docker [Job 121401764781](https://github.com/planner77/layoutManager/actions/runs/40270394055/job/121401764781) 전부 `completed/success`. 이 단계에서 CI 실패/취소 관측 0. 변경 HEAD에 기존 성공 소급 금지.
- **Codex 리뷰:** 구 HEAD 코드 리뷰 상태 `running`, 공식 Review/Thread 0. **리뷰 승인·완료로 오분류하지 않고** 최종 결과 및 보완 필요 여부 재확인; Main behind=0/mergeable은 최종 HEAD에서 재조회.
- **운영 위험 및 조치(관측 CI 실패 아님):** Main 기본 workflow는 runtime 코드 diff를 자동 GHCR build/push 대상으로 판정한다. 사용자 `GHCR 미게시` 지시를 충족하도록 정확한 `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]` 스쿼시 제목 + Stage/docs/해당 workflow 경로만 허용하는 예외를 추가. 예외 제목인데 다른 runtime 경로 포함시 **Main CI 실패(fail-closed)**, 일반 runtime 변경 및 tag push는 기존 게시 정책 유지. `g7-staging-ghcr-guard.test.ts`로 Bash 구문/정상 Stage skip/비허용 경로 거부/일반 runtime publish/docs-only 분기 시험 작성.
- **작성 오류·교정(=CI 실패 아님):** workflow 최초 편집 commit `c75b112a`는 shell 문구 삽입 이상을 즉시 자체 검토로 발견, `f0923b8b`에서 기존 Main YAML로 안전 재생성 후 `1c3db369` 등으로 명세 정렬. GitHub Actions 실패라고 꾸미지 않으며 새 HEAD의 실제 CI 통과 전 조치 검증 완료 주장 금지.
- **쿠키 격리:** Stage와 미래 운영이 동일 Host에 있으면 `cad_session`이 충돌 가능하므로 Stage 전용 `cad_staging_session`/Stage Path, G3/G4 내부 요청 매핑 및 Logout/동시 Cookie 테스트 수정; 기존 일반 Auth/CAD Route 변경 0. 최초 CI 이후 수정으로 신규 HEAD CI 필요.
- **수용 범위의 한계:** Stage JSON/base64 DXF 미러는 운영 Multipart CAD API가 아니며 실 S3/이미지 digest·동일 snapshot 데이터 복원·Owner GO 증거가 없음. G6 #108 Owner 수용은 별도. 실 Audit purge/Outline/Memo/Type/Logs 영속 API OFF.
- **필수 게이트:** 새 PR CI Verify/Docker 둘 다 성공, Codex 리뷰 완료 및 0 미해결 스레드, Main 정렬/mergeable, GHCR scope 정상 차단을 확인한 뒤에만 Squash 병합. 최신 Run/Job·시도/실패(관측 시에만)를 후속 원장에 추가. Main CI 시작·성공과 GHCR 실제 Job SKIPPED를 구분 기록.



## Issue #109 G7 S1 — Staging 단일 PR 최초 CI 전 위험/검증 분리 (2026-10-26)

- **시작 기준:** #109 S0 문서 PR #123은 최종 [PR CI 40264751029](https://github.com/planner77/layoutManager/actions/runs/40264751029) 성공/병합 완료. 이번 S1은 단일 브랜치 `feat/issue-109-g7-staging-integration`, 별도 코드·검증 HEAD. **S1 PR CI 실패·취소는 이 기록 작성 시점 아직 관측되지 않았으므로 실패를 창작하지 않음.** 기존 누적 다른 이슈 실패는 보존.
- **기술 위험/대응 (관측 실패 아님):** (1) 운영 migrator가 `src/prisma/migrations` 자동 적용 → Stage 전용 `src/deploy/g7-staging/prisma.config.ts`·독립 7 migrations로 차단, 운영 Schema/Compose 미수정. (2) G1~G4 fixture 테스트 전용 동작을 Stage에 이식 → Stage 서비스·원자 트랜잭션/세션/Grant·Audit·Admin 단발과 격리 Root 필수. (3) Release manifest의 두 digest는 Stage 후보 선언 참조일 뿐 실제 GHCR OCI 서명 검증 아님 → 운영 S2에서 독립 증빙 필요. (4) Staging JSON/base64 DXF 쓰기 미러가 운영 Multipart 라우트와 동일하지 않음 → 운영 Cutover PASS 주장 금지, S2/S3 별도 대조. (5) 스테이징 DB/파일과 운영 데이터 혼합 → UID/tmp prefix/realpath 및 DB URL·Storage 고정, 미일치 404/거부. (6) Audit 정리/실 CAD 파일 삭제 → 미승인 자동 purge/운영 API 연결 금지.
- **재검증:** TC-P4-G7-001~015와 `prisma migrate deploy --config deploy/g7-staging/prisma.config.ts`는 disposable DB를 대상으로 CI에서 실행할 예정. 새 PR CI 시작만으로 합격 판정 금지. 실제 실패시 HEAD/Run/Attempt/Job/Step·로그 출처·시도/조치를 여기 추가한 뒤 후속 HEAD 재검증. 검증 성공 이후에도 실제 운영 GO 없이 병합·GHCR·Auth ON/Prisma/Nginx/Compose/실 DB 조작·Issue 종료 금지.


## Issue #109 / PR #123 — P1 필수 문서 인덱스 누락·#108 Main 선행 정렬 및 재검증 (2026-10-26 KST)

- **최초 PR CI 실증(실패 아님):** [PR #123](https://github.com/planner77/layoutManager/pull/123) 구 HEAD `eb14fca4417658c6224c5d9c8ce59170f1cdb241`의 [Run 40258627540](https://github.com/planner77/layoutManager/actions/runs/40258627540) `completed/success`. Verify [Job 121365862902](https://github.com/planner77/layoutManager/actions/runs/40258627540/job/121365862902) 및 Docker [Job 121365863147](https://github.com/planner77/layoutManager/actions/runs/40258627540/job/121365863147) 모두 성공. 이 HEAD 성공은 이후 수정·정렬 HEAD에 소급 적용하지 않음. **이번 PR에서 CI 실패/취소는 현재 관측되지 않음.**
- **독립 P1 코드 리뷰(실제 CI 실패와 구분):** [r4373470347](https://github.com/planner77/layoutManager/pull/123#discussion_r4373470347)에서 신규 `out/Issue109.md`의 `AGENTS.md` "**상세 문서와 필수 참조 시점**" 표 등록 누락을 지적했다. G7 Runbook 본문 링크만 작성하고 필수 인덱스·언제 참조해야 하는지 누락한 것이 원인. **보완:** AGENTS.md 필수 참조 표에 `Issue109` 목적과 "운영 인증 활성화/기존 CAD 쓰기 cutover/정식 Migration/Nginx·Compose 배포/Owner Go-No-Go/장애 복구·롤백" 필수 참조 시점을 1행 명시. 신규 상세 Markdown 추가 시 AGENTS 문서 인덱스 점검을 재발 방지 단계로 적용. [#108 PR #122](https://github.com/planner77/layoutManager/pull/122)의 동일 표 등록 P2 리뷰와 유형상 유사하지만 별개 작업/심각도·이력으로 보존.
- **Main drift·문서 충돌(실패 아님):** 구 PR HEAD 대비 #108 [PR #122](https://github.com/planner77/layoutManager/pull/122) squash가 [main `b12a431579f0a838f61becc4c003d02214f6572b`](https://github.com/planner77/layoutManager/commit/b12a431579f0a838f61becc4c003d02214f6572b)에 선행 병합되어 #123 `behind=1 / mergeable=false`. 공통 AGENTS/Architecture/Database/Decisions/Operation/Requirements/TestPlan/TestReport Markdown에 #108 증거 하네스·설계와 #109 G7 Runbook 문구가 동시 갱신됐다. PR #122의 `src/scripts/g6-evidence.mjs`, G6 fixture/integration/unit·README/Issue108/ChangeLog/FailureLedger와 G7 문서 10개를 모두 보존하는 **비강제 two-parent merge**를 적용한다.
- **상태 정합성 보완:** 최신 #108은 Owner가 2026-10-26 직접 현장 시험 수행·이상 없음 보고하여 `closed/completed`. PR #122 [PR CI 40261780999](https://github.com/planner77/layoutManager/actions/runs/40261780999)·[Main CI 40262632038](https://github.com/planner77/layoutManager/actions/runs/40262632038) 성공은 문서 이력으로 확인. 하지만 개별 원본 현장 로그·복원 checksum·비공개 증거 ID는 공개 GitHub에서 **독립 미열람**. 따라서 G7의 별도 운영 증거 패키지 확인·Owner Go/No-Go는 PENDING으로 두고 #109/#96 `OPEN/BLOCKED`를 유지하며 구 문서의 "#108 OPEN/현장 NOT RUN" 최신 상태 주장만 교정한다.
- **수정 HEAD 재검증 게이트:** 위 보완·정렬 후 PR head와 main의 behind=0, 리뷰 스레드 0/충돌 없음, docs-only diff 및 동일 HEAD의 새 Verify/Docker PR CI **둘 다 completed/success 확인 후에만 squash 병합**. 최종 Run/Job/HEAD 기록은 실 결과 확인 시 Issue/PR에 추가; 최초 성공 결과를 재사용하지 않음. 새 실패·취소 발생시 Run/Job/Step·원인/조치·재시도 ID를 별도 누적하고 기존 원장 이력 보존.
- **운영 경계:** 이 PR은 Markdown 설계/원장만 추가. 기존 Auth/Admin·신규 영속 API/정식 Prisma Migration/Nginx·Compose/.env/실 DB·CAD·S3/GHCR 및 기존 익명 CAD GET·Current/Delete 동작 변경·활성화 **0**. #109 별도 Owner GO 전 운영 cutover 금지.



## Issue #108 / PR #122 — P2 필수 문서 표 누락 보완·수정 HEAD 재검증 게이트 (2026-10-26 KST)

- **관측 기존 성공:** [PR CI 40257054743](https://github.com/planner77/layoutManager/actions/runs/40257054743), 최초 PR HEAD `9c8bfc1062b33964928b299ebc4cfe80e319378c`에서 `completed/success`. Verify [Job 121361049386](https://github.com/planner77/layoutManager/actions/runs/40257054743/job/121361049386) SUCCESS(Typecheck/Lint/Unit·Integration/Build/Playwright E2E), Docker [Job 121361049207](https://github.com/planner77/layoutManager/actions/runs/40257054743/job/121361049207) SUCCESS; 실패 결과 Artifact 업로드 SKIPPED는 조건부 정상. **기존 CI 실패는 관측되지 않음.**
- **P2 코드 리뷰(실패와 구분):** [r4373409989](https://github.com/planner77/layoutManager/pull/122#discussion_r4373409989) — 신규 `out/Issue108.md`가 AGENTS.md '상세 문서와 필수 참조 시점' 표에 미등록되어 향후 G6 복구·현장 증거 작업에서 필수 문서를 누락할 수 있음. **원인:** 상세 가이드는 신규 작성·본문 링크했으나 필수 참조 테이블 행 삽입을 놓침. **보완:** AGENTS.md 표에 G6 증거 검증·실 LAN PC 2대·SQLite/CAD/S3 실 Backup/Migration/Restore/QA·G7 Go/No-Go 선행 참조 조건을 명시.
- **수정 HEAD 검증 및 병합 경계:** 문서 보완·이 원장/시험보고서 변경 후 PR CI `pull_request.synchronize`를 **다시 실행해야 함**. 이전 HEAD 40257054743 SUCCESS는 후속 HEAD의 성공 증거가 아님. 미해결 스레드 답변·Resolved, 최신 main behind 0/무충돌, 신규 HEAD Verify+Docker 성공 확인 전 병합 불가. 새로운 실패/취소가 발생하면 Run/Attempt/Job/Step·원인·조치·재시도 이력 추가하며 기존 기록 삭제 금지. 원격 GitHub 변경 수행 시 로컬 npm/Docker/Playwright 별도 실행 NOT RUN.
- **업무·배포 경계:** 테스트/오프라인 도구+Markdown만 변경, `src/app/api/**`·운영 Prisma/Migration·Nginx/Compose/.env·실 DB/CAD/S3·기존 익명 CAD GET 변경 및 G7 Auth 활성화 0. 실 현장 PC 2대/로그인 HTTP E2E·실 Backup/Restore·Owner 증거 **NOT RUN**, #108 OPEN; #109 Owner Go/No-Go 전 운영 OFF. PR #122 병합은 현장 수용·이슈 종료와 별개. GHCR 신규 게시를 위해 버전 태그를 변경하지 않음.

## Issue #108 G6 — PR CI 시작 전 누적 원장·실증 미수행 기준선 (2026-10-26 KST)

- **실패 관측:** Issue #108 신규 구현 브랜치 `feat/issue-108-g6-evidence-rehearsal`의 PR CI Run/Job 실패나 취소는 이 문서 작성 시점 **아직 관측되지 않음**. 원장의 기존 다른 이슈 실패·취소/재검증 기록은 아래 모두 보존한다. Run 출처 없는 실패를 창작하거나 기존 실패 기록을 성공으로 고쳐 쓰지 않는다.
- **구현/잠재 위험(실패와 구분):** G6 증거 완결성 도구, 일회용 실제 6 CAD Migration SQLite·합성 local CAD/mock-S3 백업→격리 G1 Fixture migration→복원 검증과 19개 NOT_RUN 템플릿. 실 S3/운영 복원·실 LAN PC 2대·보호 Auth Route E2E **NOT RUN**, 기존 #107 GHCR/Preview·G1/2/3/4 합성 검증을 현장 PASS로 전용하지 않음. 가짜 EV ID, snapshot 불일치, 앱/마이그레이터 버전 불일치, 비공개 데이터 출력, 운영 Auth/Prisma 활성화는 TC-P4-G6-001~007과 운영 OFF 계약으로 차단하도록 설계했으나 **신규 HEAD 실행 결과 미확인**.
- **후속 처리:** 신규 PR 생성→리뷰 스레드·Main 충돌 확인→`pull_request.opened` PR CI 시작, Run/HEAD/attempt/Job을 관측할 때만 누적 기록 추가. Typecheck/Vitest/Build/E2E/Docker 테스트 PASS는 실행 증거 전 NOT VERIFIED. 사용자 요청에 따라 CI **시작 확인 후 모니터링 생략**, 병합·GHCR·운영 배포/이슈 종료 없음. 운영 API/Prisma/Compose/Nginx/.env·실 CAD/DB/S3/감사 물리 purge 변경 0, G7 #109 Owner Go/No-Go 전 OFF. [Issue108](Issue108.md).


## Issue #106 / PR #120 — 실패 복구 최종 확인·후속 GHCR 0.41.1 신규 CI (2026-10-26)

- 원장 아래에 기록된 첫 [Run 40252656906](https://github.com/planner77/layoutManager/actions/runs/40252656906) G4 9개 Unit/Integration 실패(Site 이름 Unique)와 별도 P1 Audit Scope 누락 기록은 변경·삭제하지 않는다.
- 수정 HEAD `d4afaf0ae3cee51a172dad9305533d941daa5706`의 [PR CI 40253887969](https://github.com/planner77/layoutManager/actions/runs/40253887969) `completed/success`(Verify Job `121351469940`, Docker Job `121351469592`). P1 스레드 2건 Resolved, 0 미해결/behind=0/mergeable 확인 후 squash 병합 `0f59351ef160e3cc79681a78c34714db8d088ab9` 성공.
- [Main CI 40254890094](https://github.com/planner77/layoutManager/actions/runs/40254890094)는 시작 확인 상태, 사용자 지시에 따라 결과 모니터링하지 않음. 기존 `v0.41.0` GHCR 이미 게시·태그 불변. 새 `0.41.1` App/Migrator Pair는 후속 릴리스 PR의 새로운 HEAD CI 성공이 전제이며 이미지 게시 성공 미확인. 실패/취소 관측 시 새 Run/Job/Step·로그 출처·재시도 기록을 추가하며 기존 첫 실패를 덮어쓰지 않음.
- 기존 CAD 조회 익명 유지/운영 Auth·Admin/API/Prisma/G7 OFF 정책 불변. 버전 bump와 본문·로그·실 데이터 공개 범위 변경 없음.


## Issue #106 / PR #120 — 최초 PR CI Unit/Integration 실패 및 두 P1 리뷰 수정 (2026-10-26 KST)

- **관측 Run:** [40252656906](https://github.com/planner77/layoutManager/actions/runs/40252656906), attempt `1`, PR `#120`, HEAD `53b75ca17190cd101689a3f10877adcb737ff37c`, event `pull_request.opened`, `completed/failure`. Verify [Job 121347711873](https://github.com/planner77/layoutManager/actions/runs/40252656906/job/121347711873) **failure**; Docker [Job 121347711740](https://github.com/planner77/layoutManager/actions/runs/40252656906/job/121347711740) **success**.
- **원본 로그·단계:** Verify에서 npm ci, Prisma generate, `npm run typecheck` **PASS**, `npm run lint` **PASS(기존 warning 2개)**. `npm test`에서 **54 files = 53 PASS + 1 FAIL, 297 tests = 288 PASS + 9 FAIL**; `tests/integration/auth-g4.test.ts` TC-P4-G4-001~009 모두 실패. 공통 Stack `seedCad tests/integration/auth-g4.test.ts:37:8` → `beforeEach:81:3`, `SqliteError: UNIQUE constraint failed: CadSite.product_id, CadSite.name` (`SQLITE_CONSTRAINT_UNIQUE`), exit 1. OCI Unit/Benchmark/Production Build/Playwright E2E/Legacy Migration E2E는 **SKIPPED**(성공 아님). Docker Job의 내부 예상 migration 오류 주입은 최종 Job success와 구분하며 새로운 배포 실패로 기록하지 않음.
- **독립 원인:** 같은 `product-a`에 `site-a`, `site-b`를 만들면서 공통 `name='Site'`를 지정, CAD 실제 스키마 `uq_site_parent_name(product_id,name)` 위반. G4 비즈니스 권한/감사 assertion에 도달하지 못한 fixture 준비 단계 문제이며 9개의 별개 프로덕션 결함으로 오분류하지 않는다.
- **P1 리뷰(추가 미검증 결함):** [r4373235025](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235025) 이름 중복 지적. [r4373235027](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235027) G4 `permit`와 `outline` 안전 Audit가 DB-resolved `site_id`를 null로 기록하며 G1 Audit CHECK가 Site Grant/Revoke 외 non-null 값을 차단한다고 지적. 후자는 최초 CI의 위 seed 오류로 실행 도달 전이라 독립 Review P1로 구분; 실제 CI의 추가 실패로 꾸미지 않음.
- **소스 보완:** Site 이름을 `Site-a`/`Site-b`로 구분하고 실제 이름 순서 Assert. G4 grant/permission resolve scope와 success·deny / outline create·edit·delete safe audit에 DB Site ID를 기록. G1 **비운영 fixture SQL만** CHECK를 최소 허용 목록으로 확장: Site Grant/Revoke = affected_user_id+site_id 의무, Outline Create/Edit/Delete = Outline target+site_id 의무, AUTHORIZATION_GRANTED/DENIED = Site/Version/Outline target에만 nonnull Site 가능, 무관 사건은 Site NULL 강제. Site FK/append-only trigger·기존 Session/G1~G3 계약 유지.
- **회귀/재검증:** TC-P4-G4-001/005/009에 Success/Denied/Revision Site·Invalid action Site/없는 Site FK 거부 Assertion 추가. 수정 내용을 GitHub 브랜치로 Commit한 뒤 latest HEAD PR CI 재시작하며 **새 Typecheck/Unit/E2E 성공은 확인 전 NOT VERIFIED**. Root 로컬 npm/Vitest/Playwright/Docker 실행 NOT RUN. 과거 성공 Run과 이 실패 Run/리뷰 기록은 보존하고 대체 성공으로 수정하지 않음.
- **Scope/후속:** 운영 App API/Prisma/migration/Compose/Nginx/.env/실 DB·CAD·S3/GHCR 변경 또는 활성화 없음, 기존 공개 CAD GET/Viewer 익명 유지, Version DELETE Editor+담당 Site+기존 암호 AND, Audit 365일 파기 미승인, G7 #109 Go/No-Go 후속. 사용자 지시상 최신 PR CI **시작까지**, 결과 모니터링 없음.


## Issue #106 G4 — 신규 PR CI 전 위험/비실패 기준선 (2026-10-26)

- 범위: feat/issue-106-g4-authorization-audit, main 선행 G1~G3 기반. #102 Owner G0 익명 기존 GET/Editor+Site POST·Current/Editor+Site+기존 삭제 암호 Delete 계약 유지.
- 실패 상태: 작성 당시 #106 PR Run/Job/Attempt의 실패·취소는 아직 관찰되지 않음. 임의 Run/로그/실패를 기록하지 않으며 기존 누적 다른 이슈 실패와 취소 이력을 보존한다. 로컬 Typecheck/Vitest/Docker/E2E 실행 NOT RUN; 새 PR CI 시작/결과 PENDING은 PASS 아님.
- 사전 기술 위험과 차단(확정 실패가 아님): Admin 무조건 Site 허용·익명 GET 전환·Client Header Actor 신뢰를 막도록 G4 비운영 Port+DB 재검증 분리. Grant/업무 변경과 Audit 부분 커밋 위험은 BEGIN IMMEDIATE 및 주입 rollback TC로 추적. 물리 Audit purge는 SOP 미승인으로 미구현. Version DELETE는 G4 permit만으로 완료되지 않으며 G7에서 레거시 비밀번호 AND/업무 Audit으로 보완 필수.
- 추후 확인 시: 실제 실패 Run/Job/Step, HEAD, 로그 출처, 원인/조치/재시도 및 리뷰·main 충돌은 새로운 누적 항목으로 기록. [Issue106](Issue106.md).


## Issue #104 / PR #118 — 최초 TypeScript 실패 보존·수정 HEAD CI 성공·0.40.5 재검증 게이트 (2026-10-26)

- **최초 실패는 보존:** [Run 40232479678](https://github.com/planner77/layoutManager/actions/runs/40232479678), HEAD `534de74c`; Verify `121286959176` TS1005/TS1128 실패, Docker `121286959564` 성공, Lint/Unit/E2E SKIPPED. 원인·수정 `ae002997`은 아래 원장에 상세 기록.
- **수정 코드 HEAD 검증 완료:** `f5f7ea2e00a95b24e65f16c67fc8484d03031dce` [PR CI Run 40234510320](https://github.com/planner77/layoutManager/actions/runs/40234510320) `completed/success`, Verify [Job 121293089381](https://github.com/planner77/layoutManager/actions/runs/40234510320/job/121293089381)·Docker [Job 121293089179](https://github.com/planner77/layoutManager/actions/runs/40234510320/job/121293089179) 각 성공. 최초 실패와 별도 Run이며 실 G6 사내 DB/CAD/S3 복구 시험은 NOT RUN.
- **릴리스 정책 변경 ≠ CI 실패:** 사용자의 새 GHCR 게시 요청을 이행하려면 기존 v0.40.4 Pair/태그 불변을 보존하며 새 v0.40.5 App/Migrator Pair가 필요. package/lock root 버전 정렬은 이전 검증 HEAD를 변경하므로 새 PR CI 완료 전 PASS 기록/병합/Issue 종료/GHCR 게시 금지. 새 HEAD 실패·취소 발생 시 Run/Job·로그 증거를 추가 보존하며 기존 실패 이력을 삭제하지 않는다. 운영 인증 G7 승인 전 OFF.

## Issue #104 / PR #118 — G2 최초 CI 실패와 TypeScript 복구 테스트 구문 수정 (2026-10-26 KST)

- **실제 실패 증거:** [PR CI Run 40232479678](https://github.com/planner77/layoutManager/actions/runs/40232479678), attempt `1`, PR HEAD `534de74cce4418afb66fc4dad445ea654187d190`, `completed/failure`. Verify [Job 121286959176](https://github.com/planner77/layoutManager/actions/runs/40232479678/job/121286959176) `completed/failure`. Docker [Job 121286959564](https://github.com/planner77/layoutManager/actions/runs/40232479678/job/121286959564) `completed/success`; 별도 Docker/Prisma migration 실패는 **관측되지 않음**.
- **로그 / 단계:** Verify에서 `npm ci`, Prisma Client generate 성공 뒤 `npm run typecheck` `exit code 2`. `src/tests/integration/auth-g2.test.ts(198,22)` `TS1005: ';' expected`; 동일 파일 `(232,1)` 및 `(232,2)` `TS1128: Declaration or statement expected`. `Squash Merge defaults` 관련 #76 경고(예상 enabled/PR_TITLE/BLANK vs observed unset/unset/unset)는 별도 *non-blocking warning*, TypeScript 실패 원인이 아님. Verify의 ESLint, Unit/Integration, OCI 통계 Unit, DXF benchmark, Build, Playwright E2E, legacy migration E2E는 **SKIPPED**(PASS 아님); Docker Job만 독립 SUCCESS.
- **결함 원인:** G2 복구 테스트의 기존 `expect(db.prepare(...).get(adminId))\n?.password_hash).toEqual(...)`에서 `expect(...)` 괄호를 너무 일찍 닫아 optional chaining 식이 분리됐으며 `TS1128`은 해당 파서 오류의 후속 진단. 동일 유형의 잠재 결함을 `revoked_at` assert 주변 :213에서도 정적 검토로 확인했다. PR 코드 작성 시 TypeScript를 직접 실행하지 않아 사전 차단하지 못함. #103 과거 TS 구문 실패와 유형상 재발이지만 G2의 독립 코드 결함·Run으로 별도 보존.
- **코드 조치:** [commit ae002997](https://github.com/planner77/layoutManager/commit/ae002997bcbc394cf40a9adb9c0475d74f73f22e)에서 두 SQL `.get(adminId)?.field` 결과를 각각 `replayHash`와 `revokedAtBeforeRetry` 변수로 분리한 후 `expect(variable)`를 사용하도록 수정. TC-P4-G2-007/008 테스트의 의미(복구 nonce 재사용 거부/세션 폐기·장애 rollback) 유지. `TC-P4-G2-SYNTAX-001`로 최신 HEAD Typecheck를 첫 게이트로 추적하고, 새 CI 실제 실행 전에는 해결 `PASS` 주장 금지.
- **main drift(시험 실패와 구별):** 수정 중 #102 G0 [PR #114](https://github.com/planner77/layoutManager/pull/114)가 main에 병합되어 G0 6개 Owner 업무 정책(기존 도면 등록 POST = 로그인 Editor/Admin+담당 Site 포함)이 반영됨. PR #118 브랜치는 잠시 `behind=1`이고 공통 AGENTS/ADR/Architecture/DB/Operation/Requirements/TestPlan/TestReport 등 문서가 양측 변경됨. **G2 코드와 G0 정책/과거 실패 원장을 모두 보존하는 비강제 two-parent main 정렬**로 충돌 해결, 실패 원장 기록 후 신규 `pull_request.synchronize` CI 시작 예정.
- **재검증/범위:** 신규 PR HEAD의 Verify/Docker 테스트 완료/성공은 현재 `PENDING / NOT VERIFIED`; 리뷰 스레드·main drift·mergeability는 최종 HEAD에서 재확인 필요. 실 운영 Auth/Admin/Prisma/Compose/Nginx, 기존 CAD·Version/Current·삭제 비밀번호/실 DB/S3 및 G7 Owner 운영 승인은 **변경·활성화 없음**. CI 시작을 시험 성공으로 기록하거나 기존 실패/취소 이력을 삭제하지 않는다.


## Issue #102 / PR #114 — #107 후속 Main 갱신 재정렬 (2026-10-26 KST)

- **재정렬 원인:** PR #114 기존 통합 HEAD [`671f4e2`](https://github.com/planner77/layoutManager/commit/671f4e2a32d888900d0b583db90487a53530da64) 대비 #107의 문서-only 후속 [main `3caca50`](https://github.com/planner77/layoutManager/commit/3caca50df917ca9ea7b372ac102abd29b47236ff)이 새로 병합됨. 비교 결과 `behind=1`, GitHub `mergeable=false`. 동시 수정 경로는 `AGENTS.md`, `out/FailureLedger.md`, `out/Requirements.md`, `out/TestPlan.md`, `out/TestReport.md`의 Markdown 최상단 추가 섹션. **CI 실패가 아닌 문서 충돌**; 실패·취소 Job을 창작하거나 기존 원장을 삭제하지 않음.
- **기존 PR CI 실증:** [Run 40230535926](https://github.com/planner77/layoutManager/actions/runs/40230535926) `completed/success` 는 **이전 HEAD `671f4e2` 전용**으로 보존. 최신 Main 통합 HEAD를 검증한 결과는 아님.
- **충돌 처리:** #107의 G5 완료·[Main CI 40225537167](https://github.com/planner77/layoutManager/actions/runs/40225537167) GHCR App/Migrator Pair 검증 기록과 #102의 `G0-BIZ-01~06`(익명 CAD GET, Editor+Site POST/Current, Editor+Site+기존 비밀번호 Delete, 관리자 책임, Audit 365일)를 모두 보존. Main의 `README.md`·`ChangeLog.md`·`Issue107.md` 변경도 유지하고 APP/API/Prisma/Nginx/Compose/원본 CAD/GHCR 변경 없음.
- **해결방식:** 기존 PR HEAD를 첫 부모, 신규 Main `3caca50df917ca9ea7b372ac102abd29b47236ff`을 둘째 부모로 하는 **비강제 2-parent merge commit**을 계획하고, 최신 Main Git tree에서 문서 5개의 양측 신규 섹션을 충돌 없이 결합. `behind=0`·미해결 리뷰 스레드 0·CI 신규 실행 시작 확인 후 사용자 지시에 따라 **CI 모니터링 생략**. 새 HEAD의 CI가 실제 완료되기 전 PASS로 표기하지 않음.

## Issue #102 / PR #114 — #107·#103 Main 선행 병합 충돌 정렬 (2026-10-26 KST)

- **구 HEAD PR CI 성공:** [Run 40200082645](https://github.com/planner77/layoutManager/actions/runs/40200082645) 기존 HEAD `638da7e02c04e64989bc745b6ebc2cda4166077b` `completed/success`. 이전 리뷰 스레드 0. 이 결과는 새 HEAD 검증에 전용 불가.
- **원인:** [#107 main 142c4b9](https://github.com/planner77/layoutManager/commit/142c4b9bc0bdb2ad0403fb1ee6640cf070d0bbbc)와 [#103 main `1bd6734c`](https://github.com/planner77/layoutManager/commit/1bd6734c1f9eb2b75592b9990e640195cd1ba51e)가 #114 이후 병합되어 `behind=2`·`mergeable=false`. 이는 **CI 실패가 아닌 공통 Markdown 문서 상단 병합 충돌**이며 PR #114 기존 성공과 무관하다. 실패/취소 Job을 새로 꾸며 기록하지 않는다.
- **해결:** #103 격리 Auth DB/Integration, #107 Preview/Viewer 검증·CI Workflow와 Main의 AGENTS/Architecture/Database/Decisions/Requirements/Operation/TestPlan/TestReport/Issue96·README·ChangeLog·기존 실패 원장을 모두 보존. 기존 #114 정책 문서를 Main 트리 위에 통합하고, 새 Owner 승인 **G0-BIZ-06 `POST /api/cad-files` 로그인 Editor 이상+담당 Site**를 ADR/요구/시험/이슈에 반영. 코드·운영 Auth/API/Prisma/Migration/Nginx/Compose/.env/원본 데이터·GHCR 변경 0.
- **정렬 방식:** PR HEAD 첫 부모, 당시 최신 main `1bd6734c1f9eb2b75592b9990e640195cd1ba51e` 둘째 부모의 **비강제 2-parent merge commit**으로 문서 충돌 정리. 새 HEAD의 PR CI는 `pull_request.synchronize`로 **시작 확인까지만** 하고 모니터링 안 함. 실행/성공을 혼동하지 않으며 새 리뷰 스레드·충돌은 병합 전 재점검. G0 완료/운영 Go-Live는 별도.

## Issue #107 — 최종 성공 증거 확정 / 신규 실패 없음 (2026-10-26 KST)

- **초기 HEAD 성공 후 P2 수정:** 최초 PR #115 HEAD `d771d553` [Run 40201366001](https://github.com/planner77/layoutManager/actions/runs/40201366001) 성공, 이후 [리뷰 4371142398](https://github.com/planner77/layoutManager/pull/115#discussion_r4371142398)에 따라 실제 Viewer URL 검사·TC-P4-G5-007을 보완. 이 리뷰는 CI 실패로 분류하지 않고 이전 원장 내역을 그대로 보존한다.
- **수정 HEAD 재검증 PASS:** PR HEAD `44132fcaa31aff0c4643edfeb8db6949d801ca5b`, [Run 40224438075](https://github.com/planner77/layoutManager/actions/runs/40224438075) completed/success, Verify Job `121263027541`·Docker Job `121263027604` success, 미해결 리뷰 0·충돌 0 뒤 Squash 병합.
- **Main CI/GHCR PASS:** main `142c4b9bc0bdb2ad0403fb1ee6640cf070d0bbbc`, [Run 40225537167](https://github.com/planner77/layoutManager/actions/runs/40225537167) `completed/success`, App·Migrator 후보 build/paired digest promotion 및 OCI 계측 성공. Git tag `v0.40.4` 확인. 운영 구성·인증 기능 활성화·실제 LAN/백업 복원은 수행하지 않음.
- **이번 추가 문서 동기화 작업:** 완료 상태와 현장 `NOT RUN` 경계를 기록할 뿐 기존 성공 Run을 다시 실행하거나 신규 실패로 기록하지 않는다. 이 후속 문서 PR의 새 HEAD CI는 별도 검증 결과 전 `NOT VERIFIED`.


## Issue #103 / PR #116 — #107 main 선행 병합에 따른 정렬 (2026-10-26 KST)

- **이전 실행 성공은 별도 HEAD 증거:** #103 수정 HEAD `40153240d593c9d645dcc7c79bc9d9ac82d073e0`의 [PR CI Run 40225147249](https://github.com/planner77/layoutManager/actions/runs/40225147249), attempt 1, `completed/success`; Verify [Job 121264822767](https://github.com/planner77/layoutManager/actions/runs/40225147249/job/121264822767) / Docker [Job 121264822603](https://github.com/planner77/layoutManager/actions/runs/40225147249/job/121264822603) **각각 성공**. 이는 이전 실패 [40202066291](https://github.com/planner77/layoutManager/actions/runs/40202066291)의 해결 검증일 뿐 main #107 병합 후 통합 HEAD의 성공 증거가 아니다. 실패 Job/로그 원장은 아래에 계속 보존한다.
- **동시 변경 충돌·원인:** #107 G5 [main `142c4b9bc0bdb2ad0403fb1ee6640cf070d0bbbc`](https://github.com/planner77/layoutManager/commit/142c4b9bc0bdb2ad0403fb1ee6640cf070d0bbbc) 선행 병합으로 #103 PR #116 `ahead=9/behind=1`, GitHub `mergeable_state=dirty`. 이는 **CI 실패가 아닌 병합 충돌**. 충돌 가능 공통 문서는 `AGENTS.md`, `README.md`, `out/{Architecture,FailureLedger,Operation,Requirements,TestPlan,TestReport}.md`.
- **해결 계약:** 공통 문서 8개는 기존 base를 기준으로 양쪽에 **추가된 섹션을 모두 유지**하여 정렬한다. #107의 PR CI workflow 및 G5 Preview Compose/Nginx·smoke 스크립트·Unit, `src/package.json`/lock의 버전·의존성, `out/Issue107.md` 및 ChangeLog는 main을 채택한다. #103의 격리 Auth SQL/Prisma fixture·Integration tests와 ADR/DB/Issue103/Issue96 문서는 온전히 보존. 운영 `src/prisma/schema.prisma`/`migrations`, 기존 app API, 실 DB/CAD/S3 변경 없이 G7 OFF.
- **정렬·재검증:** #103 HEAD와 main을 두 부모로 가진 **비강제 2-parent merge commit**으로 통합. 기존 40225147249 성공을 새 HEAD PASS로 전용하지 않으며 `pull_request.synchronize` PR CI의 실행 시작만 확인, 이후 요청에 따라 모니터링 생략. 수정 CI 미실행 또는 결과 미확인시 `PENDING`으로 기록. P1 [r4371167619](https://github.com/planner77/layoutManager/pull/116#discussion_r4371167619)은 기존 HEAD에서 답변·resolve 완료, 새 review thread 발생 여부 재확인.


## Issue #103 / PR #116 — 최초 PR CI 실패와 P1 리뷰 교정 (2026-10-26 KST)

- **실패 원본(보존):** [Run 40202066291](https://github.com/planner77/layoutManager/actions/runs/40202066291), attempt 1, PR `pull_request.opened`, HEAD `50014e68b64623969bfc722e9a31f835469009cf`, **completed/failure**. Verify [Job 121195140490](https://github.com/planner77/layoutManager/actions/runs/40202066291/job/121195140490) **failure**, Docker [Job 121195140285](https://github.com/planner77/layoutManager/actions/runs/40202066291/job/121195140285) **failure**. 실제 로그를 확인했으며 CI 실패를 취소·성공과 혼동하지 않는다.
- **Verify 실패 지점:** `npm ci`/Prisma Client 생성은 정상, `npm run typecheck`에서 `src/tests/fixtures/auth-g1/store.ts:134:98` **TS1002 Unterminated string literal** 및 TS1005/TS1128 후속 구문 오류 → exit 2. ESLint/Unit·Integration/Benchmark/Build/E2E/Legacy migration 모두 **SKIPPED**(실행 성공 아님). Typecheck 자체가 게이트를 막았다.
- **Docker 독립 실패 지점:** 기존 Dockerfile을 이용한 baseline image Build의 Next.js production TypeScript 검사에서 **동일** `store.ts:134:98` 구문 오류 → build exit 1. Docker native 의존성/Compose·Migration 오류가 따로 확인된 것이 아니며, 이후 Docker smoke/측정 단계는 **SKIPPED**. 따라서 두 Job은 하나의 공통 TypeScript 소스 결함으로 분류한다.
- **원인:** 이전 #103 브랜치에서 `changeG1Password`를 삽입할 때 선언 문자열 치환이 `consumeG1Recovery` 함수 본문 일부를 침범하고 Role/Special/Version helper 정의가 **중복 삽입**돼 파서가 중단됐다. 정적 작성 후 실제 TypeScript 검증을 실행하지 않은 검증 공백이 존재했다. 기존 PASS 증거는 이 HEAD의 성공을 보장하지 않음.
- **보완:** `store.ts`의 비밀번호 변경/복구/Role·Special/Version resolver 구간을 단일 함수 정의로 재작성, `startsWith('scrypt$')` 등의 문자열과 복구·revoke·감사 트랜잭션 보존. 운영 Prisma/실 API/Compose 변경 없음.
- **별도 코드 리뷰 P1(실제 CI 오류가 아님):** [PR #116 inline r4371167619](https://github.com/planner77/layoutManager/pull/116#discussion_r4371167619), 최초 `src/tests/fixtures/auth-g1/store.ts:115`. Site grant 변경의 기존 Audit는 `actor_user_id`와 `target_id=site`만 기록하고 권한 대상 `userId`를 누락했으며, grant revoke 후 누가 영향받았는지 복구할 수 없었음. 감사 스키마에 `affected_user_id` FK→User와 `site_id` FK→CadSite를 추가하고 Site grant/revoke Audit의 양쪽 **NOT NULL CHECK**, 관련 Index·Prisma 참조 투영을 보완. `TC-P4-G1-005`에서 동일 Site의 서로 다른 두 사용자 grant/revoke, revoke 후 불변 audit, 필수 필드 누락 거부 확인하도록 확대.
- **검증 상태:** 변경 HEAD에서 Typecheck/Vitest/Prisma/Docker/실 DB 실행 결과 아직 확보 전(**NOT RUN**). 새 PR CI는 브랜치 갱신 이후 시작할 계획이며 결과 **PENDING**, 구 실행의 실패 상태는 덮어쓰지 않음. P1 인라인 스레드 답변·해결, 최신 main drift/충돌 0 재확인 필요. `DESIGN.md`는 저장소에 없어 AGENTS·ADR-051/Database/Architecture를 우선 사용.



## #103 G1 / #102 PR #114 동시 문서 작업 통합 위험 (2026-10-25 KST)

- #102 추가 Owner 5개 정책 문서 PR [#114](https://github.com/planner77/layoutManager/pull/114)가 별도로 Open이고 G1과 `AGENTS.md`, `out/{Decisions,Database,Architecture,Operation,Requirements,TestPlan,TestReport,Issue96}` 등을 수정한다. **현재 G1의 기준 Main `d85b86a` 대비 behind=0, 실제 충돌·CI 실패는 아직 발생하지 않음**. PR #114가 먼저 병합되면 최신 Main을 통합해 두 이슈 정책을 모두 보존하고 새 HEAD PR CI 시작 필요. 잘못된 종전 HEAD CI PASS 전용 금지.
- G1 브랜치는 일회용 `src/tests/fixtures/auth-g1/**` SQL/Prisma와 Integration 테스트 9개만 소스 추가, 운영 Prisma/API/Compose 변경 없음. 로컬 실행 없음(NOT RUN). CI 실패 Run/Job은 관찰될 경우에만 식별자·원인·조치·대체 HEAD를 누적 기재.


## Issue #103 / G1 — PR CI 시작 전 최초 기준선 (2026-10-25 KST)

- **신규 CI 실패 이력:** 아직 PR CI를 실행하지 않아 실패 Run/Job/Attempt/로그 0건 **(NOT RUN)**. 실패가 없음을 CI 성공으로 간주하지 않으며 향후 Run 실패/취소는 로그·원인·시도·조치·최종 HEAD를 별도 추가하여 영구 기록한다.
- **원인/예방·설계상 위험:** G1 SQL을 `src/prisma/migrations`에 넣으면 자동 migrator가 운영 DDL을 적용하는 변경 위험. 따라서 `src/tests/fixtures/auth-g1/`에만 별도 스키마/DDL, 임시 `cad-auth-g1-*/fixture.sqlite` 경로 가드, 테스트만 연결. SQLite Session count 검사만 쓰면 동시 제4세션 race 위험: `BEGIN IMMEDIATE` + DB 트리거로 차단. nonce 해시 유일성·Grant/Audit commit 동시성·Audit append-only를 격리 Fixture에서 검증하도록 작성.
- **검증 미실행:** 실제 Node/Vitest/Prisma/SQLite native/Docker/Playwright 로컬 실행 **NOT RUN**. PR 생성 시 최신 head의 Verify/Docker 실행 시작을 확인하되 사용자의 모니터링 생략 요청에 따라 결과 성공이라고 기록하지 않는다. 리뷰 스레드·main drift/충돌 점검 후 PR 시작, 최신 HEAD 성공 이전 병합·G7 운영 승인은 금지.
- 참조: [Issue103](Issue103.md), [Issue96](Issue96.md), [TestPlan](TestPlan.md), GitHub Issue #103. 이 항목은 **확인된 CI 실패 사고가 아닌 사전 기준선/위험 원장**이다.


## Issue #107 / PR #115 — CI 성공 후 P2 Viewer 경로 리뷰 (2026-10-26 KST)

- **CI 실패가 아닌 리뷰:** [Run 40201366001](https://github.com/planner77/layoutManager/actions/runs/40201366001), HEAD d771d553cdf7d00a467fead6f8f9d788898ea314, Verify Job 121193043560 및 Docker Job 121193043322 모두 completed/success.
- **지적:** [P2 thread 4371142398](https://github.com/planner77/layoutManager/pull/115#discussion_r4371142398), PRRT_kwDOUQjDfc6wB-qZ, src/scripts/g5-preview-smoke.mjs. /cad/locations/:id는 버전 관리 테이블이라 HTML 200이 실제 /cad/versions/:id/viewer 검증을 대신할 수 없는 거짓 PASS 위험. 운영 장애/정보 누출 확인 사실은 없음.
- **교정:** --version-id → 실제 Version Viewer 자동 요청, 명시 Viewer URL 허용·ID 일치 검사, TC-P4-G5-003/004/007 보완과 문서 정렬. 새 HEAD PR CI 결과 확인 전 기존 성공을 재사용하지 않는다.
- **버전:** 기존 v0.40.3/Main CI 40199597907에서 GHCR App/Migrator 게시 성공하였으므로 이전 태그 재사용 금지, 신규 0.40.4 package/lock 후보. 본 PR 새 HEAD CI·리뷰 해결·main 정렬을 최종 게이트로 유지.
- **범위:** 공격·탈취 대응 Owner 비범위, 실 내부망/업로드/Auth Cookie/Backup·Restore NOT RUN; 운영 변경은 G7 별도 승인 전 금지. 사용자 지시에 따라 CI 모니터링 생략.


## Issue #107 / G5 — 격리 Preview 최초 PR CI 이전 기록 (2026-10-25 KST)

- **상태:** 이 항목 작성 시 신규 PR CI Run/Job/HEAD 결과는 아직 없음(**NOT RUN**). 이번 이슈의 실패·취소를 관측하지 않았으므로 허위 실패 이력은 추가하지 않는다. 기존 다른 이슈의 실패 기록은 원문 유지.
- **변경 범위:** Owner R1 경량 사내망 정책, 독립 Preview Compose/NGINX 정상 경로·read-only smoke·Unit·CI Compose config-only; 운영 Auth/API/Prisma/기존 Compose/Nginx·데이터 변경 금지. [Issue107](Issue107.md).
- **후속 기록 조건:** 실제 CI failure/cancel/review/merge conflict를 관측하면 PR/HEAD/Run/Job/Step/원인/재시도/해결을 누적한다. CI 시작은 성공 아님; #108 현장 테스트는 미실행.


## Issue #82 / PR #111 — #99 선행 Main 충돌 및 ADR 중복 정렬 (2026-10-25 KST)

- 2차 CI [40198344153](https://github.com/planner77/layoutManager/actions/runs/40198344153)의 실제 실패 원인은 기존 U1 shared tools dock 기대값이었고, **그 후에** [#99 main d85b86ab](https://github.com/planner77/layoutManager/commit/d85b86ab9567373d5213d7a8cedc285458118bd7)이 병합되어 PR #111은 behind=1·mergeable=false로 바뀜. CI 오류와 충돌을 구분한다.
- #99의 실제 DXF 비공개 Evidence CLI/Unit/Private E2E, 시뮬레이션 게이트·경로 symlink 방어/문서·새 npm `verify:outline-acceptance`를 전부 보존한다. AGENTS/README/Architecture/Decisions/Requirements/TestPlan/TestReport/FailureLedger/ChangeLog 및 package/lock가 양쪽 수정돼 충돌함.
- #99의 ADR-052를 유지하고 **#82 Memo의 ADR-052만 ADR-053**으로 분리, app/lock 후보 0.41.0 유지·#99 package script 보존. 양쪽 부모를 포함한 비강제 merge commit으로 정렬 후 새 PR CI를 시작하되 검증 전 PASS 아님. 이전 CI HEAD 성공/실패 내역은 누적 보존; Owner 현장 DXF #99→#113 및 #83 Auth/Memo 영속 미승인. GHCR/Issue 종료/병합 승인 전 새 CI 필요.


## Issue #82 / PR #111 — 2차 PR CI U1 E2E의 Memo 독립 Dock 기대값 불일치 (2026-10-25 KST)

- **실패 근거:** [Run 40198344153](https://github.com/planner77/layoutManager/actions/runs/40198344153), attempt 1, PR HEAD ac9226ff2e2c619bc009dd8bf293c3f26c22dc44 (GitHub synthetic test merge 8445df4c361e469d68e161010a66869fdbb0bd75), `completed/failure`. Verify Job [121183959441](https://github.com/planner77/layoutManager/actions/runs/40198344153/job/121183959441) **FAIL**, 독립 Docker Job [121183959402](https://github.com/planner77/layoutManager/actions/runs/40198344153/job/121183959402) **SUCCESS**. TypeScript·ESLint·Vitest(신규 Memo Unit 6 포함)·OCI manifest Unit·DXF synthetic outline 1k/10k/100k benchmark·Production Build 모두 SUCCESS. Chromium Playwright **77 PASS/1 FAIL**(78 tests, 1 worker, 6.2분), Legacy Migration E2E **SKIPPED**. artifact `playwright-test-results` ID 12601805000(Trace 포함). 원인 확인 전 TestReport의 최초 CI 실패 기록은 유지한다.
- **정확한 실패:** `src/tests/e2e/issue38-app-shell.spec.ts:58`, `TC-U1-E2E-001: three-dxf-viewer CSS immersive/menu/resize/escape and dock state`. `getByTestId('viewer-tools-dock').toHaveCount(0)` 기대와 달리 actual **1** (14회 관찰). U1 fixture는 LINE 2개에 안정 Source Handle이 없어 외곽선 선택·생성 정책(#31/#40)은 fail-closed이지만, #82의 새 **자유 WCS 배치 Memo는 Source Handle과 무관**하므로 별개 `cad-memo-status` 때문에 기존 공유 tools dock이 렌더된다. **설계 계약이 확장됐는데 과거 U1 dock 존재 여부만 검사한 테스트가 구형**. 이 로그만으로 Memo 렌더 실패/Source 선택 허용/운영 데이터 문제를 주장하지 않는다.
- **보완:** 제품의 Memo 사용 가능 정책이나 Outline 매핑/Source 안전 검증을 완화하지 않는다. U1 회귀를 '선택 불가인 외곽선 버튼 disabled, `cad-object-selection-tools`·`cad-outline-tools` 부재, 그러나 `viewer-tools-dock`에 Memo status 0/100과 Memo 추가 enabled'로 재정의. 대조적으로 `dxf-viewer`/손상 `libredwg-web`은 Memo 버튼 disabled·Memo 도크/상태 부재를 확인. `TC-M1-E2E-006` 신규: 동일 무Handle fixture에서 자유 WCS(10,20) 생성, PIN 개수/좌표, Zoom/Fit 및 Source 선택 도구 미노출을 독립 검증. 기존 `TC-M1-E2E-001~005`·U1 기존 resize/layer/ESC 검사를 삭제·건너뛰지 않는다.
- **게이트:** 수정 HEAD CI trigger 이전/실행 중은 **NOT VERIFIED**. 기존 성공한 Unit·Docker 및 이번 77 Playwright PASS는 오직 기존 HEAD/merge-run 근거; 최신 수정 HEAD의 CI PASS로 대체 금지. 현재 미해결 리뷰 0·최신 main 무충돌 확인 후 push→신규 PR CI synchronize를 시작하되 모니터링 생략. 이번 단계의 변경은 E2E 테스트·FailureLedger·추적문서 한정; API/Prisma/Auth/DB/GHCR/Source/SHA/Current/Generated edit/외곽선 fail-closed 수정 없음. 병합·Issue 종료·GHCR 게시 보류.


## Issue #82 / PR #111 — 최초 CI ESLint 실패 및 P1/P2 리뷰 보완 (2026-10-25 KST)

- **원본 CI:** [Run 40196496297](https://github.com/planner77/layoutManager/actions/runs/40196496297), attempt 1, 검증 HEAD `1515eca9708258bc0f80c4480773f6d26d06aee7`, `completed/failure`. Verify [Job 121178337705](https://github.com/planner77/layoutManager/actions/runs/40196496297/job/121178337705) **failure**; Docker Runtime/Migration [Job 121178337861](https://github.com/planner77/layoutManager/actions/runs/40196496297/job/121178337861) **success**. TypeScript, npm ci, Prisma Client 생성 모두 성공; ESLint 실패 이후 Unit/Integration, DXF synthetic benchmark, Production Build, Chromium E2E 및 Legacy Migration E2E는 **SKIPPED**(실패가 아님).
- **차단 원인(실제 Verify 로그):** `src/features/cad-viewer/cad-memo-overlay.tsx:174-200`에서 `gesture.current?.id`를 JSX render의 `memos.map` 중 읽어 `react-hooks/refs` error. `src/tests/e2e/issue82-cad-memo.spec.ts:87`에서 재할당 없는 `let pin`에 `prefer-const` error. 합계 **2 errors, 2 warnings**: unused `eslint-disable react-hooks/set-state-in-effect` (신규), `outline-tree-panel.tsx:116` 기존 `aria-selected` warning. #76 Squash 설정 advisory `unset/unset/unset`와 Runner Node 경고는 non-blocking이며 ESLint 실패 원인이 아니다.
- **독립 리뷰 결함:** [P1 #4370961641](https://github.com/planner77/layoutManager/pull/111#discussion_r4370961641) 기존 Memo pin/recent list로 편집 진입하면 외곽선 ON/Generated Selection 도구가 계속 살아 경쟁. [P2 #4370961642](https://github.com/planner77/layoutManager/pull/111#discussion_r4370961642) Drag pointerup 뒤 synthetic `click`이 `selectMemo`를 호출해 편집창의 미저장 제목·본문을 덮어씀. CI 실패와 구분하여 **코드 리뷰 결함**으로 함께 추적.
- **코드 교정:** render 도중 ref 읽기 속성 제거, 사용하지 않는 lint suppression 제거, E2E `const pin`. `beginMemoInteraction(id?)`을 신설해 새 배치/기존 pin `pointerdown`/최근 목록 클릭 모두 동일하게 기존 Outline preview/Worker→선택·Generated pending cancel→Pan 전환, Esc/Version/SHA/Renderer scope 유지. `ignoredDragClick` 포인터 전용 ref를 임계 5px 드래그에서 설정하고 다음 `click` 한 번만 무시; 다음 pointerdown 초기화·키보드 click 허용. 이미 열린 동일 memo 재선택도 임시 작성 폼을 덮어쓰지 않음. `TC-M1-E2E-004/005` 회귀 추가. 출처 [Issue82](Issue82.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md), ADR-053.
- **증거 및 게이트:** 원본 실패 Run은 보존, Docker/TypeScript 성공도 오직 원본 HEAD 증거이다. 최신 수정 HEAD의 새 PR CI `pull_request.synchronize`는 아직 검증 전이며 시작 ≠ PASS; 미해결 리뷰 스레드 해결·main 충돌 확인 후 진행. 실 DXF/GPU/native/100-memo FPS 미실측, #83 Auth/CRUD/DB 활성화 미수행. **병합/GHCR/Issue 종료 금지**(Owner 후속 승인 및 새 CI 성공까지).


## Issue #99 / PR #110 — 최신 #102 Main의 문서 변경으로 인한 병합 정렬 (2026-10-25 KST)

- **성공한 이전 HEAD:** PR #110 `6e00d3385a5c16362669d0672b828ddc1eaebf04` [PR CI 40197221768](https://github.com/planner77/layoutManager/actions/runs/40197221768), attempt 1 `completed/success`. Verify [121180619434](https://github.com/planner77/layoutManager/actions/runs/40197221768/job/121180619434) / Docker [121180619279](https://github.com/planner77/layoutManager/actions/runs/40197221768/job/121180619279) 모두 success. P1 Symlink 보완 및 TC-P0P5-PATH Unit, GHCR 후보 `0.40.3`을 포함한 이전 HEAD만의 증거.
- **CI 실패가 아닌 문서 동시 변경:** `main` [#102 commit a14df20f](https://github.com/planner77/layoutManager/commit/a14df20f1fa466b7ede61ab3b4dc36f93daa014f) 최신 Owner 정책 ADR-051-R1에서 PROD Nginx/DEV Direct 및 경량 내부망 위험 수용 정책을 정렬했다. PR #110이 `behind=1`, `mergeable=false`; `AGENTS.md`, `out/{Architecture,Decisions,Operation,Requirements,TestPlan,TestReport}.md` 공통 머리글의 변경이 중복되었다. #102 자체 파일 `out/Issue102.md`와 #96/Database 연관 갱신도 손실되면 안 된다.
- **통합 정책:** #102 Owner의 ADR-051-R1을 각 공통 문서 최상단에 보존하고 #99의 비공개 DXF 증거 게이트/P1 Symlink 방어/현장 AC #113 이관·FailureLedger를 함께 유지. #102만 수정한 `out/Database.md`, `out/Issue96.md`, `out/Issue102.md`는 Main 버전을 그대로 채택. Source/Viewer/API/Prisma/Docker 설정·운영 Auth 활성화는 하지 않으며 `src/package.json`/lock 신규 `0.40.3` 후보 보존. Force push/history rewrite 및 이전 GHCR 버전 태그 이동 없음.
- **필수 이후 게이트:** 해당 2-parent 통합 커밋은 앞의 검증된 HEAD와 **달라지므로** 신규 PR CI를 실행해야 하며, Verify·Docker 최신 HEAD 성공 및 리뷰/충돌 0 확인 전 PR 병합/Issue #99 종료/Main GHCR 출시는 금지. 사용자는 새 CI 모니터링 생략을 명시; 실행 시작을 PASS로 기록하지 않는다. 원 필드 현장 수용 AC는 [후속 #113](https://github.com/planner77/layoutManager/issues/113) OPEN/BLOCKED 유지.


## Issue #99 / PR #110 — 성공 PR CI 이후 P1 비공개 경로 심볼릭 링크 취약점 (2026-10-25 KST)

- **초기 성공 — CI 실패 아님:** HEAD `637742610b3eb25461b095edb5899494ce6dd054` / [PR CI 40195335561](https://github.com/planner77/layoutManager/actions/runs/40195335561) `completed/success`, Verify Job `121174841714`/Docker Job `121174841754` 모두 success. 이 실행은 Source-only/합성 테스트이지 실제 CAD 3종/GPU 현장 합격 증거가 아니다.
- **검출 출처:** [Codex P1 review #4370918614](https://github.com/planner77/layoutManager/pull/110#discussion_r4370918614), 미해결 Thread `PRRT_kwDOUQjDfc6wBc6t`, `src/tests/e2e/outline.acceptance.ts:27~29`. `path.resolve`만으로 repo 외부 절대 경로를 검사하여 디렉터리 Symlink가 Git worktree로 연결되는 경우 private Browser report(SHA/GPU 디바이스 정보)가 worktree에 기록될 수 있음. **사내 실제 파일 실행/정보 유출 증거가 아님**, 재현 가능한 정적 검토 취약성.
- **원인·수정:** `realpathSync`로 repo/source/기존 report parent의 실제 디렉터리를 비교하여 사내↔worktree alias를 거부. 부모 경로 존재 필수, report 경로 기존 파일/dangling link 거부, `wx` + `0600` 배타 신규 쓰기·쓰기 직전 parent 재검증, 테스트 대상 수정 및 Symlink/변경 중단/절대경로를 검증하는 Unit `TC-P0P5-PATH-001~006`. 운영 디렉터리는 별도 ACL/비공유로 유지해야 하며 이 코드만으로 악의적 concurrent parent 교체의 모든 TOCTOU 공격을 증명하지 않음.
- **릴리스/재검증:** 기존 `v0.40.2` Release tag 이미 존재; GHCR 새 게시를 위해 package/lock `0.40.3`으로 올림, 옛 태그/digest 이동 금지. **최종 수정 HEAD의 새 PR CI는 별도 확인 필요**, 기존 성공을 새 HEAD로 전용 금지. 리뷰 스레드 답변/해결·behind 0·최종 CI 성공 후 Squash 병합/새 Main CI만 허용. Issue #99 실 CAD/GPU Owner 현장 AC 4개는 여전히 BLOCKED, `completed` 단정 금지.


## Issue #96 / PR #101 — Ready 재트리거 취소·성공 및 #97 main 선행 병합 충돌 (2026-10-25 KST)

- **기존 검증 HEAD:** `d85ee3583d897dde2100c0c7738d1ab6fc2fb6f5`. PR Draft `pull_request.opened` [Run 40190070251](https://github.com/planner77/layoutManager/actions/runs/40190070251) **completed/cancelled**. Verify [121158976430](https://github.com/planner77/layoutManager/actions/runs/40190070251/job/121158976430)와 Docker [121158976650](https://github.com/planner77/layoutManager/actions/runs/40190070251/job/121158976650) 각각 **cancelled**. Ready-for-review에서 새 PR CI가 실행되며 기존 작업이 취소된 것으로, 테스트 실패와 구분한다. 취소 결과를 삭제하거나 PASS로 쓰지 않는다.
- **대체 CI 성공:** [Run 40190126225](https://github.com/planner77/layoutManager/actions/runs/40190126225) 같은 HEAD, attempt 1 **completed/success**. Verify [121159246791](https://github.com/planner77/layoutManager/actions/runs/40190126225/job/121159246791), Docker [121159247092](https://github.com/planner77/layoutManager/actions/runs/40190126225/job/121159247092) 모두 **completed/success**. Codex Review Summary는 d85ee35에 지적사항 0, inline 미해결 리뷰 스레드 0.
- **충돌 원인:** #97 [main 0e9031ea](https://github.com/planner77/layoutManager/commit/0e9031ea05774d76dd10c6742f2a12a3dc0d4ed5) 선행 병합 후 #101 `behind=1/mergeable_state=dirty`. AGENTS/README/out/{Architecture,ChangeLog,Database,Decisions,Issue31,Operation,Requirements,TestPlan,TestReport}.md 11개가 상단 문서 동시 수정으로 충돌하며, #97이 이미 **ADR-050**을 사용하여 #96과 결정 ID 중복 발생.
- **해결:** #97 변환 검증기·Unit·패키지/lock `0.40.2`·ADR-050/릴리스 기록을 그대로 유지하면서 #96의 독립 비활성 Auth/Session/Scope/Audit 코드와 테스트, Owner D1~D6 정책을 보존. #96 결정은 **ADR-051**로 재번호화하고 관련 문서 링크·버전 표기를 갱신, 문서 세트 정렬. 원본 DXF/Current/SHA/Prisma·auth API·Docker 운영 설정 활성화는 하지 않는다. Force push/history rewrite 없음.
- **병합 게이트:** 기존 성공 d85ee35는 **main 통합 HEAD의 성공 증거가 아님**. 통합 브랜치에 새 PR CI가 성공하고 리뷰 0·behind 0·mergeable true가 확인된 다음에만 Squash 병합한다. 사내 CIDR/Secret 복구/세션 DB 원자성·감사/백업/실 LAN 시험 및 별도 Owner 운영 활성화 승인까지 Issue #96 **OPEN/BLOCKED** 유지. Main CI/GHCR 실행·배포 확인은 별도.


## Issue #54 / PR #92 — #76 최신 main에 의한 문서 충돌·정렬 (2026-10-25)

- **사전 검증:** `6845c4b4e1e22157b64ce05215e67710c9a3a985`의 [PR CI 40181171710](https://github.com/planner77/layoutManager/actions/runs/40181171710) `completed/success`; P1 리뷰 #4370223581 해결. 이전 #40177837419 역시 성공이나 이전 HEAD 전용.
- **충돌:** #54 브랜치가 [main 14111b45](https://github.com/planner77/layoutManager/commit/14111b45a36907245342751d9d1a139b5215474d)(#76 관리자 Squash 정책 읽기 전용 PR CI 감사)보다 behind 1, mergeable=false. main 변경은 `.github/workflows/pr-ci.yml`, AGENTS/README/FailureLedger/Issue76/Operation/TestPlan/TestReport 등 **메타데이터·문서만**, Viewer/DB/package version/GHCR 빌드 변화 없음.
- **조치:** #54 E4 제품 코드·테스트·ADR-047·버전 0.40.0을 유지하고 main #76 workflow 및 새 문서를 채택. 공유 문서는 두 이슈 섹션을 보존해 병합. 새 HEAD의 synchronize CI를 별도 판정하며 성공한 이전 HEAD를 통합 HEAD의 검증으로 전용하지 않는다. 이는 **CI 실패가 아니라 main 동시 변경으로 인한 충돌**이다. Main CI/GHCR app+migrator version pair는 최종 병합 push가 트리거하며 시작/게시 성공을 구별한다.

## Issue #76 / PR #89 — #53 main 선행 병합으로 문서 충돌 (2026-10-25 KST)

- **기존 PR 성공:** [PR CI 40174728906](https://github.com/planner77/layoutManager/actions/runs/40174728906), HEAD `53fd648f8ec4daa2c7979245d441f82da51cf676`, attempt 1, `completed/success`. #53 병합 **전**의 성공으로서 새 통합 HEAD의 검증에 전용 불가.
- **충돌:** #53 [main 3ff1f94b](https://github.com/planner77/layoutManager/commit/3ff1f94b3fbf11737a827536e223114ea4ca0e96) 반영 후 PR #89 `behind=1`, `mergeable_state=dirty`. `AGENTS.md`, `README.md`, `out/TestPlan.md`, `out/TestReport.md` 동시 상단 삽입 충돌이다. 런타임 파일 충돌 없음.
- **보완:** 최신 main #53 v0.39.0 Generated Delete/테스트/설계 전부 보존하고 #76의 read-only audit·운영 가이드·문서 인덱스를 2-parent merge로 통합. 관리자 repository squash default는 당시 `COMMIT_OR_PR_TITLE/COMMIT_MESSAGES`로 **미적용**이므로 이슈 수용 조건 완료로 표시 금지.
- **후속:** 통합 HEAD PR CI 성공·리뷰 0·충돌 0 재확인 후 `squash`, 제목 `#76 | Squash 기본 메시지 정책 진단 및 운영 가이드`, 빈 본문으로 병합. Markdown/Workflow-only GHCR `release-scope`에 의해 이미지 게시 제외. 본 건은 **CI 테스트 실패가 아닌 동시 작업 충돌**.

## Issue #54 / PR #92 — 최초 CI PASS 뒤 발견된 P1 리뷰 (CI 실패 아님, 2026-10-25)

- **최초 CI:** [Run 40177837419](https://github.com/planner77/layoutManager/actions/runs/40177837419), HEAD `2f57a642197f7d22d457ad65a70eda76b8ba7df4`, attempt 1, completed/**success**. Verify Job `121122289273` 및 Docker Job `121122289396` 모두 success. CI 실패로 분류하지 않는다.
- **P1 입력 안전성:** [review 4370223581](https://github.com/planner77/layoutManager/pull/92#discussion_r4370223581), thread `PRRT_kwDOUQjDfc6v_xi4`, 파일 `src/viewers/three-dxf-viewer/selection-controller.ts:142`. 5px 임계 이전의 GENERATED 경계 pointerdown에서 wheel/Resize로 카메라가 바뀌어도 `cancelGeneratedDrag()`는 `moving=false`이므로 `down.world`를 지우지 않아 다음 move/up에서 다른 카메라 역변환을 조합해 의도치 않은 WCS Translate를 생성할 수 있다.
- **해결:** 활성 `down` 전체를 `cancelDrag`로 폐기해 Ghost 이전 후보·진행 중 선택 box·Ghost 모두 카메라 변경/Resize/Zoom에 안전 취소. `TC-E4-E2E-004` wheel·viewport Resize 두 경우 History0/JSON 불변/선택 유지 추가. 기존 SOURCE/DB/파일/Worker/버전 0.40.0 및 GHCR 정책 불변.
- **검증 경계:** 최초 성공 HEAD와 새 수정 HEAD를 엄격히 분리. 새 PR CI `pull_request.synchronize` 성공/리뷰 resolved/최신 main 무충돌 전 **병합·Issue 종료·GHCR 공개 게시 금지**. [Issue54](Issue54.md)/[TestReport](TestReport.md) 참조.


## Issue #67 / PR #80 — #52 main 선행 병합으로 HEAD 통합 및 CI 재검증 (2026-10-25 KST)

- #67 브랜치 수정 HEAD `aa9083c8ac3be5b21bc87e8eaa54e1f0273abc4d`의 CI 시작 전 main이 [Issue #52 commit e1adfe5b](https://github.com/planner77/layoutManager/commit/e1adfe5b9de28ddd3821a0de2466d810e5c6c209)로 이동해 PR `mergeable_state=dirty`, `behind=1` 확인. 이는 코드 테스트 실패가 아닌 동시 작업 충돌로, 원격 기준 문서·package version 중복 변경의 충돌이다.
- #52의 GeneratedDocument/UndoRedo 코드·신규 테스트·문서를 **전부 보존**하고 #67 Docker runtime/CI 측정 코드만 통합하는 merge commit을 생성한다. 기존 #52 ADR-044 ID가 사용 중이므로 #67 웹 패키징은 ADR-045; 미게시 #67 v0.37.2 → 새 패치 `0.38.1`(main #52 v0.38.0 다음)로 정렬한다. 구 태그를 이동하거나 기존 이슈 기록을 삭제하지 않는다. 최신 통합 HEAD의 PR CI 성공 전 PASS나 GHCR 게시·이슈 종료 주장 금지.


## Issue #67 / PR #80 — 2차 CI에서 Python syntax 검증 누락으로 Docker Job 차단 (2026-10-25 KST)

- **실패 원본:** [PR CI Run 40171968883](https://github.com/planner77/layoutManager/actions/runs/40171968883), 검증 HEAD `95cd745222055ce934e5ee3016d3551179b30a7f`, attempt 1. Docker Job [121104610668](https://github.com/planner77/layoutManager/actions/runs/40171968883/job/121104610668) `completed/failure`. Step `Verify web layer SHA, native and transition-only size saving (#67)`의 첫 `python3 src/scripts/test_audit_standalone_layers.py`에서 import 시 SyntaxError `unterminated f-string literal` (`audit_standalone_layers.py:113`). 실패는 실 Docker layer/hash가 상이하다는 증거가 아니라 **수정한 계측 리포트 f-string의 닫는 따옴표/콤마 누락**이며 실제 이미지 검사·이어지는 migrator/Compose smoke는 SKIPPED. Verify Job은 당시 E2E 실행 중이었으므로 성공/실패 판정을 하지 않는다.
- **Root cause/교정:** P1 조건 분기 추가 중 f-string 줄의 마감 기호를 누락했으며, Python self-test가 크기가 큰 Docker baseline/build/measure 작업 **이후**에 배치되어 사전 감지가 불가능했다. 문자열 구문 교정 + `python3 -m py_compile`(audit/self-test/API smoke 전부)·Synthetic Unit **이미지 빌드 전에 실행**하도록 순서를 이동. size gate를 `validate_image_size`로 분리, 이미 deduplicated·equal-size PASS와 실제 duplicate transition에서 equal-size FAIL 둘 다 테스트. SHA/native/no-dup/전체 Docker/Compose gate 제거·skip 없음.
- **보존 및 후속:** 첫 성공 [Run 40170910369](https://github.com/planner77/layoutManager/actions/runs/40170910369) HEAD `6a35660` Verify+Docker PASS를 보존하되 교정 HEAD PASS로 전용하지 않는다. 기존 리뷰 P1 답변/resolve는 그대로. 새로운 HEAD PR CI 재시작 후 통과한 경우에만 merge/GHCR 진행. 신규 결과/OCI digest/실운영 검증은 그때까지 NOT VERIFIED.


## Issue #67 / PR #80 — 최초 PR CI SUCCESS 후 P1 후속 PR 공통 게이트 리뷰 (2026-10-25 KST)

- **성공 Run 보존:** [PR CI 40170910369](https://github.com/planner77/layoutManager/actions/runs/40170910369), 첫 검증 HEAD `6a35660d192a586158e4380ae8e9618c46032202`, `completed/success`. Verify [Job 121101364113](https://github.com/planner77/layoutManager/actions/runs/40170910369/job/121101364113), Docker [Job 121101364198](https://github.com/planner77/layoutManager/actions/runs/40170910369/job/121101364198) 모두 `completed/success`. **이 항목은 CI 실패가 아니라 성공 후 추가 리뷰에서 발견한 잠재적인 다음 PR의 CI 차단 결함**이다.
- **P1 리뷰 원본:** [Review 4369963432](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432), 최초 HEAD `6a35660`: #67 제거 후 `main` Dockerfile은 이미 deduplicated 상태이므로 다른 PR의 `base`에도 중복이 없는데 `compare_inventories`가 `Baseline has no duplicate files`로 무조건 실패하고, `base_size <= size`도 정상 동일 크기를 거부함. 실제 신규 기능의 실패가 아닌 공통 CI의 false failure 위험.
- **교정:** 동일 HEAD/Node22.14/linux-amd64에서 baseline에 중복이 **실제 존재하는 transition**이면 final package SHA 일치·duplicate raw bytes·positive size saving 강제. 이미 중복 0개인 base이면 size는 informational, 현재 image의 native `.node`와 모든 package SHA 일치/중복 재도입 없음은 계속 강제. Python 합성 fixture에 이미 deduplicated base 정상 PASS와 재중복 FAIL을 추가. Docker/Compose/Unit/Browser·migrator 검증 생략 없음.
- **검증 경계:** 위 교정 후 새 HEAD에서 PR CI `pull_request.synchronize` 재실행이 필요하다. 최초 Run PASS를 새 HEAD PASS로 대체 금지. 실패/취소/스킵 발생 시 Run/Job/HEAD/원인/재실행을 누적 기입. inline P1 답변·resolve 및 최신 main 무충돌 확인 후에만 squash merge. GHCR version+immutable digest OCI 게이트 및 Main CI는 병합 이후 별도. [Issue67](Issue67.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md).


## Issue #52 / PR #79 — QA 독립 재검증 및 두 번째 Unit 실패 원인 (2026-10-25)

- [Run 40169744777](https://github.com/planner77/layoutManager/actions/runs/40169744777), HEAD `41cf16c`, Verify [Job 121097994868](https://github.com/planner77/layoutManager/actions/runs/40169744777/job/121097994868): TypeScript/Lint PASS; Unit **196 PASS/6 FAIL**, `generated-document.test.ts`에서 `닫히지 않은 Ring입니다.`. 이후 benchmark/build/E2E/Legacy **SKIPPED**. Docker [Job 121097994934](https://github.com/planner77/layoutManager/actions/runs/40169744777/job/121097994934) SUCCESS. 최초 TS 실패는 아래 별도 Issue #52 원장에 보존.
- **실제 원인/교정:** `result()` helper가 기본 Polygon geometry 객체를 테스트 간 공유했다. deep-copy 검사 자체의 변이(`x=900`)가 공유 fixture를 오염해 뒤 테스트의 Ring closure 검사를 실패시켰다. helper가 호출별 `structuredClone(geometry)`를 반환하도록 하고 새 fixture `[0,0]` 검증을 추가. 운영 validator 및 Ring 닫힘 assertion 변경/완화 없음. 당시 사전 계획의 fixture 좌표 closure 가설은 가설로 보존하고 최종 원인과 혼합하지 않는다.
- **재현/수정 확인:** Developer가 수정 전 대상 파일 4 PASS/6 FAIL 및 단독 detach 1 PASS를 확인했고, 수정 후 10/10 PASS를 2회 확인했다. QA는 전체 Unit **202/202**, Typecheck, Lint(오류 0/기존 ARIA warning 1), GHCR parser 3/3, synthetic outline benchmark, production build, Chromium **65/65**, Legacy migration **1/1**을 모두 독립 로컬 실행하여 PASS. 실 CAD/GPU 및 로컬 Docker NOT RUN. 상세 실행 환경·대행 역할은 [TestReport](TestReport.md).
- 첫 TS 및 두 번째 Unit CI 실패는 서로 다른 HEAD/단계 결과로 유지한다. 로컬 재검증은 새 PR CI 성공이나 배포 결과로 전용할 수 없다.
- **게시 전 점검:** 기존 P2 스레드 3건 모두 resolved, 미해결 0건. PR HEAD `41cf16c`가 main `bfbd523`을 포함해 behind 0/mergeable=true이며 추가 충돌 해결은 필요하지 않았다. 최종 수정 커밋을 같은 PR 브랜치에 non-force push하여 새 PR CI 시작만 확인한다. 시작 Run 링크는 PR 검증 댓글에 기록하며 모니터링·병합·GHCR 게시·이슈 종료는 수행하지 않는다.

## Issue #52 / PR #79 — CI TypeScript 실패 및 P2 리뷰 3건 (2026-10-25 KST)

- **최초 실패 원장:** [PR #79](https://github.com/planner77/layoutManager/pull/79), [Run 40168296155](https://github.com/planner77/layoutManager/actions/runs/40168296155) 최초 HEAD `40aba11f9bb8117149e8487c39d8cf72f9f384cd`, completed/**failure**. Verify [Job 121093743809](https://github.com/planner77/layoutManager/actions/runs/40168296155/job/121093743809): checkout/npm ci/Prisma PASS, TypeScript **FAIL** (`tests/e2e/issue52-generated-history.spec.ts:62` TS2339 `Event.key`·`Event.ctrlKey` 2건). ESLint, Unit, Benchmark, Build, Playwright, E2E, Legacy migration SKIPPED. Artifact upload Step 성공. 독립 Docker [Job 121093744225](https://github.com/planner77/layoutManager/actions/runs/40168296155/job/121093744225)는 SUCCESS.
- **직접 원인/조치:** `querySelector`의 일반 `Element`→`Event` 타입 추론을 `querySelector<HTMLInputElement>`로 구체화해 키보드 접근 컴파일 오류를 차단. 기존 Ctrl+Z E2E 검증은 유지, skip/삭제 없음.
- **별도 P2 리뷰 3건:** [#4369873353](https://github.com/planner77/layoutManager/pull/79#discussion_r4369873353), thread `PRRT_kwDOUQjDfc6v-6n7`: WCS (1e9,1e9) unit Polygon Shoelace cancellation → 링 원점 상대좌표 면적 검증 및 TC-E2-UNIT-006. [#4369873355](https://github.com/planner77/layoutManager/pull/79#discussion_r4369873355), thread `PRRT_kwDOUQjDfc6v-6n9`: Delete Undo + 새 append로 100k vertex/100 object 복원 초과 → Undo-restorable capacity 예약, 새 확정 시 호환불가 Undo 이력 무효화 및 TC-E2-UNIT-007. [#4369873358](https://github.com/planner77/layoutManager/pull/79#discussion_r4369873358), thread `PRRT_kwDOUQjDfc6v-6oA`: captured selection으로 stage commit이 SOURCE/혼합 또는 다른 ID 변경을 무시 → 현재 선택 재검증·선택/모드 변경 시 취소, TC-E2-UNIT-008.
- **재검증 경계:** 기존 실패를 보존. 수정된 HEAD의 Typecheck/Lint/Unit/Build/E2E 및 실 CAD/GPU 결과는 아직 **NOT VERIFIED**. 새 PR CI 실행 시작과 성공은 별도, 원본 DXF/Worker/DB/서버 API/#31 P4 보안 정책 불변.


## Issue #66 / PR #78 — 첫 PR CI Unit 실행 계약 회귀 및 경량화 실측 (2026-10-25 KST)

- **실패 원본 보존:** [PR #78](https://github.com/planner77/layoutManager/pull/78), [PR CI Run 40167191799](https://github.com/planner77/layoutManager/actions/runs/40167191799), `pull_request.synchronize`, 원 HEAD `45389a4661d424e7ad6aa6ee66bcd643bbc6ad76`, **completed/failure**. Verify [Job 121090554088](https://github.com/planner77/layoutManager/actions/runs/40167191799/job/121090554088): checkout/npm ci/Prisma generate/TypeScript/ESLint **SUCCESS**, Unit+Integration **187 PASS / 1 FAIL** (38 files passed/1 failed). OCI parser Node test, synthetic DXF benchmark, Production Build, Chromium 설치, E2E, Legacy migration E2E **SKIPPED** (실패로 주장 금지). Artifact 업로드 Step 성공했으나 파일이 없어 실제 artifact 없음.
- **직접 원인:** `src/tests/unit/standalone.test.ts` `TC-IMAGE-003`이 이전 `CMD ["node", "scripts/run.mjs", "deploy"]` 문자열을 Dockerfile 전체에 기대. #66은 안전하게 `CMD ["./node_modules/.bin/tsx", "scripts/deploy.ts"]`로 변경했으나 기존 단정문은 미갱신. Docker 실제 migration→backfill 성공으로 확인된 기능 결함은 아니며 **테스트가 이전 내부 실행 명령에 고정된 계약 회귀**. 단순 skip/expect 삭제가 아니라 검증을 수정해야 함.
- **성공한 독립 Job:** Docker Runtime [Job 121090554257](https://github.com/planner77/layoutManager/actions/runs/40167191799/job/121090554257) **completed/success**. 동일 HEAD source, Node `22.14.0`, linux/amd64, 이전 migrator `1,336,572,597 bytes` → 새 migrator `578,862,325 bytes` (비압축 **56.69% 감소**, 30% soft target 충족). `docker save|gzip -1` proxy `462,720,650` → `212,574,989 bytes` (**GHCR OCI 압축 레이어/네트워크 다운로드량 아님**). 새 `node_modules` 약 **365 MiB** (Prisma CLI/transitive/native 필수 유지); 필수/불필요 파일 검증과 native SQLite/UID 10001, 최초 설치+backfill+health 200, 재실행 멱등, 정적 WASM/font, 잘못된 SQL (Prisma P3018) 및 쓰기 불가 DB (exit 1) 차단 성공. 실제 운영 DB/CAD 보존·백업 복원/OCI GHCR 게시 전송량 **미검증**.
- **교정:** `TC-IMAGE-003`을 migrator/runtime **독립 stage 분리**, 전용 `migrator-dependencies` offline prune·minimal copy, UID·non-web CMD 및 `migrate` Compose `service_completed_successfully` 검증으로 갱신. `TC-IMG66-010`에 `deploy.ts`의 Prisma `migrate deploy` 종료 대기 → backfill 실행 순서를 별도 회귀로 추가. 기존 DB/실행 코드/Dockerfile/마이그레이션/버전/앱은 **변경하지 않는다**.
- **검증 경계/리뷰:** 정적 검증 및 PR 재실행 이전 신규 HEAD의 Unit/OCI parser/Build/E2E/Legacy/Full Docker는 **NOT VERIFIED**. 첫 Docker Job 성공을 최신 수정 HEAD 성공으로 대체 불가. PR Inline Review **0건**, Codex 이전 review summary는 기존 HEAD `f6ec326` 기준 finding 없음; 최신 HEAD 재검토 필요. 첫 확인 `main` behind 0, PR mergeable=true. 새 HEAD 변경 및 리뷰/충돌 확인 후 `pull_request.synchronize` PR CI **시작까지만** 진행(사용자 지시상 모니터링 생략), merge/GHCR/Issue close 금지.

## Issue #51 / PR #77 — 최초 CI Unit 계약 오류 및 별도 P2 리뷰 (2026-10-25 KST)

- **실패 보존:** [PR #77](https://github.com/planner77/layoutManager/pull/77), [Run 40164835838](https://github.com/planner77/layoutManager/actions/runs/40164835838), `pull_request.opened`, attempt 1, 검증 HEAD `c84a04e61cbaa413ee166ff896dcb7c10f1ec04b`, **completed/failure**. Verify [Job 121083652315](https://github.com/planner77/layoutManager/actions/runs/40164835838/job/121083652315): Checkout/npm ci/Prisma/TypeScript/ESLint **PASS**, Unit+Integration **186 PASS/1 FAIL** (38/39 test files PASS). Synthetic Benchmark/Production Build/Chromium 설치/E2E/Legacy Migration **SKIPPED**; 실패 Artifact 업로드 Step **SUCCESS**. 별도 Docker runtime [Job 121083652401](https://github.com/planner77/layoutManager/actions/runs/40164835838/job/121083652401) **SUCCESS**.
- **CI 직접 원인:** `src/tests/unit/viewer.test.ts:75` / `TC-U6-UNIT-003`: `vi.fn()`은 `selectSavedOutline('local-1')`을 기대했으나, E1 `ViewerManager.focusSavedOutline`가 `selectSavedOutline('local-1',false)` 호출. #43 U6 단일 선택 Adapter 호출 계약을 E1에서 무심코 변경한 회귀이며 Geometry/DB/Worker/Docker 실패가 아님.
- **수정/회귀:** 기본 단일 선택에서는 기존 `selectSavedOutline(id)` 호출 그대로 유지, Ctrl/⌘ additive에서만 `selectSavedOutline(id,true)` 사용. 원래 Unit 기대를 변경하거나 우회하지 않고, 명시적 true 경로 검증을 `TC-E1-UNIT-003`에 추가. Canvas/Tree 동기화·Source readonly 정책 불변.
- **별도 P2 리뷰 (CI 실패와 구분):** [Review #4369760096](https://github.com/planner77/layoutManager/pull/77#discussion_r4369760096), thread `PRRT_kwDOUQjDfc6v-o9T`: 작은 WCS(0.001) Polygon과 얇은 가로 crossing window가 실제 교차하더라도 `u*v<-1e-9`의 고정 determinant-product 임계값 때문에 누락. 고정 endpoint EPS 또한 너무 작은 좌표에서는 near miss를 collinear로 오분류할 위험. proper crossing에 orientation **부호 직접 비교**, collinear endpoint 검사에 부동소수점 곱 규모 비례 error bound 적용. `TC-E1-UNIT-004`에 작은 진교차·비교차·근접 hit 테스트 추가.
- **main 동기화/충돌 해결:** 첫 CI 이후 `main`에 #74 commit `afd6f862c7fa6c5f188620924b7ec1b13c033e4a`가 병합되어 PR #77이 일시적 `behind=1/mergeable=dirty`가 되었다. #74의 Workflow run-name, Operation/Issue68/Issue74 및 `0.36.1` 릴리스 기록을 유지하고, #51 `0.37.0` 작업을 별도 SemVer로 유지. 공통 AGENTS/ChangeLog/Decisions/TestPlan/FailureLedger 기록 모두 인수했고 ADR 번호 충돌은 #74 **ADR-041**, #51 **ADR-042**로 정리했다. 작업 HEAD `744547899e1666bd1e0eda935961f80e8cced462`는 branch/main 두 부모 merge commit이며 force push 없이 정렬, 비교 당시 **behind=0, mergeable=true**. P2 review thread `PRRT_kwDOUQjDfc6v-o9T`는 수정 근거 답변 후 **resolved**. 
- **검증·재시작 원칙:** 최초 HEAD의 TS/Lint/Docker PASS를 변경 HEAD PASS로 전용하지 않는다. 로컬 npm/Vitest/Playwright/Build/실 DXF·GPU 시험은 GitHub Connector 원격 수정 환경에서 **NOT RUN**. 실패·취소·SKIPPED 근거는 삭제하지 않고 본 원장에 보존; [Issue51](Issue51.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md)에 AC/TC 연결. 단일 기능 브랜치의 새 HEAD push로 자동 `pull_request.synchronize` PR CI를 **시작만 확인**, 모니터링·병합·GHCR·Issue 종료는 수행하지 않는다.


## Issue #74 / PR #75 — 실행명 회귀, PR CI 성공 및 v0.36.1 게시 준비 (2026-10-25 KST)

- **PR CI 실패 없음:** [Run 40163919324](https://github.com/planner77/layoutManager/actions/runs/40163919324), 원 HEAD `71c577ed8f975c0d2e505e38a32bc05cdb5b0043`, **completed/success**. Verify Job `121080972437`(Typecheck/Lint/Unit·Integration/Benchmark/Build/Chromium E2E/Legacy Migration) SUCCESS; Docker Runtime Job `121080972286` SUCCESS. 실패 Artifact Step은 정상 **SKIPPED**. 관련 신규 FAIL/CANCELLED Run 0건, 이를 허위 실패로 기록하지 않는다.
- **실제 결함은 GitHub Actions 실행명 메타데이터:** MAIN #34 정상과 달리 [#35](https://github.com/planner77/layoutManager/actions/runs/40159667229)·[#36](https://github.com/planner77/layoutManager/actions/runs/40162889687)은 multi-line squash commit body를 `head_commit.message`로 받아 긴 Run 이름이 되었다. 원인은 `run-name`의 전체 commit message 결합과 repo 기본 `COMMIT_OR_PR_TITLE/COMMIT_MESSAGES`. CI 자체 실패 또는 GHCR 실패가 아니다.
- **교정:** `run-name`은 LF가 있으면 짧은 `SUBJECT-ONLY-REQUIRED | run N` 진단으로 변경, 정상 단일행 `#Issue | 짧은 설명` 유지. `on:`/jobs/concurrency/permission/paired GHCR publish 로직 불변. PR #75 Review Threads **0**, 최초 HEAD mergeable clean/behind 0 확인.
- **사용자의 GHCR 게시 요구:** #68 문서/Workflow-only GHCR 제외 게이트를 임의로 우회하지 않고 `0.36.1` **새 버전**으로 패치 릴리스한다. `v0.36.1` 태그는 변경 전 미존재, `v0.36.0` 태그 불변. `src/package.json`과 lockfile 루트 변경으로 Main scope 정상 게시 대상. App/Migrator 쌍 후보 Digest 확인·승격은 Main 작업 결과로 검증해야 하며 지금은 **게시 미확인**.
- **새 HEAD 검증:** 버전/원장 기록 변경 후 기존 성공 Run을 새 HEAD로 소급하면 안 된다. 최신 PR CI 성공·리뷰/충돌 재점검 후 Squash 제목 `#74 | Main CI 실행명 커밋 본문 유입 방지` 및 **빈 본문**으로 병합. 실제 Main 이름/게시 결과는 별도. 기본 Squash Merge 저장소 관리자 설정은 [#76](https://github.com/planner77/layoutManager/issues/76)으로 이관하여 변경 완료로 주장하지 않는다.

## Issue #43 / PR #72 — 성공 PR CI 이후 P2 리뷰 정정 (2026-10-25 KST)

- **CI 실패 아님:** 초기 HEAD `5cd223cc2837fc5772154fd67138680263f159e4`에서 [PR CI Run 40161078593](https://github.com/planner77/layoutManager/actions/runs/40161078593) `completed/success`. Verify Job `121072582232`: npm/Prisma/TS/ESLint/Unit+Integration/Benchmark/Production Build/Chromium E2E/Legacy migration **SUCCESS**, Docker Job `121072582347` **SUCCESS**. 이 성공을 이후 변경 HEAD의 검증 결과로 전용하지 않는다.
- **리뷰 [P2 #4369618943](https://github.com/planner77/layoutManager/pull/72#discussion_r4369618943) / thread `PRRT_kwDOUQjDfc6v-TBd`:** 20dvh 축소 도크의 트리에서 ArrowDown/End로 화면 밖 항목에 키보드 focus를 옮기면 `focus({preventScroll:true})`가 기본 스크롤을 억제하여 선택 항목이 화면에 보이지 않음. 자동 검토 지적이며 **CI 테스트 실패로 관측된 사건이 아님**.
- **수정:** 외곽선 트리 `focusKey`에서 키보드 이동 시 현재 항목과 `role=tree` 스크롤 뷰포트만 비교하고 `scrollTop`을 최소량 이동. 외부 CAD 페이지/Canvas는 스크롤하지 않으며 Source Layer·geometry/Worker·Adapter lifecycle 불변. `TC-U6-E2E-001` 320px/20dvh에서 `End/Home` 포커스 가시성 및 `window.scrollY` 불변 회귀 보강.
- **게이트:** 코드·테스트·문서가 바뀌면 PR synchronize가 새 CI를 시작한다. 초기 HEAD 성공을 신규 HEAD PASS로 잘못 보고하거나 CI가 미완인데 릴리스 성공으로 표시하지 않는다. GitHub Review를 답변·resolve하고 최신 main behind/mergeable 및 최신 HEAD CI 성공을 재검증한 뒤 병합한다. Owner 요청에 따라 별도 CI 결과 지속 모니터링은 생략할 수 있지만 성공 확인 전 병합 게이트는 유지.
- **수용 범위:** 운영 관리자 타입·영속 재접속 복원 AC는 후속 [#73](https://github.com/planner77/layoutManager/issues/73)으로 분리, #65/#71/#31 P4 차단. 원 Issue #43 전체 AC 완료로 표기하지 않는다.


## Issue #42 / PR #70 — 최신 main #68 병합 충돌 대응 (2026-10-25 KST)

- 원장 기록을 푸시한 뒤 [main #68, commit 38f05e0f](https://github.com/planner77/layoutManager/commit/38f05e0f2633ca15bfd689b03846d4f0b13f249a)의 CI workflow/AGENTS/ChangeLog/Decisions/TestPlan/Issue68/Operation 변경으로 PR이 일시적으로 behind=1 및 mergeable=dirty가 됨. 기존 #42 코드와 #68 기능은 독립이며 공통 Markdown 전면 삽입부 충돌.
- **해결:** #68의 원본 Git blob으로 변경된 workflow/Issue68/Operation을 인수하고 공통 4개 문서 AGENTS/ChangeLog/Decisions/TestPlan에는 두 이슈의 섹션을 모두 보존. 중복 ADR-038을 #68에 유지하고 #42는 ADR-039로 변경. 두 부모 merge commit을 non-force fast-forward 반영해 최신 main과 정렬. PR 제목을 #68 규칙에 따라 `#42 | U5 외곽선 업무 타입 지정·JSON v2 안전 계약`으로 변경.
- 실패 Run 40157734271, Job 121062609278, Artifact 12585362916 및 최초 수정 a5d9f843 기록은 삭제 없이 아래 기록에 계속 보존한다. 병합 후 신규 CI 성공을 미리 주장하지 않는다.


## Issue #42 / PR #70 — 최초 CI U3/U5 도구 높이 연계 E2E 화면 밖 드래그 (2026-10-25 KST)

- **실패 실행 보존:** [PR #70](https://github.com/planner77/layoutManager/pull/70), [PR CI Run 40157734271](https://github.com/planner77/layoutManager/actions/runs/40157734271) (pull_request.opened, attempt 1, 원본 HEAD `526a1be98232e16d004f9d23915a051e2fca9e2a`), `completed/failure`. [검증 Job 121062609278](https://github.com/planner77/layoutManager/actions/runs/40157734271/job/121062609278) Step 12 **Playwright Chromium E2E 57 PASS / 1 FAIL**. npm ci, Prisma Client 생성, TypeScript, ESLint, Unit·Integration, DXF synthetic benchmark, production Build, Chromium 설치는 PASS. 이후 Legacy Migration E2E는 **SKIPPED**, 실패 artifact 업로드 성공. 별도 [Docker Runtime Job 121062609436](https://github.com/planner77/layoutManager/actions/runs/40157734271/job/121062609436)는 **SUCCESS**. E2E 실패를 Docker 실패로 분류하지 않는다.
- **실패 정확 위치:** `src/tests/e2e/issue31-outlines.spec.ts:53`, `TC-OUT-E2E-001`의 **두 번째 좌→우 영역 선택** 이후 `getByTestId('outline-selection-count')` 예상 `선택 1개`, 실제 `선택 0개 / 분석 1개`, Playwright 5s timeout. 첫 영역 선택, CONVEX preview/임시 확정, v1 JSON 다운로드, PRECISE preview 및 기존 선택 해제까지는 실제 통과. Render mapping 정상 `매핑 제외 0개`.
- **직접 근거/근본 원인:** [실패 Artifact 12585362916](https://github.com/planner77/layoutManager/actions/runs/40157734271/artifacts/12585362916)의 `error-context.md`와 Playwright `trace.zip`: 첫 `mouseDown` 전 `mouse.move(38,314)` 및 마우스 drag 종료 `(1402,954)`는 정상 viewport. 이후 하단 도구의 `선택 해제` 버튼을 클릭하면서 **NORMAL(non-immersive) 페이지 스크롤**이 발생하고 캔버스 `boundingBox.y=-63`; 동일 테스트의 두 번째 `mouse.move(38,-58)` → `mouseDown`은 화면 밖에서 시작해 Canvas `pointerdown`을 전달할 수 없었다. U5 추가 폼/안내로 하단 도구가 커진 상태에서 이 잠재적인 Viewport 좌표 가정이 노출됨. Geometry Worker/Source mapping/DB 오류라는 근거 없음.
- **수정 및 재발 방지:** [test commit `a5d9f843`](https://github.com/planner77/layoutManager/commit/a5d9f8430e06fe3b223dc97157c917ac6e793394): `selectFullCanvas(page)` 테스트 Helper로 첫/두 번째 드래그 모두 `canvas.scrollIntoViewIfNeeded()`, `expect(canvas).toBeInViewport({ratio:1})`, `boundingBox` 검증 후 실제 viewport 마우스 드래그와 기존 `선택 1개` 관측을 유지. Pointer Controller, Canvas resize, Geometry·DXF Worker, U5 유형 로직·권한·DB/API는 수정하지 않는다. 실패를 재시도/대기시간 증가나 Assertion 제거로 숨기지 않음.
- **Review/Main:** 첫 점검에서 [PR #70](https://github.com/planner77/layoutManager/pull/70) inline review **0건(미해결 0)**, Codex review summary `526a1be`에 발견 없음. `main` 비교 최초 **behind 0**, `mergeable=true`로 충돌 없음. docs 반영 후 재확인 필요; 새 리뷰/변경이 생기면 이력 보존 후 처리.
- **재검증 상태:** 최초 HEAD의 Unit/Build/Docker PASS를 수정 HEAD의 PASS로 전용하지 않음. 로컬 `npm ci`/Playwright/실 CAD 검증 **NOT RUN**. 실패 Run을 삭제/덮어쓰기 없이 보존하고 이 수정+원장/TC 문서를 기능 브랜치에 fast-forward push하여 `pull_request.synchronize` 새 PR CI를 시작한다. **새 Run의 결론은 아직 NOT VERIFIED; CI 모니터링은 사용자 요청에 따라 생략.** 운영 카탈로그·P4 보안 게이트(#65/#31) 변동 없음.


## Issue #41 / PR #64 — 재검증 PASS·병합·Main GHCR 시작까지의 종결 기록 (2026-10-25 KST)

- **이전 실패 보존:** [PR #64](https://github.com/planner77/layoutManager/pull/64), [실패 Run 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566) (HEAD `d548df2`, Step 12 Chromium E2E `TC-U4-E2E-PREVIEW-001` locator strict violation, 55 PASS/1 FAIL, Legacy migration SKIPPED; Docker PASS)는 바로 아래 최초 실패 항목과 [artifact 12583742658](https://github.com/planner77/layoutManager/actions/runs/40153913566/artifacts/12583742658)에 보존한다. 중복 이름 오류 자체는 정상이며 Next Route Announcer까지 범위가 넓은 E2E locator가 원인이었다.
- **조치 및 P2 리뷰:** 코드 [fix `b389b66e`](https://github.com/planner77/layoutManager/commit/b389b66e11a34ad6fa737fc5ff760277d192797a)와 문서 [commit `e2f0a64d`](https://github.com/planner77/layoutManager/commit/e2f0a64d45f601420a2bc38b99531c748269f61a)로 validation alert를 prototype 내부로 한정하고 일반 HTTP의 `crypto.randomUUID` 부재를 `crypto.getRandomValues` UUIDv4 fallback + Unit/E2E로 보완했다. [P2 review #4369348797](https://github.com/planner77/layoutManager/pull/64#discussion_r4369348797) 답변 후 thread `PRRT_kwDOUQjDfc6v9pJm` **resolved**. 병합 직전 미해결 0건, `main` 대비 **ahead 3/behind 0**, GitHub mergeable=true, 충돌 없음.
- **성공 증거:** 수정 HEAD `e2f0a64d45f601420a2bc38b99531c748269f61a`의 [PR CI Run 40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531), `pull_request.synchronize`, **completed / success**. [verify Job 121054317463](https://github.com/planner77/layoutManager/actions/runs/40154979531/job/121054317463): npm ci/Prisma/Typecheck/ESLint/Unit·Integration/DXF synthetic Benchmark/Production Build/Playwright Chromium E2E/Legacy Migration E2E **전부 PASS**; 이전 실패 artifact step은 SKIPPED(실패가 없으므로). [Docker job 121054317216](https://github.com/planner77/layoutManager/actions/runs/40154979531/job/121054317216): 컨테이너/마이그레이션/런타임 Smoke **SUCCESS**. 이것은 #41 *비영속 시안 코드*의 CI 수용이지 실제 CAD/IdP/Admin CRUD 수용이 아님.
- **병합 증거:** 성공한 HEAD 기준 [PR #64 squash merged](https://github.com/planner77/layoutManager/pull/64), 새 main commit [7da613d1ed9e2893849a3c3a7f0931d4f32ff850](https://github.com/planner77/layoutManager/commit/7da613d1ed9e2893849a3c3a7f0931d4f32ff850). PR 제목·코드 수명은 v0.34.0. 원래 #41은 사용자 요청에 따라 닫혔지만 전체 운영 AC 충족 아님: **not_planned(범위 분할)**로 명시 수정, 영속 관리 인증·scope·audit·DB FK AC-U4-01~04를 [#65](https://github.com/planner77/layoutManager/issues/65)로 이관. #31 P4와 공통 보안 정책 승인 대기.
- **Main/GHCR 시작 증거:** `main` squash push의 [.github/workflows/docker-publish.yml](https://github.com/planner77/layoutManager/blob/main/.github/workflows/docker-publish.yml)이 [Run 40155833554](https://github.com/planner77/layoutManager/actions/runs/40155833554) (`push`, HEAD `7da613d1`, 조회 시 **in_progress**)를 시작. Workflow는 v0.34.0 Git tag, app `ghcr.io/planner77/layoutmanager:0.34.0` 및 migrator `:0.34.0-migrate`, `latest`/`latest-migrate` 후보 검증·승격을 설계대로 수행할 예정. **게시 성공·실제 태그/digest 검증 및 Main CI 결론은 요청에 따라 모니터링하지 않았으므로 미확정.**
- **문서 전용 후속 main commit:** PR 수용 증거를 원장에 반영하기 위한 이 문서 커밋 자체도 `push main` workflow를 추가로 트리거할 수 있다. 같은 버전 이미지가 둘 다 존재하면 workflow는 중복 게시를 건너뛰는 정책이며, 실제 실행 결과는 별도로 확인해야 한다. 이전 성공 PR CI를 문서 후속 커밋의 신규 실행 결과로 허위 인용하지 않는다.


## Issue #41 / PR #64 — 최초 CI E2E Locator Fail과 별도 HTTP P2 리뷰 (2026-10-25 KST)

- **Run 증거:** [PR #64](https://github.com/planner77/layoutManager/pull/64), [PR CI Run 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566) (`pull_request.opened`, attempt 1, HEAD `d548df2b4bb183ff6a2df1c227124e93f40c4054`, `completed/failure`). [verify job 121051041258](https://github.com/planner77/layoutManager/actions/runs/40153913566/job/121051041258)의 **step 12 Chromium E2E에서 56개 중 55 PASS / 1 FAIL**; `npm ci`, Prisma client, TypeScript, ESLint, Unit/Integration(35 files), DXF synthetic benchmark, Production Build, Chromium 설치 **PASS**; step 13 Legacy migration E2E **SKIPPED**, step 14 실패 artifact 업로드 **PASS**. [Docker runtime job 121051041382](https://github.com/planner77/layoutManager/actions/runs/40153913566/job/121051041382) **SUCCESS**. [Artifact 12583742658](https://github.com/planner77/layoutManager/actions/runs/40153913566/artifacts/12583742658).
- **직접 실패:** `src/tests/e2e/issue41-outline-type-preview.spec.ts:26`, `TC-U4-E2E-PREVIEW-001`의 `await expect(page.getByRole('alert')).toContainText('같은 이름')`가 Playwright `strict mode violation`: 두 `role=alert` 요소(정상 표시된 중복 이름 경고 `<p>`, Next `__next-route-announcer__` `<div>`)를 동시에 찾음. 테스트 locator 범위가 지나치게 넓은 것이 원인이며 실제 앱 중복 정책은 정상. 서버 로그에 발생한 예상 400/403/409/415는 해당 테스트 실패와 직접 관계 없음.
- **리뷰 별개:** [P2 inline comment 4369348797](https://github.com/planner77/layoutManager/pull/64#discussion_r4369348797) — `http://<IP>:3000` secure context 아님으로 `crypto.randomUUID()` undefined, 시안에서 신규 타입을 추가할 수 없음. CI의 local 127.0.0.1 실행에서 직접 실패로 관측된 것은 아니며 사전 리뷰에서 발견한 실제 배포 환경 호환 위험. 기존 `TC-ISSUE14-001`과 대응.
- **해결:** [code commit `b389b66e`](https://github.com/planner77/layoutManager/commit/b389b66e11a34ad6fa737fc5ff760277d192797a): E2E는 시안 container `preview.getByRole('alert')`로 scope 한정; 시안 UUID는 `crypto.randomUUID` 가능한 경우 우선 사용, 일반 HTTP에서 `crypto.getRandomValues` CSPRNG UUIDv4 fallback. CSPRNG 없으면 fail-closed, `Math.random` 금지. 신규 Unit `TC-U4-UNIT-005/006`, Browser `TC-U4-E2E-HTTP-003`(브라우저 initScript로 `randomUUID` 제거→추가 성공/reload 삭제) 추가. 실제 CRUD/RBAC/DB/migration은 미구현 안전 차단 유지.
- **리뷰/충돌:** PR #64 unresolved review thread `PRRT_kwDOUQjDfc6v9pJm`(위 P2) 1건 확인, 수정 코드 기준 답변·resolve 예정. 원래 PR metadata는 `mergeable=true`였으며 main `4818f666`과 동기 상태; 원격 갱신 직전 base HEAD 재확인 및 `ahead/behind` 재검증 필요. 리뷰 해결과 별개로 CI 재실행은 필수.
- **재시도·결과 경계:** 최초 실패는 삭제/무시하지 않으며 본 원장에 보존. 문서 commit + 코드 commit을 PR 브랜치에 단일 fast-forward 반영하여 `pull_request.synchronize` 새 CI 시작. **새 HEAD의 Unit/Lint/Build/E2E/Legacy/Docker 결과는 시작 전 NOT RUN, 모니터링하지 않음**. 아직 성공이라 기록하지 않으며 Issue #41은 Owner 보안 승인 전 OPEN/BLOCKED.


## Issue #40 / PR #48 — 두 번째 PR CI의 E2E 실패·조치 (2026-10-25 KST)

- **실제 실패 실행:** [PR #48](https://github.com/planner77/layoutManager/pull/48), [Run 40150085136](https://github.com/planner77/layoutManager/actions/runs/40150085136), `pull_request.synchronize`, attempt 1, HEAD `76018b6b8f163323681b76b76b1a50f4f165fcaf`, `completed/failure`. [verify job 121039597527](https://github.com/planner77/layoutManager/actions/runs/40150085136/job/121039597527)의 **Step 12 Chromium E2E**에서 **54건 중 52 PASS / 2 FAIL**. `npm ci`, Prisma, TypeScript, ESLint, Unit/Integration, synthetic 1k/10k/100k benchmark, Production Build, Chromium 설치 **PASS**. 뒤따르는 Legacy migration E2E는 **SKIPPED**. 별도 [Docker runtime job 121039597376](https://github.com/planner77/layoutManager/actions/runs/40150085136/job/121039597376) **SUCCESS**. 다른 E2E 테스트에서 의도적으로 발생시킨 400/403/409/415 응답은 두 실패의 원인으로 분류하지 않는다.
- **E2E 실패 A — 기대 정책 불일치:** `src/tests/e2e/issue31-outlines.spec.ts:107`, `TC-OUT-E2E-001`. `reload()`은 `dispatchApp(reset)`하여 `outlineToolEnabled=false`가 된다. 해당 테스트는 재로드 직후 하단 도구의 `outline-selection-count` 존재와 `선택 0개` 텍스트를 기대했지만 도구 자체가 의도대로 unmount 되어 locator를 찾지 못했다. 실제 [Playwright Error Context](https://github.com/planner77/layoutManager/actions/runs/40150085136/artifacts/12582184252)는 메뉴 `외곽선 생성: OFF`와 정상 `도면 표시 완료`를 기록한다. **보완:** reload 후 로드 완료→메뉴 OFF→도구 없음 검증→명시적 ON 후 선택 0개 확인. U3의 기본 OFF 정책은 수정하지 않음.
- **E2E 실패 B — 잘못 만든 합성 DXF:** `src/tests/e2e/issue40-outline-tool.spec.ts:152`, `TC-U3-E2E-003`. 처음 `dxf-viewer` 로드에서 `표시 실패`. 같은 CI [Playwright trace Artifact](https://github.com/planner77/layoutManager/actions/runs/40150085136/artifacts/12582184252) `issue40-outline-tool-*/trace.zip`의 브라우저 console에 **`Error: n must be greater than 0 vertices`** / `parseEntity`이 확인됨. 합성 `LWPOLYLINE`에 `10/20` 꼭짓점 좌표 4쌍은 있으나 꼭짓점 수 **DXF group code `90`**이 없어 엄격한 `dxf-viewer` Parser가 0 vertex로 처리. `three-dxf-viewer`가 같은 불완전 Fixture를 수용한 사실은 파일 유효성의 근거가 아님. [Autodesk 공식 LWPOLYLINE DXF Reference](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm)는 group `90 = Number of vertices`, `10/20 = vertex coordinates`로 정의한다. **보완:** `issue40-outline-tool.spec.ts`와 `issue31-outlines.spec.ts`의 LWPOLYLINE Fixture에 `'90','4'` 명시; 두 Renderer 교차 시험의 실제 도형/원본·기하 알고리즘은 변경하지 않음.
- **조치 코드:** [commit `fd1f4613`](https://github.com/planner77/layoutManager/commit/fd1f4613c1cc69b2f383c7cc4129a8d95d70ec39) — 테스트 파일 두 건의 DXF group-90 및 reload 계약 갱신. 제품 `ViewerManager`, Adapter, DXF parser, DB/API, 운영 원본에는 수정 사항 없음.
- **리뷰/충돌:** [P2 review #4369181241](https://github.com/planner77/layoutManager/pull/48#discussion_r4369181241)은 이전 보완으로 `is_resolved=true`; 새 미해결 리뷰 스레드는 확인 시 **0건**. 현재 PR은 `mergeable=true`, main 대비 `ahead=4/behind=0`(문서 commit/재검증 전 기준); 변경사항에 충돌 없음. 원격 HEAD 갱신 전에 main 상태를 재확인하고 non-force fast-forward만 진행.
- **검증 경계:** 첫 2차 Run에서 ESLint/Unit/Build PASS는 **해당 HEAD에 한정**. 새 Fixture/테스트 기대를 수정한 HEAD의 lint/E2E/실 CAD 등은 **미검증**; 코드와 문서 Commit 후 `pull_request.synchronize`로 신규 CI만 시작하며 사용자 지시에 따라 결과 모니터링 생략. 새로운 CI Run ID는 시작 확인 시 별도 보고.

## Issue #40 / PR #48 — 최초 PR CI ESLint 차단 및 P2 리뷰 보완 (2026-10-25 KST)

- **확인된 실패:** [PR #48](https://github.com/planner77/layoutManager/pull/48), [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671) (`pull_request.opened`, attempt 1, HEAD `850ded81fcd0d27267a5c38ac9bcff1a980ac39b`) = `completed/failure`. [verify Job 121036582144](https://github.com/planner77/layoutManager/actions/runs/40149077671/job/121036582144)의 **step 7 ESLint**에서 `src/features/cad-viewer/viewer.tsx:404:186`에 `react-hooks/refs` **error**(`Cannot access refs during render`; `Passing a ref to a function may read its value during render`), 같은 파일 363:6의 `react-hooks/exhaustive-deps` **warning**(`resetOutline` 의존성 누락). ESLint exit 1이 직접 CI 실패 원인.
- **근본 원인:** U3 변경으로 `resetOutline`이 Ref(`outlineEnabledRef`, `manager.current`, request revision)를 읽는 코드가 되었으나 Renderer 선택 `choose(value)`의 간접 호출 및 JSX render 단계 `[...].map`에 연결되었다. React Hooks refs lint가 render 단계의 잠재적 Ref 접근으로 차단했다. `resetOutline`이 매 렌더마다 새 함수인 채 load effect에서 사용되어 의존성 경고도 발생.
- **Job 사실 구분:** 첫 Run의 npm ci/Prisma Client 생성/TypeScript **PASS**, ESLint **FAIL**. Unit/Integration, 1k/10k/100k benchmark, Production build, Chromium 설치/E2E, Legacy migration E2E는 **SKIPPED**(시도되지 않음). 별도 [Docker runtime Job 121036582209](https://github.com/planner77/layoutManager/actions/runs/40149077671/job/121036582209)는 **SUCCESS**. 도커 성공을 Renderer/Worker/E2E 성공으로 확대 해석하지 않음.
- **별도 Review (CI 실패 자체와 구분):** [P2 inline comment #4369181241](https://github.com/planner77/layoutManager/pull/48#discussion_r4369181241)는 `SelectionController`의 `window keydown capture`가 `button` 포커스에서 Space를 `preventDefault()`하여 ON 이후 Space로 OFF 불가한 키보드 결함을 지적. ESLint failure의 직접 원인은 아니며 테스트는 SKIPPED 상태여서 관측된 E2E 실패로 보고하지 않는다.
- **보완(코드 commit [`0ba21a66`](https://github.com/planner77/layoutManager/commit/0ba21a66e02c5a842e527ececdb678f447940a8f)):** `stopOutlineEditing/resetOutline/choose`를 안정적인 `useCallback`으로 분리, `resetOutline`을 load effect dependency에 명시하고 Renderer 버튼의 render `map` 우회(두 explicit button)로 ref 전달 경로 제거. Space Pan 핸들러는 실제 **비대화형 대상**에서만 키를 가로채고 버튼/메뉴·링크·요약은 native Space 동작을 유지. 기존 선택 ESC·캔버스 Space Pan은 변경하지 않음. E2E `TC-U3-E2E-001`(Enter ON → Space OFF → Space ON) 및 `TC-U3-E2E-002`(캔버스 Space+drag 후 선택 0, fit → 정상 선택)를 보강.
- **재검증/상태:** 수정 HEAD의 로컬 npm/lint/Unit/Playwright/Build/현장 CAD 검증은 네트워크·환경 제약으로 **NOT RUN**. Git 객체 commit 작성만으로 PR CI가 재실행되지 않으므로 **최종 문서 commit까지 생성한 뒤 브랜치 fast-forward 갱신 1회**로 `pull_request.synchronize` PR CI를 자동 시작한다. 새 Run ID/결과는 시작 직후 확인하되 완료 모니터링은 사용자 지시에 따라 생략한다.

### 누적 실패 요약 테이블 추가 행

| 날짜(KST) | Issue / PR / Run | 실패·취소 또는 현재 상태 | 근거와 원인 | 조치·커밋 | 새 CI / 검증 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-25 | #40 / [PR #48](https://github.com/planner77/layoutManager/pull/48) / [Run 40150085136](https://github.com/planner77/layoutManager/actions/runs/40150085136) (HEAD `76018b6`, attempt 1) | **FAIL**: Lint/Unit/Bench/Build PASS, E2E 52/54 PASS (2 FAIL), Legacy E2E SKIPPED; Docker PASS | [verify Job 121039597527](https://github.com/planner77/layoutManager/actions/runs/40150085136/job/121039597527) ① `TC-OUT-E2E-001` reload 후 도구 OFF인데 count locator 기대 ② `TC-U3-E2E-003` 누락 DXF group 90 → console `n must be greater than 0 vertices` | [fix `fd1f4613`](https://github.com/planner77/layoutManager/commit/fd1f4613c1cc69b2f383c7cc4129a8d95d70ec39) 테스트 ON/reset 정책 및 `90=4` DXF fixture 정정 | 새 HEAD `synchronize` PR CI 결과는 **NOT VERIFIED**, 모니터링 생략 |
| 2026-10-25 | #40 / [PR #48](https://github.com/planner77/layoutManager/pull/48) / [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671) (attempt 1, HEAD `850ded8`) | **FAIL**: TypeScript PASS, ESLint FAIL(error 1/warning 1), Unit·Build·E2E SKIPPED; Docker-runtime PASS | [verify Job 121036582144](https://github.com/planner77/layoutManager/actions/runs/40149077671/job/121036582144) `viewer.tsx:404:186 react-hooks/refs`; `363:6 exhaustive-deps`. 별도 P2 Space keyboard review | [fix `0ba21a66`](https://github.com/planner77/layoutManager/commit/0ba21a66e02c5a842e527ececdb678f447940a8f) callback/ref/render 분리, Space focus guard, E2E 강화, 문서·원장 기록 | 새 head 브랜치 `pull_request.synchronize` PR CI 시작; 새 HEAD 검증 전 **NOT VERIFIED**, 완료 모니터링 제외 |


실패를 관측한 경우 아래 템플릿에 **실제 Run URL, job/step, log 증거, 원인/수정 Commit, 재실행 Run, 결과**를 누적 기록한다. 취소된 실행은 실패와 구분해 보존한다. 미실행 테스트는 성공으로 표기하지 않는다. 이 파일은 #38부터 사용하는 신규 공통 원장으로, 기존 이슈별 실패 기록은 역사적 `out/TestReport.md`와 개별 Issue 문서를 참조한다.

| 날짜(KST) | Issue / PR / Run | 실패·취소 또는 현재 상태 | 근거와 원인 | 조치·커밋 | 새 CI / 검증 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-25 | #45 / [PR #46](https://github.com/planner77/layoutManager/pull/46) / [Run 40142618328](https://github.com/planner77/layoutManager/actions/runs/40142618328) (attempt 1, HEAD `1a35b089`) | **FAIL**: Typecheck PASS / ESLint FAIL, Unit·Build·E2E **SKIPPED**; Docker-runtime PASS | [verify job 121017338197](https://github.com/planner77/layoutManager/actions/runs/40142618328/job/121017338197) `src/app/masters/page.tsx:8:67,8:73` `react/no-unescaped-entities` (2 errors). 별도 [P2 review](https://github.com/planner77/layoutManager/pull/46#discussion_r4368927952)는 미실행 E2E `upload.spec.ts`의 비Current row 선택 회귀를 지적 | [fix `69e6b175`](https://github.com/planner77/layoutManager/commit/69e6b17548f35c248c700c5526e9993fc3eaf7c7): JSX `&apos;` escape 및 비Current 이력은 Location 상세에서 Current 지정하도록 E2E 수정; 본 원장 포함 문서 커밋 추가 | `feature/issue-45-current-only-list` 신규 HEAD push/synchronize로 PR CI 자동 시작. **결과 미확인, 모니터링 생략** |
| 2026-10-24 | #38 / PR 미생성 시점 | **CI 착수 전, 실패 관측 없음** | 신규 U1 코드·문서, 로컬 test 미실행. 첫 CI 로그 미확보 | 기능 브랜치 `feat/issue-38-viewer-app-shell`; unit/E2E 회귀 추가 | PR 생성 시 `pull_request.opened`로 PR CI 자동 시작; 결과 모니터링/성공 판정하지 않음 |

## Issue #45 / PR #46 — 최초 CI 실패 및 예방적 리뷰 보완 (2026-10-25 KST)

- **Failure record (실제 실패):** [PR CI #40142618328](https://github.com/planner77/layoutManager/actions/runs/40142618328), attempt 1, `pull_request`, HEAD `1a35b089ce1b42c290230532ccc57c4cc5c2d24f`, completed/**failure**. [verify job 121017338197](https://github.com/planner77/layoutManager/actions/runs/40142618328/job/121017338197) 의 step **ESLint 검사 #7**에서 `src/app/masters/page.tsx:8:67`, `8:73`: `react/no-unescaped-entities` (apostrophe 2건), exit code 1. 해당 JSX 신규 설명 문구의 리터럴 `'버전 이력'`를 escape하지 않은 것이 직접 원인. 기존 앱 로직, Docker, TypeScript 오류는 이 Run에서 실패 원인이 아님.
- **Step 분리:** `npm ci`, Prisma Client 생성, TypeScript는 **PASS**; Unit/Integration, DXF benchmark, production build, Chromium 설치/E2E, legacy migration E2E는 **SKIPPED/NOT RUN** (ESLint 단에서 차단). 독립 Docker-runtime Job `121017338052`는 **SUCCESS**. npm audit 13건 및 Node deprecation 경고는 현재 종료 코드를 만든 직접 원인이 아니며 이 이슈에서 자동 업그레이드하지 않음.
- **Review finding (관측된 CI 실패가 아닌 사전 회귀):** [P2 inline review #4368927952](https://github.com/planner77/layoutManager/pull/46#discussion_r4368927952)는 `TC-ISSUE-001/LIST`가 `makeCurrent=false`로 등록한 `issue-one.dxf`를 홈에서 검색/Current 지정하려는 종전 흐름이 #45의 Current-only 계약에서 성립하지 않는다고 지적. 최초 Run에서 E2E는 **실행되지 않았으므로 E2E 실패라고 단정하지 않음**.
- **수정:** [commit `69e6b17548f35c248c700c5526e9993fc3eaf7c7`](https://github.com/planner77/layoutManager/commit/69e6b17548f35c248c700c5526e9993fc3eaf7c7) — `src/app/masters/page.tsx`를 `&apos;버전 이력&apos;`로 변경; `src/tests/e2e/upload.spec.ts`에서 홈은 Current인 `issue-two`만 표시하는지 확인 후 해당 Current 행의 Location 링크를 열어 `issue-one`을 지정, Current 원자적 교체·reload·API 조회 회귀를 보존. 리뷰 thread의 검토/해결은 해당 PR 증거에 따라 진행.
- **검증 경계:** 새 HEAD에 대해 로컬 npm/Playwright/Build를 실행하지 않았으므로 **NOT RUN**; PR CI 새 Run도 시작 직후에는 PASS로 표기하지 않는다. 사용자의 '새 PR CI 시작, 모니터링 생략'에 따라 branch fast-forward push 후 `pull_request.synchronize` 자동 실행을 트리거하고 Run만 확인. 새 Run ID/실패 반복 여부는 추후 후속 요청 시 여기에 추가한다.

## 기록 템플릿

- Issue/PR/Head SHA/Run URL/Attempt:
- 상태: FAIL / CANCELLED / SKIPPED / BLOCKED / NOT RUN
- 실패 Job·Step / 원문 Error / 로그·Artifact 출처:
- 근본 원인 / 재현 / 영향·다른 원인 배제 근거:
- 수정 내용·Commit / Reviewer Thread / 충돌:
- 실행한 로컬 시험과 결과 / 미실행 사유:
- 다시 시작한 CI Run / 종료 판정:

## Issue #38 / PR #44 코드 리뷰 보완 기록 (실패 아님)

- **기존 성공**: [PR CI #40077595050](https://github.com/planner77/layoutManager/actions/runs/40077595050), head `a2b8bbdf5ca8ed422e934907087cf919a0e4a783`, 2026-10-24 완료: `success`.
- **실패 원인으로 오기하지 말 것**: [P1 review #4366517148](https://github.com/planner77/layoutManager/pull/44#discussion_r4366517148)은 CI 실패가 아닌 키보드 이벤트 중복 소비 논리 버그 보고. `SelectionController` capture에서 `event.preventDefault()`된 ESC를 `CadTextSearch`가 다시 처리해 검색을 닫음.
- **보완**: `CadTextSearch` root/input ESC 분기에 `!event.defaultPrevented` 조건을 추가하고 `TC-OUT-E2E-001`로 선택/검색/CSS 각 1회 소비를 검증. 새 HEAD 재검증 전에는 성공 판정 금지.

## #161–#163 Scene S0/S1/S2 구현·QA 중 관측된 실패 (2026-10-30)

- **시험 이력 및 원칙:** 아래는 구현 중 관측 후 수정된 harness/fixture/코드 문제와 실제 최종 POC 결과를 나눠 기록한다. 이 항목들은 최종 소스 상태의 실패로 남아 있다는 뜻이 아니며, 최초 실패를 성공으로 덮어쓰지 않는다. PR CI/전체 E2E/실도면 검증 완료를 의미하지 않는다.
- **독립 구현 시험 중 순차 실패/보완 보고:** (1) 기본 Playwright config가 `.next/standalone` 미생성으로 시작 실패 → 독립 no-server `playwright.scene-poc.config.ts` 사용. (2) synthetic DXF의 Z 누락으로 converter 비유한 matrix/geometry → `explicitElevation` 전처리 fixture. (3) 임의 HTTP origin에서 WebCrypto 미지원 → localhost origin. (4) converter의 별도 Three 사본 때문에 `instanceof BufferGeometry` 실패 → `isBufferGeometry` 검사. (5) double sanitization에서 `cadLayer` 손실 → serializer가 tagged converter userData를 일시 sanitize 후 복원하는 방식. (6) strict geometry assertion이 Three JSON ShapeGeometry 재생성 후 vertex-index 버퍼 표현 차이를 탐지 → custom DTO의 exact buffer 보존을 후보 근거로 평가. index 차이만으로 실제 도형 손상을 단정하지 않으며 JSON 관측치는 유지 기록. (7) synthetic style fixture가 기존 30초 timeout 초과 → POC에 90초 timeout. (8) 전체 lint에서 PoC 테스트 `no-explicit-any` 20건 → typed Window/unknown helpers. (9) Node CPU probe가 `ProgressEvent` 부재로 중단; shim 후 WMFJS의 `window` 참조로 비동기 crash. CPU-only getFromPath 지원은 입증되지 않음.
- **Root 일반 E2E 병행 실행 실패:** Root가 전체 Playwright를 실행했을 때 88 PASS/6 FAIL, 7분. 실패는 `issues41`, `issues52`, `issues54`, `issues124`, `scene`, `workflow` 각 테스트 종료의 `context.close/dispose`에서 shared `src/test-results/.playwright-artifacts-*` trace ENOENT. Developer isolated POC가 같은 기본 output에서 artifact를 정리한 실행 충돌로 확인되어 제품 결함으로 분류하지 않는다. Root는 unique output `/tmp/layoutmanager-scene-full-e2e-final-results`로 재실행 중; 결과 관측 전 전체 E2E는 NOT VERIFIED. 로그 `/tmp/layoutmanager-scene-e2e.log`.
- **독립 QA 최종 소스 재실행:** source freeze 후 QA isolated POC는 1/1 PASS(44.1초). 이 QA 실행은 기본 output 경로로 시작했지만 Root의 새 재실행은 unique `/tmp` output을 사용하므로 서로 충돌하지 않았다. final measurements/limitations는 TestReport #161–#163 항목 참조. Developer가 별도 final-source PoC PASS(1/1, 34.8초)를 보고했으나 그 수치는 QA 재실행 결과와 혼합하지 않는다.

- **Manager/Root 코드 검토 발견·보완(실행 실패와 별도):** 초기 AppObject WCS nesting 검증이 정상 Polygon의 깊이를 잘못 세던 문제, derivedFrom prefix-only/길이 및 standalone Ref path 검증, non-string state 수용, manifest/asset revision 미결합, domain→adapter factory 의존과 초기 source unit 전달 누락, Three JSON의 geometry/material 참조·ShaderMaterial/external resource 허용 위험을 보완했다. 독립 QA의 최종 frozen source 집중 Unit/Browser 음성시험을 근거로 해결 여부를 확인하며 과거 초안을 실행 PASS로 소급하지 않는다.
- **재발 원인:** 공유 Playwright output 경합은 위 #153 로컬 E2E 원장에도 있었던 실행 격리 문제의 재발이다. 포트/DB만 분리하면 충분하지 않으며 각 병렬 실행에 고유 `--output`이 필요하다. Operation의 단독 PoC 명령도 고유 경로를 기본으로 안내한다.

- **Root 최종 재검증/수용:** 고유 output의 전체 일반 E2E **94/94 PASS, 6.5분, exit 0**(`/tmp/layoutmanager-scene-e2e-final.log`), 이 중 새 Scene PoC 36.2초. 앞선 88/6 실행 실패를 성공으로 소급 변경하지 않는다. 전체 Vitest 601 PASS·Build 2회 PASS·동결 소스 Typecheck/Lint PASS(기존 경고 6), 별도 signed Runtime/Greenfield/Legacy UI 각 1 PASS 및 독립 QA를 근거로 Manager가 로컬 S0/S1/합성 S2 ACCEPT했다.
- **게시 도구 상태:** read-only `gh auth status`에서 로컬 저장 인증 만료를 확인했다. Secret을 출력하거나 앱에 주입하지 않고 작동하는 GitHub 연결 도구로 staged tree와 동일한 객체를 게시한다. remote는 `.env` 지정 저장소와 일치한다. PR CI/현장/배포 성공으로 해석하지 않는다.

- **PR/리뷰·충돌 실제 확인:** 단일 [PR #168](https://github.com/planner77/layoutManager/pull/168), 코드 commit `f907c75409c033b21f8a7231d36d1c46f72171c8`. GitHub tree `d86b42a7e0c7907b9d064d4645201ce7535af9cf`가 로컬 검증 staged tree와 정확히 같음을 확인했다. GitHub 조회의 미해결 리뷰 스레드 **0건**, `mergeable=true`; main `a208cf0623166f5b7a5280e731ae164143f0dc91` 대비 behind **0**, 해결할 충돌 없음. 이는 외부 리뷰 승인이나 CI 성공을 뜻하지 않는다.
- **최신 HEAD CI 시작 경계:** 이 확인 기록을 포함한 후속 docs commit을 기대 원격 HEAD 검사 및 `force=false`로 전진시키면 `pull_request.synchronize` PR CI가 시작된다. Run 링크/최신 HEAD는 최종 대화 및 PR 본문에 남기고 결과 모니터링은 하지 않는다. CI 결과 **NOT VERIFIED**; 병합·태그·GHCR·운영 DB/API/배포·이슈 종료 미실행.


## #164/#165 Root 최종 시험 보완 (2026-10-30)

- 신규 프로세스 복원 test-only subprocess env에서 Next의 ProcessEnv 필수 `NODE_ENV` 누락으로 Typecheck TS2769가 발생했다. 명시적인 `NODE_ENV=test`를 추가하고 최소 합성 환경변수만 전달했다. 후속 Typecheck PASS, ESLint PASS(기존 6 warnings); 전체 631 PASS 뒤 추가한 테스트의 별도 10 PASS와 구분한다.


## #164/#165 Git 게시 인증 경로 (2026-10-30)

- Root 일반 `git push`가 저장 인증 오류로 거부되었다. Token·credential URL은 출력하지 않았으며 `.env` 지정 remote와 연결 도구의 대상 저장소가 일치함을 확인했다. 연결된 GitHub Git-object API로 검증 tree를 게시하고 원격 tree SHA를 로컬과 대조하는 경로를 사용한다. 이 인증 오류는 코드/PR CI 실패가 아니며 PR CI는 결과 확인 전 NOT VERIFIED다.
