import type {Channel} from "@/services/api";

export function RadioDial({channels,current,onSelect,busy=false}:{channels:Channel[];current?:Channel;onSelect:(channel:Channel)=>void;busy?:boolean}){
  return <nav aria-label="兆赫频道" className="channel-strip w-full">
    <div className="mb-3 flex items-center justify-between px-1"><span className="caps text-[var(--muted)]">Select frequency</span><span className="caps text-[var(--red)]">On air</span></div>
    <div className="channel-scroll">
      {channels.map(channel=>{const active=current?.id===channel.id;return <button disabled={busy} key={channel.id} onClick={()=>onSelect(channel)} className={`channel-button ${active?"channel-active":""}`}>
        <span className="display block text-lg leading-none">{Number(channel.frequency).toFixed(1)}</span><span className="mt-2 block whitespace-nowrap text-xs text-[var(--muted)]">{channel.name}</span>
      </button>})}
    </div>
  </nav>
}
