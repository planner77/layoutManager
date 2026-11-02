import { handleOutlineTypeRequest } from '@/server/outline/type-catalog-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Args={params:Promise<{typeId:string}>};
export async function PATCH(request:Request,args:Args){return handleOutlineTypeRequest(request,'update',(await args.params).typeId);}
