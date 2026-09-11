# CAD Web Viewer P.O.C.

현재 소스 버전은 0.17.1이며 도면 등록 비밀번호와 비밀번호 확인 삭제, 업로드 오류 진단을 지원합니다. 게시·배포 검증 결과는 [TestReport](out/TestReport.md)를 기준으로 합니다.

공장·설비의 DXF/DWG 도면을 등록·검색·버전 관리하고, 세 오픈소스 기술의 브라우저 렌더링 적용 가능성을 평가하는 프로젝트입니다.

`/cad/upload`에서 DXF/DWG를 등록하면 `/` 목록에서 즉시 확인할 수 있습니다. ‘도면 설명’에 여러 줄 메모를 입력하고 설명으로 검색할 수 있습니다. 선택한 파일이 현재 설정의 최대 MiB를 초과하면 전송 전에 안내하며 서버에서도 최종 크기 검증을 수행합니다. 실패 시 안전한 진단 상세를 복사하거나 JSON으로 저장하고 서버 요청 ID로 순환 로그를 검색할 수 있습니다. 위치별 상세에서 버전과 Current를 관리합니다. 실제 버전 기준은 `src/package.json`입니다. DXF Viewer 두 방식과 등록 DWG 조회를 지원하며 `/lab/dwg` 독립 실험도 유지합니다.

## 목표 기능

- DXF/DWG 업로드, 사업부·사업장·동·층·등록일·도면 설명 입력, SHA-256 식별.
- 동일한 네 위치 값 조합을 Location으로 관리하고 Current Version을 **최대 하나** 유지.
- 도면 목록·파일명/도면 설명 검색·위치/형식/Current 필터, Location별 Version 선택.
- DXF Viewer 두 방식 전환, DWG 전용 경로, 오류·부분 지원·성능 계측.
- 실도면 Entity 충실도·대형 파일·사용성 비교와 재현 가능한 테스트/문서.

현재 지원: 파일 등록·메타데이터 검증·SHA-256·원본 조회·목록·검색·페이지 이동·Location 상세·Current 변경. 파일명은 대소문자를 구분하는 부분 일치, 위치 네 항목은 정확히 일치하는 조건으로 검색합니다. DXF 행의 **도면 보기**에서 dxf-viewer를 실행합니다. 확대·축소·드래그 이동·화면 맞춤·Resize·다시 불러오기를 지원합니다. Viewer 버튼으로 dxf-viewer와 three-dxf-viewer를 새로고침 없이 전환합니다. 같은 Version의 원본 다운로드를 재사용합니다. DWG는 libredwg-web과 자체 LINE 렌더러로 표시합니다.

직접 링크는 목록·Location의 특정 Version 또는 Viewer에서 `링크 복사`를 선택해 사용합니다. Clipboard 권한이 없으면 표시된 URL을 직접 복사하거나 `도면 열기`를 선택합니다. 링크는 현재 origin의 Version 주소이므로 Current 교체 후에도 해당 Version을 열지만, `localhost`/`127.0.0.1`은 링크를 여는 장치 자체를 뜻하고 사설 IP는 같은 네트워크/VPN과 listener·방화벽이 필요합니다.

## 지원 형식과 Viewer 구성 계획

| 형식 | Viewer | 구성 |
| --- | --- | --- |
| DXF | dxf-viewer 1.0.48 | 전용 Adapter/Worker, 기본 도형 WebGL 검증 |
| DXF | three-dxf-viewer 1.0.44 | 별도 Three.js 0.171 scene, 기본 탐색 및 Layer 표시/숨김 |
| DWG | @mlightcad/libredwg-web 0.7.10 | 전용 Worker/WASM 파싱 후 자체 평면 LINE 렌더링; 부분 지원 |

`libredwg-web`은 파서이므로 직접 렌더링 계층이 필요합니다. DWG→DXF 변환은 범위에 포함하지 않습니다. 출처·실제 조사 버전·API 검증 과제는 [Architecture](out/Architecture.md), 선택 근거는 [Decisions](out/Decisions.md)를 참조하세요. 두 DXF 라이브러리와 libredwg-web을 고정 설치했습니다. 기본 도형과 한글 시험 결과는 TestReport에서 확인합니다.

## 기술 Stack와 구조

Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS와 Next Route Handler→Application Service→Repository/Prisma→SQLite 및 Local Filesystem 또는 S3 호환 오브젝트 스토리지를 사용합니다. Viewer는 UI→Manager→Adapter→각 라이브러리로 분리했습니다. 설치 버전은 package/lock에 고정합니다.

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

Node.js/npm/Git, 영속 local disk, 데스크톱 Browser를 사용합니다. 검증 환경은 Node 22.14.0/npm 11.10.0/Git 2.43.0입니다. Viewer에는 WebGL/WASM이 필요합니다. Docker는 격리 S3 시험 실행 시 필요합니다.

Root `.env`가 이미 있으면 보존합니다. 새 checkout에 없을 때만 `.env.example`을 기반으로 생성하고 실제 값은 로컬에서 입력합니다. 기존 Git 변수명 `remote_repo_url`, `remote_repo_token`을 유지합니다. 앱 설정은 `DATABASE_URL`, `CAD_STORAGE_PATH`, `MAX_UPLOAD_SIZE_MB`를 사용하며 상세/기본값/안전한 로딩은 [Operation](out/Operation.md)에 있습니다. Secret을 NEXT_PUBLIC_* 변수로 넣지 않습니다.

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

## 처음 설치하고 실행하기

모든 명령은 프로젝트 Root에서 실행합니다. Node.js 22.14 이상 23 미만을 사용합니다.

1. `.env`가 **없는 경우에만** `.env.example`을 복사해 `.env`를 만듭니다. 기존 파일이 있으면 필요한 변수만 추가합니다. 실제 인증정보는 로컬 편집기로 입력하고 커밋하지 않습니다.
2. 로컬 저장소로 시작하려면 `CAD_STORAGE_BACKEND=local`을 사용합니다. `DATABASE_URL`과 `CAD_STORAGE_PATH`가 비어 있으면 각각 Root의 `data/db/cad.sqlite`, `data/cad`를 사용합니다. 업로드 기본 한도는 100 MiB입니다. 해당 디렉터리에 서버 계정의 쓰기 권한이 필요합니다.
3. 의존성을 설치하고 DB를 준비합니다. `db:deploy`는 저장된 Migration을 적용하며 DB 삭제/초기화 명령이 아닙니다.

```bash
npm --prefix src ci
npm --prefix src run db:generate
npm --prefix src run db:deploy
npm --prefix src run db:check
```

4. 개발 서버를 실행합니다.

```bash
npm --prefix src run dev
```

브라우저에서 `http://127.0.0.1:3000`에 접속해 **파일 등록 → 메타데이터 입력 → 등록 → 목록 → 도면 보기**를 확인합니다. DXF는 두 Viewer를 전환할 수 있습니다. DWG는 아래에 명시한 부분 지원 범위를 적용합니다. 서버 종료는 실행 터미널에서 Ctrl+C입니다.

### Production 실행

같은 작업 폴더의 기존 dev/start 프로세스를 종료한 뒤 Build하고 시작합니다.

```bash
npm --prefix src run build
npm --prefix src run start -- --port 3100
```

접속 주소는 `http://127.0.0.1:3100`이며 같은 네트워크에서 접근 가능한 서버는 `http://<서버 IP>:3100`으로도 접속합니다. 기본 수신은 `0.0.0.0`입니다. Build/dev 과정에서 글꼴 JSON과 LibreDWG ESM/WASM 자산을 준비합니다. 배포 시 생성된 `src/public` 자산도 유지해야 합니다. `.env` 변경 후에는 서버를 재시작합니다. SQLite·CAD 데이터는 Build와 별도로 영속 보관합니다.

### 설치 후 검증

```bash
npm --prefix src run typecheck
npm --prefix src run lint
npm --prefix src test
```

브라우저 E2E는 Chromium 설치 및 Production Build 후 실행합니다. Chromium은 `src/`에서 `npx playwright install chromium`으로 설치하고, Root로 돌아와 `npm --prefix src run test:e2e`를 실행합니다. 기존 Chromium 사용 시 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정할 수 있습니다. 테스트 결과와 미검증 범위는 [TestReport](out/TestReport.md)를 참조하세요.

## 도면 설명

등록 화면에서 Version별 설명을 입력할 수 있습니다. 설명은 최대 2,000자이며 앞뒤 공백과 개행을 정리해 저장합니다. 목록의 설명 검색은 파일명·위치·형식·Current 조건과 함께 사용할 수 있고, `%`, `_`, 따옴표는 일반 문자로 검색됩니다. 설명은 목록·Location 상세·Viewer에서 일반 텍스트로 표시됩니다.

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

Unit 9A DXF 통합·회귀, Unit 7B 등록 DWG Viewer, Unit 8B DWG 계측을 완료했습니다. Unit OBS에서 업로드 오류의 화면 진단과 요청 ID 기반 서버 로그를 연결했습니다. 등록 메모 요청(원격 이슈 #2)은 기존 도면 설명의 등록·저장·표시 검증으로, 파일 크기 사전 검증(#3)은 0.17.1 조치로 추적합니다. 승인된 범위에서는 Unit별 구현→테스트→문서→Commit→필요 시 Push를 반복합니다.

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

## 등록 DWG 지원 범위

DWG 등록 후 목록/Location의 **도면 보기**로 엽니다. libredwg-web만 사용하며 확대·축소·이동·화면 맞춤·재시도를 제공합니다. 현재 처리 한도는 20 MiB, 도형은 평면 LINE입니다. TEXT/BLOCK/CIRCLE 등은 제외 건수로 안내하고 측정 결과에 partial을 기록합니다. 복잡한 실도면 전체 지원을 뜻하지 않습니다.

## S3 호환 저장소 (SeaweedFS 등)

### SeaweedFS / 기존 S3 서비스 연결

1. 접근 가능한 S3 gateway와 **미리 생성한 private bucket**을 준비합니다. 앱 계정에는 해당 bucket의 PutObject/GetObject/DeleteObject 권한이 필요합니다. 앱에서 SeaweedFS 서버나 bucket을 자동 생성하지 않습니다.
2. Root `.env`에 아래 설정을 추가합니다. endpoint는 앱 서버에서 접근 가능한 주소로, bucket은 실제 생성한 이름으로 바꾸고 두 인증정보를 입력합니다. 아래 주소와 bucket 이름은 예시이며 인증정보는 의도적으로 비워 두었습니다.

```dotenv
CAD_STORAGE_BACKEND=s3
CAD_S3_ENDPOINT=http://127.0.0.1:8333
CAD_S3_BUCKET=cad-drawings
CAD_S3_REGION=us-east-1
CAD_S3_ACCESS_KEY_ID=
CAD_S3_SECRET_ACCESS_KEY=
CAD_S3_SESSION_TOKEN=
CAD_S3_FORCE_PATH_STYLE=true
CAD_S3_TIMEOUT_MS=60000
```

endpoint에는 경로·query·인증정보를 넣지 않습니다. 앱이 컨테이너나 다른 호스트에 있으면 `127.0.0.1` 대신 해당 앱에서 접근 가능한 gateway 주소를 사용합니다. 임시 자격증명을 사용할 때만 session token을 채웁니다.

3. 최초 설치라면 위 설치/DB 준비 절차를 수행합니다. 기존 서버를 종료하고 `npm --prefix src run build` 후 `npm --prefix src run start -- --port 3100`으로 시작합니다.
4. `/cad/upload`에서 새 도면을 등록하고 목록과 Viewer에서 조회합니다. 이후 업로드 원본은 S3에 저장되며 사용자는 기존 UI를 그대로 사용합니다. 서버에서 원본을 제공하므로 브라우저에 S3 인증정보를 설정하지 않습니다.

기존 로컬 원본은 계속 조회할 수 있으며 자동 이동하지 않습니다. SQLite와 업로드 임시 파일은 로컬 디스크를 사용합니다. 버킷은 미리 준비해야 하며 endpoint/credential은 서버에서만 사용합니다. 상세 설정·전환·복구 제한은 [Operation](out/Operation.md), 실제 SeaweedFS 검증 결과는 [TestReport](out/TestReport.md)를 참조하세요.

Docker 기반 격리 시험은 `npm --prefix src run test:s3`, S3 저장소를 사용하는 웹 E2E는 Production Build 후 `npm --prefix src run test:s3:e2e`입니다. 실제 서비스 설정이나 기존 bucket은 변경하지 않습니다.

## Docker로 실행하기

Docker Engine과 Compose v2가 필요합니다. 아래 명령은 프로젝트 Root에서 실행하며, 처음에는 `.env.example`을 참고해 `.env`를 준비합니다. 기존 `.env`는 덮어쓰지 않습니다.

```bash
docker compose --env-file .env -f src/docker-compose.yml build
docker compose --env-file .env -f src/docker-compose.yml up -d
docker compose --env-file .env -f src/docker-compose.yml ps
```

컨테이너 시작 시 검토된 DB migration을 적용한 뒤 앱을 실행합니다. 기본 주소는 `http://localhost:3000`이며 다른 장치에서는 `http://<서버 IP>:3000`으로 접속합니다. `.env`의 `CAD_HOST_PORT`로 호스트 포트를 바꿀 수 있습니다. 같은 네트워크/VPN, 서버 방화벽과 수신 포트가 접근을 허용해야 합니다. `0.0.0.0`은 수신 설정이며 브라우저 접속 주소로 사용하지 않습니다.

프로젝트 `cad-layout-viewer`, 컨테이너 `cad-layout-viewer-app`, 네트워크 `cad-layout-viewer-network`, 데이터 볼륨 `cad-layout-viewer-data`를 사용합니다. 기존 호스트 `data/`를 자동 복사하거나 기존 서비스와 공유하지 않습니다. SQLite와 CAD/임시 업로드는 볼륨에 남고 S3 모드도 SQLite/임시 디스크가 필요합니다. `down`은 볼륨을 보존하지만 `down -v`는 데이터를 삭제하므로 정상 종료에 사용하지 않습니다.

```bash
docker compose --env-file .env -f src/docker-compose.yml logs --tail 100 app
docker compose --env-file .env -f src/docker-compose.yml stop
```

`/api/health`는 앱과 DB 조회 가능 여부만 반환합니다. 이미지에는 실제 `.env`, Git 자격증명, 업로드 CAD 및 런타임 DB를 포함하지 않습니다. S3 설정은 Compose의 앱 전용 환경변수로 주입합니다. 컨테이너에서 `localhost`는 컨테이너 자신이므로 S3 endpoint에는 컨테이너가 접근할 수 있는 실제 서버 주소를 사용합니다.

## GitHub Container Registry 이미지 내려받기

검증·게시한 최신 이미지는 `ghcr.io/planner77/layoutmanager:0.15.0`입니다. 아래 명령으로 내려받고 `.env`에 `GHCR_IMAGE=ghcr.io/planner77/layoutmanager:0.15.0`을 설정합니다. 실제 pull 검증은 인증된 계정으로 수행했으며 익명 공개 접근은 검증하지 않았습니다.

```bash
docker pull ghcr.io/planner77/layoutmanager:0.15.0
```

게시된 이미지 주소와 tag를 `.env`의 `GHCR_IMAGE`에 지정합니다. 저장소/계정 식별값은 환경설정으로 유지합니다. 비공개 package는 해당 package를 읽을 권한으로 먼저 `docker login ghcr.io`를 수행해야 합니다. Token을 명령행 인수·소스·로그에 기록하지 않고 password stdin 방식이나 승인된 credential 관리 방식을 사용합니다.

```bash
docker compose --env-file .env -f src/docker-compose.yml pull app
docker compose --env-file .env -f src/docker-compose.yml up -d --no-build app
```

검증 이미지의 플랫폼은 `linux/amd64`이며 0.15.0 digest는 `sha256:2d9cf30ad176375e5459568d90121175133109d6ac496234c227ea11eaeff67c`입니다. 실제 게시·pull 결과는 [TestReport](out/TestReport.md)의 배포 기록을 확인합니다. `latest` 대신 검증한 버전 tag 또는 digest를 고정할 수 있습니다. 이미지 빌드 방법·볼륨 백업·실행 제약은 [Operation](out/Operation.md)을 참조하세요.

## GitHub Container Registry에 직접 빌드·게시하기

아래는 Bash 기준이며 Root에서 실행합니다. `<소유자>`와 `<이미지>`는 사용자가 지정한 GitHub 저장소의 소유자와 게시할 이미지 이름으로 바꾸고 모두 소문자를 사용합니다. 저장소 주소에는 credential을 넣지 않습니다. 게시 권한이 있는 계정의 Token을 사용하며 private package pull에는 읽기 권한도 필요합니다.

```bash
# 실제 저장소/이미지 주소는 로컬 배포 환경에서 지정합니다.
CAD_IMAGE_NAME='ghcr.io/<소유자>/<이미지>'
CAD_IMAGE_SOURCE='https://github.com/<소유자>/<저장소>'
CAD_IMAGE_VERSION="$(node -p "require('./src/package.json').version")"
CAD_IMAGE_REVISION="$(git rev-parse HEAD)"

# 게시 이미지는 커밋 완료한 소스에서 빌드해야 revision label과 일치합니다.
docker build -f src/Dockerfile \
  --label "org.opencontainers.image.source=$CAD_IMAGE_SOURCE" \
  --label "org.opencontainers.image.revision=$CAD_IMAGE_REVISION" \
  --label "org.opencontainers.image.version=$CAD_IMAGE_VERSION" \
  -t "cad-layout-viewer:$CAD_IMAGE_VERSION" .
docker tag "cad-layout-viewer:$CAD_IMAGE_VERSION" "$CAD_IMAGE_NAME:$CAD_IMAGE_VERSION"

# Token을 명령행 인수나 shell history에 적지 않고 표준입력으로 전달합니다.
read -r -p 'GitHub 사용자명: ' GHCR_USERNAME
read -r -s -p 'GHCR 게시 Token: ' GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
unset GHCR_TOKEN

docker push "$CAD_IMAGE_NAME:$CAD_IMAGE_VERSION"
docker pull "$CAD_IMAGE_NAME:$CAD_IMAGE_VERSION"
docker image inspect "$CAD_IMAGE_NAME:$CAD_IMAGE_VERSION" --format '{{json .RepoDigests}}'
```

게시한 전체 이미지 주소를 `.env`의 `GHCR_IMAGE`에 넣으면 위의 Compose pull 절차로 실행할 수 있습니다. Token을 `.env.example`, Docker build argument, image label 또는 Git에 넣지 않습니다. Docker 인증 저장은 사용 환경의 credential helper 정책을 따르며 필요하면 작업 후 `docker logout ghcr.io`로 해제합니다. package 권한·visibility는 GitHub 설정을 따르고 임의 공개 전환을 하지 않습니다. GHCR 인증/권한 및 원본 연결 설명은 [GitHub 공식 문서](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)를 참조하세요.
