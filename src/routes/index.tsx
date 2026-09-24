import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Box,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Clock3,
  Download,
  FilePlus2,
  FolderOpen,
  Gauge,
  HardDriveDownload,
  LampDesk,
  LayoutDashboard,
  Menu,
  MousePointer2,
  Play,
  Plus,
  Save,
  Tags,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  collectTags,
  EMPTY_RUNTIME,
  type HmiWidget,
  type HmiWidgetType,
  type Instruction,
  type InstructionType,
  normalizeTag,
  type Rung,
  type Runtime,
  scanProject,
  type SimulatorProject,
  validTag,
} from "@/lib/plc";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RB SIMULADOR — Prática de CLP e Ladder" },
      { name: "description", content: "Simulador didático para montar, executar e monitorar lógica Ladder de CLP." },
      { property: "og:title", content: "RB SIMULADOR — Prática de CLP e Ladder" },
      { property: "og:description", content: "Monte lógicas Ladder, simule um CLP e crie telas IHM para praticar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Simulator,
});

type Pane = "ladder" | "hmi" | "monitor";
type Tool = InstructionType | "delete" | null;

const SCAN_MS = 100;
const makeId = () => Math.random().toString(36).slice(2, 9);
const blankProject = (): SimulatorProject => ({ name: "Meu projeto", rungs: [], widgets: [] });

const instructionLabel: Record<InstructionType, string> = {
  "contact-no": "Contato NA",
  "contact-nc": "Contato NF",
  coil: "Bobina",
  ton: "TON",
  tof: "TOF",
};

function Simulator() {
  const [project, setProject] = useState<SimulatorProject>(() => blankProject());
  const [runtime, setRuntime] = useState<Runtime>(EMPTY_RUNTIME);
  const [running, setRunning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [pane, setPane] = useState<Pane>("ladder");
  const [tool, setTool] = useState<Tool>(null);
  const [selectedInstruction, setSelectedInstruction] = useState<string | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("Projeto pronto para edição");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRuntime((previous) => scanProject(project, previous, SCAN_MS, Date.now()));
      setScanCount((count) => count + 1);
    }, SCAN_MS);
    return () => window.clearInterval(id);
  }, [project, running]);

  useEffect(() => {
    const saved = window.localStorage.getItem("rb-simulador-project");
    if (!saved) return;
    try {
      setProject(JSON.parse(saved) as SimulatorProject);
      setNotice("Último projeto recuperado");
    } catch {
      setNotice("O projeto salvo não pôde ser recuperado");
    }
  }, []);

  const selected = useMemo(() => {
    for (const rung of project.rungs) {
      const instruction = rung.instructions.find((item) => item.id === selectedInstruction);
      if (instruction) return instruction;
    }
    return null;
  }, [project, selectedInstruction]);

  const selectedHmi = project.widgets.find((widget) => widget.id === selectedWidget) ?? null;
  const tags = useMemo(() => collectTags(project, runtime), [project, runtime]);

  const updateInstruction = (patch: Partial<Instruction>) => {
    if (!selectedInstruction) return;
    setProject((current) => ({
      ...current,
      rungs: current.rungs.map((rung) => ({
        ...rung,
        instructions: rung.instructions.map((item) => item.id === selectedInstruction ? { ...item, ...patch } : item),
      })),
    }));
  };

  const addRung = () => {
    const rung: Rung = { id: makeId(), title: `Rede ${project.rungs.length + 1}`, instructions: [] };
    setProject((current) => ({ ...current, rungs: [...current.rungs, rung] }));
    setNotice("Nova rede adicionada");
  };

  const addInstruction = (rungId: string) => {
    if (!tool || tool === "delete") return;
    const timer = tool === "ton" || tool === "tof";
    const instruction: Instruction = {
      id: makeId(),
      type: tool,
      tag: timer ? `T${tags.filter((tag) => tag.startsWith("T")).length + 1}` : `${tool === "coil" ? "Q" : "I"}0.0`,
      preset: timer ? 2000 : undefined,
      comment: "",
    };
    setProject((current) => ({
      ...current,
      rungs: current.rungs.map((rung) => rung.id === rungId ? { ...rung, instructions: [...rung.instructions, instruction] } : rung),
    }));
    setSelectedInstruction(instruction.id);
    setNotice(`${instructionLabel[tool]} inserido`);
  };

  const removeInstruction = (rungId: string, id: string) => {
    setProject((current) => ({
      ...current,
      rungs: current.rungs.map((rung) => rung.id === rungId ? { ...rung, instructions: rung.instructions.filter((item) => item.id !== id) } : rung),
    }));
    setSelectedInstruction(null);
  };

  const save = () => {
    window.localStorage.setItem("rb-simulador-project", JSON.stringify(project));
    setNotice("Projeto salvo neste navegador");
  };

  const load = () => {
    const saved = window.localStorage.getItem("rb-simulador-project");
    if (!saved) return setNotice("Nenhum projeto salvo neste navegador");
    try {
      setProject(JSON.parse(saved) as SimulatorProject);
      setRuntime(EMPTY_RUNTIME);
      setNotice("Projeto carregado");
    } catch {
      setNotice("Arquivo salvo inválido");
    }
  };

  const exportProject = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "rb-projeto"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Projeto exportado");
  };

  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as SimulatorProject;
      if (!Array.isArray(parsed.rungs) || !Array.isArray(parsed.widgets)) throw new Error("invalid");
      setProject(parsed);
      setRuntime(EMPTY_RUNTIME);
      setNotice("Projeto importado com sucesso");
    } catch {
      setNotice("Selecione um projeto JSON válido");
    }
  };

  const newProject = () => {
    if ((project.rungs.length || project.widgets.length) && !window.confirm("Criar um projeto novo e limpar a área atual?")) return;
    setRunning(false);
    setProject(blankProject());
    setRuntime(EMPTY_RUNTIME);
    setScanCount(0);
    setNotice("Novo projeto criado");
  };

  const setBit = (tag: string, value: boolean) => {
    setRuntime((current) => ({ ...current, bits: { ...current.bits, [tag]: value } }));
  };

  const addWidget = (type: HmiWidgetType) => {
    const widget: HmiWidget = {
      id: makeId(), type, x: 40 + project.widgets.length * 18, y: 48 + project.widgets.length * 18,
      tag: type === "lamp" || type === "value" ? "Q0.0" : type.startsWith("button") ? "I0.0" : "",
      label: type === "lamp" ? "Motor" : type === "button-on" ? "LIGA" : type === "button-off" ? "DESLIGA" : type === "value" ? "Valor" : "Texto",
    };
    setProject((current) => ({ ...current, widgets: [...current.widgets, widget] }));
    setSelectedWidget(widget.id);
  };

  return (
    <div className="sim-shell">
      <header className="titlebar">
        <div className="flex min-w-0 items-center gap-2">
          <Button className="lg:hidden" variant="ghost" size="icon" aria-label="Abrir ferramentas" onClick={() => setSidebarOpen(true)}><Menu size={16} /></Button>
          <div className="brand-mark"><Zap size={14} /></div>
          <strong>RB SIMULADOR</strong>
          <span className="hidden text-title-muted sm:inline">/ Ambiente de prática CLP</span>
        </div>
        <label className="project-name">
          <span className="hidden md:inline">Projeto</span>
          <input value={project.name} onChange={(event) => setProject((current) => ({ ...current, name: event.target.value }))} aria-label="Nome do projeto" />
        </label>
      </header>

      <div className="toolbar" aria-label="Comandos do projeto">
        <Button variant="run" disabled={running} onClick={() => { setRunning(true); setNotice("CLP em modo RUN"); }}><Play size={14} fill="currentColor" /> Executar</Button>
        <Button variant="stop" disabled={!running} onClick={() => { setRunning(false); setNotice("CLP em modo STOP"); }}><CircleStop size={14} /> Parar</Button>
        <span className="toolbar-separator" />
        <Button onClick={newProject}><FilePlus2 size={14} /> <span className="hidden sm:inline">Novo</span></Button>
        <Button onClick={save}><Save size={14} /> <span className="hidden sm:inline">Salvar</span></Button>
        <Button onClick={load}><FolderOpen size={14} /> <span className="hidden sm:inline">Carregar</span></Button>
        <Button onClick={exportProject} aria-label="Exportar projeto"><Download size={14} /><span className="hidden xl:inline">Exportar</span></Button>
        <Button onClick={() => fileInput.current?.click()} aria-label="Importar projeto"><Upload size={14} /><span className="hidden xl:inline">Importar</span></Button>
        <input ref={fileInput} type="file" accept="application/json" className="hidden" onChange={(event) => void importProject(event.target.files?.[0])} />
        <div className="ml-auto flex items-center gap-2 px-1 text-xs font-semibold">
          <span className={`status-led ${running ? "is-running" : ""}`} />
          <span>{running ? "RUN" : "STOP"}</span>
        </div>
      </div>

      <main className="workbench">
        <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
          <div className="sidebar-mobile-head"><strong>Ferramentas</strong><Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}><X size={16} /></Button></div>
          <SidebarSection title="Navegação">
            <NavItem active={pane === "ladder"} icon={<LayoutDashboard size={15} />} label="Programação Ladder" onClick={() => { setPane("ladder"); setSidebarOpen(false); }} />
            <NavItem active={pane === "hmi"} icon={<LampDesk size={15} />} label="Tela IHM" onClick={() => { setPane("hmi"); setSidebarOpen(false); }} />
            <NavItem active={pane === "monitor"} icon={<Activity size={15} />} label="Tabela de observação" onClick={() => { setPane("monitor"); setSidebarOpen(false); }} />
          </SidebarSection>
          <SidebarSection title="Instruções básicas">
            <ToolItem label="Contato normalmente aberto" code="—| |—" active={tool === "contact-no"} onClick={() => setTool("contact-no")} />
            <ToolItem label="Contato normalmente fechado" code="—|/|—" active={tool === "contact-nc"} onClick={() => setTool("contact-nc")} />
            <ToolItem label="Bobina de saída" code="—( )—" active={tool === "coil"} onClick={() => setTool("coil")} />
            <ToolItem label="Temporizador na energização" code="TON" active={tool === "ton"} onClick={() => setTool("ton")} />
            <ToolItem label="Temporizador no desligamento" code="TOF" active={tool === "tof"} onClick={() => setTool("tof")} />
            <ToolItem label="Excluir elemento" code="DEL" active={tool === "delete"} onClick={() => setTool("delete")} danger />
          </SidebarSection>
          <SidebarSection title="Elementos IHM">
            <NavItem icon={<LampDesk size={15} />} label="Lâmpada" onClick={() => { addWidget("lamp"); setPane("hmi"); }} />
            <NavItem icon={<MousePointer2 size={15} />} label="Botão Liga" onClick={() => { addWidget("button-on"); setPane("hmi"); }} />
            <NavItem icon={<MousePointer2 size={15} />} label="Botão Desliga" onClick={() => { addWidget("button-off"); setPane("hmi"); }} />
            <NavItem icon={<Tags size={15} />} label="Indicador de valor" onClick={() => { addWidget("value"); setPane("hmi"); }} />
          </SidebarSection>
          <div className="address-help"><strong>Endereçamento</strong><span><code>I0.0</code> Entrada</span><span><code>Q0.0</code> Saída</span><span><code>M0.0</code> Memória</span><span><code>T1</code> Temporizador</span></div>
        </aside>
        {sidebarOpen && <button className="sidebar-backdrop" aria-label="Fechar ferramentas" onClick={() => setSidebarOpen(false)} />}

        <section className="editor-column">
          <div className="tabs">
            <Tab active={pane === "ladder"} onClick={() => setPane("ladder")}>Main [OB1]</Tab>
            <Tab active={pane === "hmi"} onClick={() => setPane("hmi")}>IHM_1</Tab>
            <Tab active={pane === "monitor"} onClick={() => setPane("monitor")}>Observação</Tab>
          </div>

          {pane === "ladder" && (
            <div className="ladder-workspace">
              <div className="workspace-head">
                <div><strong>Bloco de organização: Main</strong><span> Linguagem: LAD</span></div>
                <Button size="sm" onClick={addRung}><Plus size={13} /> Nova rede</Button>
              </div>
              <div className="rung-list">
                {project.rungs.length === 0 ? <EmptyLadder onAdd={addRung} /> : project.rungs.map((rung, index) => (
                  <RungView key={rung.id} rung={rung} index={index} runtime={runtime} running={running} tool={tool} selectedId={selectedInstruction}
                    onAdd={() => addInstruction(rung.id)} onSelect={(id) => tool === "delete" ? removeInstruction(rung.id, id) : setSelectedInstruction(id)}
                    onDelete={() => setProject((current) => ({ ...current, rungs: current.rungs.filter((item) => item.id !== rung.id) }))} />
                ))}
              </div>
            </div>
          )}

          {pane === "hmi" && <HmiCanvas project={project} runtime={runtime} selectedId={selectedWidget} setSelectedId={setSelectedWidget} setBit={setBit} setProject={setProject} />}
          {pane === "monitor" && <Monitor tags={tags} runtime={runtime} running={running} setBit={setBit} />}
        </section>

        <aside className="inspector">
          <div className="inspector-title"><Box size={14} /> Propriedades</div>
          {pane === "ladder" && selected ? (
            <InstructionInspector instruction={selected} update={updateInstruction} remove={() => {
              setProject((current) => ({ ...current, rungs: current.rungs.map((rung) => ({ ...rung, instructions: rung.instructions.filter((item) => item.id !== selected.id) })) }));
              setSelectedInstruction(null);
            }} />
          ) : pane === "hmi" && selectedHmi ? (
            <WidgetInspector widget={selectedHmi} update={(patch) => setProject((current) => ({ ...current, widgets: current.widgets.map((widget) => widget.id === selectedHmi.id ? { ...widget, ...patch } : widget) }))}
              remove={() => { setProject((current) => ({ ...current, widgets: current.widgets.filter((widget) => widget.id !== selectedHmi.id) })); setSelectedWidget(null); }} />
          ) : (
            <div className="inspector-empty"><MousePointer2 size={25} /><p>Selecione um elemento para editar suas propriedades.</p></div>
          )}
        </aside>
      </main>

      <footer className="statusbar">
        <span><span className={`status-led ${running ? "is-running" : ""}`} /> CLP {running ? "conectado" : "desconectado"}</span>
        <span><Gauge size={12} /> Ciclos: {scanCount.toLocaleString("pt-BR")}</span>
        <span><Clock3 size={12} /> Varredura: {SCAN_MS} ms</span>
        <span className="status-message">{notice}</span>
      </footer>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return <div className="sidebar-section"><button className="section-title" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{title}</button>{open && <div>{children}</div>}</div>;
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function ToolItem({ label, code, active, danger, onClick }: { label: string; code: string; active: boolean; danger?: boolean; onClick: () => void }) {
  return <button title={label} className={`tool-item ${active ? "active" : ""} ${danger ? "danger" : ""}`} onClick={onClick}><code>{code}</code><span>{label}</span></button>;
}

function Tab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={`tab ${active ? "active" : ""}`} onClick={onClick}>{children}</button>;
}

function EmptyLadder({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><LayoutDashboard size={26} /></div><h2>Nenhuma rede criada</h2><p>Adicione uma rede, escolha uma instrução à esquerda e clique no ponto de inserção.</p><Button onClick={onAdd}><Plus size={14} /> Criar primeira rede</Button></div>;
}

function RungView({ rung, index, runtime, running, tool, selectedId, onAdd, onSelect, onDelete }: {
  rung: Rung; index: number; runtime: Runtime; running: boolean; tool: Tool; selectedId: string | null; onAdd: () => void; onSelect: (id: string) => void; onDelete: () => void;
}) {
  return <article className="rung-card">
    <header><span>Rede {index + 1}</span><span>{rung.title}</span><Button variant="ghost" size="icon" aria-label={`Excluir rede ${index + 1}`} onClick={onDelete}><Trash2 size={13} /></Button></header>
    <div className="rung-canvas">
      <div className={`power-rail ${running ? "energized" : ""}`} />
      <div className="rung-wire-track">
        {rung.instructions.map((instruction) => <InstructionView key={instruction.id} instruction={instruction} energized={running && runtime.powered[instruction.id]} selected={selectedId === instruction.id} onClick={() => onSelect(instruction.id)} />)}
        <button className={`insert-node ${tool && tool !== "delete" ? "ready" : ""}`} onClick={onAdd} title="Inserir instrução"><Plus size={15} /></button>
      </div>
      <div className="power-rail right" />
    </div>
  </article>;
}

function InstructionView({ instruction, energized, selected, onClick }: { instruction: Instruction; energized?: boolean; selected: boolean; onClick: () => void }) {
  const timer = instruction.type === "ton" || instruction.type === "tof";
  return <div className={`instruction-wrap ${energized ? "energized" : ""}`}>
    <span className="wire" />
    <button className={`instruction ${selected ? "selected" : ""}`} onClick={onClick}>
      <span className="instruction-tag">{instruction.tag}</span>
      {instruction.type === "contact-no" && <strong>—| |—</strong>}
      {instruction.type === "contact-nc" && <strong>—|/|—</strong>}
      {instruction.type === "coil" && <strong>—( )—</strong>}
      {timer && <span className="timer-block"><b>{instruction.type.toUpperCase()}</b><small>PT {instruction.preset} ms</small></span>}
      {instruction.comment && <small className="instruction-comment">{instruction.comment}</small>}
    </button>
  </div>;
}

function InstructionInspector({ instruction, update, remove }: { instruction: Instruction; update: (patch: Partial<Instruction>) => void; remove: () => void }) {
  const timer = instruction.type === "ton" || instruction.type === "tof";
  const okay = validTag(instruction.tag, timer);
  return <div className="property-form"><div className="property-type">{instructionLabel[instruction.type]}</div><label>Endereço / tag<input value={instruction.tag} onChange={(event) => update({ tag: normalizeTag(event.target.value) })} /></label>{!okay && <p className="field-error">Use {timer ? "T1" : "I0.0, Q0.0 ou M0.0"}.</p>}{timer && <label>Tempo programado (ms)<input type="number" min="100" step="100" value={instruction.preset ?? 2000} onChange={(event) => update({ preset: Math.max(100, Number(event.target.value)) })} /></label>}<label>Comentário<input value={instruction.comment ?? ""} placeholder="Ex.: Botão de partida" onChange={(event) => update({ comment: event.target.value })} /></label><Button variant="danger" onClick={remove}><Trash2 size={13} /> Excluir instrução</Button></div>;
}

function Monitor({ tags, runtime, running, setBit }: { tags: string[]; runtime: Runtime; running: boolean; setBit: (tag: string, value: boolean) => void }) {
  return <div className="monitor-pane"><div className="workspace-head"><div><strong>Tabela de observação</strong><span> Valores online do CLP</span></div><span className="online-label"><span className={`status-led ${running ? "is-running" : ""}`} />{running ? "Online" : "Offline"}</span></div><div className="table-scroll"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Valor</th><th>Controle</th></tr></thead><tbody>{tags.length === 0 ? <tr><td colSpan={4} className="empty-row">As tags aparecerão quando forem usadas no programa.</td></tr> : tags.map((tag) => { const timer = runtime.timers[tag]; const value = timer?.done ?? runtime.bits[tag] ?? false; const canControl = /^[IM]/.test(tag); return <tr key={tag}><td><code>{tag}</code></td><td>{tag.startsWith("I") ? "Entrada" : tag.startsWith("Q") ? "Saída" : tag.startsWith("M") ? "Memória" : "Temporizador"}</td><td><span className={`bit-value ${value ? "on" : ""}`}>{value ? "TRUE" : "FALSE"}</span>{timer && <small className="timer-value">{timer.elapsed} / {timer.preset} ms</small>}</td><td>{canControl ? <button className={`switch ${value ? "on" : ""}`} role="switch" aria-checked={value} aria-label={`Alterar ${tag}`} onClick={() => setBit(tag, !value)}><span /></button> : <span className="read-only">Somente leitura</span>}</td></tr>; })}</tbody></table></div></div>;
}

function HmiCanvas({ project, runtime, selectedId, setSelectedId, setBit, setProject }: { project: SimulatorProject; runtime: Runtime; selectedId: string | null; setSelectedId: (id: string | null) => void; setBit: (tag: string, value: boolean) => void; setProject: React.Dispatch<React.SetStateAction<SimulatorProject>> }) {
  const startDrag = (event: React.PointerEvent, widget: HmiWidget) => {
    const originX = event.clientX; const originY = event.clientY; const initialX = widget.x; const initialY = widget.y;
    const move = (moveEvent: PointerEvent) => setProject((current) => ({ ...current, widgets: current.widgets.map((item) => item.id === widget.id ? { ...item, x: Math.max(8, initialX + moveEvent.clientX - originX), y: Math.max(8, initialY + moveEvent.clientY - originY) } : item) }));
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
  };
  return <div className="hmi-pane" onClick={() => setSelectedId(null)}>{project.widgets.length === 0 && <div className="empty-state"><div className="empty-icon"><LampDesk size={25} /></div><h2>Tela IHM vazia</h2><p>Adicione lâmpadas, botões e indicadores pelo painel lateral.</p></div>}{project.widgets.map((widget) => { const value = runtime.timers[widget.tag]?.done ?? runtime.bits[widget.tag] ?? false; return <div key={widget.id} style={{ left: widget.x, top: widget.y }} className={`hmi-widget ${selectedId === widget.id ? "selected" : ""}`} onPointerDown={(event) => { event.stopPropagation(); setSelectedId(widget.id); startDrag(event, widget); }}>
    {widget.type === "lamp" && <div className="hmi-lamp-wrap"><span className={`hmi-lamp ${value ? "on" : ""}`} /><b>{widget.label}</b><small>{widget.tag}</small></div>}
    {widget.type === "button-on" && <button className="hmi-button on" onPointerDown={(event) => { event.stopPropagation(); setBit(widget.tag, true); }} onPointerUp={() => setBit(widget.tag, false)}>{widget.label}</button>}
    {widget.type === "button-off" && <button className="hmi-button off" onClick={(event) => { event.stopPropagation(); setBit(widget.tag, false); }}>{widget.label}</button>}
    {widget.type === "value" && <div className="hmi-value"><small>{widget.label}</small><strong>{value ? "1" : "0"}</strong><code>{widget.tag}</code></div>}
    {widget.type === "text" && <strong>{widget.label}</strong>}
  </div>; })}</div>;
}

function WidgetInspector({ widget, update, remove }: { widget: HmiWidget; update: (patch: Partial<HmiWidget>) => void; remove: () => void }) {
  return <div className="property-form"><div className="property-type">Objeto IHM</div><label>Rótulo<input value={widget.label} onChange={(event) => update({ label: event.target.value })} /></label>{widget.type !== "text" && <label>Tag vinculada<input value={widget.tag} onChange={(event) => update({ tag: normalizeTag(event.target.value) })} /></label>}<div className="coordinate-row"><label>X<input type="number" value={Math.round(widget.x)} onChange={(event) => update({ x: Number(event.target.value) })} /></label><label>Y<input type="number" value={Math.round(widget.y)} onChange={(event) => update({ y: Number(event.target.value) })} /></label></div><Button variant="danger" onClick={remove}><Trash2 size={13} /> Excluir objeto</Button></div>;
}