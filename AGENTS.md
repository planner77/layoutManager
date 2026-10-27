# CAD Web Viewer P.O.C. — 개발 진입 문서

## Issue #142 / PR #146 — Typecheck TS2769/TS2345 및 Local Locator P2 보완 (2026-10-27 KST)

- **관측된 실패:** [PR CI #40511480917](https://github.com/planner77/layoutManager/actions/runs/40511480917) attempt=1 HEAD `bafe74cceba07a789a328c2453ccd785f19b4597` `completed/failure`. Verify Job 122214239302의 `npm run typecheck`에서 `s3-4-b2-3.ts:62` TS2769·`:63` TS2345 (`object | null`이 `Object.keys/hasOwn`에 전달될 가능성). Docker/Smoke Job 122214238943의 baseline Dockerfile 앱 Build도 **같은 TypeScript 오류**로 실패, 이후 ESLint/Unit/Build/E2E 및 Docker 후속 Steps는 SKIPPED. 두 Job 실패를 서로 다른 결함으로 중복 원인 계상하지 말 것.
- **직접 원인·수정:** `exact(v:unknown)`의 `Boolean(v)`은 TypeScript에서 `null` 제외를 증명하지 못한다. 명시 `v!==null && typeof v==='object'`로 좁힌 후 `Object.keys/Object.hasOwn` 접근. 유효 Packet·런타임 의미 변경 없이 타이핑 회복.
- **독립 Codex P2:** [Review #4389209602](https://github.com/planner77/layoutManager/pull/146#discussion_r4389209602) Local CAD는 `CadStorage.publish` 규약 `<locationId>/<dbVersionId>/original.(dxf|dwg)`으로 **실제 DB CadFileVersion.location_id와 id에 결합**돼야 한다. 기존 정규식 Shape + DB와 Claim Path 문자열 일치만으로는 before/after 양쪽에 동일한 잘못된 Local Locator가 있는 경우 허위 PASS 가능. Local UUID 두 Segment를 캡처해 DB Row의 Location·Version ID와 각각 비교, 부정확하면 `LOCAL_LOCATOR_OWNER_INVALID/BLOCKED`. S3 객체 UUID는 DB Version UUID와 독립이므로 S3 검증 방식 변경 금지. before/after 합성 SQLite 양쪽에 잘못된 Location/Version 경로를 동일하게 넣은 음성 회귀 추가.
- **재검증:** 기존 성공 추정 금지. 새 HEAD는 Typecheck+Lint+Unit/Integration+Docker/Build+E2E, 동일 HEAD Codex 리뷰·Thread 0·Main 충돌 0을 다시 증명해야 한다. 실패 원장/Runbook/관련 설계/시험 문서 갱신, 운영 Writer/실 DB/CAD/S3/Prisma active migration·GHCR/Auth/Write OFF. #142/#109/#96 OPEN/BLOCKED.

## Issue #142 S3-4-B2-3 — 격리 7 Migration·CAD/Audit 불변식 실증 (2026-10-27 KST)

- **선행:** B2-2B [PR #145](https://github.com/planner77/layoutManager/pull/145) no-GHCR Squash Main `d2b77dd6535503f2d980ac563cc195cc8b4c128e`, [Main CI #40506886341](https://github.com/planner77/layoutManager/actions/runs/40506886341) SUCCESS/release-scope SUCCESS/GHCR Build+Push SKIPPED. `DESIGN.md`는 부재하여 Architecture/Decisions/Database/Requirements/Operation으로 설계 확인.
- **B2-3 신규:** [Runbook](src/deploy/g7-s3/S3-4-B2-3.md) 준수. 기존 격리 `prisma.config.ts`와 `requireG7S3DisposableTarget`에 의해 UID-owned `/tmp/cad-g7-s3-*` (0700), `fixture.sqlite`·Marker(0600)에서 formal `prisma migrate deploy` 7개 이력·Auth 8개 테이블을 시험. 별도 합성 인메모리 6 CAD SQL→Local/S3 Version 데이터→7번째 Auth SQL 과정의 전후 Buffer/실 CAD Byte SHA·FK·Current/Version·Audit 기능을 `assessS34B23DisposableMigration`로 검사. 두 검증의 출처와 역할을 구분하며 합성 Buffer 일치는 formal Prisma 이력이나 실제 Source 증거를 대체하지 않음.
- **검증·안전:** 기존 운영 CAD 6 migration.sql 그대로, 7번째는 격리 후보 경로에만. before/after CAD 7 Tables 동일·Quick Check/FK=0·8 Auth Tables, append-only Audit UPDATE/DELETE 실제 거부, 누락/변조/FK 실패·Transaction ABORT 회귀. 양성은 `DISPOSABLE_SEVEN_SCHEMA_INVARIANTS_ONLY`뿐, 모든 실제 Site/GO false. 운영 Writer/온라인 백업/실 SQLite/CAD/S3/활성 Prisma History·Auth/CAD Write·GHCR/Compose/Nginx/.env/Owner GO 미실행. #142/#109/#96 OPEN/BLOCKED, 새 PR HEAD CI/리뷰 실제 결과 전 PASS 금지.

## Issue #142 / PR #145 — S3 Locator 중복 검출 Codex P2 보완 (2026-10-27 KST)

- **근거:** [PR #145 P2 #4388575128](https://github.com/planner77/layoutManager/pull/145#discussion_r4388575128). 기존 [PR CI #40502175608](https://github.com/planner77/layoutManager/actions/runs/40502175608) HEAD `cddd2f20dc45c1f3d7edc42e15f0b914016a078d`는 Verify/Docker 2 Job SUCCESS였지만 Codex 최신 리뷰에서 **리뷰 결함** 발견. 이를 CI 실패로 잘못 기록하지 않는다.
- **정확한 DB 불변식:** `CadFileVersion.storagePath`는 Prisma `@unique(map: "uq_storage_path")`이므로 S3 object-key UUID는 DB Version UUID와 **독립**이어도 서로 다른 Version 두 개가 **동일한 S3 locator를 공유할 수 없다**. B2-2B 검증기는 SHA/크기 및 VersionId 주장 일치와 무관하게 전체 S3 mapping의 동일 Locator 중복을 `DUPLICATE_S3_LOCATOR/BLOCKED` 처리한다. 실 운영 Unique Index 유무에 기대지 않으며 누락된 격리 SQLite 인덱스에서도 fail-closed.
- **회귀:** 정상 합성 SQLite의 `uq_storage_path`를 유지한 채 서로 다른 S3 object UUID 두 건을 통과시키고, 고의로 Unique 인덱스를 제거한 합성 SQLite에서 독립된 DB Version ID들이 동일 S3 locator/해시/S3 VersionId를 참조하도록 만든 오류를 거부. B2-2A 주장 패킷 자체는 정상으로 구성하여 B2-2B 검출을 분리 검증한다. [B2-2B Runbook](src/deploy/g7-s3/S3-4-B2-2B.md), TestPlan·TestReport·FailureLedger 필수 참조. 수정 HEAD PR CI/최신 Codex 결과는 새 Run 확인 전 `NOT VERIFIED`; 운영 Writer/DB/CAD/S3/실증·GHCR/Owner GO는 여전히 금지.

## Issue #142 / PR #145 — S3 Locator와 DB Version UUID 독립성 P2 보완 (2026-10-27 KST)

- **근거:** [PR #145 Codex P2 #4388372985](https://github.com/planner77/layoutManager/pull/145#discussion_r4388372985). `S3ObjectStorage.prepare()`는 `cad/<S3-UUID>/original.ext`를 먼저 할당하고 `CadRepository.register()`는 별도 DB Version UUID를 생성한다. B2-2B에서 양자를 동일하다고 간주한 검사는 정상 S3 등록 도면에 `SQLITE_VERSION_OR_LOCATOR_MISMATCH` 오탐을 일으킬 수 있음.
- **보완 계약:** `ObservedObject.s3ObjectLocator`에 합성/격리 export의 독립된 정규화 S3 locator를 명시적으로 넣고 DB `storage_path`와 정확히 비교한다. S3 locator는 허용된 `s3:bucket:cad/<UUID>/original.(dxf|dwg)` 형식·확장자를 검증하고 잘못된 Bucket/Object UUID/형식·누락을 BLOCKED 처리. Local CAD는 위치·DB Version UUID 구조를 유지하며 S3 locator 필드 금지. **S3 Object UUID와 DB Version UUID는 같을 필요 없음**. Locator·Bucket·실 CAD/S3 비밀 자료는 반환/로그/Git에 기록하지 않는다.
- 기존 PR CI [#40499605822](https://github.com/planner77/layoutManager/actions/runs/40499605822) HEAD `0f0c6aae` SUCCESS(두 Job 모두 성공), P2는 **CI 실패가 아닌 리뷰 결함**. 관련 합성 양성/불일치/누락/형식거부 회귀 추가 및 [B2-2B Runbook](src/deploy/g7-s3/S3-4-B2-2B.md), 실패 원장·TC 동기화. 수정 HEAD의 새 CI/최신 Codex 결과는 별도 검증 전 `NOT VERIFIED`. 운영 Writer 정지·실 SQLite Online Backup·원본 CAD/S3 GET·Owner GO 여전히 금지.

## Issue #142 S3-4-B2-2B — 격리 Byte 대조 사전 검증 (2026-10-27 KST)

- **선행:** #142 B2-2A [PR #144](https://github.com/planner77/layoutManager/pull/144) no-GHCR Squash Main `e043d56d43099034906cccf0bb1cc1c7a76bb11f`, [Main CI #40496032085](https://github.com/planner77/layoutManager/actions/runs/40496032085) SUCCESS, release-scope SUCCESS/GHCR Job SKIPPED. 별도 `DESIGN.md` 없음 → Architecture/Decisions/Database/Operation이 설계 기준.
- **B2-2B 구현:** `inspectS34B22BDisposableBytes(packet,bundle)`는 B2-2A의 `SNAP-*`/epoch/zero-writer **주장형** 계약이 통과한 경우에 한해, 별도로 제공된 **합성 SQLite Buffer**의 SHA·quick_check·FK·DB Version/Current/nextVersion과 Local CAD·S3 export/marker Buffer SHA·길이·private mapping·locator를 대조한다. 임의 File 경로/S3/실 Site/Writer 정지/online backup·active migration·shell 실행 없음. 긍정 상태도 `DISPOSABLE_BYTES_CONSISTENT_NOT_SITE_PROOF`이고 실제 출처·Owner GO flags false.
- **실제 현장 수용은 별도 Owner 승인 전 불가:** 독립 Reviewer, zero-writer Source Epoch·원본 SQLite online backup·Local CAD/S3 authoritative versioned HEAD/GET/marker·사내 EV/QA/SNAP 증거가 없으므로 현장 B2-2B는 `NOT RUN/BLOCKED`. [B2-2B Runbook](src/deploy/g7-s3/S3-4-B2-2B.md) 필수 참조. 운영 Auth/CAD Write·GHCR/Compose/Nginx/Prisma 활성화 금지, #142/#109/#96 OPEN/BLOCKED. 새 PR CI 성공은 실제 관측 전 `NOT VERIFIED`.

## Issue #142 / PR #144 — 실패한 TypeScript Fixture Typecheck 보완 (2026-10-27 KST)

- [PR CI #40492242157](https://github.com/planner77/layoutManager/actions/runs/40492242157) HEAD `808f7b4`, attempt=1 **FAILURE**: Verify Job 122148776521의 `tsc --noEmit`에서 [B2-2A synthetic Unit](src/tests/unit/g7-s3-4-b2-capture.test.ts) 83·88·96행 `TS2339` 3건. Local `v1`에는 `storageVersionId`가 없고 S3 `v2`에만 있어 일반 배열의 Union Type에서는 `versions[1]` 속성을 보장할 수 없음. Docker/Migration Job 122148776302는 SUCCESS, Typecheck 이후 검사들은 SKIPPED(미검증).
- **보완 지침:** Fixture의 두 entry를 타입이 구분되는 `[typeof v1,typeof v2]` tuple로 선언해 `versions[1].storageVersionId`의 정적 타입을 보존. 데이터 구조/검증 로직 변경 없이 실패 원장·TestReport 동기화. 혼합 entry Fixture를 다루는 신규 Test는 TypeScript 검사를 먼저 통과시켜야 함. 최신 HEAD의 CI 결과는 관측 전 PASS가 아니며 기존 Codex P2 2개 Resolved/이전 SHA 무지적도 새 SHA의 리뷰 승인을 의미하지 않음. 운영 G7, GHCR, 실 DB/CAD/S3 접근 OFF.
## Issue #142 S3-4-B2-2A — 단일 Snapshot 쓰기 장벽 증거 계약 준비 (2026-10-27)

- **선행:** [B2-1 PR #143](https://github.com/planner77/layoutManager/pull/143) no-GHCR Squash → Main `2d29b8572b02ccacf5e0032bf5432cb2f2b26ed6`. [Main CI #40483297907](https://github.com/planner77/layoutManager/actions/runs/40483297907) SUCCESS, release-scope SUCCESS / GHCR Build and push SKIPPED.
- **B2-2A 신규:** `src/server/g7-operational/s3-4-b2-capture.ts`는 사용자 제공 **주장 패킷** 내 writer-barrier 시작·종료, 원본 epoch 불변, SQLite/Local CAD/S3 versioned marker의 단일 SNAP·기간·객체 인벤토리/Version·Current/FK/Audit 요약 일관성만 정적 검증. `CAPTURE_CLAIMS_CONSISTENT_NOT_SOURCE_PROOF`는 실제 백업·기록된 파일 SHA·S3 객체 원본·운영자 권한의 인증이 아님. `writerQuiescenceVerified/sameSnapshotVerified/bytesVerified/provenanceVerified/operationalGo/runtimeActivated=false` 고정.
- **PR #144 P2 후속:** 최초 [PR CI #40485053390](https://github.com/planner77/layoutManager/actions/runs/40485053390) HEAD `4fa951d2`는 SUCCESS이나 Codex [P2 location/version 중복](https://github.com/planner77/layoutManager/pull/144#discussion_r4387342529)·[P2 S3 Version ID 형식](https://github.com/planner77/layoutManager/pull/144#discussion_r4387342538)은 미충족. `@@unique([locationId, version])`의 복합 제약을 opaque key와 별도로 확인, S3 object/marker에 AWS 규약 UTF-8 최대 1,024 **bytes**(`+`/`/`/Unicode 허용, unversioned `null` 거부)를 공통 적용하며 synthetic 음성·경계 회귀와 [Runbook](src/deploy/g7-s3/S3-4-B2-2.md)을 갱신한다. 새 HEAD PR CI 결과는 **관측 전 NOT VERIFIED**, 실 S3/provenance/운영 검증 아님.
- **금지·후속:** 운영 writer 정지/실 SQLite online backup/실 CAD/S3 API·파일 접근, Auth/Write 활성화, 운영 Prisma Migration, GHCR/Dockerfile/Compose/Nginx 변경 없음. B2-2B 사내 실제 Barrier/일관 Snapshot 독립 실증, B2-3~5 복제본 Migration/Restore/Rollback·EV/QA, C binder 및 S3-5 Owner GO 별도 승인 필수. [B2-2 Runbook](src/deploy/g7-s3/S3-4-B2-2.md) 참고. B2-2A PR CI는 새 HEAD 실행 전 PASS 아님, #109/#96 OPEN/BLOCKED.

## Issue #142 / S3-4-B2-1 — OCI offline digest 일치성 검증 착수, 운영 NO-GO (2026-10-27 KST)

- **선행:** Issue #109 S3-4-B1 [PR #141](https://github.com/planner77/layoutManager/pull/141) 최신 HEAD `24b9c340f18e257471fe02237e6ab8e1d8f543da`, [PR CI #40476745670](https://github.com/planner77/layoutManager/actions/runs/40476745670) SUCCESS 및 동일 HEAD Codex Review completed/findings 0; 정확 no-GHCR Squash [Main `7469d016a5926aca07929bf3e95e869b46716bd1`](https://github.com/planner77/layoutManager/commit/7469d016a5926aca07929bf3e95e869b46716bd1). [Main CI #40478523325](https://github.com/planner77/layoutManager/actions/runs/40478523325) SUCCESS, release-scope Job SUCCESS / GHCR Build+Push SKIPPED.
- **B2-1 구현 범위:** `src/server/g7-operational/s3-4-b2-oci.ts`의 **OCI 원본 바이트 digest/Config/Role/OS/SHA/Schema 일치성만 검사하는 순수 코드**와 합성 Unit·정확 GHCR no-publish allowlist, [B2 Runbook](src/deploy/g7-s3/S3-4-B2.md). 실제 Registry GET/서명/출처·실 배포 확인은 하지 않음. 로컬 바이트 합격도 `LOCAL_DIGESTS_MATCH_NOT_REGISTRY_PROOF`, `registryVerified:false`, `operationalGo:false`.
- **미구현·금지:** 현재 Dockerfile에는 G7 이미지 provenance label이 없음; 이를 가짜로 채우거나 운영 이미지 자체를 생성·게시하지 않음. B2-2 실제 DB/CAD/S3 단일 Snapshot writer barrier, B2-3 복제본 격리 7 Migration, B2-4 restore/rollback, B2-5 내부 EV/QA/SNAP+S3-4-C 신뢰 binder 및 S3-5 Owner GO는 별도 게이트. 운영 Prisma History·Auth/Write·Nginx/Compose/.env·실 DB/CAD/S3·GHCR publish/Issue #109/#96 종료 변경 0.
- **예정 PR Scope:** 정확 `#142 | S3-4-B2-1 Offline OCI digest preflight [G7-S3-4B2-1-NO-GHCR]`+15개 허용 파일만 GHCR SKIP. 새 PR CI·Codex의 실제 PASS는 최종 HEAD 검증 전 주장하지 않음.

## Issue #138 — Viewer 조회/작업 보조 창 이동 공통 지침 (2026-10-27)

- **모든 신규 Viewer 조회/작업 창의 기본 정책:** #127의 상단 실행형 그룹 메뉴와 기존 좌/우/하단 Drawer 초기 배치는 유지하되, 데스크톱의 외곽선 목록·레이어 목록·TEXT 검색/결과·외곽선 생성/편집 도구 및 후속 Viewer Memo 트리·편집/검색 보조 창은 **제목 전용 이동 핸들 Drag & Drop으로 독립적으로 위치 변경**할 수 있도록 공통 Shell/Panel을 사용한다. 이전 Drawer와 floating panel의 **중복 마운트 금지**, 동일 세션 위치·창별 z-order 보존, 위치 초기화/닫기 제공.
- **요구사항 접수/이슈/리뷰 필수 확인:** Viewer 내 추가 UI가 보조 창인지 판단해 적용을 이슈 본문·AC에 명시; 비적용(확인 모달, 일회성 메뉴/tooltip/toast, 앱 전체 독립 페이지 등)은 사유 기록. 신규 독립 상단 버튼을 무분별하게 늘리지 말고 #127 그룹 메뉴 실제 실행 항목과 연결한다. 전용 drag handle 이외에서는 이동 금지, 입력창/Tree/Canvas 드래그 선택·Pan·WCS GENERATED 이동/메모 anchor와 포인터 경계 분리, ESC 한 번에 최상위 한 단계·키보드·복원·포커스 보장.
- **레이아웃/수명주기:** Viewer shell CSS viewport 기준 clamp·resize/200%/immersive/native fullscreen 재배치, 모바일은 기존 #127 단일 modal Drawer 유지. 창 이동/열고 닫기가 Canvas DOM·Manager/Adapter·원본 GET/Worker를 재생성하거나 Layer/검색 결과/선택/Undo·Zoom 상태를 바꾸지 않는다. 실제 CAD 작업 결과를 panel position에 영속 저장하지 않는다. DXF/DWG capability 및 운영 G7 승인 게이트는 그대로.
- 설계·AC/공통 적용 대상·테스트 체크리스트는 [ViewerPanelPolicy](out/ViewerPanelPolicy.md), [Issue #138](https://github.com/planner77/layoutManager/issues/138), [Requirements](out/Requirements.md), [Architecture](out/Architecture.md), [Decisions](out/Decisions.md), [TestPlan](out/TestPlan.md)을 기준으로 한다. #37/#49/#73/#82/#85/#90 관련 이슈에 참조한다. **본 기록은 지침 변경으로 기능 구현·테스트 PASS를 의미하지 않는다.**


## #109 PR #141 — Unit 실패 및 P1/P2 보완 (2026-10-27)

- [PR CI #40444154044](https://github.com/planner77/layoutManager/actions/runs/40444154044), HEAD `b5f340e69bd28aed939bb1c443df355c1652f5bf`: Unit/Integration 404 중 5 실패, Typecheck/ESLint·Docker PASS, Build/E2E SKIPPED. 5개 공통 직접 원인: 정상 Manifest Sorted Key 기대 순서 오타→`SNAPSHOT_MANIFEST_MISMATCH`.
- [Codex P1 #4384813274](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813274) key order 수정. [P2 #4384813277](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813277) SQLite source path 재오픈 TOCTOU를 검증 Buffer→메모리 DB로 교정, [P2 #4384813278](https://github.com/planner77/layoutManager/pull/141#discussion_r4384813278) 8개 Auth table 완전/완전부재 검사로 수정. 관련 회귀 테스트·B1 Runbook 추가. **신규 HEAD CI 전 PASS 미확인**.
- S3-4-B1은 격리 readonly/합성 clone 무결성 검사 준비이며 실제 운영 Snapshot 동시성·실 Registry OCI·실 Migration/Restore/rollback은 NOT RUN. Auth/Write/운영 SQL·Compose/Nginx·GHCR·실 DB/CAD/S3·Issue 종료 금지.


## Issue #109 S3-4-A merged → S3-4-B1 isolated restore verifier (2026-10-27 KST)

- S3-4-A [PR #136](https://github.com/planner77/layoutManager/pull/136) 최신 HEAD `d890f88b` PR CI `40440831020` SUCCESS, Codex 재리뷰 주요 지적 없음·기존 P2 2건 Resolved. 정확 Squash `#109 | S3-4-A Offline release evidence [G7-S3-4A-NO-GHCR]` → Main `1500eb699d5ef8d2045e951354838aa13ce24f92`. [Main CI #40443473912](https://github.com/planner77/layoutManager/actions/runs/40443473912) release-scope SUCCESS, GHCR Build and push SKIPPED.
- S3-4-B1은 신규 `src/server/g7-operational/s3-4-b-clone.ts`로 **UID-owned /tmp/cad-g7-s3-b-* 0700 일회용 복제본만** 읽어 SQLite quick_check/FK, Version↔Current, nextVersion, CAD local+S3 export 바이트 길이/SHA, Schema 경계의 실제 무결성을 검증. Origin proof가 아님: SNAP ID 자체는 일관된 쓰기중지/원본 snapshot capture를 증명하지 않는다. `ISOLATED_INTEGRITY_ONLY`도 `operationalGo=false`, `runtimeActivated=false`.
- B1 합성 테스트와 별도 [B1 Runbook](src/deploy/g7-s3/S3-4-B.md). 정확 future squash `#109 | S3-4-B1 Disposable restore integrity [G7-S3-4B1-NO-GHCR]`+명시 allowlist만 GHCR SKIP. 운영 Prisma Migration history·scripts/deploy.ts·운영 Auth/Write·Nginx/Compose/.env·DB/CAD/S3·실 GHCR/Image/Issue 종료 변경 0.
- **남은 B2/C/Owner GO:** 사내 실제 Registry OCI App/Migrator immutable digest/source provenance, 승인된 쓰기중지·DB/CAD/S3 동일 Snapshot 실백업/복원, 7개 Migration 사본 적용·rollback 호환성 실증 후 신뢰 binding(S3-4-C) 및 Owner 릴리스별 GO(S3-5). B1 PR CI/코덱스 검증 이전 PASS 주장 금지.


## Issue #109 PR #136 — S3-4-A P2 보완 / 이전 CI 성공과 리뷰 지적 분리 (2026-10-27 KST)

- 최초 S3-4-A PR HEAD `07a126afdba9135e031f348e6a2901ae6395fd79`의 [PR CI 40438604869](https://github.com/planner77/layoutManager/actions/runs/40438604869) `completed/success`. Codex [P2 r4384543606](https://github.com/planner77/layoutManager/pull/136#discussion_r4384543606): 사내 private JSON pathname과 열린 파일 객체의 TOCTOU. `O_NOFOLLOW|O_NONBLOCK`와 `fstatSync`, `lstat` dev/ino 동일성, UID·0600·정규파일·크기, 동일 fd 읽기 및 finally close로 교정.
- [P2 r4384543609](https://github.com/planner77/layoutManager/pull/136#discussion_r4384543609): `String(['NOT_RUN'])` 자료형 오판을 `typeof status === 'string'` 선검사로 차단. 비문자열 상태는 `BLOCKED/INVALID_CHECK`이며 올바른 `NOT_RUN`만 `PENDING`. Symlink/FIFO/inode 교체 및 자료형 회귀 추가. 실제 최신 HEAD CI·새 Codex 검토는 별도 확인 전 PASS 아님.
- 이번 수정은 S3-4-A 오프라인 증거 도구·시험·문서만 변경하며 운영 Auth/Write/Prisma Migrator, Compose/Nginx/DB/CAD/S3/GHCR/Issue 종료 금지 유지.


## Issue #109 S3-4-A — 오프라인 릴리스·복구 증거 게이트 착수 (2026-10-27 KST)

- **선행 확인:** S3-3 PR #135 → Main `dc20844be7525bd3367f38cc3080675efa4fa89c`, [Main CI #40437054103](https://github.com/planner77/layoutManager/actions/runs/40437054103) SUCCESS, release-scope SUCCESS 및 GHCR job SKIPPED. S3-4 출발점은 해당 Main이며 Owner의 **실운영 GO는 없음**.
- **S3-4-A 구현:** `src/server/g7-operational/s3-4-readiness.ts` 순수 자료 검증, `src/scripts/g7-s3-4-readiness.ts` 사내 0600 절대경로 JSON 검증 CLI, Unit/Fault 회귀, [S3-4 Runbook](src/deploy/g7-s3/S3-4.md). OCI App/Migrator·rollback 쌍의 source/version/digest, 7개 후보 Migration·운영 활성 History 미변경, DB/CAD/S3 단일 Snapshot/복구, FK/원본 SHA/Current/Version·SOP 검증 상태·사내 증거 참조의 누락·모순을 fail-closed 한다.
- **실증 경계:** 도구가 확인하는 것은 **운영자 증거 패킷의 형식·상호 일치성**이며 GHCR registry 검증/현장 복구·OCI 서명 검증을 직접 수행한 것이 아니다. `EVIDENCE_PACKET_COMPLETE_NOT_GO`도 운영 GO 아님. 모든 결과 `operationalGo=false`/`runtimeActivated=false` 고정. S3-4-B는 사내 실제 OCI/격리 Migration/DB-CAD-S3 동일 Snapshot 복구·롤백, S3-4-C는 신뢰된 Release binder/승인 전 확인, S3-5는 릴리스별 Owner 실행 GO.
- **비변경:** 활성 `src/prisma/migrations/**`·`src/scripts/deploy.ts`, 실제 운영 Auth/Write, Docker Compose/Nginx/.env, 운영 DB/CAD/S3, GHCR 이미지/태그 및 Issue #109/#96 종료 0. 정확 제목+파일 allowlist `#109 | S3-4-A Offline release evidence [G7-S3-4A-NO-GHCR]`만 Main GHCR 게시 SKIP. PR CI 실행 전 테스트 결과는 NOT VERIFIED.


## Issue #109 PR #135 — P2 처리·Main 정렬 후 리뷰/충돌 재확인 (2026-10-27 KST)

- 최초 HEAD `8a98e6a6` [PR CI #40429149135](https://github.com/planner77/layoutManager/actions/runs/40429149135)는 `completed/success`. Codex [P2 r4384076798](https://github.com/planner77/layoutManager/pull/135#discussion_r4384076798)는 **CI 실패가 아닌** preview 로컬 저장소/기존 Content GET 불일치 위험이다.
- 업로드 권한검증 전에 `CAD_STORAGE_PATH=$G7_S3_TEST_ROOT/cad`와 `CAD_STORAGE_BACKEND=local`, `CAD_S3_*` unset을 강제. 인증된 쓰기 Context도 동일 root·UID/permission 검증 및 마이그레이션 체크를 수행한다. `cad-preview-storage.ts`는 별도 순수 검증 함수여서 테스트가 `server-only` 모듈을 열지 않는다. 기존 익명 GET/Viewer 코드 변경 없음. Unit은 경로 불일치 거부와 로컬 업로드→기존 Content storage 조회를 검사한다.
- P2 답변 [r4384322812](https://github.com/planner77/layoutManager/pull/135#discussion_r4384322812) 및 Thread Resolved; Main `dc82e670073160ddac46a2f9e9489a738a19c033` (#57 로깅/관측 포함)을 비강제 두-부모 Merge로 보존한 HEAD `ebc294fff35b005737cf89ebacb78420b209bd59`. Main behind=0/mergeable=true, 정렬 후 리뷰 스레드 1개 중 미해결 0개. 새 HEAD의 PR CI는 별도 관측 이전 PASS 미확인, GHCR/운영 활성화/Issue 종료 없음.


## Issue #109 S3-3 — CAD API 권한·Audit 원자성 준비, 운영 OFF (2026-10-27)

- **기능:** 기존 CAD Multipart POST·Current PUT·Version DELETE에서 서버 DB의 최신 Session/Role/Site를 같은 Prisma Transaction 안에 재조회하고 승인된 Editor/Admin+Site만 쓰기 허용한다. DELETE는 기존 삭제 비밀번호도 요구하며, CAD DB 변경과 CAD_UPLOADED/CAD_CURRENT_CHANGED/CAD_VERSION_DELETED Audit INSERT 중 하나라도 실패하면 DB를 롤백한다. 기존 업로드 보상·삭제 Job, 익명 GET/Viewer·CAD 데이터 규약은 유지한다.
- **운영 차단:** `NODE_ENV=production`에서는 S3-3 프리뷰 활성화 불가. 정확한 S3-2 disposable DB/marker/7 migration, loopback origin, `G7_S3_AUTH_API_PREVIEW_ONLY=true`, `G7_S3_CAD_PREVIEW_ONLY=true`, `G7_AUTH_ENABLED=false`, `G7_CAD_WRITE_CUTOVER_ENABLED=false` 조건만 격리 시험 허용. 별도 Prisma Client와 0700 root 하위 로컬 CAD 저장소 이용. 운영 Migration·실 DB/CAD/S3·Compose/Nginx/.env·GHCR 게시·인증/쓰기 활성화 없음.
- **시험·잔여:** synthetic integration(Unit) 검증 코드 추가; 실제 PR CI는 시작 전이므로 결과 `NOT RUN`. 일회용 Preview Cookie의 Path는 `/api/g7-operational`이므로 다른 CAD 경로의 프로그램 시험에서는 테스트용 Cookie를 명시적으로 넘기며 운영 브라우저 인증이 활성된 상태는 아님. S3-4는 OCI/운영 Migration/실복구·신뢰 release binding, S3-5는 릴리스별 Owner GO 및 현장 수용. 기존 유사범위 PR #128은 미병합·충돌 상태이며 자동 병합하지 않는다. #109/#96 OPEN/BLOCKED.
- **후속 정확 Squash:** `#109 | S3-3 Isolated CAD write and Audit [G7-S3-3-NO-GHCR]` 및 개별 파일 allowlist만 GHCR 미게시. 내부 로그/비밀번호/IP/실 도면 반출 금지. [S3-3 Runbook](src/deploy/g7-s3/S3-3.md).


## Issue #109 / PR #131 — 두 번째 PR CI Unit/Integration 1건 실패·Response 소비 방지 (2026-10-27 KST)

- **관측 실패:** [PR CI Run 40394690714](https://github.com/planner77/layoutManager/actions/runs/40394690714) attempt 1, HEAD `0cab0f1449e0a7f8e41a1149a5e46b0aa0ef8a72`, Verify [Job 121824493035](https://github.com/planner77/layoutManager/actions/runs/40394690714/job/121824493035) **Unit 및 Integration Step 9 실패**(64 파일=63 PASS/1 FAIL, 360 테스트=359 PASS/1 FAIL). Typecheck/ESLint **PASS**, Docker [Job 121824492537](https://github.com/planner77/layoutManager/actions/runs/40394690714/job/121824492537) SUCCESS. 오류: `tests/integration/g7-s3-operational-auth.test.ts:127:57`에서 `login()` 헬퍼가 `await r.json()`으로 본문을 먼저 소비하여 응답 진단 `admin.response.clone().text()` 실행 때 `TypeError: Response.clone: Body has already been consumed`. 인증 실패, 실 운영 장애, GHCR 오류로 판단하지 않는다.
- **교정:** 로그인 헬퍼는 `await r.clone().json()`으로 **복제본만 소비**하고 원본 응답을 보존, 테스트에 `admin.response.bodyUsed===false` 회귀 추가. Node.js 표준 Response 단독 시험에서 클론 파싱 후 원본 clone 가능·bodyUsed false 확인, **전체 Vitest/Prisma/HTTP는 새 HEAD PR CI 전 PASS 아님**. 기존 #40337811911의 TS2540·Bash GHCR P1 조치 및 Codex Resolved 기록 유지. 자세한 경위는 [FailureLedger](out/FailureLedger.md)/[TestReport](out/TestReport.md).
- **범위:** 최신 Main `338e1097b81115f8309fc4fde98414407ab826d0`에 이미 정렬(behind=0), Codex P1 답변·Resolved 및 미해결 리뷰 스레드 0건. S3-2 정확 제목·23개 파일 경로 GHCR 미게시 테스트는 이번 실패 Run에서 PASS하였으며 일반 이미지 게시 아님. 운영 Prisma/기존 CAD/Nginx/Compose/.env/실 DB/CAD/S3·GHCR/이슈 종료 금지, #109/#96 OPEN/BLOCKED. 문서 포함 최종 HEAD의 새 PR CI 결과 확인 전 성공 주장 금지.


## Issue #109 / PR #131 — 첫 CI TypeScript 실패·GHCR Case P1·Main 정렬 (2026-10-27)

- **실제 실패:** [PR CI 40337811911](https://github.com/planner77/layoutManager/actions/runs/40337811911) 최초 HEAD `e31c69ccb096ffc34d16f91e8b9a33cb4f7d23f1`에서 Verify [Job 121624002318](https://github.com/planner77/layoutManager/actions/runs/40337811911/job/121624002318) **TypeScript 검사 실패**, Docker [Job 121624002854](https://github.com/planner77/layoutManager/actions/runs/40337811911/job/121624002854) **SUCCESS**. `tests/integration/g7-s3-operational-auth.test.ts`의 `process.env.NODE_ENV = ...` 2개 지점에서 TS2540(읽기 전용 속성) 발생. 이후 Lint/Unit/Build/E2E SKIPPED, PASS가 아님. `Object.assign(process.env,{ NODE_ENV: ... })` 방식으로 시험 전환·원상복구 교정.
- **Codex P1:** [r4378255007](https://github.com/planner77/layoutManager/pull/131#discussion_r4378255007) — S3-2 GHCR allowlist의 `src/app/api/g7-operational/[...segments]/route.ts`가 Bash `case` 문자클래스로 해석돼 정확한 S3-2 squash 변경도 의도된 `publish=false` 경로를 통과하지 못함. **해당 대안을 단일 인용부호로 리터럴 매칭**, 정확경로 정상·인접 변형 차단 fixture 추가. 실제 GHCR 게시/릴리스 실패를 관측한 것은 아님.
- **Main 정렬:** 기존 Main `37c0d6e4`보다 2커밋 앞선 Main `338e1097`의 #124/#126/#127 변경을 먼저 보존·병합해야 함. Docs는 원본 Main 변경을 유지하면서 S3-2 기록만 추가. 최신 HEAD의 PR CI·리뷰는 보완 코드에 새 CI가 시작된 후 결과 확인 전 **PENDING**. 운영 Auth/Prisma/CAD/Compose·GHCR 게시/PR 병합/Issue #109/#96 종료 금지.


## Issue #109 S3-2 — Auth/Admin API 격리 통합·프로덕션 강제 OFF (2026-10-26)

- **구현:** `src/app/api/g7-operational/[...segments]/route.ts`에 Auth(Login/최초 변경/Session/Change/Logout), G4 Role/Site/SpecialGrant·Disable·Audit 및 Admin-only User Create의 **운영 계약용 예약 API**를 연결한다. G1~G4에서 검증한 `createG3IsolatedStore`/`createG4IsolatedStore`/`createG2IsolatedStore` 어댑터를 **일회용 S3 후보 SQLite에서만** 재사용하며 기존 CAD POST/Current/Delete/익명 GET·Viewer는 변경하지 않는다.
- **기본 OFF의 강제 경계:** `NODE_ENV=production`에서는 **모든 G7_* flag가 true여도 404**. 테스트용 ON은 nonproduction + `G7_S3_AUTH_API_PREVIEW_ONLY=true` + `G7_S3_MIGRATION_TEST_ONLY=true` + `G7_AUTH_ENABLED=false`/`G7_CAD_WRITE_CUTOVER_ENABLED=false` + UID 소유 전용 `/tmp/cad-g7-s3-*/fixture.sqlite`/manifest·정식 7개 migration·`127.0.0.1` Origin 일치인 경우에만 허용. S3-1 pure Release/Operation preflight는 여전히 `runtimeActivated=false`; 운영 OCI·DB·Owner 실증/GO를 synthetic 값으로 대체하거나 활성화하지 않는다.
- **관리 및 보안:** `scripts/g7-s3-admin.ts --ack-disposable-only`는 명시 1회 관리자 생성·복구(Secret 0600, nonce 1회·전체 세션 회수+Audit)만 격리 DB에 실행, startup/운영 Migrator 자동 호출 없음. S3-2 `users/create`는 G4 DB Admin 사전인가를 감사한 후 재인가+User/ACCOUNT_CREATED Audit 단일 거래(신규 사용자 Role 미부여, 최초 암호 변경 필수). `cad_g7_s3_session` HttpOnly·Path 한정 Cookie는 기존 `cad_session`/`cad_staging_session`와 분리. Session 8h/idle 30m/3개, Origin/CSRF, Role/Site/Version Server DB 재조회 및 `audit:read` SpecialGrant 확인.
- **실행·문서:** [S3-2 Runbook](src/deploy/g7-s3/S3-2.md), ADR/Architecture/Database/Requirements/Operation/TestPlan/TestReport/FailureLedger 참조. 허용된 일회용 DB의 정식 Migration 및 HTTP 통합 테스트/보안 거부 테스트를 CI에 추가했지만 실제 PASS는 새 PR HEAD CI 결과 전 미확인. 운영 DB Migration(활성 History 여전히 CAD 6개), 운영 인증·관리 실제 ON, 기존 CAD API/Audit Cutover, Compose/Nginx/.env, DB/CAD/S3, GHCR 이미지/태그, Issue #109/#96 종료 금지.
- **GHCR 통제:** 추후 정확 Squash `#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]` + 23개 S3-2 파일만 Main `publish=false`; 다른 runtime·활성 Prisma History·운영 CAD API/Compose/다른 Workflow 혼입 시 stderr+nonzero fail-closed. 기존 S1/S2/S3-1 예외는 보존. 이번 요청은 새 PR CI 시작까지 진행, 모니터링/병합/배포하지 않는다.


## Issue #57 / PR #134 — 최초 CI Docker Migrator 누락 의존성 (2026-10-27)

- **관측된 초기 실패:** [PR CI 40418875931](https://github.com/planner77/layoutManager/actions/runs/40418875931), attempt 1, HEAD `1a5c26526dc3ba90f12aa7e6f5f150a039180933`. Verify Job `121907950137` success, Docker Job `121907948037`의 Compose fresh/migration step 16 failure. `backfill-delete-passwords.ts`→`logger.ts`→`upload-error-catalog.ts`의 직접 의존성이 축소 Migrator Docker COPY에서 누락되어 `ERR_MODULE_NOT_FOUND`, `backfill exited 1`. PR [P1 리뷰](https://github.com/planner77/layoutManager/pull/134#discussion_r4383549858)도 같은 문제 지적.
- **재발 방지 계약:** Logger의 상대 import를 변경할 때 `src/Dockerfile`의 Migrator 명시적 COPY 및 `src/tests/unit/standalone.test.ts` `TC-LOG-MIG-001`을 함께 점검한다. Migrator build의 Node+tsx import preflight와 PR CI의 파일 존재·logger import smoke는 **DB/Compose 실행 전 의존성 누락을 검출**한다. Next.js 웹 번들 빌드 성공은 축소 Migrator 런타임 성공의 증거가 아니다.
- 실패·조치는 [FailureLedger](out/FailureLedger.md), 검증 경계는 [TestReport](out/TestReport.md)/[TestPlan](out/TestPlan.md), 설계는 [Issue57](out/Issue57.md)를 참조한다. 신규 HEAD 검증 이전 PASS 금지. 이번 범위는 리뷰/충돌 해결 및 새 PR CI 시작까지만이며 병합/Main CI/GHCR/운영 DB·G7 Auth/실 CAD/Issue 종료 금지.



## Issue #57 — 단일 app Logger와 업로드 진단 계약 (2026-10-27)

- [Issue57](out/Issue57.md)·[ADR-054](out/Decisions.md)·[Logging](out/Logging.md): 기존 #18 `writeLog`가 유일 app-owned 구조화 emitter. `UploadDiagnostics` 별도 JSON/console 삭제·schemaVersion 1/엄격한 확장 allowlist/공통 LOG_LEVEL·LOG_FORMAT 적용. Error·stack/경로/Locator/토큰/bytes 원문 노출 금지.
- `X-Request-Id` 및 업로드 공개 JSON, 단계/첫 실패 우선·복구 ID 유지, 성공 Health 200만 debug 필터. API/Viewer/DB/G7 Auth 운영 활성화·Migration 및 로그 보관/조회(#59~#62) 별도. 새로운 앱 이벤트/필드 추가 시 v1 계약·안전성 테스트 먼저 갱신.
- 호환 로깅 결함 수정이므로 `src/package.json`·lock root를 0.42.1 PATCH 후보로 정렬하며 기존 v0.42.0 태그/이미지 이동 금지. 현재 범위는 구현·리뷰·충돌 해결·PR CI **시작**까지. 실행하지 않은 test/CI는 PASS 아님. 병합/GHCR/운영 적용/이슈 종료는 별도 지시 전 수행하지 않는다.


## Issues #124/#126/#127 — 0.42.0 완료 (2026-10-27)

- 홈 Sticky/밀도·DXF Three 기본/실패 복구·Viewer 그룹 메뉴/Drawer를 구현하고 PR #132, 최신 PR/Main CI, GHCR App/Migrator 0.42.0 pair 및 세 이슈 종료를 확인했다. 요구/설계/AC는 [Issues124-126-127](out/Issues124-126-127.md), 실제 QA·실패·게시 근거는 [TestReport](out/TestReport.md)의 U-ISSUES124-126-127-20261027과 [FailureLedger](out/FailureLedger.md)를 따른다. Viewer/목록·렌더러 오류/키보드 변경 시 이 근거를 먼저 확인한다. 다음 별도 수용은 #113 실 CAD/GPU이며 운영 Auth/G7·배포 승인은 이 완료와 분리한다.


## Issue #109 S3-1 — 운영 Prisma Schema·격리 후보 Migration·이중 게이트 (2026-10-26)

- **이 단계의 구현 경계:** S3-1은 `src/prisma/schema.prisma`에 G1~G4 User/AuthSession/Role/Site/SpecialGrant/Audit/RecoveryNonce/G3LoginAttempt 모델을 포함해 Prisma Client 타입을 만들고, **7개 정식 Prisma 후보 Migration은 `src/deploy/g7-s3/prisma/migrations`에 격리**한다. 현재 `src/scripts/deploy.ts`가 운영 자동 `prisma migrate deploy`를 수행하므로 **신규 Auth Migration을 `src/prisma/migrations`에 넣으면 운영 DB에서 미승인 자동 적용될 수 있다.** 따라서 활성 운영 Migration 6개는 불변, 별도 S3 승인·롤아웃 PR 전 승격/복사 금지. 상세 [S3-1 Runbook](src/deploy/g7-s3/README.md), [Database](out/Database.md).
- **안전한 CI:** `src/deploy/g7-s3/prisma.config.ts`는 명시된 Linux UID 소유 `/tmp/cad-g7-s3-*/fixture.sqlite`·0700 root/0600 DB·0600 marker·두 DB URL 정확 일치·`G7_S3_MIGRATION_TEST_ONLY=true` 및 Auth/Write 플래그 OFF 조건이 아니면 Prisma SQL **이전**에 `G7_S3_DISPOSABLE_MIGRATION_ONLY` 거부. Unit/Integration은 실제 운영 경로 접근/변경 0. G1~G3 기존 시험의 “운영 Schema에 인증 모델 없음” 검사는 이제 **Client 모델 포함·활성 운영 SQL 여전히 여섯 개**로 변경. [TestPlan](out/TestPlan.md).
- **Release/Operation 사전 검증:** `src/server/g7-operational/preflight.ts`는 `G7-S3-AUTH-V1`, App/Migrator 동일 버전·source SHA·immutable digest, 신규 Schema ID, 외부로부터 확인된 registry/DB/FK/rollback 증거, 특정 릴리스의 Owner GO·범위·유효 시각·Snapshot·승인 ID를 함께 요구한다. 기본 Auth/Write OFF, 오류 fail-closed. **순수 preflight일 뿐 라우트 미연결이며 반환은 항상 runtimeActivated=false**; 실제 image/DB 근거나 S3 운영 승인 합격을 의미하지 않는다.
- **GHCR 게시 금지:** 이 PR의 향후 Squash 제목은 정확히 `#109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]`이며 Main release-scope에서 S3-1 파일의 열거형 allowlist만 `publish=false`. 운영 경로/활성 Migration/다른 workflow 포함, 잘못된 S3 제목은 `stderr`+비정상 종료. S1/S2 예외/일반 릴리스 정책 보존. 사용자 범위는 구현·리뷰/충돌 해결·PR CI 시작까지이며 **PR 병합/Main CI/GHCR/실운영 Auth·Prisma·Nginx/Compose/.env·실 DB/CAD/S3/이슈 종료 금지**. #109/#96 OPEN/BLOCKED.



## Issue #109 / PR #129 — S2 비반출 준비 전용 GHCR 미게시 게이트 (2026-10-26)

- **Owner 지시:** S2 내부 평가 도구를 PR 병합·GHCR 게시 없이 준비하고 PR CI 시작까지만. 정확한 향후 Squash Commit **첫 줄**은 `#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]`으로 고정한다. PR #129의 코드/테스트/문서/해당 workflow 등 **명시된 S2 파일만** 포함할 때 Main CI `publish=false`; 비인가 운영·Stage S1 파일 또는 GitHub workflow 혼입 시 `stderr + exit 1`로 fail-closed. 유사 제목·후행 공백/접미도 실패시키며, 여러 줄의 본문은 허용한다.
- **S1 기존 계약 보존:** `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]`의 독립 허용목록은 변경하지 않는다. S2 제목으로 S1 전용 Stage Auth/CAD·운영 CAD API/Prisma/Compose 파일을 포함할 수 없고 반대도 마찬가지다. 다른 일반 런타임 변경·태그 릴리스는 기존 게시 판정 유지.
- **사유와 증거:** 기존 [PR CI 40313233131](https://github.com/planner77/layoutManager/actions/runs/40313233131) HEAD `29ed3028bf0f78ba37abba0ecde73a6483d0942f` Verify·Docker 성공, 그러나 [Codex P1 r4376591801](https://github.com/planner77/layoutManager/pull/129#discussion_r4376591801)은 기존 Main release-scope가 S2 소스를 런타임 변경으로 감지해 GHCR publish로 보낼 수 있다고 지적했다. 이는 **리뷰 지적·배포 위험**이며 관측 PR CI/GHCR 실패나 실제 게시가 아니다. 보완 HEAD의 성공은 새 CI 결과 전까지 미확인. [FailureLedger](out/FailureLedger.md), [TestPlan](out/TestPlan.md), [S2 Runbook](out/Issue109-S2-Readiness.md) 참조.
- **운영 경계:** 현재 PR은 오프라인 사내 증거 형식/누락 검증 준비물이다. 운영 CAD POST/Current/Delete Auth·Audit Cutover, 정식 Prisma Migration, 실제 OCI pair·DB/CAD/S3 복구, SOP 및 S3 실행 GO는 **미구현 또는 원본 미검증**. 운영 API·Nginx/Compose/.env/실 데이터/GHCR·Issue #109/#96 종료 변경 금지.


## Issue #109 S2 사내 비반출 증거 준비 — 운영 실행 HOLD (2026-10-26)

- Owner는 S1 수용 및 S2 진행 승인 의사를 표시했으나, 내부 원본 시험 결과의 외부 제출은 불가하다. `out/Issue109-S2-Readiness.md`를 S2 필수 참조 문서로 사용한다.
- `src/server/g7-staging/s2-readiness.ts`, `src/scripts/g7-s2-readiness.ts`, `src/tests/unit/g7-s2-readiness.test.ts`는 **오프라인 비반출 형식/누락/동일 Snapshot 검사**만 하며 실제 운영 승인/실복구·기능 검증을 대체하지 않는다.
- S2 배포 차단 유지: 기존 CAD Multipart POST/Current PUT/Version DELETE 운영 Auth/Audit 연동, 정식 Prisma migration, 승인된 App+Migrator digest/rollback, 실 DB/CAD/S3 snapshot Restore가 아직 미완이다. `src/prisma/**`/기존 API/Compose/Nginx/.env/실 데이터 및 GHCR 변경 없음. 테스트 PASS만으로 S3 GO 금지.


## Issue #109 / PR #125 — PR CI Unit 실패 및 P1 3건 수정, 운영 미활성 (2026-10-26)

- **실패:** [PR CI Run 40275956996](https://github.com/planner77/layoutManager/actions/runs/40275956996), HEAD `818264afb8809ccf0a3e09262e1a09054fd43004`. Verify Job `121418632923` Unit/Integration 313 중 1 실패(59 파일 중 1), Docker `121418632714` 성공. Typecheck/Lint 성공, 이후 Build/E2E SKIPPED. 원인: GHCR 비허용 경로 거부는 exit 1인데 `echo`는 stdout, Unit은 stderr를 예상. [FailureLedger](out/FailureLedger.md) 보존, 새 HEAD CI 실행 전 재검증 미확인.
- **P1 3건 교정:** (1) no-GHCR Main 예외는 `COMMIT_SUBJECT`를 첫 줄로 추출하여 정확히 `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]`일 때만 허용. suffix/의사 승인 유사 제목은 fail-closed, 멀티라인 본문은 허용. (2) Stage `deploy/g7-staging/prisma.config.ts`가 CLI 로딩 시 `resolveG7StagingGate`를 통과하지 못하면 `G7_STAGING_PRISMA_TARGET_DENIED`로 Prisma SQL **사전** 종료, 기본 fallback DB 없음; Stage /tmp 실제 파일/UID/realpath/symlink/전용 CAD/manifest·URL/승인 조건을 요구. (3) 비허용 경로 진단을 stderr로 출력하여 Unit과 일치시킴. [PR #125 P1](https://github.com/planner77/layoutManager/pull/125), TestPlan/TestReport/원장 참조.
- **실행 가이드 변경:** Stage CLI 실행 전 `G7_STAGING_ONLY=true`, `G7_RELEASE_CAPABILITY=G7-S1-STAGING-V1`, `G7_OPERATION_APPROVAL=S1-STAGING-ONLY`, 격리용 `G7_AUTH_ENABLED=true`, `G7_STAGING_ROOT`/`G7_STAGING_DATABASE_URL`=`DATABASE_URL`/`CAD_STORAGE_PATH`/`G7_STAGING_ORIGIN` 전부 설정. **운영 값/실 DB/실 CIDR·Secret 설정 금지**. 모든 flag 기본 OFF, 별도 Stage CAD Write Gate도 원칙상 false.
- **사용자 업무 범위:** 새 HEAD PR CI **시작까지만**, CI 모니터링/병합/GHCR/운영 Auth·정식 Prisma Migration·Nginx/Compose/.env/실 DB/CAD/S3/이슈 종료 금지. #109·#96 OPEN/BLOCKED.


## Issue #109 / PR #125 — Staging CI 수용 범위·쿠키 격리·GHCR 미게시 계약 (2026-10-26)

- 첫 S1 HEAD `a82a04bb` [PR CI 40270394055](https://github.com/planner77/layoutManager/actions/runs/40270394055) Verify·Docker 성공. 이후 코드/테스트 수정 HEAD는 별도 CI 필요. Codex review summary `running`은 스레드 0이어도 승인 아님. [TestReport](out/TestReport.md)·[FailureLedger](out/FailureLedger.md).
- **운영과 Staging Cookie 분리:** stage 응답은 `cad_staging_session; Path=/api/g7-staging`만 설정·폐기하며 G3/G4 Service 내부의 `cad_session` 변환은 staging 어댑터 내부에서만 수행. 기존 운영 Cookie·인증/일반 CAD Route 수정 0. Stage 쿠키는 운영 승인/세션이 아니다.
- **GHCR 게시 금지:** 기존 Main CI는 코드 변경이면 GHCR 게시 후보로 분류하므로 [docker-publish.yml](.github/workflows/docker-publish.yml)에 **정확한 squash commit 제목** `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]`과 해당 Stage·문서·workflow allowlist를 함께 만족할 때만 `publish=false`로 설정. 예상외 경로는 release-scope Job 실패, 일반 runtime 코드/tag는 기존 게시 정책 그대로. 통합 PR에는 이 제목을 지정한 squash merge만 허용하며 merge 전 수동 변경 범위·PR CI 확인 필요. Main CI의 GHCR Job이 실제 SKIPPED인지 확인하기 전 **미게시 성공 주장 금지**.
- **합격 경계:** Staging 공식 Prisma fixture·Stage-only JSON/base64 DXF 업로드/Current/DELETE·SQLite snapshot 테스트는 기존 Multipart CAD API/S3/실 PC/실 운영 Prisma Migration/동시 snapshot DB·CAD·S3 복구 수용이 아님. S2 Owner Go/No-Go 전 기존 앱/운영 데이터·Compose/Nginx/.env/GHCR/영속 API/물리 Audit purge OFF. #109/#96 OPEN/BLOCKED.



## Issue #109 G7 S1 — 단일 Staging 통합 구현 (2026-10-26)

- #109는 **단일 브랜치/PR**에서 비운영 G1~G4 Auth/Session/Grant/Audit 서비스, 전용 Prisma 7 Schema/Migration, App Router 스테이징 API, Admin 1회 CLI, CAD 편집 모의경로·E2E를 통합한다. [Issue109](out/Issue109.md), [Operation](out/Operation.md) 기준.
- **운영 안전 장벽:** 기존 `src/prisma/schema.prisma`/`src/prisma/migrations`/기본 `prisma.config.ts`, `src/docker-compose.yml`, 운영 Nginx/.env, 기존 CAD API GET/POST/PUT/DELETE/운영 DB/CAD/S3는 변경 0. `src/deploy/g7-staging/prisma.config.ts`와 별도 migration history를 **명시적으로 지정한 폐기 가능한 /tmp DB**에서만 실행. `/api/g7-staging/**`은 release/operation 승인과 정확한 staging 전용 경로를 모두 만족하지 않으면 404, CAD writes는 추가 flag 기본 OFF.
- S1 Staging G7_AUTH_ENABLED/G7_CAD_WRITE_CUTOVER_ENABLED는 승인된 격리 시험에서만 true; 앱 배포/운영 인증·Audit purge 자동 ON 금지. `G7_OPERATION_APPROVAL=S1-STAGING-ONLY`는 Owner의 S2 운영 GO **아님**. 원본 CAD 익명 GET·Viewer 유지, 기존 쓰기 정책 변경 없음.
- Staging POST는 **DXF 전용 제한된 JSON/base64 미러 API**이며 기존 Multipart `POST /api/cad-files`와 교체/완전 호환을 주장하지 않는다. G7 쓰기·감사 BEGIN IMMEDIATE 거래, Editor+Site·DELETE 레거시 암호 AND, 세션/권한 즉시 재검증; 별도 #98/#65/#83/#60 영속 API와 Audit 물리 purge 비공개 유지.
- `src/tests/unit/g7-staging-gate.test.ts`, `src/tests/integration/g7-staging.test.ts` 작성. 실제 CI RUN/Job 확인 전 PASS 금지, 로컬 CLI/실 LAN/실 S3·배포는 NOT RUN. #108 Owner 수용은 확인됐지만 사내 원시 시험증거/복구 체크섬 미열람이며 #109/#96 OPEN/BLOCKED·운영 별도 GO 필요.


## Issue #109 G7 — 운영 활성화 설계 문서만 준비 (2026-10-26)

- [Issue109](out/Issue109.md), [ADR-051-G7-PLAN](out/Decisions.md), [Operation](out/Operation.md), [TestPlan](out/TestPlan.md) 기준. G0~G5 #102~#107은 격리·Preview 범위에서 완료; G6 #108은 Owner의 직접 시험 정상 보고에 따라 **closed/completed**되었으며 공개 저장소에서 개별 현장 로그·비공개 증거 ID는 독립 확인되지 않았다. #109 및 #96은 **OPEN/BLOCKED**.
- 미래 구현 계약: 검증된 G7-capable App/Migrator OCI digest pair·운영 Schema(**release gate**)와 별도 Owner GO·설정(**operation gate**)가 모두 필요. 설계상 `G7_AUTH_ENABLED`, `G7_CAD_WRITE_CUTOVER_ENABLED`는 기본 false, 정확히 true만 ON, 후자는 Auth OFF 시 강제 OFF. **현재 flag·운영 API는 미구현**이며 문서/`.env`·CI/GHCR로 자동 활성화 불가.
- 기존 CAD GET/Viewer/원본 다운로드 익명 유지. POST/Current 인증 Editor 이상+담당 Site, Version DELETE 같은 조건 AND 레거시 삭제 비밀번호. Admin 다른 Site 자동 허용 금지. 신규 Outline/Memo/Type/Logs/Audit/Admin 영속 API 익명 금지; Audit 365일 이후 purge는 별도 SOP 승인 전 OFF.
- 현재 PR은 Markdown-only; `src/**`·Prisma/DDL/Nginx/Compose/.env·실 운영 DB/CAD/S3/기존 API/버전·GHCR 변경·운영 활성화 0. 작성된 테스트/CI 시작은 PASS가 아니며 Owner 별도 GO와 실제 복구 증거가 필수. 실 사내 IP·Secret·DXF/객체 목록/원시 로그 GitHub 공개 금지.


## Issue #108 G6 — 수용 증거·일회용 Backup/Restore 격리 (2026-10-26)

- [Issue108](out/Issue108.md), #102 ADR-051-R1과 G1~G5 선행 참조. DESIGN.md 없음 → Architecture/Decisions/Database/Operation 기준. 기존 공개 CAD GET/Viewer/원본 익명; 미래 POST/Current Editor+담당 Site, DELETE 동일 조건+기존 삭제 비밀번호 AND. Admin도 Site 자동 허용 없음.
- src/scripts/g6-evidence.mjs는 **사내 비공개 매니페스트 정합성만** 점검, 실제 주소/Cookie/Secret/CAD/SHA/S3/로그를 출력하지 않음. 저장소 밖 절대경로·비심볼릭 링크·크기 제한. READY_FOR_OWNER_REVIEW는 **실 시험 PASS/Owner 승인 아님**. 모든 항목 NOT_RUN 예제 별도.
- src/tests/unit/g6-evidence.test.ts는 상태 누락/불일치/개인정보 출력 차단, src/tests/integration/g6-backup-restore.test.ts는 **기존 CAD 6개 마이그레이션 합성 SQLite·두 Version/Current·local CAD/mock-S3**의 백업→격리 G1 fixture migration→손상 주입→실 복원을 점검. 실 원격 S3·Windows Nginx/PC 2대·운영 Backup/Restore는 **NOT RUN**.
- 운영 Auth/API·Prisma/Schema/Migration·Nginx/Compose/.env/실 DB/CAD/S3/GHCR, Audit 물리 파기 활성화 0. #109 G7 별도 Owner Go/No-Go 및 G6 현장 증거 전 #108 OPEN/BLOCKED. 이번 요청은 리뷰/충돌·원장 정리와 PR CI **시작까지**이며 CI 성공·병합·배포/이슈 종료 아님.


## Issue #106 G4 — PR #120 검증·병합 및 GHCR v0.41.1 후속 (2026-10-26)

- **완료된 기능 PR:** [PR #120](https://github.com/planner77/layoutManager/pull/120), 최종 HEAD `d4afaf0ae3cee51a172dad9305533d941daa5706`의 [PR CI 40253887969](https://github.com/planner77/layoutManager/actions/runs/40253887969) Verify(E2E 포함)·Docker 각각 `completed/success`. 미해결 리뷰 스레드 0, main behind 0, mergeable true 확인 후 `squash` 병합 커밋 [0f59351e](https://github.com/planner77/layoutManager/commit/0f59351ef160e3cc79681a78c34714db8d088ab9). [Main CI 40254890094](https://github.com/planner77/layoutManager/actions/runs/40254890094) 시작 확인, 완료 결과/게시 성공 모니터링하지 않음.
- **GHCR 신규 게시 필요:** #105의 [Main CI 40249052914](https://github.com/planner77/layoutManager/actions/runs/40249052914)는 기존 App/Migrator `0.41.0` Pair 게시 Job 성공, `v0.41.0` 태그 존재. #106에서 **기존 이미지/태그 이동 금지**. 새로운 `0.41.1` App·Migrator 후보로 `src/package.json`과 `src/package-lock.json` 루트 버전만 동기화하는 릴리스 PR을 작성한다. 새 릴리스 PR HEAD CI(Verify + Docker) 성공·리뷰 0·main 정렬 이후에만 squash merge/새 Main CI에서 후보 digest→paired promotion. **PR CI 시작은 GHCR 게시/버전 태그 생성 완료가 아니다.**
- **G7 정책:** G4 구현 완료와 GHCR 패키징은 운영 Auth/Admin/API·실 Prisma Migration·Compose/Nginx/.env·실 DB/CAD/S3/기존 익명 GET·Current·삭제 암호 전환을 승인하지 않는다. 실제 운영은 #109 G7 별도 Owner Go/No-Go, G6 #108 현장·복원 증거 필수. G4 최초 실패 [40252656906](https://github.com/planner77/layoutManager/actions/runs/40252656906)와 P1 리뷰 2건은 [FailureLedger](out/FailureLedger.md)에 보존한다.


## Issue #106 / PR #120 — 최초 CI 9개 실패 및 P1 감사 보완 (2026-10-26)

- **실패 실증:** [PR CI 40252656906](https://github.com/planner77/layoutManager/actions/runs/40252656906) HEAD `53b75ca17190cd101689a3f10877adcb737ff37c`, Verify Job `121347711873` Unit/Integration **failure** (54 files: 53 passed/1 failed; 297 tests: 288 passed/9 failed). 기존 Typecheck/Lint 성공(경고 2개), Docker/Migration/Runtime Smoke Job `121347711740` success; Verify 이후 Build/E2E **SKIPPED**.
- **원인/교정:** `tests/integration/auth-g4.test.ts:37`에서 동일 Product 아래 두 Site에 동일 name=`Site` → 실제 CAD `uq_site_parent_name` 위반, 모든 G4 Test `beforeEach` 중단. `Site-a`/`Site-b`로 구분하고 fixture 명칭/권한 검사 TC 보강.
- **P1 리뷰 2건:** [4373235025](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235025) (중복 Site)와 [4373235027](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235027) (인가/Outline Audit의 `site_id` 누락). G4 Transaction에서 DB Version→Site를 재해석하여 허용·거부/Outline 사건에 site_id 보존; G1 disposable AuditEvent CHECK는 scoped 액션의 실제 Site ID를 허용하되 다른 action 임의 Site ID·Site Grant affected 사용자 미기록은 거부. TC-P4-G4-001/005/009를 확대.
- **원장/인계:** [FailureLedger](out/FailureLedger.md), [TestReport](out/TestReport.md), [Issue106](out/Issue106.md). 수정 후 최신 HEAD Typecheck/Vitest/PR CI의 실제 결과 확인 전 **PASS 판정 금지**. 정상 Auth/API/Prisma/Compose/Nginx/기존 CAD GET/원본·실 DB/S3 및 G7 #109 운영 OFF 불변. 리뷰 답변/해결·main 정렬/새 PR CI 시작까지만 진행하고 모니터링 생략.


## Issue #106 G4 — 격리 Role/Site/Version·Grant·Audit (2026-10-26)

- 기준: [Issue106](out/Issue106.md), #102 G0-BIZ-01~06, #103 G1/#104 G2/#105 G3, ADR-051-R1. DESIGN.md가 없어 Architecture/Database/Decisions를 설계 기준으로 사용.
- 기존 공개 CAD 목록/Viewer/원본 GET는 익명 유지. CAD POST/Current = Editor 이상+DB 담당 Site, Version DELETE = 동일 조건 **AND 기존 삭제 비밀번호**. Admin Site 자동 허용 없음. 신규 영속 Outline/Memo/Type/Logs/Audit/Admin GET 익명 허용 금지.
- G4는 src/domain/auth.ts, src/server/auth/g4-service.ts, src/tests/fixtures/auth-g4/store.ts, G1 fixture SQL, TC-P4-G4-001~009의 **격리 구현**. 현재 운영 App Router/Auth/Admin/API/Prisma/DDL/Compose/Nginx/.env/실 DB·CAD·S3/GHCR 및 기존 Viewer/Current/Delete 동작 변경 0. #109 G7 Owner Go/No-Go 전 운영 OFF.
- 세션·계정·현재 Role/Site/SpecialGrant/Version→Site를 같은 BEGIN IMMEDIATE 거래에서 재확인, Grant·Account disable·ShadowOutline CAS·Audit 일괄 Commit. 401/403·Audit 장애 503 rollback, actor/affected/site/revision/outcome/UTC/requestId 안전 필드·append-only·365일 경계. 물리 purge는 SOP 추가 승인 전 금지. audit:read/logs:read 독립 Admin SpecialGrant.
- TestReport에 실제 실행 증거 없이 소스/TC 작성만으로 PASS 표기 금지. FailureLedger는 관측 실패만 누적. 새 PR CI 시작 후 모니터링·병합·GHCR·실 배포는 본 요청 제외.


## Issue #104 / PR #118 — 이전 CI 통과 및 GHCR v0.40.5 신규 후보 (2026-10-26)

- **이전 HEAD G2 CI:** [Run 40234510320](https://github.com/planner77/layoutManager/actions/runs/40234510320), HEAD `f5f7ea2e00a95b24e65f16c67fc8484d03031dce`는 Verify/Typecheck·Lint·Unit·E2E 및 Docker/Migration·Smoke Job 모두 completed/success. 미해결 리뷰 0, 당시 main behind=0/mergeable=true.
- **새 GHCR 사용자 요청:** 이미 발행된 v0.40.4 앱·마이그레이터 Pair/tag를 변경하지 않고 새 v0.40.5 PATCH 후보로 `src/package.json`/lockfile 루트 버전 일치. G2 격리 내부 구현 외 **운영 인증/관리 API, 운영 Prisma/Compose·Nginx/.env/실 DB/CAD/S3 자동 활성화 0**. 기능 G7 #109 별도 Owner Go/No-Go 유지.
- **새 HEAD 필수 게이트:** 버전 변경으로 이전 CI PASS를 재사용하지 않고 최신 PR CI 양쪽 Job 성공·리뷰 Thread 0·main 뒤처짐/충돌 0 후에만 squash merge/Issue 종료. Main CI의 GHCR candidate 이미지 두 digest 검증→버전/최신 쌍 승격은 그 후 진행하며, 시작과 실제 게시 성공 구분. [FailureLedger](out/FailureLedger.md), [TestReport](out/TestReport.md), [ChangeLog](out/ChangeLog.md).

## Issue #104 / G2 — Admin 최초 단발 생성·복구 격리 구현 (2026-10-26)

- [Issue104](out/Issue104.md), [ADR-051-G2](out/Decisions.md), #102 Owner R1과 종료된 #103 G1 DB/Nonce 계약 우선. DESIGN.md는 부재하여 Architecture/Decisions/Requirements 기준. 지정 사내 운영 담당자가 최초 Admin 생성·복구 실행, Owner 운영 책임. 실제 수행자/Secret 경로·승인·대체자/증거는 사내 비공개 SOP로 관리.
- `src/server/auth/admin-setup.ts`는 **명시 호출 전용**; `src/tests/fixtures/auth-g2/store.ts`는 G1 disposable SQLite에만 연결, `src/scripts/auth-g2-isolated.ts`는 `--ack-isolated`와 G1 경로 Guard 필수. 최초 1회 User/Role/Audit atomic·must-change+scrypt, 복구 nonce SHA unique·세션 전량 revoke/Audit, 재시작 Admin ID/Role/Hash 덮어쓰기 금지. Linux 실행 UID 소유 0400/0600 regular Secret·final symlink 거부, 비밀번호/Secret 경로/hash/nonce 로그·Git/CI 출력 금지.
- **G7 Owner 승인 전 실제 Auth/Admin/API/Prisma/DDL·Compose/Nginx/.env·실 DB/CAD/S3/GHCR 및 기존 CAD 익명 GET/Current/삭제 동작 변경 0.** G2 테스트 TC-P4-G2-001~009 작성과 실행 PASS는 구분. #102 문서 PR #114 main 병합 및 POST 업로드 Editor/Admin+담당 Site Owner 승인 완료. G0 #102은 별도 OPEN, Audit 보존 후 정리·백업 세칙은 후속.

## Issue #102 G0 — Owner 6개 업무 정책 추가 승인 (2026-10-25, ADR-051-R1)

- **최신 최우선 결정:** [Issue102](out/Issue102.md) / [ADR-051-R1](out/Decisions.md)의 5개 업무 정책은 아래의 과거 `Reader+Site 조회 필수`, `Admin만 CAD 삭제`, `기존 삭제 비밀번호 폐지 검토`, `Audit 만료 후 정리 미승인` 등 제안보다 우선한다.
- **익명 CAD 조회:** 사내 LAN의 기존 공개 CAD 목록·검색/위치·Current/Version 메타데이터·Viewer·원본 파일 GET/다운로드는 로그인/SiteGrant 없이 허용. 익명은 Reader 계정/가상 Actor가 아니고, 공개 도면에 사용자별 Site 읽기 기밀성 통제를 제공하지 않는다. **신규 Outline/Memo/Type 영속 API, Admin/로그·Audit 조회는 익명 공개 승인 대상이 아니다.**
- **쓰기 업무권한:** Current 지정 `Editor 이상 + 담당 Site`; CAD Version 삭제 `Editor 이상 + 담당 Site + 기존 삭제 비밀번호` **모두 필요**. Admin도 Site 자동 권한 없음, Client의 Site·Actor claim/삭제 비밀번호만으로 권한 부여 불가. `POST /api/cad-files`는 **Owner 승인 로그인 Editor 이상+담당 Site(G0-BIZ-06)**이며 익명 CAD 조회 예외로 등록을 허용하지 않는다.
- **운영 책임/보존:** 최초 Admin 단발 초기화·복구 실행 = 지정 사내 운영 담당자, 전체 운영 책임 = Owner. Audit 365일 보존 후 만료 기록을 정리하는 방향 승인; 정리 방식·주기·백업 보존/복구 세칙은 후속 승인 대상이며 **지금 자동/물리 파기 금지**.
- **배포 금지:** 이 결정은 현재 익명 GET/삭제 암호/API 동작을 변경하지 않으며, 신규 Auth/DB/Prisma/Migration/Proxy/Nginx/Compose/.env 설정을 활성화하지 않는다. G1~G6 격리 구현/기능 시험 후 G7 별도 Owner Go/No-Go 전까지 운영 OFF. 테스트 미실행을 PASS로 기록 금지.


## Issue #107 — 구현 최종 판정 및 G6 인계 (2026-10-26)

- **구현 완료:** [PR #115](https://github.com/planner77/layoutManager/pull/115) Squash 병합. 최종 PR HEAD `44132fcaa31aff0c4643edfeb8db6949d801ca5b`, main commit `142c4b9bc0bdb2ad0403fb1ee6640cf070d0bbbc`. Issue #107은 `closed/completed`이며 재구현하지 않는다.
- **자동 검증 PASS:** [PR CI #40224438075](https://github.com/planner77/layoutManager/actions/runs/40224438075) Verify/Typecheck/Lint/Unit·E2E·Build 및 Docker/Migration/Runtime 두 Job `completed/success`. Viewer P2 리뷰 4371142398 답변·해결, 미해결 리뷰 0·당시 main 병합 충돌 0.
- **Main 릴리스 PASS:** [Main CI #40225537167](https://github.com/planner77/layoutManager/actions/runs/40225537167) `completed/success`, GHCR App·Migrator candidate build, paired image promotion 및 OCI measurement 관련 필수 step 모두 success. 기존 v0.40.3 불변, 새 tag `v0.40.4` 생성 확인. 런타임 실제 배포는 수행하지 않았다.
- **실 LAN 증거는 별개:** Windows Nginx↔WSL2/App 실제 연결, 사내 PC 2대, 업무 Upload/Download·Viewer 실제 조작, G3 Cookie/Session, DB/CAD/S3 백업·복원은 `NOT RUN`, [#108 G6](https://github.com/planner77/layoutManager/issues/108)에서 수용한다. #109 Owner 별도 Go/No-Go 이전 운영 Compose/Nginx/Prisma/Auth/API/데이터 변경·활성화 금지.
- 본 추가 작업은 **종료된 #107의 증거 상태를 Markdown으로 최신화하는 후속 문서 PR**이다. 이미 완료된 코드/CI/GHCR 게시를 재수행하지 않고 공격·탈취 보안 강화를 다시 요구하지 않는다.


## Issue #103 — PR #116 CI 실패·감사 P1 교정 (2026-10-26)

- 기존 [CI #40202066291](https://github.com/planner77/layoutManager/actions/runs/40202066291)의 Verify(TypeScript `store.ts:134 TS1002`)·Docker(baseline Next TypeScript) 두 Job은 동일 소스 결함으로 **FAILURE**, Unit/Integration/E2E 등은 **SKIPPED**. `src/tests/fixtures/auth-g1/store.ts`의 함수 선언 중복·문자열 파손을 단일 구현으로 정리해야 하며 수정 전 HEAD 성공을 전용하지 않는다.
- [P1 리뷰 r4371167619](https://github.com/planner77/layoutManager/pull/116#discussion_r4371167619): 관리자 actor + Site만으로는 권한 피변경 사용자 식별 불가. G1 Audit에 `affected_user_id`(User FK), `site_id`(CadSite FK)를 보존하고 Site grant/revoke에는 두 값이 필수. `TC-P4-G1-005`에서 서로 다른 사용자 동일 Site의 변경/철회 뒤에도 구분되는지 확인. **운영 Auth/API/Prisma migration/Compose/Nginx/GHCR 변경 금지**, G7 별도 승인 전 OFF.



## Issue #103 / G1 — User·Session·Grant·Audit 격리 DB 설계·검증 (2026-10-25)

- **#102 Owner R1 우선:** #103은 기존 CAD 테이블을 담은 일회용 SQLite 사본만 대상으로 한다. `src/tests/fixtures/auth-g1/{schema.prisma,migration.sql,store.ts}`는 **비운영·비연결 계약**이며 `src/tests/integration/auth-g1.test.ts`에서만 사용. `src/prisma/schema.prisma`, `src/prisma/migrations`, App API, runtime/Compose/Nginx, 운영 DB/원본 파일/실 S3/GHCR는 수정하지 않는다. G7 #109 Owner 별도 승인 전 활성화 금지.
- G1 트랜잭션: `BEGIN IMMEDIATE`, 8h/30m/최대 3개 세션(트리거+원자 count/insert, 4번째 거부·시계 역행 거부), 세션 원시 토큰 미저장, 비활성/복구 세션 폐기, Role/Site/Special Grant와 Audit 동일 트랜잭션, nonce hash 단발·재사용/삭제 불가, Audit append-only. Version→Location→Building→CadSite DB 검증, Admin도 Site 자동 승인 금지.
- **검증 경계:** 실제 여섯 CAD Migration을 일회용 SQLite에 적용한 뒤 G1 DDL/장애 주입/FK·Unique·복원과 CAD Version/Current/SHA/삭제 hash 불변을 점검하는 TC-P4-G1-001~009. 합성 로컬 CAD/가상 S3 복제는 실제 운영 백업·S3 복구 증거가 아니다(G6 #108). 실행 전 `NOT RUN`, CI 시작을 PASS로 주장 금지.
- 지침/설계/시험·복구 가이드: [Issue103](out/Issue103.md), [ADR-051-G1](out/Decisions.md), [Database](out/Database.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md), [Operation](out/Operation.md). 2026-10-25 #102 Owner 5개 승인: 기존 CAD 목록/Viewer/다운로드 익명 GET 유지, Current=Editor/Admin+담당 Site, Version 삭제=Editor/Admin+담당 Site+기존 삭제 비밀번호, 최초 Admin/복구=지정 사내 운영 담당자(Owner 책임), Audit 365일 경과 이력 정리 원칙. 관련 문서 PR #114는 병합·CI 완료 미확인. POST 업로드 권한, Secret/실 담당자, Audit 물리 정리·백업 복원 세칙, 실제 배포는 PENDING; #103 G1 운영 활성화 승인 아님. 기존 공개 CAD 익명 GET을 G1의 인증된 SiteGrant 검증으로 차단하지 않는다.


## Issue #107 / PR #115 — Viewer P2 리뷰·GHCR v0.40.4 준비 (2026-10-26)

- 기존 HEAD d771d553의 [PR CI 40201366001](https://github.com/planner77/layoutManager/actions/runs/40201366001)은 Verify 및 Docker 두 Job 모두 성공. Codex [P2 4371142398](https://github.com/planner77/layoutManager/pull/115#discussion_r4371142398)에서 위치 관리 페이지를 Viewer로 잘못 검사할 수 있음을 지적하여 실제 /cad/versions/:versionId/viewer 검증과 TC-P4-G5-007을 추가. 수정 HEAD CI 성공을 소급 주장 금지.
- 기존 v0.40.3은 Main CI 40199597907 GHCR App/Migrator 성공으로 발행됨. 새 GHCR 요청에 대해 0.40.4 package/lock 신규 릴리스 후보를 만들고 이전 버전 태그 이동 금지. 운영 Nginx/Compose·Auth/API·Prisma/원본 CAD/Current 변경 및 자동 활성화 없음. 새 PR CI·리뷰·충돌 통과 후 Main CI/GHCR 시작과 최종 게시 성공을 구분.


## Issue #107 / G5 — 간소 조직망 PROD Nginx·DEV 직결 Preview (2026-10-25)

- [Issue107](out/Issue107.md) / [Issue102](out/Issue102.md) 및 GitHub #102 최신 Owner 5개 업무 정책 참조. G5는 **실제 운영 보안강화가 아니라 비운영 접속 구성과 정상 기능 검증**이다. 별도 `DESIGN.md`는 없어 Architecture/Decisions/Operation이 설계 기준이다.
- 격리 Preview는 `src/deploy/g5/compose.preview.yml`(PROD Nginx→App, DEV 직결, 각자 독립 볼륨·네트워크), `nginx.preview.conf`, 읽기 전용 `src/scripts/g5-preview-smoke.mjs`, Unit으로 구성. 사내 실제 Nginx/Compose/Prisma/Auth/API/운영 CAD·DB 변경 없음.
- 조직망 소수 사용자/외부 인바운드 제한 전제하에 공격·탈취/침투·CIDR 단말 방어는 추가하지 않는다. `OWNER_ACCEPTED_SCOPE`는 안전성 PASS가 아님. 정상 Proxy/Host/Origin·Viewer·Upload/Download/Health, PROD/DEV 분리, 실 LAN 검증 및 G7 별도 승인만 유지.
- Preview 작성/Unit 테스트와 실제 PROD Windows Nginx/WSL2/LAN 2대 PC·G3 Cookie·업로드 실증은 **구분**한다. PR CI 시작을 현장 시험 PASS나 운영 활성화로 쓰지 않는다.


## Issue #102 / ADR-051-R1 — Owner 내부망 경량 보안 범위 결정 (2026-10-25)

- **최신 우선 정책:** [Issue102](out/Issue102.md), [ADR-051-R1](out/Decisions.md). 운영은 공개망 인바운드 제한 사내 업무망의 **Nginx 경유**, 개발은 **개발 App 직접 접속**. 이전 #96 D6/G0~G7의 적대적 공격·계정/세션 탈취 대응/침투시험을 필수 보안 게이트로 제시한 문구는 R1에서 대체한다.
- Owner는 HTTP 비암호화/내부망 탈취·변조 위험을 알고 **추가 공격 대비를 범위 밖으로 수용**했다(`OWNER_ACCEPTED_SCOPE`). 안전성 PASS·TLS 동등 보장·G7 운영 승인으로 해석하지 않는다. TLS/MFA/OIDC/SSO, 추가 per-client 보안 ACL, Header/Origin/CSRF 위조·브루트포스·패킷 탈취/침투시험은 새로운 필수요건이 아니다. 기존 비활성 검증 코드와 정상 흐름은 임의로 제거하지 않는다.
- **여전히 필수:** D1~D5 User/Session/Role/Site/Audit, 계정/권한 업무 정확성, 원자 DB 및 정상 Session 만료/회수, 운영·개발 데이터 분리, PROD Nginx/DEV direct 실제 동작, 기존 도면/API 호환, 동일시점 DB/CAD/S3 백업·격리 migration·복구, QA·독립 G7 Owner Go/No-Go. 상세 CIDR·비밀은 공개 GitHub에 올리지 않는다.
- 기존 `src/docker-compose.yml`의 `0.0.0.0:3000`은 운영 전용 Nginx 경로 충족 증거가 아니다. G5 격리 점검 후 G7에서만 실제 설정 변경; **운영 로그인/관리/영속 API, Prisma/DDL/migration, Nginx/Compose/.env/방화벽 변경·활성화 금지**. G0 문서 PR 시작이나 CI 성공도 운영 활성화 승인 아님.


## Issue #99 → #113 현장 수용 잔여 이관/행정 종료 경계 (2026-10-25)

- [후속 #113](https://github.com/planner77/layoutManager/issues/113)에 원 #99의 **실 DXF/CAD/GPU·UI/Worker·데이터 보호·Owner 서명 AC-99-01~04를 체크 전부 미완 상태로 보존**한다. PR #110 구현은 수용 증거를 모으는 도구만 제공하며 실제 현장 합격을 증명하지 않는다.
- 사용자의 #99 이슈 종료 지시는 **PR 구현/코드 검증 후 범위 분리 행정 종료**로 해석한다. #113이 OPEN/BLOCKED이고 현장 검증이 없다면 #99를 `completed`로 잘못 표시하거나 #96/#98 서버 운영을 ON 하지 않는다. #99를 닫는 경우 `not_planned`(잔여 필드 AC #113으로 이관) 사유와 사용자의 별도 최종 수용 의무를 반드시 남긴다.
- **절차:** P1 리뷰 해결→현재 변경 HEAD의 PR CI 전체 성공/behind 0/mergeable→Squash 병합→Main CI 시작/신규 GHCR paired publish 시작 확인→#99 잔여 이관 확인 후 행정 종료. Main CI/GHCR 상태를 감시하지 않는 경우 실행 시작과 이미지 게시 성공을 구별한다.


## Issue #99 / PR #110 — P1 private 경로 Symlink 차단·v0.40.3 재검증 게이트 (2026-10-25)

- **기존 성공과 수정 HEAD 구분:** [PR CI 40195335561](https://github.com/planner77/layoutManager/actions/runs/40195335561)는 원 HEAD `637742610b3eb25461b095edb5899494ce6dd054`의 Verify(121174841714)/Docker(121174841754) 모두 `completed/success`. 이 성공 이후 [P1 리뷰 4370918614](https://github.com/planner77/layoutManager/pull/110#discussion_r4370918614)에서 `resolve()`가 외부 Symlink→repo를 따라가지 않아 승인 사내 SHA/GPU 보고서가 Git worktree에 기록될 수 있음이 발견되었다. CI 실패와 구분해 [FailureLedger](out/FailureLedger.md)에 이력 보존.
- `src/tests/benchmark/private-acceptance-paths.ts`의 `realpathSync`로 Source 파일과 Report **기존 부모 디렉터리**의 실제 위치를 검증, Git worktree 내부로 가는 symlink·junction 차단. Report 부모는 운영자가 **미리 만든 사내 전용 디렉터리**여야 한다. 기존 파일·dangling symlink 거부, `wx/0600` 배타 생성(덮어쓰기 금지), 저장 직전 부모 실제 경로 재확인. 기존 E2E는 같은 안전 경로를 사용. `TC-P0P5-PATH-001~006` Unit 추가. 신뢰할 수 없는 사용자가 부모 디렉터리를 실행 중 변경하지 못하도록 사내 ACL 필수.
- GHCR `v0.40.2` 태그 존재를 확인했다. User의 신규 GHCR 게시 요청은 구 태그 이동/덮어쓰기 금지이므로 package+lock root `0.40.3`으로 정렬하여 Main의 조건부 App/Migrator Pair 신규 게시 후보로 준비한다. **수정 HEAD PR CI 전체 성공·미해결 리뷰 0·main 무충돌 전 병합 불가**. Main CI 시작은 GHCR digest 게시 성공이 아니다.
- 실제 DXF 3종/CAD 기준 오차·1k/10k/100k GPU·Owner SLA/수동 E2E/서명은 여전히 `NOT RUN / BLOCKED`. **운영 수용 완료로 Issue #99를 completed 종결하지 않는다.** Field AC의 계속 추적/이관 없는 행정 종결도 방지해야 한다. #96/#98 Auth/Outline 운영 기능 OFF 유지.


## Issue #99 — 실 DXF P0/P5 Evidence Gate, Owner 현장 수용 미완 (2026-10-25)

- 별도 DESIGN.md는 저장소에 없다. [Issue99](out/Issue99.md), [Architecture](out/Architecture.md), [ADR-052](out/Decisions.md), [Requirements](out/Requirements.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md)가 우선 근거다. #31 P0/P5 운영 잔여를 별도 검증한다.
- 기존 `audit:outline` schema v1 SOURCE-only/CI synthetic 1k·10k·100k는 실 CAD·GPU PASS가 아니다. 비공개 `test:outline-acceptance`는 승인 SHA + 보고서 절대 경로를 필수로 하고 repo 외부/격리 DB에서 실제 파일 한 건, 브라우저 5회 Schema v2(render mapping/selected/excluded/box latency/rAF frame/heap/WebGL)를 생성. rAF·WebGL 문자열은 GPU 사용률/VRAM이 아니며 외부 GPU 성능 수치는 Owner 현장에서 별도 측정한다.
- `npm run verify:outline-acceptance -- /private/manifest.json`는 비공개 감사+브라우저 결과의 SHA/크기·각 5회·3종/1k/10k/100k, CAD WCS/면적·1:N/N:1/Handle·BLOCK·OCS/곡선/Holes·미지원 제외, 8개 조작·외부 GPU 계측·Owner SLA를 fail-closed 판정한다. **임계값 기본값을 만들어내지 않으며** 출력은 비민감 이유 코드 `BLOCKED` 또는 `READY_FOR_OWNER_REVIEW`(합격 아님)뿐이다. 단위 TC-P0P5-001~008 추가.
- 원본 DXF/경로/레이어·Handle/로그·기기 식별자를 Git/공개 CI에 포함 금지. 실 파일 시험은 승인된 disposable DB/Storage만 허용(업로드는 DB에 행을 추가하므로 production 실행 금지). 소스·Viewer Adapter/API/Prisma/DB/Current/SHA/Version/GHCR·런타임 env 변경 없음, 초기 버전 0.40.2에서 신규 GHCR 후보 0.40.3으로 변경.
- 실도면·CAD 정답·실 GPU/Owner 수치 예산/실제 기능 수동시험 및 Owner 서명은 **NOT RUN / BLOCKED**. PR CI가 성공해도 Issue #99 AC 4개 완료나 #96/#98 운영 활성화가 아니다. Owner 검증 이후에만 Issue 종료 검토.


## Issue #96 — D1~D6 Owner 세부 정책 및 비활성 구현 (2026-10-25)

- **최신 기준:** [Issue96](out/Issue96.md) / [ADR-051](out/Decisions.md). 기존 #31 D0의 '관리자/세션/감사 세부값 미확정' 서술은 승인 이전 기록이며 다음 값이 우선한다.
- D1: 최초 Admin/복구는 .env 기반 설정 및 별도 절대 경로 Secret 파일; 단발 처리, 서버 재시작 때 계정/암호/Role 자동 덮어쓰기 금지. D2: 비밀번호 최소 8자, scrypt 로컬 credential, 최초 변경·로그인 실패 횟수 제한. D3: 절대 8h·idle 30m·동시 세션 최대 3개.
- D4: Admin만 Role/Site Grant 관리, Site/Version Scope는 명시적으로 검사하고 Admin도 전체 Site 자동 접근 없음. D5: Audit 365일 보존, 별도 권한을 가진 관리자만 조회. D6: 승인된 사내 IP 대역·방화벽·프록시 및 Owner의 평문 HTTP 잔여 위험 인지. **정확한 CIDR·보안·배포 수용은 미완**.
- 비활성 모듈만 추가: src/domain/auth.ts와 src/server/auth/{bootstrap,password,session,audit,guards}.ts 및 Unit. 새 로그인/관리자/로그·외곽선·메모 영속 API, Prisma/DDL/Migration, runtime env 전달, Docker/Compose/Nginx 변경 **금지**. .env.example은 현재 런타임에서 읽지 않는 제안값이고 true로 바꾸더라도 운영 기능이 활성화되지 않는다.
- 실 운영용 Session DB 원자 발급, 단발 복구/Secret 취급, Origin/CSRF·CIDR 검증, append-only Audit/복구, 백업→dry-run migration→restore, 실제 LAN E2E 및 별도 Owner 활성화 승인 전 Issue #96 **OPEN/BLOCKED**. DESIGN.md는 저장소에 없어 Architecture/Decisions/Issue96이 기준이다.



## Issue #97 / PR #100 — GHCR v0.40.2 릴리스 게이트 정렬 (2026-10-25)

- PR #100 기존 HEAD `195f633b0bce`의 [CI 40189428698](https://github.com/planner77/layoutManager/actions/runs/40189428698) **completed/success** (Verify/Docker 2개 Job 성공), 미해결 리뷰 0·main behind 0. 이 성공을 새 `0.40.2` 버전 정렬 HEAD의 테스트 결과로 전용 금지.
- 이전 [#93 Main CI 40184907533](https://github.com/planner77/layoutManager/actions/runs/40184907533)는 `v0.40.1` 태그와 GHCR `0.40.1`/`0.40.1-migrate` 앱·마이그레이터 쌍 게시 단계를 성공했다. 같은 버전으로 #97을 병합하면 현 `docker-publish.yml`은 기존 쌍을 감지해 Build를 건너뛴다. **기존 태그/버전 digest 이동 없이**, `src/package.json`과 `src/package-lock.json` root version을 `0.40.2`로 올려 새 쌍을 정상 릴리스할 준비를 한다.
- GHCR 게시 요청은 이미지 빌드·배포 진입점의 신규 버전화를 뜻하며 D1 #96 인증·D3 #98 API/Prisma/권한·외곽선 영속 기능을 활성화하는 승인으로 해석하지 않는다. #99 실 DXF/GPU 현장 수용 별도.
- **필수 게이트:** 신규 HEAD의 PR CI 전체 성공·리뷰 0·main 무충돌 후 `squash` merge. Main push가 GHCR app+migrator 후보 build→digest 검증→`:0.40.2/-migrate` 및 `:latest/-migrate` 승격, Main CI 시작. 그 전 게시 완료/릴리스 PASS 주장 금지. CI 모니터링은 사용자 요청에 따라 생략.


## Issue #97 / P4-D2 — 불변 DXF Canonical·Translate/Rotate 서버 검증 선행 구현 (2026-10-25)

- [ADR-050](out/Decisions.md), [Issue97](out/Issue97.md), [Architecture](out/Architecture.md), [Requirements](out/Requirements.md), [TestPlan](out/TestPlan.md) 근거. 별도 `DESIGN.md` 없음; Architecture/Decisions가 설계 기준. #31 D0의 Owner 7정책 중 P4-POL-04만 서버 전용 **순수 검증 모듈**로 구현한다.
- `src/server/outline/transform-attestation.ts`는 서버 소유 Version/SHA/immutable DXF bytes를 기존 `attestation.ts`에서 검사하고 unique root stable Handle·INSUNITS·WCS XY CONVEX/PRECISE baseGeometry를 tolerance 0.02로 재계산한다. 입력 JSON v1/v2 canonical 호환, 편집 확장은 `baseGeometry`(untrusted), 최대 64 `transformOperations`(Translate/Rotate/pivot, CCW·좌측 합성), `geometry`(untrusted final), 선택적 검사용 affine matrix이며 server effectiveGeometry만 반환한다. Unsupported OCS/partial BLOCK·중복 Handle/중첩 child instancePath·raw affine/scale/shear/reflect/Z/nonfinite/overflow/위조 좌표는 거부.
- **안전 경계:** #96 D1 로컬 인증·Scope/Audit와 #98 D3 CadOutline CAS/DB CRUD는 여전히 BLOCKED. 실제 Storage fetch, Admin, 서버 영속 GET·Write Route, Prisma migration, 배포·운영 활성화 없음. Browser GeneratedDocument 및 #56 E6 `objects[]`가 서버 영속 권한을 부여하지 않는다. #99 실 DXF 3종/GPU 현장 수용 별도. 원본 DXF bytes/SHA/Version/Current/Viewer Adapter 변동 없음. 버전 0.40.1 유지.
- 작성 Unit TC-P4-D2-001~009 및 모든 Typecheck/Lint/Vitest/Build/E2E/Docker/실 CAD 상태는 별도 증거 전 **NOT RUN**. GitHub PR CI 시작을 PASS나 D3 운영 승인으로 해석 금지.

## Issue #31 P4 D0 Owner 승인 계약 (2026-10-25 / 문서 전용)

- **최신 적용 설계:** [Issue31](out/Issue31.md), [ADR-048/049](out/Decisions.md), [Database](out/Database.md), [Architecture](out/Architecture.md), [Requirements](out/Requirements.md), [TestPlan](out/TestPlan.md). **D0 정책 확정은 서버 구현/배포 승인이 아니다.** 아래보다 오래된 OIDC 추천, Scope 미확정 서술은 당시 기록만 유지한다.
- 사내 LAN 여러 PC에서 서버 IP **HTTP**로 접근(외부 인터넷 공개망 인바운드 제한). HTTPS/TLS/인증서, OIDC/SSO/MFA는 사용자 선택상 비범위. 로컬 사용자 계정·서버 세션은 담당자별 **권한·변경 감사**를 위한 경량 기능이다. 평문 HTTP의 비밀번호/세션 도청·변조 위험과 네트워크 허용 대역/수용 주체 미확정은 문서화; HTTP를 TLS만큼 안전하다고 주장 금지.
- Owner 확정 7개: ①앱 로컬 계정/세션 ②전체 앱 공통 `OutlineType` ③담당 Site/Version Scope 내 Editor 공동 외곽선 편집(메모에는 자동 적용 금지) ④서버 Canonical + 허용 Translate/Rotate 검증 후 영속화 ⑤외곽선 논리 삭제/감사 보존 ⑥외곽선 Show/Hide 사용자 세션별 ⑦삭제된 객체에 연결된 메모는 마지막 정상 WCS 유지+`BROKEN_ANCHOR`/참조 해제.
- D1 공통 identity/Role/Scope/Audit 기반은 #60/#65/#83에서 재사용. D2 server-owned Source SHA/StableHandle/WCS + Transform; D3 `CadOutline` CAS(409)/soft delete/atomic audit·Memo reconcile; 뒤에 #65/#71/#73, #83/#84 연계. 현재 #49/#54/#55/#56의 브라우저 편집·Undo/Redo/JSON은 영속 인증 기능 아님.
- 미확정: 최초 Admin·계정 복구, 세션 만료·관리, 권한 부여 운영, Audit 보존·조회, Version 삭제/FK/복원·물리 삭제, Show/Hide 새로고침·탭간 수명, 메모 Editor 권한, HTTP 상세 허용망/잔여 위험 수용, 실도면 P0/P5 기준. 결정하지 않은 세부값을 편의상 코드에서 허용하지 말 것.
- **차단:** D0 범위는 Markdown만. 새 로그인/외곽선/메모/관리자·로그 서버 영속 GET/Write API, DB Prisma schema/migration, Docker/Runtime 변경과 실제 운영 활성화는 각각 필요한 정책/보안/무결성/감사/백업·복구 검증 및 별도 승인 전 금지. 원본 DXF bytes/SHA/Current, Viewer Adapter, GHCR 동작을 변경하지 않는다. 미실행 CI나 현장시험을 PASS라 쓰지 않는다.


## Issue #93 / v0.40.1 — 도면 목록 기본 Current, 이전 버전 표시·검색 복원 (2026-10-25)

- **#45 / ADR-034 후속 UI 계약(ADR-034-R1):** 홈페이지 `/` 최초 진입·초기화는 명시 Current 도면만 표시. 단일 `현재 버전만 표시` 버튼은 기본 ON이고, OFF에서 과거 버전과 Current 미지정 층의 도면도 **같은 도면 목록**에서 검색/열람/Current 지정 가능하다. #16에 따라 중복 Current 드롭다운은 복원하지 않는다.
- `drawingListParams`는 `listQuery`를 먼저 검증한 뒤 `versions=all` (홈 UI 전용)을 기존 서버 `current=''` 전체 조회로 매핑; 누락/`current=true`는 `current=true`. 과거 홈 `?current=false`는 전체 이력 모드로 해석하되 `/api/cad-files?current=false`는 **이전 버전만**이라는 기존 API 계약을 유지한다. `versions` 중복/잘못된 값, `versions=all&current=true` 충돌은 INVALID_QUERY.
- 두 개의 독립 GET form(검색/토글)으로 중첩 form을 피한다. 토글은 `aria-pressed` 및 시각 상태를 표시하고 파일명·설명·5단계 위치·형식·pageSize는 보존, page를 1로 초기화한다. 검색·페이지 이동·새로고침·뒤로가기에서도 명시 `versions=all`을 유지한다. 결과 total/pages/빈 상태는 서버 필터와 같아야 한다.
- DB/Version/SHA/Current 최대 1개/원본·Viewer/API/인증 정책 불변. 회귀 Unit `TC-LIST-093-001~003`, E2E `TC-LIST-093-E2E-001/002` 및 기존 Workflow/Upload. 연결 환경은 GitHub 원격 파일 수정이며 로컬 node_modules/GPU/Docker **실행하지 않음(NOT RUN)**; PR CI 시작은 PASS가 아니다.
- 기준 문서: [Issue93](out/Issue93.md), [Requirements](out/Requirements.md), [Architecture](out/Architecture.md), [ADR-034-R1](out/Decisions.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). 별도 `DESIGN.md`가 없으므로 Architecture/Decisions가 설계 기준.


## Issue #54 / PR #92 — #76 main 통합 및 검증 기록 (2026-10-25)

- 수정된 #54 HEAD `6845c4b4`: [PR CI 40181171710](https://github.com/planner77/layoutManager/actions/runs/40181171710) **completed/success**, P1 thread resolved. #76 [main 14111b45](https://github.com/planner77/layoutManager/commit/14111b45a36907245342751d9d1a139b5215474d)는 문서·PR CI 비차단 read-only audit만 변경하며 Viewer/DB/GHCR 런타임 변경 없음. #54와 #76 문서 및 CI 작업을 모두 보존하고 main을 통합한다. 병합 HEAD의 새 PR CI 성공은 별도 확인해야 한다.

## Issue #76 — Squash Merge 관리자 설정·PR CI 읽기 전용 진단 (2026-10-25)

- #74 Main 실행명 fallback 구현과 저장소 영구 설정을 분리한다. 2026-10-25 REST GET에서는 `allow_squash_merge=true`, `squash_merge_commit_title=COMMIT_OR_PR_TITLE`, `squash_merge_commit_message=COMMIT_MESSAGES`로 확인되어 **#76 관리자 적용은 미완료**다.
- PR CI Verify의 새 read-only audit는 정확히 `true/PR_TITLE/BLANK`만 PASS라 표시하고 불일치 시 **NOT APPLIED**, API 장애 시 **NOT VERIFIED**로 경고한다. 경고가 non-blocking인 것은 앱 CI 보호를 위한 것이며 설정 수용 PASS를 뜻하지 않는다. 관리자 UI 변경 및 실제 새 Main squash subject/body/run-name 확인이 완료 조건이다.
- 상세 [Issue76](out/Issue76.md), [Operation](out/Operation.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md), [ADR-041](out/Decisions.md). `DESIGN.md` 부재로 [Architecture](out/Architecture.md) 대체. Workflow/GHCR scope와 `src/package.json` 버전, DB/API/Viewer는 불변.

## Issue #54 / PR #92 — CI 성공 후 P1 카메라 변환 경계 보완 (2026-10-25)

- [CI #40177837419](https://github.com/planner77/layoutManager/actions/runs/40177837419): **수정 전 HEAD** `2f57a642197f7d22d457ad65a70eda76b8ba7df4`의 Verify(121122289273)·Docker(121122289396) 모두 SUCCESS. 이 성공을 새로운 리뷰 수정 HEAD의 테스트 증거로 재사용하지 않는다.
- [P1 리뷰 #4370223581](https://github.com/planner77/layoutManager/pull/92#discussion_r4370223581): GENERATED 경계 `pointerdown` 뒤 5px 미만에서 wheel·Resize가 일어나면 `cancelGeneratedDrag`의 `moving=false` 검사가 후보를 방치, 새 Camera WCS에서 잘못된 translate가 commit될 수 있다. 수정: **모든 진행 중 pointer/box/ghost를 카메라 변경 전에 취소**하고 `TC-E4-E2E-004` wheel·Resize·후속 move/up History0/JSON 불변 회귀 추가.
- CI 실패가 아닌 **CI 성공 후 코드 리뷰 결함**으로 [FailureLedger](out/FailureLedger.md) 구분. 수정 HEAD CI 성공·미해결 리뷰 0·main 정렬 전에는 merge/Issue 종료/GHCR 게시 불가. 실 CAD/GPU/native fullscreen 별도 검증.


## Issue #54 / E4 — 생성 개체 WCS 수치·경계 드래그 이동 (2026-10-25)

- v0.40.0: DXF+three-dxf-viewer의 현재 GENERATED 단일/다중 선택을 `Translate(ids,dx,dy)` E2 원자 Command로 이동한다. UI ΔX/ΔY는 **WCS drawing unit**이며 `$INSUNITS` 0/누락은 '단위 미상' 표시; mm/inch와 화면 픽셀을 혼동하지 않는다. 선택에 SOURCE/혼합/중복/stale/숨김이 하나라도 있으면 전체 거부.
- Generated 전용 모드에서 **이미 선택된** 외곽선 경계(홀 포함)를 modifier 없이 5px 이상 움직인 때만 Ghost 드래그; 이외는 기존 Box/Click/Space Pan. Ghost는 Scene-only, Document/Tree/JSON/History는 pointerup 최종 재검증 뒤 한 번만 commit한다. ESC·pointercancel/lostcapture·blur·Space·two-finger·Zoom/Fit/Resize·선택/모드·Viewer 변경 시 즉시 취소/GPU 해제.
- E2 Immutable baseline+affine으로 Polygon/MultiPolygon/Hole 및 bounds/hit/Scene/Tree/export를 동기 반영하고 Undo/Redo 1단계. Original Source/bytes/SHA/Layer/Current, Worker/DB/API/#31 P4는 변경 금지. [Issue54](out/Issue54.md), [ADR-047](out/Decisions.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). 현재 로컬 Typecheck/Lint/Unit/E2E/실도면/native Fullscreen **NOT RUN**; CI 트리거와 성공 구분.

## Issue #53 / E3 — 생성 개체 선택 삭제·Undo/Redo·Tree 일관성 (2026-10-25)

- v0.39.0: `GeneratedDocument.execute({type:'Delete',ids})`만 객체 삭제에 사용한다. #43 기존 `deleteSavedOutline/discardLegacy`는 Undo/Redo와 원자성 우회 경로이므로 제거한다. ToolBar·Tree 행·Canvas hit 우클릭·Canvas 초점 Delete/Backspace는 모두 동일한 범위·선택·UUID·명령 대상 재검증과 개수/명칭 확인창을 거친다. 취소=무변경.
- DXF+three-dxf-viewer의 브라우저 GENERATED만 삭제 가능하다. SOURCE 및 혼합, 중복/누락·숨김, 버전/SHA 불일치, 모드 변경은 전체 거부. 외곽선 **생성 OFF**여도 독립 Generated 편집/선택 모드 진입 후 삭제 가능. 입력·검색창·Tree/버튼 focus에서는 Delete/Backspace를 인터셉트하지 않고 ESC는 삭제 확인창→컨텍스트→staged edit→일반 선택/전체화면 순서.
- SelectionController window capture ESC는 확인 Dialog/Context overlay가 존재하면 선택을 지우지 않아야 한다. 대상 명칭도 확인 시점 snapshot과 비교하며 숨김 Tree 행 삭제 버튼은 비활성화한다. 작성된 TC-E3-UNIT-004/E2E-002/003은 실제 실행 전 PASS가 아니다.
- 삭제 Scene 그룹의 geometry/material을 dispose하며 E2 기존 Document→Selection/Tree/Export projection, Undo/Redo UUID·Geometry·Transform·metadata·visibility 복원을 재사용한다. Source/Preview/원본 bytes/SHA/Layer/Version/Current·서버 API/DB 불변. 문서 [Issue53](out/Issue53.md), [ADR-046](out/Decisions.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). 현재 원격 컨텍스트 Typecheck/Lint/Unit/Playwright/GPU **NOT RUN**; PR CI 트리거와 성공을 혼동하지 않는다.


## #67 / main 정렬 — #52 v0.38.0 반영, #67 v0.38.1 (2026-10-25)

- 최신 main의 Issue #52 E2 생성 객체 편집·Undo/Redo 변경을 보존하며 #67 웹 Docker Runtime 레이어 최적화만 병합한다. #52의 ADR-044와 충돌하지 않도록 #67 웹 패키징 설계는 ADR-045로 재지정한다. PR CI의 최신 통합 HEAD 검증 후 병합·GHCR 후보 Pair 게시. 이전 #67 0.37.2는 **미게시 작업 브랜치 버전**이었다.


### Issue #67 / PR #80 — Python audit syntax 실패 및 CI early gate (2026-10-25)

- P1 리뷰 수정 HEAD `95cd745`의 [PR CI 40171968883](https://github.com/planner77/layoutManager/actions/runs/40171968883) Docker Job `121104610668` FAIL: Python audit `f-string`의 종료 문자 누락. **이미지 mismatch 아님**, 실제 layer hash/Compose 검증은 SKIPPED, Verify E2E 상태는 확인 당시 in_progress였다.
- 스크립트 구문 보완과 Docker build 이전 `py_compile` + Synthetic Unit 필수 실행, dedup transition positive saving vs already dedup equal-size PASS 검사 모두 유지. 최초 성공 HEAD/실패 HEAD 이력 [FailureLedger](out/FailureLedger.md), 새 HEAD 성공 검증 전 merge 및 게시 금지.


## Issue #67 / PR #80 — 성공 CI 후 P1 공통 Docker 검사 개선 (2026-10-25)

- [PR CI 40170910369](https://github.com/planner77/layoutManager/actions/runs/40170910369) HEAD `6a35660`의 Verify(121101364113)·Docker(121101364198) jobs는 모두 SUCCESS. [P1 review 4369963432](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432)에서 이후 `main`이 이미 최적화된 상태이면 unrelated PR의 baseline 중복 0개/size delta 0을 강제 실패시키는 CI 회귀가 발견됐다.
- 해결: 실제 baseline이 중복 레이어를 포함할 때에만 SHA/중복 raw bytes와 positive saving 강제, 정상 deduplicated baseline이면 no-saving도 허용. 두 경우 **optimized no-dup/native .node/최종 package SHA 일치, Docker runtime/Compose·API, 브라우저 E2E/Legacy**는 전부 검증한다. Python positive/negative fixture 추가. 새 HEAD PR CI PASS 전 merge/GHCR success 주장 금지, 검증 이력은 [FailureLedger](out/FailureLedger.md).


## Issue #67 — 웹 Standalone 중복 SQLite 패키지 레이어 안전 제거 (2026-10-25 / v0.38.1)

- 웹 Docker `runtime`에서 `.next/standalone` 다음에 별도 `node_modules/better-sqlite3` COPY를 **제거**한다. `next.config.ts`의 `outputFileTracingIncludes`(native SQLite/Prisma)와 `serverExternalPackages`는 유지한다. 이미지 빌드 시 `better_sqlite3.node` 존재 검사 및 `require('better-sqlite3')` SQLite `:memory:` smoke 실패면 이미지 빌드도 실패한다.
- PR CI: 같은 HEAD 소스·Node22.14.0·linux/amd64의 *PR base Dockerfile*과 최종 `runtime`을 동시에 빌드. `audit_standalone_layers.py`에서 실제 Docker save layer TAR file SHA256/기존 중복/new 중복 없음과 최종 package identity, `docker inspect .Size`/`history`/`du`로 비압축 bytes/MiB/%를 검사한다. Asset 원본 Nanum TTF/파생 typeface/LibreDWG JS/WASM raw·gzip proxy 및 server traced top20도 출력한다. **압축 GHCR OCI layer 크기와 gzip TAR proxy를 혼동 금지**.
- 새 Docker Compose API smoke는 disposable `/data`에서 master→DXF 등록→재migration/restart→Current/content read→delete/404 및 health를 검증한다. 기존 Typecheck/Lint/Unit/Playwright·Legacy/두 DXF 뷰어·DWG WASM·font, UID10001, Prisma/Compose, S3/local, DB schema/보안 경계를 그대로 유지. 실 운영 데이터·GHCR immutable digest/압축 OCI 수치 및 실제 렌더러·S3 현장 수용은 별도. `CI START`는 `PASS`가 아니다.
- `DESIGN.md` 부재 → `out/Architecture.md`/ADR-045 설계 기준. 기능/추적/시험/배포: [Issue67](out/Issue67.md), [Issue28](out/Issue28.md), [Operation](out/Operation.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). 실패 시 [FailureLedger](out/FailureLedger.md)를 기존 Run/Job/HEAD/조치와 함께 누적 기록한다.


## Issue #52 / PR #79 — 두 번째 CI Unit 실패 수정 및 QA 결과 (2026-10-25)

- 두 번째 Verify의 6 Unit 실패 원인은 `generated-document.test.ts` fixture helper geometry 공유와 deep-copy 검증 변이로 인한 테스트 간 오염이었다. 호출별 deep clone/fresh fixture 검증으로 교정했고 제품의 Ring closure 검사/validator는 유지했다.
- Issue #52를 재개하거나 릴리스할 때 실제 로컬 검증·대행 역할·미검증 범위는 [TestReport](out/TestReport.md), 두 CI 실패 원인은 [FailureLedger](out/FailureLedger.md), AC는 [Issue52](out/Issue52.md)를 확인한다. 새 PR CI 성공 여부는 별도 확인한다.

## Issue #52 / PR #79 — TypeScript 실패와 무결성 리뷰 보완 (2026-10-25)

- 최초 [PR CI 40168296155](https://github.com/planner77/layoutManager/actions/runs/40168296155) HEAD `40aba11f`: E2E 테스트 `Event.key/ctrlKey` TS2339 2건으로 Typecheck FAIL, Lint/Unit/Build/E2E/Legacy SKIPPED, Docker 별도 SUCCESS. `querySelector<HTMLInputElement>`로 typecheck 오류 보완.
- 별도 P2 리뷰 3건: 고 WCS 원점에서 먼 Polygon의 면적 상쇄→상대좌표, 삭제 복구 capacity 예약 초과→호환불가 Undo 이력 무효화, stale staged 선택 우회→현재 선택 비교/모드 변경 취소. TC-E2-UNIT-006~008 추가, 원본 Source/DB/API/P4 불변. 자세한 실패·P2 원장 [FailureLedger](out/FailureLedger.md)/[Issue52](out/Issue52.md). 새 HEAD 시험 전 PASS 금지.


## Issue #52 / E2 — 생성 개체 Document·Command·Undo/Redo 기반 (2026-10-25)

- v0.38.0: E1 (#51) UUID 기반 Generated Ref를 재사용하며 브라우저 메모리의 `GeneratedDocument`를 유일한 생성 개체 상태로 사용한다. 기존 Scene `savedGroup`, #43 Tree, v1/v2 임시 JSON 내보내기는 Document 투영이며 원본 Source/Worker Preview는 **편집 불가·Document 미포함**.
- `executeGeneratedCommand` 및 stage/commit/cancel, `undoGeneratedEdit/redoGeneratedEdit`를 Manager/Adapter에서 노출. 편집 대상은 같은 Version·SHA의 전부 GENERATED·유효 UUID·선택 목록과 정확히 일치해야 하고 변환 전/후 WCS 좌표를 전체 검증한다. 한 명령=한 이력, 실패는 전체 롤백. HISTORY_MAX=100, 예상 이력 메모리 16MiB, polygon 총 정점 100k; #53~#55 실제 Delete/Move/Rotate UI는 **별개**.
- Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y는 Viewer 안에서만 활성화하고 입력/텍스트 편집과 충돌하지 않는다. Zoom/Pan/트리 표시·숨김/생성 모드 전환은 이력에 기록하지 않는다. 재로드/Version/Renderer/Dispose 시 모두 폐기. P4 인증·권한 승인 전 서버 API/DB/Attestation 우회 금지.
- 근거와 테스트 상태: [Issue52](out/Issue52.md), [ADR-044](out/Decisions.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). 원격 작업 환경에서 작성된 테스트는 로컬 NOT RUN이며 CI 성공/실 CAD 사용 가능 판정과 구분한다.


## Issue #66 / PR #78 — 최초 CI 실패 원인·수정 지침 (2026-10-25)

- [Run 40167191799](https://github.com/planner77/layoutManager/actions/runs/40167191799) / HEAD `45389a4661d`: Verify Job `121090554088`의 `TC-IMAGE-003` Unit **1 FAIL(187 PASS)**, 기존 migrator `CMD ["node", "scripts/run.mjs", "deploy"]` 고정 기대값과 #66 전용 `CMD ["./node_modules/.bin/tsx", "scripts/deploy.ts"]` 불일치. 이 변경은 로컬 수동 값이 아니라 실제 Docker CI가 migration→backfill→health를 성공시킨 합법적 실행 계약이다.
- Docker Job `121090554257` **SUCCESS**: 동일 소스/amd64 비압축 migrator **1,336,572,597→578,862,325 bytes, 56.69% 절감**, gzip tar proxy는 **462,720,650→212,574,989 bytes**, GHCR OCI/다운로드량은 아님. read-only 및 invalid SQL expected-failure, Compose 신규/멱등 migration 및 health 200 성공. Verify의 Benchmark/Build/E2E/Legacy는 **SKIPPED**.
- 보완: 기존 `TC-IMAGE-003`은 migrator **stage**·최소 의존성/실행기·app runtime 분리 및 Compose fail-closed를 검사하도록 개정하고 `TC-IMG66-010`은 migration 완료 확인 뒤 백필 순서를 고정. 테스트를 제거/건너뛰지 않고 실행 코드·Schema/버전·GHCR publisher는 불변. [FailureLedger](out/FailureLedger.md), [Issue66](out/Issue66.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). 최신 HEAD PR CI 완료 전 PASS 주장 금지.

## Issue #66 — 독립 migrator 실행 의존성·GHCR OCI 계측 (2026-10-25)

- 분리된 `migrator`는 더 이상 `dependencies/node_modules` 전체를 복사하지 않는다. `migrator-dependencies`는 `src/package-lock.json`의 고정 버전으로 최소 런타임 manifest 생성 → `npm prune --omit=dev --offline --legacy-peer-deps` → 필수 Prisma CLI/tsx/native 및 불필요 Next/React/test 모듈 부재 검증을 수행한다. 웹 `runtime`/builder 패키징은 그대로다.
- Entrypoint는 `tsx scripts/deploy.ts`로 Prisma `migrate deploy` → 비밀번호 backfill의 기존 실행 순서를 보존. 최종 이미지에는 generated client, Prisma schema/migrations/config, 필요한 source module만 포함하며 UID 10001, /data, CA/OpenSSL, Compose 완료 성공 의존, GHCR digest/tag 쌍 계약 유지. 앱/DB schema는 변경하지 않는다.
- PR CI에서 **PR base migrator**와 현재 migrator의 같은 Node22.14/linux-amd64 비압축 크기를 비교한다. 과거 #28 웹 2.05GB를 migrator 기준으로 쓰지 않고, 30% 절감은 soft target. Main 릴리스는 실제 공개 version app+migrator의 OCI compressed layers 및 공유 digest를 별도로 계측한다. CI 미실행은 성공 아님.
- 버전 `0.37.1`. 근거·AC/테스트/배포·복구: [Issue66](out/Issue66.md), [Architecture](out/Architecture.md), [Operation](out/Operation.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md), [ADR-043](out/Decisions.md).
## Issue #51 / PR #77 — Unit API 계약 실패 및 미세 WCS P2 (2026-10-25)

- 첫 [PR CI 40164835838](https://github.com/planner77/layoutManager/actions/runs/40164835838): `TC-U6-UNIT-003` 실패(`focusSavedOutline` 기본 false 인수로 이전 단일 호출 계약 불일치), Unit 186 PASS/1 FAIL; TS/Lint PASS, Benchmark/Build/E2E/Legacy SKIPPED, Docker Job PASS. 기본 `selectSavedOutline(id)` 호출은 유지하고 E1 additive에서만 `(id,true)` 사용한다.
- [P2 #4369760096](https://github.com/planner77/layoutManager/pull/77#discussion_r4369760096)는 CI 실패 별개: 0.001 WCS crossing window에서 고정 orientation product epsilon에 의한 false negative. orientation sign 직접 비교와 상대적 round-off bound, TC-E1-UNIT-004 적용. 증거·조치 [FailureLedger](out/FailureLedger.md), [Issue51](out/Issue51.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). 변경 HEAD CI 성공 전 PASS 주장 금지.


## Issue #51 / E1 — 통합 Canvas 선택·편집 경계 (2026-10-25)

- v0.37.0: SOURCE는 #31 RenderCoverage에 의해 검증된 DXF Entity, GENERATED는 브라우저 확정 Polygon/MultiPolygon Overlay. SelectionController 하나로 Pan/U3 Source 선택/일반 통합/생성 전용 네 모드를 처리한다. 동일 Version/SHA/Origin을 갖는 Ref와 generated UUIDv4를 사용하며 기존 local-N JSON 스키마를 보존한다.
- 편집 가능 표시는 *권한/명령 실행이 아니다*: SOURCE 및 혼합은 전체 거부, 생성만 향후 E2~E5 편집 대상으로 판정. 트리 다중 선택·레이어/Overlay 숨김·Zoom/ESC/Space·Reset과 동기화한다. #31 P4/#65 승인 전 서버 쓰기/관리 API 절대 구현 금지. [Issue51](out/Issue51.md), [ADR-042](out/Decisions.md), Unit/E2E(TestPlan/Report) 참조. 테스트 미실행·CI 시작은 PASS로 간주하지 않는다.


## Issue #74 — MAIN CI 실행명에 Squash Commit 본문 유입 방지 (2026-10-25)

- [MAIN #34](https://github.com/planner77/layoutManager/actions/runs/40158498214)는 `MAIN CI | #68 | 요약` 정상; [#35](https://github.com/planner77/layoutManager/actions/runs/40159667229)·[#36](https://github.com/planner77/layoutManager/actions/runs/40162889687)은 긴 squash commit body 전체가 `github.event.head_commit.message`로 유입되었다.
- **정상 경로:** PR 제목 `#<Issue> | 간략한 설명`(가급적 80자 이내), squash commit **제목 동일·본문 비움**. API 병합은 `commit_title`을 명시하고 `commit_message: ""`을 전달한다. PR 설명/검증 증거는 PR/이슈/FailureLedger에 기록한다.
- **저장소 관리자 설정 필요:** GitHub Settings → General → Pull Requests → Allow squash merging → Default commit message → **Pull request title** (REST: `squash_merge_commit_title=PR_TITLE`, `squash_merge_commit_message=BLANK`). 2026-10-25 조회 당시 설정은 `COMMIT_OR_PR_TITLE / COMMIT_MESSAGES`; 바뀌었다고 주장할 수 없다.
- **방어 처리:** main push에 개행이 있는 commit message가 들어오면 긴 body 대신 `MAIN CI | SUBJECT-ONLY-REQUIRED | run N`을 표시한다. 이 경고명에서는 Issue를 추측하지 않는다. 한 줄 정상 commit은 기존 `MAIN CI | #Issue | 설명`, tag는 `RELEASE` 규약 유지. 기존 Actions 실행명 변경 불가. 상세 [Issue74](out/Issue74.md), [Operation](out/Operation.md), [TestPlan](out/TestPlan.md) 참조.

## Issue #43 / PR #72 — P2 키보드 가시성·CI 게이트 및 잔여 분리 (2026-10-25)

- 기존 [CI Run 40161078593](https://github.com/planner77/layoutManager/actions/runs/40161078593), HEAD `5cd223cc2837fc5772154fd67138680263f159e4`: Verify(Typecheck/Lint/Unit/E2E/Legacy)/Docker jobs 모두 SUCCESS. 후속 코드 변경이 있으면 동일 CI 성공으로 대체하지 않는다.
- [P2 #4369618943](https://github.com/planner77/layoutManager/pull/72#discussion_r4369618943): 320px/20dvh Tree의 키보드 선택 항목이 화면 밖인데 `preventScroll`이 자동 스크롤을 막는 문제. Tree viewport만 최소 scrollTop 조정, End/Home E2E 보강, Canvas/page scroll 비변경. PR 리뷰에 답변·resolve 후 최신 HEAD CI를 검증해야 병합 가능.
- U6 Browser temporary Overlay 부분과 실제 Admin/영속 트리 AC를 구분한다. 남은 AC-U6-01/06은 [후속 #73](https://github.com/planner77/layoutManager/issues/73), 선행 #65/#71/#31 P4의 보안 승인 전 운영 구현 불가. [FailureLedger](out/FailureLedger.md), [Issue43](out/Issue43.md), TestPlan/Report 참조.


## Issue #43 U6 — 외곽선 트리·브라우저 Overlay (2026-10-25)

- v0.36.0: 우측 Dock/상단 외곽선 목록 토글, 업무 타입 ID 그룹·미분류 legacy, WCS Bounds 선택/별도 Overlay 강조, 개별/그룹 show/hide, 키보드 트리 탐색, 320px 표시. 왼쪽 CAD 레이어 및 외곽선 생성 ON/OFF와 독립이며 도구 OFF에도 목록·Overlay 남는다.
- #40 계약 유지: **개별 삭제는 외곽선 생성 ON에서만** 가능. 임시 결과/Visibility/선택은 브라우저 세션에만 존재, reload/Version/Renderer 전환 시 폐기. v1 JSON 구조 유지. 실제 관리자 타입 카탈로그 #65 미구현이므로 현 Viewer의 기본 트리는 legacy만 가능(시험용 타입 2개는 Unit fixture).
- #31 P4/#65 승인 전 Server GET/쓰기, DB/Migration, Admin/RBAC/영속 복원 절대 구현/활성화 금지. 로컬 시험 NOT RUN, PR CI 통과 주장 금지. 상세 [Issue43](out/Issue43.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md).


## Issue #68 — GitHub Actions 실행명 표준 규약 (2026-10-25)

- 모든 신규 PR 제목과 main squash commit **첫 줄**은 `#<Issue번호> | 간략한 설명`을 사용한다. PR 번호를 Issue 번호로 혼동하지 않는다. 실제 연결 이슈가 없으면 `NO-ISSUE | 간략한 설명`을 사용한다. 기존 비정형 제목은 `ISSUE-UNKNOWN` 표시 후 수정한다.
- Actions 목록의 실행명은 자동 PR `PR CI | #번호 | 설명`, main push `MAIN CI | #번호 | 설명`, tag push `RELEASE | NO-ISSUE | 버전 GHCR 이미지 게시`; 수동 PR CI에는 `issue_ref`/`run_description` 입력을 쓴다.
- **PR #69 게시 제외 정책:** `main` push로 변경된 전체 파일이 Markdown 또는 `.github/workflows/*.yml|yaml`인 경우 scope CI만 수행하고 GHCR 빌드/게시 Job을 건너뛴다. 실소스/런타임 변경이나 tag push는 기존 paired GHCR 게시 심사를 유지한다. main diff 기준 SHA가 유효하지 않으면 의도치 않은 게시 방지를 위해 CI를 실패 처리한다.
- `run-name`은 CI Job보다 먼저 결정된다. 이슈 검색 Step·PR number를 사용한 Issue 위조·이전 Run 이름 변경은 불가. **Workflow 표시명은 성공 상태/GHCR 게시를 보장하지 않는다.** 실행 상태는 Run/Job과 Digest로 검증한다. 규칙·예외·테스트 [Issue68](out/Issue68.md), [Operation](out/Operation.md), [ADR-038](out/Decisions.md).


## Issue #42 / PR #70 — 첫 PR CI E2E 실패와 반복 선택 테스트 보완 (2026-10-25)

- [실패 CI 40157734271](https://github.com/planner77/layoutManager/actions/runs/40157734271): Lint·Type·Unit/Bench·Production Build/Docker PASS, Chromium E2E **57 PASS/1 FAIL**, Legacy migration SKIPPED. 실패는 `TC-OUT-E2E-001`의 두 번째 Canvas drag가 **offscreen y=-58px**에서 시작해 `선택 0개`로 남은 것. 실제 trace는 U5 확장 도구 사용 후 NORMAL 페이지 scroll → canvas top -63px를 보여준다.
- [test `a5d9f843`](https://github.com/planner77/layoutManager/commit/a5d9f8430e06fe3b223dc97157c917ac6e793394): E2E에서 Canvas 영역 선택 **매번** `scrollIntoViewIfNeeded` → `toBeInViewport(ratio:1)` → 실제 drag 후 `선택 1개` assertion. 기존 Geometry/Worker/영구 저장 게이트 변경 없음. [FailureLedger](out/FailureLedger.md), [Issue42](out/Issue42.md), TestReport/Plan 참조. 수정 후 새 CI 성공 전 PASS 주장 금지.


## Issue #42 U5 — 타입 지정 메타데이터 안전 선행 개발 (2026-10-25)

- v0.35.0 기능 브랜치: `src/domain/outline-assignment.ts`에 Verified Scope Catalogue 입력 계약·업무 타입/이름 로컬 검증, `outline-draft.ts`에 schemaVersion 1 유지 + type-aware v2 JSON을 작성. Viewer/Adapter에는 분리된 `outlineTypeId/outlineTypeName/name` 메타데이터 경로와 잠금 UI를 연결.
- **#65는 OPEN/BLOCKED**: 인증·RBAC·Scope·Audit 및 #31 P4 승인 전에는 실제 서버 타입 목록/쓰기 API·DB·영속 저장을 만들지 않는다. `/lab/outline-types`의 임시 타입은 Viewer's real CAD type selection에 주입 금지. 타입 지정 버튼은 현재 disabled이며, 과거 U3 미분류 임시 확정/v1 JSON만 기존 방식으로 동작한다.
- 근거·잔여 및 테스트 추적: [Issue42](out/Issue42.md), TestPlan/Report. Unit/E2E 코드 작성과 성공은 별개이며, PR CI는 시작 여부·결과를 분리해 기록한다.


## Issue #41 / PR #64 — CI 성공·병합·U4 영속 AC 이관 (2026-10-25)

- [PR CI #40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531), 검증 HEAD `e2f0a64d45f601420a2bc38b99531c748269f61a`는 **SUCCESS**: TypeScript/ESLint/Unit·Integration/DXF Benchmark/Production Build/Chromium E2E/Legacy Migration E2E 및 독립 Docker Runtime Job 모두 성공. 이전 [실패 #40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566)는 실패 원장에 보존한다.
- 미해결 P2 리뷰 1건은 답변·해결됐고 최종 0건, 충돌 없음/behind 0 확인 후 [PR #64](https://github.com/planner77/layoutManager/pull/64)를 **squash merge `7da613d1`**로 병합. `main` push가 [Build and publish #40155833554](https://github.com/planner77/layoutManager/actions/runs/40155833554)를 시작했으나 GHCR 게시 완료·Main CI 성공은 미확인이다.
- **중요:** 사용자의 이슈 종료 요청에 따라 원래 #41은 **범위 분할 / not_planned 종료**했지만, 실제 관리자 영속 등록·RBAC/Scope/Audit·DB API·FK 등의 미완 AC-U4-01~04는 후속 [#65](https://github.com/planner77/layoutManager/issues/65)로 이관했다. #31 P4 Owner 보안 정책 승인 전 영속 저장 구현/활성화 금지. #41의 브라우저 시안 CI 성공을 실제 Admin CRUD 완료로 해석하지 않는다.
- 이 기록은 릴리스 완료가 아니라 **Main CI/GHCR 작업 시작 증거**이며, CI 모니터링은 요청 범위 밖이다. [FailureLedger](out/FailureLedger.md), [Issue41](out/Issue41.md), [TestReport](out/TestReport.md).


## Issue #41 / PR #64 — E2E Strict Locator 실패·HTTP UUID 리뷰 대응 (2026-10-25)

- [PR CI 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566), 원본 HEAD `d548df2`: TypeScript·Lint·Unit/Integration·Synthetic Benchmark·Production Build **PASS**, Chromium E2E **55 PASS/1 FAIL**, Legacy migration **SKIPPED**, Docker runtime **PASS**. 실패는 `TC-U4-E2E-PREVIEW-001`의 `page.getByRole('alert')`가 실제 오류 메시지와 Next.js `__next-route-announcer__` 두 요소를 선택한 strict-mode locator 충돌. 중복 입력 자체는 정상 차단됨.
- PR #64 [P2 리뷰](https://github.com/planner77/layoutManager/pull/64#discussion_r4369348797): 문서화된 일반 `http://<server IP>:3000` 연결은 secure context가 아니므로 `crypto.randomUUID` 미지원. **시안에 한정해** `crypto.getRandomValues`로 CSPRNG UUIDv4 생성 fallback을 제공하며 `Math.random` 및 서버/관리권한 토큰 재사용 금지. 기존 `TC-ISSUE14-001`과 일관된 `addInitScript` HTTP 시뮬레이션 E2E 보강.
- 보완 코드 [`b389b66e`](https://github.com/planner77/layoutManager/commit/b389b66e11a34ad6fa737fc5ff760277d192797a): E2E alert locator를 prototype 영역으로 한정, `preview-uuid.ts` 및 Unit 005/006·E2E HTTP-003 추가. [FailureLedger](out/FailureLedger.md), [Issue41](out/Issue41.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). **새 HEAD의 CI 완료 전 PASS 주장 금지**. `DESIGN.md` 없음 → `Architecture.md`/ADR-037 기준, Admin RBAC/Scope/Audit 및 API/DB **BLOCKED** 유지.


## Issue #41 (2026-10-25) — 외곽선 최상위 업무 타입 U4 안전 시안, v0.34.0

- #41은 **인증·Admin RBAC/Scope·감사 보존 정책 Owner 미승인으로 BLOCKED**. `DESIGN.md` 부재, 설계 기준은 `out/Architecture.md`/ADR-037이다. #31 P4와 공통 보안 게이트 사용: 관리 API/DB migration/실제 관리 UI 쓰기 활성화를 금지한다.
- `domain/outline-type.ts`는 순수 정규화/NFC·중복·Revision/비활성 검증 **프로토타입**이다. `/lab/outline-types`는 서버 API, localStorage, DB를 사용하지 않는 **새로고침 시 소멸하는 시안**; 실제 CAD의 typeId/OutlineKind/Overlay와 연결하지 않는다. 기존 Viewer 상단 관리 메뉴는 disabled 유지.
- 실제 수용 AC-U4-01~04는 미충족·일부 도메인 규칙만 선행 검증. `out/Issue41.md`의 AC/TC, `out/TestPlan.md` 및 `out/TestReport.md` 상태를 기준으로 하며, **PR CI 결과 확인 전 NOT RUN/NOT VERIFIED**. Issue 종료·운영 타입 저장 활성화 금지.


## Issue #40 (2026-10-25) — 상단 외곽선 생성 ON/OFF U3, v0.33.0

- `ViewerMenuBar`의 외곽선 생성 토글은 **기본 OFF**. 지원 가능한 DXF + three-dxf-viewer의 정상 로드·유효한 SHA-256 메타데이터·검증된 매핑 Entity >0에서만 ON 및 `select` 허용. OFF는 **Worker/Preview 취소 → 선택 해제 → pan 복귀**와 고지를 수행한다. 기존 #31 선택/Geometry/Worker는 재사용한다.
- 임시 **확정** Outline Overlay와 브라우저 JSON 내보내기는 OFF에도 보존한다. 비확정 선택/Preview만 지우며, 확정 결과 삭제는 ON 도구에서 수행. Overlay 표시/숨김은 U6(#43) 별개; 다른 Renderer/Version/reload/load 실패는 기존 수명주기대로 결과 폐기·OFF. 메뉴 ON/OFF 자체는 ViewerManager 재생성 금지.
- 레이어 숨김/Source↔Renderer fail-closed/Space Pan/ESC 단일 계층/Fullscreen 규칙과 #31 P4 영구 저장·인증 보류는 불변. `DESIGN.md`가 없어 `out/Architecture.md`/ADR-036을 설계 기준으로 한다. [Issue40](out/Issue40.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md) 참조. **PR CI 실행 결과는 검증 전 NOT RUN**.


## Issue #40 / PR #48 — 첫 CI 실패·수정 준수사항 (2026-10-25)

- [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671)의 TypeScript PASS / ESLint FAIL(`viewer.tsx react-hooks/refs`), Docker-runtime PASS, Unit/Build/E2E SKIPPED를 분리해 기록한다. `resetOutline` Ref 접근과 Renderer 메뉴 map 렌더링 경로는 `useCallback`/명시적 Renderer 버튼으로 분리하고 effect 의존성을 안정화한다.
- 선택 모드 Space Pan은 **캔버스/비대화형 대상**에서만 `preventDefault`; 포커스된 상단 버튼·메뉴 등은 Space native 키보드 click을 허용해 ON→OFF 가능해야 한다. ESC 선택 취소/검색/native/CSS 우선순위를 변경하지 않는다. [P2 review](https://github.com/planner77/layoutManager/pull/48#discussion_r4369181241), [FailureLedger](out/FailureLedger.md), [Issue40](out/Issue40.md) 참조. 수정 HEAD의 새 CI 결과를 미확인 상태에서 PASS로 기재하지 말 것.

## Issue #40 / PR #48 — E2E 실패 반복 방지 (2026-10-25)

- [Run 40150085136](https://github.com/planner77/layoutManager/actions/runs/40150085136)은 ESLint·Unit·Benchmark·Build/Docker **PASS** 후 Chromium E2E **52 PASS / 2 FAIL**. `TC-OUT-E2E-001`은 reload 이후 기본 OFF에 따라 도구 패널이 사라지는 것을 실패로 오해한 테스트. `TC-U3-E2E-003`은 `dxf-viewer`에 `LWPOLYLINE` group `90`(vertex count) 없이 좌표만 준 **불완전한 합성 DXF**로 실패했고, 실제 Trace console에서 `n must be greater than 0 vertices`를 확인. [Autodesk 공식 그룹코드](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm) 준수하여 `90=4` 삽입.
- #31 회귀는 reload→OFF/패널 없음→ON→선택 0을 검증한다. 이전 Head에서 통과한 Unit/Lint/Build가 새 Head 성공의 증거는 아니며, 실패/취소·SKIPPED 상태 구분은 [FailureLedger](out/FailureLedger.md), [Issue40](out/Issue40.md), [TestReport](out/TestReport.md) 참조. 새 CI는 시작까지만 진행하며 결과 모니터링·병합/Issue 종료는 요청 범위 밖.

## Issue #39 (2026-10-25) — 상단 레이어 패널 표시/숨김 U2, v0.32.0

- #38 `ViewerAppState.layerPanelOpen`이 메뉴/도크의 유일한 열림 상태다. `layerAvailable`(immersive + three-dxf-viewer + ready + layers>0)을 충족하면 `aria-controls` 대상 도크 host를 닫힌 상태에서도 유지하고, 내부 접기 후 메뉴로 키보드 포커스를 돌린다.
- **패널 표시**는 `selectedLayers`(실제 CAD layer visibility)와 독립; 기존 #17의 checkbox·전체 선택/해제·Manager API/Canvas/Source는 유지. 도크 조작 시 Viewer 재생성·다운로드/Zoom/Pan/Selection 초기화 금지. Normal/dxf-viewer/DWG/0 레이어/오류/로딩에서는 메뉴 disabled 및 무효한 aria-controls 미노출.
- 회귀: `TC-U2-UNIT-001`, `TC-U2-E2E-001~003`, 기존 #17/#38/#25/검색/외곽선. Simulated native 이벤트는 실제 브라우저 Fullscreen 실증이 아님. 구현 상태와 CI 결과는 [Issue39](out/Issue39.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md)를 따르며 **PR CI 전 테스트는 NOT RUN**이다.

## Issue #45 (2026-10-25) — Current-only 도면 목록, v0.31.0

- `/`의 도면 목록은 사용자가 변경할 수 없는 **Current Version 전용**이다. `currentOnlyListParams`에서 기존 검색 query 검증 뒤 `current=true`를 서버 조회에 강제한다. `?current=false` 및 파라미터 누락도 홈에서는 Current만 표시하며 필터·count·pageSize는 보존한다.
- #8의 `현재 버전만 표시` 토글은 제거한다(#16의 드롭다운 제거 유지). 이전 버전/Current 미지정 층은 `위치별 버전 관리`→`/masters` 다섯 단계 선택→층 `버전 이력` 링크→Location 상세에서 조회·Current 재지정할 수 있다. Location별 Current는 자동 승격하지 않는다.
- **홈 전용 정책**: `/api/cad-files?current=false` 및 공통 `listQuery`/Location 상세는 기존처럼 non-Current/전체 이력 조회가 가능해야 한다. DB migration·기존 도면/버전/원본·권한 변경 없음.
- 회귀: TC-LIST-045-001~003 및 기존 Workflow/Link/Name/Current/Delete/Master E2E. **2026-10-25 최초 PR CI #40142618328 ESLint 실패**(`masters/page.tsx` JSX apostrophe) 및 P2 리뷰에서 `upload.spec.ts` 비Current 홈 접근 회귀 발견; `69e6b175`로 둘 다 보완. 첫 CI에서 E2E는 SKIPPED이므로 실패라고 표기하지 않는다. 수정 HEAD의 CI 증거 전 NOT VERIFIED. 상세 [Issue45](out/Issue45.md), [FailureLedger](out/FailureLedger.md), [TestPlan](out/TestPlan.md).


## Issue #38 (2026-10-24) — Viewer 앱형 메뉴·도킹 셸 U1, v0.30.0

- Epic #37 / 선행 U1: `ViewerAppShell`·`ViewerMenuBar`·`viewerAppReducer`에 CAD 앱 메뉴/좌우 패널 호스트·독립 상태를 도입한다. CSS immersive 기본 진입·사용자 제스처 native fullscreen(#25), 기존 ViewerManager/Adapter lifecycle, 원본 DB/API는 유지한다.
- `layerPanelOpen`(초기 true), `outlineToolEnabled`(초기 false), `outlineTreeOpen`(초기 false)은 캔버스/레이어 표시 상태와 독립이다. 좌측 레이어 도크는 #17의 레이어 조작을 재사용하며 메뉴 토글/도크 접기는 도면 레이어 가시성을 변경하지 않는다.
- 외곽선 ON/OFF(#40), 관리자 타입(#41, P4 RBAC 승인 대기), 타입 지정(#42), 외곽선 트리(#43)는 후속이며 U1에서는 해당 메뉴를 *비활성으로 명시*. 서버 영구 저장/타입 등록 API를 추가하지 않는다. 기존 #31 객체 선택/임시 외곽선/JSON은 하단 도크에서 유지한다.
- ESC: 진행 중 선택 취소 → 검색 패널 닫기 → native fullscreen 해제 → CSS immersive 종료, 한 번에 여러 계층 종료 금지. #31 및 #25 회귀 시 이 우선순위를 따른다. Canvas를 패널 조작만으로 재마운트하지 않는다.
- 실제 시험은 로컬 미실행/CI 시작 전이면 NOT RUN으로, 결과 추적은 [Issue38](out/Issue38.md), [FailureLedger](out/FailureLedger.md)와 [TestReport](out/TestReport.md)로 남긴다. 기능 버전 0.30.0, DB migration/Schema 변경 없음.


## Issue #25 (2026-10-17) — 기본 도면 뷰어 전체 뷰포트 자동 진입

- Issue #25: 목록/Location/직접 URL/복사 링크/새 탭/새로고침은 **CSS immersive viewport**로 시작. 브라우저 native fullscreen 자동 요청 불가; 명시 사용자 버튼에서만 API를 사용한다. 기본 모드에서 Renderer·zoom/fit·#17 레이어·#26 검색·#31 외곽선·다운로드·링크·오류/재시도·뒤로·종료를 사용한다.
- `src/package.json` 기준 작업 버전 `0.29.0`. Viewer API/DB 계약 변경 없음. [Issue25](out/Issue25.md)에 신규 AC·자동 시험 및 ESC/native 구분·포커스·모바일 기준 기록. **PR CI 미실행이며 통과로 표시하지 않는다.**



## Issue #31 v0.28.3 후속 — P0/P5 수용 및 P4 원본 검증 (2026-10-16)

- 이전 #34 PR/새 Main CI 성공·GHCR v0.28.2 게시는 완료. 실설비 DXF 원본/운영 브라우저/GPU/권한 IdP가 제공되지 않아 Issue #31의 P0·P4·P5 전체 수용 완료는 **아님**.
- P0 fail-closed: INSERT/BLOCK 내 지원 불가 Entity가 하나라도 있으면 부분 geometry의 stable 참조를 부정하고 렌더 선택에서 제외. 대형 ARC/CIRCLE 샘플 상한 512로 지정한 sagitta 허용 오차를 충족할 수 없다면 제외·경고하고 정확하다고 표시하지 않는다.
- P4 순수 서버 검증 함수(`server/outline/attestation.ts`): 원본 immutable bytes SHA와 버전, 신뢰 가능한 unique Handle, canonical Source Polygon Union을 재계산·비교하여 임의 JSON/좌표를 거부. **인증 IdP/RBAC/Site scope 정책이 Owner 승인되지 않았으므로 실제 DB migration/Write API/영구 저장 구현·배포 금지.**
- P5 합성 1k/10k/100k 소스 CPU 벤치를 PR CI에서 실행하되 실제 CAD·GPU 수용과 구분. private E2E는 `CAD_OUTLINE_ACCEPTANCE_DXF` 지정 시 별도 Playwright config에서만 실행, 현장 DXF/기준 값/보고서는 Git·CI artifact에 커밋/업로드 금지. Issue #31은 운영 실증·P4 승인 전 OPEN 유지.


## Issue #31 — v0.28.2 Production Worker export fix (2026-10-16; PR CI 전)

- v0.28.1 Main CI [#38894507390](https://github.com/planner77/layoutManager/actions/runs/38894507390)은 SUCCESS/GHCR 게시했지만 **실제 Webpack 경고** `Attempted import error: 'union' is not exported from 'polygon-clipping'`가 있었다. 빌드/게시 성공만으로 정밀 외곽선 Worker 정상 동작을 판정하지 않는다.
- polygon-clipping@0.15.7 ESM은 **default export 객체**만 제공하므로 `import polygonClipping from 'polygon-clipping'`, `polygonClipping.union`을 사용한다. `scripts/run.mjs build`는 import/export 오류를 종료 코드 0에서도 실패시켜 PR/Docker Release를 차단한다.
- Production E2E는 Worker PRECISE 실행→임시 확정→다운로드 JSON의 Polygon 좌표·면적·원본 SHA·Handle을 검사한다. PR CI 1k synthetic benchmark smoke. 실 DXF는 `npm run audit:outline -- --file /private/sample.dxf`로 폐쇄망의 승인된 PC에서만 소스 CPU 통계를 생성하며 원본·경로를 외부 업로드하지 않는다.
- **P4 정책 미확정**: 영구 DB/CRUD·권한 변경 금지, 도면 삭제 비밀번호 재사용 금지. P0/P5 실 DXF/GPU 현장 검증 및 P4 승인 전 Issue #31 **OPEN 유지**. 실제로 실행하지 않은 시험은 PASS라고 기록하지 않는다.


## Issue #31 후속 0.28.1 작업 상태 (2026-10-16)

- 0.27.0 PR #32, PR CI run `38874300056`, Main CI run `38875068317`은 실제 SUCCESS. Issue #31은 P0/P4/P5 미완료로 **열린 상태를 유지**한다.
- 0.28.1 P0/P5: Source↔Three Renderer unique Handle/type/layer/World bbox fail-closed 대조, 2D SpatialIndex, synthetic 1k/10k/100k opt-in benchmark 및 Unit/E2E 확대. 실 CAD 성능/정확도는 별도 평가 전 PASS 금지. [Issue31](out/Issue31.md).
- P4: 사용자/Owner가 IdP/인증·인가·audit/scope 정책을 승인하기 전 **서버 영속 DB/Write API 구현·배포 금지**. 브라우저 JSON의 순수 validator·시험만 준비한다. 도면 삭제용 비밀번호·신뢰되지 않은 User 헤더를 재사용하지 않는다.


## Issue #26 (2026-10-16) — DXF 도면 내부 텍스트 검색

- 최신 main 0.27.0(#31) 정렬 후 통합 PR 후보는 **0.28.0**이다. 최초 0.27.0 작업 브랜치에서 현재 도면 DXF TEXT/MTEXT 색인·삽입점 world 좌표 focus, 검색 UI, 단위/Browser 테스트 소스를 추가했다. 현재 단계는 **PR CI 전**, 로컬 실행 결과 및 독립 QA 통과를 주장하지 않는다.
- DXF만 1차 검색 지원. BLOCK/INSERT 기본 2D affine은 지원하되 ATTRIB·ATTDEF/비기본 OCS/배열 INSERT는 제외·안내한다. DWG LINE-only 제한을 유지하며 DWG TEXT/MTEXT 추출·렌더링·줌 가능성을 검증하지 않은 상태에서 지원으로 표시하지 않는다.
- 검색 색인은 Adapter 바깥의 Worker에서 생성하고 ViewerSource로 Version 간 격리/원본 다운로드 공유한다. focusBounds는 각각 dxf-viewer GetOrigin과 three-dxf-viewer world camera로 대응한다. 일반/CSS/fullscreen shell 내부 검색 UI 위치를 유지한다.
- 상세 요구/코드·미지원·TC 목록은 out/Issue26.md 기준. #25 기본 전체 화면 진입 구현은 독립 이슈이며 본 변경의 수용으로 처리하지 않는다.



## Issue #31 (2026-10-16) 구현 범위

- 작업 버전 0.27.0의 `three-dxf-viewer` DXF 선택·외곽선 P0~P3 실험 구현. **합성 Unit/E2E 및 PR CI 검증 전이며 실제 설비 DXF 정확도·성능, 엔터티→Object3D 1:N 매핑은 미확정**. 조건·지원 범위·실험·보류는 [Issue31](out/Issue31.md)을 따른다.
- 외곽선은 브라우저의 임시 Overlay/JSON 내보내기까지만 허용한다. 인증·편집 권한 모델 합의 전 P4 DB/API 서버 저장을 추가하거나 삭제용 비밀번호를 외곽선 권한으로 재활용하지 않는다.


## Issue #28 (2026-10-16) 작업 현황

- 기능 브랜치에 0.26.0 Next.js standalone 웹 + 일회성 Prisma/tsx migration image 구성을 작성했다. 이전 0.25.0 기록은 역사 근거이다. 수용 기준/측정/배포 위험은 `out/Issue28.md`를 따른다. **PR CI와 독립 QA 결과 확인 전 PASS나 이미지 절감 수치를 주장하지 않는다.**
- 운영 업그레이드 전 DB/local CAD/S3의 동일 시점 백업, 기존 app stop, migration 성공 후 app 기동이 필수이다. `out/Operation.md` 참조.


DXF/DWG 공장·설비 도면을 등록·검색·버전 관리하고 세 CAD 기술의 실제 적용 가능성을 검증한다. 문서와 테스트 근거를 코드와 함께 유지한다.

## 현재 단계와 작업 위치

- GitHub #24 소스는 0.25.0이다. 사업부→제품→사업장/법인→동→층 master, 활성 ID chain 등록, 제품 포함 조회, legacy 미분류 이관·층 이력 재분류를 구현하고 독립 QA 및 Manager 수용을 완료했다. 구현 source commit은 `e8189b4`이며 원격 기능 브랜치에 게시했다. 상세 근거는 Issue24/TestReport를 따른다. PR CI 결과와 운영 migration·배포는 이 수용 범위 밖이다. 아래 0.21.0 기록은 이전 릴리스의 역사 기록이다.

- 최신 관리 기능은 등록·목록·검색·Location 상세·Current 변경이다. GitHub #1 조치 결과는 TestReport의 U3-20260908을 참조한다. Unit 4 dxf-viewer를 연결했다. 현재 결과는 TestReport의 U4-20260908을 참조한다. Unit 5에서 three-dxf-viewer와 한글 기본 글꼴을 연결했다. 최신 결과는 U5-20260908을 참조한다. Unit 6에서 새로고침 없는 전환과 원본 공유를 연결했다. 최신 결과는 U6-20260908을 참조한다. Unit 8A에서 측정 UI/JSON 및 반복 비교를 추가했다. U9A-20260908에서 DXF 전체 흐름 및 20회 전환 회귀를 검증했다. Unit 7A에서 libredwg-web의 실제 DWG LINE parse/render/free 독립 실험을 검증했다(U7A-20260908). Unit 7B에서 등록 DWG Viewer와 기본 탐색/오류/재진입을 검증했다(U7B-20260908). Unit 8B에서 DWG WASM 초기화·파싱 계측을 추가했다(U8B-20260909). 사용자 요청 Unit S3에서 선택적 S3 호환 저장소를 추가했다(U-S3-20260908). Unit OBS에서 폐쇄망 업로드 오류의 공개 진단과 요청 ID 기반 서버 로그를 추가했다. 소스 버전은 0.21.0이다. GitHub #10 도면 뷰어 전체 화면 보기 기능을 PR #13에서 구현·검증했으며 native Fullscreen API와 CSS fallback, 상태 보존, ESC/종료, resize 회귀를 포함한다. 요구사항·설계·CI 근거는 Issue10 문서, 실제 병합·태그·GHCR 게시 근거는 Release-0.21.0 문서를 기준으로 한다. GitHub #9 전역 로딩 오버레이와 중복 요청 방지를 구현·검증하고 PR #12 병합, `v0.20.0` 및 GHCR 0.20.0 게시, 이슈 종료를 완료했으며 요구사항·설계·CI·릴리스 근거는 Issue9 문서를 기준으로 한다. GitHub #8 도면 목록의 `현재 버전만 표시` 토글을 구현·검증하고 PR #11 병합 및 이슈 종료를 완료했으며 요구사항과 CI 근거는 Issue8 문서를 기준으로 한다. GitHub #7 상단 제목 간소화의 검증·0.19.1 배포 및 이슈 댓글·종료를 완료했으며 실제 결과는 TestReport U-ISSUE7-20260911을 기준으로 한다. GitHub #6 위치·버전 기반 기본 도면 이름과 사용자 이름 입력의 검증·0.19.0 배포 및 이슈 댓글·종료를 완료했으며 실제 결과는 TestReport U-ISSUE6-20260911을 기준으로 한다. GitHub #5 레이어 다중 선택 드롭다운과 전체 선택·해제의 검증·0.18.0 배포 및 이슈 댓글·종료를 완료했으며 실제 검증·게시·배포 결과는 TestReport U-ISSUE5-20260911을 기준으로 한다. GitHub #4 삭제 대화창 레이아웃을 수정·검증하고 0.17.2 배포 및 이슈 댓글·종료를 완료했으며 실제 수용·게시·배포 결과는 TestReport U-ISSUE4-20260911을 기준으로 한다. GitHub #2 메모를 기존 도면 설명으로 검증했고 #3 파일 크기 사전 검증과 Unit DELETE 보완을 완료했다. 두 이슈를 댓글·종료 처리했으며 GHCR 0.17.1과 기존 볼륨 배포 및 기존 도면1234 적용을 검증했다. 실제 수용·게시·배포 결과는 TestReport U-ISSUES-20260911을 기준으로 한다. 사용자 요청 Unit LINK의 특정 Version 직접 링크와 Unit DEPLOY의 Docker/host IP/GHCR 배포를 완료했다. DWG는 현재 평면 LINE/20 MiB 범위이며 제외 Entity는 partial로 기록한다. 실도면 평가는 미완료이다.

- 2026-09-07 사용자가 계획 실행을 승인했다. **DXF 우선 릴리스: 0B→1→2→3→4→5→6→8A→9A**, 이후 별도 MINOR 버전에서 **7A→7B→8B→9B(libredwg-web)**를 진행한다. DWG 선행 실험은 DXF 구현의 선행 조건이 아니다. 승인 범위 내 반복 승인은 요구하지 않는다.
- 팀 역할 매핑: gpt-6-astra Manager가 범위·승인·Issue Lifecycle 조정을 담당하고, gpt-6-sol Developer가 구현·리팩터링·복잡한 기술 분석을 담당하며, gpt-6-luna QA가 독립 검증·회귀 시험·문서 점검을 수행한 뒤 Manager에게 결과를 보고한다. Manager가 재작업 여부를 결정하고 root가 최종 release commit/push를 담당한다. 과거 TestReport/ADR의 실제 실행 모델 기록은 소급 변경하지 않는다.
- 이 팀 운영은 새 스레드·새 세션에도 적용한다. Manager는 먼저 요구사항/설계/AC를 기록하고 Developer에게 구현을 지시한다. Developer 완료 보고를 검토한 후 QA에 테스트·문서화를 지시한다. QA 보고를 근거로 Manager가 완료 또는 재작업을 결정한다. 모델 사용량 제한 등으로 지정 역할을 실행할 수 없으면 이를 보고하고 실제 대행 주체와 검증 근거를 TestReport에 남긴다. 역할을 실행하지 않고 실행한 것처럼 기록하지 않는다.
- Docker 배포 파일은 `src/Dockerfile`, `src/docker-compose.yml`이다. Root build context의 Secret 차단에 필요한 `.dockerignore`만 Root에 둔다. 이미지에는 `.env`/Git 인증/사용자 CAD/DB를 넣지 않고 앱 설정만 런타임에 전달한다. 단일 SQLite 인스턴스이며 여러 replica를 같은 DB에 붙이지 않는다.
- 프로젝트 Root 아래 `src/`가 애플리케이션 루트이다. 모든 코드·설정·테스트·migration·package/lock 파일은 `src/`에 둔다. `out/`은 Markdown 산출물, `data/`는 Git 제외 런타임 저장소이다.
- 기본 Stack: Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS, SQLite, Prisma 우선, Local Filesystem(default)/선택적 S3 호환 저장소. 실제 설치 버전과 호환성은 Unit 0B에서 검증·고정한다.

## 반드시 지킬 규칙

- 사업부→제품→사업장/법인→동→층의 다섯 ID chain이 Location 계층이며 CadLocation ID는 최종 층을 식별한다. 각 단계는 부모 ID+이름 Unique를 사용하고 **Location별 Current는 최대 하나**이다. Current 교체는 트랜잭션으로 처리하고 다른 Location의 Version 참조를 DB에서도 차단한다.
- DXF는 `dxf-viewer` / `three-dxf-viewer` 선택, DWG는 `libredwg-web` Adapter만 허용한다. DWG→DXF 우회와 CAD 편집은 범위 밖이다.
- Viewer는 Manager/Adapter로 격리하고 Browser 전용 의존성을 SSR에서 실행하지 않는다. DWG 파서와 직접 렌더링 계층의 구분은 Architecture 및 ADR-004를 먼저 읽는다.
- UI에 DB 업무 규칙·파일 I/O를 넣지 않는다. 파일은 Version ID로 조회하며 임의 filesystem 경로를 받지 않는다.
- `.env`의 기존 `remote_repo_url`, `remote_repo_token` 변수명을 유지한다. 값·인증 헤더·credential URL을 응답, 로그, 문서, 코드, 커밋에 출력하지 않는다. 앱 프로세스에는 Git Credential을 전달하지 않는다.
- S3의 endpoint/bucket/credential은 서버 환경변수로만 관리한다. 저장 locator별 local/S3를 조회하며 기존 원본을 자동 이동하지 않는다. 원격 PUT은 DB transaction 전에 수행하고 불확실한 완료 응답을 이유로 원본을 삭제하지 않는다.
- Secret, Runtime DB, CAD 원본, 캐시, Build 결과, Debug dump는 커밋하지 않는다. 외부 라이브러리를 먼저 수정하지 말고 Wrapper 해결과 영향 분석을 우선한다.
- 지원 여부, 공식 문서의 주장, 실제 시험 결과, 추정을 구분한다. 미실행을 PASS로 기록하지 않는다.

## 작업 Workflow와 완료 기준

1. 재개 시 이 문서 → README → 안전하게 확인한 Git 상태/remote/branch/log → package version → ChangeLog → TestReport → 해당 상세 문서를 읽는다. 기존 변경을 보존한다.
2. 승인 범위 내 다음 최소 Unit의 요구사항·Acceptance Criteria·Test Case를 먼저 확인/갱신하고 구현한다. 중요한 업무 규칙·구조 변경·데이터 손실 위험만 확인하며 세부 구현은 자율 판단한다.
3. Build, Type Check, Lint, 관련 자동 테스트, 필요한 E2E/수동 시험을 통과시킨다. 실패를 해결하기 전 다음 Unit으로 넘어가지 않는다. Unit 0A는 코드 없는 문서 검사만 적용한다.
4. 관련 상세 문서, 추적 관계(요구사항→구현→TC→결과), README를 갱신한다. DB Schema의 단일 기준 문서는 `out/Database.md`이다.
5. `git status`, `git diff`, staged diff와 Secret/산출물 포함 여부를 검토한다. 작업 요약 후 Conventional Commit(`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`)을 작성한다.
6. `.env`가 지정한 remote만 사용한다. Push 전 remote 정합성·비밀정보·CAD·DB 제외를 재확인한다. Force Push, History Rewrite, 기존 Commit/Branch 삭제는 사용자 승인 없이 금지한다. 작성자 설정이 없으면 임의 신원을 만들지 않는다.
7. 앱 버전 기준은 `src/package.json`의 SemVer `0.x.y`이다. 기능 추가 MINOR, 호환 Bug Fix PATCH, 근본 변경은 사용자와 협의한다. README/ChangeLog를 일치시키고 테스트·커밋 후 의미 있는 Release에만 Tag를 검토한다.
8. Unit 완료 보고에는 변경·테스트·문제·설계/문서 변경·Commit·Push·버전·다음 Unit을 포함한다. 완료 조건이 부족하면 진행 중/보류로 표시한다.

## 상세 문서와 필수 참조 시점

| 문서 | 목적 | 반드시 참조하는 상황 |
| --- | --- | --- |
| [Requirements](out/Requirements.md) | 상세 기능/비기능 요구사항, 범위 | 기능 추가·수정·삭제 전 |
| [Architecture](out/Architecture.md) | 구조와 Component 책임 | 구조 변경, 신규 Module, Viewer 변경 시 |
| [ViewerPanelPolicy](out/ViewerPanelPolicy.md) | #138 Viewer 조회·작업 보조 창의 공통 drag/Drawer·위치 복원·Canvas 입력 경계·반응형·수명주기 지침 | Viewer 내 검색·목록·트리·편집·도구 창의 요구사항 등록, 설계/구현, 코드 리뷰/수용 시험 시 (예외 사유도 기록) |
| [Database](out/Database.md) | Schema 및 변경 이력 | Table/Column/Index/Constraint 변경 전후 |
| [TestPlan](out/TestPlan.md) | Unit, Acceptance Criteria, Test Case | 구현 Unit 시작 전 |
| [TestReport](out/TestReport.md) | 실제 테스트 및 Viewer 평가 | Unit 완료 및 Release 전 |
| [Operation](out/Operation.md) | 설정·Build·실행·장애 대응 | 환경 또는 실행 방법 변경 시 |
| [Decisions](out/Decisions.md) | 주요 판단, 승인 상태, Trade-off | 중요한 선택 또는 기존 결정 변경 시 |
| [ChangeLog](out/ChangeLog.md) | 버전별 변경사항 | Version 변경 또는 Release 시 |
| [Issue8](out/Issue8.md) | GitHub #8 요구사항·구현·CI 수용 근거 | Issue #8 변경 추적 또는 유사 목록 필터 변경 시 |
| [Issue93](out/Issue93.md) | 기본 Current·전체 버전 검색 토글 및 목록/API URL 분리 | 도면 목록 검색·버전 필터·페이지네이션 변경 시 |
| [Issue9](out/Issue9.md) | GitHub #9 전역 로딩 요구사항·구현·CI·릴리스 근거 | 전역 로딩, 중복 요청 방지 또는 비동기 입력 차단 변경 시 |
| [Issue10](out/Issue10.md) | GitHub #10 전체 화면 요구사항·설계·CI 근거 | Viewer 전체 화면, ESC/종료, 컨테이너 resize 또는 view state 보존 변경 시 |
| [Issue38](out/Issue38.md) | Viewer 앱형 메뉴·도킹 셸/ESC 상태·후속 U2/U3/U6 계약 | Viewer shell·도킹·메뉴·검색/선택 ESC 변경 시 |
| [Issue39](out/Issue39.md) | Viewer 메뉴와 레이어 패널 표시 상태 독립/접근성·포커스·회귀 근거 | 레이어 메뉴·도크 접기/Renderer·fullscreen 레이어 UX 변경 시 |
| [Issue51](out/Issue51.md) | 원본/생성 객체 통합 선택·편집 가능 판정·트리/Canvas 동일 선택 집합 | 객체 선택·편집 권한/Geometry·Overlay·선택 모드 변경 시 |
| [Issue52](out/Issue52.md) | 브라우저 GeneratedDocument·Command/Undo·Redo·이력 메모리 및 보안 범위 | 생성 개체 변형·Undo/Redo·Tree/Scene/JSON 투영·#53~#56 변경 시 |
| [Issue42](out/Issue42.md) | U5 업무 타입 지정·이름 및 schemaVersion 2 JSON 계약·#65 보안 승인 경계 | Viewer 타입 선택·외곽선 임시 확정·JSON/Tree 연계 변경 시 |
| [Issue40](out/Issue40.md) | U3 외곽선 ON/OFF·Worker 취소·임시 확정/JSON 보존 정책 및 AC 추적 | 외곽선 메뉴·객체 선택·취소·임시 Overlay/Renderer·ESC 변경 시 |
| [FailureLedger](out/FailureLedger.md) | PR/Main CI 관측 실패·조치·재검증 누적 원장 | CI 실패·취소·재시작 시 |
| [Issue25](out/Issue25.md) | 기본 immersive 진입, native 수동 선택, 복귀·툴바·회귀 수용 | Viewer 전체 화면 기본 진입/링크/포커스/레이어·검색 변경 시 |
| [Release 0.20.0](out/Release-0.20.0.md) | 0.20.0 병합·태그·GHCR 게시 근거 | 0.20.0 릴리스 확인 및 운영 이미지 식별 시 |
| [Release 0.21.0](out/Release-0.21.0.md) | 0.21.0 병합·태그·GHCR 게시 근거 | 0.21.0 릴리스 확인 및 운영 이미지 식별 시 |
| [Issue105](out/Issue105.md) | G3 격리 로그인·초기 변경·세션 수명/회수·Actor·Cookie AC/TC | 로그인/암호 변경·Session/Actor 구현·G3 검증 및 G4/G6 인계 시 |
| [Issue104](out/Issue104.md) | 최초 관리자·Secret·복구·격리 CLI/TC/운영 OFF | G2~G7 관리자 정책·복구 검토 시 |
| [Issue103](out/Issue103.md) | G1 User/Session/Role·Site·SpecialGrant/Audit/RecoveryNonce 격리 SQL·Prisma 계약 및 원자성·복구 시험 | Auth DB/세션/권한/복구·백업 검토 및 #102 G0→G7 선행 조건 확인 시 |
| [Issue102](out/Issue102.md) | G0 내부 LAN PROD Nginx/DEV App 직접 접속, Owner 경량 보안 범위·잔여 위험 수용·G0~G7 운영 게이트 | 운영/개발 배포 경로·Nginx/직접 포트, 인증·Site/Version 권한·기존 CAD API 전환, 위험 범위·운영 Go/No-Go/수용 기준 변경 시 |
| [Issue107](out/Issue107.md) | G5 PROD Nginx/DEV 직결 격리 Preview, 테스트·실 LAN 인계 | Proxy/접속 경로·정상 Viewer/API/Upload/Health 검증, 운영 환경 변경 경계 |
| [Issue108](out/Issue108.md) | G6 사내 PC 2대/Nginx·DEV 및 인증 업무 E2E·동일 시점 SQLite/CAD/S3 백업·격리 Migration·실 Restore·Rollback 수용, 오프라인 EV 증거 검사와 운영 OFF 범위 | G6 테스트 설계·실행·증거 판정, LAN/Viewer/기존 CAD 호환, DB/CAD/S3 복구·현장 QA, G7 #109 운영 Go/No-Go 선행 수용 확인 시 |
| [Issue109](out/Issue109.md) | G7 운영 Auth·CAD 쓰기 단계별 활성화, 이중 승인 게이트/Owner Go/No-Go, 동일시점 DB·CAD·S3 백업·실복구·롤백 및 운영 NO-GO 계약 | 인증/인가·기존 CAD 쓰기 권한 전환, 정식 Prisma migration, 운영 Nginx/Compose/배포, 승인 증거 확인, 장애 중단·롤백 계획·수행 전 **반드시** 참조 |
| [S3-4-B1 Runbook](src/deploy/g7-s3/S3-4-B.md) | #109 G7 격리 복원본의 UID/0700·0600·SQLite 메모리 복제/Version·Current/FK·CAD/S3-export SHA 검증, Snapshot 한계·B2 실제 OCI/복구/롤백 승인 경계 | S3-4-B1/B2 복제본 검사·실복구 계획·Snapshot/Schema/rollback 검토, 구현·리뷰·회귀 테스트·운영 Go/No-Go 전 반드시 참조 |
| [S3-4-B2 Runbook](src/deploy/g7-s3/S3-4-B2.md) | #142 OCI 4개 App/Migrator/rollback raw bytes SHA·Source/Schema/Role 검증의 비인가 경계, 실제 Registry/동일 Snapshot/7 Migration/restore/rollback 후속 게이트 | S3-4-B2-1~B2-5 OCI 검증·복구 설계/코드/리뷰/테스트 및 S3-4-C 신뢰 바인딩·Owner GO 이전 반드시 참조 |
| [S3-4-B2-2 Runbook](src/deploy/g7-s3/S3-4-B2-2.md) | #142 단일 Snapshot writer barrier 주장 패킷의 순수 시간·Source Epoch·Version/Current·Local CAD/버전 S3 인벤토리 검사와 실제 현장 증거/신뢰 한계 | B2-2A~B2-5 기획·구현·리뷰/테스트, 현장 freeze·온라인 백업·복구/승인 판단 전 반드시 참조 |
| [S3-4-B2-2B Runbook](src/deploy/g7-s3/S3-4-B2-2B.md) | #142 합성 격리 SQLite/CAD/S3 Buffer byte·FK·Version/Current·SNAP/Source 한계 및 현장 승인 게이트 | B2-2B 코드·리뷰/테스트, 실제 현장 Writer/Backup/Restore 승인 설계와 S3-4-C/Owner GO 전 반드시 참조 |
| [S3-4-B2-3 Runbook](src/deploy/g7-s3/S3-4-B2-3.md) | #142 기존 CAD 6+격리 Auth 후보 1개의 일회용 Prisma History/합성 CAD 보존·Audit append-only 장애주입 검증, 실 Source 한계 | S3-4-B2-3 구현/테스트/리뷰, 실제 Site Clone/Restore 및 B2-4/B2-5 Owner 승인 검토 시 필수 참조 |
| [Issue31](out/Issue31.md) | DXF 다중 선택·볼록/정밀 외곽선·실험 상태·P4 권한 보류 | Viewer 선택·외곽선/Worker/JSON 변경 시 |
| [Issue26](out/Issue26.md) | DXF TEXT/MTEXT 색인·world 좌표 focus·검색 범위/검증 | Viewer 검색·Pan/Zoom·Worker·BLOCK/INSERT·DWG 텍스트 지원 검토 시 |
| [Issue66](out/Issue66.md) | Migrator 최소 의존성·크기 측정/OCI manifest·복구 계약 | Docker migrator/CI/GHCR 및 버전·패키징 변경 시 |
| [Issue28](out/Issue28.md) | 운영 이미지 경량화·Migration 분리·측정/롤백 | Dockerfile, Standalone, Compose, GHCR 변경 시 |
| [Issue24](out/Issue24.md) | 기준정보 계층·이관·층별 Current 요구/설계/AC | 기준정보·계층 등록·제품 조회·legacy 이관 변경 시 |
| [Issue76](out/Issue76.md) | GitHub Squash 기본 메시지 관리자 설정·CI 진단·Main 실행명 확인 | 저장소 설정·PR/Main CI run-name 변경 시 |
| [Issues124-126-127](out/Issues124-126-127.md) | 목록 고정/밀도·DXF fallback·Viewer 그룹 메뉴/Drawer 설계와 AC | 목록/Viewer UI·복구·새 릴리스 검증 시 |
| [README](README.md) | 사용자/개발자 프로젝트 안내 | 기능·구조·설정·실행방법 변경 시 |

추가 Markdown 문서가 필요하면 이 표에 목적과 필수 참조 시점을 등록한다. 상세정보를 여러 문서에 독립적으로 복제하지 않는다.
