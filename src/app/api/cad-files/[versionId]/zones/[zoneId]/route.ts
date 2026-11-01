import {zoneRequest} from '@/server/cad-business/zone-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Args={params:Promise<{versionId:string;zoneId:string}>};
export async function PATCH(request:Request,{params}:Args){const p=await params;return zoneRequest(request,'zones-change',p.versionId,p.zoneId);}
export async function DELETE(request:Request,{params}:Args){const p=await params;return zoneRequest(request,'zones-delete',p.versionId,p.zoneId);}
