# #209 — 정상 Greenfield 설치의 등록 릴리스 업그레이드 (0.58.0 후보)

이 절은 아래 #109의 **릴리스 변경 차단 정책만** 대체합니다. 최초 설치는 여전히 빈 볼륨을 사용합니다. 기존 정상 Greenfield 업그레이드는 설치 ID와 **같은 볼륨**을 유지하며 마커 없는 비빈 볼륨/레거시 6→7/HOLD 이관, S3, 과거 수동 서명 Expert 설치는 자동 지원하지 않습니다.0.56→0.57 논리 identity 회귀는 새 엔진의 합성 시험이며 이미 게시된0.57 이미지를 수정하지 않습니다. 실제 배포에는 새 엔진이 포함된0.58.0 이후 검증된 이미지 쌍이 필요합니다.

## 지원 선언과 준비

`server/g7-operational/greenfield-upgrade-registry.ts`가 쓰기 호환성 정본입니다. 최초 등록은0.56.0→0.57.0→0.58.0의 동일 zones baseline/data/runtime contract입니다. 전체 edge가 연결될 때만 중간 릴리스 skip을 허용합니다. Schema ID/SemVer 또는 runtime의 과거 Schema 읽기 지원만으로 승인하지 않습니다. 현재 실제 업무 Schema 변경 edge는 없습니다. 향후 Schema 변경은 검토된 forward SQL+SHA·정확 plan 승인·pre/post/복구 시험을 registry에 등록해야 합니다. 외부 SQL/JSON/강제 채택 플래그는 지원하지 않습니다.

1. 별도 운영 변경 승인을 받고 App 외 host 작업·백그라운드 CAD writer를 모두 정지합니다. helper는 같은 볼륨을 사용하는 **실행 중인 Docker 컨테이너**도 검사합니다. Docker socket/호스트 권한을 가진 다른 관리자가 유지보수 중 서비스를 다시 켜지 않도록 협조합니다.
2. 기존 `.env`와 **CAD_DATA_VOLUME_NAME을 보존**합니다. 목표 App/Migrator 쌍을 신뢰하는 레지스트리에서 미리 pull하고 버전·Source·Digest/architecture를 검증합니다. `GHCR_IMAGE`, `GHCR_MIGRATION_IMAGE`, `G7_RELEASE_SOURCE_COMMIT`을 목표 release 값으로 설정합니다. Source는 두 이미지 `org.opencontainers.image.revision`과 같은40자리 소문자 hex여야 합니다. 기존 manifest가 검증 가능한 version 태그 쌍이고 source가 빈 문자열이면 지원된 과거 설치로 검증합니다. source가 없는 digest 설치는 릴리스 출처를 확인할 수 없어 차단하며 marker를 편집해 우회하지 않습니다.
3. Linux/amd64 이미지와 Python3.9+/Docker Compose v2를 사용합니다. helper는 실제 local image inspect의 version/revision/source/role을 확인하고 **고정 local Image ID**로 migrator를 실행합니다. 이 검사는 서명된 OCI provenance를 대신하지 않습니다. 임의로 재태깅한 이미지·label 없는 과거 target은 차단합니다.
4. 저장소의 기존 백업 정책에 따라 별도 안전 매체에도 DB/CAD를 보관합니다. 자동 복구 세트는 source 볼륨 내부의 private 디렉터리이며 볼륨 자체 손실/디스크 고장 대비 백업이 아닙니다. DB 파일을 열린 상태에서 `docker cp`하는 것을 일관 백업으로 간주하지 않습니다. 복구 세트를 Git/로그/CI artifact로 반출하지 않습니다.

## 검사·계획·적용

서버 호스트에서 저장소 Root 기준으로 실행합니다. helper는 `.env`를 shell source하지 않고 Compose 결과를 메모리에서만 읽으며 Git credential을 컨테이너에 전달하지 않습니다.

```sh
python3 src/scripts/g7-upgrade.py .env preflight
python3 src/scripts/g7-upgrade.py .env plan
python3 src/scripts/g7-upgrade.py .env auto
```

`preflight/plan/status`는 source를 갱신하지 않습니다. `auto`는 App을 정지하고 다른 실행 writer0을 확인한 뒤 동일 Schema/계약 호환 upgrade만 실행합니다. 새 recovery set의 SQLite backup(WAL 반영)·CAD/Scene 원본/manifest와 hash·DB/FK/Current/Version 정합성을 확인한 후 journal과 manifest를 갱신합니다. SQL/trigger/checksum을 덮어써서 통과시키지 않습니다. 같은 릴리스 재시작은 설치 정보·사용자·setup code를 재발급하지 않습니다.

향후 등록된 Schema 변경은 `plan`에서 받은 정확한 `planId` SHA를 운영자가 검토·승인합니다. 데이터/경로/계획이 달라지면 승인을 다시 받아야 합니다.

```sh
python3 src/scripts/g7-upgrade.py .env apply --approve-plan <64자리-planId>
python3 src/scripts/g7-upgrade.py .env status
```

완료해도 helper는 App을 **정지 상태로 유지**합니다. journal 완료·backup 검증과 `verifiedAppImageId`를 확인하고, `docker image inspect <목표-App-ref> --format '{{.Id}}'`가 그 ID와 같은지 확인한 후 기동합니다. 태그가 변경되었다면 다시 검사합니다.

```sh
docker compose --env-file .env -f src/docker-compose.yml up -d --no-deps app
docker compose --env-file .env -f src/docker-compose.yml ps
docker compose --env-file .env -f src/docker-compose.yml logs --tail 80 migrate
```

`--no-deps`는 **이미 검증하여 성공 완료한 helper 이후에만** 사용합니다. 통상 `up`의 migrate `service_completed_successfully` 차단은 그대로 유지합니다. helper는 one-off `docker run`을 사용하므로 실행 결과는 명령의 정형 출력에서 확인하고, 일반 Compose `auto` 실패 원인은 `logs migrate`에서 확인합니다. Health200뿐 아니라 기존 사용자 로그인·Site Grant/Reader 차단·조회·새 쓰기·Current·원본 SHA·Scene/메모/외곽선/구역 연결과 Audit를 수용합니다. 실제 업무 데이터 대조는 사내에서만 수행합니다.

## 실패·상태·격리 복원

`code/stage/retryable/nextAction`은 비민감 진단입니다. `PAIR_MISMATCH/UNSUPPORTED_PATH/SCHEMA_INCOMPATIBLE`은 이미지·지원 선언을, `BACKUP_REQUIRED`는 공간/권한/백업 상태를 확인합니다. `LOCKED/RESTORE_REQUIRED/POSTCHECK_FAILED`에서는 App을 계속 정지합니다. 자동 lock 삭제·manifest 편집·재설치·볼륨 초기화·역방향 SQL을 수행하지 않습니다. 아직 SQL 전의 명확한 사전 실패와 commit 여부가 모호한 중단은 journal로 구별합니다. 정상 SQL 트랜잭션 rollback과 프로세스 강제 종료 시험은 서로 다른 증거입니다.

검증한 backup ID를 사용해 **존재하지 않는 새 named volume**에 복원합니다. backup 전 강제 종료로 ID가 없다면 자동 복원을 실행하지 말고 기존 별도 안전 백업/격리 조사와 운영 승인이 확보될 때까지 BLOCKED를 유지합니다. 현재 볼륨과 기존 복구 볼륨은 덮어쓰지 않습니다.

```sh
python3 src/scripts/g7-upgrade.py .env restore --backup <backup-UUID> --restore-volume <새-격리-볼륨명>
```

source는 readonly, 새 대상은 UID10001/private db+cad로 준비합니다. DB·원본·기존 manifest를 함께 복원하고 무결성을 재검사합니다. 복원본은 backup에 기록된 **이전 릴리스 이미지 쌍**과 contract가 맞아야 합니다. 별도 포트·격리 프로젝트에서 Health/로그인/인가·업무 데이터를 검증한 뒤 명시 운영 승인으로만 서비스 대상을 전환합니다. 현재 live 볼륨은 보존하고 실패 복구 자료도 삭제하지 않습니다. restore는 이전 Snapshot의 명시적 복구이며 일반 downgrade나 실패한 live DB의 강제 채택이 아닙니다.

실제 시험 범위/실패·미실행은 [TestReport](../../../out/TestReport.md)/[FailureLedger](../../../out/FailureLedger.md) #209를 따릅니다. 코드·합성 시험·PR CI 시작은 GHCR 게시나 운영 업그레이드 수용과 다릅니다.

---

# Issue #109 — 표준 Docker Compose G7 신규 설치 Runbook (0.44.2 PR 후보)

> **최신 표준 설치 경로:** 이 문서의 아래 절차가 이전 #153 수동 서명·Site Seed / 포트 3001 예시를 **대체**합니다. 이 하단의 #153 내용은 역사적 Expert 설치 경로로만 남기며 기본 명령에 적용하지 않습니다. 실제 운영 이미지 게시·현장 배포·2PC 수용은 별도 승인/검증이 필요합니다.

## 준비 조건

1. **새 이름의 완전히 비어 있는 Docker named volume**을 준비합니다. 구 `cad-layout-viewer-data`와 구 `cad-layout-viewer-greenfield-data` 및 실운영 CAD/SQLite/HOLD는 지정하지 않습니다. 빈 볼륨만 설치하므로 기존 DB·CAD·Audit는 이관하지 않습니다. 기존 자료를 지우지 않으며, 별도로 보관된 DXF만 새 시스템에서 수동 등록합니다.
2. 운영자가 검증한 동 버전 **App/Migrator 이미지 쌍**을 준비합니다. 이미지 태그를 쓰는 경우 `0.44.2`와 `0.44.2-migrate`처럼 앱 패키지 버전과 동일해야 합니다. 가능하면 레지스트리에서 실제 두 OCI Digest를 조회해 **각각** `@sha256:...` 참조로 고정합니다. 런타임은 이미지 문자열과 앱 버전의 정합성을 확인하지만 컨테이너의 실제 OCI provenance를 독립적으로 증명하지는 못합니다.
3. 저장소 루트에 서버 전용 `.env` 파일을 두고 다음 항목을 설정합니다. 정식 이미지/사내 origin/볼륨명은 각 운영 환경 값으로 교체하세요.

```env
GHCR_IMAGE=ghcr.io/planner77/layoutmanager:0.44.2
GHCR_MIGRATION_IMAGE=ghcr.io/planner77/layoutmanager:0.44.2-migrate
CAD_DATA_VOLUME_NAME=cad-layout-viewer-my-new-site-20261030
CAD_HOST_PORT=3000
G7_RUNTIME_ORIGIN=http://192.0.2.10:3000
G7_RUNTIME_ALLOW_HTTP=true
```

`192.0.2.10`은 문서용 예시 IP이며 실 주소가 아닙니다. 내부 LAN에서 HTTP를 써야 한다면 방화벽/접속 제어로 신뢰 IP만 허용하고 자격증명을 외부 네트워크에 노출하지 않습니다. HTTPS 사용 시 `G7_RUNTIME_ALLOW_HTTP=false`로 설정하고 공개 URL과 리버스 프록시 Host가 정확히 일치해야 합니다. 실제 비밀번호/일회용 코드는 `.env`에 넣지 않습니다. 기존 환경에서 3000 포트가 점유되어 있으면 **기존 컨테이너를 삭제하지 말고** 기동 전 정책을 별도 확인합니다.

## 1. 설치 및 시작 (한 명령)

```sh
docker compose --env-file .env -f src/docker-compose.yml up -d --pull always
```

One-shot migrator가 `/data/db/cad.sqlite`와 `/data/cad`의 신규 상태를 확인한 후 G7 최종 Schema·한 개의 Greenfield baseline·삭제 비밀번호 보호 트리거를 설치하고 /data/db/first-admin.code를 생성합니다. 마지막에 배포 identity `/data/db/g7-install.json`을 기록합니다. App은 migrator **성공 이후에만** 포트 3000으로 시작합니다. `migrate`가 실패하면 웹 App을 무리하게 시작하지 말고 원인을 확인하세요.

```sh
docker compose --env-file .env -f src/docker-compose.yml ps
docker compose --env-file .env -f src/docker-compose.yml logs --tail 80 migrate
```

성공 여부는 상태/Health/실제 사용자 및 권한 시험으로 확인해야 합니다. 기존 데이터가 들어 있는 볼륨은 **자동 정리/업그레이드하지 않고 차단**합니다. 재시작해도 기존 설치 ID·DB·CAD·감사 데이터는 초기화하지 않습니다. 릴리스 이미지 버전/Tag/Digest가 바뀌면 기존 marker와 달라 차단되며, 자동 무승인 인플레이스 업그레이드를 수행하지 않습니다.

## 2. 최초 관리자 설정 (일회성)

브라우저에서 `http://[실 운영 IP]:3000/`으로 접속하면 관리자 0건인 경우 `/g7-runtime/setup`으로 안내됩니다. 아래 명령을 **Docker 호스트의 안전한 로컬 터미널**에서만 실행하여 최초 관리자 코드를 확인합니다.

```sh
docker compose --env-file .env -f src/docker-compose.yml exec -T app cat /data/db/first-admin.code
```

코드는 256-bit 난수, UID10001 소유 0600 파일, 1시간 유효입니다. 화면에 코드/최초 로그인 이름/초기 비밀번호를 입력합니다. 브라우저는 코드 자체를 발급/조회할 수 없으며 HTTP 요청에는 Host·Origin·CSRF cookie/헤더와 실패 횟수 제한을 적용합니다. DB에서 User+Admin Role+Audit가 원자적으로 생성되면 **해당 화면/코드는 영구 무효**이며 초기 Admin은 어떤 Site에도 자동 할당되지 않습니다.

코드가 만료/유실되었고 **아직 User가 0명**이면 호스트 운영자가 한 번 명시 실행합니다. 이 명령은 DB·Admin을 삭제/재생성하지 않습니다.

```sh
docker compose --env-file .env -f src/docker-compose.yml run --rm migrate setup-renew
```

코드와 임시 비밀번호는 로그/Issues/메신저/스크린샷에 게시하지 않습니다. 관리자 생성 후 코드 파일은 계정 추가에 사용할 수 없습니다. 코드가 유출되었거나 이미 사용자/감사가 존재하는 경우 설치를 리셋하는 대신 사고 대응 절차를 따릅니다.

## 3. 계정·Site/도면 활성화

`/g7-runtime`의 '초기 비밀번호 변경'에서 임시 암호를 변경한 뒤 새 암호로 로그인합니다. Admin은 `/masters`에서 **사업부 → 제품 → 사업장/법인**을 생성합니다. 이어 `/g7-runtime` 사용자/권한 관리에서 **Admin 자신에게 해당 사업장 Site Grant**를 명시 부여한 뒤 `/masters`에서 **동 → 층**을 생성합니다. 동·층 작성도 Site 권한이 필요하므로 이 순서를 지킵니다. Admin Role만으로 CAD 등록/Current/삭제를 할 수 없습니다. 다른 계정에는 Reader/Editor/Admin을 명시 부여합니다. 인증된 Editor/Admin과 해당 Site Grant가 있어야 수정되고, 기존 CAD 삭제 암호 검증 및 Audit가 적용됩니다. 신규 DXF는 시스템에서 새로 업로드합니다.

## 4. 장애·변경 및 현장 수용

- **재시작:** 같은 이미지 참조·설치 marker·볼륨인 경우 `docker compose ... up -d`가 DB/CAD/Audit를 유지합니다. 자동 Migration replay·code 재생성·Admin 초기화 없음.
- **중도 실패:** marker 없는 비빈 DB·불완전 Schema·누락/잘못된 권한 코드 파일은 fail-closed. 자동 SQL 복구·DB 삭제/볼륨 삭제를 실행하지 않습니다. 필요 시 새로운 빈 볼륨으로 **신규 설치**를 별도 승인합니다.
- **버전 업그레이드:** 이미지/Source를 교체하면 설치 marker와 불일치로 차단합니다. 현 시점 무인 DB schema upgrade는 지원하지 않으므로 Owner의 별도 백업·검증/승인된 업그레이드 설계가 필요합니다. 이 명령은 기존 DB 자동 이관 수단이 아닙니다.
- **운영 승인:** 새 Self-hosted mode는 예전 24h Owner Ed25519 서명 갱신이 필요하지 않습니다. 그러나 CI/컨테이너 화면 검증은 실 운영 이미지 출처, 네트워크 차단, 역할별 접근, 최소 2대 PC의 세션/권한/Viewer/실 DXF 수용을 대신하지 않습니다.
- **검증:** `/api/health`가 200, 최초 Admin 1회/초기 비밀번호 변경, Site0→생성/명시 Grant, CAD 업로드·Current/삭제비밀번호, Audit, 컨테이너 restart 후 변경 사항 유지, 미승인/Reader 차단을 확인합니다.

---

# Issue #153 — 완전 신규 설치 (Greenfield)

이 경로는 과거 DB/HOLD/Snapshot/기존 CAD 데이터와 무관하다. **Owner가 별도 보관한 DXF 파일만 신규 업로드**한다.
구 DB의 마이그레이션·복원·버전 비교·rollback image·과거 Auth 승인 및 기존 사업장/계정 데이터는 설치에 필요 없다.

## 릴리스 요구 사항
- GHCR에 게시된 **같은 소스 버전**의 App+Migrator 이미지를 각각 정확한 OCI Digest로 고정한다. 기존 v0.44.0 태그/이미지를 재사용하지 않는다.
- 새 Docker Compose: `src/docker-compose.greenfield.yml`; 고정된 새 프로젝트/볼륨 `cad-layout-viewer-greenfield-data`, 새 App 이름과 기본 포트 3001. 기존 docker-compose.yml과 함께 실행하지 않는다.
- App은 Auth/CAD Write 기본적으로 ON을 요청하나, 검증된 Trust+Approval 및 신규 최종 Schema 없이는 **BLOCKED**다. Owner 서명 없는 익명 쓰기 허용을 위해 OFF로 우회하지 말 것.
- 새 데이터에 대한 통상적인 백업은 운영 시작 후 별도 관리. 이전 DB 데이터 복구 요구사항이 아니다.
- G7 Greenfield은 과거 Migration history/SNAP/Epoch/rollback OCI에 의존하지 않는다. 설치 DB는 최초 Schema에 대한 **단일 baseline marker**만 보유한다. 구 DB/구 Migrator의 `apply-approved`는 이 데이터에 사용하지 못한다.

## 1. 환경 구성 (사내 WSL2/Docker 호스트)
UID/GID 10001 소유, 디렉터리 0700, 파일 0600으로 각각 준비:
- `G7_SITE_SEED_DIR` : `seed.json`
- `G7_SITE_OPERATOR_DIR` : `release-input.json`
- `G7_OWNER_KEY_DIR` : `owner-private.pem` Ed25519 개인키. **Signer 컨테이너에만 마운트**.
- `G7_RUNTIME_DIR` : 초기에는 비어 있음; 서명 후 `runtime-trust.json`과 `runtime-approval.json` 생성.
- `.env.greenfield` : 아래 예시 파일을 복사한 뒤 폐쇄망 내부에서만 실제 값으로 수정. 버전·Digest·Origin과 실제 노출 포트를 정확히 맞춘다. 개인키·비밀번호는 .env에 넣지 않는다.

`src/deploy/g7-greenfield/seed.example.json`, `release-input.example.json`, `env.example` 참고.
DXF 원본 또는 실제 자격증명은 GitHub/Actions에 업로드하지 않는다.

## 2. 초기 DB 생성 (딱 1회)
```sh
docker compose --env-file .env.greenfield -f src/docker-compose.greenfield.yml run --rm init
```
정상: `G7_GREENFIELD_SCHEMA_READY`. 빈 DB에서만 허용한다. 과거 6→7 SQLite 데이터 Migration을 실행하는 명령이 아니다. 기존 Prisma deploy CMD는 이 모드에서 명시적으로 차단된다. 실패한 대상은 새 빈 테스트 볼륨에서 원인을 수정한 뒤 처음부터 설치하며, 비어 있지 않은 DB를 강제 덮어쓰지 않는다.

## 3. 최초 Site 계층 등록 (딱 1회, Owner 입력)
```sh
docker compose --env-file .env.greenfield -f src/docker-compose.greenfield.yml run --rm seed-sites
```
정상: `G7_GREENFIELD_SITES_SEEDED` 및 새로 생성된 Site UUID 목록. User가 없을 때 Operator 승인 파일에 지정한 새 사업부/제품/Site/동/층만 생성한다. 기존 사업장/도면 등록정보는 읽지 않는다.

서명 Scope를 새로 생성된 **모든** Site 목록에 한정하므로 최초 사용할 Site를 한번에 입력한다. 이후 Site 증설 정책은 별도 새 Site 권한 바인딩 절차가 구현되기 전 임의 우회하지 않는다.

## 4. Owner Greenfield 서명 (구 Snapshot/rollback 불필요)
```sh
docker compose --env-file .env.greenfield -f src/docker-compose.greenfield.yml run --rm owner-sign
```
정상: `G7_GREENFIELD_OWNER_SIGNATURE_VERIFIED`. 이 도구는 신규 DB의 Site 목록을 독립적으로 읽고 릴리스/Origin/데이터 경로/Scope/24시간 이하 유효기간을 Owner Ed25519로 서명한다. 구 DB의 이력·HOLD·Snapshot·rollback pair 필드는 없다.

App 및 admin-bootstrap 환경변수의 `G7_RELEASE_*`가 서명한 동일 릴리스와 일치해야 한다. 실제 이미지 Digest 확인은 내부 운영자가 수행한다. `G7_RUNTIME_ALLOW_HTTP=true`를 사용하는 경우 네트워크 방화벽/리버스 프록시로 승인된 사내 IP만 접근시킨다.

만료 후 **동일 버전/동일 Site 목록**을 계속 사용할 경우, operator 입력의 새로운 `OWNER-...` approvalId로 갱신해:
```sh
docker compose --env-file .env.greenfield -f src/docker-compose.greenfield.yml run --rm owner-sign renew /run/operator/release-input.json /run/g7 /run/owner-key/owner-private.pem
```
릴리스/Scope/DB 변경은 새 Trust와 배포 승인 절차를 사용한다. 개인키를 앱 컨테이너에 마운트하지 않는다.

## 5. 최초 관리자 생성 (딱 1회)
`G7_ADMIN_SECRET_DIR/admin.password`를 UID10001 소유 0600, 마지막 줄바꿈 없이 준비:
```sh
docker compose --env-file .env.greenfield -f src/docker-compose.greenfield.yml run --rm admin-bootstrap
```
정상: `G7_RUNTIME_ADMIN_ACTION=bootstrap`. 이미 초기화된 DB에서는 재실행해도 관리자를 덮어쓰지 않는다. 반드시 웹의 `/g7-runtime`에서 초기 비밀번호를 변경하고 로그인/로그아웃을 검증한다. Admin도 Site Grant가 자동 부여되지는 않으므로 초기 Admin이 명시적으로 담당 Site Grant를 생성한다.

## 6. App 기동·신규 DXF 업로드
```sh
docker compose --env-file .env.greenfield -f src/docker-compose.greenfield.yml up -d app
```
`GET /api/g7-runtime/status`의 `ACTIVE`를 확인하고, Reader/Editor/Admin·Site Grant·Audit·CSRF/Origin·CAD 업로드/Current/삭제 비밀번호를 검증한다. DXF는 기존 DB를 조회하지 않고 **별도로 보관한 파일을 새로 업로드**하며 새 Version/Current/비밀번호를 설정한다. 기존 DB의 과거 ID·메모·이력 등은 자동 복원하지 않는다.

## 실패 및 안전 원칙
- 이미 존재하는 DB/기존 HOLD/비어 있지 않은 저장소는 초기화하지 않는다.
- 최초 Admin secret·Owner 개인키·Trust를 공개 GitHub/CI에 업로드하지 않는다.
- 이전 운영 데이터와 호환성/스냅샷/복구를 비교하지 않는다.
- 새 시스템의 서명·Schema·사이트 Scope·FK/Password Guard 검증은 우회하지 않는다.
- 이전 상태가 없는 **신규 설치 실패**는 새 빈 볼륨에서 다시 시작한다; 완료한 계정/도면 데이터가 있는 신규 DB를 덮어쓰지 않는다.
