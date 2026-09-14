"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {Player} from "@/components/Player";
import {RadioDial} from "@/components/RadioDial";
import {StartListeningButton} from "@/components/StartListeningButton";
import {api,Channel,Recommendation} from "@/services/api";
import {configureMusicKit,musicKit} from "@/services/musickit";
import {usePlayer} from "@/stores/player";

const LEGACY_USER_KEY="mhz-user-id-v2";

export default function Home(){
  const state=usePlayer();
  const [favoriteIds,setFavoriteIds]=useState<Set<string>>(new Set());
  const [authenticated,setAuthenticated]=useState(false);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [loginBusy,setLoginBusy]=useState(false);
  const [loginError,setLoginError]=useState("");
  const audio=useRef<HTMLAudioElement|null>(null);
  const sent30=useRef(false);
  const advance=useRef<()=>void>(()=>undefined);
  const appleMode=useRef(false);
  const appleQueued=useRef(false);
  const appleCompleted=useRef(false);
  const appleSwitching=useRef(false);
  const removeAppleObserver=useRef<(()=>void)|null>(null);
  const removeAppleStateObserver=useRef<(()=>void)|null>(null);
  const operationPending=useRef(false);
  const appleClock=useRef({current:0,duration:0,updatedAt:0});

  const record=useCallback(async(type:string,item?:Recommendation,progress?:number)=>{
    const current=usePlayer.getState(),target=item||current.current;
    if(!target||!authenticated)return;
    const elapsed=progress??current.progress;
    try{await api.event({trackId:target.track.id,channelId:current.channel?.id,recommendationId:target.recommendationId,eventType:type,playDurationMs:Math.round((target.track.durationMs||0)*elapsed/100),trackDurationMs:target.track.durationMs});return true}catch{return false}
  },[authenticated]);

  const fetchNext=useCallback(async(channel?:Channel,exclude:string[]=[]):Promise<Recommendation|undefined>=>{
    const selected=channel||usePlayer.getState().channel;
    if(!selected||!authenticated)return;
    return api.next(selected.id,exclude);
  },[authenticated]);

  const playItem=useCallback(async(item:Recommendation,autoplay=true)=>{
    const player=audio.current;
    if(!player)throw new Error("播放器尚未初始化");
    if(item.track.playbackType==="musickit"){
      player.pause();player.removeAttribute("src");player.load();
      appleQueued.current=false;
      void record("impression",item,0);
      if(autoplay){appleSwitching.current=true;try{await musicKit.play(item.track.provider.trackId)}finally{appleSwitching.current=false}appleQueued.current=true}
      sent30.current=false;appleCompleted.current=false;appleClock.current={current:0,duration:(item.track.durationMs||0)/1000,updatedAt:performance.now()};
      state.set({current:item,progress:0,error:undefined,playing:autoplay});
      if(autoplay)void record("play_start",item,0);
      return;
    }
    sent30.current=false;
    appleCompleted.current=false;
    appleClock.current={current:0,duration:(item.track.durationMs||0)/1000,updatedAt:performance.now()};
    state.set({current:item,progress:0,error:undefined});
    await record("impression",item,0);
    if(!item.track.streamUrl){player.pause();player.removeAttribute("src");player.load();state.set({playing:false});return}
    await record("play_start",item,0);
    player.src=item.track.streamUrl;player.load();
    try{await player.play()}catch(error){state.set({playing:false,error:"浏览器阻止了自动播放，请点击中间的播放按钮"});if(error instanceof DOMException&&error.name==="NotAllowedError")return;throw error}
  },[record,state]);

  const skip=useCallback(async(dislike=false)=>{
    if(operationPending.current)return;
    operationPending.current=true;
    usePlayer.getState().set({loading:true});
    const current=usePlayer.getState();
    void record(dislike?"dislike":"skip");
    try{const item=current.next||await fetchNext(current.channel,current.current?[current.current.track.id]:[]);if(!item)throw new Error("暂时没有可播放的下一首");await playItem(item);state.set({next:await fetchNext(current.channel,[item.track.id])})}
    catch(error){state.set({error:error instanceof Error?error.message:"切换下一首失败"})}
    finally{operationPending.current=false;usePlayer.getState().set({loading:false})}
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
    return()=>{player.pause();player.removeAttribute("src");player.load();removeAppleObserver.current?.();removeAppleStateObserver.current?.()};
  },[fetchNext,record]);

  useEffect(()=>{const timer=window.setInterval(()=>{const current=usePlayer.getState(),clock=appleClock.current;if(!appleMode.current||!current.playing||!clock.duration||appleSwitching.current)return;const elapsed=(performance.now()-clock.updatedAt)/1000,estimatedTime=Math.min(clock.duration,clock.current+elapsed),progress=estimatedTime/clock.duration*100;current.set({progress:Math.min(100,progress)});if(estimatedTime>1&&clock.duration-estimatedTime<=1&&!appleCompleted.current&&!operationPending.current){appleCompleted.current=true;void record("play_complete",undefined,100).then(()=>advance.current())}},250);return()=>window.clearInterval(timer)},[record]);

  useEffect(()=>{const next=state.next?.track.artworkUrl;if(!next)return;const image=new window.Image();image.src=next},[state.next]);

  const initializeUser=useCallback(async()=>{const legacyUserId=localStorage.getItem(LEGACY_USER_KEY);if(legacyUserId){await api.claimLegacy(legacyUserId);localStorage.removeItem(LEGACY_USER_KEY)}const [channels,favorites]=await Promise.all([api.channels(),api.favorites()]);setFavoriteIds(new Set(favorites.trackIds));usePlayer.getState().set({channels,channel:channels[0]});setAuthenticated(true)},[]);

  useEffect(()=>{void(async()=>{try{if(!localStorage.getItem("ccioi_auth_token")){setAuthenticated(false);return}await initializeUser()}catch(error){localStorage.removeItem("ccioi_auth_token");setAuthenticated(false);usePlayer.getState().set({error:error instanceof Error?error.message:"MHz 无法启动"})}})()},[initializeUser]);

  const login=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();if(loginBusy)return;setLoginBusy(true);setLoginError("");try{await api.login(email.trim(),password);await initializeUser()}catch(error){setLoginError(error instanceof Error?error.message:"登录失败")}finally{setLoginBusy(false)}};

  const toggleFavorite=async()=>{const current=usePlayer.getState().current;if(!current)return;const trackId=current.track.id,removing=favoriteIds.has(trackId);setFavoriteIds(previous=>{const next=new Set(previous);if(removing)next.delete(trackId);else next.add(trackId);return next});if(!await record(removing?"unfavorite":"favorite",current)){setFavoriteIds(previous=>{const next=new Set(previous);if(removing)next.add(trackId);else next.delete(trackId);return next});state.set({error:"喜欢状态保存失败，请重试"})}};

  const connect=async()=>{
    state.set({loading:true,error:undefined});
    try{
      const token=await api.appleToken();
      await configureMusicKit(token.developerToken);
      const userToken=await musicKit.authorize();
      appleMode.current=true;
      const catalog=await api.appleBootstrap(userToken,150);
      if(!catalog.count)throw new Error("Apple Music 没有返回可推荐歌曲");
      removeAppleObserver.current?.();removeAppleStateObserver.current?.();
      removeAppleObserver.current=musicKit.observeTime((currentTime,duration)=>{
        if(!duration||appleSwitching.current)return;
        appleClock.current={current:currentTime,duration,updatedAt:performance.now()};
        const progress=Math.min(100,currentTime/duration*100),current=usePlayer.getState();
        current.set({progress});
        if(currentTime>=30&&!sent30.current){sent30.current=true;void record("play_30s")}
        if(progress>=60&&!current.next&&current.current)void fetchNext(current.channel,[current.current.track.id]).then(next=>current.set({next})).catch(()=>undefined);
        if(current.playing&&currentTime>1&&(duration-currentTime<=1.25||progress>=99.5)&&!appleCompleted.current){appleCompleted.current=true;void record("play_complete",undefined,100).then(()=>advance.current())}
      });
      removeAppleStateObserver.current=musicKit.observeState((playing,ended)=>{
        if(appleSwitching.current)return;
        usePlayer.getState().set({playing});
        if(ended&&!appleCompleted.current){appleCompleted.current=true;void record("play_complete",undefined,100).then(()=>advance.current())}
      });
      const current=await fetchNext();
      if(!current)throw new Error("暂时没有可推荐歌曲，请稍后重试");
      state.set({connected:true});await playItem(current,false);
      state.set({next:await fetchNext(state.channel,[current.track.id])});
    }catch(error){appleMode.current=false;state.set({connected:false,error:error instanceof Error?error.message:"Apple Music 授权失败"})}
    finally{state.set({loading:false})}
  };
  const changeChannel=async(channel:Channel)=>{if(operationPending.current)return;operationPending.current=true;state.set({channel,loading:true,next:undefined});try{if(channel.id==="chinese"&&!appleMode.current){const imported=await api.discoverChinese(100);if(!imported.count)throw new Error("当前没有找到可用的华语歌曲")}const current=usePlayer.getState().current,item=await fetchNext(channel,current?[current.track.id]:[]);if(item){await playItem(item);state.set({next:await fetchNext(channel,[item.track.id])})}}catch(error){state.set({error:error instanceof Error?error.message:"切台失败"})}finally{operationPending.current=false;state.set({loading:false})}};
  const toggle=async()=>{const player=audio.current;if(!player||operationPending.current)return;operationPending.current=true;state.set({loading:true});try{if(appleMode.current){if(state.playing){musicKit.pause();state.set({playing:false})}else if(!appleQueued.current&&state.current){await musicKit.play(state.current.track.provider.trackId);appleQueued.current=true;state.set({playing:true});void record("play_start",state.current,0)}else{await musicKit.resume();state.set({playing:true})}}else if(player.paused)await player.play();else player.pause()}catch(error){state.set({playing:false,error:error instanceof Error?error.message:"无法播放此音频，请尝试下一首"})}finally{operationPending.current=false;state.set({loading:false})}};

  return <main className="relative flex min-h-[100svh] flex-col items-center px-4 py-5 sm:px-8 sm:py-8"><div className="noise"/><header className="z-10 flex w-full max-w-5xl items-center justify-between border-b border-black/10 pb-4"><div className="display text-2xl font-bold">MHz</div><div className="caps whitespace-nowrap text-[var(--muted)]"><span className="hidden sm:inline">Personal radio · </span>Apple Music</div></header>
    {!authenticated?<section className="z-10 flex w-full flex-1 flex-col items-center justify-center pb-12 text-center"><div className="display text-[clamp(64px,16vw,140px)] leading-none">87.5</div><h1 className="mt-8 text-2xl sm:text-4xl">登录 ccioi，开始收听</h1><p className="mt-3 text-sm text-[var(--muted)]">你的喜好和收听记录会同步到同一个账号</p><form onSubmit={login} className="mt-8 flex w-full max-w-sm flex-col gap-3 text-left"><label className="text-xs text-[var(--muted)]">邮箱<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)} className="mt-1.5 h-12 w-full rounded-xl border border-black/15 bg-white/70 px-4 text-base text-[var(--ink)] outline-none focus:border-black" placeholder="name@example.com"/></label><label className="text-xs text-[var(--muted)]">密码<span className="relative mt-1.5 block"><input type={showPassword?"text":"password"} autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-black/15 bg-white/70 px-4 pr-14 text-base text-[var(--ink)] outline-none focus:border-black" placeholder="输入密码"/><button type="button" onClick={()=>setShowPassword(value=>!value)} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-lg text-[var(--muted)]" aria-label={showPassword?"隐藏密码":"显示密码"} title={showPassword?"隐藏密码":"显示密码"}>{showPassword?"◉":"◎"}</button></span></label>{loginError&&<p className="text-center text-sm text-[var(--red)]">{loginError}</p>}<button type="submit" disabled={loginBusy} className="mt-2 h-12 rounded-full bg-black text-sm text-white disabled:opacity-50">{loginBusy?"登录中…":"登录并进入 MHz"}</button></form></section>:!state.connected?<section className="z-10 flex flex-1 flex-col items-center justify-center pb-20 text-center"><div className="display text-[clamp(72px,18vw,170px)] leading-none">87.5</div><p className="caps mt-3 text-[var(--muted)]">Signal found</p><h1 className="mt-12 max-w-lg text-2xl font-normal sm:text-4xl">不是播放你喜欢的歌，<br/>而是找到你的下一首喜欢。</h1><div className="mt-10"><StartListeningButton busy={state.loading} onStart={connect}/></div><p className="mt-4 text-xs text-[var(--muted)]">使用你自己的 Apple Music 订阅授权播放</p></section>:
    <section className="z-10 flex w-full max-w-5xl flex-1 flex-col justify-center gap-5 py-5 sm:gap-7 sm:py-8">{state.current?<Player item={state.current} playing={state.playing} progress={state.progress} busy={state.loading} liked={favoriteIds.has(state.current.track.id)} frequency={Number(state.channel?.frequency||87.5)} channelName={state.channel?.name||"私人兆赫"} onToggle={()=>void toggle()} onFavorite={toggleFavorite} onSkip={()=>void skip()} onDislike={()=>void skip(true)} onExternal={()=>void record("external_play")}/>:<div className="pulse caps text-center">Tuning signal…</div>}<RadioDial channels={state.channels} current={state.channel} busy={state.loading} onSelect={changeChannel}/></section>}
    {state.error&&<div className="fixed bottom-5 z-20 max-w-[90vw] rounded-full bg-black px-5 py-3 text-center text-xs text-white">{state.error}</div>}
  </main>;
}
