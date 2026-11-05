#!/usr/bin/env python3
"""LP01–06: bounded legacy workflow observations; default plan makes no HTTP.

An execution flag is a request, never evidence of external Owner approval.
Only the separately approved operator may request the two fixed mutations.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request

REPO = 'planner77/layoutManager'
REPO_ID = 1359528829
OWNER_ID = 45478892
LEGACY = 355693716
LEGACY_PATH = '.github/workflows/docker-publish.yml'
REPLACEMENT_PATH = '.github/workflows/main-hold.yml'
SAFE_RUN = 42075718479
SAFE_SOURCE = '476b686a7b9bb1ff9c691a71f895bd833311e090'
BASE = '/repos/' + REPO
ROOT = Path(__file__).resolve().parents[3]
SHA = re.compile('[0-9a-f]{40}')
HASH = re.compile('[0-9a-f]{64}')


class Blocked(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Blocked(code)


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def validate_packet(raw, digest):
    require(isinstance(digest, str) and HASH.fullmatch(digest)
            and hashlib.sha256(raw).hexdigest() == digest, 'LP_PACKET_HASH_MISMATCH')
    p = json.loads(raw)
    keys = {'schemaVersion', 'repository', 'repositoryId', 'ownerId', 'sourceCommit',
            'sourceTree', 'helperSha256', 'replacementWorkflowSha256', 'replacementRunId',
            'replacementWorkflowId', 'legacyWorkflowId', 'legacyWorkflowPath',
            'expectedLegacyState', 'safeRunId', 'safeRunSource', 'safeRunAttempt',
            'inventorySha256', 'credentialPath'}
    require(isinstance(p, dict) and set(p) == keys, 'LP_PACKET_SCHEMA_INVALID')
    require(type(p['schemaVersion']) is int and p['schemaVersion'] == 1
            and p['repository'] == REPO and p['repositoryId'] == REPO_ID
            and p['ownerId'] == OWNER_ID, 'LP_REPOSITORY_MISMATCH')
    require(p['legacyWorkflowId'] == LEGACY and p['legacyWorkflowPath'] == LEGACY_PATH
            and p['expectedLegacyState'] == 'active' and p['safeRunId'] == SAFE_RUN
            and p['safeRunSource'] == SAFE_SOURCE, 'LP_LEGACY_OR_RUN_MISMATCH')
    for key in ('sourceCommit', 'sourceTree'):
        require(isinstance(p[key], str) and SHA.fullmatch(p[key]), 'LP_SOURCE_INVALID')
    for key in ('helperSha256', 'replacementWorkflowSha256', 'inventorySha256'):
        require(isinstance(p[key], str) and HASH.fullmatch(p[key]), 'LP_CONTENT_HASH_INVALID')
    for key in ('replacementRunId', 'replacementWorkflowId', 'safeRunAttempt'):
        require(type(p[key]) is int and p[key] > 0, 'LP_RUN_METADATA_INVALID')
    require(p['safeRunAttempt'] <= 50, 'LP_SAFE_ATTEMPT_LIMIT_INVALID')
    require(p['replacementWorkflowId'] != LEGACY
            and p['replacementRunId'] != SAFE_RUN
            and p['credentialPath'] == 'existing-owner-credential', 'LP_ACTOR_PATH_INVALID')
    return p


def local_source(p):
    require(git('rev-parse', 'HEAD') == p['sourceCommit']
            and git('rev-parse', p['sourceCommit'] + '^{tree}') == p['sourceTree'],
            'LP_LOCAL_SOURCE_MISMATCH')
    require(not git('status', '--porcelain', '--untracked-files=no'), 'LP_SOURCE_DIRTY')
    require(hashlib.sha256(Path(__file__).read_bytes()).hexdigest() == p['helperSha256']
            and hashlib.sha256((ROOT / REPLACEMENT_PATH).read_bytes()).hexdigest()
                == p['replacementWorkflowSha256'], 'LP_LOCAL_CONTENT_MISMATCH')


def allowed_route(method, path, body=None):
    if method == 'PUT':
        return path == BASE + f'/actions/workflows/{LEGACY}/disable' and body is None
    if method == 'POST':
        return path == BASE + f'/actions/runs/{SAFE_RUN}/rerun' and body is None
    if method != 'GET' or body is not None:
        return False
    if path in ('/user', BASE, BASE + '/git/ref/heads/main'):
        return True
    patterns = [
        BASE + r'/actions/workflows/[1-9][0-9]*',
        BASE + rf'/actions/workflows/{LEGACY}/runs\?per_page=100&page=[1-9][0-9]*',
        BASE + r'/actions/runs/[1-9][0-9]*',
        BASE + r'/actions/runs/[1-9][0-9]*/jobs\?per_page=100&page=[1-9][0-9]*',
    ]
    return any(re.fullmatch(pattern, path) for pattern in patterns)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Blocked('LP_REDIRECT_REFUSED')


class GitHub:
    def __init__(self, token, opener=None):
        require(bool(token), 'LP_OWNER_TOKEN_MISSING')
        self.token = token
        self.opener = opener or urllib.request.build_opener(NoRedirect())

    def request(self, method, path, body=None):
        require(allowed_route(method, path, body), 'LP_ENDPOINT_NOT_ALLOWED')
        request = urllib.request.Request('https://api.github.com' + path, method=method,
            headers={'Accept': 'application/vnd.github+json',
                     'Authorization': 'Bearer ' + self.token,
                     'X-GitHub-Api-Version': '2022-11-28'})
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        except (OSError, TimeoutError, urllib.error.URLError) as error:
            raise Blocked('LP_TRANSPORT_UNAVAILABLE') from error
        with response:
            raw = response.read(1_048_577)
            require(len(raw) <= 1_048_576, 'LP_RESPONSE_TOO_LARGE')
            try:
                data = json.loads(raw) if raw else None
            except (ValueError, UnicodeError) as error:
                raise Blocked('LP_RESPONSE_INVALID') from error
            return response.status, data


def get(api, path):
    status, data = api.request('GET', path)
    require(status == 200 and isinstance(data, dict), 'LP_READBACK_UNAVAILABLE')
    return data


def all_rows(api, path, field):
    rows = []
    expected = None
    for page in range(1, 101):
        data = get(api, path + f'?per_page=100&page={page}')
        part = data.get(field)
        total = data.get('total_count')
        require(isinstance(part, list) and len(part) <= 100
                and type(total) is int and total >= 0, 'LP_INVENTORY_INVALID')
        if expected is None:
            expected = total
        require(total == expected, 'LP_INVENTORY_CHANGED_DURING_PAGINATION')
        rows.extend(part)
        if len(part) < 100:
            require(len(rows) == expected, 'LP_INVENTORY_TRUNCATED')
            return rows
    raise Blocked('LP_INVENTORY_INCOMPLETE')


def workflow(api, identifier, path, expected_state):
    row = get(api, BASE + f'/actions/workflows/{identifier}')
    require(row.get('id') == identifier and row.get('path') == path
            and row.get('state') == expected_state, 'LP_WORKFLOW_STATE_MISMATCH')
    return {'id': identifier, 'path': path, 'state': expected_state}


def no_active_runs(api):
    rows = all_rows(api, BASE + f'/actions/workflows/{LEGACY}/runs', 'workflow_runs')
    require(all(r.get('workflow_id') == LEGACY and type(r.get('id')) is int
                and r.get('status') == 'completed' for r in rows), 'LP_ACTIVE_OR_UNKNOWN_RUN')
    require(len({r['id'] for r in rows}) == len(rows), 'LP_DUPLICATE_RUN_INVENTORY')
    require(any(r['id'] == SAFE_RUN for r in rows), 'LP_SAFE_RUN_NOT_IN_INVENTORY')
    return sorted(({'id': r['id'], 'attempt': r.get('run_attempt'),
                    'status': r['status']} for r in rows), key=lambda r: r['id'])


def verify_safe_run(api, p):
    run = get(api, BASE + f'/actions/runs/{SAFE_RUN}')
    require(run.get('id') == SAFE_RUN and run.get('workflow_id') == LEGACY
            and run.get('head_sha') == SAFE_SOURCE and run.get('head_branch') == 'main'
            and run.get('event') == 'push' and run.get('run_number') == 160
            and run.get('run_attempt') == p['safeRunAttempt']
            and run.get('status') == 'completed' and run.get('conclusion') == 'success'
            and run.get('actor', {}).get('id') == OWNER_ID, 'LP_SAFE_RUN_MISMATCH')
    jobs = all_rows(api, BASE + f'/actions/runs/{SAFE_RUN}/jobs', 'jobs')
    required = {'Main CI - verify release scope': 'success', 'Build and push to GHCR': 'skipped'}
    require(len(jobs) == 2 and {j.get('name'): j.get('conclusion') for j in jobs} == required,
            'LP_SAFE_HOLD_NOT_ESTABLISHED')
    return {'id': SAFE_RUN, 'source': SAFE_SOURCE, 'attempt': run['run_attempt'],
            'status': run['status'], 'ghcrJob': 'skipped'}


def verify_replacement(api, p):
    workflow(api, p['replacementWorkflowId'], REPLACEMENT_PATH, 'active')
    run = get(api, BASE + '/actions/runs/' + str(p['replacementRunId']))
    require(run.get('id') == p['replacementRunId']
            and run.get('workflow_id') == p['replacementWorkflowId']
            and run.get('head_sha') == p['sourceCommit'] and run.get('head_branch') == 'main'
            and run.get('path') == REPLACEMENT_PATH
            and run.get('event') in ('push', 'workflow_dispatch')
            and run.get('status') == 'completed' and run.get('conclusion') == 'success',
            'LP_REPLACEMENT_RUN_NOT_VERIFIED')
    jobs = all_rows(api, BASE + '/actions/runs/' + str(p['replacementRunId']) + '/jobs', 'jobs')
    require(len(jobs) == 1 and jobs[0].get('name') == 'Verify read-only GHCR release HOLD'
            and jobs[0].get('conclusion') == 'success', 'LP_REPLACEMENT_HOLD_NOT_VERIFIED')
    return {'id': p['replacementRunId'], 'workflowId': p['replacementWorkflowId'],
            'source': p['sourceCommit'], 'result': 'success'}


def preflight(api, p, state):
    repo = get(api, BASE)
    user = get(api, '/user')
    main = get(api, BASE + '/git/ref/heads/main')
    require(repo.get('id') == REPO_ID and repo.get('owner', {}).get('id') == OWNER_ID
            and user.get('id') == OWNER_ID and repo.get('permissions', {}).get('admin') is True,
            'LP_OWNER_IDENTITY_OR_PERMISSION_MISMATCH')
    require(main.get('ref') == 'refs/heads/main'
            and main.get('object', {}).get('sha') == p['sourceCommit'], 'LP_STALE_MAIN_SOURCE')
    old = workflow(api, LEGACY, LEGACY_PATH, state)
    replacement = verify_replacement(api, p)
    safe = verify_safe_run(api, p)
    inventory = no_active_runs(api)
    return {'legacy': old, 'replacement': replacement, 'safeRun': safe,
            'actorId': user['id'], 'inventory': inventory,
            'observedUTC': dt.datetime.now(dt.timezone.utc).isoformat()}


def inventory_digest(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def disabled_cause(status, data):
    if status not in (403, 422) or not isinstance(data, dict):
        return False
    message = data.get('message')
    if not isinstance(message, str) or len(message) > 1000:
        return False
    message = message.lower()
    if any(word in message for word in (
        'authenticat', 'credential', 'permission', 'not accessible', 'rate limit',
        'network', 'timeout', 'not found', 'unsupported')):
        return False
    # Narrow affirmative prepared formats only. These local fixtures are not a
    # claim about live API wording. Negation, qualification or unknown messages
    # remain unclassified rather than becoming evidence of a policy denial.
    patterns = (
        r'(?:the )?workflow (?:is|has been) disabled[.!]?',
        r'cannot (?:re-run|rerun) (?:the )?workflow because '
        r'(?:it|the workflow) (?:is|has been) disabled[.!]?',
    )
    return any(re.fullmatch(pattern, message.strip()) for pattern in patterns)


def perform(api, p, mode, report, save=lambda: None):
    state = 'active' if mode == 'disable' else 'disabled_manually'
    if mode == 'observe':
        row = get(api, BASE + f'/actions/workflows/{LEGACY}')
        state = row.get('state')
        require(state in ('active', 'disabled_manually'), 'LP_UNKNOWN_WORKFLOW_STATE')
    before = preflight(api, p, state)
    report['before'] = before
    report['freshInventorySha256'] = inventory_digest(before['inventory'])
    save()
    if mode == 'observe':
        report['result'] = 'READ_ONLY_OBSERVATIONS_NOT_CONTROL_ACCEPTANCE'
        return
    require(report['freshInventorySha256'] == p['inventorySha256'], 'LP_STALE_INVENTORY')
    method, path = ('PUT', BASE + f'/actions/workflows/{LEGACY}/disable') if mode == 'disable' else (
        'POST', BASE + f'/actions/runs/{SAFE_RUN}/rerun')
    report.update(result='REQUEST_PENDING', request={'method': method, 'path': path},
                  mutationAttempt='SUBMITTED_OR_UNCERTAIN',
                  startedUTC=dt.datetime.now(dt.timezone.utc).isoformat())
    save()
    status, data = api.request(method, path)
    report['httpStatus'] = status
    report['mutationAttempt'] = 'HTTP_RESPONSE_RECEIVED'
    report['result'] = 'RESPONSE_READBACK_PENDING'
    save()
    if mode == 'disable':
        require(status == 204, 'LP_DISABLE_NOT_ACCEPTED')
        report['afterWorkflow'] = workflow(api, LEGACY, LEGACY_PATH, 'disabled_manually')
        report['afterInventory'] = no_active_runs(api)
        require(inventory_digest(report['afterInventory']) == p['inventorySha256'],
                'LP_INVENTORY_CHANGED_DURING_DISABLE')
        report['result'] = 'DISABLED_STATE_OBSERVED_NOT_RERUN_DENIAL_PROOF'
    else:
        # Capture an unexpected accepted attempt without canceling or re-enabling.
        if status in (200, 201, 202, 204):
            report['result'] = 'HALT_UNEXPECTED_ACCEPTED_SAFE_RERUN'
            report['acceptedAttemptObservation'] = {
                'state': 'NEW_ATTEMPT_NOT_YET_OBSERVED', 'readback': 'PENDING',
                'safety': 'PENDING'}
            save()
            observed = get(api, BASE + f'/actions/runs/{SAFE_RUN}')
            new_attempt = (observed.get('id') == SAFE_RUN
                           and observed.get('workflow_id') == LEGACY
                           and observed.get('head_sha') == SAFE_SOURCE
                           and observed.get('head_branch') == 'main'
                           and type(observed.get('run_attempt')) is int
                           and observed['run_attempt'] > p['safeRunAttempt'])
            report['acceptedAttemptObservation'] = {
                'state': ('NEW_ATTEMPT_OBSERVED_SAFETY_PENDING' if new_attempt
                          else 'NEW_ATTEMPT_NOT_YET_OBSERVED'),
                'readback': 'OBSERVED', 'safety': 'PENDING',
                **{key: observed.get(key) for key in
                   ('id', 'head_sha', 'run_attempt', 'status', 'conclusion')}}
            save()
            raise Blocked('LP_SAFE_RERUN_UNEXPECTEDLY_ACCEPTED')
        report['explicitDisabledCause'] = disabled_cause(status, data)
        require(report['explicitDisabledCause'], 'LP_RERUN_REFUSAL_UNCLASSIFIED')
        after = preflight(api, p, 'disabled_manually')
        report['after'] = after
        require(after['safeRun'] == before['safeRun']
                and inventory_digest(after['inventory']) == p['inventorySha256'],
                'LP_RERUN_STATE_OR_ATTEMPT_CHANGED')
        report['result'] = 'SAFE_HOLD_RERUN_DENIED_BY_DISABLED_WORKFLOW'
        report['limits'] = [
            'actual unsafe historical publisher runs were not rerun',
            'Owner admin can re-enable; no package-writer cap is established',
            'separate GHCR publisher and Owner release GO remain pending']
    report['endedUTC'] = dt.datetime.now(dt.timezone.utc).isoformat()


def main(argv=None, api_factory=GitHub):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet', required=True, type=Path)
    parser.add_argument('--packet-sha256', required=True)
    parser.add_argument('--mode', choices=('plan', 'observe', 'disable', 'probe'), default='plan')
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args(argv)
    p = validate_packet(args.packet.read_bytes(), args.packet_sha256)
    require(not args.output.exists(), 'LP_OUTPUT_EXISTS')
    report = {'kind': 'ISSUE225_LEGACY_PUBLISHER_CONTROL', 'mode': args.mode,
              'packetSha256': args.packet_sha256, 'sourceCommit': p['sourceCommit'],
              'ownerApproval': 'NOT_ATTESTED_BY_HELPER', 'result': 'PLAN_ONLY',
              'mutationAttempt': 'NOT_SENT'}
    def save():
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    try:
        if args.mode == 'plan':
            require(not args.execute, 'LP_PLAN_EXECUTION_FLAG_REFUSED')
            report['plannedMutations'] = [
                {'method': 'PUT', 'path': BASE + f'/actions/workflows/{LEGACY}/disable'},
                {'method': 'POST', 'path': BASE + f'/actions/runs/{SAFE_RUN}/rerun'}]
        else:
            require(args.mode == 'observe' or args.execute, 'LP_EXPLICIT_EXECUTION_REQUIRED')
            require(os.environ.get('GITHUB_ACTIONS') != 'true', 'LP_OPERATOR_CREDENTIAL_IN_CI_REFUSED')
            local_source(p)
            report['result'] = 'PREFLIGHT_READBACK_PENDING'
            report['mutationIntent'] = 'EXPLICIT_OPERATOR_REQUEST' if args.execute else 'READ_ONLY'
            save()
            api = api_factory(os.environ.get('LP_GITHUB_TOKEN'))
            perform(api, p, args.mode, report, save)
    except BaseException:
        if not report['result'].startswith('HALT_'):
            report['result'] = 'FAILED_OR_PARTIAL_REVIEW_REQUIRED'
        raise
    finally:
        save()
    print('LP_' + report['result'])
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (Blocked, ValueError, TypeError, KeyError, OSError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, Blocked) else 'LP_INVALID_STATE', file=sys.stderr)
        sys.exit(1)
