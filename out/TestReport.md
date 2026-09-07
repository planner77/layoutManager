# 실제 검증 결과 및 Viewer 평가

## U6-20260908 — 새로고침 없는 전환 0.7.0

- Source: 이 기록을 포함하는 `feat(viewer)` 커밋 snapshot. DB Schema/의존 라이브러리 변경 없음. UI renderer 버튼, ViewerSource, Manager와 관련 문서/시험 변경.
- Type Check/Lint/Production Build 모두 exit 0. 자동 테스트 35 passed / 0 failed, 8개 파일, 11.00초. 기존 32개 + 원본 1회 공유/Adapter 변경 격리, 지연 다운로드 중 마지막 선택만 초기화, 실패 재시도/다른 Version bytes 분리 3개.
- E2E 10 passed / 0 failed, 39.1초. 기존 관리/두 Viewer/한글/오류 9개 회귀와 전환 1개. Chromium 1208 executable, Playwright 1.63.0, SwiftShader, 1440×1000, 독립 임시 DB/Storage. 기존 명령 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=... npm --prefix src run test:e2e` 실행.
- TC-SWITCH-001/002: 다운로드를 지연한 상태에서 두 번 선택 변경→최종 renderer 표시→10회 양방향 전환. 동일 document marker/Version heading/URL renderer를 유지하며 content HTTP 요청은 1회였다. 명시적 다시 불러오기 후 2회로 증가함을 확인했다.
- 테스트 전용 계수: 각 전환 완료 시 canvas 1개, 활성 WebGL context 1개, Worker 0개, Blob URL 0개. 버전 목록으로 이탈 후 canvas/context/Worker/Blob 모두 0. 정상 경로 pageerror 0. 이것은 관측 대상 자원의 cleanup 검증이며 전체 JS heap/GPU/전역 cache 누수 부재를 증명하지 않는다.
- 탐색 시점/Layer 선택은 전환마다 초기화한다. renderer URL은 replaceState로 변경하여 전환 자체로 history를 늘리지 않는다. 원본은 Version 수명 내 보관하고 Adapter마다 slice 복사본을 제공한다. 원본 CAD/DB 변경 없음.
- Known Issues: three 메인 스레드 parse, 전역 material cache, 대형 font JSON 및 실제 도면 성능/전체 Entity·MTEXT·인코딩 한계는 이전과 동일하다. 기존 npm high 4 유지. 다음 Unit 8A에서 측정/비교를 진행한다.
- 로컬 3100 서버를 0.7.0으로 재시작하고 홈 HTTP 200 및 버전 표시를 확인했다. 후보 81개 Secret/런타임 검사 위반 0, git diff --check 통과. README와 관련 요구/설계/운영/시험/결정/변경 이력 갱신.

## U5-20260908 — three-dxf-viewer 및 한글 글꼴 0.6.0

- Source: 이 기록을 포함한 `feat(viewer)` 커밋 snapshot. three-dxf-viewer 1.0.44 / 직접 Three 0.171.0 / dxf-viewer 1.0.48. 외부 source 수정 및 DB migration 변경 없음.
- Type Check/Lint/Production Build: 최종 PASS. build가 원본 TTF로 typeface JSON을 생성하며 두 Viewer는 Browser dynamic import 경계를 유지한다.
- 자동 테스트: 32 passed / 0 failed, 7개 파일, 9.90초. 이전 30개 + 실제 한글/라틴 glyph 존재 및 라이선스 확인, 생략된 Z 보완/명시 Z 보존/멱등성 시험.
- E2E: 최종 9 passed / 0 failed, 30.3초. 기존 관리 3개, Viewer별 탐색 2개, 한글 TEXT 2개, 손상/빈 DXF/DWG 안내 2개. Chromium 1208 executable, Playwright 1.63.0, SwiftShader, 독립 임시 DB/Storage. 실행 명령은 기존 PLAYWRIGHT_CHROMIUM_EXECUTABLE 지정 `npm --prefix src run test:e2e`이다.
- 실제 렌더링: 양쪽 LINE/CIRCLE, 확대·축소·Pan·Fit·Resize·재로드/재진입. three의 Layer 0 숨김/복원은 screenshot byte 변화/복원으로 확인했다. 정상 탐색 pageerror 0. 두 Viewer의 「한글 공장 ABC」 screenshot을 시각 확인하고 확대 전후 픽셀 변화도 검증했다. Git 제외 `src/test-results/{renderer}-render.png`, `{renderer}-korean.png`.
- 실패/수정: 처음 three가 완료 상태에도 검정 화면이었다. 재료 대비를 조사·보정했지만 지속되어 진단했고, 생략 Z에서 NaN bounds/camera가 발생함을 확인했다. Wrapper의 기본 Z=0 보완과 finite bounds 검증으로 해결했다. 손상 문자열을 빈 도면으로 받아들이는 사례는 ASCII SECTION/EOF 사전 검증으로 거부한다. 임시 진단 로그는 제거했다.
- 중간 회귀: 2 failed→수정 후 1 failed(Resize 시험이 이전 DOM 너비를 기대값으로 먼저 읽은 timing 문제). 크기와 backing buffer를 동일 polling 시점에서 DPR 포함 비교하도록 수정한 뒤 9/9 통과했다. 이전 실패는 숨기지 않고 최종 결과와 구분한다.
- 글꼴: 원본 TTF/OFL 포함, 생성 JSON은 Git 제외. 출처/hash/원본 크기와 배포 방법은 Operation에 있다. 전체 typeface 약 25.8 MB로 최초 전송/파싱 비용이 있으며 실환경 성능 시험은 NOT RUN이다.
- 확장 기능 평가: Layer 기본 On/Off PASS. Hover/Select/CADControls 공개 export 및 metadata API 존재는 설치 소스로 확인했으나 익명 이벤트 handler/public dispose 부재로 이번 UI에 미연결, 런타임 NOT RUN. SnapsHelper.clear 존재 확인, Snap 정확도·대형 도면 비용은 NOT RUN. 미지원으로 단정하지 않는다.
- Known Issues: three 메인 스레드 parse 및 전역 material cache 잔여 위험, 복잡한 INSERT/Layer·MTEXT/SHX/CP949·전체 Entity·실도면 fidelity·memory/성능 미검증. 기존 npm high 4 유지. Layer는 Adapter wrapper 기준이며 모든 upstream interaction을 구현한 것이 아니다.
- 다음: Unit 6의 새로고침 없는 전환, 동일 bytes 재사용 및 경쟁/자원 stress. 현재 renderer 링크는 전체 페이지 탐색이다. 원본 CAD/Runtime DB를 수정·커밋하지 않는다.
- 로컬 3100 서버를 0.6.0으로 재시작하고 홈/생성 font HTTP 200, 한글 glyph와 파생 family 이름을 확인했다. 커밋 후보 78개 보안 검사 위반 0, 진단 로그 제거 및 diff 검사 통과. 관련 문서 갱신, DB Schema 정의는 변경 없음.

## U4-20260908 — dxf-viewer 0.5.0

- Source: 이 기록을 포함하는 `feat(viewer)` 커밋 snapshot. dxf-viewer 1.0.48, Three.js 0.161.0, 기존 package/lock 고정. DB Schema 변경 없음.
- `typecheck`, `lint`, `build`: 최종 exit 0. 최초 테스트 코드의 canvas 타입 오류 수정 후 통과. SSR에서 WebGL 초기화 없이 Worker 자산 포함 Production Build 성공.
- `npm --prefix src test`: 30 passed / 0 failed, 5개 파일, 8.46초. 이전 26개 회귀 + Manager 형식 제한/늦은 초기화 취소/실패 cleanup/이전 Load 결과 차단 4개.
- Chromium E2E: 최종 5 passed / 0 failed, 13.1초. 기존 관리 흐름 3개 + DXF 정상/오류 흐름 2개. 최초 실행은 Next route announcer까지 alert로 탐색해 1 failed, main 영역으로 locator를 한정한 뒤 전체 재시험 통과.
- TC-DXF-001 PASS: 생성한 LINE/CIRCLE DXF 업로드→검색 목록→도면 보기→실제 WebGL 표시. canvas screenshot 변화로 확대/Pan 반응 확인, 축소/Fit 클릭, 1100×800 Resize 후 canvas 크기 일치, 다시 불러오기/재진입 및 canvas 한 개 유지. 정상 경로 pageerror 0. `src/test-results/dxf-render.png`에서 선과 원을 시각 확인했다(Git 제외).
- TC-DXF-002 PASS: 손상 DXF의 일반화된 처리 실패와 재시도, 빈 DXF의 빈 도면 상태, DWG의 후속 구현 안내 및 canvas 없음. 손상 파일의 upstream console 오류는 예상된 오류이며 정상 렌더링 결과와 구분한다.
- 환경: Linux, Node 22.14.0, Playwright 1.63.0, Chromium 1208 executable, SwiftShader software WebGL, 독립 임시 DB/Storage. 화면 1440×1000 및 1100×800. 소프트웨어 GPU 결과를 실제 장비 성능으로 일반화하지 않는다.
- dxf-viewer 평가: 기본 LINE/CIRCLE 표시·Zoom/Pan/Fit/Resize/재진입 확인. 장점은 public API/Worker 기반 통합 및 내장 탐색. 현재 통합의 제약은 기본 font 미제공(TEXT/한글 누락 가능), Layer/Select/Hover/Snap UI 미제공. 실도면 Entity 충실도, parse/first-display 수치, memory/GPU 누수 추세 및 대형 파일은 NOT RUN. 해당 성능/평가는 Unit 8A 및 실제 Sample에서 진행한다.
- 라이브러리 원본 수정 없음. Adapter에서 Blob URL, Worker 취소, Destroy, WebGL context/canvas 정리를 수행한다. 120초 Worker timeout 경로와 WebGL 생성 불가 환경은 코드 처리 제공, 별도 장애 주입 시험은 NOT RUN.
- 기존 npm audit high 4 경고 유지. three-dxf-viewer/DWG는 미구현. README·AGENTS·Requirements·Architecture·TestPlan·Operation·Decisions·ChangeLog 갱신. 다음 Unit은 5 three-dxf-viewer이다.
- 로컬 적용: 3100 서버를 0.5.0으로 정상 재시작하고 HTTP 200, 버전 표시 및 기존 DXF의 도면 보기 링크를 확인했다. 운영 DB/원본은 변경하지 않았다. 커밋 후보 70개 Secret/런타임 검사 위반 0.

## U3-20260908 — 목록·검색 0.4.0 / GitHub #1

- 대상: 지정 GitHub 저장소의 「도면 목록 미표시 #1」. Source는 이 기록을 포함한 `feat(list)` 커밋 snapshot이다. 원격 반영 결과는 후속 기록을 참조한다.
- 원인: 0.3.0 홈은 정적 안내이며 DB 목록을 조회하지 않았다. 기존 사용자 DB에서 Location 1개/Version 1개를 읽기 전용으로 확인했다.
- 수정 전: Chromium에서 등록 성공→목록 복귀 시 도면 행을 찾지 못하는 회귀 테스트 1 failed로 재현했다.
- 수정: 실제 DB 목록/검색/페이지/위치별 버전과 Current UI, 안전한 조회 API, 동적 렌더링 및 등록/Current 변경 후 캐시 갱신. Schema/migration 변경 없음.
- 자동 테스트: `npm --prefix src test` — 26 passed / 0 failed (환경 2, DB 6, Upload 12, 목록 6). TC-LIST-001–007의 등록 직후 조회·7조건 필터·문자 그대로 검색·Current/null·페이지·잘못된 query를 검증했다.
- `npm --prefix src run typecheck`, `lint`, `build` — 모두 exit 0. Production Build에서 `/`와 Location 상세는 동적 경로이다.
- E2E: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome npm --prefix src run test:e2e` — 최종 3 passed / 0 failed, 7.0초. 등록→목록 복귀→새로고침, 조회 API, 파일명/사업장 검색, 상세 Current 교체→새로고침→Current 목록의 일치를 실제 Browser에서 검증했다.
- 중간 E2E 실패 1건: select를 getByLabel exact로 탐색하여 option text가 포함된 label을 찾지 못했다. 접근성 role/name 기반 combobox 탐색으로 수정 후 전체 3개 재시험 통과했다.
- 환경: Linux, Node 22.14.0, Playwright 1.63.0, Chromium cache 1208, 1440×1000. 임시 DB/Storage 사용. Git 제외 `src/test-results/list-current.png` 화면을 확인했다. Viewer rendering 시험은 아니다.
- 실행 서버: 3100을 새 빌드로 정상 재시작. `/` 및 `/cad/upload` HTTP 200, 목록 API total=기존 DB Version 수 1, 실제 홈 HTML에 해당 Version ID 포함을 확인했다. 사용자 DB/원본 삭제·초기화 없음.
- 문서: README/AGENTS/Requirements/Architecture/TestPlan/Operation/Decisions/ChangeLog 갱신. DB Schema 변경 없음으로 Database.md 정의 유지.
- Known Issues: Viewer 및 실도면 성능/fidelity는 미구현·미검증. 기존 Prisma 전이 의존성 high 4 경고는 이 목록 수정에서 해결하지 않았다. 다음 기능 Unit은 dxf-viewer이다.

### 원격 반영 및 이슈 종료 — 2026-09-08

- 구현 Commit: `aec7af6c3e451caa29a1bc711e320ea86cea9006`, `main` Push 성공 및 원격 HEAD 일치 확인.
- 커밋 후보 62개 Secret/Runtime 제외 검사: 위반 0. `git diff --check` 통과.
- GitHub #1에 원인·조치·시험·문서·잔여 범위를 댓글로 기록했다(comment ID: 5575209023). API 재조회에서 `closed`, `state_reason=completed`를 확인했다.
- 이 후속 기록은 별도 docs 커밋으로 관리한다. Unit 3 조치 완료, 다음 Unit 4는 아직 시작하지 않았다.

## BOOT-20260907-01 — Unit 0A 문서 Bootstrap

이 절은 최초 문서 검증 당시의 기록이다. 이후 작성자 설정과 Commit/Push는 아래 후속 기록을 기준으로 한다.

- Date: 2026-09-07 (Asia/Seoul).
- Version: 없음. src/package.json 미생성, 기능 Release 아님.
- Commit: 없음. 기존 Commit이 없는 main; 문서 변경은 uncommitted. 작성자 정보 입력 대기.
- 환경: Linux/WSL workspace, Node v22.14.0, npm 11.10.0, Git 2.43.0.
- 범위: Workspace/Git/config 조사 및 문서 정적 검사. 앱/DB/Rendering 시험이 아님.

### Git 및 환경 조사 (실제 수행)

| 항목 | 결과 | 근거·제약 |
| --- | --- | --- |
| 기존 Workspace | 확인 | .git/.env/.gitignore 및 로컬 agent 디렉터리 존재, 기존 앱/문서 없음 |
| .env | configured | 기존 remote_repo_url/remote_repo_token 값 존재 여부만 확인; 내용 비출력 |
| Git repository | OK | git rev-parse 결과 true |
| Remote 정합성 | OK | origin URL과 .env 설정을 메모리에서 정규화 비교, credential 포함 URL 아님 |
| Local branch / history | main / 기존 Commit 없음 | symbolic-ref, log 조회 |
| GitHub 읽기 연결 | OK | git ls-remote --symref origin HEAD refs/heads/* exit 0, 결과 비어 있음 |
| Remote default branch | 미확정 | HEAD/branch가 없어 원격 기본 브랜치 확인 불가; main은 로컬 branch |
| 인증 / 쓰기 권한 | configured / 미검증 | token 값 존재, 읽기 연결 성공; Push는 수행 안 함 |
| 최초 network 실패 | 해결 | sandbox DNS/network 오류(exit 128), 허용된 외부 실행에서 재시도 성공(exit 0) |
| Git author | 미설정 | user.name/user.email 설정 없음, 사용자에게 입력 요청 |

### 문서·보안 검사

실행: `python3 /tmp/cad-bootstrap-audit.py`, exit **0**. 이 파일은 이번 Bootstrap용 임시 검사 도구이며 Git에 포함하지 않는다. 방법과 결과를 아래에 남긴다. 앱의 versioned 테스트 코드는 계획 확인 후 src/tests에서 작성한다.

**정적 검사 Total 9 / Passed 9 / Failed 0.** 아래 9개 검사는 50개 예정 애플리케이션 TC의 실행 결과와 별개이다.

| 검사 | 관련 TC | 실제 결과 | 방법·관측 |
| --- | --- | --- | --- |
| 필수 구조 | TC-BOOT-001 | PASS | Markdown 10개, 필수 Root 파일과 src directory 존재 |
| 내부 문서 링크 | TC-DOC-001 | PASS | Markdown 상대 링크 대상 검사, 끊어진 링크 0 |
| 요구↔테스트 ID | TC-DOC-001 | PASS | 요구 39개·TC 시나리오 50개 정의, 중복/없는 참조 0 |
| Unit별 AC | TC-DOC-001 | PASS | 분할된 12개 Unit 모두 범위/선행 조건/AC/시험 항목 포함 |
| Git 제외 규칙 | TC-BOOT-002 | PASS | git check-ignore --no-index: 제외 경로 19개, 추적 허용 경로 8개 모두 예상과 일치 |
| 환경 template | TC-BOOT-002 | PASS | 기존 .env 키 2개 보존, example 실제 값 0 |
| Secret 검사 | TC-BOOT-002 | PASS | 변경 후보 13개 파일에서 실제 .env 값·token pattern·credential URL 일치 0; 값 비출력 |
| 구현 금지/비추적 | TC-BOOT-001 | PASS | src에는 .gitkeep만 존재, data 미생성, .env tracked 아님 |
| diff 공백 검사 | TC-GIT-001 | PASS | git diff --check 및 후보 새 파일 각각 git diff --no-index --check, 오류 0 |

정적 자동 검사는 구조/참조/정해진 pattern을 확인한 범위이며 모든 보안 취약점이나 기능 정확성을 보장하지 않는다. 별도 문서 review로 Bootstrap 단계 충돌, Current 소속 제약, DB/파일 비원자성, DWG parser/rendering 차이, 미실행 결과 표시를 확인했다. Git 연결 점검과 라이브러리 공식 문서 조사는 위 자동 검사 9개 수에 합산하지 않았다.

변경 후보: AGENTS.md, README.md, .env.example, .gitignore, src/.gitkeep, out/*.md 8개. 기존 .env는 편집하지 않았다. 아직 stage/Commit/Push하지 않았으며 working tree에는 이 13개 untracked 파일이 있다. 첫 Commit 작성자 확인 이후 diff/보안 검사를 다시 수행한다.

### 애플리케이션 시험 상태

| 영역 | 결과 | 사유 |
| --- | --- | --- |
| Next Build / Type Check / Lint | NOT RUN | 0A 구현 금지, package/source 없음 |
| DB connection / Migration / Current | NOT RUN | Schema 초안만 존재 |
| Upload / Search / API | NOT RUN | 미구현 |
| Component / E2E | NOT RUN | framework/코드 미설치 |
| DXF / DWG rendering | NOT RUN | 라이브러리 미설치·실제 sample 미제공 |

### Known Issues / 다음 작업

- KI-001: libredwg-web은 파서이며 직접 렌더링 설계(ADR-004) 확인 대기. 이는 조사된 역할 차이이며 실제 파싱 실패 결과가 아니다.
- KI-002: Git 작성자 미설정으로 문서 Commit/Push 대기. 작업 트리는 clean으로 보고하지 않는다.
- KI-003: 대표 CAD Sample/업무 SLA 없음. 업무 적용 가능성 최종 평가는 미검증이다.
- KI-004: 실제 npm 배포본과 Next/Prisma/Three/WASM 호환성·memory/free API는 0B/7A에서 확인할 예정이다.
- 다음: 전체 계획 확인→Unit 0B→7A. 시험 실패를 숨기거나 코드 없는 0A를 Unit 0B 완료로 처리하지 않는다.

## BOOT-20260907-02 — 작성자 설정 및 최초 문서 게시

- Date: 2026-09-07. 범위는 Git 작성자 설정과 기존 Bootstrap 문서 형상관리이다. 사용자는 작성자 이름/이메일을 제공했으며 **전체 구현 계획과 ADR-004 승인은 여전히 대기**이다.
- 사용자 제공 작성자를 repository-local config에 설정하고 일치 검증을 통과했다. 전역 Git 설정은 변경하지 않았다. 실제 작성자 값은 문서에 복사하지 않는다.
- 작성자 상태를 README/Operation/Decisions/ChangeLog에 반영하고 `python3 /tmp/cad-bootstrap-audit.py` 재실행: exit 0, 정적 검사 9/9 PASS.
- 최초 문서 Commit: `3b1a32d5a506fec8687e55affa7fd0fee24330c8`, `docs(bootstrap): define CAD viewer requirements and implementation plan`.
- Staged 파일 13개가 검사한 working copy와 byte 단위로 일치함을 확인했다. `.env`와 CAD/DB/Secret은 추적 대상에 포함되지 않았다. `git diff --cached --check` 통과.
- 임시 비출력 인증 도구의 remote read, 일반 Push, remote 재조회가 모두 성공했다. `origin/main`과 위 Commit의 일치를 확인했으며 당시 working tree는 clean이었다. Force Push/기존 history 변경은 수행하지 않았다.
- 샌드박스에서 `.git/index` 쓰기 및 DNS가 차단된 시도는 허용된 외부 실행으로 재시도하여 해결했다. 인증 값/헤더/credential URL은 출력하지 않았다.
- KI-002(작성자 미설정/최초 Commit·Push 대기)는 해결했다. 실제 지정 branch 쓰기 연결도 확인했다. 다른 branch의 권한까지 확인했다는 뜻은 아니다.
- 이 결과를 기록하는 후속 문서 Commit은 별도로 생성한다. 최신 Commit과 동기화 상태는 실제 git log/status/remote 조회로 확인한다. 앱 버전은 여전히 없으며 앱 Build/DB/Viewer 시험은 NOT RUN이다.

## Viewer 평가 현황 — U5 반영

공식 조사 사실은 Architecture에 있으며 아래 표는 **실제 실행 결과**만 채운다. 단순 라이브러리 문서의 기능 소개를 이 표의 PASS로 옮기지 않는다.

| 항목 | dxf-viewer | three-dxf-viewer | libredwg-web 경로 |
| --- | --- | --- | --- |
| 정상 표시 / 기본 Zoom·Pan·Fit | PASS: 생성 LINE/CIRCLE | PASS: 생성 LINE/CIRCLE | NOT RUN |
| Resize / 재진입 / Dispose | PASS: U4; 장기 누수 추세 미평가 | PASS: U5; 장기 누수 미평가 | NOT RUN |
| 장점 / 단점 / 발견 문제 | public API/Worker; U5 기본 font 연결 | Group/metadata 활용; 생략 Z 보완 필요 | 미평가 |
| Layer 조회 / On-Off | NOT RUN | PASS: Layer 0 | NOT RUN |
| Hover / Select / Entity 정보 / Snap | NOT RUN | NOT RUN | NOT RUN |
| 지원 Entity / 문제 Entity / fidelity | LINE/CIRCLE/한글 TEXT 확인 | LINE/CIRCLE/한글 TEXT 확인 | 미평가 |
| 대형 파일 / 사용성 / Browser | 미평가 | 미평가 | 미평가 |
| WASM 초기화 / DWG revision / parsing / memory | 해당 없음 | 해당 없음 | NOT RUN |

LINE, POLYLINE, LWPOLYLINE, CIRCLE, ARC, BLOCK, INSERT, TEXT, MTEXT, 한글 TEXT, DIMENSION, HATCH, SPLINE, Layer, Linetype 각각의 sample/결과를 TC-CAD-001 실행 시 행 단위로 추가한다. DWG의 parser 지원과 직접 renderer 지원을 별도로 표기한다.

## 동일 Sample 비교 양식

| File 식별/hash | Format | Viewer/version | File size | Load ms | Parse ms | First display ms | Entity count | Result | Rendering issue | Usability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| viewer.spec.ts 생성 fixture | DXF | dxf-viewer 1.0.48 | 코드 fixture 참조 | — | — | — | 미계측 | PASS: 기본 표시 | 선/원 시각 확인 | 기본 탐색 확인 |
| viewer.spec.ts 동일 fixture | DXF | three-dxf-viewer 1.0.44 | 코드 fixture 참조 | — | — | — | 미계측 | PASS: 기본 표시 | 원본 Z 생략 보완 | 기본 탐색 확인 |
| Sample 미제공 | DWG | libredwg-web / 미설치 | — | — | — | — | — | NOT RUN | 미평가 | 미평가 |

미측정 값은 0이 아닌 —/null과 사유를 사용한다. 환경/캐시/반복 횟수/console/memory/실패 원인을 함께 기록한다. DXF 동일 bytes 비교와 DWG 평가는 별도로 결론을 내며 단일 종합점수로 합치지 않는다.

## 다음 실행 기록 형식

Run ID / Date / Unit / Version / Commit 또는 uncommitted snapshot / OS·Browser·hardware / exact dependency versions / 실행 명령과 exit / automated total-pass-fail-skip / TC별 결과 / manual 증거 / 오류와 재시험 / Known Issues / 문서·요구 추적 갱신 여부를 기록한다. 완료되지 않은 시험은 NOT RUN 또는 BLOCKED 사유를 남긴다.

## U0B-20260907 — 실행 기반 0.1.0

- Source: 이 기록을 포함하는 `build(bootstrap)` Commit의 source snapshot; 실제 hash는 git log 참조.
- `db:generate`, `db:check`: PASS, Prisma Client 생성 및 실제 SQLite SELECT 1 성공.
- `typecheck`, `lint`: PASS (최종 warning 0). `npm test`: 2 passed / 0 failed.
- `build`: PASS, Next 16.3.4 webpack Production Build. `GET /` Production smoke: HTTP 200 및 CAD 도면 관리 문구 확인.
- 해결: Next ProcessEnv 타입 요구와 JSON named import 경고 수정. sandbox DNS/tsx IPC/Next child process/local port 제약은 허용 환경에서 재검증했다.
- DB schema/관리 기능/Viewer는 아직 NOT RUN. 승인 순서는 DXF 우선(ADR-011), 다음 Unit 1.

## U1-20260907 — Location/Version DB 0.2.0

- Prisma migrate deploy 성공: 202609070001_locations. 신규 임시 DB에도 동일 migration SQL을 적용했다.
- 자동 테스트 8 passed / 0 failed (환경 2, 실제 DB integration 6). Type Check/Lint 통과.
- 최종 Production Build 통과. 커밋 후보 39개 파일의 Secret/런타임 파일 제외 검사 위반 0.
- 위치 Unique, 8개 동시 등록의 순번 정합성, Current 0/1·교체·멱등·rollback, 타 Location 참조/Current 대상 삭제/존재하지 않는 소유자 거부, FK/Index를 검증했다.
- API/Upload 화면은 다음 Unit이다. 0.1.0 헤더의 미구현 등록 링크로 404가 발생한다는 사용자 제보를 확인했으며 Unit 2에서 실제 화면/API를 연결한다.

## U2-20260907 — 파일 등록 0.3.0

- 자동 테스트 20 passed / 0 failed, Type Check/Lint/Production Build 통과. 실제 Chromium E2E 2 passed / 0 failed.
- 사용자 제보한 `/cad/upload` 404 해결: 상단 링크→등록 화면→한글 파일명 업로드→성공 표시→원본 byte 다운로드를 실제 Browser에서 확인했다. 서버 3100을 새 빌드로 재시작했다.
- 정상 DXF/DWG, SHA-256·중복 식별, 빈 파일/미지원 확장자/크기 경계/잘못된 Metadata, Storage 실패, 파일 publication 후 DB constraint 실패 보상, traversal/symlink escape 차단을 검증했다.
- 실패 후 수정: Busboy의 limit 이벤트 경계 처리(정확한 한도/part 수), Next 내부 bind hostname과 Browser Origin 비교를 수정하고 재시험했다. 외부 Origin 거부도 확인했다.
- E2E는 독립 임시 DB/Storage, Chromium 1208 executable, 1440×1000 viewport에서 실행했다. 화면 capture는 Git 제외 test-results/upload-success.png이다. 실도면 rendering은 아직 NOT RUN.
- npm audit: high 4건(Prisma 7.10.0 전이 의존 deepmerge-ts, mysql2와 상위 패키지), omit=dev에서도 dependency graph에 포함된다. SQLite 경로는 MySQL 연결을 사용하지 않지만 패키지 보안 경고는 미해결로 기록한다. 자동 major downgrade/force fix는 수행하지 않았다.
