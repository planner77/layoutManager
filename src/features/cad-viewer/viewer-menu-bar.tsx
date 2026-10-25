'use client';

import type { Ref } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Menu commands do not touch Viewer adapters; the caller owns all state.
 * U3 outline mode is a controlled toggle; U4/U6 remain disabled.
 */
export function ViewerMenuBar({
  layerAvailable,
  layerPanelOpen,
  layerToggleRef,
  onToggleLayerPanel,
  outlineAvailable,
  outlineUnavailableReason,
  outlineToolEnabled,
  onToggleOutlineTool,
  outlineTreeOpen,
}: {
  layerAvailable: boolean;
  layerPanelOpen: boolean;
  layerToggleRef: Ref<HTMLButtonElement>;
  onToggleLayerPanel: () => void;
  outlineAvailable: boolean;
  outlineUnavailableReason: string | null;
  outlineToolEnabled: boolean;
  onToggleOutlineTool: () => void;
  outlineTreeOpen: boolean;
}) {
  return (
    <nav
      aria-label="도면 앱 메뉴"
      data-testid="viewer-menu-bar"
      className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-slate-700 bg-slate-900 px-2 py-1 text-white"
    >
      <span className="shrink-0 text-xs font-semibold tracking-wide text-teal-200">CAD VIEWER</span>
      <Button
        ref={layerToggleRef}
        type="button"
        size="sm"
        variant="outline"
        data-testid="viewer-menu-layers"
        aria-label={layerAvailable && !layerPanelOpen ? '레이어 패널 펼치기' : '레이어'}
        aria-expanded={layerAvailable && layerPanelOpen}
        aria-pressed={layerAvailable && layerPanelOpen}
        aria-controls={layerAvailable ? 'viewer-layer-dock' : undefined}
        title={layerAvailable ? '레이어 패널 보기/숨기기 (도면 레이어 표시 상태는 유지)' : '이 Renderer에는 레이어 패널이 없습니다.'}
        disabled={!layerAvailable}
        onClick={onToggleLayerPanel}
        className="shrink-0"
      >
        레이어
      </Button>
      <Button
        type="button" size="sm" variant="outline"
        data-testid="viewer-menu-outline-tool"
        aria-pressed={outlineToolEnabled}
        aria-expanded={outlineToolEnabled}
        aria-controls={outlineToolEnabled ? 'viewer-tools-dock' : undefined}
        aria-describedby={!outlineAvailable ? 'viewer-outline-unavailable-reason' : undefined}
        disabled={!outlineAvailable}
        title={outlineUnavailableReason ?? (outlineToolEnabled
          ? '외곽선 생성 끄기: 비확정 선택·미리보기 취소, 확정된 결과 보존'
          : '외곽선 생성 켜기: 객체 선택 도구 활성화')}
        onClick={onToggleOutlineTool}
        className="shrink-0"
      >외곽선 생성: {outlineToolEnabled ? 'ON' : 'OFF'}</Button>
      {!outlineAvailable && <span id="viewer-outline-unavailable-reason" className="sr-only">
        {outlineUnavailableReason}
      </span>}
      <Button
        type="button" size="sm" variant="outline"
        data-testid="viewer-menu-outline-tree"
        aria-pressed={outlineTreeOpen}
        disabled
        title="후속 이슈 #43에서 외곽선 타입별 트리를 제공합니다."
        className="shrink-0"
      >외곽선 목록 (준비 중)</Button>
      <Button
        type="button" size="sm" variant="outline"
        data-testid="viewer-menu-outline-types"
        disabled
        title="관리자 인증·인가 및 업무 타입 정책 승인 전에는 등록 기능을 제공하지 않습니다. (#41)"
        className="shrink-0"
      >외곽선 타입 관리 (관리자 전용 · 준비 중)</Button>
    </nav>
  );
}
