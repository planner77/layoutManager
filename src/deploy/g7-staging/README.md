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
3. **BEFORE invoking Prisma**, export the printed `G7_STAGING_ROOT`
   and `G7_STAGING_DATABASE_URL=file:<root>/fixture.sqlite`, and set
   `DATABASE_URL` to that **same staging DB URL**,
   `CAD_STORAGE_PATH=<root>/cad`,
   `G7_STAGING_ORIGIN=http://127.0.0.1:<isolated staging port>`,
   `G7_STAGING_ONLY=true`, `G7_RELEASE_CAPABILITY=G7-S1-STAGING-V1`,
   `G7_OPERATION_APPROVAL=S1-STAGING-ONLY`, and
   `G7_AUTH_ENABLED=true` **only inside isolated staging**.
   The latter does not activate production, and the separate CAD write flag
   stays OFF until authorized staging verification.
4. Run `npx prisma migrate deploy --config deploy/g7-staging/prisma.config.ts`
   from `src/` with **all of the preceding staging environment**.
   The config now invokes the **same release/operation gate and realpath/UID,
   symlink/manifest/schema checks as the staging HTTP API BEFORE Prisma can
   execute any SQL**. A missing/mismatched variable or an operating database
   URL aborts with `G7_STAGING_PRISMA_TARGET_DENIED`. It has **no default
   fallback URL**. Staging contains the original six CAD migrations and one G7
   authentication migration plus G3 limiter and scoped Audit checks; inspect
   `PRAGMA foreign_key_check`/CAD invariants after a successful deploy.
   Only for isolated staging write tests, separately set
   `G7_CAD_WRITE_CUTOVER_ENABLED=true`. Operational Compose/Proxy/DB remain
   unchanged; never point Prisma at operating paths.
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

## Cookie isolation and conditional Main CI

Staging uses a dedicated `cad_staging_session` HttpOnly cookie with
`Path=/api/g7-staging`. The routed adapter translates only this cookie to
the original G3/G4 internal `cad_session` name; it does not overwrite or
trust a production `cad_session` cookie. Logout expires only the stage cookie.

The first PR CI success belongs to the original S1 HEAD only; new commits
need fresh CI verification. The existing Main CI release-scope publishes
GHCR for any runtime change by default. **This PR alone** has a narrow
GHCR exclusion in `.github/workflows/docker-publish.yml`: a squash merge
whose commit subject is exactly
`#109 | S1 Staging-only integration [G7-S1-NO-GHCR]`,
and whose diff contains only allowlisted G7 staging paths, Markdown and
that workflow. An unexpected runtime path fails Main CI rather than
publishing. The normal release scope stays unchanged for unrelated
runtime changes and tags. Do not merge under any other subject while the
user instruction forbids GHCR publication.

A Main CI successful release-scope and skipped GHCR job must be
separately verified. None of this grants S2 Owner operational approval.

