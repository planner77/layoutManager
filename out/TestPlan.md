# 구현 Unit·Acceptance Criteria·테스트 계획

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

상태: Unit 0–3 검증 완료, Unit 4/5/6/8A 결과는 U4/U5/U6/U8A-20260908을 참조한다. GitHub #1 회귀 결과는 U3-20260908에 기록했다. 요구 ID는 [Requirements](Requirements.md), 실행 결과의 기준은 [TestReport](TestReport.md)이다. 여기의 기대 결과는 PASS 기록이 아니다.

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
