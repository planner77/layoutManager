"""Pure projection of CLI-verified material; not a signature verifier or authority.

Only the two fixed project policies are exposed. Entrypoints must obtain the
positive outputs from the pinned CLI, not receipts, predicates or caller booleans.
All fixtures exercising this module are synthetic, never cryptographic evidence.
"""
import hashlib
import json
import re

REPO = 'planner77/layoutManager'
ROLES = ('app', 'migrator', 'cpu-worker', 'receipt')
WRAPPER = 'Error: verifying with issuer "sigstore.dev"'
REPLACEMENTS = {
    'wrongSource': ('--source-digest', '0' * 40),
    'wrongSignerCommit': ('--signer-digest', '0' * 40),
    'wrongSignerWorkflow': ('--signer-workflow', REPO + '/.github/workflows/wrong.yml'),
    'wrongRef': ('--source-ref', 'refs/heads/wrong'),
}

class Rejected(Exception):
    pass


def need(ok, code):
    if not ok:
        raise Rejected('VN_' + code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def _certificate(output, expected, mapping, prefix, workflow):
    need(type(mapping) is dict and set(mapping) == set(ROLES) and
         all(re.fullmatch('[0-9a-f]{64}', v or '') for v in mapping.values()) and
         len(set(mapping.values())) == 4, 'SUBJECT_MAP_INVALID')
    need(all(re.fullmatch('[0-9a-f]{40}', expected.get(k, ''))
             for k in ('sourceCommit', 'workflowCommit')) and
         re.fullmatch('[1-9][0-9]*', expected.get('runId', '')) and
         re.fullmatch('[1-9][0-9]*', expected.get('runAttempt', '')) and
         (prefix == 'proof' or expected['runAttempt'] == '1'), 'EXPECTED_CONTEXT_INVALID')
    try:
        values = json.loads(output)
    except (TypeError, ValueError, UnicodeError):
        raise Rejected('VN_POSITIVE_OUTPUT_INVALID') from None
    need(type(values) is list and bool(values), 'POSITIVE_WITNESS_MISSING')
    names = {r: prefix + '-' + r + '-manifest.json' for r in ROLES[:-1]}
    names['receipt'] = prefix + '-receipt.json'
    wanted = {names[r]: mapping[r] for r in ROLES}
    signer = 'https://github.com/' + REPO + '/' + workflow + '@refs/heads/main'
    fields = {
        'sourceRepositoryIdentifier': '1359528829',
        'sourceRepositoryOwnerIdentifier': '45478892',
        'sourceRepositoryURI': 'https://github.com/' + REPO,
        'sourceRepositoryDigest': expected['sourceCommit'],
        'sourceRepositoryRef': 'refs/heads/main',
        'buildSignerURI': signer, 'buildSignerDigest': expected['workflowCommit'],
        'runnerEnvironment': 'github-hosted',
        'issuer': 'https://token.actions.githubusercontent.com',
        'runInvocationURI': 'https://github.com/' + REPO + '/actions/runs/' +
                            expected['runId'] + '/attempts/' + expected['runAttempt'],
    }
    for item in values:
        need(type(item) is dict, 'POSITIVE_OUTPUT_INVALID')
        value = item.get('verificationResult') or {}
        cert = (value.get('signature') or {}).get('certificate') or {}
        statement = value.get('statement') or {}
        subjects = statement.get('subject') or []
        actual = {}
        for subject in subjects:
            need(type(subject) is dict and type(subject.get('name')) is str and
                 subject['name'] not in actual, 'SUBJECT_INVALID')
            actual[subject['name']] = (subject.get('digest') or {}).get('sha256')
        if actual != wanted:
            continue
        need(all(cert.get(k) == v for k, v in fields.items()) and
             statement.get('predicateType') == 'https://slsa.dev/provenance/v1',
             'CERTIFICATE_POLICY_INVALID')
        return cert
    raise Rejected('VN_SUBJECT_POLICY_INVALID')


def _project(prefix, workflow, label, expected, mapping, original, probe, gh, bundle,
             before, after, negative_argv, result, specific):
    need(label in (*REPLACEMENTS, 'tamperedManifest', 'tamperedReceipt'), 'LABEL_INVALID')
    role = 'receipt' if label == 'tamperedReceipt' else 'app'
    name = prefix + '-receipt.json' if role == 'receipt' else prefix + '-app-manifest.json'
    need(original.rsplit('/', 1)[-1] == name, 'ORIGINAL_ROLE_INVALID')
    flags = ['--repo', REPO, '--signer-workflow', REPO + '/' + workflow,
             '--signer-digest', expected['workflowCommit'], '--source-digest', expected['sourceCommit'],
             '--source-ref', 'refs/heads/main', '--deny-self-hosted-runners', '--format', 'json']
    positive = [gh, 'attestation', 'verify', original, *flags, '--bundle', bundle]
    changed = flags.copy()
    if label in REPLACEMENTS:
        flag, wrong = REPLACEMENTS[label]
        need(probe == original, 'FLAG_PROBE_ARTIFACT_CHANGED')
        changed[changed.index(flag) + 1] = wrong
    else:
        need(probe != original, 'TAMPER_PATH_UNCHANGED')
    need(negative_argv == [gh, 'attestation', 'verify', probe, *changed, '--bundle', bundle],
         'NEGATIVE_ARGV_INVALID')
    certs = []
    for witness in (before, after):
        need(type(witness) is dict and witness.get('argv') == positive and
             witness.get('exit') == 0, 'POSITIVE_WITNESS_INVALID')
        certs.append(_certificate(witness.get('stdout'), expected, mapping, prefix, workflow))
        hashes = witness.get('hashes')
        need(type(hashes) is dict and set(hashes) == {'binary', 'bundle', 'original', 'probe'} and
             all(type(v) is str and re.fullmatch('[0-9a-f]{64}', v) for v in hashes.values()) and
             hashes['original'] == mapping[role], 'MATERIAL_WITNESS_INVALID')
    need(before['hashes'] == after['hashes'] and certs[0] == certs[1], 'MATERIAL_CHANGED')
    hashes = before['hashes']
    if label.startswith('tampered'):
        need(hashes['probe'] not in mapping.values(), 'TAMPER_NOT_PROVEN')
        mismatch = {'kind': 'SIGNED_SUBJECT_DIGEST_MISMATCH', 'role': role,
                    'signedSha256': mapping[role], 'alteredSha256': hashes['probe']}
    else:
        need(hashes['probe'] == mapping[role], 'ORIGINAL_CHANGED')
        field = {'wrongSource': 'sourceRepositoryDigest', 'wrongSignerCommit': 'buildSignerDigest',
                 'wrongRef': 'sourceRepositoryRef', 'wrongSignerWorkflow': 'buildSignerURI'}[label]
        wrong = REPLACEMENTS[label][1]
        if label == 'wrongSignerWorkflow':
            wrong = 'https://github.com/' + wrong + '@refs/heads/main'
        need(certs[0][field] != wrong, 'POLICY_MISMATCH_MISSING')
        mismatch = {'kind': 'VERIFIED_CERTIFICATE_POLICY_MISMATCH', 'field': field,
                    'verified': certs[0][field], 'requested': wrong}
    need(result.returncode == 1 and result.stdout == '' and type(result.stderr) is str and
         len(result.stderr) < 16384 and '\x00' not in result.stderr, 'NEGATIVE_RESULT_INVALID')
    opaque = result.stderr in (WRAPPER, WRAPPER + '\n', '\n' + WRAPPER + '\n')
    if opaque:
        need(label in ('wrongSignerWorkflow', 'tamperedManifest', 'tamperedReceipt'),
             'OPAQUE_LABEL_INVALID')
        boundary = 'OPAQUE_ISSUER_WRAPPER_REJECTION'
        cause = 'UNOBSERVABLE'
    else:
        # Existing strict classifiers keep source-shaped causal diagnostics and
        # reject auth/network/TUF/usage/parser/unknown failures. Never fallback.
        cause = specific(label, result, expected)
        boundary = 'SPECIFIC_CLI_POLICY_REJECTION'
    return {'case': label, 'cliRejectionBoundary': boundary, 'cliInternalCause': cause,
            'ownPolicyMismatch': mismatch, 'bundleSha256': hashes['bundle'],
            'binarySha256': hashes['binary'], 'originalSha256': hashes['original'],
            'sameBundlePositiveBeforeAfter': True}


def rp_negative(*args, **kwargs):
    return _project('proof', '.github/workflows/release-proof.yml', *args, **kwargs)


def candidate_negative(*args, **kwargs):
    return _project('candidate', '.github/workflows/release-finalizer-rf03-candidate.yml', *args, **kwargs)
