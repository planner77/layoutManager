#!/usr/bin/env python3
"""Bounded #225 controlled-ref observations. Default plan makes no HTTP calls.

--execute requests fixture operations; it is NOT evidence of Owner approval.
The caller must obtain the separately reviewed Owner authorization beforehand.
This helper never applies policies, creates commits/PRs, or touches release refs.
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
import urllib.parse
import urllib.request

REPO = 'planner77/layoutManager'
REPO_ID = 1359528829
OWNER_ID = 45478892
WORKFLOW = '.github/workflows/control-proof.yml'
CONTEXT = 'Typecheck, lint, test, build, E2E'
SHA = re.compile(r'[0-9a-f]{40}')
HASH = re.compile(r'[0-9a-f]{64}')
BASE = '/repos/' + REPO
ZERO = '0' * 40
RULES = {
    'heads': {'delete':'deletion', 'update':'pull_request',
              'non-fast-forward':'non_fast_forward', 'merge':'required_status_checks'},
    'tags': {'create':'creation', 'update':'update', 'delete':'deletion'}}
POLICY_FILES = {
    'issue225-main-source.ruleset.json', 'issue225-main-source.final.ruleset.json',
    'issue231-tag-hold.ruleset.json', 'issue231-tag-hold.final.ruleset.json'}


class RefProofError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise RefProofError(code)


def exact_keys(value, required, optional=()):
    require(isinstance(value, dict) and set(required) <= value.keys()
            and value.keys() <= set(required) | set(optional), 'CP_SCHEMA_INVALID')


def sha(value):
    return isinstance(value, str) and SHA.fullmatch(value) is not None


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def validate_packet(raw, expected_hash):
    require(isinstance(expected_hash, str) and HASH.fullmatch(expected_hash)
            and hashlib.sha256(raw).hexdigest() == expected_hash, 'CP_PACKET_HASH_MISMATCH')
    packet = json.loads(raw)
    exact_keys(packet, ('schemaVersion', 'repository', 'repositoryId', 'ownerId',
                       'sourceCommit', 'workflowCommit', 'workflowPath', 'nonce',
                       'policyPayloads', 'policySnapshotSha256', 'refs', 'cases'))
    require(packet['schemaVersion'] == 1 and packet['repository'] == REPO
            and packet['repositoryId'] == REPO_ID and packet['ownerId'] == OWNER_ID,
            'CP_REPOSITORY_MISMATCH')
    require(sha(packet['sourceCommit']) and packet['workflowCommit'] == packet['sourceCommit']
            and packet['workflowPath'] == WORKFLOW, 'CP_SOURCE_MISMATCH')
    nonce = packet['nonce']
    require(isinstance(nonce, str) and re.fullmatch('[0-9a-f]{16}', nonce), 'CP_NONCE_INVALID')
    require(isinstance(packet['policySnapshotSha256'], str)
            and HASH.fullmatch(packet['policySnapshotSha256']), 'CP_SNAPSHOT_HASH_INVALID')
    payloads = packet['policyPayloads']
    require(isinstance(payloads, list) and len(payloads) == 4, 'CP_POLICY_SET_INVALID')
    names = set()
    for item in payloads:
        exact_keys(item, ('name', 'sha256'))
        require(item['name'] in POLICY_FILES and item['name'] not in names
                and isinstance(item['sha256'], str) and HASH.fullmatch(item['sha256']),
                'CP_POLICY_HASH_INVALID')
        names.add(item['name'])
    refs = packet['refs']
    require(isinstance(refs, list) and 1 <= len(refs) <= 20, 'CP_REF_SET_INVALID')
    owned = {}
    for item in refs:
        exact_keys(item, ('name', 'initialSha'))
        name = item['name']
        require(isinstance(name, str) and re.fullmatch(
            r'refs/(heads|tags)/issue225-control-' + nonce + r'-[a-z][a-z0-9-]{0,30}', name)
            and name not in owned and (item['initialSha'] is None or sha(item['initialSha'])),
            'CP_REF_NOT_OWNED')
        owned[name] = item['initialSha']
    cases = packet['cases']
    require(isinstance(cases, list) and 1 <= len(cases) <= 32, 'CP_CASE_SET_INVALID')
    ids = set()
    for case in cases:
        exact_keys(case, ('id', 'actor', 'phase', 'operation', 'ref', 'beforeSha', 'afterSha',
                          'expectedRule'), ('pullRequest', 'headRef'))
        require(isinstance(case['id'], str) and re.fullmatch('[a-z][a-z0-9-]{0,47}', case['id'])
                and case['id'] not in ids, 'CP_CASE_ID_INVALID')
        ids.add(case['id'])
        require(case['actor'] in ('owner', 'actions') and case['phase'] in ('capability', 'denial')
                and case['operation'] in ('create','delete','update','non-fast-forward','merge')
                and case['ref'] in owned, 'CP_CASE_SCOPE_INVALID')
        before, after, op = case['beforeSha'], case['afterSha'], case['operation']
        require((before is None or sha(before)) and (after is None or sha(after)), 'CP_CASE_SHA_INVALID')
        require((op == 'create' and before is None and after is not None)
                or (op == 'delete' and before is not None and after is None)
                or (op in ('update', 'non-fast-forward', 'merge') and before is not None
                    and after is not None and before != after), 'CP_CASE_TRANSITION_INVALID')
        if case['phase'] == 'capability':
            require(op in ('create', 'update', 'delete') and case['expectedRule'] is None,
                    'CP_CAPABILITY_CASE_INVALID')
        else:
            ref_family = case['ref'].split('/',2)[1]
            require(op in RULES[ref_family] and
                    case['expectedRule'] == RULES[ref_family][op],
                    'CP_EXPECTED_RULE_INVALID')
        if op == 'merge':
            require(type(case.get('pullRequest')) is int and case['pullRequest'] > 0
                    and case.get('headRef') in owned and case['headRef'] != case['ref']
                    and case['ref'].startswith('refs/heads/')
                    and case['headRef'].startswith('refs/heads/'), 'CP_PR_SCOPE_INVALID')
        else:
            require('pullRequest' not in case and 'headRef' not in case, 'CP_PR_SCOPE_INVALID')
    for actor in ('owner', 'actions'):
        actor_cases = [c for c in cases if c['actor'] == actor]
        if not actor_cases:
            continue
        for family in ('heads', 'tags'):
            group = [c for c in actor_cases if c['ref'].startswith('refs/' + family + '/')]
            if not group:
                continue
            cap = [c for c in group if c['phase'] == 'capability']
            denial = [c for c in group if c['phase'] == 'denial']
            require((not denial and not cap) or
                    (len(cap) == 3 and [c['operation'] for c in cap] ==
                     ['create', 'update', 'delete'] and
                     len({c['ref'] for c in cap}) == 1 and owned[cap[0]['ref']] is None
                     and cap[0]['afterSha'] == cap[1]['beforeSha']
                     and cap[1]['afterSha'] == cap[2]['beforeSha']
                     and all(c['ref'] != cap[0]['ref'] for c in denial)),
                    'CP_CAPABILITY_FAMILY_SEQUENCE_INVALID')
    return packet


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RefProofError('CP_API_REDIRECT_REFUSED')


class GitHub:
    def __init__(self, token, packet, cases=()):
        require(bool(token), 'CP_TOKEN_MISSING')
        self.token = token
        self.packet = packet
        self.cases = tuple(cases)
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, body=None):
        public_users = {'/users/planner77', '/users/github-actions%5Bbot%5D'}
        require(((path == BASE or path.startswith(BASE + '/')) or
                 (method == 'GET' and path in public_users)) and
                not any(x in path for x in ('\\', '#')),
                'CP_API_SCOPE_INVALID')
        if method != 'GET':
            permitted = [case_route(case) for case in self.cases]
            require(any((method, path, body) == item for item in permitted),
                    'CP_MUTATION_NOT_IN_PACKET')
        else:
            require(body is None and read_route(self.packet, path), 'CP_READ_ROUTE_INVALID')
        request = urllib.request.Request('https://api.github.com' + path, method=method,
            data=None if body is None else canonical(body), headers={
                'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + self.token,
                'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'})
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise RefProofError('CP_TRANSPORT_FAILED') from error
        with response:
            raw = response.read(1_048_577)
            require(len(raw) <= 1_048_576, 'CP_API_BODY_TOO_LARGE')
            try:
                data = json.loads(raw) if raw else None
            except (ValueError, UnicodeError) as error:
                raise RefProofError('CP_API_JSON_INVALID') from error
            request_id = response.headers.get('X-GitHub-Request-Id', '')
            require(not request_id or re.fullmatch('[A-Za-z0-9:-]{1,128}', request_id),
                    'CP_API_REQUEST_ID_INVALID')
            return response.status, data, request_id


def get(api, path):
    status, data, _ = api.request('GET', path)
    require(status == 200, 'CP_READBACK_UNAVAILABLE')
    return data


def case_route(case):
    op = case['operation']
    if op == 'merge':
        return ('PUT', BASE + '/pulls/' + str(case['pullRequest']) + '/merge',
                {'sha': case['afterSha'], 'merge_method': 'squash',
                 'commit_title': '#225 | controlled missing-CI fixture', 'commit_message': ''})
    if op == 'create':
        return ('POST', BASE + '/git/refs', {'ref': case['ref'], 'sha': case['afterSha']})
    method = 'DELETE' if op == 'delete' else 'PATCH'
    path = BASE + '/git/refs/' + case['ref'].removeprefix('refs/')
    body = None if method == 'DELETE' else {
        'sha': case['afterSha'], 'force': op == 'non-fast-forward'}
    return method, path, body


def read_route(packet, path):
    refs = {BASE + '/git/ref/' + x['name'].removeprefix('refs/') for x in packet['refs']}
    cases = packet['cases']
    prs = {BASE + '/pulls/' + str(c['pullRequest']) for c in cases
           if c['operation'] == 'merge'}
    compares = {BASE + '/compare/' + c['beforeSha'] + '...' + c['afterSha']
                for c in cases if c['operation'] == 'merge'}
    shas = {c['afterSha'] for c in cases if c['operation'] == 'merge'}
    paged = {BASE + '/commits/' + value + '/' + kind for value in shas
             for kind in ('check-runs', 'statuses')}
    bare = path.split('?', 1)[0]
    if bare in paged:
        return re.fullmatch(r'per_page=100&page=([1-9]|[1-9][0-9]|100)',
                            path.partition('?')[2]) is not None
    if path in ({BASE, BASE + '/rulesets/rule-suites'} | refs | prs | compares):
        return True
    if path.startswith(BASE + '/rulesets/rule-suites?'):
        return re.fullmatch(r'per_page=100&page=([1-9]|[1-9][0-9]|100)',
                            path.partition('?')[2]) is not None
    if path.startswith(BASE + '/rulesets?'):
        return re.fullmatch(r'includes_parents=true&per_page=100&page=([1-9]|[1-9][0-9]|100)',
                            path.partition('?')[2]) is not None
    if path in ('/users/planner77', '/users/github-actions%5Bbot%5D'):
        return True
    if re.fullmatch(re.escape(BASE) + r'/rulesets/[1-9][0-9]*', path):
        return True
    if re.fullmatch(re.escape(BASE) + r'/rulesets/rule-suites/[1-9][0-9]*', bare):
        return path == bare or path == bare + '?include_metadata=true'
    if re.fullmatch(re.escape(BASE) + r'/actions/runs/[1-9][0-9]*/attempts/[1-9][0-9]*', bare):
        return path == bare
    return False


def ref_sha(api, name):
    status, data, _ = api.request('GET', BASE + '/git/ref/' + name.removeprefix('refs/'))
    if status == 404:
        require(isinstance(data, dict) and data.get('message') == 'Not Found', 'CP_REF_ABSENCE_UNPROVEN')
        return None
    require(status == 200 and isinstance(data, dict) and data.get('ref') == name
            and isinstance(data.get('object'), dict) and sha(data['object'].get('sha')),
            'CP_REF_READBACK_UNAVAILABLE')
    return data['object']['sha']


def paginated(api, path, field=None):
    rows = []
    for page in range(1, 101):
        data = get(api, path + ('&' if '?' in path else '?') + f'per_page=100&page={page}')
        items = data if field is None else data.get(field)
        require(isinstance(items, list) and len(items) <= 100, 'CP_PAGINATION_INVALID')
        rows.extend(items)
        if len(items) < 100:
            return rows
    raise RefProofError('CP_PAGINATION_INCOMPLETE')


def check_missing_ci_pr(api, case):
    number = case['pullRequest']
    pr = get(api, BASE + '/pulls/' + str(number))
    require(pr.get('number') == number and pr.get('state') == 'open' and not pr.get('draft')
            and pr.get('mergeable') is True, 'CP_PR_NOT_VALID_MERGE')
    for key, ref, expected in (('base', case['ref'], case['beforeSha']),
                               ('head', case['headRef'], case['afterSha'])):
        node = pr.get(key, {})
        require(node.get('repo', {}).get('id') == REPO_ID
                and node.get('ref') == ref.removeprefix('refs/heads/')
                and node.get('sha') == expected, 'CP_PR_IDENTITY_MISMATCH')
        require(ref_sha(api, ref) == expected, 'CP_PR_REF_CHANGED')
    comparison = get(api, BASE + '/compare/' + case['beforeSha'] + '...' + case['afterSha'])
    files = comparison.get('files')
    require(comparison.get('status') == 'ahead' and comparison.get('total_commits') == 1
            and isinstance(files, list) and len(files) == 1
            and files[0].get('filename') == 'src/tests/fixtures/issue225-control-marker.json',
            'CP_PR_NOT_FIXTURE_ONLY')
    checks = paginated(api, BASE + '/commits/' + case['afterSha'] + '/check-runs', 'check_runs')
    statuses = paginated(api, BASE + '/commits/' + case['afterSha'] + '/statuses')
    require(not any(x.get('name') == CONTEXT for x in checks)
            and not any(x.get('context') == CONTEXT for x in statuses), 'CP_EXPECTED_CHECK_PRESENT')


def attempt(api, case, journal=lambda row: None):
    require(ref_sha(api, case['ref']) == case['beforeSha'], 'CP_BEFORE_SHA_MISMATCH')
    if case['operation'] == 'merge':
        check_missing_ci_pr(api, case)
    method, path, body = case_route(case)
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    row = {'caseId': case['id'], 'caseSha256': hashlib.sha256(canonical(case)).hexdigest(),
           'method': method, 'path': path, 'status': None, 'requestId': None,
           'beforeSha': case['beforeSha'], 'afterSha': None, 'startedUTC': started,
           'endedUTC': None, 'state': 'REQUEST_PENDING', 'refOperationActor': 'NOT_VERIFIED'}
    journal(row)
    status, _data, request_id = api.request(method, path, body)
    row.update(status=status, requestId=request_id, state='RESPONSE_READBACK_PENDING')
    journal(row)
    after = ref_sha(api, case['ref'])
    ended = dt.datetime.now(dt.timezone.utc).isoformat()
    row.update(afterSha=after, endedUTC=ended, state='OBSERVED_NOT_CLASSIFIED')
    journal(row)
    success = status in (200, 201, 204)
    if case['phase'] == 'capability':
        require(success and after == case['afterSha'], 'CP_CAPABILITY_FAILED')
        state = 'CAPABILITY_OBSERVED'
    else:
        require(not success and after == case['beforeSha'], 'CP_UNEXPECTED_REF_MUTATION')
        require(status in (403, 405, 422), 'CP_DENIAL_NOT_POLICY_CANDIDATE')
        state = 'PENDING_RULE_EVALUATION'
    row['state'] = state
    journal(row)
    return row


def family(ref):
    return ref.split('/', 2)[1]


def validate_capability_receipt(packet, packet_hash, actor, report, families):
    require(isinstance(report, dict) and report.get('kind') == 'ISSUE225_CONTROL_OBSERVATIONS'
            and report.get('packetSha256') == packet_hash
            and report.get('sourceCommit') == packet['sourceCommit']
            and report.get('actorMode') == actor and report.get('phase') == 'capability'
            and report.get('result') == 'OBSERVATIONS_ONLY_PENDING_INDEPENDENT_RULE_VERIFICATION',
            'CP_CAPABILITY_RECEIPT_LINEAGE_INVALID')
    context = report.get('context', {})
    credential = ('workflow GITHUB_TOKEN' if actor == 'actions' else 'CP_GITHUB_TOKEN')
    require(context.get('mode') == actor and context.get('credentialPath') == credential
            and context.get('refOperationActor') == 'NOT_VERIFIED',
            'CP_CAPABILITY_CREDENTIAL_PATH_INVALID')
    if actor == 'actions':
        require(context.get('dispatchSenderId') == OWNER_ID and
                type(context.get('runId')) is int and context['runId'] > 0 and
                type(context.get('runAttempt')) is int and context['runAttempt'] > 0,
                'CP_CAPABILITY_RUN_INVALID')
    cases = {c['id']: c for c in packet['cases'] if c['actor'] == actor and
             c['phase'] == 'capability'}
    rows = report.get('cases')
    require(isinstance(rows, list) and len(rows) == len(cases) and
            {r.get('caseId') for r in rows} == set(cases),
            'CP_CAPABILITY_CASE_SET_INVALID')
    for row in rows:
        case = cases[row['caseId']]
        method, path, _ = case_route(case)
        require(row.get('caseSha256') == hashlib.sha256(canonical(case)).hexdigest()
                and row.get('method') == method and row.get('path') == path
                and row.get('status') in (200, 201, 204)
                and row.get('beforeSha') == case['beforeSha']
                and row.get('afterSha') == case['afterSha']
                and row.get('state') == 'CAPABILITY_OBSERVED'
                and row.get('requestId') and row.get('startedUTC') and row.get('endedUTC'),
                'CP_CAPABILITY_CASE_UNPROVEN')
        start,end=instant(row['startedUTC']),instant(row['endedUTC'])
        require(start <= end and end-start < dt.timedelta(minutes=3),
                'CP_CAPABILITY_TIME_INVALID')
    indexed={r['caseId']:r for r in rows}
    for ref_family in ('heads','tags'):
        sequence=[c for c in packet['cases'] if c['actor']==actor and
                  c['phase']=='capability' and family(c['ref'])==ref_family]
        for earlier,later in zip(sequence,sequence[1:]):
            require(instant(indexed[earlier['id']]['endedUTC']) <=
                    instant(indexed[later['id']]['startedUTC']),
                    'CP_CAPABILITY_SEQUENCE_TIME_INVALID')
    require(set(families) <= {family(cases[row['caseId']]['ref']) for row in rows},
            'CP_CAPABILITY_FAMILY_UNVERIFIED')
    return context


def instant(value):
    require(isinstance(value, str), 'CP_TIME_INVALID')
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise RefProofError('CP_TIME_INVALID') from error
    require(parsed.tzinfo is not None, 'CP_TIME_INVALID')
    return parsed.astimezone(dt.timezone.utc)


def verify_actions_attempt(api, packet, context, *, completed=False, intervals=()):
    run_id, number = context.get('runId'), context.get('runAttempt')
    require(type(run_id) is int and run_id > 0 and type(number) is int and number > 0
            and context.get('credentialPath') == 'workflow GITHUB_TOKEN'
            and context.get('dispatchSenderId') == OWNER_ID,
            'CP_ACTIONS_LINEAGE_INVALID')
    run = get(api, BASE + f'/actions/runs/{run_id}/attempts/{number}')
    require(run.get('id') == run_id and run.get('run_attempt') == number
            and run.get('event') == 'workflow_dispatch'
            and run.get('head_branch') == 'main'
            and run.get('head_sha') == packet['sourceCommit']
            and run.get('path') == WORKFLOW
            and run.get('repository', {}).get('id') == REPO_ID
            and run.get('triggering_actor', {}).get('id') == OWNER_ID,
            'CP_ACTIONS_RUN_READBACK_MISMATCH')
    if completed:
        require(run.get('status') == 'completed' and run.get('conclusion') == 'success',
                'CP_ACTIONS_RUN_NOT_SUCCESSFULLY_COMPLETE')
        started,updated=instant(run.get('run_started_at')),instant(run.get('updated_at'))
        require(started <= updated and updated-started < dt.timedelta(hours=1),
                'CP_ACTIONS_RUN_TIME_INVALID')
        for first,last in intervals:
            require(started-dt.timedelta(seconds=30) <= instant(first) <=
                    instant(last) <= updated+dt.timedelta(seconds=30),
                    'CP_ACTIONS_CASE_OUTSIDE_RUN')
    return run


def validated_live_ruleset(api, packet, rule_id, case):
    require(type(rule_id) is int and rule_id > 0, 'CP_RULESET_ID_INVALID')
    name = ('issue225-main-source.ruleset.json' if family(case['ref']) == 'heads'
            else 'issue231-tag-hold.ruleset.json')
    entry = next((x for x in packet['policyPayloads'] if x['name'] == name), None)
    require(entry is not None, 'CP_POLICY_ENTRY_MISSING')
    raw = (Path('src/deploy/release-control') / name).read_bytes()
    require(hashlib.sha256(raw).hexdigest() == entry['sha256'],
            'CP_POLICY_LOCAL_HASH_CHANGED')
    planned = json.loads(raw)
    live = get(api, BASE + '/rulesets/' + str(rule_id))
    require(live.get('id') == rule_id and live.get('name') == planned['name']
            and live.get('target') == planned['target']
            and live.get('enforcement') == 'active'
            and live.get('bypass_actors') == []
            and live.get('conditions') == planned['conditions'],
            'CP_EFFECTIVE_RULESET_MISMATCH')
    normalized = [{'type':r.get('type'), **({'parameters':r.get('parameters')}
                   if 'parameters' in r else {})} for r in live.get('rules', [])]
    require(normalized == planned['rules'] and
            any(r['type'] == case['expectedRule'] for r in normalized),
            'CP_EFFECTIVE_RULE_MISMATCH')
    return live


def verify_denial_case(api, packet, case, row, context):
    method, path, _ = case_route(case)
    require(row.get('caseId') == case['id'] and
            row.get('caseSha256') == hashlib.sha256(canonical(case)).hexdigest()
            and row.get('method') == method and row.get('path') == path
            and row.get('status') in (403, 405, 422)
            and row.get('state') == 'PENDING_RULE_EVALUATION'
            and row.get('beforeSha') == case['beforeSha']
            and row.get('afterSha') == case['beforeSha']
            and row.get('requestId'), 'CP_DENIAL_OBSERVATION_INVALID')
    start, end = instant(row.get('startedUTC')), instant(row.get('endedUTC'))
    require(start <= end and end - start < dt.timedelta(minutes=3),
            'CP_ATTEMPT_TIME_INVALID')
    require(ref_sha(api, case['ref']) == case['beforeSha'],
            'CP_DENIAL_REF_CHANGED')
    actor_path = ('/users/planner77' if case['actor'] == 'owner' else
                  '/users/github-actions%5Bbot%5D')
    actor = get(api, actor_path)
    require(actor.get('id') == (OWNER_ID if case['actor'] == 'owner' else actor.get('id'))
            and type(actor.get('id')) is int and actor['id'] > 0
            and actor.get('login') == ('planner77' if case['actor'] == 'owner' else
                                      'github-actions[bot]'), 'CP_REF_ACTOR_READBACK_INVALID')
    if case['actor'] == 'actions':
        verify_actions_attempt(api, packet, context, completed=True,
                               intervals=[(row['startedUTC'],row['endedUTC'])])
    suites = paginated(api, BASE + '/rulesets/rule-suites')
    expected_after = case['afterSha'] or ZERO
    matches = [s for s in suites if s.get('repository_id') == REPO_ID
               and s.get('ref') == case['ref']
               and s.get('before_sha') == (case['beforeSha'] or ZERO)
               and s.get('after_sha') == expected_after
               and s.get('actor_id') == actor['id']
               and s.get('actor_name') == actor['login']
               and s.get('evaluation_result') == 'fail'
               and s.get('result') in ('fail', 'failed')
               and start - dt.timedelta(seconds=60) <= instant(s.get('pushed_at')) <=
                   end + dt.timedelta(seconds=60)]
    require(len(matches) == 1 and type(matches[0].get('id')) is int,
            'CP_EXACT_RULE_SUITE_UNAVAILABLE')
    suite = get(api, BASE + '/rulesets/rule-suites/' +
                str(matches[0]['id']) + '?include_metadata=true')
    require(all(suite.get(k) == matches[0].get(k) for k in
                ('id','repository_id','ref','before_sha','after_sha','actor_id',
                 'actor_name','pushed_at','evaluation_result','result')),
            'CP_RULE_SUITE_DETAIL_CHANGED')
    failed = [r for r in suite.get('rule_evaluations', [])
              if r.get('rule_type') == case['expectedRule'] and
              r.get('result') == 'fail' and r.get('enforcement') == 'active' and
              r.get('rule_source', {}).get('type') == 'ruleset']
    require(len(failed) == 1, 'CP_EXPECTED_RULE_FAILURE_MISSING')
    source_id = failed[0]['rule_source'].get('id')
    validated_live_ruleset(api, packet, source_id, case)
    if case['operation'] == 'merge':
        require(case['expectedRule'] == 'required_status_checks' and
                CONTEXT in json.dumps(failed[0], sort_keys=True),
                'CP_REQUIRED_CI_SPECIFIC_FAILURE_MISSING')
    require(ref_sha(api, case['ref']) == case['beforeSha'],
            'CP_DENIAL_REF_CHANGED_AFTER_VERIFICATION')
    return {'caseId':case['id'],'verdict':'DENIED_BY_POLICY',
            'ruleSuiteId':suite['id'],'rulesetId':source_id,
            'refOperationActorId':actor['id'],'ruleType':case['expectedRule']}


def require_capability_before_denial(capability_rows, denial_rows):
    require(isinstance(capability_rows, list) and capability_rows and
            isinstance(denial_rows, list) and denial_rows,
            'CP_CAPABILITY_DENIAL_ROWS_MISSING')
    cap_end=max(instant(r['endedUTC']) for r in capability_rows)
    denial_start=min(instant(r['startedUTC']) for r in denial_rows)
    require(cap_end < denial_start, 'CP_CAPABILITY_AFTER_DENIAL')


def verify_denials(api, packet, packet_hash, observations, capability, capability_sha):
    require(observations.get('kind') == 'ISSUE225_CONTROL_OBSERVATIONS' and
            observations.get('packetSha256') == packet_hash and
            observations.get('sourceCommit') == packet['sourceCommit'] and
            observations.get('phase') == 'denial' and
            observations.get('result') ==
            'OBSERVATIONS_ONLY_PENDING_INDEPENDENT_RULE_VERIFICATION',
            'CP_DENIAL_REPORT_LINEAGE_INVALID')
    actor = observations.get('actorMode')
    require(actor in ('owner','actions'), 'CP_DENIAL_ACTOR_INVALID')
    cases = [c for c in packet['cases'] if c['actor'] == actor and c['phase'] == 'denial']
    rows = observations.get('cases')
    require(isinstance(rows, list) and len(rows) == len(cases) and
            {r.get('caseId') for r in rows} == {c['id'] for c in cases},
            'CP_DENIAL_CASE_SET_INVALID')
    cap_context = validate_capability_receipt(
        packet, packet_hash, actor, capability, {family(c['ref']) for c in cases})
    require_capability_before_denial(capability['cases'], rows)
    require(observations.get('capabilityReceiptSha256') == capability_sha and
            isinstance(capability_sha, str) and HASH.fullmatch(capability_sha),
            'CP_CAPABILITY_RECEIPT_MISSING')
    context = observations.get('context', {})
    require(context.get('mode') == actor and
            context.get('credentialPath') == cap_context['credentialPath'],
            'CP_DENIAL_CREDENTIAL_PATH_CHANGED')
    if actor == 'actions':
        verify_actions_attempt(api, packet, cap_context, completed=True,
                               intervals=[(r['startedUTC'],r['endedUTC'])
                                          for r in capability['cases']])
    indexed = {r['caseId']:r for r in rows}
    return [verify_denial_case(api, packet, c, indexed[c['id']], context)
            for c in cases]


def validate_final_delta(initial, final):
    copied = json.loads(json.dumps(initial))
    require(copied.get('target') in ('branch', 'tag'), 'CP_POLICY_TARGET_INVALID')
    prefix = 'refs/' + ('heads' if copied['target'] == 'branch' else 'tags') + '/issue225-control-*'
    include = copied.get('conditions', {}).get('ref_name', {}).get('include')
    require(isinstance(include, list) and include.count(prefix) == 1, 'CP_CONTROL_PREFIX_INVALID')
    include.remove(prefix)
    production = ['refs/heads/main'] if copied['target'] == 'branch' else ['refs/tags/v*']
    require(include == production, 'CP_PRODUCTION_SCOPE_CHANGED')
    require(copied == final and final.get('enforcement') == 'active'
            and final.get('bypass_actors') == [], 'CP_UNSAFE_FINAL_DELTA')


def execution_context(packet, actor):
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    require(head == packet['sourceCommit'], 'CP_LOCAL_SOURCE_MISMATCH')
    require(not subprocess.check_output(['git', 'status', '--porcelain'],
                                        text=True).strip(), 'CP_DIRTY_SOURCE')
    for item in packet['policyPayloads']:
        path = Path('src/deploy/release-control') / item['name']
        require(hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256'], 'CP_LOCAL_POLICY_MISMATCH')
    folder = Path('src/deploy/release-control')
    for name in ('issue225-main-source', 'issue231-tag-hold'):
        validate_final_delta(json.loads((folder / (name + '.ruleset.json')).read_text()),
                             json.loads((folder / (name + '.final.ruleset.json')).read_text()))
    if actor == 'owner':
        require(os.environ.get('GITHUB_ACTIONS') != 'true', 'CP_OWNER_TOKEN_IN_ACTIONS_REFUSED')
        return {'mode': 'owner', 'credentialPath': 'CP_GITHUB_TOKEN',
                'refOperationActor': 'NOT_VERIFIED'}
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    require(os.environ.get('GITHUB_ACTIONS') == 'true'
            and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_REPOSITORY') == REPO
            and os.environ.get('GITHUB_REPOSITORY_ID') == str(REPO_ID)
            and os.environ.get('GITHUB_REPOSITORY_OWNER_ID') == str(OWNER_ID)
            and os.environ.get('GITHUB_REF') == 'refs/heads/main'
            and os.environ.get('GITHUB_SHA') == packet['sourceCommit']
            and os.environ.get('GITHUB_WORKFLOW_SHA') == packet['workflowCommit']
            and os.environ.get('GITHUB_WORKFLOW_REF') == REPO + '/' + WORKFLOW + '@refs/heads/main'
            and event.get('sender', {}).get('id') == OWNER_ID, 'CP_ACTIONS_CONTEXT_MISMATCH')
    require(re.fullmatch('[1-9][0-9]*', os.environ.get('GITHUB_RUN_ID', ''))
            and re.fullmatch('[1-9][0-9]*', os.environ.get('GITHUB_RUN_ATTEMPT', '')),
            'CP_ACTIONS_RUN_INVALID')
    require(not os.environ.get('CP_GITHUB_TOKEN') and bool(os.environ.get('GITHUB_TOKEN')),
            'CP_ACTIONS_TOKEN_PATH_INVALID')
    return {'mode': 'actions', 'runId': int(os.environ['GITHUB_RUN_ID']),
            'runAttempt': int(os.environ['GITHUB_RUN_ATTEMPT']),
            'dispatchSenderId': OWNER_ID, 'credentialPath': 'workflow GITHUB_TOKEN',
            'refOperationActor': 'NOT_VERIFIED'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet', type=Path, required=True)
    parser.add_argument('--packet-sha256', required=True)
    parser.add_argument('--actor', choices=('owner', 'actions'), required=True)
    parser.add_argument('--phase', choices=('capability', 'denial'), required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--capability-receipt', type=Path)
    parser.add_argument('--verify-observations', type=Path)
    parser.add_argument('--execute', action='store_true')
    options = parser.parse_args()
    packet = validate_packet(options.packet.read_bytes(), options.packet_sha256)
    require(not options.output.exists(), 'CP_OUTPUT_EXISTS')
    if options.verify_observations:
        require(not options.execute and options.phase == 'denial' and
                options.capability_receipt and options.capability_receipt.is_file(),
                'CP_VERIFY_ARGUMENT_INVALID')
        observation = json.loads(options.verify_observations.read_text())
        cap_bytes = options.capability_receipt.read_bytes()
        capability = json.loads(cap_bytes)
        require(observation.get('actorMode') == options.actor,
                'CP_VERIFY_ACTOR_MISMATCH')
        try:
            api = GitHub(os.environ.get('CP_READ_TOKEN'), packet)
            results = verify_denials(api, packet, options.packet_sha256, observation,
                                     capability, hashlib.sha256(cap_bytes).hexdigest())
        except (RefProofError, ValueError, TypeError, KeyError, OSError):
            pending = {'kind':'ISSUE225_INDEPENDENT_RULE_VERIFICATION',
                       'packetSha256':options.packet_sha256,
                       'observationSha256':hashlib.sha256(
                           options.verify_observations.read_bytes()).hexdigest(),
                       'verdict':'PENDING_READBACK_OR_IDENTITY'}
            options.output.parent.mkdir(parents=True, exist_ok=True)
            options.output.write_text(json.dumps(pending, sort_keys=True)+'\n')
            raise
        verdict = {'kind':'ISSUE225_INDEPENDENT_RULE_VERIFICATION',
                   'packetSha256':options.packet_sha256,
                   'observationSha256':hashlib.sha256(options.verify_observations.read_bytes()).hexdigest(),
                   'capabilitySha256':hashlib.sha256(cap_bytes).hexdigest(),
                   'verdict':'DENIED_BY_POLICY', 'cases':results}
        options.output.parent.mkdir(parents=True, exist_ok=True)
        options.output.write_text(json.dumps(verdict, indent=2, sort_keys=True)+'\n')
        print('CP_INDEPENDENT_RULE_VERIFICATION_PASS')
        return
    cases = [c for c in packet['cases'] if c['actor'] == options.actor and c['phase'] == options.phase]
    require(bool(cases), 'CP_NO_CASES')
    report = {'kind': 'ISSUE225_CONTROL_OBSERVATIONS', 'packetSha256': options.packet_sha256,
              'sourceCommit': packet['sourceCommit'], 'actorMode': options.actor,
              'phase': options.phase, 'result': 'PLAN_ONLY', 'ownerApproval': 'NOT_ATTESTED',
              'policyEnforcement': 'NOT_VERIFIED', 'cases': []}
    def save():
        options.output.parent.mkdir(parents=True, exist_ok=True)
        options.output.write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    def journal(row):
        old = next((i for i, x in enumerate(report['cases']) if x['caseId'] == row['caseId']), None)
        if old is None:
            report['cases'].append(dict(row))
        else:
            report['cases'][old] = dict(row)
        save()
    try:
        if options.execute:
            report['result'] = 'EXECUTION_IN_PROGRESS_NOT_OWNER_APPROVAL'
            save()
            report['context'] = execution_context(packet, options.actor)
            if options.phase == 'denial':
                require(options.capability_receipt is not None and
                        options.capability_receipt.is_file(),
                        'CP_CAPABILITY_RECEIPT_REQUIRED')
                cap = json.loads(options.capability_receipt.read_text())
                cap_context = validate_capability_receipt(
                    packet, options.packet_sha256, options.actor, cap,
                    {family(case['ref']) for case in cases})
                require(cap_context['credentialPath'] == report['context']['credentialPath'],
                        'CP_CAPABILITY_CREDENTIAL_CHANGED')
                require(max(instant(r['endedUTC']) for r in cap['cases']) <
                        dt.datetime.now(dt.timezone.utc),
                        'CP_CAPABILITY_NOT_PRIOR_TO_DENIAL')
                report['capabilityReceiptSha256'] = hashlib.sha256(
                    options.capability_receipt.read_bytes()).hexdigest()
            token = os.environ.get('GITHUB_TOKEN') if options.actor == 'actions' else os.environ.get('CP_GITHUB_TOKEN')
            api = GitHub(token, packet, cases)
            repo = get(api, BASE)
            require(repo.get('id') == REPO_ID and repo.get('owner', {}).get('id') == OWNER_ID,
                    'CP_LIVE_REPOSITORY_MISMATCH')
            if options.actor == 'actions':
                verify_actions_attempt(api, packet, report['context'])
            if options.phase == 'capability':
                baseline = paginated(api, BASE + '/rulesets?includes_parents=true')
                require(hashlib.sha256(canonical(baseline)).hexdigest() ==
                        packet['policySnapshotSha256'], 'CP_POLICY_BASELINE_CHANGED')
                report['policySnapshotSha256'] = packet['policySnapshotSha256']
            if options.phase == 'denial' and options.actor == 'actions':
                require(os.environ.get('CP_CAPABILITY_RUN_ID') == str(cap_context['runId']),
                        'CP_CAPABILITY_ARTIFACT_RUN_MISMATCH')
                verify_actions_attempt(api, packet, cap_context, completed=True,
                                       intervals=[(r['startedUTC'],r['endedUTC'])
                                                  for r in cap['cases']])
            for case in cases:
                attempt(api, case, journal)
            report['result'] = 'OBSERVATIONS_ONLY_PENDING_INDEPENDENT_RULE_VERIFICATION'
        else:
            report['plannedCases'] = cases
    except BaseException:
        report['result'] = 'FAILED_OR_PARTIAL_REVIEW_REQUIRED'
        raise
    finally:
        save()
    print('CP_' + report['result'])


if __name__ == '__main__':
    try:
        main()
    except (RefProofError, ValueError, TypeError, KeyError, OSError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, RefProofError) else 'CP_INVALID_STATE', file=sys.stderr)
        sys.exit(1)
