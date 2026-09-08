# 운영·환경설정 초안

**현재 0.14.0, Docker 배포·host IP 접속 및 S3 호환 저장소 지원.** install/generate/deploy/dev/build/start/typecheck/lint/test/db:check/test:e2e가 동작한다. 초기 설치는 npm ci → db:generate → db:deploy 순서이다. 서버는 `0.0.0.0`으로 수신하며 기본 검증 주소는 `127.0.0.1:3100`이다.

Playwright 기본 설치는 `cd src` 후 `npx playwright install chromium`이다. 이미 설치된 Chromium을 사용할 때는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 실행 파일 경로를 설정한다. E2E는 3101 포트와 독립 `/tmp/cad-e2e-*` DB/Storage를 사용한다. 이 임시 데이터는 운영 데이터와 분리되며 Git에 포함되지 않는다.

## 현재 확인한 환경

2026-09-07: Node.js v22.14.0, npm 11.10.0, Git 2.43.0이 존재한다. 이 사실이 선택할 Next.js/Prisma 버전과의 호환성 통과를 의미하지 않는다. 초기화 시 engine/peer 조건과 Build/DB smoke로 확인한다. Browser 및 native SQLite driver 빌드 도구 필요 여부도 그때 기록한다.

프로젝트는 Linux/WSL 등 영속 local disk가 있는 Node 환경을 기본으로 계획한다. 네트워크는 최초 package 설치·승인된 GitHub 연결에 필요하다. 폰트/WASM/worker는 로컬 자산으로 제공하는 방향이며 CDN 필수 의존을 만들지 않는다. Viewer 실행에는 WebGL/WASM Browser가 필요하다.

## 설정 파일과 변수

기존 Root `.env`는 그대로 보존하고 `.env.example`은 변수명/설명만 유지한다. 기존 파일 위에 template을 복사하지 않는다. 새 checkout에 `.env`가 없을 때만 example로 만들고 로컬 편집기에서 값을 입력한다. `.env` 전체를 화면에 출력하거나 shell `source`로 무조건 실행하지 않는다.

| 변수 | 용도 | 초기 상태 / 기본안 |
| --- | --- | --- |
| remote_repo_url | 사용자가 지정한 GitHub remote URL | 기존 값 존재, credential 없는 HTTPS URL 확인; 값 문서화 안 함 |
| remote_repo_token | GitHub 인증 | 기존 값 존재; Git 전용, 앱 전달 금지 |
| DATABASE_URL | SQLite file URL | 현재 미정의; Unit 0B에서 절대 file URL로 검증 |
| CAD_STORAGE_PATH | CAD 저장소 | 현재 미정의; 절대 local directory, public 밖 |
| MAX_UPLOAD_SIZE_MB | 파일 크기 제한 | 현재 미정의; 100 MiB 제안, 1 MiB=1,048,576 bytes |

DB 기본 위치는 `<WORK_FOLDER>/data/db/cad.sqlite`, CAD는 `<WORK_FOLDER>/data/cad`로 계획한다. 빈 앱 설정은 launcher가 repo root 기준으로 이 기본값을 계산하며 cwd에 의존하지 않는다. `DATABASE_URL`을 직접 설정할 때는 절대 `file:/.../cad.sqlite` 형태를 사용한다. 앱 설정의 우선순위는 명시적 프로세스 환경값→root .env allowlist→기본값이다. 잘못된 경로/숫자는 시작 시 값 전체를 출력하지 않고 변수명과 이유만 안내한다.

앱 launcher는 src/scripts에 구현하고 dev/build/start/Prisma/test가 공유한다. `.env`를 데이터로 parse한 뒤 세 앱 키만 전달하고 inherited Git 인증 키도 제거한다. Next의 기본 env discovery에 root .env 로딩을 맡기지 않는다. 어떤 Secret도 NEXT_PUBLIC_* 또는 next.config env에 넣지 않는다. [Next.js 공식 환경변수 문서](https://nextjs.org/docs/app/guides/environment-variables)

## 설치·DB·실행 명령

다음 명령은 src/package.json에 구현되어 있으며 Root에서 실행한다. 최초 셋업 및 실행 순서는 [README](../README.md)를 참조한다.

| 목적 | 명령 | 검증 Unit |
| --- | --- | --- |
| Lock 기준 의존성 설치 | `npm --prefix src ci` | 0B |
| Prisma Client 생성 | `npm --prefix src run db:generate` | 0B/1 |
| 개발 Migration 작성/적용 | `npm --prefix src run db:migrate` | 1 |
| 검토된 Migration 배포·최초 DB 초기화 | `npm --prefix src run db:deploy` | 1 |
| 개발 실행 | `npm --prefix src run dev` | 0B |
| Production Build | `npm --prefix src run build` | 0B 및 각 Unit |
| Production 실행 | `npm --prefix src run start` | 0B 및 통합 |
| Type Check | `npm --prefix src run typecheck` | 0B |
| Lint | `npm --prefix src run lint` | 0B |
| 자동 테스트 | `npm --prefix src test` | 0B 이후 관련 Unit |
| E2E | `npm --prefix src run test:e2e` | 4/9 |

dev/start는 기본 `0.0.0.0:3000`에서 수신하며 로컬 접속 주소는 `http://127.0.0.1:3000`, 다른 장치 접속은 접근 가능한 서버 IP를 사용한다. Next App Router와 local filesystem API를 사용하는 Node 서버이므로 정적 export만으로 실행하지 않는다. 원본 파일/DB를 src/public 또는 Build 디렉터리에 두지 않는다. 앱 실행 가능 시 현재 버전은 src/package.json에서 확인하고 README/ChangeLog와 대조한다.

## GitHub 연결·Commit·Push

원격 이름은 기존 `origin`, local branch는 `main`이다. 초기 읽기 연결에서 remote HEAD/branch가 없었다. 당시 인증 정보 존재·HTTPS URL 정합성·git ls-remote 성공을 확인했으며 write 권한은 미검증이었다. 이후 Commit/Push 확인 결과는 [TestReport](TestReport.md)를 기준으로 한다. public repo 읽기 성공만으로 token의 모든 권한을 검증했다고 주장하지 않는다.

Git 실행 전 `.env`를 비출력 parser로 읽고 remote URL을 메모리에서 비교한다. URL에 Credential이 포함됐으면 raw `git remote -v`를 출력하지 않는다. 현재 remote가 일치하므로 재설정할 필요가 없다. 새 checkout의 remote가 없을 때만 `.env` URL을 검증하여 설정하며, 다른 저장소가 연결되어 있으면 임의로 덮어쓰지 않는다.

인증은 token을 URL/명령행/문서에 넣지 않고 일시적인 GIT_ASKPASS 또는 안전한 credential helper를 사용한다. 이번 연결 확인은 임시 askpass가 프로세스 환경에서 token을 읽었고 임시 helper에는 Secret을 기록하지 않았다. shell tracing/GIT_TRACE를 켜지 않는다. Git author name/email은 인증 token과 별개이다. 2026-09-07 사용자가 제공한 작성자 정보를 이 저장소의 local config에 설정했다. 전역 설정은 변경하지 않았으며 실제 값은 문서에 복사하지 않는다.

Commit/Push 절차:

1. 안전하게 remote/branch/status/log를 확인하고 필요 시 fetch한다. 기존 remote history가 생겼으면 비교하고 무조건 pull/force push하지 않는다.
2. 작업 요약, 관련 테스트/문서/README/Database/Architecture/ChangeLog 검토.
3. `git diff --check`, 전체 intended diff 및 staged diff 확인. 새 파일은 untracked 상태에서도 내용을 검토한다.
4. `git check-ignore`와 후보 파일 scan으로 `.env`, token, credential URL, Runtime DB, CAD 원본, 임시/build 파일이 없는지 확인한다. Secret scan은 발견한 값/행을 출력하지 않고 count/category만 보고한다.
5. 정확한 파일만 stage, Conventional Commit, 필요 시 지정 origin의 현재 branch에 push한다. 최초 push 전 원격 변경을 다시 확인한다.
6. Commit ID와 Push 성공/실패, remote와 HEAD 일치 여부를 안전한 결과로 기록한다. 미검증 권한을 OK로 미리 쓰지 않는다.

인증 실패는 변수 존재→URL 형태→helper 방식→token scope/계정 접근 권한 순으로 확인한다. 값은 출력하지 않고 network/DNS, authentication/permission, branch protection 등 범주로만 안내한다. 자동 승인 검토나 sandbox 제약으로 차단되면 해당 action과 이유를 그대로 설명한다.

## 데이터 백업·복구 계획

- 안전한 초기 방식은 앱 쓰기 중지 후 SQLite connection을 닫고 DB와 CAD directory를 함께 백업하는 것이다. WAL 사용 시 DB 한 파일만 임의 복사하지 않는다. 온라인 백업은 SQLite backup 방식 검증 후 제공한다.
- 복구는 별도 임시 경로에서 DB foreign_key_check, 파일 존재/hash, Location/Current 일치를 확인한 후 전환한다. 기존 데이터를 승인 없이 덮어쓰거나 초기화하지 않는다.
- 임시/최종 경로의 파일과 DB 참조를 대조해 orphan을 식별한다. 자동 삭제하지 않고 실행 중 upload가 아닌지·DB commit 여부·유예기간을 확인한 뒤 정리 대상으로 제시한다.
- missing content는 404와 관리용 로그로 알리고, 기존 Current/Version을 자동 삭제하거나 다른 파일로 대체하지 않는다.
- 데이터 reset/삭제/파괴적 migration은 기본 운영 명령에 포함하지 않는다.

## 장애 대응 초안

직접 링크 복사는 `navigator.clipboard.writeText`를 우선 사용한다. HTTP 환경, 권한 거부, 브라우저 정책 등으로 Clipboard API가 없거나 실패하면 읽기 전용 URL 입력과 동일 URL의 `도면 열기` 링크를 표시한다. 링크 도달성은 서버가 실행 중이고 사용자가 접근 가능한 동일 origin일 때만 보장된다. `localhost`/`127.0.0.1`은 링크를 여는 장치 자체를 가리키며, 사설 IP는 같은 네트워크/VPN·수신 listener·방화벽 조건이 필요하다. 공개 토큰이나 저장소 locator를 URL에 넣지 않는다.

| 증상 | 먼저 확인할 사항 | 처리 원칙 |
| --- | --- | --- |
| 앱 시작/DB 연결 실패 | 앱 변수명, 절대 경로, directory 쓰기 권한, driver version | 값 전체를 log에 출력하지 않음 |
| Upload 초과/저장 실패 | 설정 MiB 한도, 실제 received bytes, 디스크 여유·권한 | 서버 검증, transaction rollback/파일 정리 상태 확인 |
| DB locked | 실행 프로세스 수, 긴 쓰기 transaction, retry/timeout | 무제한 재시도·DB 삭제 금지 |
| Current 불일치 | pointer/소속 FK/connection foreign_keys, 캐시 | DB 사실 기준으로 진단; 임의 여러 flag 수정 금지 |
| 파일 없음 | Version 존재, 안전한 storage key, 파일 백업 | arbitrary path 요청을 허용하지 않음 |
| WASM 로딩 오류 | 동종 origin asset, MIME/URL, bundler 배포 파일, browser | 초기화 오류를 Parse 실패와 구분 |
| 도면 일부 누락/한글 오류 | Entity 지원, encoding/font, hash/기준 화면 | partial 결과와 parser/renderer 원인을 분리 기록 |
| memory 증가/느린 전환 | 반복 횟수, Worker/geometry/RAF/listener/Blob, cache 조건 | 측정 방법 명시, 오류 재현 후 Adapter 수정 |

## 세션 재개

AGENTS→README→안전한 Git 상태→package/version→ChangeLog→TestReport→해당 문서를 읽고 마지막 완료/미완료 Unit, 승인 상태, 실패 테스트, uncommitted 변경, remote 동기화, 다음 작업을 파악한다. 승인 계획 내이면 반복 전체 승인 없이 진행한다. 현재는 **문서 단계, 구현 계획 확인 대기**이다.

## 2026-09-07 실행 순서 변경

사용자가 계획 실행을 승인했다. DXF 두 Viewer와 공통 관리 기능·계측·회귀를 먼저 구현하고, libredwg-web은 그 다음 MINOR 버전으로 진행한다. DWG 선행 실험은 DXF 구현의 조건에서 제외한다. 최신 단계/승인 상태는 Decisions의 ADR-011과 TestPlan을 따른다. 기존 미실행 기록은 당시 상태이며 실제 완료 후 갱신한다.

## 목록 미표시 점검 및 Unit 3 사용법

GitHub #1 원인은 DB 저장 실패가 아니라 홈의 목록 조회 미구현이었다. 수정 버전에서 `/`는 실제 DB 목록이며 `/cad/upload` 등록 후 목록으로 돌아오면 새 행이 보인다. 도면 파일명/버전 정보 링크로 `/cad/locations/{locationId}`에 접근하고 이전 버전을 Current로 지정할 수 있다.

검색 조건은 URL query로 유지된다. 결과가 없으면 초기화로 전체 목록을 확인한다. 상세 의미와 API query는 Architecture를 참조한다. Viewer는 후속 단계로 아직 표시하지 않는다.

코드 갱신 후 `npm --prefix src run build`를 실행하고 기존 Node 서버를 정상 종료한 뒤 `npm --prefix src run start -- --port 3100`으로 재시작한다. DB/file 삭제나 DB reset은 필요 없다. 실행 환경의 DATABASE_URL/CAD_STORAGE_PATH가 등록 당시와 동일한지 확인한다. `/api/cad-files`의 total과 목록을 비교하되 사용자 파일명/원본을 공개 로그에 기록하지 않는다.

회귀 검증: `npm --prefix src test`, Build 후 `npm --prefix src run test:e2e`. 설치된 별도 Chromium이 필요하면 PLAYWRIGHT_CHROMIUM_EXECUTABLE에 절대 실행 경로를 지정한다. 테스트는 운영 DB를 사용하지 않는다.

## DXF Viewer 사용 및 장애 확인

DXF 등록 후 목록 또는 Location 상세의 **도면 보기**를 선택한다. 확대/축소, 마우스 드래그 이동, 휠 zoom, 화면 맞춤과 다시 불러오기를 제공한다. DWG는 원본/버전 관리만 지원한다.

WebGL 사용 가능한 데스크톱 Browser가 필요하다. 초기화 실패는 하드웨어 가속/브라우저 설정을 확인한다. 파싱 실패는 손상·미지원 DXF 또는 Worker 자산 요청 실패를 확인한다. 새 build의 `.next` 전체 자산을 함께 적용하고 서버를 재시작해야 한다. 파싱 Worker는 120초 timeout이며 대형 파일의 적합성은 미검증이다. 빈 도면과 오류를 성공 렌더링으로 혼동하지 않는다.

글꼴 미제공으로 TEXT/한글이 누락될 수 있다. 비교 평가 때 실제 CAD 원본과 대조하고 TestReport에 부분 지원을 기록한다. Console의 upstream parse 오류에는 도면 일부 정보가 들어갈 수 있으므로 공개 로그로 복사하지 않는다.

## Unit 5 — 글꼴 및 Viewer 선택

- DXF 도면 보기에서 `three-dxf-viewer로 열기` / `dxf-viewer로 열기`로 동일 Version을 연다. 현재는 전체 페이지 탐색이다. three Viewer에는 Layer 체크박스가 있다.
- 글꼴 원본: [Google Fonts Nanum Gothic](https://github.com/google/fonts/tree/main/ofl/nanumgothic), 다운로드 2026-09-08. 원본 `NanumGothic-Regular.ttf` 2,054,744 bytes, SHA-256 `76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31`. 원본 변경 없이 `src/public/fonts`에 보관하고 같은 폴더의 OFL.txt를 함께 배포한다.
- `scripts/fonts.mjs`가 고정 Three 0.171 TTFLoader로 `CadKorean.typeface.json`을 생성한다. 파생 typeface의 family/name은 CAD Korean으로 변경하고 원본 저작권/라이선스 정보는 유지한다. JSON은 약 25.8 MB로 TTF보다 크며 초기 전송·메모리 비용이 있다. gzip 및 실제 네트워크 성능 평가는 후속 Unit이다.
- build/dev 명령이 생성한다. Production 배포에는 `.next`와 public/fonts(생성 JSON 포함)가 모두 필요하다. `.env`나 사용자 CAD를 글꼴 폴더에 넣지 않는다. 다른 font로 교체할 때는 재배포 조건·한글 glyph·두 Viewer 포맷을 확인하고 scripts/Adapter URL/테스트를 함께 갱신한다.
- 한글 TEXT의 기본 글꼴 표시와 CAD 원본의 font/SHX/MTEXT 서식 재현은 별도이다. CP949 등 인코딩 문제는 font 제공만으로 해결되지 않는다. 현재 ASCII 구조/UTF-8 DXF를 기본 검증하며 binary DXF는 지원 평가 밖이다.

## Unit 6 — DXF 전환 사용법

도면 보기 상단의 dxf-viewer / three-dxf-viewer 버튼으로 같은 Version을 새로고침 없이 전환한다. 선택된 버튼은 비활성 표시이며 URL renderer query가 현재 선택을 반영한다. 재접속 시 해당 query를 초기 선택으로 사용한다. 브라우저 뒤로가기 이력을 매 전환마다 추가하지 않는다.

전환하면 카메라/Layer 선택은 초기화된다. 같은 화면에서의 원본 다운로드는 재사용하며 **다시 불러오기**는 원본을 다시 받는다. 읽기 실패 후 재시도할 수 있다. DWG는 이 선택 UI를 제공하지 않는다.

이전 Unit 5 절의 전체 페이지 링크 설명은 당시 동작이다. 현재 동작은 본 절을 기준으로 한다. 통합 검증 시 등록 데이터·메타데이터는 그대로 유지하고 generated test fixture를 사용한다.

## Unit 8A — 측정 및 재현

- 도면 하단 측정 상세와 JSON 저장을 이용한다. sourceWait는 실제 network fetch만이 아니라 공유 Promise 대기/메모리 반환을 포함한다. renderer 전환 시 새 기록, 명시적 다시 불러오기는 miss로 다시 측정한다.
- Root에서 Build 후 `npm --prefix src run test:benchmark` 실행. Chromium 설치/PLAYWRIGHT_CHROMIUM_EXECUTABLE은 기존 E2E와 같다. 같은 3101 테스트 포트를 쓰므로 E2E/benchmark를 동시에 실행하지 않는다. 운영 DB는 사용하지 않는다.
- 매 benchmark 시작 때 benchmark-results가 새 실행용으로 정리된다. 보존할 JSONL은 실행 전 별도로 복사한다. 결과는 각 도면·Viewer마다 새 Browser context(cold), 다른 Viewer 경유 후 같은 renderer로 복귀한 warm(memory source 재사용) 각 5회이다. warm에는 Browser/module/font cache도 영향을 준다.
- 100/10,000/100,000 LINE 반복 생성은 Entity 수를 통제하기 위한 합성 부하이다. 실도면 텍스트/블록/치수/HATCH 조합과 같지 않다. actual byte 수로 크기를 분류하고 브라우저·장비·GPU·동시 부하와 함께 해석한다. 단일 종합 점수로 기술 우열을 단정하지 않는다.
- Console/pageerror는 benchmark가 별도 수집한다. 앱의 모든 Console을 전역 가로채거나 사용자 CAD 내용을 수집하지 않는다. 앱 JSON의 error는 일반화된 오류이다.

## DXF 릴리스 회귀 검증 — Unit 9A

- 루트에서 `npm --prefix src run typecheck`, `npm --prefix src run lint`, `npm --prefix src test`, `npm --prefix src run build` 후 `npm --prefix src run test:e2e`를 실행한다. Browser 경로 설정은 기존 E2E 절차를 따른다.
- E2E 서버는 3101과 실행별 임시 DB/Storage를 사용한다. 기존 3100 사용자 데이터에 테스트 CAD를 등록하지 않는다. `workflow.spec.ts`는 UI 등록부터 두 Viewer까지 검증하며 `switch.spec.ts`는 20회 전환 자원 수를 확인한다.
- 0.8.0 Unit 9A는 테스트/문서만 변경하므로 앱/Schema/설치 의존성은 동일하다. U8A 성능 측정값을 참조한다. 새로운 환경의 재측정 시에는 별도 benchmark 명령을 사용한다.
- 기능 자동화 통과와 실도면 업무 적합성 승인은 구분한다. 전체 Entity 충실도 및 DWG는 후속 시험이다.

## DWG 최소 기술 실험 — Unit 7A

1. 고정 lock으로 설치 후 build/dev를 실행하면 `public/libredwg/{dist,wasm}`가 자동 생성된다. Production 배포에는 `.next`뿐 아니라 생성된 public 자산도 포함한다. 런타임 외부 CDN은 사용하지 않는다.
2. `/lab/dwg` 접속 후 로컬 DWG를 선택한다. 20 MiB 이하, 평면 LINE만 표시하는 실험이다. 서버 업로드/DB 등록은 수행하지 않는다. 기존 등록 DWG의 Viewer는 7B에서 연결한다.
3. `npm --prefix src run prepare:dwg-samples`는 공식 저장소 고정 커밋의 AutoCAD 2000 Line.dwg/circle.dwg를 SHA-256 확인 후 Git 제외 node_modules/.cache/cad-dwg-samples에 저장한다. 시험 샘플 원본을 Git에 추가하지 않는다.
4. Build 후 기존 Chromium 실행 파일 환경변수를 지정하고 `npm --prefix src run test:dwg`를 실행한다. 기존 `test:e2e`와 동일 임시 DB/3101을 사용하므로 두 browser suite를 동시에 실행하지 않는다. DXF 회귀는 별도로 `test:e2e`.
5. WASM 초기화 실패 시 `/libredwg/dist/libredwg-web.js`, `/libredwg/wasm/libredwg-web.js`, `/libredwg/wasm/libredwg-web.wasm`의 HTTP 200/MIME 및 생성 여부를 확인한다. 패키지 변경 시 자산 재생성/Build/서버 재시작과 DWG 시험이 필요하다.
6. npm 배포본은 GPL-3.0 표기이며 source는 Architecture 링크를 참조한다. wrapper/glue/wasm 파일을 임의 수정하지 않는다. 패키지의 README/package metadata도 생성 자산에 함께 보존한다.

성능 메모리 한계: INITIAL_MEMORY=1GB 빌드 옵션의 배포본이다. Worker를 종료해 인스턴스 생명주기를 분리하지만 저메모리 장비나 업무 대형 파일의 적합성은 별도 실측 대상이다. parse/free 실험 성공과 전체 renderer fidelity를 혼동하지 않는다.

## 등록 DWG Viewer — Unit 7B

- 일반 파일 등록에서 DWG와 메타데이터를 저장한 뒤 목록/Location에서 **도면 보기**를 선택한다. Current 관리와 원본 다운로드는 기존 규칙을 따른다. Viewer는 libredwg-web만 사용한다. `/lab/dwg`는 독립 실험으로 유지한다.
- 등록 상한(MAX_UPLOAD_SIZE_MB)과 Viewer 처리 한도는 구분한다. 현재 DWG Viewer는 20 MiB 이하의 평면 LINE만 지원하며 더 큰 원본은 저장 설정에 따라 등록할 수 있어도 표시 시 제한 안내가 나온다. 미지원 Entity는 제외 건수로 표시한다.
- 확대/축소/마우스 Pan/Fit/Resize를 사용할 수 있다. 재시도는 원본을 다시 받아 Worker를 재생성한다. WASM 404는 7A의 static asset 준비·배포 절차를 확인하고, 원본 404는 DB/Storage 복구 절차를 따른다. 원본 파일을 임의로 수정하지 않는다.
- `test:dwg`는 독립 실험과 등록 DWG UI 흐름·오류·취소를 함께 실행한다. 먼저 `prepare:dwg-samples`로 고정 공식 샘플을 준비한다. `test:e2e`는 DXF와 DWG 잘못된 입력의 공통 회귀를 실행한다. 같은 3101 테스트 서버를 사용하므로 두 suite를 직렬로 실행한다.
- 공통 JSON의 partial은 표시 제외 Entity가 있다는 의미이며 reasons.coverage를 함께 확인한다. LINE 표시 성공도 스타일/전체 Entity 정확성 보증은 아니다.

단일 Workspace의 Production 서버를 갱신할 때는 기존 start 프로세스를 중지한 후 build하고 새 프로세스로 시작한다. 실행 중인 서버와 동일 `.next`에 build하면 이전 모듈과 새 모듈이 섞일 수 있다. U7B 재시작 시 이전 프로세스의 webpack-runtime 오류를 확인했고 새 0.10.0 프로세스에서 홈/등록/WASM 정상 응답을 확인했다. 무중단 전환이 필요하면 별도 build 디렉터리/배포 절차를 먼저 설계한다.

## S3 호환 저장소 설정 — SeaweedFS 등

기본값은 local이다. S3 전환은 기존 CAD 파일을 이동하지 않고 이후 업로드의 저장 위치만 바꾼다. SQLite와 업로드 임시 파일은 계속 local disk를 사용하므로 DATABASE_URL/CAD_STORAGE_PATH를 유지한다. 기존 local 원본의 조회를 위해 CAD_STORAGE_PATH를 바꾸거나 삭제하지 않는다.

1. 관리자가 S3 호환 endpoint와 private bucket을 준비하고 앱 계정에 해당 bucket의 PutObject/GetObject/DeleteObject 권한을 부여한다. 앱은 버킷을 생성하거나 다른 bucket을 정리하지 않는다. rollback 보상 삭제 때문에 DeleteObject 권한이 필요하다.
2. Root `.env`에 아래 변수들을 설정한다. 기존 Git 변수는 보존하며 Secret은 출력/커밋하지 않는다. `.env.example`은 변수명과 빈 credential만 제공한다.

| 변수 | 설정 / 기본값 |
| --- | --- |
| CAD_STORAGE_BACKEND | local(default) 또는 s3 |
| CAD_S3_ENDPOINT | HTTP(S) origin. SeaweedFS S3 gateway 예: `http://127.0.0.1:8333`; 경로·query·URL 내 credential 금지 |
| CAD_S3_BUCKET | 미리 생성한 bucket 이름 |
| CAD_S3_REGION | us-east-1(default), 서버가 요구하는 region |
| CAD_S3_ACCESS_KEY_ID / CAD_S3_SECRET_ACCESS_KEY | 서버 전용 인증정보 |
| CAD_S3_SESSION_TOKEN | 임시 자격증명 사용 시 선택 |
| CAD_S3_FORCE_PATH_STYLE | true(default), SeaweedFS path-style 주소 |
| CAD_S3_TIMEOUT_MS | 60000(default), 1000–300000ms |

3. 기존 start 프로세스를 중지하고 `npm --prefix src run build` 후 start로 적용한다. 설정만 바꿀 때도 프로세스 재시작이 필요하다. 일반 등록→목록→Viewer를 그대로 사용하며 브라우저에 S3 주소/키를 입력하지 않는다.
4. 기존 S3 행이 있으면 local 모드로 돌아가더라도 S3 조회에 필요한 endpoint/credentials를 유지한다. 새 bucket 설정은 새 업로드에만 적용되며 이전 bucket 조회 권한도 필요하다.
5. 한 endpoint만 지원한다. endpoint 교체는 데이터 이전이 아니다. 원본 object와 DB locator를 일관되게 이전하는 별도 계획 없이 설정만 변경하지 않는다. 자동 local↔S3 이동은 제공하지 않는다.

### 장애·백업

- NoSuchKey: 원본 404. 인증/연결/버킷 문제: 안전한 503. 원본 API가 프록시하므로 S3 CORS 또는 브라우저 credentials는 필요 없다.
- PUT 불확실: CAD_S3_UPLOAD_UNCERTAIN 로그의 object ID와 현재 bucket의 `cad/` key를 대조한다. 업로드 성공 여부가 불명확한데 원본을 무조건 삭제하지 않는다.
- DB 실패 후 보상 삭제: DB에 해당 locator가 없다는 확인 후 새 object만 제거한다. CAD_UPLOAD_CLEANUP_PENDING이면 DB와 bucket listing을 운영자가 비교한다. 삭제 전 진행 중 업로드가 없는지 확인하고 보존 기간/백업을 고려한다. 자동 orphan sweeping은 없다.
- 백업은 SQLite DB+local CAD 원본+각 S3 bucket object를 한 시점의 일관된 집합으로 보존한다. DB 파일만 백업해도 S3 원본이 복구되는 것은 아니다.
- 확인된 호환 제품은 SeaweedFS 4.45이다. 다른 S3 제품은 아래 시험/조건부 PUT·streaming GET·DeleteObject를 먼저 검증한다. 조건부 PUT을 지원하지 않는 제품에 overwrite 허용 fallback은 하지 않는다.

### 격리 자동 검증

- `npm --prefix src run test:s3`: Docker 임시 SeaweedFS/랜덤 인증/전용 임시 bucket에서 저장소 통합 시험. 기존 SeaweedFS 서비스/사용자 bucket을 사용하지 않는다.
- Production Build 후 Chromium 경로를 지정하고 `npm --prefix src run test:s3:e2e`: 별도 임시 SeaweedFS를 사용하는 전체 웹 E2E.
- 고정 이미지: `chrislusf/seaweedfs@sha256:fc9f76fa993ad69966ffeb2f65d0318fcae39c6f8e20cf68ef7b3a5cb97769e5`(4.45). 최초 실행은 이미지 다운로드가 필요할 수 있다.
- 테스트 런처가 random loopback port·임시 credential 파일(0600)을 사용하고 종료 시 해당 컨테이너·설정 파일을 제거한다. 기본 test:e2e/test:dwg는 local backend를 명시해 실제 S3로 시험 데이터가 쓰이지 않도록 한다.
- 웹 시험들은 3101을 사용하므로 직렬 실행한다. 컨테이너 종료 전에 중단되었다면 cad-s3-test-* 중 해당 실행에서 생성한 컨테이너만 확인해 정리한다.

## Docker 설치·게시 운영

Root에서 `docker compose --env-file .env -f src/docker-compose.yml build` 후 `up -d`를 실행한다. README의 Docker/pull 절차를 사용한다. `.env` 전체를 container env_file로 주입하지 않고 Compose environment의 앱 변수만 전달한다. `GHCR_IMAGE`는 image 주소, `CAD_HOST_PORT`는 host port이며 기존 Git 변수는 Git tooling에만 남는다. `docker compose config`는 실제 credential이 치환될 수 있으므로 설정 확인에는 `config --quiet`를 사용한다.

- 이름: project `cad-layout-viewer`, service `app`, container `cad-layout-viewer-app`, volume `cad-layout-viewer-data`, network `cad-layout-viewer-network`, port `http`. 같은 이름의 기존 자원을 임의 삭제하지 않는다.
- 데이터: volume `/data/db/cad.sqlite`, `/data/cad`. host `data/`는 자동 이전하지 않는다. container 교체는 volume을 보존하며 `down -v`는 사용자가 데이터 삭제를 승인한 경우에만 사용한다. 백업 전 앱 쓰기를 중지하고 DB/원본을 일관되게 보존한다.
- 바인딩: npm dev/start 및 Docker는 기본 `0.0.0.0`; 로컬 한정 실행은 `-- --hostname 127.0.0.1`로 override할 수 있다. 다른 장치에는 localhost 링크 대신 접근 가능한 서버 IP/호스트명으로 앱을 방문해 링크를 복사한다. 실제 방화벽/라우터 설정은 자동 변경하지 않는다.
- health: migration 후 앱/DB 조회 성공200 또는 안전한503. 실패 시 logs의 안전한 오류 범주와 volume 쓰기 권한, port충돌, DB migration 상태를 확인한다. endpoint는 S3 연결/모든 CAD 검증을 대신하지 않는다.
- GHCR: build 실행자가 OCI `org.opencontainers.image.source`, `revision`, `version` label을 실제 지정 저장소/commit/버전으로 전달해 image를 source와 연결한다. 저장소 URL을 Dockerfile에 하드코딩하지 않는다. 검증한 버전 tag를 publish하고 digest를 기록한다. private image pull은 package read 권한이 필요하며 visibility를 임의 공개로 바꾸지 않는다. image upload credential을 build arg나 image layer에 전달하지 않는다. Token값을 CLI에 직접 쓰지 않는다.
- 배포 범위: Linux native SQLite와 단일 app instance를 먼저 검증한다. 여러 replica, 자동 TLS/인증/공개 인터넷 운영, 기존 데이터 migration은 별도 요구 없이는 추가하지 않는다.

공식 근거: [GitHub Container Registry 인증·push/pull](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Compose service/port/container 설정](https://docs.docker.com/reference/compose-file/services/), [Compose project name](https://docs.docker.com/reference/compose-file/version-and-name/). 실제 설치/실행 결과와 공식 지원 설명은 TestReport에서 구분한다.
