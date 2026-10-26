'use client';

import { useEffect, useState, type FormEvent } from 'react';

type Actor = { id: string; roles: string[]; siteGrants: string[] };
type SessionBody = { actor?: Actor; csrfToken?: string; error?: { code?: string } };
const base = '/api/g7-operation';
const errorMessage = (code?: string) => ({
  UNAUTHENTICATED: '계정 또는 암호가 올바르지 않거나 세션이 만료되었습니다.',
  PASSWORD_CHANGE_REQUIRED: '최초 비밀번호를 변경한 뒤 로그인해주세요.',
  LOGIN_RATE_LIMITED: '로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.',
  SESSION_LIMIT: '동시 로그인 가능한 세션이 초과되었습니다.',
  ACCESS_DENIED: '현재 계정에는 해당 권한이 없습니다.',
  CSRF_DENIED: '요청이 유효하지 않습니다. 새로고침 후 시도해주세요.',
}[code ?? ''] ?? '요청을 처리하지 못했습니다.');
export function G7OperationLogin() {
  const [open,setOpen]=useState(false);
  const [user,setUser]=useState<Actor|null>(null);
  const [csrf,setCsrf]=useState('');
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [nextPassword,setNextPassword]=useState('');
  const [firstChange,setFirstChange]=useState(false);
  const [change,setChange]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');
  const [createName,setCreateName]=useState('');
  const [createSecret,setCreateSecret]=useState('');
  const [affected,setAffected]=useState('');
  const [grantKind,setGrantKind]=useState<'role'|'site'|'special'>('site');
  const [grantValue,setGrantValue]=useState('');
  const [grantOperation,setGrantOperation]=useState<'grant'|'revoke'>('grant');

  useEffect(()=>{
    let mounted=true;
    fetch(base+'/auth/session',{cache:'no-store',credentials:'same-origin'})
      .then(async r=>r.ok ? await r.json() as SessionBody : null)
      .then(v=>{if(mounted && v?.actor && v.csrfToken){
        setUser(v.actor);setCsrf(v.csrfToken);
      }})
      .catch(()=>{ /* the server gate still authorizes every operation */ });
    return ()=>{mounted=false;};
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(loading)return;
    setLoading(true);setError('');setInfo('');
    const action=firstChange?'initial-change':change?'change':'login';
    try {
      const res=await fetch(base+'/auth/'+action,{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json',...(change?{'x-csrf-token':csrf}:{})},
        body:JSON.stringify(firstChange?{login:username,password,newPassword:nextPassword}:
          change?{password,newPassword:nextPassword}:{login:username,password}),
      });
      const result=await res.json() as SessionBody;
      if(!res.ok) {
        if(result.error?.code==='PASSWORD_CHANGE_REQUIRED')setFirstChange(true);
        throw new Error(errorMessage(result.error?.code));
      }
      setPassword('');setNextPassword('');
      if(firstChange || change) {
        setFirstChange(false);setChange(false);setUser(null);setCsrf('');
        setInfo('암호 변경이 완료되었습니다. 다시 로그인해주세요.');
      } else {
        const session=await fetch(base+'/auth/session',{cache:'no-store',credentials:'same-origin'});
        if(!session.ok)throw new Error('로그인 후 세션을 확인하지 못했습니다.');
        const body=await session.json() as SessionBody;
        if(!body.actor || !body.csrfToken)throw new Error('세션 정보가 올바르지 않습니다.');
        setUser(body.actor);setCsrf(body.csrfToken);setInfo('로그인 완료');
      }
    } catch(e) {setError(e instanceof Error?e.message:'인증 요청 실패');}
    finally {setLoading(false);}
  }
  async function logout() {
    if(loading)return;
    setLoading(true);setError('');
    try {
      const r=await fetch(base+'/auth/logout',{
        method:'POST',credentials:'same-origin',headers:{'x-csrf-token':csrf},
      });
      if(!r.ok)throw new Error('로그아웃을 확인하지 못했습니다.');
      setUser(null);setCsrf('');setPassword('');setNextPassword('');
      setChange(false);setInfo('로그아웃되었습니다.');
    } catch(e){setError(e instanceof Error?e.message:'로그아웃 실패');}
    finally{setLoading(false);}
  }
  async function provision(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setLoading(true);setError('');setInfo('');
    try {
      const response=await fetch(base+'/access/create-user',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json','x-csrf-token':csrf},
        body:JSON.stringify({loginName:createName,temporaryPassword:createSecret}),
      });
      const result=await response.json() as {id?:string;error?:{code?:string}};
      if(!response.ok)throw new Error(errorMessage(result.error?.code));
      if(!result.id)throw new Error('생성된 계정 식별자를 확인할 수 없습니다.');
      setAffected(result.id);setCreateName('');setCreateSecret('');
      setInfo('Reader 계정이 생성되었습니다. 최초 암호 변경 후 사용 가능하며 Site/Editor는 별도 부여하세요.');
    }catch(e){setError(e instanceof Error?e.message:'계정 생성 실패');}
    finally{setLoading(false);}
  }
  async function submitGrant(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setLoading(true);setError('');setInfo('');
    try {
      const res=await fetch(base+'/access/grant',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json','x-csrf-token':csrf},
        body:JSON.stringify({kind:grantKind,operation:grantOperation,
          affectedUserId:affected,value:grantValue}),
      });
      const body=await res.json() as SessionBody;
      if(!res.ok)throw new Error(errorMessage(body.error?.code));
      setInfo('권한 변경을 반영했습니다.');setGrantValue('');
    }catch(e){setError(e instanceof Error?e.message:'권한 변경 실패');}
    finally{setLoading(false);}
  }
  return <div className="relative text-sm">
    <button type="button" onClick={()=>setOpen(!open)}
      className="rounded-md border border-slate-300 px-3 py-2 text-slate-700"
      aria-expanded={open} aria-controls="g7-auth-panel">
      {user?'로그인됨 · '+user.roles.join('/'):'운영 계정 로그인'}
    </button>
    {open && <section id="g7-auth-panel" aria-label="운영 계정 관리"
      className="absolute right-0 z-50 mt-2 w-[min(92vw,340px)] space-y-3 rounded-xl border bg-white p-4 shadow-xl">
      {user ? <>
        <p className="text-xs text-slate-600">활성 세션 · {user.roles.join(', ')}</p>
        <p className="text-xs text-slate-500">담당 Site {user.siteGrants.length}개</p>
        <div className="flex gap-2">
          <button type="button" disabled={loading} onClick={()=>setChange(!change)}
            className="rounded border px-2 py-1">암호 변경</button>
          <button type="button" disabled={loading} onClick={()=>void logout()}
            className="rounded border px-2 py-1">로그아웃</button>
        </div>
      </> : null}
      {(!user || change) && <form onSubmit={e=>void submit(e)} className="space-y-2">
        {!user && <label className="block">계정
          <input required autoComplete="username" value={username}
            onChange={e=>setUsername(e.target.value)} className="mt-1 w-full border px-2 py-1"/>
        </label>}
        <label className="block">{change?'현재 암호':'암호'}
          <input required type="password" autoComplete="current-password" value={password}
            onChange={e=>setPassword(e.target.value)} className="mt-1 w-full border px-2 py-1"/>
        </label>
        {(firstChange||change) && <label className="block">새 암호
          <input required type="password" autoComplete="new-password" minLength={8}
            value={nextPassword} onChange={e=>setNextPassword(e.target.value)}
            className="mt-1 w-full border px-2 py-1"/>
        </label>}
        <button type="submit" disabled={loading} className="rounded bg-teal-700 px-3 py-2 text-white">
          {firstChange||change?'암호 변경':'로그인'}
        </button>
      </form>}
      {user?.roles.includes('Admin') && <form onSubmit={e=>void provision(e)}
        className="space-y-2 border-t pt-3">
        <p className="font-medium">신규 Reader 계정 생성</p>
        <label className="block">로그인 ID
          <input required value={createName} onChange={e=>setCreateName(e.target.value)}
            minLength={3} className="mt-1 w-full border px-2 py-1"/>
        </label>
        <label className="block">최초 임시 암호
          <input required type="password" autoComplete="new-password" minLength={8}
            value={createSecret} onChange={e=>setCreateSecret(e.target.value)}
            className="mt-1 w-full border px-2 py-1"/>
        </label>
        <button type="submit" disabled={loading}
          className="rounded border px-2 py-2">계정 생성</button>
      </form>}
      {user?.roles.includes('Admin') && <form onSubmit={e=>void submitGrant(e)}
        className="space-y-2 border-t pt-3">
        <p className="font-medium">담당자 권한 부여/회수</p>
        <label className="block">대상 사용자 ID
          <input required value={affected} onChange={e=>setAffected(e.target.value)}
            className="mt-1 w-full border px-2 py-1"/>
        </label>
        <label className="block">범위
          <select value={grantKind} onChange={e=>setGrantKind(e.target.value as typeof grantKind)}
            className="mt-1 w-full border px-2 py-1">
            <option value="site">Site</option><option value="role">Role</option>
            <option value="special">감사/로그</option>
          </select>
        </label>
        <label className="block">값
          <input required value={grantValue} onChange={e=>setGrantValue(e.target.value)}
            placeholder={grantKind==='role'?'Reader / Editor / Admin':
              grantKind==='special'?'audit:read / logs:read':'담당 Site ID'}
            className="mt-1 w-full border px-2 py-1"/>
        </label>
        <select aria-label="작업" value={grantOperation}
          onChange={e=>setGrantOperation(e.target.value as typeof grantOperation)}
          className="w-full border px-2 py-1">
          <option value="grant">부여</option><option value="revoke">회수</option>
        </select>
        <button type="submit" disabled={loading}
          className="rounded border px-2 py-2">권한 반영</button>
      </form>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {info && <p role="status" className="text-xs text-teal-700">{info}</p>}
    </section>}
  </div>;
}
