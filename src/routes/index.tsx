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
import { HmiCanvas, WidgetInspector } from "@/components/hmi-editor";
import {
  collectTags,
  nextHmiPosition,
  parseProject,
  projectErrors,
  readableTag,
  writableTag,
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
const blankProject = (): SimulatorProject => ({
  name: "Meu projeto",
  rungs: [{
    id: makeId(),
    title: "Comando de saída",
    instructions: [
      { id: makeId(), type: "contact-no", tag: "I0.0", comment: "Chave de entrada" },
      { id: makeId(), type: "coil", tag: "Q0.0", comment: "Saída digital" },
    ],
  }],
  widgets: [],
});

const instructionLabel: Record<InstructionType, string> = {
  "contact-no": "Contato NA",
  "contact-nc": "Contato NF",
  coil: "Bobina",
  "coil-set": "Bobina SET",
  "coil-reset": "Bobina RESET",
  ton: "TON",
  tof: "TOF",
};

function Simulator() {
  const [project, setProject] = useState<SimulatorProject>(() => blankProject());
  const [runtime, setRuntime] = useState<Runtime>(EMPTY_RUNTIME);
  const [running, setRunning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [pane, setPane] = useState<Pane>("ladder");
  const [hmiTesting, setHmiTesting] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [selectedInstruction, setSelectedInstruction] = useState<string | null>(null);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("Projeto pronto para edição");
  const fileInput = useRef<HTMLInputElement>(null);
  const inspector = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!propertiesOpen || !(pane === "ladder" ? selectedInstruction : pane === "hmi" ? selectedWidget : null)) return;
    const panel = inspector.current;
    const title = panel?.querySelector<HTMLElement>(".inspector-title");
    if (panel && title) panel.scrollTop += title.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  }, [selectedInstruction, selectedWidget, pane, propertiesOpen]);

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
      setProject(parseProject(JSON.parse(saved)));
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
    if (running) return;
    const rung: Rung = { id: makeId(), title: `Rede ${project.rungs.length + 1}`, instructions: [] };
    setProject((current) => ({ ...current, rungs: [...current.rungs, rung] }));
    setNotice("Nova rede adicionada");
  };

  const addInstruction = (rungId: string, position?: number) => {
    if (running || !tool || tool === "delete") return;
    const timer = tool === "ton" || tool === "tof";
    const instruction: Instruction = {
      id: makeId(),
      type: tool,
      tag: timer ? `T${tags.filter((tag) => tag.startsWith("T")).length + 1}` : `${tool.startsWith("coil") ? "Q" : "I"}0.0`,
      comment: "",
      ...(timer ? { preset: 2000 } : {}),
    };
    setProject((current) => ({
      ...current,
      rungs: current.rungs.map((rung) => rung.id === rungId ? { ...rung, instructions: [...rung.instructions.slice(0, position ?? rung.instructions.length), instruction, ...rung.instructions.slice(position ?? rung.instructions.length)] } : rung),
    }));
    setSelectedInstruction(instruction.id); setPropertiesOpen(true);
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
      setRunning(false); setHmiTesting(false);
      setProject(parseProject(JSON.parse(saved)));
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
      const parsed = parseProject(JSON.parse(await file.text()));
      setRunning(false); setHmiTesting(false);
      setProject(parsed);
      setRuntime(EMPTY_RUNTIME);
      setNotice("Projeto importado com sucesso");
    } catch {
      setNotice("Selecione um projeto JSON válido");
    }
  };

  const newProject = () => {
    if ((project.rungs.length || project.widgets.length) && !window.confirm("Criar um projeto novo e limpar a área atual?")) return;
    setRunning(false); setHmiTesting(false);
    setSelectedInstruction(null); setSelectedWidget(null);
    setProject({ name: "Meu projeto", rungs: [], widgets: [] });
    setRuntime(EMPTY_RUNTIME);
    setScanCount(0);
    setNotice("Novo projeto criado");
  };

  const setBit = (tag: string, value: boolean) => {
    if (!writableTag(tag)) return;
    setRuntime((current) => ({ ...current, bits: { ...current.bits, [tag]: value } }));
  };

  const addWidget = (type: HmiWidgetType) => {
    if (hmiTesting) return;
    const position = nextHmiPosition(project.widgets, type);
    if (!position) { setNotice("Tela IHM cheia: mova ou exclua um objeto para liberar espaço"); return; }
    const widget: HmiWidget = {
      id: makeId(), type, ...position,
      tag: type === "text" ? "" : type.startsWith("button") ? "I0.0" : "Q0.0",
      label: type === "motor" ? "Motor elétrico" : type === "display" ? "Display" : type === "gauge" ? "Nível" : type === "chart" ? "Tendência" : type === "lamp" ? "Motor" : type === "button-on" ? "LIGA" : type === "button-off" ? "DESLIGA" : type === "button-toggle" ? "CHAVE" : type === "value" ? "Valor" : "Texto",
      ...(["gauge", "chart"].includes(type) ? { min: 0, max: 1 } : {}),
    };
    setProject((current) => ({ ...current, widgets: [...current.widgets, widget] }));
    setSelectedWidget(widget.id); setPropertiesOpen(true);
    setSidebarOpen(false);
  };

  const start = () => {
    const errors = projectErrors(project);
    if (errors.length) { setNotice(errors[0] ?? "Erro de projeto"); return false; }
    if (!running) setRuntime(current => scanProject(project, current, SCAN_MS, Date.now()));
    setRunning(true);
    setNotice("CLP em modo RUN");
    setPropertiesOpen(false); setSidebarOpen(false);
    return true;
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

      <nav className="menubar" aria-label="Menu principal">
        <Button variant="ghost" size="sm" onClick={newProject}>Novo projeto</Button>
        <Button variant="ghost" size="sm" onClick={() => setPane("ladder")}>Programação</Button>
        <Button variant="ghost" size="sm" onClick={() => setPane("hmi")}>IHM</Button>
        <Button variant="ghost" size="sm" onClick={() => setPane("monitor")}>Observação</Button>
        <Button variant="ghost" size="sm" onClick={addRung}>Inserir rede</Button>
      </nav>

      <div className="toolbar" aria-label="Comandos do projeto">
        <Button variant="run" disabled={running} onClick={() => { if (start() && pane === "hmi") setHmiTesting(true); }}><Play size={14} fill="currentColor" /> Executar</Button>
        <Button variant="stop" disabled={!running} onClick={() => { setRunning(false); setHmiTesting(false); setRuntime(current => ({ ...EMPTY_RUNTIME, bits: Object.fromEntries(Object.entries(current.bits).filter(([tag]) => writableTag(tag))) })); setNotice("CLP em modo STOP"); }}><CircleStop size={14} /> Parar</Button>
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
          <div className="pane-caption">Árvore do projeto</div>
          <SidebarSection title={project.name || "Meu projeto"}>
            <div className="tree-node branch"><Box size={14} /><strong>PLC_1 [CPU 1511-1 PN]</strong></div>
            <div className="tree-node depth-1"><ChevronRight size={12} />Configuração do dispositivo</div>
            <div className="tree-node depth-1 branch"><ChevronDown size={12} />Blocos de programa</div>
            <NavItem active={pane === "ladder"} icon={<LayoutDashboard size={14} />} label="Main [OB1]" onClick={() => { setPane("ladder"); setSidebarOpen(false); }} />
            <div className="tree-node depth-1 branch"><ChevronDown size={12} />Tecnologia</div>
            <NavItem active={pane === "hmi"} icon={<LampDesk size={14} />} label="IHM_1" onClick={() => { setPane("hmi"); setSidebarOpen(false); }} />
            <NavItem active={pane === "monitor"} icon={<Activity size={14} />} label="Tabela de observação" onClick={() => { setPane("monitor"); setSidebarOpen(false); }} />
          </SidebarSection>
          <SidebarSection title="Instruções básicas">
            <ToolItem label="Contato normalmente aberto" code="—| |—" active={tool === "contact-no"} onClick={() => setTool("contact-no")} />
            <ToolItem label="Contato normalmente fechado" code="—|/|—" active={tool === "contact-nc"} onClick={() => setTool("contact-nc")} />
            <ToolItem label="Bobina de saída" code="—( )—" active={tool === "coil"} onClick={() => setTool("coil")} />
            <ToolItem label="Bobina SET" code="—(S)—" active={tool === "coil-set"} onClick={() => setTool("coil-set")} />
            <ToolItem label="Bobina RESET" code="—(R)—" active={tool === "coil-reset"} onClick={() => setTool("coil-reset")} />
            <ToolItem label="Temporizador na energização" code="TON" active={tool === "ton"} onClick={() => setTool("ton")} />
            <ToolItem label="Temporizador no desligamento" code="TOF" active={tool === "tof"} onClick={() => setTool("tof")} />
            <ToolItem label="Excluir elemento" code="DEL" active={tool === "delete"} onClick={() => setTool("delete")} danger />
          </SidebarSection>
          <SidebarSection title="Elementos IHM">
            <NavItem icon={<LampDesk size={15} />} label="Lâmpada" onClick={() => { addWidget("lamp"); setPane("hmi"); }} />
            <NavItem icon={<MousePointer2 size={15} />} label="Botão Liga" onClick={() => { addWidget("button-on"); setPane("hmi"); }} />
            <NavItem icon={<MousePointer2 size={15} />} label="Botão Desliga" onClick={() => { addWidget("button-off"); setPane("hmi"); }} />
            <NavItem icon={<MousePointer2 size={15} />} label="Chave alternadora" onClick={() => { addWidget("button-toggle"); setPane("hmi"); }} />
            <NavItem icon={<Tags size={15} />} label="Texto" onClick={() => { addWidget("text"); setPane("hmi"); }} />
            <NavItem icon={<Tags size={15} />} label="Indicador de valor" onClick={() => { addWidget("value"); setPane("hmi"); }} />
            <NavItem icon={<Box size={15} />} label="Motor elétrico" onClick={() => { addWidget("motor"); setPane("hmi"); }} />
            <NavItem icon={<Tags size={15} />} label="Display digital" onClick={() => { addWidget("display"); setPane("hmi"); }} />
            <NavItem icon={<Gauge size={15} />} label="Régua de nível" onClick={() => { addWidget("gauge"); setPane("hmi"); }} />
            <NavItem icon={<Activity size={15} />} label="Gráfico de tendência" onClick={() => { addWidget("chart"); setPane("hmi"); }} />
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
                <Button size="sm" disabled={running} onClick={addRung}><Plus size={13} /> Nova rede</Button>
              </div>
              <div className="rung-list">
                {project.rungs.length === 0 ? <EmptyLadder onAdd={addRung} /> : project.rungs.map((rung, index) => (
                  <RungView key={rung.id} rung={rung} index={index} runtime={runtime} running={running} tool={tool} selectedId={selectedInstruction}
                    onAdd={(position) => addInstruction(rung.id, position)} onTitle={(title) => setProject(current => ({ ...current, rungs: current.rungs.map(r => r.id === rung.id ? { ...r, title } : r) }))} onSelect={(instruction) => {
                      if (!running && tool === "delete") return removeInstruction(rung.id, instruction.id);
                      if (running && (instruction.type === "contact-no" || instruction.type === "contact-nc") && instruction.tag.startsWith("I")) {
                        setBit(instruction.tag, !runtime.bits[instruction.tag]);
                        setNotice(`${instruction.tag} = ${!runtime.bits[instruction.tag] ? "TRUE" : "FALSE"}`);
                      }
                      setSelectedInstruction(instruction.id); if (!running) setPropertiesOpen(true);
                    }}
                    onDelete={() => setProject((current) => ({ ...current, rungs: current.rungs.filter((item) => item.id !== rung.id) }))} />
                ))}
              </div>
            </div>
          )}

          {pane === "hmi" && <div className="hmi-workspace"><div className="workspace-head"><strong>IHM_1 · Conexão PLC_1</strong><div className="flex items-center gap-2"><span className="online-label"><span className={`status-led ${running ? "is-running" : ""}`} />{running ? "Online" : "Offline"}</span><Button size="sm" onClick={() => { if (hmiTesting) { setHmiTesting(false); setNotice("IHM em edição"); } else if (start()) { setHmiTesting(true); setNotice("IHM em teste — conectada ao CLP"); } }}>{hmiTesting ? "Editar tela" : "Testar IHM"}</Button></div></div><HmiCanvas project={project} runtime={runtime} testing={hmiTesting} running={running} selectedId={selectedWidget} setSelectedId={id => { setSelectedWidget(id); if (id) setPropertiesOpen(true); }} setBit={setBit} setProject={setProject} /></div>}
          {pane === "monitor" && <Monitor tags={tags} runtime={runtime} running={running} setBit={setBit} />}
        </section>

        <aside ref={inspector} className={`inspector ${propertiesOpen ? "properties-open" : ""}`}><div className="sidebar-mobile-head"><strong>Propriedades</strong><Button variant="ghost" size="icon" aria-label="Fechar propriedades" onClick={() => setPropertiesOpen(false)}><X size={16} /></Button></div>
          <IoPanel runtime={runtime} running={running} setBit={setBit} />
          <div className="inspector-title"><Box size={14} /> Propriedades</div>
          {pane === "ladder" && selected ? (
            <InstructionInspector instruction={selected} tags={tags} disabled={running} move={(direction) => setProject(current => ({ ...current, rungs: current.rungs.map(r => { const instructions = [...r.instructions]; const index = instructions.findIndex(i => i.id === selected.id); const target = index + direction; if (index < 0 || target < 0 || target >= instructions.length) return r; const a = instructions[index]; const b = instructions[target]; if (!a || !b) return r; instructions[index] = b; instructions[target] = a; return { ...r, instructions }; }) }))} update={updateInstruction} remove={() => {
              setProject((current) => ({ ...current, rungs: current.rungs.map((rung) => ({ ...rung, instructions: rung.instructions.filter((item) => item.id !== selected.id) })) }));
              setSelectedInstruction(null);
            }} />
          ) : pane === "hmi" && selectedHmi ? (
            <WidgetInspector widget={selectedHmi} tags={tags} disabled={hmiTesting} update={(patch) => setProject((current) => ({ ...current, widgets: current.widgets.map((widget) => widget.id === selectedHmi.id ? { ...widget, ...patch } : widget) }))}
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

function IoPanel({ runtime, running, setBit }: { runtime: Runtime; running: boolean; setBit: (tag: string, value: boolean) => void }) {
  const inputs = Array.from({ length: 8 }, (_, index) => `I0.${index}`);
  const outputs = Array.from({ length: 8 }, (_, index) => `Q0.${index}`);
  return <section className="io-panel">
    <div className="io-title"><span>SIMULADOR DE E/S</span><small>24 VDC</small></div>
    <div className="cpu-strip"><div><span className="cpu-led power" />PWR</div><div><span className={`cpu-led ${running ? "run" : ""}`} />{running ? "RUN" : "STOP"}</div><strong>RB-CPU</strong></div>
    <div className="io-bank">
      <header><span>ENTRADAS DIGITAIS</span><code>DI 8x24VDC</code></header>
      <div className="io-grid">{inputs.map((tag, index) => {
        const value = Boolean(runtime.bits[tag]);
        return <button key={tag} className={`io-channel input ${value ? "on" : ""}`} onClick={() => setBit(tag, !value)} aria-label={`Alternar entrada ${tag}`} aria-pressed={value}>
          <span className="terminal">{index}</span><span className="toggle-handle" /><code>{tag}</code>
        </button>;
      })}</div>
    </div>
    <div className="io-bank">
      <header><span>SAÍDAS DIGITAIS</span><code>DQ 8x24VDC</code></header>
      <div className="io-grid">{outputs.map((tag, index) => {
        const value = Boolean(runtime.bits[tag]);
        return <div key={tag} className={`io-channel output ${value ? "on" : ""}`} aria-label={`Saída ${tag}: ${value ? "ligada" : "desligada"}`}>
          <span className="terminal">{index}</span><span className="output-lamp" /><code>{tag}</code>
        </div>;
      })}</div>
    </div>
    <p>Clique nas chaves de entrada para testar a lógica.</p>
  </section>;
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

function RungView({ rung, index, runtime, running, tool, selectedId, onAdd, onTitle, onSelect, onDelete }: {
  rung: Rung; index: number; runtime: Runtime; running: boolean; tool: Tool; selectedId: string | null; onAdd: (position?: number) => void; onTitle: (title: string) => void; onSelect: (instruction: Instruction) => void; onDelete: () => void;
}) {
  return <article className="rung-card">
    <header><span>Rede {index + 1}</span><input aria-label={`Título da rede ${index + 1}`} value={rung.title} disabled={running} onChange={e => onTitle(e.target.value)} /><Button variant="ghost" size="icon" aria-label={`Excluir rede ${index + 1}`} disabled={running} onClick={onDelete}><Trash2 size={13} /></Button></header>
    <div className="rung-canvas">
      <div className={`power-rail ${running ? "energized" : ""}`} />
      <div className="rung-wire-track">
        {rung.instructions.map((instruction, position) => <div key={instruction.id} className="flex items-center"><Button variant="ghost" size="icon" className="insert-before" disabled={running || !tool || tool === "delete"} title="Inserir antes" onClick={() => onAdd(position)}><Plus size={10} /></Button><InstructionView instruction={instruction} energized={Boolean(running && runtime.powered[instruction.id])} selected={selectedId === instruction.id} onClick={() => onSelect(instruction)} /></div>)}
        <Button size="icon" variant="ghost" disabled={running || !tool || tool === "delete"} className={`insert-node ${tool && tool !== "delete" ? "ready" : ""}`} onClick={() => onAdd()} title="Inserir instrução"><Plus size={15} /></Button>
      </div>
      <div className="power-rail right" />
    </div>
  </article>;
}

function InstructionView({ instruction, energized, selected, onClick }: { instruction: Instruction; energized?: boolean; selected: boolean; onClick: () => void }) {
  const timer = instruction.type === "ton" || instruction.type === "tof";
  return <div className={`instruction-wrap ${energized ? "energized" : ""}`}>
    <span className="wire" />
    <button className={`instruction ${selected ? "selected" : ""}`} onClick={onClick} title={instruction.type.startsWith("contact") && instruction.tag.startsWith("I") ? "Em RUN, clique para alternar esta entrada" : "Editar instrução"}>
      <span className="instruction-tag">{instruction.tag}</span>
      {instruction.type === "contact-no" && <strong>—| |—</strong>}
      {instruction.type === "contact-nc" && <strong>—|/|—</strong>}
      {instruction.type === "coil" && <strong>—( )—</strong>}
      {instruction.type === "coil-set" && <strong>—(S)—</strong>}
      {instruction.type === "coil-reset" && <strong>—(R)—</strong>}
      {instruction.parallel?.map((p, index) => <span className="parallel-contact" key={index}><code>{p.tag}</code><strong>{p.normallyClosed ? "—|/|—" : "—| |—"}</strong></span>)}
      {timer && <span className="timer-block"><b>{instruction.type.toUpperCase()}</b><small>PT {instruction.preset} ms</small></span>}
      {instruction.comment && <small className="instruction-comment">{instruction.comment}</small>}
    </button>
  </div>;
}

function InstructionInspector({ instruction, tags, disabled, move, update, remove }: { instruction: Instruction; tags: string[]; disabled: boolean; move: (direction: number) => void; update: (patch: Partial<Instruction>) => void; remove: () => void }) {
  const timer = instruction.type === "ton" || instruction.type === "tof";
  const contact = instruction.type.startsWith("contact");
  const okay = contact ? readableTag(instruction.tag) : timer ? validTag(instruction.tag, true) : /^[QM]\d+\.[0-7]$/.test(instruction.tag);
  return <fieldset className="property-form" disabled={disabled}><div className="property-type">{instructionLabel[instruction.type]}</div><label>Endereço / tag<input list="ladder-tags" value={instruction.tag} onChange={e => update({ tag: normalizeTag(e.target.value) })} /></label><datalist id="ladder-tags">{tags.map(t => <option key={t} value={t} />)}</datalist>{!okay && <p className="field-error">{timer ? "Use T1." : contact ? "Use I0.0, Q0.0, M0.0 ou T1." : "Bobina: use Q0.0 ou M0.0."}</p>}{timer && <label>Tempo programado (ms)<input type="number" min="100" step="100" value={instruction.preset ?? 2000} onChange={e => update({ preset: Math.max(100, Number(e.target.value)) })} /></label>}<label>Comentário<input value={instruction.comment ?? ""} onChange={e => update({ comment: e.target.value })} /></label>
    {contact && <><strong className="text-xs">Ramais paralelos (OU)</strong>{instruction.parallel?.map((p, index) => <div className="parallel-properties" key={index}><input aria-label={`Tag do ramal ${index + 1}`} list="ladder-tags" value={p.tag} onChange={e => update({ parallel: instruction.parallel?.map((item, n) => n === index ? { ...item, tag: normalizeTag(e.target.value) } : item) })} /><select aria-label={`Tipo do ramal ${index + 1}`} value={p.normallyClosed ? "nc" : "no"} onChange={e => update({ parallel: instruction.parallel?.map((item, n) => n === index ? { ...item, normallyClosed: e.target.value === "nc" } : item) })}><option value="no">NA</option><option value="nc">NF</option></select><Button size="icon" variant="ghost" title="Excluir ramal" onClick={() => update({ parallel: instruction.parallel?.filter((_, n) => n !== index) })}><Trash2 size={12} /></Button></div>)}<Button size="sm" onClick={() => update({ parallel: [...(instruction.parallel ?? []), { tag: "Q0.0", normallyClosed: false }] })}><Plus size={12} /> Ramal paralelo</Button></>}
    <div className="flex gap-2"><Button title="Mover para esquerda" onClick={() => move(-1)}>←</Button><Button title="Mover para direita" onClick={() => move(1)}>→</Button></div><Button variant="danger" onClick={remove}><Trash2 size={13} /> Excluir instrução</Button></fieldset>;
}

function Monitor({ tags, runtime, running, setBit }: { tags: string[]; runtime: Runtime; running: boolean; setBit: (tag: string, value: boolean) => void }) {
  return <div className="monitor-pane"><div className="workspace-head"><div><strong>Tabela de observação</strong><span> Valores online do CLP</span></div><span className="online-label"><span className={`status-led ${running ? "is-running" : ""}`} />{running ? "Online" : "Offline"}</span></div><div className="table-scroll"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Valor</th><th>Controle</th></tr></thead><tbody>{tags.length === 0 ? <tr><td colSpan={4} className="empty-row">As tags aparecerão quando forem usadas no programa.</td></tr> : tags.map((tag) => { const timer = runtime.timers[tag]; const value = timer?.done ?? runtime.bits[tag] ?? false; const canControl = /^[IM]/.test(tag); return <tr key={tag}><td><code>{tag}</code></td><td>{tag.startsWith("I") ? "Entrada" : tag.startsWith("Q") ? "Saída" : tag.startsWith("M") ? "Memória" : "Temporizador"}</td><td><span className={`bit-value ${value ? "on" : ""}`}>{value ? "TRUE" : "FALSE"}</span>{timer && <small className="timer-value">{timer.elapsed} / {timer.preset} ms</small>}</td><td>{canControl ? <button className={`switch ${value ? "on" : ""}`} role="switch" aria-checked={value} aria-label={`Alterar ${tag}`} onClick={() => setBit(tag, !value)}><span /></button> : <span className="read-only">Somente leitura</span>}</td></tr>; })}</tbody></table></div></div>;
}

