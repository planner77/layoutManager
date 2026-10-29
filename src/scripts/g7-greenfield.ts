/** #153: a deliberate, one-shot setup tool; never an app startup side-effect. */
import { initializeGreenfield, seedGreenfieldSites } from '../server/g7-operational/greenfield-install';
import { ensureAutomatedGreenfield, rotateAutomatedSetupCode } from '../server/g7-operational/greenfield-auto';

export function main(args:readonly string[],env=process.env):number {
  try {
    if(args.length===1 && args[0]==='auto') {
      process.stdout.write(JSON.stringify(ensureAutomatedGreenfield(env))+'\n');
      return 0;
    }
    if(args.length===1 && args[0]==='setup-renew') {
      process.stdout.write(JSON.stringify(rotateAutomatedSetupCode(env))+'\n');
      return 0;
    }
    if (args.length===2 && args[0]==='init' && args[1]==='--ack-empty-db') {
      const result=initializeGreenfield(env);
      process.stdout.write(JSON.stringify(result)+'\n');
      return 0;
    }
    if(args.length===2 && args[0]==='seed-sites' && args[1]==='--ack-empty-site-master'){
      const result=seedGreenfieldSites(env);
      process.stdout.write(JSON.stringify(result)+'\n');
      return 0;
    }
  }catch{/* No raw source data, SQL or private filenames in operator output. */}
  process.stderr.write('G7_GREENFIELD_SETUP_BLOCKED\n');
  return 1;
}
process.exitCode=main(process.argv.slice(2));