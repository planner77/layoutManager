# GitHub Issue #25 — 도면 Viewer 기본 CSS 전체 뷰포트 진입

- 구현 기준일: 2026-10-17
- 대상: [Issue #25](https://github.com/planner77/layoutManager/issues/25)
- 기준 브랜치: `feat/issue-25-auto-immersive-viewer` (`main` v0.28.3에서 분기)
- 대상 앱 버전: **0.29.0** (Viewer 진입 UX 기능 추가, DB/API 변경 없음)
- 상태: **PR 생성·PR CI 전**. 작성된 자동 테스트를 실행·통과했다고 기록하지 않는다.

## 사용자 계약과 범위

목록/Location·Version 상세/링크 복사/주소창/새 탭/새로고침에서 동일한
`/cad/versions/{versionId}/viewer?renderer=...` 페이지를 연다. 앱은 최초 렌더에서
`position: fixed; inset: 0; height: 100dvh`에 대응하는 **CSS immersive** 모드를 기본으로 쓴다.
브라우저 주소창과 탭의 숨김을 뜻하는 native fullscreen을 자동 요청하지 않는다.
브라우저 `Element.requestFullscreen()`의 transient user activation 제한을 우회하지 않으며
명시적인 `브라우저 전체 화면` 버튼을 눌렀을 때만 시도한다.
미지원·거절 브라우저에서도 CSS immersive는 유지된다.
관련 사양: [MDN requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen).

- **진입·링크:** 기존 Version UUID 및 `renderer` query/링크 복사 형식을 보존. DXF는 `dxf-viewer` 또는 `three-dxf-viewer`, DWG는 `libredwg-web`만 사용하며 포맷별 Adapter는 변경하지 않는다.
- **도면 툴바:** fullscreen shell 안에서 파일명·Version·원본명·위치, Renderer 변경, zoom/fit, 원본 다운로드, Version 링크 복사, 로딩 상태/오류/재시도, Version 목록으로 돌아가기를 제공한다. 상세 설명은 접이식 패널에 표시한다.
- **레이어/검색/선택:** `three-dxf-viewer`는 immersive `FullscreenLayerPanel`(#17), 일반 화면에서는 `LayerDropdown`. DXF 텍스트 검색(#26), DXF 외곽선/선택(#31)은 Viewer shell 안의 overlay 유지. 도면 원본 및 Adapter의 업무 로직은 변경하지 않는다.
- **종료·ESC:** `전체 화면 종료`는 CSS immersive를 해제하여 **같은 Viewer 페이지의 일반 레이아웃**으로 복귀. `전체 화면` 버튼으로 재진입. 브라우저 뒤로 가기·`← 버전 목록`은 Viewer를 언마운트하고 원래 경로로 이동. native fullscreen의 ESC/브라우저 자체 해제는 **native만 해제**, CSS immersive는 계속 유지. CSS 상태에서 ESC는 immersive 종료. ESC를 눌러 overlay를 닫는 라이브러리와의 상호작용은 별도 브라우저 회귀 대상이다.
- **Layout·접근성:** shell `tabIndex=-1`/진입 시 포커스, 앱 헤더 `inert`, html/body 스크롤 잠금과 cleanup, `100dvh` 모바일 대응, 독립 스크롤 툴바, 상태/오류를 shell 내부에 유지. 전역 로딩 오버레이의 최상위 z-index 계약 유지.
- **재진입·자원:** 모드 전환 상태를 ViewerManager.load effect의 dependency에 넣지 않고 DOM/Adapter/Canvas를 유지한다. Renderer 변경/원본 재로드/Version 변경 시 기존 취소·dispose 및 새 load lifecycle 적용.
- **지원 한계:** native fullscreen은 user gesture와 브라우저 정책에 의존하며 주소창까지 자동 숨김 불가. 모바일 제스처·현장 CAD/GPU 정확도는 이 이슈에서 새로 보장하지 않는다.

## 변경 지점 및 추적

| AC | 구현 근거 | 자동 검증 계약 |
| --- | --- | --- |
| 목록·Location·URL·새 탭·새로고침 최초 immersive | 공통 `app/cad/versions/[versionId]/viewer/page.tsx` + `features/cad-viewer/viewer.tsx` | `TC-ISSUE25-001` (2 DXF 렌더러), `TC-LINK-001/002` |
| Native 사용자 활성화 필요/실패 CSS 유지 | 명시 `toggleNativeFullscreen` 클릭 및 분리된 native state | `TC-ISSUE25-001` 거절 주입, `data-native-fullscreen` |
| 도면 정보, 조작, 오류·재시도·링크 | shell 내부 툴바/상태/원본 다운로드, 기존 `CopyCadLink` | `TC-ISSUE25-001`, `TC-DXF/THREE-001`, `TC-LINK-001..003` |
| 종료, ESC, 브라우저 뒤로, 재진입 | `exitFullscreen`, fullscreenchange/keydown, `Link` | `TC-ISSUE25-001`, `TC-DXF/THREE-001` |
| zoom/pan/fit/layer/search/outline 상태·cleanup | 기존 Manager/Adapter, `LayerDropdown`, `FullscreenLayerPanel`, `CadTextSearch` | `TC-ISSUE17-001`, `TC-TEXT-E2E-001`, `TC-OUT-E2E-001`, `TC-SWITCH-001/002` |
| DWG 동일한 기본 모드/Renderer 강제 | 공통 `CadViewer` + 포맷 선택 | `TC-E2E-002/DWG-001/003` (별도 DWG probe) |
| 100dvh·Resize/Canvas·스크롤·포커스 | `globals.css`, `data-app-header` inert, Resize event | `TC-ISSUE25-001`, `TC-LAYER003`, `TC-DXF/THREE-001` |
| 전역 로딩 Spinner | 기존 `GlobalLoadingProvider`, shell 하위 status | `TC-SWITCH-001/002`, `TC-ISSUE9` 회귀 |

## 릴리스·검증 게이트

1. 현재 main 및 관련 #10/#17/#9/#26/#31과 상태·요구사항을 동기화하고 기능 브랜치에서 구현. DB Migration, CAD 원본 및 Secret 변경 금지.
2. `npm --prefix src ci` → `db:generate` → `typecheck` → `lint` → Unit/Integration → Production build → Chromium Playwright E2E, 필요시 DWG 전용 E2E·모바일 크기 점검.
3. Native 거절 주입, CSS fullscreen 캔버스 backing buffer, ESC/Reload/Back/새 Context, 이동·Renderer/레이어/검색·원본 요청·cleanup 회귀.
4. 원격 PR reviewer의 미해결 inline thread에 근거를 남기고 수정·resolve. 최신 main과 충돌 없음 확인 후 PR CI 시작. 이 이슈는 PR CI를 시작하는 단계까지만 요청되었으며 Main CI/병합·GHCR 게시는 별도 단계.
5. **실행 기록 미확인 = NOT RUN**. 자동 test 코드의 존재만으로 PASS 또는 현장 Chrome/Edge/macOS/iOS 동작 확인을 주장하지 않는다.

## UX 문구

'전체 화면'은 **앱 뷰포트 최대화**, '브라우저 전체 화면'은 **표준 Fullscreen API 사용자 선택 동작**이다. 둘은 독립 상태이며 주소창 자동 숨김으로 소개하지 않는다. 성공 후 실제 브라우저별 추가 수동 시험은 `out/TestReport.md`에 따로 기록한다.

## PR #36 최초 CI 실패와 P2 리뷰 보완 (2026-10-17)

- 최초 PR CI [run 38963238965](https://github.com/planner77/layoutManager/actions/runs/38963238965): Node 22.14.0 `npm ci`, Prisma generate, `tsc --noEmit` 성공; **ESLint 실패**(`src/features/cad-viewer/viewer.tsx:314:56,67`, `react/no-unescaped-entities`). JSX 안내 문구의 작은따옴표는 `&apos;`로 escape. 이 실패로 Unit/Integration, benchmark, Production build, Playwright E2E, Legacy Migration E2E는 **미실행**. 별도 Docker size/migration/runtime smoke Job은 성공.
- Codex P2 리뷰 [PR #36](https://github.com/planner77/layoutManager/pull/36): Native fullscreen인 Viewer shell은 브라우저의 top layer에 들어가므로 Provider의 형제 노드인 global spinner는 `z-index: 1000`이어도 그 위에 그려지지 않는다. renderer 전환/재로드가 최대 120초 지연될 때 spinner/클릭 방지가 불충분해진다.
- 조치: `useGlobalLoading().isLoading` 상태를 공유하고, native fullscreen이 실제 활성일 때 shell 내부에도 기존 `GlobalLoadingOverlay`를 렌더한다. Overlay는 top-layer shell 자손이므로 global spinner의 body 키보드 차단과 함께 mouse/touch 차단 UI를 제공. CSS immersive에서는 기존 Provider spinner만 사용하여 overlay 중복을 방지한다.
- 회귀: `TC-ISSUE25-002`는 `fullscreenchange`에 의한 native 상태 변화를 합성으로 고정하고, 원본 GET을 지연시킨 명시적 reload 중 Provider/global 및 shell/local spinner 표시, 조작 비활성화, 요청 완료 후 제거·native 상태 해제를 확인한다. 실제 브라우저 native 렌더링의 실증은 별도이며 테스트 코드만으로 PASS가 아니다.
- 보완된 커밋에 대한 **새 PR CI 검증 전**으로 최신 Unit/Build/E2E PASS를 주장하지 않는다.
