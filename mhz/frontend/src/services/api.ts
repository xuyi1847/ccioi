export type Channel={id:string;frequency:number;name:string;channelType:string;config:Record<string,number>};
export type Track={id:string;title:string;artist:string;album?:string;artworkUrl?:string;durationMs?:number;streamUrl?:string;licenseUrl?:string;provider:{name:string;trackId:string}};
export type Recommendation={recommendationId:string;track:Track;reason:{type:string;confidence:number}};
const API=process.env.NEXT_PUBLIC_API_URL||"http://localhost:8000/api/v1";

async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`${API}${path}`,{...init,headers:{"Content-Type":"application/json",...init?.headers}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.detail||body.error?.message||`Request failed (${response.status})`)}
  return response.json();
}
export const api={
  anonymous:()=>request<{userId:string}>("/users/anonymous",{method:"POST"}),
  channels:()=>request<Channel[]>("/channels"),
  next:(userId:string,channelId:string,excludeTrackIds:string[])=>request<Recommendation>("/recommendations/next",{method:"POST",body:JSON.stringify({userId,channelId,excludeTrackIds})}),
  event:(body:Record<string,unknown>)=>request("/events",{method:"POST",body:JSON.stringify(body)}),
  appleToken:()=>request<{developerToken:string;storefront:string}>("/apple/developer-token"),
  search:(query:string)=>request<{count:number;trackIds:string[]}>(`/tracks/search?q=${encodeURIComponent(query)}`),
  discover:(limit=100)=>request<{count:number;trackIds:string[]}>(`/tracks/discover?limit=${limit}`,{method:"POST"}),
  discoverChinese:(limit=100)=>request<{count:number;trackIds:string[]}>(`/tracks/discover/chinese?limit=${limit}`,{method:"POST"})
};
