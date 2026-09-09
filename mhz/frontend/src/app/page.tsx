"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import {useCallback,useEffect,useRef} from "react";
import {AppleMusicConnect} from "@/components/AppleMusicConnect";
import {Player} from "@/components/Player";
import {RadioDial} from "@/components/RadioDial";
import {api,Channel,Recommendation} from "@/services/api";
import {configureMusicKit,musicKit} from "@/services/musickit";
import {usePlayer} from "@/stores/player";

const USER_KEY="mhz-user-id";
export default function Home(){
  const state=usePlayer(),timer=useRef<ReturnType<typeof setInterval>|null>(null),userId=useRef("");
  const sendEvent=useCallback(async(type:string,item=state.current,elapsed=state.progress)=>{if(!item||!userId.current)return;await api.event({userId:userId.current,trackId:item.track.id,channelId:state.channel?.id,recommendationId:item.recommendationId,eventType:type,playDurationMs:Math.round((item.track.durationMs||180000)*elapsed/100),trackDurationMs:item.track.durationMs}).catch(()=>undefined)},[state.current,state.channel,state.progress]);
  const fetchNext=useCallback(async(channel=state.channel,exclude:string[]=[]):Promise<Recommendation|undefined>=>{if(!channel||!userId.current)return;return api.next(userId.current,channel.id,exclude)},[state.channel]);
  const playItem=useCallback(async(item:Recommendation)=>{state.set({current:item,progress:0,playing:true,error:undefined});await sendEvent("impression",item,0);await sendEvent("play_start",item,0);if(item.track.provider.name==="appleMusic"&&musicKit.configured)await musicKit.play(item.track.provider.trackId)},[sendEvent,state]);

  useEffect(()=>{(async()=>{try{let id=localStorage.getItem(USER_KEY);if(!id){id=(await api.anonymous()).userId;localStorage.setItem(USER_KEY,id)}userId.current=id;const channels=await api.channels();state.set({channels,channel:channels[0]})}catch(error){state.set({error:error instanceof Error?error.message:"MHz 无法启动"})}})()},[]);

  const connect=async()=>{state.set({loading:true,error:undefined});try{try{const token=await api.appleToken();await configureMusicKit(token.developerToken);await musicKit.authorize();await api.search("Radiohead")}catch(error){console.info("Apple Music unavailable; using mock provider",error)}const current=await fetchNext();if(!current)throw new Error("暂时没有可播放歌曲");state.set({connected:true});await playItem(current);const next=await fetchNext(state.channel,[current.track.id]);state.set({next})}catch(error){state.set({error:error instanceof Error?error.message:"连接失败"})}finally{state.set({loading:false})}};
  const changeChannel=async(channel:Channel)=>{state.set({channel,loading:true,next:undefined});try{const item=await fetchNext(channel,state.current?[state.current.track.id]:[]);if(item){await playItem(item);state.set({next:await fetchNext(channel,[item.track.id])})}}catch(error){state.set({error:error instanceof Error?error.message:"切台失败"})}finally{state.set({loading:false})}};
  const skip=async(dislike=false)=>{await sendEvent(dislike?"dislike":"skip");const item=state.next||await fetchNext();if(item){await playItem(item);state.set({next:await fetchNext(state.channel,[item.track.id])})}};
  useEffect(()=>{if(timer.current)clearInterval(timer.current);if(!state.playing||!state.current)return;timer.current=setInterval(()=>state.set({progress:Math.min(100,usePlayer.getState().progress+100/30)}),1000);return()=>{if(timer.current)clearInterval(timer.current)}},[state.playing,state.current]);
  useEffect(()=>{if(state.progress>=60&&!state.next&&state.current)fetchNext(state.channel,[state.current.track.id]).then(next=>state.set({next})).catch(()=>undefined);if(state.progress>=100&&state.current){sendEvent("play_complete").then(()=>skip())}},[state.progress]);
  const toggle=()=>{if(state.playing)musicKit.pause();else if(state.current?.track.provider.name==="appleMusic"&&musicKit.configured)musicKit.play(state.current.track.provider.trackId);state.set({playing:!state.playing})};

  return <main className="relative flex min-h-screen flex-col items-center px-5 py-8 sm:py-12"><div className="noise"/><header className="z-10 flex w-full max-w-5xl items-center justify-between"><div className="display text-2xl font-bold">MHz</div><div className="caps text-[var(--muted)]">Private radio · v0.1</div></header>
    {!state.connected?<section className="z-10 flex flex-1 flex-col items-center justify-center pb-20 text-center"><div className="display text-[clamp(72px,18vw,170px)] leading-none">87.5</div><p className="caps mt-3 text-[var(--muted)]">Signal found</p><h1 className="mt-12 max-w-lg text-2xl font-normal sm:text-4xl">不是播放你喜欢的歌，<br/>而是找到你的下一首喜欢。</h1><div className="mt-10"><AppleMusicConnect busy={state.loading} onConnect={connect}/></div><p className="mt-4 text-xs text-[var(--muted)]">无 Apple 配置时自动进入 Mock 电台</p></section>:
    <section className="z-10 flex w-full max-w-5xl flex-1 flex-col items-center justify-between gap-9 pt-8"><div className="text-center"><div className="display text-6xl sm:text-7xl">{Number(state.channel?.frequency||87.5).toFixed(1)}</div><p className="caps mt-2 text-[var(--muted)]">{state.channel?.name} · {state.channel?.channelType}</p></div>{state.current?<Player item={state.current} playing={state.playing} progress={state.progress} onToggle={toggle} onFavorite={()=>sendEvent("favorite")} onSkip={()=>skip()} onDislike={()=>skip(true)}/>:<div className="pulse caps">Tuning signal…</div>}<RadioDial channels={state.channels} current={state.channel} onSelect={changeChannel}/></section>}
    {state.error&&<div className="fixed bottom-5 z-20 rounded-full bg-black px-5 py-3 text-xs text-white">{state.error}</div>}
  </main>;
}
