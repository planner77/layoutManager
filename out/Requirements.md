# 상세 요구사항

기준일: 2026-09-07. 원본: 사용자 제공 「CAD Web Viewer P.O.C. — Coding Agent 통합 지시」 §0–102. 이 문서는 원문을 기능/품질/운영 요구로 재구성한 기준이며 변경은 원본 의도와 대조한다.

## 목표와 범위

공장·설비 DXF/DWG 도면의 서버 등록, 위치별 버전 정합성, 브라우저 렌더링 및 실제 도면 적용성을 검증한다. 결과는 세 Viewer의 장단점·Entity 충실도·성능·한계와 향후 시스템화 가치에 대한 근거를 제공해야 한다.

P0=필수, P1=가능한 범위 구현 또는 지원 여부 평가. `PLANNED`=미구현, `IN_PROGRESS`=진행 중, `VERIFIED`=관련 시험으로 확인, `BLOCKED`=외부 조건 대기. 아래 상태는 구현 근거에 따라 갱신한다. VERIFIED 항목은 TestReport의 U1/U2/U3 실행 기록을 참조하며 Viewer 요구는 PLANNED이다. Test Case 상세의 기준은 [TestPlan](TestPlan.md)이다.

## 기능 요구사항

| ID | 제목·설명 | 우선순위 | Acceptance Criteria | 관련 TC | 구현 예정 / 상태 |
| --- | --- | --- | --- | --- | --- |
| FR-CAD-001 | DXF/DWG 로컬 파일 업로드 | P0 | 선택한 한 파일의 bytes가 원본 그대로 저장되고 Version ID를 반환한다 | TC-UP-001 | features/cad-upload, U2 / VERIFIED |
| FR-CAD-002 | 파일 유효성 검증 | P0 | 파일 누락·빈 파일·미지원 확장자·최대 크기 초과를 거부하고 실패 이유를 표시한다 | TC-UP-002 | server/services/upload, U2 / VERIFIED |
| FR-CAD-003 | 메타데이터 등록 | P0 | 사업부·사업장·동·층·등록일·Current 지정 여부를 입력하고 서버에서 검증한다 | TC-UP-003 | domain/cad, U2 / VERIFIED |
| FR-CAD-004 | 파일 식별·중복 확인 | P1 | SHA-256·크기·형식·원본명·내부 저장 위치를 기록하고 동일 hash를 식별한다 | TC-UP-004 | storage/repository, U2 / VERIFIED |
| FR-CAD-005 | 저장 실패 처리 | P0 | Upload/Storage/DB 실패 시 성공으로 표시하지 않고 기존 Current를 보존하며 잔여 파일을 정리 또는 복구 대상으로 식별한다 | TC-UP-005 | upload service, U2 / VERIFIED |
| FR-LOCATION-001 | Location 식별·중복 금지 | P0 | 정규화된 네 값 조합 Unique, 별도 내부 ID; 동시 동일 Location 생성도 중복되지 않는다 | TC-DB-001 | server/repositories/cad.ts, U1 / VERIFIED |
| FR-VERSION-001 | Location별 버전 생성 | P0 | 같은 Location에 여러 Version이 존재하고 순번 중복 및 존재하지 않는 Location 참조를 차단한다 | TC-DB-002 | server/repositories/cad.ts, U1 / VERIFIED |
| FR-VERSION-002 | Current 최대 하나 | P0 | DB·Service·API·UI 모두 Location당 Current가 0 또는 1임을 보장한다 | TC-DB-003, TC-API-004 | DB/repository/Current UI, U1/U3 / VERIFIED |
| FR-VERSION-003 | Current 원자적 교체 | P0 | 새 Version 지정 시 기존 Current가 해제되고 중간 실패는 이전 상태로 돌아간다 | TC-DB-004, TC-DB-005 | server/repositories/cad.ts, U1/U3 / VERIFIED |
| FR-VERSION-004 | Current 소속 일치 | P0 | 다른 Location의 Version을 Current로 지정하는 직접 SQL 및 API 요청이 거부된다 | TC-DB-006, TC-API-004 | DB constraint, service / PLANNED |
| FR-LIST-001 | CAD 목록 | P0 | 네 위치 값·Version·파일명·DXF/DWG·등록일·Current를 표시하고 빈 결과도 처리한다 | TC-LIST-001 | features/cad-list, U3-20260908 / VERIFIED |
| FR-LIST-002 | 검색·Filter | P0 | 파일명·사업부·사업장·동·층·형식·Current 단독/조합 필터가 SQLite query로 일치 결과를 반환한다 | TC-LIST-002 | server/repositories/cad-list.ts, U3-20260908 / VERIFIED |
| FR-LIST-003 | 위치 상세·Version 선택 | P0 | Location 상세에서 버전 목록·Current를 확인하고 선택한 Version의 Viewer로 이동한다 | TC-LIST-003 | app/features / IN_PROGRESS; 관리 기능 검증, Viewer 미구현 |
| FR-FILE-001 | ID 기반 원본 조회 | P0 | Version ID로 올바른 bytes를 반환하고 없는 DB 행/파일은 404, 경로 입력은 거부한다 | TC-API-003, TC-SEC-001 | content API/storage, U2 / VERIFIED |
| FR-VIEWER-001 | Adapter 분리·형식 라우팅 | P0 | 업무/UI가 외부 API에 직접 의존하지 않고 DXF/DWG에 허용된 Adapter만 선택한다 | TC-VIEW-001 | viewers/core / PLANNED |
| FR-VIEWER-002 | dxf-viewer 표시 | P0 | 정상 DXF가 실제 canvas에 표시되고 손상 파일은 이해 가능한 실패 상태가 된다 | TC-DXF-001, TC-DXF-002 | viewers/dxf-viewer / PLANNED |
| FR-VIEWER-003 | three-dxf-viewer 표시 | P0 | 동일 DXF로 실제 렌더링이 가능하고 메타데이터/상태와 연결된다 | TC-THREE-001 | viewers/three-dxf-viewer / PLANNED |
| FR-VIEWER-004 | DXF Viewer 전환 | P0 | 페이지 전체 reload 없이 같은 Version을 양방향 전환하고 이전 자원을 해제한다 | TC-SWITCH-001, TC-SWITCH-002 | viewer manager / PLANNED |
| FR-VIEWER-005 | DWG 전용 처리 | P0 | libredwg-web WASM으로 직접 DWG를 읽어 표시하고 DXF Viewer 선택 및 DXF 변환 경로가 없다 | TC-DWG-001, TC-DWG-002 | viewers/libredwg-web / PLANNED; ADR-004 확인 대기 |
| FR-VIEWER-006 | 기본 탐색 기능 | P0 | 표시·Zoom ±·Pan·Fit·Resize·재초기화·Dispose 각각을 구현하거나 미지원 근거를 기록한다 | TC-VIEW-002, TC-VIEW-003 | adapters / PLANNED |
| FR-VIEWER-007 | 확장 기능 평가 | P1 | Layer 조회/On-Off·Hover·Select·Entity 정보·Snap을 Viewer별 실제 지원/부분/미지원/미검증으로 구분한다 | TC-CAP-001 | adapters, TestReport / PLANNED |
| FR-VIEWER-008 | WASM 생명주기 | P0 | 초기화·반복 Load·재진입·Memory 해제·Dispose·Browser 호환성과 오류를 검증한다 | TC-DWG-003, TC-DWG-004 | libredwg adapter / PLANNED |
| FR-ERROR-001 | 사용자 오류 처리 | P0 | 미지원 파일, Upload/DB/Storage 실패, 파일 없음, Parse/초기화/WASM 실패, 손상 DXF/DWG, 미지원 Entity를 구분하고 stack trace를 노출하지 않는다 | TC-ERR-001 | app/features / IN_PROGRESS; 관리 기능 검증, Viewer 미구현 |
| FR-UI-001 | 업무용 데스크톱 UI | P0 | 목록·등록·위치 상세·Viewer 제공; 검색/Current 식별, Metadata sidebar, Viewer 선택, 상태/크기/시간 표시 | TC-UI-001, TC-E2E-001 | app/features / IN_PROGRESS; 관리 기능 검증, Viewer 미구현 |

## 비기능·평가·운영 요구사항

| ID | 제목·설명 | 우선순위 | Acceptance Criteria | 관련 TC | 구현 예정 / 상태 |
| --- | --- | --- | --- | --- | --- |
| NFR-ARCH-001 | 단순한 계층 구조 | P0 | Next.js→Service→Domain/Repository→SQLite와 Local Storage; 불필요한 별도 Backend/Search/Queue 없음 | TC-ARCH-001 | Architecture, src / PLANNED |
| NFR-ARCH-002 | Client/Server 분리 | P0 | Production Build에서 DOM/WebGL 실행 오류가 없고 server 모듈/Secret이 client bundle에 없다 | TC-BOOT-003, TC-SEC-002 | client boundary / PLANNED |
| NFR-DATA-001 | SQLite/Prisma Schema 관리 | P0 | Migration으로 재현되며 FK/Unique/Index/Null/Default가 Database.md와 일치한다 | TC-DB-007 | prisma / PLANNED |
| NFR-SEC-001 | 파일 경로 보호 | P0 | traversal·경로 형태 ID·조작된 저장 키·저장 루트 밖 symlink를 차단한다 | TC-SEC-001 | storage / PLANNED |
| NFR-SEC-002 | Secret·원본 비추적 | P0 | .env 및 Credential·업로드 CAD·Runtime DB·Build/cache가 commit/push 대상과 응답/log에서 제외된다 | TC-BOOT-002, TC-SEC-002 | ignore, tooling / IN_PROGRESS |
| NFR-CONFIG-001 | 환경 설정 | P0 | 기존 Git 변수명을 유지하고 DB/Storage/Upload 제한은 앱 전용 설정으로 분리한다 | TC-BOOT-004 | config / PLANNED |
| NFR-PERF-001 | Viewer 성능 측정 | P1 | 성공/실패·load/parse/최초 표시·size·entity·error·browser를 기록하고 측정 불가 값은 사유와 null로 표시한다 | TC-MET-001 | viewer metrics / PLANNED |
| NFR-PERF-002 | 대형 파일·자원 평가 | P1 | 동일 조건 반복 측정, console 오류·memory·zoom/pan 반응성·반복 전환 자원 추세를 정량/정성으로 구분한다 | TC-MET-002, TC-SWITCH-002 | TestReport / PLANNED |
| NFR-FIDELITY-001 | 실제 Entity 충실도 | P0 | 제공된 Sample의 대상 Entity별 비교 근거·문제·미검증 사유를 기록한다 | TC-CAD-001 | manual evaluation / PLANNED |
| NFR-EVAL-001 | 세 기술 최종 평가 | P0 | 장단점·성능·지원/문제 Entity·대형 파일·발견 문제를 평가하고 DXF 비교와 DWG 평가를 분리한다 | TC-EVAL-001 | TestReport / PLANNED |
| NFR-TEST-001 | 단위 개발·회귀 | P0 | DB 핵심 규칙/API/Adapter 자동화 및 최소 DXF E2E, 필요한 실도면 수동 확인; 실패 미해결 시 다음 Unit 금지 | TC-E2E-001, TC-E2E-002, TC-REL-001 | tests / PLANNED |
| GOV-BOOT-001 | 구현 전 Bootstrap | P0 | Workspace/Git/.env 안전 조사, AGENTS/README/8종 out 문서, Unit/AC/TC 작성 후 계획 확인 전 코드 미구현 | TC-BOOT-001 | docs / IN_PROGRESS; BOOT-20260907-01 정적 검사 PASS, 계획 확인 대기 |
| GOV-DOC-001 | 문서 최신성·추적 | P0 | Schema는 Database가 기준, 관련 변경마다 README/상세문서/Requirement→Implementation→TC→Result 갱신 | TC-DOC-001 | docs / IN_PROGRESS |
| GOV-GIT-001 | 지정 원격·안전한 형상관리 | P0 | .env와 remote 일치, 의미 있는 Conventional Commit, 사전 diff/보안 점검, 무단 history 변경·타 원격 전송 없음 | TC-GIT-001 | Git workflow / IN_PROGRESS |
| GOV-VER-001 | SemVer·Release | P0 | src/package.json 단일 기준, 기능 MINOR/수정 PATCH; Tag 전에 테스트·문서·버전·Commit 일치 | TC-REL-001 | package, ChangeLog / PLANNED |

## 범위 제외

DWG→DXF 변환 후 DXF Viewer 사용, Geometry 수정/Line 생성/Entity 삭제/CAD 저장/도면 편집 이력, AV/DLP, 별도 검색 엔진·메시지 큐·Microservices는 제외한다. 파일/Location 삭제·메타데이터 사후 편집·권한/로그인·인터넷 공개 운영·다중 서버 배포는 요청되지 않았으므로 추가하지 않는다. P.O.C. 대상은 기본적으로 2D 공장 Layout이며 3D/외부 참조/복잡한 Sheet 지원은 검증 결과로만 기록한다.

## 해석·기본안·확인사항

| 항목 | 분석 및 제안 | 처리 |
| --- | --- | --- |
| Bootstrap에 Next.js가 포함되는 §54 vs 최초 구현 금지 §91/100 | Unit 0A=문서, Unit 0B=사용자 확인 후 실제 환경 초기화 | ADR-001 |
| libredwg-web을 Viewer로 지칭 | 공식 패키지는 파서이다. DWG를 직접 파싱한 객체를 Adapter 내부 Three.js 렌더링 계층에서 표시하는 안 | **중요 확인**, ADR-004 |
| Current가 반드시 존재하는지 | 명시된 '최대 하나'에 따라 0도 허용; Upload의 Current 체크 기본 true, false면 기존 pointer 유지 | ADR-005 |
| CAD Version 표현과 앱 SemVer 혼동 | CAD는 Location별 자동 정수 V1/V2…, 앱은 0.x.y | ADR-006 |
| 네 위치 값의 동일성 | 앞뒤 공백 제거+Unicode NFC, 대소문자/내부 공백은 보존; '2층'과 '2F' 자동 병합 안 함 | ADR-006 |
| 등록일 | 사용자 입력 달력 날짜, 기본 Asia/Seoul 오늘; 감사용 생성/수정 시각은 UTC | ADR-006 |
| 동일 bytes 재등록 | SHA-256 일치 알림/응답 정보 제공, 새 Version 등록 허용; 자동 덮어쓰기·중복 차단 안 함 | ADR-007 |
| 파일 크기·평가 자료 | 기본 제한 100 MiB 제안, 환경변수 조정; Sample/업무 성능 목표 미제공 | 초기 구현 비차단, 실도면 최종 평가 대기 |
| 인증/운영 환경 | 단일 Node 프로세스, 로컬 loopback 실행 기본; 공개 서비스는 계획 밖 | ADR-009 |

설계 기본안은 이 계획의 확인과 함께 채택한다. 실도면/업무 성능 기준이 없으면 기술적 시험은 진행할 수 있으나 업무 적용성을 검증 완료로 선언하지 않는다.

## 원본 요구사항 범위 대응

| 원본 절 | 관리 위치/요구 묶음 |
| --- | --- |
| §0–8, 90–94, 98–102 | GOV-BOOT-001, GOV-DOC-001; AGENTS, Decisions |
| §9–13, 63–68, 96 | GOV-GIT-001, NFR-SEC-002; Operation, TestReport |
| §14–17 | FR-CAD-001–005, FR-VIEWER-001 |
| §18–26 | FR-LOCATION-001, FR-VERSION-001–004, NFR-DATA-001; Database |
| §27–28 | FR-LIST-001–003 |
| §29–38 | FR-VIEWER-001–008, NFR-PERF-001–002, NFR-FIDELITY-001 |
| §39–47 | FR-UI-001, FR-ERROR-001, FR-FILE-001, NFR-ARCH-001–002, NFR-SEC-001 |
| §48–53 | GOV-DOC-001; README, Architecture, TestPlan, TestReport |
| §54–62 | NFR-TEST-001; TestPlan, TestReport |
| §69–74 | GOV-VER-001; Decisions, ChangeLog |
| §75–82 | NFR-ARCH-001–002, NFR-CONFIG-001, FR-VIEWER-008; Architecture, Operation |
| §83–89 | NFR-TEST-001, NFR-EVAL-001; TestPlan, TestReport |
| §95, 97 | AGENTS Workflow・禁止事項, GOV-GIT-001, NFR-TEST-001 |

## 최종 완료 판정

DXF 등록→Metadata→Current→목록→검색→선택→dxf-viewer→three-dxf-viewer 전환과 DWG 등록→동일 관리 흐름→libredwg-web 표시가 실제 동작해야 한다. DB부터 UI까지 Current 규칙이 일치하고 필수 테스트·실도면 평가·문서·Commit 등 DoD를 충족해야 한다. 등록·관리 기능은 개별 검증했지만 Viewer와 실도면 평가가 남아 있어 전체 P.O.C. 완료로 판정하지 않는다.

## 2026-09-07 실행 순서 변경

사용자가 계획 실행을 승인했다. DXF 두 Viewer와 공통 관리 기능·계측·회귀를 먼저 구현하고, libredwg-web은 그 다음 MINOR 버전으로 진행한다. DWG 선행 실험은 DXF 구현의 조건에서 제외한다. 최신 단계/승인 상태는 Decisions의 ADR-011과 TestPlan을 따른다. 기존 미실행 기록은 당시 상태이며 실제 완료 후 갱신한다.
