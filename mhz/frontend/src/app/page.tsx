"use client";

import Image from "next/image";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {RadioDial} from "@/components/RadioDial";
import {StartListeningButton} from "@/components/StartListeningButton";
import {api,Channel,Track} from "@/services/api";

const USER_KEY="mhz-user-id";

export default function Home(){
  const userId=useRef("");
  const [channels,setChannels]=useState<Channel[]>([]);
  const [channel,setChannel]=useState<Channel>();
  const [tracks,setTracks]=useState<Track[]>([]);
  const [started,setStarted]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string>();

  useEffect(()=>{void(async()=>{
    try{
      let id=localStorage.getItem(USER_KEY);
      if(!id){id=(await api.anonymous()).userId;localStorage.setItem(USER_KEY,id)}
      userId.current=id;
      const items=await api.channels();setChannels(items);setChannel(items[0]);
    }catch(reason){setError(reason instanceof Error?reason.message:"MHz 无法启动")}
  })()},[]);

  const loadChannel=async(next:Channel)=>{
    setLoading(true);setError(undefined);setChannel(next);
    try{
      if(next.id==="chinese"){
        const result=await api.discoverChinese(100);
        if(!result.count)throw new Error("Audius 当前没有找到可用的华语歌曲");
      }else await api.discover(100);
      const items=await api.tracks(next.id,50);
      if(!items.length)throw new Error("这个频道暂时没有歌曲");
      setTracks(items);setStarted(true);
    }catch(reason){setError(reason instanceof Error?reason.message:"加载歌曲失败")}
    finally{setLoading(false)}
  };

  const openTrack=(track:Track)=>{
    if(!track.providerUrl){setError("这首歌曲没有 Audius 页面地址");return}
    window.open(track.providerUrl,"_blank","noopener,noreferrer");
    void api.event({userId:userId.current,trackId:track.id,channelId:channel?.id,eventType:"play_start",trackDurationMs:track.durationMs}).catch(()=>undefined);
  };

  const reactToTrack=(eventType:"favorite"|"dislike",track:Track)=>{
    void api.event({userId:userId.current,trackId:track.id,channelId:channel?.id,eventType,trackDurationMs:track.durationMs}).catch(()=>undefined);
    if(eventType==="dislike")setTracks(items=>items.filter(item=>item.id!==track.id));
  };

  return <main className="relative min-h-screen px-5 py-8 sm:py-12"><div className="noise"/><header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between"><div className="display text-2xl font-bold">MHz</div><div className="flex items-center gap-4"><Link href="/local" className="caps text-[var(--red)]">本机 Apple Music</Link><div className="caps text-[var(--muted)]">Discovery list · Audius</div></div></header>
    {!started?<section className="relative z-10 flex min-h-[75vh] flex-col items-center justify-center text-center"><div className="display text-[clamp(72px,18vw,170px)] leading-none">87.5</div><p className="caps mt-3 text-[var(--muted)]">Signal found</p><h1 className="mt-12 max-w-lg text-2xl font-normal sm:text-4xl">发现想听的歌，<br/>去 Audius 官方页面播放。</h1><div className="mt-10"><StartListeningButton busy={loading} onStart={()=>channel&&void loadChannel(channel)}/></div><p className="mt-4 text-xs text-[var(--muted)]">本地只展示推荐列表，不下载、不播放音频</p></section>:
    <section className="relative z-10 mx-auto mt-10 flex w-full max-w-5xl flex-col gap-10"><div className="text-center"><div className="display text-6xl sm:text-7xl">{Number(channel?.frequency||87.5).toFixed(1)}</div><p className="caps mt-2 text-[var(--muted)]">{channel?.name} · {tracks.length} tracks</p></div><RadioDial channels={channels} current={channel} onSelect={next=>void loadChannel(next)}/><div className="grid gap-3 pb-16 sm:grid-cols-2">{tracks.map((track,index)=><article key={track.id} className="flex items-center gap-4 rounded-2xl border border-black/10 bg-white/35 p-3 transition hover:bg-white/70"><button onClick={()=>openTrack(track)} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/10 text-xs">{track.artworkUrl?<Image loader={({src})=>src} unoptimized src={track.artworkUrl} alt="" fill sizes="64px" className="object-cover"/>:"MHz"}</button><button onClick={()=>openTrack(track)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-medium">{index+1}. {track.title}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{track.artist}</span><span className="caps mt-2 block text-[10px] text-[var(--red)]">Open in Audius ↗</span></button><div className="flex shrink-0 gap-2"><button aria-label="Favorite" onClick={()=>reactToTrack("favorite",track)} className="p-2 text-lg opacity-50 hover:opacity-100">♡</button><button aria-label="Dislike" onClick={()=>reactToTrack("dislike",track)} className="p-2 text-lg opacity-50 hover:opacity-100">×</button></div></article>)}</div></section>}
    {loading&&<div className="fixed inset-0 z-20 grid place-items-center bg-[#eeece4]/75"><span className="caps pulse">Loading Audius…</span></div>}
    {error&&<div className="fixed bottom-5 left-1/2 z-30 max-w-[90vw] -translate-x-1/2 rounded-full bg-black px-5 py-3 text-center text-xs text-white">{error}</div>}
  </main>;
}
