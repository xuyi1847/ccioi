import type {Channel} from "@/services/api";

export function RadioDial({channels,current,onSelect}:{channels:Channel[];current?:Channel;onSelect:(channel:Channel)=>void}){
  const min=87.5,max=106.9,value=current?.frequency??min,pct=((value-min)/(max-min))*100;
  return <div className="w-full max-w-2xl">
    <div className="relative h-12 px-2">
      <div className="dial-line absolute left-0 right-0 top-6"/>
      {Array.from({length:20}).map((_,i)=><span key={i} className="absolute top-[21px] h-[10px] w-px bg-black/30" style={{left:`${i/19*100}%`}}/>)}
      <span className="absolute top-2 h-8 w-[2px] bg-[var(--red)] transition-all duration-700" style={{left:`${pct}%`}}/>
    </div>
    <div className="grid grid-cols-4 gap-2 mt-2">
      {channels.map(channel=><button key={channel.id} onClick={()=>onSelect(channel)} className={`text-center transition-opacity ${current?.id===channel.id?"opacity-100":"opacity-40 hover:opacity-70"}`}>
        <span className="display block text-sm">{Number(channel.frequency).toFixed(1)}</span><span className="caps block mt-1">{channel.name.replace("兆赫","")}</span>
      </button>)}
    </div>
  </div>
}
