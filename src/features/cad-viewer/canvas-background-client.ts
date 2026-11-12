'use client';
import { useCallback, useEffect, useState } from 'react';
import { CANVAS_BACKGROUND_KEY,DEFAULT_CANVAS_BACKGROUND,normalizeCanvasBackground,readCanvasBackground,storeCanvasBackground,type CanvasBackground } from './canvas-background';

export function useCanvasBackground(){
  const [color,setColor]=useState<CanvasBackground>(()=>{
    if(typeof window==='undefined')return DEFAULT_CANVAS_BACKGROUND;
    try{return readCanvasBackground(window.localStorage);}catch{return DEFAULT_CANVAS_BACKGROUND;}
  });
  const [saved,setSaved]=useState(true);
  useEffect(()=>{
    const sync=(event:StorageEvent)=>{
      if(event.key!==CANVAS_BACKGROUND_KEY&&event.key!==null)return;
      setColor(normalizeCanvasBackground(event.newValue)??DEFAULT_CANVAS_BACKGROUND);setSaved(true);
    };
    window.addEventListener('storage',sync);
    return()=>window.removeEventListener('storage',sync);
  },[]);
  const select=useCallback((value:string)=>{
    const next=normalizeCanvasBackground(value);
    if(!next)return false;
    setColor(next);
    try{setSaved(storeCanvasBackground(window.localStorage,next));}catch{setSaved(false);}
    return true;
  },[]);
  return {color,ready:typeof window!=='undefined',saved,select};
}
