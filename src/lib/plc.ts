import { z } from "zod";

export type InstructionType = "contact-no" | "contact-nc" | "coil" | "coil-set" | "coil-reset" | "ton" | "tof" | "ctu" | "ctd" | "counter-reset" | "mov";

export type Instruction = {
  id: string;
  type: InstructionType;
  tag: string;
  preset?: number | undefined;
  resetTag?: string | undefined;
  loadTag?: string | undefined;
  source?: string | undefined;
  comment?: string | undefined;
  parallel?: { tag: string; normallyClosed: boolean }[] | undefined;
};

export type Rung = { id: string; title: string; instructions: Instruction[] };
export type HmiWidgetType = "lamp" | "button-on" | "button-off" | "button-toggle" | "text" | "value" | "motor" | "display" | "gauge" | "chart" | "conveyor" | "numeric-input";
export type HmiWidget = {
  id: string;
  type: HmiWidgetType;
  x: number;
  y: number;
  tag: string;
  label: string;
  action?: "set" | "reset" | "momentary" | "toggle" | undefined;
  display?: "bit" | "elapsed" | "preset" | "count" | "number" | undefined;
  min?: number | undefined;
  max?: number | undefined;
  unit?: string | undefined;
  direction?: "horizontal" | "vertical" | undefined;
  travel?: number | undefined;
  decimals?: number | undefined;
  digits?: number | undefined;
};

export type TimerValue = { elapsed: number; preset: number; done: boolean; input: boolean; offStartedAt?: number | undefined };
export type CounterValue = { current: number; preset: number; done: boolean; input: boolean };
export type Runtime = {
  bits: Record<string, boolean>;
  timers: Record<string, TimerValue>;
  counters?: Record<string, CounterValue>;
  words?: Record<string, number>;
  powered: Record<string, boolean>;
};

export type SimulatorProject = {
  name: string;
  rungs: Rung[];
  widgets: HmiWidget[];
};

export const EMPTY_RUNTIME: Runtime = { bits: {}, timers: {}, counters: {}, words: {}, powered: {} };

export function normalizeTag(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function validTag(tag: string, timer = false) {
  return timer ? /^T\d+$/.test(tag) : /^[IQM]\d+\.[0-7]$/.test(tag);
}

export const counterTag = (tag: string) => /^C\d+$/.test(tag);
export const wordTag = (tag: string) => /^MW\d+$/.test(tag);
export const readableTag = (tag: string) => validTag(tag) || validTag(tag, true) || counterTag(tag);
export const numericTag = (tag: string) => readableTag(tag) || wordTag(tag);
export const writableTag = (tag: string) => /^[IM]\d+\.[0-7]$/.test(tag);
export const readBit = (tag: string, runtime: Runtime) => runtime.counters?.[tag]?.done ?? runtime.timers[tag]?.done ?? runtime.bits[tag] ?? false;
export function hmiSize(type: HmiWidgetType) {
  return { width: type === "conveyor" ? 460 : type === "chart" ? 300 : 180, height: type === "conveyor" ? 260 : type === "gauge" ? 240 : type === "chart" ? 220 : type === "motor" ? 170 : 140 };
}
export function nextHmiPosition(widgets: HmiWidget[], type: HmiWidgetType) {
  const size = hmiSize(type);
  for (let y = 64; y <= 720 - size.height; y += 32) {
    for (let x = 40; x <= 1100 - size.width; x += 32) {
      const occupied = widgets.some(widget => {
        const other = hmiSize(widget.type);
        const left = Math.min(widget.x, 1100 - other.width);
        const top = Math.min(widget.y, 720 - other.height);
        return x < left + other.width + 16 && x + size.width + 16 > left && y < top + other.height + 16 && y + size.height + 16 > top;
      });
      if (!occupied) return { x, y };
    }
  }
  return null;
}
export function hmiValue(widget: HmiWidget, runtime: Runtime): number {
  const timer = runtime.timers[widget.tag];
  const counter = runtime.counters?.[widget.tag];
  const source = widget.display ?? (wordTag(widget.tag) ? "number" : widget.tag.startsWith("C") ? "count" : widget.tag.startsWith("T") && ["display", "gauge", "chart", "conveyor"].includes(widget.type) ? "elapsed" : "bit");
  return source === "number" ? runtime.words?.[widget.tag] ?? 0 : source === "count" ? counter?.current ?? 0 : source === "elapsed" ? timer?.elapsed ?? 0 : source === "preset" ? counter?.preset ?? timer?.preset ?? 0 : readBit(widget.tag, runtime) ? 1 : 0;
}
export function hmiMotion(widget: HmiWidget, runtime: Runtime) {
  const min = widget.min ?? 0;
  const max = widget.max ?? 400;
  const fraction = Math.max(0, Math.min(1, (hmiValue(widget, runtime) - min) / Math.max(0.001, max - min)));
  return fraction * Math.max(0, Math.min(widget.direction === "vertical" ? 130 : 400, widget.travel ?? 400));
}
export function formatHmiValue(value: number, widget: HmiWidget) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: widget.decimals ?? 0, maximumFractionDigits: widget.decimals ?? 0, minimumIntegerDigits: widget.digits ?? 1, useGrouping: (widget.digits ?? 1) === 1 });
}
const instructionSchema = z.object({
  id: z.string().min(1), type: z.enum(["contact-no", "contact-nc", "coil", "coil-set", "coil-reset", "ton", "tof", "ctu", "ctd", "counter-reset", "mov"]),
  tag: z.string(), preset: z.number().finite().min(1).optional(), comment: z.string().optional(),
  resetTag: z.string().optional(), loadTag: z.string().optional(), source: z.string().optional(),
  parallel: z.array(z.object({ tag: z.string(), normallyClosed: z.boolean() })).max(8).optional(),
});
const projectSchema = z.object({
  name: z.string(),
  rungs: z.array(z.object({ id: z.string().min(1), title: z.string(), instructions: z.array(instructionSchema).max(100) })).max(100),
  widgets: z.array(z.object({ id: z.string().min(1), type: z.enum(["lamp", "button-on", "button-off", "button-toggle", "text", "value", "motor", "display", "gauge", "chart", "conveyor", "numeric-input"]),
    x: z.number().finite().min(0).max(1000), y: z.number().finite().min(0).max(660), tag: z.string(), label: z.string(),
    action: z.enum(["set", "reset", "momentary", "toggle"]).optional(), display: z.enum(["bit", "elapsed", "preset", "count", "number"]).optional(),
    min: z.number().finite().optional(), max: z.number().finite().optional(), unit: z.string().max(16).optional(),
    direction: z.enum(["horizontal", "vertical"]).optional(), travel: z.number().finite().min(0).max(400).optional(),
    decimals: z.number().int().min(0).max(3).optional(), digits: z.number().int().min(1).max(8).optional(),
  })).max(100),
});
export function parseProject(data: unknown): SimulatorProject {
  const project = projectSchema.parse(data);
  const ids = [...project.rungs.map(r => r.id), ...project.rungs.flatMap(r => r.instructions.map(i => i.id)), ...project.widgets.map(w => w.id)];
  if (new Set(ids).size !== ids.length) throw new Error("Identificadores duplicados");
  return project;
}
export function projectErrors(project: SimulatorProject): string[] {
  const errors: string[] = [];
  project.rungs.forEach((rung, index) => {
    rung.instructions.forEach(i => {
      const contact = i.type.startsWith("contact");
      const counter = ["ctu", "ctd", "counter-reset"].includes(i.type);
      const okay = i.type === "mov" ? wordTag(i.tag) : contact ? readableTag(i.tag) : counter ? counterTag(i.tag) : i.type.startsWith("coil") ? /^[QM]\d+\.[0-7]$/.test(i.tag) : validTag(i.tag, true);
      if (!okay) errors.push(`Rede ${index + 1}: tag inválida ${i.tag || "vazia"}`);
      if (counter && i.type !== "counter-reset" && (!Number.isSafeInteger(i.preset ?? 10) || (i.preset ?? 10) < 1 || (i.preset ?? 10) > 999999)) errors.push(`Rede ${index + 1}: contagem programada deve ser inteira entre 1 e 999999`);
      if ((i.type === "ton" || i.type === "tof") && (i.preset ?? 2000) < 100) errors.push(`Rede ${index + 1}: tempo mínimo de 100 ms`);
      if (i.type === "mov" && !(numericTag(i.source ?? "") || ((i.source ?? "").trim() !== "" && Number.isFinite(Number(i.source))))) errors.push(`Rede ${index + 1}: origem MOV inválida`);
      if ([i.resetTag, i.loadTag].some(tag => tag && !readableTag(tag))) errors.push(`Rede ${index + 1}: tag de reset/carga inválida`);
      if (i.parallel?.some(p => !readableTag(p.tag))) errors.push(`Rede ${index + 1}: tag inválida no ramal`);
    });
  });
  project.widgets.forEach(w => {
    if (w.type !== "text" && !(w.type === "numeric-input" ? wordTag(w.tag) : w.type.startsWith("button") ? writableTag(w.tag) : ["lamp", "motor"].includes(w.type) ? readableTag(w.tag) : numericTag(w.tag))) errors.push(`IHM ${w.label}: tag inválida ${w.tag || "vazia"}`);
    if (["gauge", "chart", "conveyor"].includes(w.type) && (w.max ?? (w.type === "conveyor" ? 400 : 1)) <= (w.min ?? 0)) errors.push(`IHM ${w.label}: máximo deve ser maior que mínimo`);
  });
  return errors;
}

export function scanProject(project: SimulatorProject, runtime: Runtime, scanMs: number, now: number): Runtime {
  const activeTags = new Set(collectTags(project, EMPTY_RUNTIME));
  const bits = Object.fromEntries(Object.entries(runtime.bits).filter(([tag]) => !tag.startsWith("Q") || activeTags.has(tag)));
  const timers = Object.fromEntries(Object.entries(runtime.timers).filter(([tag]) => activeTags.has(tag)));
  const counters: Record<string, CounterValue> = Object.fromEntries(Object.entries(runtime.counters ?? {}).filter(([tag]) => activeTags.has(tag)));
  const words = { ...runtime.words };
  const powered: Record<string, boolean> = {};

  for (const rung of project.rungs) {
    let power = true;
    for (const instruction of rung.instructions) {
      const read = (tag: string) => Boolean(counters[tag]?.done ?? timers[tag]?.done ?? bits[tag]);
      if (instruction.type.startsWith("contact")) {
        const closed = instruction.type === "contact-nc" ? !read(instruction.tag) : read(instruction.tag);
        power = power && (closed || Boolean(instruction.parallel?.some(p => p.normallyClosed ? !read(p.tag) : read(p.tag))));
      }

      if (instruction.type === "ton") {
        const previous = timers[instruction.tag] ?? { elapsed: 0, preset: instruction.preset ?? 2000, done: false, input: false };
        const elapsed = power ? Math.min(previous.input ? previous.elapsed + scanMs : scanMs, instruction.preset ?? 2000) : 0;
        timers[instruction.tag] = {
          elapsed,
          preset: instruction.preset ?? 2000,
          done: power && elapsed >= (instruction.preset ?? 2000),
          input: power,
        };
        power = timers[instruction.tag]?.done ?? false;
      }

      if (instruction.type === "tof") {
        const previous = timers[instruction.tag] ?? { elapsed: 0, preset: instruction.preset ?? 2000, done: false, input: false };
        const offStartedAt = power ? undefined : previous.input ? now : previous.offStartedAt ?? now;
        const elapsed = power || offStartedAt === undefined ? 0 : Math.min(now - offStartedAt, instruction.preset ?? 2000);
        timers[instruction.tag] = {
          elapsed,
          preset: instruction.preset ?? 2000,
          done: power || (previous.done && elapsed < (instruction.preset ?? 2000)),
          input: power,
          offStartedAt,
        };
        power = timers[instruction.tag]?.done ?? false;
      }

      if (instruction.type === "ctu" || instruction.type === "ctd") {
        const preset = Math.max(1, Math.min(999999, Math.floor(instruction.preset ?? 10)));
        const previous: CounterValue = counters[instruction.tag] ?? { current: 0, preset, done: false, input: false };
        const reset = Boolean(instruction.resetTag && read(instruction.resetTag));
        const load = instruction.type === "ctd" && Boolean(instruction.loadTag && read(instruction.loadTag));
        const rising: boolean = power && !previous.input;
        const current: number = reset ? 0 : load ? preset : rising ? Math.max(0, Math.min(999999, previous.current + (instruction.type === "ctu" ? 1 : -1))) : previous.current;
        const done: boolean = instruction.type === "ctu" ? current >= preset : current <= 0;
        counters[instruction.tag] = { current, preset, done, input: power };
        power = done;
      }
      if (instruction.type === "counter-reset" && power) {
        const previous = counters[instruction.tag];
        const down = project.rungs.some(r => r.instructions.some(i => i.type === "ctd" && i.tag === instruction.tag));
        counters[instruction.tag] = { current: 0, preset: previous?.preset ?? 10, done: down, input: previous?.input ?? false };
      }
      if (instruction.type === "mov" && power) {
        const source = instruction.source ?? "0";
        const value = numericTag(source) ? hmiValue({ id: "mov", type: "display", x: 0, y: 0, tag: source, label: "" }, { bits, timers, counters, words, powered }) : Number(source);
        if (wordTag(instruction.tag) && Number.isFinite(value)) words[instruction.tag] = Math.max(-999999, Math.min(999999, value));
      }
      if (instruction.type === "coil") bits[instruction.tag] = power;
      if (instruction.type === "coil-set" && power) bits[instruction.tag] = true;
      if (instruction.type === "coil-reset" && power) bits[instruction.tag] = false;
      powered[instruction.id] = power;
    }
  }

  return { bits, timers, counters, words, powered };
}

export function collectTags(project: SimulatorProject, runtime: Runtime) {
  const tags = new Set<string>(Object.keys(runtime.bits));
  Object.keys(runtime.timers).forEach((tag) => tags.add(tag));
  Object.keys(runtime.counters ?? {}).forEach((tag) => tags.add(tag));
  Object.keys(runtime.words ?? {}).forEach((tag) => tags.add(tag));
  project.rungs.forEach((rung) => rung.instructions.forEach((instruction) => { tags.add(instruction.tag); if (instruction.source && numericTag(instruction.source)) tags.add(instruction.source); if (instruction.resetTag) tags.add(instruction.resetTag); if (instruction.loadTag) tags.add(instruction.loadTag); instruction.parallel?.forEach(p => tags.add(p.tag)); }));
  project.widgets.forEach((widget) => widget.tag && tags.add(widget.tag));
  return [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}