# Issue #39 — 상단 레이어 메뉴 / FullscreenLayerPanel 단일 상태 U2 (v0.32.0)

> 후속 #127: [Issues124-126-127](Issues124-126-127.md)/ADR-053의 보기 그룹 메뉴와 좌 Drawer가 레이어 표시 UI를 대체한다. Drawer open과 실제 CAD Layer visibility는 계속 독립이다. 아래는 U2 당시 설계/시험 기록이며 신규 구현 검증은 TestReport의 #124/#126/#127 결과를 따른다.

- 이슈: https://github.com/planner77/layoutManager/issues/39
- 상위 Epic: #37. 선행 #38 (ViewerAppShell) 및 #17 (DXF 레이어 조작, 완료). 참고 #25(CSS/native fullscreen), #26(검색), #31(선택/외곽선).
- 기준: main `0e11f957` (v0.31.0) → `feat/issue-39-layer-panel-toggle`.
- 구현: 코딩/자동 회귀 시험 추가. **PR CI 및 로컬 npm/브라우저 실행 증거 확보 전이므로 NOT RUN/NOT VERIFIED**. 실제 통과 여부는 `out/TestReport.md`에 별도 기록한다.
- 버전: 새 Viewer U2 기능에 해당하므로 0.31.0 → 0.32.0 (SemVer MINOR). `src/package.json`, `src/package-lock.json`의 루트 버전 메타데이터 동기화. 외부 의존성/DB/API/migration/CAD 원본 불변.

## 요구사항 분석과 경계

1. #38의 `ViewerAppState.layerPanelOpen`을 유일한 UI 열림 상태로 사용한다. 메뉴 `toggle-layers`, 패널 `close-layers`, Renderer/reload 시 `reset`은 동일 reducer를 사용한다. `FullscreenLayerPanel`에 독립 collapsed state를 추가하지 않는다.
2. `selectedLayers`는 CAD layer visibility 상태로 `CadViewer`가 따로 소유하고 `ViewerManager.showLayer()`로 반영한다. 패널 숨김은 `selectedLayers`, `showLayer()`, Canvas, ViewerManager/Adapter 생성, Source GET, Zoom/Pan/Fit, 선택/외곽선 상태를 변경하지 않는다. 전체 선택/해제는 패널 내부 기존 버튼만 사용한다.
3. 가능한 경우(`isFullscreen && three-dxf-viewer && layers.length > 0 && ready`)에만 왼쪽 도크를 제공한다. 최초 표시 상태는 `layerPanelOpen=true`. 메뉴는 `aria-expanded/aria-pressed`와 `aria-controls=viewer-layer-dock`을 설정한다. **숨긴 후에도 도크 호스트 요소를 유지**해 aria-controls 대상이 사라지는 문제를 피한다. 실제 내부 패널은 닫힘 시 unmount되므로 키보드/스크린리더에서 숨김 상태이다.
4. 패널 내부 **접기** 버튼이 사라질 때 사용자의 포커스를 지속 존재하는 상단 메뉴 버튼으로 옮긴다. 메뉴 재열기는 키보드 Enter/Space로 수행한다. 메뉴 자체를 클릭해 접을 때는 메뉴 포커스 흐름을 유지한다. 패널 열림과 실제 CAD 레이어 체크는 독립 상태이며 체크값은 복원된다.
5. 일반 Viewer 모드에서는 #17 `LayerDropdown`을 보존하고 상단 패널 명령은 비활성(`aria-controls` 제거). `dxf-viewer`, DWG, 로딩·에러·0 레이어에서 메뉴 비활성/도크 미노출, 사용 가능 Renderer로 돌아온 경우에는 reset 이후 기본 펼침 상태.
6. #38의 모바일 active `compactPanel`(320px, 흐름 내 상단 최대 20dvh), 중앙 Canvas/ResizeObserver, #26 검색 overlay, #31 하단 도구를 변경하지 않는다. CSS immersive와 사용자 제스처 native fullscreen은 **같은 shell DOM**을 사용한다. 상태 알림 `fullscreenchange`는 UI 열림을 초기화하지 않는다.
7. #40~#43 외곽선 도구/타입/트리는 작업하지 않는다. 보안 승인 전 관리자 RBAC·영구 저장/DB 변경 금지(#31 P4).

## 설계 및 수정 파일

| 소스 | 변경 |
| --- | --- |
| `viewer.tsx` | 상단 메뉴 button ref와 패널 close 후 focus 복귀; available 상태에서 도크 host 유지; `ViewerAppShell.layerPanelOpen` 전달 |
| `viewer-menu-bar.tsx` | 상단 menu ref/현재 available에 따른 `aria-controls`, `aria-expanded`·`aria-pressed` 유지 |
| `viewer-app-shell.tsx` | 도크 host와 실제 `FullscreenLayerPanel` 표시 상태 분리; 닫힌 도크는 `hidden`, 중앙 Canvas sibling은 안정 |
| `fullscreen-layer-panel.tsx` | 접기 버튼의 대상 도크 ID 명시, 기존 checked/all 콜백 유지 |
| `viewer-app-state.test.ts` | close idempotency, compact tree fallback/재열기 상태 검증 |
| `issue39-layer-menu.spec.ts` | 시각적 layer 영향, 독립 패널 토글/단일 GET/Canvas identity/포커스/키보드, 320px/일반 전환, simulated native/reload/Renderer/0 layer 검증 |

## AC → TC 추적

| AC | 기대 결과 / 검증 | TC |
| --- | --- | --- |
| AC-U2-01 | 메뉴 닫기/열기 및 패널 내부 접기/키보드 재열기 시 체크 상태 그대로; 기본 패널 오픈 | `TC-U2-UNIT-001`, `TC-U2-E2E-001` |
| AC-U2-02 | 패널 숨김은 CAD 레이어 visibility를 바꾸지 않으며 Canvas DOM·카메라/줌·원본 요청 유지; 레이어 체크는 실제 Canvas 변화 | `TC-U2-E2E-001`, 기존 `TC-ISSUE17-001`, `TC-U1-E2E-001` |
| AC-U2-03 | 메뉴 aria-controls/expanded/pressed, 내부 접기 후 포커스 반환 및 키보드 재오픈, 없으면 aria-controls 제거 | `TC-U2-E2E-001/002/003` |
| AC-U2-04 | 모바일 비중첩·Resize, 일반/immersive, simulated native fullscreen 이벤트, Renderer 변경/reload와 빈 파일에서 disabled | `TC-U2-E2E-001/002/003`; 실제 native Chrome/Edge 수동 검증은 별도 |

## 테스트·운영 검증 원칙

- 대상 CI: `cd src && npm ci && npm run db:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` 및 Docker-runtime job/Legacy migration E2E. 기존 CI `npm run test:outline-benchmark` 포함.
- `TC-U2-E2E-002`의 `document.fullscreenElement` 변경은 **native fullscreenchange UI 반응을 모의한 시험**이지 브라우저 실제 Fullscreen API 승인/Top layer 실증이 아니다. 실제 브라우저(native 허가/거절), 최신 Chrome/Edge, GPU/DXF 현장 정확성·성능·키보드 Tab은 별도 수동 확인 필요.
- 실패 시 Run ID/job/로그/원인/수정 HEAD를 `out/FailureLedger.md`에 누적하고 동일 테스트가 실행되지 않은 경로는 PASS가 아닌 SKIPPED/NOT RUN으로 보고한다.
- 현재는 CI 실행 결과 및 운영 승인 없음. PR 생성/CI 시작 이후에도 결과 모니터링을 수행하지 않으며 **병합/GHCR/Issue 종료는 다음 승인** 단계이다.
