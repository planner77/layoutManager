# 구현 Unit·Acceptance Criteria·테스트 계획

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
