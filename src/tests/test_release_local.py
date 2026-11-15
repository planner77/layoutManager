"""Local release fail-closed checks; no Docker or network access."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import subprocess
import copy
import contextlib
import io
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import release_local as release
import release_local_registry as registry
import release_local_compat as compat


class ReleaseCompatPlanTests(unittest.TestCase):
    """Clone pre-apply plan gate and the unchanged post-apply proof path."""

    def run_proof(self, plan, *, candidate_version='0.62.0', positive=False):
        source = 'b' * 40
        roles = {role: {'imageId': 'sha256:' + letter * 64,
                        'localTag': 'fixture:' + candidate_version + ('-migrate' if role == 'migrator' else '')}
                 for role, letter in (('app', 'a'), ('migrator', 'b'), ('cpu-worker', 'c'))}
        record = {'version': candidate_version, 'sourceCommit': source, 'roles': roles}
        proof = {'plan': Path('/synthetic/plan.json'), 'archive': Path('/synthetic/archive'),
                 'key': Path('/synthetic/key'), 'planData': {'inventory': {'images': {'migrator': {'id': 'old-image'}}}}}
        old_install = {'version': '0.61.0', 'schemaId': 'schema', 'installId': 'install'}
        new_install = {**old_install, 'version': candidate_version, 'sourceCommit': source,
                       'appImage': roles['app']['localTag'], 'migratorImage': roles['migrator']['localTag']}
        storage = {'cadCount': 1, 'sceneAssetCount': 0, 'readyJobs': 0, 'currentScenes': 0}
        before = {'logical': {'install': old_install, 'tables': {'Location': 'same'},
                              'storage': storage}, 'files': [{'path': 'cad/fixture.dxf', 'sha256': 'a' * 64}]}
        after = {'logical': {'install': new_install, 'tables': {'Location': 'same'},
                             'storage': storage}, 'files': before['files']}
        with mock.patch.object(compat.baseline, 'input_paths', return_value=proof), \
             mock.patch.object(compat, 'node_json', side_effect=[{'state': 'RESTORED_ISOLATED'},
                                                                 {'state': 'VERIFIED_ISOLATED'}]), \
             mock.patch.object(compat, 'volume_scan', side_effect=[before, after]) as scan, \
             mock.patch.object(compat, 'migrator', side_effect=lambda _volume, _record, action:
                               plan if action == 'plan' else {'state': 'G7_GREENFIELD_READY', 'mode': 'UPGRADE'}) as migrate, \
             mock.patch.object(compat, 'app_and_worker', return_value={'appHealth': 'PASS', 'worker': 'IDLE'}) as runtime, \
             mock.patch.object(compat, 'cleanup') as cleanup:
            if positive:
                result = compat.prove('synthetic-proof', record)
                self.assertEqual(result['state'], 'CANDIDATE_COMPATIBLE')
                self.assertEqual(result['from'], '0.61.0')
                self.assertEqual(result['to'], candidate_version)
                self.assertEqual(migrate.call_count, 2)
                self.assertEqual([call.args[2] for call in migrate.call_args_list], ['plan', 'apply'])
                self.assertEqual(scan.call_count, 2)
                runtime.assert_called_once()
            else:
                with self.assertRaisesRegex(compat.Incompatible, 'CLONE_REGISTRY_EDGE'):
                    compat.prove('synthetic-proof', record)
                self.assertEqual(migrate.call_count, 1, 'invalid plan must stop before apply')
                self.assertEqual(scan.call_count, 1)
                runtime.assert_not_called()
            cleanup.assert_called_once()

    def test_one_and_two_compatible_steps_reach_post_validation_and_cleanup(self):
        for steps in (['COMPATIBLE'], ['COMPATIBLE', 'COMPATIBLE']):
            with self.subTest(steps=steps):
                self.run_proof({'state': 'UPGRADE_COMPATIBLE', 'from': '0.61.0', 'to': '0.62.0',
                                'steps': steps, 'requiresApproval': False}, positive=True)

    def test_invalid_plan_shapes_are_rejected_before_apply(self):
        valid = {'state': 'UPGRADE_COMPATIBLE', 'from': '0.61.0', 'to': '0.62.0',
                 'steps': ['COMPATIBLE', 'COMPATIBLE'], 'requiresApproval': False}
        invalid = ({'steps': []}, {'steps': None}, {'steps': 'COMPATIBLE'},
                   {'steps': [1]}, {'steps': [True]}, {'steps': ['UNKNOWN']},
                   {'steps': ['MIGRATION']}, {'steps': ['COMPATIBLE', 'MIGRATION']},
                   {'steps': ['COMPATIBLE'] * 33}, {'state': 'READY'},
                   {'from': '0.61.1'}, {'to': '0.61.1'},
                   {'requiresApproval': True}, {'requiresApproval': 1})
        for change in invalid:
            with self.subTest(change=change):
                self.run_proof({**valid, **change})
        missing = dict(valid)
        del missing['steps']
        self.run_proof(missing)
        same = {**valid, 'to': '0.61.0'}
        self.run_proof(same, candidate_version='0.61.0')


class ReleaseTreeCompatTests(unittest.TestCase):
    """The reviewed tree migration is a separate, owned-clone-only exception."""

    def fixture(self, from_version='0.61.0'):
        source = 'b' * 40
        roles = {role: {'imageId': 'sha256:' + letter * 64, 'localTag': 'fixture:0.63-' + role}
                 for role, letter in (('app', 'a'), ('migrator', 'b'), ('cpu-worker', 'c'))}
        record = {'version': '0.63.0', 'sourceCommit': source, 'roles': roles}
        proof = {'plan': Path('/synthetic/plan'), 'archive': Path('/synthetic/archive'),
                 'key': Path('/synthetic/key'), 'planData': {'nonce': 'e' * 32, 'sha256': 'f' * 64,
                 'inventory': {'images': {'migrator': {'id': 'old-image'}}}}}
        old_install = {'version': from_version, 'schemaId': compat.CPU_SCHEMA, 'installId': 'install'}
        new_install = {**old_install, 'version': '0.63.0', 'schemaId': compat.TREE_SCHEMA,
                       'sourceCommit': source, 'appImage': roles['app']['localTag'],
                       'migratorImage': roles['migrator']['localTag']}
        checksum = 'd' * 64
        prior = {'id': 'prior', 'migration_name': 'cpu-baseline', 'checksum': 'c' * 64,
                 'finished_at': '2026-11-01', 'started_at': '2026-11-01', 'logs': None,
                 'rolled_back_at': None, 'applied_steps_count': 1}
        last = {**prior, 'id': 'new', 'migration_name': compat.TREE_MIGRATION, 'checksum': checksum}
        def history(rows):
            raw = ''.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n'
                          for row in rows).encode()
            return {'rows': rows, 'sha256': hashlib.sha256(raw).hexdigest()}
        histories = [history([prior]), history([prior, last])]
        tables = [{'name': 'CadFileVersion', 'count': 1, 'sha256': 'a' * 64},
                  {'name': 'CadZone', 'count': 3, 'sha256': 'b' * 64},
                  {'name': '_prisma_migrations', 'count': 1, 'sha256': histories[0]['sha256']}]
        new_tables = [*copy.deepcopy(tables[:-1]),
                      {'name': '_prisma_migrations', 'count': 2, 'sha256': histories[1]['sha256']},
                      *[{'name': name, 'count': 0, 'sha256': hashlib.sha256(b'').hexdigest()}
                        for name in sorted(compat.TREE_TABLES)]]
        storage = {'cadCount': 1, 'sceneAssetCount': 1, 'readyJobs': 1, 'currentScenes': 1}
        before = {'logical': {'install': old_install, 'tables': tables, 'storage': storage},
                  'files': [{'path': 'cad/fixture.dxf', 'sha256': 'a' * 64, 'size': 42}]}
        after = {'logical': {'install': new_install, 'tables': new_tables, 'storage': storage},
                 'files': copy.deepcopy(before['files'])}
        steps = {'0.61.0': ['COMPATIBLE', 'COMPATIBLE', 'MIGRATION'],
                 '0.61.1': ['COMPATIBLE', 'MIGRATION'], '0.62.0': ['MIGRATION']}[from_version]
        plan = {'state': 'UPGRADE_MIGRATION_REQUIRED', 'from': from_version, 'to': '0.63.0',
                'steps': steps, 'requiresApproval': True, 'planId': 'e' * 64}
        return record, proof, before, after, histories, plan, {'migrationChecksum': checksum, 'steps': steps}

    def prove(self, fixture, expected_error=None):
        record, proof, before, after, histories, plan, contract = fixture
        with mock.patch.object(compat.baseline, 'input_paths', return_value=proof), \
             mock.patch.object(compat, 'node_json', side_effect=[{'state': 'RESTORED_ISOLATED'},
                                                               {'state': 'VERIFIED_ISOLATED'}]), \
             mock.patch.object(compat, 'volume_scan', side_effect=[before, after]), \
             mock.patch.object(compat, 'migrator', side_effect=[plan, {'state': 'G7_GREENFIELD_READY', 'mode': 'UPGRADE'}]) as migrate, \
             mock.patch.object(compat, 'assert_owned_clone') as owned, \
             mock.patch.object(compat, 'tree_contract', return_value=contract), \
             mock.patch.object(compat, 'history_snapshot', side_effect=histories), \
             mock.patch.object(compat, 'app_and_worker', return_value={'appHealth': 'PASS', 'worker': 'IDLE'}) as runtime, \
             mock.patch.object(compat, 'cleanup') as cleanup:
            if expected_error:
                with self.assertRaisesRegex(compat.Incompatible, expected_error):
                    compat.prove('synthetic', record)
                runtime.assert_not_called()
            else:
                result = compat.prove('synthetic', record)
                self.assertEqual(result['migration'], compat.TREE_MIGRATION)
                self.assertEqual(result['schemaId'], compat.TREE_SCHEMA)
                self.assertEqual(result['readyPreservation'], 'VERIFIED_REFERENCES')
                self.assertEqual(migrate.call_args_list[1].kwargs, {'approve_plan': plan['planId']})
                self.assertTrue(migrate.call_args_list[1].args[0].startswith('r282-compat-'))
                owned.assert_called_once()
                runtime.assert_called_once()
            cleanup.assert_called_once()
            return migrate.call_count

    def test_exact_registered_migration_from_three_prior_releases(self):
        for version in ('0.61.0', '0.61.1', '0.62.0'):
            with self.subTest(version=version):
                self.assertEqual(self.prove(self.fixture(version)), 2)

    def test_wrong_plan_rejected_before_any_apply(self):
        changes = ({'from': '0.60.0'}, {'to': '0.64.0'}, {'state': 'UPGRADE_COMPATIBLE'},
                   {'steps': ['MIGRATION']}, {'steps': ['COMPATIBLE', 'MIGRATION', 'MIGRATION']},
                   {'requiresApproval': False}, {'requiresApproval': 1}, {'planId': None},
                   {'planId': 'a' * 63}, {'planId': 'A' * 64})
        for change in changes:
            fixture = self.fixture()
            fixture[5].update(change)
            with self.subTest(change=change):
                self.assertEqual(self.prove(fixture, 'CLONE_REGISTRY_EDGE'), 1)
        fixture = self.fixture()
        fixture[2]['logical']['install']['schemaId'] = 'unknown-schema'
        self.assertEqual(self.prove(fixture, 'CLONE_REGISTRY_EDGE'), 1)

    def test_existing_rows_new_tables_history_storage_and_identity_must_match(self):
        changes = [
            lambda f: f[3]['logical']['tables'][0].update(sha256='f' * 64),
            lambda f: f[3]['logical']['tables'][0].update(count=0),
            lambda f: f[3]['logical']['tables'].pop(),
            lambda f: f[3]['logical']['tables'].append({'name': 'Unknown', 'count': 0}),
            lambda f: f[3]['logical']['tables'][-1].update(count=1),
            lambda f: f[3]['logical']['tables'][-1].update(sha256='f' * 64),
            lambda f: f[4][1]['rows'][0].update(checksum='f' * 64),
            lambda f: f[4][1]['rows'][-1].update(checksum='f' * 64),
            lambda f: f[4][1]['rows'][-1].update(rolled_back_at='2026-11-13'),
            lambda f: f[4][1]['rows'].append(dict(f[4][1]['rows'][-1])),
            lambda f: f[3]['logical'].update(storage={'cadCount': 0}),
            lambda f: f[3]['logical']['install'].update(schemaId='unknown'),
            lambda f: f[3]['logical']['install'].update(installId='changed'),
            lambda f: f[3]['logical']['install'].update(sourceCommit='f' * 40),
            lambda f: f[3]['logical']['install'].update(appImage='different'),
            lambda f: f[3]['files'][0].update(sha256='f' * 64),
        ]
        for index, change in enumerate(changes):
            fixture = self.fixture()
            change(fixture)
            with self.subTest(change=index):
                self.prove(fixture, 'CLONE_(LOGICAL_DRIFT|TREE_TABLES|TREE_HISTORY|CAD_DRIFT)')

    def test_owned_clone_inspection_and_exact_apply_argv(self):
        record, proof, *_ = self.fixture()
        with mock.patch.object(compat, 'docker', return_value=b'[{"Name":"r282-compat-test","Labels":{}}]'):
            with self.assertRaisesRegex(compat.Incompatible, 'CLONE_OWNERSHIP'):
                compat.assert_owned_clone('r282-compat-test', proof)
        with mock.patch.object(compat, 'docker_env', return_value=b'{"state":"OK"}') as run, \
             mock.patch.object(compat.subprocess, 'run'):
            compat.migrator('r282-compat-test', record, 'apply', approve_plan='e' * 64)
            argv = run.call_args.args[0]
            self.assertEqual(argv[-3:], ['apply', '--approve-plan', 'e' * 64])
            self.assertIn(record['roles']['migrator']['imageId'], argv)
            self.assertIn('--network', argv)
            self.assertEqual(argv[argv.index('--network') + 1], 'none')
            self.assertNotIn('ghcr', ' '.join(argv))
        for value in ('a' * 63, 'A' * 64, True):
            with self.assertRaisesRegex(compat.Incompatible, 'CLONE_APPROVAL'):
                compat.migrator('r282-compat-test', record, 'apply', approve_plan=value)

    def test_bundled_tree_registry_cannot_expand_the_reviewed_migration_exception(self):
        record, *_ = self.fixture()
        checksum = 'd' * 64
        edge = {'from': '0.62.0', 'to': '0.63.0', 'kind': 'MIGRATION',
                'migrationName': compat.TREE_MIGRATION, 'migrationChecksum': checksum,
                'sqlSha256': checksum, 'actualSqlSha256': checksum}
        value = {'target': {'version': '0.63.0', 'schemaId': compat.TREE_SCHEMA,
                            'baseline': compat.TREE_BASELINE, 'checksum': 'f' * 64},
                 'migrationName': compat.TREE_MIGRATION, 'migrationChecksum': checksum,
                 'sqlSha256': checksum, 'chains': {'0.62.0': [edge]}}
        with mock.patch.object(compat, 'candidate_inspection', return_value=value):
            result = compat.tree_contract(record, '0.62.0')
            self.assertEqual(result, {'migrationChecksum': checksum, 'steps': ['MIGRATION']})
        changes = [
            lambda v: v['target'].update(version='0.64.0'),
            lambda v: v['target'].update(schemaId='unknown'),
            lambda v: v['target'].update(baseline='other'),
            lambda v: v.update(sqlSha256='a' * 64),
            lambda v: v.update(chains=[]),
            lambda v: v['chains']['0.62.0'].append(dict(edge)),
            lambda v: v['chains']['0.62.0'][0].update(kind='COMPATIBLE'),
            lambda v: v['chains']['0.62.0'][0].update(migrationName='other'),
            lambda v: v['chains']['0.62.0'][0].update(sqlSha256='a' * 64),
        ]
        for index, change in enumerate(changes):
            changed = copy.deepcopy(value)
            change(changed)
            with self.subTest(change=index), \
                 mock.patch.object(compat, 'candidate_inspection', return_value=changed):
                with self.assertRaisesRegex(compat.Incompatible, 'CLONE_TREE_CONTRACT'):
                    compat.tree_contract(record, '0.62.0')


class ReleaseSelectedTests(unittest.TestCase):
    def test_selector_validation_rejects_unsafe_missing_duplicate_and_symlink_tests(self):
        with tempfile.TemporaryDirectory() as directory:
            src = Path(directory)
            unit = src / 'tests/unit/tree.test.ts'
            e2e = src / 'tests/e2e/tree.spec.ts'
            unit.parent.mkdir(parents=True)
            e2e.parent.mkdir(parents=True)
            unit.write_text('synthetic')
            e2e.write_text('synthetic')
            linked = unit.with_name('link.test.ts')
            linked.symlink_to(unit)
            with mock.patch.object(release.verify_local, 'SRC', src):
                good = {'unit': ['tests/unit/tree.test.ts'], 'e2e': ['tests/e2e/tree.spec.ts']}
                self.assertEqual(release.verify_local.validate_selected_tests(good), good)
                invalid = [None, {}, {'unit': [], 'e2e': [], 'extra': []},
                           {'unit': 'tests/unit/tree.test.ts', 'e2e': []},
                           {'unit': ['tests/unit/tree.test.ts'] * 2, 'e2e': []},
                           {'unit': ['tests/unit/missing.test.ts'], 'e2e': []},
                           {'unit': ['tests/unit/../unit/tree.test.ts'], 'e2e': []},
                           {'unit': ['tests/unit/link.test.ts'], 'e2e': []},
                           {'unit': ['/tmp/tree.test.ts'], 'e2e': []},
                           {'unit': ['tests/e2e/tree.spec.ts'], 'e2e': []},
                           {'unit': [], 'e2e': ['--config=other.spec.ts']},
                           {'unit': [True], 'e2e': []}]
                for value in invalid:
                    with self.subTest(value=value), self.assertRaises(ValueError):
                        release.verify_local.validate_selected_tests(value)

    def test_actual_manifest_readback_keeps_selected_and_inferred_required_tests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            src = root / 'src'
            selections = {'unit': ['tests/integration/tree.test.ts'], 'e2e': ['tests/e2e/tree.spec.ts']}
            for relative in [*selections['unit'], *selections['e2e'], 'tests/integration/other.test.ts']:
                path = src / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('synthetic; no execution')
            log = root / 'data/verify-local/run/case.log'
            log.parent.mkdir(parents=True)
            log.write_text('synthetic PASS, not runtime proof\n')
            digest = hashlib.sha256(log.read_bytes()).hexdigest()
            source = {'base': 'c' * 40, 'head': 'a' * 40, 'tree': 'b' * 40,
                      'fingerprint': 'd' * 64, 'dirty': False,
                      'paths': ['src/domain/version-tree.ts', 'src/server/cad-business/tree-service.ts']}
            state = {'commit': source['head'], 'tree': source['tree']}
            metadata = {'profile': 'release', 'source': source, 'risks': ['auth', 'db'],
                        'synthetic_auth_clock': 'native', 'selected_tests': selections}
            with mock.patch.object(release, 'ROOT', root), \
                 mock.patch.object(release.verify_local, 'SRC', src), \
                 mock.patch.object(release.verify_local, 'source_state', return_value=source), \
                 mock.patch.object(release.verify_local.shutil, 'which', return_value='/synthetic/executable'), \
                 mock.patch.object(release.verify_local.subprocess, 'run', return_value=mock.Mock(returncode=0)):
                manifest = release.verify_local.manifest('release', metadata['risks'], source['paths'],
                    selected_unit=selections['unit'], selected_e2e=selections['e2e'], recovery_input='synthetic-proof')
                self.assertNotIn('affected-review', [case['id'] for case in manifest])
                cases = [{**case, 'status': 'PASS', 'exit_code': 0, 'log': str(log.relative_to(root)),
                          'logSha256': digest} for case in manifest]
                run = {'issue': '282', 'status': 'PASS', 'stale': False, 'start': copy.deepcopy(metadata),
                       'end': copy.deepcopy(metadata), 'cases': cases}
                path = root / 'run.json'
                def check(value):
                    path.write_text(json.dumps(value))
                    with mock.patch.object(release.recovery, 'private_file', return_value=path):
                        return release.verify_run(str(path), state, 'synthetic-proof')
                check(run)
                def change_selection(value):
                    for key in ('start', 'end'):
                        value[key]['selected_tests']['unit'] = ['tests/integration/other.test.ts']
                def remove_metadata(value):
                    for key in ('start', 'end'):
                        del value[key]['selected_tests']
                def remove_test(value, test):
                    case = next(c for c in value['cases'] if c['id'] == 'affected-integration')
                    case['argv'].remove(test)
                changes = [
                    lambda v: v['end'].pop('selected_tests'),
                    lambda v: v['end']['selected_tests'].update(unit=[]),
                    lambda v: v['start'].update(selected_tests=None),
                    change_selection, remove_metadata,
                    lambda v: remove_test(v, 'tests/integration/tree.test.ts'),
                    lambda v: remove_test(v, 'tests/integration/g7-runtime-auth.test.ts'),
                    lambda v: next(c for c in v['cases'] if c['id'] == 'selected-browser')['argv'].append('--config=foreign.ts'),
                ]
                for index, change in enumerate(changes):
                    changed = copy.deepcopy(run)
                    change(changed)
                    with self.subTest(change=index), self.assertRaisesRegex(release.Halt, 'VERIFY_(TEST_SELECTION|CASE_DOWNGRADED|CASE_MISSING)'):
                        check(changed)


class FakeHTTP:
    def request(self, method, url, headers=None, data=None, destination=None, limit=None):
        if url == 'https://ghcr.io/v2/':
            return 401, {'www-authenticate': 'Bearer realm="https://ghcr.io/token",service="ghcr.io"'}, b'', 0, None
        if url.startswith('https://ghcr.io/token?'):
            raw = b'{"token":"fake"}'
            return 200, {}, raw, len(raw), None
        raise AssertionError('Unexpected HTTP call')


class ReleaseLocalTests(unittest.TestCase):
    def test_shared_blob_uses_inherited_transport_with_each_role_path(self):
        class UploadHTTP(FakeHTTP):
            def __init__(self):
                self.writes = []

            def request(self, method, url, headers=None, data=None, destination=None, limit=None):
                if method == 'HEAD' and '/blobs/sha256:' in url:
                    return 404, {}, b'', 0, None
                if method == 'POST' and url.endswith('/blobs/uploads/'):
                    self.writes.append(('POST', url, None, None))
                    return 202, {'location': '/v2/planner77/layoutmanager/blobs/uploads/session'}, b'', 0, None
                if method == 'PUT' and '/blobs/uploads/session?' in url:
                    self.writes.append(('PUT', url, data.name, data.read()))
                    return 201, {'docker-content-digest': blob_digest}, b'', 0, None
                return super().request(method, url, headers, data, destination, limit)

        class IntentJournal:
            def __init__(self):
                self.intents = []

            def intent(self, method, kind, reference):
                self.intents.append((method, kind, reference))

        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            data = b'shared OCI blob'
            blob_digest = 'sha256:' + hashlib.sha256(data).hexdigest()
            graphs = {}
            refs = release.refs('0.61.1', 'b' * 40)['candidate']
            for role, letter in zip(release.ROLES, 'cde'):
                path = workspace / (role + '.blob')
                path.write_bytes(data)
                top_digest = 'sha256:' + letter * 64
                graphs[role] = {'digest': top_digest, 'objects': {
                    blob_digest: {'kind': 'blob', 'path': str(path), 'digest': blob_digest,
                                  'size': len(data), 'mediaType': 'application/vnd.oci.image.layer.v1.tar'},
                    top_digest: {'kind': 'manifest', 'path': str(workspace / (role + '.manifest')),
                                 'digest': top_digest, 'size': 1,
                                 'mediaType': 'application/vnd.oci.image.manifest.v1+json'}}}
            original = copy.deepcopy(graphs)
            http = UploadHTTP()
            journal = IntentJournal()
            client = registry.GHCR('fake-token', set(registry.tags(refs).values()), journal,
                                   write=True, http=http)
            client.bind(graphs, refs)
            app_item = graphs['app']['objects'][blob_digest]
            for changed in ('digest', 'size', 'mediaType', 'kind'):
                with self.subTest(changed=changed):
                    bad = dict(app_item)
                    bad[changed] = {'digest': 'sha256:' + 'f' * 64,
                                    'size': len(data) + 1,
                                    'mediaType': 'application/octet-stream',
                                    'kind': 'manifest'}[changed]
                    with self.assertRaisesRegex(registry.Blocked, 'CA_LOCAL_BLOB_CHANGED'):
                        client.upload_blob(bad, Path(app_item['path']))
            unbound = workspace / 'unbound.blob'
            unbound.write_bytes(data)
            with self.assertRaisesRegex(registry.Blocked, 'CA_LOCAL_BLOB_CHANGED'):
                client.upload_blob(app_item, unbound)
            app_path = Path(app_item['path'])
            app_path.write_bytes(b'tampered OCI blob')
            with self.assertRaisesRegex(registry.Blocked, 'CA_LOCAL_BLOB_CHANGED'):
                client.upload_blob(app_item, app_path)
            app_path.write_bytes(data)
            # A role's own descriptor/path must still be rejected when the
            # bytes are tampered without changing their length.
            migrator_item = graphs['migrator']['objects'][blob_digest]
            migrator_path = Path(migrator_item['path'])
            migrator_path.write_bytes(b'broken OCI blob')
            self.assertEqual(migrator_path.stat().st_size, len(data))
            with self.assertRaisesRegex((registry.Blocked, registry.old.Pending), 'CA_LOCAL_BLOB_CHANGED'):
                client.upload_blob(migrator_item, migrator_path)
            migrator_path.write_bytes(data)

            # The inherited transport uploads the canonical app path even
            # when called through another role. Validate that path at upload
            # time too, before it can emit a journal intent or HTTP write.
            app_path.write_bytes(b'broken OCI blob')
            self.assertEqual(app_path.stat().st_size, len(data))
            with self.assertRaisesRegex((registry.Blocked, registry.old.Pending), 'CA_LOCAL_BLOB_CHANGED'):
                client.upload_blob(migrator_item, migrator_path)
            app_path.write_bytes(data)
            self.assertEqual(http.writes, [])
            self.assertEqual(journal.intents, [])
            conflicting = copy.deepcopy(graphs)
            conflicting['cpu-worker']['objects'][blob_digest]['mediaType'] = 'application/octet-stream'
            separate = registry.GHCR('fake-token', set(registry.tags(refs).values()),
                                     IntentJournal(), write=True, http=UploadHTTP())
            with self.assertRaisesRegex(registry.Blocked, 'GHCR_SHARED_OBJECT'):
                separate.bind(conflicting, refs)
            self.assertEqual(separate.bound_objects, {})
            for role in release.ROLES:
                item = graphs[role]['objects'][blob_digest]
                client.upload_blob(item, Path(item['path']))
            self.assertEqual(graphs, original)
            self.assertEqual([method for method, *_ in http.writes], ['POST', 'PUT'] * 3)
            self.assertEqual([(path, sent) for method, _, path, sent in http.writes
                              if method == 'PUT'], [(str(app_path), data)] * 3)
            self.assertEqual([kind for _, kind, _ in journal.intents],
                             ['blob-upload-init', 'blob-by-digest'] * 3)

    def test_owner_record_binds_exact_three_digests(self):
        with tempfile.TemporaryDirectory() as directory:
            plan = {'planSha256': 'a' * 64,
                    'source': {'commit': 'b' * 40, 'version': '0.61.1'},
                    'roles': {r: {'topDescriptor': {'digest': 'sha256:' + c * 64}}
                              for r, c in zip(release.ROLES, 'cde')},
                    'refs': release.refs('0.61.1', 'b' * 40)}
            record = {'format': 'RELEASE282-OWNER-GO-V1', 'conversationRef': 'conversation-282',
                      'recordedBy': 'release operator', 'verbatimOwnerReply': 'GO for this exact plan',
                      'presentedPlanSha256': plan['planSha256'],
                      'sourceCommit': plan['source']['commit'], 'version': '0.61.1',
                      'roleDigests': {r: plan['roles'][r]['topDescriptor']['digest']
                                      for r in release.ROLES},
                      'candidateRefs': plan['refs']['candidate'],
                      'finalRefs': plan['refs']['final']}
            path = Path(directory) / 'go.json'
            with self.assertRaises(Exception):
                release.approval(str(path), plan)
            path.write_text(json.dumps(record))
            path.chmod(0o600)
            self.assertEqual(release.approval(str(path), plan)['conversationRef'], 'conversation-282')
            record['roleDigests']['migrator'] = 'sha256:' + 'f' * 64
            path.write_text(json.dumps(record))
            with self.assertRaisesRegex(release.Halt, 'OWNER_GO_BINDING'):
                release.approval(str(path), plan)

    def test_owner_actual_korean_directive_and_rejection_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            plan = {'planSha256': 'a' * 64,
                    'source': {'commit': 'b' * 40, 'version': '0.62.0'},
                    'roles': {role: {'topDescriptor': {'digest': 'sha256:' + letter * 64}}
                              for role, letter in zip(release.ROLES, 'cde')},
                    'refs': release.refs('0.62.0', 'b' * 40)}
            record = {'format': 'RELEASE282-OWNER-GO-V1',
                      'conversationRef': 'actual-owner-conversation',
                      'recordedBy': 'release operator',
                      'verbatimOwnerReply': '정식 버전 GHCR 게시와 도커로 운영 배포 하세요.',
                      'presentedPlanSha256': plan['planSha256'],
                      'sourceCommit': plan['source']['commit'], 'version': '0.62.0',
                      'roleDigests': {role: plan['roles'][role]['topDescriptor']['digest']
                                      for role in release.ROLES},
                      'candidateRefs': plan['refs']['candidate'],
                      'finalRefs': plan['refs']['final']}
            path = Path(directory) / 'owner.json'

            def check(candidate, accepted):
                path.write_text(json.dumps(candidate, ensure_ascii=False))
                path.chmod(0o600)
                if accepted:
                    self.assertEqual(release.approval(str(path), plan)['conversationRef'],
                                     'actual-owner-conversation')
                    self.assertEqual(json.loads(path.read_text())['verbatimOwnerReply'],
                                     candidate['verbatimOwnerReply'])
                else:
                    with self.assertRaisesRegex(release.Halt, 'OWNER_GO_BINDING'):
                        release.approval(str(path), plan)

            for reply in ('정식 버전 GHCR 게시와 도커로 운영 배포 하세요.',
                          '  정식   버전 GHCR 게시와\n 도커로 운영 배포 하세요.  ',
                          'GO for this exact plan', 'I approve this exact plan.',
                          '승인합니다', '진행하세요'):
                with self.subTest(reply=reply):
                    check({**record, 'verbatimOwnerReply': reply}, True)
            for reply in ('정식 버전 GHCR 게시와 도커로 운영 배포 하지 마세요.',
                          '정식 버전 GHCR 게시와 도커로 운영 배포 하세요?',
                          '정식 버전 GHCR 게시만 하세요.', '도커로 운영 배포 하세요.',
                          'GHCR 게시와 도커로 운영 배포 하세요.',
                          '정식 버전 GHCR 게시와 도커로 운영 배포 하세요. 취소',
                          'NO-GO', 'Do not approve this plan.', '승인하지 않습니다',
                          '진행하지 마세요', 'GOING elsewhere', 'disapprove'):
                with self.subTest(reply=reply):
                    check({**record, 'verbatimOwnerReply': reply}, False)
            for key, wrong in (('presentedPlanSha256', 'f' * 64),
                               ('sourceCommit', 'f' * 40), ('version', '0.61.1'),
                               ('candidateRefs', {}), ('finalRefs', {}),
                               ('conversationRef', ''), ('recordedBy', '')):
                with self.subTest(key=key):
                    check({**record, key: wrong}, False)
            for role in release.ROLES:
                with self.subTest(role=role):
                    check({**record, 'roleDigests': {**record['roleDigests'],
                          role: 'sha256:' + 'f' * 64}}, False)
            check(record, True)
            path.chmod(0o644)
            with self.assertRaisesRegex(release.recovery.Rejected, 'RECOVERY_PRIVATE_FILE'):
                release.approval(str(path), plan)

    def test_owner_issue201_directive_is_exact_and_preserves_binding(self):
        directive = ('Issue 201을 확인하고 내용을 참조하여 구현, 테스트, 실패 원장 기록, 정식 GHCR 게시, '
                     '이슈 종료를 진행하세요. 구현 간 발생한 임시 컨텡너, 볼륨, 워크 트리는 이슈 종료 시 삭제하세요.')
        for reply in (directive, '  ' + directive.replace('GHCR', 'ghcr').replace(' ', ' \n ') + '  '):
            with self.subTest(reply=reply):
                self.assertTrue(release.affirmative_owner_reply(reply))
        for reply in (directive + ' 취소', '진행하지 마세요. ' + directive,
                      directive.replace('진행하세요.', '진행하지 마세요.'),
                      directive.replace('진행하세요.', '진행하세요?'),
                      directive.replace('Issue 201', 'Issue 202'),
                      '정식 GHCR 게시, 이슈 종료', directive.split('. ')[0] + '.',
                      '“' + directive + '”'):
            with self.subTest(reply=reply):
                self.assertFalse(release.affirmative_owner_reply(reply))
        with tempfile.TemporaryDirectory() as directory:
            plan = {'planSha256': 'a' * 64,
                    'source': {'commit': 'b' * 40, 'version': '0.63.0'},
                    'roles': {role: {'topDescriptor': {'digest': 'sha256:' + letter * 64}}
                              for role, letter in zip(release.ROLES, 'cde')},
                    'refs': release.refs('0.63.0', 'b' * 40)}
            record = {'format': 'RELEASE282-OWNER-GO-V1',
                      'conversationRef': 'actual-issue201-owner-conversation',
                      'recordedBy': 'release operator', 'verbatimOwnerReply': directive,
                      'presentedPlanSha256': plan['planSha256'],
                      'sourceCommit': plan['source']['commit'], 'version': '0.63.0',
                      'roleDigests': {role: plan['roles'][role]['topDescriptor']['digest']
                                     for role in release.ROLES},
                      'candidateRefs': plan['refs']['candidate'], 'finalRefs': plan['refs']['final']}
            path = Path(directory) / 'owner.json'
            def write(candidate):
                path.write_text(json.dumps(candidate, ensure_ascii=False))
                path.chmod(0o600)
            write(record)
            self.assertEqual(release.approval(str(path), plan)['conversationRef'], record['conversationRef'])
            self.assertEqual(json.loads(path.read_text())['verbatimOwnerReply'], directive)
            for key, wrong in (('presentedPlanSha256', 'f' * 64), ('sourceCommit', 'f' * 40),
                               ('version', '0.62.0'), ('candidateRefs', {}), ('finalRefs', {}),
                               ('conversationRef', ''), ('recordedBy', '')):
                with self.subTest(key=key):
                    write({**record, key: wrong})
                    with self.assertRaisesRegex(release.Halt, 'OWNER_GO_BINDING'):
                        release.approval(str(path), plan)
            for role in release.ROLES:
                with self.subTest(role=role):
                    write({**record, 'roleDigests': {**record['roleDigests'], role: 'sha256:' + 'f' * 64}})
                    with self.assertRaisesRegex(release.Halt, 'OWNER_GO_BINDING'):
                        release.approval(str(path), plan)
            write(record)
            path.chmod(0o644)
            with self.assertRaisesRegex(release.recovery.Rejected, 'RECOVERY_PRIVATE_FILE'):
                release.approval(str(path), plan)

    def test_publish_failures_halt_and_never_resume(self):
        class FakeRegistry:
            def __init__(self, tags, failure):
                self.allowed_tags = tags
                self.failure = failure
                self.values = dict(release.BASELINE)
                self.puts = []
                self.baselines = 0
                self.journal = None
            def manifest(self, ref):
                if ref in release.BASELINE:
                    self.baselines += 1
                    if self.failure == 'post-baseline' and self.puts and self.baselines > 8:
                        return {'digest': 'sha256:' + 'f' * 64}
                digest = self.values.get(ref)
                return {'digest': digest} if digest else None
            def bind(self, graphs, refs):
                pass
            def put_manifest(self, ref, descriptor, raw):
                self.journal.intent('PUT', 'manifest', ref)
                self.puts.append(ref)
                if self.failure in ('401', '403', 'timeout', 'pending') or (
                        self.failure == 'second-role' and len(self.puts) == 2):
                    if self.failure == 'timeout':
                        raise TimeoutError('synthetic timeout')
                    if self.failure == 'pending':
                        raise registry.old.Pending('https://private.invalid/?token=synthetic-secret')
                    raise registry.Blocked('HTTP_' + self.failure)
                self.values[ref] = descriptor['digest']

        for failure in ('401', '403', 'timeout', 'pending', 'second-role', 'readback', 'post-baseline', 'existing'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                workspace = Path(directory)
                plan_path = workspace / 'preflight.json'
                plan_path.write_text('{}')
                plan_path.chmod(0o600)
                refs = release.refs('0.61.1', 'b' * 40)
                plan = {'planSha256': 'a' * 64, 'source': {'commit': 'b' * 40,
                        'version': '0.61.1'}, 'refs': refs}
                graphs = {}
                for role, character in zip(release.ROLES, 'cde'):
                    digest = 'sha256:' + character * 64
                    raw_path = workspace / (role + '.manifest')
                    raw_path.write_bytes(b'raw')
                    graphs[role] = {'digest': digest, 'objects': {digest: {
                        'kind': 'manifest', 'path': str(raw_path), 'digest': digest,
                        'size': 3, 'mediaType': 'application/vnd.oci.image.index.v1+json'}},
                        'manifestOrder': [digest]}
                fake = FakeRegistry(release.allowed_tags(refs), failure)
                if failure == 'existing':
                    fake.values[registry.tags(refs['candidate'])['app']] = graphs['app']['digest']
                def make_client(token, tags, journal=None, **kwargs):
                    fake.journal = journal
                    return fake
                def readback(client, target_refs, candidate_graphs, source):
                    if failure == 'readback':
                        raise registry.Blocked('READBACK_FAILED')
                    tags = registry.tags(target_refs)
                    return {role: fake.values[tags[role]] for role in release.ROLES}
                patches = [mock.patch.object(release, 'checked_preflight', return_value=(plan, {}, graphs)),
                           mock.patch.object(release, 'approval', return_value={'recordSha256': 'f' * 64,
                                                                               'conversationRef': 'test',
                                                                               'authority': 'test'}),
                           mock.patch.object(release, 'credential', return_value='opaque'),
                           mock.patch.object(release.registry, 'GHCR', side_effect=make_client),
                           mock.patch.object(release, 'readback', side_effect=readback),
                           mock.patch.object(release.registry, 'pull_smoke')]
                for patch in patches:
                    patch.start()
                try:
                    with self.assertRaises((release.Halt, registry.Blocked,
                                            registry.old.Pending, TimeoutError)):
                        release.publish_stage('candidate', str(plan_path), 'owner-record',
                                              None, execute=True)
                    journal_path = workspace / 'candidate.journal.jsonl'
                    if failure == 'existing':
                        self.assertFalse(journal_path.exists())
                        self.assertEqual(fake.puts, [])
                    else:
                        rows = registry.read_journal(journal_path, plan['planSha256'], 'candidate')
                        self.assertEqual(rows[-1]['event'], 'HALT')
                        before = len(fake.puts)
                        with self.assertRaisesRegex(release.Halt, 'ATTEMPT_ALREADY_EXISTS'):
                            release.publish_stage('candidate', str(plan_path), 'owner-record',
                                                  None, execute=True)
                        self.assertEqual(len(fake.puts), before)
                finally:
                    for patch in reversed(patches):
                        patch.stop()

    def test_cli_sanitizes_inherited_pending(self):
        secret = 'https://private.invalid/?token=synthetic-secret'
        stderr = io.StringIO()
        with mock.patch.object(sys, 'argv', ['release_local.py', 'candidate',
                                             '--preflight-record', 'preflight.json',
                                             '--owner-record', 'owner.json', '--execute']), \
             mock.patch.object(release, 'publish_stage', side_effect=registry.old.Pending(secret)), \
             contextlib.redirect_stderr(stderr):
            self.assertEqual(release.main(), 1)
        self.assertEqual(stderr.getvalue(), 'RELEASE282_HALT\n')

    def test_all_workspaces_contend_for_one_publisher_lock(self):
        first = release.publisher_lock()
        try:
            with self.assertRaisesRegex(registry.Blocked, 'PUBLISHER_LOCKED'):
                release.publisher_lock()
        finally:
            first.close()

    def test_final_rejects_candidate_journal_halt_after_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            plan = {'planSha256': 'a' * 64,
                    'refs': {'candidate': {'app': 'ghcr.io/planner77/layoutmanager:candidate-app'}}}
            owner = {'recordSha256': 'b' * 64}
            journal_path = workspace / 'candidate.journal.jsonl'
            journal = registry.Journal(journal_path, plan['planSha256'], 'candidate')
            journal.append({'event': 'VERIFIED', 'readback': {'app': 'sha256:' + 'c' * 64}})
            journal.append({'event': 'HALT', 'partialState': 'UNKNOWN_OR_PARTIAL'})
            journal.close()
            rows = registry.read_journal(journal_path, plan['planSha256'], 'candidate')
            receipt = {'state': 'CANDIDATE_VERIFIED', 'planSha256': plan['planSha256'],
                       'ownerRecordSha256': owner['recordSha256'],
                       'refs': plan['refs']['candidate'], 'baseline': release.BASELINE,
                       'journalSha256': release.file_sha(journal_path),
                       'journalLastSha256': rows[-1]['sha256'],
                       'readback': {'app': 'sha256:' + 'c' * 64}}
            receipt_path = workspace / 'candidate.receipt.json'
            receipt_path.write_text(json.dumps(receipt))
            receipt_path.chmod(0o600)
            with self.assertRaisesRegex(release.Halt, 'CANDIDATE_RECEIPT_JOURNAL'):
                release.checked_candidate_receipt(workspace, plan, owner)
            journal_path.write_bytes(journal_path.read_bytes()[:-4])
            with self.assertRaises((registry.Blocked, json.JSONDecodeError)):
                release.checked_candidate_receipt(workspace, plan, owner)

    def test_smoke_timeout_cleans_only_owned_container_with_private_data_mount(self):
        image = 'r282local' + 'a' * 12 + ':0.61.1'
        calls = []
        def fake(args, **kwargs):
            calls.append(args)
            if args[1] == 'run':
                self.assertIn('/data:rw,nosuid,nodev,size=16m,uid=10001,gid=10001', args)
                raise subprocess.TimeoutExpired(args, 120)
            if args[1:3] == ['container', 'inspect']:
                nonce = calls[0][calls[0].index('--label') + 1].split('=', 1)[1]
                item = {'Name': '/' + args[3], 'Config': {'Image': image,
                        'Labels': {'release282.smoke': nonce}},
                        'HostConfig': {'Tmpfs': {
                            '/tmp': 'rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
                            '/data': 'rw,nosuid,nodev,size=16m,uid=10001,gid=10001'}},
                        'Mounts': []}
                return subprocess.CompletedProcess(args, 0, json.dumps([item]).encode(), b'')
            return subprocess.CompletedProcess(args, 0, b'', b'')
        with mock.patch.object(registry.subprocess, 'run', side_effect=fake):
            with self.assertRaises(subprocess.TimeoutExpired):
                registry.smoke_image(image)
        self.assertEqual(calls[-1][1:4], ['rm', '-f', '-v'])

    def test_smoke_docker29_tmpfs_only_inspect_cleans_owned_container(self):
        image = 'r282local' + 'a' * 12 + ':0.61.1'
        calls = []
        def fake(args, **kwargs):
            calls.append(args)
            if args[1:3] == ['container', 'inspect']:
                nonce = calls[0][calls[0].index('--label') + 1].split('=', 1)[1]
                item = {'Name': '/' + args[3], 'Config': {'Image': image,
                        'Labels': {'release282.smoke': nonce}},
                        'HostConfig': {'Tmpfs': {
                            '/tmp': 'rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
                            '/data': 'rw,nosuid,nodev,size=16m,uid=10001,gid=10001'}},
                        'Mounts': []}
                return subprocess.CompletedProcess(args, 0, json.dumps([item]).encode(), b'')
            return subprocess.CompletedProcess(args, 0, b'', b'')
        with mock.patch.object(registry.subprocess, 'run', side_effect=fake):
            registry.smoke_image(image)
        self.assertEqual(calls[-1][1:4], ['rm', '-f', '-v'])

    def test_smoke_rejects_foreign_data_mount_without_cleanup(self):
        image = 'r282local' + 'a' * 12 + ':0.61.1'
        for mount_type in ('bind', 'volume'):
            with self.subTest(mount_type=mount_type):
                calls = []
                def fake(args, **kwargs):
                    calls.append(args)
                    if args[1:3] == ['container', 'inspect']:
                        nonce = calls[0][calls[0].index('--label') + 1].split('=', 1)[1]
                        item = {'Name': '/' + args[3], 'Config': {'Image': image,
                                'Labels': {'release282.smoke': nonce}},
                                'HostConfig': {'Tmpfs': {
                                    '/tmp': 'rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
                                    '/data': 'rw,nosuid,nodev,size=16m,uid=10001,gid=10001'}},
                                'Mounts': [{'Destination': '/data', 'Type': mount_type}]}
                        return subprocess.CompletedProcess(args, 0, json.dumps([item]).encode(), b'')
                    return subprocess.CompletedProcess(args, 0, b'', b'')
                with mock.patch.object(registry.subprocess, 'run', side_effect=fake):
                    with self.assertRaisesRegex(registry.Blocked, 'DIGEST_SMOKE_OWNERSHIP'):
                        registry.smoke_image(image)
                self.assertEqual(len(calls), 2)

    def test_published_config_must_match_actual_local_image(self):
        image = {'Id': 'sha256:' + 'a' * 64}
        record = {'imageId': image['Id']}
        graph = {'configDigest': 'sha256:' + 'b' * 64}
        with self.assertRaisesRegex(release.Halt, 'BUILD_IMAGE_CHANGED'):
            release.check_image_binding(graph, record, image)

    def test_read_only_transport_rejects_mutation_before_http(self):
        client = registry.GHCR('fake-token', {'0.61.0'}, http=FakeHTTP(), write=False)
        with self.assertRaisesRegex(registry.Blocked, 'READ_ONLY_REGISTRY_ROUTE'):
            client.request('POST', '/v2/planner77/layoutmanager/blobs/uploads/', data=b'')

    def test_journal_short_writes_are_completed_and_chained(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'attempt.jsonl'
            original = os.write
            count = 0
            def short(fd, data):
                nonlocal count
                count += 1
                return original(fd, data[:1] if count == 1 else data)
            with mock.patch.object(registry.os, 'write', side_effect=short):
                journal = registry.Journal(path, 'a' * 64, 'candidate')
                journal.intent('PUT', 'manifest', 'candidate-ref')
                journal.close()
            rows = registry.read_journal(path, 'a' * 64, 'candidate')
            self.assertEqual([r['event'] for r in rows], ['BEGIN', 'REMOTE_INTENT'])

    def test_required_case_downgrade_and_tampered_log(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / 'data/verify-local/run/case.log'
            log.parent.mkdir(parents=True)
            log.write_bytes(b'PASS\n')
            digest = hashlib.sha256(log.read_bytes()).hexdigest()
            state = {'commit': 'a' * 40, 'tree': 'b' * 40}
            source = {'base': 'c' * 40, 'head': state['commit'], 'tree': state['tree'],
                      'fingerprint': 'd' * 64, 'dirty': False, 'paths': []}
            case = {'id': 'preflight', 'required': True, 'status': 'PASS', 'exit_code': 0,
                    'argv': ['python3', 'scripts/verify_local_preflight.py'], 'cwd': 'src',
                    'log': 'data/verify-local/run/case.log', 'logSha256': digest}
            browser_argv = ['npx', 'playwright', 'test', '--config',
                            'playwright.g7-runtime.config.ts', '--reporter=line']
            browser = {**case, 'id': 'g7-browser', 'argv': browser_argv}
            run = {'issue': '282', 'status': 'PASS', 'stale': False,
                   'start': {'profile': 'release', 'source': source, 'risks': [],
                             'synthetic_auth_clock': 'native'},
                   'end': {'source': source, 'synthetic_auth_clock': 'native'},
                   'cases': [case, browser]}
            path = root / 'run.json'
            def check_run(changed):
                path.write_text(json.dumps(changed))
                def expected_manifest(*args, synthetic_auth_clock='native', **kwargs):
                    expected_browser = (["env", "G7_RUNTIME_E2E_MONOTONIC_CLOCK=true"]
                                        if synthetic_auth_clock == 'monotonic' else []) + browser_argv
                    return [{'id': 'preflight', 'required': True, 'argv': case['argv'], 'cwd': 'src'},
                            {'id': 'g7-browser', 'required': True, 'argv': expected_browser, 'cwd': 'src'}]
                with mock.patch.object(release, 'ROOT', root), \
                     mock.patch.object(release.recovery, 'private_file', return_value=path), \
                     mock.patch.object(release.verify_local, 'source_state', return_value=source), \
                     mock.patch.object(release.verify_local, 'infer_risks', return_value=([], '')), \
                     mock.patch.object(release.verify_local, 'manifest', side_effect=expected_manifest):
                    release.verify_run(str(path), state)
            check_run(run)
            run['start']['synthetic_auth_clock'] = 'monotonic'
            with self.assertRaisesRegex(release.Halt, 'VERIFY_CLOCK_MODE'):
                check_run(run)
            run['start']['synthetic_auth_clock'] = 'native'
            run['start']['synthetic_auth_clock'] = run['end']['synthetic_auth_clock'] = 'monotonic'
            with self.assertRaisesRegex(release.Halt, 'VERIFY_CASE_DOWNGRADED'):
                check_run(run)
            run['start']['synthetic_auth_clock'] = run['end']['synthetic_auth_clock'] = 'native'
            case['required'] = False
            with self.assertRaisesRegex(release.Halt, 'VERIFY_CASE_DOWNGRADED'):
                check_run(run)
            case['required'] = True
            log.write_bytes(b'FAIL\n')
            with self.assertRaisesRegex(release.Halt, 'VERIFY_LOG_BYTES'):
                check_run(run)


if __name__ == '__main__':
    unittest.main()
