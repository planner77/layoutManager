# PR/Main CI 실패 원장

## Issue #40 / PR #48 — 최초 PR CI ESLint 차단 및 P2 리뷰 보완 (2026-10-25 KST)

- **확인된 실패:** [PR #48](https://github.com/planner77/layoutManager/pull/48), [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671) (`pull_request.opened`, attempt 1, HEAD `850ded81fcd0d27267a5c38ac9bcff1a980ac39b`) = `completed/failure`. [verify Job 121036582144](https://github.com/planner77/layoutManager/actions/runs/40149077671/job/121036582144)의 **step 7 ESLint**에서 `src/features/cad-viewer/viewer.tsx:404:186`에 `react-hooks/refs` **error**(`Cannot access refs during render`; `Passing a ref to a function may read its value during render`), 같은 파일 363:6의 `react-hooks/exhaustive-deps` **warning**(`resetOutline` 의존성 누락). ESLint exit 1이 직접 CI 실패 원인.
- **근본 원인:** U3 변경으로 `resetOutline`이 Ref(`outlineEnabledRef`, `manager.current`, request revision)를 읽는 코드가 되었으나 Renderer 선택 `choose(value)`의 간접 호출 및 JSX render 단계 `[...].map`에 연결되었다. React Hooks refs lint가 render 단계의 잠재적 Ref 접근으로 차단했다. `resetOutline`이 매 렌더마다 새 함수인 채 load effect에서 사용되어 의존성 경고도 발생.
- **Job 사실 구분:** 첫 Run의 npm ci/Prisma Client 생성/TypeScript **PASS**, ESLint **FAIL**. Unit/Integration, 1k/10k/100k benchmark, Production build, Chromium 설치/E2E, Legacy migration E2E는 **SKIPPED**(시도되지 않음). 별도 [Docker runtime Job 121036582209](https://github.com/planner77/layoutManager/actions/runs/40149077671/job/121036582209)는 **SUCCESS**. 도커 성공을 Renderer/Worker/E2E 성공으로 확대 해석하지 않음.
- **별도 Review (CI 실패 자체와 구분):** [P2 inline comment #4369181241](https://github.com/planner77/layoutManager/pull/48#discussion_r4369181241)는 `SelectionController`의 `window keydown capture`가 `button` 포커스에서 Space를 `preventDefault()`하여 ON 이후 Space로 OFF 불가한 키보드 결함을 지적. ESLint failure의 직접 원인은 아니며 테스트는 SKIPPED 상태여서 관측된 E2E 실패로 보고하지 않는다.
- **보완(코드 commit [`0ba21a66`](https://github.com/planner77/layoutManager/commit/0ba21a66e02c5a842e527ececdb678f447940a8f)):** `stopOutlineEditing/resetOutline/choose`를 안정적인 `useCallback`으로 분리, `resetOutline`을 load effect dependency에 명시하고 Renderer 버튼의 render `map` 우회(두 explicit button)로 ref 전달 경로 제거. Space Pan 핸들러는 실제 **비대화형 대상**에서만 키를 가로채고 버튼/메뉴·링크·요약은 native Space 동작을 유지. 기존 선택 ESC·캔버스 Space Pan은 변경하지 않음. E2E `TC-U3-E2E-001`(Enter ON → Space OFF → Space ON) 및 `TC-U3-E2E-002`(캔버스 Space+drag 후 선택 0, fit → 정상 선택)를 보강.
- **재검증/상태:** 수정 HEAD의 로컬 npm/lint/Unit/Playwright/Build/현장 CAD 검증은 네트워크·환경 제약으로 **NOT RUN**. Git 객체 commit 작성만으로 PR CI가 재실행되지 않으므로 **최종 문서 commit까지 생성한 뒤 브랜치 fast-forward 갱신 1회**로 `pull_request.synchronize` PR CI를 자동 시작한다. 새 Run ID/결과는 시작 직후 확인하되 완료 모니터링은 사용자 지시에 따라 생략한다.

### 누적 실패 요약 테이블 추가 행

| 날짜(KST) | Issue / PR / Run | 실패·취소 또는 현재 상태 | 근거와 원인 | 조치·커밋 | 새 CI / 검증 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-25 | #40 / [PR #48](https://github.com/planner77/layoutManager/pull/48) / [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671) (attempt 1, HEAD `850ded8`) | **FAIL**: TypeScript PASS, ESLint FAIL(error 1/warning 1), Unit·Build·E2E SKIPPED; Docker-runtime PASS | [verify Job 121036582144](https://github.com/planner77/layoutManager/actions/runs/40149077671/job/121036582144) `viewer.tsx:404:186 react-hooks/refs`; `363:6 exhaustive-deps`. 별도 P2 Space keyboard review | [fix `0ba21a66`](https://github.com/planner77/layoutManager/commit/0ba21a66e02c5a842e527ececdb678f447940a8f) callback/ref/render 분리, Space focus guard, E2E 강화, 문서·원장 기록 | 새 head 브랜치 `pull_request.synchronize` PR CI 시작; 새 HEAD 검증 전 **NOT VERIFIED**, 완료 모니터링 제외 |


실패를 관측한 경우 아래 템플릿에 **실제 Run URL, job/step, log 증거, 원인/수정 Commit, 재실행 Run, 결과**를 누적 기록한다. 취소된 실행은 실패와 구분해 보존한다. 미실행 테스트는 성공으로 표기하지 않는다. 이 파일은 #38부터 사용하는 신규 공통 원장으로, 기존 이슈별 실패 기록은 역사적 `out/TestReport.md`와 개별 Issue 문서를 참조한다.

| 날짜(KST) | Issue / PR / Run | 실패·취소 또는 현재 상태 | 근거와 원인 | 조치·커밋 | 새 CI / 검증 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-25 | #45 / [PR #46](https://github.com/planner77/layoutManager/pull/46) / [Run 40142618328](https://github.com/planner77/layoutManager/actions/runs/40142618328) (attempt 1, HEAD `1a35b089`) | **FAIL**: Typecheck PASS / ESLint FAIL, Unit·Build·E2E **SKIPPED**; Docker-runtime PASS | [verify job 121017338197](https://github.com/planner77/layoutManager/actions/runs/40142618328/job/121017338197) `src/app/masters/page.tsx:8:67,8:73` `react/no-unescaped-entities` (2 errors). 별도 [P2 review](https://github.com/planner77/layoutManager/pull/46#discussion_r4368927952)는 미실행 E2E `upload.spec.ts`의 비Current row 선택 회귀를 지적 | [fix `69e6b175`](https://github.com/planner77/layoutManager/commit/69e6b17548f35c248c700c5526e9993fc3eaf7c7): JSX `&apos;` escape 및 비Current 이력은 Location 상세에서 Current 지정하도록 E2E 수정; 본 원장 포함 문서 커밋 추가 | `feature/issue-45-current-only-list` 신규 HEAD push/synchronize로 PR CI 자동 시작. **결과 미확인, 모니터링 생략** |
| 2026-10-24 | #38 / PR 미생성 시점 | **CI 착수 전, 실패 관측 없음** | 신규 U1 코드·문서, 로컬 test 미실행. 첫 CI 로그 미확보 | 기능 브랜치 `feat/issue-38-viewer-app-shell`; unit/E2E 회귀 추가 | PR 생성 시 `pull_request.opened`로 PR CI 자동 시작; 결과 모니터링/성공 판정하지 않음 |

## Issue #45 / PR #46 — 최초 CI 실패 및 예방적 리뷰 보완 (2026-10-25 KST)

- **Failure record (실제 실패):** [PR CI #40142618328](https://github.com/planner77/layoutManager/actions/runs/40142618328), attempt 1, `pull_request`, HEAD `1a35b089ce1b42c290230532ccc57c4cc5c2d24f`, completed/**failure**. [verify job 121017338197](https://github.com/planner77/layoutManager/actions/runs/40142618328/job/121017338197) 의 step **ESLint 검사 #7**에서 `src/app/masters/page.tsx:8:67`, `8:73`: `react/no-unescaped-entities` (apostrophe 2건), exit code 1. 해당 JSX 신규 설명 문구의 리터럴 `'버전 이력'`를 escape하지 않은 것이 직접 원인. 기존 앱 로직, Docker, TypeScript 오류는 이 Run에서 실패 원인이 아님.
- **Step 분리:** `npm ci`, Prisma Client 생성, TypeScript는 **PASS**; Unit/Integration, DXF benchmark, production build, Chromium 설치/E2E, legacy migration E2E는 **SKIPPED/NOT RUN** (ESLint 단에서 차단). 독립 Docker-runtime Job `121017338052`는 **SUCCESS**. npm audit 13건 및 Node deprecation 경고는 현재 종료 코드를 만든 직접 원인이 아니며 이 이슈에서 자동 업그레이드하지 않음.
- **Review finding (관측된 CI 실패가 아닌 사전 회귀):** [P2 inline review #4368927952](https://github.com/planner77/layoutManager/pull/46#discussion_r4368927952)는 `TC-ISSUE-001/LIST`가 `makeCurrent=false`로 등록한 `issue-one.dxf`를 홈에서 검색/Current 지정하려는 종전 흐름이 #45의 Current-only 계약에서 성립하지 않는다고 지적. 최초 Run에서 E2E는 **실행되지 않았으므로 E2E 실패라고 단정하지 않음**.
- **수정:** [commit `69e6b17548f35c248c700c5526e9993fc3eaf7c7`](https://github.com/planner77/layoutManager/commit/69e6b17548f35c248c700c5526e9993fc3eaf7c7) — `src/app/masters/page.tsx`를 `&apos;버전 이력&apos;`로 변경; `src/tests/e2e/upload.spec.ts`에서 홈은 Current인 `issue-two`만 표시하는지 확인 후 해당 Current 행의 Location 링크를 열어 `issue-one`을 지정, Current 원자적 교체·reload·API 조회 회귀를 보존. 리뷰 thread의 검토/해결은 해당 PR 증거에 따라 진행.
- **검증 경계:** 새 HEAD에 대해 로컬 npm/Playwright/Build를 실행하지 않았으므로 **NOT RUN**; PR CI 새 Run도 시작 직후에는 PASS로 표기하지 않는다. 사용자의 '새 PR CI 시작, 모니터링 생략'에 따라 branch fast-forward push 후 `pull_request.synchronize` 자동 실행을 트리거하고 Run만 확인. 새 Run ID/실패 반복 여부는 추후 후속 요청 시 여기에 추가한다.

## 기록 템플릿

- Issue/PR/Head SHA/Run URL/Attempt:
- 상태: FAIL / CANCELLED / SKIPPED / BLOCKED / NOT RUN
- 실패 Job·Step / 원문 Error / 로그·Artifact 출처:
- 근본 원인 / 재현 / 영향·다른 원인 배제 근거:
- 수정 내용·Commit / Reviewer Thread / 충돌:
- 실행한 로컬 시험과 결과 / 미실행 사유:
- 다시 시작한 CI Run / 종료 판정:

## Issue #38 / PR #44 코드 리뷰 보완 기록 (실패 아님)

- **기존 성공**: [PR CI #40077595050](https://github.com/planner77/layoutManager/actions/runs/40077595050), head `a2b8bbdf5ca8ed422e934907087cf919a0e4a783`, 2026-10-24 완료: `success`.
- **실패 원인으로 오기하지 말 것**: [P1 review #4366517148](https://github.com/planner77/layoutManager/pull/44#discussion_r4366517148)은 CI 실패가 아닌 키보드 이벤트 중복 소비 논리 버그 보고. `SelectionController` capture에서 `event.preventDefault()`된 ESC를 `CadTextSearch`가 다시 처리해 검색을 닫음.
- **보완**: `CadTextSearch` root/input ESC 분기에 `!event.defaultPrevented` 조건을 추가하고 `TC-OUT-E2E-001`로 선택/검색/CSS 각 1회 소비를 검증. 새 HEAD 재검증 전에는 성공 판정 금지.
