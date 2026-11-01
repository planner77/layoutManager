import { describe, expect, it } from 'vitest';
import { canNavigateViewerCommand } from '../../features/cad-viewer/viewer-command-menu';

describe('TC-EPIC-37-49-UNIT-001: fail-closed app menu link', () => {
  it('does not expose navigation for disabled links or actions', () => {
    expect(canNavigateViewerCommand({ kind: 'link', href: '/api/cad-files/v/content', disabled: true })).toBe(false);
    expect(canNavigateViewerCommand({ kind: 'link', href: '', disabled: false })).toBe(false);
    expect(canNavigateViewerCommand({ kind: 'action', href: '/api/cad-files/v/content' })).toBe(false);
  });

  it('preserves navigation of enabled version/download links', () => {
    expect(canNavigateViewerCommand({ kind: 'link', href: '/cad/locations/x' })).toBe(true);
    expect(canNavigateViewerCommand({ kind: 'link', href: '/api/cad-files/x/content' })).toBe(true);
  });
});
