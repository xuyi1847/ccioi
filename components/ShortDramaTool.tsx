import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Clapperboard, Download, Film, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2, Users, WandSparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useSocket } from '../context/SocketContext';
import { mockBackend } from '../services/mockBackend';
import { uploadToOSS } from '../services/ossService';

type Engine = 'ltx-2.3' | 'opensora';
interface Character { id: string; name: string; description: string; reference_url?: string; voice_id?: string; }
interface Shot { id: string; title: string; scene: string; shot_size: string; camera: string; duration: number; prompt: string; dialogue: string; character_ids: string[]; engine: Engine; status: 'draft' | 'queued' | 'generating' | 'done' | 'failed'; output_url?: string; ending_frame_url?: string; continuity_from_previous?: boolean; seed: number; }
interface ProjectData { synopsis: string; style: string; aspect_ratio: string; characters: Character[]; script: string; shots: Shot[]; audio_assets: any[]; export_url?: string; }
interface Project { id?: string; name: string; data: ProjectData; updated_at?: string; }

const uid = () => crypto.randomUUID();
const emptyData = (): ProjectData => ({ synopsis: '', style: '电影感写实', aspect_ratio: '9:16', characters: [], script: '', shots: [], audio_assets: [] });
const sampleProject = (): Project => {
  const su = uid();
  const he = uid();
  const specs: Array<[string, string, string, string, string, string[], boolean]> = [
    ['冰下两万米', '欧罗巴冰层下的黑色海洋', '极远景，缓慢下降', '苏弥旁白：这里没有日出，只有木星替我们计时。', 'Single continuous cinematic shot. Beneath Europa ice, the same small research submersible Nereid descends into a cathedral-scale black ocean. Matte ivory pressure hull, circular amber viewport, two short side lights. A pale blue ice ceiling recedes far above. Volumetric particles, restrained contrast, physically plausible underwater motion, 35mm anamorphic, no text.', [], false],
    ['静默航行', '涅瑞伊得号驾驶舱', '双人侧面中景，微弱推轨', '贺川：氧气还剩四十七分钟。', 'Interior of the same compact submersible. Su Mi sits left at the science console and He Chuan sits right at the controls. One circular forward viewport, charcoal panels, dim amber practical lights. Camera makes one slow lateral move; both remain almost still as drifting particles pass outside. Premium minimal hard science fiction, natural skin, no holographic clutter.', [su, he], false],
    ['海底脉冲', '驾驶舱前窗', '越肩镜头，焦点从仪表移向窗外', '苏弥：关掉声呐。听。', 'Direct continuation. Over Su Mi’s shoulder, the amber sonar trace stops. Beyond the same circular viewport, three faint cyan lights pulse once in the darkness, evenly spaced like a deliberate reply. Hold the composition and let silence create tension; only one action, no camera shake.', [su, he], true],
    ['第一次回应', '驾驶舱前窗', '静止近景，玻璃反射人物眼睛', '贺川：那不是地质活动。', 'Continue from the supplied frame. The three distant cyan lights pulse again, now matching the submersible warning lamp rhythm. Su Mi’s eyes are reflected sharply in the curved glass while the ocean remains deep black. Controlled cyan and amber palette, subtle lens breathing, quiet awe.', [su, he], true],
    ['向深渊转向', '冰下峡谷入口', '外景广角，平稳跟随', '苏弥：它在邀请我们。', 'Clean scene transition to exterior. Nereid turns once and enters a vast vertical ice canyon. Its ivory hull and amber viewport remain identical. The three cyan lights drift deeper ahead like distant lanterns; scale is monumental, motion slow and believable, no creatures yet.', [], false],
    ['燃料警告', '驾驶舱控制台', '手部特写，缓慢上摇到人物', '贺川：进去以后，我们回不来。', 'Inside the unchanged cockpit. A single mechanical fuel gauge enters the red zone beneath He Chuan’s gloved hand. Camera slowly tilts to his restrained face; Su Mi remains soft in the background. One readable visual idea, realistic practical interface, no floating UI, no text overlays.', [su, he], false],
    ['父亲的录音', '驾驶舱微光中', '苏弥正面近景，固定镜头', '录音：别把未知，当成需要消灭的东西。', 'Direct continuation. Su Mi presses a worn silver voice recorder hanging at her chest. She listens without speaking; a tiny warm indicator reflects beneath her left eye. Locked intimate close-up, shallow depth of field, quiet grief, no flashback and no extra action.', [su], true],
    ['继续下潜', '冰下峡谷深处', '外景俯拍，船体穿过光带', '苏弥：继续。', 'Exterior transition. From high above, Nereid descends through one thin curtain of cyan bioluminescent particles. The lights flow around but never touch the hull. Slow geometric composition, deep negative space, ivory craft as a small solitary shape.', [], false],
    ['看见它', '巨大冰穴', '超广角，几乎静止', '贺川：我的天……', 'Nereid emerges into an immense spherical ice cavern. At its center floats one elegant translucent lifeform shaped like a kilometer-wide Möbius ribbon, made of soft cyan light and fine branching veins. It moves extremely slowly, neither monster nor jellyfish. The submersible is tiny at lower left for scale, museum-grade concept art realism.', [], true],
    ['镜像', '驾驶舱与生物同框', '人物背影双人镜头', '苏弥：它不是一只。是整片海。', 'Interior, both characters seen from behind in exact seats, framed by the circular viewport. Outside, the luminous ribbon folds once and creates two human-like silhouettes only as abstract negative space, never literal faces. Su Mi realizes the ocean is one distributed organism. Elegant, restrained, no spectacle overload.', [su, he], false],
    ['污染协议', '驾驶舱红色警报状态', '控制台特写转向贺川', '系统：样本污染。执行热净化。', 'Direct continuation. One physical red quarantine lamp turns on and the cockpit amber light shifts to muted red. He Chuan looks toward a guarded ignition switch without touching it. Slow rack focus only; preserve cockpit layout and screen direction.', [he], true],
    ['命令', '驾驶舱红光中', '双人中近景，稳定构图', '贺川：轨道站会烧掉这片海。　苏弥：除非我们不回去。', 'Continue in the same red-lit cockpit. He Chuan and Su Mi face each other across the narrow aisle, both controlled rather than melodramatic. He states the consequence; she answers after a beat. Symmetrical composition, natural micro-expressions, no gestures beyond eye movement.', [su, he], true],
    ['烧毁天线', '涅瑞伊得号外景', '近距离侧跟，单一爆点', '贺川：做了就没有返航信标。', 'Exterior transition. Nereid fires one precise maintenance laser at its own dorsal communication antenna. The antenna separates in a brief shower of orange sparks, drifting into black water. The cyan organism remains distant and calm. No explosion, no debris storm, premium restrained VFX.', [], false],
    ['共同决定', '驾驶舱', '两人手部特写', '苏弥：我知道。　贺川：那就一起迷路。', 'Inside the cockpit after the antenna is gone. Su Mi places her hand beside He Chuan’s on the central throttle, not over it. He moves the throttle forward once. Tight composition on hands, their faces reflected faintly in metal, warm amber returns against fading red.', [su, he], false],
    ['最后的氧气', '冰穴边缘', '外景长焦，缓慢横移', '系统：氧气剩余十二分钟。', 'Nereid glides along the luminous organism’s outer edge. Its cyan branching veins respond in a gentle traveling wave beside the craft, never changing form. Long-lens parallax, serene motion, ivory hull consistent, no sudden creature attack.', [], true],
    ['礼物', '驾驶舱前窗', '苏弥近景转焦到窗外', '苏弥：它听懂了。', 'Direct continuation inside. A single seed-sized cyan light passes through the hull without damage and rests above Su Mi’s open palm like a weightless star. Camera racks focus once from her calm face to the light. He Chuan watches from his fixed right seat, minimal wonder.', [su, he], false],
    ['海洋点亮', '欧罗巴全球冰下海', '宏大远景，极慢拉远', '', 'Exterior transition. The small cyan seed pulses once inside Nereid; in response, branching light spreads through the entire black ocean beneath the ice like a planetary neural network. Nereid remains a tiny ivory silhouette. One majestic transformation, scientifically textured ice, sophisticated cyan-on-black image, no fantasy particles.', [], false],
    ['失去动力', '驾驶舱暗场', '固定双人剪影', '贺川：电池结束了。　苏弥：不，是它开始了。', 'Inside, all cockpit lights shut off except the cyan seed and the vast living ocean outside. Su Mi and He Chuan become quiet silhouettes in their same seats. No panic, no movement; dialogue plays over a six-second contemplative hold.', [su, he], false],
    ['被海托起', '发光洋流中', '外景低角度仰拍', '', 'Direct exterior continuation. A broad, slow current of cyan light gathers beneath the powerless Nereid and gently lifts it upward toward the ice ceiling. The craft stays level; no engines fire. Sacred but physically grounded, monumental negative space, slow cinema.', [], false],
    ['新的日出', '欧罗巴冰面之下', '从船后拉远至木星轮廓', '苏弥旁白：后来，我们把第一次日出，留在了海里。', 'Final shot. Nereid comes to rest just beneath translucent Europa ice. Warm reflected light from Jupiter filters through above while the living cyan ocean glows below, creating the first dawn-like horizon. Camera slowly pulls away behind the unchanged craft; two tiny human silhouettes share the amber viewport. Poetic hard science fiction ending, no text, no logo.', [su, he], true],
  ];
  return {
    name: 'LTX 高级科幻样片·冰下日出',
    data: {
      synopsis: '欧罗巴冰下科考的最后四十七分钟，生物学家苏弥与驾驶员贺川发现整片海洋都是一个生命。为了阻止轨道站执行灭菌，他们烧毁返航天线、主动失联，却被刚刚苏醒的海洋托向一场从未存在过的日出。',
      style: '高预算作者型硬科幻，克制表演与慢电影节奏，35mm变形宽银幕；象牙白潜航器、琥珀舱灯、青色生命光三色系统；真实水体、深黑留白、统一舱内空间与光线轴，不使用廉价全息界面和过量粒子',
      aspect_ratio: '16:9',
      audio_assets: [],
      characters: [
        { id: su, name: '苏弥', description: '34岁中国女性冰下生物学家，清瘦椭圆脸，黑色齐下颌短发，左眼下浅痣；始终穿炭灰色无帽连体科考服，窄琥珀色领边，胸前挂磨损银色录音器；冷静、极少夸张表情', voice_id: '' },
        { id: he, name: '贺川', description: '39岁中国男性潜航驾驶员，短黑发夹少量灰，窄长脸，下巴短胡茬；始终穿深海军蓝无帽连体驾驶服，右肩象牙白圆形徽章，黑色薄手套；沉稳克制、动作精确', voice_id: '' },
      ],
      script: '短片《冰下日出》（2分钟）\n\n【发现】欧罗巴冰下两万米，科考潜航器“涅瑞伊得”只剩四十七分钟氧气。苏弥要求关闭声呐，在绝对静默中，黑海以三次脉冲回应了他们。\n\n【深入】两人追随光脉进入冰下峡谷，看见一条横跨冰穴的发光莫比乌斯生命。它不是单个生物，而是整片海洋第一次睁开眼睛。\n\n【选择】污染协议自动启动：轨道站将在潜航器返回后焚烧整个海区。苏弥提出唯一办法——主动失联。贺川烧毁天线，两人放弃返航信标。\n\n【回应】电池和氧气即将耗尽时，生命把一粒光送到苏弥掌心。光脉点亮整颗星球的冰下海，并形成洋流托起失去动力的潜航器。\n\n【结尾】潜航器停在半透明冰层下，木星暖光从上方渗入，生命青光从下方升起。两个决定留下的人，看见了欧罗巴历史上的第一次日出。',
      shots: specs.map(([title, scene, camera, dialogue, prompt, character_ids, continuity_from_previous], index) => ({ id: uid(), title, scene, shot_size: index % 4 === 0 ? '全景' : '中近景', camera, duration: 6, engine: 'ltx-2.3', status: 'draft', seed: 7301 + index, character_ids, dialogue, prompt, continuity_from_previous })),
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
        notify.success('已创建 2 分钟 LTX 高级科幻样片');
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
      notify.success('已载入 2 分钟 LTX 高级科幻样片');
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
    const shotIndex = projectRef.current.data.shots.findIndex((item) => item.id === shot.id);
    const previousShot = shotIndex > 0 ? projectRef.current.data.shots[shotIndex - 1] : undefined;
    const mayChainPreviousFrame = shot.continuity_from_previous !== false;
    const continuityImage = (mayChainPreviousFrame && previousShot?.ending_frame_url) || character?.reference_url;
    const usesPreviousFrame = Boolean(mayChainPreviousFrame && previousShot?.ending_frame_url);
    const generationPrompt = [
      shot.prompt,
      usesPreviousFrame ? 'Begin from the supplied final frame of the immediately preceding shot. Preserve the exact pose, screen direction, camera axis, lighting, costumes, props and environment, then continue the action naturally without a visual reset.' : '',
      shotCharacters.length ? `Character continuity: ${shotCharacters.map((item) => `${item.name}: ${item.description}`).join('；')}. Keep their face, hairstyle and costume identical to adjacent shots.` : '',
      shot.dialogue ? `Synchronized native audio. The characters speak natural Mandarin Chinese with accurate lip movement and restrained cinematic acting. Exact dialogue in this shot: “${shot.dialogue}”. Preserve the speaker order. Do not render subtitles or on-screen text.` : 'Synchronized native environmental audio, no spoken dialogue and no subtitles.',
    ].filter(Boolean).join(' ');
    const portrait = projectRef.current.data.aspect_ratio === '9:16';
    setActiveShotId(shot.id); patchShot(shot.id, { status: 'generating' });
    sendCommand({ type: 'TASK_EXECUTION', task: 'VIDEO_GENERATION', token: user.token, model: shot.engine,
      parameters: { model: shot.engine, prompt: generationPrompt, dialogue: shot.dialogue, generate_audio: shot.engine === 'ltx-2.3', width: portrait ? 1024 : 1536, height: portrait ? 1536 : 1024, frames: Math.min(481, Math.max(49, Math.round(shot.duration * 24) + 1)), num_frames: Math.min(481, Math.max(49, Math.round(shot.duration * 24) + 1)), fps: 24, seed: shot.seed, image_url: continuityImage, image_frame: continuityImage ? 0 : undefined, image_strength: continuityImage ? (usesPreviousFrame ? 0.78 : 0.9) : undefined, ref_image: shot.engine === 'opensora' ? continuityImage : undefined, config: 'configs/diffusion/inference/768px.py', steps: 40, ratio: projectRef.current.data.aspect_ratio, motion_score: 6, nproc_per_node: 1, project_id: projectRef.current.id, shot_id: shot.id }
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
      const finishedShotId = activeShotId;
      const handleFinished = async () => {
        const success = message.status === 'success' && message.output?.public_url;
        let endingFrameUrl: string | undefined;
        if (success && user) {
          try { endingFrameUrl = await mockBackend.extractDramaEndingFrame(user.token, message.output.public_url); }
          catch { notify.warning('镜头已生成，但尾帧提取失败；下一镜将改用角色参考图'); }
        }
        patchShot(finishedShotId, success ? { status: 'done', output_url: message.output.public_url, ending_frame_url: endingFrameUrl } : { status: 'failed' });
        await save(projectRef.current);
        setQueue((current) => {
          const remaining = current.filter((id) => id !== finishedShotId);
          const next = projectRef.current?.data.shots.find((shot) => shot.id === remaining[0]);
          if (next) setTimeout(() => dispatchShot(next), 250); else setActiveShotId('');
          return remaining;
        });
      };
      void handleFinished();
    } catch { /* ignore non-json telemetry */ }
  }, [lastMessage]);

  if (!user) return <div className="h-full flex items-center justify-center text-app-subtext">请先登录</div>;
  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-cyan-400" /></div>;

  return <div className="h-full min-h-0 flex gap-4">
    <aside className="w-56 shrink-0 rounded-2xl border border-app-border bg-app-surface/60 p-3 flex flex-col min-h-0">
      <button onClick={createProject} className="w-full py-2.5 rounded-xl bg-app-accent text-white text-xs font-bold flex items-center justify-center gap-2"><Plus size={14} />新建短剧</button>
      <button onClick={createSample} disabled={saving} className="w-full mt-2 py-2.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Sparkles size={14} />载入高级科幻样片</button>
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
          {tab === 'shots' && <div><div className="flex justify-between mb-4"><div><div className="text-xs text-app-subtext">{project.data.shots.length} 个镜头 · 队列 {queue.length}</div><div className="text-[10px] text-emerald-400 mt-1">连续生成：自动用上一镜尾帧承接下一镜</div></div><button onClick={runBatch} disabled={!!activeShotId} className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-bold disabled:opacity-40">批量生成待处理镜头</button></div><div className="space-y-3">{project.data.shots.map((shot,index)=><div key={shot.id} className="rounded-xl border border-app-border bg-app-base/60 p-3 grid lg:grid-cols-[80px_1fr_150px] gap-3"><div className="text-xs font-bold text-cyan-400">#{index+1}<div className="text-[9px] text-app-subtext mt-1">{shot.duration}s</div><div className="text-[9px] mt-2">{shot.status}</div>{shot.ending_frame_url && <div className="text-[9px] text-emerald-400 mt-2">尾帧已就绪</div>}</div><div><input value={shot.title} onChange={(e)=>patchShot(shot.id,{title:e.target.value})} className="w-full bg-transparent font-bold outline-none"/><textarea value={shot.prompt} onChange={(e)=>patchShot(shot.id,{prompt:e.target.value})} className="mt-2 w-full h-20 bg-app-surface border border-app-border rounded-lg p-2 text-xs"/><input value={shot.dialogue} onChange={(e)=>patchShot(shot.id,{dialogue:e.target.value})} placeholder="对白/字幕" className="mt-2 w-full bg-app-surface border border-app-border rounded-lg p-2 text-xs"/></div><div><select value={shot.engine} onChange={(e)=>patchShot(shot.id,{engine:e.target.value as Engine})} className="w-full bg-app-surface border border-app-border rounded-lg p-2 text-xs"><option value="ltx-2.3">LTX 2.3</option><option value="opensora">OpenSora</option></select>{shot.output_url?<video src={shot.output_url} controls className="mt-2 w-full aspect-video bg-black rounded-lg"/>:<button onClick={()=>dispatchShot(shot)} disabled={!!activeShotId} className="mt-2 w-full py-2 rounded-lg border border-cyan-500/30 text-cyan-400 text-xs">生成镜头</button>}</div></div>)}</div></div>}
          {tab === 'timeline' && <div><div className="rounded-xl border border-app-border bg-black/30 p-4"><div className="text-[10px] text-app-subtext mb-3">VIDEO TRACK</div><div className="flex gap-2 overflow-x-auto pb-3">{project.data.shots.map((shot,index)=><div key={shot.id} className="w-40 shrink-0"><div className="aspect-video bg-black rounded-lg overflow-hidden">{shot.output_url?<video src={shot.output_url} className="w-full h-full object-contain"/>:<div className="h-full flex items-center justify-center text-[10px] text-app-subtext">待生成</div>}</div><div className="text-[10px] mt-1 truncate">#{index+1} {shot.title}</div></div>)}</div><div className="border-t border-app-border pt-3 text-[10px] text-app-subtext">DIALOGUE / TTS TRACK（已保留 voice_id、对白和音频素材结构）</div><div className="mt-2 flex gap-2 overflow-x-auto">{project.data.shots.map((shot)=><div key={shot.id} className="w-40 shrink-0 h-10 rounded bg-emerald-500/10 border border-emerald-500/20 p-2 text-[9px] truncate">{shot.dialogue || '无对白'}</div>)}</div></div><div className="mt-4 flex justify-end"><button onClick={exportFilm} disabled={exporting} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-600 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50">{exporting?<Loader2 size={14} className="animate-spin"/>:<Film size={14}/>}导出 H.264 / AAC 成片</button></div>{project.data.export_url && <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/5 p-4"><video src={project.data.export_url} controls className="w-full max-h-96 bg-black rounded-lg"/><a href={project.data.export_url} download className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-green-400"><Download size={14}/>下载最终成片</a></div>}</div>}
        </div>
      </>}
    </section>
  </div>;
};

export default ShortDramaTool;
