# Issue #53 — E3 생성 개체 선택 삭제·다중 삭제 및 트리 동기화 (v0.39.0)

- Issue: https://github.com/planner77/layoutManager/issues/53 · Epic: #49
- 선행: #51 E1 CanvasSelection, #52 E2 GeneratedDocument/Command, #43 Tree, #40 생성 토글, #31 임시 Overlay
- 분석 기준: `AGENTS.md`, `out/Architecture.md`(루트 DESIGN.md 미존재), `out/Requirements.md`, `out/Decisions.md`(ADR-042/044), `out/Issue31.md`, `out/Issue43.md`, `out/Issue51.md`, `out/Issue52.md`, `out/TestPlan.md`, `README.md`.
- 적용 범위: **DXF + three-dxf-viewer**에 브라우저에서 생성·확정한 GENERATED Polygon/MultiPolygon/Hole만. 원본 SOURCE와 미확정 Worker Preview는 어떤 경로로도 삭제 대상이 아님. E4 이동/E5 회전/E6 Import/P4 서버 저장은 제외.

## 현재 구조와 간극

#52는 불변 UUID/Version/SHA·WCS Polygon/Hole·변환/metadata·원자적 `{type:'Delete',ids}`·Undo/Redo 및 Document→Scene/Tree/JSON 단일 투영을 이미 제공한다. 그러나 이전 #43 트리 `deleteSavedOutline(id)`는 `discardLegacy`를 직접 호출하고 이력을 초기화하므로 E3의 복원/안전 정책을 우회할 수 있었다. 또한 E2에는 실제 선택 삭제 UX·컨텍스트 메뉴·Delete/Backspace 키 바인딩이 없었다.

## 설계·구현

1. **하나의 명령 흐름:** 툴바/트리 행/선택 대상 우클릭/Canvas 포커스 Delete·Backspace → `prepareGeneratedDelete`(현재 Origin·Version/SHA·선택 전체·유일성·가시성·대상 ID/명칭) → 개수/명칭을 나열하는 모달 → `assertGeneratedDeleteCurrent`(범위·전체 선택·명령 스냅샷 재검증) → Manager `executeGeneratedCommand({type:'Delete',ids})` → E2 도메인 `GeneratedDocument.execute`에서 최종 원자적 재검증. 취소하면 Document/History 무변경. **이전 이력 없는 `discardLegacy`/Manager `deleteSavedOutline` API 삭제**.
2. **편집 경계:** SOURCE/mixed/invalid/duplicate/hidden/stale/다른 Version 거부. 실제 Adapter는 Canvas 모드 `objects` 또는 `generated`에서만 Command 허용한다. #40 생성 ON은 삭제 모드가 아니다; OFF여도 기존 확정 객체 편집 모드 진입 후 삭제 가능. Tree 행 액션은 해당 생성 항목 선택을 요구하며 SOURCE가 포함된 현재 혼합 선택은 강제로 필터링하지 않고 거부. Context는 현재 선택된 GENERATED Geometry를 실제 Hit-test한 경우만 표시.
3. **키보드/접근성:** Canvas 실제 `HTMLCanvasElement`에 초점이 있을 때만 modifier 없는 Delete/Backspace 허용. SelectionController의 window capture listener가 먼저 실행되더라도 Confirm/Context overlay가 표시되는 동안은 ESC 선택 해제를 하지 않으며, 최상위 overlay만 닫고 원래 선택을 유지한다. 확인창 내 대상 명칭이 중간에 변경되어도 재확인 없이 삭제하지 않는다. 입력/textarea/select/contenteditable/검색창/트리/도구바에서 native 이벤트 보호. 확인창 `role=alertdialog`/제목·설명·대상 목록/초점 이동·복귀/Tab 순환, Esc는 확인창 취소 > 컨텍스트 메뉴 취소 > E2 staged edit 취소 > 선택 > native/CSS fullscreen 순서. 취소 시 결과 없음.
4. **Document→Scene 일치:** Delete 패치에는 제거한 객체의 원래 배열 index/UUID/Geometry·base transform·visibility·metadata를 보존하며 한 명령=한 history. Undo는 원본 순서·ID·모양을 복원, Redo 다시 삭제한다. `ThreeDxfViewerAdapter.documentChanged`는 사라진 `savedGroups`만 geometry/material dispose 후 Selector에서 삭제 ID를 prune하고 트리/Canvas/JSON count를 동기화한다. 남은 Overlay/Preview와 Source render·Layer/Version/Current 원본 불변. 새 생성 객체는 기존 `createGeneratedId`/issued Set 및 단조 증가 `nextSavedId`를 유지.
5. **보안/범위:** 브라우저 상태만 변경하고 백엔드 `/api`, 데이터베이스 migration, 원본 bytes/SHA, 원본 Source Geometry, 영구 저장/RBAC은 추가·수정하지 않음. 세션 종료·reload·Renderer/Version 교체 시 임시 생성/이력 소멸. 기존 #31 JSON v1·typed v2 export는 현재 Document의 남은 결과만 반영한다.

### 데이터 흐름

```text
Toolbar / Tree(#43) / Canvas context / Delete key
  -> UI mode/scope + prepareGeneratedDelete(selection, GeneratedDocument projection)
  -> alertdialog (names + count, cancel has no mutation)
  -> assertGeneratedDeleteCurrent (selection + Version/SHA unchanged)
  -> ViewerManager.executeGeneratedCommand(Delete UUID[])
  -> ThreeDxfViewerAdapter mode gate
  -> GeneratedDocument.execute (atomic E2 origin/scope/IDs/visibility validation)
  -> onChange
     + savedGroups GPU resource dispose (deleted entries only)
     + SelectionController prunes deleted candidate IDs
     + Tree / Canvas highlights / saved count / existing JSON projection / History
```

## 수용 기준 추적

| 기준 | 구현·테스트 | 범위 제한 |
| --- | --- | --- |
| E3-AC1 | 3개 중 1개 삭제 → 2개 Scene/Tree/JSON 잔존 · TC-E3-UNIT-001, E2E-001 | Source/Preview 건드리지 않음 |
| E3-AC2 | 다중 2개 대상 명칭·취소 무변경·Undo/Redo·새 생성 ID 중복 없음 · UNIT-002, E2E-002 | UUID/legacy local-N 단조 증가 |
| E3-AC3 | SOURCE/혼합/invalid/stale/duplicate/other Version 전부 거부 · UNIT-003/004, E2E-003 | bytes/SHA/Layer/Current/DB 검증은 정적/통합/현장 구분 |
| E3-AC4 | Canvas focus 키 입력, textbox native 보호, Esc·CSS/native fullscreen, Renderer/reload reset, GPU disposal 경로 검토 · UNIT-005, E2E-002/003 | 실제 GPU 누수/실 CAD/OS별 native Fullscreen 실측 미수행 |
| E3-AC5 | 서버 삭제 API·DB Migration 생성 안 함, 로컬 임시 개체 | #31 P4 승인 전 서버 저장 금지 |

## 검증·출시 원칙

- 작업 브랜치: `feat/issue-53-generated-delete`; 개발 시작 main `e1adfe5b9de28ddd3821a0de2466d810e5c6c209`. 최신 main #67 Docker 최적화 `1605dcea817215055ca235d38a147b2c2edc3864`는 E3 코드를 유지한 2-parent merge로 반영. 충돌 및 리뷰 스레드 최종 상태는 PR 생성 후 확인.
- 테스트: Unit `generated-delete.test.ts` / `generated-keyboard.test.ts`; E2E `issue53-generated-delete.spec.ts`; 기존 #43 트리·#51 혼합·#52 History 등 회귀 유지.
- 이 세션에서는 로컬 Git checkout 및 Node/test runner 접근 불가(GitHub 도메인 DNS 연결 실패). **Typecheck/Lint/Unit/Build/Playwright/Benchmark/Legacy migration/Docker/실 CAD/GPU: NOT RUN**. 작성한 테스트와 성공한 검증을 구별한다. PR 생성은 CI 트리거만 의미하고 PASS가 아님.
- 충돌/미해결 리뷰 스레드 확인은 새 PR 생성 이후 별도로 시행. CI 결과 모니터링, 병합, Main CI, GHCR 게시와 Issue 종료는 요청 범위 밖.
