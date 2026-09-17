# GitHub Issue #17 — 전체 화면 three-dxf-viewer 레이어 선택/표시 제어

기준일: 2026-09-18  
작업 브랜치: `feature/issue-17-fullscreen-layer-panel` (PR #21 병합 후 자동 삭제)  
대상/릴리스 버전: `0.24.0`  
PR: #21

## 버저닝 판단

이번 변경은 기존 Viewer/API/DB 호환성을 유지하면서 전체 화면에서 사용할 수 있는 신규 레이어 제어 UI를 추가하므로 SemVer MINOR로 분류했다. 애플리케이션 버전의 단일 기준인 `src/package.json`을 `0.23.0`에서 `0.24.0`으로 갱신했다.

외부 dependency, DB schema/migration, API contract는 변경하지 않았다. `src/package-lock.json`의 루트 version 메타데이터는 기존 릴리스부터 애플리케이션 버전과 분리되어 있으며 dependency graph 변경이 없으므로 이번 작업에서 수정하지 않았다.

## 요구사항 명확화

Issue #17은 기존 일반 화면 레이어 드롭다운을 대체하지 않는다. `three-dxf-viewer`가 정상 로드되고 현재 DXF에서 하나 이상의 레이어를 취득한 경우, 전체 화면 안에서 레이어를 직접 확인하고 표시/숨김할 수 있는 별도 패널을 제공한다.

- 전체 화면 + `three-dxf-viewer` + ready + 레이어 존재 조건에서만 패널을 표시한다.
- 패널은 좌측에 배치하고 최초 전체 화면 진입 시 펼친 상태로 표시한다.
- 패널은 접기/펼치기를 지원한다.
- 많은 레이어를 처리할 수 있도록 레이어 목록 영역만 세로 스크롤한다.
- 각 레이어는 체크박스로 표시 여부를 제어한다.
- `전체 선택` / `전체 해제`를 제공한다.
- 일반 화면 `LayerDropdown`과 전체 화면 패널은 동일 `selectedLayers` 상태를 공유한다.
- 레이어 변경은 기존 `ViewerManager.showLayer()`를 통해 현재 Adapter에 즉시 반영한다.
- 레이어 토글 때문에 ViewerManager, Adapter, Canvas를 재생성하거나 원본을 다시 다운로드하지 않는다.
- 따라서 사용자가 보고 있던 카메라/줌/팬 상태를 유지한다.
- 다른 Viewer에는 전체 화면 레이어 패널을 표시하지 않는다.
- 다른 도면, Renderer 전환, 다시 불러오기는 기존 load lifecycle에 따라 새 레이어 목록을 취득하고 전체 선택 상태로 초기화한다.

## 기존 구조 분석 및 구현

`src/viewers/three-dxf-viewer/adapter.ts`는 이미 다음 Adapter contract를 구현한다.

- `getLayers()`: Three.js Object tree의 `userData.entity.layer` metadata를 순회하여 정렬된 레이어 목록 반환
- `showLayer(name, visible)`: 동일 metadata를 가진 Object의 `visible`만 변경하고 즉시 render

따라서 upstream `three-dxf-viewer` 내부 API를 추가로 의존하거나 Three.js scene 구조를 UI에서 직접 다루지 않았다. 기존 Adapter 경계를 유지하는 방식으로 구현했다.

### `src/features/cad-viewer/fullscreen-layer-panel.tsx`

- 전체 화면용 presentation component
- `layers`, `selected`, `onLayerChange`, `onAllChange`만 입력받으며 Viewer 객체를 직접 알지 않는다.
- native checkbox로 레이어별 선택 상태와 접근 가능한 이름을 제공한다.
- 접힌 상태에서는 `레이어 패널 펼치기` 버튼만 남긴다.
- 열린 상태에서는 선택 개수/전체 개수, 전체 선택/해제, scrollable layer list를 제공한다.

### `src/features/cad-viewer/viewer.tsx`

- 기존 inline 레이어 변경 코드를 `setLayerVisibility`, `setAllLayersVisibility` 함수로 통합했다.
- 일반 `LayerDropdown`과 `FullscreenLayerPanel`에 동일 함수를 전달한다.
- 전체 화면 shell 내부에만 패널을 mount한다.
- `isFullscreen`은 Viewer load effect dependency가 아니므로 패널 조작/접기/펼치기로 Viewer가 재생성되지 않는다.

## Acceptance Criteria 매핑

- AC1 전체 화면 레이어 패널 표시: `three-dxf-viewer` + ready + layers 조건부 mount — 완료
- AC2 레이어 목록 표시: 기존 Adapter `getLayers()` 결과 사용 — 완료
- AC3 즉시 표시/숨김: 기존 `showLayer()` 호출 후 render — 완료
- AC4 카메라/줌 유지: Viewer/Adapter/Canvas 재생성 없음 — 완료
- AC5 다른 도면 갱신: 기존 load 완료 시 새 `layers` 및 전체 선택 초기화 — 완료
- AC6 다른 Viewer 영향 없음: renderer 조건으로 패널 미표시 — 완료
- AC7 기존 Viewer 기능 회귀 방지: 전체 화면/확대/축소/맞춤/Escape 기존 E2E 포함 — 완료

## 자동 검증

`src/tests/e2e/issue17-fullscreen-layers.spec.ts`의 `TC-ISSUE17-001`은 다음을 검증한다.

1. 한글/영문/숫자/공백이 포함된 복수 레이어 DXF
2. 전체 화면 패널 및 최초 전체 선택 상태
3. 개별 레이어 표시/숨김에 따른 실제 canvas 변화
4. 전체 선택/전체 해제와 선택 상태
5. 레이어 조작 중 content API 추가 요청 없음
6. 레이어 조작 중 동일 Canvas DOM 인스턴스 유지
7. 전체 화면 종료 후 진입 전 확대 상태 복원
8. 패널 접기/펼치기
9. 일반 `LayerDropdown`과 상태 동기화
10. `dxf-viewer` 전체 화면에서 레이어 패널 미표시

## PR / CI 결과

PR #21에서 다음 CI 보완 과정을 거쳤다.

- run `35277124003`: TypeScript 단계 실패. 공통 `Button`이 지원하지 않는 `secondary` variant를 사용한 것이 원인이며 `outline`으로 수정했다.
- run `35277242955`: TypeScript/ESLint/23 files 105 tests/Production build PASS, Chromium E2E 34/35. 전체 화면 진입 전 screenshot을 진입 후 resize된 canvas와 직접 비교한 잘못된 기준점을 수정했다.
- run `35277825527`: 정적 검사/Unit·Integration/Build PASS, Chromium E2E 34/35. WebGL 레이어 복원 후 픽셀 완전 일치를 요구한 assertion이 과도하게 엄격해, 렌더 변화·선택 상태·동일 canvas·추가 GET 없음·view state 복원을 각각 검증하도록 안정화했다.
- 최종 run `35278486135`: **PASS**
  - Node.js 22.14.0 / `npm ci`: PASS
  - Prisma Client 생성: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Unit / Integration: **23 files / 105 tests PASS**
  - Production build: PASS
  - Chromium Playwright E2E: **35 / 35 PASS**

`npm ci`와 Docker build에서 기존 dependency에 대한 high severity audit 경고 4건이 출력됐으나 Issue #17에서는 dependency 버전을 변경하지 않았고 CI 실패 조건도 아니다.

## 병합 및 릴리스

- 병합 방식: squash merge
- PR #21 merge commit: `b7fdeb34e25f0dc66790ed421bcaf105f6801db3`
- merge commit: GitHub verified
- 작업 branch `feature/issue-17-fullscreen-layer-panel`: 병합 후 자동 삭제 확인
- Issue #17: `completed` 상태로 종료
- Release tag: `v0.24.0`
- Annotated tag 대상: `b7fdeb34e25f0dc66790ed421bcaf105f6801db3`
- Docker publish workflow: run `35279000480` PASS
- GHCR: `ghcr.io/planner77/layoutmanager:0.24.0`, `ghcr.io/planner77/layoutmanager:latest`
- Digest: `sha256:bfd80f24e43b5e108c480b3a51913daa66d47331c880855f340233468616993c`
- OCI revision: `b7fdeb34e25f0dc66790ed421bcaf105f6801db3`
- OCI version: `0.24.0`

상세 릴리스 근거는 [Release 0.24.0](Release-0.24.0.md)을 기준으로 한다.

## 검증 경계

CI는 합성 복수 레이어 DXF와 기존 Viewer 회귀를 검증했다. 매우 많은 레이어를 가진 실제 업무 DXF의 현장 사용성·성능은 이번 GitHub Actions 검증 범위에 포함하지 않았으므로 별도 운영 smoke test 대상으로 남긴다.
