# CAD Web Viewer P.O.C.

공장·설비의 DXF/DWG 도면을 등록·검색·버전 관리하고, 세 오픈소스 기술의 브라우저 렌더링 적용 가능성을 평가하는 프로젝트입니다.

**현재 버전: 0.9.0 — libredwg-web 독립 LINE 실험 추가.** `/cad/upload`에서 DXF/DWG를 등록하면 `/` 목록에서 즉시 확인할 수 있습니다. 위치별 상세에서 버전과 Current를 관리합니다. 실제 버전 기준은 `src/package.json`입니다. DXF Viewer 두 방식부터 구현하고, DWG 최소 실험은 `/lab/dwg`에 제공하며 등록 도면 연결은 다음 단계입니다.

## 목표 기능

- DXF/DWG 업로드, 사업부·사업장·동·층·등록일 입력, SHA-256 식별.
- 동일한 네 위치 값 조합을 Location으로 관리하고 Current Version을 **최대 하나** 유지.
- 도면 목록·파일명 검색·위치/형식/Current 필터, Location별 Version 선택.
- DXF Viewer 두 방식 전환, DWG 전용 경로, 오류·부분 지원·성능 계측.
- 실도면 Entity 충실도·대형 파일·사용성 비교와 재현 가능한 테스트/문서.

현재 지원: 파일 등록·메타데이터 검증·SHA-256·원본 조회·목록·검색·페이지 이동·Location 상세·Current 변경. 파일명은 대소문자를 구분하는 부분 일치, 위치 네 항목은 정확히 일치하는 조건으로 검색합니다. DXF 행의 **도면 보기**에서 dxf-viewer를 실행합니다. 확대·축소·드래그 이동·화면 맞춤·Resize·다시 불러오기를 지원합니다. Viewer 버튼으로 dxf-viewer와 three-dxf-viewer를 새로고침 없이 전환합니다. 같은 Version의 원본 다운로드를 재사용합니다. DWG Viewer는 후속 단계입니다.

## 지원 형식과 Viewer 구성 계획

| 형식 | Viewer | 구성 |
| --- | --- | --- |
| DXF | dxf-viewer 1.0.48 | 전용 Adapter/Worker, 기본 도형 WebGL 검증 |
| DXF | three-dxf-viewer 1.0.44 | 별도 Three.js 0.171 scene, 기본 탐색 및 Layer 표시/숨김 |
| DWG 실험 | @mlightcad/libredwg-web 0.7.10 | 전용 Worker/WASM 파싱 후 자체 LINE 렌더링; 등록 도면 연결 후속 |

`libredwg-web`은 파서이므로 직접 렌더링 계층이 필요합니다. DWG→DXF 변환은 범위에 포함하지 않습니다. 출처·실제 조사 버전·API 검증 과제는 [Architecture](out/Architecture.md), 선택 근거는 [Decisions](out/Decisions.md)를 참조하세요. 두 DXF 라이브러리와 libredwg-web을 고정 설치했습니다. 기본 도형과 한글 시험 결과는 TestReport에서 확인합니다.

## 기술 Stack와 구조

Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS와 Next Route Handler→Application Service→Repository/Prisma→SQLite 및 Local Filesystem을 사용합니다. Viewer는 UI→Manager→Adapter→각 라이브러리로 분리했습니다. 설치 버전은 package/lock에 고정합니다.

```text
AGENTS.md          # 에이전트 개발 진입 규칙
README.md          # 프로젝트·실행 안내
.env               # 실제 로컬 설정, Git 제외
.env.example       # 변수명과 설명
.gitignore
src/               # 실행 가능한 앱·설정·테스트·migration
out/               # 요구·설계·테스트·운영 Markdown
data/              # DB/CAD 런타임 저장, Git 제외
```

## 사전 요구사항·환경설정

Node.js/npm/Git, 영속 local disk, 데스크톱 Browser를 사용합니다. 검증 환경은 Node 22.14.0/npm 11.10.0/Git 2.43.0입니다. 향후 Viewer에는 WebGL/WASM이 필요합니다.

Root `.env`가 이미 있으면 보존합니다. 새 checkout에 없을 때만 `.env.example`을 기반으로 생성하고 실제 값은 로컬에서 입력합니다. 기존 Git 변수명 `remote_repo_url`, `remote_repo_token`을 유지합니다. 앱 설정은 `DATABASE_URL`, `CAD_STORAGE_PATH`, `MAX_UPLOAD_SIZE_MB`를 계획하며 상세/기본값/안전한 로딩은 [Operation](out/Operation.md)에 있습니다. Secret을 NEXT_PUBLIC_* 변수로 넣지 않습니다.

GitHub remote는 `.env`의 지정 저장소만 사용합니다. 기존 `origin`과 설정의 일치 및 인증을 확인했습니다. 작업 branch는 `main`입니다. 새 checkout은 지정 저장소를 clone하고, 기존 workspace는 설정과 remote 일치를 먼저 확인합니다. Token을 remote URL에 포함하지 않습니다. Commit/Push 결과는 [TestReport](out/TestReport.md)에 기록합니다.

## 설치·DB 초기화·실행·테스트

아래 명령은 Root에서 실행합니다. 먼저 설치→DB Client 생성→Migration 적용을 수행합니다. E2E는 Production Build 후 실행하며 운영 DB와 분리된 임시 DB/Storage를 사용합니다. Chromium 설치가 필요하면 `cd src` 후 `npx playwright install chromium`을 실행합니다.

| 작업 | 명령 |
| --- | --- |
| 설치 | `npm --prefix src ci` |
| DB Client 생성 | `npm --prefix src run db:generate` |
| DB 초기화/검토된 Migration 적용 | `npm --prefix src run db:deploy` |
| 개발 실행 | `npm --prefix src run dev` |
| Production Build | `npm --prefix src run build` |
| Production 실행 | `npm --prefix src run start` |
| Type Check / Lint | `npm --prefix src run typecheck` / `npm --prefix src run lint` |
| 자동 테스트 / E2E | `npm --prefix src test` / `npm --prefix src run test:e2e` |

기본 포트는 3000이며 `npm --prefix src run start -- --port 3100`으로 변경할 수 있습니다. 목록은 `/`, 등록은 `/cad/upload`, 위치 상세는 `/cad/locations/{locationId}`입니다. 새 Build 적용 시 서버를 재시작합니다. DB·업로드 파일 백업/복구 및 장애 대응은 [Operation](out/Operation.md), 실제 검증 결과는 [TestReport](out/TestReport.md)에서 확인합니다.

## 미지원 범위·알려진 제약

CAD 편집/Geometry 변경/저장, DWG→DXF 우회, 별도 검색 엔진·Backend 플랫폼, 사용자/권한 시스템과 공개 운영은 이번 범위에 없습니다. dxf-viewer의 LINE/CIRCLE은 Chromium에서 검증했습니다. 한글 기본 글꼴을 로컬에 포함했습니다. 원본 글꼴과 동일한 모양을 보장하지 않으며 잘못된 문자 인코딩은 별도 문제입니다. 합성 LINE 성능은 U8A에서 측정했습니다. 실도면·10 MiB 초과 파일·다른 Browser·복잡한 Entity 충실도는 미검증이며 업무 성능 목표도 제공되지 않았습니다. `libredwg-web` 경로는 현재 평면 LINE 최소 실험이며 CIRCLE/BLOCK/TEXT 등 업무 도면 렌더링은 후속 구현입니다. 상세 Known Issue와 시험 상태는 [TestReport](out/TestReport.md)를 기준으로 합니다.

## 상세 문서

| 문서 | 내용 |
| --- | --- |
| [AGENTS](AGENTS.md) | 개발/운영 핵심 규칙과 문서 참조 시점 |
| [Requirements](out/Requirements.md) | 요구 ID, 범위, Acceptance Criteria, 추적 |
| [Architecture](out/Architecture.md) | 시스템·API·Viewer·실패 처리 초안 |
| [Database](out/Database.md) | DB Schema의 단일 기준 |
| [TestPlan](out/TestPlan.md) | 구현 Unit, 순서, 테스트 기준 |
| [TestReport](out/TestReport.md) | 실제 검증 결과와 Viewer 평가 |
| [Operation](out/Operation.md) | 설정·명령·Git·복구·장애 대응 |
| [Decisions](out/Decisions.md) | 주요 판단·제안·확인 대기 |
| [ChangeLog](out/ChangeLog.md) | 변경 및 버전 이력 |

Unit 9A DXF 통합·회귀 검증을 완료했습니다. Unit 7A의 독립 LINE 실험을 검증했으며 다음 단계는 Unit 7B 등록 DWG Viewer 통합입니다. 등록 메모 요청(원격 이슈 #2)은 별도 후속 항목으로 기록했습니다. 승인된 범위에서는 Unit별 구현→테스트→문서→Commit→필요 시 Push를 반복합니다.

## 2026-09-07 실행 순서 변경

사용자가 계획 실행을 승인했다. DXF 두 Viewer와 공통 관리 기능·계측·회귀를 먼저 구현하고, libredwg-web은 그 다음 MINOR 버전으로 진행한다. DWG 선행 실험은 DXF 구현의 조건에서 제외한다. 최신 단계/승인 상태는 Decisions의 ADR-011과 TestPlan을 따른다. 기존 미실행 기록은 당시 상태이며 실제 완료 후 갱신한다.

## 글꼴 제공

`src/public/fonts/NanumGothic-Regular.ttf`와 OFL 라이선스를 포함합니다. dxf-viewer는 TTF를 직접 읽고, three-dxf-viewer는 build/dev가 생성하는 `CadKorean.typeface.json`을 읽습니다. 생성 JSON은 Git 제외이며 배포 시 public/fonts에 포함해야 합니다. 앱 실행 중 외부 font CDN을 사용하지 않습니다. 파일 출처·hash·변환 및 교체 방법은 Operation을 참조하세요.

## Viewer 측정

도면 아래에서 전체 시간·도면 처리·첫 화면 관찰·원본 재사용 여부를 확인하고 **측정 JSON 저장**으로 결과를 내려받습니다. 순수 파싱 시간은 미계측이며 도면 처리에는 파싱/준비/글꼴/렌더링이 포함됩니다. 표시 완료는 모든 CAD Entity의 충실도 보증을 의미하지 않습니다.

Production Build 후 `npm --prefix src run test:benchmark`로 생성 LINE 100/10,000/100,000개를 두 Viewer에서 cold/warm 각 5회 실행합니다. 기존 E2E와 같은 Chromium 설정을 사용하며 결과는 Git 제외 `src/benchmark-results/measurements.jsonl`에 저장됩니다. 측정 정의·실행 조건과 실제 값은 TestPlan/TestReport를 참조하세요. 실도면·전용 성능 장비의 시험을 대체하지 않습니다.

## DWG 기술 실험

`/lab/dwg`에서 20 MiB 이하의 로컬 DWG를 선택합니다. 서버에 등록하지 않고 WASM으로 읽어 평면 LINE만 직접 표시합니다. 제외 Entity 수와 파싱·해제 결과를 확인할 수 있습니다. 라이브러리 자체가 완성형 Viewer라는 의미는 아닙니다.

Build/dev는 고정 npm 배포본의 ESM/WASM을 `public/libredwg`에 준비합니다. Production에는 이 생성 자산도 필요합니다. 공식 샘플 준비는 `npm --prefix src run prepare:dwg-samples`, Browser 검증은 `npm --prefix src run test:dwg`입니다. Chromium 설정·샘플 출처·해시·GPL-3.0 표기와 메모리 제약은 Operation/Architecture/TestReport를 참조하세요.
