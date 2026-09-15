declare global { interface Window { MusicKit?: { configure:(config:Record<string,unknown>)=>Promise<void>; getInstance:()=>MusicKitInstance } } }
type PlaybackListener=()=>void;
type MusicItem={id?:string;playParams?:{id?:string;catalogId?:string}};
type MusicKitInstance={authorize:()=>Promise<string>;unauthorize:()=>Promise<void>;setQueue:(value:{song:string})=>Promise<void>;playLater?:(value:{song:string})=>Promise<void>;play:()=>Promise<void>;pause:()=>void;stop:()=>void;seekToTime?:(time:number)=>Promise<void>;skipToNextItem:()=>Promise<void>;addEventListener:(name:string,listener:PlaybackListener)=>void;removeEventListener:(name:string,listener:PlaybackListener)=>void;currentPlaybackTime:number;currentPlaybackDuration:number;playbackState:number|string;nowPlayingItem?:MusicItem;isAuthorized:boolean;musicUserToken?:string};
let instance:MusicKitInstance|null=null;

function timeout<T>(promise:Promise<T>,message:string,delay=8000):Promise<T>{return Promise.race([promise,new Promise<T>((_,reject)=>window.setTimeout(()=>reject(new Error(message)),delay))])}

function loadScript():Promise<void>{return new Promise((resolve,reject)=>{if(window.MusicKit)return resolve();const script=document.createElement("script");script.src="https://js-cdn.music.apple.com/musickit/v3/musickit.js";script.onload=()=>resolve();script.onerror=()=>reject(new Error("MusicKit failed to load"));document.head.appendChild(script)})}
export async function configureMusicKit(developerToken:string){await loadScript();await window.MusicKit!.configure({developerToken,app:{name:"MHz",build:"0.1.0"}});instance=window.MusicKit!.getInstance();return instance}
export const musicKit={
  authorize:async()=>{if(!instance)throw new Error("MusicKit is not configured");return timeout(instance.authorize(),"Apple Music 授权超时，请使用 Safari 打开后重试",20000)},
  unauthorize:async()=>instance?.unauthorize(),
  play:async(trackId:string)=>{if(!instance)throw new Error("MusicKit is not configured");instance.stop();await timeout(instance.setQueue({song:trackId}),"Apple Music 设置播放队列超时");await timeout(instance.play(),"Apple Music 开始播放超时")},
  prepare:async(trackId:string,position=0)=>{if(!instance)throw new Error("MusicKit is not configured");instance.stop();await timeout(instance.setQueue({song:trackId}),"Apple Music 设置播放队列超时");if(position>0&&instance.seekToTime)await timeout(instance.seekToTime(position),"Apple Music 恢复播放位置超时")},
  seek:async(position:number)=>{if(instance?.seekToTime)await timeout(instance.seekToTime(position),"Apple Music 恢复播放位置超时")},
  enqueue:async(trackId:string)=>{if(!instance?.playLater)return false;await timeout(instance.playLater({song:trackId}),"Apple Music 预加载下一首超时");return true},
  resume:async()=>{if(!instance)throw new Error("MusicKit is not configured");await timeout(instance.play(),"Apple Music 恢复播放超时")},
  pause:()=>instance?.pause(),
  stop:()=>instance?.stop(),
  skip:async()=>instance?.skipToNextItem(),
  observeTime:(listener:(current:number,duration:number)=>void)=>{if(!instance)throw new Error("MusicKit is not configured");const current=instance;const handler=()=>listener(current.currentPlaybackTime||0,current.currentPlaybackDuration||0);current.addEventListener("playbackTimeDidChange",handler);return()=>current.removeEventListener("playbackTimeDidChange",handler)},
  observeState:(listener:(playing:boolean,ended:boolean)=>void)=>{if(!instance)throw new Error("MusicKit is not configured");const current=instance;const handler=()=>{const value=current.playbackState;const playing=value===2||value==="playing";const stopped=value===4||value==="stopped";const nearEnd=current.currentPlaybackDuration>0&&current.currentPlaybackTime>=current.currentPlaybackDuration-1.5;const ended=value===5||value===10||value==="ended"||value==="completed"||(stopped&&nearEnd);const settled=playing||ended||value===0||value===3||stopped||value==="none"||value==="paused";if(settled)listener(playing,ended)};current.addEventListener("playbackStateDidChange",handler);return()=>current.removeEventListener("playbackStateDidChange",handler)},
  observeItem:(listener:(trackId:string)=>void)=>{if(!instance)throw new Error("MusicKit is not configured");const current=instance;const handler=()=>{const item=current.nowPlayingItem,id=item?.playParams?.catalogId||item?.playParams?.id||item?.id;if(id)listener(String(id))};current.addEventListener("nowPlayingItemDidChange",handler);return()=>current.removeEventListener("nowPlayingItemDidChange",handler)},
  get configured(){return Boolean(instance)}
  ,get userToken(){return instance?.isAuthorized?instance.musicUserToken||null:null}
};
