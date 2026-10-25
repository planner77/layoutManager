#!/usr/bin/env python3
"""Disposable image runtime API CRUD across a migration + app restart."""
import argparse
from datetime import date
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
import uuid

DRAWING = b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"


def request(base, verb, path, content=None, content_type=None):
    headers = {"Content-Type": content_type} if content_type else {}
    req = urllib.request.Request(base.rstrip("/") + path, data=content, headers=headers, method=verb)
    with urllib.request.urlopen(req, timeout=15) as response:
        return response.status, response.read()


def api(base, verb, path, data=None):
    content = json.dumps(data).encode() if data is not None else None
    status, body = request(base, verb, path, content, "application/json" if content else None)
    return status, json.loads(body)


def multipart(fields, filename):
    boundary = "ci67-" + uuid.uuid4().hex
    payload = bytearray()
    for key, value in fields.items():
        payload.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    payload.extend((f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
                    f'filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode())
    payload.extend(DRAWING)
    payload.extend(f'\r\n--{boundary}--\r\n'.encode())
    return bytes(payload), f"multipart/form-data; boundary={boundary}"


def create(base, state_path):
    status, health = api(base, "GET", "/api/health")
    assert (status, health) == (200, {"status": "ok"})
    token = uuid.uuid4().hex[:12]
    parent = None
    ids = {}
    for type_name, name in (("business-units", f"CI67-{token}"),
                            ("products", "CI67-P"), ("sites", "CI67-S"),
                            ("buildings", "CI67-B"), ("floors", "CI67-F")):
        body = {"type": type_name, "name": name}
        if parent:
            body["parentId"] = parent
        if type_name == "sites":
            body["kind"] = "SITE"
        status, result = api(base, "POST", "/api/masters", body)
        assert status == 201 and result.get("id"), (status, result)
        parent = ids[type_name] = result["id"]
    filename = f"ci67-{token}.dxf"
    fields = {
        "businessUnitId": ids["business-units"], "productId": ids["products"],
        "siteId": ids["sites"], "buildingId": ids["buildings"], "floorId": ids["floors"],
        "registeredAt": date.today().isoformat(), "makeCurrent": "true", "deletePassword": "1234",
    }
    body, ctype = multipart(fields, filename)
    status, raw = request(base, "POST", "/api/cad-files", body, ctype)
    result = json.loads(raw)
    assert status == 201 and result.get("id") and result.get("locationId"), (status, result)
    state_path.write_text(json.dumps({"id": result["id"], "locationId": result["locationId"], "name": filename}))
    print("Docker /data API CREATE success; application still must pass restart + GET + DELETE")


def verify_delete(base, state_path):
    item = json.loads(state_path.read_text())
    status, health = api(base, "GET", "/api/health")
    assert (status, health) == (200, {"status": "ok"})
    version_id = urllib.parse.quote(item["id"], safe="")
    status, content = request(base, "GET", f"/api/cad-files/{version_id}/content")
    assert status == 200 and content == DRAWING
    status, location = api(base, "GET", f"/api/cad-locations/{item['locationId']}")
    assert status == 200 and any(v["id"] == item["id"] for v in location["versions"])
    filename = urllib.parse.quote(item["name"], safe="")
    status, listing = api(base, "GET", f"/api/cad-files?filename={filename}&current=true")
    assert status == 200 and any(v["id"] == item["id"] for v in listing["items"])
    status, result = api(base, "DELETE", f"/api/cad-files/{version_id}", {"password": "1234"})
    assert status == 200 and result.get("deleted") is True and not result.get("cleanupPending"), (status, result)
    try:
        request(base, "GET", f"/api/cad-files/{version_id}/content")
    except urllib.error.HTTPError as error:
        assert error.code == 404
    else:
        raise AssertionError("Deleted CAD remains downloadable")
    state_path.unlink()
    print("Docker /data persisted across migrator rerun and restart; API CRUD/content cleanup PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["create", "verify-delete"])
    parser.add_argument("base_url")
    parser.add_argument("state_file", type=Path)
    args = parser.parse_args()
    (create if args.phase == "create" else verify_delete)(args.base_url, args.state_file)
