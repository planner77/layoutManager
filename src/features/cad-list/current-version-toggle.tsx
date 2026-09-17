'use client';

import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CurrentVersionToggle({ active, href }: { active: boolean; href: string }) {
  const router = useRouter();
  return <Button
    type="button"
    variant={active ? 'default' : 'outline'}
    aria-pressed={active}
    onClick={() => router.push(href)}
  >
    {active ? <Check size={16} aria-hidden="true"/> : null}
    현재 버전만 표시
  </Button>;
}
