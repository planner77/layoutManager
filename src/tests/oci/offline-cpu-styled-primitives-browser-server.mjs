/** Local-only synthetic fixture server for Playwright CLI; no app/auth/CAD. */
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdir,lstat,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {saveAndReadbackOfflineCpuStyledPrimitives} from './offline-cpu-styled-primitives.mjs';
import {syntheticStyledDxf} from './offline-cpu-styled-primitives-proof-fixtures.mjs';

const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--evidence')throw new Error('OFFLINE_SERVER_ARGS');
const evidence=resolve(args[1]),stat=await lstat(evidence);
if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.uid!==process.getuid())throw new Error('OFFLINE_SERVER_PRIVATE_DIR');
const here=dirname(fileURLToPath(import.meta.url));
const temporary=join(evidence,'host-readback');await mkdir(temporary,{mode:0o700});
const source=syntheticStyledDxf(),saved=await saveAndReadbackOfflineCpuStyledPrimitives(source,temporary);
const bytes=Buffer.from(JSON.stringify(saved.envelope));
if(bytes.length!==saved.byteLength||createHash('sha256').update(bytes).digest('hex')!==saved.sha256)throw new Error('OFFLINE_SERVER_READBACK');
const packet={bytes:Array.from(bytes),sha256:saved.sha256,source:saved.envelope.source};
await writeFile(join(evidence,'packet.json'),JSON.stringify(packet),{flag:'wx',mode:0o600});
const bundle=await build({entryPoints:[join(here,'offline-cpu-styled-primitives-browser-entry.mjs')],
  bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent'});
await writeFile(join(evidence,'bundle.js'),bundle.outputFiles[0].contents,{flag:'wx',mode:0o600});
const html='<!doctype html><meta charset="utf-8"><title>Offline CPU styled candidate proof</title>'+
  '<style>body{margin:0;background:#111;color:#eee;font:16px sans-serif}h1,p{margin:12px}canvas{display:block}</style>'+
  '<h1>Offline styled candidate</h1><p id="status">CANDIDATE · awaiting restore</p><div id="canvas-root"></div><script src="/bundle.js"></script>';
await writeFile(join(evidence,'index.html'),html,{flag:'wx',mode:0o600});
await writeFile(join(evidence,'host-candidate-result.json'),JSON.stringify({state:saved.envelope.state,
  builder:saved.envelope.builder,primitiveCount:saved.envelope.primitiveCount,segmentCount:saved.envelope.segmentCount,visiblePrimitiveCount:saved.envelope.visiblePrimitiveCount,
  payloadSha256:saved.sha256,payloadBytes:saved.byteLength,sourceSha256:saved.envelope.source.sha256,
  sourceBytes:source.byteLength,maxChordErrorMm:saved.envelope.maxChordErrorMm,
  maxFloatErrorMm:saved.envelope.maxFloatErrorMm,readback:true}),{flag:'wx',mode:0o600});
const routes=new Map([['/',['index.html','text/html; charset=utf-8']],
  ['/bundle.js',['bundle.js','text/javascript']],['/packet.json',['packet.json','application/json']]]);
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const route=routes.get(pathname);
  if(!route){res.writeHead(404);res.end();return;}
  try{
    const data=await readFile(join(evidence,route[0]));
    res.writeHead(200,{'Content-Type':route[1],'Content-Length':data.length,'Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(500);res.end();}
});
server.listen(0,'127.0.0.1',async()=>{
  const port=server.address().port;
  await writeFile(join(evidence,'server.json'),JSON.stringify({pid:process.pid,port,bind:'127.0.0.1',
    syntheticOnly:true,payloadSha256:saved.sha256}),{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({listening:true,syntheticOnly:true})+'\n');
});
let closing=false;
function close(){if(closing)return;closing=true;server.close(()=>process.exit(0));server.closeAllConnections();}
process.on('SIGINT',close);process.on('SIGTERM',close);
setTimeout(close,600000).unref();
