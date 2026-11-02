## PR #219 병합 후 — Main GHCR #138 실패·고정 source 재발행 계약 (2026-11-03)

- 이전 PR #219는 Source `5b5b5e7e3937e847fb114185268e4fd01eabe54c`, CI #475 8/8 SUCCESS 후 Main `934e5561ff7d54b388d59b6f8e8f40bd14bcd45e`로 병합됨. 당시 Issue #216은 키워드에 따라 자동 CLOSED되었으나 실제 릴리스 수용 미완료로 REOPEN.
- [Main CI #138](https://github.com/planner77/layoutManager/actions/runs/41539913477) attempt1/2 GHCR inspect fail closed `G7_RELEASE_REGISTRY_CHECK_FAILED`. annotated tag v0.58.1 object `bbd526ce3ce222dea7b63d1c8b081990ab238268` → source `934e5561...` → Git tree `2a8ed7596a4b3444a03fd839784c9e0a5a125a0c`. 새 후보/공개 tag/OCI size/실 image digest 결과 없음.
- **선택된 복구 정책:** v0.58.1 SHA/태그 재지정 금지. 정확 missing ref 전체 오류와 비밀 제거된 error-shape 진단 추가. GHCR 기존 2개 태그 이미 존재 시 SKIP, 한 개만 존재 시 HALT, 전부 없으면 정확 소스/태그/트리 SHA 및 허용된 Recovery PR Subject/Changed path를 검증하여 기존 0.58.1 소스를 checkout하고 후보 2개를 빌드한다. 신뢰할 수 없는 런타임 코드를 임의 승격하지 않는다. Candidate OCI labels version/revision/role/amd64 및 registry digest 확인 전 version/latest 승격 금지.
- **운영 경계:** #209/#211 G7 Registry upgrade/host plan 승인과 별개. #218 자동 생성 미구현. 운영 .env/Volume/DB/Auth/Writer/Scene/CAD 원본과 이전 v0.58.0 digest는 그대로. [신규 시험](TestPlan.md), [실패 원장](FailureLedger.md), [운영](Operation.md). GHCR 실 digest 증거 확인 후에만 Issue completed 종료.

---

# Issue #216 — 0.58.1 불변 릴리스 / G7 호환 Registry / GHCR App-Migrator pair

## 사실·원인

- [Issue #216](https://github.com/planner77/layoutManager/issues/216) 및 #212/PR #214, #208/P1-A PR #217 참조. 모두 Main 코드에 병합되었으나 0.58.0 package/tag와 이미 존재하는 0.58.0 App/Migrator GHCR pair로 신규 이미지 빌드 SKIPPED. [Main CI Run41528536561](https://github.com/planner77/layoutManager/actions/runs/41528536561) GHCR Job 성공은 실제 candidate/digest 게시가 아님.
- v0.58.0 annotated tag, 기존 두 버전 이미지 digest는 불변. 새 package/lock 0.58.1, Main source에 묶인 v0.58.1을 준비한다. 자동 Scene Worker/Queue/상태 화면은 #218로 별도 관리. 실제 복잡 DXF/GPU/현장 수용은 #113/#193로 분리.

## 설계

1. Package/lock top 및 lock packages root 모두 0.58.1. 기존 package identity와 version 표시/OCI label/릴리스 태그 연결을 재사용한다.
2. Greenfield release registry에 zones('0.58.1'), 0.58.0→0.58.1 COMPATIBLE forward edge 추가. G7_GREENFIELD_SCHEMA_ID/G7_GREENFIELD_BASELINE/G7_GREENFIELD_BASELINE_CHECKSUM 및 G7-ZONES-DATA-V1/G7-ZONES-RUNTIME-V1 동일. 0.56→0.57→0.58→0.58.1 경로 모든 edge 검증; SQL migration 없음. Registry drift/unknown/downgrade 차단.
3. GHCR Main release: v0.58.1 태그가 실제 Main source commit을 가리킬 때, App/Migrator linux/amd64 candidate 빌드 및 각각의 digest/manifest 검증 후 0.58.1-migrate→0.58.1→latest-migrate→latest 승격. 두 이미지의 version tag가 이미 존재하면 main/tag rerun SKIP, 한쪽만 있으면 G7_RELEASE_PARTIAL_PAIR로 HALT하고, 조회 실패가 명확한 manifest-404가 아닌 network/auth 불확실성이면 G7_RELEASE_REGISTRY_CHECK_FAILED로 HALT, tag source 불일치면 G7_RELEASE_TAG_SOURCE_MISMATCH로 HALT. 여러 Registry tag promotion은 원자적이지 않으므로 부분 실패 시 자동 overwrite 금지 및 별도 수동 조정.
4. Host #209/#211의 immutable local OCI pair 검증, same original volume, App stop/Writer0, preflight/plan 승인 SHA, SQLite/CAD/Scene/Current/Auth/Audit 일관 백업과 격리복원/사후 검증, 별도 App start 순서 유지. 운영 .env는 운영자가 신규 이미지 게시 증거 확인 후 수동 변경.
5. 신규 DB schema, Auth/Writer 활성, DXF 원본 삭제·재등록, 기존 READY Scene/Current 수정, Worker/Queue 연결, 운영 DB/Volume/CAD/실 현장 테스트는 이 PR 범위가 아니다.

## 수용 추적

| TC | 검증 항목 | 수단 |
| --- | --- | --- |
| 216-01 | package-lock/OCI version 정확 0.58.1 | issue216-release-contract unit + CI metadata |
| 216-02 | 등록된 0.56→0.58.1 세 가지 COMPATIBLE edge 및 0.58→0.58.1 단일 edge | issue216-release-contract + G7 upgrade integration |
| 216-03 | Schema/baseline/checksum/data/runtime 동일, drift/downgrade/unknown 차단 | 기존 G7 registry guard + 신규 unit |
| 216-04 | installId, DB/CAD/Scene/Memo/Zone/Outline/Auth/Audit/Current/복구 보존 | G7 upgrade integration/independent QA + Docker smoke |
| 216-05 | GHCR both absent/present/partial, source tag mismatch 분기 | issue216-ghcr-workflow unit |
| 216-06 | App/Migrator digest/version/role/revision/linux-amd64/원본 v0.58.0 보존 | 새 Main GHCR 실제 증거(미실행) |
| 216-07 | host 배포 계획 승인·백업·start 분리 | test_g7_upgrade.py / test_g7_deploy.py |
| 216-08 | PR CI Static/Unit/Build/Chromium/G7 Greenfield/Signed/Legacy/Docker | PR CI Run(시작 이후 성공 별도 확인) |
| 216-09 | Main merge와 실제 0.58.1+0.58.1-migrate 게시 | 추후 Main CI/OCI registry(이번 PR에서는 미실행) |
| 216-10 | 미해결 review thread 0, Main conflict/behind 0, Ledger/문서 업데이트 | PR 개설·비교 후 상태 확인 |

## 검증 경계

GitHub 커넥터로 원격 코드·시험 파일/운영 문서를 작성했다. 코드 작성 단계에서는 로컬 npm/TypeScript/Vitest/Playwright/Docker/GHCR 명령을 직접 실행하지 않았으며 결과를 PASS로 기재하지 않는다. 사용자 요청대로 PR CI 시작 후 완료 모니터링 생략. Main 병합/태그 생성/실 GHCR digest/운영 DB 업그레이드는 하지 않는다. 후속 실패 발생 시 정확 Run/Job/HEAD·원인/수리 정보를 out/FailureLedger.md에 누적한다.

## PR CI #474 시험 계약 보완 기록 (2026-11-03 KST)

PR #219 최초 Source HEAD `73fde4ad0e0ff1fc0927a41a96a7332e0eee704d`에서 [PR CI #474](https://github.com/planner77/layoutManager/actions/runs/41533666311) 실패. 신규 0.58.0→0.58.1 합성 통합 테스트의 `prior.installId` TS2339와 0.56→0.58.1 3단계 `COMPATIBLE` edge를 아직 2단계로 검사하던 Python #211 호스트 회귀의 독립 실패이다. 테스트 자료형과 기대 chain을 정합화하며 Registry/DB/GHCR/CI gate를 완화하지 않는다. 정확 결과와 재시도 경계는 [FailureLedger](FailureLedger.md)/[TestReport](TestReport.md) 참조.
