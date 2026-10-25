# Issue #51 — E1 DXF 원본/생성 Overlay 통합 선택 (v0.37.0)

- Issue: https://github.com/planner77/layoutManager/issues/51 · Epic #49 · 후속 #52~#56.
- 설계 기준: AGENTS.md, out/Architecture.md, out/Requirements.md, ADR-041, #31/#40/#42/#43. 루트 DESIGN.md는 존재하지 않음.
- 범위: DXF + three-dxf-viewer의 기존 SOURCE 선택과 브라우저 임시 확정 GENERATED(CÖNVEX가 아닌 **CONVEX** 및 PRECISE)의 단일 Canvas/Tree 선택 상태 및 편집 가능 여부. **실제 편집 명령, Delete/Move/Rotate/Undo, JSON Import, DB/API 쓰기는 이 PR 범위가 아님**.

## 요구 및 구현 결정

1. `CanvasObjectRef={origin,id,versionId,sourceSha256}`; origin은 SOURCE/GENERATED 별도 네임스페이스. SOURCE는 #31 안정 매핑 ID, GENERATED는 CSPRNG UUIDv4를 별도 생성한다. 브라우저 HTTP의 getRandomValues fallback을 지원하며 ID 충돌은 재발급 실패 시 fail-closed한다. 기존 `SavedOutline.id=local-N`은 변경하지 않아 #31/#42/#43 및 JSON v1/2가 계속 작동한다. E2는 `getGeneratedObjects().ref`의 UUID를 사용한다. UUID는 서버 인증/권한/영속 ID가 아니다.
2. SelectionController 하나를 재사용: `pan`(기본), `select`(#40 Worker의 SOURCE 전용), `objects`(SOURCE+GENERATED), `generated`(GENERATED 전용). #40 ON은 일반 모드에서 미확정 작업 취소 후 Source 생성 모드 진입, OFF는 기존 Preview/Worker/Source 선택 취소→Pan 경로; GENERATED 확정 결과 보존. 일반 모드에서 SOURCE/GENERATED가 겹치면 SOURCE 우선, 트리나 generated 전용 모드로 Overlay 선택.
3. SOURCE hit는 #31 RenderCoverage의 안정 Handle/Layer/Bounds와 SpatialIndex를 사용. GENERATED는 보이는 확정 Overlay만 순수 WCS GeoJSON Polygon/MultiPolygon geometry 기반 point/stroke/hole, 방향별 완전 포함/교차 hit test. 클릭 허용 오차 7 screen px → camera WCS 변환. 숨기거나 삭제한 Generated는 선택 후보/기존 선택에서 제외하고 Source Layer 숨김은 Source 선택만 제거한다. Preview는 제외.
4. Ctrl/⌘+클릭/트리 Ctrl/⌘+Enter additive, 기존 단일 클릭/영역 선택/빈 공간 선택 해제, Space 임시 Pan·ESC 단일 단계 선택 해제. Tree와 Canvas는 Adapter/SelectionController의 동일 집합을 읽으며 `onObjectSelection` 이벤트로 React UI(원본/생성 카운트, Ref·read-only) 갱신. 다중 Generated highlight는 별도 Scene Group, 원본 Mesh/Layer 수정 금지.
5. `canvasEditCapability`: SOURCE 단독/혼합, 공백, 범위 불일치/중복/가짜 ID는 **전체 변경 거부**, GENERATED-only Ref만 canEdit=true. E1의 canEdit는 향후 Command의 진입 허가조건에 불과하며 **명령 자체는 E2 이후**. 서버측 승인/감사/Scope는 #31 P4/#65 완료 전 구현하지 않는다.
6. Renderer/Version/reload/Canvas dispose 시 selection+GPU group, listener 및 UUID 매핑 초기화. Zoom/Pan/resize/fullscreen/도킹 토글은 동일 Adapter를 유지해야 하고 SOURCE 원본 파일 bytes, SHA, Current 및 DB는 불변이다.

## 수용 기준/검증 추적

| AC | 구현 경로 | TC / 상태 |
| --- | --- | --- |
| E1-AC1 통합 선택+구분 | canvas-object-selection, SelectionController, UI | E1-UNIT-001, E1-E2E-001 / 코드 작성, **NOT RUN** |
| E1-AC2 SOURCE read-only + 생성 전용 edit eligibility | canvasEditCapability, Adapter/Manager | E1-UNIT-001, E1-E2E-001 / 코드 작성, **NOT RUN** |
| E1-AC3 Stroke/Hole/MultiPolygon/숨김/도구·Fullscreen | generated-hit-test, source mapping, E1 E2E | E1-UNIT-002, E1-E2E-001/002 / **NOT RUN** |
| E1-AC4 ID 안전·Version/Renderer/삭제·dispose | UUID map, visibility filtering, reset | E1-UNIT-001, E1-E2E-002/003 / **NOT RUN** |
| E1-AC5 후속 E2~E6 재사용 계약 | Manager getGeneratedObjects/getCanvasObjectSelection | TS/API 리뷰 및 후속 이슈 검증 / **NOT VERIFIED** |

## 실행, 리스크 및 후속

- GitHub Connector로만 원격 파일 갱신. 이 세션에서 로컬 npm/typecheck/ESLint/Vitest/Playwright/Build/실 CAD·GPU 시험은 실행하지 않았다. PR CI 성공·실도면 수용은 **미확인**. `out/TestReport.md` 참조.
- E1은 생성 객체의 기준 Geometry를 이동·회전하지 않는다. E2는 UUID/동일 Version/SHA/전체 대상 검사와 브라우저 Document·Command·Undo/Redo를 구현하고, E3/E4/E5에서 별도 편집 명령을 제공한다.
- 다중 선택 100개/100k Vertex 대형 실제 도면의 hit 성능 및 브라우저 운용 수용은 추후 실측. Secure Crypto 없는 브라우저에서 생성 ID 발급은 fail-closed. 다른 Renderer/DWG와 미확인 Source, 서버 영속성은 지원하지 않는다.
- PR 생성 후 최신 HEAD와 main 충돌·미해결 리뷰 스레드 점검 및 CI **시작까지만** 진행. 병합/GHCR/이슈 종료·CI 모니터링은 요청 범위 밖.
