#!/usr/bin/env python3
"""Read-only Owner-triggered RF-03 GitHub run/review/artifact evidence audit.

Neither a successful process exit nor a matching approval history is a
signature, OCI graph, registry publication, or release authorization.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request

import release_finalizer as rf
import rf03_release_handoff as handoff
import rf03_live_evidence as live


def check_context(env):
    rf.need(env.get("GITHUB_REPOSITORY") == rf.REPO
            and env.get("GITHUB_REPOSITORY_ID") == str(rf.REPO_ID)
            and env.get("GITHUB_REPOSITORY_OWNER_ID") == str(rf.OWNER_ID)
            and env.get("GITHUB_ACTOR_ID") == str(rf.OWNER_ID)
            and env.get("RF03_SENDER_ID") == str(rf.OWNER_ID)
            and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
            and env.get("GITHUB_REF") == "refs/heads/main"
            and env.get("GITHUB_RUN_ATTEMPT") == "1"
            and type(env.get("GITHUB_SHA")) is str
            and rf.HEX40.fullmatch(env["GITHUB_SHA"]) is not None
            and env.get("GITHUB_WORKFLOW_SHA") == env["GITHUB_SHA"],
            "RF03_EVIDENCE_CONTEXT_INVALID")


def parse_inputs(env):
    packet = handoff.parse(
        env.get("RF03_HANDOFF_JSON", "").encode("utf-8"),
        env.get("RF03_HANDOFF_SHA256", ""))
    plan = handoff.parse(
        env.get("RF03_PRIOR_PLAN_JSON", "").encode("utf-8"),
        env.get("RF03_PRIOR_PLAN_SHA256", ""))
    rf.need(type(packet) is dict and type(plan) is dict,
            "RF03_EVIDENCE_INPUT_INVALID")
    rf.need(packet.get("promotionSourceCommit") == env["GITHUB_SHA"],
            "RF03_EVIDENCE_WORKFLOW_SOURCE_DRIFT")
    return packet, plan


class SafeReadOnlyGitHub:
    """Only exact repository API paths, GET and NO cross-origin redirects."""

    ALLOWED = (
        re.compile(r"/git/ref/heads/main\Z"),
        re.compile(r"/git/commits/[0-9a-f]{40}\Z"),
        re.compile(r"/contents/src/package\.json\?ref=[0-9a-f]{40}\Z"),
        re.compile(r"/actions/runs/[1-9][0-9]{0,19}/attempts/1\Z"),
        re.compile(r"/actions/runs/[1-9][0-9]{0,19}/attempts/1/jobs\?per_page=100\Z"),
        re.compile(r"/actions/runs/[1-9][0-9]{0,19}/approvals\Z"),
        re.compile(r"/actions/artifacts/[1-9][0-9]{0,19}\Z"),
        re.compile(r"/actions/runs/[1-9][0-9]{0,19}/artifacts\?per_page=100\Z"),
        re.compile(r"/environments/issue225-candidate-publish\Z"),
    )

    def __init__(self, token):
        rf.need(type(token) is str and bool(token), "RF03_READ_TOKEN_MISSING")
        self.token = token

    def get(self, path):
        rf.need(type(path) is str
                and any(p.fullmatch(path) for p in self.ALLOWED),
                "RF03_API_PATH_REJECTED")
        req = urllib.request.Request(
            "https://api.github.com/repos/" + rf.REPO + path,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": "Bearer " + self.token,
                "X-GitHub-Api-Version": "2022-11-28",
            }, method="GET")

        class RejectRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, request, fp, code, msg, headers, url):
                return None

        opener = urllib.request.build_opener(RejectRedirect)
        try:
            with opener.open(req, timeout=15) as response:
                raw = response.read(rf.MAX_API_RESPONSE + 1)
                rf.need(response.status == 200
                        and len(raw) <= rf.MAX_API_RESPONSE,
                        "RF03_API_RESPONSE_INVALID")
                return json.loads(raw, object_pairs_hook=handoff.unique)
        except (OSError, ValueError, UnicodeError, RecursionError):
            raise rf.Blocked("RF03_API_READ_UNVERIFIED") from None


def main():
    try:
        rf.need(sys.argv[1:] == ["readback"], "RF03_EVIDENCE_MODE_INVALID")
        check_context(os.environ)
        packet, original_plan = parse_inputs(os.environ)
        result = live.audit(packet, original_plan,
                            SafeReadOnlyGitHub(os.getenv("RF_READ_TOKEN", "")))
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except rf.Blocked as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
