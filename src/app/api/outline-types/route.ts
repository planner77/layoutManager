import { handleOutlineTypeRequest } from '@/server/outline/type-catalog-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleOutlineTypeRequest(request,'list');}
export async function POST(request:Request){return handleOutlineTypeRequest(request,'create');}
