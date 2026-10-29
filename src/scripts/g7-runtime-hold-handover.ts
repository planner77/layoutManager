/** Explicit offline operator command. No HTTP route, startup hook, or auto migrator invokes this. */
import {
  handoverG7ApprovedMigrationHold, inspectG7ApprovedHoldEvidence,
} from '../server/g7-operational/runtime-migration';

try {
  const env=process.env;
  if(env.G7_RUNTIME_HOLD_ACTION==='INSPECT') {
    process.stdout.write(JSON.stringify(inspectG7ApprovedHoldEvidence({env}))+'\n');
  } else if(env.G7_RUNTIME_HOLD_ACTION==='HANDOVER'&&
            env.G7_RUNTIME_OLD_APPROVAL_PATH&&env.G7_RUNTIME_HANDOVER_PATH) {
    process.stdout.write(JSON.stringify(handoverG7ApprovedMigrationHold(
      {env},env.G7_RUNTIME_OLD_APPROVAL_PATH,env.G7_RUNTIME_HANDOVER_PATH))+'\n');
  } else throw new Error();
} catch {
  process.stderr.write('G7_APPROVED_HOLD_HANDOVER_BLOCKED\n');
  process.exitCode=1;
}
