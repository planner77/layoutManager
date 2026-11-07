#!/usr/bin/env python3
"""Protected, single-session GHCR blob-init observation for issue 225.

The default entrypoint is plan. No candidate publishing or Location follow is
available here. Exception messages and raw response headers are never emitted.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

import candidate_policy as policy
from candidate_registry import GitHubReadOnly

WORKFLOW = '.github/workflows/registry-upload-diagnostic.yml'
SIGNER = policy.REPO + '/' + WORKFLOW
TITLE_PREFIX = 'UPLOAD DIAGNOSTIC | '
JOB_PREFIX = 'Upload diagnostic | '
ENDPOINT = 'https://ghcr.io/v2/planner77/layoutmanager/blobs/uploads/'
SCOPE = 'repository:planner77/layoutmanager:pull,push'
ENV_ID = 26560473351
ENV_HASH = 'fe77c0935872e85218b9d6af8ae034ed8c63e2c90526f5c7154057ea7dbb90d3'
PACKET_FIELDS = ('kind', 'repository', 'repositoryId', 'ownerId', 'package', 'packageId',
                 'sourceCommit', 'sourceTree', 'workflowCommit', 'workflowPath',
                 'environmentId', 'environmentConfigSha256', 'environmentUiObservationSha256',
                 'requiredCi', 'nonce', 'purpose', 'fixedEndpoint', 'postBudget')
PURPOSE = 'observe-one-zero-byte-blob-init-location-no-follow-no-publish'
Pending = policy.Pending
need = policy.need


def packet(raw, digest):
    need(len(raw) <= 16384 and policy.hash_value(digest) and policy.sha(raw) == digest,
         'UL_PACKET_HASH_INVALID')
    p = policy.decode(raw)
    policy.exact(p, PACKET_FIELDS)
    need(p['kind'] == 'GHCR_UPLOAD_LOCATION_DIAGNOSTIC_V1'
         and p['repository'] == policy.REPO and p['repositoryId'] == policy.REPO_ID
         and p['ownerId'] == policy.OWNER_ID and p['package'] == policy.PACKAGE
         and p['packageId'] == policy.PACKAGE_ID, 'UL_FIXED_IDENTITY_INVALID')
    need(policy.hash_value(p['sourceCommit'], 40) and policy.hash_value(p['sourceTree'], 40)
         and p['workflowCommit'] == p['sourceCommit'] and p['workflowPath'] == WORKFLOW,
         'UL_SOURCE_INVALID')
    need(p['environmentId'] == ENV_ID and p['environmentConfigSha256'] == ENV_HASH
         and (p['environmentUiObservationSha256'] is None
              or policy.hash_value(p['environmentUiObservationSha256'])), 'UL_ENV_BINDING_INVALID')
    need(policy.hash_value(p['nonce'], 16) and p['purpose'] == PURPOSE
         and p['fixedEndpoint'] == ENDPOINT and type(p['postBudget']) is int
         and p['postBudget'] == 1, 'UL_PURPOSE_INVALID')
    policy.exact(p['requiredCi'], ('runId', 'headSha', 'archiveSha', 'treeSha', 'workflowId', 'runAttempt'))
    ci = p['requiredCi']
    need(all(type(ci[key]) is int and ci[key] > 0 for key in ('runId', 'workflowId', 'runAttempt'))
         and policy.hash_value(ci['headSha'], 40) and policy.hash_value(ci['archiveSha'], 40)
         and ci['treeSha'] == p['sourceTree'], 'UL_CI_PACKET_INVALID')
    return p


def git(*args):
    try:
        result = subprocess.run(['git', *args], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Pending('UL_GIT_UNAVAILABLE') from None
    need(result.returncode == 0 and len(result.stdout) < 4096, 'UL_GIT_INVALID')
    return result.stdout.decode().strip()


def binding(p, digest, env):
    need(env.get('GITHUB_ACTIONS') == 'true' and env.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
         and env.get('GITHUB_REPOSITORY') == policy.REPO
         and env.get('GITHUB_REPOSITORY_ID') == str(policy.REPO_ID)
         and env.get('GITHUB_REPOSITORY_OWNER_ID') == str(policy.OWNER_ID)
         and env.get('GITHUB_ACTOR_ID') == str(policy.OWNER_ID)
         and env.get('GITHUB_TRIGGERING_ACTOR') == env.get('GITHUB_ACTOR')
         and env.get('GITHUB_REF') == 'refs/heads/main'
         and env.get('GITHUB_WORKFLOW_REF') == SIGNER + '@refs/heads/main'
         and env.get('GITHUB_WORKFLOW_SHA') == env.get('GITHUB_SHA') == p['sourceCommit']
         and env.get('RUNNER_ENVIRONMENT') == 'github-hosted'
         and env.get('GITHUB_RUN_ATTEMPT') == '1'
         and re.fullmatch('[1-9][0-9]{0,19}', env.get('GITHUB_RUN_ID', ''))
         and env.get('UL_PACKET_SHA256') == digest, 'UL_TRUSTED_DISPATCH_INVALID')
    need(git('rev-parse', 'HEAD') == p['sourceCommit']
         and git('rev-parse', 'HEAD^{tree}') == p['sourceTree']
         and git('status', '--porcelain', '--untracked-files=no') == '', 'UL_EXACT_TREE_INVALID')
    event_path = Path(env.get('GITHUB_EVENT_PATH', ''))
    need(event_path.is_file() and not event_path.is_symlink() and event_path.stat().st_size <= 32768,
         'UL_EVENT_INVALID')
    event = policy.decode(event_path.read_bytes())
    inputs = event.get('inputs', {})
    need(event.get('sender', {}).get('id') == policy.OWNER_ID and type(inputs) is dict
         and inputs.get('mode') == 'diagnose' and inputs.get('packet_sha256') == digest
         and policy.sha(inputs.get('packet_json', '').encode()) == digest
         and (not inputs.get('environment_ui_json') if p['environmentUiObservationSha256'] is None
              else policy.sha(inputs.get('environment_ui_json', '').encode()) == p['environmentUiObservationSha256']),
         'UL_OWNER_INPUT_INVALID')
    return {'sourceCommit': p['sourceCommit'], 'sourceTree': p['sourceTree'],
            'runId': env['GITHUB_RUN_ID'], 'packetSha256': digest}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class BoundedHTTP:
    """No proxies, redirects, retries, body streaming, or caller-selected write URL."""
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.calls = []

    def request(self, method, url, headers=None, data=None, destination=None, limit=2 * 1024 * 1024):
        need(destination is None and method in ('GET', 'POST'), 'UL_HTTP_ROUTE_INVALID')
        if method == 'POST':
            need(url == ENDPOINT and data == b'' and not any(m == 'POST' for m, _ in self.calls),
                 'UL_POST_REFUSED')
        else:
            need(url.startswith('https://api.github.com/repos/planner77/layoutManager/')
                 or url == 'https://api.github.com/users/planner77/packages/container/layoutmanager'
                 or url == 'https://ghcr.io/v2/'
                 or url == 'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aplanner77%2Flayoutmanager%3Apull%2Cpush',
                 'UL_GET_ROUTE_INVALID')
        self.calls.append((method, url))  # memory only; never print or persist this list
        request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
        if method == 'POST':
            request.add_header('Content-Length', '0')
        try:
            response = self.opener.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        except (OSError, TimeoutError, urllib.error.URLError, ValueError):
            raise Pending('UL_HTTP_UNAVAILABLE_OR_UNCERTAIN') from None
        try:
            with response:
                status = response.status
                selected = {key: response.headers.get(key, '') for key in
                            ('WWW-Authenticate', 'Location', 'X-GitHub-Request-Id', 'Docker-Distribution-Api-Version')}
                raw = response.read(min(limit, 2 * 1024 * 1024) + 1)
                need(len(raw) <= limit, 'UL_RESPONSE_TOO_LARGE')
                return status, {key.lower(): value for key, value in selected.items()}, raw, len(raw), policy.sha(raw)
        except (OSError, TimeoutError, urllib.error.URLError, ValueError):
            raise Pending('UL_HTTP_UNAVAILABLE_OR_UNCERTAIN') from None


def api(token, http=None):
    return GitHubReadOnly(token, http or BoundedHTTP())


def environment(api_client, p, ui_raw):
    if p['environmentUiObservationSha256'] is not None:
        policy.ui_observation(ui_raw, p)
    summary, bypass = policy.environment_gate(api_client, p, ui_raw)
    need(summary['id'] == ENV_ID and policy.sha(policy.canonical(summary)) == ENV_HASH
         and bypass['canAdminsBypass'] is False, 'UL_ENVIRONMENT_INVALID')
    return summary


def approval(api_client, p, expected, ui_raw):
    run_id = expected['runId']
    base = policy.BASE
    run = api_client.get(base + '/actions/runs/' + run_id + '/attempts/1')
    need(run.get('id') == int(run_id) and run.get('repository', {}).get('id') == policy.REPO_ID
         and run.get('head_sha') == p['sourceCommit'] and run.get('head_branch') == 'main'
         and run.get('path') == WORKFLOW and run.get('event') == 'workflow_dispatch'
         and run.get('run_attempt') == 1 and run.get('status') == 'in_progress'
         and run.get('actor', {}).get('id') == policy.OWNER_ID
         and run.get('triggering_actor', {}).get('id') == policy.OWNER_ID
         and run.get('display_title') == TITLE_PREFIX + expected['packetSha256'], 'UL_RUN_BINDING_INVALID')
    workflow_id = run.get('workflow_id')
    need(type(workflow_id) is int and workflow_id > 0, 'UL_WORKFLOW_ID_INVALID')
    runs = policy.rows(api_client, base + '/actions/workflows/' + str(workflow_id) +
                       '/runs?event=workflow_dispatch', 'workflow_runs')
    matching = [r for r in runs if r.get('display_title') == TITLE_PREFIX + expected['packetSha256']]
    need(len(matching) == 1 and matching[0].get('id') == int(run_id), 'UL_PACKET_REUSED')
    main = api_client.get(base + '/git/ref/heads/main')
    commit = api_client.get(base + '/git/commits/' + p['sourceCommit'])
    need(main.get('ref') == 'refs/heads/main' and main.get('object', {}).get('sha') == p['sourceCommit']
         and commit.get('sha') == p['sourceCommit'] and commit.get('tree', {}).get('sha') == p['sourceTree'],
         'UL_MAIN_SOURCE_INVALID')
    jobs = policy.rows(api_client, base + '/actions/runs/' + run_id + '/attempts/1/jobs', 'jobs')
    selected = [j for j in jobs if j.get('name') == JOB_PREFIX + expected['packetSha256']]
    need(len(selected) == 1 and type(selected[0].get('id')) is int
         and selected[0].get('run_id') == int(run_id) and selected[0].get('head_sha') == p['sourceCommit']
         and selected[0].get('status') == 'in_progress', 'UL_JOB_BINDING_INVALID')
    environment(api_client, p, ui_raw)
    reviews = api_client.get(base + '/actions/runs/' + run_id + '/approvals')
    need(type(reviews) is list and len(reviews) == 1 and reviews[0].get('state') == 'approved'
         and reviews[0].get('user', {}).get('id') == policy.OWNER_ID
         and [(v.get('id'), v.get('name')) for v in reviews[0].get('environments', [])] ==
         [(ENV_ID, policy.ENVIRONMENT)], 'UL_APPROVAL_INVALID')
    ci = p['requiredCi']
    prior = api_client.get(base + '/actions/runs/' + str(ci['runId']))
    need(prior.get('id') == ci['runId'] and prior.get('workflow_id') == ci['workflowId']
         and prior.get('repository', {}).get('id') == policy.REPO_ID
         and prior.get('path') == '.github/workflows/pr-ci.yml'
         and prior.get('head_sha') == ci['headSha'] and prior.get('status') == 'completed'
         and prior.get('conclusion') == 'success' and prior.get('run_attempt') == ci['runAttempt'],
         'UL_CI_RUN_INVALID')
    ci_commit = api_client.get(base + '/git/commits/' + ci['headSha'])
    archive = api_client.get(base + '/git/commits/' + ci['archiveSha'])
    need(ci_commit.get('sha') == ci['headSha'] and ci_commit.get('tree', {}).get('sha') == p['sourceTree']
         and archive.get('sha') == ci['archiveSha'] and archive.get('tree', {}).get('sha') == p['sourceTree']
         and (ci['archiveSha'] == ci['headSha'] or ci['headSha'] in
              [v.get('sha') for v in archive.get('parents', [])]), 'UL_CI_TREE_INVALID')
    ci_jobs = policy.rows(api_client, base + '/actions/runs/' + str(ci['runId']) +
                          '/attempts/' + str(ci['runAttempt']) + '/jobs', 'jobs')
    for name in policy.REQUIRED_JOBS:
        matching = [j for j in ci_jobs if j.get('name') == name]
        need(len(matching) == 1 and matching[0].get('status') == 'completed'
             and matching[0].get('conclusion') == 'success'
             and matching[0].get('run_id') == ci['runId']
             and matching[0].get('head_sha') in (ci['headSha'], ci['archiveSha']),
             'UL_CI_JOBS_INVALID')
    package = api_client.get('/users/planner77/packages/container/layoutmanager')
    need(package.get('id') == policy.PACKAGE_ID and package.get('name') == 'layoutmanager'
         and package.get('package_type') == 'container' and package.get('visibility') == 'private'
         and package.get('owner', {}).get('id') == policy.OWNER_ID
         and package.get('repository', {}).get('id') == policy.REPO_ID, 'UL_PACKAGE_INVALID')
    return {'runId': int(run_id), 'jobId': selected[0]['id'], 'packetSha256': expected['packetSha256'],
            'sourceCommit': p['sourceCommit'], 'sourceTree': p['sourceTree']}


def classes(value):
    result = []
    if any(c.isascii() and c.isalpha() for c in value): result.append('alpha')
    if any(c.isascii() and c.isdigit() for c in value): result.append('digit')
    for c, label in (('-', 'hyphen'), ('_', 'underscore'), ('%', 'percent'), ('/', 'slash'),
                     ('.', 'dot'), ('~', 'tilde'), ('=', 'equals'), ('+', 'plus'), (':', 'colon')):
        if c in value: result.append(label)
    if any(not c.isascii() for c in value): result.append('nonASCII')
    if any(c.isascii() and not (c.isalnum() or c in '-_%/.~=+:') for c in value):
        result.append('other')
    return result


def candidate_components(location):
    """Report existing candidate predicate components; never accept a route here."""
    try:
        absolute = urllib.parse.urljoin('https://ghcr.io', location)
        parsed = urllib.parse.urlsplit(absolute)
    except (ValueError, UnicodeError):
        return {'httpsScheme': False, 'exactNetloc': False, 'noFragment': False,
                'pathPattern': False, 'strictQueryParse': False, 'queryKeysAllowed': False,
                'allComponents': False}
    try:
        keys = urllib.parse.parse_qs(parsed.query, strict_parsing=True)
        strict = True
    except (ValueError, UnicodeError):
        keys = {}
        strict = False
    parts = {'httpsScheme': parsed.scheme == 'https', 'exactNetloc': parsed.netloc == 'ghcr.io',
             'noFragment': not parsed.fragment,
             'pathPattern': re.fullmatch(r'/v2/planner77/layoutmanager/blobs/uploads/[A-Za-z0-9_-]{1,200}',
                                         parsed.path) is not None,
             'strictQueryParse': strict, 'queryKeysAllowed': strict and set(keys) <= {'_state'}}
    return {**parts, 'allComponents': all(parts.values())}


def shape(location):
    if type(location) is not str or not 0 < len(location) <= 16384:
        return {'parseCode': 'SIZE_INVALID', 'length': len(location) if type(location) is str else 0}
    try:
        digest = policy.sha(location.encode())
    except UnicodeError:
        return {'parseCode': 'ENCODING_INVALID', 'length': len(location)}
    if any(ord(c) < 33 or ord(c) == 127 for c in location):
        return {'parseCode': 'CONTROL_CHARACTER', 'length': len(location), 'sha256': digest,
                'currentCandidatePredicate': candidate_components(location)}
    try:
        parsed = urllib.parse.urlsplit(location)
        host = parsed.hostname
        port = parsed.port
        query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=False,
                                       max_num_fields=64)
    except (ValueError, UnicodeError):
        return {'parseCode': 'PARSE_INVALID', 'length': len(location), 'sha256': digest,
                'currentCandidatePredicate': candidate_components(location)}
    prefix = '/v2/planner77/layoutmanager/blobs/uploads/'
    tail = parsed.path[len(prefix):] if parsed.path.startswith(prefix) else ''
    keys = []
    for key, _ in query:
        if key in ('_state', 'digest', 'mount', 'from', 'uuid', 'ns'):
            keys.append({'name': key})
        else:
            keys.append({'length': len(key), 'sha256': policy.sha(key.encode())})
    netloc_class = ('exact-ghcr.io' if parsed.netloc == 'ghcr.io' else
                    'exact-ghcr.io:443' if parsed.netloc == 'ghcr.io:443' else 'other-hash')
    result = {'parseCode': 'PARSED', 'sha256': digest, 'length': len(location),
            'scheme': parsed.scheme if parsed.scheme in ('http', 'https') else 'other',
            'hostClass': 'fixed-ghcr.io' if host == 'ghcr.io' else ('other' if host else 'missing'),
            'portPresent': port is not None, 'portClass': 'none' if port is None else ('443' if port == 443 else 'other'),
            'rawNetlocClass': netloc_class,
            'userInfoPresent': parsed.username is not None or parsed.password is not None,
            'fragmentPresent': bool(parsed.fragment), 'fixedPathPrefix': parsed.path.startswith(prefix),
            'remainderLength': len(tail), 'remainderSegments': len(tail.split('/')) if tail else 0,
            'remainderClasses': classes(tail), 'queryCount': len(query), 'queryKeys': keys,
            'duplicateQueryKeys': len(query) != len({key for key, _ in query}),
            'currentCandidatePredicate': candidate_components(location)}
    if netloc_class == 'other-hash':
        result['rawNetlocSha256'] = policy.sha(parsed.netloc.encode())
        result['rawNetlocLength'] = len(parsed.netloc)
    return result


def safe_request_id(value):
    if not value: return None
    return {'length': len(value), 'sha256': policy.sha(value.encode())}


def journal(path, expected):
    path.parent.mkdir(mode=0o700, exist_ok=True)
    need(not path.parent.is_symlink(), 'UL_PRIVATE_PATH_INVALID')
    try:
        with os.fdopen(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb') as f:
            f.write(policy.canonical({'event': 'REMOTE_INTENT', 'method': 'POST',
                                      'endpoint': ENDPOINT, **expected}) + b'\n')
            f.flush(); os.fsync(f.fileno())
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(fd)
        finally: os.close(fd)
    except FileExistsError:
        raise Pending('UL_INTENT_ALREADY_EXISTS') from None


def publish_safe(path, value):
    path.parent.mkdir(mode=0o700, exist_ok=True)
    need(not path.parent.is_symlink(), 'UL_PUBLIC_PATH_INVALID')
    raw = policy.canonical(value)
    need(len(raw) <= 8192, 'UL_PUBLIC_SIZE_INVALID')
    try:
        with os.fdopen(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb') as f:
            f.write(raw + b'\n'); f.flush(); os.fsync(f.fileno())
    except FileExistsError:
        raise Pending('UL_RESULT_ALREADY_EXISTS') from None


def observe(token, http, private, public, expected):
    # Authenticating is read-only. The sole remote mutation is below this fsynced intent.
    status, headers, _, _, _ = http.request('GET', 'https://ghcr.io/v2/', limit=4096)
    need(status == 401 and headers['www-authenticate'] in (
        'Bearer realm="https://ghcr.io/token",service="ghcr.io"',
        'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:user/image:pull"',
        'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="' + SCOPE + '"'),
        'UL_GHCR_CHALLENGE_INVALID')
    actor = os.environ.get('GITHUB_ACTOR', '')
    need(re.fullmatch('[A-Za-z0-9-]+', actor) and token and '\n' not in token and '\r' not in token,
         'UL_CREDENTIAL_INVALID')
    basic = base64.b64encode((actor + ':' + token).encode()).decode()
    token_url = 'https://ghcr.io/token?' + urllib.parse.urlencode({'service': 'ghcr.io', 'scope': SCOPE})
    status, _, body, _, _ = http.request('GET', token_url, {'Authorization': 'Basic ' + basic}, limit=16384)
    decoded = policy.decode(body)
    need(status == 200 and type(decoded) is dict and type(decoded.get('token')) is str
         and decoded['token'] and not any(c in decoded['token'] for c in '\r\n'), 'UL_TOKEN_INVALID')
    bearer = decoded['token']
    journal(private / 'intent.jsonl', expected)
    try:
        status, headers, _, _, _ = http.request('POST', ENDPOINT,
            {'Authorization': 'Bearer ' + bearer, 'Content-Length': '0',
             'Accept': 'application/octet-stream, application/json'}, data=b'', limit=4096)
    except Exception:
        result = {'kind': 'GHCR_UPLOAD_LOCATION_DIAGNOSTIC_RESULT_V1', **expected,
                  'outcome': 'UNCERTAIN_NO_RETRY', 'safeCode': 'UL_POST_UNCERTAIN'}
    else:
        result = {'kind': 'GHCR_UPLOAD_LOCATION_DIAGNOSTIC_RESULT_V1', **expected,
                  'outcome': 'RESPONSE_OBSERVED', 'httpStatus': status,
                  'requestId': safe_request_id(headers.get('x-github-request-id', '')),
                  'location': shape(headers.get('location', '')) if headers.get('location') else
                              {'parseCode': 'ABSENT', 'length': 0}}
    publish_safe(public / 'result.json', result)
    return result


def paths(env):
    temporary = env.get('RUNNER_TEMP', '')
    need(temporary and Path(temporary).is_absolute() and not any(c in temporary for c in '\r\n')
         and not Path(temporary).is_symlink(), 'UL_RUNNER_PATH_INVALID')
    root = Path(temporary)
    return root / 'issue225-upload-diagnostic-private', root / 'issue225-upload-diagnostic-public'


def execute(mode, env=None, http=None, api_client=None):
    env = env or os.environ
    raw = env.get('UL_PACKET_JSON', '').encode()
    digest = env.get('UL_PACKET_SHA256', '')
    p = packet(raw, digest)
    if mode == 'plan': return {'kind': 'GHCR_UPLOAD_LOCATION_DIAGNOSTIC_PLAN_V1', 'packetSha256': digest}
    need(mode in ('preread', 'gate', 'observe'), 'UL_MODE_INVALID')
    expected = binding(p, digest, env)
    ui_raw = env.get('UL_UI_JSON', '').encode()
    token = env.get('UL_JOB_TOKEN', '')
    need(token and not any(c in token for c in '\r\n'), 'UL_JOB_TOKEN_MISSING')
    http = http or BoundedHTTP()
    api_client = api_client or api(token, http)
    if mode == 'preread':
        environment(api_client, p, ui_raw)
        return {'kind': 'GHCR_UPLOAD_LOCATION_DIAGNOSTIC_PREREAD_V1', 'packetSha256': digest}
    approved = approval(api_client, p, expected, ui_raw)
    if mode == 'gate': return {'kind': 'GHCR_UPLOAD_LOCATION_DIAGNOSTIC_GATE_V1', **approved}
    private, public = paths(env)
    return observe(token, http, private, public, approved)


def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else 'plan'
    try:
        value = execute(mode)
        print(value['kind'] + ' PASS')
        if value.get('outcome') == 'UNCERTAIN_NO_RETRY': return 2
        return 0
    except Pending as error:
        print(str(error) if re.fullmatch('UL_[A-Z0-9_]+', str(error)) else 'UL_PENDING', file=sys.stderr)
        return 2
    except Exception:
        print('UL_INTERNAL_PENDING', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
