## 2026-11-08 — G1 exact 0.58 archive schema readiness (Manager 설계)

Owner [최신 범위](https://github.com/planner77/layoutManager/issues/225#issuecomment-6716368983)의 #225 종료 기준은 지원 2D DXF의 좁은 GO-PILOT이다. BLOCK/INSERT FUP5는 #268의 별도 후속이며 선행 조건이 아니다. B1/B2/B3/E2E/KILL/OOM·3-image registry의 기존 근거를 재실행하지 않는다. 이후 기록된 TestReport OR58-ACTUAL 및 FUP1의 실제 snapshot/독립 volume 복원/exact old App/정상 인증 조회는 이미 관측된 근거로 재사용한다. 과거의 “복원 미실행” 문구는 당시 이력이다.

**확인한 코드 gap:** `or58-proof.py:sqlite_fingerprint`는 integrity/FK, 전체 schema/row hash 및 local CAD/asset 참조를 비교하지만, 두 복사본이 동일하게 drift한 schema/migration이어도 등록된0.58 계약을 별도로 확인하지 않는다. manifest의 schemaId 자체는 exact DDL 검증을 대신하지 않는다.

**최소 구현:** 기존 OR58 archive 검증 경로에 저장소의 G7 release/schema validator를 재사용하는 exact0.58 검사 추가. 새로운 운영 실행기/승인 framework를 만들지 않는다. SQLite/WAL 처리는 기존 private disposable extraction 안에서만 수행하고, 기존 원본·archive는 읽기 전용이다. source code의 등록0.58 선언과 실제 schema/history/manifest를 결합하며 후속0.60/0.61 schema를 old App restore로 수용하지 않는다. 제품 Schema/Worker/admission/버전/flags 변경0; 검증 도구 및 소유 synthetic fixture만 수정한다.

**한계/완료:** 독립 QA 후 Manager는 코드 수준 exact-schema readiness만 수용한다. 기존 실제 백업을 새 validator로 재검사하지 않았다면 NOT RUN으로 남긴다. host writer 독립 배제·합의된 RPO/RTO 및 GO-PILOT 승인은 아직 별도이며 synthetic PASS/이전 복원 성공으로 충족시키지 않는다. 운영 stop/start/capture/restore/migration/flags/GHCR/tag는 이번 범위에 없고 PR CI 시작 후 감시·merge하지 않는다. AC/TC는 TestPlan G1S01–06, 실제 결과는 TestReport가 정본이다.

**Manager 최종 판정 — ACCEPT_WITH_LIMITS:** Developer 구현 검토와 독립 QA의 OR58 34개·auth-clone 5개 PASS, Root 전체 검사 및 기존 immutable archive의 등록0.58 재검증을 근거로 코드/복구 준비 범위를 수용한다. 재작업 blocker는 없으며 실제 source/운영0.61.0/0.58.0 및 GO-PILOT NO-GO를 유지한다. 새 운영 capture/restore·CI 완료·merge를 수용했다는 뜻은 아니다. Root의 최종 commit/push·PR CI 시작은 후속이며 CI 감시/merge는 요청 범위 밖이다.

---

## 2026-11-08 — 승인된 통제·registry 출고 검증 완료 / 파일럿 NO-GO

Main33f377/CI683 적용8개 PASS의 [candidate42396085571](https://github.com/planner77/layoutManager/actions/runs/42396085571)과 별도 실제 review의 [promotion42398185878](https://github.com/planner77/layoutManager/actions/runs/42398185878)을 완료했다. private3개의 원문·digest·서명·실행 및 최종0.61태그3 동일성, 기존396버전/0.60/latest와 보호 설정·legacy 보존을 확인했다. reader/실제26case 외부 감사 수용과 registry 출고 근거를 묶되 strict helper PENDING/기대값 불충족을 PASS로 바꾸지 않는다.

승인된 작업1–4의 registry 검증과 판정은 마쳤지만 운영0.58의 동일 스냅샷 backup/schema/RPO/restore/old App start가 미확인으로 GO-PILOT NO-GO다. 운영 배포·flags 활성화/latest/Git tag/issue 종료는 하지 않는다. #225/#218 OPEN, 자동 publisher HOLD/Scene flags OFF를 유지한다. 상세 source/실행/digest/실제 한계는 TestReport가 정본이다.

---

## 2026-11-08 — 실제 singular ID의 dot 관측과 수리

PR256/CI682 적용8/8 및 Main72181f4 뒤 별도 실제 환경 review를 거친 taxonomy42392837552가 POST1회·202·정제 artifact를 남겼다. fixed singular upload ID의 한 segment에 dot이 포함됐으며 나머지 현행 조건은 모두 참이었다. 주소 원문·token 구조·과거 실패 URI를 복원하지 않는다. bounded singular ID 문자 허용만 보완하고 새 QA/full CI/Main/candidate packet/실제 review 뒤 게시를 검증한다. 이전 후보 실패2건·소진 진단 budget2건을 보존하며 정식 승격/운영 시작은 아직 없다. TestReport가 정본, #225/#218 OPEN/GO-PILOT BLOCKED 유지.

---

## 2026-11-08 — 후보2 실제 Location 거부, 구조 진단으로 전환

[CI681](https://github.com/planner77/layoutManager/actions/runs/42385929264) 적용8개 성공 및 PR255 정상 Main31998d6 뒤 새 candidate42388044377을 실행했다. 실제 보호 환경의 별도 Owner 대행 승인 기록과 build/RR1/RR2 성공은 확인했으나 publish는 다시 CA_UPLOAD_LOCATION_REFUSED로 실패했다. 서명·artifact·정식 승격은 없고 후보/정식 태그 부재·기존0.60/latest 불변을 조회했다. 공개 두 route 수리가 실제 서버 URL을 해결했다는 주장은 하지 않는다. 새 taxonomy source/QA/CI/Main/packet/실제 환경 review 후 구조를 관측하며 기존 실행은 재시도하지 않는다. TestReport/FailureLedger가 실제 결과 정본이며 #225/#218 OPEN/GO-PILOT BLOCKED를 유지한다.

---

## 2026-11-08 — 단일 진단으로 path 조건 불일치 확인

CI680 적용8/8과 Main d19를 확인한 뒤 실제 protected diagnostic42383905261에서 빈 POST1회·202·정제 artifact를 관측했다. 원문 URI는 미저장으로 exact route는 미확인이다. 공개 GHCR 1차 route 자료를 근거로 유한 경로/단일 descriptor session 호환 수리를 준비하며 추가 진단 POST는 없다. 실제 candidate42378293644 실패·서명/artifact 부재는 보존한다. [TestReport](TestReport.md)와 [FailureLedger](FailureLedger.md)가 정본이고 #225/#218 OPEN/GO-PILOT BLOCKED·운영 불변을 유지한다.

---

## 2026-11-07 — Main/CI679 검증 후 실제 candidate 실패

Main `b8c8ee5e` / CI679 적용8개 SUCCESS를 확인했다. 실제 candidate42378293644는 build/RR1/RR2 뒤 upload Location guard에서 실패했으며 서명·artifact가 없으므로 승격 입력이 아니다. 후보3/정식3 ref 부재와 기존0.60/latest 불변을 실제 pull-only로 확인했다. 보호된 단일 요청 진단은 아직 구현 준비다. [TestReport](TestReport.md)의 U-225-CANDIDATE-FAIL과 [FailureLedger](FailureLedger.md)가 정본이다. #225/#218 OPEN, GO-PILOT BLOCKED, 제품 Scene flags OFF/자동 출고 HOLD와 운영 데이터 불변을 유지한다.

---

## 2026-11-07 — 승인된 출시 작업1–3 실제 통제 증거 수용 / 작업4 게시 전 수리

[PR250](https://github.com/planner77/layoutManager/pull/250) 정상 병합 Main `62dcd3b5` 및 [CI676](https://github.com/planner77/layoutManager/actions/runs/42368191670)의 전체 적용 Job 성공을 확인했다. 독립 Rule Suite reader, Owner/Actions capability12건과 실제 거부14건의 규칙 평가를 조회 전용 감사·독립 QA로 수용하고, 최종 Main/v* 보호와 시험 자원 정리를 확인했다. 원래 strict helper는 PENDING이며 직접FF의 PR-fail 기대값 불충족/공동 rule 실패의 인과 한계를 보존한다. legacy 비활성·권한/Environment readback 및 기존0.60/별칭 불변도 확인했다.

GHCR root 응답 호환성의 최소 수리는 새 QA/full CI/Main이 필요하다. 아직 private3 후보·정식0.61 태그3 게시0이며 실제 플랫폼의 후보/승격별 review는 후속이다. [TestReport](TestReport.md)의 U-225-CONTROLS-20261107이 실제 결과 정본이다. #225/#218 OPEN, GO-PILOT BLOCKED, 두 Scene flags OFF/자동 GHCR HOLD, 운영 DB/CAD/Volume/.env/기존 이미지 불변.

---

## #225 LI — legacy inventory page 크기 최소 수리 준비 (2026-11-06)

Owner packet의 GET-only LP inventory가 `LP_RESPONSE_TOO_LARGE`로 packet/remote mutation 전에 중단됐다. Root의100/30 안전 metadata 측정으로 page30 feasibility를 먼저 확인하고 isolated Main11532 LP helper/tests만 수정한다. 기존1MiB cap·Owner/경로/완전 pagination/active run/고정 mutation guard는 유지하며 새로운 권한·PAT·실제 disable/probe는 승인하지 않는다. 요구사항/TC는 [TestPlan LI01–06](TestPlan.md), 실제 결과는 [TestReport](TestReport.md)에 기록한다. 실행 중 proof4의 실제source는11532이며 후속LP코드source와 구별한다.

---

## 2026-11-06 — 실제 project proof3의 partial signing 및 negative 실패 진단

Main146/tree3a2c의 run42114901223은 attestation4-subject 생성까지 진행한 뒤 wrong-workflow 음성의 cause 분류에서 실패했다. 실제 stderr/issuer shape는 아직 UNKNOWN이며 source/인프라를 추정으로 바꾸지 않는다. [TestPlan TP-225-PROJECT-NEGATIVE-DIAGNOSTIC](TestPlan.md) PN01–06을 새 isolated Main146 worktree에 먼저 기록했다. 정확1 artifact의 safe6-file/hash 확인과 independent4positive/ONEwrongworkflow paired read-only 검증만 허용하며 새 dispatch/signing/registry/control/권한 변경은 없다. RC244와 published242는 동결하고 실제 관측 뒤 최소 수리·독립 QA/CI/Main/새 proof를 따로 판정한다.

---

## 2026-11-06 — RF-C 승격 실행 경로의 별도 code-only 준비

RT는 pure transport 계약이고 RF-A/B는 후보 게시/서명까지여서 실제 version3-ref 승격 workflow·signed-candidate/Owner packet 검증·narrow final-tag adapter가 남아 있다. [TestPlan TP-225-RF-PROMOTION](TestPlan.md) RC01–10을 새 e20c 기반 worktree에 먼저 기록했다. candidate source A와 promotion workflow source B를 구별하고 별도 fresh Owner review/정확 digest packet 뒤에만 동일 raw bytes를 승격한다. 기존 환경을 별도 run의 검토로 재사용해 새 principal/PAT/settings를 기본 요구하지 않는다. 원 RA10의 실제 candidate 확인/승인 뒤 실행 의존성은 유지하며 지금은 reversible code/mock/packet 준비만 수행한다. PR242·실제 proof·정책/환경/legacy/GHCR/운영 자원은 변경하지 않는다.

---

## 2026-11-06 — verified-material 기반 negative proof 사전 설계

Root의 public upstream genuine signature control은 pinned CLI가 wrong-workflow/tamper의 구체 cause를 숨김을 실제 확인했다. [TestPlan TP-225-VERIFIED-NEGATIVE-PROOF](TestPlan.md)의 VN01–08에 genuine positive 전후 검증·같은 bundle/원본 SHA·검증된 cert/subject에서 계산한 typed own-policy mismatch와 실제 CLI 거부 경계를 분리하는 계약을 먼저 기록했다. generic nonzero/인프라 오류는 계속 거부하고 project 고정 source/Owner/signer 정책·권한을 유지한다. upstream 실적은 project OIDC PASS가 아니며 새 source QA/CI/Main/actual proof가 필요하다.

---

## 2026-11-06 — RF-A/B 실제 private 후보 publisher의 구현 전 범위

Manager는 [TestPlan TP-225-RF-CANDIDATE](TestPlan.md) RA-01–10에 기본0HTTP plan과 실제 Owner-reviewed environment의 fresh Main dispatch, 같은 run의3-role/RR1/RR2 proof 및 소유 정리, 고유 private candidate3개만의 게시·GHCR raw graph 확인·별도 candidate OIDC signer/receipt 검증을 정의했다. source는 게시된 combined8c04에서 분리한다. Owner-only 구성을 정직하게 보고 prevent_self_review=false를 허용하며 새 principal/PAT를 기본 요구하지 않는다. 실제 환경/권한·GHCR 쓰기/dispatch는 아직 승인하지 않았고 RP 서명을 GHCR proof로 relabel하지 않는다. 최종 version/alias/Git tag·Owner exact-digest release GO/RF-C·운영 start는 별도다.

RF Manager source review의 code-only 보완은 TestPlan RA의 수리 AC를 따른다: candidate implicit build record 업로드를 끄고, cleanup completion marker의 exact receipt hash 집합과 registry CID/name 양쪽 absence를 검증한다. all-existing NO_OP도 검증 뒤 최종3-ref readback을 요구하여 관측 중 변경을 fail closed한다. RF QA의 추가 static child-env finding에 따라 ACTIONS_RUNTIME_TOKEN도 scrub/direct-runtime 거부 목록에 포함하는 최소 보완이 필요하다(실제 존재/유출 미관측). local fake replay에서 관측한 결함이며 실제 registry/서명·Owner 승인 근거는 아니다. 기존 frozen handoff는 과거 revision으로 보존하고 수정 후 재동결·독립 QA가 필요하다.

---

## 2026-11-06 — 기존 publisher rerun 경로의 별도 최소 통제 준비

읽기 전용 legacy run/source inventory에서 과거 `packages:write` publisher의 재실행 가능 경로를 발견했다. push Main/v* 정책이나 dispatch422만으로 이 경로가 차단됐다고 기록하지 않는다. Manager는 [TestPlan TP-225-RR4-LEGACY-PUBLISHER](TestPlan.md)의 LP-01–06에 새 read-only Main HOLD workflow, 정확 legacy ID355693716의 server-disable/readback 준비, active publisher 부재 선행 조건 및 safe-HOLD Main160 하나의 후속 거부 시험을 먼저 정의했다. Root draft assistance는 코드 준비만 담당하며 실제 disable/rerun은 미실행·별도 Owner 승인 대기다. 새로운 PAT/ACL 강화를 기본 선행 조건으로 추가하지 않고 package의 다른 writer/Actions grant는 미확인으로 유지한다.

---

## 2026-11-06 — 실제 RP2 실패 및 artifact boundary 재작업

Main4fd의 첫 실제 proof run2는 direct timeout에서 childObserved=false로 실패했고 cause는 UNKNOWN이다. full RR2/서명/CLI는 미실행이다. 동시에 기본 build-push post action이 만든 .dockerbuild artifact3개를 metadata로 확인해 explicit artifact boundary도 미수용이다(내용/유출 여부 미검사). [TestPlan TP-225-RP-EXECUTION-FIX](TestPlan.md) RE01–07에 startup/readiness와 execution timeout의 분리, ownership/cleanup 유지, 암묵 build-record upload 해제 및 job 종료 후 actual artifact inventory를 정의했다. 새 actual dispatch는 수정 QA/CI/Main 뒤 별도 GO 전 금지하며 기존 failure/cleanup/원인 미확정 이력을 보존한다.

첫 repair 독립 QA의 direct/host tiny timeout은 PASS했으나 controlled startup negative는 INSPECT_UNAVAILABLE로 fail closed되어 deadline proof는 미수용이다. TestPlan RE 보완 AC에 관측 subprocess timeout과 실제 startup budget 소진을 함께 확인하는 최소 분류·진단 회귀를 먼저 기록했다. 기존 실패를 소급 재해석하거나 timer/검증을 낮추지 않는다.

---

## 2026-11-06 — PR240 합산 verification 준비

Manager가 RP/SAN 최소 수정과 이미 수용한 CP/RT local source를 PR240의 다음 head에 함께 포함하도록 결정했다. pure28·세 Actions workflow·fresh frozen QA/required CI를 확인한 뒤에만 정상 통합한다. 기존 source/모델/실패/QA 이력은 보존하며 actual signed provenance·effective policy/ref actor·GHCR·Owner GO는 미실행이다. LP 초안은 포함하지 않고 별도 검토한다. 세부 기준과 실제 결과는 TestPlan/TestReport가 정본이다.

---

## 2026-11-06 — RR4 control proof의 별도 사전 설계

정확 published R2 source `a7d1075`에서 분리한 controls worktree에 [TestPlan TP-225-RR4-CONTROL-PROOF](TestPlan.md)의 CP-01–08을 먼저 기록했다. 승인 전에는 plan/dry-run/read-only만 수행하며 외부 control refs·PR/commit·workflow dispatch·정책 쓰기 0이다. 실제 actor와 dispatcher를 구별하고, valid owned PR의 required-status-check-specific 거부를 generic PR 거부와 분리한다. fake green aggregate/context를 추가하지 않는다. initial→final 정책은 control prefix만 제거하여 Main/v* active/no-bypass를 유지하고 exact owned ref/SHA만 정리한다. RP/R2 source·GHCR·운영 자원·정식 Owner GO는 별도이며 현재는 설계/코드 검토 준비다.

---

## 2026-11-06 — 정식3-image 출고의 byte 보존 transport 준비

[TP-225-RF-TRANSPORT](TestPlan.md)의 RT-01–06에 따라 동일 private package의 검증된 후보 manifest를 정확3-release-ref로 복사하는 알고리즘만 별도 준비한다. 기본 plan/import는 0 HTTP이고 실제 credential/registry client·publisher workflow·Owner/environment 승인은 구현하지 않는다. 전체 absent/동일 NO_OP/partial HALT, raw byte 보존과 ambiguous write 후 중단을 fake transport로 검증하며 실제 GHCR/서명/Owner GO나 전체 RR5 완료로 기록하지 않는다. RP/CP/LP는 별도 유지한다.

---

## 2026-11-06 — RR1 통합 완료 / RR2·RR3 독립 로컬 QA PASS

PR #238의 typed OCI identity repair는 정확 HEAD CI #639 및 Main CI #159 SUCCESS 후 Main `68c0c95`로 통합됐고 GHCR 게시는 HOLD로 skip됐다. 후속 RR2/RR3는 frozen 29개 경로의 독립 로컬 QA에서 실제 과거0.60 설치→승인 upgrade→HTTP/CPU Worker/Viewer→같은 백업 restore→이전 digest App readback 8단계와 exact owned cleanup을 통과했다. 새 독립 PR의 exact HEAD hosted CI는 대기 중이다. 이전 setup CSRF·Viewer reload 실패는 원인 UNKNOWN 이력으로 보존하며 최신 실제 결과는 [TestReport](TestReport.md)를 따른다. 정책·서명 provenance·정식3-role GHCR·Owner GO는 미완료이며 flags OFF/HOLD·GO-PILOT BLOCKED를 유지한다.

---

## 2026-11-06 — RR1 CI638 실패·typed OCI identity 재작업

PR238 CI638의 Docker registry roundtrip이 `RR1_PULL_CONFIG_ID_MISMATCH`로 실패했다. 로컬 classic config-ID와 hosted containerd target-ID를 혼동하는 equality seam을 [TestPlan TP-225-RR1-IDENTITY](TestPlan.md)의 ID-01–06에 따라 strict Descriptor→manifest/index-child→config/RootFS 연결로 수정·검증한다. assertion 삭제/무타입 digest OR/runner daemon 변경은 허용하지 않는다. 기존 로컬 PASS와 hosted FAIL을 보존하고 fixed exact-head hosted CI 및 독립 QA 전 RR1 통합·새 RR2 실행은 HOLD다. 이미 시작된 소유 RR2 journey는 안전 cleanup 경계까지 완료했으며 그 결과를 새로운 hosted 성공으로 간주하지 않는다.

---

## 2026-11-05 — RR5 정식3-role 출고/rollback/Owner GO 설계 준비

기존 Main publisher는 App/Migrator pair만 다루므로 proof-only 서명을 마쳐도 실제 GHCR3-image 출고 경로는 남는다. Manager fallback은 [TestPlan TP-225-RR5-FORMAL](TestPlan.md)의 RF-01–11에 정확 source/workflow·3 digest·package visibility/writer·정책/bypass·rollback·Owner 승인 packet, 고유 private 후보 게시의 별도 쓰기 승인, 실제 registry/서명 검증 후 receipt에 결합된 release GO,3-role version 승격의 partial-failure HALT와 alias 기본 유지 기준을 먼저 기록했다. 실제 운영0.58과 RR2의0.60 rollback 근거를 구별하며 운영 upgrade/start는 별도 승인이다. 현재는 설계안 준비만 진행했고 기존 workflow·HOLD·정책·GHCR/tag/alias·운영 자원은 변경하지 않았다. RF 구현/외부 적용/출고/Owner GO는 미실행·승인 대기이며 전체 RR1–RR5는 계속 ACTIVE다.

2026-11-06 정책 정리 계획 보완: 보호된 control-ref는 active/no-bypass 상태에서 삭제할 수 없으므로 initial/final payload를 함께 사전 승인하고, 거부 시험 후 control-prefix include만 제거한 final 정책의 정확 delta를 확인한 뒤 기록된 exact owned ref/SHA를 정리한다. Main/v* 보호·규칙·active/no-bypass는 유지하며 final 적용·소유 확인 실패 시 inert fixture/PENDING을 공개한다. 정책 일시 해제·삭제·우회 추가나 외부 실행은 승인하지 않았다.

같은 날 package writer 검토는 실제 workflow trigger/ref/event·non-Owner writer·package 권한의 inventory부터 수행한다. 현재 publisher는 main/v* push-only이며 dispatch422를 ACL 거부로 기록하지 않는다. package Actions access READ cap+전용 승인 credential은 실제 ordinary writer 우회 또는 Owner가 선택한 강화 요구가 있을 때 검토하는 선택지로 두며 새 PAT/ACL provisioning을 MVP의 기본 선행 조건으로 추가하지 않는다. default token READ만으로 explicit write 제한을 주장하지 않고 Owner/admin의 관리 권한과 실제 ordinary workflow 우회 경로를 구별한다.

---

## 2026-11-05 — RR5 실제 OIDC provenance의 구현 전 범위

Manager fallback은 [TestPlan TP-225-RR5-PROVENANCE](TestPlan.md)의 RP-01–08을 기록했다. 다음 proof-only workflow는 정확 Main source/workflow/tree의 archive에서 RR1·RR2/RR3을 실행하고 실제 GitHub OIDC/Sigstore로3-role manifest digest와 최소 receipt를 서명·독립 검증한다. 공개 artifact는 manifest·정제 receipt·bundle metadata만 허용하며 private OCI layer/archive·DB·CAD·인증정보를 업로드하지 않는다. 실제 서명/hosted 실행은 NOT RUN이고 RR2 구현 완료·Manager 검토·독립 QA 뒤 Developer에게 인계한다. 새 전체 목표에서 필요한 code-only 통합과 proof dispatch를 진행 대상으로 판단하며 GHCR 게시·tag/정책 변경·운영 배포·Owner release GO로 확대하지 않는다. RR1–RR5 전체 잔여와 OFF/HOLD는 유지한다.

---

## 2026-11-05 — RR1 독립 QA 수용 / RR2 실제 이미지 복구 착수

RR1 actual registry manifest/config/layer digest·3-role runtime closure·6개 음성시험·정리의 독립 QA를 Manager가 수용했다. source receipt는 unsigned local observation이며 정식 GHCR 출고·업무 배포 완료가 아니다. RR2는 실제 게시 GHCR0.60 pair와 후보 digest3-image를 사용한 install→populated upgrade→HTTP/Worker/Viewer→정식 restore→old App 재기동이다. 기존 운영0.58 App과 고정 Compose 이름이 충돌하므로 변경 없는 helper bytes와 시험 전용 namespace Compose clone으로 격리한다. 정확 기준은 [TestPlan](TestPlan.md)의 **TP-225-RR2-EXECUTION RX-01–08**이며 현행 helper의 Worker 미관리 경계도 명시한다. RR2–RR5 진행 중, 제품 OFF/HOLD·GO-PILOT BLOCKED 유지.

---

## 2026-11-05 — 활성 목표: 실제 배포·복구·릴리스 통제 입증

PR #237의 실제 converter fault 증거는 exact HEAD CI #636 SUCCESS와 Main 통합으로 확인됐다. 새 사용자 목표는 남은 **실제 OCI 배포·기존 게시 이미지로 복구·릴리스 통제**를 입증하는 것이다. 전체 잔여 Gate RR1–RR5 및 구현 AC RR-01–10은 [TestPlan](TestPlan.md)의 **TP-225-RELEASE-RECOVERY**가 정본이다. 첫 실행은 소유 loopback registry의 실제3-image manifest/digest roundtrip과 source build receipt, 이어서 기존 GHCR0.60 digest pair로 시작한 설치의 승인 upgrade·현재 후보 HTTP/Worker/Viewer·정식 backup restore·이전 App 실제 재기동이다. 기존 source-level Schema 시험만으로 이 잔여를 닫지 않는다.

#231 effective Tag Ruleset/우회·게시 권한과 HOLD는 실제 관측으로 판정한다. 읽기 불가 항목은 근거를 분리하고 실행 가능한 시험을 계속한다. 정식 GHCR3-image 게시/외부 정책 활성화/Owner release GO는 준비된 검토 결과와 별도 권한·승인이 필요하며 loopback registry 성공이 이를 대체하지 않는다. 구현 전 신규 RR 결과는 NOT RUN. 제품0.61.0/flags OFF/>=0.61 GHCR HOLD/#225·#218·#231 OPEN/GO-PILOT BLOCKED 유지.

---

## 2026-11-05 — 잔여 GO-PILOT 독립 PR: converter 실제 중단/주입 cgroup OOM

사용자 요청에 따라 #236 이후 남은 converter fault 증거를 소유 disposable OCI 환경에서 검증한다. 요구/설계/AC 정본은 [TestPlan TP-225-CONVERTER-FAULT](TestPlan.md#tp-225-converter-fault--실제-converter-중단cgroup-oom-폐기-시험-2026-11-05)이다. 실제 parser 반환 직전(DTO 생성 전)의 LINE 처리·호출 frame 증거를 먼저 확보한 KILL과 test-only 메모리 압박에 의한 cgroup OOM, 각각의 durable Job/retry/READY 복구를 구분한다. 제품 hook 없이 시험 전용 계측을 사용하며 claim-wait 또는 DXF_PARSE stage만으로 변환 도중 장애 PASS를 주장하지 않는다.

로컬 3-image source/role/image ID와 정식 registry digest·provenance·과거 OCI rollback은 별도 판정한다. #231 관리 설정은 읽기 전용으로만 확인하며 권한/API 미확인은 BLOCKED로 남긴다. Developer의 local CI 모사 run `202611050228`은 실제 KILL/주입 OOM·재시도·격리 복원/정리를 통과했다. 독립 QA와 정확 PR HEAD 필수 CI는 별도이며, 기존 G7 전체 시험의 503 실패(개별 재실행 성공, 원인 UNKNOWN)는 [TestReport](TestReport.md)/[FailureLedger](FailureLedger.md)에 보존한다. 제품0.61.0/두 Scene flags OFF/>=0.61 GHCR HOLD/#225·#218·#231 OPEN/GO-PILOT BLOCKED 유지. 이번 범위는 독립 PR 작성이며 merge·운영 배포·GHCR/tag/설정 변경 승인이 아니다.

---

## 2026-11-05 — PR #236 populated G7 upgrade/recovery GO-INTEGRATE 완료

[PR #236](https://github.com/planner77/layoutManager/pull/236)의 합성 source-level 시험을 정확 HEAD CI #634 성공 후 Main `323fa4b0a0c8b69ab158fdf18a8363ba9e16c6ca`에 통합했고 Main CI #156도 성공했다. 이번 사용자 승인은 아래 원 계획의 `CI 시작까지만` 경계를 **이 통합에 한해** 확장한다. AC와 실제 검증은 [TestPlan](TestPlan.md), [TestReport](TestReport.md)의 최신 기록을 따른다. 실제 과거 OCI/운영 upgrade·복구, mid-conversion KILL/OOM, 정식 3-image 출고는 미검증이다. 제품 flags OFF, >=0.61 GHCR HOLD, GO-PILOT BLOCKED, #225/#218/#231 OPEN. 아래 계획과 당시 NOT VERIFIED는 역사적 기록이다.

---

## 2026-11-05 — 다음 최소 Unit: populated G7 upgrade/recovery source rehearsal

Manager는 기존 0.60→0.61 시험의 **빈 Job 테이블**과 새 0.61 Worker fixture 사이의 공백을 다음 범위로 선택한다. 정식 upgrade engine의 정확 plan 승인/backup/isolated restore를 재사용해 기존 Browser Job·유효 READY Scene·Current/원본/Audit가 보존되고, upgrade 이후 새 CPU Job만 별도 Node Worker가 처리함을 검증한다. 요구/설계/AC는 [TP-225-UPGRADE-RECOVERY](TestPlan.md#tp-225-upgrade-recovery--populated-060061-disposable-rehearsal)가 단일 기준이다. 제품/Schema/버전 변경 없는 test source Unit이며 실제 구현·검증 결과는 [TestReport](TestReport.md)의 최신 기록을 따른다.

실제 변환 도중 KILL/OOM은 현재 `DXF_PARSE` 기록과 converter 실행 사이 경계가 있어 claim-wait 또는 DB stage 관측으로 합격 처리할 수 없다. 이 작업에서 test hook을 제품에 추가하지 않고 별도 잔여로 유지한다. Disposable engine 승인 인자는 현장 Owner 승인·실 3-image provenance/rollback을 대체하지 않는다. 제품 두 Scene flag OFF, >=0.61 GHCR HOLD, #225/#218/#231 OPEN, GO-PILOT BLOCKED. 운영 데이터/환경·이미지/태그 무변경; 이번 진행 끝은 새 PR CI **시작**, 성공 모니터링·병합 없음.

---

## 2026-11-05 — P1-D PR #235 CI #624/#625/#626 반복 실패 총괄 및 Viewer fidelity 검증 보완

- [PR CI #624](https://github.com/planner77/layoutManager/actions/runs/41948139879): 최초 Admin 로그인 동기화/시험 계측 실패. [#625](https://github.com/planner77/layoutManager/actions/runs/41965842513): CPU Builder SourceScope와 브라우저 SceneScope 검증 불일치. [#626](https://github.com/planner77/layoutManager/actions/runs/41969752102) HEAD `798b7162a806d03e1d538bea634ee86b7a614254`: G7 signed HTTP→QUEUED→분리 OCI CPU Worker PUBLISHED/verified READY→별도 Editor 브라우저 저장 Scene 복원까지 진행 후 화면 **`도면 일부 표시 완료`**를 시험이 `도면 표시 완료`로 요구하여 FAIL. 필수 Docker Job `127055021259`, Required Verify 종속 FAIL; 일반 Static/G7/Chromium PASS. 이전 #624/#625/#626은 모두 역사적 **FAIL**로 보존.
- **원인:** CPU LINE `CUSTOM_DTO v2`의 형상은 실제 렌더링 가능하나 `sourceIndex:{state:'UNAVAILABLE',reason:'INDEX_ABSENT'}`로 원본 정밀 Handle 연결은 없다. `storedSceneFidelityProfile`에서 `render=FULL_V2`와 `action=REBUILD_REQUIRED`가 공존하며 Viewer가 의도적인 부분 표시 경고를 반환한다. 이는 거짓 FULL 표시로 덮거나 안전 Gate를 완화할 사항이 아니다. `P1-D` E2E에 정확한 원본 인덱스 상태·지원 LINE geometry/canvas·새 로그인 Scene 복원/reload/원본 GET=0·정확한 부분 표시 경고를 동시에 검증하도록 보강하고 CPU DTO 단위 회귀를 추가했다.
- #626에서 이른 status 실패로 미실행됐던 Site revoke, SourceSHA 변조, CIRCLE 미지원 및 기존 READY immutable 보존의 음성시험은 **새 HEAD CI 검증 전 NOT RUN/NOT VERIFIED**. 제품 Scene 플래그 두 개 OFF, #229 GHCR >=0.61 HOLD, #225/#218/#231 OPEN, GO-PILOT BLOCKED; 운영 DB/CAD/Volume/.env·이미지/태그 불변.

---

## 2026-11-05 — PR #235 CI #625 Viewer CPU Scene persisted builder mismatch

[CI #625](https://github.com/planner77/layoutManager/actions/runs/41965842513) at HEAD `cf6dfab3596cd9738c29aeab5a85f136953a1443` failed on first fresh signed Editor Viewer (`scene-status` absent), after real HTTP upload→Queue→independent OCI Worker PUBLISHED and verified Scene READY; Viewer reload and negative tail NOT RUN. Server `SceneRepository.status/content` accepted allowlisted CPU builder via `storedSceneScope`, while browser `ViewerSource.readScene` reconstructed only browser `sceneScope`. Align read-only Viewer to exact known persisted Builder allowlist while preserving immutable Version/SHA/Manifest/DTO digest and no original DXF fallback. Add direct CPU positive plus unapproved Builder/Version/SHA negative regression. New exact HEAD CI pending; historical #625 failure immutable, #225/#218/#231 OPEN, #229 GHCR >=0.61 HOLD, product flags OFF and GO-PILOT BLOCKED.

---

## 2026-11-05 — PR #235 CI #624 P1-D 신규 로그인 단계 FAIL / 시험 순서 보완

[CI #624](https://github.com/planner77/layoutManager/actions/runs/41948139879) HEAD `2ce84bf322e2b76867bb777efa94f62c51fb1131`: 최초 Admin password-change 후 로그인 화면 `현재 세션` 확인 20초 timeout으로 Docker required Job 및 downstream Verify FAIL. 기존 Docker OCI proof 단계 PASS였지만 HTTP 업로드·Worker·새 Viewer 연속 경로는 미진행. 비동기 초기 변경 완료를 기다리지 않고 navigate하는 테스트 경쟁 조건을 후보 원인으로 보고 `initial-change` success 문구·Login HTTP 200·Session HTTP 200·heading 순서로 보완. 정확 실패 HTTP 상태는 미관측이므로 제품 Auth 결함으로 단정하지 않는다. 새 HEAD required CI 전 P1-D NOT VERIFIED. 기존 #622/#153/#154 성공은 이전 증거로 보존; GO-PILOT BLOCKED, #225/#218/#231 OPEN, 제품 플래그 OFF, v0.61+ GHCR HOLD, 운영 자료·태그 불변.

---
## 2026-11-05 — P1-D signed HTTP→분리 CPU OCI→신규 인증 Viewer E2E 소스·CI 단계

기존 #234 CI #622의 실제 CI 전용 OCI Worker 격리/READY·revoke·SHA·SIGKILL·복구 성공과 Main CI #153/#154 SUCCESS는 확정 증거다. 새 `feat/225-p1d-http-oci-viewer-e2e`는 `src/tests/oci/scene-p1d-journey.sh`, `scene-p1d-probe.mjs`, `src/playwright.scene-p1d.config.ts`, `src/tests/p1d-e2e/scene-http-oci-viewer.spec.ts`로 진짜 G7 Editor UI/Origin/CSRF의 HTTP DXF 등록→Version/Queue→독립 실제 OCI Worker READY/불변 Scene→새 로그인 Browser에서 원본 재파싱 없이 Viewer 복원 및 negative auth/SHA/unsupported 기존 READY 보전까지 PR CI 필수 단계에서 검증하도록 준비했다. **현재 새 PR CI 미확인/실증 PASS 주장 없음**. 실 변환 도중 OOM/kill, 운영 G7 upgrade/restore, 3-image release 및 #231 GitHub Tag Ruleset은 별도; GO-PILOT BLOCKED, #225/#218 OPEN, 제품 플래그 OFF, #229 0.61+ GHCR HOLD 및 운영 데이터 불변.

---

## 2026-11-05 — PR #234 OCI CI #622 통과 및 GO-INTEGRATE Main 완료

[PR #234](https://github.com/planner77/layoutManager/pull/234) source HEAD `aa0c4622e912c7ad048c481c4aa153c86124d79c` [PR CI #622](https://github.com/planner77/layoutManager/actions/runs/41935291475) 8 applicable jobs SUCCESS(A2 SKIPPED), OCI 실 컨테이너 security + Loop/READY/stop/start, revoke/SHA tamper, 소유 CID SIGKILL/지속 Job→시각 가속 retry→READY, 격리 SQLite/CAD 복원·재독해 PASS. 이전 #614 SIGKILL exit1 FAIL 이력 보존. Review0/충돌0 뒤 Squash Main `edb3ecb3a17a25cbc88d63b2cc8b911cba3bbcd5` 병합. 이것은 **실제 OCI 증거의 GO-INTEGRATE 완료**이지 제품 GO-PILOT/배포 승인 아님. User HTTP→실 OCI→Viewer 로그인 E2E 및 mid-conversion crash/OOM, real G7 업그레이드/복구, 정식 3-image 검증은 잔여. #225/#218 OPEN, 제품 2 flag OFF, #229 GHCR HOLD/#231 Tag Ruleset OPEN, 실 운영 자료/태그/이미지 변경 없음.

---

## 2026-11-05 — PR #233/Main CI #152 확정 및 실제 OCI 검증 착수

[PR #233](https://github.com/planner77/layoutManager/pull/233) source HEAD `2b1cb5bef3a011e9b31eeafc508aec90051b2754`: [PR CI #612](https://github.com/planner77/layoutManager/actions/runs/41920944913) 8개 applicable SUCCESS(A2 scope SKIPPED), Vitest 1,098/1,098 PASS, 별도 Node Worker·G7 multipart·Chromium 회귀 PASS. Squash Main `b33945d7ee80946950f8debfd04ce080af6e7105` / [Main CI #152](https://github.com/planner77/layoutManager/actions/runs/41924479834) SUCCESS, GHCR publish SKIPPED. 이전 검증 대기 문구는 작성 시점 이력으로 보존.

후속 `feat/225-disposable-oci-proof`는 **새 실제 Docker OCI 환경**의 소유 ephemeral volume + worker runtime·격리·SIGKILL/retry·권한·원본 SHA·복원을 required PR CI에 연결하는 시험 후보. 새 HEAD CI 확인 전 GO-PILOT 증거 미완료. 제품 기능 플래그 OFF, #229 GHCR HOLD, #231 Tag Ruleset OPEN, #225/#218 OPEN, GO-PILOT BLOCKED. 운영 데이터·태그 불변.

---

### 2026-11-05 — signed multipart Service 업로드 연결 시험 소스 추가

`src/tests/integration/scene-cpu-worker-upload-g7.test.ts`는 일회용 G7 0.61 DB에 실제 Editor/AuthSession/Site Grant를 발급하고 `prepareG7CadWrite`의 Origin/CSRF 검사를 통과한 multipart `uploadCad` 호출을 통해 원본 SHA·Version·Job QUEUED를 생성한 뒤 분리된 Node Worker 실행→READY·SceneRepository readback/Audit·중복 Retry 거절, 권한 철회 후 FAILED/원본 보존을 검증하도록 작성됨. 이는 실제 제품 HTTP listener/프록시, 별도 OCI 및 사용자 Viewer 새 로그인 전체 E2E가 아니며 CI 실행 전 **NOT VERIFIED**.

## 2026-11-05 — GO-PILOT 검증 준비 PR (실행 증거 보류)

- 이전 PR #232의 GO-INTEGRATE는 완료. 신규 `feat/225-pilot-disposable-integration`에서 합성 G7 0.61.0 소유 임시 DB/로컬 CAD에 한정해 별도 Node Worker 실행→verified READY→신규 DB 읽기, Job 선점 후 실제 SIGKILL→stale 180s 후 회복(임시 Row 시각만 가속), 원본 동일 길이 변조→SHA 실패, Site 권한 회수 차단을 검증하도록 테스트 소스 추가.
- 별도 Playwright 시험은 Node CPU LINE 후보→immutable SceneBlobStorage put/readback→**새 Chromium context**의 Scene DTO 복원 및 변조 거부. 실제 signed 업로드 HTTP API→OCI Worker→브라우저 UI 통합 한 흐름과 Docker cgroup/비루트/네트워크 격리·백업/복구는 **아직 실행·증명되지 않음**.
- 이 범위는 GO-PILOT 사전 증거 수집용 **GO-DEV/PR CI 후보**이며 실 운용 GO 승인이 아님. Test scope is disposable, source-only until exact-HEAD CI. Production flags SCENE_AUTO_BUILD_ENABLED=OFF / SCENE_CPU_WORKER_ENABLED=OFF; #229 >=0.61 GHCR HOLD, #231 Tag Ruleset OPEN, #225/#218 OPEN, GO-PILOT BLOCKED. No production DB/CAD/Volume/.env, GHCR or tag writes.

---

## 2026-11-04 — PR #228 B2-B 분리 Worker/G7 0.61.0 코드 (CI 미검증)

`scene-cpu-worker.ts` 단일 Job CLI, 120초 강제종료 supervisor loop, `cpu-worker` OCI 타깃과 opt-in Compose 보안 제한(UID10001/read-only/network-none/CPU1·RAM768MiB/PID64)을 추가했다. 신규 0.61.0 G7 CPU 스키마, Greenfield 새 기준선 및 0.60→0.61 additive index migration을 등록한다. 기존 v0.60.0 Browser Builder Job 및 운영 데이터·이미지 불변; 기능 플래그 둘 다 기본 OFF. 새 HEAD CI·실 OCI·마이그레이션·브라우저 복원 검증 미완료. LINE 외 2D Entity, B3 상태/retry UI, GHCR Worker 이미지 검증 및 제한 Pilot은 후속. #225/#218 OPEN, GO-PILOT BLOCKED.

## 2026-11-04 — PR #228 CPU Job 릴리스 라우팅·bounded recovery (Draft)

신규 G7 CPU schema+Feature flag에서만 Version 등록 → CPU Builder Queue를 한 DB TX에서 연결하도록 분기 추가. 0.60.0은 기존 Browser enqueue 유지하고 잘못 설정된 CPU 플래그를 차단한다. transient error RetryWait 30s/60s, attempt3 FAILED, auth/source/pointer 등 terminal, CAS lost는 거짓 실패를 피한다. 단위시험 3곳 보강. CI 확인 전 UNVERIFIED; 신규 G7 schema/실제 별도 CPU Worker OCI/배포·B3·브라우저 복원 미완료, #225/#218 OPEN.

---

## 2026-11-04 — B2-B SQLite 통합·현재 릴리스 차단 시험 작성

B2-B 내부 권한·Blob·CurrentScene CAS/Audit 구현에 대한 강한 양/음성 증거를 위해 소유 disposable G7 0.60 DB+실 original/Scene Blob을 사용하는 `scene-cpu-worker-g7.test.ts`를 작성했다. 정상 첫 게시·Current0/Job READY/Audit·조회 가능한 CPU DTO와, 기존 Pointer 보존/2차 게시 거부, Audit SQL trigger 실패의 트랜잭션 롤백·Orphan CLEANUP을 시험한다. 이 시험의 G7 Worker 인가는 **모의**이므로 실제 signed Runtime·보안 승인이 아니다. `scene-cpu-worker-current-release.test.ts`는 실제 v0.60.0에서 CPU Worker Enqueue/Claim/Auth가 future schema ID 불일치 때문에 무조건 차단되는지 확인한다. 실행 성공은 새 CI 완료 전 **미검증**이다. B2 실제 독립 OCI, CPU 자원/네트워크 격리, 지원 DXF 확대, G7 새 버전 및 B3·GO-PILOT은 여전히 미완료. #225/#218 OPEN, 현 0.60.0 GHCR·.env/DB/Volume/CAD 비변경.

---

## 2026-11-04 — PR #228 B2-B 미래 전용 Worker 파이프라인 코드 추가

[PR #228](https://github.com/planner77/layoutManager/pull/228)의 B2-B 구현을 데이터 출처 검사에서 **미래 서명 G7 릴리스 전용 내부 Worker 함수/안전한 신규 Scene 게시 단계**로 확장했다. 세부 코드는 `src/server/scene/scene-build-job-queue.ts`(CPU Builder 전용 Enqueue/Claim/Stale/Retry/Stage), `scene-worker-g7-authorization.ts`(DB 현 시점 Actor/Site/Role·Version/sha·signed G7 Runtime 재검사), `scene-worker-publish.ts`(권한 재검사, 저장된 원본 재조회/SourceSHA, CUSTOM_DTO v2 검증, immutable Blob readback, **기존 CurrentScene이 없을 때만** Asset+Current 0+Job READY+Audit atomic, Orphan 사후처리), `scene-cpu-worker-once.ts`(한 건 오케스트레이션·오류 allowlist)이다. 새 순수 Unit의 승인/거부/중단/TOCTOU/상태 CAS/원본 불변 경로를 검증하도록 작성했다.

**잔여 필수:** B2-B는 현재 `G7-GREENFIELD-CPU-WORKER-20261104-1`이 릴리스 registry/G7 baseline에 **등록되지 않았기 때문에 운영/스테이징에서 실행 불가**. 기존 0.60.0 Queue/Schema·GHCR 그대로. 향후 새 SemVer+정확 G7 schema/OCI App/Migrator 승인, 실 독립 CPU Worker OCI의 비루트 cgroup·시간·pids·read-only·network 격리, LINE 외 실제 제조 도면 2D 도형(Text/Block 포함), 원본 출처 및 브라우저 restore, 장애/재시작/권한 변경 실 DB·파일/배포 통합 시험 필수. `SCENE_AUTO_BUILD_ENABLED=OFF`, `SCENE_CPU_WORKER_ENABLED` 미설정, GO-PILOT BLOCKED; #225/#218 OPEN. 현 Branch CI의 최종 성공 여부는 정확 HEAD 검증 전 미확정. 이전 #572 TypeScript 오류는 별도 FailureLedger에 보존한다.

---

## 2026-11-04 — B2-A Main 병합·B2-B 별도 Draft 시작

[PR #227](https://github.com/planner77/layoutManager/pull/227)은 PR HEAD `f2ac283c62dc3eaed513d4f67a0b4355adbb3a3c`의 [CI #566](https://github.com/planner77/layoutManager/actions/runs/41768798168) 적용 필수 Job SUCCESS, review0/충돌0/behind0 확인 후 **Main `73957d20295d6300c4f0c9b89ca5032574eb24bc` Squash 병합**, [Main CI #147](https://github.com/planner77/layoutManager/actions/runs/41771625231) 성공. 기존 0.60.0 immutable GHCR Pair가 있어 중복 빌드 생략. B2-A는 LINE 오프라인 후보 완료이지 운영 자동 Scene 구축 완료가 아니다.

별도 B2-B Draft 첫 구현: 기존 Browser Builder 식별자를 유지하고 CPU 후보를 `node-cpu-line@1.0.0+cad-scene-1`의 고유 출처로 분리한다. 순수 `inspectCpuCandidateForJob`은 RUNNING Job·attempt·Builder/schema2·원본 SHA·manifest·DTO 전체 Validator와 payload SHA의 정합성만 확인한다. **기존 v0.60.0 Queue의 Browser Builder Job은 CPU 검증에서 거부**되며, SceneRepository 수동 게시 경로는 CPU 출처를 거절한다. B2-B 안에서 2D geometry 확대, 버전 등록·Queue 전환, 독립 non-WebGL CPU Worker, G7 Actor/Site/Writer 최신 권한 재검증, 검증된 SceneRepository immutable 게시/CurrentScene CAS/Audit 및 기존 READY 보호를 이어서 구현한다. B3 목록 상태/UI/retry/배포 Smoke는 미완료. #225/#218 OPEN, GO-PILOT BLOCKED, `SCENE_AUTO_BUILD_ENABLED=OFF`, 0.60.0 배포·운영 DB/CAD/Volume 변경 금지. 이 Draft 변경의 정확 CI 결과는 확인 전 미검증.

---

## 2026-11-04 — B2-A Node CPU LINE 후보 구현 착수 (별도 Draft PR)

B1 완료(G7 0.60.0 Main 병합/이미지쌍 게시)의 다음 작업으로 `src/server/scene/cpu-line-candidate.ts`와 단위 테스트를 구현한다. 배포를 활성화하지 않고 엄격 UTF-8/16MiB·2D LINE(Layer0/흰색, `$INSUNITS=4`)만 변환한다. 실제 Three Line Geometry → CUSTOM_DTO v2/manifest/SHA/domain full validator/임시 저장·readback을 수행하고 비지원 DXF/중복 handle/3D/규모 상한을 fail-closed한다. 이전 A2 Browser 테스트 코드/직접 Node `DXFViewer` 경로를 운영에 복제하지 않는다.

**지금 구현하지 않는 것:** 신규 CPU Builder Identity 및 릴리스 호환 등록, TEXT/MTEXT/POLYLINE/BLOCK 등 일반 지원 도형, G7 내부 Actor/Site/Writer 재인가, 외부 무권한 환경에서 검증된 CPU/RAM/PID/time 격리, SceneRepository immutable CAS/기존 READY 불변, Worker OCI, 상태·Retry UI/B3. 기존 Scope의 `CAD_SCENE_BUILDER`는 Browser 출처이므로 이 Candidate DTO를 현재 버전의 공개 Scene READY로 게시해서는 안 된다. 이번 산출물은 **OFFLINE_PROOF_ONLY**이며 `SCENE_AUTO_BUILD_ENABLED=OFF`, GO-PILOT BLOCKED, #218/#225 OPEN. 정확 HEAD CI 및 런타임 검증 전 완료로 표기하지 않는다. [ADR](Decisions.md), [TestPlan](TestPlan.md) 참조.

---

## 2026-11-04 — PR #226 B1 0.60.0 Main 병합 / 후속 B2·B3 OPEN

검증 HEAD `03e21f4242e499a0a8afc834361e625e4433b2c2`의 [PR CI #564](https://github.com/planner77/layoutManager/actions/runs/41753808890) 모든 적용 필수 Job SUCCESS(별도 A2 합성 Job은 변경 범위 밖 Skip). 리뷰 미해결0/충돌0/behind0 확인 후 [PR #226](https://github.com/planner77/layoutManager/pull/226) **Squash Main `9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63` 병합**. 0.60.0 Job 등록·G7 승인형 Zone→Job Migration 및 B1 영속 Queue/멱등/CAS가 구현·검증되었다. [Main CI #145](https://github.com/planner77/layoutManager/actions/runs/41762192190)와 `v0.60.0` tag 시작은 검증했으나 App/Migrator GHCR 최종 2개 digest 게시 여부는 아직 별도 확인 필요. 상세 [FailureLedger](FailureLedger.md).

**잔여:** B2 실제 CPU non-WebGL DXF→CUSTOM_DTO 변환·제한/인가·SceneRepository 검증 게시 및 B3 상태/재시도 UI, Worker OCI·재기동/브라우저 종료 후 실제 READY는 **미완료**. #225/#218 OPEN, GO-PILOT BLOCKED, `SCENE_AUTO_BUILD_ENABLED=OFF`, 실 운영 `.env`/DB/Volume/CAD 변경 금지. 기존 이 문서의 미완료 시점 기록은 이력으로 보존한다.

---

## 2026-11-04 — CI #563 Docker WAL 성공, 320px Memo E2E 경쟁 조건 보완

[PR CI #563](https://github.com/planner77/layoutManager/actions/runs/41750908638)은 실제 0.56→0.60 업그레이드 및 readonly WAL/백업/복구 Docker 필수 Job을 통과했으나, unrelated `issue91-memo-export.spec.ts`의 320px 모바일 모달 전환 중 헤더 클릭이 막혀 General Chromium shard2/Required Verify FAIL로 종료됐다. 실제 메뉴 헤더의 모바일 drawer `inert` 해제 후 사용자 메뉴를 클릭하도록 테스트 순서를 보완하고, Native fullscreen 및 Memo 내보내기 전체 검증을 유지한다. 정확 실패 로그와 경계는 [FailureLedger](FailureLedger.md) 참조. 새 exact-HEAD CI는 미검증이며 GO-PILOT은 계속 차단한다.

---

## 2026-11-04 — CI #562 WAL Schema proof 보완

[PR CI #562](https://github.com/planner77/layoutManager/actions/runs/41748309671)에서 Plan·승인형 Apply/Backup은 진행됐으나 Docker WAL Smoke의 `backup-schema-verify`가 실패했다. 기존 #210 P2와 달리 업그레이드 후 합성 검증만 WAL readonly 원본을 직접 열고 있었으므로, 서버에 이미 있는 `withReadOnlyInspection` adapter로 검증을 정렬한다. schema DDL/4 indexes/2-history의 엄격 검증과 원본 DB·manifest SHA/권한/소유권/파일 목록 불변성 및 기존 업무 데이터 보전은 유지·강화한다. 정확한 내부 SQLite 오류는 이전 Run 로그에 없어 추론으로 분류하며 다음 exact-HEAD CI 통과 전 GO-PILOT 미승인. [FailureLedger](FailureLedger.md) 참조.

---

## 2026-11-04 — CI #558 WAL 시험 보완 / 승인형 Migration 회귀

[CI #558](https://github.com/planner77/layoutManager/actions/runs/41732045585)은 Test 1015 PASS/1 FAIL + async unhandled, Docker WAL readonly smoke FAIL. `g7-greenfield-upgrade-qa.test.ts`는 첫 `apply`가 잠금을 획득한 뒤 두 번째 `plan` 계산으로 사전 거절돼 pending backup을 정상 await하지 못한 것이 원인. 승인 Plan ID를 최초 시작 전에 계산하고 동일 식별자로 재호출의 잠금 거부와 첫 실행의 백업 완료를 검증하게 했다.

`smoke_greenfield_wal_readonly.py`는 기존 Zone schemaId를 정확 복원하고 `UPGRADE_MIGRATION_REQUIRED`인 Plan을 요구하며, 64-hex planId 승인형 apply, 정확 2행 history/Job DDL 검증을 추가. 기존 업무/사용자 데이터 hash는 유지하며 변경이 의도된 Job Table과 migration ledger만 분리한다. 상세 [FailureLedger](FailureLedger.md). 다음 CI 정확 HEAD 결과는 아직 미확인. B1 Draft/GO-PILOT 미승인, Worker/게시/UI 미구현.

---

## 2026-11-04 — CI #557 실패 후 수정 / 신규 검증 대기

[CI #557](https://github.com/planner77/layoutManager/actions/runs/41727427960)은 999 PASS / 17 FAIL(Static), Docker real upgrade Smoke FAIL, Required Verify FAIL. 실제 제품 자동 Scene Worker의 동작 검증에 앞서 **기존 버전 업그레이드 fixture의 구 Schema ID 불일치**, **R2 복원 fixture의 SceneBuildJob 테이블 잔존**, **Docker Smoke의 승인 없는 `auto` 실행**이 발견됐다. 구버전 Scheme ID/DDL을 테스트에 정확 복원하고 CI 소유 disposable volume에서 신규 Migration Plan ID의 명시 승인과 백업·복구를 통과시키도록 수정했다. 근거 [FailureLedger](FailureLedger.md).

다음 정확-HEAD CI에서 0.59→0.60 실제 DDL/업무 보전/WAL/복구 및 Docker migration image를 검증한다. Worker, G7 Background 게시, UI, GO-PILOT은 여전히 미완료; 기존 0.59 운영 이미지/데이터는 불변.

---

## 2026-11-04 — 0.60.0 Job G7 forward-only Migration 후보

- 신규 제품 버전은 0.60.0 (Draft)이며 이전 v0.59.0의 Zone 기준선·이미지는 불변이다. 신규 빈 설치는 Job 기준선 1행, 기존 설치에서 승인 Migration을 거치면 Zone 기준선+Job Migration 2행을 유지한다.
- G7 Registry에서 0.59.0→0.60.0은 COMPATIBLE이 아닌 MIGRATION이다. Plan ID 승인/백업/격리복구를 요구하고, Job SQL 원문·checksum·4 인덱스 및 기존 G7 DDL 지문을 검증한다. SQL drift/허위 이력은 차단한다.
- 기존 Zone/Outline/Memo 기능이 새 2행 이력에서도 동작하도록 스키마 판정 코드를 변경했다. 정확 HEAD CI와 실제 통합 회귀 결과는 아직 NOT VERIFIED.
- SCENE_AUTO_BUILD_ENABLED 기본 OFF 유지. 새 Job 스키마 등록과 별개로 실제 Background CPU Worker, G7 게시 권한·SceneRepository CAS, 상태 UI는 미구현; GO-PILOT 미승인. GHCR/운영 DB/Volume 변경 금지.

---

## 2026-11-04 — B1 저장 계약 및 G7 릴리스 선행 조건 (Draft)


**동시성 1 보증:** 기존 개별 Job `status+attempt` CAS에 더해, 후보 SQL의 partial UNIQUE `uq_scene_build_one_running`은 전역 `RUNNING` 상태를 하나만 허용한다. Claim은 활성 RUNNING을 먼저 검사하며 경쟁이 발생하면 DB UNIQUE 실패를 숨기지 않는다. 실 Worker가 여러 프로세스로 배포되는 분산 설계의 대체가 아니며, 활성화 전 신규 G7 릴리스 등록과 실제 통합 시험이 필요하다.
**부분 구현, GO-PILOT 미승인.** 이 PR은 `SceneBuildJob` Prisma 모델과 `deploy/scene-build-jobs/migration.sql`의 **검토용 전진 DDL**, `scene-build-job-queue.ts`의 트랜잭션 Enqueue·단일 Job CAS 선점·만료 재시도·실패 상태를 추가한다. `CadRepository.register()`는 `SCENE_AUTO_BUILD_ENABLED=true`일 때 승인된 G7 Runtime의 **DXF**에 한해서만 같은 `writeTransaction`으로 Job을 생성한다. 기본값 OFF, 승인되지 않은 Runtime 또는 등록되지 않은 Job 테이블이면 업로드도 fail closed/롤백하도록 설계했다.


**추가 차단:** 0.59.0의 기존 `G7_GREENFIELD_SCHEMA_ID`에서는 `SCENE_JOB_RELEASE_NOT_REGISTERED`(503)을 반환한다. 수동 테이블 생성만으로는 활성화되지 않는다. 승인된 신규 G7 Schema ID `G7-GREENFIELD-SCENE-JOBS-20261104-1`와 등록 Migration/DDL Fingerprint가 모두 반영된 이후에만 기능을 켤 수 있다.
- **중요:** 현재 G7 0.59.0 Greenfield baseline의 고정 DDL·fingerprint·Upgrade Registry는 그대로다. SQL은 아직 등록/적용되지 않으며 `SCENE_AUTO_BUILD_ENABLED`를 운영에서 활성화하면 안 된다. 신규 불변 버전 및 승인된 G7 release migration, fingerprint/backup/restore/DB 드리프트 수용이 뒤따라야 한다. 수동 `ALTER/CREATE TABLE`로 현재 설치를 우회하지 않는다.
- 작업 DB에는 `versionId/sourceSha256/builder/payloadSchema` UNIQUE 및 actorId/siteId/requestId 등 최소 참조만 저장하고 세션 tokenHash·쿠키·암호는 저장하지 않는다. `SceneOrphanJob`은 기존 Storage cleanup 전용으로 유지한다.
- Claim은 SQLite 트랜잭션 `updateMany` CAS를 이용한다. stale RUNNING의 유한 retry, maxAttempts3, 오류 allowlist는 `SceneRepository` 게시 성공과 구분하며, 이 코드에는 **READY 게시 함수가 없다**.
- `src/tests/unit/scene-job-schema-b1.test.ts`: 별도 인메모리 SQLite에 DDL을 적용해 FK/유일성/상태 CHECK/롤백 검증. `scene-job-queue-b1.test.ts`: DB-transaction mock의 Enqueue/CAS/stale/retry/실패 경로 검증. 이 시험은 **실 G7 Baseline→새 릴리스 upgrade E2E의 대체가 아니다**.
- 다음 필수: 신규 SemVer/G7 migration 승인·릴리스 정합화, 실제 G7 DB 영속 transaction 통합 E2E, 독립 CPU non-WebGL converter, background permission 재확인·`SceneRepository` CAS·verified READY, UI/Worker OCI. 이전 READY·원본/메모·구역 데이터 불변.
- 이전 #225 단일-Worker admission의 순수 상태 판단 코드는 그대로 유지하고, 과거 #221/#222 A2 원본 시험과 실패 원장을 재해석하지 않는다.

---

# Issue #225 — B1 단일 CPU Worker 상태 판정 로직 착수

> Parent: #218 (GO-DEV 승인). 이 PR은 **제품 자동 Scene 생성 구현 완료가 아니다**.

## 이 PR에 포함한 실제 코드

- `src/domain/scene-single-worker-admission.ts`: 신규 SceneBuildJob 네 부분(Version/SourceSHA/Builder/PayloadSchema) 멱등 키 검증, 단일 Worker의 QUEUED/RETRY_WAIT/RUNNING stale 판정 및 bounded 재시도. 순수 함수이며 실제 사용 전 데이터베이스 UNIQUE/CAS 원자성을 별도 구현해야 한다.
- `src/tests/unit/scene-single-worker-admission.test.ts`: invalid digest/schema, due/undue, stale timeout, terminal 상태, 불량 시간/횟수 등 회귀.

## 현재 한계 및 다음 우선 작업

1. `src/prisma/schema.prisma`와 G7 Greenfield/릴리스 Registry의 Job 테이블·DDL/Migration/호환성 검증.
2. `CadRepository.register`의 **동일 transaction**에 승인 DXF만 자동 enqueue. Job에 cookie/tokenHash/password 보관 금지. Origin/CSRF/G7 기존 승인 회귀 유지.
3. SQLite 단일 Worker claim/재시작 recovery, 실제 DXF bytes SHA 재검증, 시간·CPU/RAM·프로세스 격리.
4. **WebGL 없는 CPU DXF→CUSTOM_DTO v2** 생산용 경로와 실제 SceneRepository publish의 신규 내부 G7 권한 검증 설계. 기존 `G7CadWrite.tokenHash`를 Job에 저장해 재사용 금지.
5. READY는 작업 테이블의 문자열이 아니라 **검증된 CurrentScene**으로 확정. 이전 READY 불변, 원본 및 Memo/Zone/Outline 보전.
6. 최소 상태/retry UI와 실제 파일·권한·브라우저 복원·재기동 검증 후만 GO-PILOT 별도 판정.

단일 Worker 핵심 판단 함수를 작성한 것은 B1 코드 착수의 증거일 뿐, 실제 DB/배포 동작은 **NOT IMPLEMENTED/NOT VERIFIED**. 초기에 과거 P1-A2 Server WebGL restore, 다중 Worker/Fencing, 전체 Entity 매핑, 현장 DXF 3종을 구현 착수 차단 조건으로 요구하지 않는다. `AGENTS.md`/Issue218LeanPolicy 기준, 현재 repository-required PR CI는 유지한다.
