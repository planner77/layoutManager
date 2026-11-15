/** Clear protected Viewer snapshots together after a current-scope 401/403.
 * This is a local browser event; it never refetches or changes login status.
 */
export type ProtectedViewerScope={actorId:string;sessionEpoch:number;versionId:string;sourceSha256:string};
const eventName='layoutManager:protected-viewer-scope-denied';
const retryEventName='layoutManager:protected-viewer-scope-retry';
export function sameProtectedResource(a:Pick<ProtectedViewerScope,'actorId'|'versionId'|'sourceSha256'>,
 b:Pick<ProtectedViewerScope,'actorId'|'versionId'|'sourceSha256'>):boolean{
 return a.actorId===b.actorId&&a.versionId===b.versionId&&a.sourceSha256===b.sourceSha256;
}
export function isProtectedAccessDenied(error:unknown):boolean{
 const status=error&&typeof error==='object'&&'status' in error?(error as {status?:unknown}).status:undefined;
 return status===401||status===403;
}
export function sameProtectedScope(a:ProtectedViewerScope,b:ProtectedViewerScope):boolean{
 return a.actorId===b.actorId&&a.sessionEpoch===b.sessionEpoch&&a.versionId===b.versionId&&a.sourceSha256===b.sourceSha256;
}
export function denyProtectedViewerScope(scope:ProtectedViewerScope):void{
 window.dispatchEvent(new CustomEvent<ProtectedViewerScope>(eventName,{detail:scope}));
}
export function onProtectedViewerScopeDenied(listener:(scope:ProtectedViewerScope)=>void):()=>void{
 const handle=(event:Event)=>listener((event as CustomEvent<ProtectedViewerScope>).detail);
 window.addEventListener(eventName,handle);
 return()=>window.removeEventListener(eventName,handle);
}
export function retryProtectedViewerScope(scope:Pick<ProtectedViewerScope,'actorId'|'versionId'|'sourceSha256'>):void{
 window.dispatchEvent(new CustomEvent(retryEventName,{detail:scope}));
}
export function onProtectedViewerScopeRetry(listener:(scope:Pick<ProtectedViewerScope,'actorId'|'versionId'|'sourceSha256'>)=>void):()=>void{
 const handle=(event:Event)=>listener((event as CustomEvent<Pick<ProtectedViewerScope,'actorId'|'versionId'|'sourceSha256'>>).detail);
 window.addEventListener(retryEventName,handle);
 return()=>window.removeEventListener(retryEventName,handle);
}
