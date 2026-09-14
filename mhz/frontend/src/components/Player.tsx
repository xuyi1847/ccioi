import Image from "next/image";
import type {Recommendation} from "@/services/api";

const platformNames:Record<string,string>={appleMusic:"Apple Music",qqMusic:"QQ 音乐",netease:"网易云"};
const reasonNames:Record<string,string>={artist:"符合你的歌手偏好",genre:"符合你的流派偏好",composer:"来自熟悉的创作者",era:"符合你的年代偏好",language:"符合你的语言偏好",collaborative:"相似听众也喜欢",discovery:"为你发现的新歌曲",explore:"探索不同的声音",familiar:"来自熟悉的风格"};

function formatTime(milliseconds?:number,progress=0){
  const seconds=Math.max(0,Math.round((milliseconds||0)*progress/100/1000));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
}

type Props={item:Recommendation;playing:boolean;progress:number;busy:boolean;liked:boolean;frequency:number;channelName:string;onToggle:()=>void;onFavorite:()=>void;onSkip:()=>void;onDislike:()=>void;onExternal:()=>void};

export function Player({item,playing,progress,busy,liked,frequency,channelName,onToggle,onFavorite,onSkip,onDislike,onExternal}:Props){
  const track=item.track;
  const canStream=Boolean(track.streamUrl)||track.playbackType==="musickit";
  return <article className="player-card w-full">
    <div className="player-art relative aspect-square overflow-hidden bg-[#d8d5cc]">
      {track.artworkUrl?<Image loader={({src})=>src} unoptimized src={track.artworkUrl} alt={`${track.title} artwork`} fill sizes="(max-width: 767px) 88vw, 420px" priority className="object-contain"/>:<div className="display grid h-full place-items-center text-6xl text-black/25">MHz</div>}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/30 to-transparent"/>
      <span className="caps absolute bottom-4 left-4 text-white/90">{track.provider.name==="appleMusic"?"Playing with Apple Music":"MHz discovery"}</span>
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
        <button aria-label={liked?"取消喜欢":"喜欢"} title={liked?"取消喜欢":"喜欢"} aria-pressed={liked} disabled={busy} onClick={onFavorite} className={`control-text ${liked?"control-favorite-active":""}`}>{liked?"♥":"♡"} <span>{liked?"已喜欢":"喜欢"}</span></button>
        <button aria-label={playing?"暂停":"播放"} disabled={!canStream||busy} onClick={onToggle} className="control-primary">{busy?<span aria-hidden="true">…</span>:playing?<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>:<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M8 5.6v12.8a1 1 0 0 0 1.55.83l9.15-6.4a1 1 0 0 0 0-1.66L9.55 4.77A1 1 0 0 0 8 5.6Z"/></svg>}</button>
        <button aria-label="下一首" disabled={busy} onClick={onSkip} className="control-text"><span>下一首</span> »</button>
        <div className="h-11 w-11"/>
      </div>
    </div>
  </article>;
}
