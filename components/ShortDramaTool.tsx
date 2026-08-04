import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Clapperboard, Download, Film, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2, Users, WandSparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useSocket } from '../context/SocketContext';
import { mockBackend } from '../services/mockBackend';
import { uploadToOSS } from '../services/ossService';

type Engine = 'ltx-2.3' | 'opensora';
interface Character { id: string; name: string; description: string; reference_url?: string; voice_id?: string; }
interface Shot { id: string; title: string; scene: string; shot_size: string; camera: string; duration: number; prompt: string; dialogue: string; character_ids: string[]; engine: Engine; status: 'draft' | 'queued' | 'generating' | 'done' | 'failed'; output_url?: string; seed: number; }
interface ProjectData { synopsis: string; style: string; aspect_ratio: string; characters: Character[]; script: string; shots: Shot[]; audio_assets: any[]; export_url?: string; }
interface Project { id?: string; name: string; data: ProjectData; updated_at?: string; }

const uid = () => crypto.randomUUID();
const emptyData = (): ProjectData => ({ synopsis: '', style: '电影感写实', aspect_ratio: '9:16', characters: [], script: '', shots: [], audio_assets: [] });

const ShortDramaTool: React.FC = () => {
  const { user } = useAuth();
  const { notify } = useNotification();
  const { connect, sendCommand, lastMessage, isConnected } = useSocket();
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<'project' | 'characters' | 'script' | 'shots' | 'timeline'>('project');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storyboarding, setStoryboarding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadingCharacter, setUploadingCharacter] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [activeShotId, setActiveShotId] = useState('');
  const projectRef = useRef<Project | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { if (user) loadProjects(); }, [user?.id]);

  const loadProjects = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const items = await mockBackend.getDramaProjects(user.token);
      setProjects(items);
      if (items.length) setProject(items[0]);
    } catch (error: any) { notify.error(error.message); }
    finally { setLoading(false); }
  };

  const save = async (value = projectRef.current) => {
    if (!user || !value) return null;
    setSaving(true);
    try {
      const saved = await mockBackend.saveDramaProject(user.token, value);
      setProject(saved); projectRef.current = saved;
      setProjects((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      return saved;
    } catch (error: any) { notify.error(error.message); return null; }
    finally { setSaving(false); }
  };

  const patchData = (patch: Partial<ProjectData>) => setProject((current) => { if (!current) return current; const next = { ...current, data: { ...current.data, ...patch } }; projectRef.current = next; return next; });
  const patchShot = (id: string, patch: Partial<Shot>) => setProject((current) => { if (!current) return current; const next = { ...current, data: { ...current.data, shots: current.data.shots.map((shot) => shot.id === id ? { ...shot, ...patch } : shot) } }; projectRef.current = next; return next; });

  const createProject = () => { const next = { name: '未命名短剧', data: emptyData() }; setProject(next); setTab('project'); };
  const removeProject = async () => {
    if (!user || !project?.id || !confirm(`确定删除《${project.name}》吗？`)) return;
    await mockBackend.deleteDramaProject(user.token, project.id);
    const rest = projects.filter((item) => item.id !== project.id); setProjects(rest); setProject(rest[0] || null);
  };

  const addCharacter = () => patchData({ characters: [...(project?.data.characters || []), { id: uid(), name: '新角色', description: '', voice_id: '' }] });
  const updateCharacter = (id: string, patch: Partial<Character>) => patchData({ characters: (project?.data.characters || []).map((item) => item.id === id ? { ...item, ...patch } : item) });
  const uploadCharacter = async (character: Character, file?: File) => {
    if (!user || !file) return;
    setUploadingCharacter(character.id);
    try { updateCharacter(character.id, { reference_url: await uploadToOSS(file, user.token) }); notify.success('角色参考图已上传'); }
    catch { notify.error('角色图片上传失败'); }
    finally { setUploadingCharacter(''); }
  };

  const generateStoryboard = async () => {
    if (!user || !project?.data.script.trim()) return notify.warning('请先填写剧本');
    setStoryboarding(true);
    try {
      const generated = await mockBackend.generateDramaStoryboard(user.token, { script: project.data.script, characters: project.data.characters, style: project.data.style, aspect_ratio: project.data.aspect_ratio });
      const shots: Shot[] = generated.map((item: any, index: number) => ({ id: uid(), title: item.title || `镜头 ${index + 1}`, scene: item.scene || '', shot_size: item.shot_size || '中景', camera: item.camera || '固定', duration: Math.min(10, Math.max(2, Number(item.duration) || 5)), prompt: item.prompt || '', dialogue: item.dialogue || '', character_ids: item.character_ids || [], engine: 'ltx-2.3', status: 'draft', seed: 42 }));
      patchData({ shots }); setTab('shots'); notify.success(`已生成 ${shots.length} 个分镜`);
    } catch (error: any) { notify.error(error.message); }
    finally { setStoryboarding(false); }
  };

  const dispatchShot = async (shot: Shot) => {
    if (!user || !projectRef.current) return;
    if (!isConnected) await connect();
    const character = projectRef.current.data.characters.find((item) => shot.character_ids.includes(item.id) && item.reference_url);
    const portrait = projectRef.current.data.aspect_ratio === '9:16';
    setActiveShotId(shot.id); patchShot(shot.id, { status: 'generating' });
    sendCommand({ type: 'TASK_EXECUTION', task: 'VIDEO_GENERATION', token: user.token, model: shot.engine,
      parameters: { model: shot.engine, prompt: shot.prompt, width: portrait ? 1024 : 1536, height: portrait ? 1536 : 1024, frames: Math.min(481, Math.max(49, Math.round(shot.duration * 24) + 1)), num_frames: Math.min(481, Math.max(49, Math.round(shot.duration * 24) + 1)), fps: 24, seed: shot.seed, image_url: character?.reference_url, image_frame: character?.reference_url ? 0 : undefined, image_strength: character?.reference_url ? 0.9 : undefined, ref_image: shot.engine === 'opensora' ? character?.reference_url : undefined, config: 'configs/diffusion/inference/768px.py', steps: 40, ratio: projectRef.current.data.aspect_ratio, motion_score: 6, nproc_per_node: 1, project_id: projectRef.current.id, shot_id: shot.id }
    });
  };

  const runBatch = () => {
    const ids = (project?.data.shots || []).filter((shot) => shot.status !== 'done').map((shot) => shot.id);
    if (!ids.length) return notify.info('没有待生成镜头');
    setQueue(ids); const first = project?.data.shots.find((shot) => shot.id === ids[0]); if (first) dispatchShot(first);
  };

  const exportFilm = async () => {
    if (!user || !project?.id) return notify.warning('请先保存项目');
    const completed = project.data.shots.filter((shot) => shot.status === 'done' && shot.output_url);
    if (!completed.length || completed.length !== project.data.shots.length) return notify.warning('所有镜头生成完成后才能导出成片');
    setExporting(true);
    try {
      const exportUrl = await mockBackend.exportDrama(user.token, project.id, completed.map((shot) => shot.output_url!));
      patchData({ export_url: exportUrl });
      setTimeout(() => save(projectRef.current), 0);
      notify.success('成片导出完成');
    } catch (error: any) { notify.error(error.message); }
    finally { setExporting(false); }
  };

  useEffect(() => {
    if (!lastMessage || !activeShotId) return;
    try {
      const message = JSON.parse(lastMessage);
      if (message.type !== 'task_finished') return;
      const success = message.status === 'success' && message.output?.public_url;
      patchShot(activeShotId, success ? { status: 'done', output_url: message.output.public_url } : { status: 'failed' });
      setTimeout(async () => {
        await save(projectRef.current);
        setQueue((current) => {
          const remaining = current.filter((id) => id !== activeShotId);
          const next = projectRef.current?.data.shots.find((shot) => shot.id === remaining[0]);
          if (next) setTimeout(() => dispatchShot(next), 250); else setActiveShotId('');
          return remaining;
        });
      }, 50);
    } catch { /* ignore non-json telemetry */ }
  }, [lastMessage]);

  if (!user) return <div className="h-full flex items-center justify-center text-app-subtext">请先登录</div>;
  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-cyan-400" /></div>;

  return <div className="h-full min-h-0 flex gap-4">
    <aside className="w-56 shrink-0 rounded-2xl border border-app-border bg-app-surface/60 p-3 flex flex-col min-h-0">
      <button onClick={createProject} className="w-full py-2.5 rounded-xl bg-app-accent text-white text-xs font-bold flex items-center justify-center gap-2"><Plus size={14} />新建短剧</button>
      <div className="flex-1 overflow-y-auto custom-scrollbar mt-3 space-y-2">{projects.map((item) => <button key={item.id} onClick={() => setProject(item)} className={`w-full text-left p-3 rounded-xl border ${project?.id === item.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-app-border hover:bg-app-surface-hover'}`}><div className="text-xs font-bold truncate">{item.name}</div><div className="text-[9px] text-app-subtext mt-1">{item.data.shots?.length || 0} 个镜头</div></button>)}</div>
    </aside>
    <section className="flex-1 min-w-0 min-h-0 flex flex-col rounded-2xl border border-app-border bg-app-surface/40 overflow-hidden">
      {!project ? <div className="h-full flex flex-col items-center justify-center text-app-subtext"><Clapperboard size={42} className="opacity-20 mb-4" /><p className="text-sm">新建一个短剧项目开始制作</p></div> : <>
        <header className="p-4 border-b border-app-border flex flex-wrap items-center justify-between gap-3"><div><input value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} className="bg-transparent text-lg font-bold outline-none border-b border-transparent focus:border-cyan-400" /><div className="text-[10px] text-app-subtext">项目式 AI 短剧生产工作台</div></div><div className="flex gap-2"><button onClick={() => save()} disabled={saving} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-bold flex gap-1.5"><Save size={13} />{saving ? '保存中' : '保存项目'}</button>{project.id && <button onClick={removeProject} className="p-2 rounded-lg bg-red-500/10 text-red-400"><Trash2 size={14} /></button>}</div></header>
        <nav className="px-4 pt-3 flex gap-2 overflow-x-auto">{([['project','项目',BookOpen],['characters','角色库',Users],['script','剧本',Sparkles],['shots','分镜与生成',WandSparkles],['timeline','时间线',Film]] as const).map(([id,label,Icon]) => <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${tab === id ? 'bg-app-accent text-white' : 'text-app-subtext hover:bg-app-surface-hover'}`}><Icon size={13}/>{label}</button>)}</nav>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
          {tab === 'project' && <div className="max-w-2xl space-y-4"><label className="block text-xs text-app-subtext">故事简介<textarea value={project.data.synopsis} onChange={(e) => patchData({ synopsis: e.target.value })} className="mt-2 w-full h-32 bg-app-base border border-app-border rounded-xl p-3 text-app-text" /></label><div className="grid grid-cols-2 gap-4"><label className="text-xs text-app-subtext">视觉风格<input value={project.data.style} onChange={(e) => patchData({ style: e.target.value })} className="mt-2 w-full bg-app-base border border-app-border rounded-xl p-3 text-app-text" /></label><label className="text-xs text-app-subtext">成片画幅<select value={project.data.aspect_ratio} onChange={(e) => patchData({ aspect_ratio: e.target.value })} className="mt-2 w-full bg-app-base border border-app-border rounded-xl p-3 text-app-text"><option>9:16</option><option>16:9</option><option>1:1</option></select></label></div></div>}
          {tab === 'characters' && <div><button onClick={addCharacter} className="mb-4 px-3 py-2 rounded-lg border border-cyan-500/30 text-cyan-400 text-xs font-bold"><Plus size={13} className="inline mr-1"/>添加角色</button><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{project.data.characters.map((character) => <div key={character.id} className="rounded-xl border border-app-border bg-app-base/60 p-3"><div onClick={() => fileRefs.current[character.id]?.click()} className="aspect-video rounded-lg border border-dashed border-app-border mb-3 flex items-center justify-center overflow-hidden cursor-pointer">{uploadingCharacter === character.id ? <Loader2 className="animate-spin"/> : character.reference_url ? <img src={character.reference_url} className="w-full h-full object-contain"/> : <ImagePlus className="opacity-30"/>}<input ref={(el) => { fileRefs.current[character.id] = el; }} type="file" accept="image/*" className="hidden" onChange={(e) => uploadCharacter(character, e.target.files?.[0])}/></div><input value={character.name} onChange={(e) => updateCharacter(character.id,{name:e.target.value})} className="w-full bg-transparent font-bold outline-none"/><textarea value={character.description} onChange={(e) => updateCharacter(character.id,{description:e.target.value})} placeholder="外观、一致性特征、服装" className="mt-2 w-full h-20 bg-app-surface border border-app-border rounded-lg p-2 text-xs"/><input value={character.voice_id || ''} onChange={(e) => updateCharacter(character.id,{voice_id:e.target.value})} placeholder="voice_id（首版可为空）" className="mt-2 w-full bg-app-surface border border-app-border rounded-lg p-2 text-xs"/></div>)}</div></div>}
          {tab === 'script' && <div className="h-full flex flex-col"><textarea value={project.data.script} onChange={(e) => patchData({ script:e.target.value })} placeholder="输入分集剧本、场景和对白……" className="flex-1 min-h-80 bg-app-base border border-app-border rounded-xl p-4 text-sm leading-7"/><button onClick={generateStoryboard} disabled={storyboarding} className="mt-3 self-end px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 text-white text-xs font-bold flex gap-2">{storyboarding?<Loader2 size={14} className="animate-spin"/>:<WandSparkles size={14}/>}AI 拆分分镜</button></div>}
          {tab === 'shots' && <div><div className="flex justify-between mb-4"><div className="text-xs text-app-subtext">{project.data.shots.length} 个镜头 · 队列 {queue.length}</div><button onClick={runBatch} disabled={!!activeShotId} className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-bold disabled:opacity-40">批量生成待处理镜头</button></div><div className="space-y-3">{project.data.shots.map((shot,index)=><div key={shot.id} className="rounded-xl border border-app-border bg-app-base/60 p-3 grid lg:grid-cols-[80px_1fr_150px] gap-3"><div className="text-xs font-bold text-cyan-400">#{index+1}<div className="text-[9px] text-app-subtext mt-1">{shot.duration}s</div><div className="text-[9px] mt-2">{shot.status}</div></div><div><input value={shot.title} onChange={(e)=>patchShot(shot.id,{title:e.target.value})} className="w-full bg-transparent font-bold outline-none"/><textarea value={shot.prompt} onChange={(e)=>patchShot(shot.id,{prompt:e.target.value})} className="mt-2 w-full h-20 bg-app-surface border border-app-border rounded-lg p-2 text-xs"/><input value={shot.dialogue} onChange={(e)=>patchShot(shot.id,{dialogue:e.target.value})} placeholder="对白/字幕" className="mt-2 w-full bg-app-surface border border-app-border rounded-lg p-2 text-xs"/></div><div><select value={shot.engine} onChange={(e)=>patchShot(shot.id,{engine:e.target.value as Engine})} className="w-full bg-app-surface border border-app-border rounded-lg p-2 text-xs"><option value="ltx-2.3">LTX 2.3</option><option value="opensora">OpenSora</option></select>{shot.output_url?<video src={shot.output_url} controls className="mt-2 w-full aspect-video bg-black rounded-lg"/>:<button onClick={()=>dispatchShot(shot)} disabled={!!activeShotId} className="mt-2 w-full py-2 rounded-lg border border-cyan-500/30 text-cyan-400 text-xs">生成镜头</button>}</div></div>)}</div></div>}
          {tab === 'timeline' && <div><div className="rounded-xl border border-app-border bg-black/30 p-4"><div className="text-[10px] text-app-subtext mb-3">VIDEO TRACK</div><div className="flex gap-2 overflow-x-auto pb-3">{project.data.shots.map((shot,index)=><div key={shot.id} className="w-40 shrink-0"><div className="aspect-video bg-black rounded-lg overflow-hidden">{shot.output_url?<video src={shot.output_url} className="w-full h-full object-contain"/>:<div className="h-full flex items-center justify-center text-[10px] text-app-subtext">待生成</div>}</div><div className="text-[10px] mt-1 truncate">#{index+1} {shot.title}</div></div>)}</div><div className="border-t border-app-border pt-3 text-[10px] text-app-subtext">DIALOGUE / TTS TRACK（已保留 voice_id、对白和音频素材结构）</div><div className="mt-2 flex gap-2 overflow-x-auto">{project.data.shots.map((shot)=><div key={shot.id} className="w-40 shrink-0 h-10 rounded bg-emerald-500/10 border border-emerald-500/20 p-2 text-[9px] truncate">{shot.dialogue || '无对白'}</div>)}</div></div><div className="mt-4 flex justify-end"><button onClick={exportFilm} disabled={exporting} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">{exporting?<Loader2 size={14} className="animate-spin"/>:<Film size={14}/>}导出 H.264 / AAC 成片</button></div>{project.data.export_url && <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/5 p-4"><video src={project.data.export_url} controls className="w-full max-h-96 bg-black rounded-lg"/><a href={project.data.export_url} download className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-green-400"><Download size={14}/>下载最终成片</a></div>}</div>}
        </div>
      </>}
    </section>
  </div>;
};

export default ShortDramaTool;
