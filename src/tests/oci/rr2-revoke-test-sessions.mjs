/** RR2 test-only cleanup of sessions left by closed Playwright contexts. */
import Database from 'better-sqlite3';
import {readFileSync} from 'node:fs';
const nonce=process.env.RR2_NONCE;
if(!/^[0-9a-f]{16}$/.test(nonce??'')||
   readFileSync('/data/rr2-ownership.marker','utf8')!=='RR2:'+nonce+'\n')
  throw Error('RR2_VOLUME_NOT_OWNED');
const db=new Database('/data/db/cad.sqlite',{fileMustExist:true});
try{
  const now=Date.now();
  const changed=db.prepare('UPDATE "AuthSession" SET revoked_at=? WHERE revoked_at IS NULL').run(now);
  process.stdout.write(JSON.stringify({kind:'RR2_TEST_SESSIONS_REVOKED',count:changed.changes})+'\n');
}finally{db.close();}
