# Issue #55 / #56 — E5 WCS Rotate + E6 Browser JSON v2

작성: 2026-10-31 · 기준 Main `116d04046f75d2bae9fdeeefde7ead0edc011a4f` · 후보 0.48.0

## 근거와 현재 구조
- #51(`canvasEditCapability`)의 `SOURCE/RENDER`·혼합 fail-closed gate, #52(`GeneratedDocument`)의 immutable base + 단일 Undo/Redo, #53 Delete, #54 Translate Ghost/수치 UI, #160/#166 SceneWork와 분리된 APP_CREATED Overlay를 사용한다.
- #127 상단 메뉴 그룹 `도면` 및 `작업`, #138 공통 위치 이동 가능한 도구 Drawer가 이미 있으므로 새 독립 패널을 만들지 않는다.
- Root `DESIGN.md`는 없으며 `AGENTS.md`, `out/Architecture.md`, `out/Decisions.md`가 기본 가이드다.

## E5 회전 상세
- WCS XY에서 positive degree = CCW. 기본 그룹 중심은 선택된 **전체 GENERATED Bounding-Box**의 중심으로 단일 계산, 수치 Pivot X/Y 수동 override 가능.
- `parseWcsRotation`은 유한 부동소수와 ±360000°/±1e12 WCS를 검사한다. `selectedRotation`은 선택 집합 전체의 Origin/Version/SHA/Visibility와 실제 geometry bbox를 검증한다. 값 하나만 잘못되어도 전체 거부.
- Numeric UI는 `작업 → 선택·편집 도구`에 있으며 `GeneratedDocument.execute({type:'Rotate'})`가 모든 대상 사전 검증 후 한 이력으로 확정한다.
- 회전 핸들↻은 선택 경계 상단에 표시하며 별도 Pointer Capture, WCS atan2와 THREE Ghost만 변경한다. Mouse release 때 원자 Commit, ESC/pointercancel/lostCapture/camera/wheel/resize/Renderer/Version 전환 때 Document 그대로 취소. Hole/MultiPolygon과 UUID/base 구조는 유지.
- 스케일/대칭/Z 변경, 원본 Source/Render 직접 Rotate는 제외.

## E6 브라우저 파일 계약

```json
{
  "format": "cad-generated-objects",
  "schemaVersion": 2,
  "versionId": "<same-drawing-UUID>",
  "sourceSha256": "<same-64-digit-SHA>",
  "coordinateSystem": "DXF_WCS_XY",
  "unitCode": 4,
  "persistence": "BROWSER_EXPORT_ONLY",
  "sourceAttestable": false,
  "objects": [
    {
      "id": "<APP_CREATED-UUID-v4>",
      "savedOutlineId": "local-1",
      "origin": "APP_CREATED",
      "kind": "PRECISE",
      "name": "example",
      "outlineTypeId": null,
      "outlineTypeName": null,
      "visible": true,
      "baseGeometry": {"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]},
      "baseResult": {"kind":"PRECISE","algorithm":"polygon-clipping-union-v1","tolerance":0.02,
        "sourceEntityIds":[],"persistable":false,"geometryBasis":"RENDER_WCS_2D",
        "derivedFrom":[],"warnings":[],"durationMs":0},
      "transform": [1,0,0,1,0,0],
      "transformOperations": [],
      "editedGeometry": {"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]},
      "provenance": {"origin":"APP_CREATED","sourceAttestable":false,"editedByUser":false},
      "createdAt": "2026-10-31T00:00:00.000Z",
      "editedAt": null,
      "edited": false
    }
  ]
}
```

- 신뢰 영역: 업로드 파일은 사용자 단말의 **불신 JSON**. `File.text`와 `JSON.parse` 후 버전/SHA/단위·타입/ID 중복/Origin/Provenance/Geometry/출처 필드를 모두 검사한다. TransformOperations는 Translate/Rotate만 허용, 원본 base에 대해 재계산한 matrix와 editedGeometry가 일치하지 않으면 거부. 행 하나라도 거부되면 기존 Session/Undo/Redo 유지.
- 상한: 12MiB, 100 objects, 총 100000 vertices, object당 64 operations, WCS ±1e12, Polygon/MultiPolygon closed rings and nonzero area. 저장 결과는 Browser Document 전체 교체만 허용하고 기존 데이터는 UI에서 명시적으로 확인, 이전 Undo/Redo 복원하지 않음.
- 기존 #31 Source-only v1/typed v2 입력은 `parseOutlineExport`로 안정적인 Handle을 검증한 다음 Browser UUID를 생성해 Legacy 복원한다. 타입 메타가 있으면 유지한다. v3 Render Scene export와 Browser edited v2는 서로 다른 스키마임을 구분한다. 기존 `buildOutlineExport` 버튼은 변경하지 않는다.
- API/DB/Prisma/Auth/서버 Canonical/원본 DXF/Current/SHA 변경하지 않는다. Browser APP_CREATED provenance가 서버의 Source Attestation을 인증하지 않는다.

## 구현 위치 및 검증
- Domain: `src/domain/generated-rotate.ts`, `generated-transfer.ts`, `generated-document.ts`.
- Adapter: `src/viewers/three-dxf-viewer/adapter.ts`, `src/viewers/core/adapter.ts`.
- UI: `src/features/cad-viewer/viewer.tsx`, 기존 Viewer menu/drawer.
- Unit: `src/tests/unit/generated-rotate.test.ts`, `generated-transfer.test.ts`.
- Browser: `src/tests/e2e/issues55-56-generated-rotate-json.spec.ts`.
- 상위 게이트: `out/TestPlan.md`, 검증 상태 `out/TestReport.md`, CI·리뷰·충돌 기록 `out/FailureLedger.md`. 최신 CI/실도면 결과는 별도 증거 없으면 미검증으로 남긴다.
