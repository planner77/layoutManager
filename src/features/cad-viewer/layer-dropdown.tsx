'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Button } from '@/components/ui/button';

export function LayerDropdown({
  layers,
  selected,
  onLayerChange,
  onAllChange,
}: {
  layers: string[];
  selected: ReadonlySet<string>;
  onLayerChange: (name: string, visible: boolean) => void;
  onAllChange: (visible: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <Button data-testid="layer-dropdown-trigger" variant="outline" aria-label={`레이어 선택, ${selected.size}/${layers.length}개 선택됨`}>
          레이어 {selected.size}/{layers.length}
          <ChevronDown aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={16}
          aria-label="레이어 선택"
          className="z-50 max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm text-slate-800 shadow-lg"
        >
          <div className="sticky top-0 z-10 flex gap-1 border-b border-slate-200 bg-white p-1">
            <DropdownMenu.Item asChild disabled={selected.size === layers.length} onSelect={(event) => { event.preventDefault(); onAllChange(true); }}>
              <Button size="sm" variant="ghost">전체 선택</Button>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild disabled={selected.size === 0} onSelect={(event) => { event.preventDefault(); onAllChange(false); }}>
              <Button size="sm" variant="ghost">전체 해제</Button>
            </DropdownMenu.Item>
          </div>
          {layers.map((name) => (
            <DropdownMenu.CheckboxItem
              key={name}
              checked={selected.has(name)}
              onCheckedChange={(checked) => onLayerChange(name, checked === true)}
              onSelect={(event) => event.preventDefault()}
              className="relative flex min-h-9 cursor-default select-none items-center rounded px-8 py-2 outline-none focus:bg-teal-50 data-[highlighted]:bg-teal-50"
            >
              <DropdownMenu.ItemIndicator className="absolute left-2 inline-flex size-4 items-center justify-center">
                <Check aria-hidden="true" className="size-4" />
              </DropdownMenu.ItemIndicator>
              <span className="min-w-0 break-all">{name}</span>
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
