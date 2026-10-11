import { useEffect, useRef, useState } from "react";
import { hmiValue, hmiMotion, formatHmiValue, readBit, type HmiWidget, type Runtime } from "@/lib/plc";

export function HmiInstrument({ widget, runtime, running }: { widget: HmiWidget; runtime: Runtime; running: boolean }) {
  const value = hmiValue(widget, runtime);
  const active = readBit(widget.tag, runtime);
  const min = widget.min ?? 0;
  const max = widget.max ?? 1;
  const fraction = Math.max(0, Math.min(1, (value - min) / Math.max(0.001, max - min)));
  const unit = widget.unit ?? ((widget.display === "elapsed" || widget.display === "preset") && widget.tag.startsWith("T") ? "ms" : "");
  if (widget.type === "motor") return <div className={`hmi-motor ${active ? "active" : ""}`} role="status" aria-label={`${widget.label}: ${active ? "ligado" : "parado"}`}>
    <svg viewBox="0 0 160 100" aria-hidden="true">
      <path className="motor-base" d="M30 78h91v10H30zM42 68h13v14H42zM99 68h13v14H99z" />
      <rect className="motor-shaft" x="120" y="43" width="32" height="14" rx="2" />
      <rect className="motor-body" x="34" y="24" width="94" height="48" rx="8" />
      <rect className="motor-terminal" x="65" y="12" width="32" height="15" rx="2" />
      {[48,60,72,84,96,108].map(x => <path className="motor-fin" key={x} d={`M${x} 29v38`} />)}
      <circle className="motor-fan-cover" cx="32" cy="48" r="26" />
      <g className="motor-rotor"><path d="M32 48c-17-21 13-27 7-8zM32 48c26-6 16 22 2 9zM32 48c-9 25-29 4-9-1z" /><circle cx="32" cy="48" r="5" /></g>
    </svg><b>{widget.label}</b><span className="instrument-status">{active ? "EM OPERAÇÃO" : "PARADO"}</span><code>{widget.tag}</code>
  </div>;
  if (widget.type === "display") return <div className="hmi-digital" role="status" aria-label={`${widget.label}: ${value} ${unit}`}><b>{widget.label}</b><output>{formatHmiValue(value, widget)}<small>{unit}</small></output><code>{widget.tag}</code></div>;
  if (widget.type === "gauge") return <div className="hmi-level" role="meter" aria-label={widget.label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.max(min, Math.min(max, value))}><b>{widget.label}</b><div className="level-body"><svg viewBox="0 0 128 158" aria-hidden="true"><rect className="level-track" x="12" y="8" width="32" height="140" /><rect className="level-fill" x="13" y={148 - 138 * fraction} width="30" height={138 * fraction} />{Array.from({ length: 6 }, (_, i) => <g key={i}><path className="level-tick" d={`M48 ${8 + i * 28}h${i % 2 ? 6 : 10}`} /><text x="64" y={12 + i * 28}>{Number((max - (max - min) * i / 5).toFixed(1))}</text></g>)}</svg></div><output>{value.toLocaleString("pt-BR")} {unit}</output><code>{widget.tag}</code></div>;
  if (widget.type === "conveyor") {
    const vertical = widget.direction === "vertical";
    const offset = hmiMotion(widget, runtime);
    return <div className="hmi-conveyor" role="img" aria-label={`${widget.label}: posição ${value}, ${vertical ? "vertical" : "horizontal"}`}><b>{widget.label}</b><svg viewBox="0 0 460 200" aria-hidden="true">
      <path className="conveyor-leg" d="M50 164v24h32v-24M372 164v24h32v-24" />
      <rect className="conveyor-belt" x="12" y="138" width="432" height="30" rx="15" />
      {Array.from({ length: 14 }, (_, i) => <circle key={i} className="conveyor-roller" cx={28 + i * 30} cy="153" r="9" />)}
      <rect className="conveyor-drive" x="410" y="135" width="36" height="38" rx="3" />
      <g className="conveyor-piece" data-offset={offset} transform={`translate(${vertical ? 205 : 14 + offset},${vertical ? 4 + offset : 104})`}><rect width="30" height="30" rx="2" /><path d="M0 8h30M15 0v8" /></g>
      <path className="conveyor-guide" d={vertical ? "M260 10v116m-5-7 5 7 5-7" : "M25 75h400m-7-5 7 5-7 5"} />
    </svg><footer><code>{widget.tag}</code><output>{formatHmiValue(value, widget)} {unit}</output></footer></div>;
  }
  if (widget.type === "chart") return <Trend widget={widget} value={value} running={running} min={min} max={max} unit={unit} />;
  return null;
}

function Trend({ widget, value, running, min, max, unit }: { widget: HmiWidget; value: number; running: boolean; min: number; max: number; unit: string }) {
  const [samples, setSamples] = useState<number[]>([]);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => { setSamples([]); }, [widget.tag, widget.display]);
  useEffect(() => {
    if (!running) return;
    setSamples([latest.current]);
    const timer = window.setInterval(() => setSamples(previous => [...previous.slice(-59), latest.current]), 500);
    return () => window.clearInterval(timer);
  }, [running]);
  const points = samples.map((sample, i) => `${40 + i * 4},${128 - Math.max(0, Math.min(1, (sample - min) / Math.max(0.001, max - min))) * 100}`).join(" ");
  return <div className="hmi-trend" role="img" aria-label={`${widget.label}: ${value} ${unit}, ${samples.length} amostras`}><header><b>{widget.label}</b><output>{value} {unit}</output></header><svg viewBox="0 0 294 154" aria-hidden="true">{[0,1,2,3,4].map(i => <g key={i}><path className="trend-grid" d={`M40 ${28+i*25}h240`} /><text x="3" y={32+i*25}>{Number((max-(max-min)*i/4).toFixed(1))}</text></g>)}<path className="trend-axis" d="M40 22v106h240" /><polyline className="trend-line" points={points} />{samples.length === 1 && <circle className="trend-point" cx="40" cy={128 - Math.max(0,Math.min(1,(value-min)/Math.max(.001,max-min)))*100} r="3" />}<text x="40" y="146">−30 s</text><text x="248" y="146">agora</text></svg><footer><code>{widget.tag}</code><span>{running ? "● Online" : "STOP"} · 500 ms</span></footer></div>;
}