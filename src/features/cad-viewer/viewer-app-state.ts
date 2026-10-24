/**
 * UI-only state shared by the U1 shell and future U2/U3/U6 controls.
 * Never use it as a dependency of ViewerManager.load().
 */
export type ViewerCompactPanel = 'layers' | 'outlines' | null;

export type ViewerAppState = {
  layerPanelOpen: boolean;
  outlineToolEnabled: boolean;
  outlineTreeOpen: boolean;
  compactPanel: ViewerCompactPanel;
};

export type ViewerAppAction =
  | { type: 'toggle-layers' }
  | { type: 'close-layers' }
  | { type: 'set-outline-tool'; enabled: boolean }
  | { type: 'toggle-outline-tree' }
  | { type: 'reset' };

export const initialViewerAppState: ViewerAppState = {
  layerPanelOpen: true,
  outlineToolEnabled: false,
  outlineTreeOpen: false,
  compactPanel: 'layers',
};

export function viewerAppReducer(state: ViewerAppState, action: ViewerAppAction): ViewerAppState {
  switch (action.type) {
    case 'reset':
      return { ...initialViewerAppState };
    case 'toggle-layers': {
      const layerPanelOpen = !state.layerPanelOpen;
      return {
        ...state,
        layerPanelOpen,
        compactPanel: layerPanelOpen
          ? 'layers'
          : state.compactPanel === 'layers'
            ? (state.outlineTreeOpen ? 'outlines' : null)
            : state.compactPanel,
      };
    }
    case 'close-layers':
      return state.layerPanelOpen ? viewerAppReducer(state, { type: 'toggle-layers' }) : state;
    case 'set-outline-tool':
      return { ...state, outlineToolEnabled: action.enabled };
    case 'toggle-outline-tree': {
      const outlineTreeOpen = !state.outlineTreeOpen;
      return {
        ...state,
        outlineTreeOpen,
        compactPanel: outlineTreeOpen
          ? 'outlines'
          : state.compactPanel === 'outlines'
            ? (state.layerPanelOpen ? 'layers' : null)
            : state.compactPanel,
      };
    }
  }
}
