/** #153: a deliberate, one-shot setup tool; never an app startup side-effect. */
import { initializeGreenfield, seedGreenfieldSites } from '../server/g7-operational/greenfield-install';
import { ensureAutomatedGreenfield, rotateAutomatedSetupCode } from '../server/g7-operational/greenfield-auto';
import { applyGreenfieldUpgrade, planGreenfieldUpgrade, restoreGreenfieldUpgrade,
  statusGreenfieldUpgrade } from '../server/g7-operational/greenfield-upgrade-engine';

const errorCodes=new Set([
  'G7_UPGRADE_UNSUPPORTED_PATH','G7_UPGRADE_UNSUPPORTED_MODE',
  'G7_UPGRADE_SCHEMA_INCOMPATIBLE','G7_UPGRADE_PAIR_MISMATCH',
  'G7_UPGRADE_STORAGE_UNSAFE','G7_UPGRADE_DATA_INTEGRITY','G7_UPGRADE_DATA_CHANGED',
  'G7_UPGRADE_BACKUP_REQUIRED','G7_UPGRADE_RESTORE_REQUIRED','G7_UPGRADE_APPROVAL_REQUIRED',
  'G7_UPGRADE_MAINTENANCE_REQUIRED','G7_UPGRADE_INSTALL_UNKNOWN','G7_UPGRADE_MIGRATION_FAILED',
  'G7_UPGRADE_RESTORE_TARGET_INVALID','G7_UPGRADE_BACKUP_INVALID','G7_UPGRADE_SETUP_INCOMPLETE',
  'G7_AUTO_CONFIGURATION','G7_AUTO_RELEASE_INVALID','G7_AUTO_IMAGE_PAIR_INVALID',
  'G7_AUTO_STORAGE_INVALID','G7_AUTO_STORAGE_UNSAFE','G7_AUTO_FILE_UNSAFE',
  'G7_AUTO_INSTALL_INVALID','G7_AUTO_RELEASE_MISMATCH',
  'G7_AUTO_NONEMPTY_VOLUME_USE_NEW_EMPTY_VOLUME','G7_AUTO_SETUP_ALREADY_COMPLETE',
  'G7_AUTO_SETUP_EXPIRED','G7_AUTO_SETUP_INCOMPLETE',
]);
export async function main(args:readonly string[],env=process.env):Promise<number> {
  try {
    if(args.length===1 && args[0]==='auto') {
      const plan=planGreenfieldUpgrade(env);
      const result=plan.decision==='FRESH_INSTALL'?ensureAutomatedGreenfield(env):
        await applyGreenfieldUpgrade(env);
      process.stdout.write(JSON.stringify(result)+'\n');
      return 0;
    }
    if(args.length===1 && (args[0]==='preflight'||args[0]==='plan')){
      const plan=planGreenfieldUpgrade(env);
      process.stdout.write(JSON.stringify({state:plan.decision,planId:plan.planId,
        from:plan.from,to:plan.to,requiresApproval:plan.requiresApproval,
        steps:plan.chain.map(e=>e.kind)})+'\n');return 0;
    }
    if(args.length===1 && args[0]==='status'){
      process.stdout.write(JSON.stringify(statusGreenfieldUpgrade(env))+'\n');return 0;
    }
    if(args[0]==='apply' && (args.length===1 || args.length===3 && args[1]==='--approve-plan' &&
      /^[a-f0-9]{64}$/.test(args[2]??''))){
      process.stdout.write(JSON.stringify(await applyGreenfieldUpgrade(env,args[2]))+'\n');return 0;
    }
    if(args[0]==='restore' && args.length===8 && args[1]==='--backup' &&
      args[3]==='--target-db-dir' && args[5]==='--target-cad-dir' &&
      args[7]==='--ack-empty-target'){
      process.stdout.write(JSON.stringify(restoreGreenfieldUpgrade(env,args[2],args[4],args[6]))+'\n');
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
  }catch(error){
    const code=error instanceof Error&&errorCodes.has(error.message)?error.message:
      'G7_GREENFIELD_SETUP_BLOCKED';
    const commands=['auto','preflight','plan','apply','status','restore','setup-renew','init','seed-sites'];
    const stage=commands.includes(args[0]??'')?args[0]:'arguments';
    const restore=code==='G7_UPGRADE_RESTORE_REQUIRED'||code==='G7_UPGRADE_MIGRATION_FAILED';
    process.stderr.write(JSON.stringify({state:'BLOCKED',code,stage,retryable:!restore,
      nextAction:restore?'VERIFY_RECOVERY_SET_AND_RESTORE_ISOLATED':
        code==='G7_UPGRADE_BACKUP_REQUIRED'?'CHECK_BACKUP_PREREQUISITES':
        code==='G7_UPGRADE_APPROVAL_REQUIRED'?'REVIEW_PLAN_AND_APPROVE':
        code==='G7_UPGRADE_MAINTENANCE_REQUIRED'?'STOP_APP_AND_VERIFY_IMAGE_PAIR':
        'RUN_PREFLIGHT'})+'\n');
    return 1;
  }
  process.stderr.write(JSON.stringify({state:'BLOCKED',code:'G7_GREENFIELD_SETUP_BLOCKED',stage:'arguments',
    retryable:true,nextAction:'CHECK_COMMAND'})+'\n');
  return 1;
}
main(process.argv.slice(2)).then(code=>{process.exitCode=code;});
