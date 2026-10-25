# Issue #43 — U6 외곽선 목록·업무 타입별 트리 (v0.36.0)

- 이슈: https://github.com/planner77/layoutManager/issues/43 · Epic #37, 선행 #31/#38/#39/#40/#42.
- DESIGN.md는 현 저장소에 없으므로 AGENTS.md, out/Architecture.md, out/Requirements.md, ADR-039 및 관련 Issue 문서를 기준으로 한다.
- **구현 범위**: 현재 Viewer 브라우저 세션에서 생성·임시 확정한 SavedOutline Overlay의 트리 조회, 그룹화, 강조/Zoom, 개별·그룹 표시/숨김, 선택/삭제, 접근성/도킹.
- **제외/차단**: 실제 관리자 타입 API/카탈로그(#65), 인증·Scope·RBAC·감사 및 #31 P4 영속 API/DB/재접속 복원, 권한 미승인 상태의 운영 타입 등록, DXF 원본 편집.

## 설계·구현 계획

1. UI 메뉴·Dock: U1 Shell 우측 도크에 상단 메뉴 ON/OFF 연동. 좌측 레이어·외곽선 생성 도구와 상태 독립; 모바일 한 패널 흐름, ARIA tree/treeitem/group, 키보드 Arrow/Home/End/Enter/Space 및 닫을 때 메뉴 포커스 복귀. 미지원 Renderer/Version/로딩/원본 SHA 미검증 시 조작 불가·사유 표시.
2. Tree projection: src/domain/outline-tree.ts의 순수 함수에서 업무 타입의 **불변 ID**로 그룹화, 최신 카탈로그 이름이 있을 때 그 값을 사용하고 제거/비활성 타입은 확정 당시 이름 스냅샷 사용. 타입 없는 v1은 미분류(legacy)로 명시. 현재 서버 카탈로그 부재: 실제 운영에서 2개 Admin 타입이 뜬다는 의미가 아님. Unit에서는 2개 synthetic 타입을 테스트.
3. Overlay: Adapter는 임시 확정 결과를 개별 THREE.Group으로 관리. Visibility/selected는 SavedOutline JSON 필드가 아닌 별도 브라우저 상태로 유지. 숨김도 데이터/트리에서 삭제되지 않음. 타입/개별 토글은 DXF 레이어·Worker/Source/선택도구를 수정하지 않음.
4. 선택/Zoom: 확정된 Polygon/MultiPolygon의 외부 경계와 hole을 포함한 WCS 전체 Envelope을 계산해 ViewerManager.focusBounds 호출. 유한하지 않거나 퇴화/범위 초과 기하 거부. 화면 강조는 원본과 분리된 Overlay group, 숨긴 외곽선은 선택해도 임의로 재표시하지 않음.
5. 수명주기: SavedOutline 생성/삭제 때만 Snapshot 갱신(Drag/Frame 당 React 갱신 없음). ON 생성 도구에서만 개별 임시 결과 삭제 가능(#40 정책). local ID는 삭제 후 재사용하지 않고 세션 내 100개 제한. Renderer/Version 변경/Reload/Dispose에서 temporary 모두 해제. v1 JSON export 형식 그대로 유지.
6. 검증: TC-U6-UNIT-001~003 및 TC-U6-E2E-001~002. 기존 #31/#38~#42 레이어/키보드/ESC/Worker/JSON/Renderer/Legacy migration 회귀. 100건 상한에서는 가상화 대신 scroll; >100 또는 서버 영속 외곽선 조회 도입 시 측정 후 virtualize/페이징 검토.

## 수용 기준별 현재 상태

| AC | 구현 / 검증코드 | PR CI 전 |
| --- | --- | --- |
| U6-01 타입 두 개·legacy·개수·표식 | Tree projection / UNIT-001 | **PARTIAL/BLOCKED #65** (두 타입은 테스트 fixture; 실제 관리자 카탈로그 아님) |
| U6-02 선택/강조/FocusBounds, 원본 비변형 | Domain bounds + Manager/Adapter / UNIT-002/003, E2E-001 | CODED / NOT VERIFIED |
| U6-03 개별·그룹 눈, 레이어/생성 토글 독립 | Adapter/TreePanel / E2E-001 | CODED / NOT VERIFIED |
| U6-04 생성/삭제/Reload/Renderer/Version | Adapter 세션 계약 / E2E-001/002 | CODED / NOT VERIFIED |
| U6-05 두 도크, 320px, 키보드/ESC/Fullscreen | Viewer Shell, TreePanel / E2E-001 + 기존 회귀 | CODED / NOT VERIFIED, native 브라우저 실증 별도 |
| U6-06 영속 복원 | 승인 전 임시 트리만; Server GET/저장은 미구현 | **BLOCKED #65/#31 P4** |

## 검증·CI·범위 제한

- 로컬 npm/Prisma/TypeScript/ESLint/Vitest/Next/Playwright/실제 CAD·GPU 시험은 GitHub 원격 변경 환경에서 **NOT RUN**. 시험 코드 작성이나 PR CI 시작은 성공 증거가 아니다.
- 이번 요청의 종료점은 미해결 리뷰/충돌 점검 후 PR CI를 시작하는 것이다. Main 병합/GHCR/Issue 종료는 수행하지 않는다.
- Server/Admin 권한·영구 저장·Scoped catalog 실데이터는 #65/#31 P4 승인 전 절대 활성화하지 않으며, #42 잔여 운영 수용 #71도 우회하지 않는다.
