## RF-01/RF-04 single-PR continuation after verified PR #277/Main (2026-11-09)

PR #277 CI #737/run42556272169 SUCCESS at `a26b336c`; squash Main `8a5e4370`; Main HOLD CI #29/run42558420936 SUCCESS. These historical exact-source/CI proofs are reusable only for the corresponding source and never replace new exact-head PR CI or live RF03 0.61.1+ protected release proof.

RF-01: new `release_finalizer_checkpoint.py` + `release-finalizer-finish.yml` use existing RF01 request packet, owner run attempt1, protected manual dispatch, issue-comment durable hash chain `MAIN_VERIFIED/CANDIDATE_VERIFIED/PROMOTION_VERIFIED/CLOSE_INTENT`, predecessor hash and stage nonce replay guard, and readback after each write. A distinct fresh packet/nonce and explicit current checkpoint hash are required for resume; uncertain remote writes and close intent require manual reconciliation, no auto replay.

RF-04: `release_finalizer_release_proof.py` independently repeats RF03 actual Owner two-run review, original Candidate ZIP/Sigstore/OCI and final three immutable GHCR role digest+old0.61.0/latest baseline; independently validates successful original Promotion operation receipt. `release_finalizer_finish.py` requires exact checked AC IDs in Issue body and SHA256-bound body review plus a fresh third Owner close approval before one guarded Issue `closed` PATCH, after durable CLOSE_INTENT; cannot close on refs/pr/main success alone. No live GHCR/Issue write performed by authoring or tests. New PR must pass exact-hosted CI; original Issue #273 remains OPEN until real acceptance/release. #229 HOLD unchanged.

---

## #273 / PR #277 — RF-03 version-generic protected Candidate + Promotion integrated implementation (2026-11-09)

- **Baseline verified:** [PR CI #734 / run42535216277](https://github.com/planner77/layoutManager/actions/runs/42535216277) SUCCESS on exact previous HEAD `df9a7de8b6b86930516fc5aa3c61ddec7713455d`, 8 applicable jobs SUCCESS, #218 P1-A2 scoped SKIP, unresolved review threads0 and Draft/open/mergeable. This success is old-source proof only.
- **One-batch implementation:** after the previous Candidate GET-only GitHub/ZIP/OCI/Sigstore checks, add separate Owner-only protected `release-finalizer-rf03-candidate.yml` and `release-finalizer-rf03-promote.yml` with distinct genuine `workflow_dispatch` Runs, attempt1-only jobs, independent required environment approvals, shared `issue225-candidate-publish` concurrency group, fail-closed Main source/version/tree/review/CI/package/legacy-writer guard and exact packet SHA256/nonce. Both default to `plan` and require explicit `publish`; **no automatic publication from PR/Main CI**.
- **Reuse by isolation:** `rf03_candidate_policy.py`, `rf03_candidate_publish.py`, `rf03_verified_negative.py`, `rf03_rp_provenance.py`, `rf03_promotion_policy.py`, `rf03_registry_promotion.py` and `rf03_release_promote.py` are RF-03 scoped variants of #225 protected contracts. Exact version is derived at runtime from the checked `src/package.json` on the trusted Main; `rf03_exact_release.exact_tags` requires version **greater than 0.61.0**. Immutable actual final tags are `:X`, `:X-migrate`, `:X-cpu-worker` without `latest`/v aliases. All existing #225 v0.61.0 scripts/workflows/GHCR images/receipts remain unchanged, including #229 `HOLD_MAIN/G7_RELEASE_HOLD_TAG_BLOCKED`.
- **Candidate:** retained old-proven source-archive → three-role build, RR1+RR2/RR3 local upgrade and cleanup, bounded GHCR candidate-prefix-only publisher, OIDC-signed four subjects with pinned gh positive/negative verification and sanitized 4-file immutable artifact. New candidate version input must exactly equal its approved packet and checked source package version, old 0.61.0 source/tag cannot be published by RF-03.
- **Promotion:** authentic new-candidate run/Artifact/Owner review metadata, independently verify the **original** GitHub Artifact ZIP via fixed API GET→one-hop approved HTTPS CDN with no credential forwarding or HTTP retry, downloaded file hashes+signed Candidate subjects+actual GHCR config/manifest/platform/source, and a new separate Owner protected approval before exact three immutable version tags. Promotion retains one durable attempt journal, no silent retry, no automatic delete/overwrite/rollback/alias/latest update. Live three-role historical **0.61.0 tags** and previously observed `latest` digest must match Owner-approved `rollbackBaseline` before, immediately before PUT, and after the exact promotion; partial/unknown mismatch stops instead of claiming success. The historical 0.61.0 CPU Worker digest is required in the baseline packet.
- **Proof boundary:** the new code/CI is not a real protected Owner review or GHCR release. Main code integration, fresh Candidate and Promotion manual dispatches/Owner environment reviews, GitHub Artifact and Sigstore verification, exact final GHCR three digest readback, rollback evidence and an external-writer inventory are independent preconditions. Draft PR #277, Issue #273 OPEN, #229 HOLD, old 0.61.0 tags/latest, production App/Worker/DB/CAD/Volume/.env/backups unmodified. RF-01 durable nonce/checkpoints and RF-04 all-AC Issue closing remain separate; **never issue GO-RELEASE or close Issue on a green PR CI**.
- **Batch CI policy:** all RF-03 code, regression tests, AGENTS/design/operations/ledger changes are committed once to PR #277; final exact-HEAD required PR CI runs once from `synchronize`. Prior #734 does not validate the new source. Further PR CI only if exact HEAD fails or changes; avoid `ready_for_review` until all independent gates are complete.

---

## #273 / PR #277 — CI #733 SUCCESS, RF-03 Candidate-only GitHub + original ZIP + OCI + Sigstore evidence chain (2026-11-09)

- **Verified previous HEAD:** [PR CI #733 / run 42532181978](https://github.com/planner77/layoutManager/actions/runs/42532181978), exact previous HEAD `2b39cc872c33d476355b5dd62adc110de4fe4afb`, completed SUCCESS with 8 applicable successful jobs, one #218 scoped SKIP; unresolved review threads0, PR Draft, no conflicts. This is NOT evidence for the new implementation.
- **Candidate-first metadata gate:** `rf03_live_evidence.audit_candidate` reuses existing strict exact Main A/B source/version, Candidate Owner `workflow_dispatch` attempt1 published job, independent environment policy/no-admin-bypass, actual approval history and sole Artifact ID/digest/size/readback. It deliberately does **not** require a completed Promotion run, return Owner release GO, or alter the existing post-Promotion `audit`. Existing Owner GET-only `release-finalizer-rf03-readback.yml` now supports explicit `stage=candidate` while default `stage=all` retains the original full metadata gate; `rf03_readback.py candidate` is GET-only without protected or GHCR write permissions.
- **Original Artifact ZIP binding:** `rf03_candidate_archive.py` hashes the **original** downloaded GitHub ZIP bytes against the independently observed `sha256:<archive>` and exact size bound in the RF-03 handoff. It accepts exactly `candidate-receipt.json`, `candidate-bundle.sigstore.json`, `verification.json` and `SHA256SUMS`, refuses missing/extra/duplicate/archive-directory/traversal/symlink/encrypted/unsupported/miscompressed/unbounded members, and extracts only into a fresh isolated `0700` scratch directory using exclusive file creation. `rf03_material_preflight.check` then re-verifies receipt/bundle/verification SHA256 and signed three OCI Manifest subjects + receipt SHA256SUMS; the original ZIP is rehashed after extraction to detect drift. Local scratch files are NOT GHCR/Issue writes.
- **Integrated Candidate evidence chain:** `rf03_candidate_evidence.audit` invokes the actual module functions (not caller-supplied PASS receipts) in order: candidate GitHub metadata → original archive verification/extraction → exact-version three-role GHCR OCI graph → pinned gh/Sigstore online + bundle subject verification; then repeats actual GitHub GET metadata and three Candidate tag reads to detect changed source, roles, digests, approvals or registry tags during verification. Its identity-bound SHA256 chain is a **checksum, not an Owner signature**. Synthetic test adapters return `BLOCKED_SYNTHETIC_NOT_LIVE_EVIDENCE`; only actual `SafeReadOnlyGitHub` plus `ReadOnlyGHCR` have a non-synthetic Candidate proof status, still `BLOCKED_PROMOTION_OWNER_AND_FINAL_REGISTRY_PROOF_REQUIRED`. No source can emit GO-RELEASE or Issue acceptance.
- **Current evidence limitation:** The new code expects an original ZIP file from a separately authorized GitHub Artifact ID download, a private read-only GHCR token and the checksum-pinned gh verifier. This unit does **not** implement an artifact-download client or execute real 0.61.1+ Candidate/Signer/Owner proof; no real signed Artifact/OCI registry readback has been observed for the new version. Owner-protected independent Promotion approval, exact final digest/rollback/partial publication, durable nonce/checkpoint, and RF-04 all AC/Issue close remain separate and **NOT VERIFIED**. Do not mistake `stage=candidate` GitHub metadata-only workflow for full Candidate evidence.
- **Regression/CI:** `test_rf03_candidate_evidence.py` exercises synthetic candidate-only before Promotion, real ZIP SHA binding, bounded unpack, missing/extra/duplicate/traversal/symlink/zip bomb, source/review/artifact/OCI tag drift, cross-stage identity, recheck under changing Main and mandatory no-GHCR-write constraints. The existing legacy #225 and prior RF-03 required suites are retained; the new test is wired to the Scope job. New exact-HEAD CI status is `NOT VERIFIED` until completion.
- **Preservation:** PR #277 remains Draft and Issue #273 OPEN; #229 `HOLD_MAIN/G7_RELEASE_HOLD_TAG_BLOCKED`, historical immutable 0.61.0 three-role images, tag/latest, current operating App/Worker/DB/CAD/Volume/.env/backups and two separate protected Owner approvals are unchanged. GHCR/Tag/Issue/operational write 0.

---

## #273 / PR #277 — CI #732 successful; RF-03 signed Candidate subject readback unit (2026-11-09)

- **Prerequisite:** [PR CI #732/run42528404780](https://github.com/planner77/layoutManager/actions/runs/42528404780) for exact previous HEAD `62107e83e0a5caf9d4b960ff4c288f625f6fa99d`: completed SUCCESS, 8 applicable successful jobs and 1 #218 scoped SKIP; unresolved review threads0, Draft/open and mergeable at check. This success cannot be reused as new-code CI evidence.
- **New read-only module:** `src/tests/oci/rf03_signed_candidate.py` reuses `rf03_material_preflight.check`, RF03 strict release handoff and existing #225 `candidate_policy.certificate` signer/SLSA mapping, and requires top Manifest raw bytes from `rf03_oci_readback.check`'s private workspace. It checks candidate receipt Source/Tree/Workflow/run attempt1/version/role/config/OCI subject mapping independently, including all three Manifest subjects plus the receipt. Artifact JSON/verification claims alone never count as signature or Owner authorization.
- **Pinned verifier:** explicit caller-supplied `gh v2.103.3` binary and downloaded tar archive must match historical pinned `GH_ARCHIVE_SHA` and actual archive member bytes. Manual run uses **only** explicitly supplied `GH_TOKEN`, no host/ambient credentials, fixed signer workflow/ref/digest/source/attempt1, `--deny-self-hosted-runners` and 4 subjects × 2 (online and bundle) successful fresh `gh attestation verify` outputs. Reuses the legacy validated certificate identity (repo ID/Owner ID, OIDC issuer, GitHub-hosted runner, SLSA predicate and run URI). Rehashes all subjects, bundle and binary on each step. No GHCR PUT, alias, tag, protected approval, Issue close or deploy route.
- **CI:** `test_rf03_signed_candidate.py` includes synthetic 3-image/index bytes, material tampering, receipt source/version/run/role drift, signer/issuer/attempt identity, malformed and duplicate CLI JSON, exact CLI arguments and negative altered gh archive/member checks. Add py_compile + test to existing required PR scope. **Synthetic tests cannot prove an actual signature.** Neither an authorized version-generic Publisher nor a live Candidate Artifact verification has been run by this code change.
- **Boundary:** `audit()` returns `BLOCKED_INDEPENDENT_OWNER_PROMOTION_AND_REGISTRY_PROOF` even after actual signature verification, and `ownerAuthority=NOT_VERIFIED`, `registryPublication=NOT_RUN`, `externalWrites=0`. Current hosted/live status of new signer and Candidate for 0.61.1+ remains `NOT_VERIFIED`; actual Owner protected Candidate/Promotion separate approvals, artifact provenance-to-run binding and immutable final GHCR 3-role/rollback readback are still required. RF-01 durable nonce/checkpoint and RF-04 AC-gated closure stay separate.
- Preserve #229 HOLD_MAIN/G7_RELEASE_HOLD_TAG_BLOCKED, historical immutable 0.61.0 three-role GHCR tags/digests/latest and operating App/Worker/DB/CAD/Volumes/.env/backups. PR #277 **Draft**, Issue #273 **OPEN**, no release GO or GHCR write. New exact-head PR CI required.

---

## #273 / PR #277 — CI #731 GHCR auth challenge scope regression repair (2026-11-09)

- Observed [PR CI #731 / run 42527748418](https://github.com/planner77/layoutManager/actions/runs/42527748418) at exact previous HEAD `b2372a5201105014eeb29130973d98df33f07cb2`: status completed, conclusion **failure**, run attempt 1. The required `Classify PR scope and audit merge defaults` job (128875023742) failed during the candidate OCI regression suite; `test_candidate_publish.py` ran 47 tests, 1 FAIL + 1 ERROR in `test_observed_root_placeholder_challenge_never_controls_token_scope`. The required aggregate failed by dependency; other workloads were SKIPPED, not independently proven failed.
- Root cause: while adding read-only RF-03 `PULL_SCOPE`, shared `candidate_registry.GHCR.__init__` accepted the `repository:planner77/layoutmanager:pull` realm challenge **even in default legacy publish mode** `pull,push`. The existing negative test correctly expects that cross-mode challenge to be refused at the first `GET /v2/`; instead it continued to a Basic-authenticated token request and exhausted the synthetic response list (`IndexError: pop from empty list`). This is an authorization-challenge **allowlist expansion** regression, not a GHCR service failure.
- Minimal fix: select the exact allowed scoped realm using the **already-selected** `scope = PULL_SCOPE if pull_only else SCOPE` rather than accepting both; retain original no-scope and fixed placeholder realm cases. Legacy default `pull,push` and RF-03 explicit `pull` request URLs remain unchanged. No GHCR write, token privilege escalation or unapproved release is permitted by this fix.
- Reuse original historical `test_candidate_publish.py` negative assertions unchanged, and add synthetic positive cross-mode tokens + opposite-mode challenge rejection to the already mandatory `test_rf03_oci_readback.py`. Do **not** alter `#229` release HOLD, old 0.61.0 Candidate/Promotion publisher, OCI digest/label checks, pre-existing GHCR images/tags, PR CI workflow triggers or permission scopes. The relevant exact-head hosted CI must be rerun and its outcome **NOT VERIFIED** until completed.
- PR #277 is Draft, Issue #273 OPEN, unresolved review threads 0 and GitHub mergeable=true observed before update. Keep live protected Candidate/Promotion separate Owner approvals, Sigstore, OCI and GHCR release gates blocked. No GO-RELEASE, GHCR publish, git tag, deployment or issue-close on the basis of this regression patch.

---

## #273 / PR #277 RF-03 next unit: PR CI #730 success and exact-version OCI readback (2026-11-09)

- [PR CI #730 / run 42525255763](https://github.com/planner77/layoutManager/actions/runs/42525255763) **SUCCESS** on previous exact HEAD `b7116c6c889d291b0222a618b85ca11fe38026c1` (attempt1, 8 applicable SUCCESS, 1 scope SKIPPED). PR #277 remains Draft/OPEN with zero unresolved review threads. This is not a pass for the new code.
- New `rf03_oci_readback.py` uses the existing #225 `candidate_registry.collect_graph` to read 3 exact Candidate OCI graphs and independently check top digest/media/size, platform manifest, config, source, role, linux/amd64 and version. Legacy default remains `0.61.0`; only strict RF03 handoff supplies `version>=0.61.1`. `ReadOnlyGHCR` reuses bounded GHCR Distribution reads but requests a **pull-only token**, refuses all HTTP mutation verbs and restricts tags to the 3 exact Candidate identities. A final tag readback detects sequential drift, not a registry CAS.
- New required PR CI unit `test_rf03_oci_readback.py` uses only synthetic fixture registry and exercises direct manifests/OCI index, legacy version pin, wrong label/digest/platform, missing manifest, final-tag drift, private workspace reuse and POST/PUT rejection. Synthetic success is NOT live GHCR proof.
- Even authenticated matching OCI graphs are **not** Sigstore/OIDC signer proof, two fresh protected Owner approvals, release GO, final GHCR publication, rollback-baseline readback, or RF-04 AC closure. Output stays `BLOCKED_OWNER_SIGSTORE_AND_RELEASE_AUTHORITY_REQUIRED`, `signatureVerification/ownerAuthority=NOT_VERIFIED`, `registryPublication=NOT_RUN`, `externalWrites=0`. Existing Candidate/Promotion writers remain pinned at 0.61.0 and were not modified/executed.
- Preserve #229 HOLD_MAIN/G7_RELEASE_HOLD_TAG_BLOCKED, historical 0.61.0 three immutable images, tags/latest and production App/Worker/DB/CAD/Volume/.env/backups. PR #277 **Draft**, Issue #273 **OPEN**, no release/Issue close/operation. New HEAD PR CI must be checked separately. Next: actual signed artifact bytes + independent Owner protected Candidate and Promotion verification, then protected writer, RF-01 checkpoint and RF-04 AC.

---

## RF-03 material byte preflight follow-up (2026-11-09)

- PR #277 CI #718 / run 42521782477: exact prior HEAD `ea17b29c60b2ee1ba00f4597feb794029b01653d`, eight applicable jobs SUCCESS, one A2 scoped SKIP, unresolved review threads 0. **This evidence applies to the prior HEAD only.**
- New `src/tests/oci/rf03_material_preflight.py` performs **GET-independent local byte checks**, on a private downloaded artifact directory, restricting file names to receipt, Sigstore bundle, verification JSON and SHA256SUMS; rejects symlinks, unknown/missing names, duplicate checksum subjects, unsafe paths, changed byte hashes, duplicate JSON keys and malformed material. The handoff and original RF-01 plan are rechecked before accepting any bytes.
- `test_rf03_material_preflight.py` covers positive byte bindings and negative tampering/path/legacy release cases and is in mandatory `pr-ci.yml` scope. This is a **non-network, non-publisher, non-cryptographic preflight**. A supplied bundle or `verification.json` containing an assertion of success is never sufficient to verify Signer identity, OIDC subject, Rekor/Sigstore contents, GHCR manifest/config/platform or actual Owner authority.
- All successful outputs remain `BLOCKED_INDEPENDENT_SIGSTORE_AND_OCI_PROOF_REQUIRED`, `externalWrites=0`, `signatureVerification=NOT_VERIFIED`, `ociGraphReadback=NOT_VERIFIED`. Next required unit: reuse existing `release_promote.verify_material`/candidate registry and checksum-pinned gh verifier in a separately reviewed version-generic RF-03 verifier; authenticate actual GitHub downloaded bytes and independent protected Owner approvals; then implement version-generic Candidate/Promotion writers with no-overwrite/partial-state proof.
- Keep PR **Draft**, #273 **OPEN**, #229 HOLD, existing 0.61.0 GHCR/image/tag/latest and operating DB/CAD/Worker/backups unchanged. No GHCR/Tag/Issue writer or deployment introduced. New HEAD CI is required; prior CI #718 MUST NOT be reused for the new source.

---

## RF-03 실 GitHub 메타데이터 readback 확장 — PR #277 계속 사용 (2026-11-09)

[CI #717/42518993315](https://github.com/planner77/layoutManager/actions/runs/42518993315): HEAD `da5c8782fc04008c94bcb41f676fe58b640c6ce3` attempt1, 적용8 Job SUCCESS, A2 scoped SKIP. 이 증거는 handoff packet 구조 계약까지만 검증한다. 같은 PR에 신규 `rf03_live_evidence.py`/ `rf03_readback.py`, Owner manual GET-only `release-finalizer-rf03-readback.yml`, synthetic API 부정 테스트 및 required PR Scope 연결.

Readback은 **실제** GitHub workflow run attempt1·correct actor/trigger/source/path/branch, publish job success/name/id, 각 독립 protected environment Owner 승인 이력, canonical approval receipt hash, Candidate Artifact 메타데이터(만료/정확 소스/ID/SHA256 digest) 및 promotion-code current Main SHA/tree/package version을 read-only 대조한다. 통신 인터페이스는 fixed `/git/ref`·`/git/commits`·`/contents/src/package.json`·`/actions/runs`·`/actions/artifacts`·`/environments` GET만 허용하고 리다이렉트/허용 외 경로 거부. `can_admins_bypass` 정보 없거나 true면 fail-closed(Owner UI 근거 없이는 승인으로 취급하지 않음).

**게이트 경계:** 승인 이력과 artifact metadata의 검증은 OIDC/Sigstore 서명 주체·원문 파일·OCI config/manifest bytes·GHCR Registry authenticated readback/유일한 writer·구 릴리스 태그 보존을 증명하지 않는다. `BLOCKED_CRYPTOGRAPHIC_OCI_AND_REGISTRY_PROOF_REQUIRED`, `ownerAuthority=NOT_VERIFIED`, `externalWrites=0`만 반환. `RF03_EXACT_VERSION_PLAN_V1`도 외부에서 공급된 선행 계획이므로 라이브 PR/Main 정본을 다시 독립 검증하기 전에는 release receipt가 아니다. 실제 새 버전 출고기/두 Fresh Owner protected approval/서명·OCI/GT rollout/잔여 AC는 미구현·미실행, #229 HOLD 및 0.61.0 기존 GHCR/운영 불변. 새 Head CI 전 Draft 유지.

---

## RF-03 증거 인계 계약 확장 — PR #277 계속 사용 (2026-11-09)

[PR #277](https://github.com/planner77/layoutManager/pull/277)의 first HEAD `d068d637c90c3b1b995ec6e2595760531503d5e3` [PR CI #716](https://github.com/planner77/layoutManager/actions/runs/42516241424)은 8 applicable SUCCESS/1 A2 scope SKIP/attempt1. 이 증거는 첫 read-only PLAN까지만 해당한다.

추가 `rf03_release_handoff.py`는 `RF03_RELEASE_HANDOFF_V1`의 후보/승격 간 **정확한 release-source vs promotion-code source**, 각기 다른 workflow/run/attempt1/Owner-review-job/approval receipt SHA, OIDC 서명 bundle/후보 artifact checksum(해시 **형태만 검증**), 3 role digest/config/platform-manifest/OCI media/size/amd64, immutable 기존0.61.0 3 digest baseline과 canonical final refs를 구조적으로 결합한다. 원래 `rf03_exact_release.evaluate`의 Source/Main CI와 비교하며 unknown field/old version/role mismatch/approval reuse/source drift/failed proof를 거부하는 synthetic 테스트를 추가했다. **이 단계는 운영 출고를 하지 못한다.** 입력이 주장한 `approved`·hash 값은 허가도 암호학적 검증도 아니며, 결과는 `BLOCKED_LIVE_OWNER_CRYPTO_REGISTRY_PROOF_REQUIRED`만 허용한다. `0.61.0` pinned legacy Candidate/Promotion/Tag/OCI writer, #229 HOLD, historical image/digest 보호 불변.

잔여 RF-03 완료 작업: 구0.61.0 계약을 파괴하지 않는 별도 version-generic Candidate/PROMOTION 실제 protected writer, source archive/OCI label/runtime/upgrade 검증, 실제 두 개의 독립 환경 Owner 승인에 대한 GitHub API readback, attestation OIDC verified mapping, registry digest readback·no-overwrite/no-alias/no-retry/partial handling, 실제0.61.1 release 승인·증거 저장. RF-01 영속 nonce/checkpoint와 RF-04 all AC Issue 종료도 후속이다. 이번 추가 HEAD PR CI 성공/리뷰 재검증 전 PR Draft 유지.

---

## RF-03 첫 Unit — 0.61.1+ 정확한 릴리스 대상 계약 (2026-11-09)

RF-02 선행: PR #276 CI [42513847448](https://github.com/planner77/layoutManager/actions/runs/42513847448) exact HEAD `9682291b` SUCCESS→ Squash Main `bd03e6fb601c02e5d2f74dd2d97f0c850b3b695f` tree `5c58b4369d74b4cad5694f6df46eadaf6d662990` parent `9635b153`→ Main CI [42515467033](https://github.com/planner77/layoutManager/actions/runs/42515467033) first-attempt HOLD SUCCESS. 병합 직후 GitHub timeline의 `closed`로 #273이 조기 종료돼 **OPEN 재전환**. RF-03/04 미완료라 Issue Close 승인이 아니다.

이번 RF-03 Unit은 기존 `RF-01`의 exact PR/merge SHA/tree/Main CI를 재사용하는 `rf03_exact_release.py`와 negative fake API 테스트, Owner `workflow_dispatch` 읽기 전용 PLAN, 필수 PR Scope 연결이다. `0.61.0` 역사적 출고를 재게시하거나 자동 승인하지 않고, 최소 `0.61.1+` 범위에 canonical 3-role tag `X`/`X-migrate`/`X-cpu-worker`를 구성한다. RF-01 `releaseTarget=...:vX`와 실제 GHCR `:X`는 **서로 다른 역할**; 신규 v-tag/alias를 생성하지 않는다. Main head와 squash SHA/CI identity가 일치하지 않으면 HALT. 결과는 의도적으로 `BLOCKED_LEGACY_WRITER_VERSION_PIN`, `externalWrites=0`이며 실제 Candidate/Promotion/Issue 수용은 모두 `NOT_VERIFIED`.

**잔여 필수 단계**: 기존 0.61.0 고정 Candidate/Promotion의 안전한 source-version 파라미터화(특히 build OCI labels, RR1/RR2 runtime/version, registry plan/manifest, rollback), 실제 깨끗한 source/Owner 2독립 보호 환경 승인, OIDC signed artifact/3 exact digest/role/platform/config/provenance/registry readback, no overwrite/latest/partial reuse, checkpoint/nonce 및 RF-04 full AC Issue Close. 기존 #229 HOLD/운영 배포 금지. PLAN 구현만으로 #273 완료/0.61.1 출고 승인 아님.

---

## RF-02 PR #276 — P1 권한/트리거 리뷰 보완 (2026-11-09)

Ready 이벤트로 정확 기존 HEAD `92927197947c435ffd7d91bc25e90da1ac49c16b`의 새 PR CI [42512889704](https://github.com/planner77/layoutManager/actions/runs/42512889704) 시작. 리뷰 P1 두 건: 기존 integrate workflow token `contents:read`만으로 실제 PR merge 불가; `GITHUB_TOKEN`으로 merge된 push는 GitHub Actions가 후속 push CI를 실행하지 않음. 기존 RF-02 `event=push` readback만으로는 Main CI 검증 불가. 수정한 코드에서는 only integrate job에 contents/pulls/actions write를 허용하며 정상 GitHub Ruleset/Owner/HEAD CAS를 우회하지 않는다. Merge 성공 → 실제 tree/parent/PR readback → Main ref SHA CAS → 기존 `main-hold.yml` workflow_dispatch(고정 ref=main + exact merge SHA + packet SHA256)를 **한 번만** 호출한다. 204 응답 확인·비정상/timeout Unknown은 fail closed/no retry. Main workflow는 기존 HOLD_MAIN 강제 및 SHA/packet 확인을 유지하고 run-name `MAIN CI | RF02 | <SHA> | <packetSHA>`를 제공한다. RF-02는 이 정확 실행의 run attempt1·full required Job SUCCESS를 바인딩하거나 `MERGED_WAITING_MAIN_CI`로 남긴다. 실제 출고/Issue Close는 분리, RF-03/04 미구현, #273 OPEN. 변경 신규 HEAD CI 전 NOT VERIFIED.

---

## RF-02 후속 Unit — 보호된 PR 통합 및 Main CI 증거 (2026-11-08)

**선행 완료:** PR #274 source HEAD `697cfe3ef551aaa7583a7dac4d5b5790316e1a97`, [PR CI 42487447127](https://github.com/planner77/layoutManager/actions/runs/42487447127) (8 applicable SUCCESS/A2 scoped SKIP), squash [Main 9635b153](https://github.com/planner77/layoutManager/commit/9635b153a9c28f365b2485abb5d76d32f5be62ac), tree `fdb2396c455a744919be6a4fa8d9f96387e8c2ae`, [Main CI 42489515024](https://github.com/planner77/layoutManager/actions/runs/42489515024) read-only HOLD SUCCESS. Issue #273은 아직 OPEN.

**이번 Unit 구현:** `release_finalizer_integrate.py`와 read-only GraphQL review-thread 조회/Ruleset 검증/기존 RF01 exact packet·CI·source 재사용, `release-finalizer-integrate.yml`에서 Owner 수동 `plan`·`integrate`·`readback` 분리. Normal REST merge `sha=prHeadSha`, `merge_method=squash` 외 Repo/Issue/GHCR/Tag mutation0; Main exact base CAS·thread resolution·실제 적용 CI·Review requested changes·ruleset 정책/관리자 bypass 부재 필요. Merge 뒤 Main push CI 실행은 GitHub 기존 workflow에 맡기고 **감시·성공 자동 승격 없음**. Main 미완료는 `MERGED_WAITING_MAIN_CI`로만 남기고, 재사용/최종 release는 별도 검증한다. API merge timeout/unknown은 자동 재시도/롤백 금지. 외부 write 경로는 Owner dispatch+GitHub Ruleset으로 제한.

**이후:** RF-01 durable checkpoint/nonce, RF-03 `0.61.1+` exact App/Migrator/CPU Worker candidate/promotion 2독립 Owner Environment 승인, RF-04 전체 AC 승인·Issue Close는 미구현/NOT VERIFIED. 보존: #229 HOLD_MAIN/TAG_BLOCKED, 기존 0.61.0 3digest/Tag/latest·운영 Worker/데이터/복구점. 새 Unit의 exact HEAD CI는 아직 NOT VERIFIED.

---

## RF-01 PR #274 리뷰 보완 — PR CI association 강제 (2026-11-08)

GitHub [PR CI run42485818897](https://github.com/planner77/layoutManager/actions/runs/42485818897)은 HEAD `f88198dfccf0940b3ab3c95947928033b65b9bfe`의 요구 Job SUCCESS였지만 Ready 이벤트 후 P2 review 1건이 신규 등록됐다. `workflow_run.pull_requests`가 다른 PR 번호를 포함하면 같은 `head_sha`·`head_branch`여도 **해당 PR의 성공 증거가 아니다**. 기존 fallback은 이미 **squash merged**이고 연관 배열이 완전히 빈 경우에만 허용한다. Open PR association 공백은 `WAITING_EXACT_PR_CI`. 자기 PR 실패 + 더 최신 다른 PR 성공은 `RF_LATEST_CI_NOT_SUCCESS`로 중단하며 기존 성공을 대체하지 않는다. 패치 후 CI는 별도 새 HEAD 검증 필요. Release/Issue writer, #229 HOLD 보존.

---

## RF-01 추가 안전 계약 — Release Target·AC·TTL·CI Attempt (2026-11-08)

기존 PR274 HEAD `e4926f3f`의 CI [42481792421](https://github.com/planner77/layoutManager/actions/runs/42481792421)은 적용 8개 Job 성공/A2 scoped SKIP(신규 HEAD 증거 아님). `RELEASE_FINALIZER_REQUEST_V1`에 필수 필드를 추가한다: `releaseTarget=ghcr.io/planner77/layoutmanager:v<version>`, `acceptanceIds`(고유·대문자 AC 식별자 목록, closeIssue=true면 최소 1개), `ownerIntent={integrate,release,closeIssue}`(요청 의도만 표시), `issuedAtEpoch`/`expiresAtEpoch`(UTC seconds; 발급≤현재≤만료, 기간≤24h). Hash/intent는 Owner 승인 서명이 아니다. PR/Main workflow와 필수 Job의 `run_attempt=1`만 증거로 인정; attempt2+ 거부. PLAN workflow Owner actor/repo ID 제한 및 GET-only 유지. RF-01 checkpoint/nonce 영속 재사용 차단과 RF-02~04 실제 writer는 별도 구현이 필요하며 이 변경으로 최종화 완료를 주장하지 않는다. 보호된 두 Owner Environment 및 #229 HOLD 불변.

---

# Issue #273 — Release Finalizer 공통 기능 (정확한 Release만, #229 HOLD 유지)

- GitHub: https://github.com/planner77/layoutManager/issues/273
- 생성일: 2026-11-08
- 관련: #229/#218/#225/#268, PR #272(Main 42a370c)
- 구현 순서: RF-01 read-only plan → RF-02 protected merge/Main orchestration → RF-03 exact 3-image release → RF-04 Issue AC closure
- **정본**: 최신 Issue #273 본문, 기존 [Issue218LeanPolicy](Issue218LeanPolicy.md), [Decisions](Decisions.md), [Operation](Operation.md), [FailureLedger](FailureLedger.md)

## 결정 — one-shot은 검증/승인 생략이 아님

**Owner 요청 1회**를 하나의 최종화 작업으로 추적하되, Main PR CI·RuleSuite·실제 GHCR 출고·Issue 완료 AC를 독립 Gate로 둔다. 기존 #229 `HOLD_MAIN`와 `G7_RELEASE_HOLD_TAG_BLOCKED`는 유지한다. `docker-publish.yml`의 2-image publisher를 0.61.1에 일반 허용하지 않는다. App/Migrator/CPU Worker 세 역할은 protected candidate/promotion과 정확한 digest/attestation/OCI/source/version verification 후에만 별도 출고한다. 기존 release candidate/promotion의 각각 별도 Owner `workflow_dispatch`/Environment review를 위조하거나 재사용하지 않는다.

사용자의 기존 0.61.0 제한 LINE pilot 운영 DB/CAD/Volume/.env/Scene flags/Worker1, 기존 digest, 태그/latest, 백업/복구점은 이 Issue만으로 변경하지 않는다. 현재 #218은 L-01~08 공식 closure 대조 없이 종료할 수 없다.

## RF-01: 현재 PR의 구현 범위

### 순수 정책기 / GitHub 읽기 전용 연결

- `src/tests/oci/release_finalizer.py`: SHA256으로 묶은 닫힌 `RELEASE_FINALIZER_REQUEST_V1` schema 검증 (repo ID/Owner ID/Issue/PR/head/tree/base/version>=0.61.0/세 역할/nonce/stop policy).
- read-only GitHub GET adapter로 정확 PR_HEAD / source tree / source package version / Issue identity, **가장 최근 PR CI** 및 필수 aggregate/scope check 확인. Ready 전환으로 시작된 최신 CI가 실패 또는 미완료라면 과거 PASS 사용 금지.
- Squash 후에는 merge commit tree 및 **단일 parent=승인된 base SHA** 검증. Main push exact merge SHA의 `main-hold.yml` 성공을 확인. PR의 `base.sha`가 병합 뒤 다른 커밋으로 진전될 수 있으므로 이 경우에도 merge parent를 정본으로 사용.
- API가 pagination/응답/역할/버전/증거를 확인하지 못하면 fail-closed. 출력은 고정 진단코드와 `externalWrites=0`. 범위 외 API method, repo, GHCR, 운영, Issue write 불가능.
- `.github/workflows/release-finalizer.yml`: `workflow_dispatch` read-only `plan`만 허용. `permissions: {}` 최상위, job에 contents/pulls/issues/actions read, persist-credentials false. **실행 승인·후속 변이 권한이 아니다.**
- `test_release_finalizer.py`의 긍정·음성 검증을 필수 PR Scope에 연결.

### 계획 출력 상태

`WAITING_EXACT_PR_CI` → `WAITING_READY_CI` 또는 `AWAITING_REVIEW_AND_PROTECTED_MERGE` → `WAITING_EXACT_MAIN_CI` → `AWAITING_PROTECTED_THREE_ROLE_RELEASE` → (향후) `AWAITING_INDEPENDENT_ISSUE_ACCEPTANCE`.

주의: `releaseRequired=false`인 경우에도 계획만 출력하며 실제 종료되지 않는다. 어떤 값이든 이번 RF-01은 RELEASE_AUTHORIZATION과 ISSUE_ACCEPTANCE를 `NOT_VERIFIED`로 표시한다.

## RF-02~04: 후속 구현 필요 (이번 PR에 포함되지 않음)

1. **RF-02:** 현재 저장소 `allow_auto_merge=false`; Ruleset 요구 검사 통과 후 API squash/CAS 및 Main workflow run/attempt 검증, 예외 거부/재개. 새로운 메인 커밋·소스 drift 시 HALT. API/Ruleset 승인을 무시하지 않는다.
2. **RF-03:** 기존 후보/승격 코드는 `0.61.0` 고정 계약이므로 0.61.1과 후속 버전을 안전하게 parameterize 하되 immutable historical 0.61.0 근거 보존. 별도 보호 환경 Owner 두 승인·서명·3role digest proof, old aliases/partial/unknown fail closed. 절대로 #229 Main/Tag에 광범위 예외를 넣지 않는다. 이미 존재하는 immutable source/digest의 재사용은 정확 검증 증거에 한정.
3. **RF-04:** 모든 Issue AC를 명시적으로 검증된 receipt/Owner close GO에 결합한 뒤만 1회 close; 미완료는 OPEN. stage evidence, 실패 원장/기존 근거 재사용, retry/unknown partial provenance와 보존 범위 분리.

## 검증 결과 분리

- RF-01 GitHub repository 코드 작성 및 설계 대조: **IMPLEMENTED, 아직 Hosted CI 성공 증거 없음**.
- Python static/negative unit: 코드 포함, CI 실행 결과 확인 전 **NOT VERIFIED**.
- protected PR merge/Main auto-link / 0.61.1 실제 protected GHCR 게시 / Issue 자동 close: **NOT IMPLEMENTED / NOT RUN**.
- 기존 release #229 HOLD는 코드 미변경; 기존 #225 candidate/promote 승인, OCI role, digest, alias 검증도 미변경.

## 다음 승인/개발 단계

RF-01 PR의 정확 HEAD CI를 성공시킨 후 RF-02부터 implementation. 외부 환경 변경이 필요하면 Owner/Ruleset이 명시한 별도 승인 필요. 어떤 경우에도 `GO-INTEGRATE` = `RELEASE GO` = `ISSUE CLOSED`로 자동 합성하지 않는다.
