# Issue #109 — G7 운영 인증 활성화 설계 및 통제 배포·롤백 Runbook

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
