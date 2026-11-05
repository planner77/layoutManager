#!/usr/bin/env python3
"""RX11: one fresh owned 0.60 install and first-admin Browser observation only."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('rr2_journey', Path(__file__).with_name('rr2-journey.py'))
JOURNEY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(JOURNEY)

def safe_observation(value, nonce):
    JOURNEY.check(isinstance(value, dict) and set(value) ==
                  {'kind','nonce','setupEvents','dom'} and
                  value.get('kind') == 'RX11_FIRST_SETUP_OBSERVATION' and
                  value.get('nonce') == nonce, 'RX11_OBSERVATION_INVALID')
    events = value['setupEvents']
    JOURNEY.check(isinstance(events, list) and len(events) <= 12,
                  'RX11_OBSERVATION_INVALID')
    request_keys = {'direction','method','atMs','headersAvailable','csrfHeaderPresent',
                    'setupCookiePresent','setupCookieCount','csrfHeaderEqualsCookie',
                    'originMatches','getCsrfObserved','headerEqualsObservedGetCsrf'}
    response_keys = {'direction','method','atMs','status','setupCookieSet',
                     'safeCode','safeState'}
    for event in events:
        JOURNEY.check(isinstance(event, dict) and
                      event.get('direction') in ('request','response') and
                      event.get('method') in ('GET','POST') and
                      type(event.get('atMs')) is int and 0 <= event['atMs'] <= 300_000,
                      'RX11_OBSERVATION_INVALID')
        allowed = request_keys if event['direction'] == 'request' else response_keys
        JOURNEY.check(set(event) <= allowed, 'RX11_OBSERVATION_INVALID')
        if event['direction'] == 'request':
            JOURNEY.check(type(event.get('headersAvailable')) is bool,
                          'RX11_OBSERVATION_INVALID')
            for key in allowed - {'direction','method','atMs','setupCookieCount',
                                  'headersAvailable'}:
                if key in event:
                    JOURNEY.check(type(event[key]) is bool or event[key] is None,
                                  'RX11_OBSERVATION_INVALID')
            JOURNEY.check(event.get('setupCookieCount') is None or
                          (type(event['setupCookieCount']) is int and
                           0 <= event['setupCookieCount'] <= 8),
                          'RX11_OBSERVATION_INVALID')
        else:
            JOURNEY.check(type(event.get('status')) is int and
                          100 <= event['status'] <= 599 and
                          type(event.get('setupCookieSet')) is bool and
                          (event.get('safeCode') is None or
                           re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', event['safeCode'])) and
                          event.get('safeState') in (None,'SETUP_REQUIRED'),
                          'RX11_OBSERVATION_INVALID')
    dom = value['dom']
    JOURNEY.check(isinstance(dom, dict) and set(dom) ==
                  {'panelPresent','alertPresent','safeAlertCode','successPresent','formPresent'} and
                  all(type(dom[key]) is bool for key in
                      ('panelPresent','alertPresent','successPresent','formPresent')) and
                  (dom['safeAlertCode'] is None or
                   re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', dom['safeAlertCode'])),
                  'RX11_OBSERVATION_INVALID')
    return value

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old-pair-receipt', required=True, type=Path)
    parser.add_argument('--new-triplet-receipt', required=True, type=Path)
    parser.add_argument('--output-receipt', required=True, type=Path)
    args = parser.parse_args()
    JOURNEY.check(not args.output_receipt.exists(), 'RX11_OUTPUT_EXISTS')
    env = dict(os.environ,
               RR2_OLD_PAIR_RECEIPT=str(args.old_pair_receipt.resolve()),
               RR2_CURRENT_TRIPLET_RECEIPT=str(args.new_triplet_receipt.resolve()))
    summary = {'kind':'RX11_FIRST_SETUP_ONLY', 'result':'RUNNING', 'stages':[]}
    receipt_path = None
    stage = 'prepare'
    try:
        output = JOURNEY.call([sys.executable, str(JOURNEY.PROOF), 'prepare'], env=env, timeout=60)
        match = re.fullmatch(r'RR2_NAMESPACE_PREPARED nonce=([0-9a-f]{16}) allowedDiffs=\d+\s*', output)
        JOURNEY.check(match is not None, 'RX11_PREPARE_OUTPUT_INVALID')
        receipt_path = ROOT / 'data/release-proof' / ('rr2-' + match.group(1)) / 'receipt.json'
        receipt = json.loads(receipt_path.read_text())
        JOURNEY.check(receipt['nonce'] == match.group(1), 'RX11_RECEIPT_NONCE_INVALID')
        summary.update(nonce=receipt['nonce'], oldSource=receipt['images']['oldSource'],
                       oldRefs=receipt['images']['old'])
        summary['stages'].append(stage)
        stage = 'old_install'
        plan = JOURNEY.proof(receipt_path, 'plan', env=env)
        JOURNEY.check(plan['decision'] == 'FRESH_INSTALL', 'RX11_OLD_NOT_FRESH')
        done = JOURNEY.proof(receipt_path, 'execute', approve=plan['planId'], env=env)
        JOURNEY.check(done['state'] == 'FRESH_INSTALLED', 'RX11_OLD_INSTALL_INVALID')
        JOURNEY.health(receipt['oldPort'])
        summary['stages'].append(stage)
        stage = 'first_admin_only'
        browser_env = dict(env, RR2_RX11_FIRST_ADMIN_ONLY='1',
                           G7_RR2_RECEIPT=str(receipt_path),
                           G7_RR2_ORIGIN='http://127.0.0.1:'+str(receipt['oldPort']))
        command = ['npx', 'playwright', 'test', '--config', 'playwright.rr2.config.ts',
                   '--grep', 'RR2 actual published 0.60 App installs and populates authenticated CAD',
                   '--reporter=line', '--output', str(receipt_path.parent / 'rx11-playwright-results')]
        try:
            process = subprocess.run(command, cwd=ROOT/'src', env=browser_env,
                                     capture_output=True, text=True, timeout=300, check=False)
        except subprocess.TimeoutExpired as error:
            raise JOURNEY.JourneyFailure('RX11_PLAYWRIGHT_TIMEOUT') from error
        text = process.stdout + '\n' + process.stderr
        records = re.findall(r'RX11_FIRST_SETUP_(?:DIAGNOSTIC|ONLY_PASS) (\{[^\n]+\})', text)
        JOURNEY.check(len(records) == 1, 'RX11_OBSERVATION_MISSING')
        summary['observation'] = safe_observation(json.loads(records[0]), receipt['nonce'])
        summary['browserVerdict'] = 'PASS' if process.returncode == 0 else 'FAILED'
        JOURNEY.check(process.returncode == 0, 'RX11_FIRST_ADMIN_ASSERTION_FAILED')
        summary['stages'].append(stage)
    except (JOURNEY.JourneyFailure, KeyError, ValueError, TypeError, OSError) as error:
        summary['result'] = 'FAILED'
        summary['failedStage'] = stage
        summary['failureCode'] = str(error) if isinstance(error, JOURNEY.JourneyFailure) else 'RX11_INVALID_STATE'
    finally:
        if receipt_path and receipt_path.exists():
            try:
                JOURNEY.proof(receipt_path, 'cleanup', env=env)
                summary['ownedCleanup'] = 'PASS'
            except (JOURNEY.JourneyFailure, KeyError, ValueError, TypeError, OSError):
                summary['ownedCleanup'] = 'FAILED'
                summary['result'] = 'FAILED'
        if summary['result'] == 'RUNNING':
            summary['result'] = 'PASS' if summary.get('ownedCleanup') == 'PASS' else 'FAILED'
        args.output_receipt.parent.mkdir(parents=True, exist_ok=True)
        args.output_receipt.write_text(json.dumps(summary, indent=2, sort_keys=True) + '\n')
        print('RX11_FIRST_SETUP_RESULT nonce='+summary.get('nonce','NONE')+
              ' result='+summary['result']+' cleanup='+summary.get('ownedCleanup','NOT_RUN'))
    return 0 if summary['result'] == 'PASS' else 1

if __name__ == '__main__':
    sys.exit(main())
