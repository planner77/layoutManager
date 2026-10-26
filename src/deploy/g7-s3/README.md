# Issue #109 S3-1 — Operational Prisma contract, quarantined Migration and dual-gate preflight

## Status / safety boundary

This stage **does not migrate an operating database** and does not activate Auth.
It adds the G1–G4 models to the **operational Prisma client schema**
(src/prisma/schema.prisma), but intentionally does NOT add the Auth DDL to the
**automatically applied** operational migration directory src/prisma/migrations.
The current Docker migrator runs prisma migrate deploy at startup. Adding new SQL
to that active directory would silently apply schema changes during an unrelated
deployment without S3 Owner cutover authorization.

The reviewed *formal candidate migration history* lives instead under
src/deploy/g7-s3/prisma/migrations:
- Exactly six copied operational CAD migration versions, identical in bytes.
- Additive 202610260002_g7_operational_auth with User, AuthSession, Role/Site/
  SpecialGrant, append-only Audit, AdminRecoveryNonce and G3LoginAttempt,
  foreign keys, unique indexes and G1/G3/G4 triggers.
- This is NOT the staging G7 S1 migration ID (202610260001_g7_staging_auth).
- The candidate SQL, its semantic constraints and retained CAD rows are tested
  in a disposable database. Promotion to active operational migration history
  requires another reviewed and approved implementation step.

The production Prisma client may contain generated User/AuthSession typings
before the database tables exist. NO runtime code may query those models until
the corresponding migration is explicitly promoted and verified.

## S3-1 disposable Prisma migration smoke

Linux/WSL2 testing only. From the separate checkout's src/ directory, with the
normal Node 22 pinned dependencies installed (`npm ci`):

```bash
set -eu
umask 077
ROOT="$(mktemp -d /tmp/cad-g7-s3-XXXXXX)"
export G7_S3_MIGRATION_TEST_ONLY=true
export G7_S3_TEST_ROOT="$ROOT"
export G7_S3_TEST_DATABASE_URL="file:$ROOT/fixture.sqlite"
export DATABASE_URL="$G7_S3_TEST_DATABASE_URL"
export G7_AUTH_ENABLED=false
export G7_CAD_WRITE_CUTOVER_ENABLED=false
: > "$ROOT/fixture.sqlite"
node -e 'const fs=require("fs"),crypto=require("crypto");const root=process.env.G7_S3_TEST_ROOT;fs.writeFileSync(root+"/s3-disposable.json",JSON.stringify({scope:"G7-S3-DISPOSABLE-MIGRATION-TEST",schemaId:"202610260002_g7_operational_auth",databasePath:root+"/fixture.sqlite",fixtureNonce:crypto.randomBytes(16).toString("hex")}),{mode:0o600,flag:"wx"})'
npx prisma migrate deploy --config deploy/g7-s3/prisma.config.ts
```

The config verifies all of the following **before Prisma can execute SQL**:
- Absolute, canonical, non-symlinked, UID-owned, mode-0700 temp root exactly
  /tmp/cad-g7-s3-<random> (using os.tmpdir() on that host).
- Existing non-symlinked UID-owned mode-0600 fixture.sqlite at that root.
- Exact DATABASE_URL = G7_S3_TEST_DATABASE_URL = file:<root>/fixture.sqlite.
- UID-owned mode-0600 marker `s3-disposable.json` with S3-1 schema ID,
  fixture absolute path and 16-byte random hex fixtureNonce.
- Explicit G7_S3_MIGRATION_TEST_ONLY=true while both G7 operational Auth and
  write cutover flags are NOT true.

An invalid setting throws G7_S3_DISPOSABLE_MIGRATION_ONLY. Never substitute an
operating filesystem path or modify an operational .env to make tests pass.
Remove the test root only after capturing non-sensitive PASS/FAIL evidence.

## Release / Operation gate contract (pure preflight)

The un-routed pure function in src/server/g7-operational/preflight.ts implements:
1. **Release gate:** G7-S3-AUTH-V1 capability, exact source commit, app/migrator
   immutable digest pair, identical semantic versions and source SHA, production
   candidate Schema ID, and separately supplied trusted registry + DB migration
   invariants including FK-zero and rollback/snapshot verification.
2. **Operation gate:** exact release-specific Owner GO ID, CR ID and valid time
   window, explicit S3 cutover scope, immutable app/migrator/rollback digests,
   source/schema and snapshot matching the release, and environment bindings.
3. **Auth/write separation:** G7_AUTH_ENABLED defaults OFF; separate
   G7_CAD_WRITE_CUTOVER_ENABLED defaults OFF and never works without Auth.
   Misspellings, expired approval, wrong digest/schema, missing evidence,
   wrong owner or incompatible version are denied.
4. **No runtime binding in S3-1:** preflight returns runtimeActivated=false even
   when synthetic complete inputs are eligible. S3-2/S3-3 must bind authoritative
   OCI/DB claims and enforce route-level Auth/Role/Site/Audit without a fallback.
   Synthetic inputs are NEVER evidence of a real Owner deployment GO.

## Automatic verification / non-activation

- src/tests/integration/g7-s3-operational-migration.test.ts checks isolated
  Prisma 7 migrations, six baseline files byte equality, retention of existing
  CAD and Current/SHA/delete hash, FK and append-only Audit, injected failure
  rollback, and operating database URL rejection.
- src/tests/unit/g7-s3-operational-gate.test.ts checks default OFF, separate
  write flag, semantic App/Migrator compatibility, wrong registry/schema/GO,
  expiry, IDs and fail-closed. No actual registry/digest data is retrieved.
- src/tests/unit/g7-staging-ghcr-guard.test.ts checks the **exact** squash title
  #109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]
  and a strict list of S3-1 paths: only these cause Main release-scope to set
  publish=false. Other production runtime paths, the active migration history,
  altered subjects and S1/S2 subjects are forbidden. Normal unrelated runtime
  and tag release behavior are unchanged.
- No tests run against operating data, S3-1 commits do not change existing CAD
  routes, operational migrator script, Compose, Nginx, .env or GHCR images.

## Handoff / unfinished S3 work

S3-2 operating Login/Session/Admin/Grant API integration; S3-3 existing Multipart
CAD POST, Current PUT and Version DELETE authorization + Audit transaction;
S3-4 immutable App/Migrator image pair, actual offline-registry verification,
internal same-snapshot SQLite/CAD/S3 restore and rollback; per-release Owner
GO and S3-5 operating field acceptance remain separately gated. The user's
internal evidence cannot be exported: keep private evidence in the internal
network and record only status/opaque ID without fabricating PASS.

**Issue #109 and #96 remain OPEN/BLOCKED; no real deployment or GHCR publish.**
