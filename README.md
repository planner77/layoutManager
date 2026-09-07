# CAD Web Viewer P.O.C.

공장·설비의 DXF/DWG 도면을 등록·검색·버전 관리하고, 세 오픈소스 기술의 브라우저 렌더링 적용 가능성을 평가하는 프로젝트입니다.

**현재 버전: 0.3.0 — 파일 등록 구현 완료, DXF 우선 개발 진행 중.** `/cad/upload`에서 DXF/DWG를 등록하고 원본을 다운로드할 수 있습니다. 위치 Unique와 Current 트랜잭션을 실제 DB에서 검증했습니다. 실제 버전 기준은 `src/package.json`입니다. 목록·검색과 Viewer는 이후 Unit에서 추가합니다.

## 목표 기능

- DXF/DWG 업로드, 사업부·사업장·동·층·등록일 입력, SHA-256 식별.
- 동일한 네 위치 값 조합을 Location으로 관리하고 Current Version을 **최대 하나** 유지.
- 도면 목록·파일명 검색·위치/형식/Current 필터, Location별 Version 선택.
- DXF Viewer 두 방식 전환, DWG 전용 경로, 오류·부분 지원·성능 계측.
- 실도면 Entity 충실도·대형 파일·사용성 비교와 재현 가능한 테스트/문서.

현재 지원: 파일 등록·메타데이터 검증·SHA-256·원본 조회·Location/Version/Current DB 규칙. 목록·검색·Viewer는 순차 구현 중입니다.

## 지원 형식과 Viewer 구성 계획

| 형식 | Viewer | 구성 |
| --- | --- | --- |
| DXF | dxf-viewer | 전용 Adapter, WebGL Viewer |
| DXF | three-dxf-viewer | 전용 Adapter, Three.js scene 및 interaction 평가 |
| DWG | libredwg-web | WASM 파싱 후 Adapter 내부 직접 렌더링 제안, 확인 대기 |

`libredwg-web`은 파서이므로 직접 렌더링 계층이 필요합니다. DWG→DXF 변환은 범위에 포함하지 않습니다. 출처·실제 조사 버전·API 검증 과제는 [Architecture](out/Architecture.md), 선택 근거는 [Decisions](out/Decisions.md)를 참조하세요. 설치 및 실행 검증은 아직 하지 않았습니다.

## 기술 Stack와 구조

Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS를 기본으로, Next Route Handler→Application Service→Repository/Prisma→SQLite와 Local Filesystem을 계획합니다. Viewer는 UI→Manager→Adapter→각 라이브러리로 분리합니다. 버전은 초기화 때 호환성을 확인하고 package/lock에 고정합니다.

```text
AGENTS.md          # 에이전트 개발 진입 규칙
README.md          # 프로젝트·실행 안내
.env               # 실제 로컬 설정, Git 제외
.env.example       # 변수명과 설명
.gitignore
src/               # 앱·설정·테스트 (현재 빈 placeholder)
out/               # 요구·설계·테스트·운영 Markdown
data/              # 구현 후 DB/CAD 런타임 저장, Git 제외
```

## 사전 요구사항·환경설정

Node.js/npm/Git, 영속 local disk, WebGL/WASM 데스크톱 Browser를 사용합니다. 현재 조사한 환경은 Node 22.14.0/npm 11.10.0/Git 2.43.0이며 앱 호환성 검증은 Unit 0B에서 수행합니다.

Root `.env`가 이미 있으면 보존합니다. 새 checkout에 없을 때만 `.env.example`을 기반으로 생성하고 실제 값은 로컬에서 입력합니다. 기존 Git 변수명 `remote_repo_url`, `remote_repo_token`을 유지합니다. 앱 설정은 `DATABASE_URL`, `CAD_STORAGE_PATH`, `MAX_UPLOAD_SIZE_MB`를 계획하며 상세/기본값/안전한 로딩은 [Operation](out/Operation.md)에 있습니다. Secret을 NEXT_PUBLIC_* 변수로 넣지 않습니다.

GitHub remote는 `.env`의 지정 저장소만 사용합니다. 기존 `origin`과 설정의 일치 및 읽기 연결을 확인했습니다. 로컬 branch는 `main`, 원격에는 조회 당시 HEAD/branch가 없었습니다. 인증 정보와 저장소 로컬 Git 작성자 설정을 확인했습니다. Commit/Push의 실제 결과는 [TestReport](out/TestReport.md)에 기록합니다. 실제 Credential이나 저장소 URL을 이 문서에 적지 않습니다.

## 설치·DB 초기화·실행·테스트

아래 명령은 Root에서 실행합니다. 먼저 `npm --prefix src ci`와 `npm --prefix src run db:generate`를 수행합니다. DB migration은 Unit 1부터, E2E는 Viewer Unit부터 제공합니다.

| 작업 | 예정 명령 |
| --- | --- |
| 설치 | `npm --prefix src ci` |
| DB Client 생성 | `npm --prefix src run db:generate` |
| DB 초기화/검토된 Migration 적용 | `npm --prefix src run db:deploy` |
| 개발 실행 | `npm --prefix src run dev` |
| Production Build | `npm --prefix src run build` |
| Production 실행 | `npm --prefix src run start` |
| Type Check / Lint | `npm --prefix src run typecheck` / `npm --prefix src run lint` |
| 자동 테스트 / E2E | `npm --prefix src test` / `npm --prefix src run test:e2e` |

기본 실행 주소는 로컬 `http://127.0.0.1:3000`을 계획합니다. Production 서버의 기본 페이지 응답을 검증했습니다. DB·업로드 파일 백업/복구 및 장애 대응은 [Operation](out/Operation.md), Unit별 검증 기준과 실제 결과는 아래 테스트 문서에서 확인할 수 있습니다.

## 미지원 범위·알려진 제약

CAD 편집/Geometry 변경/저장, DWG→DXF 우회, 별도 검색 엔진·Backend 플랫폼, 사용자/권한 시스템과 공개 운영은 이번 범위에 없습니다. 현재 모든 Viewer 렌더링·성능·Browser 호환성은 미검증이며 실제 도면 Sample과 업무 성능 목표도 제공되지 않았습니다. `libredwg-web` 직접 렌더링 방식은 구현 전 확인 대상입니다. 상세 Known Issue와 시험 상태는 [TestReport](out/TestReport.md)를 기준으로 합니다.

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

다음 단계는 계획 확인 후 Unit 0B이며, 승인된 범위에서는 Unit별 구현→테스트→문서→Commit→필요 시 Push를 반복합니다.

## 2026-09-07 실행 순서 변경

사용자가 계획 실행을 승인했다. DXF 두 Viewer와 공통 관리 기능·계측·회귀를 먼저 구현하고, libredwg-web은 그 다음 MINOR 버전으로 진행한다. DWG 선행 실험은 DXF 구현의 조건에서 제외한다. 최신 단계/승인 상태는 Decisions의 ADR-011과 TestPlan을 따른다. 기존 미실행 기록은 당시 상태이며 실제 완료 후 갱신한다.
