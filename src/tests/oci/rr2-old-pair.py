#!/usr/bin/env python3
"""Read-only GHCR 0.60 tag/digest linkage and local pull receipt for RR2."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[3]
REPOSITORY = "ghcr.io/planner77/layoutmanager"
SOURCE = "9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63"
ROLES = {
    "app": ("0.60.0", "c5d133a0335d3f8391f499880a3e8d38e197375b3cc298118e2701f2796aaf2c",
            "sha256:35b433994c31d997adfc131b7c6102c294cd50e4152f95c2c68c6dca6fbdf78f"),
    "migrator": ("0.60.0-migrate", "1680f36e05cf45f9630ba4b3de182e3391a6d04190fa9b7093a6bf289d6b9128",
                 "sha256:b334eb507ca1919f37c10d4c91c566734ffccfb38951b2a2bcfc34ba04ab30ee"),
}

def run(command,timeout=180):
    result=subprocess.run(command,cwd=ROOT,capture_output=True,timeout=timeout,check=False)
    if result.returncode:
        raise RuntimeError("RR2_OLD_PAIR_COMMAND_FAILED")
    return result.stdout

def load_rr1():
    spec=importlib.util.spec_from_file_location('rr1_identity',ROOT/'src/tests/oci/rr1-registry-proof.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def raw_config_from_local_image(ref,config_digest,expected_size):
    """Read the verified config blob from Docker's local OCI save stream."""
    wanted='blobs/sha256/'+config_digest.removeprefix('sha256:')
    process=subprocess.Popen(['docker','save',ref],cwd=ROOT,stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL)
    raw=None
    try:
        with tarfile.open(fileobj=process.stdout,mode='r|') as archive:
            for member in archive:
                if member.name==wanted:
                    if not member.isfile() or member.size!=expected_size:
                        raise RuntimeError('RR2_OLD_CONFIG_SIZE_MISMATCH')
                    file=archive.extractfile(member)
                    if file is None:raise RuntimeError('RR2_OLD_CONFIG_MISSING')
                    raw=file.read(expected_size+1)
                    break
    finally:
        if process.poll() is None:process.terminate()
        try:process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            process.kill();process.wait(timeout=30)
    if (raw is None or len(raw)!=expected_size or
        hashlib.sha256(raw).hexdigest()!=config_digest.removeprefix('sha256:')):
        raise RuntimeError('RR2_OLD_CONFIG_SHA_MISMATCH')
    return json.loads(raw)

def verify_pair_rows(*,pull):
    rr1=load_rr1();rows=[];verified_by_role={}
    for role,(tag,digest,config_digest) in ROLES.items():
        tagged=run(['docker','buildx','imagetools','inspect','--raw',REPOSITORY+':'+tag])
        pinned=run(['docker','buildx','imagetools','inspect','--raw',
                    REPOSITORY+'@sha256:'+digest])
        if hashlib.sha256(tagged).hexdigest()!=digest or tagged!=pinned:
            raise RuntimeError('RR2_OLD_GHCR_TAG_DIGEST_MISMATCH')
        top=json.loads(tagged);top_digest='sha256:'+digest
        top_media=top.get('mediaType')
        if top.get('manifests') is not None:
            if top_media not in ('application/vnd.oci.image.index.v1+json',
                                 'application/vnd.docker.distribution.manifest.list.v2+json'):
                raise RuntimeError('RR2_OLD_INDEX_MEDIA_INVALID')
            children=[x for x in top['manifests'] if x.get('platform',{}).get('os')=='linux'
                      and x.get('platform',{}).get('architecture')=='amd64'
                      and x.get('platform',{}).get('variant') in (None,'')]
            if len(children)!=1:raise RuntimeError('RR2_OLD_CHILD_AMBIGUOUS')
            child=children[0]
            child_raw=run(['docker','buildx','imagetools','inspect','--raw',
                           REPOSITORY+'@'+child['digest']])
            if (hashlib.sha256(child_raw).hexdigest()!=child['digest'].removeprefix('sha256:')
                or len(child_raw)!=child['size']):
                raise RuntimeError('RR2_OLD_CHILD_BYTES_MISMATCH')
            manifest=json.loads(child_raw)
            manifest_descriptor={key:child[key] for key in ('mediaType','digest','size')}
        else:
            manifest=top
            manifest_descriptor={'mediaType':top_media,'digest':top_digest,'size':len(tagged)}
        if (manifest.get('mediaType')!=manifest_descriptor['mediaType'] or
            manifest_descriptor['mediaType'] not in (
               'application/vnd.oci.image.manifest.v1+json',
               'application/vnd.docker.distribution.manifest.v2+json')):
            raise RuntimeError('RR2_OLD_MANIFEST_MEDIA_INVALID')
        config=manifest.get('config') or {}
        if config.get('digest')!=config_digest or not isinstance(config.get('size'),int):
            raise RuntimeError('RR2_OLD_CONFIG_DESCRIPTOR_MISMATCH')
        ref=REPOSITORY+'@'+top_digest
        if pull:run(['docker','pull','--platform','linux/amd64',ref],timeout=600)
        item=json.loads(run(['docker','image','inspect',ref]))[0]
        config_json=raw_config_from_local_image(ref,config_digest,config['size'])
        verified={'digest':top_digest,'manifestDigest':manifest_descriptor['digest'],
                  'configDigest':config_digest,
                  'topDescriptor':{'mediaType':top_media,'digest':top_digest,'size':len(tagged)},
                  'manifestDescriptor':manifest_descriptor,'config':config_json}
        try:rr1.verify_pulled_identity(item,item['Id'],verified,ref)
        except rr1.ProofError as error:
            raise RuntimeError('RR2_OLD_TYPED_IDENTITY_MISMATCH') from error
        rr1.check_image_metadata(item,role,SOURCE,'0.60.0')
        rows.append({'role':role,'ref':ref,'tag':REPOSITORY+':'+tag,
                     'indexDigest':top_digest,'imageId':item['Id'],
                     'engineImageId':item['Id'],'configDigest':config_digest,
                     'topDescriptor':verified['topDescriptor'],
                     'manifestDescriptor':manifest_descriptor,
                     'sourceCommit':SOURCE,'source':rr1.SOURCE,
                     'repoDigests':item['RepoDigests']})
        verified_by_role[role]=verified
    spec=importlib.util.spec_from_file_location('upgrade',ROOT/'src/scripts/g7-upgrade.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    by_role={row['role']:row for row in rows}
    result=module.inspect_pair(by_role['app']['ref'],by_role['migrator']['ref'],
                               SOURCE,lambda ref:json.loads(run(['docker','image','inspect',ref]))[0])
    if result!=(by_role['app']['imageId'],by_role['migrator']['imageId']):
        raise RuntimeError('RR2_OLD_PAIR_INVALID')
    return rows,verified_by_role

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-receipt",required=True,type=Path)
    options=parser.parse_args()
    if options.output_receipt.exists():
        raise RuntimeError("RR2_OLD_RECEIPT_EXISTS")
    rows,_=verify_pair_rows(pull=True)
    options.output_receipt.parent.mkdir(parents=True,exist_ok=True)
    options.output_receipt.write_text(json.dumps(rows,indent=2)+"\n")
    options.output_receipt.chmod(0o600)
    print("RR2_OLD_GHCR_PAIR_PASS")

if __name__=="__main__":
    try:main()
    except (RuntimeError,OSError,ValueError,KeyError,subprocess.TimeoutExpired) as error:
        print(str(error) if isinstance(error,RuntimeError) else "RR2_OLD_PAIR_FAILED",
              file=sys.stderr)
        sys.exit(1)
