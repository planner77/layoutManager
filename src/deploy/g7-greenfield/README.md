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
