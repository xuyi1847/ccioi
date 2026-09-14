export type Channel={id:string;frequency:number;name:string;channelType:string;config:Record<string,number>};
export type Track={id:string;title:string;artist:string;album?:string;artworkUrl?:string;durationMs?:number;streamUrl?:string;licenseUrl?:string;playbackType:"stream"|"external"|"musickit";externalLinks:Record<string,string>;provider:{name:string;trackId:string}};
export type Recommendation={recommendationId:string;track:Track;reason:{type:string;confidence:number}};
const API=process.env.NEXT_PUBLIC_API_URL||"http://localhost:8000/api/v1";
const CCIOI_API=process.env.NEXT_PUBLIC_CCIOI_API_URL||"https://www.ccioi.com/api";

async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const token=typeof window!=="undefined"?localStorage.getItem("ccioi_auth_token"):null;
  const response=await fetch(`${API}${path}`,{...init,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{ }),...init?.headers}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.detail||body.error?.message||`Request failed (${response.status})`)}
  return response.json();
}
export const api={
  login:async(email:string,password:string)=>{
    const response=await fetch(`${CCIOI_API}/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.detail||"登录失败");
    localStorage.setItem("ccioi_auth_token",body.token);
    localStorage.setItem("ccioi_current_user_data",JSON.stringify({...body.user,token:body.token}));
    return body.user;
  },
  claimLegacy:(legacyUserId:string)=>request<{migratedEvents:number}>("/users/claim-legacy",{method:"POST",body:JSON.stringify({legacyUserId})}),
  channels:()=>request<Channel[]>("/channels"),
  next:(channelId:string,excludeTrackIds:string[])=>request<Recommendation>("/recommendations/next",{method:"POST",body:JSON.stringify({channelId,excludeTrackIds})}),
  event:(body:Record<string,unknown>)=>request("/events",{method:"POST",body:JSON.stringify(body)}),
  favorites:()=>request<{trackIds:string[]}>("/events/favorites"),
  appleToken:()=>request<{developerToken:string;storefront:string}>("/apple/developer-token"),
  appleBootstrap:(musicUserToken:string,limit=100)=>request<{count:number;trackIds:string[]}>(`/apple/bootstrap?limit=${limit}`,{method:"POST",headers:{"Music-User-Token":musicUserToken}}),
  search:(query:string)=>request<{count:number;trackIds:string[]}>(`/tracks/search?q=${encodeURIComponent(query)}`),
  discover:(limit=100)=>request<{count:number;trackIds:string[]}>(`/tracks/discover?limit=${limit}`,{method:"POST"}),
  discoverChinese:(limit=100)=>request<{count:number;trackIds:string[]}>(`/tracks/discover/chinese?limit=${limit}`,{method:"POST"})
  ,discoverMetadata:(limit=100)=>request<{count:number;trackIds:string[]}>(`/tracks/discover/metadata?limit=${limit}`,{method:"POST"})
};
