# Issue #54 — E4 생성 개체 WCS 평행이동·다중 이동 (v0.40.0)

- 이슈: https://github.com/planner77/layoutManager/issues/54 · Epic #49
- 기준선: 2026-10-25 `main 3ff1f94b3fbf11737a827536e223114ea4ca0e96`, #51 E1 선택/#52 E2 Command·Document/#53 E3 삭제 이후.
- 근거: `AGENTS.md`, `out/Architecture.md`(루트 DESIGN.md 없음), `out/Requirements.md`, `out/Decisions.md` ADR-042/044/046, `out/Issue31.md`, `out/Issue43.md`, `out/Issue51.md`, `out/Issue52.md`, `out/Issue53.md`, `out/TestPlan.md`, `README.md`.
- 최초 지원은 유효 SHA/Version의 **DXF + three-dxf-viewer**, 브라우저에서 확정한 GENERATED Polygon/MultiPolygon/Hole. SOURCE·혼합·Worker Preview·DWG·다른 Renderer는 이동 금지.

## 분석 및 설계

기존 E2에는 검증된 `Translate(ids,dx,dy)`·stage/commit/UndoRedo와 Document 투영이 이미 있다. E4의 결손은 Canvas 제스처/preview와 WCS 수치 입력 UI이다. 기존 E1 `SelectionController`의 drag selection·Space Pan/ESC 계약을 보존하되 **단지 현재 이미 선택된 생성 외곽선의 경계 위에서, 생성 전용 모드, modifier 없는 5px 이상 이동**일 때만 이동으로 해석한다. 그 밖의 pointer는 이전 클릭/좌→우 포함/우→좌 교차 선택으로 유지한다.

1. **Domain/UI**: `domain/generated-translate.ts`에서 소수·부호·지수 표기의 WCS ΔX/ΔY를 엄격 파싱(공백/NaN/Infinity/비수치/둘 다 0/상한 초과 거부)하고, 현재 선택에 SOURCE/혼합/중복/stale/숨김/다른 scope가 있으면 **전체 거부**한다. `CadViewer`의 ΔX/ΔY 폼에서 단위는 DXF `$INSUNITS`로 표시하며 0/없음은 '단위 미상'으로 명시한다. 문서의 WCS 이동량은 CSS 픽셀·inch·mm로 환산하지 않는다.
2. **Gesture**: `SelectionController`가 이미 선택된 generated 경계 hit(`generated-hit-test.ts`, Hole 경계 포함)만 전용 드래그 후보로 지정한다. window pointermove/up, pointercancel/lostpointercapture/blur/ESC/Space/two-finger/camera Zoom·Fit·Resize/모드·선택 변경에 대응한다. 임계 미만은 기존 선택 처리, 진행 중에는 기존 선택 box 표시하지 않음; normal objects 모드에서는 SOURCE 우선/기존 box 선택 유지.
3. **Ghost/commit**: Three Adapter는 `screenToWorld`(canvas CSS rect→camera.unproject)로 시작/현재 포인터 WCS를 비교한다. 해당 선택의 Geometry/Bounds를 먼저 확인해 문서에 **stage(dx0)** 한 뒤 cyan **Scene-only Ghost Group**을 만든다. pointermove는 ghost 위치만 업데이트하고 Document·Undo/Redo·Tree·JSON을 변경하지 않는다. 유한/상한 이탈은 전부 취소한다. pointerup 때 **최종 선택을 재검증**하고 `document.stage(Translate)`→`commitPending(currentSelection)`을 단 한 번 수행한다. 바뀐 Geometry는 E2 기존 Document→Scene/Hit/Tree/JSON으로 전파하고 old GPU geometry/material 및 Ghost를 dispose한다. Preview 디버그 상태는 canvas `data-generated-drag-preview`에만 노출한다.
4. **Atomicity/복원**: group IDs 모두 동일 dx/dy, 기존 baseline과 kind/provenance/name/type/UUID/Version/SHA 보존. E2 `applyAffine`가 Polygon/MultiPolygon/Hole 전체 정점을 검증하며 bbox 및 generated hit-test는 변경 Document에서 재계산한다. 하나라도 invalid면 전체 명령·history 불변. Undo/Redo는 1단계, Tree focus는 새 결과 bounds 사용. Source index/Worker 재연산은 없음.
5. **수명/권한**: 생성 툴 ON/선택 모드 전환, zoom/fit, Escape, 포인터 손실, renderer/reload/dispose에서 preview·stage 즉시 해제. 세션 로컬 편집으로만 유지; DXF bytes/SHA/Source/Layer/Current·DB/API·서버 타입/권한 기능 불변. #31 P4 Canonical Attestation은 편집 좌표를 허가하지 않으며 서버 저장은 기존 승인 게이트 뒤로 유예. E5 회전/E6 편집 JSON Import/Snap/3D/Z/Grid/Scale은 제외.

## 수용·검증 매핑

| AC | 구현 근거 | 시험/상태 |
| --- | --- | --- |
| E4-AC1 (10,20)+(+3,-5)=(13,15), 그룹 상대 위치 | Numeric form→Manager→GeneratedDocument Translate | TC-E4-UNIT-001/002, E2E-001 **코드 작성, NOT RUN** |
| E4-AC2 Hole/MultiPolygon/bounds/hit/Tree/JSON/UndoRedo | Document immutable transform+Scene projection+generated dynamic hits | TC-E4-UNIT-002/004, E2E-001/003 **NOT RUN** |
| E4-AC3 drag preview/ESC/pointercancel/Pan/Zoom/AreaSelection | SelectionController gesture state + adapter WCS ghost/cancellation | TC-E4-UNIT-004, E2E-003, #31/#51 regression **NOT RUN** |
| E4-AC4 numeric/unknown units/invalid/source/mixed/Renderer/reload/Fullscreen | strict parser+scope gate+UI mode+scope lifecycle | TC-E4-UNIT-001/003, E2E-002, 현장 native/Touch **NOT RUN** |

## 배포/확인

- 브랜치 `feat/issue-54-generated-translate`. `src/package.json`/lockfile `0.40.0` (UI 기능 릴리스)·Prisma DB 스키마/Compose/GHCR 설정 변경 없음.
- 새 Test: `src/tests/unit/generated-translate.test.ts` (4케이스), `src/tests/e2e/issue54-generated-translate.spec.ts` (3케이스). 기존 `generated-document`, `generated-hit-test`, `generated-delete`, `issue31/40/43/51/52/53` 및 Core/Legacy 회귀 요구.
- **테스트 검증 사실:** 연결 환경에서 local clone 자체가 DNS로 실패하여 `npm ci`·Typecheck·Lint·Vitest·Build·Playwright·실도면/실 GPU/native fullscreen **NOT RUN**. 문서/테스트가 구현됨을 CI PASS로 간주하지 않는다. PR 개설은 PR CI 실행 트리거이며 결과 모니터링/병합/GHCR/이슈 종료는 이번 요청에 포함되지 않는다.
