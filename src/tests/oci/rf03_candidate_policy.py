"""Fixed RF-A/B candidate policy. No network, credentials or file I/O on import.

This entrypoint never accepts an arbitrary signer. RP remains a separate locked
loopback proof. API fields not exposed by the service are never invented here.
"""
import hashlib
import json
import re
import datetime as dt
from pathlib import Path
import rf03_exact_release as exact_release

REPO = 'planner77/layoutManager'
REPO_ID = 1359528829
OWNER_ID = 45478892
PACKAGE = 'ghcr.io/planner77/layoutmanager'
PACKAGE_ID = 14938097
WORKFLOW = '.github/workflows/release-finalizer-rf03-candidate.yml'
SIGNER = REPO + '/' + WORKFLOW
SIGNER_URI = 'https://github.com/' + SIGNER + '@refs/heads/main'
VERSION = __import__('json').loads((Path(__file__).resolve().parents[3] / 'src/package.json').read_text())['version']
ENVIRONMENT = 'issue225-candidate-publish'
ROLES = ('app', 'migrator', 'cpu-worker')
SUBJECTS = {role: 'candidate-' + role + '-manifest.json' for role in ROLES}
SUBJECTS['receipt'] = 'candidate-receipt.json'
BASE = '/repos/' + REPO
CONTEXT = 'Typecheck, lint, test, build, E2E'
REQUIRED_JOBS = (CONTEXT, 'Classify PR scope and audit merge defaults',
    'Static, unit, benchmark and production build', 'General Chromium E2E (shard 1/2)',
    'General Chromium E2E (shard 2/2)', 'G7 Greenfield UI E2E (#109)',
    'G7 signed runtime and legacy migration E2E', 'Docker image size, migration and runtime smoke')


class Pending(Exception):
    """Safe error code only; raw API/command diagnostics stay private."""


def need(value, code):
    if not value:
        raise Pending(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def exact(value, names):
    need(type(value) is dict and set(value) == set(names), 'CA_FIELDS_INVALID')


def hash_value(value, length=64):
    return type(value) is str and re.fullmatch('[0-9a-f]{%d}' % length, value) is not None


def unique(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, 'CA_DUPLICATE_JSON_KEY')
        result[key] = value
    return result


def decode(raw):
    need(len(raw) <= 2 * 1024 * 1024, 'CA_JSON_TOO_LARGE')
    return json.loads(raw, object_pairs_hook=unique)


def packet(raw, expected_hash):
    need(hash_value(expected_hash) and sha(raw) == expected_hash, 'CA_PACKET_HASH_MISMATCH')
    p = decode(raw)
    exact(p, ('kind', 'repository', 'repositoryId', 'ownerId', 'sourceCommit',
              'sourceTree', 'workflowCommit', 'workflowPath', 'version', 'package',
              'packageId', 'visibility', 'roles', 'candidatePrefixTemplate',
              'environmentId', 'environmentConfigSha256', 'environmentUiObservationSha256',
              'requiredCi', 'controls',
              'permissionScope', 'stopPolicy', 'runScope', 'nonce'))
    need(p['kind'] == 'RF03_CANDIDATE_PREFIX_AUTHORIZATION_V1' and p['repository'] == REPO
         and p['repositoryId'] == REPO_ID and p['ownerId'] == OWNER_ID, 'CA_REPO_INVALID')
    need(hash_value(p['sourceCommit'], 40) and hash_value(p['sourceTree'], 40)
         and p['workflowCommit'] == p['sourceCommit'] and p['workflowPath'] == WORKFLOW,
         'CA_SOURCE_INVALID')
    need(type(p['version']) is str and p['version'] == VERSION
         and exact_release.exact_tags(VERSION) and p['package'] == PACKAGE and p['packageId'] == PACKAGE_ID
         and p['visibility'] == 'private' and p['roles'] == list(ROLES), 'CA_PACKAGE_OR_ROLE_INVALID')
    need(p['candidatePrefixTemplate'] == 'candidate-{sourceCommit}-{runId}-1-'
         and p['runScope'] == 'fresh-owner-dispatch-attempt-1'
         and p['permissionScope'] == 'candidate-prefix-only-not-release-go'
         and p['stopPolicy'] == 'HALT-no-retry-delete-overwrite-rollback', 'CA_SCOPE_INVALID')
    need(hash_value(p['nonce'], 16), 'CA_NONCE_INVALID')
    need(type(p['environmentId']) is int and p['environmentId'] > 0
         and hash_value(p['environmentConfigSha256'])
         and (p['environmentUiObservationSha256'] is None
              or hash_value(p['environmentUiObservationSha256'])), 'CA_ENVIRONMENT_INVALID')
    exact(p['requiredCi'], ('runId', 'headSha', 'archiveSha', 'treeSha', 'workflowId', 'runAttempt'))
    need(all(type(p['requiredCi'][key]) is int and p['requiredCi'][key] > 0
             for key in ('runId', 'workflowId', 'runAttempt'))
         and hash_value(p['requiredCi']['headSha'], 40)
         and hash_value(p['requiredCi']['archiveSha'], 40)
         and p['requiredCi']['treeSha'] == p['sourceTree'], 'CA_REQUIRED_CI_INVALID')
    exact(p['controls'], ('policyReceiptSha256', 'writerInventorySha256',
                          'legacyControlReceiptSha256', 'rollbackPacketSha256'))
    need(all(hash_value(value) for value in p['controls'].values()), 'CA_CONTROL_LINK_INVALID')
    return p


def title(packet_sha):
    return 'CANDIDATE PUBLISH | ' + packet_sha


def job_name(packet_sha):
    return 'Candidate publish | ' + packet_sha


def guard(p, packet_sha, env, git):
    need(env.get('GITHUB_ACTIONS') == 'true' and env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and env.get('GITHUB_REPOSITORY') == REPO
         and env.get('GITHUB_REPOSITORY_ID') == str(REPO_ID)
         and env.get('GITHUB_REPOSITORY_OWNER_ID') == str(OWNER_ID)
         and env.get('GITHUB_ACTOR_ID') == str(OWNER_ID)
         and env.get('GITHUB_TRIGGERING_ACTOR') == env.get('GITHUB_ACTOR')
         and env.get('GITHUB_REF') == 'refs/heads/main'
         and env.get('GITHUB_WORKFLOW_REF') == SIGNER + '@refs/heads/main'
         and env.get('GITHUB_WORKFLOW_SHA') == env.get('GITHUB_SHA') == p['sourceCommit']
         and env.get('RUNNER_ENVIRONMENT') == 'github-hosted'
         and env.get('GITHUB_RUN_ATTEMPT') == '1'
         and re.fullmatch('[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', ''))
         and env.get('CA_PACKET_SHA256') == packet_sha, 'CA_TRUSTED_DISPATCH_INVALID')
    need(git('rev-parse', 'HEAD') == p['sourceCommit']
         and git('rev-parse', 'HEAD^{tree}') == p['sourceTree']
         and git('status', '--porcelain', '--untracked-files=no') == '', 'CA_EXACT_TREE_INVALID')
    return {'sourceCommit': p['sourceCommit'], 'sourceTree': p['sourceTree'],
            'workflowCommit': p['workflowCommit'], 'runId': env['GITHUB_RUN_ID'],
            'runAttempt': '1', 'packetSha256': packet_sha}


def tags(expected):
    return {role: 'candidate-%s-%s-1-%s' % (expected['sourceCommit'], expected['runId'], role)
            for role in ROLES}


def rows(api, path, field):
    result = []
    total = None
    for page in range(1, 101):
        data = api.get(path + ('&' if '?' in path else '?') + f'per_page=100&page={page}')
        need(type(data) is dict and type(data.get(field)) is list
             and type(data.get('total_count')) is int, 'CA_PAGINATION_INVALID')
        total = data['total_count'] if total is None else total
        part = data[field]
        need(data['total_count'] == total and len(part) <= 100, 'CA_PAGINATION_CHANGED')
        result.extend(part)
        if len(part) < 100:
            need(len(result) == total, 'CA_PAGINATION_INCOMPLETE')
            return result
    raise Pending('CA_PAGINATION_LIMIT')


def environment_summary(config, policies):
    rules = config.get('protection_rules')
    need(type(rules) is list and config.get('deployment_branch_policy') ==
         {'protected_branches': False, 'custom_branch_policies': True},
         'CA_ENVIRONMENT_PROTECTION_PENDING')
    reviewers = [r for r in rules if r.get('type') == 'required_reviewers']
    need(len(reviewers) == 1 and type(reviewers[0].get('prevent_self_review')) is bool
         and reviewers[0].get('reviewers') and len(reviewers[0]['reviewers']) == 1
         and reviewers[0]['reviewers'][0].get('type') == 'User'
         and reviewers[0]['reviewers'][0].get('reviewer', {}).get('id') == OWNER_ID,
         'CA_OWNER_REVIEWER_PENDING')
    # Unknown rule types/branch-vs-tag policy fields cannot silently widen access.
    need(all(r.get('type') in ('required_reviewers', 'branch_policy', 'wait_timer') for r in rules)
         and len(policies) == 1 and policies[0].get('name') == 'main'
         and policies[0].get('type') == 'branch', 'CA_MAIN_ENV_POLICY_PENDING')
    bypass = config.get('can_admins_bypass')
    return {'id': config.get('id'), 'name': config.get('name'),
            'can_admins_bypass': bypass if type(bypass) is bool else 'NOT_EXPOSED_AS_BOOLEAN',
            'prevent_self_review': reviewers[0]['prevent_self_review'],
            'reviewerId': OWNER_ID, 'branchPolicies': [{'name': 'main', 'type': 'branch'}],
            'protectionRuleTypes': sorted(r['type'] for r in rules)}


def ui_observation(raw, p, now=None):
    """Owner-observed UI evidence only, NOT API attestation or authorization.

    GitHub's current public environment REST/OpenAPI schema omits the admin
    bypass setting. A later actual Owner UI readback must supply this separate
    receipt before reviewing the packet/run. A synthetic test cannot confirm it.
    """
    need(sha(raw) == p['environmentUiObservationSha256'], 'CA_UI_EVIDENCE_HASH_MISMATCH')
    value = decode(raw)
    exact(value, ('kind', 'repositoryId', 'ownerId', 'environmentId', 'environmentName',
                  'canAdminsBypass', 'observerId', 'observedAt', 'source'))
    need(value['kind'] == 'OWNER_OBSERVED_ENVIRONMENT_UI_V1'
         and value['repositoryId'] == REPO_ID and value['ownerId'] == OWNER_ID
         and value['environmentId'] == p['environmentId'] and value['environmentName'] == ENVIRONMENT
         and value['observerId'] == OWNER_ID and value['canAdminsBypass'] is False
         and value['source'] == 'https://github.com/' + REPO + '/settings/environments',
         'CA_UI_OBSERVATION_PENDING')
    try:
        observed = dt.datetime.fromisoformat(value['observedAt'].replace('Z', '+00:00'))
        now = now or dt.datetime.now(dt.timezone.utc)
        need(observed.tzinfo is not None and 0 <= (now - observed).total_seconds() <= 86400,
             'CA_UI_OBSERVATION_STALE')
    except (AttributeError, TypeError, ValueError, OverflowError):
        raise Pending('CA_UI_OBSERVATION_TIME_INVALID') from None
    return {'origin': 'OWNER_OBSERVED_UI_NOT_API', 'sha256': sha(raw),
            'observerId': OWNER_ID, 'observedAt': value['observedAt'], 'canAdminsBypass': False}


def environment_gate(api, p, ui_evidence):
    """Read-only prerequisite before scheduling the environment-referencing job.

    This is a read-only protection precondition, not a guarantee about platform
    environment creation timing (not observed here). Later authorized dispatch
    requires an actual existing-environment GET first. Changes afterward remain
    a race, rechecked in the publish job. This is not approval or write authority.
    """
    env_path = BASE + '/environments/' + ENVIRONMENT
    config = api.get(env_path)
    policies = rows(api, env_path + '/deployment-branch-policies', 'branch_policies')
    summary = environment_summary(config, policies)
    need(summary['id'] == p['environmentId'] and summary['name'] == ENVIRONMENT
         and sha(canonical(summary)) == p['environmentConfigSha256'], 'CA_ENVIRONMENT_CHANGED')
    need(summary['prevent_self_review'] is False, 'CA_OWNER_ONLY_SELF_REVIEW_IMPOSSIBLE')
    need(config.get('can_admins_bypass') is not True, 'CA_ADMIN_BYPASS_ENABLED')
    if config.get('can_admins_bypass') is False:
        bypass = {'origin': 'API_RUNTIME_BOOLEAN',
                  'sha256': sha(canonical({'environmentId': summary['id'], 'can_admins_bypass': False})),
                  'observerId': None, 'observedAt': None, 'canAdminsBypass': False}
    else:
        bypass = ui_observation(ui_evidence, p)
    return summary, bypass


def approval_gate(api, p, expected, ui_evidence):
    run_id = expected['runId']
    run = api.get(BASE + '/actions/runs/' + run_id + '/attempts/1')
    need(run.get('id') == int(run_id) and run.get('repository', {}).get('id') == REPO_ID
         and run.get('head_sha') == p['sourceCommit'] and run.get('head_branch') == 'main'
         and run.get('path') == WORKFLOW and run.get('event') == 'workflow_dispatch'
         and run.get('run_attempt') == 1 and run.get('status') == 'in_progress'
         and run.get('actor', {}).get('id') == OWNER_ID
         and run.get('triggering_actor', {}).get('id') == OWNER_ID
         and run.get('display_title') == title(expected['packetSha256']), 'CA_RUN_BINDING_PENDING')
    workflow_id = run.get('workflow_id')
    need(type(workflow_id) is int and workflow_id > 0, 'CA_WORKFLOW_ID_PENDING')
    attempts = rows(api, BASE + '/actions/workflows/' + str(workflow_id) +
                    '/runs?event=workflow_dispatch', 'workflow_runs')
    matching = [r for r in attempts if r.get('display_title') == title(expected['packetSha256'])]
    need(len(matching) == 1 and matching[0].get('id') == int(run_id), 'CA_PACKET_DISPATCH_REUSED')
    main = api.get(BASE + '/git/ref/heads/main')
    need(main.get('ref') == 'refs/heads/main'
         and main.get('object', {}).get('sha') == p['sourceCommit'], 'CA_STALE_MAIN')
    commit = api.get(BASE + '/git/commits/' + p['sourceCommit'])
    need(commit.get('sha') == p['sourceCommit'] and commit.get('tree', {}).get('sha') == p['sourceTree'],
         'CA_API_TREE_MISMATCH')
    jobs = rows(api, BASE + '/actions/runs/' + run_id + '/attempts/1/jobs', 'jobs')
    active = [j for j in jobs if j.get('name') == job_name(expected['packetSha256'])]
    need(len(active) == 1 and type(active[0].get('id')) is int
         and active[0].get('run_id') == int(run_id) and active[0].get('head_sha') == p['sourceCommit']
         and active[0].get('status') == 'in_progress', 'CA_JOB_PACKET_BINDING_PENDING')
    summary, bypass = environment_gate(api, p, ui_evidence)
    reviews = api.get(BASE + '/actions/runs/' + run_id + '/approvals')
    need(type(reviews) is list and len(reviews) == 1, 'CA_APPROVAL_HISTORY_PENDING')
    review = reviews[0]
    need(review.get('state') == 'approved' and review.get('user', {}).get('id') == OWNER_ID
         and [(e.get('id'), e.get('name')) for e in review.get('environments', [])] ==
         [(p['environmentId'], ENVIRONMENT)], 'CA_OWNER_APPROVAL_PENDING')
    ci = p['requiredCi']
    prior = api.get(BASE + '/actions/runs/' + str(ci['runId']))
    need(prior.get('id') == ci['runId'] and prior.get('workflow_id') == ci['workflowId']
         and prior.get('repository', {}).get('id') == REPO_ID
         and prior.get('path') == '.github/workflows/pr-ci.yml'
         and prior.get('head_sha') == ci['headSha'] and prior.get('status') == 'completed'
         and prior.get('conclusion') == 'success' and prior.get('run_attempt') == ci['runAttempt'],
         'CA_REQUIRED_CI_PENDING')
    ci_commit = api.get(BASE + '/git/commits/' + ci['headSha'])
    need(ci_commit.get('sha') == ci['headSha'] and ci_commit.get('tree', {}).get('sha') == p['sourceTree'],
         'CA_CI_TREE_RELATION_INVALID')
    archive = api.get(BASE + '/git/commits/' + ci['archiveSha'])
    need(archive.get('sha') == ci['archiveSha'] and archive.get('tree', {}).get('sha') == p['sourceTree']
         and (ci['archiveSha'] == ci['headSha'] or ci['headSha'] in
              [parent.get('sha') for parent in archive.get('parents', [])]), 'CA_CI_ARCHIVE_RELATION_INVALID')
    ci_jobs = rows(api, BASE + '/actions/runs/' + str(ci['runId']) +
                   '/attempts/' + str(ci['runAttempt']) + '/jobs', 'jobs')
    for name in REQUIRED_JOBS:
        matches = [j for j in ci_jobs if j.get('name') == name]
        need(len(matches) == 1 and matches[0].get('status') == 'completed'
             and matches[0].get('conclusion') == 'success'
             and matches[0].get('run_id') == ci['runId']
             and matches[0].get('head_sha') in (ci['headSha'], ci['archiveSha']), 'CA_REQUIRED_JOBS_PENDING')
    package = api.get('/users/planner77/packages/container/layoutmanager')
    need(package.get('id') == PACKAGE_ID and package.get('name') == 'layoutmanager'
         and package.get('package_type') == 'container' and package.get('visibility') == 'private'
         and package.get('owner', {}).get('id') == OWNER_ID
         and package.get('repository', {}).get('id') == REPO_ID, 'CA_PRIVATE_PACKAGE_PENDING')
    return {'environment': summary, 'adminBypassEvidence': bypass,
            'jobId': active[0]['id'], 'reviewerId': OWNER_ID,
            'reviewState': 'approved', 'reviewBinding': 'run-attempt1-title-job-packet-sha',
            'reviewTimestamp': 'NOT_EXPOSED_BY_API', 'independentSecondHuman': False,
            'requiredCiRunId': ci['runId'], 'requiredCiHeadSha': ci['headSha'],
            'requiredCiArchiveSha': ci['archiveSha'], 'candidateMainSha': p['sourceCommit'],
            'ciArchiveBinding': 'APPROVED_PACKET_SAME_TREE_PARENT_RELATION_NOT_RUN_API_FIELD',
            'controls': 'EXTERNAL_HASH_REFERENCES_ONLY'}


def certificate(result, expected, mapping):
    need(type(result) is list and result, 'CA_CERTIFICATE_RESULT_EMPTY')
    wanted = {SUBJECTS[role]: mapping[role] for role in (*ROLES, 'receipt')}
    for item in result:
        value = item.get('verificationResult', {})
        cert = value.get('signature', {}).get('certificate', {})
        statement = value.get('statement', {})
        subjects = statement.get('subject', [])
        actual = {}
        for subject in subjects:
            name = subject.get('name'); digest = subject.get('digest', {}).get('sha256')
            need(type(name) is str and name not in actual and hash_value(digest), 'CA_SUBJECT_INVALID')
            actual[name] = digest
        if actual != wanted:
            continue
        need(cert.get('sourceRepositoryIdentifier') == str(REPO_ID)
             and cert.get('sourceRepositoryOwnerIdentifier') == str(OWNER_ID)
             and cert.get('sourceRepositoryURI') == 'https://github.com/' + REPO
             and cert.get('sourceRepositoryDigest') == expected['sourceCommit']
             and cert.get('sourceRepositoryRef') == 'refs/heads/main'
             and cert.get('buildSignerURI') == SIGNER_URI
             and cert.get('buildSignerDigest') == expected['workflowCommit']
             and cert.get('runnerEnvironment') == 'github-hosted'
             and cert.get('issuer') == 'https://token.actions.githubusercontent.com'
             and cert.get('runInvocationURI') == 'https://github.com/' + REPO +
             '/actions/runs/' + expected['runId'] + '/attempts/1'
             and statement.get('predicateType') == 'https://slsa.dev/provenance/v1', 'CA_CERTIFICATE_IDENTITY_INVALID')
        return
    raise Pending('CA_SUBJECT_MAPPING_INVALID')
