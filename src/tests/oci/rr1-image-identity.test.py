#!/usr/bin/env python3
"""Focused Docker classic/containerd identity binding regressions."""
import copy
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

MODULE=Path(__file__).with_name('rr1-registry-proof.py')
spec=importlib.util.spec_from_file_location('rr1_registry_identity',MODULE)
rr1=importlib.util.module_from_spec(spec)
spec.loader.exec_module(rr1)

def digest(char):return 'sha256:'+char*64

CONFIG=digest('a')
MANIFEST=digest('b')
DIFF=digest('c')
LABELS={'org.opencontainers.image.source':rr1.SOURCE,
        'org.opencontainers.image.revision':'d'*40,
        'org.opencontainers.image.version':'0.61.0',
        'com.planner77.g7.image-role':'app'}
CONFIG_FIELDS={'User':'10001:10001','WorkingDir':'/app',
               'Entrypoint':['node'],'Cmd':['server.js'],
               'Labels':LABELS,'Env':['NODE_ENV=production']}
VERIFIED={'digest':MANIFEST,'manifestDigest':MANIFEST,'configDigest':CONFIG,
          'topDescriptor':{'mediaType':'application/vnd.oci.image.manifest.v1+json',
                           'digest':MANIFEST,'size':123},
          'manifestDescriptor':{'mediaType':'application/vnd.oci.image.manifest.v1+json',
                                'digest':MANIFEST,'size':123},
          'config':{'os':'linux','architecture':'amd64','rootfs':{'type':'layers','diff_ids':[DIFF]},
                    'config':CONFIG_FIELDS}}
CLASSIC={'Id':CONFIG,'Descriptor':None,'Os':'linux','Architecture':'amd64',
         'RootFS':{'Type':'layers','Layers':[DIFF]},'Config':CONFIG_FIELDS,
         'RepoDigests':['127.0.0.1:30000/rr1-release@'+MANIFEST]}
CONTAINERD={**CLASSIC,'Id':MANIFEST,
            'Descriptor':{'mediaType':VERIFIED['topDescriptor']['mediaType'],
                          'digest':MANIFEST,'size':123}}
REF=CLASSIC['RepoDigests'][0]

class IdentityTest(unittest.TestCase):
    def test_classic_config_id(self):
        rr1.verify_pulled_identity(copy.deepcopy(CLASSIC),CONFIG,copy.deepcopy(VERIFIED),REF)

    def test_containerd_descriptor_manifest_id(self):
        rr1.verify_pulled_identity(copy.deepcopy(CONTAINERD),MANIFEST,copy.deepcopy(VERIFIED),REF)

    def test_index_and_verified_child_targets(self):
        verified=copy.deepcopy(VERIFIED)
        verified['digest']=digest('d')
        verified['topDescriptor']={'mediaType':'application/vnd.oci.image.index.v1+json',
                                   'digest':verified['digest'],'size':234}
        ref='127.0.0.1:30000/rr1-release@'+verified['digest']
        for descriptor in (verified['topDescriptor'],verified['manifestDescriptor']):
            image=copy.deepcopy(CONTAINERD)
            image['Descriptor']=descriptor
            image['Id']=descriptor['digest']
            image['RepoDigests']=[ref]
            rr1.verify_pulled_identity(image,image['Id'],verified,ref)

    def test_bad_identity_shapes_rejected(self):
        mutations={
            'descriptor_digest':lambda x:x['Descriptor'].update(digest=digest('e')),
            'descriptor_media':lambda x:x['Descriptor'].update(mediaType='application/unknown'),
            'descriptor_size':lambda x:x['Descriptor'].update(size=124),
            'unknown_engine_id':lambda x:x.update(Id=digest('e')),
            'wrong_repo_digest':lambda x:x.update(RepoDigests=['elsewhere@'+MANIFEST]),
            'wrong_rootfs':lambda x:x['RootFS'].update(Layers=[digest('e')]),
            'cross_role':lambda x:x['Config']['Labels'].update(
                {'com.planner77.g7.image-role':'migrator'}),
            'wrong_source':lambda x:x['Config']['Labels'].update(
                {'org.opencontainers.image.revision':'e'*40}),
            'wrong_user':lambda x:x['Config'].update(User='0'),
        }
        for name,mutate in mutations.items():
            with self.subTest(name=name):
                image=copy.deepcopy(CONTAINERD)
                mutate(image)
                with self.assertRaises(rr1.ProofError):
                    rr1.verify_pulled_identity(image,MANIFEST,copy.deepcopy(VERIFIED),REF)
        with self.assertRaises(rr1.ProofError):
            rr1.verify_pulled_identity(copy.deepcopy(CONTAINERD),digest('e'),
                                       copy.deepcopy(VERIFIED),REF)
        classic=copy.deepcopy(CLASSIC);classic['Id']=MANIFEST
        with self.assertRaises(rr1.ProofError):
            rr1.verify_pulled_identity(classic,MANIFEST,copy.deepcopy(VERIFIED),REF)

    def test_runtime_graph_rejects_cross_role_and_wrong_manifest(self):
        self.assertTrue(rr1.verify_runtime_identity(
            {'Image':CONFIG,'Config':{'Image':REF}},CLASSIC,REF,VERIFIED))
        created={'Image':MANIFEST,'Config':{'Image':REF},
                 'ImageManifestDescriptor':copy.deepcopy(VERIFIED['manifestDescriptor'])}
        self.assertTrue(rr1.verify_runtime_identity(created,CONTAINERD,REF,VERIFIED))
        for name,mutate in {
            'wrong_image':lambda x:x.update(Image=digest('e')),
            'wrong_ref':lambda x:x['Config'].update(Image='other'),
            'wrong_manifest':lambda x:x['ImageManifestDescriptor'].update(digest=digest('e')),
            'wrong_media':lambda x:x['ImageManifestDescriptor'].update(mediaType='application/unknown'),
            'missing_manifest':lambda x:x.pop('ImageManifestDescriptor'),
        }.items():
            with self.subTest(name=name):
                item=copy.deepcopy(created);mutate(item)
                with self.assertRaises(rr1.ProofError):
                    rr1.verify_runtime_identity(item,CONTAINERD,REF,VERIFIED)

    def test_raw_manifest_and_config_byte_hash_rejection(self):
        # An apparent descriptor or parsed config cannot substitute for raw SHA.
        def forged_manifest(*_args,**_kwargs):
            return digest('e'),digest('e'),'application/vnd.oci.image.manifest.v1+json',b'{}',2
        with patch.object(rr1,'registry_object',forged_manifest):
            with self.assertRaises(rr1.ProofError):
                rr1.manifest_json('http://127.0.0.1:30000','r',MANIFEST,MANIFEST)
        manifest={'schemaVersion':2,'mediaType':'application/vnd.oci.image.manifest.v1+json',
                  'config':{'digest':CONFIG,'size':2,
                            'mediaType':'application/vnd.oci.image.config.v1+json'},
                  'layers':[{'digest':digest('f'),'size':1}]}
        with patch.object(rr1,'manifest_json',return_value=(MANIFEST,manifest,123,
                    'application/vnd.oci.image.manifest.v1+json')), \
             patch.object(rr1,'registry_object',return_value=(digest('e'),None,
                    'application/octet-stream',b'{}',2)):
            with self.assertRaises(rr1.ProofError):
                rr1.verify_registry_image('http://127.0.0.1:30000','r','tag',{})

    def test_diagnostic_is_scalars_only(self):
        record=rr1.safe_identity_diagnostic('app',MANIFEST,CONTAINERD,VERIFIED)
        self.assertEqual(set(record),{'role','builtEngineId','pulledEngineId',
                         'verifiedConfigDigest','descriptorDigest','descriptorMediaType',
                         'rootfsMatches','engineStore'})
        self.assertNotIn('NODE_ENV',str(record))
        runtime=rr1.safe_runtime_diagnostic('app',
            {'Image':MANIFEST,'Config':{'Image':REF},
             'ImageManifestDescriptor':VERIFIED['manifestDescriptor']},
            CONTAINERD,REF,VERIFIED)
        self.assertEqual(set(runtime),{'role','inspectedEngineId','containerImage',
                         'verifiedManifestDigest','verifiedConfigDigest',
                         'runtimeDescriptorMediaType','runtimeDescriptorDigest',
                         'runtimeDescriptorSize','immutableRefMatches'})
        self.assertTrue(runtime['immutableRefMatches'])
        self.assertNotIn('NODE_ENV',str(runtime))

    def test_only_exact_typed_not_found_means_absent(self):
        name='layoutmanager-rr1-owned-0123456789abcdef'
        messages={
            'container':'No such container: '+name,
            'image':'No such image: '+name,
            'network':'network '+name+' not found',
            'volume':'get '+name+': no such volume',
        }
        for kind,message in messages.items():
            with self.subTest(kind=kind),patch.object(rr1.subprocess,'run',return_value=
                subprocess.CompletedProcess([],1,'[]\n','Error response from daemon: '+message+'\n')):
                self.assertIsNone(rr1.docker_optional_inspect(kind,name))
                rr1.docker_absent(kind,name)

    def test_daemon_auth_timeout_malformed_and_wrong_name_never_absent(self):
        name='layoutmanager-rr1-owned-0123456789abcdef'
        failures=[
            subprocess.CompletedProcess([],1,'[]\n','Cannot connect to the Docker daemon\n'),
            subprocess.CompletedProcess([],1,'[]\n','permission denied\n'),
            subprocess.CompletedProcess([],1,'[]\n',
                'Error response from daemon: No such container: someone-else\n'),
            subprocess.CompletedProcess([],2,'[]\n',
                'Error response from daemon: No such container: '+name+'\n'),
            subprocess.CompletedProcess([],0,'not json',''),
            subprocess.CompletedProcess([],0,'[]',''),
            subprocess.CompletedProcess([],0,'[{"Id":"a"}]','unexpected warning'),
        ]
        for item in failures:
            with self.subTest(stderr=item.stderr),patch.object(rr1.subprocess,'run',return_value=item):
                with self.assertRaises(rr1.ProofError):
                    rr1.docker_optional_inspect('container',name)
        with patch.object(rr1.subprocess,'run',side_effect=subprocess.TimeoutExpired('docker',30)):
            with self.assertRaises(rr1.ProofError):rr1.docker_optional_inspect('container',name)
        with patch.object(rr1.subprocess,'run',side_effect=OSError('daemon unreachable')):
            with self.assertRaises(rr1.ProofError):rr1.docker_optional_inspect('container',name)
        with patch.object(rr1.subprocess,'run',return_value=subprocess.CompletedProcess([],0,
                '[{"Id":"a"}]','')):
            with self.assertRaises(rr1.ProofError):rr1.docker_absent('container',name)

    def test_cleanup_does_not_swallow_inspect_failure(self):
        failure=subprocess.CompletedProcess([],1,'[]\n','permission denied\n')
        with patch.object(rr1.subprocess,'run',return_value=failure), \
             patch.object(rr1,'command') as cleanup:
            with self.assertRaises(rr1.ProofError):
                rr1.remove_owned_smoke('layoutmanager-rr1-smoke-app-0123456789abcdef',
                                        REF,'0123456789abcdef')
            with self.assertRaises(rr1.ProofError):
                rr1.remove_ref_if_owned(REF,CONFIG)
            cleanup.assert_not_called()

if __name__=='__main__':unittest.main()
