import {zoneRequest} from '@/server/cad-business/zone-http';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Args={params:Promise<{versionId:string}>};
export async function GET(request:Request,{params}:Args){return zoneRequest(request,'categories-list',(await params).versionId);}
export async function POST(request:Request,{params}:Args){return zoneRequest(request,'categories-create',(await params).versionId);}
