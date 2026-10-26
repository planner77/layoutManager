# PR/Main CI 실패 원장

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
- **GHCR 미게시 위험:** 새 Next Route/Server 코드는 일반 Main push에서 GHCR 게시로 분류됨. \`.github/workflows/docker-publish.yml\`에 정확한 Squash 제목 `#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]`와 S3-2 23개 파일만 허용하는 별도 예외 및 부정 제목/활성 운영 Migration·실 CAD/API·Compose 변경 fail-closed, Bash synthetic 회귀 추가. 새 HEAD PR CI·최신 Codex 리뷰 합격 전 병합하지 않으며 이번 요청 범위는 PR CI **시작까지만**.
- **추적 방법:** CI 실패 발생 시 Run ID·Attempt·Job·Step·HEAD·실제 로그 경로/원인/조치/재시도 정보를 다음 섹션에 누적 기록, 취소 Job 보존. **아직 원인 없는 실패를 만들어 기록하지 않는다.** #109/#96 운영 BLOCKED/실 데이터·GHCR 변경 없음.


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
