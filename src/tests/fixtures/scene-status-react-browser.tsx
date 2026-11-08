import React,{useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SceneStatusProvider,SceneBuildStatusCell} from '../../features/cad-list/scene-build-status';

type Pending={ids:string[];respond:(rows:Record<string,unknown>)=>void};
const pending:Pending[]=[];
const commits:{scope:string;retry:number;enabledRetry:number;text:string}[]=[];
function CommitProbe({scope}:{scope:string}){
  useLayoutEffect(()=>{commits.push({scope,retry:document.querySelectorAll('[data-testid=\"row-A\"] button').length,
    enabledRetry:document.querySelectorAll('[data-testid=\"row-A\"] button:not([disabled])').length,
    text:document.querySelector('[data-testid=\"row-A\"]')?.textContent??''});});
  return null;
}
window.fetch=((input:RequestInfo|URL)=>{
  const ids=new URL(String(input),location.href).searchParams.getAll('versionId');
  return new Promise<Response>(resolve=>{
    pending.push({ids,respond:rows=>resolve(new Response(JSON.stringify({rows}),{
      status:200,headers:{'content-type':'application/json'},
    }))});
  });
}) as typeof fetch;
const root=createRoot(document.getElementById('app')!);
function render(enabled:boolean,ids:string[]){
  flushSync(()=>root.render(<SceneStatusProvider enabled={enabled} versionIds={ids}>
    <CommitProbe scope={`${enabled}:${ids.join(',')}`}/>
    {ids.map(id=><div key={id} data-testid={`row-${id}`}><SceneBuildStatusCell versionId={id} fileFormat="DXF"/></div>)}
  </SceneStatusProvider>));
}
(window as unknown as {harness:unknown}).harness={render,pending,commits,
  reply(index:number,rows:Record<string,unknown>){pending[index]?.respond(rows);},
};
