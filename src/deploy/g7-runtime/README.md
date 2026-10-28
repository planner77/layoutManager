# #153 G7 운영 Migration·Snapshot·복구 실행 경계

이 경로는 기본 OFF인 G7 기능을 위한 명시 실행 도구다. App 시작, HTTP 요청, 기존 자동 Migrator가 이 도구를 호출하지 않는다. 이번 구현·시험에서는 합성 `/tmp` 복제본만 사용한다. 실제 운영 DB/CAD/S3, Writer, Compose/Nginx/.env, OCI Registry·Tag 및 서비스 전환은 변경하지 않는다.

## 기존 Migration과의 관계

`prisma/migrations`의 기존 CAD Migration 여섯 개는 변경하지 않는다. `deploy/g7-s3/prisma/migrations`에는 그 여섯 SQL의 동일 복사본과 격리된 `202610260002_g7_operational_auth` 하나가 있다. 기존 자동 Migrator에 일곱 번째 SQL을 추가하지 않으므로 기존 설치의 재시작으로 Auth Schema가 자동 적용되지 않는다.

`server/g7-operational/runtime-migration.ts`는 실행 전에 여섯 또는 일곱 개 `_prisma_migrations` 성공 이력·SQL SHA256·완료/rollback 상태, 기준 SQL로 만든 전체 SQLite Schema, quick/FK check, Current의 Location 소속·Version 순서·원본 크기/SHA를 확인한다. 일부 테이블만 있는 DB나 임의 체크섬·미완료 이력은 차단한다. Audit가 있는 Snapshot은 전체 AuditEvent 행을 보존하며, 365일이 지난 행도 이 도구가 임의 삭제하지 않는다.

## 격리 Rehearsal CLI

애플리케이션 루트 `src/`에서 `npx tsx scripts/g7-runtime-rehearsal.ts`를 명시 실행한다. 다음 동작은 기존 `requireG7S3DisposableTarget`을 통과한 UID 소유 0700 `/tmp/cad-g7-s3-*`와 0600 `fixture.sqlite`·`s3-disposable.json`에만 허용된다.

| 동작 | 인자 | 실제 수행 |
| --- | --- | --- |
| Snapshot | `capture SNAP-... E-...` | SQLite writer lock 안에서 DB와 CAD·버전 S3 export 바이트를 한 Snapshot으로 보관 |
| Migration | `migrate` | 기존 격리 Prisma config로 실제 `migrate deploy`, 일곱 Schema 및 CAD/Audit 불변식 재검사 |
| 복원 | `restore SNAP-...` | 한 Snapshot의 DB·Local CAD·S3 export를 실제 복사/교체, 전체 바이트·Schema·Audit 재검사 |
| 이전 Schema 호환 | `verify-rollback` | 복원한 여섯 Schema에 기존 CAD migration history의 Prisma deploy를 실행하고 CAD 불변 확인 |

필수 환경은 `G7_S3_MIGRATION_TEST_ONLY=true`, `G7_S3_TEST_ROOT`, `G7_S3_TEST_DATABASE_URL`, 동일한 `DATABASE_URL`이며 Auth/CAD Write는 false다. 마커 형식은 `server/g7-operational/disposable-target.ts`가 단일 기준이다. 이 CLI는 임의 운영 경로를 격리 경로로 간주하지 않는다.

데이터는 DB 옆 `cad/<location UUID>/<DB version UUID>/original.ext`와 `s3-export/`에 둔다. S3를 쓰는 Version은 0600 `s3-exports.json` 배열에 정확 `storagePath`, 비어 있지 않은 `storageVersionId`, `s3-export/` 상대 `relativePath`를 갖는다. 실제 S3 object UUID와 DB Version UUID는 서로 다를 수 있다. 중복·누락·symlink·경로 탈출·SHA/크기 불일치와 미버전 S3 export는 차단된다.

이 도구는 S3 네트워크에 접속하거나 원격 Version을 인증하지 않는다. 원격 export/Version의 진위와 같은 Snapshot에 속한다는 현장 확인은 Owner가 내부에서 수행한다. 합성 export의 일치를 실제 S3 복구·RTO/RPO 또는 Registry 출처 증명으로 보고하지 않는다.

## 향후 승인된 운영 DB Migration 진입점

`apply-approved`는 격리 마커를 운영 권한으로 사용하지 않는다. `resolveG7RuntimeMigrationAuthority`가 별도 private Trust 파일과 Owner Ed25519 서명 승인 파일을 검증한다. HTTP Runtime Gate는 여전히 live 일곱 Schema가 필수이며, Migration 전용 검증기는 Schema 적용 전 승인만 검사한다. 기존 비활성 Preflight/R0의 `runtimeActivated=false`는 유지한다.

필수 조건은 다음과 같다.

- 현재 App package version과 Source/Capability/Schema·App/Migrator 및 rollback 네 Digest, 정확 DB·공개 Origin·Site Scope, SNAP/Change ID, 최대 24시간 UTC Window가 별도 Trust 및 Owner 서명에 일치한다.
- 승인 Scope에 `MIGRATION`이 명시되어 있다. Auth·CAD Write 스위치는 OFF다. Runtime 활성화 승인만으로 Migration 권한을 추론하지 않는다.
- `G7_RUNTIME_MIGRATION_ACK=APPLY_APPROVED_G7_SCHEMA`, `G7_RUNTIME_MIGRATION_EPOCH=E-...`, `CAD_STORAGE_PATH`가 정확하다. CAD root는 Trust·Owner 서명에 포함된 `cadStoragePath`와 일치해야 하며 DB 디렉터리와 별개다. 기존 `/data/db/cad.sqlite`와 `/data/cad` 구조를 유지한다. DB/CAD 디렉터리는 UID 소유·group/other 쓰기 금지이며 기존 CadStorage의 0755 디렉터리도 허용한다. Snapshot/CAD/export 파일은 0600이고 symlink·hardlink가 없다. Trust/승인 파일은 별도 0700 private 디렉터리에 둔다.
- DB에 있는 모든 Site가 승인 Scope에 포함된다. 공유 DB의 무관 Site를 단일 Site 승인으로 Migration하지 않는다.
- 현장에서는 실행 전에 모든 애플리케이션·배치·Local CAD·S3 writer가 멈춰 있음을 확인하고 보관한다. 이 도구가 Writer를 정지하지 않는다. SQLite `BEGIN EXCLUSIVE`는 DB writer를 직렬화하지만 다른 프로세스의 원격 S3 변경을 막는 증거가 아니다.

도구는 별도 실행 lock을 잡고 DB 옆 `g7-runtime-hold.json`을 원자 기록한 뒤 대상 SQLite exclusive transaction을 잡는다. 서명에 명시한 SNAP 디렉터리에 WAL을 포함한 일관 SQLite serialization과 실제 Local CAD/S3 export 바이트를 저장하고 파일·Snapshot 디렉터리를 fsync한다. 원본 파일을 다시 해시하여 capture 중 변화를 거부한다. 정확한 일곱 번째 SQL과 Prisma-compatible 성공 history row를 같은 SQLite transaction에서 적용하고 FK/Schema/CAD/Audit와 최신 승인 상태를 재확인한 뒤 commit한다. 이후 HOLD만 해제하며 Auth/CAD Write를 활성화하지 않는다.

실행 lock은 0600 regular single-link `g7-rehearsal.lock` 파일의 SQLite `BEGIN EXCLUSIVE`로 잡는다. 파일은 영속 inode로 남기고 정상 종료 시에도 삭제하지 않는다. 살아 있는 실행의 동시 진입은 즉시 차단하며, 새 구현의 프로세스가 SIGKILL되거나 호스트가 재시작되면 OS 잠금이 해제되어 같은 파일로 다시 진입한다. PID/mtime 추정이나 lock 파일 강제 삭제를 복구 수단으로 사용하지 않는다. HOLD는 private 임시 파일 fsync→rename→디렉터리 fsync로 원자 교체한다.

격리 Prisma `migrate deploy`는 별도 엔진 프로세스를 실행한다. 부모의 SQLite 실행 lock은 자식에게 승계되지 않으므로, 격리 복원 전 기존 Writer Zero 조건에는 남아 있는 Prisma/엔진도 완전히 종료·완료했는지 확인하는 작업이 포함된다. 서명된 `apply-approved` 경로와 동기 Restore에는 별도 엔진이 없다. SIGKILL 합성 시험은 이 직접 경로의 복구를 검증하며 모든 자식 프로세스의 자동 정지를 증명하지 않는다.

이전 wx 구현의 `G7-DISPOSABLE-LOCK` 문자열 파일은 소유 PID/수명 정보가 없어 새 코드도 자동 삭제하거나 만료로 추정하지 않는다. 이 구형 artifact를 만났다면 업그레이드 유지보수 중 구버전 도구·Prisma/Writer가 모두 정지한 상태를 확인하고 실패 상태/파일을 보존한 뒤 기존 marker를 별도로 퇴역시킨다. 이는 구버전 lock 형식 전환 절차이며 새 lifetime lock의 정상 재개에는 필요하지 않다.

여섯 SQL은 기존 Prisma에서 적용하며, 이 운영 진입점은 **일곱 번째 SQL만 직접 원자 적용**한다. 이력에는 원래 SQL의 SHA256, UUID, UTC 시작/완료, applied_steps_count=1이 들어간다. 합성 시험은 이 이력과 실제 Schema를 확인한다. 격리 진입점은 별도로 실제 Prisma engine 일곱 Migration 및 재실행을 시험한다.

운영 실행 중 오류는 Schema/history transaction을 rollback하고 HOLD와 원본 Snapshot을 보존한다. 재실행은 기본 차단한다. 원인이 제거된 뒤 같은 유효 승인·SNAP/Epoch에서 `G7_RUNTIME_MIGRATION_ACK=RESUME_APPROVED_G7_SCHEMA`로 명시 재개할 수 있다. 이 경우 보관 Snapshot의 DB/CAD/export와 현재 모든 CAD 행·바이트가 일치하고 Schema가 정확히 여섯 또는 일곱이며, 새 Audit가 없는 전환 직후 상태인지 확인한다. 완성 Snapshot이 생기기 전에 중단됐다면 원자 HOLD의 approvalId/SNAP/Epoch가 같은 유효 승인과 일치하고 현재 DB가 정확한 여섯 Schema일 때만 보존된 시도 identity로 Snapshot capture를 다시 수행한다. 이전 미완성 임시 Snapshot은 복구 근거로 사용하지 않는다. 완성 Snapshot이 없는데 identity가 없거나 다르거나 DB가 이미 일곱 Schema라면 차단한다. 상태가 불확실하거나 데이터가 달라졌으면 재개하지 않고 복구 절차로 전환한다.

## 운영 복원·서비스 Rollback 절차

운영 복원은 이번에 실행하지 않는다. 다음 단계는 현장 Owner의 실제 전환 범위에서 수행한다.

1. Runtime recovery hold를 유지하고 신규 인증·쓰기 요청을 차단한다. Writer와 서비스가 완전히 정지한 상태를 내부 확인한다.
2. 남아 있는 실패 DB/WAL·CAD·S3 상태와 Audit는 별도 보존한다. Snapshot 시점 이후 성공한 변경이 있으면 그 변경과 감사 이력을 유실시키는 단순 overwrite를 하지 않고 복구 계획을 다시 결정한다.
3. 동일 SNAP/Epoch의 DB·Local CAD·버전 S3 export를 별도 격리 대상에 `restore`하여 검증한다. DB SHA·모든 원본 바이트, FK, Version/Current, Audit 보존과 이전 여섯 Schema를 확인한다.
4. 실제 S3 복구는 Snapshot에 기록한 object Version을 정확히 복원/조회하고 source SHA와 비교한다. 로컬 export 복원 성공을 원격 S3 복구 성공으로 대체하지 않는다.
5. 이전의 불변 App/Migrator OCI pair를 실제로 실행하여 API·native SQLite·기존 익명 GET·Viewer·쓰기/삭제암호 호환을 검증한다. `verify-rollback`의 여섯 Schema 성공은 실제 이전 OCI 실행 성공이 아니다.
6. 검증된 동일 Snapshot 세트를 실제 서비스 저장소로 전환하고, 이전 이미지로 제한된 상태에서 시작한다. 인프라 설정·서비스 전환은 이번 CLI가 자동 수행하지 않는다. 전환 후 검증이 끝나기 전에는 HOLD를 해제하거나 새 Runtime 승인을 재사용하지 않는다.

일곱 Schema DB에 이전 Migrator/App을 무작정 연결하지 않는다. 이전 Schema의 동일 Snapshot을 복원한 뒤 이전 pair를 사용한다. Schema down migration·Audit 삭제·원본 CAD 자동 정리는 제공하지 않는다.

## 시험과 증거 수준

`tests/integration/g7-runtime-migration.test.ts`는 합성 DB·Local CAD·버전 S3 export에 대해 실제 Prisma 일곱 적용·재실행, 직접 원자 운영 진입점, 중단 fault/HOLD/재개, 같은 Snapshot의 실제 파일/DB 복원, Audit 행 보존, 이전 여섯 Schema deploy, 손상·체크섬·경로·서명 Scope 거부를 시험한다. 출력은 상태·건수만이며 내부 ID/경로/원본/비밀번호/키를 출력하지 않는다. 실제 OCI 이전 pair 실행·현장 Writer Zero·실 원격 S3·운영 RTO/RPO·서비스 전환은 별도 `NOT TESTED`다.
