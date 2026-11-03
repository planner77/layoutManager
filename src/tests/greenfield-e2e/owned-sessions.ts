/** Test-owned G7 sessions are server resources; closing a context alone does not revoke them. */
type Reply={status():number;json():Promise<unknown>};
export type SessionApi={
  get(path:string):Promise<Reply>;
  post(path:string,options:{headers:{origin:string;'x-csrf-token':string}}):Promise<Reply>;
};
type Owned={api:SessionApi;close?:()=>Promise<void>};
const SESSION='/api/g7-runtime/auth/session';
const LOGOUT='/api/g7-runtime/auth/logout';
const rec=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);

export class OwnedSessions {
  private owned:Owned[]=[];
  constructor(private readonly origin:string){}
  add(api:SessionApi,close?:()=>Promise<void>){this.owned.push({api,close});}
  async cleanup():Promise<void>{
    const errors:Error[]=[];
    for(const {api,close} of this.owned.reverse()){
      try{
        let active:Reply;
        try{active=await api.get(SESSION);}catch{throw new Error('G7_SESSION_GET_FAILED');}
        if(active.status()===200){
          let session:unknown;
          try{session=await active.json();}catch{throw new Error('G7_SESSION_JSON_INVALID');}
          if(!rec(session)||typeof session.csrfToken!=='string'||!session.csrfToken)throw new Error('G7_SESSION_CSRF_MISSING');
          let logout:Reply;
          try{logout=await api.post(LOGOUT,{headers:{origin:this.origin,'x-csrf-token':session.csrfToken}});}
          catch{throw new Error('G7_SESSION_LOGOUT_FAILED');}
          if(logout.status()!==200&&logout.status()!==401)throw new Error(`G7_SESSION_LOGOUT_STATUS_${logout.status()}`);
        }else if(active.status()!==401)throw new Error(`G7_SESSION_GET_STATUS_${active.status()}`);
      }catch(error){errors.push(error instanceof Error?error:new Error('G7_SESSION_CLEANUP_FAILED'));}
      finally{if(close)try{await close();}catch{errors.push(new Error('G7_CONTEXT_CLOSE_FAILED'));}}
    }
    this.owned=[];
    if(errors.length)throw new AggregateError(errors,'G7_SESSION_CLEANUP_FAILED');
  }
}

/** Preserves the body failure while still reporting every failed cleanup. */
export async function withOwnedSessions<T>(origin:string,body:(owned:OwnedSessions)=>Promise<T>):Promise<T>{
  const owned=new OwnedSessions(origin);let value:T|undefined,primary:unknown,failed=false,cleanup:unknown;
  try{value=await body(owned);}catch(error){failed=true;primary=error;}
  try{await owned.cleanup();}catch(error){cleanup=error;}
  if(failed&&cleanup)throw new AggregateError([primary,cleanup],'G7_BODY_AND_SESSION_CLEANUP_FAILED');
  if(failed)throw primary;
  if(cleanup)throw cleanup;
  return value as T;
}
