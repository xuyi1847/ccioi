declare global { interface Window { MusicKit?: { configure:(config:Record<string,unknown>)=>Promise<void>; getInstance:()=>MusicKitInstance } } }
type MusicKitInstance={authorize:()=>Promise<string>;unauthorize:()=>Promise<void>;setQueue:(value:{song:string})=>Promise<void>;play:()=>Promise<void>;pause:()=>void;skipToNextItem:()=>Promise<void>;isAuthorized:boolean};
let instance:MusicKitInstance|null=null;

function loadScript():Promise<void>{return new Promise((resolve,reject)=>{if(window.MusicKit)return resolve();const script=document.createElement("script");script.src="https://js-cdn.music.apple.com/musickit/v3/musickit.js";script.onload=()=>resolve();script.onerror=()=>reject(new Error("MusicKit failed to load"));document.head.appendChild(script)})}
export async function configureMusicKit(developerToken:string){await loadScript();await window.MusicKit!.configure({developerToken,app:{name:"MHz",build:"0.1.0"}});instance=window.MusicKit!.getInstance();return instance}
export const musicKit={
  authorize:async()=>{if(!instance)throw new Error("MusicKit is not configured");return instance.authorize()},
  unauthorize:async()=>instance?.unauthorize(),
  play:async(trackId:string)=>{if(!instance)throw new Error("MusicKit is not configured");await instance.setQueue({song:trackId});await instance.play()},
  pause:()=>instance?.pause(),
  skip:async()=>instance?.skipToNextItem(),
  get configured(){return Boolean(instance)}
};
