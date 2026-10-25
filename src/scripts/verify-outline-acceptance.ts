/**
 * Read-only local Issue #99 manifest evaluator. Never run on public CI with private data.
 * Usage: cd src && npm run verify:outline-acceptance -- /private/manifest.json
 * Emits reason codes only, not DXF paths, SHA, layers, CAD values or device details.
 */
import {readFile,stat} from 'node:fs/promises';
import {assessPrivateOutlineEvidence} from '../tests/benchmark/outline-acceptance-gate';

const path=process.argv[2];
if(!path || process.argv.length!==3 || path==='--help'){
  process.stderr.write('Usage: npm run verify:outline-acceptance -- /private/manifest.json (offline/private; schemaVersion 1)\n');
  process.exitCode=2;
}else{
  try{
    const info=await stat(path);
    if(!info.isFile()||info.size<1||info.size>4*1024*1024)
      throw new Error('manifest');
    const parsed:unknown=JSON.parse(await readFile(path,'utf8'));
    const result=assessPrivateOutlineEvidence(parsed);
    process.stdout.write(JSON.stringify({...result,note:'Evidence readiness only; Owner must sign off. Not CAD/GPU PASS.'},null,2)+'\n');
    if(result.state==='BLOCKED')process.exitCode=3;
  }catch{
    process.stderr.write('Private acceptance evidence not readable or invalid; check secure local input.\n');
    process.exitCode=2;
  }
}
