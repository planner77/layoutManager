# 구현 Unit·Acceptance Criteria·테스트 계획

## #142 B2-3 — 7 Migration·CAD 무결성·Fault Injection TC (2026-10-27)

- TC-B2-3-01: 기존 활성 CAD 6 Migration SQL과 G7 quarantined 6 SQL byte 동등·후보 Auth 7번째가 활성 경로 밖임을 확인; UID/0700·0600 Guarded `prisma migrate deploy`가 별도 합성 DB에 Migration History 정확 7건 및 8 Auth Tables, SQLite Quick Check/FK=0. 이 CLI 시험과 seeded 데이터 시험은 분리.
- TC-B2-3-02: 동일 6 CAD SQL 후 Local DXF/S3-export DWG 2개 CAD Version(Current/nextVersion/SHA/Storage Path)을 합성 SQLite에 삽입하고 후보 7번째 SQL 전후 모든 CAD 7 Tables Row/Byte Hash 비교, Auth 8 Table와 Audit append-only UPDATE/DELETE 실 차단. 양성 `DISPOSABLE_SEVEN_SCHEMA_INVARIANTS_ONLY`, 실제 Site/GO false.
- TC-B2-3-03: CAD Version SHA·Current·nextVersion 수정, Local/S3 export Byte tamper, FK 위반, 누락 Auth Table/Trigger, Audit 이름만 같은 가짜 Trigger와 중간 Transaction throw·ROLLBACK → BLOCKED/ABORT. 입력에 운영 DB 경로 등 임의 필드 포함·Bytes 누락도 거부.
- TC-B2-3-04: exact G7-B2-3 no-GHCR squash 제목+15개 파일만 `publish=false`; wrong title/active Prisma·Dockerfile/Compose/Nginx·runtime API·기타 workflow 차단, 태그 정상 게시 정책 유지. 새 HEAD PR CI·Codex 결과는 실관측 전 `NOT VERIFIED`. 현장 Snapshot/OCI/Restore/Owner 수용 `NOT RUN`.

## #142 B2-2B — CadFileVersion.storagePath Unique P2 회귀 (2026-10-27)

- TC-B2-2B-07: 합성 SQLite의 `UNIQUE(storage_path)`를 유지한 상태에서 Local 1개·S3 2개 Version(각 DB Version ID/S3 Object UUID 독립, S3 locator 2개 서로 다름)과 일치하는 B2-2A Packet·S3 export Buffers → `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF`, s3BytesCompared=2, DB Version 3, 모든 출처/GO false.
- TC-B2-2B-08: 고의로 `UNIQUE(storage_path)`만 빠진 합성 SQLite의 DB Version 3개 중 S3 Version 2개가 동일 S3 locator/동일 Bytes/Hash/VersionId 사용. B2-2A Packet은 중복되지 않는 V key·Version number·객체 Claim으로 통과하지만 B2-2B는 `DUPLICATE_S3_LOCATOR/BLOCKED`, GO=false. 오류가 아닌 정상 Locator UUID 독립성은 계속 수용.
- TC-B2-2B-09: 중복 Locator를 서술할 때 Bucket/실 도면 Key/원본 VersionId를 GitHub 로그/결과에 출력 금지. 새 HEAD Typecheck/Unit/E2E/PR CI 확인 전 `NOT VERIFIED`, 실제 Source/Site 시험 `NOT RUN`.

## #142 B2-2B P2 보완 — S3 Locator 독립 매핑 회귀 (2026-10-27)

- TC-B2-2B-05: S3ObjectStorage가 사용한 `S3 object UUID`와 CadRepository가 등록한 `DB Version UUID`가 **서로 다르면서** 정규화 `s3:bucket:cad/<object-uuid>/original.dwg` Locator, DB `storage_path` 및 합성 Bytes/Hash가 일치하면 `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF` (운영 GO=false). Local은 DB Location/Version UUID 구조를 그대로 유지.
- TC-B2-2B-06: 올바른 형식이나 다른 S3 Object UUID/다른 Bucket로 잘못 매핑하면 `SQLITE_VERSION_OR_LOCATOR_MISMATCH`/BLOCKED; S3 locator 누락·미승인 URL/Local에 불필요한 S3 locator 삽입은 `INVALID_DISPOSABLE_BUNDLE`/BLOCKED. 실제 S3 GET/VersionId·Writer 정지는 시험에서 호출하지 않음.
- 적용 후 최신 HEAD Typecheck/Lint/Vitest/PR CI와 Codex P2 Resolution 별도 확인 필수. 이전 성공 Run은 새 HEAD 합격 근거가 아님.

## #142 B2-2B — Buffer-only SQLite/CAD/S3 검증 Test Cases (2026-10-27)

- TC-B2-2B-01: 정상 B2-2A 주장 Packet와 합성 실제 SQLite·Local CAD/S3 export·Marker bytes, 전체 Version/Location Current/FK/NextVersion·Hash·Size/VersionId Claim 교차대조 → `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF`. Source/site/writer/GO 검증 flags는 false.
- TC-B2-2B-02: Writer Count≠0, Epoch·Marker SNAP/VersionId 불일치, SQLite byte 변조/Hash 조작/비SQLite, Local/S3 Buffer 변조, DB current/next_version/File Size 불일치 → reason code+BLOCKED.
- TC-B2-2B-03: Version/Location private mapping 누락/중복·DB Ghost Row, FK 위반, Auth 후보 schema 혼입, 예상 밖 Secret/Path 필드 → BLOCKED. 응답에는 DB/Site ID·Byte/Path 누출 없음.
- TC-B2-2B-04: 정확 B2-2B future Squash 제목+15개 허용 파일만 GHCR publish=false. 변형 제목/비허용 active Prisma·Route·Dockerfile·Compose·workflow는 차단하며 tag는 기존 릴리스 정책 유지. 신규 CI 전 Typecheck/Lint/Unit/Build/E2E PASS는 **NOT VERIFIED**; 실 Site writer freeze 및 동일 SNAP 원본 수용은 NOT RUN.

## #142 S3-4-B2-2A — Snapshot Barrier assertion TC (2026-10-27)

- TC-B2-2A-01: 두 합성 CAD Version(Local/S3), 한 위치 Current/nextVersion, S3 versioned marker 및 하나의 `SNAP-*`/Epoch·시간 내 capture → `CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF`, 실제 Writer/Snapshot/Bytes Verified 및 GO 0.
- TC-B2-2A-02: writerCount>0, writesDuringCapture>0, lease 미표시, Source Epoch 변경, 캡처시간 범위 밖, Snapshot ID 불일치/빈 S3 marker Version → BLOCKED.
- TC-B2-2A-03: Local/S3 SHA/size/S3 VersionId 불일치, 중복 또는 orphan object, FK/Audit claim 오류, Current Owner/nextVersion 비정상, 추가 미승인 필드 → BLOCKED.
- TC-B2-2A-04: 정확 B2-2A Squash 제목+15 paths `publish=false`, 활성이관·App Route·Dockerfile/Compose/Nginx·타 Workflow 경로/제목은 차단, 릴리스 Tag는 정식 정책 유지. 새 PR CI 완료 전 PASS 미확인. 실 capture/restore E2E NOT RUN.

## #142 S3-4-B2-1 — OCI content-addressed 검사 TC (2026-10-27)

- G7-B2-1-001: 4개 합성 OCI single-platform Linux/amd64 manifest/config 원본 SHA-256 및 label/source/version/schema/role 일치 → `LOCAL_DIGESTS_MATCH_NOT_REGISTRY_PROOF`, 모든 GO/Registry/rollback 증명 필드 false.
- G7-B2-1-002: mutable :latest/tag-only, 타 Registry, 64hex digest 불일치, OCI index/다중 플랫폼 해석 전, Raw bytes 손상·Schema/Role/아키텍처 label 변경·부분 Role 누락 → BLOCKED.
- G7-B2-1-003: B2-1 정확 squash 제목+15 allowlist만 `publish=false`, 운영 Migration/Route/Compose/Dockerfile 등 경로 혼입, 유사 제목은 GHCR release scope `exit 1`, 버전 Tag는 일반 게시 정책 유지.
- G7-B2-2~B2-5: 실제 Registry 인증/서명·동일 Snapshot writer freeze·7 Migration/restore/rollback 실증 사내 전용, **NOT RUN**. 신규 B2-1 테스트도 PR CI 전 PASS 주장 금지.

## TC-VIEWER-138 — 조회/작업 창 이동과 CAD 입력 격리 (계획, 2026-10-27)

- **UNIT-138-001:** Panel registry/edge→floating, 개별 위치/Top z-order, viewport clamp/reset/resize·ESC Cancel, 새 Version 기본 위치, drag handle 이외 이벤트 무시. 시작/끝 pointer capture 및 cleanup.
- **E2E-138-001:** #26 TEXT Search 입력/결과 선택→focus/zoom을 유지한 채 검색 panel 이동; #43 Outline Tree 선택/show-hide, #40/#49 생성/편집 도구 패널 동시 열림+이동. 다른 창과 Canvas Pan/BoxSelect/Generated Translate/Undo/Layer visibility가 비의도적으로 바뀌는 경우 0.
- **E2E-138-002:** 1440×900/1366×768 데스크톱 2~3개 panel move/overlap/close/reopen/reset, 375×812/320px 단일 Drawer·touch, keyboard-only/Shift+Arrow(지원 시), Esc 단일 단계, focus, 200% zoom/resize/CSS immersive/native fullscreen. Window clamp 및 Recovery.
- **E2E-138-003:** panel 반복 이동·열림/닫힘 20회 후 `cad-canvas` DOM 및 ViewerManager identity 동일, CAD GET·parse·Worker·GPU 재생성 0, 검색 query/result/Outline Overlay/Generated history·selection/Zoom 유지. dxf-viewer/DWG capability gate 회귀.
- **정책 시험:** 향후 Viewer 독립 보조 패널 등록 시 [ViewerPanelPolicy](ViewerPanelPolicy.md)의 적용/비적용 사유 및 메뉴·Drawer 연결·AC 증거가 포함되는지 문서 리뷰 확인. 관련 #26/#40/#43/#49/#73/#82/#85/#90 회귀.
- **실행 상태:** NOT RUN — 이 계획/지침 자체가 구현·PR CI·현장 검증의 합격을 증명하지 않는다. [Issue #138](https://github.com/planner77/layoutManager/issues/138) 참조.


## #109 PR #141 — Unit 실패 및 P1/P2 보완 (2026-10-27)

- [PR CI #40444154044](https://github.com/planner77/layoutManager/actions/runs/40444154044), HEAD `b5f340e69bd28aed939bb1c443df355c1652f5bf`: Unit/Integration 404 중 5 실패, Typecheck/ESLint·Docker PASS, Build/E2E SKIPPED. 5개 공통 직접 원인: 정상 Manifest Sorted Key 기대 순서 오타→`SNAPSHOT_MANIFEST_MISMATCH`.
- [Codex P1 #4384813274](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813274) key order 수정. [P2 #4384813277](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813277) SQLite source path 재오픈 TOCTOU를 검증 Buffer→메모리 DB로 교정, [P2 #4384813278](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813278) 8개 Auth table 완전/완전부재 검사로 수정. 관련 회귀 테스트·B1 Runbook 추가. **신규 HEAD CI 전 PASS 미확인**.
- S3-4-B1은 격리 readonly/합성 clone 무결성 검사 준비이며 실제 운영 Snapshot 동시성·실 Registry OCI·실 Migration/Restore/rollback은 NOT RUN. Auth/Write/운영 SQL·Compose/Nginx·GHCR·실 DB/CAD/S3·Issue 종료 금지.


## #109 S3-4-B1 격리 복원 무결성 회귀 (2026-10-27)

- TC-S3-4B1-001: 합성 6개 CAD Migration SQLite와 실제 local DXF+S3-export DWG 바이트 SHA/길이·Version/Current FK를 readonly 검증해 ISOLATED_INTEGRITY_ONLY, 운영 GO=false.
- TC-S3-4B1-002: CAD/S3-export 파일 손상·누락·0644·symlink 등은 BLOCKED, 민감 경로/bytes 출력 금지.
- TC-S3-4B1-003: SNAP marker ID/Schema 불일치, CAD 6개↔후보 Auth 7번째 테이블 상태 불일치 및 운영 /var/lib 경로 접근은 거부.
- TC-S3-4B1-004: 정확 `G7-S3-4B1-NO-GHCR` squash subject와 15개 허용 경로만 GHCR SKIP. 운영 migration/route/Compose 및 유사 제목은 거부.
- 실제 B2 OCI Registry, 원본 동일 Snapshot writer freeze/실 Restore·Rollback 및 후보 CLI migration은 **NOT RUN**, B1 신규 PR CI 결과 전 **PASS 미확인**.


## #109 S3-4-A Codex P2 회귀 시험 (2026-10-27 KST)

- **TC-S3-4A-P2-01:** lstat/realpath 이후 0600→0644 symlink 또는 inode 변경은 같은 fd의 `fstat`·사전 `dev/ino` 체크로 거부하고, `O_NOFOLLOW`를 사용한다.
- **TC-S3-4A-P2-02:** 검사 후 pathname을 FIFO로 바꾸어도 `O_NONBLOCK`+nonregular 검증으로 CLI를 멈추지 않는다. 파싱 예외에도 descriptor를 닫는다.
- **TC-S3-4A-P2-03:** `status=['NOT_RUN']`, `['PASS']`, 객체/숫자/boolean/null은 `INVALID_CHECK`, `BLOCKED`; 정상 문자열 `NOT_RUN`만 `PENDING`.
- 이전 PR CI #40438604869 SUCCESS는 보완 전 SHA만 보증하며 새 HEAD 결과는 PENDING/NOT VERIFIED. 운영 실증 아님.


## #109 S3-4-A — OCI/Backup/Restore 증거 계약 TC (2026-10-27)

- G7-S3-4A-001: 17개 확인 항목 모두 사내 PASS 증빙 형식 완비 → `EVIDENCE_PACKET_COMPLETE_NOT_GO` + operating GO=false; **이는 실제 복구 PASS를 의미하지 않음**.
- G7-S3-4A-002: 체크 누락/NOT_RUN → `PENDING`; FAIL/CANCELLED → `BLOCKED`, completed count 거짓 증가 금지.
- G7-S3-4A-003: App/Migrator source/version/schema/digest 위조·불일치, rollback 쌍 변형·동일 forward 쌍, unknown 필드/GO 스위치 시도 → `BLOCKED`.
- G7-S3-4A-004: Restore 항목 `SNAP` 불일치, PASS에 EV·QA·UTC 누락·부적절한 시간 → `BLOCKED`.
- G7-S3-4A-005: 사내 JSON은 절대경로/UID/0600/비Symlink/저장소 외부 검증, 비공개 원문 출력 금지.
- G7-S3-4A-006: GHCR 정확 제목+한정 allowlist는 publish=false, 활성 Prisma/운영 route/Compose 혼입 및 유사 제목은 fail-closed. Tag/일반 런타임 릴리스 정책 보존.
- G7-S3-4B-001~: 실제 사내 OCI registry 조회, 후보 Migration clone FK/전후 무결성, DB/CAD/S3 같은 Snapshot 실 Restore 및 rollback App/Migrator 실증 **NOT RUN / 후속**. Unit 코드 작성 시점 CI 결과 `NOT VERIFIED`.


## Issue #109 S3-3 P2/재정렬 검증 (2026-10-27 KST)

- **G7-S3-3-STORAGE-001:** `CAD_STORAGE_PATH`가 격리 `/tmp/cad-g7-s3-*/cad`와 다르거나 S3 backend/credential이 있으면 CAD Preview 쓰기 거부; 운영 GET/Viewer는 기존 Context에서 유지. 순수 helper 검증.
- **G7-S3-3-STORAGE-002:** 테스트 로컬 `CadStorage.publish`한 CAD 바이트가 동일 root의 기존 `ConfiguredCadStorage.content`에서 정확히 반환되는지 검증.
- **G7-S3-3-SCOPE-003:** S3-3 정확 squash+허가된 `cad-preview-storage.ts` 포함 시만 GHCR SKIP, 활성 Prisma Migration·미승인 경로 및 제목 변형은 거부.
- Main 정렬 `ebc294fff35b005737cf89ebacb78420b209bd59`, 리뷰 미해결 0/behind=0. 이 목록의 새로운 HEAD Typecheck·Unit·Integration·Playwright·Docker PR CI 결과는 **NOT VERIFIED**. CI 성공 전 PASS 주장 금지.


## Issue #109 S3-3 — CAD API 권한·Audit 원자성 준비, 운영 OFF (2026-10-27)

- **기능:** 기존 CAD Multipart POST·Current PUT·Version DELETE에서 서버 DB의 최신 Session/Role/Site를 같은 Prisma Transaction 안에 재조회하고 승인된 Editor/Admin+Site만 쓰기 허용한다. DELETE는 기존 삭제 비밀번호도 요구하며, CAD DB 변경과 CAD_UPLOADED/CAD_CURRENT_CHANGED/CAD_VERSION_DELETED Audit INSERT 중 하나라도 실패하면 DB를 롤백한다. 기존 업로드 보상·삭제 Job, 익명 GET/Viewer·CAD 데이터 규약은 유지한다.
- **운영 차단:** `NODE_ENV=production`에서는 S3-3 프리뷰 활성화 불가. 정확한 S3-2 disposable DB/marker/7 migration, loopback origin, `G7_S3_AUTH_API_PREVIEW_ONLY=true`, `G7_S3_CAD_PREVIEW_ONLY=true`, `G7_AUTH_ENABLED=false`, `G7_CAD_WRITE_CUTOVER_ENABLED=false` 조건만 격리 시험 허용. 별도 Prisma Client와 0700 root 하위 로컬 CAD 저장소 이용. 운영 Migration·실 DB/CAD/S3·Compose/Nginx/.env·GHCR 게시·인증/쓰기 활성화 없음.
- **시험·잔여:** synthetic integration(Unit) 검증 코드 추가; 실제 PR CI는 시작 전이므로 결과 `NOT RUN`. 일회용 Preview Cookie의 Path는 `/api/g7-operational`이므로 다른 CAD 경로의 프로그램 시험에서는 테스트용 Cookie를 명시적으로 넘기며 운영 브라우저 인증이 활성된 상태는 아님. S3-4는 OCI/운영 Migration/실복구·신뢰 release binding, S3-5는 릴리스별 Owner GO 및 현장 수용. 기존 유사범위 PR #128은 미병합·충돌 상태이며 자동 병합하지 않는다. #109/#96 OPEN/BLOCKED.
- **후속 정확 Squash:** `#109 | S3-3 Isolated CAD write and Audit [G7-S3-3-NO-GHCR]` 및 개별 파일 allowlist만 GHCR 미게시. 내부 로그/비밀번호/IP/실 도면 반출 금지. [S3-3 Runbook](../src/deploy/g7-s3/S3-3.md).


## Issue #109 S3-2 — HTTP Response Body 중복 소비 재발방지 TC (2026-10-27 KST)

- **G7-S3-2-HTTP-010:** 인증 HTTP Fixture의 `login()`이 상태 코드·CSRF 파싱을 수행하더라도 반환되는 **원본 Response는 `bodyUsed=false`로 보존**되어야 하며 `response.clone().text()` 상태진단을 부작용 없이 수행할 수 있어야 한다. `r.clone().json()` 방식과 실제 Admin 로그인 E2E의 회귀 Assertion으로 검증한다.
- **원장 연계:** [PR CI 40394690714](https://github.com/planner77/layoutManager/actions/runs/40394690714) 실패 재현은 `tests/integration/g7-s3-operational-auth.test.ts:127:57`의 `Response.clone` TypeError이며, Typecheck/Lint PASS·Docker PASS·Unit 359/360 PASS(나머지 1건 실패)와 E2E SKIPPED를 구별한다. 수정한 HEAD의 실제 PR CI 성공을 이전 Run 성공으로 소급하지 않는다.


## #109 S3-2 — 운영 Auth/Admin 예약 API 통합·프로덕션 OFF 검증 계획 (2026-10-26)

| TC | 실제 실행 의도 | 합격 기준 |
| --- | --- | --- |
| G7-S3-2-001 | 격리 S3 후보 Prisma 7개 + 명시 Admin 최초 생성·password mustChange | 초기 암호 로그인 거부→initial-change/login 정상 |
| G7-S3-2-002 | Preview Cookie + 기존 `cad_session` 섞임·Session GET·CSRF | S3 Cookie 전용 Path, 기존 Cookie만으론 401, 정상 actor+CSRF 제공 |
| G7-S3-2-003 | Admin Role/Site grants와 Editor 자신의 Site 권한 | Editor 담당 Site 허용, 타 Site/그랜트 없는 Admin 거부 |
| G7-S3-2-004 | Admin Audit 조회와 `audit:read` 특별 Grant | 미부여 403, Grant 후 200·안전 필드/누락 Secret 확인 |
| G7-S3-2-005 | Admin 계정 disable 및 Session revoke | Disabled User의 기존 세션 401, Audit/FK 무결 |
| G7-S3-2-006 | Admin 복구 nonce 1회 재사용 차단, 이전 Session 폐기 | 복구 1회 성공/재사용 실패·Audit/G1 Session revoke |
| G7-S3-2-007 | Admin users:manage/CSRF 후 Account Create | 201, MustChange=1·Role 미부여·User+Audit 원자, CSRF 미제출 403 |
| G7-S3-2-008 | 실제 S3 Prisma candidate /tmp UID·marker/Schema·FK가 없는 경우 | 잘못된 DB·미마이그레이션/운영 경로 404 또는 503, SQL 실행 금지 |
| G7-S3-2-009 | NODE_ENV=production, G7 flag true, 타 Origin/기존 CAD route | 임의 flag에도 새 모든 API 404, 타 Origin 거부; 기존 CAD 코드 diff 0 |
| G7-S3-2-CI-001 | 정확 `#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]` 및 PR 변경 파일 | Main release-scope `publish=false` |
| G7-S3-2-CI-002 | 같은 제목 + 활성 Migration/기존 CAD/Compose/Deploy 혼입 | stderr 비허용 경로 에러·exit nonzero |
| G7-S3-2-CI-003 | S3-2 제목 변형 및 S1/S2/S3-1 제목 위장 | fail closed, 다른 GHCR 제외 우회 거부 |
| G7-S3-2-CI-004 | 정상 runtime/title 및 tag push | 기존 `publish=true` 동작 보존 |

- 시험 소스: `src/tests/integration/g7-s3-operational-auth.test.ts` 및 `src/tests/unit/g7-staging-ghcr-guard.test.ts`. 전부 **합성 일회용 SQLite와 Loopback API**. 실제 사내 PC·실 운영 Auth/DB/CAD/S3·OCI registry/복구 증거는 NOT RUN/미열람 상태를 유지하고 User의 비반출 지침을 준수한다. 신규 PR CI 실행/합격을 별도 HEAD/Run/Job 단위로 기록한다.


## Issue #57 L1 — Logger 단일화 및 무회귀 검증 계획 (2026-10-27)

| TC | 기대 | AC |
| --- | --- | --- |
| TC-L1-001 | UploadDiagnostics 동일 emitter, `LOG_LEVEL=warn` info 생략·warn/error 라우팅·requestId/schema v1/카테고리 | AC2/3 |
| TC-L1-002 | 발신자가 만든 metadata override·무허가 필드·원본 Error/stack/bytes/Locator·URL 차단, route 템플릿 | AC3/4 |
| TC-L1-003 | debug/info/pretty 한 줄·URL query 차단·복합 문자열 제한 | AC1/2/4 |
| TC-L1-004 | Health 200 debug-only, 오류 503과 동일 요청 ID | AC2/5 |
| TC-LOG-001~005, TC-OBS-001~007, TC-UP, DELETE/HEALTH | 기존 공개 DTO·X-Request-Id·업로드 first failure·compensation/cleanup·DB 기능 회귀 | AC1/4/5 |
| TC-LOG-MIG-001 | Logger의 상대 import 목록과 축소 Migrator Docker COPY closure 일치, build·CI의 read-only Node+tsx 모듈 import 검사 | AC2/5 |
| PR CI Verify/Docker | node/npm ci/db:generate→Typecheck/ESLint/Unit+Integration/Build/E2E/legacy; Migrator 파일·logger import 사전검증과 Compose 신규 설치/멱등 migration | AC5 |

실행/증거가 없는 테스트는 `NOT RUN`으로 기록. 운영 DB/CAD/Secret/원격 S3/실 LAN 검증을 이 PR로 대체하거나 추정 PASS 처리하지 않는다. [Issue57](Issue57.md), [TestReport](TestReport.md).


## Issues #124/#126/#127 검증 계획 (2026-10-26)

[Issues124-126-127](Issues124-126-127.md)의 AC→TC 표가 신규 검증 기준. 구현 전 동일 synthetic fixture의 baseline screenshot/1440×900 높이·Canvas 면적 확보, 이후 responsive·keyboard·sticky/Drawers·failure injection 및 기존 Current/list/Viewer/selection/JSON/Fullscreen 회귀. typecheck/lint/unit+integration/build/E2E/legacy·최신 PR CI와 실제 Main GHCR Pair는 각각 증거를 기록. 미실행은 NOT RUN, #113 실 CAD/GPU와 G7 운영 수용은 별도.


## Issue #109 S3-1 — Prisma Schema/격리 후보 Migration·Release/Operation 검증 계획 (2026-10-26)

| TC | 실행 범위 및 입력 | 합격 기준 |
| --- | --- | --- |
| G7-S3-001 | 현재 활성 CAD 6개 SQL과 S3 후보 6개 SQL byte equality·운영 schema Prisma models | CAD 동일, 인증 8개 모델 존재, 신규 SQL은 활성 history에 없음 |
| G7-S3-002 | Test-only Prisma CLI config로 `/tmp/cad-g7-s3-*/fixture.sqlite`에 공식 7개 migration | 성공·`_prisma_migrations` 7행, FK 0, User/Audit 표 생성 |
| G7-S3-003 | 기존 6 CAD SQL→synthetic BU/Site/Floor/Version/Current/원본 SHA/삭제 hash→신규 DDL | CAD 행/Current/Source 필드 불변, FK/타 Site FK 거부, Audit append-only trigger |
| G7-S3-004 | 신규 DDL 트랜잭션 중 오류 주입 및 잘못된 DATABASE_URL/Test flag/Auth ON 지정 | DDL Rollback과 CAD 스냅샷 복원, 잘못된 URL/설정은 Prisma SQL 사전 거부 |
| G7-S3-005 | Release capability/source/version/App+Migrator digest/Schema mismatch | RELEASE_IDENTITY_MISMATCH·인증/쓰기 eligible false |
| G7-S3-006 | Registry 검증/정식 Schema/FK 0/rollback pair/snapshot 실증 일부 미달 | RELEASE_EVIDENCE_MISSING·인증/쓰기 eligible false |
| G7-S3-007 | Owner 미서명/다른 릴리스·scope/승인 ID, 시각 만료, snapshot 불일치 | OWNER_RELEASE_SPECIFIC_GO_REQUIRED, authEligible=false |
| G7-S3-008 | flag unset/오타, Auth OFF+Write ON, 유효 가상 증거 입력 | 기본 OFF·별도 Write OFF, synthetic pass도 runtimeActivated=false |
| G7-S3-CI-001 | S3-1 정확 Squash 제목 + 코드/테스트/문서/Workflow 파일 전체 목록 | 실제 Main release-scope Bash `publish=false` |
| G7-S3-CI-002 | 활성 운영 migration/CAD Runtime/Compose/일반 Workflow 혼입, S3-1 제목 오타 | Main scope stderr 오류+nonzero, GHCR 미게시 정책 |
| G7-S3-CI-003 | S1/S2 제목으로 S3 Schema 경로, 일반 runtime/tag release | S1/S2 거부, 일반 runtime/tag 기존 publish 정책 유지 |

- **실행 범위:** CI의 Linux 일회용 DB만. 실제 운영 Schema 적용/DB/CAD/S3·서명된 OCI Registry/현장 PC·Nginx·Compose·운영 Auth 라우트 E2E는 NOT RUN, 다른 G6/S1 수용을 이번 증거로 소급 적용 불가. CI 시작=PASS 아님. 새 실패 시 실제 Run/Job/Step·HEAD/원인·조치를 [FailureLedger](FailureLedger.md)에 추가한다.



## Issue #109 / PR #129 — S2 GHCR 비게시 P1 회귀 검증 계획 (2026-10-26)

| TC | 테스트 입력 | 합격 기준 |
| --- | --- | --- |
| G7-S2-CI-001 | `#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]` 정확 제목+멀티라인 본문 및 S2 전체 변경 파일(문서/스크립트/서버/Unit/Workflow) | 실제 Main release-scope Bash `publish=false`, 종료 0 |
| G7-S2-CI-002 | 정확 제목이더라도 기존 `src/app/api/cad-files/**`, `src/prisma/schema.prisma`, `src/docker-compose.yml`, S1 전용 `g7-staging-admin.ts`/CAD service, 임의 Unit/다른 workflow 혼입 | `stderr`에 `G7-S2 GHCR exclusion disallowed path`, nonzero/결과 파일 없음 |
| G7-S2-CI-003 | 정확 제목에 접미·후행 공백·일부 글자만 허용되는 경우 | `G7-S2 exact squash subject required`, nonzero |
| G7-S2-CI-004 | 기존 S1 정확 제목+S1 테스트 파일 및 S1 제목으로 S2 파일 혼입 | 전자는 기존 `publish=false`, 후자는 S1 allowlist 거부 |
| G7-S2-CI-005 | 일반 runtime PR 제목, tag push | 기존 `publish=true` 유지; S2 no-GHCR 예외 확장 금지 |

`src/tests/unit/g7-staging-ghcr-guard.test.ts`에서 실제 workflow 스크립트를 synthetic Git diff와 실행해 검증한다. 기존 [Run 40313233131](https://github.com/planner77/layoutManager/actions/runs/40313233131) 성공은 지적 전 HEAD이며, **새 보완 HEAD의 Typecheck/Vitest/Build/E2E/Docker는 새 CI 성공 전 PENDING**. 실 사내 승인·보안 증거 원본을 공개 CI에 포함하지 않는다.


## #109 S2 비반출 증거 계약 자동검증 (2026-10-26)

- `src/tests/unit/g7-s2-readiness.test.ts`: 모든 필수 22개 증거 상태 및 참조 ID/시간 확인, 누락 시 PENDING/BLOCKED, NO_GO, Snapshot 불일치 차단, 임의 민감 필드 거부·출력 비노출, 모든 형식이 맞더라도 `operationalGo:false`를 검증.
- 별도 사내 테스트 결과·실 S3 복구·운영/기존 Multipart CAD API 인가·Audit는 아직 자동 PASS 근거가 아니며, GitHub에는 실제 원본 증거를 제출하지 않아도 된다. 상태 전용 Owner 보고로 기록하되 S3 배포 전 Gate는 별도.


## Issue #109 / PR #125 — P1 실패 재발 방지 및 Staging Prisma CLI 보호 TC (2026-10-26)

- **TC-P4-G7-CI-001:** [실패 Run 40275956996](https://github.com/planner77/layoutManager/actions/runs/40275956996) Verify의 `tests/unit/g7-staging-ghcr-guard.test.ts` Assertion은 거부 진단 메시지를 stderr로 잘못 예상한 **단일 Test 실패**. GitHub Actions stdout/stderr 구분과 Bash exit 1을 일치시키고 재검증한다. Docker Job 성공, Verify 이후 E2E skipped는 독립 상태로 유지한다.
- **TC-P4-G7-CI-002:** 승인된 squash 제목 `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]`의 **첫 줄 정확 일치** + multiline body는 skip, `... NOT-APPROVED`/`-extra`/끝 공백은 fail-closed. 다른 일반 Runtime 변경/Tag 릴리스는 현행 게시 정책 유지. 변경된 Main release-scope Bash 추출·실행 기반 Unit으로 검증.
- **TC-P4-G7-DB-001:** `npx prisma migrate deploy --config deploy/g7-staging/prisma.config.ts`는 Stage UID 임시 루트, 실제 `fixture.sqlite`, 전용 CAD Path, `DATABASE_URL=G7_STAGING_DATABASE_URL`, release manifest/schema, `G7_STAGING_ONLY`/`G7_AUTH_ENABLED`/Staging 승인 값 **전부 유효**해야 실행. 불일치/운영 DB·symlink 지정/기본값 누락시 `G7_STAGING_PRISMA_TARGET_DENIED`와 nonzero 종료, **SQL 사전 미실행/대상 파일 센티널 불변**. 정상 Stage 진입은 기존 Integration Prisma 7개 Migration 회귀.
- **TC-P4-G7-REV-001:** P1 #125 [r4374313158](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313158)/[r4374313165](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313165)/[r4374313173](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313173) 각각 코드·단위 시험·문서/원장 보완→댓글 답변·Resolved, Main behind 0/충돌 0, 수정 HEAD CI **시작**까지만 작업. 최신 CI 결과를 관측하지 않으면 PASS 주장 금지.
- **기존 운영 구분:** 신규 Stage 전용 설정/테스트와 GitHub Workflow scope만 변경, `src/prisma/**`·운영 기존 CAD API/Compose/Nginx/.env/실 DB/CAD/S3·GHCR 게시·Account/Auth 활성화 변경 0. Staging synthetic DXF/SQLite 실증은 Owner S2 Go/No-Go 대체 불가.


## Issue #109 S1 / PR #125 — 실제 CI와 잔여 TC 분리 (2026-10-26)

**근거:** 최초 HEAD `a82a04bb` [PR CI 40270394055](https://github.com/planner77/layoutManager/actions/runs/40270394055) Verify+Docker 성공. 이후 쿠키·Main release-scope guard 보완은 **수정 HEAD 재검증 PENDING**. S0의 TC-P4-G7-015 `문서-only` 조건은 실제 Stage 소스가 있는 S1에 그대로 적용 불가; **운영 Prisma/CAD API/Nginx/Compose 불변 + GHCR 제한 차단**으로 평가한다.

| TC | 기존 자동 실행에서 확인 가능한 범위 | S1 운영 수용 미검증 |
| --- | --- | --- |
| G7-001~003 | Stage flag 기본 OFF·경로/manifest 분리·잘못된 구성 거부 | 실제 OCI digest 서명·Owner GO |
| G7-004 | 합성 Stage CAD GET/원본 SHA 및 기존 전체 E2E 성공 | 실 현장 Viewer/DWG/전 버전 |
| G7-005~006 | Stage Editor+Site 등록·Current, 삭제 비밀번호 거부/허용·Audit | 기존 Multipart/Current/Delete Route 변경+실 파일 큐/보상 |
| G7-007~008 | Stage Admin 초기 변경/login/Grant와 기존 G2~G4 격리 TC | Stage 실제 Browser 8h/30m/3개/회수·Site 교차/비공개 감사 UI |
| G7-009~011 | Staging 정식 Prisma 7개 migration/SQLite snapshot Restore·FK·SHA | 실 DB+CAD+S3 일관 복원·App/Migrator 호환 rollback |
| G7-012 | #108 Owner 사내 수용 보고(원본 EV ID 미열람) | S1 Stage 신규 PC/Nginx/DEV 직접 E2E |
| G7-013~014 | Stage-only Gate·금지된 API/Audit purge 미도입 | 운영 승인/SOP |
| G7-015(S1) | 기존 운영 Source·Prisma·Compose·Nginx 불변 Git diff | Main CI GHCR Job SKIPPED 확인 전 미완 |

신규 회귀: `g7-staging.test.ts`에 Stage 전용 쿠키 이름/Path·운영 쿠키 공존·Logout을 추가. `g7-staging-ghcr-guard.test.ts`는 Git 합성 diff로 Main release-scope Bash 구문·S1 only no-GHCR·예상외 경로 거부·정상 runtime publish·docs-only skip을 시험하도록 작성. 모든 결과는 해당 HEAD CI 성공 후 판정한다.



## Issue #109 G7 S1 — Staging 구현/자동시험 추적 (2026-10-26)

- **TC-P4-G7-001~003/013~015:** `g7-staging-gate.test.ts`로 기본 OFF/오타 flag·staging-only release manifest·실 DB/Storage 경로·symlink 거부, 별도 CAD write gate를 검사. PR diff는 운영 `src/prisma/**`/기존 CAD API/Compose/Nginx/.env 변경 **0**을 확인해야 PASS.
- **TC-P4-G7-004~011:** `g7-staging.test.ts`가 정식 Staging Prisma migrate deploy, 최초 Admin·비밀번호 변경/로그인 세션/Grant, Editor+Site DXF 업로드·익명 GET·Current·삭제 암호 AND, DB Audit 원자성/SQLite FK, backup/restore 후 bytes·SHA 동등성을 시험하도록 설계. Staging JSON/base64 DXF 미러 API는 기존 Multipart Upload와 다른 진입점이므로 실 업무/API cutover 동등성을 선언하지 않는다.
- **TC-P4-G7-012:** 사내 PC 2대·PROD Nginx/DEV direct·실 S3/DB·CAD 및 원시 Restore 로그는 #108 Owner 보고 수용(세부 비공개 증거 ID 독립 미열람); 본 S1 CI의 synthetic staging 시험과 별개.
- `src/deploy/g7-staging/prisma/schema.prisma`/7 migration을 현재 운영 DB에 적용하는 명령은 테스트에 포함시키지 않는다. Secret 파일, 실제 CAD/S3 URL·내용은 Git/CI 저장 금지. 실패는 Run/Job/HEAD/원인/조치로 [FailureLedger](FailureLedger.md)에 누적. 테스트 코드 작성만으로 PASS 불가.


## Issue #109 G7 — 기본 OFF·Owner GO·실복구 운영 검증 계획 (2026-10-26)

**현재 TC-P4-G7-001~015 전부 G7 범위에서는 NOT RUN / #109 OPEN-BLOCKED.** #108 G6은 Owner 현장 시험 정상 보고로 CLOSED/COMPLETED이나 비공개 개별 시험 로그·증거 ID는 여기서 독립 확인되지 않았다. 본 G7 TC 목록의 별도 통합/운영 수용을 자동 PASS로 처리하지 않는다. 시험 작성과 실행은 구별한다. #108 G6 현장 evidence와 Owner 별도 승인 없이 운영 기능 활성화 테스트를 실 DB에서 수행하지 않는다.

| TC | 합격 기준 | 책임 |
| --- | --- | --- |
| TC-P4-G7-001 | G7 미탑재/flag 미설정/false/오타: 보호 API와 write cutover OFF·익명 CAD GET 유지 | G7 구현 CI |
| TC-P4-G7-002 | Owner 승인/고정 App+Migrator digest/Schema 불일치라도 true flag는 fail-closed | G7 구현 CI |
| TC-P4-G7-003 | 유효한 이중 게이트+`G7_AUTH_ENABLED`·별도 `G7_CAD_WRITE_CUTOVER_ENABLED` 모두 true에서만 각 단계 ON | G7 구현 CI |
| TC-P4-G7-004 | 기존 사내 익명 목록·위치·Version·Current·Viewer·원본 GET/download 회귀 0 | G6/G7 E2E |
| TC-P4-G7-005 | POST/Current 인증 Editor+Site 성공, 익명/Reader/타 Site/무Grant Admin 거부 | G6/G7 E2E |
| TC-P4-G7-006 | Version DELETE Editor+Site AND 기존 비밀번호, 원본/Current·Audit 원자성 | G6/G7 E2E |
| TC-P4-G7-007 | Admin 단발/복구, 8h 절대·30m idle·최대 3개 세션·disable/revoke·Cookie | G6/G7 E2E |
| TC-P4-G7-008 | Role/Site/Version Grant 회수, Audit append-only/365일·`audit:read`/`logs:read` 분리·Secret 비로그 | G6/G7 DB |
| TC-P4-G7-009 | 같은 snapshot ID SQLite 안전 backup+CAD local+S3 manifest, 정식 migration 격리 dry-run | G6 실복구 |
| TC-P4-G7-010 | FK/Unique·원본 bytes/SHA/Version/Current/delete hash 불변, 장애 시 실행 중단 | G6/G7 DB |
| TC-P4-G7-011 | 구 App·신 Schema 혼용 금지, 구 호환 pair+동일 DB/CAD/S3 실 Restore·쓰기 유실 처리 | G6/G7 rollback |
| TC-P4-G7-012 | 사내 PC 2대 Windows/WSL2 Nginx PROD + DEV direct 업무 Viewer/업로드/세션 정상 | G6 현장 |
| TC-P4-G7-013 | G0~G6 HEAD/Run/Job·사내 증거 ID+Owner GO/NO-GO·release digest/담당·범위 정합 | G7 운영 |
| TC-P4-G7-014 | #98/#83/#65/#60 신규 영속 API 익명/자동 공개 0, Audit purge 미승인시 0 | G7 회귀 |
| TC-P4-G7-015 | 현재 문서 PR 변경 파일 Markdown 한정, `src/**`/Prisma/Nginx/Compose/.env/GHCR·실 데이터 변경 0 | PR diff |

Owner R1에서 제외한 침투·적대적 공격/탈취 실증은 새 필수 게이트로 요구하지 않는다. 정상 로그인·권한/감사/업무 무결성·실복구는 필수. 모든 실제 시험은 HEAD/Run/Job/비공개 증거 ID와 [TestReport](TestReport.md)에서만 PASS 판정. [Issue109](Issue109.md).


## Issue #108 / G6 — 자동 증거 점검과 현장 수용의 독립 TC (2026-10-26)

| ID | 시험 및 합격 기준 | 검증 범위 |
| --- | --- | --- |
| TC-P4-G6-001 | G6 필수 19종 중 하나라도 NOT_RUN이면 PENDING, 허위 PASS 불허 | g6-evidence Unit |
| TC-P4-G6-002 | G7 운영 기능 OFF 필수. READY_FOR_OWNER_REVIEW는 PASS/Owner 서명 아님 | g6-evidence Unit |
| TC-P4-G6-003 | DB/local CAD/S3/dry-run/restore 동일 snapshotId, 각 PASS의 사내 EV ID 및 FK/Version/Current/SHA 불변 | g6-evidence Unit |
| TC-P4-G6-004 | 실제 PROD PC 2대 상이한 clientId, DEV 분리 및 동일 App/Migrator SemVer. 현장 Viewer/Upload/Cookie/인가 시험은 별도 | g6-evidence Unit + 사내 NOT RUN |
| TC-P4-G6-005 | FAIL/CANCELLED/임의 필드/비밀값이 PASS가 되지 않고 정해진 사유 코드만 출력 | g6-evidence Unit |
| TC-P4-G6-006 | 사내 manifest는 저장소 밖 절대경로·정상 파일만 허용, symlink/checkout 경로 거부 | g6-evidence Unit |
| TC-P4-G6-007 | CAD 여섯 기존 Migration→두 합성 Version/Current+local CAD/mock-S3 SHA→SQLite online backup/파일 복사→별도 G1 fixture migration·FK/CAD row 불변→손상 주입/실 복원·bytes 동일 | disposable Integration, 실제 S3/DB NOT RUN |
| TC-P4-G6-LAN-001 | 사내 PC 2대 Nginx→App 실 Viewer/기존 익명 CAD GET·등록/Current/다운로드, DEV 직접/데이터 분리, 승인된 격리 Auth/Cookie/업무 Role/Scope와 호환 | 실 현장 NOT RUN |
| TC-P4-G6-REC-001 | **실제** DB/CAD/S3 동일시점 snapshot·실 S3 bytes, 격리 Prisma dry-run/FK/Unique/Current, 실제 restore 및 이미지/DB rollback | 사내 별도 승인, NOT RUN |

[TestReport](TestReport.md)는 코드 작성과 실제 Typecheck/Lint/Unit/E2E/Docker/현장 실행을 구분한다. 미관측 결과를 PASS로 표시하지 않고, #109 별도 Owner Go/No-Go 및 운영 OFF 유지. [Issue108](Issue108.md).


## Issue #106 / PR #120 — CI 최초 실패 및 Site Audit P1 회귀 확대 (2026-10-26)

- **TC-P4-G4-SETUP-001:** 기존 실제 CAD Migration `uq_site_parent_name(product_id,name)`과 합성 Site `Site-a`/`Site-b`의 동일 Product 독립 명칭이 충돌하지 않고 G4 `beforeEach`가 끝까지 실행되는지 확인. 성공은 CI에서 실제 재실행해야 판단.
- **TC-P4-G4-001 보강:** 인증된 Reader의 Version-a 허용 성공 Audit `site_id=site-a,target_kind=VERSION,target_id=version-a`, Editor의 Version-b 권한 거부 Audit `site_id=site-b`, 익명은 Actor를 생성하지 않는 401. Site가 Admin에게 자동 허용되지 않는지 유지.
- **TC-P4-G4-005 보강:** Outline Create/Edit/Delete 안전 Audit는 각각 원천 Version→DB Site `site-a`, Revision `NULL→1→2→3`, immutable CreatedBy, 성공/거부/충돌의 원자성을 검증한다.
- **TC-P4-G4-009 보강:** G1 AuditEvent SQL CHECK는 LOGIN_DENIED 같은 비-Scope action에 Site 강제 금지, Outline 사건 Site 누락 거부, DB에 없는 Site FK 거부; Site Grant affected_user_id 필수 및 append-only, UTC/365일 cutoff 유지.
- **추적:** 최초 Run `40252656906` Verify 9개 실패/288개 PASS는 [FailureLedger](FailureLedger.md), 실제 결과는 [TestReport](TestReport.md). 수정 뒤 Typecheck/Vitest/Docker/E2E는 새로운 HEAD로 확인하기 전 PENDING. 실 LAN/G7 API 연결은 NOT RUN. 신규 운영 Prisma/DDL/Compose 활성화 금지.


## Issue #106 G4 — 인가·Grant·Audit 격리 시험 (2026-10-26)

TC-P4-G4-001: Reader/Editor/Admin Site/Version Matrix·없는 Version·익명 401/403. 002: Admin만 Grant 부여/회수, 동시 Role/Site·즉시 재검증. 003: Admin+audit:read 및 Admin+logs:read 분리. 004: 실제 SQLite 두 연결 BEGIN IMMEDIATE/BUSY/Unique. 005: 가상 ShadowOutline Create/Edit/Delete, Generated ID/Revision CAS/CreatedBy 불변·CAD snapshot. 006: 주입 Audit 장애 시 Grant/계정/Outline 원자 Rollback. 007: Account disable과 Session 전량 revoke·마지막 Admin 차단. 008: 정상 Origin/Session CSRF·Client Header/Actor claim 불신·민감정보 비로그. 009: Audit FK/append-only/UTC/365일 cutoff·운영 Prisma OFF.
환경: 기존 CAD Migration을 재현한 G1 guarded disposable SQLite와 G4 Store. Typecheck/Lint/Vitest/Build 및 기존 CAD E2E/CI Docker는 실제 실행 증거가 있을 때만 PASS. 실제 업무 CAD POST/Current/Delete API 통합·삭제 암호 AND, #98 Outline CRUD, 실 LAN Nginx/PC·운영 DB/S3 복구는 G6/G7에서 별도 검증. [Issue106](Issue106.md).


## Issue #105 G3 — 로그인·만료·회수·Actor 검증 (2026-10-26)

[Test Case/AC 단일 목록](Issue105.md)의 **TC-P4-G3-001~012**를 사용한다. AC1=로그인/초기 변경·401/403(001~003), AC2=hash·8h/30m·원자 3개(004~006), AC3=logout/password/disable/recovery(003,007~008), AC4=현재 DB Actor(009), AC5=정상 cookie/proxy/DEV/guard(010~011), AC6=격리·기존 CAD/API 회귀(012)다. 실제 두 SQLite 연결 경쟁·credential 검증 후 계정 변경·Audit 실패 rollback을 포함하며 단순 count 모의로 대체하지 않는다.

환경은 기존 CAD migrations+G1 일회용 SQLite와 실제 G2 서비스, 합성 계정/도면이며 운영 데이터/Secret을 쓰지 않는다. 최신 Typecheck/Lint/Unit·Integration/Build/관련 E2E와 CI Docker/Migration을 확인한다. 로컬 실행·CI 시작·CI 성공·실 LAN/복구 증거를 구분하고 미실행은 NOT RUN으로 남긴다. 기존 CAD 익명 조회 및 Current/Version/SHA·삭제 비밀번호 회귀를 유지한다. 상세 실제 결과는 TestReport, 관측 CI 실패는 FailureLedger에 기록한다.

## Issue #104 G2 — Admin·Secret·Nonce 검증 계획 (2026-10-26)

**테스트 환경:** 기존 CAD 6개 migration → disposable G1 `cad-auth-g1-*/fixture.sqlite` → #103 G1 SQL → #104 명시 서비스. 운영 Prisma/Runtime 연결 없음. 작성 시점 Typecheck/Vitest/Docker NOT RUN.

| TC | AC | 검증 범위 |
| --- | --- | --- |
| TC-P4-G2-001 | AC1/4 | OFF 상태 implicit 생성/Secret 접근/Audit 없음 |
| TC-P4-G2-002 | AC1 | 두 flag 동시 ON, 잘못된 username/경로/requestId 거부 |
| TC-P4-G2-003 | AC1 | missing·0644·symlink·CRLF·짧은 Secret 실패/원문 로그 0 |
| TC-P4-G2-004 | AC1/2 | User/Admin Role/Audit, scrypt/must-change·재기동 ID/Hash/Role 불변 |
| TC-P4-G2-005 | AC2 | 동시 최초 생성 2건 중 단 1회만 commit |
| TC-P4-G2-006 | AC2/4 | 첫 생성 중 장애 롤백 후 재시도 정상 |
| TC-P4-G2-007 | AC3 | ACTIVE Admin 단발 nonce·세션 revoke·Audit, replay 거부 |
| TC-P4-G2-008 | AC3/4 | 복구 중 장애 nonce/hash/session/audit rollback |
| TC-P4-G2-009 | AC2/4 | 기존 일반 User 승격 금지, CAD baseline FK/운영 Prisma 불변 |

PR 검증: 최신 HEAD typecheck/lint/unit/integration/build/E2E/Docker; 운영 `src/app/api/**`/`src/prisma/**`/`src/server/db.ts`, Compose/Nginx/.env/CAD/Viewer/GHCR diff 0. 미실행은 PASS 금지; 현장 Backup/Restore는 #108, Owner 운영 승인은 #109. [Issue104](Issue104.md).

**TC-P4-G2-SYNTAX-001 (CI 실패 재발 방지):** G2 recovery/replay 테스트의 `.get(adminId)?.password_hash` 및 `.get(adminId)?.revoked_at` optional chaining 표현식은 올바른 구문이어야 하며 PR CI `npm run typecheck`를 첫 게이트로 확인한다. Typecheck 실패 시 하위 Lint/Unit/Integration/E2E를 `SKIPPED`로 기록한다. 최초 CI 실패 및 후속 HEAD 재검증은 [FailureLedger](FailureLedger.md) 참조.

## Issue #102 G0 — Owner 6개 업무 정책/후속 게이트 검증 (2026-10-25)

[Issue102](Issue102.md)/ADR-051-R1은 사내망 **기존 공개 CAD 익명 GET 허용**, `Current PUT=Editor 이상+담당 Site`, `Version DELETE=Editor 이상+담당 Site+기존 비밀번호`를 승인했다. 관리자 담당자/Owner 역할 분리, Audit 만료 후 정리 원칙은 승인하되 백업/물리 정리 SOP는 후속 확정, 등록 POST 권한은 Editor 이상+담당 Site Owner 승인. **현재 배포에서 로그인/권한 기능이 활성화되었다는 뜻이 아니다.**

| TC ID | 확인 내용 | 실행 단계/현재 상태 |
| --- | --- | --- |
| TC-P4-G0-BIZ-001 | 승인 정책 표·AGENTS·ADR-051-R1·Issue102·#96~#109 정합성. 공개 CAD GET만 익명, 신규 영속/로그/감사 API 익명 확장 0 | G0 문서 정적 검토 / NOT RUN |
| TC-P4-G0-BIZ-002 | 기존 목록·위치·Current/Version·Viewer·원본 GET/다운로드를 **익명으로** 정상 조회, Reader/SiteGrant가 불필요하며 익명 Actor 위조/신규 영속 익명 조회 없음 | G5/G6 / NOT RUN |
| TC-P4-G0-BIZ-003 | **G7 이후 목표:** Current 변경은 Editor/Admin+담당 Site 허용, 익명·Reader·타 Site/권한 없는 Admin 거부, Current 0~1개 유지 | G4/G6 / NOT RUN |
| TC-P4-G0-BIZ-004 | **G7 이후 목표:** 삭제는 Editor/Admin+담당 Site+기존 삭제 비밀번호 AND. 암호만/범위만/인증만/타 Site 각각 실패, 승인된 삭제 성공 및 Actor/Audit·Current·SHA 회귀 | G4/G6 / NOT RUN |
| TC-P4-G0-BIZ-005 | 지정 운영 담당자의 Admin 단발 초기화/복구·재기동 불변, Owner 책임/SOP 기록, Secret 미출력 | G2/G6 / NOT RUN |
| TC-P4-G0-BIZ-006 | Audit 365일 경계, 미만 보존·이후 정리 대상 분류. Backup/Restore 후 만료 기록·예외 처리 정책 승인 전 **purge 미실행** | G4/G6/G7 / NOT RUN |
| TC-P4-G0-BIZ-007 | **G7 목표:** `POST /api/cad-files`는 인증 Editor/Admin+담당 Site 성공, 익명·Reader·타 Site 거부, Actor/Audit·원본/Current·기존 API 동작 보존 | #106/#108 / NOT RUN |
| TC-P4-G0-BIZ-008 | **문서 전용 변경**(AGENTS/ADR/Issue102 등), Source/API/Prisma/Compose/Nginx/.env/운영 볼륨 변경 0, 동일 HEAD CI·미해결 리뷰·충돌 확인 | PR diff/CI / NOT RUN |

**수용 구분:** G0 AC1은 5개 Owner 정책 명세와 후속 위임이 문서화됐는지 평가, AC2는 앞서 승인된 HTTP 위험 범위 결정(보안 시험 PASS 아님), AC3은 docs-only/OFF, AC4는 최신 HEAD PR CI·리뷰·병합 근거 필요. G0 문서 승인 자체는 G2~G7 실제 업무 E2E/배포 PASS를 의미하지 않는다.


## Issue #107 G5 — 최종 자동 테스트 수용·현장 인계 (2026-10-26)

| 시험 | 최종 실행 판정 |
| --- | --- |
| TC-P4-G5-001/002 | PROD Nginx/DEV direct 정적 설정·볼륨 분리, PR #115 HEAD `44132fcaa31a` [CI #40224438075](https://github.com/planner77/layoutManager/actions/runs/40224438075) SUCCESS |
| TC-P4-G5-003/004/007 | Health·목록·실제 Version Viewer URL 정규 요청/거부 경계 Unit, 동일 CI SUCCESS |
| TC-P4-G5-005/006 | PR diff 및 Owner R1 문서·운영 OFF 검증 완료; GHCR `v0.40.4` App/Migrator [Main CI #40225537167](https://github.com/planner77/layoutManager/actions/runs/40225537167) 게시 Step SUCCESS |
| TC-P4-G5-LAN-001 | **NOT RUN**. Windows Nginx/WSL2, 사내 PC 2대, 실 업무 Viewer·Upload·Download·Cookie는 G6 #108 현장 검증으로 인계 |

- 이전에 작성된 원 계획표의 `NOT RUN/CI 대기`는 해당 작성 시점의 역사적 기록이며 위 최종 실행 결과로 판정한다. Main CI/GHCR 성공이 실제 운영 인증 활성화 또는 Backup/Restore 수용은 아니다.


## Issue #103 — 최초 실패 재발 방지와 P1 추적 (2026-10-26)

- `TC-P4-G1-SYNTAX-001`: PR Verify `npm run typecheck` 및 Docker baseline Next build의 **동일 HEAD** 성공 필요. 최초 실패 `store.ts:134 TS1002` 후속 TS1005/TS1128 재발 없어야 함. 수정 후 아직 **NOT RUN**.
- `TC-P4-G1-005` 강화: Site grant/revoke Audit에 `actor_user_id`(관리자), `affected_user_id`(대상 사용자), `site_id`(업무 Site), action/requestId가 보존돼야 한다. **서로 다른 사용자에게 동일 Site를 부여·철회한 후 grant 행이 없어져도** 누가 영향받았는지 추적 가능해야 하며 `affected_user_id/site_id` 누락 SQL INSERT는 실패해야 함. FK·append-only 원자성 보존.
- 미실행 단계(Unit·Integration·Build/E2E/Docker smoke)는 첫 CI 실패의 `SKIPPED`를 그대로 기록하며 수정 HEAD의 실행 확인 이후에만 PASS 가능. 운영 `src/prisma/schema.prisma`/migrations·API 변경 0 유지.



## Issue #103 / G1 — 격리 DB·원자성·복구 Test Matrix (2026-10-25)

모든 TC는 기존 6개 CAD Migration의 실 SQL과 합성 Version/Current/SHA를 일회용 SQLite에 적용하고 **운영 연결 0**. 테스트 위치 `src/tests/integration/auth-g1.test.ts`. 미실행은 `NOT RUN`, PR CI 최신 HEAD 결과를 따로 검증하기 전 PASS 기록 금지.

| Test ID | 검증 내용 | 근거 AC | 계획 상태 |
| --- | --- | --- | --- |
| TC-P4-G1-001 | Migration 장애 주입 rollback, 기존 CAD 스냅샷 불변, FK, 중복 DDL 거부·격리 경로 Guard | AC1/3/4 | NOT RUN |
| TC-P4-G1-002 | User ID 불변/login unique(정규화), Role/Site/SpecialGrant FK·Unique·CHECK | AC1/2 | NOT RUN |
| TC-P4-G1-003 | 8h·30m·3 active, 4번째 app/direct SQL 거부, 실패 주입 rollback, 원시 토큰 DB 없음 | AC2 | NOT RUN |
| TC-P4-G1-004 | 두 SQLite writer/BEGIN IMMEDIATE lock 충돌이 fail closed | AC2 | NOT RUN |
| TC-P4-G1-005 | Role/Site/SpecialGrant+Audit atomic commit/rollback, duplicate/권한 거부, Audit UPDATE/DELETE 거부 | AC2 | NOT RUN |
| TC-P4-G1-006 | 실제 DB Version→Floor→Building→CadSite+Reader Site grant, Admin 무범위 거부 | AC1/2 | NOT RUN |
| TC-P4-G1-007 | 비활성 계정+세션 회수+Audit 원자 처리, 실패 복원/재로그인 거부 | AC2 | NOT RUN |
| TC-P4-G1-008 | nonce hash unique 1회, 암호 변경·세션 폐기·Audit rollback, 원문 미저장 | AC2 | NOT RUN |
| TC-P4-G1-009 | 중단(quiesced)된 합성 DB/local/S3-mirror 일관 백업→격리 G1 dry-run→손상 주입→복원, 기존 Current/SHA/delete hash 불변 | AC3 | NOT RUN |

추가 PR 정적 Diff 확인: `src/prisma/schema.prisma`, `src/prisma/migrations/**`, `src/app/api/**`, `src/server/db.ts`, Runtime/Compose/Nginx/실 CAD/S3 변경 0; 새 G1 파일은 tests/fixtures·tests/integration·docs에 한정. 실 운영 DB/CAD/원격 S3 복구·실 LAN E2E 및 Owner 운영 승인은 **#108/#109 NOT RUN**. 관련 [Issue103](Issue103.md), [TestReport](TestReport.md).


## Issue #107 / G5 — 비운영 PROD Nginx·DEV Direct 시험 계획 (2026-10-25)

**Owner R1 우선:** 정상 연결·업무 기능 검증만 G5 필수; TLS/WAF/CIDR·CSRF/Host/Forwarded 공격 우회·탈취/침투 실증은 비범위. 보안 기능 PASS 주장 없음. [Issue107](Issue107.md).

| TC | 점검 내용 | 방법/상태 |
| --- | --- | --- |
| TC-P4-G5-001 | PROD Nginx만 host publish, Proxy Upstream/Host·body limit 전달 | Vitest 정적 계약 + CI Docker Compose config; 새 HEAD 결과 전 NOT RUN |
| TC-P4-G5-002 | DEV 직접 host port와 PROD/DEV 데이터 볼륨·net 독립, 운영 volume 재사용 0 | Vitest 정적 계약 + CI Compose config; 결과 전 NOT RUN |
| TC-P4-G5-003 | Health 200/status ok, Home HTML, CAD list JSON, font 200, 선택적 Viewer/content 경로 | Mock Vitest + 실제 Preview CLI; 원 HEAD CI SUCCESS, 리뷰 보완 HEAD 결과 대기 |
| TC-P4-G5-004 | Health 503·비정상 응답을 성공으로 보지 않음 | Mock Vitest; 결과 전 NOT RUN |
| TC-P4-G5-007 | --version-id에서 실제 /cad/versions/:versionId/viewer 검증, 관리 화면 false PASS 방지, 명시 ID 불일치 시 네트워크 전 거부 | Unit 보강 / 수정 HEAD CI 미확인 |
| TC-P4-G5-005 | src/docker-compose.yml/.env·Prisma·API·운영 Nginx·원본 데이터 변경 0 | GitHub PR changed-file diff 검사 예정 |
| TC-P4-G5-006 | Owner R1/익명 CAD GET 최신 업무 정책, 미실행 현장·Cookie·업로드 E2E 기록 | docs+Issue cross-check; G3/G6 실증 NOT RUN |
| TC-P4-G5-LAN-001 | 조직 내 PC 2대 PROD Nginx→App, Viewer·등록/다운로드/Current·Cookie(후속 G3), DEV 분리 확인 | **G6 사내 현장/일회용 데이터에서만** 수동 시험, NOT RUN |

- CI 검증은 Docker Compose **config-only**(profiles g5-prod/g5-dev)와 Vitest Mock이다. Docker Preview 실제 실행/Upload/Windows Nginx·WSL2/실 PC 연결·DB/CAD/S3 복구 수용을 자동으로 PASS 표시하지 않는다.
- G5 결과는 #108 G6에 인계. #109 G7 Owner 별도 승인 전 운영 Auth/관리/영속 API/Prisma·Nginx·Compose 활성화 금지.


## Issue #102 / ADR-051-R1 — 보안 강화 비범위와 기능/운영 수용 시험 (2026-10-25)

**정책:** HTTP와 계정/세션 탈취·공격 방어 관련 위험은 Owner가 `OWNER_ACCEPTED_SCOPE`로 결정했다. 이는 시험 성공이 아니라 해당 *공격 전용 대응/침투 실증을 완료 게이트에서 제외*한 기록이다. 기존 비활성 Auth helper 및 기존 작성된 단위테스트를 제거하는 지시가 아님. [Issue102](Issue102.md).

| 시험/검토 ID | 검증 대상·수용 기준 | 최초 상태 |
| --- | --- | --- |
| TC-P4-G0-R1-001 | G0 정책/위험 수용 범위, PROD Nginx/DEV direct, 업무 미확정, ADR·이슈 일치 | 문서 작성 / NOT RUN |
| TC-P4-G0-R1-002 | Markdown-only diff, 기존 API/SQLite/CAD/Prisma/Proxy/Docker/GHCR 변경 0 | PR diff 검토 / NOT RUN |
| TC-P4-G5-R1-001 | PROD Nginx 정상 진입·Upstream/Health/Viewer/업로드, 개발 App 직접 접속·데이터 분리 | G5 현장·격리 / NOT RUN |
| TC-P4-G3-R1-001 | 정상 login/logout/세션 8h·30m·3개·회수·계정 상태 기능 | G3/G6 / NOT RUN |
| TC-P4-G4-R1-001 | Reader/Editor/Admin·Site/Version 업무 권한 허용/거부, Audit 원자성·365일 | G4/G6 / NOT RUN |
| TC-P4-G6-R1-001 | 실제 내부 PC 업무 E2E·기존 API 호환, DB/CAD/S3 동일시점 backup→격리 migration→실 Restore | G6 / NOT RUN |
| TC-P4-G7-R1-001 | G1~G6 기능·운영 증거, 별도 Owner 활성화 Go/No-Go, 런타임 기능 기본 OFF | G7 / BLOCKED |

**필수 게이트에서 제외:** TLS/MFA/SSO, 공격자 기반 Host/Origin/Forwarded 위조·브루트포스·CSRF 공격 모의, 패킷 도청/세션 탈취 시험, 취약점/침투 테스트, 별도 보안 위험 실증. 과거 `TC-P4-D1-014` 등의 목록에 포함된 공격 실증은 R1에서 요구하지 않으며 DB 원자성·업무 허용/거부·백업/복구 부분은 유지. 정상 Proxy/Origin/Cookie 호환과 기존 API 회귀는 필수.
**상태 규칙:** 실행되지 않은 테스트를 PASS로 기록하지 않는다. 본 PR은 문서 전용이며 운영 서비스/Schema/로그인·관리 API는 OFF다.


## Issue #99 / PR #110 — P1 Symlink 경로 회귀 및 GHCR 0.40.3 게이트 (2026-10-25)

| TC | 검증 목적 | 상태 |
| --- | --- | --- |
| TC-P0P5-PATH-001 | 승인된 repo 외부 실제 파일+기존 사내 출력 폴더에서 1회 `wx` 쓰기·재쓰기 거부 | Unit 작성 / 수정 HEAD CI 필요 |
| TC-P0P5-PATH-002 | 외부 입력 파일 symlink가 repo 내부 DXF를 가리키면 realpath 차단 | Unit 작성 / 수정 HEAD CI 필요 |
| TC-P0P5-PATH-003 | 외부 출력 디렉터리 symlink/junction이 repo 내부를 가리키면 차단 | Unit 작성 / 수정 HEAD CI 필요 |
| TC-P0P5-PATH-004 | 기존 결과 파일·dangling symlink 파일 덮어쓰기 금지 | Unit 작성 / 수정 HEAD CI 필요 |
| TC-P0P5-PATH-005 | 프리플라이트 이후 parent symlink 교체는 저장 직전 차단 | Unit 작성 / 수정 HEAD CI 필요 |
| TC-P0P5-PATH-006 | 상대 경로·미생성 출력 부모 폴더 거부 | Unit 작성 / 수정 HEAD CI 필요 |
| TC-P0P5-REL-001 | package/lock root `0.40.3` 일치, 기존 `v0.40.2` 이동/덮어쓰기 없음 | 정적 확인 / 실제 GHCR 게시 대기 |

- 사전 PR CI HEAD `6377426`: [40195335561](https://github.com/planner77/layoutManager/actions/runs/40195335561) Verify/Docker 2 Job 성공. P1 리뷰 발견 이후 변경된 HEAD의 성공으로 간주하지 않는다. 실 설비 DXF 사내 검증/실 GPU 수용은 여전히 NOT RUN.
- 경로 관련 E2E 테스트를 실행할 때는 부모 폴더가 **사전에 존재**하고 전용 ACL로 보호되어야 한다. 보고서는 자동 폴더 생성/기존 JSON 덮어쓰기 없이 사내에 신규 생성. 애플리케이션 정상 배포 시 GHCR App+Migrator immutable 버전 쌍은 Main push에서만 검증.


## Issue #99 — 현장 실 DXF 매핑·GPU 성능 수용 시험 계획 (2026-10-25)

**증거 구분:** Unit/PR CI는 합성 검증 전용. 사내 승인된 원본 DXF·CAD 정답값·외부 장비 계측·Owner SLA는 미입력. 현장 AC 4개는 전부 **BLOCKED / NOT RUN**.

| TC | 입력/검사 | 코드/사내 시험 상태 |
| --- | --- | --- |
| TC-P0P5-001 | 최소 3개 다른 SHA 실제 승인 Source audit/browser report, 1k/10k/100k, Browser 5회; 완전하면 READY_FOR_OWNER_REVIEW (PASS 아님) | Unit 작성 / NOT RUN |
| TC-P0P5-002 | Owner 오차/SLA 누락, 승인 누락, 3종/규모 부족을 BLOCKED | Unit 작성 / NOT RUN |
| TC-P0P5-003 | 승인 SHA, source audit SHA, browser SHA, 파일 크기, 복제 SHA 불일치 차단 | Unit 작성 / NOT RUN |
| TC-P0P5-004 | SOURCE-only schema 아닌 synthetic/범위 외 규모 및 임의 입력 차단 | Unit 작성 / NOT RUN |
| TC-P0P5-005 | Browser 5회 미달·JS console/page 오류·box/load/frame/heap p95 SLA 초과 | Unit 작성 / NOT RUN |
| TC-P0P5-006 | 원본 CAD WCS/면적 오차·SourceRender 매핑·BLOCK/OCS/Handle/곡선/Holes·미검증 Matrix 차단 | Unit 작성 / NOT RUN |
| TC-P0P5-007 | GPU 사용/VRAM 외부 확인 누락, 8개 UI 동작·Worker cancel·CPU budget·Browser heap 초과 차단 | Unit 작성 / NOT RUN |
| TC-P0P5-008 | null/손상 schema는 BLOCKED, PASS 반환 경로 없음 | Unit 작성 / NOT RUN |
| TC-P0P5-REAL-01 | 승인 실 DXF 3종: WCS 좌표·면적·BLOCK/OCS, SHA/unique Handle, 1:N/N:1, 원본 미지원 제외/정합성, 외부 CAD 기준 독립 검증 | **FIELD NOT RUN** |
| TC-P0P5-REAL-02 | 독립 Browser 5회/각 규모: mouse click/box, layer, zoom/pan, ESC/fullscreen, Worker cancellation, render mapping, errors, heap, rAF frame/interaction p50/p95 | **FIELD NOT RUN** |
| TC-P0P5-REAL-03 | 브라우저/드라이버/CPU/GPU/VRAM/OS 환경 기록, 외부 GPU Utilization/VRAM, Owner SLA 사전 확정·초과 판정 | **FIELD NOT RUN** |
| TC-P0P5-REAL-04 | 작업 DB/Storage isolation, 서명·비공개 반출 통제, 5회 이상 반복 결과 보존, Owner Signoff·실 데이터 복구/폐기 | **FIELD NOT RUN** |

- 코드 변경 영향 PR CI: `npm run typecheck && npm run lint && npm test && npm run test:outline-benchmark && npm run build && npm run test:e2e` 및 기존 Legacy/Docker, 가능하면 신규 HEAD만 판정. **비공개 실 DXF 테스트는 GitHub CI에 넣지 않음**. 새로운 `npm run verify:outline-acceptance -- /private/manifest.json`은 승인 자료 보유 PC에서만 실행하며 이유 코드 이외 민감한 원본·SHA를 stdout에 출력하지 않는다.
- 허용 오차(0.02 Drawing Unit)는 기존 서버 Geometry 분해 tolerance일 뿐 **현장 WCS/면적 정확도 Owner SLA로 임의 대체하지 않는다**. rAF WebGL identity도 GPU 이용률 근거로 전용하지 않는다. [Issue99](Issue99.md), [ADR-052](Decisions.md), [Operation](Operation.md).


## Issue #96 D1~D6 — 비활성 인증 모듈 검증 계획 (2026-10-25)

**전제:** Owner 정책 승인, 운영 API/DDL/배포 미승인. 아래 Unit은 src/tests/unit/auth-foundation.test.ts 및 auth-password.test.ts에서 **작성**되었으나 CI 이전 실행 결과는 NOT RUN.

| TC | 목적 | 상태 |
| --- | --- | --- |
| TC-P4-D1-003 | Reader/Editor/Admin, SiteGrant와 DB 신뢰 Version→Site, 타 사이트·없는 Version deny | 코드 작성 / NOT RUN |
| TC-P4-D1-004 | Admin도 Site 자동 접근 금지, audit:read/logs:read 독립, Memo Editor 쓰기 거부, 비활성/암호교체 필요 상태 거부 | 코드 작성 / NOT RUN |
| TC-P4-D1-005~007 | .env 기본 비활성, bootstrap 최초 1회, 기존 Admin 재시작 보호, secret 경로 검증, 복구 nonce 반복 거부 | 코드 작성 / NOT RUN |
| TC-P4-D1-008 | 무작위 세션/digest, 절대 만료 8h·유휴 30m·동시 3개/폐기/HttpOnly/SameSite/HTTP Cookie | 코드 작성 / NOT RUN |
| TC-P4-D1-009~010 | 세션 귀속 CSRF+trusted Origin fail-closed, 같은 계정·peer 5회/60초 로그인 예산 | 코드 작성 / NOT RUN |
| TC-P4-D1-011 | Audit allowlist fields/immutable UTC/revision, Secret 제외·365일 보존 계산, 자동 파기 없음 | 코드 작성 / NOT RUN |
| TC-P4-D1-012 | 비밀번호 최소 8자(Unicode), bounded scrypt salt/검증, 원시 암호 및 손상 hash 거부 | 코드 작성 / NOT RUN |
| TC-P4-D1-013 | diff에 API Routes/Prisma schema+migration/Docker+Compose, CAD Source/SHA/Current/Version 변경 0 확인 | PR 정적 검토 / NOT RUN |
| TC-P4-D1-014 | 실제 DB 원자 세션 발급 3개·회수/복구 nonce, Audit append-only, Proxy/CIDR/Origin/CSRF, 백업→마이그레이션→복구, 실 LAN E2E | 운영 게이트 / BLOCKED |
| TC-P4-D1-015 | Typecheck/Lint/Vitest/Build/Playwright/Legacy/Docker PR CI | 이전 HEAD d85ee35 Run 40190126225 Verify+Docker SUCCESS; #97 main 통합 HEAD 재검증 대기 |

- 로그인 실패 limiter는 단일 프로세스 참조 구현일 뿐 여러 replica/worker 보호 근거가 아님; 실제 DB·네트워크·보안 시험은 별도 운영 활성화 게이트에서 필요하다.
- 미실행을 PASS로 기록하지 않는다. 현재 운영 DXF·Current/Version/Origin·기존 GET/API 권한 동작 보존, 비밀번호·세션/Geometry는 CI Artifact에 기록하지 않는다. [Issue96](Issue96.md), [TestReport](TestReport.md).



## Issue #97 / PR #100 — GHCR 패치 발행 및 HEAD 동일성 게이트 (2026-10-25)

| TC | 기대 | 상태 |
| --- | --- | --- |
| TC-P4-D2-REL-001 | `package.json`과 lock root version 모두 `0.40.2`, 기존 `v0.40.1`을 이동/덮어쓰기 하지 않음 | 정적 변경 / 신규 HEAD CI NOT RUN |
| TC-P4-D2-REL-002 | Version bump HEAD PR CI에서 Typecheck/Lint/Unit/Build/E2E/Legacy/Docker Runtime 성공, review 0/behind 0 | 신규 HEAD CI 대기 |
| TC-P4-D2-REL-003 | Main push에서 `0.40.2` 신규 태그 + app/migrator Pair 후보 digest 검사 후 GHCR 공개 alias 게시, Main CI 실행 기록 | 병합 전 NOT RUN |
| TC-P4-D2-REL-004 | D1/D3 Auth/API/Prisma migration/원본 CAD 변경 없음, 실도면 #99/실 운영 배포 미수용 유지 | PR diff 검토 |

- [과거 `0.40.1` GHCR 정상 게시 Main 40184907533](https://github.com/planner77/layoutManager/actions/runs/40184907533); 해당 릴리스 이미지 존재는 #97 코드가 게시되었다는 의미가 아님. 새 PR CI 및 실제 GHCR 결과를 혼용하지 않는다.

## Issue #97 — P4-D2 Source Canonical/Translate/Rotate 서버 검증 (2026-10-25)

| TC | 검증 내용 | 상태 |
| --- | --- | --- |
| TC-P4-D2-001 | 기존 source canonical JSON v1/v2·type null 호환, 원본 Geometry 보존 | CODED / NOT RUN |
| TC-P4-D2-002 | root INSERT WCS 변환 + unique Stable Handle + explicit empty instancePath. 위조·nonempty child path 거부 | CODED / NOT RUN |
| TC-P4-D2-003 | SHA/Version/INSUNITS/고정 tolerance/중복·없는 Handle 거부 | CODED / NOT RUN |
| TC-P4-D2-004 | unsupported OCS, partial/mixed BLOCK의 stable ref 전체 거부 | CODED / NOT RUN |
| TC-P4-D2-005 | Translate→Rotate pivot 합성; 독립 Browser GeneratedDocument affine/GeoJSON 결과 비교, server-owned base/final | CODED / NOT RUN |
| TC-P4-D2-006 | PRECISE Polygon/MultiPolygon/Hole의 ring/winding/area 유지 | CODED / NOT RUN |
| TC-P4-D2-007 | Raw-only matrix, scale/shear/mirror/Z, 미지원 명령/속성/행렬 불일치 거부 | CODED / NOT RUN |
| TC-P4-D2-008 | 조작 base/final Geometry, NaN/Infinity, >64 연산, WCS overflow, tolerance 위조 거부 | CODED / NOT RUN |
| TC-P4-D2-009 | 원점 1e9 주변 유효 소형 WCS Polygon/CONVEX·CCW 회전 재계산 | CODED / NOT RUN |

- 권장 실제 실행: `cd src && npm ci && npm run db:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run test:master-migration`; 기존 Docker PR Job 및 WCS/source mapping 회귀를 모두 유지한다. 이 원격 connector 작업에서 로컬 test suite는 **NOT RUN**. CI 성공/실DXF 수용/실 GPU는 별도 증거로만 PASS 판단한다.
- D2는 Server Storage accessor/HTTPS/Auth/Prisma/Migration/HTTP API가 없는 순수 함수이므로 실제 불변 Storage 조회·권한/RBAC·CAS 동시편집·감사/복구 통합은 #96/#98 이후, 실도면 3종 및 1k/10k/100k GPU/성능은 #99에서 검증한다. [Issue97](Issue97.md), ADR-050/049.

## Issue #31 P4-D0 — Owner 정책/문서 정합성 테스트 계약 (2026-10-25)

**범위:** Markdown-only Owner 설계 확정, 테스트 *계획* 정의. 아래 실제 API·브라우저·DB·HTTP LAN 운영 검사는 D1~D6 구현 전 **NOT RUN / BLOCKED**. D0 PR CI 시작/성공으로 운영 수용 PASS 기록 금지. 근거 [ADR-048/049](Decisions.md), [Issue31](Issue31.md).

| TC | 수용/검증 조건 | 단계/상태 |
| --- | --- | --- |
| TC-P4-D0-001 | Issue31/ADR/DB/Architecture/Requirements/AGENTS/Operation에 앱 로컬 계정·HTTP LAN·HTTPS 미사용·OIDC 미사용 일치, 기존 역사 기록에 우선순위 명시 | D0 문서 리뷰 |
| TC-P4-D0-002 | Global OutlineType 하나만 존재, 사이트 별 타입 테이블/unique scope key 미사용; 권한 없는 타입 관리 403, Site Scope 외 조회 금지 | 설계 리뷰; 서버 시험 BLOCKED |
| TC-P4-D1-001 | 안전한 서버 소유 HttpOnly/SameSite 세션, 암호화되지 않은 HTTP 위험 고지, Token/계정 위조·허용 외 LAN 대역·반복 로그인 방어; CSRF/Origin·서버 로그아웃 | D1 구현 후; NOT RUN |
| TC-P4-D1-002 | Reader/Editor/Admin 및 Site/Version 매핑: 다른 Scope·임의 X-User/Role·삭제 비밀번호는 조회/쓰기 권한이 되지 않음; `logs:read` 별도 | D1/#60 후; NOT RUN |
| TC-P4-D2-001 | 불변 DXF SHA+Stable Handle+BLOCK instancePath 정상/위조·누락·중복·불일치 검증, 기존 server-owned 0.02 WCS tolerance 재계산 | D2 후; NOT RUN |
| TC-P4-D2-002 | baseGeometry + Translate/Rotate 강체 Transform만 서버 계산. client result 조작·scale/shear/reflection/Z/nonfinite 값 거부, Polygon/MultiPolygon/Hole 불변 | D2 후; NOT RUN |
| TC-P4-D3-001 | 같은 Scope 내 다른 Editor가 외곽선 수정 가능·createdBy 유지·updatedBy 변경, 다른 Site 거부; revision 경쟁 1 성공/1 409, 부분 쓰기 없음 | D3 후; NOT RUN |
| TC-P4-D3-002 | 외곽선 논리 삭제 후 일반 목록/선택/Export 제외, Audit/UUID/Revision 유지. 물리 삭제 및 복구 API는 정책 미정 상태에서 차단 | D3 후; NOT RUN |
| TC-P4-D3-003 | 독립 사용자 세션 A 숨김·B 표시: 공유 CadOutline/Revision/타 사용자 화면 변경 없음. Renderer/Layer/Tree 복원 회귀 | D3/#73 후; NOT RUN |
| TC-P4-D4-001 | 전역 타입 2종 + 같은 Kind 별도 typeId, active 비활성 참조 보존, 타입 이름·정규화 unique 글로벌 검증 | #65/#71/#73 후; NOT RUN |
| TC-P4-D5-001 | Generated soft-delete와 연결 CadMemo BROKEN_ANCHOR/마지막 WCS/참조 해제가 단일 DB transaction, 메모 유실/자동 재바인딩 0 | #83/#84 후; NOT RUN |
| TC-P4-D5-002 | 삭제 메모의 최초 작성자·본문 유지, 메모 공동 편집은 별도 미승인으로 구현되지 않음 | #83/#84 후; NOT RUN |
| TC-P4-D6-001 | SQLite migration/backup/foreign_key_check/restore, 신구 앱 pair 복구 및 무권한 direct URL 거부 | P4 운영 전; NOT RUN |
| TC-P4-D6-002 | 승인된 실DXF 3종, OCS/BLOCK 및 1k/10k/100k Browser/GPU/Worker·입력 지연 기록; synthetic과 운영 실측 구분 | P0/P5 현장; NOT RUN |

**D0 정적 검사:** 변경 파일이 `.md`로 한정되는지, 신규 API/Prisma/Migration/Workflow·GHCR 설정이 없는지, Issue #31이 OPEN/Closes 문구 없음인지, ADR 번호·선행 참조와 docs-only CI scope가 맞는지 확인한다. 문서 PR은 PASS 증거가 확인되기 전까지 미검증으로 기록한다.


## Issue #93 / v0.40.1 — Current 기본·전체 버전 검색 토글 회귀 (2026-10-25)

| TC | 연계 AC | 시나리오 / 기대 결과 | 상태 |
| --- | --- | --- | --- |
| TC-LIST-093-001 | 1,2,5,6 | 모드 미지정/current=true → Current-only, versions=all 및 레거시 홈 current=false → 전체 조회. 공용 listQuery(current=false)는 non-Current 유지. 검색·pageSize/2페이지 링크 보존 | 작성 / **NOT RUN** |
| TC-LIST-093-002 | 6 | versions 중복/미지원/빈값, versions=all+current=true, current 중복/잘못된 값은 Invalid Query | 작성 / **NOT RUN** |
| TC-LIST-093-003 | 1~4,8 | 서로 다른 층의 Current 미지정 Version 및 최신 비Current 포함 전체 수·Current count 비교. Current 재지정 뒤 홈 결과 전환·과거 이력 보존·이전 파일명 검색 | 작성 / **NOT RUN** |
| TC-LIST-093-E2E-001 | 1~4,6~8 | 기본 ON, OFF로 V1/V2/V3·미지정 층 4건 노출, 이전 버전 filename 검색, 레거시 URL/외부 API 의미 분리, Current 지정·삭제 뒤 반영 | 작성 / **NOT RUN** |
| TC-LIST-093-E2E-002 | 4~6 | versions=all+위치/형식/pageSize=1 → 페이지 1/2와 이전/다음 URL, 브라우저 Back/Reload, 이전 버전 description-only 검색·ON 빈 결과·초기화 Current | 작성 / **NOT RUN** |
| TC-E2E-001 / Upload | 2,7~9 | 기존 전체 등록→Current 교체→홈에서는 기본 현재만, 홈 OFF에서는 과거 행 + 링크/Current 지정 경로 노출. 기존 두 DXF Viewer 및 업로드 계약 회귀 | 기대 변경 작성 / **NOT RUN** |
| 기존 TC-LIST-003/004/009, API/Link/Master/삭제/Version | 6~9 | 공용 current=false 의미, Current 최대1개/수동 승격, 번호/원본 조회/상세/다운로드 및 UI 필터 상호 운용 | 회귀 재실행 예정 / **NOT RUN** |
| Typecheck / Lint / Vitest / Build / Chromium E2E / Legacy migration / Docker | 9 | Node 22.14/Prisma locked deps 및 기본 CI 전 단계 검증. 실패 Run/HEAD·조치/검증을 원장과 함께 기록 | **NOT RUN** |

- `DESIGN.md` 부재: 설계 기준은 `out/Architecture.md`, `out/Decisions.md`의 ADR-034-R1.
- 실제 실행: `cd src && npm ci && npm run db:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run test:master-migration`. 독립 PR Docker/CI도 저장소 정책대로 확인하되 사용자는 이번 요청에서 **PR CI 시작까지만**, 모니터링 불필요로 지정.
- 코드/테스트 작성은 수용 검증 성공으로 표시하지 않는다. [Issue93](Issue93.md), [TestReport](TestReport.md).


## Issue #76 — GitHub Squash 기본 메시지 관리자 정책 및 진단 (2026-10-25)

| TC | 조건 | 기대 / 실패 분류 | 실행 현황 |
| --- | --- | --- | --- |
| TC-CI-76-001 | API `true / PR_TITLE / BLANK` fixture | `PASS`, Summary PASS, CI 정상 진행 | 로컬 Bash fixture PASS |
| TC-CI-76-002 | API `true / COMMIT_OR_PR_TITLE / COMMIT_MESSAGES` fixture | warning + `NOT APPLIED`, CI 진단은 non-blocking; 관리자 승인 **미완료** | 로컬 Bash fixture PASS, 실제 REST 불일치 확인 |
| TC-CI-76-003 | 잘못된 JSON/배열 fixture | warning + `NOT VERIFIED`, 잘못된 응답을 PASS로 처리 금지 | 로컬 Bash fixture PASS |
| TC-CI-76-004 | REST GET 실패 | warning + `NOT VERIFIED`, 다른 앱 CI 방해 금지 | 설계/셸 분기 검사; CI 미실행 |
| TC-CI-76-005 | 관리자 설정 변경 + 새로운 PR squash | GET 3항목 PASS, main commit subject 단일행/body 빈 문자열, `MAIN CI | #N | 설명` | **BLOCKED: 관리자 설정 미적용** |
| TC-CI-76-006 | PR CI YAML diff 및 GHCR scope | 기존 trigger/permissions/concurrency/Typecheck·Docker·GHCR 의사결정 불변, docs/workflow-only Main은 GHCR SKIP | 정적 확인, PR CI 미실행 |

- Bash `set -euo pipefail` 구문 점검과 REST 응답 mock 분기는 별도로 확인한다. GitHub Actions Runner의 실제 output 및 적용 후 Main title은 원격 workflow/run 증거가 있어야 PASS이다. 설정 불일치는 CI 자체 실패가 아니므로 FailedLedger에 가짜 Failure로 기록하지 않는다. [Issue76](Issue76.md).

### Issue #54/#76 최신 main 통합 검증 (2026-10-25)

- 원본 수정 HEAD `6845c4b4`의 PR CI #40181171710 성공은 확인했다. #76 비차단 읽기 전용 CI 진단 추가 및 문서 병합 결과의 새 HEAD CI는 별도 검증 대상. TC-E4-E2E-001~004/#31·#51·#52·#53/Docker/Legacy를 유지하며 #76의 관리자 설정 미적용은 앱 CI 실패로 오인하지 않는다.

## Issue #76 — GitHub Squash 기본 메시지 관리자 정책 및 진단 (2026-10-25)

| TC | 조건 | 기대 / 실패 분류 | 실행 현황 |
| --- | --- | --- | --- |
| TC-CI-76-001 | API `true / PR_TITLE / BLANK` fixture | `PASS`, Summary PASS, CI 정상 진행 | 로컬 Bash fixture PASS |
| TC-CI-76-002 | API `true / COMMIT_OR_PR_TITLE / COMMIT_MESSAGES` fixture | warning + `NOT APPLIED`, CI 진단은 non-blocking; 관리자 승인 **미완료** | 로컬 Bash fixture PASS, 실제 REST 불일치 확인 |
| TC-CI-76-003 | 잘못된 JSON/배열 fixture | warning + `NOT VERIFIED`, 잘못된 응답을 PASS로 처리 금지 | 로컬 Bash fixture PASS |
| TC-CI-76-004 | REST GET 실패 | warning + `NOT VERIFIED`, 다른 앱 CI 방해 금지 | 설계/셸 분기 검사; CI 미실행 |
| TC-CI-76-005 | 관리자 설정 변경 + 새로운 PR squash | GET 3항목 PASS, main commit subject 단일행/body 빈 문자열, `MAIN CI | #N | 설명` | **BLOCKED: 관리자 설정 미적용** |
| TC-CI-76-006 | PR CI YAML diff 및 GHCR scope | 기존 trigger/permissions/concurrency/Typecheck·Docker·GHCR 의사결정 불변, docs/workflow-only Main은 GHCR SKIP | 정적 확인, PR CI 미실행 |

- Bash `set -euo pipefail` 구문 점검과 REST 응답 mock 분기는 별도로 확인한다. GitHub Actions Runner의 실제 output 및 적용 후 Main title은 원격 workflow/run 증거가 있어야 PASS이다. 설정 불일치는 CI 자체 실패가 아니므로 FailedLedger에 가짜 Failure로 기록하지 않는다. [Issue76](Issue76.md).

### Issue #54 P1 리뷰 대응 — 임계값 이전 Wheel/Resize Cancellation

| TC | 기대 결과 | 검증 상태 |
| --- | --- | --- |
| TC-E4-E2E-004 | 선택된 GENERATED 경계 pointerdown 5px 미만 → wheel zoom → 25px move/up에서 Ghost 및 Document 변경 없음, Undo0, JSON 불변, 기존 선택 유지 | 코드 추가 / 수정 HEAD CI NOT RUN |
| TC-E4-E2E-004 | 선택된 GENERATED 경계 pointerdown 5px 미만 → native viewport Resize → move/up에서도 위 결과 동일 | 코드 추가 / 수정 HEAD CI NOT RUN |
| 기존 E4-E2E-003 및 #31/#51/#52/#53 | 정상 Ghost→단일 Commit, ESC 취소, 원본/영역 선택/Undo 회귀 | 최초 HEAD CI SUCCESS; 수정 HEAD 재검증 필요 |

[기존 성공 CI #40177837419](https://github.com/planner77/layoutManager/actions/runs/40177837419)는 `2f57a642`에서 Verify·Docker 성공이며 새 코드까지 검증한 것은 아니다.


## Issue #54 / E4 v0.40.0 — WCS 이동·그룹 드래그 수용 검사 (2026-10-25)

| Test Case | AC | 검증 내용 | 현재 |
| --- | --- | --- | --- |
| TC-E4-UNIT-001 | AC1/4 | strict ΔX/ΔY 수치(+3,-5/.5/지수), empty/NaN/Infinity/0/1e12 상한, Preview bbox overflow | 코드 작성 / NOT RUN |
| TC-E4-UNIT-002 | AC1/2 | (10,20)→(13,15), 다중 같은 delta, Polygon/MultiPolygon/Hole, bounds·stroke hit·metadata/UUID·UndoRedo 1단계 | 코드 작성 / NOT RUN |
| TC-E4-UNIT-003 | AC1/3 | SOURCE/혼합/중복/다른 SHA/없음/hidden/invalid 전부 거부, Document·History 무변경 | 코드 작성 / NOT RUN |
| TC-E4-UNIT-004 | AC2/3 | staged preview 0 history, ESC/cancel 0 history, pointerup 1단계, 중간 선택 변경 atomic fail | 코드 작성 / NOT RUN |
| TC-E4-E2E-001 | AC1/2/4 | 합성 DXF에서 다중 수치 +3/-5, Tree/JSON geometry, Undo/Redo 동일 복구, mm 단위 표시 | 코드 작성 / NOT RUN |
| TC-E4-E2E-002 | AC3/4 | invalid numeric/mixed SOURCE/Pan 거부, Reload/미지원 Renderer 제한 | 코드 작성 / NOT RUN |
| TC-E4-E2E-003 | AC2/3 | 이미 선택한 외곽 경계 5px Ghost, ESC 취소→History0, pointerup→History1, Canvas↔WCS displacement | 코드 작성 / NOT RUN |
| Regression | AC3/4 | 기존 #17/#25/#26/#31/#38/#39/#40/#42/#43/#51/#52/#53 및 Worker/Legacy, WCS/Zoom/Layer/Source 안전성 | NOT RUN |
| 현장 | AC2/3/4 | Native Fullscreen·Touch/pointercancel 브라우저별 실기기, GPU 회수·고 DPI·대형/실 DXF, DWG 비지원 | NOT RUN |

- 실행 게이트: `cd src && npm ci && npm run db:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run test:master-migration`. 사용 가능한 원격 GitHub connector는 코드 변경/PR CI 트리거만 지원하며 본 세션 container checkout은 DNS 문제로 불가. 수행하지 않은 검증은 PASS 아님.
- 관련 근거: [Issue54](Issue54.md), [TestReport](TestReport.md), [ADR-047](Decisions.md).

## Issue #53 / E3 v0.39.0 — 삭제 편집 AC 검증 (2026-10-25)

| Test Case | AC | 검증 목표 | 현재 |
| --- | --- | --- | --- |
| TC-E3-UNIT-001 | E3-AC1/2 | 생성 3개 중 1개 Delete, 잔여 순서/UUID/기하 불변, Undo/Redo 원래 metadata·transform 복구 | 코드 작성 / NOT RUN |
| TC-E3-UNIT-002 | E3-AC2 | 선택 2개 다중 Delete 1회 이력, Confirm 취소 무변경, Undo/Redo, 삭제 ID 재사용·새 객체 중복 거부 | 코드 작성 / NOT RUN |
| TC-E3-UNIT-003 | E3-AC3 | SOURCE/혼합/중복/없는 UUID/다른 Version/SHA/숨김 대상 차단, Document/History 무오염 | 코드 작성 / NOT RUN |
| TC-E3-UNIT-004 | E3-AC2/3 | 확인창 열림 중 대상 selection·legacy local ID·명칭·visible 변경 시 stale commit 거부 | 코드 작성 / NOT RUN |
| TC-E3-UNIT-005 | E3-AC4 | Canvas focus, plain Delete/Backspace, input/search/contenteditable·modifier/repeat/defaultPrevented 격리 | 코드 작성 / NOT RUN |
| TC-E3-E2E-001 | E3-AC1/2 | 합성 DXF 외곽선 3개, Tree 단일 삭제/취소/Undo/Redo, JSON/Canvas count 정합, 재생성 unique local ID | 코드 작성 / NOT RUN |
| TC-E3-E2E-002 | E3-AC2/4 | Tree 다중 선택 2개 삭제 취소/Confirm, Esc dialog 시 선택 2개 보존, Backspace Canvas focus, input native key, 마지막 빈 Tree | 코드 작성 / NOT RUN |
| TC-E3-E2E-003 | E3-AC3/4 | SOURCE+GENERATED 혼합·Pan 삭제 차단, 선택된 Generated hit context menu, reload/Renderer 전환에서 임시 개체 해제 | 코드 작성 / NOT RUN |
| 회귀 | E3-AC3~5 | #17/#25/#26/#31/#38/#39/#40/#42/#43/#51/#52 Unit/E2E/Legacy, #31 원본 SHA·Current 불변, 세션 재로드 | NOT RUN |
| 현장 | E3-AC4 | Native Fullscreen OS/browser 조합, GPU 메모리 장기 사용·실 DXF·DWG 비지원, JSON canonical/P4 보안 | NOT RUN |

실행 도구 기준: `cd src && npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run test:master-migration`. 현재 연결 환경에 실행 가능한 repository checkout이 없어 **이 테스트들을 아직 실행하지 않았다**. CI는 PR 생성으로 시작만 하고 결과 모니터링하지 않는다. 상세 [Issue53](Issue53.md)/[TestReport](TestReport.md).


### Issue #67 / PR #80 — Python audit 조기 구문 검사 및 크기 분기 테스트 (2차 CI 실패)

- [Run 40171968883](https://github.com/planner77/layoutManager/actions/runs/40171968883) Docker [121104610668](https://github.com/planner77/layoutManager/actions/runs/40171968883/job/121104610668): `TC-IMG67-002/003` 앞 Python import SyntaxError 1건; 실제 layer hash/새 Compose **SKIPPED**. Python `py_compile`을 baseline Docker 빌드 **전에** 추가.
- `TC-IMG67-003B`: 실제 duplication transition + 동일 비압축 size → FAIL; baseline/new 이미 deduplicated + equal size → PASS, 단 native SHA/optimized no-dup 검사는 반드시 PASS. 새 Synthetic Unit 작성 / 수정 HEAD CI 미확인.


## Issue #67 — PR #80 P1 리뷰: 이미 deduplicated 기준선의 후속 CI 안전성

| TC | 기대 | 검증 단계 |
| --- | --- | --- |
| TC-IMG67-002A | 이전/새 package SHA/native 동일, **둘 다 baseline duplicate 0개**면 정상 PASS | Python 합성 fixture; 새 HEAD CI 대기 |
| TC-IMG67-002B | baseline duplicate 0개여도 optimized에 같은 package가 두 번 쓰이면 FAIL | Python 합성 fixture; 새 HEAD CI 대기 |
| TC-IMG67-003A | 실제 duplicate가 **있던** 전환에서는 positive saving 의무. 이전부터 duplicate가 없었다면 baseline/new size 동일도 허용, delta 정보 표시 | Python+Docker CI; 새 HEAD 대기 |
| TC-IMG67-006A | 두 경우 모두 native .node, 전체 SHA256/UID/SQLite·Docker Compose/API·Browser/Legacy 성공 강제 | 전체 Verify/Docker CI; 새 HEAD 대기 |

- 최초 [Run 40170910369](https://github.com/planner77/layoutManager/actions/runs/40170910369), `6a35660`은 Verify/Docker SUCCESS이며 새 P1 수정 HEAD PASS를 대신하지 않는다. 원인 [리뷰 4369963432](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432). [FailureLedger](FailureLedger.md).


## Issue #67 — 웹 Standalone 중복 copy layer 정밀 검증 (2026-10-25 / v0.38.1)

| TC | Acceptance | 자동 검증 기준 / 증거 | 상태 |
| --- | --- | --- | --- |
| TC-IMG67-001 | Web native 단일 전달/기존 계약 | Vitest가 Standalone COPY+extra SQLite COPY 제거, native `.node` 검사 및 `require` 메모리 DB smoke, Next externalPackages/trace glob, `node server.js`, USER cad를 확인 | 코드 작성 / **NOT RUN** |
| TC-IMG67-002 | 거짓 중복/손상 안전 차단 | Python synthetic Docker TAR fixture: 두 개의 동일 native/JS package layer→하나의 package layer; SHA 불일치, 잘못된 누락/비중복 주장, optimized 중복 잔존을 reject | 코드 작성 / **NOT RUN** |
| TC-IMG67-003 | 실제 중복 SHA/bytes·history | PR base와 current Dockerfile의 동일 소스, Node22.14, linux/amd64 runtime 빌드. Docker TAR layer-by-layer package 경로/sha256/diffID, final package identity, before/after `docker inspect .Size` bytes/MiB/% 및 `docker history --no-trunc` | PR Docker Job 추가 / **NOT RUN** |
| TC-IMG67-004 | 정적/대형 traced 파일 | Nanum TTF, CadKorean typeface, LibreDWG dist/wasm JS/WASM 파일 raw/gzip proxy 크기 및 runtime `node_modules` + `.next/server` traced 큰 파일 top20; 정적 HTTP 200; 삭제/Unicode subset 금지 | PR Docker Job 추가 / **NOT RUN** |
| TC-IMG67-005 | nonroot SQLite/기존 볼륨 보존 | Docker build native/Prisma ABI, Compose disposable `/data` fresh migrate→health200/Master/DXF 등록→app restart+idempotent migrate→Current/content read→삭제 후 404 | PR Docker Job 추가 / **NOT RUN** |
| TC-IMG67-006 | Viewer/Storage/Security 회귀 | 기존 TS/Lint/Unit, Next production build, Chromium E2E (2 DXF/Layer/Text/Outline/WASM/font/local)/Legacy E2E/Compose/health; S3/실 CAD 현장 수용 별도 | 기존 CI 실행 전 **NOT VERIFIED** |
| TC-IMG67-007 | 실제 GHCR OCI compressed bytes/paired digest | PR에는 GHCR 공개 태그 게시 금지. 정식 게시 후 version+immutable digest app+migrate에 대한 linux/amd64 OCI manifest compressed `layers[].size`, shared layer digest, attestation/index/config 배제 | **정식 릴리스 이후 NOT RUN** |

- 이전 [CI 40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531)의 별도 `better-sqlite3` COPY `12.5 MB는 과거 local 비압축 후보이며 #67 HEAD 절감 실측치로 단정하지 않는다. #28 pre-standalone 2.05 GB와 #66 migrator 1.34 GB를 baseline으로 재사용 금지. 기존 schema/API/Prisma CLI/tsx/migrator/Compose pair는 그대로.
- 단일 native 경로의 **실제 빌드 통과**와 TAR 최종 동일성/크기 계측, Docker/Browser/Legacy CI 성공을 모두 확인해야 PR 후속 병합 검토 가능. `CI 시작`과 `PASS`는 별도 기록. 파일별 gzip/이미지 gzip TAR 크기를 OCI compressed layer라고 표기 금지. [Issue67](Issue67.md), [ADR-045](Decisions.md), [TestReport](TestReport.md).


## PR #79 실패 및 P2 재발 방지 계획 (2026-10-25)

아래 E2 표의 CODED / NOT RUN 및 작성 / NOT RUN은 최초 작성 시점 상태를 보존한 기록이다. 현재 실행 결과는 [수정 HEAD 로컬 QA](#issue-52-재검증-결과--수정-head-로컬-qa-2026-10-25)와 [TestReport](TestReport.md)를 따른다.

| TC | 범위 | 검증 내용 | 상태 |
| --- | --- | --- | --- |
| TC-E2-UNIT-006 | E2-AC1 | WCS (1e9,1e9) 원점에서 먼 1×1 Polygon이 false degenerate로 거부되지 않음 | CODED / NOT RUN |
| TC-E2-UNIT-007 | E2-AC1/3 | Delete 후 60k+60k 정점·100개 경계 새 append 시 복구 Undo 한도 초과 방지, 중복 ID 거부 | CODED / NOT RUN |
| TC-E2-UNIT-008 | E2-AC2/3 | stage A 후 현재 B 또는 혼합 SOURCE 선택은 전체 commit 거부, 동일 선택만 1회 확정 | CODED / NOT RUN |
| TC-E2-E2E-001 | CI TS2339 | `HTMLInputElement` 키보드 이벤트 타입 고정 및 기존 native Ctrl+Z 검증 | CODE FIX / NOT RUN |

첫 Run `40168296155`: Typecheck 실패, 뒤 단계 SKIPPED, 독립 Docker SUCCESS; 최신 HEAD에서 전체 PR CI 필요.

## Issue #52 재검증 결과 — 수정 HEAD 로컬 QA (2026-10-25)

- 실제 원인은 `generated-document.test.ts`의 `result()` helper가 geometry 참조를 공유하여 deep-copy mutation이 후속 fixture를 오염시킨 것이었다. 호출별 `structuredClone`과 fresh fixture `[0,0]` assertion으로 수정; 닫힘 검사/제품 validator는 그대로 유지. 사전 계획의 fixture closure 가설은 가설로 보존한다.
- `TC-E2-UNIT-001~008` 포함 전체 Vitest **202/202 PASS**; Typecheck PASS; Lint PASS(오류 0, 기존 ARIA warning 1); GHCR pair parser 3/3 PASS; outline benchmark PASS; production build PASS; Chromium E2E **65/65 PASS**; Legacy migration **1/1 PASS**. [TestReport](TestReport.md)에서 환경/실행 역할과 한계를 확인한다.
- Docker 로컬 **NOT RUN**(test-only 수정); 기존 다른 실행 HEAD의 Docker 성공은 최신 HEAD 실증으로 계산하지 않는다. 실 CAD/GPU/운영 수용도 NOT RUN. PR CI 성공 전에는 이 로컬 결과만으로 CI/게시/병합 완료를 주장하지 않는다.


## Issue #52 / E2 v0.38.0 — Command·History·Keyboard·Scene 수용 계획 (2026-10-25)

| Test Case | AC | 검증 내용 | 현재 |
| --- | --- | --- | --- |
| TC-E2-UNIT-001 | E2-AC1/5 | 생성 2개 Polygon+MultiPolygon/Hole, Translate/Rotate 2회→Undo2→Redo2: UUID·순서·기준 Geometry·변환·provenance 왕복; input Geometry deep-copy/freeze | 작성 / NOT RUN |
| TC-E2-UNIT-002 | E2-AC2 | SOURCE/혼합, 다른 Version, duplicate/ref spoof, missing/hidden ID, NaN/Infinity·과도 좌표·잘못된 Pivot·중복 Delete에서 전체 무변경/History 0; 다중 Delete 순서 복원 | 작성 / NOT RUN |
| TC-E2-UNIT-003 | E2-AC3/4 | stage/ESC·cancel은 0 history, 1 commit=1 history, visibility는 history 제외, redo 무효화, 100 entry trim, dispose/clear 리소스 정리 | 작성 / NOT RUN |
| TC-E2-UNIT-004 | E2-AC3 | Ctrl/⌘+Z, Shift+Z, Ctrl+Y 및 input/textarea/select/contenteditable/alt/defaultPrevented native 이벤트 비침범 | 작성 / NOT RUN |
| TC-E2-UNIT-005 | E2-AC4/5 | ViewerManager 명령·History·취소/Dispose 위임, 미지원 Viewer는 fail-closed | 작성 / NOT RUN |
| TC-E2-E2E-001 | E2-AC3/4 | 유효 group90 합성 DXF 생성 외곽선과 tree, 버튼 disabled/no edit history, 원본 input Ctrl+Z native 유지, renderer reload/History 폐기 | 작성 / NOT RUN |
| TC-E2-E2E-002 | E2-AC4/5 | dxf-viewer 비지원 상태에서 생성 history UI 없음 | 작성 / NOT RUN |

**회귀 게이트:** TC-E1-UNIT-001~004/E2E-001~003, TC-U6/#43 Tree, #31 Precise Worker+v1 JSON, #40 OFF/ON, #42 typed v2, #17/#25/#26/#38/#39, TypeScript/ESLint/Vitest/Build/Playwright/Docker/Legacy migration. Scene/Worker/GPU 반복 실측 및 실 DXF 데이터는 PR CI 합성 시험과 분리. 현 세션 로컬 실행은 NOT RUN, PR CI 실행 결과 확인 전 PASS 금지. `#31 P4` 서버 인증 정책 Gate 불변. [Issue52](Issue52.md).


## Issue #66 / PR #78 — 첫 PR CI 차단 원인 및 수정 TC (2026-10-25)

| TC | 최초 Run 40167191799 | 교정 및 재검증 기대 |
| --- | --- | --- |
| TC-IMAGE-003 | 기존 `node scripts/run.mjs deploy` 명령 문자열 기대 때문에 **FAIL** | Dockerfile을 migrator/웹 별도 stage로 범위 구분; migrator-dependencies offline prune, 최소 node_modules copy, UID 10001/tsx deploy command, 웹 server.js, Compose service completed 의존 모두 확인. 고정 예전 CMD 기대 제거하고 실제 entrypoint contract 검증 |
| TC-IMG66-010 (신규) | 없음 / **NOT RUN** | `deploy.ts` Prisma `migrate deploy` spawn → 종료 대기 후 `tsx backfill-delete-passwords.ts` 실행, 서버 기동 불포함. Unit 추가 |
| TC-IMG66-001,003,004,006,007,008 | Docker Job 121090554257 **SUCCESS** | 해당 HEAD의 이미지 baseline **1,336,572,597→578,862,325 bytes(56.69%)**, gzip proxy **462,720,650→212,574,989 bytes**, native/UID, 신규·멱등 migrate, 오류 fail-closed 검증. 신규 HEAD에서 재실행 필요 |
| TC-IMG66-002,005,009 | 실제 OCI manifest / Legacy E2E / GHCR release 미완 | 다음 PR CI Node parser·Legacy/E2E 검증; 실제 GHCR OCI 사이즈는 Main publish 이후. 운영 DB/CAD 백업복원 별도 |

- 테스트 기대값 변경은 **작동하는 migrator의 진입점 전환을 반영**하는 것이며 assertion 약화/skip이 아니다. 1차 CI에서 TypeScript·Lint PASS, Docker PASS, Unit 187 PASS/1 FAIL, OCI parser·DXF Benchmark·Production Build·E2E·Legacy SKIPPED를 정확히 구분. [FailureLedger](FailureLedger.md).

## Issue #66 — Migrator 독립 최소 런타임 및 OCI 계측 (v0.37.1)

| TC | Acceptance | 자동 검증 기준 | 상태 |
| --- | --- | --- | --- |
| TC-IMG66-001 | 동시 baseline/후속 측정 | PR base Dockerfile과 새 migrator를 같은 소스·Node 22.14.0·linux/amd64로 빌드. inspect Size, history, du, top modules, gzip proxy 및 절감률(30% soft)을 Docker Job Summary에 기록 | Code / NOT RUN |
| TC-IMG66-002 | GHCR OCI 전송량 | Node parser: amd64 descriptor 1개, attestation 제외, 계층 크기·두 이미지 shared digest dedup; 릴리스의 실제 `:<version>`/`:<version>-migrate` manifest 계측 | Unit 코드 / NOT RUN; 실제 publish 미실행 |
| TC-IMG66-003 | 파일/패키지 봉인 | Prisma CLI+tsx+generated/Prisma config, better-sqlite3 native load, React/Next/Playwright/Vitest/ESLint/CAD 관련 모듈·tests/public 제외; npm stage 검증 및 컨테이너 확인 | Code / NOT RUN |
| TC-IMG66-004 | 최초 설치/멱등 | Compose 신규 DB migration + 백필 exit0 → 앱 health 200/정적 WASM·font, 재시작 migration 재실행 성공 | 기존 PR Docker smoke 확장 / NOT RUN |
| TC-IMG66-005 | 구 스키마 이행·보존 | 기존 Legacy migration E2E(보호 데이터/Current/hash/Version 비교), QA backup/restore 실증은 별도 운영 절차 | CI/E2E NOT RUN, 현장 NOT RUN |
| TC-IMG66-006 | read-only DB | `DATABASE_URL=file:/proc/cad.sqlite`로 migrator nonzero 확인, 앱 의존 완료 조건 유지 | 기존 Docker step / NOT RUN |
| TC-IMG66-007 | invalid SQL | 일회성 CI bind mount에 불량 migration 추가, nonroot migrator 실패; 운영 volume 사용 없음 | 신규 Docker step / NOT RUN |
| TC-IMG66-008 | UID/CA/S3 Secret | runtime Debian glibc/OpenSSL/CA, UID 10001, /data 권한, migrate env에 S3 Secret 부재; SQLite native load | 정적+Docker / NOT RUN |
| TC-IMG66-009 | release pair | Tagless/digest Compose resolution, build app+migrate candidate → digest 검증 → version/latest paired 승격, 게시 후 OCI 측정; 임의 개별 태그 이동 금지 | PR 정적 검증/릴리스 NOT RUN |

- PR CI 흐름에서 `verify`는 Typecheck/Lint/Vitest/Build/E2E/Legacy를, 독립 `docker-runtime`은 실제 migrator/native/Compose/실패/측정 경로를 수행한다. 로컬 Docker/소스 설치 시험은 현재 환경에서 미실행. **PR CI 시작과 성공을 구분**하며 Main/GHCR의 공개 version OCI 크기는 PR CI로 대체할 수 없다.
- 노드만 사용하는 OCI 파서 회귀는 `node --test src/scripts/measure-ghcr-pair.check.mjs`로 검증(실제 registry 연결은 Main publish). [Issue66](Issue66.md), [TestReport](TestReport.md), [Operation](Operation.md).
## Issue #51 / PR #77 — 최초 Unit 차단 및 작은 좌표 교차 회귀 계획 (2026-10-25)

- **TC-U6-UNIT-003 (기존):** 단일 `focusSavedOutline('local-1')` 호출은 Adapter의 `selectSavedOutline('local-1')` **인수 1개** 계약 유지. 최초 Run 40164835838에서 인수 false 추가로 FAIL; 수정 HEAD 재실행 후 판정.
- **TC-E1-UNIT-003 (추가):** Ctrl/⌘ `focusSavedOutline('local-1',true)`일 때만 Adapter `('local-1',true)` 및 WCS focus를 유지. 첫 Run에서 실행되지 않은 추가 assertion, 새 CI 전 NOT VERIFIED.
- **TC-E1-UNIT-004 (추가):** 0.001 WCS 정사각형에 `[-0.001,0.0004,0.002,0.0006]` 가로창이 교차=true, 내부창 true, 떨어진 근접 평행·인접 창=false, 점 히트 근접성 기준. 고정 determinant product 임계값 재발 방지. [P2 Review 4369760096](https://github.com/planner77/layoutManager/pull/77#discussion_r4369760096). 새 CI 전 NOT VERIFIED.
- 첫 Run에서 Unit 실패 후 Benchmark/Build/E2E/Legacy 전부 SKIPPED. 해당 단계가 실패했다고 표시하지 않으며 최신 HEAD PR CI에서 검증해야 한다.


## Issue #51 / E1 v0.37.0 — 통합 객체 선택 시험 계획 (2026-10-25)

| TC | AC | 검증 목적 | 작성/실행 상태 |
| --- | --- | --- | --- |
| TC-E1-UNIT-001 | AC1/2/4/5 | SOURCE/GENERATED 동일 Scope의 Ref·UUIDv4(getRandomValues HTTP fallback)·혼합/원본/중복/버전 위조 edit gate | 테스트 작성 / **NOT RUN** |
| TC-E1-UNIT-002 | AC3 | Polygon/Hole/Stroke/MultiPolygon·퇴화/NaN·Window 완전 포함/교차 정합성 | 테스트 작성 / **NOT RUN** |
| TC-E1-E2E-001 | AC1/2/3 | 유효 90=4 합성 DXF, SOURCE 1+GENERATED 2 영역 선택, readonly gate, Tree Ctrl/⌘ 다중 선택·highlight·v1 JSON 로컬 ID/원본 재요청 없음 | 테스트 작성 / **NOT RUN** |
| TC-E1-E2E-002 | AC3/4 | Source Layer/Generated hide 개별 선택 해제, 우→좌 영역, ESC, Reload 폐기 | 테스트 작성 / **NOT RUN** |
| TC-E1-E2E-003 | AC3/4 | 미지원 DXF Renderer 비활성 및 원본 작업 격리 | 테스트 작성 / **NOT RUN** |
| #31/#40/#42/#43 + Build/Docker | 회귀 | #31 Source selection/Worker, #40 생성 ON/OFF, JSON v1/2, Tree, UI, Legacy migration 등 PR CI gate | **NOT RUN** |

실제 다중 CAD/성능/GPU/OS·브라우저 수용은 현장 실증 별도. 로컬 실행 불가 시 PASS로 기록하지 않으며 Actions run 성공 전 수용 승인 금지. 상세 [Issue51](Issue51.md).


## Issue #74 — GHCR v0.36.1 패치 게시 검증 (2026-10-25)

| ID | 조건 | 기대 | 현재 |
| --- | --- | --- | --- |
| TC-CI-74-RELEASE-001 | package 및 lockfile 루트 버전 | 0.36.1 동기, dependencies 동일 | 정적 검증 |
| TC-CI-74-RELEASE-002 | Main `before..sha`에 `src/package.json` 변경 포함 | release-scope `publish=true` 후 GHCR Job 진입 | Main 미실행 |
| TC-CI-74-RELEASE-003 | `v0.36.1` 태그 및 GHCR app+migrate digest | 신규 태그와 이미지 쌍 검증·게시, 기존 `v0.36.0` 변경 없음 | 실제 게시 미확인 |
| TC-CI-74-RELEASE-004 | 새 PR HEAD | Verify+Docker CI SUCCESS 후 Squash merge, review 0, conflict 0 | 신규 CI 필요 |
| TC-CI-74-RELEASE-005 | Main push commit 단일행 | `MAIN CI | #74 | 짧은 설명` 표시 | Main 미실행 |

- 기존 [PR CI 40163919324](https://github.com/planner77/layoutManager/actions/runs/40163919324) 성공은 **버전 변경 이전 HEAD**에만 적용. Repo admin Squash 기본값은 #76에서 추적. GHCR 게시 경로는 기존 release-scope를 우회하지 않고 version bump로 정식 유도.

## Issue #74 — Main CI 실행명 multiline squash 회귀 방지 (2026-10-25)

| Test ID | 입력 | 기대 실행명 | 검증 상태 |
| --- | --- | --- | --- |
| TC-CI-NAME-007 | main 단일행 `#74 \| 실행명 회귀 방지` | `MAIN CI \| #74 \| 실행명 회귀 방지` | 정적 규칙 확인, 실제 Main 미실행 |
| TC-CI-NAME-008 | main 단일행 `NO-ISSUE \| 정리` | `MAIN CI \| NO-ISSUE \| 정리` | 정적 규칙 확인, 실제 Main 미실행 |
| TC-CI-NAME-009 | main `#42 \| 요약\\n\\nRefs #42 ...` (squash body 존재) | `MAIN CI \| SUBJECT-ONLY-REQUIRED \| run N` (긴 본문 미노출, Issue 미추정) | 정적 규칙 확인, 실제 Main 미실행 |
| TC-CI-NAME-010 | tag `v0.37.0` | `RELEASE \| NO-ISSUE \| v0.37.0 GHCR 이미지 게시` | 기존 식 유지, 실제 Tag 미실행 |
| TC-CI-NAME-011 | Repository squash 기본값 점검, API squash 병합 | `PR_TITLE / BLANK`(관리자 조치), `commit_title` 지정+`commit_message=""` | **Admin 설정 미적용**, 실제 merge 미실행 |

- Workflow `on:` 이하 본문은 바꾸지 않고 `run-name`과 설명 주석만 변경한다. #68 GHCR 게시 제외(Job scope), concurrency/permissions, PR CI workflow는 불변이다.
- 본 변경 PR CI 성공이 Main run-name의 실제 event 평가를 검증하지 않는다. 정상/폴백 main push와 tag는 실제 해당 이벤트의 Run 제목을 관찰해야 완료 판정한다. [Issue74](Issue74.md).

## Issue #43 / PR #72 P2 키보드 가시성 회귀 (2026-10-25)

- **TC-U6-E2E-001 확장:** 폭 320px·높이 700px(도크 최대 20dvh)에서 트리 첫 그룹에 focus → `End` 이동 후 마지막 항목이 `role=tree` 스크롤 영역의 사각형에 완전히 들어오는지 확인한다. `Home`은 첫 그룹에 되돌아오고 `window.scrollY`는 불변. Canvas DOM 유지·Scroll 허용 범위를 tree 내부로만 제한.
- P2 리뷰 [4369618943](https://github.com/planner77/layoutManager/pull/72#discussion_r4369618943)의 지적은 최초 CI `40161078593` 성공 HEAD `5cd223cc2837fc5772154fd67138680263f159e4`의 미검출 사용성 결함이다. 후속 수정 HEAD 결과는 CI success 확인 전 NOT VERIFIED.


## Issue #43 / U6 v0.36.0 — 트리/Overlay 시험 계획 (2026-10-25)

| TC | 수용 | 시나리오 및 기준 | 상태 |
| --- | --- | --- | --- |
| TC-U6-UNIT-001 | U6-01 | 타입 2개(합성 catalogue) + 여러 instance + legacy, ID 기준 그룹/리네임/빈 노드·비활성 snapshot, Group 수량·Visibility | 코드 작성 / NOT RUN |
| TC-U6-UNIT-002 | U6-02 | Polygon/MultiPolygon/hole·분리 섬 전체 WCS envelope, 퇴화/비유한/한도 초과 거부 | 코드 작성 / NOT RUN |
| TC-U6-UNIT-003 | U6-02/03 | Manager focus/visibility/delete delegation, CAD Layer 미호출, dispose 이후 fail-closed | 코드 작성 / NOT RUN |
| TC-U6-E2E-001 | U6-01~05 | 90=4 유효한 합성 DXF, 실제 CONVEX/PRECISE worker, legacy tree 즉시 갱신, 개별·그룹 숨김, 레이어 독립, 선택·ARIA keyboard, OFF+v1 JSON, 320px 및 메뉴 포커스, content 단일 요청 | 코드 작성 / NOT RUN |
| TC-U6-E2E-002 | U6-04/05 | dxf-viewer 비활성, three 전환, Reload로 임시 폐기, 다른 Version 데이터 누수 없음 | 코드 작성 / NOT RUN |
| 실제 관리자 타입/영속 재접속 | U6-01/06 | Verified server catalogue 2개·scope/401/403/DB CAS·audit·server owned Source SHA/Version | BLOCKED #65/#31 P4 |

기존 #17/#25/#31/#38/#39/#40/#41/#42/Legacy migration, ESLint/Typecheck/Build, Docker runtime 회귀를 PR CI에서 수행. 로컬 시험 NOT RUN, PR CI 결과 전 PASS 기재 금지.


## Issue #68 — GitHub Actions Run 이름 정적/실행 검증 계획 (2026-10-25)

- `TC-CI-NAME-001`: 표준 PR 제목 `#68 | Actions 실행명 정리` → `PR CI | #68 | Actions 실행명 정리`, PR 번호를 Issue로 사용하지 않음.
- `TC-CI-NAME-002`: `NO-ISSUE | 문서 정리` / 비표준 `docs: update` 입력은 각각 `NO-ISSUE` / `ISSUE-UNKNOWN`으로 명시. 제목 수정을 위해 `pull_request.edited` 이벤트를 새로 추가하지 않음.
- `TC-CI-NAME-003`: 수동 실행에서 Issue 참조·간략 설명 폼 입력/기본값 확인(기본 브랜치 반영 이후 가능).
- `TC-CI-NAME-004`: main squash `#68 | ...` / `NO-ISSUE | ...` / legacy 비정형은 `MAIN CI | ...`, tag `vX.Y.Z`는 `RELEASE | ...`로 구분. 버전/이미지 게시 성공과 실행명 구별.
- `TC-CI-NAME-005`: 기존 트리거·permissions/concurrency/기존 빌드/배포 step의 코드 diff 비교. 신규 `release-scope`/게시 `if`는 메타데이터 변경으로 GHCR가 실행되지 않는지 별도 시험.
- `TC-CI-SCOPE-001`: PR #69 파일 전부 `.md` 또는 `.github/workflows/*.yml|yaml` → main `release-scope` PASS, `build-and-push` SKIPPED, GHCR 신규 태그/푸시 없음.
- `TC-CI-SCOPE-002`: `src/`/Dockerfile/Compose 기타 실행 코드 1개라도 변경 → 원래 GHCR 게시 여부 판정 Job 진입(버전 이미지 중복 확인 등은 유지).
- `TC-CI-SCOPE-003`: `v*.*.*` Tag push → scope `publish=true`, 기존 GHCR 게시 단계 실행. baseline missing 또는 비교 실패한 main push는 오류 차단(임의 게시 금지).
- **상태:** 변경 작성; 실제 Actions run에 표시되는 값은 PR 생성 뒤 확인. Main/tag/manual 검증은 실행 전이며 PASS로 기록하지 않는다. 세부 입력/기대/제약 [Issue68](Issue68.md).


## PR #70 E2E 회귀 — Canvas 스크롤 후 2회 영역 선택 (2026-10-25)

- **TC-OUT-E2E-001 보강:** 비전체화면 일반 레이아웃의 `ViewerAppShell`/U5 확장 도크 상태에서 첫 CONVEX 선택·다운로드, PRECISE preview·`선택 해제`, **두 번째 실제 영역 드래그**가 계속 정상이어야 한다. 마우스 동작 전 Canvas 전체가 Viewport 안에 있도록 Playwright `scrollIntoViewIfNeeded` + `toBeInViewport({ratio:1})`를 검사한다. 선택된 Entity 1개를 실제로 검증하고, 곧바로 PRECISE Worker·기하·JSON 출력까지 검증한다.
- 최초 실패 [Run 40157734271](https://github.com/planner77/layoutManager/actions/runs/40157734271) / Artifact 12585362916: Canvas 화면 밖 `y=-63`, 두 번째 `mouseDown y=-58`, `선택 0개` 경과. Source/Renderer/Worker 수정이 아니라 **E2E 제어 좌표/스크롤 준비 문제**. 재CI 성공 전 regression PASS 표기 금지.
- 같은 `TC-OUT-E2E-001`을 유지하며 시험을 skip/삭제하거나 timeout만 늘리지 않는다. 세부 원장 [FailureLedger](FailureLedger.md).


## Issue #42 / U5 v0.35.0 — 타입 지정 외곽선 로컬 계약·게이트 (2026-10-25)

| AC / TC | 검증 항목 | 코드 / 상태 |
| --- | --- | --- |
| U5-01/03; TC-U5-UNIT-001 | 같은 CONVEX에 서로 다른 업무 타입, 같은 타입의 CONVEX/PRECISE, 기본 이름, type 변경 후 kind/geometry/Handle 불변 | `outline-assignment.test.ts`; TEST NOT RUN |
| U5-02; TC-U5-UNIT-002 | 미지정/미존재/비활성/다른 Scope·Version·SHA/null-lab 타입 차단, name NFC/기본값/제어 문자/길이/중복 정책 | 동일 Unit; TEST NOT RUN |
| U5-04; TC-U5-UNIT-003 | v1 JSON 파싱·출력 그대로, v2 typed/mixed 메타데이터, null legacy, 유효하지 않은 UUID/필드/Version 거부 | 동일 Unit 및 기존 `outline-draft.test.ts`; TEST NOT RUN |
| U5-02/05; TC-U5-E2E-GATE-001 | 실제 type server API 없음 404, 사용자 Viewer U5 selector/confirm disabled·안내, U4 Admin 메뉴 disabled | `issue42-outline-assignment-gate.spec.ts`; TEST NOT RUN |
| U5-01~05 운영 수용 | verified session/Scope catalogue, 401/403·type active 변경 경쟁, 원본 DXF 재파싱·Geometry tamper·409·Audit | BLOCKED #65/#31 P4; 서버 인증/DB 미구현 |

기존 #31/#40/#41/Renderer/Version/Layer/Worker/기존 v1 JSON E2E 및 legacy DB migration, TypeScript/ESLint/Vitest/production Build, DXF synthetic benchmark/Docker runtime은 PR CI 필수 회귀. 타입 데이터 공급 후 typed end-to-end는 별도 추가 필요. [Issue42](Issue42.md). **코드 작성 ≠ 실행 성공.**


## Issue #41 / PR #64 E2E 및 HTTP 비보안 컨텍스트 회귀 보완 (2026-10-25)

| TC | 검증 의도 | 관측/계획 | 
| --- | --- | --- |
| `TC-U4-E2E-PREVIEW-001` | 중복 타입 경고는 Next.js `__next-route-announcer__` 외 **prototype 내부** `role=alert` 만 검사하며 이후 수정/비활성/복구/refresh까지 검증 | [Run 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566) 기존 Locator **FAIL**, 수정 HEAD 재CI 결과 미검증 |
| `TC-U4-UNIT-005` | secure context의 native `randomUUID` 우선, getRandomValues 중복 호출 방지 | 신규 작성/재CI NOT VERIFIED |
| `TC-U4-UNIT-006` | `randomUUID` 없음→CSPRNG `getRandomValues`로 RFC UUIDv4 format·version/variant, 암호학적 난수 API 전체 부재 시 fail-closed | 신규 작성/재CI NOT VERIFIED |
| `TC-U4-E2E-HTTP-003` | `page.addInitScript`로 `crypto.randomUUID` 제거(기존 TC-ISSUE14-001과 동일) 후 메모리 시안 생성 정상·API 저장 없음·reload 삭제 | 신규 작성/재CI NOT VERIFIED |
| 기존 회귀 | U4 API GET/POST/PATCH 404, #38 disabled 관리자 메뉴, #40 outline worker·#39 layer·#25 immersive, Legacy migration, Docker | 최초 Run에서 E2E 총 55 PASS/1 FAIL 및 Legacy SKIPPED, 수정 HEAD는 재검증 필요 |

- 일반 `http://<server IP>:3000`에서 `randomUUID`는 없을 수 있으나 `getRandomValues`는 사용할 수 있다. 테스트의 method 제거는 **비보안 컨텍스트의 API 가용성을 모의**하며 실제 외부 HTTP 접속/현장 네트워크·권한 테스트 통과를 주장하지 않는다. 실서버 타입 저장/인증/RBAC/DB scope는 차단 유지. [FailureLedger](FailureLedger.md)·[Issue41](Issue41.md).


## Issue #41 / U4 v0.34.0 — 비영속 타입 시안과 Fail-Closed 테스트 (2026-10-25)

| TC | 범위 | AC/상태 |
| --- | --- | --- |
| TC-U4-UNIT-001 | NFC/trim, 대소문자 무시 중복, 비활성명 예약, scopeKey 미결정 | AC-U4-03 **부분** |
| TC-U4-UNIT-002 | 공백·제어/방향 문자·길이·정수·UUID 검증 | AC-U4-03 **부분** |
| TC-U4-UNIT-003 | 이름변경/불변 ID·createdAt/비활성·복구/Revision stale 충돌 | AC-U4-03/04 **부분** |
| TC-U4-UNIT-004 | 이름변경 중복 거부, 불변 명령, 안정적 정렬 | AC-U4-03 **부분** |
| TC-U4-E2E-PREVIEW-001 | `/lab/outline-types` 추가·중복·수정·비활성·복구, no API requests, reload 후 0건 | 비영속 UX만 검증 |
| TC-U4-E2E-GATE-002 | 실제 GET/POST/PATCH `/api/outline-types` = 404, spoofed headers/deletePassword 우회 불가(미구현 API) | AC-U4-05 **코드 경계** |
| 기존 회귀 | #38 관리 메뉴 disabled, #40 외곽선 선택/Worker, #39 레이어, #31 P4 전용 validator, #25 immersive | Viewer 호환 |
| **승인 후 신규 필요** | 인증된 Admin 세션 영속 CRUD, non-Admin 401/403, scope 분리/복구, DB Unique/FK CAS 동시 업데이트 409, 감사 기록, Migration/Restore E2E | AC-U4-01~04 **BLOCKED** |

- 로컬 npm ci/typecheck/lint/unit/build/Playwright 결과: **NOT RUN**. PR CI도 시작 즉시 성공 처리하지 않으며, 실 CAD·GPU·RBAC·DB 영속 수용은 별개.
- E2E의 API 404는 **인가 401/403를 검증한 것이 아님**. 인증/Scope 결정 전 실제 Route를 실험용으로 만들지 않는다. [Issue41](Issue41.md).


## Issue #40 / U3 v0.33.0 — 외곽선 도구 ON/OFF (2026-10-25)

| TC | 자동/수동 범위 | AC |
| --- | --- | --- |
| `TC-U3-UNIT-001` | reducer 기본 OFF, 10회 ON/OFF 반복 시 독립 레이어/트리 상태 및 reset | AC-U3-01/02/04 |
| `TC-U3-UNIT-002` | 정책 함수: DXF+three+ready+SHA 64hex+mapped >0만 허용, DWG/다른 Viewer/loading/error/0 index/invalid SHA 비활성·사유 | AC-U3-05 |
| `TC-U3-UNIT-003` | 계산 revision·enabled·AbortError에서 이전 Worker 오류 무효화, 현재 세션 오류만 표시 | AC-U3-02 |
| `TC-U3-E2E-001` | 합성 DXF/Polygon: 메뉴 Enter ON→영역선택→PRECISE Worker→임시 확정→새 CONVEX Preview→OFF(비확정 취소·Pan)→확정 Overlay/JSON Export 보존→ON 전환 후 선택 0/Preview 없음/동일 Canvas·단일 원본 GET | AC-U3-01/02/03 |
| `TC-U3-E2E-002` | 3회 ON/OFF, Layer hidden 선택 차단·기존 선택 제거, 재표시, 선택/검색/native·CSS 중 ESC 1회 한 계층 | AC-U3-01/02/04 |
| `TC-U3-E2E-003` | dxf-viewer disabled/사유, three-dxf-viewer ON 후 reload/Renderer 강제 OFF, 빈 도면 메뉴 disabled | AC-U3-04/05 |
| **기존 회귀** | `TC-OUT-E2E-001` #31 활성 메뉴 추가, private `TC-OUT-REAL-BROWSER` 메뉴 재사용, `TC-U1-E2E-001`의 미안정 Handle fixture disabled 정책, #25/#17/#26/#39 + build/test/legacy migration/Docker | 전체 |

- 합성 테스트는 **선택/Worker UI 동작** 검증이며 실 DXF Source↔Renderer 정확도·GPU/메모리/실 native Fullscreen 실증이 아니다. 사내 승인 DXF는 별도 opt-in 절차로 확인한다.
- **실행 상태:** 구현 시 작성된 TC는 PASS가 아니다. PR CI 완료 결과 및 실험 로그 확인 전 **NOT RUN / NOT VERIFIED**. 실패·취소는 실제 Run ID·Job·로그와 함께 `out/FailureLedger.md`에 보존.


## PR #48 CI #40149077671 후속 예방 회귀 (2026-10-25)

- TC-U3-E2E-001: 상단 버튼에 포커스하고 **Enter ON → Space OFF → Space ON**을 반복하여 `aria-pressed`와 실제 도구 도크가 동기화됨을 검증. 이벤트는 `SelectionController`의 capture를 통과하더라도 버튼의 native Space click을 허용해야 한다.
- TC-U3-E2E-002: 메뉴 포커스를 해제한 캔버스에서는 **Space+drag**가 선택 객체를 만들지 않으며 Pan 모드로 임시 전환/복귀. `fitToView` 이후 정상 영역 선택·레이어 hide·ESC 선택/검색/전체 화면 회귀를 계속 검증.
- CI 차단 방지: `npm run lint`의 `react-hooks/refs` 및 `react-hooks/exhaustive-deps` 검증을 Unit/Build/E2E 선행 게이트로 유지. [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671)에서 후속 시험은 실행되지 않았으므로 **SKIPPED**, 수정 HEAD 테스트는 **NOT VERIFIED**.

## Issue #40 / PR #48 — CI Run #40150085136 E2E 교정 항목 (2026-10-25)

- **`TC-OUT-E2E-001` / AC-U3-01/04:** 기존 #31 실 Polygon Union/JSON Export/ESC 경로 유지. 명시적 Reload 직후 도면 표시 완료와 `viewer-menu-outline-tool[aria-pressed=false]`, `cad-outline-tools` 미존재(기본 OFF) → ON 클릭 후 `outline-selection-count`의 `선택 0개`를 확인한다. 테스트가 OFF 화면에서 존재하지 않는 선택 패널을 찾지 않도록 한다.
- **`TC-U3-E2E-003` / AC-U3-04/05:** 두 Renderer 전환·리로드 강제 OFF 테스트의 DXF `LWPOLYLINE`에는 group `90=4`와 `10/20` 좌표 4쌍을 포함한다. `dxf-viewer` 실제 처리 완료와 `three-dxf-viewer`의 매핑/선택 가능 상태를 모두 검증하며, 오류가 나면 건너뛰거나 Renderer별 다른 시험 문서로 대체하지 않는다.
- 실제 실패의 trace에서 `n must be greater than 0 vertices`를 확인했고, [Autodesk LWPOLYLINE DXF Reference](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm)의 `90: Number of vertices`에 맞춘다. [FailureLedger](FailureLedger.md), [Issue40](Issue40.md).
- **첫 Run 40150085136**의 E2E는 52 PASS/2 FAIL. Fixture 교정 HEAD의 새 CI에서 위 TC 및 전체 54+ E2E/Legacy migration 등을 재검증하기 전 성공 판정 금지. 실도면·GPU P0/P5는 별개.

## Issue #39 / U2 v0.32.0 — 레이어 메뉴·도크 독립 상태 (2026-10-25)

| TC | 자동/수동 시험 내용 | AC |
| --- | --- | --- |
| `TC-U2-UNIT-001` | 기존 `viewer-app-state.test.ts` 강화: close idempotent, compact panel 트리 fallback·reopen/default, layer visibility는 reducer 독립 | AC-U2-01/02 |
| `TC-U2-E2E-001` | two-layer DXF의 메뉴 aria 상태·controls host, 실제 캔버스에 반영된 checkbox 효과, 메뉴 반복 토글/패널 접기 Enter→메뉴 focus→Space 재개, Canvas ref/단일 Source GET, 확대, 모바일 320px, 일반 드롭다운 선택 유지·전체 화면 복귀 | AC-U2-01/02/03/04 |
| `TC-U2-E2E-002` | native `fullscreenchange` **모의 이벤트**에서 패널 상태 보존, reload/Renderer 변경시 초기 layer reset·지원 여부 반영 | AC-U2-01/03/04 (실제 native 수용은 별도) |
| `TC-U2-E2E-003` | drawable 0개 DXF의 UI disabled/도크 미노출, aria-controls 부재 | AC-U2-04 |
| `TC-U1-E2E-001/002`, `TC-ISSUE17-001`, `TC-LAYER001~003`, `TC-ISSUE25-001/002`, `TC-TEXT-E2E-001`, `TC-OUT-E2E-001` | #38 도킹, #17 선택/전체 선택·해제/일반 드롭다운, DXF/DWG 오류, CSS/native, 검색/선택·ESC 회귀 | AC-U2-02/04 |

- CI: `npm ci`, Prisma generate, typecheck/lint, Vitest, outline benchmark, build, Chromium E2E, legacy migration E2E, Docker-runtime. 작업 브랜치의 PR `pull_request.opened` 트리거로 시작. 실행 전 **NOT RUN**, CI 시작 이후 모니터링 없으면 **결과 미확인**으로 남긴다.
- 실제 native fullscreen 허가/거절·browser top-layer·screen-reader 포커스/Tab·실 CAD GPU/장시간·좁은 화면 터치 조작은 수동 추가 수용이며 모의 테스트로 대체하지 않는다. [Issue39](Issue39.md).

## Issue #45 / v0.31.0 — Current-only 목록 및 이력 관리 시험 계획 (2026-10-25)

| TC | 검증 방법 | AC |
| --- | --- | --- |
| TC-LIST-045-001 (Vitest) | Current 파라미터 누락/true/false에서 홈 전용 쿼리 정규화, 기존 검색/페이지·pageSize 유지, API `listQuery(current=false)` 호환/오류 검증 | AC1/AC3/AC5/AC8 |
| TC-LIST-045-002 (Vitest+DB) | Current 지정 없는 층과 신/구 비Current 제외, 재지정 시 서버 결과 즉시 변경 및 API history 유지 | AC4/AC6/AC8 |
| TC-LIST-045-003 (Playwright) | 홈 초기 0건·토글 부재, Current 최신 불일치, 레거시 URL, 필터·API 이력, 기준정보 5단계→Current 없는 층 상세, Current 지정·교체·삭제 후 홈 반영 | AC1~AC8 |
| TC-E2E-001, TC-LINK-001~003, TC-NAME-002/003, TC-ISSUE-001/LIST | 기존 업로드→Current 교체/Location의 이전 Version 직접 링크·Viewer·다운로드·이름/표시 | AC6/AC7/AC8 |
| TC-LIST-003/004/005/009, TC-DELETE-002/004, TC-MASTER-003/005/007 | 기존 API Current/non-Current 계약, 페이징, Current 교체·삭제, 마스터·기록 회귀 | AC5~AC8 |

- 검증 단계: `npm ci`, `db:generate`, `typecheck`, `lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:master-migration`, 기존 Docker-runtime smoke. 사용자 요청에 따라 PR CI 트리거 후 모니터링 생략.
- 실행 결과는 이 계획의 통과 요건과 구분한다. 로컬/CI의 실행 근거가 확인되지 않은 동안 **NOT RUN / NOT VERIFIED**이며, 이력·데이터/API 손상 없음은 CI/실증으로 최종 확인한다.
- 상세 매핑: [Issue45](Issue45.md).


## Issue #38 / U1 v0.30.0 — 앱형 Viewer 회귀 시험 계획

| TC | 검증 대상 | 기대 결과 / 연계 AC |
| --- | --- | --- |
| `TC-U1-UNIT-001` | 순수 ViewerAppState reducer 기본값·레이어 열기/닫기·트리/도구 독립 전환·reset | AC-U1-03 / U2·U3·U6 상태 호스트 독립 |
| `TC-U1-E2E-001` | DXF `dxf-viewer`/`three-dxf-viewer` 직링크, 메뉴/기존 버튼, layer checkbox+panel toggle, 단일 GET·Canvas DOM, 모바일 320px backing, 검색/ESC, reload | AC-U1-01~05 |
| `TC-U1-E2E-002` | 손상된 DWG의 공통 메뉴·로딩/에러/재시도·원본/뒤로, DXF 전용 메뉴 disable | AC-U1-02/05; 정상 DWG 렌더링은 기존 `dwg-viewer.probe.ts` 별도 |
| `TC-ISSUE25-001/002` | CSS immersive/native 거절 및 in-shell loading, 링크/ESC/포커스/resize 회귀 | AC-U1-01/04 |
| `TC-ISSUE17-001`, `TC-OUT-E2E-001`, `TC-TEXT-E2E-001` | 레이어/외곽선/검색 및 한 계층 ESC·원본 요청/카메라 유지 | AC-U1-02/03/04 |

- PR CI 기준: `npm ci → db:generate → typecheck → lint → npm test → outline-benchmark → production build → chromium E2E → migration E2E`, 별도 docker-runtime job. 실제로 실행하지 않은 각 단계는 **NOT RUN**, CI 시작만으로 통과 아님.
- 수동/현장: 실제 DWG LINE, native browser top-layer, Chrome/Edge/GPU, 물류 CAD 큰 도면 성능, viewport 320px & 360px 키보드/포커스/Tab·resize·좌우 dock 동시 표시(#43 연결 후) 별도 검증. 증거 없는 항목 PASS 금지.
- `out/Issue38.md`에서 AC→코드→TC를 추적. 실패 발견 시 `out/FailureLedger.md`에 Run/Step/원인/보완/재실행을 축적.


## Issue #25 — v0.29.0 자동 CSS immersive 진입 (PR CI 전)

### PR #36 E2E 연계 변경 (Run 38974687861 기준)
- `TC-NAME-002/003`: toolbar 원본명 중복 없이 정확 표시, `viewer-toolbar` 안의 고유 원본명 locator.
- `TC-DESC-005`: `aria-label="도면 설명"` + literal multiline description을 Viewer가 처음 열릴 때 및 reload 후에 노출.
- `TC-FONT-002` (2 renderers): 기본 immersive 진입 확인, 명시적으로 normal 모드 전환한 다음 확대/Fit·한글 TEXT Canvas 검증.
- 구 Run에서는 40 PASS / 4 FAIL이며 새 HEAD는 검증 전이다.

| TC | 절차 및 완료 기준 | 실행 상태 |
| --- | --- | --- |
| TC-ISSUE25-001 DXF 2종 | 목록 → 공통 Version Viewer 자동 immersive, URL Renderer 선택, 원본·링크·재시도·툴바, Desktop/mobile 360×700/Canvas backing buffer, 신규 Browser Context/직접 URL/새로고침, native API reject/CSS 유지, ESC 일반 모드 복귀/재진입, 목록 복귀/뒤로 가기, 헤더 inert·스크롤 복구 | E2E 작성, NOT RUN |
| TC-ISSUE25-002 | Native fullscreen top-layer 상태에서 reload 원본 GET을 지연·Provider global overlay와 shell 자손 overlay를 함께 확인, 완료 시 제거·조작 비활성화/복구. `fullscreenchange` mock과 실제 native 브라우저 정책 분리 | E2E 작성, NOT RUN |
| TC-LINK-001..003 | 기존 URL/UUID/renderer/복사 및 fallback. 신규 direct context에서 자동 immersive/native=false | E2E 수정, NOT RUN |
| TC-ISSUE17-001, TC-LAYER001..003 | 전용 전체 화면 레이어 패널, 일반 LayerDropdown, 선택/비선택, Switch·Reload·모바일, view state/Canvas reuse | 기존 E2E 기본 진입 대응 수정, NOT RUN |
| TC-DXF/THREE-001, TC-SWITCH-001/002 | 확대/축소/맞춤/Pan, ESC/전체 화면 전환, Back·재진입, 전역 Loading/중복, WebGL cleanup | 기존 E2E 기본 진입 대응 수정, NOT RUN |
| TC-TEXT-E2E-001, TC-OUT-E2E-001 | DXF 검색·선택/외곽선 overlay, fullscreen CSS 및 일반 전환 | 기존 E2E 기본 진입 대응 수정, NOT RUN |
| TC-MET-001, TC-E2E-001 | 기존 일반 Viewer에서 측정 JSON·등록·전환 검증, default immersive에서 명시적 일반 모드 복귀 | 기존 E2E 수정, NOT RUN |
| TC-E2E-002/DWG-001/003 | DWG 기본 CSS immersive·libredwg-web 강제·성능/도면 재진입·오류/재시도/cleanup | 별도 DWG probe 회귀 수정, NOT RUN |
| TC-FOCUS-001 | 실제 데스크톱 Chrome/Edge, 모바일 크기에서 tab/ESC/native 거절·화면 낭독기 상태·주소창 동작 수동 점검 | 실기기 NOT RUN |

검증 명령(승인된 환경): `cd src && npm ci && npm run db:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`. DWG는 `npm run prepare:dwg-samples && npm run test:dwg`의 전용 config 사용. PR CI가 동작하기 전까지 PASS 표시 금지. [Issue25](Issue25.md).



## Issue #31 v0.28.3 추가 시험 설계 — CI 대기

| ID | 확인 내용 | 증거 |
| --- | --- | --- |
| TC-OUT-ID-BLOCK-PARTIAL | BLOCK 미지원 child가 있으면 INSERT geometry 부분 계산이 있더라도 stable=false, 안전한 선택·영속 참조 제외 | Unit 신규 |
| TC-OUT-GEO-CURVE-CAP | 실제 반경에 필요한 샘플 수가 512 초과하면 0.02 WCS sagitta 정확도를 주장하지 않고 거부 | Unit 신규 |
| TC-OUT-CANON-001..004 | Source SHA/Version/Units/Handle/GeoJSON에 의한 canonical recompute; 변조·존재하지 않는 Entity 거부 | Unit 신규 |
| TC-OUT-PERF-100K | CI synthetic 1k/10k/100k Parse/SpatialIndex/Query/Convex CPU/heap 출력, 요청 수·파싱 수 동일 | `npm run test:outline-benchmark` PR CI |
| TC-OUT-REAL-001 | 폐쇄망 승인된 DXF 3종: Source↔Renderer, Insert/BLOCK/OCS/거리·Polygon 면적을 CAD 기준 값과 대조 | 실제 파일/수치 기준 미확보 |
| TC-OUT-REAL-002 | `npm run test:outline-acceptance` 5회 Browser Load, 화면 mapping/선택, p50/p95, JS heap, CPU/GPU 기록 | private env input 미확보 |
| TC-OUT-P4-001 | IdP/RBAC/Scope/세션/감사 정책 확정 후 Write API/CRUD/CAS/Version 삭제 및 인증 오류 | **Owner 승인 전 보류** |

**신규 PR CI 통과와 현장 실DXF 수용은 별개**. 미실행 항목을 PASS로 표기하지 않는다. [Issue31](Issue31.md).


## Issue #31 v0.28.2 — Production Worker / 실도면 후속 계획 (PR CI 전)

| TC | 시험 계약 | 신규 실행 결과 |
| --- | --- | --- |
| TC-OUT-EXPORT-001 | `polygon-clipping` default 객체의 실제 `union` 함수 호출, ESM 진입점 호환 | Unit 작성·미확인 |
| TC-OUT-EXPORT-002 | PRECISE 겹친 정사각형 면적 80 WCS² | Unit 작성·미확인 |
| TC-OUT-EXPORT-003 | ANSI 포함 Webpack import/export 오류가 빌드 exit 0이어도 fatal 판정 | Unit/Build 게이트 작성·미확인 |
| TC-OUT-E2E-001 확장 | Production Worker PRECISE 확정→JSON 파일의 SHA/Version/Handle/Polygon Ring/10,000 WCS² 실제 확인 | E2E 작성·미확인 |
| TC-OUT-PERF-002 | CI `npm run test:outline-benchmark -- --quick`에서 synthetic 1k 파서·인덱스·계산 | CI Step 작성·미확인 |
| TC-OUT-REAL-003 | 내부 승인된 실DXF 3종 Source-only `npm run audit:outline -- --file ...`: SHA/Entity 안정성/OCS·단위/CPU·메모리; 원본 불변 | 현장 원본 미제공·미실행 |
| TC-OUT-REAL-004 | 실제 1k/10k/100k 도면의 화면 1:N Renderer/Worker/GPU·클릭 p50/p95와 CAD 수치 기준값 교차 확인 | 미실행 |
| TC-OUT-P4-002 | Owner 권한 정책 승인 후 OIDC 또는 로컬 인증/RBAC/Version scope/서버 재계산/CRUD/revision 409/감사 | 정책 미승인, 구현 보류 |

미실행 TC를 PASS로 기록하지 않는다. 신규 PR CI가 성공하더라도 실설비 도면 수용·P4 완료와 구분한다.


## Issue #31 잔여 검증 — 0.28.1 (PR CI 전)

| TC | 방법/Acceptance | 상태 |
| --- | --- | --- |
| TC-OUT-MAP-001..003 | unique Handle/1:N Renderer World bounds 합산, 타입·레이어·좌표 mismatch 차단 | Unit 작성·미실행 |
| TC-OUT-SPATIAL-001..002 | 1,000개 selection bbox ↔ brute-force 동일, giant Entity Overflow 상한 | Unit 작성·미실행 |
| TC-OUT-DRAFT-001..004 | Version/SHA/불안정 ID/중복 참조/비유한 좌표/열린 ring/Algorithm 거부 | Unit 작성·미실행 |
| TC-OUT-E2E-001 확장 | 실제 브라우저에서 source-render mapping exclude=0, 기존 Selection/Preview/Fullscreen/JSON | E2E 작성·미실행 |
| TC-OUT-BENCH-001 | `npm run test:outline-benchmark`로 synthetic LINE 1k/10k/100k index/query/convex/heap delta JSON | 실행 수치 미확인 |
| TC-OUT-REAL-001 | 실제 DXF 소·중·대형 3종: WCS·BLOCK/INSERT·Layer/OCS·Hash·외곽선 면적 및 좌표 대조 | 현장 샘플 미제공/미실행 |
| TC-OUT-REAL-002 | 실도면 1k/10k/100k Pan/Zoom/FullScreen·Worker·GPU·browser heap/input p50/p95 반복 | 현장 샘플/측정 미실행 |
| TC-OUT-P4-001 | 정책 결정 시 401/403/CSRF/Version FK/SHA canonical reparse/CAS revision409·삭제 정합성 | Owner Auth Policy 결정 대기 |

측정한 조건·설비·Node/브라우저·CPU/RAM·도면 Entity 구성·Unit/Scale 및 실제 실행값 없이는 PASS 판정하지 않는다. synthetic benchmark는 기본 PR CI에 자동 추가하지 않는다. [Issue31](Issue31.md).



### Issue #26 / CI #55 — 기존 Workflow E2E 페이지네이션 비의존성

- TC-E2E-001: V1과 V2를 2026-09-08 business registeredAt으로 등록하더라도 목록에는 다른 E2E에서 생성한 최신 2026-10-16 항목이 25개 이상 있을 수 있다. 최초 '/ ' 목록의 page 1에 새로 등록된 과거 일자 Version이 있다는 전제를 제거한다.
- 등록 성공(HTTP 201 및 Vn 등록 완료) → 목록 이동 → 원본 파일명 release-vN.dxf로 UI 검색 → 현재 업로드 response.id 기반 version 행의 파일명과 ● Current 상태 확인. 전체 목록 페이지 분할 및 기존 Current 교체·검색·Viewer 검증은 유지한다.
- CI #55 (38878433970)는 browser E2E 40/41 PASS. TC-TEXT-E2E-001 양 renderer PASS, TC-E2E-001만 FAIL, Legacy migration skipped. 새 PR CI로 전체 E2E 및 legacy migration을 확인한다.


### Issue #26 — main(#31) 통합과 캐시 인덱스 로딩 종료 회귀

- TC-TEXT-E2E-001: dxf-viewer→three-dxf-viewer 및 역방향 전환 시 동일 메모리 CAD 원본/인덱스 재사용, "검색용 텍스트를 분석 중" 상태가 종료되고 "검색 결과 3개"가 표시되며 World focus가 가능해야 한다. 기존 #54의 두 렌더러 공통 실패를 재검증한다.
- TC-OUT/Issue31 기존 객체 선택·외곽선 E2E는 merge 이후에도 유지하며, SelectionController와 CadTextSearch가 공통 Viewer shell에서 서로 간섭하지 않아야 한다.
- 기존 main version 0.27.0에 DXF 검색 기능을 추가하므로 병합 후보 version 0.28.0. 전체 lint, unit, build, E2E, legacy migration과 Docker PR CI 결과는 새 run 이후 판정한다.



### Issue #26 / CI #52 — Fixture source and presence regression gate

- TC-TEXT-FIXTURE-001 (Unit): actual DXF fixture shared by Browser E2E must contain exactly 3 parsed TEXT hits and 1 parsed MTEXT hit. Its MTEXT has 41=240, 71=1, 72=1 and rendered/searchable string "검사 구역 45"; verify three copies of "abc 123" separately.
- The Browser TC-TEXT-E2E-001 must import the SAME fixture generator, not maintain a duplicate DXF literal or entity creation hidden after a single-line comment. Build each DXF group-code/value as array members and join with real newline characters.
- CI #52 demonstrated 125 successful Unit/Integration tests but no fixture coverage, causing Browser E2E to fail at the MTEXT search after three TEXT navigation assertions. Corrected scope requires Unit fixture gate first, then complete Browser E2E and Legacy migration E2E.
- CI #52 run: https://github.com/planner77/layoutManager/actions/runs/38872015982



### Issue #26 / CI #49 Browser E2E MTEXT renderer interoperability

- TC-TEXT-E2E-001의 합성 DXF MTEXT 필수 명시값: group 41=240(reference width), group 71=1(top-left attachment), group 72=1(left-to-right); TEXT group 5는 16진 handle을 사용한다.
- 수용: dxf-viewer와 three-dxf-viewer 각각 최초 표시 성공, 3개의 분리된 TEXT 결과에서 위치 이동·줌, MTEXT 검색·이동, 전체 화면과 renderer 전환 뒤 재검색, 원본 다운로드 단 1회 유지.
- CI #49에서 38개 Browser E2E 성공, 새 두 케이스는 MTEXT 71 누락으로 RenderMText "Unhandled alignment". 수정 후 신규 CI에서 두 케이스, 기존 38개, Legacy migration 검증 확인 필수.
- 근거: https://github.com/planner77/layoutManager/actions/runs/38868174246



### CI #46 대응 — TC-TEXT-001과 011

- TC-TEXT-001: 실제 MTEXT 그룹 코드 fixture에 fraction 앞 명시적인 ASCII 공백이 있으며 표시 문자열 "생산 ABC 동 12 1/2가"와 정확히 일치하는지 확인한다.
- TC-TEXT-011: group 3 + 1 연속 텍스트 "AB"+"CD"는 "ABCD", "AB "+"CD"는 "AB CD"가 되어야 한다. 데이터에 없는 공백을 검색 문자열에 조작해 넣지 않는다.
- 신규 PR CI에서 Unit/Integration을 통과하고 나서 Build/Browser E2E를 확인한다. 이전 CI #46의 Build/E2E는 미실행으로 기록한다.



### Issue #26 — CI #42 보완 회귀

- TC-TEXT-010: DXF Unicode escape \U+00B0C는 °C, MTEXT/검색 키 동일 처리. Reviewer의 4자리 고정 escape 계약을 unit/dxf-text-index.test.ts에서 검증한다.
- UI 규칙: viewer.tsx 렌더 중 ref.current를 참조하지 않고 getter를 통해 effect/이벤트에서만 사용한다. PR CI ESLint react-hooks/refs와 기존 Viewer E2E를 회귀 기준으로 한다.
- PR CI #42에서 ESLint 실패하여 Unit/Browser는 미실행이었다. 수정 후 새로운 CI 결과를 실제 확인하기 전 수용 PASS 아님.



## Issue #26 — 검색/좌표/생명주기 검증 계획 (0.27.0)

| Test case | 기준 | 증거 위치 | 상태 |
| --- | --- | --- | --- |
| TC-TEXT-001 | TEXT/MTEXT·한글·영문·숫자·NFC/서식/개행 일치 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-002 | 동일 문자열의 3개 서로 다른 좌표 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-003 | BLOCK base point와 2D scale/rotation/translate | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-004 | hidden/OCS/ATTRIB/없는 BLOCK 제외 기록 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-005 | 손상/이진/HTML literal 안전성 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-006 | 순환 INSERT 조기 종료 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-E2E-001 | 두 DXF 렌더러, 3위치 Pan/Zoom, 검색, 전체 화면, Renderer 변경 원본 공유 | e2e/text-search.spec.ts | CI 전 |
| TC-TEXT-007 | Manager focus 위임, 이상 bbox 거부, Worker 취소·재시도 | viewer unit + 환경 회귀 | 증거 확대 필요 |
| TC-TEXT-008 | Layer 숨김, 빠른 연속 검색/Version 교체, 2만 건, 모바일 | 확대 E2E/실도면 | 미실행 |
| TC-TEXT-DWG | 실제 DWG TEXT/MTEXT 추출→렌더링→focus 기술 검증 | 독립 DWG 실험 | 미실행/비지원 |

검증 기준: 실제 camera 중심 이동/줌, 다른 Version 유실·worker 누수 없음, 검색 결과가 이전 Version 좌표를 참조하지 않음. 외부 실도면 미제공으로 합성 fixture와 운영 인수 기준을 구분한다. 테스트 실행 전 PASS를 기입하지 않는다.


## Issue #31 — 검증 계획 (0.27.0 PR CI 재검증 전)

| Case | 증거 계획 | 현재 상태 |
| --- | --- | --- |
| TC-OUT-ID | 합성 DXF Unique/Duplicate Handle, Version/SHA, 회전·스케일 INSERT WCS | Unit 코드 작성·미실행 |
| TC-OUT-GEO1 | Monotone Hull 극점/공선/원호·OCS 실패 | Unit 코드 작성·미실행 |
| TC-OUT-GEO2 | 오목 L, 중첩 Union, MultiPolygon, hole, 연결 LINE, 열린/자기교차, 오목 경계와 교차하는 도형 | Unit 확장·미실행 |
| TC-OUT-E2E-001 | DXF Viewer 클릭/영역, 볼록·정밀 Preview/JSON, fullscreen/reload, preview 무효화·CSS fallback Esc | E2E 확장·미실행 |
| AC-SEL-002/REG-001 | 기존 전체 DXF/DWG/레이어/Fullscreen/Version E2E 무회귀 | PR CI 대기 |
| AC-ID-001/AC-PERF-001 | 실제 설비 DXF Object3D↔Entity mapping 및 1k/10k/100k 수행시간·정확도 | P0/P5 BLOCKED(샘플·실측 필요) |
| AC-DATA-002 | 쓰기 정책/무권한/동시 충돌 검증 | P4 BLOCKED(Owner 권한 정책 결정 전) |

실행하지 않은 항목을 PASS로 기록하지 않는다. [Issue31](Issue31.md) 상세 추적표 참고.


## Issue #28 — 이미지 경량화 검증 항목 (0.26.0)

| TC | 검증 내용 | 자동 검증 | 현재 |
| --- | --- | --- | --- |
| TC-IMAGE-001 | standalone PORT/기존 `--port` 계약 | `standalone.test.ts` | CI 전 |
| TC-IMAGE-002 | static/font/license/WASM 복사 및 HTTP 접근 | unit + Docker curl + Viewer E2E | CI 전 |
| TC-IMAGE-003 | migrator/runtime 타깃 구분/완료 의존 | unit + Compose config | CI 전 |
| TC-IMAGE-004 | 3단계 크기/레이어/비압축·gzip 측정 | Docker job `measure-images.sh` | CI 전 |
| TC-IMAGE-005 | 빈 DB migration→backfill→health 200 | Docker compose fresh install | CI 전 |
| TC-IMAGE-006 | migration 실패 시 nonzero/app 기동 차단 | 불가용 DB 경로 + depends_on | CI 전 |
| TC-IMAGE-007 | migration 재실행/legacy 데이터 불변 | Docker rerun + legacy E2E | CI 전 |
| TC-IMAGE-008 | DXF/DWG/삭제·S3 기능 회귀 | 기존 Unit/E2E/S3 | CI 전 |
| TC-IMAGE-009 | UID10001, native, Secret 제외, GHCR 복수 태그 | Docker/CI/Publish 확인 | CI 전 |
| TC-IMAGE-010 | 로컬/tagged/tagless/registry port/digest 이미지 쌍 정규화·검증 | `compose.sh --print-images` + unit (Linux) | 재검증 대기 |
| TC-IMAGE-011 | 두 GHCR candidate 성공 전 공개 태그 게시 금지, release 취소 방지 | workflow 순서/후보 태그 unit + 게시 단계 | CI 검증 전 |
| TC-IMAGE-012 | Compose Node 초기 기동 중 connection reset(56) 회복 | PR Docker smoke: `curl --retry-all-errors` health/restart | 실패 run 38858349603 보완·재검증 대기 |

실제 실행 전 PASS를 기록하지 않는다. 독립 QA/실서비스 DB·S3 검증은 별도이다. `Issue28.md`와 `TestReport.md` 참고.


## GitHub #7 — 목표 0.19.1

- TC-TITLE-001: 목록·등록의 banner 홈 링크 accessible name `Layout Manager`, CAD/P.O.C. 부재, 아이콘 및 홈 이동 보존. 실제 화면 캡처와 기존 관련 Browser 회귀, typecheck/lint/build로 검증한다.
- root 요구/AC → Sol 공통 layout 문구 수정 → root review → Luna 독립 검증 → root commit/push·GHCR 이미지 확인·백업/배포·이슈 종료. DB/API/Viewer 변경 및 신규 중복 테스트는 없다.

## GitHub #6 — 목표 0.19.0

- TC-NAME-001: 이름 생략/공백 기본값, trim/NFC,255/256 경계·제어문자/타입 거부, HTML plain text. 실제 transaction 순번 V1/V2 및 삭제 후 순번 비재사용으로 기본 이름 계산을 검증한다.
- TC-NAME-002: 실제 multipart에서 사용자 이름/설명/기존 필드 모두 등록, 공개 응답·list/Location/Viewer 표시 일치, 원본 파일명 검색/bytes 보존 및 잘못된 입력의 정리 확인.
- TC-NAME-003: Browser에서 기본 이름 안내·선택 입력·사용자 이름 우선·새로고침 유지·기존 파일명 보조 표시/검색·Viewer/삭제 확인 이름, 긴 이름의 목록 레이아웃을 검증한다. 기존 이름 기반 E2E locator는 보조 파일명 또는 의미에 맞게 수정한다.
- TC-NAME-004: 0.18.0 populated DB에 새 migration 적용, 기존 모든 metadata/Current/hash/locator/순번 보존과 기본 이름 조회, FK 및 재실행을 검증한다. typecheck/lint/unit/build/local 전체 E2E·S3 통합·DWG 회귀를 수행한다.
- root Manager 요구/설계 기록 → Sol Developer 구현/집중 시험 → root review → Luna QA 독립 검증/문서 → root commit/push·이미지 검증·백업/배포·GitHub 댓글/종료.

## GitHub #5 — 목표 0.18.0

- TC-LAYER-001: 서로 겹치지 않는 3개 레이어의 합성 DXF를 실제 three-dxf-viewer에서 연다. 초기 전체 선택, 여러 항목 토글 후 메뉴 유지/체크 상태/선택 개수, canvas 이미지의 차이 및 재선택 복원을 확인한다. 전체 해제→빈 canvas, 전체 선택→원래 canvas 복원을 확인한다. 메뉴 overlay를 닫고 canvas 픽셀을 비교한다.
- TC-LAYER-002: 메뉴 닫기/재열기 시 선택 유지, 재로드/Renderer 전환/다른 Version 이동 시 초기화와 이전 항목 미노출. 레이어 조작 동안 원본 GET 및 Viewer canvas 재생성 없음, 기존 20회 Viewer 전환/오류/빈 도면/DWG 회귀에서 메뉴 부재를 확인한다.
- TC-LAYER-003: 키보드 열기/이동/Space 토글/Escape 닫기·포커스 복귀, 긴 이름/많은 항목과 좁은 viewport의 메뉴 경계/내부 스크롤·전체선택 버튼 접근. 실제 합성 fixture와 화면 근거로 확인하며 미실행 범위를 구분한다.
- Manager AC/설계 → Sol Developer 구현/집중 시험 → Manager review → Luna QA typecheck/lint/unit/build/local 전체 Browser·DWG 전용 회귀/시각 확인 → root commit/push/게시/배포/이슈 댓글·종료. S3 저장소는 API/저장소 미변경으로 전체 재실행하지 않는다.

## GitHub #4 — 목표 0.17.2

- TC-DELETE-LAYOUT-001: 현행 빌드에서 긴 파일명/위치/Current 경고가 대화창 경계를 넘는지 재현하고 수정 후 같은 조건으로 비교한다. 목록과 Location 상세, desktop 1280×800 및 좁은 viewport 375×667에서 panel 및 내부 요소의 가로 넘침 0, 텍스트 줄바꿈과 입력/버튼 영역을 확인한다.
- TC-DELETE-LAYOUT-002: 높이가 낮은 viewport에서 dialog 내부 스크롤을 통해 내용/버튼에 접근하며, 포커스 초기화·Tab/Shift+Tab 격리·Escape/취소·호출 버튼 복귀와 비밀번호 초기화를 확인한다. 처리 중 Escape/외부 클릭은 닫지 않는다.
- TC-DELETE-LAYOUT-003: 잘못된 비밀번호, 202 정리대기 및 결과 불확실 UI도 줄바꿈/버튼 접근을 유지한다. 기존 실제 삭제 Browser 2건을 회귀한다.
- Manager가 AC/설계를 기록하고 Sol Developer가 구현/회귀 시험을 보강한 뒤 Luna QA가 typecheck/lint/unit/build/local Browser와 스크린샷을 검증한다. 기존 운영 데이터는 시각 재현·삭제 시험에 사용하지 않는다. 검증 뒤 root가 commit/push·GHCR 배포 및 이슈 결과 댓글/종료를 수행한다.

## GitHub #2 / #3 — 목표 0.17.1

- TC-DESC-005 강화: UI에서 여러 줄 메모 입력→등록→목록/Location/Viewer 표시→새로고침 후 유지. 기존 선택 필드·literal 검색도 회귀한다.
- TC-PREFLIGHT-001: 실제 브라우저 File의 100 MiB - 1 / 정확히 100 MiB / 100 MiB + 1 경계와 설정 변경에 따른 기준 일치. 과대 선택은 즉시 현재 최대 용량 안내·선택 초기화·POST 0회.
- TC-PREFLIGHT-002: 정상 파일 재선택으로 오류 해제·등록 가능; change 이벤트를 우회한 제출도 과대 파일 POST 0회. 기존 업로드 진단 UI 유지.
- TC-PREFLIGHT-003: 클라이언트 검증 우회 API에서 서버 FILE_TOO_LARGE/413 유지, 기존 정확한 서버 크기 경계 회귀.
- Manager(root)가 요구사항/AC를 기록하고 Developer 구현 검토 후 QA가 독립 검증한다. typecheck/lint/unit/build/관련 Browser 결과와 실제 소스 commit/push를 TestReport에 기록하고 통과한 이슈만 요약 댓글 후 닫는다.
- 게시 전 DELETE 회귀: 기존 미게시 변경의 repository 비밀번호 검증 누락을 보완하고 검증한 hash를 transaction에서 재확인한다. KDF 동시 실행/대기열·실패 시도 카운터를 제한하고, 원본 정리 대기202 및 결과 불확실 안내, backfill 검증을 실제 시험한다. 이전 U-DELETE 기록 중 실행 근거 없는 통과 주장은 이번 결과로 정정한다.

## Unit DELETE 실행 계획 — 2026-09-11 사용자 요청 / 목표 0.17.0

Manager 설계→Sol 구현→Manager review→Luna QA 시험/문서→Manager 판정→root release/운영 적용. 승인 범위는 신규 비밀번호·선택 Version 삭제·기존 비밀번호 `1234` 초기화다. 비밀번호/삭제 설정 변경이 있는 기존 데이터는 실제 적용 전 백업하고 검증한다. 이번 설계 기록 시 모든 아래 TC는 NOT RUN이다.

| TC | Acceptance Criteria / 시험 |
| --- | --- |
| TC-DELETE-001 | 신규 password 필수, 길이4/128 경계·누락·초과·제어문자·UTF8한도, 앞뒤공백/Unicode 그대로 검증, 랜덤salt로 같은 비밀번호 hash가 다름, 맞음/틀림·잘못된 hash 형식·KDF 제한. 평문 및 hash가 public DTO·로그·URL·HTML에 없음. |
| TC-DELETE-002 | Browser 등록 비밀번호→목록/Location 삭제 dialog→취소/오입력 시 불변→정답 명시 삭제→목록 제거. 입력 masking/비우기, 오류·429·네트워크 불확실 상태, 사용자 선택 외 자동 삭제 0회. |
| TC-DELETE-003 | DELETE HTTP: 누락/틀린 비밀번호/다른 Version 비밀번호/비UUID/외부 origin/잘못된 content-type·JSON/1KiB초과 거부. 60초 실패 횟수 및 KDF 동시수 제한. 성공200, 원본 정리대기202, 이미 삭제404. |
| TC-DELETE-004 | Current/non-Current/마지막 Version 삭제, 다른 Location 보존, Current=NULL(자동승격 없음), nextVersion 비재사용. 등록·Current 변경·동일 대상 삭제 경쟁/transaction rollback, 직접 SQL Current 소속 FK 유지. 목록/search/상세/metadata/content/Viewer 직접 링크 삭제 접근 차단. |
| TC-DELETE-005 | 실제 local/S3 삭제와 이미 없는 원본, storage 실패/응답 유실/job 삭제 실패/COMMIT 불확실을 주입. DB 승인 전 삭제 0회, DB 삭제 뒤 pending job 영속, 재시작 후 storage:cleanup의 승인 job만 처리·경로 보호·멱등, 사용자 원본 다른 파일 보존. |
| TC-DELETE-006 | 0.16.0 schema+여러 Version+Current+local/S3 locator fixture에서 migration/backfill. 기존 모든 행이1234로검증, salt독립, ID/순번/설명/hash/locator/Current 불변. 재실행/중단 후 재개가 신규 비밀번호를 덮지 않음. foreign_key_check·trigger 및 nextVersion 초기값 확인. |
| TC-DELETE-007 | password/hash/salt canary를 등록·삭제 실패, JSON·Console·서버 로그·진단파일·public DTO/HTML/검색 응답에 검사. 비밀번호 URL/로컬저장소 미사용, 잘못된 입력이 요청 dump로 남지 않음. |
| TC-DELETE-008 | typecheck/lint/unit/build/local E2E/S3 관련 E2E 및 기존 DWG/업로드 진단 회귀. Docker db:deploy/backfill→healthy, 실제 대상 DB 사전 백업·기존1234 확인(삭제 없이 hash검증), 버전/문서·commit/push·배포 결과를 실제 수행 범위로 기록. |

완료 시 `U-DELETE-20260911`에 요구→구현→TC→결과, 실제 역할·명령·counts/재작업·제약·DB 적용 및 배포 여부를 남긴다. 비밀번호 없는 기존 등록 클라이언트의400은 의도된 API 변경이며 release 안내에 명시한다.

## Unit OBS 실행 계획 — 2026-09-09 사용자 요청

- 범위: FR-OBS-001/002, NFR-OBS-001–003. Manager 설계→Sol 구현→Manager review→Luna QA 시험/문서→Manager 판정→root commit/push/배포. 목표 0.16.0, DB migration 없음. 실제 역할 대행은 TestReport에 기록한다.
- AC: 전체 안전 진단 표시·복사·저장과 서버 ID 기반 추적, 통신/프록시/업무 오류 구분, 민감정보 비노출, 기존 원본·Current 보존 및 자동 재등록 방지. 필수 typecheck/lint/unit/build/E2E와 관련 회귀 통과.

| TC | 검증 방법 및 기대 결과 |
| --- | --- |
| TC-OBS-001 | 실제 검증 오류의 화면 요약·상세에서 버전/시각/코드/상태/서버 ID 일치. 텍스트 선택·복사·JSON 다운로드 내용 일치 및 재시도 시 이전 오류 초기화. |
| TC-OBS-002 | Clipboard 없음·거부, 긴 내용: 안전 진단 전체를 스크롤·선택·저장 가능. 복사 실패에 미처리 예외가 없고 Console은 공개 진단만 출력. |
| TC-OBS-003 | Browser 주입: HTML 413/502/504, 빈 응답, malformed JSON, 임의 JSON 오류, 잘못된 2xx 성공 구조, 연결 중단. HTTP 상태 보존, 없는 서버 ID 표시, raw body/예외 비노출, 불확실 결과에 목록 확인 및 자동 재업로드 0회. |
| TC-OBS-004 | origin/context 초기화 실패에도 ID 확보. 실제 성공/실패 응답 header/body/log ID 일치, 동시 요청 격리, 실제 단계·경과 시간·최종 결과·backend 확인. |
| TC-OBS-005 | 격리 장애 주입: 용량 한도, 디스크 EACCES/ENOSPC, DB 실패, S3 연결/권한/timeout. 원인·실패 단계 보존, S3 공개 문구와 cause 분리, 이전 Current/원본 및 불확실 PUT 보존. 실장비 장애와 주입 시험을 구분. |
| TC-OBS-006 | 수신/DB 오류와 cleanup 오류 동시 발생 시 최초 원인 유지·별도 정리 경고. 확정 등록 후 임시 정리 실패는 성공 유지. COMMIT/DB 확인 불확실 시 기존 보상 원칙 유지. |
| TC-OBS-007 | 화면/Console/JSON 및 서버 로그에 canary credential, Authorization, credential URL, endpoint·경로, SQL+사용자 설명, 파일명/bytes, SDK 객체·순환 cause·개행·장문을 주입하여 허용 필드/마스킹/제한 확인. 안전한 운영 code/cause 식별은 유지. |
| TC-OBS-008 | Compose 격리 컨테이너의 logging driver/options, 요청 ID 로그 수집·검색, healthy/업로드/원본 보존·재생성 확인. 지정 GHCR 0.16.0 push/pull digest와 실제 배포 상태 기록. 로그 한도 도달 시험 미실행은 별도 명시. |

- TestReport `U-OBS-20260909`에 실제 명령/총수/결과, 재작업·미검증, 요구→구현→TC 근거 및 배포 결과를 기록한다. 실제 폐쇄망 장애 재현과 합성 장애 시험을 구분한다.

## Unit DESC 실행 계획 — 2026-09-09 사용자 요청

- 도면 설명은 CadFileVersion별 선택 입력으로 저장한다. 최대2000 UTF-16 code units, trim+NFC 및 CRLF/CR→LF 정규화, LF/TAB허용·기타제어문자거부, HTML은 plain text로 렌더링한다. 생략은 빈 문자열이며 등록 후 편집은 이번 범위에 없다.
- DB는 description TEXT NOT NULL DEFAULT '' additive migration, 기존 version/current/storage/원본 보존. 원본무결성 및 Location current 규칙을 바꾸지 않는다.
- 등록 textarea, 목록/Location 미리보기, Viewer 전체 설명을 표시한다. 별도 description 검색은 앞뒤공백제거/NFC 후 대소문자 구분 literal substring이며 filename/위치/형식/current와AND 조합한다. SQL instr parameter 사용, wildcard와query확장금지. 기존 paginationURL 보존.
- TC-DESC-001: 선택/생략/정규화/2000경계/2001초과/비문자/control/개행/HTML plain text 검증.
- TC-DESC-002: 기존schema+rows에서migration 적용 후 description빈값, Version/Current/원본locator보존, 신규등록설명영속.
- TC-DESC-003: 설명 단독/filename독립/기존filterAND/pagination/한글NFC/%/_/따옴표 literal/중복query거부.
- TC-DESC-004: API 설명등록·구버전설명생략·validationfail, 목록/상세/ViewerDTO의내용일치 및현재버전정합성.
- TC-DESC-005: UI에서 filename에없는설명단어 등록→설명검색만으로찾기→목록/Location/Viewer본문확인, HTML실행안됨/개행보존. typecheck/lint/build/unit/E2E 및문서schema검토.
- TC-LIST-004: 홈 목록에서 `Current 지정`을 눌러 선택한 Version을 Current로 변경하고 기존 Current 해제·새로고침 후 목록/필터 일치를 확인한다.
- Manager 설계→Sol 구현→Manager review→Luna QA검증/문서→Manager승인/재작업. 모델제한은사실대로기록하고root가release/실제DB백업·migration/게시를담당한다.

## Unit 8B 실행 계획 — 2026-09-09

- DWG Viewer가 Worker에서 측정한 WASM 초기화·DWG 파싱 시간을 공통 Metrics JSON에 전달한다.
- `parseMs`와 `initializeMs`가 실제 DWG 성공·partial 결과에서 null이 아니어야 하며, DXF와 실패·취소 결과의 미계측 사유는 유지한다.
- TC-MET-003: adapter stage metric 전달 단위 검증 및 등록 DWG Browser metric의 초기화·파싱 값/Entity 수/partial coverage 확인.
- Manager/Developer 사용량 제한으로 root가 구현·검증을 대행하고, 미실행된 실도면·장기 메모리·GPU/WASM 메모리 시험은 NOT RUN으로 기록한다.

## Unit DEPLOY 실행 계획 — 2026-09-08 사용자 요청

- Manager 설계→Sol Developer 구현/재작업 완료→Manager 리뷰. Luna QA 사용량 제한으로 root가 실제 시험을 실행하고 Manager가 결과·문서로 수용 여부를 판단한다. 패키지 버전 0.13.0, LINK 0.12.0과 commit 분리.
- TC-DEPLOY-001: `/api/health`가 migration 완료 DB에서 HTTP200 `{status:ok}`와 no-store, 조회 실패 시503의 안전한 상태만 반환. 기존 앱/API/CAD 회귀 및 type/lint/unit/build 통과.
- TC-DEPLOY-002: root context에서 Docker build 성공. named project/container/volume/network/port 및 한국어 주석, nonroot UID, Prisma native SQLite/WASM/한글 자산 확인. image에 실제 `.env`, Git 인증, 호스트 DB/원본이 없는지 검사.
- TC-DEPLOY-003: 별도 test volume/container에서 DXF 등록→원본 byte/hash/목록 확인→container 재생성→DB/원본 유지. 기존 서비스와 사용자 data/volume은 변경하지 않는다. 컨테이너가 healthy 상태가 되는지 확인.
- TC-DEPLOY-004: published port에 localhost 및 실제 host IP로 HTTP200/목록·등록/health 접속. 다른 물리 장치가 없으면 host 자신의 host IP 시험과 구분해 기록한다. private origin 링크는 네트워크 접근 조건을 명시한다.
- TC-DEPLOY-005: 지정 GitHub 소유자 GHCR에 검증한0.13.0 image push, digest 확인 및 pull 검증. credential은 password-stdin/임시 credential store 등 안전한 경로로 전달하고 image/buildarg/git에 넣지 않는다. 접근 실패는 권한·연결 범주만 기록.
- 완료 조건: 각 실제 결과/제약·README pull 및 setup 방법·Architecture/Operation/Decisions/ChangeLog 갱신, root audit/commit/push. 기능이 실행 가능해도 image push/pull 근거가 없으면 게시 완료라 하지 않는다.

## Unit LINK 실행 계획 — 2026-09-08 사용자 요청

- 특정 Version을 바로 여는 절대 URL을 목록·Location 버전 목록·Viewer에서 복사한다. Viewer에서는 현재 허용된 renderer를 유지하고 목록에서는 형식별 기본값을 사용한다. Current 교체 후에도 원래 Version을 연다.
- URL은 현재 origin과 Version viewer 경로 및 허용 renderer만으로 생성한다. 임의 query/hash, storage locator, 원본 다운로드 경로, credential을 포함하지 않는다. DB 변경 및 공개 접근권한 부여는 없다.
- TC-LINK-001: URL 생성 단위 검증 — Version 경로, DXF 선택, DWG 강제 선택, 부적합 renderer fallback, 불필요 query/hash 제외.
- TC-LINK-002: 목록·Location·Viewer에서 링크 복사 성공과 상태 안내; Clipboard 미지원/거부 시 읽기 전용 선택 가능 URL 및 클릭 가능한 링크 제공.
- TC-LINK-003: 새로운 Browser context에서 복사한 URL로 DXF 두 renderer 및 DWG를 직접 열어 Version/format/실제 표시 확인. Current 교체 이후에도 링크 대상 유지.
- TC-REL-001: typecheck/lint/build/자동 테스트/관련 E2E, 문서·버전·Secret 검사. Manager 설계→Sol Developer 구현 보고→Luna QA 시험·문서 보고→Manager 승인/재작업 순서. 커밋·Push 완료는 별도 최종 확인한다.

## Unit S3 실행 계획 — 2026-09-08 사용자 요청

- Local 기본값과 기존 원본을 보존하고 S3 호환 backend를 선택할 수 있게 한다. DB storage_path에 기존 상대 키 또는 s3:bucket:cad/object-id/original.ext locator를 기록해 혼합 조회한다. endpoint/credentials는 서버 env만 사용한다.
- TC-S3-001: 실제 격리 SeaweedFS에서 DXF/DWG byte/hash·Current·중복 등록·mixed local/S3 조회.
- TC-S3-002: PUT 실패, DB 실패 후 새 object 보상 삭제, 기존 원본/Current 보존, 404·잘못된 locator·credential 오류. PUT/COMMIT 결과 불확실 시 무조건 삭제하지 않는다.
- TC-S3-003: remote PUT이 DB transaction 전에 끝남을 확인하고 env 검증·원본 API streaming·Secret 비노출 확인. 기존 DXF/DWG 회귀.
- 실제 기존 SeaweedFS 서비스나 사용자 데이터는 변경하지 않는다. 자동 migration/파일 이동/버킷 생성은 앱에 추가하지 않고 테스트용 버킷만 별도 생성한다.

## Unit 7B 실행 계획 — 2026-09-08

- 등록 DWG Version 원본 API→LibreDwgWebAdapter/Manager→공통 Viewer UI 통합. DWG에서는 libredwg-web만 사용하며 query 조작도 DXF를 선택하지 않는다.
- 최소 기하 지원은 7A의 평면 LINE을 유지한다. 미지원/표시 제외 Entity는 건수를 보이고 result partial로 기록한다. 20 MiB 한도·원본 보존·DB 불변.
- TC-DWG-001–005/TC-E2E-002: 실제 샘플 UI 등록→검색→선택→표시, Zoom/Pan/Fit/Resize, reload/재진입/취소/Worker 및 canvas 해제. CIRCLE partial, 손상/미지원 헤더/WASM 404/content 404 및 재시도.
- TC-VIEW-001/003: 형식 매칭과 지연 Worker 결과 취소를 자동화. 기존 DXF 전체 회귀. 상세 DWG 계측/비교는 8B이다.

## Unit 7A 실행 계획 — 2026-09-08

- 독립 `/lab/dwg`에서 공식 고정 DWG 샘플을 Worker/WASM으로 파싱하고 model-space planar LINE을 직접 Three.js로 표시한다. 서버 등록/Viewer 선택 연결은 Unit 7B이다.
- TC-DWG-001/003/005: 정상 LINE, 반복 3회 load/free/임시 FS unlink/Worker 종료, 표시 확대 픽셀 변화, 해제 후 canvas 0; DXF 변환/Viewer 호출 없음.
- TC-DWG-002/004 최소 실험: 손상 파일과 WASM 404 실패를 거짓 성공 없이 안내. CIRCLE 샘플은 미지원 Entity 내역과 빈 LINE 결과를 확인한다.
- 일반 DXF E2E/자동 테스트 회귀, typecheck/lint/build. 실제 업무 DWG/전체 Entity/장기 메모리 평가를 이번 최소 실험과 구분한다.

## Unit 9A 실행 계획 — 2026-09-08

- TC-E2E-001: UI에서 동일 Location DXF 두 버전 등록 → 목록/검색 → Current V2 확인 → V1로 교체 → 새로고침/API 일치 → 선택한 V1을 두 Viewer에서 표시 → 원본 bytes와 측정 Version 확인. 임시 DB/Storage만 사용한다.
- TC-SWITCH-002: 기존 지연 응답/경쟁/원본 공유 시험을 20회 전환으로 확대하고 잔여 canvas/Worker/Blob/WebGL context를 확인한다.
- TC-REL-001: 전체 typecheck/lint/unit·integration/E2E/build, 문서·Schema·버전·Secret/산출물 제외 및 원격 일치 확인. 기능 변경이 없는 테스트/문서 릴리스 검증이므로 앱 버전 0.8.0을 유지한다.
- U8A의 동일 코드 성능 측정은 재실행하지 않는다. 실도면 fidelity·복잡한 Entity·업무 SLA는 미검증으로 유지하고 DXF P.O.C. 자동화 검증 결과와 분리한다.
- 원격 이슈 #2(등록 메모)는 확인했으며 신규 기능 후속 항목이다. 이번 Unit에서 DB/API 기능을 변경하지 않는다.

## Unit 8A 실행 계획 — 2026-09-08

- source 대기, Adapter 초기화, 통합 load/parse/prepare/render, 첫 animation frame 관찰, 파일 bytes·가능한 Entity 수·Browser·JS heap·결과를 기록하고 JSON으로 내려받는다. 분리 불가능한 parse와 GPU memory는 null+사유.
- TC-MET-001: 성공/빈 도면/실패/취소와 원본 memory/pending/miss 구분, 현재 선택과 기록 일치, export 형식.
- TC-MET-002: 생성 LINE fixture 100/10,000/100,000개(실제 byte 크기 기록)로 두 Viewer 각 cold/warm 5회. cold는 새 Browser context, warm은 같은 Version의 메모리 원본 재사용. 개별/median/min/max, console/pageerror, 확대 입력→frame 관찰을 기록한다. 실제 업무 도면 SLA/충실도는 미검증.

## Unit 6 실행 계획 — 2026-09-08

- 하나의 Version 화면에서 버튼으로 양방향 전환, 문서 navigation 없음. 원본 다운로드는 화면 수명 동안 한 번 공유하고 Adapter별 독립 bytes 복사 제공.
- TC-SWITCH-001: 실제 두 Viewer 양방향 전환, Version/metadata 유지, HTTP content 1회, URL renderer 반영, canvas 한 개 및 정상 표시.
- TC-SWITCH-002: 빠른 전환/지연 fetch/이전 load 무시, 재시도, 10회 전환의 context/canvas/Worker/Blob URL 정리. 메모리 정량 검증과 실제 resource 정리 검증을 구분한다.

## Unit 5 실행 계획 — 2026-09-08

- three-dxf-viewer 1.0.44의 getFromPath 결과를 별도 Three 0.171 Scene/Camera/OrbitControls로 표시. 기존 dxf Adapter와 자원 공유 없음.
- 한글 TTF 원본/라이선스를 포함하고 Three typeface JSON은 build/dev 때 재생성한다. dxf는 TTF, three는 JSON으로 동일 font를 사용한다.
- TC-THREE-001: 같은 LINE/CIRCLE/TEXT 한글 fixture 표시, 확대/축소/Pan/Fit/Resize/재진입/오류/빈 도면. TC-CAP-001: Layer 실제 표시/숨김, Hover/Select/Snap의 API 및 cleanup 가능성 평가, 미실행은 미검증.
- Unit 5는 renderer URL로 각각 선택하고 Unit 6의 페이지 reload 없는 전환·byte 재사용·stress 검증과 구분한다.

## Unit 4 실행 계획 — 2026-09-08

- 등록 DXF의 원본 ID 경로에서 Browser 전용 Adapter/Manager를 통해 실제 WebGL 표시. DWG는 후속 구현 안내만 표시한다.
- dxf-viewer 1.0.48 실제 API 기준으로 Worker, Zoom/Pan/Fit, Resize, 재시도/재진입, 취소 및 Dispose를 검증한다. 기본 font 미제공과 실도면 fidelity 미검증을 명시한다.
- TC-DXF-001: 생성 LINE/CIRCLE fixture 등록→목록→Viewer→canvas의 실제 픽셀 확인, 확대/축소/Fit/Pan/Resize 및 재진입.
- TC-DXF-002: 손상 DXF 오류와 재시도, 빈 도면 안내. TC-VIEW-001/003: 허용 형식, 늦게 끝난 이전 load 무시, cleanup 자동화.

상태: Unit 9A DXF 회귀 결과는 U9A-20260908을 참조한다. Unit 0–3 검증 완료, Unit 4/5/6/8A 결과는 U4/U5/U6/U8A-20260908을 참조한다. GitHub #1 회귀 결과는 U3-20260908에 기록했다. 요구 ID는 [Requirements](Requirements.md), 실행 결과의 기준은 [TestReport](TestReport.md)이다. 여기의 기대 결과는 PASS 기록이 아니다.

## Unit 구성과 순서

2026-09-07 사용자 지시에 따라 DXF를 먼저 출시하고 DWG는 다음 MINOR 버전으로 분리한다. 실행 순서: **0A(완료) → 0B → 1 → 2 → 3 → 4 → 5 → 6 → 8A → 9A → DXF 릴리스 → 7A → 7B → 8B → 9B → DWG 릴리스**. 8A/9A는 DXF 계측/통합, 8B/9B는 DWG 확장/회귀이다. DWG 실험 실패나 sample 부재로 DXF 구현을 막지 않는다. 근거: ADR-011.

| Unit | 범위 / 선행 조건 | Acceptance Criteria | 테스트 / 예상 산출물 |
| --- | --- | --- | --- |
| 0A 문서 Bootstrap | Workspace·Git 조사, 요구/설계/계획 | 진입/필수 문서·추적·중요 확인사항 작성, secret 없이 remote 비교, ignore 검증, src 기능 코드 없음 | TC-BOOT-001/002, TC-DOC-001, TC-GIT-001; 문서 변경·검사 결과 |
| 0B 실행 기반 | 0A 계획 확인 | src 내 Next.js/TS/shadcn/Tailwind, 테스트 도구, SQLite/Prisma, 앱 전용 env 로딩, exact package/lock; 기본 page·DB 연결·build/type/lint 성공 | TC-BOOT-003/004, TC-SEC-002; 재현 가능한 scripts, 환경 version 기록 |
| 7A DWG 기술 실험 | DXF 릴리스 이후 | 실제 배포본 API 확인, WASM 초기화→정상 DWG parse→최소 기하 표시→free/dispose, DXF 우회 없음; parser와 자체 renderer 경계·제약 기록 | TC-DWG-001/003 최소 subset, TC-DWG-005; 독립 harness·재현 근거. mock만으로 통과 불가 |
| 1 Location/DB | 0B 완료 | Migration, 위치 Unique, 여러 Version, 소속 검증, Current 0/1·교체·rollback·경쟁 정합성 | TC-DB-001–007; Repository/Service, schema 대조 |
| 2 Upload | 1 | 두 형식·metadata·hash·파일 저장·DB 등록, 모든 invalid/실패 상황에서 정합성 유지 | TC-UP-001–005, TC-API-001/002/003/004, TC-SEC-001; Upload와 content/current API |
| 3 목록/검색 | 2 | 필수 columns, 7조건 단독/조합·페이지·빈 결과, 위치별 버전/Current 변경 UI | TC-LIST-001–003, TC-API-005, TC-UI-001; 관리 화면 |
| 4 dxf-viewer | 3 | 공통 Manager/Adapter 기반, 정상 DXF 실제 표시, 기본 controls, 손상/재진입/resize/dispose 처리 | TC-VIEW-001–003, TC-DXF-001/002; 첫 DXF Adapter |
| 5 three-dxf-viewer | 4 | 같은 DXF 표시·기본 controls, Layer/Hover/Select/정보/Snap의 지원 수준을 실측 평가 | TC-THREE-001, TC-CAP-001 해당 Viewer; 두 번째 Adapter |
| 6 DXF 전환 | 5 | 두 방향 전환에서 Version bytes 동일·reload 없음·이전 dispose·경쟁 load 결과 무시·자원 누적 검사 | TC-SWITCH-001/002; 전환 통합 |
| 7B DWG 통합 | 6·7A | 원본 API 기반 DWG만 표시, WASM/손상/미지원 format 오류, 반복 load/재진입/dispose, UI DXF 선택 차단 | TC-DWG-001–005 전체, TC-VIEW-001–003 DWG; 실제 등록→Viewer |
| 8 Metrics/평가 | 8A: 6 / 8B: 7B | 정의된 load/parse/first display/size/entity/error/browser, 미계측 사유, 반복 비교·대형 파일·기능/Entity 표 | TC-MET-001/002, TC-CAD-001, TC-CAP-001 전체, TC-EVAL-001; TestReport 근거 |
| 9 통합/회귀 | 9A: 8A / 9B: 8B | DXF E2E 자동화, DWG 흐름 가능한 자동화+실제 표시 수동 확인, Current 모든 계층 일치, 최종 DoD | TC-E2E-001/002, TC-ERR-001, TC-ARCH-001, TC-REL-001 및 전체 관련 회귀 |

0A는 문서 검사만 수행한다. 코드가 있는 각 Unit은 Build·Type Check·Lint·관련 자동 테스트·필요한 E2E/수동 테스트와 문서/README/diff 검토/Commit/필요 시 Push가 모두 충족되어야 완료이다. Sample 미제공이나 환경 실패는 BLOCKED/NOT RUN이지 PASS가 아니다.

## 테스트 도구·격리

- Unit/Integration: Vitest 후보, 실제 SQLite 임시 DB+실제 migrations, filesystem 임시 디렉터리. Business Rule 검증은 mock DB로 대체하지 않는다.
- Component: React Testing Library 후보. Manager의 선택·취소·dispose는 fake Adapter를 쓰되 실제 렌더링 시험과 구분한다.
- E2E: Playwright 후보. 테스트 서버와 임시 Storage 사용. API는 실제 HTTP multipart/content까지 확인한다.
- Rendering: 실제 WebGL/WASM Browser smoke + 동일 Sample 수동 비교. headless software GPU는 시험 환경에 명시하고 실제 데스크톱 성능으로 일반화하지 않는다.
- 최초 자동화 기준 Browser는 Chromium, 수동 기준은 데스크톱 Chrome/Edge; 다른 Browser는 조사 대상으로 표기한다. 정확한 버전·OS·CPU/GPU/RAM/화면/DPR은 실행 시 기록한다.
- 테스트 프로그램·생성기는 src/tests에 두며 사용자 CAD와 Runtime DB는 Git에 넣지 않는다. 최소 DXF는 테스트 코드로 임시 생성, DWG는 이용 허가된 외부 fixture를 로컬에서 제공하고 출처·hash·format을 기록한다. 공개 CAD라도 무단으로 다른 저장소에 업로드하지 않는다.
- 장애 주입: ENOSPC/EACCES, DB insert/commit 오류, body 중단, WASM 404, Parser throw, 느린 완료 순서. 현재 사용자의 파일/DB에 장애를 주입하지 않는다.

## Test Case 카탈로그

각 ID는 여러 assertion/parameter case를 가진 시험 시나리오이다. 실제 framework test 수는 실행 시 별도 기록한다.

| TC ID | 종류 | 방법·입력 | 기대 결과 |
| --- | --- | --- | --- |
| TC-BOOT-001 | 문서/구조 | 필수 문서·src placeholder·package 존재 여부 확인 | 필수 산출물 존재, 0A에서 기능 코드/설치 없음 |
| TC-BOOT-002 | 보안/설정 | git check-ignore 대표 env/DB/CAD/cache, 후보 파일 secret scan | 민감 파일 제외, .env.example·out 문서 추적 허용, 실제 env 값 미포함 |
| TC-BOOT-003 | Build/smoke | install lock→typecheck→lint→test→build→start→GET / | 각각 exit 0, 200 page, SSR DOM 오류 없음 |
| TC-BOOT-004 | 설정/DB | 루트와 src cwd에서 설정 로딩, DB read/write, 잘못된 설정, child env 검사 | 동일 absolute 경로, 검증 오류 명확, Git 인증 미전달 |
| TC-DOC-001 | 문서 review | 내부 링크, 요구 ID↔TC, 각 Unit AC, 사실/실행 구분 | 참조 유효, 누락/중복 ID 없음, 미실행 PASS 없음 |
| TC-GIT-001 | Git read/review | 비밀값 비출력 remote 비교/ls-remote, branch/status/log, precommit review | 지정 remote 일치, 연결 결과·미검증 권한 구분, 기존 변경 보존 |
| TC-DB-001 | DB integration | 동일 4값/다른 floor/trim/NFC/동시 생성 | 중복 Location 거부/재사용, 다른 위치 독립 |
| TC-DB-002 | DB integration | V1/V2, invalid location, 순번 중복·경쟁 insert | 여러 Version 허용, FK/Unique 유지, 충돌 결과 결정적 |
| TC-DB-003 | DB integration | 0개 Current, V1 지정, 여러 Location 비교 | 각 Location에서 pointer 기반 Current 수 ≤1 |
| TC-DB-004 | DB integration | V2→V3 Current, 동일 요청 재실행 | V2 해제/V3 지정, 다른 Location 불변, 멱등 |
| TC-DB-005 | DB integration | pointer 변경 중 fault, 두 연결 경쟁 | rollback 이전 Current 보존, 유효한 한 pointer 또는 명시적 충돌 오류 |
| TC-DB-006 | DB direct SQL/API | 타 Location·존재 안 하는 Version 지정, Current 대상 삭제 | DB FK에서 차단, API에서도 거부, pointer 유지 |
| TC-DB-007 | migration/review | 새/기존 임시 DB migration, pragma FK/index/table 검증 | foreign_keys 켜짐, foreign_key_check 위반 0, Database.md와 일치 |
| TC-UP-001 | API integration | 정상 DXF/DWG multipart+metadata | 201, bytes hash 일치, 같은 Location version 증가 |
| TC-UP-002 | API integration | 파일 누락/0 bytes/.pdf/대소문자 확장자/한도 경계±1/중단 | 정상 확장자만 허용, 한도 이하 수락, 초과/invalid 거부, 잔여 DB 행 없음 |
| TC-UP-003 | API integration | 4값 공백/초과길이, invalid 날짜·boolean·누락 | 서버 400, UI field 안내, 유효 날짜와 false 값 정확 보존 |
| TC-UP-004 | integration | 같은 bytes 2회, 다른 bytes | hash 정확, 중복 식별, 정책대로 새 Version 허용, overwrite 없음 |
| TC-UP-005 | integration/fault | Storage 실패, DB rollback/commit 불확실, 프로세스 중단 orphan | 거짓 성공 없음, 기존 Current/원본 보존, 정리/복구 경로 식별 |
| TC-API-001 | HTTP | Upload DTO와 상태·multipart boundary/한도 | 문서 contract 준수, JSON에 storage path 없음 |
| TC-API-002 | HTTP | metadata query/body invalid 값 | validation error envelope, stack/SQL/env 비노출 |
| TC-API-003 | HTTP | 등록 ID/unknown ID/파일 유실 content 요청 | 원본 bytes 200, 없음 404, 안전한 headers |
| TC-API-004 | HTTP/UI | Current 교체·동시 요청·타 Location ID | pointer 한 개, 올바른 오류, UI 변경 후 일치 |
| TC-API-005 | HTTP | 목록·검색·pagination request | items/total/page 정확, 최대 pageSize 제한 |
| TC-LIST-001 | integration/component | 다양한 등록일/Current/format, 0개 결과 | 필수 columns, 결정적 정렬, empty state |
| TC-LIST-002 | integration | 7조건 단독+AND, 한글/공백/%/_/따옴표 검색 | 정의된 exact/substring, SQL injection 없음, 페이지 결과 일관 |
| TC-LIST-003 | E2E/component | Location 선택→과거 Version 선택→Current 교체 | 선택 ID 유지, 상세/목록 재조회 결과 일치 |
| TC-SEC-001 | integration | ../, encoded traversal, absolute path ID, 조작 저장 키, 외부 symlink | 저장 루트 밖 읽기/쓰기 불가, 민감 경로 미노출 |
| TC-SEC-002 | build/log review | client bundle/server log/child process env/staged files 검사 | Secret/Authorization/CAD bytes/런타임 DB 포함 없음 |
| TC-VIEW-001 | component | DXF/DWG mount, invalid adapter 요청 | 형식별 허용 Adapter만 생성, DWG DXF 선택 없음 |
| TC-VIEW-002 | real browser | 각 Viewer Zoom ±/Pan/Fit/resize | 기하 위치/화면 변화 확인 또는 미지원 근거 기록 |
| TC-VIEW-003 | component/browser | 재진입, Strict Mode, unmount 중 load, 반복 dispose | orphan canvas/RAF/listener·늦은 렌더링 없음 |
| TC-DXF-001 | real browser | 정상 생성 DXF 및 sample | 화면 기하 존재 확인, load 성공, metadata ID 일치 |
| TC-DXF-002 | real browser | malformed/truncated DXF | Parse 오류/부분 경고, 빈 canvas 거짓 성공 없음 |
| TC-THREE-001 | real browser | TC-DXF-001와 같은 bytes + malformed | 실제 표시·기본 controls·오류 상태·해제 확인 |
| TC-SWITCH-001 | component/E2E | Dxf→Three→Dxf, 빠른 전환·느린 이전 load | page reload 없음, 동일 ID/hash, 이전 dispose, 최신 결과만 표시 |
| TC-SWITCH-002 | real browser/manual | 20회 전환/재진입, cache 조건 고정 | 남은 canvas/worker/listener 증가 없음, 메모리 추세/관찰 한계 기록 |
| TC-DWG-001 | real browser | 이용 가능한 정상 DWG bytes | WASM parse→직접 렌더링, 객체/화면 증거; 7A는 최소 기하 |
| TC-DWG-002 | real browser | 손상/잘린/지원 안 되는 DWG revision | 처리 실패·지원 범위 표시, DXF fallback 없음 |
| TC-DWG-003 | real browser | 초기화→반복 load→재진입→dispose | allocation/free 대상 확인, Worker/임시 FS/geometry 자원 해제 |
| TC-DWG-004 | real browser | WASM asset 404/MIME 오류/초기화 reject | WASM Load와 Parse 오류 구분, retry 가능 |
| TC-DWG-005 | source/runtime review | 의존성/실제 parse→render 경로 관찰 | DXF 변환/두 DXF Viewer 호출 없음, parser/자체 render 범위 기록 |
| TC-CAP-001 | real browser/manual | 각 Viewer Layer 조회/On-Off, Hover, Select, 정보, Snap | 지원/부분/미지원/미검증 + 근거·제약, 불가 기능 UI에서 사용 가능처럼 표시 안 함 |
| TC-CAD-001 | manual fidelity | 아래 Entity corpus를 기준 CAD 화면과 비교 | Entity별 결과·차이·캡처/참조 근거 및 sample 부재 명시 |
| TC-MET-001 | unit/browser | timing event, failure/cancel/cache, 미지원 memory API | ms 기준 정확, 불가 지표 null+사유, 실패 기록, 단계 중복 합산 없음 |
| TC-MET-002 | real browser/manual | 크기/복잡도별 cold/warm 5회, zoom/pan, console/memory | 개별 값·median/range·환경·제약, 주관 사용성과 정량 수치 분리 |
| TC-EVAL-001 | evidence review | Viewer 3종 결과/지원표 검토 | 동일 DXF sample 비교, DWG는 별도 평가, unsupported를 성공으로 숨기지 않음 |
| TC-UI-001 | component/E2E/manual | 4화면·keyboard·빈/로딩/실패 상태·desktop resize | 업무 흐름 가능, Current 색상 외 라벨, Toolbar/Metadata/metrics 읽기 가능 |
| TC-ERR-001 | integration/E2E | 정의된 모든 사용자 오류와 raw library console 확인 | 안전한 오류 문구/로그, 원본 bytes·stack UI 비노출 |
| TC-ARCH-001 | build/review | dependency graph/import/runtime/API 경계 | 승인 구조 준수, 불필요한 서비스/외부 Viewer 없음 |
| TC-E2E-001 | automated E2E | DXF Upload→metadata/current→list→search→select→Dxf→Three | 전체 성공, 실제 canvas 비어 있지 않음, 정확한 Version 유지 |
| TC-E2E-002 | E2E/manual 보완 | DWG Upload→list/search→select→LibreDWG | 실제 DWG 표시와 Current 확인; 미자동화 부분은 수동 근거 명시 |
| TC-REL-001 | release audit | 전체 필수 결과/README/Schema/ChangeLog/version/diff/secret/commit | DoD 충족, known issue 명시, release/tag 전 version 일치 |

## CAD Entity 및 지원 평가

대상: LINE, POLYLINE, LWPOLYLINE, CIRCLE, ARC, BLOCK, INSERT, TEXT, MTEXT, 한글 TEXT, DIMENSION, HATCH, SPLINE, Layer, Linetype. 각 Sample의 실제 Entity 포함 여부를 먼저 확인한다. 없는 Entity는 시험 불가로 기록한다.

외부/사용자 파일의 source, hash, format revision, 파일 크기, entity 종류/수, 기준 화면 및 사용 허용 범위를 로컬 기록한다. 실제 업무 도면 제공 시 대조한다. 생성 DXF의 성공만으로 업무용 DWG나 한글/복잡한 block의 충실도를 보증하지 않는다.

## Metrics 정의와 측정 조건

| 지표 | 정의 / 제한 |
| --- | --- |
| Load result | ready/partial/error/cancelled. 일부 기하 누락은 partial |
| Load time | Manager load 요청부터 첫 유효 frame까지 wall time; download 포함 여부/캐시 명시 |
| Fetch time | content API 요청부터 ArrayBuffer 확보 |
| Parse time | 파서 진입→완료 hook이 실제 존재할 때만 측정; render preparation과 분리 불가면 combined로 이름 명시 |
| First display | load 요청→첫 geometry draw 후 animation frame 관찰 시점; 실제 GPU present와 완전히 같다고 주장하지 않음 |
| WASM init | 초기 create/load 단계 별도; cold/warm 구분 |
| Entity count | 파서 기준 원본 개수, block 확장 draw primitive 수와 구분; unavailable=null |
| Memory | 지원 Browser API의 JS heap 또는 수동 도구 snapshot과 방법 표시; GPU/WASM 전체를 포괄한다고 가정하지 않음 |
| Errors | Viewer/parse/console 단계·안전한 메시지, raw bytes 미기록 |
| Responsiveness | zoom/pan 입력 반응·freeze·long task 가능한 계측 + 사용자 관찰; 서로 구분 |

동일 장비·Browser·viewport·DPR·font·sample hash·library version에서 cold/warm 조건별 가능한 5회 수행하고 개별 값과 median/min/max를 기록한다. 작은 도면(예: ≤1 MiB), 중간(1–10 MiB), 대형(>10 MiB, 설정 한도까지) 및 Entity 복잡도를 별도 축으로 구분한다. 이 구간은 시험 분류이며 업무 SLA가 아니다.

업무용 최대 크기·목표 응답시간·대표 sample은 아직 미제공이다. 수치 목표를 임의의 합격 기준으로 만들지 않는다. 기능 완료와 업무 성능 적합성 판정을 분리한다. 테스트 실패는 수정/재시험하고, 미지원 기능은 재현 근거가 있는 평가 결과로 기록한다.

## 결과 기록 및 추적

실행마다 Run ID, 날짜, Unit, 앱/라이브러리 버전, Commit 또는 uncommitted snapshot, 환경, 명령·exit code, total/pass/fail/skip, TC별 결과, 실패 원인/재시험, manual 근거, Known Issue를 TestReport에 기록한다. Requirements의 구현 상태는 실제 근거로만 올린다.

## GitHub #1 — 등록 후 목록 미표시 회귀

확인된 원인: `/`가 DB 조회 없이 정적 안내만 렌더링했다. 승인된 Unit 3 범위에서 실제 목록으로 교체한다.

- TC-ISSUE-001: 목록을 먼저 방문→등록 화면→새 파일 등록→목록으로 복귀→동일 파일/Metadata/Current 표시→새로고침 후 유지. 등록 전 prefetch된 목록도 새 데이터를 표시해야 한다.
- TC-LIST-001/002 및 TC-API-005: DB에 기존 행이 있으면 GET 목록에 포함, 필수 columns·결정적 정렬·페이지·7조건 단독/AND·문자 그대로 filename 검색·빈 결과·잘못된 query 검증.
- TC-LIST-003: Location 상세에서 과거 버전 확인 및 Current 변경 후 목록과 상세의 표시 일치. Viewer 화면은 다음 Unit이므로 사용할 수 있는 것처럼 노출하지 않는다.
- 실제 사용자 DB/파일은 변경하지 않고 회귀 데이터는 독립 임시 DB/Storage에 생성한다. 수정 전 실패와 수정 후 성공을 TestReport에 구분한다.

추가 자동화: TC-LIST-004 Current 교체/null 필터, TC-LIST-005 안정적 페이지 분할과 범위 초과 빈 결과, TC-LIST-006 잘못된/중복 query 거부, TC-LIST-007 한글 NFC·와일드카드/인용부호 문자 그대로 검색. `tests/integration/list.test.ts`와 `tests/e2e/upload.spec.ts`에서 실행한다.

### Unit S3 완료 확인 기준

실제 SeaweedFS 4.45에서 TC-S3-001–003을 실행하고, S3 backend의 웹 E2E 및 local/DWG 회귀를 분리 기록한다. PUT/DB/DELETE 실패·불확실 COMMIT의 처리 결과와 임시 컨테이너/credential cleanup을 확인한다. 실제 .env 활성화와 기존 사용자 storage 데이터 이동은 자동으로 수행하지 않는다. 결과 기준은 TestReport U-S3-20260908이다.


## GitHub #24 — 0.25.0

[Issue24](Issue24.md)의 TC-MASTER-001~007을 구현 전 수용 기준으로 확정한다. legacy populated DB 보존과 재분류, Current 경쟁/rollback, 변조/비활성 chain, 관리·등록 Browser 흐름 및 기존 전체 회귀를 독립 QA가 검증한다.

- TC-MASTER-008 (PR #27 P2 리뷰): 미분류 층 상세에서 `/api/masters?active=true`의 HTTP 503 + JSON 오류를 Browser route로 주입하고 재분류 `form` 내부 `role=alert`로 오류 안내가 나타나는지 검증한다. Next.js `#__next-route-announcer__`도 `role=alert`이므로 전역 `getByRole("alert")` 선택을 금지한다. 버전 목록·재분류 폼이 유지되는지 확인하고 실패 주입을 제거해 새로고침하면 form 오류가 사라지며 정상 선택·재분류 흐름이 복원되어야 한다. 기존 TC-MASTER-003/005/007 E2E에 추가하고 PR CI에서 재검증한다.
