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
