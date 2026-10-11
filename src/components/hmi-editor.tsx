import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { hmiSize, hmiValue, formatHmiValue, numericTag, wordTag, readBit, readableTag, writableTag, type HmiWidget, type Runtime, type SimulatorProject } from "@/lib/plc";
import { HmiInstrument } from "@/components/hmi-instruments";

type UpdateProject = React.Dispatch<React.SetStateAction<SimulatorProject>>;

export function HmiCanvas({ project, runtime, testing, running, selectedId, setSelectedId, setBit, setNumber, setProject }: {
  project: SimulatorProject; runtime: Runtime; testing: boolean; running: boolean; selectedId: string | null;
  setSelectedId: (id: string | null) => void; setBit: (tag: string, value: boolean) => void; setNumber: (tag: string, value: number) => void; setProject: UpdateProject;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; clientX: number; clientY: number } | null>(null);
  const action = (widget: HmiWidget) => widget.action ?? (widget.type === "button-off" ? "reset" : widget.type === "button-toggle" ? "toggle" : "set");
  return <div className="hmi-scroll"><div ref={surface} className={`hmi-pane ${testing ? "testing" : ""}`} onClick={() => { if (!testing) setSelectedId(null); }}>
    <div className="hmi-screen-caption">IHM_1 · RB Comfort · 1100 × 720</div>
    {project.widgets.map(widget => {
      const value = readBit(widget.tag, runtime);
      const display = hmiValue(widget, runtime);
      const { width: wide, height: tall } = hmiSize(widget.type);
      return <div key={widget.id} data-widget-id={widget.id} style={{ left: Math.min(widget.x, 1100 - wide), top: Math.min(widget.y, 720 - tall) }} className={`hmi-widget ${widget.type === "conveyor" ? "conveyor-widget" : widget.type === "chart" ? "wide-instrument" : ""} ${!testing && selectedId === widget.id ? "selected" : ""}`}
        onClick={event => { event.stopPropagation(); if (!testing) setSelectedId(widget.id); }}
        onPointerDown={event => {
          if (testing) return;
          event.stopPropagation(); setSelectedId(widget.id);
          drag.current = { id: widget.id, x: widget.x, y: widget.y, clientX: event.clientX, clientY: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const origin = drag.current;
          if (!origin || origin.id !== widget.id) return;
          setProject(current => ({ ...current, widgets: current.widgets.map(w => w.id === widget.id ? { ...w, x: Math.max(8, Math.min(1100 - wide, Math.round((origin.x + event.clientX - origin.clientX) / 8) * 8)), y: Math.max(32, Math.min(720 - tall, Math.round((origin.y + event.clientY - origin.clientY) / 8) * 8)) } : w) }));
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {widget.type === "lamp" && <div className="hmi-lamp-wrap" role="status" aria-label={`${widget.label}: ${value ? "ligada" : "desligada"}`}><span className={`hmi-lamp ${value ? "on" : ""}`} /><b>{widget.label}</b><small>{widget.tag}</small></div>}
        {widget.type.startsWith("button") && <Button className={`hmi-button ${action(widget) === "reset" ? "off" : "on"}`} aria-pressed={value}
          onPointerDown={event => {
            if (!testing) return;
            event.stopPropagation();
            if (action(widget) === "momentary" && writableTag(widget.tag)) { event.currentTarget.setPointerCapture(event.pointerId); setBit(widget.tag, true); }
          }}
          onPointerUp={() => { if (testing && action(widget) === "momentary") setBit(widget.tag, false); }}
          onPointerCancel={() => { if (action(widget) === "momentary") setBit(widget.tag, false); }}
          onLostPointerCapture={() => { if (action(widget) === "momentary") setBit(widget.tag, false); }}
          onKeyDown={event => { if (testing && action(widget) === "momentary" && (event.key === " " || event.key === "Enter")) { event.preventDefault(); setBit(widget.tag, true); } }}
          onKeyUp={event => { if (action(widget) === "momentary" && (event.key === " " || event.key === "Enter")) setBit(widget.tag, false); }}
          onBlur={() => { if (action(widget) === "momentary") setBit(widget.tag, false); }}
          onClick={event => {
            event.stopPropagation();
            if (!testing) { setSelectedId(widget.id); return; }
            if (!writableTag(widget.tag) || action(widget) === "momentary") return;
            setBit(widget.tag, action(widget) === "toggle" ? !value : action(widget) === "set");
          }}>{widget.label}</Button>}
        {widget.type === "value" && <div className="hmi-value"><small>{widget.label}</small><strong>{formatHmiValue(display, widget)}</strong><code>{widget.tag}{(widget.display === "elapsed" || widget.display === "preset") && widget.tag.startsWith("T") ? " ms" : ""}</code></div>}
        {widget.type === "text" && <strong>{widget.label}</strong>}
        {widget.type === "numeric-input" && <label className="hmi-number"><b>{widget.label}</b><input aria-label={widget.label} type="number" min="-999999" max="999999" step="1" value={runtime.words?.[widget.tag] ?? 0} readOnly={!testing} onPointerDown={e => { if (testing) e.stopPropagation(); }} onChange={e => { if (testing) setNumber(widget.tag, Number(e.target.value)); }} /><code>{widget.tag}</code></label>}
        {["motor", "display", "gauge", "chart", "conveyor"].includes(widget.type) && <HmiInstrument widget={widget} runtime={runtime} running={running} />}
      </div>;
    })}
  </div></div>;
}

export function WidgetInspector({ widget, tags, update, remove, disabled }: { widget: HmiWidget; tags: string[]; update: (patch: Partial<HmiWidget>) => void; remove: () => void; disabled: boolean }) {
  const button = widget.type.startsWith("button");
  const valid = widget.type === "text" || (widget.type === "numeric-input" ? wordTag(widget.tag) : button ? writableTag(widget.tag) : ["lamp", "motor"].includes(widget.type) ? readableTag(widget.tag) : numericTag(widget.tag));
  return <fieldset className="property-form" disabled={disabled}>
    <div className="property-type">Objeto IHM · {widget.type}</div>
    <label>Rótulo<input value={widget.label} onChange={e => update({ label: e.target.value })} /></label>
    {widget.type !== "text" && <><label>Tag vinculada<input list="hmi-tags" value={widget.tag} onChange={e => update({ tag: e.target.value.toUpperCase().replace(/\s/g, "") })} /></label>
      <datalist id="hmi-tags">{tags.filter(t => widget.type === "numeric-input" ? wordTag(t) : button ? writableTag(t) : numericTag(t)).map(t => <option key={t} value={t} />)}</datalist>
      {!valid && <p className="field-error">{widget.type === "numeric-input" ? "Use MW10, MW20…" : button ? "Comando: use I0.0 ou M0.0 (bits 0–7)." : "Use I0.0, Q0.0, M0.0, T1, C1 ou MW10."}</p>}
    </>}
    {button && <label>Evento de operação<select value={widget.action ?? (widget.type === "button-off" ? "reset" : widget.type === "button-toggle" ? "toggle" : "set")} onChange={e => update({ action: e.target.value as HmiWidget["action"] })}><option value="set">Ligar bit</option><option value="reset">Desligar bit</option><option value="momentary">Pressionar / soltar</option><option value="toggle">Alternar bit</option></select></label>}
    {["value", "display", "gauge", "chart", "conveyor"].includes(widget.type) && <><label>Valor exibido<select value={widget.display ?? (wordTag(widget.tag) ? "number" : widget.tag.startsWith("C") ? "count" : widget.tag.startsWith("T") && widget.type !== "value" ? "elapsed" : "bit")} onChange={e => update({ display: e.target.value as HmiWidget["display"] })}><option value="bit">Estado (0 / 1)</option><option value="number">Valor numérico (MW)</option><option value="count">Contagem atual (CV)</option><option value="elapsed">Tempo decorrido (ms)</option><option value="preset">Valor programado (PV / PT)</option></select></label><label>Unidade<input maxLength={16} value={widget.unit ?? ""} onChange={e => update({ unit: e.target.value })} /></label></>}
    {["gauge", "chart", "conveyor"].includes(widget.type) && <><div className="coordinate-row"><label>Mínimo<input type="number" value={widget.min ?? 0} onChange={e => update({ min: Number(e.target.value) })} /></label><label>Máximo<input type="number" value={widget.max ?? (widget.type === "conveyor" ? 400 : 1)} onChange={e => update({ max: Number(e.target.value) })} /></label></div>{(widget.max ?? (widget.type === "conveyor" ? 400 : 1)) <= (widget.min ?? 0) && <p className="field-error">Máximo deve ser maior que mínimo.</p>}</>}
    {widget.type === "conveyor" && <><label>Direção<select value={widget.direction ?? "horizontal"} onChange={e => update({ direction: e.target.value as HmiWidget["direction"], travel: e.target.value === "vertical" ? 130 : 400 })}><option value="horizontal">Horizontal (X)</option><option value="vertical">Vertical (Y)</option></select></label><label>Deslocamento (px)<input type="number" min="0" max={widget.direction === "vertical" ? 130 : 400} value={widget.travel ?? 400} onChange={e => update({ travel: Math.max(0, Math.min(widget.direction === "vertical" ? 130 : 400, Number(e.target.value))) })} /></label></>}
    {["display", "value"].includes(widget.type) && <div className="coordinate-row"><label>Casas decimais<input type="number" min="0" max="3" value={widget.decimals ?? 0} onChange={e => update({ decimals: Math.max(0, Math.min(3, Math.floor(Number(e.target.value)))) })} /></label><label>Dígitos mínimos<input type="number" min="1" max="8" value={widget.digits ?? 1} onChange={e => update({ digits: Math.max(1, Math.min(8, Math.floor(Number(e.target.value)))) })} /></label></div>}
    <div className="coordinate-row"><label>X<input type="number" min="8" max="1000" value={widget.x} onChange={e => update({ x: Math.max(8, Math.min(1000, Number(e.target.value))) })} /></label><label>Y<input type="number" min="32" max="640" value={widget.y} onChange={e => update({ y: Math.max(32, Math.min(640, Number(e.target.value))) })} /></label></div>
    <Button variant="danger" onClick={remove}><Trash2 size={13} /> Excluir objeto</Button>
  </fieldset>;
}