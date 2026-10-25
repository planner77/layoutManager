# Issue #67 — GHCR 웹 Standalone better-sqlite3 중복 계층 제거 및 정밀 계측

### PR #80 2차 CI에서 발견한 계측 Python 구문 회귀 (2026-10-25)

- [Run 40171968883](https://github.com/planner77/layoutManager/actions/runs/40171968883) HEAD `95cd745`에서 Docker Job의 Python audit import가 `f-string` 종료 문자 누락으로 FAIL. 이미지 계측 검사 자체와 후속 Compose 스모크는 실행되지 않았고, 원래 P1 수정의 의미적 정상/실패 증거로 해석하지 않는다.
- `py_compile`과 Synthetic Unit을 Docker 빌드 전으로 옮기고 구문을 수정한다. 최초 duplication transition positive saving과 이후 deduplicated base equal-size 허용을 분리 테스트한다. [FailureLedger](FailureLedger.md)/[TestPlan](TestPlan.md).


## PR #80 첫 CI 성공과 P1 리뷰 수정 (2026-10-25)

- 최초 [Run 40170910369](https://github.com/planner77/layoutManager/actions/runs/40170910369), HEAD `6a35660d192a`, Verify/Docker Job 모두 SUCCESS. 이 값은 최초 HEAD에 한정되며 GHCR OCI 용량/실운영 증거는 아니다.
- [P1 #4369963432](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432)에서 다른 PR의 baseline Dockerfile에 이미 duplicate가 없으면 기존 audit가 정상 CI도 실패시킨다는 문제를 지적. **기본 원칙:** baseline duplicate가 존재하는 실제 제거 전환에만 positive size saving 의무; 정상 deduplicated baseline에서는 no-duplicate와 최종 package SHA/native 동일성을 필수, size delta는 참고로 기록. 재도입된 duplicate/파일 불일치는 계속 차단. 추가 synthetic Python tests로 분기 검증.
- 교정 이후 커밋은 최초 성공 Run과 다른 HEAD이므로 다시 PR CI를 검증해야 병합 가능. Main GHCR app/migrator pair 및 immutable version/digest 수치는 정식 게시 후 별도. [FailureLedger](FailureLedger.md).


**일자:** 2026-10-25 · **버전:** 0.38.1 · **브랜치:** build/issue-67-web-standalone-layer-audit · **상태:** 코드 작성 / 새 PR CI 미확인

## 분석/설계 근거

- #28에서 Next.js Standalone 런타임으로 웹 이미지를 이미 경량화했다. `next.config.ts`는 `better-sqlite3/**/*`와 `generated/prisma/**/*` 파일 추적을 명시하지만, 기존 `src/Dockerfile`은 `.next/standalone`과 `node_modules/better-sqlite3`를 연속 COPY해 동일 경로에 중복 압축/비압축 레이어를 만들 수 있다.
- 성공했던 [CI 40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531)에서 웹 image local 비압축 **376,458,636 bytes**, Standalone COPY 약 **132MB**, 추가 SQLite COPY 약 **12.5MB**, runtime node_modules 약 **89MiB**, public 약 **37MiB**를 관측했다. 이 값은 **과거 linux/amd64 비압축 기준선**이며 새로운 전후 실측이나 GHCR OCI 압축 다운로드량이 아니다.
- #66은 별도의 migrator 경량화다. #67은 **웹 runtime** 패키지 복사 소유권을 한 곳으로 만드는 좁은 변경으로, `DESIGN.md` 부재 시 `out/Architecture.md`/ADR-045를 설계 기준으로 한다.

## 구현 결정

1. Next의 `outputFileTracingIncludes`와 `serverExternalPackages`의 Prisma/native 규칙은 유지. 웹 Dockerfile의 *추가* SQLite node_modules COPY만 제거. Docker image build 중 native `better_sqlite3.node` 파일 존재 검사 + JS `require('better-sqlite3')` 메모리 DB를 실행해 누락/ABI 불일치 시 fail-closed.
2. 실제 이전 Dockerfile과 새 Dockerfile을 **동일 PR HEAD 소스**, Node22.14, Debian, linux/amd64로 빌드한다. `audit_standalone_layers.py`로 각 `docker save` TAR 레이어의 `node_modules/better-sqlite3` 파일·SHA256·중복 작성 위치를 검사한다. 이전·개선 최종 패키지 전체 파일의 경로/해시 동일성, native `.node`, baseline 중복 동일 바이트와 개선 이후 중복 없음이 모두 참이어야 성공으로 인정.
3. `measure-images.sh`의 `docker inspect .Size`는 **비압축 image bytes**, `docker history --no-trunc`/`du`는 원시 layer/파일 근거다. 개별 원본 NanumGothic TTF, 파생 CadKorean typeface, LibreDWG JS/WASM에는 raw/gzip proxy bytes를 보고하며 서버 traced 파일 크기 상위 20개도 기록. gzip proxy는 GHCR OCI compressed layer가 아니다.
4. `pr-ci.yml`은 기존 Typecheck/Lint/Unit/Next Build/Chromium E2E/Legacy 및 Docker Compose migrator smoke에 합성 TAR 자체 테스트와 실제 layer 해시 감사, 임시 `data`에 API Master/DXF 등록→재마이그레이션→앱 재시작→Current/원본 조회→삭제/404 검사 추가. DXF 두 뷰어/Layer/Text/Outline, DWG/WASM, Unicode 글꼴, local/S3, UID10001, Healthcheck 및 security 회귀 유지. 운영 DB/CAD/S3 연결 금지.
5. #66 migrator 및 release pair를 건드리지 않는다. 공개 버전+**immutable digest**별 linux/amd64 OCI manifest `layers[].size` 합계 및 app/migrator 공유 digest 집계는 **정식 GHCR 게시 후** 실행. OCI index/attestation/config/파일 gzip 크기는 압축 OCI image layer 총량에 포함하지 않는다.

## 수용 기준과 테스트

| AC | 검증 증거 | 판정 |
| --- | --- | --- |
| 67-01 파일 SHA 중복 및 안전 제거 | Python TAR negative/positive fixtures, 실제 baseline vs runtime Docker save layer hash, native .node/JS 동일 | PR Docker CI 후 |
| 67-02 before/after image size | 동일 HEAD/Node/linux-amd64, `image inspect` bytes/MiB/%, `docker history --no-trunc` 및 `du` | PR Docker CI 후 |
| 67-03 traced 불필요 대형 파일 | server/노드 모듈 top20, public original TTF/typeface/WASM JS raw/gzip proxy, 위험 자산 제거 없음 | PR Summary 후 |
| 67-04 native/DB/서비스 | Docker RUN SQLite memory DB, nonroot, Compose fresh/기존 마이그레이션, health200, disposable DXF API CRUD/재시작 | PR Verify/Docker 성공 후 |
| 67-05 기능 회귀 | 두 DXF Viewer/Layer/Text/Outline, DWG wasm/한글 Font, static/client, local/S3, upload/download/security/legacy | PR CI + 현장 추가 실증 |
| 67-06 GHCR OCI 통제 | 웹+migrator의 version+immutable digest/OS arch, linux/amd64 **압축 OCI layers** 크기, 공유 digest와 attestation 구분 | 정식 릴리스 이후 |
| 67-07 Docker 계약 | `runtime`/`migrator`, `node server.js`, HEALTHCHECK, UID10001, `service_completed_successfully` /data/volume | PR Docker CI |

**보류/가정:** 추가 COPY 약 12.5MB는 과거 local uncompressed layer 관측이며 현재 실제 saving을 뜻하지 않는다. 같은 패키지가 빌드 결과에 중복되지 않거나 해시가 다르면 불안전하게 제거한 것으로 간주, CI 차단 후 설계 재검토. `next.config.ts` glob 축소/글꼴 glyph subset/원본 파일/LibreDWG WASM 삭제 금지. #28 과거 2.05GB 전체 app, #66 migrator 1.34GB를 #67 절감의 분모로 사용 금지.

**실행·검증 경계:** GitHub remote 수정만으로 로컬 Docker/Node/Playwright 검증을 수행하지 않았다. 테스트 코드 작성은 PASS가 아니다. CI 성공, 신규 이미지 size, GHCR OCI 압축 수치, 실제 운영 볼륨 수용은 **모두 NOT VERIFIED**. 장애 시 [FailureLedger](FailureLedger.md)에 Run/Job/HEAD/원인/조치/재실행 기록. 릴리스/배포 전 같은 시점 DB/CAD/S3 백업·복원 점검, 기존 writer 정지, 동일 버전 migrator exit0, app health 확인을 수행하며 `down -v` 금지.

## 관련 공식 자료·문서

[Next.js output tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) · [Docker image save](https://docs.docker.com/reference/cli/docker/image/save/) · [#28](Issue28.md) · [#66](Issue66.md) · [Architecture](Architecture.md) · [ADR-045](Decisions.md) · [Operation](Operation.md) · [TestPlan](TestPlan.md) · [TestReport](TestReport.md)
