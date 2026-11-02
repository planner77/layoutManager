## PR #175 Owner Managed implementation close-out (2026-10-31)

- Final [PR CI #341](https://github.com/planner77/layoutManager/actions/runs/41142161238) **completed/success** at exact `a6d3bdef1cc3e8a12ca95e918b5a2d49fad83d50`: Verify/Docker two jobs SUCCESS. Earlier TS18047 + Docker build and WebGL screenshot exact-byte E2E issues resolved. 3 Codex inline review threads all resolved, Main behind=0 and mergeable=true.
- Squash Main source `c3e55a95ed2c7a61413e5b0577004252994fe988`, subject `#85 | Memo Tree and optional schedule/completion (#86)`. [Issue #85](https://github.com/planner77/layoutManager/issues/85) and [#86](https://github.com/planner77/layoutManager/issues/86) completed per Owner instruction and closure comments.
- Scope accepted for implementation: one-level Memo group/unclassified tree, temporary and persistent visibility, WCS focus, desktop movable+mobile modal Tree, independent optional date-only schedule and completion with UTC/CAS/audit. Optional nested memo-parent hierarchy, cross-owner edit (#172), legacy volume schema upgrade, real-site acceptance (#96/#113) **NOT** part of completed scope.
- Main [GHCR release workflow Run #41145893248](https://github.com/planner77/layoutManager/actions/runs/41145893248) **started** on the Squash commit, expected app `0.47.3` and migrator `0.47.3-migrate` paired publication. Actual release success/digests remain **NOT VERIFIED** without monitoring. This report is docs-only after merge; release images must identify the merge commit, not the metadata commit.

---

## #175 PR CI Run #41139632431 — 합성 Viewer Layer 복원 회귀 (2026-10-31)

- Docker/Typecheck/Lint/Unit·Integration/Build 성공, 101 Playwright 합격·2개 기존 Layer restore E2E 실패. Artifact Trace에서 Layer 체크/시각적 선은 복원됐으나 초기/마지막 화면의 작은 raster 크기 변화 때문에 PNG Buffer 동일성 검증이 timeout. 중앙 Source 획의 크기 정규화 및 근접 일치, 빈 Canvas 실패를 유지하는 테스트 helper로 변경. Canvas/Renderer/Layer 제품 코드 불변.
- 새 PR CI 결과는 별도 확인 전 NOT VERIFIED. 기존 #175 Codex 3개 리뷰 Resolved는 유지; Main 충돌 및 신규 코멘트는 최종 HEAD 기준 재조회. [FailureLedger](FailureLedger.md).

---

## 2026-10-31 PR #175 failure and review repairs

First PR CI [#41137913177](https://github.com/planner77/layoutManager/actions/runs/41137913177) at `f9fbef1099`: TS18047 nullable Version/group in MemoGroupRepository caused Verify Typecheck (5 diagnostics) and dependent Docker Next baseline build failure. Unit/E2E/Compose runtime were skipped. Both guards now explicitly terminate with `return blocked`.
Codex findings P1 draggable desktop Memo Tree (#138) and P2 canonical session-group synchronization/status filter have corresponding code and tests. Floating component uses one mounted right-side drawer, panel-scope reset and CSS workspace bounds, not CAD WCS; 320/390 mobile stays modal. Previous v0.47.2 Anchor baseline is still read as one-row recognized schema without automatic migration.
Three Codex threads [r4429007637](https://github.com/planner77/layoutManager/pull/175#discussion_r4429007637), [r4429007642](https://github.com/planner77/layoutManager/pull/175#discussion_r4429007642), [r4429007644](https://github.com/planner77/layoutManager/pull/175#discussion_r4429007644) replied and resolved. Tests and new PR CI result are pending, no PASS claim.

---

# Issues #85/#86 — M4 Memo Tree and M5 Schedule (2026-10-31)

## Sources and dependencies
[Issue #85](https://github.com/planner77/layoutManager/issues/85), [Issue #86](https://github.com/planner77/layoutManager/issues/86), AGENTS.md, out/Architecture.md, out/Decisions.md, out/ViewerPanelPolicy.md, out/Database.md. Main has #82 M1, #83 M2 and #84 M3. Draft PR #148 used pre-M2 session-only tree; only its domain/UI/keyboard tests are ported.

## #85 M4
- Tree Version/SHA -> one-level UUID group or unclassified -> Memo ID. Up to 20 groups/Version and 100 Memo/Version; group names NFC 1..80. One-level prevents parent cycles, optional author or Memo parent not implemented.
- CadMemoGroup lives in freshly empty Greenfield only. Group create/rename/delete requires authenticated G7 memo:write Site/Version/SHA, creator ownership and CAS. Group delete soft-deletes and atomically reassigns live memos to unclassified with per-Memo revision/audit. Foreign-owned member blocks whole transaction, never silently edits it.
- CadMemoFeature stores group membership and persistent `visible`. Individual saved visibility and assignment require Memo author/CAS and append-only business audit.
- Whole/group/item Show/Hide remains Viewer-session-only; Reader can hide locally without DB mutation. Hidden item stays in search and requires explicit confirmation for WCS focus; transient pin focus never persists visibility. Drawer shares right slot with Outline; compact mode uses one dialog. Menus: `보기 > 메모 전체 표시`, `작업 > 메모 트리`; ARIA tree arrows/Home/End/Enter/Space.
- Owner-only authorization is maintained pending #172 cross-author collaboration decision.

## #86 M5
- Schedule: explicit enable, nullable strict Gregorian YYYY-MM-DD start/due, start <= due, never local timezone conversion. Completion: explicit enable, checked status, server-only completedAt UTC. First check records server UTC; repeat save retains it; uncheck/disable clears. OFF confirmation clears values; re-enable blank/incomplete.
- One metadata PATCH closed-world input `expectedRevision,operation=metadata,groupId,visible,scheduleEnabled,startDate,dueDate,completionEnabled,isCompleted`. Server never accepts completedAt or actor IDs, checks Site/Version/SHA/creator and CAS 409, and performs sidecar + Memo Revision + Audit atomically. Tree shows status badge and all/unmanaged/in-progress/completed filter.
- No reminders, overdue auto-action, calendar sync or tenant-wide cross-editor writes.

## New-install-only schema / operation contract
- Newly EMPTY G7 baseline `202610310002_greenfield_memo_m45_baseline`, ID `G7-GREENFIELD-MEMO-M45-20261031-1`: CadMemoGroup, CadMemoFeature, 2 indexes, 2 immutable-scope triggers and SQLite FK/CHECK invariants. Prior CAD_BUSINESS_DDL, CAD_ANCHOR_DDL, and all historical schema fingerprints unchanged.
- Old M2 read is allowed, but no persistent M4/M5 sidecar mutation without feature schema (503). Existing deployed SQLite/CAD volumes are never ALTERed, adopted, backfilled, deleted or migrated. Separate fresh App/Migrator pair and Owner runtime approval are required for deployment.
- M3 pin WCS/Anchor, S6 Scene/Origin reset, Outline and raw DXF are not modified by Memo metadata.

## Acceptance / evidence
- Tests: ported M4 tree keyboard/visibility/compact UI; date-only leap/range/null, server UTC completion, forged completedAt; SQLite sidecar FK/CHECK/immutable triggers. Required PR CI: typecheck, lint, unit, integration, E2E, Docker pair and Greenfield baseline; Site/author/409/audit and M3/S6 regressions.
- **Current state:** repository changes staged, but actual CI PASS, GHCR, Main merge and live Owner-site acceptance are NOT verified. User authorized PR CI launch without monitoring; no merge, GHCR release or issue closure yet.
