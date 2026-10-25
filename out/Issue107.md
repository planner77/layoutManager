# Issue #107 — G5 PROD Nginx · DEV direct 연결 검증 (비운영)

## Issue #107 — 구현 최종 판정 및 G6 인계 (2026-10-26)

- **구현 완료:** [PR #115](https://github.com/planner77/layoutManager/pull/115) Squash 병합. 최종 PR HEAD `44132fcaa31aff0c4643edfeb8db6949d801ca5b`, main commit `142c4b9bc0bdb2ad0403fb1ee6640cf070d0bbbc`. Issue #107은 `closed/completed`이며 재구현하지 않는다.
- **자동 검증 PASS:** [PR CI #40224438075](https://github.com/planner77/layoutManager/actions/runs/40224438075) Verify/Typecheck/Lint/Unit·E2E·Build 및 Docker/Migration/Runtime 두 Job `completed/success`. Viewer P2 리뷰 4371142398 답변·해결, 미해결 리뷰 0·당시 main 병합 충돌 0.
- **Main 릴리스 PASS:** [Main CI #40225537167](https://github.com/planner77/layoutManager/actions/runs/40225537167) `completed/success`, GHCR App·Migrator candidate build, paired image promotion 및 OCI measurement 관련 필수 step 모두 success. 기존 v0.40.3 불변, 새 tag `v0.40.4` 생성 확인. 런타임 실제 배포는 수행하지 않았다.
- **실 LAN 증거는 별개:** Windows Nginx↔WSL2/App 실제 연결, 사내 PC 2대, 업무 Upload/Download·Viewer 실제 조작, G3 Cookie/Session, DB/CAD/S3 백업·복원은 `NOT RUN`, [#108 G6](https://github.com/planner77/layoutManager/issues/108)에서 수용한다. #109 Owner 별도 Go/No-Go 이전 운영 Compose/Nginx/Prisma/Auth/API/데이터 변경·활성화 금지.


- 상위 [#96](https://github.com/planner77/layoutManager/issues/96) / 선행 [#102](https://github.com/planner77/layoutManager/issues/102) / 후속 [#108](https://github.com/planner77/layoutManager/issues/108) / 승인 [#109](https://github.com/planner77/layoutManager/issues/109).
- 상태: **G5 격리 Preview/Smoke 구현 및 PR #115 최종 HEAD CI SUCCESS, Main Squash 병합·GHCR v0.40.4 App/Migrator Pair 게시 완료, Issue #107 구현 단위 종료**. 단, 사내 실제 LAN 현장/로그인 Cookie/Upload/Backup·Restore 수용은 #108 G6 `NOT RUN`. `DESIGN.md`가 없으므로 AGENTS·Architecture·Decisions·Operation이 설계 기준이다.
- Owner 전제: 외부망 인바운드 제한 조직망 소수 사용자. 공격방어·탈취 대응 하드닝/침투시험/상세 CIDR은 G5 필수조건이 아니다. HTTP 잔여 위험 `OWNER_ACCEPTED_SCOPE`는 안전성 PASS가 아니다.
- 업무 정책(익명 기존 CAD GET/다운로드, Current=Editor+Site, Delete=Editor+Site+기존 암호, Admin 담당, Audit 365일)은 #102의 최신 Owner 결정이 출처이며 이 G5에서 기능/API 변경 없음.

## 분석·설계

- 현행 `src/docker-compose.yml`은 App 3000을 `host_ip: 0.0.0.0`에 publish한다. 이는 PROD Nginx 단일 접속 동작의 확인 결과가 아니며 기존 운영 구성은 변경하지 않는다.
- Nginx의 Host·scheme 전달은 기존 `requireSameOrigin`이 정상 POST Origin을 판정하는 데 필요하다. G3가 활성화되지 않았으므로 Cookie/Session 실제 동작 검증은 #105/#108로 이관한다.
- PROD와 DEV는 SQLite/CAD 볼륨·네트워크를 각각 분리하고 Preview는 로컬 저장만 사용한다. 운영용 cad-layout-viewer-data 볼륨 및 S3·실 CAD를 재사용하지 않는다.

| 목적 | 격리 Preview 경로 | 노출 및 데이터 |
| --- | --- | --- |
| PROD | 브라우저 → g5-prod-nginx(127.0.0.1:3302 기본) → g5-prod-app:3000 | App host publish 없음; g5-prod-data/net 전용 |
| DEV | 개발자 → g5-dev-app(127.0.0.1:3301 기본) | g5-dev-data/net 전용 |
| 실제 운영 | 사내 PC → 현행 Windows Nginx → App | 변경 금지(G7). 0.0.0.0:3000의 도달성은 실제 환경에서 미검증 |

**구현:** `src/deploy/g5/compose.preview.yml`, `nginx.preview.conf`, `src/scripts/g5-preview-smoke.mjs`, `src/tests/unit/g5-preview.test.ts`, CI Compose config-only 검증. 실제 운영 `src/docker-compose.yml`, `.env.example`, Prisma, Auth/API, Nginx, DB/CAD/S3, 운영 구성 변경 0, GHCR 새 게시용 package/lock 0.40.4 후보 정렬.

## 격리 실행 (저장소 root)

```bash
docker build -f src/Dockerfile --target migrator -t cad-layout-viewer:g5-migrate .
docker build -f src/Dockerfile --target runtime -t cad-layout-viewer:g5-web .
docker compose -f src/deploy/g5/compose.preview.yml --profile g5-prod --profile g5-dev config --quiet
docker compose -f src/deploy/g5/compose.preview.yml --profile g5-prod --profile g5-dev up -d
node src/scripts/g5-preview-smoke.mjs --base-url http://127.0.0.1:3302
node src/scripts/g5-preview-smoke.mjs --base-url http://127.0.0.1:3301
docker compose -f src/deploy/g5/compose.preview.yml --profile g5-prod --profile g5-dev down -v
```

- 포트 충돌 시 Preview용 `G5_PROD_PORT`/`G5_DEV_PORT`만 변경. 다른 사내 PC에서 격리 테스트할 때만 `G5_PROD_BIND_IP`를 명시적으로 설정하며 실제 주소는 비공개. G5 옵션은 운영 App 환경에 연결하지 않는다.
- `down -v`는 **Preview Compose 전용 볼륨 삭제**이므로 반드시 파일명을 확인하고 운영 Compose와 함께 실행하지 않는다.
- CLI는 **읽기 전용**으로 `/api/health`(200/status ok), `/`(HTML), `/api/cad-files`(JSON), 정적 글꼴 HTTP 200을 검사한다. 별도 Preview 도면을 등록한 후 `--version-id VERSION_ID`만 주면 실제 Viewer `/cad/versions/VERSION_ID/viewer` 및 원본 content를 검증한다. 선택적 `--viewer-path /cad/versions/VERSION_ID/viewer`는 동일 ID 필수이며 `/cad/locations/ID` 관리 화면은 Viewer 검증 경로가 아니다.
- **수동:** Preview에서 임시 도면 등록(Origin과 Host 정상 전송), Viewer, 다운로드 파일 bytes/SHA 대조, Current/삭제 비밀번호를 점검한다. 기존 운영 CAD·DB는 사용하지 않는다. 로그인·쿠키 만료/회수는 G3 이후 별도 실증.
- 실제 사내 PC ≥2대, Windows Nginx/WSL2 upstream·배포 포트, 실제 Cookie/Session 및 파일 업로드/다운로드 E2E는 PR CI만으로 합격하지 않는다. #108 G6에서 실측하고 사내 증거 ID만 인계한다.

## 수정 수용 기준 · 시험 추적

| AC | TC | 현재 증거 상태 |
| --- | --- | --- |
| G5-AC1 PROD/DEV 경로·데이터 분리 | TC-P4-G5-001/002 | Unit 및 Compose config 검증 PR CI #40224438075 성공 / 실 LAN은 G6 대기 |
| G5-AC2 정상 Health/Viewer/API/Upload/Download/Cookie | TC-P4-G5-003/004, TC-P4-G5-LAN-001 | Viewer 경로 보완 Unit + Read-Only CLI PR CI 성공 / 실 Upload·Cookie·LAN NOT RUN |
| G5-AC3 운영 Nginx/Compose/Prisma/API/DB 변경 0 | TC-P4-G5-005 | PR #115 17개 변경 파일 확인, 운영 Compose·Prisma·기존 App API 미변경 |
| G5-AC4 R1 정책·HTTP 위험·미검증/실 LAN 항목 문서화 | TC-P4-G5-006 | 본 문서와 TestReport/FailureLedger 기록 |

**GHCR 게시 증거:** 기존 v0.40.3 이미지 태그는 유지하고, 새 v0.40.4 App/Migrator Pair를 Main CI #40225537167에서 성공적으로 build·digest 확인·promote·OCI 계측 완료하였다. Git tag `v0.40.4` 존재. CI 성공은 사내 운영 적용·G7 승인이나 #108 현장 수용의 증거가 아니다.

**추가 Owner 결정을 즉시 요구하지 않음:** 실제 Nginx upstream 주소/포트·WSL2 host publish·담당자·현장 실측 PC와 CAD 샘플은 G6/G7 비공개 설정 단계에서 결정. POST 등록 권한 전환은 #106/#109의 별도 미승인 업무 정책. 운영 인증/관리/영속 API 및 배포는 **G7 별도 Owner 승인 전 OFF**.
