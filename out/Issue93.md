# Issue #93 — 도면 목록 Current 기본 유지 및 이전 버전 표시·검색 복원

- 요청/이슈: https://github.com/planner77/layoutManager/issues/93
- 기준일: 2026-10-25 / 대상 버전 `0.40.1` (기존 기능 회귀 수정/PATCH)
- 작업 기준: `main 14111b45a36907245342751d9d1a139b5215474d` → `fix/issue-93-drawing-history-search`
- 설계: `AGENTS.md`, `out/Requirements.md`, `out/Architecture.md`, `out/Decisions.md` ADR-034-R1. 별도 `DESIGN.md`는 저장소에 없음.
- 현 단계: 코드/테스트/문서 작성 및 원격 feature branch 갱신. 로컬 테스트·CI 성공·병합·GHCR **미검증**.

## 1. 배경과 기존 계약

- #8: `현재 버전만 표시` 토글, ON=Current, OFF=전체, 당시 기본 OFF.
- #16: 중복 Current 드롭다운 제거. 공용 `listQuery`/API `current=false`(비Current만) 보존.
- #24: 사업부→제품→사업장/법인→동→층. 한 Location에 Current 0~1개; 숫자가 가장 큰 Version과 Current가 다를 수 있음.
- #45: 홈 서버에서 `currentOnlyListParams()`로 항상 `current=true` 강제, 토글 제거. 층 상세를 거치지 않는 과거 도면 검색이 불가능해진 직접 원인.
- **#93 결정:** 홈 기본값만 Current-only로 유지하고 토글 OFF에서 이전 Version도 목록·검색에 포함. 데이터 삭제/버전 자동 승격·DB 변경 금지.

## 2. 설계·구현

| 구성 | #93 계약 |
| --- | --- |
| `src/domain/cad-list.ts` | `drawingListParams`로 URL 검증·정규화. 기본/홈 current=true → 현재만. `versions=all`/레거시 홈 `current=false` → 공용 리포지토리에 `current=''` 전달(모든 버전). `versions=all&current=true`, 중복/불법 값은 INVALID_QUERY. |
| `src/domain/cad-list.ts` | `drawingListUrl`이 mode=all을 `versions=all`로 직렬화하고 page/query·pageSize 보존; `current=false`를 홈 표시 링크에 쓰지 않음. |
| `src/app/page.tsx` | 서비스 검색은 정규화된 params, total/pages/표/빈 상태가 실제 모드와 일치. ON은 Current, OFF는 전체 안내. 페이지 링크는 같은 mode 유지. |
| `src/features/cad-list/list-filters.tsx` | 하나의 카드에 **서로 독립된 두 GET form**(검색/토글)을 사용. 검색폼은 OFF에서 hidden versions=all, 토글폼은 정규화된 기존 검색 조건·pageSize를 hidden으로 보존하고 page를 생략해 첫 페이지로 복귀. 단일 Button aria-pressed와 ON/OFF 문구. |
| `src/features/cad-list/cad-table.tsx` | 기존 Current/이전 배지·Viewer/다운로드/링크/CurrentButton 동선을 **그대로 재사용**(파일 수정 불필요). |
| 외부 API/DB | `listQuery`/`GET /api/cad-files?current=false`의 *비Current만* 조회 의미 및 `CadLocation.currentVersionId`·원본 파일/Prisma 스키마 불변. |

### 시나리오 예제

Location A의 `V1=이전 / V2=Current / V3=이전`, Location B의 `V1=이전(Current 미지정)`일 때:

| 홈 요청 | 화면에 표시 | 비고 |
| --- | --- | --- |
| `/` | A V2 | 초기 토글 ON |
| `/?versions=all` | A V1,V2,V3 + B V1 | 토글 OFF / 전체 버전 |
| `/?current=false` | A V1,V2,V3 + B V1 | **홈 레거시** 호환만 |
| `/api/cad-files?current=false` | A V1,V3 + B V1 | **외부 API는 비Current만** |
| `/?versions=all&filename=old` | 이전 파일명 조건에 맞는 모든 Version | 나머지 검색 조건 AND |
| `/?versions=all&current=true` | INVALID_QUERY | 명시적 충돌 거부 |

## 3. 수용 기준 및 추적

| AC | 기대 | TC |
| --- | --- | --- |
| AC1~3 | 기본 Current, OFF 전체/미지정 Location, 번호와 Current 독립 | TC-LIST-093-001/003, E2E-001 |
| AC4 | 이전 전용 파일명·설명/위치/형식 조합 검색 | TC-LIST-093-003, E2E-001/002 |
| AC5 | 모드 토글과 검색·페이지·Back/Reload·초기화·pageSize 보존 | TC-LIST-093-001, E2E-002 |
| AC6 | API와 홈 레거시 분리, 중복·미지원 입력 거부 | TC-LIST-093-001/002, E2E-001 |
| AC7~8 | 이전 버전 직접 열람·다운로드/Current 재지정/삭제 및 데이터 무결성 | E2E-001, Workflow/Upload/Link 및 기존 API |
| AC9 | TS/Lint/Unit/Integration/E2E/Build/필수 Legacy/Docker CI와 문서 | PR CI 증거, TestReport |

## 4. 테스트/배포 및 안전 경계

- 시험 코드: `src/tests/integration/list.test.ts`, `src/tests/e2e/current-only-list.spec.ts`, `workflow.spec.ts`, `upload.spec.ts`. #45 이전 기대를 정책 변경에 맞게 수정하고 #8/#16 Current 토글 회귀를 추가했다.
- 사전 검증 명령: `cd src && npm ci && npm run db:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e && npm run test:master-migration`. 이미지/Compose CI 및 실제 도면 평가 별도.
- **NOT RUN / NOT VERIFIED:** 이 대화의 GitHub Connector에는 원격 repository write 기능이 있지만 runner 컨테이너는 `github.com` DNS 접근 실패로 checkout/npm/Playwright/실 CAD/GPU 검증 불가. PR CI는 사용자의 지시대로 시작만 하고 결과 모니터링하지 않는다. 어떠한 통과 건수나 GHCR 게시도 선행 주장하지 않는다.
- 변경 불변: 외부 API Current 필터, 스키마/마이그레이션, CAD bytes/SHA, Location 단일 Current, 인증·권한, DWG 제한 렌더러, 배포 이미지 정책.
- #45/#8/#16 문서는 과거 의사결정 추적을 보존하되 각각 최신 #93 정책 링크를 추가했다. 실패 확인 시 `out/FailureLedger.md`에 실제 Run/Job/HEAD/근거를 남겨야 한다.
