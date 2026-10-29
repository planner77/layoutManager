import { notFound, redirect } from 'next/navigation';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { openG7RuntimeDb } from '@/server/g7-operational/runtime-db';
import { RuntimeFirstSetup } from '@/features/g7-runtime/first-setup';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export default function FirstSetupPage() {
  const gate=resolveG7RuntimeGate();
  if(gate.state!=='ACTIVE'||gate.operationMode!=='SELF_HOSTED')notFound();
  const db=openG7RuntimeDb(gate,true);
  let initialized=false;
  try{initialized=Number(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n)!==0;}
  finally{db.close();}
  if(initialized)redirect('/g7-runtime');
  return <RuntimeFirstSetup/>;
}
