#!/usr/bin/env python3
"""RF-01 persistent checkpoint and RF-04 fail-closed Issue close regressions.

All readers/writers are synthetic. No GitHub, GHCR, secrets, environment
approval or real Issue mutation is performed by these tests.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import release_finalizer as rf
import release_finalizer_checkpoint as cp
import release_finalizer_finish as finalizer
import release_finalizer_release_proof as release_proof


MAIN = "d"*40
SHA = lambda x: hashlib.sha256(x).hexdigest()
AC = ["RF01", "RF02", "RF03", "RF04", "RF05", "RF06", "RF07"]
WORKFLOW = "planner77/layoutManager/" + finalizer.WORKFLOW + "@refs/heads/main"


def packet(nonce="e"*32):
    # Reuse the original RF-01 strict packet shape (no second permissive schema).
    from test_release_finalizer import packet as original
    p = original()
    p["issueNumber"], p["prNumber"] = 273, 277
    p["nonce"], p["acceptanceIds"] = nonce, list(AC)
    return p


def encoded_packet(p):
    raw = json.dumps(p, sort_keys=True, separators=(",", ":")).encode()
    return raw.decode(), SHA(raw)


def runtime(p, run_id="9001", **updates):
    raw, digest = encoded_packet(p)
    env = {
        "GITHUB_REPOSITORY": rf.REPO, "GITHUB_REPOSITORY_ID": str(rf.REPO_ID),
        "GITHUB_REPOSITORY_OWNER_ID": str(rf.OWNER_ID),
        "GITHUB_ACTOR_ID": str(rf.OWNER_ID), "RF_SENDER_ID": str(rf.OWNER_ID),
        "GITHUB_ACTOR": "planner77", "GITHUB_TRIGGERING_ACTOR": "planner77",
        "GITHUB_REF": "refs/heads/main", "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_RUN_ATTEMPT": "1", "GITHUB_WORKFLOW_REF": WORKFLOW,
        "GITHUB_SHA": MAIN, "GITHUB_WORKFLOW_SHA": MAIN,
        "GITHUB_RUN_ID": run_id,
        "RF_PACKET_JSON": raw, "RF_PACKET_SHA256": digest,
        "RF_EXPECTED_PREVIOUS_SHA256": "",
    }
    env.update(updates)
    return env


def main_evidence():
    return {"kind": "RFCP_EXACT_MAIN_PROOF_V1",
            "mainSha": MAIN, "prCiRunId": 737, "mainCiRunId": 29,
            "prHeadSha": "b"*40, "treeSha": "c"*40,
            "externalWrites": 0}


def issue_body(checked=True, wrong=False):
    state = "x" if checked else " "
    names = AC[:-1] + (["UNKNOWN"] if wrong else AC[-1:])
    return "## AC\n" + "\n".join(f"- [{state}] **{x}** acceptance" for x in names)


class SyntheticStore:
    def __init__(self, body=None):
        self.body = body if body is not None else issue_body()
        self.state = "open"; self.events = []; self.patch_count = 0

    def issue_read(self):
        return {"number": 273, "state": self.state, "body": self.body}

    def comments(self):
        return copy.deepcopy(self.events)

    def append(self, event, p, main):
        old, prev = cp.chain(self.events, p, main)
        assert event["sequence"] == len(old) + 1
        assert event["previousSha256"] == prev
        item = {"id": len(self.events)+10,
                "user": {"id": cp.BOT_ID},
                "body": cp.comment_body(event)}
        self.events.append(item)
        return cp.sha(cp.canonical(event))

    def close_once(self, p, main, digest):
        events, last = cp.chain(self.events, p, main)
        assert len(events) == 4 and last == digest
        assert self.state == "open"
        self.patch_count += 1
        self.state = "closed"
        return {"kind": "RF04_ISSUE_CLOSE_READBACK_V1", "issueNumber": 273,
                "checkpointSha256": digest, "state": "CLOSED_READBACK",
                "externalWrites": 1}


class GateTests(unittest.TestCase):
    def test_sequential_sha_chain_and_readable_recovery(self):
        p = packet(); psha = encoded_packet(p)[1]
        out = []; prev = None
        for stage in cp.STAGES:
            runid = 222 if stage == cp.STAGES[0] else 333
            ev = cp.proposed_event(p, psha, MAIN, out, prev, stage,
                                   {"proof": stage}, runid)
            out.append(ev)
            prev = cp.sha(cp.canonical(ev))
        comments = [{"id": 10+i, "user": {"id": cp.BOT_ID},
                     "body": cp.comment_body(ev)} for i, ev in enumerate(out)]
        found, readback = cp.chain(comments, p, MAIN)
        self.assertEqual(found, out)
        self.assertEqual(readback, prev)
        self.assertEqual(found[-1]["stage"], "CLOSE_INTENT")
        self.assertEqual([x["sequence"] for x in found], [1,2,3,4])

    def test_strict_nonce_replay_stale_prev_foreign_comment_and_tampering(self):
        p = packet(); psha = encoded_packet(p)[1]
        first = cp.proposed_event(p, psha, MAIN, [], None, "MAIN_VERIFIED", {},
                                  1001)
        comment = {"id": 10, "user": {"id": cp.BOT_ID},
                   "body": cp.comment_body(first)}
        for changed in (
            {**comment, "user": {"id": rf.OWNER_ID}},
            {**comment, "body": comment["body"].replace("MAIN_VERIFIED", "PROMOTION_VERIFIED")},
        ):
            with self.subTest(changed=changed), self.assertRaises(rf.Blocked):
                cp.chain([changed], p, MAIN)
        for changed_list in ([comment, comment], [
                {**comment, "id": 12},
                {**comment, "id": 11},
        ]):
            with self.assertRaises(rf.Blocked):
                cp.chain(changed_list, p, MAIN)
        with self.assertRaisesRegex(rf.Blocked, "RFCP_CHAIN_CHANGED_OR_REPLAYED"):
            cp.chain([comment], packet("f"*32).copy() | {"version":"0.62.0"}, MAIN)
        with self.assertRaises(rf.Blocked):
            cp.proposed_event(p, psha, MAIN, [first], "f"*64,
                              "CANDIDATE_VERIFIED", {}, 1002)
        with self.assertRaises(rf.Blocked):
            cp.proposed_event(p, psha, MAIN, [first],
                              cp.sha(cp.canonical(first)),
                              "PROMOTION_VERIFIED", {}, 1002)

    def test_owner_request_nonce_reissue_cannot_change_timestamps_or_json(self):
        original = packet()
        raw, original_sha = encoded_packet(original)
        first = cp.proposed_event(original, original_sha, MAIN, [], None,
                                  "MAIN_VERIFIED", {"proof": "main"}, 40001)
        prior = cp.sha(cp.canonical(first))
        # Reusing an Owner request nonce on another workflow_dispatch is
        # forbidden even if changing only a timestamp changes packet SHA.
        replay = copy.deepcopy(original)
        replay["issuedAtEpoch"] += 1
        replay["expiresAtEpoch"] += 1
        self.assertNotEqual(encoded_packet(replay)[1], original_sha)
        with self.assertRaisesRegex(rf.Blocked, "RFCP_NONCE_OR_RUN_REUSED"):
            cp.proposed_event(replay, encoded_packet(replay)[1], MAIN, [first],
                              prior, "CANDIDATE_VERIFIED", {}, 40002)
        original_body = {"id": 10, "user": {"id": cp.BOT_ID},
                         "body": cp.comment_body(first)}
        with self.assertRaisesRegex(rf.Blocked, "RFCP_CHAIN_CHANGED_OR_REPLAYED"):
            # Simulate an untrusted remote comment replay despite
            # packet-hash/source metadata changing.
            second = copy.deepcopy(first)
            second.update(sequence=2, stage="CANDIDATE_VERIFIED",
                          nonce=cp.stage_nonce(replay, "CANDIDATE_VERIFIED"),
                          packetSha256=encoded_packet(replay)[1],
                          runId=40002, previousSha256=prior)
            cp.chain([original_body,
                      {"id": 11, "user": {"id": cp.BOT_ID},
                       "body": cp.comment_body(second)}], original, MAIN)
        # Same dispatch may legitimately journal several stages with the
        # same request nonce and packet, but stage nonce remains distinct.
        same_dispatch = cp.proposed_event(
            original, original_sha, MAIN, [first], prior,
            "CANDIDATE_VERIFIED", {"proof": "candidate"}, 40001)
        comments = [original_body, {"id": 11, "user": {"id": cp.BOT_ID},
                                    "body": cp.comment_body(same_dispatch)}]
        events, _ = cp.chain(comments, original, MAIN)
        self.assertEqual(len(events), 2)
        fresh = copy.deepcopy(original)
        fresh["nonce"] = "f" * 32
        fresh_sha = encoded_packet(fresh)[1]
        second = cp.proposed_event(
            fresh, fresh_sha, MAIN, [first], prior,
            "CANDIDATE_VERIFIED", {"proof": "candidate"}, 40002)
        self.assertNotEqual(first["requestNonceSha256"],
                            second["requestNonceSha256"])

    def test_issue_store_single_append_and_exact_close_patch(self):
        p = packet(); psha = encoded_packet(p)[1]
        state = {"issue": {"number": 273, "state": "open", "body": issue_body()},
                 "comments": [], "patch": 0}
        def api(method, path, body):
            if method == "GET" and path == "/issues/273":
                return {**state["issue"],
                        "closed_at": "2026-11-09T00:00:00Z" if state["issue"]["state"] == "closed" else None,
                        "state_reason": "completed" if state["issue"]["state"] == "closed" else None}
            if method == "GET" and "/comments?per_page=100&page=" in path:
                return copy.deepcopy(state["comments"])
            if method == "POST" and path == "/issues/273/comments":
                item = {"id": 400+len(state["comments"]), "user": {"id": cp.BOT_ID},
                        "body": body["body"]}
                state["comments"].append(item)
                return copy.deepcopy(item)
            if method == "GET" and path.startswith("/issues/comments/"):
                return copy.deepcopy(state["comments"][-1])
            if method == "PATCH" and path == "/issues/273":
                state["patch"] += 1; state["issue"]["state"] = "closed"
                return {"number": 273, "state": "closed"}
            raise AssertionError((method, path, body))

        store = cp.IssueStore("synthetic", 273, request=api)
        digest = None
        for i,stage in enumerate(cp.STAGES):
            before, prev = cp.chain(store.comments(), p, MAIN)
            event = cp.proposed_event(p, psha, MAIN, before, prev, stage, {}, 321+i)
            digest = store.append(event,p,MAIN)
            self.assertEqual(digest, cp.chain(store.comments(), p, MAIN)[1])
        closed = store.close_once(p,MAIN,digest)
        self.assertEqual(closed["state"], "CLOSED_READBACK")
        self.assertEqual(state["patch"], 1)
        with self.assertRaises(rf.Blocked):
            store.close_once(p,MAIN,digest)
        self.assertEqual(state["patch"], 1)
        with self.assertRaises(rf.Blocked):
            store._call("DELETE", "/issues/273")

    def test_issue_ac_exhaustive_and_owner_close(self):
        p = packet(); body=issue_body(); digest=SHA(body.encode())
        ac = finalizer.acceptance({"number":273,"state":"open","body":body}, p,digest)
        self.assertEqual(ac["checkedAcceptanceIds"], sorted(AC))
        for bad in (issue_body(checked=False), issue_body(wrong=True),
                    body+"\n- [x] **RF01** duplicate"):
            with self.subTest(bad=bad), self.assertRaises(rf.Blocked):
                finalizer.acceptance({"number":273,"state":"open","body":bad},p,SHA(bad.encode()))
        with self.assertRaises(rf.Blocked):
            finalizer.acceptance({"number":273,"state":"open","body":body},p,"0"*64)
        with self.assertRaises(rf.Blocked):
            finalizer.acceptance({"number":273,"state":"closed","body":body},p,digest)
        bad=copy.deepcopy(p);bad["ownerIntent"]["closeIssue"]=False
        with self.assertRaises(rf.Blocked):
            finalizer.acceptance({"number":273,"state":"open","body":body},bad,digest)

    def test_record_main_then_fresh_owner_close_only(self):
        store = SyntheticStore(); p1 = packet(); env1 = runtime(p1, run_id="10001")
        with patch.object(finalizer,"main_proof",return_value=main_evidence()):
            planned = finalizer.execute("plan", env1, "synthetic", store)
            self.assertEqual(planned["externalWrites"], 0)
            self.assertEqual(len(store.events), 0)
            first = finalizer.execute("record-main", env1, "synthetic", store)
            self.assertEqual(first["stage"], "MAIN_VERIFIED")
            self.assertEqual(len(store.events), 1)
            with self.assertRaises(rf.Blocked):
                finalizer.execute("record-main",env1,"synthetic",store)

        p2=packet("f"*32); env2=runtime(p2,run_id="10002",
               RF_EXPECTED_PREVIOUS_SHA256=first["checkpointSha256"])
        bundle={"kind":"RF04_EXACT_CLOSE_INPUT_V1",
                "handoff":{},"originalPlan":{},"promotionPacket":{},
                "promotionPacketSha256":"a"*64,
                "issueBodySha256":SHA(store.body.encode()),"ownerIssueClose":True}
        env2["RF_BUNDLE_JSON"]=json.dumps(bundle,sort_keys=True)
        env2["RF_BUNDLE_SHA256"]=SHA(env2["RF_BUNDLE_JSON"].encode())
        env2["RF_WORKSPACE"]=tempfile.gettempdir()
        env2["RF_GH_ARCHIVE"]="/tmp/no-gh.tar.gz"
        env2["RF_GH_BINARY"]="/tmp/no-gh"
        release={"kind":"RF04_LIVE_VERIFIED_RELEASE_V1","mainSha":MAIN,
                 "version":p2["version"],"externalWrites":0,
                 "roleDigests":{r:"sha256:"+"a"*64 for r in rf.ROLES},
                 "candidateRunId":456, "promotionRunId":457}
        with patch.object(finalizer,"main_proof",return_value=main_evidence()), \
             patch.object(finalizer,"owner_review",return_value={"reviewerId":rf.OWNER_ID}):
            with self.assertRaises(rf.Blocked):
                # Bad bundle hash must stop before any checkpoint writes.
                finalizer.execute("close",{**env2,"RF_BUNDLE_SHA256":"0"*64},
                                  "synthetic",store,release_verify=lambda *_: release)
            self.assertEqual(len(store.events),1)
            done=finalizer.execute("close",env2,"synthetic",store,
                                   release_verify=lambda *_: release)
            self.assertEqual(done["state"],"CLOSED_READBACK")
            self.assertEqual(store.patch_count,1)
            self.assertEqual(len(store.events),4)
            with self.assertRaises(rf.Blocked):
                finalizer.execute("close",env2,"synthetic",store,
                                  release_verify=lambda *_: release)
            self.assertEqual(store.patch_count,1)

    def test_no_close_on_invalid_live_release_or_incomplete_ac(self):
        p1=packet(); p2=packet("f"*32)
        store=SyntheticStore(issue_body(checked=False))
        main=cp.proposed_event(p1,encoded_packet(p1)[1],MAIN,[],None,
                               "MAIN_VERIFIED",main_evidence(),30001)
        store.append(main,p1,MAIN)
        env=runtime(p2,run_id="30002", RF_EXPECTED_PREVIOUS_SHA256=
                    cp.sha(cp.canonical(main)))
        bundle={"kind":"RF04_EXACT_CLOSE_INPUT_V1",
                "handoff":{}, "originalPlan":{}, "promotionPacket":{},
                "promotionPacketSha256":"a"*64,
                "issueBodySha256":SHA(store.body.encode()),"ownerIssueClose":True}
        env["RF_BUNDLE_JSON"]=json.dumps(bundle)
        env["RF_BUNDLE_SHA256"]=SHA(env["RF_BUNDLE_JSON"].encode())
        with patch.object(finalizer,"main_proof",return_value=main_evidence()):
            with self.assertRaisesRegex(rf.Blocked,"RF04_AC_INCOMPLETE_OR_MISMATCH"):
                finalizer.execute("close",env,"synthetic",store,
                                  release_verify=lambda *_: None)
        self.assertEqual(len(store.events),1)
        self.assertEqual(store.patch_count,0)

    def test_workflow_contract_reuse_no_automatic_release(self):
        root=Path(__file__).resolve().parents[3]
        flow=(root/".github/workflows/release-finalizer-finish.yml").read_text()
        self.assertIn("default: plan",flow)
        self.assertIn("group: issue225-candidate-publish",flow)
        self.assertIn("cancel-in-progress: false",flow)
        self.assertIn("environment: issue225-candidate-publish",flow)
        self.assertIn("issues: write",flow)
        self.assertIn("github.run_attempt == 1",flow)
        self.assertIn("release_finalizer_finish.py close",flow)
        self.assertNotIn("docker push",flow)
        self.assertNotIn("latest:",flow)
        self.assertIn("G7_RELEASE_HOLD_TAG_BLOCKED",
                      (root/".github/scripts/issue229_release_hold.py").read_text())


if __name__ == "__main__":
    unittest.main()
