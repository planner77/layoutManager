# Issue #40 — 상단 메뉴 외곽선 생성 토글 / U3 (v0.33.0)

- GitHub: https://github.com/planner77/layoutManager/issues/40
- Epic: #37; 선행 #38(U1), #39(U2), #31(기하·Worker·Mapping); 후속 #41(관리자 유형), #42(외곽선 타입 지정), #43(트리/표시).
- 기준: main `296d570ea62e26a3fc40c57685268921df15199a`; 브랜치 `feat/issue-40-outline-tool-toggle`.
- 설계 근거: `AGENTS.md`, `out/Architecture.md`, `out/Decisions.md`(ADR-033/035/036), `out/Issue31.md`, `out/Issue38.md`, `out/Issue39.md`. 이 저장소에는 별도 루트 `DESIGN.md`가 없다.
- 상태: 소스·시험 코드 작성, **PR CI 결과 미검증**. Build/Typecheck/Lint/Vitest/Playwright/현장 CAD는 실행 증거 없는 동안 NOT RUN. 병합·GHCR·릴리스·이슈 종료는 현재 요청 범위 밖.

## PR #48 최초 CI 차단 및 보완 — 2026-10-25

- [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671), HEAD `850ded8`: npm ci·Prisma Client·TypeScript **PASS**, `viewer.tsx:404:186 react-hooks/refs` **FAIL**, `viewer.tsx:363:6 exhaustive-deps` **warning**, 후속 Unit/Benchmark/Build/E2E **SKIPPED**, 독립 Docker-runtime **PASS**. 실패 상세는 [FailureLedger](FailureLedger.md).
- **원인/교정:** `resetOutline`에서 읽는 Ref가 동적 Renderer 버튼 render `map` 안의 `choose(value)` 경로로 전파되고 load effect에는 `resetOutline` 의존성이 없었다. `stopOutlineEditing/resetOutline/choose`를 `useCallback`으로 안정화하고 load effect의 dependency를 명시했으며, Renderer 버튼을 2개의 정적 JSX로 변경. #31 Worker·Adapter 및 확정 결과 세션 정책은 유지한다.
- **별도 P2 리뷰:** [Space/keyboard](https://github.com/planner77/layoutManager/pull/48#discussion_r4369181241) — window capture는 버튼·메뉴 등 인터랙티브 포커스 대상을 Space Pan으로 가로채지 않는다. E2E에서 상단 버튼 **Enter ON → Space OFF → Space ON**과 **canvas Space+drag**가 선택을 만들지 않음을 검증하도록 수정했다.
- 코드 보완 commit `0ba21a66e02c5a842e527ececdb678f447940a8f`. 새 Head의 PR CI/실기기/실도면 결과는 **미확인**; Run 시작만 확인 후 모니터링하지 않는다.

## PR #48 두 번째 CI 실패 원인과 테스트만 보완 (2026-10-25)

- [Run 40150085136](https://github.com/planner77/layoutManager/actions/runs/40150085136): npm ci·Prisma·Typecheck·Lint·Unit·Benchmark·Production Build **PASS**. Chromium E2E **52/54 PASS, 2 FAIL**, Legacy migration E2E **SKIPPED**, 독립 Docker smoke **PASS**. 첫 번째 `react-hooks/refs` 오류는 이 HEAD에서 재발하지 않았다. 자세한 Job/Trace 출처는 [FailureLedger](FailureLedger.md).
- `TC-OUT-E2E-001`: 재로드는 U3 도구를 **OFF로 초기화**하므로 패널을 찾으면 안 된다. 정상 표시와 `aria-pressed=false`/panel absent 후 메뉴 ON→`선택 0개`로 테스트 기대를 교정한다.
- `TC-U3-E2E-003`: Playwright Artifact `trace.zip`의 Browser console 오류 `n must be greater than 0 vertices`를 확인. 원본 합성 LWPOLYLINE에 4개 좌표쌍을 제공하면서 **group 90=vertex count 4**를 누락하여 `dxf-viewer`가 실패했다. [Autodesk DXF Reference](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm) 기준으로 두 합성 DXF에 `90,4`를 추가한다. 운영 DXF/라이브러리 Parser/제품 기능 변경 없이 Renderer 교차 호환성을 검증.
- [수정 Commit `fd1f4613`](https://github.com/planner77/layoutManager/commit/fd1f4613c1cc69b2f383c7cc4129a8d95d70ec39): E2E Fixture/Expectation 2파일 교정, 기존 #31 worker/export/ESC 정책 유지. 새 HEAD의 Unit/E2E/Build 성과는 새 CI Run 결과 확인 전 **NOT VERIFIED**.

## 현황 및 문제 정의

#38과 #39의 `ViewerAppShell`·`ViewerMenuBar`는 상단 **외곽선 생성** 항목이 준비 중(disabled)이었으나 #31 선택 기능은 하단 도크에서 직접 켤 수 있었다. 이 때문에 시작 상태 OFF, 미확정 경계 취소, 임시 확정 결과 보존, Renderer 미지원 차단을 하나의 UI 계약으로 보장하지 못했다. #31의 Source ↔ rendered Handle/Type/Layer/WCS audit과 Worker는 정상 개발 자산이므로 재구현하지 않는다.

## 설계·구현 계획

1. `outline-tool-policy.ts`에 Renderer/format/loading/ready/Version SHA-256 메타데이터(64-hex)/mapped Entity 수로 지원 여부와 사용자 사유를 계산한다. 미지원 또는 원본↔렌더 비교로 **선택 가능한 Entity 0개**면 fail-closed. Version의 SHA 실제 바이트 무결성은 기존 등록/조회 계약에 귀속되며 단순 문자열 형식 검사를 cryptographic 재검증으로 오인하지 않는다.
2. 기존 `ViewerAppState.outlineToolEnabled=false` 단일 UI 상태를 `ViewerMenuBar`로 연결한다. 메뉴 버튼 `aria-pressed`/도구 도크 `aria-controls` 및 Enter/Space 조작을 제공한다. 정상 ON은 ViewerManager의 `select`로, OFF는 `pan`으로 전환한다. 도크/Canvas는 분리하므로 단순 전환으로 ViewerManager/Source를 재구성하지 않는다.
3. OFF는 **Worker 계산 cancel + Preview invalidation → 선택 초기화 → pan 복귀** 순서로 처리한다. 사용자 경고를 표시하고 비확정 `preview`를 비운다. 지연된 Promise/Worker의 오류·결과를 이전 세션으로 판정하여 새 Preview로 반영하지 않는다. OFF→ON 반복으로 리스너/Worker 누수가 생기지 않도록 Adapter/SelectionController 기존 lifecycle을 재사용한다.
4. 임시 확정 결과는 별도의 `savedGroup`/saved list이며 OFF 시 clear하지 않는다. ON 중에는 기존 `JSON 내보내기` 및 `임시 결과 삭제`를 유지하고, OFF 중에도 JSON 내보내기를 제공하는 **읽기 전용 확정 결과 도크**를 남긴다. `#43`의 Overlay 표시/숨김 상태는 별개(현재 미구현); ON/OFF로 임시 확정 Overlay 가시성을 변경하지 않는다.
5. `choose`·`reload`·load error에서는 기존 `reset`과 adapter dispose로 ON bit/Worker/선택/메모리/현재 Version 결과를 정리한다. CSS와 native fullscreen 전환만으로는 reset하지 않는다. #31의 레이어 숨김/선택 제거와 ESC 선택 → 검색 → native → CSS 정책을 유지한다.
6. Type/관리·영구 저장/RBAC, DB migration, API, 원본 CAD 변경은 **없다**. #31 P4 인증·인가 승인 전 변경 금지.

## AC → 구현 → 검증 추적

| AC | 기대 동작 | 구현 | 테스트 |
| --- | --- | --- | --- |
| AC-U3-01 | 기본 OFF; ON select/드래그·다중 선택; OFF pan/zoom | `viewer.tsx`, `viewer-menu-bar.tsx`, `viewer-app-state.ts`(기존) | TC-U3-UNIT-001, TC-U3-E2E-001/002, 기존 TC-OUT-E2E-001 |
| AC-U3-02 | 반복 ON/OFF 시 Worker/선택 인스턴스 중복·stale 결과 차단 | `stopOutlineEditing`, `outlineRequestRevisionRef`, adapter `cancelOutlinePreview`(기존) | TC-U3-UNIT-001/003, TC-U3-E2E-002, 기존 #31 Worker 회귀 |
| AC-U3-03 | OFF 시 비확정 취소 고지, 확정 Overlay/JSON 보존 | `outlineNotice`, `outline-saved-tools`, 기존 adapter savedGroup | TC-U3-E2E-001 |
| AC-U3-04 | ESC/search/native/CSS·레이어 숨김 및 Renderer 전환의 안전성 | SelectionController(기존), `resetOutline`, layer API(기존) | TC-U3-E2E-002/003, 기존 #31/#25/#39 |
| AC-U3-05 | 미지원 Renderer, 0 mapped, missing/invalid SHA, 로딩·오류 disabled + 사유 | `outline-tool-policy.ts`, 상단 menu `disabled`/보조 안내 | TC-U3-UNIT-002, TC-U3-E2E-003 |

## 의도적으로 보존한 제약

- `OutlineKind` CONVEX/PRECISE, Polygon Union, 좌→우 포함/우→좌 교차, Ctrl/⌘ 토글, Space+Pan, 허용 오차·미지원 Entity 경고는 모두 기존 #31 코드와 Worker를 사용한다.
- 영구 저장/재조회는 지원하지 않는다. 임시 확정 Overlay는 **현재 Renderer·Version 메모리 수명 안에서만** 보존되며 reload·Renderer·Version 변경 시 기존 정책대로 제거된다. JSON 내보내기는 클라이언트 다운로드일 뿐 서버 기록이 아니다.
- 오염되거나 위조된 외곽선 JSON/Handle을 서버에 저장하는 경로는 없다. #31 P0/P5 실제 CAD 3종·브라우저 GPU/메모리, native fullscreen 실제 허용/거부, 독립 QA는 별도 검증 대상이다.

## 실행 지침

```bash
cd src
npm ci
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

- 위 명령은 개발/PR CI 재현 절차이며 **실행하지 않았다면 PASS가 아니다**. 실제 결과·Run ID는 `out/TestReport.md`/실패 시 `out/FailureLedger.md`에 기록한다.
- 별도의 사내 승인 DXF는 `npm run test:outline-acceptance` 절차로 운영 실측하며 원본·경로를 Git/CI에 업로드하지 않는다.
