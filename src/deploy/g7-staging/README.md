# #109 / G7 S1 — Isolated Staging integration

**Single Issue / single PR. This is NOT an operating Go/No-Go.** Do not copy
these migrations into `src/prisma/migrations` or use the operational
`npm run db:deploy`. The normal app/Compose/Nginx/DB/CAD/S3 are unchanged.
Staging routes are **404 by default** and work only in a newly-created,
disposable `/tmp/cad-g7-staging-*/fixture.sqlite` database owned by the
running Linux user, with a separate `cad` directory and private release
manifest. G7 flags are exactly `true` or OFF.

## Prepare disposable database and staged Prisma migration

1. Provide three **staging candidate labels** in private shell environment:
   `G7_STAGING_APP_DIGEST=sha256:<64 hex>`,
   `G7_STAGING_MIGRATOR_DIGEST=sha256:<64 hex>`, and
   `G7_STAGING_SOURCE_COMMIT=<40 hex>`. These are declared references;
   comparing them with real OCI registry manifests/signatures belongs in
   S2 Owner release approval. Never substitute an invented digest for GO.
2. From `src/`, run:
   `npx tsx scripts/g7-staging-prepare.ts --ack-disposable-only`.
   This creates an empty staging DB/manifest/root, **not** a production DB.
3. Export printed `G7_STAGING_ROOT` and
   `G7_STAGING_DATABASE_URL=file:<root>/fixture.sqlite`.
   Run `G7_STAGING_DATABASE_URL=... npx prisma migrate deploy --config deploy/g7-staging/prisma.config.ts`.
   The staging-only history contains the **six original CAD migrations plus
   one G7 authentication migration**, and the G3 limiter and scoped Audit
   constraints. Verify `PRAGMA foreign_key_check`/CAD invariants.
4. Set `DATABASE_URL` **equal to the staging DB URL**,
   `CAD_STORAGE_PATH=<root>/cad`,
   `G7_STAGING_ORIGIN=http://127.0.0.1:<isolated staging port>`,
   `G7_STAGING_ONLY=true`, `G7_RELEASE_CAPABILITY=G7-S1-STAGING-V1`,
   `G7_OPERATION_APPROVAL=S1-STAGING-ONLY`, and
   `G7_AUTH_ENABLED=true`. Only for isolated staging verification,
   set `G7_CAD_WRITE_CUTOVER_ENABLED=true`. Both flags default OFF.
   No operational Compose/Proxy/real database is touched.
5. With an approved 0600 secret file outside Git, explicitly run
   `npx tsx scripts/g7-staging-admin.ts --ack-staging-only` with G2
   `ADMIN_BOOTSTRAP_*` or one-shot `ADMIN_RECOVERY_*` environment.
   **Never auto-invoke this CLI from app startup.**
6. The exclusive preview routes are
   `/api/g7-staging/auth/{login,initial-change,session,change,logout}`,
   `/api/g7-staging/access/{permit,grant,disable,audit}`, and
   `/api/g7-staging/cad/{list,content,upload,current,version}`.
   G3 Session Cookie + CSRF and server-resolved Site/Version determine
   mutations; DELETE additionally verifies the legacy delete password.
   CAD upload is intentionally **bounded DXF JSON/base64** in this isolated
   preview, NOT the operating multipart CAD API. Existing anonymous
   `GET /api/cad-files` and Viewer remain unchanged.
7. Only stage test data is permitted. Retain deleted Version files as
   staged cleanup tombstones until snapshot rollback checks. The Audit
   365-day physical purge is not implemented. S2 still requires original
   #108 private evidence IDs, fixed App/Migrator OCI digests/Schema, actual
   rollback proof, Admin/Secret SOP and **separate Owner GO**.
8. Delete the disposable directory only after test ownership/backup scope
   verification. Do not commit staged DB, CAD, tokens, private manifests,
   real CAD SHA, internal IP or log contents.

The staging Prisma generator targets `src/generated/g7-staging`, while the
existing operational generator remains `src/generated/prisma`. A staging
candidate build is not itself GHCR release or deployment approval.
