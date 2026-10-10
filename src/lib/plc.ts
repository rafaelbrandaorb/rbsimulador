import { z } from "zod";

export type InstructionType = "contact-no" | "contact-nc" | "coil" | "coil-set" | "coil-reset" | "ton" | "tof";

export type Instruction = {
  id: string;
  type: InstructionType;
  tag: string;
  preset?: number | undefined;
  comment?: string | undefined;
  parallel?: { tag: string; normallyClosed: boolean }[] | undefined;
};

export type Rung = { id: string; title: string; instructions: Instruction[] };
export type HmiWidgetType = "lamp" | "button-on" | "button-off" | "button-toggle" | "text" | "value" | "motor" | "display" | "gauge" | "chart";
export type HmiWidget = {
  id: string;
  type: HmiWidgetType;
  x: number;
  y: number;
  tag: string;
  label: string;
  action?: "set" | "reset" | "momentary" | "toggle" | undefined;
  display?: "bit" | "elapsed" | "preset" | undefined;
  min?: number | undefined;
  max?: number | undefined;
  unit?: string | undefined;
};

export type TimerValue = { elapsed: number; preset: number; done: boolean; input: boolean; offStartedAt?: number | undefined };
export type Runtime = {
  bits: Record<string, boolean>;
  timers: Record<string, TimerValue>;
  powered: Record<string, boolean>;
};

export type SimulatorProject = {
  name: string;
  rungs: Rung[];
  widgets: HmiWidget[];
};

export const EMPTY_RUNTIME: Runtime = { bits: {}, timers: {}, powered: {} };

export function normalizeTag(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function validTag(tag: string, timer = false) {
  return timer ? /^T\d+$/.test(tag) : /^[IQM]\d+\.[0-7]$/.test(tag);
}

export const readableTag = (tag: string) => validTag(tag) || validTag(tag, true);
export const writableTag = (tag: string) => /^[IM]\d+\.[0-7]$/.test(tag);
export function hmiSize(type: HmiWidgetType) {
  return { width: type === "chart" ? 300 : 180, height: type === "gauge" ? 240 : type === "chart" ? 220 : type === "motor" ? 170 : 140 };
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
  const source = widget.display ?? (widget.tag.startsWith("T") && ["display", "gauge", "chart"].includes(widget.type) ? "elapsed" : "bit");
  return source === "elapsed" ? timer?.elapsed ?? 0 : source === "preset" ? timer?.preset ?? 0 : (timer?.done ?? runtime.bits[widget.tag]) ? 1 : 0;
}
const instructionSchema = z.object({
  id: z.string().min(1), type: z.enum(["contact-no", "contact-nc", "coil", "coil-set", "coil-reset", "ton", "tof"]),
  tag: z.string(), preset: z.number().finite().min(100).optional(), comment: z.string().optional(),
  parallel: z.array(z.object({ tag: z.string(), normallyClosed: z.boolean() })).max(8).optional(),
});
const projectSchema = z.object({
  name: z.string(),
  rungs: z.array(z.object({ id: z.string().min(1), title: z.string(), instructions: z.array(instructionSchema).max(100) })).max(100),
  widgets: z.array(z.object({ id: z.string().min(1), type: z.enum(["lamp", "button-on", "button-off", "button-toggle", "text", "value", "motor", "display", "gauge", "chart"]),
    x: z.number().finite().min(0).max(1000), y: z.number().finite().min(0).max(660), tag: z.string(), label: z.string(),
    action: z.enum(["set", "reset", "momentary", "toggle"]).optional(), display: z.enum(["bit", "elapsed", "preset"]).optional(),
    min: z.number().finite().optional(), max: z.number().finite().optional(), unit: z.string().max(16).optional(),
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
      const okay = contact ? readableTag(i.tag) : i.type.startsWith("coil") ? /^[QM]\d+\.[0-7]$/.test(i.tag) : validTag(i.tag, true);
      if (!okay) errors.push(`Rede ${index + 1}: tag inválida ${i.tag || "vazia"}`);
      if (i.parallel?.some(p => !readableTag(p.tag))) errors.push(`Rede ${index + 1}: tag inválida no ramal`);
    });
  });
  project.widgets.forEach(w => {
    if (w.type !== "text" && !(w.type.startsWith("button") ? writableTag(w.tag) : readableTag(w.tag))) errors.push(`IHM ${w.label}: tag inválida ${w.tag || "vazia"}`);
    if (["gauge", "chart"].includes(w.type) && (w.max ?? 1) <= (w.min ?? 0)) errors.push(`IHM ${w.label}: máximo deve ser maior que mínimo`);
  });
  return errors;
}

export function scanProject(project: SimulatorProject, runtime: Runtime, scanMs: number, now: number): Runtime {
  const activeTags = new Set(collectTags(project, EMPTY_RUNTIME));
  const bits = Object.fromEntries(Object.entries(runtime.bits).filter(([tag]) => !tag.startsWith("Q") || activeTags.has(tag)));
  const timers = Object.fromEntries(Object.entries(runtime.timers).filter(([tag]) => activeTags.has(tag)));
  const powered: Record<string, boolean> = {};

  for (const rung of project.rungs) {
    let power = true;
    for (const instruction of rung.instructions) {
      const read = (tag: string) => Boolean(timers[tag]?.done ?? bits[tag]);
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

      if (instruction.type === "coil") bits[instruction.tag] = power;
      if (instruction.type === "coil-set" && power) bits[instruction.tag] = true;
      if (instruction.type === "coil-reset" && power) bits[instruction.tag] = false;
      powered[instruction.id] = power;
    }
  }

  return { bits, timers, powered };
}

export function collectTags(project: SimulatorProject, runtime: Runtime) {
  const tags = new Set<string>(Object.keys(runtime.bits));
  Object.keys(runtime.timers).forEach((tag) => tags.add(tag));
  project.rungs.forEach((rung) => rung.instructions.forEach((instruction) => { tags.add(instruction.tag); instruction.parallel?.forEach(p => tags.add(p.tag)); }));
  project.widgets.forEach((widget) => widget.tag && tags.add(widget.tag));
  return [...tags].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}