# Issue #82 — CAD Memo M1 / WCS 브라우저 세션 메모

## PR #111 — Main 정렬 후 U1 그룹 메뉴 E2E ARIA 1건 수정 (2026-10-28 KST)

- [CI 40512645193](https://github.com/planner77/layoutManager/actions/runs/40512645193), HEAD `89a72018403ebfca32e382e0f04511a95d1946ae`: Chromium E2E **91 PASS/1 FAIL**; Verify Job 122218176649 실패 단계 E2E, Typecheck/Lint/Unit·Integration/OCI/Benchmark/Build PASS, Legacy Migration E2E SKIPPED. Docker Job 122218177009 PASS. Trace 12739315008.
- 실패 위치 `issue38-app-shell.spec.ts:41`: 정상 enabled `작업 > 메모 추가/편집`에서 `aria-disabled="false"` 속성이 없는 것을 장애로 오판. #127 `ViewerCommandMenus`의 `command.disabled || undefined` 정책에 맞춰 E2E를 `toBeEnabled()` 및 dxf-viewer `toBeDisabled()`로 최소 수정. M1 WCS 메모/Renderer 제품 코드·App 0.42.1 변경 없음.
- 기존 P1/P2 리뷰 2건 Resolved, Main behind 0/mergeable true; 수정 HEAD의 CI/최신 Codex 리뷰 성공은 별도 관측 전 **NOT VERIFIED**. 메모 영속 M2 #83, 운영 G7·DB/API, GHCR 게시·Issue 종료 없음.

## 2026-10-27 — 최신 Main(0.42.1) 정렬, Issue #127/#138 통합

- PR #111의 M1 WCS/임시 세션 로직을 보존하면서 Main `d2b77dd6535503f2d980ac563cc195cc8b4c128e`을 2-parent merge 방식으로 취합. 기존 README/AGENTS/실패 원장 최신 #142 및 #57 정책 유지.
- #127 UI: 독립 상단 '메모 추가' 버튼 대신 `작업 > 메모 추가/편집` 명령이 도구 Drawer를 열도록 통합. 메모 핀은 캔버스에 유지되며 Editor는 사용자가 열고 닫을 수 있는 Drawer 내부에서만 표시한다. #138 ViewerPanelPolicy의 실제 floating drag는 별도 구현 전으로 표기.
- 기존 Codex P1/P2 2건 Resolved(재정렬 후 새 HEAD 리뷰 승인은 아님). 과거 PR CI 실패 Run 40196496297·40198344153 이력은 FailureLedger에 누적, 새 HEAD는 PR CI `NOT VERIFIED`.
- 이 통합은 서버 `CadMemo` API/Prisma/Auth, 실 CAD·S3, G7 Owner GO, GHCR, 본 이슈 종료를 포함하지 않는다.


## #99 최신 main 통합과 ADR 재번호화 (2026-10-25)

- #99 main d85b86ab의 비공개 실 DXF evidence 게이트/검증 CLI·private acceptance Browser/Unit 및 신규 `verify:outline-acceptance` package script는 보존한다. #99 실DXF 의사결정이 ADR-052를 소유하므로 이 Issue #82 메모 M1의 설계 ADR만 **ADR-053**으로 변경한다.
- 기존 main 0.40.3 후보보다 뒤 버전인 Memo M1 후보 0.41.0을 app·lock root에 적용하되 신규 실제 릴리스/GHCR 게시 완료로 주장하지 않는다. #99/#113 실DXF/GPU/Owner 수용, #83 서버 영속 Auth/Prisma는 별도 미완 게이트다.
- #99 병합 이후 U1/M1 shared dock 테스트와 새로운 P0/P5 순수 게이트 Unit을 포함한 최신 HEAD의 PR CI 결과를 다시 검증해야 한다. 앞선 40198344153 Run의 E2E 77/78은 구 HEAD 근거이다.


## PR #111 — 두 번째 CI E2E U1/M1 공존 계약 교정 (2026-10-25)

- [Run 40198344153](https://github.com/planner77/layoutManager/actions/runs/40198344153), HEAD ac9226ff2e2c619bc009dd8bf293c3f26c22dc44. Typecheck/ESLint/Vitest/OCI manifest/DXF source synthetic benchmark/Production Build 및 Docker Job **SUCCESS**. Chromium Playwright 78건 중 **77 PASS / 1 FAIL**, Legacy E2E SKIPPED. 원본 증거/Job/trace ID는 [FailureLedger](FailureLedger.md) 참조.
- 실패: `TC-U1-E2E-001`의 도크 0개 단정은 U1/U3 전용 시절 계약. U1 합성 DXF는 Stable Handle이 없어서 Outline 버튼 및 객체 선택 도구는 여전히 비활성이나, #82 새 Memo M1은 free WCS anchor이고 안정 Handle이 필요 없으므로 **Memo status Dock 1개가 정상**.
- 개선: `issue38-app-shell.spec.ts`에서 shared dock 존재 여부 대신 **기능별 계약**(Outline disabled/선택·생성 tools 없음/Memo status 0·Memo 버튼 enable/비지원 Renderer disable)을 검증. `TC-M1-E2E-006` 신규 독립 no-Handle DXF에서 WCS(10,20) 메모 작성·Zoom/Fit·원본 선택 불가 동시 확인. 기존 Viewer/Layer/Resize/ESC 및 Memo E2E-001~005 회귀는 유지. 제품/UI/Server/API/Prisma 코드 변경 없음.
- 새 HEAD의 테스트 PASS/실 CAD/GPU/native/fullscreen 수용은 별도. #83 Memo 영속과 #96 운영 인증 활성화는 계속 BLOCKED.


## PR #111 — 첫 CI 실패와 P1/P2 리뷰 대응 (2026-10-25)

- [CI Run 40196496297](https://github.com/planner77/layoutManager/actions/runs/40196496297) 기존 HEAD `1515eca`, Verify Job ESLint 오류 2건으로 failure(React `react-hooks/refs`, Playwright E2E `prefer-const`), TypeScript SUCCESS, 나머지 Verify Unit/Build/E2E/Legacy SKIPPED. Docker Job SUCCESS. Reviewer finding P1 #4370961641(기존 메모 모드 중첩), P2 #4370961642(Drag synth click 초안 초기화). 위 세 가지는 서로 구분.
- **교정:** `beginMemoInteraction`를 새 배치·기존 PIN pointerdown·최근 목록의 단일 경계로 도입, Outline Worker/선택/Generated pending 취소+Pan 전환. `ignoredDragClick`은 drag click만 소비, 키보드/정상 선택 유지; 같은 memo 재선택 초안 불변. JSX render 안 ref 접근 삭제, let→const/unused suppression 제거.
- **추가 시험:** `TC-M1-E2E-004/005` 등 기존 E2E/Unit/Typecheck/Lint/Docker 전부 새 HEAD CI가 필요. 별도 실 CAD/native/GPU 수용 미실시. 이전 HEAD CI 결과와 수정 HEAD CI 성공 혼동 금지. 이슈 종료/병합/GHCR 게시 미실행, #83 서버 Memo 영속 운영 게이트 BLOCKED 유지.


- **원 이슈:** https://github.com/planner77/layoutManager/issues/82
- **Epic:** #81 / **선행:** #25/#38 ViewerAppShell, #51/52 객체 선택·생성, #26 WCS focus, #54 이동; **후속:** #83/#84/#85/#86/#88/#90
- **설계:** DESIGN.md 없음; `AGENTS.md`, `out/Architecture.md` 및 ADR-053(Decisions.md)를 우선.
- **계획/개발:** `feat/82-cad-memo-m1`, 2026-10-25. 현행 버전 0.40.2 기반 기능 추가 → 신규 0.41.0 예정. 원격 GitHub 커넥터 코드·문서 작성, PR CI 시작까지만 진행(사용자가 모니터링 생략 지시).

## 현재 요구/범위 계약

이번 M1은 **세션 내 독립 메모**만 구현한다. 메모는 도면 Version ID 및 64자리 SHA와 함께 WCS XY 좌표에 고정된다. `{id, versionId, sourceSha256, anchorWcsXY:{x,y}, labelOffset:{x,y}, title,content,textFormat:'plain',createdAt,updatedAt}`이며 id는 암호학적 UUIDv4 *로컬 키*, `CadMemo.id` 영속·작성자/수정자 인증 ID·권한이 아니다.

- DTO/정책: 최대 메모 100개, 제목 NFC/trim 1~100자(한 줄 필수), 본문 0~2000자(개행 허용), C0/C1 제어문자 거부, CRLF→LF. WCS X/Y finite·절대값 1e12 이내, 버전 UUIDv4·SHA64 검증, 임의 HTML/Markdown 실행 없이 React plain text node.
- Canvas: DXF `three-dxf-viewer` loaded state에 상단 `메모 추가` 메뉴 활성. 클릭 또는 좌표 직접 입력으로 새 anchor 후보 → 사용자가 제목·본문을 작성한 뒤 확인. Pin 24 CSS px hit, label은 pointer-through, 160자 미리보기, CSS px offset(기본 14,-12) 독립.
- 편집: 선택한 pin 클릭 후 텍스트 저장은 anchor 변경 **0**. 위치 이동은 수치 필드 `위치 이동 적용` 또는 5px 이상 pin drag pointerup만 commit. Drag preview는 Session 문서를 변경하지 않고 ESC/resize/camera/wheel/scroll/blur/pointercancel/lostcapture/context/Version·SHA·Renderer 전환은 폐기.
- Dock UX: #40 outline ON은 memo add 진입 때 끄고 preview/selection 취소; #49 Generated selection으로 전환 시 memo edit UI 닫기. SavedOutline Tree/Source hit와 독립, 사용자가 memo pin 클릭한 경우에만 이벤트 선점. 도면/레이어/Source/Current·GeneratedDocument/Undo/JSON은 불변.
- 수명: 메모리 전용 session, Renderer·Version·SHA 변경/reload/페이지 이탈 시 삭제, 사용자에게 명시 안내. 타 Version 오표시 없음. 앱 서버 계정/CRUD, DB, 감사, 외곽선 영속화 구현 금지.

## 구현 설계/작업 단위

1. `src/domain/cad-memo.ts`: 유효 범위와 수정 명령 분리, createdAt immutable, updatedAt 매 커밋 시 갱신, max capacity 100, 명시 `clear()`.
2. `src/viewers/core/adapter.ts` / `src/viewers/three-dxf-viewer/adapter.ts`: 활성 Canvas CSS viewport ↔ world Orthographic 좌표 변환; invalid/nonfinite/no adapter fail-closed. `onViewChange` 알림은 RAF로 UI 투영 갱신, WCS 데이터 변경 금지.
3. `src/features/cad-viewer/`: `CadMemoOverlay` pointer capture/epoch rollback 및 `CadMemoEditor` 분리 텍스트·좌표 커밋; `ViewerMenuBar` 지원 게이트와 `viewer.tsx` 내 세션/도구/ESC/리로드 정리.
4. Unit `cad-memo.test.ts` TC-M1-UNIT-001~006; Playwright `issue82-cad-memo.spec.ts` TC-M1-E2E-001~003; opt-in `tests/benchmark/issue82-memo-large.benchmark.ts` TC-M1-BENCH-1000/10000 synthetic 1k/10k DXF 로드·5 pin 배치·Resize/Reload 계측(성능 SLA 미설정), 기존 viewer/outline/generated/legacy/DXF/실 CAD 검증.
5. AGENTS/Architecture/Decisions/Requirements/TestPlan/TestReport/README/ChangeLog 동기화. 서버 DB `out/Database.md`는 M1 모델이 영속 테이블을 추가하지 않으므로 기존 계약 유지.

## AC 추적 / 판단

| 원 이슈 AC | 구현/시험 | 현재 판단 |
| --- | --- | --- |
| M1-AC1 | WCS (10,20)→Zoom/fit/CSS fullscreen→명시 move (13,15)→텍스트 수정에도 위치 불변. `TC-M1-UNIT-002`, `E2E-001`; Native는 현장 | CODED, 검증 NOT RUN |
| M1-AC2 | ESC/실패/휠/viewport/cancel, 유한·허용 범위 밖/다른 scope mutation 0. UNIT-003/004, E2E-002 | CODED, 검증 NOT RUN |
| M1-AC3 | Outline 생성 ↔ Memo 도구 독점, Generated Source/Selection/Layer 보호, 기본 Fullscreen·작은 화면/키보드 | CODED, E2E-003. 실제 모바일/Native UX 별도 |
| M1-AC4 | Reload·Renderer·Version 변경 소멸 및 경고, 실제 CadMemo DB/API/작성자 연동 없음 | CODED, E2E-002/003. 실제 인증 없음 |
| M1-AC5 | Node/Vitest 6 + Playwright Synthetic 3, 기존 CI 전체 회귀·대형 DXF·실 CAD/GPU | 코드 작성, 실행/실측 NOT RUN |

### 정적 안전 경계 및 알려진 제한

- 브라우저 메모는 리로드·Renderer 전환 시 **사용자 작성 텍스트가 사라지는 임시 기능**이다. 운영 데이터 저장 아님. 동시 편집·저장 전 경고/복원은 M2 별도.
- 메모 내용과 label offset은 plain text/SVG가 아닌 DOM/CSS; 다른 Renderer에서 위치 정확도 보장하지 않는다. Native Fullscreen/실도면/WCS 고좌표 수치 정밀/대형 DXF GPU 성능은 시험 전이다.
- 가변 높이 Label은 Canvas 위에 렌더되지만 `pointer-events:none`; PIN 근방 24px만 메모 선택이므로 실제 Source onPin hit와 우선순위 의도가 일치하는지 실현장 UX 확인 필요.
- 허용 SHA 문자열 형식 검증은 실제 immutable file/SHA validation이 아니다. #96/#83 인증 데이터/권한, #98 Outline 서버 영속과 혼동 금지.
- 기존 실패 원장 `out/FailureLedger.md`에는 **관측된** CI 실패만 추가한다. 아직 CI 성공/실패를 확인하지 않았으므로 실패 원장에 상상 기록 금지.

### 실행 상태 / 남은 게이트

- 원격 GitHub 연결로 코드·시험·문서 커밋. 이 세션의 container는 `git ls-remote` GitHub DNS 실패로 local checkout 불가; 실제 npm Typecheck/Lint/Unit/Build/Chromium E2E/Legacy/Docker·실 DXF/GPU/Native는 전부 **NOT RUN**.
- PR 생성 시 GitHub PR CI 트리거 확인까지만 수행하고 Run 완료 결과를 모니터링하지 않는다. **PR CI 시작 ≠ 성공/QA 완료/릴리스**.
- Issue #82 종료·Merge/GHCR 게시/운영 사용 승인은 사용자 후속 CI 성공 및 요구 수용 확인 단계에서 별도.
