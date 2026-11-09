#!/usr/bin/env python3
"""RT01–06: test-only, same-package raw manifest promotion algorithm.

No network client, credential discovery, Owner/environment verifier or publisher is
provided. Import does no I/O. The CLI only reads explicit local plan fixtures.
Injected adapters/contracts are NOT evidence of authorization. Before real use a
separate reviewed verifier must validate candidate source/role/platform, signatures,
config/layer bytes and receipt; an Owner GO verifier and serialized publisher must
also be implemented. This component proves neither those claims nor atomicity.
"""
import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
import rf03_exact_release as exact_release
from typing import Protocol

PACKAGE = 'ghcr.io/planner77/layoutmanager'
VERSION = json.loads((Path(__file__).resolve().parents[3] / 'src/package.json').read_text())['version']
exact_release.exact_tags(VERSION)  # reject all historical <=0.61.0 versions at import
# Reserved expected candidate-signer contract data only: no such publisher or
# verifier is supplied here. The loopback release-proof.yml signer is ineligible
# as actual GHCR candidate provenance.
WORKFLOW = '.github/workflows/release-finalizer-rf03-candidate.yml'
FINALS = {'app': VERSION, 'migrator': VERSION + '-migrate',
          'cpu-worker': VERSION + '-cpu-worker'}
OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json'
OCI_INDEX = 'application/vnd.oci.image.index.v1+json'
DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json'
DOCKER_INDEX = 'application/vnd.docker.distribution.manifest.list.v2+json'
MANIFEST_TYPES = {OCI_MANIFEST, DOCKER_MANIFEST}
INDEX_TYPES = {OCI_INDEX, DOCKER_INDEX}
MAX_MANIFEST = 8 * 1024 * 1024


class Rejected(ValueError):
    """Safe code only: never include adapter error messages or input values."""


def require(condition, code):
    if not condition:
        raise Rejected(code)


def keys(value, expected):
    require(type(value) is dict and set(value) == set(expected), 'INVALID_FIELDS')


def hex_value(value, length):
    return type(value) is str and re.fullmatch('[0-9a-f]{%d}' % length, value) is not None


def digest_value(value):
    return type(value) is str and value.startswith('sha256:') and hex_value(value[7:], 64)


def raw_digest(raw):
    return 'sha256:' + hashlib.sha256(raw).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'DUPLICATE_JSON_KEY')
        result[key] = value
    return result


def parse_json(raw):
    try:
        return json.loads(raw, object_pairs_hook=unique_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(Rejected('INVALID_JSON')))
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise Rejected('INVALID_JSON') from None


def validate_packet(packet):
    keys(packet, ('schema', 'package', 'version', 'sourceCommit', 'sourceTree',
                  'workflowPath', 'workflowCommit', 'candidateReceiptSha256',
                  'runId', 'runAttempt', 'candidates'))
    require(packet['schema'] == 'RT_PLAN_V1' and packet['package'] == PACKAGE
            and packet['version'] == VERSION and packet['workflowPath'] == WORKFLOW,
            'INVALID_SCOPE')
    require(hex_value(packet['sourceCommit'], 40) and hex_value(packet['sourceTree'], 40)
            and packet['workflowCommit'] == packet['sourceCommit']
            and hex_value(packet['candidateReceiptSha256'], 64), 'INVALID_SOURCE')
    for name in ('runId', 'runAttempt'):
        require(type(packet[name]) is str and re.fullmatch('[1-9][0-9]{0,19}', packet[name]),
                'INVALID_RUN')
    keys(packet['candidates'], FINALS)
    for role, final in FINALS.items():
        candidate = packet['candidates'][role]
        keys(candidate, ('role', 'sourceCommit', 'sourceTree', 'workflowCommit',
                         'candidateReceiptSha256', 'candidateRef', 'finalRef',
                         'digest', 'mediaType', 'size'))
        require(candidate['role'] == role, 'WRONG_ROLE')
        for name in ('sourceCommit', 'sourceTree', 'workflowCommit', 'candidateReceiptSha256'):
            require(candidate[name] == packet[name], 'CROSS_SOURCE')
        tag = 'candidate-%s-%s-%s-%s' % (packet['sourceCommit'], packet['runId'],
                                        packet['runAttempt'], role)
        require(candidate['candidateRef'] == PACKAGE + ':' + tag
                and candidate['finalRef'] == PACKAGE + ':' + final, 'INVALID_REF')
        require(len(tag) <= 128 and digest_value(candidate['digest'])
                and type(candidate['mediaType']) is str
                and candidate['mediaType'] in MANIFEST_TYPES | INDEX_TYPES
                and type(candidate['size']) is int and 0 < candidate['size'] <= MAX_MANIFEST,
                'INVALID_DESCRIPTOR')
    require(len({candidate['digest'] for candidate in packet['candidates'].values()}) == 3,
            'DUPLICATE_ROLE_DIGEST')
    # Hash is a binding identifier, never a signature or Owner authority.
    return hashlib.sha256(json.dumps(packet, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


@dataclass(frozen=True)
class Manifest:
    raw: bytes
    media_type: str
    digest: str


@dataclass(frozen=True)
class AuthenticatedManifestAbsent:
    """Adapter contract: authenticated request, explicit MANIFEST_UNKNOWN only.

    Generic HTTP 404, auth/transport exceptions and malformed responses MUST NOT
    produce this type. It is constructible for fake tests, not an auth verifier.
    """


@dataclass(frozen=True)
class BlobHead:
    digest: str
    size: int


@dataclass(frozen=True)
class VerifiedCandidateContract:
    """Injection contract from a FUTURE independent verifier; NOT Owner approval.

    In these local tests this is synthetic. Constructing it or passing a packet
    hash does not verify signatures, source, role, platform or receipt contents.
    """
    packet_sha256: str


class Transport(Protocol):
    def get_manifest(self, package: str, reference: str) -> Manifest | AuthenticatedManifestAbsent: ...
    def head_blob(self, package: str, digest: str) -> BlobHead: ...
    def put_manifest(self, package: str, reference: str, raw: bytes, content_type: str) -> None: ...


class Journal(Protocol):
    def begin(self, packet_sha256: str) -> None:
        """Durably claim a NEW attempt; reject any previous/uncertain attempt.

        The caller owns journal storage/serialization. No file adapter is supplied.
        """
        ...

    def append(self, event: dict) -> None:
        """Return only after durable recording; raise if unavailable."""
        ...


def validate_raw(response, descriptor):
    require(type(response) is Manifest and type(response.raw) is bytes
            and 0 < len(response.raw) <= MAX_MANIFEST, 'INVALID_MANIFEST')
    require(response.digest == descriptor['digest'] == raw_digest(response.raw)
            and response.media_type == descriptor['mediaType']
            and len(response.raw) == descriptor['size'], 'RAW_DESCRIPTOR_MISMATCH')
    obj = parse_json(response.raw)
    require(type(obj) is dict and type(obj.get('schemaVersion')) is int
            and obj['schemaVersion'] == 2 and obj.get('mediaType') == response.media_type,
            'INVALID_MANIFEST_SCHEMA')
    return obj


def validate_descriptor(descriptor):
    require(type(descriptor) is dict and digest_value(descriptor.get('digest'))
            and type(descriptor.get('size')) is int and descriptor['size'] > 0
            and type(descriptor.get('mediaType')) is str
            and 'urls' not in descriptor and 'data' not in descriptor,
            'INVALID_LINK_DESCRIPTOR')


def verify_graph(transport, descriptor, response, depth=0, budget=None):
    """Raw manifest graph verification; blobs only HEAD digest/size availability.

    Blob bytes, config labels, platform/source/role and signatures belong to the
    separate candidate verifier. External/foreign URLs are never fetched.
    """
    budget = [1024] if budget is None else budget
    budget[0] -= 1
    require(depth <= 8 and budget[0] >= 0, 'GRAPH_LIMIT')
    obj = validate_raw(response, descriptor)
    if response.media_type in INDEX_TYPES:
        children = obj.get('manifests')
        require(type(children) is list and 0 < len(children) <= 1024, 'INVALID_INDEX')
        for child in children:
            validate_descriptor(child)
            require(child['mediaType'] in MANIFEST_TYPES | INDEX_TYPES, 'INVALID_CHILD_MEDIA')
            linked = transport.get_manifest(PACKAGE, child['digest'])
            verify_graph(transport, child, linked, depth + 1, budget)
    else:
        require(response.media_type in MANIFEST_TYPES and type(obj.get('layers')) is list
                and len(obj['layers']) <= 1024 and 'config' in obj, 'INVALID_IMAGE')
        for blob in [obj['config'], *obj['layers']]:
            validate_descriptor(blob)
            budget[0] -= 1
            require(budget[0] >= 0, 'GRAPH_LIMIT')
            observed = transport.head_blob(PACKAGE, blob['digest'])
            require(type(observed) is BlobHead and observed.digest == blob['digest']
                    and type(observed.size) is int and observed.size == blob['size'],
                    'BLOB_UNAVAILABLE')


def read_final_set(packet, transport):
    # Read every final before deciding, even if an earlier request failed.
    observations = []
    for role in FINALS:
        candidate = packet['candidates'][role]
        try:
            observed = transport.get_manifest(PACKAGE, candidate['finalRef'].split(':')[-1])
            if type(observed) is AuthenticatedManifestAbsent:
                observations.append('ABSENT')
            else:
                validate_raw(observed, candidate)
                observations.append('EXACT')
        except Exception:
            observations.append('UNKNOWN_OR_MISMATCH')
    if observations == ['ABSENT'] * 3:
        return 'COPY_PLAN'
    if observations == ['EXACT'] * 3:
        return 'NO_OP'
    return 'HALT'


def promote_for_transport_test(packet, transport, journal, verified_candidates):
    """Injected local-test seam ONLY, not an authorized real registry entrypoint.

    One attempt; never retries/deletes/rolls back. External writer exclusion and
    trusted durable journal implementations remain future publisher obligations.
    """
    packet_sha = validate_packet(packet)
    require(type(verified_candidates) is VerifiedCandidateContract
            and verified_candidates.packet_sha256 == packet_sha, 'CANDIDATE_CONTRACT_REQUIRED')
    decision = read_final_set(packet, transport)
    if decision != 'COPY_PLAN':
        return {'state': decision, 'confirmed': [], 'attempted': []}
    originals = {}
    try:
        for role in FINALS:
            descriptor = packet['candidates'][role]
            original = transport.get_manifest(PACKAGE, descriptor['candidateRef'].split(':')[-1])
            verify_graph(transport, descriptor, original)
            originals[role] = original
    except Exception:
        return {'state': 'HALT', 'confirmed': [], 'attempted': []}
    confirmed, attempted = [], []
    try:
        journal.begin(packet_sha)
        for role, final in FINALS.items():
            descriptor = packet['candidates'][role]
            original = originals[role]
            # Detect a target appearing during candidate preflight / earlier PUTs.
            # This check is not CAS: a writer may still race the ensuing request.
            require(type(transport.get_manifest(PACKAGE, final)) is
                    AuthenticatedManifestAbsent, 'TARGET_NO_LONGER_ABSENT')
            journal.append({'event': 'PUT_INTENT', 'packetSha256': packet_sha,
                            'role': role, 'ref': descriptor['finalRef'],
                            'digest': descriptor['digest']})
            # Any exception from PUT is ambiguous: adapter may have sent bytes.
            attempted.append(role)
            transport.put_manifest(PACKAGE, final, original.raw, original.media_type)
            validate_raw(transport.get_manifest(PACKAGE, final), descriptor)
            validate_raw(transport.get_manifest(PACKAGE, descriptor['digest']), descriptor)
            journal.append({'event': 'PUT_CONFIRMED', 'role': role,
                            'digest': descriptor['digest']})
            confirmed.append(role)
        # Recheck the complete set: an earlier tag may have changed after its
        # individual readback. This is detection, not external-writer exclusion.
        require(read_final_set(packet, transport) == 'NO_OP', 'FINAL_SET_CHANGED')
        journal.append({'event': 'COMPLETE', 'packetSha256': packet_sha})
        return {'state': 'COMPLETE', 'confirmed': confirmed, 'attempted': attempted}
    except Exception:
        state = 'PARTIAL_RELEASE' if confirmed else ('UNCERTAIN' if attempted else 'HALT')
        try:
            journal.append({'event': 'HALT', 'state': state, 'attempted': list(attempted),
                            'confirmed': list(confirmed)})
        except Exception:
            pass  # The existing durable PUT_INTENT is the recovery boundary.
        return {'state': state, 'confirmed': confirmed, 'attempted': attempted}


def plan_fixture(packet, observations):
    """Pure fixture plan; observations are untrusted simulations, not auth proof."""
    packet_sha = validate_packet(packet)
    keys(observations, FINALS)
    states = []
    for role in FINALS:
        observation = observations[role]
        require(type(observation) is dict and observation.get('state') in
                ('ABSENT', 'PRESENT', 'UNKNOWN'), 'INVALID_OBSERVATION')
        if observation['state'] == 'PRESENT':
            keys(observation, ('state', 'digest', 'sourceCommit', 'candidateReceiptSha256'))
            exact = all(observation[key] == packet['candidates'][role][key]
                        for key in ('digest', 'sourceCommit', 'candidateReceiptSha256'))
            states.append('EXACT' if exact else 'UNKNOWN')
        else:
            keys(observation, ('state',))
            states.append(observation['state'])
    decision = 'COPY_PLAN' if states == ['ABSENT'] * 3 else (
        'NO_OP' if states == ['EXACT'] * 3 else 'HALT')
    return {'mode': 'PLAN_ONLY', 'decision': decision, 'packetSha256': packet_sha,
            'httpRequests': 0, 'authority': 'NOT_VERIFIED', 'evidence': 'LOCAL_FIXTURE_ONLY'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet', help='explicit local JSON plan packet')
    parser.add_argument('--observations', help='explicit local JSON observation fixture')
    args = parser.parse_args(argv)
    if not args.packet and not args.observations:
        print(json.dumps({'mode': 'PLAN_ONLY', 'decision': 'NO_INPUT', 'httpRequests': 0,
                          'authority': 'NOT_VERIFIED'}))
        return 0
    if not args.packet or not args.observations:
        parser.error('--packet and --observations are required together')
    try:
        # Explicit local reads only. No environment, token, HTTP or write path.
        with open(args.packet, 'rb') as source:
            packet = parse_json(source.read(MAX_MANIFEST + 1))
        with open(args.observations, 'rb') as source:
            observations = parse_json(source.read(MAX_MANIFEST + 1))
        print(json.dumps(plan_fixture(packet, observations), sort_keys=True))
        return 0
    except (OSError, ValueError, TypeError, KeyError, RecursionError):
        print(json.dumps({'mode': 'PLAN_ONLY', 'decision': 'HALT', 'error': 'INVALID_PLAN_INPUT',
                          'httpRequests': 0, 'authority': 'NOT_VERIFIED'}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
