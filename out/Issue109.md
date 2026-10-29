# Issue #109 — G7 운영 인증 활성화 설계 및 통제 배포·롤백 Runbook

## #153 통합 구현 범위 갱신 (2026-10-29)

최신 Owner 지시로 G7 잔여 운영 연결을 #153 단일 PR에 통합한다. Auth/Admin 실제 Route/UI, 기존 CAD 쓰기 권한·Audit, 별도 서명 Runtime Gate, 실제 격리 Migration/Restore 실행을 구현한다. 별도 인간/반복 승인 절차는 Owner Managed로 간소화하되 기술 무결성·권한·복구를 유지한다. 아래 과거 DESIGN ONLY/미구현 문구는 당시 단계의 기록이며 현재 요구사항은 [FR-G7-153](Requirements.md)을 따른다.

이번 완료 범위는 로컬·격리 검증과 최신 HEAD PR CI 시작까지다. 실제 운영 Auth/Write/DB/CAD/S3·Writer·Compose/Nginx/.env·GHCR/Tag/병합/배포는 하지 않는다. #109/#96/#153의 실제 운영 AC와 현장 증거는 이 구현으로 자동 완료하지 않는다.

## #154 — 현장 Owner 수용 완료 보고를 S3-5 릴리스별 Owner GO 절차로 인계 (2026-10-28)

- User가 #142 B2 및 #151 C 실제 현장 Owner Managed 수용 완료 선언, 상세 원본/Hash/키/서명/식별자는 비반출. GitHub에는 `OWNER_ATTESTED_FIELD_ACCEPTANCE_COMPLETE`로 기록하고 외부 독립 확인은 `NOT_EXTERNALLY_VERIFIED`로 구별한다. 실제 Site 수용 완료는 아직 S3-5의 **릴리스별 운영 GO**가 아니다.
- 선행 C0 [Main `013effd65a68879d94d18c4928db8c600e8e9589`](https://github.com/planner77/layoutManager/commit/013effd65a68879d94d18c4928db8c600e8e9589)/CI #40641999215 SUCCESS·GHCR SKIPPED. 후속 [#153](https://github.com/planner77/layoutManager/issues/153) 내 [#154 S3-5-R0](https://github.com/planner77/layoutManager/issues/154)는 인메모리 C0 서명/신뢰된 별도 Release Identity/Owner의 릴리스별 서명 및 Scope·24h Window·rollback Operator만 검사, 운영 Auth/CAD Write/실 Prisma/Compose/Nginx/GHCR/실 데이터에 접근하지 않는다.
- 실제 안전한 전환은 별도 특정 릴리스·Owner 승인과 사내 신뢰/복구 증거 확인 이후 구현·배포가 필요, R0 출력은 `LOCAL_RELEASE_DECISION_CONSISTENT_NOT_ACTIVATED`라도 `operationalGo=false`. #153/#109/#96 OPEN/BLOCKED 및 기존 CAD 바이트/Version/Current/Audit 불변 유지.

## #151 PR #152 CI #126 E2E 제한적 Owner Managed 리스크 수용 (2026-10-28)

- CI #40638297319 HEAD `c31036cd94b81118f8064591c9b8b74c7cd5e246` Verify Job의 Chromium 91/92 성공·`TC-126-RECOVERY` 원본 GET 시작 2회/기대 1회 불일치, Docker/Unit/Build 성공, Legacy Migration E2E 미실행. 실제 2회 모두 성공인지 하나 취소인지는 미확인. 이전 실패 원장 보존.
- 기존 Viewer Renderer 수동 전환 E2E의 다운로드 완료/Abort 이벤트를 분리 계측하여 **성공 완료 GET 1개**를 필수화, 1건 취소만 허용. 두 완료 또는 비정상 오류는 계속 FAIL. Owner Managed 조건에 따라 기존 S3-4-C0 15경로+이 E2E 1경로만 정확 16-path GHCR Skip, 운영 API/Schema/Writer/Source Cache/배포/실 데이터 무변경. 신규 PR CI 완료 전 PASS 아님.
- 실제 사내 B2/S3-4-C 증거 진위·Owner GO/운영 활성화는 독립 검증 미수행; #142/#109/#96/#151/#153 OPEN/BLOCKED.

## #151 S3-4-C0 — 현장 Owner Managed 증거 비반출/신뢰 바인딩 준비 (2026-10-28)

- **사용자 승인:** 실제 B2-1~5 사내 원본·증거·해시·서명·실 EV/QA/SNAP·내부 키는 외부 반출 불가. 검증 프로그램과 합성 Template만 현장 반입, 실제 리뷰/수용·Owner Managed QA는 현장 안에서 실시하며 결과 근거/Trust Anchors는 사내 Owner 통제에 보존한다. 공개 GitHub에는 정형 상태·이유 코드만 기록한다.
- **의존:** #142 B2-5 순수 합성 오프라인 검증기 [Main `8ea0a3088e3d`](https://github.com/planner77/layoutManager/commit/8ea0a3088e3dc10ae340cf5a095375f626519e1e)·Main CI #40636610114 SUCCESS/GHCR SKIPPED; 이것은 사내 실제 Writer, 단일 Snapshot, OCI 신뢰, 복원/롤백 성공이 아니다.
- **S3-4-C0 설계/코드:** 현장 내부 영수증 17건의 실제 Byte SHA와 별도 Owner/QA Ed25519 로컬 신뢰 앵커로 서명한 Release+SNAP/Schema/Source/4 Digest·Epoch/CR 참조만 교차검증. 자동 네트워크/파일/운영 Prisma·App 라우트 연결 0. `LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO`는 신뢰된 실제 Source 인증이나 운영 GO가 아니다. [Issue #151](https://github.com/planner77/layoutManager/issues/151), [Runbook](../src/deploy/g7-s3/S3-4-C.md) 필수.
- **S3-5 후속:** 실제 Site B2-1 OCI 명세·출처/서명, B2-2 Writer Zero+SQLite/CAD/S3 same SNAP, B2-3 격리 Migration/Audit/FK, B2-4 실제 물리 Restore+Rollback/RTO·RPO, B2-5 Owner Managed QA 현장 수용이 사내 별도 확인되지 않으면 BLOCKED. S3-4-C 신뢰 바인딩 후에도 S3-5 릴리스/변경 단위 Owner GO ID·24시간 이하 Window·복구 담당자 별도. 운영 Auth/CAD Write/Compose/Nginx/GHCR/Ops SQL OFF, #142/#109/#96 OPEN/BLOCKED.

## #142 B2-4 Main CI 완료 및 B2-5 합성 증거 대조 구현 (2026-10-28)

- #142 B2-4 PR #147 최신 HEAD a59d18b PR CI #40604028179 SUCCESS. Codex 최신 재리뷰는 사용량 한도 실패(코드 무결성 통과로 간주 금지), 사용자가 Owner Managed 리뷰 승인하여 기록. 정확 no-GHCR Squash Main 81fd00ba9a7463f0b1817d83ca78fe9cc31f5b4d; Main CI #40610619799 SUCCESS/release-scope SUCCESS/GHCR SKIPPED.
- 다음 B2-5는 합성 readiness와 QA Ledger의 EV/QA/SNAP, 17 체크 상태, OCI 4개 Digest/Schema/Source 정합성만 비교. 일치 상태 DISPOSABLE_EVIDENCE_RECONCILED_NOT_SITE_PROOF는 실제 site source/QA/restore 증명 아님. 현장 B2-1~5, S3-4-C binder, S3-5 Owner GO 별도.
- G7 운영 Auth/CAD Write, 실제 Writer/SQLite/CAD/S3/OCI, 활성 Prisma Migration/Compose/Nginx/GHCR 게시 전부 미실행. #142/#109/#96 OPEN/BLOCKED.

## #142 B2-4 — 합성 Snapshot Restore/Rollback 교차검증 준비, 운영 NO-GO (2026-10-28)

- [B2-3 PR #146](https://github.com/planner77/layoutManager/pull/146) exact no-GHCR Squash Main `7b784c2d62c0872909361e3514d437247d7ab662`, Main CI #40575203195 SUCCESS/GHCR SKIPPED. 새 B2-4는 합성 Source→G7 Candidate→Rollback SQLite/Local CAD/S3-export 동등성 및 이전 App/Migrator pair 로컬 OCI Digest·Schema/Source 계약만 검증하는 순수 supplied-buffer replay. Restored/Rollback labels·신뢰되지 않은 S3 VersionId가 동일하더라도 **실 Restore/실 Rollback 실행 성공으로 증명하지 않음**.
- 사내 실제 Source/Writer freeze·온라인 SQLite backup·Local CAD/S3 Versioned GET/Registry signed provenance·실 App/Migrator 실행·RTO/RPO·B2-5 Private EV/QA/SNAP 실증·S3-4-C/S3-5 Owner release-specific GO 별도. [B2-4 Runbook](../src/deploy/g7-s3/S3-4-B2-4.md) 준수, 운영 DB/Writer/Auth/CAD Write/Prisma Migration/GHCR OFF, #142/#109/#96 OPEN/BLOCKED.

## #142 PR #146 — Audit AFTER RAISE(FAIL) 검증 보완, G7 운영 NO-GO (2026-10-28)

- [Codex P2 #4389353517](https://github.com/planner77/layoutManager/pull/146#discussion_r4389353517): 합성 후보 Audit Trigger가 AFTER/RAISE(FAIL)일 때 예외는 발생해도 Row UPDATE/DELETE가 남을 수 있는 위양성을 `auditMutationProbe`의 **전체 AuditEvent 행 전후 내용 비교**로 보완. 각 예외 발생·수정 전과 내용 일치 모두 필요하며, 변경 발견 시 `AUDIT_NOT_APPEND_ONLY/BLOCKED`. AFTER UPDATE/DELETE 음성 회귀 추가.
- 기존 PR CI #40513422160 SUCCESS는 이전 HEAD 결과, 최신 재검증 전 PASS 승계 불가. 실제 Site Writer/SQLite 백업·Auth/Write 운영 활성화, 정식 Migration, Local CAD/S3 및 OCI/Restore/Rollback/Owner GO는 미실행. #142/#109/#96 OPEN/BLOCKED 유지.

## #142 PR #146 — CI TS2769/TS2345 및 Local Storage P2 보완, 운영 NO-GO (2026-10-27)

- 기존 `bafe74cceba07a789a328c2453ccd785f19b4597` PR CI #40511480917의 Verify/Docker 실패는 `s3-4-b2-3.ts` Boolean(v) Nullable Typecheck **단일 원인**으로, TypeScript `null` 명시 제외로 보완. [Codex P2 #4389209602](https://github.com/planner77/layoutManager/pull/146#discussion_r4389209602) Local CAD Locator의 Location/DB Version UUID가 Row 소속과 다를 때도 합성 증거 허위 PASS 가능성 → `LOCAL_LOCATOR_OWNER_INVALID/BLOCKED`로 개선.
- 별도 테스트는 6 CAD SQL 기반 합성 before/after DB 모두가 같은 잘못된 Local Locator를 갖도록 하고 Asset Claim까지 일치시켜 검증기가 불변식 위반을 차단함을 확인한다. S3 UUID 독립성·8 Auth Tables·Audit 보존/장애주입 검증 유지, 현장 Source/운영 Writer/Prisma Migration/DB/CAD/S3/Restore/rollback/GO 미실시. #142/#109/#96 OPEN/BLOCKED.

## #142 B2-3 — 격리 7 Migration·합성 CAD/Audit 검증, 운영 NO-GO (2026-10-27)

- 선행 B2-2B [PR #145](https://github.com/planner77/layoutManager/pull/145) → Main `d2b77dd6535503f2d980ac563cc195cc8b4c128e`, Main CI #40506886341 SUCCESS / GHCR SKIPPED. B2-3은 기존 G7 disposable Prisma CLI의 후보 7개 적용/History 및 별도 합성 6 CAD SQL→7번째 Auth SQL에서 CAD/Current/Version/FK/SHA·Auth 8 Table·Audit 불변성을 시험하는 준비 단위.
- 실제 writer quiescence·source SQLite online backup·local CAD/S3 versioned objects/OCI provenance·B2-4 Restore/Rollback·B2-5 private evidence 및 S3-4-C/S3-5 Owner GO는 모두 별도 승인·증거 필요. 현장 B2-2B 아직 BLOCKED, #142/#109/#96 OPEN/BLOCKED, Auth/CAD Write/GHCR 미활성. [B2-3 Runbook](../src/deploy/g7-s3/S3-4-B2-3.md).

## #142 PR #145 — B2-2B 중복 S3 Locator P2 보완, 운영 NO-GO (2026-10-27)

- [Codex #4388575128](https://github.com/planner77/layoutManager/pull/145#discussion_r4388575128): S3 UUID와 DB Version UUID를 독립적으로 유지하는 변경 이후, 서로 다른 Version의 동일 S3 locator를 허용하던 문제를 `DUPLICATE_S3_LOCATOR/BLOCKED`로 수정. 실제 Prisma `uq_storage_path` 불변식 준수, 고의로 Unique Index를 생략한 합성 DB의 음성 회귀 추가. 과거 PR CI #40502175608 SUCCESS는 신규 HEAD 결과와 구분.
- 이번 작업은 사내 실제 Writer 정지/SQLite online backup·CAD/S3 원본·GHCR/배포/7 Migration·Restore/Rollback·G7 Owner 승인과 분리한다. #142/#109/#96 OPEN/BLOCKED, 운영 Auth/CAD Write OFF.

## #142 PR #145 — B2-2B S3 UUID 매핑 P2 보완, 운영 NO-GO (2026-10-27)

- S3ObjectStorage의 객체 UUID는 CadRepository의 DB Version UUID와 독립임을 검토하고 B2-2B 오프라인 합성 대조에서 `s3ObjectLocator` ↔ DB `storage_path`로 검증 기준을 정정. Codex P2 #4388372985는 이전 PR CI 성공과 구분 기록. 현장 S3 원본 객체/version GET 및 Writer freeze는 여전히 `NOT RUN`.
- #142/#109/#96 OPEN/BLOCKED, 운영 Auth/CAD Write/활성 Prisma/Compose/Nginx/GHCR 미실행 유지. 현장 Source 확인·실 복원/rollback은 별도 CR/Owner 승인과 독립 증거 이후에만 추진한다.

## #142 B2-2B — 합성 바이트 대조 준비, G7 운영 활성화 여전히 BLOCKED (2026-10-27)

- B2-2A PR #144 → Main `e043d56d43099034906cccf0bb1cc1c7a76bb11f`, Main CI #40496032085 SUCCESS/GHCR SKIPPED. B2-2B는 별도 공급된 **격리 합성 SQLite/Local CAD/S3 Export Byte**의 해시·FK/Version/Current·SNAP/Marker·DB mapping을 검증하는 개발 단계다. 그 Bytes가 실제 사내 원본인지, 동일 Writer Epoch에서 생성됐는지 입증하지 않는다.
- 실제 Source writer-quiescence/SQLite online backup/원본 CAD와 versioned S3 GET/Marker/Audit, 후보 7 Migration/Restore/Rollback 및 S3-4-C binder/S3-5 Owner GO는 별도 승인·증거가 필요하다. 운영 DB/API/Nginx/Compose/GHCR와 이슈 #142/#109/#96 상태는 OPEN/BLOCKED로 유지. [B2-2B Runbook](../src/deploy/g7-s3/S3-4-B2-2B.md).

## #142 S3-4-B2-2A — writer barrier 주장과 실험 분리 (2026-10-27)

- B2-1 PR #143 → Main `2d29b8572b02ccacf5e0032bf5432cb2f2b26ed6`; [Main CI #40483297907](https://github.com/planner77/layoutManager/actions/runs/40483297907) release-scope SUCCESS, GHCR SKIPPED. B2-2A는 Writer Quiescence·SQLite online backup·Local CAD/S3 버전 객체라는 **운영자 제공 메타데이터**의 시간·Epoch·Snapshot/Version·Hash 상호모순을 검사하는 순수 계약만 도입.
- 실제 freeze, 참조된 원본 Snapshot의 독립 SHA/SQL·S3 버전 검증, B2-3 이관 7개 Migration, B2-4 restore/rollback, B2-5 증거 검증 등 실증은 NOT RUN. [B2-2 Runbook](../src/deploy/g7-s3/S3-4-B2-2.md) 경계 준수. #109/#96 OPEN/BLOCKED, 런타임 GO/OFF 스위치 변경 없음.

## #142 S3-4-B2-1 착수 — OCI 로컬 digest 대조·운영 NO-GO (2026-10-27)

- B1 PR #141→Main `7469d016a5926aca07929bf3e95e869b46716bd1`; Main CI [40478523325](https://github.com/planner77/layoutManager/actions/runs/40478523325) release-scope SUCCESS/GHCR SKIPPED. #142는 순차 B2-1(OCI)→B2-2(Snapshot barrier)→B2-3(격리 7 Migration)→B2-4(restore/rollback)→B2-5(사내 evidence)로 분리.
- 현재 B2-1은 운영자 제공 OCI manifest/config raw Bytes의 SHA-256, 사전 지정한 4개 역할 App/Migrator/Rollback Pair, Source SHA·Version·G7 Schema/Role 라벨을 **오프라인 순수 함수**로 검증. 실 Registry 진위, 이미지 publish, 서명, 롤백 호환성, 동일 Snapshot 실 복구는 확인하지 않았으며 모든 결과 `registryVerified:false`/`operationalGo:false`. [B2 Runbook](../src/deploy/g7-s3/S3-4-B2.md).
- `src/Dockerfile`/정식 Migration/운영 배포 코드/Compose/실 CAD·DB·S3 변경 없음. B2의 나머지 실제 사내 시험은 명시적 별도 Owner 승인 전 NOT RUN. #109/#96 OPEN/BLOCKED 유지.

## #109 PR #141 — Unit 실패 및 P1/P2 보완 (2026-10-27)

- [PR CI #40444154044](https://github.com/planner77/layoutManager/actions/runs/40444154044), HEAD `b5f340e69bd28aed939bb1c443df355c1652f5bf`: Unit/Integration 404 중 5 실패, Typecheck/ESLint·Docker PASS, Build/E2E SKIPPED. 5개 공통 직접 원인: 정상 Manifest Sorted Key 기대 순서 오타→`SNAPSHOT_MANIFEST_MISMATCH`.
- [Codex P1 #4384813274](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813274) key order 수정. [P2 #4384813277](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813277) SQLite source path 재오픈 TOCTOU를 검증 Buffer→메모리 DB로 교정, [P2 #4384813278](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813278) 8개 Auth table 완전/완전부재 검사로 수정. 관련 회귀 테스트·B1 Runbook 추가. **신규 HEAD CI 전 PASS 미확인**.
- S3-4-B1은 격리 readonly/합성 clone 무결성 검사 준비이며 실제 운영 Snapshot 동시성·실 Registry OCI·실 Migration/Restore/rollback은 NOT RUN. Auth/Write/운영 SQL·Compose/Nginx·GHCR·실 DB/CAD/S3·Issue 종료 금지.


## S3-4-B1 격리 복원 검증기 착수 — B2 실환경 증거 미제출 (2026-10-27)

- S3-4-A PR #136 → Main `1500eb699d5ef8d2045e951354838aa13ce24f92`, Main CI #40443473912 SUCCESS, release-scope SUCCESS, GHCR Build/Push SKIPPED. B1은 해당 Main에서 독립 구현.
- 격리 복원본 `/tmp/cad-g7-s3-b-*/snapshot.sqlite`를 **readonly**로 열고 FK/Integrity, CAD Location/Version/Current/nextVersion, 실제 local CAD/S3 export 파일 byte 길이·sha256와 Snapshot marker/schema boundary를 대조한다. symlink/FIFO/타 UID/부적절한 권한/파손/누락은 실패. 실제 OCI/사내 원본 Snapshot 시점 동일성 입증은 구현하지 않음.
- B1 판정 `BLOCKED` 또는 `ISOLATED_INTEGRITY_ONLY`; 양쪽 모두 `operationalGo:false`/`runtimeActivated:false`. 로컬/S3 원본 바이트·경로/해시를 출력하거나 외부 반출하지 않음. [B1 Runbook](../src/deploy/g7-s3/S3-4-B.md).
- B2(사내 실제 OCI 고정 digest 출처 검증·실 동일 Snapshot 백업/복원·격리 Migration/rollback), C(trusted release binding), S3-5 Owner GO는 후속. 운영 Auth/Write/Schema/Compose/Nginx/GHCR/실 DB/CAD/S3 변경 없이 #109/#96 OPEN/BLOCKED.


## PR #136 S3-4-A P2 보완 — 비공개 파일 교체·Status 엄격 자료형 (2026-10-27)

- [PR CI #40438604869](https://github.com/planner77/layoutManager/actions/runs/40438604869) 이전 HEAD 성공. 리뷰 [#4384543606](https://github.com/planner77/layoutManager/pull/136#discussion_r4384543606) 비공개 파일 TOCTOU, [#4384543609](https://github.com/planner77/layoutManager/pull/136#discussion_r4384543609) 배열 `NOT_RUN` 오분류는 CI 실패와 구분한다. `open O_NOFOLLOW/O_NONBLOCK` + 같은 descriptor의 `fstat`·inode/UID/permission 검사와 동일 fd 읽기, strict string 상태 검사 및 회귀 시험으로 보완.
- 이전 CI PASS는 새로운 코드를 검증하지 않음. S3-4-B 사내 OCI/실 복구·C trusted binder·S3-5 Owner GO 모두 NO-GO. #109/#96 OPEN/BLOCKED.


## S3-4-A 오프라인 OCI·Migration·Rollback 증거 패킷 검증 착수 (2026-10-27)

- S3-3 PR #135 `dc20844be7525bd3367f38cc3080675efa4fa89c` 및 Main CI [40437054103](https://github.com/planner77/layoutManager/actions/runs/40437054103) 성공·GHCR SKIPPED 근거 다음 단계. S3-4를 **A(오프라인 증거 구조검증) → B(사내 OCI/실 Snapshot 복구·rollback 검증) → C(신뢰된 Release/Operation binder) → S3-5 Owner 실운영 GO**로 분리한다.
- **이번 구현 A:** Source SHA, 7th `202610260002_g7_operational_auth` 후보 Schema, 정확 App+Migrator OCI digest·version/source pairing, rollback pair, 17개 필수 증거(check별 PASS/FAIL/NOT_RUN/CANCELLED·사내 EV/QA/timestamp·SNAP id) 검증. 사내 0600 JSON/절대경로만 열어 결과 상태/사유 코드만 출력. PASS는 운영자 주장으로 간주하므로 실제 Registry/DB/CAD/S3 검증했다고 **주장하지 않는다**.
- 모든 반환에 `operationalGo=false`/`runtimeActivated=false` 하드코딩, Auth/Write default OFF, 활성 Migration 및 자동 Migrator/Compose/실 데이터 변경 없음. S3-4-B/C·특정 릴리스 Owner 승인까지 **NO-GO**. 근거: [S3-4 Runbook](../src/deploy/g7-s3/S3-4.md), [Operation](Operation.md), [TestPlan](TestPlan.md), [FailureLedger](FailureLedger.md). #109/#96 OPEN/BLOCKED.
- 정확 Squash 예정 `#109 | S3-4-A Offline release evidence [G7-S3-4A-NO-GHCR]`, 명시 파일 allowlist 외 런타임/운영 SQL/Compose 변경 시 실패; 새 코드/시험은 CI 전 미검증.


## Issue #109 S3-3 — CAD API 권한·Audit 원자성 준비, 운영 OFF (2026-10-27)

- **기능:** 기존 CAD Multipart POST·Current PUT·Version DELETE에서 서버 DB의 최신 Session/Role/Site를 같은 Prisma Transaction 안에 재조회하고 승인된 Editor/Admin+Site만 쓰기 허용한다. DELETE는 기존 삭제 비밀번호도 요구하며, CAD DB 변경과 CAD_UPLOADED/CAD_CURRENT_CHANGED/CAD_VERSION_DELETED Audit INSERT 중 하나라도 실패하면 DB를 롤백한다. 기존 업로드 보상·삭제 Job, 익명 GET/Viewer·CAD 데이터 규약은 유지한다.
- **운영 차단:** `NODE_ENV=production`에서는 S3-3 프리뷰 활성화 불가. 정확한 S3-2 disposable DB/marker/7 migration, loopback origin, `G7_S3_AUTH_API_PREVIEW_ONLY=true`, `G7_S3_CAD_PREVIEW_ONLY=true`, `G7_AUTH_ENABLED=false`, `G7_CAD_WRITE_CUTOVER_ENABLED=false` 조건만 격리 시험 허용. 별도 Prisma Client와 0700 root 하위 로컬 CAD 저장소 이용. 운영 Migration·실 DB/CAD/S3·Compose/Nginx/.env·GHCR 게시·인증/쓰기 활성화 없음.
- **시험·잔여:** synthetic integration(Unit) 검증 코드 추가; 실제 PR CI는 시작 전이므로 결과 `NOT RUN`. 일회용 Preview Cookie의 Path는 `/api/g7-operational`이므로 다른 CAD 경로의 프로그램 시험에서는 테스트용 Cookie를 명시적으로 넘기며 운영 브라우저 인증이 활성된 상태는 아님. S3-4는 OCI/운영 Migration/실복구·신뢰 release binding, S3-5는 릴리스별 Owner GO 및 현장 수용. 기존 유사범위 PR #128은 미병합·충돌 상태이며 자동 병합하지 않는다. #109/#96 OPEN/BLOCKED.
- **후속 정확 Squash:** `#109 | S3-3 Isolated CAD write and Audit [G7-S3-3-NO-GHCR]` 및 개별 파일 allowlist만 GHCR 미게시. 내부 로그/비밀번호/IP/실 도면 반출 금지. [S3-3 Runbook](../src/deploy/g7-s3/S3-3.md).


## PR #131 S3-2 두 번째 CI Unit 1건 실패·Response 진단 헬퍼 교정 (2026-10-27 KST)

- **관측 실패:** [PR CI 40394690714](https://github.com/planner77/layoutManager/actions/runs/40394690714), HEAD `0cab0f1449e0a7f8e41a1149a5e46b0aa0ef8a72`, Verify [121824493035](https://github.com/planner77/layoutManager/actions/runs/40394690714/job/121824493035) Unit/Integration 359/360 PASS·1 FAIL, Typecheck/Lint PASS; Docker [121824492537](https://github.com/planner77/layoutManager/actions/runs/40394690714/job/121824492537) PASS. 정확한 실패 `g7-s3-operational-auth.test.ts:127:57` = 로그인 Test 헬퍼에서 `r.json()`으로 원본 Body 사용 후 `admin.response.clone()` 시도한 TypeError. 이후 Build/E2E는 SKIPPED. 기존 40337811911 TS2540 실패 및 Codex GHCR P1 교정 기록 보존.
- **수정:** 헬퍼에 `r.clone().json()` 사용 및 `bodyUsed=false` 명시 회귀. 이는 시험 헬퍼 수정이며 운영 Auth/DB·CAD Business logic 변경 없음. 로컬 Node Response 최소 검사는 통과했으나 최신 HEAD PR CI의 전체 PASS는 별도 검증 필요.
- **게이트:** Latest Main `338e1097b81115f8309fc4fde98414407ab826d0`와 정렬·충돌 없음, Codex P1 resolved/미해결 0. 정확 `#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]` GHCR 허용 목록을 유지하고 새 HEAD CI 시작 후 모니터링/병합/실 GHCR/운영 Prisma/Compose/Nginx·실 DB/CAD/S3/Issue #109/#96 종료 금지. 상세 [FailureLedger](FailureLedger.md)/[TestPlan](TestPlan.md)/[TestReport](TestReport.md).


## S3-2 운영 Auth·관리 API 계약 통합 (프로덕션 OFF, 2026-10-26)

- **계획/구현:** S3-1 운영 Prisma 모델·별도 Migration 후보에 G3/G4 Login/Session/Logout/InitialChange/Grant/Disable/Audit를 예약 `/api/g7-operational/**` App Router와 연결. Admin-only `users/create`는 CSRF·DB G4 users:manage 사전 인가+감사, 해시 생성 후 거래 내 Admin/Session 재검증과 User+Audit 원자 기록. G2 최초 Admin 생성·복구는 `scripts/g7-s3-admin.ts --ack-disposable-only`에서만, 앱 기동/배포 자동 실행 없음.
- **운영 불활성화:** `NODE_ENV=production`은 404 강제, `G7_AUTH_ENABLED=true`/Owner S2 승인 의사만으로 Runtime 활성화되지 않음. 실제 API 기능 시험은 Linux canonical /tmp 일회용 정식 S3 후보 DB + 명시 Preview flag/Loopback Origin에 한정. S3-1 pure preflight는 `runtimeActivated=false`, 운영 Auth/Prisma Migration/기존 CAD Multipart POST·Current·DELETE, Compose/Nginx/.env/실 DB/CAD/S3/OCI 배포·Audit 물리 purge 변경 없음.
- **후속 게이트:** S3-3 운영 CAD 쓰기 Auth+Audit transaction 통합, S3-4 실 OCI App/Migrator pair/DB-CAD-S3 동일 Snapshot 실복구 및 신뢰 가능한 release binder, S3-5 Owner 특정 릴리스 운영 GO. 사용자 사내 실제 시험 증거 외부 비반출 정책 준수. [S3-2 Runbook](../src/deploy/g7-s3/S3-2.md), ADR/Operation/TestPlan/TestReport/FailureLedger 참조.
- **PR 릴리스 격리:** 정확 Squash 제목 `#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]`+S3-2 23개 파일 whitelist만 GHCR 게시 제외; 운영 활성 이력/기존 CAD/Compose·미승인 제목은 Main release-scope nonzero. 이번 요청은 구현·리뷰/충돌 해결·PR CI 시작까지이며 **병합·GHCR·운영 GO·Issue #109/#96 종료 제외**.


## S3-1 운영 Schema 타입·정식 Migration 후보·Release/Operation Gate 구현 (2026-10-26)

- Owner가 S1 수용·S2 준비 승인을 선언했으나 실제 운영 릴리스별 GO 증거/내부 실 DB/CAD/S3 복구 로그는 외부 제출 불가이며 특정 서명/기간·OCI digest는 미확정. **운영 Cutover 실행은 승인하지 않는다**. 관련 Runbook [S3-1](../src/deploy/g7-s3/README.md), [ADR](Decisions.md), [TestPlan](TestPlan.md).
- **S3-1 구현:** `src/prisma/schema.prisma`에 기존 G1~G4 User/Session/Role·Site/SpecialGrant/Audit/Recovery/G3 limiter 모델 및 CAD Site FK를 정식 운영 Client 모델로 통합. 후보 신규 Migration `202610260002_g7_operational_auth`와 기존 CAD 6개는 독립 `src/deploy/g7-s3/prisma/migrations` 이력에 등록, 테스트 전용 canonical /tmp config에 한해서 `prisma migrate deploy` 실행. 현재 운영 migrator는 자동 SQL 적용이므로 **신규 Auth Migration을 활성 `src/prisma/migrations`로 승격하지 않음**.
- **이중 승인:** `G7-S3-AUTH-V1` capability/버전 동일 App+Migrator digest/Source SHA/Schema/registry·FK·rollback 확인과 릴리스별 Owner GO ID/기간/Scope/snapshot/변경 ID를 검증하는 preflight 추가. Auth 및 별도 Write flag OFF 기본, false/오타/불일치 fail-closed; 순수 모듈로 **운영 라우트에 미연결**·항상 runtimeActivated=false. 기존 CAD POST/Current/DELETE auth·Audit 연결은 **S3-3**, 실제 인증·관리 API는 **S3-2**, OCI/동일 Snapshot 실복구·SOP는 **S3-4**, 실 운영 활성화 Owner GO는 **S3-5** 후속.
- **비게시/범위:** PR 제목(향후 정확한 squash) `#109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]`, S3-1 파일만 Main GHCR skip, 다른 운영파일/활성 Migration·타 workflow는 CI 거부. 사용자 요청대로 새 HEAD PR CI 시작까지만; **PR 병합·Main CI·GHCR 게시·실 운영 Auth/Prisma Migration·Nginx/Compose/.env·실 DB/CAD/S3·Audit purge·#109/#96 종료 금지**. G7 AC1~4/운영 NO-GO 유지.



## S2 PR #129 — Codex P1 GHCR 게시 분기 보완 및 배포 보류 (2026-10-26)

- 구 HEAD `29ed3028bf0f78ba37abba0ecde73a6483d0942f`의 [PR CI 40313233131](https://github.com/planner77/layoutManager/actions/runs/40313233131)은 Verify/Docker 모두 성공이지만, [Codex P1](https://github.com/planner77/layoutManager/pull/129#discussion_r4376591801)은 Main의 Runtime 변경 범위 판정이 S2 Offline Readiness 소스를 GHCR 게시 대상으로 취급한다고 지적했다. 이는 **CI 실패가 아닌 병합·배포 정책 위험**이다.
- S1의 `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]` 예외는 그대로 유지. S2 준비 작업에만 정확한 `#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]` squash commit 첫 줄·**S2 개별 파일 allowlist** 적용. 허용 외 운영 CAD/Prisma/Compose·다른 Workflow·일반 소스·S1 Stage runtime이 포함되면 GHCR 자동 게시 대신 Main CI를 fail-closed. S2 제목 접미·공백/유사 제목도 차단.
- 테스트/문서/실패 원장 및 [S2 Readiness Runbook](Issue109-S2-Readiness.md) 동기화 후 **새 PR CI 시작까지만**, 성공 여부 확인 전 병합 및 Main CI 불가. 사용자 요청대로 GHCR 이미지·태그 게시와 운영 Auth/API/Prisma/Nginx·Compose/.env·DB/CAD/S3/Account 활성화, 이슈 #109/#96 종료 금지. S2 Owner 진행 승인과 실 운영 전환 실행 GO는 구분한다.


## S2 내부 증거 비반출 준비 도구 — 사용자의 제약 반영 (2026-10-26)

- Owner는 **내부 환경 시험 결과를 외부 제출할 수 없음**을 명시했다. 따라서 원본 로그/CAD/DB/S3/내부 IP/Secret/해시 목록을 GitHub에 요구하거나 업로드하지 않는다. 내부 절대경로의 원시 자료는 사내 담당자만 보관하고 공개 기록은 최소 식별자·PASS/FAIL/NOT_RUN·검증자 증빙 유무만 표시한다.
- `out/Issue109-S2-Readiness.md`의 22개 필수 체크, `src/scripts/g7-s2-readiness.ts` 오프라인 CLI와 schema validator/Unit을 준비한다. `READY_FOR_OWNER_REVIEW`도 **실제 GO가 아니며** 자동 Activation 불가이다. 요청 이행은 S2 준비 도구 구현 범위이며 기존 CAD 업로드/Current/Delete Auth+Audit Cutover, 실 운영 Prisma Migration, 호환 이미지 쌍·Restore는 **별도 미구현**으로 유지한다.
- #109/#96 OPEN/BLOCKED, 운영 App/DB/CAD/S3/Nginx/Compose/.env/OCI 태그 변경·운영 활성화 없음.


## Issue #109 / PR #125 — Unit 실패/P1 3건 보완·Prisma CLI fail-closed·CI 재시작 (2026-10-26)

- **실패 증거:** 구 HEAD `818264afb8809ccf0a3e09262e1a09054fd43004`의 [Run 40275956996](https://github.com/planner77/layoutManager/actions/runs/40275956996) `completed/failure`. Verify `Unit 및 Integration 테스트` 313개 중 1개 실패, Docker 성공. 실제 실패는 GHCR 경로차단 진단 출력의 stdout/stderr Assertion 불일치; 이후 Build/E2E는 SKIPPED. [FailureLedger](FailureLedger.md)/[TestReport](TestReport.md) 상세.
- **P1 보완:** [GHCR 정확 제목](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313158)은 커밋 첫 줄만 `sed`로 분리/정확 일치, 잘못된 유사 제목은 오류 종료. [Staging Prisma DB 검증](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313165)은 CLI 설정이 운영 DB를 열기 **전에** 임시 DB/권한·매니페스트·URL/승인 조건을 검증하며 fallback 제거. [Output Stream](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313173)은 실제 비허용 경로 진단을 stderr로 출력하고 거부 exit 1 보존. 정확제목·stdout/stderr·운영 경로 거부/원본 변경 0 Test 작성.
- **운영 차단 불변:** 이 작업은 단일 PR #125의 Staging 전용 Source·테스트·가이드 보완이다. 기본 OFF/Owner S2 GO 미승인, 기존 공개 CAD GET·운영 Multipart POST/Current/Delete·Prisma/Compose/Nginx/.env·실 DB/CAD/S3·GHCR 게시·Audit purge 변화 0. G7 AC1~4 미수용, #109/#96 OPEN/BLOCKED. 수정 HEAD PR CI 시작 후 모니터링·병합·릴리스·이슈 종료 수행하지 않는다.


## #109 S1 PR #125 — 최초 CI 성공·Staging 수용 범위/배포 차단 (2026-10-26)

- [PR CI 40270394055](https://github.com/planner77/layoutManager/actions/runs/40270394055) 구 HEAD `a82a04bb` Verify/Docker 성공은 **자동·격리 Staging**에만 해당. S1의 운영 Cutover·G7-AC1~4 완료 또는 Owner GO가 아니다.
- **Staging과 운영 CAD 차이:** Stage `/api/g7-staging/cad/upload`는 최대 256 KiB DXF JSON/base64 미러, 운영 `POST /api/cad-files`는 Multipart·로컬/S3 Storage Backend 및 업로드 보상·관측; Stage Current/Delete는 Stage SQL+Audit 트랜잭션, 기존 `PUT /api/cad-locations/[locationId]/current`와 `DELETE /api/cad-files/[versionId]`는 **변경되지 않음**. Stage DELETE는 원본 파일을 cleanupPending으로 남기고 운영은 삭제 Job/실 파일 삭제·202 응답 가능. Stage 익명 GET은 별도 synthetic DB이므로 실제 Viewer/DWG·PC 2대 회귀의 대체가 아니다.
- **후속 보완:** Staging 쿠키를 `cad_staging_session`/Stage Path로 분리하고 기존 G3/G4 내부 서비스만 어댑터로 재사용, 쿠키 공존·Logout 회귀 추가. GHCR 자동 게시 회피를 위해 Main workflow에 **단일 제목+allowlist** no-GHCR 예외와 Bash synthetic 검사 추가. 이 수정 HEAD CI/리뷰 완료는 아직 별도 증거 필요.
- **S2 선행 미확정:** 실 staging PC/Proxy·S3 Backup/Restore, 운영 Multipart API의 권한/감사 Cutover, 앱+Migrator OCI digest 실제 검증 및 rollback, Admin Secret/Audit retention SOP와 Owner **별도 GO**. #108은 Owner 보고 수용됐지만 개별 비공개 증거 ID는 미열람.
- **Issue 상태:** #109와 #96 OPEN/BLOCKED, GHCR 게시/실운영 Auth·Prisma/Nginx/Compose 활성화/이슈 종료 미승인. 병합은 리뷰 최종 완료·0 미해결·behind=0·최신 PR CI 통과·Main GHCR skip 게이트 확인 후에만.



## S1 Staging 통합 구현 — 단일 PR, 운영 NO-GO (2026-10-26)

- 기존 #109 설계/Runbook S0 완료 이후 **동일 #109 작업**에서 G1~G4 Stage adapter, 공식 분리 Prisma Schema+CAD 6개/G7 1개 Migration, Admin 명시 1회 CLI, release+operation 이중 gate/기본 OFF, App Router `/api/g7-staging/[...segments]`, 세션/Grant/Audit·격리 DXF JSON/base64 upload/current/delete mirror와 테스트 코드를 작성했다. 하위 이슈나 별도 기능 PR로 분할하지 않는다.
- **운영 경계:** 실제 `src/prisma/**`·기본 migrator·`src/app/api/cad-files/**`/cad-locations/current, 운영 Nginx/Compose/.env/DB/CAD/S3 변경·활성화 0. Staging gate는 UID 소유 `/tmp/cad-g7-staging-*/fixture.sqlite`·전용 CAD·매니페스트·승인된 staging 값 모두 일치하지 않으면 404. 별도 CAD write flag도 기본 OFF. 신규 영속 Outline/Memo/Type/Logs/Audit purge 미승인으로 미노출.
- **제약·증거:** Stage JSON/base64 DXF 등록은 실제 기존 multipart 업로드 API의 정식 교체가 아니며, stage manifest digest는 증거용 참조이지 OCI 서명/Owner 운영 GO가 아니다. 관련 코드/Unit·통합 TC를 작성했지만 로컬 Prisma/Vitest/Playwright/사내 PC/S3는 NOT RUN; PR CI 실행 결과는 Run/HEAD로만 PASS 처리. #108 G6 Owner 수용 완료, 실 개별 증거 ID 독립 열람 못함. G7-AC1~4 미완, #109/#96 OPEN/BLOCKED.
- **다음 게이트:** 단일 S1 PR HEAD CI → Stage QA/실행 출처 기록 → S2 비공개 증거/실 릴리스 digest·Schema·관리 SOP 확인 및 Owner **별도 Go/No-Go** → 승인된 경우에만 S3 운영 활성화/롤백. 이번 요청은 PR CI **시작**까지, 병합/GHCR/운영 ON/이슈 종료 없음.


> **2026-10-26 / DESIGN ONLY / #109 OPEN-BLOCKED / 운영 NO-GO.** 본 문서는 실행 승인서가 아니다. G6 [#108](https://github.com/planner77/layoutManager/issues/108)은 Owner의 현장 시험 이상 없음 보고로 closed/completed 처리되었지만, 개별 실제 시험 로그·DB/CAD/S3 복원 원본 체크섬·비공개 증거 ID는 여기서 독립 확인되지 않았다. G7의 운영 증거 확인 및 Owner **별도 명시적 Go/No-Go** 이전에 운영 API·Auth·정식 Prisma/DDL·Nginx/Compose/.env·실 데이터 또는 기존 CAD 쓰기 권한을 전환하지 않는다.

## 1. 정책 기준과 현재 상태

기준: [#96](https://github.com/planner77/layoutManager/issues/96), [#109](https://github.com/planner77/layoutManager/issues/109), [ADR-051-R1](Decisions.md), [AGENTS](../AGENTS.md), [Architecture](Architecture.md), [Database](Database.md), [Requirements](Requirements.md), [Operation](Operation.md), [TestPlan](TestPlan.md). 별도 DESIGN.md는 저장소에 없으므로 Architecture/Decisions를 설계 기준으로 한다.

- G0-BIZ-01~06 Owner 승인: 기존 CAD 목록/검색·위치/Version/Current·Viewer·원본 GET/다운로드는 사내망에서 **익명 유지**. `POST /api/cad-files` 및 Current PUT는 인증 **Editor 이상 AND 담당 Site**. Version DELETE는 **Editor 이상 AND 담당 Site AND 기존 삭제 비밀번호**. Admin도 Site 전체 권한 자동 부여 없음; X-Role/X-User·삭제 비밀번호 자체는 인증이 아니다.
- 새로운 Outline/Memo/Type/Logs/Audit/Admin 영속 GET은 익명 승인에 포함되지 않는다. #98/#83/#65/#60 실제 영속 API는 개별 DB·권한·QA 승인과 단계별 전환이 필요하며 `audit:read`와 `logs:read`는 독립 Admin SpecialGrant다.
- 지정 운영 담당자가 최초 Admin 초기화/단발 복구를 실행하고 Owner가 책임을 가진다. AuthSession 절대 8h/유휴 30m/최대 3개, 세션 회수, User/Role/Site/Version 재검증, Actor·Revision·Audit 안전 필드/원자성 필수.
- Audit 365일 보존, 만료 기록 정리 **방향만 승인**. 정리 주기·물리/자동 삭제·backup/restore 재등장·예외 SOP는 미승인이므로 purge는 OFF.
- ADR-051-R1의 사내 LAN 일반 HTTP, TLS/MFA/침투·탈취 공격대응 비범위는 유지(`OWNER_ACCEPTED_SCOPE` ≠ 안전성 PASS). 정상 업무 기능·DB 무결성·복구·운영 Owner GO 게이트는 면제되지 않는다.

## 2. 향후 구현 설계 — Release gate + Operation gate

**현재 이 환경변수 및 운영 라우팅은 미구현이다.** 설계 기준 이름을 정하는 단계이며 실제 코드·환경설정을 이 문서 PR에 포함하지 않는다.

| 게이트 | 설계 조건 | 기본 / 실패 |
| --- | --- | --- |
| Release gate | G7-auth-capable 빌드 capability, 고정 Git SHA, App+Migrator **OCI digest pair**, 정식 Prisma Schema와 migration 호환 | 미탑재·불일치면 G7 기능 OFF |
| Operation gate | Owner 승인 ID/범위/유효 시간, 비공개 배포 manifest, `G7_AUTH_ENABLED` | 미설정·`false`·오타=OFF; 정확히 `true`라도 release/GO/Schema 검증 실패면 OFF |
| CAD write 별도 cutover | 두 게이트 충족 + `G7_CAD_WRITE_CUTOVER_ENABLED` | 기본 false/명시 true만 ON, Auth OFF이면 강제 OFF, 권한 오류시 기존 익명 write로 fallback 금지 |
| Audit 만료 purge | 추가 Owner SOP(주기/예외/Backup/Restore) | 별도 승인 전 자동/수동 실행 금지 |

작동 목표: 신뢰된 세션 → 같은 DB transaction에서 현재 User·Role·Site/SpecialGrant·Version→Site 검증 → CAD POST/Current는 Editor+Site, Version DELETE는 추가 레거시 암호 AND → 변경+append-only Audit 원자 Commit/Rollback. 401/403/DB/Audit 장애·Scope 불일치 시 보호 쓰기 거부/fail-closed, 미승인 API 비공개. 기존 익명 CAD GET/Viewer/다운로드는 Auth on/off 모두 유지한다. 관리자 자동 재시작 bootstrap 불허.

```text
Verified G7-capable App+Migrator digests + approved Schema
                    AND
       Owner explicit GO / private evidence ID
                    AND
       G7_AUTH_ENABLED=true (default false)
                     |
          Auth/Session/Role/Site/Audit path
                     AND
 G7_CAD_WRITE_CUTOVER_ENABLED=true (default false)
                     |
 POST/Current: Editor+Site; DELETE: Editor+Site+old password
Existing anonymous CAD GET stays separate and unchanged.
```

기존 `ADMIN_BOOTSTRAP_ENABLED` 등의 제안 변수는 현재 앱에서 실제 Auth를 활성화하지 않는다. G7 설계 이름을 실제 런타임 flag로 구현할 때, Owner 승인만으로 `src/prisma`와 API가 자동 적용되는 **단일 스위치**는 금지한다.

## 3. 선행 게이트 및 현재 판정

| Gate | 증거와 미충족 내용 | 현 상태 |
| --- | --- | --- |
| G0 #102 | 익명 CAD GET·Editor/Site/DELETE 암호/관리자·Audit 6개 업무 정책 | CLOSED (정책) |
| G1 #103 | User/Session/Grant/Audit 격리 DDL, 정식 운영 Schema/Restore는 아직 아님 | CLOSED (격리) |
| G2 #104 | 최초 Admin/복구 격리; 실 담당·대리인·Secret SOP는 비공개 후속 | CLOSED (격리) |
| G3 #105 | 8h/30m/3개 세션 서비스; 실제 PROD Cookie/E2E는 G6 | CLOSED (격리) |
| G4 #106 | Role/Site/Version·Audit 원자성 격리; 실제 Route·purge 미연결 | CLOSED (격리) |
| G5 #107 | Nginx PROD/DEV direct Preview; 현장 두 PC 실측은 G6 | CLOSED (Preview) |
| **G6 #108** | PC 2대·Nginx/DEV·업무 E2E 및 DB/CAD/S3 복구·롤백: Owner가 수행·이상 없음 보고; 개별 사내 로그/증거 ID는 GitHub에서 독립 확인 불가 | **CLOSED / OWNER ACCEPTED (2026-10-26)** |
| **G7 #109** | G0~G6 증거·정식 이미지·운영 SOP·Owner 별도 GO 및 승인된 배포/복구 실증 | **OPEN / BLOCKED** |

CI와 GHCR 이미지 게시 성공은 운영 인증 활성화 승인도, 동일 시점 DB/CAD/S3 복구 성공도 아니다.

## 4. 실행 단계와 Stop/Go

### S0. 지금 가능: 설계/문서 PR·격리 준비 (NO-GO)

1. ADR-051-G7-PLAN·Architecture/Database/Requirements/Operation/TestPlan/TestReport를 본 Runbook과 정렬하고 **Markdown-only** PR을 생성한다. G7은 OPEN/BLOCKED 상태로 유지한다.
2. 미래 G7 구현 단위를 분리해 명세한다: 릴리스 capability·엄격한 OFF flag, 정식 Prisma migration, 기존 G1~G4 Auth/Session/Grant/Audit 서비스와 App Router 연결, 로그인 UI/관리 API, 별도 CAD write cutover, 회귀·rollback 테스트. 운영 연결·Schema 적용은 지금 수행 금지.
3. #108 G6의 Owner 현장 시험 정상 보고 및 이슈 종료는 확인됐다. G7 운영 승인 패키지에는 실제 PC 2대·Windows Nginx PROD/DEV direct·권한·Cookie·업무 E2E, 하나의 snapshot ID의 DB/CAD/S3 **실 Restore/롤백**에 해당하는 사내 비공개 원본 증거 ID·실행자/시각·복구 검증 결과를 **별도 대조**한다. 제출하지 않은 로그/체크섬을 만들어 적지 않으며, 합성 테스트의 PASS만으로 독립 실복구를 주장하지 않는다.
4. 사내 비공개 SOP 미결정: Admin 담당·대체자/Secret 파일 취급·승인, Audit 만료 purge/백업본·복원 예외, 운영 배포 URL·업무 중단 창·변경 담당·승인, 실패 데이터 재처리 책임. 결정 누락시 S2 NO-GO.

### S1. 비운영 후보/검증 (운영 NO-GO 유지)

1. G7-capable 후보 source SHA와 App+Migrator immutable digest pair·정식 Schema 계약을 고정한다. `latest`만으로 후보를 지칭하지 않고 기존 버전 태그를 이동하지 않는다.
2. **운영이 아닌 격리 DB/CAD/S3 복제**에서 정식 migration dry-run, FK/Unique·User/Site/Audit·CadFileVersion/Current/Source bytes·SHA/기존 삭제 hash 불변과 backup/restore 시험을 수행한다. G1 fixture migration.sql을 그대로 `src/prisma/migrations`로 복제하거나 `prisma db push`로 운영 DB를 수정하지 않는다.
3. 기본 OFF에서 관리/감사/영속 API·write cutover 비공개와 익명 GET 정상 확인 → 내부 Preview 승인 flag ON에서 세션·Editor/Site·Admin 무Site 거부·DELETE 암호 AND·업무 Audit 원자성/오류 거부를 검증한다.
4. 실제 실행 HEAD/Run/Job·사내 evidence ID를 기록하고, 실패·취소는 FailureLedger에 원인/조치 보존한다. test 작성 또는 PR CI 시작을 PASS로 표기하지 않는다.

### S2. 승인 패키지·Owner 별도 Go/No-Go

1. G0~G6 기능/업무 QA·사내 두 PC E2E·동시 DB/CAD/S3 실 Restore·롤백 증거/미검증과 잔여 위험, 승인 담당자·유효 범위·유지보수 창 확인.
2. **실행 대상 불변 식별**: App/Migrator 두 digest + source commit + 정식 Schema/migration ID + rollback 호환 이미지 쌍 + 하나의 backup snapshot ID + 기존 Viewer/Current/Version/원본 SHA 검사 기준. 실제 IP/URL/Secret·객체 목록은 사내 비공개.
3. Owner가 사내 기록에 GO 또는 NO-GO, 승인 ID, 일시, 대상/범위, 조건, 중단 담당·복구 담당을 **명시**. 누락/구HEAD/불일치·무응답=NO-GO. 릴리스 변경 시 재서명, 문서 병합·PR/Main CI·GHCR publish는 자동 GO 불가.

### S3. 승인 후에만 통제된 운영 전환 (현재 금지)

1. 쓰기/업로드/배치 중지 및 확인→한 `snapshotId`로 SQLite 안전 backup(쓰기 중인 DB의 단순 파일 복사 금지), CAD(local) 원본 및 S3 object/version·SHA·크기 manifest 획득→실제 복원 리허설 결과 확인.
2. 승인된 **동일 app+migrator digest pair** 점검→승인된 정식 migrator 적용→Schema FK/Unique 및 Source bytes/SHA·Version/Current·삭제 hash 불변 점검. 불일치면 앱/쓰기 전환을 진행하지 않는다.
3. 후보 앱 `G7_AUTH_ENABLED=false`로 기동, Health/기존 익명 CAD GET·Viewer·다운로드 확인. 지정 운영자 Admin 최초 단발 생성/Secret 회수·복구 기록 점검.
4. `G7_AUTH_ENABLED=true` 운영 승인 범위에서 Auth/Session/Role/Site/Audit 정상 검증→독립된 `G7_CAD_WRITE_CUTOVER_ENABLED=true`로 POST/Current/Version DELETE 업무 권한 전환 후 실제 사용자/자동화·Audit 회귀 확인. 미승인 Outline/Memo/Type/Logs 영속 API와 Audit purge는 OFF.
5. Owner/QA/운영 담당이 적용 image/Schema/snapshot·업무 E2E·잔여 위험·수용 일시를 사내 기록으로 고정하고 승인된 범위에서만 쓰기 재개.

### S4. 실패 시 정지 및 롤백

- **즉시 NO-GO 트리거**: migration/FK/SHA/Current/Version mismatch, 앱·Schema 불일치, DB/Audit 실패, Auth 우회 또는 기존 익명 GET 회귀, 필수 Nginx/세션·CAD write 기능 실패.
- 즉시 모든 쓰기·작업 중지, Auth/write cutover OFF, 세션 폐기·Incident ID 기록. **기존 익명 write 경로로 fallback 금지**.
- 기존 이미지 하나만 새 Schema에 재기동하지 않는다. **구 호환 App+Migrator digest 쌍과 같은 snapshot ID의 DB/CAD(local)/S3를 함께 Restore**, FK/Current/Version/Source SHA·객체 checksum·Health/익명 GET 확인. 다운그레이드 migration 추측 실행 금지.
- Backup 시점 이후 신규 쓰기 손실 가능성을 사내 사고 기록에서 확인하고 유실 데이터 대조·재처리/Owner 승인 전 정상 운영 재개 금지. 복원 실패 시 #109/#96 BLOCKED 유지, 공개 FailureLedger에는 비밀 없는 사건·증거 ID만 기록한다.

## 5. 승인/수용 증거 템플릿 — G6 Owner 수용 / G7 GO PENDING

| 증거 | 필요한 승인·식별자 | 상태 |
| --- | --- | --- |
| G0~G5/PR CI | 범위, commit/Run/Job, 격리와 실 운영 구분 | 격리만 완료 |
| G6 LAN | Owner 수행·정상 보고 및 #108 CLOSED; 사내 PC 2대·PROD/DEV·권한 E2E 개별 근거 ID 대조 | OWNER ACCEPTED / 원본 증거 ID 미열람 |
| G6 실 Backup/Restore | Owner 정상 수용; 같은 snapshot ID의 DB+CAD+S3 Restore/rollback·불변 체크섬 원본 확인 | OWNER ACCEPTED / 원본 증거 ID 미열람 |
| 배포 Pair/Schema | App+Migrator 두 OCI digest·정식 migration·rollback pair | PENDING |
| 운영 SOP/감사 | Admin 작업자·대리자·Secret 경로, Audit 365일 purge/backup/예외 승인 또는 보류 | PENDING |
| Owner GO/NO-GO | 서명·승인 ID, 범위/기간·QA/위험수용·복원 및 사고 담당 | PENDING |
| 운영 후 수용 | 실제 권한/세션·원본/Version/Current·익명 GET 및 Audit 검증 | NOT RUN |

실 사내 IP/CIDR·Host·URL·비밀번호·Token·Secret 경로/객체 키·실 DXF/해시 목록·개인 정보/원시 로그는 공개 GitHub/CI/Artifacts에 게시하지 않는다. **실행하지 않은 항목은 PASS가 아니다.**

## 6. G7 AC / 후속 인계

- **G7-AC1** G0~G6·QA·사내 SOP/실복구 증거와 별도 Owner GO 범위를 정확히 확인.
- **G7-AC2** 기본 OFF·이중 게이트·별도 write cutover/미승인 API 비공개 및 운영 Auth/Prisma/Proxy 임의 변경 0.
- **G7-AC3** 일치하는 App+Migrator digest·동일 시점 DB/CAD/S3 실 Restore·현장 E2E/Version·Current·Source 불변.
- **G7-AC4** Owner 수용·작업/롤백 증거, 문제시 복구, 상위 #96 최종 판단.

[TestPlan](TestPlan.md)의 TC-P4-G7-001~015는 이 문서 작성 시 **NOT RUN**. **다음 단계**는 #108 Owner 현장 수용의 사내 증거 ID 대조 및 G7 통합 코드의 비운영 검증 → Owner 명시 GO → 승인된 G7 운영 전환/롤백 실증 → #109/#96 완료 판단이다. 이 Runbook의 PR 자체는 기능 구현 완료 또는 운영 배포 승인이 아니다.
