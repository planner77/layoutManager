## U-218-CI703-20261108 — PR #272 Scope regression version fixture 보완

[CI #703/run42466803358](https://github.com/planner77/layoutManager/actions/runs/42466803358) exact HEAD `33557f568456a9dbd038325ce823203037ab35e4`는 Scope Check Issue에서 `test_rp_execution_fix.py` 19개 중 1개가 `RR2_PROBE_INPUT_RECEIPT_INVALID`로 ERROR를 발생시켜 실패했다. 과거 `0.61.0`으로 고정된 synthetic RR1 receipt와 OCI version label이 새 검증 함수가 강제하는 현재 source `0.61.1` 버전 계약과 충돌했다. Scope 초기 PR classifier7 / release HOLD6 및 RP7/CP12/Registry15 성공 결과는 Scope 전체 PASS가 아니다. Docker, Greenfield, G7 runtime, Static/Unit/Build, Chromium Job들은 Scope 의존성으로 SKIP이었다.

**수정 코드:** `test_rp_execution_fix.py`의 단 한 양성 Fixture에 `candidate_version = PROBE.PROOF.current_candidate_version()`를 도입해 receipt와 OCI label을 동일 현재 source 버전에 묶었다. revision mismatch/descriptor mismatch 음성 assertions, 별도 RR2 receipt/label mismatch negative regression, 운영 프로덕션 보호 및 required CI gates는 그대로 두었다. 새 source의 정확 HEAD 검증은 **NOT VERIFIED**이며 새 PR CI는 시작 이후 완료 감시하지 않는다. 로컬 전체 테스트는 이 도구 환경에서 NOT RUN, 이전 CI 실패를 성공으로 바꾸지 않는다.

---

## U-218-CI702-20261108 — PR #272 hosted 실패 및 보완 후 재검증 경계

**실패 근거:** [PR CI #702/run42462441494](https://github.com/planner77/layoutManager/actions/runs/42462441494), exact HEAD `2ffe33d37e55cbbaedc9c59ca8c93c8f460549eb`: Docker RR2 FAIL(`RR2_PROBE_INPUT_RECEIPT_INVALID`; 0.61.0 고정 vs source0.61.1), Greenfield FAIL(24 PASS/6 FAIL; Scene 없는 신규 L05 Version을 기존 `items[0]` E2E가 선택), Required Verify FAIL. Static/Unit/Build·G7 signed-runtime·일반 Chromium 두 shards는 원래 HEAD에서 성공, A2 scoped는 SKIP. Playwright artifact의 실패 snapshot에서 `l05-status.dxf`·`scene:UNAVAILABLE`을 확인했다.

**보완:** RR2 신규 source package 버전을 정규 SemVer로 확인해 receipt/OCI label/digest/revision/role 정확 대조를 유지했다. 임의·구버전 release 선언, 잘못된 receipt 버전 및 OCI version label을 거부하는 focused Python unit을 추가했고 recovery/upgrade snapshot version도 현재 source를 따르도록 했다. 기존 구 0.60.0 실제 이미지의 provenance/fingerprint 검사는 보존한다. Greenfield 외곽선/구역 테스트의 목록 선두 선택을 정확한 `synthetic-scene.dxf`·실제 Scene API READY 선행 확인으로 대체했다. CI 필수 gate·runtime Worker 구현·L05 mocked UI 동작은 변경하지 않았다.

**시험 상태:** #702의 성공 범위는 이전 HEAD 증거로만 기록한다. 이번 수정된 source에 대한 로컬 full Python/Node/Docker/Chromium 실행은 현재 연결 환경의 전체 repository 실행 worktree 부재로 **NOT RUN**이며, 새로운 exact HEAD hosted CI 역시 완료 확인 전 **NOT VERIFIED**다. 시험 누락·미완료 단계를 PASS로 표현하지 않는다. 이전 실패 원장은 불변 보존. 운영0.61.0의 Scene flags ON/1 Worker와 data/image/tag는 변경하지 않는다.

---

## U-218-L05-20261108 — 목록 Scene 상태 조회와 복구 UI 독립 QA

**독립 QA 판정: PASS_WITH_LIMITS.** Manager `gpt-6-astra`의 L-05 재작업 수용 뒤 QA `gpt-6-luna`가 controller/server/release 회귀와 지원 Chromium UI를 확인했다. Developer `gpt-6-sol`이 구현했고 Root가 통합·최종 Build/Type Check를 수행했다. 이전 Unit 이력과 미실행 경계는 변경하지 않는다. 요구·AC 정본은 [Issue218 LS01–07](Issue218.md), 요구/추적은 [Requirements](Requirements.md)·[TestPlan](TestPlan.md)이다.

| 검증 | 실제 결과 |
| --- | --- |
| Controller, batch projection, display/retry/service, release contract, populated upgrade recovery | QA 명령 `npx vitest run tests/unit/scene-status-controller.test.ts tests/unit/scene-build-status-batch.test.ts tests/unit/scene-build-display.test.ts tests/unit/scene-build-retry.test.ts tests/unit/scene-build-retry-service.test.ts tests/unit/issue218-release-contract.test.ts tests/integration/g7-scene-worker-upgrade-recovery.test.ts`: **7 files / 33 tests PASS**, 7.80s. 205 unique ID 직렬 100개 batch, late success/error, hidden/dispose, pending-only polling, 누락 제거, 실패 budget/수동 회복, 403 row clear, safe diagnostics, retry/release path를 확인했다. 401 clearing is covered by the shared status-code branch, not by a separate focused assertion. |
| Greenfield UI / browser lifecycle | QA 독립 명령 `env -u G7_GREENFIELD_E2E_ROOT G7_GREENFIELD_E2E_PORT=3335 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npx playwright test --config=playwright.g7-greenfield.config.ts --grep '#109 initial|L05 actual|L05 React'`: **4/4 PASS**, 14.8s. #109 first-install setup, 실제 synthetic home/Location 화면에서 상태 조회 오류→키보드 수동 확인→Scene 재시도→완료와 Current/메모 검색 유지, 그리고 React committed false→true same IDs 및 A→B→A stale Retry 회귀를 포함한다. Developer가 stale row text, Retry presence, enabled Retry를 layout commit에서 함께 관찰하도록 보강한 최종 React suite도 QA가 별도 실행해 **2/2 PASS**, 3.1s를 확인했다. |
| Stale Retry regression | Developer `gpt-6-sol`의 test-only esbuild override로 옛 unkeyed Provider를 재현한 두 committed-layout probe는 **2/2 RED**였고, true:A commit에 enabled Retry 1개가 관측됐다(`/tmp/layoutmanager-218-old-provider-red-final.log`). QA가 보강된 최종 keyed-source Greenfield React suite를 **2/2 GREEN**으로 실행했다. Deferred B/새 A 결과는 이전 scope를 복원하지 않았다. |
| 전체 unit/build 근거 | Root 실행 전체 suite **178 files / 1,120 tests PASS, 458.88s**는 keyed Provider UI-only delta 전 source 기준이다. keyed delta에는 Root가 마지막으로 **6 files / 31 tests PASS, 1.39s**, final Build 및 Type Check exit0를 보고했다. Final stable lint도 exit0, 0 errors, 12 pre-existing warnings로 통과했다. Full suite 결과를 final keyed source 전체 검증으로 확대하지 않는다. |
| 문서/범위 | QA `git diff --check` PASS. schema/worker/retry authorization 계약을 변경한 증거는 없으며, release contract 테스트에서 0.61.0→0.61.1 compatible edge와 schema drift/downgrade 거부를 확인했다. |

**제한 및 미완료 gate:** 브라우저 상태 조회와 retry 응답은 route-mocked synthetic data다. 브라우저 시험은 actual React/목록 DOM 및 authenticated synthetic upload 경로를 확인하지만 운영 CPU Worker의 새 Job→READY나 Browser를 통한 실제 G7 batch/retry service 실행을 증명하지 않는다. 기존 서버/retry/Worker 증거는 해당 unit/integration 시험으로만 기록한다. 390px Location 화면은 기존 표의 가로 스크롤을 유지하며 상태와 Current를 확인할 수 있었다. 운영 0.61.0/flags ON, DB·CAD·Worker, schema, registry/tag를 QA가 변경하지 않았다. PR/정확 HEAD CI는 아직 시작되지 않았고 CI는 **NOT VERIFIED**다. LS07 원격/PR 및 CI 시작 결과는 Root 통합 기록에 추가한다. 이 QA는 PR 게시·CI 시작·모니터링·병합을 수행하지 않았다.

**Root 통합 전 검사:** 최종 source Build/Type Check exit0, 안정된 파일 집합의 ESLint exit0/오류0·기존 warning12다. G7 업그레이드·복구 집중3files/24tests PASS(34.48s), PR scope7/release HOLD6/Python G7 upgrade11 PASS도 확인했다. 원격 main `1f64808` 기반/behind0, 현재 open PR0으로 기존 미해결 review 대상이 없고 local 충돌0이다. 원래 작업 폴더의 dirty Compose/next-env2개를 보존했으며 새 worktree의 Secret/runtime 산출물 제외 검사를 통과했다. 정상 commit/push/새 PR와 정확 HEAD CI 시작은 이어서 수행하며 새 hosted CI 성공은 아직 확인하지 않았다.

---

## U-225-G3-20261108 — 승인된 제한 파일럿 운영 전환 독립 QA (2026-11-08)

**판정: 독립 QA `PASS_WITH_LIMITS`; Manager `ACCEPT_LIMITED_PILOT`.** 사용자 명시 GO는 PR270/Main `365ebe578cb82e27f7eaf2bad9c6a138377a9f04`의 짧은 maintenance/fresh backup, exact 0.61.0 transition, Scene flags ON, 단일 CPU Worker, 데이터 보존/복구 계획에 한정된다. NO_NUMERIC_SLA를 유지한다. 운영 작업은 Root만 수행했고 QA는 receipt, source, archive 및 disposable fingerprint를 읽기 전용으로 검토했다.

| TC | 실제 결과 |
| --- | --- |
| G3A01 승인·identity | PASS — private Owner GO receipt에 authorized scope, PR270/Main, target 0.61.0 및 `NONE_USER_SMALL_INTERNAL_ORG`가 결합됐다. App/Migrator/CPU Worker는 각 고정 published SHA256 digest, image ID, source `33f377c3282e99b87aa487b9924edf305ca1753b`와 일치했다. 운영 original App/volume/port/Origin/G7 설정을 식별했고 기존 dirty Compose hash 보존을 정리 receipt에서 확인했다. Git tag/latest 및 추가 GHCR 게시를 하지 않았다. |
| G3A02 fresh recovery point | PASS_WITH_LIMITS — Root는 기존 App을 중지하고 새 capture `39b4fee737c493a54f3364a696bd51f27b9ae341095ead310380a29b0c403978` (1,802,240 bytes)를 만든 뒤 같은 App/CID를 healthy로 재개했다. 관측 outage는 13.572s. 두 stopped-boundary FD 표본은 write FD 0, positive 표본 writer는 original App process에 결합, Docker writer 0이며 capture/frozen comparison hash는 일치한다. 등록 schema 독립 검증과 restored DB `sqlite_fingerprint` 재계산에서 33 tables/51 rows, per-table row fingerprint, schema/install hashes, CAD ref1 일치. `hostWriterExclusion=ROOT_ATTESTED_NOT_INDEPENDENTLY_PROVEN`를 유지하며 유한 `/proc` FD 표본을 절대적 host-writer 부재 증명으로 확대하지 않는다. |
| G3A03 rollback 준비 | PASS_WITH_LIMITS — 같은 fresh archive를 새 owned volume에 복원했다. `RAW_AND_LOGICAL_MATCH`, 33 tables 및 independent DB fingerprint가 archive와 일치; exact 기존 0.58 App image의 별도 internal/host-port 미게시 startup에서 health/status HTTP 200을 확인했다. Restore는 3.665s, startup은 7.422s 관측. Fresh old-App 경로에서는 public CAD HTTP readback을 하지 않았고, CAD 보존은 restored copy의 raw/logical bytes와 independent DB reference hash로 확인했다. 이 old-volume 복귀는 in-place downgrade 또는 0.61 recovery-set restore가 아니다. 최종 active pilot 이후 신규 business write가 없어 rollback-before-new-write 보존 동작은 실행하지 않았다. 복구 volume은 read-only/no-App 24h lease로 보존한다(24h 지속 감시를 뜻하지 않음). |
| G3A04 정식 전환 | PASS — fresh frozen plan은 exact 0.58.0→0.61.0, source/digest와 `UPGRADE_MIGRATION_REQUIRED`를 제시했고 Root가 정식 execute를 수행했다(15.015s). Migration 후 stopped DB는 33→34 tables; 기존 51 logical rows/CAD/installId 및 registered manifest/pinned pair exact, 신규 migration history 2개, scene job0, integrity/FK pass. 동일 release 공식 start 후 Scene 두 flags OFF 단계에서 healthy·runtime ACTIVE/status200/public CAD 1개 SHA 일치. Freeze부터 flags-OFF healthy까지 관측 87.170s. |
| G3A05 제한 활성화 | PASS_WITH_LIMITS — 승인된 Compose/env hash로 동일 App과 고정 CPU Worker image를 시작했다. App/Worker 모두 기존 `/data` volume을 사용하며 Scene flags ON, 단일 Compose Worker UID10001, CPU1, RAM768MiB, PID64, network none, read-only root, cap-drop ALL, no-new-privileges, tmpfs96MiB, restart0 확인. 두 관측 tick은 IDLE. runtime ACTIVE/auth/write enabled, host health200, public CAD1 SHA match. 이후 34-table integrity/FK 및 기존 migrated data/manifest/CAD 보존 비교가 일치; scene jobs0, legacy auto-backfill false, 신규 business data 미관측. 활성화→healthy는 7.669s 관측. |
| G3A06 판정·정리 | PASS_WITH_LIMITS — exact actual evidence closure가 32개 파일 SHA를 결합했고 독립 QA가 모두 일치함을 확인했다. 5개 임시 no-data image lease 제거, dirty hashes exact, fresh archive/검증한 old restore volume 보존, 현재 운영 App/Worker 유지 receipt를 확인했다. `SCENE_AUTO_BUILD_ENABLED`/`SCENE_CPU_WORKER_ENABLED`는 제한 파일럿에서 ON, automatic legacy backfill0, 자동 publisher HOLD 및 #218/#268 범위는 별도다. |

G2에서 결합을 재확인한 기존 exact three-digest signed candidate LINE HTTP→CPU Worker→fresh authenticated Viewer/reload 증거는 별도 artifact binding과 함께 재사용했다. 이는 actual production journey가 아니다. 새 production authenticated Scene journey와 actual production account 로그인은 **NOT RUN**이고, 이번에 새 사용자를 만들거나 권한을 변경하지 않았다. Runtime Worker는 두 IDLE tick만 관측되어 실제 신규 production Scene build/READY는 입증하지 않는다. Root private closure receipt `g3-actual-closure.json` SHA256 `92dac80ac6b4910cabf71ea90fa640182d9154b5765f79dffa93cbd2f6757264`에 증거 파일 hash가 결합되어 있다. QA는 Docker/host process/운영 데이터를 조작하지 않았다.

13.572s capture 재개, 87.170s freeze-to-flags-OFF-healthy, 15.015s migration 및 7.669s pilot activation은 각 단계의 실제 관측 시간이며, 전체 전환 RTO 또는 사용자 SLA로 제시하지 않는다. 사용자 답변에 따라 별도 숫자 SLA를 만들지 않았다. backup 기준 accepted write0 및 신규 business-data 관측0은 receipts로 확인했지만 historical external writer의 과거 배제는 증명하지 않으며, long-term 운영 성능/실도면 지원 subset 판정은 이 전환으로 확대하지 않는다. GO는 Manager의 제한 파일럿 수용이며 향후 일반 운영 변경/지원범위 확대/별도 이슈 종료를 자동 승인하지 않는다.

---

## U-225-G2-ACTUAL — retry와 독립 복구 fingerprint QA (2026-11-08)

**판정: actual isolated clone/recovery evidence PASS_WITH_LIMITS.** Root의 immutable archive retry evidence와 별도 baseline-recovery receipt를 read-only로 검사했다. 실행은 독립 QA가 아니라 Root가 수행했으며 receipt에 기록된 네 helper source의 SHA256이 검토한 source와 모두 일치한다. retry execution `exit=0`, 21.261s, `operatingActions=false`; helper 결과는 archive SHA `625e6b36e2bcb9c94e5e1d7bba735c7f26323ee963f212b58121f5d6a5ef1057`에서 0.58.0→0.61.0, 33 tables/CAD 1개 보존, App healthy·ACTIVE/status 200, 공개 CAD 1개 SHA 일치, host port 0, probe 후 stopped를 보고한다. Retry cleanup `exit=0` 및 owned volume 제거 결과를 확인했다. Attempt 1의 network-ID halt와 별도 cleanup receipt는 실패 이력으로 유지한다.

독립 복구 재검사는 원본 `capture.tar`의 실제 SHA가 위 immutable hash와 일치함을 확인하고, 기존 `sqlite_fingerprint`로 원본과 private `after-old-app.tar`를 각각 별도 disposable temp extraction에 읽었다. 33개 table, 35 logical rows, 전체 per-table row fingerprint, registered schema hash, install manifest hash, CAD/Scene/orphan/deletion reference 집계가 두 archive에서 일치했다(CAD 1, 나머지 0). 복구 receipt도 PASS: 정확 old App image ID, restore→healthy 8.208s/전체 10.517s, health/status HTTP 200, CAD content 1개 SHA 일치, owned clone/network/volume 제거 및 같은 archive hash를 확인했다. 이는 실제 clone 신규 실행과 별도 volume의 기존 0.58 baseline 복귀 rehearsal이며 in-place downgrade나 0.61 recovery set restore가 아니다.

G2C03은 exact three-role digest에 결합된 기존 signed RR2/RR3 candidate artifact binding preflight를 재사용했다. artifact·verification·independent crypto·postrelease audit hash가 보고와 일치하고 role digest가 확인된다. 이는 이번 snapshot clone의 새 HTTP/Worker/Viewer run이 아니다. G2C04 실제 clone 정상 사용자 auth journey는 **NOT RUN**이고 계정/hash/session 변경은 없었다. Scene flags `SCENE_AUTO_BUILD_ENABLED`/`SCENE_CPU_WORKER_ENABLED`는 OFF, 공개 host port 0; App의 기존 auth/CAD runtime status는 true로 확인됐다. Attempt 1 failure는 FailureLedger에, retry/recovery private receipts는 `data/release-proof/issue225-completion-20261108/`에 보관한다.

관측한 21.261s trial 및 8.208s/10.517s restore 시간은 격리 시험 측정값이며 운영 outage/SLA 수치가 아니다. NO_NUMERIC_SLA를 유지한다. 이 clone은 과거 archive를 재현한 것으로서 historical host-writer 배제, backup 시점 이후 실제 운영 write 수락 0, rollback 전 upgrade 후 신규 write 보존, auth/Viewer clone journey, Owner GO-PILOT을 입증하지 않는다. 운영 App/volume/flags/계정/registry/tag를 변경하거나 운영을 중지하지 않았다. 이 QA는 evidence audit/fingerprint만 수행했고 Docker 동작·cleanup을 재실행하지 않았다.

---


Root의 최종 로컬 검사는 build/typecheck/lint exit0(기존 warning12/error0), Vitest177files/1108tests PASS415.47초다. 재시작으로 결과를 회수하지 못한 선행 실행은 성공으로 수용하지 않고 별도 보존했다. 현재 required clone 자동 discovery는 새9개 집중 가드를 포함하며 기존 CI YAML/게이트는 변경하지 않았다. 정확 HEAD의 필수 CI/통합은 이 기록 시점 다음 단계다.

---

## U-225-G2-ACTUAL-ATTEMPT1 — 격리 업그레이드 후 App 생성 검사 HALT (2026-11-08)

첫 실제 helper 실행은 exit1/13.724초, stage NEW_APP_READBACK/code G2_NEW_APP_IDENTITY다. 소유 복제본의0.58→0.61 migration/data 비교 경로 이후 새 App start 전에 멈췄다. 생성 전 network object는 정확하지만 CREATED container runtime NetworkID가 비어 있는 실제 관측을 FailureLedger에 보존했다. App 기동/조회·전체 G2는 FAIL/NOT RUN 경계이며 migration 관측을 전체 성공으로 확대하지 않는다. 지원 cleanup exit0/소유 volume 제거·immutable archive SHA 보존을 확인했고 운영 App/volume에는 쓰지 않았다. 수리/독립 회귀 후 새 namespace의 재시험이 필요하다.

---

## U-225-RESUME-20261108 — PR269 통합 및 잔여 Gate 재개

GitHub readback에서 PR269 exact HEAD b2cbbb6의 CI697/699 SUCCESS, CI698 CANCELLED 및 종속 required FAILURE를 확인했다. Maincf2427ff7f65d1e9ab7b8e5ba87dbeb2d87c13db로 정상 squash 병합됐으며 앞선 PR CI 시작/미병합 문구는 당시 이력이다. 취소 원인은 미확정이고 FailureLedger에 실제 Job 경계를 추가했다. 기존 사용자 원래 dirty2개와 운영0.58 healthy를 보존한 최신 Main 별도 worktree에서 잔여 작업을 재개한다.

사용자는 소규모 내부 운영에 별도 RPO/RTO 수치 기준이 없다고 답했다. 수치 SLA를 만들지 않고 실제 측정·백업 보존/복구·전환 쓰기 중단을 기록한다. 기존 OR58-ACTUAL/FUP1 및 G1 schema·REGISTRY 근거는 재사용한다. 실제 운영 snapshot 복제본의0.58→0.61 호환성/실증과 최종 Owner GO는 아직 신규 실행/수용 전이다. 새 운영 stop/start/capture/restore·배포·flags/태그/registry 쓰기는 수행하지 않았다. GO-PILOT NO-GO·#225/#218 OPEN이다.

## U-225-G2 — 독립 로컬 QA 초기 결과 (2026-11-08)

**초기 판정: 로컬 가드 QA PASS_WITH_LIMITS.** 현재 동기화된 source를 별도 QA 역할로 직접 검증했다. 앞선 host restart로 인해 이전 Developer 완료 기록을 전제하지 않았다. 당시 Root actual attempt 1은 immutable archive를 복원하고 upgrade migration 뒤 새 App 시작 전까지 진행했으나, Docker CREATED container의 runtime `NetworkID`가 아직 빈 값이라 post-create check가 중단했다. 실제 post-upgrade App health/status/CAD readback 및 auth journey는 완료되지 않았고 이 attempt를 PASS로 세지 않는다. 당시 Root는 실패한 소유 자원을 정리하고 재시도를 준비 중이었다. 후속 retry 결과는 최신 `U-225-G2-ACTUAL`에 별도로 기록한다. Attempt diagnostic은 private `data/release-proof/issue225-completion-20261108/actual-g2-network-diagnostic.json`에 보관된다.

| TC/검증 | 실제 결과 |
| --- | --- |
| G2C01 | PASS — 신규 g2 clone guard 8개 중 registered schema bridge가 restore 전에 거부되는지, 잘못된 image digest가 clone 생성 전에 차단되는지 확인. 실제 immutable archive 재확인/restore는 미실행. |
| G2C02 | PARTIAL / RETRY REQUIRED — attempt 1은 clone restore 및 official plan/apply migration 뒤 CREATED container의 아직 미할당 runtime network ID에서 halt. Manager-reviewed fix now checks owned internal network object and permits only empty-or-exact ID pre-start, requiring exact runtime ID during post-start health polling. 실제 post-start verification은 미완료. |
| G2C03/C04 | NOT RUN — 기존 exact-digest RR2/RR3 candidate 근거를 재사용하도록 경계되어 있으나 candidate-bound upload/Worker/Viewer나 actual clone 정상 사용자 인증을 재실행하지 않음. |
| G2C05 | PASS — durable child journal reload, create-timeout cleanup intent, foreign CID removal 거부, nonroot snapshot 입력을 bounded table/column names로 제한하는 신규 가드 PASS. Existing RR2 cleanup 3/3, OR58 auth-clone 5/5 PASS. 실제 runtime isolation/cleanup은 미실행. |
| G2C06 | PASS — initial G2 guards 8/8; focused updated G2 guards 9/9; initial required clone discovery 22/22; RR2 cleanup 3/3; OR58 auth-clone 5/5; OR58 proof 28/28; registered OR58 schema 6/6. Python compile, Node syntax check, `git diff --check` PASS. |
| G2C07 | PASS_WITH_LIMITS — 사용자 답변에 따라 NO_NUMERIC_SLA를 유지. 실제 recovery elapsed time, freeze 중 수락 쓰기, rollback 전 신규 쓰기 보존은 NOT RUN. |

코드/수명주기 검토에서 QA는 Docker clone을 실행하지 않았다. 정해진 archive/published digest/source, 공식 plan/apply, schema preflight, named nonce ownership 및 exact cleanup, 새 App의 내부 network와 host port 미게시, readback 뒤 App 정지, CAD content endpoint의 DB SHA 일치 검증을 검토했다. 공개 CAD 조회는 일반 endpoint를 사용하고 인증 우회는 추가하지 않는다. Snapshot child는 nonroot이며 baseline으로 table/column 이름만 64 KiB 이내 전달한다. helper 출력에는 CAD/row bytes와 credential이 포함되지 않는다. 기존 candidate 증거는 actual clone 증거와 혼합하지 않는다. 새 network guard fix의 독립 focused 9개 시험은 PASS이며 Docker 재시도/운영 clone은 이 재확인에서 수행하지 않았다. NO_NUMERIC_SLA는 blocker가 아니다. QA는 code edit, Docker mutation, commit, push를 수행하지 않았다.


## U-225-G1-SCHEMA-20261108 — 독립 exact 0.58 schema QA

**판정: 독립 QA PASS_WITH_LIMITS; Manager 최종 ACCEPT_WITH_LIMITS.** 역할은 지정 모델 경계에 따라 gpt-6-astra Manager, gpt-6-sol Developer, gpt-6-luna QA로 기록한다. 이번 QA에서 허용된 소유 synthetic 검증만 수행했으며 제품 코드·운영 schema·버전 0.61.0은 바꾸지 않았다.

| TC | 실제 결과 |
| --- | --- |
| G1S01 | PASS — synthetic archive는 production 0.58 release declaration 및 full application schema/history를 통과했고 CAD/Scene local byte refs를 확인했다. |
| G1S02 | PASS — 같은 DB의 추가 table/index/trigger, column drift, 등록 index 누락을 거부했다. restore preflight 거부 시 Docker와 `validate_original` 호출 0. |
| G1S03 | PASS — migration 누락/extra, checksum, completion, rollback, newer migration 및 manifest version/schema/image 불일치를 거부했다. |
| G1S04 | PASS — WAL을 disposable extracted copy에서만 처리했고 archive hash 불변, CAD/Scene mismatch와 참조 오류를 거부하는 기존 제어를 보존했다. 운영 Docker/network/.env 접근 0. |
| G1S05 | PASS — 검사기 부재, 비정상 종료, 잘못된 stdout, stderr, timeout 및 runtime 예외를 fail closed; bridge 출력은 고정 성공 토큰뿐이다. |
| G1S06 | PASS_WITH_LIMITS — 기존 OR58 proof suite 28 + 신규 schema suite 6 = 34 tests PASS (14.760s); 기존 auth-clone 회귀 5 tests PASS (0.062s). PR CI는 npm ci 이후 신규 schema suite를 실행한다. |

Root가 별도 수행한 immutable historical archive offline recheck도 PASS다. 원본 archive `625e6b36e2bcb9c94e5e1d7bba735c7f26323ee963f212b58121f5d6a5ef1057` 전후 동일, 등록 0.58 schema fingerprint `eb07b73207cdd9d962185fe2e68ef70d5a837fd9294dfc9214829a8bbf059109` 및 33 tables, CAD ref 1/Scene ref 0/orphan 0/deletion 0 확인. Receipt는 private 경로에 보관되며 SHA256 `5ec301576a8295c1e0be115f3e8596d87cc461237084fe14666b225bc463d4c1`. Docker 호출은 throw로 봉쇄했고 신규 capture/restore/live start는 없다. 이는 immutable historical archive의 offline schema 확인이며 새 동일-snapshot 운영 capture/restore, 독립 host-writer 배제, RPO/RTO 수용, Owner GO를 입증하지 않는다.

기존 TestReport OR58-ACTUAL/FUP1의 실제 backup·독립 volume 복원·정확 old App 및 정상 인증 조회 관측은 기존 증거로 유지하며 이번에 반복하지 않았다. GO-PILOT은 NO-GO. host-writer 독립 증명/RPO/RTO acceptance는 미완료다. FUP5/#268은 별도 후속이다. Root 별도 전체 검증은 build/typecheck/lint 모두 exit 0 (lint 기존 warning 12, error 0), Vitest 177 files / 1,108 tests PASS (422.12s), release scope classifier 7 및 release hold 6 PASS. 이 결과는 QA가 직접 실행한 Python suite와 구분한다. QA 기록 시점에는 commit/push 전이며 최종 source commit·PR CI 시작 정보는 해당 PR을 따른다. 새 hosted CI 결과는 미확인이며 모니터링·병합하지 않는다.

## U-225-FUP4-20261108 — 미지원 section/table·BLOCK/INSERT 지원 설계 검토

**판정: DESIGN_ONLY, 독립 QA PASS_WITH_LIMITS·Manager ACCEPTED_DESIGN_WITH_LIMITS.** 이번 산출물은 다음 최소 구현 Unit과 후속 범위의 계약·시험 계획이다. 추적되는 converter/scanner/fixture/code·dependency/package/CI·제품 parser/Builder/admission/Worker/Queue/DB/flags 변경0이며 앱0.61.0/운영0.58.0을 유지한다. 실제 전체 도면은 기존 FUP3에서 UNSUPPORTED·payload0이고 이번에 runtime 지원을 추가하거나 실제 도면을 변환하지 않았다. 요구사항 FR-FUP4, 수용 기준 FUP4-D01–08 및 수학/의미의 단일 정본 Architecture FUP4를 따른다.

Manager가 요구사항·8개 설계 AC를 먼저 기록하고 Developer가 허용된 immutable archive의 집계 gap을 분석했다. fresh primary-research agent가 Autodesk 공식 문서24개를 확인해 Architecture 한 곳에 사실·설계 선택·미확인 사항을 구별해 기록했다. Manager가 설계를 검토하고 현재 가용 독립 QA agent가 source/집계/수학 근거를 대조한다. 과거 지정 모델을 실행했다고 기록하지 않는다.

| 실제 집계 관측 | 결과와 해석 |
| --- | --- |
| 원본 결합 | immutable archive SHA `625e6b36e2bcb9c94e5e1d7bba735c7f26323ee963f212b58121f5d6a5ef1057` 전후 동일, source1,117,143bytes/SHA `6d761ecb1ab59664425eb1dcc6837a12611536c8e03e3f7855951a76786d159c` 일치. 최종 verifier는 snapshot의 CadFileVersion에서 storage_path/sha256/file_size3열만 LIMIT100001로 읽고 source16MiB 상한을 확인. 원본 재인코딩·도형 subset 추출·CAD artifact0 |
| section/header/table gap |6sections, nonempty CLASSES98records/OBJECTS114records. HEADER213variables 중203개가 FUP3 whitelist 밖, required LWDEFAULT 부재.9tables 중 LTYPE26/LAYER24/STYLE8/APPID28/DIMSTYLE16/VPORT1/BLOCK_RECORD147 및 empty UCS/VIEW. 이는 format invalid 판정이 아닌 현재 후보의 지원 범위 gap |
| primitive type와 지원 구별 |2503 LINE/CIRCLE/ARC/LWPOLYLINE typed records 모두 FUP3 제외5/330 존재. geometry/type 개수만으로 지원 수를 계산하지 않음. noncontinuous LTYPE·plot style·STYLE1071 등 별도 의미도 남아 있음 |
| block/INSERT |147definitions, anonymous flag70 bit1=128; 별도 name class는 reserved-system2/other-star128/plain-ASCII17.285INSERT(root10/nested275), defaultscale20/positive3Duniform252/negative-or-mirrored13, nondefault normal9/attribute chain(group66)=4. rootINSERT에서 reachable7definitions·anonymous0. flags/name분류와 scale-compatible/실제전체수용을 혼동하지 않음 |
| 실제 한계 |실제 BLOCK_RECORD147개 모두 LAYOUT340 존재·record70은 부재로 독립 확인했다. group70 존재 개수0을 wire값0으로 해석하지 않는다. nonempty sections/추가headers/tables·anonymous/text/attributes/OCS 등으로 최소 후속 후보가 구현되어도 전체파일은 계속 거부 대상. raw record 추정은 world segment5000·fidelity/runtime 입증이 아님 |

Developer 최종 분석 `developer-analysis-v2.json` SHA256 `08344e0527d8d2ad7d5c5d7c10531edcd8c5d1a189114d6c58135b71b82b3ffe`, 선택-source verifier `developer-verify.py` SHA256 `49290e6c76505cab4d0031b8ac2376dc43b7dd2cbf30a5cf052cecc8cd6d286b`, 최종 v4 관측 SHA256 `a10e4d6e17360965f726392356b43f0083b395ddb0e69a58eb0e637c8f0532f6`다. 최초 상세 census는 inline 실행으로 script artifact가 없었음을 분석 receipt에 명시했고, 선택-source/추가 집계 verifier는 보관했다. 독립 QA의 재집계 여부와 범위를 별도 receipt로 확인한다. 이 도구는 고정된 private source의 관측용이며 재사용 가능한 DXF admission validator가 아니다.

| 설계 검토 대상 | 계약/향후 수용 조건 |
| --- | --- |
| 최소 구현 |FUP5-STATIC-XY: named static blocks, reserved empty space containers, 정확 BLOCK_RECORD·owner/ref, default OCS/모든Z0/thickness0, Sx=Sy=s>0/Sz∈{1,s}. 배열이 아닌 INSERT와 기존4primitive만. 행렬·style·count를 재검증하는 새 source-bound offline CANDIDATE identity를 제안했으며 아직 미구현 |
| 변환/상속 |nonzero base→scale→rotation→translation과 nested 순서, effective layer0/BYLAYER/BYBLOCK, ancestor visibility conjunction·lock/plot provenance, unresolved root BYBLOCK 정책. G1/G2/G3/G3b/G4/G5는 합성 손계산 및 future fixture 계획이며 converter 실행 PASS가 아님 |
| 정밀도/자원 |world chord0.05mm+Float32 Euclidean0.05mm, scaling후 재검증/세계 좌표 segment5000 상한 유지. cycle/missing/depth-aware memo/shared DAG·확장instance/leaf 한도와 hidden/unused 검증 계획. σ만으로 world buffer를 재사용하지 않음 |
| 미지원/미확인 |nonempty CLASSES/OBJECTS·추가headers/tables, affine/reflection, attribute/text/font/array/OCS/3D/xref/dynamic 등은 별도 후속 Unit. BLOCK_RECORD280/281 numeric wire/default를 추정하지 않고 최소profile에서 presence 거부 |

Primary research receipt `primary-research.json` SHA256 `5d3549fb0fe5ab33506261d0af435c6721ab242afd8123ae72065be702301ad8`는 official URL24개·실제 확인 범위·미실행·비차단 미결 및 Architecture SHA256 `fbd2d965e9664126a049d6b50d378cf493c2e478c97f4e3bbc37bf0f60d78109`/FUP4 section SHA256 `a66caf72a57b70934a3841a190ad45487269dd8cff46d14d5ddbc7684c1b410e`를 결합한다. 개별 spec 주장 링크는 Architecture에만 둔다. 실제 이름·handle·text·font·좌표는 공개 문서/commit에 넣지 않으며 private evidence는0700/0600으로 보관한다.

**이번 실행과 미실행:** read-only 집계·공식 source 조사·설계 계산·문서 검토를 수행했다. 새 converter·app build/type/lint/앱 전체 unit/browser/CPU resource/120s/OOM/runtime Scene 시험은 이번 docs-only Unit에서 미실행이며 PASS로 수용하지 않는다. 기존 FUP3 CI/테스트는 아래 별도 완료 이력이다. Root는 Markdown-only diff·link/hash·whitespace·비밀/산출물 제외 및 PR CI를 최종 통합 gate로 확인한다. 독립 QA receipt `qa-independent.json` SHA256 `f9187473e10da3df87d124e7c73305d7cac94bfca760884f0f45cfe2450919d6`(0600)는 최종 Architecture/section·primary research·Developer 근거를 결합한다. QA는 실제 source gap과 합성 손계산을 독립 확인하고 필드 부재와 값0을 구별했으며 blocking finding0으로 설계를 제한부 수용했다. 최초 기준점을 빼는 평행이동값을 기준점 자체로 해석한 golden 검토 우려는 원식과 별도 계산으로 해소됐다. Manager receipt `manager-acceptance.json` SHA256 `a4aa188e71aee06aea67b4c546516d800715ab26d85e2a23168896cb26ab025b`(0600)는 이들 최종 근거와 설계 정본을 결합하여 DESIGN_ONLY 범위를 제한부 수용했다. 구현 재작업은 없으며 다음 FUP5 converter 구현·runtime proof·제품 지원과 실제파일 수용은 별도 작업이다.

---

## U-225-FUP3-20261108 — HEADER/TABLES·layer/style offline 후보 구현·검증

**후속 통합 완료:** [PR #266](https://github.com/planner77/layoutManager/pull/266) exact HEAD `3235f5836391a762cd7de7919ff8b653f2ad6b6c`는 [CI #695](https://github.com/planner77/layoutManager/actions/runs/42432263382) 적용8개 SUCCESS/별도 A2 SKIPPED 뒤 Main `059d0701381a9182595a4d03cebc66c9e5e21ac7`로 정상 squash 병합됐다. Main tree는 시험 HEAD와 동일한 `d33d2a0cd56ffb5fcf6b717985441396cb0a0be4`이고 이전 Main 단일 parent를 확인했다. Draft 개방의 CI694는 ready_for_review 전환으로 취소됐으며 PASS로 수용하지 않았다. 아래 CI/Root 통합 대기는 당시 source 수용 시점 기록이다. 운영 배포·flags·registry/tag 변경0, 원래 dirty2개와 운영 이미지 healthy 보존 및 소유 검증 자원 정리는 최종 private receipt SHA256 `6bf8d9a82b0aba0fb3dbe71c03aa51f979427c941f4ccfe541821caed038666f`에 기록했다. 이번 FUP4의 새 runtime 시험으로 재사용하지 않는다.

**판정:** 독립 QA `PASS_WITH_LIMITS`. AC1018/INSUNITS4의 좁은 HEADER·TABLES·LAYER·LTYPE 및 optional dormant STYLE semantics를 기존 primitive geometry에 결합한 별도 `offline-cpu-styled-primitives@1 / node-cpu-styled-primitives@0.1.0+cad-scene-1 / CANDIDATE`를 시험했다. 제품 Scene/READY/Worker로 수용하지 않는다. 앱0.61.0·운영0.58.0, 제품 parser/Builder/admission/Worker/Queue/DB/Schema/flags 및 운영 배포를 변경하지 않았다. Root local checks/actual proof는 완료했다. Manager는 아래 근거로 offline 범위를 `ACCEPTED_WITH_LIMITS` 수용했다. Exact-head PR CI와 Root 통합은 남은 gate다.

Manager가 범위·AC/TC와 Architecture contract를 기록하고 Developer가 별도 parser/DTO/restorer·fixture·시험을 구현했다. Manager는 source를 검토했고 blocking finding이 없었다. Root가 source-frozen resource/browser/actual archive proof와 전체 app checks를 실행했다. 현재 가용 QA agent가 focused tests와 실제 immutable archive replay, source/evidence hash, production 경계와 문서를 독립 확인했다. 과거 지정5.6 모델을 실행했다고 주장하지 않는다.

| 구현·경계 | 실제 결과 |
| --- | --- |
| HEADER·structure | AC1018, explicit UTF8/UTF-8/ANSI_1252, INSUNITS4, LWDISPLAY0, 제한된 current defaults만. HEADER→TABLES→ENTITIES 순서/유일성/EOF를 지키며 unknown section/table/header/field는 전체 거부 |
| TABLES·symbol | 필수 LTYPE CONTINUOUS/LAYER, 선택 STYLE; capacity70은 실제 record count의 상한이며 equality 가정은 하지 않음. ASCII case-insensitive symbol/handle collision, canonical nonzero hex handle, table owner330, required layer0·linetype reference 검증 |
| color·visibility | entity/layer ACI와 RGB420 precedence 재계산; layer off/frozen 및 entity visibility는 숨김으로 보존하되 geometry와 전체 segment 예산을 계속 검사. locked는 visible/nonfade metadata, plot은 interactive visibility와 별도 |
| linetype·lineweight | BYLAYER 또는 continuous만; entity→layer→header DEFAULT precedence와 origin 보존. LWDISPLAY0의 fixed 1px hairline로 렌더하며 physical-width/plot fidelity는 주장하지 않음 |
| dormant STYLE | 제한된 finite STYLE metadata·basename font string만 검증·보존, font file I/O/로드0. TEXT/MTEXT/ATTRIB/ATTDEF/shape는 계속 미지원 |
| DTO·product boundary | exact schema/state/builder/source/count/refs/declared+resolved key/type 검증; RGB/visible/locked/plot/weight를 symbol tables에서 재계산. 새 identity scope/manifest/stored payload 거부, 기존 FUP2 strict LINE path 유지 |

### 최종 source와 focused 회귀

최종 source closure의 10개 파일 SHA256은 현재 worktree와 Root의 actual/final verification receipts가 모두 일치했다.

| Source | SHA256 |
| --- | --- |
| `src/tests/oci/offline-cpu-styled-primitives-browser-entry.mjs` | `a9de78af31094676cbc3b44cdc6ea6921d9b528ad14a163d34ca62f885cf61d3` |
| `src/tests/oci/offline-cpu-styled-primitives-browser-server.mjs` | `a2937d7e2d34eaa29b20f792aaf01936f0ca7ad141cf84a998390f660e615dba` |
| `src/tests/oci/offline-cpu-styled-primitives-dto.mjs` | `face506ae4350ae6e4e444062d64873bc83a87837dd16aff3d85cd4ef22dc59b` |
| `src/tests/oci/offline-cpu-styled-primitives-proof-fixtures.mjs` | `253d94d3b35a7b4284ff710b298bc273f74c9af0a84d8c0f69a59b6584a14b62` |
| `src/tests/oci/offline-cpu-styled-primitives-resource-child.mjs` | `4449a9b6b3da279f5d1980bf678c33542a7151138d5c7dba01c75f90086b0bbd` |
| `src/tests/oci/offline-cpu-styled-primitives-resource-proof.py` | `0ad3ab827929d8393b4a9b8e86d53c32210fd23545d7d8e378ea84139565a87b` |
| `src/tests/oci/offline-cpu-styled-primitives.mjs` | `8eed54d958cf06e80ab686b0bae62b2a8dfa1513a3ed318d9abf48e7197fccf0` |
| `src/tests/oci/offline-cpu-styled-primitives.test.mjs` | `6a98d07be9276b90a176fad2b78769e7284defc479edd642ee3876619e5ec421` |
| `src/tests/oci/test_offline_cpu_styled_primitives_resource.py` | `2b9efb984990970e170bcaf3a86b8f81cafb325d2d74562a5b3151dd43d4980d` |
| `src/tests/unit/offline-cpu-styled-primitives-admission.test.ts` | `bc6401eba4dd49562a42a087c601be5dedc0432be4eb1aed1737c4fd666ae022` |

독립 QA 실행 결과:

- `node --test tests/oci/offline-cpu-styled-primitives.test.mjs`: 9/9 PASS.
- `PYTHONDONTWRITEBYTECODE=1 python3 tests/oci/test_offline_cpu_styled_primitives_resource.py`: 7/7 PASS.
- `npx vitest run tests/unit/offline-cpu-styled-primitives-admission.test.ts tests/unit/offline-cpu-primitives-admission.test.ts`: 5/5 PASS(신규 admission2, 기존 FUP2 admission3).
- `node --test tests/oci/offline-cpu-primitives.test.mjs`: 기존 FUP2 8/8 PASS. 추가 static syntax check 7개 JS/2개 Python PASS.

### Root source-bound 실제 proof

| 시험 | 관측 |
| --- | --- |
| normal resource | 6 primitives/57 segments/3 visible, readback·temp cleanup, exit0, 0.654s; payload `5456006c84e092df245cb0e8316011f053549cbc8545e285b4af81cad2d7ecc6` |
| resource boundary | digest-pinned Node harness만 실행; network none/port0/UID10001/read-only root·source bind/cap drop/NNP/CPU1/768MiB/swap0/pids64, empty read-only `/data` tmpfs. 운영 App/Worker/DB/CAD/restore volume mount0 |
| kernel probe | 동일 stall CID/cgroup에서 UID10001/CapEff 0000000000000000/NoNewPrivs 1/memory.max 805306368/swap.max 0/cpu.max `100000 100000`/pids.max 64 관측 |
| watchdog | 고의 late hang을 120.213s에 종료, exit137, OOMKilled=false, partial receipt 거부·후보 미수용; exact owned containers 모두 제거. OOM injection·120초 이하 실행 SLA는 주장하지 않음 |
| fresh Browser | synthetic readback payload `5456006c84e092df245cb0e8316011f053549cbc8545e285b4af81cad2d7ecc6`를 fresh context에 전달, source DXF request0. 6 primitives/57 segments/3 visible, buffers/analytic geometry/bbox/CCW goldens 일치. source chord max 0.048308472057mm, vertex Euclidean max 0.000001573597mm, quantized midpoint combined max 0.048309385273mm(합산 cap0.1mm 안) |
| Browser pixels/negative | visible red/yellow/green 180/406/209 pixels; off/frozen/entity-hidden regions 0/0/0 pixels. page/console/request errors0. 12 negative DTO cases reject, semantic packet digest 재계산 후 valid positive 복원도 확인. dedicated browser/server/listener/container cleanup PASS |
| 실제 immutable DXF | 독립 및 Root replay 모두 원본 1,117,143 bytes 전체를 `DXF_SECTION`으로 거부, payload0, 원본 SHA 불변. immutable archive SHA `625e6b36e2bcb9c94e5e1d7bba735c7f26323ee963f212b58121f5d6a5ef1057`는 실행 전후 동일. copied snapshot의 `CadFileVersion`에서 `storage_path`, `sha256`, `file_size`만 읽었고 원본 CAD/변환 artifact를 저장하지 않음 |

Root actual receipt SHA256 `85ed52608f1e17e947b7b3f053dd9e4e09a59ee38c96ccb3e6b10235d58b1f73`(10 source binding), Root final local verification SHA256 `46bb846d0817b11c20fe6e6896bc9a2e9ff6804dcf7c0af415641e87dfa88a3c`. Root typecheck/build PASS, lint0 errors/12 baseline warnings, Vitest177 files/1108 tests PASS( 413.94s). Root가 수행한 전체 checks/browser/watchdog는 independent QA 재실행으로 기록하지 않는다. Independent whole-DXF replay receipt (private local evidence under `/home/planner/Dev/layoutManager/data/release-proof/issue225-tables-20261108/`) SHA256 `a13315b60b9950fd189cc4175c52148cf54954b560353feb0a2aacb38700b4e9`; Independent QA receipt (private local evidence under `/home/planner/Dev/layoutManager/data/release-proof/issue225-tables-20261108/`) SHA256 `c0e3af44f7785d948a54295f4eb2e80bf86fb96dbb97b57251d3937198372e99` (mode0600).

**수용 한계:** actual drawing은 새 TABLES/header semantics 적용 전 단계에서 UNSUPPORTED이며 이 결과는 layer/style 실도면 fidelity를 검증하지 않는다. font/text rendering, full file, production READY, OOM injection, production deployment, flags, pilot GO를 주장하지 않는다. Source0.61.0/operating0.58.0·기존 dirty worktree를 보존했고 Manager 제한부 수용 완료이며 exact-head CI/Root 통합은 대기다.

Manager final receipt SHA256 `83b33acd93f54844c0b32c91f101017bf80d9e2712c9e0cf6021275a0837dc97`: source10·Root actual/final·independent QA/replay receipt hash를 결합하고 제한부 offline 범위만 수용했다. 구현 재작업은 없으며 제품 지원·배포·GO를 승인한 결과가 아니다.

---

## U-225-FUP2-20261108 — offline CPU primitive 후보 구현·검증

**판정:** default XY/기본 layer·style/INSUNITS4의 LINE·CIRCLE·ARC·straight LWPOLYLINE을 별도 test-only 후보로 구현했다. 결과는 `offline-cpu-primitives@1 / CANDIDATE / node-cpu-primitives@0.1.0+cad-scene-1`이며 제품 SceneManifest/READY가 아니다. 기존 parser·Builder allowlist·Worker/Queue·DB/Schema·Viewer·flags는 변경하지 않았고 소스0.61.0/운영0.58.0을 유지했다. 실제 전체 DXF는 여전히 미지원이며 파일럿 NO-GO다.

Manager가 요구사항/구현 계약/8개 AC를 먼저 기록하고 Developer가 Node parser·별도 DTO validator/restorer·semantic tests를 구현했다. Manager source review에서 type별 closed/연결 의미·남은 예산 선검사·전체 loop deadline·private owner/path/fsync를 보완했다. Root가 생산 경로 거부 시험·별도 synthetic Browser/서버·resource supervisor와 실제 검증을 수행했다. 현재 가용 Manager/Developer/QA 역할 agent와 Root의 실제 수행을 기록하며 과거 지정5.6 모델을 실행했다고 부르지 않는다.

| 구현 / 경계 | 결과 |
| --- | --- |
| 지원 subset | LINE, radius>0 CIRCLE, canonical degree/CCW wrap ARC(동일 start/end 거부), bulge0/width0인 open/closed LWPOLYLINE. 임의 section/header/record/field·TEXT/BLOCK/TABLES·비기본 style/normal/Z는 전체 거부 |
| canonical polyline | open70=0/closed70=1 모두 마지막 vertex=첫 vertex 입력을 거부. 유효 DXF일 수 있으나 이 후보의 UNSUPPORTED이며 원본 normalization/flag 수정으로 통과시키지 않음 |
| encoding | 원본 bytes/SHA 유지, explicit UTF8 또는 ANSI_1252만 decode. malformed UTF8/미정의1252 byte·누락/충돌 선언 거부. text/한글 의미 정확도 수용이 아님 |
| precision / limits | chord sagitta<=0.05mm + Float32 vertex Euclidean<=0.05mm, 합산<=0.1mm; source16MiB/pairs300000/output segments5000/coordinate1e6/payload32MiB. 예산 초과 시 오차를 늘리거나 entity를 생략하지 않음 |
| offline DTO / 저장 | exact key/schema/state/builder/source/count/ID/order/Float32 finite buffer/연결·closed·size 검사. 0700 parent·0600 exclusive tempfile/file+dir fsync/readback SHA/full validation, owned tempfile 정리 |
| 제품 경계 | 새 builder의 validSceneScope/storedSceneScope/Manifest/payload 수용 거부, 기존 strict LINE 양성·CIRCLE 거부 유지. 다른 Builder로 relabel하지 않음 |

최종 Node source SHA256 `e181a0448a527e7d4388d1ca7c4d26485eaefad9adc2e26130e9ea73278e4e4a`, portable DTO `3028656f5a64827edf505f024a979dc119d74b5a2e506a65274eddc4568083cb`, focused tests `41563a56d4581a05ec7f7a2b4e8b6a006dca003609fc6a3f37aaff7286b9260c`. unused helper/binding 제거 후 최종 source로 focused8 및 아래 resource/Browser proof를 다시 실행했다. 이전 source의 positive proof는 이력이며 최종 hash로 바꿔 부르지 않는다.

| 최종 source 실제 시험 | 관측 |
| --- | --- |
| 정상 resource 실행 | 5 primitives/58segments, CANDIDATE/private readback·temp cleanup, clean exit0,0.453초. exact0.58 immutable image는 Node 실행 harness로만 사용했고 App/운영 Worker를 시작하지 않음 |
| 실제 제한 | UID10001·rootfs RO·network none·port0·RO test source bind·CPU1·768MiB/no swap·pids64·cap drop·NNP; image의 기본 VOLUME/data는 empty readonly tmpfs로 가려 anonymous/runtime volume0 |
| kernel 관측 | 같은 소유 stall CID의 cgroup memory.max/swap.max/cpu.max/pids.max와 PID1 UID/CapEff/NoNewPrivs를 별도 readonly exec로 확인. 설정값만의 추정과 구별 |
| 실제 watchdog | valid-looking readback receipt 뒤 고의 late hang. parent120초 trigger→bounded Docker 확인/kill, 실제120.177초·exit137·OOMKilled false; partial candidate 미수용. process lifetime<=120초/SLA나 OOM injection을 증명하지 않음 |
| resource 정리 | 각 exact image/CID/nonce/name/mount 확인 후 owned container 제거. 실제 운영·보존 restore/DB/CAD/auth mount0 |
| fresh Browser 복원 | 별도 isolated Chromium에 원본 DXF 없이 저장 후보 bytes 전달. Node container/host readback SHA 동일, 5 ordered primitives/58segments의 실제 Float32 buffers·모든 LINE/polyline segment·독립 analytic curve/CCW/bbox golden 일치 |
| 정량 Browser 결과 | analytic vertex Euclidean max0.000002071mm, actual curve midpoint error max0.048642090mm, 800×640 canvas·nonblack1556pixels/네 종류 색상 표시, GL/page/console/request error0. 화면만 보고 fidelity PASS를 붙이지 않음 |
| Browser 음성 / 정리 | digest·state READY·builder·foreign source·late invalid scalar·연결 파손·extra URL field 7건 거부. source DXF 전송0, localhost synthetic server/context 종료. 제품 Viewer READY/UI 수용 시험은 아님 |
| 실제 전체 파일 | immutable archive의 Version metadata3열(storage_path/sha256/file_size)만 참조하여 원본1,117,143bytes를 전체 입력. 최종 source에서 `DXF_SECTION`으로 거부·payload0·source/archive SHA 그대로. 일부 geometry 추출/원본 transcode0 |

Root 최종 관측 receipt SHA256 `21ec2464b7ae52be62b33ca562d3e0367bc63b2cf6c5863ed724873fd30b8b43`. 실제 resource metadata·cgroup·원본 replay·Browser receipts/실행 화면은 private0700/0600으로 보관하며 실제 사용자 CAD/이름/handle/좌표/텍스트를 public artifact에 넣지 않았다. 공식 group-code 근거와 범위·거부 의미는 Architecture FUP2가 정본이다.

**검증/수용:** focused Node8/Python resource guard6/생산 경로 admission Vitest3 PASS. Root 타입 검사·Lint0 errors/기존12 warnings·production build 및 전체 Vitest176files/1106tests PASS(451.53초, child umask022). 실행 중 test-only dead helper/binding과 regression만 보완됐고 제품·admission import graph는 불변이다. 최종 Node focused/source-bound actual proof와 최종 exact-head PR CI를 별도 gate로 사용한다. 독립 QA는 최종 Node8/guard6/admission3을 직접 실행하고 최종 source의 실제 archive 전체 거부를 재현했으며, source8개/receipt13개의 hash 및 resource/Browser·문서를 감사해 PASS_WITH_LIMITS로 판정했다. Root 전체 앱 검사/실제 Browser·120초 시험을 QA 재실행으로 부르지 않았다. QA SHA256 `1b914b5a954ebe6cb74a0a963c48533ecdd3f69051fca9149b3b5af9fa56b64f`, 독립 실제 replay `23bfd7db3cca1ef9ace0ce1616d73ebcda80b6874e96486d3bd405ef4bf26a47`, Manager ACCEPT_WITH_LIMITS `d3ac0d796b989d8a777d8a845580bef2d799f4d8ff3ab100f321ae1eac70f919`다. 중간 checkpoint의 축약 hash는 최종 파일별 계산·일치 확인으로 보완했으며 이 변경의 exact-head 필수 CI를 최종 통합 gate로 사용한다.

**남은 범위:** 실제 전체 도면의 TABLES/layers/styles·BLOCK/INSERT·TEXT/attributes·dimension/hatch/leader/layout/OCS·Z 지원은 없다. SourceIndex/정밀 원본 선택·실도면 문자/기하 검수·운영 durable Job/READY·실 hardware/2PC/파일럿 GO로 확대하지 않는다. 운영 배포/flags·계정/권한·registry/tag/latest·issue 종료0이다.

---

## U-225-FUP1-20261108 — 실도면 capability 분석·격리 복원본 정상 인증 조회

**현재 판정:** 실도면 inventory와 새 복원본의 사용자 정상 로그인 후 조회를 관측 범위에서 확인했다. CPU 전체 파일 변환은 여전히 UNSUPPORTED이며 payload/READY 생성0·파일럿 NO-GO다. 운영0.58과 보존된 기존 restore volume은 변경하지 않았고 앱 소스0.61.0/제품 Parser·Builder·Worker·Schema를 유지했다. 아래 ARV의 clone 인증 NOT RUN은 당시 상태이며 이번 실제 실행으로 보완한다.

Manager가 FUP1 요구사항/설계/AC를 먼저 기록했다. Developer가 test-only raw-byte scanner를 구현하고, Root가 clone/transport/업무 fingerprint 도구와 실제 브라우저 시험을 수행했다. Manager는 구현의 tuple 처리·원자 receipt·부분 cleanup·bounded identity 및 scanner finite vocabulary/시간·공유 DAG depth를 검토해 재작업 뒤 수용했다. 지정된 과거5.6 모델을 실행했다고 기록하지 않으며 현재 가용 역할 agent가 실제 업무를 수행했다.

| 실제 분석 | 결과 |
| --- | --- |
| 원본 binding | immutable archive SHA `625e6b36e2bcb9c94e5e1d7bba735c7f26323ee963f212b58121f5d6a5ef1057` 유지, 실제 DXF1,117,143bytes·63,050pairs |
| 선언 / 구조 | AC1018 / ANSI_1252 선언 / INSUNITS4, HEADER·CLASSES·TABLES·BLOCKS·ENTITIES·OBJECTS, UTF-8 지원을 뜻하지 않음 |
| entity 범위 | ENTITIES970 + BLOCKS2690 =3660. 기존 기타3은 VIEWPORT3; raw 정의 개수이며 instance 확장 도형 수가 아님 |
| 의존 특성 | BLOCK147 / 최대 경로3(정의 node 기준·top-level INSERT 제외), layer24/style8, text/attributes/dimension/hatch/leader/OCS·Z 존재. cycle/missing reference 관측0 |
| 결과 의미 | finite entity/category/선언 vocabulary·source SHA·flag/count만 반환하는 INVENTORY_ONLY. 원본 이름/문자/handle/좌표를 공개하지 않고 원본 transcode/filter0 |

최종 scanner SHA256 `2a36a9e9712016a4545fb911c75fbf10d0937001e19debc08aa119012317361c`, test source `59261fb0477cf41e1b00da6a0a9d8eddcb836d2a27254ea67464c8f75e1ee022`. 실제 sanitized inventory SHA256 `37cf146b8915e3b1e179b6aa5b1b82efb9c1add9d0459f5469f2a58db1a28027`. Developer receipt `bafb2fa0358fd352c3daea37d49940993e4c5566f6f4b4e9e8a277b7918cc183`. 이전 depth2/hash는 superseded이며 최종 결과로 사용하지 않는다. 다음 CPU 후보의 정확 subset·누락 의미·P01–P06·0.1mm 오차/segment 상한은 Architecture FUP2가 정본이며 실제 파일 전체는 그 primitive 후보에도 미지원이다.

| 새 격리 복원본 관측 | 실제 결과 |
| --- | --- |
| 복원·기동 | 기존 immutable archive를 새 nonce-owned empty volume에 복원, raw6files 일치, exact old0.58 image·설치 identity·healthy |
| 접근 경계 | internal network/App host port0, localhost-only SOCKS를 exact clone IP:3000 하나로 제한. Browser127:3000 URL/Host/Origin 유지, HTTP rewrite/packet logging0. 시작·연결 전·bounded 주기 identity 확인은 연속 race 배제 증명이 아님 |
| 정상 인증 | fresh context 최초 Session401/login POST0. 첫 사용자 완료 응답 뒤에도401/POST0이어서 올바른 clone 창을 식별; 그 창의 사용자 직접 로그인 후 Session200/actor 존재. UI login POST4건 관측, 자동 credential 입력/원래 cookie 복사0 |
| 업무 조회 | Session/목록/Location/원본 각각200; 기존 Version1/Current pointer·목록 Current가 backup과 일치. Location 화면 Current/Version row1/Viewer 링크 확인 |
| 원본·Viewer | 원본1,117,143bytes·SHA가 backup과 동일. explicit dxf-viewer SSR200·도면 표시 완료·visible canvas1425×1542, 해당 Viewer 구간46GET/비GET0/source200 1회/Scene GET0 |
| 선택 업무 보존 | 비인증13 Version열을 포함한24개 업무 table/선택 열 및 CAD tree bytes가 backup·조회 전후와 일치. User/AuthSession/복구/로그인 시도 행 및 삭제 비밀번호 해시는 최종 비교에서 제외. 전체 DB/Auth/Audit 보존·atomic DB+CAD snapshot 주장이 아님 |
| 종료·보관 | dedicated browser context 닫음, exact bridge PID/loopback listener 종료, 소유 clone/network 제거, 새 restore volume detached 보관. 기존 backup/운영 image·healthy 유지 |

**로그아웃 제한:** 정상 UI 로그아웃을 시도했지만 account 이동 직후 확보한 snapshot에 해당 control이 없어 완료하지 못했다(last Session200/logout POST0). 이를 로그아웃 성공/세션 폐기로 기록하지 않는다. browser context·transport·clone App 종료로 실행 경계를 닫았으며, 새 detached clone DB의 정상 AuthSession 행은 남을 수 있다. cookie 복구·DB 세션 삭제·원래 사용자 세션 변경으로 보완하지 않았다.

**실패·보완:** 초기 `CadFileVersion SELECT *`는 삭제 비밀번호 hash 열도 aggregate digest에 읽었다. raw 값 출력/전달/인증 사용은 없었다. Manager 검토 후 명시13열·SQL LIMIT로 좁히고 초기 digest를 제외해 backup과 다시 비교했다. 전체 이력의 인증 자료 읽기0을 주장하지 않는다. 최초 전체 Vitest는 private077 umask 상속으로 unsafe644 lock fixture가600이 되어 실패했고240초에 미완료 timeout됐다. 같은 시험은 child077에서 실패/022에서 통과했다. 앱/시험 assertion을 바꾸지 않고 child022로 전체 재실행한다. 세부 실패 이력은 FailureLedger를 따른다.

**검증 상태:** scanner10/clone protocol·fault14 PASS, 타입 검사·Lint0 errors/기존12 warnings·production build PASS. 정상 child umask022의 전체 Vitest175 files/1103 tests PASS(420.4초), private log0600을 확인했다. 독립 QA는 scanner10/clone14를 직접 실행하고 immutable 원본 분석을 재현했으며 actual clone receipt/선택 비교/종료·문서를 감사해 PASS_WITH_LIMITS로 판정했다. Root의 전체 앱 검사는 QA 재실행으로 기록하지 않았다. 최종 QA SHA256 `591bf7665cf5147ae5dbf47a43e03b42fce1d8a96b81ccb7f5cb4c6ef966d5c7`(중간 receipt hash 오기 보완 뒤11개 binding 재확인), Manager ACCEPT_WITH_LIMITS SHA256 `9c41d2236e74cc09b5e455760d0b8f1df775cc714edafadcff5e58de7684ae16`다. 이 변경 PR의 정확 head에 적용되는 필수 CI를 최종 통합 gate로 사용한다. CI scope job에 새 scanner/clone 시험과 fingerprint 구문 검사를 연결했으며 외부 Docker/registry 쓰기 없는 합성 시험이다. Root 실제 관측 receipt SHA256 `1b0e758ade1d098bc2624e9cff54596d0c518d4bbdb2756df48581183efa00cf`.

기존 공개 CAD 읽기 계약의 정상 기능 시험이다. Site 인가 차단·메모/외곽선 권한·기하/문자 정확도·host 외부 writer 독립 배제·off-host 내구성·미래 RPO0·운영 READY/GO를 대신 증명하지 않는다. 신규 배포/flags·권한·registry/tag/latest 변경 및 이슈 종료0이다.

---

## U-225-ARV-20261108 — 실도면 CPU eligibility·로그인 후 운영 조회 검증

**판정:** 실제 도면의 published0.61 CPU 변환기 지원 조건은 NOT_ELIGIBLE이며, 기존 운영0.58 계정의 정상 로그인 후 업무 읽기는 관측 범위 PASS다. 이 결과는 운영 READY 생성/게시 성공이 아니다. 실제 운영 배포·flags/계정/권한/원본/Scene 변경 없이 private backup 사본을 읽어 검사했다. 기존 OR58 backup·복원 관측 수용은 유지하며 파일럿 NO-GO다.

| 관측 | 실제 결과 |
| --- | --- |
| 실제 DXF backup 사본 | 1,117,143bytes·63,050 ASCII pairs·INSUNITS4; HEADER/TABLES/BLOCKS/ENTITIES/OBJECTS/CLASSES 각1, strict UTF-8 아님 |
| ENTITIES 집계 | LINE624/LWPOLYLINE124/TEXT89/DIMENSION63/ARC20/HATCH13/INSERT10/CIRCLE9/MTEXT9/LEADER6/기타/미분류 bucket3; 실제 이름/텍스트/원본 bytes 공개0 |
| exact parser | 공개된 image source33f377과 현행 parser SHA256 `d03870a2bbc8d570b7dac4f4e7e69a1c6e3f46ada6d754143922ac63eca49233` 동일 |
| 같은 parser 대조 | 올바른 HEADER·INSUNITS4·layer0 LINE2의 합성 대조군 ACCEPTED, 실제 파일은 `SCENE_DXF_PARSE_FAILED`로 REJECTED |
| 결과 의미 | fatal UTF-8 decode에서 실제 변환 전 거부; 여러 section/LINE 외 entity도 현재 strict subset 지원 범위를 벗어남. 인코딩 변환·도형 제거로 원본을 바꾸지 않았음 |

Developer의 read-only assessment SHA256 `bae8d8a1705a748c68f0151d11040e2c7680ebc397ae471fd61c5440d5f17da1`, exact parser 대조 결과 `74e831324b4c43442a07da0c00bbfe50db95bfc13538da1324e32162b818df17`. 독립 QA는 archive의 집계·decoder 조건·published/current source SHA를 확인하고 기존 source worktree의 동일 hash parser/dependencies로 대조군·실제 파일을 직접 재실행했다. 최종 QA report SHA256 `7a03d56ed981f018ab358d0858ad96bf04479c617b6acbc315fa588d597b9552`, PASS_WITH_LIMITS다. 결과 worktree에 tsx가 없어 최초 재실행을 못 한 상태는 기존 source worktree의 설치된 동일 코드로 해결했으며 새 설치/코드 수정은 없었다. Root 대행 Manager는 이 read-only eligibility 결과만 수용했다.

**정상 로그인/업무 조회:** 사용자가 별도 headed Chromium에서 기존 계정으로 직접 로그인한 후 Session GET200/actor 존재를 확인했다. agent는 비밀번호·cookie/session·setup code·credential header/body를 읽거나 복사하지 않았고 계정/권한을 변경하지 않았다. 계정 화면의 비밀번호 변경 입력칸 존재는 로그아웃 상태의 증거가 아니며 실제 Session200과 로그아웃 control을 기준으로 했다.

| 실제 운영0.58 읽기 | 관측 결과 |
| --- | --- |
| 목록·Location API | 각각200; 기존 Version1건·Location1건, Current pointer/목록 Current가 backup과 일치 |
| Location 화면 | 기존 정상 목록→Location 링크로 이동, Version row1/Current 표시/Viewer 링크 확인 |
| 원본 GET | 200·1,117,143bytes; backup의 size/SHA256과 일치, 원본 이름/내용 공개0 |
| Version/Viewer 화면 | SSR Viewer200, 명시적 `renderer=dxf-viewer`, `도면 표시 완료`, visible canvas1425×1542 |
| Viewer 요청 관측 | 탐색 직전부터47GET/비GET0, 원본200 1회·Scene GET0. save/build/retry/edit 실행0 |
| 운영 보존 | 같은 기존 container/image/volume·healthy, 사용자 원래 worktree의 두 변경 보존 |

Root 결과 receipt SHA256 `de739e9b95eac33b72e037dc0094e7841036789c3025d391c240ecd2d67b16b8`. `GET /api/cad-files/{versionId}` 사전 probe는405였다. 해당 route에 GET handler가 없고 Version 조회는 SSR Viewer가 수행하므로 이를 데이터/인증 실패로 분류하지 않았으며 SSR200을 별도로 확인했다. 초기 합성 결과가 아닌 실제 사용자 브라우저의 정상 context를 사용했다.

독립 QA는 private 결과/로그 hash·승인된 공개 CAD 정책·old de92 primary source와 변경 Markdown7개를 대조해 PASS_WITH_LIMITS로 판정했다. QA가 사용자 세션으로 브라우저를 재실행한 것은 아니며, 보고된 관측과 문서의 일치성 감사다. QA receipt SHA256 `8ee65087fdb47a7f7edd842e750537ae0dadd401dd0536b85fb5c263033388a5`. 기존 Manager agent의 pending_init 상태로 Root가 실제 최종 수용을 대행했고, 수용 receipt SHA256 `3717d21812d608cf2bc14157af3c5f49403a3f42da919680ec181d0923301908`다. 운영 source 읽기 관측만 수용하며 아래 미실행 범위는 유지한다.

**정책/범위:** FR-P4-G0-BIZ-01의 기존 CAD 목록·Location·Version·Current·Viewer·원본은 사내망 공개 읽기다. 이번 로그인 후200을 Site별 접근 차단이나 보호된 메모/외곽선 읽기 인가 증거로 해석하지 않는다. old de92 primary source의 공개 GET/SSR 및 explicit dxf 원본 경로와 일치한다. 기본 scene-first 경로는 이번 실제 브라우저 시험에 포함하지 않았다. 표시 상태·캔버스는 로딩 완료 근거이며 실도면의 도형/텍스트/측정 정확도 검수가 아니다.

**구분/남은 범위:** OR58의67byte dummy는 backup 검증용이며 CPU READY 대조군이 아니다. 이번 LINE2 parser 대조도 Job/Asset/READY 게시 성공이 아니다. 운영0.58의 SceneAsset0/CurrentScene0·이전 flags 상태는 OR58 관측을 인용하며 이 단위에서 실시간으로 독립 재조회하지 않았다. 운영0.61 upgrade/flags/Scene 생성을 하지 않았고, 실제 도면을 현재 CPU 지원 범위로 READY라 부르지 않는다. 기존 AUTH_PENDING은 운영 source의 위 실제 조회로 해소했다. 이번 로그인/Viewer는 재개된 원래 운영 서비스에서 수행했으므로, 보존된 격리 restore clone의 인증 UI 조회는 여전히 NOT RUN이다. 이 도면의 CPU 지원 확대는 별도 설계·구현·검증 대상이다. host writer 독립 배제/off-host 내구성·별도 파일럿 판정의 기존 한계도 유지한다.

---

## U-225-OR58-ACTUAL-20261108 — 실제 운영 0.58 백업·격리 복원 관측

**관측 결과:** 사용자가 구체 유지보수 질문에 `진행하세요`로 답한 뒤 실제 운영 source를 한 번 캡처했다. 원래 App은 같은 container/image/config/volume에서8.545초에 healthy로 재개됐고, 별도 새 빈 volume의 실제 복원·정확 old App 시작·내부 HTTP200/200·지원 cleanup·시작 후 데이터 보존을 확인했다. 아래 준비/NOT RUN 문구는 당시 이력이다. 독립 실제 데이터의 읽기 전용 QA가 PASS_WITH_LIMITS로 판정했고 Root 대행 Manager가 관측된 복구·데이터 보존을 제한부 수용했다. 이 관측을 host 외부 writer의 독립 배제나 전체 파일럿 GO로 확대하지 않는다.

| 실제 운영 관측 | 결과 |
| --- | --- |
| release / identity | operating0.58.0 / OCI source de92be0 / pinned App6abdef·Migrator0f2d21, historical tag pair와 빈 manifest sourceCommit 보존 |
| capture | raw6files, archive1,751,040bytes, SHA256 `625e6b36e2bcb9c94e5e1d7bba735c7f26323ee963f212b58121f5d6a5ef1057` |
| freeze / capture (KST) | 2026-11-08 05:45:59.022 writer0 관측, 05:45:59.656–59.990 archive stream; UTC는 전일20:45:59.022/656–990 |
| original healthy (KST) | 2026-11-08 05:46:06.984, total outage8.545초/120초 예산; 동일 CID/image/설정/volume·원래서비스 보존 |
| restore / DB | 새 빈 owned volume, raw6files 일치; integrity/FK 검사통과·33tables의 모든 logical rows/schema/migration/install identity와 CAD 참조1건 size/SHA 일치 |
| old App / HTTP | exact0.58 image·소유 internal network·host port 공개0·비루트 exec 내부 health/status HTTP200/200 |
| post-start / cleanup | clone/network 제거 후6rawfiles·모든33table rows/schema/install/CAD SHA 그대로 일치, restored volume detached, 원래 App healthy |

schema fingerprint SHA256 `eb07b73207cdd9d962185fe2e68ef70d5a837fd9294dfc9214829a8bbf059109`, manifest `f6af12c119fe8c9e953eb42eccf55eb0293c3f8b5b43f2f5d115d73b558af2b2`, migration history1건 fingerprint `cd1b2be7bf82e4863ea424802a017760e0aab6050b5e7c3081e1fd9b6b35ba8e`. CadFileVersion1/CadLocation1·User1/AuditEvent22·SceneAsset0/CurrentScene0을 포함해 전체 행 동등성을 비교했으며 행/사용자/원본 이름은 공개하지 않는다. post-start receipt SHA256 `51a51e8fef880e492a0b036829c4b224bf1cfc138879edd55ef68a80c27144d6`.

**RPO/시간의 범위:** 복구 지점은 위 quiescent capture의 보존된 상태다. 서비스 healthy 재개 시 capture 완료로부터6.994초가 지났으며 미래 장애 손실은 이 snapshot 이후 변경에 달린다. 미래 RPO0이나 목표 SLA 충족을 주장하지 않는다. disposable restore-attempt→검증1.758초, startup-attempt→HTTP200 6.647초, restore-attempt→HTTP200 24.063초(호스트 호출 간 간격 포함)는 격리 시험 계측이며 운영 장애 RTO가 아니다.

독립 QA report SHA256 `622eedd1f569e37c92e943ad46fbcefc32176053dcb0597c0b9a915edff0944b`는 실제 capture/restore/post-start의 별도 DB 사본에서 integrity OK/FK0·33table row fingerprint/schema/install/CAD hash를 재검사하고 정확 원래 CID/image/mount healthy·복원 volume detached·clone/network 부재를 확인했다. Root 대행 Manager 수용 SHA256 `3ddebed20af2499a6671b50b085811bd34c88001113d6ffc3d52c48df2675dd9`. source controller3481/소스0.61.0은 변경하지 않았다.

worktree 정리와 분리하여 원래 프로젝트의 ignored private data recovery 디렉터리에도 archive를 포함한 필수 파일12개를 별도 복사·fsync·전후 SHA 검증했다. recovery manifest SHA256 `3d86a7b6f7190786d562a81ea94cadbe9106688b4592f1b52c6adb97d2e2b811`, archive SHA는 위625e6b와 같다. feature worktree와 persistent private 보관본 및 detached actual restore volume은 유지하며 Git/CI/public artifact로 반출하지 않았다.

**수용 근거/제한:** running Docker writer0·graceful-stop guard·readonly 원본의 capture 전후/복원 파일 hash 동일성과 실제 사용자 quiet-window 승인은 기록했다. host 외부 writer 배제는 `ROOT_ATTESTED_NOT_INDEPENDENTLY_PROVEN`이며 완전한 독립 same-snapshot PASS는 보류한다. 인증된 업무/source/Current HTTP는 NOT RUN, 실제 READY Scene 데이터0이다. backup은 Docker source volume 밖의 private host filesystem에 보존하며 off-host 내구성은 미검증이다. 자동 publisher HOLD/Scene flags OFF/파일럿 NO-GO·이슈 OPEN 유지, 0.61 배포·원본 volume 덮어쓰기·Git tag/latest·registry 쓰기0. 소스0.61.0/운영0.58.0은 유지했다.

---

## U-225-OR58-DISPOSABLE-20261108 — 독립 복원 검증 수용, 운영 실행 대기

**판정:** controller3481의 독립 실제 Docker happy path·두 실패 주입과 Root의 별도 데이터 재조회가 통과했다. 이는 합성 도면1건/Current·Scene0의 임시 시험이다. 실제 운영0.58의 stop/capture/restore는0이며 운영 RPO/RTO 수용이나 파일럿 GO가 아니다. 다음 단계는 구체 유지보수 시점 확인 후 실제 운영 recovery point를 검증하는 것이다.

**Source/통합:** [PR259](https://github.com/planner77/layoutManager/pull/259) head `63efa743c3540421bbc9addd9f47bb03380ebd0d`/tree `ffb3a9b5b16119289889135fee623460adef8bef`. 최종 [CI687](https://github.com/planner77/layoutManager/actions/runs/42409757779)는 적용8개 SUCCESS/A2 scope SKIP다. CI receipt SHA256 `94af23d2bf9bcda0867c41748b91e2317f1e53853dd02ad7426bd428543e0dfe`이며 실제 synthetic merge `cc9439f9fb611ae83217f4400e0d90a81b4d7d14`의 정확[Main5cd,head63] 부모·동일 tree를 별도 확인했다. 선행 a9/CI685의8개 성공은 그 source만의 결과이며 새 source로 이전하지 않는다. 63의 CI686은 Draft→Ready 이벤트에 따른 같은 head의 최종 실행으로 대체됐다. 충돌/미해결 리뷰0과 exact head를 확인하고 정상 squash Main `5836d66e48f6f42f51ee82e8f7b8c3c8151a349f`로 통합했다. Main의 단일 이전 부모5cd와 동일 treeffb3를 재조회했으며 bypass/branch 삭제/force push0이다. merge receipt SHA256 `92a6fb767034f389cff48858037a024dc66dd3cbb602291d2e06fc5ef5fe3399`.

| 실제 임시 시험 | 결과 |
| --- | --- |
| snapshot·원래 App 재개 | exact old0.58 immutable image, 같은 source fixture CID healthy 재개7.888초/120초 예산, archive583,680bytes·4files |
| 새 빈 volume 복원 | 33 tables의 모든 logical rows/schema/install identity 및 CAD 참조1건(67bytes)/bytes/SHA·raw files 일치 |
| old App startup | 소유 internal network, host port 공개0, 정확 CID의 비루트 exec 내부 health/status HTTP200/200 |
| startup 이후 보존·정리 | 지원 cleanup으로 clone/network 제거 후 모든 파일·설치 identity·33 tables/도면 SHA 일치 |
| 실제 helper 응답 지연 | real start-ai 호출 뒤 CLI 응답을 지연하여10초 subprocess timeout 유도, capture 성공 receipt0·finally 같은 App healthy 재개16.91초; daemon 장애 시험은 아님 |
| 실제 network receipt 유실 | 실제 internal network 생성 직후 로컬 receipt write OSError 주입, durable intent로 ID/nonce 회수·해당 빈 network만 제거 |

**독립 근거:** QA report SHA256 `05a8f4e452b76b70a0f573974085c11915838eb9045753828f65986b0b728b44`; Root의 detached restore4files·33table fingerprint/CAD1 재조회 `40bc7429c6bac9c602fccde674e73f54f294dc4789b42a65b1ab6c097fefaccc`; Root 대행 Manager 수용 `cf867086be26e592eb138b8768a755ff27b8e4321dfb13ba78156c0a7f3a4786`. 실제 역할은 앞선 PREP 기록을 따르며 기존 Manager가 수행하지 못한 최종 검토를 수행했다고 부르지 않는다.

QA 임시 App/Migrator/source volume 및 불필요 restore2개는 exact ID/image/nonce/mount·0attachment 확인 후 정리했다. 검증된 happy restore1개와 private archive/report는 보존한다. cleanup manifest SHA256 `5836dfa5a9ab1eb7a45a0b1fb4b76214b443a649d38c1470730833d8015c4752`; global prune/기존 운영·RR2 자원 접근0. 앞선1b8 startup HALT(report `d1c91aa7…b0fbbf`)는 그대로 보존한다.

최종 code3481·기본 Docker context·DOCKER_HOST override 없음에서 새 readonly readiness packet `f6d750dd562eaa2fb7a336180077774e3a0da93d337e31e7550c9f6ba7b1371d`를 생성해 동일 운영 CID/image/version/설치 identity·6files를 확인했다. private0700/0600이며 실제 유지보수 authorization은 생성하지 않았다. 정상 실행120초 예산 중 재시작70초를 확보한 계획이다.

**운영 사전 검사:** 별도 readonly 원본 도면 참조1건의 local locator·실제 size/SHA도 일치했다(receipt SHA256 `2bd740839dd46da1bfc79c6bc59dc229b62ca1e36822256443351d4e159d8c26`). 기존6files/1,741,401bytes·integrity/FK·설치 정보 inventory와 마찬가지로 동시점 backup이 아니다. 인증된 업무/source/Current HTTP는 NOT RUN, 실제 READY Scene 데이터0, host 외부 writer 배제는 독립 증명되지 않았다. 유지보수에서 writer 경계를 확인하기 전 same-snapshot PASS를 선언하지 않는다. 자동 publisher HOLD/운영 Scene flags OFF/파일럿 NO-GO·이슈 OPEN을 유지한다. 소스0.61.0/운영0.58.0이며 배포·Git tag/latest·registry 추가 쓰기0이다.

---

## U-225-OR58-PREP — 운영 0.58 복원 검증 준비 (2026-11-08, 진행 중)

FR-225-OR58/TP-225-OR58의 Manager 요구사항·AC를 먼저 기록하고 전용 검증 도구를 준비한다. 운영 App은 기존 0.58.0/image `sha256:6abdef1ede21fd9a84a41d3c49621a9657ac0a10a23057f7f7b3f27515b62a50`이며 OCI revision은 `de92be0ea3a5de38008a57e8c29013d19667f11e`다. App/Migrator의 기존 registry graph와 실제 로컬 image를 조회로 연결했으며 signed provenance로 부르지 않는다. 조회 receipt SHA256은 `bab045de19b82d3a5c4458a19f0c1b06cd8a73c4783fcc5d5145314e45b5d5ab`이다.

Root의 격리된 readonly inventory에서는 일반 파일6개/1,741,401bytes, SQLite integrity OK/FK 오류0/journal mode DELETE를 관측했다. 설치 version0.58.0/schema `G7-GREENFIELD-SEMANTIC-ZONES-20261101-1`, manifest SHA256 `f6af12c119fe8c9e953eb42eccf55eb0293c3f8b5b43f2f5d115d73b558af2b2`이며 historical manifest sourceCommit은 비어 있다. OCI label로 이를 채우지 않는다. CadFileVersion1/CadLocation1/SceneAsset0/CurrentScene0을 관측했으며 실제 READY Scene 복원 범위는 없다. 전체 private inventory receipt SHA256 `edb99d37905f16a8f772e05ab9369cfba8007be1404d6da7ebb617a026617205`. 이 조회는 일관된 recovery snapshot이나 backup이 아니다.

추가 readonly 설치 식별자 조회에서 App `0.58.0`/Migrator `0.58.0-migrate`의 역사적 tag 쌍과 빈 sourceCommit을 직접 확인했다(receipt SHA256 `d86cdf7812aad3e43815be551f2dd0c1ef48d0b41ca80d89737f71a75d9e9c1b`). 기존0.58 gate가 이 쌍을 요구하므로 clone에도 검증된 설치 identity를 전달한다. 임의 환경변수 복제나 OCI revision으로 빈 값을 보완하지 않는다.

Developer는 보완 후 Docker 쓰기 없는23개 시험과 compile/node 구문 검사를 통과했다. Root가 packet의 inventorySource 표기 및 전체120초/재시작70초 예산 필드만 보완하고23개 시험을 다시 통과했다. 독립 QA는 선행 controller727의23 fake PASS 뒤 network-create 응답/receipt 유실의 정리 누락을 발견했다. Developer가 durable pre-create intent의 exact nonce name·purpose·internal·빈 attachment를 검증한 후 실제 ID로 정리하도록 보완하고, HTTP probe를 health/status로 한정했다. 최종25 fake PASS를 Root도 재실행했다. 최종 controller SHA256 `1b8d5504a28b656a079ff2ca4b5c9b3217a5985fa98ea0bccd02954d86db85f1`, inventory `157d8eda956114bb959636737c368a3afd6dd61ca1e96d6e41e1aba9a4b258b2`, test `8d8b77238ac028ca8684c2e4ad3c408ff64c875af4b29ec69333290b0a30dd76`. Root의 typecheck PASS/lint0 errors·기존12 warnings/Vitest175 files·1,103 tests PASS/production build PASS, 최종 inventory 파일 targeted ESLint·CI YAML parse·scope7/hold6·diff 검사도 PASS다. 앞선 빌드 세션의 최종 종료 상태를 회수할 수 없어 재실행한 빌드의 durable exit0을 기준으로 했다.

기존 Manager는 요구사항/AC 작성과 첫 구현 검토를 수행했으나 최종 재검토 시 agent가 `pending_init`에 머물러 응답을 제공하지 못했다. 모델 제한 등 원인은 미확정이다. Root가 실제 최종 기술 검토를 대행하고 독립 QA의 임시 Docker 시험 진행만 승인했다(receipt SHA256 `c77b651dec2d0bd44f536e0286c0fc00cd713a596847a2d67a912420a6d1d146`). 원래 지정5.6 Developer/QA 모델을 실행했다고 기록하지 않으며 가용 기존 역할 agent의 실제 구현·검증을 사용했다. 운영 실행 승인을 대신한 검토가 아니다.

읽기 전용 계획 packet `606edd414a1830b4af9d1e938cca7c3293c4fb53074e4ca90195fbcaee433e83`를 실제 대상/설치 identity로 생성했다. packet0700 parent/0600 file, READINESS_ONLY이고 운영 중지 authorization은 생성하지 않았다. 이 계획은 backup이나 운영 실행 수용이 아니다.

**실제 임시 QA의 첫 결과:** 선행1b8에서 plan/capture/restore PASS, 원래 fixture App 재개7.91초, archive583,680bytes/4 files·33 tables raw/logical/schema/install/CAD 참조 일치. startup은 healthy clone의 실제 published port가 null이어서 `OR58_CLONE_PORT_INVALID` HALT, 지원 cleanup PASS였다. post-start logical 및 actual fault injections는 이 시도에서 NOT RUN이다. QA report SHA256 `d1c91aa776dafe9cfdf469a0c43cd94025fb6e30671ef116fc1e714600b0fbbf`; 원인·준비 진단은 [FailureLedger](FailureLedger.md)를 따른다.

Root 대행 Manager가 OR58-06을 internal network/host 공개0/컨테이너 내부 HTTP로 먼저 갱신한 뒤 Developer가 최소 수리했다. 최종 controller SHA256 `3481eeb0b549f3cebbcdaeaf1264af438376b3b8f8fb2468152650af2160a2a2`, tests `6c0828719c452f78ee8b811370cb2d25634de854d1b9b99440436df0e93863bb`, inventory157d8e는 동일하다. Root는28 fake·compile/node/diff PASS와 diff를 검토해 새 packet의 독립 QA만 승인했다(receipt `8e37b773ad5cd91d6f11b6b50911af0c0f48332c9a021cb341f6e308bb7d41f6`). 새 실제 QA/새 source CI는 이전 실패·CI685와 별개다.

기존 helper에는 backup-only 경로가 없어 별도 도구를 준비한다. Manager의 첫 구현 검토에서 전체 중지 시간 제한, 실패 helper 정리, 복원 volume 소유권, 부분 startup 정리 보완을 요청했다. 구현·독립 QA·임시 Docker 리허설·운영 실행은 각각 구별해 후속 기록한다. 현재 운영 stop/start/capture/restore0이며 actual RPO/RTO/조회 보존은 NOT RUN이다. 운영 0.61 배포·flags 변경·Git tag/latest 변경·issue 종료는 수행하지 않는다. 파일럿 NO-GO를 유지한다.

---

## U-225-REGISTRY-20261108 — 실제 private 3-image 게시·승격 및 판정

**결과:** 승인된 reader/통제/registry 작업1–4의 실행·검증과 판정을 완료했다. 파일럿은 **NO-GO**다. 운영0.58의 동일 스냅샷 backup/schema/RPO/restore/old App start 근거가 미확인이고 운영 DB/CAD/Volume/.env·배포·flags·latest/Git tag를 변경하지 않았다. #225/#218은 OPEN, 자동 publisher HOLD/두 Scene flags OFF를 유지한다. 아래 과거의 미게시/태그 부재 기록은 당시 상태다.

**Source/CI:** [PR257](https://github.com/planner77/layoutManager/pull/257) head `d9f6c440503b2db552c0ee9cac96eee8c8585f01`/tree `12be28269cd0114f194fbf088e4a25632347c34b`의 [CI683](https://github.com/planner77/layoutManager/actions/runs/42393724364)는 적용8/8 SUCCESS/A2 scope SKIP다. 실제 archive `0a415176ba96528ea6b6ee31c3dd7072030540af`/동일tree/정확[Main721,headD9] 부모를 독립 확인했고 정상 Main `33f377c3282e99b87aa487b9924edf305ca1753b`를 확정했다. CI receipt `5d25e4463d22054fde1599635fda1fd60ee3a44f37e8938c176cc2f9e085a418`. 로컬독립93/추가57 및 실제 classifier candidate47/diagnostic13·Vitest175files/1103tests, type/lint/build/Docker/E2E가 PASS다.

**실제 후보:** packet `52838e3ff34dc880701a595583f31aaab521f31ae45d53ab02db7dff13a2516b`의 [run42396085571](https://github.com/planner77/layoutManager/actions/runs/42396085571) attempt1/job128473662769은 fresh live preflight와 별도 실제 환경265 review 뒤 build3/RR1/RR2/RR3/GHCR graph/digest runtime/정리/OIDC4-subject/6negative를 완료했다. Root는 담당 Developer의 반복 context 복구 실패에 따른 구현 대행과 실제 run 모니터링을 수행했다. QA는 source/CI/구체 artifact를 독립 검토했으며 연속 runtime 모니터링이나 별도 CLI 실행을 했다고 기록하지 않는다.

정확1 artifact13583673541/ZIP `sha256:4a699fe36226ce388941aeb8607cba0ac3d9c1b1e30795aed8f8b4f5591fec36`/정확4파일(candidate-receipt.json, candidate-bundle.sigstore.json, verification.json, SHA256SUMS)을 확인했다. receipt `5875396cee73ae772879510649725a4fd737af07a68819728814b66d3213ab62`, bundle `fbe7f2ceadefa2baafc15eb4e88873ad9768116352f78f8e9c660901aeb07428`, verification `71beb3c682d83d9d685321c2a27e2e9d6be206d66a54508ce3cb6a4d7f2b9444`, sums `3d0e445a177d580db8635d65656cf1a8f3be49a9cbe1b8e96e04d053a65ce1a1`. 독립 artifact QA `13860098f8d92b6194f419a9b4e0c3a7aa6bb0c24787942934d55880ca3bd103`는 DSSE/subject/source/실제 job28단계/4파일/승인/control을 수용했다. Root도 checksum 고정 gh2.103.3으로 각3 manifest와 receipt를 online/bundle8회 실제 검증하고 certificate의 Owner/repo ID/source/signer/ref/run/hosted/SLSAv1/정확4subject map을 확인했다. 독립 암호 receipt `1755282d6cda2884cd10b00e0fa90aff9c25f0a954364e4db82f01831cfe24a4`; 별도 음성6건은 실제 workflow의 paired positive/CLI 거부/verified-material policy 근거로 구별한다.

**별도 승격:** packet `9f4bf0fb2b5b4878bd4d06de3a9c00f90ec815847884ed720391c6b2e04e4af4`의 [run42398185878](https://github.com/planner77/layoutManager/actions/runs/42398185878) attempt1/job128480035670은 별도 실제 환경 review와 fresh graph/crypto 검증 후 exact3 final manifest만 승격했다. source A/code B는 모두33f377/tree12be/CI683이며 재빌드/blob PUT/새 provenance·latest/Git tag/rollback/deploy는 없다. candidate와 promotion의 actual review는 Root가 기존 사용자 승인 작업1–4에서 Owner를 대행해 API/approval history로 확인했으며 **독립 두 번째 사람은 아니다**.

정확1 promotion artifact13584725743/ZIP `sha256:52f6447a2bdd1aaf6c3dd74c3a46cdaa6a3e2a4b9220dd50911233af2bc8811f`/정확2파일을 확인했다. progress `5134d1b58b4b8aad5e1e8095113555bf348430014ab84a1ce6e4d5ca0fff1c71`, operation receipt `63b81ba993031e18ff60f836d844032ed30644dbe665abde09e4b5b0eb90a1a0`는 COMPLETE/attempted3/confirmed3이다. 단순 journal과 별도 authenticated 실제 readback을 구별했다.

| 역할 | 정식 private image tag | 후보와 동일한 manifest digest |
| --- | --- | --- |
| app | `ghcr.io/planner77/layoutmanager:0.61.0` | `sha256:c4f8b576278067d990856c4f908a32982f8cbe0d2b1e96969a428472456d19ba` |
| migrator | `ghcr.io/planner77/layoutmanager:0.61.0-migrate` | `sha256:cc40e88172685694306686d521e439ecb058a1a79267ab862a6ddbf5ebf74269` |
| cpu-worker | `ghcr.io/planner77/layoutmanager:0.61.0-cpu-worker` | `sha256:b97a58c964af766ad7fa9b4b2c7b5db526cf3e55faeb371f7444fd42aefed92b` |

**최종 읽기 검증:** config/platform/user/source/role·old0.60/latest readback `1b48970a667a441c48b5d8bb443baaa537b78be33cfdfd492a94b1c94025cc14`와 별도 postrelease audit `7114209c186a048c98b5ba51a0931fc581c6d826950019a9996774e5ed071c46`는 세 raw manifest bytes/digest/media/size의 후보·final 일치, config source33/version0.61/role/linux-amd64/Usercad, private399(기존396전부불변+새3개 각candidate/final2태그), Main/v* 정책26731716/26731135 active/no bypass·Owner never, 환경fe77/main-only/sole Owner/false bypass, legacy355693716 disabled/168완료 불변·repo Owner-only/team0/defaultread를 확인했다. 최종 독립 QA receipt `06011e4d5cdf1e4fa64e0792da043be51e4189b10df40ab4cc6ebbed02c671d2`의15/15 검증과 Manager completion receipt `1966e3074ae31106620845c5ee4e46d5f209a21b5e18d13751922f3208909db8`가 scoped registry publication을 수용했다. GO-PILOT은 운영 근거 부족으로 NO-GO다.

**통제/한계/다음 Unit:** reader·실제Owner/Actions12capability+14거부 외부 감사/독립QA 수용·최종정책복원·own fixture정리의 receipt1ad/Manager3f 및 legacy496을 유지한다. 원 strict helper PENDING, 직접FF의 PR-fail 기대값 불충족과 공동 rule 실패의 인과 한계를 소급 PASS로 바꾸지 않는다. 이전 후보70c2/fdfd FAILED/artifact0와 두 진단7f/972의 소진 budget도 보존한다. 패키지 Actions grant는 기존 Owner UI 보고(layoutManager Admin/상속 체크/members 없음)를 유지하며 새 API/UI grant attestation이 아니다. 실제 protected job의 후보·승격 쓰기는 증명됐지만 Root OAuth를 packages writer로 relabel하지 않는다. 순차 readback은 atomic multi-tag transaction·외부 writer 완전 배제 보장이 아니다. baselinea6는 registry-only이며 운영0.58 근거를 대체하지 않는다. 다음 최소 Unit은 해당 운영 동일 스냅샷/backup/schema/RPO/restore/old App start를 검증한 뒤 파일럿을 재판정하는 것이다. 이 문서 기록 commit/push는 실제 이미지 source33과 별도다.

---

## U-225-DOT-LOCAL — Root 대행의 관측 기반 최소 수리 (2026-11-08)

Manager가 DOT01–05 요구사항/AC를 먼저 기록했고, 기존 Developer의 반복 context 복구 실패/source 변경0을 근거로 Root가 구현 대행을 계속했다. fixed singular ID 문자에만 dot을 추가하고 기존 plural charset·raw dot-segment/인코딩/경로 이동·다른 repo/origin 거부·한 번 소비하는 descriptor session을 유지했다. diagnostic은 공통 UPLOAD_PATH를 참조한다.

실제 관측과 같은39자/문자 분류의 합성 fixture에서 기존 source는 CA_UPLOAD_LOCATION_REFUSED로 RED였고 수정 후 GREEN이었다. 원 실제 token이나 UUID suffix를 재구성한 fixture가 아니다. Root의 candidate47/diagnostic13/registry15/release18=93 로컬 시험·compile/diff PASS. source SHA256은 candidate helper `5d0012c4c2921a02edbe8be93f2a3b59ae4c54213a5ccc8b71c23cf7094b4847`, test `3bc713064e0396e6ff59b5fb63989e9b1490d31ffd51ab63451223e2895f02cd`; diagnostic helper `a1b4eb3bfcdcac465f3182a6ca5e4f3a56e3415317d1a9bae4500ec0a8b56186`, test `54b937031724d510fd8ad1a4bae11151bf353dcd459d58f09ddb7b2672bb4a36`.

Manager는 최소 diff를 수용했다. 독립 QA receipt `7a457be495e26e08804a3573dc11939aa7cd6d771fde214f683f48de64f55d49`는 최종4파일 hash/old RED→new GREEN, 네트워크를 차단한93시험 PASS 및 별도57개 입력의 predicate 동치·compile/diff PASS를 확인했다. full CI/Main·새 실제 candidate는 아직 대기다. 로컬 성공을 실제 게시 성공으로 기록하지 않는다.

---

## U-225-TAX-ACTUAL — 구조 진단의 실제 단일 관측 (2026-11-08)

[PR256](https://github.com/planner77/layoutManager/pull/256) head `74a9c8cd7a207015a073fbb16b79fd4de3484dba`/tree `41cafba11d521e9d33e3ef40ba316ae3ed2efd61`의 [CI682](https://github.com/planner77/layoutManager/actions/runs/42390455739)는 적용8/8 SUCCESS/A2 scope SKIP다. 실제 Docker archive `925dfa839e9bb65f3a07a812397f4dad0426a2a1`/동일 tree/정확 [Main319,head74] parents와 당시 진단12회귀를 독립 확인했다. CI receipt SHA256 `b7def1a9fff92d4362046522fc96cfad1bde58c638fbcb92dab70606b719d1a2`; 정상 Main `72181f4af810321f743e3a4fca251094b4c79a1a`를 확정했다.

새 packet `97218a2dc5c6a9de6cc3a5ac19275260e1180a747f4ea180efb874472e92cd48`를 Manager/QA가 검토하고 즉시 source/policy/environment/legacy/privatepackage/registry를 재조회했다. [실제 taxonomy2](https://github.com/planner77/layoutManager/actions/runs/42392837552) attempt1/job128463876336은 환경26560473351의 별도 실제 승인 기록 뒤 POST1회/202/SUCCESS를 남겼다. Root의 기존 작업1–4 범위 Owner 대행 행위이며 독립 두 번째 사람의 승인이 아니다.

정확1 artifact13581359468/ZIP `sha256:a4d604e25341c810b897e5d67e323db6fe468120a99d7374aea4b5acb93b4e0c`/정확result.json SHA256 `20cbbaa4034a1a0cbb8ce3e3aa8b4ee35683c007b7fd52b6f930a8a7d34baa29`를 확인했다. raw/resolved fixedSingularPrefix=true/segment7/최종opaqueID39자 alpha·digit·hyphen·dot이며 pathPattern만 false, 다른 현행 조건은 모두 true다. query/normalization/traversal/encoding 이상은 관측되지 않았다. 이는 한 ID의 dot 존재만 증명하며 원문·dot 위치/개수·UUID suffix/과거 실패 URI는 UNKNOWN이다. 독립 실제 artifact QA receipt `feda89e8d197e7201760acc857dc2ca1b15b9ced7ffcd3d9f9376f47704551d7`.

Location follow/PUT/manifest/tag/delete/cancel/retry0이며 이 진단의 budget도 소진됐다. 진단 후 pull-only receipt `d1a79c0cb6f0bd6e204dd940e8c3b061f8baf64cd352c5be68354e6adcb9a53e`는 정식0.61태그3 absent·기존0.60/latest 불변을 확인했다. 성공한 빈 blob-init 관측은 후보/정식 게시가 아니다. 운영 flags OFF/자동 HOLD/GO-PILOT BLOCKED 유지.

---

## U-225-TAX-LOCAL — Root 역할 대행과 구조 진단 로컬 검증 (2026-11-08)

기존 Developer에게 Manager 지시를 전달했으나 완료 agent를 깨우지 못한 지연이 있었고, 재개 후에도 Developer가 context reset/private recovery 실패를 보고했다. Developer는 source 변경0을 확인했다. Root가 실제 구현을 대행했으며 Manager가 두 source의 diff/hash를 검토·수용했다. 기존 Developer가 구현했다고 기록하지 않는다.

이전 source에서 새 rawPath 구조 시험은 KeyError로 RED였고 Root 구현의 선행 pair에서 diagnostic12/candidate45/registry15/release18=90 로컬 시험 및 compile/diff 검사가 통과했다. 필드 이름 명확화 뒤 diagnostic12를 다시 통과한 최종 helper SHA256 `9835429f701979501eff3d6d4afaba74e4af88577e0a5bde9b0dfd878982fab6`, test `72db8d76cdea5425c59eb57fa95ace1da0148805673f66398bfc83f70660c40c`. 독립 QA receipt `f5d7bc655d39f67afa9cafff80ac3731c6595492f5c6830955d0f9ae8739e872`는 선행 pair의90회귀와, 필드 이름만 명확히 한 최종 pair의 diagnostic12/8,899개 실제 upload_target 비교(불일치0)/compile/diff PASS를 구별해 수용했다. 최대 관측 shape는4,912bytes이며 cap6,144bytes를 유지했다. full CI/Main·새 실제 구조 진단은 대기이며 로컬 성공을 실제 server URI 관측으로 기록하지 않는다. 프로토콜·publisher·권한·운영 기능은 변경하지 않았다.

---

## U-225-CANDIDATE2-FAIL — 실제 두 번째 후보의 경로 거부 (2026-11-08)

[PR255](https://github.com/planner77/layoutManager/pull/255) source `0050e94836cc6d4acaefc6cdbe948a9d02613674`/tree `818d5abfa778e0ed83c77fd0a537467be5bd709d`는 [CI681](https://github.com/planner77/layoutManager/actions/runs/42385929264)의 적용8/8 SUCCESS/A2 scope SKIP를 통과했다. archive `2c8fabcd2253c16a7cd13035be791f4b999b6341`의 동일 tree와 정확 [base d19, head0050] parent를 독립 확인했고 정상 squash Main `31998d6fb466ff97153cf3153480edc515121ca5`를 확정했다. 독립 CI receipt SHA256 `f64240aa68a64e7c2adac11bff8e8a561dc94ed445cf0448933f75b82baec242`. 후보45/registry15/release18 및 type/lint/unit1103/build/Docker/E2E 통과와 실제 GHCR 호환을 구별한다.

새 packet `fdfd9020a7ceac8f4ac57549be39b91fcf4437af52b94b3f4d529c4964617572`는 별도 Manager/QA 검토와 즉시 Main/policy/environment/legacy/registry readback 뒤 [candidate2](https://github.com/planner77/layoutManager/actions/runs/42388044377) attempt1에서 실행됐다. 실제 환경26560473351의 승인 API/승인 history를 확인했다. Root agent의 기존 작업1–4 범위 Owner 대행 행위이며 독립 두 번째 사람의 승인이 아니다.

세 이미지 build/RR1/실제 RR2/RR3는 PASS였지만 publish step에서 `CA_UPLOAD_LOCATION_REFUSED`로 FAILED했다. OIDC·subject 검증·artifact 업로드는 SKIPPED, 실제 artifact inventory0, allowlist/receipt-bound cleanup은 SUCCESS다. 독립 runtime receipt `7fb591cfdeaed9a47a576108340cb2dc8dd2ce48eea64b02b0ff0965566a8a96`. pull-only 후속 조회 receipt `c66de7991834346c758a0c335e18b5435528fe0f38740d791de8264729840c1b`는 해당 후보3/정식3 authenticated absent와 기존0.60/latest 불변을 확인했다. opaque202 session 자체는 unknown이며 삭제·재시도하지 않았다.

이전 실패70c2/진단7f의 budget 소진과 이번 실패fdfd를 보존한다. 공개 route 기반 FS 수리는 local/CI PASS이나 실제 호환은 실패했다. 원문 Location은 미저장으로 정확 URI는 여전히 UNKNOWN이다. 새 taxonomy의 구조 관측·새 후보·정식 승격은 미실행이고 운영 flags OFF/자동 HOLD/GO-PILOT BLOCKED를 유지한다.

---

## U-225-FS-LOCAL — 유한 upload session의 독립 검증 (2026-11-08)

기존 uploader에 공개 단수형 합성 fixture를 넣은 RED는 CA_UPLOAD_LOCATION_REFUSED를 재현했다. 수리 후 독립 QA에서 candidate45/registry15/release18=78개 시험, compile/diff 검사가 통과했다. 고정 repo의 두 route, raw query byte 보존, descriptor/path/size/hash, 실제202 뒤 durable intent와 단일 소비, 다른 route·repo·manifest·재생·journal 실패·불확실 response를 검증했다. QA가 찾은 빈 fragment `#` 허용은 literal 구분자 거부와 singular/plural·query 유무 음성시험으로 보완·재검증했다.

최종 helper SHA256 `995c001e0c6c64d814eedd911d410a2ab912ab0589984e537cc2526e8b5a7ee5`, test `711f137ff768414e77c94a0d11f7620f5ae2302ffcb3f048ebbc13a038a2e5dc`; 독립 receipt `01568d0bde4d34de496d77d07696b094a33e790661f14ac5017dfd76d5a0a765`. 실제 네트워크 수리 검증·새 full CI/Main·fresh candidate·정식 승격은 아직 미실행이다. 공개 route 호환과 원문 미확인의 차이를 유지한다.

---

## U-225-UL-OBS — 실제 단일 요청과 후속 유한 경로 수리 (2026-11-08)

PR254 source424dc8/treec839의 [CI680](https://github.com/planner77/layoutManager/actions/runs/42381506929)는 적용8/8 SUCCESS/A2 scope SKIP이며 archive2cdde359와 정상 Main `d19d045b`의 동일 tree/정확 parent 관계를 독립 확인했다. protected diagnostic42383905261은 별도 실제 환경 review 뒤 HTTP202·정제 artifact1개를 남겼다. 주소 원문/opaque 값 미저장·POST1·follow/PUT/manifest/tag/delete/retry0 범위의 관측이다. 결과는 현재 publisher의 path 조건만 불일치함을 보여주며 정확한 폐기 URI는 미확인이다. 상세 hash/한계·1차 규격 자료는 [FailureLedger](FailureLedger.md)가 정본이다.

후속 FS 수리는 고정 repo의 문서화된 단수/복수 route와 한 번 소비하는 descriptor session을 준비한다. 기존 코드에 공개 단수형 합성 fixture를 넣은 RED 시험은 같은 CA_UPLOAD_LOCATION_REFUSED를 재현했다. 실제 네트워크를 이용한 추가 진단은 없고 새 source QA/full CI/Main·fresh candidate packet/run/별도 실제 환경 review가 필요하다. 이 수리나 이전 진단을 후보 게시·정식 승격 성공으로 기록하지 않는다. 제품/운영 데이터·플래그 불변, GO-PILOT BLOCKED.

---

## U-225-UL-LOCAL — 보호된 단일 POST 진단의 로컬 검증 (2026-11-07)

Developer의 새 진단/CI 연결 4개 source를 Manager가 검토했고 독립 QA가 사전 source의 진단9+기존 candidate40/registry15/promotion18=82개 offline guard를 통과했다. 이어 실제 후보와 같은 고정 Accept 헤더만 추가한 최종 source는 독립 진단9/compile/diff를 다시 통과했으며 이전 82개 근거는 predecessor hash로 구분해 보존했다. YAML2개 파싱·inline plan 유효/무효 packet, 기존 Location predicate와 10개 합성 URI의 동등 비교·canary 비노출도 확인했다.

최종 helper SHA256 `4d9dac256c2af682aa5cf18c899a7d3795b99e0bdb94f1be620cf41251214d80`, test `db5c994e0667860a23525f38569b8cf7f06b44bc3f866eb64b0aefba824d7e65`; 독립 QA receipt `dc59f7c6d4e82481cf51d1dc897a62780299e9bb41d498f090e854198ec0c837`. 순수 정제 결과는 문자·포트 분류와 현재 publisher 조건별 bool만 보존한다. 실제 GHCR POST/진단 실행0이며 새 full CI/Main·concrete packet·actual platform review 전 실행하지 않는다. 이 시험은 Location 허용 확대나 후보 게시의 성공 증거가 아니다.

---

## U-225-CANDIDATE-FAIL — 승인된 후보 실행의 실제 실패 (2026-11-07)

[PR253](https://github.com/planner77/layoutManager/pull/253)의 최종 source `5096b2e1` / [CI679](https://github.com/planner77/layoutManager/actions/runs/42376036144)는 적용8/8 SUCCESS, A2 scope SKIP다. archive `152132fd`와 정상 Squash Main `b8c8ee5e`는 모두 tree `1534fe96`이며 정확 source/parent 관계를 확인했다. 기존 CI678 UNKNOWN 실패는 보존한다.

이 Main의 실제 protected candidate run42378293644는 build/RR1/RR2를 통과했으나 publish Location guard에서 실패했다. 서명/검증 및 artifact는 없으므로 승격 입력이 아니다. 후보·정식6 ref는 실제 재조회에서 모두 부재, 기존0.60/latest는 불변이다. 정확 실패·불명 session 상태와 승인 범위는 [FailureLedger](FailureLedger.md)의 candidate42378293644가 정본이다. 다음 protected one-POST 진단은 구현 준비이며 실제 실행0, parser 변경0, 후보 재시도0이다. 운영 배포·DB/CAD/Volume/.env/플래그 변경0, GO-PILOT BLOCKED.

---

## U-225-P1D-OBS — CI678 미재현 및 실패 진단 검증 (2026-11-07)

동일 tree의 격리 로컬 App/Migrator/Worker와 실제 HTTP→Viewer→권한 회수·변조·미지원 경로를 세 차례 실행해 모두 통과했다. `LOCAL_SIMULATED_P1D`이며 GitHub-hosted CI/후보 게시/운영 시험이 아니다. CI678 `socket hang up`은 **CAUSE UNKNOWN / NOT REPRODUCED**로 남긴다. 재시도나 제품 수리를 했다고 주장하지 않는다.

다음 실패의 관측 누락만 보완한다. 실패한 소유 App의 status/running/OOM/restart/exit allowlist와 health HTTP 상태만 정리 전에 남기고, 조회별2초·출력128자 및 원래 실패/cleanup을 유지한다. 권한 회수 POST는 한번 그대로 호출하고 literal route/시각만 추가한 뒤 원래 오류를 던진다. Developer의 실제 trap seam 고의 실패5건은 정상/inspect실패+canary/과대출력/진단출력실패/inspect timeout에서 원래42·App→Volume 정리를 보존했다. 독립 QA도 source hash 보존·고의 실패5건·bash syntax·전체 TypeScript·diff 검사를 통과했다. 새 full CI는 아직 미실행이다. 기존 실패와 로컬 정제 요약/명령은 Git 제외 증거에 보존한다.

---

## U-225-CI678 — 게시 전 required CI 실패 (2026-11-07)

[PR253 CI678](https://github.com/planner77/layoutManager/actions/runs/42373629270)는 head `cbebce9d`/동일 head·archive tree `ed05eb7a`에서 FAILURE다. 적용8개 중6 SUCCESS, Docker P1-D 및 종합 gate FAIL; A2 범위 외 SKIPPED. Static175 files/1103 tests·build 및 브라우저/G7 E2E4개는 SUCCESS다. 실패 단계는 Admin Site revoke POST의 `socket hang up`; App process 원인은 UNKNOWN이다. 이후 Docker 단계는 미실행이고 Main/후보·정식 게시0. 정제된 callsite·시각·진단 누락과 승인된 재현 경계는 [FailureLedger](FailureLedger.md)의 CI678이 정본이다. 다음 source의 독립 QA와 새 전체 CI가 필요하다.

---

## U-225-CONTROLS-20261107 — 승인된 Work 1–3 실제 통제 검증과 게시 전 점검

**기준 source:** PR250 정상 병합 Main `62dcd3b5f7f78e37841bc14b5ca48f6c038e68f8` / tree `bf2980ce5dc16d89c5ca8957a89eb6497bbb5766`. 최종 head `286dff51`의 [PR CI676](https://github.com/planner77/layoutManager/actions/runs/42368191670)는 적용8개 Job SUCCESS/A2 범위 외 SKIPPED; archive `6c427851`은 같은 tree와 정확 parent 관계다. Main HOLD run42369529538 SUCCESS. 기존 CI674/취소675와 실패 이력은 보존한다.

| Work / 근거 | 실제 결과 및 한계 |
| --- | --- |
| 1 독립 조회 | Owner 인증/관리 권한 및 source-bound Rule Suite list+detail reader PASS. 조회 성공을 정책 차단이나 새 승인으로 부르지 않는다. |
| 2 기본 권한 | Owner packetA `069400c2` 6건, Actions 전용 packetB `9e4d998e` [run42372382795](https://github.com/planner77/layoutManager/actions/runs/42372382795) 6건 모두 실제 생성→FF갱신→삭제 성공. Actions API의 시각 표기가 UTC이고 Owner는 +09:00이지만 4개 시각 instant/나머지 전체 필드가 동일해 exact raw snapshot hash를 actor별로 보존했다. |
| 2 보호 규칙 | Owner7 + [Actions7/run42372614042](https://github.com/planner77/layoutManager/actions/runs/42372614042) 모두 거부·ref 불변. 조회 전용 외부 감사와 독립 QA가 **실행26건(기본12+거부14)**의 규칙 평가 증거를 수용했다. 원래 strict helper는 PENDING이며 아래 한계를 유지한다. |
| 거부 증거 | 직접FF는 열린 시험 PR과 연결되어 PR 평가 PASS/정확 required CI FAIL이다. 원래 예상 PR-fail 주장은 UNSATISFIED. nonFF에서는 active PR와 nonFF가 둘 다 FAIL이며 어느 하나만의 차단 원인이라는 주장은 하지 않는다. PR251/252의 실제 squash 후보는 각각 `db90045f`/`0df1e021`: exact PR, 단일 parent Main, head와 같은 tree, 직접FF 후보 제외, actual merge 요청 시각 ±1초와 일치해 CI 차단을 독립 확인했다. |
| 정책/정리 | 동일 Ruleset26731716/26731135의 임시 prefix만 제거하고 Main/v* active/우회자0/Owner never를 실제 GET으로 확인했다. 생략된 PR 옵션의 서버 default가 true로 바뀐 첫 PUT 실패를 보존하고, 기존 false와 required_reviewers=[]를 명시한 별도 wire hash로 복구·확인했다. 소스의 4 payload/hash는 불변. 소유 PR251/252 종료 및 전체12 fixture ref·별도 진단 ref 부재 확인. |
| 3 publisher | 기존355693716 실제 disabled_manually 및 기존168 run completed inventory 보존. 별도 2번째 진단403의 정확 `Unable to retry disabled workflow`를 source M classifier와 fresh GET으로 감사 수용했다. 첫403 원인은 UNKNOWN, 과거 helper 실패를 PASS로 바꾸지 않았고 세 번째 POST는 없다. |
| 3 writer / 환경 | package14938097 private, linked repo 확인. Owner UI 보고: layoutManager Actions Admin, 저장소 권한 상속 체크, members 없음. API collaborators Owner만/team0. Environment26560473351은 Owner reviewer/main only/admin bypass false. 실제 candidate/promotion run review는 아직 미실행. |
| 4 게시 전 조회 | 실제 pull-only 재조회에서 0.60 App/Migrator 및 latest 별칭 digest·source9eb8 불변, 정식0.61 태그3개 authenticated absent. 운영 복구를 수행했다는 뜻이 아니다. 후보·정식 게시 및 GO-PILOT은 미완료. |

정제된 로컬 증거는 Git 제외 `data/release-proof/issue225-execution-resume-20261107/`에 보관한다. 전체 control receipt SHA256 `1ad3138b9841113009fe5dc9477457735955e1ce62f42cc5eea56e08abde3ee5`, 독립 QA receipt `0b523b9d…`. Source M에 대한 실제 통제 증거이며 이후 Main의 CP helper/정책 byte 동일성 및 live control 재조회를 확인해야 한다. 지정 5.6 역할 모델은 제공되지 않아 Manager gpt-6-astra/Developer gpt-6-sol/QA gpt-6-luna가 대행하고 Root가 외부 변경을 실행했다.

**별도 게시 도구 호환성 수리:** Root의 실제 GHCR root GET401은 고정 placeholder scope `repository:user/image:pull`을 포함했다. 기존 client가 이를 허용하지 않아 사전 조회가 중단(쓰기0)됐다. 고정된 실제 응답 하나만 허용하며 token endpoint/service/실제 package scope는 변경하지 않는 최소 수리를 준비한다. Developer synthetic security regression40 PASS; 독립 QA candidate40+promotion18+registry15=73 PASS, compile/diff/source hash 보존을 확인했다. 새 full CI/Main은 별도로 기록한다. 운영0.58 복구·현장 CAD·실 배포는 미실행, 제품 Scene flags OFF/자동 출고 HOLD/#225·#218 OPEN/GO-PILOT BLOCKED.

---

## #225 MS — source-bound CI674 pass and further merge-proposal readiness repair (2026-11-07)

Independent QA read completed PR250 CI674/run42365892136 at exact head `8b1b95b10ae8b9efa997e50922a34e1bd9dcafbd`/tree `551b44d209353062230c5efbe2c6eacf82bfd5e7`: all eight applicable jobs and required aggregate SUCCESS; A2 scope SKIPPED. Static175 files/1,103 tests PASS, type/build PASS, ESLint0 errors/12 existing warnings. Docker verified exact three-role archive/registry roundtrip, nonroot/offline Worker, converter KILL/OOM recovery, signed HTTP→OCI→fresh Viewer and actual0.60 upgrade/same-backup recovery/owned cleanup. This is success for that source, not future modified source or GO-PILOT.

Before any full controlled-ref writes, Root inspected the already preserved failed Suite4964214924 and found server squash candidate `fe314edf…` differs from PR249 head `cbb3810b…`. Actual candidate GET has exact before-parent `e602bd78…` and head tree `e0b4375b…`; suite includes exact PR metadata and required-context failure. Existing merge matcher incorrectly expected after-SHA=head. Manager recorded MS01–05 for merge-only proposal/PR/tree/parent binding with narrow read authorization, unchanged direct-Ref exact matching and strict active/identity/context requirements. Independent new source QA/CI/Main are required; earlier674 cannot supply that result. The full26-case staging is still non-executable and no full-policy denial PASS is claimed. Root will rebind fixture/packet to accepted new Main after these gates.

**Updated MS independent QA:** gpt-6-luna froze the final four Python source hashes and independently ran CP12+LP26=38/38 PASS, py_compile4/4 and diff-check PASS. A local fake transport replay using saved actual Suite4964214924/PR249/server candidate metadata reproduced old8b RED `CP_EXACT_RULE_SUITE_UNAVAILABLE` and current GREEN only with exact PR id/number/source, required active rule/context, proposed SHA/single before-parent/head-tree and fresh final PR/base/head/check/ref binding. Negative cases cover malformed entries, missing/duplicate/ambiguous/wrong metadata, source/actor/time/ref/parent/tree/SHA mismatch, arbitrary routes and mid-read drift; direct Ref exact after-SHA stays enforced. The replay performed zero live GETs/writes and is not live policy-denial proof. Ignored receipt `qa-independent-merge-fix.json` records actual commands/hashes. Manager review and fresh exact-head CI/protected Main remain gates; CI674 covers only old8b.

**Actual role execution:** Manager is gpt-6-astra; Developer is gpt-6-sol; independent QA is gpt-6-luna; Root Codex owns external operations and final commit/push. The user's bootstrap roles named gpt-5.6-sol/luna, which are not in this environment's available model list; the available6-sol/luna roles used by the latest repository mapping performed those duties. No unavailable model is recorded as executed. Actual frozen source/tests/commands and scope limits are recorded for the agents that ran.

---

## #225 — Authenticated resume: real reader, Environment and legacy observations (2026-11-07)

**Actual Root observations, source Main `e723d989` / tree `e0b4375b`:** User completed existing Owner login. REST identity is `planner77`/45478892 with repository1359528829 admin access. The exact clean-source `--readiness-check` returned `CP_INDEPENDENT_READER_PREFLIGHT_PASS`, list and same suite4964400827 detail readable, bound to packet `9ee4a860…37607179`. This completes Work1 reader capability only. A later full packet needs its own fresh preflight; the old packet has not been used for Ref writes.

**Environment / package:** Root observed no release Environment, then applied the existing reviewed configuration proposal under the user's Work1–4 authorization. PUT and branch policy POST both200; actual GET Environment26560473351 `issue225-candidate-publish` has Owner45478892 as sole reviewer, `prevent_self_review=false`, `can_admins_bypass=false`, custom branch policy exactly `main`/branch (policy65838705). No run review occurred. Initial package GET403 explicitly required `read:packages`; after user refreshed that existing scope, actual GET200 returned package14938097/private linked to `planner77/layoutManager`. Complete version inventory was396 entries in four pages `[100,100,100,96]`; baseline SHA256 `10463d667d234b25e93346e1a2b22aff4e4b6382c753c9581144aba6e90a0b2f`. Existing app `0.60.0`/`latest` point to `sha256:c5d133a0335d3f8391f499880a3e8d38e197375b3cc298118e2701f2796aaf2c`, migrator `0.60.0-migrate`/`latest-migrate` to `sha256:1680f36e05cf45f9630ba4b3de182e3391a6d04190fa9b7093a6bf289d6b9128`; no0.61 final tag observed in that complete baseline. Owner then reported the actual Package settings UI: Manage Actions access lists `layoutManager=Admin`, source-repository inheritance checked, Inherit Access members empty. This is Owner-reported UI evidence, not API-attested ACL. Separately Root REST verified only Owner45478892 as repository collaborator/admin, teams0, default workflow permission read and PR-review approval false. Owner administrator can change/re-enable controls; no independent second-human review or exhaustive Owner credential inventory is claimed. No package ACL or image was changed.

**Legacy live execution:** The unchanged bounded helper read all168 legacy355693716 runs in30-row pages, all completed; normalized inventory SHA256 `7c9f0db645a5299734ef0bfbe6117704df8b66d76798b8f9c88f1144d09dd9aa`. Exact packet `e800a3a7aaa8d311be6c14898d4374a2e8e2e8523839d337ebf92fe31f7f0762` binds this source/helper/replacement read-only HOLD run42329339528/workflow408674805 and safe Main160 run42075718479/source476b686a7b9bb1ff9c691a71f895bd833311e090/attempt1. Observe passed; disable returned204 and actual same-ID `disabled_manually`, unchanged inventory. First safe rerun POST returned403 but the unchanged classifier reported `LP_RERUN_REFUSAL_UNCLASSIFIED`; original response message was not retained, so its cause stays UNKNOWN.

**Separately approved diagnostic, not a third probe:** One new journaled attempt used the original bounded transport/classifier after fresh preflight. It captured403 with exact message `Unable to retry disabled workflow`, message SHA256 `aec1d32332e7e83267548dabeff7cfc4e0237f6b6ad2910c28b5df866828d597` and request ID `14AB:151D8E:32703F:579A58:6AEF00AE`. Independent post-GET found safe run still attempt1/completed/success at the exact old source, workflow still disabled, complete inventory hash unchanged. The old helper still failed its classifier; no new attempt, automatic retry/cancel/re-enable or third probe occurred. A later accepted source may classify this stored witness in a separate receipt; it must not relabel either old helper run PASS or prove every historical run/other writer path.

**Code readiness defects identified before full control proof:** Actual active failed suite4964214924 has `result=fail` and expected active required-status-check failure but omits optional `evaluation_result`. The existing verifier incorrectly required that separate optional field. The proposed minimal fix requires authoritative exact `result=fail`, preserves present-field/list-detail consistency and every actor/ref/SHA/time/source/active-rule check. The LP fix adds only the observed original exact string on403; unknown/auth/near messages still fail closed. Developer gpt-6-sol reports focused CP11+LP26=37 PASS, four-file compilation and diff checks PASS. Manager gpt-6-astra reviewed requirements/design; independent QA/new exact-head CI/Main are required before the full proof uses changed source. Product0.61.0/Schema/flags unchanged.

**Independent source QA / local acceptance:** QA gpt-6-luna independently froze all four changed Python files and reran CP11+LP26=37/37 PASS, py_compile4 and diff-check PASS. Original CP helper reproduced RED on the saved real-shaped active failure (`CP_EXACT_RULE_SUITE_UNAVAILABLE`); repaired helper GREEN requires the same exact expected active rule/actor/ref/SHA/time/policy chain. Original LP classifier returns false for the stored exact message; repaired classifier returns true only at403, while status/unknown/near/auth/negation and full fake-perform preflight/readback/single-POST protections pass. This is synthetic regression and read-only stored-witness replay, not a third network probe or full policy-denial proof. Manager accepted the local source/QA scope for ordinary Draft PR/full required CI/protected Main integration. No app source/Schema/workflow gate changed; full app build/type/lint/bridge and exact-head hosted CI were not independently run locally and remain required through repository CI. Four code hashes and commands are in ignored `qa-independent-source-fix.json`. Actual stored diagnostic acceptance is a separate post-Main receipt; CI/Main are still pending at this source publication.

**Evidence / disposition:** Actual reads and bounded writes are recorded under Git-excluded `data/release-proof/issue225-execution-resume-20261107/` (`reader-readiness-success.json`, `environment-setup.json`, `legacy-*`, real Suite shapes). Root held credentials only in memory; no credential/header was stored. Control Ref/Ruleset prefix mutations, full Owner+Actions denial proof, candidate publication/promotion and GO-PILOT remain NOT RUN/BLOCKED. Legacy355 is intentionally disabled; Main read-only HOLD remains active. No operating DB/CAD/Volume/.env, existing release image/tag/alias was changed. Prior authentication failures and rejected packet history remain below.

---

## #225 — Independent QA of approved Work 1–4 packet preparation (2026-11-07, 0.61.0 유지)

**역할:** Manager gpt-6-astra가 로컬 준비 범위로 수용한 Developer gpt-6-sol 작업물을 QA gpt-6-luna가 별도 검토했다. Root는 실제 외부 인증/readiness 관측을 수행했다. 이번 QA는 `/home/planner/Dev/layoutManager-issue225-execution-source`의 clean Main `e723d98905953298a9cb5b080a9081b72d963f87` (tree `e0b4375bf2ea317a56092adc369e25b6cc598a79`)에서 수행했다. owner guard PASS.

**로컬 결과:** 교정 packet `9ee4a860c334209e45a3f8db4f3f47339503ce75bdfb2f890f52e03037607179`와 manifest `0a2d476f1310165f4a87e56457d8eacf7fe20b3a9b84e0a13053594fc0cdfa50` 일치, packet schema 7 cases/3 refs PASS. 네 local policy byte hash, 두 initial→final policy delta 모두 PASS. CP focused unittest **11/11 PASS**. Default capability plan **6 cases, zero HTTP**, denial plan **1 case, zero HTTP** (`PLAN_ONLY`, `ownerApproval=NOT_ATTESTED`). 빈 독립 reader token으로 readiness를 재현해 exit 1 `CP_INDEPENDENT_READ_TOKEN_MISSING`를 확인했다. 전체 해시와 재현 결과는 Git-excluded `data/release-proof/issue225-execution-20261107/qa-independent-review.json`에 있다. 앱 build/typecheck는 코드 변경 범위가 아니어서 실행하지 않았다.

**준비/이력 검증:** baseline hash `c7afe796f029d08c080998ca6cfa577abde0ec1fae33a7ccc3f379d3e42ddacd`, exact-ref readback `0a704e0a8cf7f697833735f41025098f0eb094a682606b1a6e0c9ab680f81738`, capability/denial plan hash 각각 `310606ec5960a0ac16385abf7ecdb0c96aa81921a55ee766507ed07964dd3e3d` / `9fe4374a31504461f07913fb709dad1203b1bba6970da26ba4fd0dde9e2a2f46`가 일치했다. 이전 packet `04127102fe862a01d91026165e8c13381627862cea0600601c0b15f6ca28ac40`은 parent `e602bd7`에서 child `e723d98`로 가는 `force=false` update가 아니라 rewind를 시도하여 외부 작업 전에 거부됐다. 수정 packet은 양 ref family에서 parent create → child fast-forward update(force=false) → child delete를 계획하며 ancestry 확인 결과 parent는 child의 ancestor, 거리 1 commit이다.

**기준점/문서 일관성:** Root가 기록한 PR #249 CI `42327709556`의 HEAD는 `cbb3810b88193dadc37ec5d9c15f5749cfea7776`이고, Main workflow `.github/workflows/main-hold.yml` run `42329339528`과 `.github/workflows/docker-publish.yml` run `42329339341`의 HEAD는 `e723d98905953298a9cb5b080a9081b72d963f87`이다. 세 실행은 모두 completed/success이며 source tree는 `e0b4375bf2ea317a56092adc369e25b6cc598a79`로 같다. Required CI archive source의 별도 결합은 아직 미완료다. Main Ruleset `26731716`과 tag Ruleset `26731135`는 기준점 snapshot에서 active/no-bypass로 readback됐다. v0.61.0 Git ref GET404이며 candidate는 NOT_PUBLISHED; 성공한 CI나 Git ref 부재는 registry digest/Environment/release authority 증거가 아니다. README·ChangeLog의 진행 요약 및 Operation·FailureLedger의 인증/복구 경계는 이 결과와 일치한다.

**실제 외부 한계:** Root의 sanitized readiness receipt에는 기존 credential의 메모리 내 token retrieval 성공이 기록돼 있으나, 인증 성공을 뜻하지 않는다. identity/repository/Rule Suite/environment REST GET 네 건 모두 HTTP 401, helper exit 1 `CP_INDEPENDENT_REPOSITORY_UNVERIFIED`, mutation 0건이다. 연결 앱 Rule Suite는 403이고 Environment/Workflow metadata endpoint는 미지원이다. Root의 세 정확 ref GET 404는 해당 시점 관측일 뿐이며 실행 직전 재조회가 필요하다. 이는 policy denial 증거가 아니다. 현재는 독립 reader receipt, live denial, legacy publisher/Environment authority, exact three-image candidate/promotion evidence가 없어 **Work 1–4 live incomplete; GO-PILOT BLOCKED**다. No GO. 버전 `0.61.0` 유지, Scene flags OFF, >=0.61 GHCR HOLD.

---

## #248 / PR #249 — CI #666 actual trace confirms EOF-only DXF parser failure (2026-11-07)

[CI #666/run42320485967](https://github.com/planner77/layoutManager/actions/runs/42320485967), exact head `213a8f827e14104b94de6b1f2ca431f9d9bb2076`, failed Chromium shard2 job128245490386 `TC-DESC-005`, 73 PASS/1 FAIL. The new readiness check in `upload.spec.ts:513` observed `도면 로딩 중…` then `표시 실패` instead of `도면 표시 완료`. Actual Playwright `playwright-general-2-1` artifact13553606944 browser console reported `TypeError: e.entities is not iterable` in `_FetchFonts → Build → _Load`, while the HTTP source GET `/api/cad-files/:versionId/content` returned 200. The test uploaded only `0\\nEOF\\n` (no `ENTITIES` section). This materially supersedes the earlier unconfirmed focus/hydration explanation; both #662 and #666 remain historic failures.

Minimal remediation: replace **only** this metadata/viewer test's malformed source with a valid `SECTION/ENTITIES` DXF containing one LINE, as existing successful browser fixtures already do. Keep exact description persistence, search and tooltip assertions; add required Viewer-ready status before first focus and retain post-reload ready/blur/focus checks. No product renderer/parser or other EOF-only test cases altered. Full new exact-head CI is **PENDING** (not claimed successful). GHCR/operating state, Rulesets and feature gates unchanged.

---

## #248 / PR #249 — failed CI #662 and bounded browser synchronization repair (2026-11-07)

[PR CI #662/run42318249059](https://github.com/planner77/layoutManager/actions/runs/42318249059) on exact HEAD `66c64a80f6fb213aa8365988e701741ab927e948` ended **FAILURE**: successful scope/CP regression/Static+Build/Docker/G7/Chromium1 and Greenfield; Chromium2 job128238049621 failed `TC-DESC-005` post-reload Tooltip `getByRole('tooltip')` 5000ms timeout at `upload.spec.ts:511` (73 browser cases passed, 1 failed). Required aggregate job128241617652 failed with `Required general-e2e did not succeed`. Earlier #661 on superseded HEAD was **CANCELLED**, not PASS.

Source inspection: `viewer.tsx` uses React focus handler to show Tooltip. Existing test first focus after navigation succeeded, but the second focus immediately after reload had no readiness synchronization or guaranteed focus transition; hydration timing or retained focus is a reasonable hypothesis, not independently established cause without trace. Changed test scope is only the post-reload sequence: wait for exact Viewer `도면 표시 완료` state, explicitly blur and refocus the name button, confirm focus, then retain the original exact multiline Tooltip text and visibility assertions. No disabled/skipped test, longer timeout, relaxed feature contract, product/CI workflow/security change. The full new CI HEAD outcome remains **NOT VERIFIED** until actual GitHub status is received; #662 stays failed in history.

---

## U-248 — active policy readback / code-only independent reader repair (2026-11-07)

**Actually observed before code change:** Main `e602bd78549722a29f89a2b1c38a162d91c6be89` and active repository Rulesets Main26731716/Tag26731135, both no bypass; GitHub connection Rule Suite GET returned `403 Resource not accessible by integration`. Live Main Ruleset GET contains explicit PR `required_reviewers=[]` and `require_extra_approval_for_unattributed_changes=false`, with independent rule order. Live Tag `update` is type-only, unlike code's tag proposal branch-only `update_allows_fetch_and_merge=false`. GitHub REST `update_allows_fetch_and_merge` is documented as *branch* upstream operation; omission for Tag has no branch-upstream effect. Official repo Rule Suite list/detail require Administration:read. These are distinct, sanitized actual observations, **not an actual Rule Suite denial test**.

**Code-only change:** `cp-control-proof.py` adds exact type-set based readback matching with only the two reviewed representations; checks Ruleset source, actual current-user bypass state, known PR defaults and immutable requested rule details. Adds GET-only `independent_rule_suite_readiness` and local `--readiness-check` with repo/source/Owner/policy lineage and sample historical list+detail; Owner local `--execute` fails before mutation without a fresh successful read. Existing Actions path does not receive elevated reader credentials and still requires external, separately approved predispatch evidence. New `test_cp_control_proof.py` tests use explicit sanitized live-shaped literals and synthetic 403/missing/detail/source drift variants; synthetic tests are NOT genuine GitHub denial proof.

**Validation at source publication:** New GitHub PR exact-head hosted CI / Main integration **PENDING** until independently confirmed. Live Rule Suite access on this connector remains **BLOCKED**; even if hosted CI passes, it is not actual denied Ref or released image. No Ruleset/Ref/tag/environment/package/credential/production mutation. Preserve previous positive protected-Main PR247/Main167 and latest Main SHA separately from test-source HEAD.

---

## #231 live Ruleset readback and isolated protected-Main PR smoke (2026-11-07)

**Live GET evidence before smoke PR:** Repository `planner77/layoutManager` `main=e10783febd2606dbff5c16258ac5b7b8f01bee71`, `branches/main.protected=true`. [Main Ruleset #26731716](https://github.com/planner77/layoutManager/rules/26731716) is `active`, `target=branch`, exactly `refs/heads/main`, `bypass_actors=[]` and `current_user_can_bypass=never`. It reports `deletion`, `non_fast_forward`, `pull_request` (squash only, approval count0, stale-review dismissal, conversation resolution, no extra unattributed approval) and `required_status_checks` (`Typecheck, lint, test, build, E2E`, GitHub Actions integration 15368, strict/current-base, `do_not_enforce_on_create=false`). These match the reviewed final Main JSON; the additional explicit UI-only default fields are recorded rather than silently equated to an unspecified setting.

[Tag Ruleset #26731135](https://github.com/planner77/layoutManager/rules/26731135) is separately `active`, `target=tag`, exactly `refs/tags/v*`, `creation/update/deletion`, `bypass_actors=[]`, `current_user_can_bypass=never`. This matches the intended release-tag HOLD. Historical `[]` Ruleset readbacks on 2026-11-04 are no longer current. **This API readback establishes configured policy, NOT demonstrated denial** of unauthorised tag create/rewrite/delete or ordinary package write; live enforcement denial and rule-suite evidence are still missing.

**Protected-Main integration smoke:** This docs-only isolated PR records the actual initial Ruleset readback and updates the runbook with live state. The pass condition is exact-head required PR CI from App 15368, no unresolved review/conflict, Main behind0, Squash Merge under the active Main Ruleset, resulting Main SHA readback, new Main CI and GHCR HOLD/publish SKIPPED. Until those events are observed they are **NOT RUN / NOT VERIFIED**; this document does not grant a bypass, change policy, dispatch control-proof, disable legacy publisher, publish candidate/final GHCR, or claim GO-PILOT.

#225/#218/#231 OPEN, `SCENE_AUTO_BUILD_ENABLED=OFF`, `SCENE_CPU_WORKER_ENABLED=OFF`, >=0.61 GHCR HOLD. No production DB/CAD/Volumes/.env, existing image/tag, package ACL or Ruleset mutation by this PR.

---

## #225 P1 release promotion attestation read regression — source correction candidate (2026-11-06)

**Scope:** [PR #244 review](https://github.com/planner77/layoutManager/pull/244#discussion_r4486906552) on already merged source `11532c8` identified a missing Job-level token permission. The private `gh attestation verify --repo` online path is implemented in `release_promote.verify_material()`/`candidate_publish.verify()`, but the `promote` job lacked `attestations: read`. This is an actionable static permission defect; **the actual promotion has NOT RUN**, and `RC_CRYPTO_VERIFICATION_FAILED` is not claimed as an observed run failure.

**Patch/test contract:** Change only the protected `promote` Job from 3 to 4 explicit permissions by adding `attestations: read`; keep plan/readback/top-level permissions and Owner packet, environment, immutable role/digest, offline/online cryptographic checks and fail-closed behavior unchanged. Existing `test_workflow_fixed_permissions_actions_and_each_job_initialization` now enforces the exact four-value permission list, exactly one `attestations: read` occurrence located after the `promote` job boundary, and forbids `attestations: write`, `id-token` and preexisting unsafe workflow actions. No actual private verification, publication, dispatch, production deployment, or Owner GO has been performed. New exact HEAD CI is required for acceptance; **not verified until GitHub reports success**. Historical Signed Release Proof #4 remains scoped to its original source `11532c8`, not this change.

---

## U-225-LI-MANAGER-ACTUAL-READBACK — 실제 전체 GET inventory 수용·초안 게시 GO (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 승인된 Root의 단일 live GET-only 결과를 직접 검토해 **LI의 한정 실제 pagination readback을 수용**했다. base Main `11532c8f22791e5b3e365f8340610cc0ce83fb51`에서 별도 로컬 수리 helper SHA `3867587176f96215b3ac272a15128adfb548b3b3c788a0b2c623f91dd3513de5`를 사용했으며 `helperOnMain=false`다. legacy355의 실제164 unique/completed runs가6pages `[30,30,30,30,30,14]`로 소진됐고 안정 total164·각응답1MiB 이하(최대385683B)·normalized inventory SHA `f60b8c4c2dda73a18030ad3a19cfb887a9d44f0bce6c1156db8190f5e9c4bf43`를 확인했다. actualMain pre-GET은11532였고 지속적인 Main lock이나 전체 operator preflight를 증명한 것은 아니다.

source2/protected52 전후 동일, 원문payload·credential 저장/출력0, packet생성0·mutation0·Ownerapproval=false다. 근거는 ignored `li-root-live-readback.json`이며 실제164 traversal을 이전 actual100/30 두 응답 측정 및 로컬 synthetic164/LP25 회귀와 구별한다. 실제 controls/disable/probe 결과는 여전히 미실행이다.

독립 QA LP25/별도proof118·actual bridge1(LP25 child)/targeted TS·ESLint·정적 검사와 이번 한정 readback을 바탕으로 **정상 새 Draft PR publication GO**다. Root는 frozen source2/protected52·QA·stagedsecret/runtime/remote/정확부모11532/tree 감사를 거쳐 Conventional Commit/새 정상 branch게시만 진행한다. README/ChangeLog의 실제164 관측 상태 보완은 문서만 허용하며 앱/의존성/기타 source를 수정하지 않는다. 새 exact CI·독립 hosted QA·별도 Manager Main gate가 계속 필요하다.

후속 full operator packet/observe는 새 clean Main source와 그 시점의 fresh 전체 inventory/현재Main·replacement run/helper hashes로 다시 검증해야 한다. 이후 Main165 등이 추가되면 count/hash가 바뀌므로 이164 snapshot을 승인 packet의 fresh inventory로 재사용하지 않는다. 수용된 RP4는 source11532의 genuine proof이며 새LI source의 서명·release로 재표시하지 않는다. Owner 정책/환경/legacy·GHCR candidate/final·운영 배포/전체RR1–RR5는 계속 ACTIVE·미완료, 제품0.61.0/flags OFF/HOLD·GO-PILOT BLOCKED 유지다.

---

## U-225-LI-MANAGER-LOCAL — 로컬 수용·한정 GET-only readback GO (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 별도 independent QA의 LP25/별도proof118, actual Vitestbridge1(LP25 child)/targeted TypeScript·ESLint, compile2/actionlint7/YAML7/Bash123/classifier7/HOLD6·명시적 PATH-only plan/diff 및 source2/protected52 before/after 일치를 검토해 LI 로컬 구현을 수용했다. Manager의 직접 source diff·다른 helper AST·25회귀 검토도 PASS다. Root의 bounded RP4 canonical 문서 prefix는 실제 proof11532/opaque internalUNOBSERVABLE·실제/합성/이전 실패를 유지하며 새LP서명 또는 controls GO로 확대하지 않는다.

별도 검토한 ignored `li-root-live-readback.py`에 한해 Root의 **한 차례 bounded GET-only repaired pagination 확인 GO**다. 고정 source2/protected52 및 helper386758…3de5를 전후 확인하고 현재Main11532를 GET 대조한 뒤 unchanged1MiB client/NoRedirect·GET-only wrapper로 legacy355의30-row 전체 목록을 소진한다. 안전 count/length/status/hash/inventorydigest만 보존하며 rawbody/credential은 출력하지 않는다. 실패·상태변동·active/unknown·누락·overflow는 그대로 FAIL이고 blind retry하지 않는다. 이 실행은 helperOnMain=false인 새 로컬 bytes의 관측이며 cleanMain source/packet/Owner control 검증이나 disable/probe 승인이 아니다.

근거 `li-independent-qa-final.json`, `li-manager-local-accept-readback-go.json`은 ignored에 보존한다. 실제 readback 결과 검토와 별도 publication/CI/Main이 필요하며, 전체RR1–RR5/Owner 정책·환경·legacy·candidate/final GHCR·release GO는 미완료다. 운영/보존 자원과 product0.61.0/flags OFF/HOLD·GO-PILOT BLOCKED를 유지한다.

---

## U-225-LI-INDEPENDENT-QA — page30와 unchanged transport 전체 합성 검증 (2026-11-06)

별도 independent QA 대행 `gpt-6.1-sol`이 LI/base11532 worktree에서 **LP25 PASS**, **proof118 별도 PASS**를 실제 실행했다. 변경된 Python을 반영한 기존 Vitest bridge **1file/1test PASS**(내부 LP25 child), targeted TypeScript/ESLint PASS를 독립 재실행했으며 oldLP17 bridge 실행을 재사용하지 않았다. bridge 내부25를 별도 추가25로 합산하지 않는다. compile2/actionlint7/YAML7/Bash123/classifier7/HOLD6/diff PASS. 첫 default plan 무인자 호출은 필수 packet/output 누락으로 usage exit2였고 보존했다. 명시적 synthetic packet/hash/output 및 PATH-only 환경으로 올바르게 재실행해 PLAN_ONLY/NOT_SENT exit0을 확인했다. 코드 오류가 아니다.

source2/protected52 SHA는 시험 전후 freeze와 일치했다. production diff는 정확5개100→30 literal이며 allowed_route/all_rows 외 helper AST는 동일하다. 실제 GitHub.request 코드를 override하지 않은 fake opener full observe seam에서 **synthetic164 rows/6 inventory pages/16GETs**, cap+1 read1048577/timeout30/응답 최대378429B·normalized inventory digest를 독립 관측했다. 정확30 배수의 추가빈page, jobs30, 100page의 exact3000도 INCOMPLETE, page30 cap초과/total변동/truncated/duplicate/active/unknown/foreign/safeRun부재/auth/malformed/잘못된query·route·verb·body는 mutation0 거부 회귀를 통과했다. cap/redirect/status/Owner/disable/probe 경계는 완화되지 않았다.

실제 명령/exit/count/hash와 전체 합성 traversal은 Git 제외 `data/release-proof/li-independent-qa-final.json`, `li-qa-tests.json`, `li-qa-static.json`, `li-qa-traversal.json`에 기록했다. Root가 명시적으로 연결한 local dependency symlink는 config/package/lock5 hash를 대조했으며 설치하지 않았고 commit 대상이 아니다. Root의 허용된 README/ChangeLog/TestReport prefix 보완은 과거 suffix를 유지하며, 기존 freeze의 doc SHA를 새 source 불일치로 오인하지 않는다.

**범위:** Root의 actual100/30 두 응답 size 측정과 이번 synthetic164 전체 traversal을 구분한다. 실제 repaired full GET inventory는 아직 이 QA 결과가 아니며 별도 Manager GO 후 Root read-only 시험이 필요하다. 수용된 RP4는 실제 source11532의 signature/runtime 근거이지 변경된 미래LP operator source의 새 genuine signing 증거가 아니다. proof3 FAIL/이전 역사와 Owner control 미완료를 보존한다. live API/CLI/network/Docker/credential/probe/dispatch/build/install/settings/ref/GHCR 변경·source edit·commit/push는 수행하지 않았다. 새 blocking finding은 없으며 full app build/typecheck 또는 Owner GO를 주장하지 않는다.

---

## U-225-LI-ROOT-DOC-PREP — 실제 RP4 기록과 로컬 의존성 연결 (2026-11-06)

Root(Codex)는 Manager가 수용한 실제 RP4의 canonical-ready 문서를 그대로 prefix로 가져와 아래 LI/RP 기존 이력을 보존했고 README/ChangeLog 현황을 보완했다. source11532의 실제 signature/old pair/runtime 근거와 이후 LI helper source/fullCI/readback을 구별한다. 코드 source2/protected52는 변경하지 않았다. package/lock/TypeScript/Vitest/ESLint config5개가 기존 검증 dependency tree와 byte 동일함을 확인한 뒤 로컬 src/node_modules symlink만 만들었다. 설치나 Root 테스트 실행은 없으며 symlink는 untracked로 보일 수 있어 commit 대상에서 명시 제외한다. 독립 QA가 새 LP25 child를 실제 bridge로 실행해야 하며 기존 LP17 실행을 새 결과로 재사용하지 않는다.

---

## U-225-RP4-MANAGER-ACCEPT — 실제 동일-run 서명·검증 수용 (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 별도 독립 QA 대행 `gpt-6.1-sol`의 실제 hosted raw log/완료 후 inventory와 Root의 별도 read-only bundle 검증을 대조하여 **RP proof-only unit을 실제 수용**했다. 실제 run4 `42123080929`, attempt1, trusted Main `11532c8f22791e5b3e365f8340610cc0ce83fb51`/tree `2423681b10e5db8bee9fcf9d5961bcb67babf90c`의 workflow_dispatch는 COMPLETED SUCCESS다. 동일 archive의 App/Migrator/CPU Worker3개, typed registry graph/digest pull/negative6, 실제 old0.60 pair·준비 완료 후 direct/byte-identical host-helper4004ms timeout/group stop/정리, 실제 old install→upgrade→HTTP Worker/Viewer→same-backup restore/readback journey nonce `2464fd367954578c`, receipt-bound cleanup을 통과했다. full journey marker는 실제 harness 완료 근거이며 개별8stage receipt 값은 로그에 없는 값을 꾸미지 않는다.

실제 GitHub OIDC로 raw manifest3개와 정제receipt1개가 서명됐고 fixed verifier의 actual4 positive/고정 certificate/6 negative가 모두 완료됐다. wrongSource/wrongSignerCommit/wrongRef는 specific CLI policy rejection이다. wrongSignerWorkflow/tamperedManifest/tamperedReceipt는 exact known opaque wrapper 거부 및 crypto-verified material·typed own-policy mismatch·전후 positive/argv/hash guards의 결합이다. 이 세 CLI 내부 cause는 계속 **UNOBSERVABLE**이며 내부 SAN/서명 원인 자체를 관측한 것으로 쓰지 않는다.

완료 후 전체 artifact는 정확1개 `issue225-signed-proof-42123080929-1`/ID13460800017/15127bytes/ZIP sha256 `18ada29499fc1fe87946c27485b271fa47f62e430a9683f267426488f7232e8b`이며 `.dockerbuild`는0이다. Root는 credential-free bounded archive 다운로드의 server digest와 정확7-file allowlist(SHA256SUMS, manifest3, receipt, Sigstore bundle, verification metadata)를 별도 확인했다. 공식 pinned tar와 동일한 gh2.103.3 binary SHA `b768184570b12536be4ac1528893f6340d1c6a7b40b56ad45bca9cd0e87ad34d`로 네 same-bundle positive와 cryptographically verified project repo1359528829/Owner45478892·source/workflow11532·Mainref·run4/attempt1·github-hosted 및 정확4-subject map을 독립 검증했다. Root는 negative CLI를 추가 실행했다고 주장하지 않으며6negative 근거는 독립 QA가 감사한 실제 hosted 실행이다.

실제 signed subject digest는 App `fbc5b20ab3e244978061d453786b9bef0e850d00487c04e795be9ad9cfb1f3f6`, Migrator `ef8e46751c0edca3301d380fcaa08c5bc84dac2714c88f02e403d8ff26791802`, CPU Worker `d1d163b0fa1c16520bb124b6714d77c30ab487275c5fac3f2c0c3316f064bc78`, 정제receipt `6ccddb336b76b14e67de5e01712e845cc8b798fb2b2adbb555086032a33555eb`다. 원문 bundle/CLI JSON/ZIP과 private자료는 ignored에만 보존하고 canonical 문서에는 이 정제 근거만 기록한다.

근거: `release-promote/data/release-proof/rp4-qa-final.json`, `release/data/release-proof/rp4-root-independent-crypto/summary.json` 및 Owner review worktree의 `rp4-manager-acceptance.json`. proof3 FAILED/Root 제한된4positive 진단·framing 관측 누락, old652 CANCELLED, proof2 timeout UNKNOWN/build-record metadata 이력은 삭제하지 않는다. 이번 expected7 inventory는 과거 미검사 artifact의 내용이나 포괄적인 유출 여부를 판정하지 않는다.

**남은 전체 목표와 권한:** 이번 근거는 source11532의 loopback same-run signed proof다. 실제 private GHCR 후보/최종3-ref 승격·전체 writer/Actions grants·실제 정책/환경/legacy disable·Owner exact-source/prefix 및 별도 exact-digest release GO·운영 배포/production0.58 rollback을 완료한 결과가 아니다. Owner approval 전 외부 변경0, 제품0.61.0/flags OFF/GHCR HOLD·GO-PILOT BLOCKED·전체RR1–RR5 목표 ACTIVE를 유지한다. 완료된 proof4 때문에 Main의 실행 중 source freeze는 해제할 수 있으나 후속 LI 코드 source를 source11532의 genuine signature로 재표시하지 않는다. 새 source/fullCI와 변하지 않은 proof dependency bytes/lineage는 Owner packet에서 별도로 대조한다.

---

## LI Developer 대행 — cap 유지·inventory30 pagination 최소 수리 (2026-11-06)

**판정: local code/checks PASS, Manager review→독립 QA 대기.** 실제 Developer 대행 `gpt-6.1-sol`은 새 `fix/issue225-legacy-inventory-pagination`/base11532c8f22791e5b3e365f8340610cc0ce83fb51에서 LP helper/test 두 파일만 수정했다. Manager LI01–06은 edit 전에 기록돼 있었다. helper는 allowed_route/all_rows의 per_page와 row 길이 관련 다섯100→30 literal만 바꿨고100-page loop·1MiB cap/`read(cap+1)`·timeout/redirect/Owner/source/fixed mutations/기존 전체 inventory·safe-run/active guard를 유지했다. 나머지 helper AST와52 protected source/workflow/package/bridge bytes는 HEAD와 동일하다.

**실제 근거와 RED/GREEN 구분:** Root의 existing GET-only safe measurement는 total164, page100=1,267,824B/page30=379,253B와 actual full inventory NOT COMPLETED·mutation0을 기록했다. Developer는 이 receipt hash를 확인했으며 actual API를 호출하지 않았다. edit 전 실제 `GitHub.request`/`no_active_runs` fake opener seam은 synthetic page100=1,261,339B에서 LP_RESPONSE_TOO_LARGE/`read(1_048_577)`/GET-only/timeout30 RED였다. cap/transport를 override하지 않은 같은164-row fixture의 수정 후 full observe는16 GET·inventory6 pages(30/30/30/30/30/14), normalized164 rows·SHAa2966913d72c94e924a7c0ef18dabc6e62073ff2b637dd4d094334de237838a5·mutation0 GREEN이다. synthetic page bytes는378429×5/176621이며 Root의 실제 payload와 동일 bytes라고 주장하지 않는다.

**실행:** LP **25 PASS**(기존17+신규8)를 직접 실행했다. 신규8은 same-real-client164 traversal/digest, exact60+empty page3, jobs30 pagination, page30도1MiB 초과, changed/truncated/malformed/auth 페이지, duplicate/active/unknown/foreign workflow/safe-run 누락, exact3000에서100-page bound FAIL, 엄격 query/body/verb 거부 및 GET-only를 검사한다. 기존 changed-pagination fixture도 첫 full page30으로 갱신해 원 total-change 검사의 의미를 유지했다. 별도 unchanged proof union **118 PASS**(RP7/CP6/RT15/RE19/cleanup3/candidate39/VN11/RC18), classifier7/HOLD6, Python2 compile, actionlint1.7.12 workflow7/YAML7/Bash123·diff PASS다. 새 worktree에 node_modules/Vitest/TypeScript/ESLint가 없어 bridge/targeted TS/lint는 **NOT RUN**이며 설치/링크/복사하지 않았다. bridge source/package/lock bytes는 보존했고 직접 Python25를 bridge 실행으로 재표시하지 않는다. expensive build도 실행하지 않았다.

**범위·후속:** 실제 repaired GitHub inventory/Owner packet approval/disable/probe·network/API/credential·Docker/GHCR/dispatch/settings/ref 동작은 NOT RUN이다. Root proof4는 source11532의 독립 증거이며 이 수정 helper나 future source의 genuine signing 결과가 아니다. frozen244/promote/owner-control/사용자 원본 worktree와 진행 중 proof 자원은 변경하지 않았다. Root의 future GET-only readback은 별도 Manager 승인이고 실제 전체 inventory/Owner controls PASS는 그 결과 뒤에 판단한다. code PR/CI/Main·권한/환경/legacy·출고/Owner release GO는 계속 별도다. commit/push는 수행하지 않았다. exact source/docs/protected hash·actual commands/RED/GREEN/한계는 ignored `data/release-proof/li-developer-handoff.json`/`li-source-freeze.json`에 보존한다.

---

## U-225-PN-RC-MANAGER-PUBLICATION — 합산 로컬 수용·정상 후속 게시 GO (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 별도 독립 QA 대행 `gpt-6.1-sol`의 fresh combined118/별도LP17, compile5/actionlint7/YAML7/Bash123/default PATH-only NOT_READY·HTTP0 plan/diff PASS와 before/after source7/protected38 일치를 검토했다. Manager도 현재 parent `d0865a52d8415ba2e941c70c3fdf4ae31a78a0d0` 및 frozen7+38 SHA·최소 finite tuple diff·문서의 실제/합성 경계를 직접 재확인했다. LP bridge/targeted TS/ESLint는 동일 LP4/package/config의 이전 독립 근거만 재사용했다. 새로운 앱 build나 genuine full proof를 실행한 주장은 없다.

**로컬 합산 수용 및 기존 Draft PR244의 정상 후속 commit/publication GO**다. Root의 최종 staged secret/runtime/remote/parent/tree 감사 후 현재 d086을 정확 부모로 하는 non-force fast-forward만 허용한다. old CI652 Docker job127553928370의 COMPLETED SUCCESS와 실제 RR1/RR2·후속 Compose 시험/정리 완료 경계가 확인돼 실행 중인 소유 Docker 작업을 취소하지 않는다. 이 시점 old Chromium1은 pending이므로 old652 전체 PASS가 아니며, 후속 push로 발생할 실제 최종 상태를 별도로 남긴다. old652는 새 source의 CI 근거가 아니다.

근거는 Git 제외 `pn-combined-independent-qa-final.json`, `pn-combined-source-freeze.json`, `ci652-qa-partial.json`이다. 새 exact-head required CI와 독립 hosted 감사·별도 Manager merge 판단이 필요하다. proof3 전체 FAILED, Root의 제한된 실제4 positive/ONEwrongworkflow 진단과 exact6 artifact 검증, 이전 framing 관측 누락을 보존한다. 실제 새 proof dispatch·환경/정책/legacy 상태 변경·GHCR 후보/최종3-ref 게시·Owner release GO는 이번 게시 GO에 포함되지 않는다. 제품0.61.0/flags OFF/HOLD·GO-PILOT BLOCKED 및 운영/보존 자원은 유지한다.

---

## U-ISSUE225-PN-RC-COMBINED-INDEPENDENT-QA — full frame와 RC 합산 (2026-11-06)

별도 독립 QA 대행 `gpt-6.1-sol`이 parentd086의 frozen combined tree에서 **118 PASS**(RP7/CP6/RT15/RE19/cleanup3/candidate39/VN11/RC18), **LP17 별도 PASS**를 새로 실행했다. compile5/actionlint7/YAML7/Bash123/default PATH-only NOT_READY·HTTP0 plan/diff PASS다. source7/protected38 SHA는 시험 전후 assignment와 동일했다. 실제 명령/exit/count/hash는 Git 제외 `data/release-proof/pn-combined-independent-qa-final.json`, `pn-combined-qa-checks.json`에 기록했다.

PN production은 exact leading1LF+기존quotedwrapper+trailing1LF 추가만이며 full45 literal/SHA486941…fda19와 malformed/infra/missingwitness/mismatch/postpositive 거부를 합산 실행했다. 강한 두 fixed signer/cert/4-subject/argv/material 전후·final gates와 accepted RC5 bytes는 그대로다. LP4/package/lock/TS/Vitest/ESLint config의 부모와 exact bytes를 확인하여 이전 독립 LPbridge1/targetedTS/ESLint만 출처대로 재사용했다. Node/앱build를 새로 실행한 주장은 없다.

문서는 actual project4 positive+appbefore/after+ONEwrongworkflow 부분 control과 FAILED fullrun3/미완료6negative/verification metadata 부재를 구분한다. 이번 exact6 artifact/hash/no.dockerbuild는 oldRP2 미검사 record 내용에 대한 blanket leak 주장이 아니다. issuer 가설 반증·safe-line/strip/이전fixture 관측 누락 이력은 보존했다. local verifier marker는 mock이며 genuine proof PASS/Owner GO가 아니다.

CI652의 d086 감사/ownedcleanup SUCCESS는 별도 유지하며 새 combined source의 hosted PASS로 대체하지 않는다. 이번 local 작업은 live CLI/network/API/Docker/probe/build/install/credential/dispatch/env/settings/GHCR/ref 변경 없이 TestReport prepend와 ignored evidence만 작성했다. fresh exact CI/Main/별도 proof GO는 계속 필요하다.

---

## U-225-PN-ROOT-COMBINED-PREP — PR244 최소 수리 합산 준비 (2026-11-06)

Root(Codex)는 Manager의 PN 독립 QA100/LP17 수용 후 정확 source2를 현재 PR244 head `d0865a52d8415ba2e941c70c3fdf4ae31a78a0d0` 위에 복사했다. RC source5와 나머지 protected38은 byte/hash가 유지됐다. PN 문서6개는 기준 Main146의 suffix를 확인한 prefix delta만 합쳐 기존 RC/Root/QA 이력을 보존했다. README/ChangeLog의 사실 안내도 Root가 보완했다. source7/protected38 합산 QA118/LP17·새 head CI·Main은 이 기록 시점 대기 중이다. 기존 CI652의 성공한 부분은 source d086의 결과이며 새 수리의 hosted 성공으로 쓰지 않는다. Docker exact owned cleanup boundary 확인 전 head push를 보류한다.

Root의 실제 read-only 진단은 proof3 run42114901223의 expected sanitized6-file artifact13457446073/ZIP sha256:c2e44d8445f685ea594e6b80b28733a7089ed38d685de667172b795fc71cae78만 내려받아 수행했다. official pinned gh2.103.3의 네 same-bundle positive와 project repo1359528829/Owner45478892/source·workflow146204d/run3 attempt1/github-hosted/정확4-subject를 직접 검증했다. 단일 wrong-workflow의 app 원본 before/after도 성공했으며 실제 stderr45바이트는 leading LF+quoted sigstore.dev wrapper+trailing LF, SHA486941643d59bcaec905305a9ad2843539956d60f735745f77a05db562cfda19다. Root가 실행한 negative는 이 한 건이며 나머지 원인별 검증을 새로 실행했다고 주장하지 않는다. hosted proof3 전체는 FAILED/negative6 미완료/verification metadata 미생성으로 유지한다. 완료 후 artifact inventory는 expected1개와 `.dockerbuild` 없음만 증명하며 과거 build-record 내용·포괄적인 유출 여부를 판정하지 않는다. 실제 원문/bundle/CLI JSON은 Git 제외 진단 저장소에만 보존했다.

---

## PN Manager 로컬 수용·RC244 합산 준비 GO (2026-11-06)

Manager 대행 gpt-6.1-sol은 아래 독립100/별도LP17·source2/protected46·full45-byte two-entrypoint RED/GREEN과 실제 오류 프레임/가설 반증 기록을 검토했다. 직접 VN11·diff/current2+46 hash도 PASS다. production 한 tuple 항목만 추가하고 exact quoted wrapper/typed own-policy mismatch/실제 CLI-success witness·전후/argv/subject/binary/bundle/final-byte 검증을 그대로 유지한 최소 수리를 수용한다.

Root는 PN2 source(688ee28b…01cfdb/2d4bb4c1…a912ef)와 정확 PN 문서 prefix만 기존 Draft RC244 head d0865a52d8415ba2e941c70c3fdf4ae31a78a0d0 위로 가져오는 정상 후속 commit을 준비할 수 있다. RC5 source는 불변이며 protected38+PN2를 새 합산 freeze로 구분한다. Root의 README/0.61 ChangeLog/current report 사실 요약은 허용하되 actual4 project positives·ONEwrong-workflow 진단과 FAILED fullrun3·metadata 부재/남은 negative 미완료를 구별한다. artifact 증거는 정확6 허용 파일/ZIP hash·.dockerbuild0 관측이며, 미검사인 옛RP2 build records에 대한 무유출 판정이 아니다.

합산118+별도LP17 및 새 frozen7/protected38 독립 QA 뒤 final staging/normalFF publication은 별도 판정한다. 이전652는 이전head 근거이고 owned Docker 유지보수/cleanup 종료를 확인한 뒤에만 새 head push로 자동취소 경계를 넘는다. force/historyrewrite/branch삭제/Main 직접이동·같은146 재dispatch·새서명·권한/정책/GHCR 변화는 없다. 새exactCI/Main/별도 singleproof GO 및 actualfull6negative/완료 후 artifact inventory 전 전체RR1–RR5/Ownerrelease 수용은 보류다.

---

## U-ISSUE225-PN-INDEPENDENT-QA — full45-byte stderr framing 최소 수리 (2026-11-06)

독립 QA 대행 `gpt-6.1-sol`이 isolated PN/base146204에서 **100 PASS**(기존99+PN1), **별도 LP17 PASS**를 실제 실행했다. VN은11이며 기존99/이전100을 새 combined118로 재분류하지 않는다. compile2/actionlint6/YAML6/Bash115/default PATH-only HTTP0 plan/diff PASS, source2/protected46 SHA는 전후 모두 freeze와 일치했다. 실제 명령·exit·hash·독립 RED 결과는 Git 제외 `data/release-proof/pn-independent-qa-final.json`, `pn-qa-tests.json`, `pn-qa-static.json`에 기록했다.

production diff는 기존 finite tuple에 leading1 LF+quoted wrapper+trailing1 LF 한 형태만 추가한다. 독립 full45-byte literal SHA `486941643d59bcaec905305a9ad2843539956d60f735745f77a05db562cfda19`를 확인하고, Git base의 old module로 두 fixed entrypoint RED(각 metadata0)를 독립 재현한 뒤 현재 두 entrypoint GREEN을 확인했다. double LF/CR/tab/quote/issuer/prefix/suffix/infra·missing witness/mismatch·postpositive 실패는 계속 거부되며 cert4-subject/argv/material 전후 SHA/final reread와 specific3 경계는 그대로다. normalization 또는 generic fallback은 없다.

이전 upstream/project raw가 동일하고 issuer 차이 가설이 반증됐다는 Root 관측을 보존한다. Root safe-line와 Manager strip이 LF를 버렸고 이전 독립 QA fixture도 전체 stderr 대신 한 줄 형태여서 누락을 잡지 못했다. 이번 local fixture는 synthetic이며 Root의 실제4 positives+ONEwrong-workflow 부분 진단을 새로 실행한 것이 아니다. 전체 proof3는 계속 FAILED다.

live CLI/crypto/network/API/Docker/probe/build/install/credential/dispatch/원격 변경/commit/push는 수행하지 않았다. 수정은 PN TestReport prepend뿐이다. primaryCI652 별도 monitoring과 기존 partial 결과는 유지하며, 후속 combined118+LP17/fresh exact CI/Main/별도 proof GO가 필요하다. 실제 full project proof 또는 Owner GO PASS가 아니다.

---

## PN Developer 대행 — 실제45-byte stderr framing 최소 수리 (2026-11-06)

**판정: local source repair/checks PASS, Manager review→독립 QA 대기.** Developer 대행 `gpt-6.1-sol`은 새 `test/issue225-proof-negative-repair`, Main base146204d0effe59df430c1d4d6e89ff023faece2d/tree3a2c에서 오직 shared verifier의 유한 tuple 한 항목과 독립 regression을 수정했다. frozen242/244/RC/기존 RF·LP·repair/사용자 worktree는 수정하지 않았다. 실제 CLI/네트워크·서명/dispatch/GHCR/Docker/probe/build·credential/정책 변경, commit/push는 수행하지 않았다.

**관측 정정:** Root의 기존 read-only failure control은 exact6-file ZIP/hash와 실제 project4 same-bundle positives·app before/after를 통과했고 ONE wrong-workflow에서 exit1/빈 stdout 및 정확45 bytes `b'\nError: verifying with issuer "sigstore.dev"\n'`(SHA486941643d59bcaec905305a9ad2843539956d60f735745f77a05db562cfda19)를 관측했다. public upstream 원본도 동일bytes여서 project issuer 차이 가설은 **반증**됐다. Root의 safe-line 출력과 Manager의 strip 비교가 LF framing을 빠뜨렸고, 이전 quoted fixture도 독립 literal이지만 한 줄만 모사해 실제 전체 stderr를 놓쳤다. 아래 과거 UNKNOWN/issuer 가설·quote/SAN review/실패 이력은 삭제하지 않고 이 최신 결과로 정정한다. Root의 실제4 positive는 제한된 project cryptographic 증거이며 run3 자체는 FAILED/최종 verification metadata 부재·전체6 negative 미완료다.

**Developer 실행:** production edit 전에 독립 full45 literal의 길이/SHA를 검사하고 두 실제 entrypoint를 합성 CLI/cert/registry witness로 실행했다. RP는 negative2의 `RP_NEGATIVE_CAUSE_UNPROVEN_WRONGSIGNERWORKFLOW`, candidate는 negative3의 `CA_NEGATIVE_CAUSE_UNPROVEN`으로 각각 RED/metadata0이었다. 이후 exact leading1+trailing1 LF 형태 한 개만 추가했고, 새 한 테스트가 full-seam GREEN과 강한 witness/mismatch/postpositive 실패 및 누락 trailing LF·double LF·CR/tab·잘못된 quote/issuer·prefix/suffix·infra·잘못된 negative label의 거부를 검사한다. 기존 bare/trailing LF·모든 cert/source/role/argv/token/artifact/timer guard를 유지했다. 이 RED/GREEN은 합성 local test이고 actual crypto 재실행이 아니다.

현재 **기존99+신규1=100 PASS**, **LP17 별도 PASS**다. 세부 수는 RP7/CP6/RT15/RE19/cleanup3/candidate39/VN11이다. 변경 Python2 compile, classifier7/HOLD6, actionlint1.7.12 전체6 workflows/YAML6/Bash115·diff PASS이며 다른 기존 source46개는 HEAD와 byte-identical이다. workflow/권한·제품/flags/version0.61.0/HOLD 변경0. Node/TS/build/Vitest bridge/actual CLI는 이번 최소 Python 수리에서 새로 실행하지 않았다. 초기 RED·final commands/logs·source/docs hashes는 ignored `data/release-proof/pn-developer-handoff.json`/`pn-source-freeze.json`에 보존한다.

후속 수용은 Manager→독립 QA 뒤 Root가 PN2 source/doc delta만 정상적으로 RC244에 합산하고 새118+별도LP17/required CI/Main을 검증하는 범위다. 기존 CI652/실패 source146/부분 cryptographic control을 새 source 또는 전체 proof PASS로 재사용하지 않는다. 이후 실제 proof/환경·정책/legacy/GHCR·Owner release GO는 계속 별도다.

---

## Proof3 Manager 실패 수용·진단 사전 경계 (2026-11-06)

독립 QA의 실제 run42114901223 FAILED/`RP_NEGATIVE_CAUSE_UNPROVEN_WRONGSIGNERWORKFLOW`와4-subject attestation 생성·앞선 actual execution/cleanup 성공, wrongSource specific 검증을 근거로 전체 proof 수용을 보류했다. 실제 wrong-workflow stderr는 미수집으로 UNKNOWN이며 project/public-upstream issuer 차이는 가설이다. 정확1 sanitized artifact metadata와 .dockerbuild0 관측은 내용·독립 cryptography 검증과 구별한다. PN01–06 뒤 Root가 별도 read-only failure control을 수행할 수 있으나 이는 full proof/Owner GO가 아니다. 실제 모델은 Manager 대행 gpt-6.1-sol, QA 대행 별도 gpt-6.1-sol이며 미실행 역할/검증을 수행했다고 기록하지 않는다.

---

## U-225-RC-ROOT-PUBLICATION-PREP — Main 정렬·문서 보완 (2026-11-06)

실제 수행자는 Root(Codex)다. Manager의 code-only publication GO에 따라 기존 e20c branch를 보존하고 동일 tree `3a2cc97da54e50e13c482531f2995405cf464ef8`의 Main `146204d0effe59df430c1d4d6e89ff023faece2d`에서 새 `test/issue225-release-promote-main` branch를 만들었다. 전후 WIP11개 bytes·source5/protected40 hash가 모두 일치했다. reset/rebase/force/delete 없이 정렬했으며 새 테스트 실행 또는 독립 QA라고 주장하지 않는다. Root는 README/ChangeLog의 현황 안내만 보완했고 아래 Manager/Developer/독립 QA 결과를 보존했다.

선행 실제 결과는 PR242 primary649 SUCCESS(8 applicable/A2 skip), source e20c/tree3a2c와 같은 Main146204d/parent907d, Main163 SUCCESS·GHCR SKIPPED 및 새 read-only HOLD1 SUCCESS다. 실제 project proof3 `42114901223` attempt1은 정확 Main146204d로 한 번 dispatch되어 이 기록 시점 RUNNING이다. 아직 실제 서명 positive/negative·post-job artifact 판정을 하지 않는다. package 상속/개별 Write·Admin 사용자 없음은 사용자 진술이며, Root의 별도 read-only collaborators 전체 조회200/exhausted에서는 Owner45478892 한 명만 관측됐다. package의 다른 저장소 Actions grants는 UNKNOWN으로 유지한다. 이 관측·로컬 RC 수용은 외부 설정/후보 게시/Owner release GO가 아니다.

---

## RF-C Manager ロ컬 수용·독립 Draft PR 게시 GO (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 RC01–10 source와 아래 fresh independent117/별도LP17·static7/YAML123·source5/protected40 결과를 검토했다. 직접 RC18/RT15·diff/hash 검사도 PASS다. 후보 source A와 승격 코드 B, 새 exact-digest packet/run/실제 Owner review·same existing environment의 재사용 경계를 분리하고, successful candidate artifact/4-file hashes/full graph/고정 crypto/VN 이후에만 RT final3 raw PUT을 허용하는 흐름을 로컬 code-only 준비로 수용한다. narrow adapter/fsync intent·partial/unknown HALT·NO_OP 최종 조회·journal-only progress 및 closed operation receipt를 확인했다.

Root는 현재 e20c base와 byte-identical tree인 통합 Main146204d0effe59df430c1d4d6e89ff023faece2d에서 **새 branch로만** ancestry를 맞출 수 있다. 기존 branch/WIP를 보존하고 before/after source5/protected40·문서 hash가 같음을 확인하며 reset/rebase/force/delete를 하지 않는다. 이 metadata alignment만으로 기존 검사를 새로 실행했다고 하지 않는다. 최종 remote/secret/runtime/source/docs 감사 뒤 정상 Conventional commit 및 별도 Draft PR 게시·새 exact-head required CI를 진행할 수 있다. 실제 project proof source146/tree3a2c가 완료되기 전 Main을 추가 이동하지 않으므로 RC merge는 별도 후속 판정이다.

이는 code publication GO이며 실제 env/정책/legacy/GHCR/version/alias/Git tags/운영·Owner exact-digest release GO가 아니다. 실제 successful genuine candidate A·권한/writer/control/rollback evidence와 별도 Owner packet/review가 준비되기 전 실행0이며 user info·plan/hash가 authority가 아니다. 현재 actual project proof와 로컬 mock117은 구별하고 전체 RR1–RR5/GO-PILOT BLOCKED·flags OFF/HOLD는 유지한다.

---

## U-ISSUE225-RC-INDEPENDENT-QA — exact-digest promotion code-only 준비 (2026-11-06)

별도 independent QA agent `gpt-6.1-sol`이 promote worktree/base `e20c24835c283902778700388287d0ccce1ae0da`에서 실행했다. 기존 QA backend의 context 손실 보고에 따른 실제 대행이며, 이전 local/primary CI649 결과를 덮어쓰거나 중복 실행하지 않았다. 실제 명령·exit·suite count·source 전후 SHA·재사용 근거는 Git 제외 `data/release-proof/rc-independent-qa-final.json`, `rc-qa-tests.json`, `rc-qa-static.json`에 기록했다.

- 독립 **117 PASS**: 기존99(RP7/CP6/RT15/RE19/cleanup3/candidate39/VN10) + 새 RC18. **LP17 PASS는 별도**다. signature/API/registry는 모두 mock이며 실제 project signature 또는 Owner GO가 아니다.
- compile3, actionlint7/YAML7, Bash123 `bash -n`, 빈 환경/PATH-only 기본 plan `NOT_READY`/`NOT_VERIFIED`/HTTP0, diff 검사 PASS. 새 frozen source5 및 protected existing40 SHA는 시험 전후 동일하고 assignment와 일치했다. 기존 tracked `src/` diff는 없다.
- LP4·package/lock·tsconfig/Vitest/ESLint config의 exact e20 bytes를 비교한 근거로 이전 **독립 combined** LP bridge1/targeted TypeScript/ESLint PASS를 재사용한다. 이번 RC tree에서 Node/bridge를 새로 실행했다고 기록하지 않으며 dependencies 설치/복사도 하지 않았다. 전체 앱 build/typecheck의 새 실행 주장은 없다.
- candidate provenance/source A와 promotion code/Main/full CI B, fresh promotion Owner run/review·기존 environment readback의 별도 결합을 검토했다. candidate 완료 run 및 exact1 artifact metadata→exact4 file/hash/size/symlink→full GHCR graph/config/layer→기존 고정 candidate CLI/VN 재검증→VerifiedCandidateContract→최종3 manifest PUT 순서를 확인했다. 다운로드 ZIP API digest만으로 genuine proof를 대체하지 않는다.
- GET/HEAD-only reader와 final3 raw PUT adapter의 경계를 확인했다. digest/media/size와 fsync 완료 intent에 묶인 mutation, 기존 RT의 partial/unknown/ambiguous HALT·후속 write0·전체 final set readback 및 NO_OP 마지막 재조회, exclusive local journal과 closed progress/operation receipt 구분을 검토했다. progress는 `JOURNAL_ONLY_NOT_NEW_REGISTRY_READBACK`이며 외부 영구 저장·CAS·hostile writer 배제·자동 복구를 보증하지 않는다.
- 외부 policy/writer/Actions-grant/rollback hash link는 실제 live 검증·승인이 아님을 명시하고 UNKNOWN은 readiness를 막는다. 실제 legacy355 disabled 상태와 모든 run 완료 API gate를 요구한다. Git PATH-only 및 CLI explicit builtin token 최소 환경·six host credential 비상속·job별 init·artifact allowlist를 확인했다. 새 blocking finding은 없다.

**한계:** 실제 API/서명/registry 결과, candidate publication, Owner exact-digest release GO는 NOT RUN이다. live HTTP/API/CLI crypto/Docker/probe/build/install/pull/credential/dispatch/env/policy/GHCR/ref 변경이나 commit/push는 수행하지 않았다. Root의 실제 project proof 경로와 primary CI649 감사는 별도이며 이 code-only 준비가 그 작업을 막거나 실제 완료를 대신하지 않는다. fresh required CI/Main 및 실제 candidate evidence와 별도 Owner GO는 계속 필요하다.

---

## RF-C Developer 대행 — exact-digest promotion code-only 준비 (2026-11-06)

**판정: 로컬 구현/검사 PASS, Manager source review→독립 QA 대기.** 실제 Developer 대행 `gpt-6.1-sol`은 새 `test/issue225-release-promote` worktree, base `e20c24835c283902778700388287d0ccce1ae0da`/tree `3a2cc97da54e50e13c482531f2995405cf464ef8`에서 작업했다. frozen PR242와 기존 RF/LP/repair/사용자 worktree는 수정하지 않았다. 새 workflow/packet policy/실행 helper/테스트와 pr-ci 두 wiring line만 source delta다. 기존 RP/candidate/RT/VN/LP/RE 및 helper/workflow40개는 HEAD와 byte-identical임을 확인했다.

기본 plan/template/build는 명시한 local input만 다루고 HTTP/credential0이다. 실제 값 없는 template는 NOT_READY이고 hash/입력 boolean은 Owner 승인/실효 controls 검증이 아니다. candidate source A의 성공 run/attempt1·artifact ID/server digest·정확4 file SHA·3-role media/size/config/platform/raw digest와 promotion code B의 Main/tree/workflow/full CI·새 run/title/job/packetSHA/actual Owner review를 분리한다. 같은 환경을 새 review에 사용하고 실제 API bypass=false/UI fallback·Owner-only secondHuman=false를 유지한다. legacy exact ID disabled_manually/모든 runs completed는 실제 read gate이며, 전체 policy/모든 writer·Actions grants/rollback controls는 별도 Owner-reviewed external hash links다. UNKNOWN은 packet readiness를 막고 helper가 전부 live 검증했다고 주장하지 않는다.

다운로드 후 GHCR full graph/config/layer SHA와 기존 고정 candidate verifier/VN의 실제 CLI 경로를 연결하고, 이 gate 뒤에만 RT contract를 구성한다. adapter는 final3 raw PUT 외의 writes를 거부하며 original bytes/Content-Type과 fsync intent·exclusive attempt·typed absence/직전 및 최종 readback을 보존한다. NO_OP도 full graph/crypto와 마지막3-ref readback을 수행한다. failure progress는 journal-only observation임을 명시하고 packet/A/B/expected finals/attempted/confirmed만 공개한다. success operation receipt는 closed schema이며 candidate provenance A를 새 signature/runtime proof로 부르지 않는다. partial 자동 완성/삭제/rollback/alias/deploy는 없다.

**실행:** 기존99 + 신규 RF-C18 = **117 PASS**, LP17은 별도 PASS다. 신규18은 actual-shaped fake API/HTTP/CLI seams에서 A/B 분리·packet builder/unknown blockers·fresh Owner/Main/fullCI/environment/legacy·candidate success/artifact/hash/file/symlink/privacy·RP signer/wrong identity·Worker/graph/layer·all-absent byte-identical3PUT·all-exact NO_OP·partial/unknown·ambiguous write/rewritten readback/journal-intent failure 후 추가 PUT0·동시 target/NO_OP 마지막 read race·closed progress/receipt·host credential6 제거 및 isolated explicit GH_TOKEN을 검사했다. crypto fixture는 **합성**이며 실제 signature 성공이 아니다. 기존99의 의미/검사도 유지했다. classifier7/HOLD6, 새 Python3 compile, actionlint1.7.12 전체7 workflows/YAML7/Bash123, PATH-only NOT_READY plan·diff check PASS다. 마지막 progress 필드/음성 subcase 변경 뒤 새18/compile/diff를 다시 실행했고 기존99/source는 변경하지 않았다.

**한계:** 실제 HTTP/API field shape·environment/review/정책/권한·artifact download/SDK·CLI crypto/OIDC·GHCR read/PUT, Docker/runtime/build/probe/registry/CDN/dispatch·외부 변경은 NOT RUN이다. 새 Node/TS/Build/Vitest bridge는 실행하지 않았고 dependency를 복사/설치하지 않았다. source40 보존은 코드 byte 비교이며 actual effective controls 증명이 아니다. server artifact ZIP digest는 향후 API packet binding이고 SDK warning 단독으로 archive proof를 삼지 않으며 개별 SHA+실제 crypto가 필수다. 실제 extra CLI/network 비용은 미측정이며45분 gate/기존 timers는 유지한다. journal/progress는 CAS·원자성/외부 writer 배제·강제 종료 때 외부 durability를 보장하지 않는다. 실제 candidate와 별도 완성된 exact-digest Owner GO 전에는 실행0이며 전체 Issue225/RF-C 실제 완료·출고 GO가 아니다. Root의 PR242 CI649/별도 Main proof와 결과를 혼합하지 않는다. commit/push는 수행하지 않았다.

Exact commands/logs/source/docs hash와 미확정 사항은 ignored `data/release-proof/rc-developer-handoff.json`/`rc-source-freeze.json`에 보존한다. 다음은 Manager source review→독립 QA→fresh required CI/Main이며 실제 candidate-prefix/최종 exact-digest Owner GO는 계속 분리한다.

---

## Combined VN/RF/LP — Manager 로컬 수용·Draft PR 게시 GO (2026-11-06)

실제 Manager 대행 `gpt-6.1-sol`은 아래 fresh independent QA와 현재 frozen6/protected15 hash를 검토했다. 직접99 proof tests 및 별도LP17, six-workflow actionlint·diff·hash 검사, 보존된 실제 quoted wrapper와의 일치도 PASS다. 두 고정 verifier의 genuine CLI-success 출력에 대한 기존 certificate/4-subject 정책, 같은 bundle/binary/원본/probe 및 intended argv, 전후 positive/최종4-byte readback을 확인했다. opaque CLI 내부 원인의 비노출과 별도 검증 material의 own-policy mismatch를 구별하는 VN 계약 및 runtime token/cleanup/artifact 통제 보완을 로컬 source 준비로 수용한다. raw generic failure·untrusted receipt/boolean을 증거로 사용하지 않는다.

Root는 expected parent `907d338295da8353b23c19a77d4d32903e7c1c01`에서 최종 source/docs/remote/secret/runtime·원본 사용자 변경 보존을 감사한 뒤 정상 Conventional commit 및 독립 Draft PR 게시·새 exact-head required CI를 진행할 수 있다. untracked `src/node_modules` symlink와 Git 제외 raw control/CLI/bundle/runtime/DB/CAD/credential은 stage하지 않는다. 정상 Main 통합은 실제 required CI/검토 뒤 별도 판정한다.

이는 코드 준비 게시 GO이며 actual project proof dispatch, environment/정책/legacy disable, GHCR candidate/최종ref/alias·Owner release GO가 아니다. 새 trusted Main의 별도 proof 및 실제 positive/negative·종료 후 artifact inventory가 필요하다. upstream 실제 control과 local mock signed markers를 project crypto PASS로 바꾸지 않으며 원 RP2·review quoting·기존 미확정 실패/역할 이력을 유지한다. 전체 Issue225/RR1–RR5·0.61.0/flags OFF/GHCR HOLD/GO-PILOT BLOCKED는 계속 진행 중이다.

---

## U-ISSUE225-VN-RF-LP-INDEPENDENT-QA — quoted wrapper 수정 후 fresh combined 검증 (2026-11-06)

실제 독립 QA 대행은 별도 agent의 `gpt-6.1-sol`이다. 이전 QA backend의 task/context 손실 보고에 따라 대행했고 기존 실제 QA 결과와 quoting RED 이력은 보존했다. 대상은 combined base `907d338295da8353b23c19a77d4d32903e7c1c01`이며, 수정 후 frozen source 6개와 protected import 15개의 SHA-256은 시험 전후 모두 assignment와 일치했다. 실제 명령·exit·각 suite 수·전후 hash는 Git 제외 `data/release-proof/vn-independent-qa-final.json`, `vn-qa-fallback-tests.json`, `vn-qa-fallback-static.json`에 기록했다.

- 독립 실행 **99 PASS**: RP7 + CP6 + registry15 + execution-fix19 + cleanup3 + candidate39 + VN10. **LP Python17 PASS는 별도**이며 99에 합산하지 않는다.
- combined tree에서 LP Vitest bridge **1 file/1 test PASS**, targeted TypeScript 및 ESLint PASS를 독립 재실행했다. bridge가 호출하는 LP17은 추가17회계가 아니다. Root의 이전 결과를 독립 실행으로 바꾸지 않았으며 package/lock hash 일치도 확인했다.
- workflow6 actionlint/YAML PASS, Bash script115 `bash -n` PASS, 관련 OCI Python 및 LP helper compile PASS, 빈 환경/PATH-only 기본 plan PASS(`HTTP=0`, credential/mutation0), `git diff --check` PASS. candidate의 실제 no-HTTP transport mock 회귀도 포함한다. 전체 앱 build/typecheck를 새로 실행했다는 뜻은 아니다.
- 실제 형태를 독립 literal로 전사한 **quoted** issuer wrapper를 확인했다. unquoted/malformed/prefix/suffix/infra/잘못된 stdout·exit는 거부된다. 두 고정 entrypoint의 성공 CLI certificate/4-subject witness, project repo/Owner/source/workflow/ref/run/attempt/hosted 정책, binary/bundle/original/probe hash와 정확 argv, 각 negative 전후 positive 및 마지막4 subject byte 재조회 경계를 확인했다. opaque3개는 내부 원인 `UNOBSERVABLE`과 검증 material의 typed own-policy mismatch를 구별하며 source/signer/ref3개는 specific CLI cause를 유지한다. 후속 positive 실패·material 변경은 metadata 없이 거부된다.
- RF Owner/environment/registry/5 credential scrub/runtime guard/cleanup/artifact/NO_OP 최종 readback, LP4 및 repair 경계는 protected hash와 candidate39/LP17 회귀로 보존했다. 새 blocking finding은 없으며 이전 quoted-wrapper RED는 삭제·재분류하지 않았다.

**범위 한계:** 모든 local witness는 synthetic이다. mocked full seam에서 production signed-proof marker가 출력되어도 실제 project crypto PASS가 아니다. Root의 public upstream genuine control도 project signature가 아니다. 실제 project manual OIDC/서명/certificate/CLI/private candidate/policy/Owner GO는 여전히 **NOT RUN**이다. live CLI crypto/HTTP/API/Docker/probe/build/install/pull/dispatch/GHCR/credential·환경·정책·ref 변경, commit/push는 수행하지 않았다. 이 결과는 local code QA 통과이며 publication 또는 Owner GO가 아니다.

---

## VN source-review 최소 수리 — 정확 quoted issuer wrapper (2026-11-06)

Manager source review는 첫 VN draft의 opaque wrapper에서 issuer 인용부호가 빠진 경계를 발견했다. 보존된 upstream control의 안전 한 줄은 `Error: verifying with issuer "sigstore.dev"`이다. 앞선 fixture가 production 상수를 사용해 형식 오류를 놓쳤다는 점을 보존하며 원본 VN freeze/handoff는 old revision으로 남긴다. Developer 대행 gpt-6.1-sol은 수정 전에 독립 actual-shaped literal을 합성 witness seam에 주입하여 `RP_NEGATIVE_CAUSE_UNPROVEN_WRONGSIGNERWORKFLOW` RED를 재현했다.

**수정/실행:** production exact quoted literal과 독립 fixture만 변경하고 unquoted/malformed/prefix/suffix/infra 오류 거부 subcase를 추가했다. 현재 source의 기존89+VN10=99 PASS, 별도LP17 PASS; 변경 Python2 compile, actionlint 전체6 workflows/YAML6/Bash115, PATH-only default0HTTP plan·diff check PASS다. strong witness·두 고정 signer·unknown fail-closed 및 기존 보호 source는 유지했다. 새 freeze/handoff는 ignored `vn-review-fix-source-freeze.json`/`vn-review-fix-handoff.json`이다. 기존 classifier7/HOLD6은 변경하지 않았고 이번 최소 수리에서 재실행하지 않았다.

실제 수행은 기존 안전 upstream error 한 줄의 읽기와 local synthetic/static 검사뿐이다. 새 live CLI cryptography/네트워크/API/GHCR/Docker/probe/build/credentials/dispatch·정책/권한 변경, commit/push는 없다. upstream control은 project OIDC/서명 PASS가 아니며 Manager→독립 QA와 후속 fresh CI/Main/별도 실제 proof GO는 계속 대기다.

---

## VN Developer 대행 — 검증 material 기반 negative proof 로컬 구현 (2026-11-06)

**판정: code-only Developer checks PASS, Manager source review/독립 QA 대기.** 실제 Developer 대행은 별도 agent `gpt-6.1-sol`이며 지정 원 모델을 실행했다고 기록하지 않는다. combined `test/issue225-candidate-controls-main`, base907d/treefrozen df575에서 작업했다. RP/candidate 두 고정 entrypoint와 순수 `verified_negative.py`는 pinned CLI의 각 negative 전후 positive 출력·project certificate/정확4-subject map·binary/bundle/original/probe SHA·intended argv 차이를 결합한다. 마지막에는 전체4-subject 원본 bytes를 다시 확인한다. 공개 `negativeEvidence`는 CLI rejection boundary와 `UNOBSERVABLE` 내부 cause, 별도 typed `ownPolicyMismatch`를 구별한다. raw diagnostics는 private이며 receipt/boolean이 cryptographic witness 또는 Owner approval을 대신하지 않는다.

**실행한 로컬 검사:** 기존89(RP7/CP6/RT15/repair19/cleanup3/candidate39) + 새 VN10 = **99 PASS**; LP17은 별도 PASS다. 전부 합성 fixture/local fake이며 live CLI/서명을 실행하지 않았다. 신규10은 두 전체 verifier seam의 실제 형식 wrapper 수용과 wrong IDs/source/signer/run/role, missing/self-receipt witness, argv/issuer/exit/stdout/infra/generic 실패, binary/bundle/원본/probe/다른 role 변경, mismatch 부재, post-positive 실패 시 metadata 미생성을 검사한다. source/signer-digest/ref의 기존 specific cause 회귀도 유지한다. 별도 scope classifier7/HOLD6 PASS, 변경 Python5 compile, actionlint1.7.12 전체 workflow6/YAML 및 inline Bash115 `bash -n`, PATH-only default0HTTP plan·diff check PASS다. 제품 TS/Build·Vitest bridge는 이번 Python verifier 변경에서 새로 실행하지 않았으며 기존 실제 결과와 구별한다.

**RED와 호출 수:** draft 뒤 원본 base907d RP Git object를 격리 로드한 실제 catch-seam 합성 replay는 wrong-workflow의 issuer-only 오류에서 `RP_NEGATIVE_CAUSE_UNPROVEN_WRONGSIGNERWORKFLOW`/metadata0을 재현했다. 원본과 현재 fixture를 비교한 RED/GREEN이며 구현 전 실행이나 actual crypto 실패가 아니다. RP 성공 경로의 signature CLI positive는 online4 + same-bundle13 =17, candidate는 online4 + same-bundle16 =20이며 각각 version1/negative6 호출이 별도다. 이 수는 mock command accounting이며 실제 프로젝트 CLI 성능/서명 결과는 NOT RUN이다. 초기 fixture 개발 오류는 ignored 개발 로그에 보존하고 최종99와 혼합하지 않는다.

**보존·미실행:** LP4/repair 및 기존 runner helpers, candidate signer/environment/source/Owner/registry/cleanup/5-credential/artifact flags·default timers/HOLD는 유지했다. exact frozen hash·명령/로그와 replay는 ignored `data/release-proof/vn-developer-handoff.json` 및 source freeze가 정본이다. Root가 별도로 확인한 기존 CI647은 이전 repair source의 scope50·static174 files/1102 tests/실제 Docker proof 성공이며 이번 VN99 또는 project signature 성공이 아니다. Main907d의 Main162는 HOLD 관측 성공/GHCR SKIPPED다. 새 독립 QA 대행도 별도 `gpt-6.1-sol`이며 이전 QA 실적을 소급 이전하지 않는다.

Root의 기존 genuine upstream control에서 전후 positive 및3 specific/2 opaque negative가 관측됐으나 upstream identity는 project가 아니다. **이번 project actual OIDC/서명/CLI cryptography, network/API/GHCR/Docker/build/probe/dispatch, environment/policy/legacy disable·Owner review·후속 post-job artifact inventory는 NOT RUN**이다. 사용자가 알린 package inheritance YES/explicit users 없음은 사용자 정보이며 Actions repository grants는 UNKNOWN; 직접 API 검증이나 쓰기 승인이 아니다. Manager→독립 QA→fresh combined CI/Main 후 별도 실제 proof GO가 필요하고 전체 Issue225/RF/Owner release GO는 계속 미완료다. commit/push는 수행하지 않았다.

---

## QA 역할 대행 갱신 — CI647 이후 (2026-11-06)

기존 QA 대행 gpt-6-luna가 history/backend·context reset으로 현재 task/cwd를 반복 보존하지 못해 Root가 해당 agent를 중단하고 새 `/root/qa_fallback` gpt-6.1-sol을 fork-none으로 배정했다. 새 QA의 첫 범위는 CI647 scope/static/source graph의 읽기 전용 부분 감사이며 아직 전체 CI/출고 결과를 주장하지 않는다. 이전 QA의 실제50/67 회귀·bounded probe·source hash·오류/복구 보고는 원 기록대로 유지하고 새 QA가 수행한 것으로 재표시하지 않는다. Manager/Developer의 gpt-6.1-sol 대행도 별도 agent/역할이며, 실행하지 않은 지정 gpt-6-astra/5.6 모델을 실행했다고 기록하지 않는다. 이후 각 실제 결과는 수행 주체와 근거를 따로 기록한다.

---

## RF credential-boundary 수용 / CLI 부정 증거 계약 보류 (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 아래 최종 독립67 및 frozen7 hash, 직접39/hash/diff 결과를 검토하여 ACTIONS_RUNTIME_TOKEN의 child scrub/direct-runtime 거부 보완을 수용한다. 실제 token 존재나 유출을 관측한 것은 아니다. Root는 새 repair source 기반 private combined worktree에 최종 RF/LP 및 문서 delta를 보존해 import 준비할 수 있다. 새 source의 합산 QA/required CI·Main 통합 및 publisher 실행 승인은 별도다.

**남은 구체적 계약:** pinned gh2.103.3 [LiveSigstoreVerifier.verify source](https://raw.githubusercontent.com/cli/cli/v2.103.3/pkg/cmd/attestation/verification/sigstore.go)는 내부 verifier 오류를 issuer-only 오류로 바꾸며 underlying error를 포함하지 않는다. 뒤의 lastError 반환만으로 SAN/subject-digest causal 진단을 확보한다고 볼 수 없다. 기존 wrong-workflow/tamper classifier는 특정 causal 문자열을 요구하므로 실제 CLI 부정 증거 경로가 충족되는지 확인·설계 보완이 필요하다. Root의 public upstream signed-artifact 진단은 실제 응답 형식의 별도 control이며 project OIDC/PASS가 아니다. generic nonzero 수용으로 바꾸지 않으며, 실제 검증된 cert/subject에 기반한 명시적 mismatch와 관측 CLI 거부 원인을 구별하는 전략은 별도 AC/검토 후 결정한다. full RF publisher/Owner GO는 이 경계가 해결되기 전 부여하지 않는다.

---

## RF credential-boundary targeted final QA — 2026-11-06

**판정: 최소 ACTIONS runtime token 수정의 독립 로컬 QA PASS; 전체 RF publisher/external acceptance는 미완료.** Worktree `/home/planner/Dev/layoutManager-issue225-candidate-publish`, base `8c04f559e829d9f9546a40b603399f9b6f46a5c1`에서 frozen source 7개 SHA-256을 전/후 검증했고 모두 새 handoff 값과 일치했다. 후보39 + RP7/CP6/RT15 = 67/67 tests PASS, 변경된 Python 두 파일 `py_compile`, `git diff --check` PASS다. Unchanged workflow bytes에 한해 이전 exact-hash QA의 actionlint1.7.12 (`release-candidate.yml`, `pr-ci.yml`), YAML parse/83 inline Bash `bash -n` 결과를 재사용했다. 수정 revision의 PATH-only default plan을 다시 실행해 `CA_PLAN_ONLY HTTP=0 CREDENTIALS=0 MUTATIONS=0 OWNER_AUTHORITY=NOT_VERIFIED`를 확인했다.

**Credential fix 확인:** `candidate_publish.command()` child environment에서 `CA_JOB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, `ACTIONS_RUNTIME_TOKEN` 다섯 key를 제거한다. 39개 candidate regressions의 mocked subprocess test가 synthetic token 다섯 개가 모두 제거됨을 확인한다. 별도 direct-runtime negative는 각 key마다 runtime entrypoint가 `CA_RUNTIME_TOKEN_ENV_REFUSED`로 거부하고 `runtime_only()`를 호출하지 않으며, credential-free 경로는 허용됨을 확인했다. Verifier 경로의 subprocess env는 정확히 `PATH`, explicit `GH_TOKEN`, isolated `GH_CONFIG_DIR`만 포함함을 mocked runner/probe로 확인했다. 이 QA에서 실제 runner credential의 존재·사용·유출은 **관측하지 않았다**; subprocess/network는 mock뿐이다.

**보존/범위:** 이전 66-test QA 및 synthetic `ACTIONS_RUNTIME_TOKEN` inheritance RED는 별도 이력으로 유지한다. 그 당시의 apparent cross-job initialization finding은 frozen workflow line111–118의 same-job `init`→`gate`를 확인한 뒤 **retracted**되어 최종 blocker로 남지 않았다. 이번 revision은 오직 `candidate_publish.py`와 `test_candidate_publish.py`를 변경했고 다른 source5개/workflow는 기존 frozen hash와 일치했다. Durable execution output은 ignored `data/release-proof/rf-credential-final-qa-live.json`에 있다.

**잔여 한계 / NOT RUN:** pinned `gh` CLI positive verifier는 내부 Sigstore 실패 사유를 보존하지 않고 `CA_CLI_VERIFICATION_FAILED`로 fail-close한다. 실제 wrong-workflow/tampered-artifact causal negative의 CLI 출력 계약은 별도 Root 검토가 남았다. Actual API/environment/certificate shape, OIDC/signature, GHCR reads/writes, workflow dispatch, post-job artifact inventory, actual Owner approval 및 exact-head required CI는 NOT RUN. 따라서 이 targeted credential fix QA는 full publisher readiness, release GO 또는 Owner GO가 아니다; 전체 RF acceptance와 publication은 별도 검토/검증 대기다.

---

## RF-A/B child credential 최소 수정 — 새 local freeze (2026-11-06)

독립 QA의 원66-test/hash report와 finding은 아래에 그대로 보존한다. Manager 보완 AC 이후 Developer 대행 `gpt-6.1-sol`이 `command()` scrub 및 direct runtime refusal의 기존4-key 목록에 `ACTIONS_RUNTIME_TOKEN`만 추가했다. 실제 command의 mocked subprocess seam에 synthetic5 credentials를 주입하고 direct runtime entry를 각 key로 호출한 RED에서 runtime token 누락2건을 재현한 뒤 GREEN을 확인했다. credential 없는 runtime 경로와 verifier의 별도 최소 `GH_TOKEN` 경로는 유지한다. 실제 token 존재/사용/유출을 관측한 것은 아니다.

현재 focused39 + 기존RP7/CP6/RT15=67 tests, compile/actionlint/YAML/bash/default0HTTP/diff는 로컬 PASS다. 새7-source freeze와 별도 handoff를 남기며 원 source correction/QA66 이력은 덮어쓰지 않는다. 독립 targeted final QA/required CI·실제 candidate 실행 GO는 미완료다. frozen repair/PR241 source는 변경하지 않았고 live Docker/API/registry/dispatch·credential/환경/정책·commit/push는 실행하지 않았다.

---

## RF-A/B — 독립 code-only QA (2026-11-06)

**판정: 66개 로컬 회귀와 정적 검사는 PASS; child-token 경계 수정 전까지 source acceptance 보류.** Worktree `/home/planner/Dev/layoutManager-issue225-candidate-publish`, branch `test/issue225-candidate-publish`, base `8c04f559e829d9f9546a40b603399f9b6f46a5c1`. Developer handoff의 7개 frozen SHA-256은 QA 전/후 assignment와 일치했고 source 변경은 없었다. 새 후보38 + 기존 RP7/CP6/RT15 = 66/66 tests PASS; Python compile, actionlint 1.7.12 (`release-candidate.yml`, `pr-ci.yml`), YAML parse, inline Bash 83 blocks `bash -n`, `git diff --check` PASS다. `candidate_publish.py` default plan은 credential 없는 PATH-only env에서 `CA_PLAN_ONLY HTTP=0 CREDENTIALS=0 MUTATIONS=0 OWNER_AUTHORITY=NOT_VERIFIED`를 출력했다. Code path는 plan 반환 전에 HTTP transport/API나 credential lookup을 호출하지 않는다. 실제 fake/local 시험 및 source review 외부 동작은 수행하지 않았다.

**검토한 source contract:** exact Owner sender/Main/source/tree/workflow/run/attempt/packet binding, required CI/source archive relation, existing-environment readback과 Owner-only review의 실제 승인/API-vs-UI bypass 구분, same-run proof cleanup을 remote client 생성 전에 수행, 4개 proof receipt hash와 owned RR2 receipt set/source/R1-R2 linkage 검증, CID 및 registry name/ref/tag absence를 반복 확인, strict private GHCR origin/scope와 raw manifest/blob digest/size/platform graph 검증, intent-before-write/no-retry, all-existing three-ref final digest reread, fixed signer/certificate identity·subject mapping·synthetic causal negatives, public artifact allowlist 및 child environment 최소화. Workflow의 세 build는 job-scope `DOCKER_BUILD_RECORD_UPLOAD='false'`를 상속하며 override/unknown producer 회귀가 있다. Static guard는 실제 post-job artifact absence나 실제 API/certificate 형식을 입증하지 않는다. Registry final reread는 외부 writer와 원자성을 보증하지 않는다는 한계를 남긴다.

**재작업 finding — `ACTIONS_RUNTIME_TOKEN`:** `candidate_publish.command()`는 child env를 복사한 뒤 `CA_JOB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, `ACTIONS_ID_TOKEN_REQUEST_TOKEN`을 제거하지만 `ACTIONS_RUNTIME_TOKEN`은 제거하지 않는다. Workflow는 archive/build/RR proof helper를 실행할 때 이 변수를 명시적으로 unset하고 있어 이를 child에 전달하지 않는 의도가 보인다. 독립 mock-subprocess RED는 synthetic `ACTIONS_RUNTIME_TOKEN`이 `command()`가 만든 child environment에 남는 것을 확인했다. 이는 bounded environment-contract defect이며 실제 runner token이 주입되거나 사용됐다는 관측은 **없다**. Manager도 동일한 fake seam을 독립 확인했고 RA 수정 항목으로 넘겼다. 현 source를 고치거나 그 새 revision을 시험하지 않았다.

**한계 / NOT RUN:** actual workflow dispatch, GHCR candidate write/readback, actual environment/API shape, Owner approval, OIDC/certificate format/signature, live CLI causal negatives, post-job artifact inventory, exact-head required CI 및 release GO는 NOT RUN. 실제 publisher 실행이나 운영/정책/credential/ref 변경은 없었다. Repair QA worktree와 source는 변경하지 않았다. 새 source fix와 frozen hash를 가진 후속 independent QA가 필요하다. Code-only RF-A/B는 **rework required** 상태이며 publication/Owner GO가 아니다. 상세 실행 결과와 mock finding은 ignored `data/release-proof/rf-independent-qa-live.json`에 기록했다.

---

## RF-A/B Manager source review — 독립 QA 대기 (2026-11-06)

실제 Manager 대행 `gpt-6.1-sol`은 새 correction handoff의7 source SHA를 직접 대조하고 fixed Main/Owner/packet/run·실제 environment review/CI·private package gate, 동일-run raw graph/cleanup 전 remote client 생성 금지, 고정 namespace/realm·한 번의 credential-free CDN blob GET, intent-before-write/no retry, digest runtime·서명 subject/certificate 및 공개 allowlist 경로를 검토했다. 빈 marker/registryName 누락과 NO_OP 중간 변경의 local fake seam을 재현했고 수정된 complete receipt/owned set·CID/name/tags absence 및 final-triplet readback을 수용한다. 직접38+RP7+CP6+RT15=66 tests, 두 workflow actionlint, frozen7 hash, diff 검사를 PASS했다.

이는 source review의 로컬 통과이며 독립 QA/required CI·Main 통합·actual environment/API/GHCR/OIDC/CLI·Owner candidate/release GO가 아니다. 기존 RF base8c04와 이후 RP repair source를 같은 revision으로 표시하지 않으며 후속 import는 repair의 변경과 gate를 보존해야 한다. repair QA와 충돌하지 않도록 새 RF 독립 QA는 별도 과제로 진행한다. 실제 publisher 권한·API/cert 형식·post-job artifacts·비원자적 외부 writer 통제는 미검증 제한을 유지한다. Manager 검토 근거는 ignored `data/release-proof/rf-manager-source-review.json`에 보존했다.

---

## RF-A/B bounded source-review corrections — 새 local freeze (2026-11-06)

Manager의 구현 전 보완 AC에 따라 같은 candidate worktree에서 대행 Developer `gpt-6.1-sol`이 세 code-only 결함을 수정했다. 기존7-source/7-doc hash와 `rf-developer-handoff.json`은 과거31-test revision으로 보존한다. 중간 RF WIP는 repair QA 우선 작업 동안 별도 paused manifest에 남겼으며 paused37 중36 PASS/1 shorthand-action audit FAIL도 숨기지 않는다.

실제 `Runner.cleanup`을 호출한 synthetic RED에서 빈 receipts marker와 absent registry CID 뒤 foreign registryName이 수용됐고, all-existing `publish_set` 마지막-role callback이 첫 ref를 변경/삭제/unknown으로 만든 RED도 NO_OP를 반환했다. 수정 뒤 marker는 exact4 receipt/hash와 owned hash/source/run/set을 재검증하며 반복 cleanup은 read-only로 CID/name·원래 자원/refs/tags를 모두 확인한다. NO_OP도 전체3-ref digest를 마지막으로 조회하고 changed/missing/unknown은 write0/HALT다. 순차 readback의 한계와 외부 writer/CAS/원자성 미보증은 유지한다.

Candidate3 build의 record upload를 job 문자열 false로 끄고 true/step/runtime override 및 shorthand `- uses`를 포함한 unknown producer 회귀를 통과했다. 현재 focused38 + 기존RP7/CP6/RT15=66 tests, compile/actionlint/YAML/bash/default0HTTP/diff가 로컬 PASS다. 이는 실제 Docker/API/registry/Owner approval/암호 검증이 아닌 fake/static 결과다. 실제 post-job artifact inventory는 NOT RUN이다. environment 선행 GET는 보호의 사전 조건이며 실제 플랫폼의 생성 시점을 관측하지 않았으므로 auto-create 차단 보증으로 쓰지 않는다. 후속 승인된 dispatch POST 전에 actual existing environment GET/config 확인이 필요하다.

원 제품·0.61.0/flags OFF/HOLD·기존 source guards와 RP/CP/RT·frozen repair/QA source는 변경하지 않았다. 새 RF freeze의 Manager full review/독립 QA/required CI 및 실제 candidate 실행 GO는 아직 미완료다.

---

## RF-A/B candidate publisher — Developer local source-review checkpoint (2026-11-06)

Manager가 기록한 RA01–10 이후 `gpt-6.1-sol` Developer fallback이 별도 worktree/base `8c04f559e829d9f9546a40b603399f9b6f46a5c1`/tree `e004fb393d7b0e72fa6e2fdd7ef7d036715131f2`에서 작성했다. 실제 기존 designated 모델을 실행했다고 기록하지 않는다. 구현은 새 고정 candidate workflow, policy/API approval gate, bounded registry client, clean-proof/cleanup orchestrator와 별도 candidate certificate/CLI verifier, 환경 설정 검토 JSON 및 required scope wiring이다. RP signer/permissions/receipt 의미나 CP/RT source는 변경하지 않았다.

**로컬 관측:** 새 Python31 tests PASS, 기존 RP7+CP6+RT15=28 PASS, 변경 Python compile와 candidate/pr-ci workflow의 default actionlint1.7.12 PASS, diff check PASS다. 새 시험은 실제 client 코드를 injected fake HTTP로 실행해 blob init/finish·child/parent raw manifest·graph readback과 fsync intent 순서를 확인했고, authority/config/actual-review/run/job/hash/CI-tree 혼합, private package/role/source 오류, partial/rewrite/timeout 이후 mutation 중단, cleanup 실패0client, exact CDN one-hop/header 제거와 bad host/size/digest/second-hop, signer/RP relabel·subject/receipt·public leak 거부를 검사했다. pinned verifier wrapper는 synthetic certificate/CLI responses로 positive8와 negative6 호출 구조를 검증했으며 암호 검증 실적이 아니다. 기존28 및 새31은 required scope job에 함께 연결한다.

**공식 형식과 실제 관측의 구별:** public OpenAPI JSON에서 admin-bypass property 누락을 확인했으나 Root가 확인한 pinned go-github/Terraform client는 해당 REST field를 read/write한다. 실제 boolean false를 우선 수용하고 true는 거부하며 unknown만 별도 Owner-observed UI evidence로 보완한다. 이 Unit의 실제 environment/API 응답은 조회하지 않았다. review history에 없는 approval timestamp/inputs도 만들지 않는다. Owner-only `prevent_self_review=false`를 허용하고 second-human 독립성을 주장하지 않는다. CDN 지원은 Manager가 승인한 exact blob-only/header-free/one-hop 계약이며 실제 GHCR/CDN 응답 시험은 아니다. 상세 공식 source와 관측 경계는 [Operation](Operation.md)에 둔다.

**NOT RUN / 후속:** candidate 실제 인증/API·environment 설정/UI 관측/Owner review·GHCR write·Docker build/journey·candidate OIDC/실 pinned CLI verification·새 exact-head required CI와 독립 QA는 실행 전이다. 제품 TypeScript/build/browser 실행을 이 Python/workflow local 시험의 결과로 복제하지 않는다. 기존 operational0.58 App/DB/CAD/volume·제품/Schema/0.61.0/flags OFF/HOLD·기존 refs는 변경하지 않았다. public primary source read 외 외부 동작, credential read/provisioning, commit/push는 없다. 현재 단계는 Manager source review checkpoint이며 실제 출고/RR5 완료·RF-C exact-digest release GO·운영 upgrade/start가 아니다.

---

**Root 게시 전 확인:** 로컬 의존성 `src/node_modules`는 symlink라 현재 Git untracked이며 directory ignore 적용을 받지 않는다. 위/아래의 “ignored 링크” 표현은 실제 ignore 판정이 아니었다. 이 런타임 링크는 유지하되 명시 게시 목록에서 제외한다. package/lock 파일은 변경하지 않았다.

## LP01–06 Manager 로컬 수용·게시 GO (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 Root 초안과 별도 지정 Developer 대행 `gpt-6.1-sol`의 실제 검토·두 최소 수정, 아래 최종 independent QA를 검토했다. negated disabled-cause false PASS는 full-perform 회귀로 거부되고 accepted202의 원래 snapshot은 새 attempt/safety 확인으로 승격하지 않는다. frozen4 hash가 일치하며 Manager도 17개 Python·compile·actionlint·diff를 직접 통과했다. Root는 네 source bytes를 보존하고 README/ChangeLog 등 최신 상태를 정리한 뒤 최종 source/base/secret/remote/tree 감사와 code-only PR/required CI를 진행할 수 있다. helper의 hash/execute flag는 Owner 승인 증거가 아니며 실제 packet 승인·disable/rerun·관리 권한/실제 API·출고는 PENDING/NOT RUN이다. 해당 외부 실행은 별도 실제 Owner 승인 전 허용하지 않는다.

---

## LP01–06 Root 초안 검증 (2026-11-06, Developer/Manager/독립 QA 대기)

**추가 독립 QA 확인 — 2026-11-06, frozen HEAD `476b686a7b9bb1ff9c691a71f895bd833311e090`:** QA가 이 worktree에서 final 4 source hash를 직접 재계산해 assignment와 일치함을 확인했다. 별도 실행에서도 focused Python 17/17, `py_compile`, bridge Vitest 1/1, targeted ESLint/TypeScript, actionlint 1.7.12, YAML 권한/checkout 속성 확인, workflow Bash `bash -n`, `git diff --check`가 모두 통과했다. 기본 helper를 임시 valid-shaped packet으로 실제 로컬 실행하여 `LP_PLAN_ONLY`, `mutationAttempt=NOT_SENT`, HTTP 0을 확인했다. 이는 fake/local 검증이다. Manager confirmed that the helper intentionally does not authenticate Owner approval: `--execute`, packet hash, and an Owner ID/admin readback are execution controls, not approval proof. Root must enforce the separately recorded Owner approval before any future operator call; that approval and any live action remain PENDING/NOT RUN. No fake approval flag or signature was added. 어떤 live action도 하지 않았다.

Manager가 LP AC를 먼저 기록하고 Root에게 별도 초안 보조를 명시 배정했다. Root는 contents:read Main HOLD workflow, packet/source/hash/Owner/run/inventory에 결합된 기본0HTTP operator helper와 두 고정 mutation endpoint를 작성했다. 실제 disable/rerun/정책/refs/GHCR/운영 변경은 NOT RUN이다. 보존 run160/문서상 후보141/이전 write+push source126 및 미확인source2의 읽기 inventory는 실제 실행 권한·거부 시험으로 수용하지 않는다.

13개 Python fake/local 테스트가 PASS다: default0HTTP, exact endpoint와 unsafe route 거부, repo/run/hash/source/dirty mismatch, waiting/requested/pending 등 미완료 상태, pagination 누락/변경, disabled readback, generic/auth refusal 오분류, 예상 외 accepted 시 HALT/새 attempt 관측 및 no-cancel/no-enable를 검사했다. 새 read-only Main step은 synthetic GitHub env/소유 summary 파일로 실제 실행해 현 source/HOLD 및 wrong-ref 거부를 확인했다. 이것은 GitHub Main 실행 증거가 아니다. 기존 required Vitest에 Python suite를 연결하는 얇은 bridge 1file/1test PASS, targeted TypeScript·ESLint PASS, Python compile/default actionlint1.7.12/diff PASS다. 첫 local dependency 연결 명령은 cwd 착오로 src/package.json을 찾지 못해 테스트가 실행되지 않았고, 올바른 cwd/동일 lock 확인 뒤 ignored node_modules 링크로 실행했다. 제품·lock/version·원 사용자 worktree는 변경하지 않았다.

현재 초안은 실제 지정 Developer 검토→Manager→독립 QA·required CI 뒤에만 게시/실행 packet으로 수용한다. Root의 실행을 지정 Developer나 실 서버 검증으로 기록하지 않는다. package 다른 writer/Owner 관리 권한·실제 disabled API 형식·Owner GO는 미확인으로 남긴다.

**독립 QA — 수정된 Developer source 최종 4 hash, local only:** 별도 worktree `/home/planner/Dev/layoutManager-issue225-legacy-publisher-control`, branch `test/issue225-legacy-publisher-control`, HEAD `476b686a7b9bb1ff9c691a71f895bd833311e090`에서 수행했다. `lp-developer-repair-handoff.json`의 helper `c849a1aad337be1c37e07d1880095c9ca2e655f8457d608103915e2df3912c1d`, Python tests `219334ed87b19244e45127e6626422b4065dfd7bd935d7f5b6772376f0048018`, workflow `aea0385b036eacd6cc3d41f5aeb5c98ed0a41d55289b4166c13ea8906083a2eb`, TS bridge `1331f6b8c45021c941c8f851affa3bb48a5be4fc4c2d4630a32f80306670b4d7` hashes were all independently recalculated and matched.

**판정: LP01–06 local fake/static regression PASS.** `python3 -B src/tests/oci/test_legacy_publisher_control.py -v` 17/17 PASS; Python compile and official actionlint1.7.12 on `main-hold.yml` PASS; bridge Vitest 1/1, targeted ESLint, targeted TypeScript compile, workflow YAML parse and its one Bash `run` block `bash -n`, and `git diff --check` PASS. An initial combined YAML check was invoked from `src/` and could not locate the repository-relative workflow; the same check was rerun from the worktree root and passed. No source, workflow, helper, or node_modules symlink was modified by QA.

검토한 fake regressions include default plan without HTTP client construction; exact packet repo/Owner/workflow/source/tree/hash/run bindings and current-Main/local-content pins; page-complete no-active-run inventory where waiting/requested/pending/in-progress/unknown states or unstable/truncated pagination block both mutations; exact legacy-disable and single safe-run rerun routes; required readback; affirmative anchored disabled messages versus negated/auth/generic/qualified/unknown refusal; and unexpected accepted rerun responses. A stale 202 readback remains `NEW_ATTEMPT_NOT_YET_OBSERVED`/safety `PENDING`; even a new attempt with unexpected source is not accepted as safe, and no cancel, retry, enable, or follow-up mutation is sent. The new workflow has `contents:read` only and performs source/HOLD observation; its successful synthetic Main step is not a GitHub-hosted Main execution or publisher-block proof.

**NOT RUN / residual limits:** no helper `observe`, `disable`, `probe`, `--execute`, live GitHub API, credentials, workflow dispatch, Docker, GHCR, or external mutation was performed. Legacy workflow ID `355693716` was not disabled; safe-HOLD run `42075718479` was not rerun. Real API response wording, permissions, Owner approval, package publisher restrictions and actual rerun denial remain unverified. The local helper's accepted response strings and fake transport are contracts only. Main HOLD observability does not prevent an administrator from re-enabling the old publisher or establish that all package writers are blocked. Existing Root draft 13-test run/cwd history above is preserved separately from this final 17-test independent QA. No commit or push.

---

## RP execution repair — Manager 로컬 수용·Draft PR 게시 GO (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 최종 frozen5 hash(core760a8a1f/probe1491a236/tests0c129991/proof a543b3c9/pr-ci158aef3b), 독립50/static 결과 및 아래 corrected 실제3-probe/보호/정리 보고를 검토했다. Manager 직접19+3/actionlint/diff와 current5 hash도 PASS다. 새 direct `cd90e1f152447dbd`/actual copied g7 command host `35ea208023d6855d`의 readiness→4s timeout/소유 정리, startup negative `d3bb65db3e7b9d40`의 no-arm READINESS_MISSING/정리, 전후 selected production/R1 보존을 로컬 AC로 수용한다. 늦은 관측 budget 분류는 실제 TimeoutExpired cause와 absolute deadline 소진을 모두 요구하며 임의 오류를 absence/실행 성공으로 승격하지 않는다.

Root는 expected parent `4fd0b32e82bd89f8056becd9e3dabea69a6b5e00`와 reviewed12 paths에 대해 remote/secret/runtime/원본 사용자 변경/최종 tree를 감사한 뒤 정상 Conventional commit 및 독립 Draft PR 게시·새 exact-head required CI를 진행할 수 있다. RF/LP source는 이 수리에 포함하지 않는다. 통합은 실제 새 required CI/검토 뒤 별도 판정한다. 새 actual proof dispatch는 그 뒤 정상 Main/Main CI와 별도 GO가 필요하며 같은 실패 source4fd의 blind 재실행을 승인하지 않는다.

원 hosted RP2 cause UNKNOWN·pre-sign 미실행·unexpected build-record3 metadata, 초기 guard sequencing/전사 오류, original-revision 미분류 negative 및 잘못된 receipt invocation/미보존 stderr 이력을 유지한다. 현재 build-record off는 source/static 검증이며 실제 job 종료 뒤 artifact API inventory·genuine OIDC/cert/CLI·GHCR/정책/Owner release GO와 전체 RR1–RR5 완료는 아직 아니다. 제품0.61.0/flags OFF/GHCR HOLD·GO-PILOT BLOCKED를 유지한다.

---

## RP2 corrected-invocation bounded QA — same frozen revision (2026-11-06)

**판정: 최종 frozen revision의 bounded local QA PASS.** 앞선 partial attempt는 승인된 triplet receipt argument를 빠뜨린 invocation 오류로 그대로 보존한다. 이 QA는 source를 수정하지 않고 Manager가 승인한 절대 경로를 명시한 corrected invocation만 한 번 수행했다. 현재 frozen source 5개 SHA-256은 실행 전/후 Manager freeze와 일치했다. 동일 hashes로 이미 실행한 독립 50-test/compile/actionlint/YAML/bash/diff 결과를 재사용했으며, 이 corrected turn에서 테스트를 재실행하지 않았다. 상세 기록은 ignored `data/release-proof/rp-execution-corrected-qa-live.json`이다.

**Guard와 actual fixture 결과:** 하나의 fail-fast preguard가 preserved original production 및 retained R1 snapshot의 selected metadata와 일치했다. Direct probe의 approved CPU image fixture nonce `cd90e1f152447dbd`는 explicit absolute triplet receipt 입력으로 실행됐다. Identity/readiness/running-at-arm/child observation은 true, startup 438 ms, execution 4004 ms 뒤 `RR2_COMMAND_TIMEOUT`, cleanup PASS였다. Exact child `layoutmanager-rr2-child-cd90e1f152447dbd-1fc74447`와 volume `layoutmanager-rr2-timeout-cd90e1f152447dbd`는 종료 후 부재를 확인했다.

Host probe nonce `35ea208023d6855d`도 explicit receipt 입력으로 실행됐다. Host path는 `g7-deploy.py`를 owned namespace에 복사해 production `command()` helper를 호출했고 copied bytes 및 receipt SHA-256이 source와 일치했다. Identity/readiness/running-at-arm/child observation true, startup 546 ms, execution 4001 ms, `RR2_HOST_COMMAND_TIMEOUT`, groupStopped=true, cleanup PASS였다. Exact child `layoutmanager-rr2-host-35ea208023d6855d-1951a234`와 volume `layoutmanager-rr2-timeout-35ea208023d6855d`는 부재했다.

Controlled marker-delay3s/startup1s negative nonce `d3bb65db3e7b9d40`는 exit 1, `RR2_PROBE_READINESS_MISSING`, phase `READINESS_MISSING`, startup 1001 ms, child identity/running true, readiness false, executionArmed=false/0 ms, cleanup PASS였다. Exact child `layoutmanager-rr2-child-d3bb65db3e7b9d40-789d106f` 및 volume `layoutmanager-rr2-timeout-d3bb65db3e7b9d40`도 부재했다. 이것은 승인된 unarmed startup deadline 결과이며 timeout execution 성공으로 기록하지 않는다. 전체 세 probe 뒤 postguard가 production/retained R1 selected metadata 불변 및 frozen hashes unchanged를 확인했다.

**제한:** 기존 hosted RP2 원인은 계속 **UNKNOWN**이다. 이 bounded local result는 full journey, 실제 signing/OIDC, workflow dispatch, GHCR/API/policy, post-job artifact inventory, 새 exact-head CI 또는 Owner GO가 아니다. 원 revision의 독립 QA 기록과 corrected QA 전에 발생한 invocation 오류는 아래 역사 로그대로 보존한다. Release/overall external acceptance와 publication은 계속 HOLD다.

---

## RP2 final repair revision — 독립 로컬 QA (2026-11-06)

**판정: 로컬 source 및 회귀 PASS, actual bounded probe 수용은 PARTIAL.** Worktree `/home/planner/Dev/layoutManager-issue225-proof-execution-fix`, base `4fd0b32e82bd89f8056becd9e3dabea69a6b5e00`의 Manager frozen 5개 SHA-256을 probe 전 독립 계산해 모두 일치시켰고, 정적/회귀 확인 이후에도 동일함을 확인했다. 실제 QA 실행은 새19 + cleanup3 + 기존 RP7/CP6/RT15 = 50/50 tests PASS, Python compile, actionlint 1.7.12 (`release-proof.yml`, `pr-ci.yml`), 두 workflow YAML parse, inline Bash 84 blocks의 `bash -n`, `git diff --check` PASS다. 새 회귀는 build-record 차단 및 deadline/observer 실패 경계를 포함한다.

**코드 검토:** observer deadline 분류는 `PROOF.run`이 발생시킨 실제 `subprocess.TimeoutExpired`를 cause로 가진 `RR2_COMMAND_TIMEOUT`과 동일 absolute startup deadline 초과를 모두 확인해야 한다. deadline 이전 timeout, cause 없는 timeout, auth/nonzero/malformed 응답은 `INSPECT_UNAVAILABLE`/`READINESS_UNAVAILABLE`에 남는다. deadline은 외부 readiness gate의 absolute deadline과 min 처리되어 callback에서 재구성해 늘어나지 않는다. 실행 timeout 4초, 기본 direct 120초 및 host 600초 경로는 유지된다. proof workflow는 3개 `docker/build-push-action` 모두에 job-level `DOCKER_BUILD_RECORD_UPLOAD: 'false'`를 상속하고 step/runtime override와 미검토 action producer를 거부한다. 이는 정적/source 근거이며 실제 post-job artifact inventory가 아니다.

**보호 상태 및 실제 실행 한계:** 보존된 production snapshot 및 selected retained R1 metadata를 비교하는 fail-fast preguard PASS 후 direct timeout 한 번을 시도했다. 이 실행은 exit 1로 끝났고 nonce `4b1bbd1fd1c21402` 디렉터리만 생성했다. QA invocation에 승인된 triplet receipt의 `--triplet-receipt` 절대 경로를 넘기지 않아 probe가 repair worktree 기본 경로를 사용했다. 후속 read-only 확인에서 그 기본 파일은 없고 승인된 외부 receipt는 존재했다. 실행 코드 순서상 `checked_input`의 `Path.read_text()`에서 `FileNotFoundError`가 예상되지만 stderr/exception object를 보존하지 않았으므로 이는 정황 기반 분류이며 정확한 exception output은 NOT RECOVERABLE이다. 이 단계는 receipt 저장/volume 생성 전이라 receipt/result 또는 owned volume/container가 만들어지지 않았다. 이 실패를 timeout PASS로 보지 않았고 재시도하지 않았다. 따라서 이번 revision의 host helper 및 controlled startup-negative 실제 probe는 **NOT RUN**이다. 동일 selected production/retained R1 id/image/running/start/configured image/mount names는 postguard에서 불변이었고, frozen source hash도 probe attempt 후 일치했다.

**한계 / 다음:** 원 hosted RP2 실패 원인은 계속 UNKNOWN이며 이 수리는 local synthetic/source 경계만 검증했다. 새 direct probe PASS, host probe의 actual copied `g7.command`, 새 controlled negative의 `READINESS_MISSING`/`STARTUP_DEADLINE`/`STARTUP_OBSERVATION_DEADLINE` 성공, exact owned resource absence는 입증되지 않았다. Signed OCI/CLI, OIDC, workflow dispatch, GHCR/API/policy, full journey, new exact-head CI 및 post-job artifact inventory는 NOT RUN. 원 revision의 독립46/static 미복구 기록과 최초 QA 결과는 아래 역사 보고를 보존한다. 이 partial QA는 release/overall QA acceptance 또는 Owner GO가 아니며 publication HOLD를 유지한다. 전체 실제 실행 및 frozen-hash-after 기록은 ignored `data/release-proof/rp-execution-final-qa-live.json`에 있다.

---

## RP2 execution-fix — 독립 QA original-revision bounded evidence (2026-11-06)

**범위와 판정:** 이는 source snapshot `4fd0b32e82bd89f8056becd9e3dabea69a6b5e00` / tree `e004fb393d7b0e72fa6e2fdd7ef7d036715131f2` 위에서 QA가 수행한 제한된 로컬 실행 근거다. QA가 당시 확인해 Manager에 보낸 frozen source 5개 SHA-256은 handoff 값과 일치했고, probe 이후 동일하다고 보고했다. 현재 수정 중인 파일을 다시 검사하지 않았다. actual hosted RP2 cause는 **UNKNOWN**이다.

**실제 QA probe:** Direct timeout nonce `7d72389e56666925`는 identity/readiness 확인, startup 관측 138 ms, 실행 timeout 4003 ms, child 관측 및 cleanup PASS였다. Host timeout nonce `fc8568f2315adc05`는 startup 224 ms, 실행 timeout 4003 ms, child 관측, process group stopped 및 cleanup PASS였다. Controlled startup-negative nonce `6a11884d72af939f`는 exit 1 / `RR2_PROBE_INSPECT_UNAVAILABLE`, phase `STARTUP`, elapsed 952 ms, identity verified 및 child running이었으나 readiness 미관측·executionArmed=false·execution 0 ms, cleanup PASS였다. 이 negative는 기대한 readiness deadline 결과로 분류되지 않았다. inner cause는 UNKNOWN이며 이 결과를 성공적인 startup-deadline 시험으로 표현하지 않는다. 전체는 허가된 bounded local probe이며 product journey 성공이나 hosted 원인 재현이 아니다.

**보호 상태:** probe 전에 수행한 fail-fast guard는 PASS였다. probe 후 selected production 및 retained R1의 id/image/running/start/mount metadata가 불변이고 정확히 세 nonce 소유 container/volume 세트가 부재함을 확인했다. QA가 당시 보고한 frozen source 5개 hash도 probe 후 변하지 않았다. preserved before/after metadata와 세 개 result/receipt는 ignored `data/release-proof` evidence로 남아 있다. 초기에 별도로 실패한 literal-transcription guard와 그 뒤 direct probe가 shell sequencing상 먼저 발생한 이력은 이전 checkpoint에서 그대로 보존한다. 이를 PASS로 재분류하지 않는다.

**회귀/정적 시험 범위:** QA의 이 revision에 대한 이전 독립 46-test/static 결과는 context reset 전 Manager에게 보고되지 않았고 recover 가능한 실행 기록에서도 찾지 못했다. 따라서 이 보고서에서 미확인 QA 시험 수나 결과를 주장하지 않는다. Developer handoff에 기록된 46-test/compile/YAML/bash 결과와 Manager의 별도 15+3/actionlint/diff 결과는 각 역할의 별도 보고다. 이 QA turn에서는 재실행하지 않았다.

**한계 / 미실행:** actual OCI signing/CLI, OIDC, dispatch, GHCR/API/policy, full journey, 후속 exact-head CI 및 post-job artifact inventory는 NOT RUN이다. 기존 hosted run의 3개 unexpected build-record artifacts 관측과 원인 UNKNOWN을 유지하며, 내용 다운로드/삭제/검사나 데이터 유출 판단을 하지 않았다. Source repair 후 fresh independent QA와 새 승인된 hosted proof가 필요하다. 이 기록은 release/overall QA acceptance나 Owner GO가 아니며 publication hold를 유지한다.


---

## RP2 actual 실패 및 execution/artifact 수리 checkpoint (2026-11-06)

**실제 실패 보존:** trusted Main `4fd0b32e82bd89f8056becd9e3dabea69a6b5e00`/tree `e004fb393d7b0e72fa6e2fdd7ef7d036715131f2`의 [RP run2/42092820405](https://github.com/planner77/layoutManager/actions/runs/42092820405), job127475057679 step16은 direct timeout fixture에서 `RR2_COMMAND_TIMEOUT`, childObserved=false, cleanup=PASS였다. 원인은 UNKNOWN이며 startup latency 가설을 입증하지 못했다. 3-role build/RR1/old0.60 pair는 성공했지만 full RR2/export/finalize/OIDC/CLI는 SKIPPED/NOT RUN이다. always cleanup은 partial owned cleanup 성공이며 signed completion이 아니다. Root와 독립 QA가 API metadata로 관측한 build-record artifact3개는 `13446786446`/61270bytes, `13446666472`/64291bytes, `13444864759`/35479bytes다. 이들은 explicit public allowlist 밖 `.dockerbuild`이며 artifact boundary FAIL이다. 내용은 내려받거나 검사하지 않았고 CAD/DB/credential 유출 여부를 단정하지 않는다.

**Developer 수리:** Manager RE01–07 이후 실제 대행 `gpt-6.1-sol`이 별도 repair worktree에서 optional readiness seam을 추가했다. 기존 일반 journey의 direct120s/host600s와 실행 proof4s는 유지하며 fixture startup/readiness만 독립30s로 제한한다. exact CID/name/engine/nonce/labels·readonly volume·running 및 fixed Node marker를 확인한 뒤 실행 timer를 arm한다. deadline/early-exit/readiness-missing/inspect-unavailable/execution-timeout은 별도 phase/code이고 stdout/env 원문은 diagnostics에 넣지 않는다. host fixture는 이제 소유 경로에 byte-identical 복사한 `g7-deploy.py`의 `command(dummy Docker argv)`만 호출한다(실제 deployment main/upgrade 실행 아님). default caller 경로와 receipt-owned cleanup/process-group TERM/wait/KILL/reap를 보존한다.

**로컬 시험:** 새 집중15/기존 cleanup3/기존 RP7+CP6+RT15=총46 tests PASS; Python compile, default actionlint1.7.12의 proof/pr-ci, YAML/bash syntax 및 diff PASS. build-record 회귀는 기존 source에서 job flag 누락으로 RED 후 `DOCKER_BUILD_RECORD_UPLOAD='false'`를 proof job에 설정해 GREEN이다. 3 build·step/runtime true override·알 수 없는 implicit producer를 검사한다. `DOCKER_BUILD_SUMMARY` 설정과 artifact upload를 혼동하지 않는다. 필수 scope job에 새 집중 시험을 연결했고 실제 post-action artifact 부재는 다음 approved run 종료 후 Root/독립 QA API inventory가 확인해야 한다.

**허용된 tiny 실제 시험:** Root가 제공한 existing loopback CPU ref `sha256:2c49b5640913ff3a72232426877e92d213424386ef18c9d50586195979072e3e`, config `sha256:2b933b2fd1442ba73e54cb7fa428e5ee0e53408734dff8ddfd74b94f333ff8dc`, image source `d5ea04daa2573c7f8e2f0f2ee14c3ad53cf23389`/0.61.0만 사용했다. harness는 Main4fd 기반 WIP 수리 bytes이며 image source를 현재 harness/source라고 바꾸지 않았다. build/pull/registry write/whole journey를 실행하지 않았다. preliminary direct nonce `6827ea58ef799508`: identity/readiness/runningAtArm=true, startup poll elapsed120ms, execution timeout4004ms, cleanup PASS. 이후 receipt read/finally 경계를 보강했으므로 이 preliminary probe를 최종 frozen probe bytes의 재실행으로 기록하지 않는다. 최종 helper/core bytes의 host nonce `9eb81597430de70c`: readiness=true, startup poll222ms, timeout4011ms, groupStopped=true, cleanup PASS. controlled startup negative `e30ab723ff56bb2e`: marker를3s 지연하고 별도 startup1s에서 READINESS_MISSING, executionArmed=false/0ms·childObserved=false·exit1, cleanup PASS. 미관측 child를 timeout PASS로 바꾸지 않았다. 이들은 synthetic bounded local fixture이며 hosted RP2 원인/SLA나 full journey 성공 증거가 아니다.

**Guard 실패도 보존:** 첫 optional protected-metadata guard는 전달된 image ID literal의 전사 오류 때문에 FAIL했다. Developer shell이 실패 뒤 독립 newline의 authorized direct probe까지 진행한 sequencing 실수가 있었다. 이를 guard PASS로 기록하지 않는다. Manager가 보존 baseline과 실제 selected ID/image/running/start/mount를 독립 대조해 전사 오류임을 확인한 뒤, 남은 host/negative는 한 Python fail-fast guard→dependent invocation으로 실행했다. 이 경계의 전후 production 및 retainedR1 selected metadata는 동일했다. operational App/DB/CAD/volume, held R1 registry와 manual R2 namespace는 변경하지 않았으며 final independent QA의 새 guard 확인이 남는다.

**제한/다음:** 다음 실제 proof dispatch·job 종료 후 artifact inventory·OIDC/cert/CLI 검증·새 exact-head required CI/독립 QA는 미완료다. RF/LP source는 frozen 그대로이며 candidate build flag 보완은 별도 refreeze한다. GHCR/정책/Owner GO·전체 RR5 완료를 부여하지 않는다. 새 commit/push·artifact download/delete·credential/API/dispatch 작업은 하지 않았다.

## PR240 combined Manager 로컬 수용·게시 GO (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 아래 새 합산 독립 QA와 frozen11 hash를 검토했고 직접 RP7+CP6+RT15 회귀·세 workflow actionlint·initializer bash·diff를 통과했다. SAN의 pinned-source-shaped causal 거부 분류, 수용한 CP/RT 원본 byte 보존 및 기존 scope job의 명시적 28-test wiring을 수용한다. Root는 expected parent `874f1a3c506a3db35e588b882924d55d4e4050ab`·secret/runtime/remote/tree를 최종 감사한 뒤 기존 PR240에 정상 후속 commit/push하고 제목·본문을 최종 combined 범위로 정리할 수 있다. 새 exact-head required CI/검토 뒤 통합은 별도 판정한다. 이전644는 과거 baseline이며 actual OIDC/정책·actor denial/GHCR·Owner GO는 NOT RUN/PENDING이다. LP source는 이 head에 포함하지 않았고 외부 실행·권한 변경은 승인하지 않는다. 전체 RR1–RR5는 진행 중이다.

---

## PR240 Combined RP/CP/RT — Independent local source QA (2026-11-06)

**Result: frozen combined source QA PASS, local only.** Worktree `/home/planner/Dev/layoutManager-issue225-provenance`, branch `test/issue225-proof-provenance-main`, HEAD `874f1a3c506a3db35e588b882924d55d4e4050ab`. QA read `combined-source-freeze.json` and `combined-import.json` first, then independently recalculated all 11 frozen hashes; every file matched the freeze receipt. Focused tests passed: RP 7/7, CP 6/6, RT 15/15 (28 total). Python compile passed for all six helper/test files. actionlint 1.7.12 passed on `release-proof.yml`, `control-proof.yml`, and `pr-ci.yml`; all three workflows parsed as YAML, all 88 inline Bash `run` blocks passed `bash -n` after GitHub expressions were replaced for syntax checking, `cp-init-paths.sh` passed `bash -n`, and `git diff --check` passed.

**Workflow review:** `pr-ci.yml` scope job now invokes the 28 focused proof tests and compile. Its diff from parent adds only that test step; existing aggregate and Docker job assertions remain unchanged. Existing CI644 success is for old HEAD `874f1a3c506a3db35e588b882924d55d4e4050ab`, so it does not verify these combined source changes.

**Limits / NOT RUN:** all RP/CP/RT checks were local fixture/mock/static checks. No live network/API/CLI crypto, OIDC attestation, workflow dispatch, Docker, GHCR operation, credentials, policy/ref changes, or Owner approval was performed. Actual OIDC, CP policy enforcement, RT registry promotion, and Owner GO remain NOT RUN/PENDING. LP is excluded from this worktree and QA. No source edits, commit, or push were made; this report records only local evidence.

---

## PR240 combined RP/CP/RT 준비 — Root import 검증 (2026-11-06, 합산 독립 QA 대기)

Manager TP-225-CONTROL-COMBINED 결정에 따라 parent874f 위에 SAN 최소 수정과 기존 CP/RT의 수용된 source를 복사했다. helper/workflow/init 파일은 원본과 byte 일치를 확인하고 pr-ci.yml의 기존 scope job만 RP7+CP6+RT15 및 compile로 명시 확장했다. 이전CP476b/RT874f와 Root·지정 Developer/fallback gpt-6.1-sol·QA·용량 오류 이력은 아래 원문 prefix로 보존했다. 최신 RP07/SAN/RV/combined AC를 CP의 과거 문서 전체로 덮어쓰지 않았다. LP source는 포함하지 않았다.

Root 합산 실행은 pure28/28, 세 workflow(release-proof/control-proof/pr-ci)의 default actionlint1.7.12, compile/YAML/bash/diff PASS다. 새로운 외부 IO/서명·Owner 권한을 입증한 결과가 아니며 합산 frozen bytes의 독립 QA·새 exact HEAD CI는 아직 별도다. CP actor/schema/정책·RT 실제 registry/Owner approval·actual OIDC/live CLI/GHCR/정식 release GO는 NOT RUN/PENDING이다. 원 source backup·정확 hash·문서 prefix delta는 Git 제외 data/release-proof/combined-import-before 및 combined-import.json에 보존했다.

이전 [CI644](https://github.com/planner77/layoutManager/actions/runs/42082185357)는 source874f/tree8dc에서 all8 SUCCESS/A2 SKIP였다. 독립 QA와 Root가 archive01e47d6d13c4b452280cd6203fe2f247d600f5d0/tree 일치,174files/1102tests, actual typed RR1/old GHCR/RR2 nonce4fe6562dedeecbd3/timeout/converter/P1D/cleanup을 확인했다. 그 scope/static/docker 로그는 새 Python RP tests/actionlint를 실행한 것이 아니며 실제 release-proof dispatch도 아니다. 새 합산 head의 PASS·서명 증거로 재표시하지 않는다. PR240 Draft/전체 GO-PILOT BLOCKED·0.61.0/flags OFF/HOLD·외부 미적용을 유지한다.

---

## CP01–08 — 독립 로컬 QA 및 외부 실행 경계 (2026-11-06)

**Manager 로컬 수용·게시 GO:** Manager 대행 `gpt-6.1-sol`은 아래 독립 QA·frozen6 hash와 전체 fake-verifier 경로를 검토하고, 직접 6개 집중 시험·compile·initializer bash·두 workflow actionlint·diff를 통과했다. Root는 최신 code base/문서 이력과 기존 변경을 보존하고 secret/remote/parent/tree를 감사한 뒤 독립 Draft PR 게시·exact HEAD required CI를 진행할 수 있다. 실제 actor/정책 거부·Owner 승인·외부 실행은 미실행이며 통합은 완료된 CI/검토 뒤 별도 판정한다. 승인 packet 없이 refs/PR/정책/dispatch/GHCR/운영 쓰기는 허용하지 않는다.

**역할 경계:** Manager 대행 `gpt-6.1-sol`은 CP01–08 사전 AC를 작성하고 Root의 별도 controls-worktree 초기 draft assistance를 지정했다. Root 초기 검사는 Python compile뿐이며 Developer/QA 완료로 간주하지 않는다. 지정 Developer 대행 `gpt-6-sol`이 코드 작업을 마쳤고, 해당 turn의 모델 capacity 오류 1회와 Manager bounded retry 1회 뒤 재개·WIP 보존 사실을 기록했다. 이번 독립 QA는 아래 로컬 근거만 판정한다.

**판정: CP01–08 로컬 mock/정적 QA PASS.** Worktree `/home/planner/Dev/layoutManager-issue225-controls`, branch `test/issue225-control-proof-main`, frozen HEAD `476b686a7b9bb1ff9c691a71f895bd833311e090`에서 수행했다. handoff receipt의 helper, tests, initializer, 두 workflow, Operation 문서 등 6개 SHA-256을 독립 재계산해 모두 일치시켰다. CP 집중 회귀 6/6, Python compile, initializer `bash -n`, actionlint 1.7.12의 `control-proof.yml` 및 수정 `pr-ci.yml` 검사, 두 workflow YAML parse, 두 파일의 명시 bash step 4개/27개 `bash -n`, `git diff --check`가 PASS했다.

CLI plan은 token 없이 격리 임시 packet/output으로 실행해 `PLAN_ONLY`, 두 예정 denial case, `ownerApproval=NOT_ATTESTED`, `policyEnforcement=NOT_VERIFIED`를 확인했다. 이는 helper의 기본 plan 경로이며 실제 HTTP/API 호출이 없었다. initializer의 정상 경로는 두 고정 출력 경로만 GITHUB_ENV에 기록했고, RUNNER_TEMP 부재/nonexistent 실패 경로에서는 env file을 바꾸거나 소유 결과물을 만들지 않았다. workflow의 artifact upload는 initializer success 및 execute mode에만 제한된다.

Fake transport에서는 `verify_denials`의 전체 3-case 성공 경로(branch update, tag delete, missing-required-CI merge)를 통과시켰다. merge preflight는 packet에 묶인 PR/base/head/fixture-only compare와 check-runs·legacy statuses의 빈 페이지를 읽었고, expected aggregate check가 존재하는 경우 거부됨을 확인했다. 개별 suite 목록·detail·actor·시각·active ruleset/revision match에 대한 기존 음성 회귀와 함께 generic 403 without matching suite 및 unknown readback을 policy denial로 승격하지 않았다. actions attempt의 다른 run/source/workflow/attempt/event 및 case time-window 오류, capability 순서·시각 검증도 집중 테스트에 포함된다. 요청된 `actorMode`는 실행 자격 경로 선택자일 뿐 실제 ref actor 증명이 아니다. helper는 독립 rule-suite의 정확 actor ID/name/ref/SHA/time을 조회해 요청 actor 및 기대 ruleset과 대조하도록 구성돼 있다. 테스트 fixture 결과는 실제 ref operation actor를 입증하지 않는다.

**한계 / NOT RUN:** 전 과정은 임시 파일과 fake transport/local validator만 사용했다. `--execute`, live read-only verifier, workflow dispatch, GitHub API mutation/readback, actual rule-suite actor/result, Owner approval, control refs/PR/status, ruleset apply/final update/delete, Actions run은 수행하지 않았다. 실제 rejection은 HTTP status만으로 판정할 수 없고 exact rule-suite·ref immutability·effective ruleset readback이 필요하다. 결과는 검토 준비용 로컬 적합성만 보여주며 실제 보호/거부/권한/Owner 승인이 아니다. Main branch policy에는 explicit creation rule이 없으므로 이 QA는 branch creation을 차단한다고 주장하지 않는다. tag create/update/delete 및 branch PR/delete/non-fast-forward/required-CI 케이스 역시 실제 증거가 아니라 packet-bound 준비 코드다. 기존 RP, frozen R2, 제품 OFF/HOLD, release/production 상태는 이 worktree에서 변경하지 않았다.

---

## RT01–06 Developer 대행 전환 및 독립 로컬 QA — 2026-11-06

**Manager 로컬 수용·게시 GO:** Manager 대행 `gpt-6.1-sol`은 frozen2 source와 아래 독립 QA의 15개 fake-registry 회귀·compile·diff를 검토했고 직접 같은 검사를 통과했다. raw byte 보존·partial/uncertain 중단·concurrent-change 탐지의 로컬 계약을 수용한다. Root는 최신 base/문서 이력 보존과 secret/remote/parent/tree 감사 후 code-only PR/required CI에 포함할 수 있다. 실제 client/Owner verifier·서명/GHCR/권한·출고는 미실행이며 CI wiring도 후속이다. 이 판정은 실제 승격/Owner GO나 전체 RF/RR5 완료가 아니다.

기존 Developer 대행 `gpt-6-sol`은 앞선 CP turn의 capacity 오류 뒤 bounded retry로 CP를 마쳤고 CP 독립 로컬 QA는 별도 PASS로 유지한다. 새 RT turn은 다시 `Selected model is at capacity`로 실패했다. Manager는 RT worktree가 사전 TestPlan/Issue225 수정만 있고 구현은 미착수임을 확인한 뒤, AGENTS의 역할 실행 불가 시 대행·실제 근거 기록 규칙에 따라 별도 Developer 대행 `gpt-6.1-sol`을 명시 배정했다. 실제 task는 `/root/manager_fallback/developer_rt_fallback`이며 지정된 별도 Developer가 구현·재시도 검증을 완료했다. Manager는 수정된 frozen source를 검토했고 QA를 요청했다. Manager와 Developer가 같은 모델을 쓰더라도 별도 agent/역할이며 독립 QA는 별도로 수행한다.

**독립 QA 판정: RT01–06 local fake transport/static checks PASS.** Worktree `/home/planner/Dev/layoutManager-issue225-registry-promotion`, branch `test/issue225-registry-promotion-transport`, HEAD `874f1a3c506a3db35e588b882924d55d4e4050ab` / tree `8dc72a44221e0d842fd85b60c190f4ecf1b01d8b`. `rt-developer-handoff.json`의 helper/test 두 SHA-256을 독립 재계산해 각각 `759b968bcf6dddb3955e817ef459b0cf8b1b4968b9aa665de476a848e39bc73b` 및 `7e55885740e8b202d40ddaa7a98ac70db3e1cdb9c9a1753813c421f49c93c40f`와 일치시켰다. `python3 -B src/tests/oci/test_registry_promotion.py -v` 15/15, `py_compile`, `git diff --check`를 독립 재실행해 PASS했다. 별도 실험은 하지 않았다.

**소스·시험 경계:** 고정 package/version, 3-role candidate/final refs, source/workflow/tree/receipt packet 연결, reserved `.github/workflows/release-candidate.yml` 경로와 RP loopback release-proof 거부를 검토했다. 모듈 import/무입력 기본 plan은 adapter/network/token/I/O를 만들지 않고 explicit fixture CLI는 `PLAN_ONLY`/`httpRequests=0`/`authority=NOT_VERIFIED`를 반환한다. Tests cover all-absent byte-preserving copy, exact triplet NO_OP, partial/different/typed-unknown target HALT, raw/media/size/index-child/blob graph preflight, all-three-final reads, same-package blob HEAD, per-PUT typed absence, journal PUT-intent-before-mutation ordering, tag/digest readback and final full-set reread. Fake concurrency covers target appearance during preflight, after first confirmed role, earlier final replacement before completion, plus unknown immediate recheck. Candidate preflight, journal-intent, PUT timeout, rewrite/ambiguous readback and journal failures stop subsequent PUTs; tests assert no automatic retry/overwrite/delete/rollback/alias operation. Fixed final tags are only the three explicit `0.61.0` role refs.

**한계 / NOT RUN:** `VerifiedCandidateContract`, typed `AuthenticatedManifestAbsent`, and `MemoryJournal` are synthetic injection/test contracts; no authenticated client, credential discovery, durable journal adapter, workflow/Owner-environment verifier or CI wiring is present. No GitHub/GHCR API, Docker, credential, workflow or Owner operation was performed. Raw parent/linked child manifest bytes and descriptor media/digest/size are checked; blobs are HEAD availability/digest/size checks only. This does not verify full config/layer bytes, platform/role/source signature or release provenance, package permissions, external-writer exclusion, CAS/atomicity, or actual tag readback. Actual GHCR promotion, signed candidate verification, and Owner release GO are **NOT RUN**. No product/policy/version/RP/CP/LP/frozen-R2 or source file was changed by QA; TestReport received this QA result only. No commit/push.

---

## PR240 RV — Actions context RED/GREEN 최소 수정 (2026-11-06, 독립 QA 로컬 PASS)

**Manager 수정 게시 GO:** Manager 대행 `gpt-6.1-sol`은 아래 최종 QA와 frozen hash를 검토하고 동일 actionlint·7개 회귀·compile·diff를 직접 통과했다. Root는 기존 owned CI cleanup 경계와 secret/remote/expected parent `ef434df`·tree 감사를 마친 뒤 PR240에 정상 후속 commit/push할 수 있다. fixed exact-HEAD required CI와 workflow validation 전 merge/실제 dispatch HOLD, 실제 OIDC NOT RUN을 유지한다.

**기존 게시 실패:** Draft [PR #240](https://github.com/planner77/layoutManager/pull/240)의 source `ef434df8110da27106ce9308113594aa290d2555`, parent Main476b/tree `2f3fa28ccb7acb9d5c9512e604e3977b39630b34`의 proof workflow는 [run1/42079592176](https://github.com/planner77/layoutManager/actions/runs/42079592176)에서 failure·0초·jobs0을 반환했다. 이는 push의 workflow 구성 검증 실패이며 실제 dispatch/OCI/OIDC/서명 실패가 아니다. 별도 baseline PR CI #643/run42079603098는 이 기록 시 진행 중이다. 기존 local synthetic6 QA는 보존하지만 GitHub Actions semantic 검증 완료로 확대하지 않는다.

**관측/수정 주체:** 공식 [context availability](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability)와 Root의 actionlint1.7.12 RED가 job.env의 runner 참조 두 곳을 거부했다. 공식 release API asset digest로 검증한 archive SHA-256은 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`이다. Root는 Manager가 먼저 기록한 RV01–03에 따라 최소 수정 보조를 맡아 RUNNER_TEMP→지원되는 초기 step/GITHUB_ENV로 같은 절대 경로를 전달하고, 초기화 미완료 시 세 always 경로를 막았다. 초기화 후에는 기존 helper의 NO_OWNED_RECEIPTS/partial cleanup 및 실패 readback 판정을 유지하며 outer receipt-existence guard로 생략하지 않는다. 기존 build inputs/source/permission/assertion·45분 PR gate/제품0.61/flags/HOLD는 유지한다. 지정 Developer가 이 수정을 구현한 것으로 기록하지 않는다.

**로컬 결과:** 같은 actionlint는 RED exit1/두 expression 오류→GREEN exit0/오류0이며 default invocation도 PASS였다. optional shellcheck/pyflakes는 이 host에 없으므로 해당 analyzer PASS를 주장하지 않는다. Python compile·기존6+실제 초기화 script의 정상/잘못된 path·자원 미생성/세 always guard 회귀를 합친7/7·YAML parse·전체16개 run block(기본 shell3개 포함)의 bash syntax·diff check가 PASS다. 원본/수정 로그와 source hash receipt는 Git 제외 `data/release-proof/rp-actionlint-before.log`, `rp-actionlint-after.log`, `rp-rv-root-repair.json`에 보존한다. Manager review→새 독립 QA→수정 exact HEAD 플랫폼/required CI 전 통합 HOLD, 실제 OIDC 및 live gh 양성/음성은 NOT RUN이다.

**독립 QA 판정 (RV-01–03 로컬 범위): PASS.** QA는 별도 worktree `/home/planner/Dev/layoutManager-issue225-provenance`, branch `test/issue225-proof-provenance-main`, HEAD `ef434df8110da27106ce9308113594aa290d2555`에서 시작했다. 고정 receipt의 workflow/test/helper/Operation 네 SHA-256을 모두 독립 재계산해 일치시켰다. 격리된 공식 actionlint `1.7.12`의 정확한 동일 바이너리로 원본 HEAD workflow를 임시 파일에 재현 검사해 job.env 33·34행의 runner context 오류 2개를 확인했고, 수정 workflow는 지정 파일 검사 exit0이었다. 7개 집중 회귀와 Python compile을 재실행해 PASS했다. YAML parse와 13개 Bash `run` step의 `bash -n`도 PASS했다. 실제 현재 workflow의 always cleanup/allowlist/upload 세 경로가 모두 `steps.paths.outcome == 'success'`에 묶였고, 공개 allowlist 뒤 upload 추가 guard도 유지됨을 확인했다. 초기화 코드는 RUNNER_TEMP의 절대 경로·개행 부재와 GITHUB_ENV의 절대 경로를 검증하고, 검증 전에는 디렉터리/receipt를 만들지 않는다. 무효 경로 회귀는 빈 값·상대 경로·LF·CR에서 실패, env file 및 파일 수 불변을 확인한다. 초기화 후 cleanup helper는 receipt 유무와 관계없이 호출되어 기존 `RP_NO_OWNED_RECEIPTS_TO_CLEAN`/partial-owned 정리·실패 판정을 수행한다. 추가 receipt-existence gate는 없다.

독립 재검사에서 원래 run `42079592176`의 0초/jobs0 결과를 OIDC 실행 오류로 확대하지 않았고, 새 GitHub validation/required CI·workflow dispatch·실제 OIDC/서명·live CLI negative는 **NOT RUN**이다. 이 판정은 수정 로컬 workflow 준비 수용만 뜻하며 merge/dispatch 권한이나 GHCR/운영 승인이 아니다. source hash가 바뀌거나 통합을 제안하기 전 exact-head 플랫폼 validation과 required CI가 필요하다. 원 사용자 worktree의 두 uncommitted edit는 건드리지 않았다. 검증 대상 provenance worktree의 기존 수정 source도 QA가 변경하지 않았으며, QA는 TestReport 기록만 추가했다.

---

## RP01–08 local independent QA — 2026-11-06

**Manager 로컬 수용·게시 GO:** Manager 대행 `gpt-6.1-sol`은 frozen source 4개 hash와 아래 독립 QA 보고를 검토하고, 직접 6개 집중 시험·Python compile·diff 검사를 통과했다. case별 causal mismatch 분류와 실패/partial cleanup의 scope·marker·반복 absence 계약을 수용하여 Root의 최종 secret/remote/parent/tree 감사 후 독립 PR 게시 및 exact-HEAD required CI를 승인한다. 실제 서명·CLI live 검증은 아직 NOT RUN이며 통합은 완료된 required CI/검토 후 별도 판정한다. trusted Main의 실제 proof dispatch는 그 이후 단계이고 GHCR 게시·정책/legacy workflow state 변경·운영 실행·Owner release GO는 승인하지 않는다. 전체 RR1–RR5 목표는 진행 중이다.

**판정: 로컬 schema/workflow QA PASS, 실제 OIDC/attestation은 NOT RUN.** 대상 worktree는 `test/issue225-proof-provenance-main`, HEAD `476b686a7b9bb1ff9c691a71f895bd833311e090`이다. QA 시작 시 지정된 workflow/source/test/Operation SHA-256 4개가 모두 Manager 제공 값과 일치했다. 완료 뒤 `git diff --check` PASS; 새로 변경한 파일은 이 TestReport 기록뿐이다.

| Check | 결과 | 범위 |
| --- | --- | --- |
| RP-01 exact dispatch guard | PASS — synthetic context regression 1종·10 wrong-context 변형 | 정확 repo/repository ID/owner ID/Main ref/workflow ref·SHA/source/tree/run ID 및 hosted runner 조건. 로컬 Git 검사 stub이며 실제 GitHub context 또는 Main dispatch 아님 |
| RP-02 permission/publication review | PASS — static workflow review | workflow top-level permissions empty, proof job에 contents/read, packages/read, id-token/write, attestations/write만 부여. GHCR publish/package tag/policy 권한이나 별도 PAT 경로는 없음. 실제 effective GitHub permission 조회는 NOT RUN |
| RP-03 same-run chain | PASS — code contract review + synthetic schema | 실제 workflow는 same-run archive→three-role OCI/RR1→old GHCR pair→RR2/RR3 journey→export/finalize→cleanup→sign 순서를 요구한다. 합성 receipt는 스키마 검증이며 실제 같은 run 시험 증거가 아님 |
| RP-04 action/subject construction | PASS — static workflow review + schema tests | `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6` pin, `push-to-registry:false`, `create-storage-record:false`, 3 manifest와 1 sanitized receipt subject를 checksum input으로 구성. 실제 attestation 생성 NOT RUN |
| RP-05 public artifact boundary | PASS — allowlist tests + workflow review | allowlist는 세 manifest/receipt/checksum/Sigstore bundle/verification metadata만 허용하며 테스트가 extra file, symlink, 누락 role을 거부했다. OCI layer/config dump·DB/CAD/backup/credential 경로 업로드 없음 |
| RP-06 verification identity | PASS — schema-only synthetic certificate tests | immutable repository/owner ID, source/workflow digest/ref, signer URI, hosted runner, issuer/run URI 및 4 subject digest 검증을 테스트. CLI 실 checksum·실제 인증서/API 대조는 NOT RUN |
| RP-07 negative causal classification | PASS — synthetic output classifier tests | wrong source/workflow commit/ref, wrong workflow, tampered manifest/receipt별 허용 진단을 분류하고 generic/network/TUF/auth/timeout/parser/usage/empty output 및 잘못된 exit를 거부했다. 실제 Sigstore/GitHub negative verification NOT RUN |
| RP-08 readiness and reporting | PARTIAL | local QA 기록 완료. exact Main CI, trusted dispatch, hosted OIDC execution과 root 통합은 별도 후속 |

**실행:** `python3 -m py_compile src/tests/oci/rp-provenance.py src/tests/oci/test_rp_provenance.py` PASS; `python3 src/tests/oci/test_rp_provenance.py -v` 6/6 PASS; `git diff --check` PASS. 별도 mock-only probe에서 (1) 하나의 정확 owned RR2 receipt가 있고 result summary가 사라진 경우 RR2와 retained RR1 cleanup만 호출하고 completion marker를 만들지 않음, (2) wrong source 및 추가 owned receipt를 어떤 Docker inspect/helper 호출 전 거부, (3) marker 재호출마다 실제 absence/project를 재검사하고 helper를 반복 실행하지 않음, (4) 외부 replacement와 Docker inspect 오류를 각각 `RP_RR2_RESOURCE_REAPPEARED` 및 원래 safe lookup error로 fail-closed 처리함을 확인했다. 모든 probe는 임시 디렉터리·mock Docker adapter/helper 사용이며 실제 Docker/registry/resource를 만지지 않았다.

**기록한 source SHA-256:** `.github/workflows/release-proof.yml` `a7cad34305a3606a18e69e3552f3018f44bb7e22ee4bbe9933ab6fcbbb628648`; `src/tests/oci/rp-provenance.py` `1d9d4e6d1c421ca97de7cea9a5c0764aa715a125b83c1d0def5474fe5da818f7`; `src/tests/oci/test_rp_provenance.py` `54a69dca14625b089dde3fe9e2fa5d0aba8a55f0e8fdc62939aaccbd3eacbcb5`; `out/Operation.md` `c1704f923258d251ead4d05f6116e07daa8d8719951e131327fe2a672009c15f`. Synthetic certificate/result JSON exists only in unit fixtures and is not signed evidence.

**제한:** 실제 trusted Main dispatch, exact-hosted workflow run, GitHub OIDC token, Sigstore signature/bundle, pinned GitHub CLI download/checksum and live positive/negative `gh attestation verify`, GitHub effective permissions 및 immutable certificate IDs의 API 대조는 모두 **NOT RUN**이다. 이 PASS는 local implementation/schema review만 의미하며 source provenance, formal GHCR release, RR5 completion 또는 Owner GO를 입증하지 않는다. 이 QA는 직전 완료된 CI641/Main160 및 prior UNKNOWN historical failures의 verdict를 대체하거나 수정하지 않는다. No dispatch, external write, Docker journey/build, source change, commit, or push was performed.

## PR239 RR2/RR3 통합 — CI641 실제 OCI 복구·Main160 HOLD (2026-11-06)

**수용:** [PR #239](https://github.com/planner77/layoutManager/pull/239)의 source HEAD `a7d1075c8b2585a2994b7d45214f41e0eee6c2e2`는 [CI #641/run42071344678](https://github.com/planner77/layoutManager/actions/runs/42071344678)의 aggregate `127414170533`를 포함한 적용 8개 Job 모두 SUCCESS, A2만 기존 scope 정책에 따른 SKIPPED였다. Root와 독립 QA가 완료된 Docker `127399887867` 및 Static `127399888357`의 원시 로그와 PR/tree/review/behind를 각각 확인했다. Static은 174 files/1,102 tests·TypeScript·production build PASS, lint 0 errors/기존 12 warnings이며 두 Chromium shard/G7 signed/Greenfield도 PASS다.

**출처 구분:** hosted archive/build source는 Actions merge commit `191a35795d5e19b62d49ce2815c5dfc83c248066`이다. GitHub commit API로 parent Main68c0+PRa7d 및 tree `74a8972940cf8d33c7712cb084536a92e9d0650e`가 PR tree와 같음을 확인했다. 아래 세 역할은 실제 runner의 `CONTAINERD_TARGET`이며 engine ID=검증된 manifest target, config digest는 별도다. 이전 로컬 QA의 product source d5e/old pair source9eb와 hosted191a를 재표시하거나 섞지 않는다.

| Role | 실제 manifest / engine target | Config SHA-256 |
| --- | --- | --- |
| app | `sha256:457b8ca2f71ce697d2891a2ce82caf0a75a60b3f9534ec9b069ed0c27d698e1e` | `sha256:bc72e321e67163fbc33fb579d2c6865525d256a9f974cfc3f790f19fa1d200e5` |
| migrator | `sha256:11810622217905c89ab6fc87444b7d945ac58efc882909168323407bde6fef55` | `sha256:0099d7e196611f14fb45075f9e9c44f5d16d4573d29cb90511c8bce74a553df2` |
| cpu-worker | `sha256:98903fdaea8aadf6a25546b915d4c935a74885181c33d7d70b57f778d38edde8` | `sha256:2d8ce471fb0aa8d758cf965cbdbcc83a3325e0a61a4f8f4ed4d96bbbc53b4b30` |

**실제 hosted 실행:** RR1 `negatives=6 retained=true`, converter KILL wait/inspect137·OOMKilled=false 및 별도 주입 OOM137·OOMKilled=true와 각각 READY 복구, `OCI_CPU_PROOF_PASS`가 확인됐다. P1-D는 scenes1/denied3/originalGets0/sceneGets4/freshSessions=true였다. RR2 cleanup 집중3, 실제 direct timeout `834806dcd2b9d6be`의 childObserved/cleanup PASS와 host-helper timeout `9e446cadaff24adf`의 childObserved/groupStopped/cleanup PASS, 실제 게시 과거 pair `RR2_OLD_GHCR_PAIR_PASS`가 확인됐다. 이 timeout들은 합성 bounded timeout이며 자연 장애/SLA 증거가 아니다.

새 hosted nonce `8e3eb54b7037476b`는 동일 source의 8단계 assertion을 모두 지난 뒤 `RR2_RR3_ACTUAL_OCI_JOURNEY_PASS`를 출력했다. 이는 실제0.60 설치·업무 snapshot→잘못된 승인 거부/정확 upgrade·별도 start→signed HTTP/독립 CPU/fresh Viewer→같은 backup의 빈 volume 정식 restore·old digest 인증 readback 및 owned cleanup을 검증한 코드의 exit0/marker다. CI의 개별 DB/backup/세션 receipt는 공개 artifact로 올리지 않았으므로 로컬 QA의 UUID/행 수를 hosted 값으로 복제하지 않는다. 이어 always `Clean exact RR2 namespaces and retained RR1 registry` 단계도 SUCCESS, `RR2_OWNED_NAMESPACE_CLEANED`와 두 `RR2_TIMEOUT_OWNED_RESOURCES_REMOVED`를 확인했다.

**통합/출고 분리:** Manager 대행 `gpt-6.1-sol`이 로컬 frozen29 QA와 위 독립 hosted 검토에 근거해 code-only 통합 GO를 냈다. Root는25 paths의 현재 secret/runtime/CAD/DB 제외·configured remote 일치·정확 parent/tree/head를 재감사한 뒤 Draft 해제→expected a7d squash merge를 수행했다. Main `476b686a7b9bb1ff9c691a71f895bd833311e090`의 단일 parent68c0/tree74a는 PR과 정확히 같고 제목1줄/본문빈값이다. [Main CI #160/run42075718479](https://github.com/planner77/layoutManager/actions/runs/42075718479)은 이 SHA에서 SUCCESS, scope `127415246808`의 실제 `>=0.61.0 code integration, GHCR release on HOLD`와 GHCR build/push `127415328601` SKIPPED를 확인했다. Ready event로 시작한 동일 PR HEAD [CI #642/run42075709858](https://github.com/planner77/layoutManager/actions/runs/42075709858)는 이 기록 시 in_progress이며 통합 근거인 완료641과 구분한다.

**후속/제한:** 원인 미확정 과거 setup CSRF/Viewer reload 실패는 아래 원장에 그대로 남으며 이번 성공은 안정성/SLA나 현장0.58 복구 보증이 아니다. RP/CP 작업은 같은 tree의 Main476b에 새 branch를 만들어4개/3개 WIP 파일의 전후 hash를 대조·보존했고 기존a7d branch/ignored receipt는 남겼다. 원 사용자 worktree와 운영 App/CAD/DB는 변경하지 않았다. 제품0.61.0/Scene flags OFF/>=0.61 GHCR HOLD, #225/#218/#231 OPEN·GO-PILOT BLOCKED 유지. 실제 OIDC 서명/RR4 effective 보호·정식3-role GHCR·Owner GO는 미완료다.

---

## RR2/RR3 RX11 — 최종 source 독립 full journey QA (2026-11-06)

**Manager 로컬 수용·게시 GO:** Manager 대행 `gpt-6.1-sol`은 아래 독립 QA의 frozen 29-path/8단계 실제 실행·소유 정리와 재사용한 동일 core의 집중/timeout 근거를 검토했다. 최종 receipt의 backup `1278d28a-9584-47ea-90d1-8bf0f9adca1e`, 복원 App 기동 전 전체 baseline 일치, 기동 후 historical business/files/manifest 보존을 직접 대조했다. Root의 TypeScript·lint(0 errors/기존12 warnings)·production build와 최종 test-only 변경 검사를 근거로 **로컬 기능·복구 proof를 수용하고 독립 PR 게시 및 새 exact-HEAD required CI 실행을 승인**한다. Root는 최종 staged/secret/remote/expected-parent 검사를 마친 뒤 commit/push한다. 과거 CSRF/Viewer 실패 원인은 UNKNOWN이며 안정성/SLA·hosted RR2·merge·정식 출고/정책 적용/Owner GO를 수용한 판정이 아니다. 전체 RR1–RR5 목표와 OFF/HOLD·GO-PILOT BLOCKED를 유지한다.

**판정: 로컬 폐기형 RR2/RR3 full journey PASS.** 새 고유 nonce `413860e4309a14b5`로 `rr2-journey.py`를 정확 한 번 실행했고 `RR2_RR3_ACTUAL_OCI_JOURNEY_PASS`를 받았다. 테스트 전후 [final source manifest](../data/release-proof/rr2-rx09-rx11-final-source.sha256)의 29개 경로 SHA-256이 모두 일치했다. Worktree/harness HEAD `68c0c951126dbfe9e0c3072982afd502b8443262`, 과거 게시 GHCR pair source `9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63`, RR1 candidate source `d5ea04daa2573c7f8e2f0f2ee14c3ad53cf23389`는 각각 구분한다. 실행 입력은 기존 read-only GHCR0.60 pair receipt 및 기존 retained RR1 three-role registry receipt다.

**8단계 실제 증거:** `prepare → old_install → old_business → upgrade → current_start → current_http_worker_viewer → formal_restore → old_digest_readback` 모두 통과했다. 이전 GHCR digest의 실제 0.60 App/Migrator로 소유된 격리 설치를 만들고 Browser READY 및 QUEUED 작업, Current, Audit, Source/Scene 파일 snapshot을 준비했다(시작 snapshot: 2 Version, 2 Job, 1 SceneAsset, 1 CurrentScene, FK 0, 3 files). 기존 0.60 설치 setup/Admin/Editor/Site Grant와 두 DXF HTTP/Current/source 흐름이 완료됐다. 잘못된 upgrade approval은 `G7_DEPLOY_STALE_PLAN`으로 거부됐고 source snapshot은 불변이었다. 정확 승인으로 0.61 migration/backup 1건을 적용한 뒤 App은 STOPPED 상태로 확인했고, 별도 승인된 candidate App start가 통과했다.

Signed HTTP flow에서 Origin/CSRF 잘못된 요청 2개는 403, 정상 DXF upload는 QUEUED가 됐다. 독립 digest-pinned CPU Worker가 이를 PUBLISHED했고 새 Editor 세션의 Viewer가 저장 Scene Asset의 LINE을 복원했다. Viewer reload 뒤에도 정상 렌더와 의도된 정밀 선택 한계 경고가 있었고 원본 CAD GET은 0이었다. 이전 Browser READY Job/Scene/Current/Audit/Source 불변 prefix를 비교했으며 CPU 게시 뒤 후보 snapshot은 3 Version/3 Job/2 SceneAsset/2 CurrentScene였다. 같은 upgrade backup을 빈 소유 restore volume으로 복구한 직후, 0.60 manifest·DB business/Job/Scene/Current/Audit prefix·원본/Scene 파일·FK 상태가 old baseline과 일치했고 backup 뒤 CPU writes는 복구본에 없었다. 실제 이전 0.60 digest App을 별도로 기동한 뒤 기존 Editor HTTP login/session, Current/두 source SHA, 기존 Browser READY Scene/asset readback이 통과했다. 그 후 기대한 새 AuthSession 및 로그인 AuditEvent 한 건만 생겼으며 나머지 historical rows/files는 유지됐다.

**RX11 및 과거 실패 구분:** RX11 변경은 `rr2-old-install.spec.ts` 하나이며 업데이트된 테스트는 setup 요청의 available headers를 수동 관측하고 기존 first-admin 성공 assertion을 유지한 채 전체 업무 fixture까지 완료했다. 이전 fresh QA nonce `b0ba7283e6d6dab2`의 `old_business`/`RR2_PLAYWRIGHT_FAILED` 결과는 그대로 FAILED로 보존한다. 그 실행에서 setup UI alert의 안전한 code `SETUP_CSRF_DENIED`가 보존돼 있으나 원래 HTTP status/order는 확보되지 않았으므로 그 원인은 여전히 **UNKNOWN**이다. RX11의 다른 bounded first-setup-only receipt `96454df...`에서 기록된 GET 200/POST 201, cookie/header boolean 일치는 그 분리 probe 결과로만 취급한다. 새 full journey가 성공했다고 앞선 실패 원인을 소급 설명하지 않는다. 이전 `07cb` Viewer reload failure도 UNKNOWN 그대로 남는다.

**재사용과 신규 실행:** 이전 RX09–10 QA의 cleanup regression 3/3, RR1 identity 10/10, Python compile/diff 검사 및 실제 child timeout와 host-helper process-group/CID timeout cleanup probe는 새/이전 manifest 공통 22 source 경로 중 21개가 byte 동일하고 `rr2-old-install.spec.ts` 하나만 바뀐 것을 비교해 재사용했다(이전 manifest에만 있던 경로 1개는 RX11 source에 포함되지 않음). RX11가 바꾼 Browser spec은 이번 전체 journey에서 실제 실행·통과했다. 이 네 묶음은 이번 turn에 재실행한 것으로 계산하지 않는다.

**정리 및 격리:** 새 journey receipt의 정확 소유 host/child container와 live/restore volume은 모두 부재를 읽기 전용 확인했다. 보존 대상 수동 `3e3a31b81ee965a2` namespace는 그대로 존재했다(기존 live App stopped, 기존 restore App running); retained R1 registry는 기존 container ID로 계속 running이었다. 운영 `cad-layout-viewer-app` ID/image/running/StartedAt 및 `/data` mount는 실행 전 fingerprint와 일치했다. 운영 CAD/DB를 열거나 내용을 수집하지 않았다. 이번 실행의 receipt/result와 비공개 fixture는 Git 제외 `data/release-proof/rr2-413860e4309a14b5/`와 `data/release-proof/rr2-rx11-qa-final.json`에 있다. `git diff --check` PASS.

**완료 경계:** 이는 수동 Compose namespace clone·loopback retained registry를 사용한 새 로컬 RR2/RR3 실제 Docker/HTTP/Browser 통합 증거다. 기존 production Compose 자체의 namespace 안전성, hosted RR2, 실제 현장 복구, GHCR3-image provenance/publication, RR4 effective protection/RR5 Owner GO는 입증하지 않는다. 제품 version/flags/HOLD, 운영 자원, package/tag/policy를 바꾸지 않았다. CI/review/merge/commit/push는 수행하지 않았다.

## RR2 RX09–10 독립 QA — 2026-11-06

**판정: 당시 독립 QA FAILED / 후속 수정 뒤 별도 재시험 통과.** QA 대상 worktree HEAD는 `68c0c951126dbfe9e0c3072982afd502b8443262`이며 RX09–10 시험 bytes는 `data/release-proof/rr2-rx09-rx10-final-source.sha256`의 SHA-256 manifest를 시험 전후 모두 검증해 전부 일치했다. 이 harness HEAD, 실제 old GHCR pair source `9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63`, RR1 candidate/build source `d5ea04daa2573c7f8e2f0f2ee14c3ad53cf23389`는 서로 다른 증거 식별자다. 기존 GHCR0.60 App/Migrator digest receipt와 retained RR1 3-role receipt를 그대로 사용했다. 그때 보존된 Browser alert code `SETUP_CSRF_DENIED`는 UI 관측값이며 실제 HTTP status/order와 root cause는 UNKNOWN이다. 최신 RX11 결과는 위 별도 항목에 기록했고 이 실패 row/verdict는 history로 보존한다.

**독립 정적·집중 시험:** `test_rr2_cleanup.py` 3/3 PASS, `rr1-image-identity.test.py` 10/10 PASS, 대상 Python harness 4개 `py_compile` PASS, final source manifest 20 paths 전부 PASS. 실제 Docker timeout probe도 새 nonce로 직접 두 번 수행했다. Docker 자식 실행은 `RR2_COMMAND_TIMEOUT`, child 관측 및 owned cleanup PASS (`efc3b4ec34d14c18`); byte-identical host helper의 Docker CLI 자식 실행은 `RR2_HOST_COMMAND_TIMEOUT`, child 관측·process group 종료·owned cleanup PASS (`ee3cf5c6488644d7`).

**최종 source의 단일 fresh full journey:** `rr2-journey.py`를 기존 old pair 및 RR1 triplet receipt로 한 번 실행했다. 신규 nonce `b0ba7283e6d6dab2`; 명령 결과는 `RR2_RR3_JOURNEY_FAILED stage=old_business code=RR2_PLAYWRIGHT_FAILED`다. Journey는 old OCI 설치 단계까지 진행했으나, 최초 관리자 등록 버튼 클릭 뒤 20초 내 `최초 관리자가 등록되었습니다.` 성공 문구가 나타나지 않아 기존 0.60 App의 authenticated business fixture로 진입하지 못했다. 안전하게 남긴 Playwright trace는 해당 assertion과 element 미발견만 기록하며 HTTP 응답 상태/원인은 계측되지 않아 **원인 UNKNOWN**이다. 이 실패를 관리자 등록 자체의 성공이나 실패로 추정하지 않는다. 정식 upgrade plan/wrong-approval 불변성/실행/backup, RR3 signed HTTP→CPU Worker→fresh Viewer, same-backup restore, restored old-digest authenticated readback은 이 journey에서 **NOT RUN**이다. 자동 전체 재시도는 하지 않았다.

**Owned cleanup·운영 불변:** Receipt-bound cleanup PASS; 해당 nonce가 기록한 host helper child 3개, live 및 restore volume은 모두 부재를 확인했다. 운영 `cad-layout-viewer-app`의 기존 container ID `876103488dcefeeb38cb73261168835f589ab7733dec1d4d2ca41a5bb473c6a4`, image digest, running 상태, StartedAt 및 `/data`의 `cad-layout-viewer-g7` mount가 사전 fingerprint와 일치했다. 이전 RR1 registry container `91f9faedde46ae773427ba19d48d0619dfea4dd1cadc6c85b2eaf61c4cdb9a5a`도 계속 running이었다. 최종 source manifest 전부 재검증 PASS. 운영 App/volume/CAD/DB에는 read-only inspect 외 접근하지 않았다.

세부 실패 산출물은 Git 제외 `data/release-proof/rr2-qa-rx09-rx10-final.json` 및 `data/release-proof/rr2-b0ba7283e6d6dab2/` 아래 receipt/log다. Manager/Root에 정확 실패 단계와 원인 미확인을 보고했다. 재시험 전 최소 다음 조치가 필요하다: disposable 0.60 first-admin POST의 응답 status 및 공개 error code를 비밀/본문 없이 안전하게 포착하여 registration success 문구가 없는 원인을 확인하고, Manager 검토·재승인 후 새 source hash 및 새 nonce로 전체 journey를 처음부터 한 번 실행한다. 이번 결과는 journey PASS, RR2/RR3 완료, hosted RR2 검증으로 승격하지 않는다.

**보존 산출물의 후속 판독:** 재실행 없이 root가 같은 `rr2-b0ba7283e6d6dab2/playwright-results/`의 보존 `error-context.md`에서 role=alert의 고정 code만 안전하게 추출해 **`SETUP_CSRF_DENIED`**를 확인했다. 이는 앞선 QA 보고 뒤 추가된 UI 관측이며 실제 POST status·GET/POST 순서·token/cookie 상태나 근본 원인을 측정한 것으로 소급하지 않는다. 값/body/cookie를 출력하지 않았다. Manager는 TestPlan RX-11의 bounded old-install→first-admin CSRF transport/order 진단만 승인했으며 전체 재시도·assertion 완화·제품/과거 이미지 변경은 승인하지 않았다.

## RR2 RX09–10 — 보완 및 독립 QA 준비 중 (2026-11-06)

Typed old/current image binding·strict inspect·소유 child 추적·cleanup 뒤 최종 PASS·필수 CI 연결을 test-only로 보완하고 있다. 초기 local fresh case3개는 실패/ownedCleanup PASS, 네 번째는 실제8단계/정리 PASS였으나 prelaunch hash가 없어 최종 frozen proof로 승격하지 않는다. 첫 Viewer reload 인증 실패 원인은 UNKNOWN이며 후속 통과로 지우지 않는다. 정확 case/코드·알려진 harness 인자 결함·별도 직접 child timeout 범위는 [FailureLedger](FailureLedger.md)의 RX09–10 기록을 따른다.

현재 host helper→Docker CLI grandchild의 timeout 종료를 owned process group으로 보완 중이다. 이 경로와 최종 byte hash·새 nonce 전체 flow·실제 group/CID timeout은 Manager source review 뒤 독립 QA가 검증해야 한다. 필수 Docker CI에 새 runner를 연결하는 source/YAML/bash 검사는 실제 hosted RR2 PASS가 아니다. 제품/Schema/버전/기능 default·운영 data·GHCR/정책은 변경하지 않는다.

---

## PR238 RR1 통합 — CI639 containerd·Main159·HOLD 확인 (2026-11-06)

**최신 수용:** [CI639](https://github.com/planner77/layoutManager/actions/runs/42053794252)의 적용8 checks SUCCESS/A2 scope SKIP, review/thread0·mergeableclean·behind0를 확인했다. Manager `gpt-6.1-sol`의 RR1 코드 통합 GO 뒤 root가14 paths의 secret/runtime/remote/expected-head/tree를 재감사하고 Draft 해제→예상 HEAD6dba의 squash merge를 수행했다. Main `68c0c951126dbfe9e0c3072982afd502b8443262`, parentd5e/tree2872는 PR source tree와 정확히 같고 제목1줄/본문빈값이다. [Main CI159/run42058616805](https://github.com/planner77/layoutManager/actions/runs/42058616805)은 같은 merge SHA에서 SUCCESS. Scope job127353761069의 실제 `>=0.61.0 code integration, GHCR release on HOLD`, GHCR build/push127353875117 SKIPPED를 확인했다. 준비 전환이 새로 시작한 동일 HEAD의 CI640/run42058611660은 마지막 조회 시 in_progress로 별도이며 성공 근거로 계산하지 않는다. 이후 Root의 API 재조회에서 CI640도 completed/SUCCESS로 확인했지만, 위 통합은 먼저 완료된639와 Main159에 근거하며640 개별 로그를 추가 감사한 것으로 기록하지 않는다.

Root와 독립 QA `gpt-6-luna`가 [CI #639/run42053794252](https://github.com/planner77/layoutManager/actions/runs/42053794252)의 완료된 Docker job127336691625 SUCCESS 및 실제 로그를 각각 조회했다. PR HEAD는 `6dba66ff802a63d14947205bccde23818e3106e1`; archive/build source는 Actions merge commit `9605fd8c7dc84b00db84cd4bf8c62e571d9abc59`다. tree `2872b49d1434687008d5f15c6ec95f0f9f103591`가 PR HEAD tree와 일치한다. 실제 Docker29.4.2/overlayfs/`io.containerd.snapshotter.v1`에서 10 focused tests, 세 role의 `CONTAINERD_TARGET`, `RR1_REGISTRY_PROOF_PASS negatives=6 retained=false` 및 runtime/정리 경로가 통과했다.

| Role | Manifest / engine target ID | Raw config digest |
| --- | --- | --- |
| App | `sha256:c0091e3d576d5afb0c04daaa1a50f44cc1363b5259542851ddee45177287fbec` | `sha256:880b73b2abba2178d08c28aa944815362bca3f9f10ac14e6b08b0436bc83a6d9` |
| Migrator | `sha256:d3238328c9ebeb2ecfa19899eb88ab4cca72fd153bf7d08fbee838bb8b212880` | `sha256:71e6fe2356fd6fa40ea1b3a16c9a90afec2929086dfc712d60f36395c3f98ca2` |
| CPU Worker | `sha256:43d838b47e1e26cd328367c634a9bdaed747a2a3e3a5897e126e02b9042d4a21` | `sha256:4a1491958b243d7a110c408108f2dcb2256690ce021c5376a34acf730e0e447d` |

이 실제 실행은 engine target ID와 config digest를 같은 값으로 취급할 수 없음을 확인했다. 각 값을 typed descriptor→검증 raw manifest/config→RootFS로 연결한 수정이 실제 containerd에서 동작했다. CI638의 당시 inspect 세 값은 여전히 수집되지 않았으며 이 표를 그 과거 실행값으로 소급하지 않는다. 이번 digest는 폐기 가능한 CI loopback registry의 증거이며 GHCR 게시/서명 provenance가 아니다.

후속 actual converter KILL은137/OOMKilled=false, 주입 cgroup OOM은137/OOMKilled=true 및 복구로 통과했다. `OCI_CPU_PROOF_PASS`, `P1D_HTTP_OCI_VIEWER_PASS`의 scenes1/denied3/originalGets0/sceneGets4/freshSessionstrue를 확인했다. Static job127336691503도174 files/1,102 tests·production build SUCCESS다. 중간 관측 시 Chromium shard1 및 aggregate는 미완료였고, 이후 둘 다 SUCCESS로 완료돼 위 통합 수용으로 이어졌다.

Manager `gpt-6.1-sol`은 이 실제 identity 의존 증거를 근거로 최소 RR2 RX09–10 구현→Manager 검토→새 nonce 독립 QA를 조건부 재개했다. 나중에 필수 체크가 실패하면 새 의존 작업은 다시 HOLD하고 이미 시작한 소유 cleanup만 안전하게 마무리한다. Root는 successor를6dba로 fast-forward하고 RF/RP/RX 문서·untracked 코드·시험 자원을 보존했다. Main 통합 후 같은 worktree에 새 `test/issue225-deploy-recovery-main` branch를68c0에서 만들었으며, 두 base tree가 같음을 확인하고18개 tracked/untracked WIP 파일의 전후 SHA256을 대조해 보존했다. 기존6dba branch는 남겼고 원 운영 App의 ID/image/start/running/selected Mounts도 이전 snapshot과 같았다. 원래4개 문서 snapshot과 stash `e37dadbf70dd2d9dc51307d44df624e82148e486`는 남겼으며 원래 사용자 worktree는 변경하지 않았다. 제품0.61.0/flags OFF/GHCR HOLD/GO-PILOT BLOCKED를 유지한다.

---

## RR4 actual inventory — 현재 저장소 actor/workflow와 미확인 package ACL (2026-11-06)

읽기 전용 API 관측 시각은2026-11-05T15:29:57–15:30:43 UTC(2026-11-06 KST)다. 연결 도구가 collaborator/workflow 목록 endpoint를 지원하지 않아 기존 동일 작업의 host registry credential을 메모리 안에서만 사용했다. credential 값·헤더·token은 출력/저장/앱 전달하지 않았고 설정 변경도 하지 않았다. `/user`의 실제 actor는 planner77/id45478892였다.

`GET /repos/planner77/layoutManager/collaborators?affiliation=all&per_page=100&page=1`은200이며 pagination이 종료됐다. 목록은 planner77 한 명, roleadmin/pushtrue였다. 연결 도구의 해당 Owner repository permission도admin이다. 이는 **저장소 collaborator 관측**이며 package의 모든 writer가 Owner뿐이라는 증거는 아니다.

`GET /repos/planner77/layoutManager/actions/workflows?per_page=100`은200/total2/pagination 종료. 당시 정확 Main source `d5ea04daa2573c7f8e2f0f2ee14c3ad53cf23389` 파일과 대조했다. Active355693716 `docker-publish.yml`은 push(main,`v*.*.*`)만 지원하고 workflow_dispatch는 없다. release-scope job은 contentsread, 실제 build-and-push job은 contentswrite/packageswrite이며 scope/HOLD 뒤 실행한다. Active360238531 `pr-ci.yml`은 PR 및 workflow_dispatch를 지원하며 jobs는 contentsread, Docker job만 추가 packagesread다. 임의 oldref dispatch422를 package ACL 거절로 해석하지 않는다.

package14938097의 granular ACL·권한 상속·다른 repository Actions grants·일반 PAT/app writer는 여전히 **NOT VERIFIED**다. 현재 두 workflow/Owner-only collaborator/defaultREAD만으로 이를 채우지 않는다. 사용자에게 현재 package 설정의 상속/Write·Admin/Actions access 목록을 정보 요청했으며 아직 답변 전이다. 실제 우회 주체/trigger가 확인되지 않은 상태에서 신규 PAT/ACL 변경을 필수 작업으로 단정하지 않는다. 정책 초기/최종 JSON은 검토안만 준비했으며 서버 적용0. 근거 receipt는 Git 제외 `publisher-collaborator-readback.json`, `publisher-workflow-inventory.json`, `policy-payload-review.json`; 외부 적용 전 같은 source/actor/설정을 다시 확인한다.

---

## RR1 ID01–06 — 로컬 수정·독립 QA 수용 및 재게시 (2026-11-06)

Manager 대행 `gpt-6.1-sol`은 Developer `gpt-6-sol`의 strict identity/inspect classifier 수정, 집중10 tests, 독립 QA `gpt-6-luna`의 최종 frozen bytes 실제 classic 3-role roundtrip·6음성·3runtime·소유 정리/기존 retained registry 보존을 검토해 추가 로컬 재작업 없이 수용했다. root의 staged/secret/remote/expected-parent 감사 후 Conventional repair commit과 PR #238 fast-forward 게시·새 정확 HEAD CI를 진행하도록 승인했다. 이는 게시/시험의 수용이며 hosted containerd 성공·병합·RR2 재개나 GO-PILOT/출고/정책 적용/Owner GO가 아니다.

실제 로컬 재생의 product/source는 d5e/tree5159이며 수정 test harness는 복제된 uncommitted bytes였다. 새 게시 HEAD의 실제 hosted build/typed descriptor/runtime proof 전 CI #638 실패와 원격 피연산자 UNKNOWN을 보존한다. 상세 명령·해시·판정은 아래 독립 QA 기록, 재개 조건은 TestPlan ID01–06을 따른다. 제품0.61.0/Scene flags OFF/GHCR HOLD 및 운영 자원은 그대로다.

---

## PR #238 / RR1 — CI #638 실패와 독립 수정 HOLD (2026-11-05)

[PR #238](https://github.com/planner77/layoutManager/pull/238)의 HEAD `f886af25dadb13f679c14d04319373b04de1108b`, [CI #638/run42046556655](https://github.com/planner77/layoutManager/actions/runs/42046556655)은 **completed/FAILURE**다. QA `gpt-6-luna`와 root가 원격 job/log를 독립 조회했다. 적용 8개 checks 중 Classify·Static·G7 Greenfield·G7 signed runtime/legacy·General Chromium 두 shard 6개 SUCCESS, Docker 및 aggregate 2개 FAIL; A2는 scope SKIPPED. Static은 174 files/1,102 tests PASS(145.05초), TypeScript/production build PASS, lint 0 errors/기존12 warnings다.

Docker job127311079287의 Step14 `Verify immutable three-role OCI registry roundtrip`이 2026-11-05T14:48:23Z에 `RR1_PROOF_FAILED RR1_PULL_CONFIG_ID_MISMATCH`, exit1로 종료했다. 첫 App의 push/raw manifest/config/layer 조회/digest pull 이후 `pulled Id == clean-build Id == config digest` 비교에서 멈췄고 role 완료 마커는 없다. 세 비교값을 출력하지 않아 어느 피연산자가 다른지는 아직 **UNKNOWN**이다. 후속 converter/P1D/size/legacy smoke는 이 실행에서 NOT RUN이며 과거 PASS로 대체하지 않는다.

CI archive source는 Actions merge ref `b57f703d5fae7783da740bf3c583e97cb6aa2449`다. tree `f5c4088cfb944cbc6694ca3be87b84a7f77add6a`가 PR HEAD tree와 일치하지만 commit SHA 자체는 다르다. 실제 CI Docker29.4.2는 overlayfs/containerd snapshotter, 로컬29.8.0은 classic overlay2였다. Build action의 App ImageID/manifest는 `sha256:a6b7080603a7bcf131ed5c942b813f2b665d79e1008e341abf7646789ad1bfa1`, exported config는 `sha256:368a012f274088fc2f393f5e69e976fad117400dd5553cd5136413725f605471`로 서로 다르다. 이 action 출력값을 실패한 inspect 값과 동일하다고 단정하지 않는다. [Moby containerd 구현](https://github.com/moby/moby/blob/master/daemon/containerd/image_inspect.go)은 inspect ID를 target descriptor digest로 구성한다. 이 표현 차이는 조사 가설이며 해당 원격 피연산자 검증 전 원인 확정이 아니다.

**빠른 RED 재현:** Developer가 별도 fix worktree에서 `python3 src/tests/oci/rr1-image-identity.test.py -v`를 실행해 classic config-ID case PASS 및 synthetic containerd descriptor/manifest-ID case의 기존 equality 오류 `RR1_PULL_CONFIG_ID_MISMATCH`를 확인했다. 이는 공식 target-ID semantics를 모델링한 fixture이며 CI inspect 원문을 확보한 것으로 기록하지 않는다. 로컬 retained registry의 실제3 roles는 Descriptor 부재/Id=config SHA/RootFS·config 일치가 재확인됐다. 우선 가설은 (1) target-ID 표현 차이, (2) push/pull manifest 변환, (3) 빌드/pull 이미지 불일치 순서이며 descriptor·config·RootFS 연결 검증과 실제 원격 후속 실행으로 구분한다.

**정리 오류의 판정 보완:** root의 정적 검토에서 새 smoke 정리 및 기존 inspect 경로가 모든 nonzero 응답을 미존재로 처리하는 모호성을 확인했다. 실제 daemon 장애가 발생한 것으로 기록하지 않는다. Manager는 ID05 범위 안에서 요청한 kind/name의 명확한 미존재와 연결/권한/timeout/잘못된 출력을 구분하는 test-only 최소 수정을 지시했다. 조회 실패는 고정된 안전 오류로 남기며 cleanup PASS로 바꾸지 않는다. 이미 실제로 확인한 소유 자원 부재 결과는 그대로 보존하고 최종 frozen bytes의 독립 QA를 다시 수행한다.

Manager 대행 `gpt-6.1-sol`은 RR1 통합 및 새 의존 RR2 작업/수용을 HOLD하고 별도 `layoutManager-issue225-rr1-fix` worktree에서 최소 identity repair를 지시했다. strict typed descriptor→검증한 manifest/index-child→raw config SHA→RootFS 연결과 role/source/version/arch/pair·runtime·cleanup 검증을 보존한다. 재현 회귀·로컬 actual classic roundtrip·독립 QA·새 정확 HEAD hosted/containerd roundtrip 성공 전 재개하지 않는다. 이미 시작된 RR2 fresh-nonce 실행은 소유 cleanup까지 안전하게 끝내도록 허용했으며, 그 결과와 독립 QA/CI 미완료는 후속 RR2 기록으로 구분한다. 기존 RR1 로컬 QA PASS는 보존한다. 제품0.61.0/flags OFF/GHCR HOLD/GO-PILOT BLOCKED 및 운영 App 불변이다.

---

## RR1 independent QA — 3-image loopback registry — 2026-11-05

**판정:** RR1의 clean-source registry roundtrip은 독립 로컬 시험으로 PASS. 이는 실제 GHCR 배포, 서명 provenance, 운영 release 승인이나 overall GO가 아니다. 실행한 branch는 `test/issue225-release-rehearsal`, HEAD `d5ea04daa2573c7f8e2f0f2ee14c3ad53cf23389`, tree `5159b630a34de59cd84a902d035ebea66c26a16e`다. TestPlan/TestReport와 harness 자체는 uncommitted test snapshot이지만 세 빌드 이미지의 입력은 이 고정 Main commit의 Git archive(`365d1a6e6c38eb218d7b750c26284bf84000646fc5193641504ae9d150149702`)였다. 기존 clean-build receipt가 source archive, Dockerfile, package-lock, 명령 및 role별 image ID를 연결했으며 proof script가 이를 다시 검증했다. 이미지 빌드를 반복하지 않았다.

**실제 registry proof:** `python3 src/tests/oci/rr1-registry-proof.py --build-receipt data/release-proof/rr1-input.json --output-receipt data/release-proof/qa-rr1-registry-receipt.json`가 exit 0, `RR1_REGISTRY_PROOF_PASS negatives=6 retained=false`로 완료됐다. 새 registry는 loopback `127.0.0.1:32771`에서만 노출됐다. 세 tag 모두의 raw manifest bytes SHA-256이 `Docker-Content-Digest`와 일치했고, 다운로드한 config 및 각 layer bytes/digest/size를 확인했다. 이 build는 각 role에 단일 linux/amd64 manifest를 사용해 index-child가 없었다. Digest-pinned pull에서 config digest, pulled image ID, clean-build local image ID가 일치했다. 최종 receipt의 manifest/config digest: App `sha256:8719ae684bb33b3a8df075fd40aab11b8244ddbe2e164ce21bdccc2c87df7388` / `sha256:a6337266e1e3af8b284de43cf1bd6d5380725b0b93c8b80f5d5680a747855557`; Migrator `sha256:c41b8f7041d24b6e004290401452c8b189e0841bb85121b3fd98ca16531962a6` / `sha256:d27a70456ee3ac2435c38177525beef49db50c324ece4732836cc3d9a517fb5d`; CPU Worker `sha256:2c49b5640913ff3a72232426877e92d213424386ef18c9d50586195979072e3e` / `sha256:2b933b2fd1442ba73e54cb7fa428e5ee0e53408734dff8ddfd74b94f333ff8dc`. Unique roles/source/version/arch and `g7-upgrade.py.inspect_pair` checks passed. All three digest-pinned runtime closure probes exited 0 with UID10001, network none, read-only root, dropped capabilities, no-new-privileges, CPU 1, RAM 768 MiB, PIDs 64, and no published ports. The probes verify role-specific file/dependency access; they are not full application health or HTTP/workflow deployment tests.

Six negative cases were rejected: role swap, bad source, bad version, missing worker, validator tampered digest, and a changed digest that received real registry HTTP 404. The run owned nonce `0d2510558e3c81b6`, registry CID `170a7c7e944b614cd71ed700e8a7e7fb14176f7763c170d4621abe2b66211cac`, network and volume bearing the same nonce; `retainedForR2=false`. Its exact container/network/volume and pushed tag/digest refs were absent after cleanup. The earlier retained R2 registry (`91f9faedde46ae773427ba19d48d0619dfea4dd1cadc6c85b2eaf61c4cdb9a5a`, host `127.0.0.1:32768`) remained running and untouched. Detailed local receipt/log are Git-ignored `data/release-proof/qa-rr1-registry-receipt.json` and `qa-rr1-registry.log`.

**CI receipt helper/static checks:** `rr1-ci-source.py prepare` and `finish` both passed against a new QA archive directory and the same three verified image IDs. Before creating temporary aliases, the three shared `cad-layout-viewer:ci*` tags were confirmed absent; aliases were removed afterward and confirmed absent. `rr1-registry-proof.check_build_receipt` accepted the resulting CI_GIT_ARCHIVE-mode receipt for all roles. This tests receipt helper behavior and archive/image matching only; it does not claim an actual GitHub Actions run or that its recorded build-push action commands executed. `python3 -m py_compile` for both new helpers, PyYAML parse of `.github/workflows/pr-ci.yml`, and `git diff --check` passed. `src/`에서 `npx vitest run tests/unit/scene-cpu-release-contract.test.ts tests/unit/scene-cpu-worker-current-release.test.ts tests/unit/issue218-release-contract.test.ts tests/unit/issue216-release-contract.test.ts`가 4 files / 6 tests PASS (1.11s). No source build, product/schema/version/flag change, commit, external write, GHCR operation, or tag operation occurred.

**Manager 수용 및 root 정적 검사:** Manager `gpt-6-astra`가 이 목표에서 두 차례 capacity 오류로 실행 불가해 실제 Manager 대행 `gpt-6.1-sol`이 요구/AC·Developer 결과·독립 QA를 검토하고 RR1 독립 PR 게시를 수용했다. 지정되지 않은 역할을 실행한 것으로 기록하지 않는다. root의 전체 TypeScript PASS, 전체 lint PASS(0 errors/기존 12 warnings), 세 clean-source Docker target production build PASS를 확인했다. 정확 게시 HEAD의 hosted CI는 게시 후 별도 판정하며 RR2 및 서명 provenance/실제 정책 적용/Owner GO는 이 PR 완료로 계산하지 않는다.

**남은 acceptance:** This supports RR-01–03 only for the loopback candidate distribution and its five validator negatives plus registry 404. RR2 actual GHCR 0.60 install/upgrade/restore/start and RR3 current candidate signed HTTP→Worker→Viewer remain unverified; RR4 actual effective policy/authority and gate behavior remain incomplete; RR5 signed release provenance and Owner GO remain blocked. Receipt is explicitly unsigned and loopback-only. Current product `0.61.0`, both Scene flags OFF, `>=0.61` GHCR HOLD, #225/#218/#231 OPEN, and GO-PILOT BLOCKED remain unchanged; exact-head hosted CI was not verified in this QA run.

---

## #225 실제 배포·복구·릴리스 통제 목표 — 기반 증거 재확인 (2026-11-05)

**범위와 상태:** 새 활성 목표의 전체 잔여는 TestPlan TP-225-RELEASE-RECOVERY RR1–RR5를 따른다. 실제 배포/복구 artifact와 외부 통제를 끝까지 검증하며 로컬 label/합성 과거 Schema만으로 완료하지 않는다. 이번 목표 직전 작업은 실제 테스트·커밋·원격 PR 상태를 바꾼 progress였다. 현재 목표는 ACTIVE이며 전체 완료 판정 전이다.

**선행 완료의 최신 근거:** PR #237은 정확 HEAD `91ea3722298319f25dba61fd2f827d4bbd8114a5`의 [CI #636](https://github.com/planner77/layoutManager/actions/runs/42030130356) completed/SUCCESS 후 Main `d5ea04daa2573c7f8e2f0f2ee14c3ad53cf23389`에 이미 병합됐다. Root가 새 목표 재개 시 외부 상태를 확인했으며 이번 재개에서 직접 병합한 것은 아니다. 적용8 jobs SUCCESS, A2는 scope SKIPPED. Quality Job127254265665 로그는 **174 files/1,102 tests PASS**, Docker Job127254265603은 실제 KILL137/OOMKilled=false·주입 OOM137/OOMKilled=true 및 `OCI_CPU_PROOF_PASS`, `P1D_HTTP_OCI_VIEWER_PASS`를 포함한다. [Main CI #158](https://github.com/planner77/layoutManager/actions/runs/42033395175)도 같은 merge SHA에서 SUCCESS다. 이전 로컬 전체1101/1102 실패와 원인 UNKNOWN은 보존하며 CI 성공을 원인 규명으로 바꾸지 않는다.

**실제 과거 artifact 확보:** GHCR의 기존 0.60.0 App index `sha256:c5d133a0335d3f8391f499880a3e8d38e197375b3cc298118e2701f2796aaf2c`, Migrator index `sha256:1680f36e05cf45f9630ba4b3de182e3391a6d04190fa9b7093a6bf289d6b9128`를 실제 registry에서 읽고 해당 digest로 pull했다. Config/image ID는 각각 `sha256:35b433994c31d997adfc131b7c6102c294cd50e4152f95c2c68c6dca6fbdf78f`, `sha256:b334eb507ca1919f37c10d4c91c566734ffccfb38951b2a2bcfc34ba04ab30ee`. 두 role·version0.60.0·linux/amd64·source9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63 일치. 실제 원격 annotated `v0.60.0` tag 객체464dc5b5c7efe32e98ac92cd1cfc38cae29a1e02의 peel도 같은 source다. GHCR HTTP raw App manifest SHA와 Docker-Content-Digest가 일치했다. 이는 재빌드 artifact가 아니다. 인증된 읽기이며 익명 token 요청은401이었다. 실제 이 이미지 설치/rollback은 RR2 후속 실행 전이다.

**현재 후보의 clean build:** 고정 Main d5ea04d/tree5159b630a34de59cd84a902d035ebea66c26a16e의 Git archive SHA256 `365d1a6e6c38eb218d7b750c26284bf84000646fc5193641504ae9d150149702`를 추출한 동일 context에서 App/Migrator/CPU Worker target 세 개 build PASS. 실제 source archive·Dockerfile/lock SHA·명령·각 image ID는 Git 제외 `data/release-proof/rr1-clean-build-receipt.json` 및 `rr1-input.json`에 남겼다. 이 receipt는 자가 build 추적이며 독립 서명 provenance가 아니다. RR1 registry source와 독립 QA/새 정확 HEAD CI 결과는 후속 기록으로 구분한다.

**RR4 실제 readback:** Rulesets `includes_parents=true` 응답200/[]; branch Main metadata `protected=false`/checks off. 연결 도구의 legacy protection read는403이었으나 같은 task의 기존 host registry credential로 수행한 read-only API는404였다. 실제 package14938097 `layoutmanager`는 PRIVATE, environments200/total_count0, workflow defaults200/read·canApprovePRfalse. credential의 관련 OAuth scope에 repo/workflow/write:packages가 있지만 effective package writer grant·실제 push 허용은 **NOT VERIFIED**이며 GHCR push는 수행하지 않았다. 현재 기본 read만으로 명시적인 과거 workflow packages:write를 통제했다고 주장하지 않는다. 값/인증 헤더/응답 token은 메모리 안에서만 처리했으며 출력/저장/앱 전달하지 않았다. 과거 `.env` 인증401이나 connector 미지원400과 새 실제 readback200을 혼동하지 않는다.

**후속과 불변:** 실제 registry proof·기존0.60 설치/정식 upgrade/현재HTTP→Worker→Viewer·같은 backup을 원본0.60 App으로 복구/기동·정책의 실제 적용/거절·정식 provenance/Owner GO는 RR별로 계속 검증한다. `src/deploy/release-control/`의 JSON 두 개는 **정책 검토안만 작성, 미적용**이다. 제품0.61.0, 두 Scene flags OFF, >=0.61 GHCR HOLD, #225/#218/#231 OPEN 및 GO-PILOT BLOCKED를 유지한다. 원래 worktree의 두 변경은 보존하고 별도 `test/issue225-release-rehearsal`에서 진행한다.

---

## RR1 identity repair independent QA — 2026-11-06

**판정:** 고정된 identity/cleanup helper bytes로 실제 classic Docker Registry V2 3-role roundtrip과 owned cleanup을 PASS했다. 이는 local Docker Engine `29.8.0 overlay2` 증거다. CI #638의 Docker 29.4.2/containerd failure를 통과로 대체하지 않으며, fixed exact-head hosted containerd proof 전 RR1 통합과 RR2 실행은 계속 HOLD다.

**확인한 bytes/source:** fix branch HEAD `f886af25dadb13f679c14d04319373b04de1108b`, tree `f5c4088cfb944cbc6694ca3be87b84a7f77add6a`; source/product input은 receipt가 고정한 Main `d5ea04daa2573c7f8e2f0f2ee14c3ad53cf23389`, tree `5159b630a34de59cd84a902d035ebea66c26a16e`, immutable clean archive/images다. Fix checkout의 test harness/helper는 uncommitted 상태이며 이미지는 다시 빌드/재태그하지 않았다. frozen `rr1-registry-proof.py` SHA-256 `afc04d578f5c6ca3f68e8a65f151f889ad88379b1f66ab2c11862d8a36c7af0d`; `rr1-image-identity.test.py` `bdb710bbc8e4d31e36baeef3ca7d45e93c1fe07c7c15f1b61c3cb12aedbfec34`; workflow `pr-ci.yml` `f7e5e5b5c4425de5fce3dc2d12082d3e95216164c64649e8c22ba59238e39d18`. Detached replay worktree verified HEAD/tree equal d5e source base and received only the two exact test/helper bytes.

**Focused checks:** From fix worktree root, `python3 src/tests/oci/rr1-image-identity.test.py` passed 10 tests; `python3 -m py_compile src/tests/oci/rr1-registry-proof.py src/tests/oci/rr1-image-identity.test.py` passed. Repeated both commands from the d5e replay worktree after copying and hash-verifying those same final bytes; again 10/10 and compile pass. Tests exercise accepted classic config-ID/containerd descriptor identities and reject malformed/unknown descriptors, digest/media/size/ref/RootFS/config/source/role/runtime-node mismatches, raw manifest/config byte hash changes, and daemon/auth/timeout/malformed inspect failures. The exact Docker not-found result is accepted; non-not-found errors are not treated as absence.

**Actual classic registry run:** In detached `/home/planner/Dev/layoutManager-issue225-rr1-replay` at d5e/tree5159, command `python3 src/tests/oci/rr1-registry-proof.py --build-receipt /home/planner/Dev/layoutManager-issue225-release/data/release-proof/rr1-input.json --output-receipt /home/planner/Dev/layoutManager-issue225-release/data/release-proof/qa-rr1-final-identity-receipt.json` completed exit 0: `RR1_REGISTRY_PROOF_PASS negatives=6 retained=false`. Fresh loopback was `127.0.0.1:32773`, nonce `5592f1175484ceac`; each role logged `identity=CLASSIC_CONFIG`. App manifest/config: `sha256:8719ae684bb33b3a8df075fd40aab11b8244ddbe2e164ce21bdccc2c87df7388` / `sha256:a6337266e1e3af8b284de43cf1bd6d5380725b0b93c8b80f5d5680a747855557`; Migrator: `sha256:c41b8f7041d24b6e004290401452c8b189e0841bb85121b3fd98ca16531962a6` / `sha256:d27a70456ee3ac2435c38177525beef49db50c324ece4732836cc3d9a517fb5d`; CPU Worker: `sha256:2c49b5640913ff3a72232426877e92d213424386ef18c9d50586195979072e3e` / `sha256:2b933b2fd1442ba73e54cb7fa428e5ee0e53408734dff8ddfd74b94f333ff8dc`. The six negative cases, digest-pinned pull, role/runtime checks, and three constrained digest runtime probes passed. Independent post-run check confirmed this run's exact container/network/volume, smoke containers, push tags, and digest refs absent. The prior retained R2 registry CID `91f9faedde46ae773427ba19d48d0619dfea4dd1cadc6c85b2eaf61c4cdb9a5a` at `127.0.0.1:32768` remained running and unchanged. Local receipt/log are Git-ignored under `data/release-proof/qa-rr1-final-identity-receipt.json` and `qa-rr1-final-identity.log` in the release worktree.

**남은 구분:** CI #638 failed at `RR1_PULL_CONFIG_ID_MISMATCH` on hosted containerd; this local overlay2 replay demonstrates the classic-config branch only. Synthetic containerd unit cases are not actual hosted daemon proof. A new exact-head CI with real containerd descriptor/runtime fields must complete RR1 before RR2/RR3 work resumes. RR4/RR5, signed provenance, GHCR publication, policy application, and Owner GO remain incomplete. Product `0.61.0`, both Scene flags OFF, `>=0.61` GHCR HOLD, #225/#218/#231 OPEN, GO-PILOT BLOCKED unchanged. No commit, push, external write, daemon/configuration change, production resource access, or RR2 journey was performed.

---

## #225 GO-PILOT converter fault independent QA — 2026-11-05

**판정: OCI fault/recovery 증거 PASS, GO-INTEGRATE/GO-PILOT 전체 검증은 미완료.** 독립 QA는 작업 트리의 test-only snapshot을 base/source revision `23c161b43d0776ee3f98fda50d2847a20dc08443`에서 확인했다. 이 실행은 GitHub hosted CI가 아니라 `GITHUB_ACTIONS=true`, `GITHUB_EVENT_NAME=pull_request`, local simulation run ID `202611050229`로 실행한 로컬 OCI 시험이다. 요청된 `gpt-5.6-sol` Developer 및 `gpt-5.6-luna` QA는 사용 불가하여 각각 `gpt-6-sol` 및 `gpt-6-luna`가 대행했다. `gpt-6-astra`는 요청된 Manager 역할이다.

**독립 시험 결과:** 세 로컬 이미지의 revision label과 image ID를 확인했다: App `sha256:3543cc54e373998bae1ea345a04c58f3de5ec20ad85fd67e77ef37547285f640`, Migrator `sha256:c6c20f7b41c797e88d475f9593b35fe7bfa8aafb7d3ec467c9fa10cf6e5373b9`, CPU Worker `sha256:8ee2d6d447c927bb3ba19d206c300c69d6f872b3e78cab7fe26e4ef4ef0732c5`. Fresh disposable OCI proof completed `OCI_CPU_PROOF_PASS`: actual converter call frame and LINE processing were observed, with execution paused at the parser's final return statement before returning to the DTO builder; each fault was injected at that point. Converter SIGKILL returned wait/inspect 137 with `OOMKilled=false`, and separate constrained-container injected cgroup OOM returned 137 with `OOMKilled=true`. Both preserved durable RUNNING/no-partial-assets/audit and prior CurrentScene/SceneAsset/Audit/source bytes, then stale→retry→due recovery published READY on attempt 2 with fresh readback and a subsequent IDLE run. A fresh isolated restore read all four READY Scenes successfully. Test-owned containers and volume were absent after completion. Full proof log: `data/go-pilot-verification/qa-oci.log` (git-ignored runtime evidence).

**정적·관련 회귀:** `npm run typecheck` PASS. Full `npm run lint` PASS with 0 errors and 12 existing warnings. Correct-path G7/Worker regression command from `src/`: `npx vitest run tests/integration/g7-greenfield-auto.test.ts tests/integration/g7-greenfield-upgrade.test.ts tests/integration/g7-scene-worker-upgrade-recovery.test.ts tests/integration/scene-cpu-worker-real-g7.test.ts` passed 4 files / 24 tests (31.10s). CPU unit tests were separately run from `src/` with `npx vitest run tests/unit/scene-cpu-line-candidate.test.ts tests/unit/scene-worker-publish.test.ts`: 2 files / 15 tests PASS (1.39s). An earlier QA invocation incorrectly specified two G7 files under `tests/unit`; Vitest consequently ran only the four existing matched files for 23 tests. That count is superseded by the two correct-path commands above and is not treated as G7 auto/upgrade coverage. `git diff --check` PASS. Root's earlier full-suite run remains recorded as **1,101 passed / 1 failed across 174 files**: `g7-greenfield-auto.test.ts:113` expected 403 but received 503 (`G7_SETUP_UNAVAILABLE`, cause unresolved); its separate isolated rerun passed 3/3. Focused PASS does not erase or explain that full-run failure. No broad suite rerun was done.

**수용 기준과 미완료 경계:** CF-01–05 local OCI/fault/recovery evidence and relevant static/focused regressions passed. CF-06 remains BLOCKED: only local images were verified; no registry manifest digest, provenance, or historical-image rollback evidence. CF-07 remains NOT VERIFIED for GHCR authority: Rulesets GET and `includes_parents=true` both succeeded with `[]`; workflow-permissions/environments endpoints were unsupported (400), and the separate configuration-auth read returned 401. CF-08 exact-HEAD hosted required CI is pending; local simulated CI inputs do not substitute. Natural parser memory exhaustion, production 3-image release/rollback, and field acceptance remain untested. Product version `0.61.0`, both Scene flags OFF, `>=0.61` GHCR HOLD, #225/#218/#231 OPEN, and GO-PILOT BLOCKED remain unchanged. No product/schema/Dockerfile/version/flag changes, commit, push, PR creation, merge, or release was made.


**Manager 최종 수용·root 인계:** `gpt-6-astra`는 Developer local run228과 독립 QA run229, 정정된 Unit 2 files/15 tests 및 G7 integration 4 files/24 tests를 검토해 추가 제품 수정 없이 candidate commit·독립 PR 게시·필수 CI 시작을 수용했다. 전체 Unit 최초 실패는 UNKNOWN으로 보존하며 정확 HEAD hosted CI 전 GO-INTEGRATE 수용은 보류한다. 이번 요청은 병합/운영 배포/GHCR·tag 변경 승인이 아니다.

**환경·추적·문서:** Linux 6.6.87.2 WSL2 x86_64, Node22.14.0/npm11.10.0, Docker29.8.0, linux/amd64 시험 이미지. Root의 세 Docker target production build/TypeScript는 모두 PASS, CI scope/release-hold Python 검사 13개도 PASS였다. 제품 closure는 base23c161b와 동일하며 새 test-only helper는 읽기 전용 mount로 실행했다. FR-218-L02/L03·NFR-218-L01 → TestPlan CF-01–08 → OCI helper/fixture/proof 및 기존 required CI → 위 실제 결과로 추적한다. Requirements/API/DB Schema/제품 Architecture·Viewer 메뉴 계약 변경은 N/A다. TestPlan/Issue225/Operation/Decisions/README/ChangeLog와 FailureLedger를 갱신했고, root는 secret/runtime 산출물 제외·staged tree/expected parent 검증 후 같은 지정 remote에 게시한다. 다음 Gate는 새 정확 HEAD 필수 CI, 정식 registry 3-image provenance/digest·과거 OCI rollback 및 #231 보호/권한 증거이며 GO-PILOT BLOCKED다.

---

## TP-225-CONVERTER-FAULT — #231 읽기 전용 상태 확인 (2026-11-05)

Root 확인 시각: 2026-11-05 12:07 UTC. 연결 GitHub 도구의 `GET /repos/planner77/layoutManager/rulesets` 및 `?includes_parents=true` 응답은 성공/`[]`였다. 이 조회에서 반환된 Ruleset은 없으며 활성 Tag Ruleset의 대상·bypass·비인가 tag 거절 증거도 확보하지 못했다. 실제 tag 생성/이동/삭제 시험이나 관리자 설정 변경은 하지 않았다. **#231 OPEN, GO-PILOT BLOCKED**를 유지한다.

GHCR 쓰기 권한/보호 환경 확인은 **NOT VERIFIED**다. 연결 도구가 workflow permissions/environments 조회를 HTTP 400(지원하지 않는 endpoint)으로 거절했고, 기존 `.env` 인증을 사용하는 별도 읽기 시도는 rulesets/environments/workflow permissions/package 모두 HTTP 401이었다. 401을 설정 부재로 해석하지 않는다. 연결 repository metadata의 `admin=true`도 실제 GHCR 권한·출고 승인 증거가 아니다. 기존 `.env` 값은 출력/변경하지 않았다.

Git push dry-run은 기존 설정 인증으로 exit128(인증 거절)이었다. 최종 게시에는 같은 지정 repository의 연결 GitHub 도구를 사용하고, 검토한 local tree·expected parent와 원격 commit/tree를 대조한다. 이는 원격 새 PR 게시 방법의 변경이며 운영·GHCR·tag 쓰기 허가가 아니다. 새 converter fault 시험은 구현/실행 전이므로 이 기록에서 PASS로 계산하지 않는다.

---

## PR236-GI — #225 populated G7 upgrade/recovery GO-INTEGRATE 확정 (2026-11-05)

**역할과 승인:** 이번 통합은 사용자가 명시적으로 승인해 기존 TP-225-UPGRADE-RECOVERY UR-07의 `새 CI 시작까지만` 제한을 **PR #236에 한해** 확장했다. Manager `gpt-6-astra`가 GI-01–06 범위·AC를 정하고 병합 전 근거를 수용했다. Developer `gpt-6-sol`이 이 문서 변경을 기록한다. 독립 QA의 이번 통합 판정은 별도 결과로 기록한다. 지침의 `gpt-5.6-sol`/`gpt-5.6-luna`는 제공되지 않아 실행하지 않았으며 이전 Unit QA 기록은 그대로다.

| AC | 실제 근거·판정 |
| --- | --- |
| GI-01 | [PR #236](https://github.com/planner77/layoutManager/pull/236) exact source HEAD `893ec1b0e6c30e41c7bebc9d60448252ae95a990`, [PR CI #634/run 42005042169](https://github.com/planner77/layoutManager/actions/runs/42005042169) completed/SUCCESS. 9개 check 중 적용 8개 SUCCESS, #218 A2 scope SKIPPED. Static Job `127169616270`: 174 files/1,102 tests PASS(신규 2 포함), TypeScript/Lint/Build/benchmark SUCCESS. Docker Job `127169616069`: `OCI_CPU_PROOF_PASS`, `P1D_HTTP_OCI_VIEWER_PASS`; scenes=1, denied=3, originalGets=0, sceneGets=4, freshSessions=true. **PASS** |
| GI-02 | review 0, 미해결 thread 0, conflict 없음/mergeable clean, Main behind 0. **PASS** |
| GI-03 | 9 paths = 신규 test 1 + Markdown 8; secret/runtime 위반 0, diff check PASS. **PASS** |
| GI-04 | Draft 해제 후 예상 HEAD `893ec1b...`를 squash 병합. Main merge commit `323fa4b0a0c8b69ab158fdf18a8363ba9e16c6ca`, parent `e9eb2e93ff8e8d2f967de30200ee6da6459c5cc4`; Main tree `745dc5f2563cf591ae05bb890ccffe689099210f`는 PR HEAD tree와 일치. **PASS** |
| GI-05 | [Main CI #156/run 42009205686](https://github.com/planner77/layoutManager/actions/runs/42009205686) exact merge SHA `323fa4b...` completed/SUCCESS. Release scope Job `127183595453`의 `Issue #229: >=0.61.0 code integration, GHCR release on HOLD`; Build and push to GHCR Job `127183672098` SKIPPED. 이는 GHCR 게시 성공을 뜻하지 않는다. **PASS** |
| GI-06 | 제품 버전 0.61.0, `SCENE_AUTO_BUILD_ENABLED=OFF`, `SCENE_CPU_WORKER_ENABLED=OFF`, >=0.61 GHCR HOLD, #225/#218/#231 OPEN, GO-PILOT BLOCKED. 기존 실패·취소/당시 NOT VERIFIED 기록을 보존. 제품·Schema·운영 `.env`/DB/CAD/Volume/GHCR/tag/release 및 GitHub issue 상태 변경 없음. **PASS** |

**동시 실행 상태:** Draft 해제의 `ready_for_review` 이벤트가 같은 HEAD에서 [PR CI #635/run 42009186819](https://github.com/planner77/layoutManager/actions/runs/42009186819)를 추가로 시작했다. 기록 시점에는 **in_progress / NOT VERIFIED**다. #634의 완료 결과로 승인 병합했으며 #635를 성공 또는 실패로 계산하지 않는다.

**독립 QA — PR236-GI (gpt-6-luna, 2026-11-05):** GI-01–06 기록을 로컬 merge/source tree와 GitHub read-only 근거에 대조했다. PR #236은 `893ec1b...`를 source HEAD로 `323fa4b...`에 병합됐고 양쪽 tree hash는 `745dc5f...`로 같다. PR CI #634의 9개 job 중 적용 8개가 SUCCESS, A2 scope는 SKIPPED; Main CI #156의 정확 merge SHA job은 SUCCESS이며 release-scope log에 `>=0.61.0 code integration, GHCR release on HOLD`, GHCR build/push job은 SKIPPED로 확인했다. PR은 merged/closed, reviews 0, unresolved review threads 0이며 #225/#218/#231은 OPEN이다. 현재 worktree 차이는 문서 6개뿐이고 `git diff --check` PASS다. 새 제품 테스트는 문서 전용 변경에 불필요하여 실행하지 않았다. #635는 조회 시 여전히 in_progress로 확인해 완료 판정에 포함하지 않는다. **문서 QA PASS; 독립적으로 재확인하지 못한 과거 pre-merge behind/conflict snapshot은 기존 GI-02 기록을 근거로 삼았다.**

**Manager 최종 수용 (gpt-6-astra):** root의 정확 HEAD·병합·Main CI 근거와 Developer 문서 변경, 독립 QA PASS를 검토해 GI-01–06 및 문서 6개를 추가 재작업 없이 수용했다. #635는 별도 진행 중 실행으로 판정에서 제외하며 기존 GHCR HOLD·GO-PILOT BLOCKED를 유지한다. root가 최종 staged/secret 감사를 마친 뒤 문서 commit/push를 수행한다.

**증거 경계:** 이 통합은 합성 0.60 populated source fixture의 실제 plan/backup·0.61 migration·Node Worker·격리 restore를 다루는 test-only 코드다. 실제 과거 OCI 0.60 설치/현장 승인 upgrade·restore, 변환 내부 mid-conversion KILL/OOM, 공식 App/Migrator/Worker 3-image provenance/digest/rollback 및 Tag Ruleset 완료는 검증하지 않았다. #229 이슈 상태와 별개로 >=0.61 GHCR HOLD 정책은 유효하다. `Requirements`, `Architecture`, `Database`, `Operation` 계약 변경은 N/A. 아래 TP-225-UPGRADE-RECOVERY QA의 당시 `exact 새 HEAD CI 아직 없음`과 UR-07 계획은 작성 시점의 사실이며 이번 완료 기록이 최신 판정이다.

---

## #225 / TP-225-UPGRADE-RECOVERY — 독립 QA 결과 (2026-11-05)

- **역할:** Manager `gpt-6-astra`가 UR-01–UR-07 요구/설계/AC를 기록하고 Developer `gpt-6-sol`의 test-only 변경을 검토·QA 승인했다. QA `gpt-6-luna`가 소스/기준을 독립 대조하고 실행했다. 지침에 기재된 `gpt-5.6-sol`/`gpt-5.6-luna` 모델은 이번 세션에서 사용할 수 없어 실제 사용 모델을 기록한다.
- **변경 검토:** 유일한 코드 변경은 `src/tests/integration/g7-scene-worker-upgrade-recovery.test.ts`다. 두 테스트가 UR-01–06의 populated Browser QUEUED/READY 데이터 보존, 승인된 정확 0.60→0.61 migration 및 checksum history, 격리된 CPU Worker 처리, 같은 backup의 isolated restore, corrupt backup/nonempty target 거절을 확인한다. Scene READY의 기존 데이터는 유효한 v1 empty Group scene이므로 DXF geometry 보존 주장을 하지 않는다. fixture는 현재 설치에서 구성한 synthetic 0.60 상태이며 역사적 OCI 설치나 실제 운영 환경이 아니다. 제품/Schema/flag/CI/package 변경은 없다.
- **독립 실행:** `src/`에서 `npx vitest run tests/integration/g7-scene-worker-upgrade-recovery.test.ts tests/integration/g7-greenfield-upgrade.test.ts tests/integration/g7-greenfield-upgrade-qa.test.ts tests/integration/scene-cpu-worker-real-g7.test.ts tests/integration/scene-persistence.test.ts` — **5 files / 42 tests PASS**, Vitest duration 32.90s (실행 벽시계 31.83s). `npx tsc --noEmit` PASS (3.70s), 변경 테스트 `npx eslint tests/integration/g7-scene-worker-upgrade-recovery.test.ts` PASS (1.58s). 전체 ESLint는 root 실행에서 **0 errors / 기존 12 warnings**이며, production build PASS로 root가 확인했다. 실행 로그는 Git 제외 `data/225-upgrade-verification/qa-related-42.log`, `qa-typecheck.log`, `qa-changed-lint.log`, `lint.log`, `build.log`와 Developer 집중 실행 `developer-focused-final.log`에 있다.
- **한계/게이트:** 이 source-level 시험은 실제 이전 OCI 이미지 기동·운영자 승인·현장 복구, HTTP/Viewer, 변환 중 KILL/OOM, 3-image 출고를 검증하지 않는다. 이 QA는 기존 관련 40 tests에 신규 2 tests를 더한 범위이며 전체 1,100여 테스트나 Docker 시험은 실행하지 않았다. exact 새 HEAD hosted CI는 아직 시작/결과가 없고 QA 범위 밖이다. 제품 `SCENE_AUTO_BUILD_ENABLED=OFF`, `SCENE_CPU_WORKER_ENABLED=OFF`, #229 >=0.61 GHCR HOLD, #225/#218/#231 OPEN, GO-PILOT BLOCKED를 유지한다. QA 보고 시점에는 Manager 최종 수용 및 root 후속 commit/push/PR CI 시작 전이었다.
- **Manager 최종 수용:** `gpt-6-astra`는 UR-01–06 구현 및 독립 QA 근거를 수용하고 추가 재작업 없이 root의 staged/secret 감사·commit·새 Draft PR 게시·UR-07 CI 시작을 승인했다. 이는 hosted CI SUCCESS/GO-INTEGRATE·병합·GO-PILOT 승인이 아니다. 새 정확 HEAD CI는 시작까지만 확인하고 모니터링하지 않으며 실제 식별자는 최종 인계에서 제공한다. 버전 0.61.0 유지, 기존 root 작업 폴더의 변경은 별도 worktree로 보존했다.
- **문서 영향:** 기존 요구 FR-218-L01/L03/L07/L08의 검증을 보강하며 제품 요구·API·DB Schema·배포 구조 변경은 없다. 따라서 Requirements/Architecture/Database/Decisions의 계약 수정은 N/A다. 설계·AC 정본은 TestPlan/Issue225, 실행 방법은 Operation, 원격 성공/실패 구분은 FailureLedger, 재개 요약은 AGENTS/README, 변경 이력은 ChangeLog에 연결했다. Git 제외 테스트 자료·DB/CAD·빌드·로그를 게시하지 않으며 `.env`가 지정한 동일 repository의 연결 GitHub 도구로 검토한 tree와 expected parent를 검증해 새 branch/commit을 게시한다.

---

## #225 / PR #235 — PR CI 성공 및 Main 통합 확정 (2026-11-05)

- 검증 source HEAD: `baf2ec6a582b12f6eb036ba2855289fc05c6101d`. [PR CI #632 / Run 41979343017](https://github.com/planner77/layoutManager/actions/runs/41979343017)와 [#633 / Run 41981622771](https://github.com/planner77/layoutManager/actions/runs/41981622771) completed/SUCCESS 확인. #632의 적용 8개 Job SUCCESS, A2는 범위 외 SKIPPED이며 성공 시험으로 세지 않는다.
- [PR #235](https://github.com/planner77/layoutManager/pull/235) merged/closed, Squash Main `e9eb2e93ff8e8d2f967de30200ee6da6459c5cc4`. G7 signed HTTP→OCI CPU Worker→새 Viewer/reload와 음성 검증의 GO-INTEGRATE 완료다. 아래 제출 당시 NOT VERIFIED는 당시 상태이며 최신 원격 성공으로 대체한다. 과거 FAIL/CANCELLED·로컬 전체 실행 중단은 삭제하지 않는다.
- 이후 TP-225-UPGRADE-RECOVERY는 기존 데이터가 있는 0.60→0.61와 독립 CPU·원래 백업 복구를 연결하는 별도 합성 시험이다. 이번 원격 성공은 후속 시험/새 PR CI, 실제 운영 설치·복구·중간 변환 KILL/OOM·3-image 출고·#231 완료의 근거가 아니다. GO-PILOT BLOCKED, 제품 두 flags OFF, GHCR HOLD, #225/#218/#231 OPEN 유지. Main CI/정식 출고 결과는 이 기록에서 확인하지 않았다.

---

## #225 / PR #235 — 제출 전 독립 QA 및 로컬 P1-D 검증 (2026-11-05)

**역할·변경 검토:** Manager `gpt-6-astra`가 범위와 C06 fixture 조정을 검토·수용했고 Developer `gpt-6-sol`이 변경했다. QA `gpt-6-luna`가 독립 검토했다. PR #631 구문 수정은 malformed 중첩 DTO assertion을 named `CpuLineDto`로 옮겼다. schema v2, asset object, `INDEX_ABSENT`, LINE 좌표, 새 Viewer의 부분 정밀도 경고·reload·원본 GET 0 및 세 음성 경로의 assertions는 남아 있다. 별도 C06은 실제 201개 Zone/Geometry 쌍 fixture 준비가 15초 timeout의 원인임을 계측해 준비 루프만 `BEGIN IMMEDIATE`/`COMMIT`으로 묶고 실패 시 `ROLLBACK`한다. 202개 mapping, 201 tombstone MAPPED, live revision 3 UNMAPPED, SOURCE_ONLY/ALL 검증, 원래 15초 timeout은 유지한다. QA는 중간 native `.transaction()` 제안의 TS2339를 발견했다. 최종 코드는 선언된 `IsolatedDb.exec` API만 사용한다.

**정적·관련 회귀 시험:** `npm run typecheck` PASS, 전체 ESLint PASS(0 errors, 기존 12 warnings), 변경 두 테스트 파일 ESLint PASS, production build PASS. Developer의 집중 CPU/Viewer 회귀 6 files / 44 tests PASS; QA 독립 재실행 6 files / 42 tests PASS. QA의 최종 `zone-runtime.test.ts` 8/8 PASS(12.48초). P1-D Playwright discovery 1 test PASS. `git diff --check` PASS. 세 Docker 이미지(App/Migrator/CPU Worker) fresh local build PASS.

**기존 Unit 실행 실패·C06:** 변경 전 전체 `npm test` 실행은 `TC-Z196-RESET-HISTORY` 16,873ms로 15초 timeout을 기록했다. 별도 재실행도 22,527ms timeout; 계측 실행은 setup 1,253ms, fixture seed 26,716ms, 두 reset 396ms였다. 이 결과를 부하 경합으로만 추정하지 않고 seed가 병목임을 확인했다. 단일 transaction 후 계측 중간 코드에서 seed는 114ms였고, 최종 `exec` 기반 코드는 targeted 3.91초 PASS. QA가 최종 코드로 전체 관련 Zone 파일을 다시 실행해 8/8 PASS를 확인했다. Manager 승인 후 이전 fixture를 이미 실행한 전체 Unit 프로세스는 SIGINT/exit 130으로 중단했다. 따라서 전체 Unit 전체 통과는 **미확인**이며 최초 timeout과 중단은 실패 이력으로 남긴다. C06은 #631 CI 구문 실패와 무관한 로컬 fixture 준비 문제다.

**로컬 실제 P1-D:** disposable Docker App/Worker/volume을 이용한 simulated GitHub inputs 실행에서 AUTH_READY→signed HTTP upload/QUEUE→OCI READY 및 digest 확인→별도 fresh session Viewer의 정확한 부분 정밀도 경고·reload/original GET 0→revoke, Source SHA tamper, unsupported Entity 세 거부와 기존 READY 보전을 확인했다. 결과 **1 passed / 35.2초**, `scenes:1`, `denied:3`, `originalGets:0`, `sceneGets:4`, `freshSessions:true`; 종료 trap 뒤 해당 App container와 volume이 없는 것도 root가 확인했다. 이 실행은 로컬 Docker/HTTP/Chromium P1-D 증거이고 GitHub Actions의 required job 결과가 아니다. 이미지 label/source revision과 GitHub 환경입력도 hosted exact-HEAD CI로 간주하지 않는다.

**QA 판정·인계:** named DTO 수정은 assertion 완화 없이 구문 오류를 해결했으며 C06 최종 fixture 변경도 범위 내다. Manager 검토를 위한 로컬 수용 근거는 충분하다. PR #235의 새 exact HEAD required CI는 push 후 시작할 예정이며 결과는 **NOT VERIFIED**; 사용자 요청에 따라 실행을 모니터링하지 않는다. GO-INTEGRATE 판정은 보류한다. 기존 PR CI #624/#625/#626/#631 FAIL 및 #627–#630 CANCELLED, #225/#218/#231 OPEN, 제품 Scene flags OFF, GHCR HOLD, GO-PILOT BLOCKED는 그대로다. 버전·운영 자원·기존 이미지/태그 변경 없음.

**역할 대행·최종 수용:** 사용자 진입 지침의 `gpt-5.6-sol`/`gpt-5.6-luna`는 이번 세션 제공 모델 목록에 없어 실행하지 않았다. 실제 repository의 역할 매핑 및 사용 가능한 모델에 따라 Developer `gpt-6-sol`, QA `gpt-6-luna`가 대행했고 Manager `gpt-6-astra`가 요구/AC 작성→Developer 보고 검토→독립 QA→최종 수용을 수행했다. 서버 재시작으로 중단된 초기 검증은 완료로 계산하지 않고 재실행한 결과만 위에 기록했다. 최종 Manager는 PR235-C01–C04/C06과 QA 근거를 수용해 root의 commit/게시/PR CI 시작을 승인했으며 추가 재작업을 요구하지 않았다. required hosted CI 전 GO-INTEGRATE는 여전히 보류다.

**실행 명령·근거:** 작업 폴더 `layoutManager-pr235-ci`, Node 22.14.0, 앱 0.61.0의 uncommitted 시험 변경 snapshot이다. `npm --prefix src ci --offline --no-audit --no-fund`, `npm --prefix src run db:generate`, `npm --prefix src run build`, `npm --prefix src run typecheck`, `npm --prefix src run lint`를 실행했다. QA 최종 명령은 `src/`에서 `npx vitest run tests/integration/zone-runtime.test.ts`(8 PASS/12.48초) 및 `npx vitest run tests/unit/scene-cpu-line-candidate.test.ts tests/unit/scene-loader.test.ts tests/unit/scene-fidelity-v2.test.ts tests/unit/scene-worker-publish.test.ts tests/unit/scene-worker-g7-authorization.test.ts tests/integration/scene-cpu-worker-g7.test.ts`(6 files/42 PASS/6.40초)다. discovery는 가짜 CI 환경입력만 설정한 `npx playwright test --config playwright.scene-p1d.config.ts --list`이며 실제 서버 시험으로 계산하지 않는다. 실제 OCI 검증은 새 세 target을 `docker build -f src/Dockerfile --target runtime|migrator|cpu-worker`로 빌드하고 로컬 실행임을 명시한 CI 모사 입력으로 `bash src/tests/oci/scene-p1d-journey.sh`를 실행했다. root/Developer 로그는 Git 제외 `data/pr235-verification/`, QA 독립 명령 결과는 QA 도구 실행과 이 기록을 근거로 한다.

**게시·정리:** 기존 `.env`가 지정한 remote와 연결 GitHub repository의 일치를 검증한다. 로컬 Git 쓰기 인증은 dry-run에서 exit128로 거부돼 값·인증 헤더를 출력하지 않고 연결된 GitHub 도구로 같은 PR branch에 단일 commit과 non-force fast-forward를 게시한다. root는 검토한 staged tree와 원격 생성 tree의 일치 및 expected parent를 검사한다. 실제 새 CI 실행 식별자는 최종 사용자 인계에서 제공하며 이 커밋에 그 이후의 결과를 소급하지 않는다. 시험 전 없던 local ci 이미지 3개는 생성 receipt의 정확한 image SHA를 대조한 뒤 제거했고 기존 태그는 건드리지 않았다. 기존 작업 폴더의 두 수정도 별도 worktree에서 보존했다.

---

## #225 P1-D CI #626 Viewer CPU fidelity 경고 관측 및 검증 강화 (2026-11-05)

**정확 관측:** [PR CI #626/run 41969752102](https://github.com/planner77/layoutManager/actions/runs/41969752102) HEAD `798b7162a806d03e1d538bea634ee86b7a614254`: 실제 HTTP Origin/CSRF/Editor 등록→Version+QUEUED→별도 Docker Worker PUBLISHED→서버 verified READY/immutable DTO→새 Editor 로그인/Scene restore 경로 도달. Viewer `scene-status`는 저장 Scene 복원을 표시하나 `cad-viewer-shell` 최종 status가 **`도면 일부 표시 완료`**, 테스트의 `도면 표시 완료` 기대와 불일치해 required Docker Job/Verify 실패. Chromium reload·revocation·SHA·unsupported negative는 시험이 그 지점에서 종료돼 NOT RUN. #624 Admin 로그인 시험 경합, #625 CPU Builder manifest 호환 오류는 앞선 증거/원장 참조.

**Root and repaired assertion:** CPU LINE converter는 `CUSTOM_DTO v2` 지원 LINE geometry 완전 복원·원본 무변조를 수행하지만 `viewerData.sourceIndex={state:'UNAVAILABLE',reason:'INDEX_ABSENT'}`이며 정밀 원본 Handle 매핑 불가를 UI가 경고하는 것이 정상. `storedSceneFidelityProfile`은 `render:'FULL_V2'`와 `action:'REBUILD_REQUIRED'`를 동시에 유지한다(정밀 sourceIndex 미검증). P1-D E2E에서 **완전한 소스 매핑을 거짓 주장하지 않고** exact 경고·복원 geometry/Canvas·원본 GET=0·reload/status·negative 후 READY 불변을 함께 요구한다. 단위시험으로 프로필/형상 복원을 재현. 새 HEAD CI **NOT VERIFIED**, FAIL 이력은 덮어쓰지 않는다.

---

## #225 / PR #235 — CI #625 신규 Viewer 실패 / Client Builder identity fix (2026-11-05)

[PR CI #625](https://github.com/planner77/layoutManager/actions/runs/41965842513) HEAD `cf6dfab3596cd9738c29aeab5a85f136953a1443`: required Docker Job `127042583269`에서 새 signed Editor Browser의 `scene-status` 20s timeout. 실제 signed HTTP 업로드/CSRF/QUEUED, 독립 OCI Worker PUBLISHED 및 immutable Scene READY·Manifest/Blob digest 검증은 단계 도달; 새 Viewer 복원/reload와 Site revoke/SourceSHA/미지원 CIRCLE 음성은 NOT RUN. 다른 6개 적용 Job SUCCESS, A2 scope SKIPPED, downstream Required Verify FAIL.

서버 `storedSceneScope`는 승인된 CPU와 Browser Builder의 저장 Scene을 검증하지만 Browser `ViewerSource.readScene`은 browser-only `sceneScope`를 요구하여 CPU Builder Manifest가 충돌. 소스에서 계약 불일치를 확인했고 CI browser 내부 예외는 직접 수집되지 않았음. Browser read-only expected Builder를 Server의 `storedSceneScope`와 일치시켜 strict Manifest/byte/digest/DTO 및 Version/SourceSHA 검사 유지. 새 UNIT은 실제 CPU 후보의 ViewerManager LOAD READY_SCENE+DXF GET 0과 unknown builder/foreign Version/SHA fail-closed. 제품 Source/Worker/보안/CI timeout 바꾸지 않음.

**검증 대기:** 수정 HEAD exact PR CI 성공 이전 새 Viewer E2E 통과 주장 금지. 이전 #624/#625 FAIL 이력 보존, #225/#218/#231 OPEN, GO-PILOT BLOCKED, 제품 2 flag OFF, #229 GHCR HOLD, 운영 데이터·GHCR·tag 무변경.

---

## #225 / PR #235 — P1-D CI #624 E2E 로그인 관측 및 한정 보완 (2026-11-05)

[PR CI #624](https://github.com/planner77/layoutManager/actions/runs/41948139879) exact HEAD `2ce84bf322e2b76867bb777efa94f62c51fb1131`: required Docker Job `126985423451`의 독립 OCI 이전 스텝까지 SUCCESS이나 새 연속 P1-D 시험에서 최초 Admin 재로그인 후 `현재 세션` heading 20초 timeout으로 실패. Required Verify 종속 실패, 다른 적용 6 Job SUCCESS, A2 SKIPPED. 따라서 #624에서 HTTP DXF 업로드→Worker READY→새 Viewer 복원 및 음성 검증 **완료 증거 없음**.

**시험 수리:** 실제 `auth/initial-change` 완료 메시지를 확인한 뒤에만 페이지 이동; UI 로그인 POST 상태 200 및 signed Session 조회 상태 200과 화면 heading을 단계별 확인한다. 이전 Run에서 로그인 상태 코드가 관측되지 않아 경쟁 상태는 **원인 가설**이며 제품 인증 불량 확정이 아니다. UI timeout·CSRF·site 권한·Worker 설정·CI 필수 검증은 완화하지 않는다. 수정 HEAD는 CI 통과 전 NOT VERIFIED; #225/#218/#231 OPEN, GO-PILOT BLOCKED, 제품 플래그 OFF, v0.61+ GHCR HOLD, 운영 데이터/배포 불변.

---
## #225/P1-D — 단일 signed HTTP→OCI→Viewer E2E 신규 시험 (2026-11-05 / NOT VERIFIED)

`src/tests/p1d-e2e/scene-http-oci-viewer.spec.ts` 및 격리 Docker App/Migrator/CPU Worker harness를 작성했다. 실제 Editor UI 로그인·Origin/CSRF multipart POST, DB Job QUEUED, 별도 CPU OCI `PUBLISHED`, 서버 Asset/Scene API DTO v2 readback, 별도 인증 Context의 Viewer render/reload·원본 GET 0, revoked Site/SourceSHA 변조/미지원 Entity 음성 경로·기존 READY 보전을 하나의 시나리오로 연결한다. 신규 정확 HEAD의 GitHub CI가 아직 없으므로 **PASS 주장 금지**. #234 CI #622의 OCI 단위 PASS와 Main CI #153/#154 성공은 이전 증거로만 보존. 운영 G7 업그레이드·중간 OOM/실 현장 DXF·정식 3-image GHCR 출고 GO는 미검증이며 GO-PILOT BLOCKED/두 제품 플래그 OFF/#225/#218/#231 OPEN 및 >=0.61 GHCR HOLD.

---

## #225 / PR #234 — 정확 HEAD OCI 통합 검증 PASS (2026-11-05)

[PR CI #622](https://github.com/planner77/layoutManager/actions/runs/41935291475), HEAD `aa0c4622e912c7ad048c481c4aa153c86124d79c`, completed/**SUCCESS**: 8 applicable CI jobs PASS, A2 CPU synthetic job 범위 외 SKIPPED, Vitest **173 files / 1,098 tests PASS**, G7 Signed/Greenfield 및 Chromium 두 샤드 PASS. Docker Job `126942947861` 로그에 `G7_GREENFIELD_READY / NEW_INSTALL`, `setup`, `verify-ready`, `revoke`, `verify-revoked`, `tamper`, `verify-tamper`, `prepare-crash`, `claim-marker`, `stale`, `verify-wait`, `due`, `verify-recovered`, `restore` 및 최종 **`OCI_CPU_PROOF_PASS`** 확인. Docker Worker 기본 루프/stop/start와 비루트·무네트워크·읽기전용 RootFS·CPU/RAM/PIDs/Capability 제한 등 실제 컨테이너 시험 통과.

이전 [CI #614](https://github.com/planner77/layoutManager/actions/runs/41931040058)는 SIGKILL 테스트 exit1로 실패했으며 과거 기록을 삭제/성공으로 수정하지 않는다. 원인 관측 한계 보완 후 위 새로운 CI #622에서 통과했다. [PR #234](https://github.com/planner77/layoutManager/pull/234) Main Squash `edb3ecb3a17a25cbc88d63b2cc8b911cba3bbcd5` 완료.

**실행 증거 한계:** CI 전용 synthetic G7와 실제 테스트 OCI에서 claim 후 KILL / 시각 가속 stale·retry를 검증한 것이며, 현장 원본 DXF의 전체 Entity 변환이나 실 사용자 signed HTTP App→프로덕션 OCI→Viewer 새로운 로그인 전체 연속 경로, converter 처리 도중 OOM/kill, 실제 배포·복구는 검증되지 않았다. **GO-INTEGRATE PASS ≠ GO-PILOT GO**. #218/#225 OPEN, 두 Scene 제품 flags OFF, v0.61+ GHCR HOLD, #231 OPEN.

---

## #225 / PR #234 — CI #614 OCI SIGKILL 경계 실패 및 검증 보완 (2026-11-05)

[PR CI #614](https://github.com/planner77/layoutManager/actions/runs/41931040058) source HEAD `9361d920ca53bdbc9d9a5ce8e807a9408806d3d1`: Static/Unit/Build, Docker 기존 smoke 및 G7/Chromium E2E 성공. **신규 OCI proof는 부분 PASS / 전체 FAIL:** 최초 READY/readback, 자원 격리 Docker 검사, Site grant 철회, 동일 길이 원본 SHA 변조, crash 사전 Job 생성까지 실행 완료. `claim-kill` 컨테이너가 예측 137이 아닌 **exit 1**로 반환되어 required Docker Job 실패. 원래 `docker run --rm` 로그가 숨겨져 있으므로 child code의 정확 실패 원인은 이 Run에서 확인 불가. 실제 컨테이너 SIGKILL 완료, stale 복구, isolated restore는 #614에서 PASS 증거 없음.

변경 소스는 **실제 별도 컨테이너의 영속 Claim 확인 후 Docker 호스트가 SIGKILL**하고 `wait/inspect` exit 137, DB RUNNING 재확인 뒤 기존 상태 전이·복구 검사로 진행하도록 수정했다. 제약·시간/보안 조건 완화 없음. 새로운 정확 HEAD CI는 미실행/결과 미확인; GO-PILOT BLOCKED.

---

## #225 PR #233 확정 결과 및 OCI 신규 증거 구분 (2026-11-05)

- **OCI CLI·Supervisor 층위 차이:** 신규 시험은 실제 이미지 기본 `scene-cpu-worker-loop.sh` ENTRYPOINT로 게시하고 stop/start 후 READY 불변을 확인하도록 작성했다. 부정 시나리오는 격리 OCI에서 `--once` 실행. 아직 CI 미실행, Docker 속성/실 Worker 결과 PASS 미선언.

[PR CI #612](https://github.com/planner77/layoutManager/actions/runs/41920944913) 정확 HEAD `2b1cb5bef3a011e9b31eeafc508aec90051b2754`: applicable 8 Job SUCCESS(A2 scoped SKIPPED); Static/Unit 173 files, **1,098/1,098 tests PASS**, 실제 synthetic G7 Node Worker `scene-cpu-worker-real-g7.test.ts` 6건 PASS, signed G7 multipart `scene-cpu-worker-upload-g7.test.ts` 2건 PASS, General Chromium E2E 2 shards 및 G7 signed/Greenfield E2E SUCCESS. [PR #233](https://github.com/planner77/layoutManager/pull/233) Squash Main `b33945d7ee80946950f8debfd04ce080af6e7105`; [Main CI #152](https://github.com/planner77/layoutManager/actions/runs/41924479834) SUCCESS, release-scope SUCCESS, GHCR publish SKIPPED. 아래 시점별 'NOT RUN'은 해당 작성 당시의 이전 기록이며 이 확정 결과가 우선한다.

**신규 OCI 경계:** 현재 PR은 같은 `cpu-worker` Dockerfile target을 실제 별도 컨테이너에서 실행하며 비루트/network none/read-only/CPU1·RAM768MiB/PIDs64, disposable G7 Greenfield DB/원본/immutable Scene과 정상 READY·Audit/readback/중복 IDLE, 권한·SourceSHA 거부, SIGKILL 후 시각 가속 유한 복구, 격리 복사 복원을 확인하도록 테스트를 작성한다. **새 PR의 정확 HEAD CI가 성공하기 전까지 모든 신규 OCI 결과는 NOT VERIFIED**. 단일 signed 실제 사용자 HTTP 업로드→실 OCI Worker→App Viewer 신규 로그인 E2E, 실제 OOM 및 운영 백업·복구는 미실행/GO-PILOT BLOCKED.

---

### 2026-11-05 — multipart 서비스 경로 검증 추가 (SOURCE ONLY)

새 `scene-cpu-worker-upload-g7.test.ts`는 합성 G7 사용자 세션과 진짜 multipart Request, `prepareG7CadWrite`/Origin/CSRF, `uploadCad`·원본 저장·영속 Queue, 별도 Node 프로세스의 verified READY·Audit/Asset 불변 및 권한 취소 거부를 연결한다. **PR CI 미실행/결과 미확인**, HTTP listening server/App UI/실 OCI 환경에서 통과했다고 단정하지 않는다.

## #225 폐기 가능한 통합·브라우저 검증 — 신규 PR 전 증거 상태 (2026-11-05)

**현재 판정: SOURCE ADDED / NOT RUN, GO-PILOT BLOCKED.** 실행 서버에 Docker 및 GitHub DNS가 없어 여기서는 repository unit/integration/Chromium 시험을 실제 실행하지 못했다. 정확 신규 HEAD PR CI 결과가 생성되기 전 성공·실패를 단정하지 않는다. 기존 Main CI 성공은 PR #232 통합 증거이며 이번 신설 테스트에 대한 PASS가 아니다.

- 통합 소스: 실제 폐기 가능한 G7 0.61 SQLite·CAD 디렉터리 생성 → **새 Node 프로세스** 실제 QUEUED Job 선점/DTO·Asset 게시/READY/감사/새 DB readback/중복 IDLE. 다른 자식 프로세스가 claim 후 실제 SIGKILL(후속 stale 시각 가속) → 다음 Worker가 유한 Retry로 게시. 원본 바이트 변조 및 Actor Site grant 삭제 시 무포인터 FAILED.
- 브라우저 소스: Node CPU LINE DTO를 실제 immutable local Scene Blob에 기록/읽기, 원본 DXF 재파싱 없는 **새 Chromium context**의 렌더 복원 및 바이트 변조 거부.
- **별도 미수행:** 실제 HTTP multipart 업로드·signed UI API·OCI container worker·실 cgroup CPU/RAM/PIDs, network none, read-only rootfs, 호스트 재기동 및 G7 백업/격리복원, 사용자 브라우저 완전 UI E2E. 이 항목들은 실제 증거 전까지 NOT RUN이며 Pilot 차단을 유지한다.
- 테스트 컴파일/런타임 실패 발생 시 `out/FailureLedger.md`에 정확 Run/Job/HEAD/로그·원인·수정·재검증을 추가한다. Test scope is disposable, source-only until exact-HEAD CI. Production flags SCENE_AUTO_BUILD_ENABLED=OFF / SCENE_CPU_WORKER_ENABLED=OFF; #229 >=0.61 GHCR HOLD, #231 Tag Ruleset OPEN, #225/#218 OPEN, GO-PILOT BLOCKED. No production DB/CAD/Volume/.env, GHCR or tag writes.

---

## #225 B3 PR #232 — 현재 코드 시험 범위 (2026-11-04, Pending CI)

기존 PR CI #595는 초기 순수 표시 계약 HEAD `24a648a`의 SUCCESS이며 후속 status API/UI/retry 구현을 검증하지 않는다. 새 branch에서 #599/HEAD `26da5c4` Static step은 unit fixture `updateMany` mock에 인자 타입이 없어 TS2352/TS2493 발생; 이후 `_input?:unknown`으로 수정했다. 정확 새 HEAD 필수 CI 성공은 아직 확인 전이다. 모의/순수 테스트로 상태/권한 판단과 CAS 코드 변경을 검증하도록 추가했으나 실제 signed G7 API, Immutable Blob, Browser Viewer 복원, 별도 OCI recovery는 미실행/GO-PILOT BLOCKED다.

---

## #229 — Main/GHCR 릴리스 영속 HOLD 구현·검증 상태 (2026-11-04)

**구현 소스 작성, 정확 HEAD CI는 아직 NOT VERIFIED.** `.github/scripts/issue229_release_hold.py`를 통해 0.61.0 이상 모든 Main push의 GHCR publish를 보류하고 guarded tag를 차단한다. `docker-publish.yml`은 release-scope와 build-and-push 앞단에서 2중 검사하며, guard-only 변경 경로만 비출고한다. `pr-ci.yml`에서 Python 정책 테스트를 required scope 체크로 실행하고 기존 GHCR Bash fixture 양성·음성 회귀를 추가했다.

예상 검증: Main 0.61/0.61.1/0.62 HOLD, tag 거부, malformed package/ref 거부, 기존 0.60과 #216 source-pinned pair 보존. 실제 배포·태그·기존 GHCR alias·운영 DB/CAD/Volume/.env 변경은 수행하지 않았다. 코드를 작성했다는 사실을 CI PASS 또는 완전한 tag ruleset 보호로 주장하지 않는다. #228 GO-INTEGRATE HOLD, #225/#218 OPEN, GO-PILOT BLOCKED.

---

## #225 / PR #228 — PR CI #589 failed integration test; G7 restore semantics corrected (2026-11-04)

[CI #589](https://github.com/planner77/layoutManager/actions/runs/41803028915) exact HEAD `4d8d510d6dc6390d4243f31891fcdcd1ef4274bd`: Scope/Docker-G7 smoke **PASS**; Unit/Integration **FAIL** (1 of 1,067: `g7-greenfield-upgrade.test.ts:378` asserted retryable plan after intentionally broken final 0.61 postcondition); Required Verify **FAIL**, G7/Chromium E2E **NOT RUN**. Upgrade engine deliberately holds `RESTORE_REQUIRED` after the first migration commits and the final migration rolls back. Test amended to check persistent lock/hold, first migration history, absent last CPU index, untouched source CAD/manifest and isolated backup restore. **New HEAD CI NOT YET VERIFIED.** No weakening of recovery policy or Worker rollout.

## #225 / PR #228 — PR CI #588 exact HEAD failure and test fixture repair (2026-11-04)

[PR CI #588 / Run41800458837](https://github.com/planner77/layoutManager/actions/runs/41800458837), HEAD `129707d75295b3c833eda714ecedb85e25328ad2`: Scope SUCCESS, Docker/G7 Migration/WAL smoke SUCCESS, **TypeScript FAIL** (two TS2352 errors in `scene-cpu-worker-launch-contract.test.ts`; required `NODE_ENV` missing from test-only `NodeJS.ProcessEnv` assertions), Required Verify FAIL by dependency. G7/Chromium E2E NOT RUN. Repair: add explicit `NODE_ENV:'test'`, remove unsafe assertions; preserve denied-config expectations and required gates. **Post-fix CI not yet proven**; this is not GO-PILOT or an OCI/scene restoration acceptance result. See [FailureLedger](FailureLedger.md).

## #225 / PR #228 — 0.61.0 + 독립 Worker 코드/검증 상태 (2026-11-04)

신규 CLI, OCI/Compose 격리, 0.61 G7 migration 및 테스트를 작성했으나 **정확한 새 HEAD의 Typecheck/Lint/Prisma/Worker OCI/E2E는 NOT RUN/NOT VERIFIED**. [#584](https://github.com/planner77/layoutManager/actions/runs/41785081044) SUCCESS는 이전 HEAD 결과다. 실제 실 도면, Worker 권한/재시작, 브라우저 재접속, GHCR image/digest/GO-PILOT 증거는 미완료.

## #225 / PR #228 Queue/Retry 추가 변경 (2026-11-04)

코드+단위시험 작성, **신규 HEAD CI 결과는 아직 미검증**. 이전 CI #583 PASS는 이전 HEAD에만 해당. 정확 HEAD에서 미래 Builder 분기/현행 Browser 보존, transient retry/terminal/CAS_LOST를 재확인한다. 실제 new-release G7 통합/별도 비루트 프로세스/브라우저 복원 미완료. GO-PILOT BLOCKED.

---

## #225 B2-B G7 실제 SQLite·0.60.0 하드-OFF 회귀 추가 (2026-11-04)

PR #228의 신규 `scene-cpu-worker-g7.test.ts`는 disposable G7 0.60.0 DB와 소유 CAD 원본·Scene Blob을 만들고 게시·재조회·Audit 실패 롤백을 검사한다. **인가 함수는 이 시험에 한해 모의로 제공**되며, 0.60.0 운영 G7에서 Worker가 켜진다는 의미가 아니다. 추가 `scene-cpu-worker-current-release.test.ts`는 실제 현재 Schema ID와 미래 CPU Worker Schema의 불일치를 검증해, 두 feature flag를 ON으로 설정해도 DB/Job 읽기 전에 차단해야 한다. 명시한 두 파일의 실제 CI 통과는 정확 HEAD 결과 확인 전 미검증. 권한/버전/실 독립 프로세스/지원 도형/브라우저 Pilot은 별도 차단 유지.

---

## #225 B2-B 내부 한 건 Worker 함수·게시 계약 — 원격 구현 상태 (2026-11-04)

[PR #228](https://github.com/planner77/layoutManager/pull/228)에서 작업중인 고유 CPU Builder/Job 데이터 정합성 검사에 다음을 추가했다. 미래 전용 CPU Builder Queue Enqueue/Claim/Stale/Retry/Stage, signed G7 Runtime+현재 Actor/Role/Site/Version 검증, CAD 원본 재읽기·SHA, Blob `putVerified` readback, 최초 CurrentScene+SceneAsset/Job READY+Audit 원자 Tx, 기존 READY 무변경/Orphan safe cleanup, 단일 Job 처리 함수를 구현했다. Unit은 필드·상태/재검증·포인터 경합·저장 실패·CAS·권한 철회·오류 코드/기존 Builder 분리를 대상으로 작성했다.

**실제 검증 구분:** [CI #572](https://github.com/planner77/layoutManager/actions/runs/41776814316)의 TypeScript 2건(TS2367/TS2502)은 [FailureLedger](FailureLedger.md)에 기록 후 수정했다. 추가 변경 HEAD의 전체 CI 최종 결과는 **아직 확인 전이며 PASS 선언하지 않는다**. v0.60.0에서 미래 CPU G7 스키마/OCI Worker/실 runtime 실행/독립 프로세스 cgroup 격리/브라우저 실제 복원은 NOT RUN/NOT IMPLEMENTED다. #225/#218 OPEN, GO-PILOT BLOCKED, 운영 Repo/Main/0.60 App/Migrator·.env·DB·CAD·Volume 불변.

---

## #225 B2-B Draft — CPU provenance/Job DTO gate 작성, 통합 미검증 (2026-11-04)

B2-A [PR #227](https://github.com/planner77/layoutManager/pull/227) 정확 HEAD `f2ac283c62dc3eaed513d4f67a0b4355adbb3a3c` [PR CI #566](https://github.com/planner77/layoutManager/actions/runs/41768798168) SUCCESS, Main `73957d20295d6300c4f0c9b89ca5032574eb24bc` [Main CI #147](https://github.com/planner77/layoutManager/actions/runs/41771625231) SUCCESS (같은 0.60.0 이미지 중복 게시 생략). B2-B 별도 Draft에서 CPU Builder identity와 Job/DTO match + 단위 음성/양성 시험을 신규 작성. **이 변경의 로컬 typecheck/Vitest/Docker/E2E 또는 정확 HEAD PR CI 결과는 아직 NOT VERIFIED**. 순수 검증 receipt를 G7 재인가·SceneRepository 게시·READY 성공으로 과장하지 않는다. 현재 0.60.0 GHCR·운영 .env/DB/CAD/Volume 비변경, #225/#218 OPEN·GO-PILOT BLOCKED.

---

## #225 B2-A CPU LINE 후보 — 증거 상태 (2026-11-04)

- 원격 Draft branch에 Node의 2D LINE→Three BufferGeometry→CUSTOM_DTO v2→전체 validator→0600 readback 후보 및 양성/음성 Vitest를 작성했다. **코드 게시 ≠ 실제 테스트 실행 성공**이다.
- 개발·QA의 로컬 TypeScript/Lint/Vitest/Build/Docker/브라우저 실행은 아직 **NOT RUN**. PR CI는 생성 이후 정확 HEAD에 대해 별도 확인해야 한다. 기존 #221/#222 Browser 실험의 PASS를 이번 Node 후보 실행 증거로 전용하지 않는다.
- Converter는 미지원 Entity/3D/색/Block/비default Layer/encoding을 안전 거절하고 등록되지 않은 CPU Builder provenance/CPU 격리/G7 게시/Auth 문제로 운영 Worker·READY를 구성하지 않는다. 이전 0.60.0 릴리스 image·Main/DB/Volume/GHCR 비변경.

---

## #223 / CI #545 — Greenfield 회귀 수리·독립 QA 완료 (2026-11-03 KST)

- 원격 정확 HEAD `b8f4ebe`, [CI #545](https://github.com/planner77/layoutManager/actions/runs/41645624408)는 Greenfield24 PASS/2 FAIL 및 Required Verify 종속 FAIL, 다른7 Job은 SUCCESS다. 이전 로컬988/Browser11/fault6 수용이 이 실패를 취소하지 않는다.
- 실제 RED: owned 임시 root/controlled clock의 초기 Admin·SC14·R3 chain3case는1 PASS/2 FAIL(53.4s)로 같은 mapping0vs5·consumer heading 실패를 재현했다. CI trace login200→409 확인; public body의 SESSION_LIMIT code는 직접 관측하지 않았다.
- 단일 변수 개입: 매핑0→5 한 줄만 변경하면 SC14 및 후속 login 실패 지점은 통과했다. 전체subset 결과는2 PASS/1 FAIL(1.0m)이며 R2에서 생성하는 r2reader를 제외한 fixture 전제 누락으로 R3 후반에 실패했다. Manager가 C545-05를 실제 prerequisite/full suite 기준으로 정합화했고 이 실행을 GREEN으로 기록하지 않는다.
- Manager gpt-6-astra 설계 C545-01~06 → Developer gpt-6-sol test-only3파일 수리 완료. 실제 fixture의 v2 scope/독립 sourceSHA/5bindings 및 original·fresh·reload exact render6/mapped5/observed5/excluded1을 검증한다. 기존 원본GET/Blob/indexWorker/liveWorker0·text/Layer·immutable payload/Scene revision·명시 Renderer 전환 단언은 보전했다.
- Developer 최종 실행: 전체 controlled Greenfield **27/27 PASS(3.8m)**, typecheck/관련 lint/diffcheck PASS, helper unit **3/3 PASS**. 실제2 authenticated context의 본문 예외 후 옛 cookie 각각401·후속3login200/4번째409를 확인했다. Logout은 context close 전에 수행하고 한 정리 실패에도 나머지를 시도하며 primary/cleanup 오류를 함께 보전한다. Manager 직접 소스검토가 독립 QA 착수를 승인했다. 독립 QA gpt-6-luna도 동결 소스의 전체 Greenfield **27/27 PASS(3.2m)**, helper **3/3 PASS**, typecheck PASS, full lint0errors/기존8warnings를 확인했다. SCENE_RECONNECT는 originalGET0/Blob0/indexWorker0/sceneGET4/contexts2이고 R2 prerequisite과 R3까지 통과했다.
- QA 실행 이력: 최초 잘못된 임시root는 owned-fixture guard가 server/test 전에 거절해 NOT RUN이었다. 다음 유효한 canonical/0700 수동root 실행은 자동root 안내를 재시작 요구로 해석해7개 PASS 후8번째 도중 CANCELLED됐다. 정정 안내 후 자동 owned root의 전체27 PASS를 정본으로 삼고 partial/cancel을 제품 실패나 전체 PASS로 계수하지 않는다. guard와 제품은 변경하지 않았다.
- 검증 범위: 제품/App/Adapter/auth/DB/package/Docker/CI 설정은 변경0이다. 기존 성공 CI545의 quality/build/Docker/general/runtime/A2는 그 당시 baseline 결과로 보전하고, 새 delta는 관련 helper·type/lint 및 전체 Greenfield로 검증한다. 전체988/build/Docker를 새 delta 통과로 재명명하거나 불필요하게 반복하지 않는다.
- Manager 최종 판정: C545-01~05 수리 ACCEPT/추가 재작업0. C545-06은 최종 게시·새 정확 HEAD CI 시작 확인을 남긴 상태에서 이 소스 기록을 확정한다. 시작 여부와 새 HEAD는 최종 PR metadata/완료 보고로 확인하며 새 CI 완료 PASS를 미리 쓰지 않는다.
- 제품 source/version0.59.0·3-session 제한·인가·DB·원본·운영 volume/배포·A2 P1-B NO-GO는 유지한다. 최종 재조회 review threads0/unresolved0·mergeable=true, base Main2efae76/headb8f4ebe 및 Main ancestor를 확인했다. 새 CI는 원장 기록 뒤 시작하고 완료 모니터링은 생략한다.

---

## #218 FX / Sandbox — 0.59.0 후속 구현·로컬 검증 완료 (2026-11-03 KST)

- **병합 완료:** PR #222 검증 전용 Squash Main `2efae7631b175d25b9c4f961cc1fd0fdc23010f5`. Exact PR HEAD `0ade59a2aa3245c7323963f254ce3f24b3e110db`의 [CI #543](https://github.com/planner77/layoutManager/actions/runs/41625577506) 9/9 Job SUCCESS, review 미해결0/충돌0 및 tree 동일을 확인했다. 병합 후 #218 OPEN. 아래 #222의 CI 미확인 표기는 당시 기록이다.
- **역할:** Manager gpt-6-astra 설계/AC, Developer gpt-6-sol fidelity 구현·sandbox research, root 통합·release compatibility·게시. 독립 QA gpt-6-luna가 Manager 구현 검토 승인 후 동결 소스를 검증했다. 실제 역할만 기록한다.
- **독립 QA:** typecheck/build PASS; lint0errors·기존8warnings; focused Vitest3files20tests PASS; process-safety3/3 및 sandbox-profile2/2 PASS. 실제 parity2/2 PASS(16.8s), raw inventory 손실0, 실제 ShapeGeometry/clone2개, material side loss0, source index live/fresh READY 및 mapped3/render10, text4. Canvas source 선택·PRECISE 외곽선 일치, Translate/Rotate 중 source mode 차단, Undo/reset후 전체 inventory 일치, Layer toggle 확인. Fresh restore 전 original GET/font/index Worker/parser 각각0. 기존 부분 대응은 확대하지 않았다.
- **실행 경합 보전:** 첫 QA parity는 동시 Build의 생성 font JSON rewrite 중 부분 파일을 읽어 FAIL이었다. Build 완료 후 같은 동결 source/font에서 순차 재실행2/2 PASS했다. 최초 실패를 덮어쓰지 않으며 [FailureLedger](FailureLedger.md)에 원인을 기록했다.
- **호환/통합:** G70.58.1→0.59.0 compatible 및 기존 release path/DB/CAD/installId 보전4files24tests PASS. 전체 Vitest151files988tests PASS(343.50s). 정확 최종 Docker image Browser11/11 PASS: P0 5/5(13.9s), 필수 A2 4/4(10.3s), actual Adapter parity 2/2(16.9s). 각기 다른 새 cgroup에서 실행했고 모두 exit0/OOMKilled=false/PID0으로 종료·삭제했다. 프로세스·strict profile의 실제 결과는 아래와 같다.
- **최종 이미지:** 실제 `src/tests/a2/Dockerfile`로 `layoutmanager-a2-proof:issue218-fidelity-final` build PASS, image `sha256:848e905bdeb5a851310950c8a6f66f0ff110dfb3ab36eaf39fe1e55353d732dd`. 변경 소스31개 각각의 SHA-256이 동결 로컬 소스와 컨테이너 내부에서 모두 일치했다.
- **프로세스:** stall·converter SIGKILL·actual OOM·Node delayed uncaught/unhandled·Browser late error의6음성 + 각각 fresh recovery6 PASS. OOM만 Docker OOMKilled=true/exit137/supervisorKilled=false이며, exit137만으로 OOM을 추정하지 않았다. 모든 정상 복구는24nodes/21,506vertices/v2 bytes1,998,797의 full validator·SHA·파일 readback·새 actual Adapter raw inventory/class/material 복원·quiet/clean exit0·PID0을 확인하고 source bytes 불변이었다. 정확 run label의 잔여 컨테이너0. 기존 unsafe SwiftShader 시험 launch의 결과이며 strict profile의6fault는 NOT RUN이다.
- **Strict Sandbox:** 동일 최종 이미지에서 고정 Playwright profile+단일 chroot delta 및 기존 UID10001/CPU2/RAM·swap1536MiB/SHM256MiB/PID256/read-only/network-none/cap-drop ALL/NNP/tmp512MiB를 유지했다. 실제 renderer user/PID namespace 분리·seccomp filters2·NNP1·CapEff0·no-no-sandbox/no-unsafe-SwiftShader를 확인했다. 동일 v2 candidate24nodes/21,506vertices/1,998,797bytes 변환·full validator·readback PASS. Fresh live restore는 `WEBGL_CONTEXT_UNAVAILABLE`, 연구 receipt는 **RESEARCH_ONLY_NO_GO**였다. Probe 컨테이너 exit0/OOMKilled=false/PID0 및 정확 run label 잔여0. 연구 supervisor의 정상 종료는 restore 성공이나 보안 GO를 뜻하지 않는다. 기본 Docker profile의 기존 strict launch probe는 BLOCKED/LAUNCH_REJECTED로 별도 기록한다.
- **Node 대안:** dxf-parser1.1.2 및 기존 dxf5.3.0의 Node parse만 확인했다. 독립 Scene converter/한글 geometry·fidelity/fault 수용 증거가 아니다. 재현 명령·profile/LICENSE/NOTICE 해시·공식 근거·미실행 범위는 [Issue218Sandbox](Issue218Sandbox.md)에 있다.
- **소스 검사:** 상류 SHA 고정을 위해 vendored Playwright LICENSE의 원본 CRLF bytes를 보전한다. CRLF 파일이 해당 LICENSE 한 개뿐임을 확인하고 `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --cached --check`로 staged whitespace를 검사한다. Profile/LICENSE/NOTICE hash 검증은 별도로 통과했다.
- **Manager 수용:** gpt-6-astra가 두 실제 process/sandbox report를 직접 읽고 QA·full988·packaged11·hash31 증거를 검토해 **구현 보완 PR ACCEPT / 추가 재작업0**으로 판정했다. 운영 GO 수용과 구분한다.
- **GO 재판정:** 보안상 허용되는 전체 복원 경로와 exact-profile fault, source partial의 필요한 수용·현장·SBOM/license/provenance·신규 exact HEAD CI 증거가 충족되지 않아 **P1-A2/P1-B NO-GO**다. 구현 보완 PR의 수용과 운영 GO는 별개다. #218 OPEN, 영속 Worker/Job/DDL/운영 volume/배포 없음. 신규 PR CI는 시작한 뒤 완료 모니터링을 생략하고 NOT VERIFIED로 남긴다.

---

## U-218-A2-FS-20261103 — 실제 Adapter 동등성·프로세스 안전성 후속 PR

- 상태: 최종 구현·독립 QA 및 정확 packaged-image 검증 완료. `gpt-6-astra` Manager가 **검증 전용 후속 PR 수용**을 판정했다. 원격 정확 HEAD CI는 시작만 요청하며 결과 미확인이고 운영 GO는 BLOCKED다. 아래 기존 결과와 별도다. AC/추적: [Issue218](Issue218.md) F01–F05/S01–S06 → candidate/live/parity 및 process-child/supervisor → 추가 필수 A2 CI.
- 실제 역할: `gpt-6-astra` Manager가 요구·설계/AC 및 pre-QA 검토, `gpt-6-sol` Developer 두 명이 Viewer/proc 경계를 각각 구현, root Codex가 통합/CI/최종 image 검증·문서·게시를 담당. `gpt-6-luna`가 독립 QA와 최종 재검토를 수행했다. 공급된 과거 gpt-5.6 모델 대신 현재 branch AGENTS의 사용 가능한6-series 역할을 실제 수행했다.
- Developer Viewer: source risk preflight를 실제 candidate entrypoint에 넣고 source SHA mismatch/cyclic BLOCK/폭증/비지원 거절을 font 요청 전에 검증. Host parity2/2 PASS5.6s, typecheck/focused lint PASS. 별도 실제 Adapter source와 독립 후보의 전체 DTO/inventory 일치, full validator/file/readback/fresh live restore, textIndex4 hits, layer off/on/re-entry. 실제 source Worker READY.
- Fidelity 제한: source semantic instance LINE3/CIRCLE3/LWPOLYLINE1/TEXT3/MTEXT1, drawables3 Line/4 Mesh/4 LineSegments. Source/render/handle 관계는 PARTIAL(exact source mapped3, render index10); 원본 선택 index fresh restore UNAVAILABLE. ShapeGeometry2개는 BufferGeometry로 복원되며 source class 비교 exact·복원 시 canonicalization 및 모든 buffers/좌표 검사를 유지했다. 이를 전체 source fidelity PASS로 기록하지 않는다.
- 추가 재질 검증: raw restore는 MeshBasicMaterial.side4개(2→0)에서 실패했다. Source/candidate는 side/depthTest/depthWrite/alphaTest/blending 포함 exact. 정확 stable-ref/material slot 및 class2/side4 손실을 검증한 뒤 나머지를 비교한다. 전체 재질·원본 선택 복원은 F03/F04 PARTIAL/UNMET이며 새 손실을 일반적으로 무시하지 않는다.
- Developer process overlay: 실제 fault6개와 각각 fresh full conversion/validator/file/fresh Adapter restore/inventory/text 비교6개 PASS. OOM은 Docker OOMKilled=true. Strict sandbox launch는 BLOCKED/LAUNCH_REJECTED. 최종 명시 deadline/보고/재질 손실 보완은 아래 정확 최종 이미지로 다시 검증했다.
- Root discovery: 기존9와 추가parity2 전체 선택 PASS, source/metadata mutation 음성 검사 보존. Node process gate/redaction unit3/3 PASS. 추가 workflow syntax/type actionlint PASS(ShellCheck 통합의 기존 SC1007 경고2건은 이전 원장 그대로).
- 독립 QA 최종 source 검토: typecheck/lint/build PASS(기존 warning8), parity2/2 PASS7.4초 및 process gate unit3/3 PASS, 추가 discrete path/side/blending/index 부정 회귀 확인. 최초 전체149 files/982:981 PASS/1 FAIL494.26초(기존 Zone15초 timeout), 원래 Zone suite8/8 PASS12.72초, 전체 재시험149/149 files·982/982 PASS262.00초. 제한/기존 제품·시험을 변경하지 않았다. 관련 근거는 FailureLedger에 원래 실패와 함께 보존한다.

### 정확 최종 이미지 및 실제 fault/recovery 결과

`src/tests/a2/Dockerfile` 실제 build exit0. 시험 이미지 ID `sha256:35057e54486a2f1a92a6d4ee2bc1822ba1837ffd6c0460e5e1a9b461bc74604a`, frozen 새 검증 파일10개 모두 이미지의 bytes hash 일치. Test-only이며 Registry 게시/운영 배포 없음. Source/font/helper bind mount 없이 실제 CI body를 적용했다.

| 새 컨테이너 suite | 결과 | Docker postmortem |
| --- | --- | --- |
| 기존 P0 |5 PASS/6.9초|exit0/OOMKilled=false/PID0|
| 기존 P1-A2 required |4 PASS/5.8초|exit0/OOMKilled=false/PID0|
| 새 actual Adapter parity |2 PASS/6.8초|exit0/OOMKilled=false/PID0|

각 process fault와 recovery는 독립 새 컨테이너다. 모든 recovery가 source digest→실 DXF parse→full DTO validator→file write/read→새 실제 Adapter restore→정확 class/side 손실 확인+전체 나머지 inventory/text→quiet를 완료했다. 각 결과24 nodes/21506 vertices/1890549 bytes, 정상 exit0. 원래 CPU2/RAM1536MiB/swap-total1536MiB/SHM256MiB/PID256/UID10001/read-only/network-none/cap-drop/no-new-privileges/tmp512MiB를 Docker inspect로 검증했다. Child25s launch/20s ready/70s convert·restore/180s 전체 및 outer15m 제한은 그대로다.

| 실제 fault | exit/OOMKilled | converter PID→종료 후 container PID | fault/새 recovery ms |
| --- | --- | --- | --- |
| stall/deadline kill |137/false|6→0|4793/4073|
| converter SIGKILL |137/false|7→0|2510/4080|
| touched-buffer cgroup OOM |137/**true**|7→0|3018/4147|
| Node delayed uncaught |40/false|7→0|2462/4101|
| Node delayed unhandled rejection |40/false|7→0|2461/4084|
| Browser late pageerror |40/false|6→0|3019/4083|

6종 음성시험과 새 recovery6종 모두 PASS. Source fixture 이미지 hash 불변을 매번 확인했고 정상 recovery 종료 이후에만 accepted marker6개가 생겼다. 최종 run label의 container 잔류0. 원시 자식 로그 대신 안전한 JSON 보고서/분류만 보관했다. 위 millis는 단일 합성 실행이며 실제 고객 성능 SLA가 아니다. production 영속 Worker/lease 복구 시험으로 해석하지 않는다.

Strict `chromiumSandbox:true` capability probe는 동일 무권한 경계에서 **BLOCKED/LAUNCH_REJECTED**, scope `CHROMIUM_LAUNCH_ONLY`. 보안 승인을 뜻하지 않고 실패 syscall의 원인을 추측하지 않는다. Sandbox/SwiftShader untrusted-input·라이선스/SBOM 및 현장 #113/#193, full source/material fidelity는 계속 별도다.

### Manager 수용 및 게시 경계

Manager는 위 frozen source·QA·정확 image 결과를 근거로 검증 전용 PR의 root 통합/commit/게시를 수용했으며 재작업 요구0이다. 원래 Zone timeout 실패/재시험은 위에 모두 보존했다. 정확 원격 HEAD CI 성공·리뷰/병합/GHCR 및 운영 수용은 아직 확인/수행하지 않았다. 새 PR은 Draft로 열고 CI 시작만 확인한 뒤 완료 모니터링을 생략한다.

- 운영 판정: P1-A2 GO BLOCKED, #218 AC01–09 OPEN. 영속 Job/Worker/lease·G7/DB/원본/Current/운영 volume·제품0.58.1/GHCR 불변. 새 CI 완료는 아직 검증 대상이며 시작 이후 모니터링 생략.

---

## U-218-CI541-20261103 — PR #221 최종 CI 성공 및 테스트 범위 병합

- 검증 소스 `1e3f22c0547c96fd260d022770755c4008bf0a61`; [PR CI #541 / Run41611978658](https://github.com/planner77/layoutManager/actions/runs/41611978658), **9/9 jobs SUCCESS**, A2 CPU Proof Job `125835940366` 및 Required Verify Job `125843402950` 포함. 기존 #540 No tests found 및 #539 OOMKilled 실패는 [FailureLedger](FailureLedger.md)에 역사적으로 보존.
- Reviewer inline thread 0/unresolved 0, review submission 0, Main behind0/mergeable true. Owner 코드 병합 지시에 따라 Draft→Ready, Squash Main `dc80f88bc367e5735dc6878a609ab3089b6a4abc`; 원본/병합 Git tree 동일 `3530ff2beb370f108691031d4c3082695ec99b40`.
- [Main CI #140 / Run41615434676](https://github.com/planner77/layoutManager/actions/runs/41615434676) push 시작 확인, 완료 미모니터링. 이 사후 기록은 docs-only; GHCR 신규 이미지 게시 대상 아님.
- **판정:** 합성 Debian/Chromium CPU-only 검증 코드·PR CI 범위에 한한 PASS. 실제 #212 Viewer Adapter 충실도, trust/sandbox/Worker 장애 복구와 보안·현장 게이트는 미완료. P1-A2 운영 GO BLOCKED, #218 OPEN(AC01–09 미완료), P1-B/C/D 미착수. 서버 READY·자동 업로드 Worker·실 운영 릴리스 PASS를 주장하지 않음.

---

## U-218-CI540-20261103 — PR #221 discovery/resource repair

- Requirements/AC: [Issue218](Issue218.md) R09/R10; R-218-A2-01/03 remain unchanged. Failure chronology, observed causes and manually terminated probe qualifications: [FailureLedger](FailureLedger.md) top entry.
- Actual roles: root active Codex coordinated Manager scope, reproduced failures and implemented/profiled the test resource changes; `gpt-6-sol` Developer implemented discovery/workflow; `gpt-6-luna` independent QA assigned after root review. Supplied older gpt-5.6 roles are unavailable in the tool model catalog; branch AGENTS specifies the available6-series Developer/QA. Root is the recorded Manager substitute, not an assertion that a gpt-6-astra Manager ran.
- Environment: local Linux/amd64, Node22.14.0, lockfile Playwright1.63.0/Chromium153, package0.58.1, Debian bookworm proof image, no runtime/production DB, CAD or .env mounts.
- Original selectors reproduced0/0 with CLI exit1; unfiltered9. `node src/tests/a2/check-discovery.mjs --check`: PASS, exactly5+4, exhaustive/disjoint, negative inventory/zero-match checks. Coordinate regression:2 PASS, including100000th scalar mutation and nonfinite/null/sparse/length rejection.
- Root repaired mounted proof: unchanged required test,1 PASS/5.8s, Docker exit0/OOMKilled=false. Full actual DXF/real font/DTO/full validator/manifest/sourceSHA/file readback/same and new-process restore/all coordinate/ID/Layer/WCS checks;24 nodes/21506 vertices/1886914B/4 Korean hits/asyncErrors0. Observed sampled container max895MiB (not peak).
- Exact final Dockerfile image: build exit0, local image `sha256:1476aa1c497534424b7fd72184c044bece4b2c4471762464b4cfa18f32f08024` (test image only, not published). No source/font/helper bind mounts in packaged tests. Fresh sequential P0: **5 PASS/8.2s**; fresh P1-A2: **4 PASS/6.0s**. Both Docker exit0/OOMKilled=false. Same original CPU2/RAM1536MiB/swap1536MiB/SHM256MiB/PID256, UID10001/read-only/network-none/cap-drop/no-new-privileges and15m wait,180s test limits. Observed sample maxima845.3MiB and906.1MiB respectively (4/3 samples, not true peaks). Full proof preserved24 nodes/21506 vertices/1886914 DTO bytes/4 Korean hits/asyncErrors0; parse652ms/serialize139ms are single synthetic observations, not performance SLA.
- Independent QA `gpt-6-luna`: discovery PASS (~1s); `npm test` **149 files/982 PASS/0 FAIL,483.87s**; typecheck PASS (~1s); lint exit0/8 pre-existing warnings in untouched files; production build PASS (~40s, TypeScript/static9/9/standalone); diff-check PASS and no generated artifacts. QA ACCEPT for implementation scope. Root Manager reviewed QA and packaged proof and accepts this CI repair only.
- Additional root workflow check: actionlint syntax/type validation PASS. Full actionlint+ShellCheck reports2 existing SC1007 warnings at original workflow line352; the same2 warnings reproduced against originalHEAD. These advisory warnings were not introduced by this change and no CI check was disabled.
- New GitHub CI success is NOT VERIFIED; only start requested. #218 OPEN, P1-A2 GO BLOCKED; live #212 parity, untrusted-input sandbox, actual Worker OOM/kill/lease/restart and external field/security gates remain open. No P1-B/C/D, merge/GHCR/deployment or operational acceptance.

---

## #218 / PR #221 — CI #539 A2 isolated diagnostic results, final cgroup OOM (2026-11-03)

[CI #539](https://github.com/planner77/layoutManager/actions/runs/41578400956) at HEAD 883be4504496bed0e0555bb21dfaff48cc468e06: A2 proof 8/9 PASS. P0-1 SwiftShader WebGL2 PASS; P0-2 tiny LINE actual DTO=5734B, nodes=3, parse=498ms PASS; P0-3 actual Korean/nested INSERT DTO=1886914B, nodes=24, parse=574ms, full Validator PASS; P0-4 comparison DTO_ONLY=5734B vs ALL=15179B for a tiny input, both PASS; P0-5 page close rejects pending evaluate PASS. Final A2 crashed after DTO serialize (Playwright Worker SIGKILL), Docker State.OOMKilled=true, ExitCode=1, so full Validator/File/Fresh Restore NOT VERIFIED. docker stats peak OBSERVED 1.024GiB, not true peak; last memory.events sample preceded OOM.

Next test architecture: separate P0 suite and required A2 suite into fresh non-overlapping containers within the same required A2 job, with identical 1536MiB/CPU2/UID10001/offline/read-only resource policy and independent exit/OOM/artifact. Actual new run NOT VERIFIED. No Scene READY or P1-A2 GO until real full test succeeds and remaining security/operational gates pass.

---

## #218 / PR #221 — CI #538 real browser crash and unexecuted diagnostic changes (2026-11-03)

[Run41570387391](https://github.com/planner77/layoutManager/actions/runs/41570387391), HEAD 3b1c8c1ff9b1e42bde12af57cfeaf09ead3fa2a0: all ordinary Quality/Docker/General Chromium/G7 checks passed; CPU A2 proof 1 failed, auxiliary 3 passed, Required Verify dependent failed. Error was page.evaluate: Target crashed after REFERENCE_READY and REAL_DXF_PRODUCE_START. There is NO evidence yet to attribute crash to OOM, SwiftShader, DXF parser or GLB.

After this failure, code was authored for: P0-1 WebGL-only, P0-2 minimal LINE DXF→DTO, P0-3 Korean TEXT/MTEXT+nested INSERT→DTO, P0-4 cost of DTO_ONLY against legacy ALL, P0-5 fail-closed page termination. The original A2 full source SHA/custom DTO/manifest/full validator/temp file/independent restore is retained. The CI wrapper now intends to collect container ExitCode/OOMKilled/resources and seven-day synthetic artifact. All new tests/results are NOT VERIFIED until the exact new HEAD CI actually runs. Operational Worker restart/OOM and full #212 live Adapter fidelity remain NOT RUN.

---

## #218 / PR #221 — CI #525 실패 확인 및 reference Scene PoC 재사용 시험 경로 (2026-11-03)

[PR CI #525 Run41567538237](https://github.com/planner77/layoutManager/actions/runs/41567538237) exact HEAD `8042b1cd0c0ed6913666f93d91ed95f42c9b9b96`, `completed/failure`. 기존 Quality/Docker/일반 Chromium 2 shards/G7 Greenfield/Signed-Legacy **SUCCESS**. 별도 CPU Proof에서 Debian Playwright Chromium major153/TTF/JS 번들 준비 PASS, 보조 3건 PASS, 핵심 브라우저 엔트리 초기화 `PAGEERROR_SYNTAX_INVALID_REGEXP`로 FAIL. 실제 A2 DXF 파싱·DTO·Validator/Restore 결과 **NOT RUN**; Required Verify는 A2 mandatory 종속 FAIL. Chromium 버전 차이를 원인으로 확정했던 것은 부정됨.

**후속 코드 변경(시험 전):** A2 중복 browser bundle 대신 기존 일반 E2E에서 이미 통과한 `scene-poc-browser.ts`를 *그대로* CPU-only Test에 재사용. 합성 한글/nested BLOCK·큰 좌표 DXF와 동일 Source SHA, 실제 TTF, Node text index, strict DTO limit/manifest/SHA/full stored validator, WCS·Layer·Stable ID inventory, 임시 파일 SHA readback 및 fresh Chromium Process restore를 의무 검사. 일반 E2E/운영 code/CI gate 변경 없음. 파일 `src/tests/a2/headless-browser.ts` 삭제(중복 코드); `headless.spec.ts` 교체.

**미확인:** 새 A2 CPU proof가 실제로 구동되는지, 실제 한글 glyph/MTEXT·BLOCK fidelity, full live #212 Viewer Adapter 및 오류·OOM/kill/restart, 생산 G7/Storage/Job/폐쇄망 OCI 운영. 성공한 원래 Scene PoC만으로 #218 자동 Server Worker GO 또는 전체 AC01–09 완료 주장하지 않음. 기존 실패 #525는 FAIL로 보존, 새 CI HEAD 확인 전 새 PASS 수치 없음.

---

## #218 / PR #221 — CI #514 RegExp 초기화 실패 및 Browser provenance 변경(2026-11-03 KST)

- [CI #514 Run41564217739](https://github.com/planner77/layoutManager/actions/runs/41564217739), exact HEAD `ea3145c5b2fa2d55a6b631d45ffbed201937baf3`, FAILURE. Quality/Docker/General Chromium 2 shards/G7 E2E PASS. Test-only CPU Debian/UID10001 Build PASS. A2 핵심 Browser harness 초기화 `A2_HARNESS_PAGEERROR:SYNTAX_INVALID_REGEXP` FAIL, auxiliary 3 PASS, required Verify 종속 FAIL. DXF parser/Scene DTO/Manifest/full Validator/Restore는 본 A2 시험에서 **실행되지 않음**.
- **비교 증거:** A2 apt Chromium `156.0.8078.73`과 같은 PR의 일반 Browser `scene-poc.spec.ts` PASS에서 Playwright Chromium `153.0.8010.12` 차이 확인. 일반 Scene PoC의 46.7s 통과는 동일 A2 fixture/보안·영속 Worker 증거가 아니며 Chromium 버전이 root cause라고 확정할 수 없다.
- **보완:** Test-only Debian Dockerfile에서 Playwright npm lockfile에 연동된 Chromium을 이미지 빌드 중 설치하고 runtime `A2_BROWSER_EXPECTED_MAJOR=153` 확인. A2 runtime offline/UID10001/read-only/cgroups, JS 번들 에러 fail-closed, 기존 synthetic DXF→Scene/Validator/Restore 단언 일절 유지. 새 CI exact HEAD 결과 미확인 전 정상 변환/오류 해소 PASS 주장 금지. 실제 #212 Adapter fidelity, untrusted DXF sandbox security, OOM/kill/restart/field #113/#193 미검증.

---

## #218 / PR #221 — CI #506 브라우저 Bundle SyntaxError 실측 및 대응 상태 (2026-11-03 KST)

[PR CI #506 Run41561632191](https://github.com/planner77/layoutManager/actions/runs/41561632191), HEAD `06d6bda224e74b30e40548184902ec44f518dd6e`, completed/failure. Quality/General Chromium 2 shards/Docker/G7 Greenfield/Signed/Legacy 전체 SUCCESS. P1-A2 Debian Chromium Job `125673426531`에서 합성 4개 중 3 PASS, 실 DXF-to-Scene 1 FAIL, `HARNESS_SCRIPT_REQUESTED → PAGEERROR_SYNTAX → A2_HARNESS_PAGEERROR:SYNTAX`. Node/Font/browser preparation success, DTO/Validator/Restore는 **호출되지 않음**, Required Verify는 mandatory A2 FAIL 때문에 실패.

**확실한 결함과 미확정 원인 분리:** 브라우저가 초기화용 JS를 `SyntaxError`로 거절한 사실은 확인. 원문 스택·번들 위치·어떤 의존 코드인지는 미수집, 이전 secure-context 가설은 **확증되지 않음**. DTO/Scene/원본 DXF 문제라고 보고하지 않는다.

**수정:** 시험 번들을 `chrome115`에 맞춰 compile(실 Chromium 156보다 낮은 타깃), Node `vm.Script` 구문만 사전 검사, 클라이언트 pageerror safe code(일반 SyntaxError 외 INVALID_TOKEN/HTML_AS_SCRIPT/MODULE_MISMATCH 등) 및 synthetic 번들 line/column 수치만 기록. 원문/비밀/도면 텍스트 로그 차단, 원래 실제 DXF/한국어/INSERT/SwiftShader/전체 Validator/Fresh process comparison 테스트는 그대로. 새 정확 HEAD npm/test/Docker/PR CI 결과는 실행 관측 전 미확인. 운영 Scene 자동 Worker/권한 처리 없음. P1-A2 GO BLOCKED.

---
## #218 / PR #221 — CI #495 실제 HARNESS_READY 오류·보완 후 검증 상태 (2026-11-03 KST)

[PR CI #495 Run41558698574](https://github.com/planner77/layoutManager/actions/runs/41558698574), exact HEAD `91509d1dce9522acb2b8a0f934c9b08fa63fa4b8`, `completed/failure`. Scope/Quality(typecheck·lint·unit·build)/Docker/General Chromium 1·2/G7 Greenfield/G7 Signed+Legacy SUCCESS. A2 CPU Job `125664254542`: Build/UID10001 성공; test 1/3 핵심 Headless DXF→Scene FAIL(`PAGEERROR_OTHER`, `HARNESS_READY` 20s timeout), Watchdog 단위 + DXF 폭증·비지원 사전검증 2/3 PASS. Required Verify `125669442387` FAILURE는 A2에 종속.

**실패 경계:** Host bundle/TTF/Chromium 시작까지 성공·페이지 초기 JavaScript 오류 감지 이후 sceneA2 미등록. DXF getFromPath/DTO/Validator/Restore 단계에 도달한 증거 없음. 오류 코드는 allowlisted OTHER이므로 실제 내부 예외/보안 origin 원인 확정 불가.

**수정:** 실험 페이지를 기존 브라우저 E2E와 같이 potentially trustworthy `http://localhost`로 변경; 네트워크는 여전히 컨테이너 `none`, 페이지/font/script는 Playwright virtual route로만 충족. 실제 `isSecureContext`, `crypto.randomUUID`, script served 검사 추가. 페이지 JS error는 raw 출력하지 않고 allowlisted category로 즉시 테스트 FAILED. 기존 timeout/cgroups/윤리적 비공개/GO Gate 불변. 추가된 정적 origin 회귀는 **작성했으나 CI 미실행**. 외부 로컬 Chromium 런타임은 관리자 정책에 의한 HTTP 요청 차단으로 이 GitHub CI 환경과 일치하는 독립 시험에 이용 불가.

**현재:** 새 코드의 DXF→Object3D/CUSTOM_DTO/full validator/restore/SwiftShader identity/한글·BLOCK fidelity 성공 **NOT VERIFIED**. PR CI 시작 확인 전·후에도 최종 결과 실제 확인 전 PASS/GO 금지. [FailureLedger](FailureLedger.md), [TestPlan](TestPlan.md), [Issue218](Issue218.md).

---

## #218 / PR #221 — CI #485 정확 실패 결과·후속 계측 보완 (2026-11-03 KST)

[CI #485 Run41555129727](https://github.com/planner77/layoutManager/actions/runs/41555129727) HEAD `23d4b8df0948e4ee1d6b3a34dba9673e56136440`, 최종 FAILURE. **PASS:** Scope, Quality(TypeScript/Lint/Unit/Build), Docker runtime, General Chromium 2 shards, G7 Greenfield, G7 signed/legacy; A2 Debian image build·UID10001 및 폭발적/비지원 DXF 사전검증 Playwright 1개. **FAIL:** A2 CPU proof의 전체 synthetic DXF→Object3D→CUSTOM_DTO→Validator→Restore 시험 180000ms timeout (1 failed/1 passed). Required Verify는 A2 실패로 FAIL.

**원인 범위:** CPU proof의 타입/출력 경로는 CI #479 이슈가 해결된 것으로 관측됨. 하지만 어디서 대기했는지는 기존 테스트에 단계별 진행 진단이 없어 UNKNOWN. Chromium WebGL/Font/파서/OOM 원인은 확정 불가. Actual source→Scene 변환, Manifest/Restore/Fidelity/SwiftShader 최종 판정 및 async error0 **NOT VERIFIED**.

**수정 범위:** 실제 DXF/폰트·전체 validator 테스트를 제거하거나 skip하지 않고 harness/browser phase 로깅, launch/navigation/converter 독립 deadman timeout과 `A2_TIMEOUT:<phase>:LAST_PHASE=<allowlisted>` 안전 코드, never-resolving Promise fail-closed 회귀 추가. Playwright 180s/컨테이너 15m, Debian UID10001 read-only, no-network, CPU/RAM cap 유지. 로컬 npm/Chromium/Docker 명령은 이 원격 GitHub 변경 환경에서 별도 실행하지 않았고 새 PR CI 완료 결과를 확인하기 전 수정 효과 PASS 주장 금지. P1-B/C/D 금지. [원장](FailureLedger.md), [TC](TestPlan.md).

---

## #218 / PR #221 — CI #479 실패 실측과 수정 후 재시험 경계 (2026-11-03 KST)

- 실패 Run: [CI #479](https://github.com/planner77/layoutManager/actions/runs/41551357571), HEAD `f40ba4a0dcc6ebe4c5598cf6962e847e81bdfbe3`, `completed/failure`. Quality Job `125639534190`: TypeScript `TS2322` `headless.spec.ts:34` (font JSON metadata language map vs string field) — Typecheck FAILURE, Unit/Build 미실행. A2 CPU Job `125639534277`: Debian 컨테이너 빌드 + UID10001 검사 성공, Playwright test 시작 전 default `/app/src/test-results` mkdir `ENOENT`로 FAILURE (read-only rootfs). Docker-runtime Job `125639534249` SUCCESS, UI·G7 E2E SKIPPED, Verify `125644337801` FAILURE(종속).
- 적용한 보완: `src/tests/a2/headless.spec.ts`의 `TTFLoader` metadata를 typed `Record<string,unknown>` guard로 처리, 실 TTF/한글 glyph/Font build 수명주기 보존. `src/tests/a2/playwright.config.ts`의 Playwright artifacts를 `/tmp/a2-playwright-results` (격리 tmpfs)로 이동. container `--read-only`/UID10001/network none/resource limits 및 기존 Required CI 일절 완화하지 않음.
- 수정 후 TypeScript/Vitest/Playwright/SwiftShader/CUSTOM_DTO/Font/Save/Restore 결과는 **새 CI의 실제 로그 전까지 NOT VERIFIED**, 별도 local npm/Docker 테스트 NOT RUN. `a2-cpu-probe`에서 DXF 시험이 돌지 않았으므로 이전 "실험 구성"을 P1-A2 GO 또는 field acceptance로 승격하지 않는다. 상세 [FailureLedger](FailureLedger.md), [Issue218](Issue218.md).

## #218 / P1-A2 — CPU-only 서버 변환기 실험 PR (2026-11-03, 시험 전)

**기준 Main:** `55b82cdf35f6d9f606dcab16830cd61ce0098082`; 기술 검증 분리 브랜치 `feat/218-a2-headless-cpu-gate`. 기존 #217의 [CI #457](https://github.com/planner77/layoutManager/actions/runs/41520729471) 직접 Node DXFViewer unhandled rejection 4건 NO-GO 및 [CI #472](https://github.com/planner77/layoutManager/actions/runs/41524840539) 8/8 CI SUCCESS는 **선행 역사적 사실**이며 이 PR의 신기술 GO 증거가 아니다.

- 구현: `src/tests/a2/headless-browser.ts` 실제 DXF Viewer/SwiftShader candidate, `headless.spec.ts` 실 DXF→Object3D→CUSTOM_DTO full manifest/SHA/domain validator→temporary file→Restore와 browser synthetic comparison, `dxf-risk-preflight.ts`의 BLOCK 폭증·cyclic/unsupported fail closed, `fixtures.ts`, `playwright.config.ts`, `Dockerfile`, 독립 Vitest Unit, PR CI 필수 a2-cpu-probe.
- **실행하지 않은 시험:** npm ci/typecheck/lint/Vitest, 실제 Docker image build, 독립 Chromium/WebGL, PR CI, 대형 DXF 입력, actual #212 Adapter/UI/Server SceneRepository 비교, 영속 Job/Worker, G7 Publisher/Auth, OOM/kill/restart·late async 종료 테스트, real CPU/RSS/p95, 라이선스/SBOM, 현장 #113/#193/2PC/DRM.
- **실측값 없음:** DTO size, geometry nodes, Bounding Box 오차, renderer identity/SwiftShader 증명, 비동기 에러 count, CPU/RAM/latency는 로그가 생기기 전 수치를 기록하지 않는다.
- 합성 입력에도 unknown entity·중첩 BLOCK/한글 MTEXT 완전성 보장은 별도 비교 Gate 필요. 동일 Browser harness에서 성공하더라도 실제 #212 UI Builder/외부 고객 도면 비교·프로세스 공격면까지 자동 PASS가 아님.
- **판정: P1-A2 GO 증거 부족 → BLOCKED / 운영 사용 NO-GO.** P1-B/C/D 시작 불허; #218 OPEN, #216 기존 이미지·tag/digest/운영 DB 불변.

[전체 Gate/대안 비교](Issue218.md), [TC](TestPlan.md), [FailureLedger](FailureLedger.md).

---

## #216 / PR #220 — 단일 플랫폼 OCI template P1 예방 수정 검증 상태 (2026-11-03)

[PR #220](https://github.com/planner77/layoutManager/pull/220) P1 리뷰: 후보 빌드는 linux/amd64 단일 플랫폼이므로 Buildx `.Image`는 JSON 단일 config; 잘못된 `index .Image "linux/amd64"`는 정상 OCI에서 template 실패를 유발할 수 있다. `{{json .Image}}` + 기존 JSON schema/labels/source 검증으로 수정, unit 문자열 회귀 추가. 현 시점 정적 코드 변경만 적용, 실제 Buildx candidate/OCI Main CI 및 최종 PR CI 성공은 NOT VERIFIED. 원본 #138 failure와 구별한다.

---

## PR #220 / #216 — CI #476 실패한 TypeScript 단계와 수정 후 재검증 (2026-11-03)

[CI #476 Run41542254686](https://github.com/planner77/layoutManager/actions/runs/41542254686), 실패 source `eb9b56d76b8bbdde6bcacafffe9b012272deb25f`: Scope SUCCESS, Quality Job `125609157571` TS2345 (시험용 환경변수 override object union에 `undefined` 추론), Unit/Build/브라우저는 미실행/선행 실패 SKIPPED. Docker Job은 이 시점 별도 진행 중(종료 결과 확인 전). 수정은 `Record<string,string>[]` 타입 명시로 테스트 내용 그대로 유지. 신규 정확 HEAD의 PR CI가 성공하기 전 GHCR 복구/Runtime 배포 완료 주장 금지.

---

## #216 / Main CI #138 GHCR 검사 실패, 복구 PR 검증 범위 (2026-11-03 KST)

- 이전 PR [CI #475](https://github.com/planner77/layoutManager/actions/runs/41536335056) 8/8 SUCCESS/Source `5b5b5e7e3937e847fb114185268e4fd01eabe54c`; Main `934e5561ff7d54b388d59b6f8e8f40bd14bcd45e` Squash/동일 tree `2a8ed7596a4b3444a03fd839784c9e0a5a125a0c`. 이것은 **Runtime 코드 검증**, 실 GHCR 게시 수용과 분리.
- [Main CI #138](https://github.com/planner77/layoutManager/actions/runs/41539913477) attempt1/2 모두 GHCR check `G7_RELEASE_REGISTRY_CHECK_FAILED`, Build/Promotion/OCI 지표 SKIPPED. Annotated `v0.58.1`의 원본 source 고정은 확인, Registry의 실제 0.58.1 pair 존재/부재·새 이미지 digest/role/source/amd64 및 현장 배포는 **미검증**.
- 복구 변경: GHCR 정확 ref-bound missing 응답만 absent 허용, 인증/통신/모호 오류 fail-closed, source/tag object/tree 세 곳 고정 및 정확 recovery Squash/허용 path만 원본 release source checkout, App+Migrator OCI label/amd64/digest 사전 검증. 변경은 Workflow·Unit·문서이며 실제 Runtime/DB/Scene/Volume/원본 DXF 불변.
- 신규 Unit: `issue216-ghcr-workflow.test.ts`에서 both-existing/both-absent/partial/ambiguous/mixed-not-found·tag source mismatch/approved recovery source·tag SHA/tamper 부정 시험. `g7-staging-ghcr-guard.test.ts`에서 정확 recovery scope 허용/근접 제목 및 운영 경로 거부. 로컬 npm/tsc/Vitest/Docker/Playwright/GHCR는 이번 원격 작업 시 **NOT RUN**; PR CI 시작·완료/별도 Main GHCR 실제 증거를 반드시 구분하고 PASS 선반영 금지.

---

## PR #219 / #216 — PR CI #474 실패 및 두 테스트 보완 (2026-11-03 KST)

- [PR CI #474 Run41533666311](https://github.com/planner77/layoutManager/actions/runs/41533666311), Source HEAD `73fde4ad0e0ff1fc0927a41a96a7332e0eee704d`: **completed/failure**. Quality (`125580157984`) TypeScript `TS2339` `prior.installId` 오류, Docker (`125580157616`)의 Python `test_g7_deploy.py:123` helper chain 3개 vs assertion 2개 불일치. Scope PASS, Verify FAIL(종속), Greenfield/Chromium/G7 Signed+Legacy E2E SKIPPED.
- 수정: Manifest 설치 ID는 typed `f.old.installId`로 검증, 전체 `0.56.0→0.58.1` 정방향 registry chain을 Python expected 3 `COMPATIBLE`로 반영. 기존 G7 호환 정책, Code/Schema/Upgrade/host, GHCR pair fail-closed gate 불변. 관련 P1 리뷰의 지적 사항을 코드와 일치시킴.
- 새 회귀의 로컬 npm/tsc/Vitest/Python/Docker/Playwright **NOT RUN**. 수정 커밋 push 후 PR CI를 시작하며 성공은 실제 CI 완료 전까지 NOT VERIFIED. 첫 #474의 실패 판정을 변경하지 않는다. 새 GHCR 이미지, Main 병합, 운영 .env/DB/CAD/Volume 변경, 자동 Scene Worker/현장 수용은 미수행.
- [원인·정확 Job](FailureLedger.md), [계획](TestPlan.md), [Issue 설계](Issue216.md).

---

## #216 — 0.58.1 코드 후보/시험 상태 (2026-11-03 KST)

- 원인 증거: [Main CI Run41528536561](https://github.com/planner77/layoutManager/actions/runs/41528536561)에서 기존 0.58.0 App/Migrator 모두 존재하여 Skip duplicate version build=SUCCESS, 신규 App/Migrator candidate Build·Promote·OCI 측정 단계는 SKIPPED. Main CI 완료 SUCCESS와 신규 GHCR 게시 여부는 별개다.
- 변경 내용: 0.58.1 package/lock, semantic zones G7 0.58.0→0.58.1 COMPATIBLE edge, 기존 0.56/0.57 경유 체인, 합성 기존 설치 upgrade 및 DB 보전 회귀, Python host/Disposable WAL smoke 후보 버전 정합, immutable GHCR pair fail-closed, 신규 TypeScript 2종 unit.
- 실행 구분: GitHub 원격 연결로 코드와 테스트/문서만 반영. 본 기록 작성 당시 별도 로컬 npm ci/typecheck/lint/Vitest/Playwright/Build/Docker/OCI **NOT RUN**. PR CI 전체 성공과 GHCR 새 App/Migrator digest 실제 게시/현장 수용은 **NOT VERIFIED**; PASS 주장 금지. PR 생성 시 CI 시작 여부만 확인하고 사용자 지시대로 완료 모니터링하지 않는다.
- 검증 항목: [TC-216](TestPlan.md), [설계](Issue216.md), [실패 원장](FailureLedger.md). #218 자동 Scene Worker/Queue/UI, #113/#193 실제 복잡 DXF/GPU/2PC 모두 후속 별도.

---

## PR #217 / #208 — Main CI 완료 결과 및 GHCR 실제 Skip 정정 (2026-11-03 KST)

- [Main CI Run41528536561](https://github.com/planner77/layoutManager/actions/runs/41528536561), 기능 Squash SHA `a4f040c641d6d7192caa711142bfb66cfcab825c`: `completed/success`; scope Job `125562440174` SUCCESS, GHCR workflow Job `125562604239` SUCCESS. 그러나 두 Docker candidate Build 및 Version/latest pair promotion/OCI measurement는 **SKIPPED**이고 `Skip duplicate version build` 단계가 **SUCCESS**. **이번 PR 코드의 신규 GHCR 이미지 게시 0건**, workflow Job 성공을 release 완료로 표시 금지.
- [Docs-only Main CI Run41529165102](https://github.com/planner77/layoutManager/actions/runs/41529165102), 사후 기록 SHA `f54b99bc89ef99aee54c07af6be0dbf7c4d47ab4`: `completed/success`, scope SUCCESS, GHCR Build+Push Job **SKIPPED**. 소스 기능 검증은 앞선 PR #472 8/8 SUCCESS, 운영 GHCR 릴리스는 [Issue #216](https://github.com/planner77/layoutManager/issues/216) OPEN. 기존 v0.58.0 App+Migrator tag/digest 불변, 실제 새 버전·G7 등록 upgrade/OCI pair 게시를 별도 완료해야 함.
- #208 `closed:not_planned / superseded`와 [#218](https://github.com/planner77/layoutManager/issues/218) OPEN은 바뀌지 않음. Node direct 변환 NO-GO, 자동 Worker/Scene Queue/목록 UI 및 #113/#193 현장 미완료; 성공·미구현·미게시 구분.

---

## PR #217 / #208 — 최종 PR CI #472 8/8 성공·Main 병합 및 후속 수용 범위 (2026-11-03 KST)

- **검증:** [PR CI #472 Run41524840539](https://github.com/planner77/layoutManager/actions/runs/41524840539) exact source `5501770c6773980672b1e2c6f54ccaaaf21874d4` `completed/success`. 성공 Job: Scope 125550451788; Quality TS/Lint/Unit+Integration/Build 125550520026; Docker Runtime/Migrator 125550519987; G7 Signed/Legacy 125554081036; G7 Greenfield 125554081107; General Chromium shard1 125554080929·shard2 125554081118; Required Verify 125559182398. 8/8 SUCCESS, 기존 #442/#445/#457 실패 이력 별도.
- **병합:** 미해결 thread 0, 리뷰 제출0(Owner Managed), Main behind0·`mergeable=true`에서 PR #217 Ready→[Squash Main a4f040c](https://github.com/planner77/layoutManager/commit/a4f040c641d6d7192caa711142bfb66cfcab825c). [Main CI Run41528536561](https://github.com/planner77/layoutManager/actions/runs/41528536561) 정확 squash SHA `push/in_progress` 시작 확인, 결과는 요청대로 미모니터링.
- **기술 수용:** Node direct upstream parser는 비동기 DOM dependency로 **NO-GO**; 해당 실패 방지와 하위 serializer 테스트 성공은 자동 Scene 영속화를 입증하지 않는다. #208은 `closed:not_planned / SUPERSEDED_BY_#218`, 원래 R1–R5/AC01–09 전부 [#218](https://github.com/planner77/layoutManager/issues/218) OPEN에 승계. Headless software renderer/지원 파서·Worker/Queue/G7 재인가·목록 UI·Docker 운영 및 실제 #113/#193 field **미구현/NOT VERIFIED**.
- **이미지 릴리스:** Main workflow는 0.58.0 기존 GHCR App+Migrator pair 중복 publish를 생략하도록 되어 있어 새 #217 source의 실제 GHCR 게시·digest/운영 배포 **NOT VERIFIED**, 다음 새 SemVer/G7 registry/OCI paired publish는 [#216](https://github.com/planner77/layoutManager/issues/216) OPEN. 기존 이미지/Volume/원본/권한 변경 없이 합성 CI 성공과 릴리스 완료를 구분.

---

## PR #217 / #208 — CI #457 962/962 단언 PASS·비동기 오류 4건, Node direct NO-GO 판정 (2026-11-03 KST)

- **원본 CI 증거:** [PR CI #457 / Run41520729471](https://github.com/planner77/layoutManager/actions/runs/41520729471), source `b7909f4c98704fa14d63caf5baa750105af313ac`, `completed/failure`. Scope Job `125536288340` SUCCESS, Docker image/migration/runtime `125536434792` SUCCESS, Quality `125536434951` FAILURE (**145/145 Test files·962/962 assertion PASS**, 단 Vitest **4 unhandled rejection Errors**), Required Verify `125538556873` FAILURE. G7 Greenfield `125538137150`, G7 Signed/Legacy `125538137795`, General Chromium E2E `125538138098` SKIPPED.
- **실제 오류:** `ReferenceError: window is not defined` at `node_modules/three-dxf-viewer/dist/main.js:7986`, WMFJS 관련 `bd.lWMFJS`/후속 WMF/RTF 객체 생성 스택, `gm.getFromPath` → `probeNodeScene:173`. 다른 Vitest assertion이 모두 PASS이어도 반환 Promise 밖에서 비동기 오류가 발생해 전체 CI FAILED. 소스/폰트 유효·부분 Object3D/DTO 생성 가능성과 **서버 변환 안정성**은 별도 판정이다.
- **기술 결과:** pinned `three-dxf-viewer@1.0.44` 직접 Node CPU-only 접근을 **NO-GO**로 확정한다. 원인 자료를 근거로 `NODE_DIRECT_DXF_STATUS`와 Node process fail-closed guard를 `getFromPath` **이전**에 적용하고 `SCENE_CONVERTER_UNAVAILABLE`을 반환. 실제 DXF→Scene positive Test를 무작정 PASS로 남기거나 `window`/Promise를 mock하지 않고, 가설의 부정 결과를 정확한 테스트로 변경. 별도의 pure Three Group→기존 CUSTOM_DTO/manifest/restore 시험으로 **serializer 부분 능력만** 구분한다. 기존 SHA·TTF·JSON fail-closed 테스트 유지.
- **현 검증 경계:** 변경은 GitHub 원격 작성으로, 이 환경에서 별도 `npm ci/tsc/Vitest/Docker/Playwright` 직접 실행 **NOT RUN**. 다음 PR CI의 실제 success/0 unhandled 여부는 확인 전 **NOT VERIFIED**. A1 Node-direct는 이미 NO-GO이고, 대안 Headless Chromium/Node-native converter를 구현·실증하지 않았으므로 Issue #208 AC-01/02, 영속 Queue/G7 Worker·도면 목록 UI·OCI 배포 및 실 DXF/GPU/2PC 현장 #113/#193은 계속 미완료. PR/MAIN 병합, GHCR 게시, 운영 파일·Volume/Auth·Writer 수정 없음. [후속 설계](Issue208.md)/[TC](TestPlan.md)/[실패 원장](FailureLedger.md).

---

## PR #217 / #208 — CI #445 Unit 1건 실패·글꼴 원인 및 수정 후 재검증 보류 (2026-11-03 KST)

- **정확 CI:** [PR CI #445 Run41517145247](https://github.com/planner77/layoutManager/actions/runs/41517145247), source HEAD `6932550e7c5e37d6f11b9d528da2fc594a26fb5b`, `completed/failure`. Scope Job `125524284796` SUCCESS. Quality `125524385155`은 TypeScript/ESLint 단계를 통과한 뒤 **Unit/Integration 959 PASS·1 FAIL(960 tests; 144 pass/1 fail suites)**. 정확 실패 `tests/unit/scene-node-converter-poc.test.ts:21`, `probeNodeScene`의 `FONT_PREPARE/SCENE_FONT_UNAVAILABLE`, `node-converter-poc.ts:130`; 합성 DXF 실제 변환은 폰트 준비 전에 중단. Docker `125524385169` SUCCESS. Required Verify `125528106539` FAILURE. G7 Greenfield `125526962110`, G7 Signed/Legacy `125526962286`, General Chromium `125526962515` SKIPPED.
- **확인된 설계 불일치:** git의 `src/public/fonts`에는 `NanumGothic-Regular.ttf`/OFL만 있고 `CadKorean.typeface.json`은 `scripts/fonts.mjs`가 dev/build 실행에서 파생한다. CI의 Unit 단계는 Build 이전이므로 생성 JSON 부재로 `readFile`이 실패, catch에서 고정 `SCENE_FONT_UNAVAILABLE` 반환. 이것을 파서/OOM/생산 폰트 파손으로 오진하지 않는다.
- **수리:** 실험 Node PoC에서 TTF/JSON 명시 입력을 분리; git-tracked TTF를 `TTFLoader.parse`해 `scripts/fonts.mjs`와 동등한 family/meta label을 적용한 뒤 `FontLoader.parse`. 생성 25MiB JSON 파일 생성/체크인/CI 순서 조작 없이 Node only. 기존 JSON 구조 검사 유지, 확장자 allowlist 및 8MiB TTF·32MiB JSON 상한, malformed TTF/JSON/미지원 확장자 보안 부정 테스트 추가. 기존 합성 DXF→Object3D→CUSTOM_DTO→restore 통합 Unit 삭제·우회 없음.
- **검증/미구현:** GitHub 원격 코드·테스트 반영만 확인, 로컬 npm/Vitest/TypeScript/Docker 실행 **NOT RUN**. 새 PR CI 성공·새 HEAD 변환 및 Server CPU-only GO/실제 Browser fidelity/Worker/Queue/G7 auth/실 도면 20MiB+ 모두 **NOT VERIFIED**. 기존 READY/Current/원본·메모·Zone/Outline/DB/Volume/GHCR 변경 없음. 근거 [FailureLedger](FailureLedger.md), [TC](TestPlan.md), [설계](Issue208.md).

---

## PR #133 — 최종 docs-only CI 및 병합 검증 (2026-11-03 KST)

- **Source/정합성:** HEAD `ddd958f5fbaef22d4d34868c24edac8d07d20075`, 8개 Markdown 변경, Main behind0, 병합 충돌0·미해결 리뷰 thread0. 기존 Main 문서 보존, `ADR-127` 고유, FR-MENU-EXT-01~04/NFR-MENU-EXT-01 및 TC-MENU-EXT-001~005, 후속 13개 Closed 이력과 #65 인증된 Admin/G7·지원 Schema 조건 반영. Source/Squash Tree 동일 `19d6b20c522f638f7b3bfb44bc2ce8d6b620ff67`.
- **PR CI #443:** [Run41514898605](https://github.com/planner77/layoutManager/actions/runs/41514898605) `completed/success`, Scope 125515840608/Verify 125516013309 SUCCESS, 기타 Runtime/Browser/Docker Job 5개는 **SKIPPED**(docs-only). 과거 Run40408850027/HEAD e0f5fcb3 성공은 별도.
- **Main 병합/CI:** Squash [`5d030cde48416e018dfddb59ac9f43f95552c373`](https://github.com/planner77/layoutManager/commit/5d030cde48416e018dfddb59ac9f43f95552c373); [Main CI Run41515158324](https://github.com/planner77/layoutManager/actions/runs/41515158324) `completed/success` release-scope Job 125516725543 SUCCESS, GHCR push 125517090647 SKIPPED. PR merged/closed, 기존 #127 및 13개 이슈 closed 유지.
- **테스트 해석:** `TC-MENU-EXT-001~005`의 실제 CAD UI, G7 server/keyboard/Canvas lifecycle 및 현장 회귀는 신규 실행 대상이 아니며 **NOT RUN**; 이번 PASS는 정확 docs-only scope gate의 성공이다. 신규 GHCR App/Migrator pair 발행과 실 설치/운영 승인을 주장하지 않는다.

---

## PR #133 — Viewer 메뉴 규약·요구/설계 추적의 정적 검증 (2026-11-03 KST)

- **기존 CI:** 원 PR HEAD `e0f5fcb3b11997edc0452a32079dc4ac62b0e7dd`, [Run 40408850027](https://github.com/planner77/layoutManager/actions/runs/40408850027) `completed/success`, Verify Job 121873600618 및 Docker Job 121873600155 SUCCESS. 이는 최신 Main 통합 HEAD의 CI 결과를 대체하지 않는다.
- **정적 검증 기준:** `AGENTS.md` 필수 메뉴/Drawer·권한·수명주기 판단, 고유 `ADR-127`(기존 `ADR-054` 두 항목 그대로 유지), `FR-MENU-EXT-01~04`/`NFR-MENU-EXT-01`, `TC-MENU-EXT-001~005`, #127 매트릭스 13개 이슈 모두 Closed, #65 인증된 G7/Admin/지원 Schema 조건부 활성, 최신 Main 원문 보존. PR 문서 6개 변경·본 TestReport·FailureLedger 이외 앱 코드/DB/릴리스 파일 변경 없음.
- **미실행:** 문서 정책 자체는 새 기능 구현이 아니다. `TC-MENU-EXT-001~005`의 Viewer UI·키보드·Drawer/Canvas·Renderer·권한 API 관련 실제 Unit/Playwright/E2E는 이번 문서 PR에서 새로 실행하지 않음(**NOT RUN**); 차후 기능 변경 PR에서 실증. 현장 CAD/GPU/운영 인증·GHCR 게시 수용과 무관.
- **원격 검증 게이트:** 신규 HEAD PR CI 필수 Jobs, review thread0/충돌0/behind0를 업데이트 후 확인하며 실패 시 원장에 Run/HEAD/수리 추가. 실행 전 새 CI 결과를 PASS로 기록하지 않는다.

---

## PR #217 / #208 — PR CI #442 TypeScript 실패 및 보완 후 재검증 대기 (2026-11-03 KST)

- **정확 실행:** [PR CI #442 Run41514760273](https://github.com/planner77/layoutManager/actions/runs/41514760273), source HEAD `dfb059e96e189b21e8a176b91f865d200cf9ee47`, `completed/failure`.
- **Job 분리:** Scope `125515649993` SUCCESS. Quality `125515840109` FAILURE (TypeScript 단계 `server/scene/node-converter-poc.ts:104 TS2345`, `148/149 TS2322`); Docker `125515840257` FAILURE (`Next.js npm run build`에서 동일 `104 TS2345`, Next Typecheck 직후 중단), Required Verify `125516975378` FAILURE. G7 Signed/Legacy `125516569193`, General Browser `125516569867`, Greenfield UI `125516570306`는 선행 gate 실패로 SKIPPED. Lint/Unit/Browser/worker runtime 성공 주장 불가.
- **정확 원인:** `JSON.parse` 결과의 `unknown`은 `FontLoader.parse(FontData)`에 바로 전달할 수 없다. `preflightSceneRoot`는 실제로 네 수치를 항상 반환하지만 반환형을 `SceneBuildStats=Partial<Record<...>>`로 잘못 선언하여 `geometryCount`와 `attributeScalars`가 `number | undefined`가 되었다. Docker Build failure는 네트워크/런타임/이미지 배포 실패가 아니라 동일 TypeScript 검사의 중복 노출.
- **보완 코드:** `isTypefaceJson` TypeScript runtime shape guard로 안전한 입력만 FontLoader.parse에 전달하고 invalid/missing JSON은 고정 `SCENE_FONT_UNAVAILABLE`. `ScenePreflightStats`는 `Required<Pick<SceneBuildStats,sceneNodes|geometryCount|attributeScalars|maxDepth>>`로 정확 지정. `scene-build-diagnostics.test.ts` required numeric compile contract 및 `scene-node-converter-poc.test.ts` malformed font fail-closed를 추가. 대체 `?? 0`로 누락을 은폐하지 않으며 기존 CI/TypeScript Strict 유지.
- **검증 상태:** 이번 보완은 GitHub 코드 리뷰·정적 근거 기준으로 반영, 이 환경에서 Node/npm/Vitest/Next/Docker 직접 실행 **NOT RUN**. 수정 후 새 정확 HEAD의 CI·Node PoC 실행/브라우저 동등성 결과는 확인 전 **NOT VERIFIED**. A1–A5 및 #208 P1-B/C/D 전체 미완료, #113/#193 현장 별도. [이슈 기술 게이트](Issue208.md), [실패 원장](FailureLedger.md).

---

## #208 P1-A — CPU-only Node converter PoC 제출 전 확인 상태 (2026-11-03)

- 작업 범위: 실제 three-dxf-viewer 1.0.44 + font pre-parse(data URL) Node DXF→CUSTOM_DTO/restore 실험, SceneBuildJob 상태/오류 taxonomy, 합성 Vitest 두 파일, 이슈 P1-A/P1-B/C/D 설계·운영 경계 문서.
- **실행 결과:** 이 GitHub 연결 기반 환경에서는 `npm ci`, `npm run typecheck`, `npm run lint`, `vitest`, Playwright, Docker/OCI/CPU-only Benchmark를 **수행하지 않았다(NOT RUN)**. 실행 가능한 PoC가 존재하는 것과 성공은 다르다.
- **미구현:** Durable Queue/Worker/transactional enqueue/G7 Actor revocation 재검증/Scene storage publish/Compose/Prisma/목록 UI/API·재시도. 업로드 사용 경험은 기존 수동 경로로 유지한다.
- **현장:** 5MiB 미만/20MiB 이상 실 도면, 한글·BLOCK/INSERT 깊이, CPU/RAM/OOM·WebGL/2PC, #113/#193 미수용. PR CI 실행 여부와 exact HEAD/Run은 별도 실제 기록 후에만 변경한다.
- Gate 및 TC: [Issue208](Issue208.md), [TestPlan](TestPlan.md). PR·Main·GHCR/Issue 종료 성공 판정 전부 NOT VERIFIED.

---

## #212 / PR #214 — 최종 CI #440 PASS 및 Main 병합·GHCR 분리 판정 (2026-11-03 KST)

[PR CI #440 Run41508339395](https://github.com/planner77/layoutManager/actions/runs/41508339395), HEAD `ef83a210c16abe040c7ae451d14012a8469085b9`, **completed/success 8/8 Jobs**(Scope, Quality TypeScript/Lint/Unit/Build, Docker Runtime, Greenfield, G7 Signed/Legacy, General Chromium shard1/2, required Verify). 역사적 #438 TypeScript 신규 테스트 fail 및 #439 Greenfield R3 구 메시지 fail은 보완되었고 실제 통합 CI 성공으로 재검증되었다. 미해결 review thread0, 충돌0, Main behind0 확인 후 [PR #214](https://github.com/planner77/layoutManager/pull/214)를 Squash Main `1ba46dc4a2fd50e06ce84069fce98977c55632bf`로 병합; 동일 Git tree `e6dda9e901ac1951ba360e66f6317d77baedfcfd`. Issue #212 **closed/completed**(코드·합성 CI). [Main CI #130 Run41511179566](https://github.com/planner77/layoutManager/actions/runs/41511179566) 시작만 확인 후 결과 미모니터링. GHCR release workflow는 기존 `0.58.0` App/Migrator pair가 있으면 duplicate skip하므로 **#212 신규 코드의 실제 이미지 게시/digest 미확인**; 후속 새 immutable release/G7 registry 검증을 [#216](https://github.com/planner77/layoutManager/issues/216)에 OPEN으로 추적한다. 복잡 실 DXF(5MiB/20MiB+), GPU/메모리/현장 장비·업무 연결, #113/#193/208 등은 CODE CI PASS와 무관하게 미수용.

---

## PR #214 / #212 — CI #439 Greenfield R3 Scene 상태 단언 불일치 (2026-11-03 KST)

[Run41504441240](https://github.com/planner77/layoutManager/actions/runs/41504441240), source `0cc44705b504c3a89facd969a31f76ba5131816d`: Quality(TypeScript·Lint·Unit·Build), Docker Runtime, General 2 shards, G7 Signed/Legacy, Scope **각 SUCCESS**; G7 Greenfield E2E **25/26 PASS**, `typed-outlines.spec.ts:196` 한 건만 FAIL; Required Verify 종속 FAIL. `scene-status` 실제는 `THREE_SCENE_ARTIFACT_READY`(브라우저 Artifact만, 미게시)였고 이전 문구를 검사하는 E2E가 계약을 따라가지 못했다. 테스트를 실제 renderer 및 3분리 상태 계약의 검증된 Artifact/서버 미게시/fallback 아님 확인으로 보완하고 기존 R3 Source·Outline·Scene 보존 시험을 유지했다. 코드상 변경과 메시지 정적 확인은 **새 E2E 성공 증거가 아님**; 후속 Run은 생성/시작만 확인 후 미모니터링, 합격 NOT VERIFIED. 실제 사내 복잡 DXF/성능/작업 승인·GHCR/현장 수용 별도.

---

## PR #214 / Issue #212 — TS18046 CI #438 실패와 보완 (2026-11-03 KST)

[CI #438 Run41463408681](https://github.com/planner77/layoutManager/actions/runs/41463408681) 정확 HEAD `f4e54af94415622488ae94dc55352fc75fb42fdf`에서 **TypeScript FAIL** `scene-build-diagnostics.test.ts:54`의 `unknown` 속성 접근 3건(TS18046); Docker runtime/scope SUCCESS, Unit/Lint/Build 및 Browser E2E 미실행(SKIPPED), required Verify FAIL. 신규 테스트에서 명시 `unknown`→`instanceof ViewerLoadError` guard로 runtime 타입 확인 후 `stage/reasonCode/message`의 안전한 고정 출력만 검증하도록 보완했다. 실제 TypeScript/Vitest/전체 PR CI **재검증 결과 전까지 NOT VERIFIED**. 최초 실패/변경 근거는 [FailureLedger](FailureLedger.md), [TestPlan](TestPlan.md) 참조. 실제 DXF/GPU/영속 Scene/Site 업무 검증은 별도.

---

## Issue #212 — 수동 Scene 단계 진단/DTO 직렬화 PR CI 후보 (2026-11-02)

- **수정·검토 근거(정적/코드 확인):** 기존 adapter의 catch-all로 `adapter-load:LOAD` 발생 및 Viewer's sceneMode=build fallback 후 잘못된 "원본 DXF 변환 완료" 안내 경로 확인. 수정 경로: `src/viewers/core/scene-build-diagnostics.ts`, `src/viewers/three-dxf-viewer/{adapter,scene-serialization}.ts`, `src/domain/scene-payload.ts`, `src/viewers/core/{adapter,metrics}.ts`, `src/features/cad-viewer/{viewer,scene-status}.tsx/ts`. 원본 Source SHA/Server Scene API/Repository·CurrentScene·CAS·Audit/DB Schema/권한 미변경.
- **작성된 합성 테스트(실행 전):** `scene-build-diagnostics.test.ts`는 allowlist/code/원인 masking, ViewerManager spoofed-message 차단, stage elapsed/outcome, fallback/local-vs-server READY, Object3D node/scalar/depth cap을 확인하도록 추가. `scene-loader.test.ts`는 세 단계 nested Group/Line/Mesh와 typed buffer round trip, Custom DTO만 Three JSON 생략 및 저장 전 validate 수행을 확인하도록 확장.
- **실행 판정:** 원격 GitHub Connector 환경에 로컬 npm 의존성·실 브라우저/Docker 실행을 제공받지 못했으므로 Typecheck, Lint, Vitest/Integration, Playwright/Greenfield, Docker, 현장 CAD/GPU는 **NOT RUN / NOT VERIFIED**. PR 생성 뒤 GitHub CI 실행만 시작하고 사용자 요청대로 완료를 모니터링하지 않는다. 코드 작성·정적 대조만으로 CI PASS/실 20MiB CAD 원인 확정 또는 성능 개선 실증을 주장하지 않는다.
- **잔여 수용:** 실제 복합 DXF·WCS/Layer/한글·원본 확장 인스턴스 비교, peak heap·p95·30초 Worker, 브라우저 fallback 후 Save POST0, 저장 API Actor/Source/READY 연계, 현장 #113/#193과 서버 Worker #208은 별도 Gate. [설계·판정](Issue212.md), [시험](TestPlan.md), [원장](FailureLedger.md).

---

## PR #213 / Issue #211 — 최종 CI 합격·Main 인계 (2026-11-02)

[PR CI #437 Run41454272839](https://github.com/planner77/layoutManager/actions/runs/41454272839)의 정확 source HEAD `dff4995fbbecb9838d259ec904f2f6b0aaf7d0a1`에서 **completed/success, 8/8 Job SUCCESS**. Scope, Quality(static/type/lint/unit/build), Docker Runtime 및 실제 업그레이드 smoke, General Chromium E2E 두 shard, G7 Greenfield, Signed/Legacy Browser, required Verify 성공. 전 실패 #436의 GF-109 정적 계약 1건과 Codex P2 `steps` 누락은 수정·회귀 후 통합 CI 합격. 리뷰 1 resolved/0 unresolved, Main behind0, mergeable=true 확인 후 [PR #213](https://github.com/planner77/layoutManager/pull/213) Squash Main `423ff93a0866becb436511cca5207fb713411dfd`; 검증된 PR HEAD 및 Squash Main의 tree `fa568d361feb0c62d7c666c836c694e96b30a6b9` 동일. [Issue #211](https://github.com/planner77/layoutManager/issues/211) 코드·합성 CI 범위 closed/completed. [Main CI #128 Run41458237958](https://github.com/planner77/layoutManager/actions/runs/41458237958) 시작만 확인하고 완료 미모니터링. v0.58.0 GHCR App+Migrator는 이전 #209 릴리스 Main CI #126의 게시 성공 증거가 있으며 이번 버전의 재게시·새 digest는 미확인/중복 방지 대상. 실제 운영 데이터·Site/원본 SHA·현장/업무 수용(#96/#113/#193)은 수행되지 않았고 PASS로 해석하지 않는다. 실패 원문·재작업 기록은 [FailureLedger](FailureLedger.md)에 보존한다.

---

## #211 PR #213 — CI #436 실측 실패 및 P2 재시험 대기 (2026-11-02)

[Run 41449453584](https://github.com/planner77/layoutManager/actions/runs/41449453584) 정확 HEAD `f306fe8d4dd9b0809a5816a4ad36a87e981c3ce1`에서 Quality Job `125291629006` **Unit 943/944 PASS, 1 FAIL**(`src/tests/unit/standalone.test.ts:163`, GF-109 명령 순서); Docker runtime Job `125291629108` **SUCCESS**; scope success; 후속 Browser skipped/required Verify fail. Unit 오류는 #211 신규 CLI 실행을 반영하지 않은 정적 계약이다. 기존 테스트를 폐기하지 않고 12개 실제 Host CLI/Admin/CAD/재시작/영속 단계를 순서대로 검사하도록 갱신했다. 정적 비교 12/12 일치 확인(새 전체 Vitest PASS는 아님). [Codex P2](https://github.com/planner77/layoutManager/pull/213#discussion_r4442687155)의 #209 helper 필터 `steps` 누락도 안전한 허용 배열/결정·hash 교차 검증과 실제 helper→frontend 직렬화 테스트로 보완했다. 수정 이후 Python/Vitest/실 Docker/전체 PR CI **NOT VERIFIED**; 실제 결과는 새 Run/Job에서 확인 전까지 PASS로 기재하지 않는다. 운영 현장·GHCR/배포·Volume/DB 변경 없음.

---

## Issue #211 — 구현·검증 요청 상태 (2026-11-02)

단일 호스트 CLI `src/scripts/g7-deploy.py`, Python 정책 회귀 `src/scripts/test_g7_deploy.py` 및 PR CI Python gate/Disposable Compose 신규 설치·별도 start 검증을 추가했다. #209 helper에 위임하므로 실제 WAL-aware backup/restore·registry/SQL edge는 기존 통합 스위트를 회귀한다. 정적/단위/실 Docker 실행 결과는 새 PR CI가 완료되기 전 **NOT VERIFIED**, 성공 수·실제 GHCR digest·운영 DB/Volume/업무 수용도 미확인이다. 별도 로컬 Docker 검증은 이번 원격 작업 환경에서 수행하지 않았다. [TC-211](TestPlan.md), [설계·제약](Issue211.md), [FailureLedger](FailureLedger.md) 참조.

---

## PR #210 P2 — Docker readonly WAL 점검·복구 재검증

리뷰 [discussion_r4439624166](https://github.com/planner77/layoutManager/pull/210#discussion_r4439624166)의 stopped WAL/no-sidecar+readonly 실패를 QA가 이전 실제 image로 RED 재현했다. 수정한 CLI-only read inspection adapter의 안정된 private detached copy와 live-WAL 통상 SQLite 조회를 구별하고 Runtime HTTP를 유지했다. 설계/TC는 Architecture/Decisions/TestPlan의 P2 절, 원인·재작업은 FailureLedger를 따른다.

최신 관련 통합 **23/23 PASS**, 독립 stopped/active WAL9/9는 이에 포함된다. TypeScript/관련 ESLint PASS, 실제 최종 migrator `sha256:0680cebc4de62254b45f2d0010e434dad29358fecbcfc18103adcbc78fe204da`의 reusable Docker smoke는2회 PASS다. readonly stopped DB의 preflight/plan/status 성공·원본 metadata/hash/sidecar 불변, activeWAL committed row 반영, apply의 SQLite recovery set 및 source readonly 격리 restore 지문 동일을 검증했다. 새 smoke는 PR CI 필수 Docker step으로 연결했다. 앞선938 전체 및 이전 Browser 수용은 별도 근거이며 이 delta의 새 전체 실행으로 합산하지 않는다. 실제 Manager는 P2 source/QA/패키징 범위를 수용했다. P2 수정 commit `472f481cca94df3af211b7fac5c99ac20ec47631` 게시 후 reply4439718467과 실제 thread resolve를 완료했고 원격 unresolved0/Main behind0/mergeable=true를 재조회했다. PR CI Run41404605393은 시작만 확인했고 후속 문서 HEAD의 새 CI도 시작까지만 확인한다. 결과/Job/log 모니터링·병합·GHCR·배포는 수행하지 않았다.

---

## #209 / PR #210 게시·CI 인계

최종 source `f37913e08b18c6b470aac017f3408975d39e0d6e`/tree `c91ed877c8e2c50dab1c9f0fc23e0022c109af59`를 기능 branch로 게시하고 [PR #210](https://github.com/planner77/layoutManager/pull/210)을 생성했다. Main behind0·mergeable=true·미해결 리뷰0을 확인했다. [PR CI Run41402534033](https://github.com/planner77/layoutManager/actions/runs/41402534033)는 시작(in_progress)만 확인했으며 성공/완료는 미확인이다. 후속 문서 synchronize의 최종 HEAD CI도 시작까지만 확인하고 모니터링하지 않는다. 전체 실패·Secret/동일 tree/역할·현장 경계는 FailureLedger와 아래 본 검증 기록을 따른다. PR 병합·Issue 종료·GHCR/실 운영 적용은 수행하지 않았다.

---

## U-ISSUE209-20261102 — Greenfield 릴리스 업그레이드 (0.58.0 후보)

- 역할/범위: 실제 gpt-6-astra Manager가 Requirements/Architecture/Decisions/TestPlan에 요구·설계·AC를 먼저 기록하고 source review/재작업을 지시했다. 실제 gpt-6-sol Developer가 registry/backup/engine/CLI를 구현했고 실제 gpt-6-luna QA가 독립 fault/복구·업무 그래프 및 Browser 검증을 수행했다. Root는 호스트 도구·Docker/Compose/CI·운영 문서·버전과 전체 검사/게시를 담당한다. 별도 worktree에서 기존 로컬 변경2개를 보존했다.
- 설계/구현: `greenfield-upgrade-registry.ts`의 명시 release+contract+forward chain, `greenfield-upgrade-engine.ts`의 preflight/plan/apply/status 및 lock/hold/journal, `greenfield-upgrade-backup.ts`의 WAL 일관 backup·CAD/manifest 세트·격리 복원, `scripts/g7-greenfield.ts`의 안전한 진단에 연결한다. installId·업무 Schema/기존 baseline/checksum을 유지한다. 호스트 `scripts/g7-upgrade.py`는 실제 이미지 쌍 및 정지 전 volume 일치, 모든 실행 writer0과 고정 migrator Image ID를 검사한다. 실제 production Schema migration edge는 아직 등록하지 않았다.

| 검증 | 실제 결과/근거 |
| --- | --- |
| 설치/생성 | npm ci exit0,910 packages; db:generate exit0. 기존 보안 권고29건은 별도 유지 |
| 전체 Unit/Integration | **142 files /938 PASS/0 FAIL,408.71초**; `/tmp/issue209-unit-final.log`. 첫 전체927PASS/2FAIL 및 수정은 FailureLedger에 보존 |
| 최종 집중/독립 QA | Developer+기존 auto+독립 QA3files **18/18 PASS**; 독립 QA7건은 여기에 포함되어 중복 합산하지 않음. 실제 데이터 그래프·WAL·동시 apply·공간 부족 apply·손상/대상 거부·3개 실제 SIGKILL checkpoint 포함 |
| 정적/Build | TypeScript exit0, 전체 ESLint0errors/기존8warnings. production Build exit0; 첫 TS/build 실패 및 후속 수정·재검증은 FailureLedger에 분리 |
| 호스트 도구 | Python10/10 PASS; 태그/digest/role/source/platform·다른 volume App stop0·다른 project writer·restore 생성 경합/새 대상·stdout planId/비민감 field 필터. Python syntax 및 PR scope7/7 PASS |
| 일반 Browser | upload/workflow/delete **10 PASS/50.1초**, Chromium1243/port3350/격리 local DB. 등록·메모/검색·Current·보호 삭제·두 DXF Viewer 전환 및 오류/크기 진단 |
| Auth/Legacy/Greenfield 통합 | QA **37/37 PASS/113.78초**; Runtime Auth/Migration/Greenfield 관련 통합 회귀 |
| Docker | 실제0.56.0 old App/Migrator의 일회용 설치→Admin/Grant/DXF/Current→새 후보 upgrade→모든 DB 행/CAD 지문 동일→restart/health/login/read/보호 delete PASS. 최종 고정644파일 context App/Migrator pair로 재실행 PASS(`/tmp/issue209-docker-upgrade-final.log`); native/tsx/Prisma 패키징도 실제 Docker Build에서 통과 |
| 독립 Browser | Greenfield 전체 최초 **23/26 PASS,3 FAIL**; Build 종료 후 fresh fixture로 first-install+memo-anchor **3/3 PASS**, outline-types 필수 준비를 포함한 first-install+typed-races/typed-outlines **8/8 PASS**. signed Runtime **1/1**, Legacy migration **1/1 PASS**. 하나의26/26 실행으로 합산하지 않음 |
| 최종 Compose | 최종 pair의 신규 설치→one-shot migrate 성공 후 App 시작→health/Admin/Grant/CAD→migrator 재실행/App restart→health/login/read/보호 delete PASS(`/tmp/issue209-compose-verification.log`). 고유 project/container/network/volume만 사용 |
| PR CI | 최종 로컬 수용 후 PR 생성으로 시작한다. 완료/GHCR·운영 적용 NOT VERIFIED; 모니터링하지 않음 |

TC-209-01/05/07의 `g7-greenfield-upgrade-qa.test.ts`는 AuthSession/Audit/UserRole/Site Grant·기준정보 UUID·Version/Current·DXF/Scene bytes·SceneAsset·CadMemo/CadOutline/CadZone가 들어 있는 합성 DB의 **모든 table row**를 upgrade 전/후 및 복원본에서 비교한다. TC-209-03의 generic migration fixture는 새 table/DDL hash/history·pre/post condition과 정확한 승인 SHA, 실패 transaction rollback을 실제 실행한다. TC-209-04/06은 실제 apply 공간 부족에서 DB/manifest 동일·lock/hold/journal0·정상 retry를 확인하고, child process를 BACKED_UP/MIGRATION_COMMITTED/MANIFEST_COMMITTED에서 SIGKILL하여 RESTORE_REQUIRED와 격리 복원을 증명한다. 이것은 사내 실 자료 또는 전원 손실/모든 filesystem 장애 순서의 증명이 아니다.

TC-209-08/09의 CLI/호스트·Docker 실행은 Secret/setup code/DB·CAD 내용을 출력/업로드하지 않고 정형 상태·성공 판정만 남긴다. 합성 복구 세트/브라우저 cookie·DB는 Git/CI artifact 대상이 아니다. 실제 source/digest provenance는 운영자의 신뢰 정책이 필요하며 OCI label 대조를 암호학적 서명으로 표현하지 않는다.

제한: 이미 게시된 immutable0.57.0 pair는 바뀌지 않으며0.56→0.57은 registry/새 engine의 논리 회귀다. 수정 기능은0.58.0 후보에 포함된다. 레거시6→7/HOLD 채택, S3/Expert 업그레이드·실 운영 볼륨 변경·이미지 게시/배포·현장 수용은 미수행이다. backup 전 hard crash에는 복구 세트가 없을 수 있어 BLOCKED 상태에서 별도 안전 백업/운영 조사가 필요하다. 일반 downgrade/자동 강제 복구는 지원하지 않는다. 최종 Manager 판정/Commit/Push/PR/CI 시작은 별도 게시 절에서 구분한다.

최종 image 검증은 동일644파일 고정 context(content SHA256 `b4f10d301059159aa3fc7f8e91b49f5152f0d254bbb700a5fa8a17c6fa03754f`)에서 생성한 App `sha256:410b3970af735b9d43dd4492d0a4f57cf636ec8512afb97ef8510d65bc8f9f9c`, Migrator `sha256:a6e9d68d874eeeb303e0d74dba897d1a83bbf5aab10d5cf570b5597c9fc47222`를 사용했다. OCI revision label은 합성값이며 실제 release commit의 출처/게시 증거가 아니다. 이후 변경은 운영 Runbook의 backup 전 중단 제한 문구뿐이며 runtime code는 동일하다.

### 최종 tagged digest delta와 Manager 판정

최종 source review에서 tag@digest repository parsing 거부를 발견·수정했고, `repo:version@sha` + `repo:version-migrate@sha` 정상 쌍과 잘못된 tag/role/repo·동일 digest·빈 tag·source 누락 회귀를 추가했다. 마지막 정확 소스 **집중3files/19 PASS,TypeScript/관련 ESLint PASS**, 호스트10 PASS다. 앞선 전체938은 이 delta 이전 근거이며 새로운 전체939 실행으로 합산하지 않는다.

정확644파일 context `f153add098a848243d7f72e7533bbcf21debdca1edfde6530b31412052d9661c`에서 두 이미지를 재빌드하고, 사설 loopback 임시 Registry에만 올린 실제 App/Migrator tag@digest 쌍으로 genuine0.56→candidate 업그레이드·모든 row/CAD 지문·restart/Health/login/read/보호삭제를 재시험해 PASS했다(`/tmp/issue209-tagged-digest-smoke.log`). 마지막 local Image ID는 App `sha256:0007c3caf72f5793bc5601fdfb49cf1fa339c407f50feea313e9971763d4efba`, Migrator `sha256:1a525b1c7005d0ee4407597271694f029e1915ca28f4a3d3d088ea076fb40fc6`다. GHCR 게시0/실운영 volume 접근0, 시험 Registry와 disposable volume을 정리했다.

실제 Manager는 위 마지막 수정·집중/재빌드/실행 증거를 검토하여 **코드·합성 검증 범위의 Commit/Push·PR/CI 시작 GO**를 복원했다. Source 변경은 여기서 동결하고 문서의 한계/진단만 갱신한다. CI 완료·병합·릴리스/운영 적용은 포함하지 않는다.

---

## #202 / #204 — 0.57.0 후보 검증 (2026-11-02)

- 기준: origin/main `8b38b84`, 별도 `feat/issues-202-204-20261102` worktree. 원래 workspace의 Compose/next-env 수정2건은 보존했다. Node22.14.0/npm11.10.0, Chromium1243/SwiftShader, Linux x86_64, 격리 임시 SQLite/CAD fixture를 사용했다.
- 역할: gpt-6-astra Manager가 요구·설계·AC/구현 GO와 최종 검토, gpt-6-sol Developer2명이 이슈별 구현·집중 시험, gpt-6-luna QA가 독립 검증을 담당했다. Root는 통합 리뷰·전체 검사·개인정보/오류 응답 보완·문서·게시를 담당한다. 실제 PR 승인/운영 현장 수용과 로컬 QA는 구분한다.
- #204 추적: FR-204-01/02 → MasterManager 변경 필드만 PATCH → `master.test.ts`, `g7-runtime-cad.test.ts`, `zone-runtime.test.ts`, `master.spec.ts`. 다섯 단계2회 이상 이름 변경, 활성/비활성, 이름 정규화/형제 중복/미분류, Site/Role/감사 롤백, 같은 UUID/부모·Version·Current·원본·사용자 도면명·메모·구역 보존을 확인했다. 새 브라우저에서 최신 트리·등록 dropdown·목록/위치 필터·층 이력·Viewer 위치를 확인했다. 기존 이름/ID 모델·Schema·migration은 추가하지 않았다.
- #202 추적: FR-202-01–04 → 공통 `authorized-drawing-memo-list` + CadListRepository의 인가 Site/제목·본문 EXISTS와 page-scoped window query → `drawing-memo-list.test.ts`, `memo-search-auth.test.ts`, 일반/Greenfield `drawing-memo-list` Browser. 빈 조건의 공개 조회, nonblank의 실제 signed G7 권한, 고정3 SELECT·Version count/페이지 중복 방지·SQL 최대3 preview와 exact Memo/Version 링크, Current/전체·AND·URL·320px 및 DXF content GET0을 검증했다. 삭제/SHA 불일치 제외와 기존 #90 검색은 유지한다. 홈 metadata no-referrer 및 GET 오류 private,no-store/no-referrer를 추가했다.

| 검사 | 실제 결과 |
| --- | --- |
| 설치 / Prisma 생성 | 각각 exit0; 설치 당시 기존29 advisories(19 moderate/9 high/1 critical), 자동 수정 없음 |
| 전체 Unit/Integration | 140 files / 924 PASS / 299.32초, `/tmp/issues202-204-unit-all.log` |
| 구현 집중 | Developer master+G7 27 PASS, Greenfield 참조 보존1 PASS; 최신 drawing memo 고정3 SELECT 포함3 PASS, signed auth4 PASS. 전체와 중복 합산하지 않음 |
| 최종 Typecheck / ESLint | exit0 / 0 errors·기존8 warnings; `/tmp/issues202-204-{typecheck,lint}-final2.log` |
| 최종 Production Build | exit0; `/tmp/issues202-204-build-final2.log`, cache/referrer 보완 포함 |
| 독립 QA 집중 | 최초40 PASS/1 FAIL(기존 Zone15초 timeout), 원래 Zone suite 단독 재실행8 PASS/15.18초. 원장에 최초 실패 보존 |
| 독립 QA General Browser | 8 files / 27 PASS / 57.2초, port3556, `/tmp/qa-202-204-e2e.log`; master/current/name/link/upload/workflow/#88–90 및 #202320px 포함 |
| 독립 QA signed Browser | 3 PASS / 30.2초, port3557, `/tmp/qa-202-204-greenfield.log`; 실제 세션·권한/오류 header·메모 exact focus·HTML text escape·referrer·320px 검증 |

### #202 합성 SQL 성능

`npx tsx tests/benchmark/drawing-memo-search-benchmark.ts` exit0, `/tmp/issues202-204-benchmark-final.log`. 초기1회 제외 후3회 warm median(ms), 페이지25/100. 분산은10메모/Version과 인가 Site 절반, 집중은 한 Version에 전량을 배치했다. 기존 `ix_cad_memo_version_live(version_id,deleted_at)`를 사용하며 EXPLAIN에서 Version scan·메모 version/live index lookup을 확인했다. 결과는 페이지 Version당 최대3개 본문만 전송하나 SQLite는 해당 Version의 모든 일치를 검사/순위화한다.

| 메모 수 | 분산 page25 / page100(ms) | 단일 Version 집중 page25 / page100(ms) |
| --- | --- | --- |
| 1k | 1.7 / 1.6 | 1.0 / 1.0 |
| 10k | 2.5 / 3.5 | 3.9 / 4.0 |
| 100k | 22.9 / 24.3 | 32.4 / 34.7 |

관측 최대34.7ms를 근거로 Manager가 동일 환경·분포·반복의 **100k warm median ≤100ms**를 임시 로컬 회귀 목표로 정했다. 이 측정은 repository/SQL만 포함하며 로그인·인가·HTTP·브라우저 렌더·동시 부하 및 실 CAD/GPU/운영 SLA가 아니다. 원본 파일 조회/파싱은 경로상0이다. 신규 인덱스/FTS/Schema는 도입하지 않았다.

- 최종 수용: gpt-6-astra Manager가 위 실제 증거를 검토하고 **0.57.0 코드·합성 범위 PR 게시/CI 시작 GO**를 회신했다. 독립 QA의 반복 benchmark도 통과했다(100k 분산21.2/22.2ms·집중34.9/33.9ms, `/tmp/qa-202-204-benchmark.log`). Root가 `/tmp/qa-202-204-memo-{320,results}.png`를 직접 검토했다. 320px 메모 입력/본문·결과는 document overflow 없이 접근 가능하며 기존 전역 header nav clipping은 이전부터 존재한 제한으로 남긴다.
- 게시 경계: PR CI는 시작만 확인하고 완료 모니터링하지 않는다. PR 병합·Issue 종료·태그/GHCR·운영 DB/Volume/Auth/Writer 변경은 수행하지 않는다. 실패·재시험·Git 인증 경계는 FailureLedger를 따른다.

---

## PR #200 / #196 — 최종 원격 수용·Main 릴리스 인계 (2026-11-02 KST)


- 정확 PR HEAD `2c5b5e13bd91f8c219e64c69c6ee4abcdd289a06`의 [PR CI Run 41313128074](https://github.com/planner77/layoutManager/actions/runs/41313128074) **completed/success**. Scope124867497306, Quality124867539436, Docker124867539334, Greenfield124868822851, General shard2 124868822853, signed/legacy124868822855, General shard1 124868822925, required Verify124870819418 모두 **SUCCESS(8/8)**. Type/Lint/Unit/OCI/benchmark/Build, exact-HEAD artifact Browser 및 Docker native/migrator/Compose gate가 통과했다. 이전 실패 결과를 덮어쓰지 않는다.
- P2 thread1 **resolved/미해결0**, 제출 review2 COMMENTED·CHANGES_REQUESTED0, Main behind0·mergeable=true·conflict0 확인. Owner Managed 범위이며 새 독립 PR 승인을 주장하지 않는다. 실제 Manager 최종 GO 후 Root가 정확 제목/빈 본문 Squash Main `ae928b4229fc98ef2cb0274f8c132cb62ba376f3` 병합 및 #196 closed/completed를 확인했다. 소스/버전0.56.0은 검증된 PR tree 그대로다.
- [Main CI Run 41339438989](https://github.com/planner77/layoutManager/actions/runs/41339438989), Merge HEAD `push/in_progress` 시작 확인. GHCR App `0.56.0`/Migrator `0.56.0-migrate` 정상 release 경로를 시작했으며 **완료·태그·OCI digest·배포는 NOT VERIFIED**, 요청대로 모니터링 생략. 현장 #113/#193 미실행 및 운영 Auth/Writer·DB/Volume 비변경 경계를 유지한다.
- 실패/재시험·실제 역할·병합 전 gate·게시 경로의 정본은 [FailureLedger](FailureLedger.md) 상단을 따른다. 아래의 이전 '새 CI 미확인/병합 없음'은 당시 시점 기록이며 현재 상태는 이 절이 우선한다. 본 사후 문서 갱신은 docs-only이며 앱 재시험·GHCR 재게시 대상으로 확대하지 않는다.

---

## PR #200 / #196 — 실패 Run 41309924909 수리 검증 (2026-11-01)

정확 실패 HEAD `9f88d8e`, General shard2 **66PASS/2FAIL**, 나머지 gate 결과와 원인/RED 근거는 [FailureLedger](FailureLedger.md) 상단을 따른다. 과거 Run의 성공 Job은 수리 HEAD 결과로 승계하지 않는다.

- 실제 역할: **gpt-6-astra Manager** 수리 AC/설계·재작업 및 최종 수용, **gpt-6-sol Developer** Zone read/retry·Renderer 전환·관련 시험, **gpt-6-luna QA** 독립 Browser 검증, **root** CI/review 조사·결정적 Source RED·통합/전체 검사·가이드/원장·게시. Manager의 전체 Unit 성공 조건은 아래 결과로 충족했다.
- Node22.14.0, Chromium1243/SwiftShader, 임시 SQLite/storage 및 생성 DXF. G7/운영 설정·원본/Current·DB schema·package version 불변, 미릴리스 후보0.56.0 유지. 설계/시험 계약은 Issue196/TestPlan/Architecture/ViewerPanelPolicy 및 과거 #151 원장을 참조했다.

| 실제 실행 | 결과 |
| --- | --- |
| 변경 전 기존 CI 두 파일 집중 | **6 PASS/1 FAIL/27.9s**, workflow errors[]에5033건 재현(`/tmp/pr200-repair-red.log`). |
| 변경 전 새 Source 결정적 경합 | **1 FAIL/2.3s**, 실제 HTTP body 완료 뒤 ArrayBuffer Promise 지연→manual escape에서 completed1 기대/2 관측(`/tmp/pr200-source-red.log`). |
| 변경 전 P2 retry Browser | **FAIL/13.3s**, 최초 Zone503 후 메뉴 disabled로 retry 불가(`/tmp/pr200-zone-retry-red-results`). |
| 전체 `npm --prefix src test` | **139 files/915 PASS/309.04s**(`/tmp/pr200-repair-unit.log`). |
| `npm --prefix src run typecheck`, `lint`, `build` | 각각 **exit0**; Lint0 errors/기존8 warnings. `/tmp/pr200-repair-{typecheck,lint,build}.log`. |
| General6files, port3541 | **19 PASS/1.5분**(`/tmp/pr200-repair-green.log`). 기존 workflow·모든 #124/#126/#127 회귀, source completed GET 정확1 및 새 실제 경합1.4s, OFF Zone GET0/5030, ACTIVE 최초/갱신503·401·403 이후 데이터 제거/Retry·같은 Canvas/Source 유지·늦은 Version 응답 격리. |
| signed G7, port3543 | **5 PASS/1.1분**(`/tmp/pr200-repair-g7.log`). first-install2+구역 keyboard/actor폼1+실 Snap/Reset1+semantic1; metadata/reconnect/동일 ID 경계 mapping·원본 SHA/fallback 승인 조회 보존. |
| 독립 QA, port3542 | **6 PASS**(`/tmp/pr200-repair-qa-report.md`). Source 경합·Zone retry 두 사례·기존 수동 복구·OFF/fallback·runtime OFF. Root의19/5건과 중복을 고유 TC 수로 합산하지 않는다. |

- 제품 수리: 명시적 public status OFF는 Zone GET 생략, ACTIVE는 실제 보호 GET으로 계속 인가. 오류 때 보호 정보는 폐기하면서 retry shell을 유지한다. 같은 Version renderer-only escape는 pending Source를 공유하고 Version/full reload/source-error의 기존 초기화는 유지한다. 기존 콘솔 오류0·성공 download1 기준을 완화/필터링해서 통과시키지 않았다.
- Git/리뷰: latest main `2bccf90`, behind0·conflict marker0. 수리 source commit [`e3d442b`](https://github.com/planner77/layoutManager/commit/e3d442b46fdfecb28929b730fecf59c58db0c774)의 tree `479acb1d722c52b67a4e4f40300450495dcf2e10`이 검증한 로컬 snapshot과 일치한다. P2 review4435768211에 답변4435894228·resolve 후 전체1/unresolved0을 재조회했다. 해결 결과 기록 commit을 source 뒤에 연결해 expected PR HEAD9f88d8e로 fast-forward 게시하고 CI 시작만 확인한다. 이전 로컬 Git 인증 거절에 따라 동일 지정 저장소의 연결 도구를 사용하며 기존 commit/branch를 보존한다.
- **NOT VERIFIED:** 새 정확 HEAD 원격 PR CI 완료 및 새 Docker/GHCR/운영·현장 수용. 이번 수리는 로컬 필수 gate와 독립 QA를 통과했으며 사용자의 요청대로 CI 재시작 이후 모니터링하지 않는다. PR 병합·이슈 종료·권한/Writer 활성화 없음.

---

## Issue #196 — 구역 0.56.0 로컬 검증·PR 인계 (2026-11-01)

- 기준 Main `2bccf90`, branch `feat/issue-196-semantic-zones-20261101`; 이 기록을 포함한 commit snapshot. 원래 workspace의 Compose/next-env 변경 2건을 별도 worktree로 보존했다. [Issue196](Issue196.md)의 설계/AC와 Database/ViewerPanelPolicy를 구현에 연결했다.
- 실제 역할: **gpt-6-astra Manager** 설계·AC·재작업 판단 및 최종 코드/합성 범위 검토, **gpt-6-sol Developer 2명** Backend/Viewer 구현, **gpt-6-luna QA** 독립 수치·코드·320/375px Browser 검증, **root** 공통 Geometry/Auth·통합 review·Reset 이력/감사 rollback·Docker closure 보완·시험·문서·게시. QA 보고 `/tmp/issue196-qa-report.md`. Manager 재작업 항목을 수정했고 마지막 actor 폼 검증도 통과해 **로컬 CODE+검증된 합성 범위 수용 / PR GO** 조건을 만족했다. 원격 CI·Docker·현장 수용으로 확대하지 않는다.
- 환경: Linux, Node22.14.0/npm11.10.0, Playwright 고정 Chromium1243/SwiftShader, 생성 DXF, owned `/tmp` SQLite/storage. 일반 1440×1000 및 320/375×800, Snap Browser DPR2. 실제 운영 DB/Volume/Auth/Writer·원본 CAD는 변경하지 않았다.

| 실제 실행 | 결과·검증 경계 |
| --- | --- |
| `npm --prefix src run db:generate`, `typecheck`, `lint`, `build` | **각 exit0**. 전체 Lint 0 errors/기존8 warnings. 최종 Build `/tmp/issue196-build-verified.log`; 마지막 변경은 Docker packaging/test/docs이며 앱 JS 소스는 동일하다. Typecheck `/tmp/issue196-typecheck-verified.log`, Lint `/tmp/issue196-lint-verified.log`. |
| `npm --prefix src test` | **137 files/911 PASS**, 333.37s(`/tmp/issue196-unit-final.log`). 기존 실패 결과는 FailureLedger에 보존. |
| 신규 packaging 및 standalone; 최종 Geometry/Auth/Panel/QA/closure 집중 | **25 PASS**(`/tmp/issue196-packaging.log`), **18 PASS**(`/tmp/issue196-last-targeted.log`). 전체 911과 중복을 합산하지 않는다. 신규 closure 검사는 전체 run 이후 추가한 1 TC다. |
| `tests/integration/zone-runtime.test.ts` | **7 PASS**(`/tmp/issue196-zone-rollback.log`, 전체 run에도 포함). signed Reader/Editor/Admin·Site/CSRF/권한 회수·잘못된 SHA/Scene·idempotency/CAS/분류/계층/FK/Unique/cycle·V2 미매핑 및 명시 remap·두 Reset·201 deleted+1 live·Schema drift·Audit 실패 실제 rollback·원본/Current 불변. 과거 typed-outline 18건도 회귀 통과. |
| General Browser: `issue196-zone-qa.spec.ts` + `issue196-zones.spec.ts` | 독립 QA **2 PASS**. 320/375px 단일 Drawer/ESC·키보드와 legacy/G7 OFF/fallback 생성 비활성·Canvas identity. 조회 envelope를 주입한 UI 시험이며 실제 서버 인가를 대체하지 않는다. |
| Greenfield bootstrap·Scene·신규 keyboard·semantic 복합 실행 | bootstrap/Scene **2 PASS**, keyboard **1 PASS**, semantic **1 PASS**. 최초 합동 5건 중 Snap 1건은 시험의 화면 밖 click으로 실패했고 아래 별도 재검증했다. |
| `semantic-zones.spec.ts` 실제 signed G7 | **PASS**(`/tmp/issue196-greenfield-confirm.log`, 10.8s). UI 숫자 경계 생성, 복수 참조/3단계 계층·reload·동일 ID 경계 수정·CAS409·원본 SHA 보존·패널 반복 Canvas/Source lifetime·dxf-viewer fallback 승인 metadata 조회/쓰기 비활성/오이동 차단. |
| `issue196-zone-snap-qa.spec.ts` 실제 signed G7·DPR2 | **1 PASS/8.3s**(`/tmp/issue196-snap-retest.log`). 실제 source ENDPOINT/VERTEX 후보와 자유 WCS 좌표 혼합 저장, Zoom 후 이전 후보 거절, 새 후보 선택, SOURCE_ONLY Reset 후 Scene revision 동일해도 overlay 제거·UNMAPPED/RESET·focus 차단·metadata 보존. 테스트 전용 calibration Zone의 실제 투영으로 좌표를 계산하며 Snap 후보는 실제 Adapter에서 얻었다. |
| Actor 전환 폼 소거 추가 Browser | **1 PASS/4.3s**, fresh bootstrap 포함 **3 PASS/29.4s**(`/tmp/issue196-actor-verified.log`). 고정된 인가 read envelope의 actor 전환을 주입해 미저장 폼/선택 소거를 확인했다. 실제 actor/Site 인가는 위 signed 서버 회귀와 별개다. |
| Git/docs/Secret/PR review·conflict | 최종 stage diff/secret 검토 및 main 재조회 후 게시한다. 현재 base 최신 `2bccf90`, behind0. 신규 PR 생성 전 기존 #196 연관 open PR 없음. |

- 구현 범위: 층별 불변 Zone ID/metadata/parent, 독립 Site category, Version/SHA/Scene별 geometry, safe references, Editor 공동 수정·작성자/Site Admin 삭제, transactional Audit/CAS/멱등, Reset 보존·무효화, 이동 가능한 공통 구역 패널/조회/생성/Snap/수치 편집/트리·검색·표시·focus. 카테고리 DELETE는 비활성화(재활성 가능), vertex 편집은 수치 입력, URL query/fragment·Hole/MultiPolygon·INTERSECTION Snap은 미지원으로 명시했다.
- **NOT RUN/NOT VERIFIED:** 새 원격 PR CI 완료, 실제 Docker image build/run·Main CI/GHCR 게시·배포·병합·Issue 종료, 현장 #113/#193의 실제 DXF/GPU/2PC·성능 SLA/백업 복구. 요청은 PR CI 시작까지만이며 시작 후 결과를 모니터링하지 않는다. 일반 E2E 전체/다른 Browser/장기 성능은 신규 정확 HEAD의 CI 또는 별도 현장 단계에서 확인한다.

---

## PR #198 — 최초 CI 성공 및 리뷰 보완 후 재검증 후보 (2026-11-01)

- 최초 확인: HEAD `946b1e42c49a3e5806c019d073acac15ab43bfd5`, [PR CI 41302441739](https://github.com/planner77/layoutManager/actions/runs/41302441739) completed/success. Scope, Quality, General Chromium E2E 1/2·2/2, Greenfield, G7 signed+Legacy, Docker runtime, Aggregate Verify **8개 Job 모두 SUCCESS**.
- Code Review P1/P2의 rename 검증 우회 및 rerun-artifact 경로 문제를 수정해 Unit/워크플로를 보강하고, main #76 문서 변경을 보존해 충돌을 해결한다. 기존 결과는 새 HEAD PASS로 간주하지 않으며 새 CI/성능 개선량은 **NOT VERIFIED**. 별도 Issue #76 관리자 변경/GHCR/운영 반영 없음.

---

## Issue #197 — PR CI 시간 최적화 구현 후보 (2026-11-01, 새 Run 이전)

- **기준 실측:** #159 [Run 40951594117](https://github.com/planner77/layoutManager/actions/runs/40951594117) Verify 약 11.0분(General 93/5.8분, Greenfield 1/0.1분), #194 [Run 41295744097](https://github.com/planner77/layoutManager/actions/runs/41295744097) Verify 약 24.5분(General 148/14.8분, Greenfield 22/3.0분). Docker ~5.6→5.2분. 각각 성공 로그의 실제 Step timestamp 기준, 재시도 0. 현재 코드 성능 SLA를 뜻하지 않음.
- **구현 후보:** Issue #197의 6항(P0 E2E Shard 2 + Greenfield 독립, P1 doc-only scope + timing JSON, P2 Docker 조건부 baseline/BuildKit cache + standalone TAR reuse)을 단일 PR에 반영. 기존 필수 `verify` 이름·Scope 실패 차단/완전한 E2E/Docker native·Migration smoke 유지.
- **검증 상태:** 구조·스크립트 검토 진행; 완전한 로컬 Node/Docker/Playwright 및 원격 신규 정확 PR HEAD 실행·완료·성능 단축 결과는 **NOT RUN / NOT VERIFIED**. 15~18분 목표는 실측 전 확정값 아님. CI 실패 시 [FailureLedger](FailureLedger.md)에 실제 run/step/log/조치를 갱신하고 임의 PASS로 기록 금지.
- **범위:** 운영 런타임·G7 Auth/Writer·DB/CAD Volume/원본 현장 데이터 불변. metadata-only Main release-scope allowlist 보강, 기존 GitHub 게시 태그 강제 갱신 없음.

---

## Issue #191 — PR #194 최종 CI·병합 / 0.55.3 Release 핸드오프 (2026-11-01 KST)

- **최종 PR 검증:** 정확 HEAD `3257a31b9bae4e82ed81d8bb462011b9bc6cf7ac`, [Run 41295744097](https://github.com/planner77/layoutManager/actions/runs/41295744097) `completed/success`; Verify `124816115059` / Docker `124816115216` 둘 다 SUCCESS. TypeScript/ESLint/Unit·Integration/OCI/Benchmark/Build/General+G7+Greenfield+Legacy Browser 및 Docker Runtime/Greenfield 검증 완료. E2E focus 경합 실패 [Run 41293959571](https://github.com/planner77/layoutManager/actions/runs/41293959571)의 결정적 RED 후 수리/독립 QA 및 이전 ESLint 실패는 아래 보고서/FailureLedger에서 추적한다.
- **Owner Managed 완료:** 리뷰 스레드/미해결 0, 제출 Review 0(독립 승인 주장 없음), Main behind 0, 충돌 0. [PR #194](https://github.com/planner77/layoutManager/pull/194) Squash `73a550dcf5b4310179efcd5a48b7c1883ee2844f` 병합, [#191](https://github.com/planner77/layoutManager/issues/191) Closed/Completed. 운영 DB·원본 CAD·인증 상태/Writer 변경 또는 실제 현장 수용으로 확대 해석하지 않는다.
- **Main/GHCR:** [Run 41298598883](https://github.com/planner77/layoutManager/actions/runs/41298598883) `push/in_progress` 시작 확인. Runtime 변경 및 package `0.55.3`으로 GHCR App+Migrator의 paired 릴리스 후보; `v0.55.3` 사전 미존재. Workflow 완료/태그/두 OCI digest/게시 SUCCESS는 CI 모니터링 생략으로 **NOT VERIFIED**. 본 사후 문서-only Main 기록은 별도 release-scope skip 대상(결과 확인 전 NOT VERIFIED).
- #96/#113/#190/#193 현장·운영 조건은 별도 OPEN/BLOCKED 범위이며 본 이슈의 합성 CI 성공과 별개.

---

## Issue #191 / PR #194 — Run 41293959571 포커스 경합 재현·시험 보완 (2026-11-01)

- **실패 정본:** HEAD `e9c20d446a180eb69e31a07d4457134558221490`, [Run 41293959571](https://github.com/planner77/layoutManager/actions/runs/41293959571), Verify `124810809243`: TypeScript/Lint/134 files·896 Unit·Integration/OCI/benchmark/Build PASS, General E2E **147 PASS/1 FAIL**. `TC-E2-E2E-001` input Ctrl+Z 관측값 `pending` != `native`. G7/Greenfield/Legacy SKIPPED. Docker `124810809082` PASS는 위 과거 HEAD 한정. 과거 3회 ESLint 실패와 구분한다.
- **원인/수리:** Viewer 메뉴의 정상 `close()`는 다음 animation frame에 Work trigger로 포커스를 복원한다. 테스트가 이를 기다리지 않고 input을 focus하여 Ctrl+Z 대상이 다시 trigger가 되는 간헐 경합이다. 제품 코드 대신 E2E의 순서를 trigger focus 완료→input focus 확인→실제 키 입력으로 보완. input native assertion을 유지하고 Viewer window capture 핸들러 이후 window bubble에서도 target=input/`defaultPrevented=false`, 생성 Undo 비활성 검증을 추가했다. 재시도/skip/sleep/timeout 증가·CI gate 완화 없음.
- **실제 역할:** root가 실패 로그·원장·AC·원인/변경 review·정적/전체 Unit·기준정보 회귀·게시를 담당, AGENTS 현행 역할의 `gpt-6-sol` Developer가 재현과 test-only 수리, 완료 보고 검토 뒤 `gpt-6-luna` QA가 독립 검증했다. 별도 Manager 모델을 실행한 것으로 기록하지 않는다. Node **22.14.0**, npm **11.10.0**, 후보 **0.55.3**, Linux, Playwright 고정 배포본 Chromium1243, 격리 임시 SQLite/storage. 기존 main과 로컬 수정 2개는 별도 worktree로 보존했다.

| 실제 실행 | 결과/증거 |
|---|---|
| Developer 기존 집중 시험: `CAD_E2E_PORT=3411 npx playwright test tests/e2e/issue52-generated-history.spec.ts --grep TC-E2-E2E-001 --output test-results/issue191-baseline` | **1 PASS/11.7s**. 단독 정상 통과가 간헐 경합 부재를 증명하지 않음 |
| Developer 임시 결정적 probe: `CAD_E2E_PORT=3412 npx playwright test tests/e2e/issue52-focus-probe.spec.ts --grep TC-E2-E2E-001 --output test-results/issue191-probe` | **1 FAIL/15.7s (의도한 RED)**. 실제 메뉴의 focus rAF callback을 input.focus 뒤에 실행. held count>0 및 activeElement=Work trigger 확인 뒤 기존 assertion과 동일하게 `pending` 실패. probe 소스 제거, trace/context는 Git 제외 결과에만 보관 |
| Developer 수정 후 해당 파일, port3411/output `test-results/issue191-fixed` | **2 PASS/12.3s**, typecheck/대상 파일 ESLint/diff-check exit0 |
| Root `npm test` | **exit0 / 134 files·896 tests PASS / 281.99s**, `/tmp/issue191-unit.log`. Digest pin 거부 문구는 예상 negative case이며 실패 아님 |
| Root `npm run db:generate`, `npm run typecheck`, `npm run lint`, `npm run build` | 각각 **exit0**; Lint **0 errors/기존 9 warnings**. 로그 `/tmp/issue191-{generate,typecheck,lint,build}.log` |
| Root `CAD_E2E_PORT=3413 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npx playwright test tests/e2e/master.spec.ts tests/e2e/current-only-list.spec.ts --output=/tmp/issue191-master-results` | **6 PASS/28.8s**, `/tmp/issue191-master.log` |
| 독립 QA: 같은 Chromium/port3414, `npx playwright test tests/e2e/issue52-generated-history.spec.ts --output=/tmp/issue191-qa-results` | **2 PASS/12.7s**, `/tmp/issue191-qa.log`, `/tmp/issue191-qa-report.md`. 실제 Viewer capture 이후 native 이벤트 관측·assertion 비약화·probe/debug 제거 및 diff-check 확인 |

- Root 전체 Unit 결과까지 확인해 로컬 필수 gate를 완료했다. 제품 소스/Schema/API/권한/Version/Current/원본은 변경하지 않았다. test-only 수정이므로 로컬 Docker 및 General 전체148/G7/Greenfield/Legacy/현장 실도면은 재실행하지 않고 새 PR CI에 맡긴다. 이전 HEAD Docker PASS를 새 HEAD 검증으로 사용하지 않는다.
- **판정/인계:** root는 위 결정적 RED·수정 후 GREEN·독립 QA 근거로 CI 시험 보완을 수용한다. 로컬 git push dry-run 인증은 거부되어 연결된 GitHub 도구로 동일 지정 저장소의 PR branch에 단일 fast-forward 게시한다. 최종 수리/원장 commit의 synchronize로 PR CI 시작 요청, 새 CI 완료/성공은 **NOT VERIFIED**(Owner 요청으로 모니터링 생략). 운영/GHCR/병합/Issue 종료는 시행하지 않는다. 후보 **0.55.3 유지**.

---

## Issue #191 / PR #194 — Run 41292700455 재실패와 Effect/GET 분리 (2026-11-01)

- 이전 HEAD `693af939d762f4d54f2f0af758aa6fd26972ff22`의 [PR CI Run 41292700455](https://github.com/planner77/layoutManager/actions/runs/41292700455) completed/failure: Verify 124807072543 ESLint 1 error(`master-manager.tsx:168:10`, react-hooks/set-state-in-effect), 9 warnings. TypeScript/Prisma/npm ci PASS, Unit·Build·Playwright SKIPPED. Docker 124807072396 PASS(해당 이전 HEAD에 한정).
- 원인: Effect가 `void refresh()`를 호출하고 refresh 내부에 `setState`를 포함해, 최초 `setLoading(true)`를 제거해도 React Hooks lint가 Effect의 간접 상태 변경 가능성을 검출했다.
- 보완 [5e4b431c](https://github.com/planner77/layoutManager/commit/5e4b431c1c337336a376ed56d10f7c66fb532e65): 초기/필터 GET은 Effect가 `fetchMasterNodes` Promise에 `.then/.catch/.finally`를 등록하고 비동기 완료 시 상태 처리. 사용자 작업은 `refresh`로 요청하되 공통 `applyLoadedTree/applyLoadError`를 재사용. 조상 확장·선택·세대 번호 충돌 제거·오류 UX 유지. ESLint 우회·API/Prisma/권한/Current 변경 없음.
- 현 HEAD는 아직 로컬 Typecheck/Lint/Unit/E2E/Docker **NOT RUN**, 신규 PR CI **NOT VERIFIED**. 완료 결과는 사용자 지시에 따라 모니터링하지 않음. 원장 [FailureLedger](FailureLedger.md)에서 실패 Run/Job/수리 SHA 추적.
- 현장·운영 Auth/Writer, DB/Volume, GHCR, PR 병합, Issue 종료는 별도 단계.

---

## Issue #191 / PR #194 — 2차 CI React Hook 간접 상태 변경 수리 (2026-11-01)

- **실제 실패**: [PR CI Run 41291679198](https://github.com/planner77/layoutManager/actions/runs/41291679198), 원본 HEAD `5fac25bda03a9f5b44dd2455d17491f8f71aa7c3`, completed/failure. Verify Job `124804106503`: npm ci/Prisma 생성/TypeScript SUCCESS, ESLint **FAIL (1 error, 9 warnings)**. 실패 위치 `src/features/master/master-manager.tsx:167`, `react-hooks/set-state-in-effect`, Effect의 `void refresh()` 호출 경로에서 비동기 함수의 첫 번째 `setLoading(true)`를 동기적으로 실행함. Unit·Integration/Build/General·G7·Greenfield·Legacy E2E **SKIPPED**. Docker Job `124804106759` SUCCESS는 해당 과거 HEAD에서만 유효.
- **수정**: [Commit 8fc5c44](https://github.com/planner77/layoutManager/commit/8fc5c4479d6c9df90e1eeb26a7592ade50696b4e). `refresh`의 최초 동기 `setLoading(true)` 제거; 첫 진입은 `useState(true)`, 수동 새로고침과 비활성 필터는 클릭/변경 이벤트에서 `setLoading(true)` 수행. Effect 자체는 조회만 시작하고 데이터 fetch 이후 결과/오류/종료 상태 반영. 로딩 중 선택 상세를 숨겨 필터 전환 직후 stale 편집 방지. 기존 request sequence, G7/DB/API/Current/도면 이력 변경 없음. ESLint 규칙 비활성화/CI gate 우회 없음.
- **증거 경계**: 수정 이후의 로컬 npm Typecheck/ESLint/Vitest/Playwright/Docker **NOT RUN**. 새 정확 HEAD의 PR CI 성공/실패 **NOT VERIFIED**(요청대로 시작 후 모니터링 안 함). 이전 HEAD의 TypeScript/Docker PASS는 이 변경의 전체 테스트 근거가 아님. 실패 원장 [FailureLedger](FailureLedger.md)에 원본 Run/Job/정확한 수리·후속 CI 범위 기록.
- PR 병합, GHCR 게시, Issue #191 종료, 운영 Auth/Writer·SQLite/CAD Volume 변경 및 현장 검증은 진행하지 않음.

---

## Issue #191 PR #194 — ESLint 최초 실패/정적 수정 회귀 (2026-11-01)

- 정확 실패 HEAD a89956c9d704aeb173e625b3c970d3f3fa29a3c8, [Run 41285766585](https://github.com/planner77/layoutManager/actions/runs/41285766585) completed/failure. Verify Job 124786741824: TypeScript PASS 후 ESLint 4 errors (react-hooks/refs 2, react-hooks/set-state-in-effect 2), 9 warnings; Unit·Integration/Build/Playwright SKIPPED. Docker Job 124786742016 SUCCESS.
- 수리 commit a29c3c716d0d1202c9ee0b21d05f6626453257f7: 렌더 중 ref 대입 제거(Effect로 동기화), 필터 이벤트에서 mode 초기화, visible 계층에서 roving focus 파생. React Hooks lint 비활성화·우회 없음.
- 보완 commit c0518c3f58f8c68d938de4b7417d81b100efbb02: #45 Current 없는 층 기존 5열 E2E를 새 트리 검색→층 선택→버전 이력으로 변경; Current/Version assertion 유지.
- **수리 이후** 로컬 TypeScript/ESLint/Vitest/Playwright/Docker **NOT RUN**, 새로운 정확 HEAD의 PR CI **NOT VERIFIED**. 기존 Docker PASS를 새 HEAD 성공 증거로 사용하지 않는다. 추가 Run의 실제 증거는 FailureLedger.md에 기록한다.
- 사용자 CI 모니터링 생략 지시, GHCR/병합/Issue #191 종료·운영 DB/Auth/CAD Writer 변경 없음.

---

## Issue #191 — 트리/상세 관리 UI 후보 검증 상태 (2026-11-01)

- 구현: master-tree.ts 순수 트리/검색/활성 경로, master-manager.tsx 두 패널, MasterRepository.create 활성 조상 guard, 새 Unit/Integration/E2E + 기존 Master 5열 테스트 개정. [설계·시험](Issue191.md).
- 해당 신규 HEAD의 로컬 Typecheck/ESLint/Vitest/Playwright/Production Build/Docker **NOT RUN**; 성공·실패 실측 근거가 없다. PR CI 열기 전 Run/Job **NOT VERIFIED**. 과거 #24/#109/G7 성공을 새로운 코드 통과로 소급하지 않는다.
- 현장 CAD/2PC, 운영 Auth/Writer, 기존 운영 DB·Volume, GHCR 게시 및 Issue 종료 **NOT RUN/NOT REQUESTED**. 신규 CI 결과와 수리 증거는 실행 확인 후 이 문서와 [FailureLedger](FailureLedger.md)에 후속 기록.

---

## PR #192 — #81/#160 교차 보완 Owner Managed 코드 수용 (2026-11-01)

- **코드/합성 CI PASS:** HEAD `3da74d76134e69924018e519ff4ce458e96c7487` / [PR CI Run 41281582636](https://github.com/planner77/layoutManager/actions/runs/41281582636) Verify `124774528508`, Docker `124774528276` 각각 `completed/success`. 기존 TC-EPIC-81-160-01/02 중복 Scene Target/KEEP 이동·Reset Snapshot 회귀가 전체 자동 CI gate에 포함되어 성공했다. 로컬 npm/현장 실행 없음.
- **Main/GHCR:** PR #192 Squash Main [`b3fcf3ed`](https://github.com/planner77/layoutManager/commit/b3fcf3eda19177f52e00c0191d5ffb9f333bb0e8) 성공, [Main CI Run 41283558627](https://github.com/planner77/layoutManager/actions/runs/41283558627) `queued` 시작; 0.55.2 App/Migrator release 완료/digest **NOT VERIFIED**.
- **차단/미수용:** #81/#160은 코드 범위 Owner Managed `closed/completed`; #193 통합 현장·#96 Auth/2PC·#113 실 DXF/GPU·#190 Memo/Heap **OPEN/BLOCKED**, 실제 2PC·SLA/복구/Owner 서명 전 실증 PASS 금지. 본 기록은 docs-only 추적이며 릴리스 이미지 SHA를 변경하지 않는다.

---

## PR #192 보완 — KEEP pre-write gate 수용 범위 (2026-11-01)

- `uniqueMemoSnapTarget` 서버 이동 전·후 사용과 중복 대상/타 Scope 단위 테스트 **작성**. 첫 PR CI Run 41281326806은 초기 HEAD에서 시작되었으나 추가 커밋과 다른 버전이다. 새 HEAD의 PR CI 완료/성공과 로컬 Typecheck/Vitest/E2E는 **NOT VERIFIED/NOT RUN**.
- S7 실 현장·Auth·GPU·2PC·운영 Volume 변경 없음. [상세](Epics81-160.md).

---

## Epic #81/#160 — Scene ID 중복·Reset Snapshot 회귀 후보 (2026-11-01)

- **작성:** `src/domain/memo-session-snap.ts`의 중복 Scene Target 거부·기존 메모 마지막 WCS/BROKEN 보존 및 `src/domain/cad-reset.ts` 조회 ID 유일성 검사, Unit 2건 추가.
- **실행 상태:** GitHub 소스 연결만 이용하여 로컬 npm/typecheck/ESLint/Vitest/Playwright/Build/Docker는 **NOT RUN**. PR CI Verify/Docker **시작 요청 전 NOT VERIFIED**; 새 CI 결과를 모니터링하지 않는다.
- **미수용:** 현장 승인 DXF·GPU·2PC/다중 사용자/Backup/Restore·Owner S7. #81/#160 Epic 및 #96/#113/#190 OPEN. 기존 CI/GHCR 수용과 이 합성 수정은 서로 다른 SHA. [추적](Epics81-160.md).

---

## PR #189 최종 PR CI 확인 및 후속 현장 추적 (2026-11-01 KST)

- 코드/합성 품질 Gate: HEAD `dc8e7c3a0c023272e2fa723a9abe35627efdd35a`, [Run 41278134690](https://github.com/planner77/layoutManager/actions/runs/41278134690) Verify Job 124764393470 / Docker Job 124764393555 모두 `completed/success`. Unit/Integration, OCI, synthetic benchmark, Build, Chromium/G7/Greenfield/Legacy E2E, Docker runtime/migrator/Greenfield smoke 단계 성공. 최초 Run 41277155938의 Unit exact-coordinate 실패/수정 이력은 FailureLedger 참조.
- 코드 Owner Managed Main Squash [`19167bc3274ac7955ecb2935602f0404cd0a82bf`](https://github.com/planner77/layoutManager/commit/19167bc3274ac7955ecb2935602f0404cd0a82bf) 완료; [Main CI 41280051780](https://github.com/planner77/layoutManager/actions/runs/41280051780) 시작 확인. **Main CI 종료·GHCR App/Migrator OCI digest/게시 결과는 미확인**(모니터링 생략).
- **현장:** #186은 코드/합성에 한해 행정 종료, 실제 CAD/GPU/frame p95·3회 GC heap 원인·Owner SLA/2PC/Auth/Backup·Restore 등 미검증 항목 전부 [#190](https://github.com/planner77/layoutManager/issues/190) OPEN/BLOCKED. 실제 향상률, 누수 해결 여부, 운영/현장 합격은 **NOT VERIFIED**.

---

## PR-C #186 — 성능 계측·projection 개선 코드 후보 (2026-11-01)

**상태: CODE/SYNTHETIC PR CI VERIFIED (Run 41278134690, Verify+Docker SUCCESS) / LOCAL RUNTIME NOT EXECUTED / MAIN CI STARTED, GHCR NOT VERIFIED / FIELD & 2PC NOT ACCEPTED.** 이전 #174 수치(10k LINE+100 Memo p95=216.6ms, 17/30>16.7ms; 1차/2차 dispose 31,645,380→48,449,656B,+16,804,276B)는 **과거 기록**이며 이 브랜치 변경 후 값으로 재표기하지 않는다.

- 수정: Three adapter batch WCS projection (per-100 pin 100 rect requests→한 호출당 1 rect, 1 reused Vector3), pure bounded Memo preview/candidate screen computation & no-op state, `ThreeDxfViewerAdapter.dispose` large index/Scene ref clearing 및 Render change listener 명시 해제. 원본 DXF/SHA/Scene/DB/Anchor 정책은 불변.
- unit 신규 `memo-screen-projection.test.ts`: 첫 PR CI 1/891 실패는 IEEE-754 x=110.00000000000001 vs 110 exact-assertion; X/Y `toBeCloseTo(...,9)` 보완 후 재실행 Run 41278134690에서 전체 Unit/Integration Step **SUCCESS**. 원장에 실패/수정 이력 보존.
- 브라우저 기존 `issue174-memo-performance.spec.ts` 확장: 0 Memo, 100 visible, 100 CSS-hidden pan frame 통계, 3회 dispose별 GC Heap·DOMCounters/Worker/listener. CI 재실행 Run 41278134690의 Chromium E2E Step **SUCCESS**; 숫자 본 문서 미전사로 **실측 개선 폭/현장 SLA 미확정**. CSS 숨김은 paint만 분리하며 상위 React update 및 WebGL은 남는다.
- 근본 원인 단정 금지: source-level 중복 계산과 retainable graph는 확인했으나 과거 Heap 증가가 앱 메모리 leak인지/Chrome DevTools 또는 Next cache 때문인지 실측·retainer graph 증거 없음.
- Merge/GHCR/Owner Managed 최종 인수는 정확 HEAD PR CI Verify/Docker·리뷰/충돌 검토 후 별도. #186 현장/성능 SLA 및 #96/#113 Owner 수용은 계속 OPEN.

---

## PR-B #172 — Owner 정책 확정 및 구현 후보 (2026-11-01)

**상태: SOURCE CHANGED / AUTOMATED TESTS NOT RUN LOCALLY / PR CI NOT YET VERIFIED / FIELD NOT ACCEPTED.** 실제 PR CI 결과는 정확 HEAD의 Run/Job 완료 증거 확인 후 추가한다. 기존 R4, R5의 합성 통과·실패 이력을 본 변경의 PASS로 승계하지 않는다.

- 구현: signed G7 권한 있는 동일 Site Editor는 타 작성자 Memo text/move/metadata/Anchor 수정. Memo DELETE는 작성자 또는 해당 Site Grant 보유 Admin. `SOURCE_ONLY` Cross-Editor Anchor BREAK 허용, `ALL` 타 작성자 Memo 삭제에는 Site Admin 필수. Group은 그룹 작성자 소유 유지.
- 읽기-only GET의 `actorId/canDeleteAny` 추가와 Viewer Delete disabled/설명, 서버의 모든 write 재검사; CadMemo `createdById/createdAt` 불변, updatedBy/Audit 및 Revision CAS.
- 코드: `server/cad-business/{memo-policy,service,anchor-service,reset-service,memo-groups,authorized-memo-read}.ts`, `features/cad-viewer/{cad-business-client,cad-memo-editor,viewer}.tsx/ts`.
- 추가 증거 목표: `src/tests/integration/typed-outline-runtime.test.ts` TC-172-01~05, `src/tests/greenfield-e2e/memo-collaboration.spec.ts` TC-172-06, `src/tests/unit/authorized-memo-read.test.ts`. 작성한 테스트는 실행 전에는 PASS로 분류하지 않는다.
- 데이터/운영: 신규 Greenfield Schema 변경 없음, 기존 DB migration/운영 Auth·Writer 활성화/실 CAD/GPU/2PC/OCI GHCR 릴리스 수행하지 않음. 현장 인수는 #96/#113/#172/#186 후속.

---

## 2026-11-01 Epic #37/#49/#50 통합 회귀 (0.54.1 후보)

| 검증 대상 | 근거 | 실제 결과 |
| --- | --- | --- |
| Viewer 비활성 링크 Unit | TC-EPIC-37-49-UNIT-001 | NOT RUN — 신규 브랜치 PR CI 대상 |
| Viewer/Generated/SOURCE 통합 E2E | TC-EPIC-37-49-E2E-001 | NOT RUN — 신규 브랜치 PR CI 대상 |
| 서버 로그 타임라인 503 복구 E2E | TC-EPIC-50-E2E-001 및 기존 권한 철회 | NOT RUN — 신규 브랜치 PR CI 대상 |
| 전체 Unit/Integration·Typecheck·Lint·Build | PR CI verify job | NOT RUN / NOT VERIFIED |
| Chromium 일반·Greenfield·Auth/Legacy E2E | PR CI verify job | NOT RUN / NOT VERIFIED |
| Docker/Migrator·배포 smoke | PR CI docker-runtime job | NOT RUN / NOT VERIFIED |
| 실제 CAD, GPU, 운영 로그 디스크·현장 | 별도 운영/수용 | NOT RUN |

문서·구현 후보는 [Epics37-49-50](Epics37-49-50.md). 해당 표는 성공을 의미하지 않으며 이전 Head의 CI 결과는 이 Commit의 검증이 아니다. 실제 CI 실행 결과를 관측한 후에만 채운다. 사용자 요청에 따라 CI 시작 이후 모니터링·GHCR 게시·병합·이슈 종료는 수행하지 않는다.

---

## R5b / #91 코드·합성 범위 최종 로컬 수용 — STACKED DRAFT PR GO (2026-11-01)

Manager는 Developer 구현·재작업 보고, 독립 QA 최종 보고, Root source/전체 gate와 직접 확인한 로그·한글 screenshot을 근거로 **LOCAL R5b / #91 CODE + SYNTHETIC ACCEPT / STACKED DRAFT PR GO**를 판정한다. Version0.54.0, 기반 R5a `9accf8ba3e21f2d51dc7694e768f19c75fffb5d5`, 수정 BUILD2와 최종 시험 파일 기준이다. 아직 R5b commit/push/Draft PR/원격 CI 전이며 Root가 최종 staged·secret·remote·exact-tree 검사와 게시를 수행한다.

| 최종 gate | 실제 결과 / 로그 |
| --- | --- |
| 전체 Unit/Integration |131 files/883 PASS,367.83초,exit0 — `/tmp/layoutmanager-r5b-all-unit.log` |
| 독립 QA 전체 General |146 PASS/0 FAIL/0 SKIP·interrupted,13.4분 — `/tmp/layoutmanager-r5b-qa-general-146.log` |
| 전체 Greenfield |21 PASS,4.4분 — `/tmp/layoutmanager-r5b-greenfield-final.log` |
| Runtime Auth / Legacy |각1 PASS,전체21.1초/29.9초 — `/tmp/layoutmanager-r5b-runtime-final.log`, `/tmp/layoutmanager-r5b-legacy-final.log`; Auth owned controlled clock |
| 최종 static/build |typecheck PASS, whole lint0 errors/기존9 warnings, BUILD2 PASS — `/tmp/layoutmanager-r5b-types-release-final.log`, `/tmp/layoutmanager-r5b-lint-release.log`, `/tmp/layoutmanager-r5b-build2.log` |

최종146에는 Memo QA3, lifecycle11, load2, projection2와 기존 General 회귀가 포함된다. 별도 집중 결과를146에 합산하지 않는다. 이전 중단144의19 PASS/1 interrupted/124 NOT RUN, glyph pixel assertion false-positive, 실제 수직 반전 및 수정·재시험, load setup405 이력은 FailureLedger에 보존한다.

| 요구/TC | 구현 및 실제 근거 |
| --- | --- |
| REQ1/4/5 → TC-R5B-01/02/07/09 | domain 선택/whitelist, font/raster/annotation, dialog/hook. 두 포맷 Memo-only 및 DXF B+Generated2+Memo1, hidden 명시 포함, 실제 dark glyph4778·새 Loader upright 한글 렌더, metadata/개인정보 제외,320px/native fullscreen/AUTO·MANUAL |
| REQ2/3 → TC-R5B-03/04 | readonly snap/visual proof와 Memo GET authorized transaction/envelope. 실제 SESSION Move/Rotate/Undo/BROKEN·동일 ID 복구, Reader 서버 파일·actor A→B→A·권한회수·row revision·실패 제거와 local 회복 |
| REQ6 → TC-R5B-05/06/08 | 순수 예산/할당 경계와 Browser font404/invalid/지원 glyph/15초 timeout·Canvas/PNG 오류, native FontFace/PNG/FileReader hold·취소 및10회 자원 관측 |
| TC-R5B-10 / R5a 회귀 | 최종 전체 gate와1k/10k LINE+10Memo 실제 GLB bytes/시간·새 Loader·API metadata/원본 SHA 불변; 상세 수치는 아래 계측 표 |

양성 시각·좌표 projection은 GLB/glTF 두 형식에서 확인했다. Native PNG/toBlob 및 FileReader 인코더 hold·취소는 **실제 GLB 경로**에서 검증했으며 두 형식별 모든 취소 조합을 실행한 것으로 확대하지 않는다. FontFace bounded 취소는 늦은 등록을 막고 비중단 PNG/GLTF는 완료·정리까지 mutex를 유지한다. heap은 단일 cold/CDP 관측이고 직접 GPU dispose 횟수·장기 leak-free/현장 SLA를 입증하지 않는다.

현장 실 CAD·GPU/2PC·Owner 수용은 별도 미완료다. 기존 운영 원본/DB/볼륨 변경·Schema migration·이슈 종료·병합·태그·GHCR/배포·외부 Owner 메시지는 수행하지 않는다. 이번 판정은 승인된 코드/합성 범위의 로컬 수용과 Draft PR 게시 진행이며 이후 정확 새 HEAD의 원격 CI는 실제 결과로 확인한다.

## R5b 최종 전체 정적 검사 PASS / General146 대기 (2026-11-01)

Root가 최종 Browser146 대상 파일까지 포함한 typecheck(`/tmp/layoutmanager-r5b-types-release-final.log`)와 whole lint(`/tmp/layoutmanager-r5b-lint-release.log`)를 exit0으로 확인했다. lint는0 errors/기존9 warnings이며 Manager가 로그를 직접 확인했다. diff-check도 PASS다. Product/test는 projection2 최종 반영 이후 동결됐고 더 이상의 범위 확장 없이 최종 General146 결과만 기다린다.

## R5b 실제 SESSION/BROKEN export 집중 GREEN (2026-11-01)

Manager가 `/tmp/layoutmanager-r5b-projection1.log`를 직접 확인했다. 새 Root Browser2개는 **2 PASS20.1초**다. 실제 Generated-bound Memo를 Translate(3,4),90도 Rotate(pivot5,5),Undo 후 SESSION으로 내보내고, target 삭제 뒤 BROKEN 마지막 WCS와 부분 동의·동일 ID Undo 복구를 두 포맷에 걸쳐 확인했다. native FileReader 인코더 hold 중 viewport epoch 변경은 download0이며 다시 준비하면 성공한다. 파일 metadata anchor/mode와 Viewer pin WCS 불변을 검증했다.

TC-R5B-03의 기존 coverage gap은 집중 실행으로 보완했다. 전체 최종 suite146은 별도 처음부터 실행하며 그 결과를 기다린다. 전체 unit883의 대상 .test.ts 변경은 없으며 최종 test-only Browser 추가의 type/lint를 확인한다.

## R5b 최종 Greenfield/Auth/Legacy gate PASS (2026-11-01)

Manager가 BUILD2 기준 실제 최종 로그를 직접 확인했다. 전체 Greenfield **21 PASS4.4분**(`/tmp/layoutmanager-r5b-greenfield-final.log`), Runtime Auth **1 PASS·시험15.1초/전체21.1초**(`/tmp/layoutmanager-r5b-runtime-final.log`), Legacy **1 PASS·시험4.2초/전체29.9초**(`/tmp/layoutmanager-r5b-legacy-final.log`)다. Runtime Auth는 owned fixture의 controlled clock 사용이며 native time 시험으로 표기하지 않는다. Greenfield는 Reader의 실제 SERVER_MEMO 다운로드·PNG/provenance·actor ID 제외를 추가한 최종 권한 사례를 포함한다.

Root의 새 session-export Browser2 source도 Manager가 검토했다. 실제 Generated snap→Translate/Rotate/Undo·삭제 BROKEN·동일 ID 복구를 거쳐 파일 Memo anchor/mode와 Viewer world 불변을 비교하고, native FileReader hold 중 viewport epoch 변경 후 download0·새 준비 회복을 확인하도록 작성했다. 새 typecheck/scoped lint PASS를 Root가 보고했고 focused 실행은 아직 진행 중이다. 이 결과 및 최종 General146 전체를 확인하기 전 최종 R5b 완료 판정은 하지 않는다.

## R5b 전체 General coverage 보완으로 조기 중단 (2026-11-01)

최종 수용 전 Root/Manager가 TC-R5B-03의 실제 bound SESSION/BROKEN export Browser 범위가 빠졌음을 확인했다. 현재 QA3은 FREE/Mixed, 권한 시험은 server canonical, projection unit·R4 Browser는 live pin을 검증하지만 새 export wiring을 직접 검증하지 않았다. 실제 중단 결과는19 PASS/1 interrupted(R4 10k benchmark)/124 NOT RUN이다. 새 Root test-only2개 추가를 위해 중단했으며 실패 원인이 발생한 중단이 아니다. 해당 실행은 INCOMPLETE/CANCELLED로 보존하고 FAIL/PASS 전체로 기록하지 않는다.

새 집중2와 정적 검사 후 최종 suite146 전체를 재시작한다. product는 BUILD2로 동결하며 실제 결함 발견 전 runtime 변경은 없다. 최종 actual counts는 완료 로그를 따른다.

## R5b 최종 전체 unit / 합성 load 집중 결과 (2026-11-01)

Manager가 실제 최종 로그를 확인했다. `/tmp/layoutmanager-r5b-all-unit.log`의 전체 결과는 **131 files/883 PASS,367.83초,exit0**다. 최종 General·Greenfield/Auth/Legacy는 별도 gate로 남는다.

새 load fixture GET 경로 수정 후 `/tmp/layoutmanager-r5b-load2.log`는 **2 PASS1.6분**이다. 실제 Browser에서 합성 LINE과 UI로 만든 메모10개를 GLB로 내보내고 별도 BrowserContext의 새 GLTFLoader/WebGL로 읽었다. Manager가 시험 source와 로그를 직접 확인했다.

| 합성 LINE / Memo | GLB bytes | 준비 ms | Coordinator export ms | Loader parse ms | Consumer load/render/inspect ms | GC heap 전→export후→Viewer dispose후(bytes) |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
|1,000 /10|1,144,548|209.44|810.39|115.1|210.1|15,863,884→18,075,056→5,193,528|
|10,000 /10|9,900,564|286.28|1,045.39|786.2|1,103.0|67,857,508→74,919,756→4,630,984|

각 실행은 source vertices2,000/20,000, Memo/texture 각10, 실제 dark pixels·render draw를 확인했다. Source GET1, 보호된 Memo/Outline 조회0, API쓰기0, 외부 origin resource0, model URL1생성/1해제다. 기존 목록 API가 반환한 metadata/Current 및 원본 byte SHA가 전후 동일했다. 내부 DB 모든 table fingerprint를 직접 비교했다는 뜻은 아니다.

Coordinator export는 click→실제 download event까지 auth·serializing·전송 준비를 포함하며 순수 encoder나 GPU 시간으로 해석하지 않는다. Consumer 시간은 별도 context에서 load/render/texture inspection을 합친 값이다. 각 크기 단일 cold 실행과 CDP GC heap이며 median/p95·현장 CAD SLA·장기 leak-free는 입증하지 않는다. 실제 전체 General에서도 새 load2를 포함해 재실행한다.

## R5b BUILD2 시각 재검증 수용 / 전체 gate 진행 (2026-11-01)

수정 포함 BUILD2에서 독립 QA focused **3 PASS32.9초**(`/tmp/layoutmanager-r5b-qa-memo-final-build2-rerun.log`)를 확인했다. 두 포맷 각각 실제 dark glyph4778pixels, fresh Loader24.1ms(GLB)/11.2ms(glTF), projected UV-top NDC+0.525>bottom−0.525, anchor WCS(30,30,0)다. mixed는 DXF B+Generated2+Memo1을 두 형식으로 확인했다.

Manager는 `/tmp/layoutmanager-r5b-qa-visible-memo-glb.png`를 직접 열어 `한글 작업 지시`, `Valve inspection`, `유량을 확인하세요`가 정상 방향으로 읽히는 것을 확인했다. glTF 캡처도 QA가 직접 확인했으며 두 capture의 실제 byte SHA-256은 동일 `54cbc0d59dd1315c9395fdf9607342c8216eae93619b90e3080e9137894bffa8`,42,966bytes다. 원시 texture PNG의 직접 draw 방향을 glTF UV/flipY 적용 후 실제 Mesh 방향과 혼동하지 않는다. 두 포맷 실제 rendered artifact를 기준으로 수직 반전 결함의 시각 수용 보류를 해제한다. 이전 반전 캡처와 검증 결함 이력은 보존한다.

같은 BUILD2에서 Root authority **6 PASS1.6분**(`/tmp/layoutmanager-r5b-auth2.log`) 및 Developer lifecycle **11 PASS2.2분**(`/tmp/layoutmanager-r5b-lifecycle-build2.log`)를 Manager가 로그로 직접 확인했다. Lifecycle 성공4/실패3/취소3에서 model URL4/4해제·등록FontFace0·canvas dimensions0이다. 최종 harness refs 제거+CDP GC 뒤 heap9,000,240→11,431,828bytes는 단일 cold 실행이며 런타임 캐시 가능성/장기 추세·GPU dispose 직접 계측 부재를 남긴다. leak-free 또는 증가 원인 확정으로 표현하지 않는다.

전체 unit·General·Greenfield/Auth/Legacy 및1k/10k LINE+10Memo 실제 계측은 진행 중이다. 위 focused PASS를 전체 R5b 완료나 원격 CI/현장 수용으로 확대하지 않는다.

## R5b annotation 수직 반전 수정 source 확인 (2026-11-01)

Developer는 활성 lifecycle11 실행 종료 후 bottom corners를 `labelZ-height`에서 `labelZ+height`로 수정하고 기존 UV를 유지했다. Manager가 실제 diff와 새 screen-down(+Z)/UV unit assertion을 확인했다. +Y camera/up -Z에서 top/bottom 관계가 맞고 raw anchor/pin은 유지한다. Developer는 Memo core5 PASS와 type/lint/diff-check PASS를 보고했다.

수정 source를 rebuild 대상으로 수용하지만 실제 두 포맷 upright 한글 WebGL 결과 전 시각 수용 보류는 유지한다. 새 lifecycle 계측은 harness의 canvas/URL 참조를 최종 GC 전에 제거하도록 보완하며 이전 retained-ref heap 관측과 분리한다.

## R5a 정확 HEAD 원격 CI 완료 (2026-11-01)

Root가 [PR184](https://github.com/planner77/layoutManager/pull/184)의 정확 HEAD `9accf8ba3e21f2d51dc7694e768f19c75fffb5d5`에 대한 [CI41239705093](https://github.com/planner77/layoutManager/actions/runs/41239705093) 실제 job log를 읽어 Docker `124650849694` 및 Verify `124650849901` 모두 SUCCESS를 확인했다. Unit127 files/858 PASS, General128 PASS11.1분, native Auth1 PASS8.9초, Greenfield17 PASS2.4분, Legacy1 PASS12.9초다. PR 본문에도 반영했고 draft=true/mergeable=true/동일 HEAD를 재확인했다. R5a clean worktree는 변경하지 않고 이 R5b 문서에 후속 근거를 기록한다. 병합·배포·#91 전체 완료를 뜻하지 않는다.

## R5b 반전 수정 전 권한·lifecycle 결과 (2026-11-01)

Root actual authority Browser는 first-install2+Memo4 **6 PASS1.1분**(`/tmp/layoutmanager-r5b-auth1.log`)다. 실제 Memo GET actor A→B→A 거부, Reader export 직렬화 뒤 row revision 변경 폐기, 실제 Site권한회수403 후 private 선택 제거→Memo GET 없는 Source-only 다운로드, network/JSON/envelope 실패의 private 제거를 확인했다. Manager가 로그를 직접 확인했다.

Developer updated lifecycle는 **11 PASS1.5분**(`/tmp/layoutmanager-r5b-lifecycle-final.log`)이며 Manager가 로그를 직접 확인했다. font404/invalid/glyph0/15초 timeout·Canvasnull·PNG 실패/회복·비중단 encoder mutex 및10회 결과를 포함한다. 별도 순수 경계5 PASS를 Developer가 보고했다. CDP GC heap9,001,092→11,433,204bytes는 harness refs 보유 조건이며 이후 참조 제거 계측과 구분한다.

위 시험은 **반전된 annotation을 포함한 이전 candidate**에서 실행했다. 시각 결함 수용 보류를 해제하지 않으며 수정 후 build에서 QA3(실 glyph+upright·Generated2 혼합), Root권한6, Developer lifecycle11을 각각 재실행한다. 기존 결과를 새 snapshot PASS로 전용하지 않는다.

## R5b 실제 artifact 글자 수직 반전 — 재작업 필요 (2026-11-01)

Dark glyph pixel 조건을 보완한 QA capture를 QA와 Manager가 직접 확인했다. `/tmp/layoutmanager-r5b-qa-visible-memo-glb.png` 및 glTF capture에서 한글 제목과 `Valve inspection`이 수직 반전되어 읽기 방향이 잘못됐다. Manager는 GLB screenshot을 직접 열어 확인했으며 source 검토상 helper의 +Y camera/up -Z는 기존 XY→XZ 좌표 계약에 맞는다. Annotation의 topLeft=labelZ, bottomLeft=labelZ-height 좌표 관계와 UV가 화면상의 상하 방향을 뒤집는 것으로 판단한다. 단순 camera 회전으로 가리는 해결은 허용하지 않는다.

이는 실제 제품 시각 결함이며 glyph pixels 존재·Loader 성공만으로 TC-R5B-02를 PASS 처리하지 않는다. Product 수정/새 build 및 두 형식 실제 WebGL 한글 screenshot 재검증 전 R5b 수용을 보류한다. Root에 즉시 전달했으며 활성 권한/lifecycle 시험과 rebuild를 조정한다. QA는 production을 수정하지 않았다.

## R5b Browser 1차 결과 / 증거 보완 진행 (2026-11-01)

독립 QA는 focused3 PASS29.1초를 보고했으며 실제 두 포맷의 Loader·texture·WebGL 렌더/혼합 선택·320px/native fullscreen/AUTO 높이를 실행했다. Root 재검토에서 inkPixels 조건 `RGB 중 하나<245`가 배경색 #fffef0의 blue240까지 세는 false-positive를 발견했다. 이 실행으로 glyph pixels를 입증했다고 주장하지 않는다. 모든 RGB<150 및 alpha>0의 실제 글자 픽셀 조건과 한글 screenshot 재검토·전체3개 재실행을 요구했다. 이는 QA 검증 결함이며 제품 렌더링 실패가 관측됐다는 뜻은 아니다.

Developer의 시험 전용 lifecycle 첫 실행은6 PASS1.1분(`/tmp/layoutmanager-r5b-lifecycle1.log`)이고, 별도 CDP GC 계측 수정 후 단일10회 사례는1 PASS28.1초(`/tmp/layoutmanager-r5b-lifecycle-heap.log`)다. 이를 새 전체7 PASS로 합산하지 않는다.10회는 성공4/실패3/취소3, model URL4생성/4해제, 매회 등록FontFace0·raster canvas dimensions0을 보고했다. CDP GC 뒤 JSHeapUsedSize8,993,120→11,426,348bytes는 단일 관측이다.

Manager가 lifecycle 시험 source를 독립 검토했다. native FontFace.load/Canvas.toBlob/FileReader.readAsArrayBuffer hold가 실제 product pipeline의 취소와 encoder mutex를 실행한다. 다만 harness가 zero-size canvas 객체와 URL 문자열을 계속 보유하므로 heap 증가에는 계측 자체의 retained references가 포함된다. 직접 GPU texture/material/geometry dispose 횟수나 장기 leak-free를 증명하지 않는다. 실제 font404/invalid/glyph0/Canvasnull/timeout 및 순수 예산 경계를 추가해 새 전체 lifecycle 실행을 기다린다. Root 권한 Browser도 진행 중이다.

## R5b production build PASS / Browser 분담 실행 GO (2026-11-01)

Root의 단일0.54 production build가 exit0으로 완료됐다(`/tmp/layoutmanager-r5b-build1.log`). Manager 지적2건과 Root UI 수정이 포함됐다. product는 Browser 검증 동안 동결한다. 독립 QA는3420의 Memo General·실제 새 Loader/PNG/한글 렌더를 담당한다. Root는3421 권한 시험, 재사용한 Developer는3422의 **시험 파일만** 작성·실행해 font/PNG/GLTF 취소·중복·URL/font/canvas·10회 수명/heap을 계측한다. 이 Developer 실행을 독립 QA 실행으로 기록하지 않는다.

FontFace.load의 bounded abort는 늦은 FontFace 등록을 막지만 native Promise 자체가 종료됐음을 보장하지 않는다. GLTF parseAsync는 비중단 구간 완료 및 dispose 전 mutex를 풀면 안 된다. 실제 Browser 결과는 이 차이와 heap 관측 한계를 구분해야 한다. 이 기록 시점 새 Browser 결과는 아직 미확인이다. 기반 R5a CI는 Docker 성공, Verify 일반 E2E 진행 중이며 전체 성공으로 기록하지 않는다.

## R5b Root UI 통합 source 검토 / Browser 전 동결 (2026-11-01)

Root의 typecheck(`/tmp/layoutmanager-r5b-root-types2.log`)·owned lint(`/tmp/layoutmanager-r5b-root-lint2.log`) PASS 보고와 client/defaults/기존 snap QA **3 files/24 PASS,582ms**(`/tmp/layoutmanager-r5b-memo-client-unit3.log`)를 확인했다. 최초 private 선택 정리 effect lint 실패는 guarded same-component render adjustment로 보완했다고 Root가 보고했다. 새 production build는 시작됐으며 이 기록 시점 결과 미확인이다.

Manager가 hook/dialog/Viewer·Memo authority/visual/defaults/readonly snapshot의 통합 소스를 독립 검토했다. 서버 Memo 조회는 opt-in 경로에 한정되고 Memo 선택이 없으면 job Memo proof를 적용하지 않는다. 실제 GET actor/scope 및 최종 row 재검사, 그룹 실패 뒤 private 목록/선택/동의 정리와 local 선택 보존, close의 loaded/prepared 제거, AUTO 정확 높이의 inspect/fingerprint 선행 적용, cleanup 종료까지 job mutex를 확인했다. 현 source blocker는 없다.

전체 목록이 처음 준비할 때 바뀌면 inventory 재확인을 요구하고, 최종 download 재검사는 명시 선택 row에 한정한다. 위 source 판정은 실제 native fullscreen·한글 PNG 렌더·비중단 인코더 취소/중복·URL/heap 수명 Browser 검증을 대체하지 않는다. QA는3420 General, Root는3421 권한/3422 lifecycle로 분리해 build 완료 후 실행한다.

## R5b core source 재작업 수용 / 독립 Browser QA 진행 (2026-11-01)

Developer가 실제 scene extras에 Version/SHA·precisionBasis·renderer-loss warning을 넣고 generic Memo GET의 새 DWG415 제한을 제거했다. Manager가 수정과 GLB JSON chunk/embedded glTF JSON 및 새 GLTFLoader의 경고 검증을 직접 읽고 독립 집중 재실행했다. `npx vitest run tests/unit/cad-exchange.test.ts tests/unit/authorized-memo-read.test.ts` → **2 files/27 PASS,1.08초,exit0**, `/tmp/layoutmanager-r5b-manager-repair-review.log`다. authorized DWG 빈 목록과 optional feature/anchor 없는 호환 경로, auth 재검사 유지도 시험했다.

Manager는 이 core/source 수정 범위를 수용하고 독립 QA Browser 검증으로 진행한다. Font/PNG/texture/실 한글 렌더·mixed 조합·권한 및 lifecycle Browser, 수정 포함 production build·전체 gate는 별도이며 아직 최종 R5b 수용이 아니다.

## R5b Developer handoff source 검토 — 재작업 2건 (2026-11-01)

Developer는 focused6 files/53 PASS, typecheck/소유 파일 lint/diff-check PASS를 보고했다. Manager가 core/font/raster/annotation 및 authorized Memo GET 소스를 직접 검토해 두 보완을 지시했다. 정밀도 warning이 반환 report에만 있고 실제 GLB/glTF extras에는 없어 artifact 고지 계약을 충족하지 않았다. 또한 기존 generic Memo GET에 새 DWG415 제한을 넣어 호환 envelope 확장 범위를 벗어났다. 실제 bytes의 경고/precision basis 검증과 기존 feature-off/anchor-absent·허가된 DWG 빈 목록 호환 검증을 요구했다.

이 시점 core 최종 수용은 보류다. QA는 독립 Browser spec/새 Loader·실제 PNG/WebGL helper 작성만 시작하며 Root의 단일 production build 완료 전 실행하지 않는다. Root는 별도 authority/lifecycle Browser를 담당한다. 실제 Browser 결과는 아직 NOT RUN이다.

## R5b 읽기 전용 Memo projection — RED/GREEN 및 source 검토 (2026-11-01)

Root의 신규 client proof 시험 첫 실행은 **2 files/20 PASS·1 FAIL,549ms**였으며 singular transform `[0,0,0,0,10,20]`에서 예상 BROKEN/마지막 WCS(1,2) 대신 ATTACHED/(10,20)을 반환해 실패했다. 로그는 `/tmp/layoutmanager-r5b-memo-client-unit1.log`다. 기존 reconcile의 forward projection만으로는 비가역 행렬을 차단하지 못한 작은 기존 결함이며 단순 읽기 전용 API 리팩터링으로 숨기지 않는다.

공유 snapshot 계산에서 next world를 계산한 뒤 `invertAffine`로 가역성을 검증하고 성공한 경우에만 world를 바꾸도록 보완했다. 유효 target의 기존 reconcile lastWorld 업데이트는 유지하며 snapshot은 복사된 ref/local/world를 반환하고 store를 바꾸지 않는다. Root 재시험 `/tmp/layoutmanager-r5b-memo-client-unit2.log`: **3 files/23 PASS,712ms**. Manager가 최종 로그와 domain diff, `exchange-memo-visual.ts`, `exchange-memo-authority.ts`를 직접 검토했다. selected Memo proof/whitelist, same-revision SESSION 재사용, unbound fresh canonical, actual GET actor/scope/revision0/count/unique ID decoder에 현 source blocker는 없었다.

이는 집중 domain/client proof 결과다. UI hook/실제 Memo GET/PNG·GLTF·Browser 및 전체 R5b 수용은 아직 아니다. Memo 미선택 job에서는 global targetEpoch를 포함한 Memo fingerprint 자체를 적용하지 않아 공개 Source-only가 무관한 Memo 변경에 종속되지 않아야 한다. 해당 통합은 Root 후속 검증이다.

## R5a 게시 확인 / R5b 조건부 구현 GO (2026-11-01)

Root가 R5a [Draft PR #184](https://github.com/planner77/layoutManager/pull/184)를 게시했다. HEAD `9accf8ba3e21f2d51dc7694e768f19c75fffb5d5`, tree `c290a5ec654eeaea3fdd6baacade74b93b5058c9`, parent R4 `458d3da`다. 지정 remote·Secret0·산출물0·30파일/2429추가35삭제·package0.53·local/remote exact tree·clean 검증을 Root가 보고했다. Draft/base R4/mergeable=true를 확인했으며 [CI41239705093](https://github.com/planner77/layoutManager/actions/runs/41239705093)는 **진행 중/성공 미확인**이다. 기존 원본 작업트리 사용자 변경2개는 보존했다.

Manager는 별도 `feat/issue-91-memo-exchange-20261101`의 R5b0.54 구현 GO를 기록한다. Architecture의 구체 타입·옵션·단계·raster/예산 bridge를 동결했으며 Developer core/font/annotation/Memo GET envelope, Root client/Viewer/UI/Browser, QA 독립 검증으로 분담한다. R5b 실제 시험은 아직 NOT RUN이다. R5a CI의 실제 실패 시 의존 구현을 HOLD하고 먼저 해결한다. #91 종료·병합·GHCR·배포는 수행하거나 승인한 결과가 아니다.

## R5a 최종 로컬 수용 — LOCAL ACCEPT / STACKED DRAFT PR GO (2026-11-01)

Manager는 최종 product snapshot, source 재검토, 독립 QA 최종 보고 및 아래 실제 로그를 근거로 **LOCAL R5a ACCEPT / STACKED DRAFT PR GO**를 판정한다. 후보0.53.0, 기반 R4 `458d3da`, export worktree의 미커밋 변경 기준이다. 독립 QA는 별도 core/General 검증을 담당했고 Root는 authority/UI 통합 및 전체 gate를 실행했다. 지정 모델 대행 및 실제 역할은 아래 개발 이력을 따른다.

| 실행 | 실제 결과 / 근거 |
| --- | --- |
| 최종 전체 unit/integration |127 files /858 PASS /0 FAIL,422.47초, exit0. `/tmp/layoutmanager-r5-all-unit-final.log` |
| 독립 QA 전체 General Browser |128 PASS /0 FAIL,14.7분. `/tmp/layoutmanager-r5-uiqa-general.log`; focused4도 같은 전체 실행에 포함 |
| 독립 QA focused exchange Browser |4 PASS,25.3초. `/tmp/layoutmanager-r5-uiqa-focused2.log`; 별도 실행이므로 전체128에 합산하지 않음 |
| 최종 전체 Greenfield Browser |17 PASS,4.2분. `/tmp/layoutmanager-r5-greenfield-final2.log`; first-install2 및 exchange authority4 포함 |
| Runtime Auth / Legacy Browser |각1 PASS,각각 전체18.2초/25.9초. `/tmp/layoutmanager-r5-runtime.log`, `/tmp/layoutmanager-r5-legacy.log`; 각각 별도 suite |
| 최종 정적 / production build |typecheck PASS(`/tmp/layoutmanager-r5-types-last-tests.log`), lint0 errors/기존9 warnings(`/tmp/layoutmanager-r5-all-lint-final.log`), foreign Three guard 포함 build exit0(`/tmp/layoutmanager-r5-build-foreign-fixed.log`) |
| 수정 집중 회귀 |foreign Three core+QA31 PASS762ms; real hash 중 clock rollback 거부 및 원복 포함 Greenfield unit8 PASS11.19초(`/tmp/layoutmanager-r5-greenfield-unit-fixed.log`) |

Manager는 전체 unit/General 최종 로그를 직접 확인했고 QA의 test SHA-256은 `79f068982515a2689c135042c5496205bb0d2dfe9112248676568758f0a9626a`다. QA 포트3410은 종료됐다. 첫 전체unit856 PASS/1 FAIL 및 Greenfield16 PASS/1 FAIL, 초기 foreign geometry 결함과 재시험은 FailureLedger에 유지한다. 이후 test-only fixture 보완은 production auth guard를 완화하지 않았다.

TC-R5-001–008/012의 R5a core·일반/인가 Browser 범위를 수용한다. Native fullscreen, Browser 비중단 인코더 취소·중복·BlobURL/반복 heap, visible Memo, 명시 Version/SHA extras·renderer 정밀도 고지 및 거부된 private 선택 복구 UX는 **R5b 필수 후속**이다. 실 CAD/GPU/2PC·현장 수용은 NOT RUN이며 #91을 종료하지 않는다. 최종 staged/secret/remote/exact-tree 검사·commit/push/Draft PR/새 CI는 Root가 후속 수행하고, 이 로컬 판정은 게시·병합·GHCR·배포 완료가 아니다.

## R5a 권한 거부 뒤 선택 복구 UX 잔여 (2026-11-01)

Root source review상 이미 선택한 서버 그룹이 안정된 Site403을 받으면 private inventory/headers는 제거되지만 dialog의 선택 key가 남아 다음 prepare에서 다시 missing-server 오류가 날 수 있다. 파일/데이터 노출은 없으며 사용자가 Generated 포함을 해제하거나 창을 다시 열면 공개 Source 내보내기가 가능하다. R5a runtime은 동결을 유지한다.

R5b에서는 Outline/Memo 공통으로 unavailable private key를 정리하고 생존 local 선택을 보존하며 부분 동의를 무효화하는 복구 UX를 필수 검증한다. 현재 한계를 숨은 자동 local 선택 확장이나 서버 실패의 빈 성공으로 처리하지 않는다.

## R5a 정밀도 고지 잔여 — R5b 필수 후속 (2026-11-01)

최종 source 검토에서 inventory warnings에는 Source coverage와 BLOCK 안내만 있고, renderer가 이미 잃은 좌표 정밀도를 복구하지 못한다는 문구는 dialog/artifact warning에 아직 없음을 Root가 확인했다. Operation의 문서 제약은 존재하며 `maxQuantizationError`는 현재 renderer snapshot 대비 export의 추가 Float32 오차다. 원본 CAD 정밀도 보장/실 CAD SLA는 검증하거나 주장하지 않는다.

Manager는 R5a의 nonblocking disclosure limitation으로 공개하고 Architecture의 구현 완료처럼 읽히던 문구를 바로잡았다. R5b에서 명시 Version/SHA metadata와 함께 dialog·artifact precision warning을 반드시 추가·검증한다. 활성 R5a Browser runtime은 이 문서 보완으로 변경하지 않았다.

## R5b font 사전 조사 — 구현/렌더 검증 아님 (2026-11-01)

Root가 읽기 전용으로 설치된 opentype.module의 parse와 bundled NanumGothic font를 확인했다. TTF2,054,744bytes, unitsPerEm1000, glyphs13,297이며 실제 glyph index는 한2705/글647/A33/공백13296, emoji😀0이었다. Font coverage lookup 계획의 설치 호환성 근거이며 Canvas/PNG/GLTF texture나 실제 한글 렌더 PASS가 아니다. Emoji 등 glyph0은 R5b에서 명시 지원 불가 오류로 처리한다. R5b runtime 파일은 아직 작성하지 않았다.

## R5a 수정 candidate General 집중 GREEN / 최종 source 검토 (2026-11-01)

Manager가 `/tmp/layoutmanager-r5-uiqa-focused2.log`를 직접 확인했다.0.53.0 수정 production build의 독립 General 집중 시험은 **4 PASS,25.3초**다. Hidden B의 명시 선택 GLB+embedded glTF 다운로드·새 Loader·MIME·단위/좌표5.7초, Source/Generated OFF·protected read0은3.4초, unknown 단위 수동 지정·320px·cancel/reopen·ESC/focus3.4초, Generated 선택·유효 Translate/Rotate·selection/history 불변4.9초다. 원래 foreign geometry Browser FAIL는 별도 실패 이력으로 유지하며 이 새 실행에서 해결을 확인했다.

Manager는 Root의 authority/hook/modal/Viewer 최종 source도 독립 검토했다. 공개 local-only와 명시 서버 opt-in 경계, 전후 actor/scope/row fingerprint, network/JSON 실패의 private state 제거, DTO whitelist, scope/query/close 취소·finally mutex, retry reset/로컬 선택 유지, zero-supported preview와 download 차단에 추가 blocker가 없었다. Native fullscreen·Browser 비중단 인코더 cancellation/중복/URL/heap의 R5b 미검증을 source 검토로 PASS 처리하지 않는다.

Root 수정 build exit0(`/tmp/layoutmanager-r5-build-foreign-fixed.log`), whole lint0 error/기존9 warning 및 typecheck PASS를 확인/보고받았다. Root Runtime Auth1 PASS(시험14.4초/전체18.2초), Legacy1 PASS(시험3.5초/전체25.9초)는 별도 실행이다. 전체 General128·Greenfield17·whole unit은 진행 중이며 최종 결과를 기다린다.

## R5a foreign Three guard 수정 source 수용 (2026-11-01)

Manager가 실제 수정 diff와 `/tmp/layoutmanager-r5a-foreign-core-qa.log`의 **2 files/31 PASS,762ms**를 확인했다. Installed three-dxf-viewer의 실제 getFromPath LINE은 app BufferGeometry instanceof=false지만 isBufferGeometry=true였다. 새 구조 검증은 required geometry/attribute API와 typed storage를 확인하며 기존 finite/index/arity/material/group/planarity/budget 검사를 유지한다. 단순 flag-only 위조는 제외한다. 실제 라이브러리 객체를 사용하는 회귀를 추가했고 Manager가 source repair를 수용했다.

수정 포함 production rebuild·전체 unit은 Root가 시작했으며 아직 결과를 확인하지 않았다. General attempt5의 실제 Browser FAIL는 이 focused 결과로 PASS 재분류하지 않고 수정 build에서 별도 재시험한다. 최종 수용 gate는 TestPlan checklist를 따른다.

## R5a General Browser 실제 결함 — legacy DXF geometry 제외 (2026-11-01)

QA attempt5의 실제 three-dxf-viewer DXF A/B/C에서 B 레이어를 화면에서 숨긴 뒤 B만 명시 export했다. Inventory에는 B1개가 있지만 preview는 지원0/제외1·`UNSUPPORTED_GEOMETRY`를 표시하고 download를 차단했다. `/tmp/layoutmanager-r5-ui-attempt5.log`와 attempt5-results의 error-context/trace를 보존했다. Manager는 visibility filter를 원인으로 단정하지 않고 실제 제외 코드를 확인했다. 현재 guard의 `geometry instanceof THREE.BufferGeometry`가 library의 별도 Three constructor와 충돌하는 가능성을 Root/Developer에게 전달했다. 합성 core29 PASS가 실제 library 객체 경로를 검증한 것으로 확대되지 않는다.

Root3411 시험과 공유 build가 활성화된 동안 runtime 수정·재build는 대기한다. Source download case는 수정 후보에서 재시험해야 하며 R5a 전체 수용은 진행 중이다. 별도의 Generated transform/export/history Browser case는 PASS3.3초, 신규 QA spec 타입 오류 수정 후 typecheck PASS(`/tmp/layoutmanager-r5-ui-types-final.log`)다.

## R5a UI 소스 독립 검토 — Browser 실행 전 (2026-11-01)

독립 QA가 hook/authority/modal/Viewer 연결을 읽기 전용으로 검토했다. 기본 로컬 open은 공개 runtime/session 조회만 수행하고 서버 그룹 opt-in 뒤 보호된 GET을 실행한다. Actor·서버 scope/revision의 전후 재검사, 실패 시 private 목록 제거, 취소·scope 변경의 abort와 cleanup까지 유지되는 job mutex, artifact metadata whitelist가 source에서 확인됐다. 실제 Browser 수용 결과를 뜻하지 않는다.

발견된 UX 보완: 지원 불가 형상만 선택하면 inspect가 산출한 Layer별 제외 사유를 버리고 generic zero-shape 오류만 표시하는 경로가 있다. Manager가 Root에 zero-supported preview/제외 사유를 보존하며 download를 차단하도록 지시했다. ESC/focus trap·복귀/320px/fullscreen 및 native-select Escape는 Browser 시험 대상으로 남겼다. 이 단계에서 별도 Browser/build를 실행하지 않았다.

## R5a core 독립 QA 수용 / UI 통합 gate 진행 (2026-11-01)

Manager는 Developer 완료·source 재작업·독립 QA 결과를 근거로 **CORE INTEGRATION ACCEPT**를 판정한다. 독립 QA 자체 실행은 `/tmp/layoutmanager-r5a-qa-focused.log`의1 file/7 PASS,414ms와 `/tmp/layoutmanager-r5a-qa-lint.log` focused ESLint exit0이다. core+QA29 PASS는 앞선 재검증 기록과 일치한다. QA는 추가 core blocker가 없다고 보고했다. Nested/repeated BLOCK의 legacy/READY baseline, MultiPolygon/hole area·색·계층, Sprite 제외, group 확장 복사 전 차단, exporter 대기 중 취소 후 dispose를 별도로 검증했다.

실제 역할 보완: core 동결 후 Root가 기존 Developer에게 새 `cad-exchange-dialog.tsx` 파일 구현 보조를 배정했다. Root는 hook/authority/Viewer/Browser 책임을 유지하며 core 소유권을 바꾼 것으로 기록하지 않는다.

전체 기능/게시 수용은 아직 아니다. Root의 UI/현재 actor·서버 조회 Browser 회귀, 전체 정적/unit/build, 일반 CAD·Greenfield gate와 최종 합성 performance/lifecycle 증거가 남았다. 실 DXF/GPU/현장 검증은 NOT RUN이다. 개별 inventory `supported:true`여도 선택 조합의 aggregate budget은 prepare에서 명시 거절될 수 있다. R5b Memo는 다음 필수 Unit이며 #91을 R5a로 종료하지 않는다.

## R5a core 재작업 재검증·Node 계측 (2026-11-01)

Developer 수정 후 Manager가 `/tmp/layoutmanager-r5a-core-qa-final.log`를 확인했다. core22+독립 QA7은 **2 files/29 PASS,737ms**다. `/tmp/layoutmanager-r5a-core-types-final.log`의 typecheck 및 `/tmp/layoutmanager-r5a-core-lint-final.log`의 focused lint PASS를 Developer가 보고했다. Group별 정점 확장 상한을 복사 전에 계산하며 QA의 position-read spy0 회귀가 통과했다. unknown Source coverage의 partial 경고는 DXF 선택 시에만 적용해 generated-only에 무관한 동의를 요구하지 않는다. 독립 QA 최종 판정은 별도로 받는다.

`npx tsx tests/benchmark/cad-exchange-benchmark.ts`를 통한 합성 Node 단일 실행 결과(`/tmp/layoutmanager-r5a-core-benchmark.log`)다. Browser/GPU/heap/현장 성능 증거 또는 반복 median으로 해석하지 않는다.

| LINE 수 | 포맷 | bytes | serialize ms | 새 Loader ms |
| --- | --- | ---: | ---: | ---: |
| 100 | GLB | 4,336 | 11.37 | 3.96 |
| 100 | glTF | 5,290 | 1.95 | 21.58 |
| 10,000 | GLB | 281,552 | 29.08 | 1.65 |
| 10,000 | glTF | 374,903 | 29.71 | 12.46 |

추가로10,000개 별도 render object의 capture59.52ms/inspect13.03ms를 측정했다. 한 geometry에10k LINE이 든 앞선 네 행과 구분한다. Browser 통합·최종 전체 gate는 계속 진행 중이다.

## R5a 독립 QA 재작업 — Material Group 복사 전 한도 (2026-11-01)

독립 QA가 `npm test -- tests/unit/cad-exchange-qa.test.ts`를 실행해 **1 PASS/1 FAIL,491ms**를 보고했다. 별도 로그는 이 첫 실행에서 저장하지 않았고 failing regression 파일을 보존했다. Sprite 제외 표시는 PASS. 실패는 150,000개 원본 정점을 두 material group이 각각 참조하는 indexed Mesh(300,000 indices)에서 발생했다. 사전 한도는 원본150k만 세지만 export snapshot은 group별 복사로300k가 되어250k 상한을 넘는다. 최종 reject는 있으나 이미 복사가 끝난 뒤이며, getX spy450,001회(검증150k+복사300k)로 입증했다.

Manager는 TC-R5-007의 **복사 전 한도 위반**으로 판정하고 Developer에 group 확장 후 정점 상한을 사전 계산하는 재작업을 지시했다. QA 회귀는 수정 후 재실행해야 하며 이전 core22 PASS가 이 실패를 덮지 않는다. R5 전체 수용/게시 gate는 진행 중이다.

## R5a core Manager 검토 후 독립 QA 인계 (2026-11-01)

Developer가 구현 완료와 source-review 재작업을 보고했고 Manager가 실제 source와 로그를 검토했다. `npx vitest run tests/unit/cad-exchange.test.ts`는 **1 file/22 PASS,469ms** (`/tmp/layoutmanager-r5a-core-unit.log`), `npm run typecheck` PASS (`/tmp/layoutmanager-r5a-core-types.log`), focused ESLint PASS (`/tmp/layoutmanager-r5a-core-lint.log`), `git diff --check` PASS다. 후보는 R4 `458d3da` 위 uncommitted R5 core이며 앱 버전은 아직0.52.0이다.

반영된 보완: drawRange/array-one·multiMaterial, per-Layer 제외, Float32 이전 double triangulation/Euclidean error, 정점·인덱스·메모리 복사 전 한도와 후검사, 원본/추가개체 namespace, 선형 선택 검증, generated-all 누락 차단, r171 Lines/Points의 명시 KHR_materials_unlit. 독립 QA는 별도 agent에 core audit/추가 테스트를 지시했으며 **진행 중**이다. Root UI/Browser·전체 unit/build·R5 CI·실 CAD/현장 수용은 이22개 테스트로 완료를 주장하지 않는다.

## R4 원격 CI 통과 / R5 의존성 해제 (2026-11-01)

Root가 정확 R4 `458d3da6257b0d9a9cbabdd2f60a74d44860fef4`의 [CI41233433577](https://github.com/planner77/layoutManager/actions/runs/41233433577)을 확인했다. Docker Job124632163549와 Verify Job124632163786 모두 completed/SUCCESS다. Verify 실제 로그: Unit124 files/815 tests, 일반 Chromium124 PASS(8.9분), Auth1 PASS(8.7초, CI native clock), Greenfield13 PASS(1.9분), Legacy1 PASS(10.0초). Draft PR183은 draft/mergeable이며 본 기록은 병합·배포를 의미하지 않는다.

Manager는 R4 원격 CI 의존성 조건을 해제하고 **R5 IMPLEMENTATION GO**를 유지한다. R5의 새 코드·시험·독립 QA는 별도 gate다. 이 milestone은 R5 작업 문서에만 기록하고 검증된 clean R4 worktree를 변경하지 않는다.

## R5a 구현 진행 / Manager 중간 검토 (2026-11-01)

공유 TypeScript bridge를 먼저 작성하고 Root UI와 Developer core 구현을 시작했다. Manager가 bridge에서 실제 `DXF_INSUNITS_<code>` 단위 문자열, 서버 geometry/revision을 포함하는 부분 동의 fingerprint, Layer별 제외 사유/스타일 손실 보고서를 확인·보완 지시했다. 공개 CAD 정책과 충돌하던 local-only Version/Site 인가 요구를 수정했다. ACTIVE 익명 및 OFF/BLOCKED Source/local Generated는 공개 로컬 범위이며 서버 Outline 선택에만 보호된 fresh 조회를 적용한다.

초기 source 검토에서 drawRange/material group, 비평면/유효 attribute 제외, READY 전체 baseline, Generated의 Float32 변환 이전 정밀도 검사, 실패 중 owned geometry 해제 보완을 Developer에게 전달했다. 이는 아직 최종 검증 또는 수용 결과가 아니다. R5 정적/전체 unit/build/Browser/Loader/독립 QA는 **NOT RUN**, 구현 완료 후 실제 결과를 기록한다. R4 CI는 Root가 별도로 관측 중이며 이전 local PASS를 R5 결과로 승계하지 않는다.

## R5 #91 — 분석/설계 착수, 구현 NOT RUN (2026-11-01)

Manager가현재Issue91전체/기존README·AGENTS·version/log/Requirements·Architecture·Database·Decisions·TestPlan을읽고R5a0.53.0/R5b0.54.0경계와TC-R5-001–012를기록했다. 현작업HEAD는R4 `458d3da`,앱은아직0.52.0이다. R5코드/build/unit/Browser/Loader/field는모두NOT RUN이다. 실제installedthree0.171.0source확인과공식문서조사를지원PASS로기록하지않는다.

재사용발견: production Scene은THREE_JSON/CUSTOM_DTO·immutableSceneAsset, test-only scene-poc에GLTFExporter/Loader실험이있다. productionexportreadAPI/선택snapshot은아직없다. READYSourcecoverage총량은확인불가일수있으며원본Entity0/100%를추정하지않는다. bundledNanumGothicTtf를MemoHTMLCanvas계획에사용한다. primitive/texture/양포맷Loader의실제결과는후속Unit에서기록한다.

R4게시후상태: [Draft PR183](https://github.com/planner77/layoutManager/pull/183), source458d3da/tree0cbb6b5/40파일safeauditPASS·R4clean, [CI41233433577](https://github.com/planner77/layoutManager/actions/runs/41233433577)진행중. 아래R4local기록의당시미게시문장은이후게시기록으로보완하며원격PASS·field·성능해결로확대하지않는다. R5새worktree에서만이기록을추가하고cleanR4를변경하지않았다.

## R4-20261101 — #174 메모 스냅 0.52.0 후보 로컬 수용

**Manager 판정: LOCAL FUNCTIONAL + MEASUREMENT ACCEPT / DRAFT PR GO.** R4-REQ1–5 → TC-R4-001–010의 구현·합성 기능·실제 계측 범위를 수용한다. `feat/issue-174-memo-snap-20261101`, 기반 R3 `f179d596`, package/lock0.52.0 후보이며 아직 R4 commit/PR/원격 CI는 없다. #174는 성능·잔여 heap 원인·현장 검증이 남아 OPEN을 유지한다. Frame SLA나 장기 memory leak-free, 실 CAD/GPU/2PC, release/GHCR/운영 배포를 수용한 판정이 아니다.

역할은 Manager의 사전 계약·source/결과 검토, Developer의 domain/server 및 실제 BLOCK/다중 target Browser, Root의 UI/통합·wrapper/계측 보완, 독립 QA의 backend·Actor/지연 query·committed-write 경계 시험이다. 실제 역할과 실패 이력을 아래 기록 및 FailureLedger에 보존한다. Manager가 최종 로그/핵심 source를 직접 확인했다.

| 최종 검증 | 실제 결과·근거 |
| --- | --- |
| Product 전체 Unit/Integration | post-BLOCK123 files/814 PASS,406.06초 — `/tmp/layoutmanager-r4-all-tests-post-block.log`. 후속 test-only Auth guard는 아래 별도 실행으로 확인. |
| Auth harness 집중 | Root3 files/16 PASS,20.05초 — `/tmp/layoutmanager-r4-auth-clock-root-unit.log`; Developer의 별도22.03초 결과와 합산하지 않음. |
| 일반 Browser | 124 PASS,13.0분 — `/tmp/layoutmanager-r4-cad-final.log`. |
| Greenfield Browser | 최종13 PASS,2.7분 — `/tmp/layoutmanager-r4-greenfield-rerun.log`; 이전12 PASS/1 FAIL은 보존. |
| Auth / Legacy | controlled Auth1 PASS13.6초 / Legacy1 PASS22.4초, 각각 별도 suite. |
| Build / Static | post-BLOCK production build PASS; 전체 typecheck PASS; 전체 lint0 ERROR/기존9 WARNING. 마지막 계측 test-only 수정은 scoped type/lint 및 아래2개 재실행으로 검증. |
| 독립 Actor QA | prerequisites 포함3 PASS52.7초, 별도 unit5 PASS295ms. stale Admin A 의도→Editor B POST0, 재조회 후B저장 및 지연 query 편집/취소. |
| 독립 write 경계 QA | prerequisites 포함4 PASS54.9초. 실제 commit 뒤 target 삭제/응답 지연의 canonical WCS·부분 완료 안내·SESSION detach/no-rebind, definite precommit 실패의 기존 관계 보존. |
| 실제 BLOCK/다중 target | combined3 PASS17.1초. BOUNDS 제외 후 두 INSERT별ID/선택WCS, 반복LINE, 두Generated target의 변환/Undo/삭제BROKEN/동일ID복원. |
| 최종 자원 계측 | inspector handler와 Canvas handle을 모두 명시 해제한 별도2 PASS1.6분 — `/tmp/layoutmanager-r4-inspector-final.log`. 아래 수치와 한계 참조. |

### 최종 Browser 계측 — 기능/정리 확인과 성능 한계를 구분

합성 DXF LINE 입력1k/10k와 **실제100개 UI Memo**를 사용했다. 한 Viewer의10k Memo 지원 시험이 아니다. 동일 app build/Chromium1243,30 rAF 간격, 실제 pan, CDP 강제GC heap을 측정했다. 마지막 실행은 다른 무거운 suite가 끝난 뒤 수행했으므로 앞선 병행 실행의 더 큰 수치를 성능 개선으로 해석하지 않는다.

| LINE 입력 / Memo | rAF p50 / p95 / max(ms) | 16.7ms 초과 | heap 진입→100Memo→1차dispose→2차dispose(bytes) |
| --- | --- | --- | --- |
| 1,000 /100 | 16.7 /66.6 /66.7 | 16/30 | 15,606,276→18,268,232→14,242,412→15,778,292 |
| 10,000 /100 | 16.7 /216.6 /216.7 | 17/30 | 67,314,444→68,518,864→31,645,380→48,449,656 |

두 번의 SPA 이탈에서 측정대상7종(`blur/scroll/keydown/pointerdown/pointerup/resize/fullscreenchange`) app window listener는baseline으로 복원됐고 instrumented Workers0, 재진입 Memo0/100·pin0을 확인했다. Tools 첫 개방 뒤와100개 뒤의 동일 panel 상태 listener 수가 같았다. Raw 전체 event counts와 제외 script IDs를 log에 남겼으며 실제 Playwright global-check marker와 동일 script의 harness listener만 제외했다. Native CDP handler/originalHandler42개와 Canvas ElementHandle을 명시 해제했다. 모든 app/global listener가0이거나 모든 memory가 해제됐다는 뜻은 아니다.

**성능/메모리 잔여:** p95는16.7ms frame budget을 넘었다. 10k의2차dispose heap은1차보다16,804,276bytes 증가했고 그 원인은 아직 설명하지 못했다. Inspector reference를 해제한 뒤에도 남은 관측이며 앱 leak/캐시/브라우저 잔존 중 무엇인지 확정하지 않는다. 장기 leak-free나 현장 SLA PASS를 주장하지 않고 #174 성능/실환경 후속으로 유지한다. R4-REQ5의 계측 수행 수용과 제품 성능 수용은 별개다. Root가320px/100pin 화면을 검토했고 overflow0/44px hit target assertion을 확인한 범위만 시각 결과로 기록한다.

추가 Schema/기존 DB migration, Auth owner 정책 변경, 운영 volume/원본 변경은 없다. 실패 이력·사용법·아키텍처/TC와 버전 문서를 갱신했다. Root의 최종 staged Secret/산출물/remote 검사 후 Conventional Commit·R3 기반 Draft PR를 진행하며 새 원격 CI는 실제 결과 확인 전 미검증이다. 다음 구현 묶음은 승인된 잔여 R5이며 #174 현장/성능 관찰을 완료로 닫지 않는다.

## R4 최종 Greenfield13 및 정적 검사 (2026-11-01)

Root의 수정 frozen test snapshot `/tmp/layoutmanager-r4-greenfield-rerun.log`는 **13 PASS,2.7분**이다. Manager가 최종 요약을 직접 확인했다. TC-R4-009 실제 committed/failed boundary와 Actor·durable anchor, 기존 R1/R2/R3/Scene 흐름을 함께 실행했으며 앞선12 PASS/1 FAIL,3.2분은 실패 이력으로 보존한다.

최종 전체 typecheck PASS, 전체 lint 재검사 **0 ERROR/기존9 WARNING**이다. 신규 Auth harness를 포함한 Root 별도 집중 재실행 `/tmp/layoutmanager-r4-auth-clock-root-unit.log`는 **3 files/16 PASS,20.05초**로 확인했다. Developer의22.03초 실행과 별개이며, 앞선 전체123/814가 이 후속 새 harness test까지 포함했다고 주장하지 않는다.

일반124개는 아직 완료 대기이며, CDP inspector handler RemoteObject가 heap 측정에 영향을 줄 수 있어 test harness에서 반환 handler/originalHandler를 명시 해제한 별도 성능2개 재시험을 진행한다. 제품 변경이나 memory leak 해결을 주장하지 않는다. 최종 R4 수용은 그 실제 결과까지 확인한 뒤 판정한다.

## R4 TC-R4-009 독립 실제 write 경계 GREEN (2026-11-01)

독립 QA의 frozen new spec/기존 최신 build/controlled port3406/Chromium1243 실행은 **4 PASS/0 FAIL,54.9초**(`/tmp/layoutmanager-r4-attempt5.log`)다. First-install prerequisites5.5초/29.8초, committed race8.4초, definite precommit abort7.5초이며 Manager가 최종 log와 assertions를 직접 확인했다.

첫 case는 실제 PATCH `route.fetch()`200으로 서버 commit을 확인한 뒤 response를 보류하고 선택 Generated A를 삭제했다. 동일 위치 B/C가 남아 있어도 전달 후 서버 rev1/FREE WCS(30,20)를 유지하고 SESSION binding을 해제하며 저장됐으나 연결을 적용하지 않았다는 안내를 표시했다. 제3 target 재연결은 없었다. 둘째는 `route.fetch()` 전 abort한 명확한 미commit 실패이며 서버 rev0/FREE WCS(20,20)와 기존 KEEP binding이 유지됐다. 응답 불확실한 실제 원격 commit 전체 경우를 이 둘째 시험으로 대신하지 않는다.

Manager는 TC-R4-009의 이 실제 범위를 집중 수용한다. 이전 fixture 실패/중단 이력은 FailureLedger에 남기고 새 전체 Greenfield13 결과를 확인한 뒤 R4 최종 gate를 판정한다. Product 코드를 바꾸지 않은 시험 보완이며 파일/port3406을 종료·freeze했다.

## R4 Auth harness 로컬 수용 / Greenfield 첫 전체 결과 (2026-11-01)

격리 Auth clock 보완 후 Developer의 **3 files/16 PASS,22.03초**(기존 rollback 음성 회귀 포함), typecheck/관련 lint PASS와 fresh controlled Auth Browser **1 PASS,13.6초**(wall15.48초, `/tmp/layoutmanager-r4-auth-clock-results`)를 확인했다. Manager가 preload의 명시 opt-in·owned 임시 경로/권한/파일 검증과 기본 startup 불변을 검토해 Auth repair 로컬 범위를 수용한다. Native1FAIL16.6초의 측정된 역행 이력은 보존하고 새 harness 단위 시험의 전체 CI 포함 여부는 별도 기록한다.

Root 첫 전체 Greenfield는 **12 PASS/1 FAIL,3.2분**이며 유일 실패는 TC-R4-009의 tree selector/cleanup fixture였다. Failed-precommit case와 나머지12개 성공을 전체13PASS로 바꾸지 않는다. 수정된 독립 focused4 및 새 전체13 재시험은 대기다. 일반124개 역시 아직 진행 중이다.

## R4 post-BLOCK 전체 Unit/Integration (2026-11-01)

Root `/tmp/layoutmanager-r4-all-tests-post-block.log`는 **123 files/814 PASS,406.06초**다. 이는 singleton Material/group wrapper 보완 이후 전체 source snapshot의 실제 실행이며 앞선122/809와 구분한다. 전체 일반Browser·Auth fixture 재검증·Greenfield13 및 독립009는 별도 진행 중이다.

## R4 Auth/Legacy 회귀 중간 상태 (2026-11-01)

Root Auth Browser1 FAIL(`/tmp/layoutmanager-r4-auth.log`)로 삭제 preflight401을 진단 중이다. DELETE 미전송과 실제 원인 구분은 FailureLedger를 따른다. 별도 Legacy Browser는 **1 PASS,22.4초**(`/tmp/layoutmanager-r4-legacy.log`)다. Auth 미해결 상태를 Legacy 성공으로 대체하지 않으며 일반124개/최종unit/독립009와 함께 최종 수용 gate로 남긴다.

## R4 최종 동기화 Browser3개 — BLOCK/LINE/Generated (2026-11-01)

Developer의 frozen `issue174-memo-sync.spec.ts` combined 실행은 fresh post-BLOCK build/격리 port3405에서 **3 PASS,17.1초**(wall17.58초, `/tmp/layoutmanager-r4-sync-final-results`)다. 반복 LINE Handle의 distinct RENDER 후보와 SceneWork Undo/Redo, 실제 DXF BLOCK 내부 B1을 두 유효 INSERT C1/C2에서 사용한 x0/x0.6의 서로 다른 renderer ID, 두 Generated binding의 이동·회전·Undo2/Redo2·삭제/BROKEN/동일 ID 복원을 확인했다.

BLOCK은 BOUNDS layer를 숨겨 frame 후보의 false positive를 제외하고 두 번째 instance 선택 후 pin WCS0.6을 확인했다. 최초 실패 fixture의 I1/I2를 유효 hex Handle로 바꿨으므로 wrapper 원인 분리는 별도의 순수 projection RED/GREEN을 근거로 한다. Manager가 최종 source assertion을 확인했다. Scoped ESLint/whitespace check는PASS다. 앞선 단독 실행과 별도인 최종3개 결과이며 전체 일반Browser/최종unit/독립TC-R4-009는 결과 대기다.

## R4 다중 Generated/반복 LINE 집중 Browser (2026-11-01)

Developer가 fresh post-BLOCK build/격리 port3405에서 Generated 두 Memo의 서로 다른 target에 대한 group Translate/Rotate/Undo2/Redo2, 첫 target 삭제→BROKEN/마지막 WCS 유지→동일 ID Undo/ATTACHED 복원을 **1 PASS,11.5초**로 확인했다(`/tmp/layoutmanager-r4-generated-4-results`). 반복 직접 LINE Handle의 서로 다른 RENDER 후보와 바인딩의 SceneWork Translate/Undo/Redo는 별도 **1 PASS,10.8초**(`/tmp/layoutmanager-r4-render-results`)다. Manager가 해당 시험 source를 검토했다.

이전 tools/camera fixture 실패와 interrupted 실행은 FailureLedger에 남긴다. 실제 BLOCK 후보 및 독립 TC-R4-009·전체 최종 회귀는 별도이며 이 두 집중 PASS로 R4 전체 수용하지 않는다.

## R4 중간 전체 Unit 및 BLOCK 집중 수정 (2026-11-01)

BLOCK wrapper 수정 전 snapshot의 `/tmp/layoutmanager-r4-all-tests.log`는 **122 files/809 PASS,260.97초**다. 이후 singleton Material/group eligibility 변경의 집중 시험은4 files/25 PASS/766ms이며 RED3 FAIL/2 PASS/253ms를 별도 보존했다. 앞선809 PASS를 최종 변경 source의 전체 PASS로 승계하지 않는다. 새 build/실제 BLOCK Browser/최종 전체 시험은 진행 예정이다. 최신 source review에서 단일 Material group 전체 coverage와 기존 geometry/scope/ID 경계가 유지됨을 확인했다.

## R4 BLOCK instance 검증 미통과 (2026-11-01)

신규 BLOCK/반복 INSERT 후보 시험이1 FAIL/8.8초로 distinct2개 후보를 확인하지 못했다. Manager는 TC-R4-001을 미충족/진단 중으로 기록하며 기능을 축소하거나 기존 반복 LINE 성공으로 대체하지 않는다. 실제 renderer/fixture/wrapper 진단과 후속 재시험 결과 전까지 R4 전체 수용은 보류다. 상세 이력은 FailureLedger를 따른다.

## R4 Actor 집중 독립 QA 및 영속 이동 Browser (2026-11-01)

독립 QA의 controlled 새 fixture/port3404 실행 `/tmp/layoutmanager-r4-actor-focused-qa.log`는 first-install2+Actor/race1의 **3 PASS,52.7초**, intent unit은 별도 **5 PASS,295ms**다. 준비 Admin A→Editor B 전환 뒤 stale intent의 Memo POST0, B로 재조회 후 POST1/creator B, 지연 query 동안 좌표 편집·취소 유지가 통과했다. QA가 source의 actor/context/epoch/generation을 독립 검토했고 파일을 수정하지 않았다. Manager는 TC-R4-010 집중 범위를 수용하며 전체 R4 완료와 구분한다.

Root `/tmp/layoutmanager-r4-durable.log`는 first-install2+영속 anchor 이동1의 **3 PASS,50.2초**다. 실제 UI APP attach→KEEP(13,14)/target CAS0, client matrix/local 미전송, target Translate(5,7)·Rotate90 뒤 world(-21,18)/local(13,14), reload 복원, DETACH(1.2,2.3) 뒤 target 이동에도 Memo world/revision 불변과 원본 GET0을 확인했다. 성능·여러 target lifecycle 및 최종 전체 검증은 별도 진행 중이다.

## R4 Actor 보완 Root GREEN — 독립 QA 진행 (2026-11-01)

Root `/tmp/layoutmanager-r4-actor-green.log`는 first-install2개+Actor/지연 query1개 **3 PASS,40.6초**다. `/tmp/layoutmanager-r4-actor-units.log`는 intent unit5 PASS/166ms, `/tmp/layoutmanager-r4-actor-build.log`는 production build PASS다. 실제 Actor RED와 별도 실행으로 보존한다.

Manager가 현재 source의 intent actor 비교·Session proof·query generation/편집/취소/unmount 무효화·post-write guard를 다시 검토했고 독립 QA에 기존 build/새 controlled fixture/별도 port3404의 집중 재시험을 지시했다. Root가 작성 중인 durable Browser/성능 시험이나 파일을 변경하지 않는 범위다. 독립 결과와 R4 전체 수용은 아직 대기다.

## R3 최종 원격 CI SUCCESS — R4 기반 확인 (2026-11-01)

Root가 정확 source `f179d59604e552bfd42389420be4851e5a5d0f2e`의 [Run41228523828](https://github.com/planner77/layoutManager/actions/runs/41228523828)을 확인했다. Verify124617629491 및 Docker124617629701은 모두 **SUCCESS**, 필수 step 모두 PASS다. Verify 실제 결과는 unit120 files/795 tests, 일반 CAD117(6.9분), Auth1(7.0초), Greenfield9(1.4분), Legacy1(10.1초) PASS다. 서로 다른 suite의 시간을 합산하거나 로컬 측정과 섞지 않는다.

Draft PR182 body를 최종 CI 링크로 갱신했고 mergeable=true다. 이 기록은 R4 worktree 문서에만 남겨 검증된 R3 source/worktree를 변경하지 않는다. R3 의존성 CI는 성공했지만 R4 자체의 Actor GREEN·성능·영속/수명주기 검증은 여전히 별도이며 R4 완료, merge, Issue 종료, GHCR/배포/현장 수용으로 확대하지 않는다.

## R4 Actor 의도 검증 — RED 확인·GREEN 대기 (2026-11-01)

TC-R4-010의 실제 Browser RED는2 PASS/1 FAIL,31.7초(`/tmp/layoutmanager-r4-actor-red.log`)다. 준비 Actor A와 확정 시 합법적인 Editor B가 달라진 상태에서 POST201이 발생했다. 이 결과를 server 권한 우회로 해석하지 않는다. intent.actorId 직접 증명·확정 전 비교 및 async staging 무효화 보완을 source review했으며 typecheck/관련 lint PASS다. 새 build와 GREEN/독립 QA 전에는 해결로 판정하지 않는다. 상세 실패/보완 경계는 FailureLedger/Architecture를 따른다.

## R4 Memo Browser 재시험 — 부분 검증 완료 (2026-11-01)

Root의 수정된 Memo Browser8개는 `/tmp/layoutmanager-r4-memo-browser-third.log`에서 **8 PASS,36.0초**다. 최종 typecheck/관련 lint도 exit0이다. 직전 두 번째 실행은7 PASS/1 FAIL,40.5초였고 전체 Tools dock이 핀을 덮은 상태로 pointer 좌표를 보낸 시험이었다. Tools를 닫고 hover actionability와 pointerup 전 preview=true를 확인하도록 시험을 수정했다. 최초5 PASS/3 FAIL,44.3초와 함께 FailureLedger의 이력으로 보존한다.

Manager는 immutable snap intent/정확 live candidate 재검증, raw WCS와 OFF, 화면 밖 후보 제외, KEEP/DETACH server 경로, actor/load guard,44px hit target 및 native select 변경을 source review했다. 아직 실제 durable KEEP/DETACH Browser, 여러 target/Undo/Delete/BROKEN 복원과 성능·수명주기 전체 근거가 남아 있어 **R4 전체 수용 아님**이다. 합성1k/10k DXF LINE에 실제100개 UI Memo를 사용하는 별도 성능 시험은 진행 중이며 단일Viewer10k Memo 지원으로 해석하지 않는다.

## R4 재개 기반 — R3 repair f179d59 게시 (2026-11-01)

R3 route/reset test-only repair `f179d59604e552bfd42389420be4851e5a5d0f2e`, tree `81402198fb25ce716ac63d46a2ed0927d7c19ff0`을 Root가 게시하고4파일 local/remote 일치 및 Secret/산출물/환경remote 검사를 확인했다. PR182 mergeable=true이며 [CI41228523828](https://github.com/planner77/layoutManager/actions/runs/41228523828)은 진행 중이다. Manager가 R4 HEAD f179d59를 직접 확인했다. Root의26개 WIP 보존 검사를 근거로 기존 구현·QA를 유지한 상태에서 조건부 RESUME GO를 내렸다. 새 CI 성공·R4 완료·merge·release/현장 수용은 아니다.

R3 최종 수정의 Root9 PASS/2.2분과 독립 QA9 PASS/2.1분은 아래 R3 결과를 따른다. R4 수정 Browser8개 재시험은 아직 진행 전/결과 대기이며 최초5 PASS/3 FAIL은 아래 이력에 보존한다.

독립 R4 backend/domain QA의 실제 최종 실행은 `npx vitest run tests/unit/memo-session-snap-qa.test.ts tests/integration/typed-outline-runtime.test.ts` **2 files/17 PASS,12.27초**다. 별도 logfile은 없고 QA terminal/tool 실행 기록을 근거로 한다. 이전3 files/24 PASS,11.35초 보고와 합산하지 않는다. 시험 작성 과정의 실패4회차 상세는 FailureLedger를 따른다. 이는 아직 R4 전체 UI/제품 완료 판정이 아니다.

## R4 의존성 재HOLD / R3 Greenfield CI 실패 (2026-11-01)

Root 확인: Run41225698027 Verify124609264151의 Greenfield E2E 실패, Docker124609263950 SUCCESS. 상세 원인은 진단 중이며 이전 Unit795/build/general/auth 통과 보고는 전체 Verify SUCCESS가 아니다. Manager는 R4 추가 구현/시험을 HOLD했고 기존 WIP와 완료 근거를 보존했다.

R4 최초 local Memo Browser8개는 Root 보고 **5 PASS/3 FAIL,44.3초**였다. 카메라 zoom 뒤 화면에 culling된 pin DOM 수와 문서 count의 혼동, Generated saved ID를 local-N으로 가정한 fixture, KEEP binding이 보존된 뒤의 reload discard 확인을 처리하지 않은 fixture가 실패했다. 시험 수정과 명시 discard 문구 보완은 이미 작성됐지만 최종 재시험 결과는 아직 없다. 독립 backend/domain QA의 완료 실행별 정확한 건수/로그는 별도 확인 후 기록하며 R3 CI 성공으로 대체하지 않는다.

## R3 repair 게시 / R4 구현 재개 (2026-11-01)

Root가 repair `08cd4062092e0dff6c68ca211accab8d163a0be5`(parent624dd0f), tree `503f793326a0b62f05d26c0c08a27ed71588e14f`의 local/remote 일치와6개 파일 Secret/산출물/환경remote 검사를 확인했다. R3 worktree는 clean, PR182 body 갱신·mergeable=true이며 [새 CI41225698027](https://github.com/planner77/layoutManager/actions/runs/41225698027)은 in_progress다. 이전 Run41224371317은 Docker SUCCESS/Verify 실패로 보존한다.

Manager가 R4 HEAD08cd406과 기존 설계8개 파일 보존을 확인한 뒤 명시 IMPLEMENTATION RESUME GO를 전달했다. 수정의 실제 로컬120/795 및 독립53·Scene12 PASS는 아래 repair 기록을 따르며 새 원격 CI PASS·merge·Issue 종료·GHCR·배포/현장 수용은 아직 주장하지 않는다. 새 CI 실제 실패 시 의존성 HOLD를 다시 적용한다.

## R3 원격 Verify 실패 / R4 의존성 HOLD (2026-11-01)

Root가 [CI41224371317](https://github.com/planner77/layoutManager/actions/runs/41224371317) Verify Job124605333600 실패를 확인했다. 실제118 files PASS/1 FAIL,790 tests PASS/1 FAIL,119.18초이며 `tests/integration/outline-type-catalog.test.ts` TC-R2-003 line191에서 expected400/actual503이다. 원인은 진단 중이며 Docker는 당시 phase1 build 중으로 성공을 주장하지 않는다. R4 구현 GO는 의존성 HOLD로 전환했고 기존 설계/시작된 변경을 보존한다. R3 후속 수정과 새 CI 결과는 확인 후 별도 기록한다.

## R3 #71/#73 — Draft 게시·원격 CI 시작 (2026-11-01, R4 착수 시점)

Root가 로컬수용 source `624dd0fbf453f5ba8e80d2af608fc34e767b5a34`를 게시하고 R2 PR181 기능브랜치를base로 [Draft PR182](https://github.com/planner77/layoutManager/pull/182)을 생성했다. mergeable=true, [CI41224371317](https://github.com/planner77/layoutManager/actions/runs/41224371317)은 in_progress다.56개 stagedGitblobSHA와tree `42c6d628`의원격/source일치, Secret/산출물/환경remote정합성검사를Root가통과보고했다. 원래workspace의사용자Compose/next-env변경2개는보존했고R3worktree는clean이다. CI성공·merge·Issue종료·release/GHCR/운영배포는아직기록하지않는다. 이게시기록은새R4worktree에만추가했다.

## R4 #174 — 설계 착수 (2026-11-01)

R3 base624dd0f의별도 `feat/issue-174-memo-snap-20261101`에서요구/설계/AC를먼저기록했다. 현재코드·시험은NOTRUN, 후보0.52.0이며원문댓글0개를확인했다. 실제PC2대/사내CAD/GPU/운영DB는접근·검증하지않았다. 역할분담/구현GO와안전경계는Decisions/Architecture R4를따른다.

## R3 PR182 Browser route 재작업 — 로컬 수용·게시 GO (2026-11-01)

Source `08cd406`의 [CI41225698027](https://github.com/planner77/layoutManager/actions/runs/41225698027)는 unit120 files/795 tests·일반 CAD117·Auth1 PASS, Greenfield8 PASS/1 FAIL(4.0분), Legacy SKIPPED로 Verify 실패다. Docker는 SUCCESS다. clock repair의 기존 로컬 수용은 유지하지만 전체 R3 원격 수용은 아니다. R4는 새 실패 때문에 다시 HOLD다.

Manager는 실제 test diff를 검토했다. 일회성 응답 소실 이후 pass-through route를 page teardown까지 유지하고 replay 직후 type select enabled를5초 내 검증하는 변경만 있다. refetch와 조기 unroute의 중첩을 피하는 시험 수정이며 제품 guard/timeout 변경은 없다. 원인 확정이 아닌 trace에 부합하는 수명 가설이다. Root fresh build PASS. Root의 controlled clock 전체9개(`/tmp/layoutmanager-r3-ci-routes.log`,port3396)는 **9 PASS,1.9분**, primary replay case17.7초이며 typecheck/관련 lint도 PASS다. 독립 QA의 첫 실행(`/tmp/layoutmanager-r3-ci-routes-qa.log`,port3398)은 **5 PASS/4 FAIL,1.6분**이다. 해당 명령은 positive fixture의 `G7_E2E_MONOTONIC_CLOCK=true`를 누락하고 custom temp root를 사용했다. operations-log401/로그인 heading 및 typed primary/200-row 실패를 그대로 보존하며, 알려진 host clock rollback과 부합하더라도 모든 실패의 인과를 확정하지 않는다. 독립 QA의 표준 auto temp root/`G7_E2E_MONOTONIC_CLOCK=true` 재시험은 **9 PASS,1.8분**(`/tmp/layoutmanager-r3-ci-routes-controlled-qa.log`)이며 수정 target case도 PASS다. 이 실행의200-row 측정은 open480.9ms/End50.3ms로 Root 실행의976.6ms/54ms와 별개다. 다만 `business_scene_origin_reset`401이 기록됐다. Manager source review에서 Source case의 reset 클릭 뒤 unchanged-outline poll은 응답보다 먼저 통과할 수 있으므로, 이9PASS를 해당 reset HTTP 성공의 증거로 확대하지 않는다. Root는 reset의 정확 POST 응답200/`SOURCE_ONLY`를 await하는 test-only 보완 후 Root/독립 QA 전체9개 재시험을 결정했다. 기존9PASS와 reset401 제한을 보존하며 후속 실제200 검증 전까지 Source reset 성공은 당시 미확인이었다.

최종 보완 snapshot에서 Root `/tmp/layoutmanager-r3-ci-routes-reset.log`는 **9 PASS,2.2분,exit0**(primary20.3초/Source17.1초), 독립 QA `/tmp/layoutmanager-r3-ci-routes-reset-qa.log`는 **9 PASS,2.1분**이다. 두 실행 모두 controlled clock과 새 격리 fixture를 사용했다. Source-only case는 이제 정확 POST **HTTP200/`SOURCE_ONLY`** 응답 후 동일 Outline snapshot/overlay를 검증했고 QA 최종 로그에는 reset401이 없었다. 앞선 실행의 성공 주장을 소급해 바꾸지 않는다. 최종 Tree200개 open/End는 Root517.8/54.7ms, QA493.7/47ms이며 합성 단일 Browser 측정이다. 최종 typecheck/관련 lint도 exit0이다.

Manager는 source 두 hunk와 최종 로그/독립 QA 보고를 검토해 **LOCAL REPAIR ACCEPT / 수정 HEAD 게시 GO**를 판정한다. 변경은 E2E1파일+문서3파일이며 제품 runtime과 기존795 unit snapshot은 변경하지 않았다. 이미 실행한 fresh production build를 사용했고 새 unit 전체 실행을 주장하지 않는다. Root가 parent08cd406의 새 HEAD를 게시하고 R4의 모든 기존 WIP를 보존한 채 해당 repair 기반을 반영한 후에만 R4 구현을 조건부 재개한다. 새 CI는 별도 검증이며 실제 신규 실패가 확인되면 다시 HOLD한다. 원격 PASS·merge·release·운영 배포 수용은 아니다.

## R3 PR182 — 원격 Verify 재작업 로컬 수용 (2026-11-01)

원격 CI41224371317 Verify124605333600은 **790 PASS /1 FAIL,118 files PASS/1 FAIL,119.18초**였다. TC-R2-003 invalid-query400 기대에503을 받았으며 R4 구현을 의존성 HOLD했다. 이전 local119/791PASS와 별도 실제 결과다. Root가 재현한 test-clock/native signer mismatch의 RED는2FAIL/1PASS132ms이며 원격에서 정확1ms를 측정한 것은 아니다. 원인·실패 이력은 [FailureLedger](FailureLedger.md)에 기록했다.

수정은 test helper와 unit/integration fixture에만 있다. `max(previous,nativeWall,anchoredMonotonic)`으로 positive lifecycle clock을 맞추고 제품 승인·Session 시간 guard는 유지했다. 실제 signed notBefore-1/정확start/정확expiry 경계와 HTTP503을 시험했다. Root의 집중6 files/51 tests **PASS33.79초**, Manager source/RED/GREEN 검토 완료. 전체 helper 사용자 회귀 `/tmp/layoutmanager-r3-ci-clock-all.log`는 **120 files /795 tests PASS,250.28초**다. 독립 QA는 별도 실행 `/tmp/layoutmanager-r3-ci-clock-qa.log` **5 files /53 tests PASS,39.08초**, `/tmp/layoutmanager-r3-ci-clock-scene-qa.log` **1 file /12 tests PASS,9.59초**를 확인했다. 미래 Session401/스토리지·pointer 변경0과 반복 helper 설치/restore를 검증했고 typecheck/관련 lint도 PASS다. 이 두 QA 실행을 하나의65 tests 실행으로 합산하지 않는다. 기존 CI Docker Job124605333742는 모든 step completed/SUCCESS, Verify 실패는 그대로다. Manager가 source 및 최종 로그를 확인해 **REPAIR ACCEPT LOCAL / 수정 HEAD 게시 GO**를 판정했다. 새 commit/PR CI는 아직 미확인이고 이 기록으로 이전 원격 Verify 실패를 PASS로 바꾸지 않는다. App runtime 코드가 바뀌지 않았으므로 기존 build/Browser 결과는 해당 제품 snapshot 근거로 보존하지만 수정 HEAD의 원격 CI는 새로 확인한다. R4는 수정 HEAD 게시 및 해당 repair를 포함한 기반 정합성 확인 후 구현을 재개할 수 있다. 새 CI가 진행 중이라는 사실은 새 실패가 아니므로 병행 구현을 허용하되, 실제 실패가 확인되면 다시 의존성 HOLD한다. 이 조건부 재개는 원격 PASS·merge·release·배포 수용을 뜻하지 않는다.

## R3-20261101 — #71/#73 타입 지정 서버 확정·영속 Tree (Manager 로컬 수용)

- **후보와 실제 역할:** `feat/issues-71-73-typed-outline-tree-20261101`, R2 base `a1bfe7ef0c9070594d6ce905b6b5668a4fe56bbd`, package/lock `0.51.0`. Manager `gpt-6-astra`가 구현 전 요구·설계·AC와 재작업/수용을 조정했고 Developer `gpt-6-sol`이 backend/schema/API/shared DTO, Root가 Viewer/workspace/Tree/JSON와 통합 회귀를 구현했다. 독립 QA `gpt-6-luna`가 backend gap tests와 실제 지연 GET/actor 전환 Browser를 추가·검증했다. 과거5.6 모델을 실행한 것으로 기록하지 않는다.
- **구현 범위:** Version 인가된 Global 활성 타입 검색/페이지와 Editor의 server-first 확정, actor+Version+key의 durable receipt/동일 요청 replay, Reader 복원, current Type JOIN 기반200개 이하 local/server Tree, 같은 WCS Scene 재게시·Source-only reset 보존, 별도 Source-v2/APPGenerated-v2 snapshot export와 import 새 UUID. Receipt는 최신 빈 Greenfield에만 추가하며 이전 baseline DDL/checksum 및 실제 운영 DB/volume은 변경하지 않았다.
- **독립 backend 검증:** 초기3 files/26 tests PASS18.19초; 재작업 뒤5 files/37 tests PASS32.76초. 실제 Source attestation, 타입/receipt FK·append-only·동시 replay·rollback, 권한 철회·두 Site/Version, DB 전체 graph backup/restore+reopen replay, explicit Scene CAS와 이전 baseline/noDDL, 실제220자 provenance 및250/251·count 경계를 확인했다. 최종 read 승인 만료를 route에서 주입해503/고정 code/private,no-store/Vary Cookie를 확인했다. 이 집중 실행은 아래 전체 suite와 별도다.
- **최종 전체 Unit/Integration:** Root `/tmp/layoutmanager-r3-all-tests-final.log` — **119 files /791 tests PASS,428.37초**. Manager도 최종 요약을 직접 확인했다. 최신 production build 및 typecheck PASS; 전체 lint는0 errors/9 warnings, 후속 변경 E2E lint/typecheck PASS다. 기존 경고를0으로 보고하지 않는다.
- **Root Greenfield Browser:** `/tmp/layoutmanager-r3-greenfield-final.log` — **7 PASS,2.1분**. 실제 인증·신규설치·Scene·로그·타입 회귀와 함께 typed render3개/2타입/두 kind, POST commit 후 응답 소실·같은 key replay200·정확 Outline/Audit/receipt1, local Undo 증가0, 현재 타입명/비활성 참조, Source UI 확정·동일 WCS Scene 교체/Source-only 보존, Reader GET 및 POST403, 별도 BrowserContext 복원, 실제 다운로드→file chooser import→native export를 검증했다. Canvas identity와 원본 content GET0을 유지한다.
- **200개 Tree 계측/시각:** 실제101개 이상 catalogue 페이지 선택 및 서버100+임시100 Tree에서 open1043.5ms, End key58.5ms를 측정했다. Root와 Manager가 `/tmp/layoutmanager-r3-greenfield-final-results/typed-outlines-R3-paged-ca-40f8c-d-keyboard-mobile-tree-rows/r3-tree-desktop.png` 및 `r3-tree-320.png`를 직접 확인했다.320px에서 local/server 수·타입 그룹·내부 Tree 영역과 compact 도구를 확인했다. 합성 Chromium 단일 환경 계측이며 실 CAD/GPU·모든 단말 성능으로 일반화하지 않는다.
- **독립 Browser race/최종 확대9개:** `/tmp/layoutmanager-r3-races-final.log`에서 늦은 이전 GET이 새 typed row를 지우지 않는 흐름7.6초와 이전 actor legacy PATCH가 새 actor의 최신 row를 덮어쓰지 않는 흐름7.3초는 완료 PASS를 확인했다. **확대9개 전체 PASS,2.2분**을 최종 확인했다. 실제320px의200개 Home/End·자체 viewport scroll/외부 scroll 불변도 포함하며, 이 독립 실행의 open471.4ms/End38.8ms는 Root7개 실행의 계측과 별개다. 초기7PASS/2FAIL fixture 이력과 별도 재시험을 합산하지 않는다.
- **일반 CAD Browser117개:** 최신 `/tmp/layoutmanager-r3-cad-e2e-final.log`에서 **117 PASS,10.2분**을 확인했다. Manager도 전체 완료 요약을 직접 읽었다. 이전116PASS/1FAIL 모바일 viewport 결과는 역사로 보존하며 새 실행의 통과로 해결했다.
- **실제 Migrator 검증:** Root의 local target build PASS, image digest `sha256:5813a4f659a7147cf5bb00155ba54b154c9e52ed680a5a6817f475625bb1a7b5`. Receipt6 DDL import smoke와 UID10001/network-none/tmpfs 신규 CLI 설치·재시작 PASS; 최신 `202611010001_greenfield_typed_outlines_baseline` exact schema, receipt FK3, User0/receipt0을 확인했다. 새 DDL을 이미 COPY되는 Module에 두어 PR baseline Dockerfile의 HEAD-source 의존성 closure를 보존했다. 로컬 Migrator 결과는 전체 PR Docker CI나 GHCR 게시 결과가 아니다.
- **실패·재작업 보존:** provenance220>128, 다운로드 fixture의 UUID 확장자, Scene POST의200/201 시험 기대, Tree reopen의105/200 stale snapshot, 모바일 toolbar, Source marker 의미 검증, read/mutation actor·epoch race 및 QA cookie/audit-count fixture는 [FailureLedger](FailureLedger.md)에 구분했다. 제품 guard를 낮추거나 실행 안 한 시험을 PASS로 바꾸지 않았다.
- **현재 판정/잔여:** **ACCEPT LOCAL SCOPE / stacked Draft PR 게시 가능.** Manager가 최종 full119/791·일반117·RootGreenfield7·독립QA9 완료 로그, 재작업 source, desktop/320px capture 및 문서·diff를 검토했다. Commit/stacked Draft PR/원격 CI는 아직 이 기록에 확정값이 없으며 merge·정식 release·GHCR·운영 배포·실환경/실도면 수용은 수행하지 않았다. 게시 전 Root의 staged Secret/산출물·remote 정합성 검사는 별도 수행한다.

## R3 #71/#73 — independent Browser race regression QA (2026-11-01)

- **Owned test:** `src/tests/greenfield-e2e/typed-outline-races.spec.ts` adds two deterministic Browser cases. The typed-create case holds the POST before commit, captures/holds a pre-commit Outline GET, lets the POST commit and the returned row upsert, then releases the stale GET while the post-write refresh is held; the new row remains. The actor-switch case holds a committed legacy Admin PATCH response, switches the same page to a Site-granted Editor, commits a newer Editor revision, then releases the earlier response; the UI and exact Version GET remain at Editor revision 2. Each case logically deletes only its own row with current expected revision/Scene pointer; append-only create receipt is retained.
- **Final full Greenfield run:** command `G7_GREENFIELD_E2E_ROOT=/tmp/g7-first-run-ui-0OtphC G7_GREENFIELD_E2E_PORT=3398 G7_E2E_MONOTONIC_CLOCK=true npx playwright test --config playwright.g7-greenfield.config.ts` from `src/` — `/tmp/layoutmanager-r3-races-final.log`, **9 tests PASS, 2.2 minutes**. It used a fresh private synthetic fixture and included both new races, preceding first-install prerequisites and the 200-row tree stress test. Final tree output was 100 server + 100 local, open471.4ms, End38.8ms; 320px Home/End focus, own-viewport scrolling and unchanged outer window scroll also passed. This synthetic single-Chromium timing is not a general device-performance claim.
- **Failed full-run history and fixture corrections:** the first completed full9 attempt was **7 PASS / 2 FAIL, 2.8 minutes**. The new actor test changed password through `page.request` before its Admin setup, which shares the page's cookie context; its subsequent catalogue fixture therefore lacked the expected `items`. Separately, the new first race correctly soft-deleted its Outline while retaining its receipt, so the existing typed-outlines test's absolute CREATE count became4 instead of3. The test was corrected to use the isolated `request` fixture for the temporary-password flow; Root changed the existing count check to compare the initial baseline plus three and assert the specific committed Outline/audit/receipt exactly once.
- The second full9 attempt was **8 PASS / 1 FAIL, 2.2 minutes**. The actor test reached the post-switch read but assumed `/api/g7-runtime/auth/login` returned `actor`; it does not. It now obtains the current actor from `/api/g7-runtime/auth/session`. The final fresh-fixture full9 run above passes. No production authorization guard was changed to accommodate these fixture corrections.
- **Static checks:** `npx eslint tests/greenfield-e2e/typed-outline-races.spec.ts` and `npx tsc --noEmit --pretty false` both exited0 after the final test edits. No additional test run or product source edit was made by QA after the final9 pass. This evidence is local synthetic Browser QA, not CI, deployment, production data or real CAD validation.

## R2 #65 — 게시 및 CI 진행 기록 (2026-11-01)

Manager 로컬 ACCEPT는 [Decisions](Decisions.md)에 기록했다. 이후 Root가 commit `a1bfe7ef0c9070594d6ce905b6b5668a4fe56bbd`를 게시하고 R1 기능 브랜치 base의 [Draft PR181](https://github.com/planner77/layoutManager/pull/181)을 생성했다. [Run41215035518](https://github.com/planner77/layoutManager/actions/runs/41215035518)이 실제 시작되어 `feat/**` 대상 trigger를 확인했다. R3 초기 설계 시점에는 Docker 성공/Verify E2E 진행 중이었고, R3 구현 GO 직전 Root가 **Docker Job124577696954와 Verify124577697226 모두 completed/SUCCESS**, 실패 step0 및 일반/Auth/Greenfield/Legacy 검사 성공을 재확인했다. PR181은 draft/mergeable=true다. merge, release/GHCR, 운영 배포는 수행하지 않았다. 아래 R2 local run의 당시 미게시/CI 대기 서술은 이 후속 실제 기록으로 게시·원격 CI 상태만 갱신하며 실환경 수용으로 확대하지 않는다.

## R3 #71/#73 — independent backend/shared DTO QA (2026-11-01, rework finding)

- **Scope and roles:** Candidate branch `feat/issues-71-73-typed-outline-tree-20261101`, version `0.51.0`; Developer-owned backend/schema/API/shared DTO freeze reviewed. Manager `gpt-6-astra` approved the scope, Developer `/root/logs_developer` owns implementation, independent QA `/root/manager/qa` added focused tests. Root's Viewer/tree/export/E2E work remains in progress and was not reviewed or modified. No full build, full suite, browser, real database/volume, commit, push or deployment was run by QA.
- **Independent frozen-suite execution:** `npx vitest run tests/integration/typed-outline-runtime.test.ts tests/integration/g7-greenfield.test.ts tests/integration/outline-type-catalog.test.ts` — **3 files / 26 tests PASS, 18.19s**. Independent review confirms tests exercise current write permission before receipt lookup, same-key concurrent serialization and exactly one Outline/CREATE Audit/receipt, different-key creation, request digest mismatch, inactive-type replay versus inactive first create, soft-deleted replay `410`, type/receipt FK and scope guards, append-only receipt, explicit Scene N+1 updates versus omitted/old pointer `409`, old R2 baseline `503` without DDL, and source of current labels via type JOIN. These are synthetic disposable Greenfield fixtures.
- **Independent QA cases and rework rerun:** `src/tests/integration/typed-outline-qa.test.ts` has four synthetic cases for Site B access/global catalogue, full SQLite-table backup/restore and reopened idempotent replay, replay denial after grant revocation, and a route-level approval expiry injection. Re-run with `npx vitest run tests/integration/typed-outline-runtime.test.ts tests/integration/g7-greenfield.test.ts tests/integration/outline-type-catalog.test.ts tests/integration/typed-outline-qa.test.ts tests/unit/cad-business-contract.test.ts` — **5 files / 37 tests PASS, 32.76s**. The graph comparison excludes only the AuthSession last-seen timestamp expected to advance during an authorized replay.
- **Root Greenfield browser failure (separate from QA runs):** `/tmp/layoutmanager-r3-greenfield.log` contains **4 PASS / 1 FAIL, 48.2s** across five cases. The first four existing first-install/Scene/operations-log/R2 catalogue cases passed. New `typed-outlines.spec.ts` typed POST confirmation failed at expected201/actual422 `OUTLINE_DERIVATION_INVALID`. Captured synthetic render claim had six opaque `derivedFrom` Scene IDs, maximum string length220; server validation allowed only128, while existing Generated-v2 import permits250. Playwright's later `apiRequestContext.get: Test ended` is teardown/logout after the assertion failed and is a consequence, not evidence of an authorization/logout defect. Root's source-preserving follow-up is pending fresh Greenfield browser rerun.
- **Focused checks:** after the rework, `npm run typecheck` **PASS**, `npx eslint server/cad-business/typed-outline-read.ts server/cad-business/validation.ts tests/integration/typed-outline-qa.test.ts tests/unit/cad-business-contract.test.ts` **PASS**, and `git diff --check` **PASS**. Developer's pre-rework report remains separate: 3 files / 26 tests PASS (17.77s), backend lint/typecheck and DDL import PASS. QA made no production implementation changes.
- **Backend findings after rework:** Manager-directed changes now map approval-current failures in the typed read service to safe `CadError('G7_RUNTIME_BLOCKED',...,503)`. The route-level injected expiry test returns **503 / `G7_RUNTIME_BLOCKED` / private,no-store / Vary Cookie** after `cadOutline.findMany` resolves; the test restores Date.now and DB factory mocks in `finally`. `provenance()` preserves max count256 and accepts individual IDs through250; unit cases accept the actual220-character Scene occurrence ID and250, reject251, duplicates and257 entries. Both backend findings are resolved within focused synthetic evidence.
- **Remaining / NOT RUN:** Root must rerun the failed Greenfield browser suite against a fresh build to confirm the typed POST succeeds end-to-end and the later teardown failure disappears. QA did not run the full Unit/Integration suite, production build/browser, remote CI, real CAD/GPU, operating DB/volume or deployment. No overall R3 acceptance recommendation until Root's fresh browser evidence is available.

## PR #180 R1 CI repair — embedded baseline migrator shim fixtures (2026-10-31)

- Antecedent: Docker Job `124564000864` in [Run 41210398076](https://github.com/planner77/layoutManager/actions/runs/41210398076) failed at baseline preparation with `Baseline logger package manifest differs from expected source`; downstream Docker build, smoke and size checks were SKIPPED, not passed. Details and original run state remain in [FailureLedger](FailureLedger.md).
- Follow-up: [Run 41211482860](https://github.com/planner77/layoutManager/actions/runs/41211482860) on the repaired source completed with both Docker and Verify Jobs **SUCCESS** (Root verified all steps). This new run resolves the R1 CI retry gate; the original Run `41210398076`/Docker Job `124564000864` failure remains historical and unchanged.
- Independent QA: `npx vitest run tests/unit/standalone.test.ts` — **1 file / 24 tests PASS**, including TC-LOG-MIG-003 actual execution of the embedded Python against temporary baseline fixtures: missing dependency inserts exactly one migrator COPY; existing dependency is byte-identical no-op and second execution remains unchanged; duplicate/missing/malformed/wrong-stage anchors or dependencies and ambiguous migrator stages are rejected without mutating the fixture. The warning `Digest-pinned GHCR_IMAGE requires GHCR_MIGRATION_IMAGE explicitly` is from an existing negative-input test; Vitest exited 0.
- Workflow diff review: only the baseline Dockerfile preparation heredoc changed (29 additions/5 removals) plus tests. It validates a unique migrator stage and exact anchor/dependency placement; the subsequent baseline/phase1/runtime/migrator Docker builds, size measurement, image audits and smoke steps remain present and unchanged. `git diff --check` PASS.
- Fixture and static workflow-contract results are independent QA evidence; actual image/migrator/Docker pass evidence comes only from Run `41211482860` above. No publish/deploy/Issue operation was performed.

## R2-20261101 — #65 Global OutlineType local verification (QA complete / Manager decision pending)

- **Baseline and attribution:** R2 actual baseline `b9dcdf5` (initial design snapshot `a2a`). Actual available roles/models used, per the current repository role mapping: gpt-6-astra Manager `/root/manager` (scope/approval/Issue coordination), gpt-6-sol Developer `/root/logs_developer` (backend/schema/API), gpt-6-luna independent QA `/root/manager/qa`, and Root (UI/Greenfield runner/full regression support). The older user-provided gpt-5.6 role model was not available/executed for this snapshot. This entry covers only the local candidate; no commit, PR merge, release, or real database/deployment operation was performed.
- **Backend QA run:** `npx vitest run tests/integration/outline-type-catalog.test.ts tests/integration/g7-greenfield.test.ts tests/integration/g7-runtime-auth.test.ts` — initial 3 files/25 tests PASS; after the catalogue pristine probe was added, independent rerun **3 files / 26 tests PASS** (60.54s). Coverage includes Admin global CRUD and persisted GET, normalization/name uniqueness including inactive reservation and `ß` vs `ss`, role/read/manage denial, CSRF/Host, request bounds, simultaneous CAS and unique-name races, actual latest-baseline `PRAGMA foreign_key_list`, invalid FK insert/update and valid type reference preservation through rename/deactivate/reactivate, audit/physical delete guards and audit-failure rollback, isolated backup/restore parity, historical memo baseline validator plus API503/`sqlite_master` no-DDL equality. The new true User0 catalogue probe verifies User/AuditEvent/OutlineTypeAudit are zero before calls; list/access/create each return 503, and all four User/AuditEvent/OutlineTypeAudit/OutlineType row counts remain zero. Shared G7 Auth pristine-bootstrap audit-zero coverage is separate evidence.
- **Root-reported build/UI evidence:** Next production build PASS; full ESLint 0 errors / 11 existing warnings. Final controlled Greenfield R2 scenario after build/text changes **4/4 PASS, 42.5s**, covering CRUD/CAS/selection+Undo/network failure and retry/paging/mobile/fullscreen/Renderer reset/Reader denial/logout+relogin persistence. Independent QA reviewed `OutlineTypeManager`, Viewer tools-panel content/title override and the E2E source; it asserts original CAD content GET count0, Canvas DOM identity stability, and unchanged selection/Undo after tools return. The two corrected legacy Issue41/42 E2E files separately pass **4/4, 8.7s**. Root-executed results, not rerun by QA.
- **Root-reported migrator build:** local `migrator` target image build **PASS**, image `cad-layout-viewer:r2-0.50.0-migrator-test`, digest `sha256:346d31d91e8e5cf4c2cbc4a7275c816c282928a9b93f965c0bec970f69b61f41`; latest DDL/tsx import smoke executed. This is a local target image test, separate from complete production Docker CI.
- **Root-reported isolated image runtime smoke:** disposable `--rm --network none`, tmpfs `/data`, UID10001 Greenfield initialization and restart verified the latest baseline, actual FK, empty Users and zero type-audit rows **PASS**. This supplements the target build/import smoke; it is not a production-volume test or complete PR Docker CI.
- **Full-suite failure history (resolved in final candidate):** first Root run **114 files / 758 tests: 757 PASS / 1 FAIL**: Scene concurrent CAS observed 0 fulfilled where the race contract expects exactly 1 fulfilled + 1 rejected; individual rejection code was not captured. Bounded replay passed 7 attempts; attempt 8 failed signed-authority preparation with `G7_RUNTIME_BLOCKED/503`, a separate symptom not proven to be the original rejection. Scene-only `installMonotonicTestClock` fixture, future-session/no-storage regression and early synchronous guard correction were test-only; corrected Scene file then passed **12/12, 18.61s** including `storage.putVerified` call count 0. Root's diagnostic clock probe measured wall `-2409ms` vs monotonic `+100.914ms` (drift `-2509.914ms`); plausible but not established as cause of the first CAS failure.
- **Audit-order follow-up:** the affected `g7-runtime-cad.test.ts` file now passes **18/18, 12.33s** after the test-only query was changed to `ORDER BY rowid` so the exact four actions are asserted in database insertion order. Actor, Site, requestId and UTC checks are retained; production source is unchanged. The earlier full-suite failure remains preserved as history.
- **Final Root full-suite result:** `/tmp/layoutmanager-r2-all-tests-accepted.log` — **114 files / 760 tests PASS, 234.30s**. The log ends with all 114 files and all 760 tests passed. This closes the local full-suite gate for this candidate; it does not erase the earlier failed runs.
- **PR CI trigger repair review:** Manager authorized a narrow branch-filter change so a stacked R2 PR targeting `feat/**` runs the existing workflow. Exact `.github/workflows/pr-ci.yml` diff adds only `- 'feat/**'` after `main`; event types, manual dispatch, permissions, concurrency, jobs and gates are unchanged. Root's `npx vitest run tests/unit/standalone.test.ts` run passed **1 file / 24 tests, 497ms** (`/tmp/layoutmanager-r2-ci-fixtures.log`), exercising the embedded Python/workflow fixtures. This is a workflow-contract test, not a remote CI run.
- **Remaining / NOT RUN:** R2 remote PR Docker/Verify CI remains pending. The R1 PR180 Docker CI retry is the successful Run `41211482860` above. Independent QA did not run typecheck/lint while Root's build was active, did not rerun Root's Greenfield/browser or full Vitest suite, and did not exercise real DB/volume/deployment. R2 typed-outline creation/tree integration remains deferred to R3 #71/#73. Historical-schema test proves validator compatibility plus API fail-closed/no-DDL under latest signed identity; it does not accept old release authority. Version-change and Memo-specific selection combinations and real field use remain unverified. Local full-suite and exact workflow-diff review support recommending local R2 Draft PR acceptance, subject to Manager's verdict; this is not remote CI, release or deployment approval.

## U-R1-20261031 — #60/#61/#62 로컬 코드 수용 (0.49.0 후보)

- 기준: Main `9016feb` 기반 `feat/remaining-issues-20261031`의 이 보고서를 포함한 후보 tree. 원본 작업 폴더의 Compose/next-env 미커밋 2건은 보존했다. 잔여18개 이슈의 PR 묶음/순서는 Decisions의 2026-10-31 실행 표가 단일 기준이다. 다음은 R2 #65이며 전체 목표 완료는 아니다.
- 실제 역할: gpt-6-astra Manager `/root/manager`가 구현 전 요구/설계/AC/TC 및 최종 수용을 담당했다. gpt-6-sol Developer `/root/logs_developer`는 권한·reader·DTO·API·집중시험, Root(GPT-6)는 UI/SSR/Proxy/내비게이션·E2E·통제시계 fixture·전체회귀·Git/PR을 담당했다. gpt-6-luna 독립 QA `/root/manager/qa`는 실제 Audit INSERT 실패, 권한/만료/철회·한도·신규 Proxy 검증을 수행했다. Root 구현을 Developer가 했다고 기록하지 않는다.
- **최종 판정: Manager LOCAL CODE ACCEPTED**. 최신 Next native Production Build(`/tmp/layoutmanager-r1-proxy-build.log`)·Typecheck(`/tmp/layoutmanager-r1-proxy-typecheck.log`) PASS, 전체 ESLint(`/tmp/layoutmanager-r1-proxy-lint.log`) PASS(0ERROR/기존11WARNING), diff/Secret/산출물 검사 위반0.
- 전체 Vitest **112 files / 731 PASS**, 215.62초(`/tmp/layoutmanager-r1-final-all-tests.log`) 뒤 신규 Proxy unit **1 file / 6 PASS**(`/tmp/layoutmanager-r1-proxy-test.log`). 두 실행을 단일 전체737 실행으로 표현하지 않는다. 독립 QA의 기존6files49PASS 및 Proxy6PASS는 이 수용을 위한 별도 집중 근거다.
- 일반 Chromium CAD 회귀 **117/117 PASS**, 8.5분(`/tmp/layoutmanager-r1-all-e2e.log`): 등록/Current/삭제·DXF/DWG·선택/편집/Tree/검색/메모·Scene·전체화면 등을 포함한다. 이 run 이후 R1 전용 Proxy/통제시계 fixture/로그 화면 보완을 적용했으며 CAD 매칭·렌더링 코드는 변경하지 않았다.
- 최신 native Proxy + 통제 합성 시계 Greenfield Chromium **3/3 PASS**, 24.6초(`/tmp/layoutmanager-r1-proxy-greenfield.log`): 빈 DB→최초 Admin→초기 변경/로그인/실제 logout, Scene 저장→독립 BrowserContext/reload(원본 GET0/Index Worker0), 실제 로그 권한 부여/회수·직접 URL401/403/허용200 및 API403/보관비활성200. 로그 UI 데이터만 Mock DTO를 사용해 필터·상세·Clipboard·request timeline·410·empty/partial/503·320px·정리를 검증했다. 실제 허가된 REST→L3 writer→bounded filesystem reader→DTO는 `operations-logs-qa.test.ts` Root 추가 시험 **8/8 PASS**(`/tmp/layoutmanager-r1-real-reader-test.log`)와 전체731에서 별도로 검증했다. 실제 `/data/logs`나 운영 DB는 사용하지 않았다.

| 요구/TC | 구현·실제 근거 | 결과/경계 |
| --- | --- | --- |
| R1-REQ1/5, TC-R1-001/002/006 | 기존 global G4 + logs:read/Audit, bootstrap User0 차단, 실제 SQLite Audit trigger 실패/read0, 만료·미래발급·철회·위조/권한·rate/no-store | 로컬 PASS; 운영 활성화/사내 현장 별도 |
| R1-REQ2/3/4, TC-R1-003~005 | 실제 L3 writer→REST, >200행 필터·tie/페이지 재요청·actor/filter/expiry/rotation, corrupt/raw canary·private mode/symlink·4097 enumeration/monotonic deadline | 로컬 PASS; 모든 byte 경계·실 볼륨 성능/백업 미실행 |
| R1-REQ6/7, TC-R1-007/008 | 실제 auth+Mock UI DTO의 검색/타임라인/Clipboard/상태/320px·unmount abort, 기존 CAD117회귀 | 해당 합성 범위 PASS; focus race 전 조합/실 PC2대 미검증 |
| TC-R1-009 | 최신 Node Proxy unit6 + native Build/Greenfield 실제 HTTP401/403/200; API/Page 후속 인가 보존 | PASS; 과거 safe-shell200 제한은 최신 Proxy로 대체 |

- 실제 시계 역행(10초 표본 최대2499ms)으로 실패한 run, 원래 User0 Audit 오염 결함, 잘못된 selector/Date.now mock 재귀·세션 정리·ESM lint 조치는 FailureLedger에 보존했다. 통제 시계는 affected test fixture 및 opt-in dedicated `/tmp/g7-first-run-ui-*` webServer만 사용하며, production Session/CSRF/issued_at/revoked_at 검사는 유지한다. Non-fixture preload 시작 거부도 확인했다. 통제 환경 PASS는 실제 운영 시계/NTP나 현장 PASS가 아니다.
- npm ci 관측29건(19moderate/9high/1critical)은 기존 고정 의존성 graph의 audit 결과이며 강제 업그레이드하지 않았다. 새 외부 의존성·DB schema/migration·원본 CAD·Volume/Compose·운영 권한·GHCR/tag 변경은 없다. CLI와 Root .env Git credential은401; 연결된 GitHub 도구로 검증한 동일 tree만 Draft PR로 게시한다.
- **잔여:** PR CI/리뷰·Main/GHCR·현장 PC2대/실 DXF/GPU·실 로그 Volume/백업·운영 시계 수용은 NOT VERIFIED. Issue 자동 종료/병합/배포하지 않는다. Commit/원격 branch/PR 및 CI 시작 여부는 최종 Git/PR 메타데이터를 기준으로 별도 확인한다.

## R1 #60/#61/#62 — 독립 QA 추가 검증 (2026-10-31)

- 독립 추가 파일 `src/tests/integration/operations-logs-qa.test.ts`: 실제 SQLite `AuditEvent` INSERT를 trigger로 거부했을 때 REST가 503을 반환하고 로그 query 함수가 호출되지 않으며 감사행이 생성되지 않는 TC-R1-002 검증, 정상 발급 규칙으로 9시간 전 `newSessionCandidate`를 별도 INSERT해 expired Session을 검증, revoked Session 및 `logs:read` grant 철회가 파일 query 전에 401/403으로 끝나는 TC-R1-001/002 검증, 빈 `level/event/operation/component/source/outcome/requestId/jobId/errorCode` query 값이 각각 400 + `private, no-store` + request ID로 반환되는 TC-R1-003 검증을 추가했다. HTTP limiter rejection은 `reserve`가 `LOG_RATE_LIMITED/429`를 throw하도록 경계 주입하여 route의 429 + `Retry-After: 60` + no-store 및 query 미호출을 확인했다.
- 실행: `npx vitest run tests/integration/operations-logs-qa.test.ts tests/integration/operations-logs-access.test.ts tests/unit/operations-logs-access.test.ts tests/unit/operations-logs-query.test.ts` — **4 files / 18 tests PASS**. 추가로 `operations-logs-qa.test.ts`와 `operations-logs-query.test.ts` ESLint **PASS**, `npm run typecheck` **PASS**, `git diff --check` **PASS**. Query directory-entry cap(4097 entries, explicit partial)과 monotonic 2s deadline(벽시계 롤백으로 scan budget이 늘지 않음)도 새 source 경계 테스트에서 PASS. Existing limiter unit test separately verifies configured real cap arithmetic (2 per identity / 3 aggregate / 10 entries); route test above verifies HTTP mapping, not 240/600 actual endpoint requests. Developer's focused 19/19 PASS is separate evidence. Whole Vitest/build/Greenfield E2E remains Root-owned.
- 한계: 각 byte/file/response 상한의 모든 경계값과 브라우저 focus race는 이 추가 run에서 실행하지 않았다. Rate limit은 각 Node worker 프로세스 기준 600회/분 aggregate와 token당 240회/분이며 다중 replica 간 공유가 아니다. 최초 HTML denial 200 관측은 이력이다. 최종 `/operations/logs` SSR 경로는 아래 TC-R1-009 Proxy로 동일한 401/403/429/503 인증 결과를 돌려준다. 실 운영 로그 Volume·백업/복구, 사내 Auth/브라우저, 침투시험은 NOT VERIFIED.

## R1 #60/#61/#62 — monotonic fixture 안정화 후 6개 focused 파일 재실행 (2026-10-31)

- 실제 시계에서 관측된 벽시계 역행(약 2.5초)과 synthetic monotonic fixture 결과는 별개다. Root가 이를 FailureLedger에 실제 환경 실패 근거로 보존했고, 테스트 전용 `installMonotonicTestClock`로 런타임 Auth/CAD 및 R1 fixture lifecycle을 안정화했다. 명시적으로 미래에 발급된 session은 운영 규칙대로 fail-closed 되는 독립 R1 케이스도 유지한다.
- 첫 synthetic-clock 6-file run **48/49 PASS, 1 FAIL**: `g7-runtime-cad`의 publication-expiry test가 helper 설치 후 `Date.now.bind(Date)`로 wrapper를 캡처해, fallback에서 자기 wrapper를 재귀 호출하며 `RangeError: Maximum call stack size exceeded`를 냈다. 제품 인증 assertion까지 도달하지 못한 테스트 clock integration 결함이었다. 테스트만 보완해 helper 적용 전의 수치 wall-clock 및 `performance.now()` anchor로 fallback 시간을 계산하게 했고, production source/clock guard는 변경하지 않았다.
- 수정 후 실행 `npx vitest run tests/integration/operations-logs-qa.test.ts tests/integration/operations-logs-access.test.ts tests/unit/operations-logs-access.test.ts tests/unit/operations-logs-query.test.ts tests/integration/g7-runtime-auth.test.ts tests/integration/g7-runtime-cad.test.ts`: **6 files / 49 tests PASS**. 영향받은 6 TS 테스트 파일 ESLint **PASS**, `npm run typecheck` **PASS**, `git diff --check` **PASS**. 실제 시계 역행 위험이 제거됐다는 운영 증거로 해석하지 않는다.
- Greenfield Chromium/DB setup은 Root 별도 controlled run 3회 담당 중이며 이 기록에 포함하지 않는다. 실 운영 시계/NTP, Volume, Auth, 배포 및 현장 보안 수용은 NOT VERIFIED.

## R1 #60/#61/#62 — protected SSR Proxy TC-R1-009 (2026-10-31)

- `src/proxy.ts` 독립 source review: matcher는 `/operations/logs` 한 경로이며 `authorizeOperationLogs`를 재사용한다. 승인 시 private/no-store로 Next 진행; 인증 거부는 고정된 안전 HTML과 상태 401/403/429/503, private/no-store, Cookie Vary, 429 Retry-After를 반환한다. 예기치 않은 오류는 안전하게 503으로 축약한다. CAD 경로를 matcher에 넣지 않는다.
- 실행 `npx vitest run tests/unit/operations-logs-proxy.test.ts`: **1 file / 6 tests PASS** (RSC/prefetch용 401·403·429·503 denial, 허용 진행, 좁은 matcher, 비밀 상세 비노출). `npx eslint proxy.ts tests/unit/operations-logs-proxy.test.ts` **PASS**. 이 focused run은 Proxy route unit 근거다.
- Root의 실제 Greenfield HTTP 401/403/200 검증 3회는 실행 중으로 인계되었으며, 완료된 결과를 확인하기 전에는 PASS로 표기하지 않는다. 초기 page guard의 safe-denial HTML 200 관찰은 과거 결과로 보존하고 최종 Proxy 동작과 혼합하지 않는다. 실제 로그인 브라우저, 운영 G7, Volume/배포/현장 보안 수용은 별도 검증.

## PR #179 최종 소스 CI·병합 수용 기록 (2026-10-31)

- 최종 PR HEAD `7698b0e035d330361005780fb1e838f5ab421457`: [Run 41205118337](https://github.com/planner77/layoutManager/actions/runs/41205118337) Verify Job `124548636367` + Docker Job `124548636626` **둘 다 SUCCESS**. Main behind 0, mergeable true, Codex P2 2건 Resolved, 미해결 리뷰 0. 기존 실패 Run 41194360963 / 41202514157은 실패 원장 보존.
- [PR #179](https://github.com/planner77/layoutManager/pull/179) Main Squash `4d86a6b1895b2d7e1f70cc69d66cd41b072ab9f8`로 병합, #58/#59 `closed/completed`. [Main CI Run 41206533210](https://github.com/planner77/layoutManager/actions/runs/41206533210) push 시작 확인, CI 완료/정식 GHCR App·Migrator 0.48.1 OCI digest **NOT VERIFIED**, 사용자 요청으로 모니터링 생략. 현장 진단/복구/Volume·G7 전환 검증 별도.
- 이 기록은 소스·릴리스 검증 뒤의 docs-only Main 변경이며, 검증된 배포 아티팩트 소스 커밋과 혼동하지 않는다.

---

## PR #179 — v0.48.0 기준 최종 PR CI SUCCESS 및 v0.48.1 새 HEAD 미검증 (2026-10-31)

- 기존 HEAD `ac285b690f4b57cf2fca89cb10f9f029308b0987`의 [Run 41203460377](https://github.com/planner77/layoutManager/actions/runs/41203460377): Verify Job 124543839312, Docker Job 124543839619 **모두 SUCCESS**. 이전 실패 Run 두 건은 실패 원장에 보존.
- v0.48.0은 이미 이전 Main 56221f8d에 release tag가 있으므로 PR #179의 새 기능을 별도 정식 버전으로 게시하려면 v0.48.1 필요. package.json 및 package-lock.json root version 동시 0.48.1 변경. 변경 후 새 PR CI Verify+Docker의 실제 성공은 **NOT VERIFIED**; 기존 green Run을 최신 소스 성공으로 오표시하지 않는다. Owner는 CI 모니터링 생략. 실 현장 로그 보존/롤백 및 GHCR Digest 별도 증거 필요.

---

## PR #179 — 두 번째 PR CI 결과와 수정 증거 범위 (2026-10-31)

- [Run 41202514157](https://github.com/planner77/layoutManager/actions/runs/41202514157), HEAD `2484115a60100abb8f1e5b289f281fedbc4e0214`, completed/**failure**. Verify 124541002048: Typecheck/ESLint PASS; Unit/Integration 108 files: 106 PASS, 2 FAIL / 710 tests: 708 PASS, 2 FAIL. 정확한 실패 TC-L3-004(0755 잘못된 test fixture로 ENOSPC seam까지 미도달) 및 TC-LOG-MIG-001(신규 store.ts explicit COPY 누락). OCI/DXF/Next/Browser/G7 E2E SKIPPED.
- Docker 124541002124: baseline Migrator Build 실패 ERR_MODULE_NOT_FOUND server/logging/store (Main Dockerfile에는 PR 신규 의존성 COPY 없음). 이후 새 Docker 이미지/G7 최초 설치·재기동 검증 SKIPPED. 첫 PR CI의 TS2345는 재발하지 않음.
- 수정 commit 512b5d02(0700 fixture, candidate Dockerfile store.ts explicit COPY, Docker CI file check), 9d2b2143(baseline Dockerfile 임시 사본에 한 파일만 엄격 추가), 5c44eb95/69c98745(TC-LOG-MIG-002 회귀). 모든 기존 Unit/Integration/Production/CI Gate 유지. 테스트 코드 작성/CI 요청은 통과 증거가 아니며 새 CI 결과, 운영 Volume/영속성/실패주입은 **NOT VERIFIED**. 상세 [FailureLedger](FailureLedger.md).

---

## PR #179 / #58+#59 첫 CI 실패 및 수정 후 검증 대기 (2026-10-31)

- Original [Run 41194360963](https://github.com/planner77/layoutManager/actions/runs/41194360963), HEAD 19ba6fb6fad35cb9fd4968a55f6cef95ce0171ea, completed/FAILURE. Verify 124517422622 TS2345 server/http.ts:20; Docker 124517422395 baseline Next Build same error. Lint/Unit/E2E and downstream Docker were SKIPPED (not PASS).
- Fix 91b34067 separates UploadStage and generic L2 stage; also prevents writes to unlinked inode and supports rotation sequence 10000+. Added TC-L2-004 and TC-L3-007/008/009 in 8ad19a8d; unused import removed 0af08c1f. Codex P2 two replies and Resolved 2/2.
- Local test suite and corrected PR CI not yet verified; no Main/GHCR/field evidence. See FailureLedger.md. Starting a new PR CI does not certify completion.

---

## #58/#59 pre-PR CI evidence boundary (2026-10-31)

Implementation and synthetic tests committed on feat/58-59-observability-l2-l3. Local npm/Typecheck/Lint/Vitest/Docker/E2E were **NOT RUN** in the connector-only work environment. PR CI will be launched by opening the PR; do not report PASS or GHCR release without verified run evidence. Unit files log-store.test.ts and logging-l2.test.ts provide TC-L3-001..006 and TC-L2-001..003. Physical /data volume survival, app restart, ENOSPC/EROFS, cross-writer budget and backup/rollback not proven in a production environment. No issue closure, Main CI or GHCR. See [Issues58-59](Issues58-59.md).

---

## PR #178 — E6 JSON 복원과 UI Tree 재열기 분리 (2026-10-31)

- [Run 41175039708](https://github.com/planner77/layoutManager/actions/runs/41175039708), HEAD `34b0ec465cb81424ab85f4c1eca6f912472a1691`: Verify Typecheck/Lint/106 Unit+Integration 파일 **697 PASS**, Production Build/OCI benchmark PASS. Chromium E2E는 **116 PASS / 1 FAIL**, `TC-E6-E2E-001`에서 `outline-tree-item` 1개 기대 대비 0개(닫힌 Drawer), G7/Greenfield/Legacy Verify E2E 미실행. Docker Migration/Runtime smoke Job `124460857583` SUCCESS. 최초 JSX/이후 TS 타입 실패와 구별하며 이전 Run 내역 유지.
- 판정: Import 성공 메시지는 보였지만 실제 데이터 복원을 단독 입증하지 않음. `reload`의 `dispatchApp(reset)`가 `outlineTreeOpen=false`를 만들고 공통 `MovableViewerPanel`은 닫혀 있으면 트리 항목을 렌더링하지 않는 것이 실제 테스트 실패 원인으로 분석됨.
- [E2E 수정 4def08b5](https://github.com/planner77/layoutManager/commit/4def08b57ac0f29c4d81823de1299fe45507dfd7): Reload 뒤 빈 JSON, Import 뒤 동일 ID/editedGeometry JSON, 메뉴를 통한 트리 재개방 후 1행/ID까지 검사. **생성 상태와 UI 패널 표시 상태를 분리한 수용 계약**을 검증하며 제품 코드·DB·서버·CI 게이트 변경 없음. 새 HEAD의 Typecheck/Unit/E2E/실자료 검증은 CI 완료 전 NOT VERIFIED. 상세 [FailureLedger](FailureLedger.md).

---

## PR #178 두 번째 실패 Run 41170650410 / strict readonly TypeScript 복구 (2026-10-31)

- 관측: 정확 HEAD `a0b30f3cf710466f8a43449dfe05787becb16910`, [PR CI Run 41170650410](https://github.com/planner77/layoutManager/actions/runs/41170650410) `completed/failure`. Verify Job `124447794463`에서 `generated-document.ts` TS7006 6개 콜백 implicit any + TS2347 1개, Docker Job `124447794161`의 baseline Next Build도 동일 첫 TS7006로 실패. npm ci/Prisma/Compose 사전 합성 검사 등 앞선 단계 SUCCESS; Lint/Unit/Build(E2E)/Docker 후속 smoke는 SKIPPED.
- 원인: `readonly` tuple/array에 직접 `Array.isArray`를 적용한 후 `reduce/map/every`의 타입이 `any[]`로 축소/확장되는 TS narrowing. 보완: 별도의 `unknown` 변수에서 런타임 모양·유한성 검사, 후속 합성에는 원래의 `readonly GeneratedRigidOperation[]`와 `Affine2D` typed reference 유지 (commit `608a5007`).
- `generated-transfer.test.ts`에 JS boundary 위조 `transformOperations` 및 유한하지 않은 transform 타입 주입 시 기존 Document/Undo 무변경 회귀를 추가 (commit `e52ed194`). 기존 v2 roundtrip/legacy v1 및 E5 회전 회귀는 유지; 테스트 실행 여부는 신규 CI 이전 모두 NOT RUN. CI 성공, 실 DXF/GPU, Docker runtime 검증은 새 결과 확인 전 **NOT VERIFIED**. 상세 [FailureLedger](FailureLedger.md).

---

## PR #178 — 첫 PR CI 실패와 수정 후보 검증 기록 (2026-10-31)

- 실행 증거: [PR CI 41170053430](https://github.com/planner77/layoutManager/actions/runs/41170053430) HEAD `a5bbcf7a57f9a96b9cae236089e2709e1e47418c`, Verify Job `124445860365` **TypeScript TS1005 FAIL** (`viewer.tsx:2146`), Docker Job `124445860543` **Next build Syntax FAIL** (동일 JSX). ESLint/Unit/Integration/Chromium/E2E·후속 Docker는 전부 SKIPPED, 새 E5/E6 회귀 테스트의 실행/통과 근거는 없음.
- 별개 Codex P1 [#4430584078](https://github.com/planner77/layoutManager/pull/178#discussion_r4430584078): `GeneratedDocument.replaceFromImport`의 `local-N` ID 정규식 이중 백슬래시가 비어 있지 않은 v2/v1 가져오기를 거절. 기존 `generated-transfer.test.ts`의 E6-AC1/AC2는 정상 local-1 복원까지 검증해야 하며 새 CI 실행 이후 결과 판정.
- 수정 후보: 조건부 JSX 종료 `}`, 타입 명시 및 `local-N` 정규식 단일 digit escape. Root `DESIGN.md` 없음. 변경 범위는 Viewer UI와 Browser Document ID validator, Ledger/가이드/테스트 기록만; API/DB/Source/G7·GHCR 운영 변경 없음. 로컬 Typecheck/Lint/Vitest/Playwright/Docker/실도면/GPU **NOT RUN**. 새 정확 HEAD CI 완료 전 검증 성공 선언 금지.

---

## #55/#56 E5/E6 검증 추적 — 2026-10-31 (구현 브랜치 후보 / 미검증)

- 기준 Main: `116d04046f75d2bae9fdeeefde7ead0edc011a4f`, Branch: `feat/issues-55-56-generated-rotate-json`, v0.48.0 후보. 루트 `DESIGN.md` 미존재로 `AGENTS.md`, `out/Architecture.md`, `out/Decisions.md`, `out/Issues55-56.md`를 설계 권위로 사용한다.
- 작성 시험: `generated-rotate.test.ts`(E5 +90/-90/180/360, 그룹 Pivot, Invalid, Undo, drag 각도), `generated-transfer.test.ts`(E6 v2 및 v1 Source-only Legacy, validation/atomicity/empty), `issues55-56-generated-rotate-json.spec.ts`(numeric/drag/ESC, Export/Import, wrong SHA, reload, renderer).
- **상태:** 연결된 GitHub 소스 변경을 확인했으나 로컬 Node/Chromium/실 GPU/실 CAD 테스트는 이 세션에서 미실행. PR CI는 신규 PR 생성 전까지 NOT STARTED; 실행 생성만 진행하고 Owner 지시로 결과 모니터링하지 않는다. 성공/FAIL 여부를 미리 주장하지 않는다.
- 서버 DB/Prisma/API/Auth, 원본 DXF bytes/Current/Layer, #97/#98 Source 검증은 별도이며 브라우저 파일 Import를 영속 승인으로 수용하지 않는다. 현장 수용 별도.

---

## PR #177 v0.47.5 Owner Managed 구현 인수 / CI 게이트 검증 및 Main 인계 (2026-10-31)

- 원 소스 HEAD `b9002c45ac8c18aee96a87d8ad51add292ffbf8f`, [PR CI Run 41166539969](https://github.com/planner77/layoutManager/actions/runs/41166539969) **completed/success**, Verify Job `124435339774`와 Docker/Migration/Runtime Job `124435339563` **completed/success**. 이 Run이 Typecheck/ESLint/Unit/Integration/Production Build/Chromium/G7/Greenfield/Migration 및 Docker 게이트의 최종 합성 검증 근거. 선행 [Run 41162108326](https://github.com/planner77/layoutManager/actions/runs/41162108326) Lint 오류와 [Run 41163195588](https://github.com/planner77/layoutManager/actions/runs/41163195588) TC-127-DRAWER E2E 오류는 실패 원장에 원형 보존.
- 미해결 리뷰 0, Main ahead=13/behind=0, clean에서 Owner Managed 승인 후 Squash `82ebb4c8b953b96497e7b287d600d8f6a9f59af4`. #139/#138/#137 각 completed (합성 구현 범위). Main [Run 41167762237](https://github.com/planner77/layoutManager/actions/runs/41167762237) release-scope 성공 / GHCR 게시 Job 시작까지 관측; **Main Run 결과/OCI Digest NOT VERIFIED**. 사내 원본 ANSI_949 DXF/DRM/GPU/실 기기·성능 별도 현장 수용(#113/#96).
- 이 문서는 post-merge docs-only 기록이며 v0.47.5 이미지의 릴리스 소스를 재지정하거나 GHCR 게시 성공을 보증하지 않는다.

---

## PR #177 — Run 41163195588 E2E 한 건 실패 분석 및 보완 (2026-10-31)

- Source SHA d706fac0702acd49b0c38efbaf8b2ed5e256b5a6, [PR CI 41163195588](https://github.com/planner77/layoutManager/actions/runs/41163195588) FAILURE: Docker Job 124425180875 SUCCESS; Verify Job 124425181116 Typecheck/Lint/Unit/Integration/OCI/DXF benchmark/Build PASS, Chromium 113 PASS/1 FAIL, G7 signed/Greenfield/Legacy migration SKIPPED.
- Fail TC-127-DRAWER line 381: alertdialog active + background tools dialog inert, but aria-modal=true remains. No evidence that backend Delete or Drawer data changed. Fix 38db1af524e12e63e33c9064bc2d6ad13ffb02c6: shared modalBlocked across five Viewer panels and restore aria-modal after alertdialog close; original test adds two reactivation assertions.
- Latest source CI PASS NOT VERIFIED, field DXF/GPU/2-PC remains NOT RUN. Do not merge/publish/close issues based on the old 113 passing tests. Detailed evidence: [FailureLedger](FailureLedger.md).

---

## PR #177 첫 PR CI 실패 후 보완 후보 상태 (2026-10-31)

- [Run 41162108326](https://github.com/planner77/layoutManager/actions/runs/41162108326), HEAD 74be95eb77a3077c0b052ac8be53f19974b2dde4: Verify Job 124421702132 Typecheck SUCCESS, ESLint 2 blocking errors + 10 warnings FAILURE, Unit/Integration/Build/Chromium/G7 E2E SKIPPED. Docker Job 124421702420 SUCCESS.
- Ref direct render callback/Next raw anchor를 JSX component/Next Link로 수정했고 Codex P1 ESC/Tab trap/Tools scroll 3건 각각 답변·Resolved. Targeted E2E 모바일 양방향 Tab, Escape, Tools scroll 추가했으나 **새 HEAD 기준 Unit/E2E/CI 아직 PASS 확인되지 않음**.
- 실 회사 DXF 인코딩, GPU 및 두 대 PC 현장 시험은 NOT VERIFIED; 최신 Run ID와 실제 결과는 이후 별도 증거 기록에서 확인해야 한다.

---

## #139/#138/#137 v0.47.5 PR 후보 검증 상태 (2026-10-31)

구현 및 합성 테스트 작성: source text-index strict decoder, generic movable Viewer panels, direct home navigation; Unit TC-139-01~04 및 Playwright TC-138-01/02·TC-137-01/02 추가. 기존 TC-TEXT, TC-U1/U2/U3, TC-M4 등 회귀 대상으로 지정. **현재 로컬 Typecheck/Lint/Unit/Build/Playwright/Docker 및 PR CI 모두 NOT RUN/NOT VERIFIED.** 실 회사 DXF/실 GPU/현장 2PC 수용은 별도. 차후 CI run/HEAD/job이 실제로 확인된 때에만 결과를 갱신한다. [Issues137-139](Issues137-139.md).

---

## #88/#90 — PR CI #349, Main CI #100, GHCR v0.47.4 verification (2026-10-31 KST)

- Exact PR candidate `8af001ef75378aef8214a998c5223e0cd327baf9`: [PR CI #349](https://github.com/planner77/layoutManager/actions/runs/41158289254) **completed/success**, Verify `124409862915` and Docker `124409862929` SUCCESS (Unit/Integration, compile/lint, production build, Chromium, signed G7/Greenfield/Legacy migration tests and image builds). Prior PR CI #343 lint and #345 Vitest `server-only` failures retained in FailureLedger.
- Main [Squash `328bbdc0ca02649cc551a61962cec9e76816ccde`](https://github.com/planner77/layoutManager/commit/328bbdc0ca02649cc551a61962cec9e76816ccde), [Run #100](https://github.com/planner77/layoutManager/actions/runs/41159460418) **completed/success**: scope Job `124413552667`, publish Job `124413581996` both SUCCESS, `v0.47.4` annotated tag points to Squash commit. Official App `sha256:fb608774450146144c0f47f0aa651df8d9b38d9166b005a366448dd9e9ea3140`, Migrator `sha256:aa9ed793289654b78ea39907e5145e810813956ad1c41669f6bfa81107c161e5`; latest paired aliases published.
- Real signed multi-PC Memo focus, real CAD and anchor behavior, legacy volume conversion, G7 live Writer permission and 1k/10k/100k search benchmarks **NOT VERIFIED** by synthetic CI. Issue #88/#90 implementation scope closed by Owner; field GO remains separate.

---

## PR #176 M6/M7 — PR CI Run #345 import failure (2026-10-31)

- [PR CI #345 Run 41153178204](https://github.com/planner77/layoutManager/actions/runs/41153178204), exact HEAD `e758a0d5effcba577dca6ffe2b87fe15952d3c71` completed **FAILURE**. Docker Job `124394409585` SUCCESS, Verify Job `124394409303` FAILURE. Verify Typecheck and ESLint SUCCESS, Vitest **103 passed files / 1 failed suite, 682 passed tests**, failure before tests in `memo-search-auth.test.ts` via `node_modules/server-only/index.js`. OCI manifest checks/benchmark/production build/Chromium and G7 signed browser/legacy E2E SKIPPED.
- Fix in test-only `src/tests/integration/memo-search-auth.test.ts`: fail-closed `vi.mock('@/server/context',...)` before importing the real permission helper; retains G7 authority/session/Role/Grant/Prisma assertions. This prevents Vitest's accidental execution of Next `server-only` marker and retains production boundary.
- Repaired HEAD's checks **NOT VERIFIED** until fresh CI evidence. Existing Run #343 ESLint FAILURE and #345 Vitest FAILURE remain distinct; do not retroactively mark either success. No GHCR/production DB modifications.

---

## #88/#90 PR #176 — initial CI #343 실패 및 Code Review 보완 (2026-10-31)

- [Run 41148144608 / PR CI #343](https://github.com/planner77/layoutManager/actions/runs/41148144608), source `8bf85699021ac587bb1595cd44bb27618f141d8b`: Docker Job `124378361245` SUCCESS(모든 이미지/마이그레이션/Greenfield Smoke 단계 완료); Verify Job `124378361508` FAILURE. `npm run typecheck` SUCCESS, `npm run lint` FAIL (React Compiler callback deps #414/#572 및 useEffect sync state #651). Unit/Integration, OCI stats, DXF benchmark, Next production build, Chromium/Runtime/Greenfield/Legacy E2E **SKIPPED**, not SUCCESS. 기타 lint warning 11건은 차단 원인 아님.
- Codex inline P2 `4429501072`: retry on memo notice incorrectly advanced Viewer renderer `attempt`, disposing Browser-only generated history. Corrected with separate memo-only request counters, non-destructive rendering guard and only retryable failures showing a retry action. Manual memoization deps fixed and initial malformed-link notice derived without effect setter. Changes in commits `c783bf4e8ff51ff68f090be0059f9e88708c8709`, `166fdd52c585a50a025a04d3d1c0ab815bd27455`.
- Added Playwright M6-P2 regression for retained WebGL canvas and session memo after retry. **Not executed** yet; new exact HEAD PR CI is required. No Main/GHCR/production acceptance.

---

## #88/#90 M6/M7 initial implementation evidence — 2026-10-31

- Feature source in branch `feat/issues-88-90-memo-link-search-20261031`: M6 UUID link/share/authenticated GET+focus and M7 Site-scoped SQL search/API/UI, documented in [Issues88-90](Issues88-90.md).
- Added Unit `viewer-link.test.ts`, `cad-memo-search.test.ts`; Integration `memo-search-sql.test.ts`, `memo-search-auth.test.ts`; Playwright `issues88-90-memo-search.spec.ts`. **All newly introduced tests NOT RUN** at this writing. Typecheck, lint, production build, Docker, CI, external QA and signed-G7 cross-session full M6 AC **NOT VERIFIED**. Do not interpret commit creation as PASS.
- Database migration, GHCR publish, Main merge, existing data adoption and production scope changes **NOT PERFORMED**. Reviewer/PR CI/mergeability status is tracked by latest GitHub commit/PR evidence, not estimated locally. Uncovered G7 browser and 1k/10k/100k performance require follow-up evidence before issue closure.

---

## #85/#86 PR #175 final synthesis CI and Main release handoff (2026-10-31)

- PR CI [#341 Run 41142161238](https://github.com/planner77/layoutManager/actions/runs/41142161238), exact HEAD `a6d3bdef1cc3e8a12ca95e918b5a2d49fad83d50` => `completed/success`. Verify Job `124359139129` **SUCCESS**: TypeScript, lint, Unit/Integration, Next production build, Playwright Chromium. Docker Job `124359139260` **SUCCESS**: build, migrator, disposable first-run + CAD runtime smoke. Previous E2E failure 2 of 103 tests in Run 41139632431 is repaired by the final successful run; exact job evidence is authoritative, not a screenshot estimate.
- P1/P2/P2 Codex threads 3/3 resolved, 0 unresolved, no merge conflict; Squash Main `c3e55a95ed2c7a61413e5b0577004252994fe988` under Owner Managed. #85/#86 code implementation issues closed, with optional memo parent hierarchy / site acceptance excluded.
- [Main CI Run 41145893248](https://github.com/planner77/layoutManager/actions/runs/41145893248) started on merge SHA; GHCR v0.47.3 app/migrator pair publication **PENDING/NOT VERIFIED**, no digest or successful tag asserted. Subsequent documentation-only Main CI does not substitute for runtime release CI.
- Real 2-PC/CAD/GPU, previous-volume migration/restore, operational G7 Auth/Writer activation and production database changes **NOT RUN**.

---

## PR #175 2차 PR CI #41139632431 실패와 증거 범위 (2026-10-31)

- Run `41139632431` / HEAD `8df9f656c2c4e9e06e9e3c8552be246e01de4caa`: Docker Job `124351064253` SUCCESS, Verify Job `124351064417`에서 Typecheck/Lint/Unit/Integration/Production Build SUCCESS 및 E2E 101 PASS/2 FAIL.
- TC-ISSUE17-001 / TC-LAYER001에서 마지막 Canvas PNG `Buffer.equals` 기준 5s timeout. [Artifact](https://github.com/planner77/layoutManager/actions/runs/41139632431/artifacts/13017814221) 화면에서는 Layer 체크가 2/2·3/3 복원되고 선이 나타나지만 Canvas clip 폭 800→798 px 차이도 관측됨. WebGL 렌더 결함을 입증한 실패가 아니라 **복원 비교 기준에 픽셀 크기 의존성이 존재**함이 확인됨.
- PNG를 동일 그리드로 정규화하고 원본 CAD 획 근접 매칭 검증을 추가한 코드 보완은 **새 CI 실행 전** 상태. Source Layer/Renderer/운영 DB/원본 파일은 변경하지 않았음. 신규 HEAD E2E/현장 수용 PASS를 주장하지 않음.

---

## #85/#86 PR #175 initial CI failure evidence (2026-10-31)

- PR CI [41137913177](https://github.com/planner77/layoutManager/actions/runs/41137913177), HEAD `f9fbef10997e912c50080c7bd7dc6fe7b96b603a`: Verify Job 124344823034 FAILED (TS18047 nullable Version/Group five diagnostics). Docker Job 124344822694 FAILED (same TS diagnostic while building baseline from new source).
- Subsequent Unit/Integration/E2E/G7 first-install/Next production Docker runtime tests **NOT RUN (SKIPPED)**. This is not evidence of passing or failing those checks.
- P1 Movable Memo Tree and two P2 session group/status filters addressed in code; 3 GitHub review threads replied/resolved. Synthetic tests added for floating CSS position, pointer/keyboard, group+M5, and previous G7 Anchor baseline.
- Full post-remediation PR CI, human field UX, actual 2-PC CAD, historical volume migration and GHCR are **NOT VERIFIED / NOT PERFORMED**.

---

## #84/#167 v0.47.2 — GHCR Release pair 실증 및 문서-only CI (2026-10-31)

- **Release:** [Main CI #95 / Run 41131717206](https://github.com/planner77/layoutManager/actions/runs/41131717206) `completed/success` 정확 HEAD [`59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`](https://github.com/planner77/layoutManager/commit/59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7), release-scope Job `124324008108` SUCCESS 및 GHCR Build/push Job `124324087630` SUCCESS. GHCR Log: `Publish version image: true`; `Published version pair: ghcr.io/planner77/layoutmanager:0.47.2 and ghcr.io/planner77/layoutmanager:0.47.2-migrate`. App `:0.47.2` `sha256:45d6df2cdb2100d2cf6b20264f0a39bc407938902b1490492c4c5a29036a5c06`, Migrator `:0.47.2-migrate` `sha256:77841b57e0e44b80b914beacedb02e4ce81bef2d0acb4524c545a19d6e47d6ad` (OCI SHA-256). `Promote paired release images after both candidates succeed` 단계에서 `:latest`/`:latest-migrate` alias 함께 정식 승격, published layer measurement 성공. Annotated Git tag `v0.47.2` 대상 `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7` 정확 일치.
- **Verified PR:** [#332](https://github.com/planner77/layoutManager/actions/runs/41127321736), HEAD `00c0cefa1daa8b75e3ba157ecbdcf264816e31b9` Verify+Docker 두 Job SUCCESS, P1 리뷰 1/1 Resolved, Main Squash `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`.
- **Docs-only 후속:** [Main CI #96](https://github.com/planner77/layoutManager/actions/runs/41132397577) SUCCESS, release-scope SUCCESS, GHCR Job SKIPPED (릴리스 이미지 불변).
- **관측 경계:** CI·GHCR SUCCESS는 실 장비 DXF/GPU/2PC 현장 수용 또는 기존 Volume Schema Migration 완료가 아니다. #174/#172/#96/#113/#160 S7 OPEN. 이전 "게시 PENDING" 행은 당시 추적 기록으로 보존.

---

## #84 M3 / #167 S6 PR #173 코드 합성 검증 및 Main v0.47.2 릴리스 (2026-10-31)

- [PR CI #332](https://github.com/planner77/layoutManager/actions/runs/41127321736) latest HEAD `00c0cefa1daa8b75e3ba157ecbdcf264816e31b9` completed/success. Verify `124309598067` 및 Docker `124309597751` 두 Job 모두 SUCCESS. 테스트 포함: Generated/RENDER 최근접 스냅·2D WCS Forward/Inverse·Translate/Rotate/Undo/Redo/Orphan, Greenfield Anchor FK/불변·Scene Origin reset/DB soft-delete/CAS·React/Chromium 회귀. 이 결과는 실제 현장 CAD 검증이 아님.
- Codex P1 `4428206096` dangling CadMemoAnchor 지적 및 삭제/ALL reset 동일 SQLite transaction cleanup 보완, 답변·스레드 Resolved. Main behind=0, mergeable=true에서 Squash `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`.
- **릴리스 현황:** [Main CI #95](https://github.com/planner77/layoutManager/actions/runs/41131717206) release-scope Job `124324008108` SUCCESS, GHCR Build/push Job `124324087630` **in_progress/PENDING**. 릴리스 태그 `v0.47.2`는 merge commit `59068a62ad8bb4e90b9d016ed0ddc0e6ae639ab7`에 생성 확인. App/Migrator 실제 pair 게시 성공/OCI Digest는 이 문서 기록 당시 **NOT VERIFIED**, 이후 실제 CI/Registry 로그 확인 전 SUCCESS라고 주장하지 않는다.
- #84/#167 코어 코드/합성 CI 행정 종료. #174 다중 후보 선택·앵커 유지 이동·성능·현장, #172 Editor 권한, #96/#113 실설치·DXF/GPU, #160 S7 OPEN; 실제 DB/Volume 마이그레이션, 2PC Owner Acceptance, 사내 원본 사용/DRM 시험 NOT RUN.

---

## #84 PR #173 M3 세션 스냅 누락 보완 — 검증 인계 (2026-10-31)

- 구현: 임시 Generated·DXF_IMPORTED WCS Endpoint/Vertex/Center 12 CSS px 후보, scoped MemoSessionSnapStore, session-only WCS/transform reconciliation, Undo/Redo/삭제 후 BROKEN·동일 ID Undo 복원, SOURCE_ONLY 강제 해제, 명시적 최신 WCS 서버 PATCH/로컬 M1 연결 해제. Reader/Writer/Site/Revision server permission 정책 변경 없음.
- 해결한 리뷰: [PR #173 Codex P1](https://github.com/planner77/layoutManager/pull/173#discussion_r4428206096), Memo 개별 soft delete 또는 S6 전체 reset 직후 남은 ATTACHED anchor 때문에 이후 Outline Edit를 차단하는 문제. 모두 삭제 전 동일 transaction에서 anchor cleanup으로 보완, 리뷰에 답변·Resolved 기록.
- 검사: `tests/unit/memo-session-snap.test.ts` 및 `tests/e2e/issue82-cad-memo.spec.ts` M3 스냅 E2E, `tests/unit/memo-anchor-origin-reset.test.ts` P1 가드 추가. 현재 GitHub 커밋마다 진행된 #319~#329 CI는 연속 push에 의해 취소된 것으로 관측, 기존 Run #318은 수정 전 HEAD 성공. **새 최신 HEAD 최종 PASS는 아직 확인되지 않았다.**
- Local npm/Typecheck/Unit/Playwright/Docker 등 연결된 로컬 저장소 접근 불가로 실행하지 못했고, CI 요청은 최신 PR HEAD 실행 시작까지만; 신규 현장 2PC·실 CAD/DRM/DB 기존 볼륨·GHCR 운영 릴리스 불변.

---

## #84/#167 단일 PR 후보 — 신규 Greenfield 앵커와 Origin 초기화 구현 (2026-10-31)

- Main 기준 `34e3a362e9a9d01579d4a61b81b26f4ee935c87b`. #84 우선으로 신규 `CadMemoAnchor` FK·불변 CHECK/trigger/Prisma DTO, verified target의 attach/detach와 CadOutline 변화에 의존 Memo WCS/Revision/Audit 동일 거래를 구현. #167은 SOURCE_ONLY SceneWork 초기화와 ALL의 전체 목록 CAS, soft delete/Audit DB 단일 트랜잭션 및 Viewer 작업 메뉴/확인 UI를 구현. [세부 설계](Issues84-167.md).
- `src/tests/unit/memo-anchor-origin-reset.test.ts`에 WCS 회전/평행이동 역변환, SceneWork reset, 정확 스냅샷·중복/오류 차단, SQLite 앵커 FK·immutable/연결 해제 회귀를 작성. G7 Greenfield 신규 테이블 생성 검증도 추가.
- 기존 `CadMemo` 데이터 컬럼은 변경하지 않고, 신규 빈 스키마만 `202610310001_greenfield_anchor_baseline`; 이전 marker를 인식하지만 자동 업그레이드는 없음. `0.47.2` package/lock 동기화.
- 로컬 Node/Prisma/Typecheck/ESLint/Unit/Integration/Production Build/Playwright/OCI **NOT RUN**; GitHub 최신 HEAD의 PR CI 검증 전 PASS로 간주하지 않는다. 실 CAD/2PC/현장 권한/Volume/S3/DRM H0-H3 및 GHCR/병합/운영 변경 **NOT RUN**.
- 잔여 #84: 임시 Generated 객체의 자동 Snap 후보 검색, renderer-only 원본 변환의 server persistence, Owner #172 공동 편집 정책 및 실제 사용자/현장 수용은 별도. 임의 삭제/권한 우회로 대체하지 않는다.

---

## #98/#83 Release 0.47.1 — 확정 Main CI 및 GHCR 쌍 결과 (2026-10-30)

- [PR #171](https://github.com/planner77/layoutManager/pull/171) 최종 검증 SHA `d74d1f312386b020175035d5aa1aaf3066bc144e`, [PR CI #316](https://github.com/planner77/layoutManager/actions/runs/41062911805) `completed/success`, Verify `124086863559`·Docker `124086863008` 모두 SUCCESS. 새 빈 Greenfield 및 자동 E2E 범위; 실 현장/기존 Volume/실 CAD 수용은 아님.
- [Main Squash commit](https://github.com/planner77/layoutManager/commit/e1984e26a8649f0ac2bce3b0cb74ce69b163441e) `e1984e26a8649f0ac2bce3b0cb74ce69b163441e`; [Main CI #93](https://github.com/planner77/layoutManager/actions/runs/41064962451) `completed/success`, release-scope `124093785009` SUCCESS, GHCR Build/push `124093830002` SUCCESS, `v0.47.1` 태그 생성·App/Migrator 두 후보 검증·정식 태그 쌍 승격·OCI layer 측정 모두 SUCCESS.
- OCI Digest: App `sha256:85c00935aa11d397150344a54acf0d1123c6c3cd1f6beef74b426a837e0c15d4`, Migrator `sha256:82861f95380d9837ad83a8dc13d49f33b09df767145e35d2f5591b67c38944ae`; `:0.47.1[-migrate]`, `:latest[-migrate]` 4태그 승격 성공.
- #98/#83 코어 코드/합성 시험 종료, #172 Editor 공동편집·현장 수용, #65/#71/#73 타입/트리, #84 연결 메모, #96/#109/#113 실제 권한/현장 인증 별도 OPEN; `Owner Accepted Site`/실 운영 초기화·이관·복원/롤백 주장 금지.

---

## #98/#83 PR #171 성공 검증과 릴리스 버전 변경 후 재검증 구분 (2026-10-30)

- [PR CI #315](https://github.com/planner77/layoutManager/actions/runs/41059992557) HEAD `8af8b65d016865498a67f6ee4cf70184a0ad22c4`, completed/success. Verify 124077023981·Docker 124077024801 모두 SUCCESS; 변경 전 Run #311/#314 실패는 역사 보존. 본 CI는 증분 소스·합성 Greenfield 범위의 자동 검증이고 기존 볼륨/실 CAD 현장 수용은 수행하지 않음.
- GHCR workflow는 이미 존재하는 버전 `0.47.0`의 App·Migrator 쌍을 둘 다 발견하면 건너뛰므로 `src/package.json`과 lock을 새 `0.47.1`로 동기화. 버전 증가에 따른 변경 커밋은 **새 PR CI를 따로 통과해야 검증된 릴리스 후보**. v0.47.1 존재 여부 사전 GitHub refs 조회 NOT_FOUND. 실제 OCI publish/서명/배포 및 Main CI 상태는 이후 별도 확인.

---

## #98/#83 PR #171 CI #314 테스트 결과/수정 (2026-10-30 KST)

- [Run #41058299070](https://github.com/planner77/layoutManager/actions/runs/41058299070) (workflow #314) `completed/failure`; Docker image/migration/runtime job `124072053492` SUCCESS, Verify `124072054040` Unit/Integration 실패. Typecheck/Lint 성공, **646 tests PASS**, 95 files 중 **94 PASS / 1 FAIL**. 문제 suite `cad-business-contract.test.ts` 로딩 단계의 Next `server-only` import exception. Build/E2E NOT RUN.
- 신규 Test suite를 서버 저장소 직접 import 없는 `memoEditOperation` 순수 함수 부정/긍정 회귀로 수정했으며, Docker COPY/DDL/SQLite Audit/메모 Session 테스트는 유지. 최신 수정 코드의 Unit/Next/E2E 성공은 신규 CI 결과 전 **NOT VERIFIED**.
- 과거 #311 strict TS 실패와 #314 Unit import 경계 오류는 독립 사고; 현장 CAD/실 운영 DB·Volume/Auth·GHCR/릴리스 수용은 해당 CI의 검증 범위 밖.

---

## #98/#83 PR #171 Run #41056355838 / workflow #311 — 실제 CI 실패 (2026-10-30)

- Verify job `124064761375` Typecheck `failure`: 새 입력 validators, business CRUD, detail route 33 strict TS 오류. Prisma Generate 성공 이후 Lint/Unit/Build/E2E는 SKIPPED.
- Docker job `124064760825` `failure`: baseline image builder의 Next TS18048 오류, migrator/Compose smoke 미실행. PR Codex는 별도로 Migrator DDL module COPY 누락 P1을 확인했으나 이번 Docker 로그에서 module import failure 직접 재현되지는 않았다.
- Codex P1/P2 세 건 보완 HEAD `275fd74b6a893b181d34cff0dd3dce5cb18e7d75`; 댓글 근거·3/3 resolved, Main behind0·mergeable true. 엄격한 입력 거부와 Source 변형 이력 수명·Docker package closure 보존.
- 새 신규 Unit 회귀 `source-outline-persistence.test.ts` 및 `cad-business-contract.test.ts` 추가. **작성 시점 로컬 직접 실행 NOT RUN**, 새 HEAD CI 결과는 관측 전 **NOT VERIFIED**이며 과거 Run #311 실패를 대체하지 않는다. 현장·GHCR·병합·운영 수용은 요청 범위 밖.

---

## #98/#83 — 신규 영속 API/Viewer 후보 검증 상태 (2026-10-30)

- 구현 파일: 별도 Greenfield-only DDL/Prisma, G7 인증·Site CRUD API, object revision CAS 및 성공 원자 Audit, immutable original SOURCE 검증/APP_CREATED 독립 WCS, Memo ACTIVE 재접속 hydrate와 OFF 임시 세션, Outline 명시 서버 저장 및 재조회 Overlay.
- 구현 기준: [#98/#83 설계와 미결정 게이트](Issues98-83.md), `src/tests/unit/cad-business-contract.test.ts` 테스트 코드. 이 문서 작성 시 실제 로컬 **Prisma generate/typecheck/lint/test/build/Docker/Chromium 미실행 (NOT RUN)**.
- PR 생성과 CI 시작은 요청 범위이나 CI 완료/성공을 선제 주장하지 않습니다. G7 실제 Site/2PC·실 도면/DXF/S3·운영 새 볼륨 설치/전환/기존 DB 이관·Auth on/Owner acceptance·GHCR/병합은 **NOT VERIFIED/NOT RUN**.
- 미결정: #65 타입 관리, #84 연결 앵커, Memo 교차 Editor 권한, 오래된 DB/물리 삭제 보존 방식. 기존 성공한 #166 CI는 본 변경의 검증 근거가 아닙니다.

---

## #166 — 최종 PR CI/병합·릴리스 인계 (2026-10-30 KST)

- 변경 코드 최종 검증 HEAD `e9af3d192cb513d4182037f0431d5db5f14a4181`, [PR CI #41047867574](https://github.com/planner77/layoutManager/actions/runs/41047867574): Verify `124036411468` + Docker/Migration/Runtime `124036411148` **both completed/success**.
- 리뷰 P2 네 건 모두 답변·Resolved(미해결 0), Main behind=0/mergeable=true 확인 뒤 [PR #170](https://github.com/planner77/layoutManager/pull/170) Squash, Main `83ce0417224813574ef45a859460d95c4345cf68`. 소스 HEAD는 추가 변경 없이 병합. #166 AC-S5-01~06 Owner Managed 합성 CI 수용으로 CLOSED/completed.
- [Main CI #41050349517](https://github.com/planner77/layoutManager/actions/runs/41050349517) 시작, release-scope Job `124044552980` SUCCESS, GHCR Job `124044605339` 최초 관측 `in_progress`. 목표 App/Migrator 버전 `0.47.0/-migrate`와 latest alias의 **게시 완료·digest/최종 Main CI 결과는 NOT VERIFIED**.
- 본 TestReport 및 FailureLedger 기록은 코드 병합 후 문서만 갱신; 과거 S5 로컬/CI 기록은 원래 SHA와 검증 범위 유지. 실제 CAD/GPU 2PC·현장 수용, APP_CREATED/Memo/업무 트리의 서버 영속 기능, S6 Reset는 후행이며 S5 완료로 소급하지 않음.

---

## #166 — Scene 초기화 O(N²) 조회 제거 (2026-10-30)

- 새 Codex P2 #4423072162: render work initialize의 Scene leaf당 `entities.find`를 사전 `layerById` Map과 O(1) 조회로 대체해 전체 매핑 O(N)으로 축소.
- 기존 S5 Browser/Unit 및 PR CI 회귀는 변경 HEAD 별도로 실행해야 하며, 새 성능 수용 데이터는 미측정. 구현 범위만 반영했고 현장 대형 DXF/GPU/실 운영 배포는 NOT RUN.

---

## #166 — 최신 Codex UI P2 재현 방지 시험 추가 (2026-10-30)

- 신규 `TC-S5-UI-009`: SOURCE 저장 선택을 현재 SceneWork 정밀 원본 조건과 재검증하고, 무효이면 RENDER로 fallback, enabled ref 변경은 Adapter mode 승인 뒤에만 수행. Exact SHA/Handle/canonical 검증 완화 없음.
- 신규 `TC-S5-E2E-009`: 기존 합성 1A Handle 정사각 도면에서 precise SOURCE 선택→일반 Renderer 작업 Translate→외곽선 도구 재활성화→`outline-basis=render`, 정상 도구 표시 및 checkbox checked 확인. 기존 Scene/DXF 기준 및 업무 API 변경 없음.
- 작성 시점 신규 Unit/E2E/CI 실행은 **NOT RUN/NOT VERIFIED**. 위에 기록된 과거 성공은 해당 이전 SHA 범위의 증거이다.

---

## PR #170 — CI 성공 후 Codex P2 보완 회귀 추가 (2026-10-30)

- 기존 HEAD `33e560393527312e0388560bd0d13e62b5124e31`의 PR CI #41036925858 Verify/Docker는 SUCCESS. 두 P2 수정 전 성공이므로 후속 HEAD에 재사용하지 않는다.
- 신규 Unit: `scene-s5.test.ts`에서 선택 불가 Points의 Layer off/on, 선택 가능 Mesh의 작업 숨김 유지, intrinsic hidden 부모 보존을 검증하도록 추가.
- 신규 Browser: `scene-s5-adapter.spec.ts`에서 실제 `compute-render` Worker fetch와 display-only Points의 Layer off/on 복원을 검증하도록 추가. esbuild harness를 ESM module로 제공해 Worker URL을 올바르게 해석한다.
- 이 패치는 소스 및 회귀 **작성만 완료**, 별도 로컬 실행은 NOT RUN. 신규 PR CI/재리뷰·실 CAD/GPU 성능/운영 수용은 결과 관측 전 NOT VERIFIED. 기존 91 files/639 PASS·S5 3/3 PASS 등은 수정 전 시험으로 역사 보존한다.

---

## #166 Scene S5 — 0.47.0 로컬 구현·검증 (2026-10-30)

- **기준과 역할:** Main `bdde565`, 격리 worktree `layoutManager-issue166` / `feat/issue-166-scene-work`. 지정 gpt-6-astra Manager `/root/s5_manager`가 구현 전에 Requirements/Architecture/ADR-061/TestPlan을 기록했고, gpt-6-sol Developer `/root/s5_manager/s5_developer`가 domain·Three Adapter·Controller·projection·Unit을 구현했다. Root(Codex)가 UI/Manager facade·브라우저 테스트·문서/버전 및 발견된 통합 결함을 보완했다. Manager가 Developer 보고를 검토한 후 gpt-6-luna 독립 QA `/root/s5_manager/s5_qa`를 실행했다. 역할을 대행했다고 허위 기록하지 않으며 Root 실행과 독립 QA 보고를 아래에서 구분한다.
- **기능 범위:** 일반 RENDER ObjectRef/Origin 선택과 APP_CREATED 외곽선/기존 세션 편집·트리·메모를 source Handle 게이트에서 분리한다. DXF_IMPORTED 이동·회전·숨김은 세션 차분과 전용 Undo/Redo다. 단위는 지원되는 실제 Object3D 전체이며 병합 객체 하위 Handle 선택/원본 CAD 정밀성은 주장하지 않는다. Source exact SHA/Handle/서버 canonical 거절은 유지한다. Schema3 browser export는 APP_CREATED identity·Scene unit과 geometry basis를 명시하고 source parser는 계속 거절한다.
- **실행 환경:** Node 22.14.0, npm lock 고정 의존성, Linux/Chromium 1243 headless SwiftShader. 모든 CAD·SQLite·계정/키·Scope는 합성/일회용 fixture이며 실제 운영 DB/CAD/볼륨·사내 SHA·DRM 자료는 사용하지 않았다. 원래 checkout 사용자 변경 2개를 보존했다. 새로운 DB/API/migration/권한 정책 변경은 없다.

### 실제 검증 근거

| 실행 | 실제 결과/범위 |
| --- | --- |
| Prisma Client 생성 | PASS, 새 worktree `db:generate`; 운영 DB 적용 아님 |
| Developer 최초 집중 | Typecheck/Lint/diff PASS, 6 files/31 Unit PASS; 이후 리뷰 보완 전 snapshot |
| 독립 QA 전체 집중 | 6 files/41 tests PASS. Scene loader, strict source draft, generated document, Canvas scope·S5 projection/provenance/policy 검토 |
| 독립 QA 최종 집중 | Controller 실제 EventTarget pointer/Box/Mesh 내부/Ctrl·Layer·stable refresh 및 scene S5 **2 files/6 PASS**, diff-check PASS. WebGL 결과와 구분 |
| Root 전체 Vitest 재시험 | **91 files/639 tests PASS, 346.64초**, `/tmp/lm166-all-tests-final.log`. 이전 638 PASS/1 FAIL은 FailureLedger에 보존 |
| 후속 추가 Unit | 실제 triangulated Mesh hole 보존·자기교차/퇴화 거절 2개 + Controller 1개, **2 files/3 PASS**, `/tmp/lm166-added-tests.log`. 전체 suite 숫자에 소급 합산하지 않음 |
| Typecheck/Lint | PASS, Lint는 기존 6 warnings/0 errors. 신규 unused warnings는 정리함. `/tmp/lm166-final-typecheck.log`, `/tmp/lm166-final-lint.log` |
| Production Build | PASS. 원본 SHA/서버 canonical·DB 정책의 완화 없이 webpack compile/TypeScript/route generation 완료. 최종 UI 지원 안내/진단 변경 후 `npm run build`도 PASS, `/tmp/lm166-release-build.log` |
| 신규 S5 Browser | **3/3 PASS, 36.8초**, `/tmp/lm166-s5-e2e.log`. Handle 없음·source Worker error의 일반 선택/외곽선/JSON·APP 편집/혼합 거절·click/Ctrl Box·Translate/Rotate·hide/show/Undo/Redo. 실제 복원 Mesh Adapter는 내부 click·변형 후 WCS Polygon·레이어 AND work/intrinsic/ancestor visibility·baseline artifact bytes 불변·dispose Canvas 0 검증 |
| 인증 Greenfield/저장 Scene | **2/2 PASS, 42.3초**, `/tmp/lm166-greenfield-final.log`. 최초 Admin, 인증 변환·저장 후 별도 로그인 컨텍스트/Reload에서 원본 GET 0·DXF index Worker/변환 Blob 0; Scene에서 APP_CREATED 생성·Tree와 저장 bytes/revision 불변, 명시 legacy fallback/Scene 복귀 |
| signed Runtime Auth UI | **1/1 PASS, 14.1초**, `/tmp/lm166-runtime-e2e.log` |
| 기존 master migration UI | **1/1 PASS, 19.9초**, `/tmp/lm166-migration-e2e.log` (일회용 pre-0.25 fixture만) |
| 전체 일반 Chromium E2E | **95 PASS/2 FAIL, 8.0분**, `/tmp/lm166-all-e2e.log`. 두 실패는 `issue38-app-shell.spec.ts`의 이전 handleless 도구/목록 비활성 정책 기대였다. #166 계약에 맞게 정상 렌더·목록 활성/정밀 원본 비활성·메모 WCS 유지로 갱신한 뒤 **파일 전체 4/4 PASS, 19.8초**, `/tmp/lm166-policy-e2e-final.log`. 이전 실패를 97/97로 소급 변경하지 않음 |

### AC 추적과 한계

| AC | 구현·실행 증거 | 상태 |
| --- | --- | --- |
| AC-S5-01 | stable Render/Scene Ref·Controller/Mesh click/Ctrl/Box·Layer·history 및 기존 Renderer/Version 수명주기 회귀 | 로컬 PASS; 최신 PR CI/현장 수용은 별도 |
| AC-S5-02 | handleless·source Worker error 2개 Browser 및 READY Scene 원본 GET0 | 로컬 PASS; 실제 사내 도면은 미검증 |
| AC-S5-03 | render WCS2D/CONVEX/PRECISE·Mesh triangle union/hole·degenerate/self-cross·APP command/Tree·schema3+optional provenance·envelope unit/Scope 음성 시험 | 로컬 PASS; #55 회전 UX/#56 편집 Import/#65/#71/#73/#83/#84 영속 기능은 후속 |
| AC-S5-04 | session-only SceneWorkDocument와 실제 Adapter 이동·회전/숨김·기준 bytes/원본 불변, mixed atomic rejection, 기존 서버 CAS/Audit/권한 suite | 로컬 PASS; 새 서버 작업 경로를 만들지 않음 |
| AC-S5-05 | explicit exact source gate와 strict source JSON/canonical 회귀, render result sourceEntityIds=[]/sourceAttestable=false | 로컬 PASS; source Worker 실패를 canonical 성공으로 해석하지 않음 |
| AC-S5-06 | 독립 QA·Root 전체 Unit·Build 및 관련 Browser/legacy/runtime·FailureLedger | 로컬 회귀 통과(이전 정책 기대 2건 수정/재시험), Manager 판정은 ADR-061; 최신 PR CI는 별도 |

APP_CREATED/메모 서버 CRUD·재접속 복원·typed catalog·영속 Tree·연결 앵커/S6 reset는 해당 후행 이슈 범위이며 미구현/미검증을 완료로 표시하지 않는다. 독립 WCS 메모는 객체 변경을 자동 추적하지 않으며 현재 #84 연결 앵커가 없어 BROKEN_ANCHOR 런타임을 구현했다고 주장하지 않는다. 렌더 선택은 평면 Line/LineLoop/LineSegments 및 단일 material의 leaf triangle Mesh를 지원한다. Points/비평면/다중 material/중첩 상위 drawable/한도 초과는 표시만 하며 허위 primitive 정확성을 약속하지 않는다. 실 CAD/2PC/실 GPU·대형 현장 성능·DRM 특화 분석은 NOT RUN, S8은 비필수 최후순위다.

**최종 빌드 재확인:** 최종 지원 안내/진단 및 코드 동결 뒤 Build·Typecheck PASS, Lint 기존 6 warnings/0 errors. 같은 최종 Build에서 신규 S5 Browser **3/3 PASS, 21.9초**, `/tmp/lm166-final-build-e2e.log`. Manager의 **ACCEPT LOCAL SCOPED** 판정은 ADR-061을 따른다.

**원격 인계:** [PR #170](https://github.com/planner77/layoutManager/pull/170), 최초 Commit `89cb95e` 게시. 실제 review threads 0/미해결 0, Main behind 0/unmerged path 0/`mergeable=true` 확인. 이번 원장·보고서 문서 커밋을 동기화해 최종 HEAD PR CI를 시작하며 실제 Run URL/시작 확인은 PR 본문과 최종 응답을 따른다. 완료 모니터링을 하지 않아 최신 CI 결과는 NOT VERIFIED다. CI 성공, 이슈 전체 완료·병합·GHCR·배포는 로컬 검증의 PASS가 아니다.

---

## PR #169 사후 리뷰 P2 보완 — 재검증 대기 (2026-10-30)

- PR CI [#41000086668](https://github.com/planner77/layoutManager/actions/runs/41000086668)는 원 HEAD `92d4909`의 Verify·Docker Job 모두 SUCCESS. 이후 Codex 리뷰는 **2 P2 unresolved**: 읽기 전용 Scene 조회 활동 시간 미갱신 및 legacy renderer URL 미동기화.
- 패치 후보: `requireSceneRead`의 승인 완료 후 세션 conditional touch, `buildScene` renderer URL 동기화. 신규 통합/브라우저 회귀를 별도로 추가함. **패치 적용 이후 CI, 재리뷰, 실제 현장, GHCR 상태는 관측 전 NOT VERIFIED**. 이전 로컬 수용을 변경된 코드의 CI 성공으로 전용하지 않는다.

---

## #164/#165 0.46.0 Scene S3/S4 로컬 구현·QA 수용 (2026-10-30)

- **기준/역할:** Main `0e6e91c`, `feat/issues-164-165-scene-assets`. gpt-6-astra Manager `/root/scene_design`가 Requirements/Architecture/ADR-060/Database/TestPlan을 구현 전에 기록했다. 실제 구현 조정과 Viewer/serializer/UI는 Root(GPT-6), 서버/Schema는 지정 gpt-6-sol Developer `/root/scene_server`가 담당한다. Developer 완료보고와 Manager 소스 검토 뒤 독립 QA `/root/scene_qa`가 집중 검증을 수행했다. 실제 QA 모델은 gpt-6-luna이며 최종 판정은 아래 집중 결과와 Root 전체 회귀를 구분한다.
- **Root 선행 보고:** focused 4 files/25 tests PASS(신규 scene-loader 10개 포함). Typecheck PASS와 Lint PASS(기존 경고 6개)는 해당 실행 시점 결과이며 최종 소스 전체 수용이 아니다. TypeScript narrowing, S2 single-material group 검사, 기존 exact-7 migration 회귀 실패는 [FailureLedger](FailureLedger.md)에 별도 기록한다.
- **현재 판정:** 아래 최종 결과를 근거로 **ACCEPT LOCAL SCOPED — 로컬 Scene 구현·QA 및 PR/CI 인계 수용**. 독립 QA와 전체 Unit/Integration/Build/E2E는 통과했으며 최신 PR CI는 미확인이다. APP_CREATED/#98/#83 독립 영속 연계·실 DXF/현장 2PC는 PENDING이다. 최종 CI 성공 관측 전 #164/#165 AC 완료 체크/이슈 종료를 하지 않는다.
- **범위:** 이번 요청은 단일 PR과 CI 시작까지이며 병합/GHCR/배포/실 DB·storage·migration 활성화는 실행하지 않는다. 버전은 기능 MINOR **0.46.0 후보**다.

### Manager 구현 검토 및 QA 진입 (최종 수용 아님)

Manager는 Developer의 서버 코드 동결 보고 후 실제 Scene Repository/status/content/POST, 읽기 권한, Local/S3, CAS+Audit transaction, SQL/Greenfield fingerprint, Version 삭제 cleanup 및 Root pure validator/READY 로더를 검토했다. 구조 재설계가 필요한 결함은 발견하지 않아 **독립 QA 시작 허용**으로 판정했다. 최종 ACCEPT/Issue AC 완료 판정은 아니다.

집중 보완/QA 항목은 실제 HTTP 401/403/OFF/CSRF/다른 Site·Version, Audit INSERT 실패 rollback(권한 회수 시험과 구분), Version 삭제 cleanup, S3 응답 실제 byte cap 및 Browser corrupt/missing/abort이다. S3 ContentLength만 검사하고 전체 body를 버퍼링하는 경로는 실제 읽기 상한도 적용하도록 Developer에 보완 요청했다. 기존 exact baseline 허용은 schema 검증 호환이며 구 릴리스 marker를 새 0.46.0 런타임에 무단 승계한다는 뜻이 아니다.

Developer가 보고한 집중 Scene/Greenfield 15/15 및 runtime migration/Greenfield/Scene 27/27 PASS, Root Scene PoC 1/1 PASS(41.8초), 집중 3 files/24 PASS는 각각 실행 시점 결과다. Root 전체 moving-source 실행 20 FAIL/601 PASS와 초기 Build PASS는 [FailureLedger](FailureLedger.md)에 보존하며 당시 frozen 전체 실행이 필요했으며 최종 결과는 아래에 기록한다.

### 독립 QA 진행 및 Root 실제 브라우저 근거

- QA 최초 focused Scene loader/input/persistence/S3 **4 files/22 PASS, 6.77초**, 보완 뒤 **3 files/23 PASS** 보고. 실제 Audit INSERT/HTTP scope/delete cleanup 근거 부족과 S3 response cap을 지적했고 재작업 중이다. requestId 시험의 실패 위치에 대한 QA 최초 진단은 실제 direct DB 호출 대조 후 철회되었고, 명시 BEFORE INSERT trigger로 더 직접적인 rollback 시험을 추가했다. 정정 이력은 원장에 보존한다.
- Root Greenfield E2E **2/2 PASS, 18초**, `/tmp/lm-scene-greenfield-e2e.log`. 최초 관리자 설정과 실제 인증 업로드→명시 변환→Scene 저장→별도 새 로그인 BrowserContext/reload를 검증했다. READY 원본 GET 0, Layer/문자 검색·native fullscreen/resize, missing/unsupported builder/corrupt에서 자동 원본 GET 0, 명시 dxf fallback 1 GET 뒤 Scene 복귀의 추가 원본 GET 0, canvas 1개/live Worker 0을 보고했다. 이는 합성 2 BrowserContext이며 실제 2대 PC/사내 DXF 수용이 아니다.
- 당시 Root 최종 전체 Vitest와 일반 E2E는 진행 중이었다. 최종 완료 결과는 아래에 기록한다. migrator COPY 보완은 packaging 검토 결과이며 실제 Docker image 실행 여부는 별도로 기록한다.

### 독립 QA 최종 집중 검증 및 AC 추적

독립 gpt-6-luna QA가 최종 Scene 소스의 **6 files/32 PASS, 10.83초**, 별도 Docker packaging contract **1 file/9 PASS**를 보고했다. 실제 HTTP 다른 Site/Version read/write와 content 권한, Origin/CSRF, BEFORE INSERT Audit trigger 실패의 pointer/asset rollback·cleanup 보존, Version 삭제 후 cleanup, S3 실제 stream 크기 초과 취소를 확인했다. 발견한 집중 결함/검증 공백은 해결되었고 **현재 scoped blocker 없음**이다. 이는 실제 Docker image 실행·현장 저장소 시험을 대신하지 않는다.

| Issue AC | 로컬 개발 근거 | 잔여/완료 상태 |
| --- | --- | --- |
| AC-S3-01 | Local/SQLite 및 Mock S3 digest/manifest·READY·immutable old bytes·멱등/CAS/경쟁·Scope 음성 시험 | 로컬 지원, 최신 PR CI 미확인으로 미완료 |
| AC-S3-02 | PUT/권한 회수/실제 Audit INSERT 실패·cleanup/재시도·이전 pointer/원본 sentinel 유지 | 로컬 Scene 범위 지원; APP_CREATED/Memo 실제 영속 자료 통합은 #98/#83 PENDING |
| AC-S3-03 | #168 Stable ID/Origin/scope 계약과 새 payload validator/복원 테스트 | 로컬 지원, 최신 PR CI 미확인 |
| AC-S3-04 | G7 OFF/Reader/다른 Site·Version/Auth/Origin/CSRF 거절과 append-only Audit/CAS | Scene 권한 로컬 지원; #98/#83 API·SoftDelete 통합은 PENDING |
| AC-S3-05 | bytes 손상·builder/Scope mismatch 및 REBUILD_REQUIRED, 자동 source GET 금지 | 로컬 Scene 범위 지원; 업무 영속 보존 수용은 의존 이슈 후속 |
| AC-S3-06 | 임시 SQLite/fresh exact baseline/기존 exact-7 회귀·Local/Mock S3·packaging 계약 | 전체 로컬 통과, PR CI 미확인으로 미완료; 실 운영 migration/GHCR 미실행 |
| AC-S4-01 | 인증 업로드→변환→게시→독립 로그인 context/reload에서 원본 GET 0·converter Blob URL 0·DXF Index Worker 0 | Scene 경로 로컬 지원; 별도 AppObject/Memo API 복원은 PENDING |
| AC-S4-02 | domain ID/WCS/layer/text restore와 renderer 재생성, 기존 Generated/Memo 회귀 | APP_CREATED/Memo의 영속 재접속·Tree 연계는 #98/#83/#73 PENDING |
| AC-S4-03 | missing/builder mismatch/corrupt와 자동 원본 조회 0, 명시 생성 안내 | 로컬 Scene 범위 지원, CI 미확인 |
| AC-S4-04 | 새 context/reload·명시 dxf fallback/Scene 복귀·abort·resize/native fullscreen·1 canvas/live Worker 0 | 합성 browser 근거; 실제 2PC/장기 GPU memory 수용은 #113 미검증 |
| AC-S4-05 | 기존 그룹 메뉴와 미지원/세션 임시 안내, 선택 projection은 canonical source 검증으로 승격하지 않음 | 일반 E2E 최종 결과 대기; 독립 업무 API·고급 S5 작업은 후속 |
| AC-S4-06 | 독립 QA·Root 로컬/CI/현장 상태 분리와 누적 실패 원장 | PR CI 시작/성공은 실제 원격 상태로 후속 기록 |

모든 AC는 **완료 체크하지 않는다**. Manager의 로컬 범위 수용은 아래 Root 최종 결과에 근거하며 Issue 전체 완료·CI 성공·실 DXF/현장 수용과 동일하지 않다.

### Root 동결 회귀 결과 및 최종 로컬 판정

- 일반 E2E **94/94 PASS, 7.0분**, `/tmp/lm-scene-all-e2e.log`. 기존 Viewer/선택/외곽선/메모/트리/그룹 메뉴/fallback/한글 회귀와 Scene PoC(42.6초)를 포함한다.
- 별도 signed Runtime UI **1/1 PASS, 11.3초**, Legacy master-migration UI **1/1 PASS, 14.4초**. 신규 Greenfield UI 및 Scene 전체 흐름은 앞선 **2/2 PASS, 18초**다. 따라서 보고된 브라우저 총합은 일반 94 + Runtime 1 + Legacy 1 + Greenfield 2 = **98 PASS**이며 합성/격리 환경 결과다.
- 최신 Typecheck **PASS**, Lint **PASS(기존 경고 6개)**. 최종 frozen 전체 Vitest는 **90 files/631 PASS, 299.79초**다. Manager가 `/tmp/lm-scene-frozen-tests.log` 완료 summary를 직접 확인했다. 공유 서버 종료 뒤 Production Build `/tmp/lm-scene-final-build.log`는 **PASS(exit 0)**이며 Root 실행 결과와 완료 route summary를 확인했다.
- 전체 631 PASS 뒤 test-only 신규 프로세스 복원 계약을 추가했다. 별도 `scene-persistence.test.ts` **1 file/10 PASS, 5.47초**, `/tmp/lm-scene-restart-contract.log`를 Manager가 직접 확인했다. producer Prisma/storage를 닫은 뒤 새 Node subprocess에서 같은 임시 DB/Local blob을 열어 READY/asset ID/revision/length/digest를 검증한다. 실제 HTTP 인증·컨테이너 재시작을 대체하는 시험이 아니며 전체 suite 632 PASS로 합산하지 않는다.
- 최종 Production Build 후 Greenfield E2E 재확인은 **2/2 PASS, 14.4초**, `/tmp/lm-scene-final-greenfield-e2e.log`이며 원본 GET/Blob/인덱스 Worker 모두 0이다. test-only subprocess 환경 보완 후 Typecheck/Lint도 PASS(기존 6 warnings).
- gpt-6-astra Manager는 실제 Developer 완료보고·독립 gpt-6-luna QA·Root 최종 Typecheck/Lint/Unit/Integration/Build/E2E를 검토해 **ACCEPT LOCAL SCOPED / 추가 재작업 불필요**로 판정했다. 최종 Build 뒤 Greenfield 추가 확인도 위와 같이 통과했다. CI/Issue 전체 AC·APP_CREATED 의존·실 현장 수용은 계속 미완료다.

---

## PR #168 Codex P2 보완 — Custom DTO Attribute 타입 보존 (2026-10-30)

- **선행 확정:** 이전 HEAD `3be07597`의 [PR CI 40987779057](https://github.com/planner77/layoutManager/actions/runs/40987779057)는 SUCCESS. 그 후 새로 열린 Codex P2 리뷰를 신규 결함으로 인정한다. 이전 CI 성공은 정규화 정수 버퍼 round-trip의 증거가 아니었다.
- **분석:** 기존 `CUSTOM_DTO`는 `normalized=true`와 원시 정수 배열을 저장하지만 타입 정보 없이 Float32로 복원하여 WebGL 및 BufferAttribute accessor에서 기하·색상·UV 의미가 변할 수 있다. 데이터 해시·origin 검증을 우회한 것이 아니라 schema 누락 문제다.
- **변경:** 원본 typed array 종류를 명시 allowlist로 저장하고 복원, 정수 범위/위조/overflow 거부. 새 유닛 `src/tests/unit/scene-custom-dto.test.ts`에 정상/음성 사례 추가. 이전 schema 1/arrayType 누락 샘플은 에러로 거부하여 모호한 변환을 방지한다. 특수 Float16은 현재 미지원으로 명시 거절.
- **검증 상태:** 이 보완의 실제 Vitest/Typecheck/Lint/Build/새 PR CI 및 Scene PoC E2E는 새 HEAD 결과 확인 전 **NOT VERIFIED**. 코드 변경/테스트 추가는 실행 PASS와 구분하며 새 CI 결과를 모니터링하지 않는다. 실DXF·GPU/2PC·CPU-only 생성/영속 DB/S3/운영 이미지/현장/DRM도 NOT RUN. 기존 SC-05~07 수치와 실패 원장은 당시 관측으로 유지한다.

---

## #161–#163 Scene S0/S1/S2 독립 QA (2026-10-30)

- **역할/기준:** 현행 AGENTS.md 매핑의 gpt-6-astra Manager `/root/scene_manager`가 요구사항·설계·AC를 먼저 기록하고, gpt-6-sol Developer `/root/scene_manager/developer`가 구현, 완료보고 검토 후 gpt-6-luna 독립 QA `/root/scene_manager/qa`가 검토·시험했다. Root는 전체 회귀·빌드 및 최종 Git/PR 작업을 담당한다. 브랜치 `feat/issues-161-163-scene`, 기반 `a208cf0`. 최종 소스 freeze 이후 QA가 수행한 시험과 Developer/Root의 선행 결과를 구분한다.
- **최종 소스 QA 실행:** `npx vitest run tests/unit/cad-scene.test.ts tests/unit/generated-document.test.ts tests/unit/canvas-object-selection.test.ts tests/unit/cad-memo.test.ts tests/unit/three-dxf-viewer-scene-serialization.test.ts`는 Vitest가 실제 발견한 4개 파일 **26/26 PASS**(1.12초; serialization test 경로는 존재하지 않아 실행되지 않음). 별도 focused 실행 `cad-scene`, `generated-document`, `canvas-object-selection`은 **3 files/20 tests PASS**. 따라서 실제 serializer 검증은 다음 Browser PoC에서 수행했다. GeneratedDocument Undo/Redo/visibility ID·Origin, Canvas SOURCE/GENERATED 및 memo/selection 호환 회귀를 포함한다.
- **독립 Browser PoC:** `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npx playwright test --config playwright.scene-poc.config.ts`, Playwright **1/1 PASS, 44.1초**, synthetic-only route, WebGL SwiftShader, producer와 별도 새 BrowserContext restore. fixture는 nested/repeated mixed INSERT, LINE/CIRCLE/ARC/LWPOLYLINE, TEXT/MTEXT, handleless entity, hidden/style probe 및 large WCS다. Three JSON semantic negatives 23, custom DTO negatives 6, manifest field negatives 11 및 byte corruption 확인. 원본 DXF/DB/GHCR/PR CI/실도면은 시험하지 않았다.
- **포맷 관측:** 최종 QA 실행에서 Three JSON 186,303 B / gzip 23,379 B, custom DTO 194,752 B / gzip 29,816 B, GLB 140,932 B / gzip 19,311 B. Custom DTO는 1,894 vertices/26 nodes 및 비교 geometry scalar 전부 동일. Three JSON에서 ShapeGeometry 재생성 뒤 같은 vertex index의 393 scalar 값이 달랐고 최대 차이는 62.865였다. 이는 버퍼 표현/정점 순서 차이이며 동일 bbox·개수만으로 실제 형상 손상이나 완전 동등성을 판정할 수 없다. GLB는 ID 정렬 vertex sample 변화 0이나 root Group→Object3D 포함 27 nodes로 바뀌고, hierarchy/material semantics 제한이 관측됨. 대형 WCS 끝점은 converter 입력 100000100/100000010에서 100000096/100000008로 이미 반올림됐다. 이는 합성 결과이며 실제 DXF 허용오차/도면 수용 근거가 아니다. Converter에 Helvetica font를 공급했으므로 한글 렌더 결과 검증 아님.
- **도메인/구현 검토:** domain 모듈은 Three/DOM/DB import 없이 SceneAsset/SceneObject/AppObject 및 ref를 검증한다. manifest expected scope/format/length/digest 대조와 READY asset revision 대 manifest revision 확인을 복원 시 수행하고 non-string asset state를 거부한다. Tree occurrence ID는 Version/source SHA/schema/builder/renderer/frame/unit과 경로 기반이며 Object3D.uuid와 분리. actual adapter converter 직후 tag, GeneratedDocument에서 APP_CREATED stable ref 유지, SOURCE/GENERATED compatibility bridge 확인. `src/prisma`, API, migration, 정상 loader/cache cutover, S5 selection/edit gate, S3 persistence/CAS 및 S6 reset 실행 추가 없음. DB/기존 Version/Auth/Site/Audit 불변은 source diff 확인 범위이며 실제 운영 DB 시험은 안 했다.
- **실패·한계 이력:** 상세한 순차 구현/시험 실패와 보완은 [FailureLedger](FailureLedger.md)에 기록한다. Root의 선행 일반 E2E 88 PASS/6 FAIL은 병행 Developer isolated run이 공유 `src/test-results` artifacts를 삭제해 `context.close/dispose` ENOENT로 실패했으며 입증된 제품 실패는 아니다. Root가 unique output으로 재실행 중이므로 전체 E2E 상태는 **미확정**. Node CPU-only converter probe는 ProgressEvent 부재 및 browser 전역 의존으로 성공하지 못했으므로 CPU 지원 주장은 하지 않는다.
- **판정/게이트:** S0/S1 및 synthetic S2 POC 로컬 검증은 통과. custom DTO는 포맷 평가 후보일 뿐 채택/운영 저장/cache 아님. Build2/전체 601 unit 및 signed Runtime UI 1건·Greenfield 최초 Admin UI 1건·Legacy migration UI 1건은 Root 선행 PASS 보고로만 기록하며 본 QA가 재실행하지 않았다. CI/PR, 전체 E2E 재실행, 실제 DXF·한글 font, 성능 예산, deployment/GHCR 및 운영 S3/DB는 NOT VERIFIED. DRM H0~H3는 최신 Owner 정책상 NOT REQUIRED이며 개발 미완료 게이트가 아니다. Root가 최종 보고·commit/push/PR을 담당한다.

### Root 최종 회귀·Manager 수용 (2026-10-30)

- 최종 일반 Playwright는 고유 output을 사용해 **94/94 PASS, 6.5분, exit 0**. 명령: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=<설치 Chromium> CAD_E2E_PORT=3198 npm run test:e2e -- --output /tmp/layoutmanager-scene-full-e2e-final-results`; 로그 `/tmp/layoutmanager-scene-e2e-final.log`. 새 Scene PoC 36.2초 및 기존 93개 회귀를 포함한다. 앞선 88 PASS/6 FAIL은 실행 이력으로 보존한다.
- Root 전체 Vitest **85 files/601 PASS, 262.32초** 및 Production Build 2회 PASS. 이후 동결 소스의 추가 계약/생성/선택/메모 변경은 위 독립 QA 집중 시험으로 확인했다. 최종 `npm run typecheck`와 `npm run lint` PASS(오류 0/기존 경고 6).
- 격리 signed Runtime UI **1/1 PASS, 15.3초**, Greenfield 최초 Admin UI **1/1 PASS, 10.3초**, Legacy migration UI **1/1 PASS, 20.2초**. 각기 다른 임시 DB·포트·output이며 실제 운영 DB/계정/도면을 사용하지 않았다.
- gpt-6-astra Manager는 실제 Developer/독립 QA 및 위 최종 회귀 결과를 검토해 **ACCEPT / 재작업 불필요**로 판정했다. 수용은 S0/S1 및 합성 S2 로컬 개발 범위이며 실도면·픽셀/선택 hit·CPU 서버·영속 API/DB·GHCR·배포 수용과 구분한다.
- Git main `a208cf0` 대비 behind 0, staged 23파일의 diff/실제 Secret·credential pattern·CAD/DB/산출물 제외 검사 PASS. 원본 작업 폴더의 기존 수정 2개를 보존했다. 로컬 gh 인증 만료로 GitHub 연결 도구를 사용해 검증한 tree를 게시한다. PR 최신 HEAD의 리뷰/충돌 및 CI 시작은 후속 Git 기록으로 남기며 CI 결과는 모니터링하지 않는다.

### 단일 PR 게시 및 최종 CI 인계

[PR #168](https://github.com/planner77/layoutManager/pull/168)에 #161/#162/#163을 통합했다. 코드 commit `f907c75409c033b21f8a7231d36d1c46f72171c8`, 원격 tree와 로컬 검증 tree 일치. 원격 실제 조회에서 미해결 리뷰 0건·mergeable=true, main 대비 behind 0이다. 이 원장/보고 기록을 포함한 후속 commit의 non-force 브랜치 갱신으로 최신 PR CI를 시작하고 결과를 모니터링하지 않는다. 최종 HEAD/Run은 PR 본문·완료 보고에서 식별하며, PR CI/현장/운영 수용은 NOT VERIFIED다. 다음 구현은 #164 S3이며 이번에는 병합·배포·이슈 종료하지 않았다.

### SC-05~07 충실도 및 계측 해석

| 비교 항목 | Three JSON | 전용 DTO | GLB/glTF binary |
| --- | --- | --- | --- |
| Geometry buffers | 1,894 vertices 유지, index 기준 393 scalar 차이; ShapeGeometry 재생성 | 측정한 position scalar/정점 순서 정확 일치 | stable ID 정렬 후 position scalar 차이 0; 추가 root 때문에 순회 순서 비교만 하면 오판 |
| 계층·가시성 | 26 nodes/kind/visible 배열 일치 | 동일 | 27 nodes, Group→Object3D; `onlyVisible:false`로 숨긴 개체 포함 |
| 레이어·ID·bbox | 원본 layer 분포 및 26개 앱 ID, bbox 일치 | 동일 | 기존 ID/레이어 분포 유지하나 추가 root는 UNSPECIFIED; bbox 일치 |
| 색·선 스타일 | 테스트 material type/color/opacity/linewidth/dashSize/gapSize 배열 일치 | 동일 | material type 및 dashed/linewidth 의미 차이 관측 |
| TEXT/MTEXT | 생성 mesh 개수 유지, 위 buffer 차이 포함 | 생성된 문자 mesh position 보존 | ID별 mesh position 보존 |
| 문자 의미·자원 | raw parser entity/string을 canonical metadata에서 제거; 문자 검색용 semantic text 보존은 미구현 | 동일 | upstream JSON userData가 extras에 포함; 사용자 export/API로 제공하지 않음 |
| WCS·단위 | INSUNITS=4/WCS XY와 이미 양자화된 bbox 유지 | 동일 | 같은 bbox; 별도 검증 envelope는 미구현 |

하나의 LINE을 변환 후 hidden + 색 `0x12abef`·linewidth 3·dashSize 2/gapSize 1로 바꾼 **serializer style probe**가 포함된다. 이 실험은 DXF의 lineweight/linetype import 지원 증거가 아니며, 숨긴 선의 실제 dash/두께 픽셀 출력이나 스크린샷 동일성은 검증하지 않았다. WebGL draw 호출·좌표/속성 비교를 수행했지만 text 모양·픽셀/선택 hit 동등성은 전체 수용하지 않는다. 15개 container/병합 node는 원래 layer가 없으므로 UNSPECIFIED이며 임의 원본 layer/Handle을 만들지 않았다. viewport 회전이 있는 다른 도면의 canonical WCS 대응은 이번 fixture 밖이다.

Developer의 **최종 source** 별도 실행 로그 `/tmp/scene-poc-post-scrub.log`(1/1 PASS, 34.8초)의 단일 샘플은 아래와 같다. QA 위 수치와 별도 실행이며 CPU/GPU 장비 성능 SLA 또는 p95가 아니다. DXF/font fetch를 포함한 getFromPath 생성 시간은 공통 **75.7ms**이고 render/frame 시간·peak heap은 미계측이다.

| 포맷 | bytes | gzip bytes | 직렬화 ms | 복원 ms |
| --- | ---: | ---: | ---: | ---: |
| Three JSON | 186,303 | 23,350 | 21.9 | 12.4 |
| 전용 DTO | 194,752 | 29,816 | 15.9 | 6.2 |
| GLB | 140,932 | 19,304 | 31.1 | 6.8 |

gzip 차이는 매 실행 생성되는 renderer UUID와 압축 내용의 영향을 받는다. GLB는 raw upstream extras도 포함하고 JSON/custom은 canonical ID/layer로 정제하므로 크기는 동일 metadata envelope의 압축 효율 순위가 아니다. 초기 개발 GLB 90,944B 측정은 외부에서 userData를 먼저 정제했던 구 하네스 결과로 보존하며 최종 140,932B 결과와 혼합하지 않는다. CPU-only Node probe는 native ProgressEvent 부재, 임시 호환 shim 뒤 WMFJS의 비동기 window 접근 실패를 관측했으므로 서버 생성 성공으로 승격하지 않는다.

---

## #109 PR #159 — 독립 QA 재개 및 완료 (2026-10-30 KST, 0.44.2 후보)

- **역할/이력:** 최초 요구·AC 기록·RED 재현·Build는 `/root` Codex가 Manager 역할로 수행했고, 지정 gpt-6-astra는 별도 `/root/manager_review`와 재개 후 `/root/manager_resume`에서 구현 검토·최종 수용을 담당한다. 제공 모델 목록에 과거 지정 gpt-5.6-sol/luna가 없어 개발은 gpt-6-sol이 Developer gpt-5.6-sol을 대행했다. 독립 QA는 gpt-6-luna가 과거 지정 gpt-5.6-luna를 대행했다. 앞선 QA 프로세스는 daemon 재시작으로 중단되었고 이번 작업은 `/root/qa_resume`의 gpt-6-luna가 복구했다. 최종 gpt-6-astra Manager는 실제 QA 결과·보고 정합성 검토 후 **ACCEPT / 재작업 불필요**로 판정했다. 수용 범위는 본 보완과 PR CI 재시작이며 현장 릴리스 수용이 아니다.
- **재개 전 근거(재실행하지 않음):** Typecheck PASS, ESLint 오류0/경고6, Vitest 84파일/598 PASS(244.92초), 집중 Unit 9 PASS(264ms), root `npm ci`/Prisma generate/Production Build PASS. OCI 합성 3 PASS, outline 합성 1k/10k/100k PASS, Python audit 10 PASS(Python 3.14 전용 zstd 하위시험은 실행 환경상 SKIPPED). 위 집중 Unit은 Developer의 standalone 계약 테스트이며, QA Greenfield UI 1 PASS(5.3초) 및 signed Runtime UI 1 PASS(9.9초). 이 결과는 이전 수행자의 기록이며 이번 재개에서 다시 실행하지 않았다.
- **재개 전 중단 이력:** 앞선 일반 Playwright 93개 실행은 daemon 재시작 때 완료 전에 종료되었다. 그 시점까지 알려진 22개 PASS만 보존하고 전체 성공으로 간주하지 않는다. 이번에는 동일 일반 E2E와 별도 Legacy Migration E2E를 서로 다른 임시 DB/CAD/output 경로, 포트 3101/3104에서 다시 끝까지 실행했다. Legacy 하네스는 임시 디렉터리 미생성과 migration fixture가 요구하는 `/tmp/cad-master-migration-*` prefix 불일치 때문에 각각 테스트 시작 전에 종료했고, 올바른 격리 디렉터리로 다시 시작했다. 이는 애플리케이션 테스트 실패로 집계하지 않는다.
- **재개 QA 실제 실행:** `npm run typecheck` PASS(exit 0). 일반 Chromium `npx playwright test --config playwright.config.ts --output=/tmp/issue109-general-resume/results` **93/93 PASS, 0 FAIL, 5.9분**, 포트 3101 및 독립 DB/CAD 사용. Legacy `npx playwright test --config playwright.master-migration.config.ts --output=/tmp/issue109-legacy-resume/results` **1/1 PASS, 15.4초**(`TC-MASTER-005`, legacy DB의 browser 사용/재분류), 포트 3104 및 독립 fixture 사용. 전체 원문 로그는 `/tmp/issue109-general-resume.log`, `/tmp/issue109-legacy-resume.log`에 보존.
- **변경·범위 검토:** diff는 AGENTS/README/Operation/Requirements/Runbook의 사업장 생성 → 본인 명시 Site Grant → 동·층 순서 정정, TestPlan·FailureLedger·ChangeLog 보완, standalone CI order contract 및 Greenfield Setup alert locator 회귀 보완으로 한정된다. Runtime, Workflow, Schema, 의존성, 버전은 변경하지 않았다(후보 0.44.2 유지). Site authorization을 완화하지 않았고 두 기존 테스트의 assertion/coverage를 보존했다. 경로·역할을 이 보고서와 구분해 기록하며 테스트 준비 오류를 제품 FAIL로 취급하지 않는다.
- **커밋/최종 게이트:** 코드 [1daf5faa](https://github.com/planner77/layoutManager/commit/1daf5faa08fb8691228e86bacbef0edb27580f6d). 미해결 리뷰 스레드 0건(기존 2건 모두 resolved), main `993a2d68` 대비 behind0·충돌 없음, 실제 .env Secret 값과 PR Secret 패턴/런타임 산출물 제외 및 diff check PASS. 원장·운영 문서 커밋을 포함한 단일 non-force 브랜치 갱신으로 PR CI를 시작한다. 후보 버전 0.44.2 유지, 원본 작업 폴더의 기존 변경 2건 보존.
- **인증 전송 보완:** Git push 인증 2회 거부 후 인증된 GitHub 연결 도구로 반영한다. 코드 tree가 실제 검증한 로컬 tree와 동일함을 확인하고 기대 HEAD 검사 및 `force=false`로 ref를 갱신한다. 기존 로컬 커밋은 보존하며 Secret·인증 URL을 기록하지 않는다.
- **CI/운영 경계:** 기존 Run #40946304142는 구 HEAD `b5883922`에서 Unit 1 FAIL / Docker Job SUCCESS이며 새 HEAD의 CI 성공 증거가 아니다. 위 로컬 결과로 CI 재실행 상태를 추정하지 않는다. PR CI 새 Run은 최종 코드·문서의 브랜치 갱신으로 시작한 뒤 결과를 관측하지 않으면 `NOT VERIFIED`로 유지한다. 실제 운영 DB/CAD/볼륨, GHCR 게시, Main CI, 현장 2PC/DXF/OCI 수용은 실행하지 않았다.

---

## #109 PR #159 최초 실패 Run 확인 및 보완 (2026-10-30)

- Run #40943801670 / HEAD `ba49e5062c33a4f61990a4f458a264e3781a817e` **completed/failure**. Verify #123693738568은 TypeScript `closeSync` import TS2304 한 건, Docker #123693739084는 `greenfield-install.ts` Webpack `new URL('../../',import.meta.url)`로 baseline build 실패. 자세한 원장: [FailureLedger](FailureLedger.md).
- 기존 플로우의 Typecheck 외 Lint/Unit/Integration/Build/E2E 및 Docker 기준 이미지 이후의 이미지 빌드/합성 인증 CRUD/restart 검증은 **SKIPPED**. 리뷰 P2 두 건은 실행 실패가 아니라 코드 검토 단계에서 발견, Test PASS 아님.
- 보완: 누락 import 복구, Next.js에서 실행 경로에 있는 코드의 module-relative URL 정적 해석 제거, Site 생성 직후 Admin의 명시 Site Grant로 Smoke 순서 수정, Playwright Runner/Worker 공유 GREENFIELD_E2E_ROOT 적용. 새 HEAD 전체 CI 성공/현장 수용 여부는 **NOT VERIFIED**.

---

## #109 0.44.2 신규 Compose/웹 관리자 PR 후보 (2026-10-30; 실행 결과 아님)

- 작성된 후보 코드: `greenfield-auto.ts`, `greenfield-first-setup.ts`, 신규 관리 UI/Route, 기본 Compose/Greenfield one-shot migrator, Site0 지원, release marker. 작성된 후보 테스트: `g7-greenfield-auto.test.ts`, `first-install.spec.ts`, Docker `smoke_greenfield_runtime.py` 및 PR CI job 변경.
- **검증 상태:** 코드/테스트 추가는 PASS 증거가 아니다. 최신 HEAD의 Typecheck/Lint/Unit/Integration/Production Build/Playwright/Docker는 PR CI 결과를 조회하기 전까지 `NOT VERIFIED`. 실 Docker 2PC 접속/DXF 현장 시험/OCI 독립검증 및 실제 GHCR 게시 역시 `NOT VERIFIED`.
- 기존 #153 CI 실패 14+8개 TS 오류 및 P2 schema drift 반례를 #109 새 테스트에서도 참조한다. SKIPPED 테스트를 PASS로 해석하지 않으며 새 PR 실패 시 실패 원장의 이전 원인까지 대조해 수정한다.

---

## #153 PR #158 — 두 번째 CI 실패 및 보완 (2026-10-29)

- Run #40890727134 `completed/failure`: Verify Job 123507859408에서 Typecheck 오류 8건, Docker Job 123507859697에서 동일 TypeScript 오류로 baseline Docker 빌드 실패. 세부 오류/원인은 [FailureLedger](FailureLedger.md) 참고.
- 보완: 검증된 `string` 반환 Helper, `unknown` Site 입력 검증·명시 Schema 조립, `runtime-db.ts` Greenfield import 중복 제거. 타입 단언/보안/기능 검증 완화 없음.
- `tsc --strict --noEmit` 독립 좁히기 예제 exit0. **전체 프로젝트 Typecheck/Unit/Integration/Docker/E2E 결과는 최신 CI 수행 전 NOT VERIFIED**. 과거 Run의 SKIPPED를 PASS로 변경하지 않음.

## #153 PR #158 — 초기 PR CI 실패와 보완 (2026-10-29)

- [PR CI #40888739457](https://github.com/planner77/layoutManager/actions/runs/40888739457), initial HEAD `eb2fe9193e086fb1f01daf183d3b5f551444a8e0`, completed/failure. Verify Job 123499430711 Typecheck TS18048/TS2322/TS2345/TS18046/TS2769 총 14건. Docker Job 123499430329 baseline image Next.js build 도중 **동일 TypeScript 오류**로 실패. npm ci/Prisma generate와 Next webpack compile은 성공, Lint/Unit/Integration/E2E 및 Docker 후속 단계 SKIPPED. 두 개의 독립적인 제품 오류로 중복 집계하지 않음.
- **제품 보완:** Greenfield Authority/Installer의 환경변수·JSON Site 입력·sign buffer를 명시적 narrowing으로 처리, Gate의 검증된 Release 필드를 callback 전에 불변 로컬 변수로 분리. 사용자 입력 또는 null을 타입 단언만으로 우회하지 않음.
- **추가 Codex P2:** legacy 7-schema fallback을 새 Signed Greenfield Gate가 허용할 수 있다는 지적을 Gate와 `openG7RuntimeDb`의 mode-discriminated 검증으로 수정. 7개 legacy history + 동일 Site라도 신설 전용 모드는 차단하는 회귀 테스트 추가; review thread 답변 후 Resolved.
- **최신 HEAD 새 CI 검증 전 상태:** 수정 코드만 기록, 실제 Typecheck/Unit/Docker/E2E 합격은 `NOT VERIFIED`. 사용자 요청대로 새 PR CI 시작 이후 모니터링 없음. 현장 DB/CAD/HOLD·배포·운영 이관 실행하지 않음.

## #153 Greenfield 구현 후보 검증 상태 (2026-10-29)

- 구현 후보: Greenfield 초기 Schema·Site seed·Owner 서명 Gate·일회성 Admin 및 신규 독립 Compose·합성 회귀.
- 현재 **NOT VERIFIED**: 최신 HEAD Typecheck/Lint/Unit/Integration/E2E/Docker, PR CI, Main CI, GHCR 및 현장 새 설치/DXF 수동 등록·2PC 수용. 테스트 작성만으로 PASS를 주장하지 않음.
- 이전 운영 6→7/HOLD 실패는 원장에 과거 증거로 유지하되 이번 신규 DB 설치의 AC가 아님.

# 실제 검증 결과 및 Viewer 평가


## PR #156 — 두 P2 수정·강제 종료 회귀 (2026-10-29)

- 기준 HEAD `523801a4da8850d579009efa92e3f1c76a746ece`, Main `a7af4aa0c106b5149043196a3567cf7bdc1b08a9`. 선행 [PR CI #40775288415](https://github.com/planner77/layoutManager/actions/runs/40775288415) completed/success는 직접 확인한 기존 결과이며 새 수정의 CI 결과로 재사용하지 않는다.
- 실제 역할: root가 격리 worktree·문서·전체 검증·원격 반영을 담당, `/root/manager` gpt-6-astra가 AC/설계·Developer 결과 검토, `/root/developer` gpt-6-sol이 구현·RED→GREEN, `/root/qa` gpt-6-luna가 독립 diff/회귀 검증을 수행한다. 인간 QA 승인으로 기록하지 않는다.
- FR-153-P2-SITE → Runtime DB의 승인 Site 존재 검사/거래별 active 확인 → TC-153-P2-SITE. 실제 Admin PATCH 비활성화·재활성화, 새 로그인·Session·관리 API 유지, 다른 승인 Site 쓰기 성공, 대상 Site upload/Current/DELETE 거부와 재활성화 후 쓰기 복구를 시험한다. 누락/미승인 Site·기존 Preview 계약은 보존한다.
- FR-153-P2-LOCK → persistent SQLite OS lock/원자 HOLD/동일 승인·SNAP·Epoch 재개 → TC-153-P2-LOCK. 실제 자식 lock 보유 중 contender 거부와 SIGKILL 종료를 확인한 뒤 새 실행의 pre-Snapshot recapture, SQL 적용 후 rollback·재개, commit 직후 재개, Restore 재시도를 시험한다. CAD/Version/Current·Local/S3 export·Audit·Schema/이력 검사와 음성 identity·경로 테스트를 유지한다.

| 검증 | 이번 수정의 실제 결과 |
| --- | --- |
| 정확 lockfile 설치·Prisma 생성 | PASS (`npm ci --no-audit --no-fund`, `npm run db:generate`), 원본 workspace 의존성/설정은 보존 |
| Production Build | PASS (`npm run build`), 실제 제품 코드 최종본의 standalone 패키징 포함 |
| 최종 Typecheck·Lint | PASS (`npm run typecheck`, `npm run lint`), 오류0/기존 경고6 |
| Developer 집중 회귀 | 최종 4개 Runtime 파일59/59 PASS, 106.95초. 실제 SIGKILL4개 포함 |
| root 전체 Vitest | PASS 82파일590/590, 319.11초 (`npm test`), Skip/Assertion 완화 없음 |
| 독립 QA | PASS, 동일 Runtime 4파일59/59, 105.41초. 전체 변경 검토·diff check 통과, 차단 사항 없음 |
| Runtime ON Chromium | PASS 1/1, 12.4초. 서명 합성 승인에서 로그인·계정/권한/Audit·등록/익명 원본/Current/기존 비밀번호 DELETE/Logout UI |
| Runtime OFF·기존 CAD Chromium | PASS 11/11, 37.0초. g7-runtime-off/master/upload: 비활성 기준정보·이력/재분류·등록·검색·Current·원본/진단 호환 |
| 새 HEAD PR CI | 최종 기존 PR 브랜치의 synchronize 이벤트로 시작. 최신 HEAD/Run은 완료 보고 참조. 종료 결과 모니터링 생략·NOT VERIFIED |

최종 제품5·회귀4·문서10의19개 수정은 기존 PR64경로 안에 있다. Main a7af4aa 재조회/behind0·병합 충돌0, staged scope/Secret·런타임 산출물 제외 검토를 수행했다. [코드 commit eea01548](https://github.com/planner77/layoutManager/commit/eea01548b75d5d38db1cfa14029115f7d6a07881)를 근거로 두 P2 [Site 답변](https://github.com/planner77/layoutManager/pull/156#discussion_r4407021095)·[Lock 답변](https://github.com/planner77/layoutManager/pull/156#discussion_r4407022868)을 기록하고 resolved를 확인했다. Manager는 실제 독립 QA 및 전체 회귀 근거로 ACCEPT했다. 최종 체크포인트까지 포함한 Build→Typecheck 순차 재실행도 PASS다. 최종 문서 commit과 함께 기존 branch를 fast-forward 갱신해 새 CI를 시작하며, HEAD/Run URL은 완료 보고에 기록한다. 별도 문서 push로 추가 CI를 만들거나 종료 결과를 모니터링하지 않는다.

중간 RED·fixture 기대 코드/타입·의존성 누락·root 설치/시험 간섭은 [FailureLedger](FailureLedger.md)에 보존한다. 이번 변경은 미릴리스0.44.0 후보 내 보완이다. 새로운 의존성/자동 Migration/Schema/운영 설정/원본·이미지·Tag·배포·병합·별도 Issue/PR은 추가하지 않는다. 실제 호스트 reboot/현장 SQLite·CAD·원격S3/이전 OCI pair는 NOT TESTED다. SQLite lock 해제는 실제 SIGKILL 시험으로 검증하며, 구형 wx marker 전환·남은 Prisma 자식의 Writer Zero 조건은 [Runbook](../src/deploy/g7-runtime/README.md)의 운영 제한으로 명시한다.


## #153 — 실제 G7 운영 통합 로컬·격리 검증 (2026-10-29)

범위는 `feat/issue-153-g7-runtime`, 후보0.44.0의 실제 소스 구현·로컬/격리 시험·PR CI 시작까지다. 기존 main `a7af4aa`를 기준으로 구현했으며 실제 운영 데이터/설정/기능 활성화·정식 게시·Tag·병합·배포는 수행하지 않았다. GitHub PR 최신 HEAD CI의 시작은 결과 SUCCESS가 아니다.

| 검증 | 실제 결과·범위 |
| --- | --- |
| 최종 Typecheck | PASS (`npm run typecheck`, Build 완료 후 순차 실행) |
| 최종 ESLint | PASS, 오류0/기존 경고6; 변경 파일 검사도 PASS |
| 최종 전체 Vitest | **82파일/582개 PASS**,257.22초. Runtime Auth11/CAD16/Gate12/Migration12/client6 등 신규57개 포함 |
| Production Build | PASS, 실제 `/api/g7-runtime/**`와 `/g7-runtime` 포함, JSON native ESM 경고 수정 후 성공 |
| 주요 기존 Chromium | **18/18 PASS**,51.0초. 등록/Current/삭제·양쪽 DXF Renderer·로딩/복구·메뉴/Drawer·기본 OFF 회귀 |
| 실제 Runtime ON Chromium | **1/1 PASS**,10.8초. 실제 서명 합성 승인+7 Migration DB에서 로그인/발급/Role·Site Grant/Audit/회수/초기 변경/Editor 로그인→CAD UI 등록201→익명 원본 byte동등GET200→Current→기존 비밀번호 DELETE→Logout |
| 화면 검증 |390/768/1024/1440/1920px 문서overflow0·표header정렬·Audit행높이<=160px·390px 표 내부 스크롤 PASS. 합성 화면 캡처 시각 점검 완료 |
| DWG 독립 Chromium | **4/4 PASS**,23.2초. 공개 upstream 고정 revision+SHA 검증 sample만 사용, 등록DWG/LINE/WASM/free/unlink/partial·손상/재시도 |
| Legacy Migration E2E | **1/1 PASS**,13.9초. 실제 pre-0.25 DB migration 및 모든 이력 재분류 |
| Docker 앱·Migrator | 로컬 build PASS. nonroot native SQLite 및 Prisma CLI/tsx import 검사 포함; 기본 Migrator CMD는 기존6개 유지 |
| Docker Runtime ON | PASS. 합성 private Trust/Owner 서명·동일 승인 경로를 container에 mount, packaged G2 bootstrap, initial change/login/Site허용·교차Site거부/Audit·재시작 권한보존·세션회수 실제 실행 |
| Docker 기본 OFF | PASS. 별도 disposable volume에 실제6 Migration→CAD등록→앱정지/같은Migrator재실행→앱재시작→원본·SQLite보존 및 삭제검증, volume정리 |
| Docker 관련 보조 시험 | Python layer audit10 PASS/1환경조건 Skip(Python3.14 zstd 기존조건), OCI통계 Node3/3 PASS. 핵심 테스트의 신규Skip/Assertion삭제 없음 |
| GitHub PR CI | 아직 이 문서 작성 시 결과 NOT TESTED. 최신 PR/HEAD/Run ID·URL은 #153 최종 댓글과 PR 메타데이터에 기록하며 시작 이후 결과를 모니터링하지 않는다 |

### 이전 실패·원인 미확정 관측

최초 전체 Vitest577/578 FAIL, Native JSON 로딩, fixture UUID·FK·타입·시간 주입, Next streamed notFound HTTP200, Playwright trace 출력 경합, 동시 Build/Typecheck 생성파일 경합과 실제 DELETE 세션 조회 경쟁 조건을 [FailureLedger](FailureLedger.md)에 누적 보존했다. 최초Chromium91/92의 trace ENOENT를 최종18/18이나 전체92/92 성공으로 바꾸지 않는다.

별도 QA의 초기 CAD 등록 G7_RUNTIME_BLOCKED1회는 원인 미확정이다. 이후 해당 시험의 새 Fixture 진단21회와 최종CAD16개 및 전체582개에서는 재현되지 않았다. 일시적 거부를 특정 원인으로 확정하거나 최초FAIL을 삭제하지 않는다. 해당 요청은 fail-closed로 commit되지 않았다. 실제 DELETE401 경합은 DB두연결 RED→GREEN 및 실제 브라우저 성공으로 구분하여 확인했다.

### 구현·재사용 및 문서 정합성

기존 G2 최초/복구, G3 scrypt/Session/Cookie/CSRF/limiter, G4 Role/Site/Audit transaction, S3-3 실제 CAD Repository/Storage와 격리7SQL을 재사용했다. 새 Runtime Gate/라우트·관리UI·gated operator Migration/실제 Snapshot Restore를 연결했으며 기존 pure preflight/R0의 runtimeActivated=false, 활성CAD6SQL, Compose/Nginx/.env, Viewer 원본·Version·Current·삭제 암호를 보존했다. AGENTS·Requirements·Architecture·Decisions·Database·Operation·TestPlan·FailureLedger·Issue96/109·ChangeLog·README와 Runtime Runbook을 갱신했다.

실제 Agent 실행은 Manager와 별도 backend/infra/frontend/qa_docs 작업 세션의 역할 분담이다. `/root/qa_review`는 별도 기술 검토 Agent이며 인간 승인으로 보고하지 않는다. 최신 Owner Managed 정책 적용, 별도 인간/반복 승인을 요구하지 않았다. 원격 CI SUCCESS/Manager 최종 병합ACCEPT는 이번 로컬PASS로 대체하지 않는다.

### 운영 선행조건과 미실행

실제 Registry/실행 OCI 출처·고정 App/Migrator+rollback pair, 현장 신뢰키/릴리스 등록, 실제 Writer Zero·동일 SQLite/Local CAD/versioned S3 Snapshot·원격S3 복원, 이전 실제OCI 이미지 실행·현장LAN/운영RTO/RPO·서비스 전환은 **NOT TESTED**다. 실제 운영 Migration/Writer중지/설정 변경/Auth·CAD Write ON·GHCR/Tag/병합/배포를 실행하지 않았다. 계정 enable은 기존Audit Schema에 없어 제공하지 않으며, 활성 Admin 복구·비활성화·회수 경로를 제공한다. #153/#109/#96 실제 운영 AC는 OPEN 상태를 유지한다.

## #154 S3-5-R0 — Owner 현장 완료 보고·합성 릴리스 서명 검사 준비 (2026-10-28)

- **관측 선행:** #151 C0 [Main SHA `013effd65a68879d94d18c4928db8c600e8e9589`](https://github.com/planner77/layoutManager/commit/013effd65a68879d94d18c4928db8c600e8e9589), [Main CI #40641999215](https://github.com/planner77/layoutManager/actions/runs/40641999215) completed SUCCESS, release-scope SUCCESS, GHCR Build/Push SKIPPED. #152 최초 E2E 실패와 보완 이력은 `out/FailureLedger.md`에 보존.
- **현장:** 사용자가 B2/C Owner Managed 수용 완료 보고, 외부에서 기술 증거를 열람/수집하지 않았으므로 `OWNER_ATTESTED_FIELD_ACCEPTANCE_COMPLETE`와 `NOT_EXTERNALLY_VERIFIED`를 함께 기재. 개별 OCI/source/SNAP/Restore/QA 원본·서명을 요청하거나 가짜 PASS로 표시하지 않는다.
- **신규 작업:** [Issue #154](https://github.com/planner77/layoutManager/issues/154) 단일 릴리스 Owner Decision Offline Pure Verifier + 합성/악성 Vitest·Runbook/정확 15-path GHCR gate 개발. 소스 작성/Commit/PR 자체는 Typecheck/Test/CI 성공 근거가 아님. 신규 HEAD CI/리뷰 결과는 실제 관측 전 `NOT VERIFIED`.
- 실제 S3-5 GO 발급, 운영 인증/쓰기/정식 Migration/배포/OCI 이미지 게시·Site data access 모두 **NOT RUN**, #153/#109/#96 OPEN/BLOCKED.

## #151 / PR #152 — E2E 1건 실패 분석 및 재검증 준비 (2026-10-28)

- [PR CI #40638297319](https://github.com/planner77/layoutManager/actions/runs/40638297319) exact HEAD `c31036cd94b81118f8064591c9b8b74c7cd5e246`, attempt 1 `completed/failure`: Verify Job `122650294939` Typecheck/Lint/Unit·Integration(C0 합성 10건 포함)/OCI/DXF/Production Build SUCCESS, Playwright Chromium **91 passed / 1 failed** at `src/tests/e2e/issues124-126-127.spec.ts:150` `TC-126-RECOVERY`: `Expected:1, Received:2` source GET 시작 횟수; Legacy Migration E2E SKIPPED. Docker/Migration/Smoke Job `122650294554` SUCCESS. 실제 GET 2건 완료/abort 여부는 Log만으로 판정 불가.
- 보완은 기존 E2E 한 곳의 완료/취소/시작 Network 이벤트 정확 계측: 성공 원본 완료 다운로드 **정확 1개**, 이전 요청 취소 최대 1개(Abort error reason), 진행 중 미종료/진짜 2 Completed GET/렌더러 오류는 실패 유지. S3-4-C0 source/auth/site code 변경 없음. 정확 no-GHCR 16-path = 기존 15개 + `src/tests/e2e/issues124-126-127.spec.ts`; GHCR Unit negative/positive 재검증.
- **아직 새 HEAD CI 전:** 이 수정의 Typecheck/Lint/Unit/E2E/Docker/Build 결과는 실제 Run 완료 전 `NOT VERIFIED`, 과거 실패를 PASS로 재해석하지 않음. User Owner Managed risk acceptance는 Test assertion 계측·미게시 좁은 경로에만 한정. 실제 사이트 B2 증거/현장 Independent QA/실 Restore/Rollback/S3-4-C trust/운영 GO 미확인, 모든 활성 플래그 false.

## #151 S3-4-C0 — 현장 Owner Managed 비반출 정책 수용·합성 코드 준비 (2026-10-28)

- **확인된 선행 CI:** #142 S3-4-B2-5 [PR #149](https://github.com/planner77/layoutManager/pull/149) 최종 Squash Main `8ea0a3088e3dc10ae340cf5a095375f626519e1e`, [Main CI #40636610114](https://github.com/planner77/layoutManager/actions/runs/40636610114) completed SUCCESS, Release-scope Job `122644923176` SUCCESS, GHCR Build/push Job `122644968384` SKIPPED. 기존 PR #149 Run 40613450861 Attempts 1/2/3 Docker TAR 오류/후속 SKIPPED는 FailureLedger에 계속 보존.
- **사용자 현장 정책/허용 범위:** 시험 프로그램/Runbook·합성 검증 자료는 사내 현장 반입 가능, 실 증거 원본·해시·실 EV/QA/SNAP/CR·OCI manifest/키/서명/경로 등 현장 밖 반출 금지, Owner Managed 내부 증거 수용. 사내 실제 원본·서명·증거를 본 Assistant는 확인하지 못했으므로 **현장 증거 인증/물리 Restore·Rollback PASS/운영 GO는 NOT VERIFIED/NOT RUN**.
- **새 S3-4-C0 준비(현재 실제 CI 전):** `src/server/g7-operational/s3-4-c.ts` 순수 내부 사용 17 Receipt SHA + 별도 Owner/QA Ed25519 public trust keys + release/snapshot binding 서명 검증 모듈과 합성 Vitest 10개 사례·Runbook/15-path GHCR 가드 작성. 코드 작성만으로 Unit PASS를 주장하지 않으며 최신 PR HEAD CI는 새 Run 실행 후 검증 필요.
- **결과의 의미:** 잠재적 합성 양성도 `LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO`; Source/Registry 실제 출처·독립 서명자 신원·현장 실 7 migration/Restore/Rollback·Owner GO=false. #151 및 #142/#109/#96 OPEN/BLOCKED, 운영 Auth/CAD Write OFF, GHCR/Prisma/Compose/Nginx/실 데이터 접근 없음.

## #142 PR #149 — #150 Main CI 선행 완료·B2-5 새 HEAD 검증 예정 (2026-10-28)

- [PR #150](https://github.com/planner77/layoutManager/pull/150) Main `dec723ca6512488d7d45148762fbe1e6395790a6`, [Main CI #40631046297](https://github.com/planner77/layoutManager/actions/runs/40631046297): attempt 1 `completed/success`, Release scope Job `122627234234` SUCCESS, GHCR Job `122627277997` SKIPPED. #67 Docker layer parser `r|*` 및 합성 손상·압축 Layer 검증이 선행 보완되었으나 이것이 B2-5 최종 통과는 아님.
- PR #149 구 HEAD `915b1509a82ad1af6d723ed42cc8a3c733fc72b5` Run #40613450861 attempts 1·2·3 Docker 오류/후속 검증 SKIPPED 기록을 보존. 새로운 Main과 B2-5 기능 양쪽 추가 내용 및 2개 GHCR Guard를 병합하고 새 PR CI 시작 예정, 새 HEAD의 Typecheck/Lint/Vitest/E2E/OCI/Docker/Migrator/Smoke 결과는 관측 전 `NOT VERIFIED`.
- Owner Managed QA 경로는 사용자 승인이나 실제 독립 Reviewer/현장 출처 증명은 아니며, 자동 Codex quota 실패를 PASS로 처리하지 않는다. 운영 OCI Registry·Writer·SQLite/CAD/S3/Prisma Migration·Restore/Rollback·GHCR 게시·Auth/CAD Write/Owner GO `NOT RUN`, #142/#109/#96 OPEN/BLOCKED.

## #142 B2-5 첫 PR CI #40612247712 — Docker layer 감사 실패, 후속 검증 대기 (2026-10-28)

- PR #149 첫 HEAD 12eac574b5e940dbaaea53e292c463b6e191283e, 최초 CI Run 40612247712의 Docker Job 122566350868: Verify web layer SHA 단계에서 src/scripts/audit_standalone_layers.py의 nested Docker TAR tarfile.ReadError invalid header 발생. 기존 Issue #67 감사 도구의 실제 실패이며 B2-5 합성 Unit 실패라고 해석하지 않는다. 첫 Verify Job의 최종 결과는 관측 전 NOT VERIFIED.
- 증거 참조: 실패 원장에 초기 Run/Job/HEAD/오류 근거 보존. 소스 Epoch/CR ID도 17개 PASS 증거와 정확 연결하도록 수정한 신규 HEAD의 Typecheck/Lint/Unit/Build/E2E/Docker/Main 비게시 여부는 새로운 CI 후 판단.
- 실 Site Source/OCI/QA/동일 SNAP/물리 Restore-Rollback/운영 GO 전부 미검증. #142/#109/#96 BLOCKED.

## #142 B2-4 Main CI 최종 검증 및 B2-5 시험 작성 (2026-10-28)

- B2-4: 최신 PR #147 HEAD a59d18b10a103fe863752d460dff216b62b5fe43, PR CI #40604028179 SUCCESS(Verify 및 Docker), reviewer Codex quota 실패/Owner Managed 사용자 승인; unresolved=0. Squash Main 81fd00ba9a7463f0b1817d83ca78fe9cc31f5b4d, Main CI #40610619799 SUCCESS, Release-scope #122560987574 SUCCESS, GHCR Build/push #122561027937 SKIPPED. 신규 이미지 게시 없음.
- B2-5 합성 검증기/Unit 및 GHCR guard Test 작성. 완전 합성 EV/QA/SNAP·OCI 릴리스 참조 정합성 성공도 현장 인증 실패 플래그 false, 누락·중복·불일치·실패/취소·NOT_RUN·Secret 유출 차단·15-Path 검사 설계. 신규 CI 실행 결과 확인 전 PASS 주장 불가.
- 실제 Site Writer/DB/CAD/S3/OCI 출처/물리 Restore·Rollback/RTO/RPO 및 Owner·독립 QA는 NOT RUN; #142/#109/#96 BLOCKED.

## #142 / PR #149 — #67 Docker 레이어 감사 Attempts 1~3 및 독립 호환성 보완 (2026-10-28)

- **관측 실패:** Run [40613450861](https://github.com/planner77/layoutManager/actions/runs/40613450861), HEAD `915b1509a82ad1af6d723ed42cc8a3c733fc72b5`, attempts 1/2/3 모두 Docker [122570517278](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122570517278)/[122601918388](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122601918388)/[122607804124](https://github.com/planner77/layoutManager/actions/runs/40613450861/job/122607804124) FAIL: `Verify web layer SHA, native and transition-only size saving`의 `tarfile.ReadError: invalid header` at `src/scripts/audit_standalone_layers.py:29`. 세 Verify Job Typecheck/Lint/Unit·Integration/Build/E2E SUCCESS; Docker 후속 Native/Migrator/Compose Smoke는 SKIPPED, 실제 SHA 감사 검증 미완료.
- 실패 Runner Ubuntu 26.04, Docker 29.4.2, Python 3.14; 이전 성공 Ubuntu 24.04, Docker 28.0.4. 원인 후보는 비압축 `r|` 파서와 변경된 Docker image-store export 레이어의 압축 불일치. 현장 Layer Header 부재이므로 압축으로 **확정하지 않음**.
- **합성 회귀 구현, CI 결과 미확인:** `r|*`로 Python 지원 포맷 자동 감지, 압축 Nested gzip/bzip2/xz 및 조건부 zstd SHA/중복 검사, 손상된 Layer 거부 회귀 추가; Docker 없이 한정 fixture 검증만 수행한 단계. PR CI 결과가 확인되기 전에는 성공 기록 금지. `compare_inventories`와 Native SHA/중복/Size Gate는 변경하지 않음.
- **승인 경계:** 실제 B2-5 PR #149의 15-path no-GHCR 보호 유지. 별도 8-path CI-only PR에서만 수정하고 Main/PR #149 재정렬은 이후 분리된 승인 게이트. 운영 CAD/DB/S3/OCI/Prisma/Migration/Restore·Rollback/GHCR/Auth/CAD Write/Owner GO NOT RUN, #142/#109/#96 OPEN/BLOCKED.

## #142 B2-4 PR #147 — 초기 Typecheck 실패 및 Main #82 재정렬 (2026-10-28)

- [PR CI #40579106887](https://github.com/planner77/layoutManager/actions/runs/40579106887), HEAD `5d7055c8c72d800005509557ee137c76a9d87aad`: Verify Job 122453396943 **FAILED** (`tests/integration/g7-s3-4-b2-4.test.ts:93,96` TS2322 `Buffer<ArrayBufferLike>` vs `Buffer<ArrayBuffer>`), Docker Job 122453396404 SUCCESS. Typecheck 이후 Lint/Unit/Integration/Build/E2E 검증 **SKIPPED**, B2-4 synthetic PASS 아직 CI로 입증되지 않음.
- Fixture `baseline/candidate` 변수 타입을 `Buffer`로 명시하여 serialize 결과와 호환되도록 수정; 신뢰 플래그나 바이트/SQL 변경 없음. Issue #82 Main `dbe55c87`의 Memo/0.43.0/문서/시험 내역을 보존하고 B2-4 15-path만 PR에 유지. 새 PR CI는 시작 후 **NOT VERIFIED**, 최신 Codex/충돌/스레드/behind 별도 판정.
- 실제 Source same-SNAP, OCI Registry provenance, App/Migrator 실행, 물리적 Restore/Rollback, RTO/RPO, 현장 Writer·DB·CAD·S3/운영 Auth·CAD Write/Owner GO는 `NOT RUN`; #142/#109/#96 BLOCKED.

## #142 B2-4 — 합성 Restore/Rollback Replay 테스트 작성·실행 미확인 (2026-10-28)

- **선행 완료 증거:** B2-3 [PR #146](https://github.com/planner77/layoutManager/pull/146) Main `7b784c2d62c0872909361e3514d437247d7ab662`, [Main CI #40575203195](https://github.com/planner77/layoutManager/actions/runs/40575203195) completed/success, release-scope SUCCESS/GHCR Build/push SKIPPED.
- 신규 `inspectS34B24DisposableReplay` 소스는 제공된 Synthetic OCI 4-role manifests/configs, SNAP/Epoch/S3 Marker claims, Source/7th Auth Candidate/Rollback 세 SQLite Buffer와 Local CAD/S3 Export Buffer를 대조하는 논리를 **작성**. 기존 B2-1·B2-3 verifier 결과를 재사용하고 Rollback SQLite Byte=Source Byte, Local/S3 Version/Locator/S3Version/Byte 일치, 8 Auth/Audit·FK·Current·SHA 등 불변식. test `g7-s3-4-b2-4.test.ts`는 정상 합성·S3 marker/OCI labels·중단 후보·부분 복원·Local/S3 손상·롤백 SQLite 불일치·객체 누락/중복·Snapshot 오류 음성 케이스를 **작성**. 새 HEAD Typecheck/Vitest/Prisma CLI/Docker/Build/E2E/PR CI 성적은 실행을 확인하기 전 `NOT VERIFIED`, 코드 작성은 PASS가 아님.
- **출처/운영 NO-GO:** 이 검증기는 실제 restore/rollback 이미지 실행이나 S3/DB 원본 캡처를 하지 않으며 `rollbackCompatible/sameSnapshotRestored/restoreExecuted/rollbackExecuted/operationalGo/runtimeActivated=false`. 현장 RTO/RPO, QA 서명, EV-ID/Source Provenance 주장 금지; 운영 DB/CAD/S3/Writer·Prisma·GHCR/배포 `NOT RUN`. #142/#109/#96 OPEN/BLOCKED. [B2-4 Runbook](../src/deploy/g7-s3/S3-4-B2-4.md).

## #82 PR #111 — Mobile Drawer E2E 실패, 새 검증 필요 (2026-10-28)

- [PR CI #40583276569](https://github.com/planner77/layoutManager/actions/runs/40583276569), attempt 1, HEAD `53b6909caaad4721c9050a6d26ec1da940176b05`: Verify [Job 122468046935](https://github.com/planner77/layoutManager/actions/runs/40583276569/job/122468046935) Chromium E2E 92건 중 **91 PASS/1 FAIL**, Legacy Migration E2E SKIPPED, Typecheck/Lint/Unit·Integration/OCI/DXF benchmark/Build SUCCESS. Docker/Migration/Runtime Smoke [Job 122468046482](https://github.com/planner77/layoutManager/actions/runs/40583276569/job/122468046482) SUCCESS. [Trace Artifact #12770224877](https://github.com/planner77/layoutManager/actions/runs/40583276569/artifacts/12770224877).
- **분석:** `TC-M1-E2E-001` `src/tests/e2e/issue82-cad-memo.spec.ts:72`에서 viewport 390px 전환 직후 `clickViewerCommand(page,'view','화면 맞춤')`이 `viewer-menu-helper.ts:25`의 trigger click에서 30초 timeout. Playwright는 상단 `보기` 버튼 자체가 visible/enabled/stable이지만 **`cad-viewer-shell`이 pointer events를 intercept**했다고 보고. #127 모바일 Drawer의 modal 전환 시 `header.inert=true`는 정상; helper의 일회성 `isVisible()` 판정이 React `matchMedia`의 비동기 state 갱신보다 먼저 실행된 테스트 동기화 race. WCS/원본/Renderer/운영 장애의 증거는 아님.
- **수정:** E2E만 수정: 390px 설정 이후 `viewer-tools-dock[role=dialog]` 출현·`header.inert=true` 확인 → 모달의 실제 `도구 닫기` 버튼 클릭 → Drawer 사라짐·`header.inert=false` 확인 → `보기 > 화면 맞춤` 실행. 이후 PIN WCS(10,20)→명시적 (13,15) 이동과 텍스트 편집/좌표 불변을 그대로 검증. `force click` 및 단순 Timeout 증가 금지. Viewer/Adapter/CAD·DB·API·Prisma/G7 및 package/lock 0.43.0은 변경하지 않음. #138 Movable Panel은 별도 미구현. 수정 HEAD PR CI PASS는 새 Run 완료 전 **NOT VERIFIED**, GHCR/병합/Main CI/Issue 종료·실 CAD/GPU 현장 시험은 미실행.
- 이전 HEAD/CI 결과와 신규 코드의 검증 상태를 구분. 실제 현장 CAD/GPU·M2 서버 영속 및 운영 G7 GO는 NOT RUN.


## Issue #82 — v0.43.0 신규 GHCR Pair 버전 정렬 / 재검증 대기 (2026-10-28)

- 원 HEAD `4a4a8ffbb85340efef90b88546cc64815fdd4aa3`의 [PR CI 40580691233](https://github.com/planner77/layoutManager/actions/runs/40580691233) **completed/success**, Verify Job 122458944225 전체 Typecheck/Lint/Unit/E2E/Legacy 성공, Docker Job 122458943642 SUCCESS, 리뷰 2/2 Resolved, Main behind=0, mergeable=clean. 기존 실패 Run 40512645193의 91/92 E2E 및 교정 증거는 [FailureLedger](FailureLedger.md)에 유지.
- `v0.42.1` 기존 태그 `23d7b74132dc56073656002750eeea550875e1a7` 확인(annotated object points to `dc82e670...`); 신규 UI에 기존 Version/tag/pair 재사용하지 않도록 `0.43.0` 앱/lock 메타데이터 정렬. `v0.43.0` ref 미존재는 조회 당시 사실이며 GHCR 신규 이미지 출판 증거는 아님.
- 수정 후 HEAD PR CI/최신 리뷰/정식 Main CI/GHCR Pair 및 실제 현장 WCS·GPU·DB/S3는 **NOT VERIFIED/NOT RUN**. Github CI 성공 전 병합·GHCR 게시 성공·이슈 종료를 주장하지 않음. #83 Memo M2 및 G7 운영 OFF.

## #142 B2-3 / PR #146 — Audit's AFTER RAISE(FAIL) P2 보완·새 CI 미확인 (2026-10-28)

- [PR CI #40513422160](https://github.com/planner77/layoutManager/actions/runs/40513422160) HEAD `adf0e1aba89a9a5a3b8d7c33b85f5675f4201b71`, attempt=1, `completed/success`. Verify Job 122220852265, Docker/Migration/Smoke Job 122220852790 두 건 성공. **이전 HEAD의 실행 근거**이고 새 변경의 합격 근거는 아님.
- [Codex P2 #4389353517](https://github.com/planner77/layoutManager/pull/146#discussion_r4389353517) 분석: SQLite `AFTER UPDATE/DELETE`의 `RAISE(FAIL)`은 예외로 표시돼도 AuditEvent 행 수정·삭제가 실제로 남을 수 있음. 기존 예외 카운트 기반 검증기의 `auditAppendOnlyChecked=true` 허위 PASS 가능성. 메모리 SQLite에서 UPDATE 예외 후 값이 변경되고 DELETE 예외 후 행이 삭제되는 동작을 별도 확인함.
- **보완 구현·회귀 작성:** 합성 Audit Row 포함 **전체 AuditEvent ordered rows** 최초 Snapshot → UPDATE 예외·내용 불변 확인 → DELETE 예외·내용 불변 재확인. AFTER UPDATE+FAIL, AFTER DELETE+FAIL 각각의 별도 손상 합성 통합 테스트는 `AUDIT_NOT_APPEND_ONLY/BLOCKED`와 `auditAppendOnlyChecked=false`를 기대. 실제 새 HEAD Typecheck/Vitest/Prisma CLI/Docker/E2E/PR CI 결과는 **NOT VERIFIED**, 코드 작성과 CI 성공 구분.
- 운영 DB/CAD/S3·Writer 정지·실 Audit/Restore/Rollback·Prisma 활성 Migration·GHCR/GO 미실행. #142/#109/#96 OPEN/BLOCKED. [Runbook](../src/deploy/g7-s3/S3-4-B2-3.md).

## Issue #142 / PR #146 — 첫 PR CI Typecheck 실패 및 P2 보완, 신규 HEAD 미검증 (2026-10-27 KST)

- [PR CI #40511480917](https://github.com/planner77/layoutManager/actions/runs/40511480917), attempt 1, HEAD `bafe74cceba07a789a328c2453ccd785f19b4597` `completed/failure`. Verify Job 122214239302 TypeScript `TS2769` line 62 / `TS2345` line 63; Docker Job 122214238943 baseline Next.js Build에도 동일 TS Error. ESLint/Unit/Integration/Production Build/E2E 및 Docker phase1/Runtime Smoke 이후 미실행. 두 실패의 직접 원인은 단일 `Boolean(v)` 비내로잉, `v!==null` 교정은 신규 HEAD 검증 전 `NOT VERIFIED`.
- [Codex P2 #4389209602](https://github.com/planner77/layoutManager/pull/146#discussion_r4389209602): 실제 Local Storage Locator의 첫 UUID는 DB `location_id`, 두 번째 UUID는 `CadFileVersion.id`여야 함. 기존 string↔packet 동치만으로 허위 PASS 가능. Local 경로 두 Segment를 DB Row에 결합해 검사, before/after SQLite에 **동일하게 잘못된** Location·Version Locator를 심고 합성 Asset Path까지 일치시킨 음성 테스트를 **작성**. 실제 테스트를 돌린 것처럼 PASS라 쓰지 않음.
- 수정 HEAD의 Typecheck/Lint/Vitest/Build/E2E/Prisma History 및 Docker Job 신규 결과는 새 CI 종료/실제 Run 관측 전 `NOT VERIFIED`. Source Site/WAL/실 S3 GET·Restore/Rollback·운영 Auth/Write/GHCR `NOT RUN`, Issue #142/#109/#96 OPEN/BLOCKED.

## #142 B2-3 — 합성 7 Migration 테스트 작성·실행 결과 미검증 (2026-10-27)

- 선행 B2-2B PR #145 Main `d2b77dd6535503f2d980ac563cc195cc8b4c128e`, [Main CI #40506886341](https://github.com/planner77/layoutManager/actions/runs/40506886341) SUCCESS, release-scope SUCCESS/GHCR SKIPPED.
- 신규 검증기 `assessS34B23DisposableMigration`는 합성 SQLite before/after Buffer의 전체 CAD 7 Table/Current/Version/nextVersion/FK/QuickCheck 및 Local/S3-export Bytes SHA/Size·8 Auth Table/Audit Trigger 기능 검사 코드를 **작성**. 새 Integration Test에 guarded formal Prisma 7 Migration History, seeded 6→7 SQL, 누락·변조·FK·가짜 Trigger·Transaction ABORT 음성 사례 **작성**. 실제 새 SHA의 Typecheck/Lint/Vitest/Prisma CLI/Build/E2E/PR CI 결과는 **아직 NOT VERIFIED**; 작성 사실을 PASS라고 표현하지 않는다.
- 실 운영 Writer/SQLite Online Backup/CAD/S3 Versioned GET/OCI·복구/Rollback/Owner GO는 `NOT RUN`. 합성 `DISPOSABLE_SEVEN_SCHEMA_INVARIANTS_ONLY`가 Site Source Proof나 운영 Auth/CAD Write 수용은 아니다. #142/#109/#96 OPEN/BLOCKED. [Runbook](../src/deploy/g7-s3/S3-4-B2-3.md).

## Issue #82 / PR #111 — U1 E2E aria-disabled 속성 오탐 (2026-10-28 KST)

- **관측:** [Run #40512645193](https://github.com/planner77/layoutManager/actions/runs/40512645193) HEAD `89a72018403ebfca32e382e0f04511a95d1946ae`, Verify Job 122218176649 FAILURE. Typecheck/Lint/Unit·Integration/OCI/Synthetic DXF Benchmark/Production Build PASS, Chromium E2E **91/92 PASS, 1 FAIL**, Legacy Migration E2E SKIPPED. Docker/Migration/Runtime Smoke Job 122218177009 SUCCESS. Trace Artifact 12739315008.
- **실패/보완:** `TC-U1-E2E-001` three-dxf-viewer 메모 메뉴 enabled인데 `aria-disabled=false` 속성을 요구하여 FAILED (실제 속성 없음은 정상 `ViewerCommandMenus` 계약). Test assertion만 `toBeEnabled()` / 비지원 `toBeDisabled()` 및 명시적 `aria-disabled=true`로 보완. 앱/Renderer/도메인 코드 변경 0, U1·M1 E2E 수용 기준과 #127 메뉴 그룹 정책 보존.
- **최신 HEAD 상태:** 이 변경 직후 전체 E2E/CI는 새 Run 완료 전 **NOT VERIFIED**. 운영 서버 기능·실 CAD/GPU·#138 panel 실제 drag·Memo M2 서버 영속·GHCR 게시/PR 병합은 NOT RUN. 원본 Run/Job/분석은 [FailureLedger](FailureLedger.md) 참조.

## #142 PR #145 — 신규 P2 중복 S3 Locator 회귀 작성 / 최종 CI 전 (2026-10-27)

- [PR CI #40502175608](https://github.com/planner77/layoutManager/actions/runs/40502175608), attempt=1, HEAD `cddd2f20dc45c1f3d7edc42e15f0b914016a078d` SUCCESS (Verify Job 122182315944, Docker Job 122182315606). 이 **과거 SHA의 성공**과 [Codex P2 #4388575128](https://github.com/planner77/layoutManager/pull/145#discussion_r4388575128)은 구분한다.
- `DUPLICATE_S3_LOCATOR` 전역 검사 및 정상 독립 S3 객체 UUID/DB Version UUID/서로 다른 S3 locators 합성 양성 Fixture, DB Unique Index가 없는 격리 SQLite의 동일 locator 2-DB-Version 악성 Fixture를 추가 **작성**. B2-2A Packet은 정상으로 유지해 B2-2B의 Unique 검사 자체를 시험한다. 수정 HEAD Typecheck/Vitest/Lint/E2E/PR CI 결과는 실제 Run 확인 전 **NOT VERIFIED**, Site Writer/S3/원본 Snapshot 실제 시험은 **NOT RUN**.
- DB/CAD/S3 원본·유효한 live Object VersionId/Owner GO 입증 없음. `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF` 외의 양성/운영 수용은 불가. #142/#109/#96 OPEN/BLOCKED.

## #142 PR #145 — P2 S3 객체/DB UUID 분리 수정 검증 대기 (2026-10-27)

- 기존 [PR CI #40499605822](https://github.com/planner77/layoutManager/actions/runs/40499605822), HEAD `0f0c6aaebf97636010ae6dfec91d436c1d329c37` `completed/success`; Verify Job 122173675351, Docker Job 122173675644 모두 SUCCESS. **코드 리뷰 P2는 CI 실패가 아님.**
- [Codex P2 #4388372985](https://github.com/planner77/layoutManager/pull/145#discussion_r4388372985)는 S3 Object UUID와 DB Version UUID 독립 생성 사실을 지적. `ObservedObject.s3ObjectLocator` 매핑으로 DB `storage_path`와 비교하도록 수정, 올바른 독립 UUID 양성 Fixture 및 Bucket/UUID 오배정·필드 누락·비인가 URI·Local S3 locator 오염을 검출하는 합성 테스트를 **추가 작성**. 실제 수정 HEAD의 Typecheck/Vitest/E2E/PR CI 결과는 새 Run 관측 전 `NOT VERIFIED`.
- 합성 성공도 `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF`; 실제 Site Writer lock·SQLite online backup·S3 versioned 원본 인증·영속 DB/CAD·B2-3~5/G7 Owner GO는 여전히 `NOT RUN/BLOCKED`.

## #142 B2-2B — 격리 합성 증거 도구 작성 / 신규 CI 미관측 (2026-10-27)

- 선행 B2-2A [PR #144](https://github.com/planner77/layoutManager/pull/144) Main `e043d56d43099034906cccf0bb1cc1c7a76bb11f`, [Main CI #40496032085](https://github.com/planner77/layoutManager/actions/runs/40496032085) SUCCESS / release-scope SUCCESS / GHCR SKIPPED.
- 새 `inspectS34B22BDisposableBytes`는 합성 SQLite Buffer/Local CAD/S3 export·Marker/VersionId/DB mapping의 내용 hash/Current/FK 음성 검증 테스트를 **작성**했다. 원본 Writer/Online Backup/S3 authoritative GET/실 Snapshot/Restore/Rollback **NOT RUN**, 긍정도 `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF`이다. Typecheck/Vitest/Lint/Build/E2E·PR CI는 실제 Run 관측 전 `NOT VERIFIED`.
- #142/#109/#96 OPEN/BLOCKED, 운영 Auth/CAD Write·GHCR 게시/active migration OFF. [B2-2B Runbook](../src/deploy/g7-s3/S3-4-B2-2B.md).

## Issue #142 / PR #144 — TypeScript 검사 3건 실패·Fixture 타입 보완 (2026-10-27 KST)

- [PR CI Run 40492242157](https://github.com/planner77/layoutManager/actions/runs/40492242157), attempt 1, HEAD `808f7b40de4dd2686888b17d7f010784a6e293c6` **completed/failure**. Verify [Job 122148776521](https://github.com/planner77/layoutManager/actions/runs/40492242157/job/122148776521) `npm run typecheck` 실패: `g7-s3-4-b2-capture.test.ts:83,88,96` TS2339(로컬 Version과 S3 Version이 서로 다른 Shape인데 Fixture `versions:[v1,v2]`가 Union Array로 추론됨). 이후 ESLint/Unit/Build/E2E **SKIPPED**; Docker/Migration/Smoke [Job 122148776302](https://github.com/planner77/layoutManager/actions/runs/40492242157/job/122148776302) **SUCCESS**.
- **수정:** Fixture만 `const versions:[typeof v1,typeof v2]=[v1,v2]` 튜플로 정적 구분하고 기존 반환 객체는 `versions`를 사용한다. Test 데이터/런타임/신뢰 경계 동일. 최소 Tuple TypeScript 샘플 별도 컴파일 PASS이나 실제 프로젝트 Typecheck 및 전체 CI는 새 HEAD 결과 확인 전 `NOT VERIFIED`.
- Main behind 0/mergeable true, Codex 이전 HEAD `808f7b4` Review completed/findings 0 및 기존 P2 스레드 2건 Resolved. 새 SHA의 재리뷰·CI는 별도 게이트. 실 사내 writer/DB/CAD/S3/Registry·Restore/Rollback·운영 Auth/Write/GHCR/GO는 **NOT RUN**, #142/#109/#96 OPEN/BLOCKED.

## #142 B2-2A 시작 — 새 HEAD PR CI 미관측 (2026-10-27)

- B2-1 PR #143 Main `2d29b8572b02ccacf5e0032bf5432cb2f2b26ed6`, Main CI #40483297907 SUCCESS/GHCR SKIPPED. B2-2A 순수 Snapshot Barrier 주장 검증·합성 Unit 및 no-GHCR 15-path guard/Runbook 작성.
- 현재 단계에서 실제 Writer quiescence, SQLite 온라인 일관 백업, 원본 CAD byte hash, versioned S3 marker/objects 독립 관측/실복구/rollback **전부 NOT RUN**. 패킷 검사 성공도 Source Verified 아님. 새 PR CI 결과 확인 전 `NOT VERIFIED`, #109/#96 운영 OPEN/BLOCKED.

## #142 S3-4-B2-1 착수 / PR CI 미관측 (2026-10-27)

- 선행 #141 B1 Main `7469d016a5926aca07929bf3e95e869b46716bd1`, [Main CI #40478523325](https://github.com/planner77/layoutManager/actions/runs/40478523325) `completed/success`, release-scope SUCCESS, GHCR Build/Push SKIPPED.
- OCI manifest/config SHA+Source+Version+Role consistency 순수 코드와 합성 실패 탐지 Unit, GHCR no-publish exact scope regression 작성. 새 PR CI/Typecheck/Unit 결과는 **아직 검증하지 않음**. 실제 Registry provenance/서명 및 B2-2~5 실행 없음. 합성 PASS를 실제 OCI/운영 GO로 표시하지 않음.
- #109/#96 OPEN/BLOCKED, 운영 data/Auth/Write/Migration/GHCR/Compose/Nginx 변경 0.

## #109 PR #141 — Unit 실패 및 P1/P2 보완 (2026-10-27)

- [PR CI #40444154044](https://github.com/planner77/layoutManager/actions/runs/40444154044), HEAD `b5f340e69bd28aed939bb1c443df355c1652f5bf`: Unit/Integration 404 중 5 실패, Typecheck/ESLint·Docker PASS, Build/E2E SKIPPED. 5개 공통 직접 원인: 정상 Manifest Sorted Key 기대 순서 오타→`SNAPSHOT_MANIFEST_MISMATCH`.
- [Codex P1 #4384813274](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813274) key order 수정. [P2 #4384813277](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813277) SQLite source path 재오픈 TOCTOU를 검증 Buffer→메모리 DB로 교정, [P2 #4384813278](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813278) 8개 Auth table 완전/완전부재 검사로 수정. 관련 회귀 테스트·B1 Runbook 추가. **신규 HEAD CI 전 PASS 미확인**.
- S3-4-B1은 격리 readonly/합성 clone 무결성 검사 준비이며 실제 운영 Snapshot 동시성·실 Registry OCI·실 Migration/Restore/rollback은 NOT RUN. Auth/Write/운영 SQL·Compose/Nginx·GHCR·실 DB/CAD/S3·Issue 종료 금지.


## #109 S3-4-B1 착수 / 신규 CI 결과 미확인 (2026-10-27)

- Baseline S3-4-A PR #136 merge `1500eb699d5ef8d2045e951354838aa13ce24f92`, Main CI #40443473912 SUCCESS / release-scope SUCCESS / GHCR SKIPPED.
- S3-4-B1 `inspectS34B1Clone` 및 합성 clone + local CAD/S3-export 바이트/SQLite 회귀 코드 작성. **현재 작성만 했으므로 Typecheck/Unit/Integration/Build/E2E/CI PASS 아님.** 실제 사내 OCI/DB/CAD/S3/rollback·Same Snapshot 실증은 NOT RUN. 운영 GO=false.
- #109/#96 OPEN/BLOCKED, 운영 auth/write/Prisma/Compose/Nginx/GHCR 이미지 조작 없음.


## #109 S3-4-A P2 보완 및 이전 HEAD CI SUCCESS 구분 (2026-10-27)

- [PR CI #40438604869](https://github.com/planner77/layoutManager/actions/runs/40438604869) HEAD `07a126afdba9135e031f348e6a2901ae6395fd79` `completed/success`. Codex P2 [r4384543606](https://github.com/planner77/layoutManager/pull/136#discussion_r4384543606), [r4384543609](https://github.com/planner77/layoutManager/pull/136#discussion_r4384543609)는 코드 리뷰 지적 2건이지 관측 CI 실패가 아니다.
- TOCTOU용 `O_NOFOLLOW/O_NONBLOCK/fstat/dev+ino/fd-read/finally-close`, Status 문자열 엄격 검사 및 symlink/FIFO/inode/혼동 상태 회귀 코드 작성. **새 HEAD의 Unit/Typecheck/E2E/CI는 미확인**, 원격 Registry·실 DB/CAD/S3 복원 증거는 NOT RUN, GO=false.


## #109 S3-4-A — 구현 진입 / 검증 결과 미관측 (2026-10-27)

- Baseline: #135 S3-3 squash Main `dc20844be7525bd3367f38cc3080675efa4fa89c`, [Main CI 40437054103](https://github.com/planner77/layoutManager/actions/runs/40437054103) completed/success, release-scope PASS, GHCR Build/Push SKIPPED.
- S3-4-A 증거 패킷 pure module, 사내 오프라인 CLI, 단위시험·GHCR 범위 테스트 작성. 최신 PR CI의 Typecheck/Vitest/Build/E2E·Docker PASS는 **아직 관측하지 않음**. S3-4-B 실 OCI registry/사내 실제 복구·rollback, S3-4-C binding, S3-5 Owner GO **NOT RUN**.
- 사내 운영 자료/실 시험 기록 미열람; 형식상 PASS claims는 실제 검증 PASS로 계상하지 않음. 운영 Auth/Write/Migration/GHCR OFF, #109/#96 OPEN/BLOCKED.


## Issue #109 PR #135 P2·Main 정렬 확인 / 새 HEAD 시험 대기 (2026-10-27 KST)

- Initial `8a98e6a6`: [PR CI 40429149135](https://github.com/planner77/layoutManager/actions/runs/40429149135) `completed/success`.
- [Codex P2](https://github.com/planner77/layoutManager/pull/135#discussion_r4384076798): 격리 등록/기존 익명 Content GET의 서로 다른 저장소로 Viewer 404 가능. 코드/Runbook/Unit 수정 및 리뷰 답변·Resolved 확인. 본 P2는 실제 테스트 실패·운영 장애 증거가 아님.
- Latest aligned `ebc294fff35b005737cf89ebacb78420b209bd59`: GitHub `mergeable=true`, Main behind=0, unresolved thread=0. 새 HEAD 전체 CI·실 사내 PC/DB/CAD/S3 시험 결과는 **NOT RUN/NOT VERIFIED**. #109/#96 OPEN/BLOCKED.


## Issue #109 S3-3 — CAD API 권한·Audit 원자성 준비, 운영 OFF (2026-10-27)

- **기능:** 기존 CAD Multipart POST·Current PUT·Version DELETE에서 서버 DB의 최신 Session/Role/Site를 같은 Prisma Transaction 안에 재조회하고 승인된 Editor/Admin+Site만 쓰기 허용한다. DELETE는 기존 삭제 비밀번호도 요구하며, CAD DB 변경과 CAD_UPLOADED/CAD_CURRENT_CHANGED/CAD_VERSION_DELETED Audit INSERT 중 하나라도 실패하면 DB를 롤백한다. 기존 업로드 보상·삭제 Job, 익명 GET/Viewer·CAD 데이터 규약은 유지한다.
- **운영 차단:** `NODE_ENV=production`에서는 S3-3 프리뷰 활성화 불가. 정확한 S3-2 disposable DB/marker/7 migration, loopback origin, `G7_S3_AUTH_API_PREVIEW_ONLY=true`, `G7_S3_CAD_PREVIEW_ONLY=true`, `G7_AUTH_ENABLED=false`, `G7_CAD_WRITE_CUTOVER_ENABLED=false` 조건만 격리 시험 허용. 별도 Prisma Client와 0700 root 하위 로컬 CAD 저장소 이용. 운영 Migration·실 DB/CAD/S3·Compose/Nginx/.env·GHCR 게시·인증/쓰기 활성화 없음.
- **시험·잔여:** synthetic integration(Unit) 검증 코드 추가; 실제 PR CI는 시작 전이므로 결과 `NOT RUN`. 일회용 Preview Cookie의 Path는 `/api/g7-operational`이므로 다른 CAD 경로의 프로그램 시험에서는 테스트용 Cookie를 명시적으로 넘기며 운영 브라우저 인증이 활성된 상태는 아님. S3-4는 OCI/운영 Migration/실복구·신뢰 release binding, S3-5는 릴리스별 Owner GO 및 현장 수용. 기존 유사범위 PR #128은 미병합·충돌 상태이며 자동 병합하지 않는다. #109/#96 OPEN/BLOCKED.
- **후속 정확 Squash:** `#109 | S3-3 Isolated CAD write and Audit [G7-S3-3-NO-GHCR]` 및 개별 파일 allowlist만 GHCR 미게시. 내부 로그/비밀번호/IP/실 도면 반출 금지. [S3-3 Runbook](../src/deploy/g7-s3/S3-3.md).


## Issue #109 / PR #131 — 두 번째 PR CI의 실제 Unit 실패·수정 HEAD 재검증 대기 (2026-10-27 KST)

- [Run 40394690714](https://github.com/planner77/layoutManager/actions/runs/40394690714), PR HEAD `0cab0f1449e0a7f8e41a1149a5e46b0aa0ef8a72` **completed/failure**. Verify [121824493035](https://github.com/planner77/layoutManager/actions/runs/40394690714/job/121824493035): Typecheck 및 ESLint 성공, Unit/Integration **64 files 중 1 FAIL / 360 tests 중 1 FAIL**. 실패는 `g7-s3-operational-auth.test.ts:127:57`의 `Response.clone: Body has already been consumed`; `login()`이 이미 `r.json()` 실행했는데 동일 원본 `Response`를 재복제하려 해 발생. 실패 후 Production Build/Chromium/Legacy Migration E2E는 SKIPPED. Docker [121824492537](https://github.com/planner77/layoutManager/actions/runs/40394690714/job/121824492537) SUCCESS. 해당 원본 로그 외 실제 HTTP 인증 실패 근거 없음.
- **보완:** 로그인 헬퍼에서 `r.clone().json()`으로 진단용 원본을 보존하고 `admin.response.bodyUsed === false` 회귀 검사 추가. Node.js Response API 최소 확인만 수행(추가 실제 사내 시험/전체 Vitest는 NOT RUN). S3-2 GHCR 미게시 가드 Unit은 해당 실패 Run에서 22건 성공; Codex `[...segments]` Bash P1은 답변·Resolved 상태. 이전 TS2540 실패 이력은 [FailureLedger](FailureLedger.md)에 보존.
- **신규 HEAD 현재 판정:** 수정 소스/문서는 최신 CI 시작 전 성공이라고 표시하지 않는다. 실 생산 Auth API 계속 404, 운영 Prisma Migration/Compose/Nginx/실 DB/CAD/S3 및 GHCR 게시 미실행, #109/#96 OPEN/BLOCKED.


## Issue #109 / PR #131 — 첫 PR CI 실패·Codex P1 교정, 최신 검증 대기 (2026-10-27)

- [Run 40337811911](https://github.com/planner77/layoutManager/actions/runs/40337811911), HEAD `e31c69ccb096ffc34d16f91e8b9a33cb4f7d23f1`: Verify `121624002318` **failure**(TypeScript TS2540: `tests/integration/g7-s3-operational-auth.test.ts:32:87`, `:235:19`에서 읽기 전용 `process.env.NODE_ENV` 할당 2곳). Docker `121624002854` **success**. Verify 이후 Lint/Unit/Build/E2E **skipped**; 이를 PASS로 기록하지 않음. 상세 출처·수정 이력은 [FailureLedger](FailureLedger.md).
- [Codex P1 r4378255007](https://github.com/planner77/layoutManager/pull/131#discussion_r4378255007): Bash `case`가 S3-2 `[...segments]` 허용 파일을 문자 클래스로 해석, 실제 허용 경로를 잘못 거부. 단일 인용부호로 리터럴 경로 허용 및 인접 route 변형 거부 회귀 추가. 기존 PR HEAD의 성공은 이전 변경을 검증하지 못하므로 **수정 최신 HEAD PR CI 재실행 전 Typecheck/Unit/Integration/Build/E2E 미확인**.
- Main `338e1097` (#124/#126/#127 기타 작업) 정렬 시 문서·패키지/Viewer 변경을 보존한다. S3-2는 일회용 DB/loopback 비운영 API·운영 프로덕션 404 유지, GHCR 게시·실 DB/CAD/S3/운영 Prisma 활성화/Compose/Nginx·PR 병합 없음.


## #109 S3-2 — 운영 Auth/Admin API 사전 통합·현장 활성화 구분 (2026-10-26)

- **작성한 변경:** 새 `/api/g7-operational/**` App Router, Auth(G3)/Management(G4)/Audit/일회성 G2 Admin CLI의 일회용 S3 SQLite preview 연결, Admin-only users/create(CSRF+사전 G4 인가/KDF/txn 재검증+User/Audit 원자), 독립 HttpOnly/Path Cookie, S3 후보 Prisma 공유 target guard, GHCR S3-2 정확 제목·경로 Allowlist 및 Unit/Integration.
- **프로덕션 실행 결과:** 새 API는 `NODE_ENV=production` 전체 404로 강제, 운영 DB Migration/실 Auth/기존 CAD POST/Current/Delete Cutover·GHCR 발행·Nginx/Compose 변경은 수행하지 않았다. 운영 API 제공 준비 ≠ 운영 활성화. S3-1 `runtimeActivated=false` 불변, S3-4 release binding·S3-5 Owner 승인 전 실제 Auth 이용 불가.
- **시험 실행 상태:** 코드/계획은 PR CI 실제 성공이 아니다. 새 PR HEAD의 Typecheck/Lint/Unit/Prisma Integration/Build/E2E/Docker 검증은 **Run 결과 확인 전 PENDING**. 실제 사내 2대 PC/Owner 무반출 원본·DB/CAD/S3 실복구는 별도 사내 증거이며 이번 CI 합성시험으로 대체 불가.
- **후속:** S3-3 기존 CAD 쓰기/DELETE Auth+Audit 단일 업무 트랜잭션 및 S3-4 release/rollback/OCI 검증, S3-5 운영 GO는 미실행; 이슈 #109/#96 OPEN/BLOCKED 유지.


## U-ISSUE57-PR134-20261027 — 최초 CI Docker 실패와 수정 후보

- 검증된 최초 PR HEAD `1a5c26526dc3ba90f12aa7e6f5f150a039180933`, [Run 40418875931](https://github.com/planner77/layoutManager/actions/runs/40418875931) attempt 1. Verify Job `121907950137`는 Typecheck/Lint/Unit·Integration/Build/E2E/Legacy **success**, Docker Job `121907948037`는 Compose fresh/health·migration Step 16 **failure**.
- Docker migrate 로그: `ERR_MODULE_NOT_FOUND` for `/app/src/server/upload-error-catalog` imported by `/app/src/server/logger.ts`, 이후 backfill exit 1. 기존 초기 이슈 분석의 정적 위험과 달리 **실제 관측 CI 실패**이며 Reviewer P1 `r4383549858`와 원인이 일치한다. [FailureLedger](FailureLedger.md).
- 보완: 축소 Migrator에 Logger 의존 Catalog COPY, 독립 `node --import tsx` 로드 테스트, PR CI packaged-file/import smoke, TC-LOG-MIG-001 Unit. 새 HEAD는 수행 결과 미확인(`NOT VERIFIED`); 로컬 Unit/Typecheck/E2E/Docker 및 실제 LAN·CAD/S3/운영 적용 `NOT RUN`. 메인 병합·GHCR 게시 없음.



## U-ISSUE57-L1-20261027 — app Logger 단일화 (실행 전 기준선)

- **구현 후보:** 기존 `server/logger.ts` schema v1/allowlist·category 재정제·Health 200 debug-only, `server/upload-observability.ts` 별도 emitter 제거, `server/upload-error-catalog.ts` 기존 안전 error catalog 공유, TC-L1-001~004 및 CLI raw Error suppression. 설계/발생 위치/AC는 [Issue57](Issue57.md)·[TestPlan](TestPlan.md) 기준.
- **로컬 수행 근거:** connector 기반 원격 변경으로 로컬 npm 설치/Typecheck/ESLint/Vitest/Build/Playwright/Docker smoke를 실행하지 않음: 각각 `NOT RUN`. 실제 운영 CAD/GPU/S3, Windows Nginx·사내 PC 2대 연결, DB 복구: `NOT RUN`.
- **CI 상태:** PR CI 시작은 실제 Run 등록/이벤트 trigger로만 판단하며 성공/실패는 최신 HEAD/Run·Job을 확인하기 전까지 `NOT VERIFIED`. 기존 #18/다른 PR CI 성공 기록을 신규 HEAD의 PASS로 재사용하지 않는다.
- **영향 범위:** 기존 JSON 응답·`X-Request-Id`·마이그레이션/Viewer/G7 인증 활성화 코드 변경 없음; 코드 범위상 DB migration은 포함하지 않는다. 운영 실측 및 regression PASS는 별도 증거 확보 전 주장하지 않는다.


## U-ISSUES124-126-127-20261027 — 0.42.0 구현·CI·GHCR 게시·이슈 종료 완료

- **완료 판정:** Manager 로컬 구현 수용 후 Root가 최신 HEAD의 CI·리뷰/충돌·태그를 확인해 [PR #132](https://github.com/planner77/layoutManager/pull/132)을 Squash 병합했다. main source `f2c04bf6e3e0092bf44aba2618b7561a550e7540`, 태그 `v0.42.0`의 annotated target도 동일하다. [#124](https://github.com/planner77/layoutManager/issues/124), [#126](https://github.com/planner77/layoutManager/issues/126), [#127](https://github.com/planner77/layoutManager/issues/127)에 결과 댓글을 남기고 `closed/completed`를 재조회 확인했다. 이전 진행 중·실패 기록은 아래 당시 관측으로 보존한다.
- **변경/추적:** #124 홈 한정 nav·검색/Current/요약 Sticky와 밀도/반응형; #126 Three 기본 DXF·실제 렌더러 실패 1회 대체·양방향 로딩 중 수동 전환·원본 오류/취소 구분·동일 bytes/URL/임시 작업 확인; #127 두 정보 헤더·설명 접근·실행형 그룹 메뉴·상태 독립 Drawer/중첩 창·Escape/포커스. 요구→구현→TC는 [단위 가이드](Issues124-126-127.md), 결정은 ADR-053을 따른다.
- **실제 역할/게시:** gpt-6-astra Manager, gpt-6-sol 제품 및 별도 기존 E2E Developer, gpt-6-luna 독립 QA, Root 시각 측정·GitHub/릴리스. Root는 지정 저장소에 연결 GitHub Git Data API로 `fd9eeaf` 및 DWG 진단 보완 `5b3b71722e07d8517b329bbc19ced35f37197fe1`을 게시했다. 원격 tree와 staged tree 일치, 비강제 ref 갱신, fetch 후 ancestor/tree 확인으로 로컬 branch를 fast-forward했다. 기존 worktree의 사용자 변경은 보존했다. 게시 전 Secret/runtime/CAD/build 포함 검사 위반 0건, package/lock 0.42.0 일치.
- **독립 QA 범위:** 기준 `fd9eeaf`의 Typecheck·Lint·Unit 351/351(63 files)·전체 E2E 86/86·legacy migration 1/1 PASS. 후속 DWG 고정 진단/실험 페이지 probe 보완은 독립 type/lint·관련 Unit 20/20·DWG 4/4(24.0s)·기능 E2E 13/13(47.7s) PASS. 후속 patch의 5파일 SHA-256 `efea53f9f9296333768d65013abb7c8f6f1fb801357efcbe2b366df173df167f` 일치를 확인했다. 독립 QA가 전체 352개를 실행한 것으로 확대하지 않는다. 상세 보고는 로컬 `/tmp/layoutManager-issues124-127-qa-final.md`.
- **최신 PR CI:** [Run 40352404675](https://github.com/planner77/layoutManager/actions/runs/40352404675), HEAD `5b3b717`, completed/success. Verify [121675709873](https://github.com/planner77/layoutManager/actions/runs/40352404675/job/121675709873) 및 Docker [121675710616](https://github.com/planner77/layoutManager/actions/runs/40352404675/job/121675710616) success. 실제 로그: Unit/Integration **352/352·63 files**, Build/Typecheck/Lint PASS, E2E **86/86(5.2m)**, legacy **1/1(12.4s)**; Docker 패키징·native·migration 실패 차단/새 설치·CRUD smoke PASS. 기존 lint warning 3개는 아래 보고를 따른다. 최초 fd9 [Run 40349738685](https://github.com/planner77/layoutManager/actions/runs/40349738685) 성공은 별도 HEAD 근거로 보존한다.
- **병합 전 확인:** 최신 PR HEAD와 검증 SHA 일치, main drift 0, mergeable=true, draft=false, 제출 review/미해결 thread 0, v0.42.0 태그 미존재, `.env` 지정 repo와 origin 일치. Squash title을 명시하고 본문을 비워 기존 #76 기본 설정과 무관하게 짧은 Main 실행명을 유지했다. auto-merge/force push/history rewrite/기존 branch 삭제는 수행하지 않았다.

### Main CI와 GHCR App/Migrator Pair

- [Main Run 40354233607](https://github.com/planner77/layoutManager/actions/runs/40354233607), source `f2c04bf`, completed/success. release-scope [121682247638](https://github.com/planner77/layoutManager/actions/runs/40354233607/job/121682247638), build/push [121682336818](https://github.com/planner77/layoutManager/actions/runs/40354233607/job/121682336818) 모두 success. App/Migrator 후보 두 digest registry inspect 후 `0.42.0`/`0.42.0-migrate` 및 `latest`/`latest-migrate`를 승격·inspect했고 게시 Pair의 linux/amd64 OCI 계측도 통과했다. 두 이미지 label은 version=0.42.0, revision=`f2c04bf6e3e0092bf44aba2618b7561a550e7540`으로 기록됐다.
- 게시 workflow 보고 App digest: `sha256:525f30306b3c5bc7307b926334bb100858ddfb32f523280df43595e3536ec486`.
- 게시 workflow 보고 Migrator digest: `sha256:14a31f469adbd681450427294a71ba3ea6c848e299c8aac7b6cdb8d385cb91fc`.
- 게시 참조: `ghcr.io/planner77/layoutmanager:0.42.0`, `ghcr.io/planner77/layoutmanager:0.42.0-migrate`. 이는 workflow의 인증된 registry 검사 근거이며 Root의 별도 로컬 pull·운영 배포를 실행한 결과는 아니다.

### 시각·실제 200% 브라우저 확대와 한계

- 동일 합성 LINE2 / one Location / 30 Versions의 Root 기준 비교: 1440×900 목록 표 시작 **526→398px**, 완전 표시 **3→4행**, Viewer 헤더 **210→90px**. 불투명 기본 Drawer를 제외한 Canvas 기하 면적 **758,032→1,048,284px²(+38.29%)**, Drawer 모두 닫힘 **1,107,360px²(+46.08%)**. 375px 목록 3행, 320px 1행을 확인했다. 모바일 modal Drawer가 열린 동안 Canvas는 보이지만 입력은 차단한다.
- 이전 720×450 검사는 CSS viewport 동등 조건으로 보존한다. 추가 Root 시험에서는 별도 일회성 Chromium persistent profile/확장의 실제 `chrome.tabs.setZoom(2)` 및 `getZoom=2`를 사용했고 device metrics override를 해제했다. **innerWidth 720/innerHeight 450, devicePixelRatio 2, visualViewport.scale 1**. Current 버튼 height 44px, 행 작업 top394/bottom418은 sticky bottom362 아래이며 viewport450 내에 있다. body scrollWidth720으로 가로 넘침 없음. Viewer modal 닫기·확대/맞춤 메뉴·Escape 포커스 복귀, 같은 Canvas host, native fullscreen `cad-viewer-shell`/true를 확인했고 캡처도 직접 검토했다. 테스트 후 native/zoom을 복구하고 임시 브라우저·서버를 종료했다.
- 실제 확대 증거: `/tmp/layoutManager-ui-baseline-124-127/output/playwright/actual-zoom-200.json`, `actual-zoom-200-{list,viewer,native}.png`; 기존 비교는 같은 폴더의 `baseline-metrics.json`, `after-metrics.json`, `after-source.sha256`. 재현 API는 [Chrome Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom), 환경은 [Playwright extensions](https://playwright.dev/docs/chrome-extensions)를 참조했다. 첫 임시 probe의 프레임 전 즉시 포커스 관측은 별도로 보존하고, 정상 포커스 복귀를 기다린 완료 시험과 구별한다.
- Three 정상 크기 시험은 합성 LINE 100/10,000/100,000개 cold/warm 6 records에서 모두 success·fallback null·console/page errors 0이었다. 실 CAD/GPU/VRAM 성능이나 다른 Browser 수용을 의미하지 않는다. **다음 별도 수용은 #113 실 CAD/GPU**, 실제 운영 배포·DB/CAD/S3·Auth/G7 활성화는 이번 완료 범위 밖이다.


## Issues #124/#126/#127 — DWG 진단 보완 후보 (2026-10-27 KST, 0.42.0)

- **이전 HEAD의 실증:** `fd9eeaf9b5997fcc167969a36d20d9d5ad3b1561`, [PR #132](https://github.com/planner77/layoutManager/pull/132), [PR CI 40349738685](https://github.com/planner77/layoutManager/actions/runs/40349738685) completed/success(Verify 121666219572, Docker 121666218874). 독립 전체 Unit 351/351·63 files, E2E 86/86(6.3m), legacy migration 1/1(11.2s) PASS. 이 결과를 아래 후속 수정 HEAD 전체 CI 성공으로 전용하지 않는다.
- **추가 실제 크기 시험:** 기존 benchmark Three pair 1만 실행, 합성 LINE 100/10,000/100,000개 각 cold/warm 총 6개 record, 3/3 cases PASS(50.5s). 모두 renderer=three-dxf-viewer/result=success/entity count 일치/fallback=null/console·page errors 0, source cold=miss/warm=memory. 비공개 실 CAD·GPU 성능 수용은 #113 별도이다.
- **보충 DWG 2/4 실패와 수정:** 정상 등록 DWG 메뉴/fullscreen/lifecycle 및 standalone 오류 시험은 통과했으나, WASM 404의 기존 고정 진단이 Manager의 generic LOAD로 가려졌고 `/lab/dwg` probe가 없는 그룹 메뉴를 기다렸다. 상세 실패는 FailureLedger와 `/tmp/layoutManager-issues124-127-qa-final.md`에 보존했다. 정해진 DWG stage/code/고정 문구가 모두 맞는 typed error만 보존하고 raw/위조/미등록 오류와 DXF는 기존 generic 처리를 유지한다. lab probe는 실제 확대 버튼으로 복원했다.
- **수정 검증:** Developer Typecheck/Lint/Build, 관련 Unit 20/20·DWG 4/4·focused 13/13 PASS. 독립 post-fix Typecheck/Lint(기존 warning 3개), 관련 Unit 20/20 및 공개 pinned DWG 4/4(24.0s) PASS. 독립 focused 13/13(47.7s)도 PASS, Manager가 로컬 구현을 수용했다. 검증된 5개 소스/시험 diff SHA-256은 `efea53f9f9296333768d65013abb7c8f6f1fb801357efcbe2b366df173df167f`이다. 최신 HEAD PR CI·Main CI·GHCR·이슈 종료는 아직 확인 중이다. 최종 보고는 `/tmp/layoutManager-issues124-127-qa-final.md`에 추가하며 실제 release 기록으로 동기화한다.


## Issues #124/#126/#127 — 독립 QA 1차 결과와 수정 후보 재검증 (설계 2026-10-26, QA 2026-10-27, 후보 0.42.0)

- **현재 후보 재고정(2026-10-27):** 아래 1차 QA의 keyboard focus race를 `useLayoutEffect`의 commit 직후 포커스와 trigger 처리 키의 `stopPropagation`으로 보완했다. Developer Typecheck/Lint/Production Build 및 강화된 focused E2E 13/13 PASS, Manager 최소 수정 검토 후 소스·문서를 재고정했다. 독립 QA 전체/DWG4/legacy 및 원격 PR/Main CI·GHCR는 재실행/확인 중이며 아직 완료 수용이 아니다. 아래 85/86 결과와 실패 원장은 당시 관측으로 보존한다. 최종 증거는 후속 release 기록에 추가한다.

- **역할:** gpt-6-astra Manager가 [설계/AC](Issues124-126-127.md)를 선기록·검토, 주 gpt-6-sol Developer가 제품/신규 시험, 두 번째 gpt-6-sol Developer가 기존 E2E locator/흐름 이관, gpt-6-luna가 독립 QA 수행. Root가 baseline/after browser 관측 및 release/GitHub 절차를 담당. QA는 root가 고정한 frozen candidate를 시험했으며 코드/테스트를 수정하지 않았다.
- **환경/기록:** Linux x86_64; Node 22.14.0; npm 11.10.0; package 0.42.0; Playwright 1.63.0 / Chromium 1243 SwiftShader; isolated SQLite/CAD fixtures, no production data. QA KST date 2026-10-27 (test runner UTC timestamps 2026-10-26). Logs: `/tmp/layoutManager-issues124-127-qa-typecheck.log`, `...-qa-lint.log`, `...-qa-unit.log`, `...-qa-e2e.log`; E2E artifacts `/tmp/layoutManager-issues124-127-qa-e2e-results/`.
- **Typecheck/Lint/Vitest:** `npm --prefix src run typecheck` PASS; `npm --prefix src run lint` PASS, 3 warnings (existing `outline-tree-panel.tsx` ARIA `aria-selected`, `g7-staging-prepare.ts` unused `readFileSync`, benchmark helper unused `resolve`); `npm --prefix src test` PASS, 63 files / 351 tests, 126.57s.
- **Full Playwright:** `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome CAD_E2E_PORT=3103 npm --prefix src run test:e2e -- --output=/tmp/layoutManager-issues124-127-qa-e2e-results` — 85 PASS / 1 FAIL / 86 total, 6.5m, one worker. Existing Current/list, upload, Viewer, generated edit, fullscreen, text-search, and the new #124/#126/#127 cases otherwise passed. Sole failure: `TC-127-MENU` after ArrowRight into Work menu then Escape, trigger focus expectation at `issues124-126-127.spec.ts:210`; Work trigger remained `aria-expanded=true` and was not focused. Trace and exact assertion are in `.../issues124-126-127-TC-127-M-01130-activation-and-focus-return/{trace.zip,error-context.md}`. Developer read-only diagnosis: RAF focus relocation races with Escape before focus reaches new menu; Manager authorized minimal `useLayoutEffect` fix, pending rebuild, focused test, full independent rerun.
- **Build and requested supplemental suites:** the independent QA did not rebuild the frozen `.next` snapshot. Developer created the latest production build, then Root captured final visuals against it; a post-fix build is pending. Public sample DWG probes (4) and legacy master-migration suite are both **NOT RUN / pending** against the approved post-fix snapshot.
- **Final visual evidence (Root, 2026-10-27):** same generated LINE2 / one Location / 30 versions, Chromium SwiftShader. `/tmp/layoutManager-ui-baseline-124-127/output/playwright/{baseline-metrics.json,after-metrics.json,after-source.sha256,*.png}`. After values: list 1440px top 398, 4 visible rows; 375px top 444.5 / 3 rows; 320px top 473.6875 / 1 row; Viewer desktop header 90px, normal scrollY 105/header top 0, initial hash row top 368.5 vs sticky bottom 365; mobile header 94px at 375/320, canvas uncovered area 167953.125/83160px². Desktop 1440 canvas area baseline 758032px² to 1048284 with opaque drawers (+38.29%), all drawers closed 1107360 (+46.08%). At 720×450 keyboard target y394–418 is below sticky bottom 362 and within viewport. Mobile shaded canvas is visible but inert until drawer closes. 720×450 is a 200%-equivalent CSS viewport, not real browser zoom. Measurements do not establish real GPU/VRAM/CAD performance.
- **AC/release limits:** local AC coverage is not complete while the keyboard focus-return failure is open and DWG/legacy reruns are pending. #113 field CAD/GPU acceptance, actual 운영 Auth/G7/DB/CAD/S3, Root's updated Production Build, PR/Main CI, GHCR promotion, and issue closure remain unverified/pending. Root owns all commits/push/PR/CI/GHCR/closure.


## Issue #109 S3-1 — 구현/작성된 시험과 실제 PASS 구분 (2026-10-26)

- **작성:** 운영 Prisma Client Schema에 G1~G4 모델 추가·기존 CAD 관계 유지, 신규 S3 인증 후보 정식 SQL을 `deploy/g7-s3/prisma/migrations`(기존 CAD 6개 + 신규 1개)에 분리; 자동 `src/prisma/migrations` 이력·operational Migrator 변경 없음. Pure Release/Operation 사전 검사, 격리 Prisma config, Unit·Integration, G1~G3 기존 테스트의 Schema 가정 변경, GHCR 한정 제외 테스트.
- **실제 검증:** 새 HEAD PR CI가 시작되기 전에는 `npm test/typecheck/Build/E2E/Docker` PASS **미확인**. 작성 코드는 실행 근거 아님. 시험 계획은 [TestPlan](TestPlan.md) G7-S3-001~008·CI-001~003, 격리 Runbook은 [S3 README](../src/deploy/g7-s3/README.md). 리뷰·Main 충돌도 최신 PR 생성/CI 결과에 따라 추적.
- **실 운영 제외:** 실제 운영 SQLite/Schema Migration·CAD 원본/Current/Version/S3 파일 접근·GHCR 게시/릴리스 서명·인증 라우팅·배포·Nginx/Compose/.env·Owner S3 실행 GO 전부 **NOT RUN / NOT ENABLED**. User 사내 증거 원본 비반출 조건 유지. #109/#96 OPEN/BLOCKED.



## Issue #109 / PR #129 — S2 전용 GHCR 미게시 보완 전후 증거 구분 (2026-10-26)

- **기존 자동 검증:** HEAD `29ed3028bf0f78ba37abba0ecde73a6483d0942f`의 [PR CI 40313233131](https://github.com/planner77/layoutManager/actions/runs/40313233131) `completed/success`: Verify [121539323884](https://github.com/planner77/layoutManager/actions/runs/40313233131/job/121539323884) 및 Docker [121539323971](https://github.com/planner77/layoutManager/actions/runs/40313233131/job/121539323971) 모두 성공. 신 HEAD GHCR 정책 Unit·Build/E2E는 별도 결과 전 **NOT VERIFIED**.
- **추가 정책 테스트 준비:** [Codex P1 #4376591801](https://github.com/planner77/layoutManager/pull/129#discussion_r4376591801)에서 S2 파일 변경의 GHCR publish=true 위험을 지적했다. 이를 S2-only 정확 Squash 제목+개별 허용 파일, 미승인 운영/Stage 파일 거부, S1 무회귀·기존 일반 runtime/tag 동작 회귀로 교정했다. 이는 실제 코드 리뷰 발견이며 **PR CI 실패나 GHCR 이미지 게시를 관측한 것이 아니다**.
- **진행 한계:** PR #129는 사내 원본 증거 비반출용 Offline Readiness 도구만 포함한다. 기존 CAD 쓰기 API의 Auth·Audit/운영 Prisma Cutover와 실 DB/CAD/S3 Restore·App/Migrator immutable OCI Pair는 이 테스트의 PASS로 간주하지 않는다. GHCR/실 운영 변경·배포·PR 병합·Issue 종료 전부 별도 사용자 지시 필요.


## #109 S2 내부 증거 비반출 준비 — 검증 결과는 아직 미확인 (2026-10-26)

- Owner의 S1 수용/S2 승인 의사 및 **내부 시험 원본 비반출** 조건을 적용했다. S2 readiness pure evaluator·오프라인 CLI·Unit/Runbook 초안을 작성했으나, 새 브랜치 CI 통과 확인 전 **테스트 PASS 아님**. 기존 운영 CAD API/Auth, 운영 Prisma/OCI pair/실 Restore는 구현 완료로 표시하지 않는다.
- `READY_FOR_OWNER_REVIEW` 결과도 사람의 서명과 실 배포와 구별하며, 진짜 Go/No-Go 데이터/Secret/실 URL·원본 로그를 GitHub에 제출하지 않는다. 사내 원본을 못 보는 것은 미확인 상태로 보존한다.


## Issue #109 / PR #125 — 관측 PR CI 40275956996 실패 및 P1 보완 후 재검증 대기 (2026-10-26)

- **실패 Run/HEAD:** [40275956996](https://github.com/planner77/layoutManager/actions/runs/40275956996), HEAD `818264afb8809ccf0a3e09262e1a09054fd43004`. Verify [121418632923](https://github.com/planner77/layoutManager/actions/runs/40275956996/job/121418632923) Unit/Integration `failure`(59 files 중 1 FAIL, 313 tests 중 1 FAIL), Docker [121418632714](https://github.com/planner77/layoutManager/actions/runs/40275956996/job/121418632714) `success`. Typecheck/Lint 성공, Verify 이후 Build/E2E는 skipped. 단 하나의 실패는 GHCR scope Test의 비허용 경로 출력 스트림 예상 불일치: 실제 `stdout` vs Assert `stderr`. 해당 Actions 로그·원인·교정 및 P1 리뷰 3개는 [FailureLedger](FailureLedger.md)에 분리 기록.
- **보완 작성:** Main GHCR 게시 제외 조건을 Commit **첫 줄 정확 일치**(multiline body 허용·prefix 변형은 거부)로 변경하고 거부 메시지는 stderr로 출력. Stage 전용 Prisma config는 운영 DB URL/경로·승인 manifest·UID/symlink/realpath 등 전체 Stage Gate를 **Migration SQL 이전**에 검증하고 기본 fallback URL 제거. 추가 Unit(Test)으로 near-match/공백/본문, stdout-stderr, 잘못된 DB URL 및 센티널 원본 불변을 추적. Staging README/운영 지침은 모든 격리 환경변수를 **Prisma 실행 전** 지정하도록 교정.
- **시험 상태:** 코딩/문서 보완은 실제 통과 근거가 아니다. 새 PR HEAD의 Typecheck/Lint/Unit/Vitest/Prisma/E2E/Docker/리뷰는 Run/Job 실제 확인 전 **PENDING/NOT VERIFIED**. 구 Run 40270394055 성공은 구 HEAD 전용으로 보존.
- **운영/현장 예외:** 신규 S1 검증이 통과하더라도 합성 SQLite·DXF JSON/base64 미러 API이지 기존 Multipart CAD 경로/S3·사내 PC 2대·동일 snapshot 실복원/운영 이미지 서명·Owner S2 GO가 아니다. G7 AC1~4/이슈 #109·#96 OPEN/BLOCKED, Auth·정식 운영 Migration/Proxy/Compose/.env/실 자료·GHCR 미게시 상태 유지.


## Issue #109 PR #125 — S1 첫 CI 성공·검증 범위와 후속 보완 (2026-10-26)

- **첫 CI 성공 확인:** 구 HEAD `a82a04bb2412859e998616902e22f0efceab35c4`의 [PR CI 40270394055](https://github.com/planner77/layoutManager/actions/runs/40270394055)는 `completed/success`. Verify [121401764981](https://github.com/planner77/layoutManager/actions/runs/40270394055/job/121401764981)(Typecheck/Lint/Unit·Integration/Build/Chromium E2E/Legacy Migration E2E), Docker [121401764781](https://github.com/planner77/layoutManager/actions/runs/40270394055/job/121401764781)(이미지·Migration·Runtime Smoke) 모두 성공. Vitest 설정은 `tests/**/*.test.ts`를 포함하므로 G7 Stage 테스트도 해당 실행 대상이다. 이 결과는 **구 HEAD 전용**이다.
- **자동 시험의 실제 범위:** Linux 일회용 SQLite에 Staging 공식 Prisma Migration 7개 적용, Admin 초기 변경/login, Grant/Editor+Site, **JSON/base64 DXF** Stage 등록·Current·비밀번호 AND Delete, Audit·원본 SHA, SQLite snapshot backup/restore 및 Stage 게이트 OFF/오류 경로. **실 사내 PC/Proxy/S3·이미지 쌍·운영 API 전환 시험은 아님.**
- **미확인/PENDING:** 실제 Staging Browser/Windows Nginx·서로 다른 PC·S3, 기존 운영 Multipart `POST /api/cad-files`/일반 Current·Delete API의 권한+Audit 같은 거래 Cutover, 운영 DB·CAD·S3 동일 snapshot 복원, 고정 OCI digest·서명/rollback 이미지 호환, Admin Secret/Audit 물리 purge SOP·Owner S2 별도 GO. #108 G6은 Owner 보고 수용이나 개별 비공개 시험 증거 ID/복원 checksum 미열람.
- **구 CI 이후 보완(신 HEAD 재검증 필요):** 공유 hostname에서 일반 `cad_session`과 충돌하지 않도록 Stage 쿠키를 `cad_staging_session; Path=/api/g7-staging`으로 분리하고 내부 G3/G4 전달 시에만 변환·Logout/동시 Cookie 회귀 추가. 이번 S1 코드 Main 병합이 GHCR 게시를 일으키지 않도록 정확한 스쿼시 제목과 Stage 전용 경로 목록만 허용하는 GHCR 비게시 Main release-scope 차단·synthetic Bash 테스트 추가. 변경 HEAD 새 PR CI PASS 전 합격 금지.
- **리뷰/운영 상태:** 확인 당시 Codex review summary `running`, review thread 0은 리뷰 완료를 증명하지 않음. 최신 CI·리뷰/충돌·GHCR skip 게이트 확인 전 병합 금지. #109/#96 OPEN/BLOCKED, 운영 기능 ON·GHCR 게시·실 배포 승인 없음.



## Issue #109 G7 S1 — Staging 통합 코드 작성 / 실행 증거 구분 (2026-10-26)

- **구현:** 기존 G1~G4 계약을 staging-only port로 사용, 기본 OFF G7 dual gate/manifest/리눅스 disposable DB 경로, 전용 Prisma schema·7 migrations 및 명시 배포 config, /api/g7-staging/[...segments] 로그인/암호·세션·Grant·Audit·격리 CAD DXF JSON/base64 upload/current/delete mirror, Admin 단발 CLI·독립 fixture 준비, rollback 시험 시나리오 작성. 기존 운영 `src/prisma`/CAD REST routes/Nginx/Compose/.env/실 DB/CAD/S3/운영 GHCR 변경 0.
- **테스트 작성 vs 실행:** `TC-P4-G7-001~015` 가운데 staging 자동시험용 Unit/Integration 코드는 추가했지만, GitHub connector를 통해 원격 소스를 편집하므로 로컬 node_modules/Prisma/Typecheck/Vitest/Playwright/실 LAN을 실행하지 못했다. **로컬 전부 NOT RUN**. PR 생성 후 최신 HEAD PR CI의 실제 Run/Job 결과를 확인하지 않으면 PASS로 쓰지 않는다. 현재 테스트는 Staging formal migration과 격리 API·snapshot copy restore를 검증할 **계획된 실행**이며, 실 운영 G7 cutover/multipart 호환성·실 S3 복원·실 Windows Nginx E2E는 포함하지 않는다.
- **Owner 게이트:** #108은 Owner 현장 수용 CLOSED이나 개별 원본 증거 ID·restore checksum은 여기서 독립 확인 불가. 본 S1 결과가 S2 Owner 운영 GO를 대체하지 않는다. #109/#96 OPEN/BLOCKED, 운영 활성화·GHCR 게시·PR 병합/Issue 종료는 이번 요청에서 제외.
- **실패 원장:** 관측된 새 CI 실패/취소는 현재 0(시작 이전), 코드 검토·Staging DB 연동 위험은 [FailureLedger](FailureLedger.md)에 추적. 시험 실행 후 실패시 RUN/Job/Attempt/Step 출처와 원인·수정 결과를 추가한다.


## Issue #109 — G7 운영 활성화 설계·절차 준비 / 실제 실행 구분 (2026-10-26)

- [Issue109](Issue109.md), ADR-051-G7-PLAN/Architecture/Database/Requirements/Operation/TestPlan/AGENTS/Issue96를 **문서 전용**으로 정렬. release G7 capability+App/Migrator pair와 Owner GO·`G7_AUTH_ENABLED`의 이중 게이트, 별도 write flag·권한·DB/CAD/S3 백업/실복구·롤백 절차를 설계했다. **이 단계는 코드 구현/기능 또는 운영 활성화가 아님**.
- TC-P4-G7-001~014: 통합 Auth API/운영 Schema/G7 flag **미구현**, G7 별도 운영 통합·Staging E2E/배포 복구·Owner GO/NO-GO **NOT RUN / BLOCKED**; #108 현장 시험은 Owner 보고에 의해 수용되었고 개별 원본 로그는 여기서 독립 확인하지 못함. 기존 G0~G5 격리·Preview CI 성공을 G7 운영 검증 PASS로 전용하지 않는다.
- TC-P4-G7-015: 문서 PR 실제 diff(`src/**`·Prisma/Nginx/Compose/.env/GHCR·운영 자료 변경 0)를 확인하고 해당 HEAD의 PR CI/리뷰 결과를 별도 기록한다. PR 생성/CI 시작은 PASS 아님. 새 CI/리뷰 실패·취소 관측시 기존 [FailureLedger](FailureLedger.md)에 Run/Job/HEAD·원인/재시도 누적.
- 현재 #109 G7-AC1~4·상위 #96 **OPEN/BLOCKED**, G6 #108 현장 증거·Owner 별도 GO 미수용, 운영 변경·배포 실행 0. 실제 사내 IP/CIDR/Secret/CAD/원시 로그·S3 key는 공개하지 않는다.


## Issue #108 / PR #122 — 기존 HEAD CI 성공과 P2 보완 HEAD 재검증 구분 (2026-10-26)

- **기존 CI 실증:** PR #122 HEAD `9c8bfc1062b33964928b299ebc4cfe80e319378c`에서 [PR CI 40257054743](https://github.com/planner77/layoutManager/actions/runs/40257054743) `completed/success`: Verify [121361049386](https://github.com/planner77/layoutManager/actions/runs/40257054743/job/121361049386)와 Docker [121361049207](https://github.com/planner77/layoutManager/actions/runs/40257054743/job/121361049207) 모두 success. E2E 실패 결과 업로드는 failure() 조건 미충족에 따른 정상 SKIPPED.
- **P2 보완:** [r4373409989](https://github.com/planner77/layoutManager/pull/122#discussion_r4373409989) 신규 `out/Issue108.md`의 AGENTS 필수 문서 참조 테이블 누락을 보완. 요구/AC·G6 현장 증거의 참조 경로만 정렬한 문서 변경이다. 리뷰 수정 후 HEAD의 Typecheck/Lint/Vitest/Build/Playwright E2E/Docker/CI는 **새 Run 결론 전 NOT VERIFIED**. 이전 성공을 소급 전용 금지.
- **G6 실증 구분:** 별도 Windows Nginx/WSL2 사내 PC 2대, 실제 인증된 HTTP 쓰기·Cookie/Role·Site E2E, 실 SQLite·CAD·S3 동시 백업→정식 격리 Migration dry-run→실 Restore/rollback 및 Owner 현장 QA 수용 **NOT RUN**. 운영 인증/API/Prisma/Compose/Nginx/GHCR 자동 활성화 없음. #108 Open, #109 별도 Go/No-Go 전 OFF.

## Issue #108 / G6 — 비운영 준비물 작성·실증 미확보 (2026-10-26)

- **작성한 구현:** offline src/scripts/g6-evidence.mjs(19개 필수 항목·EV ID/동일 snapshot·PC 2대 분리·App/Migrator 일치/운영 OFF 검사·사유코드만 출력), Unit TC-P4-G6-001~006, disposable SQLite online backup+합성 2 Version·local CAD/mock-S3의 격리 DDL dry-run·손상 주입·실복원 Integration TC-P4-G6-007. 예제는 전부 NOT_RUN이며 실제 원격 S3·Nginx·운영 CAD/DB/API에 접속하지 않는다. [Issue108](Issue108.md).
- **새 HEAD 실행 상태:** Typecheck/Lint/npm test/Build/Chromium E2E/Legacy E2E/Docker와 PR CI는 Run/Job 확인 전 **NOT RUN/PENDING**. 코드 작성 또는 이전 G1/G5 CI 성공을 G6 현재 HEAD 합격·현장 PASS로 전용 금지.
- **G6-AC1~4 실 현장:** 사내 PC 2대/PROD Nginx/DEV direct/업로드·Cookie/인증된 보호 Route E2E, **실** DB+CAD+S3 일관 snapshot/운영 Prisma dry-run/실 restore·rollback은 전부 **NOT RUN**, 사내 EV ID/운영자·QA/Owner 증거 없음. G6-AC5는 Git diff상 운영 OFF 유지, 실제 운영 배치 상태 확인은 별도. #108 G6 실증과 #109 Owner Go/No-Go는 미완으로 BLOCKED.
- 신규 PR CI **시작은 성공과 다르며** 요청대로 CI 결과 모니터링·병합·GHCR 게시·실 배포는 수행하지 않는다. 기존 Issue/실패 원장 이력은 보존.


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


### PR #111 — 동시 main #99 통합 HEAD의 검증 경계 (2026-10-25)

- 두 번째 CI [40198344153](https://github.com/planner77/layoutManager/actions/runs/40198344153) E2E 77/78은 #99 선행 병합 **전**의 HEAD `ac9226ff`에 대한 판정이다. #99에서 추가된 실DXF P0/P5 Evidence gate/CLI, Unit, package script를 통합한 새로운 HEAD는 Typecheck/ESLint/Vitest/Build/Chromium/Legacy/Docker 성공을 아직 확인하지 않았다.
- ADR 중복은 #99의 **ADR-052**, #82 Memo의 **ADR-053**으로 분리. 0.41.0(app/lock)과 `verify:outline-acceptance` 보존. 실도면/GPU/Owner/P4 Auth·Memo 영속 활성화는 본 PR의 검증 결과가 아니다.


## Issue #82 / PR #111 — 두 번째 CI: E2E 77/78 및 U1 공유 도크 기대 불일치 (2026-10-25)

- [PR CI #40198344153](https://github.com/planner77/layoutManager/actions/runs/40198344153), HEAD `ac9226ff2e2c619bc009dd8bf293c3f26c22dc44`, synthetic merge `8445df4c361e469d68e161010a66869fdbb0bd75`, **completed/failure**. Verify [Job 121183959441](https://github.com/planner77/layoutManager/actions/runs/40198344153/job/121183959441): Typecheck·ESLint·Vitest (Memo Unit 6 포함)·OCI Unit·synthetic DXF Source benchmark·Production Build SUCCESS, Chromium E2E **77 PASS / 1 FAIL (78건)**, Legacy E2E SKIPPED. Docker [Job 121183959402](https://github.com/planner77/layoutManager/actions/runs/40198344153/job/121183959402) SUCCESS. trace artifact ID `12601805000`. 이 결과는 이전 HEAD 한정.
- 실패 테스트 `src/tests/e2e/issue38-app-shell.spec.ts:58` `TC-U1-E2E-001`: 무Handle fixture의 옛 `viewer-tools-dock` 0 기대/실제 1. U3 Source 선택/Outline 도구는 fail-closed이나 #82 Memo는 독립 WCS 자유 배치 기능이므로 새로운 공유 Dock 자체는 올바르게 표시됨. 제품 코드 변경 없이 기능별 U1 기대값을 분리하고 `TC-M1-E2E-006`(무Handle DXF Memo WCS 배치) 추가.
- 원본 U1/신규 M1 E2E를 skip하거나 기존 Source mapping 검증을 완화하지 않음. 새 수정 HEAD E2E·타 Gate는 **NOT VERIFIED**, 실 CAD/GPU/native·메모 100개 장기 성능은 **NOT RUN**. [FailureLedger](FailureLedger.md), [Issue82](Issue82.md), ADR-053. #96/#83 운영 auth/Memo CRUD 활성화 없음.


## Issue #102 — Owner 공격 대응 비범위 문서 정렬 (2026-10-25)

- G0 #102 및 ADR-051-R1에서 보안 공격/자격증명·세션 탈취 대비 강화·침투시험은 Owner에 의해 비범위로 결정되었다. `OWNER_ACCEPTED_SCOPE`는 **정책상 위험 수용**이며 안전성/침투시험 PASS가 아니다. HTTP 비암호화 위험은 여전히 존재한다.
- PROD 사용자 Nginx 경유 / DEV 개발 App 직접 접속 정책 및 G1~G7 기능·업무/DB 복구 운영 게이트는 유지. 본 문서 전용 변경은 운영 Auth/API/Prisma/Nginx/Docker/DB를 활성화하지 않는다.
- **실행 상태:** 이 문서 작업 자체로 LAN E2E, 기능 E2E, Backup/Migration/Restore, Typecheck, Docker 등 새 실행 결과가 생기지 않는다. 해당 시험은 `NOT RUN` 또는 후속 증거 대기로 명시하며 기존 이력의 PASS를 새 HEAD의 PASS로 전용하지 않는다.
- 근거: [Issue102](Issue102.md), [Issue96](Issue96.md), [ADR-051-R1](Decisions.md), [TestPlan](TestPlan.md). GitHub docs-only PR 생성/CI 시작은 PASS 및 운영 승인과 구별한다.


## Issue #82 / PR #111 — 첫 PR CI 실패와 수정 HEAD 검증 경계 (2026-10-25)

- [첫 Run 40196496297](https://github.com/planner77/layoutManager/actions/runs/40196496297) `1515eca9708258bc0f80c4480773f6d26d06aee7`, `completed/failure`: **TypeScript SUCCESS, ESLint FAILURE(2 errors/2 warnings), Docker Runtime/Migration Job SUCCESS**. ESLint 이후 Vitest/Build/E2E/Legacy **SKIPPED**. 실패 상세/미해결 리뷰는 [FailureLedger](FailureLedger.md) 참조.
- 수정 내용: Overlay `react-hooks/refs` render 금지 제거, unused suppression 제거, E2E let→const. Review P1 `4370961641` 새 배치/기존 pin pointerdown·최근 목록의 독점 도구 전환 일원화, Review P2 `4370961642` 드래그 뒤 synthetic click/동일 memo 재선택에서 미저장 텍스트 덮어쓰기 차단. 신규 E2E `TC-M1-E2E-004/005` 작성.
- 수정 HEAD의 로컬 npm ci/Typecheck/ESLint/Vitest/Build/Playwright/Legacy/Docker/현장 실DXF·GPU/native fullscreen **NOT RUN**. 원본 HEAD의 Typecheck·Docker 성공을 수정 HEAD로 전용하지 않으며 PR CI 새 트리거 이후 종료/성공을 확인할 때만 PASS 표기. 사용자의 요청상 CI 모니터링 생략. #83 서버 저장/인증 BLOCKED 유지.


## U-ISSUE82-M1-20261025 — WCS 세션 메모 구현/시험 코드 작성, 실제 실행 대기

- **범위/출처:** [Issue82](Issue82.md), 상위 #81, [ADR-053](Decisions.md), [Architecture](Architecture.md), [Requirements](Requirements.md). 구현 브랜치 `feat/82-cad-memo-m1`; 최초 main 기준 SHA `ab094a541b4db44c15598f40b0699f8e6214ecae`.
- **코드:** `domain/cad-memo.ts`는 Preview UUIDv4/Version·SHA scope/finite WCS/길이·제어문자/100 memo session 문서. ViewerManager/three-dxf-viewer는 WCS ↔ CSS pixel 카메라 변환과 리프레시 notify. `CadMemoOverlay`는 pin 클릭/ghost drag, label plain-text 및 viewport render 동기화. `CadMemoEditor` 제목·본문/수치 위치를 독립 확정. 기존 UI Outline Tool과 상호 배타 제어.
- **작성된 테스트:** Vitest 6(`TC-M1-UNIT-001~006`), Playwright synthetic DXF 3(`TC-M1-E2E-001~003`), 별도 opt-in Benchmark 2(`TC-M1-BENCH-1000/10000`, 합성 LINE 1k/10k DXF 로드·5 메모·Resize/Reload 계측, 실행 및 값 확인 전). 테스트 추가는 PASS 근거가 아님. 제한/버전·SHA/HTML 문자 표기/부정 입력·Cancel·Reload/Renderer/Mode/기존 Source hit 경계를 검증하도록 설계.
- **실행 상태:** GitHub Connector 원격 브랜치 수정. 컨테이너 `git ls-remote`는 DNS `Could not resolve host: github.com`로 실패해 checkout 불가. `npm ci`/Typecheck/Lint/Unit/Build/Chromium E2E/Legacy migration/Docker/실 CAD·GPU/native fullscreen/100 memos 프레임 실측 **NOT RUN**, PASS·성능 수치·원본 Source 안전 확인 주장 금지. PR 생성에 의한 PR CI 시작/성공/현장 승인 구별.
- **무변경:** `src/app/api`, Prisma/DDL/Migration, Auth/Session/Role/Scope/Audit 운영 기능, Docker/Compose/원본 bytes/SHA·Version/Current, Canvas Source Geometry/GeneratedDocument/Undo/JSON, 이전 #2 description. #83 영속 및 관련 보안 승인 BLOCKED.
- **수용 잔여:** 최신 HEAD CI 모든 Job 실제 성공, 리뷰 미해결 0/Conflict 0 확인 후 후속 merge 판단. DXF 1k/10k/100k·실도면 GPU/Native/DPR/100 메모 성능은 현장별 별도 결과 필요. 실패 확인 전 FailureLedger에 허위 기록 없음.


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

## U-ISSUE76-RECHECK-20261101 — 이전 CI 증거 및 설정 미적용 분리

- [PR #89](https://github.com/planner77/layoutManager/pull/89) 최종 HEAD `959387c6c895a1422574ae32e7b8167593a558f3`, [PR CI 40179740394](https://github.com/planner77/layoutManager/actions/runs/40179740394) success: Verify Job `121128038644`, Docker Job `121128038864` 모두 success. 기존 read-only audit 코드는 Main에 병합됨.
- [Main commit 14111b45](https://github.com/planner77/layoutManager/commit/14111b45a36907245342751d9d1a139b5215474d) subject `#76 | Squash 기본 메시지 정책 진단 및 운영 가이드`, body empty. [Main CI 40182008444](https://github.com/planner77/layoutManager/actions/runs/40182008444) success, 실행명 단일행, scope Job `121134834613` success, GHCR Job `121134862333` skipped. **명시적 API merge 성공이지 저장소 기본값 변경 증거 아님**.
- 2026-11-01 GET 값 `true/COMMIT_OR_PR_TITLE/COMMIT_MESSAGES`로 목표 `true/PR_TITLE/BLANK`와 불일치. AC-76-01/기본값 적용 후 AC-76-03 **BLOCKED**. 이번 문서 PR의 새 CI/실행 결과 및 관리자 Settings 변경은 **NOT VERIFIED / NOT RUN** (과거 결과 재사용 금지).

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
