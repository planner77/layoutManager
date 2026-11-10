# Issue #281 — 로컬 검증과 실패 증거 (Manager 설계, 2026-11-11)

요구 원문: [#281](https://github.com/planner77/layoutManager/issues/281), 우선 정책: [#279](https://github.com/planner77/layoutManager/issues/279). 설계 기준 source `3d4d64d`, package `0.61.1`. 이 문서는 구현 전 요구/AC이며 시험 PASS를 주장하지 않는다. 도구·문서만 변경하므로 앱 버전은 유지한다.

## 범위와 금지

모든 신규 작업은 PR 0, Actions 0. CLI는 로컬 테스트/증거 기록만 수행한다. Git push, workflow dispatch, GHCR login/push, publisher/finalizer, 운영 배포, Issue 댓글/종료 API를 호출하지 않는다. `release`는 로컬 릴리스 관련 검증 프로파일이며 출고 허가가 아니다. #282 출고와 #283 실제 복구, #218/#268 현장 AC는 별도이다. Main 보호/Actions 실제 전환 전 root의 push도 보류한다. 기존 CI·릴리스 기록은 역사로 보존한다.

## 실행 계약

`src/scripts/` 아래 단일 CLI와 package script를 둔다. 예시 계약은 `npm run verify:local -- --issue 281 --profile standard --base <sha>`이며 구현의 최종 help와 Operation에 정확한 옵션을 기록한다. 프로파일은 docs/standard/high-risk/release, plan 모드는 실행할 ID/명령/선정 사유/필수 여부를 표시한다. 회귀 조회는 Issue 번호/모듈/오류 코드로 IssueEvidence와 FailureLedger를 검색하며 shell 문자열 실행을 사용하지 않는다.

변경 집합은 base→HEAD 커밋 차이, staged/unstaged 및 untracked 소스를 합친다. 삭제·rename도 포함한다. 누락/잘못된 base와 읽기 오류는 fail closed. 사용자가 추가한 risk는 합집합이며 자동 감지 위험을 제거할 수 없다. 코드 변경에 docs를 지정하면 거부한다. DB/auth/Scene/Worker/storage/deploy/OCI 경로는 고위험을 강제한다. unknown source는 standard 이상 및 명시적 검토 대상으로 남긴다. `--skip`으로 필수 게이트를 우회하지 않는다. 관련 없는 시나리오만 선정 근거를 가진 SKIP이다.

| 프로파일/위험 | 필수 검증 | 범위 제한 |
| --- | --- | --- |
| docs | 변경 Markdown의 로컬 링크/내용·스펙 정합성과 정책 문구 검토 기록 | 원격 링크 일괄 네트워크 검사나 E2E 없음 |
| standard | Node/lockfile 사전검사, Prisma generate, typecheck, lint, 영향 unit/integration, build, 영향 Playwright, 앱 기동 smoke | 기존 `test:e2e`를 파일/config로 좁힘; 관련성 없는 전 E2E 강제 금지 |
| DB/G7 | standard + 격리 DB migration/upgrade/recovery, G7 인증·권한 음성, 실제 로컬 컨테이너 migration 성공/실패 | 운영 DB/CAD 사용 금지; Docker 없으면 필수 NOT RUN |
| Scene/Worker/storage | standard + 실제 Worker/Scene 지속성 및 복구 integration, 해당 컨테이너/브라우저 시나리오 | 단순 mock PASS로 실제 컨테이너/현장 성공 대체 금지 |
| release/OCI | standard + 세 역할 로컬 빌드/identity·native runtime·migration 음성·관련 OCI 회귀 및 격리 upgrade | 게시/원격 registry 성공/복구점 승인 아님; 외부 baseline 없으면 관련 upgrade NOT RUN |

기존 자산 재사용: `tests/integration/g7-runtime-auth.test.ts`, `g7-runtime-migration.test.ts`, `g7-greenfield-upgrade*.test.ts`, `g7-scene-worker-upgrade-recovery.test.ts`, `scene-cpu-worker-real-g7.test.ts`, `scene-persistence.test.ts`; G7 browser configs와 `test:master-migration`; `scripts/test_g7_deploy.py`, `test_g7_upgrade.py`; `tests/oci/test_*`의 관련 음성 회귀. 실제 실행 이름은 파일 존재/자체 격리 동작을 확인하고 manifest에 고정한다. CI의 standalone/native SQLite/nonroot/migration failure 검사를 로컬 reusable script로 옮긴다. YAML을 통째로 실행하거나 legacy GitHub 승인/PR 체크를 새 게이트로 호출하지 않는다. 기존 CI 원본은 역사 보존하며 새 CLI에만 local orchestration을 둬도 된다.

## 결과·증거 계약

사전 기록: UTC 시각, commit/tree, dirty와 변경 내용 fingerprint(새 파일 포함), 변경 경로, base, Node/npm/Python/OS, Docker client/server/Compose의 관측 상태, package/lockfile SHA256, 프로파일/위험/선정 사유. `.env` 값·환경 전체·인증 remote URL은 읽어 출력하지 않는다. 실행 전후 소스 fingerprint가 달라지면 stale 결과로 차단한다. 생성된 evidence/log/cache/build 자체는 소스 fingerprint 대상에서 제외하되 구현/테스트 파일은 제외하지 않는다.

각 시나리오는 ID, argv/cwd, 필수 여부, 시작/종료, exit code, PASS/FAIL/SKIP/NOT RUN, 이유, 마스킹된 로그 경로를 가진다. spawn 실패/timeout/신호도 기록한다. 실행되지 않은 후속 항목은 NOT RUN이며 PASS 수에 포함하지 않는다. 필수 FAIL 또는 NOT RUN은 비영 종료, 필수 PASS가 없으면 성공 불가. 로그/증거 기록 실패도 비영 종료다. 기본 중단 후 남은 계획을 보존하거나 안전한 독립 게이트를 계속 실행할 수 있으나 aggregate 차단은 유지한다.

`out/IssueEvidence/<issue>.md`는 append-only 정본이다. 각 run의 고유 ID와 SHA256를 가진 JSON export를 별도 불변 파일로 저장한다(소스/설정/테스트 코드는 src/, JSON은 결과 산출물). 동일 ID 덮어쓰기, 기존 MD truncate, symlink/path traversal 거부; 동시 append는 잠금/배타 생성으로 충돌 차단. MD/JSON 쓰기 중단을 PASS로 처리하지 않으며 재시도 시 동일 run 중복/부분 상태를 탐지한다. 로그는 Git 제외 경로에 저장하고 raw stdout/stderr도 저장 전에 마스킹한다. known secret 값과 일반 token/auth URL/header 패턴을 검증하되 완전한 개인정보 탐지라고 주장하지 않는다.

실패마다 재현 조건·원인(미확인이면 UNKNOWN)·수정 commit(미커밋이면 pending + fingerprint)·추가 회귀·연결 재시험 run을 기록한다. 기존 실패 run을 수정하지 않고 후속 해석을 append한다. FailureLedger에는 Issue/GitHub/증거/run/오류 코드/모듈 인덱스를 추가한다. owner 예외는 명시 증거·영향·복구·후속 Issue가 있는 비치명 Known Issue만 문서화하며, 필수 미실행/보안/데이터 손상/마이그레이션/이미지 불일치를 PASS로 바꾸지 않는다. 과거 성공은 같은 소스+환경+범위에서만 참고; 자동 skip/reuse 기능은 구현하지 않아도 된다.

## AC와 QA 추적

| AC / TC | 확인 방법 | 초기 결과 |
| --- | --- | --- |
| AC281-1 / TC281-01 | 네 프로파일 plan, 실제 실행·exit/log; 영향 없는 E2E 미선정, docs downgrade/잘못된 base 거부 | NOT RUN |
| AC281-2 / TC281-02 | 격리 검증 fixture를 의도적으로 깨뜨려 실제 FAIL 기록 → 원인 기록 → fixture 수정 → 동일 시나리오 재실행 PASS; 실패 원장/JSON/MD 원본 유지 확인 | NOT RUN |
| AC281-3 / TC281-03 | mandatory prerequisite 누락·timeout·spawn 오류에서 NOT RUN/nonzero; SKIP 사유와 PASS 합계 구분 | NOT RUN |
| AC281-4 / TC281-04 | 실제 DB/G7/Scene Worker integration, OCI 음성 및 격리 Docker 검사 실행; 위험별 stop rule 회귀 | NOT RUN |
| AC281-5 / TC281-05 | append 재실행/동시 실행/부분 쓰기·source drift/secret redaction/lookup 검증 | NOT RUN |
| AC281-6 / TC281-06 | AGENTS/README/Operation/TestPlan/TestReport/FailureLedger/Decisions 및 관련 가이드 최신 정책 일치; API/PR/Actions/publish write 0 | NOT RUN |

의도적 실패는 production 코드 또는 실제 데이터 파손 없이 disposable fixture로 만든다. 단순 expected-error unit test PASS만으로 FAIL→수정→PASS 실증을 대체하지 않는다. QA는 실제 CLI run 두 건을 별도로 보존하고 수정 내용/commit 또는 pending fingerprint를 기록한다. 실제 고위험 prerequisite 미비 시 미실행을 명시하고 AC 완료를 보류한다.

## 역할·인수

Manager가 이 설계를 선행 기록, Developer 구현 후 Manager 검토, 독립 QA가 실제 검증·문서화, Manager 인수 또는 재작업, root만 commit/push 담당. 구현과 증거 완성은 local 진행 가능하나 Owner 설정 변경 전 publish/push는 금지한다.

## Manager 최종 로컬 인수 판단 (2026-11-11)

Manager는 [TestReport U-281-20261111](TestReport.md#u-281-20261111--로컬-검증-cli-및-독립-qa) 및 [독립 QA 증거](IssueEvidence/281.md), 보완된 CLI/격리 Docker/Smoke 구현을 검토하고 **로컬 구현·검증 범위를 인수**한다. 추가 코드 재작업은 요구하지 않는다. 최종 run `issue-281-20261110T221212-83a9616e93f2` JSON을 직접 읽어 필수 19/19 PASS, stale=false, 시작·종료 source 일치와 SHA256 `5f5d3da619cbd60be6b55fff413f5aeef85740af18687e75aacecd366503c47d`를 확인했다. 최초 Docker cleanup FAIL과 후속 PASS 연결은 보존되어 있다. 시험 후 문서 보완은 이 실행의 source fingerprint와 구분하며 새 commit 전체를 다시 시험했다고 주장하지 않는다.

| AC | Manager 판단 | 근거·한계 |
| --- | --- | --- |
| AC281-1 | 로컬 수용 | 프로파일 선정/거부, 실제 high-risk 실행 및 docs fixture 확인. release는 계획과 필수 baseline 미비 차단만 확인했으며 전체 실행 NOT RUN. |
| AC281-2 | 수용 | 격리 broken-link FAIL `076048f45b47` → 수정 → PASS `bee5ca2a1bc1`, 불변 원본과 append 해석 보존. |
| AC281-3 | 수용 | 필수 실패 후 NOT RUN, spawn/timeout NOT RUN, unrelated SKIP와 필수 PASS 분리 확인. |
| AC281-4 | 로컬 수용 | 실제 G7/DB/Scene/Worker 및 세 OCI 역할·native SQLite·migration 음성·OCI Worker proof PASS. 운영 복구/현장 수용 증거는 아님. |
| AC281-5 | 수용 | 계약 10개와 독립 QA의 redaction, fingerprint drift, 동시 append 충돌, partial export, lookup, symlink 검사 근거 확인. |
| AC281-6 | 로컬 문서·정책 수용 | 문서 추적과 PR/Actions/publish write 0 유지. 원격 정책 전환과 출고 완료는 아래 차단 상태 유지. |

Root의 staged diff/Secret·산출물 제외 최종 검토 후 **로컬 commit 진행 가능**. 원격 Main PR/check ruleset과 Actions가 활성인 현 상태에서는 push BLOCKED이다. #282 수동 게시 gate/승인·receipt 및 #283 실제 baseline upgrade/복구는 NOT RUN/BLOCKED이며, 기존 GHCR digest 조회는 이를 대체하지 않는다. 따라서 Issue #281 전체 출고 완료·이슈 종료·GHCR 게시·운영 배포 승인은 하지 않는다. 다음 작업은 이 로컬 결과 보존과 해당 별도 차단 조건의 해결이다.
