/** #138: Viewer-workspace CSS-pixel coordinates (never CAD WCS). */
export type ViewerPanelPosition=Readonly<{mode:'edge'|'floating';x:number;y:number}>;
export const EDGE_PANEL_POSITION:ViewerPanelPosition={mode:'edge',x:0,y:0};
export type ViewerPanelSize=Readonly<{width:number;height:number}>;
const nonnegative=(v:number)=>Number.isFinite(v)?Math.max(0,v):0;
/** Keep the entire panel in the available workspace after resize/fullscreen/zoom. */
export function clampViewerPanelPosition(x:number,y:number,workspace:ViewerPanelSize,panel:ViewerPanelSize){
 const maxX=Math.max(0,nonnegative(workspace.width)-nonnegative(panel.width));
 const maxY=Math.max(0,nonnegative(workspace.height)-nonnegative(panel.height));
 const finite=(v:number)=>Number.isFinite(v)?v:0;
 return {x:Math.min(maxX,Math.max(0,finite(x))),y:Math.min(maxY,Math.max(0,finite(y)))};
}
