/** Public output is restricted to fixed status/count fields, never source data. */
import {
  captureG7DisposableSnapshot, migrateG7DisposableClone,
  restoreG7DisposableSnapshot, verifyG7DisposableRollback,
  migrateG7ApprovedDatabase,
} from '../server/g7-operational/runtime-migration';
const options={env:process.env};
const [action,snapshotId,epoch,...extra]=process.argv.slice(2);
try {
  if(extra.length)throw new Error();
  let result;
  if(action==='capture'&&snapshotId&&epoch)result=captureG7DisposableSnapshot(options,snapshotId,epoch);
  else if(action==='migrate'&&!snapshotId&&!epoch)result=migrateG7DisposableClone(options);
  else if(action==='restore'&&snapshotId&&!epoch)result=restoreG7DisposableSnapshot(options,snapshotId);
  else if(action==='verify-rollback'&&!snapshotId&&!epoch)result=verifyG7DisposableRollback(options);
  else if(action==='apply-approved'&&!snapshotId&&!epoch)result=migrateG7ApprovedDatabase(options);
  else throw new Error();
  process.stdout.write(JSON.stringify(result)+'\n');
}catch{
  process.stderr.write('G7_DISPOSABLE_REHEARSAL_BLOCKED\n');
  process.exitCode=1;
}
