declare module 'three-dxf-viewer' {
  import type { Group } from 'three';
  export class DXFViewer {
    useCache: boolean;
    layers: Record<string, unknown>;
    lastDXF: {entities?:unknown[]};
    subscribe(event:'progress',callback:(message:string)=>void):void;
    getFromPath(path: string, fontPath: string): Promise<Group | null>;
  }
}
