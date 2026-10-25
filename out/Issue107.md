# Issue #107 — G5 PROD Nginx · DEV direct 연결 검증 (비운영)

- 상위 [#96](https://github.com/planner77/layoutManager/issues/96) / 선행 [#102](https://github.com/planner77/layoutManager/issues/102) / 후속 [#108](https://github.com/planner77/layoutManager/issues/108) / 승인 [#109](https://github.com/planner77/layoutManager/issues/109).
- 상태: **격리 Preview 구성 및 기초 자동 검증 구현; PR CI/실제 조직망 수용 결과는 별도 확인 전 NOT RUN**. 저장소에 DESIGN.md가 없어 AGENTS·Architecture·Decisions·Operation을 설계 기준으로 삼는다.
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

**구현:** `src/deploy/g5/compose.preview.yml`, `nginx.preview.conf`, `src/scripts/g5-preview-smoke.mjs`, `src/tests/unit/g5-preview.test.ts`, CI Compose config-only 검증. 실제 운영 `src/docker-compose.yml`, `.env.example`, Prisma, Auth/API, Nginx, DB/CAD/S3, package version, GHCR 변경 0.

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
- CLI는 **읽기 전용**으로 `/api/health`(200/status ok), `/`(HTML), `/api/cad-files`(JSON), 정적 글꼴 HTTP 200을 검사한다. 별도 Preview 도면을 등록한 후 `--viewer-path /cad/locations/ID --version-id VERSION_ID`로 Viewer 페이지/원본 content 응답을 추가 확인한다.
- **수동:** Preview에서 임시 도면 등록(Origin과 Host 정상 전송), Viewer, 다운로드 파일 bytes/SHA 대조, Current/삭제 비밀번호를 점검한다. 기존 운영 CAD·DB는 사용하지 않는다. 로그인·쿠키 만료/회수는 G3 이후 별도 실증.
- 실제 사내 PC ≥2대, Windows Nginx/WSL2 upstream·배포 포트, 실제 Cookie/Session 및 파일 업로드/다운로드 E2E는 PR CI만으로 합격하지 않는다. #108 G6에서 실측하고 사내 증거 ID만 인계한다.

## 수정 수용 기준 · 시험 추적

| AC | TC | 현재 증거 상태 |
| --- | --- | --- |
| G5-AC1 PROD/DEV 경로·데이터 분리 | TC-P4-G5-001/002 | Unit 작성, CI 전 NOT RUN |
| G5-AC2 정상 Health/Viewer/API/Upload/Download/Cookie | TC-P4-G5-003/004, TC-P4-G5-LAN-001 | Mock Unit/CLI 작성; 실 Upload/Cookie/LAN NOT RUN |
| G5-AC3 운영 Nginx/Compose/Prisma/API/DB 변경 0 | TC-P4-G5-005 | PR diff 검토 필요 |
| G5-AC4 R1 정책·HTTP 위험·미검증/실 LAN 항목 문서화 | TC-P4-G5-006 | 본 문서와 TestReport/FailureLedger 기록 |

**추가 Owner 결정을 즉시 요구하지 않음:** 실제 Nginx upstream 주소/포트·WSL2 host publish·담당자·현장 실측 PC와 CAD 샘플은 G6/G7 비공개 설정 단계에서 결정. POST 등록 권한 전환은 #106/#109의 별도 미승인 업무 정책. 운영 인증/관리/영속 API 및 배포는 **G7 별도 Owner 승인 전 OFF**.
