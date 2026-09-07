export type ViewerFormat = 'DXF' | 'DWG';
export type ViewerRenderer = 'dxf-viewer' | 'three-dxf-viewer' | 'libredwg-web';
export function selectRenderer(format: ViewerFormat, requested?: string): ViewerRenderer {
  if (format === 'DWG') return 'libredwg-web';
  return requested === 'three-dxf-viewer' ? requested : 'dxf-viewer';
}
