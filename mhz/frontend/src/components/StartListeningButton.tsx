export function StartListeningButton({busy,onStart}:{busy:boolean;onStart:()=>void}){
  return <button disabled={busy} onClick={onStart} className="group rounded-full border border-black/20 bg-white/30 px-7 py-3 text-xs font-semibold tracking-[.14em] transition hover:bg-black hover:text-white disabled:opacity-40">
    {busy?"CONNECTING…":"CONNECT APPLE MUSIC"}
  </button>;
}
