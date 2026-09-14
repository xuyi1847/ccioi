"use client";
import {useState} from "react";

const OPTIONS=["周杰伦","王菲","陈奕迅","孙燕姿","Radiohead","Taylor Swift","The Beatles","Coldplay"];
const STORAGE_KEY="mhz-seed-artists";

export function StartListeningButton({busy,ready=true,onStart}:{busy:boolean;ready?:boolean;onStart:()=>void}){
  const [selected,setSelected]=useState<Set<string>>(()=>{if(typeof window==="undefined")return new Set();try{return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"))}catch{return new Set()}});
  const toggle=(artist:string)=>setSelected(previous=>{const next=new Set(previous);if(next.has(artist))next.delete(artist);else next.add(artist);localStorage.setItem(STORAGE_KEY,JSON.stringify([...next]));return next});
  return <div className="flex max-w-lg flex-col items-center gap-5">
    <div><p className="mb-3 text-xs text-[var(--muted)]">可选：选择喜欢的音乐人，改善首次推荐</p><div className="flex flex-wrap justify-center gap-2">{OPTIONS.map(artist=><button type="button" key={artist} aria-pressed={selected.has(artist)} onClick={()=>toggle(artist)} className={`rounded-full border px-3 py-1.5 text-xs transition ${selected.has(artist)?"border-black bg-black text-white":"border-black/15 bg-white/40"}`}>{artist}</button>)}</div></div>
    <button disabled={busy||!ready} onClick={onStart} className="group rounded-full border border-black/20 bg-white/30 px-7 py-3 text-xs font-semibold tracking-[.14em] transition hover:bg-black hover:text-white disabled:opacity-40">
      {busy?"CONNECTING…":ready?"CONNECT APPLE MUSIC":"PREPARING…"}
    </button>
  </div>;
}
