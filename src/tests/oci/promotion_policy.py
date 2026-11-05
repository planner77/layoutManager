"""RF-C fixed exact-digest packet and fresh promotion-run policy; import is pure.

Packet hashes/control links are review bindings, never proof of Owner authority.
Candidate source A and promotion code B are deliberately separate identities.
"""
import re

import candidate_policy as ca
import registry_promotion as rt

WORKFLOW = '.github/workflows/release-promote.yml'
FILES = ('candidate-receipt.json', 'candidate-bundle.sigstore.json', 'verification.json', 'SHA256SUMS')
STOP = 'HALT-no-retry-delete-overwrite-rollback-alias-deploy'
need = ca.need


def template():
    return {'kind': 'EXACT_DIGEST_RELEASE_PACKET_V1', 'repositoryId': ca.REPO_ID,
        'ownerId': ca.OWNER_ID, 'package': ca.PACKAGE, 'packageId': ca.PACKAGE_ID,
        'version': rt.VERSION, 'nonce': None, 'workflowPath': WORKFLOW,
        'promotion': {'sourceCommit': None, 'sourceTree': None, 'workflowCommit': None, 'requiredCi': None},
        'candidate': {'sourceCommit': None, 'sourceTree': None, 'workflowCommit': None,
            'runId': None, 'runAttempt': '1', 'packetSha256': None, 'artifact': None},
        'roles': None, 'environmentId': None, 'environmentConfigSha256': None,
        'environmentUiObservationSha256': None,
        'controls': {'policyReceiptSha256': None, 'writerInventorySha256': None,
            'legacyControlReceiptSha256': None, 'rollbackPacketSha256': None,
            'actionsGrants': 'UNKNOWN'},
        'rollbackBaseline': None, 'permissionScope': 'exact-three-final-manifests-only',
        'runScope': 'fresh-owner-dispatch-attempt-1', 'stopPolicy': STOP}


def packet(raw, expected_hash):
    need(ca.hash_value(expected_hash) and ca.sha(raw) == expected_hash, 'RC_PACKET_HASH_INVALID')
    p = ca.decode(raw)
    ca.exact(p, template())
    need(p['kind'] == 'EXACT_DIGEST_RELEASE_PACKET_V1' and p['repositoryId'] == ca.REPO_ID
         and p['ownerId'] == ca.OWNER_ID and p['package'] == ca.PACKAGE
         and p['packageId'] == ca.PACKAGE_ID and p['version'] == rt.VERSION
         and p['workflowPath'] == WORKFLOW and ca.hash_value(p['nonce'], 16)
         and p['permissionScope'] == 'exact-three-final-manifests-only'
         and p['runScope'] == 'fresh-owner-dispatch-attempt-1' and p['stopPolicy'] == STOP, 'RC_SCOPE_INVALID')
    b, a = p['promotion'], p['candidate']
    ca.exact(b, ('sourceCommit', 'sourceTree', 'workflowCommit', 'requiredCi'))
    ca.exact(a, ('sourceCommit', 'sourceTree', 'workflowCommit', 'runId', 'runAttempt', 'packetSha256', 'artifact'))
    for source in (a, b):
        need(ca.hash_value(source['sourceCommit'], 40) and ca.hash_value(source['sourceTree'], 40)
             and source['workflowCommit'] == source['sourceCommit'], 'RC_SOURCE_A_OR_B_INVALID')
    need(type(a['runId']) is str and re.fullmatch('[1-9][0-9]{0,19}', a['runId'])
         and a['runAttempt'] == '1' and ca.hash_value(a['packetSha256']), 'RC_CANDIDATE_RUN_INVALID')
    ci = b['requiredCi']
    ca.exact(ci, ('runId', 'workflowId', 'runAttempt', 'headSha', 'archiveSha', 'treeSha'))
    need(all(type(ci[k]) is int and ci[k] > 0 for k in ('runId', 'workflowId', 'runAttempt'))
         and all(ca.hash_value(ci[k], 40) for k in ('headSha', 'archiveSha'))
         and ci['treeSha'] == b['sourceTree'], 'RC_REQUIRED_CI_INVALID')
    art = a['artifact']
    ca.exact(art, ('id', 'name', 'digest', 'size', 'files'))
    need(type(art['id']) is int and art['id'] > 0 and type(art['size']) is int and 0 < art['size'] <= 16 * 1024 * 1024
         and art['name'] == 'issue225-candidate-proof-' + a['runId'] + '-1'
         and rt.digest_value(art['digest']), 'RC_ARTIFACT_INVALID')
    ca.exact(art['files'], FILES)
    need(all(ca.hash_value(v) for v in art['files'].values()), 'RC_ARTIFACT_HASH_INVALID')
    need(type(p['environmentId']) is int and p['environmentId'] > 0
         and ca.hash_value(p['environmentConfigSha256'])
         and (p['environmentUiObservationSha256'] is None or ca.hash_value(p['environmentUiObservationSha256'])),
         'RC_ENVIRONMENT_INVALID')
    ca.exact(p['controls'], template()['controls'])
    need(all(ca.hash_value(v) for k, v in p['controls'].items() if k != 'actionsGrants')
         and p['controls']['actionsGrants'] == 'INCLUDED_IN_OWNER_REVIEWED_WRITER_INVENTORY',
         'RC_EXTERNAL_CONTROLS_NOT_READY')
    baseline = p['rollbackBaseline']
    ca.exact(baseline, ('receiptSha256', 'sourceCommit', 'appDigest', 'migratorDigest', 'automaticRollback'))
    need(ca.hash_value(baseline['receiptSha256']) and ca.hash_value(baseline['sourceCommit'], 40)
         and rt.digest_value(baseline['appDigest']) and rt.digest_value(baseline['migratorDigest'])
         and baseline['automaticRollback'] is False, 'RC_ROLLBACK_BASELINE_NOT_READY')
    ca.exact(p['roles'], ca.ROLES)
    rt.validate_packet(rt_packet(p))
    for entry in p['roles'].values():
        ca.exact(entry, ('digest', 'mediaType', 'size', 'configDigest', 'platformManifestDigest'))
        need(rt.digest_value(entry['configDigest']) and rt.digest_value(entry['platformManifestDigest']),
             'RC_CONFIG_DESCRIPTOR_INVALID')
    return p


def rt_packet(p):
    a = p['candidate']
    common = {k: a[k] for k in ('sourceCommit', 'sourceTree', 'workflowCommit', 'runId', 'runAttempt')}
    common['candidateReceiptSha256'] = a['artifact']['files']['candidate-receipt.json']
    return {'schema': 'RT_PLAN_V1', 'package': ca.PACKAGE, 'version': rt.VERSION,
        'workflowPath': ca.WORKFLOW, **common, 'candidates': {
            role: {**{k: common[k] for k in ('sourceCommit', 'sourceTree', 'workflowCommit', 'candidateReceiptSha256')},
                **{k: p['roles'][role][k] for k in ('digest', 'mediaType', 'size')}, 'role': role,
                'candidateRef': ca.PACKAGE + ':' + ca.tags(a)[role],
                'finalRef': ca.PACKAGE + ':' + rt.FINALS[role]} for role in ca.ROLES}}


def plan(value):
    try:
        raw = ca.canonical(value); packet(raw, ca.sha(raw))
    except (ca.Pending, rt.Rejected, KeyError, TypeError, ValueError):
        return {'state': 'NOT_READY', 'authority': 'NOT_VERIFIED', 'httpRequests': 0,
                'blocker': 'ACTUAL_CANDIDATE_CONTROLS_ENVIRONMENT_CI_AND_ROLLBACK_REQUIRED'}
    return {'state': 'REVIEWABLE_PACKET_ONLY', 'authority': 'NOT_VERIFIED', 'httpRequests': 0,
            'packetSha256': ca.sha(ca.canonical(value)), 'actualExecution': 'SEPARATE_OWNER_REVIEW_REQUIRED'}


def title(packet_sha):
    return 'PROMOTION PUBLISH | ' + packet_sha


def job_name(packet_sha):
    return 'Promote exact digests | ' + packet_sha


def guard(p, packet_sha, env, git):
    b = p['promotion']
    need(env.get('GITHUB_ACTIONS') == 'true' and env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and env.get('GITHUB_REPOSITORY') == ca.REPO and env.get('GITHUB_REPOSITORY_ID') == str(ca.REPO_ID)
         and env.get('GITHUB_REPOSITORY_OWNER_ID') == str(ca.OWNER_ID)
         and env.get('GITHUB_ACTOR_ID') == str(ca.OWNER_ID)
         and env.get('GITHUB_TRIGGERING_ACTOR') == env.get('GITHUB_ACTOR')
         and env.get('GITHUB_REF') == 'refs/heads/main'
         and env.get('GITHUB_WORKFLOW_REF') == ca.REPO + '/' + WORKFLOW + '@refs/heads/main'
         and env.get('GITHUB_SHA') == env.get('GITHUB_WORKFLOW_SHA') == b['sourceCommit']
         and env.get('RUNNER_ENVIRONMENT') == 'github-hosted' and env.get('GITHUB_RUN_ATTEMPT') == '1'
         and re.fullmatch('[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', ''))
         and env.get('RC_PACKET_SHA256') == packet_sha, 'RC_TRUSTED_DISPATCH_INVALID')
    need(git('rev-parse', 'HEAD') == b['sourceCommit'] and git('rev-parse', 'HEAD^{tree}') == b['sourceTree']
         and git('status', '--porcelain', '--untracked-files=no') == '', 'RC_EXACT_CODE_TREE_INVALID')
    need(env['GITHUB_RUN_ID'] != p['candidate']['runId'], 'RC_CANDIDATE_APPROVAL_CANNOT_BE_REUSED')
    return {'sourceCommit': b['sourceCommit'], 'sourceTree': b['sourceTree'], 'workflowCommit': b['workflowCommit'],
            'runId': env['GITHUB_RUN_ID'], 'runAttempt': '1', 'packetSha256': packet_sha}


def candidate_metadata(api, p):
    a = p['candidate']; run_id = a['runId']; artifact = a['artifact']
    run = api.get(ca.BASE + '/actions/runs/' + run_id + '/attempts/1')
    need(run.get('id') == int(run_id) and run.get('repository', {}).get('id') == ca.REPO_ID
         and run.get('head_sha') == a['sourceCommit'] and run.get('head_branch') == 'main'
         and run.get('path') == ca.WORKFLOW and run.get('event') == 'workflow_dispatch'
         and run.get('run_attempt') == 1 and run.get('status') == 'completed' and run.get('conclusion') == 'success'
         and run.get('actor', {}).get('id') == ca.OWNER_ID and run.get('triggering_actor', {}).get('id') == ca.OWNER_ID
         and run.get('display_title') == ca.title(a['packetSha256']), 'RC_CANDIDATE_RUN_NOT_VERIFIED')
    commit = api.get(ca.BASE + '/git/commits/' + a['sourceCommit'])
    need(commit.get('sha') == a['sourceCommit'] and commit.get('tree', {}).get('sha') == a['sourceTree'],
         'RC_CANDIDATE_TREE_INVALID')
    artifacts = ca.rows(api, ca.BASE + '/actions/runs/' + run_id + '/artifacts', 'artifacts')
    value = api.get(ca.BASE + '/actions/artifacts/' + str(artifact['id']))
    need(len(artifacts) == 1 and artifacts[0] == value, 'RC_POSTJOB_ARTIFACT_INVENTORY_INVALID')
    need(value.get('id') == artifact['id'] and value.get('name') == artifact['name']
         and value.get('digest') == artifact['digest'] and value.get('size_in_bytes') == artifact['size']
         and value.get('expired') is False and value.get('workflow_run', {}).get('id') == int(run_id)
         and value['workflow_run'].get('repository_id') == ca.REPO_ID
         and value['workflow_run'].get('head_sha') == a['sourceCommit'], 'RC_ARTIFACT_METADATA_INVALID')
    return artifact


def approval_gate(api, p, expected, ui):
    b = p['promotion']; run_id = expected['runId']; digest = expected['packetSha256']
    run = api.get(ca.BASE + '/actions/runs/' + run_id + '/attempts/1')
    need(run.get('id') == int(run_id) and run.get('repository', {}).get('id') == ca.REPO_ID
         and run.get('head_sha') == b['sourceCommit'] and run.get('head_branch') == 'main'
         and run.get('path') == WORKFLOW and run.get('event') == 'workflow_dispatch'
         and run.get('run_attempt') == 1 and run.get('status') == 'in_progress'
         and run.get('actor', {}).get('id') == ca.OWNER_ID and run.get('triggering_actor', {}).get('id') == ca.OWNER_ID
         and run.get('display_title') == title(digest), 'RC_RUN_PACKET_BINDING_INVALID')
    need(type(run.get('workflow_id')) is int and run['workflow_id'] > 0, 'RC_WORKFLOW_ID_UNKNOWN')
    runs = ca.rows(api, ca.BASE + '/actions/workflows/' + str(run['workflow_id']) + '/runs?event=workflow_dispatch', 'workflow_runs')
    matches = [r for r in runs if r.get('display_title') == title(digest)]
    need(len(matches) == 1 and matches[0].get('id') == int(run_id), 'RC_PACKET_DISPATCH_REUSED')
    main = api.get(ca.BASE + '/git/ref/heads/main')
    commit = api.get(ca.BASE + '/git/commits/' + b['sourceCommit'])
    need(main.get('object', {}).get('sha') == b['sourceCommit'] and main.get('ref') == 'refs/heads/main'
         and commit.get('sha') == b['sourceCommit'] and commit.get('tree', {}).get('sha') == b['sourceTree'], 'RC_STALE_CODE_MAIN')
    jobs = ca.rows(api, ca.BASE + '/actions/runs/' + run_id + '/attempts/1/jobs', 'jobs')
    active = [j for j in jobs if j.get('name') == job_name(digest)]
    need(len(active) == 1 and type(active[0].get('id')) is int and active[0]['id'] > 0
         and active[0].get('run_id') == int(run_id) and active[0].get('head_sha') == b['sourceCommit']
         and active[0].get('status') == 'in_progress', 'RC_JOB_PACKET_BINDING_INVALID')
    summary, bypass = ca.environment_gate(api, p, ui)
    reviews = api.get(ca.BASE + '/actions/runs/' + run_id + '/approvals')
    need(type(reviews) is list and len(reviews) == 1 and reviews[0].get('state') == 'approved'
         and reviews[0].get('user', {}).get('id') == ca.OWNER_ID
         and [(e.get('id'), e.get('name')) for e in reviews[0].get('environments', [])] == [(p['environmentId'], ca.ENVIRONMENT)],
         'RC_FRESH_OWNER_REVIEW_MISSING')
    ci = b['requiredCi']; prior = api.get(ca.BASE + '/actions/runs/' + str(ci['runId']))
    need(prior.get('id') == ci['runId'] and prior.get('workflow_id') == ci['workflowId']
         and prior.get('repository', {}).get('id') == ca.REPO_ID and prior.get('path') == '.github/workflows/pr-ci.yml'
         and prior.get('head_sha') == ci['headSha'] and prior.get('run_attempt') == ci['runAttempt']
         and prior.get('status') == 'completed' and prior.get('conclusion') == 'success', 'RC_CODE_FULL_CI_MISSING')
    for sha in (ci['headSha'], ci['archiveSha']):
        item = api.get(ca.BASE + '/git/commits/' + sha)
        need(item.get('sha') == sha and item.get('tree', {}).get('sha') == b['sourceTree'], 'RC_CODE_CI_TREE_INVALID')
        if sha == ci['archiveSha']:
            need(sha == ci['headSha'] or ci['headSha'] in [v.get('sha') for v in item.get('parents', [])], 'RC_CODE_CI_PARENT_INVALID')
    ci_jobs = ca.rows(api, ca.BASE + '/actions/runs/' + str(ci['runId']) + '/attempts/' + str(ci['runAttempt']) + '/jobs', 'jobs')
    for name in ca.REQUIRED_JOBS:
        matches = [j for j in ci_jobs if j.get('name') == name]
        need(len(matches) == 1 and matches[0].get('run_id') == ci['runId']
             and matches[0].get('head_sha') in (ci['headSha'], ci['archiveSha'])
             and matches[0].get('status') == 'completed' and matches[0].get('conclusion') == 'success', 'RC_CODE_REQUIRED_JOB_MISSING')
    package = api.get('/users/planner77/packages/container/layoutmanager')
    need(package.get('id') == ca.PACKAGE_ID and package.get('name') == 'layoutmanager'
         and package.get('visibility') == 'private' and package.get('package_type') == 'container'
         and package.get('owner', {}).get('id') == ca.OWNER_ID and package.get('repository', {}).get('id') == ca.REPO_ID,
         'RC_PRIVATE_PACKAGE_INVALID')
    legacy = api.get(ca.BASE + '/actions/workflows/355693716')
    need(legacy.get('id') == 355693716 and legacy.get('path') == '.github/workflows/docker-publish.yml'
         and legacy.get('state') == 'disabled_manually', 'RC_LEGACY_CONTROL_NOT_READY')
    old_runs = ca.rows(api, ca.BASE + '/actions/workflows/355693716/runs', 'workflow_runs')
    need(all(r.get('status') == 'completed' for r in old_runs), 'RC_LEGACY_RUN_ACTIVE_OR_UNKNOWN')
    return {'reviewerId': ca.OWNER_ID, 'reviewState': 'approved', 'jobId': active[0]['id'],
        'environmentId': summary['id'], 'adminBypassOrigin': bypass['origin'], 'independentSecondHuman': False,
        'externalControls': 'OWNER_REVIEWED_HASH_LINKS_NOT_LIVE_POLICY_OR_ALL_WRITER_VERIFICATION'}
