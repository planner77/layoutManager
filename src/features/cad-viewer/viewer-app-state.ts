/**
 * UI-only state shared by the U1 shell and the temporary #85 Memo Tree.
 * Never use it as a dependency of ViewerManager.load() or server persistence.
 */
export type ViewerCompactPanel = 'layers' | 'outlines' | 'memos' | 'tools' | null;

export type ViewerAppState = {
  layerPanelOpen: boolean;
  outlineToolEnabled: boolean;
  outlineTreeOpen: boolean;
  memoTreeOpen: boolean;
  toolsOpen: boolean;
  compactPanel: ViewerCompactPanel;
};

export type ViewerAppAction =
  | { type: 'toggle-layers'; exclusive?: boolean }
  | { type: 'close-layers' }
  | { type: 'set-outline-tool'; enabled: boolean }
  | { type: 'toggle-outline-tree'; exclusive?: boolean }
  | { type: 'toggle-memo-tree'; exclusive?: boolean }
  | { type: 'toggle-tools'; exclusive?: boolean }
  | { type: 'compact-exclusive' }
  | { type: 'close-tools' }
  | { type: 'reset' };

export const initialViewerAppState: ViewerAppState = {
  layerPanelOpen: true,
  outlineToolEnabled: false,
  outlineTreeOpen: false,
  memoTreeOpen: false,
  toolsOpen: false,
  compactPanel: 'layers',
};

function firstOpen(state: ViewerAppState): ViewerCompactPanel {
  if (state.layerPanelOpen) return 'layers';
  if (state.outlineTreeOpen) return 'outlines';
  if (state.memoTreeOpen) return 'memos';
  if (state.toolsOpen) return 'tools';
  return null;
}

export function viewerAppReducer(state: ViewerAppState, action: ViewerAppAction): ViewerAppState {
  switch (action.type) {
    case 'reset':
      return { ...initialViewerAppState };
    case 'compact-exclusive': {
      const active =
        state.compactPanel === 'layers' && state.layerPanelOpen ? 'layers' :
        state.compactPanel === 'outlines' && state.outlineTreeOpen ? 'outlines' :
        state.compactPanel === 'memos' && state.memoTreeOpen ? 'memos' :
        state.compactPanel === 'tools' && state.toolsOpen ? 'tools' : firstOpen(state);
      return {
        ...state, compactPanel: active,
        layerPanelOpen: active === 'layers',
        outlineTreeOpen: active === 'outlines',
        memoTreeOpen: active === 'memos',
        toolsOpen: active === 'tools',
      };
    }
    case 'toggle-layers': {
      const layerPanelOpen = !state.layerPanelOpen;
      const next = {
        ...state,
        layerPanelOpen,
        outlineTreeOpen: action.exclusive && layerPanelOpen ? false : state.outlineTreeOpen,
        memoTreeOpen: action.exclusive && layerPanelOpen ? false : state.memoTreeOpen,
        toolsOpen: action.exclusive && layerPanelOpen ? false : state.toolsOpen,
      };
      return { ...next, compactPanel: layerPanelOpen ? 'layers' :
        state.compactPanel === 'layers' ? firstOpen(next) : state.compactPanel };
    }
    case 'close-layers':
      return state.layerPanelOpen ? viewerAppReducer(state, { type: 'toggle-layers' }) : state;
    case 'set-outline-tool':
      return { ...state, outlineToolEnabled: action.enabled };
    case 'toggle-tools': {
      const toolsOpen = !state.toolsOpen;
      const next = {
        ...state, toolsOpen,
        layerPanelOpen: action.exclusive && toolsOpen ? false : state.layerPanelOpen,
        outlineTreeOpen: action.exclusive && toolsOpen ? false : state.outlineTreeOpen,
        memoTreeOpen: action.exclusive && toolsOpen ? false : state.memoTreeOpen,
      };
      return { ...next, compactPanel: toolsOpen ? 'tools' :
        state.compactPanel === 'tools' ? firstOpen(next) : state.compactPanel };
    }
    case 'close-tools':
      return state.toolsOpen ? viewerAppReducer(state, { type: 'toggle-tools' }) : state;
    case 'toggle-outline-tree': {
      const outlineTreeOpen = !state.outlineTreeOpen;
      // Outline Tree and Memo Tree share exactly one right-hand dock.
      const next = {
        ...state, outlineTreeOpen,
        memoTreeOpen: outlineTreeOpen ? false : state.memoTreeOpen,
        layerPanelOpen: action.exclusive && outlineTreeOpen ? false : state.layerPanelOpen,
        toolsOpen: action.exclusive && outlineTreeOpen ? false : state.toolsOpen,
      };
      return { ...next, compactPanel: outlineTreeOpen ? 'outlines' :
        state.compactPanel === 'outlines' ? firstOpen(next) : state.compactPanel };
    }
    case 'toggle-memo-tree': {
      const memoTreeOpen = !state.memoTreeOpen;
      const next = {
        ...state, memoTreeOpen,
        outlineTreeOpen: memoTreeOpen ? false : state.outlineTreeOpen,
        layerPanelOpen: action.exclusive && memoTreeOpen ? false : state.layerPanelOpen,
        toolsOpen: action.exclusive && memoTreeOpen ? false : state.toolsOpen,
      };
      return { ...next, compactPanel: memoTreeOpen ? 'memos' :
        state.compactPanel === 'memos' ? firstOpen(next) : state.compactPanel };
    }
  }
}
