# Issue #52 — E2 GeneratedDocument / Command / Undo·Redo (v0.38.0)

- Issue: https://github.com/planner77/layoutManager/issues/52
- Epic: #49 · 선행 E1 #51(이미 main 병합) · 후속 E3 삭제 #53 / E4 이동 #54 / E5 회전 #55 / E6 편집 JSON #56
- 분석 기준: `AGENTS.md`, `out/Architecture.md`(루트 `DESIGN.md` 없음), `out/Requirements.md`, `out/Decisions.md` ADR-042/043, `out/Issue31.md`, `out/Issue51.md`, `out/TestPlan.md`.
- 1차 지원: 브라우저 DXF + three-dxf-viewer, `GENERATED` 확정 외곽선 Polygon/MultiPolygon/Hole. SOURCE/Worker Preview는 편집 대상도 Document 대상도 아님.

## 원인/기존 구조와 해결

E1 이전에는 `SavedOutline[]`와 `savedGroup`/UUID 매핑이 각각 상태를 소유해, 배열 삭제 후 ID 순서, 편집 재생, 트리/내보내기 정합성이 깨질 수 있었다. E1의 UUID 기반 Canvas Ref와 Source/Generated 분리는 그대로 사용한다. E2는 **버전별 메모리 Document가 생성 개체의 단일 기준**이 되도록 하며 GPU 그룹은 파생된 캐시로만 둔다.

1. `src/domain/generated-document.ts`: 불변 UUIDv4 Ref + `versionId/sourceSha256` 스코프, legacy `savedOutlineId=local-N`, 타입·이름·createdAt·editedAt·`kind`, 원본 알고리즘·sourceEntityIds·기준 GeoJSON WCS XY, 2D affine(`[a,b,c,d,e,f]`), `visible/edited/dirty`. `baseGeometry`는 깊은 값 복제+freeze; 사용자 편집은 행렬만 바꾼다. WCS 수치 절대값 최대 `1e12`, 좌표 총량 최대 `100,000`개, 확정 개체 최대 `100`개.
2. `Delete(ids)`, `Translate(ids,dx,dy)`, `Rotate(ids,angleDegrees,pivot)` Command는 **E2 도메인 fixture 및 Manager/Adapter entry point까지만 제공**. 후속 E3~E5가 실제 편집 도구/드래그/핸들·수치 UI를 연결한다. 동일 스코프의 전부 GENERATED + 존재·표시 중인 ID + 중복 없음 + 선택 목록과 정확히 일치 + 유한 변환 및 실제 변환 geometry 경계 검사 완료한 후에만 한 번에 Document를 교체한다. 검증 실패는 원자적 무변경/이력 무변경, SOURCE와 혼합 참조도 전체 거부.
3. `execute/stage/commitPending/cancelPending`으로 확정 명령과 미확정 제스처 분리. PointerUp/확정 시에만 `execute` 한 번 = Undo 한 단계; ESC / pointercancel / 취소 / Dispose / Viewer 교체에서는 미확정 세션만 폐기. UI 편집 핸들 자체는 E4/E5.
4. `undo/redo`는 patch before/after 참조와 제거 위치를 기록하며 재적용 시 생성 ID와 순서를 복구. Undo 후 새 명령/새로운 확정은 Redo 무효화. 최대 **100명령**과 계산 기반 **16MiB 이력 예산**(둘 중 먼저 적용). 동일 `baseGeometry` 공유로 이동/회전당 전체 정점 복사를 보관하지 않는다. 좌표 파생·렌더 시에는 실제 Geometry가 새로 계산되므로 정점 수/작업 복잡도는 `O(vertices)`; GPU 메모리는 WebGL 구현/브라우저에 따라 상이하여 16MiB 이력 예산의 일부가 아니다. 삭제 patch의 geometry 참조는 Undo 가능기간 동안 유지된다. `clear`/Dispose/Renderer/Version 변경에서 history·Document 폐기.
5. Adapter의 `documentChanged`가 같은 Document에서 `getSavedOutlines`(기존 v1/v2 다운로드의 `local-N` 호환), `getSavedOutlineStates`(#43 트리), `getGeneratedObjects`(UUID·baseline·transform·provenance 포함), `SelectionController` hit test, `savedGroup` Scene과 강조를 재투영한다. 삭제 그룹/교체된 geometry/material을 `dispose`하고 source index/geometry Worker는 재실행하지 않는다. 렌더 객체 Map은 **cache**, 사실의 기준이 아니다.
6. `ViewerManager` API는 명령과 Undo/Redo/상태 조회만 전달한다. `CadViewer`는 버튼 및 Ctrl/⌘+Z·Ctrl/⌘+Shift+Z·Ctrl+Y 를 Viewer 포커스에서만 해석하고 폼/textbox/contenteditable 및 이미 처리된 키 이벤트를 양보한다. Zoom/Pan/도구/표시 토글은 history에 기록하지 않는다. 기존 #43 삭제 버튼은 E3 도입 전까지 과거 **legacy 개별 삭제** 계약이며 편집 History와 혼동하지 않는다(legacy 삭제 시 이력 초기화).
7. 보안/수명: 원본 DXF bytes, 해시, Source Entity/Layer, Current, 서버 DB/영속 API/관리 권한은 바꾸지 않는다. 이 Document는 새로고침/Renderer/Version/탭 종료 시 폐기된다. **#56 수동 안전 JSON 재가져오기 전에는 편집 상태 보존을 지원하지 않는다.** 현재 기존 JSON v1/typed v2는 브라우저 임시 외곽선 다운로드로 계속 작동하지만, 편집본을 기존 #31 P4 canonical attestation이 검증 가능한 서버 자료로 취급할 수 없다. 별도 #56 스키마/검증 및 #31 P4 Owner 보안 승인 필요.

## 수용 기준 및 검사 계획

| 기준 | 구현 | 테스트 및 상태 |
| --- | --- | --- |
| E2-AC1 두 개체·두 명령·Undo/Redo 2회 | 원자 patch/Transform/UUID | TC-E2-UNIT-001 / CODED, NOT RUN |
| E2-AC2 SOURCE/혼합, stale/ref/NaN/중복/Pivot | canvasEditCapability+Document 재검증 | TC-E2-UNIT-002 / CODED, NOT RUN |
| E2-AC3 redo 무효화·100 제한·키보드 충돌 방지 | History/Shortcut | TC-E2-UNIT-003~004, E2-E2E-001 / CODED, NOT RUN |
| E2-AC4 Document=Scene=Tree=Export, release | Adapter projection + GPU dispose | E2-E2E-001/002 및 E1/U6 회귀 / CODED, NOT RUN |
| E2-AC5 E3~E6 확장 계약과 원본 불변 | GeneratedCommand/Entry/Manager | TC-E2-UNIT-005 / CODED, NOT RUN; 후속 E3~E6 / NOT VERIFIED |

## 게이트 및 후속

- 이력 중 편집 결과를 서버 저장하겠다는 의미가 아니다. 인증/인가/Scope/Audit 정책 승인 전 #31 P4 미구현을 유지.
- 실제 화면 삭제/이동/회전, 수치 입력/포인터 드래그, 조작 preview, JSON v2 편집 Import는 E3~E6 작업에서 구현. E2의 브라우저 E2E는 키보드·세션 수명과 기존 확정만 확인하며 편집 버튼 자체를 시험했다고 주장하지 않는다.
- 이 세션에서는 GitHub Connector로 소스/테스트/문서를 직접 수정했다. 로컬 `npm ci`, TypeScript/ESLint/Vitest/Playwright/Build, WebGL GPU/실도면 검증은 **NOT RUN**. PR CI 시작 후 성공/실패는 실행 결과 확인 전 **NOT VERIFIED**. 실패·취소 결과가 관측되면 [FailureLedger](FailureLedger.md)에 누적 기록한다.
