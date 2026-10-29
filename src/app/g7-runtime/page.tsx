import { notFound } from 'next/navigation';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { RuntimeAccount } from '@/features/g7-runtime/account';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default function RuntimeAccountPage() {
  if (resolveG7RuntimeGate().state !== 'ACTIVE') notFound();
  return <RuntimeAccount/>;
}
