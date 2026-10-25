# Database Schema — 단일 기준 문서

## Issue #96 — D1~D6 승인값 / 물리 DB 비활성 (2026-10-25)

- D1 최초 Admin/복구 .env + Secret 파일 단발 정책, D2 비밀번호 최소 8자/scrypt local-v1/강제 초기변경, D3 절대 8시간·idle 30분·동시 세션 3개, D4 명시적 Site Grant/Admin 전용 권한관리, D5 감사 365일/별도 audit:read, D6 LAN 접근제한+HTTP 위험 수용 원칙 승인. ADR-051이 기존 D0 미결정 표기보다 우선한다.
- 개념 User/AuthSession/UserRoleGrant/UserSiteGrant/AuditEvent 표와 FK 설계는 유지하며 **src/prisma/schema.prisma, src/prisma/migrations에 이번 변경 없음**. Session token은 해시만 저장하고 4번째 발급은 미래 DB 원자 count+insert로 거부. 단발 복구 nonce는 DB CAS/불변 이력으로 재사용 차단해야 한다. 실제 append-only/365일 Audit 조회·파기 정책 및 Version FK 구현은 차후 승인 대상.
- 원본 CAD/Version/Current/SHA·기존 CAD 삭제 비밀번호는 불변. 복제 DB 백업→Migration dry-run/foreign_key_check→복원, CIDR·권한 E2E 및 별도 Owner 배포 승인 없이는 새 Schema/API **OFF**. [Issue96](Issue96.md).



## Issue #97 / P4-D2 — 원본/Transform 서버 검증은 DB 변경이 아님 (2026-10-25)

- 새 `src/server/outline/transform-attestation.ts`가 서버 보유 immutable DXF bytes Version/SHA → Stable Root Handle·WCS Canonical baseGeometry/algorithmVersion·tolerance 0.02 → 명시적 Translate/Rotate → **서버 계산 effectiveGeometry**를 검증해 반환한다. 전역 `OutlineType` FK/활성 여부·영속 UUID는 여기서 판정하지 않는다.
- **Prisma `schema.prisma`/migration/데이터 모델/Current/Version/SHA/Source bytes를 수정하지 않는다.** D1 #96 인증·Role/Scope/Audit 및 D3 #98 `CadOutline` CRUD/revision CAS(409)/soft-delete/Memo reconcile/Version FK/Backup 시험 없이는 이 결과를 저장할 수 없다. 기존 D0 개념 Schema 제안을 실제 DB에 적용했다고 해석 금지.
- 구현·차단·후속 판정은 [Issue97](Issue97.md), [ADR-050](Decisions.md), [TestPlan](TestPlan.md) 참조.

## Issue #31 P4 D0 Owner 승인 설계안 — **DDL 미적용** (2026-10-25)

**우선순위:** 최신 Owner [ADR-048/049](Decisions.md) 승인 정책이 아래 과거 #41/#42의 OIDC/Scope-key 미결정 예시보다 우선한다. 이는 **개념 모델**, 배포된 `schema.prisma`/migration이 아니다. 신규 DB/CRUD 활성화는 별도 구현·검증 승인 전 BLOCKED.

| 제안 Model/Column | D0 계약 (물리형식·세부값은 후속 migration ADR) |
| --- | --- |
| `User(id PK, loginName unique, passwordHash, displayName, status, createdAt, updatedAt)` | 로컬 계정, 불변 ID가 감사 주체. 초기 Admin 발급·비밀번호/회수 정책 미확정 |
| `AuthSession(id/tokenHash PK, userId FK, expiresAt, revokedAt?, createdAt)` | 서버 소유 난수 세션; 원시 토큰 DB/감사 로그 기록 금지, HTTP-only cookie + SameSite. 일반 HTTP 서버 IP에서 Secure 쿠키 동작을 주장하지 않음. TTL/동시 로그인 미확정 |
| `UserRoleGrant(userId, role)` / `UserSiteGrant(userId, siteId, permissions?)` | Reader/Editor/Admin 및 담당 Site Scope; Version의 실제 Site 관계 서버 검증, 무범위 기본 거부. 실제 Grant/Unique 구조·관리자 범위는 D1에서 구체화 |
| `OutlineType(id, name, nameKey, description?, active, sortOrder, revision, ...)` | **단일 Global Catalogue**. Site/사업부별 Scope Key로 분리하지 않음. `nameKey`는 전체 앱 고유성, Unicode/NFC case-fold 규칙 및 DB index 검증 이후 확정. 관리 Admin만 허용, 참조 타입 물리 삭제 금지 |
| `CadOutline(id UUID, versionId FK, sourceSha256, kind, outlineTypeId FK?, name, sourceEntityRefs, algorithmName/Version, canonicalBaseGeometry, transform, revision, status, createdById, updatedById, createdAt, updatedAt, deletedAt?, deletedById?)` | GENERATED 서버 발급 ID; Source immutable bytes+SHA+stable Handle/instancePath 검증. `kind`=CONVEX/PRECISE이며 `outlineTypeId` 업무 분류와 독립. Geometry WCS XY, Translate/Rotate 강체 affine만 허용. 서버가 결과 Geometry 계산, 필요하면 파생 캐시로만 보관. `status=ACTIVE|DELETED` 논리 삭제; CAS `expectedRevision` / 409 |
| `AuditEvent(id, actorUserId?, action, targetKind/Id, siteId, versionId, beforeRevision, afterRevision, outcome, requestId, timestampUtc, safeMetadata)` | Create/Edit/SoftDelete/Grant 및 거부 이벤트, append-only. 원본 도면·비밀번호·세션·전체 Geometry 기록 금지; 보존 기간·읽기 권한·물리 삭제 미확정 |
| `CadMemo(...anchorStatus, targetOrigin, targetId?, lastResolvedWcsXY, revision...)` | #83/#84 담당. 영속 GENERATED target 삭제 시 동일 트랜잭션으로 `BROKEN_ANCHOR`+마지막 WCS 저장+연결 해제, 메모 행은 유지; 실제 FK/트랜잭션·Version 삭제 정책 후속 확정 |

- `CadOutline.visible` 공유 필드는 **추가하지 않음**. 외곽선 개별/그룹 Show/Hide는 각 사용자 **세션 상태**이고 Catalog·다른 Editor 데이터/Revision을 갱신하지 않는다. Reload/다중 탭 지속 정책은 미정.
- 글로벌 업무 타입도 사용자의 도면 Version/Site Read/Edit 권한을 확대하지 않는다. Editor는 할당된 Site/Version Scope 내에서 공동 편집하되 최초 작성자·source SHA/Version은 불변; 메모 Editor 권한은 승인된 것으로 확대 해석 금지.
- SOURCE 참조는 `{versionId, sourceSha256, handle, instancePath?}`, GENERATED는 서버 영속 UUID와 Origin. 클라이언트 local-N/UUID를 신뢰되는 DB ID로 취급하거나 다른 Version으로 자동 재연결 금지.
- API는 `/api/cad-files/[versionId]/outlines[/id]`를 후속 제안으로만 유지. 모든 읽기/쓰기에서 Session→Role/Scope→Version/SHA→서버 canonical/Transform 검증→revision CAS→DB/Audit atomicity. 인증 없는 미승인 신규 GET/POST/PATCH/DELETE를 만들지 않는다.
- **보류:** Version 물리 삭제와 논리 삭제 객체·감사/메모 FK 처리, Audit retention/복원·파기, Session TTL/계정 초기화, legacy typed v1/v2 이관, HTTP LAN 접근 범위. 백업→격리 migration dry-run→FK/변경 불변/복구 시험 승인 전 DDL 적용 금지.


## Issue #42 / v0.35.0 — 영속 Schema 변경 없음 (U5 safe contract)

- `outlineTypeId/outlineTypeName/name`은 **브라우저 `SavedOutline` DTO 및 선택적인 v2 다운로드 JSON 메타데이터**일 뿐, Prisma Column/FK/DDL/마이그레이션에 추가하지 않았다.
- #65 실제 `OutlineType` table/Scope/Unique/Revision 및 #31 `CadOutline` P4는 미승인 상태. `outlineTypeId`를 DB FK로 추가하거나 브라우저 JSON을 그대로 저장하면 안 된다. 서버 authoritative file SHA/Version/Handle/Geometry 검증, RBAC/Scope/CAS/Audit 승인 후 별도 Migration 설계 필요. [Issue42](Issue42.md).


## Issue #41 / v0.34.0 — OutlineType 영속 Schema는 미승인 (DDL 없음)

- 이번 단계는 **schema.prisma와 migration 변경 없음**. `/lab/outline-types`의 목록은 React state만 사용; 신규 DB 테이블, 임의 사용자, 서버 CRUD, FK 없음. 원본 CadFileVersion/CadLocation 및 #31 CadOutline 제안 불변.
- **승인 후 제안:** `OutlineType(id UUID PK, scope_key <미결정>, name NFC, name_key NFC+lowercase, description?, active BOOL, sort_order INT, revision INT, created_at UTC, updated_at UTC)` 및 scope별 Unique(name_key), CHECK/Index. `name_key`의 case folding/Unicode DB 구현, NULL scope와 key 구성은 Owner 결정 및 SQLite 실제 충돌 검증 뒤 확정. 조회 Scope 누락 시 기본 거부.
- 추후 `CadOutline.type_id`는 OutlineType.id FK를 참조하고 이름변경/비활성 뒤에도 보존; 타입 물리 DELETE 미제공. `revision` CAS UPDATE(expectedRevision)→409, 트랜잭션 FK/Unique와 감사 event(행위, actor, scope, result, timestamp, revision)를 원자적으로 기록.
- 기존 백업·복제 dry run→migration→foreign_key_check→복구 검증 및 IdP/CSRF/RBAC(Reader/Editor/Admin)/Audit 보존 승인 없이는 DDL·쓰기 API 시행 금지. [Issue41](Issue41.md) / ADR-037.


## Issue #31 v0.28.3 — CadOutline 미배포 상태와 정합성 사전 게이트

- 이번 브랜치는 **Prisma schema, Migration, 기존 DB, 원본 DXF, Storage locator를 수정하지 않는다**. 기존 P4 제안 Schema는 계속 *미승인*이다.
- 저장 로직 구현 선행 조건: 검증 가능한 IdP(OIDC issuer/audience/JWKS) 또는 별도 로컬 로그인/HttpOnly 세션 정책, Reader/Editor/Admin Roles와 Site·Version scope, 운영 관리자·감사 기록 보존 기간 확정. 임의 HTTP 헤더/삭제 비밀번호/공유 토큰만으로 쓰기 허용 금지.
- 코드의 `server/outline/attestation.ts`는 향후 저장 시 서버가 `CadFileVersion.id/sha256`와 immutable Source bytes 일치를 확인하고 stable Handle을 재파싱·Polygon을 재계산하여 Client 좌표 위·변조를 거부하는 **쓰기 기능이 없는** 보조 계약이다.
- 권한 승인 이후 기존 제안 CadOutline FK/Revision 및 Version 삭제 정합성(ON DELETE 정책), 감사·복구·백업 dry run, 영구 overlay load/update/delete API를 구현해야 실제 P4 완료라고 평가할 수 있다.


## Issue #31 P4 — 영구 저장 Schema 제안 (DDL / Migration 미적용)

**이 절은 제안이며 배포 DB schema가 아닙니다.** 사용자/Owner가 인증·인가 수단, 역할 및 Scope, 감사 보존 기간을 결정하기 전 새 Table·Route·Migration을 적용하지 않는다.

| 제안 필드 | 정책·DB 정합성 |
| --- | --- |
| `CadOutline.id` | 서버 생성 UUID PK, Browser 임시 ID 별개 |
| `versionId` + `sourceSha256` | `CadFileVersion`에 버전·원본 Hash 동시 귀속, 복합 FK/unique anchor 검증. Current 교체·새 Version에 자동 재바인딩 금지 |
| `name`, `kind`, `algorithm` | 이름 정규화·길이 제한, CONVEX/PRECISE 및 허용 Algorithm만 |
| `sourceEntities`, `geometry`, `parameters` | JSON; **server-owned DXF에서 Handle/WCS canonical Geometry를 재계산**하여 client-supplied JSON과 대조. 좌표·polygon 수와 요청 body 상한 |
| `revision`, `createdAt`, `updatedAt` | revision >=1, CAS UPDATE (id+expected revision) / 409 동시 변경. 시간 UTC |
| `createdBy`, `updatedBy` | 인증된 사용자 ID 기반 변경자 감사 (원본 경로·패스워드·RAW geometry 로깅 금지) |
| Version 삭제 | Version DELETE transaction 내 outline 연쇄삭제/이력 보존 정책 중 선택. 현재 원본 삭제 구조의 승인·Storage cleanup 안전성 유지 |

제안 Route: `GET/POST /api/cad-files/[versionId]/outlines` 및 `PATCH/DELETE /.../outlines/[id]` (현재 **미구현**). POST/PATCH/DELETE는 서명 검증된 JWT나 안전한 앱 세션, RBAC/Version scope, CSRF/Origin, validation/recompute, FK/409/413를 갖춘 뒤 개방. 삭제용 비밀번호/클라이언트 임의 헤더를 외곽선 편집 권한으로 재사용 금지.

운영 Migration 게이트: 같은 시점 DB/CAD local·S3 백업→격리 복제 DB dry run→fk_check/Version·Current·hash/행 수 검증→단일 app stop/migrate/start→오류 시 동일 시점 백업 복원. 실제 데이터·Schema 변경은 Owner 승인 후 별도 구현·시험.



상태: 2026-10-15 Issue #24 구현. Prisma/Client/SQLite adapter 7.10.0과 실제 migration이 존재한다. 현재 단일 기준은 아래 `0.25.0 기준정보 계층` 절, `src/prisma/schema.prisma`, `202610150001_master_hierarchy`이며 그 이전 네 문자열 CadLocation 표와 그림은 migration 전 역사 기록이다.

## GitHub #6 — 0.19.0 추가 schema

- `CadFileVersion.drawingName` → `drawing_name TEXT NULL`, 기본 NULL. 사용자 지정 이름만 저장하며 NULL은 위치 및 실제 version으로 만든 기본 표시 이름을 뜻한다. 기존 행은 NULL로 유지하고 원본 파일명 등 모든 기존 Column을 수정하지 않는다.
- additive migration `202609110003_drawing_name`에서 nullable column을 추가한다. 이름 정규화/255 UTF-16 길이/제어문자 검증은 Domain 경로에서 강제한다. 이름은 경로·Unique key가 아니며 기존 FK·Index·Current/순번 제약을 보존한다.
- 기존 등록 후 metadata 편집 제외 계약은 유지한다. migration 파일과 실제 검증 결과는 구현·QA 후 갱신한다.

## 관계

### Unit DELETE 추가 schema — 0.17.0 도입 / 0.17.1 제약 보완

아래 정의가 이 Unit의 schema 기준이다. `202609110001_delete_password`는 필드·삭제 작업과 기존 순번 초기화를, `202609110002_delete_invariants`는 삭제 locator Unique와 양수 순번 trigger를 추가한다. 실제 적용·검증 결과는 TestReport를 기준으로 한다. 아래 기존 표/그림은 0.16.0 상태이며 새로운 Column/Table은 이 절과 함께 읽는다.

| 모델 / Column | 타입·Null·초기값 | 계약 |
| --- | --- | --- |
| CadFileVersion.delete_password_hash (`deletePasswordHash`) | TEXT/String?, migration 기존 행은 NULL | 서버 전용 scrypt encoding. SQL default 비밀번호/hash 없음. backfill 완료 후 모든 활성 행 non-null; 신규 INSERT의 NULL/빈 hash는 DB trigger로 거부하며 기존 hash를 NULL/빈 값으로 돌리는 UPDATE도 거부. 공개 DTO에서 제외. |
| CadLocation.next_version (`nextVersion`) | INTEGER/Int NOT NULL DEFAULT 1, INSERT/UPDATE trigger로 > 0 강제 | migration에서 Location별 기존 MAX(version)+1로 채움. 등록 transaction이 이 값을 순번으로 사용하고 1 증가시킴. 삭제 시 감소하지 않음. 기존 `(location_id,version)` Unique 유지. |
| CadDeletionJob.id | TEXT/String PK | 삭제 작업 자체의 랜덤 UUID. 삭제된 Version을 참조하는 FK는 두지 않음. |
| CadDeletionJob.version_id (`versionId`) | TEXT/String NOT NULL | 삭제 승인된 Version UUID. 대상 행 삭제 뒤에도 작업 식별을 위해 보존한다. |
| CadDeletionJob.storage_path (`storagePath`) | TEXT/String NOT NULL UNIQUE | 승인된 삭제 대상 locator. 원본 정리 성공 때까지 보존하며 새 경로를 입력받지 않음. |
| CadDeletionJob.created_at (`createdAt`) | DATETIME/DateTime NOT NULL DEFAULT now | 삭제 승인 transaction 시각. 완료 job은 제거하고 원본 이름·설명·비밀번호/hash를 job에 복사하지 않음. |

삭제 transaction은 Current가 대상을 가리킬 때 먼저 NULL로 해제하고 job INSERT→Version DELETE를 같은 transaction에서 수행한다. 기존 Current 소속 복합 FK, Location 소유 FK 및 Unique/CHECK를 그대로 유지한다. 마지막 Version이 삭제된 Location은 유지되며 nextVersion으로 과거 순번을 재사용하지 않는다.

Migration/backfill은 쓰기 중지·백업 후 진행한다. additive SQL로 위 필드/Table/trigger와 nextVersion 초기화→Node backfill이 NULL hash 행 각각에 독립 랜덤 salt로 `1234` hash 계산→조건부 NULL 행 UPDATE→NULL 수 0/foreign_key_check/기존 Current·행 수·원본 식별 일치 검증 순서다. hash 계산은 짧은 DB 쓰기 transaction 밖에서 순차 처리한다. 중단 후 재실행은 남은 NULL만 처리한다. 이미 hash가 있는 신규/기존 행은 변경하지 않는다. 실행 중인 0.16.0 앱과 병행하지 않으며 migration 후 구버전만 재시작하지 않는다.

backfill은 `db:deploy`의 완료 조건으로 묶고 실패 시 Docker/start readiness를 열지 않는다. SQL만 적용하는 별도 경로를 사용했다면 backfill 검증 전 서비스 재개를 금지한다. 신규 INSERT trigger는 실수로 구버전이 hash 없이 작성하는 것을 차단한다. hash encoding의 유효성은 server 검증과 시험으로 확인하며 SQL이 scrypt 계산을 검증하지는 않는다.

```mermaid
erDiagram
    CadLocation ||--o{ CadFileVersion : owns
    CadLocation o|--o| CadFileVersion : current_pointer
    CadLocation {
        TEXT id PK
        TEXT business_unit UK
        TEXT site UK
        TEXT building UK
        TEXT floor UK
        TEXT current_version_id FK
        DATETIME created_at
        DATETIME updated_at
    }
    CadFileVersion {
        TEXT id PK
        TEXT location_id FK
        INTEGER version
        TEXT original_filename
        TEXT description
        TEXT file_format
        INTEGER file_size
        TEXT sha256
        TEXT storage_path
        TEXT registered_at
        DATETIME created_at
        DATETIME updated_at
    }
```

그림의 네 위치 UK는 각각 Unique가 아니라 **네 Column 조합 Unique**이다. 소유 관계는 1:N, Current는 Location당 선택적 단일 참조이고 해당 Location이 소유한 Version만 가리킨다. 독립 `is_current` Column은 만들지 않고 API/UI에서 pointer 비교로 계산한다.

## CadLocation

| Column | SQLite / Prisma 타입 | Null | Default/생성 주체 | 제약·의미 |
| --- | --- | --- | --- | --- |
| id | TEXT / String | 불가 | Service UUID | PK; 문자열 위치 결합값 아님 |
| business_unit | TEXT / String | 불가 | 없음 | 정규화된 사업부, 1–100자 |
| site | TEXT / String | 불가 | 없음 | 사업장, 1–100자 |
| building | TEXT / String | 불가 | 없음 | 동, 1–100자 |
| floor | TEXT / String | 불가 | 없음 | 층, 1–100자 |
| current_version_id | TEXT / String? | 허용 | NULL | 아래 복합 FK; 최대 하나 Current |
| created_at | DATETIME / DateTime | 불가 | UTC now | 생성 시각, migration에서 CURRENT_TIMESTAMP 기본값 |
| updated_at | DATETIME / DateTime | 불가 | 생성 시 UTC now | Current 변경 등 update 시 Service가 UTC 갱신; DB가 자동 갱신한다고 가정하지 않음 |

Unique: `(business_unit, site, building, floor)` BINARY 비교. 저장 전 trim+NFC, 대소문자/내부 공백 유지. DB CHECK로 길이/빈 문자열/앞뒤 ASCII 공백을 제한하고 NFC는 Service와 import 경로에서 보장한다. 임의 SQL이 Unicode 정규화를 수행한다고 가정하지 않는다.

## CadFileVersion

| Column | SQLite / Prisma 타입 | Null | Default/생성 주체 | 제약·의미 |
| --- | --- | --- | --- | --- |
| id | TEXT / String | 불가 | Service UUID | PK |
| location_id | TEXT / String | 불가 | Service | FK→CadLocation.id |
| version | INTEGER / Int | 불가 | transaction 내 다음 정수 | CHECK > 0; Location별 1부터; UI는 V 접두어 |
| original_filename | TEXT / String | 불가 | Upload basename metadata | 1–255자; 경로로 사용 금지, 제어문자 거부 |
| description | TEXT / String | 불가 | `''` | Version별 도면 설명. 생략 시 빈 문자열, 최대 2,000 UTF-16 code units, 저장 전 trim/NFC·개행 정규화 |
| file_format | TEXT / String | 불가 | 검증된 확장자 | CHECK IN ('DXF','DWG'); enum 사용 여부는 ORM 검증 후 |
| file_size | INTEGER / Int | 불가 | 실제 받은 bytes | CHECK > 0; 기본 상한은 앱 설정, Prisma Int 범위 내 설정만 허용 |
| sha256 | TEXT / String | 불가 | server streaming hash | 소문자 hex 64자 CHECK, Unique 아님 |
| storage_path | TEXT / String | 불가 | Storage key 생성 | Unique; local 상대 키 또는 S3 locator. 아래 Unit S3 정의 참조, client 경로 아님 |
| registered_at | TEXT / String | 불가 | 사용자 날짜, 기본 서울 오늘 | YYYY-MM-DD 달력 날짜; Service에서 실제 유효 날짜 검증 |
| created_at | DATETIME / DateTime | 불가 | UTC now | 생성 시각, migration CURRENT_TIMESTAMP 기본값 |
| updated_at | DATETIME / DateTime | 불가 | 생성 시 UTC now | update 경로에서 명시적으로 갱신 |

파일 bytes, location_id, version, storage_path는 등록 후 변경 불가인 서비스 계약이다. 파일 삭제는 초기 범위에서 제외했으나 Unit DELETE로 선택 Version 삭제를 추가한다. 버전 이동/metadata 편집 API는 범위에 없다. registered_at은 시각과 혼동하지 않도록 날짜 문자열로 유지한다.

## FK·Unique·Index

| 종류 / 이름(개념명 포함) | Column / 대상 | 목적 |
| --- | --- | --- |
| PK Location / Version | 각 id | 내부 식별자 |
| uq_location_key | Location(사업부,사업장,동,층) | 위치 중복 차단 |
| uq_location_current_owner | Location(id,current_version_id) | Prisma의 선택적 1:1 Current relation 표현 |
| uq_version_sequence | Version(location_id, version) | 동시 순번 중복 차단 |
| uq_version_owner_id | Version(location_id, id) | Current 복합 FK의 parent candidate key |
| uq_storage_path | Version(storage_path) | 파일 overwrite 방지 |
| fk_version_location | Version.location_id→Location.id | 존재하는 Location만 참조, DELETE/UPDATE NO ACTION |
| fk_location_current_owner | Location(id,current_version_id)→Version(location_id,id) | Current 소속 일치, DELETE/UPDATE NO ACTION |
| ix_location_current | Location(current_version_id) | pointer 역조회 |
| ix_version_registered | Version(registered_at DESC, created_at DESC, id) | 기본 목록 정렬 |
| ix_version_format_registered | Version(file_format, registered_at DESC) | 형식 filter |
| ix_version_sha256 | Version(sha256) | 중복 식별 |

위치별 Version 조회는 uq_version_sequence prefix를 활용한다. 임의 조합 위치 filter나 filename substring은 작은 SQLite P.O.C.의 scan을 허용하며 근거 없이 모든 column에 index를 추가하지 않는다.

Current FK 설계의 핵심 SQL 형태는 다음과 같다. **문서 예시이며 실행된 Migration이 아니다.**

```sql
-- CadFileVersion 제약
UNIQUE (location_id, version),
UNIQUE (location_id, id),
FOREIGN KEY (location_id) REFERENCES CadLocation(id)
  ON DELETE NO ACTION ON UPDATE NO ACTION

-- CadLocation 제약
UNIQUE (business_unit, site, building, floor),
FOREIGN KEY (id, current_version_id)
  REFERENCES CadFileVersion(location_id, id)
  ON DELETE NO ACTION ON UPDATE NO ACTION
```

`current_version_id`가 NULL이면 Current가 없는 상태를 허용한다. 값이 있으면 복합 FK가 자기 Location의 Version만 허용한다. 모든 DB connection에서 `PRAGMA foreign_keys=ON`을 확인해야 한다. 복합 FK는 parent key Unique가 필요하며 NULL을 포함하는 child key의 동작은 SQLite 공식 문서에 따른다. [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html)

## Transaction과 동시성

1. 신규 Location은 Current=NULL로 생성한다.
2. Version 생성 transaction에서 해당 Location의 MAX(version)+1을 계산하고 insert한다. Unique와 SQLite 쓰기 직렬화를 함께 사용하고 busy/충돌은 명시적 오류로 처리하고 commit 불확실 작업은 자동 재실행하지 않는다. transaction 밖에서 순번을 미리 확정하지 않는다.
3. `makeCurrent=true`이면 같은 transaction에서 Location.current_version_id를 새 Version ID로 바꾼다. false이면 pointer를 건드리지 않는다. 기존 Version flag를 별도로 update하지 않는다.
4. 기존 Version Current 변경은 Location/Version 존재·소속을 확인하고 단일 transaction으로 pointer와 updated_at을 갱신한다. 동일 ID 재요청은 멱등이다. 동시 유효 요청은 마지막 commit이 Current가 된다.
5. 예외 시 전체 rollback한다. FK는 API를 우회한 직접 SQL에서도 소속 위반을 거부해야 한다. 물리 파일과 DB의 실패 보상은 Architecture를 따른다.

Current 0개 허용, 다른 Location의 Current 독립, 잘못된 소속/존재하지 않는 Version/Current가 가리키는 Version 삭제 차단, 경쟁·rollback을 자동 시험한다.

## Migration 초기 계획 (당시 기록)

- Unit 0B에서 Prisma/SQLite driver 연결·정확한 버전·설정 로더를 검증하고 Unit 1에서 두 Table과 constraint를 구현한다.
- Prisma relation에서 소유 FK와 복합 Current FK의 겹치는 scalar 및 순환 relation을 검증한다. 선언만으로 불충분한 CHECK/복합 FK는 **검토 가능한 migration SQL**로 유지한다. Schema 대조 테스트로 누락을 방지한다.
- migration은 `src/prisma/migrations/`에 보관한다. 신규/기존 임시 DB 모두에 적용하고 `foreign_key_check`, table/index/FK introspection, 관련 DB 테스트로 Database.md와 대조한다.
- 기존 데이터를 변경할 때 사전 백업과 영향 분석을 한다. 운영에서는 검토된 migrate deploy 계열만 사용하고 reset/db push를 자동 실행하지 않는다. 실행 가능한 명령은 Unit 0B/1 완료 때 Operation에 확정한다.
- Prisma+SQLite에서 계획 제약을 표현/유지하지 못하면 실패 근거를 기록한다. ORM/DBMS 대체처럼 구조 영향이 큰 변경은 사용자와 확인한다.
- SQLite WAL/busy timeout은 driver 실제 지원과 concurrency 시험 후 설정하고 값을 문서화한다. 아직 활성화됐다고 보고하지 않는다.

## Schema 변경 이력

## 0.25.0 기준정보 계층 (schema 단일 기준)

`BusinessUnit(id, name, active) → Product(id, business_unit_id, name, is_unclassified, active) → CadSite(id, product_id, name, kind, active) → Building(id, site_id, name, active) → CadLocation(id, building_id, name, active)` 순서다. 각 이름은 1~100자 trim/NFC이며 부모+이름 Unique다. `CadSite.kind`는 `SITE|LEGAL_ENTITY`, 각 사업부의 `is_unclassified=1` Product는 최대 하나다. 일반 편집은 ID, 부모 FK, 미분류 표식을 바꾸지 않으며 미분류 제품 이름도 변경하지 않는다.

| Table | 핵심 필드와 기본값 | Unique / FK / 시각 |
| --- | --- | --- |
| BusinessUnit | `id TEXT PK`, `name TEXT`, `active INTEGER DEFAULT 1` | `name` Unique; `created_at`, `updated_at`은 `CURRENT_TIMESTAMP` 기본 |
| Product | `business_unit_id`, `name`, `is_unclassified INTEGER DEFAULT 0`, `active DEFAULT 1` | `(business_unit_id,name)` Unique, BU FK; `is_unclassified=1`은 사업부별 partial Unique; 두 timestamp 기본 |
| CadSite | `product_id`, `name`, `kind TEXT DEFAULT 'SITE'`, `active DEFAULT 1` | `(product_id,name)` Unique, Product FK, kind CHECK; 두 timestamp 기본 |
| Building | `site_id`, `name`, `active DEFAULT 1` | `(site_id,name)` Unique, CadSite FK; 두 timestamp 기본 |
| CadLocation | `building_id`, `name`, `active DEFAULT 1`, `current_version_id NULL`, `next_version DEFAULT 1` | `(building_id,name)` Unique, Building FK, Current 소유 복합 FK; 기존 `created_at`,`updated_at` 보존 |

CadLocation은 기존 UUID를 층 ID로 그대로 사용한다. `current_version_id`, `next_version`, timestamps와 CadFileVersion의 모든 열은 보존한다. `(location_id, version)` 및 `(location_id, id)` Unique와 `(CadLocation.id,current_version_id) → CadFileVersion(location_id,id)` 복합 FK가 층별 Current 소속을 강제한다. 신규 등록은 다섯 ID가 실제 같은 활성 chain인지 transaction 안에서 재검증한다.

`202610150001_master_hierarchy`는 FK를 잠시 끄고 즉시 transaction을 시작해 master dedup/backfill과 CadLocation 재구성을 원자 작업으로 수행한다. 복사 행 수/NULL 연결 guard와 `pragma_foreign_key_check` guard가 실패하면 commit하지 않는다. migration 후 이전 문자열 열이 없으므로 0.24 이하 이미지는 새 schema에 연결할 수 없다.

| 날짜 | 단계 | 변경 | Migration / 검증 |
| --- | --- | --- | --- |
| 2026-09-07 | 설계 초안 | Location/Version, 소속 검증 복합 Current FK, 순번/파일 식별/날짜 정의 | 없음 / 구현 전 |
| 2026-09-07 | 0.2.0 / Unit 1 | 두 모델·복합 Current FK·Unique/Index·위치/크기/형식/hash CHECK 구현 | 202609070001_locations / DB integration 6개 통과 |
| 2026-09-09 | 0.14.0 / Unit DESC | Version 설명 TEXT NOT NULL DEFAULT '', 기존 행 호환, description literal 검색 | 202609090001_description / 관련 Unit·E2E 검증 |
| 2026-10-15 | 0.25.0 / Issue #24 | 5단계 master, Product 미분류 표식, Location 층 ID 보존·master FK 전환 | 202610150001_master_hierarchy / TC-MASTER-001~007 |

실제 연결은 adapter의 FK 활성화를 PRAGMA 시험으로 확인했다. 쓰기는 단일 프로세스 queue로 직렬화하며 SQLite busy timeout 5초, transaction timeout 10초이다. commit 결과가 불확실한 작업을 자동 재실행하지 않는다. WAL은 아직 활성화하지 않았다. 운영 범위는 단일 Node 프로세스이다.

Unit 9A(2026-09-08): 실제 schema.prisma/migration의 두 Table, Column/Null/Default, 복합 FK 및 Unique/Index와 문서를 재대조했다. Schema 변경 없음. TC-DB-007 회귀 통과. 초기 계획의 retry 문구를 실제 단일 프로세스 queue/명시적 실패 정책과 일치시켰다.

## Unit S3 저장 위치 계약 — 0.11.0

Table/Column/migration 변경 없음. 기존 `storage_path TEXT NOT NULL UNIQUE`에 backend가 포함된 불투명 locator를 저장한다.

| Backend | storage_path 형식 | 의미 |
| --- | --- | --- |
| local (기존) | `<location-id>/<version-id>/original.dxf` 또는 dwg | CAD_STORAGE_PATH 기준 상대 키 |
| s3 | `s3:<bucket>:cad/<object-uuid>/original.dxf` 또는 dwg | DB transaction 전에 만든 object ID, 해당 bucket의 object key |

S3 object UUID는 Version ID와 다르다. 업로드 전 location/version을 DB에 미리 생성하지 않는다. SHA-256은 수신된 원본 bytes 기준이고 locator는 중복 hash마다 별도로 생성된다. Version/Location/Current FK/Unique는 불변이다.

CAD_STORAGE_BACKEND는 새 업로드 위치만 결정한다. 조회는 각 행의 locator를 따라 local/S3를 선택하고 S3 bucket은 행에 기록된 값을 사용한다. endpoint/credential은 DB에 저장하지 않는다. 현재 한 개 S3 endpoint를 사용하므로 기존 S3 데이터가 있을 때 endpoint 변경만으로 다른 저장소로 이동할 수 없다.

이전 앱(0.10.0 이하)은 S3 locator를 해석하지 못한다. S3 업로드 이후 무조건 이전 바이너리로 rollback하지 말고 호환 앱 또는 일관된 DB/원본 백업 복구 절차를 사용한다. 자동 데이터 이동/locator 변경은 구현하지 않았다.

| 날짜 | 단계 | 변경 | Migration / 검증 |
| --- | --- | --- | --- |
| 2026-09-08 | 0.11.0 / Unit S3 | storage_path에 S3 locator 의미 추가; 기존 local 키 호환 | 추가 migration 없음 / TC-S3-001–003 |
