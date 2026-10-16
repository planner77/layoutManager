# GitHub Issue #26 — DXF TEXT/MTEXT 검색과 좌표 줌

## PR #30 / CI #49 — Browser E2E MTEXT 정렬 그룹코드 조치

- CI #49 Run 38868174246: Typecheck, ESLint, Unit/Integration 125건, Production Build, Docker CI 성공. E2E는 38/40 통과로 신규 텍스트 검색 E2E 2건 실패. Legacy migration E2E는 미실행.
- Playwright Trace에서 dxf-viewer의 RenderMText가 "Unhandled alignment"를 발생시킴. three-dxf-viewer에서 최초 검색·좌표 줌은 동작하였으나 dxf-viewer로 전환하면서 같은 오류. 신규 테스트 DXF에 MTEXT group 71 attachment 정보가 없던 것이 원인.
- Autodesk 공식 DXF MTEXT 표에 따라 테스트 문자열에 group 41 reference width, group 71=1(상단 좌측 부착점), group 72=1(좌→우 문자 방향)을 명시. TEXT group 5 핸들도 유효한 hexadecimal로 변경. 생산용 파서/카메라 코드는 변경하지 않음.
- https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-5E5DB93B-F8D3-4433-ADF7-E92E250D2BAB.htm
- 새 CI 재검증, 실제 도면과 독립 QA 검증은 별도. 증거 없는 완료 주장 금지.



## CI #46 진단 — MTEXT continuation spacing

- PR #30 / run 38867179402: TypeScript, ESLint, Docker image/migration/runtime smoke 성공; Unit+Integration 123개 통과·1개 실패. 뒤의 Build/Browser E2E는 실행되지 않았다.
- TC-TEXT-001 테스트 Fixture는 문자열 '동\\P1' + '2\\S1#2;'를 연결하면서 파서가 자동으로 공백을 넣기를 기대했다. MTEXT group-3과 최종 group-1은 문자 그대로 붙여야 하므로 예상이 잘못되었다. 원하는 결과를 재현하도록 Fixture 원문에 실제 공백을 추가했다.
- TC-TEXT-011로 그룹 코드 경계에서 자동 공백 삽입이 없고 실제 공백이 있으면 보존됨을 검증한다. production 파서 변경 없음. 수정 후 전체 CI/Browser 결과는 미확인.



## PR #30 CI #42 실패 분석 및 수정

- 2026-10-16 Run 38865738285: TypeScript 성공, ESLint react-hooks/refs 실패 (Viewer JSX의 manager.current 접근); 이후 Unit/Build/Browser E2E는 스킵. 병렬 Docker runtime CI는 성공.
- React Ref는 render 시 조회하지 않고 stable useCallback getter를 전달하여 자식 effect/결과 선택 이벤트에서 접근한다.
- 리뷰 P2 Unicode escape 길이 문제: Autodesk DXF는 \U+00B0 네 자리만 escape이며 뒤따른 C는 일반 문자. 정규식을 정확히 4자리로 수정, TC-TEXT-010 회귀 테스트 추가.
- 재실행 PR CI는 실제 GitHub run 결과 확인 후 판정한다. 실도면/독립 QA는 계속 미검증이다.



기준일: 2026-10-16. 상태: **기능 브랜치 구현, PR CI 검증 전**. 대상 SemVer 0.27.0. DB/API/schema 변경 없음.

## 요구 및 설계 계약

- 현재 브라우저에서 열린 CAD Version 하나의 텍스트만 검색한다. 기존 파일명·메타데이터·설명 검색과 분리하고 서버 검색 API나 인덱스를 신설하지 않는다.
- ASCII DXF의 ENTITIES TEXT·MTEXT를 검색한다. BLOCK 내부 TEXT·MTEXT는 일반 model-space 단일 INSERT와 중첩 INSERT의 2D 이동·회전·X/Y 비율 축척·BLOCK base point에 대한 affine 합성을 적용하여 각 삽입 위치를 개별 결과로 생성한다.
- Unicode NFC 정규화, 연속 공백 및 줄바꿈 한 공백 처리, 영문 대소문자 무시 부분 일치. DXF Unicode escape 복원, MTEXT 기본 폰트/색/서식 제거·줄바꿈·분수 문자열 처리. DXF 헤더 코드페이지가 명시된 ANSI 949/936/932/950/12xx 및 UTF-8 지원을 시도한다. 미선언 비UTF-8은 조용히 깨진 검색 결과 대신 오류를 반환한다. OCR·정규식·유사도 검색은 제외한다.
- 결과는 표시 문자열, Entity type, layer, optional handle, model/INSERT 출처, 도면 XY focus envelope를 포함한다. **focus envelope는 glyph bbox가 아닌 삽입점을 중심으로 한 근사 범위**이므로 긴 텍스트·정렬·회전 및 실제 대체 글꼴의 전체 영역과 정확히 같다는 보장은 없다.
- 좌표 오안내 방지를 위해 ATTRIB·ATTDEF, 비기본 OCS/extrusion, INSERT 행·열 배열, 없는 BLOCK, 순환·과도한 중첩, 비정상 값, 비표시 Entity는 건수와 함께 제외한다. TEXT/MTEXT 이외 XREF·PAPERSPACE·MLEADER·치수 텍스트·3D는 미지원이다.
- ViewerSource가 보유한 원본 CAD bytes에서 필요할 때만 Web Worker로 인덱싱한다. 60초 제한, 최대 20,000개 결과, 목록 100개 페이지. Worker는 Viewer/Version 변경 시 취소, 메모리 캐시는 같은 Version의 렌더러 변경에서 재사용하며 Version 교체·명시적 재로드 시 폐기한다.
- ViewerManager.focusBounds는 world 좌표를 검증하고 각 renderer로 위임한다. dxf-viewer는 GetOrigin을 빼서 SetView를 호출하고, three-dxf-viewer는 orthographic camera와 OrbitControls target을 실제 world XY로 설정한다. zoomIn 반복으로 위치를 추측하지 않는다.
- 검색 UI는 Viewer shell 내부의 오른쪽 접이식 오버레이로 구성해 보통 화면, CSS immersive, native fullscreen에 동작한다. 검색어·결과 개수·선택 순번·이전/다음·페이지·상태·오류·제외 수를 안내한다. 현재 숨긴 레이어는 결과에서 제외하고 기존 표시 상태를 변경하지 않는다. 결과 문자열은 React plain text로 표시한다.
- DWG 텍스트 지원은 **비지원**. 현재 libredwg-web의 primitives는 평면 LINE 외의 entity를 제외하며 DWG TEXT/MTEXT 파싱·렌더링·좌표 집중의 전 과정에 대한 재현 실험이 수행되지 않았다. 지원을 추정하지 않는다.

## 구현 추적

| 분야 | 구현 위치 |
| --- | --- |
| 추출·정규화·BLOCK 좌표 | src/viewers/core/text-index.ts |
| Web Worker/취소·생명주기 | src/viewers/core/text-index.worker.ts 및 adapter.ts |
| 원본·색인 메모리 재사용 | src/viewers/core/source.ts |
| 두 DXF 렌더러 카메라 포커스 | src/viewers/dxf-viewer/adapter.ts 및 src/viewers/three-dxf-viewer/adapter.ts |
| 검색 UI와 Viewer 생명주기 | src/features/cad-viewer/cad-text-search.tsx 및 viewer.tsx |

## 수용/테스트 현황

| AC | 검증 계획 | 상태 |
| --- | --- | --- |
| TEXT·MTEXT 한글/영문/숫자·서식/개행 | TC-TEXT-001 | Unit 소스 추가, 실행 전 |
| 같은 문자열 3개 이상의 고유 위치 이동 | TC-TEXT-002 / E2E-001 | Unit/E2E 소스 추가, 실행 전 |
| INSERT 이동·회전·축척·base point | TC-TEXT-003 | Unit 소스 추가, 실행 전 |
| 미지원 형식·잘못된 좌표·순환·악성 문자열 | TC-TEXT-004~006 | Unit 소스 추가, 실행 전 |
| 두 Viewer와 전체 화면·재진입·캐시 | TC-TEXT-E2E-001 | E2E 소스 추가, 실행 전 |
| 실도면, 많은 검색 결과, 레이어/취소 스트레스 | 현장·확대 검증 | 미완료 |
| DWG 실제 TEXT/MTEXT 추출·렌더 가능성 | DWG 독립 실험 | 미실행, 비지원 |

미실행 테스트를 PASS로 기록하지 않는다. 독립 QA, PR CI, 실제 DXF/DWG 업무 도면 확인도 현 시점 미완료다.

## #25·외부 라이브러리 관계

#25의 기본 전체 화면 진입은 별도 이슈다. 이 변경은 그 화면 내부에도 검색 패널이 남도록 Viewer shell 안에 구현한다. #25가 아직 main에 없음을 인지한다. 외부 Viewer 패키지를 직접 패치하지 않는다. 관련 공식 공개 소스: https://github.com/vagran/dxf-viewer/blob/master/src/index.d.ts, https://github.com/ieskudero/three-dxf-viewer, https://github.com/gdsestimating/dxf-parser
