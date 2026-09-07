import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { S3Client, CreateBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { appEnvironment, project } from './env.mjs';
const directory = await mkdtemp(path.join(tmpdir(), 'cad-s3-test-'));
const name = `cad-s3-test-${randomBytes(6).toString('hex')}`;
const image = 'chrislusf/seaweedfs@sha256:fc9f76fa993ad69966ffeb2f65d0318fcae39c6f8e20cf68ef7b3a5cb97769e5';
const credentials = { accessKeyId: randomBytes(16).toString('hex'), secretAccessKey: randomBytes(32).toString('hex') };
let client;
let started = false;
const docker = args => execFileSync('docker', args, { stdio: ['ignore','pipe','pipe'] }).toString().trim();
try {
  await writeFile(path.join(directory, 's3.json'), JSON.stringify({ identities: [{ name: 'cad-test', credentials: [{ accessKey: credentials.accessKeyId, secretKey: credentials.secretAccessKey }], actions: ['Admin','Read','Write','List','Tagging'] }] }), { mode: 0o600 });
  docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::8333','-v',`${directory}/s3.json:/etc/cad-s3.json:ro`,image,'server','-s3','-s3.config=/etc/cad-s3.json','-s3.autoCreateBucket=false','-dir=/data','-ip=127.0.0.1','-ip.bind=0.0.0.0','-volume.max=1','-master.volumeSizeLimitMB=64','-master.telemetry=false']);
  started = true;
  const binding = docker(['port',name,'8333/tcp']);
  const endpoint = `http://${binding}`;
  client = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials, maxAttempts: 1 });
  let ready = false;
  for (let attempt=0; attempt<40; attempt++) {
    try { await client.send(new ListBucketsCommand({}), {abortSignal:AbortSignal.timeout(1000)}); ready=true; break; }
    catch { await new Promise(resolve=>setTimeout(resolve,500)); }
  }
  if (!ready) throw new Error('SeaweedFS did not become ready');
  const bucket = `cad-${randomBytes(8).toString('hex')}`;
  await client.send(new CreateBucketCommand({Bucket:bucket}));
  const env = { ...appEnvironment(), CAD_STORAGE_BACKEND:'s3', CAD_E2E_STORAGE_BACKEND:'s3', CAD_S3_ENDPOINT:endpoint, CAD_S3_BUCKET:bucket, CAD_S3_REGION:'us-east-1', CAD_S3_FORCE_PATH_STYLE:'true', CAD_S3_ACCESS_KEY_ID:credentials.accessKeyId, CAD_S3_SECRET_ACCESS_KEY:credentials.secretAccessKey, CAD_S3_SESSION_TOKEN:'', CAD_S3_TIMEOUT_MS:'10000' };
  const command = process.argv.includes('--e2e') ? ['playwright','test'] : ['vitest','run','--config','vitest.s3.config.ts'];
  console.log('Isolated SeaweedFS 4.45 ready; temporary credentials configured.');
  process.exitCode = await new Promise(resolve => {
    const child = spawn(path.join(project,'node_modules/.bin',command[0]),command.slice(1),{cwd:project,env,stdio:'inherit'});
    child.on('error',()=>resolve(1)); child.on('exit',code=>resolve(code??1));
  });
} catch { console.error('S3 test environment failed; inspect Docker availability/configuration.'); process.exitCode=1; }
finally {
  client?.destroy();
  if (started) { try { docker(['stop','--time','2',name]); } catch { console.error('S3 test container cleanup pending.'); } }
  await rm(directory,{recursive:true,force:true});
}
