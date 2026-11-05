#!/usr/bin/env python3
"""Test-only Docker CLI boundary for byte-identical RR2 host helpers."""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

def main():
    binary = os.environ['RR2_REAL_DOCKER']
    args = sys.argv[1:]
    if args[:2] == ['volume', 'create']:
        path = Path(os.environ['RR2_WRAPPER_RECEIPT'])
        receipt = json.loads(path.read_text())
        if args[-1] == receipt['restoreVolume']:
            labels = [args[index+1] for index, token in enumerate(args[:-1])
                      if token == '--label']
            owner = next((value.split('=', 1)[1] for value in labels
                          if value.startswith('com.planner77.g7.restore-owner=')), None)
            if owner is None or not re.fullmatch(r'[0-9a-f]{32}', owner):
                raise SystemExit(90)
            receipt['restoreOwner'] = owner
            path.write_text(json.dumps(receipt, indent=2) + '\n')
    if args[:1] != ['run']:
        os.execv(binary, [binary, *args])
    path = Path(os.environ['RR2_WRAPPER_RECEIPT'])
    receipt = json.loads(path.read_text())
    nonce = receipt['nonce']
    if '--rm' not in args or '--network' not in args or args[args.index('--network')+1] != 'none':
        raise SystemExit(91)
    mounts = [args[index+1] for index, token in enumerate(args[:-1]) if token == '--mount']
    volumes = [match.group(1) for mount in mounts
               if (match := re.search(r'(?:^|,)source=([^,]+)', mount))]
    if not volumes or any(volume not in (receipt['liveVolume'], receipt['restoreVolume'])
                          for volume in volumes):
        raise SystemExit(92)
    image = args[args.index('--entrypoint')+2]
    allowed = tuple(receipt['images']['old'].values()) + tuple(receipt['images']['new'].values())
    ids = []
    for ref in allowed:
        result = subprocess.run([binary, 'image', 'inspect', ref], capture_output=True, text=True)
        if result.returncode: raise SystemExit(93)
        ids.append(json.loads(result.stdout)[0]['Id'])
    if image not in ids: raise SystemExit(94)
    name = 'layoutmanager-rr2-host-' + nonce + '-' + secrets.token_hex(4)
    cidfile = Path(receipt['root']) / (name + '.cid')
    row = {'name': name, 'nonce': nonce, 'image': image, 'engineImageId': image,
           'volumes': volumes, 'cidFile': str(cidfile)}
    receipt.setdefault('hostChildren', []).append(row)
    path.write_text(json.dumps(receipt, indent=2) + '\n')
    args = ['run', '--name', name, '--cidfile', str(cidfile),
            '--label', 'com.planner77.purpose=rr2-actual-oci-recovery',
            '--label', 'com.planner77.rr2.nonce=' + nonce, *args[1:]]
    os.execv(binary, [binary, *args])

if __name__ == '__main__':
    main()
