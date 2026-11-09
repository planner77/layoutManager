#!/usr/bin/env python3
"""RF-03 original GitHub artifact ZIP download, authenticated API then no-auth CDN.

Only an already validated exact artifact ID is accepted. Never follow automatic
redirects, copy GitHub Authorization to CDN, retry an uncertain response, or
persist signed redirect URLs in diagnostics. No GHCR/Tag/Issue mutation.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

import release_finalizer as rf
import rf03_candidate_archive as archive

CHUNK = 64 * 1024
API_ORIGIN = "https://api.github.com"
ALLOWED_CDN = ("objects.githubusercontent.com", "pipelines.actions.githubusercontent.com")


def require(ok, code):
    rf.need(ok, code)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def open_checked(method, url, headers):
    """One HTTP operation, no ambient cookie/proxy or automatic redirects."""
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), NoRedirect())
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        return opener.open(req, timeout=45)
    except urllib.error.HTTPError as error:
        return error
    except (OSError, TimeoutError):
        raise rf.Blocked("RF03_ARTIFACT_DOWNLOAD_UNCERTAIN") from None


def safe_cdn_location(value):
    require(type(value) is str and len(value) <= 16384
            and not re.search(r"[\x00-\x20\x7f\\]", value)
            and "#" not in value, "RF03_ARTIFACT_CDN_URL_INVALID")
    try:
        target = urllib.parse.urlsplit(value)
        host = target.hostname or ""
        allowed = (host in ALLOWED_CDN or
                   (host.endswith(".blob.core.windows.net") and
                    len(host) > len(".blob.core.windows.net")))
        require(target.scheme == "https" and target.port in (None, 443)
                and allowed and target.username is None
                and target.password is None and target.query
                and target.path.startswith("/") and not target.fragment,
                "RF03_ARTIFACT_CDN_URL_INVALID")
    except (ValueError, AttributeError):
        raise rf.Blocked("RF03_ARTIFACT_CDN_URL_INVALID") from None
    return value


def download(artifact_id, expected_size, expected_digest, token, output,
             *, request=open_checked):
    """Validate response chain and original SHA256; no retries on uncertainty.

    The precondition is verified separately by rf03_live_evidence.audit_candidate.
    A successful standalone call is *not* evidence of Owner approval.
    """
    require(type(artifact_id) is int and 0 < artifact_id <= 2**63-1
            and type(expected_size) is int
            and 0 < expected_size <= archive.ARCHIVE_LIMIT
            and type(expected_digest) is str
            and re.fullmatch(r"sha256:[0-9a-f]{64}", expected_digest)
            and type(token) is str and 0 < len(token) <= 4096
            and not any(c in token for c in "\r\n\0"),
            "RF03_ARTIFACT_DOWNLOAD_INPUT_INVALID")
    output = Path(output)
    require(output.parent.is_dir() and not output.parent.is_symlink()
            and not output.exists() and not output.is_symlink(),
            "RF03_ARTIFACT_DOWNLOAD_OUTPUT_INVALID")
    api_url = (API_ORIGIN + "/repos/" + rf.REPO +
               "/actions/artifacts/" + str(artifact_id) + "/zip")
    first = request("GET", api_url, {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28"})
    with first:
        require(first.status == 302, "RF03_ARTIFACT_DOWNLOAD_REDIRECT_INVALID")
        redirect = safe_cdn_location(first.headers.get("location"))
    # Never send GitHub bearer to a cross-origin storage endpoint.
    response = request("GET", redirect, {})
    with response:
        require(response.status == 200, "RF03_ARTIFACT_CDN_NOT_SUCCESS")
        digest, count = hashlib.sha256(), 0
        flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            with os.fdopen(os.open(output, flags, 0o600), "wb") as dest:
                while True:
                    block = response.read(CHUNK)
                    if not block:
                        break
                    count += len(block)
                    require(count <= expected_size,
                            "RF03_ARTIFACT_DOWNLOAD_BYTES_EXCEEDED")
                    digest.update(block)
                    dest.write(block)
                dest.flush()
                os.fsync(dest.fileno())
        except rf.Blocked:
            raise
        except (OSError, TimeoutError):
            raise rf.Blocked("RF03_ARTIFACT_DOWNLOAD_UNCERTAIN") from None
    require(count == expected_size and
            "sha256:" + digest.hexdigest() == expected_digest and
            archive.archive_digest(output, expected_size) == expected_digest,
            "RF03_ARTIFACT_DOWNLOAD_DIGEST_INVALID")
    return {"kind": "RF03_ORIGINAL_ARCHIVE_DOWNLOADED_V1",
            "artifactId": artifact_id, "size": count, "sha256": expected_digest,
            "status": "BYTES_MATCHED_NOT_OWNER_GO", "externalWrites": 0}
