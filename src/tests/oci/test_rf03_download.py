#!/usr/bin/env python3
"""RF-03 original GitHub ZIP downloader unit tests, no network or secrets."""
import hashlib
import io
from pathlib import Path
import tempfile
import unittest

import release_finalizer as rf
import rf03_download as dl

CDN = "https://productionresultssa1.blob.core.windows.net/artifact/once.zip?sig=synthetic"


class Response(io.BytesIO):
    def __init__(self, status, headers=None, body=b""):
        super().__init__(body); self.status = status
        self.headers = headers or {}


class Fake:
    def __init__(self, archive=b"zip bytes synthetic", cdn=CDN, *, first=302,
                 second=200):
        self.bytes, self.cdn, self.first, self.second = archive, cdn, first, second
        self.calls = []
    def __call__(self, method, url, headers):
        self.calls.append((method, url, dict(headers)))
        if len(self.calls) == 1:
            return Response(self.first, {"location": self.cdn})
        if len(self.calls) == 2:
            return Response(self.second, {}, self.bytes)
        raise AssertionError("NO_RETRY_ALLOWED")


class DownloadTests(unittest.TestCase):
    def test_original_sha_and_no_auth_to_cdn(self):
        data = b"synthetic zip original"
        request = Fake(data)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "candidate-original.zip"
            verdict = dl.download(
                12345, len(data), "sha256:"+hashlib.sha256(data).hexdigest(),
                "synthetic-read-token", output, request=request)
            self.assertEqual(verdict["externalWrites"], 0)
            self.assertEqual(verdict["sha256"],
                             "sha256:"+hashlib.sha256(data).hexdigest())
            self.assertEqual(output.read_bytes(), data)
            self.assertEqual(len(request.calls), 2)
            self.assertIn("Authorization", request.calls[0][2])
            self.assertEqual(request.calls[1][2], {})
            self.assertIn("/actions/artifacts/12345/zip", request.calls[0][1])
            with self.assertRaisesRegex(rf.Blocked,
                                        "RF03_ARTIFACT_DOWNLOAD_OUTPUT_INVALID"):
                dl.download(12345, len(data),
                            "sha256:"+hashlib.sha256(data).hexdigest(),
                            "synthetic-read-token", output, request=Fake(data))

    def test_cdn_strict_allowlist(self):
        for valid in (
            CDN,
            "https://objects.githubusercontent.com/path?access=opaque",
            "https://pipelines.actions.githubusercontent.com/signed?token=x",
        ):
            self.assertEqual(dl.safe_cdn_location(valid), valid)
        for invalid in (
            "http://productionresultssa1.blob.core.windows.net/a?x=1",
            "https://evil.example.com/a?x=1",
            "https://productionresultssa1.blob.core.windows.net.evil.test/a?x=1",
            "https://user:pwd@objects.githubusercontent.com/a?x=1",
            "https://objects.githubusercontent.com/a",
            "https://objects.githubusercontent.com/a?x=1#fragment",
            "https://objects.githubusercontent.com:444/a?x=1",
            "https://objects.githubusercontent.com/a?x=1\nInjected",
        ):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(
                    rf.Blocked, "RF03_ARTIFACT_CDN_URL_INVALID"):
                dl.safe_cdn_location(invalid)

    def test_wrong_archive_size_sha_or_http_stops(self):
        archive = b"synthetic zip"
        digest = "sha256:" + hashlib.sha256(archive).hexdigest()
        for mode in ("size", "digest", "api403", "cdn401", "cdn-extra"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temp:
                if mode == "api403":
                    req = Fake(archive, first=403)
                elif mode == "cdn401":
                    req = Fake(archive, second=401)
                elif mode == "cdn-extra":
                    req = Fake(archive+b"x")
                else:
                    req = Fake(archive)
                size = len(archive)-1 if mode == "size" else len(archive)
                sha = "sha256:"+"f"*64 if mode == "digest" else digest
                with self.assertRaises(rf.Blocked):
                    dl.download(99, size, sha, "token",
                                Path(temp)/"target.zip", request=req)
                self.assertLessEqual(len(req.calls), 2)

    def test_rejects_invalid_source_and_no_retry(self):
        for aid, token in ((0, "token"), (123, ""), (12, "x\nhello")):
            with tempfile.TemporaryDirectory() as temp:
                with self.assertRaisesRegex(
                        rf.Blocked, "RF03_ARTIFACT_DOWNLOAD_INPUT_INVALID"):
                    dl.download(aid, 10, "sha256:"+"a"*64, token,
                                Path(temp)/"archive", request=Fake())


if __name__ == "__main__":
    unittest.main()
