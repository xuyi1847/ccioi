"use client";

import {useCallback,useEffect,useRef} from "react";
import {Player} from "@/components/Player";
import {RadioDial} from "@/components/RadioDial";
import {StartListeningButton} from "@/components/StartListeningButton";
import {api,Channel,Recommendation} from "@/services/api";
import {usePlayer} from "@/stores/player";

const USER_KEY="mhz-user-id";

export default function Home(){
  const state=usePlayer();
  const userId=useRef("");
  const audio=useRef<HTMLAudioElement|null>(null);
  const sent30=useRef(false);
  const advance=useRef<()=>void>(()=>undefined);

  const record=useCallback(async(type:string,item?:Recommendation,progress?:number)=>{
    const current=usePlayer.getState(),target=item||current.current;
    if(!target||!userId.current)return;
    const elapsed=progress??current.progress;
    await api.event({userId:userId.current,trackId:target.track.id,channelId:current.channel?.id,recommendationId:target.recommendationId,eventType:type,playDurationMs:Math.round((target.track.durationMs||0)*elapsed/100),trackDurationMs:target.track.durationMs}).catch(()=>undefined);
  },[]);

  const fetchNext=useCallback(async(channel?:Channel,exclude:string[]=[]):Promise<Recommendation|undefined>=>{
    const selected=channel||usePlayer.getState().channel;
    if(!selected||!userId.current)return;
    return api.next(userId.current,selected.id,exclude);
  },[]);

  const playItem=useCallback(async(item:Recommendation)=>{
    const player=audio.current;
    if(!player)throw new Error("播放器尚未初始化");
    sent30.current=false;
    state.set({current:item,progress:0,error:undefined});
    await record("impression",item,0);
    if(!item.track.streamUrl){player.pause();player.removeAttribute("src");player.load();state.set({playing:false});return}
    await record("play_start",item,0);
    player.src=item.track.streamUrl;player.load();
    try{await player.play()}catch(error){state.set({playing:false,error:"浏览器阻止了自动播放，请点击中间的播放按钮"});if(error instanceof DOMException&&error.name==="NotAllowedError")return;throw error}
  },[record,state]);

  const skip=useCallback(async(dislike=false)=>{
    const current=usePlayer.getState();
    await record(dislike?"dislike":"skip");
    const item=current.next||await fetchNext(current.channel,current.current?[current.current.track.id]:[]);
    if(!item)return;
    await playItem(item);state.set({next:await fetchNext(current.channel,[item.track.id])});
  },[fetchNext,playItem,record,state]);

  useEffect(()=>{advance.current=()=>{void skip(false)}},[skip]);

  useEffect(()=>{
    const player=new Audio();player.preload="auto";audio.current=player;
    const onTime=()=>{const current=usePlayer.getState();if(!Number.isFinite(player.duration)||player.duration<=0)return;const progress=Math.min(100,player.currentTime/player.duration*100);current.set({progress});if(player.currentTime>=30&&!sent30.current){sent30.current=true;void record("play_30s")}if(progress>=60&&!current.next&&current.current)void fetchNext(current.channel,[current.current.track.id]).then(next=>current.set({next})).catch(()=>undefined)};
    const onEnded=()=>{void record("play_complete",undefined,100).then(()=>advance.current())};
    const onPlay=()=>usePlayer.getState().set({playing:true});
    const onPause=()=>usePlayer.getState().set({playing:false});
    const onError=()=>usePlayer.getState().set({playing:false,error:"Audius 音频加载失败，请跳过此曲"});
    player.addEventListener("timeupdate",onTime);player.addEventListener("ended",onEnded);player.addEventListener("play",onPlay);player.addEventListener("pause",onPause);player.addEventListener("error",onError);
    return()=>{player.pause();player.removeAttribute("src");player.load()};
  },[fetchNext,record]);

  useEffect(()=>{void(async()=>{try{let id=localStorage.getItem(USER_KEY);if(!id){id=(await api.anonymous()).userId;localStorage.setItem(USER_KEY,id)}userId.current=id;const channels=await api.channels();usePlayer.getState().set({channels,channel:channels[0]})}catch(error){usePlayer.getState().set({error:error instanceof Error?error.message:"MHz 无法启动"})}})()},[]);

  const connect=async()=>{state.set({loading:true,error:undefined});try{await Promise.allSettled([api.discoverMetadata(100),api.discover(100)]);const current=await fetchNext();if(!current)throw new Error("暂时没有可推荐歌曲，请稍后重试");state.set({connected:true});await playItem(current);state.set({next:await fetchNext(state.channel,[current.track.id])})}catch(error){state.set({connected:false,error:error instanceof Error?error.message:"连接音乐目录失败"})}finally{state.set({loading:false})}};
  const changeChannel=async(channel:Channel)=>{state.set({channel,loading:true,next:undefined});try{if(channel.id==="chinese"){const imported=await api.discoverChinese(100);if(!imported.count)throw new Error("Audius 当前没有找到可用的华语歌曲")}const current=usePlayer.getState().current,item=await fetchNext(channel,current?[current.track.id]:[]);if(item){await playItem(item);state.set({next:await fetchNext(channel,[item.track.id])})}}catch(error){state.set({error:error instanceof Error?error.message:"切台失败"})}finally{state.set({loading:false})}};
  const toggle=async()=>{const player=audio.current;if(!player)return;try{if(player.paused)await player.play();else player.pause()}catch{state.set({error:"无法播放此音频，请尝试下一首"})}};

  return <main className="relative flex min-h-screen flex-col items-center px-5 py-8 sm:py-12"><div className="noise"/><header className="z-10 flex w-full max-w-5xl items-center justify-between"><div className="display text-2xl font-bold">MHz</div><div className="caps text-[var(--muted)]">Music discovery radio</div></header>
    {!state.connected?<section className="z-10 flex flex-1 flex-col items-center justify-center pb-20 text-center"><div className="display text-[clamp(72px,18vw,170px)] leading-none">87.5</div><p className="caps mt-3 text-[var(--muted)]">Signal found</p><h1 className="mt-12 max-w-lg text-2xl font-normal sm:text-4xl">不是播放你喜欢的歌，<br/>而是找到你的下一首喜欢。</h1><div className="mt-10"><StartListeningButton busy={state.loading} onStart={connect}/></div><p className="mt-4 text-xs text-[var(--muted)]">真实独立音乐 · HTML5 Audio 播放</p></section>:
    <section className="z-10 flex w-full max-w-5xl flex-1 flex-col items-center justify-between gap-9 pt-8"><div className="text-center"><div className="display text-6xl sm:text-7xl">{Number(state.channel?.frequency||87.5).toFixed(1)}</div><p className="caps mt-2 text-[var(--muted)]">{state.channel?.name} · {state.channel?.channelType}</p></div>{state.current?<Player item={state.current} playing={state.playing} progress={state.progress} onToggle={()=>void toggle()} onFavorite={()=>void record("favorite")} onSkip={()=>void skip()} onDislike={()=>void skip(true)} onExternal={()=>void record("external_play")}/>:<div className="pulse caps">Tuning signal…</div>}<RadioDial channels={state.channels} current={state.channel} onSelect={changeChannel}/></section>}
    {state.error&&<div className="fixed bottom-5 z-20 max-w-[90vw] rounded-full bg-black px-5 py-3 text-center text-xs text-white">{state.error}</div>}
  </main>;
}
