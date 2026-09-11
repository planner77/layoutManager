# 실제 검증 결과 및 Viewer 평가

## U-ISSUE6-20260911 — 도면 이름 0.19.0

- 상태: 구현·재작업 및 독립 QA 완료, root Manager 수용. FR-CAD-008 → TC-NAME-001–004. 게시·배포 및 GitHub #6 완료 종료.
- 역할: root Manager가 요구사항·설계/수용을 담당했고 gpt-5.6-sol Developer 구현·재작업 후 gpt-5.6-luna QA가 독립 검증·문서화했다. root가 릴리스/배포/이슈 처리를 담당한다.

- Developer 1차 검증: unit/integration22 files/96 PASS, typecheck/lint/build PASS, 신규 이름 Browser3 PASS. root 검토에서 기존 파일명 기반 E2E selector와0.18.0 populated DB 단독 이름 migration 검증의 보완이 필요해 재작업을 지시했다. 이후 기존 selector/mock DTO·fixture 격리와 실제0.18.0 업그레이드/이름 경계 검증을 보완했다. Developer의 최종 전체 Browser31 및 DWG4 PASS를 검토하고 독립 QA에 인계했다.

- 독립 QA: gpt-5.6-luna, 2026-09-11, Linux x86_64, Node 22.14.0, package 0.19.0, Playwright 1.63.0, Chromium 1208 executable, isolated local SQLite/storage (port 3101) 및 isolated SeaweedFS 4.45.
- `npm test`: 22 files / 98 passed / 0 failed, exit 0. `npm run typecheck`, `npm run lint`, `npm run build`: 각각 exit 0.
- Local production Browser: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome CAD_E2E_PORT=3101 npm run test:e2e` — 31 passed / 0 failed / 1.8분. TC-NAME-001–003 관련 등록·기본/사용자 이름·원본 파일명 검색·새로고침·Viewer/삭제 표시와 기존 전체 회귀를 통과했다. 첫 sandbox 실행은 tsx IPC pipe EPERM으로 앱 시작 전 중단되어 허용된 동일 환경에서 재실행했다.
- Focused name Browser: `... CAD_E2E_PORT=3101 npx playwright test tests/e2e/drawing-name.spec.ts` — 3 passed / 0 failed / 8.7초. 캡처를 직접 확인했다: `src/test-results/drawing-name-TC-NAME-002-0-56047-filename-remains-searchable/drawing-name-list-custom.png`는 custom 이름 plain text와 `원본: name-source-two.dxf`를 표시했고, `src/test-results/drawing-name-TC-NAME-003-a-41755--inside-the-viewer-viewport/drawing-name-viewer-long.png`는 360px에서 긴 제목이 콘텐츠 폭 안에 줄바꿈된다. 해당 빈 DXF fixture는 캡처 시 로딩 상태여서 Viewer 렌더링 PASS로 확대하지 않는다. 캡처에서 360px 전역 header navigation clipping/overlap이 관찰되었으며 이름 기능 범위 밖의 후속 반응형 UI 관찰이다.
- S3 integration: `npm run test:s3` — isolated SeaweedFS 4.45, 1 file / 6 passed / 0 failed, exit 0. DWG regression: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=... CAD_E2E_PORT=3111 npm run test:dwg` — 4 passed / 0 failed / 22.0초, cached samples; no redownload.
- 판정: TC-NAME-001–004 실제 범위 PASS/VERIFIED. migration/legacy populated DB 검증은 통합 98 tests의 `delete.test.ts` migration fixture에서 `drawing_name=NULL`, 기존 metadata/Current/hash/locator/순번/FK 보존과 삭제 후V3 비재사용을 확인했다. 기존0.16.0 업그레이드 시험에서는 password backfill 재실행도 회귀했다. root의 배포/image smoke, managed db deploy, 운영 legacy-name validation은 별도 수행 범위이며 root가 담당한다.

### 게시·배포 확인

- source `0b1c620ffd18e4328c149c92c47c7ceef9e8fd7f`를 origin/main에 push했다. staged/diff-check 및 실제 Secret/runtime 후보149파일 검사 위반0건이다.
- 동일 source의 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.19.0`을 빌드·게시하고 인증된 pull을 확인했다. OCI revision 일치, digest `sha256:e055f66da3e63dc755c46e891461e6cecbef2e76aa74c2f2ac7f4d7d38c6ea7b`이다. 빌드에서 기존 npm high4 의존성 경고가 재확인됐으며 이번 기능에서 해결하지 않았다.
- root가 이미지의 port3145/임시 볼륨에 기본 이름과 사용자 지정 이름의 합성 LINE DXF 두 건을 등록했다. 등록 displayName과 목록/Viewer 제목, 원본 다운로드 bytes 일치를 검증하고 `/tmp/cad-issue6-packaged-list.png` 및 `-viewer.png`를 직접 검토했다. 같은 임시 컨테이너의 `npm run db:deploy` 재실행이 성공했고 이름·password hash를 포함한 전체 fixture metadata fingerprint가 보존됐다. 임시 컨테이너/볼륨은 정리했다.
- 운영 앱 정지 후 전체 `cad-layout-viewer-data`를 Git 제외 `data/backups/issues-0.19.0-20260911/data-before-0.19.0.tar.gz`로 백업했다. archive114,673bytes, SHA-256 `5980658b5ae01df326c6946a7b558409ee25af611db13c50516871a48a41eaf0`, archive 읽기 검사 성공이다.
- 같은 볼륨으로0.19.0 Compose migration/배포 후 container healthy 및 health API200/status=ok. 새 `drawing_name TEXT NULL` schema를 확인했다. 정지 후 snapshot과 배포 후 snapshot을 비교해 신규 NULL drawing_name만 제외한 모든 기존 Column/행이 일치했고 기존 원본 SHA/크기도 일치했다. 실제 Version1개/Location3개/DeletionJob0개, 원본1,117,143bytes, integrity=ok/FK오류0건이다. 기존 도면1개의 API displayName이 위치와 실제 version의 기본 규칙과 일치함을 확인했다. 비밀번호 입력은 운영 도면에 재시험하지 않았고 저장된 hash 보존으로 한정한다. 로컬 GHCR_IMAGE는0.19.0으로 고정했다.
- GitHub #6 결과 댓글 `5630033809` 및 `closed/completed` 확인. root Manager 완료 판정. 등록 후 이름 편집은 범위 밖이며 기존360px 전역 header 표시와 실도면/복잡 Entity 평가는 후속 관찰 사항이다.

## U-ISSUE5-20260911 — 레이어 다중 선택 0.18.0

- 상태: 구현·자동·시각 검증 완료, root Manager 수용. 게시·배포 및 GitHub #5 종료 완료. GitHub #5의 three-dxf-viewer 다중 선택 드롭다운, 전체 선택/해제와 선택 개수를 제공한다. 원본·DB/API와 Viewer Adapter의 기존 표시 규칙은 변경하지 않는다.
- 역할: root Manager가 요구사항·AC/설계를 기록하고 gpt-5.6-sol Developer가 UI와 회귀 시험을 구현했다. 구현 검토 후 gpt-5.6-luna QA가 독립 검증했으며 root가 게시·배포·이슈 처리를 담당한다.
- 추적: FR-VIEWER-009 → LayerDropdown/CadViewer의 controlled 선택 → 기존 ViewerManager.showLayer → TC-LAYER-001–003. 단순 레이어 합성 fixture 검증을 복잡 BLOCK/INSERT 상속이나 실도면 전체 지원으로 확대 해석하지 않는다.

- QA 독립 검증: gpt-5.6-luna. Linux x86_64, Node 22.14.0, package `0.18.0`, Playwright 1.63.0, Chromium 1208 executable `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`, SwiftShader, worker 1, isolated local SQLite/storage.
- 단위·정적 검사: `npm test` exit 0 (22 files / 92 passed / 0 failed), `npm run typecheck` exit 0, `npm run lint` exit 0, `npm run build` exit 0.
- local 전체 Browser E2E: 28 passed / 0 failed / 1.7분. TC-LAYER-001–003 모두 통과했다. 개별 다중 선택·전체 선택/해제·메뉴 유지, 동일 canvas/no additional content GET, reload/renderer/version selection reset, 좁은 화면 geometry·scroll·keyboard focus 이동/토글/Escape 복귀를 검증했다. 기존 unsupported/empty/DXF/DWG renderer states도 회귀 통과했다.
- 시각 검증: `src/test-results/layer-dropdown-TC-LAYER001-34dff-as-without-another-download/layer-menu-normal.png` 및 `src/test-results/layer-dropdown-TC-LAYER003-fa50d-nd-support-keyboard-actions/layer-menu-narrow.png`를 확인했다. 정상 메뉴의 3개 레이어와 360×480 좁은 화면의 viewport 내 배치·내부 스크롤을 확인했으며 root Manager도 동일 capture를 검토했다.
- DWG 회귀: `CAD_E2E_PORT=3111 npm run test:dwg` 4 passed / 0 failed / 22.1초. 캐시된 Line/Circle sample, 등록 Viewer lifecycle, partial/unsupported/missing/retry 상태를 확인했다.
- 판정: FR-VIEWER-009 및 TC-LAYER-001–003 PASS/VERIFIED. 단순 레이어 합성 fixture 범위이며 복잡 BLOCK/INSERT 상속과 실도면 전체 지원 평가는 포함하지 않는다. 최초 stale `.next`에서의 layer selector 문제는 최신 production build 후 재실행에서 재현되지 않았다.

### 게시·배포 확인

- source `543423d36c092412442eddf25383c029149451a2`를 origin/main에 push했다. root의 staged/diff-check 및 실제 Secret/runtime 후보147파일 검사에서 위반0건이었다.
- 해당 source의 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.18.0`을 빌드·게시하고 인증된 pull을 확인했다. OCI revision 일치, digest `sha256:f98883f2a33ffdca71138fd4e3aed9686eaeec27cd109ecb8c08b39fdb1bc14d`이다. 이미지 빌드의 npm ci에서 기존 high4 의존성 경고가 재확인됐으며 이번 UI 변경에서 해결하지 않았다.
- root가 새 이미지의 port3145/임시 볼륨에 건축·배관·전기 3개 레이어 합성 DXF를 등록했다. 전체 해제 시 canvas 변화와0/3, 전체 선택 시3/3 및 최초 canvas의 정확한 복원을 확인했다. `/tmp/cad-issue5-packaged.png`를 직접 검토했으며 임시 컨테이너/볼륨을 정리했다.
- 운영 앱 정지 후 전체 `cad-layout-viewer-data`를 Git 제외 `data/backups/issues-0.18.0-20260911/data-before-0.18.0.tar.gz`로 백업했다. archive114,490bytes, SHA-256 `d75e87dd81919f94c3ebf3f52a34c641c227984cf5f010b09ad5baad42c82f42`, archive 읽기 검사 성공이다.
- 같은 볼륨으로0.18.0 Compose 배포 후 container healthy 및 health API200/status=ok를 확인했다. 정지 후 기준 snapshot과 배포 후 readonly snapshot의 모든 필드가 일치했다: Version1개/Location2개/DeletionJob0개, 원본1,117,143bytes, DB 전체 행 metadata fingerprint(Current/password hash 포함)와 원본 fingerprint 보존, integrity=ok/FK오류0건. 이번 비교는 저장된 password hash 보존이며 별도 비밀번호 입력 검증은 재실행하지 않았다. 로컬 GHCR_IMAGE도0.18.0으로 고정했다.
- GitHub #5에 결과 댓글 `5629680051`을 남겼고 `closed/completed` 응답을 확인했다. Manager 완료 판정. 후속 범위는 기존 실도면/복잡 Entity 평가이며 신규 필수 Unit은 없다.

## U-ISSUE4-20260911 — 삭제 대화창 레이아웃 0.17.2

- 상태: 구현·자동/시각 검증 완료, Manager 수용. GitHub #4 첨부 이미지를 읽어 경고 문구와 비밀번호 입력이 panel 밖으로 넘치는 현상을 확인했다. 이전 0.17.1의 기능 E2E는 이 geometry를 검사하지 않았다.
- 수정 전 재현: root가 게시된 0.17.1 이미지를 별도 port3145/임시 볼륨에서 실행하고 합성 fixture로 확인했다. desktop1280×800에서 panel384px 대비 scrollWidth708px, 입력 오른쪽889.625px가 panel 오른쪽832px를 약57.6px 넘었다. computed white-space는 nowrap이었다. 첨부 이미지와 같은 현상을 재현한 뒤 임시 컨테이너/볼륨을 정리했다.
- 역할: root Manager가 요구사항/AC와 UI 표시 구조를 기록하고 gpt-5.6-sol Developer가 수정·회귀 시험을 담당했다. root의 구현 검토 후 gpt-5.6-luna QA가 독립 검증했다. 게시·배포는 root가 담당한다.
- 추적: FR-DELETE-006 → DeleteButton Dialog Portal/normal wrapping → TC-DELETE-LAYOUT-001–003. 서버/API/DB/의존성 버전 변경 없음.

- QA 독립 검증: gpt-5.6-luna. Linux x86_64, Node 22.14.0, package `0.17.2`, Playwright 1.63.0, Chromium 1208 executable `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`, isolated local port 3101 with temporary SQLite/storage.
- 단위·정적 검사: `npm test` exit 0 (22 files / 92 passed / 0 failed), `npm run typecheck` exit 0, `npm run lint` exit 0, `npm run build` exit 0.
- local 전체 Browser E2E: 25 passed / 0 failed / 1.5분. TC-DELETE-LAYOUT-001–003 및 기존 DELETE cancel/wrong-password/pending/uncertain response cases가 모두 통과했다. S3/DWG 전체 재실행은 서버/API/DB/의존성 미변경인 대화창 UI 범위 밖으로 생략했다.
- 시각·geometry capture: `/tmp/cad-issue4-after-desktop.png` 및 `-longtext.png`, `-shortheight.png`, `-error.png`, `-pending.png`와 동명 `.json`을 생성해 실제 상태를 확인했다. desktop 1280×800 panel 384px, scrollWidth 384px; 375×667 panel x16 width343 height635, long text scrollHeight754; 375×260 panel x16 width343 height228, scrollHeight754; error scrollHeight782; pending panel height204. 모든 capture에서 white-space normal, overflow-wrap anywhere 및 clientWidth=scrollWidth를 확인했다. 자동 E2E의 descendant geometry 검사에서도 가로 넘침이 없었다. 좁은 화면은 내부 세로 스크롤로 입력/버튼에 접근했고 오류·정리 대기 표시도 panel 안에 배치됐다.
- 판정: FR-DELETE-006 및 TC-DELETE-LAYOUT-001–003 PASS/VERIFIED. sandbox 단독 capture는 Chromium IPC `SIGTRAP`으로 제한됐으나 escalated 동일 환경에서 capture를 완료했다. 이 제한은 제품 시험 실패가 아니다.

### 게시·배포 확인

- source `56fb1c43258dabc403033eb5895122ebdcbd9f4d`를 origin/main에 push했다. staged/diff-check와 실제 Secret/runtime 후보145파일 검사에서 위반0건이었다.
- 같은 source의 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.17.2`를 빌드·게시하고 인증된 pull을 확인했다. OCI revision 일치, digest `sha256:ecd4be1dbbe7cdb5f8e41d91583cf3ac3f5bce4da7f8308b100dbd0ab70d1df5`이다. 빌드의 npm ci는 기존 high4 의존성 경고를 다시 보고했으며 이번 UI 수정에서 해결하지 않았다.
- root가 해당 이미지의 port3145/임시 볼륨에서 수정 전과 같은 `floorplan.dxf` 합성 fixture를 열었다. panel/client/scroll width가 모두384px이고 입력 오른쪽808px가 panel 오른쪽832px 안에 위치했다. desktop1280×800과375×667 화면을 직접 확인했다. 원본 비교 시나리오는 삭제를 실행하지 않고 취소했다. QA capture server와 root 임시 image 컨테이너/볼륨은 정리했다.
- 운영 앱 정지 후 전체 `cad-layout-viewer-data`를 Git 제외 `data/backups/issues-0.17.2-20260911/data-before-0.17.2.tar.gz`로 백업했다. archive114,490bytes, SHA-256 `d75e87dd81919f94c3ebf3f52a34c641c227984cf5f010b09ad5baad42c82f42`, 읽기 검사 성공이다.
- 같은 볼륨으로0.17.2 Compose 배포 후 container healthy 및 health API200/status=ok를 확인했다. 정지 후 기준 snapshot과 배포 후 readonly snapshot의 모든 필드가 일치했다: 당시 Version1개/Location2개, 원본1,117,143bytes, metadata/Current 및 원본 fingerprint 보존, 기존 password검증 결과보존, integrity=ok/FK오류0건. 로컬 GHCR_IMAGE도0.17.2로 고정했다.
- GitHub #4에 결과 댓글 `5628838933`을 남겼고 `closed/completed` 응답을 확인했다. Manager는 해당 UI 이슈를 완료로 판정한다. 기존 의존성 경고·실도면 평가와 실제 모바일 키보드/다른 브라우저 검증은 후속 범위이다.

## U-ISSUES-20260911 — GitHub #2/#3 등록 메모·업로드 preflight 0.17.1

- 범위: 여러 줄 도면 설명을 등록·목록·Location·Viewer·새로고침까지 확인하고, 브라우저 File 크기 preflight(100 MiB 기본 및 7 MiB 설정), 제출 우회, 서버 413 진단을 검증했다. DELETE 회귀도 같은 브라우저 회귀에서 확인했다.
- 실행 역할: root Manager가 요구사항·AC·설계와 최종 수용을 담당했다. gpt-5.6-sol Developer 두 명이 이슈 UI/시험과 DELETE 보완을 구현했고, gpt-5.6-luna QA가 전체 단위·local Browser·7 MiB 설정 회귀 및 문서화를 수행했다. root는 cleanup CLI 수정, 잘못된 DELETE 응답 처리, 접근성 label 및 보강 시험과 S3/DWG·배포 검증을 수행했다.
- 검증 환경: Linux x86_64, Node 22.14.0, package `0.17.1`, Playwright 1.63.0, Chromium 1208 executable `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`, SwiftShader, worker 1, 격리 임시 DB/storage.

| 검사 | 실제 결과 |
| --- | --- |
| `npm test` | 22 files / 92 passed / 0 failed / exit 0 |
| `npm run typecheck` / `npm run lint` | 각각 exit 0 |
| `npm run build` | exit 0; final aria-label correction 포함 |
| local 전체 Browser E2E | 22 passed / 0 failed / 1.3분 |
| 100 MiB preflight | PASS; 100 MiB - 1, exact, +1, submit bypass, recovery; intercepted accepted POST 0 for rejected cases |
| `CAD_E2E_MAX_UPLOAD_SIZE_MB=7` preflight | 2 passed / 0 failed / 6.0초, separate port 3112 |
| S3 통합 `npm run test:s3` | SeaweedFS 4.45 / 6 passed / 0 failed |
| S3 전체 Browser `npm run test:s3:e2e` | 22 passed / 0 failed / 1.4분, port 3113 |
| DWG `npm run test:dwg` | 4 passed / 0 failed / 18.7초, port 3111 |

- TC-DESC-005 / GitHub #2: PASS. 여러 줄 메모가 목록·Location·Viewer와 새로고침 뒤 보존되며 literal 검색과 직접 Location 이동을 확인했다.
- TC-PREFLIGHT-001/002 / #3: PASS. `File.size > maxMb * 1024 * 1024`만 차단하고 선택값 초기화·최대 MiB 안내·정상 재선택을 확인했다. 100 MiB accepted cases are client-side intercepted to avoid Chromium CDP payload serialization; rejected cases sent POST 0회이다.
- TC-PREFLIGHT-003: PASS. 서버 크기 경계 통합 시험에서 413을 확인했고, Browser에서는 주입한 413 응답의 진단 UI를 확인했다. 두 시험의 근거를 구분하며 Browser에서 실제 100 MiB 초과 전송은 수행하지 않았다.
- 재작업 기록: password input에 명시 `aria-label`/`aria-describedby`를 추가해 accessible-name selector를 고정했고, 100 MiB Browser harness는 in-browser FormData size 측정으로 조정했다. Next streaming `notFound`의 HTTP 200 가능성 때문에 삭제 Viewer는 rendered 404/no canvas와 content API 404로 판정했다.
- 제한: intercepted 100 MiB accepted POST는 client acceptance 검증이며 실제 100 MiB server upload 성공·처리량 시험은 별도 수행하지 않았다.
- 추적: FR-CAD-006/TC-DESC-005 → `upload-form.tsx`/description query → PASS. FR-CAD-007/TC-PREFLIGHT-001–003 → `upload-limit.ts`/`upload-form.tsx`/server validation → PASS.

### DELETE 보완 검증

- repository에서 비밀번호를 실제 검증하고 transaction 안에서 검증한 hash가 유지되는지 확인한다. 잘못된 비밀번호는 Current·Version·원본을 바꾸지 않는다. Current 삭제 후 NULL, 남은 Version 보존 및 순번 비재사용을 통합/Browser 시험했다.
- 실제 0.16.0 schema fixture에 두 migration을 적용하고 기존 두 Version의 `1234` 검증, 독립 salt, metadata/Current 보존, 재실행과 신규 사용자 비밀번호 보존을 확인했다. 운영 DB 적용 결과는 아래 배포 기록에 별도 기록한다.
- KDF 실행 2개·대기 16개 제한 및 실패 후 slot 회수, 대상별 60초 5회 예약과 429/Retry-After, API 입력/Origin 거부를 자동 시험했다. DB 실패 시 원본 삭제 0회, 원본 정리 실패 시 202와 job 보존을 주입했다.
- 실제 독립 `storage:cleanup` CLI로 승인 job 재처리·이미 없는 원본·다른 파일 보존을 검증했다. unsafe locator는 처리하지 않고 job과 실패 종료를 유지한다. 최초 CLI 실행에서 `server-only` import 실패를 발견해 storage를 직접 생성하도록 수정한 후 2건 모두 통과했다.
- Browser에서 삭제 취소·틀린 비밀번호·정답 삭제·직접 content 404 및 Viewer의 404 화면/no canvas를 확인했다. 주입한 202·잘못된 JSON·통신 실패에서 입력 비우기, 결과 불확실 안내 및 자동 재시도 0회를 확인했다.
- 제한: 동시 등록/Current 변경/삭제의 모든 경쟁 순서, 실제 S3 응답 유실과 job 삭제 실패, 모든 공개 경로에 대한 password canary 주입은 별도 미실행이다. 이 항목까지 통과한 것으로 해석하지 않는다. `TC-DELETE-001–008`의 실제 검증 범위는 위 근거와 배포 기록으로 한정한다.

### 게시·운영 적용 및 최종 판정

- 최종 소스 `27a132f6a7d2f1da35fa630c0835b751db350137`를 지정된 origin/main에 정상 push했다. root가 변경/staged diff, `git diff --check` 및 144개 추적/추가 후보 파일의 실제 Secret·runtime 산출물 검사를 수행했으며 위반 0건이었다.
- 해당 소스로 linux/amd64 이미지 `ghcr.io/planner77/layoutmanager:0.17.1`을 빌드·게시하고 인증된 pull을 확인했다. OCI revision은 위 소스와 일치하며 digest는 `sha256:836c23a1fc56215f6d94b891a60f23411a533aecf9bcd09aac852a1e08b77412`이다.
- 기존 앱을 정지한 상태에서 named volume 전체를 Git 제외 경로 `data/backups/issues-0.17.1-20260911/data-before-0.17.1.tar.gz`로 백업했다. archive 222,229 bytes / 파일 3개를 모두 읽어 검사했고 SHA-256은 `980155cf1f104644ef6b7ad95400ea52f0f1c192eb1d56c5e60df661f7c4eaee`이다.
- Compose에서 같은 `cad-layout-viewer-data` 볼륨으로 0.17.1을 실행했다. migration/backfill 완료 후 container healthy, `GET /api/health` 200 및 `status=ok`를 확인했다. 로컬 `.env`의 GHCR_IMAGE도 0.17.1로 고정했다.
- 운영 DB 읽기 전용 비교: 기존 Version 2개/Location 2개, metadata·Current fingerprint 및 원본 SHA/bytes fingerprint가 배포 전후 동일했다. 원본 총 2,234,286 bytes 보존, `integrity_check=ok`, FK 오류 0건이며 기존 두 Version 모두 `1234`로 hash 검증에 성공했다. 운영 도면 삭제 시험은 수행하지 않았다.
- GitHub #2/#3에 각각 변경·시험·제한 요약 댓글을 남기고 `closed/completed` 응답을 확인했다. 댓글 ID는 #2 `5628501839`, #3 `5628502545`이다.
- 기존 의존성 경고는 남아 있다. 이번 `npm audit --omit=dev` 재확인에서 high 4건(`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`), exit 1이었다. 검증한 기능 시험 PASS와 이 경고를 구분하며 자동 major downgrade는 수행하지 않았다.
- Manager 판정: #2/#3 요구 및 DELETE 보완의 검증 범위는 수용한다. 운영 기존 비밀번호 적용·이미지 게시·재배포를 완료했다. 후속은 기존 의존성 경고와 실도면/복잡 DWG 평가이며 이번 완료 판정에 포함하지 않는다.

## U-OBS-20260909 — 폐쇄망 업로드 오류 진단 0.16.0

- 범위: 공개 업로드 진단(요약·상세·복사·JSON 저장), HTTP/프록시/연결 오류 분류, 요청 ID 기반 서버 구조화 로그, 원인 정제·비노출, local/S3 보상 및 Docker logging 설정. DB migration과 업무 데이터는 변경하지 않았다.
- 검증 snapshot: 2026-09-09 (Asia/Seoul), Linux x86_64, Node 22.14.0, package `0.16.0`, Next 16.3.4, Vitest 5.0.0, Playwright 1.63.0, Chromium 1208 executable/SwiftShader. 검증 대상 소스는 이후 `f6923f2`로 커밋·푸시했다.

| 검사 | 실제 결과 |
| --- | --- |
| `npm test` | 16 files / 72 passed / 0 failed / exit 0 |
| `npm run typecheck` / `npm run lint` | 각각 exit 0 |
| `npm run build` | exit 0, production route build 성공 |
| local 전체 E2E | 18 passed / 0 failed / 약 1분 (cleanup 재작업 후 회귀 재실행) |
| `npm run test:s3` | 격리 SeaweedFS 4.45 / 6 passed / 0 failed |
| `npm run test:s3:e2e` | 임시 DB·bucket의 S3 backend / 18 passed / 0 failed / 57.7초 |
| `CAD_E2E_PORT=3111 npm run test:dwg` | 캐시된 공식 Line/Circle sample / 4 passed / 0 failed / 18.7초 (권한 상승 실행) |
| `docker compose -f src/docker-compose.yml config` | exit 0; app logging `local`, `max-size=10m`, `max-file=5` 확인 |
| GHCR 0.16.0 build/push/pull | PASS. OCI revision `f6923f2`, pull digest `sha256:6eafec53e8372a9b289e38bb9d22bc8f50868aad968000c10c5934379368f8dd` 일치 |
| Compose 재배포/health | PASS. 기존 `cad-layout-viewer-data` volume 보존, `ghcr.io/planner77/layoutmanager:0.16.0` 재생성, container healthy, `GET /api/health` 200 |
| `git diff --check` | exit 0 |
| Secret/Runtime audit | `git` 추적 목록·변경 diff와 allowlist pattern scan에서 `.env`·runtime DB/CAD·credential URL·실제 인증값 0건; 테스트용 canary 문자열과 `.env.example` 빈 키만 존재 |

### 요청 ID·단계 수동 확인

- 임시 `/tmp` DB·CAD 저장소와 별도 3131 포트에서 `db:deploy` 및 production server를 실행했다. 정상 POST의 `X-Request-Id`/JSON `requestId`/stdout JSON 로그가 모두 `0a28cce1-e610-42b5-a9d8-869f87b582a1`로 일치했다. `request_received → origin_validation → context_initialization → upload_receive → upload_validation → storage_publish → database_registration → temporary_cleanup → response`의 성공 이벤트와 `status=201`을 확인했다.
- 초기 미지원 확장자 수동 POST의 `X-Request-Id`/JSON `error.requestId`/stdout 로그는 모두 `111f4a4c-e14c-461b-9c57-53434888bca6`로 일치했으나 `temporary_cleanup` 성공 이벤트가 없었다. Developer 재작업 후 추가 통합 시험에서 `upload_validation` 실패·`temporary_cleanup` 성공이 같은 진단 범위로 기록됨을 확인했다.
- 동시에 전송한 두 정상 POST는 `7153ec52-94f1-4332-aaae-100dd8cbdc79`와 `3258b8fd-b047-4645-a892-0677e0dd4e82`를 각각 header/body/log에 유지했다. 단계가 일부 교차해도 ID와 backend가 섞이지 않았다.

### TC-OBS 결과

| TC | 결과 및 근거 |
| --- | --- |
| TC-OBS-001/002 | PASS. 프록시 오류 화면에 고정 필드(시각·버전·코드·상태·서버 ID·안내), 펼침 상세, 텍스트 선택, Clipboard 미지원 fallback, JSON 저장을 확인했다. Clipboard 권한 거부와 긴 내용은 코드 경로·레이아웃을 검토했으며 별도 Browser 주입 시험은 NOT RUN이다. |
| TC-OBS-003 | PASS. 단위 시험과 브라우저 주입으로 413/502/504, HTML·빈·malformed·임의 JSON, 잘못된 2xx, 연결 실패를 분류했다. raw body와 브라우저 예외는 공개 진단에 포함되지 않고, 502/504·연결 실패는 결과 불확실 및 목록 확인으로 안내되며 자동 재업로드는 0회였다. |
| TC-OBS-004 | PASS. 정상/실패 header·body·server ID, 동시 격리와 주요 단계·elapsed/backend를 확인했다. 외부 origin 403 회귀와 요청 시작 시 ID 생성 구조를 확인했으며 context 초기화 실패 주입은 NOT RUN이다. validation·stream 오류 및 malformed multipart 경계에서 실패 단계와 임시 정리 성공 이벤트가 연결된다. |
| TC-OBS-005 | PASS (주입/SeaweedFS). local DB/storage 실패·S3 credential/보상·불확실 COMMIT 경계를 통합 시험했고, 이전 Current·원본과 불확실 object 보존을 확인했다. 실제 운영 장비의 EACCES/ENOSPC와 실제 네트워크 응답 유실은 NOT RUN이다. |
| TC-OBS-006 | PASS. 최초 storage/DB 실패가 cleanup warning으로 덮이지 않고, 확정 등록 뒤 임시 cleanup warning이 있어도 성공이 유지됨을 통합 시험했다. |
| TC-OBS-007 | PASS. canary credential/Authorization URL·경로·SQL·filename·bytes·설명·순환 cause·개행·장문을 sanitizer/unit/E2E로 검사했고 공개 화면·JSON·Console·서버 로그에 노출되지 않았다. 허용된 파일/DB/S3 code와 category는 유지됐다. |
| TC-OBS-008 | PASS. Compose의 `local` 10m×5 설정, stdout 구조화 로그 수집·ID 검색, GHCR 0.16.0 push/pull digest, 기존 named volume 보존 재배포·healthy 상태와 health endpoint 200을 확인했다. 실제 로그 한도 도달·롤오버 자체와 현장 장치/방화벽은 NOT RUN이다. |

### 판정·제한

- 공개 진단과 안전 로그 정제는 수용 가능한 수준이다. `EACCES/ENOSPC/ECONNREFUSED/ETIMEDOUT`, SQLite/Prisma 오류, 허용된 S3 오류는 code/category와 고정 메시지를 남긴다. 코드가 없는 임의 `Error`와 정제할 수 없는 이름·메시지는 `Internal error details suppressed.`로 완전 억제된다. 이는 credential·SQL·원본 보호 요구에는 부합하지만 미분류 오류의 원인을 운영자가 구분할 수 없다는 관측성 제한이 있다. 현행 NFR-OBS-002의 안전 allowlist 정책 안에서는 허용하되, 주요 앱/라이브러리 오류를 안전 코드로 매핑하는 보완 여지를 Known Issue로 남긴다.
- 재작업 결과: Developer가 `CadStorage.receive`의 validation·stream 오류 cleanup 성공 이벤트를 추가했고 관련 통합 테스트를 보강했다. 재시험에서 두 경계 모두 `temporary_cleanup: success`가 확인되어 NFR-OBS-001/TC-OBS-004를 VERIFIED로 판정한다. QA는 코드를 수정하지 않았다.
- 재작업 재시험 명령: `npm test -- tests/integration/upload.test.ts tests/unit/upload-observability.test.ts`는 2 files / 22 passed / 0 failed, `npm test` 전체는 16 files / 72 passed / 0 failed, typecheck/lint/diff-check 및 local 전체 E2E 18개도 재통과했다.
- 실제 폐쇄망 장애, 프록시 운영 로그, Docker 로그 순환 한도 도달과 실제 현장 장치/방화벽 접근은 이 기록의 PASS가 아니다. GHCR 게시·pull과 단일 Compose 재배포/health는 위 digest 및 실행 결과로 확인했다. `prepare:dwg-samples` 재다운로드는 `raw.githubusercontent.com` DNS `EAI_AGAIN`으로 실패했으며, DWG 시험은 기존 checksum 캐시 샘플로 실행했다.
- 추적: FR-OBS-001/002 → `diagnostics.ts`·`upload-form.tsx` → TC-OBS-001–003/007 → PASS. NFR-OBS-001 → `upload-observability.ts`·route·upload/storage → TC-OBS-004–006 → VERIFIED. NFR-OBS-002 → sanitizer/client diagnostic → TC-OBS-007 → PASS. NFR-OBS-003 → Compose/Operation → TC-OBS-008 → VERIFIED (로그 한도 도달·현장 접근은 별도 미검증).

## U8B-20260909 — DWG 계측 확장 0.15.0

- Manager/Developer 에이전트는 사용량 제한으로 실행하지 못해 root가 구현·검증을 대행했다. 이 사실과 범위 제한을 기록한다.
- `libredwg-web` Adapter가 Worker의 WASM 초기화(`initializeMs`) 및 DWG 파싱(`parseMs`) 시간을 공통 Metrics에 전달한다. 변환 시간과 GPU/WASM 메모리는 아직 별도 수집하지 않는다.

| 검사 | 실제 결과 |
| --- | --- |
| `npm test` | 14 files / 53 passed / 0 failed |
| `npm run typecheck` / `npm run lint` | 각각 exit 0 |
| DWG Adapter metric 단위 시험 (`TC-MET-002`) | PASS |
| 등록 DWG Browser metric stage assertion | 4 passed / 0 failed (공식 Line/Circle sample, 오류·재진입 포함) |
| `npm run build` | exit 0 (`experimental.useTypeScriptCli: false`로 Next API 검사 경로 사용) |

- 실제 업무 DWG, 대형 파일 반복 비교, GPU/WASM 메모리 및 장기 메모리 시험은 NOT RUN이다. 기존 평면 LINE/20 MiB와 제외 Entity partial 범위를 유지한다.
- Manager/Developer 사용량 제한으로 root가 구현·검증을 대행했으며, 해당 역할을 수행한 것으로 기록하지 않는다. Unit 8B의 자동화 Acceptance Criteria는 충족했다.

### 0.15.0 Docker 이미지

- `7bcc872` 기준 `ghcr.io/planner77/layoutmanager:0.15.0`을 linux/amd64로 빌드했다.
- GHCR push 및 인증된 pull 성공. registry digest: `sha256:2d9cf30ad176375e5459568d90121175133109d6ac496234c227ea11eaeff67c`.
- OCI revision label은 `7bcc872`이며 임시 Docker 인증 설정은 검증 후 삭제했다. 익명 pull/visibility 변경은 수행하지 않았다.

## U9B-20260909 — DWG 통합·회귀

- 등록 DWG의 원본 API→`libredwg-web` Adapter→Worker/WASM→canvas 흐름과 DXF/DWG renderer 선택, 직접 링크, 오류·재진입·Dispose를 검증했다.

| 검사 | 실제 결과 |
| --- | --- |
| DWG 전용 E2E (`test:dwg`) | 4 passed / 0 failed |
| 기존 관리·DXF·링크 E2E | 16 passed / 0 failed |
| 20회 Viewer 전환 (`switch.spec.ts`) | passed, 잔여 Worker/canvas 없음 확인 |
| Unit/typecheck/lint/build | 각각 53 passed / exit 0 / exit 0 / exit 0 |

- 검증 환경은 Chromium/SwiftShader, 임시 DB·Storage, 공식 AutoCAD 2000 Line/Circle fixture이다. 실제 업무 도면 fidelity, 대형 파일 SLA, GPU/WASM 메모리 및 장기 메모리 측정은 NOT RUN이다.
- Manager/Developer 사용량 제한으로 root가 실행을 대행했으며, 미실행 역할을 수행한 것으로 기록하지 않는다. U8B·U9B 자동화 범위는 완료 승인 가능하다.

## U-DESC-20260909 — 도면 설명 등록·검색 0.14.0

- 구현 범위: Version별 선택 설명(최대 2,000 UTF-16 code units), trim/NFC/CRLF 정규화, plain-text 목록·Viewer 표시, literal 부분검색과 기존 조건 AND 조합, 기존 행 기본값 호환.
- 실행 역할: Manager/Developer가 사용량 제한으로 중단되어 root가 인계 구현·검증했으며 Luna QA가 사전 Acceptance Criteria 검토를 완료했다. 역할을 수행하지 않은 것으로 기록하지 않는다.

| 검사 | 실제 결과 |
| --- | --- |
| `npm --prefix src test` | 14 files / 52 passed / 0 failed |
| `npm --prefix src run typecheck` / `lint` | 각각 exit 0 |
| `npm --prefix src run build` | exit 0 |
| 설명 UI/API E2E (`upload.spec.ts`) | 4 passed / 0 failed, 12.0초 |

- `CadFileVersion.description` additive migration(`202609090001_description`)은 NOT NULL DEFAULT `''`로 기존 Version/Current/storage/original을 보존한다.
- HTML 문자열은 React text node로 표시되며 실행되지 않는다. SQL 검색은 `instr` bound parameter로 `%`, `_`, 따옴표를 literal 처리한다.
- 단위·통합 검증은 완료했으며, 전체 브라우저 회귀는 기존 배포 이후 변경 범위에 맞춰 다음 회귀 실행에서 확인한다.

## U-DESC-IMAGE-20260909 — GHCR 0.14.0 이미지 갱신

- 최종 소스 커밋 `23a1d85` 기준으로 최신 Dockerfile을 사용해 `ghcr.io/planner77/layoutmanager:0.14.0`을 재빌드했다. `better-sqlite3` 사전 빌드가 없는 환경에서도 `python3/make/g++` 기반 node-gyp 대체 빌드가 가능하도록 빌드 단계를 보강했다.
- GHCR push 및 인증된 pull을 모두 성공했으며 registry digest는 `sha256:8b58e880240da55c893d3ecf692c243f5fa1c10cf312c04672359f2a048f6152`로 일치했다.
- 이미지 OCI revision label은 `23a1d85`이며, pull 검증 후 임시 Docker 인증 설정을 삭제했다. 익명 공개 pull이나 package visibility 변경은 수행하지 않았다.

## U-DEPLOY-20260908 — Docker 배포 0.13.0

- Source: LINK commit 25adc5e 이후 Unit DEPLOY snapshot. Manager 설계/리뷰와 Sol Developer 구현/재작업 완료. Luna QA 사용량 제한으로 root가 실제 실행, Manager가 결과 검토·문서화를 대행한다.
- 환경: Linux x86_64, Node22.14.0, Docker Compose5.5.1. 기존 사용자data/SeaweedFS와 분리된 시험 container/volume, container published3110 및 host앱3100을 사용했다.

| 검사 | 실제 결과 |
| --- | --- |
| Compose config | `--env-file /dev/null config --quiet` 및 예제 env 설정 검사 PASS |
| Root typecheck/lint/build | 각각 PASS |
| Root 자동 테스트 | 51 passed / 0 failed, 13.07초; health200/503/no-store/status-only2개 포함 |
| Root 전체 local E2E | 16 passed / 0 failed, 1.2분 |
| Docker image build | PASS, native SQLite/npm/Prisma/Next build 성공; 최종 게시 image/digest는 아래 후속 결과로 확정 |
| Container 보안/자산 | UID10001, `.env`/`.git`/Git환경변수 없음, 한글 font와 LibreDWG WASM 존재 확인 PASS |
| Container 기본 흐름 | DXF 업로드201, 원본 조회 bytes 일치 PASS |
| 접속 | host앱3100과 container3110 각각 localhost 및 hostIP로 `/api/health`200 PASS |

- 최초 smoke의 WASM 확인은 잘못된 최상위 경로를 검사해 실패했다. 실제 복사 구조의 하위 경로를 재귀 검사해 자산 존재를 확인했으며 앱 수정은 없었다.
- hostIP 시험은 같은 호스트에서 자신의 네트워크 IP로 접근한 결과다. 별도 물리 장치/VPN/방화벽을 통과한 시험으로 확대 해석하지 않는다.
- FR/NFR 추적: NFR-DEPLOY-001 → Dockerfile/Compose/run.mjs/health route → TC-DEPLOY-001/002/004 → 현재 근거 PASS. 영속성 TC-DEPLOY-003 결과는 아래에 기록했으며 GHCR push/pull TC-DEPLOY-005 결과도 아래에 확정했다.
- 최종 실행 검증일: 2026-09-09 (Asia/Seoul). 작업 추적 ID U-DEPLOY-20260908은 시작일 기준으로 유지한다.
- Container Browser: dxf-viewer 표시/확대, three-dxf-viewer 표시/확대, 실제 DWG canvas 표시 모두 PASS; pageerror 0. 기존 planar LINE/20 MiB 제약 안에서 확인했다.
- TC-DEPLOY-003: 동일 격리 volume으로 container를 재생성한 후 DB Version/Current 및 원본 byte 일치 PASS. 기존 사용자 volume은 사용하지 않았다.
- 최종 root Secret/산출물 검사 121 candidates / 0 violations, diffcheck PASS.
- 소스 승인 이후 Docker source commit `d80a9a6519168eef162b883b73deb1ad03a72aca`를 원격에 push하고 clean 상태를 확인했다. 최종 image의 OCI revision은 동일 commit이며 검증한 runtime layer를 cache로 재사용했다.
- TC-DEPLOY-005: `ghcr.io/planner77/layoutmanager:0.13.0` GHCR push PASS, 이어서 인증된 계정의 pull PASS. 양쪽 digest는 `sha256:7cf148fc44def77fad17e1925a5875558fd8dcfef5ab5d4aba56651556cd67e4`로 일치했다. 익명 공개 pull은 시험하지 않았으며 visibility를 임의 변경하지 않았다.
- Image 플랫폼 `linux/amd64`, 로컬 image size 1,909,062,456 bytes. Prisma migration CLI와 기존 개발 dependency를 포함한 P.O.C. 구성으로 크기 최적화는 이번 범위에서 수행하지 않았다. 이 값은 압축된 registry 전송량이 아니다.
- 추가 실행 점검: container healthy, hostIP3110의 홈/등록 HTTP200. 시험 container와 volume을 정리했으며 실제 앱3100은0.13.0/모든 인터페이스 수신으로 유지했다. 최종 localhost/hostIP3100 health 모두200, 시험 container 목록 비어 있음 확인.
- Manager 최종 판정(2026-09-09): TC-DEPLOY-001–005 및 기존 회귀 근거를 검토해 Unit DEPLOY 구현·컨테이너 실행·GHCR 게시를 **완료 승인**한다. 최종 게시 결과만 별도 문서 commit으로 원격 반영한다.
- 기존 `.env`/DB/CAD/SeaweedFS 서비스 변경 없음, 기존 hostdata 자동 migration 없음. 이미지 안의 단일 SQLite 구조와 S3 임시 디스크 요구는 유지한다.

## U-LINK-20260908 — Version 직접 링크 0.12.0

- Source: e947aac 이후 이 기록을 포함한 Unit LINK commit snapshot. DB schema, storage, 기존 원본 변경 없음.
- 실행 역할: gpt-6-astra Manager 설계/리뷰 → gpt-5.6-sol Developer 구현 및 보고 → gpt-5.6-luna QA 테스트 보강/검증/문서 초안 → Manager 재작업 판단. QA 사용량 한도 도달 후 root가 Browser 검증을 실행하고 Manager가 결과·문서를 최종 검토했다. 미실행 역할을 수행한 것으로 기록하지 않는다.

| 검사 | 실제 결과 |
| --- | --- |
| QA `npm --prefix src test` | 13 files / 49 passed / 0 failed |
| QA `typecheck`, `lint`, `build` | 각각 exit 0 |
| 최초 QA Browser 실행 | sandbox localhost3101 bind EPERM, 이후 escalation 대기 중단; 시험 결과 없음 |
| Root 전체 local E2E 최초 | 14 passed / 1 failed, 1.5분. 실패는 QA 시험에서 원래 page 링크를 클릭하고 다른 page navigation을 기다린 잘못된 대상 선택 |
| QA 시험 수정 후 Root LINK 재시험 | 3 passed / 0 failed, 8.0초. runtime 코드 변경 없이 기다릴 page 수정 |
| Root DWG E2E | 4 passed / 0 failed, 19.4초. 공식 LINE sample 직접 링크 새 context 표시 포함 |

- FR-LINK-001 → viewers/core/link.ts, features/cad-link/CopyCadLink, CadTable/CadViewer → TC-LINK-001–003 → PASS. 4개 URL 단위 시험, 목록/Location 복사, DXF 양쪽 renderer 새 context, Current 교체 이후 기존 Version 고정, Clipboard 거부/미지원 및 fallback 클릭을 검증했다.
- 손상 DWG LINK 시나리오는 renderer 라우팅/오류 경로만 확인한다. 실제 DWG 렌더링 근거는 dwg-viewer.probe의 공식 LINE sample로 분리한다.
- Browser: 기존 Chromium/SwiftShader, 임시 DB/Storage와 localhost3101. 최종 source audit/commit/push 및 변경 후 typecheck/lint는 release 담당 root가 확인한다.
- 한계: 실제 다른 장치/업무 도면/공개 운영 URL은 이 Unit에서 시험하지 않았다. localhost는 수신 장치 자체이며 사설 IP는 해당 앱에 대한 네트워크 접근이 필요하다. 링크에 권한 부여/공개 token/스토리지 주소 기능은 없다. DWG 평면 LINE/20 MiB 기존 제한 유지.

## U-S3-20260908 — SeaweedFS 등 S3 호환 저장소 0.11.0

- 사용자 요청: SeaweedFS와 같은 S3 호환 object storage 활용. Source: b050535 이후 이 기록을 포함한 `feat(storage)` commit snapshot.
- 신규 dependency: @aws-sdk/client-s3 3.1127.0 고정(25개 package 추가). DB schema/migration 및 기존 데이터 이동 없음. storage_path에 S3 locator 의미를 추가하고 기존 local key와 혼합 조회한다.
- 실제 `.env`/Git credentials/기존 SeaweedFS 서비스는 변경하지 않았다. 동작 backend를 안전하게 확인한 결과 local. 로컬 3100은 0.11.0으로 재시작했다.

### 실제 검사

| 명령 / 검사 | 결과 |
| --- | --- |
| `npm --prefix src run typecheck` / `lint` | 각각 exit 0 |
| `npm --prefix src test` | 12 files / 45 passed / 0 failed, 16.43초 |
| `npm --prefix src run build` 최종 | exit 0, 기존 모든 route와 S3 서버 코드 build 성공 |
| `npm --prefix src run test:s3` 최종 | 6 passed / 0 failed, 3.89초 |
| `npm --prefix src run test:s3:e2e` | 실제 S3 backend로 12 passed / 0 failed, 1.6분 |
| 기존 local `test:e2e` | 12 passed / 0 failed, 1.3분 |
| 기존 local `test:dwg` | 4 passed / 0 failed, 29.2초 |
| Local 3100 smoke | 홈/등록 HTTP 200, 0.11.0 marker 확인 |
| Secret/런타임 제외 | 111 candidates / 0 violations |
| 임시 컨테이너 정리 | cad-s3-test-* 실행 컨테이너 잔여 0 |

환경: Linux x64, Node 22.14.0, Playwright 1.63.0/Chromium 145.0.0.0/SwiftShader, viewport 1440×1000, worker 1. Chromium executable은 기존 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. SeaweedFS **4.45**, 고정 digest `sha256:fc9f76fa993ad69966ffeb2f65d0318fcae39c6f8e20cf68ef7b3a5cb97769e5`. 기존 서비스와 분리된 임시 Docker 컨테이너, random loopback port, random credentials, 전용 임시 bucket을 사용했다. DB/임시 upload도 `/tmp` 격리 경로이다.

### 요구사항 → 코드 → Test → 결과

| 요구 / TC | 구현/시험 | 실제 확인 |
| --- | --- | --- |
| FR-STORAGE-001 / TC-S3-001 | ConfiguredCadStorage/S3ObjectStorage, storage.s3.ts | DXF·binary DWG byte 일치, 파일 크기/SHA-256 일치, 중복 hash 새 Version, Current 교체 |
| FR-STORAGE-002 / TC-S3-001 | locator routing, storage.s3.ts | 기존 local 원본을 S3 모드에서 조회; 이전 S3 원본을 local 모드 및 신규 bucket 설정 후에도 저장된 bucket 기준 조회 |
| FR-STORAGE-003 / TC-S3-002/003 | uploadCad prepare, storage.s3.ts | repo.register 진입 전에 remote object 존재. DB 실패 후 새 object만 삭제, 기존 object/Current 보존 |
| FR-STORAGE-003 / TC-S3-002 | storage.s3.ts | 실제 COMMIT 후 응답 실패를 주입해 DB 행과 원본이 남는 것 확인. 보상 DELETE 실패는 orphan을 보존하고 CAD_UPLOAD_CLEANUP_PENDING 기록, local staging 제거 |
| FR-STORAGE-003 / TC-S3-002 | S3 adapter, storage.s3.ts | 잘못된 credential은 안전한 503 및 DB 행 0, 없는 key 404, traversal locator 거부 |
| FR-STORAGE-003 / TC-S3-002 | actual SeaweedFS PutObject | 기존 key에 If-None-Match=* PUT은 HTTP 412, 기존 bytes 유지. DeleteObject 후 NoSuchKey 404 확인 |
| FR-STORAGE-001/003 / TC-S3-003 | storage-config.test.ts / env.mjs | local 기본값, 누락 S3 설정·잘못된 backend·credential URL·잘못된 timeout/path-style 거부 |
| FR-STORAGE-001, NFR-TEST-001 | test:s3:e2e | 실제 S3를 사용하는 UI 등록→목록/검색→Current 교체→원본 API→두 DXF Viewer/전환20회·한글·오류·계측 전체 흐름 PASS |
| NFR-TEST-001 | local E2E + DWG suite | 기존 local 경로 및 등록 DWG 직접 렌더링/기본 탐색·오류·취소 회귀 PASS |

S3 시험의 최초 5개도 통과했다(2.91초). 보상 DELETE 자체의 실패를 추가한 최종 6개 결과를 위 표에 기록했다. S3와 local Browser 결과를 별도로 기록하며 중복 실행을 고유 Test Case 수로 합산하지 않는다. 웹 suite의 NO_COLOR/FORCE_COLOR 메시지는 환경 경고이며 실패가 없었다.

### 발견 및 조치

- Node WebStream과 DOM WebStream의 타입 정의 차이로 Type Check가 실패했다. 기존 Node 파일 스트림의 WebStream 변환 지점에서 공통 byte-stream 계약을 명시하여 해결했다. 실제 local/S3 HTTP body 시험 통과.
- 기본 E2E가 실제 사용자 S3 설정을 물려받지 않도록 local backend를 명시했다. S3 E2E는 전용 launcher가 임시 endpoint/credentials와 opt-in 값을 함께 주입한다.
- 실제 Secret/업로드 원본/SQLite/생성 CAD/임시 S3 credential 파일은 커밋하지 않는다. S3 오류는 원본 exception/Authorization/credential URL을 UI/log에 출력하지 않고 안전한 code/message로 변환한다.
- 설정 검토에서 명시적으로 비운 S3 session token이 .env 값으로 복원될 수 있는 우선순위를 보완했다(nullish override). 해당 단위 시험을 추가하여 최종 자동 시험 45개 및 Build/Type/Lint 통과. 앞선 44개 실행도 통과했으며 Browser 경로 변경은 없다.
- 초기 설치 npm audit는 기존 high 4개를 보고했다. 강제 dependency 교체는 하지 않았다.

### 범위·제한·다음 단계

- 지원 검증 제품은 SeaweedFS 4.45이며 AWS/MinIO/다른 S3 제품 전체를 실행 검증했다고 주장하지 않는다. custom TLS CA, 가상 host-style, 대형 파일 throughput/timeout, versioned/object-lock bucket의 영구 정리 정책은 별도 환경 검증 대상이다.
- 현재 단일 S3 endpoint를 사용한다. 설정 변경만으로 endpoint 간 기존 데이터를 이전하지 않는다. bucket은 locator에 기록하며 기존 bucket 조회 권한을 유지해야 한다.
- SQLite와 임시 upload는 local disk를 계속 사용한다. 자동 bucket 생성/파일 migration/orphan sweeping/browser presigned upload는 미제공이다. PUT 응답 유실은 실제 network fault로 재현하지 않았으며 코드에서 불확실 object를 무조건 지우지 않도록 처리했다.
- 실제 서비스는 local 기본값 유지. 사용자는 `.env.example`의 CAD_STORAGE_BACKEND/CAD_S3_*를 설정해 활성화할 수 있다. 상세 전환/복구 계약은 Database/Operation을 참조한다.
- 요청 Unit S3 완료 기준 충족. 기존 DWG LINE/20 MiB 제한과 원격 메모 요청 #2는 유지하며 다음 승인 단계는 Unit 8B DWG 계측/평가이다.

## U7B-20260908 — 등록 DWG Viewer 통합 0.10.0

- Source: 6ef6095 이후 이 결과를 포함한 `feat(viewer)` 커밋 snapshot. 앱 버전 0.10.0, 기존 exact dependency와 DB Schema 변경 없음.
- 범위: 등록 DWG 원본 ID API→LibreDwgWebAdapter→전용 Worker/WASM→직접 평면 LINE 렌더링. 확대/축소/Pan/Fit/Resize·재시도·부분 표시·오류/취소를 공통 UI에 연결했다. DWG에 두 DXF Viewer 버튼을 제공하지 않고 조작 query도 DWG 전용 Adapter를 선택한다.
- 환경: Node 22.14.0/Linux x64, Playwright 1.63.0/Chromium 145.0.0.0/SwiftShader, 기본 viewport 1440×1000, resize 1100×800, worker 1. 실제 DWG는 U7A에 기록한 공식 고정 AutoCAD 2000 Line.dwg/circle.dwg(동일 SHA-256). Browser 시험은 실행별 임시 DB/Storage·3101, 기존 사용자 데이터에 파일을 등록하지 않았다.

| 검사 | 실제 결과 |
| --- | --- |
| Type Check / Lint | 각각 exit 0 |
| Vitest `npm --prefix src test` 최종 | 11 files / 43 passed / 0 failed, 9.49초 |
| Production Build | exit 0, 등록 Version Viewer 및 /lab/dwg 정상 build |
| `test:dwg` | 4 passed / 0 failed / 0 skipped, 15.2초 |
| `test:e2e` | 12 passed / 0 failed / 0 skipped, 51.2초 |
| Local 3100 | 0.10.0 재시작, 홈/등록/WASM HTTP 200 및 버전 문구 확인 |
| Secret/산출물 제외 | 103 commit candidates / 0 violations |

명령은 Operation을 따른다. Browser executable은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. 초기 Type Check/Build는 DB format의 String→ViewerFormat 할당 오류로 실패했다. 서버 페이지에서 실제 DXF/DWG 값 검증 후 narrowing하도록 수정하여 최종 검사 통과했다. 42개 자동 시험 실행 후 한도/헤더/해제 후 입력 거부 시험을 추가해 최종 43개를 실행했다.

### 요구사항 → 구현 → Test Case → 결과

| 요구 / TC | 코드 | 실제 검증 |
| --- | --- | --- |
| FR-LIST-003, FR-VIEWER-005, FR-UI-001 / TC-E2E-002 | cad-table, version viewer page, CadViewer, dwg-viewer.probe.ts | 실제 DWG UI 등록→목록/검색/Current 표시→도면 보기→LINE 표시. 선택 Version ID·계측 renderer/Entity 수 일치, 원본 bytes 동일 |
| FR-VIEWER-001 / TC-VIEW-001 | core/selection.ts, Manager format, dwg-adapter.test.ts | DWG에 DXF query를 전달해도 LibreDWG만 선택, 두 DXF 버튼 없음. DWG Manager에 DXF 요청 시 factory 미호출 |
| FR-VIEWER-006 / TC-VIEW-002 | libredwg-web/line-view.ts, dwg-viewer.probe.ts | 확대/축소/Fit·Pan의 canvas 픽셀 변화 및 Fit 복구, Resize canvas 크기 일치 |
| FR-VIEWER-008 / TC-DWG-003 | adapter/probe/line-view, dwg-viewer.probe.ts | 3회 다시 불러오기 후 canvas 1개/Worker 0, 화면 이탈 canvas 0, 재진입 성공, 지연 WASM 처리 중 이탈 시 Worker 1→0 및 늦은 canvas 없음 |
| FR-VIEWER-008 / TC-DWG-003 | dwg-adapter.test.ts | cancel 반복은 terminate 1회/AbortError; 60초 timeout은 terminate 후 실패. timeout은 fake timer 단위 시험이며 실제 60초 대기는 하지 않음 |
| FR-ERROR-001 / TC-DWG-002/004 | adapter/UI, dwg-viewer.probe.ts | 미지원 헤더/손상 DWG 실패, CIRCLE 제외 건수/partial, 원본 404/WASM 404 안내 및 해제 후 retry 성공 |
| FR-ERROR-001 / TC-DWG-002 | dwg-adapter.test.ts | 빈 입력/20 MiB 초과/잘못된 헤더/Dispose 이후 입력은 Worker 생성 전 거부 |
| NFR-PERF-001 | core/metrics.ts + Manager | 제외 Entity는 result partial+reasons.coverage; LINE 0개이면 firstDisplayMs null, 거짓 전체 성공 없음. 상세 DWG stage 계측은 8B |
| NFR-TEST-001 | 기존 전체 회귀 및 dwg.probe.ts | DXF 등록/Current/두 Renderer·전환20회/글꼴/계측/오류와 DWG 독립 실험 모두 PASS |

`src/dwg-test-results/registered-dwg.png`(Git 제외)를 시각 확인했다. libredwg-web 단독 표시, 실제 LINE과 탐색 도구·한도 설명을 확인했다. 기준 CAD 프로그램과 정밀한 실도면 fidelity 비교는 수행하지 않았다. 별도 장기 메모리 시험 없이 Worker 수/canvas 해제만 관찰했으므로 전체 GPU/JS 메모리 누수 없음으로 해석하지 않는다.

### 운영 및 제한

- 이전 0.9.0 프로세스를 종료할 때 webpack-runtime의 undefined.call 오류 로그가 있었다. 동일 `.next`에 새 Build를 쓰는 동안 기존 프로세스가 남아 있었으며 모듈 혼용 가능성이 있다. 새 0.10.0 프로세스로 재시작 후 홈/등록/WASM smoke 정상. Operation에 단일 workspace의 기존 start 중지→build→start 순서를 기록했다.
- planar LINE/20 MiB 범위 유지. Parser가 읽은 CIRCLE은 자체 renderer에서 제외하며 이를 parser 미지원으로 분류하지 않는다. TEXT/BLOCK/곡선·Layer/style/색상·선종류/전체 Entity는 미지원 또는 미검증. AutoCAD 2000 이외 revision/실도면/대형 성능·장기/저메모리 장비 시험은 NOT RUN.
- 공통 metrics schemaVersion 1에 result partial enum 추가. JSON 소비자는 이를 허용해야 한다. DWG 순수 parse 계측은 공통 UI에서 아직 null이며 상세 init/parse/convert와 비교는 Unit 8B이다.
- DB·업로드 원본·migration 불변, DWG→DXF 변환 없음. 20 MiB보다 큰 파일의 등록 가능 여부는 기존 Upload 설정을 따르고 Viewer는 별도 제한 안내를 한다.
- 기존 의존성 high 경고와 원격 이슈 #2 메모 요청은 후속. 이번에 library 변경이나 audit 재실행은 하지 않았다.
- Unit 7B의 최소 지원 범위 통합 기준 충족. 전체 업무 DWG/P.O.C. 최종 완료와 구분하며 다음 승인 Unit은 8B 계측 및 평가이다.

## U7A-20260908 — libredwg-web 실제 DWG 최소 실험 0.9.0

- Source: 1277f00 이후 이 결과를 포함한 `feat(dwg)` 커밋 snapshot. 신규 고정 dependency @mlightcad/libredwg-web 0.7.10(GPL-3.0), 기존 Next/Three/DXF 버전 및 DB Schema 불변.
- 범위: 독립 `/lab/dwg`의 로컬 파일→전용 Worker→WASM→DWG model-space 객체→자체 planar LINE renderer. 등록 Version 화면 통합은 아직 구현하지 않았다. DXF 변환/두 DXF Viewer를 호출하지 않는 import/data 흐름을 검토했다.
- 환경: Node 22.14.0, Linux x64, Playwright 1.63.0, Chromium 145.0.0.0/SwiftShader, viewport 1440×1000, worker 1. Production E2E는 실행별 임시 DB/Storage/3101. 사용자 DB/원본에 시험 데이터를 추가하지 않았다.

### 실제 검사

| 검사 | 결과 |
| --- | --- |
| Type Check / Lint | 각각 exit 0 |
| Vitest `npm --prefix src test` | 10 files / 39 passed / 0 failed, 10.49초 |
| Production Build | exit 0, `/lab/dwg` 생성 및 SSR Browser API 오류 없음 |
| 기존 `test:e2e` | 12 passed / 0 failed / 0 skipped, 59.4초 |
| `prepare:dwg-samples` | 공식 2개 파일 SHA-256 일치 |
| 최종 `test:dwg` | 2 passed / 0 failed / 0 skipped, 7.9초 |
| Local 3100 smoke | 0.9.0 서버 재시작, `/lab/dwg` 및 WASM HTTP 200 |
| 후보 Secret/산출물 검사 | 99 candidates, 0 violations; CAD/생성 ESM/WASM/DB 미추적 |

실행은 Operation 명령을 사용하며 Chromium executable은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. DWG 최초 Browser 실행도 2 passed(8.9초)였다. DXF 실행이 DWG 캡처를 지우지 않도록 별도 `dwg-test-results` 경로로 분리 후 최종 재실행했다.

### 샘플 및 재현성

출처는 [공식 고정 커밋의 AutoCAD 2000 시험 데이터](https://github.com/mlightcad/libredwg-web/tree/5909bd2bb87fa1168838e1295188f3ee603618eb/test/test-data/2000). 실제 CAD bytes를 다운로드하여 시험했으며 mock DWG가 아니다. 원본은 `src/node_modules/.cache/cad-dwg-samples`에만 저장하고 Git에 넣지 않았다. `scripts/dwg-samples.mjs`에서 URL revision과 hash를 고정한다.

| 파일 | bytes | SHA-256 | 결과 |
| --- | --- | --- | --- |
| Line.dwg | 174005 | 358fc09c7c27737ba3b500eac122caee4c83c270f5ccb8a9f7f8f3d4b763d937 | 실제 model-space LINE 1개, 직접 화면 표시 |
| circle.dwg | 177345 | d2c2e592c4d501aa416bf41383b8067f7f72c32af558d1dea8481bb7d884b6dc | CIRCLE 파싱됨, renderer 미지원 건수 및 LINE 없음 표시 |

### 요구 → 코드 → TC → 결과

| 요구 / TC | 구현·시험 | 실제 결과 |
| --- | --- | --- |
| FR-VIEWER-005 / TC-DWG-001/005 | viewers/libredwg-web/{worker,primitives,line-view}; tests/e2e/dwg.probe.ts | Worker에서 raw DWG 직접 파싱, LINE 1개 표시 및 확대 후 canvas 픽셀 변화. 정적 asset HTTP 200/application/wasm |
| FR-VIEWER-008 / TC-DWG-003 | worker finally, probe.cancel; dwg.probe.ts | 3회 load 각각 원본 pointer raw.dwg_free 호출 완료, FS 임시 파일 없음, active Worker 0. 반복 시 canvas 1개, 해제 버튼 후 canvas 0 |
| FR-ERROR-001 / TC-DWG-002/004 최소 subset | worker 안전한 stage 오류, dwg.probe.ts | 손상 DWG 실패, WASM 404 초기화 실패, 결과 데이터/성공 canvas 없음 |
| FR-VIEWER-007 최소 subset | linePrimitives; unit/dwg-primitives.test.ts | CIRCLE/숨김/비평면/PaperSpace/비유한 LINE 제외 건수 확인. 지원하지 않는 기하를 표시했다고 주장하지 않음 |
| NFR-TEST-001 | 기존 tests 전체 | DXF 관리/Current/전환/한글/오류/계측 회귀 PASS |

수동 시각 확인: Browser 캡처에서 청록색 대각선 LINE과 결과 `lineCount=1`, `freed=true`, `temporaryFileRemoved=true`를 확인했다. 생성 캡처는 Git 제외 `src/dwg-test-results/dwg-line-probe.png`. 기준 CAD 프로그램 화면과의 정밀 fidelity 대조는 NOT RUN이다. 최초 실행 캡처 3회차에서 init 167.4ms / parse 61.5ms / convert+primitives 28.4ms를 관찰했으나, 반복 성능 비교 설계에 따른 통계가 아니므로 성능 판정에 사용하지 않는다.

### 발견·수정 및 한계

- 초기 Type Check: 배포본의 locateFile 파라미터와 FS.analyzePath 2번째 인자에 맞춰 타입/호출 수정 후 통과.
- 초기 Build: Emscripten의 guarded `node:module` import를 Webpack이 처리하다 UnhandledSchemeError. upstream 코드는 수정하지 않고 고정 ESM/glue/WASM을 local public asset으로 준비해 Worker에서 native dynamic import하도록 수정 후 Build/Browser 통과.
- README 예제의 free 대상 표현보다 설치 배포본 타입/소스를 우선했다. 변환된 JS database가 아닌 원래 DWG pointer를 raw.dwg_free에 전달한다. FS.unlink/free 이후 결과를 전송하고 main에서 Worker를 terminate한다.
- parser는 CIRCLE을 읽지만 이번 자체 renderer는 LINE만 그린다. 이 차이는 LibreDWG parser 미지원으로 분류하지 않는다. layer/style/color/선종류/두께/BLOCK/TEXT/곡선은 후속 renderer 범위이다.
- raw parser nonzero flags는 이 실험에서 모두 실패로 처리한다. 경고 수준과 부분 로드 허용 정책은 7B에서 실제 API 및 샘플로 확장한다.
- npm package 빌드 옵션 INITIAL_MEMORY=1GB; Worker 종료/포인터 해제가 즉시 OS 메모리 회수 또는 누수 없음의 증거는 아니다. 장기/대형/저메모리 장비 및 다른 DWG revision은 NOT RUN.
- install의 기존 high severity 4개 경고 유지. 라이브러리 의존성 교체·강제 audit fix는 수행하지 않았다.
- Unit 7A 최소 실험 기준 충족. 다음 Unit 7B에서 등록 Version 원본 API→LibreDwgWebAdapter→화면을 연결한다. 전체 업무 DWG 지원이나 P.O.C. 최종 완료로 판정하지 않는다. 원격 이슈 #2 메모는 별도 후속 요청이다.

## U9A-20260908 — DXF 통합·회귀 및 릴리스 검증

- Version: 0.8.0 유지. Source: e9339a3 위에 이 결과를 포함한 `test(release)` 커밋 snapshot. 앱 기능·라이브러리·DB Schema 변경 없음.
- 환경: Node 22.14.0, Linux x64, Playwright 1.63.0 / Chromium 145.0.0.0, SwiftShader, 1440×1000, worker 1. Unit 8A와 동일 설정. 실행별 임시 SQLite/Storage 및 3101 Production 서버 사용; 기존 사용자 데이터에 시험 파일을 등록하지 않았다.

| 검사 / 명령 | 실제 결과 |
| --- | --- |
| `npm --prefix src run typecheck` | PASS, exit 0 |
| `npm --prefix src run lint` | PASS, exit 0 |
| `npm --prefix src test` | 9 files / 38 passed / 0 failed, 14.80초 |
| `npm --prefix src run build` | PASS, exit 0; 등록·목록·상세·Viewer 및 API route 생성 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=… npm --prefix src run test:e2e` | 12 passed / 0 failed / 0 skipped, 1.1분 |
| Schema review | schema.prisma/migration/Database.md의 Column/Null/Default/FK/Unique/Index 대조; TC-DB-007 PASS, Schema 변경 없음 |
| Secret/런타임 제외 검사 | 88 commit 후보, 위반 0; 실제 env 값 비출력 |
| `git diff --check` | PASS, exit 0 |

Chromium 실행 파일은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. 환경별 경로는 Operation에 따라 지정한다. E2E의 FORCE_COLOR/NO_COLOR 경고는 실행 환경 경고이며 실패는 없었다.

### 요구사항 → 구현 → 실행 근거

| 요구 / TC | 실행 코드 | 실제 확인 |
| --- | --- | --- |
| FR-CAD-001/003, FR-VERSION-002/003, FR-LIST-003, FR-UI-001 / TC-E2E-001 | tests/e2e/workflow.spec.ts | UI에서 동일 Location V1/V2 등록→검색→V2 Current 확인→V1 지정→reload/목록 API/상세 API 단일 Current 일치→V1 DXF 두 Viewer 표시, 7.9초 |
| FR-FILE-001, FR-VIEWER-002/003, NFR-PERF-001 | workflow.spec.ts | 선택 Version ID/파일 크기/Renderer 계측 일치, 원본 bytes 동일, 확대 전후 canvas pixels 변화, console error/pageerror 0 |
| FR-VIEWER-004 / TC-SWITCH-001/002 | tests/e2e/switch.spec.ts | 20회 전환, 동일 document/Version·다운로드 1회, 재시도 시 2회; canvas 1개, 추적 Worker/Blob 0 및 active context 1; 화면 이탈 후 모두 0, 24.4초 |
| FR-VERSION-001–004, NFR-DATA-001 | tests/integration/database.test.ts | 위치 Unique·Version 순번·Current 교체/rollback/경쟁·타 Location SQL/service 차단·FK 및 Index 회귀 PASS |
| FR-CAD-001–005, FR-LIST-001/002, NFR-SEC-001 | tests/integration/upload.test.ts, list.test.ts | 업로드/실패 보상/중복 hash·검색/필터·traversal/symlink 회귀 PASS |
| FR-VIEWER-002/003/006, FR-ERROR-001 | tests/e2e/viewer.spec.ts | 두 Viewer의 LINE/CIRCLE/한글 TEXT·탐색·resize·재진입, 손상/빈 DXF, DWG 미제공 안내 회귀 PASS |
| NFR-PERF-001 / TC-MET-001 | metrics.spec.ts 및 unit/metrics.test.ts | JSON export·빈 도면·성공/실패/취소·null 사유 회귀 PASS |

캡처는 Git 제외 `src/test-results/release-workflow.png`. 새로 수행한 시각적 수동 fidelity 평가는 없으며 canvas 변화 assertion을 전체 Entity 정확성으로 해석하지 않는다. U8A 동일 앱의 60개 성능 측정은 재실행하지 않았고 위 기존 보고서의 실제 결과를 참조한다.

### 판정 및 제한

- DXF 우선 릴리스의 자동화 기능 통합·회귀 기준 충족. 두 Viewer 기본 흐름을 검증했으며 실패 미해결 테스트는 없다. 테스트/문서만 변경하여 앱 버전 0.8.0 유지, 이번 Tag 생성 없음.
- 실제 업무 Sample/기준 CAD 화면·SLA 미제공: TC-CAD-001 실도면 충실도, 복잡한 Entity, >10 MiB 도면, 다른 Browser/실 GPU 장기 사용성은 NOT RUN. 자원 수 20회 확인은 전체 JS/GPU 장기 누수 없음의 증명이 아니다.
- DWG의 실제 libredwg-web 초기화/렌더링은 NOT RUN. 다음 승인 Unit은 7A 기술 실험이며 전체 P.O.C. 완료로 판정하지 않는다.
- 기존 Prisma 전이 의존성 경고는 미해결이다. 이번에 의존성 변경/audit 재실행은 하지 않았다.
- 원격 연결/인증·main HEAD=e9339a3 일치를 시작 시 확인했다. 원격 이슈 #2 등록 메모 요청은 OPEN이며 이번 회귀 범위와 별도 후속 항목으로 기록했다. Commit/Push 최종 결과는 이 기록을 포함한 Git history와 원격 HEAD 검증을 기준으로 한다.

## U8A-20260908 — 계측 및 합성 도면 비교 0.8.0

- Source: 이 결과를 포함한 `feat(metrics)` 커밋 snapshot. Type Check/Lint/Production Build 통과. DB Schema 및 기존 library version 변경 없음.
- 로컬 3100을 0.8.0으로 재시작하고 홈/아이콘 HTTP 200을 확인했다. 커밋 후보 87개 Secret/런타임 제외 검사 위반 0. 원본 CAD/Runtime DB/benchmark JSONL을 커밋하지 않고, 측정값 및 출처는 이 보고서에 보존했다.
- 자동 테스트 38 passed / 0 failed. 성공/빈 도면/오류/취소, 원본 재사용과 stage/null 사유를 검증했다. E2E 11 passed / 0 failed (42.1초), JSON 다운로드 내용과 현재 renderer/source 상태 일치 포함.
- 최종 benchmark 30 cold/warm 쌍 = 60개 측정. 3가지 LINE 개수 × 2 Viewer × cold/warm × 각 5회. 모든 Load 성공, Console error/pageerror 0. 이는 합성 fixture 기능 검증이며 성능 SLA 합격 판정이 아니다.
- 예비 실행은 favicon.ico 404 때문에 9 failed/1 interrupted/20 not run으로 중단했다. 실제 trace에서 누락 아이콘 요청을 확인하고 app/icon.svg를 추가했다. 예비 값은 아래 최종 결과에서 제외했다. 별도 benchmark 설정의 TypeScript union 처리 오류도 수정 후 검사 통과했다.
- 환경: Linux x64, Intel Core Ultra 7 255H, logical CPU 16, OS 보고 RAM 15 GiB. Node 22.14.0, Playwright 1.63.0, Chromium 145.0.0.0 (cache 1208), SwiftShader, 1440×1000, DPR 1, worker 1. 개발 환경의 공유 장비이며 전용 무부하 장비가 아니다.
- cold=새 Browser context 첫 열기(프로세스/OS cache까지 초기화한 것은 아님), warm=같은 Version에서 다른 Viewer 경유 후 원래 Viewer 복귀(memory source+Browser/module/font cache). 시작 시간은 Manager.load부터이며 HTML navigation 전체 시간은 포함하지 않는다.
- 전체=최종 결과 시점, 처리=Adapter Load(bytes 복사/파싱/준비/글꼴/렌더링 통합), 첫 화면=성공 draw 후 rAF callback 관찰(GPU present 보장 아님). 확대=버튼 click 실행→다음 rAF 관찰. 실제 입력 장치 latency를 포함하지 않는다.
- pure parse는 두 Viewer 모두 null+사유. dxf Entity count는 null, three는 100/10,000/100,000 확인. 표 LINE 수는 fixture 생성 수이며 API 계측과 구분한다. heap은 비표준 usedJSHeapSize snapshot이며 GPU/WASM/전체 process memory가 아니다.
- 같은 도면 크기·SHA-256은 아래 표와 생성 코드 metrics.benchmark.ts로 재현한다. 최대 도면도 약 5 MB로 10 MiB 초과 대형 파일은 NOT RUN. LINE만으로 TEXT/BLOCK/HATCH 등 실제 도면 복잡도를 대표하지 않는다.
- 상세 원시 JSONL은 Git 제외 src/benchmark-results/measurements.jsonl. 아래 개별 시간/heap과 sample hash를 보존한다. 재현 명령: Production Build 후 PLAYWRIGHT_CHROMIUM_EXECUTABLE 지정 npm --prefix src run test:benchmark.

### 합성 Sample

| LINE 수 | bytes | SHA-256 |
| --- | --- | --- |
| 100 | 4716 | 6208373070888c0e04d919cf55129e09d839b7626c20c6152752f9c90f76a565 |
| 10000 | 487836 | b2c022d058d1dd3612732faefe8ebcf662c289571be1305f4948d643aa0d73b4 |
| 100000 | 5058036 | 58211f0609a2aefb9439df7c09b0c0db45417f054807b473c3882021d814b08a |

### 5회 요약 (시간 ms, heap MiB)

| LINE | Viewer | 조건 | 전체 median [min–max] | 처리 median | 첫 화면 median | 확대 median | heap median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | dxf-viewer | cold | 479.6 [308.1–590.1] | 178.0 | 479.6 | 1.1 | 11.9 |
| 100 | dxf-viewer | warm | 255.9 [234.3–363.7] | 199.8 | 255.9 | 1.6 | 14.3 |
| 100 | three-dxf-viewer | cold | 1440.3 [1101.3–1540.6] | 1232.9 | 1440.2 | 1.8 | 62.0 |
| 100 | three-dxf-viewer | warm | 439.9 [389.5–499.3] | 393.5 | 439.9 | 19.2 | 64.9 |
| 10000 | dxf-viewer | cold | 498.8 [406.5–583.4] | 276.7 | 498.8 | 5.4 | 13.0 |
| 10000 | dxf-viewer | warm | 406.3 [352.3–702.1] | 362.0 | 406.3 | 0.8 | 50.0 |
| 10000 | three-dxf-viewer | cold | 1414.2 [1390.8–1487.0] | 1233.5 | 1414.2 | 422.1 | 99.6 |
| 10000 | three-dxf-viewer | warm | 621.0 [542.2–719.6] | 579.7 | 621.0 | 582.3 | 101.1 |
| 100000 | dxf-viewer | cold | 918.3 [864.9–1364.9] | 672.2 | 918.3 | 191.7 | 22.0 |
| 100000 | dxf-viewer | warm | 656.8 [633.7–820.3] | 618.5 | 656.8 | 143.3 | 295.4 |
| 100000 | three-dxf-viewer | cold | 3338.8 [3265.8–3899.1] | 3108.0 | 3338.8 | 5299.9 | 375.9 |
| 100000 | three-dxf-viewer | warm | 3167.0 [2764.5–4000.6] | 3123.3 | 3167.0 | 5488.1 | 386.4 |

### 개별 결과 (시간 ms, heap MiB)

| LINE | Viewer | 조건/회차 | source 대기 | 초기화 | 처리 | 첫 화면 | 전체 | 확대 | heap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | dxf-viewer | cold/1 | 81.4 | 330.7 | 177.9 | 590.1 | 590.1 | 0.9 | 12.4 |
| 100 | dxf-viewer | warm/1 | 0.2 | 54.9 | 199.8 | 255.9 | 255.9 | 12.6 | 14.4 |
| 100 | dxf-viewer | cold/2 | 26.1 | 105.1 | 178.0 | 309.4 | 309.4 | 0.8 | 13.5 |
| 100 | dxf-viewer | warm/2 | 0.1 | 57.3 | 176.1 | 234.3 | 234.3 | 1.4 | 14.3 |
| 100 | dxf-viewer | cold/3 | 36.1 | 100.9 | 170.9 | 308.1 | 308.1 | 17.5 | 11.8 |
| 100 | dxf-viewer | warm/3 | 0.1 | 49.1 | 199.7 | 249.6 | 249.6 | 1.6 | 14.3 |
| 100 | dxf-viewer | cold/4 | 27.7 | 219.7 | 231.9 | 479.6 | 479.6 | 1.1 | 11.9 |
| 100 | dxf-viewer | warm/4 | 0.1 | 62.7 | 277.9 | 342.0 | 342.0 | 4.2 | 14.5 |
| 100 | dxf-viewer | cold/5 | 38.4 | 257.2 | 237.6 | 533.3 | 533.3 | 8.5 | 11.8 |
| 100 | dxf-viewer | warm/5 | 0.2 | 43.5 | 319.8 | 363.7 | 363.7 | 0.6 | 14.3 |
| 100 | three-dxf-viewer | cold/1 | 20.7 | 174.5 | 1343.9 | 1540.6 | 1540.6 | 1.8 | 61.9 |
| 100 | three-dxf-viewer | warm/1 | 0.2 | 44.9 | 402.1 | 448.2 | 448.2 | 18.4 | 79.6 |
| 100 | three-dxf-viewer | cold/2 | 20.5 | 166.5 | 1252.0 | 1440.2 | 1440.3 | 3.7 | 62.0 |
| 100 | three-dxf-viewer | warm/2 | 0.2 | 49.4 | 449.5 | 499.3 | 499.3 | 19.2 | 64.9 |
| 100 | three-dxf-viewer | cold/3 | 15.2 | 152.2 | 1118.8 | 1287.2 | 1287.2 | 1.4 | 62.0 |
| 100 | three-dxf-viewer | warm/3 | 0.1 | 45.6 | 393.5 | 439.9 | 439.9 | 17.8 | 64.9 |
| 100 | three-dxf-viewer | cold/4 | 56.9 | 202.1 | 1232.9 | 1493.0 | 1493.0 | 13.1 | 60.3 |
| 100 | three-dxf-viewer | warm/4 | 0.2 | 43.7 | 349.4 | 393.8 | 393.9 | 19.3 | 64.9 |
| 100 | three-dxf-viewer | cold/5 | 31.1 | 122.8 | 946.4 | 1101.3 | 1101.3 | 1.4 | 62.0 |
| 100 | three-dxf-viewer | warm/5 | 0.2 | 36.3 | 352.2 | 389.5 | 389.5 | 32.1 | 64.9 |
| 10000 | dxf-viewer | cold/1 | 28.7 | 130.2 | 247.3 | 406.4 | 406.5 | 30.0 | 14.6 |
| 10000 | dxf-viewer | warm/1 | 0.3 | 155.6 | 546.0 | 702.1 | 702.1 | 0.8 | 50.2 |
| 10000 | dxf-viewer | cold/2 | 35.8 | 216.7 | 246.2 | 498.8 | 498.8 | 6.3 | 13.0 |
| 10000 | dxf-viewer | warm/2 | 0.2 | 51.6 | 380.2 | 432.2 | 432.2 | 0.8 | 50.1 |
| 10000 | dxf-viewer | cold/3 | 39.1 | 201.5 | 342.6 | 583.4 | 583.4 | 1.0 | 12.8 |
| 10000 | dxf-viewer | warm/3 | 0.2 | 39.6 | 336.2 | 376.2 | 376.2 | 0.7 | 50.0 |
| 10000 | dxf-viewer | cold/4 | 32.3 | 161.8 | 292.8 | 487.1 | 487.1 | 5.4 | 13.0 |
| 10000 | dxf-viewer | warm/4 | 0.1 | 44.0 | 362.0 | 406.3 | 406.3 | 0.6 | 50.0 |
| 10000 | dxf-viewer | cold/5 | 45.1 | 213.2 | 276.7 | 535.3 | 535.3 | 1.1 | 12.8 |
| 10000 | dxf-viewer | warm/5 | 0.3 | 43.5 | 308.3 | 352.3 | 352.3 | 61.3 | 49.0 |
| 10000 | three-dxf-viewer | cold/1 | 25.8 | 121.7 | 1241.8 | 1390.8 | 1390.8 | 639.2 | 99.6 |
| 10000 | three-dxf-viewer | warm/1 | 0.2 | 34.4 | 507.4 | 542.2 | 542.2 | 460.1 | 101.4 |
| 10000 | three-dxf-viewer | cold/2 | 42.3 | 149.1 | 1294.5 | 1487.0 | 1487.0 | 480.9 | 67.8 |
| 10000 | three-dxf-viewer | warm/2 | 0.1 | 43.5 | 616.3 | 660.1 | 660.1 | 729.7 | 101.1 |
| 10000 | three-dxf-viewer | cold/3 | 35.6 | 156.3 | 1221.1 | 1414.2 | 1414.2 | 422.1 | 100.0 |
| 10000 | three-dxf-viewer | warm/3 | 0.0 | 41.1 | 579.7 | 621.0 | 621.0 | 450.7 | 101.1 |
| 10000 | three-dxf-viewer | cold/4 | 32.2 | 124.2 | 1233.5 | 1391.3 | 1391.3 | 418.7 | 99.6 |
| 10000 | three-dxf-viewer | warm/4 | 0.1 | 44.8 | 573.7 | 618.8 | 618.8 | 603.0 | 101.0 |
| 10000 | three-dxf-viewer | cold/5 | 28.4 | 160.0 | 1228.7 | 1418.2 | 1418.2 | 394.4 | 99.9 |
| 10000 | three-dxf-viewer | warm/5 | 0.2 | 62.8 | 656.4 | 719.6 | 719.6 | 582.3 | 101.1 |
| 100000 | dxf-viewer | cold/1 | 88.4 | 187.7 | 692.3 | 968.5 | 968.5 | 191.7 | 21.9 |
| 100000 | dxf-viewer | warm/1 | 0.2 | 38.3 | 765.6 | 804.2 | 804.2 | 310.9 | 360.3 |
| 100000 | dxf-viewer | cold/2 | 87.5 | 158.4 | 672.2 | 918.3 | 918.3 | 204.5 | 22.0 |
| 100000 | dxf-viewer | warm/2 | 0.2 | 44.5 | 775.5 | 820.3 | 820.3 | 336.6 | 24.7 |
| 100000 | dxf-viewer | cold/3 | 115.9 | 249.0 | 999.8 | 1364.9 | 1364.9 | 325.7 | 22.0 |
| 100000 | dxf-viewer | warm/3 | 0.3 | 38.7 | 610.0 | 649.2 | 649.2 | 143.3 | 295.3 |
| 100000 | dxf-viewer | cold/4 | 82.3 | 160.1 | 622.4 | 864.9 | 864.9 | 70.5 | 22.0 |
| 100000 | dxf-viewer | warm/4 | 0.2 | 38.0 | 618.5 | 656.8 | 656.8 | 74.5 | 310.4 |
| 100000 | dxf-viewer | cold/5 | 80.0 | 159.9 | 648.5 | 888.5 | 888.5 | 52.3 | 21.8 |
| 100000 | dxf-viewer | warm/5 | 0.2 | 30.7 | 602.7 | 633.6 | 633.7 | 0.8 | 295.4 |
| 100000 | three-dxf-viewer | cold/1 | 85.9 | 162.4 | 3089.3 | 3338.8 | 3338.8 | 5696.8 | 382.3 |
| 100000 | three-dxf-viewer | warm/1 | 0.2 | 59.4 | 3940.7 | 4000.6 | 4000.6 | 7435.4 | 382.5 |
| 100000 | three-dxf-viewer | cold/2 | 158.5 | 178.9 | 3560.4 | 3899.1 | 3899.1 | 5380.8 | 371.8 |
| 100000 | three-dxf-viewer | warm/2 | 0.1 | 41.6 | 2722.1 | 2764.5 | 2764.5 | 5192.8 | 386.4 |
| 100000 | three-dxf-viewer | cold/3 | 100.2 | 203.6 | 2960.5 | 3265.8 | 3265.8 | 4600.7 | 380.6 |
| 100000 | three-dxf-viewer | warm/3 | 0.1 | 43.1 | 3123.3 | 3167.0 | 3167.0 | 5488.1 | 390.2 |
| 100000 | three-dxf-viewer | cold/4 | 61.8 | 144.4 | 3108.0 | 3315.9 | 3315.9 | 5299.9 | 373.7 |
| 100000 | three-dxf-viewer | warm/4 | 0.2 | 14.1 | 3214.7 | 3229.8 | 3229.8 | 5866.8 | 391.2 |
| 100000 | three-dxf-viewer | cold/5 | 69.8 | 143.2 | 3410.1 | 3624.5 | 3624.5 | 5115.7 | 375.9 |
| 100000 | three-dxf-viewer | warm/5 | 0.1 | 45.7 | 2927.6 | 2974.3 | 2974.3 | 5398.9 | 383.3 |

### 해석 및 잔여 평가

- LINE 100,000 cold에서 전체 median은 dxf 918.3 ms / three 3338.8 ms, 확대→rAF는 191.7 / 5299.9 ms였다. 이 합성·SwiftShader 조건에서 three의 높은 draw-call 비용을 추가 조사할 근거가 된다. GPU present를 측정하지 않았으므로 원인 확정이나 업무 SLA 판단은 아니다.
- warm JS heap은 같은 document에서 직전에 실행한 다른 Viewer의 bundle·객체·GC 상태도 포함한다. 이를 해당 Adapter 단독 메모리 사용량이나 증분으로 비교하면 안 된다.
- 본 실행에서 dxf-viewer와 three-dxf-viewer의 통합 처리/heap/확대 관찰 값을 비교할 수 있다. 한글 JSON을 항상 읽는 three와 TEXT 없는 경우 font를 지연 로드하는 dxf의 초기 비용 차이도 포함되므로 이를 순수 parser 성능 차이로 해석하지 않는다.
- 확대 값은 합성 LINE 배치의 참고치이며 Pan 사용성/장시간 상호작용·실제 GPU 입력 latency의 정량 검증은 남는다. Unit 6의 자원 계수 시험과 이 heap snapshot만으로 memory leak 부재를 선언하지 않는다.
- POLYLINE/LWPOLYLINE/ARC/BLOCK/INSERT/MTEXT/DIMENSION/HATCH/SPLINE/Linetype와 업무 실도면 fidelity는 NOT RUN. 기존 LINE/CIRCLE/한글 TEXT 및 Layer 기본 시험은 U4/U5 참조. 업무 SLA와 실도면 미제공으로 사업장 적용성 판정은 보류한다.
- 기존 npm high 4, three 메인 스레드 parse/전역 material cache/약 25.8 MB font JSON 제약 유지. 계측 UI·harness 완료와 전체 P.O.C. 검증 완료를 구분한다. 다음 Unit 9A DXF 통합·회귀/릴리스 검증.

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

## Viewer 평가 현황 — U7B 반영

공식 조사 사실은 Architecture에 있으며 아래 표는 **실제 실행 결과**만 채운다. 단순 라이브러리 문서의 기능 소개를 이 표의 PASS로 옮기지 않는다.

| 항목 | dxf-viewer | three-dxf-viewer | libredwg-web 경로 |
| --- | --- | --- | --- |
| 정상 표시 / 기본 Zoom·Pan·Fit | PASS: 생성 LINE/CIRCLE | PASS: 생성 LINE/CIRCLE | U7B 등록 LINE/Zoom/Pan/Fit 확인; 전체 Entity 후속 |
| Resize / 재진입 / Dispose | PASS: U9A 20회 전환 자원 정리; 장기 누수 미평가 | PASS: U9A 20회 전환 자원 정리; 장기 누수 미평가 | NOT RUN |
| 장점 / 단점 / 발견 문제 | public API/Worker; U5 기본 font 연결 | Group/metadata 활용; 생략 Z 보완 필요 | 미평가 |
| Layer 조회 / On-Off | NOT RUN | PASS: Layer 0 | NOT RUN |
| Hover / Select / Entity 정보 / Snap | NOT RUN | NOT RUN | NOT RUN |
| 지원 Entity / 문제 Entity / fidelity | LINE/CIRCLE/한글 TEXT 확인 | LINE/CIRCLE/한글 TEXT 확인 | 미평가 |
| 대형 파일 / 사용성 / Browser | U8A LINE 10만 개 측정; >10 MiB/실도면 미평가 | U8A LINE 10만 개 확대 지연 관찰; >10 MiB/실도면 미평가 | 미평가 |
| WASM 초기화 / DWG revision / parsing / memory | 해당 없음 | 해당 없음 | U7A AutoCAD 2000 2개 샘플 parse/free 확인; 다른 revision/장기 메모리 미검증 |

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

## U-DELETE-20260911 — 삭제 비밀번호 보호 0.17.0

- 당시 `npm test` 17 files / 74 tests, production build, diff check가 통과했다. typecheck/lint는 최종 수정 전 실행 기록이므로 최종 snapshot 전체 통과로 해석하지 않는다.
- 정정: 당시 새 DELETE 통합 테스트는 salted hash 검증 및 기본 Current 삭제·순번 보존의 두 건이었다. 원본 정리 재시도·API 오류·Browser·실제 기존 DB backfill까지 통과했다는 이전 기록은 실행 근거가 없어 철회한다. repository가 비밀번호 인수를 사용하지 않는 누락도 후속 검토에서 발견했다.
- 0.17.0은 로컬 commit `1e5c5fd`/`09721ff`까지 생성했으며 당시 운영 DB backfill·GitHub push·GHCR 게시·Compose 배포는 미완료였다. DNS 실패 후 허용 환경에서 재시도하지 않아 원격 장애로 확정할 수 없었다.
- 후속 이슈 조치에서 인증된 fetch에 성공했고, 미게시 코드 보완 및 재검증을 수행한다. 실제 수용·게시·배포 결과는 이후 실행 기록을 기준으로 한다.
