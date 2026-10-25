# 구현 Unit·Acceptance Criteria·테스트 계획

## Issue #76 — GitHub Squash 기본 메시지 관리자 정책 및 진단 (2026-10-25)

| TC | 조건 | 기대 / 실패 분류 | 실행 현황 |
| --- | --- | --- | --- |
| TC-CI-76-001 | API `true / PR_TITLE / BLANK` fixture | `PASS`, Summary PASS, CI 정상 진행 | 로컬 Bash fixture PASS |
| TC-CI-76-002 | API `true / COMMIT_OR_PR_TITLE / COMMIT_MESSAGES` fixture | warning + `NOT APPLIED`, CI 진단은 non-blocking; 관리자 승인 **미완료** | 로컬 Bash fixture PASS, 실제 REST 불일치 확인 |
| TC-CI-76-003 | 잘못된 JSON/배열 fixture | warning + `NOT VERIFIED`, 잘못된 응답을 PASS로 처리 금지 | 로컬 Bash fixture PASS |
| TC-CI-76-004 | REST GET 실패 | warning + `NOT VERIFIED`, 다른 앱 CI 방해 금지 | 설계/셸 분기 검사; CI 미실행 |
| TC-CI-76-005 | 관리자 설정 변경 + 새로운 PR squash | GET 3항목 PASS, main commit subject 단일행/body 빈 문자열, `MAIN CI | #N | 설명` | **BLOCKED: 관리자 설정 미적용** |
| TC-CI-76-006 | PR CI YAML diff 및 GHCR scope | 기존 trigger/permissions/concurrency/Typecheck·Docker·GHCR 의사결정 불변, docs/workflow-only Main은 GHCR SKIP | 정적 확인, PR CI 미실행 |

- Bash `set -euo pipefail` 구문 점검과 REST 응답 mock 분기는 별도로 확인한다. GitHub Actions Runner의 실제 output 및 적용 후 Main title은 원격 workflow/run 증거가 있어야 PASS이다. 설정 불일치는 CI 자체 실패가 아니므로 FailedLedger에 가짜 Failure로 기록하지 않는다. [Issue76](Issue76.md).


## Issue #53 / E3 v0.39.0 — 삭제 편집 AC 검증 (2026-10-25)

| Test Case | AC | 검증 목표 | 현재 |
| --- | --- | --- | --- |
| TC-E3-UNIT-001 | E3-AC1/2 | 생성 3개 중 1개 Delete, 잔여 순서/UUID/기하 불변, Undo/Redo 원래 metadata·transform 복구 | 코드 작성 / NOT RUN |
| TC-E3-UNIT-002 | E3-AC2 | 선택 2개 다중 Delete 1회 이력, Confirm 취소 무변경, Undo/Redo, 삭제 ID 재사용·새 객체 중복 거부 | 코드 작성 / NOT RUN |
| TC-E3-UNIT-003 | E3-AC3 | SOURCE/혼합/중복/없는 UUID/다른 Version/SHA/숨김 대상 차단, Document/History 무오염 | 코드 작성 / NOT RUN |
| TC-E3-UNIT-004 | E3-AC2/3 | 확인창 열림 중 대상 selection·legacy local ID·명칭·visible 변경 시 stale commit 거부 | 코드 작성 / NOT RUN |
| TC-E3-UNIT-005 | E3-AC4 | Canvas focus, plain Delete/Backspace, input/search/contenteditable·modifier/repeat/defaultPrevented 격리 | 코드 작성 / NOT RUN |
| TC-E3-E2E-001 | E3-AC1/2 | 합성 DXF 외곽선 3개, Tree 단일 삭제/취소/Undo/Redo, JSON/Canvas count 정합, 재생성 unique local ID | 코드 작성 / NOT RUN |
| TC-E3-E2E-002 | E3-AC2/4 | Tree 다중 선택 2개 삭제 취소/Confirm, Esc dialog 시 선택 2개 보존, Backspace Canvas focus, input native key, 마지막 빈 Tree | 코드 작성 / NOT RUN |
| TC-E3-E2E-003 | E3-AC3/4 | SOURCE+GENERATED 혼합·Pan 삭제 차단, 선택된 Generated hit context menu, reload/Renderer 전환에서 임시 개체 해제 | 코드 작성 / NOT RUN |
| 회귀 | E3-AC3~5 | #17/#25/#26/#31/#38/#39/#40/#42/#43/#51/#52 Unit/E2E/Legacy, #31 원본 SHA·Current 불변, 세션 재로드 | NOT RUN |
| 현장 | E3-AC4 | Native Fullscreen OS/browser 조합, GPU 메모리 장기 사용·실 DXF·DWG 비지원, JSON canonical/P4 보안 | NOT RUN |

실행 도구 기준: `cd src && npm ci && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run test:master-migration`. 현재 연결 환경에 실행 가능한 repository checkout이 없어 **이 테스트들을 아직 실행하지 않았다**. CI는 PR 생성으로 시작만 하고 결과 모니터링하지 않는다. 상세 [Issue53](Issue53.md)/[TestReport](TestReport.md).


### Issue #67 / PR #80 — Python audit 조기 구문 검사 및 크기 분기 테스트 (2차 CI 실패)

- [Run 40171968883](https://github.com/planner77/layoutManager/actions/runs/40171968883) Docker [121104610668](https://github.com/planner77/layoutManager/actions/runs/40171968883/job/121104610668): `TC-IMG67-002/003` 앞 Python import SyntaxError 1건; 실제 layer hash/새 Compose **SKIPPED**. Python `py_compile`을 baseline Docker 빌드 **전에** 추가.
- `TC-IMG67-003B`: 실제 duplication transition + 동일 비압축 size → FAIL; baseline/new 이미 deduplicated + equal size → PASS, 단 native SHA/optimized no-dup 검사는 반드시 PASS. 새 Synthetic Unit 작성 / 수정 HEAD CI 미확인.


## Issue #67 — PR #80 P1 리뷰: 이미 deduplicated 기준선의 후속 CI 안전성

| TC | 기대 | 검증 단계 |
| --- | --- | --- |
| TC-IMG67-002A | 이전/새 package SHA/native 동일, **둘 다 baseline duplicate 0개**면 정상 PASS | Python 합성 fixture; 새 HEAD CI 대기 |
| TC-IMG67-002B | baseline duplicate 0개여도 optimized에 같은 package가 두 번 쓰이면 FAIL | Python 합성 fixture; 새 HEAD CI 대기 |
| TC-IMG67-003A | 실제 duplicate가 **있던** 전환에서는 positive saving 의무. 이전부터 duplicate가 없었다면 baseline/new size 동일도 허용, delta 정보 표시 | Python+Docker CI; 새 HEAD 대기 |
| TC-IMG67-006A | 두 경우 모두 native .node, 전체 SHA256/UID/SQLite·Docker Compose/API·Browser/Legacy 성공 강제 | 전체 Verify/Docker CI; 새 HEAD 대기 |

- 최초 [Run 40170910369](https://github.com/planner77/layoutManager/actions/runs/40170910369), `6a35660`은 Verify/Docker SUCCESS이며 새 P1 수정 HEAD PASS를 대신하지 않는다. 원인 [리뷰 4369963432](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432). [FailureLedger](FailureLedger.md).


## Issue #67 — 웹 Standalone 중복 copy layer 정밀 검증 (2026-10-25 / v0.38.1)

| TC | Acceptance | 자동 검증 기준 / 증거 | 상태 |
| --- | --- | --- | --- |
| TC-IMG67-001 | Web native 단일 전달/기존 계약 | Vitest가 Standalone COPY+extra SQLite COPY 제거, native `.node` 검사 및 `require` 메모리 DB smoke, Next externalPackages/trace glob, `node server.js`, USER cad를 확인 | 코드 작성 / **NOT RUN** |
| TC-IMG67-002 | 거짓 중복/손상 안전 차단 | Python synthetic Docker TAR fixture: 두 개의 동일 native/JS package layer→하나의 package layer; SHA 불일치, 잘못된 누락/비중복 주장, optimized 중복 잔존을 reject | 코드 작성 / **NOT RUN** |
| TC-IMG67-003 | 실제 중복 SHA/bytes·history | PR base와 current Dockerfile의 동일 소스, Node22.14, linux/amd64 runtime 빌드. Docker TAR layer-by-layer package 경로/sha256/diffID, final package identity, before/after `docker inspect .Size` bytes/MiB/% 및 `docker history --no-trunc` | PR Docker Job 추가 / **NOT RUN** |
| TC-IMG67-004 | 정적/대형 traced 파일 | Nanum TTF, CadKorean typeface, LibreDWG dist/wasm JS/WASM 파일 raw/gzip proxy 크기 및 runtime `node_modules` + `.next/server` traced 큰 파일 top20; 정적 HTTP 200; 삭제/Unicode subset 금지 | PR Docker Job 추가 / **NOT RUN** |
| TC-IMG67-005 | nonroot SQLite/기존 볼륨 보존 | Docker build native/Prisma ABI, Compose disposable `/data` fresh migrate→health200/Master/DXF 등록→app restart+idempotent migrate→Current/content read→삭제 후 404 | PR Docker Job 추가 / **NOT RUN** |
| TC-IMG67-006 | Viewer/Storage/Security 회귀 | 기존 TS/Lint/Unit, Next production build, Chromium E2E (2 DXF/Layer/Text/Outline/WASM/font/local)/Legacy E2E/Compose/health; S3/실 CAD 현장 수용 별도 | 기존 CI 실행 전 **NOT VERIFIED** |
| TC-IMG67-007 | 실제 GHCR OCI compressed bytes/paired digest | PR에는 GHCR 공개 태그 게시 금지. 정식 게시 후 version+immutable digest app+migrate에 대한 linux/amd64 OCI manifest compressed `layers[].size`, shared layer digest, attestation/index/config 배제 | **정식 릴리스 이후 NOT RUN** |

- 이전 [CI 40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531)의 별도 `better-sqlite3` COPY `12.5 MB는 과거 local 비압축 후보이며 #67 HEAD 절감 실측치로 단정하지 않는다. #28 pre-standalone 2.05 GB와 #66 migrator 1.34 GB를 baseline으로 재사용 금지. 기존 schema/API/Prisma CLI/tsx/migrator/Compose pair는 그대로.
- 단일 native 경로의 **실제 빌드 통과**와 TAR 최종 동일성/크기 계측, Docker/Browser/Legacy CI 성공을 모두 확인해야 PR 후속 병합 검토 가능. `CI 시작`과 `PASS`는 별도 기록. 파일별 gzip/이미지 gzip TAR 크기를 OCI compressed layer라고 표기 금지. [Issue67](Issue67.md), [ADR-045](Decisions.md), [TestReport](TestReport.md).


## PR #79 실패 및 P2 재발 방지 계획 (2026-10-25)

아래 E2 표의 CODED / NOT RUN 및 작성 / NOT RUN은 최초 작성 시점 상태를 보존한 기록이다. 현재 실행 결과는 [수정 HEAD 로컬 QA](#issue-52-재검증-결과--수정-head-로컬-qa-2026-10-25)와 [TestReport](TestReport.md)를 따른다.

| TC | 범위 | 검증 내용 | 상태 |
| --- | --- | --- | --- |
| TC-E2-UNIT-006 | E2-AC1 | WCS (1e9,1e9) 원점에서 먼 1×1 Polygon이 false degenerate로 거부되지 않음 | CODED / NOT RUN |
| TC-E2-UNIT-007 | E2-AC1/3 | Delete 후 60k+60k 정점·100개 경계 새 append 시 복구 Undo 한도 초과 방지, 중복 ID 거부 | CODED / NOT RUN |
| TC-E2-UNIT-008 | E2-AC2/3 | stage A 후 현재 B 또는 혼합 SOURCE 선택은 전체 commit 거부, 동일 선택만 1회 확정 | CODED / NOT RUN |
| TC-E2-E2E-001 | CI TS2339 | `HTMLInputElement` 키보드 이벤트 타입 고정 및 기존 native Ctrl+Z 검증 | CODE FIX / NOT RUN |

첫 Run `40168296155`: Typecheck 실패, 뒤 단계 SKIPPED, 독립 Docker SUCCESS; 최신 HEAD에서 전체 PR CI 필요.

## Issue #52 재검증 결과 — 수정 HEAD 로컬 QA (2026-10-25)

- 실제 원인은 `generated-document.test.ts`의 `result()` helper가 geometry 참조를 공유하여 deep-copy mutation이 후속 fixture를 오염시킨 것이었다. 호출별 `structuredClone`과 fresh fixture `[0,0]` assertion으로 수정; 닫힘 검사/제품 validator는 그대로 유지. 사전 계획의 fixture closure 가설은 가설로 보존한다.
- `TC-E2-UNIT-001~008` 포함 전체 Vitest **202/202 PASS**; Typecheck PASS; Lint PASS(오류 0, 기존 ARIA warning 1); GHCR pair parser 3/3 PASS; outline benchmark PASS; production build PASS; Chromium E2E **65/65 PASS**; Legacy migration **1/1 PASS**. [TestReport](TestReport.md)에서 환경/실행 역할과 한계를 확인한다.
- Docker 로컬 **NOT RUN**(test-only 수정); 기존 다른 실행 HEAD의 Docker 성공은 최신 HEAD 실증으로 계산하지 않는다. 실 CAD/GPU/운영 수용도 NOT RUN. PR CI 성공 전에는 이 로컬 결과만으로 CI/게시/병합 완료를 주장하지 않는다.


## Issue #52 / E2 v0.38.0 — Command·History·Keyboard·Scene 수용 계획 (2026-10-25)

| Test Case | AC | 검증 내용 | 현재 |
| --- | --- | --- | --- |
| TC-E2-UNIT-001 | E2-AC1/5 | 생성 2개 Polygon+MultiPolygon/Hole, Translate/Rotate 2회→Undo2→Redo2: UUID·순서·기준 Geometry·변환·provenance 왕복; input Geometry deep-copy/freeze | 작성 / NOT RUN |
| TC-E2-UNIT-002 | E2-AC2 | SOURCE/혼합, 다른 Version, duplicate/ref spoof, missing/hidden ID, NaN/Infinity·과도 좌표·잘못된 Pivot·중복 Delete에서 전체 무변경/History 0; 다중 Delete 순서 복원 | 작성 / NOT RUN |
| TC-E2-UNIT-003 | E2-AC3/4 | stage/ESC·cancel은 0 history, 1 commit=1 history, visibility는 history 제외, redo 무효화, 100 entry trim, dispose/clear 리소스 정리 | 작성 / NOT RUN |
| TC-E2-UNIT-004 | E2-AC3 | Ctrl/⌘+Z, Shift+Z, Ctrl+Y 및 input/textarea/select/contenteditable/alt/defaultPrevented native 이벤트 비침범 | 작성 / NOT RUN |
| TC-E2-UNIT-005 | E2-AC4/5 | ViewerManager 명령·History·취소/Dispose 위임, 미지원 Viewer는 fail-closed | 작성 / NOT RUN |
| TC-E2-E2E-001 | E2-AC3/4 | 유효 group90 합성 DXF 생성 외곽선과 tree, 버튼 disabled/no edit history, 원본 input Ctrl+Z native 유지, renderer reload/History 폐기 | 작성 / NOT RUN |
| TC-E2-E2E-002 | E2-AC4/5 | dxf-viewer 비지원 상태에서 생성 history UI 없음 | 작성 / NOT RUN |

**회귀 게이트:** TC-E1-UNIT-001~004/E2E-001~003, TC-U6/#43 Tree, #31 Precise Worker+v1 JSON, #40 OFF/ON, #42 typed v2, #17/#25/#26/#38/#39, TypeScript/ESLint/Vitest/Build/Playwright/Docker/Legacy migration. Scene/Worker/GPU 반복 실측 및 실 DXF 데이터는 PR CI 합성 시험과 분리. 현 세션 로컬 실행은 NOT RUN, PR CI 실행 결과 확인 전 PASS 금지. `#31 P4` 서버 인증 정책 Gate 불변. [Issue52](Issue52.md).


## Issue #66 / PR #78 — 첫 PR CI 차단 원인 및 수정 TC (2026-10-25)

| TC | 최초 Run 40167191799 | 교정 및 재검증 기대 |
| --- | --- | --- |
| TC-IMAGE-003 | 기존 `node scripts/run.mjs deploy` 명령 문자열 기대 때문에 **FAIL** | Dockerfile을 migrator/웹 별도 stage로 범위 구분; migrator-dependencies offline prune, 최소 node_modules copy, UID 10001/tsx deploy command, 웹 server.js, Compose service completed 의존 모두 확인. 고정 예전 CMD 기대 제거하고 실제 entrypoint contract 검증 |
| TC-IMG66-010 (신규) | 없음 / **NOT RUN** | `deploy.ts` Prisma `migrate deploy` spawn → 종료 대기 후 `tsx backfill-delete-passwords.ts` 실행, 서버 기동 불포함. Unit 추가 |
| TC-IMG66-001,003,004,006,007,008 | Docker Job 121090554257 **SUCCESS** | 해당 HEAD의 이미지 baseline **1,336,572,597→578,862,325 bytes(56.69%)**, gzip proxy **462,720,650→212,574,989 bytes**, native/UID, 신규·멱등 migrate, 오류 fail-closed 검증. 신규 HEAD에서 재실행 필요 |
| TC-IMG66-002,005,009 | 실제 OCI manifest / Legacy E2E / GHCR release 미완 | 다음 PR CI Node parser·Legacy/E2E 검증; 실제 GHCR OCI 사이즈는 Main publish 이후. 운영 DB/CAD 백업복원 별도 |

- 테스트 기대값 변경은 **작동하는 migrator의 진입점 전환을 반영**하는 것이며 assertion 약화/skip이 아니다. 1차 CI에서 TypeScript·Lint PASS, Docker PASS, Unit 187 PASS/1 FAIL, OCI parser·DXF Benchmark·Production Build·E2E·Legacy SKIPPED를 정확히 구분. [FailureLedger](FailureLedger.md).

## Issue #66 — Migrator 독립 최소 런타임 및 OCI 계측 (v0.37.1)

| TC | Acceptance | 자동 검증 기준 | 상태 |
| --- | --- | --- | --- |
| TC-IMG66-001 | 동시 baseline/후속 측정 | PR base Dockerfile과 새 migrator를 같은 소스·Node 22.14.0·linux/amd64로 빌드. inspect Size, history, du, top modules, gzip proxy 및 절감률(30% soft)을 Docker Job Summary에 기록 | Code / NOT RUN |
| TC-IMG66-002 | GHCR OCI 전송량 | Node parser: amd64 descriptor 1개, attestation 제외, 계층 크기·두 이미지 shared digest dedup; 릴리스의 실제 `:<version>`/`:<version>-migrate` manifest 계측 | Unit 코드 / NOT RUN; 실제 publish 미실행 |
| TC-IMG66-003 | 파일/패키지 봉인 | Prisma CLI+tsx+generated/Prisma config, better-sqlite3 native load, React/Next/Playwright/Vitest/ESLint/CAD 관련 모듈·tests/public 제외; npm stage 검증 및 컨테이너 확인 | Code / NOT RUN |
| TC-IMG66-004 | 최초 설치/멱등 | Compose 신규 DB migration + 백필 exit0 → 앱 health 200/정적 WASM·font, 재시작 migration 재실행 성공 | 기존 PR Docker smoke 확장 / NOT RUN |
| TC-IMG66-005 | 구 스키마 이행·보존 | 기존 Legacy migration E2E(보호 데이터/Current/hash/Version 비교), QA backup/restore 실증은 별도 운영 절차 | CI/E2E NOT RUN, 현장 NOT RUN |
| TC-IMG66-006 | read-only DB | `DATABASE_URL=file:/proc/cad.sqlite`로 migrator nonzero 확인, 앱 의존 완료 조건 유지 | 기존 Docker step / NOT RUN |
| TC-IMG66-007 | invalid SQL | 일회성 CI bind mount에 불량 migration 추가, nonroot migrator 실패; 운영 volume 사용 없음 | 신규 Docker step / NOT RUN |
| TC-IMG66-008 | UID/CA/S3 Secret | runtime Debian glibc/OpenSSL/CA, UID 10001, /data 권한, migrate env에 S3 Secret 부재; SQLite native load | 정적+Docker / NOT RUN |
| TC-IMG66-009 | release pair | Tagless/digest Compose resolution, build app+migrate candidate → digest 검증 → version/latest paired 승격, 게시 후 OCI 측정; 임의 개별 태그 이동 금지 | PR 정적 검증/릴리스 NOT RUN |

- PR CI 흐름에서 `verify`는 Typecheck/Lint/Vitest/Build/E2E/Legacy를, 독립 `docker-runtime`은 실제 migrator/native/Compose/실패/측정 경로를 수행한다. 로컬 Docker/소스 설치 시험은 현재 환경에서 미실행. **PR CI 시작과 성공을 구분**하며 Main/GHCR의 공개 version OCI 크기는 PR CI로 대체할 수 없다.
- 노드만 사용하는 OCI 파서 회귀는 `node --test src/scripts/measure-ghcr-pair.check.mjs`로 검증(실제 registry 연결은 Main publish). [Issue66](Issue66.md), [TestReport](TestReport.md), [Operation](Operation.md).
## Issue #51 / PR #77 — 최초 Unit 차단 및 작은 좌표 교차 회귀 계획 (2026-10-25)

- **TC-U6-UNIT-003 (기존):** 단일 `focusSavedOutline('local-1')` 호출은 Adapter의 `selectSavedOutline('local-1')` **인수 1개** 계약 유지. 최초 Run 40164835838에서 인수 false 추가로 FAIL; 수정 HEAD 재실행 후 판정.
- **TC-E1-UNIT-003 (추가):** Ctrl/⌘ `focusSavedOutline('local-1',true)`일 때만 Adapter `('local-1',true)` 및 WCS focus를 유지. 첫 Run에서 실행되지 않은 추가 assertion, 새 CI 전 NOT VERIFIED.
- **TC-E1-UNIT-004 (추가):** 0.001 WCS 정사각형에 `[-0.001,0.0004,0.002,0.0006]` 가로창이 교차=true, 내부창 true, 떨어진 근접 평행·인접 창=false, 점 히트 근접성 기준. 고정 determinant product 임계값 재발 방지. [P2 Review 4369760096](https://github.com/planner77/layoutManager/pull/77#discussion_r4369760096). 새 CI 전 NOT VERIFIED.
- 첫 Run에서 Unit 실패 후 Benchmark/Build/E2E/Legacy 전부 SKIPPED. 해당 단계가 실패했다고 표시하지 않으며 최신 HEAD PR CI에서 검증해야 한다.


## Issue #51 / E1 v0.37.0 — 통합 객체 선택 시험 계획 (2026-10-25)

| TC | AC | 검증 목적 | 작성/실행 상태 |
| --- | --- | --- | --- |
| TC-E1-UNIT-001 | AC1/2/4/5 | SOURCE/GENERATED 동일 Scope의 Ref·UUIDv4(getRandomValues HTTP fallback)·혼합/원본/중복/버전 위조 edit gate | 테스트 작성 / **NOT RUN** |
| TC-E1-UNIT-002 | AC3 | Polygon/Hole/Stroke/MultiPolygon·퇴화/NaN·Window 완전 포함/교차 정합성 | 테스트 작성 / **NOT RUN** |
| TC-E1-E2E-001 | AC1/2/3 | 유효 90=4 합성 DXF, SOURCE 1+GENERATED 2 영역 선택, readonly gate, Tree Ctrl/⌘ 다중 선택·highlight·v1 JSON 로컬 ID/원본 재요청 없음 | 테스트 작성 / **NOT RUN** |
| TC-E1-E2E-002 | AC3/4 | Source Layer/Generated hide 개별 선택 해제, 우→좌 영역, ESC, Reload 폐기 | 테스트 작성 / **NOT RUN** |
| TC-E1-E2E-003 | AC3/4 | 미지원 DXF Renderer 비활성 및 원본 작업 격리 | 테스트 작성 / **NOT RUN** |
| #31/#40/#42/#43 + Build/Docker | 회귀 | #31 Source selection/Worker, #40 생성 ON/OFF, JSON v1/2, Tree, UI, Legacy migration 등 PR CI gate | **NOT RUN** |

실제 다중 CAD/성능/GPU/OS·브라우저 수용은 현장 실증 별도. 로컬 실행 불가 시 PASS로 기록하지 않으며 Actions run 성공 전 수용 승인 금지. 상세 [Issue51](Issue51.md).


## Issue #74 — GHCR v0.36.1 패치 게시 검증 (2026-10-25)

| ID | 조건 | 기대 | 현재 |
| --- | --- | --- | --- |
| TC-CI-74-RELEASE-001 | package 및 lockfile 루트 버전 | 0.36.1 동기, dependencies 동일 | 정적 검증 |
| TC-CI-74-RELEASE-002 | Main `before..sha`에 `src/package.json` 변경 포함 | release-scope `publish=true` 후 GHCR Job 진입 | Main 미실행 |
| TC-CI-74-RELEASE-003 | `v0.36.1` 태그 및 GHCR app+migrate digest | 신규 태그와 이미지 쌍 검증·게시, 기존 `v0.36.0` 변경 없음 | 실제 게시 미확인 |
| TC-CI-74-RELEASE-004 | 새 PR HEAD | Verify+Docker CI SUCCESS 후 Squash merge, review 0, conflict 0 | 신규 CI 필요 |
| TC-CI-74-RELEASE-005 | Main push commit 단일행 | `MAIN CI | #74 | 짧은 설명` 표시 | Main 미실행 |

- 기존 [PR CI 40163919324](https://github.com/planner77/layoutManager/actions/runs/40163919324) 성공은 **버전 변경 이전 HEAD**에만 적용. Repo admin Squash 기본값은 #76에서 추적. GHCR 게시 경로는 기존 release-scope를 우회하지 않고 version bump로 정식 유도.

## Issue #74 — Main CI 실행명 multiline squash 회귀 방지 (2026-10-25)

| Test ID | 입력 | 기대 실행명 | 검증 상태 |
| --- | --- | --- | --- |
| TC-CI-NAME-007 | main 단일행 `#74 \| 실행명 회귀 방지` | `MAIN CI \| #74 \| 실행명 회귀 방지` | 정적 규칙 확인, 실제 Main 미실행 |
| TC-CI-NAME-008 | main 단일행 `NO-ISSUE \| 정리` | `MAIN CI \| NO-ISSUE \| 정리` | 정적 규칙 확인, 실제 Main 미실행 |
| TC-CI-NAME-009 | main `#42 \| 요약\\n\\nRefs #42 ...` (squash body 존재) | `MAIN CI \| SUBJECT-ONLY-REQUIRED \| run N` (긴 본문 미노출, Issue 미추정) | 정적 규칙 확인, 실제 Main 미실행 |
| TC-CI-NAME-010 | tag `v0.37.0` | `RELEASE \| NO-ISSUE \| v0.37.0 GHCR 이미지 게시` | 기존 식 유지, 실제 Tag 미실행 |
| TC-CI-NAME-011 | Repository squash 기본값 점검, API squash 병합 | `PR_TITLE / BLANK`(관리자 조치), `commit_title` 지정+`commit_message=""` | **Admin 설정 미적용**, 실제 merge 미실행 |

- Workflow `on:` 이하 본문은 바꾸지 않고 `run-name`과 설명 주석만 변경한다. #68 GHCR 게시 제외(Job scope), concurrency/permissions, PR CI workflow는 불변이다.
- 본 변경 PR CI 성공이 Main run-name의 실제 event 평가를 검증하지 않는다. 정상/폴백 main push와 tag는 실제 해당 이벤트의 Run 제목을 관찰해야 완료 판정한다. [Issue74](Issue74.md).

## Issue #43 / PR #72 P2 키보드 가시성 회귀 (2026-10-25)

- **TC-U6-E2E-001 확장:** 폭 320px·높이 700px(도크 최대 20dvh)에서 트리 첫 그룹에 focus → `End` 이동 후 마지막 항목이 `role=tree` 스크롤 영역의 사각형에 완전히 들어오는지 확인한다. `Home`은 첫 그룹에 되돌아오고 `window.scrollY`는 불변. Canvas DOM 유지·Scroll 허용 범위를 tree 내부로만 제한.
- P2 리뷰 [4369618943](https://github.com/planner77/layoutManager/pull/72#discussion_r4369618943)의 지적은 최초 CI `40161078593` 성공 HEAD `5cd223cc2837fc5772154fd67138680263f159e4`의 미검출 사용성 결함이다. 후속 수정 HEAD 결과는 CI success 확인 전 NOT VERIFIED.


## Issue #43 / U6 v0.36.0 — 트리/Overlay 시험 계획 (2026-10-25)

| TC | 수용 | 시나리오 및 기준 | 상태 |
| --- | --- | --- | --- |
| TC-U6-UNIT-001 | U6-01 | 타입 2개(합성 catalogue) + 여러 instance + legacy, ID 기준 그룹/리네임/빈 노드·비활성 snapshot, Group 수량·Visibility | 코드 작성 / NOT RUN |
| TC-U6-UNIT-002 | U6-02 | Polygon/MultiPolygon/hole·분리 섬 전체 WCS envelope, 퇴화/비유한/한도 초과 거부 | 코드 작성 / NOT RUN |
| TC-U6-UNIT-003 | U6-02/03 | Manager focus/visibility/delete delegation, CAD Layer 미호출, dispose 이후 fail-closed | 코드 작성 / NOT RUN |
| TC-U6-E2E-001 | U6-01~05 | 90=4 유효한 합성 DXF, 실제 CONVEX/PRECISE worker, legacy tree 즉시 갱신, 개별·그룹 숨김, 레이어 독립, 선택·ARIA keyboard, OFF+v1 JSON, 320px 및 메뉴 포커스, content 단일 요청 | 코드 작성 / NOT RUN |
| TC-U6-E2E-002 | U6-04/05 | dxf-viewer 비활성, three 전환, Reload로 임시 폐기, 다른 Version 데이터 누수 없음 | 코드 작성 / NOT RUN |
| 실제 관리자 타입/영속 재접속 | U6-01/06 | Verified server catalogue 2개·scope/401/403/DB CAS·audit·server owned Source SHA/Version | BLOCKED #65/#31 P4 |

기존 #17/#25/#31/#38/#39/#40/#41/#42/Legacy migration, ESLint/Typecheck/Build, Docker runtime 회귀를 PR CI에서 수행. 로컬 시험 NOT RUN, PR CI 결과 전 PASS 기재 금지.


## Issue #68 — GitHub Actions Run 이름 정적/실행 검증 계획 (2026-10-25)

- `TC-CI-NAME-001`: 표준 PR 제목 `#68 | Actions 실행명 정리` → `PR CI | #68 | Actions 실행명 정리`, PR 번호를 Issue로 사용하지 않음.
- `TC-CI-NAME-002`: `NO-ISSUE | 문서 정리` / 비표준 `docs: update` 입력은 각각 `NO-ISSUE` / `ISSUE-UNKNOWN`으로 명시. 제목 수정을 위해 `pull_request.edited` 이벤트를 새로 추가하지 않음.
- `TC-CI-NAME-003`: 수동 실행에서 Issue 참조·간략 설명 폼 입력/기본값 확인(기본 브랜치 반영 이후 가능).
- `TC-CI-NAME-004`: main squash `#68 | ...` / `NO-ISSUE | ...` / legacy 비정형은 `MAIN CI | ...`, tag `vX.Y.Z`는 `RELEASE | ...`로 구분. 버전/이미지 게시 성공과 실행명 구별.
- `TC-CI-NAME-005`: 기존 트리거·permissions/concurrency/기존 빌드/배포 step의 코드 diff 비교. 신규 `release-scope`/게시 `if`는 메타데이터 변경으로 GHCR가 실행되지 않는지 별도 시험.
- `TC-CI-SCOPE-001`: PR #69 파일 전부 `.md` 또는 `.github/workflows/*.yml|yaml` → main `release-scope` PASS, `build-and-push` SKIPPED, GHCR 신규 태그/푸시 없음.
- `TC-CI-SCOPE-002`: `src/`/Dockerfile/Compose 기타 실행 코드 1개라도 변경 → 원래 GHCR 게시 여부 판정 Job 진입(버전 이미지 중복 확인 등은 유지).
- `TC-CI-SCOPE-003`: `v*.*.*` Tag push → scope `publish=true`, 기존 GHCR 게시 단계 실행. baseline missing 또는 비교 실패한 main push는 오류 차단(임의 게시 금지).
- **상태:** 변경 작성; 실제 Actions run에 표시되는 값은 PR 생성 뒤 확인. Main/tag/manual 검증은 실행 전이며 PASS로 기록하지 않는다. 세부 입력/기대/제약 [Issue68](Issue68.md).


## PR #70 E2E 회귀 — Canvas 스크롤 후 2회 영역 선택 (2026-10-25)

- **TC-OUT-E2E-001 보강:** 비전체화면 일반 레이아웃의 `ViewerAppShell`/U5 확장 도크 상태에서 첫 CONVEX 선택·다운로드, PRECISE preview·`선택 해제`, **두 번째 실제 영역 드래그**가 계속 정상이어야 한다. 마우스 동작 전 Canvas 전체가 Viewport 안에 있도록 Playwright `scrollIntoViewIfNeeded` + `toBeInViewport({ratio:1})`를 검사한다. 선택된 Entity 1개를 실제로 검증하고, 곧바로 PRECISE Worker·기하·JSON 출력까지 검증한다.
- 최초 실패 [Run 40157734271](https://github.com/planner77/layoutManager/actions/runs/40157734271) / Artifact 12585362916: Canvas 화면 밖 `y=-63`, 두 번째 `mouseDown y=-58`, `선택 0개` 경과. Source/Renderer/Worker 수정이 아니라 **E2E 제어 좌표/스크롤 준비 문제**. 재CI 성공 전 regression PASS 표기 금지.
- 같은 `TC-OUT-E2E-001`을 유지하며 시험을 skip/삭제하거나 timeout만 늘리지 않는다. 세부 원장 [FailureLedger](FailureLedger.md).


## Issue #42 / U5 v0.35.0 — 타입 지정 외곽선 로컬 계약·게이트 (2026-10-25)

| AC / TC | 검증 항목 | 코드 / 상태 |
| --- | --- | --- |
| U5-01/03; TC-U5-UNIT-001 | 같은 CONVEX에 서로 다른 업무 타입, 같은 타입의 CONVEX/PRECISE, 기본 이름, type 변경 후 kind/geometry/Handle 불변 | `outline-assignment.test.ts`; TEST NOT RUN |
| U5-02; TC-U5-UNIT-002 | 미지정/미존재/비활성/다른 Scope·Version·SHA/null-lab 타입 차단, name NFC/기본값/제어 문자/길이/중복 정책 | 동일 Unit; TEST NOT RUN |
| U5-04; TC-U5-UNIT-003 | v1 JSON 파싱·출력 그대로, v2 typed/mixed 메타데이터, null legacy, 유효하지 않은 UUID/필드/Version 거부 | 동일 Unit 및 기존 `outline-draft.test.ts`; TEST NOT RUN |
| U5-02/05; TC-U5-E2E-GATE-001 | 실제 type server API 없음 404, 사용자 Viewer U5 selector/confirm disabled·안내, U4 Admin 메뉴 disabled | `issue42-outline-assignment-gate.spec.ts`; TEST NOT RUN |
| U5-01~05 운영 수용 | verified session/Scope catalogue, 401/403·type active 변경 경쟁, 원본 DXF 재파싱·Geometry tamper·409·Audit | BLOCKED #65/#31 P4; 서버 인증/DB 미구현 |

기존 #31/#40/#41/Renderer/Version/Layer/Worker/기존 v1 JSON E2E 및 legacy DB migration, TypeScript/ESLint/Vitest/production Build, DXF synthetic benchmark/Docker runtime은 PR CI 필수 회귀. 타입 데이터 공급 후 typed end-to-end는 별도 추가 필요. [Issue42](Issue42.md). **코드 작성 ≠ 실행 성공.**


## Issue #41 / PR #64 E2E 및 HTTP 비보안 컨텍스트 회귀 보완 (2026-10-25)

| TC | 검증 의도 | 관측/계획 | 
| --- | --- | --- |
| `TC-U4-E2E-PREVIEW-001` | 중복 타입 경고는 Next.js `__next-route-announcer__` 외 **prototype 내부** `role=alert` 만 검사하며 이후 수정/비활성/복구/refresh까지 검증 | [Run 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566) 기존 Locator **FAIL**, 수정 HEAD 재CI 결과 미검증 |
| `TC-U4-UNIT-005` | secure context의 native `randomUUID` 우선, getRandomValues 중복 호출 방지 | 신규 작성/재CI NOT VERIFIED |
| `TC-U4-UNIT-006` | `randomUUID` 없음→CSPRNG `getRandomValues`로 RFC UUIDv4 format·version/variant, 암호학적 난수 API 전체 부재 시 fail-closed | 신규 작성/재CI NOT VERIFIED |
| `TC-U4-E2E-HTTP-003` | `page.addInitScript`로 `crypto.randomUUID` 제거(기존 TC-ISSUE14-001과 동일) 후 메모리 시안 생성 정상·API 저장 없음·reload 삭제 | 신규 작성/재CI NOT VERIFIED |
| 기존 회귀 | U4 API GET/POST/PATCH 404, #38 disabled 관리자 메뉴, #40 outline worker·#39 layer·#25 immersive, Legacy migration, Docker | 최초 Run에서 E2E 총 55 PASS/1 FAIL 및 Legacy SKIPPED, 수정 HEAD는 재검증 필요 |

- 일반 `http://<server IP>:3000`에서 `randomUUID`는 없을 수 있으나 `getRandomValues`는 사용할 수 있다. 테스트의 method 제거는 **비보안 컨텍스트의 API 가용성을 모의**하며 실제 외부 HTTP 접속/현장 네트워크·권한 테스트 통과를 주장하지 않는다. 실서버 타입 저장/인증/RBAC/DB scope는 차단 유지. [FailureLedger](FailureLedger.md)·[Issue41](Issue41.md).


## Issue #41 / U4 v0.34.0 — 비영속 타입 시안과 Fail-Closed 테스트 (2026-10-25)

| TC | 범위 | AC/상태 |
| --- | --- | --- |
| TC-U4-UNIT-001 | NFC/trim, 대소문자 무시 중복, 비활성명 예약, scopeKey 미결정 | AC-U4-03 **부분** |
| TC-U4-UNIT-002 | 공백·제어/방향 문자·길이·정수·UUID 검증 | AC-U4-03 **부분** |
| TC-U4-UNIT-003 | 이름변경/불변 ID·createdAt/비활성·복구/Revision stale 충돌 | AC-U4-03/04 **부분** |
| TC-U4-UNIT-004 | 이름변경 중복 거부, 불변 명령, 안정적 정렬 | AC-U4-03 **부분** |
| TC-U4-E2E-PREVIEW-001 | `/lab/outline-types` 추가·중복·수정·비활성·복구, no API requests, reload 후 0건 | 비영속 UX만 검증 |
| TC-U4-E2E-GATE-002 | 실제 GET/POST/PATCH `/api/outline-types` = 404, spoofed headers/deletePassword 우회 불가(미구현 API) | AC-U4-05 **코드 경계** |
| 기존 회귀 | #38 관리 메뉴 disabled, #40 외곽선 선택/Worker, #39 레이어, #31 P4 전용 validator, #25 immersive | Viewer 호환 |
| **승인 후 신규 필요** | 인증된 Admin 세션 영속 CRUD, non-Admin 401/403, scope 분리/복구, DB Unique/FK CAS 동시 업데이트 409, 감사 기록, Migration/Restore E2E | AC-U4-01~04 **BLOCKED** |

- 로컬 npm ci/typecheck/lint/unit/build/Playwright 결과: **NOT RUN**. PR CI도 시작 즉시 성공 처리하지 않으며, 실 CAD·GPU·RBAC·DB 영속 수용은 별개.
- E2E의 API 404는 **인가 401/403를 검증한 것이 아님**. 인증/Scope 결정 전 실제 Route를 실험용으로 만들지 않는다. [Issue41](Issue41.md).


## Issue #40 / U3 v0.33.0 — 외곽선 도구 ON/OFF (2026-10-25)

| TC | 자동/수동 범위 | AC |
| --- | --- | --- |
| `TC-U3-UNIT-001` | reducer 기본 OFF, 10회 ON/OFF 반복 시 독립 레이어/트리 상태 및 reset | AC-U3-01/02/04 |
| `TC-U3-UNIT-002` | 정책 함수: DXF+three+ready+SHA 64hex+mapped >0만 허용, DWG/다른 Viewer/loading/error/0 index/invalid SHA 비활성·사유 | AC-U3-05 |
| `TC-U3-UNIT-003` | 계산 revision·enabled·AbortError에서 이전 Worker 오류 무효화, 현재 세션 오류만 표시 | AC-U3-02 |
| `TC-U3-E2E-001` | 합성 DXF/Polygon: 메뉴 Enter ON→영역선택→PRECISE Worker→임시 확정→새 CONVEX Preview→OFF(비확정 취소·Pan)→확정 Overlay/JSON Export 보존→ON 전환 후 선택 0/Preview 없음/동일 Canvas·단일 원본 GET | AC-U3-01/02/03 |
| `TC-U3-E2E-002` | 3회 ON/OFF, Layer hidden 선택 차단·기존 선택 제거, 재표시, 선택/검색/native·CSS 중 ESC 1회 한 계층 | AC-U3-01/02/04 |
| `TC-U3-E2E-003` | dxf-viewer disabled/사유, three-dxf-viewer ON 후 reload/Renderer 강제 OFF, 빈 도면 메뉴 disabled | AC-U3-04/05 |
| **기존 회귀** | `TC-OUT-E2E-001` #31 활성 메뉴 추가, private `TC-OUT-REAL-BROWSER` 메뉴 재사용, `TC-U1-E2E-001`의 미안정 Handle fixture disabled 정책, #25/#17/#26/#39 + build/test/legacy migration/Docker | 전체 |

- 합성 테스트는 **선택/Worker UI 동작** 검증이며 실 DXF Source↔Renderer 정확도·GPU/메모리/실 native Fullscreen 실증이 아니다. 사내 승인 DXF는 별도 opt-in 절차로 확인한다.
- **실행 상태:** 구현 시 작성된 TC는 PASS가 아니다. PR CI 완료 결과 및 실험 로그 확인 전 **NOT RUN / NOT VERIFIED**. 실패·취소는 실제 Run ID·Job·로그와 함께 `out/FailureLedger.md`에 보존.


## PR #48 CI #40149077671 후속 예방 회귀 (2026-10-25)

- TC-U3-E2E-001: 상단 버튼에 포커스하고 **Enter ON → Space OFF → Space ON**을 반복하여 `aria-pressed`와 실제 도구 도크가 동기화됨을 검증. 이벤트는 `SelectionController`의 capture를 통과하더라도 버튼의 native Space click을 허용해야 한다.
- TC-U3-E2E-002: 메뉴 포커스를 해제한 캔버스에서는 **Space+drag**가 선택 객체를 만들지 않으며 Pan 모드로 임시 전환/복귀. `fitToView` 이후 정상 영역 선택·레이어 hide·ESC 선택/검색/전체 화면 회귀를 계속 검증.
- CI 차단 방지: `npm run lint`의 `react-hooks/refs` 및 `react-hooks/exhaustive-deps` 검증을 Unit/Build/E2E 선행 게이트로 유지. [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671)에서 후속 시험은 실행되지 않았으므로 **SKIPPED**, 수정 HEAD 테스트는 **NOT VERIFIED**.

## Issue #40 / PR #48 — CI Run #40150085136 E2E 교정 항목 (2026-10-25)

- **`TC-OUT-E2E-001` / AC-U3-01/04:** 기존 #31 실 Polygon Union/JSON Export/ESC 경로 유지. 명시적 Reload 직후 도면 표시 완료와 `viewer-menu-outline-tool[aria-pressed=false]`, `cad-outline-tools` 미존재(기본 OFF) → ON 클릭 후 `outline-selection-count`의 `선택 0개`를 확인한다. 테스트가 OFF 화면에서 존재하지 않는 선택 패널을 찾지 않도록 한다.
- **`TC-U3-E2E-003` / AC-U3-04/05:** 두 Renderer 전환·리로드 강제 OFF 테스트의 DXF `LWPOLYLINE`에는 group `90=4`와 `10/20` 좌표 4쌍을 포함한다. `dxf-viewer` 실제 처리 완료와 `three-dxf-viewer`의 매핑/선택 가능 상태를 모두 검증하며, 오류가 나면 건너뛰거나 Renderer별 다른 시험 문서로 대체하지 않는다.
- 실제 실패의 trace에서 `n must be greater than 0 vertices`를 확인했고, [Autodesk LWPOLYLINE DXF Reference](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm)의 `90: Number of vertices`에 맞춘다. [FailureLedger](FailureLedger.md), [Issue40](Issue40.md).
- **첫 Run 40150085136**의 E2E는 52 PASS/2 FAIL. Fixture 교정 HEAD의 새 CI에서 위 TC 및 전체 54+ E2E/Legacy migration 등을 재검증하기 전 성공 판정 금지. 실도면·GPU P0/P5는 별개.

## Issue #39 / U2 v0.32.0 — 레이어 메뉴·도크 독립 상태 (2026-10-25)

| TC | 자동/수동 시험 내용 | AC |
| --- | --- | --- |
| `TC-U2-UNIT-001` | 기존 `viewer-app-state.test.ts` 강화: close idempotent, compact panel 트리 fallback·reopen/default, layer visibility는 reducer 독립 | AC-U2-01/02 |
| `TC-U2-E2E-001` | two-layer DXF의 메뉴 aria 상태·controls host, 실제 캔버스에 반영된 checkbox 효과, 메뉴 반복 토글/패널 접기 Enter→메뉴 focus→Space 재개, Canvas ref/단일 Source GET, 확대, 모바일 320px, 일반 드롭다운 선택 유지·전체 화면 복귀 | AC-U2-01/02/03/04 |
| `TC-U2-E2E-002` | native `fullscreenchange` **모의 이벤트**에서 패널 상태 보존, reload/Renderer 변경시 초기 layer reset·지원 여부 반영 | AC-U2-01/03/04 (실제 native 수용은 별도) |
| `TC-U2-E2E-003` | drawable 0개 DXF의 UI disabled/도크 미노출, aria-controls 부재 | AC-U2-04 |
| `TC-U1-E2E-001/002`, `TC-ISSUE17-001`, `TC-LAYER001~003`, `TC-ISSUE25-001/002`, `TC-TEXT-E2E-001`, `TC-OUT-E2E-001` | #38 도킹, #17 선택/전체 선택·해제/일반 드롭다운, DXF/DWG 오류, CSS/native, 검색/선택·ESC 회귀 | AC-U2-02/04 |

- CI: `npm ci`, Prisma generate, typecheck/lint, Vitest, outline benchmark, build, Chromium E2E, legacy migration E2E, Docker-runtime. 작업 브랜치의 PR `pull_request.opened` 트리거로 시작. 실행 전 **NOT RUN**, CI 시작 이후 모니터링 없으면 **결과 미확인**으로 남긴다.
- 실제 native fullscreen 허가/거절·browser top-layer·screen-reader 포커스/Tab·실 CAD GPU/장시간·좁은 화면 터치 조작은 수동 추가 수용이며 모의 테스트로 대체하지 않는다. [Issue39](Issue39.md).

## Issue #45 / v0.31.0 — Current-only 목록 및 이력 관리 시험 계획 (2026-10-25)

| TC | 검증 방법 | AC |
| --- | --- | --- |
| TC-LIST-045-001 (Vitest) | Current 파라미터 누락/true/false에서 홈 전용 쿼리 정규화, 기존 검색/페이지·pageSize 유지, API `listQuery(current=false)` 호환/오류 검증 | AC1/AC3/AC5/AC8 |
| TC-LIST-045-002 (Vitest+DB) | Current 지정 없는 층과 신/구 비Current 제외, 재지정 시 서버 결과 즉시 변경 및 API history 유지 | AC4/AC6/AC8 |
| TC-LIST-045-003 (Playwright) | 홈 초기 0건·토글 부재, Current 최신 불일치, 레거시 URL, 필터·API 이력, 기준정보 5단계→Current 없는 층 상세, Current 지정·교체·삭제 후 홈 반영 | AC1~AC8 |
| TC-E2E-001, TC-LINK-001~003, TC-NAME-002/003, TC-ISSUE-001/LIST | 기존 업로드→Current 교체/Location의 이전 Version 직접 링크·Viewer·다운로드·이름/표시 | AC6/AC7/AC8 |
| TC-LIST-003/004/005/009, TC-DELETE-002/004, TC-MASTER-003/005/007 | 기존 API Current/non-Current 계약, 페이징, Current 교체·삭제, 마스터·기록 회귀 | AC5~AC8 |

- 검증 단계: `npm ci`, `db:generate`, `typecheck`, `lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:master-migration`, 기존 Docker-runtime smoke. 사용자 요청에 따라 PR CI 트리거 후 모니터링 생략.
- 실행 결과는 이 계획의 통과 요건과 구분한다. 로컬/CI의 실행 근거가 확인되지 않은 동안 **NOT RUN / NOT VERIFIED**이며, 이력·데이터/API 손상 없음은 CI/실증으로 최종 확인한다.
- 상세 매핑: [Issue45](Issue45.md).


## Issue #38 / U1 v0.30.0 — 앱형 Viewer 회귀 시험 계획

| TC | 검증 대상 | 기대 결과 / 연계 AC |
| --- | --- | --- |
| `TC-U1-UNIT-001` | 순수 ViewerAppState reducer 기본값·레이어 열기/닫기·트리/도구 독립 전환·reset | AC-U1-03 / U2·U3·U6 상태 호스트 독립 |
| `TC-U1-E2E-001` | DXF `dxf-viewer`/`three-dxf-viewer` 직링크, 메뉴/기존 버튼, layer checkbox+panel toggle, 단일 GET·Canvas DOM, 모바일 320px backing, 검색/ESC, reload | AC-U1-01~05 |
| `TC-U1-E2E-002` | 손상된 DWG의 공통 메뉴·로딩/에러/재시도·원본/뒤로, DXF 전용 메뉴 disable | AC-U1-02/05; 정상 DWG 렌더링은 기존 `dwg-viewer.probe.ts` 별도 |
| `TC-ISSUE25-001/002` | CSS immersive/native 거절 및 in-shell loading, 링크/ESC/포커스/resize 회귀 | AC-U1-01/04 |
| `TC-ISSUE17-001`, `TC-OUT-E2E-001`, `TC-TEXT-E2E-001` | 레이어/외곽선/검색 및 한 계층 ESC·원본 요청/카메라 유지 | AC-U1-02/03/04 |

- PR CI 기준: `npm ci → db:generate → typecheck → lint → npm test → outline-benchmark → production build → chromium E2E → migration E2E`, 별도 docker-runtime job. 실제로 실행하지 않은 각 단계는 **NOT RUN**, CI 시작만으로 통과 아님.
- 수동/현장: 실제 DWG LINE, native browser top-layer, Chrome/Edge/GPU, 물류 CAD 큰 도면 성능, viewport 320px & 360px 키보드/포커스/Tab·resize·좌우 dock 동시 표시(#43 연결 후) 별도 검증. 증거 없는 항목 PASS 금지.
- `out/Issue38.md`에서 AC→코드→TC를 추적. 실패 발견 시 `out/FailureLedger.md`에 Run/Step/원인/보완/재실행을 축적.


## Issue #25 — v0.29.0 자동 CSS immersive 진입 (PR CI 전)

### PR #36 E2E 연계 변경 (Run 38974687861 기준)
- `TC-NAME-002/003`: toolbar 원본명 중복 없이 정확 표시, `viewer-toolbar` 안의 고유 원본명 locator.
- `TC-DESC-005`: `aria-label="도면 설명"` + literal multiline description을 Viewer가 처음 열릴 때 및 reload 후에 노출.
- `TC-FONT-002` (2 renderers): 기본 immersive 진입 확인, 명시적으로 normal 모드 전환한 다음 확대/Fit·한글 TEXT Canvas 검증.
- 구 Run에서는 40 PASS / 4 FAIL이며 새 HEAD는 검증 전이다.

| TC | 절차 및 완료 기준 | 실행 상태 |
| --- | --- | --- |
| TC-ISSUE25-001 DXF 2종 | 목록 → 공통 Version Viewer 자동 immersive, URL Renderer 선택, 원본·링크·재시도·툴바, Desktop/mobile 360×700/Canvas backing buffer, 신규 Browser Context/직접 URL/새로고침, native API reject/CSS 유지, ESC 일반 모드 복귀/재진입, 목록 복귀/뒤로 가기, 헤더 inert·스크롤 복구 | E2E 작성, NOT RUN |
| TC-ISSUE25-002 | Native fullscreen top-layer 상태에서 reload 원본 GET을 지연·Provider global overlay와 shell 자손 overlay를 함께 확인, 완료 시 제거·조작 비활성화/복구. `fullscreenchange` mock과 실제 native 브라우저 정책 분리 | E2E 작성, NOT RUN |
| TC-LINK-001..003 | 기존 URL/UUID/renderer/복사 및 fallback. 신규 direct context에서 자동 immersive/native=false | E2E 수정, NOT RUN |
| TC-ISSUE17-001, TC-LAYER001..003 | 전용 전체 화면 레이어 패널, 일반 LayerDropdown, 선택/비선택, Switch·Reload·모바일, view state/Canvas reuse | 기존 E2E 기본 진입 대응 수정, NOT RUN |
| TC-DXF/THREE-001, TC-SWITCH-001/002 | 확대/축소/맞춤/Pan, ESC/전체 화면 전환, Back·재진입, 전역 Loading/중복, WebGL cleanup | 기존 E2E 기본 진입 대응 수정, NOT RUN |
| TC-TEXT-E2E-001, TC-OUT-E2E-001 | DXF 검색·선택/외곽선 overlay, fullscreen CSS 및 일반 전환 | 기존 E2E 기본 진입 대응 수정, NOT RUN |
| TC-MET-001, TC-E2E-001 | 기존 일반 Viewer에서 측정 JSON·등록·전환 검증, default immersive에서 명시적 일반 모드 복귀 | 기존 E2E 수정, NOT RUN |
| TC-E2E-002/DWG-001/003 | DWG 기본 CSS immersive·libredwg-web 강제·성능/도면 재진입·오류/재시도/cleanup | 별도 DWG probe 회귀 수정, NOT RUN |
| TC-FOCUS-001 | 실제 데스크톱 Chrome/Edge, 모바일 크기에서 tab/ESC/native 거절·화면 낭독기 상태·주소창 동작 수동 점검 | 실기기 NOT RUN |

검증 명령(승인된 환경): `cd src && npm ci && npm run db:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`. DWG는 `npm run prepare:dwg-samples && npm run test:dwg`의 전용 config 사용. PR CI가 동작하기 전까지 PASS 표시 금지. [Issue25](Issue25.md).



## Issue #31 v0.28.3 추가 시험 설계 — CI 대기

| ID | 확인 내용 | 증거 |
| --- | --- | --- |
| TC-OUT-ID-BLOCK-PARTIAL | BLOCK 미지원 child가 있으면 INSERT geometry 부분 계산이 있더라도 stable=false, 안전한 선택·영속 참조 제외 | Unit 신규 |
| TC-OUT-GEO-CURVE-CAP | 실제 반경에 필요한 샘플 수가 512 초과하면 0.02 WCS sagitta 정확도를 주장하지 않고 거부 | Unit 신규 |
| TC-OUT-CANON-001..004 | Source SHA/Version/Units/Handle/GeoJSON에 의한 canonical recompute; 변조·존재하지 않는 Entity 거부 | Unit 신규 |
| TC-OUT-PERF-100K | CI synthetic 1k/10k/100k Parse/SpatialIndex/Query/Convex CPU/heap 출력, 요청 수·파싱 수 동일 | `npm run test:outline-benchmark` PR CI |
| TC-OUT-REAL-001 | 폐쇄망 승인된 DXF 3종: Source↔Renderer, Insert/BLOCK/OCS/거리·Polygon 면적을 CAD 기준 값과 대조 | 실제 파일/수치 기준 미확보 |
| TC-OUT-REAL-002 | `npm run test:outline-acceptance` 5회 Browser Load, 화면 mapping/선택, p50/p95, JS heap, CPU/GPU 기록 | private env input 미확보 |
| TC-OUT-P4-001 | IdP/RBAC/Scope/세션/감사 정책 확정 후 Write API/CRUD/CAS/Version 삭제 및 인증 오류 | **Owner 승인 전 보류** |

**신규 PR CI 통과와 현장 실DXF 수용은 별개**. 미실행 항목을 PASS로 표기하지 않는다. [Issue31](Issue31.md).


## Issue #31 v0.28.2 — Production Worker / 실도면 후속 계획 (PR CI 전)

| TC | 시험 계약 | 신규 실행 결과 |
| --- | --- | --- |
| TC-OUT-EXPORT-001 | `polygon-clipping` default 객체의 실제 `union` 함수 호출, ESM 진입점 호환 | Unit 작성·미확인 |
| TC-OUT-EXPORT-002 | PRECISE 겹친 정사각형 면적 80 WCS² | Unit 작성·미확인 |
| TC-OUT-EXPORT-003 | ANSI 포함 Webpack import/export 오류가 빌드 exit 0이어도 fatal 판정 | Unit/Build 게이트 작성·미확인 |
| TC-OUT-E2E-001 확장 | Production Worker PRECISE 확정→JSON 파일의 SHA/Version/Handle/Polygon Ring/10,000 WCS² 실제 확인 | E2E 작성·미확인 |
| TC-OUT-PERF-002 | CI `npm run test:outline-benchmark -- --quick`에서 synthetic 1k 파서·인덱스·계산 | CI Step 작성·미확인 |
| TC-OUT-REAL-003 | 내부 승인된 실DXF 3종 Source-only `npm run audit:outline -- --file ...`: SHA/Entity 안정성/OCS·단위/CPU·메모리; 원본 불변 | 현장 원본 미제공·미실행 |
| TC-OUT-REAL-004 | 실제 1k/10k/100k 도면의 화면 1:N Renderer/Worker/GPU·클릭 p50/p95와 CAD 수치 기준값 교차 확인 | 미실행 |
| TC-OUT-P4-002 | Owner 권한 정책 승인 후 OIDC 또는 로컬 인증/RBAC/Version scope/서버 재계산/CRUD/revision 409/감사 | 정책 미승인, 구현 보류 |

미실행 TC를 PASS로 기록하지 않는다. 신규 PR CI가 성공하더라도 실설비 도면 수용·P4 완료와 구분한다.


## Issue #31 잔여 검증 — 0.28.1 (PR CI 전)

| TC | 방법/Acceptance | 상태 |
| --- | --- | --- |
| TC-OUT-MAP-001..003 | unique Handle/1:N Renderer World bounds 합산, 타입·레이어·좌표 mismatch 차단 | Unit 작성·미실행 |
| TC-OUT-SPATIAL-001..002 | 1,000개 selection bbox ↔ brute-force 동일, giant Entity Overflow 상한 | Unit 작성·미실행 |
| TC-OUT-DRAFT-001..004 | Version/SHA/불안정 ID/중복 참조/비유한 좌표/열린 ring/Algorithm 거부 | Unit 작성·미실행 |
| TC-OUT-E2E-001 확장 | 실제 브라우저에서 source-render mapping exclude=0, 기존 Selection/Preview/Fullscreen/JSON | E2E 작성·미실행 |
| TC-OUT-BENCH-001 | `npm run test:outline-benchmark`로 synthetic LINE 1k/10k/100k index/query/convex/heap delta JSON | 실행 수치 미확인 |
| TC-OUT-REAL-001 | 실제 DXF 소·중·대형 3종: WCS·BLOCK/INSERT·Layer/OCS·Hash·외곽선 면적 및 좌표 대조 | 현장 샘플 미제공/미실행 |
| TC-OUT-REAL-002 | 실도면 1k/10k/100k Pan/Zoom/FullScreen·Worker·GPU·browser heap/input p50/p95 반복 | 현장 샘플/측정 미실행 |
| TC-OUT-P4-001 | 정책 결정 시 401/403/CSRF/Version FK/SHA canonical reparse/CAS revision409·삭제 정합성 | Owner Auth Policy 결정 대기 |

측정한 조건·설비·Node/브라우저·CPU/RAM·도면 Entity 구성·Unit/Scale 및 실제 실행값 없이는 PASS 판정하지 않는다. synthetic benchmark는 기본 PR CI에 자동 추가하지 않는다. [Issue31](Issue31.md).



### Issue #26 / CI #55 — 기존 Workflow E2E 페이지네이션 비의존성

- TC-E2E-001: V1과 V2를 2026-09-08 business registeredAt으로 등록하더라도 목록에는 다른 E2E에서 생성한 최신 2026-10-16 항목이 25개 이상 있을 수 있다. 최초 '/ ' 목록의 page 1에 새로 등록된 과거 일자 Version이 있다는 전제를 제거한다.
- 등록 성공(HTTP 201 및 Vn 등록 완료) → 목록 이동 → 원본 파일명 release-vN.dxf로 UI 검색 → 현재 업로드 response.id 기반 version 행의 파일명과 ● Current 상태 확인. 전체 목록 페이지 분할 및 기존 Current 교체·검색·Viewer 검증은 유지한다.
- CI #55 (38878433970)는 browser E2E 40/41 PASS. TC-TEXT-E2E-001 양 renderer PASS, TC-E2E-001만 FAIL, Legacy migration skipped. 새 PR CI로 전체 E2E 및 legacy migration을 확인한다.


### Issue #26 — main(#31) 통합과 캐시 인덱스 로딩 종료 회귀

- TC-TEXT-E2E-001: dxf-viewer→three-dxf-viewer 및 역방향 전환 시 동일 메모리 CAD 원본/인덱스 재사용, "검색용 텍스트를 분석 중" 상태가 종료되고 "검색 결과 3개"가 표시되며 World focus가 가능해야 한다. 기존 #54의 두 렌더러 공통 실패를 재검증한다.
- TC-OUT/Issue31 기존 객체 선택·외곽선 E2E는 merge 이후에도 유지하며, SelectionController와 CadTextSearch가 공통 Viewer shell에서 서로 간섭하지 않아야 한다.
- 기존 main version 0.27.0에 DXF 검색 기능을 추가하므로 병합 후보 version 0.28.0. 전체 lint, unit, build, E2E, legacy migration과 Docker PR CI 결과는 새 run 이후 판정한다.



### Issue #26 / CI #52 — Fixture source and presence regression gate

- TC-TEXT-FIXTURE-001 (Unit): actual DXF fixture shared by Browser E2E must contain exactly 3 parsed TEXT hits and 1 parsed MTEXT hit. Its MTEXT has 41=240, 71=1, 72=1 and rendered/searchable string "검사 구역 45"; verify three copies of "abc 123" separately.
- The Browser TC-TEXT-E2E-001 must import the SAME fixture generator, not maintain a duplicate DXF literal or entity creation hidden after a single-line comment. Build each DXF group-code/value as array members and join with real newline characters.
- CI #52 demonstrated 125 successful Unit/Integration tests but no fixture coverage, causing Browser E2E to fail at the MTEXT search after three TEXT navigation assertions. Corrected scope requires Unit fixture gate first, then complete Browser E2E and Legacy migration E2E.
- CI #52 run: https://github.com/planner77/layoutManager/actions/runs/38872015982



### Issue #26 / CI #49 Browser E2E MTEXT renderer interoperability

- TC-TEXT-E2E-001의 합성 DXF MTEXT 필수 명시값: group 41=240(reference width), group 71=1(top-left attachment), group 72=1(left-to-right); TEXT group 5는 16진 handle을 사용한다.
- 수용: dxf-viewer와 three-dxf-viewer 각각 최초 표시 성공, 3개의 분리된 TEXT 결과에서 위치 이동·줌, MTEXT 검색·이동, 전체 화면과 renderer 전환 뒤 재검색, 원본 다운로드 단 1회 유지.
- CI #49에서 38개 Browser E2E 성공, 새 두 케이스는 MTEXT 71 누락으로 RenderMText "Unhandled alignment". 수정 후 신규 CI에서 두 케이스, 기존 38개, Legacy migration 검증 확인 필수.
- 근거: https://github.com/planner77/layoutManager/actions/runs/38868174246



### CI #46 대응 — TC-TEXT-001과 011

- TC-TEXT-001: 실제 MTEXT 그룹 코드 fixture에 fraction 앞 명시적인 ASCII 공백이 있으며 표시 문자열 "생산 ABC 동 12 1/2가"와 정확히 일치하는지 확인한다.
- TC-TEXT-011: group 3 + 1 연속 텍스트 "AB"+"CD"는 "ABCD", "AB "+"CD"는 "AB CD"가 되어야 한다. 데이터에 없는 공백을 검색 문자열에 조작해 넣지 않는다.
- 신규 PR CI에서 Unit/Integration을 통과하고 나서 Build/Browser E2E를 확인한다. 이전 CI #46의 Build/E2E는 미실행으로 기록한다.



### Issue #26 — CI #42 보완 회귀

- TC-TEXT-010: DXF Unicode escape \U+00B0C는 °C, MTEXT/검색 키 동일 처리. Reviewer의 4자리 고정 escape 계약을 unit/dxf-text-index.test.ts에서 검증한다.
- UI 규칙: viewer.tsx 렌더 중 ref.current를 참조하지 않고 getter를 통해 effect/이벤트에서만 사용한다. PR CI ESLint react-hooks/refs와 기존 Viewer E2E를 회귀 기준으로 한다.
- PR CI #42에서 ESLint 실패하여 Unit/Browser는 미실행이었다. 수정 후 새로운 CI 결과를 실제 확인하기 전 수용 PASS 아님.



## Issue #26 — 검색/좌표/생명주기 검증 계획 (0.27.0)

| Test case | 기준 | 증거 위치 | 상태 |
| --- | --- | --- | --- |
| TC-TEXT-001 | TEXT/MTEXT·한글·영문·숫자·NFC/서식/개행 일치 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-002 | 동일 문자열의 3개 서로 다른 좌표 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-003 | BLOCK base point와 2D scale/rotation/translate | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-004 | hidden/OCS/ATTRIB/없는 BLOCK 제외 기록 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-005 | 손상/이진/HTML literal 안전성 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-006 | 순환 INSERT 조기 종료 | unit/dxf-text-index.test.ts | CI 전 |
| TC-TEXT-E2E-001 | 두 DXF 렌더러, 3위치 Pan/Zoom, 검색, 전체 화면, Renderer 변경 원본 공유 | e2e/text-search.spec.ts | CI 전 |
| TC-TEXT-007 | Manager focus 위임, 이상 bbox 거부, Worker 취소·재시도 | viewer unit + 환경 회귀 | 증거 확대 필요 |
| TC-TEXT-008 | Layer 숨김, 빠른 연속 검색/Version 교체, 2만 건, 모바일 | 확대 E2E/실도면 | 미실행 |
| TC-TEXT-DWG | 실제 DWG TEXT/MTEXT 추출→렌더링→focus 기술 검증 | 독립 DWG 실험 | 미실행/비지원 |

검증 기준: 실제 camera 중심 이동/줌, 다른 Version 유실·worker 누수 없음, 검색 결과가 이전 Version 좌표를 참조하지 않음. 외부 실도면 미제공으로 합성 fixture와 운영 인수 기준을 구분한다. 테스트 실행 전 PASS를 기입하지 않는다.


## Issue #31 — 검증 계획 (0.27.0 PR CI 재검증 전)

| Case | 증거 계획 | 현재 상태 |
| --- | --- | --- |
| TC-OUT-ID | 합성 DXF Unique/Duplicate Handle, Version/SHA, 회전·스케일 INSERT WCS | Unit 코드 작성·미실행 |
| TC-OUT-GEO1 | Monotone Hull 극점/공선/원호·OCS 실패 | Unit 코드 작성·미실행 |
| TC-OUT-GEO2 | 오목 L, 중첩 Union, MultiPolygon, hole, 연결 LINE, 열린/자기교차, 오목 경계와 교차하는 도형 | Unit 확장·미실행 |
| TC-OUT-E2E-001 | DXF Viewer 클릭/영역, 볼록·정밀 Preview/JSON, fullscreen/reload, preview 무효화·CSS fallback Esc | E2E 확장·미실행 |
| AC-SEL-002/REG-001 | 기존 전체 DXF/DWG/레이어/Fullscreen/Version E2E 무회귀 | PR CI 대기 |
| AC-ID-001/AC-PERF-001 | 실제 설비 DXF Object3D↔Entity mapping 및 1k/10k/100k 수행시간·정확도 | P0/P5 BLOCKED(샘플·실측 필요) |
| AC-DATA-002 | 쓰기 정책/무권한/동시 충돌 검증 | P4 BLOCKED(Owner 권한 정책 결정 전) |

실행하지 않은 항목을 PASS로 기록하지 않는다. [Issue31](Issue31.md) 상세 추적표 참고.


## Issue #28 — 이미지 경량화 검증 항목 (0.26.0)

| TC | 검증 내용 | 자동 검증 | 현재 |
| --- | --- | --- | --- |
| TC-IMAGE-001 | standalone PORT/기존 `--port` 계약 | `standalone.test.ts` | CI 전 |
| TC-IMAGE-002 | static/font/license/WASM 복사 및 HTTP 접근 | unit + Docker curl + Viewer E2E | CI 전 |
| TC-IMAGE-003 | migrator/runtime 타깃 구분/완료 의존 | unit + Compose config | CI 전 |
| TC-IMAGE-004 | 3단계 크기/레이어/비압축·gzip 측정 | Docker job `measure-images.sh` | CI 전 |
| TC-IMAGE-005 | 빈 DB migration→backfill→health 200 | Docker compose fresh install | CI 전 |
| TC-IMAGE-006 | migration 실패 시 nonzero/app 기동 차단 | 불가용 DB 경로 + depends_on | CI 전 |
| TC-IMAGE-007 | migration 재실행/legacy 데이터 불변 | Docker rerun + legacy E2E | CI 전 |
| TC-IMAGE-008 | DXF/DWG/삭제·S3 기능 회귀 | 기존 Unit/E2E/S3 | CI 전 |
| TC-IMAGE-009 | UID10001, native, Secret 제외, GHCR 복수 태그 | Docker/CI/Publish 확인 | CI 전 |
| TC-IMAGE-010 | 로컬/tagged/tagless/registry port/digest 이미지 쌍 정규화·검증 | `compose.sh --print-images` + unit (Linux) | 재검증 대기 |
| TC-IMAGE-011 | 두 GHCR candidate 성공 전 공개 태그 게시 금지, release 취소 방지 | workflow 순서/후보 태그 unit + 게시 단계 | CI 검증 전 |
| TC-IMAGE-012 | Compose Node 초기 기동 중 connection reset(56) 회복 | PR Docker smoke: `curl --retry-all-errors` health/restart | 실패 run 38858349603 보완·재검증 대기 |

실제 실행 전 PASS를 기록하지 않는다. 독립 QA/실서비스 DB·S3 검증은 별도이다. `Issue28.md`와 `TestReport.md` 참고.


## GitHub #7 — 목표 0.19.1

- TC-TITLE-001: 목록·등록의 banner 홈 링크 accessible name `Layout Manager`, CAD/P.O.C. 부재, 아이콘 및 홈 이동 보존. 실제 화면 캡처와 기존 관련 Browser 회귀, typecheck/lint/build로 검증한다.
- root 요구/AC → Sol 공통 layout 문구 수정 → root review → Luna 독립 검증 → root commit/push·GHCR 이미지 확인·백업/배포·이슈 종료. DB/API/Viewer 변경 및 신규 중복 테스트는 없다.

## GitHub #6 — 목표 0.19.0

- TC-NAME-001: 이름 생략/공백 기본값, trim/NFC,255/256 경계·제어문자/타입 거부, HTML plain text. 실제 transaction 순번 V1/V2 및 삭제 후 순번 비재사용으로 기본 이름 계산을 검증한다.
- TC-NAME-002: 실제 multipart에서 사용자 이름/설명/기존 필드 모두 등록, 공개 응답·list/Location/Viewer 표시 일치, 원본 파일명 검색/bytes 보존 및 잘못된 입력의 정리 확인.
- TC-NAME-003: Browser에서 기본 이름 안내·선택 입력·사용자 이름 우선·새로고침 유지·기존 파일명 보조 표시/검색·Viewer/삭제 확인 이름, 긴 이름의 목록 레이아웃을 검증한다. 기존 이름 기반 E2E locator는 보조 파일명 또는 의미에 맞게 수정한다.
- TC-NAME-004: 0.18.0 populated DB에 새 migration 적용, 기존 모든 metadata/Current/hash/locator/순번 보존과 기본 이름 조회, FK 및 재실행을 검증한다. typecheck/lint/unit/build/local 전체 E2E·S3 통합·DWG 회귀를 수행한다.
- root Manager 요구/설계 기록 → Sol Developer 구현/집중 시험 → root review → Luna QA 독립 검증/문서 → root commit/push·이미지 검증·백업/배포·GitHub 댓글/종료.

## GitHub #5 — 목표 0.18.0

- TC-LAYER-001: 서로 겹치지 않는 3개 레이어의 합성 DXF를 실제 three-dxf-viewer에서 연다. 초기 전체 선택, 여러 항목 토글 후 메뉴 유지/체크 상태/선택 개수, canvas 이미지의 차이 및 재선택 복원을 확인한다. 전체 해제→빈 canvas, 전체 선택→원래 canvas 복원을 확인한다. 메뉴 overlay를 닫고 canvas 픽셀을 비교한다.
- TC-LAYER-002: 메뉴 닫기/재열기 시 선택 유지, 재로드/Renderer 전환/다른 Version 이동 시 초기화와 이전 항목 미노출. 레이어 조작 동안 원본 GET 및 Viewer canvas 재생성 없음, 기존 20회 Viewer 전환/오류/빈 도면/DWG 회귀에서 메뉴 부재를 확인한다.
- TC-LAYER-003: 키보드 열기/이동/Space 토글/Escape 닫기·포커스 복귀, 긴 이름/많은 항목과 좁은 viewport의 메뉴 경계/내부 스크롤·전체선택 버튼 접근. 실제 합성 fixture와 화면 근거로 확인하며 미실행 범위를 구분한다.
- Manager AC/설계 → Sol Developer 구현/집중 시험 → Manager review → Luna QA typecheck/lint/unit/build/local 전체 Browser·DWG 전용 회귀/시각 확인 → root commit/push/게시/배포/이슈 댓글·종료. S3 저장소는 API/저장소 미변경으로 전체 재실행하지 않는다.

## GitHub #4 — 목표 0.17.2

- TC-DELETE-LAYOUT-001: 현행 빌드에서 긴 파일명/위치/Current 경고가 대화창 경계를 넘는지 재현하고 수정 후 같은 조건으로 비교한다. 목록과 Location 상세, desktop 1280×800 및 좁은 viewport 375×667에서 panel 및 내부 요소의 가로 넘침 0, 텍스트 줄바꿈과 입력/버튼 영역을 확인한다.
- TC-DELETE-LAYOUT-002: 높이가 낮은 viewport에서 dialog 내부 스크롤을 통해 내용/버튼에 접근하며, 포커스 초기화·Tab/Shift+Tab 격리·Escape/취소·호출 버튼 복귀와 비밀번호 초기화를 확인한다. 처리 중 Escape/외부 클릭은 닫지 않는다.
- TC-DELETE-LAYOUT-003: 잘못된 비밀번호, 202 정리대기 및 결과 불확실 UI도 줄바꿈/버튼 접근을 유지한다. 기존 실제 삭제 Browser 2건을 회귀한다.
- Manager가 AC/설계를 기록하고 Sol Developer가 구현/회귀 시험을 보강한 뒤 Luna QA가 typecheck/lint/unit/build/local Browser와 스크린샷을 검증한다. 기존 운영 데이터는 시각 재현·삭제 시험에 사용하지 않는다. 검증 뒤 root가 commit/push·GHCR 배포 및 이슈 결과 댓글/종료를 수행한다.

## GitHub #2 / #3 — 목표 0.17.1

- TC-DESC-005 강화: UI에서 여러 줄 메모 입력→등록→목록/Location/Viewer 표시→새로고침 후 유지. 기존 선택 필드·literal 검색도 회귀한다.
- TC-PREFLIGHT-001: 실제 브라우저 File의 100 MiB - 1 / 정확히 100 MiB / 100 MiB + 1 경계와 설정 변경에 따른 기준 일치. 과대 선택은 즉시 현재 최대 용량 안내·선택 초기화·POST 0회.
- TC-PREFLIGHT-002: 정상 파일 재선택으로 오류 해제·등록 가능; change 이벤트를 우회한 제출도 과대 파일 POST 0회. 기존 업로드 진단 UI 유지.
- TC-PREFLIGHT-003: 클라이언트 검증 우회 API에서 서버 FILE_TOO_LARGE/413 유지, 기존 정확한 서버 크기 경계 회귀.
- Manager(root)가 요구사항/AC를 기록하고 Developer 구현 검토 후 QA가 독립 검증한다. typecheck/lint/unit/build/관련 Browser 결과와 실제 소스 commit/push를 TestReport에 기록하고 통과한 이슈만 요약 댓글 후 닫는다.
- 게시 전 DELETE 회귀: 기존 미게시 변경의 repository 비밀번호 검증 누락을 보완하고 검증한 hash를 transaction에서 재확인한다. KDF 동시 실행/대기열·실패 시도 카운터를 제한하고, 원본 정리 대기202 및 결과 불확실 안내, backfill 검증을 실제 시험한다. 이전 U-DELETE 기록 중 실행 근거 없는 통과 주장은 이번 결과로 정정한다.

## Unit DELETE 실행 계획 — 2026-09-11 사용자 요청 / 목표 0.17.0

Manager 설계→Sol 구현→Manager review→Luna QA 시험/문서→Manager 판정→root release/운영 적용. 승인 범위는 신규 비밀번호·선택 Version 삭제·기존 비밀번호 `1234` 초기화다. 비밀번호/삭제 설정 변경이 있는 기존 데이터는 실제 적용 전 백업하고 검증한다. 이번 설계 기록 시 모든 아래 TC는 NOT RUN이다.

| TC | Acceptance Criteria / 시험 |
| --- | --- |
| TC-DELETE-001 | 신규 password 필수, 길이4/128 경계·누락·초과·제어문자·UTF8한도, 앞뒤공백/Unicode 그대로 검증, 랜덤salt로 같은 비밀번호 hash가 다름, 맞음/틀림·잘못된 hash 형식·KDF 제한. 평문 및 hash가 public DTO·로그·URL·HTML에 없음. |
| TC-DELETE-002 | Browser 등록 비밀번호→목록/Location 삭제 dialog→취소/오입력 시 불변→정답 명시 삭제→목록 제거. 입력 masking/비우기, 오류·429·네트워크 불확실 상태, 사용자 선택 외 자동 삭제 0회. |
| TC-DELETE-003 | DELETE HTTP: 누락/틀린 비밀번호/다른 Version 비밀번호/비UUID/외부 origin/잘못된 content-type·JSON/1KiB초과 거부. 60초 실패 횟수 및 KDF 동시수 제한. 성공200, 원본 정리대기202, 이미 삭제404. |
| TC-DELETE-004 | Current/non-Current/마지막 Version 삭제, 다른 Location 보존, Current=NULL(자동승격 없음), nextVersion 비재사용. 등록·Current 변경·동일 대상 삭제 경쟁/transaction rollback, 직접 SQL Current 소속 FK 유지. 목록/search/상세/metadata/content/Viewer 직접 링크 삭제 접근 차단. |
| TC-DELETE-005 | 실제 local/S3 삭제와 이미 없는 원본, storage 실패/응답 유실/job 삭제 실패/COMMIT 불확실을 주입. DB 승인 전 삭제 0회, DB 삭제 뒤 pending job 영속, 재시작 후 storage:cleanup의 승인 job만 처리·경로 보호·멱등, 사용자 원본 다른 파일 보존. |
| TC-DELETE-006 | 0.16.0 schema+여러 Version+Current+local/S3 locator fixture에서 migration/backfill. 기존 모든 행이1234로검증, salt독립, ID/순번/설명/hash/locator/Current 불변. 재실행/중단 후 재개가 신규 비밀번호를 덮지 않음. foreign_key_check·trigger 및 nextVersion 초기값 확인. |
| TC-DELETE-007 | password/hash/salt canary를 등록·삭제 실패, JSON·Console·서버 로그·진단파일·public DTO/HTML/검색 응답에 검사. 비밀번호 URL/로컬저장소 미사용, 잘못된 입력이 요청 dump로 남지 않음. |
| TC-DELETE-008 | typecheck/lint/unit/build/local E2E/S3 관련 E2E 및 기존 DWG/업로드 진단 회귀. Docker db:deploy/backfill→healthy, 실제 대상 DB 사전 백업·기존1234 확인(삭제 없이 hash검증), 버전/문서·commit/push·배포 결과를 실제 수행 범위로 기록. |

완료 시 `U-DELETE-20260911`에 요구→구현→TC→결과, 실제 역할·명령·counts/재작업·제약·DB 적용 및 배포 여부를 남긴다. 비밀번호 없는 기존 등록 클라이언트의400은 의도된 API 변경이며 release 안내에 명시한다.

## Unit OBS 실행 계획 — 2026-09-09 사용자 요청

- 범위: FR-OBS-001/002, NFR-OBS-001–003. Manager 설계→Sol 구현→Manager review→Luna QA 시험/문서→Manager 판정→root commit/push/배포. 목표 0.16.0, DB migration 없음. 실제 역할 대행은 TestReport에 기록한다.
- AC: 전체 안전 진단 표시·복사·저장과 서버 ID 기반 추적, 통신/프록시/업무 오류 구분, 민감정보 비노출, 기존 원본·Current 보존 및 자동 재등록 방지. 필수 typecheck/lint/unit/build/E2E와 관련 회귀 통과.

| TC | 검증 방법 및 기대 결과 |
| --- | --- |
| TC-OBS-001 | 실제 검증 오류의 화면 요약·상세에서 버전/시각/코드/상태/서버 ID 일치. 텍스트 선택·복사·JSON 다운로드 내용 일치 및 재시도 시 이전 오류 초기화. |
| TC-OBS-002 | Clipboard 없음·거부, 긴 내용: 안전 진단 전체를 스크롤·선택·저장 가능. 복사 실패에 미처리 예외가 없고 Console은 공개 진단만 출력. |
| TC-OBS-003 | Browser 주입: HTML 413/502/504, 빈 응답, malformed JSON, 임의 JSON 오류, 잘못된 2xx 성공 구조, 연결 중단. HTTP 상태 보존, 없는 서버 ID 표시, raw body/예외 비노출, 불확실 결과에 목록 확인 및 자동 재업로드 0회. |
| TC-OBS-004 | origin/context 초기화 실패에도 ID 확보. 실제 성공/실패 응답 header/body/log ID 일치, 동시 요청 격리, 실제 단계·경과 시간·최종 결과·backend 확인. |
| TC-OBS-005 | 격리 장애 주입: 용량 한도, 디스크 EACCES/ENOSPC, DB 실패, S3 연결/권한/timeout. 원인·실패 단계 보존, S3 공개 문구와 cause 분리, 이전 Current/원본 및 불확실 PUT 보존. 실장비 장애와 주입 시험을 구분. |
| TC-OBS-006 | 수신/DB 오류와 cleanup 오류 동시 발생 시 최초 원인 유지·별도 정리 경고. 확정 등록 후 임시 정리 실패는 성공 유지. COMMIT/DB 확인 불확실 시 기존 보상 원칙 유지. |
| TC-OBS-007 | 화면/Console/JSON 및 서버 로그에 canary credential, Authorization, credential URL, endpoint·경로, SQL+사용자 설명, 파일명/bytes, SDK 객체·순환 cause·개행·장문을 주입하여 허용 필드/마스킹/제한 확인. 안전한 운영 code/cause 식별은 유지. |
| TC-OBS-008 | Compose 격리 컨테이너의 logging driver/options, 요청 ID 로그 수집·검색, healthy/업로드/원본 보존·재생성 확인. 지정 GHCR 0.16.0 push/pull digest와 실제 배포 상태 기록. 로그 한도 도달 시험 미실행은 별도 명시. |

- TestReport `U-OBS-20260909`에 실제 명령/총수/결과, 재작업·미검증, 요구→구현→TC 근거 및 배포 결과를 기록한다. 실제 폐쇄망 장애 재현과 합성 장애 시험을 구분한다.

## Unit DESC 실행 계획 — 2026-09-09 사용자 요청

- 도면 설명은 CadFileVersion별 선택 입력으로 저장한다. 최대2000 UTF-16 code units, trim+NFC 및 CRLF/CR→LF 정규화, LF/TAB허용·기타제어문자거부, HTML은 plain text로 렌더링한다. 생략은 빈 문자열이며 등록 후 편집은 이번 범위에 없다.
- DB는 description TEXT NOT NULL DEFAULT '' additive migration, 기존 version/current/storage/원본 보존. 원본무결성 및 Location current 규칙을 바꾸지 않는다.
- 등록 textarea, 목록/Location 미리보기, Viewer 전체 설명을 표시한다. 별도 description 검색은 앞뒤공백제거/NFC 후 대소문자 구분 literal substring이며 filename/위치/형식/current와AND 조합한다. SQL instr parameter 사용, wildcard와query확장금지. 기존 paginationURL 보존.
- TC-DESC-001: 선택/생략/정규화/2000경계/2001초과/비문자/control/개행/HTML plain text 검증.
- TC-DESC-002: 기존schema+rows에서migration 적용 후 description빈값, Version/Current/원본locator보존, 신규등록설명영속.
- TC-DESC-003: 설명 단독/filename독립/기존filterAND/pagination/한글NFC/%/_/따옴표 literal/중복query거부.
- TC-DESC-004: API 설명등록·구버전설명생략·validationfail, 목록/상세/ViewerDTO의내용일치 및현재버전정합성.
- TC-DESC-005: UI에서 filename에없는설명단어 등록→설명검색만으로찾기→목록/Location/Viewer본문확인, HTML실행안됨/개행보존. typecheck/lint/build/unit/E2E 및문서schema검토.
- TC-LIST-004: 홈 목록에서 `Current 지정`을 눌러 선택한 Version을 Current로 변경하고 기존 Current 해제·새로고침 후 목록/필터 일치를 확인한다.
- Manager 설계→Sol 구현→Manager review→Luna QA검증/문서→Manager승인/재작업. 모델제한은사실대로기록하고root가release/실제DB백업·migration/게시를담당한다.

## Unit 8B 실행 계획 — 2026-09-09

- DWG Viewer가 Worker에서 측정한 WASM 초기화·DWG 파싱 시간을 공통 Metrics JSON에 전달한다.
- `parseMs`와 `initializeMs`가 실제 DWG 성공·partial 결과에서 null이 아니어야 하며, DXF와 실패·취소 결과의 미계측 사유는 유지한다.
- TC-MET-003: adapter stage metric 전달 단위 검증 및 등록 DWG Browser metric의 초기화·파싱 값/Entity 수/partial coverage 확인.
- Manager/Developer 사용량 제한으로 root가 구현·검증을 대행하고, 미실행된 실도면·장기 메모리·GPU/WASM 메모리 시험은 NOT RUN으로 기록한다.

## Unit DEPLOY 실행 계획 — 2026-09-08 사용자 요청

- Manager 설계→Sol Developer 구현/재작업 완료→Manager 리뷰. Luna QA 사용량 제한으로 root가 실제 시험을 실행하고 Manager가 결과·문서로 수용 여부를 판단한다. 패키지 버전 0.13.0, LINK 0.12.0과 commit 분리.
- TC-DEPLOY-001: `/api/health`가 migration 완료 DB에서 HTTP200 `{status:ok}`와 no-store, 조회 실패 시503의 안전한 상태만 반환. 기존 앱/API/CAD 회귀 및 type/lint/unit/build 통과.
- TC-DEPLOY-002: root context에서 Docker build 성공. named project/container/volume/network/port 및 한국어 주석, nonroot UID, Prisma native SQLite/WASM/한글 자산 확인. image에 실제 `.env`, Git 인증, 호스트 DB/원본이 없는지 검사.
- TC-DEPLOY-003: 별도 test volume/container에서 DXF 등록→원본 byte/hash/목록 확인→container 재생성→DB/원본 유지. 기존 서비스와 사용자 data/volume은 변경하지 않는다. 컨테이너가 healthy 상태가 되는지 확인.
- TC-DEPLOY-004: published port에 localhost 및 실제 host IP로 HTTP200/목록·등록/health 접속. 다른 물리 장치가 없으면 host 자신의 host IP 시험과 구분해 기록한다. private origin 링크는 네트워크 접근 조건을 명시한다.
- TC-DEPLOY-005: 지정 GitHub 소유자 GHCR에 검증한0.13.0 image push, digest 확인 및 pull 검증. credential은 password-stdin/임시 credential store 등 안전한 경로로 전달하고 image/buildarg/git에 넣지 않는다. 접근 실패는 권한·연결 범주만 기록.
- 완료 조건: 각 실제 결과/제약·README pull 및 setup 방법·Architecture/Operation/Decisions/ChangeLog 갱신, root audit/commit/push. 기능이 실행 가능해도 image push/pull 근거가 없으면 게시 완료라 하지 않는다.

## Unit LINK 실행 계획 — 2026-09-08 사용자 요청

- 특정 Version을 바로 여는 절대 URL을 목록·Location 버전 목록·Viewer에서 복사한다. Viewer에서는 현재 허용된 renderer를 유지하고 목록에서는 형식별 기본값을 사용한다. Current 교체 후에도 원래 Version을 연다.
- URL은 현재 origin과 Version viewer 경로 및 허용 renderer만으로 생성한다. 임의 query/hash, storage locator, 원본 다운로드 경로, credential을 포함하지 않는다. DB 변경 및 공개 접근권한 부여는 없다.
- TC-LINK-001: URL 생성 단위 검증 — Version 경로, DXF 선택, DWG 강제 선택, 부적합 renderer fallback, 불필요 query/hash 제외.
- TC-LINK-002: 목록·Location·Viewer에서 링크 복사 성공과 상태 안내; Clipboard 미지원/거부 시 읽기 전용 선택 가능 URL 및 클릭 가능한 링크 제공.
- TC-LINK-003: 새로운 Browser context에서 복사한 URL로 DXF 두 renderer 및 DWG를 직접 열어 Version/format/실제 표시 확인. Current 교체 이후에도 링크 대상 유지.
- TC-REL-001: typecheck/lint/build/자동 테스트/관련 E2E, 문서·버전·Secret 검사. Manager 설계→Sol Developer 구현 보고→Luna QA 시험·문서 보고→Manager 승인/재작업 순서. 커밋·Push 완료는 별도 최종 확인한다.

## Unit S3 실행 계획 — 2026-09-08 사용자 요청

- Local 기본값과 기존 원본을 보존하고 S3 호환 backend를 선택할 수 있게 한다. DB storage_path에 기존 상대 키 또는 s3:bucket:cad/object-id/original.ext locator를 기록해 혼합 조회한다. endpoint/credentials는 서버 env만 사용한다.
- TC-S3-001: 실제 격리 SeaweedFS에서 DXF/DWG byte/hash·Current·중복 등록·mixed local/S3 조회.
- TC-S3-002: PUT 실패, DB 실패 후 새 object 보상 삭제, 기존 원본/Current 보존, 404·잘못된 locator·credential 오류. PUT/COMMIT 결과 불확실 시 무조건 삭제하지 않는다.
- TC-S3-003: remote PUT이 DB transaction 전에 끝남을 확인하고 env 검증·원본 API streaming·Secret 비노출 확인. 기존 DXF/DWG 회귀.
- 실제 기존 SeaweedFS 서비스나 사용자 데이터는 변경하지 않는다. 자동 migration/파일 이동/버킷 생성은 앱에 추가하지 않고 테스트용 버킷만 별도 생성한다.

## Unit 7B 실행 계획 — 2026-09-08

- 등록 DWG Version 원본 API→LibreDwgWebAdapter/Manager→공통 Viewer UI 통합. DWG에서는 libredwg-web만 사용하며 query 조작도 DXF를 선택하지 않는다.
- 최소 기하 지원은 7A의 평면 LINE을 유지한다. 미지원/표시 제외 Entity는 건수를 보이고 result partial로 기록한다. 20 MiB 한도·원본 보존·DB 불변.
- TC-DWG-001–005/TC-E2E-002: 실제 샘플 UI 등록→검색→선택→표시, Zoom/Pan/Fit/Resize, reload/재진입/취소/Worker 및 canvas 해제. CIRCLE partial, 손상/미지원 헤더/WASM 404/content 404 및 재시도.
- TC-VIEW-001/003: 형식 매칭과 지연 Worker 결과 취소를 자동화. 기존 DXF 전체 회귀. 상세 DWG 계측/비교는 8B이다.

## Unit 7A 실행 계획 — 2026-09-08

- 독립 `/lab/dwg`에서 공식 고정 DWG 샘플을 Worker/WASM으로 파싱하고 model-space planar LINE을 직접 Three.js로 표시한다. 서버 등록/Viewer 선택 연결은 Unit 7B이다.
- TC-DWG-001/003/005: 정상 LINE, 반복 3회 load/free/임시 FS unlink/Worker 종료, 표시 확대 픽셀 변화, 해제 후 canvas 0; DXF 변환/Viewer 호출 없음.
- TC-DWG-002/004 최소 실험: 손상 파일과 WASM 404 실패를 거짓 성공 없이 안내. CIRCLE 샘플은 미지원 Entity 내역과 빈 LINE 결과를 확인한다.
- 일반 DXF E2E/자동 테스트 회귀, typecheck/lint/build. 실제 업무 DWG/전체 Entity/장기 메모리 평가를 이번 최소 실험과 구분한다.

## Unit 9A 실행 계획 — 2026-09-08

- TC-E2E-001: UI에서 동일 Location DXF 두 버전 등록 → 목록/검색 → Current V2 확인 → V1로 교체 → 새로고침/API 일치 → 선택한 V1을 두 Viewer에서 표시 → 원본 bytes와 측정 Version 확인. 임시 DB/Storage만 사용한다.
- TC-SWITCH-002: 기존 지연 응답/경쟁/원본 공유 시험을 20회 전환으로 확대하고 잔여 canvas/Worker/Blob/WebGL context를 확인한다.
- TC-REL-001: 전체 typecheck/lint/unit·integration/E2E/build, 문서·Schema·버전·Secret/산출물 제외 및 원격 일치 확인. 기능 변경이 없는 테스트/문서 릴리스 검증이므로 앱 버전 0.8.0을 유지한다.
- U8A의 동일 코드 성능 측정은 재실행하지 않는다. 실도면 fidelity·복잡한 Entity·업무 SLA는 미검증으로 유지하고 DXF P.O.C. 자동화 검증 결과와 분리한다.
- 원격 이슈 #2(등록 메모)는 확인했으며 신규 기능 후속 항목이다. 이번 Unit에서 DB/API 기능을 변경하지 않는다.

## Unit 8A 실행 계획 — 2026-09-08

- source 대기, Adapter 초기화, 통합 load/parse/prepare/render, 첫 animation frame 관찰, 파일 bytes·가능한 Entity 수·Browser·JS heap·결과를 기록하고 JSON으로 내려받는다. 분리 불가능한 parse와 GPU memory는 null+사유.
- TC-MET-001: 성공/빈 도면/실패/취소와 원본 memory/pending/miss 구분, 현재 선택과 기록 일치, export 형식.
- TC-MET-002: 생성 LINE fixture 100/10,000/100,000개(실제 byte 크기 기록)로 두 Viewer 각 cold/warm 5회. cold는 새 Browser context, warm은 같은 Version의 메모리 원본 재사용. 개별/median/min/max, console/pageerror, 확대 입력→frame 관찰을 기록한다. 실제 업무 도면 SLA/충실도는 미검증.

## Unit 6 실행 계획 — 2026-09-08

- 하나의 Version 화면에서 버튼으로 양방향 전환, 문서 navigation 없음. 원본 다운로드는 화면 수명 동안 한 번 공유하고 Adapter별 독립 bytes 복사 제공.
- TC-SWITCH-001: 실제 두 Viewer 양방향 전환, Version/metadata 유지, HTTP content 1회, URL renderer 반영, canvas 한 개 및 정상 표시.
- TC-SWITCH-002: 빠른 전환/지연 fetch/이전 load 무시, 재시도, 10회 전환의 context/canvas/Worker/Blob URL 정리. 메모리 정량 검증과 실제 resource 정리 검증을 구분한다.

## Unit 5 실행 계획 — 2026-09-08

- three-dxf-viewer 1.0.44의 getFromPath 결과를 별도 Three 0.171 Scene/Camera/OrbitControls로 표시. 기존 dxf Adapter와 자원 공유 없음.
- 한글 TTF 원본/라이선스를 포함하고 Three typeface JSON은 build/dev 때 재생성한다. dxf는 TTF, three는 JSON으로 동일 font를 사용한다.
- TC-THREE-001: 같은 LINE/CIRCLE/TEXT 한글 fixture 표시, 확대/축소/Pan/Fit/Resize/재진입/오류/빈 도면. TC-CAP-001: Layer 실제 표시/숨김, Hover/Select/Snap의 API 및 cleanup 가능성 평가, 미실행은 미검증.
- Unit 5는 renderer URL로 각각 선택하고 Unit 6의 페이지 reload 없는 전환·byte 재사용·stress 검증과 구분한다.

## Unit 4 실행 계획 — 2026-09-08

- 등록 DXF의 원본 ID 경로에서 Browser 전용 Adapter/Manager를 통해 실제 WebGL 표시. DWG는 후속 구현 안내만 표시한다.
- dxf-viewer 1.0.48 실제 API 기준으로 Worker, Zoom/Pan/Fit, Resize, 재시도/재진입, 취소 및 Dispose를 검증한다. 기본 font 미제공과 실도면 fidelity 미검증을 명시한다.
- TC-DXF-001: 생성 LINE/CIRCLE fixture 등록→목록→Viewer→canvas의 실제 픽셀 확인, 확대/축소/Fit/Pan/Resize 및 재진입.
- TC-DXF-002: 손상 DXF 오류와 재시도, 빈 도면 안내. TC-VIEW-001/003: 허용 형식, 늦게 끝난 이전 load 무시, cleanup 자동화.

상태: Unit 9A DXF 회귀 결과는 U9A-20260908을 참조한다. Unit 0–3 검증 완료, Unit 4/5/6/8A 결과는 U4/U5/U6/U8A-20260908을 참조한다. GitHub #1 회귀 결과는 U3-20260908에 기록했다. 요구 ID는 [Requirements](Requirements.md), 실행 결과의 기준은 [TestReport](TestReport.md)이다. 여기의 기대 결과는 PASS 기록이 아니다.

## Unit 구성과 순서

2026-09-07 사용자 지시에 따라 DXF를 먼저 출시하고 DWG는 다음 MINOR 버전으로 분리한다. 실행 순서: **0A(완료) → 0B → 1 → 2 → 3 → 4 → 5 → 6 → 8A → 9A → DXF 릴리스 → 7A → 7B → 8B → 9B → DWG 릴리스**. 8A/9A는 DXF 계측/통합, 8B/9B는 DWG 확장/회귀이다. DWG 실험 실패나 sample 부재로 DXF 구현을 막지 않는다. 근거: ADR-011.

| Unit | 범위 / 선행 조건 | Acceptance Criteria | 테스트 / 예상 산출물 |
| --- | --- | --- | --- |
| 0A 문서 Bootstrap | Workspace·Git 조사, 요구/설계/계획 | 진입/필수 문서·추적·중요 확인사항 작성, secret 없이 remote 비교, ignore 검증, src 기능 코드 없음 | TC-BOOT-001/002, TC-DOC-001, TC-GIT-001; 문서 변경·검사 결과 |
| 0B 실행 기반 | 0A 계획 확인 | src 내 Next.js/TS/shadcn/Tailwind, 테스트 도구, SQLite/Prisma, 앱 전용 env 로딩, exact package/lock; 기본 page·DB 연결·build/type/lint 성공 | TC-BOOT-003/004, TC-SEC-002; 재현 가능한 scripts, 환경 version 기록 |
| 7A DWG 기술 실험 | DXF 릴리스 이후 | 실제 배포본 API 확인, WASM 초기화→정상 DWG parse→최소 기하 표시→free/dispose, DXF 우회 없음; parser와 자체 renderer 경계·제약 기록 | TC-DWG-001/003 최소 subset, TC-DWG-005; 독립 harness·재현 근거. mock만으로 통과 불가 |
| 1 Location/DB | 0B 완료 | Migration, 위치 Unique, 여러 Version, 소속 검증, Current 0/1·교체·rollback·경쟁 정합성 | TC-DB-001–007; Repository/Service, schema 대조 |
| 2 Upload | 1 | 두 형식·metadata·hash·파일 저장·DB 등록, 모든 invalid/실패 상황에서 정합성 유지 | TC-UP-001–005, TC-API-001/002/003/004, TC-SEC-001; Upload와 content/current API |
| 3 목록/검색 | 2 | 필수 columns, 7조건 단독/조합·페이지·빈 결과, 위치별 버전/Current 변경 UI | TC-LIST-001–003, TC-API-005, TC-UI-001; 관리 화면 |
| 4 dxf-viewer | 3 | 공통 Manager/Adapter 기반, 정상 DXF 실제 표시, 기본 controls, 손상/재진입/resize/dispose 처리 | TC-VIEW-001–003, TC-DXF-001/002; 첫 DXF Adapter |
| 5 three-dxf-viewer | 4 | 같은 DXF 표시·기본 controls, Layer/Hover/Select/정보/Snap의 지원 수준을 실측 평가 | TC-THREE-001, TC-CAP-001 해당 Viewer; 두 번째 Adapter |
| 6 DXF 전환 | 5 | 두 방향 전환에서 Version bytes 동일·reload 없음·이전 dispose·경쟁 load 결과 무시·자원 누적 검사 | TC-SWITCH-001/002; 전환 통합 |
| 7B DWG 통합 | 6·7A | 원본 API 기반 DWG만 표시, WASM/손상/미지원 format 오류, 반복 load/재진입/dispose, UI DXF 선택 차단 | TC-DWG-001–005 전체, TC-VIEW-001–003 DWG; 실제 등록→Viewer |
| 8 Metrics/평가 | 8A: 6 / 8B: 7B | 정의된 load/parse/first display/size/entity/error/browser, 미계측 사유, 반복 비교·대형 파일·기능/Entity 표 | TC-MET-001/002, TC-CAD-001, TC-CAP-001 전체, TC-EVAL-001; TestReport 근거 |
| 9 통합/회귀 | 9A: 8A / 9B: 8B | DXF E2E 자동화, DWG 흐름 가능한 자동화+실제 표시 수동 확인, Current 모든 계층 일치, 최종 DoD | TC-E2E-001/002, TC-ERR-001, TC-ARCH-001, TC-REL-001 및 전체 관련 회귀 |

0A는 문서 검사만 수행한다. 코드가 있는 각 Unit은 Build·Type Check·Lint·관련 자동 테스트·필요한 E2E/수동 테스트와 문서/README/diff 검토/Commit/필요 시 Push가 모두 충족되어야 완료이다. Sample 미제공이나 환경 실패는 BLOCKED/NOT RUN이지 PASS가 아니다.

## 테스트 도구·격리

- Unit/Integration: Vitest 후보, 실제 SQLite 임시 DB+실제 migrations, filesystem 임시 디렉터리. Business Rule 검증은 mock DB로 대체하지 않는다.
- Component: React Testing Library 후보. Manager의 선택·취소·dispose는 fake Adapter를 쓰되 실제 렌더링 시험과 구분한다.
- E2E: Playwright 후보. 테스트 서버와 임시 Storage 사용. API는 실제 HTTP multipart/content까지 확인한다.
- Rendering: 실제 WebGL/WASM Browser smoke + 동일 Sample 수동 비교. headless software GPU는 시험 환경에 명시하고 실제 데스크톱 성능으로 일반화하지 않는다.
- 최초 자동화 기준 Browser는 Chromium, 수동 기준은 데스크톱 Chrome/Edge; 다른 Browser는 조사 대상으로 표기한다. 정확한 버전·OS·CPU/GPU/RAM/화면/DPR은 실행 시 기록한다.
- 테스트 프로그램·생성기는 src/tests에 두며 사용자 CAD와 Runtime DB는 Git에 넣지 않는다. 최소 DXF는 테스트 코드로 임시 생성, DWG는 이용 허가된 외부 fixture를 로컬에서 제공하고 출처·hash·format을 기록한다. 공개 CAD라도 무단으로 다른 저장소에 업로드하지 않는다.
- 장애 주입: ENOSPC/EACCES, DB insert/commit 오류, body 중단, WASM 404, Parser throw, 느린 완료 순서. 현재 사용자의 파일/DB에 장애를 주입하지 않는다.

## Test Case 카탈로그

각 ID는 여러 assertion/parameter case를 가진 시험 시나리오이다. 실제 framework test 수는 실행 시 별도 기록한다.

| TC ID | 종류 | 방법·입력 | 기대 결과 |
| --- | --- | --- | --- |
| TC-BOOT-001 | 문서/구조 | 필수 문서·src placeholder·package 존재 여부 확인 | 필수 산출물 존재, 0A에서 기능 코드/설치 없음 |
| TC-BOOT-002 | 보안/설정 | git check-ignore 대표 env/DB/CAD/cache, 후보 파일 secret scan | 민감 파일 제외, .env.example·out 문서 추적 허용, 실제 env 값 미포함 |
| TC-BOOT-003 | Build/smoke | install lock→typecheck→lint→test→build→start→GET / | 각각 exit 0, 200 page, SSR DOM 오류 없음 |
| TC-BOOT-004 | 설정/DB | 루트와 src cwd에서 설정 로딩, DB read/write, 잘못된 설정, child env 검사 | 동일 absolute 경로, 검증 오류 명확, Git 인증 미전달 |
| TC-DOC-001 | 문서 review | 내부 링크, 요구 ID↔TC, 각 Unit AC, 사실/실행 구분 | 참조 유효, 누락/중복 ID 없음, 미실행 PASS 없음 |
| TC-GIT-001 | Git read/review | 비밀값 비출력 remote 비교/ls-remote, branch/status/log, precommit review | 지정 remote 일치, 연결 결과·미검증 권한 구분, 기존 변경 보존 |
| TC-DB-001 | DB integration | 동일 4값/다른 floor/trim/NFC/동시 생성 | 중복 Location 거부/재사용, 다른 위치 독립 |
| TC-DB-002 | DB integration | V1/V2, invalid location, 순번 중복·경쟁 insert | 여러 Version 허용, FK/Unique 유지, 충돌 결과 결정적 |
| TC-DB-003 | DB integration | 0개 Current, V1 지정, 여러 Location 비교 | 각 Location에서 pointer 기반 Current 수 ≤1 |
| TC-DB-004 | DB integration | V2→V3 Current, 동일 요청 재실행 | V2 해제/V3 지정, 다른 Location 불변, 멱등 |
| TC-DB-005 | DB integration | pointer 변경 중 fault, 두 연결 경쟁 | rollback 이전 Current 보존, 유효한 한 pointer 또는 명시적 충돌 오류 |
| TC-DB-006 | DB direct SQL/API | 타 Location·존재 안 하는 Version 지정, Current 대상 삭제 | DB FK에서 차단, API에서도 거부, pointer 유지 |
| TC-DB-007 | migration/review | 새/기존 임시 DB migration, pragma FK/index/table 검증 | foreign_keys 켜짐, foreign_key_check 위반 0, Database.md와 일치 |
| TC-UP-001 | API integration | 정상 DXF/DWG multipart+metadata | 201, bytes hash 일치, 같은 Location version 증가 |
| TC-UP-002 | API integration | 파일 누락/0 bytes/.pdf/대소문자 확장자/한도 경계±1/중단 | 정상 확장자만 허용, 한도 이하 수락, 초과/invalid 거부, 잔여 DB 행 없음 |
| TC-UP-003 | API integration | 4값 공백/초과길이, invalid 날짜·boolean·누락 | 서버 400, UI field 안내, 유효 날짜와 false 값 정확 보존 |
| TC-UP-004 | integration | 같은 bytes 2회, 다른 bytes | hash 정확, 중복 식별, 정책대로 새 Version 허용, overwrite 없음 |
| TC-UP-005 | integration/fault | Storage 실패, DB rollback/commit 불확실, 프로세스 중단 orphan | 거짓 성공 없음, 기존 Current/원본 보존, 정리/복구 경로 식별 |
| TC-API-001 | HTTP | Upload DTO와 상태·multipart boundary/한도 | 문서 contract 준수, JSON에 storage path 없음 |
| TC-API-002 | HTTP | metadata query/body invalid 값 | validation error envelope, stack/SQL/env 비노출 |
| TC-API-003 | HTTP | 등록 ID/unknown ID/파일 유실 content 요청 | 원본 bytes 200, 없음 404, 안전한 headers |
| TC-API-004 | HTTP/UI | Current 교체·동시 요청·타 Location ID | pointer 한 개, 올바른 오류, UI 변경 후 일치 |
| TC-API-005 | HTTP | 목록·검색·pagination request | items/total/page 정확, 최대 pageSize 제한 |
| TC-LIST-001 | integration/component | 다양한 등록일/Current/format, 0개 결과 | 필수 columns, 결정적 정렬, empty state |
| TC-LIST-002 | integration | 7조건 단독+AND, 한글/공백/%/_/따옴표 검색 | 정의된 exact/substring, SQL injection 없음, 페이지 결과 일관 |
| TC-LIST-003 | E2E/component | Location 선택→과거 Version 선택→Current 교체 | 선택 ID 유지, 상세/목록 재조회 결과 일치 |
| TC-SEC-001 | integration | ../, encoded traversal, absolute path ID, 조작 저장 키, 외부 symlink | 저장 루트 밖 읽기/쓰기 불가, 민감 경로 미노출 |
| TC-SEC-002 | build/log review | client bundle/server log/child process env/staged files 검사 | Secret/Authorization/CAD bytes/런타임 DB 포함 없음 |
| TC-VIEW-001 | component | DXF/DWG mount, invalid adapter 요청 | 형식별 허용 Adapter만 생성, DWG DXF 선택 없음 |
| TC-VIEW-002 | real browser | 각 Viewer Zoom ±/Pan/Fit/resize | 기하 위치/화면 변화 확인 또는 미지원 근거 기록 |
| TC-VIEW-003 | component/browser | 재진입, Strict Mode, unmount 중 load, 반복 dispose | orphan canvas/RAF/listener·늦은 렌더링 없음 |
| TC-DXF-001 | real browser | 정상 생성 DXF 및 sample | 화면 기하 존재 확인, load 성공, metadata ID 일치 |
| TC-DXF-002 | real browser | malformed/truncated DXF | Parse 오류/부분 경고, 빈 canvas 거짓 성공 없음 |
| TC-THREE-001 | real browser | TC-DXF-001와 같은 bytes + malformed | 실제 표시·기본 controls·오류 상태·해제 확인 |
| TC-SWITCH-001 | component/E2E | Dxf→Three→Dxf, 빠른 전환·느린 이전 load | page reload 없음, 동일 ID/hash, 이전 dispose, 최신 결과만 표시 |
| TC-SWITCH-002 | real browser/manual | 20회 전환/재진입, cache 조건 고정 | 남은 canvas/worker/listener 증가 없음, 메모리 추세/관찰 한계 기록 |
| TC-DWG-001 | real browser | 이용 가능한 정상 DWG bytes | WASM parse→직접 렌더링, 객체/화면 증거; 7A는 최소 기하 |
| TC-DWG-002 | real browser | 손상/잘린/지원 안 되는 DWG revision | 처리 실패·지원 범위 표시, DXF fallback 없음 |
| TC-DWG-003 | real browser | 초기화→반복 load→재진입→dispose | allocation/free 대상 확인, Worker/임시 FS/geometry 자원 해제 |
| TC-DWG-004 | real browser | WASM asset 404/MIME 오류/초기화 reject | WASM Load와 Parse 오류 구분, retry 가능 |
| TC-DWG-005 | source/runtime review | 의존성/실제 parse→render 경로 관찰 | DXF 변환/두 DXF Viewer 호출 없음, parser/자체 render 범위 기록 |
| TC-CAP-001 | real browser/manual | 각 Viewer Layer 조회/On-Off, Hover, Select, 정보, Snap | 지원/부분/미지원/미검증 + 근거·제약, 불가 기능 UI에서 사용 가능처럼 표시 안 함 |
| TC-CAD-001 | manual fidelity | 아래 Entity corpus를 기준 CAD 화면과 비교 | Entity별 결과·차이·캡처/참조 근거 및 sample 부재 명시 |
| TC-MET-001 | unit/browser | timing event, failure/cancel/cache, 미지원 memory API | ms 기준 정확, 불가 지표 null+사유, 실패 기록, 단계 중복 합산 없음 |
| TC-MET-002 | real browser/manual | 크기/복잡도별 cold/warm 5회, zoom/pan, console/memory | 개별 값·median/range·환경·제약, 주관 사용성과 정량 수치 분리 |
| TC-EVAL-001 | evidence review | Viewer 3종 결과/지원표 검토 | 동일 DXF sample 비교, DWG는 별도 평가, unsupported를 성공으로 숨기지 않음 |
| TC-UI-001 | component/E2E/manual | 4화면·keyboard·빈/로딩/실패 상태·desktop resize | 업무 흐름 가능, Current 색상 외 라벨, Toolbar/Metadata/metrics 읽기 가능 |
| TC-ERR-001 | integration/E2E | 정의된 모든 사용자 오류와 raw library console 확인 | 안전한 오류 문구/로그, 원본 bytes·stack UI 비노출 |
| TC-ARCH-001 | build/review | dependency graph/import/runtime/API 경계 | 승인 구조 준수, 불필요한 서비스/외부 Viewer 없음 |
| TC-E2E-001 | automated E2E | DXF Upload→metadata/current→list→search→select→Dxf→Three | 전체 성공, 실제 canvas 비어 있지 않음, 정확한 Version 유지 |
| TC-E2E-002 | E2E/manual 보완 | DWG Upload→list/search→select→LibreDWG | 실제 DWG 표시와 Current 확인; 미자동화 부분은 수동 근거 명시 |
| TC-REL-001 | release audit | 전체 필수 결과/README/Schema/ChangeLog/version/diff/secret/commit | DoD 충족, known issue 명시, release/tag 전 version 일치 |

## CAD Entity 및 지원 평가

대상: LINE, POLYLINE, LWPOLYLINE, CIRCLE, ARC, BLOCK, INSERT, TEXT, MTEXT, 한글 TEXT, DIMENSION, HATCH, SPLINE, Layer, Linetype. 각 Sample의 실제 Entity 포함 여부를 먼저 확인한다. 없는 Entity는 시험 불가로 기록한다.

외부/사용자 파일의 source, hash, format revision, 파일 크기, entity 종류/수, 기준 화면 및 사용 허용 범위를 로컬 기록한다. 실제 업무 도면 제공 시 대조한다. 생성 DXF의 성공만으로 업무용 DWG나 한글/복잡한 block의 충실도를 보증하지 않는다.

## Metrics 정의와 측정 조건

| 지표 | 정의 / 제한 |
| --- | --- |
| Load result | ready/partial/error/cancelled. 일부 기하 누락은 partial |
| Load time | Manager load 요청부터 첫 유효 frame까지 wall time; download 포함 여부/캐시 명시 |
| Fetch time | content API 요청부터 ArrayBuffer 확보 |
| Parse time | 파서 진입→완료 hook이 실제 존재할 때만 측정; render preparation과 분리 불가면 combined로 이름 명시 |
| First display | load 요청→첫 geometry draw 후 animation frame 관찰 시점; 실제 GPU present와 완전히 같다고 주장하지 않음 |
| WASM init | 초기 create/load 단계 별도; cold/warm 구분 |
| Entity count | 파서 기준 원본 개수, block 확장 draw primitive 수와 구분; unavailable=null |
| Memory | 지원 Browser API의 JS heap 또는 수동 도구 snapshot과 방법 표시; GPU/WASM 전체를 포괄한다고 가정하지 않음 |
| Errors | Viewer/parse/console 단계·안전한 메시지, raw bytes 미기록 |
| Responsiveness | zoom/pan 입력 반응·freeze·long task 가능한 계측 + 사용자 관찰; 서로 구분 |

동일 장비·Browser·viewport·DPR·font·sample hash·library version에서 cold/warm 조건별 가능한 5회 수행하고 개별 값과 median/min/max를 기록한다. 작은 도면(예: ≤1 MiB), 중간(1–10 MiB), 대형(>10 MiB, 설정 한도까지) 및 Entity 복잡도를 별도 축으로 구분한다. 이 구간은 시험 분류이며 업무 SLA가 아니다.

업무용 최대 크기·목표 응답시간·대표 sample은 아직 미제공이다. 수치 목표를 임의의 합격 기준으로 만들지 않는다. 기능 완료와 업무 성능 적합성 판정을 분리한다. 테스트 실패는 수정/재시험하고, 미지원 기능은 재현 근거가 있는 평가 결과로 기록한다.

## 결과 기록 및 추적

실행마다 Run ID, 날짜, Unit, 앱/라이브러리 버전, Commit 또는 uncommitted snapshot, 환경, 명령·exit code, total/pass/fail/skip, TC별 결과, 실패 원인/재시험, manual 근거, Known Issue를 TestReport에 기록한다. Requirements의 구현 상태는 실제 근거로만 올린다.

## GitHub #1 — 등록 후 목록 미표시 회귀

확인된 원인: `/`가 DB 조회 없이 정적 안내만 렌더링했다. 승인된 Unit 3 범위에서 실제 목록으로 교체한다.

- TC-ISSUE-001: 목록을 먼저 방문→등록 화면→새 파일 등록→목록으로 복귀→동일 파일/Metadata/Current 표시→새로고침 후 유지. 등록 전 prefetch된 목록도 새 데이터를 표시해야 한다.
- TC-LIST-001/002 및 TC-API-005: DB에 기존 행이 있으면 GET 목록에 포함, 필수 columns·결정적 정렬·페이지·7조건 단독/AND·문자 그대로 filename 검색·빈 결과·잘못된 query 검증.
- TC-LIST-003: Location 상세에서 과거 버전 확인 및 Current 변경 후 목록과 상세의 표시 일치. Viewer 화면은 다음 Unit이므로 사용할 수 있는 것처럼 노출하지 않는다.
- 실제 사용자 DB/파일은 변경하지 않고 회귀 데이터는 독립 임시 DB/Storage에 생성한다. 수정 전 실패와 수정 후 성공을 TestReport에 구분한다.

추가 자동화: TC-LIST-004 Current 교체/null 필터, TC-LIST-005 안정적 페이지 분할과 범위 초과 빈 결과, TC-LIST-006 잘못된/중복 query 거부, TC-LIST-007 한글 NFC·와일드카드/인용부호 문자 그대로 검색. `tests/integration/list.test.ts`와 `tests/e2e/upload.spec.ts`에서 실행한다.

### Unit S3 완료 확인 기준

실제 SeaweedFS 4.45에서 TC-S3-001–003을 실행하고, S3 backend의 웹 E2E 및 local/DWG 회귀를 분리 기록한다. PUT/DB/DELETE 실패·불확실 COMMIT의 처리 결과와 임시 컨테이너/credential cleanup을 확인한다. 실제 .env 활성화와 기존 사용자 storage 데이터 이동은 자동으로 수행하지 않는다. 결과 기준은 TestReport U-S3-20260908이다.


## GitHub #24 — 0.25.0

[Issue24](Issue24.md)의 TC-MASTER-001~007을 구현 전 수용 기준으로 확정한다. legacy populated DB 보존과 재분류, Current 경쟁/rollback, 변조/비활성 chain, 관리·등록 Browser 흐름 및 기존 전체 회귀를 독립 QA가 검증한다.

- TC-MASTER-008 (PR #27 P2 리뷰): 미분류 층 상세에서 `/api/masters?active=true`의 HTTP 503 + JSON 오류를 Browser route로 주입하고 재분류 `form` 내부 `role=alert`로 오류 안내가 나타나는지 검증한다. Next.js `#__next-route-announcer__`도 `role=alert`이므로 전역 `getByRole("alert")` 선택을 금지한다. 버전 목록·재분류 폼이 유지되는지 확인하고 실패 주입을 제거해 새로고침하면 form 오류가 사라지며 정상 선택·재분류 흐름이 복원되어야 한다. 기존 TC-MASTER-003/005/007 E2E에 추가하고 PR CI에서 재검증한다.
