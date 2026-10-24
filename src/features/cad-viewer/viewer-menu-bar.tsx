'use client';

import { Button } from '@/components/ui/button';

/**
 * Menu commands do not touch Viewer adapters; the caller owns all state.
 * Unimplemented U3/U4/U6 entries are deliberately disabled, not faux controls.
 */
export function ViewerMenuBar({
  layerAvailable,
  layerPanelOpen,
  onToggleLayerPanel,
  outlineAvailable,
  outlineToolEnabled,
  outlineTreeOpen,
}: {
  layerAvailable: boolean;
  layerPanelOpen: boolean;
  onToggleLayerPanel: () => void;
  outlineAvailable: boolean;
  outlineToolEnabled: boolean;
  outlineTreeOpen: boolean;
}) {
  const outlineUnavailableReason = outlineAvailable
    ? '후속 이슈 #40에서 상단 메뉴로 외곽선 생성 모드를 제어합니다.'
    : '외곽선 기능은 DXF + three-dxf-viewer에서만 지원합니다.';
  return (
    <nav
      aria-label="도면 앱 메뉴"
      data-testid="viewer-menu-bar"
      className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-slate-700 bg-slate-900 px-2 py-1 text-white"
    >
      <span className="shrink-0 text-xs font-semibold tracking-wide text-teal-200">CAD VIEWER</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="viewer-menu-layers"
        aria-label={layerAvailable && !layerPanelOpen ? '레이어 패널 펼치기' : '레이어'}
        aria-expanded={layerAvailable && layerPanelOpen}
        aria-pressed={layerAvailable && layerPanelOpen}
        aria-controls="viewer-layer-dock"
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
        disabled
        title={outlineUnavailableReason}
        className="shrink-0"
      >외곽선 생성 (준비 중)</Button>
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
