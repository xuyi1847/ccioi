import Image from "next/image";
import type {Recommendation} from "@/services/api";

const platformNames:Record<string,string>={appleMusic:"Apple Music",qqMusic:"QQ 音乐",netease:"网易云"};

export function Player({item,playing,progress,onToggle,onFavorite,onSkip,onDislike,onExternal}:{item:Recommendation;playing:boolean;progress:number;onToggle:()=>void;onFavorite:()=>void;onSkip:()=>void;onDislike:()=>void;onExternal:()=>void}){
  const track=item.track;
  const canStream=Boolean(track.streamUrl);
  return <div className="flex w-full flex-col items-center">
    <div className="soft-shadow relative aspect-square w-[min(62vw,330px)] overflow-hidden bg-[#d2d0c8]">
      {/* A custom loader preserves Audius' selected decentralized content node. */}
      {track.artworkUrl?<Image loader={({src})=>src} unoptimized src={track.artworkUrl} alt={`${track.title} artwork`} fill sizes="330px" priority className="object-cover grayscale-[20%]"/>:<div className="grid h-full place-items-center text-5xl">MHz</div>}
    </div>
    <div className="mt-8 min-h-16 text-center"><h2 className="text-xl font-medium tracking-tight">{track.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{track.artist}</p>{track.licenseUrl&&<a href={track.licenseUrl} target="_blank" rel="noreferrer" className="mt-2 block text-[10px] uppercase tracking-widest text-[var(--muted)] underline">Track license</a>}</div>
    <div className="mt-5 h-px w-[min(62vw,330px)] bg-black/10"><div className="h-full bg-[var(--red)] transition-[width] duration-1000" style={{width:`${progress}%`}}/></div>
    {!canStream&&<div className="mt-5 flex flex-wrap justify-center gap-2">{Object.entries(track.externalLinks||{}).map(([platform,url])=><a key={platform} href={url} target="_blank" rel="noreferrer" onClick={onExternal} className="rounded-full border border-black/20 px-4 py-2 text-xs transition hover:bg-black hover:text-white">去 {platformNames[platform]||platform} 听</a>)}</div>}
    <div className="mt-7 flex items-center gap-7">
      <button aria-label="Favorite" onClick={onFavorite} className="text-xl opacity-55 transition hover:scale-110 hover:opacity-100">♡</button>
      <button aria-label={canStream?(playing?"Pause":"Play"):"External playback"} onClick={onToggle} disabled={!canStream} className="grid h-14 w-14 place-items-center rounded-full border border-black/25 text-lg transition enabled:hover:bg-black enabled:hover:text-white disabled:cursor-default disabled:opacity-35">{canStream?(playing?"Ⅱ":"▶"):"↗"}</button>
      <button aria-label="Skip" onClick={onSkip} className="text-xl opacity-55 transition hover:translate-x-1 hover:opacity-100">»</button>
      <button aria-label="Dislike" onClick={onDislike} className="text-lg opacity-55 transition hover:rotate-6 hover:opacity-100">×</button>
    </div>
  </div>
}
