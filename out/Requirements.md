# 상세 요구사항

## FR-153-SCHEMA-HOLD — Backfill Schema와 서명된 pre-Snapshot 인계 (2026-10-29)

- FR-153-SCHEMA-01: 실제 기존 6 Migration 뒤 `backfillDeletePasswords`가 설치하는 `cad_version_delete_password_insert/update` 두 Trigger를 정규 Schema의 필수 요소로 포함한다. backfill·Migration reference·Runtime7 검사가 동일 SQL 정의를 공유하며 기존 Migration SQL/checksum 및 NULL/빈값 거부 의미를 바꾸지 않는다. 누락/동일 이름 약화/추가 객체/이력 손상을 거부한다.
- FR-153-HOLD-01: 완성 Snapshot 전 실패한 원본 HOLD bytes·reason·approvalId/SNAP/Epoch 및 과거 서명 승인을 보존한다. 만료/이전 릴리스 승인은 실행 권한이 아니다. 현재 독립 Trust+fresh signed MIGRATION 승인과 별도 유효한 Owner 인계 서명이 정확한 old HOLD/승인/Release→new 승인/Release를 묶어야 명시 재시도를 준비한다. unsigned 교체·HOLD 삭제·Snapshot 이름 바꾸기로 우회하지 않는다.
- FR-153-HOLD-02: 인계 전 실제 DB의 정확6 이력/checksum/전체 Schema/quick_check/FK, CAD SHA·크기/Version/Current 및 Site 범위를 확인한다. fresh 제한 Window의 Writer Zero 선언(앱/배치/Prisma/Local/S3)과 대상·현재 evidence를 인계 서명에 포함하고 재대조한다. DB exclusive lock만으로 외부 Writer Zero를 인증하지 않는다.
- FR-153-HOLD-02B: 모든 pre-Snapshot HOLD(FAILED/IN_PROGRESS)는 이전 승인이 아직 유효해도 직접 RESUME로 변경/해제하지 않고 fresh signed handover를 요구한다. 프로세스 강제 종료의 IN_PROGRESS도 인계를 거치며, 완성 Snapshot 동일 승인 RESUME는 별도 기존 계약으로 유지한다.
- FR-153-HOLD-03: 공유 실행 lock+DB exclusive transaction 아래 검증·immutable 원본 archive·원자 새 HOLD 연결을 수행한다. 실패는 old HOLD/data 보존, 성공도 이력 보존 및 Auth/CAD Write OFF다. replay/동시성/다른 identity/완성 old Snapshot/새 SNAP 충돌/7·부분 Schema/증거 손상은 거부한다. 새 HOLD 후 명시 RESUME가 새 Snapshot+7번째 Migration을 수행하며 모든 명시 RESUME 성공 후에는 recovery-complete HOLD를 유지해 기존 App 설정으로 자동 활성화하지 않는다.
- AC/범위: 실제6+backfill→7→정상 Runtime 검사와 만료+릴리스 변경+Snapshot 없음의 인계·음성·중단·동시성 회귀를 통과한다. 기존 Snapshot Restore/SIGKILL/익명 CAD 계약 보존. 운영 DB/CAD/S3/설정·병합/GHCR/Tag/배포 미실행, #153/#109/#96 OPEN. 단일 PR 최종 HEAD CI 한 번 시작, 결과 모니터링 생략.

## FR-G7-153 — 실제 운영 경로 통합 요구사항 (2026-10-29)

- FR-153-P2-SITE: 승인 Site의 업무 active 상태와 Runtime 신뢰 유효성을 분리한다. Admin의 정상 비활성화 후에도 로그인·관리·재활성화 및 다른 활성 승인 Site의 CAD 쓰기가 동작해야 한다. 비활성 Site 쓰기와 누락/미승인 Site는 계속 거부한다.
- FR-153-P2-LOCK: Migration/Restore 실행 프로세스 SIGKILL·재시작 후 문서화된 명시 복구가 lock 잔재 때문에 막히지 않아야 한다. 살아 있는 동시 실행은 계속 차단하며 HOLD·동일 Snapshot·서명/Scope/Schema/CAD/Audit 검증은 보존한다.

- FR-153-A: 기존 G2/G3 Auth/Session과 G4 Role/Site/Audit를 실제 별도 Runtime API와 로그인·운영 화면에 연결한다. 초기/복구 계정은 명시 CLI, 8h/30m/3개 Session, 만료·강제 회수·비활성화·초기 변경·HttpOnly/SameSite·Origin/CSRF·실패 제한을 보존한다.
- FR-153-B: 기존 CAD 익명 GET과 Viewer를 보존한다. Runtime CAD 등록/Current/DELETE는 현재 DB Session·Editor/Admin·명시 Site·Version 소속 및 별도 Write Scope를 검증하며 DELETE 암호도 유지한다. 기준정보·재분류 변경을 통한 Site 우회도 차단한다.
- FR-153-C: 변경과 안전한 UTC Actor/Action/Target/Revision/Request ID Audit를 같은 거래에 저장한다. 거부/실패도 기록하며, Audit 장애로 업무 변경이 남아서는 안 된다. Append-only·365일 보존·민감정보 미기록, 자동 purge 미노출을 유지한다.
- FR-153-D: 기존 CAD 6개와 격리 Auth 7번째 Migration의 이력/체크섬/Schema/FK를 검사한다. 합성·격리 Clone에서 실제 적용·중단/실패·재실행·동일 DB/Local CAD/versioned S3-export Snapshot Restore를 실행하고 이전 6개 Schema 호환성을 확인한다. 실제 OCI 이전 이미지 실행과 현장 전환은 별도 현장 선행조건이다.
- FR-153-E: 새 Runtime Gate는 기존 pure R0와 분리한다. 기본 OFF, 별도 로컬 Trust·Owner 서명·릴리스/Schema/Site Scope·24h 이내 유효기간·복구 HOLD를 검사하고 Auth와 CAD Write를 구분한다. 설정/검증 실패는 BLOCKED이며 Preview/Staging 권한을 운영으로 승격하지 않는다.
- 범위: #153 단일 구현 브랜치/PR과 최신 HEAD PR CI 시작. Owner Managed QA 적용, 신규 Issue·실 운영 변경·정식 게시·Tag·병합·배포 없음. DXF/DWG·원본 SHA/Version/Current·Outline/Memo 호환성 유지.

## FR-G7-S3-5R0 — Owner Managed 릴리스별 오프라인 승인 형식 검사 (2026-10-28)

- FR-R0-001: #142/#151 현장 Owner 수용 완료 보고는 공개에 `OWNER_ATTESTED_FIELD_ACCEPTANCE_COMPLETE`, 외부 독립 재검증 `NOT_EXTERNALLY_VERIFIED`; 실 증거·키·Digest/Hash/ID/경로·개인정보의 외부 반출 금지. 일반 수용이 릴리스별 운영 GO가 되지 않도록 구분한다.
- FR-R0-002: S3-5 릴리스별 `decision`, Scope/Schema/Source+Rollback Source, App/Migrator+Rollback 4개 distinct OCI digests/버전, SNAP/Epoch/CR, Owner 승인ID, Operator 및 다른 Rollback Operator, 승인/유효 UTC·24h 이내 window를 필수화. 매칭할 C0의 이전 서명/17 Receipt 및 별도로 신뢰된 현장 Release Identity·Scope를 요구한다.
- FR-R0-003: 외부 Packet의 Key 신뢰 금지. 현장 별도 승인된 Ed25519 Owner/QA Roots로 C0 영수증과 새로운 Owner Release-Specific Signature를 검증; Release·Scope·Window·Owner 서명 변조/미완료 C0/NO_GO/실제 운영 승인없는 경우 `BLOCKED/PENDING`.
- FR-R0-004: 합성 긍정도 `LOCAL_RELEASE_DECISION_CONSISTENT_NOT_ACTIVATED`, `operationalGo/authEligible/writeEligible/runtimeActivated=false` 등 운영 허가 Bool 불변. 결과는 고정 Reason/상태만, 민감 입력 Echo/로그 금지.
- NFR-R0-001: 순수 신규 모듈/합성 Unit/문서/오직 정확 미게시 15개 Path·Squash Title, CI + Owner Review 게이트. `src/prisma/**`, `preflight.ts`, 기존 API/Runtime Route, Dockerfile/Compose/Nginx/.env, 원본 증거, GHCR/운영 실행에 변경 0.
- FR-R0-005: 별도 #153 실제 S3-5 릴리스별 Owner GO·이미지/DB/보안 Rollback 검증 이전 운영 Auth/CAD Write·Prisma·배포 금지.

## FR-G7-S3-4C0 — Owner Managed 현장 비반출 영수증 Trust Binder 준비 (2026-10-28)

- FR-C0-001: 프로그램/합성 템플릿만 승인된 방법으로 현장 반입. 실제 OCI/SQLite/CAD/S3 증거·Registry/Source/해시·실 EV/QA/SNAP/CR·서명·Trust Anchors·신원/URL/Path/Secret은 GitHub/CI/채팅 반출 금지; 현장 Owner가 내부 보존·권한·폐기·검증을 관리한다.
- FR-C0-002: 기존 B2-5 `DISPOSABLE_EVIDENCE_RECONCILED_NOT_SITE_PROOF` 미신뢰 Packet 17개 체크가 완결되어야 하고, Check/EV 매칭 17개 영수증의 bytes(Uint8Array 1~65536 B)와 선언된 SHA-256을 직접 비교한다. Source/Schema/SNAP/Epoch/CR/OCI 4 역할 Digest 바인딩 변경, 원본 누락/중복/위조는 BLOCKED.
- FR-C0-003: 출처가 외부 입력에 포함되지 않은 별도 승인된 현장 Ed25519 Owner/QA 신뢰 공개키 2개로 Canonical 서명문을 검증. 잘못된 키·동일 키·누락·바꿔치기·기한/UTC/서명 변경/손상은 BLOCKED. 현장 시각은 사이트의 신뢰 가능한 시계를 호출자가 제공; Code 자체가 인가자·신뢰루트를 판별하거나 실제 인간 독립 QA를 입증하지 못하는 한계를 명시한다.
- FR-C0-004: 형식 미완료 `PENDING`, 결함 `BLOCKED`, 일치 `LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO`만 출력. 임의 원본 Bytes/사용자·EV/QA ID/Hash/Key/Signature/Path를 Reason이나 Response로 반사하지 않고 실제 Source/Registry/Restore/운영·Auth/CAD Write GO 플래그는 항상 false.
- NFR-C0-01: 순수 Unit·문서 및 Owner Managed CI 보완으로 기존 15개에 `src/tests/e2e/issues124-126-127.spec.ts` 1개를 더한 정확 GHCR 미게시 16개 Path 범위만 변경. `src/prisma/**`, 운영 API/Compose/Nginx/Dockerfile/기존 CAD 쓰기, 실제 Site Data/Registry 접근/GHCR Publish/Owner GO 전부 금지. S3-5 별도 릴리스별 Owner 승인 전 개발 코드 병합만으로 활성화 금지.
- FR-C0-005: 실제 B2 현장 QA/Writer/Snapshot/복구·Rollback 실증 및 현장 증거 승인 여부는 **별도 수행해야 하는 운영 AC**. 이 PR의 서명 테스트/합성 CI 성공으로 B2 실제 수용을 대체하지 않는다.

## #142 S3-4-B2-5 — 합성 증거 참조 검증 요구사항 (2026-10-28)

- 정확한 17 S3-4-A 체크의 PASS/FAIL/NOT_RUN/CANCELLED와 별도 untrusted Ledger의 EV/QA/SNAP/Source Epoch/Schema/4 OCI Digest/UTC 바인딩을 대조한다. 모든 이름·상태·식별자와 필드를 엄격 검사; 중복, 누락, 위조, 교환, 순서 오류, 비정상 Status, 비밀/경로 입력 시 BLOCKED. NOT_RUN은 PENDING, 성공도 DISPOSABLE_EVIDENCE_RECONCILED_NOT_SITE_PROOF만 반환한다.
- 어떤 결과에서도 실 QA·Registry·Snapshot·Migration·Restore/Rollback·Owner GO/runtimeActivated 플래그는 false. 실제 사내 출처 증명과 B2-5 현장 수용, S3-4-C/S3-5/운영 Auth 활성화는 완전히 별도이며 Owner 승인 필요.
- B2-5 개발 PR 변경은 Runbook 포함 승인된 15개 Path로만 제한, 활성 SQL/배포·이미지 게시 금지.

## #142 B2-4 — 격리 Restore/Rollback Byte Replay 요구사항 (2026-10-28)

- FR-G7-B2-4-01: 정확 Scope/SNAP/Epoch를 가진 합성 `source/candidate/rollback` SQLite·Local CAD·S3 Export·Marker의 Byte Buffer 검증, 객체 개수/DB Version·Locator/S3 claimed VersionId 일대일 일치, Local·S3 백엔드 모두 포함, 수정/누락/중복/초과 바이트 fail closed. 복귀 DB는 Source SQLite 바이트와 `Buffer.equals` 일치 필수, Candidate는 7번째 Auth 후보가 적용된 CAD 보존·Auth/Audit 불변식을 기존 B2-3 검증기로 확인.
- FR-G7-B2-4-02: 원본 App/Migrator 및 Rollback App/Migrator 4-role OCI locally digest-pinned manifest/config, Source/Version/Schema/Role/플랫폼 계약은 기존 B2-1 검사기로 비교. 태그만 있는 ref/역할 누락/잘못된 rollback schema/상반된 claim은 `OFFLINE_OCI_PAIR_BLOCKED`. Real Registry/Signer/실행/호환성 입증 `rollbackCompatible:false`.
- FR-G7-B2-4-03: 임의 파일경로·실 CAD·DB/S3/OCI I/O, Writer stop, 온라인 backup, 운영 Prisma Migration/Restore·Rollback/OCI Pull/Compose/Nginx/실 RTO/RPO 측정 불허. 동일 `SNAP-*`는 주장형으로만 취급하여 `sameSnapshotRestored:false`, `restoreExecuted:false`, `rollbackExecuted:false`, `operationalGo:false`. #142/#109/#96 OPEN/BLOCKED.
- NFR-G7-B2-4-01: 명시 15개 파일과 정확 `G7-S3-4B2-4-NO-GHCR` Squash 제목만 publish=false, 운영 Prisma/배포/서비스 변경은 예외 불허. 합성 테스트 완료 후 최신 PR HEAD Codex 리뷰/CI 게이트, Owner 별도 승인 전 병합·GHCR 금지.

## #142 B2-3 P2 — Audit 행 보존 강제 요구 (2026-10-28)

- FR-G7-B2-3-06: Audit append-only 검사에서 UPDATE/DELETE 예외가 각각 발생하는지뿐 아니라 전체 `AuditEvent` Row가 변경 전과 동일한지 **각 시도 직후** 확인한다. 이미 변경된 행/삭제된 행/다른 행 부수 변경이 있으면 `AUDIT_NOT_APPEND_ONLY/BLOCKED`, `auditAppendOnlyChecked=false`.
- FR-G7-B2-3-07: 같은 이름의 `AFTER UPDATE/DELETE + RAISE(FAIL)` 악성 Trigger를 각각 합성 후보 SQLite에 넣어 실제 변경이 남는 경우를 차단하는 음성 회귀 추가. 기존 정상 BEFORE/ABORT Audit append-only 양성 유지, 메모리 Clone 외 I/O/운영 Migration/Writer/GO 금지.

## #142 B2-3 P2 요구 — Local Locator 실 소속 확인 (2026-10-27)

- FR-G7-B2-3-04: `CadFileVersion`의 Local `storage_path` 첫 UUID는 해당 DB Row의 `location_id`, 두 번째 UUID는 `id`와 일치해야 한다. 두 합성 DB before/after와 CAD Asset Claim에 동일한 잘못된 Locator가 있을 때도 `LOCAL_LOCATOR_OWNER_INVALID/BLOCKED`. S3 저장 Object UUID는 DB Version UUID와 독립이므로 동일성 강제는 금지.
- FR-G7-B2-3-05: `exact(unknown)` 타입 가드에서 명시적으로 null을 제외하고 `Object.keys/hasOwn`를 호출하여 TypeScript Typecheck/Docker Build를 정상 처리. B2-3 스키마·운영 API·Migration/전환 기능 변경 없이 기존 15-path no-GHCR 범위만 사용.

## #142 B2-3 — 격리 7 Migration·검증·장애주입 요구 (2026-10-27)

- FR-G7-B2-3-01: 활성 CAD 6개 원본 Migration SQL과 quarantined 6개 SQL 복사본의 동일성·7번째 Auth 후보의 운영 경로 부재 확인, gated Prisma CLI 일회용 DB에 정확 7개 Migration/완료 History·8 Auth Table 검증.
- FR-G7-B2-3-02: 합성 CAD Local DXF/S3-export DWG 2개 Version/Current/nextVersion·SHA/Storage Path 및 CAD 기준정보 7 Tables의 6→7 SQL 전후 완전 보존, FK·Quick Check 0·8 Auth Tables와 Audit UPDATE/DELETE 차단 증명. `assessS34B23DisposableMigration` 상태 양성은 `DISPOSABLE_SEVEN_SCHEMA_INVARIANTS_ONLY` 및 모든 Site/운영 GO false.
- FR-G7-B2-3-03: FK 위반·Version/Current/SHA 변경·Local/S3 Byte 손상·후보 Auth Table/Trigger 누락·가짜 Audit Trigger·7번째 SQL Transaction 실패, 미승인 입력/경로는 BLOCKED. 실제 DB/CAD/S3/Writer·운영 Prisma·GHCR·Nginx/Compose/배포/Auth/CAD Write 기능 건드리지 않음.
- NFR-G7-B2-3-01: 정확 B2-3 no-GHCR Squash 제목과 15개 명시 파일 allowlist만 publish=false, 활성 migration·Dockerfile/Compose/운영 Route 및 비허용 파일/Workflow는 거부. #142/#109/#96 OPEN/BLOCKED와 현장 수용 보류.

## #142 B2-2B — S3 Locator Unique 보완 요구 (2026-10-27)

- FR-G7-B2-2B-06: 정상 도면의 S3 object UUID와 DB Version UUID는 다를 수 있지만 모든 합성 S3 객체 Locator는 `CadFileVersion.storagePath` Unique와 일치해야 한다. 서로 다른 Version binding이 동일 S3 locator를 재사용하면 Byte/hash/VersionId 주장 및 DB ID가 달라도 `DUPLICATE_S3_LOCATOR/BLOCKED`.
- FR-G7-B2-2B-07: SQLite 합성 복제본의 `uq_storage_path` Unique 인덱스가 없는 경우에도 코드 독립 검사로 재사용을 차단하고, 서로 다른 S3 Object Locator 2건의 정합성은 수용한다. 실 운영 Source VersionId 인증/Writer 정지/Owner GO는 포함하지 않는다.

## #142 PR #145 P2 보완 — S3 Object Locator 독립성 (2026-10-27)

- FR-G7-B2-2B-04: S3 파일의 객체 경로 UUID와 DB Version ID의 동일성을 강제하지 않는다. 별도 합성 Object mapping의 `s3ObjectLocator`(정규형 `s3:bucket:cad/<object_uuid>/original.ext`)를 DB `CadFileVersion.storage_path`와 정확히 대조하고 파일 형식을 검증한다. 두 UUID가 달라도 올바른 바이트/위치/버전과 경로 매핑이면 합성 단계의 일관성 통과.
- FR-G7-B2-2B-05: S3 locator 누락·형식 오염·잘못된 Bucket/Object UUID 또는 Local object에 S3 locator 포함 시 fail-closed. 반환값에 실제 Bucket/Path/ID를 포함하지 않으며, DB/영속 Migration/실 S3 접근·운영 인증/쓰기와 분리. 실제 현장 입증 없이 운영 수용/GO 불가.

## #142 S3-4-B2-2B — Disposable Bytes 사전 검증 요구 (2026-10-27)

- FR-G7-B2-2B-01: B2-2A에서 BLOCKED인 writer/Source Epoch/SNAP 패킷은 다음 단계에서 수용하지 않는다. 새 입력은 별도 공급한 합성 SQLite·Local CAD/S3 export/marker Buffer와 1:1 opaque L/V key ↔ disposable DB UUID mapping으로 제한하고 임의 파일 경로·site credential·S3 network 요청 금지.
- FR-G7-B2-2B-02: SQLite Buffer SHA·실 quick_check/FK·전체 Location/Version/Current/next_version/locator, Local/S3 Bytes SHA/length·Marker SNAP/Epoch/VersionId **주장** 사이의 불일치·누락/중복·추가 private binding·지원하지 않는 Auth Schema를 안전 reason code/`BLOCKED`로 처리. 반환값에는 데이터·원본 경로·객체 Key를 포함하지 않는다.
- FR-G7-B2-2B-03: 모든 긍정 결과를 `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF`로 제한하고 `writerQuiescenceVerified/sameSnapshotVerified/sourceObjectVersionsVerified/provenanceVerified/operationalGo/runtimeActivated=false` 고정. 실제 현장 Source 입증 및 Owner GO는 별도 CR과 독립 원본 검증 후에만 가능.
- NFR-G7-B2-2B-01: 별도 Main 기반 Branch/PR, B2-2B 정확 no-GHCR Squash 제목·15개 명시 허용경로만 publish=false; Dockerfile/active Prisma/Route/Compose/Nginx/다른 Workflow 경로 fail-closed. PR 최신 HEAD CI/리뷰 확인 전 병합·GHCR/Issue 종료 금지.

## #142 S3-4-B2-2A — Writer Barrier 패킷 일관성 검증 요구 (2026-10-27)

- FR-G7-B2-2A-01: 동일 `SNAP-*`/Source Epoch/승인된 형식의 `OP-*`·`CR-*`·`BAR-*`, 시작·종료 UTC 및 `activeWriters=0/writesDuringCapture=0` 주장 불일치/캡처기간 초과 BLOCKED.
- FR-G7-B2-2A-02: SQLite backup hash 주장, FK/Current/Audit 무결성 0, DB Version/Location nextVersion, Local CAD/S3 **버전 지정** 객체 Key/hash/byte-count의 1:1 일치와 S3 Snapshot marker version 필요. 중복/누락/역할 혼동/미승인 필드는 거부.
- FR-G7-B2-2A-03: 패킷 형식만 검증하며 실제 원본 Reader·중지 임대·Snapshot/SQL·S3 API verification은 수행하지 않는다. 모든 검증/GO 필드 false, 현장 실증 없는 GO/운영 Auth/Write 금지.

## #142 S3-4-B2-1 — OCI 증거 Bytes 기초 검증 요구 (2026-10-27)

- FR-G7-B2-1-001: OCI App/Migrator/rollback App/Migrator 4개 manifest+config Byte digest, 선택된 Linux/amd64 단일 manifest, source/version/schema/role label이 사전 기대 identity와 맞는지 확인.
- FR-G7-B2-1-002: `latest`/태그 전용·다른 Registry/Index 미해석·Config 변경·잘못된 Role·Rollback 동일 Source/Version·라벨 부재를 `BLOCKED` 처리.
- FR-G7-B2-1-003: 로컬 bytes content-match는 Registry provenance·서명·rollback 호환성/실복구/Owner GO를 의미하지 않으며 6개 `false` gate 필드 고정. 사내 원본·접속 정보 비반출.
- FR-G7-B2-1-004: 활동은 비운영 pure source/합성 tests/docs+GHCR exact allowlist에 제한. 활성 Migration, Dockerfile/Compose, 실 G7 Auth/CAD 운영 기능·실 DB/CAD/S3 무변경.

## Issue #138 — 이동 가능한 Viewer 조회·작업 보조 창 공통 요구 (2026-10-27)

| 요구 ID | 정책 / 검증 |
| --- | --- |
| FR-VIEWER-138-01 | 기존 #127 그룹 메뉴 및 좌/우/하단 Drawer 초깃값 유지. 데스크톱 Layer/Outline Tree/TEXT Search+결과/Outline 생성·편집 및 후속 Viewer Memo 보조 창을 **제목의 전용 drag handle**로 자유 이동. 창별 독립 floating position·z-order/닫기/기본위치 복원, 동일 세션 재열기 위치 유지. |
| FR-VIEWER-138-02 | 본문 검색·Tree 선택·텍스트 입력·Canvas Pan/Zoom/영역선택/GENERATED WCS 이동·메모 drag와 패널 drag 분리. ESC 최상위 1단계, PointerCancel·unmount 정리 및 키보드/포커스 접근성. |
| FR-VIEWER-138-03 | Shell CSS pixel 위치 clamp 및 resize·200%·CSS/native fullscreen 안전, 320/375px mobile은 #127 단일 modal Drawer. 창/메뉴/로딩/확인 z-index가 hit-test/포커스를 방해하지 않음. |
| NFR-VIEWER-138-01 | 열림/이동/닫힘/복원이 Canvas DOM·Manager/Adapter·CAD GET·Worker·GPU 재생성 및 Layer/Selection/Undo/Search 상태 변경을 일으키지 않음. Renderer/DWG 기존 capability/운영 Auth·DB/API·원본 불변. |
| PROC-VIEWER-138-01 | 향후 새로운 Viewer 조회/작업 창의 모든 이슈 본문과 AC에 공통 `ViewerPanelPolicy.md` 적용 여부·예외 사유·메뉴/초기 edge/모바일·Drag 충돌·ESC·수명주기·테스트를 명시. 확인 모달/독립 페이지/툴팁은 기본 예외. |

[ViewerPanelPolicy](ViewerPanelPolicy.md), [#138](https://github.com/planner77/layoutManager/issues/138), ADR-053-R1 참조. 기존 #26/#40/#43/#127 완료 범위에 증분 적용할 별도 작업이며 이 문서 갱신은 기능 완료를 뜻하지 않음.


## #109 S3-4-B1 격리 복원본 무결성 요구 (2026-10-27)

- FR-G7-S3-4B1-01: 일회용 `/tmp/cad-g7-s3-b-*`만, UID/0700/0600·Symlink/FIFO 차단 및 local/S3-export 경로 traversal 불허. 운영 DB/CAD/S3 접근 경로 없음.
- FR-G7-S3-4B1-02: readonly SQLite quick_check, FK 0, Current↔Version same owner, nextVersion, 실제 원본 bytes SHA/length; local+S3-export 두 종류 반드시 검증. Candidate Auth schema marker와 실제 table 경계 대조.
- FR-G7-S3-4B1-03: 실패시 BLOCKED, 성공도 ISOLATED_INTEGRITY_ONLY/NO-GO 고정. Snapshot ID는 원본 단일 시점의 독립 증명이 아니며 실 증거·OCI B2 단계로 이관.
- 새 운영 Migration/Compose/.env/GHCR 이미지 릴리스 변경 없음.


## #109 S3-4-A — 오프라인 증거 패킷 Requirements (2026-10-27)

- FR-G7-S3-4A-01: App/Migrator/rollback OCI digest 형식뿐 아니라 동종 version/source·후보 schema ID·commit과의 모순을 fail-closed; `latest`는 digest가 아니다.
- FR-G7-S3-4A-02: 17개 검증 결과 Status(FAIL/CANCELLED/NOT_RUN/PASS)와 사내 `EV/QA` 식별자 및 UTC 테스트 시간; DB/CAD/S3 복원 관련 체크는 같은 `SNAP`를 필수로 확인. 빈값·불일치·unknown field 거부.
- FR-G7-S3-4A-03: 입력 원본은 repo 밖 UID 소유 0600 절대경로, 결과는 상태·카운트·사유 코드만. 원문 도면/사내 로그/주소/Secret 반출 없음.
- FR-G7-S3-4A-04: 완성된 패킷도 Owner GO가 아니며 `operationalGo=false`/`runtimeActivated=false` 고정. 실제 Registry/복구 실증은 B/C, 현장 활성화는 S3-5.
- 운영 Migration·Auth/Write/Compose·Nginx/실 DB·CAD·S3·GHCR 이미지 신규 게시 0.


## Issue #109 S3-3 — CAD API 권한·Audit 원자성 준비, 운영 OFF (2026-10-27)

- **기능:** 기존 CAD Multipart POST·Current PUT·Version DELETE에서 서버 DB의 최신 Session/Role/Site를 같은 Prisma Transaction 안에 재조회하고 승인된 Editor/Admin+Site만 쓰기 허용한다. DELETE는 기존 삭제 비밀번호도 요구하며, CAD DB 변경과 CAD_UPLOADED/CAD_CURRENT_CHANGED/CAD_VERSION_DELETED Audit INSERT 중 하나라도 실패하면 DB를 롤백한다. 기존 업로드 보상·삭제 Job, 익명 GET/Viewer·CAD 데이터 규약은 유지한다.
- **운영 차단:** `NODE_ENV=production`에서는 S3-3 프리뷰 활성화 불가. 정확한 S3-2 disposable DB/marker/7 migration, loopback origin, `G7_S3_AUTH_API_PREVIEW_ONLY=true`, `G7_S3_CAD_PREVIEW_ONLY=true`, `G7_AUTH_ENABLED=false`, `G7_CAD_WRITE_CUTOVER_ENABLED=false` 조건만 격리 시험 허용. 별도 Prisma Client와 0700 root 하위 로컬 CAD 저장소 이용. 운영 Migration·실 DB/CAD/S3·Compose/Nginx/.env·GHCR 게시·인증/쓰기 활성화 없음.
- **시험·잔여:** synthetic integration(Unit) 검증 코드 추가; 실제 PR CI는 시작 전이므로 결과 `NOT RUN`. 일회용 Preview Cookie의 Path는 `/api/g7-operational`이므로 다른 CAD 경로의 프로그램 시험에서는 테스트용 Cookie를 명시적으로 넘기며 운영 브라우저 인증이 활성된 상태는 아님. S3-4는 OCI/운영 Migration/실복구·신뢰 release binding, S3-5는 릴리스별 Owner GO 및 현장 수용. 기존 유사범위 PR #128은 미병합·충돌 상태이며 자동 병합하지 않는다. #109/#96 OPEN/BLOCKED.
- **후속 정확 Squash:** `#109 | S3-3 Isolated CAD write and Audit [G7-S3-3-NO-GHCR]` 및 개별 파일 allowlist만 GHCR 미게시. 내부 로그/비밀번호/IP/실 도면 반출 금지. [S3-3 Runbook](../src/deploy/g7-s3/S3-3.md).


## #109 S3-2 운영 Auth/Admin 예약 API 요구 추적 (2026-10-26)

| ID | 계약 | 검증 |
| --- | --- | --- |
| FR-P4-G7-S3-2-01 | G3 Login/InitialChange/Session/Change/Logout API 및 독립 `cad_g7_s3_session` Cookie Path, 원래 `cad_session` 거부 | G7-S3-2-001/002 |
| FR-P4-G7-S3-2-02 | G4 Role/Site/SpecialGrant grant/revoke/disable, 현재 Session/DB 권한·CSRF·Audit 및 제한적 감사 조회 | G7-S3-2-003~005 |
| FR-P4-G7-S3-2-03 | 명시적 Admin Bootstrap/Recovery CLI에서 비밀번호 Secret/nonce/Session 회수+감사 원자성, 운영 startup 미호출 | G7-S3-2-006 |
| FR-P4-G7-S3-2-04 | G4 Admin users:manage+Audit 선행 인가, 비밀번호 KDF 후 원자적 계정 생성+ACCOUNT_CREATED Audit; 새 계정 Role 0/mustChangePassword=true | G7-S3-2-007 |
| FR-P4-G7-S3-2-05 | Live Operating DB 대신 G7-S3 disposable Prisma + UID/root/marker/URL/Schema/FK 검증, 데이터 오염 시 503 | G7-S3-2-008 |
| NFR-P4-G7-S3-2-01 | 프로덕션 `NODE_ENV=production`에서는 env와 관계없이 404, nonproduction에서도 127.0.0.1·추가 test flag·Auth/Write OFF, 기존 CAD URL 무변경 | G7-S3-2-009 |
| NFR-P4-G7-S3-2-02 | S3-4 실제 Release/Operation 승인 전 프로덕션 Route Auth/API/정식 Migration/Compose/Nginx/GHCR·실 DB/CAD/S3 변경/ON 없음 | S3 Runbook/PR scope |
| NFR-P4-G7-S3-2-03 | 정확 Squash `#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]`·23개 파일 허용 시만 GHCR skip, 그 외 fail-closed | G7-S3-2-CI-001~004 |


## Issue #57 — L1 구조화 로깅 요구 및 근거 (2026-10-27)

| ID | 기준 | 테스트 |
| --- | --- | --- |
| FR-57-01 | 기존 writeLog 단일 emitter, 업로드 stage/첫 실패/requestId/공개 JSON·HTTP header 보존 | TC-OBS-001~007, TC-LOG-004 |
| FR-57-02 | Schema v1/안전 확장 field allowlist, LOG_LEVEL/FORMAT·warn/error 동일 라우팅 | TC-L1-001/002/003 |
| FR-57-03 | 임의 Error/stack·CRLF·Secret·path/Locator/CAD bytes stdout/stderr 미노출 | TC-LOG-003/005, TC-L1-002 |
| FR-57-04 | Health 200 debug-only/503 error, app·framework·CLI 출처 명확히 구분 | TC-L1-004, Issue57 inventory |
| FR-57-05 | 기존 업무 API/DB/Viewer/Prisma/G7 Auth 불변, 영속 로그/조회 권한 후속 분리 | 기존 Unit/Integration/E2E, diff |


## Issues #124/#126/#127 요구 (2026-10-26)

FR-124-01 홈 전용 sticky+compact 및 기존 Current/검색/anchor 보존, FR-126-01 DXF Three 기본/explicit/DWG 호환, FR-126-02 source 실패와 분리한 단발 renderer fallback·수동 탈출·자원/임시작업 보호, FR-127-01 두 정보+접근 가능한 설명/그룹 명령, FR-127-02 상태 독립 overlay Drawer/ESC/focus/Canvas 보존. 세부 요구와 원격 AC 전체의 추적은 [Issues124-126-127](Issues124-126-127.md) 기준. G7·운영 DB/API·원본 불변.


## Issue #109 S3-1 — 운영 인증 Schema·정식 Migration Candidate·이중 Gate 요구 (2026-10-26)

| ID | 요구사항 | 검증 |
| --- | --- | --- |
| FR-P4-G7-S3-1-01 | 운영 Prisma Schema에 G1~G4 8개 모델/정확한 CAD FK·Index, 기존 CAD 모델/원본·Version·Current·SHA/삭제 hash 변경 없음 | G7-S3-001/003 |
| FR-P4-G7-S3-1-02 | CAD 6개 원본 Migration과 바이트 동일한 이력 + 신규 additive S3 `202610260002_g7_operational_auth` 정식 SQL 후보. 기존 자동 운영 Migrator 이력에는 추가 금지 | G7-S3-001/002 |
| FR-P4-G7-S3-1-03 | Prisma CLI는 테스트 전용 canonical/UID 소유 `/tmp` fixture·DB/marker/두 URL·명시 Test Flag·Auth OFF를 만족하지 않으면 SQL 이전 fail-closed | G7-S3-002/004 |
| FR-P4-G7-S3-1-04 | App/Migrator 동일 버전+Source SHA·immutable digest pair·Capability·Schema ID·registry/DB/FK/rollback 증거 불충족 시 Release Gate 거부 | G7-S3-005/006 |
| FR-P4-G7-S3-1-05 | 릴리스별 Owner GO ID·scope·기간·변경 ID·snapshot/rollback pair 불일치, Auth OFF/Write만 ON일 때 Operation/Write Gate 거부 | G7-S3-007/008 |
| NFR-P4-G7-S3-1-01 | S3-1 런타임 기능 ON/영속 API/기존 CAD API 변경 없음, `runtimeActivated=false`, OCI/운영 DB/CAD/S3·GHCR·Compose/Nginx/.env 미변경 | Diff/Unit |
| NFR-P4-G7-S3-1-02 | 정확한 S3-1 Squash 제목 `#109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]` 및 허용 파일만 GHCR 제외, 예상 외 경로·유사 제목 fail-closed | G7-S3-CI-001~003 |



## Issue #109 G7 S2 — 증거 준비 GHCR 비게시 요구 (2026-10-26)

| ID | 요구 및 검증 기준 | Test |
| --- | --- | --- |
| FR-P4-G7-S2-CI-01 | 정확한 `#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]` Squash 첫 줄+S2 지정 파일 목록+Main 브랜치 push만 `publish=false`; 다중 줄 본문 허용 | G7-S2-CI-001 |
| FR-P4-G7-S2-CI-02 | 운영 CAD/Prisma/Compose, S1 전용 파일, 임의 소스/Workflow가 하나라도 포함되면 `stderr` 오류와 nonzero 종료·GHCR 게시 방지 | G7-S2-CI-002 |
| FR-P4-G7-S2-CI-03 | 접미 텍스트·오타·공백 변형의 유사 제목이 S2 GHCR 미게시 예외를 통과할 수 없음 | G7-S2-CI-003 |
| NFR-P4-G7-S2-CI-01 | S1 예외 무회귀 및 다른 일반 runtime/tag 릴리스 정책 보존, 신 HEAD CI 검증 전 병합 금지 | G7-S2-CI-004~005 |
| NFR-P4-G7-S2-CI-02 | 내부 원본 증거 비반출, 오프라인 검사 `operationalGo:false`, 실 운영/Auth/Prisma/Compose/Nginx/GHCR 변경 및 이슈 종료 없음 | S2 Runbook |


## Issue #109 G7 S1 — PR #125 P1 재발방지 추가 요구 (2026-10-26)

| ID | 추가 필수 조건 | 증거 |
| --- | --- | --- |
| FR-P4-G7-S1-06 | Main GHCR skip은 승인 Squash `첫 줄 완전 일치` + Stage/docs allowlist 충족만, suffix/오타는 fail-closed, 거부 결과 stderr 명시 | TC-P4-G7-CI-001~002 |
| FR-P4-G7-S1-07 | 명시 Stage Prisma CLI config는 디렉터리 realpath·UID·symlink, DB명·동일 URL/스토리지·manifest Schema·Stage 승인 검증 전후 **SQL 무실행**, 운영 파일 불변 | TC-P4-G7-DB-001 |
| NFR-P4-G7-S1-02 | 수정 HEAD PR CI 이전 PASS 소급 금지·실 운영 API/Prisma/Compose·GHCR 및 Owner GO 분리 | CI 실패 원장/Issue109 |


## Issue #109 G7 S1 — Staging 구현 요구/검증 (2026-10-26)

| ID | S1 구현 조건 | TC | 경계 |
| --- | --- | --- | --- |
| FR-P4-G7-S1-01 | Staging capability/운영 승인 ID·고정 digest/schema manifest·기본 OFF G7_AUTH_ENABLED, 별도 CAD_WRITE_CUTOVER gate·Linux tmp 경로 안전 검사 | TC-P4-G7-001~003,013~014 | 운영 route 불변 |
| FR-P4-G7-S1-02 | G1~G4 세션·로그인/암호·Admin 단발 CLI, 8h/30m/3개 제한·revoke·Role/Site/Version/Grant/Audit 원자성 | TC-P4-G7-007~008 | Staging API만 |
| FR-P4-G7-S1-03 | Staging 분리 DXF JSON/base64 Upload/Current/DELETE Editor+Site(삭제 기존 암호 AND); 서버 권위 Permission+DB 변경+Audit 단일 거래; GET 익명 | TC-P4-G7-004~006 | 기존 multipart API 교체 아님 |
| FR-P4-G7-S1-04 | 독립 공식 Prisma Schema/Migration(CAD 6개+G7 1개)·FK/Unique, 같은 스냅샷 복구 E2E | TC-P4-G7-009~011 | 운영 migrator 불변 |
| NFR-P4-G7-S1-01 | S1 테스트는 disposable DB/CAD만, #108 실 PC·S3 수용과 Owner GO별도; 신규 영속 API/Audit purge OFF | TC-P4-G7-012~015 | 운영 GO PENDING |

[Issue109](Issue109.md), ADR-051-G7-S1. Staging 실행/CI 결과가 확인되기 전 PASS로 기록하지 않는다.


## Issue #109 G7 — 기본 OFF·승인·실복구 요구 추적 (2026-10-26)

| ID | 목표 계약 | TestPlan TC | 현 단계 |
| --- | --- | --- | --- |
| FR-P4-G7-01 | 검증된 G7-capable App/Migrator digest·정식 Schema+Owner GO·`G7_AUTH_ENABLED` 기본 false 이중 게이트, 불일치 fail-closed | G7-001~003,013 | 문서 설계 |
| FR-P4-G7-02 | 기존 익명 CAD GET 유지, `G7_CAD_WRITE_CUTOVER_ENABLED` 기본 false; POST/Current Editor+Site, DELETE Editor+Site+기존 비밀번호 AND 및 Audit 원자성 | G7-004~006 | 미구현 |
| FR-P4-G7-03 | 단발 Admin/Session 8h/30m/3개·revoke/Role·Site·Version·Audit 365일/별도 grants | G7-007~008 | 격리 구현·운영 미연결 |
| FR-P4-G7-04 | 동일 snapshot DB/CAD/S3 안전 backup·정식 migration dry-run·실 Restore/rollback, 원본·Current·Version 불변/호환 App pair | G7-009~011 | #108 Owner 수용 / 개별 원본 증거 ID 검토 필요 |
| FR-P4-G7-05 | 사내 두 PC PROD Nginx/DEV direct E2E와 G0~G6 HEAD/Run/사내 증거·Owner 별도 Go/No-Go | G7-012~013 | 승인 대기 |
| NFR-P4-G7-01 | #98/#83/#65/#60 신규 API 및 Audit 물리 purge 별도 승인 전 OFF; docs-only PR 운영 변경 0 | G7-014~015 | 준비 중 |

G7 설계 flag는 현재 실 운영 env/코드에서 작동하지 않는다. 상세 [Issue109](Issue109.md), [ADR-051-G7-PLAN](Decisions.md).


## Issue #108 / G6 — 현장 실증과 운영 승인 분리 (2026-10-26)

| ID | 요구사항 | 수용 구분 |
| --- | --- | --- |
| P4-G6-R01 | G0~G5 정상 User/Session/Role/Site/Version/Audit, 익명 기존 GET, 향후 POST/Current Editor+Site/DELETE 추가 삭제 암호 AND | 기존 G1~G4 격리 시험 ≠ 실제 보호 Route E2E |
| P4-G6-R02 | 사내 PROD Nginx 실 접속 PC 2대, Viewer·업무 호환 및 DEV direct 별도 DB/CAD, 비의도 Backend port 비노출 | G5 Preview ≠ 현장 EV 증거 |
| P4-G6-R03 | 공통 snapshotId SQLite online backup/local CAD/**실 S3 bytes** → 격리 Prisma migration FK/Current/Version/SHA → 실 restore/이전 App+Migrator+DB rollback | mock S3 Integration ≠ 실 S3 Restore |
| P4-G6-R04 | PASS/FAIL/CANCELLED/NOT_RUN, 각 Run/Job/HEAD 및 사내 EV ID와 운영자/QA/Owner 판정; 불투명 코드만 공개 | offline verifier는 자체 기입 형식 검사만 |
| P4-G6-R05 | 운영 Auth/Admin/API/Prisma/Compose/Nginx/.env, 실 CAD/S3, Audit purge OFF | #109 별도 Owner Go/No-Go 필요 |

[Issue108](Issue108.md), [TC-P4-G6-001~007](TestPlan.md), [TestReport](TestReport.md). OWNER_ACCEPTED_SCOPE는 기능/복구 요건을 해제하지 않는다.


## Issue #106 G4 — 인가·Grant·Audit 요구사항 (2026-10-26)

| ID | 업무 계약 | TC |
| --- | --- | --- |
| P4-G4-R01 | 기존 익명 CAD GET 보존; POST/Current Editor+담당 Site, DELETE 추가 기존 비밀번호 AND | 001,008 |
| P4-G4-R02 | 현재 G3 Session/계정/Role/Site/SpecialGrant/Version→Site를 같은 트랜잭션에서 확인, 401/403 및 Grant 회수 즉시 효력 | 001~004,007 |
| P4-G4-R03 | Admin만 Grant/계정 disable, DB FK/Unique/직렬화 및 마지막 Admin 보호 | 002,004,006~007 |
| P4-G4-R04 | 권한 성공·거부/Grant/Create/Edit/Delete Audit safe fields, Revision CAS, 실패 시 rollback/append-only | 002,005~009 |
| P4-G4-R05 | audit:read와 logs:read는 서로 다른 Admin SpecialGrant; 신규 영속 API 익명 불가 | 003,008 |
| P4-G4-R06 | 365일 cutoff·파기 미승인, 운영 Auth/API/Prisma/Compose·실 CAD OFF, #109 G7 승인 전 차단 | 005,009 |

[Issue106](Issue106.md) 기준. 격리 TC 작성/PR CI 시작을 실제 운영 승인·실 LAN 검증 PASS로 기록 금지.


## Issue #105 G3 — 격리 세션 요구 (2026-10-26)

[P4-G3-R01~06 요구·AC·TC](Issue105.md)를 이번 Unit 기준으로 추가한다. 유효 credential 로그인/초기 암호 변경·logout, 32 byte token/hash 저장, 절대 8h·idle 30m·원자 최대 3개, disable/password/recovery 회수, 서버 DB Actor와 정상 HTTP cookie/Origin/CSRF 계약을 구현한다. 초기 변경 계정에는 일반 세션을 발급하지 않고 credential 재입력 변경 후 새 로그인을 요구한다. 상세 응답 401/403/409/429 및 거래 경계는 Issue105가 기준이다.

#102 Owner R1에 따라 추가 공격·탈취 강화는 비범위이며 기존 정상 guard는 유지한다. 기존 공개 CAD GET 익명, 미래 POST/Current Editor/Admin+Site 및 DELETE 추가 기존 비밀번호 AND 계약을 보존한다. G3는 비운영 서비스/fixture 검증만이며 Auth Route·운영 Prisma/Compose/DB·CAD 기능은 G7 전 OFF. 실제 구현/시험 상태는 TestReport를 따른다.

## Issue #104 G2 — 관리자 단발 생성/복구 요구사항 (2026-10-26)

| 요구 ID | 기능·업무 기준 | 구현 및 Test |
| --- | --- | --- |
| P4-G2-R01 | 최초/복구 .env Flag 기본 OFF·동시 ON 거부/명시 실행만, 실패 기본 거부 | `bootstrap.ts`/`admin-setup.ts`; TC-P4-G2-001~002 |
| P4-G2-R02 | 실행 UID 0400/0600 regular 절대 Secret, symlink/invalid bytes 거부, 최소 8자+scrypt/원문 로그 0 | `password.ts`/`admin-setup.ts`; TC-P4-G2-003~004 |
| P4-G2-R03 | 미초기화 DB 최초 Admin UUID/Role/Audit 원자 생성, 동시 실행 1회·재시작/기존 User 비승격 | `auth-g2/store.ts`; TC-P4-G2-004~006,009 |
| P4-G2-R04 | 기존 ACTIVE Admin nonce 1회·세션 전량 폐기/비밀번호·Audit 원자성, 실패 rollback | G1/G2 adapter; TC-P4-G2-007~008 |
| P4-G2-R05 | 지정 사내 운영자 실행·Owner 책임·실 명칭/Secret SOP 비공개, 실 운영 Auth/API/Prisma G7 전 OFF | `auth-g2-isolated.ts`/문서; AC4/PR diff |

공격·탈취 대응 강화는 Owner #102 범위 밖이나 Secret 비로그·기능 원자성 유지. 기존 CAD GET은 익명 유지; G3 #105, G4 #106, G6 #108, G7 #109 후속. [Issue104](Issue104.md).

## Issue #102 G0 — 6개 Owner 업무 정책 승인 / 요구 추적 (2026-10-25)

**최신 승인 우선:** 아래 과거 `FR-P4-G0-R1-04`의 Reader 익명 조회 금지·삭제 Admin-only 등 **권장/미확정 값은 이 요구표로 대체**한다. [Issue102](Issue102.md), ADR-051-R1.

| 요구 ID | 승인 범위 및 수용 기준 | 후속 확인 |
| --- | --- | --- |
| FR-P4-G0-BIZ-01 | 공개망 인바운드 제한 사내 LAN의 **기존 공개 CAD 목록·검색/위치·Version·Current·Viewer·DXF/DWG 다운로드는 익명 조회**. 로그인·Reader·SiteGrant 없이 작동, 익명 User/Actor를 위장하지 않음. 신규 영속 메모·외곽선·타입, 감사·로그·관리 GET는 예외 | Owner 승인 / G5·G6 정상 GET E2E |
| FR-P4-G0-BIZ-02 | `PUT /api/cad-locations/:id/current`: **로그인된 Editor/Admin + 담당 Site/Version**. Admin 무범위 자동 전체 접근 불가, 동일 Location Current 0~1개 유지 | Owner 승인 / G4·G6 |
| FR-P4-G0-BIZ-03 | `DELETE /api/cad-files/:versionId`: **로그인된 Editor/Admin + 담당 Site/Version + 기존 삭제 비밀번호** 세 조건 모두 만족. Actor/Revision 감사 및 Current/원본 무결성, 비밀번호 단독 인가 금지 | Owner 승인 / G4·G6 |
| FR-P4-G0-BIZ-04 | 최초 Admin 생성·단발 복구 **실행 = 지정 사내 운영 담당자, 운영 책임 = Owner**. 재시작 자동 재설정 금지 | Owner 승인 / 실제 담당·Secret SOP는 G2 |
| FR-P4-G0-BIZ-05 | **Audit 365일 이내 보존, 이후 만료 기록 정리**. 정리 실행/주기/방법·Backup/Restore/예외 세칙 승인 전에 물리·자동 파기 금지 | Owner 원칙 승인 / SOP G4·G6·G7 |
| FR-P4-G0-BIZ-06 | **Owner 승인:** `POST /api/cad-files`는 로그인 Editor 이상+담당 Site, 익명 CAD GET와 달리 등록 Actor/Site 검증·Audit 필요, 현재 운영 Route 미변경 | #106/#108 기능 시험 · #109 Go/No-Go |
| NFR-P4-G0-BIZ-01 | G0 PR은 Markdown-only, 실 Auth/관리/영속 API/Prisma/DDL/Nginx/Compose/.env/운영 DB·CAD·S3 변화 0. G7 별도 Go/No-Go 전 운영 OFF | G0 정적 diff / G7 |

공개 CAD GET는 누구나 볼 수 있으므로 **Site/Version 읽기 기밀성을 제공하지 않는다**. Role+SiteGrant는 승인된 쓰기 및 별도 보호 리소스에만 필수. HTTP 공격/탈취 대응 비범위 결정은 그대로다. 업무용 Reader Role을 없애거나 임의 관리자/로그 API 익명 공개를 뜻하지 않는다.


## Issue #107 G5 — 요구사항별 최종 구현 상태 (2026-10-26)

- FR-P4-G5-01/02: 독립 PROD Nginx→App 및 DEV 직접 연결용 Preview Compose·데이터 분리 구현, [PR CI #40224438075](https://github.com/planner77/layoutManager/actions/runs/40224438075) 두 Job success. 구현 완료/현장 접속 실측 미수행.
- NFR-P4-G5-01: 실제 Version Viewer 경로 ` /cad/versions/ID/viewer `·목록·Health/정적 리소스·원본 GET 정상 경로 검증 도구와 Unit 성공. 실제 사내 업로드·다운로드·Cookie 및 사용자 PC E2E는 #108로 인계(`NOT RUN`).
- NFR-P4-G5-02: Owner R1에 따라 침투·탈취 방어 강화는 비범위; 운영 Nginx/Compose/인증 API/Prisma는 별도 #109 승인 전 미활성.
- 본 섹션이 아래 2026-10-25 작성 당시의 `PR CI 미확인` 상태보다 최신 증거다. 새 기능 요구는 발견되지 않아 재구현하지 않는다.


## Issue #103 / G1 P1 감사 추적 상세화 (2026-10-26)

- **REQ-G1-AUD-01:** Site 권한 부여/회수 Audit 이벤트는 행위 관리자(actor), 영향받은 사용자(affectedUser), 대상 Site 및 action/requestId를 **서버 DB FK 기준으로 분리 보존**한다. Revocation 뒤 Grant 행이 삭제되어도 두 사용자의 동일 Site 변경 이력을 혼동하지 않을 것. Fixture `AuditEvent`의 Site action은 affectedUser/site NOT NULL 검사, Actor·Site·User FK/변경 불가 Trigger 유지; `TC-P4-G1-005`.
- **REQ-G1-QA-01:** 최초 CI에서 `store.ts:134 TS1002`로 실패한 Typecheck·Docker baseline TypeScript를 새 HEAD에서 재검증한다. 이전 SKIPPED 단계를 PASS로 대체하지 않는다. 운영 DB/API/migration G7 전 OFF.



## Issue #103 / P4-D1 G1 — 격리 영속 DB 요구/추적 (2026-10-25)

- **REQ-G1-01:** User(id 불변/loginName unique/passwordHash/status/mustChange), Session(tokenHash/8h/30m/3개), Role/Site/SpecialGrant(audit:read/logs:read 분리), Audit(append-only/365일 정책), RecoveryNonce(hash 1회) 제약/FK; TC-P4-G1-001/002/003/008.
- **REQ-G1-02:** `BEGIN IMMEDIATE` writer serial, 세션 4번째 발급·시간 역행·만료 touch·중복 nonce 실패, 관리자 전용 Role/Site/SpecialGrant+Audit/비활성·회수·복구 원자 rollback; TC-P4-G1-003/004/005/007/008.
- **REQ-G1-03:** 기존 CadSite 실 FK와 Version→CadLocation→Building→Site 관계 조회, Admin Site 자동 허용 없음, 원본 bytes/SHA/Current/delete password/5단계 CAD 불변; TC-P4-G1-001/006/009.
- **REQ-G1-04:** **격리 Fixture SQL/Prisma 설계만** 적용. 운영 Prisma/schema/migrations/API/Runtime/Compose/GHCR 변경 금지. 실제 사내 DB/CAD/S3 일관 백업·복구 및 Owner G7 운영 승인은 별도; TC-P4-G1-001/009 및 정적 Diff·PR CI.
- 선행 정책: #102 ADR-051-R1. 2026-10-25 #102 Owner 5개 승인: 기존 CAD 목록/Viewer/다운로드 익명 GET 유지, Current=Editor/Admin+담당 Site, Version 삭제=Editor/Admin+담당 Site+기존 삭제 비밀번호, 최초 Admin/복구=지정 사내 운영 담당자(Owner 책임), Audit 365일 경과 이력 정리 원칙. 관련 문서 PR #114는 병합·CI 완료 미확인. POST 업로드 권한, Secret/실 담당자, Audit 물리 정리·백업 복원 세칙, 실제 배포는 PENDING; #103 G1 운영 활성화 승인 아님. 상세 [Issue103](Issue103.md).


## Issue #107 / G5 — 내부망 간소 PROD/DEV 정상 연결 (2026-10-25)

| ID | 요구사항 | 수용 상태 |
| --- | --- | --- |
| FR-P4-G5-01 | 격리 PROD Nginx 경유 Viewer·API·Health, App 직접 host publish 없는 Preview; 실제 운영 구성 변경 없음 | 구현 코드 작성, PR CI/현장 미확인 |
| FR-P4-G5-02 | DEV App direct Preview·PROD/DEV DB/CAD 볼륨·네트워크 독립 | 구현 코드 작성, PR CI/현장 미확인 |
| NFR-P4-G5-01 | 기존 Origin 정상 업로드/조회·원본 다운로드, 향후 G3 Cookie 정상 전달; 운영 API/Prisma/인증 미활성 유지 | 정상 경로 수동/후속 G3·G6 실증 필요 |
| NFR-P4-G5-02 | 내부 소수 사용자·외부망 인바운드 제한: 공격/탈취·침투 대응은 비범위(Owner R1). 운영 실제 적용은 G7 별도 승인 | OWNER_ACCEPTED_SCOPE, 운영 미승인 |

- 문서/구현·AC/TC 매핑: [Issue107](Issue107.md), [Architecture](Architecture.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md). PR CI는 실제 사내 PC 2대·Host/WSL2 Port·업로드/Cookie를 대신하지 않는다.


### #82 M1과 #99 Main 동시 요구 보존 (2026-10-25)

- #82 Memo ADR-053은 Source Handle 0에도 자유 WCS 메모 생성 UI를 허용하면서 기존 Outline 도구를 fail-closed 유지한다. #99 ADR-052의 비공개 CAD/GPU P0/P5 Owner 판정·이행 게이트는 그대로, M1 공개 합성 E2E가 실도면 수용을 대체하지 않는다.
- #99 신규 `verify:outline-acceptance` 실행 명령/검증 코드는 통합하고 app/lock root를 0.41.0 유지. #83 영속 Memo Auth/DB/API는 운영 게이트 미승인으로 비활성.


### Issue #82 M1 요구 보완 — Stable Handle 없는 도면에서도 자유 WCS 메모 활성화

- FR-M1-01/05 세부 계약: 도면 Renderer가 DXF three-dxf-viewer ready이고 Version/SHA 식별자가 유효하면 메모는 **Source 선택 가능한 Entity 수 0/안정 Handle 0에도** 자유 WCS XY 배치 가능. 기존 U3/U5 Source/Generated Selection Tool과 Outline 생성은 별도 RenderCoverage·Handle gate에 의해 계속 차단된다.
- 공유 `viewer-tools-dock`의 존재 자체를 선택/외곽선 생성 활성화 판단으로 취급하지 않는다. `cad-object-selection-tools`/Outline panel/버튼 enabled 여부와 `cad-memo-status`를 독립 검사하고, 비지원 Renderer에서 Memo와 도크를 차단한다. TC-U1-E2E-001/002·TC-M1-E2E-006.
- 실제 업무/운영 메모 서버 저장·작성자·RBAC/감사/Prisma는 미변경(#83). Run 40198344153 기존 HEAD E2E 실패 이후 **요구/테스트만 보완**, 기능 런타임 확장 없음.


## Issue #102 G0 / ADR-051-R1 — Owner 경량 보안 범위 재정의 (2026-10-25)

| 요구 ID | 수용할 결정·기능 | 상태/후속 |
| --- | --- | --- |
| FR-P4-G0-R1-01 | 인바운드가 제한된 내부망 운영 사용자는 PROD Nginx 경유, 개발자는 별도 DEV App 직접 접속 | OWNER CONFIRMED, G5 접속 시험 |
| FR-P4-G0-R1-02 | 공격 대비·자격증명/세션 탈취 방어·TLS/MFA/SSO/침투·위조 공격시험은 비범위. HTTP 위험은 OWNER_ACCEPTED_SCOPE이지 보안 PASS 아님 | OWNER APPROVED SCOPE |
| FR-P4-G0-R1-03 | D1~D5 계정/세션/Role/Site/Audit·Admin 단발·365일 보존·실제 DB 원자성·기존 API/Viewer 무변경 | 필수, G1~G4/G6 |
| FR-P4-G0-R1-04 | 업무상 CAD 조회/등록/Current/삭제에 대한 Reader/Editor/Admin + Site Grant 전환 매트릭스는 별도 확정 | PROPOSED/PENDING, G7 |
| NFR-P4-G0-R1-01 | PROD/DEV 데이터 분리·정상 API 연결, 일관 DB/CAD/S3 backup/migration dry-run/restore, 정상 회귀. 적대적 공격 E2E는 별도 의무 아님 | G5/G6 |
| NFR-P4-G0-R1-02 | 운영 인증/관리/영속 API, DB/Prisma Migration, Nginx/Compose/.env 활성화는 G7 별도 Owner 승인까지 OFF | BLOCKED |

이 표는 이전 FR-P4-D1-06의 '보안 공격 차단/세부 CIDR·프록시 헤더 위조 실증'을 **필수 수용기준으로 요구하던 범위**를 대체한다. 기존 D1~D5의 비활성 기능 정책·테스트 및 기본 업무 권한 정합성은 유지한다. [Issue102](Issue102.md), [ADR-051-R1](Decisions.md), [Issue96](Issue96.md).


### Issue #82 / PR #111 — M1 도구 독점·미저장 초안 보존 추가 수용 계약

- FR-M1-05 보강: 새 메모 배치 뿐 아니라 기존 PIN **pointerdown 시점** 및 최근 메모 목록 클릭 모두 Outline/Generated 선택과 상호 배타적으로 전환하고 판정. 클릭이 완료될 때까지 다른 도구를 켜두는 구현 금지. TC-M1-E2E-004.
- FR-M1-03 보강: PIN Drag(5px 이상) 후 pointerup에 따라 발생할 수 있는 click이 같은 memo의 편집 폼 `title/content` 미저장 변경분을 절대 초기화하지 않음. 동일 memo 재선택도 단순 focus, 키보드 click 허용. TC-M1-E2E-005.
- CI 기록: 기존 HEAD ESLint 2 errors 실패, 수정 HEAD 실제 검증 전 수용 미완.


## Issue #82 / M1 v0.41.0 — WCS 메모 배치·편집(임시 세션) 요구사항

| ID | 요구사항 | 검증·후속 |
| --- | --- | --- |
| FR-M1-01 | 검증된 DXF+three-dxf-viewer ready, version UUIDv4 + SHA64 범위에서만 임시 메모 배치·조회·편집/삭제. 미지원 Renderer는 이유 포함 disabled | E2E-002/003, #83 |
| FR-M1-02 | WCS XY anchor 정본/label CSS offset 분리. 클릭·좌표 입력 후 확정. Zoom×2/Pan/Resize/CSS/native fullscreen에서 명시적 이동 없는 한 anchor 불변 | UNIT-001/002, E2E-001, 실제 native 실증 미완 |
| FR-M1-03 | 제목·다중행 본문 plain-text 수정을 수행해도 anchor 불변. 위치 이동은 별도 coordinate confirm 또는 5px 이상 pin drag pointerup만 적용 | UNIT-002/003, E2E-001/002 |
| FR-M1-04 | Esc/blur/scroll/wheel/Resize/view epoch/모드·Version/Renderer/reload 전환, invalid/stale/NaN/Infinity 좌표는 pending drag/draft 취소, 기존 정본 불변 | UNIT-003/004, E2E-002/003 |
| FR-M1-05 | 기존 DXF Source/Generated/Outline Tree·Layer·#40 Tool·#49 edit/Pan 이벤트와 격리. pin의 24px hit 외 text/leader pointer-through | E2E-003, Viewer 회귀 |
| FR-M1-06 | 최대 100메모; 제목 1~100, 본문 0~2000, NFC, 제어문자 거부, ±1e12 finite WCS. React escaped text only; 본문 Label은 160자 프리뷰 | UNIT-005/006, 100 memo performance |
| FR-M1-07 | M1은 인증된 작성자/수정자, 서버 Persistence/Scope/감사 아님. reload/renderer/version 변경 데이터 소멸·UI 명시, Version/SHA 교차표시 금지 | UNIT-001/004, E2E-002/003, #83 |

- **비범위:** #83 영속 UUID·작성자·API/DB, #84 Source/Generated target snap/relative transform, #85 메모 Tree/show-hide, #86 schedule/done, #88 memo link, #90 목록 전역 검색. #2 도면 설명 그대로. 원본 bytes/SHA/Current/Layer 및 Auth/Prisma/API 기능 활성화 없음.
- **실행 근거:** TC-M1-UNIT-001~006/E2E-001~003 작성 상태; CI/실 DXF/Native/GPU PASS 판단은 실제 실행 후 별도.


## Issue #99 — P0 정확도·P5 성능 현장 증거 요구 (2026-10-25)

| ID | 수용 전 필수 조건 | 검증 |
| --- | --- | --- |
| FR-P0P5-01 | 사내 승인 실 DXF 서로 다른 SHA 최소 3종, 1k·10k·100k 대표 supported Entity, 동일 SHA/byte source audit·Browser 결과, 5회 이상 반복 | TC-P0P5-001~004; 현장 샘플 |
| FR-P0P5-02 | 실제 CAD WCS XY·면적 상대 오차, Handle/instancePath/INSERT·BLOCK/OCS, 곡선/Polygon union/Holes, Source↔Render 1:N/N:1, 미지원 fail-closed 제외 건수+Matrix를 독립 검증 | TC-P0P5-006; Owner CAD 비교 |
| FR-P0P5-03 | 실제 Browser click/box/layer/zoom/pan/ESC/fullscreen/Worker 취소, 로드/선택·rAF frame p95, Browser heap·CPU parse/query, 장비 GPU 이용률·VRAM 외부 계측 | TC-P0P5-005/007; 사내 브라우저/계측 |
| FR-P0P5-04 | Owner가 모든 위치·면적 오차, CPU/browser/GPU·메모리 SLA를 사전 지정, 누락·초과는 BLOCKED. READY_FOR_OWNER_REVIEW는 최종 Owner 승인 아닌 입력 증거 충족 | TC-P0P5-002/005~008 |
| NFR-P0P5-01 | DXF/경로·Layer·Handle·장비 정보는 공개 Repo/Actions 제외, 격리된 DB·Storage에서만 비Current test upload. 원본 SHA/Current/Version/Viewer/API/Prisma/런타임 변경 금지 | 코드/문서 정적 검토 및 현장 감사 |

- **실제 측정과 승인 상태:** 현재 approved 실 DXF, CAD Reference, GPU 장치, Owner SLA 및 서명 입력 없음. 따라서 FR 모두 **FIELD BLOCKED**이며 synthetic CI가 통과하더라도 이를 완료로 변환하지 않는다. [Issue99](Issue99.md), [ADR-052](Decisions.md), [TestPlan](TestPlan.md).


## Issue #96 — P4-D1 승인 정책/비활성 요구 추적 (2026-10-25)

| ID | Owner 승인 요구 / 현재 범위 | Unit ID |
| --- | --- | --- |
| FR-P4-D1-01 | .env 최초 Admin 단발 bootstrap/복구, 기존 계정 재시작 자동 reset 금지, Secret 파일 경로만 설정(원문 미기록) | TC-P4-D1-005~007 |
| FR-P4-D1-02 | 계정 비밀번호 최소 8자, scrypt/Argon2id, 최초 변경·로그인 실패 제한 | TC-P4-D1-004,010,012 |
| FR-P4-D1-03 | Session 8h 절대/30m idle/동시 3개, 원시 token 저장 금지, 폐기·HttpOnly/SameSite | TC-P4-D1-008 |
| FR-P4-D1-04 | Reader/Editor/Admin 및 권위 Version→Site·명시적 SiteGrant, Admin만 Grant, audit:read/logs:read 별도 | TC-P4-D1-003/004 |
| FR-P4-D1-05 | 안전한 append-only Audit/365일 보존, Admin+별도 감사 권한, 원본 CAD/Geometry·Secret 미노출 | TC-P4-D1-011 |
| FR-P4-D1-06 | 지정 LAN CIDR·방화벽/프록시·HTTP 잔여 위험 수용, CSRF/Origin/로그인 시도 제한 | TC-P4-D1-009/010 |
| NFR-P4-D1-01 | 새 인증/관리자/영속 API, Prisma/DB/Migration, Docker/Compose **비활성**, 별도 Owner 운영 승인 게이트 | TC-P4-D1-013/014 |

- 위 작업은 순수 도메인·헬퍼/Unit만 구현하며 런타임 연동 없음. 정확한 CIDR/Secret 취급/원자 DB/감사/복구·백업/실제 LAN 보안 수용 미확정. #98 Version 삭제 FK, Memo Editor, 세션 Show/Hide reload 범위와 #99 실 DXF P5 수용은 후속. [Issue96](Issue96.md), [ADR-051](Decisions.md).



## Issue #97 / P4-D2 — 변형 가능한 외곽선의 서버 Canonical 검증 요구 (2026-10-25)

| ID | 승인 정책의 시험 가능 구현 | 검증 |
| --- | --- | --- |
| FR-P4-D2-01 | Immutable server DXF bytes+Version+SHA 및 $INSUNITS 검증, 고유 Stable root Handle·INSERT WCS의 실제 SourceRef만 허용. 유효하지 않은/중복 Handle, unsupported OCS/BLOCK, 발급 불가 child instancePath 거부 | TC-P4-D2-001~004 |
| FR-P4-D2-02 | CONVEX/PRECISE Canonical baseGeometry를 서버에서 독립 재계산; algorithmVersion(현 v1 명칭), 고정 0.02 Drawing Unit tolerance·Polygon/MultiPolygon/Hole 유지 | TC-P4-D2-001/003/006 |
| FR-P4-D2-03 | Translate/Rotate(+deg CCW; pivot; left-compose)만 명시적 순서로 재계산해 effectiveGeometry 반환. raw affine만/Scale/Shear/Reflect/Z, 비유한·허용범위 외·위조된 최종 Polygon을 거부 | TC-P4-D2-005~009 |
| FR-P4-D2-04 | 기존 browser JSON v1/v2는 canonical-only 방식으로 하위호환; 편집 확장은 명시적 operations와 untrusted base/final claims를 독립 비교. browser GeneratedDocument/Local ID를 인증된 서버 객체·DB UUID로 취급 금지 | TC-P4-D2-001/005/007 |
| NFR-P4-D2-01 | 순수 검증/오류 계약만 추가하며 신규 인증·서버 GET/Write API·Prisma·Migration·Current·DXF 원본·Viewer·GHCR 동작 변경 없음. 권한/Scope/CAS/Audit/운영 활성화는 #96/#98 승인 게이트, 실DXF 3종/GPU 성능은 #99 | TC-P4-D2-001~009 + 후속 통합 |

- [ADR-050](Decisions.md), [Issue97](Issue97.md), [TestPlan](TestPlan.md). Code 작성과 PR CI 시작은 실행 검증·현장 승인으로 기록하지 않는다. 기존 FR-P4-D0-04의 합의 범위를 변경하지 않는다.

## Issue #31 P4-D0 — Owner 결정 기반 경량 계정/영속화 요구사항 (2026-10-25)

> **D0 POLICY APPROVED / IMPLEMENTATION BLOCKED:** [ADR-048/049](Decisions.md), [Issue31](Issue31.md), [Database](Database.md), [Architecture](Architecture.md). 문서 계약 수립만 포함하며 Server Session/Prisma/API/운영 릴리스 구현 없음. 아래 확정 정책이 과거의 OIDC 추천·Scope TBD 예시보다 우선한다.

| ID | 승인 정책 및 시험 가능한 요구사항 |
| --- | --- |
| FR-P4-D0-01 | 외부 공개망 인바운드 제한 사내 LAN의 여러 클라이언트가 서버 IP의 **HTTP**로 사용; 앱 로컬 계정/서버 관리 세션. OIDC/SSO/MFA/HTTPS/TLS 구축 제외. 계정의 주요 목적은 담당 Scope 권한과 변경자·이력 추적. HTTP상 비밀번호/세션 노출 위험과 LAN 제약 명시 |
| FR-P4-D0-02 | Reader/Editor/Admin의 단일 서버 RBAC + 검증된 UserSiteGrant 및 CAD Version 실제 소속 Site 관계. 다른 Scope 거부/메타데이터 누수 방지. `OutlineType` 카탈로그는 전체 앱 **공통**이고 Site별 별도 타입 관리 금지 |
| FR-P4-D0-03 | 담당 Site/Version Scope 내 Editor 간 GENERATED 외곽선 **공동 수정·논리 삭제**. createdBy 불변, updatedBy/revision/감사 갱신. 다른 Editor 작성자라는 이유만으로 차단 금지; 메모 권한에 이 규칙 전파 금지 |
| FR-P4-D0-04 | 서버는 SOURCE Version/SHA/stable Handle/instancePath→WCS canonical baseGeometry를 독립 계산하고 허용 Translate/Rotate의 강체 Transform만 검증하여 최종 geometry를 재계산. 임의 client polygons/scale/shear/reflect/Z/edit JSON 바로 DB 저장 금지 |
| FR-P4-D0-05 | CadOutline 논리 삭제(status/deletedAt/deletedBy) 및 append-only audit; 물리 삭제/복구는 별도 정책 승인 전 금지. 서로 다른 Scope, stale revision, 미검증 source에서 전체 fail-closed |
| FR-P4-D0-06 | Show/Hide는 사용자 세션별 임시 UI 상태, 글로벌 DB 속성·다른 사용자 상태·CadOutline revision 불변. 새로고침/다중 탭 지속 여부는 미확정 |
| FR-P4-D0-07 | 영속 GENERATED 대상 삭제 시 Memo Anchor 마지막 정상 WCS 보존, target ref 해제·BROKEN_ANCHOR. 다른 객체 자동 연결 및 메모 자동 삭제 금지; #83/#84 연계 구현 후 단일 DB 트랜잭션 검증 |

- **불변:** 원본 DXF bytes/SHA/Version/Current 변경 금지; Source/Generated 이름공간 분리. `kind`(CONVEX/PRECISE)과 `outlineTypeId`(Global Catalog) 분리; JSON v1/v2/Session Undo 호환. D1 공통 Auth 후 D2 Server Geometry, D3 CadOutline 영속 CRUD/CAS, #65 Global Catalog, #71 typed confirm, #73 복원, #83/84 메모 연계. #60 로그/ #83 메모는 D1 공유 기반 이후 독립 착수 가능.
- **최소 보안 및 한계:** 서버 로그인 hash·랜덤 세션·HttpOnly/SameSite Cookie·CSRF/Origin·기본 rate limit·로그아웃 폐기·LAN 허용 범위 검토. 일반 HTTP 서버 IP에 Secure 쿠키/TLS 암호화가 있다고 주장하지 않는다.
- **미확정/게이트:** 최초 Admin/계정 복구, password/session 상세, Role 부여 책임, HTTP LAN 허용 대역/잔여 위험, audit 보존 기간/조회, Version 삭제 FK/restore/purge, legacy import 이관, Memo Editor policy, Show/Hide reload/tab lifetime, 실 DXF P0/P5 성능 기준. 관련 세부 결정을 요구하는 서버 API/DDL/운영 활성화는 승인·검증 전 차단.


## Issue #93 / v0.40.1 — 목록 기본 Current + 이전 Version 표시·검색 정책 복원 (2026-10-25)

- **FR-LIST-093-01 / AC1~3:** `/` 기본/초기화=Location별 명시 Current만. `현재 버전만 표시` 단일 토글 기본 ON, OFF는 과거·현재 **전체 Version**(Current 미지정 Location 포함)을 보여준다. 더 높은 Version 번호를 자동 Current로 해석/승격하지 않는다. 중복 Current 드롭다운은 재도입하지 않는다.
- **FR-LIST-093-02 / AC4:** OFF에서 파일명/도면명(현행 지원 검색 범위), 설명·사업부/제품/사업장·법인/동/층/형식/페이지당 표시 필터의 단독·AND 검색을 허용한다. 현재 목록/이력 목록 모두 올바른 서버 SQL 행 수 및 페이지 수와 빈 상태를 사용한다.
- **FR-LIST-093-03 / AC5:** ON/OFF 전환 시 기존 검색값·pageSize 보존 + page=1. 검색 제출·페이지 링크·URL 복사/새로고침·브라우저 뒤로/앞으로 이후에도 전체/Current 상태를 보존; 초기화는 Current로 복귀한다. `aria-pressed` 및 시각적 ON/OFF 안내를 제공한다.
- **FR-LIST-093-04 / AC6:** 홈 UI에서만 `versions=all`을 허용해 `current=''` 전체 조회로 매핑. 과거 홈페이지 `?current=false`는 전체로 정규화하되 **API `current=false`는 non-Current만** 조회한다. 이외 `versions` 값·중복·모드 충돌은 검증 오류로 처리.
- **FR-LIST-093-05 / AC7~8:** 이전 Version 행의 Viewer·상세·링크 복사·다운로드·Current 지정/변경/삭제를 재사용. Current 최대 1개/수동 지정·해제/삭제 후 재검색 정합성 보존; DB Schema/마이그레이션/원본 bytes·SHA/External API 변경 없음.
- **NFR-LIST-093-01 / AC9:** 기존 `listQuery`/Repo 구조 불변, URL 정규화·다중 GET form·ARIA/Unit/Integration/E2E 및 Workflow·Upload 회귀 검증. [Issue93](Issue93.md), ADR-034-R1, TC-LIST-093-001~003/E2E-001~002. PR CI 성공은 실제 Run 결과 확인 후만 기록한다.

> **우선 적용 정책:** 아래 #45 당시에 문서화된 '홈 목록 항상 Current-only' UX는 #93에 의해 대체됨. #45의 구현·검증 이력, `/api/cad-files`의 Current 조회 계약은 보존한다.


## Issue #54 / E4 v0.40.0 — 생성 개체 WCS 수치·그룹 드래그 이동 (2026-10-25)

- **FR-E4-01 / AC1:** DXF+three-dxf-viewer Generated 편집에서 선택한 하나/복수 확정 외곽선을 WCS XY `ΔX,ΔY`로 평행이동. 두 값 동일 적용으로 상대 위치 유지. `$INSUNITS` 코드 표기/0·미상 안내, 픽셀/수치 단위 혼동 금지.
- **FR-E4-02 / AC3/4:** 이미 선택한 GENERATED 개체 외곽 경계에서만 5 CSS px 이상 이동 시 Ghost 시작, 화면→WCS camera.unproject. 화면 Zoom/Space Pan/영역 선택/생성 ON/OFF/Fullscreen/터치 두 번째 포인터, ESC/포인터 취소·손실·blur/Renderer·Version·reload/Dispose에서 즉시 preview 취소. pointerup 전 Document/history 불변.
- **FR-E4-03 / AC1/2:** 최신 선택·UUID·Version/SHA·visible/Origin·다중 중복/누락을 UI/Adapter/E2 Document에서 재검증. SOURCE/혼합/NaN/Infinity/과도 Δ/overflow는 일괄 거부. 성공한 명령은 1 history step이고 Undo/Redo는 기준 Geometry 및 외곽선 metadata/provenance/UUID 불변으로 복원.
- **FR-E4-04 / AC2:** Polygon/MultiPolygon/Hole/모든 링·bbox·hit·Tree·Canvas·Fit·기존 임시 JSON을 Document projection 기준으로 일치시키고 Worker/source spatial index 새로 계산하지 않음; 변경된 GPU 그룹/ghost dispose.
- **NFR-E4-01 / AC3/4:** 원본 Source bytes/SHA/Layer/Current/Version, server API/DB/P4 보안 승인, 미지원 Renderer/DWG, E5 Rotate·E6 JSON Import 불변. 새 브라우저 Session에서 이동 사라짐. 자세한 기준 [Issue54](Issue54.md)/ADR-047/TC-E4.

## Issue #53 / E3 v0.39.0 — 선택 GENERATED 삭제·확인·Undo/Redo (2026-10-25)

- **FR-E3-01 / AC1/2:** DXF+three-dxf-viewer에서 현재 생성 외곽선 단일/복수 삭제를 편집 도구바, #43 Tree 행, 선택된 Canvas 개체의 우클릭 작업, Canvas 초점 Delete/Backspace에 동일한 E2 `Delete(ids)`로 제공. 이름·개수 확인, 취소하면 상태 및 이력 무변경.
- **FR-E3-02 / AC3:** SOURCE와 SOURCE+GENERATED 혼합, 누락·중복·숨김·다른 Version/SHA Ref, selection/모드 변경 요청을 UI·Manager/Adapter·GeneratedDocument 도메인에서 fail-closed. 트리 행 액션으로 혼합 선택의 SOURCE를 자동 제거하여 편집 가능하게 만드는 행위 금지.
- **FR-E3-03 / AC2/4:** 한 번의 atomic Delete=1 undo step, Undo/Redo로 기존 UUID/legacy local-N·기준 WCS Geometry/Transform/metadata/visibility·정렬 복구, 제거된 선택/트리 포커스 정리. 남은 Scene/Preview/Source/레이어 유지, 제거 GPU Geometry/Material dispose, 재생성 ID 충돌 금지.
- **FR-E3-04 / AC4:** 생성 Tool #40 OFF 기본 Pan 독립 정책 유지하되 생성 편집 모드 진입 시 삭제 가능. keyboard는 Canvas 실제 초점 + modifier 없는 Delete/Backspace만, textarea/input/searchbox/contenteditable 및 다른 UI native 입력 보호. ESC=삭제 확인창/컨텍스트→staged 취소→selection→fullscreen; Renderer/Version/reload/dispose 수명 종료.
- **NFR-E3-01 / AC3/5:** 원본 DXF bytes/SHA/Layer/Current, Source Geometry·Worker Preview, DB/Migration/Server API 및 P4 보안 정책 변경 없음. 기존 JSON v1/typed v2 export는 남은 Document 투영, JSON edit import는 #56. [Issue53](Issue53.md)/ADR-046/TC-E3 참조.


## Issue #52 / E2 v0.38.0 — 생성 개체 로컬 Document 및 명령 이력 (2026-10-25)

- **FR-E2-01 / AC1:** E1 불변 UUID/Version/SHA Generated Ref에 생성 시 기준 WCS XY Polygon/MultiPolygon/Hole, source Entity provenance/algorithm, name/type/kind/visibility, edited/dirty, 편집 affine 변환을 단일 브라우저 Document에서 관리한다. #43 Scene/Tree/Export는 파생 뷰이며 원본 DXF/Preview는 포함하지 않는다.
- **FR-E2-02 / AC2/5:** Delete/Translate/Rotate 명령 등록 기반. 동일 버전·SHA·GENERATED-only·고유 ID·정확한 선택 대상, 유한 좌표·Pivot·결과 Geometry를 전체 검증한 뒤 한 번에 적용한다. invalid·SOURCE·혼합은 부분 변경 없이 거부한다. 실제 삭제/이동/회전 조작 UI는 E3~E5 범위.
- **FR-E2-03 / AC1/3:** Undo/Redo 최대 100단계/예상 참조 history 16MiB 예산, 손실 없이 상태/순서 복원, 새 명령 시 redo 폐기. 포인터/확정은 한 단계, ESC·취소·Version 변경 시 미확정 작업 폐기. Ctrl/⌘+Z·Shift+Z·Ctrl+Y, native 폼 단축키와 충돌 금지.
- **FR-E2-04 / AC4:** Document 이벤트로 Overlay GPU 증분 갱신, 취소/Dispose 시 GPU/Worker 정리, Source index·DXF geometry Worker 불필요한 재계산 금지. Zoom/Pan/가시성은 Undo 기록 대상 아님. total 100k vertex/100 object 및 WCS 범위 상한.
- **NFR-E2-01 / AC4~5:** 로컬 세션만. 재로드/Renderer/Version 전환 시 소멸. 명시 JSON 복원은 E6 별도, 기존 #31 v1/typed v2 다운로드 하위호환 유지. 편집된 Geometry는 canonical attestation(#31 P4) 동일성 검증 우회 금지; 서버 DB/API/권한 추가 금지. [Issue52](Issue52.md), ADR-044 및 TC-E2-UNIT-001~004/E2E-001~002.


## Issue #51 / E1 v0.37.0 — SOURCE·GENERATED 통합 선택 (2026-10-25)

- **FR-E1-01 / AC1:** SOURCE(#31 검증된 WCS/Handle 참조)와 GENERATED(현재 브라우저에서 확정된 Overlay) 선택을 통합하되 Origin·Version·SHA·불변 UUID로 식별하고 선택/강조/개수와 Tree(#43)를 일치시킨다. 기존 local-N JSON v1/v2 식별자는 호환성 때문에 변경하지 않는다.
- **FR-E1-02 / AC2:** 원본 SOURCE와 혼합 선택은 전체 편집 거부/읽기 전용, GENERATED-only Ref만 `canEdit` (실제 Delete/Translate/Rotate/Undo는 E2~E5 이후). 중복·위조 ID/다른 버전은 fail-closed.
- **FR-E1-03 / AC3:** 원본 레이어/Geometry Index 정책을 보존하고 GENERATED는 보이는 Polygon/MultiPolygon/Hole의 WCS hit/영역 선택, Ctrl/⌘ 토글·드래그 방향·Space 임시 Pan/ESC를 지원. 숨김·삭제와 기존 선택을 동기화하며 Preview는 선택 불가.
- **FR-E1-04 / AC4~5:** Pan·일반 객체·생성 외곽선 Source·Generated 전용 모드 분리. Reload/Renderer/Version/dispose 폐기. Manager/Adapter 계약으로 E2~E6 재사용. DXF+three만 지원, DB/API/원본 파일/Current 수정 금지. 수용 추적 [Issue51](Issue51.md), TC-E1-UNIT-001~002/E2E-001~003.


## Issue #43 / U6 v0.36.0 — 외곽선 트리·Overlay 표시 (2026-10-25)

- **FR-U6-01/AC-U6-01:** 현재 Version의 SavedOutline만 ID 기반 업무 타입별 그룹(수량·이름·kind)으로 구성하고 기존 미분류 v1은 legacy group. 실 서버 scoped catalog(#65) 부재 시 가상 업무 타입을 임의로 만들지 않는다. 비활성/삭제 타입의 과거 표시용 이름 스냅샷 유지.
- **FR-U6-02/AC-U6-02:** 트리 외곽선 선택 시 독립 Overlay 하이라이트와 WCS Polygon/MultiPolygon Bounds focus; 퇴화·비유한 좌표 차단. Source DXF/Layer/Handle/Worker 불변.
- **FR-U6-03/AC-U6-03:** 개별·타입별 show/hide는 별도 Adapter saved Group.visible만 변경. 트리·데이터·JSON 유지, 생성 ON/OFF·실 CAD Layer visibility 독립. 도구 OFF 삭제 차단.
- **FR-U6-04~05:** 생성/삭제 동기 갱신, Renderer/Version/Reload 폐기, 320px compactPanel/ARIA tree/키보드/메뉴 focus/scroll, Canvas 재마운트·중복 Fetch/Worker 금지. SavedOutline 생성은 최대 100건.
- **FR-U6-06 BLOCKED:** 영속화는 #65/#31 P4 승인 후 인증·Scope·CAS·source 재검증·Audit/GET 계약 확정. 현재는 브라우저 메모리만. 검증/추적 [Issue43](Issue43.md).


## Issue #42 / U5 v0.35.0 — 외곽선 업무 타입 지정 (2026-10-25)

- **FR-U5-01**: 업무 타입 `outlineTypeId`는 ID 기준 1개, `kind`는 기존 `CONVEX|PRECISE`로 독립 유지. 타입만 바뀌어도 원본 SHA/Handle/geometry/Worker 결과 불변. `SavedOutline`과 브라우저 다운로드 DTO에 타입명 스냅샷·외곽선 이름 추가.
- **FR-U5-02**: 타입은 향후 #65에서 서버가 전달할 active/current version/scope의 읽기 전용 기준정보만 사용. 없거나 일치하지 않거나 비활성·다른 Scope이면 typed confirmation 차단. #41 브라우저 실험 타입은 금지. Owner 승인 전 실제 API/DB/영속 저장 미구현.
- **FR-U5-03**: 타입 확정 시 이름은 1~100자 trim/NFC/Cc·Cf·Cs 거부, 공백이면 `외곽선 N`, 중복 표시 이름 허용(Identity는 local-N). 다른 Version 자동 상속 없음.
- **FR-U5-04**: 기존 v1 import/export 및 Source/SHA 검증 유지, typed/mixed 결과는 v2. v2 null triple은 legacy 미분류만 의미하며 서버 쓰기 승인 불가. #43 Tree UI는 후속.
- **현행 수용 상태**: AC-U5-01/03 CODED, 02/04 PARTIAL, 05 Fail-closed Code Gate. #65 완료 이후 서버 기반 E2E/권한·원본 재검증·CAS를 추가해야 운영 수용 가능. [Issue42](Issue42.md).


### Issue #41 / PR #64 — U4 시안 실행 환경·검증 보완

- **FR-U4-05(보강):** 실제 Admin 기능/API/DB 미승인 차단을 유지하면서도 **비영속 프로토타입**은 `randomUUID`가 미제공되는 사내 HTTP host 접속에서도 CSPRNG 기반 임시 UUID 생성이 가능해야 한다. 안전한 난수 API가 모두 없으면 명확하게 거부하며 `Math.random` 또는 서버 영속 ID로 위장하지 않는다.
- **NFR-U4-02:** UI validation alert의 E2E는 Next 내장 route announcer와 혼동하지 않도록 prototype scope에서 검사. 최초 [CI 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566) strict Locator 실패 및 [P2 리뷰](https://github.com/planner77/layoutManager/pull/64#discussion_r4369348797) 보완. 새 CI 결과 미검증.


## Issue #41 / U4 v0.34.0 — 최상위 외곽선 업무 타입 안전 선행 (2026-10-25)

- **FR-U4-01 (AC-U4-01/04):** 향후 Admin은 변경 불가 ID의 업무 타입을 생성·이름/설명/순서 수정·비활성·복구. 활성 타입만 새 외곽선 선택에서 사용, inactive도 기존 FK/트리 참조 유지. `OutlineKind` CONVEX/PRECISE와 분리.
- **FR-U4-02 (AC-U4-03):** 이름 trim→NFC(1~100)/제어·비표시 문자 거부, 설명 최대 500, 0~9999 정렬순서, 같은 scope의 대소문자 무시 중복 불가, inactive 이름 예약. ID/createdAt 불변·revision 충돌 반환. 실제 scope/DB collation 미승인.
- **FR-U4-03 (AC-U4-02/05):** 실 GET/POST/PATCH/비활성 Route/DB 및 상단 관리 메뉴 활성화는 Owner의 인증·Admin RBAC·scope·CSRF/Origin·감사 승인 **이전 금지**. 삭제용 비밀번호/임의 X-User/X-Role은 권한이 아니다.
- **FR-U4-04 (설계검증 전용):** `/lab/outline-types` 시안은 React 브라우저 메모리에서 추가·수정·비활성·복구 및 입력 오류를 재현하되 reload 때 삭제, 실제 데이터/외곽선/API와 단절. 운영 메뉴는 disabled 유지.
- **NFR-U4-01:** #31 P4 서버 인증·Storage source 무결성/Revision, #38/#39/#40 셸/도구, CadFileVersion/Prisma/원본은 불변. 설계 [Issue41](Issue41.md), ADR-037, TC-U4-UNIT-001~004 / E2E-PREVIEW-001 / E2E-GATE-002.


## Issue #40 / U3 — v0.33.0 상단 외곽선 생성 제어 (2026-10-25)

- **FR-U3-01 (AC-U3-01):** Viewer 외곽선 생성 메뉴의 초기 상태는 OFF. 매핑된 객체가 있는 DXF `three-dxf-viewer`에서만 ON 시 객체 선택(`select`) 및 기존 하단 도구로 전환하며 OFF 시 Pan으로 돌아간다. 앱 상태 토글과 실제 Overlay 표시·CAD 레이어 체크는 독립.
- **FR-U3-02 (AC-U3-02/03):** OFF 전환 시 진행 중 Worker/미리보기와 선택을 안전하게 무효화하고 사용자에게 비확정 취소를 안내. 반복 토글/늦은 Worker 완료에 의한 Preview 재노출·이벤트 핸들러 중복 금지. 임시 확정 Overlay와 브라우저 JSON 다운로드는 동일 Version/Renderer 세션의 OFF에서도 보존.
- **FR-U3-03 (AC-U3-04):** #31 다중선택(양방향 드래그/Mod/Space Pan), 레이어 숨김 선택 제거, Source↔Renderer fail-closed, ESC 선택→검색→native→CSS 우선순위, 기존 Renderer 전환/reload/dispose 시 메모리 정리 보존.
- **FR-U3-04 (AC-U3-05):** `dxf-viewer`/DWG, 로딩/오류/빈 Entity/검증 불가능 SHA 또는 mapped source 0개는 메뉴 disabled/사유 안내. Renderer·Version/reload 실패 시 강제 OFF 및 기존 임시 결과 수명 종료. 실제 SHA bytes 검증은 기존 업로드/조회 계약과 구분하고 Viewer에서는 64-hex metadata 가용성을 추가 확인.
- **NFR-U3-01:** 영구 저장/재조회 API, RBAC, 관리자 유형/트리, DB migration, CAD source 변경 없음. `out/Issue40.md` / ADR-036 / TC-U3-UNIT-001~003 / TC-U3-E2E-001~003로 추적.


## Issue #39 / U2 — v0.32.0 레이어 메뉴·패널 상태 일치 (2026-10-25)

- **FR-U2-01 (AC-U2-01):** 전체 화면에서 지원 Renderer(`three-dxf-viewer`, DXF, ready, 1+ layers)의 상단 레이어 메뉴로 좌측 도크를 닫고 다시 열 수 있고, 내부 접기 버튼과 `layerPanelOpen` 하나의 상태를 사용한다. 최초 로드/Renderer 재설정은 보이는 기본값.
- **FR-U2-02 (AC-U2-01/02):** CAD `selectedLayers` 체크와 패널 열림은 독립. 열기/닫기가 체크·Canvas/ViewerManager/Source/Zoom/Pan/Fit/Selection을 변경해서는 안 된다. 기존 checkbox·전체 선택/해제 콜백만 CAD layer visibility를 변경한다.
- **FR-U2-03 (AC-U2-03):** 사용 가능한 메뉴의 `aria-expanded`/`aria-pressed`는 실제 패널 표시와 일치, `aria-controls`는 닫힌 상태에도 존재하는 도크 host를 참조. 내부 접기 시 포커스는 메뉴로 복귀하고 Enter/Space 재열기가 된다. disabled 상태에서 유효하지 않은 controls 제거.
- **FR-U2-04 (AC-U2-04):** 일반 모드 기존 LayerDropdown 유지, 다른 Renderer·DWG·로딩/오류/0 레이어 disabled; 모바일 독립 레이아웃 및 native/CSS fullscreen/재로드 상태 오염·메모리 누수 금지. #40~#43 추가 기능이나 DB/API 변경 없음. [Issue39](Issue39.md), [ADR-035](Decisions.md).

## Issue #45 / v0.31.0 — 도면 목록은 항상 Current 전용 (2026-10-25)

- **FR-LIST-045-01 (AC1/AC3/AC4):** `/`의 모든 조회(최초/검색/초기화/페이지/새로고침/직접 URL)는 Location에 지정된 `Current Version`만 반환한다. 최신 Version을 자동 승격하지 않으며 Current 미지정 Location은 제외한다. 과거 `current=false`/누락 URL도 Current-only, 잘못된 입력은 기존 검증으로 거부.
- **FR-LIST-045-02 (AC2/AC5):** 목록의 ON/OFF 토글·전체 버전 모드를 제거한다. 파일명/설명/사업부→제품→사업장·법인→동→층/형식/pageSize를 Current와 AND 결합하고 총건수/페이지/빈 상태도 서버 Current 결과만 집계한다.
- **FR-LIST-045-03 (AC6/AC7):** Current 없는 층도 기준정보에서 `버전 이력` 링크로 Location 상세에 진입하여 이력 확인/Current 재지정/이전 버전 보기·다운로드/삭제를 계속할 수 있어야 한다. 재조회는 새로운 Current를 반영한다.
- **NFR-LIST-045-01 (AC8/AC9):** `/api/cad-files`의 `current=true|false` 계약, `CadListService`·DB Current 0~1개/FK/원본 불변. Schema/migration 없음. 요구사항·시험·문서 추적 유지. [Issue45](Issue45.md), [TestPlan](TestPlan.md), [Decisions](Decisions.md).


## Issue #38 / U1 — v0.30.0 Viewer 앱형 메뉴·도킹 계약 (2026-10-24)

- **FR-U1-01 (AC-U1-01):** #25 기본 CSS immersive 진입·직접 링크·새로고침·native 사용자 선택을 보존하면서 단일 앱 메뉴바/도킹 셸을 제공한다.
- **FR-U1-02 (AC-U1-02):** 기존 Renderer 전환/Zoom/fit/원본 다운로드/링크 복사/뒤로/종료/재시도/Version·설명/로딩·경고/레이어/검색/선택을 모두 유지하고 접근 가능하게 한다.
- **FR-U1-03 (AC-U1-03):** 레이어 도크 표시 상태와 개별 CAD 레이어 visibility는 서로 독립. 패널 열기·닫기로 ViewerManager/Adapter 생성·source 재요청·camera reset 금지.
- **FR-U1-04 (AC-U1-04):** 좌측 레이어·우측 트리 패널 호스트와 가운데 캔버스는 공간 분할 방식. 모바일(320px)/낮은 높이에서 단일 도크 전환과 viewport 크기 반영, Tab/focus/ESC 1회 한 계층 처리.
- **FR-U1-05 (AC-U1-05):** 두 DXF Renderer와 DWG Viewer 공통 셸 적용, unsupported 도구 비활성/사유 표시. `outlineToolEnabled=false`, `outlineTreeOpen=false` 초기 상태 및 U2/U3/U6 확장 가능한 독립 상태 계약.
- **범위 경계:** #40 생성 모드 토글, #41 관리자 타입 서버 API/DB(인증 RBAC 승인 전 차단), #42 메타데이터, #43 타입별 트리 기능은 U1에서 미구현/비활성. #31 임시 외곽선 기능 유지, 원본 CAD/Version/SHA/DB/API 변경 금지. 상세 [Issue38](Issue38.md).


## Issue #25 — 0.29.0 기본 immersive Viewer (PR CI 전)

- FR-VIEW-IMM-001: 도면 목록/상세/직접 링크(주소창·새 탭·새 Context)·브라우저 새로고침 등 동일 Viewer URL 진입 즉시 CSS fixed/100dvh 전체 뷰포트 레이아웃을 기본 제공한다. native Fullscreen API 자동 요청은 하지 않으며 기존 Version UUID·renderer query 호환을 보존한다.
- FR-VIEW-IMM-002: 명시적 **브라우저 전체 화면** 버튼만 native `requestFullscreen()`을 요청하고 거절·미지원에서도 CSS 모드를 유지한다. 브라우저 주소창 자동 숨김을 약속하지 않는다.
- FR-VIEW-IMM-003: immersive 안에서 도면 이름·Version·위치, Renderer, 줌/맞춤, 레이어(#17), 검색(#26), 외곽선(#31), 원본 다운로드·링크 복사·로딩 상태·오류/재시도·뒤로 가기를 제공한다.
- FR-VIEW-IMM-004: 명시적 종료/ESC/native 해제를 충돌 없이 분리하며 일반 Viewer 복귀·수동 재진입·브라우저 Back 및 포커스·스크롤 복원을 지원한다.
- FR-VIEW-IMM-005: mode 변경 자체는 ViewerManager/Adapter/Canvas를 재생성하지 않으며 100dvh 및 resize가 canvas backing size에 반영되고 기존 Renderer 전환·Version 교체의 lifecycle/cleanup과 전역 Spinner를 회귀시키지 않는다. DXF/dxf-viewer, DXF/three-dxf-viewer, DWG/libredwg-web에 공통 정책을 적용한다.
- 세부 AC/TC 및 한계: [Issue25](Issue25.md), [TestPlan](TestPlan.md). 실제 CI PASS/현장 수용은 **미확정**.



## Issue #31 후속 수용 변경점 0.28.3

- OUT-P0-FIDELITY: INSERT/BLOCK의 일부 Entity가 미지원이면 stable EntityRef 선택·저장 승인 금지. 원/호의 512 segment 한도 내 WCS chord error 목표 충족 불가능시 명시적 실패.
- OUT-P4-CANONICAL: Server-owned bytes sha256/Version/INSUNITS와 unique Handle을 검증한 후 양면 Polygon XOR에 의해 Client JSON 위변조 감지 및 서버 산출 Geometry만 사용. 이 안전 모듈은 실제 CRUD/Auth의 대체가 아니다.
- OUT-P5-ACCEPTANCE: synthetic 1k/10k/100k CPU/Heap 수치를 CI에서 재현하며 고객 real DXF의 선택·Load p50/p95·Viewer/GPU·WCS 일치 확인은 내부 전용 5회 Browser 재현 절차로 분리. 실제 DXF, IdP, 운영 수용 SLA가 없는 동안 미완료 상태 표기.
- OUT-P4-SECURITY: Owner 인증·인가 승인 없는 DB Migration/Write API 금지 유지. 로그와 외부 Git에 원본 도면/SHA 외 추가 개인정보를 저장하지 않음.


## Issue #31 추가 AC: Production Worker export·대형 도면 사전 검증 (0.28.2)

- OUT-BUILD-001: Webpack Worker import/export 미해결 오류를 감지하면 Next Build exit code 0이어도 CI/릴리스 실패. 배포 실패가 명확하게 보고되어야 한다.
- OUT-GEO-004: Production Worker의 PRECISE Polygon Union 결과를 임시 확정·JSON 다운로드 후 실제 WCS² 면적/닫힌 Ring/Version·SHA/EntityRef로 검증한다. UI의 정적 표시·TypeScript 검사만으로 성공 처리하지 않는다.
- OUT-PERF-002: PR CI에서 synthetic 1k benchmark smoke를 실행하고, 10k/100k 및 실제 승인된 CAD는 별도 CPU/Browser·Worker/GPU 실측 절차로 관리한다. 가공 Entity 성능 지표를 운영 SLA로 오인하지 않는다.
- OUT-DATA-004: P4 인증·인가 미확정 동안 DB/Server 영속 쓰기 API를 추가하지 않는다. 기존 도면 삭제 비밀번호는 편집권한으로 사용하지 않는다. 실 DXF에 대한 현장 검증과 분리한다.


## Issue #31 잔여 요구사항 명세 (0.28.1)

- P0-MAP: Source Handle만으로 Selection을 허용하지 않고 THREE `userData.entity`와 render Type/Layer/WCS XY Box 일치 여부 검사. 1:N 객체 Bounds 합산. 미일치 Entity는 선택 제외와 경고.
- P5-INDEX: 대형 도면 hit-test 범위 가속과 giant Entity cell 상한; 1k/10k/100k CPU synthetic 벤치 JSON 재현성, 실제 도면·Worker 전송/GPU/입력 latency 수용은 별개.
- P4-DRAFT: browser-export JSON의 Version·sourceSha256·고유 Handle·유효 Polygon을 확인하되 Client geometry를 인증된 기록으로 신뢰하지 않는다. Owner AuthN/AuthZ 결정 전 DB/Server Outline CRUD 미배포.
- 실제 도면 소·중·대형 sample 3종+CAD 수치 기준·환경·반복 측정이 없으면 P0/P5 운영 적합성을 확인할 수 없다. 이슈 종료는 전체 범위 수용 후만 가능. [Issue31](Issue31.md).


## GitHub Issue #26 — 도면 내부 텍스트 검색 (0.27.0)

- FR-TEXT-001: 현재 열린 DXF Version의 TEXT/MTEXT 표시 문자열만 별도 검색하며 Unicode NFC, MTEXT 서식/개행 정규화와 대소문자 무시 부분일치 제공.
- FR-TEXT-002: 문자열·Entity Type·layer·결과 개수/순번·이전/다음 및 결과 클릭 이동. 동일한 텍스트의 서로 다른 위치는 개별 결과.
- FR-TEXT-003: BLOCK/INSERT의 2D affine 변환을 처리하고 비지원 OCS/attribute/배열 INSERT는 표시된 제외 건수로 안내.
- FR-TEXT-004: dxf-viewer 원점 보정, three-dxf-viewer world camera target 설정으로 Pan/Zoom. 단순 zoomIn 반복 금지.
- FR-TEXT-005: 검색 패널이 Viewer shell의 일반/전체 화면에서 동작, 레이어 숨김 상태를 유지하며 보이지 않는 레이어는 검색 제외.
- FR-TEXT-006: 동일 원본 다운로드 공유, Version별 text index cache, 검색 Worker와 취소/timeout/20k 한도.
- FR-TEXT-007: DWG는 현재 텍스트 검색 **미지원**을 명시하고 실험 증거 없는 지원 선언 금지.
- FR-TEXT-008: HTML/스크립트 삽입 금지, CAD 텍스트는 브라우저 내부에서만 검색하고 외부 서비스에 전송 금지.

구현·정확 좌표의 제한 및 시험 상태는 Issue26.md를 기준으로 한다. 본 문서 작성 시 자동 검증과 실도면 수용은 대기 중.


## Issue #31 요구사항 (0.27.0 구현 브랜치·수용 전)

- SEL-001~006: three-dxf-viewer DXF에 한정해 탐색/선택 모드, 클릭·Mod+클릭·양방향 영역 선택, 숨김 레이어 제외/해제, 오버레이/Fullscreen/ESC·전환 cleanup. 다른 Viewer·DWG는 미지원.
- GEO-001~005: WCS 2D 직선/기본 폐곡선/원호 샘플링, 결정론적 Convex Hull, 실제 닫힌 geometry의 Polygon Union/MultiPolygon/hole, 열린/자기교차 경고, 취소 가능한 Worker. 추정 Concave Hull은 별도 수용·정확도 검증 전 비활성.
- ID-001~003: Version+SHA+고유 Handle EntityRef, 원본 2D 좌표/INSUNITS, 임시 참조의 저장 금지, 복합 OCS·BULGE/특수 Entity 미지원 명시.
- DATA-001~003: 원본 불변 독립 Overlay와 JSON 출력. 서버 영속 CRUD 및 수정/감사/동시성은 권한 정책 승인 전 BLOCKED.
- PERF-001: 성능·실제 도면 적합성 조건부 검증, 정량 SLA 미확정. 세부 요구/상태: [Issue31](Issue31.md).


## IMG-01~IMG-05 — Issue #28 (0.26.0)

- IMG-01: 동일 linux/amd64 조건에서 기준선/Phase1/Standalone 운영 이미지의 비압축/압축 프록시/레이어/절감률을 추적한다(30%는 soft target).
- IMG-02: Next Standalone, Prisma Client/SQLite native, DXF 2종, DWG ESM/WASM, 한국어 TTF/글꼴·license/static 제공을 보존한다.
- IMG-03: 기존·빈 볼륨 모두 migration→backfill 성공 후 서버를 열며 실패 시 차단한다. 재실행과 UID10001/health를 보장한다.
- IMG-04: 단일 SQLite와 원본 local/S3 locator, 버전·Current·hash/데이터, 비밀번호/삭제/조회·업로드 계약을 보존한다.
- IMG-05: credential/DB/CAD 제외, 개발 의존성 제거, app+migrator GHCR image tag/digest의 동일 버전 관리, 백업·롤백 절차를 갖춘다. 상세: `Issue28.md`.


기준일: 2026-09-07. 원본: 사용자 제공 「CAD Web Viewer P.O.C. — Coding Agent 통합 지시」 §0–102. 이 문서는 원문을 기능/품질/운영 요구로 재구성한 기준이며 변경은 원본 의도와 대조한다.

## 목표와 범위

공장·설비 DXF/DWG 도면의 서버 등록, 위치별 버전 정합성, 브라우저 렌더링 및 실제 도면 적용성을 검증한다. 결과는 세 Viewer의 장단점·Entity 충실도·성능·한계와 향후 시스템화 가치에 대한 근거를 제공해야 한다.

P0=필수, P1=가능한 범위 구현 또는 지원 여부 평가. `PLANNED`=미구현, `IN_PROGRESS`=진행 중, `VERIFIED`=관련 시험으로 확인, `BLOCKED`=외부 조건 대기. 아래 상태는 구현 근거에 따라 갱신한다. 최신 DWG 통합 근거는 U7B-20260908, DXF 회귀 근거는 TestReport의 U9A-20260908이며 과거 Unit별 결과도 보존한다. DWG 및 실도면 미검증 항목은 별도 상태로 유지한다. Test Case 상세의 기준은 [TestPlan](TestPlan.md)이다.

## 기능 요구사항

### GitHub 이슈 #7 — 상단 제목 (0.19.1)

- FR-UI-002 / VERIFIED (U-ISSUE7-20260911 bounded QA): 공통 header 좌측 홈 링크의 표시 이름을 `Layout Manager`로 한다. 해당 링크의 `CAD` 접두어와 `P.O.C.` 배지를 제거하며 홈 이동 기능과 아이콘을 유지한다. 본문 도면 목록 제목·브라우저 metadata·업무 기능은 요청 범위가 아니다.
- TC-TITLE-001: 목록과 등록 페이지의 공통 banner 홈 링크에서 정확한 이름과 제거된 문구 부재, 홈 이동을 확인한다. 기존 관련 Browser 회귀와 typecheck/lint/build를 실행한다. 단순 문구 변경으로 새 중복 자동 테스트는 만들지 않는다.

### GitHub 이슈 #6 — 도면 이름 (0.19.0)

- FR-CAD-008 / VERIFIED (U-ISSUE6-20260911): 등록 시 선택 입력 `drawingName`을 제공한다. 생략/공백이면 `[사업부][사업장][동][층]_V{실제 버전 정수}`를 표시하고 직접 입력하면 해당 이름을 우선한다. 대괄호는 실제 구분 문자이며 확장자를 붙이지 않는다. 등록 전에는 위치에 따른 기본 이름과 버전이 등록 시 확정됨을 안내한다.
- 사용자 이름은 trim/NFC 후 최대255 UTF-16 code units, 한 줄 일반 문자로 제한한다. 제어문자·잘못된 타입·초과를 서버에서 거부하고 HTML은 plain text로 표시한다. 원본 파일명·bytes·hash·locator·Current·버전 순번은 보존한다.
- 목록 및 Location 목록의 주요 제목, Viewer 제목, 삭제 확인에 같은 표시 이름을 사용한다. 원본 파일명은 보조 표시하며 기존 파일명 검색·다운로드를 유지한다. 이름 변경은 신규 등록 입력 범위이며 등록 후 편집 API는 추가하지 않는다.
- 기존 Version은 사용자 이름 없이 기본 이름으로 조회된다. Additive nullable column migration으로 기존 데이터를 보존한다. 추적: TC-NAME-001–004 → TestReport U-ISSUE6-20260911.

### GitHub 이슈 #5 — 레이어 다중 선택 드롭다운 (0.18.0)

- FR-VIEWER-009: three-dxf-viewer의 표시 가능한 레이어를 다중 선택 드롭다운으로 제공한다. 개별 체크 항목과 ‘전체 선택’/‘전체 해제’를 제공하고 선택 개수/전체 개수를 표시한다. 선택 변경은 즉시 해당 레이어의 표시/숨김에 반영하며 드롭다운은 연속 선택 중 유지된다.
- 최초 load와 다시 불러오기, Renderer/Version 전환 후 새로 로드된 레이어는 전체 선택으로 초기화한다. 로딩·오류·빈 도면 및 레이어 미지원 Renderer에는 조작 가능한 레이어 메뉴를 표시하지 않으며 이전 도면의 목록·선택을 노출하지 않는다.
- 키보드 열기·항목 이동·토글·Escape 닫기와 포커스 복귀를 지원한다. 긴 이름과 많은 레이어는 폭 제한·줄바꿈/스크롤로 메뉴 안에서 접근한다. 도면 원본 재다운로드나 Viewer 재생성 없이 표시만 변경한다.
- TC-LAYER-001–003 / VERIFIED. 원본/DB/API 변경 없이 기존 Manager/Adapter 계층을 사용하며 신규 일괄 조작 기능으로 MINOR 0.18.0을 적용한다. 독립 QA의 실제 검증 결과는 TestReport U-ISSUE5-20260911에 기록한다.

### GitHub 이슈 #4 — 삭제 대화창 레이아웃 (0.17.2)

- FR-DELETE-006: 목록과 Location 상세에서 삭제 대화창을 표의 줄바꿈·스크롤 스타일과 분리해 viewport 안에 표시한다. 긴 파일명·위치·Current 경고·오류·정리 대기 문구가 대화창 폭 안에서 줄바꿈되며 입력과 버튼이 겹치거나 잘리지 않는다. 좁은 화면/낮은 높이에서는 대화창 내부 스크롤로 모든 내용을 확인할 수 있다.
- 키보드 포커스는 열린 대화창 안에 유지하고 닫은 뒤 호출 버튼으로 복원한다. 취소/닫기 뒤 비밀번호를 비우고 처리 중 닫기로 결과가 유실되지 않도록 한다. 실제 삭제의 기존 명시 확인·비밀번호 검증·Current/원본 처리 규칙은 유지한다.
- TC-DELETE-LAYOUT-001–003 / VERIFIED (U-ISSUE4-20260911). 서버/API/DB 변경 없이 호환 UI 수정으로 0.17.2를 적용했다.

### GitHub 이슈 #2 / #3 조치

- #2: 기존 FR-CAD-006의 ‘도면 설명’을 등록 메모로 사용한다. Browser에서 여러 줄 메모를 입력해 등록하고 목록·Location·Viewer 및 새로고침 뒤 저장 내용을 확인한다.
- #3 / FR-CAD-007: 파일 선택 및 제출 직전에 `File.size > maxMb * 1024 * 1024`이면 전송을 차단하고 현재 최대 MiB를 즉시 안내한다. 초과 선택값을 비우고 정상 파일 재선택을 허용한다. 경계 이하 파일과 서버의 최종 413 검증은 유지한다. TC-PREFLIGHT-001–003 / VERIFIED (U-ISSUES-20260911).
- 기존 미게시 0.17.0 변경을 보존하며 이번 호환 수정의 목표 버전은 0.17.1이다. 이슈 댓글·종료는 실제 관련 테스트 통과 및 원격 소스 반영 후 수행한다.

### 2026-09-11 추가 요구 — Version 비밀번호와 삭제 (Unit DELETE)

사용자 요청은 신규 도면 등록 비밀번호, 해당 비밀번호 확인 후 해당 도면 삭제, 기존 등록 도면의 비밀번호 일괄 `1234` 설정이다. 도면 단위는 기존 업무 모델의 선택한 Version 1개로 해석한다. 신규 기능과 API 입력 변경을 포함하는 목표 버전은 0.17.0이다.

| ID | 요구사항 / Acceptance Criteria | TC | 상태 |
| --- | --- | --- | --- |
| FR-DELETE-001 | 신규 등록 시 삭제 비밀번호를 필수 입력한다. 4–128 UTF-16 code units, UTF-8 512 bytes 이하, 제어문자 금지, trim/Unicode 정규화 없이 입력 그대로 검증한다. 비밀번호 없는 신규 API 등록은 400이며 기존 비밀번호 `1234`로 자동 대체하지 않는다. | TC-DELETE-001 | VERIFIED (U-ISSUES의 시험 범위) |
| FR-DELETE-002 | 목록/Location 상세의 선택 Version에 삭제 동작을 제공한다. 파일명·Version·위치를 확인하고 비밀번호 입력 후 명시적인 삭제 버튼을 누르면 서버가 검증한다. 틀린/누락 비밀번호는 DB·Current·원본을 변경하지 않는다. | TC-DELETE-002/003 | VERIFIED (U-ISSUES의 시험 범위) |
| FR-DELETE-003 | 일치한 Version만 삭제하고 나머지 Version을 보존한다. 삭제 대상이 Current이면 같은 transaction에서 NULL로 해제하며 자동 승격하지 않는다. 마지막 Version 삭제 후 Location은 보존하고 재등록 순번을 재사용하지 않는다. | TC-DELETE-003/004 | VERIFIED (U-ISSUES의 시험 범위) |
| FR-DELETE-004 | 삭제 완료 Version은 목록·검색·Location·메타데이터·원본·직접 Viewer 링크와 Current 지정에서 조회/선택할 수 없다. local/S3 원본은 DB 삭제 확정 뒤 제거하며 실패 시 원본 정리 대기를 명시하고 영속 재시도 기록을 유지한다. | TC-DELETE-004/005 | VERIFIED (U-ISSUES의 시험 범위) |
| FR-DELETE-005 | 최초 적용 전 등록돼 있던 모든 Version을 `1234`로 검증 가능한 salt hash로 채운다. 재실행은 미설정 행만 처리하고 신규 비밀번호를 덮지 않는다. ID·위치·순번·Current·원본 bytes/locator·설명은 유지한다. | TC-DELETE-006 | VERIFIED (U-ISSUES 운영 적용 포함) |
| NFR-DELETE-001 | 비밀번호 평문·hash·salt는 응답/DTO/HTML/로그/진단/URL/브라우저 저장소에 포함하지 않는다. 서버에서 느린 salt KDF와 일정 시간 비교를 사용하고 요청 크기·시도율·동시 KDF 수를 제한한다. 기존 인증/사용자 관리 시스템은 추가하지 않는다. | TC-DELETE-001/007 | VERIFIED (U-ISSUES의 시험 범위) |
| NFR-DELETE-002 | migration·backfill·삭제 실패 보상·승인된 정리 작업의 운영 절차, schema, 회귀 시험을 문서와 버전에 일치시킨다. 이전 앱 실행으로 비밀번호 검증이 우회되지 않도록 업그레이드 순서를 정한다. | TC-DELETE-005/006/008 | VERIFIED (U-ISSUES 운영 적용 포함) |

기존 범위 제외 중 **Version 삭제**만 이 요청으로 확장한다. Location 일괄 삭제, 비밀번호 변경/재설정 UI, Viewer/다운로드 비밀번호 보호, 로그인·소유자 권한·관리자 우회, 휴지통/복원 UI는 포함하지 않는다. 비밀번호는 삭제 확인용이며 기존 열람 권한은 그대로다.

### 2026-09-09 추가 요구 — 업로드 오류 진단 (Unit OBS)

사용자는 폐쇄망 업로드 오류 진단에 관한 앞선 조사·제안의 구현, 버전·문서 관리 및 배포를 승인했다. 목표는 신규 기능 버전 0.16.0이다. 실제 폐쇄망 장애 원인은 미재현 상태이며 이 Unit은 진단 가능성을 개선한다.

| ID | 요구사항 및 Acceptance Criteria | 관련 TC | 구현 상태 |
| --- | --- | --- | --- |
| FR-OBS-001 | 실패 화면에 안전한 요약, 상세 펼치기, 시각·앱 버전·오류 코드·HTTP 상태·요청 ID·조치 안내를 제공한다. 전체 안전 진단을 선택/복사/JSON 저장할 수 있고 Clipboard 미지원·거부에도 저장과 직접 선택이 가능하다. | TC-OBS-001/002 | VERIFIED (U-OBS-20260909) |
| FR-OBS-002 | JSON 오류, HTML·빈 응답·잘못된 JSON, 413/502/504, fetch 연결 실패를 구분한다. 서버 ID가 없으면 이를 명시한다. 응답 유실/성공 응답 해석 실패는 결과 불확실로 안내하고 목록 확인을 권하며 자동 재업로드하지 않는다. | TC-OBS-003 | VERIFIED (U-OBS-20260909) |
| NFR-OBS-001 | 서버가 요청 시작에 생성한 ID로 업로드 수신·검증·저장·DB 등록·정리 및 결과를 연결한다. 실패 단계·시간·backend와 안전한 원인/cause/stack을 서버에 기록한다. S3/정리 오류가 최초 원인 또는 확정된 등록 성공을 덮지 않는다. | TC-OBS-004–006 | VERIFIED (U-OBS-20260909 재작업 재시험) |
| NFR-OBS-002 | 화면·저장·Console은 공개 가능한 고정 필드만 출력한다. 서버도 env/인증 헤더/credential URL/SQL 본문/도면 bytes·설명·파일명·원본 locator를 기록하지 않는다. 임의 객체 직렬화 대신 원인 깊이·문자열·스택을 제한/정제한다. | TC-OBS-007 | VERIFIED (U-OBS-20260909) |
| NFR-OBS-003 | 폐쇄망 내부 stdout/stderr 및 Docker 순환 로그로 수집할 수 있다. 수집·ID 검색·컨테이너 교체 전 보관 방법과 배포 이미지/시험 결과를 문서화한다. | TC-OBS-008, TC-REL-001 | VERIFIED (U-OBS-20260909; GHCR/Compose lifecycle) |

DB schema·Current 규칙·원본 보상 정책·Viewer 범위는 유지한다. 중앙 로그 서버, 외부 수집 서비스, 오류 조회 API, 자동 재시도는 추가하지 않는다.

| ID | 제목·설명 | 우선순위 | Acceptance Criteria | 관련 TC | 구현 예정 / 상태 |
| --- | --- | --- | --- | --- | --- |
| FR-CAD-001 | DXF/DWG 로컬 파일 업로드 | P0 | 선택한 한 파일의 bytes가 원본 그대로 저장되고 Version ID를 반환한다 | TC-UP-001 | features/cad-upload, U2 / VERIFIED |
| FR-CAD-002 | 파일 유효성 검증 | P0 | 파일 누락·빈 파일·미지원 확장자·최대 크기 초과를 거부하고 실패 이유를 표시한다 | TC-UP-002 | server/services/upload, U2 / VERIFIED |
| FR-CAD-003 | 메타데이터 등록 | P0 | 사업부·사업장·동·층·등록일·Current 지정 여부를 입력하고 서버에서 검증한다 | TC-UP-003 | domain/cad, U2 / VERIFIED |
| FR-CAD-006 | 도면 설명 등록·검색 | P0 | Version별 선택 설명2000 UTF-16 code units, 앞뒤공백제거/NFC/개행보존, 기존등록빈설명호환; 목록미리보기/Viewer본문과 별도 설명부분검색·기존조건AND | TC-DESC-001–005 | Unit DESC / VERIFIED (52 unit, 4 upload E2E, typecheck/lint/build) |
| FR-CAD-004 | 파일 식별·중복 확인 | P1 | SHA-256·크기·형식·원본명·내부 저장 위치를 기록하고 동일 hash를 식별한다 | TC-UP-004 | storage/repository, U2 / VERIFIED |
| FR-CAD-005 | 저장 실패 처리 | P0 | Upload/Storage/DB 실패 시 성공으로 표시하지 않고 기존 Current를 보존하며 잔여 파일을 정리 또는 복구 대상으로 식별한다 | TC-UP-005 | upload service, U2 / VERIFIED |
| FR-LOCATION-001 | Location 식별·중복 금지 | P0 | 정규화된 네 값 조합 Unique, 별도 내부 ID; 동시 동일 Location 생성도 중복되지 않는다 | TC-DB-001 | server/repositories/cad.ts, U1 / VERIFIED |
| FR-VERSION-001 | Location별 버전 생성 | P0 | 같은 Location에 여러 Version이 존재하고 순번 중복 및 존재하지 않는 Location 참조를 차단한다 | TC-DB-002 | server/repositories/cad.ts, U1 / VERIFIED |
| FR-VERSION-002 | Current 최대 하나 | P0 | DB·Service·API·UI 모두 Location당 Current가 0 또는 1임을 보장한다 | TC-DB-003, TC-API-004 | DB/repository/Current UI, U1/U3 / VERIFIED |
| FR-VERSION-003 | Current 원자적 교체 | P0 | 새 Version 지정 시 기존 Current가 해제되고 중간 실패는 이전 상태로 돌아간다 | TC-DB-004, TC-DB-005 | server/repositories/cad.ts, U1/U3 / VERIFIED |
| FR-VERSION-004 | Current 소속 일치 | P0 | 다른 Location의 Version을 Current로 지정하는 직접 SQL 및 API 요청이 거부된다 | TC-DB-006, TC-API-004 | DB/service VERIFIED (TC-DB-006); 타 Location HTTP 요청은 추가 검증 대상 |
| FR-LIST-001 | CAD 목록 | P0 | 네 위치 값·Version·파일명·DXF/DWG·등록일·Current를 표시하고 빈 결과도 처리하며 목록에서 이전 Version을 Current로 지정할 수 있다 | TC-LIST-001, TC-LIST-004 | features/cad-list, U3/현재 UI / VERIFIED |
| FR-LIST-002 | 검색·Filter | P0 | 파일명·사업부·사업장·동·층·형식·Current 단독/조합 필터가 SQLite query로 일치 결과를 반환한다 | TC-LIST-002 | server/repositories/cad-list.ts, U3-20260908 / VERIFIED |
| FR-LIST-003 | 위치 상세·Version 선택 | P0 | Location 상세에서 버전 목록·Current를 확인하고 선택한 Version의 Viewer로 이동한다 | TC-LIST-003 | app/features / VERIFIED (U9A DXF 및 U7B DWG Version 선택) |
| FR-LINK-001 | 도면 직접 열기 링크 | P0 | 목록·Location·Viewer에서 특정 Version 절대 URL 복사, 현재 DXF renderer 보존, Clipboard 실패 시 수동 복사/열기 제공, 새 context 직접 열기 및 Current 교체 후 대상 유지 | TC-LINK-001–003 | features/cad-link, viewers/core/link, U-LINK-20260908 / VERIFIED (U-LINK-20260908: LINK 재시험3개·DWG4개 PASS; 최초 bind/시험대상 오류와 재시험 이력은 TestReport) |
| FR-FILE-001 | ID 기반 원본 조회 | P0 | Version ID로 올바른 bytes를 반환하고 없는 DB 행/파일은 404, 경로 입력은 거부한다 | TC-API-003, TC-SEC-001 | content API/storage, U2 / VERIFIED |
| FR-VIEWER-001 | Adapter 분리·형식 라우팅 | P0 | 업무/UI가 외부 API에 직접 의존하지 않고 DXF/DWG에 허용된 Adapter만 선택한다 | TC-VIEW-001 | viewers/core/selection + Manager / VERIFIED (U7B DWG query 강제 선택/형식 경계) |
| FR-VIEWER-002 | dxf-viewer 표시 | P0 | 정상 DXF가 실제 canvas에 표시되고 손상 파일은 이해 가능한 실패 상태가 된다 | TC-DXF-001, TC-DXF-002 | viewers/dxf-viewer / VERIFIED (생성 LINE/CIRCLE, U4-20260908) |
| FR-VIEWER-003 | three-dxf-viewer 표시 | P0 | 동일 DXF로 실제 렌더링이 가능하고 메타데이터/상태와 연결된다 | TC-THREE-001 | viewers/three-dxf-viewer / VERIFIED (LINE/CIRCLE/한글 TEXT, U5-20260908) |
| FR-VIEWER-004 | DXF Viewer 전환 | P0 | 페이지 전체 reload 없이 같은 Version을 양방향 전환하고 이전 자원을 해제한다 | TC-SWITCH-001, TC-SWITCH-002 | viewers/core + cad-viewer / VERIFIED (U9A: 20회 전환, 자원 수 관찰) |
| FR-VIEWER-005 | DWG 전용 처리 | P0 | libredwg-web WASM으로 직접 DWG를 읽어 표시하고 DXF Viewer 선택 및 DXF 변환 경로가 없다 | TC-DWG-001, TC-DWG-002 | viewers/libredwg-web / IN_PROGRESS (U7B 등록 Viewer LINE 표시; 전체 Entity/실도면 후속) |
| FR-VIEWER-006 | 기본 탐색 기능 | P0 | 표시·Zoom ±·Pan·Fit·Resize·재초기화·Dispose 각각을 구현하거나 미지원 근거를 기록한다 | TC-VIEW-002, TC-VIEW-003 | adapters / VERIFIED (U9A DXF/U7B DWG LINE 기본 탐색; 실도면 충실도 별도) |
| FR-VIEWER-007 | 확장 기능 평가 | P1 | Layer 조회/On-Off·Hover·Select·Entity 정보·Snap을 Viewer별 실제 지원/부분/미지원/미검증으로 구분한다 | TC-CAP-001 | adapters, TestReport / IN_PROGRESS (three Layer 0 확인; Hover/Select/정보/Snap 미실행) |
| FR-VIEWER-008 | WASM 생명주기 | P0 | 초기화·반복 Load·재진입·Memory 해제·Dispose·Browser 호환성과 오류를 검증한다 | TC-DWG-003, TC-DWG-004 | libredwg adapter/worker / IN_PROGRESS (U7B 반복/재진입/취소; 업무 파일/장기 메모리 미검증) |
| FR-ERROR-001 | 사용자 오류 처리 | P0 | 미지원 파일, Upload/DB/Storage 실패, 파일 없음, Parse/초기화/WASM 실패, 손상 DXF/DWG, 미지원 Entity를 구분하고 stack trace를 노출하지 않는다 | TC-ERR-001 | app/features / IN_PROGRESS (관리/DXF U9A, DWG/WASM U7B; 전체 Entity/revision 후속) |
| FR-UI-001 | 업무용 데스크톱 UI | P0 | 목록·등록·위치 상세·Viewer 제공; 검색/Current 식별, Metadata sidebar, Viewer 선택, 상태/크기/시간 표시 | TC-UI-001, TC-E2E-001 | app/features / VERIFIED (DXF U9A/DWG 최소 지원 범위 U7B UI 흐름) |

## 비기능·평가·운영 요구사항

| ID | 제목·설명 | 우선순위 | Acceptance Criteria | 관련 TC | 구현 예정 / 상태 |
| --- | --- | --- | --- | --- | --- |
| NFR-ARCH-001 | 단순한 계층 구조 | P0 | Next.js→Service→Domain/Repository→SQLite와 Local Storage; 불필요한 별도 Backend/Search/Queue 없음 | TC-ARCH-001 | Architecture, src / VERIFIED (계층 review U9A, 기존 구조 유지) |
| NFR-ARCH-002 | Client/Server 분리 | P0 | Production Build에서 DOM/WebGL 실행 오류가 없고 server 모듈/Secret이 client bundle에 없다 | TC-BOOT-003, TC-SEC-002 | client boundary / PLANNED |
| NFR-DATA-001 | SQLite/Prisma Schema 관리 | P0 | Migration으로 재현되며 FK/Unique/Index/Null/Default가 Database.md와 일치한다 | TC-DB-007 | prisma / VERIFIED (TC-DB-007 및 Schema 대조 U9A) |
| NFR-SEC-001 | 파일 경로 보호 | P0 | traversal·경로 형태 ID·조작된 저장 키·저장 루트 밖 symlink를 차단한다 | TC-SEC-001 | storage / VERIFIED (TC-SEC-001 traversal/symlink 회귀 U9A) |
| NFR-SEC-002 | Secret·원본 비추적 | P0 | .env 및 Credential·업로드 CAD·Runtime DB·Build/cache가 commit/push 대상과 응답/log에서 제외된다 | TC-BOOT-002, TC-SEC-002 | ignore, tooling / IN_PROGRESS |
| NFR-CONFIG-001 | 환경 설정 | P0 | 기존 Git 변수명을 유지하고 DB/Storage/Upload 제한은 앱 전용 설정으로 분리한다 | TC-BOOT-004 | config / VERIFIED (TC-BOOT-004 회귀 U9A) |
| NFR-PERF-001 | Viewer 성능 측정 | P1 | 성공/실패·load/parse/최초 표시·size·entity·error·browser를 기록하고 측정 불가 값은 사유와 null로 표시한다 | TC-MET-001 | viewers/core/metrics + UI / VERIFIED (가능 지표, U8A-20260908) |
| NFR-PERF-002 | 대형 파일·자원 평가 | P1 | 동일 조건 반복 측정, console 오류·memory·zoom/pan 반응성·반복 전환 자원 추세를 정량/정성으로 구분한다 | TC-MET-002, TC-SWITCH-002 | TestReport / IN_PROGRESS (합성 LINE 비교, 실도면 미검증) |
| NFR-FIDELITY-001 | 실제 Entity 충실도 | P0 | 제공된 Sample의 대상 Entity별 비교 근거·문제·미검증 사유를 기록한다 | TC-CAD-001 | manual evaluation / PLANNED |
| NFR-EVAL-001 | 세 기술 최종 평가 | P0 | 장단점·성능·지원/문제 Entity·대형 파일·발견 문제를 평가하고 DXF 비교와 DWG 평가를 분리한다 | TC-EVAL-001 | TestReport / IN_PROGRESS (합성 LINE 비교, 실도면 미검증) |
| NFR-TEST-001 | 단위 개발·회귀 | P0 | DB 핵심 규칙/API/Adapter 자동화 및 최소 DXF E2E, 필요한 실도면 수동 확인; 실패 미해결 시 다음 Unit 금지 | TC-E2E-001, TC-E2E-002, TC-REL-001 | tests / IN_PROGRESS (DXF U9A/DWG 최소 지원 U7B 회귀 VERIFIED; 실도면 평가 미실행) |
| NFR-DEPLOY-001 | Docker 배포와 host IP 접속 | P0 | localhost와 접근 가능한 host IP에서 앱 접속, 이름/한국어 주석을 갖춘 Dockerfile·Compose, 영속 DB/CAD, readiness, Secret 없는 image, 지정 GitHub 소유자의 GHCR 게시 및 pull 안내 | TC-DEPLOY-001–005 | Unit DEPLOY / VERIFIED (U-DEPLOY-20260908, 최종2026-09-09; TC-DEPLOY-001–005) |
| GOV-BOOT-001 | 구현 전 Bootstrap | P0 | Workspace/Git/.env 안전 조사, AGENTS/README/8종 out 문서, Unit/AC/TC 작성 후 계획 확인 전 코드 미구현 | TC-BOOT-001 | docs / VERIFIED (BOOT-20260907-01; 2026-09-07 계획 실행 승인) |
| GOV-DOC-001 | 문서 최신성·추적 | P0 | Schema는 Database가 기준, 관련 변경마다 README/상세문서/Requirement→Implementation→TC→Result 갱신 | TC-DOC-001 | docs / IN_PROGRESS |
| GOV-GIT-001 | 지정 원격·안전한 형상관리 | P0 | .env와 remote 일치, 의미 있는 Conventional Commit, 사전 diff/보안 점검, 무단 history 변경·타 원격 전송 없음 | TC-GIT-001 | Git workflow / IN_PROGRESS |
| GOV-VER-001 | SemVer·Release | P0 | src/package.json 단일 기준, 기능 MINOR/수정 PATCH; Tag 전에 테스트·문서·버전·Commit 일치 | TC-REL-001 | package, ChangeLog / VERIFIED (U9A: 기능 변경 없이 0.8.0 유지; Tag는 별도 검토) |

## 범위 제외

DWG→DXF 변환 후 DXF Viewer 사용, Geometry 수정/Line 생성/Entity 삭제/CAD 저장/도면 편집 이력, AV/DLP, 별도 검색 엔진·메시지 큐·Microservices는 제외한다. Location 삭제·메타데이터 사후 편집·권한/로그인·인터넷 공개 운영·다중 서버 배포는 요청되지 않았으므로 추가하지 않는다. 파일의 선택 Version 삭제는 Unit DELETE로 승인 범위를 확장했다. P.O.C. 대상은 기본적으로 2D 공장 Layout이며 3D/외부 참조/복잡한 Sheet 지원은 검증 결과로만 기록한다.

## 해석·기본안·확인사항

| 항목 | 분석 및 제안 | 처리 |
| --- | --- | --- |
| Bootstrap에 Next.js가 포함되는 §54 vs 최초 구현 금지 §91/100 | Unit 0A=문서, Unit 0B=사용자 확인 후 실제 환경 초기화 | ADR-001 |
| libredwg-web을 Viewer로 지칭 | 공식 패키지는 파서이다. DWG를 직접 파싱한 객체를 Adapter 내부 Three.js 렌더링 계층에서 표시하는 안 | **중요 확인**, ADR-004 |
| Current가 반드시 존재하는지 | 명시된 '최대 하나'에 따라 0도 허용; Upload의 Current 체크 기본 true, false면 기존 pointer 유지 | ADR-005 |
| CAD Version 표현과 앱 SemVer 혼동 | CAD는 Location별 자동 정수 V1/V2…, 앱은 0.x.y | ADR-006 |
| 네 위치 값의 동일성 | 앞뒤 공백 제거+Unicode NFC, 대소문자/내부 공백은 보존; '2층'과 '2F' 자동 병합 안 함 | ADR-006 |
| 등록일 | 사용자 입력 달력 날짜, 기본 Asia/Seoul 오늘; 감사용 생성/수정 시각은 UTC | ADR-006 |
| 동일 bytes 재등록 | SHA-256 일치 알림/응답 정보 제공, 새 Version 등록 허용; 자동 덮어쓰기·중복 차단 안 함 | ADR-007 |
| 파일 크기·평가 자료 | 기본 제한 100 MiB 제안, 환경변수 조정; Sample/업무 성능 목표 미제공 | 초기 구현 비차단, 실도면 최종 평가 대기 |
| 인증/운영 환경 | 단일 Node 프로세스, 사용자 요청으로0.13부터 localhost/host IP 수신; 공개 인터넷 운영/인증은 별도 범위 | ADR-009, ADR-022 |

설계 기본안은 이 계획의 확인과 함께 채택한다. 실도면/업무 성능 기준이 없으면 기술적 시험은 진행할 수 있으나 업무 적용성을 검증 완료로 선언하지 않는다.

## 원본 요구사항 범위 대응

| 원본 절 | 관리 위치/요구 묶음 |
| --- | --- |
| §0–8, 90–94, 98–102 | GOV-BOOT-001, GOV-DOC-001; AGENTS, Decisions |
| §9–13, 63–68, 96 | GOV-GIT-001, NFR-SEC-002; Operation, TestReport |
| §14–17 | FR-CAD-001–005, FR-VIEWER-001 |
| §18–26 | FR-LOCATION-001, FR-VERSION-001–004, NFR-DATA-001; Database |
| §27–28 | FR-LIST-001–003 |
| §29–38 | FR-VIEWER-001–008, NFR-PERF-001–002, NFR-FIDELITY-001 |
| §39–47 | FR-UI-001, FR-ERROR-001, FR-FILE-001, NFR-ARCH-001–002, NFR-SEC-001 |
| §48–53 | GOV-DOC-001; README, Architecture, TestPlan, TestReport |
| §54–62 | NFR-TEST-001; TestPlan, TestReport |
| §69–74 | GOV-VER-001; Decisions, ChangeLog |
| §75–82 | NFR-ARCH-001–002, NFR-CONFIG-001, FR-VIEWER-008; Architecture, Operation |
| §83–89 | NFR-TEST-001, NFR-EVAL-001; TestPlan, TestReport |
| §95, 97 | AGENTS Workflow・禁止事項, GOV-GIT-001, NFR-TEST-001 |

## 최종 완료 판정

DXF 등록→Metadata→Current→목록→검색→선택→dxf-viewer→three-dxf-viewer 전환과 DWG 등록→동일 관리 흐름→libredwg-web 표시가 실제 동작해야 한다. DB부터 UI까지 Current 규칙이 일치하고 필수 테스트·실도면 평가·문서·Commit 등 DoD를 충족해야 한다. DXF 두 Viewer의 관리→표시→전환 자동화 흐름은 U9A에서 검증했다. DWG의 평면 LINE 등록→표시 흐름도 U7B에서 검증했지만 전체 Entity·실도면 평가가 남아 있어 전체 P.O.C. 완료로 판정하지 않는다.

## 2026-09-07 실행 순서 변경

사용자가 계획 실행을 승인했다. DXF 두 Viewer와 공통 관리 기능·계측·회귀를 먼저 구현하고, libredwg-web은 그 다음 MINOR 버전으로 진행한다. DWG 선행 실험은 DXF 구현의 조건에서 제외한다. 최신 단계/승인 상태는 Decisions의 ADR-011과 TestPlan을 따른다. 기존 미실행 기록은 당시 상태이며 실제 완료 후 갱신한다.

## 후속 요청

원격 이슈 #2: 도면 등록 시 메모 입력 요청(2026-09-08 확인). 현행 메타데이터에 없는 신규 항목이며 Unit 9A 회귀 범위에는 포함하지 않았다. 후속 구현에서 길이/선택 입력/표시 위치/DB migration 및 테스트를 먼저 정의한다. 이슈는 OPEN 상태로 유지한다.

## 2026-09-08 추가 요구 — S3 호환 object storage

사용자가 SeaweedFS와 같은 S3 호환 저장소 지원을 요청했다. Local Filesystem 기본값은 유지하고 선택적 S3를 허용한다.

| ID | 제목 | 우선순위 | 설명 / Acceptance Criteria | 관련 Test | 구현 상태 |
| --- | --- | --- | --- | --- | --- |
| FR-STORAGE-001 | S3 backend 선택 | P0 | 환경변수로 endpoint/bucket/region/path-style/credentials 설정, 기존 API로 DXF/DWG 원본 저장/조회 | TC-S3-001/003 | VERIFIED / ConfiguredCadStorage/S3ObjectStorage; TestReport U-S3-20260908 |
| FR-STORAGE-002 | 기존 데이터 호환 | P0 | 새 backend 적용 후에도 기존 local/S3 locator별 조회, 자동 데이터 이동 없음 | TC-S3-001 | VERIFIED / locator routing; TestReport U-S3-20260908 |
| FR-STORAGE-003 | 원격 실패 정합성 | P0 | PUT은 DB transaction 전, overwrite 차단, DB 실패 보상 삭제, 불확실한 PUT/COMMIT 보존, 안전한 오류 | TC-S3-002 | VERIFIED / upload service/S3 adapter; TestReport U-S3-20260908 |

자동 local/S3 migration, 여러 endpoint 동시 registry, browser 직접/presigned upload, bucket 관리 UI, SQLite 자체 S3 저장은 이번 추가 요구 범위에 포함하지 않는다.


## GitHub #24 — FR-MASTER-001~007

승인 범위는 다섯 단계 기준정보 CRUD/비활성화, ID 기반 등록, 제품을 포함한 조회, 층별 Current, legacy 이관·재분류이다. 기존 네 문자열 Location 계약은 이 단위부터 ID 계층 계약으로 대체한다. 요구·수용 기준은 [Issue24](Issue24.md), schema는 [Database](Database.md)를 따른다. 구현 상태: 독립 QA 검증 완료 (root Manager의 commit/push/운영 DB 적용 전).

| 요구사항 | 내용 | 구현 | 검증 | 결과 |
| --- | --- | --- | --- | --- |
| FR-MASTER-001 | 5단계 기준정보 생성·조회·편집·비활성/재활성·안전 삭제 | MasterRepository, `/api/masters`, `/masters` | TC-MASTER-001 | PASS / 독립 QA |
| FR-MASTER-002 | 같은 활성 ID chain으로만 등록하고 변조·비활성 chain 거부 | registration domain, CadRepository transaction 검증 | TC-MASTER-002 | PASS / 독립 QA |
| FR-MASTER-003 | 층별 순번·Current 단일성·경쟁·rollback | nextVersion 및 Current 복합 FK/transaction | TC-MASTER-003 | PASS / 독립 QA |
| FR-MASTER-004 | 제품·사업장 종류 표시와 기존 이름/검색 호환, 비활성 이력 조회 | list/detail/viewer DTO와 master join | TC-MASTER-004 | PASS / 독립 QA |
| FR-MASTER-005 | legacy dedup, 미분류 생성, UUID·metadata·hash·bytes 보존과 전체 이력 재분류 | `202610150001_master_hierarchy`, reclassify transaction | TC-MASTER-005 | PASS / 독립 QA |
| FR-MASTER-006 | 부모/미분류 불변, 참조 삭제·재분류 충돌·혼합 ID 차단 | Domain/Repository 및 DB FK/Unique | TC-MASTER-006 | PASS / 독립 QA |
| FR-MASTER-007 | 관리·등록·Current·재분류 전 Browser 흐름과 기존 회귀 | master/upload UI, 별도 legacy migration E2E | TC-MASTER-007 | PASS / 독립 QA |
