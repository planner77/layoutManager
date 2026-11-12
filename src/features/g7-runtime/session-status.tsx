'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {checking,gateStatus,sessionStatus,type PublicSessionStatus} from './session-status-model';

type Status=PublicSessionStatus;
const initial=checking;
const context=createContext<{status:Status;immersive:boolean;setImmersive:(value:boolean)=>void}>({status:initial,immersive:false,setImmersive:()=>{}});
const eventName='layoutManager:session-invalidated';
export function invalidateSessionStatus(){ if(typeof window!=='undefined')window.dispatchEvent(new Event(eventName)); }

export function SessionStatusProvider({children}:{children:ReactNode}){
  const pathname=usePathname();
  const [status,setStatus]=useState<Status>(initial);
  const [immersive,setImmersive]=useState(false);
  useEffect(()=>{
    let generation=0,active:AbortController|null=null,queued=false,live=true;
    const refresh=()=>{
      if(!live)return;
      if(active){queued=true;active.abort();return;}
      const controller=new AbortController(),epoch=++generation;
      active=controller;setStatus(initial);
      const publish=(next:Status)=>{if(live&&epoch===generation&&!controller.signal.aborted)setStatus(next);};
      void (async()=>{
        try{
          const response=await fetch('/api/g7-runtime/status',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
          if(!response.ok)throw Error('STATUS');
          const gateKind=gateStatus(await response.json());
          if(gateKind==='off'){publish({kind:'off',roles:[]});return;}
          if(gateKind==='blocked'){publish({kind:'blocked',roles:[]});return;}
          if(gateKind!=='active')throw Error('STATUS');
          const session=await fetch('/api/g7-runtime/auth/session',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
          if(session.status===401){publish(sessionStatus(401,null));return;}
          if(!session.ok)throw Error('SESSION');
          publish(sessionStatus(session.status,await session.json()));
        }catch{publish({kind:'unavailable',roles:[]});}
        finally{if(active===controller){active=null;if(queued){queued=false;refresh();}}}
      })();
    };
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    const focus=()=>refresh();
    window.addEventListener(eventName,refresh);window.addEventListener('focus',focus);
    document.addEventListener('visibilitychange',visible);
    void Promise.resolve().then(refresh);
    return()=>{live=false;generation++;queued=false;active?.abort();active=null;
      window.removeEventListener(eventName,refresh);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible);};
  },[pathname]);
  return <context.Provider value={{status,immersive,setImmersive}}>{children}</context.Provider>;
}

export function useViewerStatusImmersive(){return useContext(context).setImmersive;}
export function useSessionStatusSnapshot(){return useContext(context).status;}

export function SessionStatus({viewer=false,onBeforeNavigate}:{viewer?:boolean;onBeforeNavigate?:()=>boolean}){
  const {status,immersive}=useContext(context);
  const label=status.kind==='checking'?'인증 확인 중':status.kind==='signed-in'?`로그인됨 · ${status.roles.join(', ')}`:
    status.kind==='login-required'?'로그인 필요':status.kind==='off'?'인증 미사용':
    status.kind==='blocked'?'인증 구성 대기':'인증 확인 불가';
  const common='inline-flex min-h-11 min-w-0 items-center rounded px-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400';
  const content=<span className={viewer?'max-w-24 break-words text-center sm:max-w-64':'max-w-48 break-words text-center sm:max-w-64'}>{label}</span>;
  const canNavigate=status.kind==='signed-in'||status.kind==='login-required';
  const live=viewer?(immersive?'polite':'off'):(immersive?'off':'polite');
  return <span data-testid={viewer?'viewer-session-status':'app-session-status'} className="inline-flex min-w-0" aria-live={live} aria-atomic="true">
    {canNavigate?<Link className={common+(viewer?' text-white':' text-slate-700')} href="/g7-runtime" aria-label={`${label} · 계정 / 로그인`}
      onClick={event=>{if(onBeforeNavigate&&!onBeforeNavigate())event.preventDefault();}}>{content}</Link>:
      <span className={common+(viewer?' text-slate-200':' text-slate-600')} aria-label={label}>{content}</span>}
  </span>;
}
