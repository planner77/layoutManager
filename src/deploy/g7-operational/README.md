# #109 G7 S2 — Private operational readiness kit / S3 remains OFF

**Status:** S1 Owner accepted; S2 preparation authorized, but **NO RELEASE-SPECIFIC
S3 GO**. This branch implements *candidate* operational integration and
offline evidence tooling. It does **not** migrate real databases, publish GHCR
images, edit Nginx/Compose/.env, read real CAD/S3 or activate production.

## Code split

- Default App router and source-backed CAD GET/Viewer/download remain anonymous.
- The existing Multipart CAD `POST /api/cad-files`,
  `PUT /api/cad-locations/{locationId}/current`,
  `DELETE /api/cad-files/{versionId}` have a **three-state guard**:
  * **Legacy:** no operational G7 flags/GO requested: previous behavior preserved
  * **Blocked:** partial/invalid/expired GO, auth-only without write, bad
    session/CSRF: 401/403/503 fail closed; NEVER fallback to anonymous write
  * **Protected:** explicitly valid S3 private release approval AND
    `G7_AUTH_ENABLED=true` AND `G7_CAD_WRITE_CUTOVER_ENABLED=true`.
    Current User+Role+Site/Version->Site, session lifetime and token digest are
    reloaded in the **same Prisma transaction** as business mutation and
    `CAD_UPLOADED/CAD_CURRENT_CHANGED/CAD_VERSION_DELETED` Audit INSERT.
    Failed Audit INSERT rolls back DB change; upload's existing storage
    compensation/deletion-job logic remains in use.
- Private, release-locked `/api/g7-operation/{auth,access}/{action}`:
  login/logout/initial change/change/session + permit/grant/disable/audit.
  Unapproved persistence for Outline/Memo/Type/Logs or Audit physical purge
  remains **404/OFF**. Only S3 GO provides browser Login and session-bound CSRF
  on the existing upload/Current/Delete UI; no GO leaves the UI unchanged.
- Default Prisma client schema has G7 auth models, but **no DDL** was added
  to `src/prisma/migrations`. The normal Docker/Compose migrator still sees
  the original six CAD migrations. G7 SQL is stored separately under
  `deploy/g7-operational/prisma/migrations`.

## S2 safe disposable DB rehearsal (NO production data)

1. On a separate Linux checkout/VM with Node 22, run `npm ci` from `src`.
2. Prepare a throwaway baseline with `tsx scripts/g7-staging-prepare.ts
   --ack-disposable-only` following [S1 guide](../g7-staging/README.md)
   (operator supplies candidate digest references; never fabricate registry
   verification). Copy its printed root/DB env vars. Set ALL the Stage-only
   flags, private manifest, origin, storage directory **before** Prisma CLI.
3. Set `G7_MIGRATION_MODE=S2_DISPOSABLE_DRY_RUN`, then
   `npx prisma migrate deploy --config deploy/g7-operational/prisma.config.ts`.
   It reuses S1 realpath/UID/symlink/manifest checks. It creates seven migration
   entries **only in the disposable DB**. Test with
   `npx vitest run tests/integration/g7-operational-cad.test.ts
   tests/integration/g7-operational-api.test.ts`.
4. Never run `npm run db:deploy` or `prisma db push` for G7,
   or copy its SQL to the six default migrations.

## Internal-only evidence with zero raw data export

- Copy `s2-evidence.template.json` to a **private 0600 file outside Git**
  and enter local outcome, evidence IDs, one snapshot ID and fixed App/Migrator
  and rollback digests. Run `node scripts/g7-s2-evidence.mjs
  /absolute/private/s2-evidence.json`. It prints only enumerated reason
  codes and counts. `READY_FOR_OWNER_REVIEW` is **not field verification**
  or automatic S3 GO.
- `s2-restore.template.json` describes a set of operator-exported,
  local readonly SQLite online-backup, CAD and S3-source/restored bytes
  **from the same snapshot**. Run `node scripts/g7-s2-restore-audit.mjs
  /absolute/private/restore.json`; no contents/paths/digests are printed.
  This utility **does not query S3 or prove provenance**. The operator must
  attest actual S3 source/version/restore and archive the original evidence
  **internally**, not in GitHub/CI.
- Record user-facing Github status as "Owner self-attested"/"local synthetic"
  vs "internal actual evidence NOT EXPORTED", never invent an EV/GO/snapshot
  value. If any required item is NOT_RUN or FAIL, the S3 launch remains HOLD.

## S3 operator-only contract — NOT TO BE EXECUTED IN S2

Only after **actual release-specific** Owner GO signed privately, a verified
registry App+Migrator digest pair, approved Schema ID
`202610260001_g7_staging_auth`, same-snapshot SQLite online backup +
local CAD/S3 real restore, rollback image pair, named operators,
maintenance window and checked internal evidence:

1. Private Linux `G7_OPERATION_MANIFEST_PATH` must be a UID-owned
   0600 regular file outside Git. Its schema is in `s3-go.template.json`
   (template is deliberately NO_GO/blank), containing owner/rollback
   operator IDs, GO ID, approved origin/DB/CAD, fixed source SHA and paired
   digests, three or more real internal EV IDs and a **max 24-hour GO window**.
2. Set `G7_S3_GO=true`, `G7_AUTH_ENABLED=true`,
   `G7_RELEASE_CAPABILITY=G7-OPERATIONAL-V1` and the matching
   `G7_OPERATION_* / G7_RUNNING_* ` variables. If incomplete or expired,
   the G7 auth APIs return 404 and, after cutover intent, CAD writes fail
   closed; **no anonymous fallback**.
3. With writes stopped and backup verified, and only after separate operator
   migration consent, set `G7_MIGRATION_MODE=S3_RELEASE_APPROVED`,
   `G7_S3_MIGRATION_ACK=APPLY_APPROVED_PAIR`,
   `G7_OPERATION_SCHEMA_ID=202610260001_g7_staging_auth`,
   `G7_S3_BACKUP_SNAPSHOT_ID=<approved snapshot>`; then the **explicit**
   `npx prisma migrate deploy --config deploy/g7-operational/prisma.config.ts`
   is eligible. This instruction is **NOT an authorization to run it now**.
4. After integrity verification, explicitly execute the one-shot Admin
   bootstrap/recovery CLI with `G7_S3_ADMIN_ACK=ONE_TIME_OPERATOR_ACTION`
   and `--ack-approved-s3` (secret file mode 0600 outside Git, no startup hook).
   Launch Auth first with CAD write flag **OFF**; separately authorize and
   enable `G7_CAD_WRITE_CUTOVER_ENABLED=true` only after checking sessions,
   Site grants, Audit, original CAD GET and Viewer.
5. A failure requires **stop writes**, invalidate GO/Session, stop candidate,
   restore the *same* SQLite/CAD/S3 snapshot and prior compatible App+Migrator
   pair together; check FK, Version/Current/Source SHA, deletion-password
   hash, S3 bytes and health. Never downgrade old App onto new Schema or
   silently reenable anonymous writes. Record potential post-snapshot
   work loss locally; NO-GO until Owner accepts restoration.

No CI, documentation, attestation schema validator or merged PR may set
`G7_S3_GO` or count as an actual release-specific GO.
