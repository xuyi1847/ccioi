"use client";

import Image from "next/image";
import {useEffect,useRef,useState} from "react";
import type {Recommendation} from "@/services/api";

const platformNames:Record<string,string>={appleMusic:"Apple Music",qqMusic:"QQ 音乐",netease:"网易云"};
const reasonNames:Record<string,string>={artist:"符合你的歌手偏好",genre:"符合你的流派偏好",composer:"来自熟悉的创作者",era:"符合你的年代偏好",language:"符合你的语言偏好",collaborative:"相似听众也喜欢",discovery:"为你发现的新歌曲",explore:"探索不同的声音",familiar:"来自熟悉的风格"};

function formatTime(milliseconds?:number,progress=0){
  const seconds=Math.max(0,Math.round((milliseconds||0)*progress/100/1000));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
}

type Props={item:Recommendation;playing:boolean;progress:number;busy:boolean;liked:boolean;frequency:number;channelName:string;volume:number;onVolumeChange:(volume:number)=>void;onToggleMute:()=>void;onToggle:()=>void;onFavorite:()=>void;onSkip:()=>void;onDislike:()=>void;onExternal:()=>void};

export function Player({item,playing,progress,busy,liked,frequency,channelName,volume,onVolumeChange,onToggleMute,onToggle,onFavorite,onSkip,onDislike,onExternal}:Props){
  const [volumeOpen,setVolumeOpen]=useState(false);
  const volumeControl=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!volumeOpen)return;
    const close=(event:PointerEvent)=>{if(!volumeControl.current?.contains(event.target as Node))setVolumeOpen(false)};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setVolumeOpen(false)};
    document.addEventListener("pointerdown",close);
    document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape)};
  },[volumeOpen]);
  const track=item.track;
  const canStream=Boolean(track.streamUrl)||track.playbackType==="musickit";
  return <article className="player-card w-full">
    <div className="player-art relative aspect-square overflow-hidden bg-[#d8d5cc]">
      {track.artworkUrl?<Image loader={({src})=>src} unoptimized src={track.artworkUrl} alt={`${track.title} artwork`} fill sizes="(max-width: 767px) 88vw, 420px" priority className="object-contain"/>:<div className="display grid h-full place-items-center text-6xl text-black/25">MHz</div>}
    </div>
    <div className="flex min-w-0 flex-col px-6 py-6 sm:px-8 sm:py-8">
      <div className="flex items-start justify-between gap-5 border-b border-black/10 pb-5">
        <div><p className="caps text-[var(--muted)]">Now tuned</p><p className="mt-1 text-sm font-medium">{channelName}</p></div>
        <div className="text-right"><p className="display text-4xl leading-none sm:text-5xl">{frequency.toFixed(1)}</p><p className="caps mt-1 text-[var(--muted)]">MHz</p></div>
      </div>
      <div className="flex min-h-[126px] flex-1 flex-col justify-center py-6">
        <h2 className="line-clamp-2 text-[clamp(1.55rem,3vw,2.35rem)] font-medium leading-tight tracking-[-.035em]">{track.title}</h2>
        <p className="mt-2 truncate text-sm text-[var(--muted)]">{track.artist}{track.album?` · ${track.album}`:""}</p>
        <p className="caps mt-3 text-[10px] text-[var(--red)]">{reasonNames[item.reason.type]||"MHz recommendation"}</p>
      </div>
      <div>
        <div className="h-[3px] overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-[var(--red)] transition-[width] duration-300 ease-linear" style={{width:`${progress}%`}}/></div>
        <div className="mt-2 flex justify-between text-[10px] tabular-nums text-[var(--muted)]"><span>{formatTime(track.durationMs,progress)}</span><span>{formatTime(track.durationMs,100)}</span></div>
      </div>
      {!canStream&&<div className="mt-4 flex flex-wrap gap-2">{Object.entries(track.externalLinks||{}).map(([platform,url])=><a key={platform} href={url} target="_blank" rel="noreferrer" onClick={onExternal} className="rounded-full border border-black/15 px-3 py-2 text-xs transition hover:bg-black hover:text-white">{platformNames[platform]||platform} ↗</a>)}</div>}
      <div className="mt-5 grid grid-cols-[44px_1fr_56px_1fr_44px] items-center gap-2">
        <button aria-label="不喜欢" title="不喜欢" disabled={busy} onClick={onDislike} className="control-secondary">×</button>
        <button aria-label={liked?"取消喜欢":"喜欢"} title={liked?"取消喜欢":"喜欢"} aria-pressed={liked} disabled={busy} onClick={onFavorite} className={`control-text ${liked?"control-favorite-active":""}`}><svg aria-hidden="true" viewBox="0 0 24 24" className={`control-icon ${liked?"fill-current":"fill-none stroke-current"}`} strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" strokeLinecap="round" strokeLinejoin="round"/></svg><span>{liked?"已喜欢":"喜欢"}</span></button>
        <button aria-label={playing?"暂停":"播放"} disabled={!canStream||busy} onClick={onToggle} className="control-primary">{busy?<span aria-hidden="true">…</span>:playing?<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>:<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M8 5.6v12.8a1 1 0 0 0 1.55.83l9.15-6.4a1 1 0 0 0 0-1.66L9.55 4.77A1 1 0 0 0 8 5.6Z"/></svg>}</button>
        <button aria-label="下一首" title="下一首" disabled={busy} onClick={onSkip} className="control-text"><span>下一首</span><svg aria-hidden="true" viewBox="0 0 24 24" className="control-icon fill-current"><path d="M6.7 5.6v12.8a1 1 0 0 0 1.55.83l8.2-6.4a1 1 0 0 0 0-1.66l-8.2-6.4A1 1 0 0 0 6.7 5.6Z"/><rect x="18" y="5" width="2" height="14" rx="1"/></svg></button>
        <div ref={volumeControl} className="relative flex h-11 w-11 items-center justify-center">
          <button type="button" aria-label="调整音量" title="调整音量" aria-expanded={volumeOpen} onClick={()=>setVolumeOpen(open=>!open)} className="control-secondary">
            {volume===0?<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="m16 9 5 6m0-6-5 6"/></svg>:<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/>{volume>.35&&<path d="M15 9.5a4 4 0 0 1 0 5"/>}{volume>.7&&<path d="M18 7a7.5 7.5 0 0 1 0 10"/>}</svg>}
          </button>
          {volumeOpen&&<div className="absolute bottom-[calc(100%+8px)] right-0 z-20 flex w-44 items-center gap-2 rounded-full border border-black/10 bg-[#f8f7f2]/95 px-3 py-2 shadow-[0_10px_32px_rgba(32,35,31,.16)] backdrop-blur">
            <button type="button" onClick={onToggleMute} className="grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]" aria-label={volume===0?"恢复音量":"静音"}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 6 7 9.5H4v5h3L11 18V6Z"/>{volume===0?<path d="m16 10 4 4m0-4-4 4"/>:<path d="M15 9.5a4 4 0 0 1 0 5"/>}</svg></button>
            <input aria-label="音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={event=>onVolumeChange(Number(event.target.value))} className="volume-slider min-w-0 flex-1 accent-[var(--red)]"/>
            <span className="w-7 flex-none text-right text-[9px] tabular-nums text-[var(--muted)]">{Math.round(volume*100)}</span>
          </div>}
        </div>
      </div>
    </div>
  </article>;
}
