#!/usr/bin/env python3
"""#109 disposable Docker Greenfield HTTP smoke: setup, RBAC, CAD, restart, persistence."""
import argparse
import base64
from datetime import date
import http.cookiejar
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
import uuid

DXF = b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"
INITIAL = "synthetic-bootstrap-password-109"
PASSWORD = "synthetic-changed-password-109"


class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = None

    def call(self, method, path, payload=None, content_type=None, extra=None):
        headers = {"Origin": self.base}
        if content_type:
            headers["Content-Type"] = content_type
        if self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        headers.update(extra or {})
        req = urllib.request.Request(self.base + path, data=payload, method=method, headers=headers)
        try:
            with self.opener.open(req, timeout=15) as res:
                return res.status, res.read(), dict(res.headers)
        except urllib.error.HTTPError as err:
            return err.code, err.read(), dict(err.headers)

    def json(self, method, path, data=None, extra=None):
        payload = json.dumps(data).encode() if data is not None else None
        status, body, headers = self.call(method, path, payload,
                                           "application/json" if payload else None, extra)
        return status, json.loads(body), headers

    def login(self):
        status, result, _ = self.json("POST", "/api/g7-runtime/auth/login",
                                      {"login": "admin", "password": PASSWORD})
        assert status == 200 and result.get("csrfToken"), (status, result)
        status, result, _ = self.json("GET", "/api/g7-runtime/auth/session")
        assert status == 200 and result.get("actor"), (status, result)
        self.csrf = result["csrfToken"]
        return result["actor"]["id"]


def multipart(fields, filename):
    boundary = "ci109-" + uuid.uuid4().hex
    content = bytearray()
    for key, value in fields.items():
        content.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    content.extend((f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                    'Content-Type: application/octet-stream\r\n\r\n').encode())
    content.extend(DXF)
    content.extend(f'\r\n--{boundary}--\r\n'.encode())
    return bytes(content), "multipart/form-data; boundary=" + boundary


def create(base, filename):
    code = os.environ.get("G7_CI_FIRST_SETUP_CODE", "")
    assert len(code) == 43, "first setup code must come from disposable Docker host volume"
    cli = Client(base)
    status, value, _ = cli.json("GET", "/api/g7-runtime/status")
    assert status == 200 and value == {"state": "ACTIVE", "authEnabled": True, "cadWriteEnabled": True}
    status, state, _ = cli.json("GET", "/api/g7-runtime/setup")
    assert status == 200 and state.get("state") == "SETUP_REQUIRED", (status, state)
    setup = {"login": "admin", "password": INITIAL, "code": code}
    status, bad, _ = cli.json("POST", "/api/g7-runtime/setup", setup,
                              {"X-Setup-CSRF": "forged"})
    assert status == 403 and bad["error"]["code"] == "SETUP_CSRF_DENIED"
    status, completed, _ = cli.json("POST", "/api/g7-runtime/setup", setup,
                                    {"X-Setup-CSRF": state["csrfToken"]})
    assert status == 201 and completed["state"] == "SETUP_COMPLETE", (status, completed)
    status, _, _ = cli.json("POST", "/api/g7-runtime/setup", setup,
                            {"X-Setup-CSRF": state["csrfToken"]})
    assert status == 404
    status, _, _ = cli.json("POST", "/api/g7-runtime/auth/initial-change",
                            {"login": "admin", "password": INITIAL, "newPassword": PASSWORD})
    assert status == 200, status
    actor = cli.login()
    tag = uuid.uuid4().hex[:12]
    parent = None
    ids = {}
    for name, title in (("business-units", "CI109-" + tag), ("products", "Product"),
                        ("sites", "Site"), ("buildings", "Building"), ("floors", "Floor")):
        payload = {"type": name, "name": title}
        if parent:
            payload["parentId"] = parent
        if name == "sites":
            payload["kind"] = "SITE"
        status, row, _ = cli.json("POST", "/api/masters", payload)
        assert status == 201 and row.get("id"), (name, status, row)
        parent = ids[name] = row["id"]
    status, granted, _ = cli.json("POST", "/api/g7-runtime/access/grant",
                                 {"kind": "site", "operation": "grant",
                                  "affectedUserId": actor, "value": ids["sites"]})
    assert status == 200, (status, granted)
    name = "ci109-" + tag + ".dxf"
    fields = {"businessUnitId": ids["business-units"], "productId": ids["products"],
              "siteId": ids["sites"], "buildingId": ids["buildings"], "floorId": ids["floors"],
              "registeredAt": date.today().isoformat(), "makeCurrent": "true",
              "deletePassword": "1234"}
    body, content_type = multipart(fields, name)
    status, content, _ = cli.call("POST", "/api/cad-files", body, content_type)
    response = json.loads(content)
    assert status == 201 and response.get("id") and response.get("locationId"), (status, response)
    filename.write_text(json.dumps({"id": response["id"], "locationId": response["locationId"], "name": name}))
    print("G7_GREENFIELD_DOCKER_CREATE_PASS")


def verify(base, filename):
    cli = Client(base)
    status, _, _ = cli.json("GET", "/api/health")
    assert status == 200
    cli.login()
    status, _, _ = cli.json("GET", "/api/g7-runtime/setup")
    assert status == 404, "First Admin setup must remain closed after Docker restart"
    item = json.loads(filename.read_text())
    identifier = urllib.parse.quote(item["id"], safe="")
    status, content, _ = cli.call("GET", "/api/cad-files/" + identifier + "/content")
    assert status == 200 and content == DXF
    status, document, _ = cli.json("GET", "/api/cad-locations/" + item["locationId"])
    assert status == 200 and any(x["id"] == item["id"] for x in document["versions"])
    status, result, _ = cli.json("DELETE", "/api/cad-files/" + identifier, {"password": "1234"})
    assert status == 200 and result.get("deleted") is True, (status, result)
    filename.unlink()
    print("G7_GREENFIELD_DOCKER_RESTART_PERSISTENCE_DELETE_PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("create", "verify"))
    parser.add_argument("url")
    parser.add_argument("state", type=Path)
    args = parser.parse_args()
    (create if args.phase == "create" else verify)(args.url, args.state)
