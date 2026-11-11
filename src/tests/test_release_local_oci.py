"""Focused synthetic byte checks for the local OCI packager."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('release_local_oci', ROOT / 'src/scripts/release_local_oci.py')
OCI = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OCI)
SOURCE = 'a' * 40


def tar_bytes(items):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w') as tar:
        for name, data in items.items():
            entry = tarfile.TarInfo(name)
            entry.mode = 0o600
            entry.size = len(data)
            tar.addfile(entry, io.BytesIO(data))
    return out.getvalue()


def archive(file: Path, *, source=SOURCE, diff_id=None, extra=None):
    layer = tar_bytes({'app.txt': b'synthetic app'})
    config = {'os': 'linux', 'architecture': 'amd64',
              'rootfs': {'type': 'layers', 'diff_ids': [diff_id or 'sha256:' + hashlib.sha256(layer).hexdigest()]},
              'config': {'User': 'cad', 'Entrypoint': ['docker-entrypoint.sh'],
                         'Healthcheck': {'Test': ['CMD', 'node', '-e', 'process.exit(0)']},
                         'Labels': {'org.opencontainers.image.source': 'https://github.com/planner77/layoutManager',
                                    'org.opencontainers.image.revision': source,
                                    'org.opencontainers.image.version': '0.61.1',
                                    'com.planner77.g7.image-role': 'app'}}}
    config_raw = json.dumps(config).encode()
    manifest = json.dumps([{'Config': 'config.json', 'RepoTags': ['r282:0.61.1'],
                            'Layers': ['layer.tar']}]).encode()
    file.write_bytes(tar_bytes({'manifest.json': manifest, 'config.json': config_raw,
                                'layer.tar': layer, **(extra or {})}))


class OciGraph(unittest.TestCase):
    def test_exact_source_graph_and_raw_byte_tamper(self):
        with tempfile.TemporaryDirectory(prefix='r282-oci-unit-') as temp:
            root = Path(temp)
            archive(root / 'docker.tar')
            record = OCI.docker_archive_to_oci(root / 'docker.tar', root / 'layout',
                                               role='app', source=SOURCE, version='0.61.1')
            graph = OCI.validate_layout(root / 'layout', root / 'graph', 'app', SOURCE, '0.61.1')
            self.assertEqual(graph['digest'], record['topDigest'])
            self.assertEqual(graph['configDigest'], record['configDigest'])
            target = root / 'layout' / 'blobs' / 'sha256' / record['configDigest'][7:]
            target.write_bytes(target.read_bytes() + b'x')
            with self.assertRaises(Exception):
                OCI.validate_layout(root / 'layout', root / 'graph-bad', 'app', SOURCE, '0.61.1')

    def test_wrong_source_diffid_and_traversal_fail(self):
        for name, changes in [('source', {'source': 'b' * 40}),
                              ('diff', {'diff_id': 'sha256:' + '0' * 64}),
                              ('path', {'extra': {'../escape': b'x'}})]:
            with self.subTest(name=name), tempfile.TemporaryDirectory(prefix='r282-oci-neg-') as temp:
                root = Path(temp)
                archive(root / 'docker.tar', **changes)
                with self.assertRaises(OCI.Invalid):
                    OCI.docker_archive_to_oci(root / 'docker.tar', root / 'layout',
                                              role='app', source=SOURCE, version='0.61.1')


if __name__ == '__main__':
    unittest.main()
