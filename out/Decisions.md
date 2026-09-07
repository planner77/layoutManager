# 주요 기술 결정과 승인 기록

기준일: 2026-09-07. `요구사항 확정`은 사용자 원문이 결정한 사항, `제안`은 이 계획 확인 후 채택할 기본안, `확인 대기`는 별도 중요한 판단이 필요한 사항이다. 2026-09-07 사용자가 DXF 우선, DWG 다음 버전 순서로 계획 실행을 승인했다. 최신 순서는 ADR-011을 따른다.

## ADR-001 — 문서 Bootstrap와 환경 초기화 분리

- Date / Status: 2026-09-07 / 요구사항 확정에 따른 단계 해석.
- Context: 원문 Unit 0에는 Next.js 초기화가 있지만 최초 Bootstrap에서 실제 구현을 금지한다.
- Decision: 0A는 조사·문서·계획·ignore, 0B는 사용자 계획 확인 후 코드/의존성/DB 환경 초기화.
- Alternatives: 초기 지시에서 앱까지 생성.
- Reason: §91/100의 명시적 순서를 지킨다.
- Trade-offs / Consequences: 현재 실행 명령/버전/기능 테스트는 미확정이며 README에 계획으로 표시한다. src에는 빈 placeholder만 둔다.

## ADR-002 — Next.js 단일 앱, SQLite + Prisma 우선

- Date / Status: 2026-09-07 / 기본 Stack은 요구사항 확정, 상세 버전은 제안 단계.
- Context: P.O.C.의 관리 기능·테스트 가능성과 구조적 단순성.
- Decision: src를 Next.js 루트로 두고 TS/React/shadcn/Tailwind, Route Handler→Service→Repository→SQLite 사용. npm lock으로 재현.
- Alternatives: 별도 Backend, 다른 ORM/DBMS.
- Reason: 기본 요구 충족, 외부 의존 최소화.
- Trade-offs / Consequences: SQLite 단일 writer·로컬 디스크 제약이 있다. Prisma relation/SQLite driver/Next 조합을 0B/1에서 검증하고 exact version을 기록한다. 중요한 대체는 사용자 확인 대상이다.

## ADR-003 — Viewer Adapter와 Browser 경계

- Date / Status: 2026-09-07 / 요구사항 확정.
- Context: 서로 다른 CAD API·Three/WebGL/WASM 생명주기.
- Decision: UI→Manager→각 Adapter로 격리, Client dynamic import. DXF 두 Renderer 선택, capability에 따라 기능 표시.
- Alternatives: UI에서 직접 Library 호출, 강제로 동일 API 흉내 내기.
- Reason: 독립 평가·전환·자원 해제와 교체 용이성.
- Trade-offs / Consequences: Adapter 코드가 필요하다. library 별 Three 객체 교환을 피하고 upstream source 수정보다 Wrapper를 우선한다.

## ADR-004 — LibreDWG 파서 이후 직접 렌더링

- Date / Status: 2026-09-07 / **사용자 확인 대기**.
- Context: [공식 JS 문서](https://github.com/mlightcad/libredwg-web/blob/master/bindings/javascript/README.md)는 `@mlightcad/libredwg-web`을 DWG parser로 소개한다. 요구사항의 화면 표시를 위해 parse 이후 렌더링 책임을 정해야 한다.
- Decision 제안: LibreDwgWebAdapter 안에서 WASM으로 DWG를 읽고 반환 객체를 직접 Three.js geometry로 표시한다. UI의 Viewer 명칭은 libredwg-web, 보고서는 파서와 자체 렌더러 기여/한계를 구분한다. DXF 변환 및 두 DXF Viewer 사용은 금지한다.
- Alternatives: 파싱만 검증(최종 화면 요구 미충족), 다른 완성형 CAD Viewer 도입(제품 선택과 범위 변경 필요).
- Reason: 지정 기술·직접 DWG 경로를 유지하면서 실제 표시 목표를 달성하기 위한 최소 구조.
- Trade-offs: 직접 렌더링에는 Entity별 구현·font·block·hatch/curve 등의 추가 작업이 필요하다. 미지원 Entity를 숨기지 않고 부분 지원으로 기록한다. 자체 renderer 결함을 LibreDWG parser 한계로 잘못 귀속하지 않는다.
- Consequences: Unit 7A는 ADR-011에 따라 DXF 릴리스 이후 최소 DWG parse/render/free 실험으로 수행한다. 초기 최소 기하 성공은 최종 업무 도면 호환성 증명이 아니다. 구현 전 사용자에게 이 구체적인 안을 확인한다.

## ADR-005 — Location의 단일 Current pointer

- Date / Status: 2026-09-07 / 제안(원문 우선 검토 모델).
- Context: Location별 동시에 Current 최대 하나, 소속 일치 필요.
- Decision: nullable current_version_id를 유일한 Current 기준으로 사용하고 복합 FK로 같은 Location의 Version만 참조한다. 교체/등록은 transaction, UI는 pointer로 Current 파생.
- Alternatives: Version별 boolean+partial unique index.
- Reason: 중복 flag 없이 최대 하나를 구조적으로 표현한다.
- Trade-offs / Consequences: 순환/복합 relation의 ORM migration 검증이 필요하다. Current 0개 허용, Upload 체크 기본 true, false는 기존 pointer 유지. DB 상세는 Database.md만 갱신한다.

## ADR-006 — 도면 순번·위치 정규화·등록일

- Date / Status: 2026-09-07 / 제안.
- Context: CAD Version 문법·문자열 동일성·등록일 타입이 미정이다.
- Decision: 도면 버전은 Location별 정수 1부터 Vn 표시. 위치는 trim+NFC 후 대소문자/내부 공백 유지. 등록일은 YYYY-MM-DD, 기본 서울 오늘; 생성/수정 시각 UTC.
- Alternatives: 사용자 입력 SemVer/문자열 버전, 자동 영문 case folding/층 별칭 통합, 등록일=타임스탬프.
- Reason: P.O.C. 범위에서 순번 경쟁을 검증하기 쉽고 임의 별칭 병합·시간대 날짜 변형을 피한다.
- Trade-offs / Consequences: 외부 업무 revision label은 별도 요구 시 추가한다. 앱 SemVer와 도면 버전은 독립이다.

## ADR-007 — 로컬 파일·Hash·중복 정책

- Date / Status: 2026-09-07 / Local Filesystem은 확정, 세부 정책 제안.
- Context: CAD 원본과 Metadata/DB 원자성이 다르다.
- Decision: 원본은 안전한 UUID 경로, server SHA-256, 동일 hash 등록 허용+중복 정보 제공, temp→rename→DB commit와 실패 보상. 기본 Upload 한도 100 MiB 제안.
- Alternatives: hash Unique로 중복 거부, DB Blob, object storage.
- Reason: 의도적인 같은 파일의 새 Version을 차단하지 않고 식별 근거를 유지한다.
- Trade-offs / Consequences: 중복 파일이 공간을 소비하며 DB/FS crash orphan 복구가 필요하다. 자동 삭제·dedup storage는 추가하지 않는다.

## ADR-008 — 루트 .env와 앱 Credential 분리

- Date / Status: 2026-09-07 / 비밀보호 확정, 로더 구현 제안.
- Context: 기존 변수 `remote_repo_url`, `remote_repo_token`이 있고 앱 루트는 src이다.
- Decision: 기존 .env를 보존한다. Git tooling만 해당 키를 사용하고 앱 launcher는 DATABASE_URL/CAD_STORAGE_PATH/MAX_UPLOAD_SIZE_MB만 allowlist로 읽어 child process에 전달한다. Git 키는 inherited env에서도 제거한다.
- Alternatives: .env 전체를 source하여 앱 실행, src/.env로 Secret 복사, 변수명 변경.
- Reason: Git 인증은 앱 기능에 필요하지 않으며 root/src cwd 차이를 명시적으로 해결한다.
- Trade-offs / Consequences: Next/Prisma/test 모두 동일 loader를 사용해야 한다. 실제 loader와 scripts는 0B에서 작성·검증한다. [Next env 문서](https://nextjs.org/docs/app/guides/environment-variables)는 앱 환경 로딩과 NEXT_PUBLIC 번들 노출을 구분한다.

## ADR-009 — 실행·평가의 경계

- Date / Status: 2026-09-07 / 제안.
- Context: 로그인/배포망·대표 도면·성능 SLA가 제공되지 않았다.
- Decision: 단일 Node 프로세스의 로컬 loopback P.O.C. 기본. 기능 자동화는 생성 DXF/허가된 DWG fixture, 최종 실도면 fidelity는 Sample 제공 후 검증한다. 숫자 성능 목표를 임의 확정하지 않는다.
- Alternatives: 인터넷 공개 서비스·SSO 도입, 임의 SLA/임의 도면을 업무 합격 근거로 사용.
- Reason: 사용자 범위와 객관적 증거를 유지한다.
- Trade-offs / Consequences: 실제 운영망 배포/권한/업무용 성능 적합성은 별도 조건 확인이 필요하다. 라이선스 명칭은 Architecture에 조사 근거로 기록하고 배포 조건이 정해지면 해당 배포 정책을 검토한다.

## ADR-010 — Git, 앱 버전과 Release

- Date / Status: 2026-09-07 / 요구사항 확정.
- Context: 지정 remote와 안전한 형상관리, 아직 앱 package가 없음.
- Decision: origin과 .env 일치 확인 후 의미 있는 Conventional Commit. 앱 version은 src/package.json이 생긴 뒤 단일 기준, 최초 0B 목표 0.1.0, 의미 있는 기능마다 MINOR 검토, 호환 수정 PATCH.
- Alternatives: 문서 Bootstrap에 가짜 앱 version 부여, arbitrary 원격/force push.
- Reason: 재현·복구·버전 사실성을 유지한다.
- Trade-offs / Consequences: 현재 앱 버전 없음/Release Tag 없음. 초기 Git author 미설정은 2026-09-07 사용자가 제공한 정보로 repository-local config를 설정하여 해결했다. 작성자 정보 제공은 구현 계획 승인과 구분한다. 연결 성공은 Push 권한 검증과 구분한다.

## 확인 및 진행 기록

| 항목 | 상태 | 다음 조치 |
| --- | --- | --- |
| 전체 구현 계획 | 2026-09-07 실행 승인 | DXF 우선 순서로 0B 시작 |
| ADR-004 직접 DWG 렌더링 | 다음 버전으로 이관 | DXF 릴리스 후 실제 API 실험, 중요한 추가 구조 변경만 확인 |
| 첫 Git 문서 Commit 작성자 | 2026-09-07 사용자 제공 정보로 local 설정 완료 | 보안 점검 후 지정 remote에 문서 commit/push; 실제 결과는 TestReport 참조 |
| 실도면·업무 성능 목표 | 미제공 | 합법적인 최소 fixture로 초기 시험, 실도면 평가는 미검증 유지 |

확인일·범위·사용자 변경 지시를 실제 응답이 왔을 때 기록한다. 단순한 문서 작성이나 시간 경과를 승인으로 간주하지 않는다.

## ADR-011 — DXF 우선 릴리스와 DWG 후속 버전

- Date / Status: 2026-09-07 / 사용자 승인.
- Context: 사용자가 dxf-viewer와 three-dxf-viewer를 먼저 구현하고 libredwg-web은 다음 버전에서 구현하도록 명시했다.
- Decision: 공통 DB/등록/검색 기반과 두 DXF Adapter, 전환, DXF metrics/E2E를 먼저 완성한다. DWG 등록/메타데이터는 공통 기반에 유지하되 DXF 릴리스의 DWG 화면에는 렌더링 미구현 상태를 명확히 표시한다. 실행 가능한 DWG Viewer 선택 버튼은 제공하지 않는다.
- Alternatives: DWG 실험 선행(기존안).
- Reason / Trade-offs: 우선 사용할 DXF 경로를 먼저 검증한다. DWG 불확실성은 후속 MINOR 버전에 남으며 DXF 릴리스 완료와 전체 P.O.C. 완료를 구분한다.
- Consequences: 8/9를 DXF 단계(A)와 DWG 단계(B)로 나누고 각각 결과를 기록한다. 0B는 0.1.0, DB/Upload/목록/dxf/three/전환 및 검증의 기능 증가를 순차 MINOR로 관리한다. DWG는 DXF 릴리스보다 높은 MINOR로 별도 구현한다. 이번 지시는 구현 시작 승인으로 기록하며 반복 전체 승인을 요청하지 않는다.

## ADR-012 — 실제 DB 목록과 갱신 일관성

- Date / Status: 2026-09-08 / 승인된 Unit 3 범위에서 채택.
- Context: GitHub #1에서 등록 후 목록 미표시. 기존 홈은 정적 안내였고 DB 조회가 없었다.
- Decision: 서버 동적 목록과 안전한 DTO, 매개변수화 SQLite 검색, 등록/Current 변경 후 경로 및 클라이언트 캐시 갱신을 사용한다.
- Alternatives: 클라이언트 전용 목록 fetch, 별도 검색 엔진.
- Reason: 기존 Next/SQLite 계층으로 충분하며 검색 엔진 추가가 불필요하다.
- Trade-offs / Consequences: 파일명은 대소문자를 구분하는 문자 그대로 부분 검색이다. count/rows 일관성을 위해 기존 프로세스 트랜잭션 큐를 공유한다. 단일 프로세스 P.O.C.에 적합하며 고동시성 확장은 별도 평가한다. Schema 변경은 없다.

## ADR-013 — 첫 DXF Adapter와 Worker

- Date / Status: 2026-09-08 / 승인된 Unit 4 범위에서 채택.
- Context: DOM/WebGL 코드의 SSR 실행을 피하고 이후 두 번째 DXF Viewer를 분리해야 한다.
- Decision: dxf-viewer 1.0.48 고정, Browser effect의 동적 import 및 bundled Worker, 공통 Manager/Adapter. 라이브러리 소스 수정 없이 public API로 탐색과 정리 구현.
- Alternatives: 메인 스레드 파싱, 외부 CDN Worker.
- Reason / Trade-offs: 파싱을 Worker로 분리하고 외부 CDN 의존을 피한다. 취소 시 라이브러리 Worker의 미완료 Promise는 Adapter cancellation과 timeout으로 차단한다. 실도면 메모리 추세는 이후 평가한다.
- Consequences: 기본 글꼴을 아직 제공하지 않아 TEXT/한글은 제한이 있으며 명시적으로 안내한다. 향후 font/encoding·Layer 지원은 Sample 및 라이선스 검토와 함께 확장한다. 이번 검증을 전문 CAD 수준 충실도 보장으로 해석하지 않는다.

## ADR-014 — three-dxf-viewer 및 공통 한글 글꼴

- Date / Status: 2026-09-08 / 승인된 Unit 5에서 채택.
- Context: 두 번째 라이브러리는 font JSON이 필요하고 Scene/탐색을 앱에서 구성해야 한다. 사용자도 한글 글꼴 제공 방식을 문의했다.
- Decision: 고정 three-dxf-viewer 1.0.44 / Three 0.171, 별도 Adapter와 Scene, 로컬 한글 TTF 및 build-time typeface 변환. upstream 코드 변경 대신 material clone/대비 보정과 검증을 Wrapper에 둔다.
- Alternatives: font CDN, 라틴 전용 font, upstream fork.
- Reason / Trade-offs: CDN 없이 두 Viewer에서 같은 글꼴을 검증한다. 전체 한글 typeface JSON의 크기(약 25.8 MB)와 메인 스레드 파싱 비용은 남는다. subset은 실제 도면 문자 범위가 확인된 후 평가한다.
- Consequences: Layer는 UI 연결. Hover/Select/CADControls는 anonymous listener와 public Dispose 부재가 확인되어 현재 UI에 넣지 않는다. SnapsHelper는 clear가 있지만 정확도/복잡도는 아직 실측하지 않았다. source-level 지원 사실을 runtime PASS로 기록하지 않는다. Unit 6에서 전환과 자원 stress를 검증한다.
- 실제 검증에서 생략된 Z 좌표→NaN bounds를 확인했다. 일부 Entity의 생략된 Z=0 보완과 finite bounds 검증을 Wrapper에 추가했다. 원본 bytes는 그대로 보관하며 변환은 브라우저 임시 표현에 한정한다.

## ADR-015 — Version 범위 원본 공유와 Renderer 수명 분리

- Date / Status: 2026-09-08 / 승인된 Unit 6에서 채택.
- Context: 같은 도면 전환마다 전체 navigation/다운로드가 발생했고 빠른 전환의 지연 결과를 차단해야 한다.
- Decision: mounted Version에 ViewerSource를 두고 renderer별 Manager/Adapter를 생성한다. 공유 원본은 독립 복사본으로만 전달한다. URL은 replaceState로 반영하고 explicit reload에서만 cache를 비운다.
- Alternatives: 전환마다 fetch, 전역 무제한 CAD cache, 외부 상태관리 추가.
- Reason / Trade-offs: 동일 bytes 비교와 한 번 다운로드를 보장하며 문서 이탈 시 해제한다. 원본+작업 복사본의 메모리 비용은 허용하고 전역 CAD cache를 만들지 않는다. 시점/Layer 상태 공유는 라이브러리별 좌표 차이 때문에 이번 범위에서 제외한다.
- Consequences: Unit 6은 lifecycle과 자원 수를 검증하며 대형 도면 성능/heap 추세와 P.O.C. 종합 평가는 Unit 8A에 남는다.

## ADR-016 — 관측 가능한 통합 처리 시간

- Date / Status: 2026-09-08 / 승인된 Unit 8A에서 채택.
- Context: 두 라이브러리의 parse/preparation/font 구조가 달라 임의 시간을 순수 parse로 비교하면 오해를 만든다.
- Decision: source/init/adapter 통합 처리/frame 관찰을 공통 측정하고 pure parse는 null+사유. entityCount는 공개 parsed source가 있는 three만 사용, dxf는 미계측. 현재 UI JSON과 독립 benchmark harness로 검증한다.
- Alternatives: upstream parser 수정, 추정 parse 시간, 별도 모니터링 플랫폼.
- Reason / Trade-offs: 원본 수정/대규모 의존 추가 없이 재현성을 확보한다. 세부 parse 비교와 dxf Entity count는 남지만 잘못된 정밀도를 제공하지 않는다.
- Consequences: browser JS heap은 참고 snapshot이며 GPU/전체 누수 보장이 아니다. 실도면/10 MiB 초과 샘플/업무 SLA는 제공된 근거가 없으면 미검증으로 남긴다.

## ADR-017 — DXF 회귀 완료와 실도면 평가 분리

- Date / Status: 2026-09-08 / Unit 9A에서 채택.
- Context: 승인된 DXF 우선 순서에서 통합 검증 단계에 도달했으며 실제 업무 Sample과 SLA는 제공되지 않았다.
- Decision: UI 전체 흐름·Current·양방향 Viewer·20회 전환을 자동화하고 DXF P.O.C. 기능 검증으로 기록한다. 실도면 적합성/DWG는 NOT RUN을 유지한다. 기능 변경 없는 테스트/문서이므로 버전 0.8.0을 유지한다.
- Alternatives: 샘플 없이 전체 P.O.C. 완료 선언, 테스트 추가만으로 MINOR 증가.
- Reason / Trade-offs: 실행 근거와 버전 의미를 보존한다. 합성 도면 통과는 복잡한 업무 CAD의 보증이 아니다.
- Consequences: 다음 승인 Unit은 7A 기술 실험. 신규 원격 이슈 #2 메모는 후속 기능으로 별도 추적한다. Tag는 전체 실도면 적합성 승인으로 오해하지 않도록 이번에 생성하지 않는다.
