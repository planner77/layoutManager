#!/usr/bin/env python3
"""RF-01 durable GitHub issue-comment checkpoints; never a release authority.

The repository's existing RF-01/02/03 live verifiers supply evidence. This
module stores only bounded identifiers/hashes. All writes are explicit,
single-attempt Owner protected workflow operations; never publish GHCR.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.error
import urllib.request

import release_finalizer as rf

MARKER = "<!-- layoutmanager-finalizer-checkpoint-v1 -->\n"
STAGES = ("MAIN_VERIFIED", "CANDIDATE_VERIFIED", "PROMOTION_VERIFIED", "CLOSE_INTENT")
KIND = "RF_FINALIZER_DURABLE_CHECKPOINT_V1"
BOT_ID = 41898282  # github-actions[bot] for GITHUB_TOKEN, not Owner approval
MAX_COMMENTS = 1000
FIELDS = frozenset(("kind", "repositoryId", "issueNumber", "prNumber",
                    "identitySha256", "sequence", "stage", "nonce",
                    "requestNonceSha256", "packetSha256", "previousSha256",
                    "runId", "runAttempt",
                    "mainSha", "evidenceSha256"))
HEX64 = re.compile(r"[0-9a-f]{64}\Z")


def need(value, code):
    rf.need(value, code)


def canonical(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("ascii")


def sha(value):
    return hashlib.sha256(value).hexdigest()


def identity(packet, main_sha):
    need(type(main_sha) is str and rf.HEX40.fullmatch(main_sha),
         "RFCP_MAIN_SHA_INVALID")
    return sha(canonical({
        "repositoryId": rf.REPO_ID, "issueNumber": packet["issueNumber"],
        "prNumber": packet["prNumber"], "prHeadSha": packet["prHeadSha"],
        "prTreeSha": packet["prTreeSha"], "baseSha": packet["baseSha"],
        "mainSha": main_sha, "version": packet["version"],
        "roles": packet["roles"],
    }))


def decode_json(raw):
    need(type(raw) is bytes and 0 < len(raw) <= 32768, "RFCP_JSON_SIZE_INVALID")
    try:
        return json.loads(raw, object_pairs_hook=rf.unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(
                              rf.Blocked("RFCP_JSON_CONSTANT_INVALID")))
    except rf.Blocked:
        raise
    except (ValueError, UnicodeError, TypeError, RecursionError):
        raise rf.Blocked("RFCP_JSON_INVALID") from None


def stage_nonce(packet, stage):
    return sha((packet["nonce"] + ":" + stage).encode())[:32]


def encode_event(event):
    need(type(event) is dict and set(event) == FIELDS
         and event["kind"] == KIND and event["repositoryId"] == rf.REPO_ID
         and type(event["issueNumber"]) is int and event["issueNumber"] > 0
         and type(event["prNumber"]) is int and event["prNumber"] > 0
         and type(event["sequence"]) is int and 1 <= event["sequence"] <= 4
         and event["stage"] == STAGES[event["sequence"]-1]
         and type(event["nonce"]) is str and rf.HEX32.fullmatch(event["nonce"])
         and all(type(event[k]) is str and HEX64.fullmatch(event[k])
                 for k in ("identitySha256", "requestNonceSha256", "packetSha256", "evidenceSha256"))
         and (event["previousSha256"] is None or (
             type(event["previousSha256"]) is str and
             HEX64.fullmatch(event["previousSha256"])))
         and type(event["mainSha"]) is str and rf.HEX40.fullmatch(event["mainSha"])
         and type(event["runId"]) is int and event["runId"] > 0
         and type(event["runAttempt"]) is int and event["runAttempt"] == 1,
         "RFCP_EVENT_FIELDS_INVALID")
    return canonical(event)


def comment_body(event):
    return MARKER + encode_event(event).decode("ascii")


def parse_comment(item):
    need(type(item) is dict and type(item.get("body")) is str
         and item["body"].startswith(MARKER)
         and type(item.get("user")) is dict
         and item["user"].get("id") == BOT_ID
         and type(item.get("id")) is int and item["id"] > 0,
         "RFCP_COMMENT_AUTHORITY_INVALID")
    event = decode_json(item["body"][len(MARKER):].encode("utf-8"))
    encode_event(event)
    return event, sha(canonical(event))


def chain(comments, packet, main_sha):
    """Reject partial, reordered, duplicate, foreign or edited checkpoints."""
    need(type(comments) is list and len(comments) <= MAX_COMMENTS,
         "RFCP_COMMENT_PAGE_UNVERIFIED")
    identity_sha = identity(packet, main_sha)
    checkpoint_items = [x for x in comments
                        if type(x) is dict and
                        type(x.get("body")) is str and
                        x["body"].startswith(MARKER)]
    seen_nonces, seen_runs, seen_requests, previous = set(), {}, {}, None
    last_id, events = 0, []
    for item in checkpoint_items:
        need(type(item.get("id")) is int and item["id"] > last_id,
             "RFCP_COMMENT_ORDER_OR_DUPLICATE")
        last_id = item["id"]
        event, digest = parse_comment(item)
        need(event["issueNumber"] == packet["issueNumber"]
             and event["prNumber"] == packet["prNumber"]
             and event["identitySha256"] == identity_sha
             and event["mainSha"] == main_sha
             and event["sequence"] == len(events)+1
             and event["previousSha256"] == previous
             and event["nonce"] not in seen_nonces
             and (event["runId"] not in seen_runs or
                  seen_runs[event["runId"]] == event["packetSha256"])
             # Reissuing the same request nonce with changed timestamp or
             # JSON bytes is forbidden even when the packet SHA changes.
             # Several stages in one Owner-protected dispatch are allowed.
             and (event["requestNonceSha256"] not in seen_requests or
                  seen_requests[event["requestNonceSha256"]] ==
                  (event["runId"], event["packetSha256"])),
             "RFCP_CHAIN_CHANGED_OR_REPLAYED")
        seen_nonces.add(event["nonce"])
        seen_runs[event["runId"]] = event["packetSha256"]
        seen_requests[event["requestNonceSha256"]] = (
            event["runId"], event["packetSha256"])
        previous = digest
        events.append(event)
    return events, previous


def proposed_event(packet, packet_sha, main_sha, events, previous,
                   stage, proof, run_id):
    need(stage in STAGES and len(events) < len(STAGES)
         and stage == STAGES[len(events)]
         and type(packet_sha) is str and HEX64.fullmatch(packet_sha)
         and type(proof) is dict and len(canonical(proof)) <= 16000
         and type(run_id) is int and run_id > 0,
         "RFCP_STAGE_OR_PROOF_INVALID")
    # Validate the caller's immediate predecessor even before attempting a
    # remote append. The durable store also rechecks the entire chain.
    need(previous == (sha(encode_event(events[-1])) if events else None),
         "RFCP_PREVIOUS_CHECKPOINT_INVALID")
    if events:
        need(events[-1]["identitySha256"] == identity(packet, main_sha)
             and events[-1]["mainSha"] == main_sha,
             "RFCP_PREVIOUS_IDENTITY_CHANGED")
    nonce = stage_nonce(packet, stage)
    request_nonce = sha(packet["nonce"].encode("ascii"))
    need(all(e["nonce"] != nonce and
             (e["runId"] != run_id or e["packetSha256"] == packet_sha)
             and (e["requestNonceSha256"] != request_nonce or
                  (e["runId"] == run_id and
                   e["packetSha256"] == packet_sha))
             for e in events),
         "RFCP_NONCE_OR_RUN_REUSED")
    event = {
        "kind": KIND, "repositoryId": rf.REPO_ID,
        "issueNumber": packet["issueNumber"], "prNumber": packet["prNumber"],
        "identitySha256": identity(packet, main_sha),
        "sequence": len(events)+1, "stage": stage, "nonce": nonce,
        "requestNonceSha256": request_nonce,
        "packetSha256": packet_sha, "previousSha256": previous,
        "runId": run_id, "runAttempt": 1, "mainSha": main_sha,
        "evidenceSha256": sha(canonical(proof)),
    }
    encode_event(event)
    return event


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, url):
        return None


class IssueStore:
    """Fixed repository, one Issue, bounded API; no PATCH except state=closed."""
    def __init__(self, token, issue_number, request=None):
        need(type(token) is str and 0 < len(token) <= 4096
             and not any(x in token for x in "\r\n\0")
             and type(issue_number) is int and 0 < issue_number <= 2147483647,
             "RFCP_STORE_INPUT_INVALID")
        self.token, self.issue = token, issue_number
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect())
        self.injected = request

    def _call(self, method, path, body=None):
        allow = {("GET", f"/issues/{self.issue}"),
                 ("PATCH", f"/issues/{self.issue}"),
                 ("POST", f"/issues/{self.issue}/comments")}
        if re.fullmatch(rf"/issues/{self.issue}/comments\?per_page=100&page=(?:[1-9]|10)", path):
            allow.add(("GET", path))
        if re.fullmatch(r"/issues/comments/[1-9][0-9]{0,19}", path):
            allow.add(("GET", path))
        need((method, path) in allow, "RFCP_API_ROUTE_REFUSED")
        if method == "POST":
            need(type(body) is dict and set(body) == {"body"}
                 and type(body["body"]) is str and body["body"].startswith(MARKER),
                 "RFCP_COMMENT_WRITE_INVALID")
        if method == "PATCH":
            need(body == {"state": "closed", "state_reason": "completed"},
                 "RFCP_ISSUE_PATCH_REFUSED")
        raw = canonical(body) if body is not None else None
        if self.injected is not None:
            return self.injected(method, path, body)
        req = urllib.request.Request(
            "https://api.github.com/repos/" + rf.REPO + path,
            data=raw, method=method,
            headers={
                "Accept": "application/vnd.github+json",
                "Authorization": "Bearer " + self.token,
                "X-GitHub-Api-Version": "2022-11-28",
                **({"Content-Type": "application/json"} if raw is not None else {}),
            })
        try:
            with self.opener.open(req, timeout=20) as response:
                payload = response.read(2 * 1024 * 1024 + 1)
                need(response.status == (201 if method == "POST" else 200)
                     and 0 < len(payload) <= 2 * 1024 * 1024,
                     "RFCP_API_RESPONSE_INVALID")
                return decode_json(payload) if len(payload) <= 32768 else json.loads(payload)
        except rf.Blocked:
            raise
        except (OSError, TimeoutError, ValueError, UnicodeError, RecursionError):
            # Never retry ambiguous POST/PATCH; operator must read-only reconcile.
            raise rf.Blocked("RFCP_REMOTE_RESULT_UNCERTAIN_NO_RETRY") from None

    def issue_read(self):
        value = self._call("GET", f"/issues/{self.issue}")
        need(type(value) is dict and value.get("number") == self.issue
             and "pull_request" not in value
             and value.get("state") in ("open", "closed"),
             "RFCP_ISSUE_UNVERIFIED")
        return value

    def comments(self):
        results = []
        for page in range(1, 11):
            items = self._call(
                "GET", f"/issues/{self.issue}/comments?per_page=100&page={page}")
            need(type(items) is list and len(items) <= 100,
                 "RFCP_COMMENT_PAGE_UNVERIFIED")
            results.extend(items)
            need(len(results) <= MAX_COMMENTS, "RFCP_COMMENT_LIMIT")
            if len(items) < 100:
                return results
        raise rf.Blocked("RFCP_COMMENTS_INCOMPLETE")

    def append(self, event, packet, main_sha):
        need(self.issue_read()["state"] == "open", "RFCP_ISSUE_NOT_OPEN")
        old, digest = chain(self.comments(), packet, main_sha)
        need(event["sequence"] == len(old)+1
             and event["previousSha256"] == digest
             and event["requestNonceSha256"] ==
                 sha(packet["nonce"].encode("ascii")),
             "RFCP_CONCURRENT_CHECKPOINT_CHANGED")
        result = self._call("POST", f"/issues/{self.issue}/comments",
                            {"body": comment_body(event)})
        need(type(result) is dict and result.get("body") == comment_body(event)
             and result.get("user", {}).get("id") == BOT_ID
             and type(result.get("id")) is int,
             "RFCP_POST_UNCERTAIN_NO_RETRY")
        copied = self._call("GET", f"/issues/comments/{result['id']}")
        need(copied == result, "RFCP_POST_READBACK_UNCERTAIN")
        current, latest = chain(self.comments(), packet, main_sha)
        need(len(current) == len(old)+1 and latest == sha(canonical(event))
             and current[-1] == event,
             "RFCP_POST_LEDGER_DRIFT")
        return latest

    def close_once(self, packet, main_sha, close_hash):
        events, latest = chain(self.comments(), packet, main_sha)
        need(len(events) == len(STAGES) and events[-1]["stage"] == "CLOSE_INTENT"
             and latest == close_hash
             and self.issue_read()["state"] == "open",
             "RFCP_CLOSE_INTENT_MISSING_OR_ALREADY_USED")
        result = self._call("PATCH", f"/issues/{self.issue}",
                            {"state": "closed", "state_reason": "completed"})
        need(type(result) is dict and result.get("number") == self.issue
             and result.get("state") == "closed",
             "RFCP_CLOSE_RESPONSE_UNCERTAIN")
        observed = self.issue_read()
        need(observed.get("state") == "closed"
             and observed.get("state_reason") == "completed"
             and observed.get("closed_at") is not None,
             "RFCP_CLOSE_READBACK_UNCERTAIN")
        return {"kind": "RF04_ISSUE_CLOSE_READBACK_V1", "issueNumber": self.issue,
                "checkpointSha256": close_hash, "state": "CLOSED_READBACK",
                "externalWrites": 1}


def runtime(env, workflow):
    need(env.get("GITHUB_REPOSITORY") == rf.REPO
         and env.get("GITHUB_REPOSITORY_ID") == str(rf.REPO_ID)
         and env.get("GITHUB_REPOSITORY_OWNER_ID") == str(rf.OWNER_ID)
         and env.get("GITHUB_ACTOR_ID") == str(rf.OWNER_ID)
         and env.get("RF_SENDER_ID") == str(rf.OWNER_ID)
         and env.get("GITHUB_TRIGGERING_ACTOR") == env.get("GITHUB_ACTOR")
         and env.get("GITHUB_REF") == "refs/heads/main"
         and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
         and env.get("GITHUB_RUN_ATTEMPT") == "1"
         and env.get("GITHUB_WORKFLOW_REF") == rf.REPO + "/" + workflow + "@refs/heads/main"
         and type(env.get("GITHUB_RUN_ID")) is str
         and re.fullmatch(r"[1-9][0-9]{0,19}", env["GITHUB_RUN_ID"])
         and env.get("GITHUB_WORKFLOW_SHA") == env.get("GITHUB_SHA")
         and type(env.get("GITHUB_SHA")) is str
         and rf.HEX40.fullmatch(env["GITHUB_SHA"]),
         "RFCP_OWNER_CONTEXT_INVALID")
    return int(env["GITHUB_RUN_ID"])
