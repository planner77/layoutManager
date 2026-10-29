'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type SetupState={state:string;csrfToken:string};
export function RuntimeFirstSetup() {
  const [csrf,setCsrf]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [completed,setCompleted]=useState(false);
  useEffect(()=>{
    let active=true;
    fetch('/api/g7-runtime/setup',{cache:'no-store'}).then(async response=>{
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error?.code??'SETUP_UNAVAILABLE');
      return body as SetupState;
    }).then(value=>{if(active)setCsrf(value.csrfToken);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'설정 화면을 열 수 없습니다.');});
    return ()=>{active=false;};
  },[]);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!csrf||busy)return;
    const data=Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/g7-runtime/setup',{
        method:'POST',headers:{'Content-Type':'application/json','X-Setup-CSRF':csrf},
        body:JSON.stringify(data),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result?.error?.code??'SETUP_UNAVAILABLE');
      setCompleted(true);
    }catch(e){setError(e instanceof Error?e.message:'관리자 등록에 실패했습니다.');}
    finally{setBusy(false);}
  }
  return <section className="mx-auto max-w-xl space-y-5 rounded-xl border bg-white p-6"
    data-testid="g7-first-setup">
    <h1 className="text-2xl font-bold">신규 설치 · 최초 관리자 설정</h1>
    <p className="text-sm text-slate-600">
      이 화면은 신규 시스템에서 관리자 계정이 없는 경우에만 열립니다.
      최초 설정 코드는 서버 Docker 호스트에서만 확인할 수 있습니다.
    </p>
    {error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm">{error}</p>}
    {completed?<div className="space-y-3" role="status">
      <p>최초 관리자가 등록되었습니다. 초기 비밀번호 변경을 완료한 뒤 로그인하세요.</p>
      <Button asChild><Link href="/g7-runtime">초기 비밀번호 변경 및 로그인</Link></Button>
      <p className="text-sm text-slate-600">로그인 후 위치 기준정보에서 사업부·제품·사업장·동·층을 생성하고 담당 Site 권한을 부여하세요.</p>
    </div>:<form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!csrf||busy} className="space-y-4 [&_input]:min-h-11">
        <label className="block">Docker 호스트 최초 설정 코드
          <input name="code" className="mt-1 block w-full rounded border p-2" type="password"
            autoComplete="off" required maxLength={43} minLength={43}/></label>
        <label className="block">최초 관리자 계정
          <input name="login" className="mt-1 block w-full rounded border p-2"
            autoComplete="username" defaultValue="admin" required maxLength={64}/></label>
        <label className="block">초기 비밀번호
          <input name="password" className="mt-1 block w-full rounded border p-2"
            type="password" autoComplete="new-password" required minLength={8} maxLength={1024}/></label>
        <Button type="submit" disabled={!csrf||busy}>{busy?'등록 중…':'최초 관리자 등록'}</Button>
      </fieldset>
    </form>}
    <p className="text-xs text-slate-500">
      코드는 Docker 호스트의 /data/db/first-admin.code에 1시간 동안 유효하게 저장됩니다.
      코드와 비밀번호를 GitHub, 로그 또는 화면 공유로 공개하지 마세요.
    </p>
  </section>;
}
