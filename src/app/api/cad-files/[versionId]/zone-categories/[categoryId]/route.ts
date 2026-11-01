import {zoneRequest} from '@/server/cad-business/zone-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Args={params:Promise<{versionId:string;categoryId:string}>};
export async function PATCH(request:Request,{params}:Args){const p=await params;return zoneRequest(request,'categories-change',p.versionId,p.categoryId);}
export async function DELETE(request:Request,{params}:Args){const p=await params;return zoneRequest(request,'categories-delete',p.versionId,p.categoryId);}
