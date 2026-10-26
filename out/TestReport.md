# 실제 검증 결과 및 Viewer 평가

## Issue #106 / PR #120 — 최종 PR CI 성공·Main CI 인계 및 GHCR v0.41.1 후보 (2026-10-26)

- **확인된 PR 성공:** HEAD `d4afaf0ae3cee51a172dad9305533d941daa5706`, [PR CI 40253887969](https://github.com/planner77/layoutManager/actions/runs/40253887969) attempt 1, `completed/success`; Verify Job `121351469940`(Typecheck/Lint/Vitest/Build/E2E/Legacy), Docker Job `121351469592`(이미지/Migration/Runtime) 각각 성공. 실패 Artifacts 업로드 등 조건부 skip는 기능 시험 실패가 아님. 이 결과는 기존 G4 코드 HEAD에만 해당.
- **리뷰·병합:** 기존 P1 두 건 Site Unique와 Audit resolved Site 누락은 답변·Resolved, 미해결 0. `main` 대비 behind=0/mergeable=true 확인 후 [PR #120](https://github.com/planner77/layoutManager/pull/120) squash merge `0f59351ef160e3cc79681a78c34714db8d088ab9`. [Main CI 40254890094](https://github.com/planner77/layoutManager/actions/runs/40254890094) 해당 main HEAD에 대해 시작, 결과/패키지 게시 완료는 사용자 지시로 모니터링하지 않음.
- **GHCR 별도 게이트:** `v0.41.0` 및 App/Migrator Pair 이미 존재. 신규 0.41.1 version-only 후보를 후속 PR에 추가하면 앞의 성공 CI는 버전 변경 후 HEAD의 통과 근거가 아니므로 별도 PR CI Verify+Docker를 거쳐야 한다. 이번 릴리스 PR 시작 자체는 GHCR `0.41.1` 게시 성공 아님.
- **실운영 제외:** 기존 CAD 원본/Version/Current/삭제 비밀번호, 운영 Auth/Admin/API/Prisma/Compose/Nginx·실 DB/CAD/S3는 G7 Owner Go/No-Go 전 OFF. 실제 LAN/백업·복구 검증은 #108 G6의 후속 `NOT RUN` 유지.


## Issue #106 / PR #120 — 실패 Run 재현 원인 및 보완 검증 대기 (2026-10-26)

- **확인된 구 HEAD:** `53b75ca17190cd101689a3f10877adcb737ff37c`. [PR CI 40252656906](https://github.com/planner77/layoutManager/actions/runs/40252656906) completed/failure. Verify Job `121347711873`의 Typecheck PASS, Lint PASS(기존 경고 2), Unit/Integration 53 files/288 tests PASS + G4 1 file/9 tests FAIL. 이 9건은 공통 `seedCad` `product_id,name` Unique 위반, `beforeEach` 중단. Build/E2E/Legacy E2E는 SKIPPED. Docker Job `121347711740` completed/success.
- **수정:** 동일 Product 아래 `Site-a`/`Site-b` 이름을 구분하여 fixture 경계 문제 수정. 리뷰 P1 [r4373235027](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235027)에 따라 Server DB에서 확인한 Scope Site를 Authorization Success/Denied 및 ShadowOutline Create/Edit/Delete AuditEvent에 영속 기록하고, G1 fixture CHECK는 명시 Scoped action/target에만 nonnull Site를 허용한다. TC001 Site 명칭·권한 성공/거부 Site, TC005 Outline revision별 Site, TC009 비허용 Site 조합/FK 거부 회귀 추가.
- **재검증 게이트:** 새 코드/문서 HEAD에 대해 Typecheck/Lint/Vitest/Next Build/Playwright/CI Docker Job 전부 재검증 필요. 신규 CI **시작만 확인**할 예정이며 결과 모니터링 생략. 변경 후 테스트 실행 근거는 아직 없으므로 모두 `PENDING/NOT VERIFIED`. 로컬 npm/Docker 직접 실행 NOT RUN. 실제 운영 G6/G7·현장 PC/Backup/Restore/Prisma/Auth Route/GHCR 변경 없음.
- **증거 구분:** P1 Audit 누락은 코드 리뷰에서 발견된 독립 결함으로, 최초 Run에서 9개 테스트가 공통 fixture 준비 중 죽어 실제 Outline/Audit TC에 도달하지 못했다. 기존 실패·스킵 기록은 보존하며 신규 HEAD가 성공했다고 주장하지 않는다.


## Issue #106 G4 — 구현과 CI 검증 증거 구분 (2026-10-26)

- **작성 완료 범위:** src/domain/auth.ts, src/server/auth/{audit,g4-service}.ts, src/tests/fixtures/auth-g1/migration.sql, src/tests/fixtures/auth-g4/store.ts, src/tests/integration/auth-g4.test.ts 및 관련 설계. TC-P4-G4-001~009 코드 작성은 실행 PASS가 아님.
- **직접 실행:** 본 GitHub 연결 작업 환경에서 Node/npm/TypeScript/Vitest/Playwright/Docker 직접 실행 **NOT RUN**. 신규 PR CI는 최신 HEAD에서 시작 확인 후 모니터링 생략, 결과 확인 전 **PENDING/NOT VERIFIED**. 선행 #105 CI 성공을 새 G4 HEAD 성공으로 재사용 금지.
- **운영 경계:** 기존 공개 CAD GET/Viewer, 실제 Auth/Admin/API/Prisma/migration/Compose/Nginx/실 DB/CAD/S3/GHCR 변경 0; 실 LAN/백업·복구/DELETE 비밀번호 AND/Owner #109 운영 Go-Live = NOT RUN/BLOCKED. [Issue106](Issue106.md).


## Issue #105 / G3 — 독립 QA 결과 (2026-10-26)

- **역할·범위:** Manager `gpt-6-astra`가 요구사항/설계/AC와 구현 검토를 완료하고 QA 가능 상태로 인계, Developer `gpt-6-sol` 구현·동결, QA `gpt-6-luna`가 독립 소스 검토·실행·기록. Root가 조정 및 최종 commit/push를 담당. 이번 QA는 #105 격리 구현이며 운영 Auth/API/Prisma/DDL/Compose/Nginx/.env 활성화나 CI·배포를 수행하지 않음.
- **소스 검토:** 인증 서비스·Request/Response adapter·disposable G1 SQLite adapter·통합 시험을 검토. 런타임 App Route, 운영 Prisma schema/migrations, Compose/배포/Nginx 및 `server/db.ts` diff 없음. 기존 CAD API와 원본/Current/삭제 비밀번호 경로 변경 없음. 검토 중 수정 요구 blocker 발견 안 됨.
- **자동 검증 PASS:** `npm run typecheck` exit 0; `npm run lint` exit 0 (오류 0, 기존 warning 2개: `outline-tree-panel.tsx` treeitem `aria-selected`, `private-acceptance-paths.ts` unused `resolve`); `npm test` 53 files / 288 tests PASS; `npm run build` exit 0.
- **환경·root 추가 회귀:** Node 22.14.0/npm 11.10.0, 소스 후보 0.41.0. Root가 같은 Chromium 1243, `CAD_E2E_PORT=3115`와 임시 local DB/storage에서 `npx playwright test tests/e2e/upload.spec.ts tests/e2e/workflow.spec.ts tests/e2e/delete.spec.ts tests/e2e/viewer.spec.ts tests/e2e/switch.spec.ts tests/e2e/deployment.spec.ts tests/e2e/link.spec.ts`를 실행해 21/21 PASS(2.2분). 두 DXF Viewer·한글·링크와 20회 전환을 포함한다. 이 실행은 G3 최종 소스 동결 전 기존 앱 빌드의 회귀이며 아래 QA 4건은 최종 빌드에서 재확인했다.
- **독립 브라우저 회귀 PASS:** `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome CAD_E2E_PORT=3116 npx playwright test tests/e2e/workflow.spec.ts tests/e2e/delete.spec.ts tests/e2e/deployment.spec.ts` — 4 tests PASS (workflow 1, delete 2, deployment 1). 합성 임시 DB 기준 기존 CAD 등록/Current/삭제/Health 흐름 회귀.
- **G3 범위 근거:** 전체 Vitest 내 G3 통합 18개 시험을 포함하며 G2 bootstrap→G3 must-change, 초기·일반 암호 변경, 재검증/rollback, 3개 세션 동시성(별도 프로세스 포함), idle/absolute 만료, logout/disable/recovery 폐기, 최신 DB Actor/grant, Request/Response cookie·정상 Origin/CSRF·공유 limiter/reset 오류를 확인. G3 HTTP는 Node `Request`/`Response` 계약 adapter 시험이며 Browser 로그인 화면이나 실제 App Router 실행은 아님.
- **미수행/한계:** 독립 QA 범위에서 PR CI는 실행/확인하지 않음. Root의 최신 HEAD PR/CI 시작 근거는 PR에 별도 기록하며 결과 모니터링·병합은 이번 요청 범위 밖이다. 실제 Windows Nginx↔WSL2, 사내 PC 브라우저 Cookie, 운영 DB/CAD/S3·백업/복구, 실 LAN 및 G7 Owner Go/No-Go는 `NOT RUN`; G3 PASS는 합성·격리 기능 근거만이며 운영 활성화 승인이 아님.

## Issue #104 / G2 — 새 GHCR Pair 후보와 PR CI HEAD 증거 분리 (2026-10-26)

- G2 코드·격리 통합 기능은 이전 PR HEAD `f5f7ea2e00a95b24e65f16c67fc8484d03031dce`의 [PR CI 40234510320](https://github.com/planner77/layoutManager/actions/runs/40234510320), attempt 1에서 Verify (Job `121293089381`)와 Docker (Job `121293089179`) 모두 **completed/success**. 과거 TypeScript 실패 [40232479678](https://github.com/planner77/layoutManager/actions/runs/40232479678)는 실패 원장에 유지.
- 신규 GHCR `0.40.5` 게시를 위한 `src/package.json`/lock 루트 버전 변경 후의 **최신 HEAD PR CI는 별도 검증 필수**. 이전 HEAD 성공을 새 HEAD 성공으로 사용하지 않는다. Main CI 시작은 이미지 Pair 공개 태그 실제 게시 성공 증거가 아니다.
- 자동 검증은 합성 G1/G2 SQLite Unit/Integration·일반 E2E 범위만 충족, 사내 실제 작업자 Secret/비밀번호 처리·실 운영 DB/CAD/S3 Backup/Restore/LAN/Owner G7 Go-Live는 NOT RUN/BLOCKED. G2 기능은 승인된 별도 실행 경로의 비운영 격리 준비 상태만 유지.

## Issue #104 G2 — 구현·검증 인계 (2026-10-26)

- **작성:** `server/auth/admin-setup.ts` 명시 서비스, `tests/fixtures/auth-g2/store.ts` 일회용 DB adapter, `scripts/auth-g2-isolated.ts` 제한 CLI, `tests/integration/auth-g2.test.ts` 9 TC 및 설계·운영 SOP 문서. G1 `ADMIN_RECOVERY` 감사 actor=null/affected=Admin ID 변경으로 실제 운영 담당자(비공개 requestId 기록)와 사용자 로그인 Actor를 혼동하지 않도록 조치.
- **실행 상태:** 원격 소스·테스트/문서 작성 단계로 Node/tsc/ESLint/Vitest/Playwright/Docker/실 DB·CAD·S3 및 현장 PC 테스트 **NOT RUN**. PR CI는 시작·Run ID까지 별도 추적하되 사용자 요청으로 결과 모니터링 없음. 테스트 작성/CI 트리거 ≠ PASS; G2-AC1~4 체크 보류.
- **운영 차단:** App Auth/Admin Route, 운영 Prisma/DDL/Compose/Nginx/.env, 원본/Current/삭제 비밀번호 및 GHCR 활성화 0. #102 Owner R1 + POST 업로드 Editor/Admin+Site 승인 및 docs PR #114 main 병합; 실 Secret·감사 파기·백업 세칙은 후속, #105 G3/#106 G4/#108 G6/#109 G7 후속. [Issue104](Issue104.md)/[TestPlan](TestPlan.md).

### #104 / PR #118 최초 CI 실패 (2026-10-26 KST)

- **실제 확인:** [Run 40232479678](https://github.com/planner77/layoutManager/actions/runs/40232479678), attempt 1, PR HEAD `534de74cce4418afb66fc4dad445ea654187d190`, `completed/failure`. Verify [Job 121286959176](https://github.com/planner77/layoutManager/actions/runs/40232479678/job/121286959176) Typecheck 실패; Docker [Job 121286959564](https://github.com/planner77/layoutManager/actions/runs/40232479678/job/121286959564) `completed/success`.
- `tests/integration/auth-g2.test.ts:198:22` `TS1005 ';' expected`, `:232` `TS1128` 파생 오류, :213에도 동일한 잘못된 optional chaining 괄호가 있어 함께 정정했다. `npm ci`·Prisma generate는 성공, `npm run typecheck` exit 2, 이후 Lint·Unit/Integration·Build·E2E는 **SKIPPED(성공 아님)**. 실제 기능 회귀를 실행해 확인하지 않았다.
- **보완 소스:** [fix commit ae002997](https://github.com/planner77/layoutManager/commit/ae002997bcbc394cf40a9adb9c0475d74f73f22e). 조회 결과를 먼저 `replayHash`/`revokedAtBeforeRetry` 변수에 저장하고 안전하게 `expect`에 전달. G1/Schema/Auth 운영 활성화 없음. 최신 main #102 정책 PR #114 병합으로 병행 문서 drift 발생→G0 업무 변경을 보존하며 2-parent 정렬; 새 통합 HEAD의 Typecheck/전체 PR CI **PENDING**(기존 실패 CI를 성공으로 변경 금지).


## Issue #102 — Owner G0 6개 업무 정책 승인·문서 반영 추적 (2026-10-25)

- **결정 근거:** Owner가 승인한 ①사내 LAN **기존 공개 CAD 익명 GET/Viewer/다운로드**, ②Current **Editor 이상+담당 Site**, ③Version 삭제 **Editor 이상+담당 Site+기존 삭제 비밀번호 유지**, ④지정 사내 운영 담당자 Admin 초기화/복구 실행·Owner 운영 책임, ⑤Audit **365일 이후 만료 기록 정리**(Backup/파기 세칙 별도)를 [Issue102](Issue102.md)와 [ADR-051-R1](Decisions.md)에 반영.
- **Scope:** 익명 읽기 범위를 기존 공개 CAD 리소스로 한정. 신규 Outline/Memo/Type 영속/로그·Audit API 익명 허용 아님. `POST /api/cad-files` Editor 이상+담당 Site는 **Owner 승인 G0-BIZ-06**. 정책/기능/G7 Go-Live는 구별한다.
- **검증 계획:** [TestPlan](TestPlan.md) TC-P4-G0-BIZ-001~008. 현재 원격 **문서 변경**에는 Auth 코드·Router·Prisma/DDL·Nginx/Compose 설정/DB/원본 CAD 변경 없음. 본 정책 기록은 실 운영 로그인/Current/Delete 권한을 지금 작동시키지 않는다.
- **실행 결과:** 신규 코드·실 LAN·업무 E2E·Audit purge·Backup/Restore **NOT RUN**. 문서 PR 최신 HEAD CI·리뷰·diff 증거를 확인할 때 별도로 추가하고, 이전 [PR #112](https://github.com/planner77/layoutManager/pull/112)의 통과를 신규 변경 HEAD PASS로 재사용하지 않는다.
- **G0 상태:** Owner 5개 정책 승인(정책 계약), 등록 POST 권한 확정·Admin 실명/SOP·Audit/Backup 정리 세칙과 실제 Nginx 배치/Go-Live는 후속 #104/#106/#107/#108/#109에 미확정으로 이관. G0 문서 PR 검증 완료 전 완료/이슈 종료 선언 금지. 운영 OFF.


## Issue #107 — 최종 PR CI·Main CI·GHCR Pair 검증 (2026-10-26)

- 최종 PR #115 HEAD `44132fcaa31aff0c4643edfeb8db6949d801ca5b`, [Run 40224438075](https://github.com/planner77/layoutManager/actions/runs/40224438075) `completed/success`: Verify Job `121263027541`(Typecheck/Lint/Test/Build/E2E), Docker/Migration/Runtime Job `121263027604` 모두 success. [Viewer P2 4371142398](https://github.com/planner77/layoutManager/pull/115#discussion_r4371142398) 응답·해결, 미해결 0.
- [Squash PR #115](https://github.com/planner77/layoutManager/pull/115) main commit `142c4b9bc0bdb2ad0403fb1ee6640cf070d0bbbc`. [Main CI 40225537167](https://github.com/planner77/layoutManager/actions/runs/40225537167) `completed/success`: `release-scope` 및 `Build and push to GHCR` 성공, App/Migrator 후보 빌드·두 digest 검증 후 공개 버전 Pair 승격·OCI 계측 단계 각각 success, Git tag `v0.40.4` 확인. 기존 `v0.40.3` 불변.
- **실행하지 않은 항목:** 외부망 인바운드 제한 사내 실제 PC 2대와 Windows Nginx/WSL2, Preview 실제 운영과 동일한 환경의 Viewer/Upload/Download·Cookie, DB/CAD/S3 Backup·Migration·Restore는 `NOT RUN`, [Issue #108](https://github.com/planner77/layoutManager/issues/108) 인계. PR CI 자동 Mock/정적 검증 결과를 현장 실증 PASS로 확대하지 않는다.
- G5 격리 구현 종료는 #96/#109 업무 Auth/API/Prisma 활성화 승인이 아니며 실제 운영 설정은 그대로 둔다. 과거 같은 이슈의 `CI PENDING` 내용은 역사적 HEAD 기준 기록으로 보존한다.


## Issue #103 / PR #116 — #107 main 정렬·검증 인계 (2026-10-26)

- **이전 수정 HEAD 실증:** `40153240d593`의 [PR CI 40225147249](https://github.com/planner77/layoutManager/actions/runs/40225147249) **completed/success**; Verify Job `121264822767` 및 Docker Job `121264822603` 성공. 이 완료 결과는 main #107 합류 **전** HEAD에만 적용되며 병합 후 HEAD PASS 근거로 재사용하지 않는다. 최초 TypeScript/Docker 실패 [40202066291](https://github.com/planner77/layoutManager/actions/runs/40202066291)는 원장에 계속 보존.
- **원인·조치:** #107 G5 `main:142c4b9bc0bd` 선행 병합으로 `behind=1 / dirty`; 공통 문서 #103 G1과 #107 G5 추가 섹션을 모두 보존하고, #107의 G5 Preview 구현·PR workflow·package/lock 및 #103 G1 격리 DB·9 Integration TC를 함께 보존한 2-parent 통합 HEAD 생성. 이 충돌은 추가된 코드 CI 결함으로 오인하지 않는다.
- **정렬 후 검증:** 새로운 PR CI(`pull_request.synchronize`) 시작 전 검증 상태 `NOT RUN/PENDING`; 실제 CI 실행 뒤 별도 Run ID/최종 HEAD 확인이 있어야 PASS 가능. G7 운영 Auth/schema/API/GHCR 활성화 없음. 관련 [Issue103](Issue103.md) 및 [FailureLedger](FailureLedger.md).


## Issue #103 — 최초 실패 Run 40202066291 및 감사 P1 보완 (2026-10-26)

- `pull_request.opened`의 PR #116 HEAD `50014e68...` **실패**: Verify Job 121195140490은 TypeScript `store.ts:134 TS1002`와 연쇄 구문 오류로 중단, Docker Job 121195140285도 baseline Build의 동일 TypeScript 실패. Unit·Integration·E2E·Docker smoke/size 비교는 **SKIPPED/NOT RUN**. [Run 상세](https://github.com/planner77/layoutManager/actions/runs/40202066291).
- 리뷰 P1 [r4371167619](https://github.com/planner77/layoutManager/pull/116#discussion_r4371167619)은 인증 변경의 Audit에서 Site와 **대상 사용자**를 함께 영구 보존하도록 요청. SQL `AuditEvent.affected_user_id` 및 `AuditEvent.site_id` FK, Site action의 두 값 필수 CHECK와 fixture INSERT를 추가. `TC-P4-G1-005`에 서로 다른 사용자 동일 Site 이력, 삭제 후 추적, 누락 필드 거부를 검증하도록 보완.
- 비밀번호 변경·복구/Role·Special 함수 선언을 하나씩 재구성하여 구문 오류 원인을 제거하는 코드 변경을 준비. **수정 HEAD의 CI/런타임 PASS를 주장하지 않음**. 실제 실 운영 DB/S3 백업·복구 및 G7 운영 활성화는 계속 NOT RUN / BLOCKED.



## #103 G1 정책 보완 및 시험 비실행 유지 (2026-10-25)

최신 #102 Owner 5개 결정은 이 격리 SQL 모델의 Session/Grant/Nonce/Audit 무결성 범위와 충돌하지 않는다. 기존 공개 CAD 익명 GET 경로는 그대로 두며 Current/Delete Auth API 활성화는 G4/G7 후속이다. PR #114 최신 Main 병합 여부·G1 PR CI 통과는 아직 검증 전. TC-P4-G1-001~009는 구현만 완료한 **NOT RUN**이며 실 사내 DB/S3 Recovery도 NOT RUN.


## Issue #103 / G1 — 구현·검증 증거 상태 (2026-10-25)

- **구현 범위:** 테스트 전용 `src/tests/fixtures/auth-g1/{schema.prisma,migration.sql,store.ts}`와 `src/tests/integration/auth-g1.test.ts` (TC-P4-G1-001~009). 기준 #102 Owner R1 / #96 ADR-051. 7개 SQL 엔터티 User/Session/Grant(3종)/Audit/RecoveryNonce, SQLite lock/slot/nonce/Audit Trigger, 실제 CAD 6 Migration 기반 합성 Source/Current/SHA 및 실패/복구 실험 작성.
- **원격 코드 작성 시점:** GitHub 브랜치 소스 생성만 완료; 연결 환경에서 npm/SQLite native/Prisma/Playwright/Docker 명령을 **직접 실행하지 않음**. TC-P4-G1-001~009: **NOT RUN**. PR CI는 생성/시작 후 결과를 모니터링하지 않는 사용자 지시에 따라 **PENDING/미확인**, PASS 아님.
- **정적 설계 경계:** 변경 대상은 `src/tests/fixtures/auth-g1/**`, `src/tests/integration/auth-g1.test.ts`, AGENTS·out 문서. 기존 `src/prisma/schema.prisma`/`src/prisma/migrations/**`/App API/Viewer/Docker/Compose/.env/운영 DB/CAD/S3 변경·운영 활성화 **의도적 0**. 실제 Diff·PR HEAD/mergeability/리뷰 근거는 PR 생성 후 확인.
- **격리 합성 한계:** SQLite 백업 API·로컬 CAD+mock S3 객체 복원 테스트는 작성했으나 미실행. 실 S3/운영 데이터·네트워크·운영 Go-Live는 #107/#108/#109에서 별도 증거 필요. 감사 365일 후 파기는 G0 미결정이므로 구현하지 않음.


## Issue #107 / PR #115 — 원 HEAD CI PASS 이후 Viewer P2 수정 (2026-10-26)

- **검증된 과거 HEAD:** [PR CI 40201366001](https://github.com/planner77/layoutManager/actions/runs/40201366001), d771d553cdf7d00a467fead6f8f9d788898ea314, Verify Job 121193043560 및 Docker Job 121193043322 모두 completed/success.
- **P2 조치:** [review 4371142398](https://github.com/planner77/layoutManager/pull/115#discussion_r4371142398) 지적에 따라 위치 관리 HTML 200을 실제 Viewer PASS로 오인하지 않도록 --version-id에서 /cad/versions/ID/viewer 경로 자동 조회, 경로/ID 일치 거부 및 TC-P4-G5-003/004/007 테스트 변경. **변경 HEAD CI 결과 아직 미확인**, 과거 CI를 전용하지 않음.
- **릴리스:** v0.40.3 Main CI 40199597907 App/Migrator 게시 성공 단계 확인, v0.40.4 신규 tag/GHCR 게시 후보. Main CI와 GHCR 게시 실제 성공 증거는 별도.
- **현장 검증:** 사내 Nginx/WSL2, PC 2대, 실제 Viewer/Upload/Download/Session Cookie 및 Backup/Migration/Restore는 NOT RUN → #108 G6. 운영 적용 G7 승인 전 금지.


## Issue #107 / G5 — 격리 연결 Preview 개발 기록 (2026-10-25)

- **작성한 코드/설계:** PROD/DEV 독립 Preview Compose, Nginx 경유 정상 경로, read-only Node Smoke(Health/Home/CAD list/font/선택 Viewer·content), Vitest 4건, CI Docker profile config-only 검증, Issue107·운영/설계/AC 문서.
- **운영 미변경:** 원래 `src/docker-compose.yml`의 `host_ip: 0.0.0.0`은 유지. `.env.example`, Prisma, 기존 앱 Auth/API/Viewer, 운영 Nginx/DB, CAD bytes/SHA/Current/S3 변경 없음(최종 PR diff 확인 필요).
- **실행 상태:** 원격 GitHub 파일 작성 시점 Node/Vitest/Typecheck/Lint/E2E/Docker Compose/실 Preview 및 PR CI 전체 결과는 **NOT RUN/NOT VERIFIED**. CI 시작을 PASS로 기록하지 않는다.
- **G6 인계:** Windows/WSL2 실제 Nginx upstream·사내 PC 최소 2대, Viewer/Upload/Download·원본 SHA, G3 실제 Cookie, Backup/Migration/Restore는 **NOT RUN**. 공격·탈취 시험은 Owner 비범위. OWNER_ACCEPTED_SCOPE는 안전성 PASS가 아니다.
- 참고: [Issue107](Issue107.md), [Issue102](Issue102.md), [TestPlan](TestPlan.md), [FailureLedger](FailureLedger.md).


## Issue #102 — Owner 공격 대응 비범위 문서 정렬 (2026-10-25)

- G0 #102 및 ADR-051-R1에서 보안 공격/자격증명·세션 탈취 대비 강화·침투시험은 Owner에 의해 비범위로 결정되었다. `OWNER_ACCEPTED_SCOPE`는 **정책상 위험 수용**이며 안전성/침투시험 PASS가 아니다. HTTP 비암호화 위험은 여전히 존재한다.
- PROD 사용자 Nginx 경유 / DEV 개발 App 직접 접속 정책 및 G1~G7 기능·업무/DB 복구 운영 게이트는 유지. 본 문서 전용 변경은 운영 Auth/API/Prisma/Nginx/Docker/DB를 활성화하지 않는다.
- **실행 상태:** 이 문서 작업 자체로 LAN E2E, 기능 E2E, Backup/Migration/Restore, Typecheck, Docker 등 새 실행 결과가 생기지 않는다. 해당 시험은 `NOT RUN` 또는 후속 증거 대기로 명시하며 기존 이력의 PASS를 새 HEAD의 PASS로 전용하지 않는다.
- 근거: [Issue102](Issue102.md), [Issue96](Issue96.md), [ADR-051-R1](Decisions.md), [TestPlan](TestPlan.md). GitHub docs-only PR 생성/CI 시작은 PASS 및 운영 승인과 구별한다.


## Issue #99 / PR #110 — 성공 HEAD와 #102 통합 HEAD 테스트 분리 (2026-10-25)

- 원 P1 리뷰 보완 HEAD `6e00d3385a5c16362669d0672b828ddc1eaebf04`의 [PR CI 40197221768](https://github.com/planner77/layoutManager/actions/runs/40197221768)는 Verify Job `121180619434` 및 Docker Job `121180619279` 모두 **completed/success**. 이전 최초 HEAD `6377426`의 성공 [40195335561](https://github.com/planner77/layoutManager/actions/runs/40195335561)와 구별.
- 후속 [#102 Main a14df20f](https://github.com/planner77/layoutManager/commit/a14df20f1fa466b7ede61ab3b4dc36f93daa014f)는 **문서 전용** ADR-051-R1 Owner 내부망 보안 범위 보완; #99 브랜치와 공통 문서 충돌을 해소할 때 두 정책을 보존하고 새로운 통합 HEAD로 PR CI 재검증 필요. **통합 HEAD 검증 결과는 새 Run 별도 확인 전 NOT VERIFIED**.
- 현장 실 DXF 3종/GPU·CAD 좌표/오차·1k/10k/100k/Owner SLA·서명은 여전히 **NOT RUN**. 코드 CI 성공/후속 Main CI/GHCR 이미지 게시는 #113 현장 수용 PASS가 아니다. #113 OPEN/BLOCKED.


## Issue #99 현장 AC 추적 이전 — Issue #113 (2026-10-25)

- 사용자의 Issue #99 종료 요청과 별개로, 실제 DXF 3종/1k·10k·100k Browser·GPU/CDR reference/오차·SLA·Owner 서명 **미수행/미완**은 [#113](https://github.com/planner77/layoutManager/issues/113)으로 독립 이관한다.
- **#99 코드 검증 성공 ≠ #113 현장 수용 성공.** #99 종결 사유가 범위 이관(`not_planned`)일 경우라도 #113의 4개 수용 체크박스를 자동 완료/닫기 하지 않는다.


## Issue #99 / PR #110 — CI 성공과 P1 리뷰·수정 HEAD 분리 (2026-10-25)

- **검증된 원 HEAD** `637742610b3eb25461b095edb5899494ce6dd054` [PR CI 40195335561](https://github.com/planner77/layoutManager/actions/runs/40195335561): Verify(Typecheck/Lint/Unit/Build/E2E) Job 121174841714 **completed/success**, Docker Job 121174841754 **completed/success**. 공개 합성/제품 회귀의 증거로만 사용.
- **P1 리뷰 [#4370918614](https://github.com/planner77/layoutManager/pull/110#discussion_r4370918614):** 보고서 출력 부모의 Symlink가 repo 내부로 이어지면 `resolve` 경로 검사가 무효화될 위험을 지적. 원본 실 DXF/현장 실행은 없었으며 실제 민감정보 노출 증거 없음. `private-acceptance-paths.ts` canonical `realpathSync`·기존 부모 필수·`wx/0600`·신규 6 Unit + Private E2E 연동으로 보완.
- **신규 코드 HEAD 상태:** GitHub connector에서 소스/문서 변경, 로컬 Typecheck/Lint/Vitest/Build/Playwright/GPU **NOT RUN**. 새 PR CI는 새 실행의 Run/HEAD 확인 이후에만 PASS 기재, 이전 40195335561 성공을 재사용하지 않는다. 신규 GHCR용 `0.40.3` root package/lock 정렬은 미게시.
- **현장 AC #99-01~04:** 승인 실제 DXF 최소 3종/CAD 좌표·면적·GPU/Owner budget·실 UI/Worker/장비/서명 모두 **NOT RUN/BLOCKED**. 성공한 CI·문서 수정으로 운영 수용/Owner 승인 완료라고 판단 금지. [FailureLedger](FailureLedger.md), [Issue99](Issue99.md).


## Issue #99 — P0/P5 비공개 Evidence Gate 작성 상태 (2026-10-25)

| 구분 | 상태/증거 |
| --- | --- |
| Test harness | `src/tests/e2e/outline.acceptance.ts`에서 expected SHA·repo 외부 report path 필수, isolated DB의 개별 real DXF 5회 Browser (mapping/selected/box latency/rAF p95/heap/WebGL) 보고서 schema v2 작성 |
| Pure gate/CLI | `src/tests/benchmark/outline-acceptance-gate.ts` 및 `src/scripts/verify-outline-acceptance.ts`; SHA/세 규모/반복/Owner 허용치·CAD 기준·지원 매트릭스·GPU 외부 로그·8개 조작 확인값이 누락·초과하면 BLOCKED |
| Unit TC-P0P5-001~008 | 테스트 코드 작성. 이 원격 GitHub 변경 작업 시점에 `npm ci`, tsc, lint, Vitest, Playwright, Docker **NOT RUN**. PR CI 시작 ≠ 성공 |
| Real DXF 3종 WCS/면적/1:N:N:1/BLOCK/OCS/미지원 | **NOT RUN / 현장 비공개 승인 샘플 미제공** |
| 실제 1k/10k/100k CPU/GPU/heap/Latency | **NOT RUN**. Synthetic 기존 benchmark를 field PASS로 취급하지 않음 |
| Owner 정확도 허용치/응답 SLA 및 Signoff | **NOT DEFINED / NOT APPROVED**. 게이트는 숫자 자동 승인하지 않음 |
| 기존 원본 SHA/Version/Current·DB/API·Prisma/Viewer·GHCR | 이번 코드 변경 대상에서 제외, 실 운영 데이터 변경/현장 무변조 증거는 별도 검증 필요 |

- 비공개 `READY_FOR_OWNER_REVIEW`는 필수 수치/보고서가 형식상 충족됨을 뜻하며 진위/근거·출처·신뢰성 및 최종 Owner 수용을 검증하지 못한다. AC 4개 완료를 뜻하지 않는다. [Issue99](Issue99.md), TestPlan/ADR-052.
- GitHub PR CI의 실제 실행 Run/Job/HEAD와 성공·실패는 추후 실제 로그 확인에만 기입한다. 실패한 실행 및 reviewer 결함은 [FailureLedger](FailureLedger.md)에 독립 기록한다.


## Issue #96 — 비활성 P4-D1 구현 및 미실행 시험 기록 (2026-10-25)

- **승인 근거:** [Issue #96](https://github.com/planner77/layoutManager/issues/96) D1~D6 Owner 정책 / ADR-051. scope/계정 bootstrap 계획/비밀번호 scrypt/세션/CSRF·Rate/감사 헬퍼와 TC-P4-D1-003~012 Unit 코드 작성.
- **코드 작성과 실제 실행 구분:** 원격 GitHub 연결을 통해 저장소를 갱신함. 원격 저장소 checkout·node_modules/Docker/브라우저·사내 LAN 접근이 제공되지 않아 로컬 Typecheck/Lint/Vitest/Build/E2E/Legacy/Migration 복구 및 실제 보안 E2E **NOT RUN**. 별개로 PR #101 기존 HEAD d85ee35 [Run 40190126225](https://github.com/planner77/layoutManager/actions/runs/40190126225) Verify+Docker **completed/success**; #97 main 통합 변경 HEAD의 CI는 아직 미검증. PR CI 시작은 성공 증거 아님.
- **비활성 보장 범위:** src/app/api, Prisma schema/migration, Dockerfile/Compose, server/context, CAD 데이터·Current/Version/SHA/Viewer, 실제 env runtime 소비 미변경. .env.example 변수는 계약 예시로 실제 활성화 경로가 없음.
- **잔여 운영 BLOCKED:** 정확한 CIDR, 관리자 복구 Secret/원자 nonce, 세션 동시 발급 DB CAS·세션 회수, 계정 관리/로그인·감사 영속, HTTP 위험 실증, DB/CAD/S3 backup→migrate dry-run→restore와 Owner 별도 운영 승인. #98/#60/#65/#83 영속 API 연동 미수행.



## U-ISSUE97-PR100-PATCH-20261025 — v0.40.2 GHCR 발행 패치 사전 기록

- **기존 성공:** PR #100 [Run 40189428698](https://github.com/planner77/layoutManager/actions/runs/40189428698), HEAD `195f633b0bcefdc6f1964223f2fef0b1a379721c` completed/success, Verify Job 121157064278 + Docker Job 121157064494 모두 success. 이전 HEAD 전용 증거로 유지.
- **이전 GHCR 게시 확인:** #93 [Main Run 40184907533](https://github.com/planner77/layoutManager/actions/runs/40184907533), `Build application candidate`, `Build migration candidate`, `Promote paired release images`, `Measure published OCI layer bytes` 모두 success; tag `v0.40.1` 존재. 따라서 동일 `0.40.1` version 재사용 금지.
- **신규 수정:** 사용자 요청의 GHCR 신규 게시를 위한 root package/lock 버전 `0.40.2` 동기 및 릴리스 문서/CI/배포 안전 게이트. Source runtime/Schema/HTTP API/Auth 기능 변경 없음. **수정 HEAD의 PR CI, Main CI, GHCR publish 및 실 CAD/GPU는 아직 NOT RUN**. 최신 HEAD CI 성공 확인 전에 병합 금지.

## U-ISSUE97-20261025 — D2 서버 DXF/Transform 검증 코드 작성 (실행 전)

- 근거: [Issue97](Issue97.md), ADR-048/049/050, AGENTS, TestPlan TC-P4-D2-001~009. 기존 `server/outline/attestation.ts` canonical-only는 v1/v2 import 거부되지 않도록 보존, 신규 `server/outline/transform-attestation.ts`에서 불변 SHA/Handle/INSUNITS/baseGeometry + Translate/Rotate/pivot→effectiveGeometry를 독립 검증. `outline-compute.ts`와 서버 attestation의 큰 WCS 좌표 면적 상쇄 방지 보완.
- Unit 코드: `src/tests/unit/outline-transform-attestation.test.ts` TC 001~009. 편집 결과가 client geometry와 동일해야 하지만 서버 반환 Geometry는 재계산된 별도 객체. 위조·nonfinite·unsupported BLOCK/OCS/scale/shear/reflect/Z·64 step limit·큰 WCS를 적대적으로 검사.
- **실행 상태: NOT RUN.** GitHub connector로 원격 브랜치에 코드·테스트·문서 작성. 본 실행 환경에서 repository checkout/Node 의존 모듈 실행은 수행하지 않았으므로 Typecheck/Lint/Vitest/Build/E2E/Legacy/Docker/GHCR·실 DXF/GPU를 PASS라 주장하지 않는다. PR Open으로 발생하는 CI 시작은 성공/배포를 뜻하지 않는다. 신규 실측치 없음.
- **미구현/유보:** D1 #96 인증·Role/Site/Version Scope/Audit, D3 #98 Prisma·CRUD·CAS(409)·soft-delete·Memo reconcile·D3용 실제 immutable Storage accessor, nested child instancePath 지원, #56 E6 objects[] 연결, #99 실 DXF/GPU 성능 수용. Source/Current/Version/SHA/Viewer 운영 동작 및 인증 없는 API는 변경하지 않음.

## Issue #31 P4-D0 — 문서 설계 반영 기록 (2026-10-25)

- **범위:** Owner 확정 7개 정책 + 외부 인터넷 인바운드 제한 사내 LAN의 다중 PC HTTP/앱 로컬 계정 목적(권한·감사)을 Issue31/ADR-048·049/Database/Architecture/Requirements/TestPlan/AGENTS/Operation에 명시. 기존 OIDC 우선은 당시 기록으로 유지하고 본 결정이 우선한다.
- **영향 경계:** D0 Markdown-only. Runtime API/Prisma schema/Migration/세션 구현/로그 GET/Outline GET·CRUD/메모영속/Viewer/원본·GHCR 동작 변경 없음. Issue #31 OPEN. 관련 업무 이슈에는 P4 Owner 승인과 미결정 운영 게이트를 구별해 표시한다.
- **검증:** 원격 문서 편집으로 작성; 로컬 Node/Typecheck/Lint/E2E/실 DXF/GPU/DB Migration **NOT RUN**. PR CI 생성/완료 확인은 별도이며 실제 HTTP 인증·서버 저장·현장 수용 증거 아님. [TestPlan](TestPlan.md) TC-P4-D0 및 TC-P4-D1~D6.
- **미확정:** 초기 Admin/세션 TTL, 보존 기간, Site 접근 범위/HTTP 잔여 위험 수용, Version DELETE FK/복원/물리 파기, Memo Editor/Show-Hide tab lifetime. 실제 server auth/CRUD/DDL은 추가 Owner 결정·보안/감사/백업 검증 전 BLOCKED.


## U-ISSUE93-20261025 — Current 기본 + 이전 검색·토글 복원 (PR CI 결과 확인 전)

- 근거: Issue #93, 기존 #8/#16/#45, `AGENTS.md`·`out/Requirements.md`·`out/Architecture.md`·ADR-034-R1. 작업 시작 `main 14111b45a36907245342751d9d1a139b5215474d`, 브랜치 `fix/issue-93-drawing-history-search`; v0.40.1.
- 작성 변경: 홈 UI 전용 `drawingListParams`(`versions=all`, 기본 Current, 레거시 `current=false`), `drawingListUrl`(페이지 링크 상태 유지), 검색/토글 독립 GET forms, 기본 ON 단일 버튼 `aria-pressed`, 기존 위치·형식·파일명/설명·pageSize 유지. 공통 `listQuery`/API current=false·Repo·DB/원본·Current 포인터 불변.
- 변경/작성 테스트: `TC-LIST-093-001~003` Unit/Integration; `TC-LIST-093-E2E-001~002` Playwright; 기존 workflow/upload 기대값 정정. 목록 전체 버전 count/검색·포인터 교체/삭제 및 API 비Current 분리 검증.
- **실행 상태: NOT RUN.** GitHub Connector를 통한 코드·문서 변경이며, 이 세션의 실행 컨테이너에서 github.com DNS 해석이 실패하여 원격 checkout 및 npm 의존 설치·Vitest·Playwright·Docker 현장 검증을 수행하지 못했다. TS/ESLint/Build/Unit/E2E/Legacy 및 실 CAD/DWG 운영 데이터 결과를 성공으로 주장하지 않는다. PR CI 생성은 실제 Run 성공과 별개이며 사용자의 요청으로 결과 모니터링 생략.
- #54 main 병합 선행 변경(v0.40.0)과 본 #93 패치(v0.40.1)를 함께 반영하되 CI/실도면 검증은 여전히 미실행 상태다.
- CI 실패를 실제 확인한 경우만 `out/FailureLedger.md`에 Run/Job/HEAD/원인/조치 기재. 계획 및 수용 추적: [Issue93](Issue93.md)/[TestPlan](TestPlan.md).

## U-ISSUE54-PR92-CI-SUCCESS-MAIN-ALIGN-20261025

- [수정 HEAD PR CI 40181171710](https://github.com/planner77/layoutManager/actions/runs/40181171710), SHA `6845c4b4e1e22157b64ce05215e67710c9a3a985`, **completed/success**: P1의 5px 이전 Wheel/Resize 후보 취소와 TC-E4-E2E-004 포함. 최초 Run 40177837419는 수정 이전 별도 PASS.
- #76 [main 14111b45](https://github.com/planner77/layoutManager/commit/14111b45a36907245342751d9d1a139b5215474d)의 PR CI advisory 및 문서 변경을 #54 브랜치에 통합한다. 이 merge commit에서 앱 기능 코드 변경 없으나 새 PR CI 결과는 **NOT VERIFIED**. GHCR 게시·실 CAD/GPU 수용은 별도.

## U-ISSUE76-PREFLIGHT-20261025 — 관리자 설정 불일치 및 CI 진단의 로컬 사전 검증

- GitHub REST `GET https://api.github.com/repos/planner77/layoutManager` (2026-10-25) 응답에서 `allow_squash_merge=true`, `squash_merge_commit_title=COMMIT_OR_PR_TITLE`, `squash_merge_commit_message=COMMIT_MESSAGES`를 확인했다. **관리자 UI / PATCH 미실행, AC-76-01 미완료**.
- 작성한 read-only CI 셸 분기를 별도 임시 Bash 스크립트로 `bash -n` 검사했고, mock `curl` 응답 **정상 정책 / 현재 잘못된 정책 / 잘못된 JSON / 배열 JSON** 4가지에서 예상 `PASS / NOT APPLIED / NOT VERIFIED / NOT VERIFIED` 로그와 Summary, 0 exit을 관측했다. 이는 실제 GitHub REST/Runner에서 동일한 경로를 실행한 증거가 아니며, 네트워크 오류 분기의 실제 실행은 **NOT RUN**.
- 기존 `.github/workflows/pr-ci.yml`의 Trigger/permissions/concurrency/Docker Job/GHCR Main workflow는 그대로 두고 Verify에 사전 read-only advisory step만 추가하는 방식. 이로 인한 CI 성공 또는 실제 관리자 설정 적용, 실제 새 Main Push 단일행은 **NOT VERIFIED**. 자세한 대응은 [Issue76](Issue76.md)·[TestPlan](TestPlan.md).

## U-ISSUE54-PR92-CI-REVIEW-20261025 — 첫 성공 CI와 P1 보완의 증거 구분

- [PR CI 40177837419](https://github.com/planner77/layoutManager/actions/runs/40177837419), HEAD `2f57a642197f7d22d457ad65a70eda76b8ba7df4` completed/**success**, Verify [121122289273](https://github.com/planner77/layoutManager/actions/runs/40177837419/job/121122289273) 및 Docker [121122289396](https://github.com/planner77/layoutManager/actions/runs/40177837419/job/121122289396) 모두 completed/success. 실 DXF/네이티브 fullscreen/실 GPU 수용의 증거는 아니다.
- **별도 P1 리뷰 [4370223581](https://github.com/planner77/layoutManager/pull/92#discussion_r4370223581)**: Ghost threshold 도달 전 카메라가 wheel/Resize로 바뀌어도 stale `down.world`가 남아 의도치 않은 WCS 이동이 가능. 코드 수정: 진행 중 모든 pointer candidate/selection box/ghost에 동일한 cancel 경로 적용. Playwright `TC-E4-E2E-004` 신규.
- 수정 HEAD의 Typecheck/ESLint/Unit/Build/E2E/Legacy/Docker **새 CI 필요 / NOT VERIFIED**. 초기 PASS는 새 HEAD로 소급 불가. PR 리뷰 해결 및 최신 main 정렬 후 승인된 게이트에 따라 squash merge/Main CI 및 GHCR pair를 진행한다.


## U-ISSUE54-20261025 — E4 WCS 이동 기능/시험 작성 (PR CI 검증 전)

- 기능 기준선: `main 3ff1f94b3fbf11737a827536e223114ea4ca0e96` (#53 E3 포함). 브랜치 `feat/issue-54-generated-translate`, 버전 `0.40.0`, 상위 #49/선행 #51/#52/#53. DESIGN.md 없음→`out/Architecture.md` 설계. GitHub connector로 분석/코드 커밋; 현재 container는 `git ls-remote`부터 DNS `Could not resolve host: github.com`로 실패해 checkout 불가.
- 개발 변경: `generated-translate.ts`의 numeric/scope/bounds gate, `generated-hit-test.ts` 경계 선분 히트, `selection-controller.ts` 단일 포인터 gesture/ESC·Space·wheel·touch·cancel, `three-dxf-viewer/adapter.ts` WCS Ghost/원자 Document Translate + GPU cleanup, `viewer.tsx` WCS 폼/units/error. E2 기존 History 및 #43 Tree/JSON 투영 재사용. API/DB/Schema/DXF Source 미수정.
- 신규 Unit `generated-translate.test.ts`: **4 test cases 코드 작성 / NOT RUN**. 신규 Playwright `issue54-generated-translate.spec.ts`: **3 test cases 코드 작성 / NOT RUN**. 기타 Typecheck/Lint/npm ci/Build/전체 Unit/E2E/Docker/Legacy: **NOT RUN**. Native Fullscreen·Touch/HID·실 DXF·GPU 누수·성능 측정: **NOT RUN**. 추정·정적 코드 검토를 실행 PASS로 기재하지 않는다.
- 기대 잔여 검증: CI Verify(Typecheck→Lint→Unit→Build→E2E→Legacy) 및 Docker 각 Job 실제 성공/실패 로그 구별; 사용자의 지시상 **PR CI 시작까지만** 하고 CI 상태 모니터링·병합·GHCR 공개·Issue #54 종료 안 함. 향후 실패 발생 시 `out/FailureLedger.md`에 실제 run/job/head/원인/조치/재실행을 누적할 것.
- 결함/주의: 5px drag은 generated 전용 모드/기존 선택된 경계에서만, 경계가 아니라 채움 클릭은 기존 선택; 서버에 저장되지 않으므로 Renderer/reload 시 소멸. `data-generated-drag-preview`는 테스트 관측 마커로 실제 GPU 자원 수명까지 입증하지 않는다. [Issue54](Issue54.md), [TestPlan](TestPlan.md).

## U-ISSUE53-20261025 — E3 선택 GENERATED 삭제 코드·테스트 작성 (검증 전)

- Source baseline: `main e1adfe5b9de28ddd3821a0de2466d810e5c6c209`, feature branch `feat/issue-53-generated-delete`, v0.39.0. E2 Command/Undo/Redo, U6 Tree, E1 Selection 재사용. 사용자 요청에 따라 PR CI를 시작만 하고 **결과 모니터링하지 않음**.
- 변경: domain `generated-delete.ts` 현재 선택/Version/SHA 검증·확인 스냅샷, `generated-keyboard.ts` Canvas focus 조건, Tree/Toolbar/Canvas 선택 context·확인창 UI, Manager/ThreeAdapter 전달·모드 체크, U6 이력 없는 deletion API 제거, E2 Document Scene/selection event 재사용. 서버 API·DB/Migration·원본 DXF/SHA/Layer/Current 불변 설계.
- 신규/갱신 테스트: `generated-delete.test.ts` TC-E3-UNIT-001~004, `generated-keyboard.test.ts` UNIT-005, `issue53-generated-delete.spec.ts` E2E-001~003, #43 트리, Manager 회귀. 작성했다는 사실과 통과는 별개.
- **실행 결과: NOT RUN** — GitHub Connector로 변경을 커밋했으며, 이 세션의 runner 컨테이너는 `github.com` DNS 조회 실패로 checkout 불가. `npm ci/typecheck/lint/unit/build/Playwright/legacy/benchmark/Docker`를 수행하지 않았으므로 PASS 건수·성능/메모리 지표를 주장할 수 없다. 실제 GPU dispose 경로를 코드로 검토했으나 WebGL/GPU 메모리 누수 실측, 실 CAD, native fullscreen(OS/browser별), 운영 영향 분석은 NOT RUN.
- PR #87 P1 리뷰 대응: Window capture 순서상 Dialog/Context ESC가 먼저 Canvas 선택을 지울 수 있는 결함을 overlay gate로 차단하고, 이름 변경 stale 확인을 거부하도록 수정. TC-E3-UNIT-004, TC-E3-E2E-002/003의 회귀 검증을 추가했으나 **실행 결과 NOT RUN**.
- CI 시작/상태 및 리뷰·충돌 처리 근거는 생성된 PR 링크에서 확인해야 한다. PR 등록만으로 CI 성공, merge, GHCR 게시 또는 Issue 종료를 의미하지 않는다. [Issue53](Issue53.md) / [TestPlan](TestPlan.md).


## U-ISSUE67-PR80-CI-FAIL-20261025 — 2차 PR CI의 Python 구문 차단 및 조기 검사 보완

- [Run 40171968883](https://github.com/planner77/layoutManager/actions/runs/40171968883), HEAD `95cd745222055ce934e5ee3016d3551179b30a7f`: Docker Job [121104610668](https://github.com/planner77/layoutManager/actions/runs/40171968883/job/121104610668) `completed/failure`. 이미지 build·3-way size measurement 단계 완료 후 Python self-test import 시 `audit_standalone_layers.py:113` `SyntaxError: unterminated f-string literal`. 따라서 실제 layer audit/후속 migrator·Compose smoke는 **실행되지 않았음(SKIPPED)**; 기능 회귀라고 판단 불가. Verify Job 상태는 검사 시 in_progress/E2E였으며 성공으로 기입 금지.
- 교정: f-string 마감과 `validate_image_size`를 수정하고 Python audit/self-test/API smoke를 Docker build 전 `py_compile` 및 Synthetic regression으로 먼저 검사한다. transition positive saving과 이미 deduplicated baseline equal-size 두 분기의 Unit을 추가. 새 HEAD CI 전 PASS 아님. [FailureLedger](FailureLedger.md)/[TestPlan](TestPlan.md).


## U-ISSUE67-PR80-REVIEW-20261025 — 첫 CI 성공·후속 PR P1 리뷰 수정

- 최초 [Run 40170910369](https://github.com/planner77/layoutManager/actions/runs/40170910369), 검증 HEAD `6a35660d192a586158e4380ae8e9618c46032202`, **completed/success**. Verify [121101364113](https://github.com/planner77/layoutManager/actions/runs/40170910369/job/121101364113), Docker [121101364198](https://github.com/planner77/layoutManager/actions/runs/40170910369/job/121101364198) 모두 성공. Docker layer/hash/size/Compose는 최초 HEAD 통과 근거이며 이번 수정 이후에 소급 적용 금지.
- [P1 review 4369963432](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432): #67 merge 이후 unrelated PR에서 이미 최적화된 baseline을 잘못 FAIL시키는 조건 발견. 교정: baseline에 duplication이 존재하는 transition에서만 positive saving 강제; 이미 최적화된 baseline이면 size delta 정보, optimized SHA/native/no-dup 및 전체 Docker/Verify 검증은 유지. 추가 Python synthetic 정상/재중복 regression.
- 새 HEAD의 CI가 완료되기 전 PASS/비압축 절감 수치/GHCR OCI compressed bytes/현장 운영 승인 **NOT VERIFIED**. GHCR 공개 배포 및 Issue 종료는 후속 단계. [FailureLedger](FailureLedger.md), [Issue67](Issue67.md).


## U-ISSUE67-DEV-20261025 — Web SQLite 중복 이미지 계층 최소화, PR CI 이전 증거 경계

- **코드/브랜치:** `build/issue-67-web-standalone-layer-audit`, 웹 `runtime`에 SQLite native package 추가 COPY 제거 + 기존 Next forced tracing 및 `serverExternalPackages` 유지. 빌드에 native `.node` 파일 존재/SQLite memory require smoke fail-closed. 기존 별도 #66 migrator/DB Schema/API/Viewer/Compose/GHCR pairing 변경 없음. 앱 `src/package.json` 및 lock root version 0.38.1 동기.
- **새 검증 코드:** `src/scripts/audit_standalone_layers.py`는 Docker save 실제 layer TAR 경로·SHA256·최종 package 파일 identity/중복 raw bytes, inspect .Size, diffIDs와 비교; Python Unit synthetic corrupt/duplicate cases; `measure-images.sh`는 font/typeface/LibreDWG JS/WASM raw/gzip proxy와 server traced top20. PR CI Docker Job에 baseline/current 비교 및 disposable Docker Compose `/data` Master→DXF upload→idempotent migration/app restart→Current·original content read→delete 404 smoke. 기존 unit/browser/legacy/static health 재사용.
- **실행 상태:** GitHub 연결로 원격 파일 작성만 수행. 로컬 Docker/Node install/TypeScript/Vitest/Playwright/Buildx/실제 이미지 차이 측정 및 실제 API 실행 **NOT RUN**. 작성한 TC-IMG67-001`007 **NOT VERIFIED**, 새 HEAD PR CI의 verify/docker-runtime Job PASS 여부는 결과 확인 후만 기재한다. 동일 출처 이전 376,458,636 bytes 및 별도 COPY 12.5MB는 사전 가설이지 이번 절감 수치가 아니다.
- **별도 실제 수용:** GHCR version+immutable digest linux/amd64 compressed OCI layer 크기/공유 digest, 운영 DB/CAD/S3 동시점 백업/복구, 실 DXF·DWG·Hangul·실 브라우저/현장 프로토콜은 후속 공개 이미지/현장 실증 전 **미확인**. [Issue67](Issue67.md)/[TestPlan](TestPlan.md)/[Operation](Operation.md).


## U-ISSUE52-QA-20261025 — 수정 HEAD 독립 로컬 검증

- 역할: Manager `gpt-6-astra`가 사전 요구·설계·AC를 기록하고 Developer `gpt-5.6-sol`의 재현/수정을 검토한 뒤 독립 QA를 지시했다. 지정 QA `gpt-5.6-luna`는 사용 가능한 모델 목록에 없어 `gpt-6-luna`가 실제 검증을 대행했다. 검증 대상은 checkout HEAD `41cf16c`에 이 fixture 수정 working-tree patch를 적용한 상태; 앱 버전 `0.38.0`; 실행 환경 Node `v22.14.0`, 로컬 Chromium/Playwright. Root의 `npm ci` 관측은 13 vulnerabilities(3 moderate, 9 high, 1 critical); 이 test-only 수정 범위 밖이며 자동 audit fix는 실행하지 않았다.
- `npm run typecheck` **PASS**; `npm run lint` **PASS**(0 error, 기존 `outline-tree-panel.tsx:115` treeitem `aria-selected` warning 1); `npm test` **PASS 202/202 (42 files)**; `node --test scripts/measure-ghcr-pair.check.mjs` **PASS 3/3**; `npm run test:outline-benchmark` **PASS**, 합성 1k/10k/100k 측정 완료. 벤치마크 JSON stdout에는 machine/timing 데이터만 출력했고 artifact로 커밋하지 않았다.
- `npm run build` **PASS**; `npm run test:e2e` **PASS 65/65** (Chromium, 4.8 min), TC-E2-E2E-001/002 포함; `npm run test:master-migration` **PASS 1/1** (10.9s). 로컬 Docker는 test-only fixture 수정으로 **NOT RUN**이며, 선행 CI HEAD의 Docker Job SUCCESS는 이 HEAD의 Docker 재실행으로 취급하지 않는다. 실 CAD/GPU/현장 수용은 **NOT RUN**.
- 원인/수정: 테스트 helper `result()`가 공유 Polygon geometry 참조를 반환했고, deep-copy 검증이 `x=900`으로 변이해 후속 테스트 fixture를 오염시켰다. `src/tests/unit/generated-document.test.ts`에서 helper 호출별 `structuredClone(geometry)`를 반환하고, 변이 후 새 fixture가 `[0,0]`인지 확인하는 assertion을 추가했다. 닫힘 검증 및 제품 validator는 변경하지 않았다. Issue52의 당시 closure fixture 가설은 계획 시점 기록으로 보존하고 아래 [Issue52](Issue52.md)/[FailureLedger](FailureLedger.md)에 최종 원인과 구분한다.
- PR Run `40169744777`의 이전 6 Unit 실패와 최초 TS 실패는 각각 당시 단계 결과로 보존한다. 이번 로컬 PASS는 PR CI 성공, GHCR 게시, 병합, Issue 종료를 의미하지 않는다. [Issue52](Issue52.md), [TestPlan](TestPlan.md), [FailureLedger](FailureLedger.md).

## Issue #52 / PR #79 — 최초 TypeScript 실패·P2 3건 수정 (새 CI 전)

- [Run 40168296155](https://github.com/planner77/layoutManager/actions/runs/40168296155) HEAD `40aba11f`: npm ci/Prisma PASS, Typecheck **FAIL** (E2E `Event.key`/`ctrlKey` TS2339 ×2); Lint/Unit/Benchmark/Build/Chromium E2E/Legacy SKIPPED, 별도 Docker SUCCESS.
- 코드 보완: 타입 지정 input keydown, 먼 WCS 기준 Ring area, Undo 삭제 복구 capacity 예약/호환불가 history 무효화, stale selection staged commit 거부. 신규 Unit TC-E2-UNIT-006~008. 코드를 작성한 것과 실제 테스트 PASS를 구분한다.
- 현재 세션 로컬 TypeScript/ESLint/Vitest/Build/Playwright/실 CAD·GPU **NOT RUN**. 새 PR CI는 시작 여부와 성공 여부를 별도 보고하며 병합/GHCR/Issue 종료 없음. [FailureLedger](FailureLedger.md).


## U-ISSUE52-20261025 — E2 GeneratedDocument/Command/Undo·Redo 작업 브랜치 (검증 전)

- Branch `feat/issue-52-generated-command-history` / v0.38.0. E1 main 병합 기준 별도 작업, 루트 `DESIGN.md` 부재로 `out/Architecture.md`/ADR-044 사용.
- 구현 파일: `domain/generated-document.ts`, `domain/generated-keyboard.ts`, `viewers/core/adapter.ts`, `viewers/three-dxf-viewer/adapter.ts`, `features/cad-viewer/viewer.tsx`. 기준 geometry 불변 + WCS affine/원자 명령 + bounded history + Undo/Redo UI/키보드, Tree/Scene/Export projection. Source/DB/API/Worker 원본 변경 없음.
- 테스트 작성: `tests/unit/generated-document.test.ts` TC-E2-UNIT-001~003, `generated-keyboard.test.ts` TC-E2-UNIT-004, `generated-manager.test.ts` TC-E2-UNIT-005, `tests/e2e/issue52-generated-history.spec.ts` TC-E2-E2E-001~002. **CODED / NOT EXECUTED**: 이 세션에서 npm ci, TypeScript/ESLint, Vitest, Build, Playwright, GPU/실도면, Legacy migration은 실행하지 않았다. 작성·커밋은 PASS 증거가 아니다.
- #53~#55 실제 삭제/드래그·수치/회전 UI 및 #56 안전한 편집 JSON Import는 범위 밖. 현재 테스트와 Adapter 등록 API는 후속 구현의 계약 검증만 한다. 운영/Server P4 저장은 Owner 보안 정책 승인 전 BLOCKED.
- PR CI는 PR 생성으로 별도 시작하며 사용자가 모니터링 생략을 지시했다. **PR CI의 성공/실패/GHCR 게시/병합/이슈 종료는 여기서 미확인·미완료**. 별도 수행/관측한 사실이 없으면 PASS로 갱신하지 않는다. 상세 [Issue52](Issue52.md)/[TestPlan](TestPlan.md).


## U-ISSUE66-PR78-FAIL-20261025 — 첫 CI Unit 정적 계약 차단, Docker 실측 성공

- [Run 40167191799](https://github.com/planner77/layoutManager/actions/runs/40167191799), `pull_request.synchronize`, HEAD `45389a4661d424e7ad6aa6ee66bcd643bbc6ad76`, **completed/failure**. Verify Job `121090554088`: TypeScript/ESLint/npm/Prisma success, Unit **187 passed/1 failed** (`TC-IMAGE-003`, `standalone.test.ts`). OCI parser, DXF source benchmark, Build, Chromium/E2E, Legacy **SKIPPED**. 기존 `CMD ["node", "scripts/run.mjs", "deploy"]` 정적 기대와 신규 `CMD ["./node_modules/.bin/tsx", "scripts/deploy.ts"]`의 불일치.
- 독립 Docker Job `121090554257` **completed/success**, 이전 migrator **1,336,572,597 bytes** → 새 **578,862,325 bytes** (**56.69% 로컬 비압축 절감**), gzip tar proxy **462,720,650→212,574,989 bytes**. node_modules ~365MiB, native/Prisma/UID 검증, Compose 신규·재실행 마이그레이션+backfill 및 `/api/health` 200, invalid SQL P3018 및 read-only DB에 exit nonzero 성공. 이는 GitHub 레지스트리 OCI compressed layers나 현장 운영 데이터 보존 실측이 아님.
- 수정: 기존 TC-IMAGE-003에 분리된 Docker stage와 새 migration CMD·Compose 성공 종속·web runtime 불변을 검사하고, 신규 `TC-IMG66-010`에 Prisma 종료 대기 후 Backfill 실행 순서 정적 회귀를 추가한다. 도메인/DB/Docker runtime 실제 구현 변경 없음. **새 HEAD CI 전 아직 NOT VERIFIED**; Docker 이전 성공을 변경 HEAD 성공으로 전용 금지. [FailureLedger](FailureLedger.md), [Issue66](Issue66.md), [TestPlan](TestPlan.md).

## U-ISSUE66-DEV-20261025 — 전용 migrator 의존성 분리 / 검증 대기

- 기준/변경: 선행 PR CI run `40154979531`의 local migrator 약 1.34GB, full `node_modules` 약 1.1GB는 **과거 비압축 추정 기준선**. 이번 `0.37.1` 변경 후의 동일 소스 이미지 차이·절감률은 **아직 측정되지 않았다**. GHCR OCI compressed bytes/고정 digest도 게시 전이다.
- 구현: `migrator-dependencies` lock 기반 offline prune, 최소 TS source/Prisma/generated bundle 복사, UID 10001 Prisma CLI/tsx/native SQLite image sanity, Compose migrate 재사용. PR Docker baseline migrator 비교 및 invalid SQL fixture, OCI linux/amd64 manifest layer 합/중복 digest 수치, Node parser 테스트 추가.
- **현재 상태:** GitHub 코드/워크플로 작성 완료. 로컬 Docker/Node install/npx Prisma/TS source E2E/실제 이미지 sizes/health/실행/운영 데이터 보존 실측 **NOT RUN**; PR CI 별도 실행 후 결과를 확인해야 PASS로 기록 가능. 최근 다른 Issue CI 성공은 #66의 증거가 아님.
- 현장 보류: 기존 운영 DB/CAD/S3 동시점 백업·복구 시험, 실제 GHCR image tag 존재 및 manifest 검증, 실환경 CA/인증서·migration 차단 실증. [Issue66](Issue66.md), [TestPlan](TestPlan.md), [Operation](Operation.md).
## U-ISSUE51-PR77-FAIL-20261025 — 첫 CI Unit 차단과 P2 리뷰 보완

- [PR #77](https://github.com/planner77/layoutManager/pull/77) 최초 HEAD `c84a04e61cbaa413ee166ff896dcb7c10f1ec04b`, [Run #40164835838](https://github.com/planner77/layoutManager/actions/runs/40164835838) **completed/failure**. Verify [Job #121083652315](https://github.com/planner77/layoutManager/actions/runs/40164835838/job/121083652315) npm ci/Prisma/TypeScript/ESLint PASS, Unit/Integration **186 PASS / 1 FAIL** (`tests/unit/viewer.test.ts:75`, TC-U6-UNIT-003, 기존 `selectSavedOutline('local-1')` 호출 기대와 `('local-1',false)` 실제 호출 불일치). Benchmark/Production Build/Chromium E2E/Legacy Migration SKIPPED, Artifact 업로드 성공. Docker [Job #121083652401](https://github.com/planner77/layoutManager/actions/runs/40164835838/job/121083652401) SUCCESS.
- 신규 수정: 기본 Manager 단일 호출 1개 인수 호환 유지, additive true에서만 2개 인수 전달. [P2 #4369760096](https://github.com/planner77/layoutManager/pull/77#discussion_r4369760096)은 **Unit 실패와 별개의** 작은 WCS 교차 누락 지적: orientation 곱 고정 epsilon→orientation 부호 검사+scale-aware endpoint rounding. 수정 이후 TC-U6-UNIT-003 재검증 **NOT VERIFIED**, TC-E1-UNIT-003/004 신규 코드는 **CODED/NOT RUN**.
- 첫 HEAD의 기존 186건/TS/Lint/Docker PASS를 새 코드 통과 증거로 전용하지 않는다. 이 수정은 GitHub 원격 파일 작업으로 수행되어 로컬 npm/TypeScript/Vitest/Playwright/실 CAD·GPU **NOT RUN**. 재검증은 새 PR CI, 실제 운영 수용은 현장 별도. [FailureLedger](FailureLedger.md), [Issue51](Issue51.md) 참조.


## U-ISSUE51-20261025 — E1 통합 선택 브랜치 구현 및 CI 전 증거 경계

- 브랜치 `feat/issue-51-unified-canvas-selection`, v0.37.0. 수정: identity/permission + generated GeoJSON hit + SelectionController source/generated 모드 + UUID Adapter/Manager API + Viewer UI/Tree + Unit/E2E, 설계/테스트 추적 문서.
- **로컬 Typecheck/ESLint/Vitest/Playwright/Next build/실 CAD·GPU: NOT RUN.** GitHub Connector 원격 파일 조작만 수행하며 검증용 실행환경은 이 세션에서 제공되지 않았다. 테스트 코드를 PR CI에 포함했지만 결과 통과로 기록하지 않는다.
- **TC-E1-UNIT-001/002, TC-E1-E2E-001~003: CODED / NOT EXECUTED.** 기존 #31/#40/#42/#43/#17/#25/Legacy/Docker 회귀도 재실행 전 NOT VERIFIED.
- **정적 설계 확인:** 원본 render coverage/index를 재사용하는 경로, SavedOutline local-N JSON 불변, 생성 UUID/Scope 및 삭제/숨김에서 선택 invalidation, Tree/Canvas 공통 이벤트 계약을 코드로 반영. 타입/키보드/실 기하/성능 수용은 CI/현장 실증 대상.
- CI 시작 여부와 정확한 PR/Run 링크는 PR 생성·GitHub Actions 트리거 확인 후 갱신한다. 원격 리뷰/충돌 여부도 PR 생성 이후 검증하며 모니터링은 하지 않는다. [Issue51](Issue51.md).


## U-ISSUE43-PR72-REVIEW-20261025 — 최초 성공 / P2 리뷰 보완과 재검증 경계

- [PR #72](https://github.com/planner77/layoutManager/pull/72), 최초 검증 HEAD `5cd223cc2837fc5772154fd67138680263f159e4`, [PR CI 40161078593](https://github.com/planner77/layoutManager/actions/runs/40161078593) **completed/success**: TypeScript/ESLint/Unit·Integration/Benchmark/Build/Chromium E2E/Legacy Migration 검증 Job `121072582232`와 Docker Runtime `121072582347` 모두 success.
- [P2 #4369618943](https://github.com/planner77/layoutManager/pull/72#discussion_r4369618943)은 원래 테스트에 없었던 offscreen 키보드 포커스 가시성 문제. 최소 Tree 내 스크롤 보정 및 320px `Home/End` 포커스+outer scroll 불변 E2E 보강. 해당 변경을 반영한 후속 HEAD는 **PR CI 성공 전 NOT VERIFIED**. 실 CAD/GPU/Native fullscreen 및 보안·영속 운영 시험은 별도.
- 실제 관리자 타입/재접속 영속 트리 AC-U6-01/06 잔여는 [#73](https://github.com/planner77/layoutManager/issues/73), 기반 #31 P4/#65/#71에서 추적. 이 CI 성공을 실 DB/RBAC 기능 성공으로 해석하지 않는다.


## U-ISSUE43-DEV-20261025 — U6 외곽선 트리 구현 검증 경계

- 구현 코드: v0.36.0 우측 Tree Panel, 상단 토글, Reader legacy 분류 및 향후 검증 카탈로그 타입 투영, Overlay 별도 Group별 show/hide, WCS Bounds/하이라이트, Session 삭제/Version·Renderer·Reload 정리.
- 테스트 추가: TC-U6-UNIT-001~003, TC-U6-E2E-001~002. 기존 U1~U5/Renderer/Legacy migration/Production Build 결과는 이 코드 변경 이후 아직 검증하지 않았다.
- **로컬 npm ci, tsc, ESLint, Vitest, Playwright, Next build, 실제 DXF/GPU, native fullscreen: NOT RUN.** 브라우저와 Node 의존성을 갖춘 CI 성공 전 PASS 표시 금지.
- 실제 관리자 타입 2개/typed-only 서버 카탈로그·인증·영속 GET/reload 복원은 BLOCKED #65/#31 P4. Test fixture로 대체 불가. 상세 [Issue43](Issue43.md).


## U-ISSUE42-PR70-FAIL-20261025 — E2E 회귀 원인 및 수정 검증 경계

- [PR CI 40157734271](https://github.com/planner77/layoutManager/actions/runs/40157734271) (HEAD `526a1be`, completed/failure): Job `121062609278` npm ci/Prisma/Typecheck/ESLint/Unit·Integration/DXF Benchmark/Production Build PASS, Chromium E2E **57 PASS/1 FAIL** (`issue31-outlines.spec.ts:53` TC-OUT-E2E-001: 두 번째 선택 결과 0 vs 1), Legacy Migration SKIPPED. Docker Job `121062609436` SUCCESS.
- [Artifact 12585362916](https://github.com/planner77/layoutManager/actions/runs/40157734271/artifacts/12585362916) Trace 재검토: 버튼 클릭 후 비전체화면 페이지 스크롤로 캔버스 `y=-63`, 두 번째 마우스 `(38,-58)`에서 `pointerdown`이 뷰포트 밖으로 나감. 이전 첫 선택·DXF Geometry·PRECISE preview는 통과. **테스트의 스크롤 전제 결함**으로 확인.
- [fix `a5d9f843`](https://github.com/planner77/layoutManager/commit/a5d9f8430e06fe3b223dc97157c917ac6e793394): 두 Canvas 선택에 모두 `scrollIntoViewIfNeeded` + 100% viewport 확인 후 실제 drag. Assert 그대로 유지. 수정 HEAD의 수동/로컬 CI **NOT RUN**, 신규 PR CI synchronize 시작·결과 미확정. [FailureLedger](FailureLedger.md) / [Issue42](Issue42.md).


## U-ISSUE42-DEV-20261025 — v0.35.0 U5 계약·잠금 UI / PR CI 전 증거

- Issue #42에 대해 `outline-assignment.ts`, v1/v2 Draft parser/export, ViewerManager/Three adapter metadata, 타입 지정 UI gate 및 신규 Unit/E2E 코드를 작성. 기존 U3 untyped 로컬 버튼은 유지, 비영속 타입 ID는 서버 영속 저장·권한 증거가 아님.
- #65 실제 서버 active scoped catalog 및 #31 P4 IdP/RBAC/Server geometry/DB Write가 없어 **U5 운영 타입 지정은 의도적으로 비활성**. #41 lab 시안 타입은 Viewer에 주입하지 않음. U6 Tree는 #43 별도.
- **로컬 실행: NOT RUN** — 외부 GitHub 원격 코드 수정 도구 환경에서 의존성 설치·Node 테스트·실 CAD 렌더/GPU/IdP/DB E2E를 실행할 수 없었다. Unit/Typecheck/Lint/Build/Chromium/Legacy migration 성공은 주장하지 않는다.
- **PR CI: 추후 PR 생성 시 자동 시작 예정** (`.github/workflows/pr-ci.yml` `pull_request.opened`); 결과·GHCR 게시/릴리스는 미확정. PR CI 실패 시 [FailureLedger](FailureLedger.md)에 Run ID, Job, Error, 조치, rerun 근거 기록 필요.
- 추적: TC-U5-UNIT-001~003, TC-U5-E2E-GATE-001; 상세 [Issue42](Issue42.md), [TestPlan](TestPlan.md).


## Issue #41 / PR #64 — 최종 CI PASS 및 릴리스 시작 상태 (2026-10-25)

- [CI #40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531) (HEAD `e2f0a64d45f601420a2bc38b99531c748269f61a`) 최종 **completed/success**. [verify job 121054317463](https://github.com/planner77/layoutManager/actions/runs/40154979531/job/121054317463)의 TypeScript/ESLint/Vitest Unit+Integration/Outline synthetic Benchmark/Next build/Chromium Playwright E2E/Legacy migration E2E 전 단계 **success**. [Docker Runtime job 121054317216](https://github.com/planner77/layoutManager/actions/runs/40154979531/job/121054317216) **success**. 실패 결과 artifact 단계는 SKIPPED(문제 없음).
- 이전 [CI #40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566)의 55/56 E2E(1 FAIL)와 Legacy SKIPPED, Docker PASS는 삭제하지 않고 [FailureLedger](FailureLedger.md)에 보존. P2 리뷰 HTTP UUID 보완 및 E2E locator scope 교정 후 성공한 것을 확인했다. 실제 다른 브라우저/사내 URL 수동 검증, 실제 DXF·GPU, Owner IdP/RBAC/Scope/Audit 및 DB 영속 동시성 테스트는 **NOT RUN / BLOCKED**.
- 최종 PR 미해결 리뷰 스레드 0, main behind 0, mergeable true → [PR #64 squash merged](https://github.com/planner77/layoutManager/pull/64) at [7da613d1](https://github.com/planner77/layoutManager/commit/7da613d1ed9e2893849a3c3a7f0931d4f32ff850). 이슈 #41 범위 분할 종료, 미구현 영속 AC는 [#65](https://github.com/planner77/layoutManager/issues/65)에 이관.
- Main/GHCR workflow [40155833554](https://github.com/planner77/layoutManager/actions/runs/40155833554)는 **실행 시작만 확인**; 이 보고서에서 게시 성공·tag/digest/운영 배포/최종 Main CI 결과를 PASS라고 기록하지 않는다. 사용자 요청에 따라 모니터링 생략.


## Issue #41 / PR #64 PR CI 첫 실패·수정 HEAD 검증 경계 (2026-10-25)

- [Run 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566) HEAD `d548df2`: Typecheck, lint, unit/integration(35 test files), synthetic benchmark, production build, Chromium install, Docker runtime **PASS**. E2E **55 PASS / 1 FAIL**: `TC-U4-E2E-PREVIEW-001` `getByRole('alert')` strict mode가 실제 중복 메시지와 Next.js route-announcer 두 요소를 선택. Legacy migration E2E **SKIPPED**. 단 하나의 E2E 실패가 PR Run 전체를 failure로 종료한 것이며, 해당 HEAD를 'PASS'로 분류하지 않음. [verify job](https://github.com/planner77/layoutManager/actions/runs/40153913566/job/121051041258) / [E2E artifact](https://github.com/planner77/layoutManager/actions/runs/40153913566/artifacts/12583742658).
- 별도 [P2 review](https://github.com/planner77/layoutManager/pull/64#discussion_r4369348797): 사내 HTTP에서 `crypto.randomUUID` 부재로 생성 예외 위험. [fix `b389b66e`](https://github.com/planner77/layoutManager/commit/b389b66e11a34ad6fa737fc5ff760277d192797a)로 시안 범위 alert 및 getRandomValues 기반 v4 UUID fallback, UNIT-005/006, E2E-HTTP-003 추가. CSPRNG 부재 시 fail-closed. 상단 실관리 메뉴 disabled, API/DB/RBAC BLOCKED 유지.
- **수정 후 테스트:** 이 문서 시점에는 로컬 패키지 기반 typecheck/lint/Vitest/Next Build/Chromium/Legacy/Docker 실제 실행 **NOT RUN**. 새 CI 시작만 요청받았으며 결과 모니터링 전 **NOT VERIFIED**; 원래 HEAD의 PASS를 새 HEAD에 전가하지 않음. [FailureLedger](FailureLedger.md)·[Issue41](Issue41.md).


## Issue #41 / U4 v0.34.0 — 안전 시안 검증 상태 (2026-10-25)

- 범위: 관리자 업무 타입 도메인·UI 시안만, 실 RBAC/API/DB 없음. `src/tests/unit/outline-type.test.ts` TC-U4-UNIT-001~004 및 `src/tests/e2e/issue41-outline-type-preview.spec.ts` TC-U4-E2E-PREVIEW-001, TC-U4-E2E-GATE-002를 작성하였다.
- **현재 실행 증거:** 로컬 npm ci/TypeScript/ESLint/Vitest/Next Build/Chromium/Legacy DB migration/Docker runtime **NOT RUN**; PR CI 결과는 이 시점에 확인하지 않았으며 PASS/FAIL 판정하지 않는다. 별도 QA 에이전트 검증을 수행했다고 주장하지 않는다.
- **수용:** AC-U4-01/02 및 scope별 DB 보장·실 typeId FK는 BLOCKED; AC-U4-03/04 규칙 일부는 코드/시험 명세 수준, AC-U4-05는 실 Route 부재와 메뉴 disabled를 코드로 보존. 테스트 작성만으로 AC 완료가 아니다.
- 보안 Owner 승인 후 auth/scope/audit/DB migration/동시성/복구 및 운영 Viewer 시험을 다시 수행해야 한다. [Issue41](Issue41.md) / [TestPlan](TestPlan.md).


## U-ISSUE40-PR48-E2E-REPAIR-20261025 — 2차 PR CI E2E 실패 원인/Fixture 수정 (다음 검증 전)

- [PR #48 Run #40150085136](https://github.com/planner77/layoutManager/actions/runs/40150085136) HEAD `76018b6b`: CI verify Job `121039597527`. npm ci·Prisma·TypeScript·ESLint·Unit/Integration·1k/10k/100k CPU benchmark·Production Build·Chromium 설치 **PASS**; Playwright Chromium **52 PASS / 2 FAIL (54 총건)**. Legacy migration E2E **SKIPPED**. Docker runtime job `121039597376` **PASS**. `react-hooks/refs` 이전 CI 차단은 이번 HEAD에 존재하지 않음.
- **실패 1:** `TC-OUT-E2E-001` `issue31-outlines.spec.ts:107` reload 후 `outline-selection-count` locator 없음. 정상 U3 기본 OFF 상태의 UI에 맞지 않는 테스트 기대. Error context의 메뉴는 OFF, 렌더 표시 완료. 정상 로딩→OFF/패널 부재 확인→ON→선택 0으로 교정.
- **실패 2:** `TC-U3-E2E-003` `issue40-outline-tool.spec.ts:152` `dxf-viewer` load error. [Playwright 실패 Trace/Artifact 12582184252](https://github.com/planner77/layoutManager/actions/runs/40150085136/artifacts/12582184252) console의 `Error: n must be greater than 0 vertices`/parseEntity가 원인 단서. Test DXF의 LWPOLYLINE에 4개 vertex 좌표만 있고 그룹코드 `90` (꼭짓점 수)이 누락된 형식 오류로 판정. 공식 DXF Reference를 근거로 `'90','4'` 추가; 단순 Renderer 변경 테스트 삭제·skip 없이 계속 실행.
- **교정:** [commit `fd1f4613`](https://github.com/planner77/layoutManager/commit/fd1f4613c1cc69b2f383c7cc4129a8d95d70ec39), 두 Test 파일만 변경. 소스/DB/migration/API/Viewer Adapter/Worker 변경 없음.
- **검증 제한:** 새 HEAD는 로컬 Test·Chromium E2E **NOT RUN**, 새 CI 성공 **NOT VERIFIED**. Autodesk group-90 형식 근거는 E2E 성공을 대체하지 않음. 실제 고객 도면·native Fullscreen/GPU는 별도 현장 수용 필요. [실패 원장](FailureLedger.md) 참조.

## U-ISSUE40-PR48-REPAIR-20261025 — ESLint 실패·Space 포커스 회귀 수정(재검증 전)

- [PR #48](https://github.com/planner77/layoutManager/pull/48) 최초 [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671) (HEAD `850ded81`): npm ci·Prisma generate·TypeScript **PASS**; **ESLint FAIL**, `viewer.tsx:404:186 react-hooks/refs`(error), `363:6 react-hooks/exhaustive-deps`(warning). Unit/Integration, 1k/10k/100k, Production Build, Browser E2E, Legacy migration E2E **SKIPPED**; Docker-runtime 독립 Job **PASS**. [원장](FailureLedger.md) 참고.
- 별도 P2 코드 리뷰 [#4369181241](https://github.com/planner77/layoutManager/pull/48#discussion_r4369181241): 선택 모드 window capture가 Space keyboard click을 차단해 메뉴 ON에서 OFF 불가. 첫 CI의 미실행 E2E 결과로 오인하지 않음.
- [소스 교정 `0ba21a66`](https://github.com/planner77/layoutManager/commit/0ba21a66e02c5a842e527ececdb678f447940a8f): `stopOutlineEditing/resetOutline/choose` 안정화, useEffect 의존성 명시, 2개 Renderer 버튼 명시적 JSX, SelectionController Space interactive focus guard. `TC-U3-E2E-001`에 Space 버튼 양방향 전환, `TC-U3-E2E-002`에 비대화형 Space Pan+drag를 추가.
- **재검증 경계:** 위 **첫 Run**의 성공 단계는 수정 HEAD의 성공 근거가 아니다. 로컬 lint/test/Playwright·브라우저 native·실 DXF 실행은 **NOT RUN**, 새 synchronize PR CI 완료/성공 여부는 사용자의 모니터링 생략 지시에 따라 **미확인**.


## U-ISSUE40-DEV-20261025 — v0.33.0 U3 코드·시험 작성 (PR CI 검증 전)

- 대상: [#40](https://github.com/planner77/layoutManager/issues/40) / Epic #37 / 기준 main `296d570ea62e26a3fc40c57685268921df15199a`, 브랜치 `feat/issue-40-outline-tool-toggle`.
- 개발 내용: 상단 ON/OFF + 접근성·지원조건 사유, 기존 #31 Selection/Worker에 안전하게 연결, OFF시 Worker/Preview/선택 취소·Pan 복귀, 확정 saved Overlay 및 OFF 읽기 전용 JSON Export 유지. Renderer/reload/Version 변경은 기존 reset. 새 DB/API/원본 변경 없음.
- 새 Test 소스: `TC-U3-UNIT-001~003`(reducer/지원 정책/stale Worker 오류), `TC-U3-E2E-001~003`(ON/OFF·실 Worker JSON export·반복·레이어·ESC·Renderer·reload·빈 도면), 기존 `issue31-outlines.spec.ts` / `outline.acceptance.ts` U3 메뉴 호출 적응 및 `issue38-app-shell.spec.ts` fail-closed 기대 변경. 기대된 소스/테스트 연결은 [Issue40](Issue40.md) 및 [TestPlan](TestPlan.md).
- **검증 상태:** 이 환경에서 소스 전체 의존성/npm 빌드 및 Browser/Chromium 실행 증거는 확보하지 못함. `npm ci`/typecheck/lint/Vitest/build/Playwright/Legacy migration/Docker/native 실기기/실도면 전부 **NOT RUN**; CI는 PR 작성 이후 시작되더라도 실행 결과/성공을 모니터링하지 않음.
- 미완: 합성 실험은 실설비 도면 3종·원본 CAD 기준 좌표·GPU/Worker 장기 메모리·실 native 브라우저 ESC를 대체하지 못한다. #31 P4 IdP/RBAC 승인 대기·#41~#43 후속 항목은 여전히 범위 밖.


## U-ISSUE39-DEV-20261025 — v0.32.0 레이어 도크 U2 구현 (PR CI 결과 확인 전)

- Issue: [#39](https://github.com/planner77/layoutManager/issues/39), Epic #37, #38/#17 재사용. 기준 main `0e11f957`, 기능 브랜치 `feat/issue-39-layer-panel-toggle`; 최초 코드 커밋 `a0f9f29f` (문서 후속 커밋 별도).
- 코드: `ViewerAppShell`은 사용 가능한 레이어 도크 host를 유지하고 닫힌 상태에는 내부 panel만 숨김. `ViewerMenuBar`는 aria-controls/expanded/pressed와 focus용 button ref 전달. `CadViewer`는 패널 접기 후 메뉴 focus 복귀; 기존 layer checkbox·Manager/Source/Canvas/Renderer loading effect 변경 없음. `FullscreenLayerPanel`에 controls 대상 명시.
- TC 작성: `TC-U2-UNIT-001`(reducer 경계 추가), `TC-U2-E2E-001`(패널/visibility/키보드/focus/Canvas/GET/모바일/일반), `TC-U2-E2E-002`(simulated native·reload·Renderer), `TC-U2-E2E-003`(0 drawable layers), 기존 #17/#38/#25/검색·외곽선 회귀 재사용.
- **실행 결과:** 로컬 npm install/typecheck/lint/Unit/Build/Playwright/native 수동/실도면: **NOT RUN**. 작성된 테스트나 소스만으로 PASS 아님. PR CI가 시작돼도 실행 완료·성공으로 단정하지 않는다. CI run/job/검증 결과 확보 시 별도 기록.
- 미완료 수용: 실제 브라우저 허가 native fullscreen/접근성 도구 실측·현장 DXF/GPU는 별도 수동 검증 대상. #40~#43, 외곽선 DB/관리 API 및 #31 P4 인증 승인 사항은 변경하지 않음. [Issue39](Issue39.md), [TestPlan](TestPlan.md).

## Issue #45 / v0.31.0 — Current-only CAD 목록 (2026-10-25)

- **구현 상태:** `currentOnlyListParams` 홈 Current 강제, 토글 제거, 기준정보→층 상세 링크 추가, #8/#16 관련 E2E 기대 변경 및 TC-LIST-045-001~003 신규 시험 코드 작성.
- **최초 PR CI 검증 결과:** [Run 40142618328](https://github.com/planner77/layoutManager/actions/runs/40142618328) (HEAD `1a35b089`): npm ci·Prisma Client 생성·TypeScript **PASS**, ESLint **FAIL** (`src/app/masters/page.tsx:8:67,8:73`, `react/no-unescaped-entities` 두 건). 해당 Job의 Vitest·Build·Chromium E2E·Legacy migration E2E는 **SKIPPED**. Docker-runtime 독립 Job은 **SUCCESS**. 로컬 실행은 **NOT RUN**.
- **분석/보완:** [P2 review #4368927952](https://github.com/planner77/layoutManager/pull/46#discussion_r4368927952)가 `upload.spec.ts`의 비Current 홈 선택 회귀를 지적했으나 최초 Run의 E2E는 미실행이므로 **예상 실패**로 분류. [fix `69e6b175`](https://github.com/planner77/layoutManager/commit/69e6b17548f35c248c700c5526e9993fc3eaf7c7)에서 JSX escape, Current 행→Location 전체 이력→이전 Version Current 지정으로 갱신. 5단계 위치 관리/Current 삭제 및 전체 regression, 수정 HEAD의 새 PR CI 결과는 **미검증**. 자세한 실패·예방 기록: [FailureLedger](FailureLedger.md).
- **추적:** [Issue45](Issue45.md) AC1~9 → TC-LIST-045-001~003 및 기존 TC-LIST/DELETE/MASTER/LINK/NAMES/`TC-ISSUE-001/LIST`. 수정 HEAD의 성공 판정은 새로운 PR CI 결과로만 할 수 있다.


## U-ISSUE38-PR44-REVIEW-20261024 — PR CI 성공 이후 P1 ESC 리뷰 보완 (새 CI 필요)

- 기존 PR #44 / head `a2b8bbdf5c` / [PR CI #40077595050](https://github.com/planner77/layoutManager/actions/runs/40077595050): **completed / success**, 2026-10-24 08:25:48 UTC 완료. 이 성공은 리뷰 수정 **이전** 커밋에만 유효하다.
- [P1 inline review](https://github.com/planner77/layoutManager/pull/44#discussion_r4366517148): `SelectionController.keyDown`은 window capture에서 Esc 선택 취소 후 `preventDefault()`를 수행하나, `CadTextSearch` 루트의 React `onKeyDown`이 `defaultPrevented` 무시하고 검색을 닫아 한 번에 두 계층이 종료되는 문제.
- 수정: 검색 패널 루트 및 검색 input에서 이미 소비된 `Escape` 이벤트는 닫힘 로직을 수행하지 않도록 조건식 보강. 검색 토글에 포커스 둔 채 선택 1개+검색 열림 상태에서 첫 Esc는 선택만 비우고 검색/immersive 유지, 두 번째 Esc는 검색만 닫고 세 번째 Esc는 CSS immersive를 종료하도록 `TC-OUT-E2E-001` 연장.
- 새 HEAD에 대한 실제 Unit/Browser/Build/CI 결과는 별도 워크플로 기록 전 **NOT RUN**으로 취급. Native 브라우저/현장 CAD/GPU 실증도 이번 조치의 검증 범위 밖.


## U-ISSUE38-DEV-20261024 — v0.30.0 앱형 Shell 구현, 실행 결과 미확정

- 대상: [Issue #38](https://github.com/planner77/layoutManager/issues/38), 작업 브랜치 `feat/issue-38-viewer-app-shell`, base main `d22b4575`.
- 구현: `viewer-app-shell.tsx`, `viewer-menu-bar.tsx`, `viewer-app-state.ts`; `viewer.tsx`의 기존 toolbar/#17 레이어/#26 검색/#31 도구를 동일 shell에 배치하고 controlled layer dock/중앙 resize/검색 ESC 우선순위 적용. Native/CSS fullscreen 경계 및 서버 영구저장 제한 유지.
- 작성한 자동시험: `tests/unit/viewer-app-state.test.ts` (`TC-U1-UNIT-001`), `tests/e2e/issue38-app-shell.spec.ts` (`TC-U1-E2E-001/002`), #31 Escape 회귀 계약 수정.
- **실행 근거:** 로컬 `npm ci`/TypeScript/ESLint/Unit/Integration/Production build/Playwright/native/실도면 **NOT RUN**. 소스와 시험 추가는 PASS를 의미하지 않는다. PR CI run/검증 결과는 실행 확인 후 이 행과 분리해 갱신.
- **잔여/제외:** 외곽선 생성 토글·업무 타입/Admin CRUD·타입 트리/영속 저장은 후속 #40~#43과 P4 보안 승인 범위. DWG 손상 파일 E2E는 정상 DWG 실도면 증거가 아니다. 상위 #37/Issue38 AC는 CI 완료 전 수용 판정하지 않는다.



## PR #36 두 번째 CI 실패 대응 — Chromium E2E 계약 복구 (2026-10-17)

- 대상: [PR CI 38974687861](https://github.com/planner77/layoutManager/actions/runs/38974687861) / Head `7fcddb0`. `npm ci`, Prisma, TypeScript, ESLint, Unit/Integration, synthetic benchmark, Production build, Chromium 설치 **PASS**. 별도 Docker image size·migration·runtime smoke **PASS**. 전체 Chromium E2E **40 PASS / 4 FAIL**, 후속 Legacy Migration E2E는 **SKIPPED**.
- `TC-NAME-002/003`: 파일명이 toolbar 원본 표시와 접이식 정보에 이중으로 나타나 `getByText` strict locator 충돌. Viewer toolbar에만 원본 이름을 남기고 접이식 등록정보에서는 반복을 제거, 테스트는 `viewer-toolbar` 및 exact text로 범위 한정.
- `TC-DESC-005`: 이전 `aria-label="도면 설명"` DOM 계약이 정보 패널 이동 시 사라짐. shell 상단에 접근 가능한 `aria-label="도면 설명"` 내용(원본 줄바꿈 유지, 고정 최대 높이 스크롤)을 재제공하고 E2E에서 reload 전/후 존재뿐 아니라 visibility를 확인.
- `TC-FONT-002` (DXF 두 Renderer): #25 기본 immersive 시작에서 버튼의 accessible name은 `전체 화면 확대`인데 구 검사는 `확대`를 기대. **기본 fullscreen 진입을 확인한 뒤 명시적으로 일반 Viewer에 복귀하여** 기존 normal zoom/fit contract를 그대로 검사하도록 테스트 수정; 기능/버튼을 임의 변경하지 않음.
- 보완 후 새 PR CI는 **미검증**, 결과를 PASS로 기록하지 않는다. 기존 #10/#17/#26/#31 UI/Adapter/데이터/API 및 작업 버전 `0.29.0` 유지.


## U-ISSUE25-PR36-REPAIR-20261017 — ESLint 오류·P2 Native Spinner (새 CI 전)

- 최초 PR #36 / run `38963238965`: dependency install, Prisma client, TypeScript 검사 **PASS**. ESLint `viewer.tsx:314:56,67 react/no-unescaped-entities`의 작은따옴표 때문에 **FAIL**. Unit/Integration·benchmark·Production build·Chromium E2E·Legacy Migration E2E **SKIPPED**, 별도 Docker 이미지/Migration/Runtime smoke **PASS**.
- 수정: JSX 문자열의 두 작은따옴표를 escape; Native Fullscreen top layer 바깥 Provider spinner가 보이지 않는 리뷰 P2를 위해 `GlobalLoadingOverlay`를 native 상태의 Viewer shell 내부에도 렌더. `GlobalLoadingProvider`와 동일 loading state로 노출·정리하며 CSS immersive에서 중복 렌더 없음.
- 추가 E2E `TC-ISSUE25-002`: native `fullscreenchange` 모의, 지연된 원본 GET·로딩 중 local overlay와 disabled 상태, 완료 후 해제 검증. 실제 native Chrome/Edge 렌더링과 사용성은 별도.
- 수정 후 ESLint/Unit/Production/Playwright **최신 실행 결과 확인 전 NOT RUN**. 초기 TypeScript/별도 Docker 성공을 신규 HEAD의 CI PASS로 소급하지 않음.


## U-ISSUE25-DEV-20261017 — 신규 CSS immersive Viewer 구현/시험 코드 (실행 결과 미확정)

- 대상: #25 / v0.29.0 / `feat/issue-25-auto-immersive-viewer`.
- 구현: Viewer 페이지의 metadata를 Client shell로 이동; 목록/상세·direct URL/Reload에서 CSS fixed `100dvh` 기본; native fullscreen은 별도 명시 클릭만; native ESC와 CSS ESC 분리. 새 툴바에 Renderer, zoom/fit, 파일명/Version/원본·링크·다운로드·상태/에러·다시 불러오기·종료/목록 복귀 배치. normal LayerDropdown/immersive LayerPanel, 검색/외곽선은 같은 Canvas shell 공유. app header inert/scroll lock/focus cleanup.
- Test 소스: `tests/e2e/issue25-immersive.spec.ts`(두 DXF renderer, 목록·직접링크·새 Context/리로드·모바일/Resize/Canvas backing·Fullscreen API 거절·ESC·목록 복귀), 기존 `viewer`, `issue17`, `text-search`, `issue31-outlines`, `layer-dropdown`, `metrics`, `workflow`, `link`, `dwg-viewer.probe`, `metrics.benchmark` 기본진입 변경에 대한 정상 모드 명시 진입/회귀 업데이트.
- **기록 한계: 이 환경에서 npm 의존성 설치·typecheck/lint/Unit/Production build/Playwright/실 Chrome·Edge·DWG를 직접 실행하지 못함. 모두 NOT RUN/PR CI 대기.** E2E가 작성되었다고 PASS·독립 QA 검토·현장 CAD 수용으로 기록하지 않음.
- 소스와 요구·추적 근거: [Issue25](Issue25.md). CI run 번호와 실제 결과는 PR CI 실행 결과 확인 시 후속 기록.



## U-ISSUE31-PR35-P1P2-REVIEW-20261016 — PR 리뷰 3건 처리 (수정 HEAD CI 재검증 전)

- Initial PR #35 Source HEAD `eb01756b`에서 Codex 리뷰 3건: P1 INSERT attached ATTRIB/SEQEND 누락, P2 Client tolerance가 Source canonical 재계산을 완화할 위험, P2 Browser acceptance가 선택 0개에도 PASS 가능.
- 처리: `buildIndex`에서 INSERT group 66과 연속 ATTRIB를 소속으로 처리·루트 INSERT 안전 제외, group 66 누락 Fixture까지 Unit 추가. `attestation.ts`의 재계산 오차를 서버 상수 `0.02`로 고정·일치하지 않는 JSON 오류(409), tolerance 1000 위변조 Unit 추가. private Browser 수용 5회 모두 선택 수 >= `CAD_OUTLINE_ACCEPTANCE_MIN_SELECTED`(기본 1) 강제.
- 리뷰 3건은 모두 회신 및 해결 처리했고, **이 수정 후의 최신 HEAD PR CI는 재검증이 필요**. 최초 CI 중 일부 성공은 최신 Source PASS를 의미하지 않는다.


## U-ISSUE31-P0-P5-ACCEPTANCE-20261016 — 코드/시험 추가, 실DXF·IdP 미확보 (CI 대기)

- 기준: #34 PR CI 수정본 `38906697401` 성공 및 Main CI `38907443840` GHCR v0.28.2 게시 성공. 단, 이전 P0/P4/P5 운영 수용은 미완료였음.
- v0.28.3 신규 작업: (1) BLOCK 내부 미지원 자식의 안정 참조 부정, (2) 샘플링 상한으로 chord tolerance가 깨지는 대형 곡선 거부, (3) `server/outline/attestation.ts` immutable 원본 SHA→canonical Source 재계산→client Polygon XOR 비교 준비, (4) 관련 Unit, (5) private real-DXF Playwright 5회 브라우저 성능·매핑 측정 suite, (6) PR CI synthetic 1k/10k/100k 측정.
- 검증 상태: 신규 PR CI/실 도면 평가는 문서 작성 시 **미실행**; Source 개인 파일·수치·IdP를 제공받지 않았으므로 **P0 실도면, P5 현장 체감/GPU, P4 실제 서버 영구 저장 전부 미완료**. DB Migration/API, 권한, 운영 원본은 변경하지 않음.
- 새 CI 성공 여부·100k synthetic 수치는 해당 Run 로그 확인 후 별도 기록. 사내/private 도면의 수치는 외부 PR artifact에 기록하지 않는다.


## U-ISSUE31-PR34-P2-REVIEW-20261016 — Webpack parenthesized import warning 차단 보완

- PR #34 초기 Run [38904729194](https://github.com/planner77/layoutManager/actions/runs/38904729194): TypeScript/ESLint, Unit/Integration, Next Production Build, Browser E2E, Legacy Migration E2E, Docker smoke **모두 SUCCESS** (HEAD `9c2d821f`). 그러나 Codex P2 review 1건이 `export 'union' (imported as 'union') was not found` 경고의 미검출을 발견.
- 보완: `scripts/build-diagnostics.mjs`의 정규식이 `(imported as '...')` 유무 모두 탐지하도록 수정. 기존 plain export 경고, 다른 alias, ANSI 경고 Unit 회귀를 유지/확장. Build의 fail-closed·PR CI/릴리스 보호 원칙은 변경하지 않음.
- 리뷰 응답/해결 후 **수정 HEAD의 새 PR CI SUCCESS가 필수**. 최초 Run 성공을 새 커밋의 성공으로 간주하거나 Main/GHCR 완료로 기록하지 않는다. 실제 DXF·P4 영속 저장 수용도 미완료.


## U-ISSUE31-ESM-20261016 — v0.28.1 경고 사실 확인 / v0.28.2 보완 코드 (PR CI 전)

- 이전 [Main CI #38894507390](https://github.com/planner77/layoutManager/actions/runs/38894507390) Docker Build 로그에서 `Attempted import error: 'union' is not exported from 'polygon-clipping'` 확인. Next Build warning 상태였지만 workflow 및 GHCR `v0.28.1` 게시까지 성공했다. 이 결과를 정밀 외곽선 Worker 정상 작동의 증거로 취급하지 않는다.
- upstream v0.15.7: ESM `export { index as default }`; CJS `module.exports=index`; d.ts에서는 named `union`을 기술. `outline-compute.ts`를 ESM default 기반 `polygonClipping.union`으로 수정.
- 보완 시험 코드: 직접 default export 및 Union 면적 Unit, warning diagnostic Unit, Next Build stdout/stderr 검사·exit 1 guard, Production E2E 실제 PRECISE Worker JSON 다운로드에서 면적·SHA·닫힌 Ring 확인, CI quick 1k synthetic benchmark.
- P0/P5: 파일 업로드 없이 사내 현장 UTF-8 ASCII DXF의 구조·안정 Handle·parse·spatial CPU 및 메모리만 기록하는 read-only `audit:outline` 명령 제공. 실DXF 파일·Browser/GPU 수치 및 P4 권한 정책은 아직 확보되지 않았다.
- **본 v0.28.2 변경에 대한 PR CI·Unit·Browser 및 현장 실측 결과는 문서 작성 시 미확인**. 성공 판정 이전에 GHCR 게시·운영 배포·Issue 완료를 주장하지 않는다.


## U-ISSUE31-PR33-REVIEW-P2-20261016 — Render layer guard 보완 (재CI 대기)

- PR #33 Codex 리뷰 P2: 원본 Handle이 같아도 Render Object의 `layer`가 누락되거나 1:N 조각 중 일부 Type/Layer가 불일치하면 기존 `(!o.layer || o.layer===sourceLayer)` 조건이 잘못 수용할 수 있음.
- 조치: 모든 조각에 Type/Layer/World Bounds가 명시·일치해야만 1:N aggregate bbox를 승인. 불확실 조각은 선택 미승인(fail closed). `TC-OUT-MAP-005` Unit로 누락 layer/혼합 type 회귀 추가.
- 해당 변경의 신규 CI 실행 결과는 미확정. 리뷰 회신·스레드 해결을 완료하였으나 실제 도면 매핑은 계속 미검증.



## U-ISSUE31-P0-P5-P4-PREP-20261016 — 잔여 범위 개발 / CI 전

- 이전 0.27.0 PR #32: PR CI run `38874300056` Typecheck/Lint/Test/Build/Browser/Docker **SUCCESS**, Main CI run `38875068317` **SUCCESS**. 이로써 P1~P3 합성 기준은 검증했으나 P0 실도면·P4 영속화·P5 성능 수용은 미완료.
- 후속 0.28.1 작업 브랜치: Render Handle/Type/Layer/WCS bbox reconciliation(1:N 합산, 미렌더/mismatch 선택 제한), SpatialIndex, UI 인덱스·매핑 timing, synthetic 1k/10k/100k benchmark 명령, P4 브라우저 JSON 버전·Source SHA·EntityRef 안전 validator, Unit 및 기존 DXF E2E 확장.
- **본 변경에 대한 신규 CI·로컬 전체 빌드/브라우저·실제 DXF/GPU·성능 실측은 아직 확인하지 않았다.** JS-only 로컬 smoke 및 작성된 테스트는 정식 CI PASS를 대신하지 않는다. 개인정보·운영 DXF·DB/원본 파일은 업로드/수정하지 않았다. P4 인증·인가 Owner 승인 전 Database schema/Write API 미개발. [Issue31](Issue31.md).



## U-ISSUE26-PR30-CI55-FAIL-20261016 — E2E 초기 목록 페이지네이션 가정 수정 (재CI 대기)

- PR #30 / CI #55 Run 38878433970 / source d4fda35d733cbe5bcbdac4aa5c79992503276453. GitHub Actions PASS: TypeScript, ESLint, Unit/Integration 136/136, production build, Docker image/migration/runtime smoke. Playwright E2E 40/41 PASS; Legacy migration E2E는 E2E 실패로 skipped. 신규 DXF 텍스트 검색 두 E2E는 이번 run에서 모두 통과.
- 실패: 기존 TC-E2E-001 (src/tests/e2e/workflow.spec.ts:56)에서 첫 번째 DXF 등록 후 목록 첫 페이지에 originalFilename release-v1.dxf 행이 없다고 판정. Upload API는 201, 등록 완료 V1 표시는 통과하였다.
- Playwright artifact error-context에서 등록 도면 총 44개, default list pageSize 25, 등록일 최신순 전체 버전을 확인. 해당 테스트의 registeredAt은 2026-09-08이며 상당수 앞선 테스트가 2026-10-16자로 새 도면을 등록해 첫 페이지에 표시되지 않는다. 파일명/Current가 잘못 저장됐다는 증거는 없고 UI 목록 pagination 조건을 고려하지 않은 테스트의 비결정적인 기대가 원인.
- 해결: 각 등록 후 목록으로 돌아와 UI의 '파일명' 검색 필드에 해당 release-vN.dxf를 입력하여 검색 실행, 응답 ID에서 파생한 version-ID 행이 실제 파일명과 '● Current'를 포함하는지 확인한다. 전체 목록 첫 페이지 노출은 수용 조건에서 제외한다. 기존 Current 교체/필터/E2E 후반 단계와 API 검증을 보존한다.
- 애플리케이션/API/DB 구현 변경 없이 테스트 재현성만 강화. 후속 PR CI, 브라우저 및 Legacy migration 전체 PASS는 새 결과 확인 전 미확정.
- Evidence: https://github.com/planner77/layoutManager/actions/runs/38878433970


## U-ISSUE26-PR30-CI54-FAIL-20261016 — Renderer 전환 후 캐시 검색의 로딩 상태 무한 표시

- PR #30 / CI #54 Run 38874916901 / head 8462b772654ee810546edfb229f0cdd50c393291: TypeScript, ESLint, Unit/Integration 126/126, Production build, Docker smoke 모두 PASS; Playwright 38 passed/2 failed; Legacy migration E2E skipped.
- 실제 Playwright error-context는 두 렌더러 모두 전환 후 TEXT 3개 목록과 각 버튼이 화면에 존재하지만 aria-live 문구가 계속 "검색용 텍스트를 분석 중입니다…"인 상태를 보여준다. TC-TEXT-E2E-001은 "검색 결과 3개"를 기다리다 타임아웃.
- 근본 원인: CadTextSearch useEffect의 getTextIndex() 완료 후 setIndex()가 의존성을 바꾸면서 Effect cleanup을 실행하고, .finally의 active=false 검사 때문에 setWorking(false)가 수행되지 않음. 특히 재전환 후 ViewerSource의 캐시된 index가 즉시 반환될 때 재현.
- 조치: 성공/실패 .then/.catch 내부에서 active 여부를 확인하고 setIndex/setError와 함께 setWorking(false)를 동일 Effect 수명에서 처리. 사후 .finally 콜백에 의존하지 않는다. E2E의 renderer 전환 후 검색 결과 수 검증을 regression으로 유지.
- 최신 main(0.27.0, Issue #31 outline 기능)과 통합하면서 원본 ViewerSource 공유, DXF world 좌표 focus, outline selection/Worker를 모두 보존. 충돌 해결 후 Release candidate 0.28.0. 새 CI와 독립 QA 결과는 미확정.
- 실패 기록: https://github.com/planner77/layoutManager/actions/runs/38874916901



## U-ISSUE26-PR30-CI52-FAIL-20261016 — test fixture comment swallowed MTEXT source

- PR #30 / CI #52 Run 38872015982, source head aa0f1d6595d2dfbab8af74975a26646df067ea6b.
- Actual GitHub CI: TypeScript and ESLint PASS; Unit+Integration 125/125 PASS; production Build PASS; Docker image/migration/runtime smoke PASS. Browser Playwright E2E 38/40 PASS and both TC-TEXT-E2E-001 variants FAIL; Legacy migration E2E skipped after Browser failure.
- Both renderer variants completed TEXT search (3 positions), then failed on the same assertion: "검사 구역 45" yielded no visible "검색 결과 1개". Source inspection found a literal backslash-n inside a single-line // comment on src/tests/e2e/text-search.spec.ts line 11. Because JavaScript single-line comments end only at a REAL newline, the appended entities += MTEXT statement was commented out; uploaded drawing contained TEXT entities but no MTEXT at all.
- Corrective change: remove the fragile inline DXF generator from the E2E spec and move it to src/tests/fixtures/text-search-dxf.ts. Generate group-code pairs as an array joined by real newline, preserve MTEXT group 41/71/72 and valid hexadecimal TEXT handles. New TC-TEXT-FIXTURE-001 validates actual shared fixture parsing before the browser test: 3 TEXT entities and 1 MTEXT with visible text "검사 구역 45". Both renderer E2Es import the SAME generator, so test/fixture drift is prevented.
- No production viewer, database, migration, packages or behavior were changed. New CI and independent QA still require verification; success is not inferred from code edits.
- Evidence: https://github.com/planner77/layoutManager/actions/runs/38872015982 and the PR #30 source diff.



## U-ISSUE26-PR30-CI49-FAIL-20261016 — Browser E2E 합성 DXF의 MTEXT attachment 누락

- PR #30 / CI #49 Run 38868174246, head 91932bd9a9ddfeeb4370de137d267090ca714d2b. 실제 통과: Typecheck/ESLint, Unit+Integration 125/125, Production Build, Docker image/migration/runtime smoke. Browser E2E 38 passed / **2 failed**; Legacy migration E2E는 선행 실패로 미실행.
- 다운로드한 Playwright trace.zip: 신규 TC-TEXT-E2E-001의 dxf-viewer 경로와 three-dxf-viewer→dxf-viewer 전환 경로에서 동일한 "Unhandled alignment" 발생. 스택: RenderMText→_DecomposeMText. three-dxf-viewer 최초 표시 및 TEXT/MTEXT 검색·줌은 해당 trace에서 정상 진행되었다.
- 원인: 합성 DXF MTEXT에 attachment point group 71이 누락됨. Autodesk DXF MTEXT 공식 명세상 71=1은 top-left attachment이다. 렌더러 공통 입력 계약인 테스트 fixture 문제로서 현재 증거가 ViewerManager.focusBounds 오류를 의미하지는 않는다.
- 조치: 테스트 fixture의 MTEXT에 group 41=240(reference width), 71=1(top left), 72=1(left-to-right)를 명시하고 TEXT entity handle(code 5)은 유효한 hexadecimal로 변경. 실제 애플리케이션 기능 코드는 수정하지 않았다.
- 공식 명세 https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-5E5DB93B-F8D3-4433-ADF7-E92E250D2BAB.htm ; CI https://github.com/planner77/layoutManager/actions/runs/38868174246. 후속 CI/QA/실도면 결과 미확인. PASS로 단정하지 않는다.



## U-ISSUE26-PR30-CI46-FAIL-20261016 — MTEXT continuation fixture whitespace mismatch, fixed (new CI pending)

- PR #30 / PR CI #46 run 38867179402, head 7aef7c7b628eaffac93ec3f8e0b9217dd3c22cea: TypeScript/ESLint **PASS**, Docker image/migration/smoke **PASS**, Unit+Integration **123 passed/1 failed** out of 124 in 27 files. Because the unit step failed, Build and both Browser E2E/migration E2E did not execute. This run does not establish those stages as PASS.
- Failure: TC-TEXT-001 expected MTEXT display text "생산 ABC 동 12 1/2가", but the fixture had a group-3/group-1 continuation "동\\P1" + "2\\S1#2;" (no literal separator between 12 and fraction), correctly rendering "생산 ABC 동 121/2가". MTEXT group-code 3 and 1 concatenate without inserting whitespace; implicit spaces would alter DXF visible content and text search semantics.
- Corrected the synthetic fixture to explicitly include the intended space before the fraction. Added TC-TEXT-011 confirming MTEXT group continuation with and without a literal space. Parser behavior was intentionally preserved; no production source or database contract changed for this correction.
- Fresh CI for the subsequent head still requires actual verification. React Ref lint and Unicode four-digit test passed in #46. See https://github.com/planner77/layoutManager/actions/runs/38867179402.



## U-ISSUE26-PR30-CI42-FAIL-20261016 — React Ref lint 및 Unicode 리뷰 수정 (재CI 대기)

- PR #30 / PR CI #42 / Run 38865738285 / head 179e8cd1a22c5eb0c0609080953c98b0e45ece2d.
- 실제 GitHub Actions 관찰: TypeScript **success**, ESLint **failure**, 따라서 Unit/Integration·production build·Chromium E2E·legacy migration E2E는 **skipped**. 병렬 Docker image size/migration/runtime smoke Job은 **success**.
- ESLint react-hooks/refs 실패 위치: src/features/cad-viewer/viewer.tsx:245:80, JSX render 중 manager.current 접근. Ref의 직접 렌더링 참조를 제거하고 stable useCallback getter를 prop으로 제공하며 자식 useEffect/이벤트 내에서만 사용하도록 수정.
- Codex P2 리뷰: DXF \U+00B0C와 같은 고정 4자리 Unicode escape 직후 hex 문자를 기존 {4,8} 정규식이 삼켜 glyph가 달라짐. {4}로 수정, TC-TEXT-010 인접 16진 문자 단위 테스트 추가.
- 상기 수정 후 TypeScript/ESLint/Unit/E2E 전체 통과는 **새 CI 결과 확인 전 미확정**. 실제 원인 분석은 CI 로그와 inline review를 기준으로 하며 미실행 테스트를 PASS로 기입하지 않는다.
- 참조: https://github.com/planner77/layoutManager/actions/runs/38865738285 및 https://github.com/planner77/layoutManager/pull/30.



## U-ISSUE26-DEV-20261016 — DXF 내부 텍스트 검색 구현, 검증 대기

- Issue #26 / 작업 브랜치 feat/issue-26-dxf-text-search / SemVer 0.27.0.
- 실제 코드 변경: 순수 ASCII DXF TEXT/MTEXT/BLOCK-INSERT 인덱스 및 NFC/MTEXT 정규화, 별도 Worker, ViewerSource 캐시, 두 Adapter에 world XY focusBounds, 내부 검색 오버레이/레이어 필터/페이지/키보드 이동.
- 추적 TC-TEXT-001~006 단위 테스트와 TC-TEXT-E2E-001 브라우저 테스트 추가. **이 기록 작성 시 로컬 npm ci/tsc/lint/Vitest/Build/Chromium E2E는 미실행이며 PASS 아님**. PR CI run ID/결과 확인 전 최종 수용 불가.
- 한계: 현장 업무 DXF/DWG/복잡한 OCS/실제 글꼴 bbox는 미검증. ATTRIB/ATTDEF, 다중 배열 INSERT 및 DWG TEXT/MTEXT는 비지원. 비지원 Entity는 잘못된 좌표 이동 대신 제외 집계.
- 독립 QA 대행을 수행한 것으로 주장하지 않는다. GHCR 게시, main 병합·운영 배포는 요청 범위에 포함하지 않는다. 기술 계약 및 AC는 Issue26.md 참조.


## U-ISSUE31-PR32-CI-FAIL-20261016 — ESLint 및 P2 리뷰 보완 (재검증 대기)

- 최초 PR #32 CI run `38868848174`: `npm ci`, Prisma 생성, `tsc --noEmit` **PASS**; **ESLint 실패**(`src/viewers/three-dxf-viewer/adapter.ts:165:11`, `prefer-const`). Unit/Integration, Build 및 E2E는 이전 단계 실패로 **미실행**, 별도의 Docker build/migration/runtime smoke Job은 **PASS**.
- 보완: timeout handle `let timer`→`const timer`. Codex P2 리뷰 3건 처리 대상: (1) 선택 중 Escape가 Fullscreen 종료를 막지 않도록 이벤트 전달, (2) 새 Worker 전에 기존 preview/확정 데이터 동기 무효화, (3) 오목 Polygon 경계를 가로지르는 내부 꼭짓점의 Hole 오판 방지를 위한 선분 교차 검사.
- 테스트 추가: 오목 경계를 넘는 삼각형의 Union Unit; 선택 해제 시 확정 비활성화 및 CSS Fullscreen fallback Escape E2E. **새 CI 실행 전 해당 테스트 결과는 미확정.** 운영 수용·독립 QA도 미완료.


## U-ISSUE31-DEV-20261016 — 구현 기록 (자동 시험 전)

- 소스 `feat/issue-31-outline-selection`, 개발 버전 0.27.0. DXF WCS source index/Handle, 기본 INSERT affine, SelectionController, Web Worker, convex/precise union, 렌더와 분리된 Overlay, 임시 확정·JSON 내보내기 및 합성 Unit/E2E 시험 코드를 작성했다.
- **검증 상태: PENDING.** 이 기록 작성 시 개발자 로컬 TypeScript/ESLint/Unit/Browser 테스트, PR CI, 독립 QA, 실제 설비 DXF 판정은 수행하지 않았음. PR CI 실행 결과와 코드 오류 수정 전에는 수용/운영 배포 PASS를 주장하지 않는다.
- P4 인증/인가·server persistence/CRUD 및 P5 대형 도면 성능/정밀 매핑 검증은 미구현. Source와 DB 원본 쓰기 계약에 변경 없음. [Issue31](Issue31.md).


## U-ISSUE28-PR29-CI39-FAIL-20261016 — 추가한 Unit test matcher 오류 보완 (신규 CI 재검증 대기)

- CI #39 run `38860855614`, head `000774b5432868e696fefc84068e36472e26337d`: TypeScript와 ESLint 검사는 진행·성공했으며 Unit/Integration에서 **113 passed / 1 failed (총 114)**. 실패 지점은 기존 앱/DB 기능이 아닌 신규 `TC-IMAGE-010` 테스트 구현.
- 구체적 원인: `expect(resolve({ GHCR_IMAGE: '...@sha256:abc' })).toThrow;`처럼 `resolve()`를 assertion 함수 밖에서 먼저 실행했고 `.toThrow` 메서드를 호출하지 않아 의도한 실패를 정상적으로 검증하지 못함. ESLint도 `@typescript-eslint/no-unused-expressions` 경고를 출력. `expect(() => resolve({ GHCR_IMAGE: '...@sha256:abc' })).toThrow()`로 수정해 예상 예외를 Vitest matcher가 포착하도록 보완.
- 이 수정에 대한 실제 CI 결과는 **미확정**. 구 CI의 Docker job이 동작 중/종료 상태인지와 신규 run은 각각 GitHub 결과를 기준으로 판정해야 하며 기존 테스트 전체 통과를 주장하지 않는다.

## U-ISSUE28-PR29-CI30-FAIL-20261016 — 신규 Docker smoke 실패 및 보완 (재검증 대기)

- PR #29 / CI #30 run `38858349603`, original head `ab02e281c8d8c70cfe473db7e8c24ed5772ebdfa`: Node typecheck, lint, unit/integration, production build, Browser E2E, Legacy migration E2E **모두 CI에서 SUCCESS**. Docker 이미지 4개 빌드/크기 측정, migration 실패의 nonzero 검증도 SUCCESS.
- Docker Compose `migrate`는 빈 DB에 6개 Prisma migration과 delete password backfill을 정상 수행했다. 이어서 `app` 시작 직후 health curl이 `Recv failure: Connection reset by peer`(exit 56)를 반환하여 **Docker runtime smoke job만 FAILED**. 기존 `--retry-connrefused`는 exit 56을 재시도하지 않음. Health smoke 신규·재기동에 `--retry-all-errors`, retry interval, connect/max timeout 추가. 변경 후 CI는 미확인.
- Image 측정(동일 linux/amd64, 비압축 bytes): baseline **2,054,848,814**, phase1 **2,053,874,911**, standalone runtime **376,228,092** → **81.69% 절감**. `docker save | gzip -1` 압축 tar 대용값: 625,871,345 / 625,636,529 / 139,214,422 bytes; GHCR OCI 전송 크기 또는 합산 배포 이미지 크기가 아님.
- Codex 리뷰 P2 2건: ① app 정식 태그 조기 게시 위험 → app·migration 후보 이미지 모두 성공/검증 후 공개 태그 승격, publish 취소 방지; ② 태그 없는 app 지정에서 migrator 잘못 파생 → `src/scripts/compose.sh` tagless→`:latest`/`:latest-migrate` 정규화, digest pairing 필수·raw Compose override 명시.
- TC-IMAGE-010~012 추가. 관련 README/Operation/Issue28/Decisions/TestPlan/ChangeLog 갱신. **이 후속 수정에 대한 CI/P2 수용/운영 실제 배포는 아직 PASS로 판정하지 않음**.

## U-ISSUE28-DEV-20261016 — Docker 경량화 구현 기록 (검증 대기)

- Issue #28 / `feat/issue-28-standalone-runtime` / 소스 0.26.0. Next standalone runtime, 별도 Prisma CLI/tsx migrator, Compose exit0 의존성, 로컬 start --port 변환, static/WASM/TTF 복사, GHCR dual target 구성.
- TC-IMAGE-001~009 및 baseline→phase1→runtime 크기·레이어 기록/빈 DB 설치·재실행·실패·health/정적 자산 Docker CI job 추가.
- **개발 초기 기록 당시에는 CI가 미실행(PENDING)이었음.** 그 이후 CI #30의 정적/Browser/빌드/측정 결과와 Docker smoke 실패는 상단 기록을 따른다. 실운영 migration·독립 QA·GHCR digest는 미검증. 사용자 데이터·버전/Current·schema를 변경하지 않음.
- 독립 QA 전용 모델을 실행할 수 있는 도구가 제공되지 않아 별도 모델 검증 미실시. `Issue28.md`와 `Operation.md`에 복구·위험 사항 기술.


## U-ISSUE24-PR27-CI28-FAIL-20261016 — E2E Locator 실패 분석 및 수정 (재검증 대기)

- 실패 증거: PR #27 `PR CI #28` run `38852895275`, commit `0be21f5`, Job `116817839530`. Prisma Client 생성, TypeScript, ESLint, Unit/Integration, Production build는 성공했으며 Chromium E2E는 **37 passed / 1 failed**. Legacy migration E2E는 E2E 실패에 따라 `skipped`이다.
- 직접 원인: `src/tests/e2e/master.spec.ts:198`의 `page.getByRole("alert")`가 재분류 컴포넌트의 안내 `<p role="alert">대상 기준정보를 불러오지 못했습니다.</p>`와 Next.js의 `<div id="__next-route-announcer__" role="alert">`를 동시에 찾아 Playwright `strict mode violation`이 발생했다. 503 오류 안내 자체는 표시되었으므로 서버 API/재분류 화면 결함으로 오판하지 않는다.
- 수정: 재분류 `form` 범위에 한정한 `page.locator("form").getByRole("alert")`를 사용해 503 안내 확인과 새로고침 후 안내 소멸을 검증한다. 기존 정상 Current/원본·Viewer·재분류 검증을 유지하며 DB/API/패키지 버전은 변경하지 않는다. TC-MASTER-008 계획을 동일하게 갱신했다.
- 최신 수정에 대한 로컬 빌드·E2E는 수행하지 않았고, 새 PR CI의 결과는 아직 확인 전이다. **통과 판정은 새 CI 결과를 확인한 뒤 수행한다.** 리뷰 스레드와 충돌은 별도 GitHub 상태로 확인한다.

## U-ISSUE24-PR27-REVIEW-20261016 — 리뷰 P2 보완 (CI 검증 전)

- PR #27의 미해결 P2 지적: 미분류 층 상세 `/api/masters?active=true`가 HTTP 오류와 JSON `error`를 반환하면 응답 성공 여부를 검사하지 않아 `setTree(undefined)` 후 `tree.find`에서 화면이 중단될 수 있었다.
- 수정: HTTP `response.ok` 및 응답 `items` 배열을 검사한 뒤 상태를 갱신한다. 실패/비정상 응답은 기존 `role=alert` 오류 안내로 처리하며 도면 버전 조회 화면은 유지한다.
- 회귀 계획/소스: `src/tests/e2e/master.spec.ts`의 기존 legacy/재분류 시나리오에 HTTP 503 JSON 실패 주입 → 오류 안내·폼·버전 보존 → 라우트 해제·새로고침 → 정상 재분류를 추가했다(TC-MASTER-008).
- 이전 PR CI(기존 커밋 `4ab9451`) 결과는 SUCCESS(run 38747384469)였으나 본 보완 변경에 대한 local typecheck/lint/E2E는 수행하지 않았다. 새 PR CI 실행 결과는 별도 확인 대상이며 **이 시점에서 PASS라고 기록하지 않는다**. 기준 브랜치 충돌은 수정 전 `main` 대비 behind=0, mergeable=true로 확인했다. 패키지 버전 0.25.0 유지, 운영 migration/배포 미실시.

## U-ISSUE24-PUBLISH-20261015 — Root 원격 게시

- 0.25.0 source commit `e8189b4543ce53b00a6c2feb02e0eae3f125263b`, branch `feat/issue-24-master-hierarchy`를 지정 저장소에 게시했다. 기존 Git 인증의 dry-run이 실패해 연결된 GitHub 도구로 Git object와 ref를 생성했으며 인증 값은 출력하지 않았다. 일반 push 성공으로 기록하지 않는다.
- stage 67개 파일 Secret/credential URL/token/runtime/CAD/DB/cache/build 검사 위반 0건, staged diff 공백 검사 통과, 문서 local link 61개 오류 0건. 원격 tree `68a3b66616f5724f8f6bca2865d041a5c165b4fc`가 검사한 local index tree와 정확히 일치했다. local branch는 동일 commit으로 fast-forward 동기화했다.
- 원격 main `ba83dcf3451c50088895a84900487dc606e57503`을 재조회하고 작업 브랜치의 조상임을 확인했다. 충돌 없음. 기존 열린 PR 없음. 새 PR의 opened 이벤트로 PR CI가 정적/자동/build/Browser와 실제 legacy migration E2E를 실행하며 CI 결과 모니터링은 요청 범위 밖이다.
- Root도 관리 desktop·등록/재분류 narrow 캡처를 직접 검토했다. 별도 임시 SQL migration 검증에서 4 Location/4 Version의 metadata·Current·nextVersion·timestamps 보존, 부모별 dedup(BU2/Product2/Site3/Building3/Floor4), FK/integrity, 다른 층 Current·순번 감소 거부와 오류 주입 rollback을 확인했다. SQL-only 보조 시험이며 실제 scrypt/원본 시험은 아래 Developer/QA 근거로 구분한다.
- 원래 작업 폴더의 미커밋 `src/next-env.d.ts` 변경과 운영 DB/CAD는 보존했다. Tag/GHCR 게시·운영 migration·배포는 미실행. 다음 단계는 새 PR CI 시작과 사용자/리뷰어의 결과 확인·병합 판단이다.

## U-ISSUE24-QA-20261015 — 독립 QA 기준정보 계층 검증

- 상태: 독립 QA PASS/VERIFIED (root Manager의 commit/push/운영 DB 적용 전). 역할: gpt-5.6-luna QA. 환경: Linux x86_64, Node 22.14.0, package `0.25.0`, Playwright 1.63.0, Chromium executable `/home/planner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`, worker 1, 격리 local SQLite/storage 및 격리 SeaweedFS 4.45.
- 정적/자동 검증: `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm run build` 모두 exit 0. `npm test` 25 files / 109 tests passed / 0 failed.
- 기존 전체 Browser: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npm run test:e2e` — 38 passed / 0 failed / 2.2분. 기준정보 3개, dropdown reset/활성 chain, 3-version Current, 제품·비활성 이력·재분류 및 기존 DXF/삭제/링크 회귀를 포함한다.
- Legacy migration: `npm run test:master-migration` — 1 passed / 0 failed. 실제 pre-0.25 populated DB를 `db:deploy`해 Browser에서 이력·Current·원본·Viewer를 읽고 재분류했다. 독립 통합 시험은 migration transaction rollback, 행 수/FK guard, 두 사업부 동일 명칭 분리, UUID/순번/Current/metadata, 실제 scrypt password 검증과 original bytes/SHA-256 보존을 확인한다.
- 저장/특수 형식: `npm run test:s3` — 격리 SeaweedFS 4.45, 1 file / 6 passed / 0 failed. `PLAYWRIGHT_CHROMIUM_EXECUTABLE=... npm run test:dwg` — 4 passed / 0 failed / 1.3분. Benchmark 30 passed는 Developer 자체 검증 근거로만 구분하며 QA에서 재실행하지 않았다.
- UI/UX: UI Pro Max의 visible focus, keyboard order, submit feedback, responsive no-horizontal-overflow 기준을 적용해 `/masters`, `/cad/upload`, 재분류가 포함된 Location을 desktop 1440px 및 narrow 390px에서 캡처·검토했다. DOM `scrollWidth=clientWidth=390`을 세 화면에서 확인했다. 캡처는 `src/test-results/issue24-ui/issue24-masters-desktop.png`, `issue24-masters-narrow.png`, `issue24-upload-desktop.png`, `issue24-upload-narrow.png`, `issue24-reclass-desktop.png`, `issue24-reclass-narrow.png`에 있다. Playwright CLI는 설치된 1247 browser revision을 요구해 세션이 시작되지 않았고, 동일 Playwright 엔진의 지정된 1243 executable로 캡처·검증했다.
- Source review: migration의 생성→dedup/backfill→CadLocation 재구성→count/FK guard 및 transaction rollback, repository의 transaction 내 full ID-chain/active 검증, immutable IDs/parent/product rules, Current 복합 FK와 reclassify collision guard, bounded JSON/same-origin/request ID logging을 확인했다. 제품/사업장 kind와 4-part default name 표시 계약도 확인했다.
- 판정: FR-MASTER-001~007 및 TC-MASTER-001~007은 위 실제 범위에서 PASS/VERIFIED. 운영 DB migration/backup/배포와 root publication 검증은 이 QA 범위가 아니다. 시험 중 생성한 `/tmp/cad-qa-ui-issue24.aSu7ot` 및 `src/test-results/issue24-ui`는 commit 대상이 아니다.

### Manager 수용 판정 — 2026-10-15

- gpt-6-astra Manager가 구현 전 요구/설계/AC를 기록하고 gpt-5.6-sol Developer의 구현·재작업 보고와 gpt-5.6-luna의 독립 QA 결과를 검토했다. 지정 모델 대행은 없었다.
- FR-MASTER-001~007 구현·검증 범위를 수용한다. Manager도 기준정보 desktop, 등록·재분류 narrow 캡처를 직접 확인했고 제품 blocker를 발견하지 않았다. 최종 `git diff --check` 통과. 캡처는 Git 제외 `src/test-results/issue24-ui/`로 이동했다.
- 버전은 0.25.0이다. commit/push/PR·CI 시작은 root 후속 단계이며 이 판정은 게시·운영 DB migration·배포 완료를 뜻하지 않는다. 이번 실행의 다음 단계는 root의 최종 staged/Secret 검사와 PR 게시이다.

## U-ISSUE24-DEV-20261015 — 기준정보 계층 Developer 자체 검증

- 상태: Developer 구현·자체 회귀 완료, 독립 QA 전 `IN_PROGRESS`. package `0.25.0`. commit/push/운영 DB 적용/배포는 수행하지 않았다.
- `npm test`: 25 files / 109 passed. 실제 scrypt migrated-row 검증, 원본 bytes/SHA-256 보존, 두 사업부에서 같은 사업장·동·층 명칭의 독립 dedup, UUID/Current/nextVersion/version metadata 보존, 재분류 후 전체 이력·비밀번호 검증, 3개 동시 Current 변경과 transaction rollback을 포함한다.
- `npm run test:e2e`: 38 passed / 0 failed. 보강된 `master.spec.ts` 3개도 별도 재실행해 5단계 UI 생성·편집·비활성/재활성, 3버전 이력, 실제 UI Current 교체, 이력 소유 제품 비활성 시 신규 등록 거부와 기존 원본/Viewer/direct link 유지, 전체 이력 재분류를 확인했다.
- `npm run test:master-migration`: 1 passed. 격리 임시 위치에서 pre-0.25 schema와 실제 DXF 3개를 만든 뒤 기존 migration들을 applied로 표시하고 실제 `npm run db:deploy`를 실행했다. Browser에서 3개 이력·Current·원본·Viewer route를 읽고 실제 계층으로 재분류했다. fixture setup은 전용 `CAD_MASTER_MIGRATION_DIR`의 canonical temp prefix와 정확한 DB/storage 자식만 허용하고 기존 target이 있으면 중단하며 삭제를 수행하지 않는다. 이 시험은 PR CI에도 포함한다.
- `npm run test:s3`: isolated SeaweedFS 4.45, 6 passed. 새 ID chain fixture로 local/S3 혼합 조회, bytes/hash, conditional PUT, DB 실패 보상과 불확실 완료 보존을 회귀했다.
- `npm run test:dwg`: 고정 `Line.dwg`/`circle.dwg`, 4 passed. 등록 DWG lifecycle/직접 링크/원본 bytes, partial·unsupported·missing·retry와 worker 종료를 회귀했다.
- `npm run test:benchmark`: 100/10,000/100,000 LINE × 두 DXF Viewer × 5회, 30 passed / 4.7분. 새 ID chain으로 fixture를 전환하고 냉·온 source mode, bytes, 성공 결과, entity 수와 console/page error 0을 확인했다.
- 마지막 fixture 보강 후 `db:generate`, `typecheck`, `lint`, 25 files/109 Vitest 및 production `build`를 다시 실행해 모두 exit 0을 확인했다.
- 판정: Developer 범위 PASS. 운영 복제본 dry run·운영 백업/배포 및 독립 QA 수용은 미실행이며 완료로 확대하지 않는다.

## U-ISSUE7-20260911 — 상단 제목 0.19.1

- 상태: 독립 QA 완료, root Manager 수용(구현·정적 검사·관련 Browser 범위). FR-UI-002 → TC-TITLE-001. Header 홈 링크는 아이콘과 `/` 이동을 유지하면서 accessible name `Layout Manager`를 표시하고 `CAD` 접두어와 `P.O.C.` 배지를 제거한다. 브라우저 metadata `CAD Layout Manager`는 요구 범위 밖으로 유지한다.
- 역할: root Manager 요구/AC 기록 후 gpt-5.6-sol Developer가 layout 문구만 수정했고 root review 뒤 gpt-5.6-luna QA가 검증했다. root도 QA 캡처를 직접 확인했으며 릴리스/배포를 담당한다.
- QA 독립 검증: gpt-5.6-luna, 2026-09-11, Linux x86_64, Node 22.14.0, package `0.19.1`, Playwright 1.63.0, Chromium 1208 executable `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`, isolated local SQLite/storage on port 3101.
- Source review: `src/app/layout.tsx`의 header 변경만 확인했다. 홈 링크 아이콘/href와 nav를 유지하고 제목 문자열을 `Layout Manager`로 변경했으며 `CAD`/`P.O.C.`를 제거했다. metadata title은 `CAD Layout Manager`로 남아 있다.
- `npm run typecheck`, `npm run lint`, `npm run build`: 각각 exit 0.
- Focused local production Browser: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome CAD_E2E_PORT=3101 npx playwright test tests/e2e/upload.spec.ts -g 'TC-UI-001/UP-001'` — 1 passed / 0 failed / 6.5초. Header의 파일 등록 링크로 이동해 새 도면 등록 화면, 업로드 성공, 원본 다운로드, 목록 복귀·새로고침을 확인했다. 생성된 `src/test-results/upload-success.png`를 직접 확인해 `Layout Manager`, 아이콘, 도면 목록/파일 등록 nav, `v0.19.1`을 확인하고 `CAD` 및 `P.O.C.` 부재를 확인했다.
- 첫 sandbox Browser 실행은 tsx IPC pipe `EPERM`으로 앱 시작 전 중단되었고, 동일 명령을 허용된 host 환경에서 재실행해 위 결과를 얻었다. 이는 제품 시험 실패가 아니다. 기존 관련 Browser 전체 회귀·S3·DWG는 literal header copy 변경 범위 밖이라 재실행하지 않았다.
- 판정: FR-UI-002 및 TC-TITLE-001은 위 실제 범위에서 PASS/VERIFIED. 목록 화면의 exact accessible name/홈 이동 별도 smoke와 배포 health/image 검증은 root Manager의 범위다.

### 게시·배포 확인

- source `83b8e532b089ab69e279e31ae37106acc3594f7a`를 origin/main에 push했다. staged/diff-check 및 실제 Secret/runtime 후보149파일 검사에서 위반0건이었다.
- 동일 source의 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.19.1`을 빌드·게시하고 인증된 pull을 확인했다. OCI revision 일치, digest `sha256:ca093a71ce6e78e9291cd002d253196c285eb270918710e3c6cf674dc839068a`. 빌드에서 기존 npm high4 의존성 경고는 유지됐다.
- root가 새 이미지의 port3145/임시 볼륨에서 목록·등록 페이지 banner의 exact accessible name `Layout Manager`, CAD/P.O.C. 부재, 아이콘/홈 href 및 클릭 후 홈 이동을 검증했다. `/tmp/cad-issue7-packaged-list.png`와 `-upload.png`를 캡처했고 목록 화면을 직접 검토했다. 임시 컨테이너/볼륨을 정리했다.
- 운영 앱 정지 후 전체 `cad-layout-viewer-data`를 Git 제외 `data/backups/issues-0.19.1-20260911/data-before-0.19.1.tar.gz`로 백업했다. archive114,813bytes, SHA-256 `972fbbbcceda5942b1a7f9ef411179edf3f9df62b565b6e8677cbfa55f878839`, archive 읽기 검사 성공이다.
- 같은 볼륨으로0.19.1 Compose 배포 후 container healthy 및 health API200/status=ok를 확인했다. 정지 후 snapshot과 배포 후 readonly snapshot의 모든 필드가 일치했다: Version1개/Location3개/DeletionJob0개, 원본1,117,143bytes, 전체 metadata(Current/password hash/drawing_name 포함)와 원본 fingerprint 보존, integrity=ok/FK오류0건. 로컬 GHCR_IMAGE도0.19.1로 고정했다.
- GitHub #7 결과 댓글 `5630144308` 및 `closed/completed` 확인. root Manager는 #6/#7을 완료 판정한다. 새 필수 Unit은 없으며 기존 실도면 평가와 범위 밖 UI 관찰은 후속 사항이다.

## U-ISSUE6-20260911 — 도면 이름 0.19.0

- 상태: 구현·재작업 및 독립 QA 완료, root Manager 수용. FR-CAD-008 → TC-NAME-001–004. 게시·배포 및 GitHub #6 완료 종료.
- 역할: root Manager가 요구사항·설계/수용을 담당했고 gpt-5.6-sol Developer 구현·재작업 후 gpt-5.6-luna QA가 독립 검증·문서화했다. root가 릴리스/배포/이슈 처리를 담당한다.

- Developer 1차 검증: unit/integration22 files/96 PASS, typecheck/lint/build PASS, 신규 이름 Browser3 PASS. root 검토에서 기존 파일명 기반 E2E selector와0.18.0 populated DB 단독 이름 migration 검증의 보완이 필요해 재작업을 지시했다. 이후 기존 selector/mock DTO·fixture 격리와 실제0.18.0 업그레이드/이름 경계 검증을 보완했다. Developer의 최종 전체 Browser31 및 DWG4 PASS를 검토하고 독립 QA에 인계했다.

- 독립 QA: gpt-5.6-luna, 2026-09-11, Linux x86_64, Node 22.14.0, package 0.19.0, Playwright 1.63.0, Chromium 1208 executable, isolated local SQLite/storage (port 3101) 및 isolated SeaweedFS 4.45.
- `npm test`: 22 files / 98 passed / 0 failed, exit 0. `npm run typecheck`, `npm run lint`, `npm run build`: 각각 exit 0.
- Local production Browser: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome CAD_E2E_PORT=3101 npm run test:e2e` — 31 passed / 0 failed / 1.8분. TC-NAME-001–003 관련 등록·기본/사용자 이름·원본 파일명 검색·새로고침·Viewer/삭제 표시와 기존 전체 회귀를 통과했다. 첫 sandbox 실행은 tsx IPC pipe EPERM으로 앱 시작 전 중단되어 허용된 동일 환경에서 재실행했다.
- Focused name Browser: `... CAD_E2E_PORT=3101 npx playwright test tests/e2e/drawing-name.spec.ts` — 3 passed / 0 failed / 8.7초. 캡처를 직접 확인했다: `src/test-results/drawing-name-TC-NAME-002-0-56047-filename-remains-searchable/drawing-name-list-custom.png`는 custom 이름 plain text와 `원본: name-source-two.dxf`를 표시했고, `src/test-results/drawing-name-TC-NAME-003-a-41755--inside-the-viewer-viewport/drawing-name-viewer-long.png`는 360px에서 긴 제목이 콘텐츠 폭 안에 줄바꿈된다. 해당 빈 DXF fixture는 캡처 시 로딩 상태여서 Viewer 렌더링 PASS로 확대하지 않는다. 캡처에서 360px 전역 header navigation clipping/overlap이 관찰되었으며 이름 기능 범위 밖의 후속 반응형 UI 관찰이다.
- S3 integration: `npm run test:s3` — isolated SeaweedFS 4.45, 1 file / 6 passed / 0 failed, exit 0. DWG regression: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=... CAD_E2E_PORT=3111 npm run test:dwg` — 4 passed / 0 failed / 22.0초, cached samples; no redownload.
- 판정: TC-NAME-001–004 실제 범위 PASS/VERIFIED. migration/legacy populated DB 검증은 통합 98 tests의 `delete.test.ts` migration fixture에서 `drawing_name=NULL`, 기존 metadata/Current/hash/locator/순번/FK 보존과 삭제 후V3 비재사용을 확인했다. 기존0.16.0 업그레이드 시험에서는 password backfill 재실행도 회귀했다. root의 배포/image smoke, managed db deploy, 운영 legacy-name validation은 별도 수행 범위이며 root가 담당한다.

### 게시·배포 확인

- source `0b1c620ffd18e4328c149c92c47c7ceef9e8fd7f`를 origin/main에 push했다. staged/diff-check 및 실제 Secret/runtime 후보149파일 검사 위반0건이다.
- 동일 source의 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.19.0`을 빌드·게시하고 인증된 pull을 확인했다. OCI revision 일치, digest `sha256:e055f66da3e63dc755c46e891461e6cecbef2e76aa74c2f2ac7f4d7d38c6ea7b`이다. 빌드에서 기존 npm high4 의존성 경고가 재확인됐으며 이번 기능에서 해결하지 않았다.
- root가 이미지의 port3145/임시 볼륨에 기본 이름과 사용자 지정 이름의 합성 LINE DXF 두 건을 등록했다. 등록 displayName과 목록/Viewer 제목, 원본 다운로드 bytes 일치를 검증하고 `/tmp/cad-issue6-packaged-list.png` 및 `-viewer.png`를 직접 검토했다. 같은 임시 컨테이너의 `npm run db:deploy` 재실행이 성공했고 이름·password hash를 포함한 전체 fixture metadata fingerprint가 보존됐다. 임시 컨테이너/볼륨은 정리했다.
- 운영 앱 정지 후 전체 `cad-layout-viewer-data`를 Git 제외 `data/backups/issues-0.19.0-20260911/data-before-0.19.0.tar.gz`로 백업했다. archive114,673bytes, SHA-256 `5980658b5ae01df326c6946a7b558409ee25af611db13c50516871a48a41eaf0`, archive 읽기 검사 성공이다.
- 같은 볼륨으로0.19.0 Compose migration/배포 후 container healthy 및 health API200/status=ok. 새 `drawing_name TEXT NULL` schema를 확인했다. 정지 후 snapshot과 배포 후 snapshot을 비교해 신규 NULL drawing_name만 제외한 모든 기존 Column/행이 일치했고 기존 원본 SHA/크기도 일치했다. 실제 Version1개/Location3개/DeletionJob0개, 원본1,117,143bytes, integrity=ok/FK오류0건이다. 기존 도면1개의 API displayName이 위치와 실제 version의 기본 규칙과 일치함을 확인했다. 비밀번호 입력은 운영 도면에 재시험하지 않았고 저장된 hash 보존으로 한정한다. 로컬 GHCR_IMAGE는0.19.0으로 고정했다.
- GitHub #6 결과 댓글 `5630033809` 및 `closed/completed` 확인. root Manager 완료 판정. 등록 후 이름 편집은 범위 밖이며 기존360px 전역 header 표시와 실도면/복잡 Entity 평가는 후속 관찰 사항이다.

## U-ISSUE5-20260911 — 레이어 다중 선택 0.18.0

- 상태: 구현·자동·시각 검증 완료, root Manager 수용. 게시·배포 및 GitHub #5 종료 완료. GitHub #5의 three-dxf-viewer 다중 선택 드롭다운, 전체 선택/해제와 선택 개수를 제공한다. 원본·DB/API와 Viewer Adapter의 기존 표시 규칙은 변경하지 않는다.
- 역할: root Manager가 요구사항·AC/설계를 기록하고 gpt-5.6-sol Developer가 UI와 회귀 시험을 구현했다. 구현 검토 후 gpt-5.6-luna QA가 독립 검증했으며 root가 게시·배포·이슈 처리를 담당한다.
- 추적: FR-VIEWER-009 → LayerDropdown/CadViewer의 controlled 선택 → 기존 ViewerManager.showLayer → TC-LAYER-001–003. 단순 레이어 합성 fixture 검증을 복잡 BLOCK/INSERT 상속이나 실도면 전체 지원으로 확대 해석하지 않는다.

- QA 독립 검증: gpt-5.6-luna. Linux x86_64, Node 22.14.0, package `0.18.0`, Playwright 1.63.0, Chromium 1208 executable `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`, SwiftShader, worker 1, isolated local SQLite/storage.
- 단위·정적 검사: `npm test` exit 0 (22 files / 92 passed / 0 failed), `npm run typecheck` exit 0, `npm run lint` exit 0, `npm run build` exit 0.
- local 전체 Browser E2E: 28 passed / 0 failed / 1.7분. TC-LAYER-001–003 모두 통과했다. 개별 다중 선택·전체 선택/해제·메뉴 유지, 동일 canvas/no additional content GET, reload/renderer/version selection reset, 좁은 화면 geometry·scroll·keyboard focus 이동/토글/Escape 복귀를 검증했다. 기존 unsupported/empty/DXF/DWG renderer states도 회귀 통과했다.
- 시각 검증: `src/test-results/layer-dropdown-TC-LAYER001-34dff-as-without-another-download/layer-menu-normal.png` 및 `src/test-results/layer-dropdown-TC-LAYER003-fa50d-nd-support-keyboard-actions/layer-menu-narrow.png`를 확인했다. 정상 메뉴의 3개 레이어와 360×480 좁은 화면의 viewport 내 배치·내부 스크롤을 확인했으며 root Manager도 동일 capture를 검토했다.
- DWG 회귀: `CAD_E2E_PORT=3111 npm run test:dwg` 4 passed / 0 failed / 22.1초. 캐시된 Line/Circle sample, 등록 Viewer lifecycle, partial/unsupported/missing/retry 상태를 확인했다.
- 판정: FR-VIEWER-009 및 TC-LAYER-001–003 PASS/VERIFIED. 단순 레이어 합성 fixture 범위이며 복잡 BLOCK/INSERT 상속과 실도면 전체 지원 평가는 포함하지 않는다. 최초 stale `.next`에서의 layer selector 문제는 최신 production build 후 재실행에서 재현되지 않았다.

### 게시·배포 확인

- source `543423d36c092412442eddf25383c029149451a2`를 origin/main에 push했다. root의 staged/diff-check 및 실제 Secret/runtime 후보147파일 검사에서 위반0건이었다.
- 해당 source의 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.18.0`을 빌드·게시하고 인증된 pull을 확인했다. OCI revision 일치, digest `sha256:f98883f2a33ffdca71138fd4e3aed9686eaeec27cd109ecb8c08b39fdb1bc14d`이다. 이미지 빌드의 npm ci에서 기존 high4 의존성 경고가 재확인됐으며 이번 UI 변경에서 해결하지 않았다.
- root가 새 이미지의 port3145/임시 볼륨에 건축·배관·전기 3개 레이어 합성 DXF를 등록했다. 전체 해제 시 canvas 변화와0/3, 전체 선택 시3/3 및 최초 canvas의 정확한 복원을 확인했다. `/tmp/cad-issue5-packaged.png`를 직접 검토했으며 임시 컨테이너/볼륨을 정리했다.
- 운영 앱 정지 후 전체 `cad-layout-viewer-data`를 Git 제외 `data/backups/issues-0.18.0-20260911/data-before-0.18.0.tar.gz`로 백업했다. archive114,490bytes, SHA-256 `d75e87dd81919f94c3ebf3f52a34c641c227984cf5f010b09ad5baad42c82f42`, archive 읽기 검사 성공이다.
- 같은 볼륨으로0.18.0 Compose 배포 후 container healthy 및 health API200/status=ok를 확인했다. 정지 후 기준 snapshot과 배포 후 readonly snapshot의 모든 필드가 일치했다: Version1개/Location2개/DeletionJob0개, 원본1,117,143bytes, DB 전체 행 metadata fingerprint(Current/password hash 포함)와 원본 fingerprint 보존, integrity=ok/FK오류0건. 이번 비교는 저장된 password hash 보존이며 별도 비밀번호 입력 검증은 재실행하지 않았다. 로컬 GHCR_IMAGE도0.18.0으로 고정했다.
- GitHub #5에 결과 댓글 `5629680051`을 남겼고 `closed/completed` 응답을 확인했다. Manager 완료 판정. 후속 범위는 기존 실도면/복잡 Entity 평가이며 신규 필수 Unit은 없다.

## U-ISSUE4-20260911 — 삭제 대화창 레이아웃 0.17.2

- 상태: 구현·자동/시각 검증 완료, Manager 수용. GitHub #4 첨부 이미지를 읽어 경고 문구와 비밀번호 입력이 panel 밖으로 넘치는 현상을 확인했다. 이전 0.17.1의 기능 E2E는 이 geometry를 검사하지 않았다.
- 수정 전 재현: root가 게시된 0.17.1 이미지를 별도 port3145/임시 볼륨에서 실행하고 합성 fixture로 확인했다. desktop1280×800에서 panel384px 대비 scrollWidth708px, 입력 오른쪽889.625px가 panel 오른쪽832px를 약57.6px 넘었다. computed white-space는 nowrap이었다. 첨부 이미지와 같은 현상을 재현한 뒤 임시 컨테이너/볼륨을 정리했다.
- 역할: root Manager가 요구사항/AC와 UI 표시 구조를 기록하고 gpt-5.6-sol Developer가 수정·회귀 시험을 담당했다. root의 구현 검토 후 gpt-5.6-luna QA가 독립 검증했다. 게시·배포는 root가 담당한다.
- 추적: FR-DELETE-006 → DeleteButton Dialog Portal/normal wrapping → TC-DELETE-LAYOUT-001–003. 서버/API/DB/의존성 버전 변경 없음.

- QA 독립 검증: gpt-5.6-luna. Linux x86_64, Node 22.14.0, package `0.17.2`, Playwright 1.63.0, Chromium 1208 executable `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`, isolated local port 3101 with temporary SQLite/storage.
- 단위·정적 검사: `npm test` exit 0 (22 files / 92 passed / 0 failed), `npm run typecheck` exit 0, `npm run lint` exit 0, `npm run build` exit 0.
- local 전체 Browser E2E: 25 passed / 0 failed / 1.5분. TC-DELETE-LAYOUT-001–003 및 기존 DELETE cancel/wrong-password/pending/uncertain response cases가 모두 통과했다. S3/DWG 전체 재실행은 서버/API/DB/의존성 미변경인 대화창 UI 범위 밖으로 생략했다.
- 시각·geometry capture: `/tmp/cad-issue4-after-desktop.png` 및 `-longtext.png`, `-shortheight.png`, `-error.png`, `-pending.png`와 동명 `.json`을 생성해 실제 상태를 확인했다. desktop 1280×800 panel 384px, scrollWidth 384px; 375×667 panel x16 width343 height635, long text scrollHeight754; 375×260 panel x16 width343 height228, scrollHeight754; error scrollHeight782; pending panel height204. 모든 capture에서 white-space normal, overflow-wrap anywhere 및 clientWidth=scrollWidth를 확인했다. 자동 E2E의 descendant geometry 검사에서도 가로 넘침이 없었다. 좁은 화면은 내부 세로 스크롤로 입력/버튼에 접근했고 오류·정리 대기 표시도 panel 안에 배치됐다.
- 판정: FR-DELETE-006 및 TC-DELETE-LAYOUT-001–003 PASS/VERIFIED. sandbox 단독 capture는 Chromium IPC `SIGTRAP`으로 제한됐으나 escalated 동일 환경에서 capture를 완료했다. 이 제한은 제품 시험 실패가 아니다.

### 게시·배포 확인

- source `56fb1c43258dabc403033eb5895122ebdcbd9f4d`를 origin/main에 push했다. staged/diff-check와 실제 Secret/runtime 후보145파일 검사에서 위반0건이었다.
- 같은 source의 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.17.2`를 빌드·게시하고 인증된 pull을 확인했다. OCI revision 일치, digest `sha256:ecd4be1dbbe7cdb5f8e41d91583cf3ac3f5bce4da7f8308b100dbd0ab70d1df5`이다. 빌드의 npm ci는 기존 high4 의존성 경고를 다시 보고했으며 이번 UI 수정에서 해결하지 않았다.
- root가 해당 이미지의 port3145/임시 볼륨에서 수정 전과 같은 `floorplan.dxf` 합성 fixture를 열었다. panel/client/scroll width가 모두384px이고 입력 오른쪽808px가 panel 오른쪽832px 안에 위치했다. desktop1280×800과375×667 화면을 직접 확인했다. 원본 비교 시나리오는 삭제를 실행하지 않고 취소했다. QA capture server와 root 임시 image 컨테이너/볼륨은 정리했다.
- 운영 앱 정지 후 전체 `cad-layout-viewer-data`를 Git 제외 `data/backups/issues-0.17.2-20260911/data-before-0.17.2.tar.gz`로 백업했다. archive114,490bytes, SHA-256 `d75e87dd81919f94c3ebf3f52a34c641c227984cf5f010b09ad5baad42c82f42`, 읽기 검사 성공이다.
- 같은 볼륨으로0.17.2 Compose 배포 후 container healthy 및 health API200/status=ok를 확인했다. 정지 후 기준 snapshot과 배포 후 readonly snapshot의 모든 필드가 일치했다: 당시 Version1개/Location2개, 원본1,117,143bytes, metadata/Current 및 원본 fingerprint 보존, 기존 password검증 결과보존, integrity=ok/FK오류0건. 로컬 GHCR_IMAGE도0.17.2로 고정했다.
- GitHub #4에 결과 댓글 `5628838933`을 남겼고 `closed/completed` 응답을 확인했다. Manager는 해당 UI 이슈를 완료로 판정한다. 기존 의존성 경고·실도면 평가와 실제 모바일 키보드/다른 브라우저 검증은 후속 범위이다.

## U-ISSUES-20260911 — GitHub #2/#3 등록 메모·업로드 preflight 0.17.1

- 범위: 여러 줄 도면 설명을 등록·목록·Location·Viewer·새로고침까지 확인하고, 브라우저 File 크기 preflight(100 MiB 기본 및 7 MiB 설정), 제출 우회, 서버 413 진단을 검증했다. DELETE 회귀도 같은 브라우저 회귀에서 확인했다.
- 실행 역할: root Manager가 요구사항·AC·설계와 최종 수용을 담당했다. gpt-5.6-sol Developer 두 명이 이슈 UI/시험과 DELETE 보완을 구현했고, gpt-5.6-luna QA가 전체 단위·local Browser·7 MiB 설정 회귀 및 문서화를 수행했다. root는 cleanup CLI 수정, 잘못된 DELETE 응답 처리, 접근성 label 및 보강 시험과 S3/DWG·배포 검증을 수행했다.
- 검증 환경: Linux x86_64, Node 22.14.0, package `0.17.1`, Playwright 1.63.0, Chromium 1208 executable `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`, SwiftShader, worker 1, 격리 임시 DB/storage.

| 검사 | 실제 결과 |
| --- | --- |
| `npm test` | 22 files / 92 passed / 0 failed / exit 0 |
| `npm run typecheck` / `npm run lint` | 각각 exit 0 |
| `npm run build` | exit 0; final aria-label correction 포함 |
| local 전체 Browser E2E | 22 passed / 0 failed / 1.3분 |
| 100 MiB preflight | PASS; 100 MiB - 1, exact, +1, submit bypass, recovery; intercepted accepted POST 0 for rejected cases |
| `CAD_E2E_MAX_UPLOAD_SIZE_MB=7` preflight | 2 passed / 0 failed / 6.0초, separate port 3112 |
| S3 통합 `npm run test:s3` | SeaweedFS 4.45 / 6 passed / 0 failed |
| S3 전체 Browser `npm run test:s3:e2e` | 22 passed / 0 failed / 1.4분, port 3113 |
| DWG `npm run test:dwg` | 4 passed / 0 failed / 18.7초, port 3111 |

- TC-DESC-005 / GitHub #2: PASS. 여러 줄 메모가 목록·Location·Viewer와 새로고침 뒤 보존되며 literal 검색과 직접 Location 이동을 확인했다.
- TC-PREFLIGHT-001/002 / #3: PASS. `File.size > maxMb * 1024 * 1024`만 차단하고 선택값 초기화·최대 MiB 안내·정상 재선택을 확인했다. 100 MiB accepted cases are client-side intercepted to avoid Chromium CDP payload serialization; rejected cases sent POST 0회이다.
- TC-PREFLIGHT-003: PASS. 서버 크기 경계 통합 시험에서 413을 확인했고, Browser에서는 주입한 413 응답의 진단 UI를 확인했다. 두 시험의 근거를 구분하며 Browser에서 실제 100 MiB 초과 전송은 수행하지 않았다.
- 재작업 기록: password input에 명시 `aria-label`/`aria-describedby`를 추가해 accessible-name selector를 고정했고, 100 MiB Browser harness는 in-browser FormData size 측정으로 조정했다. Next streaming `notFound`의 HTTP 200 가능성 때문에 삭제 Viewer는 rendered 404/no canvas와 content API 404로 판정했다.
- 제한: intercepted 100 MiB accepted POST는 client acceptance 검증이며 실제 100 MiB server upload 성공·처리량 시험은 별도 수행하지 않았다.
- 추적: FR-CAD-006/TC-DESC-005 → `upload-form.tsx`/description query → PASS. FR-CAD-007/TC-PREFLIGHT-001–003 → `upload-limit.ts`/`upload-form.tsx`/server validation → PASS.

### DELETE 보완 검증

- repository에서 비밀번호를 실제 검증하고 transaction 안에서 검증한 hash가 유지되는지 확인한다. 잘못된 비밀번호는 Current·Version·원본을 바꾸지 않는다. Current 삭제 후 NULL, 남은 Version 보존 및 순번 비재사용을 통합/Browser 시험했다.
- 실제 0.16.0 schema fixture에 두 migration을 적용하고 기존 두 Version의 `1234` 검증, 독립 salt, metadata/Current 보존, 재실행과 신규 사용자 비밀번호 보존을 확인했다. 운영 DB 적용 결과는 아래 배포 기록에 별도 기록한다.
- KDF 실행 2개·대기 16개 제한 및 실패 후 slot 회수, 대상별 60초 5회 예약과 429/Retry-After, API 입력/Origin 거부를 자동 시험했다. DB 실패 시 원본 삭제 0회, 원본 정리 실패 시 202와 job 보존을 주입했다.
- 실제 독립 `storage:cleanup` CLI로 승인 job 재처리·이미 없는 원본·다른 파일 보존을 검증했다. unsafe locator는 처리하지 않고 job과 실패 종료를 유지한다. 최초 CLI 실행에서 `server-only` import 실패를 발견해 storage를 직접 생성하도록 수정한 후 2건 모두 통과했다.
- Browser에서 삭제 취소·틀린 비밀번호·정답 삭제·직접 content 404 및 Viewer의 404 화면/no canvas를 확인했다. 주입한 202·잘못된 JSON·통신 실패에서 입력 비우기, 결과 불확실 안내 및 자동 재시도 0회를 확인했다.
- 제한: 동시 등록/Current 변경/삭제의 모든 경쟁 순서, 실제 S3 응답 유실과 job 삭제 실패, 모든 공개 경로에 대한 password canary 주입은 별도 미실행이다. 이 항목까지 통과한 것으로 해석하지 않는다. `TC-DELETE-001–008`의 실제 검증 범위는 위 근거와 배포 기록으로 한정한다.

### 게시·운영 적용 및 최종 판정

- 최종 소스 `27a132f6a7d2f1da35fa630c0835b751db350137`를 지정된 origin/main에 정상 push했다. root가 변경/staged diff, `git diff --check` 및 144개 추적/추가 후보 파일의 실제 Secret·runtime 산출물 검사를 수행했으며 위반 0건이었다.
- 해당 소스로 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.17.1`을 빌드·게시하고 인증된 pull을 확인했다. OCI revision은 위 소스와 일치하며 digest는 `sha256:836c23a1fc56215f6d94b891a60f23411a533aecf9bcd09aac852a1e08b77412`이다.
- 기존 앱을 정지한 상태에서 named volume 전체를 Git 제외 경로 `data/backups/issues-0.17.1-20260911/data-before-0.17.1.tar.gz`로 백업했다. archive 222,229 bytes / 파일 3개를 모두 읽어 검사했고 SHA-256은 `980155cf1f104644ef6b7ad95400ea52f0f1c192eb1d56c5e60df661f7c4eaee`이다.
- Compose에서 같은 `cad-layout-viewer-data` 볼륨으로 0.17.1을 실행했다. migration/backfill 완료 후 container healthy, `GET /api/health` 200 및 `status=ok`를 확인했다. 로컬 `.env`의 GHCR_IMAGE도 0.17.1로 고정했다.
- 운영 DB 읽기 전용 비교: 기존 Version 2개/Location 2개, metadata·Current fingerprint 및 원본 SHA/bytes fingerprint가 배포 전후 동일했다. 원본 총 2,234,286 bytes 보존, `integrity_check=ok`, FK 오류 0건이며 기존 두 Version 모두 `1234`로 hash 검증에 성공했다. 운영 도면 삭제 시험은 수행하지 않았다.
- GitHub #2/#3에 각각 변경·시험·제한 요약 댓글을 남기고 `closed/completed` 응답을 확인했다. 댓글 ID는 #2 `5628501839`, #3 `5628502545`이다.
- 기존 의존성 경고는 남아 있다. 이번 `npm audit --omit=dev` 재확인에서 high 4건(`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`), exit 1이었다. 검증한 기능 시험 PASS와 이 경고를 구분하며 자동 major downgrade는 수행하지 않았다.
- Manager 판정: #2/#3 요구 및 DELETE 보완의 검증 범위는 수용한다. 운영 기존 비밀번호 적용·이미지 게시·재배포를 완료했다. 후속은 기존 의존성 경고와 실도면/복잡 DWG 평가이며 이번 완료 판정에 포함하지 않는다.

## U-OBS-20260909 — 폐쇄망 업로드 오류 진단 0.16.0

- 범위: 공개 업로드 진단(요약·상세·복사·JSON 저장), HTTP/프록시/연결 오류 분류, 요청 ID 기반 서버 구조화 로그, 원인 정제·비노출, local/S3 보상 및 Docker logging 설정. DB migration과 업무 데이터는 변경하지 않았다.
- 검증 snapshot: 2026-09-09 (Asia/Seoul), Linux x86_64, Node 22.14.0, package `0.16.0`, Next 16.3.4, Vitest 5.0.0, Playwright 1.63.0, Chromium 1208 executable/SwiftShader. 검증 대상 소스는 이후 `f6923f2`로 커밋·푸시했다.

| 검사 | 실제 결과 |
| --- | --- |
| `npm test` | 16 files / 72 passed / 0 failed / exit 0 |
| `npm run typecheck` / `npm run lint` | 각각 exit 0 |
| `npm run build` | exit 0, production route build 성공 |
| local 전체 E2E | 18 passed / 0 failed / 약 1분 (cleanup 재작업 후 회귀 재실행) |
| `npm run test:s3` | 격리 SeaweedFS 4.45 / 6 passed / 0 failed |
| `npm run test:s3:e2e` | 임시 DB·bucket의 S3 backend / 18 passed / 0 failed / 57.7초 |
| `CAD_E2E_PORT=3111 npm run test:dwg` | 캐시된 공식 Line/Circle sample / 4 passed / 0 failed / 18.7초 (권한 상승 실행) |
| `docker compose -f src/docker-compose.yml config` | exit 0; app logging `local`, `max-size=10m`, `max-file=5` 확인 |
| GHCR 0.16.0 build/push/pull | PASS. OCI revision `f6923f2`, pull digest `sha256:6eafec53e8372a9b289e38bb9d22bc8f50868aad968000c10c5934379368f8dd` 일치 |
| Compose 재배포/health | PASS. 기존 `cad-layout-viewer-data` volume 보존, `ghcr.io/planner77/layoutmanager:0.16.0` 재생성, container healthy, `GET /api/health` 200 |
| `git diff --check` | exit 0 |
| Secret/Runtime audit | `git` 추적 목록·변경 diff와 allowlist pattern scan에서 `.env`·runtime DB/CAD·credential URL·실제 인증값 0건; 테스트용 canary 문자열과 `.env.example` 빈 키만 존재 |

### 요청 ID·단계 수동 확인

- 임시 `/tmp` DB·CAD 저장소와 별도 3131 포트에서 `db:deploy` 및 production server를 실행했다. 정상 POST의 `X-Request-Id`/JSON `requestId`/stdout JSON 로그가 모두 `0a28cce1-e610-42b5-a9d8-869f87b582a1`로 일치했다. `request_received → origin_validation → context_initialization → upload_receive → upload_validation → storage_publish → database_registration → temporary_cleanup → response`의 성공 이벤트와 `status=201`을 확인했다.
- 초기 미지원 확장자 수동 POST의 `X-Request-Id`/JSON `error.requestId`/stdout 로그는 모두 `111f4a4c-e14c-461b-9c57-53434888bca6`로 일치했으나 `temporary_cleanup` 성공 이벤트가 없었다. Developer 재작업 후 추가 통합 시험에서 `upload_validation` 실패·`temporary_cleanup` 성공이 같은 진단 범위로 기록됨을 확인했다.
- 동시에 전송한 두 정상 POST는 `7153ec52-94f1-4332-aaae-100dd8cbdc79`와 `3258b8fd-b047-4645-a892-0677e0dd4e82`를 각각 header/body/log에 유지했다. 단계가 일부 교차해도 ID와 backend가 섞이지 않았다.

### TC-OBS 결과

| TC | 결과 및 근거 |
| --- | --- |
| TC-OBS-001/002 | PASS. 프록시 오류 화면에 고정 필드(시각·버전·코드·상태·서버 ID·안내), 펼침 상세, 텍스트 선택, Clipboard 미지원 fallback, JSON 저장을 확인했다. Clipboard 권한 거부와 긴 내용은 코드 경로·레이아웃을 검토했으며 별도 Browser 주입 시험은 NOT RUN이다. |
| TC-OBS-003 | PASS. 단위 시험과 브라우저 주입으로 413/502/504, HTML·빈·malformed·임의 JSON, 잘못된 2xx, 연결 실패를 분류했다. raw body와 브라우저 예외는 공개 진단에 포함되지 않고, 502/504·연결 실패는 결과 불확실 및 목록 확인으로 안내되며 자동 재업로드는 0회였다. |
| TC-OBS-004 | PASS. 정상/실패 header·body·server ID, 동시 격리와 주요 단계·elapsed/backend를 확인했다. 외부 origin 403 회귀와 요청 시작 시 ID 생성 구조를 확인했으며 context 초기화 실패 주입은 NOT RUN이다. validation·stream 오류 및 malformed multipart 경계에서 실패 단계와 임시 정리 성공 이벤트가 연결된다. |
| TC-OBS-005 | PASS (주입/SeaweedFS). local DB/storage 실패·S3 credential/보상·불확실 COMMIT 경계를 통합 시험했고, 이전 Current·원본과 불확실 object 보존을 확인했다. 실제 운영 장비의 EACCES/ENOSPC와 실제 네트워크 응답 유실은 NOT RUN이다. |
| TC-OBS-006 | PASS. 최초 storage/DB 실패가 cleanup warning으로 덮이지 않고, 확정 등록 뒤 임시 cleanup warning이 있어도 성공이 유지됨을 통합 시험했다. |
| TC-OBS-007 | PASS. canary credential/Authorization URL·경로·SQL·filename·bytes·설명·순환 cause·개행·장문을 sanitizer/unit/E2E로 검사했고 공개 화면·JSON·Console·서버 로그에 노출되지 않았다. 허용된 파일/DB/S3 code와 category는 유지됐다. |
| TC-OBS-008 | PASS. Compose의 `local` 10m×5 설정, stdout 구조화 로그 수집·ID 검색, GHCR 0.16.0 push/pull digest, 기존 named volume 보존 재배포·healthy 상태와 health endpoint 200을 확인했다. 실제 로그 한도 도달·롤오버 자체와 현장 장치/방화벽은 NOT RUN이다. |

### 판정·제한

- 공개 진단과 안전 로그 정제는 수용 가능한 수준이다. `EACCES/ENOSPC/ECONNREFUSED/ETIMEDOUT`, SQLite/Prisma 오류, 허용된 S3 오류는 code/category와 고정 메시지를 남긴다. 코드가 없는 임의 `Error`와 정제할 수 없는 이름·메시지는 `Internal error details suppressed.`로 완전 억제된다. 이는 credential·SQL·원본 보호 요구에는 부합하지만 미분류 오류의 원인을 운영자가 구분할 수 없다는 관측성 제한이 있다. 현행 NFR-OBS-002의 안전 allowlist 정책 안에서는 허용하되, 주요 앱/라이브러리 오류를 안전 코드로 매핑하는 보완 여지를 Known Issue로 남긴다.
- 재작업 결과: Developer가 `CadStorage.receive`의 validation·stream 오류 cleanup 성공 이벤트를 추가했고 관련 통합 테스트를 보강했다. 재시험에서 두 경계 모두 `temporary_cleanup: success`가 확인되어 NFR-OBS-001/TC-OBS-004를 VERIFIED로 판정한다. QA는 코드를 수정하지 않았다.
- 재작업 재시험 명령: `npm test -- tests/integration/upload.test.ts tests/unit/upload-observability.test.ts`는 2 files / 22 passed / 0 failed, `npm test` 전체는 16 files / 72 passed / 0 failed, typecheck/lint/diff-check 및 local 전체 E2E 18개도 재통과했다.
- 실제 폐쇄망 장애, 프록시 운영 로그, Docker 로그 순환 한도 도달과 실제 현장 장치/방화벽 접근은 이 기록의 PASS가 아니다. GHCR 게시·pull과 단일 Compose 재배포/health는 위 digest 및 실행 결과로 확인했다. `prepare:dwg-samples` 재다운로드는 `raw.githubusercontent.com` DNS `EAI_AGAIN`으로 실패했으며, DWG 시험은 기존 checksum 캐시 샘플로 실행했다.
- 추적: FR-OBS-001/002 → `diagnostics.ts`·`upload-form.tsx` → TC-OBS-001–003/007 → PASS. NFR-OBS-001 → `upload-observability.ts`·route·upload/storage → TC-OBS-004–006 → VERIFIED. NFR-OBS-002 → sanitizer/client diagnostic → TC-OBS-007 → PASS. NFR-OBS-003 → Compose/Operation → TC-OBS-008 → VERIFIED (로그 한도 도달·현장 접근은 별도 미검증).

## U8B-20260909 — DWG 계측 확장 0.15.0

- Manager/Developer 에이전트는 사용량 제한으로 실행하지 못해 root가 구현·검증을 대행했다. 이 사실과 범위 제한을 기록한다.
- `libredwg-web` Adapter가 Worker의 WASM 초기화(`initializeMs`) 및 DWG 파싱(`parseMs`) 시간을 공통 Metrics에 전달한다. 변환 시간과 GPU/WASM 메모리는 아직 별도 수집하지 않는다.

| 검사 | 실제 결과 |
| --- | --- |
| `npm test` | 14 files / 53 passed / 0 failed |
| `npm run typecheck` / `npm run lint` | 각각 exit 0 |
| DWG Adapter metric 단위 시험 (`TC-MET-002`) | PASS |
| 등록 DWG Browser metric stage assertion | 4 passed / 0 failed (공식 Line/Circle sample, 오류·재진입 포함) |
| `npm run build` | exit 0 (`experimental.useTypeScriptCli: false`로 Next API 검사 경로 사용) |

- 실제 업무 DWG, 대형 파일 반복 비교, GPU/WASM 메모리 및 장기 메모리 시험은 NOT RUN이다. 기존 평면 LINE/20 MiB와 제외 Entity partial 범위를 유지한다.
- Manager/Developer 사용량 제한으로 root가 구현·검증을 대행했으며, 해당 역할을 수행한 것으로 기록하지 않는다. Unit 8B의 자동화 Acceptance Criteria는 충족했다.

### 0.15.0 Docker 이미지

- `7bcc872` 기준 `ghcr.io/planner77/layoutmanager:0.15.0`을 linux/amd64로 빌드했다.
- GHCR push 및 인증된 pull 성공. registry digest: `sha256:2d9cf30ad176375e5459568d90121175133109d6ac496234c227ea11eaeff67c`.
- OCI revision label은 `7bcc872`이며 임시 Docker 인증 설정은 검증 후 삭제했다. 익명 pull/visibility 변경은 수행하지 않았다.

## U9B-20260909 — DWG 통합·회귀

- 등록 DWG의 원본 API→`libredwg-web` Adapter→Worker/WASM→canvas 흐름과 DXF/DWG renderer 선택, 직접 링크, 오류·재진입·Dispose를 검증했다.

| 검사 | 실제 결과 |
| --- | --- |
| DWG 전용 E2E (`test:dwg`) | 4 passed / 0 failed |
| 기존 관리·DXF·링크 E2E | 16 passed / 0 failed |
| 20회 Viewer 전환 (`switch.spec.ts`) | passed, 잔여 Worker/canvas 없음 확인 |
| Unit/typecheck/lint/build | 각각 53 passed / exit 0 / exit 0 / exit 0 |

- 검증 환경은 Chromium/SwiftShader, 임시 DB·Storage, 공식 AutoCAD 2000 Line/Circle fixture이다. 실제 업무 도면 fidelity, 대형 파일 SLA, GPU/WASM 메모리 및 장기 메모리 측정은 NOT RUN이다.
- Manager/Developer 사용량 제한으로 root가 실행을 대행했으며, 미실행 역할을 수행한 것으로 기록하지 않는다. U8B·U9B 자동화 범위는 완료 승인 가능하다.

## U-DESC-20260909 — 도면 설명 등록·검색 0.14.0

- 구현 범위: Version별 선택 설명(최대 2,000 UTF-16 code units), trim/NFC/CRLF 정규화, plain-text 목록·Viewer 표시, literal 부분검색과 기존 조건 AND 조합, 기존 행 기본값 호환.
- 실행 역할: Manager/Developer가 사용량 제한으로 중단되어 root가 인계 구현·검증했으며 Luna QA가 사전 Acceptance Criteria 검토를 완료했다. 역할을 수행하지 않은 것으로 기록하지 않는다.

| 검사 | 실제 결과 |
| --- | --- |
| `npm --prefix src test` | 14 files / 52 passed / 0 failed |
| `npm --prefix src run typecheck` / `lint` | 각각 exit 0 |
| `npm --prefix src run build` | exit 0 |
| 설명 UI/API E2E (`upload.spec.ts`) | 4 passed / 0 failed, 12.0초 |

- `CadFileVersion.description` additive migration(`202609090001_description`)은 NOT NULL DEFAULT `''`로 기존 Version/Current/storage/original을 보존한다.
- HTML 문자열은 React text node로 표시되며 실행되지 않는다. SQL 검색은 `instr` bound parameter로 `%`, `_`, 따옴표를 literal 처리한다.
- 단위·통합 검증은 완료했으며, 전체 브라우저 회귀는 기존 배포 이후 변경 범위에 맞춰 다음 회귀 실행에서 확인한다.

## U-DESC-IMAGE-20260909 — GHCR 0.14.0 이미지 갱신

- 최종 소스 커밋 `23a1d85` 기준으로 최신 Dockerfile을 사용해 `ghcr.io/planner77/layoutmanager:0.14.0`을 재빌드했다. `better-sqlite3` 사전 빌드가 없는 환경에서도 `python3/make/g++` 기반 node-gyp 대체 빌드가 가능하도록 빌드 단계를 보강했다.
- GHCR push 및 인증된 pull을 모두 성공했으며 registry digest는 `sha256:8b58e880240da55c893d3ecf692c243f5fa1c10cf312c04672359f2a048f6152`로 일치했다.
- 이미지 OCI revision label은 `23a1d85`이며, pull 검증 후 임시 Docker 인증 설정을 삭제했다. 익명 공개 pull이나 package visibility 변경은 수행하지 않았다.

## U-DEPLOY-20260908 — Docker 배포 0.13.0

- Source: LINK commit 25adc5e 이후 Unit DEPLOY snapshot. Manager 설계/리뷰와 Sol Developer 구현/재작업 완료. Luna QA 사용량 제한으로 root가 실제 실행, Manager가 결과 검토·문서화를 대행한다.
- 환경: Linux x86_64, Node22.14.0, Docker Compose5.5.1. 기존 사용자data/SeaweedFS와 분리된 시험 container/volume, container published3110 및 host앱3100을 사용했다.

| 검사 | 실제 결과 |
| --- | --- |
| Compose config | `--env-file /dev/null config --quiet` 및 예제 env 설정 검사 PASS |
| Root typecheck/lint/build | 각각 PASS |
| Root 자동 테스트 | 51 passed / 0 failed, 13.07초; health200/503/no-store/status-only2개 포함 |
| Root 전체 local E2E | 16 passed / 0 failed, 1.2분 |
| Docker image build | PASS, native SQLite/npm/Prisma/Next build 성공; 최종 게시 image/digest는 아래 후속 결과로 확정 |
| Container 보안/자산 | UID10001, `.env`/`.git`/Git환경변수 없음, 한글 font와 LibreDWG WASM 존재 확인 PASS |
| Container 기본 흐름 | DXF 업로드201, 원본 조회 bytes 일치 PASS |
| 접속 | host앱3100과 container3110 각각 localhost 및 hostIP로 `/api/health`200 PASS |

- 최초 smoke의 WASM 확인은 잘못된 최상위 경로를 검사해 실패했다. 실제 복사 구조의 하위 경로를 재귀 검사해 자산 존재를 확인했으며 앱 수정은 없었다.
- hostIP 시험은 같은 호스트에서 자신의 네트워크 IP로 접근한 결과다. 별도 물리 장치/VPN/방화벽을 통과한 시험으로 확대 해석하지 않는다.
- FR/NFR 추적: NFR-DEPLOY-001 → Dockerfile/Compose/run.mjs/health route → TC-DEPLOY-001/002/004 → 현재 근거 PASS. 영속성 TC-DEPLOY-003 결과는 아래에 기록했으며 GHCR push/pull TC-DEPLOY-005 결과도 아래에 확정했다.
- 최종 실행 검증일: 2026-09-09 (Asia/Seoul). 작업 추적 ID U-DEPLOY-20260908은 시작일 기준으로 유지한다.
- Container Browser: dxf-viewer 표시/확대, three-dxf-viewer 표시/확대, 실제 DWG canvas 표시 모두 PASS; pageerror 0. 기존 planar LINE/20 MiB 제약 안에서 확인했다.
- TC-DEPLOY-003: 동일 격리 volume으로 container를 재생성한 후 DB Version/Current 및 원본 byte 일치 PASS. 기존 사용자 volume은 사용하지 않았다.
- 최종 root Secret/산출물 검사 121 candidates / 0 violations, diffcheck PASS.
- 소스 승인 이후 Docker source commit `d80a9a6519168eef162b883b73deb1ad03a72aca`를 원격에 push하고 clean 상태를 확인했다. 최종 image의 OCI revision은 동일 commit이며 검증한 runtime layer를 cache로 재사용했다.
- TC-DEPLOY-005: `ghcr.io/planner77/layoutmanager:0.13.0` GHCR push PASS, 이어서 인증된 계정의 pull PASS. 양쪽 digest는 `sha256:7cf148fc44def77fad17e1925a5875558fd8dcfef5ab5d4aba56651556cd67e4`로 일치했다. 익명 공개 pull은 시험하지 않았으며 visibility를 임의 변경하지 않았다.
- Image 플랫폼 `linux/amd64`, 로컬 image size 1,909,062,456 bytes. Prisma migration CLI와 기존 개발 dependency를 포함한 P.O.C. 구성으로 크기 최적화는 이번 범위에서 수행하지 않았다. 이 값은 압축된 registry 전송량이 아니다.
- 추가 실행 점검: container healthy, hostIP3110의 홈/등록 HTTP200. 시험 container와 volume을 정리했으며 실제 앱3100은0.13.0/모든 인터페이스 수신으로 유지했다. 최종 localhost/hostIP3100 health 모두200, 시험 container 목록 비어 있음 확인.
- Manager 최종 판정(2026-09-09): TC-DEPLOY-001–005 및 기존 회귀 근거를 검토해 Unit DEPLOY 구현·컨테이너 실행·GHCR 게시를 **완료 승인**한다. 최종 게시 결과만 별도 문서 commit으로 원격 반영한다.
- 기존 `.env`/DB/CAD/SeaweedFS 서비스 변경 없음, 기존 hostdata 자동 migration 없음. 이미지 안의 단일 SQLite 구조와 S3 임시 디스크 요구는 유지한다.

## U-LINK-20260908 — Version 직접 링크 0.12.0

- Source: e947aac 이후 이 기록을 포함한 Unit LINK commit snapshot. DB schema, storage, 기존 원본 변경 없음.
- 실행 역할: gpt-6-astra Manager 설계/리뷰 → gpt-5.6-sol Developer 구현 및 보고 → gpt-5.6-luna QA 테스트 보강/검증/문서 초안 → Manager 재작업 판단. QA 사용량 한도 도달 후 root가 Browser 검증을 실행하고 Manager가 결과·문서를 최종 검토했다. 미실행 역할을 수행한 것으로 기록하지 않는다.

| 검사 | 실제 결과 |
| --- | --- |
| QA `npm --prefix src test` | 13 files / 49 passed / 0 failed |
| QA `typecheck`, `lint`, `build` | 각각 exit 0 |
| 최초 QA Browser 실행 | sandbox localhost3101 bind EPERM, 이후 escalation 대기 중단; 시험 결과 없음 |
| Root 전체 local E2E 최초 | 14 passed / 1 failed, 1.5분. 실패는 QA 시험에서 원래 page 링크를 클릭하고 다른 page navigation을 기다린 잘못된 대상 선택 |
| QA 시험 수정 후 Root LINK 재시험 | 3 passed / 0 failed, 8.0초. runtime 코드 변경 없이 기다릴 page 수정 |
| Root DWG E2E | 4 passed / 0 failed, 19.4초. 공식 LINE sample 직접 링크 새 context 표시 포함 |

- FR-LINK-001 → viewers/core/link.ts, features/cad-link/CopyCadLink, CadTable/CadViewer → TC-LINK-001–003 → PASS. 4개 URL 단위 시험, 목록/Location 복사, DXF 양쪽 renderer 새 context, Current 교체 이후 기존 Version 고정, Clipboard 거부/미지원 및 fallback 클릭을 검증했다.
- 손상 DWG LINK 시나리오는 renderer 라우팅/오류 경로만 확인한다. 실제 DWG 렌더링 근거는 dwg-viewer.probe의 공식 LINE sample로 분리한다.
- Browser: 기존 Chromium/SwiftShader, 임시 DB/Storage와 localhost3101. 최종 source audit/commit/push 및 변경 후 typecheck/lint는 release 담당 root가 확인한다.
- 한계: 실제 다른 장치/업무 도면/공개 운영 URL은 이 Unit에서 시험하지 않았다. localhost는 수신 장치 자체이며 사설 IP는 해당 앱에 대한 네트워크 접근이 필요하다. 링크에 권한 부여/공개 token/스토리지 주소 기능은 없다. DWG 평면 LINE/20 MiB 기존 제한 유지.

## U-S3-20260908 — SeaweedFS 등 S3 호환 저장소 0.11.0

- 사용자 요청: SeaweedFS와 같은 S3 호환 object storage 활용. Source: b050535 이후 이 기록을 포함한 `feat(storage)` commit snapshot.
- 신규 dependency: @aws-sdk/client-s3 3.1127.0 고정(25개 package 추가). DB schema/migration 및 기존 데이터 이동 없음. storage_path에 S3 locator 의미를 추가하고 기존 local key와 혼합 조회한다.
- 실제 `.env`/Git credentials/기존 SeaweedFS 서비스는 변경하지 않았다. 동작 backend를 안전하게 확인한 결과 local. 로컬 3100은 0.11.0으로 재시작했다.

### 실제 검사

| 명령 / 검사 | 결과 |
| --- | --- |
| `npm --prefix src run typecheck` / `lint` | 각각 exit 0 |
| `npm --prefix src test` | 12 files / 45 passed / 0 failed, 16.43초 |
| `npm --prefix src run build` 최종 | exit 0, 기존 모든 route와 S3 서버 코드 build 성공 |
| `npm --prefix src run test:s3` 최종 | 6 passed / 0 failed, 3.89초 |
| `npm --prefix src run test:s3:e2e` | 실제 S3 backend로 12 passed / 0 failed, 1.6분 |
| 기존 local `test:e2e` | 12 passed / 0 failed, 1.3분 |
| 기존 local `test:dwg` | 4 passed / 0 failed, 29.2초 |
| Local 3100 smoke | 홈/등록 HTTP 200, 0.11.0 marker 확인 |
| Secret/런타임 제외 | 111 candidates / 0 violations |
| 임시 컨테이너 정리 | cad-s3-test-* 실행 컨테이너 잔여 0 |

환경: Linux x64, Node 22.14.0, Playwright 1.63.0/Chromium 145.0.0.0/SwiftShader, viewport 1440×1000, worker 1. Chromium executable은 기존 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. SeaweedFS **4.45**, 고정 digest `sha256:fc9f76fa993ad69966ffeb2f65d0318fcae39c6f8e20cf68ef7b3a5cb97769e5`. 기존 서비스와 분리된 임시 Docker 컨테이너, random loopback port, random credentials, 전용 임시 bucket을 사용했다. DB/임시 upload도 `/tmp` 격리 경로이다.

### 요구사항 → 코드 → Test → 결과

| 요구 / TC | 구현/시험 | 실제 확인 |
| --- | --- | --- |
| FR-STORAGE-001 / TC-S3-001 | ConfiguredCadStorage/S3ObjectStorage, storage.s3.ts | DXF·binary DWG byte 일치, 파일 크기/SHA-256 일치, 중복 hash 새 Version, Current 교체 |
| FR-STORAGE-002 / TC-S3-001 | locator routing, storage.s3.ts | 기존 local 원본을 S3 모드에서 조회; 이전 S3 원본을 local 모드 및 신규 bucket 설정 후에도 저장된 bucket 기준 조회 |
| FR-STORAGE-003 / TC-S3-002/003 | uploadCad prepare, storage.s3.ts | repo.register 진입 전에 remote object 존재. DB 실패 후 새 object만 삭제, 기존 object/Current 보존 |
| FR-STORAGE-003 / TC-S3-002 | storage.s3.ts | 실제 COMMIT 후 응답 실패를 주입해 DB 행과 원본이 남는 것 확인. 보상 DELETE 실패는 orphan을 보존하고 CAD_UPLOAD_CLEANUP_PENDING 기록, local staging 제거 |
| FR-STORAGE-003 / TC-S3-002 | S3 adapter, storage.s3.ts | 잘못된 credential은 안전한 503 및 DB 행 0, 없는 key 404, traversal locator 거부 |
| FR-STORAGE-003 / TC-S3-002 | actual SeaweedFS PutObject | 기존 key에 If-None-Match=* PUT은 HTTP 412, 기존 bytes 유지. DeleteObject 후 NoSuchKey 404 확인 |
| FR-STORAGE-001/003 / TC-S3-003 | storage-config.test.ts / env.mjs | local 기본값, 누락 S3 설정·잘못된 backend·credential URL·잘못된 timeout/path-style 거부 |
| FR-STORAGE-001, NFR-TEST-001 | test:s3:e2e | 실제 S3를 사용하는 UI 등록→목록/검색→Current 교체→원본 API→두 DXF Viewer/전환20회·한글·오류·계측 전체 흐름 PASS |
| NFR-TEST-001 | local E2E + DWG suite | 기존 local 경로 및 등록 DWG 직접 렌더링/기본 탐색·오류·취소 회귀 PASS |

S3 시험의 최초 5개도 통과했다(2.91초). 보상 DELETE 자체의 실패를 추가한 최종 6개 결과를 위 표에 기록했다. S3와 local Browser 결과를 별도로 기록하며 중복 실행을 고유 Test Case 수로 합산하지 않는다. 웹 suite의 NO_COLOR/FORCE_COLOR 메시지는 환경 경고이며 실패가 없었다.

### 발견 및 조치

- Node WebStream과 DOM WebStream의 타입 정의 차이로 Type Check가 실패했다. 기존 Node 파일 스트림의 WebStream 변환 지점에서 공통 byte-stream 계약을 명시하여 해결했다. 실제 local/S3 HTTP body 시험 통과.
- 기본 E2E가 실제 사용자 S3 설정을 물려받지 않도록 local backend를 명시했다. S3 E2E는 전용 launcher가 임시 endpoint/credentials와 opt-in 값을 함께 주입한다.
- 실제 Secret/업로드 원본/SQLite/생성 CAD/임시 S3 credential 파일은 커밋하지 않는다. S3 오류는 원본 exception/Authorization/credential URL을 UI/log에 출력하지 않고 안전한 code/message로 변환한다.
- 설정 검토에서 명시적으로 비운 S3 session token이 .env 값으로 복원될 수 있는 우선순위를 보완했다(nullish override). 해당 단위 시험을 추가하여 최종 자동 시험 45개 및 Build/Type/Lint 통과. 앞선 44개 실행도 통과했으며 Browser 경로 변경은 없다.
- 초기 설치 npm audit는 기존 high 4개를 보고했다. 강제 dependency 교체는 하지 않았다.

### 범위·제한·다음 단계

- 지원 검증 제품은 SeaweedFS 4.45이며 AWS/MinIO/다른 S3 제품 전체를 실행 검증했다고 주장하지 않는다. custom TLS CA, 가상 host-style, 대형 파일 throughput/timeout, versioned/object-lock bucket의 영구 정리 정책은 별도 환경 검증 대상이다.
- 현재 단일 S3 endpoint를 사용한다. 설정 변경만으로 endpoint 간 기존 데이터를 이전하지 않는다. bucket은 locator에 기록하며 기존 bucket 조회 권한을 유지해야 한다.
- SQLite와 임시 upload는 local disk를 계속 사용한다. 자동 bucket 생성/파일 migration/orphan sweeping/browser presigned upload는 미제공이다. PUT 응답 유실은 실제 network fault로 재현하지 않았으며 코드에서 불확실 object를 무조건 지우지 않도록 처리했다.
- 실제 서비스는 local 기본값 유지. 사용자는 `.env.example`의 CAD_STORAGE_BACKEND/CAD_S3_*를 설정해 활성화할 수 있다. 상세 전환/복구 계약은 Database/Operation을 참조한다.
- 요청 Unit S3 완료 기준 충족. 기존 DWG LINE/20 MiB 제한과 원격 메모 요청 #2는 유지하며 다음 승인 단계는 Unit 8B DWG 계측/평가이다.

## U7B-20260908 — 등록 DWG Viewer 통합 0.10.0

- Source: 6ef6095 이후 이 결과를 포함한 `feat(viewer)` 커밋 snapshot. 앱 버전 0.10.0, 기존 exact dependency와 DB Schema 변경 없음.
- 범위: 등록 DWG 원본 ID API→LibreDwgWebAdapter→전용 Worker/WASM→직접 평면 LINE 렌더링. 확대/축소/Pan/Fit/Resize·재시도·부분 표시·오류/취소를 공통 UI에 연결했다. DWG에 두 DXF Viewer 버튼을 제공하지 않고 조작 query도 DWG 전용 Adapter를 선택한다.
- 환경: Node 22.14.0/Linux x64, Playwright 1.63.0/Chromium 145.0.0.0/SwiftShader, 기본 viewport 1440×1000, resize 1100×800, worker 1. 실제 DWG는 U7A에 기록한 공식 고정 AutoCAD 2000 Line.dwg/circle.dwg(동일 SHA-256). Browser 시험은 실행별 임시 DB/Storage·3101, 기존 사용자 데이터에 파일을 등록하지 않았다.

| 검사 | 실제 결과 |
| --- | --- |
| Type Check / Lint | 각각 exit 0 |
| Vitest `npm --prefix src test` 최종 | 11 files / 43 passed / 0 failed, 9.49초 |
| Production Build | exit 0, 등록 Version Viewer 및 /lab/dwg 정상 build |
| `test:dwg` | 4 passed / 0 failed / 0 skipped, 15.2초 |
| `test:e2e` | 12 passed / 0 failed / 0 skipped, 51.2초 |
| Local 3100 | 0.10.0 재시작, 홈/등록/WASM HTTP 200 및 버전 문구 확인 |
| Secret/산출물 제외 | 103 commit candidates / 0 violations |

명령은 Operation을 따른다. Browser executable은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. 초기 Type Check/Build는 DB format의 String→ViewerFormat 할당 오류로 실패했다. 서버 페이지에서 실제 DXF/DWG 값 검증 후 narrowing하도록 수정하여 최종 검사 통과했다. 42개 자동 시험 실행 후 한도/헤더/해제 후 입력 거부 시험을 추가해 최종 43개를 실행했다.

### 요구사항 → 구현 → Test Case → 결과

| 요구 / TC | 코드 | 실제 검증 |
| --- | --- | --- |
| FR-LIST-003, FR-VIEWER-005, FR-UI-001 / TC-E2E-002 | cad-table, version viewer page, CadViewer, dwg-viewer.probe.ts | 실제 DWG UI 등록→목록/검색/Current 표시→도면 보기→LINE 표시. 선택 Version ID·계측 renderer/Entity 수 일치, 원본 bytes 동일 |
| FR-VIEWER-001 / TC-VIEW-001 | core/selection.ts, Manager format, dwg-adapter.test.ts | DWG에 DXF query를 전달해도 LibreDWG만 선택, 두 DXF 버튼 없음. DWG Manager에 DXF 요청 시 factory 미호출 |
| FR-VIEWER-006 / TC-VIEW-002 | libredwg-web/line-view.ts, dwg-viewer.probe.ts | 확대/축소/Fit·Pan의 canvas 픽셀 변화 및 Fit 복구, Resize canvas 크기 일치 |
| FR-VIEWER-008 / TC-DWG-003 | adapter/probe/line-view, dwg-viewer.probe.ts | 3회 다시 불러오기 후 canvas 1개/Worker 0, 화면 이탈 canvas 0, 재진입 성공, 지연 WASM 처리 중 이탈 시 Worker 1→0 및 늦은 canvas 없음 |
| FR-VIEWER-008 / TC-DWG-003 | dwg-adapter.test.ts | cancel 반복은 terminate 1회/AbortError; 60초 timeout은 terminate 후 실패. timeout은 fake timer 단위 시험이며 실제 60초 대기는 하지 않음 |
| FR-ERROR-001 / TC-DWG-002/004 | adapter/UI, dwg-viewer.probe.ts | 미지원 헤더/손상 DWG 실패, CIRCLE 제외 건수/partial, 원본 404/WASM 404 안내 및 해제 후 retry 성공 |
| FR-ERROR-001 / TC-DWG-002 | dwg-adapter.test.ts | 빈 입력/20 MiB 초과/잘못된 헤더/Dispose 이후 입력은 Worker 생성 전 거부 |
| NFR-PERF-001 | core/metrics.ts + Manager | 제외 Entity는 result partial+reasons.coverage; LINE 0개이면 firstDisplayMs null, 거짓 전체 성공 없음. 상세 DWG stage 계측은 8B |
| NFR-TEST-001 | 기존 전체 회귀 및 dwg.probe.ts | DXF 등록/Current/두 Renderer·전환20회/글꼴/계측/오류와 DWG 독립 실험 모두 PASS |

`src/dwg-test-results/registered-dwg.png`(Git 제외)를 시각 확인했다. libredwg-web 단독 표시, 실제 LINE과 탐색 도구·한도 설명을 확인했다. 기준 CAD 프로그램과 정밀한 실도면 fidelity 비교는 수행하지 않았다. 별도 장기 메모리 시험 없이 Worker 수/canvas 해제만 관찰했으므로 전체 GPU/JS 메모리 누수 없음으로 해석하지 않는다.

### 운영 및 제한

- 이전 0.9.0 프로세스를 종료할 때 webpack-runtime의 undefined.call 오류 로그가 있었다. 동일 `.next`에 새 Build를 쓰는 동안 기존 프로세스가 남아 있었으며 모듈 혼용 가능성이 있다. 새 0.10.0 프로세스로 재시작 후 홈/등록/WASM smoke 정상. Operation에 단일 workspace의 기존 start 중지→build→start 순서를 기록했다.
- planar LINE/20 MiB 범위 유지. Parser가 읽은 CIRCLE은 자체 renderer에서 제외하며 이를 parser 미지원으로 분류하지 않는다. TEXT/BLOCK/곡선·Layer/style/색상·선종류/전체 Entity는 미지원 또는 미검증. AutoCAD 2000 이외 revision/실도면/대형 성능·장기/저메모리 장비 시험은 NOT RUN.
- 공통 metrics schemaVersion 1에 result partial enum 추가. JSON 소비자는 이를 허용해야 한다. DWG 순수 parse 계측은 공통 UI에서 아직 null이며 상세 init/parse/convert와 비교는 Unit 8B이다.
- DB·업로드 원본·migration 불변, DWG→DXF 변환 없음. 20 MiB보다 큰 파일의 등록 가능 여부는 기존 Upload 설정을 따르고 Viewer는 별도 제한 안내를 한다.
- 기존 의존성 high 경고와 원격 이슈 #2 메모 요청은 후속. 이번에 library 변경이나 audit 재실행은 하지 않았다.
- Unit 7B의 최소 지원 범위 통합 기준 충족. 전체 업무 DWG/P.O.C. 최종 완료와 구분하며 다음 승인 Unit은 8B 계측 및 평가이다.

## U7A-20260908 — libredwg-web 실제 DWG 최소 실험 0.9.0

- Source: 1277f00 이후 이 결과를 포함한 `feat(dwg)` 커밋 snapshot. 신규 고정 dependency @mlightcad/libredwg-web 0.7.10(GPL-3.0), 기존 Next/Three/DXF 버전 및 DB Schema 불변.
- 범위: 독립 `/lab/dwg`의 로컬 파일→전용 Worker→WASM→DWG model-space 객체→자체 planar LINE renderer. 등록 Version 화면 통합은 아직 구현하지 않았다. DXF 변환/두 DXF Viewer를 호출하지 않는 import/data 흐름을 검토했다.
- 환경: Node 22.14.0, Linux x64, Playwright 1.63.0, Chromium 145.0.0.0/SwiftShader, viewport 1440×1000, worker 1. Production E2E는 실행별 임시 DB/Storage/3101. 사용자 DB/원본에 시험 데이터를 추가하지 않았다.

### 실제 검사

| 검사 | 결과 |
| --- | --- |
| Type Check / Lint | 각각 exit 0 |
| Vitest `npm --prefix src test` | 10 files / 39 passed / 0 failed, 10.49초 |
| Production Build | exit 0, `/lab/dwg` 생성 및 SSR Browser API 오류 없음 |
| 기존 `test:e2e` | 12 passed / 0 failed / 0 skipped, 59.4초 |
| `prepare:dwg-samples` | 공식 2개 파일 SHA-256 일치 |
| 최종 `test:dwg` | 2 passed / 0 failed / 0 skipped, 7.9초 |
| Local 3100 smoke | 0.9.0 서버 재시작, `/lab/dwg` 및 WASM HTTP 200 |
| 후보 Secret/산출물 검사 | 99 candidates, 0 violations; CAD/생성 ESM/WASM/DB 미추적 |

실행은 Operation 명령을 사용하며 Chromium executable은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. DWG 최초 Browser 실행도 2 passed(8.9초)였다. DXF 실행이 DWG 캡처를 지우지 않도록 별도 `dwg-test-results` 경로로 분리 후 최종 재실행했다.

### 샘플 및 재현성

출처는 [공식 고정 커밋의 AutoCAD 2000 시험 데이터](https://github.com/mlightcad/libredwg-web/tree/5909bd2bb87fa1168838e1295188f3ee603618eb/test/test-data/2000). 실제 CAD bytes를 다운로드하여 시험했으며 mock DWG가 아니다. 원본은 `src/node_modules/.cache/cad-dwg-samples`에만 저장하고 Git에 넣지 않았다. `scripts/dwg-samples.mjs`에서 URL revision과 hash를 고정한다.

| 파일 | bytes | SHA-256 | 결과 |
| --- | --- | --- | --- |
| Line.dwg | 174005 | 358fc09c7c27737ba3b500eac122caee4c83c270f5ccb8a9f7f8f3d4b763d937 | 실제 model-space LINE 1개, 직접 화면 표시 |
| circle.dwg | 177345 | d2c2e592c4d501aa416bf41383b8067f7f72c32af558d1dea8481bb7d884b6dc | CIRCLE 파싱됨, renderer 미지원 건수 및 LINE 없음 표시 |

### 요구 → 코드 → TC → 결과

| 요구 / TC | 구현·시험 | 실제 결과 |
| --- | --- | --- |
| FR-VIEWER-005 / TC-DWG-001/005 | viewers/libredwg-web/{worker,primitives,line-view}; tests/e2e/dwg.probe.ts | Worker에서 raw DWG 직접 파싱, LINE 1개 표시 및 확대 후 canvas 픽셀 변화. 정적 asset HTTP 200/application/wasm |
| FR-VIEWER-008 / TC-DWG-003 | worker finally, probe.cancel; dwg.probe.ts | 3회 load 각각 원본 pointer raw.dwg_free 호출 완료, FS 임시 파일 없음, active Worker 0. 반복 시 canvas 1개, 해제 버튼 후 canvas 0 |
| FR-ERROR-001 / TC-DWG-002/004 최소 subset | worker 안전한 stage 오류, dwg.probe.ts | 손상 DWG 실패, WASM 404 초기화 실패, 결과 데이터/성공 canvas 없음 |
| FR-VIEWER-007 최소 subset | linePrimitives; unit/dwg-primitives.test.ts | CIRCLE/숨김/비평면/PaperSpace/비유한 LINE 제외 건수 확인. 지원하지 않는 기하를 표시했다고 주장하지 않음 |
| NFR-TEST-001 | 기존 tests 전체 | DXF 관리/Current/전환/한글/오류/계측 회귀 PASS |

수동 시각 확인: Browser 캡처에서 청록색 대각선 LINE과 결과 `lineCount=1`, `freed=true`, `temporaryFileRemoved=true`를 확인했다. 생성 캡처는 Git 제외 `src/dwg-test-results/dwg-line-probe.png`. 기준 CAD 프로그램 화면과의 정밀 fidelity 대조는 NOT RUN이다. 최초 실행 캡처 3회차에서 init 167.4ms / parse 61.5ms / convert+primitives 28.4ms를 관찰했으나, 반복 성능 비교 설계에 따른 통계가 아니므로 성능 판정에 사용하지 않는다.

### 발견·수정 및 한계

- 초기 Type Check: 배포본의 locateFile 파라미터와 FS.analyzePath 2번째 인자에 맞춰 타입/호출 수정 후 통과.
- 초기 Build: Emscripten의 guarded `node:module` import를 Webpack이 처리하다 UnhandledSchemeError. upstream 코드는 수정하지 않고 고정 ESM/glue/WASM을 local public asset으로 준비해 Worker에서 native dynamic import하도록 수정 후 Build/Browser 통과.
- README 예제의 free 대상 표현보다 설치 배포본 타입/소스를 우선했다. 변환된 JS database가 아닌 원래 DWG pointer를 raw.dwg_free에 전달한다. FS.unlink/free 이후 결과를 전송하고 main에서 Worker를 terminate한다.
- parser는 CIRCLE을 읽지만 이번 자체 renderer는 LINE만 그린다. 이 차이는 LibreDWG parser 미지원으로 분류하지 않는다. layer/style/color/선종류/두께/BLOCK/TEXT/곡선은 후속 renderer 범위이다.
- raw parser nonzero flags는 이 실험에서 모두 실패로 처리한다. 경고 수준과 부분 로드 허용 정책은 7B에서 실제 API 및 샘플로 확장한다.
- npm package 빌드 옵션 INITIAL_MEMORY=1GB; Worker 종료/포인터 해제가 즉시 OS 메모리 회수 또는 누수 없음의 증거는 아니다. 장기/대형/저메모리 장비 및 다른 DWG revision은 NOT RUN.
- install의 기존 high severity 4개 경고 유지. 라이브러리 의존성 교체·강제 audit fix는 수행하지 않았다.
- Unit 7A 최소 실험 기준 충족. 다음 Unit 7B에서 등록 Version 원본 API→LibreDwgWebAdapter→화면을 연결한다. 전체 업무 DWG 지원이나 P.O.C. 최종 완료로 판정하지 않는다. 원격 이슈 #2 메모는 별도 후속 요청이다.

## U9A-20260908 — DXF 통합·회귀 및 릴리스 검증

- Version: 0.8.0 유지. Source: e9339a3 위에 이 결과를 포함한 `test(release)` 커밋 snapshot. 앱 기능·라이브러리·DB Schema 변경 없음.
- 환경: Node 22.14.0, Linux x64, Playwright 1.63.0 / Chromium 145.0.0.0, SwiftShader, 1440×1000, worker 1. Unit 8A와 동일 설정. 실행별 임시 SQLite/Storage 및 3101 Production 서버 사용; 기존 사용자 데이터에 시험 파일을 등록하지 않았다.

| 검사 / 명령 | 실제 결과 |
| --- | --- |
| `npm --prefix src run typecheck` | PASS, exit 0 |
| `npm --prefix src run lint` | PASS, exit 0 |
| `npm --prefix src test` | 9 files / 38 passed / 0 failed, 14.80초 |
| `npm --prefix src run build` | PASS, exit 0; 등록·목록·상세·Viewer 및 API route 생성 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=… npm --prefix src run test:e2e` | 12 passed / 0 failed / 0 skipped, 1.1분 |
| Schema review | schema.prisma/migration/Database.md의 Column/Null/Default/FK/Unique/Index 대조; TC-DB-007 PASS, Schema 변경 없음 |
| Secret/런타임 제외 검사 | 88 commit 후보, 위반 0; 실제 env 값 비출력 |
| `git diff --check` | PASS, exit 0 |

Chromium 실행 파일은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. 환경별 경로는 Operation에 따라 지정한다. E2E의 FORCE_COLOR/NO_COLOR 경고는 실행 환경 경고이며 실패는 없었다.

### 요구사항 → 구현 → 실행 근거

| 요구 / TC | 실행 코드 | 실제 확인 |
| --- | --- | --- |
| FR-CAD-001/003, FR-VERSION-002/003, FR-LIST-003, FR-UI-001 / TC-E2E-001 | tests/e2e/workflow.spec.ts | UI에서 동일 Location V1/V2 등록→검색→V2 Current 확인→V1 지정→reload/목록 API/상세 API 단일 Current 일치→V1 DXF 두 Viewer 표시, 7.9초 |
| FR-FILE-001, FR-VIEWER-002/003, NFR-PERF-001 | workflow.spec.ts | 선택 Version ID/파일 크기/Renderer 계측 일치, 원본 bytes 동일, 확대 전후 canvas pixels 변화, console error/pageerror 0 |
| FR-VIEWER-004 / TC-SWITCH-001/002 | tests/e2e/switch.spec.ts | 20회 전환, 동일 document/Version·다운로드 1회, 재시도 시 2회; canvas 1개, 추적 Worker/Blob 0 및 active context 1; 화면 이탈 후 모두 0, 24.4초 |
| FR-VERSION-001–004, NFR-DATA-001 | tests/integration/database.test.ts | 위치 Unique·Version 순번·Current 교체/rollback/경쟁·타 Location SQL/service 차단·FK 및 Index 회귀 PASS |
| FR-CAD-001–005, FR-LIST-001/002, NFR-SEC-001 | tests/integration/upload.test.ts, list.test.ts | 업로드/실패 보상/중복 hash·검색/필터·traversal/symlink 회귀 PASS |
| FR-VIEWER-002/003/006, FR-ERROR-001 | tests/e2e/viewer.spec.ts | 두 Viewer의 LINE/CIRCLE/한글 TEXT·탐색·resize·재진입, 손상/빈 DXF, DWG 미제공 안내 회귀 PASS |
| NFR-PERF-001 / TC-MET-001 | metrics.spec.ts 및 unit/metrics.test.ts | JSON export·빈 도면·성공/실패/취소·null 사유 회귀 PASS |

캡처는 Git 제외 `src/test-results/release-workflow.png`. 새로 수행한 시각적 수동 fidelity 평가는 없으며 canvas 변화 assertion을 전체 Entity 정확성으로 해석하지 않는다. U8A 동일 앱의 60개 성능 측정은 재실행하지 않았고 위 기존 보고서의 실제 결과를 참조한다.

### 판정 및 제한

- DXF 우선 릴리스의 자동화 기능 통합·회귀 기준 충족. 두 Viewer 기본 흐름을 검증했으며 실패 미해결 테스트는 없다. 테스트/문서만 변경하여 앱 버전 0.8.0 유지, 이번 Tag 생성 없음.
- 실제 업무 Sample/기준 CAD 화면·SLA 미제공: TC-CAD-001 실도면 충실도, 복잡한 Entity, >10 MiB 도면, 다른 Browser/실 GPU 장기 사용성은 NOT RUN. 자원 수 20회 확인은 전체 JS/GPU 장기 누수 없음의 증명이 아니다.
- DWG의 실제 libredwg-web 초기화/렌더링은 NOT RUN. 다음 승인 Unit은 7A 기술 실험이며 전체 P.O.C. 완료로 판정하지 않는다.
- 기존 Prisma 전이 의존성 경고는 미해결이다. 이번에 의존성 변경/audit 재실행은 하지 않았다.
- 원격 연결/인증·main HEAD=e9339a3 일치를 시작 시 확인했다. 원격 이슈 #2 등록 메모 요청은 OPEN이며 이번 회귀 범위와 별도 후속 항목으로 기록했다. Commit/Push 최종 결과는 이 기록을 포함한 Git history와 원격 HEAD 검증을 기준으로 한다.

## U8A-20260908 — 계측 및 합성 도면 비교 0.8.0

- Source: 이 결과를 포함한 `feat(metrics)` 커밋 snapshot. Type Check/Lint/Production Build 통과. DB Schema 및 기존 library version 변경 없음.
- 로컬 3100을 0.8.0으로 재시작하고 홈/아이콘 HTTP 200을 확인했다. 커밋 후보 87개 Secret/런타임 제외 검사 위반 0. 원본 CAD/Runtime DB/benchmark JSONL을 커밋하지 않고, 측정값 및 출처는 이 보고서에 보존했다.
- 자동 테스트 38 passed / 0 failed. 성공/빈 도면/오류/취소, 원본 재사용과 stage/null 사유를 검증했다. E2E 11 passed / 0 failed (42.1초), JSON 다운로드 내용과 현재 renderer/source 상태 일치 포함.
- 최종 benchmark 30 cold/warm 쌍 = 60개 측정. 3가지 LINE 개수 × 2 Viewer × cold/warm × 각 5회. 모든 Load 성공, Console error/pageerror 0. 이는 합성 fixture 기능 검증이며 성능 SLA 합격 판정이 아니다.
- 예비 실행은 favicon.ico 404 때문에 9 failed/1 interrupted/20 not run으로 중단했다. 실제 trace에서 누락 아이콘 요청을 확인하고 app/icon.svg를 추가했다. 예비 값은 아래 최종 결과에서 제외했다. 별도 benchmark 설정의 TypeScript union 처리 오류도 수정 후 검사 통과했다.
- 환경: Linux x64, Intel Core Ultra 7 255H, logical CPU 16, OS 보고 RAM 15 GiB. Node 22.14.0, Playwright 1.63.0, Chromium 145.0.0.0 (cache 1208), SwiftShader, 1440×1000, DPR 1, worker 1. 개발 환경의 공유 장비이며 전용 무부하 장비가 아니다.
- cold=새 Browser context 첫 열기(프로세스/OS cache까지 초기화한 것은 아님), warm=같은 Version에서 다른 Viewer 경유 후 원래 Viewer 복귀(memory source+Browser/module/font cache). 시작 시간은 Manager.load부터이며 HTML navigation 전체 시간은 포함하지 않는다.
- 전체=최종 결과 시점, 처리=Adapter Load(bytes 복사/파싱/준비/글꼴/렌더링 통합), 첫 화면=성공 draw 후 rAF callback 관찰(GPU present 보장 아님). 확대=버튼 click 실행→다음 rAF 관찰. 실제 입력 장치 latency를 포함하지 않는다.
- pure parse는 두 Viewer 모두 null+사유. dxf Entity count는 null, three는 100/10,000/100,000 확인. 표 LINE 수는 fixture 생성 수이며 API 계측과 구분한다. heap은 비표준 usedJSHeapSize snapshot이며 GPU/WASM/전체 process memory가 아니다.
- 같은 도면 크기·SHA-256은 아래 표와 생성 코드 metrics.benchmark.ts로 재현한다. 최대 도면도 약 5 MB로 10 MiB 초과 대형 파일은 NOT RUN. LINE만으로 TEXT/BLOCK/HATCH 등 실제 도면 복잡도를 대표하지 않는다.
- 상세 원시 JSONL은 Git 제외 src/benchmark-results/measurements.jsonl. 아래 개별 시간/heap과 sample hash를 보존한다. 재현 명령: Production Build 후 PLAYWRIGHT_CHROMIUM_EXECUTABLE 지정 npm --prefix src run test:benchmark.

### 합성 Sample

| LINE 수 | bytes | SHA-256 |
| --- | --- | --- |
| 100 | 4716 | 6208373070888c0e04d919cf55129e09d839b7626c20c6152752f9c90f76a565 |
| 10000 | 487836 | b2c022d058d1dd3612732faefe8ebcf662c289571be1305f4948d643aa0d73b4 |
| 100000 | 5058036 | 58211f0609a2aefb9439df7c09b0c0db45417f054807b473c3882021d814b08a |

### 5회 요약 (시간 ms, heap MiB)

| LINE | Viewer | 조건 | 전체 median [min–max] | 처리 median | 첫 화면 median | 확대 median | heap median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | dxf-viewer | cold | 479.6 [308.1–590.1] | 178.0 | 479.6 | 1.1 | 11.9 |
| 100 | dxf-viewer | warm | 255.9 [234.3–363.7] | 199.8 | 255.9 | 1.6 | 14.3 |
| 100 | three-dxf-viewer | cold | 1440.3 [1101.3–1540.6] | 1232.9 | 1440.2 | 1.8 | 62.0 |
| 100 | three-dxf-viewer | warm | 439.9 [389.5–499.3] | 393.5 | 439.9 | 19.2 | 64.9 |
| 10000 | dxf-viewer | cold | 498.8 [406.5–583.4] | 276.7 | 498.8 | 5.4 | 13.0 |
| 10000 | dxf-viewer | warm | 406.3 [352.3–702.1] | 362.0 | 406.3 | 0.8 | 50.0 |
| 10000 | three-dxf-viewer | cold | 1414.2 [1390.8–1487.0] | 1233.5 | 1414.2 | 422.1 | 99.6 |
| 10000 | three-dxf-viewer | warm | 621.0 [542.2–719.6] | 579.7 | 621.0 | 582.3 | 101.1 |
| 100000 | dxf-viewer | cold | 918.3 [864.9–1364.9] | 672.2 | 918.3 | 191.7 | 22.0 |
| 100000 | dxf-viewer | warm | 656.8 [633.7–820.3] | 618.5 | 656.8 | 143.3 | 295.4 |
| 100000 | three-dxf-viewer | cold | 3338.8 [3265.8–3899.1] | 3108.0 | 3338.8 | 5299.9 | 375.9 |
| 100000 | three-dxf-viewer | warm | 3167.0 [2764.5–4000.6] | 3123.3 | 3167.0 | 5488.1 | 386.4 |

### 개별 결과 (시간 ms, heap MiB)

| LINE | Viewer | 조건/회차 | source 대기 | 초기화 | 처리 | 첫 화면 | 전체 | 확대 | heap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | dxf-viewer | cold/1 | 81.4 | 330.7 | 177.9 | 590.1 | 590.1 | 0.9 | 12.4 |
| 100 | dxf-viewer | warm/1 | 0.2 | 54.9 | 199.8 | 255.9 | 255.9 | 12.6 | 14.4 |
| 100 | dxf-viewer | cold/2 | 26.1 | 105.1 | 178.0 | 309.4 | 309.4 | 0.8 | 13.5 |
| 100 | dxf-viewer | warm/2 | 0.1 | 57.3 | 176.1 | 234.3 | 234.3 | 1.4 | 14.3 |
| 100 | dxf-viewer | cold/3 | 36.1 | 100.9 | 170.9 | 308.1 | 308.1 | 17.5 | 11.8 |
| 100 | dxf-viewer | warm/3 | 0.1 | 49.1 | 199.7 | 249.6 | 249.6 | 1.6 | 14.3 |
| 100 | dxf-viewer | cold/4 | 27.7 | 219.7 | 231.9 | 479.6 | 479.6 | 1.1 | 11.9 |
| 100 | dxf-viewer | warm/4 | 0.1 | 62.7 | 277.9 | 342.0 | 342.0 | 4.2 | 14.5 |
| 100 | dxf-viewer | cold/5 | 38.4 | 257.2 | 237.6 | 533.3 | 533.3 | 8.5 | 11.8 |
| 100 | dxf-viewer | warm/5 | 0.2 | 43.5 | 319.8 | 363.7 | 363.7 | 0.6 | 14.3 |
| 100 | three-dxf-viewer | cold/1 | 20.7 | 174.5 | 1343.9 | 1540.6 | 1540.6 | 1.8 | 61.9 |
| 100 | three-dxf-viewer | warm/1 | 0.2 | 44.9 | 402.1 | 448.2 | 448.2 | 18.4 | 79.6 |
| 100 | three-dxf-viewer | cold/2 | 20.5 | 166.5 | 1252.0 | 1440.2 | 1440.3 | 3.7 | 62.0 |
| 100 | three-dxf-viewer | warm/2 | 0.2 | 49.4 | 449.5 | 499.3 | 499.3 | 19.2 | 64.9 |
| 100 | three-dxf-viewer | cold/3 | 15.2 | 152.2 | 1118.8 | 1287.2 | 1287.2 | 1.4 | 62.0 |
| 100 | three-dxf-viewer | warm/3 | 0.1 | 45.6 | 393.5 | 439.9 | 439.9 | 17.8 | 64.9 |
| 100 | three-dxf-viewer | cold/4 | 56.9 | 202.1 | 1232.9 | 1493.0 | 1493.0 | 13.1 | 60.3 |
| 100 | three-dxf-viewer | warm/4 | 0.2 | 43.7 | 349.4 | 393.8 | 393.9 | 19.3 | 64.9 |
| 100 | three-dxf-viewer | cold/5 | 31.1 | 122.8 | 946.4 | 1101.3 | 1101.3 | 1.4 | 62.0 |
| 100 | three-dxf-viewer | warm/5 | 0.2 | 36.3 | 352.2 | 389.5 | 389.5 | 32.1 | 64.9 |
| 10000 | dxf-viewer | cold/1 | 28.7 | 130.2 | 247.3 | 406.4 | 406.5 | 30.0 | 14.6 |
| 10000 | dxf-viewer | warm/1 | 0.3 | 155.6 | 546.0 | 702.1 | 702.1 | 0.8 | 50.2 |
| 10000 | dxf-viewer | cold/2 | 35.8 | 216.7 | 246.2 | 498.8 | 498.8 | 6.3 | 13.0 |
| 10000 | dxf-viewer | warm/2 | 0.2 | 51.6 | 380.2 | 432.2 | 432.2 | 0.8 | 50.1 |
| 10000 | dxf-viewer | cold/3 | 39.1 | 201.5 | 342.6 | 583.4 | 583.4 | 1.0 | 12.8 |
| 10000 | dxf-viewer | warm/3 | 0.2 | 39.6 | 336.2 | 376.2 | 376.2 | 0.7 | 50.0 |
| 10000 | dxf-viewer | cold/4 | 32.3 | 161.8 | 292.8 | 487.1 | 487.1 | 5.4 | 13.0 |
| 10000 | dxf-viewer | warm/4 | 0.1 | 44.0 | 362.0 | 406.3 | 406.3 | 0.6 | 50.0 |
| 10000 | dxf-viewer | cold/5 | 45.1 | 213.2 | 276.7 | 535.3 | 535.3 | 1.1 | 12.8 |
| 10000 | dxf-viewer | warm/5 | 0.3 | 43.5 | 308.3 | 352.3 | 352.3 | 61.3 | 49.0 |
| 10000 | three-dxf-viewer | cold/1 | 25.8 | 121.7 | 1241.8 | 1390.8 | 1390.8 | 639.2 | 99.6 |
| 10000 | three-dxf-viewer | warm/1 | 0.2 | 34.4 | 507.4 | 542.2 | 542.2 | 460.1 | 101.4 |
| 10000 | three-dxf-viewer | cold/2 | 42.3 | 149.1 | 1294.5 | 1487.0 | 1487.0 | 480.9 | 67.8 |
| 10000 | three-dxf-viewer | warm/2 | 0.1 | 43.5 | 616.3 | 660.1 | 660.1 | 729.7 | 101.1 |
| 10000 | three-dxf-viewer | cold/3 | 35.6 | 156.3 | 1221.1 | 1414.2 | 1414.2 | 422.1 | 100.0 |
| 10000 | three-dxf-viewer | warm/3 | 0.0 | 41.1 | 579.7 | 621.0 | 621.0 | 450.7 | 101.1 |
| 10000 | three-dxf-viewer | cold/4 | 32.2 | 124.2 | 1233.5 | 1391.3 | 1391.3 | 418.7 | 99.6 |
| 10000 | three-dxf-viewer | warm/4 | 0.1 | 44.8 | 573.7 | 618.8 | 618.8 | 603.0 | 101.0 |
| 10000 | three-dxf-viewer | cold/5 | 28.4 | 160.0 | 1228.7 | 1418.2 | 1418.2 | 394.4 | 99.9 |
| 10000 | three-dxf-viewer | warm/5 | 0.2 | 62.8 | 656.4 | 719.6 | 719.6 | 582.3 | 101.1 |
| 100000 | dxf-viewer | cold/1 | 88.4 | 187.7 | 692.3 | 968.5 | 968.5 | 191.7 | 21.9 |
| 100000 | dxf-viewer | warm/1 | 0.2 | 38.3 | 765.6 | 804.2 | 804.2 | 310.9 | 360.3 |
| 100000 | dxf-viewer | cold/2 | 87.5 | 158.4 | 672.2 | 918.3 | 918.3 | 204.5 | 22.0 |
| 100000 | dxf-viewer | warm/2 | 0.2 | 44.5 | 775.5 | 820.3 | 820.3 | 336.6 | 24.7 |
| 100000 | dxf-viewer | cold/3 | 115.9 | 249.0 | 999.8 | 1364.9 | 1364.9 | 325.7 | 22.0 |
| 100000 | dxf-viewer | warm/3 | 0.3 | 38.7 | 610.0 | 649.2 | 649.2 | 143.3 | 295.3 |
| 100000 | dxf-viewer | cold/4 | 82.3 | 160.1 | 622.4 | 864.9 | 864.9 | 70.5 | 22.0 |
| 100000 | dxf-viewer | warm/4 | 0.2 | 38.0 | 618.5 | 656.8 | 656.8 | 74.5 | 310.4 |
| 100000 | dxf-viewer | cold/5 | 80.0 | 159.9 | 648.5 | 888.5 | 888.5 | 52.3 | 21.8 |
| 100000 | dxf-viewer | warm/5 | 0.2 | 30.7 | 602.7 | 633.6 | 633.7 | 0.8 | 295.4 |
| 100000 | three-dxf-viewer | cold/1 | 85.9 | 162.4 | 3089.3 | 3338.8 | 3338.8 | 5696.8 | 382.3 |
| 100000 | three-dxf-viewer | warm/1 | 0.2 | 59.4 | 3940.7 | 4000.6 | 4000.6 | 7435.4 | 382.5 |
| 100000 | three-dxf-viewer | cold/2 | 158.5 | 178.9 | 3560.4 | 3899.1 | 3899.1 | 5380.8 | 371.8 |
| 100000 | three-dxf-viewer | warm/2 | 0.1 | 41.6 | 2722.1 | 2764.5 | 2764.5 | 5192.8 | 386.4 |
| 100000 | three-dxf-viewer | cold/3 | 100.2 | 203.6 | 2960.5 | 3265.8 | 3265.8 | 4600.7 | 380.6 |
| 100000 | three-dxf-viewer | warm/3 | 0.1 | 43.1 | 3123.3 | 3167.0 | 3167.0 | 5488.1 | 390.2 |
| 100000 | three-dxf-viewer | cold/4 | 61.8 | 144.4 | 3108.0 | 3315.9 | 3315.9 | 5299.9 | 373.7 |
| 100000 | three-dxf-viewer | warm/4 | 0.2 | 14.1 | 3214.7 | 3229.8 | 3229.8 | 5866.8 | 391.2 |
| 100000 | three-dxf-viewer | cold/5 | 69.8 | 143.2 | 3410.1 | 3624.5 | 3624.5 | 5115.7 | 375.9 |
| 100000 | three-dxf-viewer | warm/5 | 0.1 | 45.7 | 2927.6 | 2974.3 | 2974.3 | 5398.9 | 383.3 |

### 해석 및 잔여 평가

- LINE 100,000 cold에서 전체 median은 dxf 918.3 ms / three 3338.8 ms, 확대→rAF는 191.7 / 5299.9 ms였다. 이 합성·SwiftShader 조건에서 three의 높은 draw-call 비용을 추가 조사할 근거가 된다. GPU present를 측정하지 않았으므로 원인 확정이나 업무 SLA 판단은 아니다.
- warm JS heap은 같은 document에서 직전에 실행한 다른 Viewer의 bundle·객체·GC 상태도 포함한다. 이를 해당 Adapter 단독 메모리 사용량이나 증분으로 비교하면 안 된다.
- 본 실행에서 dxf-viewer와 three-dxf-viewer의 통합 처리/heap/확대 관찰 값을 비교할 수 있다. 한글 JSON을 항상 읽는 three와 TEXT 없는 경우 font를 지연 로드하는 dxf의 초기 비용 차이도 포함되므로 이를 순수 parser 성능 차이로 해석하지 않는다.
- 확대 값은 합성 LINE 배치의 참고치이며 Pan 사용성/장시간 상호작용·실제 GPU 입력 latency의 정량 검증은 남는다. Unit 6의 자원 계수 시험과 이 heap snapshot만으로 memory leak 부재를 선언하지 않는다.
- POLYLINE/LWPOLYLINE/ARC/BLOCK/INSERT/MTEXT/DIMENSION/HATCH/SPLINE/Linetype와 업무 실도면 fidelity는 NOT RUN. 기존 LINE/CIRCLE/한글 TEXT 및 Layer 기본 시험은 U4/U5 참조. 업무 SLA와 실도면 미제공으로 사업장 적용성 판정은 보류한다.
- 기존 npm high 4, three 메인 스레드 parse/전역 material cache/약 25.8 MB font JSON 제약 유지. 계측 UI·harness 완료와 전체 P.O.C. 검증 완료를 구분한다. 다음 Unit 9A DXF 통합·회귀/릴리스 검증.

## U6-20260908 — 새로고침 없는 전환 0.7.0

- Source: 이 기록을 포함하는 `feat(viewer)` 커밋 snapshot. DB Schema/의존 라이브러리 변경 없음. UI renderer 버튼, ViewerSource, Manager와 관련 문서/시험 변경.
- Type Check/Lint/Production Build 모두 exit 0. 자동 테스트 35 passed / 0 failed, 8개 파일, 11.00초. 기존 32개 + 원본 1회 공유/Adapter 변경 격리, 지연 다운로드 중 마지막 선택만 초기화, 실패 재시도/다른 Version bytes 분리 3개.
- E2E 10 passed / 0 failed, 39.1초. 기존 관리/두 Viewer/한글/오류 9개 회귀와 전환 1개. Chromium 1208 executable, Playwright 1.63.0, SwiftShader, 1440×1000, 독립 임시 DB/Storage. 기존 명령 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=... npm --prefix src run test:e2e` 실행.
- TC-SWITCH-001/002: 다운로드를 지연한 상태에서 두 번 선택 변경→최종 renderer 표시→10회 양방향 전환. 동일 document marker/Version heading/URL renderer를 유지하며 content HTTP 요청은 1회였다. 명시적 다시 불러오기 후 2회로 증가함을 확인했다.
- 테스트 전용 계수: 각 전환 완료 시 canvas 1개, 활성 WebGL context 1개, Worker 0개, Blob URL 0개. 버전 목록으로 이탈 후 canvas/context/Worker/Blob 모두 0. 정상 경로 pageerror 0. 이것은 관측 대상 자원의 cleanup 검증이며 전체 JS heap/GPU/전역 cache 누수 부재를 증명하지 않는다.
- 탐색 시점/Layer 선택은 전환마다 초기화한다. renderer URL은 replaceState로 변경하여 전환 자체로 history를 늘리지 않는다. 원본은 Version 수명 내 보관하고 Adapter마다 slice 복사본을 제공한다. 원본 CAD/DB 변경 없음.
- Known Issues: three 메인 스레드 parse, 전역 material cache, 대형 font JSON 및 실제 도면 성능/전체 Entity·MTEXT·인코딩 한계는 이전과 동일하다. 기존 npm high 4 유지. 다음 Unit 8A에서 측정/비교를 진행한다.
- 로컬 3100 서버를 0.7.0으로 재시작하고 홈 HTTP 200 및 버전 표시를 확인했다. 후보 81개 Secret/런타임 검사 위반 0, git diff --check 통과. README와 관련 요구/설계/운영/시험/결정/변경 이력 갱신.

## U5-20260908 — three-dxf-viewer 및 한글 글꼴 0.6.0

- Source: 이 기록을 포함한 `feat(viewer)` 커밋 snapshot. three-dxf-viewer 1.0.44 / 직접 Three 0.171.0 / dxf-viewer 1.0.48. 외부 source 수정 및 DB migration 변경 없음.
- Type Check/Lint/Production Build: 최종 PASS. build가 원본 TTF로 typeface JSON을 생성하며 두 Viewer는 Browser dynamic import 경계를 유지한다.
- 자동 테스트: 32 passed / 0 failed, 7개 파일, 9.90초. 이전 30개 + 실제 한글/라틴 glyph 존재 및 라이선스 확인, 생략된 Z 보완/명시 Z 보존/멱등성 시험.
- E2E: 최종 9 passed / 0 failed, 30.3초. 기존 관리 3개, Viewer별 탐색 2개, 한글 TEXT 2개, 손상/빈 DXF/DWG 안내 2개. Chromium 1208 executable, Playwright 1.63.0, SwiftShader, 독립 임시 DB/Storage. 실행 명령은 기존 PLAYWRIGHT_CHROMIUM_EXECUTABLE 지정 `npm --prefix src run test:e2e`이다.
- 실제 렌더링: 양쪽 LINE/CIRCLE, 확대·축소·Pan·Fit·Resize·재로드/재진입. three의 Layer 0 숨김/복원은 screenshot byte 변화/복원으로 확인했다. 정상 탐색 pageerror 0. 두 Viewer의 「한글 공장 ABC」 screenshot을 시각 확인하고 확대 전후 픽셀 변화도 검증했다. Git 제외 `src/test-results/{renderer}-render.png`, `{renderer}-korean.png`.
- 실패/수정: 처음 three가 완료 상태에도 검정 화면이었다. 재료 대비를 조사·보정했지만 지속되어 진단했고, 생략 Z에서 NaN bounds/camera가 발생함을 확인했다. Wrapper의 기본 Z=0 보완과 finite bounds 검증으로 해결했다. 손상 문자열을 빈 도면으로 받아들이는 사례는 ASCII SECTION/EOF 사전 검증으로 거부한다. 임시 진단 로그는 제거했다.
- 중간 회귀: 2 failed→수정 후 1 failed(Resize 시험이 이전 DOM 너비를 기대값으로 먼저 읽은 timing 문제). 크기와 backing buffer를 동일 polling 시점에서 DPR 포함 비교하도록 수정한 뒤 9/9 통과했다. 이전 실패는 숨기지 않고 최종 결과와 구분한다.
- 글꼴: 원본 TTF/OFL 포함, 생성 JSON은 Git 제외. 출처/hash/원본 크기와 배포 방법은 Operation에 있다. 전체 typeface 약 25.8 MB로 최초 전송/파싱 비용이 있으며 실환경 성능 시험은 NOT RUN이다.
- 확장 기능 평가: Layer 기본 On/Off PASS. Hover/Select/CADControls 공개 export 및 metadata API 존재는 설치 소스로 확인했으나 익명 이벤트 handler/public dispose 부재로 이번 UI에 미연결, 런타임 NOT RUN. SnapsHelper.clear 존재 확인, Snap 정확도·대형 도면 비용은 NOT RUN. 미지원으로 단정하지 않는다.
- Known Issues: three 메인 스레드 parse 및 전역 material cache 잔여 위험, 복잡한 INSERT/Layer·MTEXT/SHX/CP949·전체 Entity·실도면 fidelity·memory/성능 미검증. 기존 npm high 4 유지. Layer는 Adapter wrapper 기준이며 모든 upstream interaction을 구현한 것이 아니다.
- 다음: Unit 6의 새로고침 없는 전환, 동일 bytes 재사용 및 경쟁/자원 stress. 현재 renderer 링크는 전체 페이지 탐색이다. 원본 CAD/Runtime DB를 수정·커밋하지 않는다.
- 로컬 3100 서버를 0.6.0으로 재시작하고 홈/생성 font HTTP 200, 한글 glyph와 파생 family 이름을 확인했다. 커밋 후보 78개 보안 검사 위반 0, 진단 로그 제거 및 diff 검사 통과. 관련 문서 갱신, DB Schema 정의는 변경 없음.

## U4-20260908 — dxf-viewer 0.5.0

- Source: 이 기록을 포함하는 `feat(viewer)` 커밋 snapshot. dxf-viewer 1.0.48, Three.js 0.161.0, 기존 package/lock 고정. DB Schema 변경 없음.
- `typecheck`, `lint`, `build`: 최종 exit 0. 최초 테스트 코드의 canvas 타입 오류 수정 후 통과. SSR에서 WebGL 초기화 없이 Worker 자산 포함 Production Build 성공.
- `npm --prefix src test`: 30 passed / 0 failed, 5개 파일, 8.46초. 이전 26개 회귀 + Manager 형식 제한/늦은 초기화 취소/실패 cleanup/이전 Load 결과 차단 4개.
- Chromium E2E: 최종 5 passed / 0 failed, 13.1초. 기존 관리 흐름 3개 + DXF 정상/오류 흐름 2개. 최초 실행은 Next route announcer까지 alert로 탐색해 1 failed, main 영역으로 locator를 한정한 뒤 전체 재시험 통과.
- TC-DXF-001 PASS: 생성한 LINE/CIRCLE DXF 업로드→검색 목록→도면 보기→실제 WebGL 표시. canvas screenshot 변화로 확대/Pan 반응 확인, 축소/Fit 클릭, 1100×800 Resize 후 canvas 크기 일치, 다시 불러오기/재진입 및 canvas 한 개 유지. 정상 경로 pageerror 0. `src/test-results/dxf-render.png`에서 선과 원을 시각 확인했다(Git 제외).
- TC-DXF-002 PASS: 손상 DXF의 일반화된 처리 실패와 재시도, 빈 DXF의 빈 도면 상태, DWG의 후속 구현 안내 및 canvas 없음. 손상 파일의 upstream console 오류는 예상된 오류이며 정상 렌더링 결과와 구분한다.
- 환경: Linux, Node 22.14.0, Playwright 1.63.0, Chromium 1208 executable, SwiftShader software WebGL, 독립 임시 DB/Storage. 화면 1440×1000 및 1100×800. 소프트웨어 GPU 결과를 실제 장비 성능으로 일반화하지 않는다.
- dxf-viewer 평가: 기본 LINE/CIRCLE 표시·Zoom/Pan/Fit/Resize/재진입 확인. 장점은 public API/Worker 기반 통합 및 내장 탐색. 현재 통합의 제약은 기본 font 미제공(TEXT/한글 누락 가능), Layer/Select/Hover/Snap UI 미제공. 실도면 Entity 충실도, parse/first-display 수치, memory/GPU 누수 추세 및 대형 파일은 NOT RUN. 해당 성능/평가는 Unit 8A 및 실제 Sample에서 진행한다.
- 라이브러리 원본 수정 없음. Adapter에서 Blob URL, Worker 취소, Destroy, WebGL context/canvas 정리를 수행한다. 120초 Worker timeout 경로와 WebGL 생성 불가 환경은 코드 처리 제공, 별도 장애 주입 시험은 NOT RUN.
- 기존 npm audit high 4 경고 유지. three-dxf-viewer/DWG는 미구현. README·AGENTS·Requirements·Architecture·TestPlan·Operation·Decisions·ChangeLog 갱신. 다음 Unit은 5 three-dxf-viewer이다.
- 로컬 적용: 3100 서버를 0.5.0으로 정상 재시작하고 HTTP 200, 버전 표시 및 기존 DXF의 도면 보기 링크를 확인했다. 운영 DB/원본은 변경하지 않았다. 커밋 후보 70개 Secret/런타임 검사 위반 0.

## U3-20260908 — 목록·검색 0.4.0 / GitHub #1

- 대상: 지정 GitHub 저장소의 「도면 목록 미표시 #1」. Source는 이 기록을 포함한 `feat(list)` 커밋 snapshot이다. 원격 반영 결과는 후속 기록을 참조한다.
- 원인: 0.3.0 홈은 정적 안내이며 DB 목록을 조회하지 않았다. 기존 사용자 DB에서 Location 1개/Version 1개를 읽기 전용으로 확인했다.
- 수정 전: Chromium에서 등록 성공→목록 복귀 시 도면 행을 찾지 못하는 회귀 테스트 1 failed로 재현했다.
- 수정: 실제 DB 목록/검색/페이지/위치별 버전과 Current UI, 안전한 조회 API, 동적 렌더링 및 등록/Current 변경 후 캐시 갱신. Schema/migration 변경 없음.
- 자동 테스트: `npm --prefix src test` — 26 passed / 0 failed (환경 2, DB 6, Upload 12, 목록 6). TC-LIST-001–007의 등록 직후 조회·7조건 필터·문자 그대로 검색·Current/null·페이지·잘못된 query를 검증했다.
- `npm --prefix src run typecheck`, `lint`, `build` — 모두 exit 0. Production Build에서 `/`와 Location 상세는 동적 경로이다.
- E2E: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome npm --prefix src run test:e2e` — 최종 3 passed / 0 failed, 7.0초. 등록→목록 복귀→새로고침, 조회 API, 파일명/사업장 검색, 상세 Current 교체→새로고침→Current 목록의 일치를 실제 Browser에서 검증했다.
- 중간 E2E 실패 1건: select를 getByLabel exact로 탐색하여 option text가 포함된 label을 찾지 못했다. 접근성 role/name 기반 combobox 탐색으로 수정 후 전체 3개 재시험 통과했다.
- 환경: Linux, Node 22.14.0, Playwright 1.63.0, Chromium cache 1208, 1440×1000. 임시 DB/Storage 사용. Git 제외 `src/test-results/list-current.png` 화면을 확인했다. Viewer rendering 시험은 아니다.
- 실행 서버: 3100을 새 빌드로 정상 재시작. `/` 및 `/cad/upload` HTTP 200, 목록 API total=기존 DB Version 수 1, 실제 홈 HTML에 해당 Version ID 포함을 확인했다. 사용자 DB/원본 삭제·초기화 없음.
- 문서: README/AGENTS/Requirements/Architecture/TestPlan/Operation/Decisions/ChangeLog 갱신. DB Schema 변경 없음으로 Database.md 정의 유지.
- Known Issues: Viewer 및 실도면 성능/fidelity는 미구현·미검증. 기존 Prisma 전이 의존성 high 4 경고는 이 목록 수정에서 해결하지 않았다. 다음 기능 Unit은 dxf-viewer이다.

### 원격 반영 및 이슈 종료 — 2026-09-08

- 구현 Commit: `aec7af6c3e451caa29a1bc711e320ea86cea9006`, `main` Push 성공 및 원격 HEAD 일치 확인.
- 커밋 후보 62개 Secret/Runtime 제외 검사: 위반 0. `git diff --check` 통과.
- GitHub #1에 원인·조치·시험·문서·잔여 범위를 댓글로 기록했다(comment ID: 5575209023). API 재조회에서 `closed`, `state_reason=completed`를 확인했다.
- 이 후속 기록은 별도 docs 커밋으로 관리한다. Unit 3 조치 완료, 다음 Unit 4는 아직 시작하지 않았다.

## BOOT-20260907-01 — Unit 0A 문서 Bootstrap

이 절은 최초 문서 검증 당시의 기록이다. 이후 작성자 설정과 Commit/Push는 아래 후속 기록을 기준으로 한다.

- Date: 2026-09-07 (Asia/Seoul).
- Version: 없음. src/package.json 미생성, 기능 Release 아님.
- Commit: 없음. 기존 Commit이 없는 main; 문서 변경은 uncommitted. 작성자 정보 입력 대기.
- 환경: Linux/WSL workspace, Node v22.14.0, npm 11.10.0, Git 2.43.0.
- 범위: Workspace/Git/config 조사 및 문서 정적 검사. 앱/DB/Rendering 시험이 아님.

### Git 및 환경 조사 (실제 수행)

| 항목 | 결과 | 근거·제약 |
| --- | --- | --- |
| 기존 Workspace | 확인 | .git/.env/.gitignore 및 로컬 agent 디렉터리 존재, 기존 앱/문서 없음 |
| .env | configured | 기존 remote_repo_url/remote_repo_token 값 존재 여부만 확인; 내용 비출력 |
| Git repository | OK | git rev-parse 결과 true |
| Remote 정합성 | OK | origin URL과 .env 설정을 메모리에서 정규화 비교, credential 포함 URL 아님 |
| Local branch / history | main / 기존 Commit 없음 | symbolic-ref, log 조회 |
| GitHub 읽기 연결 | OK | git ls-remote --symref origin HEAD refs/heads/* exit 0, 결과 비어 있음 |
| Remote default branch | 미확정 | HEAD/branch가 없어 원격 기본 브랜치 확인 불가; main은 로컬 branch |
| 인증 / 쓰기 권한 | configured / 미검증 | token 값 존재, 읽기 연결 성공; Push는 수행 안 함 |
| 최초 network 실패 | 해결 | sandbox DNS/network 오류(exit 128), 허용된 외부 실행에서 재시도 성공(exit 0) |
| Git author | 미설정 | user.name/user.email 설정 없음, 사용자에게 입력 요청 |

### 문서·보안 검사

실행: `python3 /tmp/cad-bootstrap-audit.py`, exit **0**. 이 파일은 이번 Bootstrap용 임시 검사 도구이며 Git에 포함하지 않는다. 방법과 결과를 아래에 남긴다. 앱의 versioned 테스트 코드는 계획 확인 후 src/tests에서 작성한다.

**정적 검사 Total 9 / Passed 9 / Failed 0.** 아래 9개 검사는 50개 예정 애플리케이션 TC의 실행 결과와 별개이다.

| 검사 | 관련 TC | 실제 결과 | 방법·관측 |
| --- | --- | --- | --- |
| 필수 구조 | TC-BOOT-001 | PASS | Markdown 10개, 필수 Root 파일과 src directory 존재 |
| 내부 문서 링크 | TC-DOC-001 | PASS | Markdown 상대 링크 대상 검사, 끊어진 링크 0 |
| 요구↔테스트 ID | TC-DOC-001 | PASS | 요구 39개·TC 시나리오 50개 정의, 중복/없는 참조 0 |
| Unit별 AC | TC-DOC-001 | PASS | 분할된 12개 Unit 모두 범위/선행 조건/AC/시험 항목 포함 |
| Git 제외 규칙 | TC-BOOT-002 | PASS | git check-ignore --no-index: 제외 경로 19개, 추적 허용 경로 8개 모두 예상과 일치 |
| 환경 template | TC-BOOT-002 | PASS | 기존 .env 키 2개 보존, example 실제 값 0 |
| Secret 검사 | TC-BOOT-002 | PASS | 변경 후보 13개 파일에서 실제 .env 값·token pattern·credential URL 일치 0; 값 비출력 |
| 구현 금지/비추적 | TC-BOOT-001 | PASS | src에는 .gitkeep만 존재, data 미생성, .env tracked 아님 |
| diff 공백 검사 | TC-GIT-001 | PASS | git diff --check 및 후보 새 파일 각각 git diff --no-index --check, 오류 0 |

정적 자동 검사는 구조/참조/정해진 pattern을 확인한 범위이며 모든 보안 취약점이나 기능 정확성을 보장하지 않는다. 별도 문서 review로 Bootstrap 단계 충돌, Current 소속 제약, DB/파일 비원자성, DWG parser/rendering 차이, 미실행 결과 표시를 확인했다. Git 연결 점검과 라이브러리 공식 문서 조사는 위 자동 검사 9개 수에 합산하지 않았다.

변경 후보: AGENTS.md, README.md, .env.example, .gitignore, src/.gitkeep, out/*.md 8개. 기존 .env는 편집하지 않았다. 아직 stage/Commit/Push하지 않았으며 working tree에는 이 13개 untracked 파일이 있다. 첫 Commit 작성자 확인 이후 diff/보안 검사를 다시 수행한다.

### 애플리케이션 시험 상태

| 영역 | 결과 | 사유 |
| --- | --- | --- |
| Next Build / Type Check / Lint | NOT RUN | 0A 구현 금지, package/source 없음 |
| DB connection / Migration / Current | NOT RUN | Schema 초안만 존재 |
| Upload / Search / API | NOT RUN | 미구현 |
| Component / E2E | NOT RUN | framework/코드 미설치 |
| DXF / DWG rendering | NOT RUN | 라이브러리 미설치·실제 sample 미제공 |

### Known Issues / 다음 작업

- KI-001: libredwg-web은 파서이며 직접 렌더링 설계(ADR-004) 확인 대기. 이는 조사된 역할 차이이며 실제 파싱 실패 결과가 아니다.
- KI-002: Git 작성자 미설정으로 문서 Commit/Push 대기. 작업 트리는 clean으로 보고하지 않는다.
- KI-003: 대표 CAD Sample/업무 SLA 없음. 업무 적용 가능성 최종 평가는 미검증이다.
- KI-004: 실제 npm 배포본과 Next/Prisma/Three/WASM 호환성·memory/free API는 0B/7A에서 확인할 예정이다.
- 다음: 전체 계획 확인→Unit 0B→7A. 시험 실패를 숨기거나 코드 없는 0A를 Unit 0B 완료로 처리하지 않는다.

## BOOT-20260907-02 — 작성자 설정 및 최초 문서 게시

- Date: 2026-09-07. 범위는 Git 작성자 설정과 기존 Bootstrap 문서 형상관리이다. 사용자는 작성자 이름/이메일을 제공했으며 **전체 구현 계획과 ADR-004 승인은 여전히 대기**이다.
- 사용자 제공 작성자를 repository-local config에 설정하고 일치 검증을 통과했다. 전역 Git 설정은 변경하지 않았다. 실제 작성자 값은 문서에 복사하지 않는다.
- 작성자 상태를 README/Operation/Decisions/ChangeLog에 반영하고 `python3 /tmp/cad-bootstrap-audit.py` 재실행: exit 0, 정적 검사 9/9 PASS.
- 최초 문서 Commit: `3b1a32d5a506fec8687e55affa7fd0fee24330c8`, `docs(bootstrap): define CAD viewer requirements and implementation plan`.
- Staged 파일 13개가 검사한 working copy와 byte 단위로 일치함을 확인했다. `.env`와 CAD/DB/Secret은 추적 대상에 포함되지 않았다. `git diff --cached --check` 통과.
- 임시 비출력 인증 도구의 remote read, 일반 Push, remote 재조회가 모두 성공했다. `origin/main`과 위 Commit의 일치를 확인했으며 당시 working tree는 clean이었다. Force Push/기존 history 변경은 수행하지 않았다.
- 샌드박스에서 `.git/index` 쓰기 및 DNS가 차단된 시도는 허용된 외부 실행으로 재시도하여 해결했다. 인증 값/헤더/credential URL은 출력하지 않았다.
- KI-002(작성자 미설정/최초 Commit·Push 대기)는 해결했다. 실제 지정 branch 쓰기 연결도 확인했다. 다른 branch의 권한까지 확인했다는 뜻은 아니다.
- 이 결과를 기록하는 후속 문서 Commit은 별도로 생성한다. 최신 Commit과 동기화 상태는 실제 git log/status/remote 조회로 확인한다. 앱 버전은 여전히 없으며 앱 Build/DB/Viewer 시험은 NOT RUN이다.

## Viewer 평가 현황 — U7B 반영

공식 조사 사실은 Architecture에 있으며 아래 표는 **실제 실행 결과**만 채운다. 단순 라이브러리 문서의 기능 소개를 이 표의 PASS로 옮기지 않는다.

| 항목 | dxf-viewer | three-dxf-viewer | libredwg-web 경로 |
| --- | --- | --- | --- |
| 정상 표시 / 기본 Zoom·Pan·Fit | PASS: 생성 LINE/CIRCLE | PASS: 생성 LINE/CIRCLE | U7B 등록 LINE/Zoom/Pan/Fit 확인; 전체 Entity 후속 |
| Resize / 재진입 / Dispose | PASS: U9A 20회 전환 자원 정리; 장기 누수 미평가 | PASS: U9A 20회 전환 자원 정리; 장기 누수 미평가 | NOT RUN |
| 장점 / 단점 / 발견 문제 | public API/Worker; U5 기본 font 연결 | Group/metadata 활용; 생략 Z 보완 필요 | 미평가 |
| Layer 조회 / On-Off | NOT RUN | PASS: Layer 0 | NOT RUN |
| Hover / Select / Entity 정보 / Snap | NOT RUN | NOT RUN | NOT RUN |
| 지원 Entity / 문제 Entity / fidelity | LINE/CIRCLE/한글 TEXT 확인 | LINE/CIRCLE/한글 TEXT 확인 | 미평가 |
| 대형 파일 / 사용성 / Browser | U8A LINE 10만 개 측정; >10 MiB/실도면 미평가 | U8A LINE 10만 개 확대 지연 관찰; >10 MiB/실도면 미평가 | 미평가 |
| WASM 초기화 / DWG revision / parsing / memory | 해당 없음 | 해당 없음 | U7A AutoCAD 2000 2개 샘플 parse/free 확인; 다른 revision/장기 메모리 미검증 |

LINE, POLYLINE, LWPOLYLINE, CIRCLE, ARC, BLOCK, INSERT, TEXT, MTEXT, 한글 TEXT, DIMENSION, HATCH, SPLINE, Layer, Linetype 각각의 sample/결과를 TC-CAD-001 실행 시 행 단위로 추가한다. DWG의 parser 지원과 직접 renderer 지원을 별도로 표기한다.

## 동일 Sample 비교 양식

| File 식별/hash | Format | Viewer/version | File size | Load ms | Parse ms | First display ms | Entity count | Result | Rendering issue | Usability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| viewer.spec.ts 생성 fixture | DXF | dxf-viewer 1.0.48 | 코드 fixture 참조 | — | — | — | 미계측 | PASS: 기본 표시 | 선/원 시각 확인 | 기본 탐색 확인 |
| viewer.spec.ts 동일 fixture | DXF | three-dxf-viewer 1.0.44 | 코드 fixture 참조 | — | — | — | 미계측 | PASS: 기본 표시 | 원본 Z 생략 보완 | 기본 탐색 확인 |
| Sample 미제공 | DWG | libredwg-web / 미설치 | — | — | — | — | — | NOT RUN | 미평가 | 미평가 |

미측정 값은 0이 아닌 —/null과 사유를 사용한다. 환경/캐시/반복 횟수/console/memory/실패 원인을 함께 기록한다. DXF 동일 bytes 비교와 DWG 평가는 별도로 결론을 내며 단일 종합점수로 합치지 않는다.

## 다음 실행 기록 형식

Run ID / Date / Unit / Version / Commit 또는 uncommitted snapshot / OS·Browser·hardware / exact dependency versions / 실행 명령과 exit / automated total-pass-fail-skip / TC별 결과 / manual 증거 / 오류와 재시험 / Known Issues / 문서·요구 추적 갱신 여부를 기록한다. 완료되지 않은 시험은 NOT RUN 또는 BLOCKED 사유를 남긴다.

## U0B-20260907 — 실행 기반 0.1.0

- Source: 이 기록을 포함하는 `build(bootstrap)` Commit의 source snapshot; 실제 hash는 git log 참조.
- `db:generate`, `db:check`: PASS, Prisma Client 생성 및 실제 SQLite SELECT 1 성공.
- `typecheck`, `lint`: PASS (최종 warning 0). `npm test`: 2 passed / 0 failed.
- `build`: PASS, Next 16.3.4 webpack Production Build. `GET /` Production smoke: HTTP 200 및 CAD 도면 관리 문구 확인.
- 해결: Next ProcessEnv 타입 요구와 JSON named import 경고 수정. sandbox DNS/tsx IPC/Next child process/local port 제약은 허용 환경에서 재검증했다.
- DB schema/관리 기능/Viewer는 아직 NOT RUN. 승인 순서는 DXF 우선(ADR-011), 다음 Unit 1.

## U1-20260907 — Location/Version DB 0.2.0

- Prisma migrate deploy 성공: 202609070001_locations. 신규 임시 DB에도 동일 migration SQL을 적용했다.
- 자동 테스트 8 passed / 0 failed (환경 2, 실제 DB integration 6). Type Check/Lint 통과.
- 최종 Production Build 통과. 커밋 후보 39개 파일의 Secret/런타임 파일 제외 검사 위반 0.
- 위치 Unique, 8개 동시 등록의 순번 정합성, Current 0/1·교체·멱등·rollback, 타 Location 참조/Current 대상 삭제/존재하지 않는 소유자 거부, FK/Index를 검증했다.
- API/Upload 화면은 다음 Unit이다. 0.1.0 헤더의 미구현 등록 링크로 404가 발생한다는 사용자 제보를 확인했으며 Unit 2에서 실제 화면/API를 연결한다.

## U2-20260907 — 파일 등록 0.3.0

- 자동 테스트 20 passed / 0 failed, Type Check/Lint/Production Build 통과. 실제 Chromium E2E 2 passed / 0 failed.
- 사용자 제보한 `/cad/upload` 404 해결: 상단 링크→등록 화면→한글 파일명 업로드→성공 표시→원본 byte 다운로드를 실제 Browser에서 확인했다. 서버 3100을 새 빌드로 재시작했다.
- 정상 DXF/DWG, SHA-256·중복 식별, 빈 파일/미지원 확장자/크기 경계/잘못된 Metadata, Storage 실패, 파일 publication 후 DB constraint 실패 보상, traversal/symlink escape 차단을 검증했다.
- 실패 후 수정: Busboy의 limit 이벤트 경계 처리(정확한 한도/part 수), Next 내부 bind hostname과 Browser Origin 비교를 수정하고 재시험했다. 외부 Origin 거부도 확인했다.
- E2E는 독립 임시 DB/Storage, Chromium 1208 executable, 1440×1000 viewport에서 실행했다. 화면 capture는 Git 제외 test-results/upload-success.png이다. 실도면 rendering은 아직 NOT RUN.
- npm audit: high 4건(Prisma 7.10.0 전이 의존 deepmerge-ts, mysql2와 상위 패키지), omit=dev에서도 dependency graph에 포함된다. SQLite 경로는 MySQL 연결을 사용하지 않지만 패키지 보안 경고는 미해결로 기록한다. 자동 major downgrade/force fix는 수행하지 않았다.

## U-DELETE-20260911 — 삭제 비밀번호 보호 0.17.0

- 당시 `npm test` 17 files / 74 tests, production build, diff check가 통과했다. typecheck/lint는 최종 수정 전 실행 기록이므로 최종 snapshot 전체 통과로 해석하지 않는다.
- 정정: 당시 새 DELETE 통합 테스트는 salted hash 검증 및 기본 Current 삭제·순번 보존의 두 건이었다. 원본 정리 재시도·API 오류·Browser·실제 기존 DB backfill까지 통과했다는 이전 기록은 실행 근거가 없어 철회한다. repository가 비밀번호 인수를 사용하지 않는 누락도 후속 검토에서 발견했다.
- 0.17.0은 로컬 commit `1e5c5fd`/`09721ff`까지 생성했으며 당시 운영 DB backfill·GitHub push·GHCR 게시·Compose 배포는 미완료였다. DNS 실패 후 허용 환경에서 재시도하지 않아 원격 장애로 확정할 수 없었다.
- 후속 이슈 조치에서 인증된 fetch에 성공했고, 미게시 코드 보완 및 재검증을 수행한다. 실제 수용·게시·배포 결과는 이후 실행 기록을 기준으로 한다.
