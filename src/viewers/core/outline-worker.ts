/** Independent, terminate-to-cancel Worker for parsing and polygon operations. */
import {parseDxfOutlineIndex} from './outline-geometry';
import {computeOutline} from './outline-compute';
self.onmessage=(event:MessageEvent)=>{
 const input=event.data;
 try {
   if(input?.task==='index'){
     const index=parseDxfOutlineIndex(String(input.text),String(input.versionId),String(input.sourceSha256));
     self.postMessage({task:'index',ok:true,index});
   } else if(input?.task==='compute'){
     const result=computeOutline(input.kind,input.entities,input.tolerance);
     self.postMessage({task:'compute',ok:true,result});
   } else throw new Error('알 수 없는 외곽선 작업입니다.');
 } catch(error) {
   self.postMessage({task:input?.task,ok:false,error:error instanceof Error?error.message:'외곽선 계산에 실패했습니다.'});
 }
};
