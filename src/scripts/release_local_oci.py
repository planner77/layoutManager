"""Exact-source Docker image -> bounded, byte-verified single-platform OCI graph.

Only local files and Docker images are read here. Registry transport lives elsewhere.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests/oci'))
import candidate_registry as registry  # selective reuse: exact raw graph validator

OCI_INDEX = 'application/vnd.oci.image.index.v1+json'
OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json'
OCI_CONFIG = 'application/vnd.oci.image.config.v1+json'
OCI_LAYER = 'application/vnd.oci.image.layer.v1.tar+gzip'
MAX_OBJECT = 2 * 1024 ** 3
MAX_TOTAL = 8 * 1024 ** 3
HEX64 = re.compile(r'[a-f0-9]{64}\Z')


class Invalid(Exception):
    pass


def need(ok: bool, code: str) -> None:
    if not ok:
        raise Invalid(code)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def raw_json(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def write_object(directory: Path, raw: bytes) -> dict:
    need(len(raw) <= MAX_OBJECT, 'OCI_OBJECT_BOUND')
    digest = sha(raw)
    target = directory / digest
    if target.exists():
        need(target.read_bytes() == raw, 'OCI_OBJECT_COLLISION')
    else:
        with target.open('xb') as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
    return {'digest': 'sha256:' + digest, 'size': len(raw)}


def safe_members(archive: tarfile.TarFile) -> dict[str, tarfile.TarInfo]:
    members: dict[str, tarfile.TarInfo] = {}
    total = 0
    for item in archive:
        name = item.name
        need(len(name) <= 512 and not name.startswith('/') and '\\' not in name
             and all(part not in ('', '.', '..') for part in name.rstrip('/').split('/'))
             and not any(ord(char) < 32 for char in name), 'OCI_TAR_PATH')
        need(item.isfile() or item.isdir(), 'OCI_TAR_MEMBER')
        if item.isdir():
            continue
        need(name not in members and 0 <= item.size <= MAX_OBJECT, 'OCI_TAR_DUPLICATE_OR_BOUND')
        total += item.size
        need(len(members) < 1024 and total <= MAX_TOTAL, 'OCI_TAR_TOTAL_BOUND')
        members[name] = item
    return members


def read_member(archive: tarfile.TarFile, member: tarfile.TarInfo, limit: int) -> bytes:
    need(member.size <= limit, 'OCI_METADATA_BOUND')
    stream = archive.extractfile(member)
    need(stream is not None, 'OCI_TAR_MEMBER')
    raw = stream.read(limit + 1)
    need(len(raw) == member.size, 'OCI_TAR_TRUNCATED')
    return raw


def docker_archive_to_oci(docker_archive: Path, destination: Path, *, role: str,
                          source: str, version: str) -> dict:
    """Recompress exact Docker-save layer tar bytes with deterministic gzip mtime=0."""
    need(role in ('app', 'migrator', 'cpu-worker') and re.fullmatch(r'[a-f0-9]{40}', source)
         and re.fullmatch(r'0\.\d+\.\d+', version), 'OCI_IDENTITY')
    destination.mkdir(mode=0o700, exist_ok=False)
    blobs = destination / 'blobs' / 'sha256'
    blobs.mkdir(mode=0o700, parents=True)
    (destination / 'oci-layout').write_bytes(b'{"imageLayoutVersion":"1.0.0"}\n')
    with tarfile.open(docker_archive, 'r:*') as archive:
        members = safe_members(archive)
        need('manifest.json' in members, 'OCI_DOCKER_MANIFEST')
        save_manifest = json.loads(read_member(archive, members['manifest.json'], 2 * 1024 * 1024))
        need(type(save_manifest) is list and len(save_manifest) == 1 and
             type(save_manifest[0]) is dict, 'OCI_DOCKER_MANIFEST')
        selected = save_manifest[0]
        config_name = selected.get('Config')
        layer_names = selected.get('Layers')
        need(type(config_name) is str and config_name in members
             and type(layer_names) is list and 0 < len(layer_names) <= 200
             and len(set(layer_names)) == len(layer_names)
             and all(type(name) is str and name in members for name in layer_names),
             'OCI_DOCKER_LINKS')
        config_raw = read_member(archive, members[config_name], 8 * 1024 * 1024)
        config = json.loads(config_raw)
        labels = config.get('config', {}).get('Labels', {})
        need(config.get('os') == 'linux' and config.get('architecture') == 'amd64'
             and labels.get('org.opencontainers.image.revision') == source
             and labels.get('org.opencontainers.image.version') == version
             and labels.get('org.opencontainers.image.source') == 'https://github.com/planner77/layoutManager'
             and labels.get('com.planner77.g7.image-role') == role
             and config.get('config', {}).get('User') in ('cad', '10001', '10001:10001'),
             'OCI_CONFIG_IDENTITY')
        settings = config['config']
        need((role == 'app' and type(settings.get('Healthcheck')) is dict
              and settings.get('Entrypoint') == ['docker-entrypoint.sh'])
             or (role == 'migrator' and settings.get('Entrypoint') == ['docker-entrypoint.sh'])
             or (role == 'cpu-worker' and settings.get('Entrypoint') == ['sh', 'scripts/scene-cpu-worker-loop.sh']),
             'OCI_RUNTIME_ROLE')
        diff_ids = config.get('rootfs', {}).get('diff_ids')
        need(config.get('rootfs', {}).get('type') == 'layers'
             and type(diff_ids) is list and len(diff_ids) == len(layer_names)
             and all(type(d) is str and d.startswith('sha256:') and HEX64.fullmatch(d[7:]) for d in diff_ids),
             'OCI_DIFFIDS')
        config_desc = {'mediaType': OCI_CONFIG, **write_object(blobs, config_raw)}
        layer_desc = []
        for layer_name, diff_id in zip(layer_names, diff_ids):
            member = members[layer_name]
            temp = blobs / ('pending-' + str(len(layer_desc)))
            uncompressed = hashlib.sha256()
            stream = archive.extractfile(member)
            need(stream is not None, 'OCI_LAYER_MISSING')
            with temp.open('xb') as output:
                with gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0,
                                   compresslevel=6) as zipped:
                    left = member.size
                    while left:
                        chunk = stream.read(min(1024 * 1024, left))
                        need(chunk, 'OCI_LAYER_TRUNCATED')
                        uncompressed.update(chunk)
                        zipped.write(chunk)
                        left -= len(chunk)
                output.flush()
                os.fsync(output.fileno())
            need('sha256:' + uncompressed.hexdigest() == diff_id, 'OCI_DIFFID_MISMATCH')
            compressed = file_digest(temp)
            final = blobs / compressed[7:]
            if final.exists():
                need(file_digest(final) == compressed and final.stat().st_size == temp.stat().st_size,
                     'OCI_LAYER_COLLISION')
                temp.unlink()
            else:
                temp.rename(final)
            layer_desc.append({'mediaType': OCI_LAYER, 'digest': compressed, 'size': final.stat().st_size})
        manifest = {'schemaVersion': 2, 'mediaType': OCI_MANIFEST,
                    'config': config_desc, 'layers': layer_desc}
        manifest_desc = {'mediaType': OCI_MANIFEST, **write_object(blobs, raw_json(manifest))}
        index = {'schemaVersion': 2, 'mediaType': OCI_INDEX,
                 'manifests': [{**manifest_desc, 'platform': {'os': 'linux', 'architecture': 'amd64'}}]}
        (destination / 'index.json').write_bytes(raw_json(index))
    fsync_dir(blobs)
    fsync_dir(destination)
    return {'topDigest': 'sha256:' + sha((destination / 'index.json').read_bytes()),
            'manifestDigest': manifest_desc['digest'], 'configDigest': config_desc['digest'],
            'layers': [entry['digest'] for entry in layer_desc]}


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return 'sha256:' + digest.hexdigest()


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class LocalLayout:
    """Read-only adapter for candidate_registry.collect_graph's exact validator."""
    def __init__(self, directory: Path):
        self.directory = directory
        self.blobs = directory / 'blobs' / 'sha256'

    def manifest(self, reference: str) -> dict:
        if reference == 'root':
            raw = (self.directory / 'index.json').read_bytes()
        else:
            need(type(reference) is str and reference.startswith('sha256:')
                 and HEX64.fullmatch(reference[7:]), 'OCI_MANIFEST_REF')
            raw = (self.blobs / reference[7:]).read_bytes()
        need(len(raw) <= 8 * 1024 * 1024, 'OCI_MANIFEST_BOUND')
        value = json.loads(raw)
        media = value.get('mediaType')
        need(media in (OCI_INDEX, OCI_MANIFEST), 'OCI_MANIFEST_MEDIA')
        return {'raw': raw, 'digest': 'sha256:' + sha(raw), 'size': len(raw), 'mediaType': media}

    def blob(self, descriptor: dict, destination: Path) -> None:
        source = self.blobs / descriptor['digest'][7:]
        need(source.is_file() and source.stat().st_size == descriptor['size']
             and file_digest(source) == descriptor['digest'], 'OCI_BLOB_CHANGED')
        with source.open('rb') as inp, destination.open('xb') as out:
            shutil.copyfileobj(inp, out, 1024 * 1024)
            out.flush()
            os.fsync(out.fileno())
        need(file_digest(destination) == descriptor['digest'], 'OCI_BLOB_COPY_CHANGED')


def validate_layout(layout: Path, graphs_dir: Path, role: str, source: str, version: str) -> dict:
    graph = registry.collect_graph(LocalLayout(layout), 'root', graphs_dir, role, source,
                                   version=version)
    need(graph['digest'] == 'sha256:' + sha((layout / 'index.json').read_bytes()),
         'OCI_TOP_CHANGED')
    return graph
