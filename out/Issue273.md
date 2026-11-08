## RF-02 후속 Unit — 보호된 PR 통합 및 Main CI 증거 (2026-11-08)

**선행 완료:** PR #274 source HEAD `697cfe3ef551aaa7583a7dac4d5b5790316e1a97`, [PR CI 42487447127](https://github.com/planner77/layoutManager/actions/runs/42487447127) (8 applicable SUCCESS/A2 scoped SKIP), squash [Main 9635b153](https://github.com/planner77/layoutManager/commit/9635b153a9c28f365b2485abb5d76d32f5be62ac), tree `fdb2396c455a744919be6a4fa8d9f96387e8c2ae`, [Main CI 42489515024](https://github.com/planner77/layoutManager/actions/runs/42489515024) read-only HOLD SUCCESS. Issue #273은 아직 OPEN.

**이번 Unit 구현:** `release_finalizer_integrate.py`와 read-only GraphQL review-thread 조회/Ruleset 검증/기존 RF01 exact packet·CI·source 재사용, `release-finalizer-integrate.yml`에서 Owner 수동 `plan`·`integrate`·`readback` 분리. Normal REST merge `sha=prHeadSha`, `merge_method=squash` 외 Repo/Issue/GHCR/Tag mutation0; Main exact base CAS·thread resolution·실제 적용 CI·Review requested changes·ruleset 정책/관리자 bypass 부재 필요. Merge 뒤 Main push CI 실행은 GitHub 기존 workflow에 맡기고 **감시·성공 자동 승격 없음**. Main 미완료는 `MERGED_WAITING_MAIN_CI`로만 남기고, 재사용/최종 release는 별도 검증한다. API merge timeout/unknown은 자동 재시도/롤백 금지. 외부 write 경로는 Owner dispatch+GitHub Ruleset으로 제한.

**이후:** RF-01 durable checkpoint/nonce, RF-03 `0.61.1+` exact App/Migrator/CPU Worker candidate/promotion 2독립 Owner Environment 승인, RF-04 전체 AC 승인·Issue Close는 미구현/NOT VERIFIED. 보존: #229 HOLD_MAIN/TAG_BLOCKED, 기존 0.61.0 3digest/Tag/latest·운영 Worker/데이터/복구점. 새 Unit의 exact HEAD CI는 아직 NOT VERIFIED.

---

## RF-01 PR #274 리뷰 보완 — PR CI association 강제 (2026-11-08)

GitHub [PR CI run42485818897](https://github.com/planner77/layoutManager/actions/runs/42485818897)은 HEAD `f88198dfccf0940b3ab3c95947928033b65b9bfe`의 요구 Job SUCCESS였지만 Ready 이벤트 후 P2 review 1건이 신규 등록됐다. `workflow_run.pull_requests`가 다른 PR 번호를 포함하면 같은 `head_sha`·`head_branch`여도 **해당 PR의 성공 증거가 아니다**. 기존 fallback은 이미 **squash merged**이고 연관 배열이 완전히 빈 경우에만 허용한다. Open PR association 공백은 `WAITING_EXACT_PR_CI`. 자기 PR 실패 + 더 최신 다른 PR 성공은 `RF_LATEST_CI_NOT_SUCCESS`로 중단하며 기존 성공을 대체하지 않는다. 패치 후 CI는 별도 새 HEAD 검증 필요. Release/Issue writer, #229 HOLD 보존.

---

## RF-01 추가 안전 계약 — Release Target·AC·TTL·CI Attempt (2026-11-08)

기존 PR274 HEAD `e4926f3f`의 CI [42481792421](https://github.com/planner77/layoutManager/actions/runs/42481792421)은 적용 8개 Job 성공/A2 scoped SKIP(신규 HEAD 증거 아님). `RELEASE_FINALIZER_REQUEST_V1`에 필수 필드를 추가한다: `releaseTarget=ghcr.io/planner77/layoutmanager:v<version>`, `acceptanceIds`(고유·대문자 AC 식별자 목록, closeIssue=true면 최소 1개), `ownerIntent={integrate,release,closeIssue}`(요청 의도만 표시), `issuedAtEpoch`/`expiresAtEpoch`(UTC seconds; 발급≤현재≤만료, 기간≤24h). Hash/intent는 Owner 승인 서명이 아니다. PR/Main workflow와 필수 Job의 `run_attempt=1`만 증거로 인정; attempt2+ 거부. PLAN workflow Owner actor/repo ID 제한 및 GET-only 유지. RF-01 checkpoint/nonce 영속 재사용 차단과 RF-02~04 실제 writer는 별도 구현이 필요하며 이 변경으로 최종화 완료를 주장하지 않는다. 보호된 두 Owner Environment 및 #229 HOLD 불변.

---

# Issue #273 — Release Finalizer 공통 기능 (정확한 Release만, #229 HOLD 유지)

- GitHub: https://github.com/planner77/layoutManager/issues/273
- 생성일: 2026-11-08
- 관련: #229/#218/#225/#268, PR #272(Main 42a370c)
- 구현 순서: RF-01 read-only plan → RF-02 protected merge/Main orchestration → RF-03 exact 3-image release → RF-04 Issue AC closure
- **정본**: 최신 Issue #273 본문, 기존 [Issue218LeanPolicy](Issue218LeanPolicy.md), [Decisions](Decisions.md), [Operation](Operation.md), [FailureLedger](FailureLedger.md)

## 결정 — one-shot은 검증/승인 생략이 아님

**Owner 요청 1회**를 하나의 최종화 작업으로 추적하되, Main PR CI·RuleSuite·실제 GHCR 출고·Issue 완료 AC를 독립 Gate로 둔다. 기존 #229 `HOLD_MAIN`와 `G7_RELEASE_HOLD_TAG_BLOCKED`는 유지한다. `docker-publish.yml`의 2-image publisher를 0.61.1에 일반 허용하지 않는다. App/Migrator/CPU Worker 세 역할은 protected candidate/promotion과 정확한 digest/attestation/OCI/source/version verification 후에만 별도 출고한다. 기존 release candidate/promotion의 각각 별도 Owner `workflow_dispatch`/Environment review를 위조하거나 재사용하지 않는다.

사용자의 기존 0.61.0 제한 LINE pilot 운영 DB/CAD/Volume/.env/Scene flags/Worker1, 기존 digest, 태그/latest, 백업/복구점은 이 Issue만으로 변경하지 않는다. 현재 #218은 L-01~08 공식 closure 대조 없이 종료할 수 없다.

## RF-01: 현재 PR의 구현 범위

### 순수 정책기 / GitHub 읽기 전용 연결

- `src/tests/oci/release_finalizer.py`: SHA256으로 묶은 닫힌 `RELEASE_FINALIZER_REQUEST_V1` schema 검증 (repo ID/Owner ID/Issue/PR/head/tree/base/version>=0.61.0/세 역할/nonce/stop policy).
- read-only GitHub GET adapter로 정확 PR_HEAD / source tree / source package version / Issue identity, **가장 최근 PR CI** 및 필수 aggregate/scope check 확인. Ready 전환으로 시작된 최신 CI가 실패 또는 미완료라면 과거 PASS 사용 금지.
- Squash 후에는 merge commit tree 및 **단일 parent=승인된 base SHA** 검증. Main push exact merge SHA의 `main-hold.yml` 성공을 확인. PR의 `base.sha`가 병합 뒤 다른 커밋으로 진전될 수 있으므로 이 경우에도 merge parent를 정본으로 사용.
- API가 pagination/응답/역할/버전/증거를 확인하지 못하면 fail-closed. 출력은 고정 진단코드와 `externalWrites=0`. 범위 외 API method, repo, GHCR, 운영, Issue write 불가능.
- `.github/workflows/release-finalizer.yml`: `workflow_dispatch` read-only `plan`만 허용. `permissions: {}` 최상위, job에 contents/pulls/issues/actions read, persist-credentials false. **실행 승인·후속 변이 권한이 아니다.**
- `test_release_finalizer.py`의 긍정·음성 검증을 필수 PR Scope에 연결.

### 계획 출력 상태

`WAITING_EXACT_PR_CI` → `WAITING_READY_CI` 또는 `AWAITING_REVIEW_AND_PROTECTED_MERGE` → `WAITING_EXACT_MAIN_CI` → `AWAITING_PROTECTED_THREE_ROLE_RELEASE` → (향후) `AWAITING_INDEPENDENT_ISSUE_ACCEPTANCE`.

주의: `releaseRequired=false`인 경우에도 계획만 출력하며 실제 종료되지 않는다. 어떤 값이든 이번 RF-01은 RELEASE_AUTHORIZATION과 ISSUE_ACCEPTANCE를 `NOT_VERIFIED`로 표시한다.

## RF-02~04: 후속 구현 필요 (이번 PR에 포함되지 않음)

1. **RF-02:** 현재 저장소 `allow_auto_merge=false`; Ruleset 요구 검사 통과 후 API squash/CAS 및 Main workflow run/attempt 검증, 예외 거부/재개. 새로운 메인 커밋·소스 drift 시 HALT. API/Ruleset 승인을 무시하지 않는다.
2. **RF-03:** 기존 후보/승격 코드는 `0.61.0` 고정 계약이므로 0.61.1과 후속 버전을 안전하게 parameterize 하되 immutable historical 0.61.0 근거 보존. 별도 보호 환경 Owner 두 승인·서명·3role digest proof, old aliases/partial/unknown fail closed. 절대로 #229 Main/Tag에 광범위 예외를 넣지 않는다. 이미 존재하는 immutable source/digest의 재사용은 정확 검증 증거에 한정.
3. **RF-04:** 모든 Issue AC를 명시적으로 검증된 receipt/Owner close GO에 결합한 뒤만 1회 close; 미완료는 OPEN. stage evidence, 실패 원장/기존 근거 재사용, retry/unknown partial provenance와 보존 범위 분리.

## 검증 결과 분리

- RF-01 GitHub repository 코드 작성 및 설계 대조: **IMPLEMENTED, 아직 Hosted CI 성공 증거 없음**.
- Python static/negative unit: 코드 포함, CI 실행 결과 확인 전 **NOT VERIFIED**.
- protected PR merge/Main auto-link / 0.61.1 실제 protected GHCR 게시 / Issue 자동 close: **NOT IMPLEMENTED / NOT RUN**.
- 기존 release #229 HOLD는 코드 미변경; 기존 #225 candidate/promote 승인, OCI role, digest, alias 검증도 미변경.

## 다음 승인/개발 단계

RF-01 PR의 정확 HEAD CI를 성공시킨 후 RF-02부터 implementation. 외부 환경 변경이 필요하면 Owner/Ruleset이 명시한 별도 승인 필요. 어떤 경우에도 `GO-INTEGRATE` = `RELEASE GO` = `ISSUE CLOSED`로 자동 합성하지 않는다.
