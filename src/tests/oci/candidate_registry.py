"""Bounded Distribution IO for the one fixed candidate repository.

No Docker push/login or host credential discovery. Every mutation is journaled;
there are no retries, deletes, final tags or generic registry URL parameters.
"""
import base64
import hashlib
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

from candidate_policy import Pending, need, decode, sha, canonical, tags, ROLES

ORIGIN = 'https://ghcr.io'
REPOSITORY = 'planner77/layoutmanager'
PREFIX = '/v2/' + REPOSITORY
SCOPE = 'repository:' + REPOSITORY + ':pull,push'
DIGEST = re.compile(r'sha256:[0-9a-f]{64}')
IMAGES = {'application/vnd.oci.image.manifest.v1+json',
          'application/vnd.docker.distribution.manifest.v2+json'}
INDEXES = {'application/vnd.oci.image.index.v1+json',
           'application/vnd.docker.distribution.manifest.list.v2+json'}
ACCEPT = ', '.join(sorted(IMAGES | INDEXES))
CONFIGS = {'application/vnd.oci.image.config.v1+json', 'application/vnd.docker.container.image.v1+json'}
LAYERS = {'application/vnd.oci.image.layer.v1.tar', 'application/vnd.oci.image.layer.v1.tar+gzip',
          'application/vnd.oci.image.layer.v1.tar+zstd', 'application/vnd.docker.image.rootfs.diff.tar.gzip'}
UPLOAD_PATH = re.compile(re.escape(PREFIX) +
                         r'/blobs/(?:upload/[A-Za-z0-9_.-]{1,200}|uploads/[A-Za-z0-9_-]{1,200})')


def upload_target(location, digest):
    """Validate one fixed-repository server URL without rewriting its opaque query."""
    need(type(location) is str and 0 < len(location) <= 16384 and location.isascii()
         and '#' not in location and not re.search(r'[\x00-\x20\x7f\\]', location),
         'CA_UPLOAD_LOCATION_REFUSED')
    try:
        raw = urllib.parse.urlsplit(location)
        need(not raw.fragment and not raw.username and not raw.password
             and '%' not in raw.path and not any(part in ('.', '..') for part in raw.path.split('/')),
             'CA_UPLOAD_LOCATION_REFUSED')
        absolute = urllib.parse.urljoin(ORIGIN, location)
        parsed = urllib.parse.urlsplit(absolute)
        need(parsed.scheme == 'https' and parsed.netloc == 'ghcr.io'
             and parsed.username is None and parsed.password is None and not parsed.fragment
             and UPLOAD_PATH.fullmatch(parsed.path), 'CA_UPLOAD_LOCATION_REFUSED')
        query = parsed.query
        need(not re.search(r'%(?![0-9A-Fa-f]{2})', query), 'CA_UPLOAD_LOCATION_REFUSED')
        if query:
            # One literal key and an opaque nonempty value. Keep the raw bytes in
            # memory; decode/re-encode can change an issued session capability.
            need('&' not in query and query.startswith('_state=') and len(query) > len('_state='),
                 'CA_UPLOAD_LOCATION_REFUSED')
        return parsed.path + ('?' + query + '&' if query else '?') + 'digest=' + \
            urllib.parse.quote(digest, safe='')
    except (ValueError, UnicodeError):
        raise Pending('CA_UPLOAD_LOCATION_REFUSED') from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Return the original redirect response; never forward headers.


class HTTP:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def request(self, method, url, headers=None, data=None, destination=None, limit=2 * 1024 * 1024):
        request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
        try:
            response = self.opener.open(request, timeout=120)
        except urllib.error.HTTPError as error:
            response = error
        except (OSError, TimeoutError, urllib.error.URLError):
            raise Pending('CA_HTTP_UNAVAILABLE_OR_UNCERTAIN') from None
        with response:
            status = response.status
            headers = {k.lower(): v for k, v in response.headers.items()}
            collected = bytearray(); total = 0; digest = hashlib.sha256()
            # Only successful blob bodies reach the private destination file.
            stream = Path(destination).open('xb') if destination is not None and status == 200 else None
            try:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    need(total <= limit, 'CA_RESPONSE_LIMIT')
                    digest.update(chunk)
                    if stream:
                        stream.write(chunk)
                    else:
                        collected.extend(chunk)
            except (OSError, TimeoutError):
                raise Pending('CA_HTTP_BODY_UNAVAILABLE_OR_UNCERTAIN') from None
            finally:
                if stream:
                    stream.close()
            return status, headers, bytes(collected), total, 'sha256:' + digest.hexdigest()


class GitHubReadOnly:
    def __init__(self, token, http=None):
        need(type(token) is str and token and not any(c in token for c in '\r\n'), 'CA_JOB_TOKEN_MISSING')
        self.token = token
        self.http = http or HTTP()

    def get(self, path):
        # No POST/PATCH/PUT API capability. Metadata only, fixed repository/package.
        patterns = (
            r'/repos/planner77/layoutManager/actions/runs/[1-9][0-9]*(?:/attempts/1)?',
            r'/repos/planner77/layoutManager/actions/runs/[1-9][0-9]*(?:/attempts/[1-9][0-9]*)?/jobs\?per_page=100&page=[1-9][0-9]*',
            r'/repos/planner77/layoutManager/actions/runs/[1-9][0-9]*/approvals',
            r'/repos/planner77/layoutManager/actions/workflows/[1-9][0-9]*/runs\?event=workflow_dispatch&per_page=100&page=[1-9][0-9]*',
            r'/repos/planner77/layoutManager/git/ref/heads/main',
            r'/repos/planner77/layoutManager/git/commits/[0-9a-f]{40}',
            r'/repos/planner77/layoutManager/environments/issue225-candidate-publish',
            r'/repos/planner77/layoutManager/environments/issue225-candidate-publish/deployment-branch-policies\?per_page=100&page=[1-9][0-9]*',
            r'/users/planner77/packages/container/layoutmanager',
        )
        need(any(re.fullmatch(pattern, path) for pattern in patterns), 'CA_API_ROUTE_REFUSED')
        status, _, raw, _, _ = self.http.request('GET', 'https://api.github.com' + path,
            {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + self.token,
             'X-GitHub-Api-Version': '2022-11-28'})
        need(status == 200, 'CA_API_READBACK_PENDING')
        return decode(raw)


class Journal:
    def __init__(self, path, expected):
        # Exclusive creation prevents a fresh attempt from silently resuming an
        # uncertain previous write. Recovery needs a separately reviewed action.
        self.stream = os.fdopen(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'wb')
        self.writes = 0
        self.append({'event': 'BEGIN', **expected})
        directory = os.open(Path(path).parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def append(self, event):
        self.stream.write(canonical(event) + b'\n')
        self.stream.flush()
        os.fsync(self.stream.fileno())

    def intent(self, method, object_kind, reference):
        self.append({'event': 'REMOTE_INTENT', 'method': method, 'kind': object_kind,
                     'reference': reference})
        self.writes += 1

    def close(self):
        self.stream.close()


class GHCR:
    def __init__(self, token, actor, expected, journal, http=None):
        need(type(token) is str and token and not any(c in token for c in '\r\n')
             and re.fullmatch('[A-Za-z0-9-]+', actor or ''), 'CA_JOB_CREDENTIAL_INVALID')
        self.allowed_tags = set(tags(expected).values())
        self.bound_objects = {}
        self.bound_tags = {}
        self._upload_session = None
        self.journal = journal
        self.http = http or HTTP()
        status, headers, _, _, _ = self.http.request('GET', ORIGIN + '/v2/')
        challenge = headers.get('www-authenticate', '')
        need(status == 401 and challenge in (
            'Bearer realm="https://ghcr.io/token",service="ghcr.io"',
            'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:user/image:pull"',
            'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="' + SCOPE + '"'),
            'CA_GHCR_TOKEN_REALM_PENDING')
        credentials = base64.b64encode((actor + ':' + token).encode()).decode()
        token_url = ORIGIN + '/token?' + urllib.parse.urlencode({'service': 'ghcr.io', 'scope': SCOPE})
        status, _, raw, _, _ = self.http.request('GET', token_url, {'Authorization': 'Basic ' + credentials})
        data = decode(raw)
        need(status == 200 and type(data) is dict and type(data.get('token')) is str
             and data['token'] and not any(c in data['token'] for c in '\r\n'), 'CA_GHCR_TOKEN_PENDING')
        self.bearer = data['token']

    def request(self, method, path, *, data=None, media=None, destination=None, limit=2 * 1024 * 1024):
        session = self._upload_session if method == 'PUT' else None
        if method == 'PUT':
            self._upload_session = None  # Any attempted PUT consumes the issued capability.
        need(path.startswith(PREFIX + '/') and '\\' not in path and '\n' not in path
             and '\r' not in path and '#' not in path, 'CA_REGISTRY_ROUTE_REFUSED')
        parsed = urllib.parse.urlsplit(path)
        manifest = re.fullmatch(re.escape(PREFIX) + r'/manifests/([^/?]+)', parsed.path)
        blob = re.fullmatch(re.escape(PREFIX) + r'/blobs/(sha256:[0-9a-f]{64})', parsed.path)
        allowed = False
        if method == 'GET' and not parsed.query:
            allowed = bool(manifest and (manifest[1] in self.allowed_tags or DIGEST.fullmatch(manifest[1])) or blob)
        elif method == 'HEAD' and not parsed.query:
            allowed = bool(blob)
        elif method == 'POST':
            allowed = parsed.path == PREFIX + '/blobs/uploads/' and not parsed.query and bool(self.bound_objects)
        elif method == 'PUT' and manifest and not parsed.query:
            target = manifest[1]
            locked = self.bound_tags.get(target) or self.bound_objects.get(target)
            allowed = bool(locked and type(data) is bytes and locked['kind'] == 'manifest'
                           and 'sha256:' + sha(data) == locked['digest'] and media == locked['mediaType'])
        elif method == 'PUT':
            locked = self.bound_objects.get(session['digest']) if session else None
            allowed = bool(session and path == session['target'] and locked and locked['kind'] == 'blob'
                           and locked['digest'] == session['digest'] and locked['size'] == session['size']
                           and locked['path'] == session['path'] and media == 'application/octet-stream'
                           and isinstance(data, Path) and str(data) == session['path']
                           and data.stat().st_size == session['size'])
        need(allowed, 'CA_REGISTRY_ROUTE_REFUSED')
        headers = {'Authorization': 'Bearer ' + self.bearer,
                   'Accept': ACCEPT if manifest else 'application/octet-stream, application/json'}
        if media:
            headers['Content-Type'] = media
        if isinstance(data, Path):
            headers['Content-Length'] = str(data.stat().st_size)
            with data.open('rb') as stream:
                return self.http.request(method, ORIGIN + path, headers, stream, destination, limit)
        return self.http.request(method, ORIGIN + path, headers, data, destination, limit)

    def bind_graphs(self, graphs, expected):
        need(not self.bound_objects and set(graphs) == set(ROLES), 'CA_GRAPH_BINDING_INVALID')
        for role in ROLES:
            self.bound_objects.update(graphs[role]['objects'])
            self.bound_tags[tags(expected)[role]] = graphs[role]['objects'][graphs[role]['digest']]

    def manifest(self, reference):
        need(reference in self.allowed_tags or DIGEST.fullmatch(reference), 'CA_MANIFEST_REF_REFUSED')
        status, headers, raw, size, digest = self.request('GET', PREFIX + '/manifests/' + reference)
        if status == 404:
            data = decode(raw)
            need(type(data) is dict and type(data.get('errors')) is list and len(data['errors']) == 1
                 and data['errors'][0].get('code') == 'MANIFEST_UNKNOWN'
                 and 'www-authenticate' not in headers, 'CA_MANIFEST_ABSENCE_UNPROVEN')
            return None
        need(status == 200 and headers.get('docker-content-digest') == digest
             and headers.get('content-type', '').split(';')[0] in IMAGES | INDEXES,
             'CA_MANIFEST_READBACK_INVALID')
        if DIGEST.fullmatch(reference):
            need(reference == digest, 'CA_MANIFEST_DIGEST_MISMATCH')
        return {'raw': raw, 'digest': digest, 'mediaType': headers['content-type'].split(';')[0], 'size': size}

    def blob(self, descriptor, destination):
        digest = descriptor['digest']; need(DIGEST.fullmatch(digest), 'CA_BLOB_DIGEST_INVALID')
        status, headers, _, total, actual = self.request('GET', PREFIX + '/blobs/' + digest,
             destination=destination, limit=descriptor['size'])
        if status in (302, 307):
            # Approved one-hop, blob-GET-only GitHub CDN contract. Signed URLs
            # stay ephemeral: never journal/log/persist the Location or query.
            location = headers.get('location', '')
            need(type(location) is str and len(location) <= 16384
                 and not re.search(r'[\x00-\x20\x7f]', location), 'CA_BLOB_REDIRECT_REFUSED')
            target = urllib.parse.urlsplit(location)
            need(target.scheme == 'https' and target.netloc in (
                'pkg-containers.githubusercontent.com', 'pkg-containers.githubusercontent.com:443')
                 and target.username is None and target.password is None
                 and target.path.startswith('/') and not target.fragment
                 and headers.get('docker-content-digest', digest) == digest,
                 'CA_BLOB_REDIRECT_REFUSED')
            # Empty headers: no Authorization, Cookie, Proxy-Authorization or
            # registry Accept copied. HTTP has no credential/proxy discovery.
            status, headers, _, total, actual = self.http.request(
                'GET', location, {}, destination=destination, limit=descriptor['size'])
        need(status == 200 and total == descriptor['size'] and actual == digest
             and headers.get('docker-content-digest', digest) == digest, 'CA_BLOB_BYTES_OR_REDIRECT_PENDING')

    def upload_blob(self, descriptor, path):
        digest = descriptor['digest']
        path = Path(path)
        locked = self.bound_objects.get(digest)
        need(self._upload_session is None and DIGEST.fullmatch(digest) and locked
             and locked['kind'] == 'blob' and locked['digest'] == digest
             and locked['size'] == descriptor['size'] and locked['mediaType'] == descriptor['mediaType']
             and locked['path'] == str(path) and path.is_file()
             and path.stat().st_size == descriptor['size'] and file_digest(path) == digest,
             'CA_LOCAL_BLOB_CHANGED')
        status, headers, _, _, _ = self.request('HEAD', PREFIX + '/blobs/' + digest)
        if status == 200:
            need(headers.get('docker-content-digest') == digest
                 and headers.get('content-length') == str(descriptor['size']), 'CA_EXISTING_BLOB_MISMATCH')
            return
        need(status == 404 and 'www-authenticate' not in headers, 'CA_BLOB_EXISTENCE_PENDING')
        self.journal.intent('POST', 'blob-upload-init', digest)
        status, headers, _, _, _ = self.request('POST', PREFIX + '/blobs/uploads/', data=b'')
        need(status == 202, 'CA_BLOB_UPLOAD_INIT_UNCERTAIN')
        target = upload_target(headers.get('location', ''), digest)
        self.journal.intent('PUT', 'blob-by-digest', digest)
        self._upload_session = {'target': target, 'digest': digest,
                                'size': descriptor['size'], 'path': str(path)}
        status, headers, _, _, _ = self.request('PUT', target, data=Path(path), media='application/octet-stream')
        need(status == 201 and headers.get('docker-content-digest') == digest, 'CA_BLOB_UPLOAD_UNCERTAIN')

    def put_manifest(self, reference, descriptor, raw):
        need(reference in self.allowed_tags or reference == descriptor['digest']
             and DIGEST.fullmatch(reference), 'CA_MANIFEST_WRITE_REFUSED')
        need('sha256:' + sha(raw) == descriptor['digest'] and len(raw) == descriptor['size'],
             'CA_LOCAL_MANIFEST_CHANGED')
        self.journal.intent('PUT', 'manifest', reference)
        status, headers, _, _, _ = self.request('PUT', PREFIX + '/manifests/' + reference,
                                              data=raw, media=descriptor['mediaType'])
        need(status == 201 and headers.get('docker-content-digest') == descriptor['digest'],
             'CA_MANIFEST_UPLOAD_UNCERTAIN')
        observed = self.manifest(reference)
        need(observed is not None and observed['raw'] == raw
             and observed['mediaType'] == descriptor['mediaType'], 'CA_MANIFEST_REWRITTEN')


def descriptor(value, media_types):
    need(type(value) is dict and type(value.get('digest')) is str and DIGEST.fullmatch(value['digest'])
         and type(value.get('size')) is int and 0 < value['size'] <= 1024 * 1024 * 1024
         and value.get('mediaType') in media_types and 'urls' not in value and 'data' not in value,
         'CA_GRAPH_DESCRIPTOR_INVALID')


def collect_graph(registry, reference, directory, role, source, blob_cache=None):
    directory = Path(directory); directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    objects = {}; manifests = []
    blob_cache = {} if blob_cache is None else blob_cache
    top = registry.manifest(reference)
    need(top is not None, 'CA_GRAPH_MANIFEST_MISSING')
    descriptor(top, IMAGES | INDEXES)
    def save_manifest(item):
        need('sha256:' + sha(item['raw']) == item['digest'] and len(item['raw']) == item['size'],
             'CA_GRAPH_MANIFEST_CHANGED')
        value = decode(item['raw'])
        need(type(value) is dict and value.get('schemaVersion') == 2
             and value.get('mediaType') == item['mediaType'], 'CA_GRAPH_SCHEMA_INVALID')
        path = directory / item['digest'][7:]
        path.write_bytes(item['raw'])
        objects[item['digest']] = {'path': str(path), 'kind': 'manifest',
                                  **{k: item[k] for k in ('digest', 'size', 'mediaType')}}
        return value
    image = top; value = save_manifest(top)
    if top['mediaType'] in INDEXES:
        children = value.get('manifests')
        need(type(children) is list and len(children) == 1, 'CA_INDEX_SINGLE_PLATFORM_REQUIRED')
        child = children[0]; descriptor(child, IMAGES)
        need(child.get('platform') == {'os': 'linux', 'architecture': 'amd64'}, 'CA_CHILD_PLATFORM_INVALID')
        image = registry.manifest(child['digest'])
        need(image is not None and all(image[k] == child[k] for k in ('digest', 'size', 'mediaType')),
             'CA_CHILD_LINK_INVALID')
        value = save_manifest(image); manifests.append(image['digest'])
    need(image['mediaType'] in IMAGES and type(value.get('layers')) is list
         and 0 < len(value['layers']) <= 200, 'CA_IMAGE_LAYERS_INVALID')
    config_desc = value.get('config'); descriptor(config_desc, CONFIGS)
    for item in [config_desc, *value['layers']]:
        descriptor(item, CONFIGS if item is config_desc else LAYERS)
        if item['digest'] in objects:
            need(all(objects[item['digest']][k] == item[k] for k in ('size', 'mediaType')), 'CA_SHARED_BLOB_MISMATCH')
            continue
        if item['digest'] in blob_cache:
            cached = blob_cache[item['digest']]
            need(all(cached[k] == item[k] for k in ('size', 'mediaType'))
                 and file_digest(cached['path']) == item['digest'], 'CA_CACHED_BLOB_CHANGED')
            objects[item['digest']] = cached
            continue
        need(sum(entry['size'] for entry in blob_cache.values()) + item['size'] <= 8 * 1024 ** 3,
             'CA_TOTAL_PRIVATE_BLOB_LIMIT')
        path = directory / item['digest'][7:]
        registry.blob(item, path)
        objects[item['digest']] = {**item, 'kind': 'blob', 'path': str(path)}
        blob_cache[item['digest']] = objects[item['digest']]
    config = decode(Path(objects[config_desc['digest']]['path']).read_bytes())
    labels = config.get('config', {}).get('Labels', {})
    need(config.get('os') == 'linux' and config.get('architecture') == 'amd64'
         and config.get('rootfs', {}).get('type') == 'layers'
         and len(config['rootfs'].get('diff_ids', [])) == len(value['layers'])
         and all(type(d) is str and DIGEST.fullmatch(d) for d in config['rootfs']['diff_ids'])
         and labels.get('org.opencontainers.image.source') == 'https://github.com/planner77/layoutManager'
         and labels.get('org.opencontainers.image.revision') == source
         and labels.get('org.opencontainers.image.version') == '0.61.0'
         and labels.get('com.planner77.g7.image-role') == role, 'CA_CONFIG_SOURCE_ROLE_INVALID')
    manifests.append(top['digest'])
    return {'digest': top['digest'], 'manifestDigest': image['digest'],
            'configDigest': config_desc['digest'], 'config': config,
            'topDescriptor': {k: top[k] for k in ('digest', 'size', 'mediaType')},
            'manifestDescriptor': {k: image[k] for k in ('digest', 'size', 'mediaType')},
            'layers': [item['digest'] for item in value['layers']], 'objects': objects,
            'manifestOrder': manifests}


def same_graph(left, right):
    need(all(left[k] == right[k] for k in ('digest', 'manifestDigest', 'configDigest',
             'topDescriptor', 'manifestDescriptor', 'layers')), 'CA_REGISTRY_GRAPH_CHANGED')


def publish_set(registry, graphs, expected, verify_remote):
    refs = tags(expected)
    if hasattr(registry, 'bind_graphs'):
        registry.bind_graphs(graphs, expected)
    # Read all three first; unknown/auth/network throws, never becomes absence.
    observed = {role: registry.manifest(ref) for role, ref in refs.items()}
    if all(item is not None for item in observed.values()):
        for role in ROLES:
            need(observed[role]['digest'] == graphs[role]['digest'], 'CA_EXISTING_CANDIDATE_MISMATCH')
            verify_remote(role, refs[role], graphs[role])
        # A prior tag may change during a later role's verification. This final
        # sequential observation detects changes; it is not CAS or a writer lock.
        for role in ROLES:
            present = registry.manifest(refs[role])
            need(present is not None and present['digest'] == graphs[role]['digest'], 'CA_FINAL_CANDIDATE_SET_CHANGED')
        return 'NO_OP'
    need(all(item is None for item in observed.values()), 'CA_PARTIAL_EXISTING_CANDIDATES')
    for role in ROLES:
        graph = graphs[role]
        for item in graph['objects'].values():
            if item['kind'] == 'blob':
                path = Path(item['path'])
                need(path.stat().st_size == item['size'] and file_digest(path) == item['digest'], 'CA_LOCAL_BLOB_CHANGED')
                registry.upload_blob(item, path)
        for digest in graph['manifestOrder'][:-1]:
            item = graph['objects'][digest]
            present = registry.manifest(digest)
            if present is None:
                registry.put_manifest(digest, item, Path(item['path']).read_bytes())
            else:
                need(present['digest'] == digest and present['mediaType'] == item['mediaType'], 'CA_CHILD_CONFLICT')
        need(registry.manifest(refs[role]) is None, 'CA_CANDIDATE_APPEARED')
        item = graph['objects'][graph['digest']]
        registry.put_manifest(refs[role], item, Path(item['path']).read_bytes())
        verify_remote(role, refs[role], graph)
    for role in ROLES:
        present = registry.manifest(refs[role])
        need(present is not None and present['digest'] == graphs[role]['digest'], 'CA_FINAL_CANDIDATE_SET_CHANGED')
    return 'CANDIDATES_VERIFIED'


def file_digest(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return 'sha256:' + digest.hexdigest()
