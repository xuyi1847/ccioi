"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";

type MacTrack={persistent_id:string;title:string;artist:string;album?:string;duration?:number};
type MacState={state:string;position:number;track?:MacTrack};
const BRIDGE="http://127.0.0.1:8765/api/v1/mac-music";

async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`${BRIDGE}${path}`,{...init,headers:{"Content-Type":"application/json",...init?.headers}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.detail||`请求失败 (${response.status})`)}
  return response.json();
}

export default function LocalMusic(){
  const [tracks,setTracks]=useState<MacTrack[]>([]),[current,setCurrent]=useState<MacState>(),[loading,setLoading]=useState(true),[error,setError]=useState<string>();
  const refresh=useCallback(async()=>{try{setTracks(await request<MacTrack[]>("/tracks?limit=100"));setError(undefined)}catch(reason){setError(reason instanceof Error?reason.message:"无法连接本机 Music.app")}finally{setLoading(false)}},[]);
  useEffect(()=>{const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>request<MacState>("/state").then(setCurrent).catch(()=>undefined),1500);return()=>{clearTimeout(initial);clearInterval(timer)}},[refresh]);
  const play=async(track:MacTrack)=>{try{setError(undefined);const result=await request<{track:MacTrack}>("/play",{method:"POST",body:JSON.stringify({persistentId:track.persistent_id})});setCurrent({state:"playing",position:0,track:result.track})}catch(reason){setError(reason instanceof Error?reason.message:"播放失败")}};
  const toggle=async()=>{try{await request(current?.state==="playing"?"/pause":"/resume",{method:"POST"})}catch(reason){setError(reason instanceof Error?reason.message:"控制失败")}};
  return <main className="min-h-screen px-5 py-8 sm:py-12"><header className="mx-auto flex max-w-5xl items-center justify-between"><Link href="/" className="display text-2xl font-bold">MHz</Link><span className="caps text-[var(--muted)]">Local Apple Music</span></header><section className="mx-auto mt-12 max-w-4xl"><div className="flex items-end justify-between gap-4"><div><h1 className="display text-4xl">本机资料库</h1><p className="mt-2 text-sm text-[var(--muted)]">网页只遥控 Music.app，声音由 Music.app 播放。</p></div><button onClick={()=>void toggle()} className="rounded-full border border-black/20 px-5 py-2 text-sm">{current?.state==="playing"?"暂停":"继续"}</button></div>{current?.track&&<div className="mt-6 rounded-2xl bg-black p-5 text-white"><span className="caps text-xs opacity-60">Now playing in Music.app</span><p className="mt-2 text-lg">{current.track.title}</p><p className="text-sm opacity-60">{current.track.artist}</p></div>}{loading?<p className="caps pulse mt-12">Reading Music Library…</p>:<div className="mt-8 grid gap-2 sm:grid-cols-2">{tracks.map((track,index)=><button key={track.persistent_id} onClick={()=>void play(track)} className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/40 p-4 text-left hover:bg-white"><span className="display w-8 text-sm text-[var(--muted)]">{String(index+1).padStart(2,"0")}</span><span className="min-w-0"><strong className="block truncate text-sm font-medium">{track.title}</strong><span className="block truncate text-xs text-[var(--muted)]">{track.artist}{track.album?` · ${track.album}`:""}</span></span></button>)}</div>}</section>{error&&<div className="fixed bottom-5 left-1/2 max-w-[90vw] -translate-x-1/2 rounded-full bg-black px-5 py-3 text-center text-xs text-white">{error}</div>}</main>;
}
