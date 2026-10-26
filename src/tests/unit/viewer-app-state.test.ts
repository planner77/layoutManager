import { describe, expect, it } from 'vitest';
import { initialViewerAppState, viewerAppReducer } from '../../features/cad-viewer/viewer-app-state';

describe('TC-U1-UNIT-001: viewer app docking state', () => {
  it('starts with layers visible, outline tool off and outline tree closed', () => {
    expect(initialViewerAppState).toEqual({
      layerPanelOpen: true,
      outlineToolEnabled: false,
      outlineTreeOpen: false,
      toolsOpen: false,
      compactPanel: 'layers',
    });
  });

  it('toggles the layer dock without changing unrelated state or CAD layer selection', () => {
    const originalSelection = new Set(['EQUIP']);
    const state = { ...initialViewerAppState, outlineToolEnabled: true, outlineTreeOpen: true };
    const closed = viewerAppReducer(state, { type: 'toggle-layers' });
    expect(closed).toMatchObject({
      layerPanelOpen: false,
      outlineToolEnabled: true,
      outlineTreeOpen: true,
      compactPanel: 'outlines',
    });
    const reopened = viewerAppReducer(closed, { type: 'toggle-layers' });
    expect(reopened).toMatchObject({
      layerPanelOpen: true,
      outlineToolEnabled: true,
      outlineTreeOpen: true,
      compactPanel: 'layers',
    });
    expect(originalSelection).toEqual(new Set(['EQUIP']));
    expect(state.layerPanelOpen).toBe(true);
  });

  it('respects independent tool/tree switches and resets for a different renderer or reload', () => {
    let state = viewerAppReducer(initialViewerAppState, { type: 'set-outline-tool', enabled: true });
    state = viewerAppReducer(state, { type: 'toggle-outline-tree' });
    expect(state).toMatchObject({ layerPanelOpen: true, outlineToolEnabled: true, outlineTreeOpen: true, compactPanel: 'outlines' });
    state = viewerAppReducer(state, { type: 'toggle-outline-tree' });
    expect(state).toMatchObject({ layerPanelOpen: true, outlineToolEnabled: true, outlineTreeOpen: false, compactPanel: 'layers' });
    state = viewerAppReducer(state, { type: 'close-layers' });
    expect(viewerAppReducer(state, { type: 'close-layers' })).toBe(state);
    expect(viewerAppReducer(state, { type: 'reset' })).toEqual(initialViewerAppState);
  });

  it('keeps the bottom tool drawer independent of generation and other panels', () => {
    const opened=viewerAppReducer(initialViewerAppState,{type:'toggle-tools'});
    expect(opened).toMatchObject({toolsOpen:true,outlineToolEnabled:false,layerPanelOpen:true,compactPanel:'tools'});
    const closed=viewerAppReducer(opened,{type:'close-tools'});
    expect(closed).toEqual(initialViewerAppState);
    expect(viewerAppReducer(closed,{type:'close-tools'})).toBe(closed);
  });


  it('uses one visible modal drawer on mobile without changing generation mode', () => {
    let state=viewerAppReducer(initialViewerAppState,{type:'toggle-tools',exclusive:true});
    expect(state).toMatchObject({layerPanelOpen:false,toolsOpen:true,outlineTreeOpen:false,compactPanel:'tools'});
    state=viewerAppReducer(state,{type:'set-outline-tool',enabled:true});
    state=viewerAppReducer(state,{type:'toggle-outline-tree',exclusive:true});
    expect(state).toMatchObject({layerPanelOpen:false,toolsOpen:false,outlineTreeOpen:true,outlineToolEnabled:true,compactPanel:'outlines'});
    const migrated=viewerAppReducer({ ...state,layerPanelOpen:true,toolsOpen:true },{type:'compact-exclusive'});
    expect(migrated).toMatchObject({layerPanelOpen:false,toolsOpen:false,outlineTreeOpen:true,outlineToolEnabled:true});
  });

  it('is idempotent on internal panel close and restores the active compact dock on reopen', () => {
    const withTree = viewerAppReducer(initialViewerAppState, { type: 'toggle-outline-tree' });
    expect(withTree.compactPanel).toBe('outlines');
    const closed = viewerAppReducer(withTree, { type: 'close-layers' });
    expect(closed).toMatchObject({ layerPanelOpen: false, outlineTreeOpen: true, compactPanel: 'outlines' });
    expect(viewerAppReducer(closed, { type: 'close-layers' })).toBe(closed);
    const reopened = viewerAppReducer(closed, { type: 'toggle-layers' });
    expect(reopened).toMatchObject({ layerPanelOpen: true, outlineTreeOpen: true, compactPanel: 'layers' });
    expect(withTree.layerPanelOpen).toBe(true);
  });
});

describe('TC-U3-UNIT-001: outline tool state machine', () => {
  it('defaults OFF and switches without changing unrelated layer/tree state', () => {
    let state = initialViewerAppState;
    for (let i = 0; i < 10; i++) {
      state = viewerAppReducer(state, { type: 'set-outline-tool', enabled: true });
      expect(state).toMatchObject({ outlineToolEnabled: true, layerPanelOpen: true, outlineTreeOpen: false });
      state = viewerAppReducer(state, { type: 'set-outline-tool', enabled: false });
      expect(state).toEqual(initialViewerAppState);
    }
  });
  it('clears the enabled bit on renderer switch/reload (reset)', () => {
    const active = viewerAppReducer(initialViewerAppState, { type: 'set-outline-tool', enabled: true });
    expect(viewerAppReducer(active, { type: 'reset' })).toEqual(initialViewerAppState);
  });
});
