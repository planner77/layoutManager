## #88/#90 Viewer Memo 검색 UI 적용 (2026-10-31)

Viewer `작업 > 메모 검색`은 #85 기존 Tree/MovableViewerPanel을 열고 해당 검색 Input으로 포커스한다. 독립 검색 모달이나 별도 드래그 핸들을 생성하지 않는다. Drawer/compact 정책 및 캔버스 생명주기, #138 Title Handle/position preservation은 현재 M4 구현을 재사용한다. 홈 `/?target=memos`는 Viewer 보조 패널 범위 밖의 독립 검색 화면이다. 설계와 미실행 수용 [Issues88-90](Issues88-90.md).

---

## #85 PR #175 M4 partial realization (2026-10-31)

The common `MovableViewerPanel` and pure CSS workspace clamp are now introduced for Memo Tree only, addressing Codex P1 on [PR #175](https://github.com/planner77/layoutManager/pull/175). Dedicated title drag handle, keyboard arrows, position reset, close/reopen preservation, independent canvas state and compact single modal are implemented with new Unit/Playwright tests; execution not yet verified. #138's remaining layer/outline/text-search/tool movable panels and full acceptance are **NOT COMPLETE**. This common policy still applies to later panels.

---

# Viewer 보조 창 이동·배치 공통 지침 (#138)

> **상태:** 2026-10-27 Owner UX 요구에 따른 설계/지침. **구현 전·시험 NOT RUN.** #127의 기존 Drawer, 메뉴 및 관련 도메인 경계 유지. 관련 [Issue #138](https://github.com/planner77/layoutManager/issues/138).

## 1. 적용 경계
Viewer 내부의 **독립 조회/작업 보조 창**은 최초 위치가 기존 Drawer(#127)여도 데스크톱에서 제목의 전용 이동 핸들을 드래그해 **non-modal floating 위치로 전환·재배치**할 수 있어야 한다. 공통 컴포넌트/상태로 구현하고 개별 창마다 ad hoc drag 구현을 복사하지 않는다.

| 기본 적용 대상 | 근거 |
| --- | --- |
| 레이어 목록, 외곽선 트리/목록 | #39/#43/#73 |
| 도면 내부 TEXT/MTEXT 검색·결과 목록 | #26 |
| 외곽선 생성·선택·생성 개체 편집 작업 도구 | #40/#49/#51~#56 |
| 추가되는 Viewer Memo 입력·트리·Viewer 범위 검색 | #82/#85/#90 |

확인 모달, 권한 승인, 단발 popover/메뉴/tooltip/toast, 앱 외부 독립 페이지(예: #62 운영 로그)는 **기본 자동 대상 아님**. 새 창 이슈에는 적용 여부 또는 비적용 근거를 명시한다.

## 2. UX 계약
- **진입/복원:** #127의 도면·보기·작업 *실제 실행형 그룹 메뉴* 및 기존 Drawer 초기 edge(좌 Layer/우 Outline/하단 Tools)를 유지. 첫 자유 이동 후 해당 창은 floating이 되며 기존 Drawer와 중복 마운트 금지. 별도 명시적인 **기본 위치로 복원** 및 닫기 제공.
- **상태:** 창 ID 기준 opened/placement(mode:edge|floating)/position/z-order를 Viewer shell이 일관되게 관리. 열린 창 수에 관계없이 각각 이동 가능. 같은 도면 Viewer 세션의 재열기에서 마지막 위치 유지; 새 Version/탭/새 세션에서 safe default. CAD 객체 상태/Undo와 panel 상태를 연결하지 않음. 명시적 요구 없는 localStorage/DB 영구 저장은 하지 않음.
- **드래그 영역:** 제목 표시줄에 전용 handle(또는 제한된 heading grab region)을 제공하고 나머지 본문은 드래그 시작 불가. 텍스트 검색 입력·리스트 행·Tree 선택·스크롤·버튼·숫자 입력·도면 canvas pan/zoom/box select·GENERATED WCS translate/rotate 및 Memo anchor drag는 독립.
- **입력:** PointerEvents, 임계값, pointer capture·cancel·release·unmount 정리. panel drag는 Canvas로 이벤트 전달하지 않음. Esc 취소는 상위 창 이동 단계만 처리, ADR-033 및 #127의 **한 번에 최상위 한 단계 닫기** 보존. 이동을 Undo 명령에 적재하지 않음.
- **레이아웃:** 좌표는 Canvas WCS가 아닌 **Viewer shell CSS viewport** 기준. Sticky 메뉴·도면 정보·상태바 영역 침범/우회 금지, 최소 heading+닫기/복원 UI가 화면에서 접근 가능하도록 clamp. resize·200% zoom·immersive/native fullscreen 전환 후 재계산, out-of-bounds 복원, 필요 시 내부 스크롤·높이 제한.
- **레이어:** 클릭/포커스 창은 위로 오되, 그룹 메뉴, 검색 팝오버, 확인 모달, 로딩 오버레이 등 기존 우선순위와 충돌 금지; fullscreen subtree 안에 배치. Canvas와 패널은 non-modal desktop에서 독립 조작할 수 있어야 함.
- **키보드/모바일:** grab handle 접근 가능한 이름/포커스 표시, 키보드 대체 이동(권장: 방향키, Shift 크게 이동) 또는 동등 접근 가능 위치 복원·배치 방식, 포커스 복귀. 모바일(375/320px)과 터치 좁은 화면에서는 #127 **단일 modal Drawer**, trap/scroll/backdrop/ESC 정책 유지하고 floating 강제하지 않는다. 브레이크포인트 왕복 안전.
- **수명주기:** 열고/이동/닫고/복원해도 `cad-canvas` DOM, ViewerManager/Adapter, DXF Source·GET·Parse·Worker·GPU 재생성/Dispose 없어야 함. 레이어 표시, 검색 조건/결과/FocusBounds, Outline tool ON/OFF·기존 결과, 선택/Undo/Redo, zoom/pan 보존. 지원하지 않는 Renderer/DWG를 이동 기능 때문에 활성화하지 않음.

## 3. 신규 이슈/설계·구현 검토 체크리스트
조회/작업 패널을 추가하거나 UI 위치를 변경하는 요구가 접수되면 작성자·구현자·리뷰어는 다음을 검토하고 **이슈 본문과 AC에 명시**한다.

1. Viewer 보조 패널인지/모달·단발 UI인지 범위 판단; 비적용이면 이유 기록.
2. 공용 MovableViewerPanel 및 기존 #127 그룹 메뉴/Drawer를 재사용하는가? 초깃값의 edge는 무엇인가?
3. drag handle의 hit 영역·pointer cancel 및 Canvas gesture/검색 입력 분리가 가능한가?
4. panel별 독립 position/z-index/resize-clamp/Reset/동일 세션 재열기 정책은 무엇인가?
5. ARIA/키보드/ESC 1단계/포커스 및 320px 모바일 Drawer·native fullscreen에서 안전한가?
6. CAD Canvas lifetime/GET/Worker 재시작, 데이터/검색·선택·Undo/Layer 상태 변경이 없는가?
7. Unit/E2E에서 실제 pointer drag, 키보드, resize/200%, 패널 다중 열림, 검색·외곽선 편집 회귀를 검증하는가?
8. `AGENTS.md`, `out/Requirements.md`, `out/Architecture.md`, `out/Decisions.md`, `out/TestPlan.md`, 변경 시 `out/TestReport.md`/ChangeLog의 추적을 갱신했는가?

## 4. 테스트 계약 (미실행)
- 순수 위치 계산 Unit: edge→floating, clamp, 창별 독립성, z-order, resize, Escape cancel, Reset, 초기화.
- Playwright: #26 TEXT search에서 입력/결과 선택·zoom, #43 Outline Tree Show/Hide, #40 생성 도구 ON/OFF/선택과 패널 drag를 교차; 드래그 중 도면 WCS 오조작 0. 20회 반복 후 Canvas identity·Source GET/Worker 재시작 0.
- 반응형: 1440×900/1366×768/375×812/320px, 200% zoom, CSS immersive/native fullscreen, touch/pointer cancel, focus/ARIA/multiple panels/ESC. 비지원 DXF Renderer/DWG 기존 Capability 보존.
- 실제 실행 증거가 없으면 모두 **NOT RUN**으로 표시. #113 실 도면/GPU 별도 수용.

## 5. 구현 및 릴리스 경계
이 문서는 설계 정책이고 이동 기능 구현이 아니다. 기본 컴포넌트 후보 `src/features/cad-viewer/viewer-app-shell.tsx`와 Viewer 스타일·공용 위치 reducer, 검색 UI wrapper. CAD API/Prisma/Migration/원본/Current/SHA, 운영 G7 Auth·저장/감사 승인을 건드리지 않는다. 구현 후 #138 AC와 해당 기능 이슈의 AC를 함께 충족해야 완료할 수 있다.
