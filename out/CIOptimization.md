# Issue #197 — PR CI 실행 시간 최적화 (2026-11-01)

## 실제 병목 근거

| 항목 | PR #159 · Run 40951594117 (2026-10-29) | PR #194 · Run 41295744097 (2026-11-01) | 증가 |
| --- | ---: | ---: | ---: |
| Verify elapsed | 11.0분 | 24.5분 | +13.5분 |
| General Playwright Chromium | 93 cases / 5.8분 | 148 cases / 14.8분 | +9.0분 |
| Greenfield Playwright | 1 case / 0.1분 | 22 cases / 3.0분 | +2.9분 |
| Unit / Integration | 2.6분 | 3.1분 | +0.5분 |
| Docker runtime job | 약 5.6분 | 약 5.2분 | 병목 아님 |

성공한 원격 Job 로그 타임스탬프 기준으로 반올림. 각 Run에서 Playwright retry 0회.
근거: https://github.com/planner77/layoutManager/actions/runs/40951594117 및 https://github.com/planner77/layoutManager/actions/runs/41295744097.
15~18분은 **다음 CI 실측 전까지 목표**이지 보장·측정 결과가 아니다.

## 구현 6건 및 격리

1. **General E2E 2-Shard:** matrix shard=[1,2] (각각 --shard=1/2, --shard=2/2); 기존 `workers:1` 및 `fullyParallel:false`를 변경하지 않음. shard별 GitHub Runner·임시 SQLite·CAD 저장소·Playwright Trace 독립. 각 shard 필수.
2. **Greenfield 분리:** Greenfield 22건은 독립 Job; 기존 G7 Signed Runtime 및 Legacy migration도 전용 Job에서 그대로 실행. E2E는 **정확 HEAD의 quality build에 의존**하나 Docker smoke는 병렬 실행.
3. **Doc-only Scope:** `.github/scripts/pr_ci_scope.py`는 Git base/head 전체 changed paths를 NUL로 읽고 유효성 실패 시 fail-closed. `*.md`만 있을 때 quality/browser/docker가 SKIPPED이고 기존 required 이름 `Typecheck, lint, test, build, E2E`인 집계 verify가 성공 여부를 판정. 수동 dispatch는 full+baseline, workflow/code 비문서 파일은 full. 다중 변경에 md 파일이 섞여 있더라도 full.
4. **Playwright 시간 계측:** 환경 변수 `PLAYWRIGHT_JSON_OUTPUT_FILE`, `--reporter=dot,json`로 원본 JSON 저장. `.github/scripts/report-playwright-duration.mjs`가 느린 테스트 Top10, 시행횟수, 실행시간을 Job Summary에 추가하고 JSON·실패 trace를 7일 보존. PASS/FAIL 규칙, timeout, retry 변경 없음.
5. **Docker 조건부 baseline + 캐시:** Dockerfile, package/package-lock, Next tracing 및 packaging/size audit/워크플로 변경 시 baseline+phase1+동일 소스 size/ABI SHA 비교. 기타 *코드* PR에서도 runtime+migrator 빌드, native/Prisma/인증·Migration 부정 사례/Compose Greenfield 재시작·정적 에셋 smoke는 필수. phase1/runtime/migrator 각각 `docker/build-push-action@v7`와 분리된 GHA cache scope. Cache 문제는 가속 불가로만 해석하고 함수검증 실패와 혼동하지 않음. **Baseline 빌드 실행 조건만 변경**, baseline 원본 Dockerfile/one-file logging import closure 계약은 유지.
6. **단일 Production Build 공유:** quality Job이 `npm run build`를 실행한 후 `.next/cache`만 제외한 `.next` 전체를 TAR에 담음(Next standalone symlink 보전), `production-build-{run_id}-{attempt}` artifact 1일 보관. 각 브라우저 Job은 npm ci/Prisma Client 생성 후 해당 TAR를 `src`에 복원, 재빌드는 하지 않음. 재사용 빌드의 SHA/run/attempt는 동일 GitHub Actions workflow에 묶임.

## 필수 게이트 및 릴리스 조건

- 필수 그룹: scope, quality(Typescript/ESLint/Unit·Integration/OCI/Benchmark/Build), General shard 1/2 + 2/2, G7 Greenfield, G7 Signed Runtime + Legacy Migration, Docker runtime/migrator/invalid-migration/Compose.
- `verify`는 `if: always()`로 실행되고, full이면 **모든 그룹 success**, markdown-only면 **모든 검증 그룹 skipped**를 강제. scope 오류/알 수 없는 상태는 실패. 기존 상태 체크 이름 보존; 단독 Job 성공을 전체 PR CI 성공으로 오해하지 말 것.
- `.github/scripts` 4개는 운영 `src/Dockerfile` 입력 밖에 두어 이미지 동작을 변경하지 않는다. Main release-scope에서는 **이 4개 파일만 명시적 metadata-only 허용 목록**에 추가. 정식 GHCR 게시는 runtime 변경 및 승인된 Main release workflow 조건을 따른다.
- Preview/field G7 활성화, 기존 운영 DB·CAD volume 수정, 실제 DXF 외부 반출, 버전 강제 상승, tag 강제 이동, 기능테스트 생략은 포함하지 않는다.

## 검증 및 추적

| ID | 시나리오 | 기대 |
| --- | --- | --- |
| TC-197-01 | docs-only / code+docs / Dockerfile / lock / workflow / manual | 의도대로 full/baseline 분류, 이상한 Git diff 입력 fail-closed |
| TC-197-02 | General shards 1/2·2/2 | 원본 전체 suite와 동일한 합집합/테스트 수, suite 격리; 하나라도 실패 시 verify 실패 |
| TC-197-03 | Greenfield·Signed Runtime·Legacy | 기존 Browser 22+1+1 등 현재 HEAD 테스트 전부 실행, 독립 경합/DB 없음 |
| TC-197-04 | JSON reporter unit 및 E2E 산출물 | slowest Top 10, duration, attempt, status 정확, JSON/Trace artifacts, 누락 JSON 실패 |
| TC-197-05 | Production build TAR/recovery | build 1회, symlink 보전, .next/standalone/server.js, 테스트 잡 재빌드 0회 |
| TC-197-06 | Docker runtime baseline true/false | true면 #28/#67 audit 동일, false여도 runtime/migrator/native/Compose smoke 수행, cache hit/miss와 무관하게 PASS |
| TC-197-07 | required check/release-scope | full 실패/skip 시 verify 실패, docs-only 명시 skip 성공, GHCR 미게시 metadata-only 파일 인식 |
| TC-197-08 | 성능 측정 | 정확 Run+Job의 실행 시간·Shard 균형·캐시율, before/after 비교 |

현재 실제 PR CI 완료/메트릭 **NOT VERIFIED**. 로컬 Docker/Chromium 종합 실행 **NOT RUN**. 새 PR CI 이후 [TestReport](TestReport.md)와 [FailureLedger](FailureLedger.md)에 실제 HEAD/Run/Job 로그를 남긴다.

공식 참고: https://playwright.dev/docs/test-sharding · https://playwright.dev/docs/test-reporters · https://docs.docker.com/build/cache/backends/gha/ · https://docs.github.com/en/actions.

## Reviewer P1/P2 보완 (PR #198, 2026-11-01)

- Changed-path scope Git command는 `git diff --no-renames --name-only -z`를 사용하여 파일 rename을 삭제+추가로 취급한다. `src/Dockerfile`→`README.md`라도 Docker baseline 및 전체 CI를 실행하며, disposable Git 저장소로 회귀 시험한다.
- Production build artifact 이름은 attempt가 아닌 `production-build-production-build-${{ github.run_id }}`로 고정한다. Quality가 full rerun되면 `overwrite: true`로 최신 동일 커밋 빌드로 교체한다. 실패 브라우저 Job만 rerun되면 성공했던 Quality artifact를 재사용한다.
- Codex Review P1/P2 및 Main #76 문서 변경 보완 이후 신규 정확 HEAD PR CI PASS를 확인하기 전 병합·이슈 종료·GHCR 성공은 주장하지 않는다.
