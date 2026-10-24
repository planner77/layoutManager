# Issue #38 — 앱형 CAD Viewer Shell / U1 (v0.30.0)

- 이슈: https://github.com/planner77/layoutManager/issues/38
- 상위 Epic: #37; 후속: #39(U2), #40(U3), #41(U4, 보안 승인 대기), #42(U5), #43(U6)
- 소스 기준: main `d22b4575`(0.29.0) → `feat/issue-38-viewer-app-shell`
- 단계: 구현/자동 시험 코드 작성, 원격 PR CI 검증 **전**. 실행하지 않은 테스트는 PASS가 아님.
- DB/API/원본 CAD/외곽선 Geometry/Worker/Renderer Adapter 계약 변경 없음.

## 요구사항과 안전 경계

1. 진입 경로(목록·직접 URL·새로고침) 및 렌더러 선택은 #25의 CSS immersive / 명시적 native fullscreen 계약을 그대로 이용한다. Native 자동 진입은 하지 않는다.
2. 상단 메뉴바와 기존 도면 정보·Renderer·Zoom/Fit·다운로드·링크·재시도·종료를 분리된 상단 영역에 둔다. **기존 조작 버튼/접근 가능한 이름을 유지**한다.
3. `layerPanelOpen`(초기 true), `outlineToolEnabled`(초기 false), `outlineTreeOpen`(초기 false)은 별개 UI 상태이다. 업무 레이어의 `selectedLayers`(실제 도면 표시)와 별개이며 Manager effect 의존성에 들어가지 않는다.
4. U1에서는 좌측 레이어 **도킹 셸과 최소 on/off 통로**를 연결한다. #39의 추가 접근성/상태 검증은 후속으로 유지한다. 기존 #17 체크/전체 선택은 계속 Manager를 통해 도면으로 전달한다.
5. 기존 #31 객체 선택·미리보기·임시 확정/JSON은 하단 스크롤 가능한 **도구 도크**에 그대로 유지한다. 별도 상단 생성 ON/OFF는 #40 구현 전 비활성으로 표시한다. 생성 도구 기본 탐색 모드(pan)는 변경하지 않는다. 도크의 종전 직접 선택 모드는 레거시 호환을 위해 유지한다.
6. 우측 트리 도크 슬롯과 좁은 화면에서 좌우 패널 중 하나만 표시하는 상태는 준비하되 #42/#43 데이터·트리뷰 미구현 상태에서 빈 트리를 가짜로 띄우지 않는다.
7. 관리자 타입 메뉴는 RBAC 미확정으로 **비활성 안내**만 표시한다. #41/P4 보안 승인 전 DB migration, 관리 API/쓰기/가짜 admin 감지 없음.
8. DXF의 `dxf-viewer` / `three-dxf-viewer`, DWG의 `libredwg-web` 전부 같은 앱 셸을 사용한다. 미지원 메뉴는 `disabled`/이유를 제공한다. DWG LINE 제약은 기존 수준 그대로이다.

## 컴포넌트/상태·레이아웃 설계

```text
CadViewer [Version/Renderer/ViewerManager/Source/Outline/Search 상태 소유]
  └─ ViewerAppShell [normal/CSS immersive/native top-layer의 단일 DOM]
      ├─ ViewerMenuBar [명령 상태/지원 여부 전달만, Adapter 직접 호출 금지]
      ├─ 기존 viewer-toolbar [제목/버전/Renderer/조작/다운로드/링크/메타데이터]
      ├─ viewer-workspace [flex: 모바일 column / md 이상 row]
      │   ├─ left slot: FullscreenLayerPanel [전체 화면 + 지원 Renderer]
      │   ├─ center: cad-canvas [동일 ref/DOM] + CadTextSearch [bounded overlay]
      │   └─ right slot: U6 outline tree [현재 미장착]
      ├─ bottom: #31 객체 선택·외곽선 임시 도구 [독립 높이/스크롤]
      ├─ footer: 로딩 결과/경고/오류
      └─ native loading overlay [top layer의 shell 내부]
```

- 메뉴/패널 상태 조작은 Canvas 부모의 키·타입을 바꾸지 않으므로 React canvas div가 리마운트되지 않는다. `ViewerManager.load` effect의 dependency는 원래의 Version/Renderer/Reload/Source 그대로이다.
- 중앙 컨테이너의 `ResizeObserver`로 크기 변화 후 window resize를 알리고, three-dxf-viewer/DWG Adapter의 자체 ResizeObserver를 유지한다. Canvas는 공간을 점유하는 좌/우 도크와 겹치지 않는다.
- Desktop은 좌우 너비 상한 17rem·28vw, center min-width 0. 320px 등 작은 화면은 하나의 활성 패널만 canvas 위 **문서 흐름에 놓고** 최대 20dvh로 제한하며, 캔버스는 `flex:1;min-height:0`. 도구 도크는 22dvh 상한 및 스크롤. Canvas를 가로막는 고정형 좌측 Overlay는 없앴다.
- 검색은 중앙 Canvas 안의 bounded overlay. 검색 패널 ESC는 닫힘부터 수행한다. 외곽선 선택 중 ESC는 SelectionController가 선택 해제 + defaultPrevented 처리(1회); 다음 ESC에서 search/native/CSS를 처리한다. **한 키로 선택 취소와 CSS 종료를 동시 실행하지 않는다**(ADR-033). 브라우저 자체 native ESC는 브라우저가 선행 처리할 수 있다.
- 표준 버튼 focus/Tab을 사용한다. 도킹·패널 상태 조작은 ViewerManager를 dispose하지 않는다. Fullscreen shell 진입/복귀의 앱 Header inert와 이전 포커스 복귀는 #25와 같다.

## AC → 소스/시험 추적

| AC | 구현/근거 | 시험 |
| --- | --- | --- |
| AC-U1-01 | `viewer.tsx`, `viewer-app-shell.tsx`, `viewer-menu-bar.tsx`, #25 경로 동일 | `TC-U1-E2E-001/002`, 기존 `TC-ISSUE25-001/002` |
| AC-U1-02 | `viewer.tsx` 기존 toolbar/LayerDropdown/CadTextSearch/#31 도구 재사용 | `TC-U1-E2E-001/002`, `TC-ISSUE17-001`, `TC-OUT-E2E-001`, `TC-TEXT-E2E-001` |
| AC-U1-03 | `viewer-app-state.ts` 순수 reducer, unmodified Manager load dependencies, stable `ref=container` | `TC-U1-UNIT-001`, `TC-U1-E2E-001` (단일 content GET/canvas marker) |
| AC-U1-04 | flex workspace, 모바일 단일 compact slot, resize, search ESC 우선 | `TC-U1-E2E-001` (320px, backing buffer, 두 단계 ESC), #17/#31 회귀 |
| AC-U1-05 | 공통 shell 및 unsupported 메뉴 비활성 | DXF 2종 `TC-U1-E2E-001`, DWG 실패 UI `TC-U1-E2E-002`; 성공 DWG 실측은 별도 `dwg-viewer.probe.ts` 대상 |

## 검증/운영 미완료

- Source review: 이 설계는 Chrome/Edge의 실제 렌더 캡처/실도면 성능을 대신하지 않는다.
- 로컬 종속성 `npm ci`, Typecheck, ESLint, Unit, Playwright, Production build 실제 결과는 **NOT RUN**. PR CI가 최초 실행 근거를 제공한다.
- native fullscreen 실제 top-layer/focus/ESC 브라우저 수동 실증과 DWG 실제 LINE 수용은 CI 합성 데이터/오류 도면 시험과 구분한다.
- 외곽선 영구 저장/Admin Type/타입별 트리/그룹 토글은 이 이슈의 완료로 주장하지 않는다.
