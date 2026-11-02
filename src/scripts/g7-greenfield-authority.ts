/** Private Owner operation, never started by app/Compose automatically. */
import { issueGreenfieldAuthority } from '../server/g7-operational/greenfield-authority';
try {
  const [mode,input,output,key,...extra]=process.argv.slice(2);
  if(extra.length||!(mode==='init'||mode==='renew')||!input||!output||!key)throw new Error();
  process.stdout.write(JSON.stringify(issueGreenfieldAuthority(mode,input,output,key,process.env))+'\n');
} catch {
  process.stderr.write('G7_GREENFIELD_OWNER_BLOCKED\n');
  process.exitCode=1;
}