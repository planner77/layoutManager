# Issue #282 — 로컬 3-role GHCR 출고 계약

2026-11-11 exact source `a53921a180d77861b232fb98aa6989b678aca8ac` / version `0.61.1`의 전체 release 23/23·3-role build/compatibility를 검증하고, 정확 plan에 대한 실제 Owner GO로 candidate `CANDIDATE_VERIFIED` 및 final `COMPLETE` 게시를 완료했다. 실제 시험·게시 근거는 [IssueEvidence/282](IssueEvidence/282.md)와 [TestReport](TestReport.md)를 따른다. 게시 후 독립 QA와 Manager 최종 판정은 아래 후속 항목에 기록한다. 상위 #279 PR0/Actions0 정책, #281 로컬 검증과 #283 복구 증거를 사용한다. 과거 CI/서명 workflow의 성공·승인을 신규 출고 권한으로 승계하지 않는다. 요구 원문: GitHub #282. 운영 배포·rollback·Git tag/latest 변경은 이 CLI 범위 밖이다.

## 요구·상태

R282-1: `release-local` 하나의 CLI로 read-only plan/dry-run/preflight, 정확 세 역할의 로컬 build·검사, 수동 승인된 candidate 게시/readback, final 게시/readback, immutable receipt 및 read-only reconcile을 제공한다. App/Migrator/CPU Worker 정확 releaseVersion/sourceCommit/tree/platform/role와 실행 제약을 검증한다.

R282-2: 모든 원격 쓰기 전에 clean exact source, 지정 remote의 origin/main 일치, 유효 SemVer 및 신규 immutable final refs, 실제 #281 release 필수 시험 PASS, #283의 검증된 복구·이전 버전 호환 증거, 기존0.61.0 세 digest/latest baseline, 패키지 visibility/repo 연결 및 실제 credential 권한을 확인한다. 최초 설계 당시 Main ruleset26731716은 PR/check 필수이며 Actions14개 active였다. 실제 cutover 후 repository Actions 및 workflows15개는 disabled, Main ruleset26731716은 deletion/non-fast-forward 보호만 유지하며 Tag ruleset26731135는 보존한다. 매 실행의 최신 readback을 확인한 후에만 Main push를 수행한다. CLI는 관리자 설정을 변경하지 않는다.

R282-3: Owner는 구체적 releaseVersion + 정확 git SHA + 세 role manifest digest + candidate/final ref + baseline + 증거 hash가 제시된 후 실제 출고 GO를 준다. 일반 구현/준비 승인은 이 digest 승인과 다르다. CLI 승인 입력은 실제 대화/Owner 기록에 결합한 로컬 audit record이며 자작 `approved=true`나 GO 문자열·checksum을 Owner 신원/서명으로 간주하지 않는다. Root가 실제 승인 기록을 보존하고 승인된 정확 plan만 실행한다. 확인 가능한 구체 plan 전 승인 질문을 만들지 않는다.

R282-4: 3-role 게시가 비원자적임을 명시한다. durable attempt journal에 요청 전 의도를 fsync하고 확인된 응답/digest만 기록한다. PARTIAL/UNKNOWN/HALT 후 자동 재시도·overwrite·delete·latest 이동0. 재실행은 journal을 탐지해 read-only reconcile만 허용한다. 현 상태 판별 후 새로운 별도 실행 결정 없이 남은 쓰기를 계속하지 않는다.

## 최소 설계

`release-local`은 source/proof 검증, OCI graph 검사, 제한된 GHCR transport, journal/publish orchestrator로 분리한다. 기존 `candidate_registry.collect_graph`, raw manifest/descriptor hash·size·media type 검사, `rf03_registry_promotion`의 transport 독립 검증·불변성 알고리즘을 재사용한다. version-generic 함수가 이미 제공되면 얇은 adapter를 쓰고 CI packet/run ID/보호환경/signature workflow에 묶인 상위 경로는 호출하지 않는다. 기존 모듈 전체 복제나 임의 run ID/가짜 attestations로 계약을 충족하지 않는다. 필요한 순수 함수 추출은 기존 회귀를 유지한다.

1. **plan/dry-run:** source SHA/tree/version, 환경 버전, 세 target/ref, 필요한 시험/복구 증거와 미충족 조건을 출력한다. dirty/unpushed 개발 트리의 dry-run은 준비 상태를 보여줄 수 있으나 release-ready로 표시하지 않는다. Docker local build/검사는 별도 명시 action이며 dry-run에서 registry/Git/운영 쓰기0.
2. **build/preflight:** 정확 git archive source에서 linux/amd64 세 이미지 생성, labels/source/version/role·healthcheck/UID/cap/network/runtime 제약 확인 및 owned isolated smoke. OCI layout/archive의 manifest/config/layers 원본 bytes SHA/size를 독립 검사해 게시 전 정확 digest를 확정한다. source/project root의 .env/CAD/DB/Git credential이 build context에 섞이지 않는다. build provenance는 로컬 evidence이며 서명된 CI provenance라고 표현하지 않는다.
3. **Owner review:** 로컬 검증 candidate의 세 digest와 immutable refs/기존 baseline을 제시한다. 실제 GO는 해당 plan으로 candidate→final 출고를 허용하는 범위를 명시한다. remote candidate가 필요하더라도 승인 전에 원격 게시하지 않는다. candidate upload 시 도구가 manifest를 변환해 digest가 달라지면 승인 불일치로 STOP한다.
4. **candidate:** 단일 publisher lock/새 private journal, exact candidate namespace·tag allowlist, 기존 ref 부재 검사, 최소 GHCR write credential 사용. blob upload와 manifest PUT도 별도 불확실 상태를 기록한다. 응답 불명/401/403/timeout 또는 기존 ref 발견 시 STOP. 세 role 모두 실제 GHCR raw manifest/config/layer graph와 일치하고 격리 pull smoke가 PASS일 때만 final 단계 허용한다.
5. **final:** 동일 raw manifest bytes를 신규 exact version의 app/migrate/cpu-worker 세 refs로 제한적으로 게시. 직전 source/proof/baseline/Owner plan binding을 재검사한다. 어떤 기존 tag도 덮어쓰지 않는다. 세 remote final graph 독립 readback, previous0.61.0 three-role/latest 불변, 정확 digest pull/isolated runtime smoke 후 COMPLETE receipt를 봉인한다. 마지막 검사 실패는 journal 완료처럼 보여도 전체 HALT다.
6. **reconcile:** 실제 remote GET/HEAD와 journal을 비교하는 읽기 전용 절차. 확인된 일부/불확실 상태·수동 다음 판단을 보고한다. 자동 이어쓰기·보상 삭제 없음. 동시 외부 writer를 local lock만으로 배제했다고 주장하지 않는다.

## #281 / #283 증거 결합

현재 `verify_local.py`의 release `external-baseline-upgrade`는 hardcoded 필수 NOT RUN이다. 이를 단순 제거하거나 caller가 제출한 PASS JSON으로 치환하지 않는다. #283 verifier를 실제 호출해 strict receipt schema/source provenance, sealed archive 실제 bytes/hash, private snapshot→fresh owned restore 결과와 G7/schema/CAD/Scene identity 및 image compatibility를 독립 재검증한다. input recovery receipt는 같은 검토된 recovery 구현 fingerprint에 결합하고, 과거 운영 image source가 release source와 다름은 의도된 baseline 차이로 분리한다.

#281 **현재 release 실행**은 exact release SHA/tree와 검증 코드/시나리오 fingerprint에 결합하며 필수 case 집합·exit/status·artifact SHA·pre/post source 불변을 검사한다. 이전 소스의 PASS를 새 release 검사로 승계하지 않는다. recovery capture는 이전 baseline이지만 release 후보의 upgrade/compatibility 시험은 현재 후보의 정확 3-role digest로 수행한다. 동일 schema 호환 edge도 등록 registry와 실제 clone startup/검사를 통과해야 하며 recovery만으로 upgrade 시험을 생략하지 않는다. 누락·tamper·경로 탈출·source mismatch·현재 필요한 NOT RUN은 release 차단이다.

검증 runner가 Git tracked 결과를 append하므로 **release source freeze와 증거 기록이 순환하지 않도록** runtime proof를 ignored private directory에 저장하고, exact source pre/post 확인 뒤 공개 요약을 후속 docs 기록으로 분리한다. publish source는 확인된 commit으로 유지하고 docs-only 새 HEAD를 임의 동일 source로 간주하지 않는다. 필요 시 전용 clean worktree에서 검증한 exact archive를 사용한다.

Receipt 필드: schemaVersion, issueIds, exact sourceCommit/tree/version, testedAt, local test run/artifact hashes, recovery/compatibility proof IDs/hashes, role descriptors 및 OCI byte 검증, Owner 승인 참조, baseline/candidate/final readbacks, journal hash, partialState, limits. 원본 credential/header/registry upload URL·설정/DB/CAD 원문을 기록하지 않는다. checksum은 서명/Owner authority와 별개다.

## 복구 선행조건의 판정 범위

#279 step2는 최소 로컬 백업/격리 복원 실증을 cutover 조건으로 삼고, #282 요구6은 실제 설치/업그레이드 전에 복구점과 migration/deploy/post-check를 요구한다. 따라서 **실제 검증된 로컬 restore baseline 및 현재 후보 compatibility**는 이미지 QA/게시 필수 조건이다. 외부 장애 도메인 backup/key custody는 #283 재해 복구 정책의 독립 미완료 조건으로 유지하며, 외부 보관 미실행만을 이미지 게시의 추가 차단으로 만들지 않는다. #283 전체 완료나 운영 배포 수용을 주장할 수 없으며 운영 배포/DR 판단에서는 외부 보관 공백을 명시적으로 처리한다. 사용자 NAS 등 목적지가 아직 없으면 NOT RUN으로 남기며 기존 로컬 복구 PASS를 재해 복구 PASS로 확대하지 않는다.

## AC·시험

| AC | 시험 | 수용 기준 |
| --- | --- | --- |
| AC282-1 | L01 source/proof | dirty/stale main/wrong version·role/source/platform·missing/tampered/NOT RUN 증거 차단 |
| AC282-2 | L02 dry-run | 쓰기0, 정확 refs/3-role 요청/미충족 조건, fake readiness0 |
| AC282-3 | L03 recovery | #283 실제 bytes/restore verifier 연결, forged PASS·이전 SHA·깨진 archive 거부; current candidate compatibility |
| AC282-4 | L04 approval | 실제 Owner 승인 참조와 exact SHA/version/3digest 일치; digest 변경·self-claimed authority 거부 |
| AC282-5 | L05 OCI/journal | blob/manifest timeout·401/403·부분 성공·중복 ref·concurrent invocation·journal corruption STOP, 자동 재시도/overwrite/delete0 |
| AC282-6 | L06 final integrity | post-check 실패→HALT, original three/latest drift 거부, OCI graph 변조 거부 |
| AC282-7 | L07 live release | 최초 실제 candidate/final 세 digest readback+pull smoke+baseline 불변; 실제 GO/receipt/원장 연결 |
| AC282-8 | L08 scope | PR/Actions0·secret0·Git tag/latest/운영 변경0, #229/#231 기존 보호 유지 |

코드·synthetic 시험·격리 registry proof는 실제 GHCR 출고 성공을 대신하지 않는다. Manager가 Developer 완료를 검토한 뒤 QA가 독립 시험한다. Root가 최종 commit/source 검증·#279 cutover·Main push를 맡고, exact3digest 실제 Owner GO 이후에만 원격 출고한다. 설정 전환 권한은 현재 gh/API와 repository admin 실제 readback으로 확인하며 과거 문서의 도구 PATCH 부재를 영구 기술 차단으로 승계하지 않는다.

## Manager 판정 — 2026-11-11 소스 동결 전

독립 QA의 신규 OCI/publisher 11건·기존 verifier CLI 11건 PASS, 실제 sealed #283 baseline 재복원/검증/probe PASS 및 dirty plan의 UNREADY를 검토했다. 구현을 **Root의 clean source 동결·정확 3-role build·현재 source 전체 release profile·후보 compatibility 단계 진행에 수용**한다. 실제 근거는 [IssueEvidence/282](IssueEvidence/282.md)의 U282-QA 항목이다. 이는 L07 실제 게시 수용이나 Owner 출고 GO가 아니며 현재 SHA의 전체 release 시험/후보 build·upgrade/원격 candidate·final은 미실행이다. 이후 Root가 실제 결과와 cutover·push를 별도 판정하고, 구체 세 digest가 확정된 plan에 대한 Owner GO 뒤에만 GHCR를 쓴다. 공개 후속 결과는 동결 소스를 변경하지 않도록 별도 docs commit에 기록한다.

## Manager repair scope — 2026-11-11 shared OCI object path

실제 source `5ec97762a77817c7257850c5b6fa6a984cb5efd2` candidate 시도는 blob 확인 뒤 `CA_LOCAL_BLOB_CHANGED`로 HALT했다. Root가 실제 journal/read-only reconcile 및 실패 원장을 기록한다. 본 보완은 기존 시도를 재개하지 않으며 새 source/세 digest/plan과 새 실제 Owner GO 이전 GHCR 쓰기0이다.

- 요구·설계: 세 role graph의 동일 digest/size/mediaType blob은 별도 추출 경로를 가질 수 있다. 공통 transport binding이 마지막 role 경로로 덮어써 앞 role 경로를 거부하는 경계를 수정한다. 원본 graph proof를 변형하지 않고 caller descriptor/path 및 실제 bytes 검증을 유지하며, 상속 transport가 하나의 검증된 canonical binding으로 업로드하도록 한다. fixed route, hash/size/media, no overwrite/retry/delete 및 요청 전 fsync 계약은 유지한다.
- AC-L05-SHARED: 실제 상속 `GHCR.upload_blob`를 통과하는 세 graph/동일 blob/서로 다른 경로 회귀를 먼저 실패로 재현한 후 PASS한다. descriptor 충돌, caller 경로/bytes 변조를 원격 쓰기 전에 거부하고 graph 불변성을 확인한다. fake publisher만 사용하는 시험은 충분하지 않다.
- AC-L05-PENDING: 기존 `candidate_policy.Pending`은 CLI에서 비밀·URL·traceback 없는 HALT로 끝나며 원래 durable journal HALT와 자동 재시도 금지를 유지한다. 기존 local-release/transport 음성 계약을 재검증한다.
- 역할: Manager gpt-6-astra가 범위·AC/구현 검토, Developer gpt-6-sol이 최소 구현·회귀, 이후 QA gpt-6-luna가 독립 focused 검증한다. Root가 최종 commit/push 및 새 exact-source build/full release/compatibility와 구체 Owner review를 수행한다. 본 단계는 App 광범위 시험·실제 게시를 반복하지 않는다.

### Manager repair review — accepted for fresh source preparation

Developer의 실제 상속 transport 회귀가 수정 전 `CA_LOCAL_BLOB_CHANGED`로 실패하고 수정 후 PASS한 근거와 canonical binding/role별 descriptor·path·bytes 검사를 검토했다. 독립 QA는 같은 길이 caller/canonical byte 변조의 쓰기 전 거부, 원본 graph 불변, Pending의 durable HALT·재실행 거부·CLI 비밀 비출력을 확인했다. QA focused 13/13 및 기존 OCI 349/349 PASS, 상세 결과와 실제 모델은 TestReport U282-QA-SHARED-20261111에 기록했다. 수정 구현을 Root의 새 commit/source freeze·3-role build·전체 release·compatibility 검증으로 넘긴다. 기존 HALT 재개/새 GHCR 쓰기 승인이나 L07 완료가 아니며, 새 SHA와 새 세 digest/plan에 대한 실제 Owner GO가 필요하다.


## Manager 최종 게시 수용 — 2026-11-11

Manager `gpt-6-astra`는 Root의 실제 실행 영수증과 독립 QA `gpt-6-luna`의 [U282-QA-ACTUAL-RELEASE-20261111](TestReport.md) 결과를 검토해 **AC282-7 실제 candidate→final 이미지 게시와 AC282-8 범위 보전을 수용**한다. source는 `a53921a180d77861b232fb98aa6989b678aca8ac`, tree는 `d09f1e68d820172c030f51520cd9992fd98a7174`, version은 `0.61.1`이다. 앞선 구현·음성 회귀 결과와 새 exact-source release 23/23·3-role build·실제 sealed baseline compatibility 근거는 [IssueEvidence/282](IssueEvidence/282.md)에 연결한다.

- 실제 사용자 응답 `승인합니다`는 plan SHA256 `e428b571f59b5d60db5319f8e74cfdf78b33b233753b8c0252865542518a584b`의 정확 source·세 digest·candidate/final 범위에 결합됐다. Candidate receipt `135f9ce536df238a876008ab354539735d02efa03eff0f1d7bb752cbbd81d2a0`는 `CANDIDATE_VERIFIED`, final receipt `5d6e386fddd159e9cc629f2b6887f9d5627db8da1880ac08b4965224fe02cdfa`는 `COMPLETE`이며 두 journal의 terminal `VERIFIED`와 hash chain을 QA가 독립 확인했다. Owner 대화 기록과 checksum은 암호학적 서명/신원 증명이 아니다.
- Root 실제 CLI는 두 단계에서 승인된 세 top-index digest의 전체 raw graph byte 검증·정확 digest pull·격리 runtime smoke 및 네 historical baseline 불변을 통과했다. QA는 별도로 현재 원격 여섯 ref의 raw top index/child manifest/config와 layer descriptor를 읽어 source/version/platform/digest를 검증했다. QA의 metadata 검증을 full layer 재다운로드나 runtime 재실행으로 표현하지 않는다.
- 현재 Actions disabled·15 workflows disabled·해당 source Actions run0, Main deletion/non-fast-forward 보호와 Tag 보호 유지, 기존 Worker ID/image/RW mount 및 원본 checkout 사용자 수정 보존을 확인했다. 첫 `5ec9776` 시도의 HALT는 별도 실패 이력으로 보존하며 새 시도를 그 재개로 간주하지 않는다.
- 이번 수용은 이미지 게시 범위다. host writer exclusion `NOT_PROVEN`, 실제 사용자 login/auth·off-host backup/key custody `NOT_RUN`, READY Scene `NOT_EXERCISED`는 남는다. 운영 배포/rollback·전체 DR 수용·Issue 종료는 수행하거나 승인하지 않았다. #229/#231 기존 보호를 해제하지 않는다.

Root가 이 결과의 docs-only 후속 commit/push를 맡는다. 후속 문서 commit은 게시 이미지의 source SHA를 대체하지 않으며 새 이미지 재빌드·게시를 유발하지 않는다.

## Manager 보완 설계 — 0.62.0 호환 clone 경로 (2026-11-12, 출고 전)

현재 clean source `e4ad67a`의 실제 0.61.0 sealed baseline → 후보 0.62.0 migrator `plan`은 `UPGRADE_COMPATIBLE`, `from=0.61.0`, `to=0.62.0`, `steps=['COMPATIBLE','COMPATIBLE']`, `requiresApproval=false`를 반환했다. `release_local_compat.prove`의 단일-step 고정 기대가 이 유효 경로를 `CLONE_REGISTRY_EDGE`로 거부한다. `data/release0620/compat-plan-diagnosis.json`에 원본 로컬 관측을 보존한다. Manager가 이 보완 설계와 아래 AC를 승인한 뒤 Developer가 구현하고 QA가 독립 검증한다.

- 검사기는 `steps`가 Python `list`이고 길이 1–32이며 모든 원소가 정확한 문자열 `COMPATIBLE`일 때만 허용한다. 기존 `state=UPGRADE_COMPATIBLE`, sealed baseline의 정확한 `from`, 후보 package 버전의 정확한 `to`, `requiresApproval is False`를 유지하고 `from != to`를 추가한다. 누락·빈 배열·비배열·비문자열·다른 step·`MIGRATION` 포함·33개 이상·state/from/to/approval 위조는 apply 전에 차단한다.
- 실제 migrator의 registry BFS·schema/data/runtime 매 edge 검증을 변경하지 않는다. Clone apply 후 논리 tables·CAD bytes·install/schema/source/image·app health/worker 및 소유 볼륨 cleanup 검증을 그대로 수행한다. 제품 registry·DB·인증·UI는 변경하지 않는다.
- 1-step와 실제 2-step 양성, 모든 위조 음성, 2-step `prove`의 apply·post-validation·cleanup 모의 통과를 회귀로 고정한다. Developer는 RED→GREEN과 `test:release-local`을 로컬 ignored `data/release0620/repair0700`에 보존한다. Root는 새 commit 후 exact-source 실제 clone compatibility를 다시 수행한다. 이 보완만으로 GHCR 게시/이슈 종료를 주장하지 않는다.

### 독립 QA — pre-commit 수용 (2026-11-12)

독립 QA는 0700 private repair 디렉터리를 사용해 `ReleaseCompatPlanTests` 2/2, `test:release-local` 17/17, 기존 G7 upgrade 회귀 11/11, TypeScript typecheck, ESLint, production build를 통과시켰다. ESLint는 오류 0, 기존 경고 12건이다. 기록은 [IssueEvidence/282](IssueEvidence/282.md)와 [TestReport](TestReport.md)에 있다.

앞선 전체 release 23-case 검증은 candidate source `e4ad67ade4917a8b51699bcf253b645b2fe86ffb`에서 23/23 PASS, `stale=false`, sealed JSON SHA256 `26ef6b9ed778dbb6399ce0237b9847f3cdd1024ed0672e78a499558a03a90cf3`였으나, 실제 sealed baseline clone은 `CLONE_REGISTRY_EDGE`에서 차단됐다. 원인으로 Root가 관측한 실제 migrator plan은 0.61.0→0.62.0의 두 `COMPATIBLE` step이며 구 검사기는 단일 step만 허용했다. 별도 062228 실행은 23개 로그 뒤 증거 JSON 저장이 0755 private 디렉터리 권한 때문에 실패해 **unsealed harness failure**로 보존하며 PASS로 사용하지 않는다. 재실행에는 Root가 만든 별도의 0700 증거 디렉터리를 사용했다.

현재 보완은 local-plan contract의 허용 범위와 음성 경계, synthetic `prove`의 후속 검증/cleanup 경로만 확인했다. 새 source commit 이후 Root가 actual sealed clone compatibility와 전체 release gates를 수행해야 한다. 새 source full release/actual compatibility PASS, GHCR write, Issue close는 아직 없다.
