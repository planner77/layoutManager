/**
 * UI-only state shared by the U1 shell and future U2/U3/U6 controls.
 * Never use it as a dependency of ViewerManager.load().
 */
export type ViewerCompactPanel = 'layers' | 'outlines' | 'tools' | null;

export type ViewerAppState = {
  layerPanelOpen: boolean;
  outlineToolEnabled: boolean;
  outlineTreeOpen: boolean;
  toolsOpen: boolean;
  compactPanel: ViewerCompactPanel;
};

export type ViewerAppAction =
  | { type: 'toggle-layers'; exclusive?: boolean }
  | { type: 'close-layers' }
  | { type: 'set-outline-tool'; enabled: boolean }
  | { type: 'toggle-outline-tree'; exclusive?: boolean }
  | { type: 'toggle-tools'; exclusive?: boolean }
  | { type: 'compact-exclusive' }
  | { type: 'close-tools' }
  | { type: 'reset' };

export const initialViewerAppState: ViewerAppState = {
  layerPanelOpen: true,
  outlineToolEnabled: false,
  outlineTreeOpen: false,
  toolsOpen: false,
  compactPanel: 'layers',
};

export function viewerAppReducer(state: ViewerAppState, action: ViewerAppAction): ViewerAppState {
  switch (action.type) {
    case 'reset':
      return { ...initialViewerAppState };
    case 'compact-exclusive': {
      const active=state.compactPanel==='layers' && state.layerPanelOpen ? 'layers' :
        state.compactPanel==='outlines' && state.outlineTreeOpen ? 'outlines' :
        state.compactPanel==='tools' && state.toolsOpen ? 'tools' :
        state.layerPanelOpen ? 'layers' : state.outlineTreeOpen ? 'outlines' : state.toolsOpen ? 'tools' : null;
      return { ...state, compactPanel:active,
        layerPanelOpen:active==='layers', outlineTreeOpen:active==='outlines', toolsOpen:active==='tools',
      };
    }
    case 'toggle-layers': {
      const layerPanelOpen = !state.layerPanelOpen;
      return {
        ...state,
        layerPanelOpen,
        outlineTreeOpen:action.exclusive && layerPanelOpen ? false : state.outlineTreeOpen,
        toolsOpen:action.exclusive && layerPanelOpen ? false : state.toolsOpen,
        compactPanel: layerPanelOpen
          ? 'layers'
          : state.compactPanel === 'layers'
            ? (state.outlineTreeOpen ? 'outlines' : state.toolsOpen ? 'tools' : null)
            : state.compactPanel,
      };
    }
    case 'close-layers':
      return state.layerPanelOpen ? viewerAppReducer(state, { type: 'toggle-layers' }) : state;
    case 'set-outline-tool':
      return { ...state, outlineToolEnabled: action.enabled };
    case 'toggle-tools': {
      const toolsOpen=!state.toolsOpen;
      return { ...state, toolsOpen,
        layerPanelOpen:action.exclusive && toolsOpen ? false : state.layerPanelOpen,
        outlineTreeOpen:action.exclusive && toolsOpen ? false : state.outlineTreeOpen,
        compactPanel: toolsOpen ? 'tools' :
        state.compactPanel==='tools' ? state.layerPanelOpen ? 'layers' : state.outlineTreeOpen ? 'outlines' : null : state.compactPanel };
    }
    case 'close-tools':
      return state.toolsOpen ? viewerAppReducer(state,{type:'toggle-tools'}) : state;
    case 'toggle-outline-tree': {
      const outlineTreeOpen = !state.outlineTreeOpen;
      return {
        ...state,
        outlineTreeOpen,
        layerPanelOpen:action.exclusive && outlineTreeOpen ? false : state.layerPanelOpen,
        toolsOpen:action.exclusive && outlineTreeOpen ? false : state.toolsOpen,
        compactPanel: outlineTreeOpen
          ? 'outlines'
          : state.compactPanel === 'outlines'
            ? (state.layerPanelOpen ? 'layers' : state.toolsOpen ? 'tools' : null)
            : state.compactPanel,
      };
    }
  }
}
