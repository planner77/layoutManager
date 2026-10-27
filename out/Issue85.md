# Issue #85 / M4-A — 임시 CAD Memo Tree (2026-10-28)

## 상태와 안전 경계

- [#85](https://github.com/planner77/layoutManager/issues/85)는 OPEN: M4-A 브라우저 세션 기능 구현 후보이며, M4 전체 수용/종료가 아니다.
- 선행 #82 M1 메모 WCS Overlay는 Main에 구현되어 있다. #83 M2 공유 영속 CRUD/작성자/Role·Site·Audit 및 G7 #109/#96 Owner GO는 아직 준비되지 않았다. #138의 제목 핸들 Drag & Drop 공통 Viewer Panel 역시 실제 구현 미완료.
- CadMemo DB/Prisma Migration/API, SessionAuth, 운영 CAD 저장, S3, Source 파일·SHA, Version Current 및 Server Audit를 변경하지 않는다. 신규 그룹/가시성/검색/선택은 해당 브라우저 MemoSession의 목록에만 적용되고 Reload/Renderer/Version 변경 시 초기화된다.
- 작성자 정보는 인증되지 않아 **작성자 미확정**으로 표시한다. 브라우저 UUID를 신뢰 가능한 서버 작성자로 오인하거나 공유 링크·영구 저장하지 않는다.

## 구조 및 결정

1. src/domain/memo-tree.ts: MemoTreeState(groups, groupByMemo, hiddenMemoIds, hiddenGroupIds), 순수 상태와 유효성 검증/수정. 그룹 깊이 1: Version(실제 scope) → 최대 20개 임시 사용자 그룹 / 미분류 → 메모(최대 100개). 메모 간 부모/자식은 미지원으로 cycle 없음. UUIDv4는 임시 ID, 그룹명 NFC 1~80자, 중복 불가. 그룹 삭제는 소속 메모 미분류 재할당, 메모 삭제는 매핑/visibility 제거.
2. CadMemoTreePanel: 그룹 생성/이름 변경/삭제·재할당, 개별/그룹 Show/Hide, 제목·본문/그룹명 검색, 선택 및 별도 편집, Arrow/Home/End/Enter/Space + roving focus/scroll. Tree 패널 닫힘과 Canvas visible 독립.
3. ViewerAppState 오른쪽 도크에 memos 추가. 작업 > 메모 트리는 작업 > 외곽선 목록과 같은 오른쪽 위치에서 상호 배타적; 모바일은 #127 single modal Drawer/ESC/inert. 보기 > 메모 전체 표시 체크는 Canvas 필터만 변경, CAD Layer/서버/원본 무변경.
4. Canvas 메모 표시 = memoAllVisible AND isMemoVisible(memoTree, memo.id); 숨긴 항목을 Tree에서 직접 선택할 때만 memoTransientFocusId로 해당 핀 임시 강조. WCS Focus는 기존 ViewerManager.focusBounds에 유한한 앵커 ±3 범위 공급, 현재 Version+SHA/유효 Viewer 조건 필수. visibility/Tree 조회로 좌표/텍스트·Source·Generated 변경 없음.
5. #90 서버 전역 검색과 구별: 이번 Tree 검색은 현재 도면 M1 세션 메모만 필터링, DXF 재파싱/재다운로드·신규 서버 API 없음. #84 Snap/Undo, #86 일정·완료, #88 Memo Deep Link, #83 영속은 미구현/게이트 대기.

## 검증 대상과 실제 상태

- src/tests/unit/memo-tree.test.ts: 그룹 고정 깊이/유효성/재할당/삭제·visibility/WCS 불변, 한글/NFC/영문 검색.
- src/tests/unit/viewer-app-state.test.ts: Outline↔Memo Tree 도크, 모바일 단일 Modal, reset.
- src/tests/e2e/issue85-memo-tree.spec.ts: M1 생성/그룹/검색/숨김/Focus/임시 강조/전역 표시/Reload 소멸, 키보드/오른쪽 도크/390px modal.
- 기존 issue82-cad-memo, issue43-outline-tree, issues124-126-127 회귀 필요. 이번 HEAD CI/로컬/현장 시험 **NOT VERIFIED**.

| Issue AC | M4-A 범위 | 최종 상태 |
|---|---|---|
| M4-AC1 | 세션 그룹 1수준/미분류·UUID/재할당/카운트 | PARTIAL: 영속 그룹/parentMemoId 없음 |
| M4-AC2 | 개별/그룹/전체 세션 숨김, Tree 열림 독립 | 구현 후보, 실행 검증 필요 |
| M4-AC3 | 숨김 메모 본문·좌표 보존 | PARTIAL: Reader/저장 visibility 서버 없음 |
| M4-AC4 | WCS Focus, 키보드·모바일 Drawer | PARTIAL: #138 이동 패널/현장 검증 미완료 |
| M4-AC5 | 서버 영속 Tree/공유 visibility 복원 | BLOCKED: #83/#96/#109 |

## Release / QA

- Owner Managed는 리뷰/검증 방식을 정하는 것이지 미실행 시험을 성공으로 만드는 것이 아니다.
- #83/#84/#86/#88/#90를 완료했다고 표시하지 않는다. Issue #85는 OPEN이며, 최신 HEAD 검증과 실제 전체 AC 완료 전 병합·이슈 일괄 종료 금지.
- 기존 v0.43.0 M1 태그/이미지를 이동·재사용하지 않는다. 실 통합 릴리스 시 새 SemVer 및 1회의 Main GHCR App+Migrator 쌍 게시·digest 확인을 요구한다.
