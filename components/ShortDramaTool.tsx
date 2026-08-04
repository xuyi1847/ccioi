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
const sampleProject = (): Project => {
  const shen = uid();
  const yue = uid();
  const echo = uid();
  const specs: Array<[string, string, string, string, string, string[]]> = [
    ['木星归航', '深空与远航舰外景', '超广角缓慢掠过舰体', '沈舟旁白：离开地球三百八十七天，我们终于踏上归途。', 'Opening shot. The same compact Chinese deep-space research ship Qiming-7 glides above Jupiter, recognizable dark graphite hull, white nose section, one amber stripe, twin blue ion engines and the number Q7. Camera slowly flies along the hull toward the cockpit, majestic Jupiter storms below, realistic hard science fiction.', []],
    ['最后一次点火', '启明七号驾驶舱', '中景从舷窗推向二人', '林玥：燃料只够最后一次点火。　沈舟：一次就够，我们回家。', 'Inside Qiming-7 immediately afterward. Captain Shen Zhou sits left and engineer Lin Yue sits right in the same compact cockpit with curved windows, dark metal panels and amber interface lights. Both wear their fixed navy flight suits. Jupiter fills the window as Lin reports low fuel and Shen answers calmly.', [shen, yue]],
    ['十七分钟后的信号', '驾驶舱通信台', '警报特写后快速推近屏幕', '回传录音中的沈舟：不要启动主引擎！重复，不要启动！', 'Direct continuation. A red communication alert interrupts the crew. Close-up of the console showing QIMING-7 and a timestamp exactly seventeen minutes in the future. A damaged recording plays in Shen Zhou’s own voice warning them not to ignite the main engine. Red light reflects across both shocked faces.', [shen, yue, echo]],
    ['验证声纹', '驾驶舱', '双人过肩镜头切全息球', '林玥：这不可能。　回声：声纹匹配沈舟，可信度百分之九十九点九。', 'Lin Yue rejects the warning while the ship AI Echo appears as the same small cyan holographic sphere above the center console. Echo verifies the future voice print. Over-shoulder composition includes Shen on the left seat, Lin on the right and the cyan sphere between them, continuous cockpit geography.', [shen, yue, echo]],
    ['灾难倒计时', '主引擎监控屏', '屏幕微距转焦到林玥', '回声：主引擎冷却管破裂，预计十六分四十二秒后爆炸。', 'Direct continuation. Macro shot of the engine schematic turns from green to red as Echo identifies a hairline coolant rupture and begins a countdown at 16:42. Rack focus to Lin Yue realizing the future signal is real. The same amber cockpit lights now pulse red.', [yue, echo]],
    ['唯一方案', '驾驶舱中央控制台', '稳定三角构图缓慢环绕', '林玥：必须去舱外手动抛掉反应堆。　沈舟：我去，你留在这里驾驶。', 'Without a scene jump, Lin displays the external reactor diagram. She explains someone must perform a manual ejection outside. Shen unclips his harness and assigns her to fly. Slow circular camera holds their fixed positions and uniforms, ticking countdown audible.', [shen, yue, echo]],
    ['分歧', '气闸准备区', '手持跟拍沈舟穿头盔', '林玥：你是舰长，不该冒险。　沈舟：所以必须由我出去。', 'Moments later in Qiming-7’s narrow airlock. Shen still wears the same navy suit and adds the same white EVA helmet with amber stripe, no costume redesign. Lin follows him from the cockpit, arguing. He locks the helmet and answers, handheld camera, warning lights.', [shen, yue]],
    ['出舱', '飞船气闸外', '从舱内跟随至太空全景', '林玥（无线电）：安全绳锁定。　沈舟：开始舱外作业。', 'Direct continuation. The outer hatch opens and Shen carefully pulls himself onto the graphite hull above Jupiter, tether attached to his waist. Camera follows from airlock into a wide exterior view; his white helmet, navy EVA suit and amber markings remain exact.', [shen, yue]],
    ['爬向反应堆', '启明七号舰体表面', '低机位平行跟拍', '回声：距离爆炸十一分钟。　沈舟：足够了。', 'Shen crawls hand over hand along the same Q7 hull toward the rear reactor panel, Jupiter rotating below. Low tracking camera stays parallel to him. Echo announces eleven minutes over radio; Shen replies while keeping both magnetic boots planted.', [shen, echo]],
    ['卡死的舱盖', '反应堆外壳', '手部特写与头盔近景', '沈舟：舱盖变形，打不开。　林玥：右侧维护槽，有机械释放杆。', 'Direct continuation at the rear panel. Shen’s gloved hands pull a warped reactor hatch that refuses to open. Close-up stays on the same amber-striped gloves and helmet. Lin Yue guides him by radio to a recessed mechanical lever on the right.', [shen, yue]],
    ['微陨石来袭', '舰体与深空', '远景高速摇镜回到人物', '回声：微陨石群接近，撞击倒计时三、二、一！', 'A bright micro-meteor swarm emerges behind Jupiter. Camera whip-pans from the fast particles back to Shen bracing on the hull beside the unopened reactor panel. Echo counts down over radio; impacts spark across the graphite hull without changing the ship design.', [shen, echo]],
    ['安全绳断裂', '舰体尾部', '慢动作近景后迅速拉远', '林玥：沈舟！　沈舟：我没事，先稳住飞船！', 'One meteor cuts Shen’s tether. In a brief slow-motion close shot the cable snaps, then camera pulls wide as he drifts one meter from the ship while gripping the manual lever with one hand. Lin shouts over radio; Shen tells her to stabilize the vessel.', [shen, yue]],
    ['驾驶舱失控', '启明七号驾驶舱', '手持双人位模拟剧烈震动', '回声：姿态失控。　林玥：关闭自动驾驶，我来接管。', 'Cut inside the same cockpit at the exact same moment. Lin remains in her navy flight suit at the right pilot seat, manually correcting the violently shaking ship while Echo’s cyan sphere flickers above the console. Jupiter rolls outside, panels spark but retain layout.', [yue, echo]],
    ['最后的释放杆', '反应堆外壳', '头盔主观镜头转手部特写', '林玥（无线电）：还有四分钟。　沈舟：我够到了。', 'Back outside, continuing Shen’s drift. Through his helmet view, his free hand stretches and finally catches the mechanical release lever. Cut to close-up as the amber-striped glove locks around it. Lin reports four minutes; his boots are still off the hull.', [shen, yue]],
    ['抛出反应堆', '舰体尾部', '超广角跟随反应堆远离', '沈舟：反应堆已释放！　回声：爆炸仍将在九十秒后发生。', 'Shen pulls the lever. The cylindrical reactor ejects cleanly from Q7’s rear and tumbles away toward open space. Wide camera follows it while Shen remains gripping the hull edge. Echo warns it will still explode in ninety seconds.', [shen, echo]],
    ['来不及撤离', '驾驶舱与舷窗', '林玥近景推向操纵杆', '林玥：你离爆心太近。　沈舟：别管我，带启明号走！', 'Inside the cockpit, Lin sees Shen stranded beside the hull and the glowing reactor behind him. She grips the controls, refusing his order to leave. Camera pushes from her determined face to the cargo-drone control switch beside her hand.', [shen, yue]],
    ['货运无人机救援', '舰体外侧', '追随无人机高速飞行', '林玥：舰长的命令驳回。无人机，锁定沈舟！', 'Direct continuation. The same boxy orange cargo drone launches from Q7, flies along the graphite hull and extends two mechanical arms toward Shen. Dynamic tracking shot preserves ship direction, Jupiter background and Shen’s exact suit.', [shen, yue]],
    ['爆炸与抓取', '深空舰尾', '慢动作环绕后强光遮挡', '沈舟：抓住了！　回声：冲击波五秒后抵达。', 'The orange drone clamps onto Shen’s forearm just as the discarded reactor explodes behind them. Slow circular camera captures the white helmet, navy suit and orange drone silhouetted against a blue-white blast, then the shockwave races toward Q7.', [shen, echo]],
    ['回到气闸', '气闸内', '近景随舱门关闭稳定下来', '林玥：欢迎回来。　沈舟：那段警告，还没有发送。', 'The drone pulls Shen through the same airlock and the hatch seals. Lin helps remove his unchanged helmet. Their relief stops when Shen notices the console clock: the future warning has not yet been transmitted. Camera settles from shaking to stable.', [shen, yue]],
    ['闭合时间环', '驾驶舱与地球方向', '录音特写缓慢拉远至舰外', '沈舟（录音）：不要启动主引擎！重复，不要启动！　林玥：发送时间，十七分钟前。', 'Final sequence in the same cockpit. Shen records the exact warning heard at the beginning while Lin programs transmission seventeen minutes into the past. Echo sends it; the waveform loops back on the display. Camera pulls through the window to Q7 flying safely toward a distant blue Earth, twin ion engines glowing, story circle complete.', [shen, yue, echo]],
  ];
  return {
    name: 'LTX 2分钟太空科幻样例·十七分钟',
    data: {
      synopsis: '木星返航途中，启明七号收到一段来自十七分钟后的求救信号。舰长沈舟和工程师林玥必须在反应堆爆炸前完成舱外抛离，并亲手把警告送回过去。',
      style: '电影级硬科幻写实，统一启明七号飞船空间，深石墨灰与琥珀色视觉系统，木星背景，固定角色服装与道具，连续光线方向',
      aspect_ratio: '9:16',
      audio_assets: [],
      characters: [
        { id: shen, name: '沈舟', description: '35岁中国男性舰长，短黑发，方正清瘦面孔，右眉尾小疤，始终穿深海军蓝连体飞行服，左胸白色Q7徽章，琥珀色肩带；舱外只额外佩戴白色球形头盔和同款琥珀条纹', voice_id: '' },
        { id: yue, name: '林玥', description: '29岁中国女性工程师，黑色低马尾，椭圆脸，左眼下小痣，始终穿深海军蓝连体飞行服，左胸白色Q7徽章，银灰工具腕带', voice_id: '' },
        { id: echo, name: '回声AI', description: '没有人体，始终表现为悬浮在中央控制台上方的拳头大小青色全息球，三道水平光环，柔和中性声音，不得变成人形机器人', voice_id: '' },
      ],
      script: '第1集《十七分钟》（约2分钟）\n\n【开场】启明七号掠过木星，沈舟和林玥准备进行返航前最后一次主引擎点火。燃料只够一次修正。\n\n【异常】通信台收到来自十七分钟后的信号，录音里正是沈舟自己的声音：“不要启动主引擎！”回声AI验证声纹真实，并检测出冷却管破裂，主引擎将在十七分钟内爆炸。\n\n【任务】唯一生路是舱外手动抛离反应堆。沈舟坚持出舱，让林玥留在驾驶舱稳定飞船。两人约定完成任务后一起回家。\n\n【危机】沈舟打开反应堆外壳时遭遇微陨石群，安全绳被切断。林玥关闭自动驾驶亲自稳住飞船，同时用无线电指引沈舟找到机械释放杆。\n\n【高潮】反应堆成功抛离，却将在九十秒后爆炸。沈舟距离爆心太近，命令林玥离开；林玥驳回命令，发射货运无人机抓住沈舟。爆炸发生，无人机顶着冲击波将他拖回气闸。\n\n【闭环】获救后，两人发现最初的警告仍未发送。沈舟录下同样的话，林玥把信号送回十七分钟前。启明七号避开了爆炸，继续飞向地球。',
      shots: specs.map(([title, scene, camera, dialogue, prompt, character_ids], index) => ({ id: uid(), title, scene, shot_size: index % 4 === 0 ? '全景' : '中近景', camera, duration: 6, engine: 'ltx-2.3', status: 'draft', seed: 5201 + index, character_ids, dialogue, prompt })),
    },
  };
};

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
      if (items.length) { setProjects(items); setProject(items[0]); }
      else {
        const saved = await mockBackend.saveDramaProject(user.token, sampleProject());
        setProjects([saved]); setProject(saved);
        notify.success('已创建 2 分钟 LTX 完整故事样例');
      }
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
  const createSample = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const saved = await mockBackend.saveDramaProject(user.token, sampleProject());
      setProjects((current) => [saved, ...current]);
      setProject(saved); projectRef.current = saved; setTab('project');
      notify.success('已载入 2 分钟 LTX 完整故事样例');
    } catch (error: any) { notify.error(error.message); }
    finally { setSaving(false); }
  };
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
    const shotCharacters = projectRef.current.data.characters.filter((item) => shot.character_ids.includes(item.id));
    const character = shotCharacters.find((item) => item.reference_url);
    const generationPrompt = [
      shot.prompt,
      shotCharacters.length ? `Character continuity: ${shotCharacters.map((item) => `${item.name}: ${item.description}`).join('；')}. Keep their face, hairstyle and costume identical to adjacent shots.` : '',
      shot.dialogue ? `Synchronized native audio. The characters speak natural Mandarin Chinese with accurate lip movement and restrained cinematic acting. Exact dialogue in this shot: “${shot.dialogue}”. Preserve the speaker order. Do not render subtitles or on-screen text.` : 'Synchronized native environmental audio, no spoken dialogue and no subtitles.',
    ].filter(Boolean).join(' ');
    const portrait = projectRef.current.data.aspect_ratio === '9:16';
    setActiveShotId(shot.id); patchShot(shot.id, { status: 'generating' });
    sendCommand({ type: 'TASK_EXECUTION', task: 'VIDEO_GENERATION', token: user.token, model: shot.engine,
      parameters: { model: shot.engine, prompt: generationPrompt, dialogue: shot.dialogue, generate_audio: shot.engine === 'ltx-2.3', width: portrait ? 1024 : 1536, height: portrait ? 1536 : 1024, frames: Math.min(481, Math.max(49, Math.round(shot.duration * 24) + 1)), num_frames: Math.min(481, Math.max(49, Math.round(shot.duration * 24) + 1)), fps: 24, seed: shot.seed, image_url: character?.reference_url, image_frame: character?.reference_url ? 0 : undefined, image_strength: character?.reference_url ? 0.9 : undefined, ref_image: shot.engine === 'opensora' ? character?.reference_url : undefined, config: 'configs/diffusion/inference/768px.py', steps: 40, ratio: projectRef.current.data.aspect_ratio, motion_score: 6, nproc_per_node: 1, project_id: projectRef.current.id, shot_id: shot.id }
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
      <button onClick={createSample} disabled={saving} className="w-full mt-2 py-2.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Sparkles size={14} />载入2分钟样例</button>
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
